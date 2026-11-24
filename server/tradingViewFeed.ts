export type TvInterval = '1' | '5' | '15' | '30' | '60' | '240' | 'D' | 'W';

export interface TradingViewBar {
  timestampSec: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

export type ServerAssetClass = 'fx' | 'commodity' | 'index' | 'etf' | 'stock' | 'crypto';

export interface TradingViewLiveQuote {
  symbol: string;
  tvSymbol: string;
  price: number;
  bid: number | null;
  ask: number | null;
  chgPct: number;
  open: number | null;
  high: number | null;
  low: number | null;
  digits: number;
  name: string;
  assetClass: ServerAssetClass;
  currentSession: string | null;
  isMarketOpen: boolean | null;
  marketStatusLabel: string;
  lastTickIso: string | null;
  sessionSchedule: string | null;
  exchangeTimezone: string | null;
}

export interface TradingViewMarketStatusSummary {
  traditionalOpen: boolean;
  cryptoOpen: boolean;
  openCount: number;
  totalCount: number;
  summaryLabel: string;
  checkedAt: string;
}

export interface TradingViewSeriesPayload {
  symbol: string;
  tvSymbol: string;
  interval: TvInterval;
  digits: number;
  currentPrice: number;
  bid: number | null;
  ask: number | null;
  chgPct: number | null;
  bars: TradingViewBar[];
  fetchedAt: string;
}

const TV_WS_URL = 'wss://data.tradingview.com/socket.io/websocket';
const TV_ORIGIN = 'https://www.tradingview.com';
const USER_AGENT =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36';

export const SYMBOL_METADATA: Record<
  string,
  {
    tvSymbol: string;
    name: string;
    digits: number;
    quoteDigits: number;
    assetClass: ServerAssetClass;
  }
> = {
  // Forex Majors, Crosses & Exotics (21 pairs)
  EURUSD: { tvSymbol: 'FX:EURUSD', name: 'Euro / US Dollar', digits: 5, quoteDigits: 5, assetClass: 'fx' },
  GBPUSD: { tvSymbol: 'FX:GBPUSD', name: 'British Pound / US Dollar', digits: 5, quoteDigits: 5, assetClass: 'fx' },
  USDJPY: { tvSymbol: 'FX:USDJPY', name: 'US Dollar / Japanese Yen', digits: 3, quoteDigits: 3, assetClass: 'fx' },
  USDCHF: { tvSymbol: 'FX:USDCHF', name: 'US Dollar / Swiss Franc', digits: 5, quoteDigits: 5, assetClass: 'fx' },
  AUDUSD: { tvSymbol: 'FX:AUDUSD', name: 'Australian Dollar / US Dollar', digits: 5, quoteDigits: 5, assetClass: 'fx' },
  USDCAD: { tvSymbol: 'FX:USDCAD', name: 'US Dollar / Canadian Dollar', digits: 5, quoteDigits: 5, assetClass: 'fx' },
  NZDUSD: { tvSymbol: 'FX:NZDUSD', name: 'New Zealand Dollar / US Dollar', digits: 5, quoteDigits: 5, assetClass: 'fx' },
  EURGBP: { tvSymbol: 'FX:EURGBP', name: 'Euro / British Pound', digits: 5, quoteDigits: 5, assetClass: 'fx' },
  EURJPY: { tvSymbol: 'FX:EURJPY', name: 'Euro / Japanese Yen', digits: 3, quoteDigits: 3, assetClass: 'fx' },
  GBPJPY: { tvSymbol: 'FX:GBPJPY', name: 'British Pound / Japanese Yen', digits: 3, quoteDigits: 3, assetClass: 'fx' },
  AUDJPY: { tvSymbol: 'FX:AUDJPY', name: 'Australian Dollar / Japanese Yen', digits: 3, quoteDigits: 3, assetClass: 'fx' },
  CADJPY: { tvSymbol: 'FX:CADJPY', name: 'Canadian Dollar / Japanese Yen', digits: 3, quoteDigits: 3, assetClass: 'fx' },
  CHFJPY: { tvSymbol: 'FX:CHFJPY', name: 'Swiss Franc / Japanese Yen', digits: 3, quoteDigits: 3, assetClass: 'fx' },
  EURAUD: { tvSymbol: 'FX:EURAUD', name: 'Euro / Australian Dollar', digits: 5, quoteDigits: 5, assetClass: 'fx' },
  EURCAD: { tvSymbol: 'FX:EURCAD', name: 'Euro / Canadian Dollar', digits: 5, quoteDigits: 5, assetClass: 'fx' },
  EURCHF: { tvSymbol: 'FX:EURCHF', name: 'Euro / Swiss Franc', digits: 5, quoteDigits: 5, assetClass: 'fx' },
  GBPAUD: { tvSymbol: 'FX:GBPAUD', name: 'British Pound / Australian Dollar', digits: 5, quoteDigits: 5, assetClass: 'fx' },
  GBPCAD: { tvSymbol: 'FX:GBPCAD', name: 'British Pound / Canadian Dollar', digits: 5, quoteDigits: 5, assetClass: 'fx' },
  AUDCAD: { tvSymbol: 'FX:AUDCAD', name: 'Australian Dollar / Canadian Dollar', digits: 5, quoteDigits: 5, assetClass: 'fx' },
  USDMXN: { tvSymbol: 'FX:USDMXN', name: 'US Dollar / Mexican Peso', digits: 4, quoteDigits: 4, assetClass: 'fx' },
  USDZAR: { tvSymbol: 'FX:USDZAR', name: 'US Dollar / South African Rand', digits: 4, quoteDigits: 4, assetClass: 'fx' },

  // Commodities: Metals, Energy & Agriculture (10 instruments)
  XAUUSD: { tvSymbol: 'OANDA:XAUUSD', name: 'Gold Spot / US Dollar', digits: 2, quoteDigits: 2, assetClass: 'commodity' },
  XAGUSD: { tvSymbol: 'OANDA:XAGUSD', name: 'Silver Spot / US Dollar', digits: 3, quoteDigits: 3, assetClass: 'commodity' },
  XPTUSD: { tvSymbol: 'OANDA:XPTUSD', name: 'Platinum Spot / US Dollar', digits: 2, quoteDigits: 2, assetClass: 'commodity' },
  XPDUSD: { tvSymbol: 'OANDA:XPDUSD', name: 'Palladium Spot / US Dollar', digits: 2, quoteDigits: 2, assetClass: 'commodity' },
  USOIL: { tvSymbol: 'TVC:USOIL', name: 'WTI Crude Oil', digits: 2, quoteDigits: 2, assetClass: 'commodity' },
  UKOIL: { tvSymbol: 'TVC:UKOIL', name: 'Brent Crude Oil', digits: 2, quoteDigits: 2, assetClass: 'commodity' },
  NATGAS: { tvSymbol: 'OANDA:NATGASUSD', name: 'Natural Gas', digits: 3, quoteDigits: 3, assetClass: 'commodity' },
  COPPER: { tvSymbol: 'OANDA:XCUUSD', name: 'Copper Spot', digits: 4, quoteDigits: 4, assetClass: 'commodity' },
  CORN: { tvSymbol: 'OANDA:CORNUSD', name: 'Corn Futures Spot', digits: 3, quoteDigits: 3, assetClass: 'commodity' },
  WHEAT: { tvSymbol: 'OANDA:WHEATUSD', name: 'Wheat Futures Spot', digits: 3, quoteDigits: 3, assetClass: 'commodity' },

  // Global Indices (6 instruments)
  NAS100: { tvSymbol: 'CAPITALCOM:US100', name: 'US Tech 100 Index', digits: 2, quoteDigits: 2, assetClass: 'index' },
  US30: { tvSymbol: 'CAPITALCOM:US30', name: 'Wall Street 30', digits: 2, quoteDigits: 2, assetClass: 'index' },
  SPX500: { tvSymbol: 'CAPITALCOM:US500', name: 'S&P 500 Index', digits: 2, quoteDigits: 2, assetClass: 'index' },
  US2000: { tvSymbol: 'CAPITALCOM:RTY', name: 'Russell 2000 Index', digits: 2, quoteDigits: 2, assetClass: 'index' },
  GER40: { tvSymbol: 'CAPITALCOM:DE40', name: 'Germany 40 (DAX)', digits: 2, quoteDigits: 2, assetClass: 'index' },
  UK100: { tvSymbol: 'CAPITALCOM:UK100', name: 'FTSE 100 Index', digits: 2, quoteDigits: 2, assetClass: 'index' },

  // Exchange-Traded Funds / ETFs (10 instruments)
  SPY: { tvSymbol: 'AMEX:SPY', name: 'SPDR S&P 500 ETF Trust', digits: 2, quoteDigits: 2, assetClass: 'etf' },
  QQQ: { tvSymbol: 'NASDAQ:QQQ', name: 'Invesco QQQ Trust (Nasdaq-100)', digits: 2, quoteDigits: 2, assetClass: 'etf' },
  IWM: { tvSymbol: 'AMEX:IWM', name: 'iShares Russell 2000 ETF', digits: 2, quoteDigits: 2, assetClass: 'etf' },
  DIA: { tvSymbol: 'AMEX:DIA', name: 'SPDR Dow Jones Industrial ETF', digits: 2, quoteDigits: 2, assetClass: 'etf' },
  VOO: { tvSymbol: 'AMEX:VOO', name: 'Vanguard S&P 500 ETF', digits: 2, quoteDigits: 2, assetClass: 'etf' },
  GLD: { tvSymbol: 'AMEX:GLD', name: 'SPDR Gold Shares ETF', digits: 2, quoteDigits: 2, assetClass: 'etf' },
  SLV: { tvSymbol: 'AMEX:SLV', name: 'iShares Silver Trust ETF', digits: 2, quoteDigits: 2, assetClass: 'etf' },
  USO: { tvSymbol: 'AMEX:USO', name: 'United States Oil Fund ETF', digits: 2, quoteDigits: 2, assetClass: 'etf' },
  TLT: { tvSymbol: 'NASDAQ:TLT', name: 'iShares 20+ Year Treasury Bond ETF', digits: 2, quoteDigits: 2, assetClass: 'etf' },
  ARKK: { tvSymbol: 'AMEX:ARKK', name: 'ARK Innovation ETF', digits: 2, quoteDigits: 2, assetClass: 'etf' },

  // Major US Stocks (14 instruments)
  AAPL: { tvSymbol: 'NASDAQ:AAPL', name: 'Apple Inc.', digits: 2, quoteDigits: 2, assetClass: 'stock' },
  MSFT: { tvSymbol: 'NASDAQ:MSFT', name: 'Microsoft Corporation', digits: 2, quoteDigits: 2, assetClass: 'stock' },
  NVDA: { tvSymbol: 'NASDAQ:NVDA', name: 'NVIDIA Corporation', digits: 2, quoteDigits: 2, assetClass: 'stock' },
  TSLA: { tvSymbol: 'NASDAQ:TSLA', name: 'Tesla Inc.', digits: 2, quoteDigits: 2, assetClass: 'stock' },
  AMZN: { tvSymbol: 'NASDAQ:AMZN', name: 'Amazon.com Inc.', digits: 2, quoteDigits: 2, assetClass: 'stock' },
  GOOGL: { tvSymbol: 'NASDAQ:GOOGL', name: 'Alphabet Inc. (Class A)', digits: 2, quoteDigits: 2, assetClass: 'stock' },
  META: { tvSymbol: 'NASDAQ:META', name: 'Meta Platforms Inc.', digits: 2, quoteDigits: 2, assetClass: 'stock' },
  NFLX: { tvSymbol: 'NASDAQ:NFLX', name: 'Netflix Inc.', digits: 2, quoteDigits: 2, assetClass: 'stock' },
  AMD: { tvSymbol: 'NASDAQ:AMD', name: 'Advanced Micro Devices Inc.', digits: 2, quoteDigits: 2, assetClass: 'stock' },
  PLTR: { tvSymbol: 'NASDAQ:PLTR', name: 'Palantir Technologies Inc.', digits: 2, quoteDigits: 2, assetClass: 'stock' },
  COIN: { tvSymbol: 'NASDAQ:COIN', name: 'Coinbase Global Inc.', digits: 2, quoteDigits: 2, assetClass: 'stock' },
  JPM: { tvSymbol: 'NYSE:JPM', name: 'JPMorgan Chase & Co.', digits: 2, quoteDigits: 2, assetClass: 'stock' },
  V: { tvSymbol: 'NYSE:V', name: 'Visa Inc.', digits: 2, quoteDigits: 2, assetClass: 'stock' },
  BA: { tvSymbol: 'NYSE:BA', name: 'The Boeing Company', digits: 2, quoteDigits: 2, assetClass: 'stock' },

  // Crypto Currencies (12 instruments)
  BTCUSD: { tvSymbol: 'BITSTAMP:BTCUSD', name: 'Bitcoin / US Dollar', digits: 2, quoteDigits: 2, assetClass: 'crypto' },
  ETHUSD: { tvSymbol: 'BITSTAMP:ETHUSD', name: 'Ethereum / US Dollar', digits: 2, quoteDigits: 2, assetClass: 'crypto' },
  SOLUSD: { tvSymbol: 'COINBASE:SOLUSD', name: 'Solana / US Dollar', digits: 2, quoteDigits: 2, assetClass: 'crypto' },
  XRPUSD: { tvSymbol: 'BITSTAMP:XRPUSD', name: 'XRP / US Dollar', digits: 4, quoteDigits: 4, assetClass: 'crypto' },
  BNBUSD: { tvSymbol: 'BINANCE:BNBUSDT', name: 'BNB / US Dollar', digits: 2, quoteDigits: 2, assetClass: 'crypto' },
  ADAUSD: { tvSymbol: 'COINBASE:ADAUSD', name: 'Cardano / US Dollar', digits: 4, quoteDigits: 4, assetClass: 'crypto' },
  DOGEUSD: { tvSymbol: 'COINBASE:DOGEUSD', name: 'Dogecoin / US Dollar', digits: 5, quoteDigits: 5, assetClass: 'crypto' },
  AVAXUSD: { tvSymbol: 'COINBASE:AVAXUSD', name: 'Avalanche / US Dollar', digits: 2, quoteDigits: 2, assetClass: 'crypto' },
  LINKUSD: { tvSymbol: 'COINBASE:LINKUSD', name: 'Chainlink / US Dollar', digits: 3, quoteDigits: 3, assetClass: 'crypto' },
  LTCUSD: { tvSymbol: 'BITSTAMP:LTCUSD', name: 'Litecoin / US Dollar', digits: 2, quoteDigits: 2, assetClass: 'crypto' },
  DOTUSD: { tvSymbol: 'COINBASE:DOTUSD', name: 'Polkadot / US Dollar', digits: 3, quoteDigits: 3, assetClass: 'crypto' },
  SUIUSD: { tvSymbol: 'COINBASE:SUIUSD', name: 'Sui / US Dollar', digits: 4, quoteDigits: 4, assetClass: 'crypto' },
};

export function resolveServerTvSymbol(rawSymbol: string): {
  symbol: string;
  tvSymbol: string;
  digits: number;
  name: string;
  assetClass: ServerAssetClass;
} {
  const upper = rawSymbol.trim().toUpperCase();
  const known = SYMBOL_METADATA[upper];
  if (known) {
    return {
      symbol: upper,
      tvSymbol: known.tvSymbol,
      digits: known.digits,
      name: known.name,
      assetClass: known.assetClass,
    };
  }
  if (upper.includes(':')) {
    const cleanSym = upper.split(':')[1] || upper;
    const byClean = SYMBOL_METADATA[cleanSym];
    if (byClean) {
      return {
        symbol: cleanSym,
        tvSymbol: upper,
        digits: byClean.digits,
        name: byClean.name,
        assetClass: byClean.assetClass,
      };
    }
    const isJpy = cleanSym.includes('JPY');
    const isFx = upper.startsWith('FX:');
    const isEquity = upper.startsWith('NASDAQ:') || upper.startsWith('NYSE:') || upper.startsWith('AMEX:');
    const isCrypto = upper.startsWith('BINANCE:') || upper.startsWith('COINBASE:') || upper.startsWith('BITSTAMP:');
    return {
      symbol: cleanSym,
      tvSymbol: upper,
      digits: isJpy ? 3 : isFx ? 5 : 2,
      name: cleanSym,
      assetClass: isFx ? 'fx' : isCrypto ? 'crypto' : isEquity ? 'stock' : 'index',
    };
  }
  if (upper === 'US100') {
    return { symbol: 'NAS100', tvSymbol: 'CAPITALCOM:US100', digits: 2, name: 'US Tech 100 Index', assetClass: 'index' };
  }
  if (upper === 'US500') {
    return { symbol: 'SPX500', tvSymbol: 'CAPITALCOM:US500', digits: 2, name: 'S&P 500 Index', assetClass: 'index' };
  }
  if (upper === 'WTI' || upper === 'CL') {
    return { symbol: 'USOIL', tvSymbol: 'TVC:USOIL', digits: 2, name: 'WTI Crude Oil', assetClass: 'commodity' };
  }
  if (upper === 'BRENT') {
    return { symbol: 'UKOIL', tvSymbol: 'TVC:UKOIL', digits: 2, name: 'Brent Crude Oil', assetClass: 'commodity' };
  }
  if (upper.endsWith('USDT')) {
    return { symbol: upper, tvSymbol: `BINANCE:${upper}`, digits: 2, name: upper, assetClass: 'crypto' };
  }
  if (upper.length <= 5 && /^[A-Z]+$/.test(upper)) {
    return { symbol: upper, tvSymbol: `NASDAQ:${upper}`, digits: 2, name: upper, assetClass: 'stock' };
  }
  return {
    symbol: upper,
    tvSymbol: `FX:${upper}`,
    digits: upper.includes('JPY') ? 3 : 5,
    name: upper,
    assetClass: 'fx',
  };
}

function encodeFrame(payload: string): string {
  return `~m~${payload.length}~m~${payload}`;
}

function encodePacket(fn: string, args: unknown[]): string {
  return encodeFrame(JSON.stringify({ m: fn, p: args }));
}

function parseFrames(raw: string): Array<{ hb?: string; msg?: { m?: string; p?: unknown[] } }> {
  const out: Array<{ hb?: string; msg?: { m?: string; p?: unknown[] } }> = [];
  let i = 0;
  while (i < raw.length) {
    if (!raw.startsWith('~m~', i)) break;
    const lenStart = i + 3;
    const lenEnd = raw.indexOf('~m~', lenStart);
    if (lenEnd === -1) break;
    const len = Number(raw.slice(lenStart, lenEnd));
    if (!Number.isFinite(len) || len <= 0) break;
    const bodyStart = lenEnd + 3;
    const body = raw.slice(bodyStart, bodyStart + len);
    i = bodyStart + len;
    if (body.startsWith('~h~')) {
      out.push({ hb: body });
      continue;
    }
    try {
      out.push({ msg: JSON.parse(body) as { m?: string; p?: unknown[] } });
    } catch {
      // Ignore malformed chunk
    }
  }
  return out;
}

interface SeriesCacheItem {
  expiresAt: number;
  payload: TradingViewSeriesPayload;
}

const seriesCache = new Map<string, SeriesCacheItem>();
const seriesInFlight = new Map<string, Promise<TradingViewSeriesPayload>>();

let quotesCache: { expiresAt: number; quotes: TradingViewLiveQuote[] } | null = null;
let quotesInFlight: Promise<TradingViewLiveQuote[]> | null = null;

function openTvWebSocket(): WebSocket {
  // Node 22 global WebSocket accepts custom headers option in undici WebSocketInit
  return new (WebSocket as unknown as {
    new (url: string, options?: { headers?: Record<string, string> }): WebSocket;
  })(TV_WS_URL, {
    headers: {
      Origin: TV_ORIGIN,
      'User-Agent': USER_AGENT,
    },
  });
}

async function fetchSeriesAttempt(
  symbol: string,
  tvSymbol: string,
  interval: TvInterval,
  digits: number,
  barCount = 100
): Promise<TradingViewSeriesPayload> {
  return new Promise((resolve, reject) => {
    const ws = openTvWebSocket();
    let settled = false;
    const quoteSnapshot: { lp?: number; bid?: number; ask?: number; chp?: number } = {};
    let latestBars: TradingViewBar[] | null = null;

    const finish = (err?: Error) => {
      if (settled) return;
      settled = true;
      clearTimeout(hardTimer);
      if (quoteGraceTimer) clearTimeout(quoteGraceTimer);
      try {
        ws.close();
      } catch {
        // ignore
      }
      if (err) {
        reject(err);
        return;
      }
      if (!latestBars || latestBars.length < 15) {
        reject(new Error(`TradingView returned insufficient OHLC candles for ${tvSymbol} (${interval}).`));
        return;
      }

      const bars = latestBars.slice(-80);
      const lastBar = bars[bars.length - 1];
      const livePrice =
        typeof quoteSnapshot.lp === 'number' && Number.isFinite(quoteSnapshot.lp)
          ? Number(quoteSnapshot.lp.toFixed(digits))
          : Number(lastBar.close.toFixed(digits));

      // Keep the active bar aligned with live quote lp
      bars[bars.length - 1] = {
        ...lastBar,
        high: Number(Math.max(lastBar.high, livePrice).toFixed(digits)),
        low: Number(Math.min(lastBar.low, livePrice).toFixed(digits)),
        close: livePrice,
      };

      resolve({
        symbol,
        tvSymbol,
        interval,
        digits,
        currentPrice: livePrice,
        bid: typeof quoteSnapshot.bid === 'number' ? Number(quoteSnapshot.bid.toFixed(digits)) : null,
        ask: typeof quoteSnapshot.ask === 'number' ? Number(quoteSnapshot.ask.toFixed(digits)) : null,
        chgPct: typeof quoteSnapshot.chp === 'number' ? Number(quoteSnapshot.chp.toFixed(2)) : null,
        bars,
        fetchedAt: new Date().toISOString(),
      });
    };

    let quoteGraceTimer: ReturnType<typeof setTimeout> | null = null;
    const hardTimer = setTimeout(() => {
      if (latestBars && latestBars.length >= 15) {
        finish();
      } else {
        finish(new Error(`Timed out connecting to TradingView live data for ${tvSymbol}.`));
      }
    }, 8500);

    ws.onopen = () => {
      const rnd = Math.random().toString(36).slice(2, 10);
      const cs = `cs_${rnd}`;
      const qs = `qs_${rnd}`;
      ws.send(encodePacket('set_auth_token', ['unauthorized_user_token']));
      ws.send(encodePacket('quote_create_session', [qs]));
      ws.send(encodePacket('quote_set_fields', [qs, 'lp', 'bid', 'ask', 'chp']));
      ws.send(encodePacket('quote_add_symbols', [qs, tvSymbol]));
      ws.send(encodePacket('chart_create_session', [cs, '']));
      ws.send(encodePacket('resolve_symbol', [cs, 'sds_sym_1', tvSymbol]));
      ws.send(encodePacket('create_series', [cs, 'sds_1', 's1', 'sds_sym_1', interval, barCount, '']));
    };

    ws.onmessage = (ev) => {
      const frames = parseFrames(String(ev.data));
      for (const frame of frames) {
        if (frame.hb) {
          try {
            ws.send(encodeFrame(frame.hb));
          } catch {
            // ignore
          }
          continue;
        }
        const msg = frame.msg;
        if (!msg?.m) continue;

        if (msg.m === 'symbol_error') {
          finish(new Error(`TradingView could not resolve symbol ${tvSymbol}.`));
          return;
        }

        if (msg.m === 'qsd') {
          const item = msg.p?.[1] as { n?: string; v?: Record<string, unknown> } | undefined;
          if (item?.v) {
            if (typeof item.v.lp === 'number') quoteSnapshot.lp = item.v.lp;
            if (typeof item.v.bid === 'number') quoteSnapshot.bid = item.v.bid;
            if (typeof item.v.ask === 'number') quoteSnapshot.ask = item.v.ask;
            if (typeof item.v.chp === 'number') quoteSnapshot.chp = item.v.chp;
          }
          if (latestBars && typeof quoteSnapshot.lp === 'number') {
            finish();
            return;
          }
        }

        if (msg.m === 'timescale_update') {
          const seriesObj = (msg.p?.[1] as { sds_1?: { s?: Array<{ v: number[] }> } } | undefined)?.sds_1;
          if (seriesObj?.s && seriesObj.s.length > 0) {
            latestBars = seriesObj.s
              .map((row) => row.v)
              .filter((v) => Array.isArray(v) && v.length >= 5 && v.slice(0, 5).every((n) => Number.isFinite(n)))
              .map((v) => ({
                timestampSec: v[0],
                open: Number(v[1].toFixed(digits)),
                high: Number(v[2].toFixed(digits)),
                low: Number(v[3].toFixed(digits)),
                close: Number(v[4].toFixed(digits)),
                volume: typeof v[5] === 'number' && Number.isFinite(v[5]) ? v[5] : 0,
              }));

            if (typeof quoteSnapshot.lp === 'number') {
              finish();
              return;
            }
            if (!quoteGraceTimer) {
              quoteGraceTimer = setTimeout(() => finish(), 350);
            }
          }
        }
      }
    };

    ws.onerror = () => {
      finish(new Error(`WebSocket connection error reaching TradingView for ${tvSymbol}.`));
    };
  });
}

const staleSeriesCache = new Map<string, TradingViewSeriesPayload>();

async function fetchFallbackSeriesPayload(
  symbol: string,
  tvSymbol: string,
  interval: TvInterval,
  digits: number
): Promise<TradingViewSeriesPayload | null> {
  // 1. Binance public Klines fallback for Crypto pairs
  const binanceCryptoMap: Record<string, string> = {
    BTCUSD: 'BTCUSDT',
    ETHUSD: 'ETHUSDT',
    SOLUSD: 'SOLUSDT',
    XRPUSD: 'XRPUSDT',
    BNBUSD: 'BNBUSDT',
    ADAUSD: 'ADAUSDT',
    DOGEUSD: 'DOGEUSDT',
    AVAXUSD: 'AVAXUSDT',
    LINKUSD: 'LINKUSDT',
    LTCUSD: 'LTCUSDT',
    DOTUSD: 'DOTUSDT',
    SUIUSD: 'SUIUSDT',
  };
  const binanceSym = binanceCryptoMap[symbol];
  if (binanceSym) {
    const binanceIntMap: Record<TvInterval, string> = {
      '1': '1m',
      '5': '5m',
      '15': '15m',
      '30': '30m',
      '60': '1h',
      '240': '4h',
      D: '1d',
      W: '1w',
    };
    const bInt = binanceIntMap[interval] || '15m';
    try {
      const res = await fetch(
        `https://api.binance.com/api/v3/klines?symbol=${binanceSym}&interval=${bInt}&limit=80`,
        { signal: AbortSignal.timeout(5000) }
      );
      if (res.ok) {
        const rows = (await res.json()) as Array<[number, string, string, string, string, string]>;
        if (Array.isArray(rows) && rows.length >= 15) {
          const bars: TradingViewBar[] = rows.map((r) => ({
            timestampSec: Math.floor(Number(r[0]) / 1000),
            open: Number(Number(r[1]).toFixed(digits)),
            high: Number(Number(r[2]).toFixed(digits)),
            low: Number(Number(r[3]).toFixed(digits)),
            close: Number(Number(r[4]).toFixed(digits)),
            volume: Number(r[5]) || 0,
          }));
          const last = bars[bars.length - 1];
          const first = bars[0];
          const chgPct = first.open > 0 ? Number((((last.close - first.open) / first.open) * 100).toFixed(2)) : null;
          return {
            symbol,
            tvSymbol,
            interval,
            digits,
            currentPrice: last.close,
            bid: null,
            ask: null,
            chgPct,
            bars,
            fetchedAt: new Date().toISOString(),
          };
        }
      }
    } catch {
      // fall through to Yahoo
    }
  }

  // 2. Yahoo Finance public chart endpoint fallback for FX, Commodities, Indices, ETFs, Stocks & Crypto
  const yahooSymMap: Record<string, string> = {
    USDJPY: 'JPY=X',
    USDCHF: 'CHF=X',
    USDCAD: 'CAD=X',
    USDMXN: 'MXN=X',
    USDZAR: 'ZAR=X',
    XAUUSD: 'GC=F',
    XAGUSD: 'SI=F',
    XPTUSD: 'PL=F',
    XPDUSD: 'PA=F',
    USOIL: 'CL=F',
    UKOIL: 'BZ=F',
    NATGAS: 'NG=F',
    COPPER: 'HG=F',
    CORN: 'ZC=F',
    WHEAT: 'ZW=F',
    NAS100: 'NQ=F',
    US30: 'YM=F',
    SPX500: 'ES=F',
    US2000: 'RTY=F',
    GER40: '^GDAXI',
    UK100: '^FTSE',
    BTCUSD: 'BTC-USD',
    ETHUSD: 'ETH-USD',
    SOLUSD: 'SOL-USD',
    XRPUSD: 'XRP-USD',
    BNBUSD: 'BNB-USD',
    ADAUSD: 'ADA-USD',
    DOGEUSD: 'DOGE-USD',
    AVAXUSD: 'AVAX-USD',
    LINKUSD: 'LINK-USD',
    LTCUSD: 'LTC-USD',
    DOTUSD: 'DOT-USD',
    SUIUSD: 'SUI20947-USD',
  };
  const meta = SYMBOL_METADATA[symbol];
  const ySym =
    yahooSymMap[symbol] ||
    (meta?.assetClass === 'fx' ? `${symbol}=X` : meta?.assetClass === 'etf' || meta?.assetClass === 'stock' ? symbol : symbol.length === 6 ? `${symbol}=X` : symbol);
  const yahooIntMap: Record<TvInterval, { interval: string; range: string }> = {
    '1': { interval: '1m', range: '1d' },
    '5': { interval: '5m', range: '5d' },
    '15': { interval: '15m', range: '5d' },
    '30': { interval: '30m', range: '1mo' },
    '60': { interval: '60m', range: '1mo' },
    '240': { interval: '60m', range: '3mo' },
    D: { interval: '1d', range: '6mo' },
    W: { interval: '1wk', range: '2y' },
  };
  const yCfg = yahooIntMap[interval] || { interval: '15m', range: '5d' };

  try {
    const res = await fetch(
      `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(ySym)}?interval=${yCfg.interval}&range=${yCfg.range}`,
      {
        headers: { 'User-Agent': USER_AGENT },
        signal: AbortSignal.timeout(5500),
      }
    );
    if (!res.ok) return null;
    const json = (await res.json()) as {
      chart?: {
        result?: Array<{
          timestamp?: number[];
          indicators?: {
            quote?: Array<{
              open?: Array<number | null>;
              high?: Array<number | null>;
              low?: Array<number | null>;
              close?: Array<number | null>;
              volume?: Array<number | null>;
            }>;
          };
        }>;
      };
    };
    const result = json.chart?.result?.[0];
    const tsList = result?.timestamp || [];
    const q = result?.indicators?.quote?.[0];
    if (!q || tsList.length < 15) return null;

    const rawBars: TradingViewBar[] = [];
    for (let i = 0; i < tsList.length; i++) {
      const o = q.open?.[i];
      const h = q.high?.[i];
      const l = q.low?.[i];
      const c = q.close?.[i];
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
        rawBars.push({
          timestampSec: tsList[i],
          open: Number(o.toFixed(digits)),
          high: Number(h.toFixed(digits)),
          low: Number(l.toFixed(digits)),
          close: Number(c.toFixed(digits)),
          volume: typeof q.volume?.[i] === 'number' ? Number(q.volume[i]) : 0,
        });
      }
    }
    const bars = rawBars.slice(-80);
    if (bars.length < 15) return null;
    const last = bars[bars.length - 1];
    const first = bars[0];
    const chgPct = first.open > 0 ? Number((((last.close - first.open) / first.open) * 100).toFixed(2)) : null;
    return {
      symbol,
      tvSymbol,
      interval,
      digits,
      currentPrice: last.close,
      bid: null,
      ask: null,
      chgPct,
      bars,
      fetchedAt: new Date().toISOString(),
    };
  } catch {
    return null;
  }
}

