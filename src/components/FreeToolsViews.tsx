import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { X, Activity, RefreshCw, ExternalLink, Calendar, Newspaper, AlertCircle } from 'lucide-react';
import { apiFetch } from '../lib/api';
import {
  ANALYZER_TIMEFRAMES,
  MARKET_CATALOG_GROUPS,
  normalizeAnalyzerTimeframe,
  type AnalyzerTimeframe,
} from '../lib/tradingTimeframes';
import { LiveTradingViewChart } from './LiveTradingViewChart';

/* ---------------- TradingView Live Charts (Free) ---------------- */
export const TradingViewChartsView: React.FC<{
  watchlist: string[];
  symbol: string;
  timeframe: AnalyzerTimeframe;
  onSymbolChange: (symbol: string) => void;
  onTimeframeChange: (tf: AnalyzerTimeframe) => void;
  onUpdateWatchlist?: (symbols: string[]) => Promise<void>;
  onAnalyzeInIct?: () => void;
}> = ({
  watchlist,
  symbol,
  timeframe,
  onSymbolChange,
  onTimeframeChange,
  onUpdateWatchlist,
  onAnalyzeInIct,
}) => {
  const list = watchlist.length ? watchlist : ['EURUSD', 'GBPUSD', 'XAUUSD', 'NAS100', 'BTCUSD'];
  const [newSym, setNewSym] = useState('');
  const [savingWl, setSavingWl] = useState(false);
  const activeTimeframe = normalizeAnalyzerTimeframe(timeframe);

  async function handleAddSymbol(e: React.FormEvent) {
    e.preventDefault();
    const cleaned = newSym.trim().toUpperCase();
    if (!cleaned || list.includes(cleaned)) {
      setNewSym('');
      if (cleaned) onSymbolChange(cleaned);
      return;
    }
    const next = [...list, cleaned];
    setNewSym('');
    onSymbolChange(cleaned);
    if (onUpdateWatchlist) {
      setSavingWl(true);
      await onUpdateWatchlist(next).finally(() => setSavingWl(false));
    }
  }

  async function handleRemoveSymbol(symToRemove: string) {
    if (list.length <= 1) return;
    const next = list.filter((s) => s !== symToRemove);
    if (symbol === symToRemove) onSymbolChange(next[0]);
    if (onUpdateWatchlist) {
      setSavingWl(true);
      await onUpdateWatchlist(next).finally(() => setSavingWl(false));
    }
  }

  return (
    <div className="space-y-4">
      {/* Full-Width Landscape Watchlist & Pair Selector Strip */}
      <div className="rounded-2xl bg-white border border-slate-200 shadow-xs p-4 space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-xs font-semibold text-slate-500 mr-1">Watchlist</span>
            {list.map((sym) => {
              const active = symbol === sym;
              return (
                <div
                  key={sym}
                  className={`inline-flex items-center rounded-lg border text-xs font-mono font-semibold transition-colors ${
                    active
                      ? 'bg-[#0B0F19] border-[#0B0F19] text-[#E5A93C]'
                      : 'bg-slate-50 border-slate-200 text-slate-700 hover:border-amber-300 hover:text-slate-950'
                  }`}
                >
                  <button
                    type="button"
                    onClick={() => onSymbolChange(sym)}
                    className="px-3 py-1.5 cursor-pointer whitespace-nowrap"
                  >
                    {sym}
                  </button>
                  {list.length > 1 && (
                    <button
                      type="button"
                      onClick={() => handleRemoveSymbol(sym)}
                      className={`pr-2 py-1.5 cursor-pointer ${
                        active ? 'text-slate-400 hover:text-white' : 'text-slate-400 hover:text-rose-600'
                      }`}
                      aria-label={`Remove ${sym}`}
                    >
                      <X className="w-3 h-3" />
                    </button>
                  )}
                </div>
              );
            })}
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <select
              value=""
              onChange={(e) => {
                const picked = e.target.value;
                if (!picked) return;
                onSymbolChange(picked);
                if (!list.includes(picked) && onUpdateWatchlist) {
                  setSavingWl(true);
                  void onUpdateWatchlist([...list, picked]).finally(() => setSavingWl(false));
                }
              }}
              aria-label="Browse Forex, Commodities, Indices, ETFs, Stocks, and Crypto"
              className="px-3 py-1.5 text-xs font-mono font-semibold bg-white border border-slate-300 focus:border-amber-500 focus:outline-none rounded-lg text-slate-900 max-w-[210px]"
            >
              <option value="">Browse 70+ Markets...</option>
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

            <form onSubmit={handleAddSymbol} className="flex items-center gap-2">
              <input
                type="text"
                value={newSym}
                onChange={(e) => setNewSym(e.target.value)}
                placeholder="Add ticker (e.g. NVDA)"
                className="w-36 sm:w-40 px-3 py-1.5 text-xs bg-white border border-slate-300 text-slate-900 placeholder:text-slate-400 focus:border-amber-500 focus:outline-none rounded-lg font-mono uppercase"
              />
              <button
                type="submit"
                className="px-3 py-1.5 bg-amber-50 border border-amber-300 hover:bg-amber-100 text-amber-900 text-xs font-semibold rounded-lg cursor-pointer whitespace-nowrap shrink-0 transition-colors"
              >
                + Add
              </button>
              <span className="hidden sm:inline text-[11px] font-semibold text-emerald-700 ml-1 whitespace-nowrap">
                {savingWl ? 'Syncing...' : 'Free Chart'}
              </span>
            </form>
          </div>
        </div>
      </div>

      {/* Full-Width 16:9 Landscape TradingView Chart Card */}
      <div className="rounded-2xl bg-white border border-slate-200 shadow-xs p-4 sm:p-5 space-y-3.5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h3 className="text-base font-bold text-slate-950 font-mono">
              {symbol} ({activeTimeframe}) · Live Landscape Chart
            </h3>
            <p className="text-xs text-slate-500">
              Full-width widescreen TradingView chart synced directly with your ICT Analyzer
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2.5">
            <div className="flex flex-wrap items-center gap-1 p-1 bg-slate-100 border border-slate-200 rounded-lg">
              {ANALYZER_TIMEFRAMES.map((tf) => (
                <button
                  key={tf}
                  type="button"
                  onClick={() => onTimeframeChange(tf)}
                  className={`px-2.5 py-1 text-xs font-mono font-semibold rounded-md cursor-pointer whitespace-nowrap shrink-0 transition-colors ${
                    activeTimeframe === tf
                      ? 'bg-[#0B0F19] text-white'
                      : 'text-slate-600 hover:text-slate-950'
                  }`}
                >
                  {tf}
                </button>
              ))}
            </div>

            {onAnalyzeInIct && (
              <button
                type="button"
                onClick={onAnalyzeInIct}
                className="px-3.5 py-2 bg-[#E5A93C] hover:bg-[#d6982b] text-[#090806] text-xs font-bold rounded-lg inline-flex items-center gap-1.5 cursor-pointer whitespace-nowrap shrink-0 transition-colors"
              >
                <Activity className="w-3.5 h-3.5" />
                Analyze {symbol} ({activeTimeframe}) →
              </button>
            )}
          </div>
        </div>

        <LiveTradingViewChart
          symbol={symbol}
          timeframe={activeTimeframe}
          theme="light"
          heightClass="h-[440px] sm:h-[540px]"
        />
      </div>
    </div>
  );
};

