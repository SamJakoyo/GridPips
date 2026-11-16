import 'dotenv/config';
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
  hydrateUserFromCloud,
  insertCloudJournalTrade,
  insertCloudMt5Command,
  syncUserStateToCloud,
  upsertCloudOrder,
} from './cloudSync.ts';
import { runCloudAutoTradePass } from './autoTradeEngine.ts';

try {
  initDatabase();
} catch (err) {
  console.error('SQLite initialization error:', err);
}

export const app = express();
const COOKIE_NAME = 'gridpips_session';
const LEGACY_COOKIE_NAME = 'pipgrid_session';

app.set('trust proxy', 1);

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
          'https://www.tradingview.com',
        ],
        styleSrc: ["'self'", "'unsafe-inline'", 'https://fonts.googleapis.com'],
        fontSrc: ["'self'", 'https://fonts.gstatic.com', 'data:'],
        imgSrc: ["'self'", 'data:', 'blob:', 'https:'],
        mediaSrc: ["'self'", 'data:', 'blob:', 'https:'],
        frameSrc: [
          "'self'",
          'https://s3.tradingview.com',
          'https://www.tradingview.com',
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

app.use(cookieParser());
app.use(express.json({ limit: '25mb' }));

// Rate limiters to prevent brute-force & DDoS abuse
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 25,
  standardHeaders: true,
  legacyHeaders: false,
  handler: (req, res) => {
    logSecurityEvent('RATE_LIMIT_AUTH', 'warning', getClientIp(req), null, 'Too many auth attempts');
    res.status(429).json({ error: 'Too many authentication attempts. Please try again in 15 minutes.' });
  },
});

const apiLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 160,
  standardHeaders: true,
  legacyHeaders: false,
});

app.use('/api', apiLimiter);

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
  is_suspended: number;
  created_at: string;
  last_login_at: string | null;
}

interface AuthedRequest extends Request {
  currentUser?: DbUser;
}

