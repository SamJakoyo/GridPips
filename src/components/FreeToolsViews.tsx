import React, { useEffect, useRef, useState } from 'react';
import { Trash2, Plus, RotateCcw, X } from 'lucide-react';
import { apiFetch, type MarketSymbolQuote } from '../lib/api';
import type { JournalTrade, PaperHistoryItem, PaperPosition } from '../types';

function resolveTradingViewSymbol(sym: string): string {
  const upper = sym.trim().toUpperCase();
  if (upper.includes(':')) return upper;
  if (upper === 'XAUUSD' || upper === 'XAGUSD') return `OANDA:${upper}`;
  if (upper === 'NAS100' || upper === 'US100') return 'CAPITALCOM:US100';
  if (upper === 'US30') return 'CAPITALCOM:US30';
  if (upper === 'SPX500' || upper === 'US500') return 'CAPITALCOM:US500';
  if (upper === 'BTCUSD' || upper === 'ETHUSD') return `BITSTAMP:${upper}`;
  return `FX:${upper}`;
}

/* ---------------- TradingView Live Charts ---------------- */
export const TradingViewChartsView: React.FC<{
  watchlist: string[];
  onUpdateWatchlist?: (symbols: string[]) => Promise<void>;
}> = ({ watchlist, onUpdateWatchlist }) => {
  const list = watchlist.length ? watchlist : ['EURUSD', 'GBPUSD', 'XAUUSD', 'NAS100', 'BTCUSD'];
  const [symbol, setSymbol] = useState(list[0] || 'EURUSD');
  const [newSym, setNewSym] = useState('');
  const [savingWl, setSavingWl] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    el.innerHTML = '';
    const script = document.createElement('script');
    script.src = 'https://s3.tradingview.com/external-embedding/embed-widget-advanced-chart.js';
    script.async = true;
    script.innerHTML = JSON.stringify({
      autosize: true,
      symbol: resolveTradingViewSymbol(symbol),
      interval: '60',
      timezone: 'Etc/UTC',
      theme: 'light',
      style: '1',
      locale: 'en',
      enable_publishing: false,
      allow_symbol_change: true,
      support_host: 'https://www.tradingview.com',
    });
    el.appendChild(script);
  }, [symbol]);

  async function handleAddSymbol(e: React.FormEvent) {
    e.preventDefault();
    const cleaned = newSym.trim().toUpperCase();
    if (!cleaned || list.includes(cleaned)) {
      setNewSym('');
      return;
    }
    const next = [...list, cleaned];
    setNewSym('');
    setSymbol(cleaned);
    if (onUpdateWatchlist) {
      setSavingWl(true);
      await onUpdateWatchlist(next).finally(() => setSavingWl(false));
    }
  }

  async function handleRemoveSymbol(symToRemove: string) {
    if (list.length <= 1) return;
    const next = list.filter((s) => s !== symToRemove);
    if (symbol === symToRemove) setSymbol(next[0]);
    if (onUpdateWatchlist) {
      setSavingWl(true);
      await onUpdateWatchlist(next).finally(() => setSavingWl(false));
    }
  }

  return (
    <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
      <div className="lg:col-span-3 bg-white border border-slate-200 rounded-xl p-4 h-fit space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-bold text-slate-950">Watchlist Instruments</h3>
          {savingWl && <span className="text-[11px] text-slate-400">Syncing...</span>}
        </div>
        <div className="space-y-1">
          {list.map((sym) => (
            <div
              key={sym}
              className={`flex items-center justify-between rounded-lg transition-colors ${
                symbol === sym ? 'bg-slate-950 text-white' : 'text-slate-700 hover:bg-slate-100'
              }`}
            >
              <button
                type="button"
                onClick={() => setSymbol(sym)}
                className="flex-1 text-left px-3 py-2 text-xs font-mono font-semibold cursor-pointer"
              >
                {sym}
              </button>
              {list.length > 1 && (
                <button
                  type="button"
                  onClick={() => handleRemoveSymbol(sym)}
                  className={`px-2 py-2 cursor-pointer ${
                    symbol === sym ? 'text-slate-400 hover:text-white' : 'text-slate-400 hover:text-rose-600'
                  }`}
                  aria-label={`Remove ${sym}`}
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              )}
            </div>
          ))}
        </div>

        <form onSubmit={handleAddSymbol} className="pt-3 border-t border-slate-100 flex gap-1.5">
          <input
            type="text"
            value={newSym}
            onChange={(e) => setNewSym(e.target.value)}
            placeholder="Add pair (e.g. USDJPY)"
            className="flex-1 min-w-0 px-2.5 py-1.5 text-xs border border-slate-300 rounded-lg font-mono uppercase"
          />
          <button
            type="submit"
            className="px-2.5 py-1.5 bg-blue-600 text-white text-xs font-semibold rounded-lg hover:bg-blue-700 cursor-pointer shrink-0"
          >
            Add
          </button>
        </form>
      </div>

      <div className="lg:col-span-9 bg-white border border-slate-200 rounded-xl p-4">
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-sm font-bold text-slate-950 font-mono">
            {symbol} · Live TradingView Chart
          </h3>
          <span className="text-xs text-slate-500">Official Widget</span>
        </div>
        <div ref={containerRef} className="w-full h-[560px] rounded-lg overflow-hidden border border-slate-200" />
      </div>
    </div>
  );
};

