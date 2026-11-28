import React, { useMemo, useState } from 'react';
import { BarChart3, Calendar, Clock, Layers, ShieldAlert, TrendingUp } from 'lucide-react';
import {
  computeTradeAnalytics,
  filterJournalTrades,
  getTradePlaybook,
  type BreakdownRow,
  type GridScoreBreakdown,
  type TradeFilterCriteria,
} from '../../lib/tradeMetrics';
import type { JournalTrade } from '../../types';
import { PnlCalendarHeatmap } from './PnlCalendarHeatmap';

type ReportTab = 'overview' | 'playbooks' | 'mistakes' | 'time_markets';
type DatePreset = 'all' | '30d' | '90d' | 'mtd';

function fmtMoney(v: number): string {
  const abs = Math.abs(v).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  if (v > 0) return `+$${abs}`;
  if (v < 0) return `-$${abs}`;
  return `$${abs}`;
}

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

/* ---------------- 5-Axis GridScore SVG Radar ---------------- */
const GridScoreRadar: React.FC<{ score: GridScoreBreakdown; hasData: boolean }> = ({ score, hasData }) => {
  const axes = [
    { label: 'Win %', value: score.winRateScore },
    { label: 'Profit Factor', value: score.profitFactorScore },
    { label: 'Avg W/L', value: score.avgWinLossScore },
    { label: 'Drawdown', value: score.drawdownScore },
    { label: 'Consistency', value: score.consistencyScore },
  ];

  const cx = 130;
  const cy = 115;
  const maxR = 76;

  const pointFor = (idx: number, pct: number) => {
    const angle = -Math.PI / 2 + (idx * 2 * Math.PI) / axes.length;
    const r = (pct / 100) * maxR;
    return { x: cx + r * Math.cos(angle), y: cy + r * Math.sin(angle) };
  };

  const rings = [25, 50, 75, 100];
  const dataPoints = axes.map((a, i) => pointFor(i, hasData ? Math.max(8, a.value) : 0));
  const polygonStr = dataPoints.map((p) => `${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(' ');

  return (
    <div className="flex flex-col items-center">
      <svg viewBox="0 0 260 230" className="w-full max-w-[260px] h-auto" role="img" aria-label="GridScore radar chart">
        {rings.map((ring) => {
          const pts = axes.map((_, i) => pointFor(i, ring));
          return (
            <polygon
              key={ring}
              points={pts.map((p) => `${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(' ')}
              fill="none"
              stroke="rgba(148, 163, 184, 0.22)"
              strokeWidth="1"
            />
          );
        })}

        {axes.map((axis, i) => {
          const end = pointFor(i, 100);
          const lbl = pointFor(i, 122);
          return (
            <g key={axis.label}>
              <line x1={cx} y1={cy} x2={end.x} y2={end.y} stroke="rgba(148, 163, 184, 0.22)" strokeWidth="1" />
              <text
                x={lbl.x}
                y={lbl.y}
                textAnchor="middle"
                dominantBaseline="middle"
                fill="#cbd5e1"
                fontSize="9.5"
                fontWeight="600"
              >
                {axis.label}
              </text>
            </g>
          );
        })}

        {hasData && (
          <>
            <polygon points={polygonStr} fill="rgba(229, 169, 60, 0.28)" stroke="#E5A93C" strokeWidth="2" />
            {dataPoints.map((p, i) => (
              <circle key={i} cx={p.x} cy={p.y} r="3.2" fill="#E5A93C" />
            ))}
          </>
        )}
      </svg>
    </div>
  );
};