/* ---------------- Upgraded Institutional Workspace Modules ---------------- */
export { JournalView } from './tools/TradingJournalModule';
export { AnalyticsView } from './tools/AnalyticsModule';
export { CalculatorsView } from './tools/RiskCalculatorModule';
export { PaperTradingView } from './tools/PaperTradingModule';
export { TradingPlanView } from './tools/TradingPlanModule';

/* ---------------- Economic Calendar & Live News ---------------- */
interface LiveCalendarEvent {
  id: string;
  title: string;
  currency: string;
  impact: 'High' | 'Medium' | 'Low' | 'Holiday';
  dateIso: string;
  nyDateKey: string;
  nyDateLabel: string;
  nyTimeLabel: string;
  isToday: boolean;
  isUpcoming: boolean;
  actual: string;
  forecast: string;
  previous: string;
  ffUrl: string;
}

interface LiveNewsItem {
  id: string;
  title: string;
  summary: string;
  category: 'Forex Factory' | 'Central Banks' | 'Forex' | 'Gold' | 'Indices' | 'Crypto';
  source: string;
  url: string;
  publishedAt: string;
  timeAgo: string;
}

interface ForexFactoryApiPayload {
  source: 'forexfactory.com';
  calendarFeedProvider: string;
  calendarIsFallback: boolean;
  newsFeedProviders: string[];
  updatedAt: string;
  nyNowLabel: string;
  nyTodayKey: string;
  ffCalendarUrl: string;
  ffNewsUrl: string;
  events: LiveCalendarEvent[];
  news: LiveNewsItem[];
}

