import type { JournalTrade } from '../types';

export const STANDARD_MISTAKE_TAGS = [
  'FOMO Entry',
  'Early Exit',
  'Moved Stop Loss',
  'Over-Risked',
  'Revenge Trade',
  'Chased Candle',
  'Counter-HTF Bias',
  'Traded Red News',
  'No Liquidity Sweep',
  'Hesitated / Missed CE',
] as const;

export const STANDARD_CONFLUENCE_TAGS = [
  'HTF Bias Aligned',
  'Liquidity Sweep (BSL/SSL)',
  'MSS + Displacement',
  'FVG / Order Block CE',
  'Discount / Premium Zone',
  'Killzone Session Window',
  'Minimum 1:2 R:R',
  'Clean Economic Calendar',
] as const;

export const STANDARD_EMOTION_STATES = [
  'Calm & Disciplined',
  'Confident',
  'Anxious',
  'FOMO',
  'Overconfident',
  'Frustrated',
  'Revenge / Tilt',
] as const;

export const DEFAULT_PLAYBOOK_NAMES = [
  'ICT Silver Bullet FVG',
  'DRT 50% Equilibrium Flip',
  'London Sweep & OB Continuation',
  'NY Judas Swing Reversal',
  'HTF Breaker + OTE Pullback',
] as const;

export function parseJsonStringArray(raw?: string | null): string[] {
  if (!raw) return [];
  if (Array.isArray(raw)) return raw.map(String).filter(Boolean);
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.map(String).filter(Boolean) : [];
  } catch {
    return [];
  }
}

export function getTradePlaybook(t: JournalTrade): string {
  return (t.playbook || t.strategy || 'Unspecified').trim() || 'Unspecified';
}

export function getTradeMistakes(t: JournalTrade): string[] {
  return parseJsonStringArray(t.mistakes_json);
}

export function getTradeConfluences(t: JournalTrade): string[] {
  return parseJsonStringArray(t.confluences_json);
}

export function getTradeNetPnl(t: JournalTrade): number {
  return Number(t.pnl || 0) - Number(t.fees || 0);
}

export function getTradeRMultiple(t: JournalTrade): number | null {
  if (typeof t.r_multiple === 'number' && Number.isFinite(t.r_multiple)) return t.r_multiple;
  if (typeof t.rr === 'number' && Number.isFinite(t.rr) && t.rr > 0) {
    const pnl = Number(t.pnl || 0);
    if (pnl > 0) return t.rr;
    if (pnl < 0) return -1;
    return 0;
  }
  return null;
}

export interface TradeFilterCriteria {
  startDate: string;
  endDate: string;
  search: string;
  playbook: string;
  side: 'All' | 'Buy' | 'Sell';
  outcome: 'All' | 'Win' | 'Loss' | 'Breakeven';
  account: string;
  mistake: string;
}

export function filterJournalTrades(trades: JournalTrade[], filters: TradeFilterCriteria): JournalTrade[] {
  const q = filters.search.trim().toLowerCase();
  return trades.filter((t) => {
    const d = (t.trade_date || '').slice(0, 10);
    if (filters.startDate && d && d < filters.startDate) return false;
    if (filters.endDate && d && d > filters.endDate) return false;
    if (filters.side !== 'All' && t.side !== filters.side) return false;
    const net = Number(t.pnl || 0);
    if (filters.outcome === 'Win' && net <= 0) return false;
    if (filters.outcome === 'Loss' && net >= 0) return false;
    if (filters.outcome === 'Breakeven' && net !== 0) return false;
    if (filters.playbook !== 'All' && getTradePlaybook(t) !== filters.playbook) return false;
    if (filters.account !== 'All' && (t.account_label || 'Live Account') !== filters.account) return false;
    if (filters.mistake !== 'All') {
      const m = getTradeMistakes(t);
      if (filters.mistake === 'Any Mistake' && m.length === 0) return false;
      if (filters.mistake === 'Clean (No Mistakes)' && m.length > 0) return false;
      if (filters.mistake !== 'Any Mistake' && filters.mistake !== 'Clean (No Mistakes)' && !m.includes(filters.mistake)) {
        return false;
      }
    }
    if (q) {
      const hay = [
        t.instrument,
        t.strategy,
        t.playbook,
        t.session,
        t.reason_entry,
        t.reason_exit,
        t.lessons,
        t.emotions,
        t.account_label,
        ...getTradeMistakes(t),
      ]
        .filter(Boolean)
        .join(' ')
        .toLowerCase();
      if (!hay.includes(q)) return false;
    }
    return true;
  });
}

