import React, { useMemo, useState } from 'react';
import { Calculator, Layers, Percent, Scale, ShieldAlert, TrendingUp } from 'lucide-react';

type CalcTab = 'position' | 'drawdown' | 'expectancy' | 'compounding' | 'margin' | 'scalein';

interface InstrumentPreset {
  id: string;
  label: string;
  pipSize: number;
  pipValuePerLot: number;
  contractSize: number;
  defaultPrice: number;
}

const INSTRUMENT_PRESETS: InstrumentPreset[] = [
  { id: 'EURUSD', label: 'EURUSD / FX Major', pipSize: 0.0001, pipValuePerLot: 10, contractSize: 100000, defaultPrice: 1.085 },
  { id: 'USDJPY', label: 'USDJPY / JPY Pair', pipSize: 0.01, pipValuePerLot: 6.67, contractSize: 100000, defaultPrice: 150.0 },
  { id: 'XAUUSD', label: 'XAUUSD (Gold)', pipSize: 0.1, pipValuePerLot: 10, contractSize: 100, defaultPrice: 2650 },
  { id: 'NAS100', label: 'NAS100 / US30 Index', pipSize: 1, pipValuePerLot: 1, contractSize: 1, defaultPrice: 20500 },
  { id: 'BTCUSD', label: 'BTCUSD / Crypto', pipSize: 1, pipValuePerLot: 1, contractSize: 1, defaultPrice: 92000 },
  { id: 'CUSTOM', label: 'Custom Instrument', pipSize: 0.0001, pipValuePerLot: 10, contractSize: 100000, defaultPrice: 1.0 },
];

const DRAWDOWN_REFERENCE = [5, 10, 15, 20, 25, 30, 40, 50];

function fmtUsd(v: number): string {
  const abs = Math.abs(v).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  return v < 0 ? `-$${abs}` : `$${abs}`;
}

