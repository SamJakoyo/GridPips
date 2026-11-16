import { db } from './db.ts';
import { getServerSupabaseAdminClient } from './supabaseAuth.ts';

export interface CloudSyncStatus {
  configured: boolean;
  tablesReady: boolean;
  message: string;
}

function isMissingTableError(err: { code?: string; message?: string } | null): boolean {
  if (!err) return false;
  const code = err.code || '';
  const msg = err.message || '';
  return code === 'PGRST205' || code === '42P01' || /does not exist|Could not find the table/i.test(msg);
}

export async function checkCloudSyncTablesHealth(): Promise<CloudSyncStatus> {
  const client = getServerSupabaseAdminClient();
  if (!client) {
    return {
      configured: false,
      tablesReady: false,
      message: 'SUPABASE_SERVICE_ROLE_KEY is required for Cloud DB sync.',
    };
  }

  try {
    const { error } = await client
      .from('gridpips_user_state')
      .select('user_email', { count: 'exact', head: true });
    if (error) {
      if (isMissingTableError(error)) {
        return {
          configured: true,
          tablesReady: false,
          message: 'Run supabase/gridpips_cloud_tables.sql in Supabase SQL Editor to enable Cloud DB persistence for orders, journal, paper trading & MT5 links.',
        };
      }
      return {
        configured: true,
        tablesReady: false,
        message: `Supabase Cloud DB check error: ${error.message}`,
      };
    }
    return {
      configured: true,
      tablesReady: true,
      message: 'Cloud DB tables (orders, journal, paper, plans, MT5 state) are active.',
    };
  } catch (err) {
    return {
      configured: true,
      tablesReady: false,
      message: err instanceof Error ? err.message : 'Cloud DB check failed.',
    };
  }
}

export async function syncUserStateToCloud(userId: number): Promise<void> {
  const client = getServerSupabaseAdminClient();
  if (!client) return;

  try {
    const u = db.prepare('SELECT * FROM users WHERE id = ?').get(userId) as
      | {
          email: string;
          exness_account_id: string;
          exness_verified: number;
          mt5_login: string | null;
          mt5_server: string | null;
          mt5_metaapi_account_id: string | null;
          mt5_metaapi_region: string | null;
          mt5_connected: number;
          mt5_auto_trade: number;
          mt5_active_bot: string | null;
          mt5_risk_percent: number | null;
          mt5_balance: number | null;
          mt5_equity: number | null;
          mt5_open_positions: number | null;
          mt5_status: string | null;
          mt5_last_sync: string | null;
        }
      | undefined;
    if (!u) return;

    const paper = db.prepare('SELECT * FROM paper_accounts WHERE user_id = ?').get(userId) as
      | { balance: number; positions_json: string; history_json: string }
      | undefined;
    const plan = db.prepare('SELECT plan_json FROM trading_plans WHERE user_id = ?').get(userId) as
      | { plan_json: string }
      | undefined;
    const wl = db.prepare('SELECT symbols_json FROM watchlists WHERE user_id = ?').get(userId) as
      | { symbols_json: string }
      | undefined;

    const parseJson = (raw: string | undefined, fallback: unknown) => {
      if (!raw) return fallback;
      try {
        return JSON.parse(raw);
      } catch {
        return fallback;
      }
    };

    const { error } = await client.from('gridpips_user_state').upsert(
      {
        user_email: u.email.toLowerCase(),
        exness_account_id: u.exness_account_id,
        exness_verified: Boolean(u.exness_verified),
        mt5_login: u.mt5_login,
        mt5_server: u.mt5_server,
        mt5_metaapi_account_id: u.mt5_metaapi_account_id,
        mt5_metaapi_region: u.mt5_metaapi_region,
        mt5_connected: Boolean(u.mt5_connected),
        mt5_auto_trade: Boolean(u.mt5_auto_trade),
        mt5_active_bot: u.mt5_active_bot || 'both',
        mt5_risk_percent: Number(u.mt5_risk_percent ?? 1.0),
        mt5_balance: u.mt5_balance ?? null,
        mt5_equity: u.mt5_equity ?? null,
        mt5_open_positions: u.mt5_open_positions ?? 0,
        mt5_status: u.mt5_status ?? null,
        mt5_last_sync: u.mt5_last_sync ? new Date(u.mt5_last_sync).toISOString() : null,
        paper_balance: paper?.balance ?? 10000,
        paper_positions_json: parseJson(paper?.positions_json, []),
        paper_history_json: parseJson(paper?.history_json, []),
        plan_json: parseJson(plan?.plan_json, null),
        watchlist_json: parseJson(wl?.symbols_json, ['EURUSD', 'GBPUSD', 'XAUUSD', 'NAS100', 'BTCUSD']),
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'user_email' }
    );

    if (error && !isMissingTableError(error)) {
      console.warn('Cloud user state sync warning:', error.message);
    }
  } catch (err) {
    console.warn('Cloud user state sync failed:', err instanceof Error ? err.message : String(err));
  }
}

