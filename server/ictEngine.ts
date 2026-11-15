import { fetchTradingViewChartData, type TvInterval } from './tradingViewFeed.ts';

export interface Candle {
  index: number;
  time: string;
  open: number;
  high: number;
  low: number;
  close: number;
}

export interface IctZone {
  type: 'Bullish FVG' | 'Bearish FVG' | 'Bullish OB' | 'Bearish OB';
  top: number;
  bottom: number;
  ceMid: number;
  startIndex: number;
  endIndex: number;
  mitigated: boolean;
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
  bslLevel: number;
  sslLevel: number;
  oteLevels: {
    fib618: number;
    fib705: number;
    fib786: number;
  };
  zones: IctZone[];
  setup: {
    direction: 'Long (Buy)' | 'Short (Sell)';
    entryZone: string;
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

function getNewYorkKillzone(): string {
  const now = new Date();
  const nyHourStr = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/New_York',
    hour: '2-digit',
    hour12: false,
  }).format(now);
  const nyHour = Number(nyHourStr) % 24;
  if (nyHour >= 2 && nyHour < 5) return 'London Open Killzone (02:00 - 05:00 NY)';
  if (nyHour >= 7 && nyHour < 10) return 'New York AM Killzone (07:00 - 10:00 NY)';
  if (nyHour >= 10 && nyHour < 11) return 'ICT Silver Bullet Window (10:00 - 11:00 NY)';
  if (nyHour >= 13 && nyHour < 16) return 'New York PM Session (13:30 - 16:00 NY)';
  return 'Asian Range Accumulation (20:00 - 00:00 NY)';
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
    trueRanges.push(Math.max(cur.high - cur.low, Math.abs(cur.high - prevClose), Math.abs(cur.low - prevClose)));
  }
  const atr =
    trueRanges.length > 0
      ? trueRanges.reduce((acc, v) => acc + v, 0) / trueRanges.length
      : Math.max(currentPrice * 0.001, Math.pow(10, -digits));
  const minStep = Math.max(atr * 0.65, Math.pow(10, -digits));

  // Scan real 3-candle ICT Fair Value Gaps across TradingView OHLC bars
  const zones: IctZone[] = [];
  for (let i = 2; i < candles.length - 1; i++) {
    const c1 = candles[i - 2];
    const c3 = candles[i];
    const subsequent = candles.slice(i + 1);

    if (c3.low > c1.high) {
      const top = round(c3.low);
      const bottom = round(c1.high);
      const ceMid = round((top + bottom) / 2);
      const mitigated = subsequent.some((k) => k.low <= ceMid);
      zones.push({
        type: 'Bullish FVG',
        top,
        bottom,
        ceMid,
        startIndex: i - 2,
        endIndex: candles.length - 1,
        mitigated,
      });
    } else if (c3.high < c1.low) {
      const top = round(c1.low);
      const bottom = round(c3.high);
      const ceMid = round((top + bottom) / 2);
      const mitigated = subsequent.some((k) => k.high >= ceMid);
      zones.push({
        type: 'Bearish FVG',
        top,
        bottom,
        ceMid,
        startIndex: i - 2,
        endIndex: candles.length - 1,
        mitigated,
      });
    }
  }

  // Determine live market structure bias from TradingView swing progression
  const midIdx = Math.floor(candles.length / 2);
  const firstHalf = candles.slice(0, midIdx);
  const secondHalf = candles.slice(midIdx);
  const firstAvg = firstHalf.reduce((a, b) => a + b.close, 0) / Math.max(1, firstHalf.length);
  const recentHigh = Math.max(...secondHalf.map((c) => c.high));
  const recentLow = Math.min(...secondHalf.map((c) => c.low));
  const bullishBias = currentPrice >= firstAvg;

  // Locate displacement origin candle for Institutional Order Block
  let obIndex = Math.max(2, Math.floor(candles.length * 0.5));
  let maxBody = 0;
  for (let i = 4; i < candles.length - 2; i++) {
    const body = Math.abs(candles[i].close - candles[i].open);
    const matchesBias = bullishBias ? candles[i].close < candles[i].open : candles[i].close > candles[i].open;
    if (matchesBias && body >= maxBody * 0.6) {
      maxBody = Math.max(maxBody, body);
      obIndex = i;
    }
  }
  const obCandle = candles[obIndex];
  zones.push({
    type: bullishBias ? 'Bullish OB' : 'Bearish OB',
    top: round(obCandle.high),
    bottom: round(obCandle.low),
    ceMid: round((obCandle.high + obCandle.low) / 2),
    startIndex: obIndex,
    endIndex: candles.length - 1,
    mitigated: false,
  });

  const bslLevel = round(Math.max(...candles.map((c) => c.high)));
  const sslLevel = round(Math.min(...candles.map((c) => c.low)));

  const legLow = Math.min(sslLevel, recentLow);
  const legHigh = Math.max(bslLevel, recentHigh);
  const range = Math.max(legHigh - legLow, minStep);

  const fib618 = round(bullishBias ? legHigh - range * 0.618 : legLow + range * 0.618);
  const fib705 = round(bullishBias ? legHigh - range * 0.705 : legLow + range * 0.705);
  const fib786 = round(bullishBias ? legHigh - range * 0.786 : legLow + range * 0.786);

  // Anchor Execution Parameters directly to live TradingView price & FVG / OTE structure
  const preferredType = bullishBias ? 'Bullish FVG' : 'Bearish FVG';
  const activeFvg =
    [...zones].reverse().find(
      (z) =>
        z.type === preferredType &&
        !z.mitigated &&
        (bullishBias ? z.ceMid <= currentPrice : z.ceMid >= currentPrice)
    ) ||
    [...zones].reverse().find((z) => z.type === preferredType && !z.mitigated) ||
    [...zones].reverse().find((z) => z.type === preferredType);

  let entryMid = activeFvg ? activeFvg.ceMid : fib705;
  let entryZoneStr = activeFvg
    ? `${activeFvg.bottom.toFixed(digits)} - ${activeFvg.top.toFixed(digits)}`
    : `${Math.min(fib786, fib618).toFixed(digits)} - ${Math.max(fib786, fib618).toFixed(digits)}`;

  // If price is currently past OTE / no active discount/premium FVG remains, anchor to live market + OTE pullback
  if (bullishBias && entryMid > currentPrice) {
    entryMid = fib705 <= currentPrice ? fib705 : currentPrice;
    entryZoneStr =
      fib705 <= currentPrice
        ? `${fib786.toFixed(digits)} - ${fib618.toFixed(digits)}`
        : `${round(currentPrice - atr * 0.25).toFixed(digits)} - ${currentPrice.toFixed(digits)}`;
  } else if (!bullishBias && entryMid < currentPrice) {
    entryMid = fib705 >= currentPrice ? fib705 : currentPrice;
    entryZoneStr =
      fib705 >= currentPrice
        ? `${fib618.toFixed(digits)} - ${fib786.toFixed(digits)}`
        : `${currentPrice.toFixed(digits)} - ${round(currentPrice + atr * 0.25).toFixed(digits)}`;
  }

  const stopBuffer = Math.max(atr * 0.4, minStep * 0.35);
  const stopLoss = round(
    bullishBias
      ? Math.min(obCandle.low, legLow, entryMid - atr) - stopBuffer
      : Math.max(obCandle.high, legHigh, entryMid + atr) + stopBuffer
  );

  const riskDist = Math.max(Math.abs(entryMid - stopLoss), atr * 0.5);
  const tp1 = round(bullishBias ? entryMid + riskDist * 2.0 : entryMid - riskDist * 2.0);
  const rawTp2 = bullishBias ? bslLevel : sslLevel;
  const tp2 = round(
    bullishBias ? Math.max(rawTp2, tp1 + riskDist * 0.65) : Math.min(rawTp2, tp1 - riskDist * 0.65)
  );
  const rrRatio = Number((Math.abs(tp1 - entryMid) / riskDist).toFixed(2));

  const prevClose = candles[candles.length - 2]?.close ?? currentPrice;
  const po3Phase: IctAnalysisResult['po3Phase'] =
    (currentPrice >= prevClose) === bullishBias ? 'Distribution' : 'Manipulation (Judas Swing)';

  const confluences = [
    `Live TradingView feed (${tvData.tvSymbol} · ${timeframe}) anchored at ${currentPrice.toFixed(digits)}`,
    bullishBias
      ? `Sell-Side Liquidity (SSL) defended near ${sslLevel.toFixed(digits)}`
      : `Buy-Side Liquidity (BSL) swept near ${bslLevel.toFixed(digits)}`,
    activeFvg
      ? `${activeFvg.mitigated ? 'Tested' : 'Unmitigated'} ${activeFvg.type} 50% CE at ${activeFvg.ceMid.toFixed(digits)}`
      : `Optimal Trade Entry (0.705 OTE) aligned at ${fib705.toFixed(digits)}`,
    `Order Block zone at ${obCandle.low.toFixed(digits)} - ${obCandle.high.toFixed(digits)} (ATR ${atr.toFixed(digits)})`,
  ];

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
    activeKillzone: getNewYorkKillzone(),
    structureShift: bullishBias
      ? `Bullish MSS above swing high (${timeframe})`
      : `Bearish MSS below swing low (${timeframe})`,
    bslLevel,
    sslLevel,
    oteLevels: { fib618, fib705, fib786 },
    zones: zones.slice(-6),
    setup: {
      direction: bullishBias ? 'Long (Buy)' : 'Short (Sell)',
      entryZone: entryZoneStr,
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
