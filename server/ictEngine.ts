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
  timeframe: string;
  currentPrice: number;
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
}

const BASE_PRICES: Record<string, { price: number; step: number; digits: number }> = {
  EURUSD: { price: 1.0865, step: 0.0014, digits: 5 },
  GBPUSD: { price: 1.2720, step: 0.0018, digits: 5 },
  USDJPY: { price: 151.40, step: 0.22, digits: 3 },
  XAUUSD: { price: 2385.5, step: 4.8, digits: 2 },
  NAS100: { price: 18460, step: 38, digits: 2 },
  US30: { price: 39890, step: 65, digits: 2 },
  BTCUSD: { price: 64350, step: 260, digits: 2 },
  ETHUSD: { price: 3150, step: 18, digits: 2 },
};

function seededRandom(seed: number): () => number {
  let state = seed % 2147483647;
  if (state <= 0) state += 2147483646;
  return () => {
    state = (state * 16807) % 2147483647;
    return (state - 1) / 2147483646;
  };
}

function getNewYorkKillzone(): string {
  const now = new Date();
  // Approximate NY Eastern time (UTC-5)
  const nyHour = (now.getUTCHours() + 19) % 24;
  if (nyHour >= 2 && nyHour < 5) return 'London Open Killzone (02:00 - 05:00 NY)';
  if (nyHour >= 7 && nyHour < 10) return 'New York AM Killzone (07:00 - 10:00 NY)';
  if (nyHour >= 10 && nyHour < 11) return 'ICT Silver Bullet Window (10:00 - 11:00 NY)';
  if (nyHour >= 13 && nyHour < 16) return 'New York PM Session (13:30 - 16:00 NY)';
  return 'Asian Range Accumulation (20:00 - 00:00 NY)';
}

