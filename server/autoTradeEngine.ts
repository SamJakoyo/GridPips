import { db } from './db.ts';
import { runIctMarketAnalysis, type IctAnalysisResult } from './ictEngine.ts';
import { getTradingViewLiveQuotes } from './tradingViewFeed.ts';
import {
  executeMt5TradeOrder,
  fetchMt5AccountState,
  isMt5ApiConfigured,
} from './mt5Api.ts';
import { insertCloudMt5Command, syncUserStateToCloud } from './cloudSync.ts';

const WATCHED_SYMBOLS = ['EURUSD', 'GBPUSD', 'XAUUSD', 'NAS100', 'BTCUSD'] as const;
const MAX_CONCURRENT_POSITIONS = 3;

export interface AutoScanCandidate {
  symbol: string;
  timeframe: '15M' | '1H';
  strategy: string;
  side: 'BUY' | 'SELL';
  entryPrice: number;
  stopLoss: number;
  tp1: number;
  rrRatio: number;
  volume: number;
  confluences: string[];
  status: 'executed' | 'skipped' | 'signal_ready' | 'failed';
  reason: string;
  orderId?: string;
}

export interface AutoTradeRunResult {
  scannedAt: string;
  metaApiConfigured: boolean;
  usersChecked: number;
  executedCount: number;
  candidates: AutoScanCandidate[];
}

function getNyHour(): number {
  const hourStr = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/New_York',
    hour: '2-digit',
    hour12: false,
  }).format(new Date());
  return Number(hourStr) % 24;
}

function isInActiveKillzone(symbol: string): boolean {
  if (symbol === 'BTCUSD' || symbol === 'ETHUSD') return true;
  const h = getNyHour();
  // London Open (02-05 NY), NY AM + Silver Bullet (07-11 NY), NY PM / London Close (13-16 NY)
  return (h >= 2 && h < 5) || (h >= 7 && h < 11) || (h >= 13 && h < 16);
}

function computeRiskLotSize(params: {
  symbol: string;
  equity: number;
  riskPercent: number;
  entryPrice: number;
  stopLoss: number;
}): number {
  const { symbol, equity, riskPercent, entryPrice, stopLoss } = params;
  const riskDollars = Math.max(5, equity * (riskPercent / 100));
  const slDist = Math.abs(entryPrice - stopLoss);
  if (slDist <= 0) return 0.01;

  // Approximate $/unit/lot risk per price delta across major asset classes
  const sym = symbol.toUpperCase();
  let contractValuePerPriceUnit = 100000; // FX standard lot
  if (sym.includes('JPY')) {
    contractValuePerPriceUnit = 100000 / Math.max(80, entryPrice);
  } else if (sym === 'XAUUSD') {
    contractValuePerPriceUnit = 100; // 100 oz per 1.00 lot
  } else if (sym === 'NAS100' || sym === 'US30' || sym === 'SPX500') {
    contractValuePerPriceUnit = 1; // 1 index contract per 1.00 lot
  } else if (sym === 'BTCUSD' || sym === 'ETHUSD') {
    contractValuePerPriceUnit = 1; // 1 coin per 1.00 lot
  }

  const lossPerLot = slDist * contractValuePerPriceUnit;
  if (!Number.isFinite(lossPerLot) || lossPerLot <= 0) return 0.01;
  const rawLots = riskDollars / lossPerLot;
  return Number(Math.min(2.0, Math.max(0.01, rawLots)).toFixed(2));
}