export async function upsertCloudOrder(orderId: number): Promise<void> {
  const client = getServerSupabaseAdminClient();
  if (!client) return;

  try {
    const row = db
      .prepare(
        `SELECT o.*, u.email as user_email
         FROM orders o JOIN users u ON o.user_id = u.id
         WHERE o.id = ?`
      )
      .get(orderId) as
      | {
          order_number: string;
          user_email: string;
          product_key: string;
          product_name: string;
          amount_usd: number;
          amount_kes: number;
          payment_method: string;
          payment_status: string;
          mpesa_phone: string | null;
          mpesa_receipt: string | null;
          mpesa_checkout_id: string | null;
          crypto_currency: string | null;
          crypto_network: string | null;
          crypto_address: string | null;
          crypto_tx_hash: string | null;
          commission_usd: number;
          created_at: string;
          paid_at: string | null;
        }
      | undefined;
    if (!row) return;

    const { error } = await client.from('gridpips_orders').upsert(
      {
        order_number: row.order_number,
        user_email: row.user_email.toLowerCase(),
        product_key: row.product_key,
        product_name: row.product_name,
        amount_usd: row.amount_usd,
        amount_kes: row.amount_kes,
        payment_method: row.payment_method,
        payment_status: row.payment_status,
        mpesa_phone: row.mpesa_phone,
        mpesa_receipt: row.mpesa_receipt,
        mpesa_checkout_id: row.mpesa_checkout_id,
        crypto_currency: row.crypto_currency,
        crypto_network: row.crypto_network,
        crypto_address: row.crypto_address,
        crypto_tx_hash: row.crypto_tx_hash,
        commission_usd: row.commission_usd,
        created_at: row.created_at ? new Date(row.created_at).toISOString() : new Date().toISOString(),
        paid_at: row.paid_at ? new Date(row.paid_at).toISOString() : null,
      },
      { onConflict: 'order_number' }
    );
    if (error && !isMissingTableError(error)) {
      console.warn('Cloud order upsert warning:', error.message);
    }
  } catch (err) {
    console.warn('Cloud order sync failed:', err instanceof Error ? err.message : String(err));
  }
}

export async function insertCloudJournalTrade(userEmail: string, trade: {
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
}): Promise<void> {
  const client = getServerSupabaseAdminClient();
  if (!client) return;

  try {
    const clientRef = `${userEmail.toLowerCase()}::${trade.trade_date}::${trade.instrument}::${trade.id}`;
    const { error } = await client.from('gridpips_journal_trades').upsert(
      {
        client_ref: clientRef,
        user_email: userEmail.toLowerCase(),
        instrument: trade.instrument,
        side: trade.side,
        entry_price: trade.entry_price,
        sl: trade.sl,
        tp: trade.tp,
        size: trade.size,
        risk_pct: trade.risk_pct,
        rr: trade.rr,
        pnl: trade.pnl,
        trade_date: trade.trade_date,
        session: trade.session,
        strategy: trade.strategy,
        reason_entry: trade.reason_entry,
        reason_exit: trade.reason_exit,
        lessons: trade.lessons,
        image_data: trade.image_data,
        created_at: new Date().toISOString(),
      },
      { onConflict: 'client_ref' }
    );
    if (error && !isMissingTableError(error)) {
      console.warn('Cloud journal upsert warning:', error.message);
    }
  } catch {
    // non-fatal
  }
}

export async function deleteCloudJournalTrade(
  userEmail: string,
  trade: { id: number; instrument: string; trade_date: string }
): Promise<void> {
  const client = getServerSupabaseAdminClient();
  if (!client) return;
  try {
    const clientRef = `${userEmail.toLowerCase()}::${trade.trade_date}::${trade.instrument}::${trade.id}`;
    await client.from('gridpips_journal_trades').delete().eq('client_ref', clientRef);
  } catch {
    // non-fatal
  }
}

