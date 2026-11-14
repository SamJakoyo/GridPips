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
} from './security.ts';
import { getSupabaseEnvConfig, verifySupabaseAccessToken } from './supabaseAuth.ts';
import { sendAutomatedEmail } from './email.ts';
import {
  ICT_SILVER_BULLET_MQ5,
  SMC_ORDERBLOCK_MQ5,
  buildInstallationGuide,
} from './mql5Templates.ts';
import { runIctMarketAnalysis } from './ictEngine.ts';
import {
  formatGeminiApiError,
  runGeminiChat,
  runGeminiImageStudio,
  runGeminiImageToVideo,
  type ChatRoleKey,
  type GeminiChatModel,
} from './gemini.ts';
import { requireFirebaseAuth, type FirebaseAuthRequest } from '../src/middleware/firebaseAuth.ts';
import {
  createSqlStrategy,
  deleteSqlStrategyByUid,
  getOrCreateSqlUser,
  listSqlStrategiesByUid,
} from '../src/db/users.ts';

initDatabase();

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
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc: [
          "'self'",
          "'unsafe-inline'",
          "'unsafe-eval'",
          'https://s3.tradingview.com',
          'https://www.tradingview.com',
          'https://apis.google.com',
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
          'https://accounts.google.com',
          'https://*.firebaseapp.com',
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
  is_suspended: number;
  created_at: string;
  last_login_at: string | null;
}

interface AuthedRequest extends Request {
  currentUser?: DbUser;
}

function serializeUser(u: DbUser) {
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

function requireAuth(req: AuthedRequest, res: Response, next: NextFunction): void {
  const token = extractSessionToken(req);
  const payload = verifySessionToken(token);
  if (!payload) {
    res.status(401).json({ error: 'Authentication required. Please log in.' });
    return;
  }
  const user = db.prepare('SELECT * FROM users WHERE id = ?').get(payload.uid) as DbUser | undefined;
  if (!user) {
    res.status(401).json({ error: 'Account not found.' });
    return;
  }
  if (user.is_suspended) {
    res.status(403).json({ error: 'Account is suspended. Contact support.' });
    return;
  }
  req.currentUser = user;
  next();
}

function requireAdmin(req: AuthedRequest, res: Response, next: NextFunction): void {
  requireAuth(req, res, () => {
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

function setSessionCookie(req: Request, res: Response, user: DbUser): string {
  const token = signSessionToken({ uid: user.id, email: user.email, role: user.role });
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
  res.json({ status: 'ok', service: 'GRIDPIPs' });
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
    supabaseUrl: sb.url,
    supabaseAnonKey: sb.anonKey,
    cryptoAddresses: {
      USDT_TRC20: s.usdt_trc20_address,
      USDT_ERC20: s.usdt_erc20_address,
      BTC: s.btc_address,
    },
  });
});

// ---------------- Auth (Exness IB Gate + Rate Limiting) ----------------
app.post('/api/auth/register', authLimiter, async (req, res) => {
  try {
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

    const existing = db.prepare('SELECT id FROM users WHERE email = ?').get(email);
    if (existing) {
      res.status(409).json({ error: 'An account with this email already exists.' });
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
    const bridgeToken = generateSecureToken(16);
    const ip = getClientIp(req);

    const info = db
      .prepare(
        `INSERT INTO users (name, email, password_hash, role, exness_account_id, exness_email, exness_verified, referral_code, referred_by, mt5_bridge_token, last_login_at)
         VALUES (?, ?, ?, 'user', ?, ?, 1, ?, ?, ?, datetime('now'))`
      )
      .run(name, email, hashPassword(password), exnessAccountId, email, uniqueRefCode, referredById, bridgeToken);

    const userId = Number(info.lastInsertRowid);
    db.prepare('INSERT INTO paper_accounts (user_id, balance) VALUES (?, 10000)').run(userId);
    db.prepare('INSERT INTO watchlists (user_id, symbols_json) VALUES (?, ?)').run(
      userId,
      JSON.stringify(['EURUSD', 'GBPUSD', 'XAUUSD', 'NAS100', 'BTCUSD'])
    );

    const user = db.prepare('SELECT * FROM users WHERE id = ?').get(userId) as DbUser;
    const sessionToken = setSessionCookie(req, res, user);

    logSecurityEvent('USER_REGISTERED', 'info', ip, email, `Exness ID: ${exnessAccountId}`);

    const settings = getSettingsMap();
    await sendAutomatedEmail({
      to: email,
      subject: 'Welcome to Grid Pips — Exness Workspace Activated',
      category: 'welcome',
      textPreview: `Welcome ${name}! Your Exness ID (${exnessAccountId}) is linked. Access free tools, ICT/SMC education, and join ${settings.telegram_url}.`,
      html: `<h2>Welcome to Grid Pips, ${name}</h2>
        <p>Your free trading workspace is now active and linked to Exness Account ID <strong>${exnessAccountId}</strong>.</p>
        <p>Your Referral Code: <strong>${uniqueRefCode}</strong></p>
        <p>Join our live trading desk on Telegram: <a href="${settings.telegram_url}">${settings.telegram_url}</a></p>`,
    });

    res.status(201).json({ user: serializeUser(user), sessionToken });
  } catch (err) {
    console.error('Register error:', err);
    res.status(500).json({ error: 'Registration failed. Please try again.' });
  }
});

app.post('/api/auth/login', authLimiter, async (req, res) => {
  try {
    const email = sanitizeText(req.body?.email, 120).toLowerCase();
    const password = typeof req.body?.password === 'string' ? req.body.password : '';
    const ip = getClientIp(req);

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
      textPreview: `A new sign-in to your Grid Pips workspace occurred from IP ${ip}. If this was not you, reset your password immediately.`,
      html: `<p>Hello ${user.name},</p><p>A new sign-in to your Grid Pips account was recorded from IP <code>${ip}</code>.</p>`,
    });

    const refreshed = db.prepare('SELECT * FROM users WHERE id = ?').get(user.id) as DbUser;
    res.json({ user: serializeUser(refreshed), sessionToken });
  } catch (err) {
    console.error('Login error:', err);
    res.status(500).json({ error: 'Login failed.' });
  }
});

