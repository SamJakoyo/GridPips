import 'dotenv/config';
import dns from 'node:dns/promises';
import express, { type Request, type Response, type NextFunction } from 'express';
import cookieParser from 'cookie-parser';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import JSZip from 'jszip';
import { db, initDatabase, getSettingsMap, logSecurityEvent } from './db.ts';
import {
  hashPassword,
  verifyPassword,
  signSessionToken,
  verifySessionToken,
  extractBearerToken,
  sanitizeText,
  getClientIp,
  generateSecureToken,
  hasStrongSessionSecret,
  hasValidSessionSecret,
} from './security.ts';
import {
  checkSupabaseHealth,
  createSupabasePlaybook,
  createSupabaseSavedSetup,
  deleteSupabasePlaybook,
  deleteSupabaseSavedSetup,
  fetchSupabaseProfileByEmail,
  fetchSupabaseProfileById,
  getServerSupabaseAdminClient,
  getServerSupabaseClient,
  getSupabaseEnvConfig,
  listSupabasePlaybooks,
  listSupabaseSavedSetups,
  upsertSupabaseProfile,
  verifySupabaseAccessToken,
  type SupabaseProfileRecord,
} from './supabaseAuth.ts';
import { sendAutomatedEmail } from './email.ts';
import {
  buildSilverBulletEa,
  buildSmcOrderBlockEa,
  buildInstallationGuide,
} from './mql5Templates.ts';
import { normalizeServerTimeframe, runIctMarketAnalysis } from './ictEngine.ts';
import { runDrtMarketAnalysis } from './drtEngine.ts';
import {
  fetchTradingViewChartData,
  getTradingViewLiveQuotes,
  summarizeTradingViewMarketStatus,
  type TvInterval,
} from './tradingViewFeed.ts';
import { getForexFactoryLiveFeed } from './forexFactory.ts';
import {
  closeAllMt5Positions,
  executeMt5TradeOrder,
  fetchKnownExnessServersFromMetaApi,
  fetchMt5AccountState,
  isMetaApiProfileConfigured,
  isMt5ApiConfigured,
  provisionAndDeployMt5Account,
} from './mt5Api.ts';
import {
  checkCloudSyncTablesHealth,
  deleteCloudJournalTrade,
  hydrateMpesaCheckoutFromCloud,
  hydrateSiteSettingsFromCloud,
  hydrateUserFromCloud,
  insertCloudJournalTrade,
  insertCloudMt5Command,
  saveCloudReferralLedger,
  saveCloudSiteSettings,
  syncAllCloudAdminDataToLocal,
  syncAllCloudMpesaTransactionsToLocal,
  syncUserDirectoryEntryToCloud,
  syncUserStateToCloud,
  upsertCloudMpesaTransaction,
  upsertCloudOrder,
} from './cloudSync.ts';
import { runCloudAutoTradePass } from './autoTradeEngine.ts';
import {
  cleanMpesaEnvVar,
  clearDarajaTokenCache,
  getDarajaConfigStatus,
  initiateDarajaStkPush,
  isSafaricomCallbackIp,
  mapDarajaResultMessage,
  parseDarajaCallback,
  queryDarajaStkStatus,
  testDarajaConnection,
} from './daraja.ts';
import {
  DEFAULT_CRYPTO_ADDRESSES,
  getExplorerTxUrl,
  getLiveBtcUsdPrice,
  validateCryptoTxHashFormat,
  verifyOnChainCryptoPayment,
  type CryptoCurrency,
  type CryptoNetwork,
} from './cryptoVerify.ts';

try {
  initDatabase();
} catch (err) {
  console.error('SQLite initialization error:', err);
}

export const app = express();
const COOKIE_NAME = 'gridpips_session';
const LEGACY_COOKIE_NAME = 'pipgrid_session';

app.set('trust proxy', 1);
app.disable('x-powered-by');

// Security HTTP headers (configured to allow AI Studio iframe preview, OAuth popups, TradingView, YouTube, and Supabase)
app.use(
  helmet({
    frameguard: false,
    crossOriginOpenerPolicy: false,
    crossOriginEmbedderPolicy: false,
    crossOriginResourcePolicy: false,
    referrerPolicy: { policy: 'strict-origin-when-cross-origin' },
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc: [
          "'self'",
          "'unsafe-inline'",
          "'unsafe-eval'",
          'https://s3.tradingview.com',
          'https://static.tradingview.com',
          'https://www.tradingview.com',
          'https://*.tradingview.com',
          'https://www.tradingview-widget.com',
          'https://*.tradingview-widget.com',
        ],
        styleSrc: ["'self'", "'unsafe-inline'", 'https://fonts.googleapis.com'],
        fontSrc: ["'self'", 'https://fonts.gstatic.com', 'data:'],
        imgSrc: ["'self'", 'data:', 'blob:', 'https:'],
        mediaSrc: ["'self'", 'data:', 'blob:', 'https:'],
        frameSrc: [
          "'self'",
          'https://s3.tradingview.com',
          'https://s.tradingview.com',
          'https://www.tradingview.com',
          'https://*.tradingview.com',
          'https://www.tradingview-widget.com',
          'https://*.tradingview-widget.com',
          'https://www.youtube.com',
          'https://www.youtube-nocookie.com',
          'https://*.supabase.co',
        ],
        formAction: [
          "'self'",
          'https://*.supabase.co',
        ],
        frameAncestors: ["'self'", 'https://aistudio.google.com', 'https://*.google.com', 'https://*.run.app', 'https://*.vercel.app'],
        connectSrc: ["'self'", 'https:', 'wss:'],
      },
    },
  })
);

// Layer-7 Application Firewall (WAF) — exploit scanner blocking, XSS/SQLi probe inspection, and adaptive IP strikes
const WAF_STRIKE_WINDOW_MS = 10 * 60 * 1000;
const WAF_BLOCK_DURATION_MS = 15 * 60 * 1000;
const WAF_MAX_STRIKES = 5;
const wafStrikes = new Map<string, { count: number; windowStart: number }>();
const wafBlockedIps = new Map<string, number>();

const WAF_PROBE_PATH_RE =
  /(?:^|\/)\.(?:env(?:\.|$)|git(?:\/|$)|htaccess|htpasswd|aws(?:\/|$)|ds_store)|(?:^|\/)(?:wp-admin|wp-login\.php|wp-content|wp-includes|xmlrpc\.php|phpmyadmin|pma|adminer)(?:\/|$)|\.(?:php|asp|aspx|jsp|cgi)$|(?:\.\.[/\\]|%2e%2e)|%00|\0/i;
const WAF_INJECTION_RE =
  /(?:<script\b|javascript:|onerror\s*=|onload\s*=|\bunion\s+(?:all\s+)?select\b|;\s*drop\s+table\b|\bbenchmark\s*\(|\bsleep\s*\(\s*\d)/i;

function isLoopbackIp(ip: string): boolean {
  const cleaned = ip.replace(/^::ffff:/i, '').trim();
  return cleaned === '127.0.0.1' || cleaned === '::1' || cleaned === 'localhost';
}

function recordWafStrike(ip: string): boolean {
  if (!ip || ip === 'unknown' || isLoopbackIp(ip) || isSafaricomCallbackIp(ip)) {
    return false;
  }
  const now = Date.now();
  const existing = wafStrikes.get(ip);
  if (!existing || now - existing.windowStart > WAF_STRIKE_WINDOW_MS) {
    wafStrikes.set(ip, { count: 1, windowStart: now });
    return false;
  }
  existing.count += 1;
  if (existing.count >= WAF_MAX_STRIKES) {
    wafBlockedIps.set(ip, now + WAF_BLOCK_DURATION_MS);
    wafStrikes.delete(ip);
    return true;
  }
  return false;
}

function getActiveBlockedIpCount(): number {
  const now = Date.now();
  for (const [ip, expiresAt] of wafBlockedIps.entries()) {
    if (expiresAt <= now) {
      wafBlockedIps.delete(ip);
    }
  }
  return wafBlockedIps.size;
}

app.use((req: Request, res: Response, next: NextFunction) => {
  const ip = getClientIp(req);

  // Never interfere with Vercel crons or allowlisted Safaricom Daraja callbacks
  if (req.path === '/api/ea/cron-tick' || isSafaricomCallbackIp(ip)) {
    next();
    return;
  }

  const blockedUntil = wafBlockedIps.get(ip);
  if (blockedUntil) {
    if (blockedUntil > Date.now()) {
      res.status(403).json({ error: 'Access temporarily blocked by application firewall.' });
      return;
    }
    wafBlockedIps.delete(ip);
  }

  const rawUrl = req.originalUrl || req.url || '';
  if (rawUrl.length > 2048) {
    logSecurityEvent('WAF_URI_TOO_LONG', 'warning', ip, null, `Blocked oversized URL (${rawUrl.length} chars)`);
    res.status(414).json({ error: 'Request URI too long.' });
    return;
  }

  let decodedUrl = rawUrl;
  try {
    decodedUrl = decodeURIComponent(rawUrl);
  } catch {
    // Keep rawUrl if malformed URI sequence; check below
  }

  if (WAF_PROBE_PATH_RE.test(req.path) || WAF_PROBE_PATH_RE.test(decodedUrl)) {
    const autoBlocked = recordWafStrike(ip);
    logSecurityEvent(
      'WAF_EXPLOIT_PROBE_BLOCKED',
      autoBlocked ? 'critical' : 'warning',
      ip,
      null,
      `Blocked exploit/scanner path probe: ${req.method} ${req.path.slice(0, 120)}${autoBlocked ? ' (IP temp-banned 15m)' : ''}`
    );
    res.status(403).json({ error: 'Forbidden.' });
    return;
  }

  if (WAF_INJECTION_RE.test(decodedUrl)) {
    const autoBlocked = recordWafStrike(ip);
    logSecurityEvent(
      'WAF_INJECTION_BLOCKED',
      autoBlocked ? 'critical' : 'warning',
      ip,
      null,
      `Blocked XSS/SQLi probe on ${req.method} ${req.path.slice(0, 80)}${autoBlocked ? ' (IP temp-banned 15m)' : ''}`
    );
    res.status(403).json({ error: 'Request blocked by application firewall.' });
    return;
  }

  next();
});

app.use(cookieParser());

// Scoped JSON payload caps: 256KB default across auth/payment/admin routes, 3MB exclusively for journal screenshots
const standardJsonParser = express.json({ limit: '256kb' });
const journalJsonParser = express.json({ limit: '3mb' });
app.use((req: Request, res: Response, next: NextFunction) => {
  if (req.path === '/api/workspace/journal') {
    journalJsonParser(req, res, next);
    return;
  }
  standardJsonParser(req, res, next);
});
app.use(express.urlencoded({ extended: false, limit: '64kb' }));

// Rate limiters to prevent brute-force, STK Push spam, & DDoS abuse
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
  handler: (req, res) => {
    logSecurityEvent('RATE_LIMIT_AUTH', 'warning', getClientIp(req), null, 'Too many auth attempts');
    res.status(429).json({ error: 'Too many authentication attempts. Please try again in 15 minutes.' });
  },
});

const stkIpLimiter = rateLimit({
  windowMs: 5 * 60 * 1000,
  max: 12,
  standardHeaders: true,
  legacyHeaders: false,
  handler: (req, res) => {
    logSecurityEvent('RATE_LIMIT_STK_IP', 'warning', getClientIp(req), null, `STK Push IP rate limit exceeded on ${req.path}`);
    res.status(429).json({ error: 'Too many M-Pesa payment requests from this network. Please wait a few minutes before retrying.' });
  },
});

const stkUserLimiter = rateLimit({
  windowMs: 5 * 60 * 1000,
  max: 8,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => `user:${(req as AuthedRequest).currentUser?.id ?? 0}`,
  handler: (req, res) => {
    const authedReq = req as AuthedRequest;
    logSecurityEvent(
      'RATE_LIMIT_STK_USER',
      'warning',
      getClientIp(req),
      authedReq.currentUser?.email || null,
      `STK Push user throttle exceeded on ${req.path}`
    );
    res.status(429).json({ error: 'Too many M-Pesa STK requests on your account. Wait 5 minutes before sending another prompt.' });
  },
});

const callbackLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 120,
  standardHeaders: true,
  legacyHeaders: false,
  skip: (req) => isSafaricomCallbackIp(getClientIp(req)),
  handler: (req, res) => {
    logSecurityEvent('RATE_LIMIT_CALLBACK', 'warning', getClientIp(req), null, 'Excessive M-Pesa callback request rate');
    res.status(429).json({ ResultCode: 1, ResultDesc: 'Too many requests' });
  },
});

const adminLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 60,
  standardHeaders: true,
  legacyHeaders: false,
  handler: (req, res) => {
    logSecurityEvent('RATE_LIMIT_ADMIN', 'warning', getClientIp(req), null, `Admin route throttle exceeded on ${req.path}`);
    res.status(429).json({ error: 'Admin rate limit exceeded. Slow down requests and retry shortly.' });
  },
});

const apiLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 160,
  standardHeaders: true,
  legacyHeaders: false,
});

app.use('/api', apiLimiter);
app.use('/api/admin', adminLimiter);

interface DbUser {
  id: number;
  supabase_uid: string | null;
  name: string;
  email: string;
  password_hash: string;
  role: 'user' | 'influencer' | 'admin';
  exness_account_id: string;
  exness_email: string | null;
  exness_verified: number;
  referral_code: string;
  referred_by: number | null;
  has_analyzer: number;
  has_ea_bots: number;
  analyzer_expires_at?: string | null;
  ea_bots_expires_at?: string | null;
  mt5_login: string | null;
  mt5_server: string | null;
  mt5_bridge_token: string | null;
  mt5_connected: number;
  mt5_last_sync: string | null;
  mt5_balance?: number | null;
  mt5_equity?: number | null;
  mt5_symbol?: string | null;
  mt5_ea_name?: string | null;
  mt5_open_positions?: number | null;
  mt5_status?: string | null;
  mt5_metaapi_account_id?: string | null;
  mt5_metaapi_region?: string | null;
  mt5_auto_trade?: number | null;
  mt5_active_bot?: string | null;
  mt5_risk_percent?: number | null;
  mt5_connection_mode?: string | null;
  wallet_balance_kes?: number | null;
  commission_pct?: number | null;
  is_suspended: number;
  created_at: string;
  last_login_at: string | null;
}

type BillingCycle = 'monthly' | 'quarterly' | 'annual';

const SUBSCRIPTION_PLANS: Record<
  BillingCycle,
  { days: number; months: number; discountMultiplier: number; label: string; savingsPct: number }
> = {
  monthly: { days: 30, months: 1, discountMultiplier: 1, label: 'Monthly', savingsPct: 0 },
  quarterly: { days: 90, months: 3, discountMultiplier: 0.9, label: 'Quarterly', savingsPct: 10 },
  annual: { days: 365, months: 12, discountMultiplier: 0.8, label: 'Annual', savingsPct: 20 },
};

function normalizeBillingCycle(raw: unknown): BillingCycle {
  if (raw === 'quarterly' || raw === 'annual') return raw;
  return 'monthly';
}

function computeSubscriptionPrice(monthlyUsd: number, cycle: BillingCycle, usdKesRate: number) {
  const plan = SUBSCRIPTION_PLANS[cycle];
  const amountUsd = Number((monthlyUsd * plan.months * plan.discountMultiplier).toFixed(2));
  const amountKes = Math.round(amountUsd * usdKesRate);
  return { ...plan, cycle, amountUsd, amountKes };
}

function evaluateSubscription(
  hasFlag: number | boolean | null | undefined,
  expiresAt: string | null | undefined,
  role: string
): {
  active: boolean;
  status: 'active' | 'expiring_soon' | 'expired' | 'inactive';
  daysRemaining: number | null;
  expiresAt: string | null;
} {
  if (role === 'admin') {
    return { active: true, status: 'active', daysRemaining: null, expiresAt: expiresAt || null };
  }
  const parsedExpiry = expiresAt ? Date.parse(expiresAt) : NaN;
  if (Number.isFinite(parsedExpiry)) {
    const msLeft = parsedExpiry - Date.now();
    if (msLeft > 0) {
      const daysRemaining = Math.max(1, Math.ceil(msLeft / 86_400_000));
      return {
        active: Boolean(hasFlag),
        status: !hasFlag ? 'inactive' : daysRemaining <= 5 ? 'expiring_soon' : 'active',
        daysRemaining: hasFlag ? daysRemaining : null,
        expiresAt: new Date(parsedExpiry).toISOString(),
      };
    }
    return {
      active: false,
      status: 'expired',
      daysRemaining: 0,
      expiresAt: new Date(parsedExpiry).toISOString(),
    };
  }
  if (hasFlag) {
    return { active: true, status: 'active', daysRemaining: null, expiresAt: null };
  }
  return { active: false, status: 'inactive', daysRemaining: null, expiresAt: null };
}

function hasActiveAnalyzerAccess(u: DbUser): boolean {
  return evaluateSubscription(u.has_analyzer, u.analyzer_expires_at, u.role).active;
}

function hasActiveEaBotsAccess(u: DbUser): boolean {
  return evaluateSubscription(u.has_ea_bots, u.ea_bots_expires_at, u.role).active;
}

function hasActiveDrtAccess(u: DbUser): boolean {
  return hasActiveEaBotsAccess(u);
}

interface AuthedRequest extends Request {
  currentUser?: DbUser;
}

function serializeUser(u: DbUser) {
  const apiReady = isMt5ApiConfigured();
  const profileReady = isMetaApiProfileConfigured();
  const analyzerSub = evaluateSubscription(u.has_analyzer, u.analyzer_expires_at, u.role);
  const drtSub = evaluateSubscription(u.has_ea_bots, u.ea_bots_expires_at, u.role);

  return {
    id: u.id,
    name: u.name,
    email: u.email,
    role: u.role,
    exnessAccountId: u.exness_account_id,
    exnessEmail: u.exness_email,
    exnessVerified: Boolean(u.exness_verified),
    referralCode: u.referral_code,
    hasAnalyzer: analyzerSub.active,
    hasDrtAnalyzer: drtSub.active,
    hasEaBots: drtSub.active,
    analyzerExpiresAt: analyzerSub.expiresAt,
    drtAnalyzerExpiresAt: drtSub.expiresAt,
    eaBotsExpiresAt: drtSub.expiresAt,
    analyzerSubscriptionStatus: analyzerSub.status,
    drtAnalyzerSubscriptionStatus: drtSub.status,
    eaBotsSubscriptionStatus: drtSub.status,
    analyzerDaysRemaining: analyzerSub.daysRemaining,
    drtAnalyzerDaysRemaining: drtSub.daysRemaining,
    eaBotsDaysRemaining: drtSub.daysRemaining,
    mt5Login: u.mt5_login,
    mt5Server: u.mt5_server,
    mt5BridgeToken: u.mt5_bridge_token,
    mt5Connected: Boolean(u.mt5_connected),
    mt5LastSync: u.mt5_last_sync,
    mt5Balance: typeof u.mt5_balance === 'number' ? u.mt5_balance : null,
    mt5Equity: typeof u.mt5_equity === 'number' ? u.mt5_equity : null,
    mt5Symbol: u.mt5_symbol || null,
    mt5EaName: u.mt5_ea_name || null,
    mt5OpenPositions: typeof u.mt5_open_positions === 'number' ? u.mt5_open_positions : 0,
    mt5Status: u.mt5_status || null,
    mt5AutoTrade: Boolean(u.mt5_auto_trade),
    mt5ActiveBot: (u.mt5_active_bot as 'silverbullet' | 'orderblock' | 'both') || 'both',
    mt5RiskPercent: typeof u.mt5_risk_percent === 'number' ? u.mt5_risk_percent : 1.0,
    mt5ConnectionMode: 'metaapi' as const,
    mt5ApiConfigured: apiReady,
    mt5ProvisioningProfileConfigured: profileReady,
    walletBalanceKes: Number(u.wallet_balance_kes || 0),
    commissionPct: typeof u.commission_pct === 'number' ? u.commission_pct : null,
    isSuspended: Boolean(u.is_suspended),
    createdAt: u.created_at,
    lastLoginAt: u.last_login_at,
  };
}

function isHttpsRequest(req: Request): boolean {
  return (
    req.secure ||
    req.headers['x-forwarded-proto'] === 'https' ||
    process.env.NODE_ENV === 'production'
  );
}

function extractSessionToken(req: Request): string | undefined {
  const cookieToken = req.cookies?.[COOKIE_NAME] || req.cookies?.[LEGACY_COOKIE_NAME];
  if (cookieToken && verifySessionToken(cookieToken)) {
    return cookieToken;
  }
  const bearer = extractBearerToken(req);
  if (bearer && verifySessionToken(bearer)) {
    return bearer;
  }
  return undefined;
}

function getServerEnvDiagnostics() {
  const sb = getSupabaseEnvConfig();
  const missingSessionSecret = hasValidSessionSecret() ? [] : ['SESSION_SECRET'];
  const missingMetaApiEnvVars: string[] = [];
  if (!isMt5ApiConfigured()) missingMetaApiEnvVars.push('METAAPI_TOKEN');
  if (!isMetaApiProfileConfigured()) missingMetaApiEnvVars.push('METAAPI_PROVISIONING_PROFILE_ID');

  const settings = getSettingsMap();
  const daraja = getDarajaConfigStatus(settings);

  return {
    missingSupabaseEnvVars: sb.missingEnvVars,
    missingSessionSecret,
    sessionSecretStrong: hasStrongSessionSecret(),
    hasSecretKeyMisplacedInUrl: sb.hasSecretKeyMisplacedInUrl,
    supabaseUrlValid: Boolean(sb.url && sb.url.startsWith('https://')),
    missingMetaApiEnvVars,
    metaApiConfigured: isMt5ApiConfigured(),
    metaApiProfileConfigured: isMetaApiProfileConfigured(),
    missingMpesaDarajaEnvVars: daraja.missingEnvVars,
    mpesaDarajaConfigured: daraja.configured,
    mpesaDarajaEnv: daraja.env,
    mpesaTransactionType: daraja.transactionType,
  };
}

function getSupabaseConfigBlockError(): { status: number; error: string; missingEnvVars: string[] } | null {
  const sb = getSupabaseEnvConfig();
  const isVercel = Boolean(process.env.VERCEL);
  const hasPartialSupabase =
    sb.status !== 'not_configured' || sb.hasSecretKeyMisplacedInUrl || Boolean(sb.serviceRoleKey) || Boolean(sb.anonKey);

  if ((isVercel || hasPartialSupabase) && sb.missingEnvVars.length > 0) {
    const extraHint = sb.hasSecretKeyMisplacedInUrl
      ? ' Note: SUPABASE_URL / VITE_SUPABASE_URL currently holds a secret key instead of https://<project-ref>.supabase.co.'
      : '';
    return {
      status: 500,
      error: `Missing required Supabase environment variable(s): ${sb.missingEnvVars.join(', ')}.${extraHint}`,
      missingEnvVars: sb.missingEnvVars,
    };
  }
  return null;
}

function upsertLocalMirrorUserFromProfile(profile: SupabaseProfileRecord, referredById: number | null = null): DbUser {
  const email = profile.email.toLowerCase();
  const existing = db.prepare('SELECT * FROM users WHERE email = ?').get(email) as DbUser | undefined;
  const exnessId = profile.exness_account_id || 'EXN-PENDING';
  const refCode =
    profile.referral_code ||
    `${profile.full_name.replace(/[^a-zA-Z0-9]/g, '').slice(0, 6).toUpperCase() || 'TRADER'}${Math.floor(100 + Math.random() * 899)}`;

  if (!existing) {
    const info = db
      .prepare(
        `INSERT INTO users (supabase_uid, name, email, password_hash, role, exness_account_id, exness_email, exness_verified, referral_code, referred_by, has_analyzer, has_ea_bots, mt5_bridge_token, last_login_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))`
      )
      .run(
        profile.id,
        profile.full_name || email.split('@')[0] || 'Trader',
        email,
        hashPassword(generateSecureToken(24)),
        profile.role || 'user',
        exnessId,
        email,
        profile.exness_verified ? 1 : 0,
        refCode,
        referredById,
        profile.has_analyzer ? 1 : 0,
        profile.has_ea_bots ? 1 : 0,
        generateSecureToken(16)
      );
    const userId = Number(info.lastInsertRowid);
    db.prepare('INSERT OR IGNORE INTO paper_accounts (user_id, balance) VALUES (?, 10000)').run(userId);
    db.prepare('INSERT OR IGNORE INTO watchlists (user_id, symbols_json) VALUES (?, ?)').run(
      userId,
      JSON.stringify(['EURUSD', 'GBPUSD', 'XAUUSD', 'NAS100', 'BTCUSD'])
    );
    return db.prepare('SELECT * FROM users WHERE id = ?').get(userId) as DbUser;
  }

  db.prepare(
    `UPDATE users
     SET supabase_uid = ?, name = ?, role = ?, exness_account_id = ?, exness_verified = ?, has_analyzer = ?, has_ea_bots = ?, last_login_at = datetime('now')
     WHERE id = ?`
  ).run(
    profile.id,
    profile.full_name || existing.name,
    profile.role || existing.role,
    exnessId,
    profile.exness_verified ? 1 : 0,
    profile.has_analyzer ? 1 : 0,
    profile.has_ea_bots ? 1 : 0,
    existing.id
  );
  db.prepare('INSERT OR IGNORE INTO paper_accounts (user_id, balance) VALUES (?, 10000)').run(existing.id);
  return db.prepare('SELECT * FROM users WHERE id = ?').get(existing.id) as DbUser;
}

async function resolveAuthenticatedUser(token: string | undefined): Promise<DbUser | null> {
  const payload = verifySessionToken(token);
  if (!payload) return null;

  let user = db.prepare('SELECT * FROM users WHERE id = ? AND email = ?').get(payload.uid, payload.email) as
    | DbUser
    | undefined;
  if (!user) {
    user = db.prepare('SELECT * FROM users WHERE email = ?').get(payload.email) as DbUser | undefined;
  }
  if (user && payload.sub && !user.supabase_uid) {
    db.prepare('UPDATE users SET supabase_uid = ? WHERE id = ?').run(payload.sub, user.id);
    user.supabase_uid = payload.sub;
  }
  if (!user && getSupabaseEnvConfig().configured) {
    const byId = payload.sub ? await fetchSupabaseProfileById(payload.sub) : { profile: null, error: null };
    const resolved = byId.profile ? byId : await fetchSupabaseProfileByEmail(payload.email);
    if (resolved.profile) {
      user = upsertLocalMirrorUserFromProfile(resolved.profile);
      await hydrateUserFromCloud(user.id, user.email);
      user = (db.prepare('SELECT * FROM users WHERE id = ?').get(user.id) as DbUser | undefined) || user;
    }
  }
  return user || null;
}

async function resolveUserSupabaseUid(user: DbUser): Promise<string | null> {
  if (user.supabase_uid) return user.supabase_uid;
  const { profile } = await fetchSupabaseProfileByEmail(user.email);
  if (profile?.id) {
    db.prepare('UPDATE users SET supabase_uid = ? WHERE id = ?').run(profile.id, user.id);
    return profile.id;
  }
  return null;
}

async function requireAuth(req: AuthedRequest, res: Response, next: NextFunction): Promise<void> {
  try {
    const token = extractSessionToken(req);
    const user = await resolveAuthenticatedUser(token);
    if (!user) {
      res.status(401).json({ error: 'Authentication required. Please log in.' });
      return;
    }
    if (user.is_suspended) {
      res.status(403).json({ error: 'Account is suspended. Contact support.' });
      return;
    }
    req.currentUser = user;
    next();
  } catch (err) {
    console.error('Authentication middleware error:', err);
    res.status(500).json({ error: err instanceof Error ? err.message : 'Session verification error.' });
  }
}

function requireAdmin(req: AuthedRequest, res: Response, next: NextFunction): void {
  void requireAuth(req, res, () => {
    if (req.currentUser?.role !== 'admin') {
      logSecurityEvent(
        'UNAUTHORIZED_ADMIN_ACCESS',
        'critical',
        getClientIp(req),
        req.currentUser?.email || null,
        `Attempted admin route: ${req.originalUrl}`
      );
      res.status(403).json({ error: 'Admin privileges required.' });
      return;
    }
    next();
  });
}

function setSessionCookie(req: Request, res: Response, user: DbUser, sub?: string): string {
  const token = signSessionToken({ uid: user.id, sub, email: user.email, role: user.role });
  const https = isHttpsRequest(req);
  res.cookie(COOKIE_NAME, token, {
    httpOnly: true,
    sameSite: https ? 'none' : 'lax',
    secure: https,
    maxAge: 7 * 24 * 60 * 60 * 1000,
    path: '/',
  });
  return token;
}

// ---------------- Public & Config ----------------
app.get('/api/health', (_req, res) => {
  res.json({
    status: 'ok',
    service: 'GRIDPIPs',
    envDiagnostics: getServerEnvDiagnostics(),
  });
});

app.get('/api/health/supabase', async (_req, res) => {
  try {
    const [health, cloudSync] = await Promise.all([checkSupabaseHealth(), checkCloudSyncTablesHealth()]);
    res.json({
      ...health,
      cloudSync,
      envDiagnostics: getServerEnvDiagnostics(),
    });
  } catch (err) {
    console.error('Health check error:', err);
    res.status(500).json({ error: err instanceof Error ? err.message : 'Supabase health check failed.' });
  }
});

app.get('/robots.txt', (req, res) => {
  const origin = resolvePublicAppOrigin(req);
  res.type('text/plain').send(
    `User-agent: *\nAllow: /\nDisallow: /api/\n\nSitemap: ${origin}/sitemap.xml\n`
  );
});

app.get('/sitemap.xml', (req, res) => {
  const origin = resolvePublicAppOrigin(req);
  res.type('application/xml').send(
    `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n  <url>\n    <loc>${origin}/</loc>\n    <changefreq>daily</changefreq>\n    <priority>1.0</priority>\n  </url>\n</urlset>\n`
  );
});