export async function insertCloudMt5Command(userEmail: string, cmdId: number): Promise<void> {
  const client = getServerSupabaseAdminClient();
  if (!client) return;

  try {
    const row = db.prepare('SELECT * FROM mt5_trade_commands WHERE id = ?').get(cmdId) as
      | {
          id: number;
          symbol: string;
          side: string;
          volume: number;
          stop_loss: number | null;
          take_profit: number | null;
          source_ea: string;
          execution_mode: string;
          status: string;
          external_order_id: string | null;
          error_message: string | null;
          created_at: string;
          executed_at: string | null;
        }
      | undefined;
    if (!row) return;

    const clientRef = `${userEmail.toLowerCase()}::cmd::${row.external_order_id || row.id}`;
    const { error } = await client.from('gridpips_mt5_commands').upsert(
      {
        client_ref: clientRef,
        user_email: userEmail.toLowerCase(),
        symbol: row.symbol,
        side: row.side,
        volume: row.volume,
        stop_loss: row.stop_loss,
        take_profit: row.take_profit,
        source_ea: row.source_ea,
        execution_mode: row.execution_mode,
        status: row.status,
        external_order_id: row.external_order_id,
        error_message: row.error_message,
        created_at: row.created_at ? new Date(row.created_at).toISOString() : new Date().toISOString(),
        executed_at: row.executed_at ? new Date(row.executed_at).toISOString() : null,
      },
      { onConflict: 'client_ref' }
    );
    if (error && !isMissingTableError(error)) {
      console.warn('Cloud MT5 command sync warning:', error.message);
    }
  } catch {
    // non-fatal
  }
}

