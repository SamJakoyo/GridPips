import { fetchTradingViewChartData, type TvInterval } from './tradingViewFeed.ts';

export interface Candle {
  index: number;
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

export interface IctAnalysisResult {
  symbol: string;
  tvSymbol: string;
  tradingViewUrl: string;
  timeframe: string;
  currentPrice: number;
  bid: number | null;
  ask: number | null;
  changePct: number | null;
  dailyBias: 'Bullish' | 'Bearish';
  po3Phase: 'Accumulation' | 'Manipulation (Judas Swing)' | 'Distribution';
  activeKillzone: string;
  structureShift: string;
  displacementDetected: boolean;
  liquiditySweep: string;
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
    direction: 'Long (Buy)' | 'Short (Sell)';
    entryZone: string;
    entryArrayName: string;
    stopLoss: number;
    tp1: number;
    tp2: number;
    rrRatio: number;
    confluences: string[];
  };
  candles: Candle[];
  ictReferenceChannel: string;
  dataSource: 'tradingview_live';
  lastUpdated: string;
}

const VALID_TIMEFRAMES = ['1M', '5M', '15M', '30M', '1H', '4H', '1D', '1W'] as const;
type ValidTimeframe = (typeof VALID_TIMEFRAMES)[number];

const TF_CONFIG: Record<
  ValidTimeframe,
  {
    tvInterval: TvInterval;
    label: string;
  }
