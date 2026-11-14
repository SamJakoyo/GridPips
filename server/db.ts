import Database from 'better-sqlite3';
import path from 'node:path';
import { hashPassword, generateSecureToken } from './security.ts';

const dbPath = process.env.VERCEL
  ? path.join('/tmp', 'gridpips.db')
  : path.resolve(process.cwd(), 'gridpips.db');
export const db = new Database(dbPath);

db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

export function initDatabase(): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      email TEXT NOT NULL UNIQUE,
      password_hash TEXT NOT NULL,
      role TEXT NOT NULL DEFAULT 'user',
      exness_account_id TEXT NOT NULL,
      exness_email TEXT,
      exness_verified INTEGER NOT NULL DEFAULT 1,
      referral_code TEXT NOT NULL UNIQUE,
      referred_by INTEGER,
      has_analyzer INTEGER NOT NULL DEFAULT 0,
      has_ea_bots INTEGER NOT NULL DEFAULT 0,
      mt5_login TEXT,
      mt5_server TEXT,
      mt5_bridge_token TEXT,
      mt5_connected INTEGER NOT NULL DEFAULT 0,
      mt5_last_sync TEXT,
      is_suspended INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      last_login_at TEXT
    );

    CREATE TABLE IF NOT EXISTS orders (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      order_number TEXT NOT NULL UNIQUE,
      user_id INTEGER NOT NULL,
      product_key TEXT NOT NULL,
      product_name TEXT NOT NULL,
      amount_usd REAL NOT NULL,
      amount_kes REAL NOT NULL DEFAULT 0,
      payment_method TEXT NOT NULL,
      payment_status TEXT NOT NULL DEFAULT 'pending',
      mpesa_phone TEXT,
      mpesa_receipt TEXT,
      mpesa_checkout_id TEXT,
      crypto_currency TEXT,
      crypto_network TEXT,
      crypto_address TEXT,
      crypto_tx_hash TEXT,
      referrer_id INTEGER,
      commission_usd REAL NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      paid_at TEXT,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS journal_trades (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      instrument TEXT NOT NULL,
      side TEXT NOT NULL,
      entry_price REAL,
      sl REAL,
      tp REAL,
      size REAL,
      risk_pct REAL,
      rr REAL,
      pnl REAL NOT NULL,
      trade_date TEXT NOT NULL,
      session TEXT,
      strategy TEXT,
      reason_entry TEXT,
      reason_exit TEXT,
      lessons TEXT,
      image_data TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS paper_accounts (
      user_id INTEGER PRIMARY KEY,
      balance REAL NOT NULL DEFAULT 10000,
      positions_json TEXT NOT NULL DEFAULT '[]',
      history_json TEXT NOT NULL DEFAULT '[]',
      updated_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS trading_plans (
      user_id INTEGER PRIMARY KEY,
      plan_json TEXT NOT NULL,
      updated_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS watchlists (
      user_id INTEGER PRIMARY KEY,
      symbols_json TEXT NOT NULL,
      updated_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS referral_clicks (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      referral_code TEXT NOT NULL,
      source_page TEXT,
      ip_address TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS payout_requests (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      amount_usd REAL NOT NULL,
      method TEXT NOT NULL,
      destination TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'pending',
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      processed_at TEXT,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS email_logs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      recipient_email TEXT NOT NULL,
      subject TEXT NOT NULL,
      body_preview TEXT NOT NULL,
      category TEXT NOT NULL,
      delivery_status TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS security_logs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      event_type TEXT NOT NULL,
      severity TEXT NOT NULL,
      ip_address TEXT,
      user_email TEXT,
      details TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS site_settings (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL
    );
  `);

  const orderCols = (db.prepare('PRAGMA table_info(orders)').all() as Array<{ name: string }>).map((c) => c.name);
  if (!orderCols.includes('mpesa_phone')) db.exec('ALTER TABLE orders ADD COLUMN mpesa_phone TEXT');
  if (!orderCols.includes('mpesa_receipt')) db.exec('ALTER TABLE orders ADD COLUMN mpesa_receipt TEXT');
  if (!orderCols.includes('mpesa_checkout_id')) db.exec('ALTER TABLE orders ADD COLUMN mpesa_checkout_id TEXT');

  const defaultSettings: Record<string, string> = {
    exness_ib_url: 'https://one.exnessonelink.com/a/0p67hxlswg?source=app',
    telegram_url: 'https://t.me/JakoyoFx',
    ict_youtube_channel_id: 'UCtjxa77NqamhVC8atV85Rog',
    analyzer_price_usd: '5.25',
    ea_bots_price_usd: '5.25',
    usd_kes_rate: '130',
    mpesa_till_number: '5984120',
    mpesa_merchant_name: 'GRIDPIPs Trading',
    megapay_api_url: 'https://megapay.co.ke/api/v1/initiatestk',
    influencer_commission_pct: '20',
    usdt_trc20_address: 'TX9kGridPipsUSDT7xR8mN4vQ2wK9pL3zF1',
    usdt_erc20_address: '0x71C9GridPips4E8A9B2F1D3c0E6a8b7d9F2a1C',
    btc_address: 'bc1qgridpips8v9k2x4m7n0p3q5r6s8t9w',
  };

  const insertSetting = db.prepare('INSERT OR IGNORE INTO site_settings (key, value) VALUES (?, ?)');
  for (const [key, value] of Object.entries(defaultSettings)) {
    insertSetting.run(key, value);
  }

  // Seed default Admin account for site owner if not yet created
  const adminEmail = (process.env.ADMIN_EMAIL || 'samjakoyo26@gmail.com').toLowerCase();
  const existingAdmin = db.prepare('SELECT id FROM users WHERE email = ?').get(adminEmail);
  if (!existingAdmin) {
    const initialPassword = process.env.ADMIN_INITIAL_PASSWORD || 'GRIDPIPsAdmin#2026!';
    const info = db
      .prepare(
        `INSERT INTO users (name, email, password_hash, role, exness_account_id, exness_verified, referral_code, has_analyzer, has_ea_bots, mt5_bridge_token)
         VALUES (?, ?, ?, 'admin', ?, 1, ?, 1, 1, ?)`
      )
      .run(
        'Sam Jakoyo (Admin)',
        adminEmail,
        hashPassword(initialPassword),
        'EXN-JAKOYO-001',
        'JAKOYO',
        generateSecureToken(16)
      );
    const adminId = Number(info.lastInsertRowid);
    db.prepare('INSERT OR IGNORE INTO paper_accounts (user_id, balance) VALUES (?, 10000)').run(adminId);
    db.prepare('INSERT OR IGNORE INTO watchlists (user_id, symbols_json) VALUES (?, ?)').run(
      adminId,
      JSON.stringify(['EURUSD', 'GBPUSD', 'XAUUSD', 'NAS100', 'BTCUSD'])
    );
  }
}

export function getSettingsMap(): Record<string, string> {
  const rows = db.prepare('SELECT key, value FROM site_settings').all() as Array<{ key: string; value: string }>;
  const map: Record<string, string> = {};
  for (const r of rows) {
    map[r.key] = r.value;
  }
  return map;
}

export function logSecurityEvent(
  eventType: string,
  severity: 'info' | 'warning' | 'critical',
  ipAddress: string,
  userEmail: string | null,
  details: string
): void {
  db.prepare(
    'INSERT INTO security_logs (event_type, severity, ip_address, user_email, details) VALUES (?, ?, ?, ?, ?)'
  ).run(eventType, severity, ipAddress, userEmail, details);
}