app.get('/api/config/public', async (_req, res) => {
  await hydrateSiteSettingsFromCloud().catch(() => {});
  const s = getSettingsMap();
  const analyzerPriceUsd = Number(s.analyzer_price_usd || 5.25);
  const eaBotsPriceUsd = Number(s.ea_bots_price_usd || 5.25);
  const usdKesRate = Number(s.usd_kes_rate || 130);
  const sb = getSupabaseEnvConfig();
  const daraja = getDarajaConfigStatus(s);
  res.json({
    exnessIbUrl: s.exness_ib_url,
    telegramUrl: s.telegram_url,
    ictYoutubeChannelId: s.ict_youtube_channel_id,
    drtYoutubeChannelUrl:
      s.drt_youtube_channel_url || 'https://youtube.com/@ali_khan_ict?si=mqOSzAkgagFGdb80',
    analyzerPriceUsd,
    drtAnalyzerPriceUsd: eaBotsPriceUsd,
    eaBotsPriceUsd,
    usdKesRate,
    analyzerPriceKes: Math.round(analyzerPriceUsd * usdKesRate),
    drtAnalyzerPriceKes: Math.round(eaBotsPriceUsd * usdKesRate),
    eaBotsPriceKes: Math.round(eaBotsPriceUsd * usdKesRate),
    mpesaTillNumber: s.mpesa_till_number || daraja.partyB || daraja.shortCode || '1921416',
    mpesaPartyB: s.mpesa_party_b || daraja.partyB || s.mpesa_till_number || '1921416',
    mpesaTransactionType: daraja.transactionType,
    mpesaMerchantName: s.mpesa_merchant_name || 'AURVIK ENTERPRISES',
    mpesaConfigured: daraja.configured,
    mpesaEnv: daraja.env,
    commissionPct: Number(s.influencer_commission_pct || 35),
    subscriptionPlans: {
      monthly: { days: 30, months: 1, savingsPct: 0, discountMultiplier: 1 },
      quarterly: { days: 90, months: 3, savingsPct: 10, discountMultiplier: 0.9 },
      annual: { days: 365, months: 12, savingsPct: 20, discountMultiplier: 0.8 },
    },
    supabaseConfigured: sb.configured,
    supabaseStatus: sb.status,
    supabaseUrl: sb.url,
    supabaseAnonKey: sb.anonKey,
    cryptoAddresses: {
      USDT_TRC20: s.usdt_trc20_address || DEFAULT_CRYPTO_ADDRESSES.USDT_TRC20,
      USDT_ERC20: s.usdt_erc20_address || DEFAULT_CRYPTO_ADDRESSES.USDT_ERC20,
      BTC: s.btc_address || DEFAULT_CRYPTO_ADDRESSES.BTC,
    },
  });
});

app.get('/api/crypto/quote', async (req, res) => {
  try {
    await hydrateSiteSettingsFromCloud().catch(() => {});
    const s = getSettingsMap();
    const rawAmount = Number(req.query.amountUsd || s.analyzer_price_usd || 5.25);
    const amountUsd = Number.isFinite(rawAmount) && rawAmount > 0 ? Math.min(rawAmount, 100000) : 5.25;
    const btcUsd = await getLiveBtcUsdPrice();
    const btcAmount = Number((amountUsd / btcUsd).toFixed(8));
    res.json({
      amountUsd,
      btcUsd: Number(btcUsd.toFixed(2)),
      btcAmount,
      btcAmountFormatted: btcAmount.toFixed(8),
      usdtAmount: Number(amountUsd.toFixed(2)),
      cryptoAddresses: {
        USDT_TRC20: s.usdt_trc20_address || DEFAULT_CRYPTO_ADDRESSES.USDT_TRC20,
        USDT_ERC20: s.usdt_erc20_address || DEFAULT_CRYPTO_ADDRESSES.USDT_ERC20,
        BTC: s.btc_address || DEFAULT_CRYPTO_ADDRESSES.BTC,
      },
      updatedAt: new Date().toISOString(),
    });
  } catch (err) {
    res.status(500).json({
      error: err instanceof Error ? err.message : 'Unable to fetch live crypto quote.',
    });
  }
});

// ---------------- Auth (Exness IB Gate + Rate Limiting + Supabase Single Source of Truth) ----------------
app.post('/api/auth/register', authLimiter, async (req, res) => {
  try {
    const configBlock = getSupabaseConfigBlockError();
    if (configBlock) {
      console.error('Registration blocked by missing env vars:', configBlock.missingEnvVars);
      res.status(configBlock.status).json({
        error: configBlock.error,
        missingEnvVars: configBlock.missingEnvVars,
      });
      return;
    }

    const name = sanitizeText(req.body?.name, 80);
    const email = sanitizeText(req.body?.email, 120).toLowerCase();
    const password = typeof req.body?.password === 'string' ? req.body.password : '';
    const exnessAccountId = sanitizeText(req.body?.exnessAccountId, 40).toUpperCase();
    const exnessConfirmed = Boolean(req.body?.exnessConfirmed);
    const referralCodeUsed = sanitizeText(req.body?.referralCode, 30).toUpperCase();

    if (!name || !email || !email.includes('@')) {
      res.status(400).json({ error: 'Please provide a valid full name and email address.' });
      return;
    }
    if (password.length < 8) {
      res.status(400).json({ error: 'Password must be at least 8 characters for account security.' });
      return;
    }
    if (!exnessConfirmed || exnessAccountId.length < 4) {
      res.status(400).json({
        error: 'Please open your Exness account via our partner IB link and enter your Exness Account ID (min 4 characters).',
      });
      return;
    }

    let referredById: number | null = null;
    if (referralCodeUsed) {
      const refUser = db.prepare('SELECT id FROM users WHERE referral_code = ?').get(referralCodeUsed) as
        | { id: number }
        | undefined;
      if (refUser) referredById = refUser.id;
    }

    const baseCode = name.replace(/[^a-zA-Z0-9]/g, '').slice(0, 6).toUpperCase() || 'TRADER';
    const uniqueRefCode = `${baseCode}${Math.floor(100 + Math.random() * 899)}`;
    const ip = getClientIp(req);
    const adminEmail = (process.env.ADMIN_EMAIL || 'samjakoyo26@gmail.com').toLowerCase();
    const assignedRole: 'user' | 'admin' = email === adminEmail ? 'admin' : 'user';

    const sbAdmin = getServerSupabaseAdminClient();
    const sbCfg = getSupabaseEnvConfig();

    if (sbCfg.url && sbAdmin) {
      const { data: createdAuth, error: createErr } = await sbAdmin.auth.admin.createUser({
        email,
        password,
        email_confirm: true,
        user_metadata: {
          full_name: name,
          exness_account_id: exnessAccountId,
          exness_verified: assignedRole === 'admin',
          referral_code: uniqueRefCode,
          referred_by_code: referralCodeUsed || undefined,
        },
      });

      if (createErr || !createdAuth.user) {
        console.error('Supabase auth.admin.createUser error:', createErr);
        const msg = createErr?.message || 'Supabase user registration failed.';
        const isDuplicate = /already\s+(been\s+)?registered|exists/i.test(msg);
        res.status(isDuplicate ? 409 : createErr?.status || 400).json({
          error: isDuplicate
            ? 'An account with this email already exists. Please use Existing Member Login.'
            : `Supabase Auth error: ${msg}`,
        });
        return;
      }

      const { profile, error: profileErr } = await upsertSupabaseProfile({
        id: createdAuth.user.id,
        email,
        full_name: name,
        role: assignedRole,
        exness_account_id: exnessAccountId,
        exness_verified: assignedRole === 'admin',
        referral_code: uniqueRefCode,
        has_analyzer: assignedRole === 'admin',
        has_ea_bots: assignedRole === 'admin',
      });

      if (profileErr || !profile) {
        console.error('Supabase profiles upsert error during registration:', profileErr);
        await sbAdmin.auth.admin.deleteUser(createdAuth.user.id).catch((delErr) => {
          console.error('Failed to rollback partial Supabase auth user:', delErr);
        });
        res.status(500).json({
          error: profileErr || 'Failed to save user profile to Supabase public.profiles table.',
        });
        return;
      }

      let user = upsertLocalMirrorUserFromProfile(profile, referredById);
      await hydrateUserFromCloud(user.id, user.email).catch(() => {});
      await Promise.all([
        syncUserStateToCloud(user.id).catch(() => {}),
        syncUserDirectoryEntryToCloud(user.id).catch(() => {}),
      ]);
      user = (db.prepare('SELECT * FROM users WHERE id = ?').get(user.id) as DbUser) || user;
      const sessionToken = setSessionCookie(req, res, user, createdAuth.user.id);

      try {
        logSecurityEvent('USER_REGISTERED', 'info', ip, email, `Supabase + Exness ID: ${exnessAccountId}`);
        const settings = getSettingsMap();
        await sendAutomatedEmail({
          to: email,
          subject: 'Welcome to Grid Pips — Exness Account Linked',
          category: 'welcome',
          textPreview: `Welcome ${name}! Your Exness ID (${exnessAccountId}) is linked. Access free tools, ICT/SMC education, and join ${settings.telegram_url}.`,
          html: `<h2>Welcome to Grid Pips, ${name}</h2>
            <p>Your free trading account is now active and linked to Exness Account ID <strong>${exnessAccountId}</strong>.</p>
            <p>Your Referral Code: <strong>${uniqueRefCode}</strong></p>
            <p>Join our live trading desk on Telegram: <a href="${settings.telegram_url}">${settings.telegram_url}</a></p>`,
        });
      } catch (noticeErr) {
        console.warn('Non-fatal notification log warning during registration:', noticeErr);
      }

      res.status(201).json({ user: serializeUser(user), profile, sessionToken });
      return;
    }

    // Offline/Local Dev SQLite fallback (only when Supabase is completely unconfigured locally)
    const existing = db.prepare('SELECT id FROM users WHERE email = ?').get(email);
    if (existing) {
      res.status(409).json({ error: 'An account with this email already exists.' });
      return;
    }

    const bridgeToken = generateSecureToken(16);
    const info = db
      .prepare(
        `INSERT INTO users (name, email, password_hash, role, exness_account_id, exness_email, exness_verified, referral_code, referred_by, mt5_bridge_token, last_login_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))`
      )
      .run(
        name,
        email,
        hashPassword(password),
        assignedRole,
        exnessAccountId,
        email,
        assignedRole === 'admin' ? 1 : 0,
        uniqueRefCode,
        referredById,
        bridgeToken
      );

    const userId = Number(info.lastInsertRowid);
    db.prepare('INSERT INTO paper_accounts (user_id, balance) VALUES (?, 10000)').run(userId);
    db.prepare('INSERT INTO watchlists (user_id, symbols_json) VALUES (?, ?)').run(
      userId,
      JSON.stringify(['EURUSD', 'GBPUSD', 'XAUUSD', 'NAS100', 'BTCUSD'])
    );

    await hydrateUserFromCloud(userId, email).catch(() => {});
    await Promise.all([
      syncUserStateToCloud(userId).catch(() => {}),
      syncUserDirectoryEntryToCloud(userId).catch(() => {}),
    ]);
    const user = db.prepare('SELECT * FROM users WHERE id = ?').get(userId) as DbUser;
    const sessionToken = setSessionCookie(req, res, user);

    logSecurityEvent('USER_REGISTERED', 'info', ip, email, `Exness ID: ${exnessAccountId}`);

    const settings = getSettingsMap();
    await sendAutomatedEmail({
      to: email,
      subject: 'Welcome to Grid Pips — Exness Account Linked',
      category: 'welcome',
      textPreview: `Welcome ${name}! Your Exness ID (${exnessAccountId}) is linked. Access free tools, ICT/SMC education, and join ${settings.telegram_url}.`,
      html: `<h2>Welcome to Grid Pips, ${name}</h2>
        <p>Your free trading account is now active and linked to Exness Account ID <strong>${exnessAccountId}</strong>.</p>
        <p>Your Referral Code: <strong>${uniqueRefCode}</strong></p>
        <p>Join our live trading desk on Telegram: <a href="${settings.telegram_url}">${settings.telegram_url}</a></p>`,
    });

    res.status(201).json({ user: serializeUser(user), sessionToken });
  } catch (err) {
    console.error('Register error:', err);
    res.status(500).json({
      error: err instanceof Error ? err.message : 'Registration failed. Please check server logs.',
    });
  }
});

app.post('/api/auth/login', authLimiter, async (req, res) => {
  try {
    const configBlock = getSupabaseConfigBlockError();
    if (configBlock) {
      console.error('Login blocked by missing env vars:', configBlock.missingEnvVars);
      res.status(configBlock.status).json({
        error: configBlock.error,
        missingEnvVars: configBlock.missingEnvVars,
      });
      return;
    }

    const email = sanitizeText(req.body?.email, 120).toLowerCase();
    const password = typeof req.body?.password === 'string' ? req.body.password : '';
    const ip = getClientIp(req);

    if (!email || !password) {
      res.status(400).json({ error: 'Email and password are required.' });
      return;
    }

    const sbClient = getServerSupabaseClient();
    const sbCfg = getSupabaseEnvConfig();

    if (sbCfg.url && sbClient) {
      const { data: authData, error: signInErr } = await sbClient.auth.signInWithPassword({
        email,
        password,
      });

      if (signInErr || !authData.user) {
        console.error('Supabase login error:', signInErr);
        const msg = signInErr?.message || 'Invalid email or password.';
        res.status(401).json({ error: msg });
        return;
      }

      const accessToken = authData.session?.access_token;
      const { profile: existingProfile, error: selectErr } = await fetchSupabaseProfileById(
        authData.user.id,
        accessToken
      );

      if (selectErr) {
        console.error('Supabase profiles read error on login:', selectErr);
        res.status(500).json({ error: selectErr });
        return;
      }

      let profile = existingProfile;
      if (!profile) {
        const meta = (authData.user.user_metadata || {}) as Record<string, unknown>;
        const metaExness = typeof meta.exness_account_id === 'string' ? meta.exness_account_id : '';
        const metaName =
          (typeof meta.full_name === 'string' && meta.full_name) || email.split('@')[0] || 'Trader';
        if (metaExness.length < 4) {
          res.status(409).json({
            needsExnessOnboarding: true,
            error: 'Complete your Exness Account ID verification to activate your profile.',
          });
          return;
        }
        const adminEmail = (process.env.ADMIN_EMAIL || 'samjakoyo26@gmail.com').toLowerCase();
        const role: 'user' | 'admin' = email === adminEmail ? 'admin' : 'user';
        const refCode =
          (typeof meta.referral_code === 'string' && meta.referral_code) ||
          `${metaName.replace(/[^a-zA-Z0-9]/g, '').slice(0, 6).toUpperCase() || 'TRADER'}${Math.floor(100 + Math.random() * 899)}`;

        const upserted = await upsertSupabaseProfile(
          {
            id: authData.user.id,
            email,
            full_name: metaName,
            role,
            exness_account_id: metaExness.toUpperCase(),
            exness_verified: role === 'admin',
            referral_code: refCode.toUpperCase(),
            has_analyzer: role === 'admin',
            has_ea_bots: role === 'admin',
          },
          accessToken
        );
        if (upserted.error || !upserted.profile) {
          console.error('Supabase profile auto-sync failed on login:', upserted.error);
          res.status(500).json({ error: upserted.error || 'Unable to load or create Supabase profile.' });
          return;
        }
        profile = upserted.profile;
      }

      let user = upsertLocalMirrorUserFromProfile(profile);
      await hydrateUserFromCloud(user.id, user.email);
      user = (db.prepare('SELECT * FROM users WHERE id = ?').get(user.id) as DbUser | undefined) || user;
      if (user.is_suspended) {
        logSecurityEvent('LOGIN_BLOCKED_SUSPENDED', 'warning', ip, email, 'Suspended user login attempt');
        res.status(403).json({ error: 'Your account has been suspended by an administrator.' });
        return;
      }

      const sessionToken = setSessionCookie(req, res, user, authData.user.id);
      try {
        logSecurityEvent('LOGIN_SUCCESS', 'info', ip, email, `Supabase Role: ${user.role}`);
        await sendAutomatedEmail({
          to: email,
          subject: 'Grid Pips Security Notice — New Sign-In Detected',
          category: 'security_alert',
          textPreview: `A new sign-in to your Grid Pips account occurred from IP ${ip}. If this was not you, reset your password immediately.`,
          html: `<p>Hello ${user.name},</p><p>A new sign-in to your Grid Pips account was recorded from IP <code>${ip}</code>.</p>`,
        });
      } catch (noticeErr) {
        console.warn('Login notification warning:', noticeErr);
      }

      res.json({ user: serializeUser(user), profile, sessionToken });
      return;
    }

    // Offline/Local Dev SQLite fallback
    const user = db.prepare('SELECT * FROM users WHERE email = ?').get(email) as DbUser | undefined;
    if (!user || !verifyPassword(password, user.password_hash)) {
      logSecurityEvent('LOGIN_FAILED', 'warning', ip, email || null, 'Invalid credentials submitted');
      res.status(401).json({ error: 'Invalid email or password.' });
      return;
    }
    if (user.is_suspended) {
      logSecurityEvent('LOGIN_BLOCKED_SUSPENDED', 'warning', ip, email, 'Suspended user login attempt');
      res.status(403).json({ error: 'Your account has been suspended by an administrator.' });
      return;
    }

    db.prepare("UPDATE users SET last_login_at = datetime('now') WHERE id = ?").run(user.id);
    const sessionToken = setSessionCookie(req, res, user);
    logSecurityEvent('LOGIN_SUCCESS', 'info', ip, email, `Role: ${user.role}`);

    await sendAutomatedEmail({
      to: email,
      subject: 'Grid Pips Security Notice — New Sign-In Detected',
      category: 'security_alert',
      textPreview: `A new sign-in to your Grid Pips account occurred from IP ${ip}. If this was not you, reset your password immediately.`,
      html: `<p>Hello ${user.name},</p><p>A new sign-in to your Grid Pips account was recorded from IP <code>${ip}</code>.</p>`,
    });

    const refreshed = db.prepare('SELECT * FROM users WHERE id = ?').get(user.id) as DbUser;
    res.json({ user: serializeUser(refreshed), sessionToken });
  } catch (err) {
    console.error('Login error:', err);
    res.status(500).json({ error: err instanceof Error ? err.message : 'Login failed.' });
  }
});

app.post('/api/auth/logout', (req, res) => {
  const https = isHttpsRequest(req);
  res.clearCookie(COOKIE_NAME, { path: '/', sameSite: https ? 'none' : 'lax', secure: https });
  res.clearCookie(LEGACY_COOKIE_NAME, { path: '/', sameSite: https ? 'none' : 'lax', secure: https });
  res.json({ ok: true });
});

app.get('/api/auth/me', async (req: AuthedRequest, res) => {
  try {
    const token = extractSessionToken(req);
    const user = await resolveAuthenticatedUser(token);
    if (!user || user.is_suspended) {
      if (token) {
        const https = isHttpsRequest(req);
        res.clearCookie(COOKIE_NAME, { path: '/', sameSite: https ? 'none' : 'lax', secure: https });
        res.clearCookie(LEGACY_COOKIE_NAME, { path: '/', sameSite: https ? 'none' : 'lax', secure: https });
      }
      res.json({ user: null });
      return;
    }
    res.json({ user: serializeUser(user) });
  } catch (err) {
    console.error('Session /api/auth/me error:', err);
    res.status(500).json({ error: err instanceof Error ? err.message : 'Failed to load current user.' });
  }
});

app.patch('/api/auth/profile', requireAuth, async (req: AuthedRequest, res) => {
  try {
    const user = req.currentUser!;
    const name = sanitizeText(req.body?.name ?? user.name, 80);
    const exnessAccountId = sanitizeText(req.body?.exnessAccountId ?? user.exness_account_id, 40).toUpperCase();
    const rawExnessEmail =
      req.body?.exnessEmail !== undefined ? sanitizeText(req.body.exnessEmail, 120).toLowerCase() : user.exness_email || '';

    if (!name || name.length < 2) {
      res.status(400).json({ error: 'Full name must be at least 2 characters.' });
      return;
    }
    if (!exnessAccountId || exnessAccountId.length < 3) {
      res.status(400).json({ error: 'Exness Account ID must be at least 3 characters.' });
      return;
    }
    if (rawExnessEmail && !rawExnessEmail.includes('@')) {
      res.status(400).json({ error: 'Please provide a valid Exness email address.' });
      return;
    }

    const finalExnessEmail = rawExnessEmail || user.email;
    db.prepare(
      'UPDATE users SET name = ?, exness_account_id = ?, exness_email = ? WHERE id = ?'
    ).run(name, exnessAccountId, finalExnessEmail, user.id);

    const updated = db.prepare('SELECT * FROM users WHERE id = ?').get(user.id) as DbUser;

    const sbUid = await resolveUserSupabaseUid(updated);
    if (sbUid && getServerSupabaseAdminClient()) {
      await upsertSupabaseProfile({
        id: sbUid,
        email: updated.email,
        full_name: updated.name,
        role: updated.role,
        exness_account_id: updated.exness_account_id,
        exness_verified: Boolean(updated.exness_verified),
        referral_code: updated.referral_code,
        has_analyzer: Boolean(updated.has_analyzer) || updated.role === 'admin',
        has_ea_bots: Boolean(updated.has_ea_bots) || updated.role === 'admin',
      });
    }
    await Promise.all([
      syncUserStateToCloud(updated.id).catch(() => {}),
      syncUserDirectoryEntryToCloud(updated.id).catch(() => {}),
    ]);

    res.json({ user: serializeUser(updated) });
  } catch (err) {
    console.error('Update profile error:', err);
    res.status(500).json({ error: err instanceof Error ? err.message : 'Unable to update account details.' });
  }
});


async function bridgeSupabaseUserToSession(params: {
  req: Request;
  res: Response;
  sbUser: { id: string; email?: string; user_metadata?: Record<string, unknown> };
  accessToken?: string;
  overrideName?: string;
  overrideExnessId?: string;
  overrideExnessConfirmed?: boolean;
  overrideReferralCode?: string;
}) {
  const { req, res, sbUser } = params;
  const email = sanitizeText(sbUser.email || '', 120).toLowerCase();
  if (!email || !email.includes('@')) {
    res.status(400).json({ error: 'Valid Supabase account email is required.' });
    return;
  }

  const metaName =
    (typeof sbUser.user_metadata?.full_name === 'string' && sbUser.user_metadata.full_name) ||
    (typeof sbUser.user_metadata?.name === 'string' && sbUser.user_metadata.name) ||
    email.split('@')[0] ||
    'Trader';
  const displayName = sanitizeText(params.overrideName || metaName, 80);
  const ip = getClientIp(req);

  const existingProfileResult = await fetchSupabaseProfileById(sbUser.id, params.accessToken);
  if (existingProfileResult.error) {
    console.error('Supabase profile read error in bridge:', existingProfileResult.error);
    res.status(500).json({ error: existingProfileResult.error });
    return;
  }

  let profile = existingProfileResult.profile;
  const metaExnessId =
    typeof sbUser.user_metadata?.exness_account_id === 'string'
      ? sbUser.user_metadata.exness_account_id
      : '';
  const exnessAccountId = sanitizeText(
    params.overrideExnessId || profile?.exness_account_id || metaExnessId,
    40
  ).toUpperCase();
  const exnessConfirmed = Boolean(
    params.overrideExnessConfirmed || profile?.exness_verified || metaExnessId.length >= 4
  );

  if (!exnessConfirmed || exnessAccountId.length < 4) {
    res.status(409).json({
      needsExnessOnboarding: true,
      email,
      name: displayName,
      error: 'Link your Exness Partner Account ID to activate your Grid Pips account.',
    });
    return;
  }

  const referralCodeUsed = sanitizeText(
    params.overrideReferralCode ||
      (typeof sbUser.user_metadata?.referral_code === 'string' ? sbUser.user_metadata.referral_code : ''),
    30
  ).toUpperCase();

  let referredById: number | null = null;
  if (referralCodeUsed) {
    const refUser = db.prepare('SELECT id FROM users WHERE referral_code = ?').get(referralCodeUsed) as
      | { id: number }
      | undefined;
    if (refUser) referredById = refUser.id;
  }

  if (!profile) {
    const baseCode = displayName.replace(/[^a-zA-Z0-9]/g, '').slice(0, 6).toUpperCase() || 'TRADER';
    const uniqueRefCode = `${baseCode}${Math.floor(100 + Math.random() * 899)}`;
    const adminEmail = (process.env.ADMIN_EMAIL || 'samjakoyo26@gmail.com').toLowerCase();
    const role: 'user' | 'admin' = email === adminEmail ? 'admin' : 'user';

    const upserted = await upsertSupabaseProfile(
      {
        id: sbUser.id,
        email,
        full_name: displayName,
        role,
        exness_account_id: exnessAccountId,
        exness_verified: role === 'admin',
        referral_code: uniqueRefCode,
        has_analyzer: role === 'admin',
        has_ea_bots: role === 'admin',
      },
      params.accessToken
    );

    if (upserted.error || !upserted.profile) {
      console.error('Supabase profiles upsert error in bridge:', upserted.error);
      res.status(500).json({ error: upserted.error || 'Failed to save user profile to Supabase.' });
      return;
    }
    profile = upserted.profile;
  }

  let user = upsertLocalMirrorUserFromProfile(profile, referredById);
  await hydrateUserFromCloud(user.id, user.email).catch(() => {});
  await Promise.all([
    syncUserStateToCloud(user.id).catch(() => {}),
    syncUserDirectoryEntryToCloud(user.id).catch(() => {}),
  ]);
  user = (db.prepare('SELECT * FROM users WHERE id = ?').get(user.id) as DbUser | undefined) || user;
  if (user.is_suspended) {
    logSecurityEvent('LOGIN_BLOCKED_SUSPENDED', 'warning', ip, email, 'Suspended Supabase user attempt');
    res.status(403).json({ error: 'Your account has been suspended by an administrator.' });
    return;
  }

  const sessionToken = setSessionCookie(req, res, user, sbUser.id);
  logSecurityEvent('LOGIN_SUPABASE_SUCCESS', 'info', ip, email, `Role: ${user.role}`);

  res.json({ user: serializeUser(user), profile, sessionToken });
}

app.post('/api/auth/supabase-session', authLimiter, async (req, res) => {
  try {
    const configBlock = getSupabaseConfigBlockError();
    if (configBlock) {
      res.status(configBlock.status).json({
        error: configBlock.error,
        missingEnvVars: configBlock.missingEnvVars,
      });
      return;
    }

    const sbConfig = getSupabaseEnvConfig();
    if (!sbConfig.configured && !sbConfig.serviceRoleKey) {
      res.status(503).json({
        error: `Supabase is not configured. Missing env variable(s): ${sbConfig.missingEnvVars.join(', ')}`,
      });
      return;
    }

    const accessToken = extractBearerToken(req);
    if (!accessToken) {
      res.status(401).json({ error: 'Unauthorized: Missing Supabase access token.' });
      return;
    }

    const sbUser = await verifySupabaseAccessToken(accessToken);
    if (!sbUser || !sbUser.email) {
      res.status(401).json({ error: 'Invalid or expired Supabase session token.' });
      return;
    }

    await bridgeSupabaseUserToSession({
      req,
      res,
      sbUser,
      accessToken,
      overrideName: req.body?.name,
      overrideExnessId: req.body?.exnessAccountId,
      overrideExnessConfirmed: Boolean(req.body?.exnessConfirmed),
      overrideReferralCode: req.body?.referralCode,
    });
  } catch (err) {
    console.error('Supabase session error:', err);
    res.status(500).json({ error: err instanceof Error ? err.message : 'Failed to establish Supabase session.' });
  }
});

app.post('/api/auth/supabase/signup', authLimiter, async (req, res) => {
  try {
    const sbConfig = getSupabaseEnvConfig();
    if (sbConfig.missingEnvVars.length > 0) {
      console.error('Supabase signup missing env vars:', sbConfig.missingEnvVars);
      res.status(500).json({
        error: `Missing required Supabase environment variable(s): ${sbConfig.missingEnvVars.join(', ')}`,
        missingEnvVars: sbConfig.missingEnvVars,
      });
      return;
    }

    const sbAdmin = getServerSupabaseAdminClient();
    if (!sbAdmin) {
      res.status(500).json({ error: 'Supabase admin client unavailable. Check SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY.' });
      return;
    }

    const name = sanitizeText(req.body?.name, 80);
    const email = sanitizeText(req.body?.email, 120).toLowerCase();
    const password = typeof req.body?.password === 'string' ? req.body.password : '';
    const exnessAccountId = sanitizeText(req.body?.exnessAccountId, 40).toUpperCase();
    const exnessConfirmed = Boolean(req.body?.exnessConfirmed);
    const referralCode = sanitizeText(req.body?.referralCode, 30).toUpperCase();

    if (!name || !email || !email.includes('@') || password.length < 8) {
      res.status(400).json({ error: 'Provide a valid name, email, and password (min 8 characters).' });
      return;
    }
    if (!exnessConfirmed || exnessAccountId.length < 4) {
      res.status(400).json({ error: 'Enter your Exness Account ID and confirm Exness IB registration.' });
      return;
    }

    const baseCode = name.replace(/[^a-zA-Z0-9]/g, '').slice(0, 6).toUpperCase() || 'TRADER';
    const uniqueRefCode = `${baseCode}${Math.floor(100 + Math.random() * 899)}`;
    const adminEmail = (process.env.ADMIN_EMAIL || 'samjakoyo26@gmail.com').toLowerCase();
    const role: 'user' | 'admin' = email === adminEmail ? 'admin' : 'user';

    const { data, error } = await sbAdmin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: {
        full_name: name,
        exness_account_id: exnessAccountId,
        exness_verified: role === 'admin',
        referral_code: uniqueRefCode,
        referred_by_code: referralCode || undefined,
      },
    });
    if (error || !data.user) {
      console.error('Supabase signup error:', error);
      res.status(error?.status || 400).json({ error: error?.message || 'Supabase registration failed.' });
      return;
    }

    const { profile, error: profileErr } = await upsertSupabaseProfile({
      id: data.user.id,
      email,
      full_name: name,
      role,
      exness_account_id: exnessAccountId,
      exness_verified: role === 'admin',
      referral_code: uniqueRefCode,
      has_analyzer: role === 'admin',
      has_ea_bots: role === 'admin',
    });
    if (profileErr || !profile) {
      console.error('Supabase profiles upsert error:', profileErr);
      await sbAdmin.auth.admin.deleteUser(data.user.id).catch(() => {});
      res.status(500).json({ error: profileErr || 'Failed to save user profile to Supabase.' });
      return;
    }

    let user = upsertLocalMirrorUserFromProfile(profile);
    await hydrateUserFromCloud(user.id, user.email);
    void syncUserStateToCloud(user.id);
    user = (db.prepare('SELECT * FROM users WHERE id = ?').get(user.id) as DbUser | undefined) || user;
    const sessionToken = setSessionCookie(req, res, user, data.user.id);
    res.status(201).json({ user: serializeUser(user), profile, sessionToken });
  } catch (err) {
    console.error('Supabase signup error:', err);
    res.status(500).json({ error: err instanceof Error ? err.message : 'Supabase registration failed.' });
  }
});

