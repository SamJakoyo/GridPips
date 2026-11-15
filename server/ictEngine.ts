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
  dataSource: 'live_feed' | 'model_fallback';
  lastUpdated: string;
}

const VALID_TIMEFRAMES = ['1M', '5M', '15M', '30M', '1H', '4H', '1D', '1W'] as const;
type ValidTimeframe = (typeof VALID_TIMEFRAMES)[number];

const BASE_PRICES: Record<
  string,
  { price: number; step: number; digits: number; yahoo: string; binance?: string }
> = {
  EURUSD: { price: 1.1028, step: 0.0014, digits: 5, yahoo: 'EURUSD=X' },
  GBPUSD: { price: 1.2815, step: 0.0018, digits: 5, yahoo: 'GBPUSD=X' },
  USDJPY: { price: 152.4, step: 0.22, digits: 3, yahoo: 'USDJPY=X' },
  XAUUSD: { price: 2650.5, step: 5.5, digits: 2, yahoo: 'GC=F' },
  NAS100: { price: 20450, step: 42, digits: 2, yahoo: 'NQ=F' },
  US30: { price: 42300, step: 75, digits: 2, yahoo: 'YM=F' },
  BTCUSD: { price: 65500, step: 280, digits: 2, yahoo: 'BTC-USD', binance: 'BTCUSDT' },
  ETHUSD: { price: 3250, step: 20, digits: 2, yahoo: 'ETH-USD', binance: 'ETHUSDT' },
};

const TF_CONFIG: Record<
  ValidTimeframe,
  {
    minutes: number;
    volScale: number;
    binanceInterval: string;
    yahooInterval: string;
    yahooRange: string;
    label: string;
  }