> = {
  '1M': { tvInterval: '1', label: '1-Minute Precision Entry' },
  '5M': { tvInterval: '5', label: '5-Minute Intraday Displacement' },
  '15M': { tvInterval: '15', label: '15-Minute Session Structure' },
  '30M': { tvInterval: '30', label: '30-Minute Killzone Framework' },
  '1H': { tvInterval: '60', label: '1-Hour Institutional Orderflow' },
  '4H': { tvInterval: '240', label: '4-Hour Intermediate Swing' },
  '1D': { tvInterval: 'D', label: 'Daily HTF Draw on Liquidity' },
  '1W': { tvInterval: 'W', label: 'Weekly Macro Liquidity Bias' },
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
  ictChannelId: string
): Promise<IctAnalysisResult> {
  const cleanSymbol = (symbolRaw || 'EURUSD').trim().toUpperCase();
  const timeframe = normalizeServerTimeframe(timeframeRaw);
  const tfCfg = TF_CONFIG[timeframe];

  // Fetch real live OHLC bars and current price directly from TradingView
  const tvData = await fetchTradingViewChartData(cleanSymbol, tfCfg.tvInterval);
  const digits = tvData.digits;
  const round = (n: number) => Number(n.toFixed(digits));

  const candles: Candle[] = tvData.bars.map((b, idx) => ({
    index: idx,
    time: formatCandleTime(b.timestampSec, timeframe),
    open: b.open,
    high: b.high,
    low: b.low,
    close: b.close,
  }));

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

  // Liquidity Sweep check (Turtle Soup / Stop Run)
  let liquiditySweep = 'No recent external stop run detected';
  let recentSweepBias: 'Bullish' | 'Bearish' | null = null;
  for (let i = candles.length - 1; i >= Math.max(3, candles.length - 10); i--) {
    const c = candles[i];
    const prevSwingsH = swingHighs.filter((s) => s.index < i - 1);
    const prevSwingsL = swingLows.filter((s) => s.index < i - 1);
    const prevHigh = prevSwingsH[prevSwingsH.length - 1];
    const prevLow = prevSwingsL[prevSwingsL.length - 1];

    if (prevLow && c.low < prevLow.price && c.close > prevLow.price) {
      liquiditySweep = `SSL Stop Hunt below ${prevLow.price.toFixed(digits)} reclaimed at ${c.time}`;
      recentSweepBias = 'Bullish';
      break;
    }
    if (prevHigh && c.high > prevHigh.price && c.close < prevHigh.price) {
      liquiditySweep = `BSL Stop Hunt above ${prevHigh.price.toFixed(digits)} rejected at ${c.time}`;
      recentSweepBias = 'Bearish';
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

  // Add top 2 most relevant Bullish FVGs & top 2 Bearish FVGs into PD Array Matrix
  const pickBestFvgs = (list: IctZone[]) => {
    const unmit = list.filter((f) => !f.mitigated).slice(-2);
    if (unmit.length > 0) return unmit;
    return list.slice(-1);
  };
  for (const fvg of pickBestFvgs(bullishFvgs)) {
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
  for (const fvg of pickBestFvgs(bearishFvgs)) {
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

  // D. Bullish & Bearish Order Blocks (Priority 3)
  let bullObCandle: Candle | null = null;
  let bearObCandle: Candle | null = null;

  for (let i = candles.length - 3; i >= 2; i--) {
    const c = candles[i];
    const next1 = candles[i + 1];
    const next2 = candles[i + 2];
    const nextDisplacement =
      Math.abs(next1.close - next1.open) >= atr * 0.7 ||
      Math.abs(next2.close - next2.open) >= atr * 0.7;

    if (!bullObCandle && c.close < c.open && next1.close > c.high && nextDisplacement) {
      bullObCandle = c;
    }
    if (!bearObCandle && c.close > c.open && next1.close < c.low && nextDisplacement) {
      bearObCandle = c;
    }
    if (bullObCandle && bearObCandle) break;
  }

  // Fallbacks so an OB is always located on active direction
  if (!bullObCandle) {
    const downCandles = candles.slice(2, -2).filter((c) => c.close < c.open);
    if (downCandles.length > 0) {
      bullObCandle = downCandles.reduce((best, cur) =>
        cur.low < best.low ? cur : best
      );
    }
  }
  if (!bearObCandle) {
    const upCandles = candles.slice(2, -2).filter((c) => c.close > c.open);
    if (upCandles.length > 0) {
      bearObCandle = upCandles.reduce((best, cur) =>
        cur.high > best.high ? cur : best
      );
    }
  }

  if (bullObCandle) {
    const mid = round((bullObCandle.high + bullObCandle.low) / 2);
    const pdZone = classifyPdZone(mid, equilibrium, eqTolerance);
    const mitigated = candles.slice(bullObCandle.index + 2).some((k) => k.close < bullObCandle!.low);
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

  if (bearObCandle) {
    const mid = round((bearObCandle.high + bearObCandle.low) / 2);
    const pdZone = classifyPdZone(mid, equilibrium, eqTolerance);
    const mitigated = candles.slice(bearObCandle.index + 2).some((k) => k.close > bearObCandle!.high);
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

  // 6. Optimal Trade Entry (OTE 0.618, 0.705, 0.786) strictly inside Discount (Long) or Premium (Short)
  const fib618 = round(bullishBias ? rangeHigh - dealingSpan * 0.618 : rangeLow + dealingSpan * 0.618);
  const fib705 = round(bullishBias ? rangeHigh - dealingSpan * 0.705 : rangeLow + dealingSpan * 0.705);
  const fib786 = round(bullishBias ? rangeHigh - dealingSpan * 0.786 : rangeLow + dealingSpan * 0.786);
  const oteZone: 'Premium' | 'Discount' = bullishBias ? 'Discount' : 'Premium';

  // 7. Strict Institutional Delivery Alignment & Entry Selection
  // Bullish Bias MUST anchor entries in Discount (<50%); Bearish Bias MUST anchor entries in Premium (>50%).
  const alignedWithBias =
    currentZone === 'Equilibrium'
      ? true
      : bullishBias
      ? currentZone === 'Discount'
      : currentZone === 'Premium';

  const guidance = bullishBias
    ? currentZone === 'Discount'
      ? `Price is at ${currentPositionPct}% (Discount below 50% Equilibrium ${equilibrium.toFixed(digits)}) — prime institutional zone to execute Bullish PD Arrays targeting BSL.`
      : `Price is at ${currentPositionPct}% (Premium above 50% Equilibrium ${equilibrium.toFixed(digits)}) — do NOT chase longs in Premium; wait for retracement into Discount PD Arrays / OTE.`
    : currentZone === 'Premium'
    ? `Price is at ${currentPositionPct}% (Premium above 50% Equilibrium ${equilibrium.toFixed(digits)}) — prime institutional zone to execute Bearish PD Arrays targeting SSL.`
    : `Price is at ${currentPositionPct}% (Discount below 50% Equilibrium ${equilibrium.toFixed(digits)}) — do NOT chase shorts in Discount; wait for rally into Premium PD Arrays / OTE.`;

  const preferredArrayZone = bullishBias ? 'Discount' : 'Premium';
  const preferredDir = bullishBias ? 'Bullish' : 'Bearish';

  // Pick best unmitigated PD Array strictly in the right Premium/Discount half (preferring FVG -> OB -> Breaker -> Rejection)
  const candidateArrays = pdArrays
    .filter(
      (a) =>
        a.direction === preferredDir &&
        (a.zone === preferredArrayZone || a.zone === 'Equilibrium') &&
        a.category !== 'Old High / BSL' &&
        a.category !== 'Old Low / SSL' &&
        a.category !== 'Equal Highs (EQH)' &&
        a.category !== 'Equal Lows (EQL)' &&
        a.status !== 'Mitigated'
    )
    .sort((a, b) => {
      const rankWeight = (cat: PdArrayCategory) => {
        if (cat === 'Fair Value Gap (FVG)') return 1;
        if (cat === 'Order Block (OB)') return 2;
        if (cat === 'Breaker Block') return 3;
        if (cat === 'Rejection Block') return 4;
        return 5;
      };
      return rankWeight(a.category) - rankWeight(b.category);
    });

  const bestEntryArray =
    candidateArrays.find((a) => (bullishBias ? a.midpoint <= equilibrium : a.midpoint >= equilibrium)) ||
    candidateArrays[0];

  let entryMid = bestEntryArray ? bestEntryArray.midpoint : fib705;
  let entryZoneStr = bestEntryArray
    ? `${bestEntryArray.bottom.toFixed(digits)} - ${bestEntryArray.top.toFixed(digits)}`
    : `${Math.min(fib786, fib618).toFixed(digits)} - ${Math.max(fib786, fib618).toFixed(digits)}`;
  let entryArrayName = bestEntryArray
    ? `${bestEntryArray.zone} ${bestEntryArray.category}`
    : `${oteZone} OTE (0.618 - 0.786)`;

  // Guarantee institutional rule: Long entry sits <= equilibrium (or OTE in Discount); Short entry sits >= equilibrium (or OTE in Premium)
  if (bullishBias && entryMid > equilibrium) {
    entryMid = fib705;
    entryZoneStr = `${Math.min(fib786, fib618).toFixed(digits)} - ${Math.max(fib786, fib618).toFixed(digits)}`;
    entryArrayName = 'Discount OTE (0.618 - 0.786)';
  } else if (!bullishBias && entryMid < equilibrium) {
    entryMid = fib705;
    entryZoneStr = `${Math.min(fib786, fib618).toFixed(digits)} - ${Math.max(fib786, fib618).toFixed(digits)}`;
    entryArrayName = 'Premium OTE (0.618 - 0.786)';
  }

  const obAnchor = bullishBias ? bullObCandle : bearObCandle;
  const stopBuffer = Math.max(atr * 0.4, minStep * 0.35);
  const stopLoss = round(
    bullishBias
      ? Math.min(obAnchor ? obAnchor.low : rangeLow, rangeLow, entryMid - atr) - stopBuffer
      : Math.max(obAnchor ? obAnchor.high : rangeHigh, rangeHigh, entryMid + atr) + stopBuffer
  );

  const riskDist = Math.max(Math.abs(entryMid - stopLoss), atr * 0.5);
  const tp1 = round(bullishBias ? Math.max(equilibrium, entryMid + riskDist * 2.0) : Math.min(equilibrium, entryMid - riskDist * 2.0));
  const rawTp2 = bullishBias ? bslLevel : sslLevel;
  const tp2 = round(
    bullishBias ? Math.max(rawTp2, tp1 + riskDist * 0.65) : Math.min(rawTp2, tp1 - riskDist * 0.65)
  );
  const rrRatio = Number((Math.abs(tp1 - entryMid) / riskDist).toFixed(2));

  const drawOnLiquidity: IctAnalysisResult['drawOnLiquidity'] = bullishBias
    ? {
        label: equalHighsLevel ? `Equal Highs / BSL` : `Old High / BSL`,
        price: equalHighsLevel && equalHighsLevel > currentPrice ? equalHighsLevel : bslLevel,
        side: 'BSL (Premium)',
      }
    : {
        label: equalLowsLevel ? `Equal Lows / SSL` : `Old Low / SSL`,
        price: equalLowsLevel && equalLowsLevel < currentPrice ? equalLowsLevel : sslLevel,
        side: 'SSL (Discount)',
      };

  const prevClose = candles[candles.length - 2]?.close ?? currentPrice;
  const po3Phase: IctAnalysisResult['po3Phase'] =
    recentSweepBias && ((recentSweepBias === 'Bullish') === bullishBias)
      ? 'Manipulation (Judas Swing)'
      : (currentPrice >= prevClose) === bullishBias
      ? 'Distribution'
      : 'Accumulation';

  const kz = getNewYorkKillzone();

  const confluences = [
    `Dealing Range ${rangeLow.toFixed(digits)}–${rangeHigh.toFixed(digits)} · 50% Equilibrium at ${equilibrium.toFixed(digits)} (Price in ${currentZone} at ${currentPositionPct}%)`,
    `Active Setup Array: ${entryArrayName} (${entryZoneStr}) aligned with ${bullishBias ? 'Discount Long' : 'Premium Short'} delivery rules`,
    `${structureShift}${displacementDetected ? ' + energetic institutional displacement confirmed' : ''}`,
    `${drawOnLiquidity.side} Draw on Liquidity targeting ${drawOnLiquidity.label} at ${drawOnLiquidity.price.toFixed(digits)}`,
    `${kz.label} · Power of 3: ${po3Phase} · OTE 0.705 at ${fib705.toFixed(digits)}`,
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

  return {
    symbol: tvData.symbol,
    tvSymbol: tvData.tvSymbol,
    tradingViewUrl: `https://www.tradingview.com/chart/?symbol=${encodeURIComponent(tvData.tvSymbol)}`,
    timeframe,
    currentPrice,
    bid: tvData.bid,
    ask: tvData.ask,
    changePct: tvData.chgPct,
    dailyBias: bullishBias ? 'Bullish' : 'Bearish',
    po3Phase,
    activeKillzone: kz.label,
    structureShift,
    displacementDetected,
    liquiditySweep,
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
      direction: bullishBias ? 'Long (Buy)' : 'Short (Sell)',
      entryZone: entryZoneStr,
      entryArrayName,
      stopLoss,
      tp1,
      tp2,
      rrRatio,
      confluences,
    },
    candles,
    ictReferenceChannel: ictChannelId,
    dataSource: 'tradingview_live',
    lastUpdated: tvData.fetchedAt,
  };
}