export async function fetchTradingViewChartData(
  rawSymbol: string,
  interval: TvInterval
): Promise<TradingViewSeriesPayload> {
  const resolved = resolveServerTvSymbol(rawSymbol);
  const key = `${resolved.tvSymbol}:${interval}`;
  const cached = seriesCache.get(key);
  if (cached && cached.expiresAt > Date.now()) {
    return cached.payload;
  }

  const existing = seriesInFlight.get(key);
  if (existing) return existing;

  const job = (async () => {
    try {
      let payload: TradingViewSeriesPayload | null = null;
      try {
        payload = await fetchSeriesAttempt(resolved.symbol, resolved.tvSymbol, interval, resolved.digits, 100);
      } catch {
        try {
          // Retry once if TradingView dropped the initial WS handshake
          payload = await fetchSeriesAttempt(resolved.symbol, resolved.tvSymbol, interval, resolved.digits, 100);
        } catch {
          payload = await fetchFallbackSeriesPayload(resolved.symbol, resolved.tvSymbol, interval, resolved.digits);
        }
      }

      if (!payload) {
        const stale = staleSeriesCache.get(key);
        if (stale) {
          return stale;
        }
        throw new Error(`Unable to fetch live OHLC data for ${resolved.tvSymbol}.`);
      }

      const ttl = interval === '1' ? 6000 : interval === '5' || interval === '15' ? 12000 : 20000;
      seriesCache.set(key, { payload, expiresAt: Date.now() + ttl });
      staleSeriesCache.set(key, payload);
      return payload;
    } finally {
      seriesInFlight.delete(key);
    }
  })();

  seriesInFlight.set(key, job);
  return job;
}