export interface DaySummary {
  date: string;
  pnl: number;
  trades: JournalTrade[];
  wins: number;
  losses: number;
  breakeven: number;
  winRate: number;
}

export interface BreakdownRow {
  label: string;
  trades: number;
  wins: number;
  losses: number;
  winRate: number;
  netPnl: number;
  profitFactor: number | null;
  expectancy: number;
  avgR: number | null;
  avgAdherence: number;
}

export interface GridScoreBreakdown {
  overall: number;
  winRateScore: number;
  profitFactorScore: number;
  avgWinLossScore: number;
  drawdownScore: number;
  consistencyScore: number;
}

export interface ComputedTradeAnalytics {
  totalTrades: number;
  wins: number;
  losses: number;
  breakeven: number;
  winRate: number;
  dayWinRate: number;
  winningDays: number;
  losingDays: number;
  tradingDays: number;
  netPnl: number;
  grossProfit: number;
  grossLoss: number;
  totalFees: number;
  profitFactor: number | null;
  avgWin: number;
  avgLoss: number;
  avgWinLossRatio: number | null;
  expectancyUsd: number;
  avgRMultiple: number | null;
  maxDrawdownUsd: number;
  maxDrawdownPct: number;
  recoveryFactor: number | null;
  maxWinStreak: number;
  maxLossStreak: number;
  currentStreak: { type: 'win' | 'loss' | 'flat'; count: number };
  avgAdherencePct: number;
  avgRating: number;
  avgMfe: number | null;
  avgMae: number | null;
  equityCurve: Array<{ index: number; date: string; tradePnl: number; equity: number; drawdown: number; instrument: string }>;
  dailyMap: Record<string, DaySummary>;
  dailySeries: DaySummary[];
  gridScore: GridScoreBreakdown;
  byPlaybook: BreakdownRow[];
  bySession: BreakdownRow[];
  byInstrument: BreakdownRow[];
  byGrade: BreakdownRow[];
  bySide: BreakdownRow[];
  byEmotion: BreakdownRow[];
  byDayOfWeek: BreakdownRow[];
  byHourBucket: BreakdownRow[];
  mistakeCosts: Array<{
    tag: string;
    count: number;
    netPnl: number;
    avgImpact: number;
    winRate: number;
    lossAmount: number;
  }>;
}

function buildBreakdown(groups: Map<string, JournalTrade[]>): BreakdownRow[] {
  const rows: BreakdownRow[] = [];
  for (const [label, list] of groups.entries()) {
    const winsList = list.filter((t) => Number(t.pnl) > 0);
    const lossesList = list.filter((t) => Number(t.pnl) < 0);
    const grossWin = winsList.reduce((a, t) => a + Number(t.pnl), 0);
    const grossLoss = Math.abs(lossesList.reduce((a, t) => a + Number(t.pnl), 0));
    const netPnl = list.reduce((a, t) => a + Number(t.pnl || 0), 0);
    const rVals = list.map(getTradeRMultiple).filter((r): r is number => r !== null);
    const adhVals = list.map((t) => (typeof t.rule_adherence_pct === 'number' ? t.rule_adherence_pct : 100));
    rows.push({
      label,
      trades: list.length,
      wins: winsList.length,
      losses: lossesList.length,
      winRate: list.length ? (winsList.length / list.length) * 100 : 0,
      netPnl,
      profitFactor: grossLoss > 0 ? grossWin / grossLoss : grossWin > 0 ? 99 : null,
      expectancy: list.length ? netPnl / list.length : 0,
      avgR: rVals.length ? rVals.reduce((a, b) => a + b, 0) / rVals.length : null,
      avgAdherence: adhVals.length ? adhVals.reduce((a, b) => a + b, 0) / adhVals.length : 100,
    });
  }
  return rows.sort((a, b) => b.netPnl - a.netPnl);
}

