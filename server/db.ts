import Database from 'better-sqlite3';
import path from 'node:path';
import { hashPassword, generateSecureToken } from './security.ts';

const dbPath = process.env.VERCEL
  ? path.join('/tmp', 'gridpips.db')
  : path.resolve(process.cwd(), 'gridpips.db');
export const db = new Database(dbPath);

try {
  db.pragma('journal_mode = WAL');
} catch (err) {
  console.warn('SQLite WAL mode skipped:', err instanceof Error ? err.message : String(err));
}
db.pragma('foreign_keys = ON');

export function initDatabase(): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      supabase_uid TEXT,
      name TEXT NOT NULL,
      email TEXT NOT NULL UNIQUE,
      password_hash TEXT NOT NULL,
      role TEXT NOT NULL DEFAULT 'user',
      exness_account_id TEXT NOT NULL,
      exness_email TEXT,
      exness_verified INTEGER NOT NULL DEFAULT 0,
      referral_code TEXT NOT NULL UNIQUE,
      referred_by INTEGER,
      has_analyzer INTEGER NOT NULL DEFAULT 0,
      has_ea_bots INTEGER NOT NULL DEFAULT 0,
      wallet_balance_kes REAL NOT NULL DEFAULT 0,
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
      mpesa_merchant_request_id TEXT,
      mpesa_result_code TEXT,
      mpesa_result_desc TEXT,
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

    CREATE TABLE IF NOT EXISTS saved_setups (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      symbol TEXT NOT NULL,
      timeframe TEXT NOT NULL,
      bias TEXT NOT NULL,
      entry_zone TEXT NOT NULL,
      stop_loss REAL NOT NULL,
      tp1 REAL NOT NULL,
      notes TEXT NOT NULL DEFAULT '',
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS strategy_playbooks (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      title TEXT NOT NULL,
      pair TEXT NOT NULL,
      timeframe TEXT NOT NULL,
      rules_summary TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS media_creations (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      kind TEXT NOT NULL,
      model TEXT NOT NULL,
      prompt TEXT NOT NULL,
      aspect_ratio TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS mt5_telemetry_events (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      ea_name TEXT NOT NULL,
      symbol TEXT NOT NULL,
      status TEXT NOT NULL,
      balance REAL NOT NULL DEFAULT 0,
      equity REAL NOT NULL DEFAULT 0,
      open_positions INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS mt5_trade_commands (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      symbol TEXT NOT NULL,
      side TEXT NOT NULL,
      volume REAL NOT NULL DEFAULT 0.01,
      stop_loss REAL,
      take_profit REAL,
      source_ea TEXT NOT NULL,
      execution_mode TEXT NOT NULL DEFAULT 'bridge',
      status TEXT NOT NULL DEFAULT 'queued',
      external_order_id TEXT,
      error_message TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      executed_at TEXT,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS mpesa_transactions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      tx_reference TEXT NOT NULL UNIQUE,
      user_id INTEGER NOT NULL,
      order_id INTEGER,
      purpose TEXT NOT NULL DEFAULT 'wallet_deposit',
      business_short_code TEXT NOT NULL,
      party_b TEXT NOT NULL,
      transaction_type TEXT NOT NULL DEFAULT 'CustomerBuyGoodsOnline',
      phone_number TEXT NOT NULL,
      amount_kes REAL NOT NULL,
      merchant_request_id TEXT,
      checkout_request_id TEXT UNIQUE,
      mpesa_receipt_number TEXT UNIQUE,
      result_code TEXT,
      result_desc TEXT,
      status TEXT NOT NULL DEFAULT 'pending',
      credited_to_wallet INTEGER NOT NULL DEFAULT 0,
      transaction_date TEXT,
      callback_received_at TEXT,
      source_ip TEXT,
      raw_callback_json TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    );
  `);

  const userCols = (db.prepare('PRAGMA table_info(users)').all() as Array<{ name: string }>).map((c) => c.name);
  if (!userCols.includes('supabase_uid')) db.exec('ALTER TABLE users ADD COLUMN supabase_uid TEXT');
  if (!userCols.includes('wallet_balance_kes')) db.exec('ALTER TABLE users ADD COLUMN wallet_balance_kes REAL NOT NULL DEFAULT 0');
  if (!userCols.includes('mt5_balance')) db.exec('ALTER TABLE users ADD COLUMN mt5_balance REAL');
  if (!userCols.includes('mt5_equity')) db.exec('ALTER TABLE users ADD COLUMN mt5_equity REAL');
  if (!userCols.includes('mt5_symbol')) db.exec('ALTER TABLE users ADD COLUMN mt5_symbol TEXT');
  if (!userCols.includes('mt5_ea_name')) db.exec('ALTER TABLE users ADD COLUMN mt5_ea_name TEXT');
  if (!userCols.includes('mt5_open_positions')) db.exec('ALTER TABLE users ADD COLUMN mt5_open_positions INTEGER DEFAULT 0');
  if (!userCols.includes('mt5_status')) db.exec('ALTER TABLE users ADD COLUMN mt5_status TEXT');
  if (!userCols.includes('mt5_metaapi_account_id')) db.exec('ALTER TABLE users ADD COLUMN mt5_metaapi_account_id TEXT');
  if (!userCols.includes('mt5_metaapi_region')) db.exec('ALTER TABLE users ADD COLUMN mt5_metaapi_region TEXT');
  if (!userCols.includes('mt5_auto_trade')) db.exec('ALTER TABLE users ADD COLUMN mt5_auto_trade INTEGER NOT NULL DEFAULT 0');
  if (!userCols.includes('mt5_active_bot')) db.exec("ALTER TABLE users ADD COLUMN mt5_active_bot TEXT DEFAULT 'both'");
  if (!userCols.includes('mt5_risk_percent')) db.exec('ALTER TABLE users ADD COLUMN mt5_risk_percent REAL DEFAULT 1.0');
  if (!userCols.includes('mt5_connection_mode')) db.exec("ALTER TABLE users ADD COLUMN mt5_connection_mode TEXT DEFAULT 'metaapi'");

  const orderCols = (db.prepare('PRAGMA table_info(orders)').all() as Array<{ name: string }>).map((c) => c.name);
  if (!orderCols.includes('mpesa_phone')) db.exec('ALTER TABLE orders ADD COLUMN mpesa_phone TEXT');
  if (!orderCols.includes('mpesa_receipt')) db.exec('ALTER TABLE orders ADD COLUMN mpesa_receipt TEXT');
  if (!orderCols.includes('mpesa_checkout_id')) db.exec('ALTER TABLE orders ADD COLUMN mpesa_checkout_id TEXT');
  if (!orderCols.includes('mpesa_merchant_request_id'))
    db.exec('ALTER TABLE orders ADD COLUMN mpesa_merchant_request_id TEXT');
  if (!orderCols.includes('mpesa_result_code')) db.exec('ALTER TABLE orders ADD COLUMN mpesa_result_code TEXT');
  if (!orderCols.includes('mpesa_result_desc')) db.exec('ALTER TABLE orders ADD COLUMN mpesa_result_desc TEXT');

  const defaultSettings: Record<string, string> = {
    exness_ib_url: 'https://one.exnessonelink.com/a/0p67hxlswg?source=app',
    telegram_url: 'https://t.me/JakoyoFx',
    ict_youtube_channel_id: 'UCtjxa77NqamhVC8atV85Rog',
    analyzer_price_usd: '5.25',
    ea_bots_price_usd: '5.25',
    usd_kes_rate: '130',
    mpesa_till_number: '1921416',
    mpesa_party_b: '1921416',
    mpesa_transaction_type: 'CustomerBuyGoodsOnline',
    mpesa_merchant_name: 'AURVIK ENTERPRISES',
    influencer_commission_pct: '20',
    usdt_trc20_address: 'TDqm7SGqyDT5p9YrrHYmzwh9zPDo1y4AQJ',
    usdt_erc20_address: '0x7ac8dd858f3154d83114d7134a85924fdbb22234',
    btc_address: '13JdKdY8s8iVf5PAwy7popMHCqKvZsSrjD',
  };

  const insertSetting = db.prepare('INSERT OR IGNORE INTO site_settings (key, value) VALUES (?, ?)');
  for (const [key, value] of Object.entries(defaultSettings)) {
    insertSetting.run(key, value);
  }
  // Migrate legacy placeholder till number (5984120) to user's Buy Goods Till 1921416
  db.prepare("UPDATE site_settings SET value = '1921416' WHERE key IN ('mpesa_till_number', 'mpesa_party_b') AND value = '5984120'").run();
  db.prepare("UPDATE site_settings SET value = 'AURVIK ENTERPRISES' WHERE key = 'mpesa_merchant_name' AND (value = 'GRIDPIPs Trading' OR value = '')").run();
  // Migrate legacy placeholder crypto addresses to configured real deposit addresses
  db.prepare("UPDATE site_settings SET value = 'TDqm7SGqyDT5p9YrrHYmzwh9zPDo1y4AQJ' WHERE key = 'usdt_trc20_address' AND (value = 'TX9kGridPipsUSDT7xR8mN4vQ2wK9pL3zF1' OR value = '')").run();
  db.prepare("UPDATE site_settings SET value = '0x7ac8dd858f3154d83114d7134a85924fdbb22234' WHERE key = 'usdt_erc20_address' AND (value = '0x71C9GridPips4E8A9B2F1D3c0E6a8b7d9F2a1C' OR value = '')").run();
  db.prepare("UPDATE site_settings SET value = '13JdKdY8s8iVf5PAwy7popMHCqKvZsSrjD' WHERE key = 'btc_address' AND (value = 'bc1qgridpips8v9k2x4m7n0p3q5r6s8t9w' OR value = '')").run();

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
