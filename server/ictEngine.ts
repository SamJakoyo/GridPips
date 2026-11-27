import { fetchTradingViewChartData, type TvInterval } from './tradingViewFeed.ts';

export interface Candle {
  index: number;
  timestampSec: number;
  time: string;
  open: number;
  high: number;
  low: number;
  close: number;
}

export type IctZoneType =
  | 'Bullish FVG'
  | 'Bearish FVG'
  | 'Bullish OB'
  | 'Bearish OB'
  | 'Bullish Breaker'
  | 'Bearish Breaker'
  | 'Bullish Mitigation'
  | 'Bearish Mitigation'
  | 'Bullish Rejection'
  | 'Bearish Rejection'
  | 'Liquidity Void';

export interface IctZone {
  type: IctZoneType;
  top: number;
  bottom: number;
  ceMid: number;
  startIndex: number;
  endIndex: number;
  mitigated: boolean;
  pdZone?: 'Premium' | 'Discount' | 'Equilibrium';
}

export type PdArrayCategory =
  | 'Old High / BSL'
  | 'Old Low / SSL'
  | 'Equal Highs (EQH)'
  | 'Equal Lows (EQL)'
  | 'Rejection Block'
  | 'Order Block (OB)'
  | 'Fair Value Gap (FVG)'
  | 'Liquidity Void'
  | 'Breaker Block'
  | 'Mitigation Block';

export interface PdArrayItem {
  id: string;
  name: string;
  category: PdArrayCategory;
  direction: 'Bullish' | 'Bearish' | 'Neutral';
  zone: 'Premium' | 'Discount' | 'Equilibrium';
  priority: number; // 1 = highest institutional priority in ICT PD Array Matrix
  top: number;
  bottom: number;
  midpoint: number;
  status: 'Unmitigated' | 'In Zone' | 'Mitigated' | 'Target Liquidity';
  distancePct: number;
  description: string;
  startIndex: number;
}

export interface PremiumDiscountProfile {
  rangeHigh: number;
  rangeLow: number;
  equilibrium: number; // Exact 50% midpoint of Dealing Range
  premiumStart: number;
  discountEnd: number;
  currentPositionPct: number; // 0% = rangeLow, 50% = Equilibrium, 100% = rangeHigh
  currentZone: 'Premium' | 'Discount' | 'Equilibrium';
  quadrant:
    | 'Deep Premium (75-100%)'
    | 'Upper Premium (50-75%)'
    | 'Equilibrium (50%)'
    | 'Upper Discount (25-50%)'
    | 'Deep Discount (0-25%)';
  alignedWithBias: boolean;
  guidance: string;
}

export type IctTradeVerdict = 'Actionable Trade' | 'Wait for Setup' | 'No Trade';

export interface IctConfluenceCheck {
  id: 'mss_displacement' | 'signal_alignment' | 'pd_array_in_zone' | 'min_rr_dol' | 'pd_equilibrium';
  label: string;
  passed: boolean;
  required: boolean; // true = hard No-Trade gate; false = triggers Wait for Setup (Limit Only)
  detail: string;
}

export interface IctSetupLifecycle {
  status: 'Locked Active' | 'Locked Waiting' | 'Unlocked (No Trade)';
  isLocked: boolean;
  lockedAt: string | null;
  lockedBarTime: string | null;
  lockedBarTimestampSec: number | null;
  lastClosedBarTime: string;
  invalidationLevel: number | null;
  invalidationRule: string;
  validationLevel: number | null;
  validationZone: string | null;
  validationRule: string;
  targetDolLevel: number | null;
  liveProximity:
    | 'In Entry Zone'
    | 'Approaching Entry'
    | 'Waiting for Retracement'
    | 'In Progress Toward TP1/TP2'
    | 'Stand Aside';
  lastTransitionEvent: string | null;
  fractalRole: string;
}

export interface IctAnalysisResult {
  symbol: string;
  tvSymbol: string;
  tradingViewUrl: string;
  timeframe: string;
  currentPrice: number;
  bid: number | null;
  ask: number | null;
  changePct: number | null;
  dailyBias: 'Bullish' | 'Bearish' | 'Neutral';
  tradeVerdict: IctTradeVerdict;
  verdictHeadline: string;
  verdictSummary: string;
  noTradeReasons: string[];
  confluenceChecks: IctConfluenceCheck[];
  lifecycle: IctSetupLifecycle;
  po3Phase: 'Accumulation' | 'Manipulation (Judas Swing)' | 'Distribution';
  activeKillzone: string;
  structureShift: string;
  mssIndex?: number | null;
  displacementDetected: boolean;
  liquiditySweep: string;
  sweepIndex?: number | null;
  drawOnLiquidity: {
    label: string;
    price: number;
    side: 'BSL (Premium)' | 'SSL (Discount)';
  };
  bslLevel: number;
  sslLevel: number;
  equalHighsLevel: number | null;
  equalLowsLevel: number | null;
  premiumDiscount: PremiumDiscountProfile;
  pdArrays: PdArrayItem[];
  oteLevels: {
    fib618: number;
    fib705: number;
    fib786: number;
    zone: 'Premium' | 'Discount';
  };
  zones: IctZone[];
  setup: {
    direction: 'Long (Buy)' | 'Short (Sell)' | 'No Trade';
    entryZone: string | null;
    entryArrayName: string | null;
    stopLoss: number | null;
    tp1: number | null;
    tp2: number | null;
    rrRatio: number | null;
    projectedRrToDol?: number | null;
    confluences: string[];
  };
  candles: Candle[];
  ictReferenceChannel: string;
  dataSource: 'tradingview_live';
  lastUpdated: string;
}

interface LockedIctSetup {
  lockedAt: string;
  lockedBarTime: string;
  lockedBarTimestampSec: number;
  dailyBias: 'Bullish' | 'Bearish';
  direction: 'Long (Buy)' | 'Short (Sell)';
  entryZone: string;
  entryArrayName: string;
  entryTop: number;
  entryBottom: number;
  entryMid: number;
  stopLoss: number;
  tp1: number;
  tp2: number;
  rrRatio: number;
  drawOnLiquidity: IctAnalysisResult['drawOnLiquidity'];
  rangeHigh: number;
  rangeLow: number;
  equilibrium: number;
  structureShift: string;
  confluenceChecks: IctConfluenceCheck[];
  lastVerdict: 'Actionable Trade' | 'Wait for Setup';
  entryTapped: boolean;
}

// Fractal per-(symbol:timeframe) setup lock memory so lower & higher timeframes hold steady
// until strict closed-candle invalidation, external DOL completion, or opposing closed-candle MSS.
const lockedIctSetups = new Map<string, LockedIctSetup>();

const VALID_TIMEFRAMES = ['1M', '5M', '15M', '30M', '1H', '4H', '1D', '1W'] as const;
type ValidTimeframe = (typeof VALID_TIMEFRAMES)[number];

const TF_CONFIG: Record<
  ValidTimeframe,
  {
    tvInterval: TvInterval;
    label: string;
    fractalRole: string;
  }
> = {
  '1M': { tvInterval: '1', label: '1-Minute Precision Entry', fractalRole: '1M Micro Execution · Locked on 1M Closes' },
  '5M': { tvInterval: '5', label: '5-Minute Intraday Displacement', fractalRole: '5M LTF Execution · Locked on 5M Closes' },
  '15M': { tvInterval: '15', label: '15-Minute Session Structure', fractalRole: '15M Intraday Session · Locked on 15M Closes' },
  '30M': { tvInterval: '30', label: '30-Minute Killzone Framework', fractalRole: '30M Killzone Structure · Locked on 30M Closes' },
  '1H': { tvInterval: '60', label: '1-Hour Institutional Orderflow', fractalRole: '1H Intermediate Orderflow · Locked on 1H Closes' },
  '4H': { tvInterval: '240', label: '4-Hour Intermediate Swing', fractalRole: '4H Swing Structure · Locked on 4H Closes' },
  '1D': { tvInterval: 'D', label: 'Daily HTF Draw on Liquidity', fractalRole: '1D HTF Macro Bias · Locked on Daily Closes' },
  '1W': { tvInterval: 'W', label: 'Weekly Macro Liquidity Bias', fractalRole: '1W Macro Liquidity · Locked on Weekly Closes' },
};

export function normalizeServerTimeframe(raw?: string): ValidTimeframe {
  const upper = (raw || '1M').trim().toUpperCase();
  const map: Record<string, ValidTimeframe> = {
    '1M': '1M',
    M1: '1M',
    '5M': '5M',
    M5: '5M',
    '15M': '15M',
    M15: '15M',
    '30M': '30M',
    M30: '30M',
    '1H': '1H',
    H1: '1H',
    '4H': '4H',
    H4: '4H',
    '1D': '1D',
    D1: '1D',
    '1W': '1W',
    W1: '1W',
  };
  return map[upper] || '1M';
}

function formatCandleTime(timestampSec: number, tf: ValidTimeframe): string {
  const d = new Date(timestampSec * 1000);
  if (tf === '1D' || tf === '1W') {
    const mm = String(d.getUTCMonth() + 1).padStart(2, '0');
    const dd = String(d.getUTCDate()).padStart(2, '0');
    return `${mm}-${dd}`;
  }
  return `${String(d.getUTCHours()).padStart(2, '0')}:${String(d.getUTCMinutes()).padStart(2, '0')}`;
}

function getNewYorkKillzone(): { label: string; isSilverBullet: boolean; nyHour: number } {
  const now = new Date();
  const nyHourStr = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/New_York',
    hour: '2-digit',
    hour12: false,
  }).format(now);
  const nyHour = Number(nyHourStr) % 24;
  if (nyHour >= 2 && nyHour < 5) {
    return { label: 'London Open Killzone (02:00 - 05:00 NY)', isSilverBullet: false, nyHour };
  }
  if (nyHour >= 7 && nyHour < 10) {
    return { label: 'New York AM Killzone (07:00 - 10:00 NY)', isSilverBullet: false, nyHour };
  }
  if (nyHour >= 10 && nyHour < 11) {
    return { label: 'ICT AM Silver Bullet Window (10:00 - 11:00 NY)', isSilverBullet: true, nyHour };
  }
  if (nyHour >= 11 && nyHour < 12) {
    return { label: 'London Close Killzone (10:00 - 12:00 NY)', isSilverBullet: false, nyHour };
  }
  if (nyHour >= 14 && nyHour < 15) {
    return { label: 'ICT PM Silver Bullet Window (14:00 - 15:00 NY)', isSilverBullet: true, nyHour };
  }
  if (nyHour >= 13 && nyHour < 16) {
    return { label: 'New York PM Session (13:30 - 16:00 NY)', isSilverBullet: false, nyHour };
  }
  return { label: 'Asian Range Accumulation (20:00 - 00:00 NY)', isSilverBullet: false, nyHour };
}

