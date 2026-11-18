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
  Zap,
  AlertTriangle,
} from 'lucide-react';
import { apiFetch } from '../lib/api';
import {
  ANALYZER_TIMEFRAMES,
  TRADING_SYMBOLS,
  normalizeAnalyzerTimeframe,
  type AnalyzerTimeframe,
} from '../lib/tradingTimeframes';
import { LiveTradingViewChart } from './LiveTradingViewChart';
import type { IctAnalysisResult, PdArrayItem, PublicConfig, User } from '../types';

interface IctAnalyzerViewProps {
  user: User;
  config: PublicConfig;
  symbol: string;
  timeframe: AnalyzerTimeframe;
  onSymbolChange: (symbol: string) => void;
  onTimeframeChange: (timeframe: AnalyzerTimeframe) => void;
  onOpenFreeChart: () => void;
  onUnlockClick: () => void;
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
  const [chartViewMode, setChartViewMode] = useState<'split' | 'live' | 'ict'>('split');
  const [autoSync, setAutoSync] = useState(true);
  const [pdFilter, setPdFilter] = useState<'active' | 'all'>('active');

  const [savedSetups, setSavedSetups] = useState<SavedSetupItem[]>([]);
  const [playbooks, setPlaybooks] = useState<PlaybookItem[]>([]);
  const [playbookTitle, setPlaybookTitle] = useState('');
  const [playbookRules, setPlaybookRules] = useState('');
  const [cloudNotice, setCloudNotice] = useState('');

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

  const runScan = useCallback(async () => {
    if (!user.hasAnalyzer) return;
    setLoading(true);
    setError('');
    try {
      const res = await apiFetch<{ analysis: IctAnalysisResult }>(
        `/api/analyzer/scan?symbol=${encodeURIComponent(symbol)}&timeframe=${encodeURIComponent(activeTimeframe)}`
      );
      setAnalysis(res.analysis);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Analysis failed');
    } finally {
      setLoading(false);
    }
  }, [symbol, activeTimeframe, user.hasAnalyzer]);

  useEffect(() => {
    runScan();
  }, [runScan]);

  useEffect(() => {
    if (!user.hasAnalyzer || !autoSync) return;
    const intervalMs = activeTimeframe === '1M' ? 12000 : 25000;
    const id = setInterval(() => {
      runScan();
    }, intervalMs);
    return () => clearInterval(id);
  }, [user.hasAnalyzer, autoSync, activeTimeframe, runScan]);

