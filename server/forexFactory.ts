import { db } from './db.ts';

export type CalendarImpact = 'High' | 'Medium' | 'Low' | 'Holiday';

export interface ForexFactoryCalendarEvent {
  id: string;
  title: string;
  currency: string;
  impact: CalendarImpact;
  dateIso: string;
  nyDateKey: string;
  nyDateLabel: string;
  nyTimeLabel: string;
  isToday: boolean;
  isUpcoming: boolean;
  actual: string;
  forecast: string;
  previous: string;
  ffUrl: string;
}

export interface LiveMarketNewsItem {
  id: string;
  title: string;
  summary: string;
  category: 'Forex Factory' | 'Central Banks' | 'Forex' | 'Gold' | 'Indices' | 'Crypto';
  source: string;
  url: string;
  publishedAt: string;
  timeAgo: string;
}

export interface ForexFactoryFeedResponse {
  source: 'forexfactory.com';
  calendarFeedProvider: string;
  calendarIsFallback: boolean;
  newsFeedProviders: string[];
  updatedAt: string;
  nyNowLabel: string;
  nyTodayKey: string;
  ffCalendarUrl: string;
  ffNewsUrl: string;
  events: ForexFactoryCalendarEvent[];
  news: LiveMarketNewsItem[];
}

const BROWSER_UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36';

const FF_CALENDAR_JSON_URL = 'https://nfs.faireconomy.media/ff_calendar_thisweek.json';
const FF_CALENDAR_TTL_MS = 15 * 60 * 1000; // Respect FairEconomy rate limits
const FALLBACK_CALENDAR_TTL_MS = 3 * 60 * 1000;
const FF_COOLDOWN_MS = 6 * 60 * 1000;
const NEWS_TTL_MS = 2 * 60 * 1000;

const DB_CALENDAR_KEY = 'ff_calendar_snapshot_v1';
const DB_NEWS_KEY = 'ff_news_snapshot_v1';

interface CachedCalendarState {
  fetchedAt: number;
  provider: string;
  isFallback: boolean;
  events: ForexFactoryCalendarEvent[];
}

interface CachedNewsState {
  fetchedAt: number;
  providers: string[];
  items: LiveMarketNewsItem[];
}

let memoryCalendarCache: CachedCalendarState | null = null;
let memoryNewsCache: CachedNewsState | null = null;
let ffCooldownUntil = 0;

function readDbJson<T>(key: string): T | null {
  try {
    const row = db.prepare('SELECT value FROM site_settings WHERE key = ?').get(key) as { value: string } | undefined;
    if (!row?.value) return null;
    return JSON.parse(row.value) as T;
  } catch {
    return null;
  }
}

function writeDbJson(key: string, payload: unknown): void {
  try {
    db.prepare(
      `INSERT INTO site_settings (key, value) VALUES (?, ?)
       ON CONFLICT(key) DO UPDATE SET value = excluded.value`
    ).run(key, JSON.stringify(payload));
  } catch {
    // Non-fatal cache write error
  }
}

function formatNyParts(date: Date): {
  nyDateKey: string;
  nyDateLabel: string;
  nyTimeLabel: string;
  ffDayParam: string;
} {
  const keyFmt = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/New_York',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  });
  const nyDateKey = keyFmt.format(date);

  const labelFmt = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/New_York',
    weekday: 'short',
    month: 'short',
    day: 'numeric',
  });
  const nyDateLabel = labelFmt.format(date);

  const timeFmt = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/New_York',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  });
  const rawTime = timeFmt.format(date);
  const nyTimeLabel = `${rawTime === '24:00' ? '00:00' : rawTime} NY`;

  const monthLower = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/New_York',
    month: 'short',
  })
    .format(date)
    .toLowerCase();
  const dayNum = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/New_York',
    day: 'numeric',
  }).format(date);
  const yearNum = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/New_York',
    year: 'numeric',
  }).format(date);

  return {
    nyDateKey,
    nyDateLabel,
    nyTimeLabel,
    ffDayParam: `${monthLower}${dayNum}.${yearNum}`,
  };
}

function getCurrentNyInfo(): { nyTodayKey: string; nyNowLabel: string } {
  const now = new Date();
  const parts = formatNyParts(now);
  return {
    nyTodayKey: parts.nyDateKey,
    nyNowLabel: `${parts.nyDateLabel} · ${parts.nyTimeLabel}`,
  };
}