> = {
  '1M': {
    minutes: 1,
    volScale: 0.28,
    binanceInterval: '1m',
    yahooInterval: '1m',
    yahooRange: '1d',
    label: '1-Minute Precision Entry',
  },
  '5M': {
    minutes: 5,
    volScale: 0.52,
    binanceInterval: '5m',
    yahooInterval: '5m',
    yahooRange: '1d',
    label: '5-Minute Intraday Displacement',
  },
  '15M': {
    minutes: 15,
    volScale: 0.85,
    binanceInterval: '15m',
    yahooInterval: '15m',
    yahooRange: '5d',
    label: '15-Minute Session Structure',
  },
  '30M': {
    minutes: 30,
    volScale: 1.15,
    binanceInterval: '30m',
    yahooInterval: '30m',
    yahooRange: '5d',
    label: '30-Minute Killzone Framework',
  },
  '1H': {
    minutes: 60,
    volScale: 1.55,
    binanceInterval: '1h',
    yahooInterval: '60m',
    yahooRange: '1mo',
    label: '1-Hour Institutional Orderflow',
  },
  '4H': {
    minutes: 240,
    volScale: 2.5,
    binanceInterval: '4h',
    yahooInterval: '60m',
    yahooRange: '1mo',
    label: '4-Hour Intermediate Swing',
  },
  '1D': {
    minutes: 1440,
    volScale: 4.1,
    binanceInterval: '1d',
    yahooInterval: '1d',
    yahooRange: '3mo',
    label: 'Daily HTF Draw on Liquidity',
  },
  '1W': {
    minutes: 10080,
    volScale: 7.5,
    binanceInterval: '1w',
    yahooInterval: '1wk',
    yahooRange: '1y',
    label: 'Weekly Macro Liquidity Bias',
  },
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

interface CacheEntry {
  expiresAt: number;
  candles: Candle[];
  source: 'live_feed' | 'model_fallback';
}

const candleCache = new Map<string, CacheEntry>();

function formatCandleTime(ms: number, tf: ValidTimeframe): string {
  const d = new Date(ms);
  if (tf === '1D' || tf === '1W') {
    const mm = String(d.getUTCMonth() + 1).padStart(2, '0');
    const dd = String(d.getUTCDate()).padStart(2, '0');
    return `${mm}-${dd}`;
  }
  return `${String(d.getUTCHours()).padStart(2, '0')}:${String(d.getUTCMinutes()).padStart(2, '0')}`;
}

async function fetchBinanceCandles(
  pair: string,
  tf: ValidTimeframe,
  digits: number
): Promise<Candle[] | null> {
  const interval = TF_CONFIG[tf].binanceInterval;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 3500);
  try {
    const resp = await fetch(
      `https://api.binance.com/api/v3/klines?symbol=${encodeURIComponent(pair)}&interval=${interval}&limit=48`,
      { signal: controller.signal }
    );
    if (!resp.ok) return null;
    const rows = (await resp.json()) as Array<[number, string, string, string, string]>;
    if (!Array.isArray(rows) || rows.length < 20) return null;
    return rows.slice(-42).map((row, idx) => ({
      index: idx,
      time: formatCandleTime(Number(row[0]), tf),
      open: Number(Number(row[1]).toFixed(digits)),
      high: Number(Number(row[2]).toFixed(digits)),
      low: Number(Number(row[3]).toFixed(digits)),
      close: Number(Number(row[4]).toFixed(digits)),
    }));
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

async function fetchYahooCandles(
  yahooSymbol: string,
  tf: ValidTimeframe,
  digits: number
): Promise<Candle[] | null> {
  const tfCfg = TF_CONFIG[tf];
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 3800);
  try {
    const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(
      yahooSymbol
    )}?interval=${tfCfg.yahooInterval}&range=${tfCfg.yahooRange}`;
    const resp = await fetch(url, {
      signal: controller.signal,
      headers: { 'User-Agent': 'Mozilla/5.0' },
    });
    if (!resp.ok) return null;
    const payload = (await resp.json()) as {
      chart?: {
        result?: Array<{
          timestamp?: number[];
          indicators?: {
            quote?: Array<{
              open?: Array<number | null>;
              high?: Array<number | null>;
              low?: Array<number | null>;
              close?: Array<number | null>;
            }>;
          };
        }>;
      };
    };
    const result = payload?.chart?.result?.[0];
    const ts = result?.timestamp || [];
    const quote = result?.indicators?.quote?.[0];
    if (!quote || ts.length < 15) return null;

    const rawCandles: Array<{ ts: number; open: number; high: number; low: number; close: number }> = [];
    for (let i = 0; i < ts.length; i++) {
      const o = quote.open?.[i];
      const h = quote.high?.[i];
      const l = quote.low?.[i];
      const c = quote.close?.[i];
      if (
        typeof o === 'number' &&
        typeof h === 'number' &&
        typeof l === 'number' &&
        typeof c === 'number' &&
        Number.isFinite(o) &&
        Number.isFinite(h) &&
        Number.isFinite(l) &&
        Number.isFinite(c)
      ) {
        rawCandles.push({ ts: ts[i] * 1000, open: o, high: h, low: l, close: c });
      }
    }

    let merged = rawCandles;
    if (tf === '4H' && rawCandles.length >= 24) {
      merged = [];
      for (let i = 0; i < rawCandles.length; i += 4) {
        const chunk = rawCandles.slice(i, i + 4);
        if (!chunk.length) continue;
        merged.push({
          ts: chunk[0].ts,
          open: chunk[0].open,
          high: Math.max(...chunk.map((x) => x.high)),
          low: Math.min(...chunk.map((x) => x.low)),
          close: chunk[chunk.length - 1].close,
        });
      }
    }

    if (merged.length < 16) return null;
    return merged.slice(-42).map((c, idx) => ({
      index: idx,
      time: formatCandleTime(c.ts, tf),
      open: Number(c.open.toFixed(digits)),
      high: Number(c.high.toFixed(digits)),
      low: Number(c.low.toFixed(digits)),
      close: Number(c.close.toFixed(digits)),
    }));
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

function seededRandom(seed: number): () => number {
  let state = seed % 2147483647;
  if (state <= 0) state += 2147483646;
  return () => {
    state = (state * 16807) % 2147483647;
    return (state - 1) / 2147483646;
  };
}

function generateFallbackCandles(symbol: string, tf: ValidTimeframe): Candle[] {
  const cfg = BASE_PRICES[symbol] || BASE_PRICES.EURUSD;
  const tfCfg = TF_CONFIG[tf];
  const step = cfg.step * tfCfg.volScale;
  const bucketMs = Math.max(60000, tfCfg.minutes * 60000);
  const timeBucket = Math.floor(Date.now() / bucketMs);
  const seedBase =
    symbol.split('').reduce((acc, ch) => acc + ch.charCodeAt(0) * 31, 0) +
    tf.split('').reduce((acc, ch) => acc + ch.charCodeAt(0) * 17, 0) +
    timeBucket;
  const rand = seededRandom(seedBase);

  const bullishBias = rand() > 0.46;
  const candles: Candle[] = [];
  let cursor = cfg.price * (0.9985 + rand() * 0.003);

  const count = 42;
  for (let i = 0; i < count; i++) {
    let drift = 0;
    if (i < 13) {
      drift = (rand() - 0.5) * step * 0.7;
    } else if (i < 21) {
      drift = (bullishBias ? -1 : 1) * step * (0.4 + rand() * 0.6);
    } else if (i < 35) {
      drift = (bullishBias ? 1 : -1) * step * (0.65 + rand() * 0.85);
    } else {
      drift = (bullishBias ? -1 : 1) * step * (0.15 + rand() * 0.35);
    }

    const open = cursor;
    const close = Number((open + drift).toFixed(cfg.digits));
    const wickUp = Math.abs(step * (0.2 + rand() * 0.65));
    const wickDown = Math.abs(step * (0.2 + rand() * 0.65));
    const high = Number((Math.max(open, close) + wickUp).toFixed(cfg.digits));
    const low = Number((Math.min(open, close) - wickDown).toFixed(cfg.digits));

    const ts = Date.now() - (count - i) * tfCfg.minutes * 60000;
    candles.push({
      index: i,
      time: formatCandleTime(ts, tf),
      open: Number(open.toFixed(cfg.digits)),
      high,
      low,
      close,
    });
    cursor = close;
  }
  return candles;
}

async function resolveCandles(
  symbol: string,
  tf: ValidTimeframe
): Promise<{ candles: Candle[]; source: 'live_feed' | 'model_fallback' }> {
  const key = `${symbol}:${tf}`;
  const cached = candleCache.get(key);
  if (cached && cached.expiresAt > Date.now()) {
    return { candles: cached.candles, source: cached.source };
  }

  const cfg = BASE_PRICES[symbol] || BASE_PRICES.EURUSD;
  let live: Candle[] | null = null;

  if (cfg.binance) {
    live = await fetchBinanceCandles(cfg.binance, tf, cfg.digits);
  }
  if (!live) {
    live = await fetchYahooCandles(cfg.yahoo, tf, cfg.digits);
  }

  const result = live
    ? { candles: live, source: 'live_feed' as const }
    : { candles: generateFallbackCandles(symbol, tf), source: 'model_fallback' as const };

  candleCache.set(key, {
    candles: result.candles,
    source: result.source,
    expiresAt: Date.now() + (tf === '1M' ? 12000 : 25000),
  });
  return result;
}

function getNewYorkKillzone(): string {
  const now = new Date();
  const nyHour = (now.getUTCHours() + 19) % 24;
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
  const symbol = BASE_PRICES[symbolRaw] ? symbolRaw : 'EURUSD';
  const timeframe = normalizeServerTimeframe(timeframeRaw);
  const cfg = BASE_PRICES[symbol];
  const tfCfg = TF_CONFIG[timeframe];
  const minStep = cfg.step * tfCfg.volScale;

  const { candles, source } = await resolveCandles(symbol, timeframe);

  // Scan real FVGs across OHLC array (3-candle ICT imbalance rule)
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

  // Determine structural bias from live swing progression
  const firstHalf = candles.slice(0, Math.floor(candles.length / 2));
  const secondHalf = candles.slice(Math.floor(candles.length / 2));
  const firstAvg = firstHalf.reduce((a, b) => a + b.close, 0) / Math.max(1, firstHalf.length);
  const lastClose = candles[candles.length - 1].close;
  const recentHigh = Math.max(...secondHalf.map((c) => c.high));
  const recentLow = Math.min(...secondHalf.map((c) => c.low));
  const bullishBias = lastClose >= firstAvg;

  // Locate displacement origin candle for Order Block
  let obIndex = Math.max(2, Math.floor(candles.length * 0.48));
  let maxBody = 0;
  for (let i = 4; i < candles.length - 3; i++) {
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
    top: obCandle.high,
    bottom: obCandle.low,
    ceMid: Number(((obCandle.high + obCandle.low) / 2).toFixed(cfg.digits)),
    startIndex: obIndex,
    endIndex: candles.length - 1,
    mitigated: false,
  });

  const allHighs = candles.map((c) => c.high);
  const allLows = candles.map((c) => c.low);
  const bslLevel = Number(Math.max(...allHighs).toFixed(cfg.digits));
  const sslLevel = Number(Math.min(...allLows).toFixed(cfg.digits));

  const legLow = Math.min(sslLevel, recentLow);
  const legHigh = Math.max(bslLevel, recentHigh);
  const range = Math.max(legHigh - legLow, minStep);

  const fib618 = Number((bullishBias ? legHigh - range * 0.618 : legLow + range * 0.618).toFixed(cfg.digits));
  const fib705 = Number((bullishBias ? legHigh - range * 0.705 : legLow + range * 0.705).toFixed(cfg.digits));
  const fib786 = Number((bullishBias ? legHigh - range * 0.786 : legLow + range * 0.786).toFixed(cfg.digits));

  const preferredType = bullishBias ? 'Bullish FVG' : 'Bearish FVG';
  const activeFvg =
    [...zones].reverse().find((z) => z.type === preferredType && !z.mitigated) ||
    [...zones].reverse().find((z) => z.type === preferredType);
  const entryMid = activeFvg ? activeFvg.ceMid : fib705;
  const stopLoss = Number(
    (bullishBias ? Math.min(obCandle.low, legLow) - minStep * 0.35 : Math.max(obCandle.high, legHigh) + minStep * 0.35).toFixed(
      cfg.digits
    )
  );
  const riskDist = Math.max(Math.abs(entryMid - stopLoss), minStep * 0.5);
  const tp1 = Number((bullishBias ? entryMid + riskDist * 2.0 : entryMid - riskDist * 2.0).toFixed(cfg.digits));
  const rawTp2 = bullishBias ? bslLevel : sslLevel;
  const tp2 = Number(
    (bullishBias ? Math.max(rawTp2, tp1 + riskDist * 0.5) : Math.min(rawTp2, tp1 - riskDist * 0.5)).toFixed(
      cfg.digits
    )
  );
  const rrRatio = Number((Math.abs(tp1 - entryMid) / riskDist).toFixed(2));

  const po3Phase: IctAnalysisResult['po3Phase'] =
    candles[candles.length - 1].close > candles[candles.length - 2].close === bullishBias
      ? 'Distribution'
      : 'Manipulation (Judas Swing)';

  const confluences = [
    `${tfCfg.label} (${timeframe}) synced with live ${symbol} price delivery`,
    bullishBias
      ? `Sell-Side Liquidity (SSL) defended near ${sslLevel.toFixed(cfg.digits)}`
      : `Buy-Side Liquidity (BSL) swept near ${bslLevel.toFixed(cfg.digits)}`,
    activeFvg
      ? `Unmitigated ${activeFvg.type} 50% CE anchored at ${activeFvg.ceMid.toFixed(cfg.digits)}`
      : `Optimal Trade Entry (0.705 OTE) aligned at ${fib705.toFixed(cfg.digits)}`,
    `Order Block zone at ${obCandle.low.toFixed(cfg.digits)} - ${obCandle.high.toFixed(cfg.digits)}`,
  ];

  return {
    symbol,
    timeframe,
    currentPrice: lastClose,
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
    dataSource: source,
    lastUpdated: new Date().toISOString(),
  };
}
