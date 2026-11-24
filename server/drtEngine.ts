import { fetchTradingViewChartData, type TvInterval } from './tradingViewFeed.ts';
import { normalizeServerTimeframe, type Candle } from './ictEngine.ts';

export type DrtRangeType = 'Type 1' | 'Type 2' | 'Type 3';

export type DrtQuadrantLabel =
  | 'Deep Premium (75–100%)'
  | 'Upper Premium (50–75%)'
  | 'Equilibrium (50%)'
  | 'Lower Discount (25–50%)'
  | 'Deep Discount (0–25%)';

export type DrtZoneType =
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

export interface DrtZone {
  type: DrtZoneType;
  top: number;
  bottom: number;
  ceMid: number;
  startIndex: number;
  endIndex: number;
  mitigated: boolean;
  pdZone: 'Premium' | 'Discount' | 'Equilibrium';
  quadrant: DrtQuadrantLabel;
}

export type DrtPdArrayCategory =
  | 'DRH / External BSL (1.00)'
  | 'DRL / External SSL (0.00)'
  | 'Relative Equal Highs (EQH)'
  | 'Relative Equal Lows (EQL)'
  | 'Fair Value Gap (FVG)'
  | 'Order Block (OB)'
  | 'Breaker Block'
  | 'Mitigation Block'
  | 'Rejection Block'
  | 'Liquidity Void';

export interface DrtPdArrayItem {
  id: string;
  name: string;
  category: DrtPdArrayCategory;
  direction: 'Bullish' | 'Bearish' | 'Neutral';
  zone: 'Premium' | 'Discount' | 'Equilibrium';
  quadrant: DrtQuadrantLabel;
  priority: number;
  top: number;
  bottom: number;
  midpoint: number;
  status: 'Unmitigated' | 'In Zone' | 'Mitigated' | 'Target Liquidity';
  distancePct: number;
  description: string;
  startIndex: number;
}

export interface DrtDealingRange {
  drh: number; // 1.00 DRT (Dealing Range High)
  q75: number; // 0.75 DRT (Premium Quadrant Reference)
  eq50: number; // 0.50 DRT (Equilibrium)
  q25: number; // 0.25 DRT (Discount Quadrant Reference)
  drl: number; // 0.00 DRT (Dealing Range Low)
  sdPos25: number; // +0.25 SD above DRH (1.25)
  sdPos50: number; // +0.50 SD above DRH (1.50)
  sdNeg25: number; // -0.25 SD below DRL (-0.25)
  sdNeg50: number; // -0.50 SD below DRL (-0.50)
  rangeHighIndex: number;
  rangeLowIndex: number;
  currentPositionPct: number; // 0 = DRL, 50 = EQ, 100 = DRH
  currentZone: 'Premium' | 'Discount' | 'Equilibrium';
  quadrant: DrtQuadrantLabel;
  alignedWithBias: boolean;
  guidance: string;
}

export interface DrtSmtStatus {
  correlatedSymbol: string;
  inverseCorrelation: boolean;
  status: 'Bullish SMT Divergence' | 'Bearish SMT Divergence' | 'Aligned Correlation' | 'Unavailable';
  summary: string;
}

export interface DrtTriggerStatus {
  name:
    | '50% DRT Equilibrium Flip'
    | '25 DRT Discount Reclaim'
    | '75 DRT Premium Rejection'
    | 'DRH / DRL External Sweep'
    | 'Awaiting Quadrant Reaction';
  confirmed: boolean;
  triggerIndex: number | null;
  detail: string;
}

export interface DrtAnalysisResult {
  symbol: string;
  tvSymbol: string;
  tradingViewUrl: string;
  timeframe: string;
  currentPrice: number;
  bid: number | null;
  ask: number | null;
  changePct: number | null;
  bias: 'Bullish' | 'Bearish';
  rangeType: DrtRangeType;
  rangeTypeTitle: string;
  rangeTypeSummary: string;
  deliveryCycle: 'ERL → IRL (Rebalancing)' | 'IRL → ERL (Expanding)';
  deliveryCycleDetail: string;
  activeSessionWindow: string;
  dealingRange: DrtDealingRange;
  smt: DrtSmtStatus;
  trigger: DrtTriggerStatus;
  equalHighsLevel: number | null;
  equalLowsLevel: number | null;
  sweepIndex: number | null;
  sweepLabel: string;
  flipIndex: number | null;
  drawOnLiquidity: {
    label: string;
    price: number;
    side: 'DRH / Premium Liquidity' | 'DRL / Discount Liquidity' | '50% DRT Equilibrium';
  };
  pdArrays: DrtPdArrayItem[];
  zones: DrtZone[];
  setup: {
    direction: 'Long (Buy)' | 'Short (Sell)';
    entryModel: string;
    entryZone: string;
    entryArrayName: string;
    stopLoss: number;
    tp1: number;
    tp2: number;
    tp3: number;
    rrRatio: number;
    confluences: string[];
  };
  candles: Candle[];
  drtReferenceUrl: string;
  dataSource: 'tradingview_live';
  lastUpdated: string;
}

const DEFAULT_DRT_YOUTUBE_URL = 'https://youtube.com/@ali_khan_ict?si=mqOSzAkgagFGdb80';

const TF_TO_TV: Record<string, TvInterval> = {
  '1M': '1',
  '5M': '5',
  '15M': '15',
  '30M': '30',
  '1H': '60',
  '4H': '240',
  '1D': 'D',
  '1W': 'W',
};

