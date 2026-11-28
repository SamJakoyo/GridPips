import React, { useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle,
  BookOpen,
  CheckCircle2,
  ClipboardCheck,
  Edit3,
  Plus,
  RotateCcw,
  Save,
  ShieldCheck,
  Trash2,
  X,
} from 'lucide-react';
import { apiFetch } from '../../lib/api';
import { computeTradeAnalytics, getTradePlaybook } from '../../lib/tradeMetrics';
import type { ChecklistStageItem, JournalTrade, TradingPlanData, TradingPlaybook } from '../../types';

type PlanTab = 'playbooks' | 'rules' | 'checklists';
type ChecklistStageKey = 'preMarket' | 'preEntry' | 'duringTrade' | 'postSession';

const DEFAULT_PLAYBOOKS: TradingPlaybook[] = [
  {
    id: 'pb_silver_bullet',
    name: 'ICT Silver Bullet FVG',
    category: 'ICT Intraday',
    markets: 'XAUUSD, NAS100, EURUSD, GBPUSD',
    timeframes: '1H Bias · 5m / 1m Execution',
    session: 'NY AM Killzone (10:00–11:00 EST)',
    minRr: 2.0,
    description: 'Wait for a clean buy-side or sell-side liquidity sweep during the Silver Bullet hour, followed by energetic displacement leaving an unmitigated FVG aligned with HTF DOL.',
    entryRules: [
      'Confirm HTF Daily/4H bias and clear Draw on Liquidity (BSL or SSL)',
      'Liquidity sweep of an intraday swing high/low inside the killzone',
      'Market Structure Shift (MSS) with strong displacement candle',
      'Limit entry at the 50% Consequent Encroachment (CE) of the FVG in Discount/Premium',
    ],
    exitRules: [
      'Take 40% partial at 1.5R and move Stop Loss to Break-Even',
      'Scale remaining position at opposing internal/external liquidity pool',
    ],
    invalidationRule: 'Strict candle close beyond the displacement swing / OB body invalidates the setup.',
  },
  {
    id: 'pb_drt_flip',
    name: 'DRT 50% Equilibrium Flip',
    category: 'Dealing Range Theory',
    markets: 'EURUSD, GBPUSD, XAUUSD, US30',
    timeframes: '4H Range · 15m Trigger',
    session: 'London & New York Overlap',
    minRr: 2.5,
    description: 'Trade the ERL → IRL → ERL expansion cycle once price sweeps DRH/DRL and decisively flips the 50% DRT equilibrium quadrant.',
    entryRules: [
      'Define active Type 1/2/3 Dealing Range (DRH 1.00, 75%, 50% EQ, 25%, DRL 0.00)',
      'Wait for external sweep or 25%/75% quadrant rejection with SMT divergence',
      'Enter on retest of the 50% Equilibrium flip OB/FVG',
    ],
    exitRules: [
      'TP1 at opposing 75%/25% quadrant, TP2 at DRH/DRL external liquidity',
      'Trail runner toward -0.25 / +0.25 Standard Deviation target',
    ],
    invalidationRule: 'Candle close back across 50% DRT equilibrium against directional bias.',
  },
  {
    id: 'pb_london_sweep',
    name: 'London Sweep & OB Continuation',
    category: 'Session Reversal',
    markets: 'EURUSD, GBPUSD, XAUUSD',
    timeframes: '1H / 15m / 5m',
    session: 'London Killzone (02:00–05:00 EST)',
    minRr: 2.0,
    description: 'Fade the Asian range Judas manipulation sweep into a higher-timeframe Order Block or Breaker Block.',
    entryRules: [
      'Mark Asian session high and low before 02:00 EST',
      'Wait for London open manipulation sweep of Asian high/low',
      'Confirm M5 MSS and enter on the sponsoring Order Block / FVG',
    ],
    exitRules: [
      'Target opposite side of Asian range first (1:2 R:R minimum)',
      'Hold 30% runner into NY open liquidity',
    ],
    invalidationRule: 'Candle close beyond the manipulated London swing extreme.',
  },
];

const DEFAULT_CHECKLISTS: NonNullable<TradingPlanData['checklists']> = {
  preMarket: [
    { id: 'pm1', text: 'Reviewed red-folder high-impact economic calendar events (CPI, NFP, FOMC)', checked: false },
    { id: 'pm2', text: 'Marked HTF Daily/4H Bias, PDH/PDL, and Primary Draw on Liquidity', checked: false },
    { id: 'pm3', text: 'Confirmed mental clarity, rested state, and zero urge to recover prior losses', checked: false },
  ],
  preEntry: [
    { id: 'pe1', text: 'Price is inside an active Killzone / Playbook session window', checked: false },
    { id: 'pe2', text: 'Liquidity sweep + MSS displacement confirmed before placing order', checked: false },
    { id: 'pe3', text: 'Position size calculated strictly within Max Risk Per Trade %', checked: false },
    { id: 'pe4', text: 'Clear invalidation candle-close level and minimum 1:2 R:R to DOL', checked: false },
  ],
  duringTrade: [
    { id: 'dt1', text: 'Stop Loss placed in broker immediately — never widen SL', checked: false },
    { id: 'dt2', text: 'Follow predefined partial TP & break-even management rules without interference', checked: false },
  ],
  postSession: [
    { id: 'ps1', text: 'Logged every executed trade in Trading Journal with playbook & mistake tags', checked: false },
    { id: 'ps2', text: 'Uploaded chart markup and wrote 1 concrete lesson for tomorrow', checked: false },
  ],
};

