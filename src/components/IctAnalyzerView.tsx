import React, { useEffect, useState, useCallback } from 'react';
import {
  RefreshCw,
  Lock,
  ArrowUpRight,
  CheckCircle2,
  BookmarkPlus,
  Trash2,
  BookMarked,
  CandlestickChart,
  AlertTriangle,
  XCircle,
  Clock,
  ShieldAlert,
} from 'lucide-react';
import { apiFetch } from '../lib/api';
import {
  ANALYZER_TIMEFRAMES,
  MARKET_CATALOG_BY_SYM,
  MARKET_CATALOG_GROUPS,
  normalizeAnalyzerTimeframe,
  type AnalyzerTimeframe,
} from '../lib/tradingTimeframes';
import { LiveTradingViewChart } from './LiveTradingViewChart';
import { TradingViewMappedChart } from './TradingViewMappedChart';
import { LANDING_IMAGES } from '../assets/landingImages';
import {
  SUBSCRIPTION_PLAN_SPECS,
  computeCyclePricing,
  formatShortDate,
} from '../lib/subscriptions';
import type { BillingCycle, IctAnalysisResult, PdArrayItem, PublicConfig, User } from '../types';

interface IctAnalyzerViewProps {
  user: User;
  config: PublicConfig;
  symbol: string;
  timeframe: AnalyzerTimeframe;
  onSymbolChange: (symbol: string) => void;
  onTimeframeChange: (timeframe: AnalyzerTimeframe) => void;
  onOpenFreeChart: () => void;
  onUnlockClick: (cycle?: BillingCycle) => void;
}

interface SavedSetupItem {
  id: string;
  symbol: string;
  timeframe: string;
  bias: 'Bullish' | 'Bearish';
  entryZone: string;
  stopLoss: number;
  tp1: number;
  notes: string;
}

interface PlaybookItem {
  id: string;
  title: string;
  pair: string;
  timeframe: string;
  rulesSummary: string;
}