function mapTradingViewSessionState(
  rawSession?: string | null
): { currentSession: string | null; isMarketOpen: boolean | null; marketStatusLabel: string } {
  if (!rawSession || typeof rawSession !== 'string') {
    return { currentSession: null, isMarketOpen: null, marketStatusLabel: 'Live' };
  }
  const normalized = rawSession.trim().toLowerCase();
  if (normalized === 'market') {
    return { currentSession: normalized, isMarketOpen: true, marketStatusLabel: 'Open' };
  }
  if (normalized === 'pre_market') {
    return { currentSession: normalized, isMarketOpen: true, marketStatusLabel: 'Pre-market' };
  }
  if (normalized === 'post_market') {
    return { currentSession: normalized, isMarketOpen: true, marketStatusLabel: 'Post-market' };
  }
  if (normalized === 'out_of_session') {
    return { currentSession: normalized, isMarketOpen: false, marketStatusLabel: 'Closed' };
  }
  if (normalized === 'holiday') {
    return { currentSession: normalized, isMarketOpen: false, marketStatusLabel: 'Holiday closed' };
  }
  return { currentSession: normalized, isMarketOpen: null, marketStatusLabel: normalized };
}

export function summarizeTradingViewMarketStatus(
  quotes: TradingViewLiveQuote[]
): TradingViewMarketStatusSummary {
  const traditional = quotes.filter((q) => q.assetClass !== 'crypto');
  const crypto = quotes.filter((q) => q.assetClass === 'crypto');
  const openCount = quotes.filter((q) => q.isMarketOpen === true).length;
  const traditionalOpen = traditional.some((q) => q.isMarketOpen === true);
  const cryptoOpen = crypto.some((q) => q.isMarketOpen === true);

  let summaryLabel = 'Markets closed';
  if (traditionalOpen && cryptoOpen) {
    summaryLabel = 'Markets open';
  } else if (traditionalOpen) {
    summaryLabel = 'FX & Indices open';
  } else if (cryptoOpen) {
    summaryLabel = 'FX & Indices closed · Crypto open';
  }

  return {
    traditionalOpen,
    cryptoOpen,
    openCount,
    totalCount: quotes.length,
    summaryLabel,
    checkedAt: new Date().toISOString(),
  };
}