export const CalculatorsView: React.FC = () => {
  const [tab, setTab] = useState<CalcTab>('position');

  // Shared instrument preset
  const [presetId, setPresetId] = useState<string>('EURUSD');
  const [pipSize, setPipSize] = useState('0.0001');
  const [pipValuePerLot, setPipValuePerLot] = useState('10');
  const [contractSize, setContractSize] = useState('100000');

  // Tab 1: Position Size & Partial TP Split
  const [balance, setBalance] = useState('10000');
  const [riskPct, setRiskPct] = useState('1.0');
  const [slMode, setSlMode] = useState<'pips' | 'price'>('pips');
  const [slPips, setSlPips] = useState('20');
  const [tpPips, setTpPips] = useState('60');
  const [entryPx, setEntryPx] = useState('1.0850');
  const [slPx, setSlPx] = useState('1.0830');
  const [tpPx, setTpPx] = useState('1.0910');
  const [tp1R, setTp1R] = useState('1.5');
  const [tp1Alloc, setTp1Alloc] = useState('40');
  const [tp2R, setTp2R] = useState('2.5');
  const [tp2Alloc, setTp2Alloc] = useState('40');
  const [tp3R, setTp3R] = useState('4.0');
  const [tp3Alloc, setTp3Alloc] = useState('20');

  // Tab 2: Drawdown & Prop Stress Tester
  const [ddBalance, setDdBalance] = useState('50000');
  const [ddCurrentPct, setDdCurrentPct] = useState('6');
  const [ddRiskPerTrade, setDdRiskPerTrade] = useState('1.0');
  const [propDailyLimit, setPropDailyLimit] = useState('5');
  const [propMaxLimit, setPropMaxLimit] = useState('10');

  // Tab 3: Expectancy, Kelly & Risk of Ruin
  const [expWinRate, setExpWinRate] = useState('48');
  const [expAvgRr, setExpAvgRr] = useState('2.4');
  const [expRiskPct, setExpRiskPct] = useState('1.0');
  const [expBalance, setExpBalance] = useState('10000');
  const [expTradesPerMonth, setExpTradesPerMonth] = useState('25');

  // Tab 4: Compounding & Prop Payouts
  const [compStart, setCompStart] = useState('25000');
  const [compMonthlyPct, setCompMonthlyPct] = useState('6');
  const [compMonths, setCompMonths] = useState('12');
  const [compWithdrawPct, setCompWithdrawPct] = useState('25');
  const [compProfitSplit, setCompProfitSplit] = useState('80');

  // Tab 5: Pip Value & Margin
  const [marginLots, setMarginLots] = useState('1.00');
  const [marginPrice, setMarginPrice] = useState('1.0850');
  const [leverage, setLeverage] = useState('100');
  const [marginEquity, setMarginEquity] = useState('10000');

  // Tab 6: Multi-Leg Scale-In & Net P&L
  const [scaleSide, setScaleSide] = useState<'Buy' | 'Sell'>('Buy');
  const [legs, setLegs] = useState([
    { price: '1.0850', lots: '0.50' },
    { price: '1.0840', lots: '0.50' },
    { price: '', lots: '' },
  ]);
  const [scaleExit, setScaleExit] = useState('1.0900');
  const [scaleCommissionPerLot, setScaleCommissionPerLot] = useState('7');

  function applyPreset(id: string) {
    setPresetId(id);
    const p = INSTRUMENT_PRESETS.find((x) => x.id === id);
    if (!p) return;
    setPipSize(String(p.pipSize));
    setPipValuePerLot(String(p.pipValuePerLot));
    setContractSize(String(p.contractSize));
    setMarginPrice(String(p.defaultPrice));
    setEntryPx(String(p.defaultPrice));
    setSlPx(String(Number((p.defaultPrice - p.pipSize * 20).toFixed(5))));
    setTpPx(String(Number((p.defaultPrice + p.pipSize * 60).toFixed(5))));
  }

  // Computed Tab 1: Position Size & Partial TP
  const posCalc = useMemo(() => {
    const bal = Math.max(0, Number(balance) || 0);
    const rPct = Math.max(0, Number(riskPct) || 0);
    const riskUsd = (bal * rPct) / 100;
    const pSize = Math.max(1e-7, Number(pipSize) || 0.0001);
    const pVal = Math.max(0.01, Number(pipValuePerLot) || 10);
    const cSize = Math.max(1, Number(contractSize) || 100000);

    let effectiveSlPips = Math.max(0.1, Number(slPips) || 20);
    let effectiveTpPips = Math.max(0.1, Number(tpPips) || 60);

    if (slMode === 'price') {
      const e = Number(entryPx) || 0;
      const s = Number(slPx) || 0;
      const t = Number(tpPx) || 0;
      effectiveSlPips = Math.max(0.1, Math.abs(e - s) / pSize);
      effectiveTpPips = Math.max(0.1, Math.abs(t - e) / pSize);
    }

    const lots = riskUsd > 0 ? riskUsd / (effectiveSlPips * pVal) : 0;
    const units = lots * cSize;
    const rr = effectiveSlPips > 0 ? effectiveTpPips / effectiveSlPips : 0;
    const rewardUsd = riskUsd * rr;
    const breakEvenWr = rr > 0 ? (1 / (1 + rr)) * 100 : 0;

    // 3-Target Split Planner
    const a1 = Math.max(0, Number(tp1Alloc) || 0);
    const a2 = Math.max(0, Number(tp2Alloc) || 0);
    const a3 = Math.max(0, Number(tp3Alloc) || 0);
    const totalAlloc = a1 + a2 + a3 || 100;
    const blendedR =
      ((a1 / totalAlloc) * (Number(tp1R) || 0) +
        (a2 / totalAlloc) * (Number(tp2R) || 0) +
        (a3 / totalAlloc) * (Number(tp3R) || 0));
    const blendedProfitUsd = riskUsd * blendedR;

    const riskHealth =
      rPct <= 1 ? 'Institutional (Conservative)' : rPct <= 2 ? 'Standard Controlled' : 'Elevated Risk — Trim Size';

    return {
      riskUsd,
      rewardUsd,
      lots,
      miniLots: lots * 10,
      microLots: lots * 100,
      units,
      rr,
      effectiveSlPips,
      effectiveTpPips,
      breakEvenWr,
      blendedR,
      blendedProfitUsd,
      totalAlloc,
      riskHealth,
    };
  }, [
    balance,
    riskPct,
    pipSize,
    pipValuePerLot,
    contractSize,
    slMode,
    slPips,
    tpPips,
    entryPx,
    slPx,
    tpPx,
    tp1R,
    tp1Alloc,
    tp2R,
    tp2Alloc,
    tp3R,
    tp3Alloc,
  ]);

  // Computed Tab 2: Drawdown & Prop Stress
  const ddCalc = useMemo(() => {
    const startBal = Math.max(1, Number(ddBalance) || 50000);
    const ddPct = Math.min(95, Math.max(0, Number(ddCurrentPct) || 0));
    const remBal = startBal * (1 - ddPct / 100);
    const recoveryGainPct = ddPct > 0 ? (ddPct / (100 - ddPct)) * 100 : 0;
    const rPerTrade = Math.max(0.1, Number(ddRiskPerTrade) || 1);
    const dLim = Math.max(0.5, Number(propDailyLimit) || 5);
    const mLim = Math.max(1, Number(propMaxLimit) || 10);

    // Compounding loss streak needed to breach limits
    const lossesToDaily = Math.floor(Math.log(1 - dLim / 100) / Math.log(1 - rPerTrade / 100));
    const lossesToMax = Math.floor(Math.log(1 - mLim / 100) / Math.log(1 - rPerTrade / 100));
    const streakTable = [1, 2, 3, 5, 7, 10].map((n) => {
      const endBal = startBal * Math.pow(1 - rPerTrade / 100, n);
      const lossPct = ((startBal - endBal) / startBal) * 100;
      return { n, endBal, lossPct, breachedDaily: lossPct >= dLim, breachedMax: lossPct >= mLim };
    });

    return { startBal, remBal, recoveryGainPct, lossesToDaily, lossesToMax, streakTable };
  }, [ddBalance, ddCurrentPct, ddRiskPerTrade, propDailyLimit, propMaxLimit]);

  // Computed Tab 3: Expectancy, Kelly & Risk of Ruin
  const expCalc = useMemo(() => {
    const wr = Math.min(99, Math.max(1, Number(expWinRate) || 50)) / 100;
    const lr = 1 - wr;
    const rr = Math.max(0.1, Number(expAvgRr) || 2);
    const bal = Math.max(1, Number(expBalance) || 10000);
    const rPct = Math.max(0.1, Number(expRiskPct) || 1);
    const riskUsd = (bal * rPct) / 100;
    const tradesMo = Math.max(1, Number(expTradesPerMonth) || 20);

    const expectancyR = wr * rr - lr;
    const expectancyUsd = expectancyR * riskUsd;
    const breakEvenWr = (1 / (1 + rr)) * 100;
    const fullKellyPct = Math.max(0, (wr - lr / rr) * 100);
    const quarterKellyPct = fullKellyPct / 4;

    // Practical Risk of Ruin approximation over 20R drawdown cap
    let rorPct = 0;
    if (expectancyR <= 0) {
      rorPct = 100;
    } else {
      const edge = wr - lr / rr;
      const unitsToRuin = Math.max(1, Math.round(20 / Math.max(0.25, rPct)));
      const ratio = Math.max(0, (1 - edge) / (1 + edge));
      rorPct = Math.min(100, Math.pow(ratio, unitsToRuin) * 100);
    }

    return {
      expectancyR,
      expectancyUsd,
      breakEvenWr,
      fullKellyPct,
      quarterKellyPct,
      rorPct,
      proj20Usd: expectancyUsd * 20,
      proj100Usd: expectancyUsd * 100,
      monthlyUsd: expectancyUsd * tradesMo,
    };
  }, [expWinRate, expAvgRr, expRiskPct, expBalance, expTradesPerMonth]);

  // Computed Tab 4: Compounding & Prop Schedule
  const compCalc = useMemo(() => {
    let cur = Math.max(1, Number(compStart) || 25000);
    const rate = (Number(compMonthlyPct) || 0) / 100;
    const months = Math.min(36, Math.max(1, Math.round(Number(compMonths) || 12)));
    const wRate = Math.min(100, Math.max(0, Number(compWithdrawPct) || 0)) / 100;
    const split = Math.min(100, Math.max(10, Number(compProfitSplit) || 80)) / 100;

    const rows: Array<{ month: number; start: number; grossProfit: number; payout: number; end: number }> = [];
    let totalPayouts = 0;
    for (let m = 1; m <= months; m++) {
      const start = cur;
      const grossProfit = start * rate;
      const withdrawn = grossProfit > 0 ? grossProfit * wRate : 0;
      const traderPayout = withdrawn * split;
      totalPayouts += traderPayout;
      const retained = grossProfit - withdrawn;
      cur = start + retained;
      rows.push({ month: m, start, grossProfit, payout: traderPayout, end: cur });
    }
    const maxEnd = Math.max(1, ...rows.map((r) => r.end));
    return { rows, finalBalance: cur, totalPayouts, totalWealth: cur + totalPayouts, maxEnd };
  }, [compStart, compMonthlyPct, compMonths, compWithdrawPct, compProfitSplit]);

  // Computed Tab 5: Margin & Pip Value
  const marginCalc = useMemo(() => {
    const lots = Math.max(0.01, Number(marginLots) || 1);
    const px = Math.max(0.0001, Number(marginPrice) || 1.085);
    const lev = Math.max(1, Number(leverage) || 100);
    const eq = Math.max(1, Number(marginEquity) || 10000);
    const cSize = Math.max(1, Number(contractSize) || 100000);
    const pVal = Math.max(0.01, Number(pipValuePerLot) || 10);

    const notional = lots * cSize * px;
    const reqMargin = notional / lev;
    const freeMargin = eq - reqMargin;
    const marginLevel = reqMargin > 0 ? (eq / reqMargin) * 100 : 0;
    const pipDollar = lots * pVal;
    return { notional, reqMargin, freeMargin, marginLevel, pipDollar };
  }, [marginLots, marginPrice, leverage, marginEquity, contractSize, pipValuePerLot]);

  // Computed Tab 6: Scale-In & Net P&L
  const scaleCalc = useMemo(() => {
    const valid = legs
      .map((l) => ({ price: Number(l.price), lots: Number(l.lots) }))
      .filter((l) => Number.isFinite(l.price) && l.price > 0 && Number.isFinite(l.lots) && l.lots > 0);
    const totalLots = valid.reduce((s, l) => s + l.lots, 0);
    const avgEntry = totalLots > 0 ? valid.reduce((s, l) => s + l.price * l.lots, 0) / totalLots : 0;
    const exit = Number(scaleExit) || 0;
    const pSize = Math.max(1e-7, Number(pipSize) || 0.0001);
    const pVal = Math.max(0.01, Number(pipValuePerLot) || 10);
    const pips =
      avgEntry > 0 && exit > 0
        ? (scaleSide === 'Buy' ? exit - avgEntry : avgEntry - exit) / pSize
        : 0;
    const grossPnl = pips * totalLots * pVal;
    const fees = totalLots * (Number(scaleCommissionPerLot) || 0);
    const netPnl = grossPnl - fees;
    return { totalLots, avgEntry, pips, grossPnl, fees, netPnl };
  }, [legs, scaleExit, scaleSide, pipSize, pipValuePerLot, scaleCommissionPerLot]);

  // Output panel summary derived from active tab
  const summaryPanel = useMemo(() => {
    if (tab === 'position') {
      return {
        eyebrow: 'Position Sizing Engine',
        headline: `${posCalc.lots.toFixed(2)} Lots`,
        subline: `${Math.round(posCalc.units).toLocaleString()} units · ${posCalc.riskHealth}`,
        metrics: [
          ['Dollar Risk', `-${fmtUsd(posCalc.riskUsd)}`, 'text-rose-400'],
          ['Full Target Reward', `+${fmtUsd(posCalc.rewardUsd)}`, 'text-emerald-400'],
          ['Reward : Risk', `1 : ${posCalc.rr.toFixed(2)}`, 'text-[#E5A93C]'],
          ['Break-Even Win %', `${posCalc.breakEvenWr.toFixed(1)}%`, 'text-white'],
          ['3-TP Blended R:R', `1 : ${posCalc.blendedR.toFixed(2)}`, 'text-[#E5A93C]'],
          ['3-TP Projected P&L', `+${fmtUsd(posCalc.blendedProfitUsd)}`, 'text-emerald-400'],
        ],
        slRatio: posCalc.rr > 0 ? (1 / (1 + posCalc.rr)) * 100 : 33,
      };
    }
    if (tab === 'drawdown') {
      return {
        eyebrow: 'Drawdown & Prop Survival',
        headline: `+${ddCalc.recoveryGainPct.toFixed(1)}%`,
        subline: `Gain required to recover a ${ddCurrentPct}% drawdown`,
        metrics: [
          ['Remaining Equity', fmtUsd(ddCalc.remBal), 'text-white'],
          ['Losses to Daily Limit', `${ddCalc.lossesToDaily} trades`, 'text-[#E5A93C]'],
          ['Losses to Max DD', `${ddCalc.lossesToMax} trades`, 'text-rose-400'],
          ['Risk / Trade', `${ddRiskPerTrade}%`, 'text-slate-200'],
        ],
        slRatio: Math.min(90, Math.max(10, Number(ddCurrentPct) || 10)),
      };
    }
    if (tab === 'expectancy') {
      return {
        eyebrow: 'Edge & Expectancy Engine',
        headline: `${expCalc.expectancyR >= 0 ? '+' : ''}${expCalc.expectancyR.toFixed(2)}R`,
        subline: `${fmtUsd(expCalc.expectancyUsd)} mathematical edge per trade`,
        metrics: [
          ['Break-Even Win %', `${expCalc.breakEvenWr.toFixed(1)}%`, 'text-white'],
          ['Full Kelly Sizing', `${expCalc.fullKellyPct.toFixed(1)}%`, 'text-slate-200'],
          ['Safe Quarter-Kelly', `${expCalc.quarterKellyPct.toFixed(2)}%`, 'text-[#E5A93C]'],
          ['Risk of Ruin (20R)', `${expCalc.rorPct.toFixed(1)}%`, expCalc.rorPct > 10 ? 'text-rose-400' : 'text-emerald-400'],
          ['20-Trade Projection', fmtUsd(expCalc.proj20Usd), expCalc.proj20Usd >= 0 ? 'text-emerald-400' : 'text-rose-400'],
          ['Monthly Projection', fmtUsd(expCalc.monthlyUsd), expCalc.monthlyUsd >= 0 ? 'text-emerald-400' : 'text-rose-400'],
        ],
        slRatio: Math.min(90, Math.max(10, expCalc.breakEvenWr)),
      };
    }
    if (tab === 'compounding') {
      return {
        eyebrow: 'Compounding & Prop Payouts',
        headline: fmtUsd(compCalc.finalBalance),
        subline: `Ending equity after ${compMonths} months (+${fmtUsd(compCalc.totalPayouts)} paid out)`,
        metrics: [
          ['Starting Capital', fmtUsd(Number(compStart) || 0), 'text-slate-200'],
          ['Cumulative Payouts', fmtUsd(compCalc.totalPayouts), 'text-[#E5A93C]'],
          ['Total Value Created', fmtUsd(compCalc.totalWealth), 'text-emerald-400'],
          ['Profit Split Applied', `${compProfitSplit}%`, 'text-white'],
        ],
        slRatio: 25,
      };
    }
    if (tab === 'margin') {
      return {
        eyebrow: 'Margin & Pip Valuation',
        headline: fmtUsd(marginCalc.reqMargin),
        subline: `Required margin at 1:${leverage} leverage`,
        metrics: [
          ['Pip / Point Value', `${fmtUsd(marginCalc.pipDollar)} / pip`, 'text-[#E5A93C]'],
          ['Notional Exposure', fmtUsd(marginCalc.notional), 'text-white'],
          ['Free Margin', fmtUsd(marginCalc.freeMargin), marginCalc.freeMargin >= 0 ? 'text-emerald-400' : 'text-rose-400'],
          ['Margin Level', `${marginCalc.marginLevel.toFixed(0)}%`, 'text-slate-200'],
        ],
        slRatio: Math.min(95, Math.max(5, (marginCalc.reqMargin / Math.max(1, Number(marginEquity) || 1)) * 100)),
      };
    }
    return {
      eyebrow: 'Multi-Leg Scale-In',
      headline: fmtUsd(scaleCalc.netPnl),
      subline: `Avg Entry ${scaleCalc.avgEntry ? scaleCalc.avgEntry.toFixed(4) : '—'} across ${scaleCalc.totalLots.toFixed(2)} lots`,
      metrics: [
        ['Blended Avg Price', scaleCalc.avgEntry ? scaleCalc.avgEntry.toFixed(5) : '—', 'text-[#E5A93C]'],
        ['Net Pips / Points', `${scaleCalc.pips >= 0 ? '+' : ''}${scaleCalc.pips.toFixed(1)}`, scaleCalc.pips >= 0 ? 'text-emerald-400' : 'text-rose-400'],
        ['Gross P&L', fmtUsd(scaleCalc.grossPnl), 'text-white'],
        ['Broker Commissions', `-${fmtUsd(scaleCalc.fees)}`, 'text-rose-400'],
      ],
      slRatio: 30,
    };
  }, [tab, posCalc, ddCalc, ddCurrentPct, ddRiskPerTrade, expCalc, compCalc, compMonths, compStart, compProfitSplit, marginCalc, leverage, marginEquity, scaleCalc]);

  return (
    <div className="space-y-5">
      {/* Header + Instrument Preset Selector */}
      <div className="rounded-2xl bg-white border border-slate-200 shadow-xs p-4 space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-lg font-bold tracking-tight text-slate-950">Institutional Risk & Quantitative Calculators</h2>
            <p className="text-xs text-slate-500 mt-0.5">
              Precision lot sizing, 3-target partial splits, prop drawdown stress tests, expectancy, compounding, and scale-ins.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-1.5">
            {INSTRUMENT_PRESETS.map((p) => (
              <button
                key={p.id}
                type="button"
                onClick={() => applyPreset(p.id)}
                className={`px-2.5 py-1.5 text-[11px] font-mono font-semibold rounded-lg border transition-colors cursor-pointer ${
                  presetId === p.id
                    ? 'bg-[#0B0F19] border-[#0B0F19] text-[#E5A93C]'
                    : 'bg-[#FAF9F6] border-slate-200 text-slate-700 hover:border-amber-400'
                }`}
              >
                {p.id}
              </button>
            ))}
          </div>
        </div>

        {/* 6 Institutional Calculator Tabs */}
        <div className="flex flex-wrap items-center gap-1.5 pt-2 border-t border-slate-100">
          {(
            [
              ['position', 'Position Size & Risk', Calculator],
              ['drawdown', 'Drawdown & Recovery', ShieldAlert],
              ['expectancy', 'Expectancy & Ruin', Percent],
              ['compounding', 'Compounding & Prop', TrendingUp],
              ['margin', 'Pip Value & Margin', Scale],
              ['scalein', 'P&L & Scale-In', Layers],
            ] as const
          ).map(([id, label, Icon]) => (
            <button
              key={id}
              type="button"
              onClick={() => setTab(id)}
              className={`inline-flex items-center gap-1.5 px-3 py-2 text-xs font-semibold rounded-lg transition-colors cursor-pointer ${
                tab === id
                  ? 'bg-[#0B0F19] text-[#E5A93C]'
                  : 'bg-white border border-slate-200 text-slate-600 hover:text-slate-950 hover:border-amber-300'
              }`}
            >
              <Icon className="w-3.5 h-3.5" />
              {label}
            </button>
          ))}
        </div>
      </div>

      {/* Main Split: Calculator Inputs (Left 8 cols) + Obsidian Output Panel (Right 4 cols) */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 items-start">
        <div className="lg:col-span-8 rounded-2xl bg-white border border-slate-200 shadow-xs p-5 space-y-5">
          {tab === 'position' && (
            <>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div>
                  <label className="block text-[11px] font-semibold text-slate-600 mb-1">Account Balance ($)</label>
                  <input
                    type="number"
                    value={balance}
                    onChange={(e) => setBalance(e.target.value)}
                    className="w-full px-3 py-2 text-xs font-mono font-bold rounded-lg border border-slate-300"
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-semibold text-slate-600 mb-1">Risk Per Trade (%)</label>
                  <input
                    type="number"
                    step="0.1"
                    value={riskPct}
                    onChange={(e) => setRiskPct(e.target.value)}
                    className="w-full px-3 py-2 text-xs font-mono font-bold rounded-lg border border-slate-300"
                  />
                  <div className="flex flex-wrap gap-1 mt-1.5">
                    {['0.25', '0.5', '1.0', '1.5', '2.0'].map((v) => (
                      <button
                        key={v}
                        type="button"
                        onClick={() => setRiskPct(v)}
                        className={`px-2 py-0.5 text-[10px] font-mono font-semibold rounded border cursor-pointer ${
                          riskPct === v
                            ? 'bg-amber-50 border-amber-400 text-[#B45309]'
                            : 'border-slate-200 text-slate-600 hover:border-slate-300'
                        }`}
                      >
                        {v}%
                      </button>
                    ))}
                  </div>
                </div>
                <div>
                  <label className="block text-[11px] font-semibold text-slate-600 mb-1">Pip Value / Std Lot ($)</label>
                  <input
                    type="number"
                    step="0.01"
                    value={pipValuePerLot}
                    onChange={(e) => setPipValuePerLot(e.target.value)}
                    className="w-full px-3 py-2 text-xs font-mono rounded-lg border border-slate-300"
                  />
                </div>
              </div>

              <div className="space-y-3 pt-3 border-t border-slate-100">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-slate-900">Stop Loss & Target Input Mode</span>
                  <div className="inline-flex rounded-lg border border-slate-200 bg-[#FAF9F6] p-0.5 text-xs font-semibold">
                    <button
                      type="button"
                      onClick={() => setSlMode('pips')}
                      className={`px-3 py-1 rounded-md cursor-pointer ${
                        slMode === 'pips' ? 'bg-[#0B0F19] text-[#E5A93C]' : 'text-slate-600'
                      }`}
                    >
                      Pips / Points
                    </button>
                    <button
                      type="button"
                      onClick={() => setSlMode('price')}
                      className={`px-3 py-1 rounded-md cursor-pointer ${
                        slMode === 'price' ? 'bg-[#0B0F19] text-[#E5A93C]' : 'text-slate-600'
                      }`}
                    >
                      Exact Prices
                    </button>
                  </div>
                </div>

                {slMode === 'pips' ? (
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="block text-[11px] font-semibold text-slate-600 mb-1">Stop Loss Distance (Pips/Pts)</label>
                      <input
                        type="number"
                        step="0.1"
                        value={slPips}
                        onChange={(e) => setSlPips(e.target.value)}
                        className="w-full px-3 py-2 text-xs font-mono rounded-lg border border-slate-300"
                      />
                    </div>
                    <div>
                      <label className="block text-[11px] font-semibold text-slate-600 mb-1">Take Profit Distance (Pips/Pts)</label>
                      <input
                        type="number"
                        step="0.1"
                        value={tpPips}
                        onChange={(e) => setTpPips(e.target.value)}
                        className="w-full px-3 py-2 text-xs font-mono rounded-lg border border-slate-300"
                      />
                    </div>
                  </div>
                ) : (
                  <div className="grid grid-cols-1 sm:grid-cols-4 gap-3">
                    <div>
                      <label className="block text-[11px] font-semibold text-slate-600 mb-1">Entry Price</label>
                      <input
                        type="number"
                        step="any"
                        value={entryPx}
                        onChange={(e) => setEntryPx(e.target.value)}
                        className="w-full px-2.5 py-2 text-xs font-mono rounded-lg border border-slate-300"
                      />
                    </div>
                    <div>
                      <label className="block text-[11px] font-semibold text-slate-600 mb-1">Stop Loss Price</label>
                      <input
                        type="number"
                        step="any"
                        value={slPx}
                        onChange={(e) => setSlPx(e.target.value)}
                        className="w-full px-2.5 py-2 text-xs font-mono rounded-lg border border-slate-300"
                      />
                    </div>
                    <div>
                      <label className="block text-[11px] font-semibold text-slate-600 mb-1">Take Profit Price</label>
                      <input
                        type="number"
                        step="any"
                        value={tpPx}
                        onChange={(e) => setTpPx(e.target.value)}
                        className="w-full px-2.5 py-2 text-xs font-mono rounded-lg border border-slate-300"
                      />
                    </div>
                    <div>
                      <label className="block text-[11px] font-semibold text-slate-600 mb-1">Pip Size</label>
                      <input
                        type="number"
                        step="any"
                        value={pipSize}
                        onChange={(e) => setPipSize(e.target.value)}
                        className="w-full px-2.5 py-2 text-xs font-mono rounded-lg border border-slate-300"
                      />
                    </div>
                  </div>
                )}
              </div>

              {/* Lot Breakdown Strip */}
              <div className="grid grid-cols-3 gap-3 p-3.5 rounded-xl bg-[#FAF9F6] border border-slate-200 text-center">
                <div>
                  <div className="text-[10px] uppercase text-slate-500 font-semibold">Standard Lots</div>
                  <div className="text-sm font-bold font-mono text-slate-950 mt-0.5">{posCalc.lots.toFixed(2)}</div>
                </div>
                <div>
                  <div className="text-[10px] uppercase text-slate-500 font-semibold">Mini Lots (0.10)</div>
                  <div className="text-sm font-bold font-mono text-slate-950 mt-0.5">{posCalc.miniLots.toFixed(2)}</div>
                </div>
                <div>
                  <div className="text-[10px] uppercase text-slate-500 font-semibold">Micro Lots (0.01)</div>
                  <div className="text-sm font-bold font-mono text-slate-950 mt-0.5">{posCalc.microLots.toFixed(1)}</div>
                </div>
              </div>

              {/* 3-Target Partial TP Split Planner */}
              <div className="pt-3 border-t border-slate-100 space-y-3">
                <div className="flex items-center justify-between">
                  <div>
                    <h3 className="text-xs font-bold text-slate-950">3-Target Partial Take-Profit Split Planner</h3>
                    <p className="text-[11px] text-slate-500">
                      Plan ICT/DRT partial scale-outs (e.g., 40% @ 1.5R, 40% @ 2.5R, 20% runner @ 4.0R).
                    </p>
                  </div>
                  <span className="text-xs font-mono font-bold text-[#B45309]">
                    Allocation: {posCalc.totalAlloc}%
                  </span>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  {[
                    { label: 'TP1', r: tp1R, setR: setTp1R, alloc: tp1Alloc, setAlloc: setTp1Alloc },
                    { label: 'TP2', r: tp2R, setR: setTp2R, alloc: tp2Alloc, setAlloc: setTp2Alloc },
                    { label: 'TP3 (Runner)', r: tp3R, setR: setTp3R, alloc: tp3Alloc, setAlloc: setTp3Alloc },
                  ].map((tp) => {
                    const partLots = posCalc.lots * ((Number(tp.alloc) || 0) / (posCalc.totalAlloc || 100));
                    const partUsd = posCalc.riskUsd * ((Number(tp.alloc) || 0) / (posCalc.totalAlloc || 100)) * (Number(tp.r) || 0);
                    return (
                      <div key={tp.label} className="p-3 rounded-xl bg-[#FAF9F6] border border-slate-200 space-y-2">
                        <div className="flex items-center justify-between text-xs font-bold text-slate-900">
                          <span>{tp.label}</span>
                          <span className="font-mono text-emerald-700">+{fmtUsd(partUsd)}</span>
                        </div>
                        <div className="grid grid-cols-2 gap-2">
                          <div>
                            <label className="block text-[10px] text-slate-500">Target (R)</label>
                            <input
                              type="number"
                              step="0.1"
                              value={tp.r}
                              onChange={(e) => tp.setR(e.target.value)}
                              className="w-full px-2 py-1 text-xs font-mono rounded border border-slate-300 bg-white"
                            />
                          </div>
                          <div>
                            <label className="block text-[10px] text-slate-500">Close %</label>
                            <input
                              type="number"
                              step="5"
                              value={tp.alloc}
                              onChange={(e) => tp.setAlloc(e.target.value)}
                              className="w-full px-2 py-1 text-xs font-mono rounded border border-slate-300 bg-white"
                            />
                          </div>
                        </div>
                        <div className="text-[10px] font-mono text-slate-500">Close {partLots.toFixed(2)} lots</div>
                      </div>
                    );
                  })}
                </div>
              </div>
            </>
          )}

          {tab === 'drawdown' && (
            <div className="space-y-5">
              <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
                <div>
                  <label className="block text-[11px] font-semibold text-slate-600 mb-1">Account ($)</label>
                  <input
                    type="number"
                    value={ddBalance}
                    onChange={(e) => setDdBalance(e.target.value)}
                    className="w-full px-2.5 py-2 text-xs font-mono rounded-lg border border-slate-300"
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-semibold text-slate-600 mb-1">Current DD (%)</label>
                  <input
                    type="number"
                    step="0.5"
                    value={ddCurrentPct}
                    onChange={(e) => setDdCurrentPct(e.target.value)}
                    className="w-full px-2.5 py-2 text-xs font-mono rounded-lg border border-slate-300"
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-semibold text-slate-600 mb-1">Risk / Trade (%)</label>
                  <input
                    type="number"
                    step="0.25"
                    value={ddRiskPerTrade}
                    onChange={(e) => setDdRiskPerTrade(e.target.value)}
                    className="w-full px-2.5 py-2 text-xs font-mono rounded-lg border border-slate-300"
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-semibold text-slate-600 mb-1">Prop Daily Lim (%)</label>
                  <input
                    type="number"
                    value={propDailyLimit}
                    onChange={(e) => setPropDailyLimit(e.target.value)}
                    className="w-full px-2.5 py-2 text-xs font-mono rounded-lg border border-slate-300"
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-semibold text-slate-600 mb-1">Prop Max DD (%)</label>
                  <input
                    type="number"
                    value={propMaxLimit}
                    onChange={(e) => setPropMaxLimit(e.target.value)}
                    className="w-full px-2.5 py-2 text-xs font-mono rounded-lg border border-slate-300"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="rounded-xl border border-slate-200 overflow-hidden">
                  <div className="px-4 py-2.5 bg-[#FAF9F6] border-b border-slate-200 text-xs font-bold text-slate-900">
                    Consecutive Loss Stress Test ({ddRiskPerTrade}% Risk)
                  </div>
                  <table className="w-full text-xs text-left">
                    <thead>
                      <tr className="border-b border-slate-100 text-[10px] uppercase text-slate-500">
                        <th className="py-2 px-3">Loss Streak</th>
                        <th className="py-2 px-3 text-right">Remaining</th>
                        <th className="py-2 px-3 text-right">Drawdown</th>
                        <th className="py-2 px-3 text-right">Prop Status</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 font-mono tabular-nums">
                      {ddCalc.streakTable.map((row) => (
                        <tr key={row.n}>
                          <td className="py-2 px-3 font-semibold text-slate-900">{row.n} losses</td>
                          <td className="py-2 px-3 text-right text-slate-700">{fmtUsd(row.endBal)}</td>
                          <td className="py-2 px-3 text-right text-rose-600">-{row.lossPct.toFixed(2)}%</td>
                          <td className="py-2 px-3 text-right font-sans font-semibold">
                            {row.breachedMax ? (
                              <span className="text-rose-600">Breached Max</span>
                            ) : row.breachedDaily ? (
                              <span className="text-[#B45309]">Daily Hit</span>
                            ) : (
                              <span className="text-emerald-700">Safe</span>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                <div className="rounded-xl border border-slate-200 overflow-hidden">
                  <div className="px-4 py-2.5 bg-[#FAF9F6] border-b border-slate-200 text-xs font-bold text-slate-900">
                    Drawdown Asymmetry Reference
                  </div>
                  <table className="w-full text-xs text-left">
                    <thead>
                      <tr className="border-b border-slate-100 text-[10px] uppercase text-slate-500">
                        <th className="py-2 px-3">Drawdown</th>
                        <th className="py-2 px-3 text-right">Gain to Recover</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 font-mono tabular-nums">
                      {DRAWDOWN_REFERENCE.map((d) => {
                        const rec = (d / (100 - d)) * 100;
                        return (
                          <tr key={d}>
                            <td className="py-1.5 px-3 text-rose-600 font-semibold">-{d}%</td>
                            <td className="py-1.5 px-3 text-right text-slate-900 font-bold">+{rec.toFixed(1)}%</td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}

          {tab === 'expectancy' && (
            <div className="space-y-4">
              <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
                <div>
                  <label className="block text-[11px] font-semibold text-slate-600 mb-1">Win Rate (%)</label>
                  <input
                    type="number"
                    value={expWinRate}
                    onChange={(e) => setExpWinRate(e.target.value)}
                    className="w-full px-2.5 py-2 text-xs font-mono rounded-lg border border-slate-300"
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-semibold text-slate-600 mb-1">Avg R:R (e.g. 2.5)</label>
                  <input
                    type="number"
                    step="0.1"
                    value={expAvgRr}
                    onChange={(e) => setExpAvgRr(e.target.value)}
                    className="w-full px-2.5 py-2 text-xs font-mono rounded-lg border border-slate-300"
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-semibold text-slate-600 mb-1">Risk / Trade (%)</label>
                  <input
                    type="number"
                    step="0.25"
                    value={expRiskPct}
                    onChange={(e) => setExpRiskPct(e.target.value)}
                    className="w-full px-2.5 py-2 text-xs font-mono rounded-lg border border-slate-300"
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-semibold text-slate-600 mb-1">Account ($)</label>
                  <input
                    type="number"
                    value={expBalance}
                    onChange={(e) => setExpBalance(e.target.value)}
                    className="w-full px-2.5 py-2 text-xs font-mono rounded-lg border border-slate-300"
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-semibold text-slate-600 mb-1">Trades / Month</label>
                  <input
                    type="number"
                    value={expTradesPerMonth}
                    onChange={(e) => setExpTradesPerMonth(e.target.value)}
                    className="w-full px-2.5 py-2 text-xs font-mono rounded-lg border border-slate-300"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-2">
                <div className="p-4 rounded-xl bg-[#FAF9F6] border border-slate-200">
                  <div className="text-[11px] font-semibold text-slate-500">20-Trade Sample Projection</div>
                  <div
                    className={`text-lg font-bold font-mono tabular-nums mt-1 ${
                      expCalc.proj20Usd >= 0 ? 'text-emerald-700' : 'text-rose-600'
                    }`}
                  >
                    {fmtUsd(expCalc.proj20Usd)}
                  </div>
                </div>
                <div className="p-4 rounded-xl bg-[#FAF9F6] border border-slate-200">
                  <div className="text-[11px] font-semibold text-slate-500">100-Trade Sample Projection</div>
                  <div
                    className={`text-lg font-bold font-mono tabular-nums mt-1 ${
                      expCalc.proj100Usd >= 0 ? 'text-emerald-700' : 'text-rose-600'
                    }`}
                  >
                    {fmtUsd(expCalc.proj100Usd)}
                  </div>
                </div>
                <div className="p-4 rounded-xl bg-[#FAF9F6] border border-slate-200">
                  <div className="text-[11px] font-semibold text-slate-500">Recommended Quarter-Kelly</div>
                  <div className="text-lg font-bold font-mono tabular-nums text-[#B45309] mt-1">
                    {expCalc.quarterKellyPct.toFixed(2)}% / trade
                  </div>
                </div>
              </div>
            </div>
          )}

          {tab === 'compounding' && (
            <div className="space-y-4">
              <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
                <div>
                  <label className="block text-[11px] font-semibold text-slate-600 mb-1">Start Capital ($)</label>
                  <input
                    type="number"
                    value={compStart}
                    onChange={(e) => setCompStart(e.target.value)}
                    className="w-full px-2.5 py-2 text-xs font-mono rounded-lg border border-slate-300"
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-semibold text-slate-600 mb-1">Monthly Gain (%)</label>
                  <input
                    type="number"
                    step="0.5"
                    value={compMonthlyPct}
                    onChange={(e) => setCompMonthlyPct(e.target.value)}
                    className="w-full px-2.5 py-2 text-xs font-mono rounded-lg border border-slate-300"
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-semibold text-slate-600 mb-1">Months (1–36)</label>
                  <input
                    type="number"
                    min="1"
                    max="36"
                    value={compMonths}
                    onChange={(e) => setCompMonths(e.target.value)}
                    className="w-full px-2.5 py-2 text-xs font-mono rounded-lg border border-slate-300"
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-semibold text-slate-600 mb-1">Withdraw Profit (%)</label>
                  <input
                    type="number"
                    value={compWithdrawPct}
                    onChange={(e) => setCompWithdrawPct(e.target.value)}
                    className="w-full px-2.5 py-2 text-xs font-mono rounded-lg border border-slate-300"
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-semibold text-slate-600 mb-1">Prop Split (%)</label>
                  <input
                    type="number"
                    value={compProfitSplit}
                    onChange={(e) => setCompProfitSplit(e.target.value)}
                    className="w-full px-2.5 py-2 text-xs font-mono rounded-lg border border-slate-300"
                  />
                </div>
              </div>

              {/* Equity Growth Bar Chart */}
              <div className="p-4 rounded-xl bg-[#FAF9F6] border border-slate-200">
                <div className="text-[11px] font-semibold text-slate-600 mb-2">Projected Account Growth Curve</div>
                <div className="flex items-end gap-1.5 h-28">
                  {compCalc.rows.map((r) => (
                    <div key={r.month} className="flex-1 flex flex-col items-center gap-1 h-full justify-end">
                      <div
                        className="w-full bg-[#0B0F19] hover:bg-[#B45309] rounded-t transition-colors"
                        style={{ height: `${Math.max(8, (r.end / compCalc.maxEnd) * 100)}%` }}
                        title={`Month ${r.month}: ${fmtUsd(r.end)}`}
                      />
                      <span className="text-[9px] font-mono text-slate-500">M{r.month}</span>
                    </div>
                  ))}
                </div>
              </div>

              <div className="max-h-60 overflow-y-auto rounded-xl border border-slate-200">
                <table className="w-full text-xs text-left">
                  <thead className="sticky top-0 bg-[#FAF9F6] border-b border-slate-200 text-[10px] uppercase text-slate-500">
                    <tr>
                      <th className="py-2 px-3">Month</th>
                      <th className="py-2 px-3 text-right">Start</th>
                      <th className="py-2 px-3 text-right">Gross Profit</th>
                      <th className="py-2 px-3 text-right">Trader Payout</th>
                      <th className="py-2 px-3 text-right">End Equity</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 font-mono tabular-nums">
                    {compCalc.rows.map((r) => (
                      <tr key={r.month}>
                        <td className="py-2 px-3 font-semibold text-slate-900">Month {r.month}</td>
                        <td className="py-2 px-3 text-right text-slate-600">{fmtUsd(r.start)}</td>
                        <td className="py-2 px-3 text-right text-emerald-700">+{fmtUsd(r.grossProfit)}</td>
                        <td className="py-2 px-3 text-right text-[#B45309]">{fmtUsd(r.payout)}</td>
                        <td className="py-2 px-3 text-right font-bold text-slate-950">{fmtUsd(r.end)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {tab === 'margin' && (
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
              <div>
                <label className="block text-[11px] font-semibold text-slate-600 mb-1">Position Size (Lots)</label>
                <input
                  type="number"
                  step="0.01"
                  value={marginLots}
                  onChange={(e) => setMarginLots(e.target.value)}
                  className="w-full px-3 py-2 text-xs font-mono rounded-lg border border-slate-300"
                />
              </div>
              <div>
                <label className="block text-[11px] font-semibold text-slate-600 mb-1">Instrument Price</label>
                <input
                  type="number"
                  step="any"
                  value={marginPrice}
                  onChange={(e) => setMarginPrice(e.target.value)}
                  className="w-full px-3 py-2 text-xs font-mono rounded-lg border border-slate-300"
                />
              </div>
              <div>
                <label className="block text-[11px] font-semibold text-slate-600 mb-1">Account Leverage</label>
                <select
                  value={leverage}
                  onChange={(e) => setLeverage(e.target.value)}
                  className="w-full px-3 py-2 text-xs font-mono rounded-lg border border-slate-300 bg-white"
                >
                  {['30', '50', '100', '200', '500', '1000'].map((lev) => (
                    <option key={lev} value={lev}>
                      1 : {lev}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-[11px] font-semibold text-slate-600 mb-1">Account Equity ($)</label>
                <input
                  type="number"
                  value={marginEquity}
                  onChange={(e) => setMarginEquity(e.target.value)}
                  className="w-full px-3 py-2 text-xs font-mono rounded-lg border border-slate-300"
                />
              </div>
              <div>
                <label className="block text-[11px] font-semibold text-slate-600 mb-1">Contract Size (Units/Lot)</label>
                <input
                  type="number"
                  value={contractSize}
                  onChange={(e) => setContractSize(e.target.value)}
                  className="w-full px-3 py-2 text-xs font-mono rounded-lg border border-slate-300"
                />
              </div>
              <div>
                <label className="block text-[11px] font-semibold text-slate-600 mb-1">Pip Value / Lot ($)</label>
                <input
                  type="number"
                  step="0.01"
                  value={pipValuePerLot}
                  onChange={(e) => setPipValuePerLot(e.target.value)}
                  className="w-full px-3 py-2 text-xs font-mono rounded-lg border border-slate-300"
                />
              </div>
            </div>
          )}

          {tab === 'scalein' && (
            <div className="space-y-4">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="inline-flex rounded-lg border border-slate-200 bg-[#FAF9F6] p-0.5">
                  {(['Buy', 'Sell'] as const).map((s) => (
                    <button
                      key={s}
                      type="button"
                      onClick={() => setScaleSide(s)}
                      className={`px-3.5 py-1.5 text-xs font-semibold rounded-md cursor-pointer ${
                        scaleSide === s
                          ? s === 'Buy'
                            ? 'bg-emerald-700 text-white'
                            : 'bg-rose-600 text-white'
                          : 'text-slate-600'
                      }`}
                    >
                      {s === 'Buy' ? 'Long Scale-In' : 'Short Scale-In'}
                    </button>
                  ))}
                </div>
                <div className="flex items-center gap-3">
                  <div>
                    <label className="block text-[10px] font-semibold text-slate-500">Exit Price</label>
                    <input
                      type="number"
                      step="any"
                      value={scaleExit}
                      onChange={(e) => setScaleExit(e.target.value)}
                      className="w-28 px-2.5 py-1.5 text-xs font-mono rounded-lg border border-slate-300"
                    />
                  </div>
                  <div>
                    <label className="block text-[10px] font-semibold text-slate-500">Comm ($/lot)</label>
                    <input
                      type="number"
                      step="0.5"
                      value={scaleCommissionPerLot}
                      onChange={(e) => setScaleCommissionPerLot(e.target.value)}
                      className="w-24 px-2.5 py-1.5 text-xs font-mono rounded-lg border border-slate-300"
                    />
                  </div>
                </div>
              </div>

              <div className="space-y-2.5">
                {legs.map((leg, idx) => (
                  <div key={idx} className="grid grid-cols-12 gap-3 items-center p-3 rounded-xl bg-[#FAF9F6] border border-slate-200">
                    <span className="col-span-3 text-xs font-bold text-slate-800">Entry Leg #{idx + 1}</span>
                    <div className="col-span-5">
                      <input
                        type="number"
                        step="any"
                        placeholder="Entry price"
                        value={leg.price}
                        onChange={(e) =>
                          setLegs((prev) => prev.map((x, i) => (i === idx ? { ...x, price: e.target.value } : x)))
                        }
                        className="w-full px-2.5 py-1.5 text-xs font-mono rounded-lg border border-slate-300 bg-white"
                      />
                    </div>
                    <div className="col-span-4">
                      <input
                        type="number"
                        step="0.01"
                        placeholder="Lots"
                        value={leg.lots}
                        onChange={(e) =>
                          setLegs((prev) => prev.map((x, i) => (i === idx ? { ...x, lots: e.target.value } : x)))
                        }
                        className="w-full px-2.5 py-1.5 text-xs font-mono rounded-lg border border-slate-300 bg-white"
                      />
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Right: Obsidian + Gold Institutional Output Panel */}
        <div className="lg:col-span-4 rounded-2xl bg-[#0B0F19] text-white border border-slate-800 p-5 space-y-5">
          <div>
            <div className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">
              {summaryPanel.eyebrow}
            </div>
            <div className="text-3xl font-bold font-mono tabular-nums text-[#E5A93C] mt-1.5">
              {summaryPanel.headline}
            </div>
            <p className="text-xs text-slate-400 mt-1">{summaryPanel.subline}</p>
          </div>

          {/* Visual Risk vs Reward / Threshold Bar */}
          <div className="space-y-1.5">
            <div className="flex items-center justify-between text-[10px] font-mono uppercase text-slate-400">
              <span>Risk / Threshold</span>
              <span>Reward / Cushion</span>
            </div>
            <div className="h-2.5 w-full rounded-full bg-emerald-500/30 overflow-hidden flex">
              <div className="bg-rose-500 h-full" style={{ width: `${Math.min(92, Math.max(8, summaryPanel.slRatio))}%` }} />
              <div className="bg-[#E5A93C] h-full flex-1" />
            </div>
          </div>

          <div className="space-y-2.5 pt-2 border-t border-slate-800">
            {summaryPanel.metrics.map(([label, val, color]) => (
              <div key={String(label)} className="flex items-center justify-between text-xs">
                <span className="text-slate-400">{label}</span>
                <span className={`font-mono font-bold tabular-nums ${color}`}>{val}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
};