const SMT_PAIR_MAP: Record<string, { peer: string; inverse: boolean }> = {
  // Forex
  EURUSD: { peer: 'GBPUSD', inverse: false },
  GBPUSD: { peer: 'EURUSD', inverse: false },
  AUDUSD: { peer: 'NZDUSD', inverse: false },
  NZDUSD: { peer: 'AUDUSD', inverse: false },
  USDJPY: { peer: 'EURUSD', inverse: true },
  USDCHF: { peer: 'EURUSD', inverse: true },
  USDCAD: { peer: 'EURUSD', inverse: true },
  EURGBP: { peer: 'EURUSD', inverse: false },
  EURJPY: { peer: 'GBPJPY', inverse: false },
  GBPJPY: { peer: 'EURJPY', inverse: false },
  AUDJPY: { peer: 'CADJPY', inverse: false },
  CADJPY: { peer: 'AUDJPY', inverse: false },
  CHFJPY: { peer: 'EURJPY', inverse: false },
  EURAUD: { peer: 'GBPAUD', inverse: false },
  EURCAD: { peer: 'GBPCAD', inverse: false },
  EURCHF: { peer: 'USDCHF', inverse: false },
  GBPAUD: { peer: 'EURAUD', inverse: false },
  GBPCAD: { peer: 'EURCAD', inverse: false },
  AUDCAD: { peer: 'AUDUSD', inverse: false },
  USDMXN: { peer: 'USDZAR', inverse: false },
  USDZAR: { peer: 'USDMXN', inverse: false },
  // Commodities
  XAUUSD: { peer: 'XAGUSD', inverse: false },
  XAGUSD: { peer: 'XAUUSD', inverse: false },
  XPTUSD: { peer: 'XAUUSD', inverse: false },
  XPDUSD: { peer: 'XPTUSD', inverse: false },
  USOIL: { peer: 'UKOIL', inverse: false },
  UKOIL: { peer: 'USOIL', inverse: false },
  NATGAS: { peer: 'USOIL', inverse: false },
  COPPER: { peer: 'XAGUSD', inverse: false },
  CORN: { peer: 'WHEAT', inverse: false },
  WHEAT: { peer: 'CORN', inverse: false },
  // Indices
  NAS100: { peer: 'US30', inverse: false },
  US30: { peer: 'NAS100', inverse: false },
  SPX500: { peer: 'NAS100', inverse: false },
  US2000: { peer: 'SPX500', inverse: false },
  GER40: { peer: 'UK100', inverse: false },
  UK100: { peer: 'GER40', inverse: false },
  // ETFs
  SPY: { peer: 'QQQ', inverse: false },
  QQQ: { peer: 'SPY', inverse: false },
  IWM: { peer: 'SPY', inverse: false },
  DIA: { peer: 'SPY', inverse: false },
  VOO: { peer: 'SPY', inverse: false },
  GLD: { peer: 'SLV', inverse: false },
  SLV: { peer: 'GLD', inverse: false },
  USO: { peer: 'USOIL', inverse: false },
  TLT: { peer: 'SPY', inverse: true },
  ARKK: { peer: 'QQQ', inverse: false },
  // Stocks
  AAPL: { peer: 'MSFT', inverse: false },
  MSFT: { peer: 'AAPL', inverse: false },
  NVDA: { peer: 'AMD', inverse: false },
  AMD: { peer: 'NVDA', inverse: false },
  TSLA: { peer: 'QQQ', inverse: false },
  AMZN: { peer: 'GOOGL', inverse: false },
  GOOGL: { peer: 'META', inverse: false },
  META: { peer: 'GOOGL', inverse: false },
  NFLX: { peer: 'QQQ', inverse: false },
  PLTR: { peer: 'NVDA', inverse: false },
  COIN: { peer: 'BTCUSD', inverse: false },
  JPM: { peer: 'V', inverse: false },
  V: { peer: 'JPM', inverse: false },
  BA: { peer: 'US30', inverse: false },
  // Crypto
  BTCUSD: { peer: 'ETHUSD', inverse: false },
  ETHUSD: { peer: 'BTCUSD', inverse: false },
  SOLUSD: { peer: 'BTCUSD', inverse: false },
  XRPUSD: { peer: 'BTCUSD', inverse: false },
  BNBUSD: { peer: 'BTCUSD', inverse: false },
  ADAUSD: { peer: 'ETHUSD', inverse: false },
  DOGEUSD: { peer: 'BTCUSD', inverse: false },
  AVAXUSD: { peer: 'SOLUSD', inverse: false },
  LINKUSD: { peer: 'ETHUSD', inverse: false },
  LTCUSD: { peer: 'BTCUSD', inverse: false },
  DOTUSD: { peer: 'ETHUSD', inverse: false },
  SUIUSD: { peer: 'SOLUSD', inverse: false },
};

function formatCandleTime(timestampSec: number, tf: string): string {
  const d = new Date(timestampSec * 1000);
  if (tf === '1D' || tf === '1W') {
    const mm = String(d.getUTCMonth() + 1).padStart(2, '0');
    const dd = String(d.getUTCDate()).padStart(2, '0');
    return `${mm}-${dd}`;
  }
  return `${String(d.getUTCHours()).padStart(2, '0')}:${String(d.getUTCMinutes()).padStart(2, '0')}`;
}

function getDrtSessionWindow(): string {
  const now = new Date();
  const nyHourStr = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/New_York',
    hour: '2-digit',
    hour12: false,
  }).format(now);
  const nyHour = Number(nyHourStr) % 24;
  if (nyHour >= 2 && nyHour < 5) return 'London Open Macro (02:00–05:00 NY)';
  if (nyHour >= 7 && nyHour < 10) return 'New York AM Macro (07:00–10:00 NY)';
  if (nyHour >= 10 && nyHour < 12) return 'London Close / NY Silver Bullet (10:00–12:00 NY)';
  if (nyHour >= 13 && nyHour < 16) return 'New York PM Session (13:00–16:00 NY)';
  return 'Asian Dealing Range Accumulation (20:00–00:00 NY)';
}

function classifyDrtQuadrant(
  price: number,
  drl: number,
  drh: number
): { pct: number; zone: 'Premium' | 'Discount' | 'Equilibrium'; quadrant: DrtQuadrantLabel } {
  const span = Math.max(1e-8, drh - drl);
  const rawPct = ((price - drl) / span) * 100;
  const pct = Math.max(0, Math.min(100, Number(rawPct.toFixed(1))));
  if (pct >= 75) {
    return { pct, zone: 'Premium', quadrant: 'Deep Premium (75–100%)' };
  }
  if (pct > 53) {
    return { pct, zone: 'Premium', quadrant: 'Upper Premium (50–75%)' };
  }
  if (pct >= 47 && pct <= 53) {
    return { pct, zone: 'Equilibrium', quadrant: 'Equilibrium (50%)' };
  }
  if (pct >= 25) {
    return { pct, zone: 'Discount', quadrant: 'Lower Discount (25–50%)' };
  }
  return { pct, zone: 'Discount', quadrant: 'Deep Discount (0–25%)' };
}

function findSwingPoints(candles: Candle[], lookback = 2) {
  const swingHighs: Array<{ index: number; price: number }> = [];
  const swingLows: Array<{ index: number; price: number }> = [];

  for (let i = lookback; i < candles.length - lookback; i++) {
    const cur = candles[i];
    let isHigh = true;
    let isLow = true;
    for (let k = 1; k <= lookback; k++) {
      if (candles[i - k].high >= cur.high || candles[i + k].high > cur.high) isHigh = false;
      if (candles[i - k].low <= cur.low || candles[i + k].low < cur.low) isLow = false;
    }
    if (isHigh) swingHighs.push({ index: i, price: cur.high });
    if (isLow) swingLows.push({ index: i, price: cur.low });
  }

  return { swingHighs, swingLows };
}