app.post('/api/auth/supabase/login', authLimiter, async (req, res) => {
  try {
    const sbConfig = getSupabaseEnvConfig();
    if (sbConfig.missingEnvVars.length > 0) {
      res.status(500).json({
        error: `Missing required Supabase environment variable(s): ${sbConfig.missingEnvVars.join(', ')}`,
        missingEnvVars: sbConfig.missingEnvVars,
      });
      return;
    }
    const sb = getServerSupabaseClient();
    if (!sb) {
      res.status(503).json({ error: 'Supabase is not configured on the server.' });
      return;
    }
    const email = sanitizeText(req.body?.email, 120).toLowerCase();
    const password = typeof req.body?.password === 'string' ? req.body.password : '';
    if (!email || !password) {
      res.status(400).json({ error: 'Email and password are required.' });
      return;
    }

    const { data, error } = await sb.auth.signInWithPassword({ email, password });
    if (error || !data.user) {
      console.error('Supabase login error:', error);
      res.status(401).json({ error: error?.message || 'Invalid email or password.' });
      return;
    }

    await bridgeSupabaseUserToSession({
      req,
      res,
      sbUser: data.user,
      accessToken: data.session?.access_token,
      overrideExnessId: req.body?.exnessAccountId,
      overrideExnessConfirmed: Boolean(req.body?.exnessConfirmed),
      overrideReferralCode: req.body?.referralCode,
    });
  } catch (err) {
    console.error('Supabase login error:', err);
    res.status(500).json({ error: err instanceof Error ? err.message : 'Supabase sign-in failed.' });
  }
});

app.get('/api/notifications/emails', requireAuth, (req: AuthedRequest, res) => {
  const rows = db
    .prepare('SELECT * FROM email_logs WHERE recipient_email = ? ORDER BY id DESC LIMIT 30')
    .all(req.currentUser!.email);
  res.json({ emails: rows });
});

// ---------------- Supabase Saved Setups, Playbooks & Media History ----------------
app.get('/api/supabase/setups', requireAuth, async (req: AuthedRequest, res) => {
  try {
    const sbAdmin = getServerSupabaseAdminClient();
    const uid = sbAdmin ? await resolveUserSupabaseUid(req.currentUser!) : null;

    if (sbAdmin && uid) {
      const { setups, error } = await listSupabaseSavedSetups(uid);
      if (error) {
        res.status(500).json({ error });
        return;
      }
      res.json({
        setups: setups.map((s) => ({
          id: s.id,
          symbol: s.symbol,
          timeframe: s.timeframe,
          bias: s.bias,
          entryZone: s.entry_zone,
          stopLoss: Number(s.stop_loss),
          tp1: Number(s.tp1),
          notes: s.notes,
          createdAt: s.created_at,
        })),
      });
      return;
    }

    const rows = db
      .prepare('SELECT * FROM saved_setups WHERE user_id = ? ORDER BY id DESC LIMIT 30')
      .all(req.currentUser!.id) as Array<{
      id: number;
      symbol: string;
      timeframe: 'M15' | 'H1' | 'H4' | 'D1';
      bias: 'Bullish' | 'Bearish';
      entry_zone: string;
      stop_loss: number;
      tp1: number;
      notes: string;
      created_at: string;
    }>;

    res.json({
      setups: rows.map((r) => ({
        id: String(r.id),
        symbol: r.symbol,
        timeframe: r.timeframe,
        bias: r.bias,
        entryZone: r.entry_zone,
        stopLoss: Number(r.stop_loss),
        tp1: Number(r.tp1),
        notes: r.notes,
        createdAt: r.created_at,
      })),
    });
  } catch (err) {
    console.error('Load saved setups error:', err);
    res.status(500).json({ error: err instanceof Error ? err.message : 'Unable to load saved setups.' });
  }
});

