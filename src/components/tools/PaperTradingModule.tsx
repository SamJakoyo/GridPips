import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ArrowDownRight,
  ArrowUpRight,
  BookCheck,
  Check,
  ChevronDown,
  ChevronUp,
  Edit3,
  RotateCcw,
  Shield,
  SlidersHorizontal,
  X,
} from 'lucide-react';
import { apiFetch, type MarketSymbolQuote } from '../../lib/api';
import { DEFAULT_PLAYBOOK_NAMES } from '../../lib/tradeMetrics';
import type { PaperHistoryItem, PaperPendingOrder, PaperPosition, TradingPlanData } from '../../types';
import { LiveTradingViewChart } from '../LiveTradingViewChart';

interface PropConfig {
  profitTargetPct: number;
  dailyLossLimitPct: number;
  maxDrawdownLimitPct: number;
}

interface PaperAccountResponse {
  balance: number;
  positions: PaperPosition[];
  history: PaperHistoryItem[];
  pendingOrders?: PaperPendingOrder[];
  startingBalance?: number;
  propConfig?: PropConfig;
}

const BALANCE_PRESETS = [10000, 25000, 50000, 100000];
const CHART_TIMEFRAMES = ['5m', '15m', '1H', '4H'] as const;

function priceDecimals(sym: string): number {
  const s = sym.toUpperCase();
  if (s.includes('JPY')) return 3;
  if (s.includes('XAU') || s.includes('BTC') || s.includes('ETH') || s.includes('NAS') || s.includes('US30') || s.includes('SPX')) {
    return 2;
  }
  return 5;
}

function fmtPrice(sym: string, val?: number | null): string {
  if (val == null || !Number.isFinite(val)) return '—';
  return val.toFixed(priceDecimals(sym));
}

function fmtMoney(v: number): string {
  const abs = Math.abs(v).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  if (v > 0) return `+$${abs}`;
  if (v < 0) return `-$${abs}`;
  return `$${abs}`;
}

function contractMultiplier(sym: string): number {
  const s = sym.toUpperCase();
  if (s.includes('XAU')) return 100;
  if (s.includes('BTC') || s.includes('ETH') || s.includes('SOL')) return 1;
  if (s.includes('NAS') || s.includes('US30') || s.includes('SPX')) return 1;
  if (s.includes('JPY')) return 1000;
  return 100000;
}

function computeUnrealizedPnl(pos: PaperPosition, currentPrice: number): number {
  const diff = pos.side === 'Buy' ? currentPrice - pos.entry : pos.entry - currentPrice;
  const mult = contractMultiplier(pos.symbol);
  // If user entered standard lots (<= 50), scale by contract multiplier; otherwise treat as raw units
  const effectiveUnits = pos.size <= 50 ? pos.size * mult : pos.size;
  return diff * effectiveUnits;
}