export async function hydrateUserFromCloud(userId: number, email: string): Promise<void> {
  const client = getServerSupabaseAdminClient();
  if (!client) return;
  const cleanEmail = email.toLowerCase();

  try {
    const { data: state, error: stateErr } = await client
      .from('gridpips_user_state')
      .select('*')
      .eq('user_email', cleanEmail)
      .maybeSingle();

    if (stateErr) {
      if (!isMissingTableError(stateErr)) {
        console.warn('Cloud hydrate state warning:', stateErr.message);
      }
      return;
    }

    if (state) {
      const localUser = db.prepare('SELECT mt5_connected, mt5_metaapi_account_id FROM users WHERE id = ?').get(userId) as
        | { mt5_connected: number; mt5_metaapi_account_id: string | null }
        | undefined;

      if (localUser && !localUser.mt5_metaapi_account_id && state.mt5_metaapi_account_id) {
        db.prepare(
          `UPDATE users SET
            mt5_login = COALESCE(?, mt5_login),
            mt5_server = COALESCE(?, mt5_server),
            mt5_metaapi_account_id = ?,
            mt5_metaapi_region = COALESCE(?, mt5_metaapi_region),
            mt5_connected = ?,
            mt5_auto_trade = ?,
            mt5_active_bot = COALESCE(?, mt5_active_bot),
            mt5_risk_percent = COALESCE(?, mt5_risk_percent),
            mt5_balance = COALESCE(?, mt5_balance),
            mt5_equity = COALESCE(?, mt5_equity),
            mt5_open_positions = COALESCE(?, mt5_open_positions),
            mt5_status = COALESCE(?, mt5_status),
            mt5_last_sync = COALESCE(?, mt5_last_sync)
           WHERE id = ?`
        ).run(
          state.mt5_login,
          state.mt5_server,
          state.mt5_metaapi_account_id,
          state.mt5_metaapi_region,
          state.mt5_connected ? 1 : 0,
          state.mt5_auto_trade ? 1 : 0,
          state.mt5_active_bot,
          state.mt5_risk_percent,
          state.mt5_balance,
          state.mt5_equity,
          state.mt5_open_positions ?? 0,
          state.mt5_status,
          state.mt5_last_sync,
          userId
        );
      }

      const existingPaper = db.prepare('SELECT positions_json, history_json FROM paper_accounts WHERE user_id = ?').get(userId) as
        | { positions_json: string; history_json: string }
        | undefined;
      if (
        (!existingPaper || (existingPaper.positions_json === '[]' && existingPaper.history_json === '[]')) &&
        (Array.isArray(state.paper_positions_json) || Array.isArray(state.paper_history_json))
      ) {
        db.prepare(
          `INSERT INTO paper_accounts (user_id, balance, positions_json, history_json, updated_at)
           VALUES (?, ?, ?, ?, datetime('now'))
           ON CONFLICT(user_id) DO UPDATE SET
             balance = excluded.balance,
             positions_json = excluded.positions_json,
             history_json = excluded.history_json,
             updated_at = datetime('now')`
        ).run(
          userId,
          Number(state.paper_balance ?? 10000),
          JSON.stringify(state.paper_positions_json || []),
          JSON.stringify(state.paper_history_json || [])
        );
      }

      if (state.plan_json) {
        db.prepare(
          `INSERT OR IGNORE INTO trading_plans (user_id, plan_json, updated_at) VALUES (?, ?, datetime('now'))`
        ).run(userId, JSON.stringify(state.plan_json));
      }

      if (Array.isArray(state.watchlist_json) && state.watchlist_json.length > 0) {
        db.prepare(
          `INSERT OR IGNORE INTO watchlists (user_id, symbols_json, updated_at) VALUES (?, ?, datetime('now'))`
        ).run(userId, JSON.stringify(state.watchlist_json));
      }
    }

    // Hydrate orders if missing locally
    const localOrdersCount = (
      db.prepare('SELECT COUNT(*) as cnt FROM orders WHERE user_id = ?').get(userId) as { cnt: number }
    ).cnt;
    if (localOrdersCount === 0) {
      const { data: cloudOrders } = await client
        .from('gridpips_orders')
        .select('*')
        .eq('user_email', cleanEmail)
        .order('created_at', { ascending: false })
        .limit(50);
      if (Array.isArray(cloudOrders) && cloudOrders.length > 0) {
        const insOrder = db.prepare(
          `INSERT OR IGNORE INTO orders (
            order_number, user_id, product_key, product_name, amount_usd, amount_kes,
            payment_method, payment_status, mpesa_phone, mpesa_receipt, mpesa_checkout_id,
            crypto_currency, crypto_network, crypto_address, crypto_tx_hash, commission_usd,
            created_at, paid_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
        );
        for (const o of cloudOrders) {
          insOrder.run(
            o.order_number,
            userId,
            o.product_key,
            o.product_name,
            o.amount_usd,
            o.amount_kes ?? 0,
            o.payment_method,
            o.payment_status,
            o.mpesa_phone,
            o.mpesa_receipt,
            o.mpesa_checkout_id,
            o.crypto_currency,
            o.crypto_network,
            o.crypto_address,
            o.crypto_tx_hash,
            o.commission_usd ?? 0,
            o.created_at || new Date().toISOString(),
            o.paid_at
          );
          if (o.payment_status === 'paid') {
            if (o.product_key === 'analyzer') {
              db.prepare('UPDATE users SET has_analyzer = 1 WHERE id = ?').run(userId);
            } else if (o.product_key === 'ea_bots') {
              db.prepare('UPDATE users SET has_ea_bots = 1 WHERE id = ?').run(userId);
            }
          }
        }
      }
    }

    // Hydrate journal trades if missing locally
    const localJournalCount = (
      db.prepare('SELECT COUNT(*) as cnt FROM journal_trades WHERE user_id = ?').get(userId) as { cnt: number }
    ).cnt;
    if (localJournalCount === 0) {
      const { data: cloudTrades } = await client
        .from('gridpips_journal_trades')
        .select('*')
        .eq('user_email', cleanEmail)
        .order('created_at', { ascending: false })
        .limit(100);
      if (Array.isArray(cloudTrades) && cloudTrades.length > 0) {
        const insTrade = db.prepare(
          `INSERT INTO journal_trades (
            user_id, instrument, side, entry_price, sl, tp, size, risk_pct, rr, pnl,
            trade_date, session, strategy, reason_entry, reason_exit, lessons, image_data, created_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
        );
        for (const t of [...cloudTrades].reverse()) {
          insTrade.run(
            userId,
            t.instrument,
            t.side,
            t.entry_price,
            t.sl,
            t.tp,
            t.size,
            t.risk_pct,
            t.rr,
            t.pnl,
            t.trade_date,
            t.session,
            t.strategy,
            t.reason_entry,
            t.reason_exit,
            t.lessons,
            t.image_data,
            t.created_at || new Date().toISOString()
          );
        }
      }
    }

    // Hydrate MT5 commands if missing locally
    const localCmdCount = (
      db.prepare('SELECT COUNT(*) as cnt FROM mt5_trade_commands WHERE user_id = ?').get(userId) as { cnt: number }
    ).cnt;
    if (localCmdCount === 0) {
      const { data: cloudCmds } = await client
        .from('gridpips_mt5_commands')
        .select('*')
        .eq('user_email', cleanEmail)
        .order('created_at', { ascending: false })
        .limit(30);
      if (Array.isArray(cloudCmds) && cloudCmds.length > 0) {
        const insCmd = db.prepare(
          `INSERT INTO mt5_trade_commands (
            user_id, symbol, side, volume, stop_loss, take_profit, source_ea,
            execution_mode, status, external_order_id, error_message, created_at, executed_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
        );
        for (const c of [...cloudCmds].reverse()) {
          insCmd.run(
            userId,
            c.symbol,
            c.side,
            c.volume,
            c.stop_loss,
            c.take_profit,
            c.source_ea,
            c.execution_mode,
            c.status,
            c.external_order_id,
            c.error_message,
            c.created_at || new Date().toISOString(),
            c.executed_at
          );
        }
      }
    }
  } catch (err) {
    console.warn('Cloud hydration warning:', err instanceof Error ? err.message : String(err));
  }
}
