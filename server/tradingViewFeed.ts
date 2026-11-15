export type TvInterval = '1' | '5' | '15' | '30' | '60' | '240' | 'D' | 'W';

export interface TradingViewBar {
  timestampSec: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

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
  assetClass: 'fx' | 'metal' | 'index' | 'crypto';
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
    assetClass: 'fx' | 'metal' | 'index' | 'crypto';
  }
> = {
  EURUSD: { tvSymbol: 'FX:EURUSD', name: 'Euro / US Dollar', digits: 5, quoteDigits: 5, assetClass: 'fx' },
  GBPUSD: { tvSymbol: 'FX:GBPUSD', name: 'British Pound / US Dollar', digits: 5, quoteDigits: 5, assetClass: 'fx' },
  USDJPY: { tvSymbol: 'FX:USDJPY', name: 'US Dollar / Japanese Yen', digits: 3, quoteDigits: 3, assetClass: 'fx' },
  XAUUSD: { tvSymbol: 'OANDA:XAUUSD', name: 'Gold Spot / US Dollar', digits: 2, quoteDigits: 2, assetClass: 'metal' },
  NAS100: { tvSymbol: 'CAPITALCOM:US100', name: 'US Tech 100 Index', digits: 2, quoteDigits: 2, assetClass: 'index' },
  US30: { tvSymbol: 'CAPITALCOM:US30', name: 'Wall Street 30', digits: 2, quoteDigits: 2, assetClass: 'index' },
  BTCUSD: { tvSymbol: 'BITSTAMP:BTCUSD', name: 'Bitcoin / US Dollar', digits: 2, quoteDigits: 2, assetClass: 'crypto' },
  ETHUSD: { tvSymbol: 'BITSTAMP:ETHUSD', name: 'Ethereum / US Dollar', digits: 2, quoteDigits: 2, assetClass: 'crypto' },
};

export function resolveServerTvSymbol(rawSymbol: string): {
  symbol: string;
  tvSymbol: string;
  digits: number;
  name: string;
  assetClass: 'fx' | 'metal' | 'index' | 'crypto';
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
    const isJpy = cleanSym.includes('JPY');
    const isFx = cleanSym.length === 6 && !cleanSym.includes('USD') ? true : upper.startsWith('FX:');
    return {
      symbol: cleanSym,
      tvSymbol: upper,
      digits: isJpy ? 3 : isFx ? 5 : 2,
      name: cleanSym,
      assetClass: isFx ? 'fx' : 'index',
    };
  }
  if (upper === 'XAGUSD') {
    return { symbol: upper, tvSymbol: 'OANDA:XAGUSD', digits: 3, name: 'Silver Spot / US Dollar', assetClass: 'metal' };
  }
  if (upper === 'US100') {
    return { symbol: 'NAS100', tvSymbol: 'CAPITALCOM:US100', digits: 2, name: 'US Tech 100 Index', assetClass: 'index' };
  }
  if (upper === 'SPX500' || upper === 'US500') {
    return { symbol: 'SPX500', tvSymbol: 'CAPITALCOM:US500', digits: 2, name: 'US 500 Index', assetClass: 'index' };
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
  barCount = 60
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

      const bars = latestBars.slice(-48);
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
      let payload: TradingViewSeriesPayload;
      try {
        payload = await fetchSeriesAttempt(resolved.symbol, resolved.tvSymbol, interval, resolved.digits, 60);
      } catch {
        // Retry once if TradingView dropped the initial WS handshake
        payload = await fetchSeriesAttempt(resolved.symbol, resolved.tvSymbol, interval, resolved.digits, 60);
      }
      const ttl = interval === '1' ? 6000 : interval === '5' || interval === '15' ? 12000 : 20000;
      seriesCache.set(key, { payload, expiresAt: Date.now() + ttl });
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

async function fetchAllQuotesViaWebSocket(): Promise<TradingViewLiveQuote[]> {
  const entries = Object.entries(SYMBOL_METADATA);
  const tvSymbols = entries.map(([, meta]) => meta.tvSymbol);

  return new Promise((resolve, reject) => {
    const ws = openTvWebSocket();
    let settled = false;
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
      for (const [sym, meta] of entries) {
        const q = bag[meta.tvSymbol];
        if (!q || typeof q.lp !== 'number' || !Number.isFinite(q.lp)) continue;
        const sessionState = mapTradingViewSessionState(q.currentSession);
        out.push({
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
        });
      }
      return out;
    };

    const finish = (err?: Error) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      try {
        ws.close();
      } catch {
        // ignore
      }
      if (err) {
        reject(err);
        return;
      }
      const list = buildOutput();
      if (list.length === 0) {
        reject(new Error('TradingView returned no live quotes.'));
        return;
      }
      resolve(list);
    };

    const timer = setTimeout(() => {
      const list = buildOutput();
      if (list.length >= 4) {
        finish();
      } else {
        finish(new Error('Timed out fetching live TradingView market quotes.'));
      }
    }, 5500);

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

            if (tvSymbols.every((s) => typeof bag[s]?.lp === 'number' && typeof bag[s]?.currentSession === 'string')) {
              finish();
              return;
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

export async function getTradingViewLiveQuotes(): Promise<TradingViewLiveQuote[]> {
  if (quotesCache && quotesCache.expiresAt > Date.now()) {
    return quotesCache.quotes;
  }
  if (quotesInFlight) return quotesInFlight;

  quotesInFlight = (async () => {
    try {
      const quotes = await fetchAllQuotesViaWebSocket();
      quotesCache = { quotes, expiresAt: Date.now() + 8000 };
      return quotes;
    } finally {
      quotesInFlight = null;
    }
  })();

  return quotesInFlight;
}