const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

export function computeTradeAnalytics(trades: JournalTrade[]): ComputedTradeAnalytics {
  // Sort chronologically for equity curve & streaks
  const chrono = [...trades].sort((a, b) => {
    const da = `${a.trade_date || ''} ${a.entry_time || '00:00'}`;
    const db = `${b.trade_date || ''} ${b.entry_time || '00:00'}`;
    if (da !== db) return da.localeCompare(db);
    return a.id - b.id;
  });

  const winsList = chrono.filter((t) => Number(t.pnl) > 0);
  const lossesList = chrono.filter((t) => Number(t.pnl) < 0);
  const breakevenList = chrono.filter((t) => Number(t.pnl) === 0);

  const grossProfit = winsList.reduce((a, t) => a + Number(t.pnl), 0);
  const grossLoss = Math.abs(lossesList.reduce((a, t) => a + Number(t.pnl), 0));
  const totalFees = chrono.reduce((a, t) => a + Number(t.fees || 0), 0);
  const netPnl = chrono.reduce((a, t) => a + Number(t.pnl || 0), 0);
  const profitFactor = grossLoss > 0 ? grossProfit / grossLoss : grossProfit > 0 ? 99 : null;
  const winRate = chrono.length ? (winsList.length / chrono.length) * 100 : 0;
  const avgWin = winsList.length ? grossProfit / winsList.length : 0;
  const avgLoss = lossesList.length ? grossLoss / lossesList.length : 0;
  const avgWinLossRatio = avgLoss > 0 ? avgWin / avgLoss : avgWin > 0 ? 99 : null;
  const expectancyUsd = chrono.length ? netPnl / chrono.length : 0;

  const rVals = chrono.map(getTradeRMultiple).filter((r): r is number => r !== null);
  const avgRMultiple = rVals.length ? rVals.reduce((a, b) => a + b, 0) / rVals.length : null;

  const mfeVals = chrono.map((t) => t.mfe).filter((v): v is number => typeof v === 'number' && Number.isFinite(v));
  const maeVals = chrono.map((t) => t.mae).filter((v): v is number => typeof v === 'number' && Number.isFinite(v));
  const avgMfe = mfeVals.length ? mfeVals.reduce((a, b) => a + b, 0) / mfeVals.length : null;
  const avgMae = maeVals.length ? maeVals.reduce((a, b) => a + b, 0) / maeVals.length : null;

  const adhVals = chrono.map((t) => (typeof t.rule_adherence_pct === 'number' ? t.rule_adherence_pct : 100));
  const avgAdherencePct = adhVals.length ? adhVals.reduce((a, b) => a + b, 0) / adhVals.length : 100;

  const ratingVals = chrono.map((t) => (typeof t.rating === 'number' ? t.rating : 4));
  const avgRating = ratingVals.length ? ratingVals.reduce((a, b) => a + b, 0) / ratingVals.length : 0;

  // Equity curve + Drawdown + Streaks
  let running = 0;
  let peak = 0;
  let maxDrawdownUsd = 0;
  let maxWinStreak = 0;
  let maxLossStreak = 0;
  let curW = 0;
  let curL = 0;

  const equityCurve = chrono.map((t, idx) => {
    const p = Number(t.pnl || 0);
    running += p;
    if (running > peak) peak = running;
    const dd = peak - running;
    if (dd > maxDrawdownUsd) maxDrawdownUsd = dd;

    if (p > 0) {
      curW += 1;
      curL = 0;
      if (curW > maxWinStreak) maxWinStreak = curW;
    } else if (p < 0) {
      curL += 1;
      curW = 0;
      if (curL > maxLossStreak) maxLossStreak = curL;
    } else {
      curW = 0;
      curL = 0;
    }

    return {
      index: idx + 1,
      date: t.trade_date || '',
      tradePnl: p,
      equity: running,
      drawdown: -dd,
      instrument: t.instrument,
    };
  });

  const currentStreak: { type: 'win' | 'loss' | 'flat'; count: number } =
    curW > 0 ? { type: 'win', count: curW } : curL > 0 ? { type: 'loss', count: curL } : { type: 'flat', count: 0 };

  const baselineCapital = Math.max(peak, grossProfit, 1000);
  const maxDrawdownPct = baselineCapital > 0 ? (maxDrawdownUsd / baselineCapital) * 100 : 0;
  const recoveryFactor = maxDrawdownUsd > 0 ? netPnl / maxDrawdownUsd : netPnl > 0 ? 10 : null;

  // Daily aggregation
  const dailyMap: Record<string, DaySummary> = {};
  for (const t of chrono) {
    const d = (t.trade_date || '').slice(0, 10) || 'Unknown';
    if (!dailyMap[d]) {
      dailyMap[d] = { date: d, pnl: 0, trades: [], wins: 0, losses: 0, breakeven: 0, winRate: 0 };
    }
    const p = Number(t.pnl || 0);
    dailyMap[d].pnl += p;
    dailyMap[d].trades.push(t);
    if (p > 0) dailyMap[d].wins += 1;
    else if (p < 0) dailyMap[d].losses += 1;
    else dailyMap[d].breakeven += 1;
  }
  const dailySeries = Object.values(dailyMap)
    .map((d) => ({
      ...d,
      winRate: d.trades.length ? (d.wins / d.trades.length) * 100 : 0,
    }))
    .sort((a, b) => a.date.localeCompare(b.date));

  const winningDays = dailySeries.filter((d) => d.pnl > 0).length;
  const losingDays = dailySeries.filter((d) => d.pnl < 0).length;
  const tradingDays = dailySeries.length;
  const dayWinRate = tradingDays ? (winningDays / tradingDays) * 100 : 0;

  // Breakdowns
  const playbookMap = new Map<string, JournalTrade[]>();
  const sessionMap = new Map<string, JournalTrade[]>();
  const instMap = new Map<string, JournalTrade[]>();
  const gradeMap = new Map<string, JournalTrade[]>();
  const sideMap = new Map<string, JournalTrade[]>();
  const emotionMap = new Map<string, JournalTrade[]>();
  const dowMap = new Map<string, JournalTrade[]>();
  const hourMap = new Map<string, JournalTrade[]>();
  const mistakeMap = new Map<string, JournalTrade[]>();

  const pushMap = (map: Map<string, JournalTrade[]>, key: string, t: JournalTrade) => {
    const arr = map.get(key) || [];
    arr.push(t);
    map.set(key, arr);
  };

  for (const t of chrono) {
    pushMap(playbookMap, getTradePlaybook(t), t);
    pushMap(sessionMap, t.session || 'Unspecified', t);
    pushMap(instMap, t.instrument || 'Unspecified', t);
    pushMap(gradeMap, t.setup_grade || 'A', t);
    pushMap(sideMap, t.side === 'Sell' ? 'Short (Sell)' : 'Long (Buy)', t);
    pushMap(emotionMap, t.emotions || 'Calm & Disciplined', t);

    if (t.trade_date) {
      const parsed = new Date(`${t.trade_date.slice(0, 10)}T12:00:00Z`);
      if (!Number.isNaN(parsed.getTime())) {
        pushMap(dowMap, WEEKDAYS[parsed.getUTCDay()], t);
      }
    }

    if (t.entry_time && /^\d{1,2}:\d{2}/.test(t.entry_time)) {
      const hh = Number(t.entry_time.split(':')[0]);
      const bucket =
        hh < 6
          ? '00:00–05:59 (Asian)'
          : hh < 11
          ? '06:00–10:59 (London / NY Pre)'
          : hh < 15
          ? '11:00–14:59 (NY Killzone)'
          : '15:00–23:59 (PM Session)';
      pushMap(hourMap, bucket, t);
    }

    for (const tag of getTradeMistakes(t)) {
      pushMap(mistakeMap, tag, t);
    }
  }

  const mistakeCosts = Array.from(mistakeMap.entries())
    .map(([tag, list]) => {
      const mNet = list.reduce((a, t) => a + Number(t.pnl || 0), 0);
      const mWins = list.filter((t) => Number(t.pnl) > 0).length;
      const lossAmount = list.filter((t) => Number(t.pnl) < 0).reduce((a, t) => a + Math.abs(Number(t.pnl)), 0);
      return {
        tag,
        count: list.length,
        netPnl: mNet,
        avgImpact: list.length ? mNet / list.length : 0,
        winRate: list.length ? (mWins / list.length) * 100 : 0,
        lossAmount,
      };
    })
    .sort((a, b) => a.netPnl - b.netPnl);

  // GridScore (TradeZella-inspired 5-pillar score, strictly derived from logged trade math)
  const clamp100 = (n: number) => Math.max(0, Math.min(100, Math.round(n)));
  const winRateScore = chrono.length ? clamp100((winRate / 65) * 100) : 0;
  const pfVal = profitFactor === null ? 0 : Math.min(profitFactor, 3.0);
  const profitFactorScore = chrono.length ? clamp100((pfVal / 2.6) * 100) : 0;
  const wlVal = avgWinLossRatio === null ? 0 : Math.min(avgWinLossRatio, 3.0);
  const avgWinLossScore = chrono.length ? clamp100((wlVal / 2.4) * 100) : 0;
  const drawdownScore = chrono.length ? clamp100(100 - Math.min(100, maxDrawdownPct * 2.5)) : 0;
  const consistencyScore = chrono.length ? clamp100(avgAdherencePct * 0.65 + dayWinRate * 0.35) : 0;
  const overall = chrono.length
    ? clamp100(
        winRateScore * 0.2 +
          profitFactorScore * 0.25 +
          avgWinLossScore * 0.2 +
          drawdownScore * 0.15 +
          consistencyScore * 0.2
      )
    : 0;

  return {
    totalTrades: chrono.length,
    wins: winsList.length,
    losses: lossesList.length,
    breakeven: breakevenList.length,
    winRate,
    dayWinRate,
    winningDays,
    losingDays,
    tradingDays,
    netPnl,
    grossProfit,
    grossLoss,
    totalFees,
    profitFactor,
    avgWin,
    avgLoss,
    avgWinLossRatio,
    expectancyUsd,
    avgRMultiple,
    maxDrawdownUsd,
    maxDrawdownPct,
    recoveryFactor,
    maxWinStreak,
    maxLossStreak,
    currentStreak,
    avgAdherencePct,
    avgRating,
    avgMfe,
    avgMae,
    equityCurve,
    dailyMap,
    dailySeries,
    gridScore: {
      overall,
      winRateScore,
      profitFactorScore,
      avgWinLossScore,
      drawdownScore,
      consistencyScore,
    },
    byPlaybook: buildBreakdown(playbookMap),
    bySession: buildBreakdown(sessionMap),
    byInstrument: buildBreakdown(instMap),
    byGrade: buildBreakdown(gradeMap),
    bySide: buildBreakdown(sideMap),
    byEmotion: buildBreakdown(emotionMap),
    byDayOfWeek: buildBreakdown(dowMap),
    byHourBucket: buildBreakdown(hourMap),
    mistakeCosts,
  };
}

