import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  Calendar,
  ChevronDown,
  ChevronRight,
  Download,
  Edit3,
  Eye,
  Filter,
  List,
  NotebookPen,
  Plus,
  Search,
  Star,
  Trash2,
  Upload,
  X,
} from 'lucide-react';
import { apiFetch } from '../../lib/api';
import {
  computeTradeAnalytics,
  DEFAULT_PLAYBOOK_NAMES,
  exportTradesToCsv,
  filterJournalTrades,
  getTradeConfluences,
  getTradeMistakes,
  getTradePlaybook,
  getTradeRMultiple,
  parseCsvToTrades,
  STANDARD_CONFLUENCE_TAGS,
  STANDARD_EMOTION_STATES,
  STANDARD_MISTAKE_TAGS,
  type TradeFilterCriteria,
} from '../../lib/tradeMetrics';
import type { JournalTrade, TradingPlanData } from '../../types';
import { PnlCalendarHeatmap } from './PnlCalendarHeatmap';

type JournalViewMode = 'daily' | 'table' | 'calendar';
type DatePreset = 'all' | '30d' | '90d' | 'mtd';

interface TradeFormState {
  instrument: string;
  side: 'Buy' | 'Sell';
  accountLabel: string;
  playbook: string;
  setupGrade: string;
  session: string;
  tradeDate: string;
  entryTime: string;
  exitTime: string;
  entryPrice: string;
  exitPrice: string;
  sl: string;
  tp: string;
  size: string;
  riskPct: string;
  rr: string;
  rMultiple: string;
  fees: string;
  mfe: string;
  mae: string;
  pnl: string;
  emotions: string;
  rating: number;
  mistakes: string[];
  confluences: string[];
  reasonEntry: string;
  reasonExit: string;
  lessons: string;
  imageData: string;
}

const ACCOUNT_OPTIONS = ['Live Account', 'Funded Prop', 'Evaluation', 'Paper Sim', 'Imported Broker'];
const SESSION_OPTIONS = ['London', 'New York', 'NY AM Killzone', 'NY PM', 'Asian', 'London Close'];
const GRADE_OPTIONS = ['A+', 'A', 'B', 'C'];

function getTodayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

function getDateOffsetIso(daysAgo: number): string {
  const d = new Date();
  d.setDate(d.getDate() - daysAgo);
  return d.toISOString().slice(0, 10);
}