const lastGoodQuotesBySymbol = new Map<string, TradingViewLiveQuote>();

async function fetchQuoteBatchViaWebSocket(
  batchEntries: Array<[string, (typeof SYMBOL_METADATA)[string]]>
): Promise<TradingViewLiveQuote[]> {
  const tvSymbols = batchEntries.map(([, meta]) => meta.tvSymbol);

  return new Promise((resolve, reject) => {
    const ws = openTvWebSocket();
    let settled = false;
    let graceTimer: ReturnType<typeof setTimeout> | null = null;
    const bag: Record<
      string,
      {
        lp?: number;
        chp?: number;
        bid?: number;
        ask?: number;
        open?: number;
        high?: number;
        low?: number;
        currentSession?: string;
        lpTime?: number;
        sessionDisplay?: string;
        timezone?: string;
      }
    > = {};

    const buildOutput = (): TradingViewLiveQuote[] => {
      const out: TradingViewLiveQuote[] = [];
      for (const [sym, meta] of batchEntries) {
        const q = bag[meta.tvSymbol];
        if (!q || typeof q.lp !== 'number' || !Number.isFinite(q.lp)) {
          const cached = lastGoodQuotesBySymbol.get(sym);
          if (cached) out.push(cached);
          continue;
        }
        const sessionState = mapTradingViewSessionState(q.currentSession);
        const quote: TradingViewLiveQuote = {
          symbol: sym,
          tvSymbol: meta.tvSymbol,
          name: meta.name,
          digits: meta.quoteDigits,
          assetClass: meta.assetClass,
          price: Number(q.lp.toFixed(meta.quoteDigits)),
          bid: typeof q.bid === 'number' ? Number(q.bid.toFixed(meta.quoteDigits)) : null,
          ask: typeof q.ask === 'number' ? Number(q.ask.toFixed(meta.quoteDigits)) : null,
          chgPct: typeof q.chp === 'number' ? Number(q.chp.toFixed(2)) : 0,
          open: typeof q.open === 'number' ? Number(q.open.toFixed(meta.quoteDigits)) : null,
          high: typeof q.high === 'number' ? Number(q.high.toFixed(meta.quoteDigits)) : null,
          low: typeof q.low === 'number' ? Number(q.low.toFixed(meta.quoteDigits)) : null,
          currentSession: sessionState.currentSession,
          isMarketOpen: sessionState.isMarketOpen,
          marketStatusLabel: sessionState.marketStatusLabel,
          lastTickIso:
            typeof q.lpTime === 'number' && Number.isFinite(q.lpTime)
              ? new Date(q.lpTime * 1000).toISOString()
              : null,
          sessionSchedule: typeof q.sessionDisplay === 'string' ? q.sessionDisplay : null,
          exchangeTimezone: typeof q.timezone === 'string' ? q.timezone : null,
        };
        lastGoodQuotesBySymbol.set(sym, quote);
        out.push(quote);
      }
      return out;
    };

    const finish = (err?: Error) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      if (graceTimer) clearTimeout(graceTimer);
      try {
        ws.close();
      } catch {
        // ignore
      }
      if (err) {
        const partial = buildOutput();
        if (partial.length > 0) {
          resolve(partial);
          return;
        }
        reject(err);
        return;
      }
      resolve(buildOutput());
    };

    const timer = setTimeout(() => {
      finish();
    }, 5200);

    ws.onopen = () => {
      const qs = `qs_${Math.random().toString(36).slice(2, 10)}`;
      ws.send(encodePacket('set_auth_token', ['unauthorized_user_token']));
      ws.send(encodePacket('quote_create_session', [qs]));
      ws.send(
        encodePacket('quote_set_fields', [
          qs,
          'lp',
          'chp',
          'bid',
          'ask',
          'open_price',
          'high_price',
          'low_price',
          'current_session',
          'lp_time',
          'session-display',
          'timezone',
        ])
      );
      ws.send(encodePacket('quote_add_symbols', [qs, ...tvSymbols]));
    };

    ws.onmessage = (ev) => {
      for (const frame of parseFrames(String(ev.data))) {
        if (frame.hb) {
          try {
            ws.send(encodeFrame(frame.hb));
          } catch {
            // ignore
          }
          continue;
        }
        const msg = frame.msg;
        if (msg?.m === 'qsd') {
          const item = msg.p?.[1] as { n?: string; v?: Record<string, unknown> } | undefined;
          if (item?.n && item?.v) {
            const cur = bag[item.n] || {};
            if (typeof item.v.lp === 'number') cur.lp = item.v.lp;
            if (typeof item.v.chp === 'number') cur.chp = item.v.chp;
            if (typeof item.v.bid === 'number') cur.bid = item.v.bid;
            if (typeof item.v.ask === 'number') cur.ask = item.v.ask;
            if (typeof item.v.open_price === 'number') cur.open = item.v.open_price;
            if (typeof item.v.high_price === 'number') cur.high = item.v.high_price;
            if (typeof item.v.low_price === 'number') cur.low = item.v.low_price;
            if (typeof item.v.current_session === 'string') cur.currentSession = item.v.current_session;
            if (typeof item.v.lp_time === 'number') cur.lpTime = item.v.lp_time;
            if (typeof item.v['session-display'] === 'string') cur.sessionDisplay = item.v['session-display'];
            if (typeof item.v.timezone === 'string') cur.timezone = item.v.timezone;
            bag[item.n] = cur;

            const readyCount = tvSymbols.filter((s) => typeof bag[s]?.lp === 'number').length;
            if (tvSymbols.every((s) => typeof bag[s]?.lp === 'number' && typeof bag[s]?.currentSession === 'string')) {
              finish();
              return;
            }
            if (!graceTimer && readyCount >= Math.ceil(tvSymbols.length * 0.85)) {
              graceTimer = setTimeout(() => finish(), 900);
            }
          }
        }
      }
    };

    ws.onerror = () => {
      finish(new Error('TradingView quote WebSocket error.'));
    };
  });
}

