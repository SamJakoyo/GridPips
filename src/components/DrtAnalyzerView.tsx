import React, { useEffect, useState, useCallback } from 'react';
import {
  RefreshCw,
  Lock,
  ArrowUpRight,
  CheckCircle2,
  BookmarkPlus,
  CandlestickChart,
  AlertTriangle,
  Layers,
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
import { DrtMappedChart } from './DrtMappedChart';
import { LANDING_IMAGES } from '../assets/landingImages';
import {
  SUBSCRIPTION_PLAN_SPECS,
  computeCyclePricing,
  formatShortDate,
} from '../lib/subscriptions';
import type { BillingCycle, DrtAnalysisResult, DrtPdArrayItem, PublicConfig, User } from '../types';

interface DrtAnalyzerViewProps {
  user: User;
  config: PublicConfig;
  symbol: string;
  timeframe: AnalyzerTimeframe;
  onSymbolChange: (symbol: string) => void;
  onTimeframeChange: (timeframe: AnalyzerTimeframe) => void;
  onOpenFreeChart: () => void;
  onUnlockClick: (cycle?: BillingCycle) => void;
}

const DEFAULT_DRT_CHANNEL_URL = 'https://youtube.com/@ali_khan_ict?si=mqOSzAkgagFGdb80';

export const DrtAnalyzerView: React.FC<DrtAnalyzerViewProps> = ({
  user,
  config,
  symbol,
  timeframe,
  onSymbolChange,
  onTimeframeChange,
  onOpenFreeChart,
  onUnlockClick,
}) => {
  const [analysis, setAnalysis] = useState<DrtAnalysisResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [chartViewMode, setChartViewMode] = useState<'split' | 'drt' | 'live'>('split');
  const [autoSync, setAutoSync] = useState(true);
  const [pdFilter, setPdFilter] = useState<'active' | 'all'>('active');
  const [selectedCycle, setSelectedCycle] = useState<BillingCycle>('monthly');

  const activeTimeframe = normalizeAnalyzerTimeframe(timeframe);
  const hasDrtAccess = Boolean(user.hasDrtAnalyzer ?? user.hasEaBots);
  const drtExpiresAt = user.drtAnalyzerExpiresAt ?? user.eaBotsExpiresAt;
  const drtStatus = user.drtAnalyzerSubscriptionStatus ?? user.eaBotsSubscriptionStatus;
  const drtChannelUrl = config.drtYoutubeChannelUrl || DEFAULT_DRT_CHANNEL_URL;

  const runDrtScan = useCallback(async () => {
    if (!hasDrtAccess) return;
    setLoading(true);
    setError('');
    try {
      const res = await apiFetch<{ analysis: DrtAnalysisResult }>(
        `/api/drt/scan?symbol=${encodeURIComponent(symbol)}&timeframe=${encodeURIComponent(activeTimeframe)}`
      );
      setAnalysis(res.analysis);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'DRT market scan failed.');
    } finally {
      setLoading(false);
    }
  }, [symbol, activeTimeframe, hasDrtAccess]);

  useEffect(() => {
    runDrtScan();
  }, [runDrtScan]);

  useEffect(() => {
    if (!hasDrtAccess || !autoSync) return;
    const intervalMs = activeTimeframe === '1M' ? 14000 : 28000;
    const id = setInterval(() => {
      runDrtScan();
    }, intervalMs);
    return () => clearInterval(id);
  }, [hasDrtAccess, autoSync, activeTimeframe, runDrtScan]);

  async function handleSaveDrtSetup() {
    if (!analysis) return;
    setError('');
    setNotice('');
    try {
      await apiFetch('/api/supabase/setups', {
        method: 'POST',
        body: JSON.stringify({
          symbol: analysis.symbol,
          timeframe: analysis.timeframe,
          bias: analysis.bias,
          entryZone: analysis.setup.entryZone,
          stopLoss: analysis.setup.stopLoss,
          tp1: analysis.setup.tp1,
          notes: `DRT ${analysis.rangeType} · ${analysis.trigger.name} · ${analysis.dealingRange.quadrant} · SMT: ${analysis.smt.status}`,
        }),
      });
      setNotice(`Saved ${analysis.symbol} (${analysis.timeframe}) DRT ${analysis.rangeType} setup to your account.`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to save DRT setup.');
    }
  }

  if (!hasDrtAccess) {
    const baseMonthlyUsd = Number(config.drtAnalyzerPriceUsd ?? config.eaBotsPriceUsd ?? 5.25);
    const usdKesRate = Number(config.usdKesRate || 130);
    const activePlan = computeCyclePricing(baseMonthlyUsd, usdKesRate, selectedCycle);
    const isExpired = drtStatus === 'expired';

    return (
      <div className="space-y-6">
        <div className="rounded-xl overflow-hidden border border-slate-900 bg-[#0B0F19] text-white">
          <div className="grid grid-cols-1 lg:grid-cols-12 items-stretch">
            <div className="lg:col-span-7 p-6 sm:p-8 lg:p-10 flex flex-col justify-between gap-6">
              <div className="space-y-4">
                <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.14em] text-[#E5A93C]">
                  <Lock className="w-3.5 h-3.5" />
                  <span>
                    DRT Strategy Market Analyzer · {isExpired ? 'Subscription Expired' : 'Pro Subscription'}
                  </span>
                </div>
                <h2 className="text-2xl sm:text-3xl font-bold tracking-tight text-white leading-tight">
                  Dealing Range Theory (DRT) Quadrant &amp; PD Array Engine
                </h2>
                <p className="text-sm text-slate-300 leading-relaxed max-w-2xl">
                  Built directly on Ali Khan ICT&apos;s Dealing Range Theory framework — completely separate from the ICT Analyzer. Maps mechanical 0.00 / 0.25 / 0.50 / 0.75 / 1.00 DRT quadrants, Type 1 / Type 2 / Type 3 dealing ranges, live correlated SMT divergence, 50% DRT equilibrium flips, ERL ↔ IRL delivery cycles, and Premium/Discount PD Arrays on synchronized TradingView charts.
                </p>
                {isExpired && drtExpiresAt && (
                  <div className="p-3 rounded-lg border border-amber-400/40 bg-amber-500/10 text-xs text-amber-200">
                    Your previous DRT Analyzer subscription ended on{' '}
                    <span className="font-mono font-semibold">{formatShortDate(drtExpiresAt)}</span>. Renew below to restore live DRT quadrant scanning immediately.
                  </div>
                )}
              </div>

              <div className="space-y-5">
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
                    <div className="font-semibold text-white">Separate Subscription Module</div>
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
                      {isExpired ? 'Renew DRT Analyzer' : 'Subscribe DRT Analyzer'} ({activePlan.spec.label}) — ${activePlan.amountUsd.toFixed(2)}
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
                src={LANDING_IMAGES.automatorCode3d}
                alt="Grid Pips DRT Strategy Market Analyzer workspace"
                referrerPolicy="no-referrer"
                className="w-full h-full object-cover object-center"
              />
              <div
                aria-hidden="true"
                className="absolute inset-0 bg-gradient-to-t from-[#0B0F19] via-[#0B0F19]/45 to-transparent"
              />
              <div className="absolute inset-x-0 bottom-0 p-5 sm:p-6 space-y-2">
                <div className="text-[11px] font-mono uppercase tracking-[0.14em] text-[#E5A93C]">
                  Ali Khan DRT Framework (@ali_khan_ict)
                </div>
                <div className="text-sm font-semibold text-white">
                  0.25 / 0.50 / 0.75 DRT Quadrants + Type 1/2/3 Ranges + Live SMT
                </div>
                <div className="text-xs text-slate-300 font-mono">
                  ERL ↔ IRL Delivery · Premium/Discount PD Arrays · ±0.25/±0.50 SD Targets
                </div>
              </div>
            </div>
          </div>
        </div>

        <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
          <div className="px-6 py-4 border-b border-slate-200 flex flex-wrap items-center justify-between gap-2">
            <div>
              <h3 className="text-sm font-bold text-slate-950">Included in Your DRT Analyzer Subscription</h3>
              <p className="text-xs text-slate-500 mt-0.5">
                Standalone Dealing Range Theory engine calibrated to{' '}
                <a
                  href={drtChannelUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-blue-600 hover:underline font-medium"
                >
                  @ali_khan_ict
                </a>
                .
              </p>
            </div>
            <span className="text-xs font-mono text-slate-500">Flexible Monthly · Quarterly (-10%) · Annual (-20%)</span>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 divide-y sm:divide-y-0 sm:divide-x divide-slate-200">
            <div className="p-5 space-y-1.5">
              <div className="text-[11px] font-mono font-semibold text-orange-700">01 · DRT QUADRANTS</div>
              <div className="text-sm font-bold text-slate-950">0.25 / 0.50 / 0.75 Grid</div>
              <p className="text-xs text-slate-600 leading-relaxed">
                Splits every active Dealing Range High (1.00) and Low (0.00) into exact Premium (50–100%) and Discount (0–50%) quarters.
              </p>
            </div>
            <div className="p-5 space-y-1.5">
              <div className="text-[11px] font-mono font-semibold text-orange-700">02 · RANGE ARCHETYPES</div>
              <div className="text-sm font-bold text-slate-950">Type 1, Type 2 &amp; Type 3</div>
              <p className="text-xs text-slate-600 leading-relaxed">
                Automatically detects Expansion (Type 1), EQH/EQL Liquidity Sweep Reversals (Type 2), and Consolidation traps (Type 3).
              </p>
            </div>
            <div className="p-5 space-y-1.5">
              <div className="text-[11px] font-mono font-semibold text-orange-700">03 · SMT &amp; FLIPS</div>
              <div className="text-sm font-bold text-slate-950">Live SMT &amp; 50% DRT Flip</div>
              <p className="text-xs text-slate-600 leading-relaxed">
                Compares correlated instruments in real time (EURUSD↔GBPUSD, XAU↔XAG, NAS↔US30) and flags 50% Equilibrium Flips.
              </p>
            </div>
            <div className="p-5 space-y-1.5">
              <div className="text-[11px] font-mono font-semibold text-orange-700">04 · PD ARRAYS &amp; SD</div>
              <div className="text-sm font-bold text-slate-950">Discount/Premium POIs</div>
              <p className="text-xs text-slate-600 leading-relaxed">
                Plots unmitigated FVGs, Order Blocks, Breakers, Rejections, and ±0.25 / ±0.50 Standard Deviation profit targets.
              </p>
            </div>
          </div>
        </div>
      </div>
    );
  }

  const isCustomSymbol = !MARKET_CATALOG_BY_SYM[symbol];

  const dr = analysis?.dealingRange;
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
      {/* Synchronized DRT Toolbar */}
      <div className="bg-white border border-slate-200 rounded-xl p-4 flex flex-wrap items-center justify-between gap-4">
        <div className="flex flex-wrap items-center gap-3">
          <select
            value={symbol}
            onChange={(e) => onSymbolChange(e.target.value)}
            aria-label="Select DRT trading pair"
            className="px-3 py-2 text-sm font-mono font-semibold border border-slate-300 rounded-lg bg-white max-w-[230px]"
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

          <div className="flex flex-wrap items-center gap-1 p-1 bg-slate-100 rounded-lg">
            {ANALYZER_TIMEFRAMES.map((tf) => (
              <button
                key={tf}
                type="button"
                onClick={() => onTimeframeChange(tf)}
                className={`px-2.5 py-1.5 text-xs font-mono font-semibold rounded-md transition-colors cursor-pointer whitespace-nowrap shrink-0 ${
                  activeTimeframe === tf ? 'bg-white text-slate-950 shadow-xs' : 'text-slate-600 hover:text-slate-950'
                }`}
              >
                {tf}
              </button>
            ))}
          </div>

          <div className="flex items-center gap-1 p-1 bg-slate-100 rounded-lg">
            {(
              [
                ['split', 'Dual Charts'],
                ['drt', 'DRT Mapped'],
                ['live', 'TradingView Only'],
              ] as const
            ).map(([mode, label]) => (
              <button
                key={mode}
                type="button"
                onClick={() => setChartViewMode(mode)}
                className={`px-2.5 py-1.5 text-xs font-semibold rounded-md transition-colors cursor-pointer whitespace-nowrap shrink-0 ${
                  chartViewMode === mode ? 'bg-slate-950 text-white' : 'text-slate-600 hover:text-slate-950'
                }`}
              >
                {label}
              </button>
            ))}
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2.5">
          <a
            href={drtChannelUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="px-3 py-2 border border-slate-200 text-slate-700 text-xs font-semibold rounded-lg hover:bg-slate-50 inline-flex items-center gap-1.5 whitespace-nowrap shrink-0"
          >
            <span>Ali Khan DRT</span>
            <ArrowUpRight className="w-3.5 h-3.5 text-orange-600" />
          </a>
          <button
            type="button"
            onClick={() => setAutoSync((v) => !v)}
            className={`px-3 py-2 border text-xs font-semibold rounded-lg cursor-pointer whitespace-nowrap shrink-0 ${
              autoSync
                ? 'border-emerald-300 bg-emerald-50 text-emerald-800'
                : 'border-slate-200 bg-white text-slate-600'
            }`}
          >
            {autoSync ? 'Live Sync On' : 'Live Sync Off'}
          </button>
          {analysis && (
            <button
              type="button"
              onClick={handleSaveDrtSetup}
              className="px-3.5 py-2 border border-slate-300 text-slate-800 text-xs font-semibold rounded-lg hover:bg-slate-50 inline-flex items-center gap-1.5 cursor-pointer whitespace-nowrap shrink-0"
            >
              <BookmarkPlus className="w-3.5 h-3.5 text-orange-600" />
              Save DRT Setup
            </button>
          )}
          <button
            type="button"
            onClick={runDrtScan}
            disabled={loading}
            className="px-4 py-2 bg-slate-950 text-white text-xs font-semibold rounded-lg hover:bg-slate-800 inline-flex items-center gap-2 cursor-pointer whitespace-nowrap shrink-0"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
            Scan DRT {activeTimeframe}
          </button>
        </div>
      </div>

      {error && (
        <div className="p-3 bg-rose-50 border border-rose-200 text-rose-700 text-xs rounded-lg flex flex-wrap items-center justify-between gap-2">
          <span>{error}</span>
          <button
            type="button"
            onClick={runDrtScan}
            className="px-3 py-1 bg-rose-700 text-white font-semibold rounded-md hover:bg-rose-800 cursor-pointer"
          >
            Retry DRT Scan
          </button>
        </div>
      )}
      {notice && (
        <div className="p-3 bg-emerald-50 border border-emerald-200 text-emerald-700 text-xs rounded-lg">
          {notice}
        </div>
      )}

      {!analysis && (
        <div className="bg-slate-950 border border-slate-800 rounded-xl p-4 text-white">
          <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
            <div>
              <h3 className="text-sm font-bold text-white">
                {symbol} ({activeTimeframe}) — Live TradingView Chart
              </h3>
              <p className="text-xs text-slate-400">
                {loading
                  ? `Computing Ali Khan DRT 0/25/50/75/100 Quadrants, Type 1/2/3 range & SMT divergence for ${symbol}...`
                  : `Live TradingView feed ready for ${symbol} (${activeTimeframe}).`}
              </p>
            </div>
            <button
              type="button"
              onClick={runDrtScan}
              disabled={loading}
              className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-white text-xs font-semibold rounded-md inline-flex items-center gap-1.5 cursor-pointer"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
              {loading ? 'Scanning DRT...' : 'Load DRT Map'}
            </button>
          </div>
          <LiveTradingViewChart symbol={symbol} timeframe={activeTimeframe} theme="dark" heightClass="h-[460px]" />
        </div>
      )}

      {analysis && dr && (
        <>
          {/* 4-Column DRT Summary Strip */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <div className="bg-white border border-slate-200 rounded-xl p-4">
              <div className="text-xs text-slate-500">DRT Range Archetype ({analysis.timeframe})</div>
              <div className="text-lg font-bold text-slate-950 mt-1">
                {analysis.rangeType} ·{' '}
                <span className={analysis.bias === 'Bullish' ? 'text-emerald-700' : 'text-rose-700'}>
                  {analysis.bias}
                </span>
              </div>
              <div className="text-xs text-slate-500 mt-0.5 truncate">{analysis.deliveryCycle}</div>
            </div>

            <div className="bg-white border border-slate-200 rounded-xl p-4">
              <div className="text-xs text-slate-500">DRT Quadrant Position</div>
              <div
                className={`text-lg font-bold font-mono tabular-nums mt-1 ${
                  dr.currentZone === 'Premium'
                    ? 'text-rose-700'
                    : dr.currentZone === 'Discount'
                    ? 'text-emerald-700'
                    : 'text-amber-700'
                }`}
              >
                {dr.currentZone} ({dr.currentPositionPct}%)
              </div>
              <div className="text-xs text-slate-500 mt-0.5 truncate">{dr.quadrant}</div>
            </div>

            <div className="bg-white border border-slate-200 rounded-xl p-4">
              <div className="text-xs text-slate-500">Correlated SMT ({analysis.smt.correlatedSymbol})</div>
              <div
                className={`text-sm font-bold mt-1.5 ${
                  analysis.smt.status === 'Bullish SMT Divergence'
                    ? 'text-emerald-700'
                    : analysis.smt.status === 'Bearish SMT Divergence'
                    ? 'text-rose-700'
                    : 'text-slate-900'
                }`}
              >
                {analysis.smt.status}
              </div>
              <div className="text-xs text-slate-500 mt-0.5 truncate">{analysis.trigger.name}</div>
            </div>

            <div className="bg-white border border-slate-200 rounded-xl p-4">
              <div className="text-xs text-slate-500">Projected DRT Risk : Reward</div>
              <div className="text-lg font-bold font-mono tabular-nums text-orange-600 mt-1">
                1 : {analysis.setup.rrRatio}
              </div>
              <div className="text-xs text-slate-500 mt-0.5 truncate">{analysis.activeSessionWindow}</div>
            </div>
          </div>

          {/* 4-Quadrant Ali Khan DRT Dealing Range Matrix Gauge */}
          <div className="bg-white border border-slate-200 rounded-xl p-5 space-y-3.5">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <h3 className="text-sm font-bold text-slate-950">
                  Ali Khan DRT 4-Quadrant Dealing Range (0.00 DRL · 0.25 · 0.50 EQ · 0.75 · 1.00 DRH)
                </h3>
                <p className="text-xs text-slate-500 mt-0.5">
                  {analysis.rangeTypeTitle} — {analysis.rangeTypeSummary}
                </p>
              </div>
              <div
                className={`inline-flex items-center gap-1.5 text-xs font-semibold ${
                  dr.alignedWithBias ? 'text-emerald-700' : 'text-amber-700'
                }`}
              >
                {dr.alignedWithBias ? (
                  <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                ) : (
                  <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0" />
                )}
                <span>
                  {dr.alignedWithBias
                    ? `Aligned (${analysis.bias} in ${dr.currentZone})`
                    : `Extended (${analysis.bias} Bias while in ${dr.currentZone})`}
                </span>
              </div>
            </div>

            {/* 4-Quadrant Horizontal Bar */}
            <div className="space-y-1.5 pt-1">
              <div className="grid grid-cols-5 text-[11px] font-mono tabular-nums text-slate-600">
                <span className="text-left">0.00 DRL · {dr.drl}</span>
                <span className="text-center font-semibold text-orange-700">0.25 DRT · {dr.q25}</span>
                <span className="text-center font-bold text-slate-950">0.50 EQ · {dr.eq50}</span>
                <span className="text-center font-semibold text-orange-700">0.75 DRT · {dr.q75}</span>
                <span className="text-right">1.00 DRH · {dr.drh}</span>
              </div>

              <div className="relative h-7 w-full rounded-md overflow-hidden border border-slate-200 grid grid-cols-4">
                <div className="h-full bg-emerald-100/80 border-r border-dashed border-orange-400 flex items-center justify-center text-[11px] font-semibold text-emerald-900">
                  Deep Discount (0–25%)
                </div>
                <div className="h-full bg-emerald-50 border-r-2 border-slate-700 flex items-center justify-center text-[11px] font-semibold text-emerald-800">
                  Lower Discount (25–50%)
                </div>
                <div className="h-full bg-rose-50 border-r border-dashed border-orange-400 flex items-center justify-center text-[11px] font-semibold text-rose-800">
                  Upper Premium (50–75%)
                </div>
                <div className="h-full bg-rose-100/80 flex items-center justify-center text-[11px] font-semibold text-rose-900">
                  Deep Premium (75–100%)
                </div>

                {/* Live Price Marker */}
                <div
                  className="absolute top-0 bottom-0 w-1 bg-slate-950 z-10 pointer-events-none"
                  style={{ left: `calc(${Math.min(99, Math.max(1, dr.currentPositionPct))}% - 2px)` }}
                />
              </div>

              <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-slate-600">
                <span>{dr.guidance}</span>
                <span className="font-mono tabular-nums text-slate-500">
                  SD Projections: +0.25 SD ({dr.sdPos25}) / -0.25 SD ({dr.sdNeg25})
                </span>
              </div>
            </div>
          </div>

          {/* Main Charts + DRT Execution Panel */}
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
            <div className={chartViewMode === 'live' ? 'lg:col-span-12 space-y-5' : 'lg:col-span-8 space-y-5'}>
              {(chartViewMode === 'split' || chartViewMode === 'live') && (
                <div className="bg-slate-950 border border-slate-800 rounded-xl p-4 text-white">
                  <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
                    <div>
                      <h3 className="text-sm font-bold text-white">
                        {symbol} ({activeTimeframe}) — Fresh TradingView Chart
                      </h3>
                      <p className="text-xs text-slate-400">
                        Live interactive TradingView chart for drawing your custom DRT 0/25/50/75/100 Fibonacci levels
                      </p>
                    </div>
                    <a
                      href={analysis.drtReferenceUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-xs font-medium text-orange-400 hover:underline inline-flex items-center gap-1"
                    >
                      Ali Khan ICT (@ali_khan_ict)
                      <ArrowUpRight className="w-3.5 h-3.5" />
                    </a>
                  </div>
                  <LiveTradingViewChart
                    symbol={symbol}
                    timeframe={activeTimeframe}
                    theme="dark"
                    heightClass={chartViewMode === 'live' ? 'h-[560px]' : 'h-[420px]'}
                  />
                </div>
              )}

              {(chartViewMode === 'split' || chartViewMode === 'drt') && (
                <DrtMappedChart
                  analysis={analysis}
                  heightClass={chartViewMode === 'drt' ? 'h-[490px]' : 'h-[430px]'}
                />
              )}
            </div>

            <div className={chartViewMode === 'live' ? 'lg:col-span-12 space-y-4' : 'lg:col-span-4 space-y-4'}>
              <div className="bg-white border border-slate-200 rounded-xl p-5">
                <div className="flex items-center justify-between gap-2 mb-4">
                  <h3 className="text-base font-bold text-slate-950">DRT Execution Plan</h3>
                  <a
                    href={analysis.tradingViewUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-xs font-mono font-semibold text-blue-600 hover:underline inline-flex items-center gap-1"
                  >
                    <span>{analysis.tvSymbol}</span>
                    <ArrowUpRight className="w-3.5 h-3.5" />
                  </a>
                </div>

                <div className="space-y-2.5 text-sm">
                  <div className="flex justify-between py-2 border-b border-slate-100">
                    <span className="text-slate-500">Live Price</span>
                    <span className="font-mono tabular-nums font-bold text-slate-950">
                      {analysis.currentPrice}
                      {typeof analysis.changePct === 'number' && (
                        <span
                          className={`ml-1.5 text-xs font-semibold ${
                            analysis.changePct >= 0 ? 'text-emerald-700' : 'text-rose-600'
                          }`}
                        >
                          ({analysis.changePct >= 0 ? '+' : ''}
                          {analysis.changePct}%)
                        </span>
                      )}
                    </span>
                  </div>
                  <div className="flex justify-between py-2 border-b border-slate-100">
                    <span className="text-slate-500">DRT Direction</span>
                    <span
                      className={`font-semibold ${
                        analysis.bias === 'Bullish' ? 'text-emerald-700' : 'text-rose-700'
                      }`}
                    >
                      {analysis.setup.direction}
                    </span>
                  </div>
                  <div className="flex justify-between py-2 border-b border-slate-100 gap-2">
                    <span className="text-slate-500 shrink-0">Entry Model</span>
                    <span className="font-semibold text-slate-950 text-right truncate">
                      {analysis.setup.entryModel}
                    </span>
                  </div>
                  <div className="flex justify-between py-2 border-b border-slate-100 gap-2">
                    <span className="text-slate-500 shrink-0">Anchor PD Array</span>
                    <span className="font-semibold text-slate-950 text-right truncate">
                      {analysis.setup.entryArrayName}
                    </span>
                  </div>
                  <div className="flex justify-between py-2 border-b border-slate-100">
                    <span className="text-slate-500">Entry Zone</span>
                    <span className="font-mono tabular-nums font-semibold text-slate-950">
                      {analysis.setup.entryZone}
                    </span>
                  </div>
                  <div className="flex justify-between py-2 border-b border-slate-100">
                    <span className="text-slate-500">Stop Loss (Invalidation)</span>
                    <span className="font-mono tabular-nums font-semibold text-rose-600">
                      {analysis.setup.stopLoss}
                    </span>
                  </div>
                  <div className="flex justify-between py-2 border-b border-slate-100">
                    <span className="text-slate-500">TP1 (50% EQ / 1.5R)</span>
                    <span className="font-mono tabular-nums font-semibold text-emerald-700">
                      {analysis.setup.tp1}
                    </span>
                  </div>
                  <div className="flex justify-between py-2 border-b border-slate-100">
                    <span className="text-slate-500">TP2 (Opposite DRT)</span>
                    <span className="font-mono tabular-nums font-semibold text-emerald-700">
                      {analysis.setup.tp2}
                    </span>
                  </div>
                  <div className="flex justify-between py-2 border-b border-slate-100">
                    <span className="text-slate-500">TP3 (±0.25 SD Target)</span>
                    <span className="font-mono tabular-nums font-semibold text-purple-700">
                      {analysis.setup.tp3}
                    </span>
                  </div>
                  <div className="flex justify-between py-2 border-b border-slate-100 gap-2">
                    <span className="text-slate-500 shrink-0">Draw on Liquidity</span>
                    <span className="font-mono tabular-nums text-xs font-semibold text-slate-800 text-right">
                      {analysis.drawOnLiquidity.price} ({analysis.drawOnLiquidity.side})
                    </span>
                  </div>
                </div>
              </div>

              {/* SMT & Delivery Cycle Insight */}
              <div className="bg-white border border-slate-200 rounded-xl p-5 space-y-3">
                <div className="flex items-center gap-2">
                  <Layers className="w-4 h-4 text-orange-600" />
                  <h3 className="text-sm font-bold text-slate-950">SMT &amp; ERL ↔ IRL Delivery</h3>
                </div>
                <div className="text-xs text-slate-700 space-y-2 leading-relaxed">
                  <div>
                    <span className="font-semibold text-slate-900">SMT ({analysis.smt.correlatedSymbol}): </span>
                    {analysis.smt.summary}
                  </div>
                  <div className="pt-2 border-t border-slate-100">
                    <span className="font-semibold text-slate-900">{analysis.deliveryCycle}: </span>
                    {analysis.deliveryCycleDetail}
                  </div>
                </div>
              </div>

              {/* DRT Mechanical Checklist */}
              <div className="bg-white border border-slate-200 rounded-xl p-5">
                <h3 className="text-sm font-bold text-slate-950 mb-3">DRT Mechanical Confluence</h3>
                <ul className="space-y-2.5 text-xs text-slate-700">
                  {analysis.setup.confluences.map((item, idx) => (
                    <li key={idx} className="flex items-start gap-2">
                      <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
                      <span>{item}</span>
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          </div>

          {/* DRT Premium vs Discount PD Array Matrix */}
          <div className="bg-white border border-slate-200 rounded-xl p-5 space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <h3 className="text-base font-bold text-slate-950">
                  DRT Premium vs. Discount PD Array Matrix
                </h3>
                <p className="text-xs text-slate-500 mt-0.5">
                  Every PD Array mapped into its exact Ali Khan DRT Quadrant (Deep Premium 75–100%, Upper Premium 50–75%, Lower Discount 25–50%, Deep Discount 0–25%).
                </p>
              </div>
              <div className="flex items-center gap-1 p-1 bg-slate-100 rounded-lg">
                <button
                  type="button"
                  onClick={() => setPdFilter('active')}
                  className={`px-3 py-1.5 text-xs font-semibold rounded-md transition-colors cursor-pointer whitespace-nowrap shrink-0 ${
                    pdFilter === 'active' ? 'bg-white text-slate-950 shadow-xs' : 'text-slate-600 hover:text-slate-950'
                  }`}
                >
                  Unmitigated &amp; Active
                </button>
                <button
                  type="button"
                  onClick={() => setPdFilter('all')}
                  className={`px-3 py-1.5 text-xs font-semibold rounded-md transition-colors cursor-pointer whitespace-nowrap shrink-0 ${
                    pdFilter === 'all' ? 'bg-white text-slate-950 shadow-xs' : 'text-slate-600 hover:text-slate-950'
                  }`}
                >
                  All Arrays ({allPdArrays.length})
                </button>
              </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 pt-1">
              <DrtPdArrayColumn
                title="Premium PD Arrays (50–100% DRT · 0.75 DRT Focus)"
                subtitle="Institutional distribution POIs for short setups & buy-side targets"
                tone="premium"
                items={premiumArrays}
              />
              <DrtPdArrayColumn
                title="Discount PD Arrays (0–50% DRT · 0.25 DRT Focus)"
                subtitle="Institutional accumulation POIs for long setups & sell-side targets"
                tone="discount"
                items={discountArrays}
              />
            </div>
          </div>
        </>
      )}
    </div>
  );
};

const DrtPdArrayColumn: React.FC<{
  title: string;
  subtitle: string;
  tone: 'premium' | 'discount';
  items: DrtPdArrayItem[];
}> = ({ title, subtitle, tone, items }) => {
  return (
    <div className="space-y-3">
      <div className="border-b border-slate-200 pb-2">
        <div className={`text-sm font-bold ${tone === 'premium' ? 'text-rose-800' : 'text-emerald-800'}`}>
          {title}
        </div>
        <div className="text-xs text-slate-500 mt-0.5">{subtitle}</div>
      </div>

      {items.length === 0 ? (
        <div className="text-xs text-slate-500 py-4">
          No unmitigated {tone} PD Arrays detected in this dealing range window. Switch to &ldquo;All Arrays&rdquo; or try a higher timeframe.
        </div>
      ) : (
        <div className="divide-y divide-slate-100 border border-slate-200 rounded-lg overflow-hidden">
          {items.map((item) => (
            <div key={item.id} className="p-3.5 bg-white hover:bg-slate-50/70 transition-colors space-y-1.5">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="text-xs font-bold text-slate-950">{item.name}</div>
                <div className="flex items-center gap-2 text-[11px] font-mono tabular-nums text-slate-600">
                  <span
                    className={
                      item.status === 'In Zone'
                        ? 'font-bold text-orange-700'
                        : item.status === 'Target Liquidity'
                        ? 'font-semibold text-blue-700'
                        : item.status === 'Mitigated'
                        ? 'text-slate-400'
                        : 'font-semibold text-emerald-700'
                    }
                  >
                    {item.status}
                  </span>
                  <span aria-hidden="true">·</span>
                  <span>
                    {item.distancePct >= 0 ? '+' : ''}
                    {item.distancePct}%
                  </span>
                </div>
              </div>
              <div className="flex flex-wrap items-center justify-between gap-2 text-xs font-mono tabular-nums text-slate-700">
                <span>
                  {item.top === item.bottom ? `Level ${item.midpoint}` : `Zone ${item.bottom} – ${item.top} (CE ${item.midpoint})`}
                </span>
                <span className="text-[11px] text-slate-500">{item.category}</span>
              </div>
              <p className="text-xs text-slate-600 leading-relaxed">{item.description}</p>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};