async function computeSmtDivergence(
  symbol: string,
  tvInterval: TvInterval,
  primaryCandles: Candle[],
  swingHighs: Array<{ index: number; price: number }>,
  swingLows: Array<{ index: number; price: number }>
): Promise<DrtSmtStatus> {
  const mapping = SMT_PAIR_MAP[symbol.toUpperCase()];
  if (!mapping) {
    return {
      correlatedSymbol: 'EURUSD / DXY',
      inverseCorrelation: false,
      status: 'Aligned Correlation',
      summary: 'No direct paired SMT proxy mapped for this instrument; confirm bias via HTF DRT quadrants.',
    };
  }

  try {
    const peerData = await Promise.race([
      fetchTradingViewChartData(mapping.peer, tvInterval),
      new Promise<null>((resolve) => setTimeout(() => resolve(null), 3500)),
    ]);

    if (!peerData || peerData.bars.length < 18) {
      return {
        correlatedSymbol: mapping.peer,
        inverseCorrelation: mapping.inverse,
        status: 'Unavailable',
        summary: `Correlated feed (${mapping.peer}) timed out; validate SMT manually on TradingView.`,
      };
    }

    const peerBars = peerData.bars.slice(-36);
    const peerHighs: number[] = [];
    const peerLows: number[] = [];
    for (let i = 2; i < peerBars.length - 2; i++) {
      const b = peerBars[i];
      if (
        b.high > peerBars[i - 1].high &&
        b.high > peerBars[i - 2].high &&
        b.high >= peerBars[i + 1].high &&
        b.high >= peerBars[i + 2].high
      ) {
        peerHighs.push(b.high);
      }
      if (
        b.low < peerBars[i - 1].low &&
        b.low < peerBars[i - 2].low &&
        b.low <= peerBars[i + 1].low &&
        b.low <= peerBars[i + 2].low
      ) {
        peerLows.push(b.low);
      }
    }

    const last2PrimaryLows = swingLows.slice(-2);
    const last2PrimaryHighs = swingHighs.slice(-2);
    const last2PeerLows = peerLows.slice(-2);
    const last2PeerHighs = peerHighs.slice(-2);

    if (!mapping.inverse) {
      if (last2PrimaryLows.length === 2 && last2PeerLows.length === 2) {
        const primLowerLow = last2PrimaryLows[1].price < last2PrimaryLows[0].price;
        const peerHigherLow = last2PeerLows[1] > last2PeerLows[0];
        if (primLowerLow && peerHigherLow) {
          return {
            correlatedSymbol: mapping.peer,
            inverseCorrelation: false,
            status: 'Bullish SMT Divergence',
            summary: `${symbol} swept a lower low while correlated ${mapping.peer} held a higher low — institutional accumulation crack confirming bullish DRT reversal.`,
          };
        }
      }
      if (last2PrimaryHighs.length === 2 && last2PeerHighs.length === 2) {
        const primHigherHigh = last2PrimaryHighs[1].price > last2PrimaryHighs[0].price;
        const peerLowerHigh = last2PeerHighs[1] < last2PeerHighs[0];
        if (primHigherHigh && peerLowerHigh) {
          return {
            correlatedSymbol: mapping.peer,
            inverseCorrelation: false,
            status: 'Bearish SMT Divergence',
            summary: `${symbol} swept a higher high while correlated ${mapping.peer} failed with a lower high — institutional distribution crack confirming bearish DRT reversal.`,
          };
        }
      }
    } else {
      // Inverse pair (e.g. USDJPY vs EURUSD)
      if (last2PrimaryLows.length === 2 && last2PeerHighs.length === 2) {
        const primLowerLow = last2PrimaryLows[1].price < last2PrimaryLows[0].price;
        const peerLowerHigh = last2PeerHighs[1] < last2PeerHighs[0];
        if (primLowerLow && peerLowerHigh) {
          return {
            correlatedSymbol: mapping.peer,
            inverseCorrelation: true,
            status: 'Bullish SMT Divergence',
            summary: `${symbol} printed a lower low while inversely correlated ${mapping.peer} failed to make a higher high — bullish SMT confirmation.`,
          };
        }
      }
      if (last2PrimaryHighs.length === 2 && last2PeerLows.length === 2) {
        const primHigherHigh = last2PrimaryHighs[1].price > last2PrimaryHighs[0].price;
        const peerHigherLow = last2PeerLows[1] > last2PeerLows[0];
        if (primHigherHigh && peerHigherLow) {
          return {
            correlatedSymbol: mapping.peer,
            inverseCorrelation: true,
            status: 'Bearish SMT Divergence',
            summary: `${symbol} printed a higher high while inversely correlated ${mapping.peer} failed to make a lower low — bearish SMT confirmation.`,
          };
        }
      }
    }

    const latestPrimDelta = primaryCandles[primaryCandles.length - 1].close - primaryCandles[primaryCandles.length - 6].close;
    const latestPeerDelta = peerBars[peerBars.length - 1].close - peerBars[peerBars.length - 6].close;
    const alignedDir = mapping.inverse
      ? latestPrimDelta * latestPeerDelta < 0
      : latestPrimDelta * latestPeerDelta >= 0;

    return {
      correlatedSymbol: mapping.peer,
      inverseCorrelation: mapping.inverse,
      status: 'Aligned Correlation',
      summary: alignedDir
        ? `${symbol} and ${mapping.peer} are moving in structural alignment — favor Type 1 continuation or clean 50% DRT flips.`
        : `Minor short-term divergence forming between ${symbol} and ${mapping.peer}; watch DRH/DRL extremes for full SMT crack.`,
    };
  } catch {
    return {
      correlatedSymbol: mapping.peer,
      inverseCorrelation: mapping.inverse,
      status: 'Unavailable',
      summary: `Live SMT comparison with ${mapping.peer} temporarily unavailable.`,
    };
  }
}