function classifyPdZone(price: number, equilibrium: number, tolerance: number): 'Premium' | 'Discount' | 'Equilibrium' {
  if (price > equilibrium + tolerance) return 'Premium';
  if (price < equilibrium - tolerance) return 'Discount';
  return 'Equilibrium';
}

export async function runIctMarketAnalysis(
  symbolRaw: string,
  timeframeRaw: string,
  ictChannelId: string,
  options?: { forceReset?: boolean }
): Promise<IctAnalysisResult> {
  const cleanSymbol = (symbolRaw || 'EURUSD').trim().toUpperCase();
  const timeframe = normalizeServerTimeframe(timeframeRaw);
  const tfCfg = TF_CONFIG[timeframe];
  const lockKey = `${cleanSymbol}:${timeframe}`;

  // Fetch real live OHLC bars and current price directly from TradingView
  const tvData = await fetchTradingViewChartData(cleanSymbol, tfCfg.tvInterval);
  const digits = tvData.digits;
  const round = (n: number) => Number(n.toFixed(digits));

  // Full bar series (including currently forming live bar) for charting
  const allCandles: Candle[] = tvData.bars.map((b, idx) => ({
    index: idx,
    timestampSec: b.timestampSec,
    time: formatCandleTime(b.timestampSec, timeframe),
    open: b.open,
    high: b.high,
    low: b.low,
    close: b.close,
  }));

  // STRICT CLOSED-CANDLE STRUCTURE ENGINE:
  // Exclude the still-forming live candle from all structural calculations (MSS, sweeps, displacement, PD Arrays)
  // so mid-candle ticks NEVER flicker or fabricate unconfirmed structure shifts.
  const candles: Candle[] = allCandles.length >= 16 ? allCandles.slice(0, -1) : allCandles;
  const lastClosedCandle = candles[candles.length - 1];
  const currentPrice = tvData.currentPrice;

  // Compute live Average True Range (ATR) from TradingView OHLC bars
  const trueRanges: number[] = [];
  for (let i = 1; i < candles.length; i++) {
    const cur = candles[i];
    const prevClose = candles[i - 1].close;
    trueRanges.push(
      Math.max(cur.high - cur.low, Math.abs(cur.high - prevClose), Math.abs(cur.low - prevClose))
    );
  }
  const atr =
    trueRanges.length > 0
      ? trueRanges.reduce((acc, v) => acc + v, 0) / trueRanges.length
      : Math.max(currentPrice * 0.001, Math.pow(10, -digits));
  const minStep = Math.max(atr * 0.65, Math.pow(10, -digits));

  // 1. Identify Structural Swing Highs & Swing Lows (3-bar & 5-bar fractals)
  const swingHighs: Array<{ index: number; price: number }> = [];
  const swingLows: Array<{ index: number; price: number }> = [];

  for (let i = 2; i < candles.length - 2; i++) {
    const c = candles[i];
    if (
      c.high >= candles[i - 1].high &&
      c.high >= candles[i - 2].high &&
      c.high >= candles[i + 1].high &&
      c.high >= candles[i + 2].high
    ) {
      swingHighs.push({ index: i, price: round(c.high) });
    }
    if (
      c.low <= candles[i - 1].low &&
      c.low <= candles[i - 2].low &&
      c.low <= candles[i + 1].low &&
      c.low <= candles[i + 2].low
    ) {
      swingLows.push({ index: i, price: round(c.low) });
    }
  }

  // Fallback to simple 3-bar fractals if very few 5-bar swings found
  if (swingHighs.length === 0) {
    for (let i = 1; i < candles.length - 1; i++) {
      if (candles[i].high >= candles[i - 1].high && candles[i].high >= candles[i + 1].high) {
        swingHighs.push({ index: i, price: round(candles[i].high) });
      }
    }
  }
  if (swingLows.length === 0) {
    for (let i = 1; i < candles.length - 1; i++) {
      if (candles[i].low <= candles[i - 1].low && candles[i].low <= candles[i + 1].low) {
        swingLows.push({ index: i, price: round(candles[i].low) });
      }
    }
  }

  // 2. Dealing Range, Equilibrium (50%), Premium & Discount Calculation
  const bslLevel = round(Math.max(...candles.map((c) => c.high)));
  const sslLevel = round(Math.min(...candles.map((c) => c.low)));

  const rangeHigh = bslLevel;
  const rangeLow = sslLevel;
  const dealingSpan = Math.max(rangeHigh - rangeLow, minStep);
  const equilibrium = round((rangeHigh + rangeLow) / 2);
  const eqTolerance = dealingSpan * 0.025; // ±2.5% band around exact 50% Equilibrium

  const rawPosPct = ((currentPrice - rangeLow) / dealingSpan) * 100;
  const currentPositionPct = Number(Math.min(100, Math.max(0, rawPosPct)).toFixed(1));
  const currentZone = classifyPdZone(currentPrice, equilibrium, eqTolerance);

  let quadrant: PremiumDiscountProfile['quadrant'] = 'Equilibrium (50%)';
  if (currentPositionPct >= 75) quadrant = 'Deep Premium (75-100%)';
  else if (currentPositionPct > 52.5) quadrant = 'Upper Premium (50-75%)';
  else if (currentPositionPct <= 25) quadrant = 'Deep Discount (0-25%)';
  else if (currentPositionPct < 47.5) quadrant = 'Upper Discount (25-50%)';

  // 3. Determine Institutional Orderflow Bias, Market Structure Shift (MSS) & Displacement
  const midIdx = Math.floor(candles.length / 2);
  const firstHalf = candles.slice(0, midIdx);
  const secondHalf = candles.slice(midIdx);
  const firstAvg = firstHalf.reduce((a, b) => a + b.close, 0) / Math.max(1, firstHalf.length);

  // Check most recent MSS (close above last significant swing high OR close below last significant swing low with energetic candle)
  let mssBullishCandle: Candle | null = null;
  let mssBearishCandle: Candle | null = null;
  let mssBrokenPrice: number | null = null;

  const recentWindowStart = Math.max(3, candles.length - 18);
  for (let i = candles.length - 1; i >= recentWindowStart; i--) {
    const c = candles[i];
    const body = Math.abs(c.close - c.open);
    const priorHighSwings = swingHighs.filter((s) => s.index < i - 1);
    const priorLowSwings = swingLows.filter((s) => s.index < i - 1);
    const lastSwingH = priorHighSwings[priorHighSwings.length - 1];
    const lastSwingL = priorLowSwings[priorLowSwings.length - 1];

    if (!mssBullishCandle && lastSwingH && c.close > lastSwingH.price && c.close > c.open && body >= atr * 0.55) {
      mssBullishCandle = c;
      mssBrokenPrice = lastSwingH.price;
      break;
    }
    if (!mssBearishCandle && lastSwingL && c.close < lastSwingL.price && c.close < c.open && body >= atr * 0.55) {
      mssBearishCandle = c;
      mssBrokenPrice = lastSwingL.price;
      break;
    }
  }

  // Liquidity Sweep check (Turtle Soup / Stop Run — requires meaningful rejection wick >= 0.25 ATR)
  let liquiditySweep = 'No recent external stop run detected';
  let recentSweepBias: 'Bullish' | 'Bearish' | null = null;
  let sweepIndex: number | null = null;
  const minSweepWick = Math.max(atr * 0.25, Math.pow(10, -digits) * 2);
  for (let i = candles.length - 1; i >= Math.max(3, candles.length - 14); i--) {
    const c = candles[i];
    const prevSwingsH = swingHighs.filter((s) => s.index < i - 1);
    const prevSwingsL = swingLows.filter((s) => s.index < i - 1);
    const prevHigh = prevSwingsH[prevSwingsH.length - 1];
    const prevLow = prevSwingsL[prevSwingsL.length - 1];
    const lowerWick = Math.min(c.open, c.close) - c.low;
    const upperWick = c.high - Math.max(c.open, c.close);

    if (prevLow && c.low < prevLow.price && c.close > prevLow.price && lowerWick >= minSweepWick) {
      liquiditySweep = `SSL Stop Hunt below ${prevLow.price.toFixed(digits)} reclaimed at ${c.time}`;
      recentSweepBias = 'Bullish';
      sweepIndex = i;
      break;
    }
    if (prevHigh && c.high > prevHigh.price && c.close < prevHigh.price && upperWick >= minSweepWick) {
      liquiditySweep = `BSL Stop Hunt above ${prevHigh.price.toFixed(digits)} rejected at ${c.time}`;
      recentSweepBias = 'Bearish';
      sweepIndex = i;
      break;
    }
  }

  const bullishBias = mssBullishCandle
    ? true
    : mssBearishCandle
    ? false
    : recentSweepBias
    ? recentSweepBias === 'Bullish'
    : currentPrice >= firstAvg;

  // Check Displacement (strong expansion candle >= 1.25 * ATR with >= 60% body ratio in last 15 bars)
  const displacementDetected = candles.slice(-15).some((c) => {
    const full = Math.max(c.high - c.low, Math.pow(10, -digits));
    const body = Math.abs(c.close - c.open);
    return body >= atr * 1.1 && body / full >= 0.58;
  });

  const structureShift = mssBullishCandle && mssBrokenPrice
    ? `Bullish MSS above ${mssBrokenPrice.toFixed(digits)} (${timeframe})`
    : mssBearishCandle && mssBrokenPrice
    ? `Bearish MSS below ${mssBrokenPrice.toFixed(digits)} (${timeframe})`
    : bullishBias
    ? `Bullish Orderflow Structure (${timeframe})`
    : `Bearish Orderflow Structure (${timeframe})`;

  // 4. Detect Equal Highs (EQH) & Equal Lows (EQL)
  const equalLevelTolerance = Math.max(atr * 0.25, Math.pow(10, -digits) * 2);
  let equalHighsLevel: number | null = null;
  let equalLowsLevel: number | null = null;

  for (let i = swingHighs.length - 1; i >= 1; i--) {
    for (let j = i - 1; j >= 0; j--) {
      if (swingHighs[i].index - swingHighs[j].index >= 3) {
        if (Math.abs(swingHighs[i].price - swingHighs[j].price) <= equalLevelTolerance) {
          equalHighsLevel = round((swingHighs[i].price + swingHighs[j].price) / 2);
          break;
        }
      }
    }
    if (equalHighsLevel !== null) break;
  }

  for (let i = swingLows.length - 1; i >= 1; i--) {
    for (let j = i - 1; j >= 0; j--) {
      if (swingLows[i].index - swingLows[j].index >= 3) {
        if (Math.abs(swingLows[i].price - swingLows[j].price) <= equalLevelTolerance) {
          equalLowsLevel = round((swingLows[i].price + swingLows[j].price) / 2);
          break;
        }
      }
    }
    if (equalLowsLevel !== null) break;
  }

  // 5. Build Full ICT PD Array Matrix & Chart Zones
  const pdArrays: PdArrayItem[] = [];
  const zones: IctZone[] = [];

  const pushPdArray = (item: Omit<PdArrayItem, 'distancePct' | 'status'> & { mitigated?: boolean; isTarget?: boolean }) => {
    const top = round(Math.max(item.top, item.bottom));
    const bottom = round(Math.min(item.top, item.bottom));
    const midpoint = round((top + bottom) / 2);
    const inZone = currentPrice >= bottom && currentPrice <= top;
    const status: PdArrayItem['status'] = item.isTarget
      ? 'Target Liquidity'
      : inZone
      ? 'In Zone'
      : item.mitigated
      ? 'Mitigated'
      : 'Unmitigated';
    const distancePct = Number((((midpoint - currentPrice) / Math.max(currentPrice, 1e-8)) * 100).toFixed(2));
    pdArrays.push({
      id: item.id,
      name: item.name,
      category: item.category,
      direction: item.direction,
      zone: item.zone,
      priority: item.priority,
      top,
      bottom,
      midpoint,
      status,
      distancePct,
      description: item.description,
      startIndex: item.startIndex,
    });
  };

  // A. Old Highs / BSL & Equal Highs (Priority 1 - Premium Liquidity)
  pushPdArray({
    id: 'bsl-old-high',
    name: `Old High / BSL (${bslLevel.toFixed(digits)})`,
    category: 'Old High / BSL',
    direction: 'Bearish',
    zone: 'Premium',
    priority: 1,
    top: bslLevel,
    bottom: bslLevel,
    midpoint: bslLevel,
    isTarget: bullishBias,
    description: 'External range Buy-Side Liquidity pool resting above swing high.',
    startIndex: candles.find((c) => round(c.high) === bslLevel)?.index ?? 0,
  });

  if (equalHighsLevel !== null && Math.abs(equalHighsLevel - bslLevel) > equalLevelTolerance) {
    pushPdArray({
      id: 'eqh-pool',
      name: `Equal Highs EQH (${equalHighsLevel.toFixed(digits)})`,
      category: 'Equal Highs (EQH)',
      direction: 'Bearish',
      zone: classifyPdZone(equalHighsLevel, equilibrium, eqTolerance),
      priority: 1,
      top: equalHighsLevel,
      bottom: equalHighsLevel,
      midpoint: equalHighsLevel,
      isTarget: bullishBias,
      description: 'Clean Equal Highs engineering buy-stop liquidity magnet.',
      startIndex: swingHighs[swingHighs.length - 1]?.index ?? 0,
    });
  }

  // B. Old Lows / SSL & Equal Lows (Priority 1 - Discount Liquidity)
  pushPdArray({
    id: 'ssl-old-low',
    name: `Old Low / SSL (${sslLevel.toFixed(digits)})`,
    category: 'Old Low / SSL',
    direction: 'Bullish',
    zone: 'Discount',
    priority: 1,
    top: sslLevel,
    bottom: sslLevel,
    midpoint: sslLevel,
    isTarget: !bullishBias,
    description: 'External range Sell-Side Liquidity pool resting below swing low.',
    startIndex: candles.find((c) => round(c.low) === sslLevel)?.index ?? 0,
  });

  if (equalLowsLevel !== null && Math.abs(equalLowsLevel - sslLevel) > equalLevelTolerance) {
    pushPdArray({
      id: 'eql-pool',
      name: `Equal Lows EQL (${equalLowsLevel.toFixed(digits)})`,
      category: 'Equal Lows (EQL)',
      direction: 'Bullish',
      zone: classifyPdZone(equalLowsLevel, equilibrium, eqTolerance),
      priority: 1,
      top: equalLowsLevel,
      bottom: equalLowsLevel,
      midpoint: equalLowsLevel,
      isTarget: !bullishBias,
      description: 'Clean Equal Lows resting sell-stops below support.',
      startIndex: swingLows[swingLows.length - 1]?.index ?? 0,
    });
  }

  // C. Fair Value Gaps (BISI / SIBI) — Priority 4
  const bullishFvgs: IctZone[] = [];
  const bearishFvgs: IctZone[] = [];

  for (let i = 2; i < candles.length - 1; i++) {
    const c1 = candles[i - 2];
    const c3 = candles[i];
    const subsequent = candles.slice(i + 1);

    if (c3.low > c1.high) {
      const top = round(c3.low);
      const bottom = round(c1.high);
      const ceMid = round((top + bottom) / 2);
      const mitigated = subsequent.some((k) => k.low <= ceMid);
      const pdZone = classifyPdZone(ceMid, equilibrium, eqTolerance);
      const z: IctZone = {
        type: 'Bullish FVG',
        top,
        bottom,
        ceMid,
        startIndex: i - 2,
        endIndex: candles.length - 1,
        mitigated,
        pdZone,
      };
      bullishFvgs.push(z);
      zones.push(z);
    } else if (c3.high < c1.low) {
      const top = round(c1.low);
      const bottom = round(c3.high);
      const ceMid = round((top + bottom) / 2);
      const mitigated = subsequent.some((k) => k.high >= ceMid);
      const pdZone = classifyPdZone(ceMid, equilibrium, eqTolerance);
      const z: IctZone = {
        type: 'Bearish FVG',
        top,
        bottom,
        ceMid,
        startIndex: i - 2,
        endIndex: candles.length - 1,
        mitigated,
        pdZone,
      };
      bearishFvgs.push(z);
      zones.push(z);
    }
  }

  // Add most relevant unmitigated Bullish & Bearish FVGs into PD Array Matrix (preserving Discount Bullish & Premium Bearish FVGs)
  const pickBestFvgs = (list: IctZone[], preferredZone: 'Discount' | 'Premium') => {
    const unmit = list.filter((f) => !f.mitigated);
    const inPreferredZone = unmit.filter((f) => f.pdZone === preferredZone).slice(-2);
    const recentUnmit = unmit.slice(-2);
    const merged: IctZone[] = [];
    for (const item of [...inPreferredZone, ...recentUnmit]) {
      if (!merged.some((m) => m.startIndex === item.startIndex)) {
        merged.push(item);
      }
    }
    if (merged.length > 0) return merged.slice(0, 3);
    return list.slice(-1);
  };
  for (const fvg of pickBestFvgs(bullishFvgs, 'Discount')) {
    pushPdArray({
      id: `bisi-${fvg.startIndex}`,
      name: `Bullish FVG (BISI) · 50% CE ${fvg.ceMid.toFixed(digits)}`,
      category: 'Fair Value Gap (FVG)',
      direction: 'Bullish',
      zone: fvg.pdZone || classifyPdZone(fvg.ceMid, equilibrium, eqTolerance),
      priority: 4,
      top: fvg.top,
      bottom: fvg.bottom,
      midpoint: fvg.ceMid,
      mitigated: fvg.mitigated,
      description: 'Buy-Side Imbalance / Sell-Side Inefficiency; sniper fill at 50% Consequent Encroachment.',
      startIndex: fvg.startIndex,
    });
  }
  for (const fvg of pickBestFvgs(bearishFvgs, 'Premium')) {
    pushPdArray({
      id: `sibi-${fvg.startIndex}`,
      name: `Bearish FVG (SIBI) · 50% CE ${fvg.ceMid.toFixed(digits)}`,
      category: 'Fair Value Gap (FVG)',
      direction: 'Bearish',
      zone: fvg.pdZone || classifyPdZone(fvg.ceMid, equilibrium, eqTolerance),
      priority: 4,
      top: fvg.top,
      bottom: fvg.bottom,
      midpoint: fvg.ceMid,
      mitigated: fvg.mitigated,
      description: 'Sell-Side Imbalance / Buy-Side Inefficiency; short entry at 50% Consequent Encroachment.',
      startIndex: fvg.startIndex,
    });
  }

  // D. Bullish & Bearish Order Blocks (Priority 3 — STRICT displacement-backed only, no forced fallback)
  const bullObCandidates: Candle[] = [];
  const bearObCandidates: Candle[] = [];

  for (let i = candles.length - 3; i >= 2; i--) {
    const c = candles[i];
    const next1 = candles[i + 1];
    const next2 = candles[i + 2];
    const nextDisplacement =
      Math.abs(next1.close - next1.open) >= atr * 0.7 ||
      Math.abs(next2.close - next2.open) >= atr * 0.7;

    if (c.close < c.open && next1.close > c.high && nextDisplacement) {
      bullObCandidates.push(c);
    }
    if (c.close > c.open && next1.close < c.low && nextDisplacement) {
      bearObCandidates.push(c);
    }
  }

  // Prefer keeping the most recent genuine OB plus the most recent unmitigated Discount Bullish / Premium Bearish OB
  const selectedBullObs: Candle[] = [];
  for (const ob of bullObCandidates) {
    const mid = round((ob.high + ob.low) / 2);
    const pdZone = classifyPdZone(mid, equilibrium, eqTolerance);
    const mitigated = candles.slice(ob.index + 2).some((k) => k.close < ob.low);
    if (selectedBullObs.length === 0 || (!mitigated && pdZone === 'Discount')) {
      if (!selectedBullObs.some((x) => x.index === ob.index)) {
        selectedBullObs.push(ob);
      }
    }
    if (selectedBullObs.length >= 2) break;
  }

  const selectedBearObs: Candle[] = [];
  for (const ob of bearObCandidates) {
    const mid = round((ob.high + ob.low) / 2);
    const pdZone = classifyPdZone(mid, equilibrium, eqTolerance);
    const mitigated = candles.slice(ob.index + 2).some((k) => k.close > ob.high);
    if (selectedBearObs.length === 0 || (!mitigated && pdZone === 'Premium')) {
      if (!selectedBearObs.some((x) => x.index === ob.index)) {
        selectedBearObs.push(ob);
      }
    }
    if (selectedBearObs.length >= 2) break;
  }

  for (const bullObCandle of selectedBullObs) {
    const mid = round((bullObCandle.high + bullObCandle.low) / 2);
    const pdZone = classifyPdZone(mid, equilibrium, eqTolerance);
    const mitigated = candles.slice(bullObCandle.index + 2).some((k) => k.close < bullObCandle.low);
    const obZone: IctZone = {
      type: 'Bullish OB',
      top: round(bullObCandle.high),
      bottom: round(bullObCandle.low),
      ceMid: mid,
      startIndex: bullObCandle.index,
      endIndex: candles.length - 1,
      mitigated,
      pdZone,
    };
    if (bullishBias || !mitigated) zones.push(obZone);
    pushPdArray({
      id: `bull-ob-${bullObCandle.index}`,
      name: `Bullish Order Block (MT ${mid.toFixed(digits)})`,
      category: 'Order Block (OB)',
      direction: 'Bullish',
      zone: pdZone,
      priority: 3,
      top: obZone.top,
      bottom: obZone.bottom,
      midpoint: mid,
      mitigated,
      description: 'Last down-close candle prior to bullish displacement; 50% Mean Threshold marks institutional validation.',
      startIndex: bullObCandle.index,
    });
  }

  for (const bearObCandle of selectedBearObs) {
    const mid = round((bearObCandle.high + bearObCandle.low) / 2);
    const pdZone = classifyPdZone(mid, equilibrium, eqTolerance);
    const mitigated = candles.slice(bearObCandle.index + 2).some((k) => k.close > bearObCandle.high);
    const obZone: IctZone = {
      type: 'Bearish OB',
      top: round(bearObCandle.high),
      bottom: round(bearObCandle.low),
      ceMid: mid,
      startIndex: bearObCandle.index,
      endIndex: candles.length - 1,
      mitigated,
      pdZone,
    };
    if (!bullishBias || !mitigated) zones.push(obZone);
    pushPdArray({
      id: `bear-ob-${bearObCandle.index}`,
      name: `Bearish Order Block (MT ${mid.toFixed(digits)})`,
      category: 'Order Block (OB)',
      direction: 'Bearish',
      zone: pdZone,
      priority: 3,
      top: obZone.top,
      bottom: obZone.bottom,
      midpoint: mid,
      mitigated,
      description: 'Last up-close candle prior to bearish displacement; 50% Mean Threshold defends short orderflow.',
      startIndex: bearObCandle.index,
    });
  }

  // E. Rejection Blocks (Priority 2 — Long wicks at swing extremes)
  for (let i = candles.length - 2; i >= 2; i--) {
    const c = candles[i];
    const fullRange = Math.max(c.high - c.low, Math.pow(10, -digits));
    const upperWick = c.high - Math.max(c.open, c.close);
    const lowerWick = Math.min(c.open, c.close) - c.low;
    const body = Math.abs(c.close - c.open);

    if (upperWick >= fullRange * 0.48 && upperWick >= body * 1.1 && c.high >= equilibrium) {
      const top = round(c.high);
      const bottom = round(Math.max(c.open, c.close));
      const mid = round((top + bottom) / 2);
      const mitigated = candles.slice(i + 1).some((k) => k.close > top);
      zones.push({
        type: 'Bearish Rejection',
        top,
        bottom,
        ceMid: mid,
        startIndex: i,
        endIndex: candles.length - 1,
        mitigated,
        pdZone: 'Premium',
      });
      pushPdArray({
        id: `bear-rej-${i}`,
        name: `Bearish Rejection Block (${bottom.toFixed(digits)} - ${top.toFixed(digits)})`,
        category: 'Rejection Block',
        direction: 'Bearish',
        zone: 'Premium',
        priority: 2,
        top,
        bottom,
        midpoint: mid,
        mitigated,
        description: 'Long upper wick sweep in Premium signaling aggressive sell-side rejection above candle bodies.',
        startIndex: i,
      });
      break;
    }
  }

  for (let i = candles.length - 2; i >= 2; i--) {
    const c = candles[i];
    const fullRange = Math.max(c.high - c.low, Math.pow(10, -digits));
    const lowerWick = Math.min(c.open, c.close) - c.low;
    const body = Math.abs(c.close - c.open);

    if (lowerWick >= fullRange * 0.48 && lowerWick >= body * 1.1 && c.low <= equilibrium) {
      const top = round(Math.min(c.open, c.close));
      const bottom = round(c.low);
      const mid = round((top + bottom) / 2);
      const mitigated = candles.slice(i + 1).some((k) => k.close < bottom);
      zones.push({
        type: 'Bullish Rejection',
        top,
        bottom,
        ceMid: mid,
        startIndex: i,
        endIndex: candles.length - 1,
        mitigated,
        pdZone: 'Discount',
      });
      pushPdArray({
        id: `bull-rej-${i}`,
        name: `Bullish Rejection Block (${bottom.toFixed(digits)} - ${top.toFixed(digits)})`,
        category: 'Rejection Block',
        direction: 'Bullish',
        zone: 'Discount',
        priority: 2,
        top,
        bottom,
        midpoint: mid,
        mitigated,
        description: 'Long lower wick sweep in Discount signaling institutional buying absorption below candle bodies.',
        startIndex: i,
      });
      break;
    }
  }

  // F. Breaker Blocks (Priority 6 — Failed Order Block / Broken Swing reclaimed in reverse)
  let foundBullBreaker = false;
  let foundBearBreaker = false;
  for (let i = candles.length - 4; i >= 3; i--) {
    const c = candles[i];
    const future = candles.slice(i + 1);
    // Bullish Breaker: down-swing high (up-close candle) that swept a low or resisted, then got displaced upward cleanly
    if (
      !foundBullBreaker &&
      c.close > c.open &&
      future.some((k) => k.close > c.high + atr * 0.35) &&
      candles[i - 1].low <= c.low
    ) {
      const mid = round((c.high + c.low) / 2);
      const pdZone = classifyPdZone(mid, equilibrium, eqTolerance);
      if (pdZone !== 'Premium' || !bullishBias) {
        const mitigated = candles.slice(i + 2).some((k) => k.close < c.low);
        zones.push({
          type: 'Bullish Breaker',
          top: round(c.high),
          bottom: round(c.low),
          ceMid: mid,
          startIndex: i,
          endIndex: candles.length - 1,
          mitigated,
          pdZone,
        });
        pushPdArray({
          id: `bull-brk-${i}`,
          name: `Bullish Breaker Block (${mid.toFixed(digits)})`,
          category: 'Breaker Block',
          direction: 'Bullish',
          zone: pdZone,
          priority: 6,
          top: c.high,
          bottom: c.low,
          midpoint: mid,
          mitigated,
          description: 'Failed bearish swing candle broken upward with displacement; flips resistance into institutional support.',
          startIndex: i,
        });
        foundBullBreaker = true;
      }
    }

    // Bearish Breaker: up-swing low (down-close candle) broken downward with displacement
    if (
      !foundBearBreaker &&
      c.close < c.open &&
      future.some((k) => k.close < c.low - atr * 0.35) &&
      candles[i - 1].high >= c.high
    ) {
      const mid = round((c.high + c.low) / 2);
      const pdZone = classifyPdZone(mid, equilibrium, eqTolerance);
      if (pdZone !== 'Discount' || bullishBias) {
        const mitigated = candles.slice(i + 2).some((k) => k.close > c.high);
        zones.push({
          type: 'Bearish Breaker',
          top: round(c.high),
          bottom: round(c.low),
          ceMid: mid,
          startIndex: i,
          endIndex: candles.length - 1,
          mitigated,
          pdZone,
        });
        pushPdArray({
          id: `bear-brk-${i}`,
          name: `Bearish Breaker Block (${mid.toFixed(digits)})`,
          category: 'Breaker Block',
          direction: 'Bearish',
          zone: pdZone,
          priority: 6,
          top: c.high,
          bottom: c.low,
          midpoint: mid,
          mitigated,
          description: 'Failed bullish swing candle broken downward with displacement; flips support into overhead supply.',
          startIndex: i,
        });
        foundBearBreaker = true;
      }
    }
    if (foundBullBreaker && foundBearBreaker) break;
  }

  // G. Mitigation Blocks (Priority 7 — Failure swing block after structure shift)
  if (swingHighs.length >= 2) {
    const prevH = swingHighs[swingHighs.length - 2];
    const lastH = swingHighs[swingHighs.length - 1];
    if (lastH.price < prevH.price) {
      const c = candles[lastH.index];
      const mid = round((c.high + c.low) / 2);
      const pdZone = classifyPdZone(mid, equilibrium, eqTolerance);
      pushPdArray({
        id: `bear-mit-${lastH.index}`,
        name: `Bearish Mitigation Block (${mid.toFixed(digits)})`,
        category: 'Mitigation Block',
        direction: 'Bearish',
        zone: pdZone,
        priority: 7,
        top: c.high,
        bottom: c.low,
        midpoint: mid,
        mitigated: candles.slice(lastH.index + 1).some((k) => k.close > c.high),
        description: 'Lower-high failure swing block where smart money clears trapped longs before distribution.',
        startIndex: lastH.index,
      });
    }
  }
  if (swingLows.length >= 2) {
    const prevL = swingLows[swingLows.length - 2];
    const lastL = swingLows[swingLows.length - 1];
    if (lastL.price > prevL.price) {
      const c = candles[lastL.index];
      const mid = round((c.high + c.low) / 2);
      const pdZone = classifyPdZone(mid, equilibrium, eqTolerance);
      pushPdArray({
        id: `bull-mit-${lastL.index}`,
        name: `Bullish Mitigation Block (${mid.toFixed(digits)})`,
        category: 'Mitigation Block',
        direction: 'Bullish',
        zone: pdZone,
        priority: 7,
        top: c.high,
        bottom: c.low,
        midpoint: mid,
        mitigated: candles.slice(lastL.index + 1).some((k) => k.close < c.low),
        description: 'Higher-low failure swing block mitigating short drawdown before markup.',
        startIndex: lastL.index,
      });
    }
  }

  // H. Liquidity Void (Priority 5 — High-velocity displacement candle >= 1.55 * ATR)
  for (let i = candles.length - 2; i >= 2; i--) {
    const c = candles[i];
    const full = Math.max(c.high - c.low, Math.pow(10, -digits));
    const body = Math.abs(c.close - c.open);
    if (body >= atr * 1.55 && body / full >= 0.7) {
      const top = round(Math.max(c.open, c.close));
      const bottom = round(Math.min(c.open, c.close));
      const mid = round((top + bottom) / 2);
      const pdZone = classifyPdZone(mid, equilibrium, eqTolerance);
      const isBullVoid = c.close > c.open;
      zones.push({
        type: 'Liquidity Void',
        top,
        bottom,
        ceMid: mid,
        startIndex: i,
        endIndex: candles.length - 1,
        mitigated: false,
        pdZone,
      });
      pushPdArray({
        id: `liq-void-${i}`,
        name: `${isBullVoid ? 'Bullish' : 'Bearish'} Liquidity Void (${mid.toFixed(digits)})`,
        category: 'Liquidity Void',
        direction: isBullVoid ? 'Bullish' : 'Bearish',
        zone: pdZone,
        priority: 5,
        top,
        bottom,
        midpoint: mid,
        mitigated: false,
        description: 'Wide single-print institutional repricing range with minimal counter-liquidity.',
        startIndex: i,
      });
      break;
    }
  }

  // 6. Optimal Trade Entry (OTE 0.618, 0.705, 0.786) reference inside Discount (Long) or Premium (Short)
  const fib618 = round(bullishBias ? rangeHigh - dealingSpan * 0.618 : rangeLow + dealingSpan * 0.618);
  const fib705 = round(bullishBias ? rangeHigh - dealingSpan * 0.705 : rangeLow + dealingSpan * 0.705);
  const fib786 = round(bullishBias ? rangeHigh - dealingSpan * 0.786 : rangeLow + dealingSpan * 0.786);
  const oteZone: 'Premium' | 'Discount' = bullishBias ? 'Discount' : 'Premium';

  // 7. Strict Institutional Confluence Gate & 3-State Trade Verdict
  // 4 Hard "No Trade" Blockers + 1 Positioning Gate (Wait for Setup vs Actionable Trade)
  const MIN_REAL_RR_TO_DOL = 2.5;
  const ENTRY_APPROACH_ATR_MULT = 2.0;

  const hasMss = Boolean(mssBullishCandle || mssBearishCandle);
  const mssDirection: 'Bullish' | 'Bearish' | null = mssBullishCandle
    ? 'Bullish'
    : mssBearishCandle
    ? 'Bearish'
    : null;
  const mssBarIndex = mssBullishCandle?.index ?? mssBearishCandle?.index ?? null;

  // Hard Gate 1: Structure Shift (MSS) or Institutional Displacement
  const passMssOrDisplacement = hasMss || displacementDetected;

  // Hard Gate 2: Chronological Signal Alignment
  // Only a conflict when an opposing Liquidity Sweep occurs AFTER (or on the same bar as) the MSS.
  // If a newer closed-candle MSS broke cleanly past an older sweep, the newer MSS supersedes it.
  const sweepSupersedesConflict =
    sweepIndex !== null && mssBarIndex !== null && sweepIndex < mssBarIndex;
  const signalsConflict = Boolean(
    mssDirection &&
      recentSweepBias &&
      mssDirection !== recentSweepBias &&
      !sweepSupersedesConflict
  );
  const passSignalAlignment = !signalsConflict;

  // Preferred directional zone
  const preferredArrayZone: 'Discount' | 'Premium' = bullishBias ? 'Discount' : 'Premium';
  const preferredDir: 'Bullish' | 'Bearish' = bullishBias ? 'Bullish' : 'Bearish';

  // External Draw on Liquidity (real market liquidity pool — never artificially padded)
  const drawOnLiquidity: IctAnalysisResult['drawOnLiquidity'] = bullishBias
    ? {
        label: equalHighsLevel ? 'Equal Highs / External BSL' : 'Old High / External BSL',
        price: bslLevel,
        side: 'BSL (Premium)',
      }
    : {
        label: equalLowsLevel ? 'Equal Lows / External SSL' : 'Old Low / External SSL',
        price: sslLevel,
        side: 'SSL (Discount)',
      };

  // Hard Gate 3: Clean Unmitigated PD Array (FVG, OB, Breaker, or Rejection Block) strictly in Discount (Longs) or Premium (Shorts)
  // NO fallback to 0.705 OTE fib when no genuine unmitigated array exists in zone.
  const ALLOWED_ENTRY_CATEGORIES: ReadonlySet<PdArrayCategory> = new Set([
    'Fair Value Gap (FVG)',
    'Order Block (OB)',
    'Breaker Block',
    'Rejection Block',
  ]);

  const candidateArrays = pdArrays
    .filter(
      (a) =>
        a.direction === preferredDir &&
        a.zone === preferredArrayZone &&
        ALLOWED_ENTRY_CATEGORIES.has(a.category) &&
        a.status !== 'Mitigated' &&
        (bullishBias ? a.midpoint <= equilibrium : a.midpoint >= equilibrium)
    )
    .sort((a, b) => {
      const rankWeight = (cat: PdArrayCategory) => {
        if (cat === 'Fair Value Gap (FVG)') return 1;
        if (cat === 'Order Block (OB)') return 2;
        if (cat === 'Breaker Block') return 3;
        if (cat === 'Rejection Block') return 4;
        return 5;
      };
      return rankWeight(a.category) - rankWeight(b.category) || b.startIndex - a.startIndex;
    });

  const bestEntryArray = candidateArrays[0] ?? null;
  const passPdArrayInZone = Boolean(bestEntryArray);

  // Hard Gate 4: Real Risk:Reward to External Draw on Liquidity >= 1 : 2.5
  let candidateEntryMid: number | null = null;
  let candidateEntryZoneStr: string | null = null;
  let candidateEntryArrayName: string | null = null;
  let candidateStopLoss: number | null = null;
  let candidateTp1: number | null = null;
  let candidateTp2: number | null = null;
  let realRrToDol: number | null = null;

  if (bestEntryArray) {
    candidateEntryMid = bestEntryArray.midpoint;
    candidateEntryZoneStr = `${bestEntryArray.bottom.toFixed(digits)} - ${bestEntryArray.top.toFixed(digits)}`;
    candidateEntryArrayName = `${bestEntryArray.zone} ${bestEntryArray.category}`;

    // Anchor invalidation stop beyond the LOCAL structural swing protecting the entry PD Array leg
    const stopBuffer = Math.max(atr * 0.3, minStep * 0.25);
    const minRiskFloor = Math.max(atr * 1.0, Math.pow(10, -digits) * 3);

    const protectingSwing = bullishBias
      ? swingLows
          .filter(
            (s) =>
              s.price <= bestEntryArray.bottom &&
              Math.abs(s.index - bestEntryArray.startIndex) <= 14
          )
          .sort((a, b) => b.price - a.price)[0]
      : swingHighs
          .filter(
            (s) =>
              s.price >= bestEntryArray.top &&
              Math.abs(s.index - bestEntryArray.startIndex) <= 14
          )
          .sort((a, b) => a.price - b.price)[0];

    const structuralAnchor = bullishBias
      ? Math.min(bestEntryArray.bottom, protectingSwing ? protectingSwing.price : bestEntryArray.bottom) - stopBuffer
      : Math.max(bestEntryArray.top, protectingSwing ? protectingSwing.price : bestEntryArray.top) + stopBuffer;

    candidateStopLoss = round(
      bullishBias
        ? Math.min(structuralAnchor, candidateEntryMid - minRiskFloor)
        : Math.max(structuralAnchor, candidateEntryMid + minRiskFloor)
    );

    const riskDist = Math.abs(candidateEntryMid - candidateStopLoss);
    const realDolPrice = drawOnLiquidity.price;
    const rewardDistToDol = bullishBias
      ? realDolPrice - candidateEntryMid
      : candidateEntryMid - realDolPrice;

    if (riskDist > 0 && rewardDistToDol > 0) {
      realRrToDol = Number((rewardDistToDol / riskDist).toFixed(2));
      candidateTp2 = round(realDolPrice);

      // Realistic partial TP1: Equilibrium if it sits cleanly between entry and external DOL with >= 1.0R; otherwise 55% of move to DOL
      const eqReward = bullishBias ? equilibrium - candidateEntryMid : candidateEntryMid - equilibrium;
      const eqIsCleanPartial =
        eqReward >= riskDist * 1.0 &&
        (bullishBias ? equilibrium < candidateTp2 - riskDist * 0.35 : equilibrium > candidateTp2 + riskDist * 0.35);

      candidateTp1 = round(
        eqIsCleanPartial
          ? equilibrium
          : candidateEntryMid + (candidateTp2 - candidateEntryMid) * 0.55
      );
    } else {
      realRrToDol = 0;
    }
  }

  const passMinRrToDol =
    passPdArrayInZone && realRrToDol !== null && realRrToDol >= MIN_REAL_RR_TO_DOL;

  // Soft Positioning Check (50% Equilibrium OR Early 2.0x ATR Approach to Entry PD Array -> Actionable Trade)
  const distToBestEntry = bestEntryArray
    ? currentPrice >= bestEntryArray.bottom && currentPrice <= bestEntryArray.top
      ? 0
      : Math.min(Math.abs(currentPrice - bestEntryArray.top), Math.abs(currentPrice - bestEntryArray.bottom))
    : Infinity;
  const withinEarlyApproachBand = Boolean(
    bestEntryArray && distToBestEntry <= atr * ENTRY_APPROACH_ATR_MULT
  );

  const alignedWithBias =
    withinEarlyApproachBand ||
    (currentZone === 'Equilibrium'
      ? true
      : bullishBias
      ? currentZone === 'Discount'
      : currentZone === 'Premium');

  // Assemble explicit Confluence Gate Checklist & Hard No-Trade Reasons
  const noTradeReasons: string[] = [];

  const mssDetail = hasMss && displacementDetected
    ? `${structureShift} + institutional displacement confirmed.`
    : hasMss
    ? `${structureShift} confirmed.`
    : displacementDetected
    ? `Institutional displacement expansion detected on ${timeframe}.`
    : `No Market Structure Shift (MSS) or institutional displacement detected — market is in consolidation / chop.`;

  if (!passMssOrDisplacement) {
    noTradeReasons.push(mssDetail);
  }

  const alignmentDetail = passSignalAlignment
    ? mssDirection && recentSweepBias && mssDirection !== recentSweepBias && sweepSupersedesConflict
      ? `Newer ${mssDirection} MSS superseded earlier ${recentSweepBias} wick sweep — orderflow aligned.`
      : mssDirection && recentSweepBias
      ? `${recentSweepBias} liquidity sweep aligns cleanly with ${mssDirection} MSS.`
      : mssDirection
      ? `${mssDirection} MSS has no opposing liquidity sweep conflict.`
      : recentSweepBias
      ? `Recent ${recentSweepBias} liquidity sweep without conflicting counter-MSS.`
      : `No conflicting MSS vs. liquidity sweep signals.`
    : `Conflicting signals: fresh post-MSS ${recentSweepBias} liquidity sweep (${liquiditySweep}) opposes ${mssDirection} MSS.`;

  if (!passSignalAlignment) {
    noTradeReasons.push(alignmentDetail);
  }

  const pdArrayDetail = passPdArrayInZone && bestEntryArray
    ? `Unmitigated ${bestEntryArray.zone} ${bestEntryArray.category} mapped at ${candidateEntryZoneStr}.`
    : `No unmitigated ${preferredDir} PD Array (FVG, Order Block, Breaker, or Rejection Block) located in ${preferredArrayZone}.`;

  if (!passPdArrayInZone) {
    noTradeReasons.push(pdArrayDetail);
  }

  const rrDetail = !passPdArrayInZone
    ? `Cannot validate real R:R without an unmitigated ${preferredArrayZone} PD Array.`
    : realRrToDol !== null && realRrToDol >= MIN_REAL_RR_TO_DOL
    ? `Real R:R from entry to ${drawOnLiquidity.label} (${drawOnLiquidity.price.toFixed(digits)}) is 1 : ${realRrToDol.toFixed(2)} (meets >= 1 : ${MIN_REAL_RR_TO_DOL}).`
    : `Insufficient real R:R to ${drawOnLiquidity.label} (${drawOnLiquidity.price.toFixed(digits)}): 1 : ${(realRrToDol ?? 0).toFixed(2)} is below the 1 : ${MIN_REAL_RR_TO_DOL} minimum.`;

  if (!passMinRrToDol) {
    noTradeReasons.push(rrDetail);
  }

  const equilibriumDetail = alignedWithBias
    ? withinEarlyApproachBand &&
      currentZone !== 'Equilibrium' &&
      ((bullishBias && currentZone !== 'Discount') || (!bullishBias && currentZone !== 'Premium'))
      ? `Price (${currentPositionPct}%) is within ${ENTRY_APPROACH_ATR_MULT} ATR of the mapped ${preferredArrayZone} PD Array (${candidateEntryZoneStr}) — early Actionable signal.`
      : `Price (${currentPositionPct}%) is positioned in ${currentZone}, aligned for ${preferredDir} execution.`
    : `Price (${currentPositionPct}%) is in ${currentZone} (> ${ENTRY_APPROACH_ATR_MULT} ATR from ${preferredArrayZone} PD Array) — do NOT market-enter; wait for retracement.`;

  const confluenceChecks: IctConfluenceCheck[] = [
    {
      id: 'mss_displacement',
      label: 'Structure Shift (MSS) or Displacement',
      passed: passMssOrDisplacement,
      required: true,
      detail: mssDetail,
    },
    {
      id: 'signal_alignment',
      label: 'Liquidity Sweep & MSS Alignment',
      passed: passSignalAlignment,
      required: true,
      detail: alignmentDetail,
    },
    {
      id: 'pd_array_in_zone',
      label: `Unmitigated ${preferredArrayZone} PD Array`,
      passed: passPdArrayInZone,
      required: true,
      detail: pdArrayDetail,
    },
    {
      id: 'min_rr_dol',
      label: `Real R:R to Draw on Liquidity (>= 1:${MIN_REAL_RR_TO_DOL})`,
      passed: passMinRrToDol,
      required: true,
      detail: rrDetail,
    },
    {
      id: 'pd_equilibrium',
      label: '50% Equilibrium Positioning (Immediate vs Limit)',
      passed: alignedWithBias,
      required: false,
      detail: equilibriumDetail,
    },
  ];

  // Resolve 3-State Verdict
  let tradeVerdict: IctTradeVerdict;
  let verdictHeadline: string;
  let verdictSummary: string;

  if (noTradeReasons.length > 0) {
    tradeVerdict = 'No Trade';
    verdictHeadline = 'No Trade · Stand Aside';
    verdictSummary = `${noTradeReasons.length} required confluence gate${noTradeReasons.length > 1 ? 's' : ''} failed — execution parameters are locked to protect capital.`;
  } else if (!alignedWithBias) {
    tradeVerdict = 'Wait for Setup';
    verdictHeadline = `Wait for Setup · ${bullishBias ? 'Buy' : 'Sell'} Limit Only`;
    verdictSummary = `Structure, PD Array, and 1:${realRrToDol?.toFixed(2)} R:R align, but price is in ${currentZone}. Do not market-enter — wait for retracement into ${candidateEntryArrayName} (${candidateEntryZoneStr}).`;
  } else {
    tradeVerdict = 'Actionable Trade';
    verdictHeadline = `Actionable Trade · ${bullishBias ? 'Long (Buy)' : 'Short (Sell)'}`;
    verdictSummary = `All 4 institutional confluence gates passed with price in ${currentZone} and 1:${realRrToDol?.toFixed(2)} real R:R to ${drawOnLiquidity.label}.`;
  }

  const effectiveDailyBias: 'Bullish' | 'Bearish' | 'Neutral' =
    !passMssOrDisplacement || !passSignalAlignment
      ? 'Neutral'
      : bullishBias
      ? 'Bullish'
      : 'Bearish';

  const guidance =
    tradeVerdict === 'No Trade'
      ? `Stand Aside — ${noTradeReasons[0]}`
      : bullishBias
      ? alignedWithBias
        ? `Price is at ${currentPositionPct}% (${currentZone} vs 50% Equilibrium ${equilibrium.toFixed(digits)}) — aligned to execute ${candidateEntryArrayName} targeting BSL.`
        : `Price is at ${currentPositionPct}% (Premium above 50% Equilibrium ${equilibrium.toFixed(digits)}) — do NOT market-enter longs; wait for retracement into ${candidateEntryArrayName} (${candidateEntryZoneStr}).`
      : alignedWithBias
      ? `Price is at ${currentPositionPct}% (${currentZone} vs 50% Equilibrium ${equilibrium.toFixed(digits)}) — aligned to execute ${candidateEntryArrayName} targeting SSL.`
      : `Price is at ${currentPositionPct}% (Discount below 50% Equilibrium ${equilibrium.toFixed(digits)}) — do NOT market-enter shorts; wait for rally into ${candidateEntryArrayName} (${candidateEntryZoneStr}).`;

  // Tightened ICT Power of 3 (AMD) Phase Detection:
  // 1. Manipulation (Judas Swing): Fresh liquidity sweep within the last 6 bars before full mid-range expansion
  // 2. Accumulation: No MSS/displacement yet, or recent 6-bar range is tightly compressed
  // 3. Distribution: Confirmed MSS/displacement actively expanding away from origin toward Draw on Liquidity
  const lastIdx = candles.length - 1;
  const recent6 = candles.slice(-6);
  const recent6Range =
    recent6.length > 0
      ? Math.max(...recent6.map((c) => c.high)) - Math.min(...recent6.map((c) => c.low))
      : 0;
  const isCompressed = recent6Range <= atr * 2.2;

  const sweepBarsAgo = sweepIndex !== null ? lastIdx - sweepIndex : Infinity;
  const isFreshSweep = sweepIndex !== null && sweepBarsAgo <= 6;
  const sweepCandle = sweepIndex !== null ? candles[sweepIndex] : null;
  const mssBarIdx = mssBullishCandle?.index ?? mssBearishCandle?.index ?? null;
  const sweepExpansion =
    sweepCandle && recentSweepBias
      ? recentSweepBias === 'Bullish'
        ? currentPrice - sweepCandle.low
        : sweepCandle.high - currentPrice
      : 0;
  const alreadyExpandedAfterSweep =
    sweepIndex !== null &&
    mssBarIdx !== null &&
    mssBarIdx > sweepIndex &&
    sweepExpansion >= dealingSpan * 0.45;

  const anchor5Close = candles[Math.max(0, candles.length - 6)]?.close ?? currentPrice;
  const multiBarExpandingWithBias = bullishBias
    ? currentPrice > anchor5Close
    : currentPrice < anchor5Close;

  let po3Phase: IctAnalysisResult['po3Phase'];
  if (isFreshSweep && !alreadyExpandedAfterSweep) {
    po3Phase = 'Manipulation (Judas Swing)';
  } else if (!passMssOrDisplacement || isCompressed) {
    po3Phase = 'Accumulation';
  } else if (
    (hasMss && mssBarIdx !== null && lastIdx - mssBarIdx <= 12) ||
    multiBarExpandingWithBias
  ) {
    po3Phase = 'Distribution';
  } else {
    po3Phase = 'Accumulation';
  }

  const kz = getNewYorkKillzone();

  const confluences =
    tradeVerdict === 'No Trade'
      ? [
          `Verdict: NO TRADE (Stand Aside) — ${noTradeReasons.length} required confluence gate${noTradeReasons.length > 1 ? 's' : ''} failed`,
          ...noTradeReasons,
          `Dealing Range ${rangeLow.toFixed(digits)}–${rangeHigh.toFixed(digits)} · 50% Equilibrium at ${equilibrium.toFixed(digits)} (Price at ${currentPositionPct}%)`,
        ]
      : [
          `Verdict: ${verdictHeadline} — All 4 hard confluence gates passed`,
          `Dealing Range ${rangeLow.toFixed(digits)}–${rangeHigh.toFixed(digits)} · 50% Equilibrium at ${equilibrium.toFixed(digits)} (Price in ${currentZone} at ${currentPositionPct}%)`,
          `Active Setup Array: ${candidateEntryArrayName} (${candidateEntryZoneStr}) strictly in ${preferredArrayZone}`,
          `${structureShift}${displacementDetected ? ' + energetic institutional displacement confirmed' : ''}`,
          `${drawOnLiquidity.side} Draw on Liquidity at ${drawOnLiquidity.price.toFixed(digits)} (Real R:R 1 : ${realRrToDol?.toFixed(2)})`,
          `${kz.label} · Power of 3: ${po3Phase}`,
        ];

  // Sort PD Arrays: Premium highest-to-lowest, Discount lowest-to-highest, keeping top 16 clean entries
  const sortedPdArrays = pdArrays.sort((a, b) => a.priority - b.priority || b.midpoint - a.midpoint);

  // Curate top non-overlapping chart zones so SVG stays clean and legible
  const chartZones: IctZone[] = [];
  const preferredFvgs = (bullishBias ? bullishFvgs : bearishFvgs).filter((z) => !z.mitigated).slice(-2);
  chartZones.push(...preferredFvgs);
  const counterFvgs = (bullishBias ? bearishFvgs : bullishFvgs).filter((z) => !z.mitigated).slice(-1);
  chartZones.push(...counterFvgs);
  for (const z of zones) {
    if (
      (z.type === 'Bullish OB' ||
        z.type === 'Bearish OB' ||
        z.type === 'Bullish Breaker' ||
        z.type === 'Bearish Breaker' ||
        z.type === 'Bullish Rejection' ||
        z.type === 'Bearish Rejection' ||
        z.type === 'Liquidity Void') &&
      chartZones.length < 7
    ) {
      chartZones.push(z);
    }
  }

  // 8. Fractal Stateful Setup Lifecycle & Strict Closed-Candle Invalidation Lock
  let lastTransitionEvent: string | null = null;
  if (options?.forceReset) {
    if (lockedIctSetups.has(lockKey)) {
      lastTransitionEvent = `Manual re-evaluation triggered — cleared previous ${timeframe} lock and scanned closed candles.`;
    }
    lockedIctSetups.delete(lockKey);
  }

  let activeLock = lockedIctSetups.get(lockKey) ?? null;

  if (activeLock) {
    const newClosedBars = candles.filter((c) => c.timestampSec > activeLock!.lockedBarTimestampSec);
    const isLockedLong = activeLock.dailyBias === 'Bullish';

    // 1. STRICT CLOSED-CANDLE INVALIDATION CHECK (wick alone does NOT invalidate; requires full [TF] candle close beyond SL)
    const invalidatingBar = newClosedBars.find((c) =>
      isLockedLong ? c.close < activeLock!.stopLoss : c.close > activeLock!.stopLoss
    );

    // 2. EXTERNAL DRAW ON LIQUIDITY (TP2) COMPLETION CHECK
    const dolCompletedBar = newClosedBars.find((c) =>
      isLockedLong ? c.high >= activeLock!.tp2 : c.low <= activeLock!.tp2
    );

    // 3. CONFIRMED OPPOSING CLOSED-CANDLE MSS CHECK
    const mssCandleObj = mssBullishCandle ?? mssBearishCandle;
    const opposingClosedMss =
      Boolean(
        mssCandleObj &&
          mssDirection &&
          mssDirection !== activeLock.dailyBias &&
          mssCandleObj.timestampSec > activeLock.lockedBarTimestampSec
      );

    // 4. VISIBLE DEALING RANGE EXPIRY CHECK
    const expiredOffWindow = activeLock.lockedBarTimestampSec < candles[0].timestampSec;

    if (invalidatingBar) {
      lastTransitionEvent = `Previous ${activeLock.dailyBias} setup invalidated: ${timeframe} candle closed ${
        isLockedLong ? 'below' : 'above'
      } ${activeLock.stopLoss.toFixed(digits)} at ${invalidatingBar.time}.`;
      lockedIctSetups.delete(lockKey);
      activeLock = null;
    } else if (dolCompletedBar) {
      lastTransitionEvent = `Previous ${activeLock.dailyBias} setup completed: external DOL target ${activeLock.tp2.toFixed(
        digits
      )} reached at ${dolCompletedBar.time}.`;
      lockedIctSetups.delete(lockKey);
      activeLock = null;
    } else if (opposingClosedMss && mssCandleObj) {
      lastTransitionEvent = `Previous ${activeLock.dailyBias} setup unlocked by opposing ${mssDirection} ${timeframe} closed-candle MSS at ${mssCandleObj.time}.`;
      lockedIctSetups.delete(lockKey);
      activeLock = null;
    } else if (expiredOffWindow) {
      lastTransitionEvent = `Previous ${activeLock.dailyBias} setup aged outside the active ${timeframe} dealing range — re-evaluated.`;
      lockedIctSetups.delete(lockKey);
      activeLock = null;
    } else {
      // Lock holds! Check if price tapped the entry zone on any closed bar or live price
      const tappedNow =
        currentPrice >= activeLock.entryBottom - atr * 0.15 &&
        currentPrice <= activeLock.entryTop + atr * 0.15;
      const tappedClosed = newClosedBars.some(
        (c) => c.low <= activeLock!.entryTop && c.high >= activeLock!.entryBottom
      );
      if (tappedNow || tappedClosed) {
        activeLock.entryTapped = true;
      }
    }
  }

  // Helper to compute live proximity label for a valid locked setup
  const computeLiveProximity = (
    dirBias: 'Bullish' | 'Bearish',
    entryBottom: number,
    entryTop: number,
    entryMid: number,
    alignedNow: boolean,
    entryTapped: boolean
  ): IctSetupLifecycle['liveProximity'] => {
    const zonePad = Math.max(atr * 0.15, Math.pow(10, -digits) * 2);
    if (currentPrice >= entryBottom - zonePad && currentPrice <= entryTop + zonePad) {
      return 'In Entry Zone';
    }
    const movingTowardTarget =
      dirBias === 'Bullish' ? currentPrice > entryTop : currentPrice < entryBottom;
    if (entryTapped && movingTowardTarget) {
      return 'In Progress Toward TP1/TP2';
    }
    if (alignedNow) {
      return 'Approaching Entry';
    }
    return 'Waiting for Retracement';
  };

  // CASE A: Active Locked Setup Holds Steady (Zero bias/level flickering across ticks)
  if (activeLock) {
    const isLockedLong = activeLock.dailyBias === 'Bullish';
    const lockSpan = Math.max(activeLock.rangeHigh - activeLock.rangeLow, minStep);
    const lockPosPct = Number(
      Math.min(100, Math.max(0, ((currentPrice - activeLock.rangeLow) / lockSpan) * 100)).toFixed(1)
    );
    const lockEqTol = lockSpan * 0.025;
    const lockCurrentZone = classifyPdZone(currentPrice, activeLock.equilibrium, lockEqTol);

    let lockQuadrant: PremiumDiscountProfile['quadrant'] = 'Equilibrium (50%)';
    if (lockPosPct >= 75) lockQuadrant = 'Deep Premium (75-100%)';
    else if (lockPosPct > 52.5) lockQuadrant = 'Upper Premium (50-75%)';
    else if (lockPosPct <= 25) lockQuadrant = 'Deep Discount (0-25%)';
    else if (lockPosPct < 47.5) lockQuadrant = 'Upper Discount (25-50%)';

    const inEntryZoneNow =
      currentPrice >= activeLock.entryBottom - atr * 0.15 &&
      currentPrice <= activeLock.entryTop + atr * 0.15;

    const distToLockedEntry =
      currentPrice >= activeLock.entryBottom && currentPrice <= activeLock.entryTop
        ? 0
        : Math.min(
            Math.abs(currentPrice - activeLock.entryTop),
            Math.abs(currentPrice - activeLock.entryBottom)
          );
    const withinLockedApproach = distToLockedEntry <= atr * ENTRY_APPROACH_ATR_MULT;
    const farFromLockedEntry = distToLockedEntry > atr * (ENTRY_APPROACH_ATR_MULT + 0.5);

    // Hysteresis around 50% Equilibrium & 2.0x ATR early-approach band prevents Wait <-> Actionable bouncing
    let lockedVerdict: 'Actionable Trade' | 'Wait for Setup' = activeLock.lastVerdict;
    if (activeLock.lastVerdict === 'Wait for Setup') {
      if (
        inEntryZoneNow ||
        withinLockedApproach ||
        (isLockedLong ? lockPosPct <= 48.0 : lockPosPct >= 52.0)
      ) {
        lockedVerdict = 'Actionable Trade';
      }
    } else {
      if (
        !inEntryZoneNow &&
        !activeLock.entryTapped &&
        farFromLockedEntry &&
        (isLockedLong ? lockPosPct >= 55.0 : lockPosPct <= 45.0)
      ) {
        lockedVerdict = 'Wait for Setup';
      }
    }
    activeLock.lastVerdict = lockedVerdict;
    const lockAligned = lockedVerdict === 'Actionable Trade';

    const liveProximity = computeLiveProximity(
      activeLock.dailyBias,
      activeLock.entryBottom,
      activeLock.entryTop,
      activeLock.entryMid,
      lockAligned,
      activeLock.entryTapped
    );

    const lockedHeadline =
      lockedVerdict === 'Actionable Trade'
        ? `Actionable Trade · ${activeLock.direction}`
        : `Wait for Setup · ${isLockedLong ? 'Buy' : 'Sell'} Limit Only`;

    const lockedSummary =
      lockedVerdict === 'Actionable Trade'
        ? `Locked ${activeLock.dailyBias} ${timeframe} setup (confirmed on ${activeLock.lockedBarTime} close) — holds until a ${timeframe} candle closes ${
            isLockedLong ? 'below' : 'above'
          } ${activeLock.stopLoss.toFixed(digits)} or hits DOL ${activeLock.tp2.toFixed(digits)}.`
        : `Locked ${activeLock.dailyBias} ${timeframe} limit setup (confirmed on ${activeLock.lockedBarTime} close) — wait for retracement into ${activeLock.entryArrayName} (${activeLock.entryZone}). Invalidated only on a ${timeframe} candle close ${
            isLockedLong ? 'below' : 'above'
          } ${activeLock.stopLoss.toFixed(digits)}.`;

    const lockedChecks: IctConfluenceCheck[] = activeLock.confluenceChecks.map((chk) =>
      chk.id === 'pd_equilibrium'
        ? {
            ...chk,
            passed: lockAligned,
            detail: lockAligned
              ? `Price (${lockPosPct}%) is aligned in ${lockCurrentZone} for ${activeLock!.dailyBias} execution (${liveProximity}).`
              : `Price (${lockPosPct}%) is in ${lockCurrentZone} — locked ${activeLock!.dailyBias} bias holds; wait for retracement into ${activeLock!.entryZone}.`,
          }
        : chk
    );

    const lockedGuidance = lockAligned
      ? `Locked ${activeLock.dailyBias} setup active (${liveProximity}) — strictly invalidated only if a ${timeframe} candle closes ${
          isLockedLong ? 'below' : 'above'
        } ${activeLock.stopLoss.toFixed(digits)}.`
      : `Locked ${activeLock.dailyBias} bias — do NOT market-enter in ${lockCurrentZone}; wait for retracement into ${activeLock.entryArrayName} (${activeLock.entryZone}).`;

    const lifecycle: IctSetupLifecycle = {
      status: lockedVerdict === 'Actionable Trade' ? 'Locked Active' : 'Locked Waiting',
      isLocked: true,
      lockedAt: activeLock.lockedAt,
      lockedBarTime: activeLock.lockedBarTime,
      lockedBarTimestampSec: activeLock.lockedBarTimestampSec,
      lastClosedBarTime: lastClosedCandle.time,
      invalidationLevel: activeLock.stopLoss,
      invalidationRule: `Strict ${timeframe} candle close ${
        isLockedLong ? 'below' : 'above'
      } ${activeLock.stopLoss.toFixed(digits)} invalidates ${activeLock.dailyBias} setup`,
      validationLevel: activeLock.entryMid,
      validationZone: activeLock.entryZone,
      validationRule:
        lockedVerdict === 'Actionable Trade'
          ? `Validated in ${activeLock.entryArrayName} (${activeLock.entryZone}) · ${liveProximity}`
          : `Limit trigger armed at ${activeLock.entryArrayName} (${activeLock.entryZone})`,
      targetDolLevel: activeLock.tp2,
      liveProximity,
      lastTransitionEvent: null,
      fractalRole: tfCfg.fractalRole,
    };

    return {
      symbol: tvData.symbol,
      tvSymbol: tvData.tvSymbol,
      tradingViewUrl: `https://www.tradingview.com/chart/?symbol=${encodeURIComponent(tvData.tvSymbol)}`,
      timeframe,
      currentPrice,
      bid: tvData.bid,
      ask: tvData.ask,
      changePct: tvData.chgPct,
      dailyBias: activeLock.dailyBias,
      tradeVerdict: lockedVerdict,
      verdictHeadline: lockedHeadline,
      verdictSummary: lockedSummary,
      noTradeReasons: [],
      confluenceChecks: lockedChecks,
      lifecycle,
      po3Phase,
      activeKillzone: kz.label,
      structureShift: activeLock.structureShift,
      mssIndex: mssBullishCandle?.index ?? mssBearishCandle?.index ?? null,
      displacementDetected,
      liquiditySweep,
      sweepIndex,
      drawOnLiquidity: activeLock.drawOnLiquidity,
      bslLevel: activeLock.rangeHigh,
      sslLevel: activeLock.rangeLow,
      equalHighsLevel,
      equalLowsLevel,
      premiumDiscount: {
        rangeHigh: activeLock.rangeHigh,
        rangeLow: activeLock.rangeLow,
        equilibrium: activeLock.equilibrium,
        premiumStart: activeLock.equilibrium,
        discountEnd: activeLock.equilibrium,
        currentPositionPct: lockPosPct,
        currentZone: lockCurrentZone,
        quadrant: lockQuadrant,
        alignedWithBias: lockAligned,
        guidance: lockedGuidance,
      },
      pdArrays: sortedPdArrays.slice(0, 16),
      oteLevels: {
        fib618,
        fib705,
        fib786,
        zone: isLockedLong ? 'Discount' : 'Premium',
      },
      zones: chartZones,
      setup: {
        direction: activeLock.direction,
        entryZone: activeLock.entryZone,
        entryArrayName: activeLock.entryArrayName,
        stopLoss: activeLock.stopLoss,
        tp1: activeLock.tp1,
        tp2: activeLock.tp2,
        rrRatio: activeLock.rrRatio,
        projectedRrToDol: activeLock.rrRatio,
        confluences: [
          `LOCKED ${timeframe} SETUP (confirmed on ${activeLock.lockedBarTime} close) · ${liveProximity}`,
          `Strict Invalidation: ${timeframe} candle close ${
            isLockedLong ? 'below' : 'above'
          } ${activeLock.stopLoss.toFixed(digits)}`,
          `Anchor PD Array: ${activeLock.entryArrayName} (${activeLock.entryZone})`,
          `${activeLock.drawOnLiquidity.side} Draw on Liquidity at ${activeLock.tp2.toFixed(
            digits
          )} (Real R:R 1 : ${activeLock.rrRatio.toFixed(2)})`,
          `${kz.label} · Power of 3: ${po3Phase}`,
        ],
      },
      candles: allCandles,
      ictReferenceChannel: ictChannelId,
      dataSource: 'tradingview_live',
      lastUpdated: tvData.fetchedAt,
    };
  }

  // CASE B: No Existing Lock — Evaluate Fresh Closed-Candle Structure & Lock If Valid
  const isTradeLocked = tradeVerdict === 'No Trade';
  const freshStructureLabel = hasMss
    ? structureShift
    : displacementDetected
    ? `${bullishBias ? 'Bullish' : 'Bearish'} Displacement Expansion (${timeframe})`
    : `Consolidation / No MSS (${timeframe})`;

  let freshLifecycle: IctSetupLifecycle;

  if (
    tradeVerdict !== 'No Trade' &&
    bestEntryArray &&
    candidateEntryZoneStr &&
    candidateEntryArrayName &&
    candidateEntryMid != null &&
    candidateStopLoss != null &&
    candidateTp1 != null &&
    candidateTp2 != null &&
    realRrToDol != null
  ) {
    const lockedBias: 'Bullish' | 'Bearish' = bullishBias ? 'Bullish' : 'Bearish';
    const lockedDir: 'Long (Buy)' | 'Short (Sell)' = bullishBias ? 'Long (Buy)' : 'Short (Sell)';
    const initialTapped =
      currentPrice >= bestEntryArray.bottom - atr * 0.15 &&
      currentPrice <= bestEntryArray.top + atr * 0.15;

    const newLock: LockedIctSetup = {
      lockedAt: tvData.fetchedAt,
      lockedBarTime: lastClosedCandle.time,
      lockedBarTimestampSec: lastClosedCandle.timestampSec,
      dailyBias: lockedBias,
      direction: lockedDir,
      entryZone: candidateEntryZoneStr,
      entryArrayName: candidateEntryArrayName,
      entryTop: bestEntryArray.top,
      entryBottom: bestEntryArray.bottom,
      entryMid: candidateEntryMid,
      stopLoss: candidateStopLoss,
      tp1: candidateTp1,
      tp2: candidateTp2,
      rrRatio: realRrToDol,
      drawOnLiquidity,
      rangeHigh,
      rangeLow,
      equilibrium,
      structureShift: freshStructureLabel,
      confluenceChecks,
      lastVerdict: tradeVerdict,
      entryTapped: initialTapped,
    };
    lockedIctSetups.set(lockKey, newLock);

    const liveProximity = computeLiveProximity(
      lockedBias,
      bestEntryArray.bottom,
      bestEntryArray.top,
      candidateEntryMid,
      alignedWithBias,
      initialTapped
    );

    freshLifecycle = {
      status: tradeVerdict === 'Actionable Trade' ? 'Locked Active' : 'Locked Waiting',
      isLocked: true,
      lockedAt: tvData.fetchedAt,
      lockedBarTime: lastClosedCandle.time,
      lockedBarTimestampSec: lastClosedCandle.timestampSec,
      lastClosedBarTime: lastClosedCandle.time,
      invalidationLevel: candidateStopLoss,
      invalidationRule: `Strict ${timeframe} candle close ${
        bullishBias ? 'below' : 'above'
      } ${candidateStopLoss.toFixed(digits)} invalidates ${lockedBias} setup`,
      validationLevel: candidateEntryMid,
      validationZone: candidateEntryZoneStr,
      validationRule:
        tradeVerdict === 'Actionable Trade'
          ? `Validated in ${candidateEntryArrayName} (${candidateEntryZoneStr}) · ${liveProximity}`
          : `Limit trigger armed at ${candidateEntryArrayName} (${candidateEntryZoneStr})`,
      targetDolLevel: candidateTp2,
      liveProximity,
      lastTransitionEvent,
      fractalRole: tfCfg.fractalRole,
    };
  } else {
    freshLifecycle = {
      status: 'Unlocked (No Trade)',
      isLocked: false,
      lockedAt: null,
      lockedBarTime: null,
      lockedBarTimestampSec: null,
      lastClosedBarTime: lastClosedCandle.time,
      invalidationLevel: null,
      invalidationRule: `No active bias locked — waiting for clean ${timeframe} closed-candle structure`,
      validationLevel: null,
      validationZone: null,
      validationRule: `Unlocks a setup only when a closed ${timeframe} candle passes all 4 confluence gates (>= 1:2.5 R:R)`,
      targetDolLevel: null,
      liveProximity: 'Stand Aside',
      lastTransitionEvent,
      fractalRole: tfCfg.fractalRole,
    };
  }

  return {
    symbol: tvData.symbol,
    tvSymbol: tvData.tvSymbol,
    tradingViewUrl: `https://www.tradingview.com/chart/?symbol=${encodeURIComponent(tvData.tvSymbol)}`,
    timeframe,
    currentPrice,
    bid: tvData.bid,
    ask: tvData.ask,
    changePct: tvData.chgPct,
    dailyBias: effectiveDailyBias,
    tradeVerdict,
    verdictHeadline,
    verdictSummary,
    noTradeReasons,
    confluenceChecks,
    lifecycle: freshLifecycle,
    po3Phase,
    activeKillzone: kz.label,
    structureShift: freshStructureLabel,
    mssIndex: mssBullishCandle?.index ?? mssBearishCandle?.index ?? null,
    displacementDetected,
    liquiditySweep,
    sweepIndex,
    drawOnLiquidity,
    bslLevel,
    sslLevel,
    equalHighsLevel,
    equalLowsLevel,
    premiumDiscount: {
      rangeHigh,
      rangeLow,
      equilibrium,
      premiumStart: equilibrium,
      discountEnd: equilibrium,
      currentPositionPct,
      currentZone,
      quadrant,
      alignedWithBias,
      guidance,
    },
    pdArrays: sortedPdArrays.slice(0, 16),
    oteLevels: {
      fib618,
      fib705,
      fib786,
      zone: oteZone,
    },
    zones: chartZones,
    setup: {
      direction: isTradeLocked ? 'No Trade' : bullishBias ? 'Long (Buy)' : 'Short (Sell)',
      entryZone: isTradeLocked ? null : candidateEntryZoneStr,
      entryArrayName: isTradeLocked ? null : candidateEntryArrayName,
      stopLoss: isTradeLocked ? null : candidateStopLoss,
      tp1: isTradeLocked ? null : candidateTp1,
      tp2: isTradeLocked ? null : candidateTp2,
      rrRatio: isTradeLocked ? null : realRrToDol,
      projectedRrToDol: realRrToDol,
      confluences,
    },
    candles: allCandles,
    ictReferenceChannel: ictChannelId,
    dataSource: 'tradingview_live',
    lastUpdated: tvData.fetchedAt,
  };
}