export const PaperTradingView: React.FC<{
  quotes: MarketSymbolQuote[];
  onJournalRefresh?: () => Promise<void>;
}> = ({ quotes, onJournalRefresh }) => {
  const [loading, setLoading] = useState(true);
  const [balance, setBalance] = useState(10000);
  const [startingBalance, setStartingBalance] = useState(10000);
  const [propConfig, setPropConfig] = useState<PropConfig>({
    profitTargetPct: 8,
    dailyLossLimitPct: 5,
    maxDrawdownLimitPct: 10,
  });
  const [positions, setPositions] = useState<PaperPosition[]>([]);
  const [pendingOrders, setPendingOrders] = useState<PaperPendingOrder[]>([]);
  const [history, setHistory] = useState<PaperHistoryItem[]>([]);
  const [playbooks, setPlaybooks] = useState<string[]>([...DEFAULT_PLAYBOOK_NAMES]);

  // Chart & Ticket State
  const [symbol, setSymbol] = useState('EURUSD');
  const [chartTf, setChartTf] = useState<(typeof CHART_TIMEFRAMES)[number]>('15m');
  const [showChart, setShowChart] = useState(true);
  const [orderMode, setOrderMode] = useState<'Market' | 'Limit' | 'Stop'>('Market');
  const [side, setSide] = useState<'Buy' | 'Sell'>('Buy');
  const [sizingMode, setSizingMode] = useState<'lots' | 'risk'>('risk');
  const [lotsInput, setLotsInput] = useState('0.50');
  const [riskPctInput, setRiskPctInput] = useState('1.0');
  const [triggerPriceInput, setTriggerPriceInput] = useState('');
  const [slInput, setSlInput] = useState('');
  const [tpInput, setTpInput] = useState('');
  const [playbook, setPlaybook] = useState<string>(DEFAULT_PLAYBOOK_NAMES[0]);
  const [noteInput, setNoteInput] = useState('');

  // Tabs & Inline Edit
  const [bookTab, setBookTab] = useState<'positions' | 'pending' | 'history'>('positions');
  const [editingPosId, setEditingPosId] = useState<string | null>(null);
  const [editSl, setEditSl] = useState('');
  const [editTp, setEditTp] = useState('');
  const [syncingId, setSyncingId] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const quoteMap = useMemo(() => {
    const map = new Map<string, MarketSymbolQuote>();
    quotes.forEach((q) => map.set(q.sym.toUpperCase(), q));
    return map;
  }, [quotes]);

  const symbolList = useMemo(() => {
    const list = quotes.map((q) => q.sym.toUpperCase());
    return list.length ? list : ['EURUSD', 'GBPUSD', 'USDJPY', 'XAUUSD', 'NAS100', 'BTCUSD'];
  }, [quotes]);

  const activeQuote = quoteMap.get(symbol.toUpperCase()) || quotes[0];
  const liveBid = activeQuote?.bid ?? activeQuote?.price ?? 1.085;
  const liveAsk = activeQuote?.ask ?? activeQuote?.price ?? 1.0852;
  const executionPrice =
    orderMode === 'Market'
      ? side === 'Buy'
        ? liveAsk
        : liveBid
      : Number(triggerPriceInput) || (side === 'Buy' ? liveAsk : liveBid);

  // Load saved paper account & playbooks
  useEffect(() => {
    let active = true;
    Promise.all([
      apiFetch<PaperAccountResponse>('/api/workspace/paper'),
      apiFetch<{ plan: TradingPlanData | null }>('/api/workspace/plan').catch(() => ({ plan: null })),
    ])
      .then(([paper, planRes]) => {
        if (!active) return;
        setBalance(Number(paper.balance ?? 10000));
        setStartingBalance(Number(paper.startingBalance ?? 10000));
        if (paper.propConfig) setPropConfig(paper.propConfig);
        setPositions(Array.isArray(paper.positions) ? paper.positions : []);
        setPendingOrders(Array.isArray(paper.pendingOrders) ? paper.pendingOrders : []);
        setHistory(Array.isArray(paper.history) ? paper.history : []);
        if (planRes.plan?.playbooks?.length) {
          const names = Array.from(new Set([...planRes.plan.playbooks.map((p) => p.name), ...DEFAULT_PLAYBOOK_NAMES]));
          setPlaybooks(names);
          setPlaybook(names[0]);
        }
      })
      .catch(() => {})
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, []);

  const persistPaperState = useCallback(
    async (next: {
      balance: number;
      positions: PaperPosition[];
      history: PaperHistoryItem[];
      pendingOrders: PaperPendingOrder[];
      startingBalance: number;
      propConfig: PropConfig;
    }) => {
      setBalance(next.balance);
      setPositions(next.positions);
      setHistory(next.history);
      setPendingOrders(next.pendingOrders);
      setStartingBalance(next.startingBalance);
      setPropConfig(next.propConfig);
      try {
        await apiFetch('/api/workspace/paper', {
          method: 'POST',
          body: JSON.stringify(next),
        });
      } catch {
        // Silent retry on next mutation
      }
    },
    []
  );

  // Compute live Equity & Prop Challenge Metrics
  const unrealizedPnl = useMemo(() => {
    return positions.reduce((sum, pos) => {
      const q = quoteMap.get(pos.symbol.toUpperCase());
      const mark = pos.side === 'Buy' ? q?.bid ?? q?.price ?? pos.entry : q?.ask ?? q?.price ?? pos.entry;
      return sum + computeUnrealizedPnl(pos, mark);
    }, 0);
  }, [positions, quoteMap]);

  const equity = balance + unrealizedPnl;
  const totalPnl = equity - startingBalance;
  const totalReturnPct = startingBalance > 0 ? (totalPnl / startingBalance) * 100 : 0;

  const todayIso = new Date().toISOString().slice(0, 10);
  const todayRealized = useMemo(
    () => history.filter((h) => (h.closedAt || '').slice(0, 10) === todayIso).reduce((s, h) => s + Number(h.pnl || 0), 0),
    [history, todayIso]
  );
  const dailyPnlPct = startingBalance > 0 ? ((todayRealized + unrealizedPnl) / startingBalance) * 100 : 0;
  const dailyDrawdownUsedPct = dailyPnlPct < 0 ? Math.abs(dailyPnlPct) : 0;
  const overallDrawdownUsedPct = totalReturnPct < 0 ? Math.abs(totalReturnPct) : 0;

  const historyStats = useMemo(() => {
    const wins = history.filter((h) => h.pnl > 0);
    const losses = history.filter((h) => h.pnl < 0);
    const gp = wins.reduce((s, h) => s + h.pnl, 0);
    const gl = Math.abs(losses.reduce((s, h) => s + h.pnl, 0));
    return {
      count: history.length,
      winRate: history.length ? (wins.length / history.length) * 100 : 0,
      pf: gl > 0 ? gp / gl : gp > 0 ? 99 : null,
    };
  }, [history]);

  // Auto-trigger SL / TP on Open Positions & Auto-fill Pending Limit/Stop Orders
  const processingRef = useRef(false);
  useEffect(() => {
    if (loading || processingRef.current || (!positions.length && !pendingOrders.length) || !quotes.length) return;
    let changed = false;
    let nextBal = balance;
    let nextPos = [...positions];
    let nextHist = [...history];
    const remainingPending: PaperPendingOrder[] = [];

    // Check pending orders
    for (const ord of pendingOrders) {
      const q = quoteMap.get(ord.symbol.toUpperCase());
      if (!q) {
        remainingPending.push(ord);
        continue;
      }
      const px = ord.side === 'Buy' ? q.ask ?? q.price : q.bid ?? q.price;
      const triggered =
        (ord.orderType === 'Limit' && ((ord.side === 'Buy' && px <= ord.triggerPrice) || (ord.side === 'Sell' && px >= ord.triggerPrice))) ||
        (ord.orderType === 'Stop' && ((ord.side === 'Buy' && px >= ord.triggerPrice) || (ord.side === 'Sell' && px <= ord.triggerPrice)));
      if (triggered) {
        changed = true;
        nextPos.unshift({
          id: `pos_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
          symbol: ord.symbol,
          side: ord.side,
          size: ord.size,
          entry: px,
          sl: ord.sl ?? null,
          tp: ord.tp ?? null,
          playbook: ord.playbook,
          note: ord.note,
          openedAt: new Date().toISOString(),
        });
      } else {
        remainingPending.push(ord);
      }
    }

    // Check SL/TP hits on open positions
    const stillOpen: PaperPosition[] = [];
    for (const pos of nextPos) {
      const q = quoteMap.get(pos.symbol.toUpperCase());
      if (!q) {
        stillOpen.push(pos);
        continue;
      }
      const mark = pos.side === 'Buy' ? q.bid ?? q.price : q.ask ?? q.price;
      const hitSl = pos.sl != null && ((pos.side === 'Buy' && mark <= pos.sl) || (pos.side === 'Sell' && mark >= pos.sl));
      const hitTp = pos.tp != null && ((pos.side === 'Buy' && mark >= pos.tp) || (pos.side === 'Sell' && mark <= pos.tp));
      if (hitSl || hitTp) {
        changed = true;
        const exitPx = hitTp && pos.tp != null ? pos.tp : hitSl && pos.sl != null ? pos.sl : mark;
        const realized = computeUnrealizedPnl(pos, exitPx);
        const riskDist = pos.sl != null ? Math.abs(pos.entry - pos.sl) : 0;
        const rMult =
          riskDist > 0
            ? Number((((pos.side === 'Buy' ? exitPx - pos.entry : pos.entry - exitPx) / riskDist)).toFixed(2))
            : null;
        nextBal += realized;
        nextHist.unshift({
          id: `hist_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
          symbol: pos.symbol,
          side: pos.side,
          size: pos.size,
          entry: pos.entry,
          exit: exitPx,
          sl: pos.sl ?? null,
          tp: pos.tp ?? null,
          pnl: Number(realized.toFixed(2)),
          rMultiple: rMult,
          playbook: pos.playbook,
          note: pos.note,
          closedAt: new Date().toISOString(),
          syncedToJournal: false,
        });
      } else {
        stillOpen.push(pos);
      }
    }

    if (changed) {
      processingRef.current = true;
      void persistPaperState({
        balance: Number(nextBal.toFixed(2)),
        positions: stillOpen,
        history: nextHist.slice(0, 120),
        pendingOrders: remainingPending,
        startingBalance,
        propConfig,
      }).finally(() => {
        processingRef.current = false;
      });
    }
  }, [quotes, quoteMap, loading, balance, positions, history, pendingOrders, startingBalance, propConfig, persistPaperState]);

  // Risk-based position size preview
  const orderPreview = useMemo(() => {
    const sl = slInput ? Number(slInput) : null;
    const tp = tpInput ? Number(tpInput) : null;
    const mult = contractMultiplier(symbol);
    const riskDist = sl != null && Number.isFinite(sl) ? Math.abs(executionPrice - sl) : 0;
    const rewardDist = tp != null && Number.isFinite(tp) ? Math.abs(tp - executionPrice) : 0;

    let computedLots = Number(lotsInput) || 0.1;
    let riskUsd = 0;

    if (sizingMode === 'risk') {
      const rPct = Math.max(0.1, Number(riskPctInput) || 1);
      riskUsd = (equity * rPct) / 100;
      if (riskDist > 0) {
        computedLots = Math.max(0.01, Number((riskUsd / (riskDist * mult)).toFixed(2)));
      }
    } else {
      riskUsd = riskDist > 0 ? computedLots * mult * riskDist : 0;
    }

    const rewardUsd = rewardDist > 0 ? computedLots * mult * rewardDist : 0;
    const rr = riskDist > 0 && rewardDist > 0 ? rewardDist / riskDist : null;
    return { computedLots, riskUsd, rewardUsd, rr };
  }, [symbol, executionPrice, slInput, tpInput, sizingMode, lotsInput, riskPctInput, equity]);

  async function handleSubmitOrder(e: React.FormEvent) {
    e.preventDefault();
    setErrorMsg(null);
    const sl = slInput !== '' ? Number(slInput) : null;
    const tp = tpInput !== '' ? Number(tpInput) : null;

    if (sizingMode === 'risk' && (sl == null || !Number.isFinite(sl))) {
      setErrorMsg('Enter a Stop Loss price to auto-size by Risk %, or switch sizing mode to Lots.');
      return;
    }
    if (sl != null) {
      if (side === 'Buy' && sl >= executionPrice) {
        setErrorMsg('For a Long order, Stop Loss must be below entry price.');
        return;
      }
      if (side === 'Sell' && sl <= executionPrice) {
        setErrorMsg('For a Short order, Stop Loss must be above entry price.');
        return;
      }
    }
    if (tp != null) {
      if (side === 'Buy' && tp <= executionPrice) {
        setErrorMsg('For a Long order, Take Profit must be above entry price.');
        return;
      }
      if (side === 'Sell' && tp >= executionPrice) {
        setErrorMsg('For a Short order, Take Profit must be below entry price.');
        return;
      }
    }

    if (orderMode === 'Market') {
      const newPos: PaperPosition = {
        id: `pos_${Date.now()}`,
        symbol: symbol.toUpperCase(),
        side,
        size: orderPreview.computedLots,
        entry: executionPrice,
        sl,
        tp,
        playbook,
        note: noteInput.trim(),
        riskUsd: orderPreview.riskUsd || null,
        openedAt: new Date().toISOString(),
      };
      await persistPaperState({
        balance,
        positions: [newPos, ...positions],
        history,
        pendingOrders,
        startingBalance,
        propConfig,
      });
      setNotice(`Executed ${side === 'Buy' ? 'Long' : 'Short'} ${orderPreview.computedLots} lots ${symbol} @ ${fmtPrice(symbol, executionPrice)}.`);
      setBookTab('positions');
    } else {
      const trig = Number(triggerPriceInput);
      if (!Number.isFinite(trig) || trig <= 0) {
        setErrorMsg('Enter a valid trigger price for your pending order.');
        return;
      }
      const newPending: PaperPendingOrder = {
        id: `ord_${Date.now()}`,
        symbol: symbol.toUpperCase(),
        side,
        orderType: orderMode,
        triggerPrice: trig,
        size: orderPreview.computedLots,
        sl,
        tp,
        playbook,
        note: noteInput.trim(),
        createdAt: new Date().toISOString(),
      };
      await persistPaperState({
        balance,
        positions,
        history,
        pendingOrders: [newPending, ...pendingOrders],
        startingBalance,
        propConfig,
      });
      setNotice(`Placed ${orderMode} ${side} ${symbol} @ ${fmtPrice(symbol, trig)}.`);
      setBookTab('pending');
    }
    setNoteInput('');
  }

  async function handleClosePosition(pos: PaperPosition, fraction = 1) {
    const q = quoteMap.get(pos.symbol.toUpperCase());
    const exitPx = pos.side === 'Buy' ? q?.bid ?? q?.price ?? pos.entry : q?.ask ?? q?.price ?? pos.entry;
    const closeSize = Number((pos.size * fraction).toFixed(2));
    const realized = computeUnrealizedPnl({ ...pos, size: closeSize }, exitPx);
    const riskDist = pos.sl != null ? Math.abs(pos.entry - pos.sl) : 0;
    const rMult =
      riskDist > 0 ? Number(((pos.side === 'Buy' ? exitPx - pos.entry : pos.entry - exitPx) / riskDist).toFixed(2)) : null;

    const closedRecord: PaperHistoryItem = {
      id: `hist_${Date.now()}`,
      symbol: pos.symbol,
      side: pos.side,
      size: closeSize,
      entry: pos.entry,
      exit: exitPx,
      sl: pos.sl ?? null,
      tp: pos.tp ?? null,
      pnl: Number(realized.toFixed(2)),
      rMultiple: rMult,
      playbook: pos.playbook,
      note: fraction < 1 ? `Partial (${Math.round(fraction * 100)}%) ${pos.note || ''}`.trim() : pos.note,
      closedAt: new Date().toISOString(),
      syncedToJournal: false,
    };

    const nextPositions =
      fraction >= 1
        ? positions.filter((p) => p.id !== pos.id)
        : positions.map((p) => (p.id === pos.id ? { ...p, size: Number((p.size - closeSize).toFixed(2)) } : p));

    await persistPaperState({
      balance: Number((balance + realized).toFixed(2)),
      positions: nextPositions,
      history: [closedRecord, ...history].slice(0, 120),
      pendingOrders,
      startingBalance,
      propConfig,
    });
    setNotice(
      `${fraction < 1 ? '50% partial closed' : 'Closed'} ${pos.symbol} for ${fmtMoney(realized)}.`
    );
  }

  async function handleMoveToBreakeven(pos: PaperPosition) {
    const nextPositions = positions.map((p) => (p.id === pos.id ? { ...p, sl: p.entry } : p));
    await persistPaperState({
      balance,
      positions: nextPositions,
      history,
      pendingOrders,
      startingBalance,
      propConfig,
    });
    setNotice(`Moved ${pos.symbol} Stop Loss to Break-Even (${fmtPrice(pos.symbol, pos.entry)}).`);
  }

  async function handleSaveSlTp(posId: string) {
    const nextSl = editSl !== '' ? Number(editSl) : null;
    const nextTp = editTp !== '' ? Number(editTp) : null;
    const nextPositions = positions.map((p) => (p.id === posId ? { ...p, sl: nextSl, tp: nextTp } : p));
    await persistPaperState({
      balance,
      positions: nextPositions,
      history,
      pendingOrders,
      startingBalance,
      propConfig,
    });
    setEditingPosId(null);
    setNotice('Updated SL/TP levels.');
  }

  async function handleCancelPending(id: string) {
    await persistPaperState({
      balance,
      positions,
      history,
      pendingOrders: pendingOrders.filter((o) => o.id !== id),
      startingBalance,
      propConfig,
    });
  }

  async function handleResetAccount(newStartBalance: number) {
    await persistPaperState({
      balance: newStartBalance,
      positions: [],
      history: [],
      pendingOrders: [],
      startingBalance: newStartBalance,
      propConfig,
    });
    setNotice(`Paper simulator reset to $${newStartBalance.toLocaleString()} starting capital.`);
  }

  async function handleLogToJournal(item: PaperHistoryItem) {
    setSyncingId(item.id);
    try {
      await apiFetch('/api/workspace/journal', {
        method: 'POST',
        body: JSON.stringify({
          instrument: item.symbol,
          side: item.side,
          entryPrice: item.entry,
          exitPrice: item.exit,
          sl: item.sl ?? null,
          tp: item.tp ?? null,
          size: item.size ?? null,
          rMultiple: item.rMultiple ?? null,
          pnl: item.pnl,
          tradeDate: (item.closedAt || new Date().toISOString()).slice(0, 10),
          entryTime: (item.closedAt || '').slice(11, 16) || null,
          session: 'New York',
          playbook: item.playbook || DEFAULT_PLAYBOOK_NAMES[0],
          strategy: item.playbook || DEFAULT_PLAYBOOK_NAMES[0],
          setupGrade: 'A',
          accountLabel: 'Paper Sim',
          reasonEntry: item.note || 'Forward-tested via Grid Pips Paper Trading Simulator',
        }),
      });
      const updatedHist = history.map((h) => (h.id === item.id ? { ...h, syncedToJournal: true } : h));
      await persistPaperState({
        balance,
        positions,
        history: updatedHist,
        pendingOrders,
        startingBalance,
        propConfig,
      });
      if (onJournalRefresh) await onJournalRefresh();
      setNotice(`Synced ${item.symbol} (${fmtMoney(item.pnl)}) directly into Trading Journal & Analytics.`);
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Unable to sync trade to journal.');
    } finally {
      setSyncingId(null);
    }
  }

  return (
    <div className="space-y-5">
      {/* Prop-Firm Challenge & Account Guardrails Strip */}
      <div className="rounded-2xl bg-[#0B0F19] text-white border border-slate-800 p-5 space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <div className="flex items-center gap-2">
              <Shield className="w-4 h-4 text-[#E5A93C]" />
              <h2 className="text-base font-bold">Forward-Test Paper Simulator & Prop Guardrails</h2>
            </div>
            <p className="text-xs text-slate-400 mt-0.5">
              Live bid/ask fills, risk-based sizing, limit/stop triggers, and 1-click sync into your Trading Journal.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-1.5">
            {BALANCE_PRESETS.map((amt) => (
              <button
                key={amt}
                type="button"
                onClick={() => handleResetAccount(amt)}
                className={`px-2.5 py-1.5 text-[11px] font-mono font-semibold rounded-lg border transition-colors cursor-pointer ${
                  startingBalance === amt
                    ? 'bg-[#E5A93C] border-[#E5A93C] text-[#0B0F19]'
                    : 'bg-slate-900 border-slate-700 text-slate-300 hover:border-amber-400'
                }`}
              >
                ${amt / 1000}k
              </button>
            ))}
            <button
              type="button"
              onClick={() => handleResetAccount(startingBalance)}
              className="inline-flex items-center gap-1 px-2.5 py-1.5 text-[11px] font-semibold rounded-lg bg-slate-900 border border-slate-700 text-slate-300 hover:text-white cursor-pointer"
              title="Reset simulator"
            >
              <RotateCcw className="w-3 h-3" />
              Reset
            </button>
          </div>
        </div>

        <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
          <div className="p-3 rounded-xl bg-slate-900/90 border border-slate-800">
            <div className="text-[10px] uppercase tracking-wider text-slate-400">Live Equity</div>
            <div className="text-lg font-bold font-mono tabular-nums text-white mt-0.5">
              ${equity.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            </div>
            <div className="text-[11px] font-mono text-slate-400">
              Balance ${balance.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            </div>
          </div>

          <div className="p-3 rounded-xl bg-slate-900/90 border border-slate-800">
            <div className="text-[10px] uppercase tracking-wider text-slate-400">Open P&L / Net</div>
            <div
              className={`text-lg font-bold font-mono tabular-nums mt-0.5 ${
                unrealizedPnl >= 0 ? 'text-emerald-400' : 'text-rose-400'
              }`}
            >
              {fmtMoney(unrealizedPnl)}
            </div>
            <div className={`text-[11px] font-mono ${totalPnl >= 0 ? 'text-[#E5A93C]' : 'text-rose-400'}`}>
              Total: {fmtMoney(totalPnl)} ({totalReturnPct >= 0 ? '+' : ''}
              {totalReturnPct.toFixed(2)}%)
            </div>
          </div>

          <div className="p-3 rounded-xl bg-slate-900/90 border border-slate-800 space-y-1.5">
            <div className="flex items-center justify-between text-[10px] uppercase tracking-wider text-slate-400">
              <span>Profit Target ({propConfig.profitTargetPct}%)</span>
              <span className="font-mono text-[#E5A93C]">{Math.max(0, totalReturnPct).toFixed(1)}%</span>
            </div>
            <div className="h-1.5 rounded-full bg-slate-800 overflow-hidden">
              <div
                className="h-full bg-[#E5A93C]"
                style={{ width: `${Math.min(100, Math.max(0, (totalReturnPct / propConfig.profitTargetPct) * 100))}%` }}
              />
            </div>
            <div className="text-[10px] font-mono text-slate-400">
              Goal: +${((startingBalance * propConfig.profitTargetPct) / 100).toLocaleString()}
            </div>
          </div>

          <div className="p-3 rounded-xl bg-slate-900/90 border border-slate-800 space-y-1.5">
            <div className="flex items-center justify-between text-[10px] uppercase tracking-wider text-slate-400">
              <span>Daily Loss ({propConfig.dailyLossLimitPct}%)</span>
              <span className={`font-mono ${dailyDrawdownUsedPct >= propConfig.dailyLossLimitPct ? 'text-rose-400' : 'text-slate-200'}`}>
                {dailyDrawdownUsedPct.toFixed(1)}%
              </span>
            </div>
            <div className="h-1.5 rounded-full bg-slate-800 overflow-hidden">
              <div
                className="h-full bg-rose-500"
                style={{ width: `${Math.min(100, (dailyDrawdownUsedPct / propConfig.dailyLossLimitPct) * 100)}%` }}
              />
            </div>
            <div className="text-[10px] font-mono text-slate-400">
              Max DD: {overallDrawdownUsedPct.toFixed(1)}% / {propConfig.maxDrawdownLimitPct}%
            </div>
          </div>

          <div className="p-3 rounded-xl bg-slate-900/90 border border-slate-800">
            <div className="text-[10px] uppercase tracking-wider text-slate-400">Sim Performance</div>
            <div className="text-lg font-bold font-mono tabular-nums text-white mt-0.5">
              {historyStats.winRate.toFixed(0)}% WR
            </div>
            <div className="text-[11px] font-mono text-slate-400">
              {historyStats.count} closed · PF {historyStats.pf === null ? '—' : historyStats.pf >= 99 ? '∞' : historyStats.pf.toFixed(2)}
            </div>
          </div>
        </div>
      </div>

      {notice && (
        <div className="flex items-center justify-between px-4 py-2.5 rounded-xl bg-emerald-50 border border-emerald-200 text-xs font-medium text-emerald-800">
          <span>{notice}</span>
          <button type="button" onClick={() => setNotice(null)} className="cursor-pointer">
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}
      {errorMsg && (
        <div className="flex items-center justify-between px-4 py-2.5 rounded-xl bg-rose-50 border border-rose-200 text-xs font-medium text-rose-700">
          <span>{errorMsg}</span>
          <button type="button" onClick={() => setErrorMsg(null)} className="cursor-pointer">
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      {/* Main Grid: Live Chart + Pro Order Ticket */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
        {/* Left: Collapsible Live TradingView Chart */}
        <div className="lg:col-span-8 rounded-2xl bg-white border border-slate-200 shadow-xs overflow-hidden">
          <div className="px-4 py-3 border-b border-slate-100 flex flex-wrap items-center justify-between gap-2 bg-[#FAF9F6]">
            <div className="flex items-center gap-2">
              <select
                value={symbol}
                onChange={(e) => setSymbol(e.target.value)}
                className="px-2.5 py-1.5 text-xs font-mono font-bold rounded-lg border border-slate-300 bg-white text-slate-950"
              >
                {symbolList.map((sym) => (
                  <option key={sym} value={sym}>
                    {sym}
                  </option>
                ))}
              </select>
              <div className="text-xs font-mono tabular-nums text-slate-600">
                Bid <strong className="text-slate-950">{fmtPrice(symbol, liveBid)}</strong> · Ask{' '}
                <strong className="text-slate-950">{fmtPrice(symbol, liveAsk)}</strong>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <div className="inline-flex rounded-lg border border-slate-200 bg-white p-0.5">
                {CHART_TIMEFRAMES.map((tf) => (
                  <button
                    key={tf}
                    type="button"
                    onClick={() => setChartTf(tf)}
                    className={`px-2 py-1 text-[11px] font-mono font-semibold rounded cursor-pointer ${
                      chartTf === tf ? 'bg-[#0B0F19] text-[#E5A93C]' : 'text-slate-600 hover:text-slate-950'
                    }`}
                  >
                    {tf}
                  </button>
                ))}
              </div>
              <button
                type="button"
                onClick={() => setShowChart((v) => !v)}
                className="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs font-semibold rounded-lg border border-slate-200 bg-white text-slate-600 hover:text-slate-950 cursor-pointer"
              >
                {showChart ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
                {showChart ? 'Hide Chart' : 'Show Chart'}
              </button>
            </div>
          </div>

          {showChart && (
            <div className="p-2">
              <LiveTradingViewChart symbol={symbol} timeframe={chartTf} theme="light" heightClass="h-[420px]" />
            </div>
          )}
        </div>

        {/* Right: Pro Risk-Based Order Ticket */}
        <form
          onSubmit={handleSubmitOrder}
          className="lg:col-span-4 rounded-2xl bg-white border border-slate-200 shadow-xs p-5 space-y-4 flex flex-col justify-between"
        >
          <div className="space-y-3.5">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-bold text-slate-950 flex items-center gap-1.5">
                <SlidersHorizontal className="w-4 h-4 text-[#B45309]" />
                Execution Ticket
              </h3>
              <span className="text-xs font-mono font-bold text-[#B45309]">{symbol}</span>
            </div>

            {/* Order Type */}
            <div className="grid grid-cols-3 gap-1.5 p-1 rounded-xl bg-[#FAF9F6] border border-slate-200">
              {(['Market', 'Limit', 'Stop'] as const).map((mode) => (
                <button
                  key={mode}
                  type="button"
                  onClick={() => {
                    setOrderMode(mode);
                    if (mode !== 'Market' && !triggerPriceInput) {
                      setTriggerPriceInput(fmtPrice(symbol, side === 'Buy' ? liveAsk : liveBid));
                    }
                  }}
                  className={`py-1.5 text-xs font-semibold rounded-lg cursor-pointer transition-colors ${
                    orderMode === mode ? 'bg-[#0B0F19] text-[#E5A93C]' : 'text-slate-600 hover:text-slate-950'
                  }`}
                >
                  {mode}
                </button>
              ))}
            </div>

            {/* Side Selector */}
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => setSide('Buy')}
                className={`py-2.5 px-3 rounded-xl border text-left transition-colors cursor-pointer ${
                  side === 'Buy'
                    ? 'bg-emerald-700 border-emerald-700 text-white'
                    : 'bg-white border-slate-200 text-slate-700 hover:border-emerald-300'
                }`}
              >
                <div className="text-[10px] uppercase font-semibold opacity-80 flex items-center gap-1">
                  <ArrowUpRight className="w-3 h-3" /> Buy / Long
                </div>
                <div className="text-sm font-bold font-mono tabular-nums mt-0.5">{fmtPrice(symbol, liveAsk)}</div>
              </button>
              <button
                type="button"
                onClick={() => setSide('Sell')}
                className={`py-2.5 px-3 rounded-xl border text-left transition-colors cursor-pointer ${
                  side === 'Sell'
                    ? 'bg-rose-600 border-rose-600 text-white'
                    : 'bg-white border-slate-200 text-slate-700 hover:border-rose-300'
                }`}
              >
                <div className="text-[10px] uppercase font-semibold opacity-80 flex items-center gap-1">
                  <ArrowDownRight className="w-3 h-3" /> Sell / Short
                </div>
                <div className="text-sm font-bold font-mono tabular-nums mt-0.5">{fmtPrice(symbol, liveBid)}</div>
              </button>
            </div>

            {orderMode !== 'Market' && (
              <div>
                <label className="block text-[11px] font-semibold text-slate-600 mb-1">
                  {orderMode} Trigger Price
                </label>
                <input
                  type="number"
                  step="any"
                  value={triggerPriceInput}
                  onChange={(e) => setTriggerPriceInput(e.target.value)}
                  className="w-full px-3 py-2 text-xs font-mono rounded-lg border border-slate-300 focus:border-amber-500 focus:outline-none"
                />
              </div>
            )}

            {/* Risk % vs Fixed Lots Toggle */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <label className="text-[11px] font-semibold text-slate-600">Position Sizing</label>
                <div className="inline-flex rounded-md border border-slate-200 bg-[#FAF9F6] p-0.5 text-[10px] font-semibold">
                  <button
                    type="button"
                    onClick={() => setSizingMode('risk')}
                    className={`px-2 py-0.5 rounded cursor-pointer ${
                      sizingMode === 'risk' ? 'bg-[#0B0F19] text-[#E5A93C]' : 'text-slate-600'
                    }`}
                  >
                    Risk %
                  </button>
                  <button
                    type="button"
                    onClick={() => setSizingMode('lots')}
                    className={`px-2 py-0.5 rounded cursor-pointer ${
                      sizingMode === 'lots' ? 'bg-[#0B0F19] text-[#E5A93C]' : 'text-slate-600'
                    }`}
                  >
                    Lots
                  </button>
                </div>
              </div>
              {sizingMode === 'risk' ? (
                <div className="flex items-center gap-2">
                  <input
                    type="number"
                    step="0.25"
                    min="0.1"
                    max="10"
                    value={riskPctInput}
                    onChange={(e) => setRiskPctInput(e.target.value)}
                    className="w-24 px-3 py-2 text-xs font-mono font-bold rounded-lg border border-slate-300"
                  />
                  <div className="flex items-center gap-1">
                    {['0.5', '1.0', '2.0'].map((pct) => (
                      <button
                        key={pct}
                        type="button"
                        onClick={() => setRiskPctInput(pct)}
                        className="px-2 py-1.5 text-[11px] font-mono rounded-md border border-slate-200 hover:border-amber-400 text-slate-700 cursor-pointer"
                      >
                        {pct}%
                      </button>
                    ))}
                  </div>
                </div>
              ) : (
                <input
                  type="number"
                  step="0.01"
                  min="0.01"
                  value={lotsInput}
                  onChange={(e) => setLotsInput(e.target.value)}
                  className="w-full px-3 py-2 text-xs font-mono font-bold rounded-lg border border-slate-300"
                />
              )}
            </div>

            {/* SL / TP */}
            <div className="grid grid-cols-2 gap-2.5">
              <div>
                <label className="block text-[11px] font-semibold text-slate-600 mb-1">Stop Loss</label>
                <input
                  type="number"
                  step="any"
                  value={slInput}
                  onChange={(e) => setSlInput(e.target.value)}
                  placeholder="Optional"
                  className="w-full px-2.5 py-2 text-xs font-mono rounded-lg border border-slate-300 focus:border-rose-400 focus:outline-none"
                />
              </div>
              <div>
                <label className="block text-[11px] font-semibold text-slate-600 mb-1">Take Profit</label>
                <input
                  type="number"
                  step="any"
                  value={tpInput}
                  onChange={(e) => setTpInput(e.target.value)}
                  placeholder="Optional"
                  className="w-full px-2.5 py-2 text-xs font-mono rounded-lg border border-slate-300 focus:border-emerald-400 focus:outline-none"
                />
              </div>
            </div>

            {/* Playbook & Note */}
            <div>
              <label className="block text-[11px] font-semibold text-slate-600 mb-1">Playbook Tag</label>
              <select
                value={playbook}
                onChange={(e) => setPlaybook(e.target.value)}
                className="w-full px-2.5 py-2 text-xs rounded-lg border border-slate-300 bg-white"
              >
                {playbooks.map((pb) => (
                  <option key={pb} value={pb}>
                    {pb}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-[11px] font-semibold text-slate-600 mb-1">Setup Note</label>
              <input
                type="text"
                value={noteInput}
                onChange={(e) => setNoteInput(e.target.value)}
                placeholder="London sweep + 5m FVG..."
                className="w-full px-3 py-1.5 text-xs rounded-lg border border-slate-300"
              />
            </div>

            {/* Risk Preview Strip */}
            <div className="p-3 rounded-xl bg-[#FAF9F6] border border-slate-200 grid grid-cols-3 gap-2 text-center">
              <div>
                <div className="text-[10px] uppercase text-slate-500">Lots</div>
                <div className="text-xs font-bold font-mono text-slate-950">{orderPreview.computedLots.toFixed(2)}</div>
              </div>
              <div>
                <div className="text-[10px] uppercase text-slate-500">Est. Risk</div>
                <div className="text-xs font-bold font-mono text-rose-600">
                  {orderPreview.riskUsd > 0 ? `-$${orderPreview.riskUsd.toFixed(0)}` : '—'}
                </div>
              </div>
              <div>
                <div className="text-[10px] uppercase text-slate-500">R:R</div>
                <div className="text-xs font-bold font-mono text-emerald-700">
                  {orderPreview.rr ? `1:${orderPreview.rr.toFixed(2)}` : '—'}
                </div>
              </div>
            </div>
          </div>

          <button
            type="submit"
            className={`w-full py-2.5 rounded-xl text-xs font-bold tracking-wide transition-colors cursor-pointer ${
              side === 'Buy'
                ? 'bg-emerald-700 hover:bg-emerald-800 text-white'
                : 'bg-rose-600 hover:bg-rose-700 text-white'
            }`}
          >
            {orderMode === 'Market' ? `Execute ${side === 'Buy' ? 'Buy' : 'Sell'} Market` : `Place ${side} ${orderMode} Order`}
          </button>
        </form>
      </div>

      {/* Positions, Pending Orders & Closed History */}
      <div className="rounded-2xl bg-white border border-slate-200 shadow-xs overflow-hidden">
        <div className="px-5 py-3 border-b border-slate-200 bg-[#FAF9F6] flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            {(
              [
                ['positions', `Open Positions (${positions.length})`],
                ['pending', `Pending Orders (${pendingOrders.length})`],
                ['history', `Closed History (${history.length})`],
              ] as const
            ).map(([k, lbl]) => (
              <button
                key={k}
                type="button"
                onClick={() => setBookTab(k)}
                className={`px-3 py-1.5 text-xs font-semibold rounded-lg cursor-pointer transition-colors ${
                  bookTab === k ? 'bg-[#0B0F19] text-[#E5A93C]' : 'text-slate-600 hover:text-slate-950'
                }`}
              >
                {lbl}
              </button>
            ))}
          </div>
          <span className="text-[11px] text-slate-500">
            Closed trades can be logged to your Trading Journal with 1 click.
          </span>
        </div>

        {bookTab === 'positions' ? (
          positions.length === 0 ? (
            <div className="p-8 text-center text-xs text-slate-500">No open simulated positions.</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="border-b border-slate-200 text-[11px] font-semibold uppercase tracking-wider text-slate-500">
                    <th className="py-2.5 px-4">Symbol</th>
                    <th className="py-2.5 px-3">Side / Lots</th>
                    <th className="py-2.5 px-3">Entry → Mark</th>
                    <th className="py-2.5 px-3">SL / TP</th>
                    <th className="py-2.5 px-3">Playbook</th>
                    <th className="py-2.5 px-3 text-right">Live P&L</th>
                    <th className="py-2.5 px-4 text-right">Manage</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 text-xs">
                  {positions.map((pos) => {
                    const q = quoteMap.get(pos.symbol.toUpperCase());
                    const mark = pos.side === 'Buy' ? q?.bid ?? q?.price ?? pos.entry : q?.ask ?? q?.price ?? pos.entry;
                    const livePnl = computeUnrealizedPnl(pos, mark);
                    const isEditing = editingPosId === pos.id;
                    return (
                      <tr key={pos.id} className="hover:bg-slate-50/70">
                        <td className="py-3 px-4 font-mono font-bold text-slate-950">{pos.symbol}</td>
                        <td className="py-3 px-3 font-mono">
                          <span className={pos.side === 'Buy' ? 'text-emerald-700 font-bold' : 'text-rose-600 font-bold'}>
                            {pos.side.toUpperCase()}
                          </span>{' '}
                          <span className="text-slate-600">{pos.size}</span>
                        </td>
                        <td className="py-3 px-3 font-mono tabular-nums text-slate-700">
                          {fmtPrice(pos.symbol, pos.entry)} → <strong>{fmtPrice(pos.symbol, mark)}</strong>
                        </td>
                        <td className="py-3 px-3 font-mono tabular-nums">
                          {isEditing ? (
                            <div className="flex items-center gap-1">
                              <input
                                type="number"
                                step="any"
                                value={editSl}
                                onChange={(e) => setEditSl(e.target.value)}
                                placeholder="SL"
                                className="w-20 px-1.5 py-1 text-[11px] rounded border border-slate-300"
                              />
                              <input
                                type="number"
                                step="any"
                                value={editTp}
                                onChange={(e) => setEditTp(e.target.value)}
                                placeholder="TP"
                                className="w-20 px-1.5 py-1 text-[11px] rounded border border-slate-300"
                              />
                              <button
                                type="button"
                                onClick={() => handleSaveSlTp(pos.id)}
                                className="px-2 py-1 text-[11px] font-semibold bg-[#0B0F19] text-[#E5A93C] rounded cursor-pointer"
                              >
                                Save
                              </button>
                            </div>
                          ) : (
                            <span className="text-slate-600">
                              {fmtPrice(pos.symbol, pos.sl)} / {fmtPrice(pos.symbol, pos.tp)}
                            </span>
                          )}
                        </td>
                        <td className="py-3 px-3 text-slate-600 max-w-[150px] truncate">{pos.playbook || '—'}</td>
                        <td
                          className={`py-3 px-3 text-right font-mono font-bold tabular-nums ${
                            livePnl >= 0 ? 'text-emerald-700' : 'text-rose-600'
                          }`}
                        >
                          {fmtMoney(livePnl)}
                        </td>
                        <td className="py-3 px-4 text-right whitespace-nowrap">
                          <div className="inline-flex items-center gap-1.5">
                            <button
                              type="button"
                              onClick={() => handleMoveToBreakeven(pos)}
                              className="px-2 py-1 text-[11px] font-semibold rounded border border-slate-200 text-slate-700 hover:border-amber-400 cursor-pointer"
                              title="Move Stop Loss to Entry"
                            >
                              BE
                            </button>
                            <button
                              type="button"
                              onClick={() => handleClosePosition(pos, 0.5)}
                              disabled={pos.size < 0.02}
                              className="px-2 py-1 text-[11px] font-semibold rounded border border-slate-200 text-slate-700 hover:border-amber-400 cursor-pointer disabled:opacity-40"
                              title="Close 50% Partial"
                            >
                              50%
                            </button>
                            <button
                              type="button"
                              onClick={() => {
                                setEditingPosId(isEditing ? null : pos.id);
                                setEditSl(pos.sl != null ? String(pos.sl) : '');
                                setEditTp(pos.tp != null ? String(pos.tp) : '');
                              }}
                              className="p-1 rounded border border-slate-200 text-slate-500 hover:text-slate-950 cursor-pointer"
                              title="Edit SL/TP"
                            >
                              <Edit3 className="w-3.5 h-3.5" />
                            </button>
                            <button
                              type="button"
                              onClick={() => handleClosePosition(pos, 1)}
                              className="px-2.5 py-1 text-[11px] font-semibold rounded bg-[#0B0F19] text-[#E5A93C] hover:bg-slate-900 cursor-pointer"
                            >
                              Close
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )
        ) : bookTab === 'pending' ? (
          pendingOrders.length === 0 ? (
            <div className="p-8 text-center text-xs text-slate-500">No active Limit or Stop pending orders.</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="border-b border-slate-200 text-[11px] font-semibold uppercase tracking-wider text-slate-500">
                    <th className="py-2.5 px-4">Symbol</th>
                    <th className="py-2.5 px-3">Order Type</th>
                    <th className="py-2.5 px-3">Trigger</th>
                    <th className="py-2.5 px-3">Lots</th>
                    <th className="py-2.5 px-3">SL / TP</th>
                    <th className="py-2.5 px-4 text-right">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 text-xs">
                  {pendingOrders.map((ord) => (
                    <tr key={ord.id}>
                      <td className="py-3 px-4 font-mono font-bold text-slate-950">{ord.symbol}</td>
                      <td className="py-3 px-3 font-semibold">
                        <span className={ord.side === 'Buy' ? 'text-emerald-700' : 'text-rose-600'}>
                          {ord.side} {ord.orderType}
                        </span>
                      </td>
                      <td className="py-3 px-3 font-mono">{fmtPrice(ord.symbol, ord.triggerPrice)}</td>
                      <td className="py-3 px-3 font-mono">{ord.size}</td>
                      <td className="py-3 px-3 font-mono text-slate-600">
                        {fmtPrice(ord.symbol, ord.sl)} / {fmtPrice(ord.symbol, ord.tp)}
                      </td>
                      <td className="py-3 px-4 text-right">
                        <button
                          type="button"
                          onClick={() => handleCancelPending(ord.id)}
                          className="px-2.5 py-1 text-[11px] font-semibold text-rose-600 hover:bg-rose-50 rounded cursor-pointer"
                        >
                          Cancel
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )
        ) : history.length === 0 ? (
          <div className="p-8 text-center text-xs text-slate-500">
            No closed simulated trades yet. Close a position to review performance and sync it to your Journal.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-slate-200 text-[11px] font-semibold uppercase tracking-wider text-slate-500">
                  <th className="py-2.5 px-4">Closed</th>
                  <th className="py-2.5 px-3">Symbol</th>
                  <th className="py-2.5 px-3">Side</th>
                  <th className="py-2.5 px-3">Entry → Exit</th>
                  <th className="py-2.5 px-3">Playbook</th>
                  <th className="py-2.5 px-3 text-right">R-Mult</th>
                  <th className="py-2.5 px-3 text-right">Realized P&L</th>
                  <th className="py-2.5 px-4 text-right">Journal Sync</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-xs">
                {history.map((item) => (
                  <tr key={item.id} className="hover:bg-slate-50/70">
                    <td className="py-3 px-4 font-mono text-slate-500 whitespace-nowrap">
                      {(item.closedAt || '').slice(0, 16).replace('T', ' ')}
                    </td>
                    <td className="py-3 px-3 font-mono font-bold text-slate-950">{item.symbol}</td>
                    <td className="py-3 px-3 font-semibold">
                      <span className={item.side === 'Buy' ? 'text-emerald-700' : 'text-rose-600'}>{item.side}</span>
                    </td>
                    <td className="py-3 px-3 font-mono tabular-nums text-slate-700">
                      {fmtPrice(item.symbol, item.entry)} → {fmtPrice(item.symbol, item.exit)}
                    </td>
                    <td className="py-3 px-3 text-slate-600 max-w-[150px] truncate">{item.playbook || '—'}</td>
                    <td className="py-3 px-3 text-right font-mono tabular-nums text-slate-700">
                      {item.rMultiple != null ? `${item.rMultiple >= 0 ? '+' : ''}${item.rMultiple.toFixed(2)}R` : '—'}
                    </td>
                    <td
                      className={`py-3 px-3 text-right font-mono font-bold tabular-nums ${
                        item.pnl >= 0 ? 'text-emerald-700' : 'text-rose-600'
                      }`}
                    >
                      {fmtMoney(item.pnl)}
                    </td>
                    <td className="py-3 px-4 text-right whitespace-nowrap">
                      {item.syncedToJournal ? (
                        <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-emerald-700">
                          <Check className="w-3.5 h-3.5" /> Logged
                        </span>
                      ) : (
                        <button
                          type="button"
                          onClick={() => handleLogToJournal(item)}
                          disabled={syncingId === item.id}
                          className="inline-flex items-center gap-1 px-2.5 py-1 text-[11px] font-semibold rounded-md bg-[#0B0F19] text-[#E5A93C] hover:bg-slate-900 cursor-pointer disabled:opacity-50"
                        >
                          <BookCheck className="w-3 h-3" />
                          {syncingId === item.id ? 'Syncing...' : 'Log to Journal'}
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
};