export async function runDrtMarketAnalysis(
  rawSymbol: string,
  rawTimeframe: string,
  drtReferenceUrl = DEFAULT_DRT_YOUTUBE_URL
): Promise<DrtAnalysisResult> {
  const symbol = (rawSymbol || 'EURUSD').trim().toUpperCase();
  const timeframe = normalizeServerTimeframe(rawTimeframe || '15M');
  const tvInterval = TF_TO_TV[timeframe] || '15';

  const tvSeries = await fetchTradingViewChartData(symbol, tvInterval);
  const digits = tvSeries.digits;
  const round = (v: number) => Number(v.toFixed(digits));

  const bars = tvSeries.bars.slice(-64);
  if (bars.length < 18) {
    throw new Error(`Not enough live TradingView candles returned for ${symbol} (${timeframe}) DRT analysis.`);
  }

  const candles: Candle[] = bars.map((b, idx) => ({
    index: idx,
    timestampSec: b.timestampSec,
    time: formatCandleTime(b.timestampSec, timeframe),
    open: round(b.open),
    high: round(b.high),
    low: round(b.low),
    close: round(b.close),
  }));

  const last = candles[candles.length - 1];
  const currentPrice = round(tvSeries.currentPrice || last.close);
  const { swingHighs, swingLows } = findSwingPoints(candles, 2);

  // 1. Anchor Active Dealing Range High (DRH = 1.00) and Dealing Range Low (DRL = 0.00)
  // Look over the recent structural leg window (last 48 candles) for institutional DRH & DRL
  const rangeWindowStart = Math.max(0, candles.length - 48);
  let drh = -Infinity;
  let drl = Infinity;
  let rangeHighIndex = rangeWindowStart;
  let rangeLowIndex = rangeWindowStart;

  for (let i = rangeWindowStart; i < candles.length; i++) {
    if (candles[i].high > drh) {
      drh = candles[i].high;
      rangeHighIndex = i;
    }
    if (candles[i].low < drl) {
      drl = candles[i].low;
      rangeLowIndex = i;
    }
  }

  const rangeSpan = Math.max(1e-6, drh - drl);
  const eq50 = round(drl + rangeSpan * 0.5);
  const q75 = round(drl + rangeSpan * 0.75);
  const q25 = round(drl + rangeSpan * 0.25);
  const sdPos25 = round(drh + rangeSpan * 0.25);
  const sdPos50 = round(drh + rangeSpan * 0.5);
  const sdNeg25 = round(drl - rangeSpan * 0.25);
  const sdNeg50 = round(drl - rangeSpan * 0.5);

  // Average candle body & range for displacement / equal-level tolerances
  const avgBody =
    candles.slice(-24).reduce((acc, c) => acc + Math.abs(c.close - c.open), 0) /
    Math.max(1, Math.min(24, candles.length));
  const avgRange =
    candles.slice(-24).reduce((acc, c) => acc + Math.max(1e-6, c.high - c.low), 0) /
    Math.max(1, Math.min(24, candles.length));
  const eqTolerance = Math.max(rangeSpan * 0.045, avgRange * 0.35);

  // 2. Detect Relative Equal Highs (EQH) & Equal Lows (EQL) — core signature of Type 2 DRT
  let equalHighsLevel: number | null = null;
  for (let i = swingHighs.length - 1; i >= 1; i--) {
    for (let j = i - 1; j >= Math.max(0, i - 4); j--) {
      if (Math.abs(swingHighs[i].price - swingHighs[j].price) <= eqTolerance) {
        equalHighsLevel = round((swingHighs[i].price + swingHighs[j].price) / 2);
        break;
      }
    }
    if (equalHighsLevel !== null) break;
  }

  let equalLowsLevel: number | null = null;
  for (let i = swingLows.length - 1; i >= 1; i--) {
    for (let j = i - 1; j >= Math.max(0, i - 4); j--) {
      if (Math.abs(swingLows[i].price - swingLows[j].price) <= eqTolerance) {
        equalLowsLevel = round((swingLows[i].price + swingLows[j].price) / 2);
        break;
      }
    }
    if (equalLowsLevel !== null) break;
  }

  // 3. Detect Liquidity Sweeps (Turtle Soup at DRH/DRL or recent swings)
  let sweepIndex: number | null = null;
  let sweepSide: 'BSL' | 'SSL' | null = null;
  let sweepLabel = 'No recent extreme sweep';
  for (let i = candles.length - 1; i >= Math.max(5, candles.length - 16); i--) {
    const c = candles[i];
    const priorSlice = candles.slice(Math.max(0, i - 14), i);
    const priorHigh = Math.max(...priorSlice.map((p) => p.high));
    const priorLow = Math.min(...priorSlice.map((p) => p.low));
    if (c.high > priorHigh && c.close < priorHigh) {
      sweepIndex = i;
      sweepSide = 'BSL';
      sweepLabel = `DRH / BSL Liquidity Sweep at ${round(c.high)} (closed back inside range)`;
      break;
    }
    if (c.low < priorLow && c.close > priorLow) {
      sweepIndex = i;
      sweepSide = 'SSL';
      sweepLabel = `DRL / SSL Liquidity Sweep at ${round(c.low)} (closed back inside range)`;
      break;
    }
  }

  // 4. Detect 50% DRT Equilibrium Flips & Recent Displacement
  let flipIndex: number | null = null;
  let flipDirection: 'Bullish' | 'Bearish' | null = null;
  let eqCrosses = 0;
  for (let i = Math.max(1, candles.length - 20); i < candles.length; i++) {
    const prev = candles[i - 1];
    const cur = candles[i];
    if ((prev.close <= eq50 && cur.close > eq50) || (prev.close >= eq50 && cur.close < eq50)) {
      eqCrosses++;
    }
    if (i >= candles.length - 12) {
      if (prev.close <= eq50 && cur.close > eq50 && cur.close - cur.open > avgBody * 0.7) {
        flipIndex = i;
        flipDirection = 'Bullish';
      } else if (prev.close >= eq50 && cur.close < eq50 && cur.open - cur.close > avgBody * 0.7) {
        flipIndex = i;
        flipDirection = 'Bearish';
      }
    }
  }

  const recentDisplacement = candles
    .slice(-10)
    .some((c) => Math.abs(c.close - c.open) >= avgBody * 1.9);

  // 5. Run live correlated SMT Divergence check
  const smt = await computeSmtDivergence(symbol, tvInterval, candles, swingHighs, swingLows);

  // 6. Determine DRT Bias (Combining Structure Sequence, Sweep, 50% Flip, and SMT)
  const bullLegAfterLow = rangeLowIndex < rangeHighIndex;
  const recentClosesAboveEq = candles.slice(-6).filter((c) => c.close > eq50).length;
  let biasScore = 0;
  if (bullLegAfterLow) biasScore += 1;
  else biasScore -= 1;
  if (recentClosesAboveEq >= 4) biasScore += 1;
  else if (recentClosesAboveEq <= 2) biasScore -= 1;
  if (sweepSide === 'SSL') biasScore += 2;
  if (sweepSide === 'BSL') biasScore -= 2;
  if (flipDirection === 'Bullish') biasScore += 1.5;
  if (flipDirection === 'Bearish') biasScore -= 1.5;
  if (smt.status === 'Bullish SMT Divergence') biasScore += 2;
  if (smt.status === 'Bearish SMT Divergence') biasScore -= 2;

  const bias: 'Bullish' | 'Bearish' = biasScore >= 0 ? 'Bullish' : 'Bearish';

  // 7. Classify Dealing Range Archetype (Type 1 / Type 2 / Type 3 — Ali Khan Framework)
  const last12High = Math.max(...candles.slice(-12).map((c) => c.high));
  const last12Low = Math.min(...candles.slice(-12).map((c) => c.low));
  const compressionRatio = (last12High - last12Low) / rangeSpan;

  let rangeType: DrtRangeType;
  let rangeTypeTitle: string;
  let rangeTypeSummary: string;

  if (
    sweepSide !== null ||
    smt.status === 'Bullish SMT Divergence' ||
    smt.status === 'Bearish SMT Divergence' ||
    (equalHighsLevel !== null && bias === 'Bearish') ||
    (equalLowsLevel !== null && bias === 'Bullish')
  ) {
    rangeType = 'Type 2';
    rangeTypeTitle = 'Type 2 Dealing Range — Liquidity Sweep & Reversal';
    rangeTypeSummary =
      'Relative Equal Highs/Lows or external range liquidity swept with structural rejection back inside the range. Favor mechanical reversal entries off 50% DRT flip or 25/75 DRT quadrants toward opposite liquidity.';
  } else if (eqCrosses >= 4 || compressionRatio < 0.42) {
    rangeType = 'Type 3';
    rangeTypeTitle = 'Type 3 Dealing Range — Consolidation / Rotational Delivery';
    rangeTypeSummary =
      'Price is rotating tightly around the 50% DRT Equilibrium without sustained external expansion. Avoid chasing mid-range breakouts; only frame Discount (<25% DRT) longs or Premium (>75% DRT) shorts back to 50% Equilibrium.';
  } else {
    rangeType = 'Type 1';
    rangeTypeTitle = 'Type 1 Dealing Range — Directional Expansion Trend';
    rangeTypeSummary =
      'Clean institutional displacement establishing directional orderflow. Wait for a retracement into an aligned Discount (<50% / 25 DRT) or Premium (>50% / 75 DRT) PD Array before targeting external DRH/DRL liquidity and SD extensions.';
  }

  // 8. Detect all PD Arrays inside the Dealing Range and tag every one with its DRT Quadrant
  const zones: DrtZone[] = [];
  const pdArrays: DrtPdArrayItem[] = [];
  const distPct = (level: number) => Number((((level - currentPrice) / Math.max(1e-6, currentPrice)) * 100).toFixed(2));

  // External Range Liquidity (1.00 DRH & 0.00 DRL)
  pdArrays.push({
    id: 'drt-drh',
    name: '1.00 DRT · Dealing Range High (External BSL)',
    category: 'DRH / External BSL (1.00)',
    direction: 'Bearish',
    zone: 'Premium',
    quadrant: 'Deep Premium (75–100%)',
    priority: 1,
    top: round(drh),
    bottom: round(drh),
    midpoint: round(drh),
    status: bias === 'Bullish' ? 'Target Liquidity' : 'Unmitigated',
    distancePct: distPct(drh),
    description: '100% Dealing Range High — primary buy-side liquidity draw for bullish setups and sweep boundary for bearish Type 2 reversals.',
    startIndex: rangeHighIndex,
  });

  pdArrays.push({
    id: 'drt-drl',
    name: '0.00 DRT · Dealing Range Low (External SSL)',
    category: 'DRL / External SSL (0.00)',
    direction: 'Bullish',
    zone: 'Discount',
    quadrant: 'Deep Discount (0–25%)',
    priority: 1,
    top: round(drl),
    bottom: round(drl),
    midpoint: round(drl),
    status: bias === 'Bearish' ? 'Target Liquidity' : 'Unmitigated',
    distancePct: distPct(drl),
    description: '0% Dealing Range Low — primary sell-side liquidity draw for bearish setups and sweep boundary for bullish Type 2 reversals.',
    startIndex: rangeLowIndex,
  });

  if (equalHighsLevel !== null) {
    const q = classifyDrtQuadrant(equalHighsLevel, drl, drh);
    pdArrays.push({
      id: 'drt-eqh',
      name: 'Relative Equal Highs (EQH Pool)',
      category: 'Relative Equal Highs (EQH)',
      direction: 'Bearish',
      zone: q.zone,
      quadrant: q.quadrant,
      priority: 2,
      top: equalHighsLevel,
      bottom: equalHighsLevel,
      midpoint: equalHighsLevel,
      status: 'Target Liquidity',
      distancePct: distPct(equalHighsLevel),
      description: 'Clustered buy-stops sitting above relative equal highs — magnetic Type 2 DRT liquidity pool.',
      startIndex: swingHighs[swingHighs.length - 1]?.index ?? rangeHighIndex,
    });
  }

  if (equalLowsLevel !== null) {
    const q = classifyDrtQuadrant(equalLowsLevel, drl, drh);
    pdArrays.push({
      id: 'drt-eql',
      name: 'Relative Equal Lows (EQL Pool)',
      category: 'Relative Equal Lows (EQL)',
      direction: 'Bullish',
      zone: q.zone,
      quadrant: q.quadrant,
      priority: 2,
      top: equalLowsLevel,
      bottom: equalLowsLevel,
      midpoint: equalLowsLevel,
      status: 'Target Liquidity',
      distancePct: distPct(equalLowsLevel),
      description: 'Clustered sell-stops sitting below relative equal lows — magnetic Type 2 DRT liquidity pool.',
      startIndex: swingLows[swingLows.length - 1]?.index ?? rangeLowIndex,
    });
  }

  // Fair Value Gaps (FVG: BISI & SIBI)
  for (let i = Math.max(2, rangeWindowStart + 2); i < candles.length; i++) {
    const c0 = candles[i - 2];
    const c1 = candles[i - 1];
    const c2 = candles[i];

    // Bullish FVG (BISI)
    if (c2.low > c0.high && c2.low - c0.high >= avgRange * 0.16) {
      const top = round(c2.low);
      const bottom = round(c0.high);
      const ceMid = round((top + bottom) / 2);
      const mitigated = candles.slice(i + 1).some((f) => f.low <= ceMid);
      const inZone = currentPrice <= top && currentPrice >= bottom;
      const q = classifyDrtQuadrant(ceMid, drl, drh);
      const zoneItem: DrtZone = {
        type: 'Bullish FVG',
        top,
        bottom,
        ceMid,
        startIndex: i - 2,
        endIndex: candles.length - 1,
        mitigated,
        pdZone: q.zone,
        quadrant: q.quadrant,
      };
      zones.push(zoneItem);
      pdArrays.push({
        id: `drt-bfvg-${i}`,
        name: `Bullish FVG (BISI) · ${q.quadrant}`,
        category: 'Fair Value Gap (FVG)',
        direction: 'Bullish',
        zone: q.zone,
        quadrant: q.quadrant,
        priority: q.zone === 'Discount' ? 2 : 5,
        top,
        bottom,
        midpoint: ceMid,
        status: inZone ? 'In Zone' : mitigated ? 'Mitigated' : 'Unmitigated',
        distancePct: distPct(ceMid),
        description: `3-candle buy-side imbalance (CE ${ceMid}) created by displacement candle ${c1.time}. Highest probability inside 0–50% Discount / 25 DRT.`,
        startIndex: i - 2,
      });
    }

    // Bearish FVG (SIBI)
    if (c0.low > c2.high && c0.low - c2.high >= avgRange * 0.16) {
      const top = round(c0.low);
      const bottom = round(c2.high);
      const ceMid = round((top + bottom) / 2);
      const mitigated = candles.slice(i + 1).some((f) => f.high >= ceMid);
      const inZone = currentPrice <= top && currentPrice >= bottom;
      const q = classifyDrtQuadrant(ceMid, drl, drh);
      const zoneItem: DrtZone = {
        type: 'Bearish FVG',
        top,
        bottom,
        ceMid,
        startIndex: i - 2,
        endIndex: candles.length - 1,
        mitigated,
        pdZone: q.zone,
        quadrant: q.quadrant,
      };
      zones.push(zoneItem);
      pdArrays.push({
        id: `drt-sfvg-${i}`,
        name: `Bearish FVG (SIBI) · ${q.quadrant}`,
        category: 'Fair Value Gap (FVG)',
        direction: 'Bearish',
        zone: q.zone,
        quadrant: q.quadrant,
        priority: q.zone === 'Premium' ? 2 : 5,
        top,
        bottom,
        midpoint: ceMid,
        status: inZone ? 'In Zone' : mitigated ? 'Mitigated' : 'Unmitigated',
        distancePct: distPct(ceMid),
        description: `3-candle sell-side imbalance (CE ${ceMid}) created by displacement candle ${c1.time}. Highest probability inside 50–100% Premium / 75 DRT.`,
        startIndex: i - 2,
      });
    }
  }

  // Order Blocks (last opposing candle before strong displacement)
  for (let i = Math.max(2, rangeWindowStart + 1); i < candles.length - 2; i++) {
    const prev = candles[i];
    const disp = candles[i + 1];
    const dispBody = Math.abs(disp.close - disp.open);
    if (dispBody < avgBody * 1.45) continue;

    // Bullish OB: down-close candle before strong up-displacement
    if (prev.close < prev.open && disp.close > disp.open && disp.close > prev.high) {
      const top = round(prev.open);
      const bottom = round(prev.low);
      const ceMid = round((top + bottom) / 2);
      const mitigated = candles.slice(i + 2).some((f) => f.low <= ceMid);
      const inZone = currentPrice <= top && currentPrice >= bottom;
      const q = classifyDrtQuadrant(ceMid, drl, drh);
      zones.push({
        type: 'Bullish OB',
        top,
        bottom,
        ceMid,
        startIndex: i,
        endIndex: candles.length - 1,
        mitigated,
        pdZone: q.zone,
        quadrant: q.quadrant,
      });
      pdArrays.push({
        id: `drt-bob-${i}`,
        name: `Bullish Order Block · ${q.quadrant}`,
        category: 'Order Block (OB)',
        direction: 'Bullish',
        zone: q.zone,
        quadrant: q.quadrant,
        priority: q.zone === 'Discount' ? 3 : 6,
        top,
        bottom,
        midpoint: ceMid,
        status: inZone ? 'In Zone' : mitigated ? 'Mitigated' : 'Unmitigated',
        distancePct: distPct(ceMid),
        description: `Last down-close candle prior to bullish expansion. Mean Threshold ${ceMid} acts as Discount demand anchor.`,
        startIndex: i,
      });
    }

    // Bearish OB: up-close candle before strong down-displacement
    if (prev.close > prev.open && disp.close < disp.open && disp.close < prev.low) {
      const top = round(prev.high);
      const bottom = round(prev.open);
      const ceMid = round((top + bottom) / 2);
      const mitigated = candles.slice(i + 2).some((f) => f.high >= ceMid);
      const inZone = currentPrice <= top && currentPrice >= bottom;
      const q = classifyDrtQuadrant(ceMid, drl, drh);
      zones.push({
        type: 'Bearish OB',
        top,
        bottom,
        ceMid,
        startIndex: i,
        endIndex: candles.length - 1,
        mitigated,
        pdZone: q.zone,
        quadrant: q.quadrant,
      });
      pdArrays.push({
        id: `drt-sob-${i}`,
        name: `Bearish Order Block · ${q.quadrant}`,
        category: 'Order Block (OB)',
        direction: 'Bearish',
        zone: q.zone,
        quadrant: q.quadrant,
        priority: q.zone === 'Premium' ? 3 : 6,
        top,
        bottom,
        midpoint: ceMid,
        status: inZone ? 'In Zone' : mitigated ? 'Mitigated' : 'Unmitigated',
        distancePct: distPct(ceMid),
        description: `Last up-close candle prior to bearish expansion. Mean Threshold ${ceMid} acts as Premium supply anchor.`,
        startIndex: i,
      });
    }
  }

  // Breaker Block (failed OB broken with displacement — strong Ali Khan Type 2 PD Array)
  const failedBullOb = zones.find((z) => z.type === 'Bullish OB' && currentPrice < z.bottom);
  if (failedBullOb) {
    const q = classifyDrtQuadrant(failedBullOb.ceMid, drl, drh);
    zones.push({
      ...failedBullOb,
      type: 'Bearish Breaker',
      mitigated: false,
      pdZone: q.zone,
      quadrant: q.quadrant,
    });
    pdArrays.push({
      id: `drt-bbreaker-${failedBullOb.startIndex}`,
      name: `Bearish Breaker Block · ${q.quadrant}`,
      category: 'Breaker Block',
      direction: 'Bearish',
      zone: q.zone,
      quadrant: q.quadrant,
      priority: 3,
      top: failedBullOb.top,
      bottom: failedBullOb.bottom,
      midpoint: failedBullOb.ceMid,
      status: currentPrice >= failedBullOb.bottom && currentPrice <= failedBullOb.top ? 'In Zone' : 'Unmitigated',
      distancePct: distPct(failedBullOb.ceMid),
      description: 'Failed bullish demand zone displaced downward — flips into institutional bearish Breaker resistance.',
      startIndex: failedBullOb.startIndex,
    });
  }

  const failedBearOb = zones.find((z) => z.type === 'Bearish OB' && currentPrice > z.top);
  if (failedBearOb) {
    const q = classifyDrtQuadrant(failedBearOb.ceMid, drl, drh);
    zones.push({
      ...failedBearOb,
      type: 'Bullish Breaker',
      mitigated: false,
      pdZone: q.zone,
      quadrant: q.quadrant,
    });
    pdArrays.push({
      id: `drt-bullbreaker-${failedBearOb.startIndex}`,
      name: `Bullish Breaker Block · ${q.quadrant}`,
      category: 'Breaker Block',
      direction: 'Bullish',
      zone: q.zone,
      quadrant: q.quadrant,
      priority: 3,
      top: failedBearOb.top,
      bottom: failedBearOb.bottom,
      midpoint: failedBearOb.ceMid,
      status: currentPrice >= failedBearOb.bottom && currentPrice <= failedBearOb.top ? 'In Zone' : 'Unmitigated',
      distancePct: distPct(failedBearOb.ceMid),
      description: 'Failed bearish supply zone displaced upward — flips into institutional bullish Breaker support.',
      startIndex: failedBearOb.startIndex,
    });
  }

  // Rejection Block (prominent institutional wick at DRH or DRL)
  const drhCandle = candles[rangeHighIndex];
  if (drhCandle) {
    const upperWick = drhCandle.high - Math.max(drhCandle.open, drhCandle.close);
    if (upperWick >= avgBody * 0.65) {
      const top = round(drhCandle.high);
      const bottom = round(Math.max(drhCandle.open, drhCandle.close));
      const ceMid = round((top + bottom) / 2);
      zones.push({
        type: 'Bearish Rejection',
        top,
        bottom,
        ceMid,
        startIndex: rangeHighIndex,
        endIndex: candles.length - 1,
        mitigated: false,
        pdZone: 'Premium',
        quadrant: 'Deep Premium (75–100%)',
      });
      pdArrays.push({
        id: `drt-brej-${rangeHighIndex}`,
        name: 'Bearish Rejection Block (DRH Wick)',
        category: 'Rejection Block',
        direction: 'Bearish',
        zone: 'Premium',
        quadrant: 'Deep Premium (75–100%)',
        priority: 4,
        top,
        bottom,
        midpoint: ceMid,
        status: currentPrice >= bottom && currentPrice <= top ? 'In Zone' : 'Unmitigated',
        distancePct: distPct(ceMid),
        description: 'Long upper liquidity-rejection wick at the 1.00 DRH extreme marking sell-side distribution.',
        startIndex: rangeHighIndex,
      });
    }
  }

  const drlCandle = candles[rangeLowIndex];
  if (drlCandle) {
    const lowerWick = Math.min(drlCandle.open, drlCandle.close) - drlCandle.low;
    if (lowerWick >= avgBody * 0.65) {
      const top = round(Math.min(drlCandle.open, drlCandle.close));
      const bottom = round(drlCandle.low);
      const ceMid = round((top + bottom) / 2);
      zones.push({
        type: 'Bullish Rejection',
        top,
        bottom,
        ceMid,
        startIndex: rangeLowIndex,
        endIndex: candles.length - 1,
        mitigated: false,
        pdZone: 'Discount',
        quadrant: 'Deep Discount (0–25%)',
      });
      pdArrays.push({
        id: `drt-bullrej-${rangeLowIndex}`,
        name: 'Bullish Rejection Block (DRL Wick)',
        category: 'Rejection Block',
        direction: 'Bullish',
        zone: 'Discount',
        quadrant: 'Deep Discount (0–25%)',
        priority: 4,
        top,
        bottom,
        midpoint: ceMid,
        status: currentPrice >= bottom && currentPrice <= top ? 'In Zone' : 'Unmitigated',
        distancePct: distPct(ceMid),
        description: 'Long lower liquidity-rejection wick at the 0.00 DRL extreme marking institutional accumulation.',
        startIndex: rangeLowIndex,
      });
    }
  }

  // Keep chart zones crisp and readable (most recent/relevant unmitigated + key zones)
  const prioritizedZones = [
    ...zones.filter((z) => !z.mitigated).slice(-6),
    ...zones.filter((z) => z.mitigated).slice(-2),
  ].slice(0, 8);

  // Deduplicate & sort PD Arrays by priority then proximity
  pdArrays.sort((a, b) => a.priority - b.priority || Math.abs(a.distancePct) - Math.abs(b.distancePct));

  // 9. Classify Current Price in the 4-Quadrant DRT Matrix
  const pos = classifyDrtQuadrant(currentPrice, drl, drh);
  const alignedWithBias =
    (bias === 'Bullish' && (pos.zone === 'Discount' || pos.zone === 'Equilibrium')) ||
    (bias === 'Bearish' && (pos.zone === 'Premium' || pos.zone === 'Equilibrium'));

  const guidance =
    bias === 'Bullish'
      ? pos.zone === 'Discount'
        ? `Price is in ${pos.quadrant} (${pos.pct}%). Prime Ali Khan DRT Buy Zone — execute off Discount FVG/OB aligned with 25 DRT toward 50% EQ and 1.00 DRH.`
        : `Bullish bias active, but price is currently extended in ${pos.quadrant} (${pos.pct}%). Wait for a pullback to 50% DRT Equilibrium or 25 DRT Discount before entering longs.`
      : pos.zone === 'Premium'
      ? `Price is in ${pos.quadrant} (${pos.pct}%). Prime Ali Khan DRT Sell Zone — execute off Premium FVG/OB aligned with 75 DRT toward 50% EQ and 0.00 DRL.`
      : `Bearish bias active, but price is currently extended in ${pos.quadrant} (${pos.pct}%). Wait for a retracement into 50% DRT Equilibrium or 75 DRT Premium before entering shorts.`;

  // 10. Delivery Cycle (ERL → IRL vs IRL → ERL)
  const inAlignedInternalPdArray = pdArrays.some(
    (p) =>
      p.status === 'In Zone' &&
      ((bias === 'Bullish' && p.direction === 'Bullish' && p.zone === 'Discount') ||
        (bias === 'Bearish' && p.direction === 'Bearish' && p.zone === 'Premium'))
  );
  const deliveryCycle: 'ERL → IRL (Rebalancing)' | 'IRL → ERL (Expanding)' =
    sweepSide !== null && !inAlignedInternalPdArray
      ? 'ERL → IRL (Rebalancing)'
      : 'IRL → ERL (Expanding)';
  const deliveryCycleDetail =
    deliveryCycle === 'ERL → IRL (Rebalancing)'
      ? `External range liquidity swept (${sweepLabel}); price is rebalancing back into internal PD Arrays (FVG / OB / 50% DRT).`
      : `Internal PD Array reaction active in ${pos.quadrant}; orderflow is expanding toward external ${bias === 'Bullish' ? '1.00 DRH (BSL)' : '0.00 DRL (SSL)'}.`;

  // 11. Mechanical DRT Trigger Identification
  let trigger: DrtTriggerStatus;
  if (flipIndex !== null && flipDirection === bias) {
    trigger = {
      name: '50% DRT Equilibrium Flip',
      confirmed: true,
      triggerIndex: flipIndex,
      detail: `Displacement closed across 50% DRT Equilibrium (${eq50}) in ${bias} direction — Ali Khan 50% DRT Flip entry model active.`,
    };
  } else if (bias === 'Bullish' && pos.pct <= 32) {
    trigger = {
      name: '25 DRT Discount Reclaim',
      confirmed: true,
      triggerIndex: candles.length - 1,
      detail: `Price is reacting inside Deep/Lower Discount near 0.25 DRT (${q25}) — bullish accumulation trigger aligned with Discount PD Arrays.`,
    };
  } else if (bias === 'Bearish' && pos.pct >= 68) {
    trigger = {
      name: '75 DRT Premium Rejection',
      confirmed: true,
      triggerIndex: candles.length - 1,
      detail: `Price is reacting inside Deep/Upper Premium near 0.75 DRT (${q75}) — bearish distribution trigger aligned with Premium PD Arrays.`,
    };
  } else if (sweepIndex !== null && ((bias === 'Bullish' && sweepSide === 'SSL') || (bias === 'Bearish' && sweepSide === 'BSL'))) {
    trigger = {
      name: 'DRH / DRL External Sweep',
      confirmed: true,
      triggerIndex: sweepIndex,
      detail: sweepLabel,
    };
  } else {
    trigger = {
      name: 'Awaiting Quadrant Reaction',
      confirmed: false,
      triggerIndex: null,
      detail: `Wait for price to tap ${bias === 'Bullish' ? `0.25 DRT (${q25}) / Discount PD Array` : `0.75 DRT (${q75}) / Premium PD Array`} or confirm a 50% DRT Flip.`,
    };
  }

  // 12. Build Actionable DRT Trade Execution Parameters
  const alignedCandidates = pdArrays.filter(
    (p) =>
      p.status !== 'Mitigated' &&
      p.category !== 'DRH / External BSL (1.00)' &&
      p.category !== 'DRL / External SSL (0.00)' &&
      p.category !== 'Relative Equal Highs (EQH)' &&
      p.category !== 'Relative Equal Lows (EQL)' &&
      ((bias === 'Bullish' && p.direction === 'Bullish' && p.zone !== 'Premium') ||
        (bias === 'Bearish' && p.direction === 'Bearish' && p.zone !== 'Discount'))
  );

  const anchorArray = alignedCandidates[0];
  let entryLow: number;
  let entryHigh: number;
  let entryMid: number;
  let entryArrayName: string;

  if (anchorArray) {
    entryLow = round(anchorArray.bottom);
    entryHigh = round(anchorArray.top);
    entryMid = round(anchorArray.midpoint);
    entryArrayName = anchorArray.name;
  } else if (bias === 'Bullish') {
    entryLow = round(q25 - rangeSpan * 0.04);
    entryHigh = round(q25 + rangeSpan * 0.04);
    entryMid = q25;
    entryArrayName = '0.25 DRT Discount Quadrant Reference';
  } else {
    entryLow = round(q75 - rangeSpan * 0.04);
    entryHigh = round(q75 + rangeSpan * 0.04);
    entryMid = q75;
    entryArrayName = '0.75 DRT Premium Quadrant Reference';
  }

  const slBuffer = Math.max(avgRange * 0.45, rangeSpan * 0.05);
  let stopLoss: number;
  let tp1: number;
  let tp2: number;
  let tp3: number;

  if (bias === 'Bullish') {
    stopLoss = round(Math.min(entryLow - slBuffer, drl - slBuffer * 0.25));
    const risk = Math.max(1e-6, entryMid - stopLoss);
    tp1 = round(Math.max(eq50, entryMid + risk * 1.5));
    tp2 = round(Math.max(drh, entryMid + risk * 2.5));
    tp3 = round(Math.max(sdPos25, tp2 + risk * 0.8));
  } else {
    stopLoss = round(Math.max(entryHigh + slBuffer, drh + slBuffer * 0.25));
    const risk = Math.max(1e-6, stopLoss - entryMid);
    tp1 = round(Math.min(eq50, entryMid - risk * 1.5));
    tp2 = round(Math.min(drl, entryMid - risk * 2.5));
    tp3 = round(Math.min(sdNeg25, tp2 - risk * 0.8));
  }

  const riskDist = Math.max(1e-6, Math.abs(entryMid - stopLoss));
  const rewardDist = Math.abs(tp2 - entryMid);
  const rrRatio = Number(Math.max(1.2, Math.min(8.5, rewardDist / riskDist)).toFixed(2));

  const drawOnLiquidity =
    rangeType === 'Type 3'
      ? {
          label: '50% DRT Equilibrium Mean-Reversion',
          price: eq50,
          side: '50% DRT Equilibrium' as const,
        }
      : bias === 'Bullish'
      ? {
          label: equalHighsLevel ? `EQH / 1.00 DRH Buy-Side Pool` : `1.00 DRH External Buy-Side Liquidity`,
          price: round(drh),
          side: 'DRH / Premium Liquidity' as const,
        }
      : {
          label: equalLowsLevel ? `EQL / 0.00 DRL Sell-Side Pool` : `0.00 DRL External Sell-Side Liquidity`,
          price: round(drl),
          side: 'DRL / Discount Liquidity' as const,
        };

  const confluences: string[] = [
    `${rangeTypeTitle} mapped between 0.00 DRL (${round(drl)}) and 1.00 DRH (${round(drh)}).`,
    `Premium / Discount split at 50% DRT Equilibrium (${eq50}) — price is at ${pos.pct}% (${pos.quadrant}).`,
    `Active Quadrant Levels: 0.25 DRT Discount (${q25}) & 0.75 DRT Premium (${q75}).`,
    `Trigger Model: ${trigger.name} — ${trigger.detail}`,
    `SMT Correlation (${smt.correlatedSymbol}): ${smt.status}.`,
    recentDisplacement
      ? `Institutional displacement confirmed — ${alignedCandidates.length} unmitigated ${bias === 'Bullish' ? 'Discount' : 'Premium'} PD Array(s) mapped.`
      : `Awaiting clean displacement candle into ${entryArrayName} (${entryLow} – ${entryHigh}).`,
  ];

  return {
    symbol: tvSeries.symbol,
    tvSymbol: tvSeries.tvSymbol,
    tradingViewUrl: `https://www.tradingview.com/chart/?symbol=${encodeURIComponent(tvSeries.tvSymbol)}`,
    timeframe,
    currentPrice,
    bid: tvSeries.bid !== null ? round(tvSeries.bid) : null,
    ask: tvSeries.ask !== null ? round(tvSeries.ask) : null,
    changePct: tvSeries.chgPct !== null ? Number(tvSeries.chgPct.toFixed(2)) : null,
    bias,
    rangeType,
    rangeTypeTitle,
    rangeTypeSummary,
    deliveryCycle,
    deliveryCycleDetail,
    activeSessionWindow: getDrtSessionWindow(),
    dealingRange: {
      drh: round(drh),
      q75,
      eq50,
      q25,
      drl: round(drl),
      sdPos25,
      sdPos50,
      sdNeg25,
      sdNeg50,
      rangeHighIndex,
      rangeLowIndex,
      currentPositionPct: pos.pct,
      currentZone: pos.zone,
      quadrant: pos.quadrant,
      alignedWithBias,
      guidance,
    },
    smt,
    trigger,
    equalHighsLevel,
    equalLowsLevel,
    sweepIndex,
    sweepLabel,
    flipIndex,
    drawOnLiquidity,
    pdArrays: pdArrays.slice(0, 14),
    zones: prioritizedZones,
    setup: {
      direction: bias === 'Bullish' ? 'Long (Buy)' : 'Short (Sell)',
      entryModel: `${rangeType} DRT · ${trigger.name}`,
      entryZone: `${Math.min(entryLow, entryHigh)} – ${Math.max(entryLow, entryHigh)}`,
      entryArrayName,
      stopLoss,
      tp1,
      tp2,
      tp3,
      rrRatio,
      confluences,
    },
    candles,
    drtReferenceUrl: drtReferenceUrl || DEFAULT_DRT_YOUTUBE_URL,
    dataSource: 'tradingview_live',
    lastUpdated: new Date().toISOString(),
  };
}
