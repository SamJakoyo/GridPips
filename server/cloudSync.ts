import { db } from './db.ts';
import { hashPassword, generateSecureToken } from './security.ts';
import { fetchSupabaseProfileByEmail, getServerSupabaseAdminClient } from './supabaseAuth.ts';

export interface CloudSyncStatus {
  configured: boolean;
  tablesReady: boolean;
  missingTables?: string[];
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
    const tablesToCheck = [
      { name: 'gridpips_user_state', col: 'user_email' },
      { name: 'gridpips_orders', col: 'order_number' },
      { name: 'gridpips_mpesa_transactions', col: 'tx_reference' },
    ];
    const results = await Promise.all(
      tablesToCheck.map(async (t) => {
        const { error } = await client.from(t.name).select(t.col, { count: 'exact', head: true });
        return { name: t.name, error };
      })
    );
    const missingTables = results.filter((r) => isMissingTableError(r.error)).map((r) => r.name);
    const otherError = results.find((r) => r.error && !isMissingTableError(r.error))?.error;

    if (missingTables.length > 0) {
      return {
        configured: true,
        tablesReady: false,
        missingTables,
        message: `Run supabase/gridpips_cloud_tables.sql in Supabase SQL Editor to create: ${missingTables.join(', ')}.`,
      };
    }
    if (otherError) {
      return {
        configured: true,
        tablesReady: false,
        message: `Supabase Cloud DB check error: ${otherError.message}`,
      };
    }
    return {
      configured: true,
      tablesReady: true,
      missingTables: [],
      message: 'Cloud DB tables (user state, orders, journal, MT5 & M-Pesa ledger) are active.',
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
        wallet_balance_kes: Number((u as { wallet_balance_kes?: number }).wallet_balance_kes ?? 0),
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

export async function upsertCloudMpesaTransaction(txId: number): Promise<void> {
  const client = getServerSupabaseAdminClient();
  if (!client) return;

  try {
    const row = db
      .prepare(
        `SELECT m.*, u.email as user_email
         FROM mpesa_transactions m JOIN users u ON m.user_id = u.id
         WHERE m.id = ?`
      )
      .get(txId) as
      | {
          tx_reference: string;
          user_email: string;
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
          status: string;
          credited_to_wallet: number;
          transaction_date: string | null;
          callback_received_at: string | null;
          source_ip: string | null;
          created_at: string;
          updated_at: string;
        }
      | undefined;
    if (!row) return;

    const { error } = await client.from('gridpips_mpesa_transactions').upsert(
      {
        tx_reference: row.tx_reference,
        user_email: row.user_email.toLowerCase(),
        purpose: row.purpose,
        business_short_code: row.business_short_code,
        party_b: row.party_b,
        transaction_type: row.transaction_type,
        phone_number: row.phone_number,
        amount_kes: row.amount_kes,
        merchant_request_id: row.merchant_request_id,
        checkout_request_id: row.checkout_request_id,
        mpesa_receipt_number: row.mpesa_receipt_number,
        result_code: row.result_code,
        result_desc: row.result_desc,
        status: row.status,
        credited_to_wallet: Boolean(row.credited_to_wallet),
        transaction_date: row.transaction_date,
        callback_received_at: row.callback_received_at
          ? new Date(row.callback_received_at).toISOString()
          : null,
        source_ip: row.source_ip,
        created_at: row.created_at ? new Date(row.created_at).toISOString() : new Date().toISOString(),
        updated_at: row.updated_at ? new Date(row.updated_at).toISOString() : new Date().toISOString(),
      },
      { onConflict: 'tx_reference' }
    );
    if (error && !isMissingTableError(error)) {
      console.warn('Cloud M-Pesa transaction sync warning:', error.message);
    }
  } catch (err) {
    console.warn('Cloud M-Pesa transaction sync failed:', err instanceof Error ? err.message : String(err));
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
          mpesa_merchant_request_id?: string | null;
          mpesa_result_code?: string | null;
          mpesa_result_desc?: string | null;
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
        mpesa_merchant_request_id: row.mpesa_merchant_request_id ?? null,
        mpesa_result_code: row.mpesa_result_code ?? null,
        mpesa_result_desc: row.mpesa_result_desc ?? null,
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

      if (typeof state.wallet_balance_kes === 'number' && state.wallet_balance_kes >= 0) {
        db.prepare('UPDATE users SET wallet_balance_kes = ? WHERE id = ?').run(
          Number(state.wallet_balance_kes),
          userId
        );
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
            mpesa_merchant_request_id, mpesa_result_code, mpesa_result_desc,
            crypto_currency, crypto_network, crypto_address, crypto_tx_hash, commission_usd,
            created_at, paid_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
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
            o.mpesa_merchant_request_id ?? null,
            o.mpesa_result_code ?? null,
            o.mpesa_result_desc ?? null,
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

    // Hydrate user's M-Pesa STK transactions from cloud
    const { data: cloudMpesa } = await client
      .from('gridpips_mpesa_transactions')
      .select('*')
      .eq('user_email', cleanEmail)
      .order('created_at', { ascending: false })
      .limit(50);
    if (Array.isArray(cloudMpesa) && cloudMpesa.length > 0) {
      const upsertTx = db.prepare(
        `INSERT INTO mpesa_transactions (
          tx_reference, user_id, order_id, purpose, business_short_code, party_b, transaction_type,
          phone_number, amount_kes, merchant_request_id, checkout_request_id, mpesa_receipt_number,
          result_code, result_desc, status, credited_to_wallet, transaction_date, callback_received_at,
          source_ip, created_at, updated_at
        ) VALUES (?, ?, NULL, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(tx_reference) DO UPDATE SET
          mpesa_receipt_number = COALESCE(excluded.mpesa_receipt_number, mpesa_transactions.mpesa_receipt_number),
          result_code = COALESCE(excluded.result_code, mpesa_transactions.result_code),
          result_desc = COALESCE(excluded.result_desc, mpesa_transactions.result_desc),
          status = CASE
            WHEN mpesa_transactions.status = 'completed' THEN 'completed'
            ELSE excluded.status
          END,
          credited_to_wallet = MAX(mpesa_transactions.credited_to_wallet, excluded.credited_to_wallet),
          updated_at = datetime('now')`
      );
      for (const m of cloudMpesa) {
        upsertTx.run(
          m.tx_reference,
          userId,
          m.purpose || 'wallet_deposit',
          m.business_short_code || '1443082',
          m.party_b || '1921416',
          m.transaction_type || 'CustomerBuyGoodsOnline',
          m.phone_number || '',
          Number(m.amount_kes || 0),
          m.merchant_request_id ?? null,
          m.checkout_request_id ?? null,
          m.mpesa_receipt_number ?? null,
          m.result_code ?? null,
          m.result_desc ?? null,
          m.status || 'pending',
          m.credited_to_wallet ? 1 : 0,
          m.transaction_date ?? null,
          m.callback_received_at ?? null,
          m.source_ip ?? null,
          m.created_at || new Date().toISOString(),
          m.updated_at || new Date().toISOString()
        );
      }
    }
  } catch (err) {
    console.warn('Cloud hydration warning:', err instanceof Error ? err.message : String(err));
  }
}

async function ensureLocalMirrorUserByEmail(email: string): Promise<number | null> {
  const cleanEmail = email.toLowerCase();
  const existing = db.prepare('SELECT id FROM users WHERE email = ?').get(cleanEmail) as
    | { id: number }
    | undefined;
  if (existing) return existing.id;

  const { profile } = await fetchSupabaseProfileByEmail(cleanEmail).catch(() => ({ profile: null }));
  const refCode =
    profile?.referral_code ||
    `TRADER${Math.floor(100 + Math.random() * 899)}${Date.now().toString(36).slice(-2).toUpperCase()}`;

  const info = db
    .prepare(
      `INSERT INTO users (
        supabase_uid, name, email, password_hash, role, exness_account_id, exness_email,
        exness_verified, referral_code, has_analyzer, has_ea_bots, mt5_bridge_token
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    )
    .run(
      profile?.id ?? null,
      profile?.full_name || cleanEmail.split('@')[0] || 'Trader',
      cleanEmail,
      hashPassword(generateSecureToken(24)),
      profile?.role || 'user',
      profile?.exness_account_id || 'EXN-PENDING',
      cleanEmail,
      profile?.exness_verified ? 1 : 0,
      refCode,
      profile?.has_analyzer ? 1 : 0,
      profile?.has_ea_bots ? 1 : 0,
      generateSecureToken(16)
    );
  const newUserId = Number(info.lastInsertRowid);
  db.prepare('INSERT OR IGNORE INTO paper_accounts (user_id, balance) VALUES (?, 10000)').run(newUserId);

  const client = getServerSupabaseAdminClient();
  if (client) {
    const { data: state } = await client
      .from('gridpips_user_state')
      .select('wallet_balance_kes')
      .eq('user_email', cleanEmail)
      .maybeSingle();
    if (state && typeof state.wallet_balance_kes === 'number') {
      db.prepare('UPDATE users SET wallet_balance_kes = ? WHERE id = ?').run(
        Number(state.wallet_balance_kes),
        newUserId
      );
    }
  }
  return newUserId;
}

/**
 * Ensures Daraja callbacks routed to a cold serverless container (e.g. Vercel /tmp SQLite)
 * and polling requests routed across containers stay consistent with Supabase Cloud Postgres.
 */
export async function hydrateMpesaCheckoutFromCloud(checkoutRequestId: string): Promise<void> {
  const client = getServerSupabaseAdminClient();
  if (!client || !checkoutRequestId) return;

  try {
    const [{ data: cloudTx }, { data: cloudOrder }] = await Promise.all([
      client
        .from('gridpips_mpesa_transactions')
        .select('*')
        .eq('checkout_request_id', checkoutRequestId)
        .maybeSingle(),
      client
        .from('gridpips_orders')
        .select('*')
        .eq('mpesa_checkout_id', checkoutRequestId)
        .maybeSingle(),
    ]);

    let hydratedOrderId: number | null = null;
    if (cloudOrder && cloudOrder.user_email) {
      const userId = await ensureLocalMirrorUserByEmail(String(cloudOrder.user_email));
      if (userId) {
        db.prepare(
          `INSERT INTO orders (
            order_number, user_id, product_key, product_name, amount_usd, amount_kes,
            payment_method, payment_status, mpesa_phone, mpesa_receipt, mpesa_checkout_id,
            mpesa_merchant_request_id, mpesa_result_code, mpesa_result_desc,
            crypto_currency, crypto_network, crypto_address, crypto_tx_hash, commission_usd,
            created_at, paid_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
          ON CONFLICT(order_number) DO UPDATE SET
            payment_status = CASE WHEN orders.payment_status = 'paid' THEN 'paid' ELSE excluded.payment_status END,
            mpesa_receipt = COALESCE(excluded.mpesa_receipt, orders.mpesa_receipt),
            mpesa_checkout_id = COALESCE(excluded.mpesa_checkout_id, orders.mpesa_checkout_id),
            mpesa_merchant_request_id = COALESCE(excluded.mpesa_merchant_request_id, orders.mpesa_merchant_request_id),
            mpesa_result_code = COALESCE(excluded.mpesa_result_code, orders.mpesa_result_code),
            mpesa_result_desc = COALESCE(excluded.mpesa_result_desc, orders.mpesa_result_desc),
            paid_at = COALESCE(excluded.paid_at, orders.paid_at)`
        ).run(
          cloudOrder.order_number,
          userId,
          cloudOrder.product_key,
          cloudOrder.product_name,
          cloudOrder.amount_usd,
          cloudOrder.amount_kes ?? 0,
          cloudOrder.payment_method,
          cloudOrder.payment_status,
          cloudOrder.mpesa_phone,
          cloudOrder.mpesa_receipt,
          cloudOrder.mpesa_checkout_id,
          cloudOrder.mpesa_merchant_request_id ?? null,
          cloudOrder.mpesa_result_code ?? null,
          cloudOrder.mpesa_result_desc ?? null,
          cloudOrder.crypto_currency,
          cloudOrder.crypto_network,
          cloudOrder.crypto_address,
          cloudOrder.crypto_tx_hash,
          cloudOrder.commission_usd ?? 0,
          cloudOrder.created_at || new Date().toISOString(),
          cloudOrder.paid_at
        );
        if (cloudOrder.payment_status === 'paid') {
          if (cloudOrder.product_key === 'analyzer') {
            db.prepare('UPDATE users SET has_analyzer = 1 WHERE id = ?').run(userId);
          } else if (cloudOrder.product_key === 'ea_bots') {
            db.prepare('UPDATE users SET has_ea_bots = 1 WHERE id = ?').run(userId);
          }
        }
        const ordRow = db
          .prepare('SELECT id FROM orders WHERE order_number = ?')
          .get(cloudOrder.order_number) as { id: number } | undefined;
        hydratedOrderId = ordRow?.id ?? null;
      }
    }

    if (cloudTx && cloudTx.user_email) {
      const userId = await ensureLocalMirrorUserByEmail(String(cloudTx.user_email));
      if (userId) {
        db.prepare(
          `INSERT INTO mpesa_transactions (
            tx_reference, user_id, order_id, purpose, business_short_code, party_b, transaction_type,
            phone_number, amount_kes, merchant_request_id, checkout_request_id, mpesa_receipt_number,
            result_code, result_desc, status, credited_to_wallet, transaction_date, callback_received_at,
            source_ip, created_at, updated_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
          ON CONFLICT(tx_reference) DO UPDATE SET
            mpesa_receipt_number = COALESCE(excluded.mpesa_receipt_number, mpesa_transactions.mpesa_receipt_number),
            result_code = COALESCE(excluded.result_code, mpesa_transactions.result_code),
            result_desc = COALESCE(excluded.result_desc, mpesa_transactions.result_desc),
            status = CASE WHEN mpesa_transactions.status = 'completed' THEN 'completed' ELSE excluded.status END,
            credited_to_wallet = MAX(mpesa_transactions.credited_to_wallet, excluded.credited_to_wallet),
            transaction_date = COALESCE(excluded.transaction_date, mpesa_transactions.transaction_date),
            callback_received_at = COALESCE(excluded.callback_received_at, mpesa_transactions.callback_received_at),
            source_ip = COALESCE(excluded.source_ip, mpesa_transactions.source_ip),
            updated_at = datetime('now')`
        ).run(
          cloudTx.tx_reference,
          userId,
          hydratedOrderId,
          cloudTx.purpose || 'wallet_deposit',
          cloudTx.business_short_code || '1443082',
          cloudTx.party_b || '1921416',
          cloudTx.transaction_type || 'CustomerBuyGoodsOnline',
          cloudTx.phone_number || '',
          Number(cloudTx.amount_kes || 0),
          cloudTx.merchant_request_id ?? null,
          cloudTx.checkout_request_id ?? null,
          cloudTx.mpesa_receipt_number ?? null,
          cloudTx.result_code ?? null,
          cloudTx.result_desc ?? null,
          cloudTx.status || 'pending',
          cloudTx.credited_to_wallet ? 1 : 0,
          cloudTx.transaction_date ?? null,
          cloudTx.callback_received_at ?? null,
          cloudTx.source_ip ?? null,
          cloudTx.created_at || new Date().toISOString(),
          cloudTx.updated_at || new Date().toISOString()
        );
        if (cloudTx.credited_to_wallet) {
          const { data: state } = await client
            .from('gridpips_user_state')
            .select('wallet_balance_kes')
            .eq('user_email', String(cloudTx.user_email).toLowerCase())
            .maybeSingle();
          if (state && typeof state.wallet_balance_kes === 'number') {
            db.prepare('UPDATE users SET wallet_balance_kes = MAX(wallet_balance_kes, ?) WHERE id = ?').run(
              Number(state.wallet_balance_kes),
              userId
            );
          }
        }
      }
    }
  } catch (err) {
    console.warn('Cloud M-Pesa checkout hydration error:', err instanceof Error ? err.message : String(err));
  }
}

export async function syncAllCloudMpesaTransactionsToLocal(): Promise<void> {
  const client = getServerSupabaseAdminClient();
  if (!client) return;

  try {
    const { data: rows, error } = await client
      .from('gridpips_mpesa_transactions')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(150);
    if (error || !Array.isArray(rows) || rows.length === 0) return;

    const upsertStmt = db.prepare(
      `INSERT INTO mpesa_transactions (
        tx_reference, user_id, order_id, purpose, business_short_code, party_b, transaction_type,
        phone_number, amount_kes, merchant_request_id, checkout_request_id, mpesa_receipt_number,
        result_code, result_desc, status, credited_to_wallet, transaction_date, callback_received_at,
        source_ip, created_at, updated_at
      ) VALUES (?, ?, NULL, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(tx_reference) DO UPDATE SET
        mpesa_receipt_number = COALESCE(excluded.mpesa_receipt_number, mpesa_transactions.mpesa_receipt_number),
        result_code = COALESCE(excluded.result_code, mpesa_transactions.result_code),
        result_desc = COALESCE(excluded.result_desc, mpesa_transactions.result_desc),
        status = CASE WHEN mpesa_transactions.status = 'completed' THEN 'completed' ELSE excluded.status END,
        credited_to_wallet = MAX(mpesa_transactions.credited_to_wallet, excluded.credited_to_wallet),
        source_ip = COALESCE(excluded.source_ip, mpesa_transactions.source_ip),
        updated_at = datetime('now')`
    );

    for (const m of rows) {
      if (!m.user_email) continue;
      const userId = await ensureLocalMirrorUserByEmail(String(m.user_email));
      if (!userId) continue;
      upsertStmt.run(
        m.tx_reference,
        userId,
        m.purpose || 'wallet_deposit',
        m.business_short_code || '1443082',
        m.party_b || '1921416',
        m.transaction_type || 'CustomerBuyGoodsOnline',
        m.phone_number || '',
        Number(m.amount_kes || 0),
        m.merchant_request_id ?? null,
        m.checkout_request_id ?? null,
        m.mpesa_receipt_number ?? null,
        m.result_code ?? null,
        m.result_desc ?? null,
        m.status || 'pending',
        m.credited_to_wallet ? 1 : 0,
        m.transaction_date ?? null,
        m.callback_received_at ?? null,
        m.source_ip ?? null,
        m.created_at || new Date().toISOString(),
        m.updated_at || new Date().toISOString()
      );
    }
  } catch (err) {
    console.warn('Cloud M-Pesa admin sync warning:', err instanceof Error ? err.message : String(err));
  }
}

const SITE_SETTINGS_CLOUD_EMAIL = '__site_settings__@system.gridpips';
const LEGACY_PLACEHOLDER_SETTINGS: Record<string, string[]> = {
  mpesa_till_number: ['5984120'],
  mpesa_party_b: ['5984120'],
  mpesa_merchant_name: ['GRIDPIPs Trading'],
  usdt_trc20_address: ['TX9kGridPipsUSDT7xR8mN4vQ2wK9pL3zF1'],
  usdt_erc20_address: ['0x71C9GridPips4E8A9B2F1D3c0E6a8b7d9F2a1C'],
  btc_address: ['bc1qgridpips8v9k2x4m7n0p3q5r6s8t9w'],
};

let lastSiteSettingsHydratedAt = 0;

export async function saveCloudSiteSettings(settings: Record<string, string>): Promise<boolean> {
  const client = getServerSupabaseAdminClient();
  if (!client) return false;

  try {
    const { error } = await client.from('gridpips_user_state').upsert(
      {
        user_email: SITE_SETTINGS_CLOUD_EMAIL,
        plan_json: settings,
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'user_email' }
    );
    if (error && !isMissingTableError(error)) {
      console.warn('Cloud site settings save warning:', error.message);
      return false;
    }
    if (!error) {
      lastSiteSettingsHydratedAt = Date.now();
      return true;
    }
    return false;
  } catch (err) {
    console.warn('Cloud site settings save failed:', err instanceof Error ? err.message : String(err));
    return false;
  }
}

export async function hydrateSiteSettingsFromCloud(force = false): Promise<void> {
  if (!force && Date.now() - lastSiteSettingsHydratedAt < 15_000) {
    return;
  }
  const client = getServerSupabaseAdminClient();
  if (!client) return;

  try {
    const { data, error } = await client
      .from('gridpips_user_state')
      .select('plan_json')
      .eq('user_email', SITE_SETTINGS_CLOUD_EMAIL)
      .maybeSingle();

    if (error || !data || !data.plan_json || typeof data.plan_json !== 'object' || Array.isArray(data.plan_json)) {
      lastSiteSettingsHydratedAt = Date.now();
      return;
    }

    const cloudSettings = data.plan_json as Record<string, unknown>;
    const upsertStmt = db.prepare(
      'INSERT INTO site_settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value'
    );

    const tx = db.transaction(() => {
      for (const [key, rawVal] of Object.entries(cloudSettings)) {
        if (typeof rawVal !== 'string') continue;
        const val = rawVal.trim();
        if (!val) continue;
        const legacyBlocked = LEGACY_PLACEHOLDER_SETTINGS[key];
        if (legacyBlocked && legacyBlocked.includes(val)) continue;
        upsertStmt.run(key, val);
      }
    });
    tx();
    lastSiteSettingsHydratedAt = Date.now();
  } catch (err) {
    console.warn('Cloud site settings hydration warning:', err instanceof Error ? err.message : String(err));
  }
}

const ADMIN_USERS_META_CLOUD_EMAIL = '__admin_users_meta__@system.gridpips';
const REFERRAL_LEDGER_CLOUD_EMAIL = '__referral_ledger__@system.gridpips';
const SYSTEM_CLOUD_EMAILS = new Set([
  SITE_SETTINGS_CLOUD_EMAIL,
  ADMIN_USERS_META_CLOUD_EMAIL,
  REFERRAL_LEDGER_CLOUD_EMAIL,
]);

export interface CloudUserMetaRecord {
  email: string;
  name: string;
  role: 'user' | 'influencer' | 'admin';
  exness_account_id: string;
  exness_verified: boolean;
  referral_code: string;
  referred_by_email: string | null;
  has_analyzer: boolean;
  has_ea_bots: boolean;
  wallet_balance_kes: number;
  is_suspended: boolean;
  commission_pct: number | null;
  last_login_at: string | null;
  created_at: string;
  updated_at: string;
}

interface CloudReferralClickRecord {
  referral_code: string;
  source_page: string | null;
  ip_address: string | null;
  created_at: string;
}

interface CloudPayoutRecord {
  user_email: string;
  amount_usd: number;
  method: string;
  destination: string;
  status: string;
  created_at: string;
  processed_at: string | null;
}

function buildLocalUserMetaRecord(userId: number): CloudUserMetaRecord | null {
  const row = db
    .prepare(
      `SELECT u.*, r.email as referred_by_email
       FROM users u
       LEFT JOIN users r ON u.referred_by = r.id
       WHERE u.id = ?`
    )
    .get(userId) as
    | {
        email: string;
        name: string;
        role: string;
        exness_account_id: string;
        exness_verified: number;
        referral_code: string;
        referred_by_email: string | null;
        has_analyzer: number;
        has_ea_bots: number;
        wallet_balance_kes: number;
        is_suspended: number;
        commission_pct: number | null;
        last_login_at: string | null;
        created_at: string;
      }
    | undefined;
  if (!row || !row.email) return null;

  const cleanRole: 'user' | 'influencer' | 'admin' =
    row.role === 'admin' || row.role === 'influencer' ? row.role : 'user';

  return {
    email: row.email.toLowerCase(),
    name: row.name,
    role: cleanRole,
    exness_account_id: row.exness_account_id,
    exness_verified: Boolean(row.exness_verified),
    referral_code: row.referral_code,
    referred_by_email: row.referred_by_email ? row.referred_by_email.toLowerCase() : null,
    has_analyzer: Boolean(row.has_analyzer),
    has_ea_bots: Boolean(row.has_ea_bots),
    wallet_balance_kes: Number(row.wallet_balance_kes || 0),
    is_suspended: Boolean(row.is_suspended),
    commission_pct:
      row.commission_pct !== null && row.commission_pct !== undefined && Number.isFinite(Number(row.commission_pct))
        ? Number(row.commission_pct)
        : null,
    last_login_at: row.last_login_at || null,
    created_at: row.created_at || new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };
}

export async function syncUserDirectoryEntryToCloud(userId: number): Promise<boolean> {
  const client = getServerSupabaseAdminClient();
  if (!client) return false;

  const record = buildLocalUserMetaRecord(userId);
  if (!record || SYSTEM_CLOUD_EMAILS.has(record.email)) return false;

  try {
    const { data: existingRow } = await client
      .from('gridpips_user_state')
      .select('plan_json')
      .eq('user_email', ADMIN_USERS_META_CLOUD_EMAIL)
      .maybeSingle();

    const currentMap: Record<string, CloudUserMetaRecord> =
      existingRow?.plan_json && typeof existingRow.plan_json === 'object' && !Array.isArray(existingRow.plan_json)
        ? { ...(existingRow.plan_json as Record<string, CloudUserMetaRecord>) }
        : {};

    currentMap[record.email] = record;

    const { error } = await client.from('gridpips_user_state').upsert(
      {
        user_email: ADMIN_USERS_META_CLOUD_EMAIL,
        plan_json: currentMap,
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'user_email' }
    );
    if (error && !isMissingTableError(error)) {
      console.warn('Cloud user directory sync warning:', error.message);
      return false;
    }
    return !error;
  } catch (err) {
    console.warn('Cloud user directory sync failed:', err instanceof Error ? err.message : String(err));
    return false;
  }
}

export async function saveCloudReferralLedger(): Promise<boolean> {
  const client = getServerSupabaseAdminClient();
  if (!client) return false;

  try {
    const clicks = db
      .prepare('SELECT referral_code, source_page, ip_address, created_at FROM referral_clicks ORDER BY id DESC LIMIT 1000')
      .all() as CloudReferralClickRecord[];

    const payouts = db
      .prepare(
        `SELECT u.email as user_email, p.amount_usd, p.method, p.destination, p.status, p.created_at, p.processed_at
         FROM payout_requests p
         JOIN users u ON p.user_id = u.id
         ORDER BY p.id DESC LIMIT 300`
      )
      .all() as CloudPayoutRecord[];

    const { error } = await client.from('gridpips_user_state').upsert(
      {
        user_email: REFERRAL_LEDGER_CLOUD_EMAIL,
        plan_json: {
          clicks,
          payouts: payouts.map((p) => ({
            ...p,
            user_email: String(p.user_email || '').toLowerCase(),
            amount_usd: Number(p.amount_usd || 0),
          })),
        },
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'user_email' }
    );
    if (error && !isMissingTableError(error)) {
      console.warn('Cloud referral ledger save warning:', error.message);
      return false;
    }
    return !error;
  } catch (err) {
    console.warn('Cloud referral ledger save failed:', err instanceof Error ? err.message : String(err));
    return false;
  }
}

function uniqueReferralCodeForEmail(preferred: string | undefined | null, email: string, existingUserId?: number): string {
  const cleaned = String(preferred || '')
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9_-]/g, '')
    .slice(0, 24);
  if (cleaned) {
    const clash = db
      .prepare('SELECT id FROM users WHERE referral_code = ?')
      .get(cleaned) as { id: number } | undefined;
    if (!clash || (existingUserId && clash.id === existingUserId)) {
      return cleaned;
    }
  }
  const prefix = (email.split('@')[0] || 'TRADER').replace(/[^a-zA-Z0-9]/g, '').toUpperCase().slice(0, 6) || 'TRADER';
  for (let i = 0; i < 6; i += 1) {
    const candidate = `${prefix}${Math.floor(100 + Math.random() * 899)}`;
    const clash = db.prepare('SELECT id FROM users WHERE referral_code = ?').get(candidate);
    if (!clash) return candidate;
  }
  return `GP${Date.now().toString(36).toUpperCase()}`;
}

export async function syncAllCloudAdminDataToLocal(): Promise<{
  syncedUsers: number;
  syncedOrders: number;
  syncedPayouts: number;
}> {
  const client = getServerSupabaseAdminClient();
  if (!client) {
    return { syncedUsers: 0, syncedOrders: 0, syncedPayouts: 0 };
  }

  let syncedUsers = 0;
  let syncedOrders = 0;
  let syncedPayouts = 0;

  try {
    const [
      profilesRes,
      authUsersRes,
      userStatesRes,
      adminMetaRes,
      referralLedgerRes,
      ordersRes,
    ] = await Promise.all([
      client.from('profiles').select('*').limit(500),
      client.auth.admin.listUsers({ page: 1, perPage: 200 }).catch(() => ({ data: { users: [] }, error: null })),
      client.from('gridpips_user_state').select('*').limit(500),
      client
        .from('gridpips_user_state')
        .select('plan_json')
        .eq('user_email', ADMIN_USERS_META_CLOUD_EMAIL)
        .maybeSingle(),
      client
        .from('gridpips_user_state')
        .select('plan_json')
        .eq('user_email', REFERRAL_LEDGER_CLOUD_EMAIL)
        .maybeSingle(),
      client.from('gridpips_orders').select('*').order('created_at', { ascending: false }).limit(300),
    ]);

    const adminMetaMap: Record<string, CloudUserMetaRecord> =
      adminMetaRes.data?.plan_json &&
      typeof adminMetaRes.data.plan_json === 'object' &&
      !Array.isArray(adminMetaRes.data.plan_json)
        ? (adminMetaRes.data.plan_json as Record<string, CloudUserMetaRecord>)
        : {};

    type MergedCloudUser = {
      email: string;
      supabase_uid?: string | null;
      name?: string;
      role?: 'user' | 'influencer' | 'admin';
      exness_account_id?: string;
      exness_verified?: boolean;
      referral_code?: string;
      referred_by_email?: string | null;
      referred_by_code?: string | null;
      has_analyzer?: boolean;
      has_ea_bots?: boolean;
      wallet_balance_kes?: number;
      is_suspended?: boolean;
      commission_pct?: number | null;
      mt5_login?: string | null;
      mt5_server?: string | null;
      mt5_metaapi_account_id?: string | null;
      mt5_metaapi_region?: string | null;
      mt5_connected?: boolean;
      last_login_at?: string | null;
      created_at?: string | null;
    };

    const mergedByEmail = new Map<string, MergedCloudUser>();
    const upsertMerge = (emailRaw: string | undefined | null, patch: Partial<MergedCloudUser>) => {
      const email = String(emailRaw || '').trim().toLowerCase();
      if (!email || !email.includes('@') || SYSTEM_CLOUD_EMAILS.has(email)) return;
      const prev = mergedByEmail.get(email) || { email };
      mergedByEmail.set(email, { ...prev, ...patch, email });
    };

    // 1. Auth users (lowest priority defaults)
    const authUsers = Array.isArray(authUsersRes?.data?.users) ? authUsersRes.data.users : [];
    for (const au of authUsers) {
      if (!au.email) continue;
      const meta = (au.user_metadata || {}) as Record<string, unknown>;
      upsertMerge(au.email, {
        supabase_uid: au.id,
        name: typeof meta.full_name === 'string' && meta.full_name.trim() ? meta.full_name.trim() : undefined,
        exness_account_id:
          typeof meta.exness_account_id === 'string' && meta.exness_account_id.trim()
            ? meta.exness_account_id.trim()
            : undefined,
        referred_by_code:
          typeof meta.referred_by_code === 'string' && meta.referred_by_code.trim()
            ? meta.referred_by_code.trim().toUpperCase()
            : undefined,
        last_login_at: au.last_sign_in_at || undefined,
        created_at: au.created_at || undefined,
      });
    }

    // 2. Supabase profiles table
    if (!profilesRes.error && Array.isArray(profilesRes.data)) {
      for (const p of profilesRes.data) {
        if (!p.email) continue;
        upsertMerge(String(p.email), {
          supabase_uid: p.id ? String(p.id) : undefined,
          name: p.full_name ? String(p.full_name) : undefined,
          role: p.role === 'admin' || p.role === 'influencer' ? p.role : 'user',
          exness_account_id: p.exness_account_id ? String(p.exness_account_id) : undefined,
          exness_verified: Boolean(p.exness_verified),
          referral_code: p.referral_code ? String(p.referral_code) : undefined,
          has_analyzer: Boolean(p.has_analyzer),
          has_ea_bots: Boolean(p.has_ea_bots),
          created_at: p.created_at ? String(p.created_at) : undefined,
        });
      }
    }

    // 3. gridpips_user_state rows (MT5 & wallet state)
    if (!userStatesRes.error && Array.isArray(userStatesRes.data)) {
      for (const s of userStatesRes.data) {
        const email = String(s.user_email || '').toLowerCase();
        if (!email || SYSTEM_CLOUD_EMAILS.has(email)) continue;
        upsertMerge(email, {
          exness_account_id: s.exness_account_id ? String(s.exness_account_id) : undefined,
          exness_verified: typeof s.exness_verified === 'boolean' ? s.exness_verified : undefined,
          wallet_balance_kes: typeof s.wallet_balance_kes === 'number' ? Number(s.wallet_balance_kes) : undefined,
          mt5_login: s.mt5_login ? String(s.mt5_login) : undefined,
          mt5_server: s.mt5_server ? String(s.mt5_server) : undefined,
          mt5_metaapi_account_id: s.mt5_metaapi_account_id ? String(s.mt5_metaapi_account_id) : undefined,
          mt5_metaapi_region: s.mt5_metaapi_region ? String(s.mt5_metaapi_region) : undefined,
          mt5_connected: Boolean(s.mt5_connected),
        });
      }
    }

    // 4. Authoritative admin overrides & metadata (__admin_users_meta__)
    for (const [emailKey, meta] of Object.entries(adminMetaMap)) {
      if (!meta || typeof meta !== 'object') continue;
      const email = String(meta.email || emailKey).toLowerCase();
      if (!email || SYSTEM_CLOUD_EMAILS.has(email)) continue;
      upsertMerge(email, {
        name: meta.name || undefined,
        role: meta.role === 'admin' || meta.role === 'influencer' ? meta.role : 'user',
        exness_account_id: meta.exness_account_id || undefined,
        exness_verified: Boolean(meta.exness_verified),
        referral_code: meta.referral_code || undefined,
        referred_by_email: meta.referred_by_email ? String(meta.referred_by_email).toLowerCase() : null,
        has_analyzer: Boolean(meta.has_analyzer),
        has_ea_bots: Boolean(meta.has_ea_bots),
        wallet_balance_kes:
          typeof meta.wallet_balance_kes === 'number' ? Number(meta.wallet_balance_kes) : undefined,
        is_suspended: Boolean(meta.is_suspended),
        commission_pct:
          meta.commission_pct !== null && meta.commission_pct !== undefined && Number.isFinite(Number(meta.commission_pct))
            ? Number(meta.commission_pct)
            : null,
        last_login_at: meta.last_login_at || undefined,
        created_at: meta.created_at || undefined,
      });
    }

    // Upsert all discovered users into local SQLite
    for (const u of mergedByEmail.values()) {
      const existing = db.prepare('SELECT * FROM users WHERE email = ?').get(u.email) as
        | {
            id: number;
            name: string;
            role: string;
            exness_account_id: string;
            referral_code: string;
            supabase_uid: string | null;
          }
        | undefined;

      if (!existing) {
        const refCode = uniqueReferralCodeForEmail(u.referral_code, u.email);
        const info = db
          .prepare(
            `INSERT INTO users (
              supabase_uid, name, email, password_hash, role, exness_account_id, exness_email,
              exness_verified, referral_code, has_analyzer, has_ea_bots, wallet_balance_kes,
              mt5_login, mt5_server, mt5_metaapi_account_id, mt5_metaapi_region, mt5_connected,
              mt5_bridge_token, is_suspended, commission_pct, created_at, last_login_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
          )
          .run(
            u.supabase_uid || null,
            u.name || u.email.split('@')[0] || 'Trader',
            u.email,
            hashPassword(generateSecureToken(24)),
            u.role || 'user',
            u.exness_account_id || 'EXN-PENDING',
            u.email,
            u.exness_verified ? 1 : 0,
            refCode,
            u.has_analyzer || u.role === 'admin' ? 1 : 0,
            u.has_ea_bots || u.role === 'admin' ? 1 : 0,
            Number(u.wallet_balance_kes || 0),
            u.mt5_login || null,
            u.mt5_server || null,
            u.mt5_metaapi_account_id || null,
            u.mt5_metaapi_region || null,
            u.mt5_connected ? 1 : 0,
            generateSecureToken(16),
            u.is_suspended ? 1 : 0,
            u.commission_pct ?? null,
            u.created_at || new Date().toISOString(),
            u.last_login_at || null
          );
        db.prepare('INSERT OR IGNORE INTO paper_accounts (user_id, balance) VALUES (?, 10000)').run(
          Number(info.lastInsertRowid)
        );
        syncedUsers += 1;
      } else {
        const hasAdminOverride = Boolean(adminMetaMap[u.email]);
        const safeRefCode =
          hasAdminOverride && u.referral_code
            ? uniqueReferralCodeForEmail(u.referral_code, u.email, existing.id)
            : existing.referral_code;

        db.prepare(
          `UPDATE users SET
            supabase_uid = COALESCE(?, supabase_uid),
            name = COALESCE(NULLIF(?, ''), name),
            role = CASE WHEN ? = 1 THEN COALESCE(?, role) ELSE role END,
            exness_account_id = CASE WHEN ? = 1 AND ? IS NOT NULL AND ? != '' THEN ? ELSE COALESCE(NULLIF(exness_account_id, 'EXN-PENDING'), ?, exness_account_id) END,
            exness_verified = CASE WHEN ? = 1 THEN ? ELSE MAX(exness_verified, ?) END,
            referral_code = ?,
            has_analyzer = CASE WHEN ? = 1 THEN ? ELSE MAX(has_analyzer, ?) END,
            has_ea_bots = CASE WHEN ? = 1 THEN ? ELSE MAX(has_ea_bots, ?) END,
            wallet_balance_kes = CASE WHEN ? = 1 AND ? IS NOT NULL THEN ? ELSE COALESCE(?, wallet_balance_kes) END,
            is_suspended = CASE WHEN ? = 1 THEN ? ELSE is_suspended END,
            commission_pct = CASE WHEN ? = 1 THEN ? ELSE COALESCE(commission_pct, ?) END,
            mt5_login = COALESCE(?, mt5_login),
            mt5_server = COALESCE(?, mt5_server),
            mt5_metaapi_account_id = COALESCE(?, mt5_metaapi_account_id),
            mt5_metaapi_region = COALESCE(?, mt5_metaapi_region),
            mt5_connected = MAX(mt5_connected, ?),
            last_login_at = COALESCE(?, last_login_at)
           WHERE id = ?`
        ).run(
          u.supabase_uid || null,
          hasAdminOverride ? u.name || '' : '',
          hasAdminOverride ? 1 : 0,
          u.role || existing.role,
          hasAdminOverride ? 1 : 0,
          u.exness_account_id || null,
          u.exness_account_id || null,
          u.exness_account_id || existing.exness_account_id,
          u.exness_account_id || null,
          hasAdminOverride ? 1 : 0,
          u.exness_verified ? 1 : 0,
          u.exness_verified ? 1 : 0,
          safeRefCode,
          hasAdminOverride ? 1 : 0,
          u.has_analyzer ? 1 : 0,
          u.has_analyzer ? 1 : 0,
          hasAdminOverride ? 1 : 0,
          u.has_ea_bots ? 1 : 0,
          u.has_ea_bots ? 1 : 0,
          hasAdminOverride ? 1 : 0,
          u.wallet_balance_kes ?? null,
          u.wallet_balance_kes ?? 0,
          u.wallet_balance_kes ?? null,
          hasAdminOverride ? 1 : 0,
          u.is_suspended ? 1 : 0,
          hasAdminOverride ? 1 : 0,
          u.commission_pct ?? null,
          u.commission_pct ?? null,
          u.mt5_login || null,
          u.mt5_server || null,
          u.mt5_metaapi_account_id || null,
          u.mt5_metaapi_region || null,
          u.mt5_connected ? 1 : 0,
          u.last_login_at || null,
          existing.id
        );
        syncedUsers += 1;
      }
    }

    // Second pass: resolve referred_by links across users
    for (const u of mergedByEmail.values()) {
      const localUser = db.prepare('SELECT id, referred_by FROM users WHERE email = ?').get(u.email) as
        | { id: number; referred_by: number | null }
        | undefined;
      if (!localUser) continue;
      let refUserId: number | null = null;
      if (u.referred_by_email) {
        const refRow = db.prepare('SELECT id FROM users WHERE email = ?').get(u.referred_by_email) as
          | { id: number }
          | undefined;
        if (refRow && refRow.id !== localUser.id) refUserId = refRow.id;
      } else if (u.referred_by_code && !localUser.referred_by) {
        const refRow = db
          .prepare('SELECT id FROM users WHERE UPPER(referral_code) = UPPER(?)')
          .get(u.referred_by_code) as { id: number } | undefined;
        if (refRow && refRow.id !== localUser.id) refUserId = refRow.id;
      }
      if (refUserId !== null && refUserId !== localUser.referred_by) {
        db.prepare('UPDATE users SET referred_by = ? WHERE id = ?').run(refUserId, localUser.id);
      }
    }

    // 5. Hydrate all cloud orders into SQLite
    if (!ordersRes.error && Array.isArray(ordersRes.data) && ordersRes.data.length > 0) {
      const upsertOrderStmt = db.prepare(
        `INSERT INTO orders (
          order_number, user_id, product_key, product_name, amount_usd, amount_kes,
          payment_method, payment_status, mpesa_phone, mpesa_receipt, mpesa_checkout_id,
          mpesa_merchant_request_id, mpesa_result_code, mpesa_result_desc,
          crypto_currency, crypto_network, crypto_address, crypto_tx_hash,
          referrer_id, commission_usd, created_at, paid_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(order_number) DO UPDATE SET
          payment_status = CASE WHEN orders.payment_status = 'paid' THEN 'paid' ELSE excluded.payment_status END,
          mpesa_receipt = COALESCE(excluded.mpesa_receipt, orders.mpesa_receipt),
          crypto_tx_hash = COALESCE(excluded.crypto_tx_hash, orders.crypto_tx_hash),
          referrer_id = COALESCE(orders.referrer_id, excluded.referrer_id),
          commission_usd = CASE WHEN excluded.commission_usd > 0 THEN excluded.commission_usd ELSE orders.commission_usd END,
          paid_at = COALESCE(excluded.paid_at, orders.paid_at)`
      );

      for (const o of ordersRes.data) {
        const email = String(o.user_email || '').toLowerCase();
        if (!email || SYSTEM_CLOUD_EMAILS.has(email)) continue;
        const userId = await ensureLocalMirrorUserByEmail(email);
        if (!userId) continue;
        const buyer = db.prepare('SELECT referred_by FROM users WHERE id = ?').get(userId) as
          | { referred_by: number | null }
          | undefined;
        upsertOrderStmt.run(
          o.order_number,
          userId,
          o.product_key,
          o.product_name,
          Number(o.amount_usd || 0),
          Number(o.amount_kes || 0),
          o.payment_method,
          o.payment_status,
          o.mpesa_phone ?? null,
          o.mpesa_receipt ?? null,
          o.mpesa_checkout_id ?? null,
          o.mpesa_merchant_request_id ?? null,
          o.mpesa_result_code ?? null,
          o.mpesa_result_desc ?? null,
          o.crypto_currency ?? null,
          o.crypto_network ?? null,
          o.crypto_address ?? null,
          o.crypto_tx_hash ?? null,
          buyer?.referred_by ?? null,
          Number(o.commission_usd || 0),
          o.created_at || new Date().toISOString(),
          o.paid_at ?? null
        );
        syncedOrders += 1;
      }
    }

    // 6. Hydrate referral clicks & influencer payouts ledger
    const ledger = referralLedgerRes.data?.plan_json as
      | { clicks?: CloudReferralClickRecord[]; payouts?: CloudPayoutRecord[] }
      | undefined;

    if (ledger && typeof ledger === 'object') {
      const localClickCount = (db.prepare('SELECT COUNT(*) as cnt FROM referral_clicks').get() as { cnt: number }).cnt;
      if (localClickCount === 0 && Array.isArray(ledger.clicks) && ledger.clicks.length > 0) {
        const insClick = db.prepare(
          'INSERT INTO referral_clicks (referral_code, source_page, ip_address, created_at) VALUES (?, ?, ?, ?)'
        );
        for (const c of [...ledger.clicks].reverse()) {
          if (!c.referral_code) continue;
          insClick.run(c.referral_code, c.source_page || '/', c.ip_address || null, c.created_at || new Date().toISOString());
        }
      }

      if (Array.isArray(ledger.payouts) && ledger.payouts.length > 0) {
        for (const p of [...ledger.payouts].reverse()) {
          const email = String(p.user_email || '').toLowerCase();
          if (!email) continue;
          const userId = await ensureLocalMirrorUserByEmail(email);
          if (!userId) continue;
          const existingPayout = db
            .prepare(
              'SELECT id, status FROM payout_requests WHERE user_id = ? AND amount_usd = ? AND destination = ? AND created_at = ?'
            )
            .get(userId, Number(p.amount_usd || 0), p.destination || '', p.created_at || '') as
            | { id: number; status: string }
            | undefined;
          if (!existingPayout) {
            db.prepare(
              `INSERT INTO payout_requests (user_id, amount_usd, method, destination, status, created_at, processed_at)
               VALUES (?, ?, ?, ?, ?, ?, ?)`
            ).run(
              userId,
              Number(p.amount_usd || 0),
              p.method || 'mpesa',
              p.destination || '',
              p.status || 'pending',
              p.created_at || new Date().toISOString(),
              p.processed_at || null
            );
            syncedPayouts += 1;
          } else if (existingPayout.status === 'pending' && p.status && p.status !== 'pending') {
            db.prepare('UPDATE payout_requests SET status = ?, processed_at = COALESCE(?, processed_at) WHERE id = ?').run(
              p.status,
              p.processed_at || null,
              existingPayout.id
            );
          }
        }
      }
    }

    // 7. Also hydrate M-Pesa transactions
    await syncAllCloudMpesaTransactionsToLocal();
  } catch (err) {
    console.warn('Cloud admin full sync warning:', err instanceof Error ? err.message : String(err));
  }

  return { syncedUsers, syncedOrders, syncedPayouts };
}