export function runIctMarketAnalysis(symbolRaw: string, timeframeRaw: string, ictChannelId: string): IctAnalysisResult {
  const symbol = BASE_PRICES[symbolRaw] ? symbolRaw : 'EURUSD';
  const timeframe = ['M15', 'H1', 'H4', 'D1'].includes(timeframeRaw) ? timeframeRaw : 'M15';
  const cfg = BASE_PRICES[symbol];

  // Bucket time every 2 minutes so chart feels live yet structurally stable
  const timeBucket = Math.floor(Date.now() / 120000);
  const seedBase = symbol.split('').reduce((acc, ch) => acc + ch.charCodeAt(0) * 31, 0) + timeframe.length * 97 + timeBucket;
  const rand = seededRandom(seedBase);

  const bullishBias = rand() > 0.45;
  const candles: Candle[] = [];
  let cursor = cfg.price * (0.996 + rand() * 0.008);

  const count = 42;
  for (let i = 0; i < count; i++) {
    let drift = 0;
    // Construct realistic ICT Power of 3 price delivery:
    // 0-12: Asian/Range consolidation
    // 13-20: Judas swing liquidity sweep opposite to true bias
    // 21-34: Displacement leg creating FVG + MSS
    // 35-41: OTE retracement into FVG/OB
    if (i < 13) {
      drift = (rand() - 0.5) * cfg.step * 0.7;
    } else if (i < 21) {
      drift = (bullishBias ? -1 : 1) * cfg.step * (0.4 + rand() * 0.6);
    } else if (i < 35) {
      drift = (bullishBias ? 1 : -1) * cfg.step * (0.65 + rand() * 0.85);
    } else {
      drift = (bullishBias ? -1 : 1) * cfg.step * (0.15 + rand() * 0.35);
    }

    const open = cursor;
    const close = Number((open + drift).toFixed(cfg.digits));
    const wickUp = Math.abs(cfg.step * (0.2 + rand() * 0.65));
    const wickDown = Math.abs(cfg.step * (0.2 + rand() * 0.65));
    const high = Number((Math.max(open, close) + wickUp).toFixed(cfg.digits));
    const low = Number((Math.min(open, close) - wickDown).toFixed(cfg.digits));

    const labelDate = new Date(Date.now() - (count - i) * 15 * 60000);
    const timeLabel = `${String(labelDate.getUTCHours()).padStart(2, '0')}:${String(labelDate.getUTCMinutes()).padStart(2, '0')}`;
    candles.push({ index: i, time: timeLabel, open: Number(open.toFixed(cfg.digits)), high, low, close });
    cursor = close;
  }

  // Scan real FVGs across generated OHLC array (3-candle ICT imbalance rule)
  const zones: IctZone[] = [];
  for (let i = 2; i < candles.length - 1; i++) {
    const c1 = candles[i - 2];
    const c3 = candles[i];
    if (c3.low > c1.high) {
      const top = c3.low;
      const bottom = c1.high;
      zones.push({
        type: 'Bullish FVG',
        top,
        bottom,
        ceMid: Number(((top + bottom) / 2).toFixed(cfg.digits)),
        startIndex: i - 2,
        endIndex: candles.length - 1,
        mitigated: candles[candles.length - 1].low <= top,
      });
    } else if (c3.high < c1.low) {
      const top = c1.low;
      const bottom = c3.high;
      zones.push({
        type: 'Bearish FVG',
        top,
        bottom,
        ceMid: Number(((top + bottom) / 2).toFixed(cfg.digits)),
        startIndex: i - 2,
        endIndex: candles.length - 1,
        mitigated: candles[candles.length - 1].high >= bottom,
      });
    }
  }

  // Identify Order Block at displacement origin (candle 20)
  const obCandle = candles[20];
  zones.push({
    type: bullishBias ? 'Bullish OB' : 'Bearish OB',
    top: obCandle.high,
    bottom: obCandle.low,
    ceMid: Number(((obCandle.high + obCandle.low) / 2).toFixed(cfg.digits)),
    startIndex: 20,
    endIndex: candles.length - 1,
    mitigated: false,
  });

  const allHighs = candles.map((c) => c.high);
  const allLows = candles.map((c) => c.low);
  const bslLevel = Number(Math.max(...allHighs).toFixed(cfg.digits));
  const sslLevel = Number(Math.min(...allLows).toFixed(cfg.digits));
  const lastClose = candles[candles.length - 1].close;

  const legLow = Math.min(...candles.slice(14, 24).map((c) => c.low));
  const legHigh = Math.max(...candles.slice(24, 36).map((c) => c.high));
  const range = Math.max(legHigh - legLow, cfg.step);

  const fib618 = Number((bullishBias ? legHigh - range * 0.618 : legLow + range * 0.618).toFixed(cfg.digits));
  const fib705 = Number((bullishBias ? legHigh - range * 0.705 : legLow + range * 0.705).toFixed(cfg.digits));
  const fib786 = Number((bullishBias ? legHigh - range * 0.786 : legLow + range * 0.786).toFixed(cfg.digits));

  const activeFvg = zones.find((z) => z.type === (bullishBias ? 'Bullish FVG' : 'Bearish FVG'));
  const entryMid = activeFvg ? activeFvg.ceMid : fib705;
  const stopLoss = Number((bullishBias ? legLow - cfg.step * 0.45 : legHigh + cfg.step * 0.45).toFixed(cfg.digits));
  const riskDist = Math.abs(entryMid - stopLoss) || cfg.step;
  const tp1 = Number((bullishBias ? entryMid + riskDist * 2.0 : entryMid - riskDist * 2.0).toFixed(cfg.digits));
  const tp2 = Number((bullishBias ? bslLevel : sslLevel).toFixed(cfg.digits));
  const rrRatio = Number((Math.abs(tp1 - entryMid) / riskDist).toFixed(2));

  const confluences = [
    bullishBias
      ? `Sell-Side Liquidity (SSL) swept near ${sslLevel.toFixed(cfg.digits)} during Judas Swing`
      : `Buy-Side Liquidity (BSL) swept near ${bslLevel.toFixed(cfg.digits)} during Judas Swing`,
    `Displacement Market Structure Shift (MSS) confirmed on ${timeframe}`,
    activeFvg
      ? `Unmitigated ${activeFvg.type} Consequent Encroachment (50% CE) at ${activeFvg.ceMid.toFixed(cfg.digits)}`
      : `Optimal Trade Entry (0.705 OTE) aligned at ${fib705.toFixed(cfg.digits)}`,
    `Institutional Order Block resting at ${obCandle.low.toFixed(cfg.digits)} - ${obCandle.high.toFixed(cfg.digits)}`,
  ];

  return {
    symbol,
    timeframe,
    currentPrice: lastClose,
    dailyBias: bullishBias ? 'Bullish' : 'Bearish',
    po3Phase: 'Distribution',
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
      entryZone: activeFvg
        ? `${activeFvg.bottom.toFixed(cfg.digits)} - ${activeFvg.top.toFixed(cfg.digits)}`
        : `${fib786.toFixed(cfg.digits)} - ${fib618.toFixed(cfg.digits)}`,
      stopLoss,
      tp1,
      tp2,
      rrRatio,
      confluences,
    },
    candles,
    ictReferenceChannel: ictChannelId,
  };
}
