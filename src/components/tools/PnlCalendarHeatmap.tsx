import React, { useMemo, useState } from 'react';
import { ChevronLeft, ChevronRight, X } from 'lucide-react';
import type { JournalTrade } from '../../types';
import { getTradeMistakes, getTradePlaybook, getTradeRMultiple, type DaySummary } from '../../lib/tradeMetrics';

interface PnlCalendarHeatmapProps {
  dailyMap: Record<string, DaySummary>;
  onSelectTrade?: (trade: JournalTrade) => void;
  title?: string;
}

const DAY_HEADERS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const MONTH_NAMES = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December',
];

function formatDateKey(year: number, month: number, day: number): string {
  return `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

export const PnlCalendarHeatmap: React.FC<PnlCalendarHeatmapProps> = ({
  dailyMap,
  onSelectTrade,
  title = 'Monthly P&L Calendar',
}) => {
  // Default to the latest trade's month if present, otherwise current month
  const initialDate = useMemo(() => {
    const keys = Object.keys(dailyMap).filter((k) => /^\d{4}-\d{2}-\d{2}$/.test(k)).sort();
    if (keys.length > 0) {
      const latest = keys[keys.length - 1];
      const [y, m] = latest.split('-').map(Number);
      return { year: y, month: m - 1 };
    }
    const now = new Date();
    return { year: now.getFullYear(), month: now.getMonth() };
  }, [dailyMap]);

  const [cursor, setCursor] = useState(initialDate);
  const [selectedDate, setSelectedDate] = useState<string | null>(null);

  const calendarWeeks = useMemo(() => {
    const firstDayOfMonth = new Date(cursor.year, cursor.month, 1);
    const daysInMonth = new Date(cursor.year, cursor.month + 1, 0).getDate();
    const startWeekday = firstDayOfMonth.getDay();

    const weeks: Array<{
      weekIdx: number;
      cells: Array<{ day: number | null; dateKey: string | null; summary: DaySummary | null }>;
      weekPnl: number;
      weekTrades: number;
      tradingDays: number;
    }> = [];

    let dayNum = 1;
    let weekIdx = 1;
    while (dayNum <= daysInMonth) {
      const cells: Array<{ day: number | null; dateKey: string | null; summary: DaySummary | null }> = [];
      let weekPnl = 0;
      let weekTrades = 0;
      let tradingDays = 0;

      for (let wd = 0; wd < 7; wd++) {
        if ((weekIdx === 1 && wd < startWeekday) || dayNum > daysInMonth) {
          cells.push({ day: null, dateKey: null, summary: null });
        } else {
          const dateKey = formatDateKey(cursor.year, cursor.month, dayNum);
          const summary = dailyMap[dateKey] || null;
          if (summary) {
            weekPnl += summary.pnl;
            weekTrades += summary.trades.length;
            tradingDays += 1;
          }
          cells.push({ day: dayNum, dateKey, summary });
          dayNum += 1;
        }
      }
      weeks.push({ weekIdx, cells, weekPnl, weekTrades, tradingDays });
      weekIdx += 1;
    }
    return weeks;
  }, [cursor, dailyMap]);

  const monthStats = useMemo(() => {
    let pnl = 0;
    let trades = 0;
    let greenDays = 0;
    let redDays = 0;
    for (const w of calendarWeeks) {
      pnl += w.weekPnl;
      trades += w.weekTrades;
      for (const c of w.cells) {
        if (c.summary) {
          if (c.summary.pnl > 0) greenDays += 1;
          else if (c.summary.pnl < 0) redDays += 1;
        }
      }
    }
    return { pnl, trades, greenDays, redDays };
  }, [calendarWeeks]);

  const activeDaySummary = selectedDate ? dailyMap[selectedDate] || null : null;

  function stepMonth(delta: number) {
    setCursor((prev) => {
      const d = new Date(prev.year, prev.month + delta, 1);
      return { year: d.getFullYear(), month: d.getMonth() };
    });
    setSelectedDate(null);
  }

  return (
    <div className="bg-white border border-slate-200 shadow-xs rounded-xl p-5 sm:p-6 space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h3 className="text-base font-bold text-slate-950">{title}</h3>
          <div className="flex flex-wrap items-center gap-2 text-xs text-slate-500 mt-0.5 font-mono tabular-nums">
            <span className={`font-bold ${monthStats.pnl >= 0 ? 'text-emerald-700' : 'text-rose-600'}`}>
              Month: {monthStats.pnl >= 0 ? '+' : ''}${monthStats.pnl.toFixed(2)}
            </span>
            <span aria-hidden="true">·</span>
            <span>{monthStats.trades} trades</span>
            <span aria-hidden="true">·</span>
            <span className="text-emerald-700">{monthStats.greenDays} green days</span>
            <span aria-hidden="true">/</span>
            <span className="text-rose-600">{monthStats.redDays} red days</span>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => {
              const now = new Date();
              setCursor({ year: now.getFullYear(), month: now.getMonth() });
              setSelectedDate(null);
            }}
            className="px-2.5 py-1.5 text-xs font-semibold text-slate-700 border border-slate-200 rounded-lg hover:bg-slate-50 cursor-pointer whitespace-nowrap"
          >
            This Month
          </button>
          <div className="inline-flex items-center border border-slate-200 rounded-lg bg-slate-50">
            <button
              type="button"
              onClick={() => stepMonth(-1)}
              className="p-1.5 text-slate-600 hover:text-slate-950 cursor-pointer"
              aria-label="Previous month"
            >
              <ChevronLeft className="w-4 h-4" />
            </button>
            <span className="px-3 text-xs font-bold text-slate-950 whitespace-nowrap min-w-[122px] text-center">
              {MONTH_NAMES[cursor.month]} {cursor.year}
            </span>
            <button
              type="button"
              onClick={() => stepMonth(1)}
              className="p-1.5 text-slate-600 hover:text-slate-950 cursor-pointer"
              aria-label="Next month"
            >
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>
        </div>
      </div>

      <div className="overflow-x-auto">
        <div className="min-w-[680px] space-y-1.5">
          <div className="grid grid-cols-8 gap-1.5 text-[11px] font-semibold text-slate-500">
            {DAY_HEADERS.map((d) => (
              <div key={d} className="px-2 py-1 text-center">
                {d}
              </div>
            ))}
            <div className="px-2 py-1 text-center text-[#B45309]">Weekly Total</div>
          </div>

          {calendarWeeks.map((week) => (
            <div key={week.weekIdx} className="grid grid-cols-8 gap-1.5">
              {week.cells.map((cell, idx) => {
                if (!cell.day || !cell.dateKey) {
                  return <div key={idx} className="h-[74px] rounded-lg bg-slate-50/50 border border-slate-100" />;
                }
                const s = cell.summary;
                const isSelected = selectedDate === cell.dateKey;
                const tone = !s
                  ? 'bg-white border-slate-200/80 hover:border-slate-300'
                  : s.pnl > 0
                  ? 'bg-emerald-50 border-emerald-200 hover:border-emerald-400'
                  : s.pnl < 0
                  ? 'bg-rose-50 border-rose-200 hover:border-rose-400'
                  : 'bg-amber-50 border-amber-200 hover:border-amber-400';

                return (
                  <button
                    key={cell.dateKey}
                    type="button"
                    disabled={!s}
                    onClick={() => s && setSelectedDate(isSelected ? null : cell.dateKey)}
                    className={`h-[74px] rounded-lg border p-2 text-left flex flex-col justify-between transition-colors ${tone} ${
                      s ? 'cursor-pointer' : 'cursor-default'
                    } ${isSelected ? 'ring-2 ring-[#0B0F19]' : ''}`}
                  >
                    <div className="flex items-center justify-between text-[11px] font-mono tabular-nums">
                      <span className={s ? 'font-bold text-slate-900' : 'text-slate-400'}>{cell.day}</span>
                      {s && (
                        <span className="text-[10px] text-slate-500">
                          {s.trades.length}t
                        </span>
                      )}
                    </div>
                    {s ? (
                      <div>
                        <div
                          className={`text-xs font-bold font-mono tabular-nums truncate ${
                            s.pnl > 0 ? 'text-emerald-700' : s.pnl < 0 ? 'text-rose-600' : 'text-amber-800'
                          }`}
                        >
                          {s.pnl >= 0 ? '+' : ''}${Math.abs(s.pnl) >= 1000 ? `${(s.pnl / 1000).toFixed(1)}k` : s.pnl.toFixed(0)}
                        </div>
                        <div className="text-[10px] font-mono tabular-nums text-slate-500">
                          {Math.round(s.winRate)}% WR
                        </div>
                      </div>
                    ) : (
                      <div className="text-[10px] text-slate-300">—</div>
                    )}
                  </button>
                );
              })}

              {/* Weekly Summary Cell */}
              <div
                className={`h-[74px] rounded-lg border p-2 flex flex-col justify-between ${
                  week.weekTrades === 0
                    ? 'bg-slate-50 border-slate-200/70'
                    : week.weekPnl >= 0
                    ? 'bg-[#0B0F19] border-slate-900 text-white'
                    : 'bg-[#0B0F19] border-slate-900 text-white'
                }`}
              >
                <div className="text-[10px] font-mono text-slate-400">Week {week.weekIdx}</div>
                {week.weekTrades > 0 ? (
                  <div>
                    <div
                      className={`text-xs font-bold font-mono tabular-nums ${
                        week.weekPnl >= 0 ? 'text-emerald-400' : 'text-rose-400'
                      }`}
                    >
                      {week.weekPnl >= 0 ? '+' : ''}${week.weekPnl.toFixed(0)}
                    </div>
                    <div className="text-[10px] font-mono tabular-nums text-[#E5A93C]">
                      {week.tradingDays}d · {week.weekTrades}t
                    </div>
                  </div>
                ) : (
                  <div className="text-[11px] font-mono text-slate-400">$0</div>
                )}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Selected Day Drilldown */}
      {activeDaySummary && (
        <div className="pt-4 border-t border-slate-200 space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-2 text-xs">
              <span className="font-bold text-slate-950 font-mono">{activeDaySummary.date}</span>
              <span aria-hidden="true" className="text-slate-300">·</span>
              <span className={`font-bold font-mono tabular-nums ${activeDaySummary.pnl >= 0 ? 'text-emerald-700' : 'text-rose-600'}`}>
                {activeDaySummary.pnl >= 0 ? '+' : ''}${activeDaySummary.pnl.toFixed(2)}
              </span>
              <span aria-hidden="true" className="text-slate-300">·</span>
              <span className="text-slate-600">
                {activeDaySummary.wins}W / {activeDaySummary.losses}L ({Math.round(activeDaySummary.winRate)}% Win Rate)
              </span>
            </div>
            <button
              type="button"
              onClick={() => setSelectedDate(null)}
              className="p-1 text-slate-400 hover:text-slate-900 cursor-pointer"
              aria-label="Close day drilldown"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead>
                <tr className="border-b border-slate-200 text-slate-500">
                  <th className="py-2 pr-3">Instrument</th>
                  <th className="py-2 pr-3">Side</th>
                  <th className="py-2 pr-3">Playbook</th>
                  <th className="py-2 pr-3">Grade</th>
                  <th className="py-2 pr-3">Mistakes</th>
                  <th className="py-2 pr-3 text-right">R-Mult</th>
                  <th className="py-2 text-right">Net P&amp;L</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {activeDaySummary.trades.map((t) => {
                  const mistakes = getTradeMistakes(t);
                  const r = getTradeRMultiple(t);
                  return (
                    <tr
                      key={t.id}
                      onClick={() => onSelectTrade && onSelectTrade(t)}
                      className={onSelectTrade ? 'hover:bg-amber-50/50 cursor-pointer' : 'hover:bg-slate-50'}
                    >
                      <td className="py-2 pr-3 font-mono font-bold text-slate-950">{t.instrument}</td>
                      <td className={`py-2 pr-3 font-semibold ${t.side === 'Buy' ? 'text-emerald-700' : 'text-rose-600'}`}>
                        {t.side}
                      </td>
                      <td className="py-2 pr-3 text-slate-700">{getTradePlaybook(t)}</td>
                      <td className="py-2 pr-3 font-mono font-bold text-[#B45309]">{t.setup_grade || 'A'}</td>
                      <td className="py-2 pr-3 text-slate-600">
                        {mistakes.length ? mistakes.join(', ') : 'Clean'}
                      </td>
                      <td className="py-2 pr-3 text-right font-mono tabular-nums text-slate-700">
                        {r !== null ? `${r >= 0 ? '+' : ''}${r.toFixed(2)}R` : '—'}
                      </td>
                      <td
                        className={`py-2 text-right font-mono tabular-nums font-bold ${
                          Number(t.pnl) >= 0 ? 'text-emerald-700' : 'text-rose-600'
                        }`}
                      >
                        {Number(t.pnl) >= 0 ? '+' : ''}${Number(t.pnl).toFixed(2)}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
};