export const IctAnalyzerView: React.FC<IctAnalyzerViewProps> = ({
  user,
  config,
  symbol,
  timeframe,
  onSymbolChange,
  onTimeframeChange,
  onOpenFreeChart,
  onUnlockClick,
}) => {
  const [analysis, setAnalysis] = useState<IctAnalysisResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [chartViewMode, setChartViewMode] = useState<'split' | 'ict' | 'live'>('split');
  const [autoSync, setAutoSync] = useState(true);
  const [pdFilter, setPdFilter] = useState<'active' | 'all'>('active');

  const [savedSetups, setSavedSetups] = useState<SavedSetupItem[]>([]);
  const [playbooks, setPlaybooks] = useState<PlaybookItem[]>([]);
  const [playbookTitle, setPlaybookTitle] = useState('');
  const [playbookRules, setPlaybookRules] = useState('');
  const [cloudNotice, setCloudNotice] = useState('');
  const [selectedCycle, setSelectedCycle] = useState<BillingCycle>('monthly');

  const activeTimeframe = normalizeAnalyzerTimeframe(timeframe);

  const loadCloudData = useCallback(async () => {
    try {
      const [setupsRes, playbooksRes] = await Promise.all([
        apiFetch<{ setups: SavedSetupItem[] }>('/api/supabase/setups'),
        apiFetch<{ playbooks: PlaybookItem[] }>('/api/supabase/playbooks'),
      ]);
      setSavedSetups(setupsRes.setups || []);
      setPlaybooks(playbooksRes.playbooks || []);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to load saved setups and playbooks.');
    }
  }, []);

  useEffect(() => {
    if (user.hasAnalyzer) {
      loadCloudData();
    }
  }, [user.hasAnalyzer, loadCloudData]);

  const runScan = useCallback(
    async (forceReset = false) => {
      if (!user.hasAnalyzer) return;
      setLoading(true);
      setError('');
      try {
        const res = await apiFetch<{ analysis: IctAnalysisResult }>(
          `/api/analyzer/scan?symbol=${encodeURIComponent(symbol)}&timeframe=${encodeURIComponent(
            activeTimeframe
          )}${forceReset ? '&forceReset=true' : ''}`
        );
        setAnalysis(res.analysis);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Analysis failed');
      } finally {
        setLoading(false);
      }
    },
    [symbol, activeTimeframe, user.hasAnalyzer]
  );

  useEffect(() => {
    runScan(false);
  }, [runScan]);

  useEffect(() => {
    if (!user.hasAnalyzer || !autoSync) return;
    const intervalMs = activeTimeframe === '1M' ? 12000 : 25000;
    const id = setInterval(() => {
      runScan(false);
    }, intervalMs);
    return () => clearInterval(id);
  }, [user.hasAnalyzer, autoSync, activeTimeframe, runScan]);

  async function handleSaveSetup() {
    if (
      !analysis ||
      analysis.tradeVerdict === 'No Trade' ||
      !analysis.setup.entryZone ||
      analysis.setup.stopLoss == null ||
      analysis.setup.tp1 == null
    ) {
      return;
    }
    setError('');
    setCloudNotice('');
    try {
      await apiFetch('/api/supabase/setups', {
        method: 'POST',
        body: JSON.stringify({
          symbol: analysis.symbol,
          timeframe: analysis.timeframe,
          bias: analysis.dailyBias === 'Neutral' ? 'Bullish' : analysis.dailyBias,
          entryZone: analysis.setup.entryZone,
          stopLoss: analysis.setup.stopLoss,
          tp1: analysis.setup.tp1,
          notes: `${analysis.verdictHeadline} · ${analysis.structureShift} · ${analysis.premiumDiscount?.currentZone || ''} · R:R 1:${analysis.setup.rrRatio ?? '-'}`,
        }),
      });
      setCloudNotice(`Saved ${analysis.symbol} (${analysis.timeframe}) setup to your account.`);
      await loadCloudData();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save setup.');
    }
  }

  async function handleDeleteSetup(id: string) {
    setError('');
    try {
      await apiFetch(`/api/supabase/setups/${encodeURIComponent(id)}`, { method: 'DELETE' });
      await loadCloudData();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to remove saved setup.');
    }
  }

  async function handleCreatePlaybook(e: React.FormEvent) {
    e.preventDefault();
    if (!playbookTitle.trim() || !playbookRules.trim()) return;
    setError('');
    setCloudNotice('');
    try {
      await apiFetch('/api/supabase/playbooks', {
        method: 'POST',
        body: JSON.stringify({
          title: playbookTitle,
          pair: symbol,
          timeframe: activeTimeframe,
          rulesSummary: playbookRules,
        }),
      });
      setPlaybookTitle('');
      setPlaybookRules('');
      setCloudNotice('Strategy playbook saved to your account.');
      await loadCloudData();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save playbook.');
    }
  }

  async function handleDeletePlaybook(id: string) {
    setError('');
    try {
      await apiFetch(`/api/supabase/playbooks/${encodeURIComponent(id)}`, { method: 'DELETE' });
      await loadCloudData();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to remove playbook.');
    }
  }

  if (!user.hasAnalyzer) {
    const baseMonthlyUsd = Number(config.analyzerPriceUsd || 5.25);
    const usdKesRate = Number(config.usdKesRate || 130);
    const activePlan = computeCyclePricing(baseMonthlyUsd, usdKesRate, selectedCycle);
    const isExpired = user.analyzerSubscriptionStatus === 'expired';
    return (
      <div className="space-y-6">
        <div className="rounded-xl overflow-hidden border border-slate-900 bg-[#0B0F19] text-white">
          <div className="grid grid-cols-1 lg:grid-cols-12 items-stretch">
            <div className="lg:col-span-7 p-6 sm:p-8 lg:p-10 flex flex-col justify-between gap-6">
              <div className="space-y-4">
                <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.14em] text-[#E5A93C]">
                  <Lock className="w-3.5 h-3.5" />
                  <span>
                    ICT Strategy Market Analyzer · {isExpired ? 'Subscription Expired' : 'Pro Subscription'}
                  </span>
                </div>
                <h2 className="text-2xl sm:text-3xl font-bold tracking-tight text-white leading-tight">
                  Institutional Premium &amp; Discount PD Array Engine
                </h2>
                <p className="text-sm text-slate-300 leading-relaxed max-w-2xl">
                  Built on Inner Circle Trader (ICT) dealing-range structure and dual synchronized TradingView charts. Scan 1M scalps through 1W swing setups for 50% Equilibrium, Order Blocks, Fair Value Gaps, Breaker &amp; Mitigation Blocks, Buy/Sell-Side Liquidity sweeps, and Optimal Trade Entry zones.
                </p>
                {isExpired && user.analyzerExpiresAt && (
                  <div className="p-3 rounded-lg border border-amber-400/40 bg-amber-500/10 text-xs text-amber-200">
                    Your previous ICT Analyzer subscription ended on{' '}
                    <span className="font-mono font-semibold">{formatShortDate(user.analyzerExpiresAt)}</span>. Renew below to restore live scanner access immediately.
                  </div>
                )}
              </div>

              <div className="space-y-5">
                {/* Interactive Billing Cycle Selector */}
                <div className="grid grid-cols-3 gap-2.5">
                  {SUBSCRIPTION_PLAN_SPECS.map((plan) => {
                    const quote = computeCyclePricing(baseMonthlyUsd, usdKesRate, plan.cycle);
                    const isSelected = selectedCycle === plan.cycle;
                    return (
                      <button
                        key={plan.cycle}
                        type="button"
                        onClick={() => setSelectedCycle(plan.cycle)}
                        className={`p-3 rounded-lg border text-left transition-colors cursor-pointer ${
                          isSelected
                            ? 'bg-white/10 border-[#E5A93C] text-white'
                            : 'bg-white/[0.03] border-white/10 hover:border-white/25 text-slate-300'
                        }`}
                      >
                        <div className="flex items-center justify-between gap-1">
                          <span className="text-xs font-bold text-white">{plan.label}</span>
                          {plan.savingsBadge && (
                            <span className="text-[10px] font-mono font-bold text-[#E5A93C]">
                              -{plan.discountPct}%
                            </span>
                          )}
                        </div>
                        <div className="font-mono tabular-nums text-base font-bold text-white mt-1">
                          ${quote.amountUsd.toFixed(2)}
                          <span className="text-[11px] font-normal text-slate-400">{plan.periodSuffix}</span>
                        </div>
                        <div className="text-[10px] font-mono tabular-nums text-slate-400 mt-0.5">
                          {plan.durationDays} days · KES {quote.amountKes.toLocaleString()}
                        </div>
                      </button>
                    );
                  })}
                </div>

                <div className="flex flex-wrap items-baseline gap-x-6 gap-y-2 border-y border-white/10 py-3.5">
                  <div>
                    <div className="text-[11px] uppercase tracking-wider text-slate-400">
                      Selected Plan · {activePlan.spec.label} ({activePlan.spec.durationDays} Days)
                    </div>
                    <div className="flex items-baseline gap-2.5 mt-0.5">
                      <span className="text-2xl font-bold font-mono tabular-nums text-white">
                        ${activePlan.amountUsd.toFixed(2)}
                      </span>
                      <span className="text-sm font-mono tabular-nums text-[#E5A93C]">
                        KES {activePlan.amountKes.toLocaleString()}
                      </span>
                      <span className="text-xs font-mono text-slate-400">
                        (${activePlan.effectiveMonthlyUsd.toFixed(2)}/mo)
                      </span>
                    </div>
                  </div>
                  <div className="h-8 w-px bg-white/10 hidden sm:block" />
                  <div className="text-xs text-slate-300 space-y-0.5">
                    <div className="font-semibold text-white">Instant Automated Activation</div>
                    <div className="text-slate-400">Safaricom M-Pesa Daraja STK · USDT (TRC20/ERC20) · BTC</div>
                  </div>
                </div>

                <div className="flex flex-wrap items-center gap-3">
                  <button
                    type="button"
                    onClick={() => onUnlockClick(selectedCycle)}
                    className="px-6 py-3 bg-[#E5A93C] hover:bg-[#d6982b] text-[#090806] text-sm font-bold rounded-lg transition-colors inline-flex items-center gap-2 whitespace-nowrap shrink-0 cursor-pointer"
                  >
                    <span>
                      {isExpired ? 'Renew' : 'Subscribe'} ({activePlan.spec.label}) — ${activePlan.amountUsd.toFixed(2)}
                    </span>
                    <ArrowUpRight className="w-4 h-4" />
                  </button>
                  <button
                    type="button"
                    onClick={onOpenFreeChart}
                    className="px-5 py-3 border border-white/20 hover:bg-white/5 text-white text-sm font-semibold rounded-lg inline-flex items-center gap-2 whitespace-nowrap shrink-0 cursor-pointer transition-colors"
                  >
                    <CandlestickChart className="w-4 h-4 text-[#E5A93C]" />
                    <span>Open Free Live Chart</span>
                  </button>
                </div>
              </div>
            </div>

            <div className="lg:col-span-5 relative min-h-[260px] lg:min-h-[380px] border-t lg:border-t-0 lg:border-l border-white/10 overflow-hidden bg-slate-950">
              <img
                src={LANDING_IMAGES.analystIct3d}
                alt="Grid Pips ICT Strategy Market Analyzer workspace"
                referrerPolicy="no-referrer"
                className="w-full h-full object-cover object-center"
              />
              <div
                aria-hidden="true"
                className="absolute inset-0 bg-gradient-to-t from-[#0B0F19] via-[#0B0F19]/45 to-transparent"
              />
              <div className="absolute inset-x-0 bottom-0 p-5 sm:p-6 space-y-2">
                <div className="text-[11px] font-mono uppercase tracking-[0.14em] text-[#E5A93C]">
                  Dual Chart Architecture
                </div>
                <div className="text-sm font-semibold text-white">
                  Live TradingView Price Feed + Mapped PD Array Execution Overlay
                </div>
                <div className="text-xs text-slate-300 font-mono">
                  1M · 5M · 15M · 1H · 4H · 1D · 1W · Cloud Playbook Sync
                </div>
              </div>
            </div>
          </div>
        </div>

        <div className="bg-white border border-slate-200 rounded-xl overflow-hidden shadow-xs">
          <div className="px-6 py-4 border-b border-slate-200 flex flex-wrap items-center justify-between gap-2 bg-slate-50/70">
            <div>
              <h3 className="text-sm font-bold text-slate-950">Included in Your ICT Analyzer Subscription</h3>
              <p className="text-xs text-slate-500 mt-0.5">
                Calibrated to ICT methodology ({config.ictYoutubeChannelId}) with flexible Monthly, Quarterly (-10%), and Annual (-20%) billing.
              </p>
            </div>
            <span className="text-xs font-mono text-slate-500">70+ FX, Gold, Indices, Stocks &amp; Crypto Pairs</span>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 divide-y sm:divide-y-0 sm:divide-x divide-slate-200">
            <div className="p-5 space-y-1.5">
              <div className="text-[11px] font-mono font-semibold text-[#B45309]">01 · DEALING RANGE</div>
              <div className="text-sm font-bold text-slate-950">Premium &amp; Discount Matrix</div>
              <p className="text-xs text-slate-600 leading-relaxed">
                Automatic 50% equilibrium, deep discount longs, and premium short zones mapped across every timeframe.
              </p>
            </div>
            <div className="p-5 space-y-1.5">
              <div className="text-[11px] font-mono font-semibold text-[#B45309]">02 · PD ARRAYS</div>
              <div className="text-sm font-bold text-slate-950">Order Blocks &amp; FVG Detection</div>
              <p className="text-xs text-slate-600 leading-relaxed">
                Identifies unmitigated Bullish/Bearish Order Blocks, Fair Value Gaps, Breaker/Mitigation blocks, and Voids.
              </p>
            </div>
            <div className="p-5 space-y-1.5">
              <div className="text-[11px] font-mono font-semibold text-[#B45309]">03 · LIQUIDITY</div>
              <div className="text-sm font-bold text-slate-950">BSL / SSL &amp; Structure Shifts</div>
              <p className="text-xs text-slate-600 leading-relaxed">
                Plots Buy-Side and Sell-Side Liquidity pools, equal highs/lows, displacement candles, and MSS confirmations.
              </p>
            </div>
            <div className="p-5 space-y-1.5">
              <div className="text-[11px] font-mono font-semibold text-[#B45309]">04 · EXECUTION</div>
              <div className="text-sm font-bold text-slate-950">OTE Entry, SL &amp; TP Targets</div>
              <p className="text-xs text-slate-600 leading-relaxed">
                Generates exact 0.618–0.786 OTE entry coordinates, invalidation stops, multi-target take profits, and cloud setups.
              </p>
            </div>
          </div>
        </div>
      </div>
    );
  }

  const isCustomSymbol = !MARKET_CATALOG_BY_SYM[symbol];

  const pd = analysis?.premiumDiscount;
  const allPdArrays = analysis?.pdArrays || [];
  const filteredPdArrays =
    pdFilter === 'active'
      ? allPdArrays.filter((item) => item.status !== 'Mitigated')
      : allPdArrays;
  const premiumArrays = filteredPdArrays.filter(
    (item) => item.zone === 'Premium' || item.zone === 'Equilibrium'
  );
  const discountArrays = filteredPdArrays.filter((item) => item.zone === 'Discount');

  return (
    <div className="space-y-6">
      {/* Synchronized Live Chart + ICT Analyzer Toolbar */}
      <div className="bg-white border border-slate-200 rounded-xl p-4 flex flex-wrap items-center justify-between gap-4 shadow-xs">
        <div className="flex flex-wrap items-center gap-3">
          <select
            value={symbol}
            onChange={(e) => onSymbolChange(e.target.value)}
            aria-label="Select trading pair"
            className="px-3 py-2 text-sm font-mono font-semibold border border-slate-300 rounded-lg bg-white text-slate-900 placeholder:text-slate-400 focus:border-amber-500 focus:outline-none max-w-[230px]"
          >
            {isCustomSymbol && (
              <optgroup label="Custom">
                <option value={symbol}>{symbol}</option>
              </optgroup>
            )}
            {MARKET_CATALOG_GROUPS.map((group) => (
              <optgroup key={group.assetClass} label={group.label}>
                {group.items.map((item) => (
                  <option key={item.sym} value={item.sym}>
                    {item.sym} · {item.name}
                  </option>
                ))}
              </optgroup>
            ))}
          </select>

          <div className="flex flex-wrap items-center gap-1 p-1 bg-slate-100 border border-slate-200 rounded-lg">
            {ANALYZER_TIMEFRAMES.map((tf) => (
              <button
                key={tf}
                type="button"
                onClick={() => onTimeframeChange(tf)}
                className={`px-2.5 py-1.5 text-xs font-mono font-semibold rounded-md transition-colors cursor-pointer whitespace-nowrap shrink-0 ${
                  activeTimeframe === tf ? 'bg-[#0B0F19] text-white font-bold' : 'text-slate-600 hover:text-slate-950'
                }`}
              >
                {tf}
              </button>
            ))}
          </div>

          <div className="flex items-center gap-1 p-1 bg-slate-100 border border-slate-200 rounded-lg">
            {(
              [
                ['split', 'Dual Charts'],
                ['ict', 'ICT Mapped'],
                ['live', 'TradingView Only'],
              ] as const
            ).map(([mode, label]) => (
              <button
                key={mode}
                type="button"
                onClick={() => setChartViewMode(mode)}
                className={`px-2.5 py-1.5 text-xs font-semibold rounded-md transition-colors cursor-pointer whitespace-nowrap shrink-0 ${
                  chartViewMode === mode ? 'bg-[#0B0F19] text-white font-bold' : 'text-slate-600 hover:text-slate-950'
                }`}
              >
                {label}
              </button>
            ))}
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2.5">
          <button
            type="button"
            onClick={onOpenFreeChart}
            className="px-3 py-2 border border-slate-200 bg-slate-50 text-slate-700 text-xs font-semibold rounded-lg hover:border-amber-400 hover:text-slate-950 inline-flex items-center gap-1.5 cursor-pointer whitespace-nowrap shrink-0"
          >
            <CandlestickChart className="w-3.5 h-3.5 text-[#D97706]" />
            Free Full Chart
          </button>
          <button
            type="button"
            onClick={() => setAutoSync((v) => !v)}
            className={`px-3 py-2 border text-xs font-semibold rounded-lg cursor-pointer whitespace-nowrap shrink-0 ${
              autoSync
                ? 'border-emerald-200 bg-emerald-50 text-emerald-800'
                : 'border-slate-200 bg-white text-slate-600'
            }`}
          >
            {autoSync ? 'Live Sync On' : 'Live Sync Off'}
          </button>
          {analysis && analysis.tradeVerdict !== 'No Trade' && analysis.setup.entryZone && (
            <button
              type="button"
              onClick={handleSaveSetup}
              className="px-3.5 py-2 border border-slate-300 bg-white text-slate-800 text-xs font-semibold rounded-lg hover:bg-slate-50 inline-flex items-center gap-1.5 cursor-pointer whitespace-nowrap shrink-0"
            >
              <BookmarkPlus className="w-3.5 h-3.5 text-[#D97706]" />
              {analysis.tradeVerdict === 'Wait for Setup' ? 'Save Limit Setup' : 'Save Setup'}
            </button>
          )}
          {analysis?.lifecycle?.isLocked && (
            <button
              type="button"
              onClick={() => runScan(true)}
              disabled={loading}
              title={`Unlock current ${activeTimeframe} setup and re-evaluate fresh closed candles`}
              className="px-3 py-2 border border-amber-300 bg-amber-50 text-amber-900 text-xs font-semibold rounded-lg hover:bg-amber-100 inline-flex items-center gap-1.5 cursor-pointer whitespace-nowrap shrink-0"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
              Re-evaluate
            </button>
          )}
          <button
            type="button"
            onClick={() => runScan(false)}
            disabled={loading}
            className="px-4 py-2 bg-[#0B0F19] text-[#E5A93C] text-xs font-bold rounded-lg hover:bg-slate-800 inline-flex items-center gap-2 cursor-pointer whitespace-nowrap shrink-0"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
            Scan {activeTimeframe}
          </button>
        </div>
      </div>

      {error && (
        <div className="p-3 bg-rose-50 border border-rose-200 text-rose-700 text-xs rounded-lg flex flex-wrap items-center justify-between gap-2">
          <span>{error}</span>
          <button
            type="button"
            onClick={() => runScan(false)}
            className="px-3 py-1 bg-rose-700 text-white font-semibold rounded-md hover:bg-rose-800 cursor-pointer"
          >
            Retry Scan
          </button>
        </div>
      )}
      {cloudNotice && (
        <div className="p-3 bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs rounded-lg">
          {cloudNotice}
        </div>
      )}

      {!analysis && (
        <div className="space-y-5">
          <div className="bg-white border border-slate-200 rounded-xl p-4 text-slate-900 shadow-xs">
            <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
              <div>
                <h3 className="text-sm font-bold text-slate-950">
                  {symbol} ({activeTimeframe}) — Fresh TradingView Chart
                </h3>
                <p className="text-xs text-slate-500">
                  {loading
                    ? `Scanning ${symbol} (${activeTimeframe}) Premium/Discount & PD Array Matrix...`
                    : `Live interactive TradingView chart for ${symbol} (${activeTimeframe})`}
                </p>
              </div>
              <button
                type="button"
                onClick={() => runScan(false)}
                disabled={loading}
                className="px-3 py-1.5 bg-[#0B0F19] hover:bg-slate-800 text-[#E5A93C] text-xs font-semibold rounded-md inline-flex items-center gap-1.5 cursor-pointer"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
                {loading ? 'Scanning...' : 'Load ICT Map'}
              </button>
            </div>
            <LiveTradingViewChart
              symbol={symbol}
              timeframe={activeTimeframe}
              theme="light"
              heightClass="h-[460px]"
            />
          </div>
        </div>
      )}

      {analysis && (
        <>
          {/* 3-State Trade Verdict & Confluence Gate Banner */}
          <div
            className={`rounded-xl border p-5 space-y-4 shadow-xs ${
              analysis.tradeVerdict === 'Actionable Trade'
                ? 'bg-emerald-50/75 border-emerald-200'
                : analysis.tradeVerdict === 'Wait for Setup'
                ? 'bg-amber-50/80 border-amber-200'
                : 'bg-rose-50/75 border-rose-200'
            }`}
          >
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div className="flex items-start gap-3.5 min-w-0">
                <div
                  className={`w-10 h-10 rounded-lg border flex items-center justify-center shrink-0 mt-0.5 ${
                    analysis.tradeVerdict === 'Actionable Trade'
                      ? 'bg-emerald-100 border-emerald-300 text-emerald-700'
                      : analysis.tradeVerdict === 'Wait for Setup'
                      ? 'bg-amber-100 border-amber-300 text-amber-800'
                      : 'bg-rose-100 border-rose-300 text-rose-700'
                  }`}
                >
                  {analysis.tradeVerdict === 'Actionable Trade' ? (
                    <CheckCircle2 className="w-5 h-5" />
                  ) : analysis.tradeVerdict === 'Wait for Setup' ? (
                    <Clock className="w-5 h-5" />
                  ) : (
                    <ShieldAlert className="w-5 h-5" />
                  )}
                </div>
                <div className="space-y-1 min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <span
                      className={`text-[11px] font-mono font-bold uppercase tracking-[0.14em] ${
                        analysis.tradeVerdict === 'Actionable Trade'
                          ? 'text-emerald-800'
                          : analysis.tradeVerdict === 'Wait for Setup'
                          ? 'text-amber-800'
                          : 'text-rose-700'
                      }`}
                    >
                      ICT Confluence Gate · {analysis.symbol} ({analysis.timeframe})
                    </span>
                    <span className="text-xs font-mono text-slate-600">
                      {analysis.confluenceChecks.filter((c) => c.required && c.passed).length}/4 Hard Gates Passed
                    </span>
                  </div>
                  <h3 className="text-lg sm:text-xl font-bold text-slate-950 tracking-tight">
                    {analysis.verdictHeadline}
                  </h3>
                  <p className="text-xs sm:text-sm text-slate-700 leading-relaxed max-w-4xl">
                    {analysis.verdictSummary}
                  </p>
                </div>
              </div>

              <div className="flex flex-wrap items-center gap-2 shrink-0">
                {analysis.lifecycle && (
                  <span
                    className={`px-2.5 py-1.5 rounded-lg border text-[11px] font-mono font-semibold inline-flex items-center gap-1.5 ${
                      analysis.lifecycle.isLocked
                        ? 'bg-white border-amber-300 text-amber-900'
                        : 'bg-white border-slate-200 text-slate-700'
                    }`}
                  >
                    <Lock className="w-3 h-3" />
                    <span>
                      {analysis.lifecycle.isLocked
                        ? `Locked (${analysis.timeframe} Close ${analysis.lifecycle.lockedBarTime})`
                        : `Closed-Candle Scan (${analysis.lifecycle.lastClosedBarTime})`}
                    </span>
                  </span>
                )}
                <span
                  className={`px-3 py-1.5 rounded-lg border text-xs font-mono font-bold uppercase tracking-wider ${
                    analysis.tradeVerdict === 'Actionable Trade'
                      ? 'bg-emerald-600 text-white border-emerald-700'
                      : analysis.tradeVerdict === 'Wait for Setup'
                      ? 'bg-amber-100 text-amber-900 border-amber-300'
                      : 'bg-rose-100 text-rose-800 border-rose-300'
                  }`}
                >
                  {analysis.tradeVerdict === 'Actionable Trade'
                    ? analysis.setup.direction
                    : analysis.tradeVerdict === 'Wait for Setup'
                    ? 'Wait · Limit Only'
                    : 'Stand Aside'}
                </span>
              </div>
            </div>

            {/* Fractal Validation & Strict Candle-Close Invalidation Strip */}
            {analysis.lifecycle && (
              <div className="space-y-2.5">
                {analysis.lifecycle.lastTransitionEvent && (
                  <div className="px-3.5 py-2 rounded-lg bg-sky-50 border border-sky-200 text-xs text-sky-900 flex items-center gap-2">
                    <AlertTriangle className="w-3.5 h-3.5 text-sky-600 shrink-0" />
                    <span>
                      <strong className="text-slate-950">State Transition: </strong>
                      {analysis.lifecycle.lastTransitionEvent}
                    </span>
                  </div>
                )}

                <div className="grid grid-cols-1 md:grid-cols-3 gap-2.5">
                  <div className="rounded-lg border border-slate-200 bg-white p-3 space-y-1">
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-[10px] font-mono uppercase tracking-wider text-slate-500">
                        Validation Trigger
                      </span>
                      <span className="text-[10px] font-mono font-bold text-emerald-700">
                        {analysis.lifecycle.liveProximity}
                      </span>
                    </div>
                    <div className="text-xs font-mono font-bold text-slate-950">
                      {analysis.lifecycle.validationZone
                        ? `${analysis.lifecycle.validationZone}`
                        : 'Awaiting Qualified Setup'}
                    </div>
                    <p className="text-[11px] text-slate-600 leading-snug">
                      {analysis.lifecycle.validationRule}
                    </p>
                  </div>

                  <div className="rounded-lg border border-rose-200 bg-white p-3 space-y-1">
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-[10px] font-mono uppercase tracking-wider text-slate-500">
                        Strict Invalidation (Candle Close)
                      </span>
                      <span className="text-[10px] font-mono font-bold text-rose-700">
                        {analysis.timeframe} CLOSE ONLY
                      </span>
                    </div>
                    <div className="text-xs font-mono font-bold text-rose-700">
                      {analysis.lifecycle.invalidationLevel != null
                        ? `${analysis.dailyBias === 'Bullish' ? 'Close <' : 'Close >'} ${analysis.lifecycle.invalidationLevel}`
                        : 'None Locked'}
                    </div>
                    <p className="text-[11px] text-slate-600 leading-snug">
                      {analysis.lifecycle.invalidationRule} (wicks alone do not flip bias).
                    </p>
                  </div>

                  <div className="rounded-lg border border-amber-200 bg-white p-3 space-y-1">
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-[10px] font-mono uppercase tracking-wider text-slate-500">
                        Fractal Timeframe Lock
                      </span>
                      <span className="text-[10px] font-mono font-bold text-[#B45309]">
                        {analysis.timeframe} INDEPENDENT
                      </span>
                    </div>
                    <div className="text-xs font-mono font-bold text-slate-950 truncate">
                      {analysis.lifecycle.fractalRole}
                    </div>
                    <p className="text-[11px] text-slate-600 leading-snug">
                      {analysis.lifecycle.targetDolLevel != null
                        ? `Unlocks automatically on DOL hit (${analysis.lifecycle.targetDolLevel}), ${analysis.timeframe} invalidation close, or opposing closed MSS.`
                        : `Evaluates strictly on closed ${analysis.timeframe} candles (last close: ${analysis.lifecycle.lastClosedBarTime}).`}
                    </p>
                  </div>
                </div>
              </div>
            )}

            {/* 5-Gate Audit Grid */}
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-5 gap-2.5 pt-1">
              {analysis.confluenceChecks.map((check) => {
                const isHardFail = !check.passed && check.required;
                const isWaitWarn = !check.passed && !check.required;
                return (
                  <div
                    key={check.id}
                    className={`rounded-lg border p-3 space-y-1 bg-white ${
                      check.passed
                        ? 'border-emerald-200'
                        : isHardFail
                        ? 'border-rose-200'
                        : 'border-amber-200'
                    }`}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-[11px] font-bold text-slate-950 leading-tight">
                        {check.label}
                      </span>
                      {check.passed ? (
                        <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                      ) : isHardFail ? (
                        <XCircle className="w-4 h-4 text-rose-600 shrink-0" />
                      ) : (
                        <Clock className="w-4 h-4 text-amber-600 shrink-0" />
                      )}
                    </div>
                    <div className="flex items-center gap-1.5">
                      <span
                        className={`text-[10px] font-mono font-bold uppercase ${
                          check.passed
                            ? 'text-emerald-700'
                            : isHardFail
                            ? 'text-rose-700'
                            : 'text-amber-700'
                        }`}
                      >
                        {check.passed
                          ? 'PASS'
                          : isHardFail
                          ? 'BLOCKER FAILED'
                          : isWaitWarn
                          ? 'WAIT FOR RETRACE'
                          : 'FAIL'}
                      </span>
                    </div>
                    <p className="text-[11px] text-slate-600 leading-snug">{check.detail}</p>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Summary Strip */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-xs">
              <div className="text-xs text-slate-500">Verdict &amp; Bias ({analysis.timeframe})</div>
              <div
                className={`text-lg font-bold mt-1 ${
                  analysis.tradeVerdict === 'No Trade'
                    ? 'text-rose-600'
                    : analysis.tradeVerdict === 'Wait for Setup'
                    ? 'text-amber-700'
                    : analysis.dailyBias === 'Bullish'
                    ? 'text-emerald-700'
                    : 'text-rose-600'
                }`}
              >
                {analysis.tradeVerdict === 'No Trade'
                  ? 'No Trade · Stand Aside'
                  : analysis.tradeVerdict === 'Wait for Setup'
                  ? `Wait · ${analysis.setup.direction}`
                  : `${analysis.dailyBias} · ${analysis.setup.direction}`}
              </div>
              <div className="text-xs text-slate-500 mt-0.5 truncate">{analysis.structureShift}</div>
            </div>

            <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-xs">
              <div className="text-xs text-slate-500">Dealing Range Position</div>
              <div
                className={`text-lg font-bold font-mono tabular-nums mt-1 ${
                  pd?.currentZone === 'Premium'
                    ? 'text-rose-600'
                    : pd?.currentZone === 'Discount'
                    ? 'text-emerald-700'
                    : 'text-amber-700'
                }`}
              >
                {pd ? `${pd.currentZone} (${pd.currentPositionPct}%)` : 'Equilibrium'}
              </div>
              <div className="text-xs text-slate-500 mt-0.5 truncate">
                {pd?.quadrant || '50% Equilibrium'}
              </div>
            </div>

            <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-xs">
              <div className="text-xs text-slate-500">50% Equilibrium &amp; Draw</div>
              <div className="text-sm font-mono tabular-nums font-bold text-slate-950 mt-1">
                EQ {pd ? pd.equilibrium : '-'} · DOL {analysis.drawOnLiquidity?.price ?? analysis.bslLevel}
              </div>
              <div className="text-xs text-slate-500 mt-0.5 truncate">
                {analysis.drawOnLiquidity
                  ? `${analysis.drawOnLiquidity.side}: ${analysis.drawOnLiquidity.label}`
                  : `BSL ${analysis.bslLevel} / SSL ${analysis.sslLevel}`}
              </div>
            </div>

            <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-xs">
              <div className="text-xs text-slate-500">Real Risk : Reward to DOL</div>
              <div
                className={`text-lg font-bold font-mono tabular-nums mt-1 ${
                  analysis.tradeVerdict === 'No Trade'
                    ? 'text-rose-600'
                    : analysis.tradeVerdict === 'Wait for Setup'
                    ? 'text-amber-700'
                    : 'text-emerald-700'
                }`}
              >
                {analysis.tradeVerdict === 'No Trade'
                  ? 'Locked (No Trade)'
                  : `1 : ${analysis.setup.rrRatio}`}
              </div>
              <div className="text-xs text-slate-500 mt-0.5 truncate">
                {analysis.tradeVerdict === 'No Trade' && typeof analysis.setup.projectedRrToDol === 'number'
                  ? `Measured 1:${analysis.setup.projectedRrToDol.toFixed(2)} (Min 1:2.5 required)`
                  : analysis.activeKillzone}
              </div>
            </div>
          </div>

          {/* Premium vs. Discount Dealing Range Gauge */}
          {pd && (
            <div className="bg-white border border-slate-200 rounded-xl p-5 space-y-3 shadow-xs">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <h3 className="text-sm font-bold text-slate-950">
                    ICT Premium vs. Discount Dealing Range (50% Equilibrium)
                  </h3>
                  <p className="text-xs text-slate-500 mt-0.5">
                    Institutional delivery buys Bullish PD Arrays below 50% Equilibrium (Discount) and sells Bearish PD Arrays above 50% Equilibrium (Premium).
                  </p>
                </div>
                <div
                  className={`inline-flex items-center gap-1.5 text-xs font-semibold ${
                    analysis.tradeVerdict === 'No Trade'
                      ? 'text-rose-600'
                      : pd.alignedWithBias
                      ? 'text-emerald-700'
                      : 'text-amber-700'
                  }`}
                >
                  {analysis.tradeVerdict === 'No Trade' ? (
                    <XCircle className="w-4 h-4 text-rose-600 shrink-0" />
                  ) : pd.alignedWithBias ? (
                    <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                  ) : (
                    <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0" />
                  )}
                  <span>
                    {analysis.tradeVerdict === 'No Trade'
                      ? `Stand Aside · No Trade (${pd.currentZone})`
                      : pd.alignedWithBias
                      ? `Aligned (${analysis.dailyBias} in ${pd.currentZone})`
                      : `Wait · Limit Only (${analysis.dailyBias} Bias while in ${pd.currentZone})`}
                  </span>
                </div>
              </div>

              {/* Dealing Range Horizontal Bar */}
              <div className="space-y-1.5 pt-1">
                <div className="flex items-center justify-between text-xs font-mono tabular-nums text-slate-600">
                  <span>0% Discount Low · {pd.rangeLow}</span>
                  <span className="font-bold text-slate-950">50% Equilibrium · {pd.equilibrium}</span>
                  <span>100% Premium High · {pd.rangeHigh}</span>
                </div>

                <div className="relative h-6 w-full rounded-md overflow-hidden border border-slate-200 flex">
                  <div
                    className="w-1/2 h-full bg-emerald-50 border-r border-dashed border-slate-400 flex items-center pl-3 text-xs font-semibold text-emerald-800"
                    title="Discount Zone (0% - 50%)"
                  >
                    Discount Zone (Buy PD Arrays)
                  </div>
                  <div
                    className="w-1/2 h-full bg-rose-50 flex items-center justify-end pr-3 text-xs font-semibold text-rose-800"
                    title="Premium Zone (50% - 100%)"
                  >
                    Premium Zone (Sell PD Arrays)
                  </div>

                  {/* OTE Sweet Spot Band (shown when bias is active) */}
                  {analysis.tradeVerdict !== 'No Trade' && (
                    <div
                      className="absolute top-0 bottom-0 bg-amber-300/40 border-x border-amber-500/70 pointer-events-none"
                      style={
                        analysis.oteLevels.zone === 'Discount'
                          ? { left: '21.4%', width: '16.8%' }
                          : { left: '61.8%', width: '16.8%' }
                      }
                      title={`OTE Reference (0.618 - 0.786 ${analysis.oteLevels.zone || ''})`}
                    />
                  )}

                  {/* Current Price Marker */}
                  <div
                    className="absolute top-0 bottom-0 w-1 bg-[#0B0F19] shadow-xs z-10 pointer-events-none"
                    style={{ left: `${Math.min(99, Math.max(1, pd.currentPositionPct))}%` }}
                  />
                </div>

                <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-slate-600">
                  <span>{pd.guidance}</span>
                  <span className="font-mono tabular-nums text-slate-500">
                    OTE 0.618–0.786 ({analysis.oteLevels.zone || (analysis.dailyBias === 'Bullish' ? 'Discount' : 'Premium')}):{' '}
                    {Math.min(analysis.oteLevels.fib618, analysis.oteLevels.fib786)} –{' '}
                    {Math.max(analysis.oteLevels.fib618, analysis.oteLevels.fib786)}
                  </span>
                </div>
              </div>
            </div>
          )}

          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
            {/* Dual TradingView Charts: Fresh TradingView Chart + ICT Mapped Chart */}
            <div className={chartViewMode === 'live' ? 'lg:col-span-12 space-y-5' : 'lg:col-span-8 space-y-5'}>
              {(chartViewMode === 'split' || chartViewMode === 'live') && (
                <div className="bg-white border border-slate-200 rounded-xl p-4 text-slate-900 shadow-xs">
                  <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
                    <div>
                      <h3 className="text-sm font-bold text-slate-950">
                        {symbol} ({activeTimeframe}) — Fresh TradingView Chart
                      </h3>
                      <p className="text-xs text-slate-500">
                        Live interactive TradingView chart with drawing tools &amp; indicators synchronized to {symbol} {activeTimeframe}
                      </p>
                    </div>
                    <a
                      href={`https://www.youtube.com/channel/${config.ictYoutubeChannelId}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-xs font-medium text-[#B45309] hover:underline inline-flex items-center gap-1"
                    >
                      ICT Channel ({config.ictYoutubeChannelId})
                      <ArrowUpRight className="w-3.5 h-3.5" />
                    </a>
                  </div>
                  <LiveTradingViewChart
                    symbol={symbol}
                    timeframe={activeTimeframe}
                    theme="light"
                    heightClass={chartViewMode === 'live' ? 'h-[560px]' : 'h-[430px]'}
                  />
                </div>
              )}

              {(chartViewMode === 'split' || chartViewMode === 'ict') && (
                <TradingViewMappedChart
                  analysis={analysis}
                  heightClass={chartViewMode === 'ict' ? 'h-[480px]' : 'h-[420px]'}
                />
              )}
            </div>

            {/* Actionable ICT Setup Card */}
            <div className={chartViewMode === 'live' ? 'lg:col-span-12 space-y-4' : 'lg:col-span-4 space-y-4'}>
              <div
                className={`rounded-xl p-5 border shadow-xs bg-white ${
                  analysis.tradeVerdict === 'No Trade'
                    ? 'border-rose-200'
                    : analysis.tradeVerdict === 'Wait for Setup'
                    ? 'border-amber-300'
                    : 'border-slate-200'
                }`}
              >
                <div className="flex items-center justify-between gap-2 mb-4">
                  <div className="flex items-center gap-2">
                    <h3 className="text-base font-bold text-slate-950">Execution Parameters</h3>
                    {analysis.tradeVerdict === 'Wait for Setup' && (
                      <span className="text-[10px] font-mono font-bold uppercase px-2 py-0.5 rounded bg-amber-100 text-amber-900 border border-amber-300">
                        Limit Only
                      </span>
                    )}
                    {analysis.tradeVerdict === 'No Trade' && (
                      <span className="text-[10px] font-mono font-bold uppercase px-2 py-0.5 rounded bg-rose-100 text-rose-800 border border-rose-300">
                        Locked
                      </span>
                    )}
                  </div>
                  <a
                    href={
                      analysis.tradingViewUrl ||
                      `https://www.tradingview.com/chart/?symbol=${encodeURIComponent(analysis.tvSymbol || analysis.symbol)}`
                    }
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-xs font-mono font-semibold text-[#B45309] hover:underline inline-flex items-center gap-1"
                  >
                    <span>{analysis.tvSymbol || 'TradingView'}</span>
                    <ArrowUpRight className="w-3.5 h-3.5" />
                  </a>
                </div>

                {analysis.tradeVerdict === 'Wait for Setup' && (
                  <div className="mb-3.5 p-3 rounded-lg bg-amber-50 border border-amber-200 text-xs text-amber-950 leading-relaxed flex items-start gap-2">
                    <Clock className="w-4 h-4 text-amber-700 shrink-0 mt-0.5" />
                    <span>
                      Do <strong>not</strong> market-enter now. Price is on the wrong side of 50% Equilibrium — wait for retracement into the mapped PD Array below.
                    </span>
                  </div>
                )}

                <div className="space-y-2.5 text-sm">
                  <div className="flex justify-between py-2 border-b border-slate-100">
                    <span className="text-slate-500">Live Price</span>
                    <span className="font-mono tabular-nums font-bold text-slate-950">
                      {analysis.currentPrice}
                      {typeof analysis.changePct === 'number' && (
                        <span
                          className={`ml-1.5 text-xs font-semibold ${
                            analysis.changePct >= 0 ? 'text-emerald-600' : 'text-rose-600'
                          }`}
                        >
                          ({analysis.changePct >= 0 ? '+' : ''}
                          {analysis.changePct}%)
                        </span>
                      )}
                    </span>
                  </div>
                  {typeof analysis.bid === 'number' && typeof analysis.ask === 'number' && (
                    <div className="flex justify-between py-2 border-b border-slate-100">
                      <span className="text-slate-500">Bid / Ask</span>
                      <span className="font-mono tabular-nums text-xs font-semibold text-slate-700">
                        {analysis.bid} / {analysis.ask}
                      </span>
                    </div>
                  )}
                  <div className="flex justify-between py-2 border-b border-slate-100">
                    <span className="text-slate-500">Trade Verdict</span>
                    <span
                      className={`font-semibold ${
                        analysis.tradeVerdict === 'No Trade'
                          ? 'text-rose-600'
                          : analysis.tradeVerdict === 'Wait for Setup'
                          ? 'text-amber-700'
                          : analysis.dailyBias === 'Bullish'
                          ? 'text-emerald-700'
                          : 'text-rose-600'
                      }`}
                    >
                      {analysis.tradeVerdict === 'No Trade'
                        ? 'No Trade (Stand Aside)'
                        : analysis.tradeVerdict === 'Wait for Setup'
                        ? `${analysis.setup.direction} · Limit Only`
                        : analysis.setup.direction}
                    </span>
                  </div>

                  {analysis.tradeVerdict === 'No Trade' ? (
                    <div className="mt-3 p-4 rounded-lg bg-rose-50 border border-rose-200 space-y-3">
                      <div className="flex items-center gap-2 text-rose-800 font-bold text-xs uppercase tracking-wider">
                        <Lock className="w-4 h-4 text-rose-600 shrink-0" />
                        <span>Execution Levels Hidden · Stand Aside</span>
                      </div>
                      <p className="text-xs text-slate-700 leading-relaxed">
                        Entry, Stop Loss, and Take Profit coordinates are intentionally locked until all 4 required ICT confluence rules align:
                      </p>
                      <ul className="space-y-2 text-xs text-rose-800">
                        {analysis.noTradeReasons.map((reason, idx) => (
                          <li key={idx} className="flex items-start gap-2">
                            <XCircle className="w-3.5 h-3.5 text-rose-600 shrink-0 mt-0.5" />
                            <span>{reason}</span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  ) : (
                    <>
                      <div className="flex justify-between py-2 border-b border-slate-100 gap-2">
                        <span className="text-slate-500 shrink-0">Anchor PD Array</span>
                        <span className="font-semibold text-slate-950 text-right truncate">
                          {analysis.setup.entryArrayName || 'Unmitigated PD Array'}
                        </span>
                      </div>
                      <div className="flex justify-between py-2 border-b border-slate-100">
                        <span className="text-slate-500">
                          {analysis.tradeVerdict === 'Wait for Setup' ? 'Limit Entry Zone' : 'Entry Zone'}
                        </span>
                        <span className="font-mono tabular-nums font-semibold text-slate-950">
                          {analysis.setup.entryZone}
                        </span>
                      </div>
                      <div className="flex justify-between py-2 border-b border-slate-100">
                        <span className="text-slate-500">50% Equilibrium</span>
                        <span className="font-mono tabular-nums font-semibold text-slate-800">
                          {pd ? pd.equilibrium : '-'}
                        </span>
                      </div>
                      <div className="flex justify-between py-2 border-b border-slate-100">
                        <span className="text-slate-500">Invalidation Stop Loss</span>
                        <span className="font-mono tabular-nums font-semibold text-rose-600">
                          {analysis.setup.stopLoss}
                        </span>
                      </div>
                      <div className="flex justify-between py-2 border-b border-slate-100">
                        <span className="text-slate-500">TP1 (Partial / Equilibrium)</span>
                        <span className="font-mono tabular-nums font-semibold text-emerald-700">
                          {analysis.setup.tp1}
                        </span>
                      </div>
                      <div className="flex justify-between py-2 border-b border-slate-100">
                        <span className="text-slate-500">
                          TP2 (External DOL · 1:{analysis.setup.rrRatio})
                        </span>
                        <span className="font-mono tabular-nums font-semibold text-emerald-700">
                          {analysis.setup.tp2}
                        </span>
                      </div>
                    </>
                  )}

                  <div className="flex justify-between py-2 border-b border-slate-100 gap-2">
                    <span className="text-slate-500 shrink-0">Power of 3 (AMD)</span>
                    <span
                      className={`text-xs font-semibold text-right ${
                        analysis.po3Phase.startsWith('Manipulation')
                          ? 'text-amber-700'
                          : analysis.po3Phase === 'Distribution'
                          ? 'text-emerald-700'
                          : 'text-sky-700'
                      }`}
                    >
                      {analysis.po3Phase}
                    </span>
                  </div>
                  <div className="flex justify-between py-2 border-b border-slate-100 gap-3">
                    <span className="text-slate-500 shrink-0">Liquidity Sweep</span>
                    <span
                      className={`text-xs font-medium text-right leading-snug ${
                        analysis.liquiditySweep?.startsWith('SSL')
                          ? 'text-emerald-700'
                          : analysis.liquiditySweep?.startsWith('BSL')
                          ? 'text-rose-600'
                          : 'text-slate-500'
                      }`}
                    >
                      {analysis.liquiditySweep || 'No recent external stop run detected'}
                    </span>
                  </div>
                  {analysis.lastUpdated && (
                    <div className="flex justify-between pt-1 text-xs text-slate-500">
                      <span>TradingView Feed Sync</span>
                      <span className="font-mono tabular-nums">
                        {new Date(analysis.lastUpdated).toLocaleTimeString([], {
                          hour: '2-digit',
                          minute: '2-digit',
                          second: '2-digit',
                        })}
                      </span>
                    </div>
                  )}
                </div>
              </div>

              <div className="bg-white border border-slate-200 rounded-xl p-5 shadow-xs">
                <h3 className="text-sm font-bold text-slate-950 mb-3">ICT Confluence Audit</h3>
                <ul className="space-y-2.5 text-xs text-slate-700">
                  {analysis.confluenceChecks.map((check) => (
                    <li key={check.id} className="flex items-start gap-2">
                      {check.passed ? (
                        <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
                      ) : check.required ? (
                        <XCircle className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
                      ) : (
                        <Clock className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
                      )}
                      <div>
                        <span className="font-semibold text-slate-950">{check.label}: </span>
                        <span className="text-slate-600">{check.detail}</span>
                      </div>
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          </div>

          {/* ICT PD Array Matrix (Premium vs Discount Hierarchy) */}
          <div className="bg-white border border-slate-200 rounded-xl p-5 space-y-4 shadow-xs">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <h3 className="text-base font-bold text-slate-950">
                  ICT PD Array Matrix — Premium vs. Discount Hierarchy
                </h3>
                <p className="text-xs text-slate-500 mt-0.5">
                  Derived directly from live {analysis.symbol} ({analysis.timeframe}) OHLC price delivery: Old High/Low (BSL/SSL), Equal Highs/Lows, Rejection Blocks, Order Blocks, FVGs (50% CE), Liquidity Voids, Breaker Blocks &amp; Mitigation Blocks.
                </p>
              </div>
              <div className="flex items-center gap-1 p-1 bg-slate-100 border border-slate-200 rounded-lg">
                <button
                  type="button"
                  onClick={() => setPdFilter('active')}
                  className={`px-3 py-1.5 text-xs font-semibold rounded-md transition-colors cursor-pointer whitespace-nowrap shrink-0 ${
                    pdFilter === 'active' ? 'bg-[#0B0F19] text-white font-bold' : 'text-slate-600 hover:text-slate-950'
                  }`}
                >
                  Unmitigated &amp; Active
                </button>
                <button
                  type="button"
                  onClick={() => setPdFilter('all')}
                  className={`px-3 py-1.5 text-xs font-semibold rounded-md transition-colors cursor-pointer whitespace-nowrap shrink-0 ${
                    pdFilter === 'all' ? 'bg-[#0B0F19] text-white font-bold' : 'text-slate-600 hover:text-slate-950'
                  }`}
                >
                  All Arrays ({allPdArrays.length})
                </button>
              </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 pt-1">
              <PdArrayColumn
                title="Premium PD Arrays (Above 50% Equilibrium)"
                subtitle="Institutional resistance & short execution POIs / Buy-Side targets"
                tone="premium"
                items={premiumArrays}
              />
              <PdArrayColumn
                title="Discount PD Arrays (Below 50% Equilibrium)"
                subtitle="Institutional support & long execution POIs / Sell-Side targets"
                tone="discount"
                items={discountArrays}
              />
            </div>
          </div>
        </>
      )}

      {/* Supabase Synced Setups & Strategy Playbooks */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        <div className="lg:col-span-6 bg-white border border-slate-200 rounded-xl p-5 shadow-xs">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-sm font-bold text-slate-950 flex items-center gap-2">
              <BookmarkPlus className="w-4 h-4 text-[#D97706]" />
              Saved ICT Setups
            </h3>
          </div>
          {savedSetups.length === 0 ? (
            <p className="text-xs text-slate-500 py-4">
              No saved setups yet. Click &quot;Save Setup&quot; on any scan to save it to your account.
            </p>
          ) : (
            <div className="divide-y divide-slate-100">
              {savedSetups.map((s) => (
                <div key={s.id} className="py-2.5 flex items-center justify-between gap-3 text-xs">
                  <div>
                    <div className="font-mono font-bold text-slate-950">
                      {s.symbol} · {s.timeframe} ·{' '}
                      <span className={s.bias === 'Bullish' ? 'text-emerald-700' : 'text-rose-600'}>{s.bias}</span>
                    </div>
                    <div className="text-slate-600 font-mono tabular-nums">
                      Entry {s.entryZone} · SL {s.stopLoss} · TP1 {s.tp1}
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => handleDeleteSetup(s.id)}
                    className="p-1.5 text-slate-400 hover:text-rose-600 cursor-pointer"
                    aria-label="Delete setup"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="lg:col-span-6 bg-white border border-slate-200 rounded-xl p-5 space-y-4 shadow-xs">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-bold text-slate-950 flex items-center gap-2">
              <BookMarked className="w-4 h-4 text-[#D97706]" />
              Strategy Playbooks
            </h3>
          </div>

          <form onSubmit={handleCreatePlaybook} className="space-y-2.5">
            <input
              type="text"
              placeholder={`Playbook title (e.g. ${symbol} ${activeTimeframe} Discount OTE + FVG)`}
              value={playbookTitle}
              onChange={(e) => setPlaybookTitle(e.target.value)}
              className="w-full px-3 py-2 text-xs bg-white text-slate-900 placeholder:text-slate-400 border border-slate-300 rounded-lg focus:outline-none focus:border-amber-500"
            />
            <div className="flex gap-2">
              <input
                type="text"
                placeholder="PD Array trigger, Equilibrium filter, & Killzone rules..."
                value={playbookRules}
                onChange={(e) => setPlaybookRules(e.target.value)}
                className="flex-1 px-3 py-2 text-xs bg-white text-slate-900 placeholder:text-slate-400 border border-slate-300 rounded-lg focus:outline-none focus:border-amber-500"
              />
              <button
                type="submit"
                className="px-4 py-2 bg-[#0B0F19] text-[#E5A93C] text-xs font-bold rounded-lg hover:bg-slate-800 cursor-pointer whitespace-nowrap shrink-0"
              >
                Save Playbook
              </button>
            </div>
          </form>

          {playbooks.length > 0 && (
            <div className="divide-y divide-slate-100">
              {playbooks.map((p) => (
                <div key={p.id} className="py-2 flex items-start justify-between gap-3 text-xs">
                  <div>
                    <div className="font-semibold text-slate-950">
                      {p.title}{' '}
                      <span className="font-mono text-slate-500">
                        ({p.pair} · {p.timeframe})
                      </span>
                    </div>
                    <div className="text-slate-600">{p.rulesSummary}</div>
                  </div>
                  <button
                    type="button"
                    onClick={() => handleDeletePlaybook(p.id)}
                    className="p-1 text-slate-400 hover:text-rose-600 cursor-pointer"
                    aria-label="Delete playbook"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

const PdArrayColumn: React.FC<{
  title: string;
  subtitle: string;
  tone: 'premium' | 'discount';
  items: PdArrayItem[];
}> = ({ title, subtitle, tone, items }) => {
  return (
    <div className="border border-slate-200 rounded-lg overflow-hidden bg-white">
      <div
        className={`px-4 py-3 border-b border-slate-200 ${
          tone === 'premium' ? 'bg-rose-50/70' : 'bg-emerald-50/70'
        }`}
      >
        <div
          className={`text-sm font-bold ${
            tone === 'premium' ? 'text-rose-800' : 'text-emerald-800'
          }`}
        >
          {title}
        </div>
        <div className="text-xs text-slate-600">{subtitle}</div>
      </div>

      {items.length === 0 ? (
        <div className="px-4 py-6 text-xs text-slate-500">
          No active {tone === 'premium' ? 'Premium' : 'Discount'} PD arrays detected in this filter view.
        </div>
      ) : (
        <div className="divide-y divide-slate-100">
          {items.map((item) => {
            const statusColor =
              item.status === 'In Zone'
                ? 'text-sky-700 font-bold'
                : item.status === 'Target Liquidity'
                ? 'text-amber-700 font-semibold'
                : item.status === 'Mitigated'
                ? 'text-slate-400'
                : 'text-emerald-700 font-semibold';
            const bandLabel =
              item.top === item.bottom
                ? `${item.midpoint}`
                : `${item.bottom} – ${item.top} (Mid ${item.midpoint})`;
            return (
              <div key={item.id} className="px-4 py-3 hover:bg-amber-50/40 transition-colors">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="text-xs font-semibold text-slate-950 truncate">
                      <span className="font-mono text-slate-400 mr-1.5">P{item.priority}</span>
                      {item.name}
                    </div>
                    <div className="text-xs text-slate-500 mt-0.5">{item.description}</div>
                  </div>
                  <div className="text-right shrink-0">
                    <div className="text-xs font-mono tabular-nums font-semibold text-slate-950">
                      {bandLabel}
                    </div>
                    <div className="text-xs font-mono tabular-nums mt-0.5 flex items-center justify-end gap-1.5">
                      <span className="text-slate-500">
                        {item.distancePct >= 0 ? `+${item.distancePct}%` : `${item.distancePct}%`}
                      </span>
                      <span aria-hidden="true" className="text-slate-300">·</span>
                      <span className={statusColor}>{item.status}</span>
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};