function matchesStrategyFilter(
  analysis: IctAnalysisResult,
  activeBot: string,
  timeframe: '15M' | '1H'
): { matches: boolean; strategyLabel: string } {
  const isLong = analysis.setup.direction.startsWith('Long');
  const unmitigatedZones = analysis.zones.filter((z) => !z.mitigated);

  const hasFvg = unmitigatedZones.some((z) =>
    isLong ? z.type === 'Bullish FVG' : z.type === 'Bearish FVG'
  );
  const hasOb = unmitigatedZones.some((z) =>
    isLong ? z.type === 'Bullish OB' : z.type === 'Bearish OB'
  );

  if (activeBot === 'silverbullet') {
    return {
      matches: timeframe === '15M' && hasFvg && analysis.setup.rrRatio >= 1.8,
      strategyLabel: 'ICT Silver Bullet EA',
    };
  }
  if (activeBot === 'orderblock') {
    return {
      matches: timeframe === '1H' && hasOb && analysis.setup.rrRatio >= 2.0,
      strategyLabel: 'SMC Order Block EA',
    };
  }

  // 'both'
  if (timeframe === '15M' && hasFvg && analysis.setup.rrRatio >= 1.8) {
    return { matches: true, strategyLabel: 'ICT Silver Bullet EA' };
  }
  if (timeframe === '1H' && hasOb && analysis.setup.rrRatio >= 2.0) {
    return { matches: true, strategyLabel: 'SMC Order Block EA' };
  }
  return { matches: false, strategyLabel: 'No matching zone' };
}