/* ---------------- Institutional Breakdown Table ---------------- */
const BreakdownTable: React.FC<{ title: string; subtitle?: string; rows: BreakdownRow[] }> = ({
  title,
  subtitle,
  rows,
}) => (
  <div className="rounded-2xl bg-white border border-slate-200 shadow-xs overflow-hidden">
    <div className="px-5 py-4 border-b border-slate-100">
      <h3 className="text-sm font-bold text-slate-950">{title}</h3>
      {subtitle && <p className="text-xs text-slate-500 mt-0.5">{subtitle}</p>}
    </div>
    {rows.length === 0 ? (
      <div className="p-6 text-xs text-slate-500 text-center">No trade records in this segment yet.</div>
    ) : (
      <div className="overflow-x-auto">
        <table className="w-full text-left border-collapse">
          <thead>
            <tr className="bg-[#FAF9F6] border-b border-slate-200 text-[11px] font-semibold uppercase tracking-wider text-slate-500">
              <th className="py-2.5 px-4">Segment</th>
              <th className="py-2.5 px-3 text-right">Trades</th>
              <th className="py-2.5 px-3 text-right">Win %</th>
              <th className="py-2.5 px-3 text-right">Profit Factor</th>
              <th className="py-2.5 px-3 text-right">Expectancy</th>
              <th className="py-2.5 px-3 text-right">Avg R</th>
              <th className="py-2.5 px-3 text-right">Rules %</th>
              <th className="py-2.5 px-4 text-right">Net P&L</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 text-xs">
            {rows.map((r) => (
              <tr key={r.label} className="hover:bg-slate-50/70">
                <td className="py-2.5 px-4 font-semibold text-slate-900">{r.label}</td>
                <td className="py-2.5 px-3 text-right font-mono tabular-nums text-slate-600">
                  {r.trades} <span className="text-[10px] text-slate-400">({r.wins}W/{r.losses}L)</span>
                </td>
                <td className="py-2.5 px-3 text-right font-mono tabular-nums text-slate-800">{r.winRate.toFixed(1)}%</td>
                <td className="py-2.5 px-3 text-right font-mono tabular-nums text-slate-800">
                  {r.profitFactor === null ? '—' : r.profitFactor >= 99 ? '∞' : r.profitFactor.toFixed(2)}
                </td>
                <td
                  className={`py-2.5 px-3 text-right font-mono tabular-nums ${
                    r.expectancy >= 0 ? 'text-emerald-700' : 'text-rose-600'
                  }`}
                >
                  {fmtMoney(r.expectancy)}
                </td>
                <td className="py-2.5 px-3 text-right font-mono tabular-nums text-slate-700">
                  {r.avgR !== null ? `${r.avgR >= 0 ? '+' : ''}${r.avgR.toFixed(2)}R` : '—'}
                </td>
                <td className="py-2.5 px-3 text-right font-mono tabular-nums text-slate-600">
                  {r.avgAdherence.toFixed(0)}%
                </td>
                <td
                  className={`py-2.5 px-4 text-right font-mono font-bold tabular-nums ${
                    r.netPnl > 0 ? 'text-emerald-700' : r.netPnl < 0 ? 'text-rose-600' : 'text-slate-700'
                  }`}
                >
                  {fmtMoney(r.netPnl)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    )}
  </div>
);

export const AnalyticsView: React.FC<{ trades: JournalTrade[] }> = ({ trades }) => {
  const [activeTab, setActiveTab] = useState<ReportTab>('overview');
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

  const playbooks = useMemo(() => {
    const set = new Set<string>();
    trades.forEach((t) => set.add(getTradePlaybook(t)));
    return Array.from(set).sort();
  }, [trades]);

  const accounts = useMemo(() => {
    const set = new Set<string>();
    trades.forEach((t) => set.add(t.account_label || 'Live Account'));
    return Array.from(set).sort();
  }, [trades]);

  const filteredTrades = useMemo(() => filterJournalTrades(trades, filters), [trades, filters]);
  const stats = useMemo(() => computeTradeAnalytics(filteredTrades), [filteredTrades]);

  function applyPreset(preset: DatePreset) {
    setDatePreset(preset);
    if (preset === 'all') setFilters((f) => ({ ...f, startDate: '', endDate: '' }));
    else if (preset === '30d') setFilters((f) => ({ ...f, startDate: getDateOffsetIso(30), endDate: getTodayIso() }));
    else if (preset === '90d') setFilters((f) => ({ ...f, startDate: getDateOffsetIso(90), endDate: getTodayIso() }));
    else if (preset === 'mtd') setFilters((f) => ({ ...f, startDate: getMonthStartIso(), endDate: getTodayIso() }));
  }

  // Equity & Drawdown SVG geometry
  const eqChart = useMemo(() => {
    const pts = stats.equityCurve;
    if (!pts.length) return null;
    const width = 680;
    const height = 210;
    const padX = 28;
    const padY = 18;
    const values = [0, ...pts.map((p) => p.equity)];
    const minV = Math.min(...values);
    const maxV = Math.max(...values);
    const span = Math.max(1, maxV - minV);

    const coords = values.map((v, i) => {
      const x = padX + (i / Math.max(1, values.length - 1)) * (width - padX * 2);
      const y = height - padY - ((v - minV) / span) * (height - padY * 2);
      return { x, y, v };
    });

    const zeroY = height - padY - ((0 - minV) / span) * (height - padY * 2);
    const linePath = coords.map((c, i) => `${i === 0 ? 'M' : 'L'} ${c.x.toFixed(1)} ${c.y.toFixed(1)}`).join(' ');
    const areaPath = `${linePath} L ${coords[coords.length - 1].x.toFixed(1)} ${zeroY.toFixed(1)} L ${coords[0].x.toFixed(1)} ${zeroY.toFixed(1)} Z`;

    const ddValues = [0, ...pts.map((p) => p.drawdown)];
    const minDd = Math.min(-1, ...ddValues);
    const ddHeight = 110;
    const ddCoords = ddValues.map((v, i) => {
      const x = padX + (i / Math.max(1, ddValues.length - 1)) * (width - padX * 2);
      const y = 14 + (Math.abs(v) / Math.abs(minDd)) * (ddHeight - 28);
      return { x, y };
    });
    const ddLine = ddCoords.map((c, i) => `${i === 0 ? 'M' : 'L'} ${c.x.toFixed(1)} ${c.y.toFixed(1)}`).join(' ');
    const ddArea = `${ddLine} L ${ddCoords[ddCoords.length - 1].x.toFixed(1)} 14 L ${ddCoords[0].x.toFixed(1)} 14 Z`;

    return { width, height, ddHeight, zeroY, linePath, areaPath, ddLine, ddArea, maxV, minV, minDd };
  }, [stats.equityCurve]);

  const orderedDow = useMemo(() => {
    const order = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
    const map = new Map(stats.byDayOfWeek.map((r) => [r.label, r]));
    return order.map((day) => map.get(day)).filter((r): r is BreakdownRow => Boolean(r));
  }, [stats.byDayOfWeek]);

  const maxDowAbs = useMemo(
    () => Math.max(1, ...orderedDow.map((d) => Math.abs(d.netPnl))),
    [orderedDow]
  );

  const maxMistakeLoss = useMemo(
    () => Math.max(1, ...stats.mistakeCosts.map((m) => Math.max(m.lossAmount, Math.abs(m.netPnl)))),
    [stats.mistakeCosts]
  );

  const scoreTier =
    stats.gridScore.overall >= 80
      ? 'Institutional Edge'
      : stats.gridScore.overall >= 60
      ? 'Developing Consistency'
      : stats.totalTrades > 0
      ? 'Needs Risk Tightening'
      : 'Awaiting Data';

  return (
    <div className="space-y-5">
      {/* Tracking Filter Bar */}
      <div className="rounded-2xl bg-white border border-slate-200 shadow-xs p-4 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-bold tracking-tight text-slate-950">Performance Analytics & Diagnostics</h2>
          <p className="text-xs text-slate-500 mt-0.5">
            Track GridScore pillars, equity & drawdown curves, playbook attribution, and mistake cost leakage.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <div className="inline-flex rounded-lg border border-slate-200 bg-[#FAF9F6] p-0.5">
            {(
              [
                ['all', 'All'],
                ['30d', '30D'],
                ['90d', '90D'],
                ['mtd', 'MTD'],
              ] as const
            ).map(([k, lbl]) => (
              <button
                key={k}
                type="button"
                onClick={() => applyPreset(k)}
                className={`px-2.5 py-1 text-xs font-semibold rounded-md cursor-pointer transition-colors ${
                  datePreset === k ? 'bg-[#0B0F19] text-[#E5A93C]' : 'text-slate-600 hover:text-slate-950'
                }`}
              >
                {lbl}
              </button>
            ))}
          </div>

          <input
            type="date"
            value={filters.startDate}
            onChange={(e) => {
              setDatePreset('all');
              setFilters((f) => ({ ...f, startDate: e.target.value }));
            }}
            aria-label="Analytics start date"
            className="px-2.5 py-1.5 text-xs font-mono rounded-lg border border-slate-200 bg-white text-slate-800"
          />
          <input
            type="date"
            value={filters.endDate}
            onChange={(e) => {
              setDatePreset('all');
              setFilters((f) => ({ ...f, endDate: e.target.value }));
            }}
            aria-label="Analytics end date"
            className="px-2.5 py-1.5 text-xs font-mono rounded-lg border border-slate-200 bg-white text-slate-800"
          />

          <select
            value={filters.account}
            onChange={(e) => setFilters((f) => ({ ...f, account: e.target.value }))}
            className="px-2.5 py-1.5 text-xs rounded-lg border border-slate-200 bg-white text-slate-800"
          >
            <option value="All">All Accounts</option>
            {accounts.map((a) => (
              <option key={a} value={a}>
                {a}
              </option>
            ))}
          </select>

          <select
            value={filters.playbook}
            onChange={(e) => setFilters((f) => ({ ...f, playbook: e.target.value }))}
            className="px-2.5 py-1.5 text-xs rounded-lg border border-slate-200 bg-white text-slate-800 max-w-[180px]"
          >
            <option value="All">All Playbooks</option>
            {playbooks.map((p) => (
              <option key={p} value={p}>
                {p}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* Hero 2-Column Split: GridScore Radar (Obsidian/Gold) + 6 Performance KPIs */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
        <div className="lg:col-span-4 rounded-2xl bg-[#0B0F19] text-white border border-slate-800 p-5 flex flex-col justify-between">
          <div className="flex items-start justify-between">
            <div>
              <div className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">GridScore Index</div>
              <div className="text-xs text-[#E5A93C] font-medium mt-0.5">{scoreTier}</div>
            </div>
            <div className="text-right">
              <span className="text-3xl font-bold font-mono tabular-nums text-[#E5A93C]">
                {stats.totalTrades ? stats.gridScore.overall : '—'}
              </span>
              <span className="text-xs font-mono text-slate-400"> / 100</span>
            </div>
          </div>

          <GridScoreRadar score={stats.gridScore} hasData={stats.totalTrades > 0} />

          <div className="space-y-1.5 pt-2 border-t border-slate-800/80 text-[11px]">
            {[
              ['Win Rate Pillar', stats.gridScore.winRateScore],
              ['Profit Factor Pillar', stats.gridScore.profitFactorScore],
              ['Avg Win / Loss Pillar', stats.gridScore.avgWinLossScore],
              ['Drawdown Control', stats.gridScore.drawdownScore],
              ['Consistency & Rules', stats.gridScore.consistencyScore],
            ].map(([label, val]) => (
              <div key={String(label)} className="flex items-center justify-between gap-2">
                <span className="text-slate-400">{label}</span>
                <div className="flex items-center gap-2 w-32">
                  <div className="flex-1 h-1.5 rounded-full bg-slate-800 overflow-hidden">
                    <div
                      className="h-full bg-[#E5A93C]"
                      style={{ width: `${stats.totalTrades ? Number(val) : 0}%` }}
                    />
                  </div>
                  <span className="font-mono tabular-nums text-slate-200 w-7 text-right">
                    {stats.totalTrades ? val : '—'}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="lg:col-span-8 grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-3.5">
          <div className="rounded-2xl bg-white border border-slate-200 p-4 flex flex-col justify-between">
            <div className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">Net Realized P&L</div>
            <div
              className={`text-2xl font-bold font-mono tabular-nums mt-2 ${
                stats.netPnl > 0 ? 'text-emerald-700' : stats.netPnl < 0 ? 'text-rose-600' : 'text-slate-900'
              }`}
            >
              {fmtMoney(stats.netPnl)}
            </div>
            <div className="mt-3 pt-2.5 border-t border-slate-100 flex items-center justify-between text-[11px] font-mono tabular-nums">
              <span className="text-emerald-700">GP +${stats.grossProfit.toFixed(0)}</span>
              <span className="text-rose-600">GL -${stats.grossLoss.toFixed(0)}</span>
            </div>
          </div>

          <div className="rounded-2xl bg-white border border-slate-200 p-4 flex flex-col justify-between">
            <div className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">Profit Factor</div>
            <div className="text-2xl font-bold font-mono tabular-nums text-slate-950 mt-2">
              {stats.profitFactor === null ? '—' : stats.profitFactor >= 99 ? '∞' : stats.profitFactor.toFixed(2)}
            </div>
            <div className="mt-3 pt-2.5 border-t border-slate-100 flex items-center justify-between text-[11px] text-slate-500 font-mono">
              <span>Fees: ${stats.totalFees.toFixed(2)}</span>
              <span>{stats.totalTrades} trades</span>
            </div>
          </div>

          <div className="rounded-2xl bg-white border border-slate-200 p-4 flex flex-col justify-between">
            <div className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">Trade Expectancy</div>
            <div
              className={`text-2xl font-bold font-mono tabular-nums mt-2 ${
                stats.expectancyUsd >= 0 ? 'text-emerald-700' : 'text-rose-600'
              }`}
            >
              {fmtMoney(stats.expectancyUsd)}
            </div>
            <div className="mt-3 pt-2.5 border-t border-slate-100 flex items-center justify-between text-[11px] text-slate-500 font-mono">
              <span>
                Avg R:{' '}
                {stats.avgRMultiple !== null
                  ? `${stats.avgRMultiple >= 0 ? '+' : ''}${stats.avgRMultiple.toFixed(2)}R`
                  : '—'}
              </span>
              <span>Rules: {stats.totalTrades ? `${stats.avgAdherencePct.toFixed(0)}%` : '—'}</span>
            </div>
          </div>

          <div className="rounded-2xl bg-white border border-slate-200 p-4 flex flex-col justify-between">
            <div className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">Win % & Day Win %</div>
            <div className="flex items-baseline gap-3 mt-2">
              <span className="text-2xl font-bold font-mono tabular-nums text-slate-950">
                {stats.winRate.toFixed(1)}%
              </span>
              <span className="text-xs font-mono text-[#B45309] font-semibold">
                {stats.dayWinRate.toFixed(0)}% days
              </span>
            </div>
            <div className="mt-3 pt-2.5 border-t border-slate-100 flex items-center justify-between text-[11px] font-mono text-slate-500">
              <span>
                {stats.wins}W / {stats.losses}L / {stats.breakeven}BE
              </span>
              <span>
                {stats.winningDays}G / {stats.losingDays}R days
              </span>
            </div>
          </div>

          <div className="rounded-2xl bg-white border border-slate-200 p-4 flex flex-col justify-between">
            <div className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">Avg Win vs Avg Loss</div>
            <div className="text-2xl font-bold font-mono tabular-nums text-slate-950 mt-2">
              {stats.avgWinLossRatio === null ? '—' : `${stats.avgWinLossRatio.toFixed(2)} : 1`}
            </div>
            <div className="mt-2 h-2 w-full rounded-full bg-rose-100 overflow-hidden flex">
              <div
                className="bg-emerald-600 h-full"
                style={{
                  width: `${
                    stats.avgWin + stats.avgLoss > 0 ? (stats.avgWin / (stats.avgWin + stats.avgLoss)) * 100 : 50
                  }%`,
                }}
              />
            </div>
            <div className="mt-2 flex items-center justify-between text-[11px] font-mono tabular-nums">
              <span className="text-emerald-700">+${stats.avgWin.toFixed(2)}</span>
              <span className="text-rose-600">-${stats.avgLoss.toFixed(2)}</span>
            </div>
          </div>

          <div className="rounded-2xl bg-white border border-slate-200 p-4 flex flex-col justify-between">
            <div className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">Max Drawdown & Streaks</div>
            <div className="text-2xl font-bold font-mono tabular-nums text-rose-600 mt-2">
              -${stats.maxDrawdownUsd.toFixed(2)}
            </div>
            <div className="mt-3 pt-2.5 border-t border-slate-100 flex items-center justify-between text-[11px] font-mono text-slate-500">
              <span>
                RF: {stats.recoveryFactor !== null ? stats.recoveryFactor.toFixed(2) : '—'}
              </span>
              <span>
                Max {stats.maxWinStreak}W / {stats.maxLossStreak}L
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* Sub-Report Tabs */}
      <div className="flex flex-wrap items-center gap-2 border-b border-slate-200 pb-2">
        {(
          [
            ['overview', 'Overview & Calendar', TrendingUp],
            ['playbooks', 'Playbooks & Grades', Layers],
            ['mistakes', 'Mistakes & Psychology', ShieldAlert],
            ['time_markets', 'Time & Markets', Clock],
          ] as const
        ).map(([id, label, Icon]) => (
          <button
            key={id}
            type="button"
            onClick={() => setActiveTab(id)}
            className={`inline-flex items-center gap-1.5 px-4 py-2 text-xs font-semibold rounded-lg transition-colors cursor-pointer ${
              activeTab === id
                ? 'bg-[#0B0F19] text-[#E5A93C]'
                : 'bg-white border border-slate-200 text-slate-600 hover:text-slate-950 hover:border-amber-300'
            }`}
          >
            <Icon className="w-3.5 h-3.5" />
            {label}
          </button>
        ))}
      </div>

      {/* Empty State Guard */}
      {stats.totalTrades === 0 ? (
        <div className="rounded-2xl bg-white border border-slate-200 p-10 text-center space-y-2">
          <BarChart3 className="w-8 h-8 text-[#B45309] mx-auto" />
          <h3 className="text-sm font-bold text-slate-950">No Trades in Selected Range</h3>
          <p className="text-xs text-slate-500 max-w-md mx-auto">
            Log trades in the Trading Journal or adjust the date/playbook filters above to populate equity curves,
            mistake leakage analysis, and playbook metrics.
          </p>
        </div>
      ) : activeTab === 'overview' ? (
        <div className="space-y-5">
          {/* Cumulative Equity Curve + Underwater Drawdown */}
          {eqChart && (
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
              <div className="lg:col-span-8 rounded-2xl bg-white border border-slate-200 shadow-xs p-5 space-y-3">
                <div className="flex items-center justify-between">
                  <div>
                    <h3 className="text-sm font-bold text-slate-950">Cumulative Net P&L Equity Curve</h3>
                    <p className="text-xs text-slate-500">Chronological trade-by-trade realized performance</p>
                  </div>
                  <span
                    className={`text-sm font-bold font-mono tabular-nums ${
                      stats.netPnl >= 0 ? 'text-emerald-700' : 'text-rose-600'
                    }`}
                  >
                    {fmtMoney(stats.netPnl)}
                  </span>
                </div>
                <svg viewBox={`0 0 ${eqChart.width} ${eqChart.height}`} className="w-full h-52">
                  <line
                    x1="28"
                    x2={eqChart.width - 28}
                    y1={eqChart.zeroY}
                    y2={eqChart.zeroY}
                    stroke="#cbd5e1"
                    strokeDasharray="4 4"
                    strokeWidth="1"
                  />
                  <path
                    d={eqChart.areaPath}
                    fill={stats.netPnl >= 0 ? 'rgba(16, 185, 129, 0.14)' : 'rgba(225, 29, 72, 0.12)'}
                  />
                  <path
                    d={eqChart.linePath}
                    fill="none"
                    stroke={stats.netPnl >= 0 ? '#047857' : '#e11d48'}
                    strokeWidth="2.4"
                  />
                </svg>

                <div className="pt-3 border-t border-slate-100">
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">
                      Underwater Drawdown
                    </span>
                    <span className="text-xs font-mono font-semibold text-rose-600">
                      Peak-to-Trough: -${stats.maxDrawdownUsd.toFixed(2)}
                    </span>
                  </div>
                  <svg viewBox={`0 0 ${eqChart.width} ${eqChart.ddHeight}`} className="w-full h-24">
                    <line x1="28" x2={eqChart.width - 28} y1="14" y2="14" stroke="#e2e8f0" strokeWidth="1" />
                    <path d={eqChart.ddArea} fill="rgba(225, 29, 72, 0.16)" />
                    <path d={eqChart.ddLine} fill="none" stroke="#e11d48" strokeWidth="1.8" />
                  </svg>
                </div>
              </div>

              {/* Daily Net P&L Bars */}
              <div className="lg:col-span-4 rounded-2xl bg-white border border-slate-200 shadow-xs p-5 flex flex-col justify-between">
                <div>
                  <h3 className="text-sm font-bold text-slate-950">Recent Daily Net P&L</h3>
                  <p className="text-xs text-slate-500 mt-0.5">Last {Math.min(12, stats.dailySeries.length)} trading sessions</p>
                </div>
                <div className="space-y-2 mt-4">
                  {(() => {
                    const recent = stats.dailySeries.slice(-12);
                    const maxDay = Math.max(1, ...recent.map((d) => Math.abs(d.pnl)));
                    return recent.map((day) => {
                      const pct = Math.max(6, (Math.abs(day.pnl) / maxDay) * 100);
                      return (
                        <div key={day.date} className="flex items-center gap-2 text-xs">
                          <span className="font-mono text-[11px] text-slate-500 w-20 shrink-0">{day.date.slice(5)}</span>
                          <div className="flex-1 h-4 bg-slate-100 rounded overflow-hidden">
                            <div
                              className={`h-full rounded ${day.pnl >= 0 ? 'bg-emerald-600' : 'bg-rose-500'}`}
                              style={{ width: `${pct}%` }}
                            />
                          </div>
                          <span
                            className={`font-mono font-semibold tabular-nums w-20 text-right ${
                              day.pnl >= 0 ? 'text-emerald-700' : 'text-rose-600'
                            }`}
                          >
                            {fmtMoney(day.pnl)}
                          </span>
                        </div>
                      );
                    });
                  })()}
                </div>
              </div>
            </div>
          )}

          {/* Monthly Calendar Heatmap */}
          <PnlCalendarHeatmap dailyMap={stats.dailyMap} title="Monthly P&L Calendar & Weekly Totals" />
        </div>
      ) : activeTab === 'playbooks' ? (
        <div className="space-y-5">
          <BreakdownTable
            title="Playbook Attribution Report"
            subtitle="Compare win rate, profit factor, expectancy, and rule adherence across every setup model."
            rows={stats.byPlaybook}
          />
          <BreakdownTable
            title="Setup Quality Grade Breakdown (A+ to C)"
            subtitle="Verify whether A+ and A setups generate the bulk of your edge."
            rows={stats.byGrade}
          />
        </div>
      ) : activeTab === 'mistakes' ? (
        <div className="space-y-5">
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
            {/* Cost of Mistakes Quantifier */}
            <div className="lg:col-span-7 rounded-2xl bg-white border border-slate-200 shadow-xs p-5 space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-sm font-bold text-slate-950">Cost of Mistakes Quantifier</h3>
                  <p className="text-xs text-slate-500 mt-0.5">
                    Exact dollar impact of every behavioral leak tagged in your journal.
                  </p>
                </div>
                <Calendar className="w-4 h-4 text-slate-400" />
              </div>

              {stats.mistakeCosts.length === 0 ? (
                <div className="p-6 rounded-xl bg-emerald-50/60 border border-emerald-200 text-xs text-emerald-800">
                  No mistake tags logged in this date range. Tag execution errors inside your Journal trades to quantify
                  which habits cost the most capital.
                </div>
              ) : (
                <div className="space-y-3">
                  {stats.mistakeCosts.map((m) => {
                    const barW = Math.max(8, (Math.max(m.lossAmount, Math.abs(m.netPnl)) / maxMistakeLoss) * 100);
                    return (
                      <div key={m.tag} className="space-y-1">
                        <div className="flex items-center justify-between text-xs">
                          <span className="font-semibold text-slate-900">
                            {m.tag}{' '}
                            <span className="text-slate-400 font-normal font-mono">
                              ({m.count}x · {m.winRate.toFixed(0)}% WR)
                            </span>
                          </span>
                          <span
                            className={`font-mono font-bold tabular-nums ${
                              m.netPnl < 0 ? 'text-rose-600' : 'text-emerald-700'
                            }`}
                          >
                            {fmtMoney(m.netPnl)}
                          </span>
                        </div>
                        <div className="h-2.5 w-full rounded-full bg-slate-100 overflow-hidden">
                          <div
                            className={`h-full rounded-full ${m.netPnl < 0 ? 'bg-rose-500' : 'bg-amber-500'}`}
                            style={{ width: `${barW}%` }}
                          />
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            {/* MFE / MAE Exit Efficiency Panel */}
            <div className="lg:col-span-5 rounded-2xl bg-[#0B0F19] text-white border border-slate-800 p-5 flex flex-col justify-between space-y-4">
              <div>
                <div className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">
                  Exit Efficiency (MFE / MAE)
                </div>
                <h3 className="text-base font-bold text-white mt-1">Peak Run-Up vs Heat Taken</h3>
                <p className="text-xs text-slate-400 mt-1">
                  Compare average Maximum Favorable Excursion (MFE) against Maximum Adverse Excursion (MAE) on logged trades.
                </p>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="p-3.5 rounded-xl bg-slate-900/90 border border-slate-800">
                  <div className="text-[11px] text-slate-400">Avg MFE (Peak Gain)</div>
                  <div className="text-lg font-bold font-mono tabular-nums text-emerald-400 mt-1">
                    {stats.avgMfe !== null ? `+$${Math.abs(stats.avgMfe).toFixed(2)}` : '—'}
                  </div>
                </div>
                <div className="p-3.5 rounded-xl bg-slate-900/90 border border-slate-800">
                  <div className="text-[11px] text-slate-400">Avg MAE (Max Heat)</div>
                  <div className="text-lg font-bold font-mono tabular-nums text-rose-400 mt-1">
                    {stats.avgMae !== null ? `-$${Math.abs(stats.avgMae).toFixed(2)}` : '—'}
                  </div>
                </div>
              </div>

              <div className="p-3.5 rounded-xl bg-slate-900/70 border border-slate-800 flex items-center justify-between text-xs">
                <span className="text-slate-300">Avg Execution Rating</span>
                <span className="font-mono font-bold text-[#E5A93C]">{stats.avgRating.toFixed(1)} / 5.0</span>
              </div>
            </div>
          </div>

          <BreakdownTable
            title="Emotional State Performance"
            subtitle="Measure how emotional states correlate with win rate and realized P&L."
            rows={stats.byEmotion}
          />
        </div>
      ) : (
        <div className="space-y-5">
          {/* Day of Week Bar Chart */}
          <div className="rounded-2xl bg-white border border-slate-200 shadow-xs p-5 space-y-4">
            <div>
              <h3 className="text-sm font-bold text-slate-950">Performance by Day of Week</h3>
              <p className="text-xs text-slate-500 mt-0.5">Identify which weekdays generate consistent profits vs chop.</p>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3">
              {orderedDow.map((d) => {
                const pct = Math.max(8, (Math.abs(d.netPnl) / maxDowAbs) * 100);
                return (
                  <div key={d.label} className="p-3.5 rounded-xl bg-[#FAF9F6] border border-slate-200 space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-bold text-slate-900">{d.label}</span>
                      <span className="text-[11px] font-mono text-slate-500">
                        {d.trades}t · {d.winRate.toFixed(0)}%
                      </span>
                    </div>
                    <div
                      className={`text-sm font-bold font-mono tabular-nums ${
                        d.netPnl >= 0 ? 'text-emerald-700' : 'text-rose-600'
                      }`}
                    >
                      {fmtMoney(d.netPnl)}
                    </div>
                    <div className="h-2 w-full rounded-full bg-slate-200 overflow-hidden">
                      <div
                        className={`h-full rounded-full ${d.netPnl >= 0 ? 'bg-emerald-600' : 'bg-rose-500'}`}
                        style={{ width: `${pct}%` }}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <BreakdownTable title="Session / Killzone Report" rows={stats.bySession} />
            <BreakdownTable title="Long vs Short Direction" rows={stats.bySide} />
          </div>

          <BreakdownTable title="Time-of-Day Buckets" rows={stats.byHourBucket} />
          <BreakdownTable title="Instrument Leaderboard" rows={stats.byInstrument} />
        </div>
      )}
    </div>
  );
};