function normalizeImpact(raw: unknown): CalendarImpact {
  const v = String(raw || '').trim().toLowerCase();
  if (v === 'high' || v === '1') return 'High';
  if (v === 'medium' || v === '0') return 'Medium';
  if (v === 'holiday') return 'Holiday';
  return 'Low';
}

function refreshDynamicFlags(events: ForexFactoryCalendarEvent[], nyTodayKey: string): ForexFactoryCalendarEvent[] {
  const cutoffMs = Date.now() - 15 * 60 * 1000;
  return events.map((ev) => {
    const ms = Date.parse(ev.dateIso);
    return {
      ...ev,
      isToday: ev.nyDateKey === nyTodayKey,
      isUpcoming: Number.isFinite(ms) ? ms >= cutoffMs : false,
    };
  });
}

async function fetchOfficialForexFactoryCalendar(nyTodayKey: string): Promise<ForexFactoryCalendarEvent[] | null> {
  if (Date.now() < ffCooldownUntil) {
    return null;
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 9000);
  try {
    const res = await fetch(FF_CALENDAR_JSON_URL, {
      headers: {
        'User-Agent': BROWSER_UA,
        Accept: 'application/json,text/plain,*/*',
      },
      signal: controller.signal,
    });

    const text = await res.text();
    if (!res.ok || !text.trim().startsWith('[')) {
      if (text.toLowerCase().includes('rate limited') || res.status === 429 || res.status === 403) {
        ffCooldownUntil = Date.now() + FF_COOLDOWN_MS;
      }
      return null;
    }

    const raw = JSON.parse(text) as Array<{
      title?: string;
      country?: string;
      date?: string;
      impact?: string;
      forecast?: string;
      previous?: string;
      actual?: string;
    }>;

    if (!Array.isArray(raw) || raw.length === 0) return null;

    const events: ForexFactoryCalendarEvent[] = [];
    for (let i = 0; i < raw.length; i++) {
      const item = raw[i];
      if (!item?.title || !item?.date) continue;
      const parsed = new Date(item.date);
      if (Number.isNaN(parsed.getTime())) continue;

      const ny = formatNyParts(parsed);
      const currency = String(item.country || 'USD').toUpperCase().slice(0, 6);
      const slug = item.title
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-|-$/g, '')
        .slice(0, 36);

      events.push({
        id: `ff-${currency}-${ny.nyDateKey}-${i}-${slug}`,
        title: item.title.trim(),
        currency,
        impact: normalizeImpact(item.impact),
        dateIso: parsed.toISOString(),
        nyDateKey: ny.nyDateKey,
        nyDateLabel: ny.nyDateLabel,
        nyTimeLabel: ny.nyTimeLabel,
        isToday: ny.nyDateKey === nyTodayKey,
        isUpcoming: parsed.getTime() >= Date.now() - 15 * 60 * 1000,
        actual: String(item.actual || '').trim(),
        forecast: String(item.forecast || '').trim(),
        previous: String(item.previous || '').trim(),
        ffUrl: `https://www.forexfactory.com/calendar?day=${ny.ffDayParam}`,
      });
    }

    events.sort((a, b) => Date.parse(a.dateIso) - Date.parse(b.dateIso));
    return events.length > 0 ? events : null;
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

function formatCalendarNumber(raw: unknown): string {
  if (raw === null || raw === undefined || raw === '') return '';
  if (typeof raw === 'number') {
    if (Math.abs(raw) >= 1_000_000_000) return `${(raw / 1_000_000_000).toFixed(2)}B`;
    if (Math.abs(raw) >= 1_000_000) return `${(raw / 1_000_000).toFixed(2)}M`;
    if (Math.abs(raw) >= 1_000) return `${(raw / 1_000).toFixed(1)}K`;
    return String(raw);
  }
  return String(raw).trim();
}

async function fetchMirrorWeeklyCalendar(nyTodayKey: string): Promise<ForexFactoryCalendarEvent[] | null> {
  const now = new Date();
  const dayOfWeek = now.getUTCDay(); // 0=Sun
  const startOfWeek = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() - dayOfWeek, 0, 0, 0));
  const endOfWeek = new Date(startOfWeek.getTime() + 7 * 24 * 60 * 60 * 1000 - 1000);

  const url = `https://economic-calendar.tradingview.com/events?from=${encodeURIComponent(
    startOfWeek.toISOString()
  )}&to=${encodeURIComponent(endOfWeek.toISOString())}&countries=US,EU,GB,JP,AU,CA,CH,NZ,CN`;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 9000);
  try {
    const res = await fetch(url, {
      headers: {
        'User-Agent': BROWSER_UA,
        Origin: 'https://www.tradingview.com',
        Referer: 'https://www.tradingview.com/',
        Accept: 'application/json',
      },
      signal: controller.signal,
    });
    if (!res.ok) return null;

    const json = (await res.json()) as {
      status?: string;
      result?: Array<{
        id?: string;
        title?: string;
        currency?: string;
        importance?: number;
        date?: string;
        actual?: number | string | null;
        forecast?: number | string | null;
        previous?: number | string | null;
      }>;
    };

    const list = json?.result;
    if (!Array.isArray(list) || list.length === 0) return null;

    const events: ForexFactoryCalendarEvent[] = [];
    for (let i = 0; i < list.length; i++) {
      const item = list[i];
      if (!item?.title || !item?.date) continue;
      const parsed = new Date(item.date);
      if (Number.isNaN(parsed.getTime())) continue;
      const ny = formatNyParts(parsed);
      const currency = String(item.currency || 'USD').toUpperCase().slice(0, 6);

      events.push({
        id: `tv-${item.id || i}-${currency}`,
        title: item.title.trim(),
        currency,
        impact: normalizeImpact(item.importance),
        dateIso: parsed.toISOString(),
        nyDateKey: ny.nyDateKey,
        nyDateLabel: ny.nyDateLabel,
        nyTimeLabel: ny.nyTimeLabel,
        isToday: ny.nyDateKey === nyTodayKey,
        isUpcoming: parsed.getTime() >= Date.now() - 15 * 60 * 1000,
        actual: formatCalendarNumber(item.actual),
        forecast: formatCalendarNumber(item.forecast),
        previous: formatCalendarNumber(item.previous),
        ffUrl: `https://www.forexfactory.com/calendar?day=${ny.ffDayParam}`,
      });
    }

    events.sort((a, b) => Date.parse(a.dateIso) - Date.parse(b.dateIso));
    return events.length > 0 ? events : null;
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

async function getLiveCalendar(nyTodayKey: string, forceRefresh = false): Promise<CachedCalendarState> {
  if (!memoryCalendarCache) {
    const saved = readDbJson<CachedCalendarState>(DB_CALENDAR_KEY);
    if (saved?.events?.length) {
      memoryCalendarCache = saved;
    }
  }

  const now = Date.now();
  if (memoryCalendarCache) {
    const ttl = memoryCalendarCache.isFallback ? FALLBACK_CALENDAR_TTL_MS : FF_CALENDAR_TTL_MS;
    if (!forceRefresh && now - memoryCalendarCache.fetchedAt < ttl) {
      return {
        ...memoryCalendarCache,
        events: refreshDynamicFlags(memoryCalendarCache.events, nyTodayKey),
      };
    }
    // Even on manual refresh, avoid hammering FairEconomy if valid FF data is < 5 mins old
    if (forceRefresh && !memoryCalendarCache.isFallback && now - memoryCalendarCache.fetchedAt < 5 * 60 * 1000) {
      return {
        ...memoryCalendarCache,
        events: refreshDynamicFlags(memoryCalendarCache.events, nyTodayKey),
      };
    }
  }

  const officialEvents = await fetchOfficialForexFactoryCalendar(nyTodayKey);
  if (officialEvents && officialEvents.length > 0) {
    const state: CachedCalendarState = {
      fetchedAt: now,
      provider: 'Forex Factory (FairEconomy Weekly JSON)',
      isFallback: false,
      events: officialEvents,
    };
    memoryCalendarCache = state;
    writeDbJson(DB_CALENDAR_KEY, state);
    return state;
  }

  // If official FF feed is temporarily rate-limited, prefer a same-week cached FF snapshot if < 4h old
  if (memoryCalendarCache && !memoryCalendarCache.isFallback && now - memoryCalendarCache.fetchedAt < 4 * 60 * 60 * 1000) {
    return {
      ...memoryCalendarCache,
      events: refreshDynamicFlags(memoryCalendarCache.events, nyTodayKey),
    };
  }

  const mirrorEvents = await fetchMirrorWeeklyCalendar(nyTodayKey);
  if (mirrorEvents && mirrorEvents.length > 0) {
    const state: CachedCalendarState = {
      fetchedAt: now,
      provider: 'Forex Factory + Live Institutional Economic Calendar',
      isFallback: true,
      events: mirrorEvents,
    };
    memoryCalendarCache = state;
    writeDbJson(DB_CALENDAR_KEY, state);
    return state;
  }

  if (memoryCalendarCache) {
    return {
      ...memoryCalendarCache,
      events: refreshDynamicFlags(memoryCalendarCache.events, nyTodayKey),
    };
  }

  throw new Error('Unable to retrieve live economic calendar events right now.');
}

function decodeHtmlEntities(input: string): string {
  return input
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&#8217;/g, "'")
    .replace(/&#8216;/g, "'")
    .replace(/&#8220;/g, '"')
    .replace(/&#8221;/g, '"')
    .replace(/&#8211;/g, '-')
    .replace(/&#8212;/g, '—')
    .replace(/&nbsp;/g, ' ')
    .replace(/&#(\d+);/g, (_, num) => String.fromCharCode(Number(num) || 32))
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function extractTag(block: string, tag: string): string {
  const regex = new RegExp(`<${tag}(?:\\s[^>]*)?>([\\s\\S]*?)<\\/${tag}>`, 'i');
  const match = block.match(regex);
  return match ? decodeHtmlEntities(match[1]) : '';
}

function formatTimeAgo(date: Date): string {
  const diffSec = Math.max(0, Math.floor((Date.now() - date.getTime()) / 1000));
  if (diffSec < 60) return 'Just now';
  const mins = Math.floor(diffSec / 60);
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  return `${days}d ago`;
}

function classifyNewsCategory(
  title: string,
  summary: string,
  defaultCat: LiveMarketNewsItem['category'],
  source: string
): LiveMarketNewsItem['category'] {
  const hay = `${title} ${summary}`.toLowerCase();
  if (source.toLowerCase().includes('forex factory') || hay.includes('forexfactory')) {
    return 'Forex Factory';
  }
  if (/\b(fed|fomc|ecb|boe|boj|rba|rbnz|boc|snb|powell|lagarde|rate|inflation|cpi|ppi|gdp|nfp|payroll|central bank)\b/.test(hay)) {
    return 'Central Banks';
  }
  if (/\b(gold|xau|silver|xag|bullion|precious metal)\b/.test(hay)) {
    return 'Gold';
  }
  if (/\b(btc|bitcoin|eth|ethereum|crypto|solana)\b/.test(hay)) {
    return 'Crypto';
  }
  if (/\b(nasdaq|nas100|s&p|sp500|us30|dow|stocks|equities|yields|treasury)\b/.test(hay)) {
    return 'Indices';
  }
  return defaultCat;
}

interface RssSourceConfig {
  label: string;
  url: string;
  defaultCategory: LiveMarketNewsItem['category'];
  isForexFactorySearch?: boolean;
}

const NEWS_SOURCES: RssSourceConfig[] = [
  {
    label: 'Forex Factory',
    url: 'https://news.google.com/rss/search?q=site:forexfactory.com&hl=en-US&gl=US&ceid=US:en',
    defaultCategory: 'Forex Factory',
    isForexFactorySearch: true,
  },
  {
    label: 'ActionForex',
    url: 'https://www.actionforex.com/feed/',
    defaultCategory: 'Forex',
  },
  {
    label: 'Yahoo Finance FX & Gold',
    url: 'https://feeds.finance.yahoo.com/rss/2.0/headline?s=EURUSD=X,GBPUSD=X,USDJPY=X,GC=F,NQ=F,BTC-USD&region=US&lang=en-US',
    defaultCategory: 'Forex',
  },
  {
    label: 'Global FX Wire',
    url: 'https://news.google.com/rss/search?q=(forex+OR+EURUSD+OR+GBPUSD+OR+XAUUSD+OR+FOMC+OR+NFP)+when:2d&hl=en-US&gl=US&ceid=US:en',
    defaultCategory: 'Forex',
  },
];

async function fetchRssSource(src: RssSourceConfig): Promise<{ label: string; items: LiveMarketNewsItem[] }> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 7500);
  try {
    const res = await fetch(src.url, {
      headers: {
        'User-Agent': BROWSER_UA,
        Accept: 'application/rss+xml,application/xml,text/xml,*/*',
      },
      signal: controller.signal,
    });
    if (!res.ok) return { label: src.label, items: [] };

    const xml = await res.text();
    const itemMatches = xml.match(/<item[\s>][\s\S]*?<\/item>/gi) || [];
    const items: LiveMarketNewsItem[] = [];

    for (let i = 0; i < Math.min(itemMatches.length, 14); i++) {
      const block = itemMatches[i];
      let title = extractTag(block, 'title');
      const link = extractTag(block, 'link');
      const pubRaw = extractTag(block, 'pubDate');
      const rawDesc = extractTag(block, 'description');
      const tagSource = extractTag(block, 'source');

      if (!title || !link) continue;

      if (src.isForexFactorySearch) {
        title = title.replace(/\s*[-–|]\s*Forex Factory$/i, '').trim();
      } else if (tagSource) {
        title = title.replace(new RegExp(`\\s*[-–|]\\s*${tagSource.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, 'i'), '').trim();
      }

      const parsedDate = pubRaw ? new Date(pubRaw) : new Date();
      const validDate = Number.isNaN(parsedDate.getTime()) ? new Date() : parsedDate;

      let summary = rawDesc;
      if (summary.toLowerCase() === title.toLowerCase() || summary.length < 18) {
        summary = '';
      }
      if (summary.length > 210) {
        summary = `${summary.slice(0, 207).trim()}...`;
      }

      const sourceName = src.isForexFactorySearch ? 'Forex Factory' : tagSource || src.label;
      const category = classifyNewsCategory(title, summary, src.defaultCategory, sourceName);

      items.push({
        id: `${sourceName.toLowerCase().replace(/[^a-z0-9]/g, '')}-${validDate.getTime()}-${i}`,
        title,
        summary,
        category,
        source: sourceName,
        url: link,
        publishedAt: validDate.toISOString(),
        timeAgo: formatTimeAgo(validDate),
      });
    }

    return { label: src.label, items };
  } catch {
    return { label: src.label, items: [] };
  } finally {
    clearTimeout(timer);
  }
}

async function getLiveNews(forceRefresh = false): Promise<CachedNewsState> {
  if (!memoryNewsCache) {
    const saved = readDbJson<CachedNewsState>(DB_NEWS_KEY);
    if (saved?.items?.length) {
      memoryNewsCache = saved;
    }
  }

  const now = Date.now();
  if (memoryNewsCache && !forceRefresh && now - memoryNewsCache.fetchedAt < NEWS_TTL_MS) {
    return {
      ...memoryNewsCache,
      items: memoryNewsCache.items.map((item) => ({
        ...item,
        timeAgo: formatTimeAgo(new Date(item.publishedAt)),
      })),
    };
  }

  const results = await Promise.all(NEWS_SOURCES.map((s) => fetchRssSource(s)));
  const activeProviders = results.filter((r) => r.items.length > 0).map((r) => r.label);
  const merged = results.flatMap((r) => r.items);

  if (merged.length > 0) {
    const seen = new Set<string>();
    const deduped: LiveMarketNewsItem[] = [];
    merged.sort((a, b) => Date.parse(b.publishedAt) - Date.parse(a.publishedAt));

    for (const item of merged) {
      const key = item.title.toLowerCase().replace(/[^a-z0-9]/g, '').slice(0, 64);
      if (!key || seen.has(key)) continue;
      seen.add(key);
      deduped.push(item);
      if (deduped.length >= 30) break;
    }

    const state: CachedNewsState = {
      fetchedAt: now,
      providers: activeProviders,
      items: deduped,
    };
    memoryNewsCache = state;
    writeDbJson(DB_NEWS_KEY, state);
    return state;
  }

  if (memoryNewsCache) {
    return {
      ...memoryNewsCache,
      items: memoryNewsCache.items.map((item) => ({
        ...item,
        timeAgo: formatTimeAgo(new Date(item.publishedAt)),
      })),
    };
  }

  return {
    fetchedAt: now,
    providers: [],
    items: [],
  };
}

export async function getForexFactoryLiveFeed(forceRefresh = false): Promise<ForexFactoryFeedResponse> {
  const { nyTodayKey, nyNowLabel } = getCurrentNyInfo();
  const [calendar, news] = await Promise.all([
    getLiveCalendar(nyTodayKey, forceRefresh),
    getLiveNews(forceRefresh),
  ]);

  return {
    source: 'forexfactory.com',
    calendarFeedProvider: calendar.provider,
    calendarIsFallback: calendar.isFallback,
    newsFeedProviders: news.providers,
    updatedAt: new Date(Math.max(calendar.fetchedAt, news.fetchedAt)).toISOString(),
    nyNowLabel,
    nyTodayKey,
    ffCalendarUrl: 'https://www.forexfactory.com/calendar',
    ffNewsUrl: 'https://www.forexfactory.com/news',
    events: calendar.events,
    news: news.items,
  };
}