function getMonthStartIso(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-01`;
}

function createEmptyForm(defaultPlaybook: string): TradeFormState {
  return {
    instrument: 'XAUUSD',
    side: 'Buy',
    accountLabel: 'Live Account',
    playbook: defaultPlaybook,
    setupGrade: 'A',
    session: 'New York',
    tradeDate: getTodayIso(),
    entryTime: '09:30',
    exitTime: '11:15',
    entryPrice: '',
    exitPrice: '',
    sl: '',
    tp: '',
    size: '1.00',
    riskPct: '1.0',
    rr: '',
    rMultiple: '',
    fees: '0',
    mfe: '',
    mae: '',
    pnl: '',
    emotions: 'Calm & Disciplined',
    rating: 4,
    mistakes: [],
    confluences: ['HTF Bias Aligned', 'Liquidity Sweep (BSL/SSL)', 'MSS + Displacement'],
    reasonEntry: '',
    reasonExit: '',
    lessons: '',
    imageData: '',
  };
}

function tradeToForm(trade: JournalTrade): TradeFormState {
  return {
    instrument: trade.instrument || 'XAUUSD',
    side: trade.side === 'Sell' ? 'Sell' : 'Buy',
    accountLabel: trade.account_label || 'Live Account',
    playbook: getTradePlaybook(trade),
    setupGrade: trade.setup_grade || 'A',
    session: trade.session || 'New York',
    tradeDate: (trade.trade_date || getTodayIso()).slice(0, 10),
    entryTime: trade.entry_time || '',
    exitTime: trade.exit_time || '',
    entryPrice: trade.entry_price != null ? String(trade.entry_price) : '',
    exitPrice: trade.exit_price != null ? String(trade.exit_price) : '',
    sl: trade.sl != null ? String(trade.sl) : '',
    tp: trade.tp != null ? String(trade.tp) : '',
    size: trade.size != null ? String(trade.size) : '',
    riskPct: trade.risk_pct != null ? String(trade.risk_pct) : '',
    rr: trade.rr != null ? String(trade.rr) : '',
    rMultiple: trade.r_multiple != null ? String(trade.r_multiple) : '',
    fees: trade.fees != null ? String(trade.fees) : '0',
    mfe: trade.mfe != null ? String(trade.mfe) : '',
    mae: trade.mae != null ? String(trade.mae) : '',
    pnl: String(trade.pnl ?? 0),
    emotions: trade.emotions || 'Calm & Disciplined',
    rating: trade.rating ?? 4,
    mistakes: getTradeMistakes(trade),
    confluences: getTradeConfluences(trade),
    reasonEntry: trade.reason_entry || '',
    reasonExit: trade.reason_exit || '',
    lessons: trade.lessons || '',
    imageData: trade.image_data || '',
  };
}

function fmtMoney(v: number): string {
  const abs = Math.abs(v).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  if (v > 0) return `+$${abs}`;
  if (v < 0) return `-$${abs}`;
  return `$${abs}`;
}

export const JournalView: React.FC<{
  trades: JournalTrade[];
  onRefresh: () => Promise<void>;
}> = ({ trades, onRefresh }) => {
  const [viewMode, setViewMode] = useState<JournalViewMode>('daily');
  const [datePreset, setDatePreset] = useState<DatePreset>('all');
  const [filters, setFilters] = useState<TradeFilterCriteria>({
    startDate: '',
    endDate: '',
    search: '',
    playbook: 'All',
    side: 'All',
    outcome: 'All',
    account: 'All',
    mistake: 'All',
  });
  const [showAdvancedFilters, setShowAdvancedFilters] = useState(false);

  const [savedPlaybooks, setSavedPlaybooks] = useState<string[]>([]);
  const [expandedDays, setExpandedDays] = useState<Record<string, boolean>>({});
  const [reviewTrade, setReviewTrade] = useState<JournalTrade | null>(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [form, setForm] = useState<TradeFormState>(() => createEmptyForm(DEFAULT_PLAYBOOK_NAMES[0]));
  const [saving, setSaving] = useState(false);
  const [importing, setImporting] = useState(false);
  const [feedback, setFeedback] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const csvInputRef = useRef<HTMLInputElement | null>(null);

  // Load user playbooks from saved Trading Plan for dropdown sync
  useEffect(() => {
    let active = true;
    apiFetch<{ plan: TradingPlanData | null }>('/api/workspace/plan')
      .then((res) => {
        if (!active || !res.plan?.playbooks?.length) return;
        setSavedPlaybooks(res.plan.playbooks.map((p) => p.name).filter(Boolean));
      })
      .catch(() => {});
    return () => {
      active = false;
    };
  }, []);

  const playbookOptions = useMemo(() => {
    const set = new Set<string>([...savedPlaybooks, ...DEFAULT_PLAYBOOK_NAMES]);
    trades.forEach((t) => {
      const pb = getTradePlaybook(t);
      if (pb && pb !== 'Unspecified') set.add(pb);
    });
    return Array.from(set);
  }, [savedPlaybooks, trades]);

  const accountFilterOptions = useMemo(() => {
    const set = new Set<string>(ACCOUNT_OPTIONS);
    trades.forEach((t) => {
      if (t.account_label) set.add(t.account_label);
    });
    return Array.from(set);
  }, [trades]);

  const filteredTrades = useMemo(() => filterJournalTrades(trades, filters), [trades, filters]);
  const analytics = useMemo(() => computeTradeAnalytics(filteredTrades), [filteredTrades]);

  const dailyGroupsDesc = useMemo(
    () => [...analytics.dailySeries].sort((a, b) => b.date.localeCompare(a.date)),
    [analytics.dailySeries]
  );

  // Auto-calculate Planned R:R in modal when Entry/SL/TP change
  const computedPlannedRr = useMemo(() => {
    const entry = Number(form.entryPrice);
    const sl = Number(form.sl);
    const tp = Number(form.tp);
    if (!Number.isFinite(entry) || !Number.isFinite(sl) || !Number.isFinite(tp) || entry === sl) return null;
    const risk = Math.abs(entry - sl);
    const reward = Math.abs(tp - entry);
    if (risk <= 0 || reward <= 0) return null;
    return Number((reward / risk).toFixed(2));
  }, [form.entryPrice, form.sl, form.tp]);

  const computedAdherence = useMemo(() => {
    const totalConfluences = STANDARD_CONFLUENCE_TAGS.length;
    const base = Math.round((form.confluences.length / totalConfluences) * 100);
    const penalty = form.mistakes.length * 12;
    return Math.max(0, Math.min(100, base - penalty));
  }, [form.confluences.length, form.mistakes.length]);

  function applyDatePreset(preset: DatePreset) {
    setDatePreset(preset);
    if (preset === 'all') {
      setFilters((f) => ({ ...f, startDate: '', endDate: '' }));
    } else if (preset === '30d') {
      setFilters((f) => ({ ...f, startDate: getDateOffsetIso(30), endDate: getTodayIso() }));
    } else if (preset === '90d') {
      setFilters((f) => ({ ...f, startDate: getDateOffsetIso(90), endDate: getTodayIso() }));
    } else if (preset === 'mtd') {
      setFilters((f) => ({ ...f, startDate: getMonthStartIso(), endDate: getTodayIso() }));
    }
  }

  function openNewModal() {
    setEditingId(null);
    setForm(createEmptyForm(playbookOptions[0] || DEFAULT_PLAYBOOK_NAMES[0]));
    setErrorMsg(null);
    setModalOpen(true);
  }

  function openEditModal(trade: JournalTrade) {
    setEditingId(trade.id);
    setForm(tradeToForm(trade));
    setReviewTrade(null);
    setErrorMsg(null);
    setModalOpen(true);
  }

  function toggleTag(list: string[], tag: string): string[] {
    return list.includes(tag) ? list.filter((x) => x !== tag) : [...list, tag];
  }

  function handleScreenshotUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 2.5 * 1024 * 1024) {
      setErrorMsg('Chart screenshot must be smaller than 2.5MB.');
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === 'string') {
        setForm((prev) => ({ ...prev, imageData: reader.result as string }));
      }
    };
    reader.readAsDataURL(file);
  }

  async function handleSaveTrade(e: React.FormEvent) {
    e.preventDefault();
    setErrorMsg(null);
    if (!form.instrument.trim()) {
      setErrorMsg('Instrument symbol is required.');
      return;
    }
    const pnlNum = Number(form.pnl || 0);
    if (!Number.isFinite(pnlNum)) {
      setErrorMsg('Net P&L must be a valid number.');
      return;
    }

    let durationMin: number | null = null;
    if (form.entryTime && form.exitTime && /^\d{2}:\d{2}$/.test(form.entryTime) && /^\d{2}:\d{2}$/.test(form.exitTime)) {
      const [eh, em] = form.entryTime.split(':').map(Number);
      const [xh, xm] = form.exitTime.split(':').map(Number);
      const diff = xh * 60 + xm - (eh * 60 + em);
      if (diff >= 0) durationMin = diff;
    }

    const payload = {
      instrument: form.instrument.trim().toUpperCase(),
      side: form.side,
      accountLabel: form.accountLabel,
      playbook: form.playbook,
      strategy: form.playbook,
      setupGrade: form.setupGrade,
      session: form.session,
      tradeDate: form.tradeDate || getTodayIso(),
      entryTime: form.entryTime || null,
      exitTime: form.exitTime || null,
      durationMin,
      entryPrice: form.entryPrice !== '' ? Number(form.entryPrice) : null,
      exitPrice: form.exitPrice !== '' ? Number(form.exitPrice) : null,
      sl: form.sl !== '' ? Number(form.sl) : null,
      tp: form.tp !== '' ? Number(form.tp) : null,
      size: form.size !== '' ? Number(form.size) : null,
      riskPct: form.riskPct !== '' ? Number(form.riskPct) : null,
      rr: form.rr !== '' ? Number(form.rr) : computedPlannedRr,
      rMultiple: form.rMultiple !== '' ? Number(form.rMultiple) : null,
      fees: form.fees !== '' ? Number(form.fees) : 0,
      mfe: form.mfe !== '' ? Number(form.mfe) : null,
      mae: form.mae !== '' ? Number(form.mae) : null,
      pnl: pnlNum,
      emotions: form.emotions,
      rating: form.rating,
      mistakes: form.mistakes,
      confluences: form.confluences,
      ruleAdherencePct: computedAdherence,
      reasonEntry: form.reasonEntry.trim(),
      reasonExit: form.reasonExit.trim(),
      lessons: form.lessons.trim(),
      imageData: form.imageData || undefined,
    };

    setSaving(true);
    try {
      if (editingId != null) {
        await apiFetch(`/api/workspace/journal/${editingId}`, {
          method: 'PUT',
          body: JSON.stringify(payload),
        });
        setFeedback('Trade execution updated.');
      } else {
        await apiFetch('/api/workspace/journal', {
          method: 'POST',
          body: JSON.stringify(payload),
        });
        setFeedback('Trade logged to journal.');
      }
      setModalOpen(false);
      await onRefresh();
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Unable to save trade.');
    } finally {
      setSaving(false);
    }
  }

  async function handleDeleteTrade(id: number) {
    try {
      await apiFetch(`/api/workspace/journal/${id}`, { method: 'DELETE' });
      if (reviewTrade?.id === id) setReviewTrade(null);
      setFeedback('Trade removed from journal.');
      await onRefresh();
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Failed to delete trade.');
    }
  }

  function handleExportCsv() {
    if (!filteredTrades.length) return;
    const csv = exportTradesToCsv(filteredTrades);
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `gridpips-journal-${getTodayIso()}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    setFeedback(`Exported ${filteredTrades.length} trades to CSV.`);
  }

  async function handleCsvImportFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setErrorMsg(null);
    setImporting(true);
    try {
      const text = await file.text();
      const parsed = parseCsvToTrades(text);
      if (!parsed.length) {
        setErrorMsg('No valid trade rows detected. Ensure CSV has Instrument/Symbol and P&L/Profit columns.');
        return;
      }
      const res = await apiFetch<{ imported: number }>('/api/workspace/journal/import', {
        method: 'POST',
        body: JSON.stringify({ trades: parsed }),
      });
      setFeedback(`Imported ${res.imported} trades into your journal.`);
      await onRefresh();
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'CSV import failed.');
    } finally {
      setImporting(false);
      if (csvInputRef.current) csvInputRef.current.value = '';
    }
  }

  const activeFilterCount =
    (filters.playbook !== 'All' ? 1 : 0) +
    (filters.side !== 'All' ? 1 : 0) +
    (filters.outcome !== 'All' ? 1 : 0) +
    (filters.account !== 'All' ? 1 : 0) +
    (filters.mistake !== 'All' ? 1 : 0);

  return (
    <div className="space-y-5">
      {/* Top Action & Tracking Filter Bar */}
      <div className="rounded-2xl bg-white border border-slate-200 shadow-xs p-4 space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-lg font-bold tracking-tight text-slate-950">Trading Journal & Execution Ledger</h2>
            <p className="text-xs text-slate-500 mt-0.5">
              Tag playbooks, audit mistakes, track R-multiples, and review daily execution discipline.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <input
              ref={csvInputRef}
              type="file"
              accept=".csv,text/csv"
              onChange={handleCsvImportFile}
              className="hidden"
            />
            <button
              type="button"
              onClick={() => csvInputRef.current?.click()}
              disabled={importing}
              className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-semibold rounded-lg border border-slate-200 bg-white text-slate-700 hover:border-amber-400 hover:text-slate-950 transition-colors cursor-pointer disabled:opacity-50"
            >
              <Upload className="w-3.5 h-3.5" />
              {importing ? 'Importing...' : 'Import CSV'}
            </button>
            <button
              type="button"
              onClick={handleExportCsv}
              disabled={filteredTrades.length === 0}
              className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-semibold rounded-lg border border-slate-200 bg-white text-slate-700 hover:border-amber-400 hover:text-slate-950 transition-colors cursor-pointer disabled:opacity-40"
            >
              <Download className="w-3.5 h-3.5" />
              Export CSV
            </button>
            <button
              type="button"
              onClick={openNewModal}
              className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-semibold rounded-lg bg-[#0B0F19] text-[#E5A93C] hover:bg-slate-900 transition-colors cursor-pointer"
            >
              <Plus className="w-3.5 h-3.5" />
              Log Trade
            </button>
          </div>
        </div>

        {/* Date-Range Presets + Search + View Switcher */}
        <div className="flex flex-wrap items-center justify-between gap-2.5 pt-2 border-t border-slate-100">
          <div className="flex flex-wrap items-center gap-2">
            <div className="inline-flex rounded-lg border border-slate-200 bg-[#FAF9F6] p-0.5">
              {(
                [
                  ['all', 'All'],
                  ['30d', '30D'],
                  ['90d', '90D'],
                  ['mtd', 'MTD'],
                ] as const
              ).map(([key, label]) => (
                <button
                  key={key}
                  type="button"
                  onClick={() => applyDatePreset(key)}
                  className={`px-2.5 py-1 text-xs font-semibold rounded-md transition-colors cursor-pointer ${
                    datePreset === key
                      ? 'bg-[#0B0F19] text-[#E5A93C]'
                      : 'text-slate-600 hover:text-slate-950'
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>

            <div className="flex items-center gap-1.5 text-xs">
              <input
                type="date"
                value={filters.startDate}
                onChange={(e) => {
                  setDatePreset('all');
                  setFilters((f) => ({ ...f, startDate: e.target.value }));
                }}
                aria-label="Start date"
                className="px-2.5 py-1.5 rounded-lg border border-slate-200 bg-white text-slate-800 font-mono text-xs focus:border-amber-500 focus:outline-none"
              />
              <span className="text-slate-400">to</span>
              <input
                type="date"
                value={filters.endDate}
                onChange={(e) => {
                  setDatePreset('all');
                  setFilters((f) => ({ ...f, endDate: e.target.value }));
                }}
                aria-label="End date"
                className="px-2.5 py-1.5 rounded-lg border border-slate-200 bg-white text-slate-800 font-mono text-xs focus:border-amber-500 focus:outline-none"
              />
            </div>

            <div className="relative">
              <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                value={filters.search}
                onChange={(e) => setFilters((f) => ({ ...f, search: e.target.value }))}
                placeholder="Search pair, playbook, notes..."
                className="pl-8 pr-3 py-1.5 text-xs rounded-lg border border-slate-200 bg-white text-slate-900 w-52 focus:border-amber-500 focus:outline-none"
              />
            </div>

            <button
              type="button"
              onClick={() => setShowAdvancedFilters((v) => !v)}
              className={`inline-flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-semibold rounded-lg border transition-colors cursor-pointer ${
                showAdvancedFilters || activeFilterCount > 0
                  ? 'border-amber-400 bg-amber-50/70 text-[#B45309]'
                  : 'border-slate-200 bg-white text-slate-600 hover:text-slate-950'
              }`}
            >
              <Filter className="w-3.5 h-3.5" />
              Filters{activeFilterCount > 0 ? ` (${activeFilterCount})` : ''}
            </button>
          </div>

          <div className="inline-flex rounded-lg border border-slate-200 bg-[#FAF9F6] p-0.5">
            {(
              [
                ['daily', 'Daily Journal', NotebookPen],
                ['table', 'Trade Table', List],
                ['calendar', 'Calendar', Calendar],
              ] as const
            ).map(([key, label, Icon]) => (
              <button
                key={key}
                type="button"
                onClick={() => setViewMode(key)}
                className={`inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-md transition-colors cursor-pointer ${
                  viewMode === key
                    ? 'bg-[#0B0F19] text-[#E5A93C]'
                    : 'text-slate-600 hover:text-slate-950'
                }`}
              >
                <Icon className="w-3.5 h-3.5" />
                {label}
              </button>
            ))}
          </div>
        </div>

        {showAdvancedFilters && (
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2.5 pt-3 border-t border-slate-100">
            <select
              value={filters.playbook}
              onChange={(e) => setFilters((f) => ({ ...f, playbook: e.target.value }))}
              className="px-2.5 py-1.5 text-xs rounded-lg border border-slate-200 bg-white text-slate-800"
            >
              <option value="All">All Playbooks</option>
              {playbookOptions.map((pb) => (
                <option key={pb} value={pb}>
                  {pb}
                </option>
              ))}
            </select>

            <select
              value={filters.account}
              onChange={(e) => setFilters((f) => ({ ...f, account: e.target.value }))}
              className="px-2.5 py-1.5 text-xs rounded-lg border border-slate-200 bg-white text-slate-800"
            >
              <option value="All">All Accounts</option>
              {accountFilterOptions.map((acc) => (
                <option key={acc} value={acc}>
                  {acc}
                </option>
              ))}
            </select>

            <select
              value={filters.side}
              onChange={(e) => setFilters((f) => ({ ...f, side: e.target.value as TradeFilterCriteria['side'] }))}
              className="px-2.5 py-1.5 text-xs rounded-lg border border-slate-200 bg-white text-slate-800"
            >
              <option value="All">All Sides</option>
              <option value="Buy">Long (Buy)</option>
              <option value="Sell">Short (Sell)</option>
            </select>

            <select
              value={filters.outcome}
              onChange={(e) => setFilters((f) => ({ ...f, outcome: e.target.value as TradeFilterCriteria['outcome'] }))}
              className="px-2.5 py-1.5 text-xs rounded-lg border border-slate-200 bg-white text-slate-800"
            >
              <option value="All">All Outcomes</option>
              <option value="Win">Winners</option>
              <option value="Loss">Losers</option>
              <option value="Breakeven">Breakeven</option>
            </select>

            <select
              value={filters.mistake}
              onChange={(e) => setFilters((f) => ({ ...f, mistake: e.target.value }))}
              className="px-2.5 py-1.5 text-xs rounded-lg border border-slate-200 bg-white text-slate-800"
            >
              <option value="All">All Mistake Tags</option>
              <option value="Any Mistake">Any Mistake Tagged</option>
              <option value="Clean (No Mistakes)">Clean Execution Only</option>
              {STANDARD_MISTAKE_TAGS.map((m) => (
                <option key={m} value={m}>
                  {m}
                </option>
              ))}
            </select>

            <button
              type="button"
              onClick={() => {
                setDatePreset('all');
                setFilters({
                  startDate: '',
                  endDate: '',
                  search: '',
                  playbook: 'All',
                  side: 'All',
                  outcome: 'All',
                  account: 'All',
                  mistake: 'All',
                });
              }}
              className="px-2.5 py-1.5 text-xs font-semibold rounded-lg border border-slate-200 bg-slate-50 text-slate-700 hover:bg-slate-100 cursor-pointer"
            >
              Reset Filters
            </button>
          </div>
        )}
      </div>

      {feedback && (
        <div className="flex items-center justify-between px-4 py-2.5 rounded-xl bg-emerald-50 border border-emerald-200 text-xs font-medium text-emerald-800">
          <span>{feedback}</span>
          <button type="button" onClick={() => setFeedback(null)} className="text-emerald-700 hover:text-emerald-950 cursor-pointer">
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      {errorMsg && !modalOpen && (
        <div className="flex items-center justify-between px-4 py-2.5 rounded-xl bg-rose-50 border border-rose-200 text-xs font-medium text-rose-700">
          <span>{errorMsg}</span>
          <button type="button" onClick={() => setErrorMsg(null)} className="text-rose-700 hover:text-rose-950 cursor-pointer">
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      {/* Executive 6-Metric KPI Strip */}
      <div className="grid grid-cols-2 lg:grid-cols-6 gap-3">
        <div className="rounded-xl bg-[#0B0F19] text-white p-4 border border-slate-800">
          <div className="text-[11px] font-medium uppercase tracking-wider text-slate-400">Net P&L</div>
          <div
            className={`text-xl font-bold font-mono tabular-nums mt-1 ${
              analytics.netPnl > 0 ? 'text-[#E5A93C]' : analytics.netPnl < 0 ? 'text-rose-400' : 'text-white'
            }`}
          >
            {fmtMoney(analytics.netPnl)}
          </div>
          <div className="text-[11px] text-slate-400 mt-1 font-mono tabular-nums">
            {analytics.totalTrades} trades · {analytics.tradingDays} days
          </div>
        </div>

        <div className="rounded-xl bg-white border border-slate-200 p-4">
          <div className="text-[11px] font-medium uppercase tracking-wider text-slate-500">Trade Win %</div>
          <div className="text-xl font-bold font-mono tabular-nums text-slate-950 mt-1">
            {analytics.winRate.toFixed(1)}%
          </div>
          <div className="mt-2 h-1.5 w-full rounded-full bg-rose-100 overflow-hidden">
            <div className="h-full bg-emerald-600" style={{ width: `${Math.min(100, analytics.winRate)}%` }} />
          </div>
          <div className="text-[11px] text-slate-500 mt-1 font-mono tabular-nums">
            {analytics.wins}W / {analytics.losses}L / {analytics.breakeven}BE
          </div>
        </div>

        <div className="rounded-xl bg-white border border-slate-200 p-4">
          <div className="text-[11px] font-medium uppercase tracking-wider text-slate-500">Profit Factor</div>
          <div className="text-xl font-bold font-mono tabular-nums text-slate-950 mt-1">
            {analytics.profitFactor === null ? '—' : analytics.profitFactor >= 99 ? '∞' : analytics.profitFactor.toFixed(2)}
          </div>
          <div className="text-[11px] text-slate-500 mt-1 font-mono tabular-nums">
            GP ${analytics.grossProfit.toFixed(0)} / GL ${analytics.grossLoss.toFixed(0)}
          </div>
        </div>

        <div className="rounded-xl bg-white border border-slate-200 p-4">
          <div className="text-[11px] font-medium uppercase tracking-wider text-slate-500">Avg Win / Loss</div>
          <div className="text-xl font-bold font-mono tabular-nums text-slate-950 mt-1">
            {analytics.avgWinLossRatio === null ? '—' : `${analytics.avgWinLossRatio.toFixed(2)}x`}
          </div>
          <div className="text-[11px] mt-1 font-mono tabular-nums flex items-center gap-2">
            <span className="text-emerald-700">+${analytics.avgWin.toFixed(0)}</span>
            <span className="text-slate-300">/</span>
            <span className="text-rose-600">-${analytics.avgLoss.toFixed(0)}</span>
          </div>
        </div>

        <div className="rounded-xl bg-white border border-slate-200 p-4">
          <div className="text-[11px] font-medium uppercase tracking-wider text-slate-500">Expectancy & R</div>
          <div
            className={`text-xl font-bold font-mono tabular-nums mt-1 ${
              analytics.expectancyUsd >= 0 ? 'text-emerald-700' : 'text-rose-600'
            }`}
          >
            {fmtMoney(analytics.expectancyUsd)}
          </div>
          <div className="text-[11px] text-slate-500 mt-1 font-mono tabular-nums">
            Avg R: {analytics.avgRMultiple !== null ? `${analytics.avgRMultiple >= 0 ? '+' : ''}${analytics.avgRMultiple.toFixed(2)}R` : '—'}
          </div>
        </div>

        <div className="rounded-xl bg-white border border-slate-200 p-4">
          <div className="text-[11px] font-medium uppercase tracking-wider text-slate-500">Rule Adherence</div>
          <div className="text-xl font-bold font-mono tabular-nums text-[#B45309] mt-1">
            {analytics.totalTrades ? `${analytics.avgAdherencePct.toFixed(0)}%` : '—'}
          </div>
          <div className="text-[11px] text-slate-500 mt-1 font-mono tabular-nums">
            Day Win: {analytics.dayWinRate.toFixed(0)}%
          </div>
        </div>
      </div>

      {/* Main Content Area */}
      {filteredTrades.length === 0 ? (
        <div className="rounded-2xl bg-white border border-slate-200 p-10 text-center space-y-3">
          <div className="w-11 h-11 rounded-xl bg-amber-50 border border-amber-200 text-[#B45309] flex items-center justify-center mx-auto">
            <NotebookPen className="w-5 h-5" />
          </div>
          <h3 className="text-base font-bold text-slate-950">
            {trades.length === 0 ? 'Your Trading Journal Is Ready' : 'No Trades Match Active Filters'}
          </h3>
          <p className="text-xs text-slate-500 max-w-md mx-auto">
            {trades.length === 0
              ? 'Log your first execution with playbook tags, confluences, mistakes, and R-multiple, or import a broker CSV to unlock daily calendars and analytics.'
              : 'Adjust your date range, search query, or playbook filter to view logged trades.'}
          </p>
          <div className="flex items-center justify-center gap-2 pt-2">
            <button
              type="button"
              onClick={openNewModal}
              className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-semibold rounded-lg bg-[#0B0F19] text-[#E5A93C] hover:bg-slate-900 cursor-pointer"
            >
              <Plus className="w-3.5 h-3.5" />
              Log First Trade
            </button>
            <button
              type="button"
              onClick={() => csvInputRef.current?.click()}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold rounded-lg border border-slate-200 text-slate-700 hover:border-amber-400 cursor-pointer"
            >
              <Upload className="w-3.5 h-3.5" />
              Import CSV
            </button>
          </div>
        </div>
      ) : viewMode === 'calendar' ? (
        <PnlCalendarHeatmap
          dailyMap={analytics.dailyMap}
          onSelectTrade={(t) => setReviewTrade(t)}
          title="Journal Monthly P&L Calendar"
        />
      ) : viewMode === 'daily' ? (
        <div className="space-y-3">
          {dailyGroupsDesc.map((day) => {
            const isExpanded = expandedDays[day.date] !== false;
            return (
              <div key={day.date} className="rounded-2xl bg-white border border-slate-200 shadow-xs overflow-hidden">
                <button
                  type="button"
                  onClick={() => setExpandedDays((prev) => ({ ...prev, [day.date]: !isExpanded }))}
                  className="w-full px-5 py-3.5 flex flex-wrap items-center justify-between gap-3 bg-[#FAF9F6] hover:bg-amber-50/40 transition-colors cursor-pointer text-left"
                >
                  <div className="flex items-center gap-3">
                    {isExpanded ? (
                      <ChevronDown className="w-4 h-4 text-slate-500" />
                    ) : (
                      <ChevronRight className="w-4 h-4 text-slate-500" />
                    )}
                    <span className="text-sm font-bold font-mono text-slate-950">{day.date}</span>
                    <span className="text-xs text-slate-500 font-mono tabular-nums">
                      {day.trades.length} {day.trades.length === 1 ? 'trade' : 'trades'} · {day.wins}W / {day.losses}L ({day.winRate.toFixed(0)}%)
                    </span>
                  </div>
                  <div
                    className={`text-sm font-bold font-mono tabular-nums ${
                      day.pnl > 0 ? 'text-emerald-700' : day.pnl < 0 ? 'text-rose-600' : 'text-slate-700'
                    }`}
                  >
                    {fmtMoney(day.pnl)}
                  </div>
                </button>

                {isExpanded && (
                  <div className="divide-y divide-slate-100">
                    {day.trades.map((trade) => {
                      const rVal = getTradeRMultiple(trade);
                      const mistakes = getTradeMistakes(trade);
                      return (
                        <div
                          key={trade.id}
                          className="px-5 py-3.5 flex flex-wrap items-center justify-between gap-3 hover:bg-slate-50/70 transition-colors"
                        >
                          <div className="flex flex-wrap items-center gap-3 min-w-[240px]">
                            <span className="text-sm font-bold font-mono text-slate-950 w-20">{trade.instrument}</span>
                            <span
                              className={`text-xs font-semibold w-12 ${
                                trade.side === 'Buy' ? 'text-emerald-700' : 'text-rose-600'
                              }`}
                            >
                              {trade.side === 'Buy' ? 'LONG' : 'SHORT'}
                            </span>
                            <div className="text-xs text-slate-700 font-medium">{getTradePlaybook(trade)}</div>
                            <span className="text-xs font-mono font-semibold text-[#B45309]">
                              Grade {trade.setup_grade || 'A'}
                            </span>
                            {trade.entry_time && (
                              <span className="text-xs font-mono text-slate-400">{trade.entry_time}</span>
                            )}
                          </div>

                          <div className="flex flex-wrap items-center gap-4">
                            {mistakes.length > 0 && (
                              <span className="text-xs font-medium text-rose-600">
                                {mistakes.slice(0, 2).join(', ')}
                                {mistakes.length > 2 ? ` +${mistakes.length - 2}` : ''}
                              </span>
                            )}
                            <span className="text-xs font-mono tabular-nums text-slate-600">
                              {rVal !== null ? `${rVal >= 0 ? '+' : ''}${rVal.toFixed(2)}R` : '—'}
                            </span>
                            <span className="text-xs font-mono tabular-nums text-slate-500">
                              {trade.rule_adherence_pct != null ? `${trade.rule_adherence_pct}% rules` : '100% rules'}
                            </span>
                            <span
                              className={`text-sm font-bold font-mono tabular-nums w-24 text-right ${
                                Number(trade.pnl) > 0
                                  ? 'text-emerald-700'
                                  : Number(trade.pnl) < 0
                                  ? 'text-rose-600'
                                  : 'text-slate-700'
                              }`}
                            >
                              {fmtMoney(Number(trade.pnl))}
                            </span>
                            <div className="flex items-center gap-1">
                              <button
                                type="button"
                                onClick={() => setReviewTrade(trade)}
                                className="p-1.5 rounded-lg text-slate-500 hover:text-slate-950 hover:bg-slate-100 cursor-pointer"
                                aria-label="Review trade"
                                title="Inspect trade"
                              >
                                <Eye className="w-4 h-4" />
                              </button>
                              <button
                                type="button"
                                onClick={() => openEditModal(trade)}
                                className="p-1.5 rounded-lg text-slate-500 hover:text-[#B45309] hover:bg-amber-50 cursor-pointer"
                                aria-label="Edit trade"
                                title="Edit trade"
                              >
                                <Edit3 className="w-4 h-4" />
                              </button>
                              <button
                                type="button"
                                onClick={() => handleDeleteTrade(trade.id)}
                                className="p-1.5 rounded-lg text-slate-400 hover:text-rose-600 hover:bg-rose-50 cursor-pointer"
                                aria-label="Delete trade"
                                title="Delete trade"
                              >
                                <Trash2 className="w-4 h-4" />
                              </button>
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      ) : (
        /* Institutional Trade Table */
        <div className="rounded-2xl bg-white border border-slate-200 shadow-xs overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-[#FAF9F6] border-b border-slate-200 text-[11px] font-semibold uppercase tracking-wider text-slate-500">
                  <th className="py-3 px-4">Date / Time</th>
                  <th className="py-3 px-3">Instrument</th>
                  <th className="py-3 px-3">Side</th>
                  <th className="py-3 px-3">Playbook</th>
                  <th className="py-3 px-3">Grade</th>
                  <th className="py-3 px-3">Account</th>
                  <th className="py-3 px-3 text-right">R-Mult</th>
                  <th className="py-3 px-3 text-right">Rules %</th>
                  <th className="py-3 px-3">Mistakes</th>
                  <th className="py-3 px-4 text-right">Net P&L</th>
                  <th className="py-3 px-4 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-xs">
                {filteredTrades.map((trade) => {
                  const rVal = getTradeRMultiple(trade);
                  const mistakes = getTradeMistakes(trade);
                  return (
                    <tr key={trade.id} className="hover:bg-slate-50/80 transition-colors">
                      <td className="py-3 px-4 font-mono tabular-nums text-slate-700 whitespace-nowrap">
                        <div>{trade.trade_date}</div>
                        {trade.entry_time && <div className="text-[10px] text-slate-400">{trade.entry_time}</div>}
                      </td>
                      <td className="py-3 px-3 font-mono font-bold text-slate-950 whitespace-nowrap">{trade.instrument}</td>
                      <td className="py-3 px-3 font-semibold whitespace-nowrap">
                        <span className={trade.side === 'Buy' ? 'text-emerald-700' : 'text-rose-600'}>
                          {trade.side === 'Buy' ? 'Long' : 'Short'}
                        </span>
                      </td>
                      <td className="py-3 px-3 text-slate-800 max-w-[180px] truncate">{getTradePlaybook(trade)}</td>
                      <td className="py-3 px-3 font-mono font-semibold text-[#B45309]">{trade.setup_grade || 'A'}</td>
                      <td className="py-3 px-3 text-slate-500 whitespace-nowrap">{trade.account_label || 'Live Account'}</td>
                      <td className="py-3 px-3 text-right font-mono tabular-nums text-slate-700">
                        {rVal !== null ? `${rVal >= 0 ? '+' : ''}${rVal.toFixed(2)}R` : '—'}
                      </td>
                      <td className="py-3 px-3 text-right font-mono tabular-nums text-slate-700">
                        {trade.rule_adherence_pct != null ? `${trade.rule_adherence_pct}%` : '100%'}
                      </td>
                      <td className="py-3 px-3 text-rose-600 max-w-[160px] truncate">
                        {mistakes.length ? mistakes.join(', ') : <span className="text-slate-400">Clean</span>}
                      </td>
                      <td
                        className={`py-3 px-4 text-right font-mono font-bold tabular-nums whitespace-nowrap ${
                          Number(trade.pnl) > 0
                            ? 'text-emerald-700'
                            : Number(trade.pnl) < 0
                            ? 'text-rose-600'
                            : 'text-slate-700'
                        }`}
                      >
                        {fmtMoney(Number(trade.pnl))}
                      </td>
                      <td className="py-3 px-4 text-right whitespace-nowrap">
                        <div className="inline-flex items-center gap-1">
                          <button
                            type="button"
                            onClick={() => setReviewTrade(trade)}
                            className="p-1.5 rounded-md text-slate-500 hover:text-slate-950 hover:bg-slate-100 cursor-pointer"
                            title="Inspect trade"
                          >
                            <Eye className="w-3.5 h-3.5" />
                          </button>
                          <button
                            type="button"
                            onClick={() => openEditModal(trade)}
                            className="p-1.5 rounded-md text-slate-500 hover:text-[#B45309] hover:bg-amber-50 cursor-pointer"
                            title="Edit trade"
                          >
                            <Edit3 className="w-3.5 h-3.5" />
                          </button>
                          <button
                            type="button"
                            onClick={() => handleDeleteTrade(trade.id)}
                            className="p-1.5 rounded-md text-slate-400 hover:text-rose-600 hover:bg-rose-50 cursor-pointer"
                            title="Delete trade"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Trade Review Drawer / Modal */}
      {reviewTrade && (
        <div className="fixed inset-0 z-50 bg-slate-950/50 backdrop-blur-[1px] flex items-center justify-end p-0 sm:p-4">
          <div className="bg-white w-full max-w-2xl h-full sm:h-auto sm:max-h-[92vh] sm:rounded-2xl border border-slate-200 shadow-2xl flex flex-col overflow-hidden">
            <div className="bg-[#0B0F19] text-white px-6 py-4 flex items-center justify-between">
              <div>
                <div className="flex items-center gap-2.5">
                  <span className="text-lg font-bold font-mono">{reviewTrade.instrument}</span>
                  <span
                    className={`text-xs font-bold uppercase ${
                      reviewTrade.side === 'Buy' ? 'text-emerald-400' : 'text-rose-400'
                    }`}
                  >
                    {reviewTrade.side === 'Buy' ? 'Long' : 'Short'}
                  </span>
                  <span className="text-xs font-mono text-[#E5A93C]">Grade {reviewTrade.setup_grade || 'A'}</span>
                </div>
                <div className="text-xs text-slate-400 mt-0.5 font-mono">
                  {reviewTrade.trade_date} {reviewTrade.entry_time ? `· ${reviewTrade.entry_time}` : ''} ·{' '}
                  {getTradePlaybook(reviewTrade)}
                </div>
              </div>
              <div className="flex items-center gap-3">
                <span
                  className={`text-lg font-bold font-mono tabular-nums ${
                    Number(reviewTrade.pnl) >= 0 ? 'text-[#E5A93C]' : 'text-rose-400'
                  }`}
                >
                  {fmtMoney(Number(reviewTrade.pnl))}
                </span>
                <button
                  type="button"
                  onClick={() => setReviewTrade(null)}
                  className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 cursor-pointer"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            </div>

            <div className="p-6 overflow-y-auto space-y-5 flex-1">
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                <div className="p-3 rounded-xl bg-[#FAF9F6] border border-slate-200">
                  <div className="text-[10px] uppercase text-slate-500 font-semibold">Entry / Exit</div>
                  <div className="text-xs font-mono font-bold text-slate-900 mt-1">
                    {reviewTrade.entry_price ?? '—'} → {reviewTrade.exit_price ?? '—'}
                  </div>
                </div>
                <div className="p-3 rounded-xl bg-[#FAF9F6] border border-slate-200">
                  <div className="text-[10px] uppercase text-slate-500 font-semibold">SL / TP</div>
                  <div className="text-xs font-mono font-bold text-slate-900 mt-1">
                    {reviewTrade.sl ?? '—'} / {reviewTrade.tp ?? '—'}
                  </div>
                </div>
                <div className="p-3 rounded-xl bg-[#FAF9F6] border border-slate-200">
                  <div className="text-[10px] uppercase text-slate-500 font-semibold">Realized R / Rules</div>
                  <div className="text-xs font-mono font-bold text-slate-900 mt-1">
                    {(() => {
                      const r = getTradeRMultiple(reviewTrade);
                      return r !== null ? `${r >= 0 ? '+' : ''}${r.toFixed(2)}R` : '—';
                    })()}{' '}
                    · {reviewTrade.rule_adherence_pct ?? 100}%
                  </div>
                </div>
                <div className="p-3 rounded-xl bg-[#FAF9F6] border border-slate-200">
                  <div className="text-[10px] uppercase text-slate-500 font-semibold">Session / Emotion</div>
                  <div className="text-xs font-semibold text-slate-900 mt-1 truncate">
                    {reviewTrade.session || '—'} · {reviewTrade.emotions || 'Calm'}
                  </div>
                </div>
              </div>

              {/* MFE / MAE Trade Execution Scale */}
              {(reviewTrade.mfe != null || reviewTrade.mae != null) && (
                <div className="p-4 rounded-xl bg-white border border-slate-200 space-y-2">
                  <div className="flex items-center justify-between text-xs font-semibold text-slate-700">
                    <span>Execution Range (MAE vs Realized vs MFE)</span>
                    <span className="font-mono text-[11px] text-slate-500">
                      MAE: {reviewTrade.mae != null ? fmtMoney(-Math.abs(reviewTrade.mae)) : '—'} · MFE:{' '}
                      {reviewTrade.mfe != null ? fmtMoney(Math.abs(reviewTrade.mfe)) : '—'}
                    </span>
                  </div>
                  <div className="h-2.5 w-full rounded-full bg-slate-100 relative overflow-hidden flex">
                    <div
                      className="bg-rose-400/80 h-full"
                      style={{
                        width: `${Math.min(
                          50,
                          (Math.abs(reviewTrade.mae || 0) /
                            Math.max(1, Math.abs(reviewTrade.mae || 0) + Math.abs(reviewTrade.mfe || 0))) *
                            100
                        )}%`,
                      }}
                    />
                    <div className="bg-emerald-500/80 h-full flex-1" />
                  </div>
                </div>
              )}

              {/* Confluences vs Mistakes */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="p-4 rounded-xl bg-emerald-50/50 border border-emerald-200/70 space-y-2">
                  <div className="text-xs font-bold text-emerald-900">Confirmed Confluences</div>
                  {getTradeConfluences(reviewTrade).length > 0 ? (
                    <ul className="space-y-1 text-xs text-emerald-800">
                      {getTradeConfluences(reviewTrade).map((c) => (
                        <li key={c}>• {c}</li>
                      ))}
                    </ul>
                  ) : (
                    <p className="text-xs text-slate-500">No confluences tagged.</p>
                  )}
                </div>

                <div className="p-4 rounded-xl bg-rose-50/50 border border-rose-200/70 space-y-2">
                  <div className="text-xs font-bold text-rose-900">Mistakes & Leaks</div>
                  {getTradeMistakes(reviewTrade).length > 0 ? (
                    <ul className="space-y-1 text-xs text-rose-800">
                      {getTradeMistakes(reviewTrade).map((m) => (
                        <li key={m}>• {m}</li>
                      ))}
                    </ul>
                  ) : (
                    <p className="text-xs text-emerald-700 font-medium">Clean execution — zero mistakes tagged.</p>
                  )}
                </div>
              </div>

              {/* Notes & Lessons */}
              <div className="space-y-3">
                {reviewTrade.reason_entry && (
                  <div className="p-3.5 rounded-xl bg-[#FAF9F6] border border-slate-200">
                    <div className="text-[11px] font-bold uppercase tracking-wider text-slate-500 mb-1">
                      Entry Narrative
                    </div>
                    <p className="text-xs text-slate-800 whitespace-pre-wrap leading-relaxed">{reviewTrade.reason_entry}</p>
                  </div>
                )}
                {reviewTrade.reason_exit && (
                  <div className="p-3.5 rounded-xl bg-[#FAF9F6] border border-slate-200">
                    <div className="text-[11px] font-bold uppercase tracking-wider text-slate-500 mb-1">
                      Exit & Management
                    </div>
                    <p className="text-xs text-slate-800 whitespace-pre-wrap leading-relaxed">{reviewTrade.reason_exit}</p>
                  </div>
                )}
                {reviewTrade.lessons && (
                  <div className="p-3.5 rounded-xl bg-amber-50/50 border border-amber-200">
                    <div className="text-[11px] font-bold uppercase tracking-wider text-[#B45309] mb-1">
                      Post-Trade Lesson
                    </div>
                    <p className="text-xs text-slate-800 whitespace-pre-wrap leading-relaxed">{reviewTrade.lessons}</p>
                  </div>
                )}
              </div>

              {reviewTrade.image_data && (
                <div className="space-y-1.5">
                  <div className="text-[11px] font-bold uppercase tracking-wider text-slate-500">Chart Markup</div>
                  <img
                    src={reviewTrade.image_data}
                    alt={`${reviewTrade.instrument} setup markup`}
                    className="w-full rounded-xl border border-slate-200 object-contain max-h-80 bg-slate-50"
                  />
                </div>
              )}
            </div>

            <div className="px-6 py-3.5 border-t border-slate-200 bg-[#FAF9F6] flex items-center justify-between">
              <button
                type="button"
                onClick={() => handleDeleteTrade(reviewTrade.id)}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-rose-600 hover:bg-rose-50 rounded-lg cursor-pointer"
              >
                <Trash2 className="w-3.5 h-3.5" />
                Delete Trade
              </button>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setReviewTrade(null)}
                  className="px-3.5 py-1.5 text-xs font-semibold text-slate-600 hover:text-slate-950 rounded-lg border border-slate-200 bg-white cursor-pointer"
                >
                  Close
                </button>
                <button
                  type="button"
                  onClick={() => openEditModal(reviewTrade)}
                  className="inline-flex items-center gap-1.5 px-4 py-1.5 text-xs font-semibold rounded-lg bg-[#0B0F19] text-[#E5A93C] hover:bg-slate-900 cursor-pointer"
                >
                  <Edit3 className="w-3.5 h-3.5" />
                  Edit Trade
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Log / Edit Trade Modal */}
      {modalOpen && (
        <div className="fixed inset-0 z-50 bg-slate-950/50 backdrop-blur-[1px] flex items-center justify-center p-3 sm:p-5">
          <form
            onSubmit={handleSaveTrade}
            className="bg-white w-full max-w-3xl max-h-[92vh] rounded-2xl border border-slate-200 shadow-2xl flex flex-col overflow-hidden"
          >
            <div className="bg-[#0B0F19] text-white px-6 py-4 flex items-center justify-between">
              <div>
                <h3 className="text-base font-bold">{editingId ? 'Edit Trade Execution' : 'Log New Trade Execution'}</h3>
                <p className="text-xs text-slate-400">
                  Auto-computed Adherence: <span className="text-[#E5A93C] font-mono font-bold">{computedAdherence}%</span>
                  {computedPlannedRr ? ` · Planned R:R 1:${computedPlannedRr}` : ''}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setModalOpen(false)}
                className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="p-6 overflow-y-auto space-y-5 flex-1">
              {errorMsg && (
                <div className="px-3.5 py-2 rounded-lg bg-rose-50 border border-rose-200 text-xs font-medium text-rose-700">
                  {errorMsg}
                </div>
              )}

              {/* Core Trade Fields */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                <div>
                  <label className="block text-[11px] font-semibold text-slate-600 mb-1">Instrument *</label>
                  <input
                    type="text"
                    required
                    value={form.instrument}
                    onChange={(e) => setForm((f) => ({ ...f, instrument: e.target.value.toUpperCase() }))}
                    placeholder="XAUUSD"
                    className="w-full px-3 py-2 text-xs font-mono font-semibold rounded-lg border border-slate-300 focus:border-amber-500 focus:outline-none"
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-semibold text-slate-600 mb-1">Side *</label>
                  <div className="grid grid-cols-2 gap-1.5">
                    {(['Buy', 'Sell'] as const).map((s) => (
                      <button
                        key={s}
                        type="button"
                        onClick={() => setForm((f) => ({ ...f, side: s }))}
                        className={`py-2 text-xs font-bold rounded-lg border cursor-pointer transition-colors ${
                          form.side === s
                            ? s === 'Buy'
                              ? 'bg-emerald-700 border-emerald-700 text-white'
                              : 'bg-rose-600 border-rose-600 text-white'
                            : 'bg-white border-slate-200 text-slate-600'
                        }`}
                      >
                        {s === 'Buy' ? 'Long' : 'Short'}
                      </button>
                    ))}
                  </div>
                </div>
                <div>
                  <label className="block text-[11px] font-semibold text-slate-600 mb-1">Net P&L ($) *</label>
                  <input
                    type="number"
                    step="any"
                    required
                    value={form.pnl}
                    onChange={(e) => setForm((f) => ({ ...f, pnl: e.target.value }))}
                    placeholder="250.00 or -100.00"
                    className="w-full px-3 py-2 text-xs font-mono font-bold rounded-lg border border-slate-300 focus:border-amber-500 focus:outline-none"
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-semibold text-slate-600 mb-1">Trade Date *</label>
                  <input
                    type="date"
                    required
                    value={form.tradeDate}
                    onChange={(e) => setForm((f) => ({ ...f, tradeDate: e.target.value }))}
                    className="w-full px-3 py-2 text-xs font-mono rounded-lg border border-slate-300 focus:border-amber-500 focus:outline-none"
                  />
                </div>
              </div>

              {/* Account, Playbook, Grade, Session */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                <div>
                  <label className="block text-[11px] font-semibold text-slate-600 mb-1">Account</label>
                  <select
                    value={form.accountLabel}
                    onChange={(e) => setForm((f) => ({ ...f, accountLabel: e.target.value }))}
                    className="w-full px-2.5 py-2 text-xs rounded-lg border border-slate-300 bg-white focus:border-amber-500 focus:outline-none"
                  >
                    {ACCOUNT_OPTIONS.map((a) => (
                      <option key={a} value={a}>
                        {a}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-[11px] font-semibold text-slate-600 mb-1">Playbook</label>
                  <select
                    value={form.playbook}
                    onChange={(e) => setForm((f) => ({ ...f, playbook: e.target.value }))}
                    className="w-full px-2.5 py-2 text-xs rounded-lg border border-slate-300 bg-white focus:border-amber-500 focus:outline-none"
                  >
                    {playbookOptions.map((pb) => (
                      <option key={pb} value={pb}>
                        {pb}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-[11px] font-semibold text-slate-600 mb-1">Setup Grade</label>
                  <div className="grid grid-cols-4 gap-1">
                    {GRADE_OPTIONS.map((g) => (
                      <button
                        key={g}
                        type="button"
                        onClick={() => setForm((f) => ({ ...f, setupGrade: g }))}
                        className={`py-2 text-xs font-mono font-bold rounded-lg border cursor-pointer ${
                          form.setupGrade === g
                            ? 'bg-[#0B0F19] border-[#0B0F19] text-[#E5A93C]'
                            : 'bg-white border-slate-200 text-slate-600'
                        }`}
                      >
                        {g}
                      </button>
                    ))}
                  </div>
                </div>
                <div>
                  <label className="block text-[11px] font-semibold text-slate-600 mb-1">Session</label>
                  <select
                    value={form.session}
                    onChange={(e) => setForm((f) => ({ ...f, session: e.target.value }))}
                    className="w-full px-2.5 py-2 text-xs rounded-lg border border-slate-300 bg-white focus:border-amber-500 focus:outline-none"
                  >
                    {SESSION_OPTIONS.map((s) => (
                      <option key={s} value={s}>
                        {s}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              {/* Pricing, Times, R-Multiple, MFE/MAE */}
              <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
                <div>
                  <label className="block text-[11px] font-semibold text-slate-600 mb-1">Entry Price</label>
                  <input
                    type="number"
                    step="any"
                    value={form.entryPrice}
                    onChange={(e) => setForm((f) => ({ ...f, entryPrice: e.target.value }))}
                    className="w-full px-2.5 py-1.5 text-xs font-mono rounded-lg border border-slate-300"
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-semibold text-slate-600 mb-1">Exit Price</label>
                  <input
                    type="number"
                    step="any"
                    value={form.exitPrice}
                    onChange={(e) => setForm((f) => ({ ...f, exitPrice: e.target.value }))}
                    className="w-full px-2.5 py-1.5 text-xs font-mono rounded-lg border border-slate-300"
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-semibold text-slate-600 mb-1">Stop Loss</label>
                  <input
                    type="number"
                    step="any"
                    value={form.sl}
                    onChange={(e) => setForm((f) => ({ ...f, sl: e.target.value }))}
                    className="w-full px-2.5 py-1.5 text-xs font-mono rounded-lg border border-slate-300"
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-semibold text-slate-600 mb-1">Take Profit</label>
                  <input
                    type="number"
                    step="any"
                    value={form.tp}
                    onChange={(e) => setForm((f) => ({ ...f, tp: e.target.value }))}
                    className="w-full px-2.5 py-1.5 text-xs font-mono rounded-lg border border-slate-300"
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-semibold text-slate-600 mb-1">Size (Lots)</label>
                  <input
                    type="number"
                    step="any"
                    value={form.size}
                    onChange={(e) => setForm((f) => ({ ...f, size: e.target.value }))}
                    className="w-full px-2.5 py-1.5 text-xs font-mono rounded-lg border border-slate-300"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-6 gap-3">
                <div>
                  <label className="block text-[11px] font-semibold text-slate-600 mb-1">Entry Time</label>
                  <input
                    type="time"
                    value={form.entryTime}
                    onChange={(e) => setForm((f) => ({ ...f, entryTime: e.target.value }))}
                    className="w-full px-2.5 py-1.5 text-xs font-mono rounded-lg border border-slate-300"
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-semibold text-slate-600 mb-1">Exit Time</label>
                  <input
                    type="time"
                    value={form.exitTime}
                    onChange={(e) => setForm((f) => ({ ...f, exitTime: e.target.value }))}
                    className="w-full px-2.5 py-1.5 text-xs font-mono rounded-lg border border-slate-300"
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-semibold text-slate-600 mb-1">Realized R</label>
                  <input
                    type="number"
                    step="0.01"
                    value={form.rMultiple}
                    onChange={(e) => setForm((f) => ({ ...f, rMultiple: e.target.value }))}
                    placeholder={computedPlannedRr ? String(computedPlannedRr) : '2.5'}
                    className="w-full px-2.5 py-1.5 text-xs font-mono rounded-lg border border-slate-300"
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-semibold text-slate-600 mb-1">Fees ($)</label>
                  <input
                    type="number"
                    step="any"
                    value={form.fees}
                    onChange={(e) => setForm((f) => ({ ...f, fees: e.target.value }))}
                    className="w-full px-2.5 py-1.5 text-xs font-mono rounded-lg border border-slate-300"
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-semibold text-slate-600 mb-1">MFE ($ Peak)</label>
                  <input
                    type="number"
                    step="any"
                    value={form.mfe}
                    onChange={(e) => setForm((f) => ({ ...f, mfe: e.target.value }))}
                    placeholder="Max gain"
                    className="w-full px-2.5 py-1.5 text-xs font-mono rounded-lg border border-slate-300"
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-semibold text-slate-600 mb-1">MAE ($ DD)</label>
                  <input
                    type="number"
                    step="any"
                    value={form.mae}
                    onChange={(e) => setForm((f) => ({ ...f, mae: e.target.value }))}
                    placeholder="Max heat"
                    className="w-full px-2.5 py-1.5 text-xs font-mono rounded-lg border border-slate-300"
                  />
                </div>
              </div>

              {/* Confluence Checklist */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <label className="text-xs font-bold text-slate-800">Confluence Checklist</label>
                  <span className="text-[11px] font-mono text-slate-500">
                    {form.confluences.length}/{STANDARD_CONFLUENCE_TAGS.length} checked
                  </span>
                </div>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                  {STANDARD_CONFLUENCE_TAGS.map((tag) => {
                    const active = form.confluences.includes(tag);
                    return (
                      <button
                        key={tag}
                        type="button"
                        onClick={() => setForm((f) => ({ ...f, confluences: toggleTag(f.confluences, tag) }))}
                        className={`px-2.5 py-1.5 text-[11px] font-medium rounded-lg border text-left transition-colors cursor-pointer ${
                          active
                            ? 'bg-emerald-50 border-emerald-400 text-emerald-900'
                            : 'bg-white border-slate-200 text-slate-600 hover:border-slate-300'
                        }`}
                      >
                        {active ? '✓ ' : '+ '}
                        {tag}
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Mistake Tags */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <label className="text-xs font-bold text-slate-800">Mistake & Leakage Tags</label>
                  <span className="text-[11px] text-slate-500">Feeds Cost-of-Mistakes analytics</span>
                </div>
                <div className="grid grid-cols-2 sm:grid-cols-5 gap-2">
                  {STANDARD_MISTAKE_TAGS.map((tag) => {
                    const active = form.mistakes.includes(tag);
                    return (
                      <button
                        key={tag}
                        type="button"
                        onClick={() => setForm((f) => ({ ...f, mistakes: toggleTag(f.mistakes, tag) }))}
                        className={`px-2.5 py-1.5 text-[11px] font-medium rounded-lg border text-left transition-colors cursor-pointer ${
                          active
                            ? 'bg-rose-50 border-rose-400 text-rose-800'
                            : 'bg-white border-slate-200 text-slate-600 hover:border-slate-300'
                        }`}
                      >
                        {tag}
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Emotional State & Execution Rating */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-[11px] font-semibold text-slate-600 mb-1">Emotional State</label>
                  <select
                    value={form.emotions}
                    onChange={(e) => setForm((f) => ({ ...f, emotions: e.target.value }))}
                    className="w-full px-3 py-2 text-xs rounded-lg border border-slate-300 bg-white"
                  >
                    {STANDARD_EMOTION_STATES.map((em) => (
                      <option key={em} value={em}>
                        {em}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-[11px] font-semibold text-slate-600 mb-1">Execution Quality (1–5)</label>
                  <div className="flex items-center gap-1.5 pt-1">
                    {[1, 2, 3, 4, 5].map((star) => (
                      <button
                        key={star}
                        type="button"
                        onClick={() => setForm((f) => ({ ...f, rating: star }))}
                        className={`p-1.5 rounded-lg border cursor-pointer ${
                          star <= form.rating
                            ? 'bg-amber-50 border-amber-300 text-[#B45309]'
                            : 'bg-white border-slate-200 text-slate-300'
                        }`}
                      >
                        <Star className="w-4 h-4 fill-current" />
                      </button>
                    ))}
                  </div>
                </div>
              </div>

              {/* Narrative Notes */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div>
                  <label className="block text-[11px] font-semibold text-slate-600 mb-1">Entry Thesis</label>
                  <textarea
                    rows={3}
                    value={form.reasonEntry}
                    onChange={(e) => setForm((f) => ({ ...f, reasonEntry: e.target.value }))}
                    placeholder="HTF DOL, sweep, displacement, PD array..."
                    className="w-full px-3 py-2 text-xs rounded-lg border border-slate-300 focus:border-amber-500 focus:outline-none"
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-semibold text-slate-600 mb-1">Exit & Management</label>
                  <textarea
                    rows={3}
                    value={form.reasonExit}
                    onChange={(e) => setForm((f) => ({ ...f, reasonExit: e.target.value }))}
                    placeholder="Partials, BE move, TP hit or invalidation..."
                    className="w-full px-3 py-2 text-xs rounded-lg border border-slate-300 focus:border-amber-500 focus:outline-none"
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-semibold text-slate-600 mb-1">Key Lesson</label>
                  <textarea
                    rows={3}
                    value={form.lessons}
                    onChange={(e) => setForm((f) => ({ ...f, lessons: e.target.value }))}
                    placeholder="What will you repeat or eliminate next session?"
                    className="w-full px-3 py-2 text-xs rounded-lg border border-slate-300 focus:border-amber-500 focus:outline-none"
                  />
                </div>
              </div>

              {/* Chart Screenshot Upload */}
              <div>
                <label className="block text-[11px] font-semibold text-slate-600 mb-1">Chart Screenshot Markup (Optional)</label>
                <div className="flex flex-wrap items-center gap-3">
                  <input
                    type="file"
                    accept="image/*"
                    onChange={handleScreenshotUpload}
                    className="text-xs text-slate-600 file:mr-3 file:py-1.5 file:px-3 file:rounded-lg file:border file:border-slate-200 file:text-xs file:font-semibold file:bg-slate-50 file:text-slate-700 hover:file:bg-slate-100"
                  />
                  {form.imageData && (
                    <button
                      type="button"
                      onClick={() => setForm((f) => ({ ...f, imageData: '' }))}
                      className="text-xs font-semibold text-rose-600 hover:underline cursor-pointer"
                    >
                      Remove image
                    </button>
                  )}
                </div>
              </div>
            </div>

            <div className="px-6 py-4 border-t border-slate-200 bg-[#FAF9F6] flex items-center justify-end gap-2.5">
              <button
                type="button"
                onClick={() => setModalOpen(false)}
                className="px-4 py-2 text-xs font-semibold rounded-lg border border-slate-200 bg-white text-slate-700 hover:text-slate-950 cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={saving}
                className="px-5 py-2 text-xs font-semibold rounded-lg bg-[#0B0F19] text-[#E5A93C] hover:bg-slate-900 cursor-pointer disabled:opacity-50"
              >
                {saving ? 'Saving...' : editingId ? 'Save Changes' : 'Save Execution'}
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
};