export const CalendarAndNewsView: React.FC = () => {
  const [feed, setFeed] = useState<ForexFactoryApiPayload | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [refreshing, setRefreshing] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  const [dayScope, setDayScope] = useState<'Upcoming' | 'Today' | 'Week'>('Upcoming');
  const [impactFilter, setImpactFilter] = useState<'All' | 'High' | 'MediumPlus'>('All');
  const [currencyFilter, setCurrencyFilter] = useState<string>('ALL');
  const [newsCategory, setNewsCategory] = useState<string>('All');

  const hasLoadedRef = useRef(false);

  const fetchFeed = useCallback(async (manual = false) => {
    if (manual) setRefreshing(true);
    else if (!hasLoadedRef.current) setLoading(true);

    try {
      const data = await apiFetch<ForexFactoryApiPayload>(
        manual ? '/api/market/forexfactory?refresh=1' : '/api/market/forexfactory'
      );
      hasLoadedRef.current = true;
      setFeed(data);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to load live Forex Factory calendar and news.');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    void fetchFeed(false);
    const interval = window.setInterval(() => {
      void fetchFeed(false);
    }, 90_000);
    return () => window.clearInterval(interval);
  }, [fetchFeed]);

  const availableCurrencies = useMemo(() => {
    const set = new Set<string>(['ALL', 'USD', 'EUR', 'GBP', 'JPY', 'AUD', 'CAD', 'CHF', 'NZD']);
    (feed?.events || []).forEach((ev) => {
      if (ev.currency) set.add(ev.currency);
    });
    return Array.from(set);
  }, [feed]);

  const filteredEvents = useMemo(() => {
    const events = feed?.events || [];
    return events.filter((ev) => {
      if (dayScope === 'Today' && !ev.isToday) return false;
      if (dayScope === 'Upcoming' && !ev.isUpcoming) return false;
      if (impactFilter === 'High' && ev.impact !== 'High') return false;
      if (impactFilter === 'MediumPlus' && ev.impact !== 'High' && ev.impact !== 'Medium') return false;
      if (currencyFilter !== 'ALL' && ev.currency !== currencyFilter) return false;
      return true;
    });
  }, [feed, dayScope, impactFilter, currencyFilter]);

  const filteredNews = useMemo(() => {
    const items = feed?.news || [];
    if (newsCategory === 'All') return items;
    return items.filter((item) => item.category === newsCategory);
  }, [feed, newsCategory]);

  const updatedLabel = useMemo(() => {
    if (!feed?.updatedAt) return 'Syncing...';
    const d = new Date(feed.updatedAt);
    if (Number.isNaN(d.getTime())) return 'Live';
    return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
  }, [feed?.updatedAt]);

  return (
    <div className="space-y-6">
      {/* Top Feed Status & Direct Forex Factory Bar */}
      <div className="bg-white border border-slate-200 shadow-xs rounded-xl px-5 py-3.5 flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-slate-600">
          <span className="font-semibold text-slate-950">Forex Factory Live Feed</span>
          <span aria-hidden="true">·</span>
          <span className="font-mono tabular-nums">{feed?.nyNowLabel || 'NY EST'}</span>
          <span aria-hidden="true">·</span>
          <span className="font-mono tabular-nums">Synced {updatedLabel}</span>
          {feed?.calendarFeedProvider && (
            <>
              <span aria-hidden="true">·</span>
              <span className="text-slate-500">{feed.calendarFeedProvider}</span>
            </>
          )}
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <a
            href={feed?.ffCalendarUrl || 'https://www.forexfactory.com/calendar'}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-slate-200 text-xs font-semibold text-slate-700 hover:bg-slate-50 hover:text-slate-950"
          >
            <Calendar className="w-3.5 h-3.5 text-[#D97706]" />
            <span>ForexFactory.com Calendar</span>
            <ExternalLink className="w-3 h-3" />
          </a>
          <a
            href={feed?.ffNewsUrl || 'https://www.forexfactory.com/news'}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-slate-200 text-xs font-semibold text-slate-700 hover:bg-slate-50 hover:text-slate-950"
          >
            <Newspaper className="w-3.5 h-3.5 text-[#D97706]" />
            <span>ForexFactory.com News</span>
            <ExternalLink className="w-3 h-3" />
          </a>
          <button
            type="button"
            onClick={() => void fetchFeed(true)}
            disabled={refreshing}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[#0B0F19] text-[#E5A93C] text-xs font-bold hover:bg-slate-800 disabled:opacity-60 cursor-pointer transition-colors"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${refreshing ? 'animate-spin' : ''}`} />
            <span>{refreshing ? 'Refreshing...' : 'Refresh Live'}</span>
          </button>
        </div>
      </div>

      {error && (
        <div className="bg-rose-50 border border-rose-200 rounded-xl px-5 py-3.5 flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2.5 text-xs text-rose-700 font-medium">
            <AlertCircle className="w-4 h-4 shrink-0 text-rose-600" />
            <span>{error}</span>
          </div>
          <button
            type="button"
            onClick={() => void fetchFeed(true)}
            className="px-3 py-1.5 rounded-lg bg-rose-600 text-white text-xs font-semibold hover:bg-rose-700 cursor-pointer"
          >
            Retry Feed
          </button>
        </div>
      )}

      {/* Live Economic Calendar */}
      <div className="bg-white border border-slate-200 shadow-xs rounded-xl p-6">
        <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
          <div>
            <h3 className="text-base font-bold text-slate-950">Economic Calendar (NY EST · Forex Factory)</h3>
            <p className="text-xs text-slate-500">
              Live weekly macro releases, actuals, forecasts, and high-volatility killzone windows
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <div className="flex gap-1 p-1 bg-slate-100 border border-slate-200 rounded-lg">
              {(['Upcoming', 'Today', 'Week'] as const).map((scope) => (
                <button
                  key={scope}
                  type="button"
                  onClick={() => setDayScope(scope)}
                  className={`px-2.5 py-1 text-xs font-semibold rounded-md cursor-pointer whitespace-nowrap ${
                    dayScope === scope ? 'bg-[#0B0F19] text-white font-bold' : 'text-slate-600 hover:text-slate-950'
                  }`}
                >
                  {scope === 'Week' ? 'Full Week' : scope}
                </button>
              ))}
            </div>

            <div className="flex gap-1 p-1 bg-slate-100 border border-slate-200 rounded-lg">
              {([
                { key: 'All', label: 'All Impact' },
                { key: 'MediumPlus', label: 'Med + High' },
                { key: 'High', label: 'High Only' },
              ] as const).map((f) => (
                <button
                  key={f.key}
                  type="button"
                  onClick={() => setImpactFilter(f.key)}
                  className={`px-2.5 py-1 text-xs font-semibold rounded-md cursor-pointer whitespace-nowrap ${
                    impactFilter === f.key ? 'bg-[#0B0F19] text-white font-bold' : 'text-slate-600 hover:text-slate-950'
                  }`}
                >
                  {f.label}
                </button>
              ))}
            </div>

            <select
              aria-label="Filter calendar by currency"
              value={currencyFilter}
              onChange={(e) => setCurrencyFilter(e.target.value)}
              className="px-2.5 py-1.5 text-xs font-semibold bg-white border border-slate-300 rounded-lg text-slate-900 cursor-pointer focus:outline-none focus:border-amber-500"
            >
              {availableCurrencies.map((ccy) => (
                <option key={ccy} value={ccy}>
                  {ccy === 'ALL' ? 'All Currencies' : ccy}
                </option>
              ))}
            </select>
          </div>
        </div>

        {loading && !feed ? (
          <div className="py-10 text-center text-xs text-slate-500">
            Loading live Forex Factory economic calendar...
          </div>
        ) : filteredEvents.length === 0 ? (
          <div className="py-10 text-center space-y-2">
            <p className="text-sm font-semibold text-slate-900">
              No events match the current filter ({dayScope}, {currencyFilter}, {impactFilter}).
            </p>
            <p className="text-xs text-slate-500">
              Switch to Full Week or All Impact to view all scheduled Forex Factory releases.
            </p>
            {dayScope !== 'Week' && (
              <button
                type="button"
                onClick={() => {
                  setDayScope('Week');
                  setImpactFilter('All');
                  setCurrencyFilter('ALL');
                }}
                className="mt-1 px-3 py-1.5 rounded-lg bg-[#0B0F19] text-[#E5A93C] text-xs font-bold hover:bg-slate-800 cursor-pointer transition-colors"
              >
                Show Full Week Calendar
              </button>
            )}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b border-slate-200 text-xs text-slate-500">
                  <th className="py-2.5 pr-4 whitespace-nowrap">Date · NY Time</th>
                  <th className="py-2.5 pr-4">CCY</th>
                  <th className="py-2.5 pr-4">Impact</th>
                  <th className="py-2.5 pr-4">Event</th>
                  <th className="py-2.5 pr-4 text-right">Actual</th>
                  <th className="py-2.5 pr-4 text-right">Forecast</th>
                  <th className="py-2.5 text-right">Previous</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filteredEvents.slice(0, 80).map((ev) => {
                  const impactCls =
                    ev.impact === 'High'
                      ? 'text-rose-600'
                      : ev.impact === 'Medium'
                      ? 'text-[#B45309]'
                      : ev.impact === 'Holiday'
                      ? 'text-slate-500'
                      : 'text-slate-500';
                  return (
                    <tr key={ev.id} className="hover:bg-slate-50">
                      <td className="py-3 pr-4 font-mono tabular-nums text-xs text-slate-700 whitespace-nowrap">
                        <span className="text-slate-500">{ev.nyDateLabel}</span>
                        <span className="mx-1.5 text-slate-300">·</span>
                        <span className="font-semibold text-slate-950">{ev.nyTimeLabel}</span>
                      </td>
                      <td className="py-3 pr-4 font-mono font-bold text-slate-950 whitespace-nowrap">{ev.currency}</td>
                      <td className={`py-3 pr-4 text-xs font-semibold whitespace-nowrap ${impactCls}`}>
                        {ev.impact}
                      </td>
                      <td className="py-3 pr-4 text-slate-800">
                        <a
                          href={ev.ffUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="hover:text-[#B45309] hover:underline inline-flex items-center gap-1"
                        >
                          <span>{ev.title}</span>
                        </a>
                      </td>
                      <td className="py-3 pr-4 text-right font-mono tabular-nums font-bold text-slate-950 whitespace-nowrap">
                        {ev.actual || '—'}
                      </td>
                      <td className="py-3 pr-4 text-right font-mono tabular-nums font-semibold text-slate-700 whitespace-nowrap">
                        {ev.forecast || '—'}
                      </td>
                      <td className="py-3 text-right font-mono tabular-nums text-slate-500 whitespace-nowrap">
                        {ev.previous || '—'}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Live Market & Forex Factory News Desk */}
      <div className="bg-white border border-slate-200 shadow-xs rounded-xl p-6">
        <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
          <div>
            <h3 className="text-base font-bold text-slate-950">Live Forex Factory &amp; Institutional News Wire</h3>
            <p className="text-xs text-slate-500">
              Real-time FX, central bank, gold, indices, and Forex Factory market headlines
            </p>
          </div>
          <div className="flex flex-wrap gap-1 p-1 bg-slate-100 border border-slate-200 rounded-lg">
            {['All', 'Forex Factory', 'Central Banks', 'Forex', 'Gold', 'Indices', 'Crypto'].map((cat) => (
              <button
                key={cat}
                type="button"
                onClick={() => setNewsCategory(cat)}
                className={`px-2.5 py-1 text-xs font-semibold rounded-md cursor-pointer whitespace-nowrap ${
                  newsCategory === cat ? 'bg-[#0B0F19] text-white font-bold' : 'text-slate-600 hover:text-slate-950'
                }`}
              >
                {cat}
              </button>
            ))}
          </div>
        </div>

        {loading && !feed ? (
          <div className="py-8 text-center text-xs text-slate-500">
            Loading live market news wire...
          </div>
        ) : filteredNews.length === 0 ? (
          <div className="py-8 text-center text-xs text-slate-500">
            No live headlines in {newsCategory} right now. Select All or refresh the live feed.
          </div>
        ) : (
          <div className="divide-y divide-slate-100">
            {filteredNews.map((item) => (
              <div key={item.id} className="py-3.5">
                <div className="flex flex-wrap items-center gap-2 text-xs text-slate-500 mb-1">
                  <span className="font-semibold text-[#B45309]">{item.category}</span>
                  <span aria-hidden="true">·</span>
                  <span className="font-medium text-slate-700">{item.source}</span>
                  <span aria-hidden="true">·</span>
                  <span className="font-mono tabular-nums">{item.timeAgo}</span>
                </div>
                <a
                  href={item.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-sm font-bold text-slate-950 hover:text-[#B45309] inline-flex items-start gap-1.5"
                >
                  <span>{item.title}</span>
                  <ExternalLink className="w-3.5 h-3.5 mt-0.5 shrink-0 text-slate-400" />
                </a>
                {item.summary && <p className="text-xs text-slate-600 mt-1">{item.summary}</p>}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};