export async function runCloudAutoTradePass(options?: {
  userId?: number;
  dryRun?: boolean;
  bypassKillzone?: boolean;
}): Promise<AutoTradeRunResult> {
  const scannedAt = new Date().toISOString();
  const metaApiConfigured = isMt5ApiConfigured();
  const candidates: AutoScanCandidate[] = [];

  const users = (
    options?.userId
      ? db.prepare('SELECT * FROM users WHERE id = ?').all(options.userId)
      : db
          .prepare(
            `SELECT * FROM users
             WHERE mt5_connected = 1
               AND mt5_auto_trade = 1
               AND mt5_metaapi_account_id IS NOT NULL
               AND mt5_metaapi_account_id != ''
               AND (has_ea_bots = 1 OR role = 'admin')`
          )
          .all()
  ) as Array<{
    id: number;
    email: string;
    has_ea_bots: number;
    role: string;
    mt5_connected: number;
    mt5_auto_trade: number;
    mt5_metaapi_account_id: string | null;
    mt5_metaapi_region: string | null;
    mt5_active_bot: string | null;
    mt5_risk_percent: number | null;
    mt5_balance: number | null;
    mt5_equity: number | null;
    mt5_open_positions: number | null;
  }>;

  if (users.length === 0) {
    return {
      scannedAt,
      metaApiConfigured,
      usersChecked: 0,
      executedCount: 0,
      candidates: [],
    };
  }

  const liveQuotes = await getTradingViewLiveQuotes().catch(() => []);
  const quoteMap = new Map(liveQuotes.map((q) => [q.symbol, q]));

  // Pre-compute ICT analyses once per pass across symbols/timeframes
  const analysesCache = new Map<string, IctAnalysisResult>();
  const timeframesToScan: Array<'15M' | '1H'> = ['15M', '1H'];

  for (const sym of WATCHED_SYMBOLS) {
    const q = quoteMap.get(sym);
    if (q && q.isMarketOpen === false) {
      candidates.push({
        symbol: sym,
        timeframe: '15M',
        strategy: 'Market Session Guard',
        side: 'BUY',
        entryPrice: q.price,
        stopLoss: 0,
        tp1: 0,
        rrRatio: 0,
        volume: 0,
        confluences: [],
        status: 'skipped',
        reason: `TradingView reports ${sym} session ${q.marketStatusLabel || 'Closed'}.`,
      });
      continue;
    }

    for (const tf of timeframesToScan) {
      try {
        const res = await runIctMarketAnalysis(sym, tf, 'UCtjxa77NqamhVC8atV85Rog');
        analysesCache.set(`${sym}:${tf}`, res);
      } catch {
        // skip symbol if feed temporarily unreachable
      }
    }
  }

  let executedCount = 0;

  for (const user of users) {
    const activeBot = (user.mt5_active_bot || 'both').toLowerCase();
    const riskPercent = Math.min(5, Math.max(0.1, Number(user.mt5_risk_percent ?? 1.0)));

    let equity = Number(user.mt5_equity ?? user.mt5_balance ?? 1000);
    let openPositions = Number(user.mt5_open_positions ?? 0);

    if (metaApiConfigured && user.mt5_metaapi_account_id) {
      const liveState = await fetchMt5AccountState({
        accountId: user.mt5_metaapi_account_id,
        region: user.mt5_metaapi_region,
      }).catch(() => null);
      if (liveState) {
        if (typeof liveState.equity === 'number') equity = liveState.equity;
        openPositions = liveState.openPositions;
        db.prepare(
          `UPDATE users SET
            mt5_balance = COALESCE(?, mt5_balance),
            mt5_equity = COALESCE(?, mt5_equity),
            mt5_open_positions = ?,
            mt5_last_sync = datetime('now')
           WHERE id = ?`
        ).run(liveState.balance, liveState.equity, liveState.openPositions, user.id);
      }
    }

    for (const sym of WATCHED_SYMBOLS) {
      const q = quoteMap.get(sym);
      if (q && q.isMarketOpen === false) continue;

      for (const tf of timeframesToScan) {
        if (activeBot === 'silverbullet' && tf !== '15M') continue;
        if (activeBot === 'orderblock' && tf !== '1H') continue;

        const analysis = analysesCache.get(`${sym}:${tf}`);
        if (!analysis) continue;

        const { matches, strategyLabel } = matchesStrategyFilter(analysis, activeBot, tf);
        const side: 'BUY' | 'SELL' = analysis.setup.direction.startsWith('Long') ? 'BUY' : 'SELL';
        const volume = computeRiskLotSize({
          symbol: sym,
          equity,
          riskPercent,
          entryPrice: analysis.currentPrice,
          stopLoss: analysis.setup.stopLoss,
        });

        if (!matches) {
          candidates.push({
            symbol: sym,
            timeframe: tf,
            strategy: strategyLabel,
            side,
            entryPrice: analysis.currentPrice,
            stopLoss: analysis.setup.stopLoss,
            tp1: analysis.setup.tp1,
            rrRatio: analysis.setup.rrRatio,
            volume,
            confluences: analysis.setup.confluences,
            status: 'skipped',
            reason: `Awaiting clean unmitigated ${tf === '15M' ? 'FVG' : 'Order Block'} + R:R confluence.`,
          });
          continue;
        }

        if (!options?.bypassKillzone && !isInActiveKillzone(sym)) {
          candidates.push({
            symbol: sym,
            timeframe: tf,
            strategy: strategyLabel,
            side,
            entryPrice: analysis.currentPrice,
            stopLoss: analysis.setup.stopLoss,
            tp1: analysis.setup.tp1,
            rrRatio: analysis.setup.rrRatio,
            volume,
            confluences: analysis.setup.confluences,
            status: 'signal_ready',
            reason: 'Outside London/New York ICT Killzone window — standing by.',
          });
          continue;
        }

        if (openPositions >= MAX_CONCURRENT_POSITIONS) {
          candidates.push({
            symbol: sym,
            timeframe: tf,
            strategy: strategyLabel,
            side,
            entryPrice: analysis.currentPrice,
            stopLoss: analysis.setup.stopLoss,
            tp1: analysis.setup.tp1,
            rrRatio: analysis.setup.rrRatio,
            volume,
            confluences: analysis.setup.confluences,
            status: 'skipped',
            reason: `Drawdown guard: max ${MAX_CONCURRENT_POSITIONS} open MT5 positions reached.`,
          });
          continue;
        }

        // Prevent duplicate automated entries on the same symbol within 60 minutes
        const recentCmd = db
          .prepare(
            `SELECT id FROM mt5_trade_commands
             WHERE user_id = ? AND symbol = ? AND status = 'executed'
               AND created_at >= datetime('now', '-60 minutes')
             LIMIT 1`
          )
          .get(user.id, sym) as { id: number } | undefined;

        if (recentCmd) {
          candidates.push({
            symbol: sym,
            timeframe: tf,
            strategy: strategyLabel,
            side,
            entryPrice: analysis.currentPrice,
            stopLoss: analysis.setup.stopLoss,
            tp1: analysis.setup.tp1,
            rrRatio: analysis.setup.rrRatio,
            volume,
            confluences: analysis.setup.confluences,
            status: 'skipped',
            reason: `Cooldown active: ${sym} already traded in the last 60 minutes.`,
          });
          continue;
        }

        if (options?.dryRun || !metaApiConfigured || !user.mt5_connected || !user.mt5_metaapi_account_id) {
          candidates.push({
            symbol: sym,
            timeframe: tf,
            strategy: strategyLabel,
            side,
            entryPrice: analysis.currentPrice,
            stopLoss: analysis.setup.stopLoss,
            tp1: analysis.setup.tp1,
            rrRatio: analysis.setup.rrRatio,
            volume,
            confluences: analysis.setup.confluences,
            status: 'signal_ready',
            reason: !metaApiConfigured
              ? 'Setup qualified — awaiting server METAAPI_TOKEN to auto-execute.'
              : !user.mt5_connected
              ? 'Setup qualified — connect client MT5 account to auto-execute.'
              : 'Dry-run scan: qualified setup ready for MetaApi execution.',
          });
          continue;
        }

        try {
          const execRes = await executeMt5TradeOrder({
            accountId: user.mt5_metaapi_account_id,
            region: user.mt5_metaapi_region,
            symbol: sym,
            side,
            volume,
            stopLoss: analysis.setup.stopLoss,
            takeProfit: analysis.setup.tp1,
            comment: `${strategyLabel} (${tf})`,
          });

          const cmdInfo = db
            .prepare(
              `INSERT INTO mt5_trade_commands (
                user_id, symbol, side, volume, stop_loss, take_profit,
                source_ea, execution_mode, status, external_order_id, executed_at
              ) VALUES (?, ?, ?, ?, ?, ?, ?, 'metaapi_auto', 'executed', ?, datetime('now'))`
            )
            .run(user.id, sym, side, volume, analysis.setup.stopLoss, analysis.setup.tp1, strategyLabel, execRes.orderId);

          openPositions += 1;
          executedCount += 1;

          db.prepare("UPDATE users SET mt5_open_positions = ?, mt5_last_sync = datetime('now') WHERE id = ?").run(
            openPositions,
            user.id
          );
          db.prepare(
            'INSERT INTO mt5_telemetry_events (user_id, ea_name, symbol, status, balance, equity, open_positions) VALUES (?, ?, ?, ?, ?, ?, ?)'
          ).run(user.id, strategyLabel, sym, `AUTO_${side}_METAAPI`, user.mt5_balance ?? equity, equity, openPositions);

          void insertCloudMt5Command(user.email, Number(cmdInfo.lastInsertRowid));
          void syncUserStateToCloud(user.id);

          candidates.push({
            symbol: sym,
            timeframe: tf,
            strategy: strategyLabel,
            side,
            entryPrice: analysis.currentPrice,
            stopLoss: analysis.setup.stopLoss,
            tp1: analysis.setup.tp1,
            rrRatio: analysis.setup.rrRatio,
            volume,
            confluences: analysis.setup.confluences,
            status: 'executed',
            reason: `Auto-executed ${side} ${volume} lots via MetaApi Cloud (Order #${execRes.orderId}).`,
            orderId: execRes.orderId,
          });
        } catch (err) {
          const msg = err instanceof Error ? err.message : 'MetaApi Cloud execution failed.';
          const failInfo = db
            .prepare(
              `INSERT INTO mt5_trade_commands (
                user_id, symbol, side, volume, stop_loss, take_profit,
                source_ea, execution_mode, status, error_message
              ) VALUES (?, ?, ?, ?, ?, ?, ?, 'metaapi_auto', 'failed', ?)`
            )
            .run(user.id, sym, side, volume, analysis.setup.stopLoss, analysis.setup.tp1, strategyLabel, msg);
          void insertCloudMt5Command(user.email, Number(failInfo.lastInsertRowid));

          candidates.push({
            symbol: sym,
            timeframe: tf,
            strategy: strategyLabel,
            side,
            entryPrice: analysis.currentPrice,
            stopLoss: analysis.setup.stopLoss,
            tp1: analysis.setup.tp1,
            rrRatio: analysis.setup.rrRatio,
            volume,
            confluences: analysis.setup.confluences,
            status: 'failed',
            reason: msg,
          });
        }
      }
    }
  }

  return {
    scannedAt,
    metaApiConfigured,
    usersChecked: users.length,
    executedCount,
    candidates,
  };
}