const DEFAULT_PLAN: TradingPlanData = {
  goals:
    'Protect capital first. Execute only A+ and A Playbook setups aligned with higher-timeframe Draw on Liquidity, aiming for consistent 4–8% monthly compounding with <3% peak drawdown.',
  entryRules:
    '1. HTF Bias & DOL clearly identified.\n2. Wait for Liquidity Sweep (BSL/SSL or Asian Range).\n3. Require clean MSS with displacement.\n4. Enter at Discount/Premium FVG CE or Order Block with >= 1:2 R:R.',
  riskRules:
    '• Hard Stop Loss on every position — never widen.\n• Max 1.0% risk per trade (0.5% during drawdown).\n• Stop trading immediately after 2 consecutive losses or hitting daily loss limit.\n• Zero entries 15 minutes before/after red-folder USD news.',
  preMarketRoutine:
    'Mark Weekly/Daily highs & lows, Asian range, and Economic Calendar 30 minutes before London or NY Killzone. Write one-sentence directional bias before looking at M5/M1.',
  postLossProtocol:
    'After any losing trade: step away for 15 minutes, tag mistakes honestly in the Journal, and never double lot size to recover.',
  riskLimits: {
    maxRiskPerTradePct: 1.0,
    maxDailyLossPct: 2.5,
    maxWeeklyLossPct: 5.0,
    maxTradesPerDay: 3,
    dailyProfitTargetPct: 3.0,
    accountSizeUsd: 10000,
  },
  playbooks: DEFAULT_PLAYBOOKS,
  checklists: DEFAULT_CHECKLISTS,
};

function normalizePlan(raw: Partial<TradingPlanData> | null | undefined): TradingPlanData {
  if (!raw) return DEFAULT_PLAN;
  return {
    goals: raw.goals || DEFAULT_PLAN.goals,
    entryRules: raw.entryRules || DEFAULT_PLAN.entryRules,
    riskRules: raw.riskRules || DEFAULT_PLAN.riskRules,
    preMarketRoutine: raw.preMarketRoutine ?? DEFAULT_PLAN.preMarketRoutine,
    postLossProtocol: raw.postLossProtocol ?? DEFAULT_PLAN.postLossProtocol,
    riskLimits: {
      maxRiskPerTradePct: raw.riskLimits?.maxRiskPerTradePct ?? 1.0,
      maxDailyLossPct: raw.riskLimits?.maxDailyLossPct ?? 2.5,
      maxWeeklyLossPct: raw.riskLimits?.maxWeeklyLossPct ?? 5.0,
      maxTradesPerDay: raw.riskLimits?.maxTradesPerDay ?? 3,
      dailyProfitTargetPct: raw.riskLimits?.dailyProfitTargetPct ?? 3.0,
      accountSizeUsd: raw.riskLimits?.accountSizeUsd ?? 10000,
    },
    playbooks: raw.playbooks && raw.playbooks.length > 0 ? raw.playbooks : DEFAULT_PLAYBOOKS,
    checklists: {
      preMarket: raw.checklists?.preMarket ?? DEFAULT_CHECKLISTS.preMarket,
      preEntry: raw.checklists?.preEntry ?? DEFAULT_CHECKLISTS.preEntry,
      duringTrade: raw.checklists?.duringTrade ?? DEFAULT_CHECKLISTS.duringTrade,
      postSession: raw.checklists?.postSession ?? DEFAULT_CHECKLISTS.postSession,
    },
  };
}

function fmtMoney(v: number): string {
  const abs = Math.abs(v).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  if (v > 0) return `+$${abs}`;
  if (v < 0) return `-$${abs}`;
  return `$${abs}`;
}

