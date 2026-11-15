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

export interface MarketSymbolQuote {
  sym: string;
  name: string;
  price: number;
  chgPct: number;
  digits: number;
  assetClass: 'fx' | 'metal' | 'index' | 'crypto';
}

export const INITIAL_MARKET_QUOTES: MarketSymbolQuote[] = [
  { sym: 'EURUSD', name: 'Euro / US Dollar', price: 1.0864, chgPct: 0.24, digits: 4, assetClass: 'fx' },
  { sym: 'GBPUSD', name: 'British Pound / US Dollar', price: 1.2718, chgPct: 0.31, digits: 4, assetClass: 'fx' },
  { sym: 'USDJPY', name: 'US Dollar / Japanese Yen', price: 151.38, chgPct: -0.18, digits: 2, assetClass: 'fx' },
  { sym: 'XAUUSD', name: 'Gold Spot / US Dollar', price: 2384.6, chgPct: 0.62, digits: 2, assetClass: 'metal' },
  { sym: 'NAS100', name: 'US Tech 100 Index', price: 18445.2, chgPct: 0.48, digits: 2, assetClass: 'index' },
  { sym: 'US30', name: 'Wall Street 30', price: 39882.0, chgPct: 0.14, digits: 2, assetClass: 'index' },
  { sym: 'BTCUSD', name: 'Bitcoin / US Dollar', price: 64310.0, chgPct: 1.42, digits: 1, assetClass: 'crypto' },
  { sym: 'ETHUSD', name: 'Ethereum / US Dollar', price: 3148.5, chgPct: 0.95, digits: 1, assetClass: 'crypto' },
];