  async function handleSaveSetup() {
    if (!analysis) return;
    setError('');
    setCloudNotice('');
    try {
      await apiFetch('/api/supabase/setups', {
        method: 'POST',
        body: JSON.stringify({
          symbol: analysis.symbol,
          timeframe: analysis.timeframe,
          bias: analysis.dailyBias,
          entryZone: analysis.setup.entryZone,
          stopLoss: analysis.setup.stopLoss,
          tp1: analysis.setup.tp1,
          notes: `${analysis.structureShift} · ${analysis.premiumDiscount?.currentZone || ''} · ${analysis.activeKillzone}`,
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

  const [autoTradingMt5, setAutoTradingMt5] = useState(false);

  async function handleAutoTradeSetupOnMt5() {
    if (!analysis) return;
    setError('');
    setCloudNotice('');
    setAutoTradingMt5(true);
    try {
      const side = analysis.dailyBias === 'Bullish' ? 'BUY' : 'SELL';
      const res = await apiFetch<{ ok: boolean; message: string }>('/api/ea/mt5/execute', {
        method: 'POST',
        body: JSON.stringify({
          symbol: analysis.symbol,
          side,
          volume: 0.05,
          stopLoss: analysis.setup.stopLoss,
          takeProfit: analysis.setup.tp1,
          sourceEa: `ICT ${analysis.timeframe} Scanner`,
        }),
      });
      setCloudNotice(res.message);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to send setup to connected MT5 account.');
    } finally {
      setAutoTradingMt5(false);
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
    return (
      <div className="max-w-3xl mx-auto bg-white border border-slate-200 rounded-xl p-8 space-y-5">
        <div className="flex items-center gap-2 text-xs font-semibold text-blue-600">
          <Lock className="w-4 h-4" />
          <span>ICT Strategy Module · ${config.analyzerPriceUsd.toFixed(2)} Unlock</span>
        </div>
        <h2 className="text-2xl font-bold text-slate-950">
          Unlock the ICT Strategy Market Analyzer
        </h2>
        <p className="text-sm text-slate-600 leading-relaxed">
          Built around Inner Circle Trader (ICT) Premium &amp; Discount methodology from channel{' '}
          <span className="font-mono text-slate-800">{config.ictYoutubeChannelId}</span>. Scan live candles from 1M scalps up to 1W swing setups for Dealing Range 50% Equilibrium, Full PD Array Matrix (Order Blocks, FVGs, Breaker/Mitigation/Rejection Blocks, Liquidity Voids), Market Structure Shifts, Optimal Trade Entry (0.618–0.786), and active Killzones.
        </p>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-sm text-slate-700">
          <div className="p-3 bg-slate-50 border border-slate-200 rounded-lg">
            · Premium vs. Discount Dealing Range &amp; 50% Equilibrium
          </div>
          <div className="p-3 bg-slate-50 border border-slate-200 rounded-lg">
            · Full ICT PD Array Matrix (OB, FVG, Breaker, Rejection, Void)
          </div>
          <div className="p-3 bg-slate-50 border border-slate-200 rounded-lg">
            · Automated BSL / SSL &amp; Equal Highs/Lows mapping
          </div>
          <div className="p-3 bg-slate-50 border border-slate-200 rounded-lg">
            · Exact Discount-Long / Premium-Short Entry, SL &amp; TP targets
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-3 pt-1">
          <button
            onClick={onUnlockClick}
            className="px-6 py-3 bg-blue-600 text-white text-sm font-semibold rounded-lg hover:bg-blue-700 transition-colors cursor-pointer"
          >
            Unlock ICT Analyzer — ${config.analyzerPriceUsd.toFixed(2)} (M-Pesa / Crypto)
          </button>
          <button
            type="button"
            onClick={onOpenFreeChart}
            className="px-5 py-3 border border-slate-300 text-slate-800 text-sm font-semibold rounded-lg hover:bg-slate-50 inline-flex items-center gap-2 cursor-pointer"
          >
            <CandlestickChart className="w-4 h-4 text-blue-600" />
            Open Free Live Chart
          </button>
        </div>
      </div>
    );
  }

  const symbolOptions = TRADING_SYMBOLS.includes(symbol as (typeof TRADING_SYMBOLS)[number])
    ? [...TRADING_SYMBOLS]
    : [symbol, ...TRADING_SYMBOLS];

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
      <div className="bg-white border border-slate-200 rounded-xl p-4 flex flex-wrap items-center justify-between gap-4">
        <div className="flex flex-wrap items-center gap-3">
          <select
            value={symbol}
            onChange={(e) => onSymbolChange(e.target.value)}
            aria-label="Select trading pair"
            className="px-3 py-2 text-sm font-mono font-semibold border border-slate-300 rounded-lg bg-white"
          >
            {symbolOptions.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
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
                ['split', 'Live + ICT Split'],
                ['live', 'Live Chart'],
                ['ict', 'ICT Map'],
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
          <button
            type="button"
            onClick={onOpenFreeChart}
            className="px-3 py-2 border border-slate-200 text-slate-700 text-xs font-semibold rounded-lg hover:bg-slate-50 inline-flex items-center gap-1.5 cursor-pointer whitespace-nowrap shrink-0"
          >
            <CandlestickChart className="w-3.5 h-3.5 text-blue-600" />
            Free Full Chart
          </button>
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
              onClick={handleSaveSetup}
              className="px-3.5 py-2 border border-slate-300 text-slate-800 text-xs font-semibold rounded-lg hover:bg-slate-50 inline-flex items-center gap-1.5 cursor-pointer whitespace-nowrap shrink-0"
            >
              <BookmarkPlus className="w-3.5 h-3.5 text-blue-600" />
              Save Setup
            </button>
          )}
          <button
            type="button"
            onClick={runScan}
            disabled={loading}
            className="px-4 py-2 bg-slate-950 text-white text-xs font-semibold rounded-lg hover:bg-slate-800 inline-flex items-center gap-2 cursor-pointer whitespace-nowrap shrink-0"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
            Scan {activeTimeframe}
          </button>
        </div>
      </div>

      {error && (
        <div className="p-3 bg-rose-50 border border-rose-200 text-rose-700 text-xs rounded-lg">
          {error}
        </div>
      )}
      {cloudNotice && (
        <div className="p-3 bg-emerald-50 border border-emerald-200 text-emerald-700 text-xs rounded-lg">
          {cloudNotice}
        </div>
      )}

      {analysis && (
        <>
          {/* Summary Strip */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <div className="bg-white border border-slate-200 rounded-xl p-4">
              <div className="text-xs text-slate-500">Bias &amp; Execution ({analysis.timeframe})</div>
              <div
                className={`text-lg font-bold mt-1 ${
                  analysis.dailyBias === 'Bullish' ? 'text-emerald-700' : 'text-rose-700'
                }`}
              >
                {analysis.dailyBias} · {analysis.setup.direction}
              </div>
              <div className="text-xs text-slate-500 mt-0.5 truncate">{analysis.structureShift}</div>
            </div>

            <div className="bg-white border border-slate-200 rounded-xl p-4">
              <div className="text-xs text-slate-500">Dealing Range Position</div>
              <div
                className={`text-lg font-bold font-mono tabular-nums mt-1 ${
                  pd?.currentZone === 'Premium'
                    ? 'text-rose-700'
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

            <div className="bg-white border border-slate-200 rounded-xl p-4">
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

            <div className="bg-white border border-slate-200 rounded-xl p-4">
              <div className="text-xs text-slate-500">Projected Risk : Reward</div>
              <div className="text-lg font-bold font-mono tabular-nums text-blue-600 mt-1">
                1 : {analysis.setup.rrRatio}
              </div>
              <div className="text-xs text-slate-500 mt-0.5 truncate">{analysis.activeKillzone}</div>
            </div>
          </div>

          {/* Premium vs. Discount Dealing Range Gauge */}
          {pd && (
            <div className="bg-white border border-slate-200 rounded-xl p-5 space-y-3">
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
                    pd.alignedWithBias ? 'text-emerald-700' : 'text-amber-700'
                  }`}
                >
                  {pd.alignedWithBias ? (
                    <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                  ) : (
                    <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0" />
                  )}
                  <span>
                    {pd.alignedWithBias
                      ? `Aligned (${analysis.dailyBias} in ${pd.currentZone})`
                      : `Extended (${analysis.dailyBias} Bias while in ${pd.currentZone})`}
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

                  {/* OTE Sweet Spot Band (0.618 - 0.786 inside Discount for Longs, or inside Premium for Shorts) */}
                  <div
                    className="absolute top-0 bottom-0 bg-amber-400/25 border-x border-amber-500/60 pointer-events-none"
                    style={
                      analysis.dailyBias === 'Bullish'
                        ? { left: '21.4%', width: '16.8%' }
                        : { left: '61.8%', width: '16.8%' }
                    }
                    title={`OTE Sweet Spot (0.618 - 0.786 ${analysis.oteLevels.zone || ''})`}
                  />

                  {/* Current Price Marker */}
                  <div
                    className="absolute top-0 bottom-0 w-0.5 bg-slate-950 z-10 pointer-events-none"
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
            {/* Synchronized Live TradingView Chart & ICT Liquidity/PD Array Map */}
            <div className={chartViewMode === 'live' ? 'lg:col-span-12 space-y-5' : 'lg:col-span-8 space-y-5'}>
              {(chartViewMode === 'split' || chartViewMode === 'live') && (
                <div className="bg-slate-950 border border-slate-800 rounded-xl p-4 text-white">
                  <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
                    <div>
                      <h3 className="text-sm font-bold text-white">
                        {symbol} ({activeTimeframe}) — Connected Live Chart
                      </h3>
                      <p className="text-xs text-slate-400">
                        TradingView live feed synchronized with the {activeTimeframe} ICT Premium/Discount scan below
                      </p>
                    </div>
                    <a
                      href={`https://www.youtube.com/channel/${config.ictYoutubeChannelId}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-xs font-medium text-blue-400 hover:underline inline-flex items-center gap-1"
                    >
                      ICT Channel ({config.ictYoutubeChannelId})
                      <ArrowUpRight className="w-3.5 h-3.5" />
                    </a>
                  </div>
                  <LiveTradingViewChart
                    symbol={symbol}
                    timeframe={activeTimeframe}
                    heightClass={
                      chartViewMode === 'live'
                        ? 'aspect-[16/9] min-h-[460px] max-h-[78vh]'
                        : 'aspect-[16/9] min-h-[380px] max-h-[65vh]'
                    }
                  />
                </div>
              )}

              {(chartViewMode === 'split' || chartViewMode === 'ict') && (
                <div className="bg-slate-950 border border-slate-800 rounded-xl p-5 text-white">
                  <div className="flex flex-wrap items-center justify-between gap-2 mb-4">
                    <div>
                      <h3 className="text-base font-bold text-white">
                        {analysis.symbol} ({analysis.timeframe}) — Premium / Discount &amp; PD Array Map
                      </h3>
                      <p className="text-xs text-slate-400">
                        {analysis.structureShift} · Power of 3: {analysis.po3Phase} · {analysis.liquiditySweep || 'Monitoring Liquidity'}
                      </p>
                    </div>
                    <div className="text-right font-mono tabular-nums">
                      <div className="text-sm font-bold text-white">{analysis.currentPrice}</div>
                      <div className="text-xs text-slate-400">
                        EQ 50%: {pd?.equilibrium ?? '-'} · OTE 0.705: {analysis.oteLevels.fib705}
                      </div>
                    </div>
                  </div>

                  <IctSvgChart analysis={analysis} />

                  <div className="mt-4 flex flex-wrap items-center gap-x-5 gap-y-2 text-xs text-slate-400">
                    <span>Red tint above EQ: Premium Zone</span>
                    <span>Green tint below EQ: Discount Zone</span>
                    <span>White dashed: 50% Equilibrium</span>
                    <span>Green/Red boxes: Bullish/Bearish PD Arrays</span>
                    <span>Violet/Amber boxes: Breaker &amp; Liquidity Void</span>
                    <span>Cyan dashed: BSL / SSL Liquidity</span>
                    <span>Amber dashed: OTE 0.705</span>
                  </div>
                </div>
              )}
            </div>

            {/* Actionable ICT Setup Card */}
            <div className={chartViewMode === 'live' ? 'lg:col-span-12 space-y-4' : 'lg:col-span-4 space-y-4'}>
              <div className="bg-white border border-slate-200 rounded-xl p-5">
                <div className="flex items-center justify-between gap-2 mb-4">
                  <h3 className="text-base font-bold text-slate-950">Execution Parameters</h3>
                  <a
                    href={
                      analysis.tradingViewUrl ||
                      `https://www.tradingview.com/chart/?symbol=${encodeURIComponent(analysis.tvSymbol || analysis.symbol)}`
                    }
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-xs font-mono font-semibold text-blue-600 hover:underline inline-flex items-center gap-1"
                  >
                    <span>{analysis.tvSymbol || 'TradingView'}</span>
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
                  {typeof analysis.bid === 'number' && typeof analysis.ask === 'number' && (
                    <div className="flex justify-between py-2 border-b border-slate-100">
                      <span className="text-slate-500">Bid / Ask</span>
                      <span className="font-mono tabular-nums text-xs font-semibold text-slate-700">
                        {analysis.bid} / {analysis.ask}
                      </span>
                    </div>
                  )}
                  <div className="flex justify-between py-2 border-b border-slate-100">
                    <span className="text-slate-500">Setup Bias</span>
                    <span
                      className={`font-semibold ${
                        analysis.dailyBias === 'Bullish' ? 'text-emerald-700' : 'text-rose-700'
                      }`}
                    >
                      {analysis.setup.direction}
                    </span>
                  </div>
                  <div className="flex justify-between py-2 border-b border-slate-100 gap-2">
                    <span className="text-slate-500 shrink-0">Anchor PD Array</span>
                    <span className="font-semibold text-slate-950 text-right truncate">
                      {analysis.setup.entryArrayName || `${analysis.oteLevels.zone || ''} PD Array`}
                    </span>
                  </div>
                  <div className="flex justify-between py-2 border-b border-slate-100">
                    <span className="text-slate-500">Entry Zone</span>
                    <span className="font-mono tabular-nums font-semibold text-slate-950">
                      {analysis.setup.entryZone}
                    </span>
                  </div>
                  <div className="flex justify-between py-2 border-b border-slate-100">
                    <span className="text-slate-500">50% Equilibrium</span>
                    <span className="font-mono tabular-nums font-semibold text-slate-700">
                      {pd ? pd.equilibrium : '-'}
                    </span>
                  </div>
                  <div className="flex justify-between py-2 border-b border-slate-100">
                    <span className="text-slate-500">Stop Loss</span>
                    <span className="font-mono tabular-nums font-semibold text-rose-600">
                      {analysis.setup.stopLoss}
                    </span>
                  </div>
                  <div className="flex justify-between py-2 border-b border-slate-100">
                    <span className="text-slate-500">TP1 (2R / Equilibrium)</span>
                    <span className="font-mono tabular-nums font-semibold text-emerald-700">
                      {analysis.setup.tp1}
                    </span>
                  </div>
                  <div className="flex justify-between py-2 border-b border-slate-100">
                    <span className="text-slate-500">TP2 (Liquidity Draw)</span>
                    <span className="font-mono tabular-nums font-semibold text-emerald-700">
                      {analysis.setup.tp2}
                    </span>
                  </div>
                  <div className="flex justify-between py-2 border-b border-slate-100 gap-2">
                    <span className="text-slate-500 shrink-0">Power of 3 / Sweep</span>
                    <span className="text-xs font-medium text-slate-700 text-right">
                      {analysis.po3Phase}
                    </span>
                  </div>
                  {analysis.lastUpdated && (
                    <div className="flex justify-between pt-1 text-xs text-slate-400">
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

                {user.hasEaBots && (
                  <div className="mt-4 pt-4 border-t border-slate-100">
                    <button
                      type="button"
                      disabled={autoTradingMt5}
                      onClick={handleAutoTradeSetupOnMt5}
                      className="w-full py-2.5 px-4 bg-slate-950 hover:bg-slate-800 text-white text-xs font-semibold rounded-lg inline-flex items-center justify-center gap-2 cursor-pointer transition-colors disabled:opacity-60"
                    >
                      <Zap className="w-3.5 h-3.5 text-[#E5A93C]" />
                      {autoTradingMt5
                        ? 'Sending Order to MT5...'
                        : `Auto-Trade ${analysis.dailyBias === 'Bullish' ? 'BUY' : 'SELL'} ${analysis.symbol} on MT5`}
                    </button>
                  </div>
                )}
              </div>

              <div className="bg-white border border-slate-200 rounded-xl p-5">
                <h3 className="text-sm font-bold text-slate-950 mb-3">ICT Confluence Checklist</h3>
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

          {/* ICT PD Array Matrix (Premium vs Discount Hierarchy) */}
          <div className="bg-white border border-slate-200 rounded-xl p-5 space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <h3 className="text-base font-bold text-slate-950">
                  ICT PD Array Matrix — Premium vs. Discount Hierarchy
                </h3>
                <p className="text-xs text-slate-500 mt-0.5">
                  Derived directly from live {analysis.symbol} ({analysis.timeframe}) OHLC price delivery: Old High/Low (BSL/SSL), Equal Highs/Lows, Rejection Blocks, Order Blocks, FVGs (50% CE), Liquidity Voids, Breaker Blocks &amp; Mitigation Blocks.
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
        <div className="lg:col-span-6 bg-white border border-slate-200 rounded-xl p-5">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-sm font-bold text-slate-950 flex items-center gap-2">
              <BookmarkPlus className="w-4 h-4 text-blue-600" />
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
                      <span className={s.bias === 'Bullish' ? 'text-emerald-700' : 'text-rose-700'}>{s.bias}</span>
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

        <div className="lg:col-span-6 bg-white border border-slate-200 rounded-xl p-5 space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-bold text-slate-950 flex items-center gap-2">
              <BookMarked className="w-4 h-4 text-blue-600" />
              Strategy Playbooks
            </h3>
          </div>

          <form onSubmit={handleCreatePlaybook} className="space-y-2.5">
            <input
              type="text"
              placeholder={`Playbook title (e.g. ${symbol} ${activeTimeframe} Discount OTE + FVG)`}
              value={playbookTitle}
              onChange={(e) => setPlaybookTitle(e.target.value)}
              className="w-full px-3 py-2 text-xs border border-slate-300 rounded-lg focus:outline-none focus:border-blue-600"
            />
            <div className="flex gap-2">
              <input
                type="text"
                placeholder="PD Array trigger, Equilibrium filter, & Killzone rules..."
                value={playbookRules}
                onChange={(e) => setPlaybookRules(e.target.value)}
                className="flex-1 px-3 py-2 text-xs border border-slate-300 rounded-lg focus:outline-none focus:border-blue-600"
              />
              <button
                type="submit"
                className="px-4 py-2 bg-slate-950 text-white text-xs font-semibold rounded-lg hover:bg-slate-800 cursor-pointer whitespace-nowrap shrink-0"
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
    <div className="border border-slate-200 rounded-lg overflow-hidden">
      <div
        className={`px-4 py-3 border-b border-slate-200 ${
          tone === 'premium' ? 'bg-rose-50/60' : 'bg-emerald-50/60'
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
                ? 'text-blue-700 font-bold'
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
              <div key={item.id} className="px-4 py-3 hover:bg-slate-50/70 transition-colors">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="text-xs font-semibold text-slate-950 truncate">
                      <span className="font-mono text-slate-500 mr-1.5">P{item.priority}</span>
                      {item.name}
                    </div>
                    <div className="text-xs text-slate-500 mt-0.5">{item.description}</div>
                  </div>
                  <div className="text-right shrink-0">
                    <div className="text-xs font-mono tabular-nums font-semibold text-slate-900">
                      {bandLabel}
                    </div>
                    <div className="text-xs font-mono tabular-nums mt-0.5 flex items-center justify-end gap-1.5">
                      <span className="text-slate-400">
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

const IctSvgChart: React.FC<{ analysis: IctAnalysisResult }> = ({ analysis }) => {
  const width = 760;
  const height = 360;
  const padX = 16;
  const padY = 22;

  const prices = analysis.candles.flatMap((c) => [c.high, c.low]);
  const maxP = Math.max(...prices, analysis.bslLevel);
  const minP = Math.min(...prices, analysis.sslLevel);
  const range = maxP - minP || 1;

  const toY = (p: number) => padY + ((maxP - p) / range) * (height - padY * 2);
  const stepX = (width - padX * 2) / analysis.candles.length;

  const equilibrium = analysis.premiumDiscount?.equilibrium ?? (maxP + minP) / 2;
  const yEq = toY(equilibrium);
  const yTop = padY;
  const yBot = height - padY;

  const yOteTop = toY(Math.max(analysis.oteLevels.fib618, analysis.oteLevels.fib786));
  const yOteBot = toY(Math.min(analysis.oteLevels.fib618, analysis.oteLevels.fib786));

  return (
    <div className="w-full overflow-x-auto">
      <svg viewBox={`0 0 ${width} ${height}`} className="w-full h-auto min-w-[540px]">
        {/* Premium Zone Shading (above 50% Equilibrium) */}
        <rect
          x={padX}
          y={yTop}
          width={width - padX * 2}
          height={Math.max(0, yEq - yTop)}
          fill="rgba(244, 63, 94, 0.06)"
        />
        <text
          x={width - padX - 4}
          y={yTop + 12}
          textAnchor="end"
          fill="rgba(253, 164, 175, 0.7)"
          fontSize={9}
          fontFamily="JetBrains Mono, monospace"
        >
          PREMIUM ZONE (&gt;50%)
        </text>

        {/* Discount Zone Shading (below 50% Equilibrium) */}
        <rect
          x={padX}
          y={yEq}
          width={width - padX * 2}
          height={Math.max(0, yBot - yEq)}
          fill="rgba(16, 185, 129, 0.06)"
        />
        <text
          x={width - padX - 4}
          y={yBot - 6}
          textAnchor="end"
          fill="rgba(134, 239, 172, 0.7)"
          fontSize={9}
          fontFamily="JetBrains Mono, monospace"
        >
          DISCOUNT ZONE (&lt;50%)
        </text>

        {/* OTE 0.618 - 0.786 Band */}
        <rect
          x={padX}
          y={Math.min(yOteTop, yOteBot)}
          width={width - padX * 2}
          height={Math.max(2, Math.abs(yOteBot - yOteTop))}
          fill="rgba(245, 158, 11, 0.07)"
        />

        {/* Subtle Grid */}
        {[0.2, 0.4, 0.6, 0.8].map((r) => (
          <line
            key={r}
            x1={padX}
            y1={padY + r * (height - padY * 2)}
            x2={width - padX}
            y2={padY + r * (height - padY * 2)}
            stroke="#1e293b"
            strokeWidth={1}
          />
        ))}

        {/* PD Array Zones (FVGs, OBs, Breakers, Rejections, Liquidity Voids) */}
        {analysis.zones.map((z, idx) => {
          const yZTop = toY(z.top);
          const yZBot = toY(z.bottom);
          const xStart = padX + z.startIndex * stepX;
          const isBreakerOrVoid = z.type.includes('Breaker') || z.type === 'Liquidity Void';
          const isBull = z.type.startsWith('Bullish');

          const fillColor = isBreakerOrVoid
            ? 'rgba(168, 85, 247, 0.14)'
            : isBull
            ? 'rgba(22, 163, 74, 0.16)'
            : 'rgba(225, 29, 72, 0.16)';
          const strokeColor = isBreakerOrVoid
            ? 'rgba(192, 132, 252, 0.45)'
            : isBull
            ? 'rgba(34, 197, 94, 0.45)'
            : 'rgba(244, 63, 94, 0.45)';
          const labelColor = isBreakerOrVoid ? '#d8b4fe' : isBull ? '#86efac' : '#fda4af';

          return (
            <g key={idx}>
              <rect
                x={xStart}
                y={Math.min(yZTop, yZBot)}
                width={width - padX - xStart}
                height={Math.max(4, Math.abs(yZBot - yZTop))}
                fill={fillColor}
                stroke={strokeColor}
                strokeWidth={0.8}
              />
              <text
                x={width - padX - 4}
                y={Math.min(yZTop, yZBot) + 11}
                textAnchor="end"
                fill={labelColor}
                fontSize={9}
                fontFamily="JetBrains Mono, monospace"
              >
                {z.type} {z.pdZone ? `(${z.pdZone})` : ''}
              </text>
            </g>
          );
        })}

        {/* 50% Equilibrium Line */}
        <line
          x1={padX}
          y1={yEq}
          x2={width - padX}
          y2={yEq}
          stroke="#e2e8f0"
          strokeDasharray="5 4"
          strokeWidth={1.1}
        />
        <text
          x={padX + 4}
          y={yEq - 4}
          fill="#f8fafc"
          fontSize={9}
          fontFamily="JetBrains Mono, monospace"
        >
          EQ 50% ({equilibrium})
        </text>

        {/* BSL / SSL & Equal Highs/Lows */}
        <line
          x1={padX}
          y1={toY(analysis.bslLevel)}
          x2={width - padX}
          y2={toY(analysis.bslLevel)}
          stroke="#38bdf8"
          strokeDasharray="4 4"
          strokeWidth={1}
        />
        <text x={padX + 4} y={toY(analysis.bslLevel) - 4} fill="#38bdf8" fontSize={9} fontFamily="JetBrains Mono, monospace">
          BSL {analysis.bslLevel}
        </text>

        <line
          x1={padX}
          y1={toY(analysis.sslLevel)}
          x2={width - padX}
          y2={toY(analysis.sslLevel)}
          stroke="#38bdf8"
          strokeDasharray="4 4"
          strokeWidth={1}
        />
        <text x={padX + 4} y={toY(analysis.sslLevel) + 11} fill="#38bdf8" fontSize={9} fontFamily="JetBrains Mono, monospace">
          SSL {analysis.sslLevel}
        </text>

        {/* OTE 0.705 */}
        <line
          x1={padX}
          y1={toY(analysis.oteLevels.fib705)}
          x2={width - padX}
          y2={toY(analysis.oteLevels.fib705)}
          stroke="#f59e0b"
          strokeDasharray="3 3"
          strokeWidth={1}
        />
        <text x={padX + 4} y={toY(analysis.oteLevels.fib705) - 4} fill="#fbbf24" fontSize={9} fontFamily="JetBrains Mono, monospace">
          OTE 0.705 ({analysis.oteLevels.fib705})
        </text>

        {/* Live OHLC Candles */}
        {analysis.candles.map((c) => {
          const cx = padX + c.index * stepX + stepX / 2;
          const isUp = c.close >= c.open;
          const color = isUp ? '#22c55e' : '#f43f5e';
          const yOpen = toY(c.open);
          const yClose = toY(c.close);
          const yHigh = toY(c.high);
          const yLow = toY(c.low);
          const bodyTop = Math.min(yOpen, yClose);
          const bodyHeight = Math.max(2, Math.abs(yClose - yOpen));
          return (
            <g key={c.index}>
              <line x1={cx} y1={yHigh} x2={cx} y2={yLow} stroke={color} strokeWidth={1.2} />
              <rect
                x={cx - stepX * 0.3}
                y={bodyTop}
                width={Math.max(3, stepX * 0.6)}
                height={bodyHeight}
                fill={color}
                rx={1}
              />
            </g>
          );
        })}
      </svg>
    </div>
  );
};