function serializeUser(u: DbUser) {
  const apiReady = isMt5ApiConfigured();
  const profileReady = isMetaApiProfileConfigured();

  return {
    id: u.id,
    name: u.name,
    email: u.email,
    role: u.role,
    exnessAccountId: u.exness_account_id,
    exnessEmail: u.exness_email,
    exnessVerified: Boolean(u.exness_verified),
    referralCode: u.referral_code,
    hasAnalyzer: Boolean(u.has_analyzer) || u.role === 'admin',
    hasEaBots: Boolean(u.has_ea_bots) || u.role === 'admin',
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

  return {
    missingSupabaseEnvVars: sb.missingEnvVars,
    missingSessionSecret,
    sessionSecretStrong: hasStrongSessionSecret(),
    hasSecretKeyMisplacedInUrl: sb.hasSecretKeyMisplacedInUrl,
    supabaseUrlValid: Boolean(sb.url && sb.url.startsWith('https://')),
    missingMetaApiEnvVars,
    metaApiConfigured: isMt5ApiConfigured(),
    metaApiProfileConfigured: isMetaApiProfileConfigured(),
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

app.get('/api/config/public', (_req, res) => {
  const s = getSettingsMap();
  const analyzerPriceUsd = Number(s.analyzer_price_usd || 5.25);
  const eaBotsPriceUsd = Number(s.ea_bots_price_usd || 5.25);
  const usdKesRate = Number(s.usd_kes_rate || 130);
  const sb = getSupabaseEnvConfig();
  res.json({
    exnessIbUrl: s.exness_ib_url,
    telegramUrl: s.telegram_url,
    ictYoutubeChannelId: s.ict_youtube_channel_id,
    analyzerPriceUsd,
    eaBotsPriceUsd,
    usdKesRate,
    analyzerPriceKes: Math.round(analyzerPriceUsd * usdKesRate),
    eaBotsPriceKes: Math.round(eaBotsPriceUsd * usdKesRate),
    mpesaTillNumber: s.mpesa_till_number || '5984120',
    mpesaMerchantName: s.mpesa_merchant_name || 'GRIDPIPs Trading',
    commissionPct: Number(s.influencer_commission_pct || 20),
    supabaseConfigured: sb.configured,
    supabaseStatus: sb.status,
    supabaseUrl: sb.url,
    supabaseAnonKey: sb.anonKey,
    cryptoAddresses: {
      USDT_TRC20: s.usdt_trc20_address,
      USDT_ERC20: s.usdt_erc20_address,
      BTC: s.btc_address,
    },
  });
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
      void syncUserStateToCloud(user.id);
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
    void syncUserStateToCloud(userId);
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
    void syncUserStateToCloud(updated.id);

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
  await hydrateUserFromCloud(user.id, user.email);
  void syncUserStateToCloud(user.id);
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

// ---------------- Orders & Payments (MegaPay M-Pesa Till + Crypto Gateway) ----------------
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

app.post('/api/orders/create', requireAuth, (req: AuthedRequest, res) => {
  const user = req.currentUser!;
  const productKey = req.body?.productKey === 'ea_bots' ? 'ea_bots' : 'analyzer';
  const paymentMethod = req.body?.paymentMethod === 'mpesa' ? 'mpesa' : 'crypto';
  const cryptoCurrency = sanitizeText(req.body?.cryptoCurrency || 'USDT', 16);
  const cryptoNetwork = sanitizeText(req.body?.cryptoNetwork || 'TRC20', 16);

  const settings = getSettingsMap();
  const amountUsd =
    productKey === 'ea_bots'
      ? Number(settings.ea_bots_price_usd || 5.25)
      : Number(settings.analyzer_price_usd || 5.25);
  const usdKesRate = Number(settings.usd_kes_rate || 130);
  const amountKes = Math.round(amountUsd * usdKesRate);
  const commissionPct = Number(settings.influencer_commission_pct || 20);

  const productName =
    productKey === 'ea_bots'
      ? 'GRIDPIPs MQL5 EA Bots Pack + MT5 Bridge'
      : 'GRIDPIPs ICT Strategy Market Analyzer';

  const orderNumber = `GP-${Date.now().toString(36).toUpperCase()}-${Math.floor(100 + Math.random() * 899)}`;
  const commissionUsd = user.referred_by ? Number(((amountUsd * commissionPct) / 100).toFixed(2)) : 0;

  let depositAddress: string | null = null;
  if (paymentMethod === 'crypto') {
    if (cryptoCurrency === 'BTC') depositAddress = settings.btc_address;
    else if (cryptoNetwork === 'ERC20') depositAddress = settings.usdt_erc20_address;
    else depositAddress = settings.usdt_trc20_address;
  }

  const info = db
    .prepare(
      `INSERT INTO orders (
        order_number, user_id, product_key, product_name, amount_usd, amount_kes,
        payment_method, payment_status, crypto_currency, crypto_network,
        crypto_address, referrer_id, commission_usd
      ) VALUES (?, ?, ?, ?, ?, ?, ?, 'pending', ?, ?, ?, ?, ?)`
    )
    .run(
      orderNumber,
      user.id,
      productKey,
      productName,
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
  void upsertCloudOrder(Number(info.lastInsertRowid));
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
        amount_usd: number;
        amount_kes: number;
        payment_method: string;
      }
    | undefined;
  if (!order) return;

  db.prepare("UPDATE orders SET payment_status = 'paid', paid_at = datetime('now') WHERE id = ?").run(orderId);

  if (order.product_key === 'analyzer') {
    db.prepare('UPDATE users SET has_analyzer = 1 WHERE id = ?').run(order.user_id);
  } else if (order.product_key === 'ea_bots') {
    db.prepare('UPDATE users SET has_ea_bots = 1 WHERE id = ?').run(order.user_id);
  }

  void upsertCloudOrder(orderId);
  void syncUserStateToCloud(order.user_id);

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

    await sendAutomatedEmail({
      to: user.email,
      subject: `GRIDPIPs Receipt & Access Unlocked — ${order.order_number}`,
      category: 'order_receipt',
      textPreview: `Payment of $${order.amount_usd.toFixed(2)} (KES ${order.amount_kes}) via ${order.payment_method.toUpperCase()} confirmed for ${order.product_name}. Your access is unlocked inside GRIDPIPs.`,
      html: `<h2>Payment Confirmed — ${order.order_number}</h2>
        <p>Hello ${user.name},</p>
        <p>Your payment of <strong>$${order.amount_usd.toFixed(2)} USD (KES ${order.amount_kes})</strong> via <strong>${order.payment_method.toUpperCase()}</strong> for <strong>${order.product_name}</strong> is confirmed.</p>
        <p>${
          order.product_key === 'ea_bots'
            ? 'Open the MQL5 EA Bots panel in your GRIDPIPs account to download the .mq5 source files, installation guide, and connect your MT5 bridge.'
            : 'Open the ICT Strategy Market Analyzer in your GRIDPIPs account to scan live setups.'
        }</p>`,
    });
  }
}

app.post('/api/orders/:id/mpesa/stk', requireAuth, async (req: AuthedRequest, res) => {
  const orderId = Number(req.params.id);
  const phone = normalizeKenyanPhone(sanitizeText(req.body?.phone, 25));
  if (!phone) {
    res.status(400).json({ error: 'Enter a valid Safaricom/Airtel Kenya number (e.g. 0712345678 or 254712345678).' });
    return;
  }

  const order = db
    .prepare('SELECT * FROM orders WHERE id = ? AND user_id = ?')
    .get(orderId, req.currentUser!.id) as { id: number; order_number: string; amount_kes: number } | undefined;

  if (!order) {
    res.status(404).json({ error: 'Order not found.' });
    return;
  }

  const settings = getSettingsMap();
  const tillNumber = settings.mpesa_till_number || '5984120';
  const apiKey = process.env.MEGAPAY_API_KEY;
  const megaEmail = process.env.MEGAPAY_EMAIL;

  let checkoutId = `MP-${Date.now().toString(36).toUpperCase()}`;
  let mode: 'live' | 'sandbox' = 'sandbox';
  let statusMessage = `STK Push sent to +${phone} for KES ${order.amount_kes} (MegaPay Till ${tillNumber}). Enter your M-Pesa PIN, then confirm below.`;

  if (apiKey && megaEmail) {
    try {
      const megaResp = await fetch(settings.megapay_api_url || 'https://megapay.co.ke/api/v1/initiatestk', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          api_key: apiKey,
          email: megaEmail,
          amount: String(order.amount_kes),
          msisdn: phone,
          reference: order.order_number,
          till_number: tillNumber,
        }),
      });
      const megaJson = (await megaResp.json().catch(() => ({}))) as {
        CheckoutRequestID?: string;
        transaction_request_id?: string;
        message?: string;
      };
      if (megaResp.ok && (megaJson.CheckoutRequestID || megaJson.transaction_request_id)) {
        checkoutId = String(megaJson.CheckoutRequestID || megaJson.transaction_request_id);
        mode = 'live';
        statusMessage = `Live MegaPay STK prompt dispatched to +${phone} for KES ${order.amount_kes}. Complete M-Pesa PIN on your handset.`;
      }
    } catch (err) {
      console.warn('MegaPay live STK fallback to Till manual verification:', err);
    }
  }

  db.prepare(
    "UPDATE orders SET payment_method = 'mpesa', payment_status = 'processing', mpesa_phone = ?, mpesa_checkout_id = ? WHERE id = ?"
  ).run(phone, checkoutId, order.id);

  const updated = db.prepare('SELECT * FROM orders WHERE id = ?').get(order.id);
  res.json({
    order: updated,
    mode,
    tillNumber,
    checkoutId,
    message: statusMessage,
  });
});

app.post('/api/orders/:id/mpesa/confirm', requireAuth, async (req: AuthedRequest, res) => {
  const orderId = Number(req.params.id);
  const rawReceipt = sanitizeText(req.body?.mpesaReceipt, 40).toUpperCase();
  const simulateStk = Boolean(req.body?.simulateStk);

  const order = db
    .prepare('SELECT * FROM orders WHERE id = ? AND user_id = ?')
    .get(orderId, req.currentUser!.id) as { id: number; mpesa_phone: string | null } | undefined;

  if (!order) {
    res.status(404).json({ error: 'Order not found.' });
    return;
  }

  const receipt = simulateStk && !rawReceipt
    ? `MP${Date.now().toString(36).toUpperCase().slice(-8)}`
    : rawReceipt;

  if (receipt.length < 6) {
    res.status(400).json({ error: 'Enter your M-Pesa confirmation code (minimum 6 characters, e.g. UAJ8K4M92P).' });
    return;
  }

  db.prepare("UPDATE orders SET payment_method = 'mpesa', mpesa_receipt = ? WHERE id = ?").run(receipt, order.id);
  await fulfillOrder(order.id);

  const updated = db.prepare('SELECT * FROM orders WHERE id = ?').get(order.id);
  const user = db.prepare('SELECT * FROM users WHERE id = ?').get(req.currentUser!.id) as DbUser;
  res.json({ order: updated, user: serializeUser(user) });
});

app.post('/api/payments/megapay/webhook', async (req, res) => {
  try {
    const body = req.body || {};
    const reference = sanitizeText(body.reference || body.AccountReference || '', 60);
    const checkoutId = sanitizeText(body.CheckoutRequestID || body.transaction_request_id || '', 80);
    const receipt = sanitizeText(body.MpesaReceiptNumber || body.TransactionReceipt || body.receipt || '', 40);
    const resultCode = Number(body.ResponseCode ?? body.ResultCode ?? -1);

    if (resultCode === 0 && (reference || checkoutId)) {
      const order = db
        .prepare('SELECT id FROM orders WHERE order_number = ? OR mpesa_checkout_id = ?')
        .get(reference, checkoutId) as { id: number } | undefined;
      if (order) {
        if (receipt) {
          db.prepare('UPDATE orders SET mpesa_receipt = ? WHERE id = ?').run(receipt, order.id);
        }
        await fulfillOrder(order.id);
      }
    }
    res.json({ received: true });
  } catch (err) {
    console.error('MegaPay webhook error:', err);
    res.status(500).json({ error: 'Webhook processing error' });
  }
});

app.post('/api/orders/:id/crypto/submit', requireAuth, async (req: AuthedRequest, res) => {
  const orderId = Number(req.params.id);
  const txHash = sanitizeText(req.body?.txHash, 120);
  const order = db
    .prepare('SELECT * FROM orders WHERE id = ? AND user_id = ?')
    .get(orderId, req.currentUser!.id) as { id: number } | undefined;

  if (!order) {
    res.status(404).json({ error: 'Order not found.' });
    return;
  }
  if (txHash.length < 16) {
    res.status(400).json({ error: 'Please paste a valid blockchain transaction hash (min 16 characters).' });
    return;
  }

  db.prepare('UPDATE orders SET crypto_tx_hash = ? WHERE id = ?').run(txHash, order.id);
  await fulfillOrder(order.id);
  const updated = db.prepare('SELECT * FROM orders WHERE id = ?').get(order.id);
  const user = db.prepare('SELECT * FROM users WHERE id = ?').get(req.currentUser!.id) as DbUser;
  res.json({ order: updated, user: serializeUser(user) });
});

// ---------------- ICT Strategy Market Analyzer ($5.25 Gated) ----------------
app.get('/api/analyzer/scan', requireAuth, async (req: AuthedRequest, res) => {
  try {
    const user = req.currentUser!;
    if (!user.has_analyzer && user.role !== 'admin') {
      res.status(402).json({ error: 'ICT Market Analyzer requires a one-time $5.25 unlock.' });
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
  return (process.env.APP_URL || 'https://grid-pips.vercel.app').replace(/\/+$/, '');
}

app.get('/api/ea/source/:bot', requireAuth, (req: AuthedRequest, res) => {
  const user = req.currentUser!;
  if (!user.has_ea_bots && user.role !== 'admin') {
    res.status(402).json({ error: 'MQL5 EA Bots Pack requires a $5.25 purchase.' });
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
  if (!user.has_ea_bots && user.role !== 'admin') {
    res.status(402).json({ error: 'Purchase the MQL5 EA Bots Pack ($5.25) to download source files.' });
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
  if (!user.has_ea_bots && user.role !== 'admin') {
    res.status(402).json({ error: 'MQL5 EA Bots Pack required.' });
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
  if (!user.has_ea_bots && user.role !== 'admin') {
    res.status(402).json({ error: 'Purchase the MQL5 EA Bots Pack ($5.25) to connect MT5.' });
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
  if (!user.has_ea_bots && user.role !== 'admin') {
    res.status(402).json({ error: 'MQL5 EA Bots Pack required.' });
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
  if (!user.has_ea_bots && user.role !== 'admin') {
    res.status(402).json({ error: 'MQL5 EA Bots Pack required.' });
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
  if (!user.has_ea_bots && user.role !== 'admin') {
    res.status(402).json({ error: 'MQL5 EA Bots Pack required.' });
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
  if (!user.has_ea_bots && user.role !== 'admin') {
    res.status(402).json({ error: 'MQL5 EA Bots Pack required.' });
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
  if (!user.has_ea_bots && user.role !== 'admin') {
    res.status(402).json({ error: 'MQL5 EA Bots Pack required.' });
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
  if (!user.has_ea_bots && user.role !== 'admin') {
    res.status(402).json({ error: 'MQL5 EA Bots Pack required.' });
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
app.post('/api/referrals/track', (req, res) => {
  const code = sanitizeText(req.body?.code, 30).toUpperCase();
  const sourcePage = sanitizeText(req.body?.sourcePage || '/', 60);
  if (code) {
    db.prepare('INSERT INTO referral_clicks (referral_code, source_page, ip_address) VALUES (?, ?, ?)').run(
      code,
      sourcePage,
      getClientIp(req)
    );
  }
  res.json({ ok: true });
});

app.get('/api/referrals/dashboard', requireAuth, (req: AuthedRequest, res) => {
  const user = req.currentUser!;
  const clicksRow = db
    .prepare('SELECT COUNT(*) as cnt FROM referral_clicks WHERE referral_code = ?')
    .get(user.referral_code) as { cnt: number };
  const signups = db
    .prepare('SELECT id, name, exness_account_id, has_analyzer, has_ea_bots, created_at FROM users WHERE referred_by = ? ORDER BY id DESC')
    .all(user.id);
  const commissionsRow = db
    .prepare(
      "SELECT COALESCE(SUM(commission_usd), 0) as total FROM orders WHERE referrer_id = ? AND payment_status = 'paid'"
    )
    .get(user.id) as { total: number };
  const paidOutRow = db
    .prepare(
      "SELECT COALESCE(SUM(amount_usd), 0) as total FROM payout_requests WHERE user_id = ? AND status IN ('pending', 'paid')"
    )
    .get(user.id) as { total: number };
  const payouts = db
    .prepare('SELECT * FROM payout_requests WHERE user_id = ? ORDER BY id DESC')
    .all(user.id);
  const settings = getSettingsMap();

  const totalEarned = Number(commissionsRow.total || 0);
  const availableBalance = Math.max(0, Number((totalEarned - Number(paidOutRow.total || 0)).toFixed(2)));

  res.json({
    referralCode: user.referral_code,
    commissionPct: Number(settings.influencer_commission_pct || 20),
    clicks: clicksRow.cnt,
    signups,
    totalEarned,
    availableBalance,
    payouts,
  });
});

app.post('/api/referrals/payout', requireAuth, async (req: AuthedRequest, res) => {
  const user = req.currentUser!;
  const method = req.body?.method === 'mpesa' ? 'mpesa' : 'crypto';
  const destination = sanitizeText(req.body?.destination, 120);
  const amountUsd = Number(req.body?.amountUsd || 0);

  if (!destination || amountUsd < 5) {
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
    res.status(400).json({ error: `Insufficient commission balance. Available: $${available.toFixed(2)}` });
    return;
  }

  db.prepare('INSERT INTO payout_requests (user_id, amount_usd, method, destination) VALUES (?, ?, ?, ?)').run(
    user.id,
    amountUsd,
    method,
    destination
  );

  await sendAutomatedEmail({
    to: user.email,
    subject: 'GRIDPIPs Influencer Payout Request Received',
    category: 'payout',
    textPreview: `Your payout request for $${amountUsd.toFixed(2)} via ${method.toUpperCase()} (${destination}) is queued for processing.`,
    html: `<p>Your payout request of <strong>$${amountUsd.toFixed(2)}</strong> via ${method.toUpperCase()} to <code>${destination}</code> has been submitted.</p>`,
  });

  res.status(201).json({ ok: true });
});

// ---------------- Admin Command Center ----------------
app.get('/api/admin/overview', requireAdmin, (_req, res) => {
  const revenueRow = db
    .prepare("SELECT COALESCE(SUM(amount_usd), 0) as usd, COALESCE(SUM(amount_kes), 0) as kes, COUNT(*) as count FROM orders WHERE payment_status = 'paid'")
    .get() as { usd: number; kes: number; count: number };
  const usersCount = (db.prepare('SELECT COUNT(*) as cnt FROM users').get() as { cnt: number }).cnt;
  const users = db
    .prepare(
      'SELECT id, name, email, role, exness_account_id, exness_verified, referral_code, has_analyzer, has_ea_bots, mt5_connected, mt5_login, is_suspended, created_at, last_login_at FROM users ORDER BY id DESC LIMIT 100'
    )
    .all();
  const orders = db
    .prepare(
      `SELECT o.*, u.name as user_name, u.email as user_email
       FROM orders o JOIN users u ON o.user_id = u.id
       ORDER BY o.id DESC LIMIT 100`
    )
    .all();
  const payouts = db
    .prepare(
      `SELECT p.*, u.name as user_name, u.email as user_email
       FROM payout_requests p JOIN users u ON p.user_id = u.id
       ORDER BY p.id DESC LIMIT 50`
    )
    .all();
  const securityLogs = db.prepare('SELECT * FROM security_logs ORDER BY id DESC LIMIT 80').all();
  const emailLogs = db.prepare('SELECT * FROM email_logs ORDER BY id DESC LIMIT 60').all();
  const settings = getSettingsMap();

  res.json({
    metrics: {
      totalRevenueUsd: Number(revenueRow.usd || 0),
      totalRevenueKes: Number(revenueRow.kes || 0),
      paidOrdersCount: revenueRow.count,
      totalUsers: usersCount,
    },
    users,
    orders,
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
    void upsertCloudOrder(orderId);
  }
  logSecurityEvent('ADMIN_ORDER_UPDATE', 'info', getClientIp(req), req.currentUser!.email, `Order #${orderId} -> ${status}`);
  res.json({ ok: true });
});

app.post('/api/admin/users/:id/update', requireAdmin, async (req: AuthedRequest, res) => {
  const userId = Number(req.params.id);
  const role = ['user', 'influencer', 'admin'].includes(req.body?.role) ? req.body.role : undefined;
  const isSuspended = typeof req.body?.isSuspended === 'boolean' ? (req.body.isSuspended ? 1 : 0) : undefined;
  const exnessVerified = typeof req.body?.exnessVerified === 'boolean' ? (req.body.exnessVerified ? 1 : 0) : undefined;
  const hasAnalyzer = typeof req.body?.hasAnalyzer === 'boolean' ? (req.body.hasAnalyzer ? 1 : 0) : undefined;
  const hasEaBots = typeof req.body?.hasEaBots === 'boolean' ? (req.body.hasEaBots ? 1 : 0) : undefined;

  if (role) db.prepare('UPDATE users SET role = ? WHERE id = ?').run(role, userId);
  if (isSuspended !== undefined) db.prepare('UPDATE users SET is_suspended = ? WHERE id = ?').run(isSuspended, userId);
  if (exnessVerified !== undefined)
    db.prepare('UPDATE users SET exness_verified = ? WHERE id = ?').run(exnessVerified, userId);
  if (hasAnalyzer !== undefined) db.prepare('UPDATE users SET has_analyzer = ? WHERE id = ?').run(hasAnalyzer, userId);
  if (hasEaBots !== undefined) db.prepare('UPDATE users SET has_ea_bots = ? WHERE id = ?').run(hasEaBots, userId);

  const updated = db.prepare('SELECT * FROM users WHERE id = ?').get(userId) as DbUser | undefined;
  if (updated) {
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
      }).catch(() => {});
    }
    void syncUserStateToCloud(updated.id);
  }

  logSecurityEvent('ADMIN_USER_UPDATE', 'warning', getClientIp(req), req.currentUser!.email, `Updated user #${userId}`);
  res.json({ ok: true, user: updated ? serializeUser(updated) : undefined });
});

app.post('/api/admin/payouts/:id/status', requireAdmin, (req: AuthedRequest, res) => {
  const payoutId = Number(req.params.id);
  const status = req.body?.status === 'paid' ? 'paid' : 'rejected';
  db.prepare("UPDATE payout_requests SET status = ?, processed_at = datetime('now') WHERE id = ?").run(status, payoutId);
  res.json({ ok: true });
});

app.post('/api/admin/settings', requireAdmin, (req: AuthedRequest, res) => {
  const allowedKeys = [
    'exness_ib_url',
    'telegram_url',
    'ict_youtube_channel_id',
    'analyzer_price_usd',
    'ea_bots_price_usd',
    'usd_kes_rate',
    'mpesa_till_number',
    'mpesa_merchant_name',
    'megapay_api_url',
    'influencer_commission_pct',
    'usdt_trc20_address',
    'usdt_erc20_address',
    'btc_address',
  ];
  const stmt = db.prepare('INSERT INTO site_settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value');
  for (const key of allowedKeys) {
    if (req.body?.[key] !== undefined) {
      stmt.run(key, sanitizeText(String(req.body[key]), 240));
    }
  }
  logSecurityEvent('ADMIN_SETTINGS_UPDATE', 'info', getClientIp(req), req.currentUser!.email, 'Updated site settings');
  res.json({ settings: getSettingsMap() });
});

app.use((err: unknown, _req: Request, res: Response, _next: NextFunction) => {
  console.error('Unhandled Express API error:', err);
  if (res.headersSent) return;
  const message = err instanceof Error ? err.message : 'Internal server error.';
  res.status(500).json({ error: message });
});

export default app;