async function fetchAllQuotesViaWebSocket(): Promise<TradingViewLiveQuote[]> {
  const entries = Object.entries(SYMBOL_METADATA);
  const chunkSize = 25;
  const chunks: Array<Array<[string, (typeof SYMBOL_METADATA)[string]]>> = [];
  for (let i = 0; i < entries.length; i += chunkSize) {
    chunks.push(entries.slice(i, i + chunkSize));
  }

  const settled = await Promise.allSettled(chunks.map((chunk) => fetchQuoteBatchViaWebSocket(chunk)));
  const bySymbol = new Map<string, TradingViewLiveQuote>();
  for (const res of settled) {
    if (res.status === 'fulfilled') {
      for (const q of res.value) {
        bySymbol.set(q.symbol, q);
      }
    }
  }

  const ordered: TradingViewLiveQuote[] = [];
  for (const [sym] of entries) {
    const q = bySymbol.get(sym) || lastGoodQuotesBySymbol.get(sym);
    if (q) ordered.push(q);
  }

  if (ordered.length === 0) {
    throw new Error('TradingView returned no live quotes.');
  }
  return ordered;
}

export async function getTradingViewLiveQuotes(): Promise<TradingViewLiveQuote[]> {
  if (quotesCache && quotesCache.expiresAt > Date.now()) {
    return quotesCache.quotes;
  }
  if (quotesInFlight) return quotesInFlight;

  quotesInFlight = (async () => {
    try {
      const quotes = await fetchAllQuotesViaWebSocket();
      quotesCache = { quotes, expiresAt: Date.now() + 12000 };
      return quotes;
    } finally {
      quotesInFlight = null;
    }
  })();

  return quotesInFlight;
}