app.post('/api/supabase/setups', requireAuth, async (req: AuthedRequest, res) => {
  try {
    const symbol = sanitizeText(req.body?.symbol || 'EURUSD', 16).toUpperCase();
    const timeframe = normalizeServerTimeframe(req.body?.timeframe);
    const bias = req.body?.bias === 'Bearish' ? 'Bearish' : 'Bullish';
    const entryZone = sanitizeText(req.body?.entryZone || 'Market', 64);
    const stopLoss = Number(req.body?.stopLoss || 0);
    const tp1 = Number(req.body?.tp1 || 0);
    const notes = sanitizeText(req.body?.notes || '', 500);

    const sbAdmin = getServerSupabaseAdminClient();
    const uid = sbAdmin ? await resolveUserSupabaseUid(req.currentUser!) : null;

    if (sbAdmin && uid) {
      const { setup, error } = await createSupabaseSavedSetup({
        user_id: uid,
        symbol,
        timeframe,
        bias,
        entry_zone: entryZone,
        stop_loss: stopLoss,
        tp1,
        notes,
      });
      if (error || !setup) {
        res.status(500).json({ error: error || 'Unable to save setup to Supabase.' });
        return;
      }
      res.status(201).json({
        setup: {
          id: setup.id,
          symbol: setup.symbol,
          timeframe: setup.timeframe,
          bias: setup.bias,
          entryZone: setup.entry_zone,
          stopLoss: Number(setup.stop_loss),
          tp1: Number(setup.tp1),
          notes: setup.notes,
          createdAt: setup.created_at,
        },
      });
      return;
    }

    const info = db
      .prepare(
        `INSERT INTO saved_setups (user_id, symbol, timeframe, bias, entry_zone, stop_loss, tp1, notes)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .run(req.currentUser!.id, symbol, timeframe, bias, entryZone, stopLoss, tp1, notes);
    const row = db.prepare('SELECT * FROM saved_setups WHERE id = ?').get(info.lastInsertRowid) as {
      id: number;
      symbol: string;
      timeframe: 'M15' | 'H1' | 'H4' | 'D1';
      bias: 'Bullish' | 'Bearish';
      entry_zone: string;
      stop_loss: number;
      tp1: number;
      notes: string;
      created_at: string;
    };

    res.status(201).json({
      setup: {
        id: String(row.id),
        symbol: row.symbol,
        timeframe: row.timeframe,
        bias: row.bias,
        entryZone: row.entry_zone,
        stopLoss: Number(row.stop_loss),
        tp1: Number(row.tp1),
        notes: row.notes,
        createdAt: row.created_at,
      },
    });
  } catch (err) {
    console.error('Create saved setup error:', err);
    res.status(500).json({ error: err instanceof Error ? err.message : 'Unable to save setup.' });
  }
});

app.delete('/api/supabase/setups/:id', requireAuth, async (req: AuthedRequest, res) => {
  try {
    const setupId = sanitizeText(req.params.id, 80);
    const sbAdmin = getServerSupabaseAdminClient();
    const uid = sbAdmin ? await resolveUserSupabaseUid(req.currentUser!) : null;

    if (sbAdmin && uid) {
      const { error } = await deleteSupabaseSavedSetup(setupId, uid);
      if (error) {
        res.status(500).json({ error });
        return;
      }
      res.json({ ok: true });
      return;
    }

    db.prepare('DELETE FROM saved_setups WHERE id = ? AND user_id = ?').run(Number(setupId), req.currentUser!.id);
    res.json({ ok: true });
  } catch (err) {
    console.error('Delete saved setup error:', err);
    res.status(500).json({ error: err instanceof Error ? err.message : 'Unable to delete setup.' });
  }
});

app.get('/api/supabase/playbooks', requireAuth, async (req: AuthedRequest, res) => {
  try {
    const sbAdmin = getServerSupabaseAdminClient();
    const uid = sbAdmin ? await resolveUserSupabaseUid(req.currentUser!) : null;

    if (sbAdmin && uid) {
      const { playbooks, error } = await listSupabasePlaybooks(uid);
      if (error) {
        res.status(500).json({ error });
        return;
      }
      res.json({
        playbooks: playbooks.map((p) => ({
          id: p.id,
          title: p.title,
          pair: p.pair,
          timeframe: p.timeframe,
          rulesSummary: p.rules_summary,
          createdAt: p.created_at,
        })),
      });
      return;
    }

    const rows = db
      .prepare('SELECT * FROM strategy_playbooks WHERE user_id = ? ORDER BY id DESC LIMIT 40')
      .all(req.currentUser!.id) as Array<{
      id: number;
      title: string;
      pair: string;
      timeframe: string;
      rules_summary: string;
      created_at: string;
    }>;

    res.json({
      playbooks: rows.map((p) => ({
        id: String(p.id),
        title: p.title,
        pair: p.pair,
        timeframe: p.timeframe,
        rulesSummary: p.rules_summary,
        createdAt: p.created_at,
      })),
    });
  } catch (err) {
    console.error('Load playbooks error:', err);
    res.status(500).json({ error: err instanceof Error ? err.message : 'Unable to load playbooks.' });
  }
});

app.post('/api/supabase/playbooks', requireAuth, async (req: AuthedRequest, res) => {
  try {
    const title = sanitizeText(req.body?.title, 80);
    const pair = sanitizeText(req.body?.pair || 'EURUSD', 16).toUpperCase();
    const timeframe = sanitizeText(req.body?.timeframe || 'M15', 8).toUpperCase();
    const rulesSummary = sanitizeText(req.body?.rulesSummary, 600);

    if (!title || !rulesSummary) {
      res.status(400).json({ error: 'Strategy title and rules summary are required.' });
      return;
    }

    const sbAdmin = getServerSupabaseAdminClient();
    const uid = sbAdmin ? await resolveUserSupabaseUid(req.currentUser!) : null;

    if (sbAdmin && uid) {
      const { playbook, error } = await createSupabasePlaybook({
        user_id: uid,
        title,
        pair,
        timeframe,
        rules_summary: rulesSummary,
      });
      if (error || !playbook) {
        res.status(500).json({ error: error || 'Unable to save playbook to Supabase.' });
        return;
      }
      res.status(201).json({
        playbook: {
          id: playbook.id,
          title: playbook.title,
          pair: playbook.pair,
          timeframe: playbook.timeframe,
          rulesSummary: playbook.rules_summary,
          createdAt: playbook.created_at,
        },
      });
      return;
    }

    const info = db
      .prepare(
        `INSERT INTO strategy_playbooks (user_id, title, pair, timeframe, rules_summary)
         VALUES (?, ?, ?, ?, ?)`
      )
      .run(req.currentUser!.id, title, pair, timeframe, rulesSummary);
    const row = db.prepare('SELECT * FROM strategy_playbooks WHERE id = ?').get(info.lastInsertRowid) as {
      id: number;
      title: string;
      pair: string;
      timeframe: string;
      rules_summary: string;
      created_at: string;
    };

    res.status(201).json({
      playbook: {
        id: String(row.id),
        title: row.title,
        pair: row.pair,
        timeframe: row.timeframe,
        rulesSummary: row.rules_summary,
        createdAt: row.created_at,
      },
    });
  } catch (err) {
    console.error('Create playbook error:', err);
    res.status(500).json({ error: err instanceof Error ? err.message : 'Unable to save playbook.' });
  }
});

app.delete('/api/supabase/playbooks/:id', requireAuth, async (req: AuthedRequest, res) => {
  try {
    const playbookId = sanitizeText(req.params.id, 80);
    const sbAdmin = getServerSupabaseAdminClient();
    const uid = sbAdmin ? await resolveUserSupabaseUid(req.currentUser!) : null;

    if (sbAdmin && uid) {
      const { error } = await deleteSupabasePlaybook(playbookId, uid);
      if (error) {
        res.status(500).json({ error });
        return;
      }
      res.json({ ok: true });
      return;
    }

    db.prepare('DELETE FROM strategy_playbooks WHERE id = ? AND user_id = ?').run(
      Number(playbookId),
      req.currentUser!.id
    );
    res.json({ ok: true });
  } catch (err) {
    console.error('Delete playbook error:', err);
    res.status(500).json({ error: err instanceof Error ? err.message : 'Unable to delete playbook.' });
  }
});

// ---------------- Orders & Payments (Safaricom M-Pesa Daraja + Crypto Gateway) ----------------
function normalizeKenyanPhone(raw: string): string | null {
  const digits = raw.replace(/\D/g, '');
  if (/^254[17]\d{8}$/.test(digits)) return digits;
  if (/^0[17]\d{8}$/.test(digits)) return `254${digits.slice(1)}`;
  if (/^[17]\d{8}$/.test(digits)) return `254${digits}`;
  return null;
}

app.get('/api/orders/my', requireAuth, (req: AuthedRequest, res) => {
  const orders = db
    .prepare('SELECT * FROM orders WHERE user_id = ? ORDER BY id DESC')
    .all(req.currentUser!.id);
  res.json({ orders });
});

app.post('/api/orders/create', requireAuth, async (req: AuthedRequest, res) => {
  await hydrateSiteSettingsFromCloud().catch(() => {});
  const user = req.currentUser!;
  const isDrtProduct = req.body?.productKey === 'drt_analyzer' || req.body?.productKey === 'ea_bots';
  const productKey = isDrtProduct ? 'drt_analyzer' : 'analyzer';
  const billingCycle = normalizeBillingCycle(req.body?.billingCycle);
  const paymentMethod = req.body?.paymentMethod === 'mpesa' ? 'mpesa' : 'crypto';
  const cryptoCurrency = sanitizeText(req.body?.cryptoCurrency || 'USDT', 16);
  const cryptoNetwork = sanitizeText(req.body?.cryptoNetwork || 'TRC20', 16);

  const settings = getSettingsMap();
  const baseMonthlyUsd = isDrtProduct
    ? Number(settings.ea_bots_price_usd || 5.25)
    : Number(settings.analyzer_price_usd || 5.25);
  const usdKesRate = Number(settings.usd_kes_rate || 130);
  const planPricing = computeSubscriptionPrice(baseMonthlyUsd, billingCycle, usdKesRate);
  const amountUsd = planPricing.amountUsd;
  const amountKes = planPricing.amountKes;

  let commissionPct = Number(settings.influencer_commission_pct || 35);
  if (user.referred_by) {
    const referrerRow = db
      .prepare('SELECT commission_pct FROM users WHERE id = ?')
      .get(user.referred_by) as { commission_pct: number | null } | undefined;
    if (referrerRow && typeof referrerRow.commission_pct === 'number' && Number.isFinite(referrerRow.commission_pct)) {
      commissionPct = referrerRow.commission_pct;
    }
  }

  const baseName = isDrtProduct
    ? 'GRIDPIPs DRT Strategy Market Analyzer'
    : 'GRIDPIPs ICT Strategy Market Analyzer';
  const productName = `${baseName} (${planPricing.label} Subscription · ${planPricing.days}d)`;

  let depositAddress: string | null = null;
  if (paymentMethod === 'crypto') {
    if (cryptoCurrency === 'BTC') depositAddress = settings.btc_address;
    else if (cryptoNetwork === 'ERC20') depositAddress = settings.usdt_erc20_address;
    else depositAddress = settings.usdt_trc20_address;
  }

  const commissionUsd = user.referred_by ? Number(((amountUsd * commissionPct) / 100).toFixed(2)) : 0;

  // Reuse recent unpaid pending order for the same product to prevent duplicate clutter
  const existingPending = isDrtProduct
    ? (db
        .prepare(
          `SELECT * FROM orders
           WHERE user_id = ? AND product_key IN ('drt_analyzer', 'ea_bots') AND payment_status = 'pending'
           ORDER BY id DESC LIMIT 1`
        )
        .get(user.id) as { id: number } | undefined)
    : (db
        .prepare(
          `SELECT * FROM orders
           WHERE user_id = ? AND product_key = 'analyzer' AND payment_status = 'pending'
           ORDER BY id DESC LIMIT 1`
        )
        .get(user.id) as { id: number } | undefined);

  if (existingPending) {
    db.prepare(
      `UPDATE orders
       SET product_key = ?, product_name = ?, billing_cycle = ?, duration_days = ?, amount_usd = ?, amount_kes = ?,
           payment_method = ?, crypto_currency = ?, crypto_network = ?, crypto_address = ?, commission_usd = ?
       WHERE id = ?`
    ).run(
      productKey,
      productName,
      billingCycle,
      planPricing.days,
      amountUsd,
      amountKes,
      paymentMethod,
      paymentMethod === 'crypto' ? cryptoCurrency : null,
      paymentMethod === 'crypto' ? cryptoNetwork : null,
      depositAddress,
      commissionUsd,
      existingPending.id
    );
    const updatedOrder = db.prepare('SELECT * FROM orders WHERE id = ?').get(existingPending.id);
    await upsertCloudOrder(existingPending.id).catch(() => {});
    res.status(200).json({ order: updatedOrder });
    return;
  }

  const orderNumber = `GP-${Date.now().toString(36).toUpperCase()}-${Math.floor(100 + Math.random() * 899)}`;

  const info = db
    .prepare(
      `INSERT INTO orders (
        order_number, user_id, product_key, product_name, billing_cycle, duration_days,
        amount_usd, amount_kes, payment_method, payment_status, crypto_currency, crypto_network,
        crypto_address, referrer_id, commission_usd
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending', ?, ?, ?, ?, ?)`
    )
    .run(
      orderNumber,
      user.id,
      productKey,
      productName,
      billingCycle,
      planPricing.days,
      amountUsd,
      amountKes,
      paymentMethod,
      paymentMethod === 'crypto' ? cryptoCurrency : null,
      paymentMethod === 'crypto' ? cryptoNetwork : null,
      depositAddress,
      user.referred_by || null,
      commissionUsd
    );

  const order = db.prepare('SELECT * FROM orders WHERE id = ?').get(info.lastInsertRowid);
  await upsertCloudOrder(Number(info.lastInsertRowid)).catch(() => {});
  res.status(201).json({ order });
});

async function fulfillOrder(orderId: number): Promise<void> {
  const order = db.prepare('SELECT * FROM orders WHERE id = ?').get(orderId) as
    | {
        id: number;
        order_number: string;
        user_id: number;
        product_key: string;
        product_name: string;
        billing_cycle?: string | null;
        duration_days?: number | null;
        amount_usd: number;
        amount_kes: number;
        payment_method: string;
        payment_status: string;
      }
    | undefined;
  if (!order) return;

  const alreadyPaid = order.payment_status === 'paid';
  const durationDays =
    typeof order.duration_days === 'number' && order.duration_days > 0 ? order.duration_days : 30;
  const currentUser = db.prepare('SELECT * FROM users WHERE id = ?').get(order.user_id) as
    | DbUser
    | undefined;

  const isDrtOrder = order.product_key === 'drt_analyzer' || order.product_key === 'ea_bots';
  let subscriptionEndsIso: string | null = null;
  if (!alreadyPaid) {
    const existingExpiryRaw = isDrtOrder
      ? currentUser?.ea_bots_expires_at
      : currentUser?.analyzer_expires_at;
    const existingExpiryMs = existingExpiryRaw ? Date.parse(existingExpiryRaw) : NaN;
    const nowMs = Date.now();
    const startMs =
      Number.isFinite(existingExpiryMs) && existingExpiryMs > nowMs ? existingExpiryMs : nowMs;
    const endMs = startMs + durationDays * 86_400_000;
    const startIso = new Date(startMs).toISOString();
    subscriptionEndsIso = new Date(endMs).toISOString();

    db.prepare(
      `UPDATE orders
       SET payment_status = 'paid',
           mpesa_result_code = COALESCE(mpesa_result_code, '0'),
           paid_at = COALESCE(paid_at, datetime('now')),
           subscription_starts_at = COALESCE(subscription_starts_at, ?),
           subscription_ends_at = COALESCE(subscription_ends_at, ?)
       WHERE id = ?`
    ).run(startIso, subscriptionEndsIso, orderId);

    if (order.product_key === 'analyzer') {
      db.prepare('UPDATE users SET has_analyzer = 1, analyzer_expires_at = ? WHERE id = ?').run(
        subscriptionEndsIso,
        order.user_id
      );
    } else if (isDrtOrder) {
      db.prepare('UPDATE users SET has_ea_bots = 1, ea_bots_expires_at = ? WHERE id = ?').run(
        subscriptionEndsIso,
        order.user_id
      );
    }
  } else {
    if (order.product_key === 'analyzer') {
      db.prepare('UPDATE users SET has_analyzer = 1 WHERE id = ?').run(order.user_id);
    } else if (isDrtOrder) {
      db.prepare('UPDATE users SET has_ea_bots = 1 WHERE id = ?').run(order.user_id);
    }
  }

  await Promise.all([
    upsertCloudOrder(orderId),
    syncUserStateToCloud(order.user_id),
    syncUserDirectoryEntryToCloud(order.user_id),
  ]);

  if (alreadyPaid) return;

  const user = db.prepare('SELECT * FROM users WHERE id = ?').get(order.user_id) as DbUser | undefined;
  if (user) {
    const sbUid = await resolveUserSupabaseUid(user);
    if (sbUid && getServerSupabaseAdminClient()) {
      await upsertSupabaseProfile({
        id: sbUid,
        email: user.email,
        full_name: user.name,
        role: user.role,
        exness_account_id: user.exness_account_id,
        exness_verified: Boolean(user.exness_verified),
        referral_code: user.referral_code,
        has_analyzer: Boolean(user.has_analyzer) || user.role === 'admin',
        has_ea_bots: Boolean(user.has_ea_bots) || user.role === 'admin',
      }).catch(() => {});
    }

    const validUntilLabel = subscriptionEndsIso ? subscriptionEndsIso.slice(0, 10) : '30 days';
    await sendAutomatedEmail({
      to: user.email,
      subject: `GRIDPIPs Subscription Activated — ${order.order_number}`,
      category: 'order_receipt',
      textPreview: `Subscription payment of $${order.amount_usd.toFixed(2)} (KES ${order.amount_kes}) confirmed for ${order.product_name}. Active through ${validUntilLabel}.`,
      html: `<h2>Subscription Confirmed — ${order.order_number}</h2>
        <p>Hello ${user.name},</p>
        <p>Your subscription payment of <strong>$${order.amount_usd.toFixed(2)} USD (KES ${order.amount_kes})</strong> via <strong>${order.payment_method.toUpperCase()}</strong> for <strong>${order.product_name}</strong> is confirmed.</p>
        <p><strong>Active Through:</strong> ${validUntilLabel} UTC (${durationDays} days)</p>
        <p>${
          isDrtOrder
            ? 'Open the DRT Strategy Market Analyzer in your GRIDPIPs account to scan live Dealing Range Theory (25/50/75 DRT) setups, Type 1/2/3 ranges, SMT divergence, and Premium/Discount PD Arrays.'
            : 'Open the ICT Strategy Market Analyzer in your GRIDPIPs account to scan live setups.'
        }</p>`,
    });
  }
}

interface DbMpesaTx {
  id: number;
  tx_reference: string;
  user_id: number;
  order_id: number | null;
  purpose: string;
  business_short_code: string;
  party_b: string;
  transaction_type: string;
  phone_number: string;
  amount_kes: number;
  merchant_request_id: string | null;
  checkout_request_id: string | null;
  mpesa_receipt_number: string | null;
  result_code: string | null;
  result_desc: string | null;
  status: 'pending' | 'completed' | 'failed' | 'cancelled';
  credited_to_wallet: number;
  transaction_date: string | null;
  callback_received_at: string | null;
  source_ip: string | null;
  raw_callback_json: string | null;
  created_at: string;
  updated_at: string;
}

const settleMpesaTxAndCreditWallet = db.transaction(
  (params: {
    txId: number;
    receiptNumber: string | null;
    resultDesc: string;
    phoneNumber: string | null;
    transactionDate: string | null;
    sourceIp: string | null;
    rawCallbackJson: string | null;
    fromCallback: boolean;
  }): { newlyCompleted: boolean; newlyCredited: boolean; userId: number; amountKes: number; purpose: string; orderId: number | null } => {
    const tx = db.prepare('SELECT * FROM mpesa_transactions WHERE id = ?').get(params.txId) as DbMpesaTx | undefined;
    if (!tx) {
      return { newlyCompleted: false, newlyCredited: false, userId: 0, amountKes: 0, purpose: '', orderId: null };
    }

    const wasPending = tx.status === 'pending';
    if (params.fromCallback) {
      db.prepare(
        `UPDATE mpesa_transactions
         SET status = 'completed',
             result_code = '0',
             result_desc = ?,
             mpesa_receipt_number = COALESCE(?, mpesa_receipt_number),
             phone_number = COALESCE(?, phone_number),
             transaction_date = COALESCE(?, transaction_date),
             callback_received_at = COALESCE(callback_received_at, datetime('now')),
             source_ip = COALESCE(source_ip, ?),
             raw_callback_json = COALESCE(raw_callback_json, ?),
             updated_at = datetime('now')
         WHERE id = ?`
      ).run(
        params.resultDesc,
        params.receiptNumber,
        params.phoneNumber,
        params.transactionDate,
        params.sourceIp,
        params.rawCallbackJson,
        tx.id
      );
    } else {
      db.prepare(
        `UPDATE mpesa_transactions
         SET status = 'completed',
             result_code = '0',
             result_desc = ?,
             mpesa_receipt_number = COALESCE(?, mpesa_receipt_number),
             updated_at = datetime('now')
         WHERE id = ?`
      ).run(params.resultDesc, params.receiptNumber, tx.id);
    }

    let newlyCredited = false;
    if (tx.purpose === 'wallet_deposit') {
      const creditRes = db
        .prepare(
          `UPDATE mpesa_transactions
           SET credited_to_wallet = 1,
               updated_at = datetime('now')
           WHERE id = ? AND credited_to_wallet = 0`
        )
        .run(tx.id);
      if (creditRes.changes === 1) {
        db.prepare('UPDATE users SET wallet_balance_kes = wallet_balance_kes + ? WHERE id = ?').run(
          tx.amount_kes,
          tx.user_id
        );
        newlyCredited = true;
      }
    }

    return {
      newlyCompleted: wasPending,
      newlyCredited,
      userId: tx.user_id,
      amountKes: tx.amount_kes,
      purpose: tx.purpose,
      orderId: tx.order_id,
    };
  }
);

function resolveDarajaCallbackUrl(req: Request): string {
  const appendCallbackTokenIfNeeded = (urlStr: string): string => {
    const secret = cleanMpesaEnvVar('MPESA_CALLBACK_SECRET');
    if (!secret || /[?&]token=/i.test(urlStr)) return urlStr;
    const sep = urlStr.includes('?') ? '&' : '?';
    return `${urlStr}${sep}token=${encodeURIComponent(secret)}`;
  };

  const configured = cleanMpesaEnvVar('MPESA_CALLBACK_URL');
  if (configured) {
    const normalized = /^https?:\/\/gridpips\.com(\/|$)/i.test(configured)
      ? configured.replace(/^https?:\/\/gridpips\.com/i, 'https://www.gridpips.com')
      : configured;
    return appendCallbackTokenIfNeeded(normalized);
  }
  const host = (req.get('host') || '').toLowerCase();
  if (
    host &&
    !host.startsWith('localhost') &&
    !host.startsWith('127.0.0.1') &&
    !host.includes('ais-dev-') &&
    !host.includes('ais-pre-') &&
    host !== 'gridpips.com'
  ) {
    return appendCallbackTokenIfNeeded(`https://${host}/api/payments/mpesa/callback`);
  }
  const fallbackOrigin = (process.env.APP_URL || 'https://www.gridpips.com')
    .replace(/\/+$/, '')
    .replace(/^https?:\/\/gridpips\.com$/i, 'https://www.gridpips.com');
  return appendCallbackTokenIfNeeded(`${fallbackOrigin}/api/payments/mpesa/callback`);
}

app.post('/api/orders/:id/mpesa/stk', requireAuth, stkIpLimiter, stkUserLimiter, async (req: AuthedRequest, res) => {
  const orderId = Number(req.params.id);
  const phone = normalizeKenyanPhone(sanitizeText(req.body?.phone, 25));
  if (!phone) {
    res.status(400).json({ error: 'Enter a valid Safaricom M-Pesa phone number (e.g. 0712345678 or 254712345678).' });
    return;
  }

  const order = db
    .prepare('SELECT * FROM orders WHERE id = ? AND user_id = ?')
    .get(orderId, req.currentUser!.id) as
    | {
        id: number;
        order_number: string;
        product_key: string;
        amount_kes: number;
        payment_status: string;
      }
    | undefined;

  if (!order) {
    res.status(404).json({ error: 'Order not found.' });
    return;
  }

  if (order.payment_status === 'paid') {
    res.status(400).json({ error: 'This order is already paid and unlocked.' });
    return;
  }

  const settings = getSettingsMap();
  const daraja = getDarajaConfigStatus(settings);
  if (!daraja.configured) {
    res.status(400).json({
      error: `Safaricom M-Pesa Daraja STK Push is not configured on the server yet (missing: ${daraja.missingEnvVars.join(', ')}). Use manual Till / Paybill confirmation below or Crypto checkout.`,
      missingEnvVars: daraja.missingEnvVars,
    });
    return;
  }

  const callbackUrl = resolveDarajaCallbackUrl(req);

  try {
    const stkResult = await initiateDarajaStkPush({
      phone,
      amountKes: order.amount_kes,
      accountReference: order.order_number,
      transactionDesc:
        order.product_key === 'drt_analyzer' || order.product_key === 'ea_bots'
          ? 'GRIDPIPs DRT'
          : 'GRIDPIPs ICT',
      callbackUrl,
      settings,
    });

    db.prepare(
      `UPDATE orders
       SET payment_method = 'mpesa',
           payment_status = 'processing',
           mpesa_phone = ?,
           mpesa_checkout_id = ?,
           mpesa_merchant_request_id = ?,
           mpesa_result_code = NULL,
           mpesa_result_desc = ?
       WHERE id = ?`
    ).run(
      phone,
      stkResult.checkoutRequestId,
      stkResult.merchantRequestId || null,
      stkResult.customerMessage,
      order.id
    );

    const txRef = `${order.order_number}-${Date.now().toString(36).toUpperCase()}`;
    const txInfo = db
      .prepare(
        `INSERT INTO mpesa_transactions (
          tx_reference, user_id, order_id, purpose, business_short_code, party_b, transaction_type,
          phone_number, amount_kes, merchant_request_id, checkout_request_id, result_desc, status
        ) VALUES (?, ?, ?, 'order_payment', ?, ?, ?, ?, ?, ?, ?, ?, 'pending')`
      )
      .run(
        txRef,
        req.currentUser!.id,
        order.id,
        stkResult.shortCode,
        stkResult.partyB,
        stkResult.transactionType,
        phone,
        order.amount_kes,
        stkResult.merchantRequestId || null,
        stkResult.checkoutRequestId,
        stkResult.customerMessage
      );

    await Promise.all([
      upsertCloudOrder(order.id),
      upsertCloudMpesaTransaction(Number(txInfo.lastInsertRowid)),
    ]);
    logSecurityEvent(
      'DARAJA_STK_INITIATED',
      'info',
      getClientIp(req),
      req.currentUser!.email,
      `Order ${order.order_number} · +${phone} · CheckoutID ${stkResult.checkoutRequestId} (${daraja.env})`
    );

    const updated = db.prepare('SELECT * FROM orders WHERE id = ?').get(order.id);
    res.json({
      order: updated,
      mode: daraja.env,
      transactionType: stkResult.transactionType,
      shortCode: stkResult.shortCode,
      partyB: stkResult.partyB,
      checkoutId: stkResult.checkoutRequestId,
      merchantRequestId: stkResult.merchantRequestId,
      message: stkResult.customerMessage,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Unable to send Safaricom M-Pesa Daraja STK prompt.';
    logSecurityEvent(
      'DARAJA_STK_ERROR',
      'warning',
      getClientIp(req),
      req.currentUser!.email,
      `Order ${order.order_number}: ${msg}`
    );
    res.status(502).json({ error: msg });
  }
});

app.post('/api/orders/:id/wallet/pay', requireAuth, async (req: AuthedRequest, res) => {
  const orderId = Number(req.params.id);
  const order = db
    .prepare('SELECT * FROM orders WHERE id = ? AND user_id = ?')
    .get(orderId, req.currentUser!.id) as
    | { id: number; order_number: string; user_id: number; amount_kes: number; payment_status: string }
    | undefined;

  if (!order) {
    res.status(404).json({ error: 'Order not found.' });
    return;
  }
  if (order.payment_status === 'paid') {
    const user = db.prepare('SELECT * FROM users WHERE id = ?').get(req.currentUser!.id) as DbUser;
    res.json({ status: 'paid', order, user: serializeUser(user), message: 'Order already paid.' });
    return;
  }

  const deductWalletTx = db.transaction(() => {
    const debit = db
      .prepare('UPDATE users SET wallet_balance_kes = wallet_balance_kes - ? WHERE id = ? AND wallet_balance_kes >= ?')
      .run(order.amount_kes, req.currentUser!.id, order.amount_kes);
    if (debit.changes !== 1) {
      return false;
    }
    db.prepare(
      `UPDATE orders
       SET payment_method = 'mpesa',
           mpesa_receipt = COALESCE(mpesa_receipt, ?),
           mpesa_result_code = '0',
           mpesa_result_desc = 'Settled from confirmed M-Pesa KES Wallet balance.'
       WHERE id = ?`
    ).run(`WALLET-${order.order_number}`, order.id);
    return true;
  });

  if (!deductWalletTx()) {
    const freshUser = db.prepare('SELECT * FROM users WHERE id = ?').get(req.currentUser!.id) as DbUser;
    res.status(400).json({
      error: `Insufficient confirmed KES wallet balance (Available: KES ${Number(freshUser.wallet_balance_kes || 0).toLocaleString()} · Required: KES ${order.amount_kes.toLocaleString()}).`,
    });
    return;
  }

  await fulfillOrder(order.id);
  logSecurityEvent(
    'WALLET_ORDER_PAID',
    'info',
    getClientIp(req),
    req.currentUser!.email,
    `Paid order ${order.order_number} (KES ${order.amount_kes}) from confirmed KES wallet`
  );
  const updatedOrder = db.prepare('SELECT * FROM orders WHERE id = ?').get(order.id);
  const updatedUser = db.prepare('SELECT * FROM users WHERE id = ?').get(req.currentUser!.id) as DbUser;
  res.json({
    status: 'paid',
    order: updatedOrder,
    user: serializeUser(updatedUser),
    message: 'Payment settled from your verified KES wallet balance and license unlocked.',
  });
});

app.get('/api/orders/:id/mpesa/status', requireAuth, async (req: AuthedRequest, res) => {
  const orderId = Number(req.params.id);
  let order = db
    .prepare('SELECT * FROM orders WHERE id = ? AND user_id = ?')
    .get(orderId, req.currentUser!.id) as
    | {
        id: number;
        order_number: string;
        payment_status: string;
        mpesa_checkout_id: string | null;
        mpesa_receipt: string | null;
        mpesa_result_code: string | null;
        mpesa_result_desc: string | null;
      }
    | undefined;

  if (!order) {
    res.status(404).json({ error: 'Order not found.' });
    return;
  }

  if (order.payment_status !== 'paid' && order.mpesa_checkout_id) {
    await hydrateMpesaCheckoutFromCloud(order.mpesa_checkout_id).catch(() => {});
    const refreshed = db
      .prepare('SELECT * FROM orders WHERE id = ? AND user_id = ?')
      .get(orderId, req.currentUser!.id) as typeof order;
    if (refreshed) order = refreshed;
  }

  if (order.payment_status === 'paid') {
    const user = db.prepare('SELECT * FROM users WHERE id = ?').get(req.currentUser!.id) as DbUser;
    res.json({
      status: 'paid',
      order,
      user: serializeUser(user),
      message: 'Payment confirmed and license unlocked.',
    });
    return;
  }

  if (order.payment_status === 'failed') {
    res.json({
      status: 'failed',
      order,
      message: order.mpesa_result_desc || 'M-Pesa transaction did not complete. You can retry STK Push.',
    });
    return;
  }

  const settings = getSettingsMap();
  const daraja = getDarajaConfigStatus(settings);
  if (order.mpesa_checkout_id && daraja.configured) {
    try {
      const queryRes = await queryDarajaStkStatus(order.mpesa_checkout_id, settings);
      const matchingTx = db
        .prepare('SELECT id FROM mpesa_transactions WHERE checkout_request_id = ?')
        .get(order.mpesa_checkout_id) as { id: number } | undefined;

      if (queryRes.state === 'paid') {
        db.prepare(
          "UPDATE orders SET mpesa_result_code = '0', mpesa_result_desc = ? WHERE id = ?"
        ).run(queryRes.resultDesc, order.id);
        if (matchingTx) {
          settleMpesaTxAndCreditWallet({
            txId: matchingTx.id,
            receiptNumber: order.mpesa_receipt || null,
            resultDesc: queryRes.resultDesc,
            phoneNumber: null,
            transactionDate: null,
            sourceIp: null,
            rawCallbackJson: null,
            fromCallback: false,
          });
          await upsertCloudMpesaTransaction(matchingTx.id);
        }
        await fulfillOrder(order.id);
        const updatedOrder = db.prepare('SELECT * FROM orders WHERE id = ?').get(order.id);
        const user = db.prepare('SELECT * FROM users WHERE id = ?').get(req.currentUser!.id) as DbUser;
        res.json({
          status: 'paid',
          order: updatedOrder,
          user: serializeUser(user),
          message: queryRes.resultDesc,
        });
        return;
      }
      if (queryRes.state === 'failed') {
        const txStatus = queryRes.resultCode === '1032' ? 'cancelled' : 'failed';
        db.prepare(
          "UPDATE orders SET payment_status = 'failed', mpesa_result_code = ?, mpesa_result_desc = ? WHERE id = ?"
        ).run(queryRes.resultCode, queryRes.resultDesc, order.id);
        if (matchingTx) {
          db.prepare(
            `UPDATE mpesa_transactions
             SET status = ?, result_code = ?, result_desc = ?, updated_at = datetime('now')
             WHERE id = ? AND status = 'pending'`
          ).run(txStatus, queryRes.resultCode, queryRes.resultDesc, matchingTx.id);
          void upsertCloudMpesaTransaction(matchingTx.id);
        }
        void upsertCloudOrder(order.id);
        const updatedOrder = db.prepare('SELECT * FROM orders WHERE id = ?').get(order.id);
        res.json({
          status: 'failed',
          order: updatedOrder,
          message: queryRes.resultDesc,
        });
        return;
      }
      res.json({
        status: 'processing',
        order,
        message: queryRes.resultDesc,
      });
      return;
    } catch (err) {
      res.json({
        status: 'processing',
        order,
        message:
          err instanceof Error
            ? `Checking Safaricom status (${err.message})...`
            : 'Awaiting M-Pesa confirmation...',
      });
      return;
    }
  }

  res.json({
    status: order.payment_status === 'processing' ? 'processing' : 'pending',
    order,
    message: order.mpesa_result_desc || 'Awaiting payment verification.',
  });
});

app.post('/api/orders/:id/mpesa/confirm', requireAuth, stkIpLimiter, stkUserLimiter, async (req: AuthedRequest, res) => {
  const orderId = Number(req.params.id);
  const rawReceipt = sanitizeText(req.body?.mpesaReceipt, 24).toUpperCase().replace(/\s+/g, '');

  const order = db
    .prepare('SELECT * FROM orders WHERE id = ? AND user_id = ?')
    .get(orderId, req.currentUser!.id) as
    | { id: number; order_number: string; payment_status: string; amount_kes: number }
    | undefined;

  if (!order) {
    res.status(404).json({ error: 'Order not found.' });
    return;
  }

  if (order.payment_status === 'paid') {
    const user = db.prepare('SELECT * FROM users WHERE id = ?').get(req.currentUser!.id) as DbUser;
    res.json({ order, user: serializeUser(user), status: 'paid' });
    return;
  }

  if (!/^[A-Z0-9]{8,14}$/.test(rawReceipt)) {
    res.status(400).json({
      error: 'Enter a valid Safaricom M-Pesa SMS confirmation code (8–14 letters/digits, e.g. UAJ8K4M92P).',
    });
    return;
  }

  const duplicate = db
    .prepare('SELECT id FROM orders WHERE mpesa_receipt = ? AND id != ?')
    .get(rawReceipt, order.id) as { id: number } | undefined;
  const duplicateTx = db
    .prepare('SELECT id FROM mpesa_transactions WHERE mpesa_receipt_number = ?')
    .get(rawReceipt) as { id: number } | undefined;
  if (duplicate || duplicateTx) {
    res.status(409).json({
      error: 'This M-Pesa confirmation code has already been used.',
    });
    return;
  }

  db.prepare(
    `UPDATE orders
     SET payment_method = 'mpesa',
         payment_status = 'processing',
         mpesa_receipt = ?,
         mpesa_result_desc = ?
     WHERE id = ?`
  ).run(
    rawReceipt,
    'Manual M-Pesa confirmation code submitted — awaiting merchant settlement review.',
    order.id
  );

  // Admins verifying their own account unlock immediately; regular users await settlement confirmation
  if (req.currentUser!.role === 'admin') {
    await fulfillOrder(order.id);
  } else {
    void upsertCloudOrder(order.id);
    logSecurityEvent(
      'MPESA_MANUAL_RECEIPT_SUBMITTED',
      'info',
      getClientIp(req),
      req.currentUser!.email,
      `Order ${order.order_number} · Receipt ${rawReceipt} (KES ${order.amount_kes})`
    );
  }

  const updated = db.prepare('SELECT * FROM orders WHERE id = ?').get(order.id) as {
    payment_status: string;
  };
  const user = db.prepare('SELECT * FROM users WHERE id = ?').get(req.currentUser!.id) as DbUser;
  res.json({
    order: updated,
    user: serializeUser(user),
    status: updated.payment_status,
    message:
      updated.payment_status === 'paid'
        ? 'M-Pesa receipt verified and access unlocked.'
        : `M-Pesa code ${rawReceipt} submitted for verification. Once confirmed, your license unlocks automatically.`,
  });
});

app.post('/api/orders/:id/mpesa/reset', requireAuth, (req: AuthedRequest, res) => {
  const orderId = Number(req.params.id);
  const order = db
    .prepare('SELECT * FROM orders WHERE id = ? AND user_id = ?')
    .get(orderId, req.currentUser!.id) as
    | { id: number; payment_status: string; mpesa_checkout_id: string | null }
    | undefined;

  if (!order) {
    res.status(404).json({ error: 'Order not found.' });
    return;
  }
  if (order.payment_status === 'paid') {
    res.status(400).json({ error: 'Paid orders cannot be reset.' });
    return;
  }

  if (order.mpesa_checkout_id) {
    db.prepare(
      `UPDATE mpesa_transactions
       SET status = 'cancelled',
           result_desc = 'Reset by customer before completion.',
           updated_at = datetime('now')
       WHERE checkout_request_id = ? AND status = 'pending'`
    ).run(order.mpesa_checkout_id);
  }

  db.prepare(
    `UPDATE orders
     SET payment_status = 'pending',
         mpesa_checkout_id = NULL,
         mpesa_merchant_request_id = NULL,
         mpesa_result_code = NULL,
         mpesa_result_desc = NULL
     WHERE id = ?`
  ).run(order.id);
  void upsertCloudOrder(order.id);

  const updated = db.prepare('SELECT * FROM orders WHERE id = ?').get(order.id);
  res.json({ order: updated });
});

// ---------------- Customer Wallet Deposits (Safaricom Daraja STK Push) ----------------
app.get('/api/wallet/summary', requireAuth, async (req: AuthedRequest, res) => {
  await hydrateUserFromCloud(req.currentUser!.id, req.currentUser!.email).catch(() => {});
  const freshUser = db.prepare('SELECT * FROM users WHERE id = ?').get(req.currentUser!.id) as DbUser;
  const transactions = db
    .prepare(
      `SELECT * FROM mpesa_transactions
       WHERE user_id = ?
       ORDER BY id DESC LIMIT 50`
    )
    .all(req.currentUser!.id);
  res.json({
    walletBalanceKes: Number(freshUser.wallet_balance_kes || 0),
    transactions,
  });
});

app.post('/api/wallet/mpesa/deposit', requireAuth, stkIpLimiter, stkUserLimiter, async (req: AuthedRequest, res) => {
  const phone = normalizeKenyanPhone(sanitizeText(req.body?.phone, 25));
  const rawAmount = Number(req.body?.amountKes);
  const amountKes = Math.round(rawAmount);

  if (!phone) {
    res.status(400).json({ error: 'Enter a valid Safaricom M-Pesa phone number (e.g. 0712345678 or 254712345678).' });
    return;
  }
  if (!Number.isFinite(rawAmount) || amountKes < 10 || amountKes > 150000) {
    res.status(400).json({ error: 'Deposit amount must be between KES 10 and KES 150,000.' });
    return;
  }

  const settings = getSettingsMap();
  const daraja = getDarajaConfigStatus(settings);
  if (!daraja.configured) {
    res.status(400).json({
      error: `Safaricom M-Pesa Daraja STK Push is not configured on the server yet (missing: ${daraja.missingEnvVars.join(', ')}).`,
      missingEnvVars: daraja.missingEnvVars,
    });
    return;
  }

  const txReference = `GPW-${Date.now().toString(36).toUpperCase()}-${Math.floor(100 + Math.random() * 899)}`;
  const callbackUrl = resolveDarajaCallbackUrl(req);

  try {
    const stkResult = await initiateDarajaStkPush({
      phone,
      amountKes,
      accountReference: txReference,
      transactionDesc: 'GRIDPIPs Wallet',
      callbackUrl,
      settings,
    });

    const info = db
      .prepare(
        `INSERT INTO mpesa_transactions (
          tx_reference, user_id, order_id, purpose, business_short_code, party_b, transaction_type,
          phone_number, amount_kes, merchant_request_id, checkout_request_id, result_desc, status
        ) VALUES (?, ?, NULL, 'wallet_deposit', ?, ?, ?, ?, ?, ?, ?, ?, 'pending')`
      )
      .run(
        txReference,
        req.currentUser!.id,
        stkResult.shortCode,
        stkResult.partyB,
        stkResult.transactionType,
        phone,
        amountKes,
        stkResult.merchantRequestId || null,
        stkResult.checkoutRequestId,
        stkResult.customerMessage
      );

    const txId = Number(info.lastInsertRowid);
    await upsertCloudMpesaTransaction(txId);
    logSecurityEvent(
      'DARAJA_WALLET_STK_INITIATED',
      'info',
      getClientIp(req),
      req.currentUser!.email,
      `Wallet deposit ${txReference} · KES ${amountKes} · +${phone} · CheckoutID ${stkResult.checkoutRequestId}`
    );

    const transaction = db.prepare('SELECT * FROM mpesa_transactions WHERE id = ?').get(txId);
    res.status(201).json({
      transaction,
      mode: daraja.env,
      transactionType: stkResult.transactionType,
      shortCode: stkResult.shortCode,
      partyB: stkResult.partyB,
      checkoutId: stkResult.checkoutRequestId,
      merchantRequestId: stkResult.merchantRequestId,
      message: stkResult.customerMessage,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Unable to send Safaricom M-Pesa Daraja STK prompt.';
    logSecurityEvent(
      'DARAJA_WALLET_STK_ERROR',
      'warning',
      getClientIp(req),
      req.currentUser!.email,
      `Wallet deposit KES ${amountKes}: ${msg}`
    );
    res.status(502).json({ error: msg });
  }
});

app.get('/api/wallet/mpesa/:id/status', requireAuth, async (req: AuthedRequest, res) => {
  const txId = Number(req.params.id);
  let tx = db
    .prepare('SELECT * FROM mpesa_transactions WHERE id = ? AND user_id = ?')
    .get(txId, req.currentUser!.id) as DbMpesaTx | undefined;

  if (!tx) {
    res.status(404).json({ error: 'M-Pesa transaction not found.' });
    return;
  }

  if (tx.status === 'pending' && tx.checkout_request_id) {
    await hydrateMpesaCheckoutFromCloud(tx.checkout_request_id).catch(() => {});
    const refreshed = db
      .prepare('SELECT * FROM mpesa_transactions WHERE id = ? AND user_id = ?')
      .get(txId, req.currentUser!.id) as DbMpesaTx | undefined;
    if (refreshed) tx = refreshed;
  }

  if (tx.status === 'completed') {
    const user = db.prepare('SELECT * FROM users WHERE id = ?').get(req.currentUser!.id) as DbUser;
    res.json({
      status: 'completed',
      transaction: tx,
      user: serializeUser(user),
      walletBalanceKes: Number(user.wallet_balance_kes || 0),
      message: tx.result_desc || 'Deposit confirmed and credited to your wallet.',
    });
    return;
  }

  if (tx.status === 'failed' || tx.status === 'cancelled') {
    const user = db.prepare('SELECT * FROM users WHERE id = ?').get(req.currentUser!.id) as DbUser;
    res.json({
      status: tx.status,
      transaction: tx,
      user: serializeUser(user),
      walletBalanceKes: Number(user.wallet_balance_kes || 0),
      message: tx.result_desc || 'M-Pesa deposit was not completed.',
    });
    return;
  }

  const settings = getSettingsMap();
  const daraja = getDarajaConfigStatus(settings);
  if (tx.checkout_request_id && daraja.configured) {
    try {
      const queryRes = await queryDarajaStkStatus(tx.checkout_request_id, settings);
      if (queryRes.state === 'paid') {
        const outcome = settleMpesaTxAndCreditWallet({
          txId: tx.id,
          receiptNumber: tx.mpesa_receipt_number,
          resultDesc: queryRes.resultDesc,
          phoneNumber: null,
          transactionDate: null,
          sourceIp: null,
          rawCallbackJson: null,
          fromCallback: false,
        });
        await upsertCloudMpesaTransaction(tx.id);
        if (outcome.newlyCredited) {
          await syncUserStateToCloud(req.currentUser!.id);
          logSecurityEvent(
            'WALLET_CREDITED_STK_QUERY',
            'info',
            getClientIp(req),
            req.currentUser!.email,
            `Wallet credited KES ${tx.amount_kes} via Daraja STK Query (${tx.tx_reference})`
          );
        }
        const updatedTx = db.prepare('SELECT * FROM mpesa_transactions WHERE id = ?').get(tx.id);
        const user = db.prepare('SELECT * FROM users WHERE id = ?').get(req.currentUser!.id) as DbUser;
        res.json({
          status: 'completed',
          transaction: updatedTx,
          user: serializeUser(user),
          walletBalanceKes: Number(user.wallet_balance_kes || 0),
          message: queryRes.resultDesc,
        });
        return;
      }
      if (queryRes.state === 'failed') {
        const nextStatus = queryRes.resultCode === '1032' ? 'cancelled' : 'failed';
        db.prepare(
          `UPDATE mpesa_transactions
           SET status = ?, result_code = ?, result_desc = ?, updated_at = datetime('now')
           WHERE id = ? AND status = 'pending'`
        ).run(nextStatus, queryRes.resultCode, queryRes.resultDesc, tx.id);
        await upsertCloudMpesaTransaction(tx.id);
        const updatedTx = db.prepare('SELECT * FROM mpesa_transactions WHERE id = ?').get(tx.id);
        const user = db.prepare('SELECT * FROM users WHERE id = ?').get(req.currentUser!.id) as DbUser;
        res.json({
          status: nextStatus,
          transaction: updatedTx,
          user: serializeUser(user),
          walletBalanceKes: Number(user.wallet_balance_kes || 0),
          message: queryRes.resultDesc,
        });
        return;
      }
      res.json({
        status: 'pending',
        transaction: tx,
        message: queryRes.resultDesc,
      });
      return;
    } catch (err) {
      res.json({
        status: 'pending',
        transaction: tx,
        message:
          err instanceof Error
            ? `Checking Safaricom status (${err.message})...`
            : 'Awaiting M-Pesa confirmation...',
      });
      return;
    }
  }

  res.json({
    status: 'pending',
    transaction: tx,
    message: tx.result_desc || 'Awaiting M-Pesa confirmation...',
  });
});

async function handleDarajaCallback(req: Request, res: Response) {
  const clientIp = getClientIp(req);
  try {
    // 1. Optional shared callback secret enforcement when MPESA_CALLBACK_SECRET is set
    const callbackSecret = cleanMpesaEnvVar('MPESA_CALLBACK_SECRET');
    if (callbackSecret) {
      const providedToken = String(req.query.token || req.headers['x-mpesa-callback-secret'] || '').trim();
      if (providedToken !== callbackSecret) {
        logSecurityEvent(
          'DARAJA_CALLBACK_AUTH_REJECTED',
          'critical',
          clientIp,
          null,
          'Rejected M-Pesa callback with missing or invalid secret token'
        );
        res.status(403).json({ ResultCode: 1, ResultDesc: 'Forbidden' });
        return;
      }
    }

    const parsed = parseDarajaCallback(req.body);
    if (!parsed) {
      logSecurityEvent(
        'DARAJA_CALLBACK_MALFORMED',
        'warning',
        clientIp,
        null,
        'Ignored malformed or unrecognized M-Pesa Daraja callback payload'
      );
      res.status(200).json({ ResultCode: 0, ResultDesc: 'Accepted' });
      return;
    }

    let tx = db
      .prepare('SELECT * FROM mpesa_transactions WHERE checkout_request_id = ?')
      .get(parsed.checkoutRequestId) as DbMpesaTx | undefined;
    let order = db
      .prepare('SELECT * FROM orders WHERE mpesa_checkout_id = ?')
      .get(parsed.checkoutRequestId) as
      | {
          id: number;
          order_number: string;
          amount_kes: number;
          payment_status: string;
          mpesa_merchant_request_id: string | null;
        }
      | undefined;

    // 2. Hydrate from Supabase Cloud Postgres if callback arrived at a cold serverless instance
    if (!tx && !order) {
      await hydrateMpesaCheckoutFromCloud(parsed.checkoutRequestId);
      tx = db
        .prepare('SELECT * FROM mpesa_transactions WHERE checkout_request_id = ?')
        .get(parsed.checkoutRequestId) as DbMpesaTx | undefined;
      order = db
        .prepare('SELECT * FROM orders WHERE mpesa_checkout_id = ?')
        .get(parsed.checkoutRequestId) as typeof order;
    }

    // 2b. Reject fabricated / unknown CheckoutRequestID payloads
    if (!tx && !order) {
      logSecurityEvent(
        'DARAJA_CALLBACK_UNKNOWN_CHECKOUT',
        'warning',
        clientIp,
        null,
        `Ignored callback for unknown CheckoutRequestID ${parsed.checkoutRequestId}`
      );
      res.status(200).json({ ResultCode: 0, ResultDesc: 'Accepted' });
      return;
    }

    // 3. Cross-check MerchantRequestID matches initiated STK Push record
    const expectedMerchantId = tx?.merchant_request_id || order?.mpesa_merchant_request_id || '';
    if (expectedMerchantId && parsed.merchantRequestId && expectedMerchantId !== parsed.merchantRequestId) {
      logSecurityEvent(
        'DARAJA_CALLBACK_MERCHANT_MISMATCH',
        'critical',
        clientIp,
        null,
        `MerchantRequestID mismatch on ${parsed.checkoutRequestId} (expected ${expectedMerchantId}, got ${parsed.merchantRequestId})`
      );
      res.status(200).json({ ResultCode: 0, ResultDesc: 'Accepted' });
      return;
    }

    const rawCallbackJson = JSON.stringify(req.body).slice(0, 8000);
    const settings = getSettingsMap();
    const daraja = getDarajaConfigStatus(settings);
    const fromSafaricomIp = isSafaricomCallbackIp(clientIp);

    // 4. Fraud protection: if source IP is not Safaricom's allowlisted IPs, cross-verify with Daraja STK Query API before accepting success
    if (parsed.resultCode === 0 && !fromSafaricomIp) {
      if (!daraja.configured) {
        logSecurityEvent(
          'DARAJA_CALLBACK_UNVERIFIED_SOURCE',
          'critical',
          clientIp,
          null,
          `Blocked unverified success callback from ${clientIp} for ${parsed.checkoutRequestId} while Daraja credentials are missing`
        );
        res.status(200).json({ ResultCode: 0, ResultDesc: 'Accepted' });
        return;
      }
      try {
        const verified = await queryDarajaStkStatus(parsed.checkoutRequestId, settings);
        if (verified.state !== 'paid') {
          logSecurityEvent(
            'DARAJA_CALLBACK_FRAUD_BLOCKED',
            'critical',
            clientIp,
            null,
            `Blocked spoofed callback for ${parsed.checkoutRequestId} from ${clientIp}; Daraja query state=${verified.state} (${verified.resultDesc})`
          );
          res.status(200).json({ ResultCode: 0, ResultDesc: 'Accepted' });
          return;
        }
      } catch (verifyErr) {
        logSecurityEvent(
          'DARAJA_CALLBACK_VERIFY_ERROR',
          'warning',
          clientIp,
          null,
          `Unable to cross-verify callback for ${parsed.checkoutRequestId} from ${clientIp}: ${verifyErr instanceof Error ? verifyErr.message : 'error'}`
        );
        res.status(200).json({ ResultCode: 0, ResultDesc: 'Accepted' });
        return;
      }
    }

    const expectedAmountKes = tx ? tx.amount_kes : order ? order.amount_kes : 0;

    if (parsed.resultCode === 0) {
      // 5. Require M-Pesa Receipt Number and enforce strict uniqueness (no replay receipts)
      if (!parsed.mpesaReceiptNumber) {
        logSecurityEvent(
          'DARAJA_CALLBACK_MISSING_RECEIPT',
          'warning',
          clientIp,
          null,
          `Success callback for ${parsed.checkoutRequestId} missing MpesaReceiptNumber — skipped settlement`
        );
        res.status(200).json({ ResultCode: 0, ResultDesc: 'Accepted' });
        return;
      }

      const duplicateReceiptTx = db
        .prepare(
          'SELECT id, checkout_request_id FROM mpesa_transactions WHERE mpesa_receipt_number = ? AND (checkout_request_id IS NULL OR checkout_request_id != ?)'
        )
        .get(parsed.mpesaReceiptNumber, parsed.checkoutRequestId) as { id: number } | undefined;
      const duplicateReceiptOrder = db
        .prepare(
          'SELECT id, order_number FROM orders WHERE mpesa_receipt = ? AND (mpesa_checkout_id IS NULL OR mpesa_checkout_id != ?)'
        )
        .get(parsed.mpesaReceiptNumber, parsed.checkoutRequestId) as { id: number } | undefined;

      let cloudDuplicateReceipt = false;
      const sbAdmin = getServerSupabaseAdminClient();
      if (sbAdmin && !duplicateReceiptTx && !duplicateReceiptOrder) {
        const [{ data: sbDupTx }, { data: sbDupOrder }] = await Promise.all([
          sbAdmin
            .from('gridpips_mpesa_transactions')
            .select('checkout_request_id')
            .eq('mpesa_receipt_number', parsed.mpesaReceiptNumber)
            .neq('checkout_request_id', parsed.checkoutRequestId)
            .limit(1)
            .maybeSingle(),
          sbAdmin
            .from('gridpips_orders')
            .select('mpesa_checkout_id')
            .eq('mpesa_receipt', parsed.mpesaReceiptNumber)
            .neq('mpesa_checkout_id', parsed.checkoutRequestId)
            .limit(1)
            .maybeSingle(),
        ]);
        cloudDuplicateReceipt = Boolean(sbDupTx || sbDupOrder);
      }

      if (duplicateReceiptTx || duplicateReceiptOrder || cloudDuplicateReceipt) {
        logSecurityEvent(
          'DARAJA_DUPLICATE_RECEIPT_BLOCKED',
          'critical',
          clientIp,
          null,
          `Blocked duplicate M-Pesa receipt ${parsed.mpesaReceiptNumber} on ${parsed.checkoutRequestId}`
        );
        res.status(200).json({ ResultCode: 0, ResultDesc: 'Accepted' });
        return;
      }

      // 6. Validate amount meets expected order/deposit amount
      const amountOk = parsed.amount === null || parsed.amount >= Math.max(1, expectedAmountKes - 1);
      if (!amountOk) {
        const mismatchMsg = `Received KES ${parsed.amount} which is less than expected KES ${expectedAmountKes}.`;
        const cloudSaves: Array<Promise<void>> = [];
        if (tx) {
          db.prepare(
            `UPDATE mpesa_transactions
             SET status = 'failed',
                 result_code = 'AMOUNT_MISMATCH',
                 result_desc = ?,
                 mpesa_receipt_number = COALESCE(?, mpesa_receipt_number),
                 callback_received_at = datetime('now'),
                 source_ip = ?,
                 raw_callback_json = ?,
                 updated_at = datetime('now')
             WHERE id = ?`
          ).run(mismatchMsg, parsed.mpesaReceiptNumber, clientIp, rawCallbackJson, tx.id);
          cloudSaves.push(upsertCloudMpesaTransaction(tx.id));
        }
        if (order) {
          db.prepare(
            `UPDATE orders
             SET payment_status = 'failed',
                 mpesa_result_code = 'AMOUNT_MISMATCH',
                 mpesa_result_desc = ?
             WHERE id = ?`
          ).run(mismatchMsg, order.id);
          cloudSaves.push(upsertCloudOrder(order.id));
        }
        await Promise.all(cloudSaves);
        logSecurityEvent('DARAJA_AMOUNT_MISMATCH', 'critical', clientIp, null, mismatchMsg);
        res.status(200).json({ ResultCode: 0, ResultDesc: 'Accepted' });
        return;
      }

      // 7. Atomic settlement & wallet balance crediting (idempotent)
      if (tx) {
        const outcome = settleMpesaTxAndCreditWallet({
          txId: tx.id,
          receiptNumber: parsed.mpesaReceiptNumber,
          resultDesc: parsed.resultDesc || 'Payment confirmed via Safaricom Daraja callback',
          phoneNumber: parsed.phoneNumber,
          transactionDate: parsed.transactionDate,
          sourceIp: clientIp,
          rawCallbackJson,
          fromCallback: true,
        });
        await Promise.all([
          upsertCloudMpesaTransaction(tx.id),
          outcome.newlyCredited ? syncUserStateToCloud(outcome.userId) : Promise.resolve(),
        ]);
        if (outcome.newlyCredited) {
          const owner = db.prepare('SELECT email FROM users WHERE id = ?').get(outcome.userId) as
            | { email: string }
            | undefined;
          logSecurityEvent(
            'WALLET_CREDITED_DARAJA_CALLBACK',
            'info',
            clientIp,
            owner?.email || null,
            `Wallet credited KES ${outcome.amountKes} · Ref ${tx.tx_reference} · Receipt ${parsed.mpesaReceiptNumber}`
          );
          if (owner?.email) {
            await sendAutomatedEmail({
              to: owner.email,
              subject: `GRIDPIPs Wallet Deposit Confirmed — ${tx.tx_reference}`,
              category: 'wallet_deposit',
              textPreview: `M-Pesa receipt ${parsed.mpesaReceiptNumber} for KES ${outcome.amountKes} has been credited to your GRIDPIPs KES Wallet.`,
              html: `<h2>M-Pesa Wallet Deposit Confirmed</h2>
                <p>Reference: <strong>${tx.tx_reference}</strong></p>
                <p>M-Pesa Receipt: <strong>${parsed.mpesaReceiptNumber}</strong></p>
                <p>Amount Credited: <strong>KES ${outcome.amountKes.toLocaleString()}</strong></p>`,
            });
          }
        }
      }

      if (order) {
        db.prepare(
          `UPDATE orders
           SET payment_method = 'mpesa',
               mpesa_receipt = COALESCE(?, mpesa_receipt),
               mpesa_phone = COALESCE(?, mpesa_phone),
               mpesa_merchant_request_id = COALESCE(?, mpesa_merchant_request_id),
               mpesa_result_code = '0',
               mpesa_result_desc = ?
           WHERE id = ?`
        ).run(
          parsed.mpesaReceiptNumber,
          parsed.phoneNumber,
          parsed.merchantRequestId || null,
          parsed.resultDesc || 'Confirmed via Safaricom Daraja callback',
          order.id
        );
        await fulfillOrder(order.id);
        logSecurityEvent(
          'DARAJA_CALLBACK_PAID',
          'info',
          clientIp,
          null,
          `Order ${order.order_number} paid · Receipt ${parsed.mpesaReceiptNumber}`
        );
      }
    } else {
      // Failed or user-cancelled STK Push
      const readableDesc = mapDarajaResultMessage(String(parsed.resultCode), parsed.resultDesc);
      const nextStatus = parsed.resultCode === 1032 ? 'cancelled' : 'failed';
      const cloudSaves: Array<Promise<void>> = [];

      if (tx && tx.status === 'pending') {
        db.prepare(
          `UPDATE mpesa_transactions
           SET status = ?,
               result_code = ?,
               result_desc = ?,
               callback_received_at = datetime('now'),
               source_ip = ?,
               raw_callback_json = ?,
               updated_at = datetime('now')
           WHERE id = ? AND status = 'pending'`
        ).run(nextStatus, String(parsed.resultCode), readableDesc, clientIp, rawCallbackJson, tx.id);
        cloudSaves.push(upsertCloudMpesaTransaction(tx.id));
      }

      if (order && order.payment_status !== 'paid') {
        db.prepare(
          `UPDATE orders
           SET payment_status = 'failed',
               mpesa_result_code = ?,
               mpesa_result_desc = ?
           WHERE id = ?`
        ).run(String(parsed.resultCode), readableDesc, order.id);
        cloudSaves.push(upsertCloudOrder(order.id));
      }

      await Promise.all(cloudSaves);
      logSecurityEvent(
        nextStatus === 'cancelled' ? 'DARAJA_CALLBACK_CANCELLED' : 'DARAJA_CALLBACK_FAILED',
        'warning',
        clientIp,
        null,
        `Checkout ${parsed.checkoutRequestId} ${nextStatus} (${parsed.resultCode}): ${readableDesc}`
      );
    }

    res.status(200).json({ ResultCode: 0, ResultDesc: 'Accepted' });
  } catch (err) {
    console.error('M-Pesa Daraja callback error:', err);
    res.status(200).json({ ResultCode: 0, ResultDesc: 'Accepted' });
  }
}

app.post('/api/payments/mpesa/callback', callbackLimiter, handleDarajaCallback);
app.post('/api/mpesa/callback', callbackLimiter, handleDarajaCallback);

function resolveCryptoNetworkAndAddress(
  rawCurrency: unknown,
  rawNetwork: unknown,
  settings: Record<string, string>
): { currency: CryptoCurrency; network: CryptoNetwork; address: string } {
  const cur = String(rawCurrency || '').toUpperCase() === 'BTC' ? 'BTC' : 'USDT';
  if (cur === 'BTC') {
    return {
      currency: 'BTC',
      network: 'BTC',
      address: settings.btc_address || DEFAULT_CRYPTO_ADDRESSES.BTC,
    };
  }
  const net = String(rawNetwork || '').toUpperCase() === 'ERC20' ? 'ERC20' : 'TRC20';
  return {
    currency: 'USDT',
    network: net,
    address:
      net === 'ERC20'
        ? settings.usdt_erc20_address || DEFAULT_CRYPTO_ADDRESSES.USDT_ERC20
        : settings.usdt_trc20_address || DEFAULT_CRYPTO_ADDRESSES.USDT_TRC20,
  };
}

app.post('/api/orders/:id/crypto/submit', requireAuth, async (req: AuthedRequest, res) => {
  const orderId = Number(req.params.id);
  const rawTxHash = sanitizeText(req.body?.txHash, 130).replace(/\s+/g, '');
  const order = db
    .prepare('SELECT * FROM orders WHERE id = ? AND user_id = ?')
    .get(orderId, req.currentUser!.id) as
    | {
        id: number;
        order_number: string;
        product_name: string;
        payment_status: string;
        amount_usd: number;
        crypto_currency: string | null;
        crypto_network: string | null;
        crypto_address: string | null;
      }
    | undefined;

  if (!order) {
    res.status(404).json({ error: 'Order not found.' });
    return;
  }
  if (order.payment_status === 'paid') {
    const user = db.prepare('SELECT * FROM users WHERE id = ?').get(req.currentUser!.id) as DbUser;
    res.json({ order, user: serializeUser(user), status: 'paid' });
    return;
  }

  await hydrateSiteSettingsFromCloud().catch(() => {});
  const settings = getSettingsMap();
  const resolved = resolveCryptoNetworkAndAddress(
    req.body?.cryptoCurrency ?? order.crypto_currency,
    req.body?.cryptoNetwork ?? order.crypto_network,
    settings
  );

  const hashCheck = validateCryptoTxHashFormat(resolved.currency, resolved.network, rawTxHash);
  if (!hashCheck.ok) {
    res.status(400).json({ error: hashCheck.error });
    return;
  }
  const txHash = hashCheck.normalizedHash;

  const duplicateLocal = db
    .prepare('SELECT id FROM orders WHERE LOWER(crypto_tx_hash) = LOWER(?) AND id != ?')
    .get(txHash, order.id) as { id: number } | undefined;

  let duplicateCloud = false;
  const sbAdmin = getServerSupabaseAdminClient();
  if (!duplicateLocal && sbAdmin) {
    const { data: sbDup } = await sbAdmin
      .from('gridpips_orders')
      .select('order_number')
      .ilike('crypto_tx_hash', txHash)
      .neq('order_number', order.order_number)
      .limit(1)
      .maybeSingle();
    duplicateCloud = Boolean(sbDup);
  }

  if (duplicateLocal || duplicateCloud) {
    res.status(409).json({ error: 'This transaction hash has already been submitted on another order.' });
    return;
  }

  // Admin test/manual shortcut remains allowed, otherwise perform live on-chain blockchain verification
  if (req.currentUser!.role === 'admin') {
    db.prepare(
      `UPDATE orders
       SET payment_method = 'crypto',
           crypto_currency = ?,
           crypto_network = ?,
           crypto_address = ?,
           crypto_tx_hash = ?,
           mpesa_result_desc = ?
       WHERE id = ?`
    ).run(
      resolved.currency,
      resolved.network,
      resolved.address,
      txHash,
      'Verified by admin checkout.',
      order.id
    );
    await fulfillOrder(order.id);
    const updated = db.prepare('SELECT * FROM orders WHERE id = ?').get(order.id);
    const user = db.prepare('SELECT * FROM users WHERE id = ?').get(req.currentUser!.id) as DbUser;
    res.json({
      order: updated,
      user: serializeUser(user),
      status: 'paid',
      explorerUrl: getExplorerTxUrl(resolved.currency, resolved.network, txHash),
      message: 'On-chain transaction verified and access unlocked.',
    });
    return;
  }

  const verification = await verifyOnChainCryptoPayment({
    currency: resolved.currency,
    network: resolved.network,
    txHash,
    expectedAddress: resolved.address,
    expectedAmountUsd: Number(order.amount_usd || 5.25),
  });

  if (verification.outcome === 'rejected') {
    logSecurityEvent(
      'CRYPTO_TX_REJECTED',
      'warning',
      getClientIp(req),
      req.currentUser!.email,
      `Order ${order.order_number} (${resolved.currency} ${resolved.network}) rejected TX ${txHash}: ${verification.message}`
    );
    res.status(400).json({
      error: verification.message,
      explorerUrl: verification.explorerUrl,
    });
    return;
  }

  db.prepare(
    `UPDATE orders
     SET payment_method = 'crypto',
         payment_status = 'processing',
         crypto_currency = ?,
         crypto_network = ?,
         crypto_address = ?,
         crypto_tx_hash = ?,
         mpesa_result_desc = ?
     WHERE id = ?`
  ).run(
    resolved.currency,
    resolved.network,
    resolved.address,
    txHash,
    verification.message,
    order.id
  );

  if (verification.outcome === 'confirmed') {
    await fulfillOrder(order.id);
    logSecurityEvent(
      'CRYPTO_TX_VERIFIED_ONCHAIN',
      'info',
      getClientIp(req),
      req.currentUser!.email,
      `Order ${order.order_number} auto-unlocked via ${resolved.currency} (${resolved.network}) TX ${txHash}`
    );
    void sendAutomatedEmail({
      to: req.currentUser!.email,
      subject: `GRIDPIPs License Activated (${order.order_number})`,
      category: 'order_receipt',
      textPreview: `Your ${resolved.currency} (${resolved.network}) payment for ${order.product_name} has been confirmed on-chain (${txHash}).`,
      html: `<h2>Crypto Payment Confirmed</h2>
        <p>Order: <strong>${order.order_number}</strong></p>
        <p>Product: <strong>${order.product_name}</strong></p>
        <p>Method: <strong>${resolved.currency} (${resolved.network})</strong></p>
        <p>TX Hash: <strong>${txHash}</strong></p>
        <p>Amount Settled: <strong>$${Number(order.amount_usd).toFixed(2)} USD</strong></p>`,
    });
  } else {
    void upsertCloudOrder(order.id);
    logSecurityEvent(
      'CRYPTO_TX_SUBMITTED',
      'info',
      getClientIp(req),
      req.currentUser!.email,
      `Order ${order.order_number} · ${resolved.currency} (${resolved.network}) TX ${txHash} ($${order.amount_usd})`
    );
  }

  const updated = db.prepare('SELECT * FROM orders WHERE id = ?').get(order.id) as {
    payment_status: string;
  };
  const user = db.prepare('SELECT * FROM users WHERE id = ?').get(req.currentUser!.id) as DbUser;
  res.json({
    order: updated,
    user: serializeUser(user),
    status: updated.payment_status,
    outcome: verification.outcome,
    explorerUrl: verification.explorerUrl,
    receivedUsd: verification.receivedUsd,
    receivedAmount: verification.receivedAmount,
    message: verification.message,
  });
});

app.get('/api/orders/:id/crypto/status', requireAuth, async (req: AuthedRequest, res) => {
  const orderId = Number(req.params.id);
  const order = db
    .prepare('SELECT * FROM orders WHERE id = ? AND user_id = ?')
    .get(orderId, req.currentUser!.id) as
    | {
        id: number;
        order_number: string;
        product_name: string;
        payment_status: string;
        amount_usd: number;
        crypto_currency: string | null;
        crypto_network: string | null;
        crypto_address: string | null;
        crypto_tx_hash: string | null;
        mpesa_result_desc: string | null;
      }
    | undefined;

  if (!order) {
    res.status(404).json({ error: 'Order not found.' });
    return;
  }

  if (order.payment_status === 'paid') {
    const user = db.prepare('SELECT * FROM users WHERE id = ?').get(req.currentUser!.id) as DbUser;
    res.json({
      status: 'paid',
      order,
      user: serializeUser(user),
      explorerUrl:
        order.crypto_tx_hash
          ? getExplorerTxUrl(
              order.crypto_currency === 'BTC' ? 'BTC' : 'USDT',
              order.crypto_network === 'ERC20'
                ? 'ERC20'
                : order.crypto_currency === 'BTC'
                ? 'BTC'
                : 'TRC20',
              order.crypto_tx_hash
            )
          : null,
      message: 'Payment confirmed and license unlocked.',
    });
    return;
  }

  if (!order.crypto_tx_hash) {
    res.json({
      status: order.payment_status,
      order,
      message: 'No transaction hash submitted yet.',
    });
    return;
  }

  const settings = getSettingsMap();
  const resolved = resolveCryptoNetworkAndAddress(order.crypto_currency, order.crypto_network, settings);
  const expectedAddr = order.crypto_address || resolved.address;

  const verification = await verifyOnChainCryptoPayment({
    currency: resolved.currency,
    network: resolved.network,
    txHash: order.crypto_tx_hash,
    expectedAddress: expectedAddr,
    expectedAmountUsd: Number(order.amount_usd || 5.25),
  });

  if (verification.outcome === 'confirmed') {
    db.prepare('UPDATE orders SET mpesa_result_desc = ? WHERE id = ?').run(verification.message, order.id);
    await fulfillOrder(order.id);
    logSecurityEvent(
      'CRYPTO_TX_VERIFIED_ONCHAIN',
      'info',
      getClientIp(req),
      req.currentUser!.email,
      `Order ${order.order_number} auto-unlocked on poll (${resolved.currency} ${resolved.network}) TX ${order.crypto_tx_hash}`
    );
    void sendAutomatedEmail({
      to: req.currentUser!.email,
      subject: `GRIDPIPs License Activated (${order.order_number})`,
      category: 'order_receipt',
      textPreview: `Your ${resolved.currency} (${resolved.network}) payment for ${order.product_name} has been confirmed on-chain (${order.crypto_tx_hash}).`,
      html: `<h2>Crypto Payment Confirmed</h2>
        <p>Order: <strong>${order.order_number}</strong></p>
        <p>Product: <strong>${order.product_name}</strong></p>
        <p>Method: <strong>${resolved.currency} (${resolved.network})</strong></p>
        <p>TX Hash: <strong>${order.crypto_tx_hash}</strong></p>
        <p>Amount Settled: <strong>$${Number(order.amount_usd).toFixed(2)} USD</strong></p>`,
    });
  } else {
    db.prepare('UPDATE orders SET mpesa_result_desc = ? WHERE id = ?').run(verification.message, order.id);
    void upsertCloudOrder(order.id);
  }

  const updated = db.prepare('SELECT * FROM orders WHERE id = ?').get(order.id) as {
    payment_status: string;
  };
  const user = db.prepare('SELECT * FROM users WHERE id = ?').get(req.currentUser!.id) as DbUser;

  res.json({
    status: updated.payment_status,
    outcome: verification.outcome,
    order: updated,
    user: serializeUser(user),
    explorerUrl: verification.explorerUrl,
    receivedUsd: verification.receivedUsd,
    receivedAmount: verification.receivedAmount,
    message: verification.message,
  });
});

// ---------------- ICT Strategy Market Analyzer ($5.25 Gated) ----------------
app.get('/api/analyzer/scan', requireAuth, async (req: AuthedRequest, res) => {
  try {
    const user = req.currentUser!;
    if (!hasActiveAnalyzerAccess(user)) {
      res.status(402).json({
        error: 'An active ICT Strategy Market Analyzer subscription is required. Subscribe or renew in Subscriptions & Billing.',
      });
      return;
    }
    const symbol = sanitizeText(req.query.symbol || 'EURUSD', 12).toUpperCase();
    const timeframe = normalizeServerTimeframe(sanitizeText(req.query.timeframe || '1M', 8));
    const settings = getSettingsMap();
    const analysis = await runIctMarketAnalysis(symbol, timeframe, settings.ict_youtube_channel_id);
    res.json({ analysis });
  } catch (err) {
    console.error('Analyzer scan error:', err);
    res.status(500).json({ error: err instanceof Error ? err.message : 'Unable to complete ICT market scan.' });
  }
});

// ---------------- DRT Strategy Market Analyzer (Ali Khan Dealing Range Theory) ----------------
app.get('/api/drt/scan', requireAuth, async (req: AuthedRequest, res) => {
  try {
    const user = req.currentUser!;
    if (!hasActiveDrtAccess(user)) {
      res.status(402).json({
        error: 'An active DRT Strategy Market Analyzer subscription is required. Subscribe or renew in Subscriptions & Billing.',
      });
      return;
    }
    const symbol = sanitizeText(req.query.symbol || 'EURUSD', 12).toUpperCase();
    const timeframe = normalizeServerTimeframe(sanitizeText(req.query.timeframe || '15M', 8));
    const settings = getSettingsMap();
    const analysis = await runDrtMarketAnalysis(
      symbol,
      timeframe,
      settings.drt_youtube_channel_url || 'https://youtube.com/@ali_khan_ict?si=mqOSzAkgagFGdb80'
    );
    res.json({ analysis });
  } catch (err) {
    console.error('DRT Analyzer scan error:', err);
    res.status(500).json({ error: err instanceof Error ? err.message : 'Unable to complete DRT market scan.' });
  }
});

// ---------------- Live TradingView Quotes & Forex Factory Feed ----------------
app.get('/api/market/quotes', async (_req, res) => {
  try {
    const quotes = await getTradingViewLiveQuotes();
    const marketStatus = summarizeTradingViewMarketStatus(quotes);
    res.json({
      source: 'tradingview.com',
      updatedAt: new Date().toISOString(),
      marketStatus,
      quotes: quotes.map((q) => ({
        sym: q.symbol,
        tvSymbol: q.tvSymbol,
        name: q.name,
        price: q.price,
        chgPct: q.chgPct,
        bid: q.bid,
        ask: q.ask,
        digits: q.digits,
        assetClass: q.assetClass,
        currentSession: q.currentSession,
        isMarketOpen: q.isMarketOpen,
        marketStatusLabel: q.marketStatusLabel,
        lastTickIso: q.lastTickIso,
        sessionSchedule: q.sessionSchedule,
        exchangeTimezone: q.exchangeTimezone,
      })),
    });
  } catch (err) {
    console.error('TradingView live quotes error:', err);
    res.status(502).json({
      error: err instanceof Error ? err.message : 'Unable to fetch live TradingView market quotes.',
    });
  }
});

app.get('/api/market/mini-candles', async (req, res) => {
  try {
    const symbol = sanitizeText(req.query.symbol || 'XAUUSD', 16).toUpperCase() || 'XAUUSD';
    const tf = sanitizeText(req.query.tf || '1D', 8).toUpperCase();
    const intervalMap: Record<string, TvInterval> = {
      '1D': '15',
      '1W': '60',
      '1M': '240',
      '3M': 'D',
      '1Y': 'W',
    };
    const interval: TvInterval = intervalMap[tf] || '15';
    const payload = await fetchTradingViewChartData(symbol, interval);
    res.json({
      source: 'tradingview.com',
      symbol: payload.symbol,
      tvSymbol: payload.tvSymbol,
      tf,
      interval: payload.interval,
      digits: payload.digits,
      currentPrice: payload.currentPrice,
      chgPct: payload.chgPct,
      bars: payload.bars.slice(-12),
      fetchedAt: payload.fetchedAt,
    });
  } catch (err) {
    console.error('TradingView mini candles error:', err);
    res.status(502).json({
      error: err instanceof Error ? err.message : 'Unable to fetch live TradingView OHLC bars.',
    });
  }
});

app.get('/api/market/forexfactory', async (req, res) => {
  try {
    const forceRefresh = req.query.refresh === '1' || req.query.refresh === 'true';
    const feed = await getForexFactoryLiveFeed(forceRefresh);
    res.json(feed);
  } catch (err) {
    console.error('Forex Factory live feed error:', err);
    res.status(502).json({
      error: err instanceof Error ? err.message : 'Unable to fetch live Forex Factory calendar and news.',
    });
  }
});

// ---------------- MQL5 EA Bots & MT5 Bridge ($5.25 Gated) ----------------
function ensureUserBridgeToken(user: DbUser): string {
  if (user.mt5_bridge_token && user.mt5_bridge_token.length >= 12) {
    return user.mt5_bridge_token;
  }
  const freshToken = generateSecureToken(16);
  db.prepare('UPDATE users SET mt5_bridge_token = ? WHERE id = ?').run(freshToken, user.id);
  user.mt5_bridge_token = freshToken;
  return freshToken;
}

function resolvePublicAppOrigin(req: Request): string {
  const host = req.get('host');
  if (host) {
    const proto = req.headers['x-forwarded-proto'] === 'https' || req.secure ? 'https' : req.protocol;
    return `${proto}://${host}`.replace(/\/+$/, '');
  }
  return (process.env.APP_URL || 'https://www.gridpips.com').replace(/\/+$/, '');
}

app.get('/api/ea/source/:bot', requireAuth, (req: AuthedRequest, res) => {
  const user = req.currentUser!;
  if (!hasActiveEaBotsAccess(user)) {
    res.status(402).json({
      error: 'An active MQL5 EA Bots subscription is required. Subscribe or renew in Subscriptions & Billing.',
    });
    return;
  }
  const bot = req.params.bot;
  const appUrl = resolvePublicAppOrigin(req);
  const bridgeToken = ensureUserBridgeToken(user);
  const bridgeEndpoint = `${appUrl}/api/ea/mt5/heartbeat`;

  if (bot === 'silverbullet') {
    res.json({
      filename: 'GRIDPIPs_ICT_SilverBullet_EA.mq5',
      content: buildSilverBulletEa(bridgeEndpoint, bridgeToken),
      bridgeToken,
      bridgeEndpoint,
    });
  } else if (bot === 'orderblock') {
    res.json({
      filename: 'GRIDPIPs_SMC_OrderBlock_EA.mq5',
      content: buildSmcOrderBlockEa(bridgeEndpoint, bridgeToken),
      bridgeToken,
      bridgeEndpoint,
    });
  } else {
    res.json({
      filename: 'INSTALLATION_GUIDE.txt',
      content: buildInstallationGuide(user.name, bridgeToken, appUrl),
      bridgeToken,
      bridgeEndpoint,
    });
  }
});

app.get('/api/ea/download', requireAuth, async (req: AuthedRequest, res) => {
  const user = req.currentUser!;
  if (!hasActiveEaBotsAccess(user)) {
    res.status(402).json({
      error: 'An active MQL5 EA Bots subscription is required to download source files.',
    });
    return;
  }

  const appUrl = resolvePublicAppOrigin(req);
  const bridgeToken = ensureUserBridgeToken(user);
  const bridgeEndpoint = `${appUrl}/api/ea/mt5/heartbeat`;
  const zip = new JSZip();
  zip.file('GRIDPIPs_ICT_SilverBullet_EA.mq5', buildSilverBulletEa(bridgeEndpoint, bridgeToken));
  zip.file('GRIDPIPs_SMC_OrderBlock_EA.mq5', buildSmcOrderBlockEa(bridgeEndpoint, bridgeToken));
  zip.file('INSTALLATION_GUIDE.txt', buildInstallationGuide(user.name, bridgeToken, appUrl));

  const buffer = await zip.generateAsync({ type: 'nodebuffer' });
  res.setHeader('Content-Type', 'application/zip');
  res.setHeader('Content-Disposition', 'attachment; filename="GRIDPIPs_MQL5_EA_Bots_Pack.zip"');
  res.send(buffer);
});

app.get('/api/ea/mt5/status', requireAuth, (req: AuthedRequest, res) => {
  const user = req.currentUser!;
  if (!hasActiveEaBotsAccess(user)) {
    res.status(402).json({ error: 'Active MQL5 EA Bots subscription required.' });
    return;
  }
  ensureUserBridgeToken(user);
  const refreshed = db.prepare('SELECT * FROM users WHERE id = ?').get(user.id) as DbUser;
  const events = db
    .prepare(
      'SELECT id, ea_name, symbol, status, balance, equity, open_positions, created_at FROM mt5_telemetry_events WHERE user_id = ? ORDER BY id DESC LIMIT 10'
    )
    .all(user.id);
  const commands = db
    .prepare(
      'SELECT id, symbol, side, volume, stop_loss, take_profit, source_ea, execution_mode, status, external_order_id, error_message, created_at, executed_at FROM mt5_trade_commands WHERE user_id = ? ORDER BY id DESC LIMIT 12'
    )
    .all(user.id);
  res.json({
    user: serializeUser(refreshed),
    events,
    commands,
    mt5ApiConfigured: isMt5ApiConfigured(),
    mt5ProvisioningProfileConfigured: isMetaApiProfileConfigured(),
  });
});

app.get('/api/ea/mt5/servers', requireAuth, async (_req: AuthedRequest, res) => {
  try {
    const servers = await fetchKnownExnessServersFromMetaApi();
    res.json({ servers });
  } catch {
    res.json({ servers: [] });
  }
});

app.post('/api/ea/mt5/connect', requireAuth, async (req: AuthedRequest, res) => {
  const user = req.currentUser!;
  if (!hasActiveEaBotsAccess(user)) {
    res.status(402).json({
      error: 'An active MQL5 EA Bots subscription is required to connect MT5.',
    });
    return;
  }

  if (!isMt5ApiConfigured()) {
    res.status(503).json({
      error:
        'MetaApi Cloud is not configured on the backend yet. Add METAAPI_TOKEN and METAAPI_PROVISIONING_PROFILE_ID to your server environment variables.',
    });
    return;
  }

  const mt5Login = sanitizeText(req.body?.mt5Login, 32);
  const mt5Server = sanitizeText(req.body?.mt5Server, 64);
  const mt5Password = typeof req.body?.mt5Password === 'string' ? req.body.mt5Password.trim() : '';
  const autoTrade = req.body?.autoTrade !== undefined ? Boolean(req.body.autoTrade) : true;
  const activeBotRaw = sanitizeText(req.body?.activeBot || 'both', 24).toLowerCase();
  const activeBot = ['silverbullet', 'orderblock', 'both'].includes(activeBotRaw) ? activeBotRaw : 'both';
  const riskNum = Number(req.body?.riskPercent);
  const riskPercent = Number.isFinite(riskNum) ? Math.min(5, Math.max(0.1, Number(riskNum.toFixed(2)))) : 1.0;

  if (!mt5Login || !mt5Server || !mt5Password) {
    res.status(400).json({
      error: 'Enter the numeric MT5 Login ID, exact Broker Server (e.g. Exness-MT5Real8), and MT5 Trading Password.',
    });
    return;
  }

  if (!/^\d{4,16}$/.test(mt5Login)) {
    res.status(400).json({
      error: 'MT5 Login ID must be the numeric account number from MT5 (e.g. 12345678), not an EXN-... Exness ID.',
    });
    return;
  }

  if (/^Exness([A-Z]{2})?-MT5(Real|Trial)$/i.test(mt5Server)) {
    res.status(400).json({
      error: `${mt5Server} is only the server prefix. Enter the exact numbered server shown in the client's MT5 terminal (e.g. Exness-MT5Real8 or ExnessKE-MT5Real4).`,
    });
    return;
  }

  const token = ensureUserBridgeToken(user);
  let metaApiAccountId = '';
  let metaApiRegion = '';
  let liveBalance: number | null = user.mt5_balance ?? null;
  let liveEquity: number | null = user.mt5_equity ?? null;
  let openPositions = user.mt5_open_positions ?? 0;
  let mt5Status = 'METAAPI_DEPLOYED';

  try {
    const provisioned = await provisionAndDeployMt5Account({
      login: mt5Login,
      password: mt5Password,
      server: mt5Server,
      name: `GRIDPIPs ${user.name} (${mt5Login})`,
    });
    metaApiAccountId = provisioned.accountId;
    metaApiRegion = provisioned.region;
    mt5Status = provisioned.connectionStatus === 'CONNECTED' ? 'METAAPI_CONNECTED' : 'METAAPI_DEPLOYED';

    const liveState = await fetchMt5AccountState({
      accountId: provisioned.accountId,
      region: provisioned.region,
      timeoutMs: 4500,
      skipRegionLookup: true,
    }).catch(() => null);

    if (liveState) {
      liveBalance = liveState.balance;
      liveEquity = liveState.equity;
      openPositions = liveState.openPositions;
      metaApiRegion = liveState.region || metaApiRegion;
      mt5Status = 'METAAPI_LIVE_SYNCED';
    }
  } catch (err) {
    res.status(502).json({
      error:
        err instanceof Error
          ? err.message
          : 'MetaApi Cloud could not provision or connect with the supplied MT5 login, password, and broker server.',
    });
    return;
  }

  const connectionNote = `Client MT5 account ${mt5Login} (${mt5Server}) connected via MetaApi Cloud (${mt5Status}).`;

  db.prepare(
    `UPDATE users SET
      mt5_login = ?,
      mt5_server = ?,
      mt5_bridge_token = ?,
      mt5_connected = 1,
      mt5_status = ?,
      mt5_metaapi_account_id = ?,
      mt5_metaapi_region = ?,
      mt5_connection_mode = 'metaapi',
      mt5_auto_trade = ?,
      mt5_active_bot = ?,
      mt5_risk_percent = ?,
      mt5_balance = COALESCE(?, mt5_balance),
      mt5_equity = COALESCE(?, mt5_equity),
      mt5_open_positions = ?,
      mt5_last_sync = datetime('now')
     WHERE id = ?`
  ).run(
    mt5Login,
    mt5Server,
    token,
    mt5Status,
    metaApiAccountId,
    metaApiRegion,
    autoTrade ? 1 : 0,
    activeBot,
    riskPercent,
    liveBalance,
    liveEquity,
    openPositions,
    user.id
  );

  db.prepare(
    'INSERT INTO mt5_telemetry_events (user_id, ea_name, symbol, status, balance, equity, open_positions) VALUES (?, ?, ?, ?, ?, ?, ?)'
  ).run(
    user.id,
    'MetaApi Cloud MT5',
    'MULTI',
    mt5Status,
    liveBalance ?? 0,
    liveEquity ?? 0,
    openPositions
  );

  await sendAutomatedEmail({
    to: user.email,
    subject: 'GRIDPIPs MT5 Account Connected via MetaApi Cloud',
    category: 'mt5_bridge',
    textPreview: connectionNote,
    html: `<p>${connectionNote}</p>`,
  });

  const updated = db.prepare('SELECT * FROM users WHERE id = ?').get(user.id) as DbUser;
  void syncUserStateToCloud(user.id);
  res.json({
    user: serializeUser(updated),
    connectionMode: 'metaapi',
    bridgeToken: updated.mt5_bridge_token,
    message: connectionNote,
  });
});

app.post('/api/ea/mt5/rotate-token', requireAuth, (req: AuthedRequest, res) => {
  const user = req.currentUser!;
  if (!hasActiveEaBotsAccess(user)) {
    res.status(402).json({ error: 'Active MQL5 EA Bots subscription required.' });
    return;
  }
  const freshToken = generateSecureToken(16);
  db.prepare('UPDATE users SET mt5_bridge_token = ? WHERE id = ?').run(freshToken, user.id);
  const updated = db.prepare('SELECT * FROM users WHERE id = ?').get(user.id) as DbUser;
  res.json({
    user: serializeUser(updated),
    bridgeToken: freshToken,
    message: 'Generated a fresh EA token.',
  });
});

app.post('/api/ea/mt5/auto-trade', requireAuth, (req: AuthedRequest, res) => {
  const user = req.currentUser!;
  if (!hasActiveEaBotsAccess(user)) {
    res.status(402).json({ error: 'Active MQL5 EA Bots subscription required.' });
    return;
  }
  const enabled = req.body?.enabled !== undefined ? Boolean(req.body.enabled) : !Boolean(user.mt5_auto_trade);
  const activeBotRaw = sanitizeText(req.body?.activeBot || user.mt5_active_bot || 'both', 24).toLowerCase();
  const activeBot = ['silverbullet', 'orderblock', 'both'].includes(activeBotRaw) ? activeBotRaw : 'both';
  const riskNum = Number(req.body?.riskPercent ?? user.mt5_risk_percent ?? 1.0);
  const riskPercent = Number.isFinite(riskNum) ? Math.min(5, Math.max(0.1, Number(riskNum.toFixed(2)))) : 1.0;

  db.prepare(
    `UPDATE users SET
      mt5_auto_trade = ?,
      mt5_active_bot = ?,
      mt5_risk_percent = ?,
      mt5_status = CASE WHEN mt5_connected = 1 THEN ? ELSE mt5_status END
     WHERE id = ?`
  ).run(
    enabled ? 1 : 0,
    activeBot,
    riskPercent,
    enabled ? 'METAAPI_AUTO_TRADING_ACTIVE' : 'METAAPI_AUTO_TRADING_PAUSED',
    user.id
  );

  db.prepare(
    'INSERT INTO mt5_telemetry_events (user_id, ea_name, symbol, status, balance, equity, open_positions) VALUES (?, ?, ?, ?, ?, ?, ?)'
  ).run(
    user.id,
    activeBot === 'silverbullet'
      ? 'ICT Silver Bullet EA'
      : activeBot === 'orderblock'
      ? 'SMC Order Block EA'
      : 'Both ICT & SMC EAs',
    user.mt5_symbol || 'MULTI',
    enabled ? 'AUTO_TRADE_ON' : 'AUTO_TRADE_PAUSED',
    user.mt5_balance ?? 0,
    user.mt5_equity ?? 0,
    user.mt5_open_positions ?? 0
  );

  const updated = db.prepare('SELECT * FROM users WHERE id = ?').get(user.id) as DbUser;
  void syncUserStateToCloud(user.id);
  res.json({ user: serializeUser(updated) });
});

app.post('/api/ea/mt5/sync', requireAuth, async (req: AuthedRequest, res) => {
  const user = req.currentUser!;
  if (!hasActiveEaBotsAccess(user)) {
    res.status(402).json({ error: 'Active MQL5 EA Bots subscription required.' });
    return;
  }

  if (user.mt5_metaapi_account_id && isMt5ApiConfigured()) {
    try {
      const liveState = await fetchMt5AccountState({
        accountId: user.mt5_metaapi_account_id,
        region: user.mt5_metaapi_region,
      });
      db.prepare(
        `UPDATE users SET
          mt5_connected = 1,
          mt5_connection_mode = 'metaapi',
          mt5_metaapi_region = COALESCE(NULLIF(?, ''), mt5_metaapi_region),
          mt5_balance = COALESCE(?, mt5_balance),
          mt5_equity = COALESCE(?, mt5_equity),
          mt5_open_positions = ?,
          mt5_server = COALESCE(NULLIF(?, ''), mt5_server),
          mt5_status = 'METAAPI_LIVE_SYNCED',
          mt5_last_sync = datetime('now')
         WHERE id = ?`
      ).run(
        liveState.region,
        liveState.balance,
        liveState.equity,
        liveState.openPositions,
        liveState.server || '',
        user.id
      );

      db.prepare(
        'INSERT INTO mt5_telemetry_events (user_id, ea_name, symbol, status, balance, equity, open_positions) VALUES (?, ?, ?, ?, ?, ?, ?)'
      ).run(
        user.id,
        'MetaApi Cloud Sync',
        'MULTI',
        'METAAPI_LIVE_SYNCED',
        liveState.balance ?? 0,
        liveState.equity ?? 0,
        liveState.openPositions
      );
      void syncUserStateToCloud(user.id);
    } catch (err) {
      res.status(502).json({
        error: err instanceof Error ? err.message : 'Unable to sync live MT5 account via MetaApi Cloud.',
      });
      return;
    }
  }

  const updated = db.prepare('SELECT * FROM users WHERE id = ?').get(user.id) as DbUser;
  const events = db
    .prepare(
      'SELECT id, ea_name, symbol, status, balance, equity, open_positions, created_at FROM mt5_telemetry_events WHERE user_id = ? ORDER BY id DESC LIMIT 10'
    )
    .all(user.id);
  const commands = db
    .prepare(
      'SELECT id, symbol, side, volume, stop_loss, take_profit, source_ea, execution_mode, status, external_order_id, error_message, created_at, executed_at FROM mt5_trade_commands WHERE user_id = ? ORDER BY id DESC LIMIT 12'
    )
    .all(user.id);

  res.json({ user: serializeUser(updated), events, commands });
});

app.post('/api/ea/mt5/execute', requireAuth, async (req: AuthedRequest, res) => {
  const user = req.currentUser!;
  if (!hasActiveEaBotsAccess(user)) {
    res.status(402).json({ error: 'Active MQL5 EA Bots subscription required.' });
    return;
  }
  if (!isMt5ApiConfigured()) {
    res.status(503).json({
      error:
        'MetaApi Cloud is not configured on the backend yet. Add METAAPI_TOKEN and METAAPI_PROVISIONING_PROFILE_ID to your server environment variables.',
    });
    return;
  }
  if (!user.mt5_connected || !user.mt5_metaapi_account_id) {
    res.status(400).json({ error: 'Connect a client MT5 account via MetaApi Cloud first before executing orders.' });
    return;
  }
  if (!user.mt5_auto_trade) {
    res.status(400).json({ error: 'Auto-Trading is currently paused. Turn Auto-Trading ON to execute orders.' });
    return;
  }

  const symbol = sanitizeText(req.body?.symbol || 'EURUSD', 20).toUpperCase().replace(/[^A-Z0-9._-]/g, '');
  const sideRaw = sanitizeText(req.body?.side || 'BUY', 10).toUpperCase();
  const side: 'BUY' | 'SELL' = sideRaw.includes('SELL') || sideRaw.includes('SHORT') ? 'SELL' : 'BUY';
  const rawVol = Number(req.body?.volume);
  const volume = Number.isFinite(rawVol) && rawVol >= 0.01 ? Math.min(50, Number(rawVol.toFixed(2))) : 0.01;
  const stopLoss = Number.isFinite(Number(req.body?.stopLoss)) && Number(req.body?.stopLoss) > 0 ? Number(req.body.stopLoss) : null;
  const takeProfit = Number.isFinite(Number(req.body?.takeProfit)) && Number(req.body?.takeProfit) > 0 ? Number(req.body.takeProfit) : null;
  const sourceEa = sanitizeText(req.body?.sourceEa || 'GRIDPIPs Auto-Trade EA', 60);

  try {
    const execRes = await executeMt5TradeOrder({
      accountId: user.mt5_metaapi_account_id,
      region: user.mt5_metaapi_region,
      symbol,
      side,
      volume,
      stopLoss,
      takeProfit,
      comment: sourceEa,
    });

    const info = db
      .prepare(
        `INSERT INTO mt5_trade_commands (user_id, symbol, side, volume, stop_loss, take_profit, source_ea, execution_mode, status, external_order_id, executed_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, 'metaapi', 'executed', ?, datetime('now'))`
      )
      .run(user.id, symbol, side, volume, stopLoss, takeProfit, sourceEa, execRes.orderId);

    db.prepare(
      "UPDATE users SET mt5_open_positions = COALESCE(mt5_open_positions, 0) + 1, mt5_last_sync = datetime('now') WHERE id = ?"
    ).run(user.id);

    db.prepare(
      'INSERT INTO mt5_telemetry_events (user_id, ea_name, symbol, status, balance, equity, open_positions) VALUES (?, ?, ?, ?, ?, ?, ?)'
    ).run(
      user.id,
      sourceEa,
      symbol,
      `${side}_EXECUTED_METAAPI`,
      user.mt5_balance ?? 0,
      user.mt5_equity ?? 0,
      (user.mt5_open_positions ?? 0) + 1
    );

    void insertCloudMt5Command(user.email, Number(info.lastInsertRowid));
    void syncUserStateToCloud(user.id);

    res.json({
      ok: true,
      mode: 'metaapi',
      commandId: Number(info.lastInsertRowid),
      orderId: execRes.orderId,
      message: `${side} ${volume} ${symbol} executed on client MT5 ${user.mt5_login || ''} via MetaApi Cloud (Order #${execRes.orderId}).`,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'MetaApi Cloud trade execution failed.';
    const failInfo = db.prepare(
      `INSERT INTO mt5_trade_commands (user_id, symbol, side, volume, stop_loss, take_profit, source_ea, execution_mode, status, error_message)
       VALUES (?, ?, ?, ?, ?, ?, ?, 'metaapi', 'failed', ?)`
    ).run(user.id, symbol, side, volume, stopLoss, takeProfit, sourceEa, msg);
    void insertCloudMt5Command(user.email, Number(failInfo.lastInsertRowid));
    res.status(502).json({ error: msg });
  }
});

app.post('/api/ea/mt5/close-all', requireAuth, async (req: AuthedRequest, res) => {
  const user = req.currentUser!;
  if (!hasActiveEaBotsAccess(user)) {
    res.status(402).json({ error: 'Active MQL5 EA Bots subscription required.' });
    return;
  }
  if (!isMt5ApiConfigured() || !user.mt5_metaapi_account_id) {
    res.status(400).json({
      error: 'Connect a client MT5 account via MetaApi Cloud first.',
    });
    return;
  }

  try {
    const result = await closeAllMt5Positions({
      accountId: user.mt5_metaapi_account_id,
      region: user.mt5_metaapi_region,
    });
    db.prepare("UPDATE users SET mt5_open_positions = 0, mt5_last_sync = datetime('now') WHERE id = ?").run(user.id);
    db.prepare(
      'INSERT INTO mt5_telemetry_events (user_id, ea_name, symbol, status, balance, equity, open_positions) VALUES (?, ?, ?, ?, ?, ?, ?)'
    ).run(
      user.id,
      'MetaApi Cloud MT5',
      'ALL',
      `CLOSED_${result.closedCount}_POSITIONS`,
      user.mt5_balance ?? 0,
      user.mt5_equity ?? 0,
      0
    );
    void syncUserStateToCloud(user.id);
    res.json({
      ok: true,
      closedCount: result.closedCount,
      message: `Closed ${result.closedCount} open MT5 position(s) via MetaApi Cloud.`,
    });
  } catch (err) {
    res.status(502).json({
      error: err instanceof Error ? err.message : 'Unable to close open MT5 positions via MetaApi Cloud.',
    });
  }
});

app.post('/api/ea/mt5/run-auto-scan', requireAuth, async (req: AuthedRequest, res) => {
  const user = req.currentUser!;
  if (!hasActiveEaBotsAccess(user)) {
    res.status(402).json({ error: 'Active MQL5 EA Bots subscription required.' });
    return;
  }
  try {
    const dryRun = Boolean(req.body?.dryRun);
    const bypassKillzone = Boolean(req.body?.bypassKillzone);
    const result = await runCloudAutoTradePass({
      userId: user.id,
      dryRun,
      bypassKillzone,
    });
    res.json(result);
  } catch (err) {
    res.status(500).json({
      error: err instanceof Error ? err.message : 'Cloud Auto-Trade engine scan failed.',
    });
  }
});

app.all('/api/ea/cron-tick', async (req, res) => {
  const cronSecret = process.env.CRON_SECRET;
  if (cronSecret) {
    const bearer = extractBearerToken(req);
    if (bearer !== cronSecret) {
      res.status(401).json({ error: 'Unauthorized cron trigger.' });
      return;
    }
  }
  try {
    const result = await runCloudAutoTradePass();
    res.json({ ok: true, ...result });
  } catch (err) {
    res.status(500).json({
      error: err instanceof Error ? err.message : 'Scheduled Cloud Auto-Trade pass failed.',
    });
  }
});

app.post('/api/ea/mt5/heartbeat', (req, res) => {
  const token = sanitizeText(req.body?.token, 64);
  const login = sanitizeText(req.body?.login, 32);
  const server = sanitizeText(req.body?.server, 64);
  const symbol = sanitizeText(req.body?.symbol || 'EURUSD', 20).toUpperCase();
  const eaName = sanitizeText(req.body?.eaName || 'GRIDPIPs MQL5 EA', 60);
  const status = sanitizeText(req.body?.status || 'ACTIVE', 32).toUpperCase();
  const balance = Number.isFinite(Number(req.body?.balance)) ? Number(req.body?.balance) : null;
  const equity = Number.isFinite(Number(req.body?.equity)) ? Number(req.body?.equity) : null;
  const openPositions = Number.isFinite(Number(req.body?.openPositions)) ? Math.max(0, Math.trunc(Number(req.body?.openPositions))) : 0;
  const executedCmdId = Number.isFinite(Number(req.body?.executedCmdId)) ? Math.trunc(Number(req.body?.executedCmdId)) : 0;

  if (!token) {
    res.status(401).json({ error: 'Missing bridge token' });
    return;
  }
  const user = db
    .prepare('SELECT id, mt5_auto_trade FROM users WHERE mt5_bridge_token = ?')
    .get(token) as { id: number; mt5_auto_trade?: number } | undefined;
  if (!user) {
    res.status(403).json({ error: 'Invalid bridge token' });
    return;
  }

  if (executedCmdId > 0) {
    const ackStatus = status.includes('FAIL') ? 'failed' : 'executed';
    db.prepare(
      "UPDATE mt5_trade_commands SET status = ?, executed_at = datetime('now') WHERE id = ? AND user_id = ?"
    ).run(ackStatus, executedCmdId, user.id);
  }

  db.prepare(
    `UPDATE users SET
      mt5_connected = 1,
      mt5_login = COALESCE(NULLIF(?, ''), mt5_login),
      mt5_server = COALESCE(NULLIF(?, ''), mt5_server),
      mt5_symbol = COALESCE(NULLIF(?, ''), mt5_symbol),
      mt5_ea_name = COALESCE(NULLIF(?, ''), mt5_ea_name),
      mt5_status = COALESCE(NULLIF(?, ''), mt5_status),
      mt5_balance = COALESCE(?, mt5_balance),
      mt5_equity = COALESCE(?, mt5_equity),
      mt5_open_positions = ?,
      mt5_last_sync = datetime('now')
     WHERE id = ?`
  ).run(login, server, symbol, eaName, status, balance, equity, openPositions, user.id);

  db.prepare(
    'INSERT INTO mt5_telemetry_events (user_id, ea_name, symbol, status, balance, equity, open_positions) VALUES (?, ?, ?, ?, ?, ?, ?)'
  ).run(user.id, eaName, symbol, status, balance ?? 0, equity ?? 0, openPositions);

  const autoTradeEnabled = Boolean(user.mt5_auto_trade);
  let nextCmd: {
    id: number;
    symbol: string;
    side: string;
    volume: number;
    stop_loss: number | null;
    take_profit: number | null;
  } | undefined;

  if (autoTradeEnabled) {
    nextCmd = db
      .prepare(
        "SELECT id, symbol, side, volume, stop_loss, take_profit FROM mt5_trade_commands WHERE user_id = ? AND status = 'queued' ORDER BY id ASC LIMIT 1"
      )
      .get(user.id) as typeof nextCmd;
    if (nextCmd) {
      db.prepare("UPDATE mt5_trade_commands SET status = 'dispatched' WHERE id = ?").run(nextCmd.id);
    }
  }

  res.json({
    ok: true,
    syncedAt: new Date().toISOString(),
    status,
    autoTradeEnabled,
    cmdId: nextCmd ? nextCmd.id : 0,
    cmdSymbol: nextCmd ? nextCmd.symbol : '',
    cmdSide: nextCmd ? nextCmd.side : '',
    cmdVol: nextCmd ? nextCmd.volume : 0,
    cmdSl: nextCmd?.stop_loss ?? 0,
    cmdTp: nextCmd?.take_profit ?? 0,
  });
});

// ---------------- Free Workspace Tools (Journal, Paper, Plan, Watchlist) ----------------
app.get('/api/workspace/journal', requireAuth, (req: AuthedRequest, res) => {
  const trades = db
    .prepare('SELECT * FROM journal_trades WHERE user_id = ? ORDER BY id DESC')
    .all(req.currentUser!.id);
  res.json({ trades });
});

app.post('/api/workspace/journal', requireAuth, (req: AuthedRequest, res) => {
  const b = req.body || {};
  const instrument = sanitizeText(b.instrument, 20).toUpperCase();
  const side = b.side === 'Sell' ? 'Sell' : 'Buy';
  const pnl = Number(b.pnl);
  if (!instrument || Number.isNaN(pnl)) {
    res.status(400).json({ error: 'Instrument and valid P&L are required.' });
    return;
  }
  const info = db
    .prepare(
      `INSERT INTO journal_trades (user_id, instrument, side, entry_price, sl, tp, size, risk_pct, rr, pnl, trade_date, session, strategy, reason_entry, reason_exit, lessons, image_data)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    )
    .run(
      req.currentUser!.id,
      instrument,
      side,
      b.entryPrice ? Number(b.entryPrice) : null,
      b.sl ? Number(b.sl) : null,
      b.tp ? Number(b.tp) : null,
      b.size ? Number(b.size) : null,
      b.riskPct ? Number(b.riskPct) : null,
      b.rr ? Number(b.rr) : null,
      pnl,
      sanitizeText(b.tradeDate || new Date().toISOString().slice(0, 10), 20),
      sanitizeText(b.session || 'New York', 30),
      sanitizeText(b.strategy || 'ICT FVG', 60),
      sanitizeText(b.reasonEntry || '', 400),
      sanitizeText(b.reasonExit || '', 400),
      sanitizeText(b.lessons || '', 400),
      typeof b.imageData === 'string' && b.imageData.startsWith('data:image/') ? b.imageData.slice(0, 1500000) : null
    );
  const trade = db.prepare('SELECT * FROM journal_trades WHERE id = ?').get(info.lastInsertRowid) as {
    id: number;
    instrument: string;
    side: string;
    entry_price: number | null;
    sl: number | null;
    tp: number | null;
    size: number | null;
    risk_pct: number | null;
    rr: number | null;
    pnl: number;
    trade_date: string;
    session: string | null;
    strategy: string | null;
    reason_entry: string | null;
    reason_exit: string | null;
    lessons: string | null;
    image_data: string | null;
  } | undefined;
  if (trade) {
    void insertCloudJournalTrade(req.currentUser!.email, trade);
  }
  res.status(201).json({ trade });
});

app.delete('/api/workspace/journal/:id', requireAuth, (req: AuthedRequest, res) => {
  const existing = db
    .prepare('SELECT id, instrument, trade_date FROM journal_trades WHERE id = ? AND user_id = ?')
    .get(Number(req.params.id), req.currentUser!.id) as
    | { id: number; instrument: string; trade_date: string }
    | undefined;
  db.prepare('DELETE FROM journal_trades WHERE id = ? AND user_id = ?').run(Number(req.params.id), req.currentUser!.id);
  if (existing) {
    void deleteCloudJournalTrade(req.currentUser!.email, existing);
  }
  res.json({ ok: true });
});

app.get('/api/workspace/paper', requireAuth, (req: AuthedRequest, res) => {
  let row = db.prepare('SELECT * FROM paper_accounts WHERE user_id = ?').get(req.currentUser!.id) as
    | { balance: number; positions_json: string; history_json: string }
    | undefined;
  if (!row) {
    db.prepare('INSERT INTO paper_accounts (user_id, balance) VALUES (?, 10000)').run(req.currentUser!.id);
    row = { balance: 10000, positions_json: '[]', history_json: '[]' };
  }
  res.json({
    balance: row.balance,
    positions: JSON.parse(row.positions_json),
    history: JSON.parse(row.history_json),
  });
});

app.post('/api/workspace/paper', requireAuth, (req: AuthedRequest, res) => {
  const balance = Number(req.body?.balance ?? 10000);
  const positions = Array.isArray(req.body?.positions) ? req.body.positions : [];
  const history = Array.isArray(req.body?.history) ? req.body.history : [];
  db.prepare(
    `INSERT INTO paper_accounts (user_id, balance, positions_json, history_json, updated_at)
     VALUES (?, ?, ?, ?, datetime('now'))
     ON CONFLICT(user_id) DO UPDATE SET balance = excluded.balance, positions_json = excluded.positions_json, history_json = excluded.history_json, updated_at = datetime('now')`
  ).run(req.currentUser!.id, balance, JSON.stringify(positions), JSON.stringify(history));
  void syncUserStateToCloud(req.currentUser!.id);
  res.json({ ok: true });
});

app.get('/api/workspace/plan', requireAuth, (req: AuthedRequest, res) => {
  const row = db.prepare('SELECT plan_json FROM trading_plans WHERE user_id = ?').get(req.currentUser!.id) as
    | { plan_json: string }
    | undefined;
  res.json({ plan: row ? JSON.parse(row.plan_json) : null });
});

app.post('/api/workspace/plan', requireAuth, (req: AuthedRequest, res) => {
  db.prepare(
    `INSERT INTO trading_plans (user_id, plan_json, updated_at) VALUES (?, ?, datetime('now'))
     ON CONFLICT(user_id) DO UPDATE SET plan_json = excluded.plan_json, updated_at = datetime('now')`
  ).run(req.currentUser!.id, JSON.stringify(req.body?.plan || {}));
  void syncUserStateToCloud(req.currentUser!.id);
  res.json({ ok: true });
});

app.get('/api/workspace/watchlist', requireAuth, (req: AuthedRequest, res) => {
  const row = db.prepare('SELECT symbols_json FROM watchlists WHERE user_id = ?').get(req.currentUser!.id) as
    | { symbols_json: string }
    | undefined;
  res.json({ symbols: row ? JSON.parse(row.symbols_json) : ['EURUSD', 'GBPUSD', 'XAUUSD', 'NAS100', 'BTCUSD'] });
});

app.post('/api/workspace/watchlist', requireAuth, (req: AuthedRequest, res) => {
  const symbols = Array.isArray(req.body?.symbols)
    ? req.body.symbols.map((s: unknown) => sanitizeText(s, 15).toUpperCase()).filter(Boolean)
    : [];
  db.prepare(
    `INSERT INTO watchlists (user_id, symbols_json, updated_at) VALUES (?, ?, datetime('now'))
     ON CONFLICT(user_id) DO UPDATE SET symbols_json = excluded.symbols_json, updated_at = datetime('now')`
  ).run(req.currentUser!.id, JSON.stringify(symbols));
  void syncUserStateToCloud(req.currentUser!.id);
  res.json({ symbols });
});

// ---------------- Influencer & Referral System ----------------
app.post('/api/referrals/track', async (req, res) => {
  const code = sanitizeText(req.body?.code, 30).toUpperCase();
  const sourcePage = sanitizeText(req.body?.sourcePage || '/', 60);
  if (code) {
    db.prepare('INSERT INTO referral_clicks (referral_code, source_page, ip_address) VALUES (?, ?, ?)').run(
      code,
      sourcePage,
      getClientIp(req)
    );
    await saveCloudReferralLedger().catch(() => {});
  }
  res.json({ ok: true });
});

app.get('/api/referrals/dashboard', requireAuth, async (req: AuthedRequest, res) => {
  await Promise.all([
    hydrateSiteSettingsFromCloud().catch(() => {}),
    syncAllCloudAdminDataToLocal().catch(() => {}),
  ]);
  const user =
    (db.prepare('SELECT * FROM users WHERE id = ?').get(req.currentUser!.id) as DbUser | undefined) ||
    req.currentUser!;

  const clicksRow = db
    .prepare('SELECT COUNT(*) as cnt FROM referral_clicks WHERE referral_code = ?')
    .get(user.referral_code) as { cnt: number };
  const signups = db
    .prepare(
      `SELECT
        u.id, u.name, u.email, u.exness_account_id, u.exness_verified,
        u.has_analyzer, u.has_ea_bots, u.created_at,
        COALESCE((SELECT COUNT(*) FROM orders o WHERE o.user_id = u.id AND o.payment_status = 'paid'), 0) as paid_orders_count,
        COALESCE((SELECT SUM(o.commission_usd) FROM orders o WHERE o.user_id = u.id AND o.referrer_id = ? AND o.payment_status = 'paid'), 0) as commission_earned_usd
       FROM users u
       WHERE u.referred_by = ?
       ORDER BY u.id DESC`
    )
    .all(user.id, user.id) as Array<{
    id: number;
    name: string;
    email: string;
    exness_account_id: string;
    exness_verified: number;
    has_analyzer: number;
    has_ea_bots: number;
    created_at: string;
    paid_orders_count: number;
    commission_earned_usd: number;
  }>;
  const commissionsRow = db
    .prepare(
      `SELECT
        COALESCE(SUM(commission_usd), 0) as total,
        COUNT(*) as paidConversions
       FROM orders
       WHERE referrer_id = ? AND payment_status = 'paid'`
    )
    .get(user.id) as { total: number; paidConversions: number };
  const payoutSumsRow = db
    .prepare(
      `SELECT
        COALESCE(SUM(CASE WHEN status = 'paid' THEN amount_usd ELSE 0 END), 0) as paidOutTotal,
        COALESCE(SUM(CASE WHEN status = 'pending' THEN amount_usd ELSE 0 END), 0) as pendingPayoutTotal,
        COALESCE(SUM(CASE WHEN status IN ('pending', 'paid') THEN amount_usd ELSE 0 END), 0) as committedTotal
       FROM payout_requests
       WHERE user_id = ?`
    )
    .get(user.id) as { paidOutTotal: number; pendingPayoutTotal: number; committedTotal: number };
  const payouts = db
    .prepare('SELECT * FROM payout_requests WHERE user_id = ? ORDER BY id DESC')
    .all(user.id);
  const settings = getSettingsMap();

  const globalPct = Number(settings.influencer_commission_pct || 35);
  const effectiveCommissionPct =
    typeof user.commission_pct === 'number' && Number.isFinite(user.commission_pct)
      ? user.commission_pct
      : globalPct;
  const totalEarned = Number(commissionsRow.total || 0);
  const paidOutTotal = Number(payoutSumsRow.paidOutTotal || 0);
  const pendingPayoutTotal = Number(payoutSumsRow.pendingPayoutTotal || 0);
  const availableBalance = Math.max(
    0,
    Number((totalEarned - Number(payoutSumsRow.committedTotal || 0)).toFixed(2))
  );

  res.json({
    referralCode: user.referral_code,
    role: user.role,
    commissionPct: effectiveCommissionPct,
    isCustomCommission: typeof user.commission_pct === 'number' && Number.isFinite(user.commission_pct),
    analyzerPriceUsd: Number(settings.analyzer_price_usd || 5.25),
    eaBotsPriceUsd: Number(settings.ea_bots_price_usd || 5.25),
    usdKesRate: Number(settings.usd_kes_rate || 130),
    clicks: clicksRow.cnt,
    paidConversions: Number(commissionsRow.paidConversions || 0),
    signups,
    totalEarned,
    paidOutTotal,
    pendingPayoutTotal,
    availableBalance,
    payouts,
  });
});

app.post('/api/referrals/payout', requireAuth, async (req: AuthedRequest, res) => {
  await syncAllCloudAdminDataToLocal().catch(() => {});
  const user = req.currentUser!;
  const method = req.body?.method === 'mpesa' ? 'mpesa' : 'crypto';
  const destination = sanitizeText(req.body?.destination, 120);
  const amountUsd = Number(req.body?.amountUsd || 0);

  if (!destination || !Number.isFinite(amountUsd) || amountUsd < 5) {
    res.status(400).json({ error: 'Minimum payout is $5.00 and a valid destination (M-Pesa Phone or USDT TRC20 Wallet) is required.' });
    return;
  }

  const commissionsRow = db
    .prepare("SELECT COALESCE(SUM(commission_usd), 0) as total FROM orders WHERE referrer_id = ? AND payment_status = 'paid'")
    .get(user.id) as { total: number };
  const paidOutRow = db
    .prepare("SELECT COALESCE(SUM(amount_usd), 0) as total FROM payout_requests WHERE user_id = ? AND status IN ('pending', 'paid')")
    .get(user.id) as { total: number };
  const available = Number(commissionsRow.total || 0) - Number(paidOutRow.total || 0);

  if (amountUsd > available + 0.001) {
    res.status(400).json({ error: `Insufficient commission balance. Available: $${Math.max(0, available).toFixed(2)}` });
    return;
  }

  db.prepare('INSERT INTO payout_requests (user_id, amount_usd, method, destination) VALUES (?, ?, ?, ?)').run(
    user.id,
    Number(amountUsd.toFixed(2)),
    method,
    destination
  );
  const cloudPersisted = await saveCloudReferralLedger().catch(() => false);

  await sendAutomatedEmail({
    to: user.email,
    subject: 'GRIDPIPs Influencer Payout Request Received',
    category: 'payout',
    textPreview: `Your payout request for $${amountUsd.toFixed(2)} via ${method.toUpperCase()} (${destination}) is queued for processing.`,
    html: `<p>Your payout request of <strong>$${amountUsd.toFixed(2)}</strong> via ${method.toUpperCase()} to <code>${destination}</code> has been submitted.</p>`,
  });

  res.status(201).json({ ok: true, cloudPersisted });
});

// ---------------- Admin Command Center ----------------
app.get('/api/admin/overview', requireAdmin, async (_req, res) => {
  await Promise.all([
    hydrateSiteSettingsFromCloud(true).catch(() => {}),
    syncAllCloudAdminDataToLocal().catch(() => {}),
  ]);
  const revenueRow = db
    .prepare("SELECT COALESCE(SUM(amount_usd), 0) as usd, COALESCE(SUM(amount_kes), 0) as kes, COUNT(*) as count FROM orders WHERE payment_status = 'paid'")
    .get() as { usd: number; kes: number; count: number };
  const usersCount = (db.prepare('SELECT COUNT(*) as cnt FROM users').get() as { cnt: number }).cnt;
  const users = db
    .prepare(
      `SELECT
        u.id, u.name, u.email, u.role, u.exness_account_id, u.exness_verified,
        u.referral_code, u.referred_by, u.commission_pct,
        u.has_analyzer, u.has_ea_bots, u.analyzer_expires_at, u.ea_bots_expires_at,
        u.mt5_connected, u.mt5_login,
        u.wallet_balance_kes, u.is_suspended, u.created_at, u.last_login_at,
        r.name as referrer_name, r.referral_code as referrer_code
       FROM users u
       LEFT JOIN users r ON u.referred_by = r.id
       ORDER BY u.id DESC LIMIT 500`
    )
    .all();
  const orders = db
    .prepare(
      `SELECT o.*, u.name as user_name, u.email as user_email
       FROM orders o JOIN users u ON o.user_id = u.id
       ORDER BY o.id DESC LIMIT 200`
    )
    .all();
  const mpesaTransactions = db
    .prepare(
      `SELECT m.*, u.name as user_name, u.email as user_email
       FROM mpesa_transactions m JOIN users u ON m.user_id = u.id
       ORDER BY m.id DESC LIMIT 200`
    )
    .all();
  const mpesaMetricsRow = db
    .prepare(
      `SELECT
        COALESCE(SUM(CASE WHEN status = 'completed' THEN amount_kes ELSE 0 END), 0) as totalDepositedKes,
        COALESCE(SUM(CASE WHEN status = 'completed' AND purpose = 'wallet_deposit' THEN amount_kes ELSE 0 END), 0) as walletDepositedKes,
        COALESCE(SUM(CASE WHEN status = 'completed' THEN 1 ELSE 0 END), 0) as completedCount,
        COALESCE(SUM(CASE WHEN status = 'pending' THEN 1 ELSE 0 END), 0) as pendingCount,
        COALESCE(SUM(CASE WHEN status IN ('failed', 'cancelled') THEN 1 ELSE 0 END), 0) as failedOrCancelledCount
       FROM mpesa_transactions`
    )
    .get() as {
    totalDepositedKes: number;
    walletDepositedKes: number;
    completedCount: number;
    pendingCount: number;
    failedOrCancelledCount: number;
  };
  const payouts = db
    .prepare(
      `SELECT p.*, u.name as user_name, u.email as user_email, u.referral_code as referral_code
       FROM payout_requests p JOIN users u ON p.user_id = u.id
       ORDER BY p.id DESC LIMIT 100`
    )
    .all();
  const securityLogs = db.prepare('SELECT * FROM security_logs ORDER BY id DESC LIMIT 80').all();
  const emailLogs = db.prepare('SELECT * FROM email_logs ORDER BY id DESC LIMIT 60').all();
  const settings = getSettingsMap();
  const defaultCommissionPct = Number(settings.influencer_commission_pct || 35);

  const rawInfluencers = db
    .prepare(
      `SELECT
        u.id, u.name, u.email, u.role, u.referral_code, u.exness_account_id,
        u.commission_pct, u.is_suspended, u.created_at, u.last_login_at,
        (SELECT COUNT(*) FROM referral_clicks rc WHERE rc.referral_code = u.referral_code) as clicks,
        (SELECT COUNT(*) FROM users ru WHERE ru.referred_by = u.id) as signups,
        (SELECT COUNT(*) FROM orders o WHERE o.referrer_id = u.id AND o.payment_status = 'paid') as paid_conversions,
        COALESCE((SELECT SUM(o.commission_usd) FROM orders o WHERE o.referrer_id = u.id AND o.payment_status = 'paid'), 0) as total_earned_usd,
        COALESCE((SELECT SUM(p.amount_usd) FROM payout_requests p WHERE p.user_id = u.id AND p.status = 'paid'), 0) as paid_out_usd,
        COALESCE((SELECT SUM(p.amount_usd) FROM payout_requests p WHERE p.user_id = u.id AND p.status = 'pending'), 0) as pending_payout_usd,
        (SELECT COUNT(*) FROM payout_requests p WHERE p.user_id = u.id) as payouts_count
       FROM users u
       ORDER BY
         CASE WHEN u.role = 'influencer' THEN 0 ELSE 1 END,
         total_earned_usd DESC,
         signups DESC,
         clicks DESC`
    )
    .all() as Array<{
    id: number;
    name: string;
    email: string;
    role: 'user' | 'influencer' | 'admin';
    referral_code: string;
    exness_account_id: string;
    commission_pct: number | null;
    is_suspended: number;
    created_at: string;
    last_login_at: string | null;
    clicks: number;
    signups: number;
    paid_conversions: number;
    total_earned_usd: number;
    paid_out_usd: number;
    pending_payout_usd: number;
    payouts_count: number;
  }>;

  const influencers = rawInfluencers
    .filter(
      (inf) =>
        inf.role === 'influencer' ||
        inf.clicks > 0 ||
        inf.signups > 0 ||
        inf.total_earned_usd > 0 ||
        inf.payouts_count > 0 ||
        inf.commission_pct !== null
    )
    .map((inf) => {
      const totalEarned = Number(inf.total_earned_usd || 0);
      const paidOut = Number(inf.paid_out_usd || 0);
      const pending = Number(inf.pending_payout_usd || 0);
      const available = Math.max(0, Number((totalEarned - paidOut - pending).toFixed(2)));
      return {
        ...inf,
        effective_commission_pct:
          typeof inf.commission_pct === 'number' && Number.isFinite(inf.commission_pct)
            ? inf.commission_pct
            : defaultCommissionPct,
        total_earned_usd: Number(totalEarned.toFixed(2)),
        paid_out_usd: Number(paidOut.toFixed(2)),
        pending_payout_usd: Number(pending.toFixed(2)),
        available_balance_usd: available,
      };
    });

  const influencerSummary = {
    totalInfluencers: influencers.filter((i) => i.role === 'influencer').length,
    activeReferrersCount: influencers.length,
    totalClicks: influencers.reduce((acc, i) => acc + Number(i.clicks || 0), 0),
    totalSignups: influencers.reduce((acc, i) => acc + Number(i.signups || 0), 0),
    totalPaidConversions: influencers.reduce((acc, i) => acc + Number(i.paid_conversions || 0), 0),
    totalCommissionsUsd: Number(
      influencers.reduce((acc, i) => acc + Number(i.total_earned_usd || 0), 0).toFixed(2)
    ),
    totalPaidOutUsd: Number(
      influencers.reduce((acc, i) => acc + Number(i.paid_out_usd || 0), 0).toFixed(2)
    ),
    pendingPayoutsUsd: Number(
      influencers.reduce((acc, i) => acc + Number(i.pending_payout_usd || 0), 0).toFixed(2)
    ),
  };
  const darajaStatus = getDarajaConfigStatus(settings);
  const rawEnv = cleanMpesaEnvVar('MPESA_ENV');
  const configuredCallbackUrl = cleanMpesaEnvVar('MPESA_CALLBACK_URL');
  const mismatchWarnings: string[] = [];
  if (darajaStatus.env === 'sandbox' && darajaStatus.shortCode && darajaStatus.shortCode !== '174379') {
    mismatchWarnings.push(
      `MPESA_ENV is currently "sandbox" while MPESA_SHORTCODE is "${darajaStatus.shortCode}". Safaricom sandbox rejects live store/till shortcodes — set MPESA_ENV=production with your Go-Live Consumer Key, Consumer Secret, and Passkey.`
    );
  }
  if (!configuredCallbackUrl) {
    mismatchWarnings.push(
      'MPESA_CALLBACK_URL is not explicitly set. Recommended value: https://www.gridpips.com/api/payments/mpesa/callback'
    );
  } else if (configuredCallbackUrl.includes('ais-dev-')) {
    mismatchWarnings.push(
      'MPESA_CALLBACK_URL currently points to an authenticated ais-dev preview URL (returns 302 login wall). Update it to https://www.gridpips.com/api/payments/mpesa/callback'
    );
  } else if (/^https?:\/\/gridpips\.com(\/|$)/i.test(configuredCallbackUrl)) {
    mismatchWarnings.push(
      'MPESA_CALLBACK_URL uses apex gridpips.com which returns HTTP 308 redirect to www.gridpips.com. Update MPESA_CALLBACK_URL to https://www.gridpips.com/api/payments/mpesa/callback so Safaricom callbacks hit HTTP 200 directly.'
    );
  }

  const userStats = db
    .prepare(
      `SELECT
        COUNT(*) as totalUsers,
        COALESCE(SUM(CASE WHEN last_login_at >= datetime('now', '-1 day') THEN 1 ELSE 0 END), 0) as active24hUsers,
        COALESCE(SUM(CASE WHEN last_login_at >= datetime('now', '-7 days') THEN 1 ELSE 0 END), 0) as active7dUsers,
        COALESCE(SUM(CASE WHEN exness_verified = 1 THEN 1 ELSE 0 END), 0) as exnessVerifiedUsers,
        COALESCE(SUM(CASE WHEN has_analyzer = 1 THEN 1 ELSE 0 END), 0) as analyzerHolders,
        COALESCE(SUM(CASE WHEN has_ea_bots = 1 THEN 1 ELSE 0 END), 0) as eaBotHolders,
        COALESCE(SUM(CASE WHEN mt5_connected = 1 THEN 1 ELSE 0 END), 0) as mt5ConnectedUsers,
        COALESCE(SUM(wallet_balance_kes), 0) as totalWalletLiabilityKes
       FROM users`
    )
    .get() as {
    totalUsers: number;
    active24hUsers: number;
    active7dUsers: number;
    exnessVerifiedUsers: number;
    analyzerHolders: number;
    eaBotHolders: number;
    mt5ConnectedUsers: number;
    totalWalletLiabilityKes: number;
  };

  const orderFunnel = db
    .prepare(
      `SELECT
        COUNT(*) as totalOrders,
        COALESCE(SUM(CASE WHEN payment_status = 'paid' THEN 1 ELSE 0 END), 0) as paidOrders,
        COALESCE(SUM(CASE WHEN payment_status IN ('pending', 'processing') THEN 1 ELSE 0 END), 0) as pendingOrders,
        COALESCE(SUM(CASE WHEN payment_status IN ('failed', 'refunded') THEN 1 ELSE 0 END), 0) as failedOrders
       FROM orders`
    )
    .get() as {
    totalOrders: number;
    paidOrders: number;
    pendingOrders: number;
    failedOrders: number;
  };

  const engagementRow = db
    .prepare(
      `SELECT
        (SELECT COUNT(*) FROM referral_clicks) as totalReferralClicks,
        (SELECT COUNT(*) FROM referral_clicks WHERE created_at >= datetime('now', '-7 days')) as clicks7d,
        (SELECT COUNT(*) FROM journal_trades) as journalTradesCount,
        (SELECT COUNT(*) FROM saved_setups) as savedSetupsCount,
        (SELECT COUNT(*) FROM strategy_playbooks) as playbooksCount,
        (SELECT COUNT(*) FROM mt5_trade_commands) as mt5CommandsCount,
        (SELECT COUNT(*) FROM email_logs) as emailsSentCount,
        (SELECT COUNT(*) FROM security_logs WHERE severity = 'critical' AND created_at >= datetime('now', '-1 day')) as criticalAlerts24h`
    )
    .get() as {
    totalReferralClicks: number;
    clicks7d: number;
    journalTradesCount: number;
    savedSetupsCount: number;
    playbooksCount: number;
    mt5CommandsCount: number;
    emailsSentCount: number;
    criticalAlerts24h: number;
  };

  const productBreakdown = db
    .prepare(
      `SELECT
        product_key as productKey,
        product_name as productName,
        COUNT(*) as totalAttempts,
        COALESCE(SUM(CASE WHEN payment_status = 'paid' THEN 1 ELSE 0 END), 0) as paidCount,
        COALESCE(SUM(CASE WHEN payment_status = 'paid' THEN amount_usd ELSE 0 END), 0) as revenueUsd,
        COALESCE(SUM(CASE WHEN payment_status = 'paid' THEN amount_kes ELSE 0 END), 0) as revenueKes
       FROM orders
       GROUP BY product_key, product_name
       ORDER BY revenueUsd DESC`
    )
    .all() as Array<{
    productKey: string;
    productName: string;
    totalAttempts: number;
    paidCount: number;
    revenueUsd: number;
    revenueKes: number;
  }>;

  const signupsByDay = db
    .prepare(
      `SELECT date(created_at) as day, COUNT(*) as count
       FROM users
       WHERE created_at >= date('now', '-6 days')
       GROUP BY date(created_at)`
    )
    .all() as Array<{ day: string; count: number }>;
  const ordersByDay = db
    .prepare(
      `SELECT
        date(created_at) as day,
        COUNT(*) as totalOrders,
        COALESCE(SUM(CASE WHEN payment_status = 'paid' THEN 1 ELSE 0 END), 0) as paidOrders,
        COALESCE(SUM(CASE WHEN payment_status = 'paid' THEN amount_usd ELSE 0 END), 0) as revenueUsd
       FROM orders
       WHERE created_at >= date('now', '-6 days')
       GROUP BY date(created_at)`
    )
    .all() as Array<{ day: string; totalOrders: number; paidOrders: number; revenueUsd: number }>;
  const mpesaByDay = db
    .prepare(
      `SELECT
        date(created_at) as day,
        COALESCE(SUM(CASE WHEN status = 'completed' THEN 1 ELSE 0 END), 0) as completedCount,
        COALESCE(SUM(CASE WHEN status = 'completed' THEN amount_kes ELSE 0 END), 0) as completedKes
       FROM mpesa_transactions
       WHERE created_at >= date('now', '-6 days')
       GROUP BY date(created_at)`
    )
    .all() as Array<{ day: string; completedCount: number; completedKes: number }>;

  const signupsMap = new Map(signupsByDay.map((r) => [r.day, Number(r.count || 0)]));
  const ordersMap = new Map(ordersByDay.map((r) => [r.day, r]));
  const mpesaMap = new Map(mpesaByDay.map((r) => [r.day, r]));

  const dailySeries = Array.from({ length: 7 }, (_, idx) => {
    const d = new Date(Date.now() - (6 - idx) * 86_400_000);
    const day = d.toISOString().slice(0, 10);
    const ord = ordersMap.get(day);
    const mp = mpesaMap.get(day);
    return {
      day,
      signups: signupsMap.get(day) ?? 0,
      paidOrders: Number(ord?.paidOrders || 0),
      totalOrders: Number(ord?.totalOrders || 0),
      revenueUsd: Number(ord?.revenueUsd || 0),
      mpesaCompletedCount: Number(mp?.completedCount || 0),
      mpesaCompletedKes: Number(mp?.completedKes || 0),
    };
  });

  const totalMpesaAttempts =
    Number(mpesaMetricsRow.completedCount || 0) +
    Number(mpesaMetricsRow.pendingCount || 0) +
    Number(mpesaMetricsRow.failedOrCancelledCount || 0);
  const orderConversionPct =
    orderFunnel.totalOrders > 0 ? Math.round((orderFunnel.paidOrders / orderFunnel.totalOrders) * 1000) / 10 : 0;
  const mpesaSuccessRatePct =
    totalMpesaAttempts > 0
      ? Math.round((Number(mpesaMetricsRow.completedCount || 0) / totalMpesaAttempts) * 1000) / 10
      : 0;

  const wafBlocksRow = db
    .prepare(
      `SELECT COUNT(*) as count
       FROM security_logs
       WHERE (event_type LIKE 'WAF_%' OR event_type LIKE 'RATE_LIMIT_%')
         AND created_at >= datetime('now', '-1 day')`
    )
    .get() as { count: number };

  res.json({
    metrics: {
      totalRevenueUsd: Number(revenueRow.usd || 0),
      totalRevenueKes: Number(revenueRow.kes || 0),
      paidOrdersCount: revenueRow.count,
      totalUsers: usersCount,
    },
    mpesaMetrics: {
      totalDepositedKes: Number(mpesaMetricsRow.totalDepositedKes || 0),
      walletDepositedKes: Number(mpesaMetricsRow.walletDepositedKes || 0),
      completedCount: Number(mpesaMetricsRow.completedCount || 0),
      pendingCount: Number(mpesaMetricsRow.pendingCount || 0),
      failedOrCancelledCount: Number(mpesaMetricsRow.failedOrCancelledCount || 0),
    },
    websiteAnalytics: {
      users: userStats,
      orderFunnel: {
        ...orderFunnel,
        conversionPct: orderConversionPct,
      },
      mpesaFunnel: {
        totalAttempts: totalMpesaAttempts,
        completedCount: Number(mpesaMetricsRow.completedCount || 0),
        pendingCount: Number(mpesaMetricsRow.pendingCount || 0),
        failedOrCancelledCount: Number(mpesaMetricsRow.failedOrCancelledCount || 0),
        successRatePct: mpesaSuccessRatePct,
      },
      engagement: engagementRow,
      productBreakdown,
      dailySeries,
    },
    mpesaConfigAudit: {
      configured: darajaStatus.configured,
      env: darajaStatus.env,
      rawEnvSet: Boolean(rawEnv),
      consumerKeySet: Boolean(cleanMpesaEnvVar('MPESA_CONSUMER_KEY')),
      consumerSecretSet: Boolean(cleanMpesaEnvVar('MPESA_CONSUMER_SECRET')),
      passkeySet: Boolean(cleanMpesaEnvVar('MPESA_PASSKEY')),
      shortCode: darajaStatus.shortCode,
      partyB: darajaStatus.partyB,
      transactionType: darajaStatus.transactionType,
      callbackUrl: configuredCallbackUrl
        ? configuredCallbackUrl.replace(/([?&]token=)[^&]+/i, '$1***')
        : null,
      callbackSecretSet: Boolean(cleanMpesaEnvVar('MPESA_CALLBACK_SECRET')),
      mismatchWarnings,
    },
    firewallStatus: {
      wafEnabled: true,
      jsonLimitDefault: '256kb',
      jsonLimitJournal: '3mb',
      stkRateLimit: '8 / 5m user · 12 / 5m IP',
      adminRateLimit: '60 / 1m IP',
      authRateLimit: '20 / 15m IP',
      callbackSecretConfigured: Boolean(cleanMpesaEnvVar('MPESA_CALLBACK_SECRET')),
      sessionSecretStrong: hasStrongSessionSecret(),
      wafBlocks24h: Number(wafBlocksRow.count || 0),
      activeTempBlockedIps: getActiveBlockedIpCount(),
    },
    users,
    influencers,
    influencerSummary,
    orders,
    mpesaTransactions,
    payouts,
    securityLogs,
    emailLogs,
    settings,
  });
});

app.post('/api/admin/orders/:id/status', requireAdmin, async (req: AuthedRequest, res) => {
  const orderId = Number(req.params.id);
  const status = req.body?.status;
  if (!['paid', 'failed', 'refunded', 'pending'].includes(status)) {
    res.status(400).json({ error: 'Invalid order status.' });
    return;
  }
  if (status === 'paid') {
    await fulfillOrder(orderId);
  } else {
    db.prepare('UPDATE orders SET payment_status = ? WHERE id = ?').run(status, orderId);
    await upsertCloudOrder(orderId).catch(() => {});
  }
  logSecurityEvent('ADMIN_ORDER_UPDATE', 'info', getClientIp(req), req.currentUser!.email, `Order #${orderId} -> ${status}`);
  res.json({ ok: true });
});

app.post('/api/admin/users/:id/update', requireAdmin, async (req: AuthedRequest, res) => {
  try {
    const userId = Number(req.params.id);
    if (!Number.isInteger(userId) || userId <= 0) {
      res.status(400).json({ error: 'Invalid user ID.' });
      return;
    }

    const existing = db.prepare('SELECT * FROM users WHERE id = ?').get(userId) as DbUser | undefined;
    if (!existing) {
      res.status(404).json({ error: 'User account not found.' });
      return;
    }

    const nextName =
      typeof req.body?.name === 'string' && sanitizeText(req.body.name, 80).length >= 2
        ? sanitizeText(req.body.name, 80)
        : undefined;
    const nextExnessId =
      typeof req.body?.exnessAccountId === 'string' && sanitizeText(req.body.exnessAccountId, 40).length >= 3
        ? sanitizeText(req.body.exnessAccountId, 40).toUpperCase()
        : undefined;
    const nextReferralCode =
      typeof req.body?.referralCode === 'string' && sanitizeText(req.body.referralCode, 30).length >= 3
        ? sanitizeText(req.body.referralCode, 30)
            .toUpperCase()
            .replace(/[^A-Z0-9_-]/g, '')
        : undefined;
    const role = ['user', 'influencer', 'admin'].includes(req.body?.role) ? req.body.role : undefined;
    const isSuspended = typeof req.body?.isSuspended === 'boolean' ? (req.body.isSuspended ? 1 : 0) : undefined;
    const exnessVerified =
      typeof req.body?.exnessVerified === 'boolean' ? (req.body.exnessVerified ? 1 : 0) : undefined;
    const hasAnalyzer = typeof req.body?.hasAnalyzer === 'boolean' ? (req.body.hasAnalyzer ? 1 : 0) : undefined;
    const rawHasDrt =
      typeof req.body?.hasDrtAnalyzer === 'boolean' ? req.body.hasDrtAnalyzer : req.body?.hasEaBots;
    const hasEaBots = typeof rawHasDrt === 'boolean' ? (rawHasDrt ? 1 : 0) : undefined;

    let walletBalanceKes: number | undefined;
    if (req.body?.walletBalanceKes !== undefined && req.body?.walletBalanceKes !== '') {
      const parsedWallet = Number(req.body.walletBalanceKes);
      if (!Number.isFinite(parsedWallet) || parsedWallet < 0) {
        res.status(400).json({ error: 'Wallet balance (KES) must be a valid non-negative number.' });
        return;
      }
      walletBalanceKes = Number(parsedWallet.toFixed(2));
    }

    let hasCommissionUpdate = false;
    let commissionPctVal: number | null = null;
    if (req.body?.commissionPct !== undefined) {
      hasCommissionUpdate = true;
      if (req.body.commissionPct === null || String(req.body.commissionPct).trim() === '') {
        commissionPctVal = null;
      } else {
        const parsedPct = Number(req.body.commissionPct);
        if (!Number.isFinite(parsedPct) || parsedPct < 0 || parsedPct > 80) {
          res.status(400).json({ error: 'Custom commission % must be between 0 and 80 (or blank for site default).' });
          return;
        }
        commissionPctVal = Number(parsedPct.toFixed(2));
      }
    }

    let hasReferredByUpdate = false;
    let referredById: number | null = existing.referred_by;
    if (typeof req.body?.referredByCode === 'string') {
      hasReferredByUpdate = true;
      const cleanCode = sanitizeText(req.body.referredByCode, 30).toUpperCase();
      if (!cleanCode) {
        referredById = null;
      } else {
        const refRow = db
          .prepare('SELECT id FROM users WHERE UPPER(referral_code) = ?')
          .get(cleanCode) as { id: number } | undefined;
        if (!refRow) {
          res.status(400).json({ error: `Referrer code "${cleanCode}" was not found.` });
          return;
        }
        if (refRow.id === userId) {
          res.status(400).json({ error: 'A user cannot be their own referrer.' });
          return;
        }
        referredById = refRow.id;
      }
    }

    if (nextReferralCode && nextReferralCode !== existing.referral_code) {
      const conflict = db
        .prepare('SELECT id FROM users WHERE UPPER(referral_code) = ? AND id != ?')
        .get(nextReferralCode, userId);
      if (conflict) {
        res.status(409).json({ error: `Referral code "${nextReferralCode}" is already in use by another account.` });
        return;
      }
    }

    let hasAnalyzerExpiryUpdate = false;
    let analyzerExpiresAtVal: string | null = existing.analyzer_expires_at || null;
    if (req.body?.analyzerExpiresAt !== undefined) {
      hasAnalyzerExpiryUpdate = true;
      const rawDate = String(req.body.analyzerExpiresAt || '').trim();
      if (!rawDate) {
        analyzerExpiresAtVal = null;
      } else {
        const parsed = Date.parse(rawDate.length === 10 ? `${rawDate}T23:59:59.000Z` : rawDate);
        if (!Number.isFinite(parsed)) {
          res.status(400).json({ error: 'Invalid Analyzer subscription expiration date.' });
          return;
        }
        analyzerExpiresAtVal = new Date(parsed).toISOString();
      }
    } else if (hasAnalyzer === 1 && !existing.analyzer_expires_at) {
      hasAnalyzerExpiryUpdate = true;
      analyzerExpiresAtVal = new Date(Date.now() + 30 * 86_400_000).toISOString();
    }

    let hasEaBotsExpiryUpdate = false;
    let eaBotsExpiresAtVal: string | null = existing.ea_bots_expires_at || null;
    const incomingDrtExpiry =
      req.body?.drtAnalyzerExpiresAt !== undefined
        ? req.body.drtAnalyzerExpiresAt
        : req.body?.eaBotsExpiresAt;
    if (incomingDrtExpiry !== undefined) {
      hasEaBotsExpiryUpdate = true;
      const rawDate = String(incomingDrtExpiry || '').trim();
      if (!rawDate) {
        eaBotsExpiresAtVal = null;
      } else {
        const parsed = Date.parse(rawDate.length === 10 ? `${rawDate}T23:59:59.000Z` : rawDate);
        if (!Number.isFinite(parsed)) {
          res.status(400).json({ error: 'Invalid DRT Analyzer subscription expiration date.' });
          return;
        }
        eaBotsExpiresAtVal = new Date(parsed).toISOString();
      }
    } else if (hasEaBots === 1 && !existing.ea_bots_expires_at) {
      hasEaBotsExpiryUpdate = true;
      eaBotsExpiresAtVal = new Date(Date.now() + 30 * 86_400_000).toISOString();
    }

    const tx = db.transaction(() => {
      if (nextName) db.prepare('UPDATE users SET name = ? WHERE id = ?').run(nextName, userId);
      if (nextExnessId)
        db.prepare('UPDATE users SET exness_account_id = ? WHERE id = ?').run(nextExnessId, userId);
      if (nextReferralCode)
        db.prepare('UPDATE users SET referral_code = ? WHERE id = ?').run(nextReferralCode, userId);
      if (role) db.prepare('UPDATE users SET role = ? WHERE id = ?').run(role, userId);
      if (isSuspended !== undefined)
        db.prepare('UPDATE users SET is_suspended = ? WHERE id = ?').run(isSuspended, userId);
      if (exnessVerified !== undefined)
        db.prepare('UPDATE users SET exness_verified = ? WHERE id = ?').run(exnessVerified, userId);
      if (hasAnalyzer !== undefined)
        db.prepare('UPDATE users SET has_analyzer = ? WHERE id = ?').run(hasAnalyzer, userId);
      if (hasEaBots !== undefined)
        db.prepare('UPDATE users SET has_ea_bots = ? WHERE id = ?').run(hasEaBots, userId);
      if (hasAnalyzerExpiryUpdate)
        db.prepare('UPDATE users SET analyzer_expires_at = ? WHERE id = ?').run(analyzerExpiresAtVal, userId);
      if (hasEaBotsExpiryUpdate)
        db.prepare('UPDATE users SET ea_bots_expires_at = ? WHERE id = ?').run(eaBotsExpiresAtVal, userId);
      if (walletBalanceKes !== undefined)
        db.prepare('UPDATE users SET wallet_balance_kes = ? WHERE id = ?').run(walletBalanceKes, userId);
      if (hasCommissionUpdate)
        db.prepare('UPDATE users SET commission_pct = ? WHERE id = ?').run(commissionPctVal, userId);
      if (hasReferredByUpdate)
        db.prepare('UPDATE users SET referred_by = ? WHERE id = ?').run(referredById, userId);
    });
    tx();

    const updated = db.prepare('SELECT * FROM users WHERE id = ?').get(userId) as DbUser | undefined;
    let cloudSynced = false;
    if (updated) {
      const sbUid = await resolveUserSupabaseUid(updated);
      const profileSyncPromise =
        sbUid && getServerSupabaseAdminClient()
          ? upsertSupabaseProfile({
              id: sbUid,
              email: updated.email,
              full_name: updated.name,
              role: updated.role,
              exness_account_id: updated.exness_account_id,
              exness_verified: Boolean(updated.exness_verified),
              referral_code: updated.referral_code,
              has_analyzer: Boolean(updated.has_analyzer) || updated.role === 'admin',
              has_ea_bots: Boolean(updated.has_ea_bots) || updated.role === 'admin',
            }).catch(() => ({ profile: null, error: 'profile sync failed' }))
          : Promise.resolve({ profile: null, error: null });

      const [, stateOk, metaOk] = await Promise.all([
        profileSyncPromise,
        syncUserStateToCloud(updated.id).catch(() => false),
        syncUserDirectoryEntryToCloud(updated.id).catch(() => false),
      ]);
      cloudSynced = Boolean(stateOk || metaOk);
    }

    logSecurityEvent(
      'ADMIN_USER_UPDATE',
      'warning',
      getClientIp(req),
      req.currentUser!.email,
      `Updated user #${userId} (${updated?.email || existing.email})${cloudSynced ? ' [Cloud Synced]' : ''}`
    );
    res.json({ ok: true, cloudSynced, user: updated ? serializeUser(updated) : undefined });
  } catch (err) {
    console.error('Admin update user error:', err);
    res.status(500).json({ error: err instanceof Error ? err.message : 'Unable to update user.' });
  }
});

app.post('/api/admin/payouts/:id/status', requireAdmin, async (req: AuthedRequest, res) => {
  const payoutId = Number(req.params.id);
  const status = req.body?.status === 'paid' ? 'paid' : 'rejected';
  const payout = db
    .prepare(
      `SELECT p.*, u.email as user_email, u.name as user_name
       FROM payout_requests p JOIN users u ON p.user_id = u.id
       WHERE p.id = ?`
    )
    .get(payoutId) as
    | {
        id: number;
        user_id: number;
        amount_usd: number;
        method: string;
        destination: string;
        user_email: string;
        user_name: string;
      }
    | undefined;
  if (!payout) {
    res.status(404).json({ error: 'Payout request not found.' });
    return;
  }

  db.prepare("UPDATE payout_requests SET status = ?, processed_at = datetime('now') WHERE id = ?").run(
    status,
    payoutId
  );
  const cloudPersisted = await saveCloudReferralLedger().catch(() => false);
  logSecurityEvent(
    'ADMIN_PAYOUT_UPDATE',
    'info',
    getClientIp(req),
    req.currentUser!.email,
    `Payout #${payoutId} ($${Number(payout.amount_usd).toFixed(2)} for ${payout.user_email}) -> ${status}`
  );

  await sendAutomatedEmail({
    to: payout.user_email,
    subject:
      status === 'paid'
        ? `Grid Pips Payout Disbursed — $${Number(payout.amount_usd).toFixed(2)}`
        : `Grid Pips Payout Request Declined — $${Number(payout.amount_usd).toFixed(2)}`,
    category: 'payout',
    textPreview:
      status === 'paid'
        ? `Your commission payout of $${Number(payout.amount_usd).toFixed(2)} via ${payout.method.toUpperCase()} (${payout.destination}) has been marked paid.`
        : `Your commission payout request of $${Number(payout.amount_usd).toFixed(2)} was declined and returned to your available balance.`,
    html:
      status === 'paid'
        ? `<p>Hello ${payout.user_name},</p><p>Your influencer commission payout of <strong>$${Number(payout.amount_usd).toFixed(2)}</strong> via ${payout.method.toUpperCase()} to <code>${payout.destination}</code> has been disbursed.</p>`
        : `<p>Hello ${payout.user_name},</p><p>Your influencer commission payout request of <strong>$${Number(payout.amount_usd).toFixed(2)}</strong> was declined. The balance remains available in your partner ledger.</p>`,
  }).catch(() => {});

  res.json({ ok: true, cloudPersisted });
});

app.post('/api/admin/settings', requireAdmin, async (req: AuthedRequest, res) => {
  const allowedKeys = [
    'exness_ib_url',
    'telegram_url',
    'ict_youtube_channel_id',
    'drt_youtube_channel_url',
    'analyzer_price_usd',
    'ea_bots_price_usd',
    'usd_kes_rate',
    'mpesa_till_number',
    'mpesa_party_b',
    'mpesa_transaction_type',
    'mpesa_merchant_name',
    'influencer_commission_pct',
    'usdt_trc20_address',
    'usdt_erc20_address',
    'btc_address',
  ];
  const numericKeys = new Set([
    'analyzer_price_usd',
    'ea_bots_price_usd',
    'usd_kes_rate',
    'influencer_commission_pct',
  ]);
  for (const key of numericKeys) {
    if (req.body?.[key] !== undefined && String(req.body[key]).trim() !== '') {
      const parsed = Number(req.body[key]);
      if (!Number.isFinite(parsed) || parsed < 0) {
        res.status(400).json({ error: `Invalid numeric value for ${key}.` });
        return;
      }
    }
  }

  const stmt = db.prepare(
    'INSERT INTO site_settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value'
  );
  const tx = db.transaction(() => {
    for (const key of allowedKeys) {
      if (req.body?.[key] !== undefined) {
        stmt.run(key, sanitizeText(String(req.body[key]), 400));
      }
    }
  });
  tx();

  const updatedSettings = getSettingsMap();
  const cloudPersisted = await saveCloudSiteSettings(updatedSettings);
  logSecurityEvent(
    'ADMIN_SETTINGS_UPDATE',
    'info',
    getClientIp(req),
    req.currentUser!.email,
    `Updated site settings${cloudPersisted ? ' (synced to Cloud Postgres)' : ' (local SQLite only)'}`
  );
  res.json({ settings: updatedSettings, cloudPersisted });
});

app.post('/api/admin/mpesa/test', requireAdmin, async (req: AuthedRequest, res) => {
  try {
    const settings = getSettingsMap();
    const result = await testDarajaConnection(settings);
    logSecurityEvent(
      'ADMIN_DARAJA_TEST',
      result.ok ? 'info' : 'warning',
      getClientIp(req),
      req.currentUser!.email,
      result.message
    );
    res.status(result.ok ? 200 : 400).json(result);
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Daraja OAuth test failed.';
    logSecurityEvent('ADMIN_DARAJA_TEST_ERROR', 'warning', getClientIp(req), req.currentUser!.email, msg);
    res.status(502).json({ ok: false, message: msg });
  }
});

app.post('/api/admin/mpesa/reset-stale', requireAdmin, (req: AuthedRequest, res) => {
  clearDarajaTokenCache();
  const info = db
    .prepare(
      `UPDATE orders
       SET payment_status = 'pending',
           mpesa_checkout_id = NULL,
           mpesa_merchant_request_id = NULL,
           mpesa_result_code = NULL,
           mpesa_result_desc = NULL
       WHERE payment_method = 'mpesa'
         AND payment_status = 'processing'
         AND (mpesa_receipt IS NULL OR mpesa_receipt = '')`
    )
    .run();

  const txInfo = db
    .prepare(
      `UPDATE mpesa_transactions
       SET status = 'cancelled',
           result_desc = 'Cleared stale pending STK session by administrator.',
           updated_at = datetime('now')
       WHERE status = 'pending'
         AND (mpesa_receipt_number IS NULL OR mpesa_receipt_number = '')`
    )
    .run();

  logSecurityEvent(
    'ADMIN_MPESA_RESET',
    'info',
    getClientIp(req),
    req.currentUser!.email,
    `Cleared Daraja token cache, reset ${info.changes} pending STK order(s) and ${txInfo.changes} pending M-Pesa transaction(s).`
  );
  res.json({
    ok: true,
    resetCount: info.changes + txInfo.changes,
    message: `Cleared Daraja OAuth cache, reset ${info.changes} incomplete STK order(s) and ${txInfo.changes} pending M-Pesa transaction(s).`,
  });
});

function isPrivateOrReservedIpv4(ip: string): boolean {
  const parts = ip.split('.').map((n) => Number(n));
  if (parts.length !== 4 || parts.some((n) => !Number.isInteger(n) || n < 0 || n > 255)) return true;
  const [a, b] = parts;
  if (a === 10 || a === 127 || a === 0) return true;
  if (a === 169 && b === 254) return true;
  if (a === 172 && b >= 16 && b <= 31) return true;
  if (a === 192 && b === 168) return true;
  if (a === 100 && b >= 64 && b <= 127) return true;
  if (a >= 224) return true;
  return false;
}

app.post('/api/admin/domain/check', requireAdmin, async (req: AuthedRequest, res) => {
  const rawInput = sanitizeText(req.body?.domain, 253)
    .trim()
    .replace(/^https?:\/\//i, '')
    .split('/')[0]
    .split('?')[0]
    .split('#')[0]
    .split(':')[0]
    .toLowerCase();

  if (
    !rawInput ||
    rawInput === 'localhost' ||
    /^\d{1,3}(\.\d{1,3}){3}$/.test(rawInput) ||
    !/^(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,24}$/.test(rawInput)
  ) {
    res.status(400).json({
      error: 'Enter a valid public domain hostname (e.g. gridpips.com or app.gridpips.com).',
    });
    return;
  }

  let aRecords: string[] = [];
  let cnameRecords: string[] = [];
  try {
    aRecords = await dns.resolve4(rawInput).catch(() => []);
    cnameRecords = await dns.resolveCname(rawInput).catch(() => []);
  } catch {
    // handled below
  }

  const diagnostics: string[] = [];
  if (aRecords.length === 0 && cnameRecords.length === 0) {
    diagnostics.push(
      `No DNS A or CNAME records found for ${rawInput}. In Namecheap Advanced DNS, add A Record @ -> 76.76.21.21 and CNAME www -> cname.vercel-dns.com.`
    );
  } else if (aRecords.some(isPrivateOrReservedIpv4)) {
    res.status(400).json({ error: 'Domain resolves to a private or reserved IP address.' });
    return;
  }

  const pointsToVercel =
    aRecords.some((ip) => ip === '76.76.21.21' || ip.startsWith('76.76.21.') || ip.startsWith('216.198.79.')) ||
    cnameRecords.some((host) => /vercel-dns\.com$|vercel\.app$/i.test(host));

  if ((aRecords.length > 0 || cnameRecords.length > 0) && !pointsToVercel) {
    diagnostics.push(
      `DNS for ${rawInput} resolves to ${aRecords.join(', ') || cnameRecords.join(', ')}, which does not look like Vercel DNS (76.76.21.21 or cname.vercel-dns.com). Ensure Vercel project Domains shows "Valid Configuration" and wait for propagation.`
    );
  }

  let healthStatus: number | null = null;
  let healthEnv: string | null = null;
  let healthRedirectLocation: string | null = null;
  let callbackStatus: number | null = null;
  let callbackRedirectLocation: string | null = null;
  let callbackAccepted = false;

  if (aRecords.length > 0 || cnameRecords.length > 0) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 7000);
    try {
      const healthResp = await fetch(`https://${rawInput}/api/health`, {
        method: 'GET',
        redirect: 'manual',
        signal: controller.signal,
      });
      healthStatus = healthResp.status;
      healthRedirectLocation = healthResp.headers.get('location');
      if (healthResp.status === 200) {
        const body = (await healthResp.json().catch(() => null)) as { mpesaDarajaEnv?: string } | null;
        healthEnv = body?.mpesaDarajaEnv || null;
      } else if (healthResp.status >= 300 && healthResp.status < 400) {
        diagnostics.push(
          `${rawInput} redirects (${healthResp.status} -> ${healthRedirectLocation || 'another host'}). Safaricom Daraja drops POST callbacks on HTTP redirects; use the final non-redirecting hostname as MPESA_CALLBACK_URL.`
        );
      }

      const cbResp = await fetch(`https://${rawInput}/api/payments/mpesa/callback`, {
        method: 'POST',
        redirect: 'manual',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ping: true }),
        signal: controller.signal,
      });
      callbackStatus = cbResp.status;
      callbackRedirectLocation = cbResp.headers.get('location');
      if (cbResp.status === 200) {
        const cbJson = (await cbResp.json().catch(() => null)) as { ResultCode?: number } | null;
        callbackAccepted = cbJson?.ResultCode === 0;
      } else if (cbResp.status >= 300 && cbResp.status < 400) {
        diagnostics.push(
          `POST /api/payments/mpesa/callback returned ${cbResp.status} redirect to ${callbackRedirectLocation || 'another host'}. Add this exact domain without redirect as your Vercel Primary Domain, or use the redirect target in MPESA_CALLBACK_URL.`
        );
      } else {
        diagnostics.push(
          `POST /api/payments/mpesa/callback returned HTTP ${cbResp.status} instead of HTTP 200.`
        );
      }
    } catch (err) {
      diagnostics.push(
        `HTTPS check failed for ${rawInput}: ${err instanceof Error ? err.message : 'TLS/network error'}. Wait for Vercel SSL certificate provisioning to complete.`
      );
    } finally {
      clearTimeout(timer);
    }
  }

  const readyForCallbacks = healthStatus === 200 && callbackStatus === 200 && callbackAccepted;
  const recommendedCallbackUrl = readyForCallbacks ? `https://${rawInput}/api/payments/mpesa/callback` : null;

  logSecurityEvent(
    'ADMIN_DOMAIN_CHECK',
    readyForCallbacks ? 'info' : 'warning',
    getClientIp(req),
    req.currentUser!.email,
    `Domain check ${rawInput}: ready=${readyForCallbacks} health=${healthStatus ?? 'err'} callback=${callbackStatus ?? 'err'}`
  );

  res.json({
    domain: rawInput,
    dnsRecords: { a: aRecords, cname: cnameRecords },
    pointsToVercel,
    healthStatus,
    healthEnv,
    healthRedirectLocation,
    callbackStatus,
    callbackRedirectLocation,
    callbackAccepted,
    readyForCallbacks,
    recommendedCallbackUrl,
    diagnostics,
  });
});

interface SiteCheckupItem {
  id: string;
  name: string;
  category: 'Domain & SEO' | 'Payments' | 'Database & Auth' | 'Market Feeds' | 'Security';
  status: 'pass' | 'warn' | 'fail';
  latencyMs: number;
  summary: string;
  detail: string;
}

app.post('/api/admin/checkup', requireAdmin, async (req: AuthedRequest, res) => {
  const checkedAt = new Date().toISOString();
  const settings = getSettingsMap();
  const rawOrigin = (process.env.APP_URL || 'https://www.gridpips.com').trim().replace(/\/+$/, '');
  const targetOrigin = /^https?:\/\/(localhost|127\.0\.0\.1)/i.test(rawOrigin)
    ? 'https://www.gridpips.com'
    : rawOrigin;

  const checks: SiteCheckupItem[] = [];

  // 1. Primary Website HTTPS Availability
  const tWeb = Date.now();
  try {
    const webResp = await fetch(`${targetOrigin}/`, {
      method: 'GET',
      redirect: 'manual',
      signal: AbortSignal.timeout(7000),
    });
    const latencyMs = Date.now() - tWeb;
    checks.push({
      id: 'primary-web',
      name: `Primary Domain (${targetOrigin.replace(/^https?:\/\//, '')})`,
      category: 'Domain & SEO',
      status: webResp.status === 200 ? 'pass' : webResp.status >= 300 && webResp.status < 400 ? 'warn' : 'fail',
      latencyMs,
      summary: `HTTP ${webResp.status}`,
      detail:
        webResp.status === 200
          ? `Site served cleanly over HTTPS without redirects (${latencyMs}ms).`
          : `Unexpected HTTP ${webResp.status}${webResp.headers.get('location') ? ` -> ${webResp.headers.get('location')}` : ''}.`,
    });
  } catch (err) {
    checks.push({
      id: 'primary-web',
      name: `Primary Domain (${targetOrigin.replace(/^https?:\/\//, '')})`,
      category: 'Domain & SEO',
      status: 'fail',
      latencyMs: Date.now() - tWeb,
      summary: 'Unreachable',
      detail: err instanceof Error ? err.message : 'Unable to reach primary domain.',
    });
  }

  // 2. Public M-Pesa Callback Endpoint
  const cbBaseUrl = `${targetOrigin}/api/payments/mpesa/callback`;
  const cbSecret = cleanMpesaEnvVar('MPESA_CALLBACK_SECRET');
  const cbTestUrl = cbSecret ? `${cbBaseUrl}?token=${encodeURIComponent(cbSecret)}` : cbBaseUrl;
  const tCb = Date.now();
  try {
    const cbResp = await fetch(cbTestUrl, {
      method: 'POST',
      redirect: 'manual',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ping: true }),
      signal: AbortSignal.timeout(7000),
    });
    const cbJson = (await cbResp.json().catch(() => null)) as { ResultCode?: number } | null;
    const latencyMs = Date.now() - tCb;
    const accepted = cbResp.status === 200 && cbJson?.ResultCode === 0;
    const configuredCb = cleanMpesaEnvVar('MPESA_CALLBACK_URL');
    const apexWarn = /^https?:\/\/gridpips\.com(\/|$)/i.test(configuredCb);
    checks.push({
      id: 'mpesa-callback',
      name: 'M-Pesa Daraja Callback Endpoint',
      category: 'Payments',
      status: !accepted ? 'fail' : apexWarn ? 'warn' : 'pass',
      latencyMs,
      summary: accepted
        ? cbSecret
          ? 'HTTP 200 · Token Gated'
          : 'HTTP 200 · ResultCode 0'
        : `HTTP ${cbResp.status}`,
      detail: !accepted
        ? `Callback POST to ${cbBaseUrl} returned HTTP ${cbResp.status} (did not return ResultCode 0).`
        : apexWarn
        ? `Endpoint works on ${cbBaseUrl}, but MPESA_CALLBACK_URL currently uses apex gridpips.com (308 redirect).`
        : `${cbBaseUrl} accepts Safaricom POST callbacks directly with zero redirects${cbSecret ? ' and enforces MPESA_CALLBACK_SECRET' : ''}.`,
    });
  } catch (err) {
    checks.push({
      id: 'mpesa-callback',
      name: 'M-Pesa Daraja Callback Endpoint',
      category: 'Payments',
      status: 'fail',
      latencyMs: Date.now() - tCb,
      summary: 'Probe failed',
      detail: err instanceof Error ? err.message : 'Callback check failed.',
    });
  }

  // 3. Daraja OAuth Authentication Check
  const tDaraja = Date.now();
  try {
    const dRes = await testDarajaConnection(settings);
    checks.push({
      id: 'daraja-oauth',
      name: 'Safaricom Daraja OAuth & Shortcode',
      category: 'Payments',
      status: dRes.ok ? (dRes.env === 'production' ? 'pass' : 'warn') : 'fail',
      latencyMs: Date.now() - tDaraja,
      summary: dRes.ok ? `${dRes.env.toUpperCase()} · SC ${dRes.shortCode} → Till ${dRes.partyB}` : `Auth Failed (${dRes.env})`,
      detail: dRes.message,
    });
  } catch (err) {
    checks.push({
      id: 'daraja-oauth',
      name: 'Safaricom Daraja OAuth & Shortcode',
      category: 'Payments',
      status: 'fail',
      latencyMs: Date.now() - tDaraja,
      summary: 'Error',
      detail: err instanceof Error ? err.message : 'Daraja check failed.',
    });
  }

  // 4. Supabase Auth & Cloud DB Tables
  const tSb = Date.now();
  try {
    const [sbHealth, cloudTables] = await Promise.all([checkSupabaseHealth(), checkCloudSyncTablesHealth()]);
    const allOk = sbHealth.reachable && cloudTables.tablesReady;
    checks.push({
      id: 'supabase-cloud',
      name: 'Supabase Auth & Cloud Sync Tables',
      category: 'Database & Auth',
      status: allOk ? 'pass' : sbHealth.reachable ? 'warn' : 'fail',
      latencyMs: Date.now() - tSb,
      summary: allOk ? 'Connected · All Tables Ready' : sbHealth.reachable ? 'Auth OK · Tables Missing' : 'Disconnected',
      detail: allOk ? cloudTables.message : cloudTables.message || sbHealth.message,
    });
  } catch (err) {
    checks.push({
      id: 'supabase-cloud',
      name: 'Supabase Auth & Cloud Sync Tables',
      category: 'Database & Auth',
      status: 'fail',
      latencyMs: Date.now() - tSb,
      summary: 'Check failed',
      detail: err instanceof Error ? err.message : 'Supabase check failed.',
    });
  }

  // 5. TradingView Live Quotes Feed
  const tQuotes = Date.now();
  try {
    const quotes = await getTradingViewLiveQuotes();
    checks.push({
      id: 'tv-quotes',
      name: 'Live Market Quotes Feed (TradingView)',
      category: 'Market Feeds',
      status: quotes.length >= 6 ? 'pass' : 'warn',
      latencyMs: Date.now() - tQuotes,
      summary: `${quotes.length} Pairs Live`,
      detail: `Active quote feed from tradingview.com (${quotes.map((q) => q.symbol).slice(0, 4).join(', ')}...).`,
    });
  } catch (err) {
    checks.push({
      id: 'tv-quotes',
      name: 'Live Market Quotes Feed (TradingView)',
      category: 'Market Feeds',
      status: 'fail',
      latencyMs: Date.now() - tQuotes,
      summary: 'Feed offline',
      detail: err instanceof Error ? err.message : 'Market quotes failed.',
    });
  }

  // 6. Forex Factory Economic Calendar & News
  const tFf = Date.now();
  try {
    const ffRes = await getForexFactoryLiveFeed(false);
    checks.push({
      id: 'ff-calendar',
      name: 'Forex Factory Calendar & News Feed',
      category: 'Market Feeds',
      status: ffRes.calendarIsFallback ? 'warn' : 'pass',
      latencyMs: Date.now() - tFf,
      summary: `${ffRes.events.length} Events · ${ffRes.news.length} Headlines`,
      detail: ffRes.calendarIsFallback
        ? `Using fallback calendar cache (${ffRes.calendarFeedProvider}).`
        : `Streaming live via ${ffRes.calendarFeedProvider}.`,
    });
  } catch (err) {
    checks.push({
      id: 'ff-calendar',
      name: 'Forex Factory Calendar & News Feed',
      category: 'Market Feeds',
      status: 'fail',
      latencyMs: Date.now() - tFf,
      summary: 'Feed failed',
      detail: err instanceof Error ? err.message : 'Forex Factory check failed.',
    });
  }

  // 7. SEO & Domain Consistency (robots.txt + sitemap.xml)
  const tSeo = Date.now();
  try {
    const [robotsResp, sitemapResp] = await Promise.all([
      fetch(`${targetOrigin}/robots.txt`, { signal: AbortSignal.timeout(5000) }),
      fetch(`${targetOrigin}/sitemap.xml`, { signal: AbortSignal.timeout(5000) }),
    ]);
    const [robotsTxt, sitemapTxt] = await Promise.all([robotsResp.text(), sitemapResp.text()]);
    const hasCustomDomain =
      robotsTxt.includes('www.gridpips.com') && sitemapTxt.includes('www.gridpips.com');
    checks.push({
      id: 'seo-sitemap',
      name: 'SEO Robots & Sitemap Canonicalization',
      category: 'Domain & SEO',
      status: robotsResp.status === 200 && sitemapResp.status === 200 && hasCustomDomain ? 'pass' : 'warn',
      latencyMs: Date.now() - tSeo,
      summary: hasCustomDomain ? 'Canonical www.gridpips.com' : 'Needs Vercel Redeploy',
      detail: hasCustomDomain
        ? 'robots.txt and sitemap.xml both serve https://www.gridpips.com/ cleanly.'
        : 'Live robots.txt/sitemap.xml still point to vercel.app; redeploy Vercel to serve updated static files.',
    });
  } catch (err) {
    checks.push({
      id: 'seo-sitemap',
      name: 'SEO Robots & Sitemap Canonicalization',
      category: 'Domain & SEO',
      status: 'warn',
      latencyMs: Date.now() - tSeo,
      summary: 'Check failed',
      detail: err instanceof Error ? err.message : 'Unable to fetch robots.txt/sitemap.xml.',
    });
  }

  // 8. Session Secret & Security Posture
  const strongSecret = hasStrongSessionSecret();
  const callbackSecretConfigured = Boolean(cleanMpesaEnvVar('MPESA_CALLBACK_SECRET'));
  const criticalCount = (
    db
      .prepare("SELECT COUNT(*) as cnt FROM security_logs WHERE severity = 'critical' AND created_at >= datetime('now', '-1 day')")
      .get() as { cnt: number }
  ).cnt;
  checks.push({
    id: 'security-session',
    name: 'Session Signing & Security Posture',
    category: 'Security',
    status: !strongSecret ? 'warn' : criticalCount > 0 ? 'warn' : 'pass',
    latencyMs: 0,
    summary: strongSecret
      ? `${criticalCount} critical alerts (24h)`
      : 'SESSION_SECRET missing or <32 chars',
    detail: strongSecret
      ? `32+ char SESSION_SECRET active. ${criticalCount} critical security events recorded in the last 24h.`
      : 'Add a random 32+ character SESSION_SECRET environment variable in Vercel Project Settings for persistent signed login sessions.',
  });

  // 9. Application Firewall, Payload Caps & STK Throttling
  const wafBlocksCount = (
    db
      .prepare(
        "SELECT COUNT(*) as cnt FROM security_logs WHERE (event_type LIKE 'WAF_%' OR event_type LIKE 'RATE_LIMIT_%') AND created_at >= datetime('now', '-1 day')"
      )
      .get() as { cnt: number }
  ).cnt;
  checks.push({
    id: 'waf-firewall',
    name: 'Application Firewall (WAF) & Payload Guard',
    category: 'Security',
    status: callbackSecretConfigured ? 'pass' : 'warn',
    latencyMs: 0,
    summary: callbackSecretConfigured
      ? `WAF Active · Callback Secret Set · ${wafBlocksCount} blocks (24h)`
      : `WAF Active · MPESA_CALLBACK_SECRET Not Set`,
    detail: callbackSecretConfigured
      ? `L7 scanner/XSS/SQLi filter, 256KB JSON cap (3MB journal), STK 8/5m & Admin 60/1m throttles, and ?token= callback secret active.`
      : `L7 scanner/XSS/SQLi filter, 256KB JSON cap (3MB journal), and STK 8/5m + Admin 60/1m throttles active. Add MPESA_CALLBACK_SECRET + ?token= in Vercel for strict 403 callback gating.`,
  });

  const passed = checks.filter((c) => c.status === 'pass').length;
  const warnings = checks.filter((c) => c.status === 'warn').length;
  const failed = checks.filter((c) => c.status === 'fail').length;

  logSecurityEvent(
    'ADMIN_SITE_CHECKUP',
    failed > 0 ? 'warning' : 'info',
    getClientIp(req),
    req.currentUser!.email,
    `Site checkup completed: ${passed} pass, ${warnings} warn, ${failed} fail`
  );

  res.json({
    checkedAt,
    targetOrigin,
    summary: {
      total: checks.length,
      passed,
      warnings,
      failed,
    },
    checks,
  });
});

app.use((err: unknown, _req: Request, res: Response, _next: NextFunction) => {
  if (res.headersSent) return;
  const errObj = err as { type?: string; status?: number; message?: string } | null;
  if (errObj?.type === 'entity.too.large' || errObj?.status === 413) {
    res.status(413).json({ error: 'Request payload too large.' });
    return;
  }
  if (errObj?.type === 'entity.parse.failed' || errObj?.status === 400) {
    res.status(400).json({ error: 'Invalid JSON request payload.' });
    return;
  }
  console.error('Unhandled Express API error:', err);
  const message = err instanceof Error ? err.message : 'Internal server error.';
  res.status(500).json({ error: message });
});

export default app;