export const TradingPlanView: React.FC<{ trades?: JournalTrade[] }> = ({ trades = [] }) => {
  const [tab, setTab] = useState<PlanTab>('playbooks');
  const [plan, setPlan] = useState<TradingPlanData>(DEFAULT_PLAN);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  // Playbook Editor Modal
  const [pbModalOpen, setPbModalOpen] = useState(false);
  const [editingPbId, setEditingPbId] = useState<string | null>(null);
  const [pbDraft, setPbDraft] = useState<{
    name: string;
    category: string;
    markets: string;
    timeframes: string;
    session: string;
    minRr: string;
    description: string;
    entryRulesText: string;
    exitRulesText: string;
    invalidationRule: string;
  }>({
    name: '',
    category: 'ICT Intraday',
    markets: 'XAUUSD, EURUSD',
    timeframes: '1H / 15m / 5m',
    session: 'New York',
    minRr: '2.0',
    description: '',
    entryRulesText: '',
    exitRulesText: '',
    invalidationRule: '',
  });

  // New checklist input per stage
  const [newCheckText, setNewCheckText] = useState<Record<ChecklistStageKey, string>>({
    preMarket: '',
    preEntry: '',
    duringTrade: '',
    postSession: '',
  });

  useEffect(() => {
    let active = true;
    apiFetch<{ plan: Partial<TradingPlanData> | null }>('/api/workspace/plan')
      .then((res) => {
        if (!active) return;
        setPlan(normalizePlan(res.plan));
      })
      .catch(() => {})
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, []);

  async function savePlan(nextPlan: TradingPlanData, successMsg = 'Trading Plan & Playbooks saved.') {
    setPlan(nextPlan);
    setSaving(true);
    try {
      await apiFetch('/api/workspace/plan', {
        method: 'POST',
        body: JSON.stringify({ plan: nextPlan }),
      });
      setNotice(successMsg);
    } catch {
      setNotice('Unable to persist plan right now. Please try again.');
    } finally {
      setSaving(false);
    }
  }

  // Live Playbook performance map pulled directly from user's real Journal trades
  const playbookStatsMap = useMemo(() => {
    const map = new Map<
      string,
      { trades: number; winRate: number; profitFactor: number | null; avgR: number | null; netPnl: number }
    >();
    const analytics = computeTradeAnalytics(trades);
    analytics.byPlaybook.forEach((row) => {
      map.set(row.label.toLowerCase(), {
        trades: row.trades,
        winRate: row.winRate,
        profitFactor: row.profitFactor,
        avgR: row.avgR,
        netPnl: row.netPnl,
      });
    });
    return map;
  }, [trades]);

  // Live Daily Guardrails Compliance against today's logged trades
  const todayCompliance = useMemo(() => {
    const today = new Date().toISOString().slice(0, 10);
    const todayTrades = trades.filter((t) => (t.trade_date || '').slice(0, 10) === today);
    const todayPnl = todayTrades.reduce((s, t) => s + Number(t.pnl || 0), 0);
    const limits = plan.riskLimits || DEFAULT_PLAN.riskLimits!;
    const acc = Math.max(100, limits.accountSizeUsd || 10000);
    const dailyLossUsdLimit = (acc * limits.maxDailyLossPct) / 100;
    const dailyProfitUsdTarget = (acc * limits.dailyProfitTargetPct) / 100;

    const tradesCount = todayTrades.length;
    const tradesStatus =
      tradesCount > limits.maxTradesPerDay
        ? 'Breached'
        : tradesCount === limits.maxTradesPerDay
        ? 'Caution'
        : 'Within Limits';

    const lossUsed = todayPnl < 0 ? Math.abs(todayPnl) : 0;
    const lossStatus =
      lossUsed >= dailyLossUsdLimit
        ? 'Breached'
        : lossUsed >= dailyLossUsdLimit * 0.7
        ? 'Caution'
        : 'Within Limits';

    return {
      todayTradesCount: tradesCount,
      todayPnl,
      dailyLossUsdLimit,
      dailyProfitUsdTarget,
      tradesStatus,
      lossStatus,
      targetHit: todayPnl >= dailyProfitUsdTarget && dailyProfitUsdTarget > 0,
    };
  }, [trades, plan.riskLimits]);

  // Checklist Readiness %
  const checklistReadiness = useMemo(() => {
    const stages = plan.checklists || DEFAULT_CHECKLISTS;
    const all = [...stages.preMarket, ...stages.preEntry, ...stages.duringTrade, ...stages.postSession];
    const done = all.filter((i) => i.checked).length;
    return { done, total: all.length, pct: all.length ? Math.round((done / all.length) * 100) : 0 };
  }, [plan.checklists]);

  function openNewPlaybook() {
    setEditingPbId(null);
    setPbDraft({
      name: '',
      category: 'ICT Intraday',
      markets: 'XAUUSD, EURUSD, NAS100',
      timeframes: '1H / 15m / 5m',
      session: 'New York',
      minRr: '2.0',
      description: '',
      entryRulesText: '',
      exitRulesText: '',
      invalidationRule: '',
    });
    setPbModalOpen(true);
  }

  function openEditPlaybook(pb: TradingPlaybook) {
    setEditingPbId(pb.id);
    setPbDraft({
      name: pb.name,
      category: pb.category,
      markets: pb.markets,
      timeframes: pb.timeframes,
      session: pb.session,
      minRr: String(pb.minRr),
      description: pb.description,
      entryRulesText: pb.entryRules.join('\n'),
      exitRulesText: pb.exitRules.join('\n'),
      invalidationRule: pb.invalidationRule,
    });
    setPbModalOpen(true);
  }

  async function handleSavePlaybook(e: React.FormEvent) {
    e.preventDefault();
    if (!pbDraft.name.trim()) return;
    const item: TradingPlaybook = {
      id: editingPbId || `pb_${Date.now()}`,
      name: pbDraft.name.trim(),
      category: pbDraft.category.trim() || 'Institutional',
      markets: pbDraft.markets.trim(),
      timeframes: pbDraft.timeframes.trim(),
      session: pbDraft.session.trim(),
      minRr: Math.max(0.5, Number(pbDraft.minRr) || 2),
      description: pbDraft.description.trim(),
      entryRules: pbDraft.entryRulesText
        .split('\n')
        .map((l) => l.trim())
        .filter(Boolean),
      exitRules: pbDraft.exitRulesText
        .split('\n')
        .map((l) => l.trim())
        .filter(Boolean),
      invalidationRule: pbDraft.invalidationRule.trim(),
    };
    const existing = plan.playbooks || [];
    const nextPlaybooks = editingPbId
      ? existing.map((p) => (p.id === editingPbId ? item : p))
      : [item, ...existing];
    setPbModalOpen(false);
    await savePlan({ ...plan, playbooks: nextPlaybooks }, `Saved Playbook "${item.name}".`);
  }

  async function handleDeletePlaybook(id: string) {
    const nextPlaybooks = (plan.playbooks || []).filter((p) => p.id !== id);
    await savePlan({ ...plan, playbooks: nextPlaybooks }, 'Playbook removed.');
  }

  function toggleChecklistItem(stage: ChecklistStageKey, itemId: string) {
    const checklists = plan.checklists || DEFAULT_CHECKLISTS;
    const next: TradingPlanData = {
      ...plan,
      checklists: {
        ...checklists,
        [stage]: checklists[stage].map((i) => (i.id === itemId ? { ...i, checked: !i.checked } : i)),
      },
    };
    void savePlan(next, 'Checklist progress saved.');
  }

  function addChecklistItem(stage: ChecklistStageKey) {
    const text = newCheckText[stage].trim();
    if (!text) return;
    const checklists = plan.checklists || DEFAULT_CHECKLISTS;
    const newItem: ChecklistStageItem = { id: `${stage}_${Date.now()}`, text, checked: false };
    const next: TradingPlanData = {
      ...plan,
      checklists: { ...checklists, [stage]: [...checklists[stage], newItem] },
    };
    setNewCheckText((prev) => ({ ...prev, [stage]: '' }));
    void savePlan(next, 'Checklist rule added.');
  }

  function deleteChecklistItem(stage: ChecklistStageKey, itemId: string) {
    const checklists = plan.checklists || DEFAULT_CHECKLISTS;
    const next: TradingPlanData = {
      ...plan,
      checklists: { ...checklists, [stage]: checklists[stage].filter((i) => i.id !== itemId) },
    };
    void savePlan(next, 'Checklist item removed.');
  }

  function resetAllChecklists() {
    const checklists = plan.checklists || DEFAULT_CHECKLISTS;
    const resetStage = (items: ChecklistStageItem[]) => items.map((i) => ({ ...i, checked: false }));
    const next: TradingPlanData = {
      ...plan,
      checklists: {
        preMarket: resetStage(checklists.preMarket),
        preEntry: resetStage(checklists.preEntry),
        duringTrade: resetStage(checklists.duringTrade),
        postSession: resetStage(checklists.postSession),
      },
    };
    void savePlan(next, 'All daily checklist items reset for the next session.');
  }

  const limits = plan.riskLimits || DEFAULT_PLAN.riskLimits!;
  const playbooks = plan.playbooks || DEFAULT_PLAYBOOKS;
  const checklists = plan.checklists || DEFAULT_CHECKLISTS;

  return (
    <div className="space-y-5">
      {/* Header + Sub-Nav */}
      <div className="rounded-2xl bg-white border border-slate-200 shadow-xs p-4 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-bold tracking-tight text-slate-950">Trading Plan, Playbooks & Risk Guardrails</h2>
          <p className="text-xs text-slate-500 mt-0.5">
            Define A+ setup playbooks synced with live Journal performance, hard risk guardrails, and 4-stage checklists.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <div className="inline-flex rounded-lg border border-slate-200 bg-[#FAF9F6] p-0.5">
            {(
              [
                ['playbooks', 'Playbooks Library', BookOpen],
                ['rules', 'Rules & Guardrails', ShieldCheck],
                ['checklists', `Checklists (${checklistReadiness.pct}%)`, ClipboardCheck],
              ] as const
            ).map(([id, label, Icon]) => (
              <button
                key={id}
                type="button"
                onClick={() => setTab(id)}
                className={`inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-md cursor-pointer transition-colors ${
                  tab === id ? 'bg-[#0B0F19] text-[#E5A93C]' : 'text-slate-600 hover:text-slate-950'
                }`}
              >
                <Icon className="w-3.5 h-3.5" />
                {label}
              </button>
            ))}
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

      {loading ? (
        <div className="rounded-2xl bg-white border border-slate-200 p-8 text-center text-xs text-slate-500">
          Loading trading plan & playbooks...
        </div>
      ) : tab === 'playbooks' ? (
        <div className="space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="text-xs text-slate-600">
              {playbooks.length} active playbooks · Live metrics auto-synced from {trades.length} logged journal trades
            </div>
            <button
              type="button"
              onClick={openNewPlaybook}
              className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-semibold rounded-lg bg-[#0B0F19] text-[#E5A93C] hover:bg-slate-900 cursor-pointer"
            >
              <Plus className="w-3.5 h-3.5" />
              New Playbook
            </button>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {playbooks.map((pb) => {
              const live = playbookStatsMap.get(pb.name.toLowerCase());
              return (
                <div
                  key={pb.id}
                  className="rounded-2xl bg-white border border-slate-200 shadow-xs overflow-hidden flex flex-col justify-between"
                >
                  <div className="p-5 space-y-4">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <div className="text-[11px] font-semibold uppercase tracking-wider text-[#B45309]">
                          {pb.category} · Min 1:{pb.minRr} R:R
                        </div>
                        <h3 className="text-base font-bold text-slate-950 mt-0.5">{pb.name}</h3>
                        <p className="text-xs text-slate-500 mt-0.5">
                          {pb.markets} · {pb.timeframes} · {pb.session}
                        </p>
                      </div>
                      <div className="flex items-center gap-1">
                        <button
                          type="button"
                          onClick={() => openEditPlaybook(pb)}
                          className="p-1.5 rounded-lg text-slate-500 hover:text-[#B45309] hover:bg-amber-50 cursor-pointer"
                          title="Edit playbook"
                        >
                          <Edit3 className="w-4 h-4" />
                        </button>
                        <button
                          type="button"
                          onClick={() => handleDeletePlaybook(pb.id)}
                          className="p-1.5 rounded-lg text-slate-400 hover:text-rose-600 hover:bg-rose-50 cursor-pointer"
                          title="Delete playbook"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </div>

                    {pb.description && <p className="text-xs text-slate-700 leading-relaxed">{pb.description}</p>}

                    {/* Live Journal Sync Strip */}
                    <div className="grid grid-cols-5 gap-2 p-3 rounded-xl bg-[#0B0F19] text-white text-center">
                      <div>
                        <div className="text-[9px] uppercase text-slate-400">Trades</div>
                        <div className="text-xs font-bold font-mono tabular-nums mt-0.5">{live ? live.trades : 0}</div>
                      </div>
                      <div>
                        <div className="text-[9px] uppercase text-slate-400">Win %</div>
                        <div className="text-xs font-bold font-mono tabular-nums mt-0.5">
                          {live ? `${live.winRate.toFixed(0)}%` : '—'}
                        </div>
                      </div>
                      <div>
                        <div className="text-[9px] uppercase text-slate-400">PF</div>
                        <div className="text-xs font-bold font-mono tabular-nums mt-0.5">
                          {live && live.profitFactor !== null
                            ? live.profitFactor >= 99
                              ? '∞'
                              : live.profitFactor.toFixed(2)
                            : '—'}
                        </div>
                      </div>
                      <div>
                        <div className="text-[9px] uppercase text-slate-400">Avg R</div>
                        <div className="text-xs font-bold font-mono tabular-nums mt-0.5">
                          {live && live.avgR !== null ? `${live.avgR >= 0 ? '+' : ''}${live.avgR.toFixed(1)}R` : '—'}
                        </div>
                      </div>
                      <div>
                        <div className="text-[9px] uppercase text-slate-400">Net P&L</div>
                        <div
                          className={`text-xs font-bold font-mono tabular-nums mt-0.5 ${
                            live ? (live.netPnl >= 0 ? 'text-[#E5A93C]' : 'text-rose-400') : 'text-slate-400'
                          }`}
                        >
                          {live ? fmtMoney(live.netPnl) : '—'}
                        </div>
                      </div>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
                      <div className="p-3 rounded-xl bg-[#FAF9F6] border border-slate-200 space-y-1.5">
                        <div className="text-[11px] font-bold text-slate-900">Entry Criteria</div>
                        <ul className="space-y-1 text-[11px] text-slate-700">
                          {pb.entryRules.map((r, i) => (
                            <li key={i}>• {r}</li>
                          ))}
                        </ul>
                      </div>
                      <div className="p-3 rounded-xl bg-[#FAF9F6] border border-slate-200 space-y-1.5">
                        <div className="text-[11px] font-bold text-slate-900">Exit & Invalidation</div>
                        <ul className="space-y-1 text-[11px] text-slate-700">
                          {pb.exitRules.map((r, i) => (
                            <li key={i}>• {r}</li>
                          ))}
                        </ul>
                        {pb.invalidationRule && (
                          <div className="pt-1.5 border-t border-slate-200 text-[11px] text-rose-700 font-medium">
                            Invalidation: {pb.invalidationRule}
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      ) : tab === 'rules' ? (
        <div className="space-y-5">
          {/* Live Daily Guardrails Status Strip */}
          <div className="rounded-2xl bg-[#0B0F19] text-white border border-slate-800 p-5 space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <ShieldCheck className="w-4 h-4 text-[#E5A93C]" />
                <h3 className="text-sm font-bold">Live Daily Guardrails Compliance (Today&apos;s Journal)</h3>
              </div>
              <span className="text-xs font-mono text-slate-400">
                Today: {todayCompliance.todayTradesCount} trades · {fmtMoney(todayCompliance.todayPnl)}
              </span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div className="p-3.5 rounded-xl bg-slate-900/90 border border-slate-800 flex items-center justify-between">
                <div>
                  <div className="text-[10px] uppercase text-slate-400">Daily Trade Cap</div>
                  <div className="text-sm font-bold font-mono mt-0.5">
                    {todayCompliance.todayTradesCount} / {limits.maxTradesPerDay} trades
                  </div>
                </div>
                <span
                  className={`text-xs font-semibold ${
                    todayCompliance.tradesStatus === 'Breached'
                      ? 'text-rose-400'
                      : todayCompliance.tradesStatus === 'Caution'
                      ? 'text-[#E5A93C]'
                      : 'text-emerald-400'
                  }`}
                >
                  {todayCompliance.tradesStatus}
                </span>
              </div>

              <div className="p-3.5 rounded-xl bg-slate-900/90 border border-slate-800 flex items-center justify-between">
                <div>
                  <div className="text-[10px] uppercase text-slate-400">Daily Loss Guardrail</div>
                  <div className="text-sm font-bold font-mono mt-0.5">
                    -${todayCompliance.dailyLossUsdLimit.toFixed(0)} ({limits.maxDailyLossPct}%)
                  </div>
                </div>
                <span
                  className={`text-xs font-semibold ${
                    todayCompliance.lossStatus === 'Breached'
                      ? 'text-rose-400'
                      : todayCompliance.lossStatus === 'Caution'
                      ? 'text-[#E5A93C]'
                      : 'text-emerald-400'
                  }`}
                >
                  {todayCompliance.lossStatus}
                </span>
              </div>

              <div className="p-3.5 rounded-xl bg-slate-900/90 border border-slate-800 flex items-center justify-between">
                <div>
                  <div className="text-[10px] uppercase text-slate-400">Daily Profit Target</div>
                  <div className="text-sm font-bold font-mono mt-0.5">
                    +${todayCompliance.dailyProfitUsdTarget.toFixed(0)} ({limits.dailyProfitTargetPct}%)
                  </div>
                </div>
                <span className={`text-xs font-semibold ${todayCompliance.targetHit ? 'text-[#E5A93C]' : 'text-slate-300'}`}>
                  {todayCompliance.targetHit ? 'Target Reached' : 'In Progress'}
                </span>
              </div>
            </div>
          </div>

          {/* Numeric Hard Guardrails Editor */}
          <div className="rounded-2xl bg-white border border-slate-200 shadow-xs p-5 space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-bold text-slate-950">Numeric Risk Guardrails</h3>
              <button
                type="button"
                onClick={() => savePlan(plan)}
                disabled={saving}
                className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-semibold rounded-lg bg-[#0B0F19] text-[#E5A93C] hover:bg-slate-900 cursor-pointer disabled:opacity-50"
              >
                <Save className="w-3.5 h-3.5" />
                {saving ? 'Saving...' : 'Save Plan'}
              </button>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
              {(
                [
                  ['accountSizeUsd', 'Account Size ($)', 500],
                  ['maxRiskPerTradePct', 'Max Risk/Trade (%)', 0.25],
                  ['maxDailyLossPct', 'Max Daily Loss (%)', 0.5],
                  ['maxWeeklyLossPct', 'Max Weekly Loss (%)', 0.5],
                  ['maxTradesPerDay', 'Max Trades / Day', 1],
                  ['dailyProfitTargetPct', 'Daily Target (%)', 0.5],
                ] as const
              ).map(([field, label, step]) => (
                <div key={field}>
                  <label className="block text-[11px] font-semibold text-slate-600 mb-1">{label}</label>
                  <input
                    type="number"
                    step={step}
                    value={limits[field]}
                    onChange={(e) =>
                      setPlan((prev) => ({
                        ...prev,
                        riskLimits: { ...(prev.riskLimits || DEFAULT_PLAN.riskLimits!), [field]: Number(e.target.value) },
                      }))
                    }
                    className="w-full px-2.5 py-2 text-xs font-mono font-bold rounded-lg border border-slate-300"
                  />
                </div>
              ))}
            </div>
          </div>

          {/* Written Institutional Plan */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <div className="rounded-2xl bg-white border border-slate-200 shadow-xs p-5 space-y-3">
              <label className="block text-xs font-bold text-slate-950">Trading Goals & Edge Mandate</label>
              <textarea
                rows={4}
                value={plan.goals}
                onChange={(e) => setPlan((p) => ({ ...p, goals: e.target.value }))}
                className="w-full px-3 py-2 text-xs rounded-xl border border-slate-300 focus:border-amber-500 focus:outline-none leading-relaxed"
              />
              <label className="block text-xs font-bold text-slate-950 pt-2">Pre-Market Routine</label>
              <textarea
                rows={4}
                value={plan.preMarketRoutine || ''}
                onChange={(e) => setPlan((p) => ({ ...p, preMarketRoutine: e.target.value }))}
                className="w-full px-3 py-2 text-xs rounded-xl border border-slate-300 focus:border-amber-500 focus:outline-none leading-relaxed"
              />
            </div>

            <div className="rounded-2xl bg-white border border-slate-200 shadow-xs p-5 space-y-3">
              <label className="block text-xs font-bold text-slate-950">Entry & Execution Standards</label>
              <textarea
                rows={4}
                value={plan.entryRules}
                onChange={(e) => setPlan((p) => ({ ...p, entryRules: e.target.value }))}
                className="w-full px-3 py-2 text-xs rounded-xl border border-slate-300 focus:border-amber-500 focus:outline-none leading-relaxed"
              />
              <label className="block text-xs font-bold text-slate-950 pt-2">Risk Rules & Post-Loss Circuit Breaker</label>
              <textarea
                rows={4}
                value={plan.riskRules}
                onChange={(e) => setPlan((p) => ({ ...p, riskRules: e.target.value }))}
                className="w-full px-3 py-2 text-xs rounded-xl border border-slate-300 focus:border-amber-500 focus:outline-none leading-relaxed"
              />
            </div>
          </div>
        </div>
      ) : (
        /* 4-Stage Pre-Session Checklists */
        <div className="space-y-4">
          <div className="rounded-2xl bg-[#0B0F19] text-white border border-slate-800 p-5 flex flex-wrap items-center justify-between gap-4">
            <div className="space-y-1">
              <div className="text-[11px] uppercase tracking-wider text-slate-400 font-semibold">
                Session Readiness Score
              </div>
              <div className="flex items-baseline gap-2.5">
                <span className="text-2xl font-bold font-mono tabular-nums text-[#E5A93C]">
                  {checklistReadiness.pct}%
                </span>
                <span className="text-xs text-slate-300 font-mono">
                  {checklistReadiness.done} / {checklistReadiness.total} rules verified
                </span>
              </div>
            </div>
            <div className="flex items-center gap-3">
              <div className="w-40 h-2 rounded-full bg-slate-800 overflow-hidden hidden sm:block">
                <div className="h-full bg-[#E5A93C]" style={{ width: `${checklistReadiness.pct}%` }} />
              </div>
              <button
                type="button"
                onClick={resetAllChecklists}
                className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold rounded-lg bg-slate-900 border border-slate-700 text-slate-200 hover:border-amber-400 cursor-pointer"
              >
                <RotateCcw className="w-3.5 h-3.5" />
                Reset Daily Checks
              </button>
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {(
              [
                ['preMarket', '1. Pre-Market Prep', 'Complete before London or New York open'],
                ['preEntry', '2. Pre-Entry Confirmation', 'Verify every box before clicking Buy/Sell'],
                ['duringTrade', '3. During Trade Management', 'Eliminate emotional interference mid-trade'],
                ['postSession', '4. Post-Session Review', 'Close the feedback loop in your Journal'],
              ] as const
            ).map(([stageKey, title, subtitle]) => {
              const items = checklists[stageKey];
              const done = items.filter((i) => i.checked).length;
              return (
                <div key={stageKey} className="rounded-2xl bg-white border border-slate-200 shadow-xs p-5 space-y-3.5">
                  <div className="flex items-center justify-between">
                    <div>
                      <h3 className="text-sm font-bold text-slate-950">{title}</h3>
                      <p className="text-[11px] text-slate-500">{subtitle}</p>
                    </div>
                    <span className="text-xs font-mono font-bold text-[#B45309]">
                      {done}/{items.length}
                    </span>
                  </div>

                  <div className="space-y-2">
                    {items.map((item) => (
                      <div
                        key={item.id}
                        className={`flex items-start justify-between gap-2 p-2.5 rounded-xl border transition-colors ${
                          item.checked ? 'bg-emerald-50/50 border-emerald-200' : 'bg-[#FAF9F6] border-slate-200'
                        }`}
                      >
                        <button
                          type="button"
                          onClick={() => toggleChecklistItem(stageKey, item.id)}
                          className="flex items-start gap-2.5 text-left flex-1 cursor-pointer"
                        >
                          <CheckCircle2
                            className={`w-4 h-4 mt-0.5 shrink-0 ${
                              item.checked ? 'text-emerald-700' : 'text-slate-300'
                            }`}
                          />
                          <span
                            className={`text-xs leading-snug ${
                              item.checked ? 'text-slate-500 line-through' : 'text-slate-800 font-medium'
                            }`}
                          >
                            {item.text}
                          </span>
                        </button>
                        <button
                          type="button"
                          onClick={() => deleteChecklistItem(stageKey, item.id)}
                          className="text-slate-400 hover:text-rose-600 p-0.5 cursor-pointer"
                          aria-label="Delete rule"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    ))}
                  </div>

                  <div className="flex items-center gap-2 pt-1">
                    <input
                      type="text"
                      value={newCheckText[stageKey]}
                      onChange={(e) => setNewCheckText((prev) => ({ ...prev, [stageKey]: e.target.value }))}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') {
                          e.preventDefault();
                          addChecklistItem(stageKey);
                        }
                      }}
                      placeholder="Add custom rule..."
                      className="flex-1 px-3 py-1.5 text-xs rounded-lg border border-slate-200 focus:border-amber-500 focus:outline-none"
                    />
                    <button
                      type="button"
                      onClick={() => addChecklistItem(stageKey)}
                      className="px-3 py-1.5 text-xs font-semibold rounded-lg bg-[#0B0F19] text-[#E5A93C] hover:bg-slate-900 cursor-pointer"
                    >
                      Add
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Playbook Create / Edit Modal */}
      {pbModalOpen && (
        <div className="fixed inset-0 z-50 bg-slate-950/50 backdrop-blur-[1px] flex items-center justify-center p-4">
          <form
            onSubmit={handleSavePlaybook}
            className="bg-white w-full max-w-2xl max-h-[90vh] rounded-2xl border border-slate-200 shadow-2xl flex flex-col overflow-hidden"
          >
            <div className="bg-[#0B0F19] text-white px-6 py-4 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <AlertTriangle className="w-4 h-4 text-[#E5A93C]" />
                <h3 className="text-sm font-bold">{editingPbId ? 'Edit Playbook Model' : 'Create New Playbook'}</h3>
              </div>
              <button
                type="button"
                onClick={() => setPbModalOpen(false)}
                className="text-slate-400 hover:text-white cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="p-6 overflow-y-auto space-y-4 flex-1">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-[11px] font-semibold text-slate-600 mb-1">Playbook Name *</label>
                  <input
                    type="text"
                    required
                    value={pbDraft.name}
                    onChange={(e) => setPbDraft((d) => ({ ...d, name: e.target.value }))}
                    placeholder="ICT Silver Bullet FVG"
                    className="w-full px-3 py-2 text-xs font-semibold rounded-lg border border-slate-300"
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-semibold text-slate-600 mb-1">Category</label>
                  <input
                    type="text"
                    value={pbDraft.category}
                    onChange={(e) => setPbDraft((d) => ({ ...d, category: e.target.value }))}
                    className="w-full px-3 py-2 text-xs rounded-lg border border-slate-300"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                <div>
                  <label className="block text-[11px] font-semibold text-slate-600 mb-1">Markets</label>
                  <input
                    type="text"
                    value={pbDraft.markets}
                    onChange={(e) => setPbDraft((d) => ({ ...d, markets: e.target.value }))}
                    className="w-full px-2.5 py-1.5 text-xs rounded-lg border border-slate-300"
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-semibold text-slate-600 mb-1">Timeframes</label>
                  <input
                    type="text"
                    value={pbDraft.timeframes}
                    onChange={(e) => setPbDraft((d) => ({ ...d, timeframes: e.target.value }))}
                    className="w-full px-2.5 py-1.5 text-xs rounded-lg border border-slate-300"
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-semibold text-slate-600 mb-1">Session</label>
                  <input
                    type="text"
                    value={pbDraft.session}
                    onChange={(e) => setPbDraft((d) => ({ ...d, session: e.target.value }))}
                    className="w-full px-2.5 py-1.5 text-xs rounded-lg border border-slate-300"
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-semibold text-slate-600 mb-1">Min R:R</label>
                  <input
                    type="number"
                    step="0.1"
                    value={pbDraft.minRr}
                    onChange={(e) => setPbDraft((d) => ({ ...d, minRr: e.target.value }))}
                    className="w-full px-2.5 py-1.5 text-xs font-mono rounded-lg border border-slate-300"
                  />
                </div>
              </div>

              <div>
                <label className="block text-[11px] font-semibold text-slate-600 mb-1">Setup Thesis & Overview</label>
                <textarea
                  rows={2}
                  value={pbDraft.description}
                  onChange={(e) => setPbDraft((d) => ({ ...d, description: e.target.value }))}
                  className="w-full px-3 py-2 text-xs rounded-lg border border-slate-300"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-[11px] font-semibold text-slate-600 mb-1">Entry Rules (1 per line)</label>
                  <textarea
                    rows={4}
                    value={pbDraft.entryRulesText}
                    onChange={(e) => setPbDraft((d) => ({ ...d, entryRulesText: e.target.value }))}
                    className="w-full px-3 py-2 text-xs rounded-lg border border-slate-300"
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-semibold text-slate-600 mb-1">Exit Rules (1 per line)</label>
                  <textarea
                    rows={4}
                    value={pbDraft.exitRulesText}
                    onChange={(e) => setPbDraft((d) => ({ ...d, exitRulesText: e.target.value }))}
                    className="w-full px-3 py-2 text-xs rounded-lg border border-slate-300"
                  />
                </div>
              </div>

              <div>
                <label className="block text-[11px] font-semibold text-slate-600 mb-1">Invalidation Rule</label>
                <input
                  type="text"
                  value={pbDraft.invalidationRule}
                  onChange={(e) => setPbDraft((d) => ({ ...d, invalidationRule: e.target.value }))}
                  placeholder="Candle close beyond OB / swing low invalidates setup"
                  className="w-full px-3 py-2 text-xs rounded-lg border border-slate-300"
                />
              </div>
            </div>

            <div className="px-6 py-3.5 border-t border-slate-200 bg-[#FAF9F6] flex items-center justify-end gap-2">
              <button
                type="button"
                onClick={() => setPbModalOpen(false)}
                className="px-4 py-2 text-xs font-semibold rounded-lg border border-slate-200 bg-white text-slate-700 cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="submit"
                className="px-5 py-2 text-xs font-semibold rounded-lg bg-[#0B0F19] text-[#E5A93C] hover:bg-slate-900 cursor-pointer"
              >
                Save Playbook
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
};