export function exportTradesToCsv(trades: JournalTrade[]): string {
  const headers = [
    'Date',
    'Entry Time',
    'Instrument',
    'Side',
    'Account',
    'Playbook',
    'Grade',
    'Session',
    'Entry',
    'Exit',
    'SL',
    'TP',
    'Size',
    'R-Multiple',
    'Fees',
    'Net P&L',
    'Rule Adherence %',
    'Emotion',
    'Mistakes',
    'Entry Rationale',
    'Lessons',
  ];
  const esc = (v: unknown) => {
    const s = String(v ?? '').replace(/"/g, '""');
    return /[",\n]/.test(s) ? `"${s}"` : s;
  };
  const lines = [headers.join(',')];
  for (const t of trades) {
    lines.push(
      [
        t.trade_date,
        t.entry_time || '',
        t.instrument,
        t.side,
        t.account_label || 'Live Account',
        getTradePlaybook(t),
        t.setup_grade || 'A',
        t.session || '',
        t.entry_price ?? '',
        t.exit_price ?? '',
        t.sl ?? '',
        t.tp ?? '',
        t.size ?? '',
        getTradeRMultiple(t) ?? '',
        t.fees ?? 0,
        t.pnl,
        t.rule_adherence_pct ?? 100,
        t.emotions || '',
        getTradeMistakes(t).join('; '),
        t.reason_entry || '',
        t.lessons || '',
      ]
        .map(esc)
        .join(',')
    );
  }
  return lines.join('\n');
}

export function parseCsvToTrades(csvText: string): Array<Record<string, unknown>> {
  const lines = csvText
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);
  if (lines.length < 2) return [];
  const splitLine = (line: string): string[] => {
    const out: string[] = [];
    let cur = '';
    let inQuotes = false;
    for (let i = 0; i < line.length; i++) {
      const ch = line[i];
      if (ch === '"') {
        if (inQuotes && line[i + 1] === '"') {
          cur += '"';
          i += 1;
        } else {
          inQuotes = !inQuotes;
        }
      } else if (ch === ',' && !inQuotes) {
        out.push(cur.trim());
        cur = '';
      } else {
        cur += ch;
      }
    }
    out.push(cur.trim());
    return out;
  };

  const headers = splitLine(lines[0]).map((h) => h.toLowerCase().replace(/[^a-z0-9]/g, ''));
  const col = (...names: string[]) => headers.findIndex((h) => names.some((n) => h.includes(n)));
  const idxInst = col('instrument', 'symbol', 'pair', 'ticker');
  const idxSide = col('side', 'type', 'direction');
  const idxPnl = col('netpnl', 'pnl', 'profit', 'pl');
  const idxDate = col('date', 'time', 'closed');
  const idxEntry = col('entry', 'openprice');
  const idxExit = col('exit', 'closeprice');
  const idxSize = col('size', 'lots', 'volume', 'qty');
  const idxPlaybook = col('playbook', 'strategy', 'setup');
  const idxSession = col('session');

  const parsed: Array<Record<string, unknown>> = [];
  for (let i = 1; i < lines.length; i++) {
    const cells = splitLine(lines[i]);
    const instrument = (idxInst >= 0 ? cells[idxInst] : cells[0] || '').toUpperCase().replace(/[^A-Z0-9./-]/g, '');
    const rawPnl = idxPnl >= 0 ? cells[idxPnl] : cells[3] || '';
    const pnl = Number(String(rawPnl).replace(/[$,\s]/g, ''));
    if (!instrument || !Number.isFinite(pnl)) continue;

    const rawSide = (idxSide >= 0 ? cells[idxSide] : 'Buy').toLowerCase();
    const side = rawSide.includes('sell') || rawSide.includes('short') ? 'Sell' : 'Buy';
    const rawDate = idxDate >= 0 ? cells[idxDate] : new Date().toISOString().slice(0, 10);
    const dateMatch = rawDate.match(/\d{4}-\d{2}-\d{2}/);
    const tradeDate = dateMatch ? dateMatch[0] : new Date().toISOString().slice(0, 10);

    parsed.push({
      instrument,
      side,
      pnl,
      tradeDate,
      entryPrice: idxEntry >= 0 && cells[idxEntry] ? Number(cells[idxEntry]) : null,
      exitPrice: idxExit >= 0 && cells[idxExit] ? Number(cells[idxExit]) : null,
      size: idxSize >= 0 && cells[idxSize] ? Number(cells[idxSize]) : null,
      playbook: idxPlaybook >= 0 && cells[idxPlaybook] ? cells[idxPlaybook] : 'Imported Execution',
      strategy: idxPlaybook >= 0 && cells[idxPlaybook] ? cells[idxPlaybook] : 'Imported Execution',
      session: idxSession >= 0 && cells[idxSession] ? cells[idxSession] : 'New York',
      accountLabel: 'Imported Broker',
    });
  }
  return parsed;
}