app.post('/api/auth/logout', (req, res) => {
  const https = isHttpsRequest(req);
  res.clearCookie(COOKIE_NAME, { path: '/', sameSite: https ? 'none' : 'lax', secure: https });
  res.clearCookie(LEGACY_COOKIE_NAME, { path: '/', sameSite: https ? 'none' : 'lax', secure: https });
  res.json({ ok: true });
});

app.get('/api/auth/me', (req: AuthedRequest, res) => {
  const token = extractSessionToken(req);
  const payload = verifySessionToken(token);
  if (!payload) {
    res.json({ user: null });
    return;
  }
  const user = db.prepare('SELECT * FROM users WHERE id = ?').get(payload.uid) as DbUser | undefined;
  if (!user || user.is_suspended) {
    const https = isHttpsRequest(req);
    res.clearCookie(COOKIE_NAME, { path: '/', sameSite: https ? 'none' : 'lax', secure: https });
    res.clearCookie(LEGACY_COOKIE_NAME, { path: '/', sameSite: https ? 'none' : 'lax', secure: https });
    res.json({ user: null });
    return;
  }
  res.json({ user: serializeUser(user) });
});

app.post('/api/auth/firebase-session', authLimiter, requireFirebaseAuth, async (req: FirebaseAuthRequest, res) => {
  try {
    const fbUser = req.firebaseUser!;
    const email = sanitizeText(fbUser.email || '', 120).toLowerCase();
    const displayName = sanitizeText(fbUser.name || email.split('@')[0] || 'Trader', 80);
    const ip = getClientIp(req);

    if (!email || !email.includes('@')) {
      res.status(400).json({ error: 'Verified Google email is required.' });
      return;
    }

    let user = db.prepare('SELECT * FROM users WHERE email = ?').get(email) as DbUser | undefined;

    if (!user) {
      const exnessAccountId = sanitizeText(req.body?.exnessAccountId, 40).toUpperCase();
      const exnessConfirmed = Boolean(req.body?.exnessConfirmed);
      const referralCodeUsed = sanitizeText(req.body?.referralCode, 30).toUpperCase();

      if (!exnessConfirmed || exnessAccountId.length < 4) {
        res.status(409).json({
          needsExnessOnboarding: true,
          email,
          name: displayName,
          error: 'Link your Exness Partner Account ID to activate your GRIDPIPs workspace.',
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

      const baseCode = displayName.replace(/[^a-zA-Z0-9]/g, '').slice(0, 6).toUpperCase() || 'TRADER';
      const uniqueRefCode = `${baseCode}${Math.floor(100 + Math.random() * 899)}`;
      const bridgeToken = generateSecureToken(16);
      const randomPassword = generateSecureToken(24);
      const role = email === 'samjakoyo26@gmail.com' ? 'admin' : 'user';

      const info = db
        .prepare(
          `INSERT INTO users (name, email, password_hash, role, exness_account_id, exness_email, exness_verified, referral_code, referred_by, mt5_bridge_token, last_login_at)
           VALUES (?, ?, ?, ?, ?, ?, 1, ?, ?, ?, datetime('now'))`
        )
        .run(
          displayName,
          email,
          hashPassword(randomPassword),
          role,
          exnessAccountId,
          email,
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
      user = db.prepare('SELECT * FROM users WHERE id = ?').get(userId) as DbUser;

      logSecurityEvent('USER_REGISTERED_FIREBASE', 'info', ip, email, `Exness ID: ${exnessAccountId}`);

      const settings = getSettingsMap();
      await sendAutomatedEmail({
        to: email,
        subject: 'Welcome to GRIDPIPs — Google & Exness Workspace Activated',
        category: 'welcome',
        textPreview: `Welcome ${displayName}! Your Google Sign-In and Exness ID (${exnessAccountId}) are linked. Join ${settings.telegram_url}.`,
        html: `<h2>Welcome to GRIDPIPs, ${displayName}</h2><p>Your Exness Account ID <strong>${exnessAccountId}</strong> and Google Sign-In are active.</p>`,
      });
    } else {
      if (user.is_suspended) {
        logSecurityEvent('LOGIN_BLOCKED_SUSPENDED', 'warning', ip, email, 'Suspended Firebase user attempt');
        res.status(403).json({ error: 'Your account has been suspended by an administrator.' });
        return;
      }
      db.prepare("UPDATE users SET last_login_at = datetime('now') WHERE id = ?").run(user.id);
      logSecurityEvent('LOGIN_FIREBASE_SUCCESS', 'info', ip, email, `Role: ${user.role}`);
    }

    const sessionToken = setSessionCookie(req, res, user);

    try {
      await getOrCreateSqlUser(fbUser.uid, email, user.name, user.exness_account_id);
    } catch (sqlErr) {
      console.error('Cloud SQL user sync warning:', sqlErr);
    }

    const refreshed = db.prepare('SELECT * FROM users WHERE id = ?').get(user.id) as DbUser;
    res.json({ user: serializeUser(refreshed), sessionToken });
  } catch (err) {
    console.error('Firebase session error:', err);
    res.status(500).json({ error: 'Failed to establish Firebase session.' });
  }
});

app.post('/api/auth/supabase-session', authLimiter, async (req, res) => {
  try {
    const sbConfig = getSupabaseEnvConfig();
    if (!sbConfig.configured) {
      res.status(503).json({
        error: 'Supabase is not configured yet. Add SUPABASE_URL and SUPABASE_ANON_KEY to connect.',
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

    const email = sanitizeText(sbUser.email, 120).toLowerCase();
    const metaName =
      (typeof sbUser.user_metadata?.full_name === 'string' && sbUser.user_metadata.full_name) ||
      (typeof sbUser.user_metadata?.name === 'string' && sbUser.user_metadata.name) ||
      email.split('@')[0] ||
      'Trader';
    const displayName = sanitizeText(req.body?.name || metaName, 80);
    const ip = getClientIp(req);

    let user = db.prepare('SELECT * FROM users WHERE email = ?').get(email) as DbUser | undefined;

    if (!user) {
      const exnessAccountId = sanitizeText(req.body?.exnessAccountId, 40).toUpperCase();
      const exnessConfirmed = Boolean(req.body?.exnessConfirmed);
      const referralCodeUsed = sanitizeText(req.body?.referralCode, 30).toUpperCase();

      if (!exnessConfirmed || exnessAccountId.length < 4) {
        res.status(409).json({
          needsExnessOnboarding: true,
          email,
          name: displayName,
          error: 'Link your Exness Partner Account ID to activate your Grid Pips workspace.',
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

      const baseCode = displayName.replace(/[^a-zA-Z0-9]/g, '').slice(0, 6).toUpperCase() || 'TRADER';
      const uniqueRefCode = `${baseCode}${Math.floor(100 + Math.random() * 899)}`;
      const bridgeToken = generateSecureToken(16);
      const randomPassword = generateSecureToken(24);
      const role = email === 'samjakoyo26@gmail.com' ? 'admin' : 'user';

      const info = db
        .prepare(
          `INSERT INTO users (name, email, password_hash, role, exness_account_id, exness_email, exness_verified, referral_code, referred_by, mt5_bridge_token, last_login_at)
           VALUES (?, ?, ?, ?, ?, ?, 1, ?, ?, ?, datetime('now'))`
        )
        .run(
          displayName,
          email,
          hashPassword(randomPassword),
          role,
          exnessAccountId,
          email,
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
      user = db.prepare('SELECT * FROM users WHERE id = ?').get(userId) as DbUser;

      logSecurityEvent('USER_REGISTERED_SUPABASE', 'info', ip, email, `Exness ID: ${exnessAccountId}`);

      const settings = getSettingsMap();
      await sendAutomatedEmail({
        to: email,
        subject: 'Welcome to Grid Pips — Supabase & Exness Workspace Activated',
        category: 'welcome',
        textPreview: `Welcome ${displayName}! Your Supabase Auth account and Exness ID (${exnessAccountId}) are linked. Join ${settings.telegram_url}.`,
        html: `<h2>Welcome to Grid Pips, ${displayName}</h2><p>Your Exness Account ID <strong>${exnessAccountId}</strong> and Supabase Auth account are active.</p>`,
      });
    } else {
      if (user.is_suspended) {
        logSecurityEvent('LOGIN_BLOCKED_SUSPENDED', 'warning', ip, email, 'Suspended Supabase user attempt');
        res.status(403).json({ error: 'Your account has been suspended by an administrator.' });
        return;
      }
      db.prepare("UPDATE users SET last_login_at = datetime('now') WHERE id = ?").run(user.id);
      logSecurityEvent('LOGIN_SUPABASE_SUCCESS', 'info', ip, email, `Role: ${user.role}`);
    }

    const sessionToken = setSessionCookie(req, res, user);
    const refreshed = db.prepare('SELECT * FROM users WHERE id = ?').get(user.id) as DbUser;
    res.json({ user: serializeUser(refreshed), sessionToken });
  } catch (err) {
    console.error('Supabase session error:', err);
    res.status(500).json({ error: 'Failed to establish Supabase session.' });
  }
});

app.get('/api/notifications/emails', requireAuth, (req: AuthedRequest, res) => {
  const rows = db
    .prepare('SELECT * FROM email_logs WHERE recipient_email = ? ORDER BY id DESC LIMIT 30')
    .all(req.currentUser!.email);
  res.json({ emails: rows });
});

// ---------------- Cloud SQL Strategy Playbooks (Firebase Auth Verified) ----------------
app.get('/api/sql/strategies', requireFirebaseAuth, async (req: FirebaseAuthRequest, res) => {
  try {
    const fb = req.firebaseUser!;
    await getOrCreateSqlUser(fb.uid, fb.email || '', fb.name || 'Trader');
    const strategies = await listSqlStrategiesByUid(fb.uid);
    res.json({ strategies });
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : 'Unable to load playbooks.' });
  }
});

app.post('/api/sql/strategies', requireFirebaseAuth, async (req: FirebaseAuthRequest, res) => {
  try {
    const fb = req.firebaseUser!;
    const title = sanitizeText(req.body?.title, 80);
    const pair = sanitizeText(req.body?.pair || 'EURUSD', 16).toUpperCase();
    const timeframe = sanitizeText(req.body?.timeframe || 'M15', 8).toUpperCase();
    const rulesSummary = sanitizeText(req.body?.rulesSummary, 600);

    if (!title || !rulesSummary) {
      res.status(400).json({ error: 'Strategy title and rules summary are required.' });
      return;
    }

    const sqlUser = await getOrCreateSqlUser(fb.uid, fb.email || '', fb.name || 'Trader');
    const strategy = await createSqlStrategy(sqlUser.id, title, pair, timeframe, rulesSummary);
    res.status(201).json({ strategy });
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : 'Unable to save playbook.' });
  }
});

app.delete('/api/sql/strategies/:id', requireFirebaseAuth, async (req: FirebaseAuthRequest, res) => {
  try {
    const fb = req.firebaseUser!;
    const removed = await deleteSqlStrategyByUid(Number(req.params.id), fb.uid);
    if (!removed) {
      res.status(404).json({ error: 'Strategy not found.' });
      return;
    }
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : 'Unable to delete playbook.' });
  }
});

// ---------------- Gemini AI Desk, Search Grounding, Image & Video Studio ----------------
app.post('/api/ai/chat', requireAuth, async (req: AuthedRequest, res) => {
  const model = (req.body?.model || 'gemini-4-hydrogen') as GeminiChatModel;
  try {
    const message = sanitizeText(req.body?.message, 4000);
    if (!message) {
      res.status(400).json({ error: 'Message prompt is required.' });
      return;
    }
    const rawHistory = Array.isArray(req.body?.history) ? req.body.history : [];
    const history = rawHistory
      .filter((h: { role?: unknown; text?: unknown }) => (h?.role === 'user' || h?.role === 'model') && typeof h?.text === 'string')
      .map((h: { role: 'user' | 'model'; text: string }) => ({
        role: h.role,
        text: h.text.slice(0, 4000),
      }));

    const roleKey = (req.body?.roleKey || 'ict_mentor') as ChatRoleKey;
    const useSearchGrounding = Boolean(req.body?.useSearchGrounding);
    const deepReasoning = Boolean(req.body?.deepReasoning);

    const result = await runGeminiChat({
      message,
      history,
      model,
      roleKey,
      useSearchGrounding,
      deepReasoning,
    });
    res.json(result);
  } catch (err) {
    const formatted = formatGeminiApiError(err, model);
    res.status(formatted.status).json({ error: formatted.message });
  }
});

app.post('/api/ai/image', requireAuth, async (req: AuthedRequest, res) => {
  try {
    const prompt = sanitizeText(req.body?.prompt, 1200);
    if (!prompt) {
      res.status(400).json({ error: 'Image prompt is required.' });
      return;
    }
    const aspectRatio = sanitizeText(req.body?.aspectRatio || '1:1', 10);
    const imageSize = req.body?.imageSize === '2K' ? '2K' : '1K';
    const sourceImageBase64 = typeof req.body?.sourceImageBase64 === 'string' ? req.body.sourceImageBase64 : undefined;
    const sourceImageMimeType = sanitizeText(req.body?.sourceImageMimeType || 'image/png', 40);

    const result = await runGeminiImageStudio({
      prompt,
      aspectRatio,
      imageSize,
      sourceImageBase64,
      sourceImageMimeType,
    });
    res.json(result);
  } catch (err) {
    const formatted = formatGeminiApiError(err, 'gemini-nano-banana-2.1');
    res.status(formatted.status).json({ error: formatted.message });
  }
});

app.post('/api/ai/video', requireAuth, async (req: AuthedRequest, res) => {
  try {
    const prompt = sanitizeText(req.body?.prompt, 1000);
    const imageBase64 = typeof req.body?.imageBase64 === 'string' ? req.body.imageBase64 : '';
    const imageMimeType = sanitizeText(req.body?.imageMimeType || 'image/png', 40);
    const aspectRatio = req.body?.aspectRatio === '9:16' ? '9:16' : '16:9';

    if (!imageBase64) {
      res.status(400).json({ error: 'Please upload a starting image to animate.' });
      return;
    }
    if (!prompt) {
      res.status(400).json({ error: 'Please provide a motion animation prompt.' });
      return;
    }

    const result = await runGeminiImageToVideo({
      prompt,
      aspectRatio,
      imageBase64,
      imageMimeType,
    });
    res.json(result);
  } catch (err) {
    const formatted = formatGeminiApiError(err, 'gemini-omni-1.2-flash');
    res.status(formatted.status).json({ error: formatted.message });
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

  const user = db.prepare('SELECT * FROM users WHERE id = ?').get(order.user_id) as DbUser | undefined;
  if (user) {
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
            ? 'Open the MQL5 EA Bots panel in your GRIDPIPs workspace to download the .mq5 source files, installation guide, and connect your MT5 bridge.'
            : 'Open the ICT Strategy Market Analyzer in your GRIDPIPs workspace to scan live setups.'
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
app.get('/api/analyzer/scan', requireAuth, (req: AuthedRequest, res) => {
  const user = req.currentUser!;
  if (!user.has_analyzer && user.role !== 'admin') {
    res.status(402).json({ error: 'ICT Market Analyzer requires a one-time $5.25 unlock.' });
    return;
  }
  const symbol = sanitizeText(req.query.symbol || 'EURUSD', 12).toUpperCase();
  const timeframe = sanitizeText(req.query.timeframe || 'M15', 8).toUpperCase();
  const settings = getSettingsMap();
  const analysis = runIctMarketAnalysis(symbol, timeframe, settings.ict_youtube_channel_id);
  res.json({ analysis });
});

// ---------------- MQL5 EA Bots & MT5 Bridge ($5.25 Gated) ----------------
app.get('/api/ea/source/:bot', requireAuth, (req: AuthedRequest, res) => {
  const user = req.currentUser!;
  if (!user.has_ea_bots && user.role !== 'admin') {
    res.status(402).json({ error: 'MQL5 EA Bots Pack requires a $5.25 purchase.' });
    return;
  }
  const bot = req.params.bot;
  const appUrl = process.env.APP_URL || `${req.protocol}://${req.get('host')}`;
  if (bot === 'silverbullet') {
    res.json({ filename: 'GRIDPIPs_ICT_SilverBullet_EA.mq5', content: ICT_SILVER_BULLET_MQ5 });
  } else if (bot === 'orderblock') {
    res.json({ filename: 'GRIDPIPs_SMC_OrderBlock_EA.mq5', content: SMC_ORDERBLOCK_MQ5 });
  } else {
    res.json({
      filename: 'INSTALLATION_GUIDE.txt',
      content: buildInstallationGuide(user.name, user.mt5_bridge_token || '', appUrl),
    });
  }
});

app.get('/api/ea/download', requireAuth, async (req: AuthedRequest, res) => {
  const user = req.currentUser!;
  if (!user.has_ea_bots && user.role !== 'admin') {
    res.status(402).json({ error: 'Purchase the MQL5 EA Bots Pack ($5.25) to download source files.' });
    return;
  }

  const appUrl = process.env.APP_URL || `${req.protocol}://${req.get('host')}`;
  const zip = new JSZip();
  zip.file('GRIDPIPs_ICT_SilverBullet_EA.mq5', ICT_SILVER_BULLET_MQ5);
  zip.file('GRIDPIPs_SMC_OrderBlock_EA.mq5', SMC_ORDERBLOCK_MQ5);
  zip.file('INSTALLATION_GUIDE.txt', buildInstallationGuide(user.name, user.mt5_bridge_token || '', appUrl));

  const buffer = await zip.generateAsync({ type: 'nodebuffer' });
  res.setHeader('Content-Type', 'application/zip');
  res.setHeader('Content-Disposition', 'attachment; filename="GRIDPIPs_MQL5_EA_Bots_Pack.zip"');
  res.send(buffer);
});

app.post('/api/ea/mt5/connect', requireAuth, async (req: AuthedRequest, res) => {
  const user = req.currentUser!;
  if (!user.has_ea_bots && user.role !== 'admin') {
    res.status(402).json({ error: 'Purchase the MQL5 EA Bots Pack ($5.25) to connect MT5.' });
    return;
  }
  const mt5Login = sanitizeText(req.body?.mt5Login, 32);
  const mt5Server = sanitizeText(req.body?.mt5Server, 64);
  if (!mt5Login || !mt5Server) {
    res.status(400).json({ error: 'Provide both your MT5 Login ID and Broker Server (e.g. Exness-MT5Real).' });
    return;
  }
  const token = user.mt5_bridge_token || generateSecureToken(16);
  db.prepare(
    "UPDATE users SET mt5_login = ?, mt5_server = ?, mt5_bridge_token = ?, mt5_connected = 1, mt5_last_sync = datetime('now') WHERE id = ?"
  ).run(mt5Login, mt5Server, token, user.id);

  await sendAutomatedEmail({
    to: user.email,
    subject: 'GRIDPIPs MT5 Bridge Connected',
    category: 'mt5_bridge',
    textPreview: `MT5 Account ${mt5Login} on server ${mt5Server} is now linked to your GRIDPIPs EA Bridge.`,
    html: `<p>Your MT5 terminal <strong>${mt5Login}</strong> (${mt5Server}) is connected to GRIDPIPs.</p>`,
  });

  const updated = db.prepare('SELECT * FROM users WHERE id = ?').get(user.id) as DbUser;
  res.json({ user: serializeUser(updated) });
});

app.post('/api/ea/mt5/heartbeat', (req, res) => {
  const token = sanitizeText(req.body?.token, 64);
  const login = sanitizeText(req.body?.login, 32);
  const server = sanitizeText(req.body?.server, 64);
  if (!token) {
    res.status(401).json({ error: 'Missing bridge token' });
    return;
  }
  const user = db.prepare('SELECT id FROM users WHERE mt5_bridge_token = ?').get(token) as { id: number } | undefined;
  if (!user) {
    res.status(403).json({ error: 'Invalid bridge token' });
    return;
  }
  db.prepare(
    "UPDATE users SET mt5_connected = 1, mt5_login = COALESCE(NULLIF(?, ''), mt5_login), mt5_server = COALESCE(NULLIF(?, ''), mt5_server), mt5_last_sync = datetime('now') WHERE id = ?"
  ).run(login, server, user.id);
  res.json({ ok: true, syncedAt: new Date().toISOString() });
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
  const trade = db.prepare('SELECT * FROM journal_trades WHERE id = ?').get(info.lastInsertRowid);
  res.status(201).json({ trade });
});

app.delete('/api/workspace/journal/:id', requireAuth, (req: AuthedRequest, res) => {
  db.prepare('DELETE FROM journal_trades WHERE id = ? AND user_id = ?').run(Number(req.params.id), req.currentUser!.id);
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
  }
  logSecurityEvent('ADMIN_ORDER_UPDATE', 'info', getClientIp(req), req.currentUser!.email, `Order #${orderId} -> ${status}`);
  res.json({ ok: true });
});

app.post('/api/admin/users/:id/update', requireAdmin, (req: AuthedRequest, res) => {
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

  logSecurityEvent('ADMIN_USER_UPDATE', 'warning', getClientIp(req), req.currentUser!.email, `Updated user #${userId}`);
  res.json({ ok: true });
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

export default app;