/* ---------------- Trading Journal ---------------- */
export const JournalView: React.FC<{
  trades: JournalTrade[];
  onRefresh: () => Promise<void>;
}> = ({ trades, onRefresh }) => {
  const [showForm, setShowForm] = useState(false);
  const [instrument, setInstrument] = useState('EURUSD');
  const [side, setSide] = useState<'Buy' | 'Sell'>('Buy');
  const [entryPrice, setEntryPrice] = useState('');
  const [sl, setSl] = useState('');
  const [tp, setTp] = useState('');
  const [size, setSize] = useState('');
  const [rr, setRr] = useState('2.5');
  const [pnl, setPnl] = useState('');
  const [tradeDate, setTradeDate] = useState(new Date().toISOString().slice(0, 10));
  const [session, setSession] = useState('New York');
  const [strategy, setStrategy] = useState('ICT Silver Bullet FVG');
  const [reasonEntry, setReasonEntry] = useState('');
  const [lessons, setLessons] = useState('');
  const [imageData, setImageData] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const totalPnl = trades.reduce((acc, t) => acc + Number(t.pnl || 0), 0);
  const wins = trades.filter((t) => Number(t.pnl) > 0).length;
  const winRate = trades.length ? Math.round((wins / trades.length) * 100) : 0;

  async function handleAddTrade(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    try {
      await apiFetch('/api/workspace/journal', {
        method: 'POST',
        body: JSON.stringify({
          instrument,
          side,
          entryPrice,
          sl,
          tp,
          size,
          rr,
          pnl: Number(pnl),
          tradeDate,
          session,
          strategy,
          reasonEntry,
          lessons,
          imageData,
        }),
      });
      setShowForm(false);
      setPnl('');
      setReasonEntry('');
      setLessons('');
      setImageData(null);
      await onRefresh();
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(id: number) {
    await apiFetch(`/api/workspace/journal/${id}`, { method: 'DELETE' });
    await onRefresh();
  }

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => setImageData(typeof reader.result === 'string' ? reader.result : null);
    reader.readAsDataURL(file);
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="grid grid-cols-3 gap-4 flex-1 max-w-xl">
          <div className="bg-white border border-slate-200 rounded-xl p-4">
            <div className="text-xs text-slate-500">Logged Trades</div>
            <div className="text-xl font-bold font-mono tabular-nums text-slate-950">{trades.length}</div>
          </div>
          <div className="bg-white border border-slate-200 rounded-xl p-4">
            <div className="text-xs text-slate-500">Win Rate</div>
            <div className="text-xl font-bold font-mono tabular-nums text-slate-950">{winRate}%</div>
          </div>
          <div className="bg-white border border-slate-200 rounded-xl p-4">
            <div className="text-xs text-slate-500">Net P&amp;L</div>
            <div
              className={`text-xl font-bold font-mono tabular-nums ${
                totalPnl >= 0 ? 'text-emerald-700' : 'text-rose-700'
              }`}
            >
              {totalPnl >= 0 ? '+' : ''}${totalPnl.toFixed(2)}
            </div>
          </div>
        </div>
        <button
          onClick={() => setShowForm(!showForm)}
          className="px-4 py-2.5 bg-blue-600 text-white text-xs font-semibold rounded-lg hover:bg-blue-700 inline-flex items-center gap-2 cursor-pointer"
        >
          <Plus className="w-4 h-4" />
          {showForm ? 'Cancel' : 'Log Trade'}
        </button>
      </div>

      {showForm && (
        <form onSubmit={handleAddTrade} className="bg-white border border-slate-200 rounded-xl p-6 space-y-4">
          <h3 className="text-base font-bold text-slate-950">New Journal Entry</h3>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">Instrument</label>
              <input
                required
                value={instrument}
                onChange={(e) => setInstrument(e.target.value.toUpperCase())}
                className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg font-mono"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">Direction</label>
              <select
                value={side}
                onChange={(e) => setSide(e.target.value as 'Buy' | 'Sell')}
                className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg bg-white"
              >
                <option value="Buy">Buy</option>
                <option value="Sell">Sell</option>
              </select>
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">Net P&amp;L ($)</label>
              <input
                type="number"
                step="any"
                required
                value={pnl}
                onChange={(e) => setPnl(e.target.value)}
                placeholder="e.g. 240.50 or -95"
                className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg font-mono"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">Entry</label>
              <input
                type="number"
                step="any"
                value={entryPrice}
                onChange={(e) => setEntryPrice(e.target.value)}
                className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg font-mono"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">Stop Loss</label>
              <input
                type="number"
                step="any"
                value={sl}
                onChange={(e) => setSl(e.target.value)}
                className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg font-mono"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">Take Profit</label>
              <input
                type="number"
                step="any"
                value={tp}
                onChange={(e) => setTp(e.target.value)}
                className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg font-mono"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">Lot Size</label>
              <input
                type="number"
                step="any"
                value={size}
                onChange={(e) => setSize(e.target.value)}
                className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg font-mono"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">Date</label>
              <input
                type="date"
                value={tradeDate}
                onChange={(e) => setTradeDate(e.target.value)}
                className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">Session</label>
              <select
                value={session}
                onChange={(e) => setSession(e.target.value)}
                className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg bg-white"
              >
                <option>London</option>
                <option>New York</option>
                <option>Asian</option>
                <option>Silver Bullet</option>
              </select>
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">Strategy</label>
              <input
                value={strategy}
                onChange={(e) => setStrategy(e.target.value)}
                className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">R:R Achieved</label>
              <input
                type="number"
                step="any"
                value={rr}
                onChange={(e) => setRr(e.target.value)}
                className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg font-mono"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">Entry Rationale</label>
              <textarea
                rows={2}
                value={reasonEntry}
                onChange={(e) => setReasonEntry(e.target.value)}
                placeholder="Swept SSL, M15 MSS + FVG 50% CE..."
                className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">Lessons / Psychology</label>
              <textarea
                rows={2}
                value={lessons}
                onChange={(e) => setLessons(e.target.value)}
                className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">Chart Screenshot (Optional)</label>
            <input type="file" accept="image/*" onChange={handleFileChange} className="text-xs" />
          </div>

          <button
            type="submit"
            disabled={saving}
            className="px-5 py-2.5 bg-slate-950 text-white text-xs font-semibold rounded-lg hover:bg-slate-800 cursor-pointer"
          >
            {saving ? 'Saving...' : 'Save Trade Entry'}
          </button>
        </form>
      )}

      {trades.length === 0 ? (
        <div className="bg-white border border-slate-200 rounded-xl p-10 text-center">
          <h3 className="text-base font-bold text-slate-950 mb-1">No journal trades logged yet</h3>
          <p className="text-sm text-slate-500 mb-4">
            Record your ICT and SMC executions to automatically compute equity curve and strategy analytics.
          </p>
          <button
            onClick={() => setShowForm(true)}
            className="px-4 py-2 bg-blue-600 text-white text-xs font-semibold rounded-lg cursor-pointer"
          >
            Log First Trade
          </button>
        </div>
      ) : (
        <div className="space-y-3">
          {trades.map((t) => (
            <div key={t.id} className="bg-white border border-slate-200 rounded-xl p-5">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <div className="flex items-center gap-2 text-sm font-bold text-slate-950">
                    <span className="font-mono">{t.instrument}</span>
                    <span aria-hidden="true">·</span>
                    <span className={t.side === 'Buy' ? 'text-emerald-700' : 'text-rose-700'}>{t.side}</span>
                  </div>
                  <div className="text-xs text-slate-500 mt-0.5">
                    {t.trade_date} · {t.session} · {t.strategy} · R:R {t.rr || '—'}
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <span
                    className={`text-base font-bold font-mono tabular-nums ${
                      Number(t.pnl) >= 0 ? 'text-emerald-700' : 'text-rose-700'
                    }`}
                  >
                    {Number(t.pnl) >= 0 ? '+' : ''}${Number(t.pnl).toFixed(2)}
                  </span>
                  <button
                    onClick={() => handleDelete(t.id)}
                    className="p-1.5 text-slate-400 hover:text-rose-600 cursor-pointer"
                    aria-label="Delete trade"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>
              {(t.reason_entry || t.lessons) && (
                <div className="mt-3 pt-3 border-t border-slate-100 text-xs text-slate-600 space-y-1">
                  {t.reason_entry && (
                    <p>
                      <strong className="text-slate-800">Entry:</strong> {t.reason_entry}
                    </p>
                  )}
                  {t.lessons && (
                    <p>
                      <strong className="text-slate-800">Notes:</strong> {t.lessons}
                    </p>
                  )}
                </div>
              )}
              {t.image_data && (
                <img
                  src={t.image_data}
                  alt={`${t.instrument} setup screenshot`}
                  className="mt-3 rounded-lg border border-slate-200 max-h-64 object-contain"
                />
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

/* ---------------- Journal Analytics ---------------- */
export const AnalyticsView: React.FC<{ trades: JournalTrade[] }> = ({ trades }) => {
  if (trades.length === 0) {
    return (
      <div className="bg-white border border-slate-200 rounded-xl p-10 text-center">
        <h3 className="text-base font-bold text-slate-950 mb-1">No Analytics Data Yet</h3>
        <p className="text-sm text-slate-500">
          Log trades in your Trading Journal to generate your equity curve, win/loss distribution, and strategy/session breakdowns.
        </p>
      </div>
    );
  }

  const ordered = [...trades].reverse();
  let running = 0;
  const equityPoints = ordered.map((t, i) => {
    running += Number(t.pnl || 0);
    return { x: i, y: running };
  });

  const wins = trades.filter((t) => Number(t.pnl) > 0);
  const losses = trades.filter((t) => Number(t.pnl) < 0);
  const grossWin = wins.reduce((a, b) => a + Number(b.pnl), 0);
  const grossLoss = Math.abs(losses.reduce((a, b) => a + Number(b.pnl), 0));
  const profitFactor = grossLoss > 0 ? (grossWin / grossLoss).toFixed(2) : grossWin > 0 ? '∞' : '0.00';
  const winPct = Math.round((wins.length / trades.length) * 100);

  const byStrategy: Record<string, number> = {};
  const bySession: Record<string, number> = {};
  const byInstrument: Record<string, number> = {};
  for (const t of trades) {
    const strat = t.strategy || 'Unspecified';
    const sess = t.session || 'Unspecified';
    const inst = t.instrument || 'Unspecified';
    const p = Number(t.pnl || 0);
    byStrategy[strat] = (byStrategy[strat] || 0) + p;
    bySession[sess] = (bySession[sess] || 0) + p;
    byInstrument[inst] = (byInstrument[inst] || 0) + p;
  }

  const stratEntries = Object.entries(byStrategy).sort((a, b) => b[1] - a[1]);
  const sessEntries = Object.entries(bySession).sort((a, b) => b[1] - a[1]);
  const instEntries = Object.entries(byInstrument).sort((a, b) => b[1] - a[1]);

  const maxY = Math.max(...equityPoints.map((p) => p.y), 10);
  const minY = Math.min(...equityPoints.map((p) => p.y), 0);
  const rangeY = maxY - minY || 1;
  const svgW = 680;
  const svgH = 220;
  const polyline = equityPoints
    .map((p, idx) => {
      const x = 20 + (idx / Math.max(1, equityPoints.length - 1)) * (svgW - 40);
      const y = 20 + ((maxY - p.y) / rangeY) * (svgH - 40);
      return `${x},${y}`;
    })
    .join(' ');

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-white border border-slate-200 rounded-xl p-4">
          <div className="text-xs text-slate-500">Total Trades</div>
          <div className="text-xl font-bold font-mono tabular-nums text-slate-950">{trades.length}</div>
        </div>
        <div className="bg-white border border-slate-200 rounded-xl p-4">
          <div className="text-xs text-slate-500">Wins / Losses ({winPct}%)</div>
          <div className="text-xl font-bold font-mono tabular-nums text-slate-950">
            {wins.length} / {losses.length}
          </div>
          <div className="mt-2 h-1.5 w-full bg-rose-100 rounded-full overflow-hidden">
            <div className="h-full bg-emerald-600" style={{ width: `${winPct}%` }} />
          </div>
        </div>
        <div className="bg-white border border-slate-200 rounded-xl p-4">
          <div className="text-xs text-slate-500">Profit Factor</div>
          <div className="text-xl font-bold font-mono tabular-nums text-blue-600">{profitFactor}</div>
        </div>
        <div className="bg-white border border-slate-200 rounded-xl p-4">
          <div className="text-xs text-slate-500">Cumulative P&amp;L</div>
          <div
            className={`text-xl font-bold font-mono tabular-nums ${
              running >= 0 ? 'text-emerald-700' : 'text-rose-700'
            }`}
          >
            ${running.toFixed(2)}
          </div>
        </div>
      </div>

      <div className="bg-white border border-slate-200 rounded-xl p-6">
        <h3 className="text-base font-bold text-slate-950 mb-4">Cumulative Equity Curve</h3>
        <svg viewBox={`0 0 ${svgW} ${svgH}`} className="w-full h-56">
          <polyline fill="none" stroke="#2563eb" strokeWidth="2.5" points={polyline} />
        </svg>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="bg-white border border-slate-200 rounded-xl p-5">
          <h4 className="text-sm font-bold text-slate-950 mb-3">Performance by Strategy</h4>
          <div className="divide-y divide-slate-100 text-xs">
            {stratEntries.map(([name, val]) => (
              <div key={name} className="py-2 flex items-center justify-between gap-2">
                <span className="text-slate-700 truncate">{name}</span>
                <span className={`font-mono tabular-nums font-bold ${val >= 0 ? 'text-emerald-700' : 'text-rose-700'}`}>
                  {val >= 0 ? '+' : ''}${val.toFixed(2)}
                </span>
              </div>
            ))}
          </div>
        </div>

        <div className="bg-white border border-slate-200 rounded-xl p-5">
          <h4 className="text-sm font-bold text-slate-950 mb-3">Performance by Session</h4>
          <div className="divide-y divide-slate-100 text-xs">
            {sessEntries.map(([name, val]) => (
              <div key={name} className="py-2 flex items-center justify-between gap-2">
                <span className="text-slate-700 truncate">{name}</span>
                <span className={`font-mono tabular-nums font-bold ${val >= 0 ? 'text-emerald-700' : 'text-rose-700'}`}>
                  {val >= 0 ? '+' : ''}${val.toFixed(2)}
                </span>
              </div>
            ))}
          </div>
        </div>

        <div className="bg-white border border-slate-200 rounded-xl p-5">
          <h4 className="text-sm font-bold text-slate-950 mb-3">Edge Summary</h4>
          <div className="space-y-2.5 text-xs">
            <div className="flex justify-between py-1.5 border-b border-slate-100">
              <span className="text-slate-500">Top Strategy</span>
              <span className="font-semibold text-slate-950">{stratEntries[0]?.[0] || '—'}</span>
            </div>
            <div className="flex justify-between py-1.5 border-b border-slate-100">
              <span className="text-slate-500">Best Session</span>
              <span className="font-semibold text-slate-950">{sessEntries[0]?.[0] || '—'}</span>
            </div>
            <div className="flex justify-between py-1.5 border-b border-slate-100">
              <span className="text-slate-500">Best Instrument</span>
              <span className="font-mono font-semibold text-slate-950">{instEntries[0]?.[0] || '—'}</span>
            </div>
            <div className="flex justify-between py-1.5">
              <span className="text-slate-500">Worst Instrument</span>
              <span className="font-mono font-semibold text-rose-700">
                {instEntries[instEntries.length - 1]?.[0] || '—'}
              </span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

/* ---------------- All 8 Risk & Trading Calculators ---------------- */
type CalcTabKey = 'risk' | 'position' | 'rr' | 'pip' | 'pl' | 'percent' | 'compound' | 'margin';

export const CalculatorsView: React.FC = () => {
  const [tab, setTab] = useState<CalcTabKey>('risk');
  const [balance, setBalance] = useState(10000);
  const [riskPct, setRiskPct] = useState(1);
  const [entry, setEntry] = useState(1.085);
  const [sl, setSl] = useState(1.08);
  const [tp, setTp] = useState(1.0975);
  const [slPips, setSlPips] = useState(25);
  const [pipVal, setPipVal] = useState(10);
  const [lots, setLots] = useState(0.4);
  const [pipSize, setPipSize] = useState(0.0001);
  const [pctA, setPctA] = useState(10000);
  const [pctB, setPctB] = useState(11250);
  const [monthlyRet, setMonthlyRet] = useState(8);
  const [months, setMonths] = useState(12);
  const [leverage, setLeverage] = useState(500);
  const [units, setUnits] = useState(10000);

  const maxRiskUsd = (balance * riskPct) / 100;
  const slDist = Math.abs(entry - sl) || 0.0001;
  const tpDist = Math.abs(tp - entry);
  const rrRatio = tpDist / slDist;
  const calcLots = slPips * pipVal > 0 ? maxRiskUsd / (slPips * pipVal) : 0;
  const unitsFromLots = lots * 100000;
  const dollarPerPip = unitsFromLots * pipSize;
  const plPips = pipSize > 0 ? tpDist / pipSize : 0;
  const estProfitFromLots = (tp - entry) * unitsFromLots;
  const pctChange = pctA !== 0 ? ((pctB - pctA) / pctA) * 100 : 0;
  const compounded = balance * Math.pow(1 + monthlyRet / 100, months);
  const requiredMargin = leverage > 0 ? (units * entry) / leverage : 0;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap gap-1 p-1 bg-slate-200/70 rounded-lg w-fit">
        {(
          [
            ['risk', '1. Risk'],
            ['position', '2. Position Size'],
            ['rr', '3. Risk / Reward'],
            ['pip', '4. Pip Value'],
            ['pl', '5. Profit / Loss'],
            ['percent', '6. Percentage'],
            ['compound', '7. Compounding'],
            ['margin', '8. Margin'],
          ] as const
        ).map(([key, label]) => (
          <button
            key={key}
            onClick={() => setTab(key)}
            className={`px-3 py-1.5 text-xs font-semibold rounded-md cursor-pointer ${
              tab === key ? 'bg-white text-slate-950 shadow-xs' : 'text-slate-600'
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="bg-white border border-slate-200 rounded-xl p-6 space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">Account Balance ($)</label>
              <input
                type="number"
                value={balance}
                onChange={(e) => setBalance(Number(e.target.value))}
                className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg font-mono"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">Risk per Trade (%)</label>
              <input
                type="number"
                step="0.1"
                value={riskPct}
                onChange={(e) => setRiskPct(Number(e.target.value))}
                className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg font-mono"
              />
            </div>
          </div>

          {(tab === 'risk' || tab === 'rr' || tab === 'pl' || tab === 'margin') && (
            <div className="grid grid-cols-3 gap-3">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Entry</label>
                <input
                  type="number"
                  step="any"
                  value={entry}
                  onChange={(e) => setEntry(Number(e.target.value))}
                  className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg font-mono"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Stop Loss</label>
                <input
                  type="number"
                  step="any"
                  value={sl}
                  onChange={(e) => setSl(Number(e.target.value))}
                  className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg font-mono"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Take Profit</label>
                <input
                  type="number"
                  step="any"
                  value={tp}
                  onChange={(e) => setTp(Number(e.target.value))}
                  className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg font-mono"
                />
              </div>
            </div>
          )}

          {tab === 'position' && (
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Stop Loss (Pips)</label>
                <input
                  type="number"
                  value={slPips}
                  onChange={(e) => setSlPips(Number(e.target.value))}
                  className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg font-mono"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Pip Value / Std Lot ($)</label>
                <input
                  type="number"
                  value={pipVal}
                  onChange={(e) => setPipVal(Number(e.target.value))}
                  className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg font-mono"
                />
              </div>
            </div>
          )}

          {(tab === 'pip' || tab === 'pl') && (
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Position Size (Lots)</label>
                <input
                  type="number"
                  step="0.01"
                  value={lots}
                  onChange={(e) => setLots(Number(e.target.value))}
                  className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg font-mono"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Pip Size (0.0001 or 0.01 JPY)</label>
                <input
                  type="number"
                  step="any"
                  value={pipSize}
                  onChange={(e) => setPipSize(Number(e.target.value))}
                  className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg font-mono"
                />
              </div>
            </div>
          )}

          {tab === 'percent' && (
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Starting Value ($)</label>
                <input
                  type="number"
                  step="any"
                  value={pctA}
                  onChange={(e) => setPctA(Number(e.target.value))}
                  className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg font-mono"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Ending Value ($)</label>
                <input
                  type="number"
                  step="any"
                  value={pctB}
                  onChange={(e) => setPctB(Number(e.target.value))}
                  className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg font-mono"
                />
              </div>
            </div>
          )}

          {tab === 'compound' && (
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Monthly Gain (%)</label>
                <input
                  type="number"
                  value={monthlyRet}
                  onChange={(e) => setMonthlyRet(Number(e.target.value))}
                  className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg font-mono"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Months</label>
                <input
                  type="number"
                  value={months}
                  onChange={(e) => setMonths(Number(e.target.value))}
                  className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg font-mono"
                />
              </div>
            </div>
          )}

          {tab === 'margin' && (
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Units (10,000 = 0.1 Lot)</label>
                <input
                  type="number"
                  value={units}
                  onChange={(e) => setUnits(Number(e.target.value))}
                  className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg font-mono"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Leverage (1:X)</label>
                <input
                  type="number"
                  value={leverage}
                  onChange={(e) => setLeverage(Number(e.target.value))}
                  className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg font-mono"
                />
              </div>
            </div>
          )}
        </div>

        <div className="bg-slate-950 text-white rounded-xl p-6 space-y-2.5 font-mono tabular-nums">
          <div className="text-xs text-slate-400">GRIDPIPs Calculated Planning Output</div>
          <div className="flex justify-between py-2 border-b border-slate-800 text-sm">
            <span className="text-slate-400 font-sans">Maximum Risk ($)</span>
            <span className="font-bold text-rose-400">-${maxRiskUsd.toFixed(2)}</span>
          </div>
          <div className="flex justify-between py-2 border-b border-slate-800 text-sm">
            <span className="text-slate-400 font-sans">Recommended Position Size</span>
            <span className="font-bold text-white">{calcLots.toFixed(2)} lots</span>
          </div>
          <div className="flex justify-between py-2 border-b border-slate-800 text-sm">
            <span className="text-slate-400 font-sans">Risk : Reward Ratio</span>
            <span className="font-bold text-blue-400">1 : {rrRatio.toFixed(2)}</span>
          </div>
          <div className="flex justify-between py-2 border-b border-slate-800 text-sm">
            <span className="text-slate-400 font-sans">Dollar Value per Pip ({lots} lots)</span>
            <span className="font-bold text-white">${dollarPerPip.toFixed(2)} / pip</span>
          </div>
          <div className="flex justify-between py-2 border-b border-slate-800 text-sm">
            <span className="text-slate-400 font-sans">Estimated P&amp;L ({plPips.toFixed(1)} pips)</span>
            <span className={`font-bold ${estProfitFromLots >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
              {estProfitFromLots >= 0 ? '+' : ''}${estProfitFromLots.toFixed(2)}
            </span>
          </div>
          <div className="flex justify-between py-2 border-b border-slate-800 text-sm">
            <span className="text-slate-400 font-sans">Account Percentage Change</span>
            <span className={`font-bold ${pctChange >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
              {pctChange >= 0 ? '+' : ''}{pctChange.toFixed(2)}%
            </span>
          </div>
          <div className="flex justify-between py-2 border-b border-slate-800 text-sm">
            <span className="text-slate-400 font-sans">Projected Compound ({months}m)</span>
            <span className="font-bold text-emerald-400">
              ${compounded.toLocaleString(undefined, { maximumFractionDigits: 2 })}
            </span>
          </div>
          <div className="flex justify-between py-2 text-sm">
            <span className="text-slate-400 font-sans">Est. Required Margin (1:{leverage})</span>
            <span className="font-bold text-white">${requiredMargin.toFixed(2)}</span>
          </div>
        </div>
      </div>
    </div>
  );
};

/* ---------------- Paper Trading Simulator ---------------- */
export const PaperTradingView: React.FC<{ quotes: MarketSymbolQuote[] }> = ({ quotes }) => {
  const [balance, setBalance] = useState(10000);
  const [positions, setPositions] = useState<PaperPosition[]>([]);
  const [history, setHistory] = useState<PaperHistoryItem[]>([]);
  const [symbol, setSymbol] = useState('EURUSD');
  const [side, setSide] = useState<'Buy' | 'Sell'>('Buy');
  const [size, setSize] = useState(10000);
  const [slPrice, setSlPrice] = useState('');
  const [tpPrice, setTpPrice] = useState('');

  useEffect(() => {
    apiFetch<{ balance: number; positions: PaperPosition[]; history: PaperHistoryItem[] }>('/api/workspace/paper')
      .then((res) => {
        setBalance(res.balance);
        setPositions(res.positions || []);
        setHistory(res.history || []);
      })
      .catch(() => {});
  }, []);

  function calcLivePnl(p: PaperPosition): number {
    const q = quotes.find((item) => item.sym === p.symbol);
    const cur = q ? q.price : p.entry;
    const diff = p.side === 'Buy' ? cur - p.entry : p.entry - cur;
    return diff * p.size;
  }

  async function savePaperState(nextBalance: number, nextPos: PaperPosition[], nextHist: PaperHistoryItem[]) {
    setBalance(nextBalance);
    setPositions(nextPos);
    setHistory(nextHist);
    await apiFetch('/api/workspace/paper', {
      method: 'POST',
      body: JSON.stringify({ balance: nextBalance, positions: nextPos, history: nextHist }),
    });
  }

  async function handleOpen(e: React.FormEvent) {
    e.preventDefault();
    const q = quotes.find((item) => item.sym === symbol);
    const entry = q ? q.price : 1;
    const pos: PaperPosition = {
      id: `${Date.now()}`,
      symbol,
      side,
      size,
      entry,
      sl: slPrice ? Number(slPrice) : null,
      tp: tpPrice ? Number(tpPrice) : null,
    };
    setSlPrice('');
    setTpPrice('');
    await savePaperState(balance, [...positions, pos], history);
  }

  async function handleClose(pos: PaperPosition) {
    const q = quotes.find((item) => item.sym === pos.symbol);
    const exit = q ? q.price : pos.entry;
    const pnl = calcLivePnl(pos);
    const histItem: PaperHistoryItem = {
      id: pos.id,
      symbol: pos.symbol,
      side: pos.side,
      entry: pos.entry,
      exit,
      pnl,
      closedAt: new Date().toLocaleTimeString(),
    };
    await savePaperState(
      balance + pnl,
      positions.filter((p) => p.id !== pos.id),
      [histItem, ...history]
    );
  }

  const equity = balance + positions.reduce((a, p) => a + calcLivePnl(p), 0);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="grid grid-cols-3 gap-4 flex-1 max-w-xl">
          <div className="bg-white border border-slate-200 rounded-xl p-4">
            <div className="text-xs text-slate-500">Virtual Cash</div>
            <div className="text-lg font-bold font-mono tabular-nums text-slate-950">${balance.toFixed(2)}</div>
          </div>
          <div className="bg-white border border-slate-200 rounded-xl p-4">
            <div className="text-xs text-slate-500">Live Equity</div>
            <div className={`text-lg font-bold font-mono tabular-nums ${equity >= balance ? 'text-emerald-700' : 'text-rose-700'}`}>
              ${equity.toFixed(2)}
            </div>
          </div>
          <div className="bg-white border border-slate-200 rounded-xl p-4">
            <div className="text-xs text-slate-500">Open Positions</div>
            <div className="text-lg font-bold font-mono tabular-nums text-slate-950">{positions.length}</div>
          </div>
        </div>
        <button
          onClick={() => savePaperState(10000, [], [])}
          className="px-4 py-2 border border-slate-300 bg-white text-xs font-semibold rounded-lg hover:bg-slate-50 inline-flex items-center gap-1.5 cursor-pointer"
        >
          <RotateCcw className="w-3.5 h-3.5" />
          Reset $10k
        </button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        <form onSubmit={handleOpen} className="lg:col-span-4 bg-white border border-slate-200 rounded-xl p-5 space-y-4">
          <h3 className="text-base font-bold text-slate-950">Open Virtual Trade</h3>
          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">Symbol</label>
            <select
              value={symbol}
              onChange={(e) => setSymbol(e.target.value)}
              className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg bg-white font-mono"
            >
              {quotes.map((q) => (
                <option key={q.sym} value={q.sym}>
                  {q.sym} ({q.price.toFixed(q.digits)})
                </option>
              ))}
            </select>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">Side</label>
              <select
                value={side}
                onChange={(e) => setSide(e.target.value as 'Buy' | 'Sell')}
                className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg bg-white"
              >
                <option value="Buy">Buy</option>
                <option value="Sell">Sell</option>
              </select>
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">Units</label>
              <input
                type="number"
                value={size}
                onChange={(e) => setSize(Number(e.target.value))}
                className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg font-mono"
              />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">Stop Loss (Opt.)</label>
              <input
                type="number"
                step="any"
                value={slPrice}
                onChange={(e) => setSlPrice(e.target.value)}
                placeholder="Optional"
                className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg font-mono"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">Take Profit (Opt.)</label>
              <input
                type="number"
                step="any"
                value={tpPrice}
                onChange={(e) => setTpPrice(e.target.value)}
                placeholder="Optional"
                className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg font-mono"
              />
            </div>
          </div>
          <button
            type="submit"
            className="w-full py-2.5 bg-blue-600 text-white text-xs font-semibold rounded-lg hover:bg-blue-700 cursor-pointer"
          >
            Execute Paper Order
          </button>
        </form>

        <div className="lg:col-span-8 bg-white border border-slate-200 rounded-xl p-5">
          <h3 className="text-base font-bold text-slate-950 mb-4">Active Paper Positions</h3>
          {positions.length === 0 ? (
            <p className="text-sm text-slate-500">No open positions. Execute a practice order on the left.</p>
          ) : (
            <div className="space-y-2.5">
              {positions.map((p) => {
                const pnl = calcLivePnl(p);
                return (
                  <div
                    key={p.id}
                    className="p-3.5 border border-slate-200 rounded-lg flex items-center justify-between gap-4"
                  >
                    <div>
                      <div className="text-sm font-bold font-mono text-slate-950">
                        {p.symbol} · <span className={p.side === 'Buy' ? 'text-emerald-700' : 'text-rose-700'}>{p.side}</span>
                      </div>
                      <div className="text-xs text-slate-500 font-mono">
                        Entry {p.entry} · Units {p.size}
                        {p.sl ? ` · SL ${p.sl}` : ''}
                        {p.tp ? ` · TP ${p.tp}` : ''}
                      </div>
                    </div>
                    <div className="flex items-center gap-4">
                      <span
                        className={`text-sm font-bold font-mono tabular-nums ${
                          pnl >= 0 ? 'text-emerald-700' : 'text-rose-700'
                        }`}
                      >
                        {pnl >= 0 ? '+' : ''}${pnl.toFixed(2)}
                      </span>
                      <button
                        onClick={() => handleClose(p)}
                        className="px-3 py-1.5 bg-slate-950 text-white text-xs font-semibold rounded-md cursor-pointer"
                      >
                        Close
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {history.length > 0 && (
        <div className="bg-white border border-slate-200 rounded-xl p-6">
          <h3 className="text-base font-bold text-slate-950 mb-4">Closed Paper Trade History</h3>
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b border-slate-200 text-xs text-slate-500">
                  <th className="py-2 pr-4">Symbol</th>
                  <th className="py-2 pr-4">Side</th>
                  <th className="py-2 pr-4">Entry</th>
                  <th className="py-2 pr-4">Exit</th>
                  <th className="py-2 pr-4 text-right">Closed</th>
                  <th className="py-2 text-right">Realized P&amp;L</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-xs">
                {history.slice(0, 20).map((h) => (
                  <tr key={h.id}>
                    <td className="py-2.5 pr-4 font-mono font-bold text-slate-950">{h.symbol}</td>
                    <td className={`py-2.5 pr-4 font-semibold ${h.side === 'Buy' ? 'text-emerald-700' : 'text-rose-700'}`}>
                      {h.side}
                    </td>
                    <td className="py-2.5 pr-4 font-mono tabular-nums text-slate-700">{h.entry}</td>
                    <td className="py-2.5 pr-4 font-mono tabular-nums text-slate-700">{h.exit}</td>
                    <td className="py-2.5 pr-4 text-right text-slate-500">{h.closedAt}</td>
                    <td
                      className={`py-2.5 text-right font-mono tabular-nums font-bold ${
                        h.pnl >= 0 ? 'text-emerald-700' : 'text-rose-700'
                      }`}
                    >
                      {h.pnl >= 0 ? '+' : ''}${Number(h.pnl).toFixed(2)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
};

/* ---------------- Trading Plan & Watchlist/Calendar ---------------- */
const CHECKLIST_ITEMS = [
  'Higher timeframe (D1/H4) bias & draw on liquidity mapped',
  'Active London or New York Killzone verified',
  'High-impact USD/EUR/GBP economic calendar news checked',
  'Risk capped at <= 1.0% via GRIDPIPs Risk Calculator',
  'Wait for Liquidity Sweep + Displacement FVG / Order Block',
];

export const TradingPlanView: React.FC = () => {
  const [rules, setRules] = useState({
    goals: 'Execute 1-2 A+ ICT Silver Bullet or SMC Order Block setups daily with strict 1% risk.',
    entryRules: 'Swept BSL/SSL -> M15 MSS -> Unmitigated FVG 50% CE inside Discount/Premium.',
    riskRules: 'Max 2% daily drawdown. Move SL to BE at 1:1.5 R:R.',
    checked: [false, false, false, false, false],
  });
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    apiFetch<{ plan: typeof rules | null }>('/api/workspace/plan')
      .then((res) => {
        if (res.plan) setRules(res.plan);
      })
      .catch(() => {});
  }, []);

  async function savePlan(next = rules) {
    setRules(next);
    await apiFetch('/api/workspace/plan', {
      method: 'POST',
      body: JSON.stringify({ plan: next }),
    });
    setSaved(true);
    setTimeout(() => setSaved(false), 1800);
  }

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
      <div className="bg-white border border-slate-200 rounded-xl p-6 space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="text-base font-bold text-slate-950">Personal Trading Plan</h3>
          {saved && <span className="text-xs font-semibold text-emerald-700">Saved</span>}
        </div>
        <div>
          <label className="block text-xs font-semibold text-slate-700 mb-1">Primary Goals</label>
          <textarea
            rows={2}
            value={rules.goals}
            onChange={(e) => setRules({ ...rules, goals: e.target.value })}
            className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg"
          />
        </div>
        <div>
          <label className="block text-xs font-semibold text-slate-700 mb-1">Entry Criteria</label>
          <textarea
            rows={3}
            value={rules.entryRules}
            onChange={(e) => setRules({ ...rules, entryRules: e.target.value })}
            className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg"
          />
        </div>
        <div>
          <label className="block text-xs font-semibold text-slate-700 mb-1">Risk &amp; Drawdown Limits</label>
          <textarea
            rows={2}
            value={rules.riskRules}
            onChange={(e) => setRules({ ...rules, riskRules: e.target.value })}
            className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg"
          />
        </div>
        <button
          onClick={() => savePlan(rules)}
          className="px-5 py-2.5 bg-blue-600 text-white text-xs font-semibold rounded-lg hover:bg-blue-700 cursor-pointer"
        >
          Save Trading Plan
        </button>
      </div>

      <div className="bg-white border border-slate-200 rounded-xl p-6">
        <h3 className="text-base font-bold text-slate-950 mb-4">Pre-Session Execution Checklist</h3>
        <div className="space-y-3">
          {CHECKLIST_ITEMS.map((item, idx) => (
            <label
              key={idx}
              className="flex items-start gap-3 p-3 border border-slate-200 rounded-lg cursor-pointer hover:bg-slate-50"
            >
              <input
                type="checkbox"
                checked={Boolean(rules.checked[idx])}
                onChange={() => {
                  const nextChecked = [...rules.checked];
                  nextChecked[idx] = !nextChecked[idx];
                  savePlan({ ...rules, checked: nextChecked });
                }}
                className="mt-0.5 rounded text-blue-600"
              />
              <span className="text-sm text-slate-800">{item}</span>
            </label>
          ))}
        </div>
      </div>
    </div>
  );
};

export const CalendarAndNewsView: React.FC = () => {
  const [impactFilter, setImpactFilter] = useState<'All' | 'High'>('All');
  const [newsCategory, setNewsCategory] = useState<string>('All');

  const events = [
    { time: '02:00 NY', ccy: 'GBP', title: 'UK GDP m/m (London Open)', impact: 'Medium', prev: '0.1%', forecast: '0.2%' },
    { time: '08:30 NY', ccy: 'USD', title: 'Non-Farm Payrolls (NFP)', impact: 'High', prev: '175K', forecast: '190K' },
    { time: '08:30 NY', ccy: 'USD', title: 'Core CPI m/m', impact: 'High', prev: '0.3%', forecast: '0.3%' },
    { time: '10:00 NY', ccy: 'USD', title: 'ISM Services PMI (NY Silver Bullet)', impact: 'Medium', prev: '51.4', forecast: '52.0' },
    { time: '14:00 NY', ccy: 'USD', title: 'FOMC Rate Statement & Press Conference', impact: 'High', prev: '5.25%', forecast: '5.25%' },
  ];

  const news = [
    {
      cat: 'Central Banks',
      time: '18m ago',
      title: 'Federal Reserve policymakers reiterate patience ahead of next CPI release',
      note: 'Expect USD liquidity sweeps around 08:30 EST before New York AM continuation.',
    },
    {
      cat: 'Gold',
      time: '42m ago',
      title: 'XAUUSD holds institutional demand above key H4 bullish order block',
      note: 'London-NY overlap volume remains elevated near psychological round numbers.',
    },
    {
      cat: 'Forex',
      time: '1h ago',
      title: 'EURUSD & GBPUSD compress beneath weekly equal highs ahead of London Killzone',
      note: 'Watch for Judas Swing fakeout above Asian highs prior to NY displacement.',
    },
    {
      cat: 'Indices',
      time: '2h ago',
      title: 'NAS100 institutional flow rotates into NY AM Silver Bullet window',
      note: 'Monitor 09:30 EST equities open volatility and clean M15 FVG draws.',
    },
    {
      cat: 'Crypto',
      time: '3h ago',
      title: 'BTCUSD reclaims mid-range liquidity as spot inflows stabilize',
      note: 'Maintain disciplined 1% risk caps when holding across high-beta crypto levels.',
    },
  ];

  const filteredEvents = impactFilter === 'High' ? events.filter((e) => e.impact === 'High') : events;
  const filteredNews = newsCategory === 'All' ? news : news.filter((n) => n.cat === newsCategory);

  return (
    <div className="space-y-6">
      <div className="bg-white border border-slate-200 rounded-xl p-6">
        <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
          <div>
            <h3 className="text-base font-bold text-slate-950">Economic Calendar (NY EST)</h3>
            <p className="text-xs text-slate-500">High-volatility liquidity injection windows</p>
          </div>
          <div className="flex gap-1 p-1 bg-slate-100 rounded-lg">
            {(['All', 'High'] as const).map((f) => (
              <button
                key={f}
                type="button"
                onClick={() => setImpactFilter(f)}
                className={`px-3 py-1 text-xs font-semibold rounded-md cursor-pointer ${
                  impactFilter === f ? 'bg-white text-slate-950 shadow-xs' : 'text-slate-600'
                }`}
              >
                {f === 'All' ? 'All Events' : 'High Impact Only'}
              </button>
            ))}
          </div>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-b border-slate-200 text-xs text-slate-500">
                <th className="py-2.5 pr-4">Time</th>
                <th className="py-2.5 pr-4">Currency</th>
                <th className="py-2.5 pr-4">Event</th>
                <th className="py-2.5 pr-4">Impact</th>
                <th className="py-2.5 pr-4 text-right">Previous</th>
                <th className="py-2.5 text-right">Forecast</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filteredEvents.map((ev, i) => (
                <tr key={i} className="hover:bg-slate-50">
                  <td className="py-3 pr-4 font-mono text-xs text-slate-700">{ev.time}</td>
                  <td className="py-3 pr-4 font-mono font-bold text-slate-950">{ev.ccy}</td>
                  <td className="py-3 pr-4 text-slate-800">{ev.title}</td>
                  <td className={`py-3 pr-4 text-xs font-semibold ${ev.impact === 'High' ? 'text-rose-600' : 'text-amber-600'}`}>
                    {ev.impact}
                  </td>
                  <td className="py-3 pr-4 text-right font-mono tabular-nums text-slate-600">{ev.prev}</td>
                  <td className="py-3 text-right font-mono tabular-nums font-semibold text-slate-950">{ev.forecast}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div className="bg-white border border-slate-200 rounded-xl p-6">
        <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
          <h3 className="text-base font-bold text-slate-950">Institutional Market News Desk</h3>
          <div className="flex flex-wrap gap-1 p-1 bg-slate-100 rounded-lg">
            {['All', 'Central Banks', 'Forex', 'Gold', 'Indices', 'Crypto'].map((cat) => (
              <button
                key={cat}
                type="button"
                onClick={() => setNewsCategory(cat)}
                className={`px-2.5 py-1 text-xs font-semibold rounded-md cursor-pointer ${
                  newsCategory === cat ? 'bg-white text-slate-950 shadow-xs' : 'text-slate-600'
                }`}
              >
                {cat}
              </button>
            ))}
          </div>
        </div>
        <div className="divide-y divide-slate-100">
          {filteredNews.map((item, idx) => (
            <div key={idx} className="py-3.5">
              <div className="flex items-center gap-2 text-xs text-slate-500 mb-1">
                <span className="font-semibold text-blue-600">{item.cat}</span>
                <span aria-hidden="true">·</span>
                <span>{item.time}</span>
              </div>
              <div className="text-sm font-bold text-slate-950">{item.title}</div>
              <p className="text-xs text-slate-600 mt-1">{item.note}</p>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};
