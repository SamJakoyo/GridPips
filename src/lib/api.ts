const TOKEN_STORAGE_KEY = 'gridpips_auth_token';
let memorySessionToken: string | null = null;

export function setSessionToken(token?: string | null): void {
  const clean = typeof token === 'string' && token.trim() ? token.trim() : null;
  memorySessionToken = clean;
  try {
    if (clean) {
      sessionStorage.setItem(TOKEN_STORAGE_KEY, clean);
    } else {
      sessionStorage.removeItem(TOKEN_STORAGE_KEY);
    }
  } catch {
    // ignore storage errors in restricted contexts
  }
}

export function getSessionToken(): string | null {
  if (memorySessionToken) return memorySessionToken;
  try {
    const stored = sessionStorage.getItem(TOKEN_STORAGE_KEY);
    if (stored) {
      memorySessionToken = stored;
      return stored;
    }
  } catch {
    // ignore storage errors
  }
  return null;
}

export function clearSessionToken(): void {
  setSessionToken(null);
}

export async function apiFetch<T>(url: string, options: RequestInit = {}): Promise<T> {
  const extraHeaders = (options.headers as Record<string, string> | undefined) || {};
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...extraHeaders,
  };

  if (!headers.Authorization && !headers.authorization) {
    const token = getSessionToken();
    if (token) {
      headers.Authorization = `Bearer ${token}`;
    }
  }

  const res = await fetch(url, {
    ...options,
    credentials: 'include',
    headers,
  });

  const rawText = await res.text().catch(() => '');
  let data: Record<string, unknown> = {};
  if (rawText) {
    try {
      const parsed = JSON.parse(rawText);
      if (parsed && typeof parsed === 'object') {
        data = parsed as Record<string, unknown>;
      }
    } catch {
      // non-JSON response (e.g. HTML/plain-text 500 from serverless host)
    }
  }

  if (res.status === 401 && url !== '/api/auth/login' && url !== '/api/auth/register') {
    if (!extraHeaders.Authorization && !extraHeaders.authorization) {
      clearSessionToken();
    }
  }
  if (!res.ok) {
    const serverMessage =
      (typeof data.error === 'string' && data.error.trim()) ||
      (typeof data.message === 'string' && data.message.trim()) ||
      (typeof data.details === 'string' && data.details.trim()) ||
      (rawText.trim() ? rawText.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 280) : '');
    throw new Error(serverMessage || `Request failed (${res.status})`);
  }
  return data as T;
}

export interface TradingViewMarketStatus {
  traditionalOpen: boolean;
  cryptoOpen: boolean;
  openCount: number;
  totalCount: number;
  summaryLabel: string;
  checkedAt: string;
}

export interface MarketSymbolQuote {
  sym: string;
  tvSymbol?: string;
  name: string;
  price: number;
  chgPct: number;
  bid?: number | null;
  ask?: number | null;
  digits: number;
  assetClass: 'fx' | 'metal' | 'index' | 'crypto';
  currentSession?: string | null;
  isMarketOpen?: boolean | null;
  marketStatusLabel?: string;
  lastTickIso?: string | null;
  sessionSchedule?: string | null;
  exchangeTimezone?: string | null;
}

export const INITIAL_MARKET_QUOTES: MarketSymbolQuote[] = [
  { sym: 'EURUSD', tvSymbol: 'FX:EURUSD', name: 'Euro / US Dollar', price: 1.10216, chgPct: 0, digits: 5, assetClass: 'fx' },
  { sym: 'GBPUSD', tvSymbol: 'FX:GBPUSD', name: 'British Pound / US Dollar', price: 1.32109, chgPct: 0, digits: 5, assetClass: 'fx' },
  { sym: 'USDJPY', tvSymbol: 'FX:USDJPY', name: 'US Dollar / Japanese Yen', price: 159.713, chgPct: 0, digits: 3, assetClass: 'fx' },
  { sym: 'XAUUSD', tvSymbol: 'OANDA:XAUUSD', name: 'Gold Spot / US Dollar', price: 3884.69, chgPct: 0, digits: 2, assetClass: 'metal' },
  { sym: 'NAS100', tvSymbol: 'CAPITALCOM:US100', name: 'US Tech 100 Index', price: 27835.9, chgPct: 0, digits: 2, assetClass: 'index' },
  { sym: 'US30', tvSymbol: 'CAPITALCOM:US30', name: 'Wall Street 30', price: 52261.8, chgPct: 0, digits: 2, assetClass: 'index' },
  { sym: 'BTCUSD', tvSymbol: 'BITSTAMP:BTCUSD', name: 'Bitcoin / US Dollar', price: 65362.76, chgPct: 0, digits: 2, assetClass: 'crypto' },
  { sym: 'ETHUSD', tvSymbol: 'BITSTAMP:ETHUSD', name: 'Ethereum / US Dollar', price: 1831.96, chgPct: 0, digits: 2, assetClass: 'crypto' },
];

export interface MarketMiniBar {
  timestampSec: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

export interface AutoScanCandidate {
  symbol: string;
  timeframe: '15M' | '1H';
  strategy: string;
  side: 'BUY' | 'SELL';
  entryPrice: number;
  stopLoss: number;
  tp1: number;
  rrRatio: number;
  volume: number;
  confluences: string[];
  status: 'executed' | 'skipped' | 'signal_ready' | 'failed';
  reason: string;
  orderId?: string;
}

export interface AutoTradeRunResult {
  scannedAt: string;
  metaApiConfigured: boolean;
  usersChecked: number;
  executedCount: number;
  candidates: AutoScanCandidate[];
}

