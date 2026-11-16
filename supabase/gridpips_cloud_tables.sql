-- Run this once in your Supabase SQL Editor (https://supabase.com/dashboard)
-- Persists Grid Pips orders, journal trades, paper accounts, trading plans, watchlists,
-- MetaApi MT5 links, and automated trade command logs across serverless deployments.

create table if not exists public.gridpips_user_state (
  user_email text primary key,
  exness_account_id text,
  exness_verified boolean not null default false,
  mt5_login text,
  mt5_server text,
  mt5_metaapi_account_id text,
  mt5_metaapi_region text,
  mt5_connected boolean not null default false,
  mt5_auto_trade boolean not null default false,
  mt5_active_bot text not null default 'both',
  mt5_risk_percent numeric not null default 1.0,
  mt5_balance numeric,
  mt5_equity numeric,
  mt5_open_positions integer not null default 0,
  mt5_status text,
  mt5_last_sync timestamptz,
  paper_balance numeric not null default 10000,
  paper_positions_json jsonb not null default '[]'::jsonb,
  paper_history_json jsonb not null default '[]'::jsonb,
  plan_json jsonb,
  watchlist_json jsonb not null default '["EURUSD","GBPUSD","XAUUSD","NAS100","BTCUSD"]'::jsonb,
  wallet_balance_kes numeric not null default 0,
  updated_at timestamptz not null default now()
);

alter table public.gridpips_user_state add column if not exists wallet_balance_kes numeric not null default 0;

create table if not exists public.gridpips_orders (
  order_number text primary key,
  user_email text not null,
  product_key text not null,
  product_name text not null,
  amount_usd numeric not null,
  amount_kes numeric not null default 0,
  payment_method text not null,
  payment_status text not null default 'pending',
  mpesa_phone text,
  mpesa_receipt text,
  mpesa_checkout_id text,
  mpesa_merchant_request_id text,
  mpesa_result_code text,
  mpesa_result_desc text,
  crypto_currency text,
  crypto_network text,
  crypto_address text,
  crypto_tx_hash text,
  commission_usd numeric not null default 0,
  created_at timestamptz not null default now(),
  paid_at timestamptz
);

alter table public.gridpips_orders add column if not exists mpesa_merchant_request_id text;
alter table public.gridpips_orders add column if not exists mpesa_result_code text;
alter table public.gridpips_orders add column if not exists mpesa_result_desc text;

create table if not exists public.gridpips_mpesa_transactions (
  tx_reference text primary key,
  user_email text not null,
  purpose text not null default 'wallet_deposit',
  business_short_code text not null,
  party_b text not null,
  transaction_type text not null default 'CustomerBuyGoodsOnline',
  phone_number text not null,
  amount_kes numeric not null,
  merchant_request_id text,
  checkout_request_id text unique,
  mpesa_receipt_number text unique,
  result_code text,
  result_desc text,
  status text not null default 'pending',
  credited_to_wallet boolean not null default false,
  transaction_date text,
  callback_received_at timestamptz,
  source_ip text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.gridpips_journal_trades (
  client_ref text primary key,
  user_email text not null,
  instrument text not null,
  side text not null,
  entry_price numeric,
  sl numeric,
  tp numeric,
  size numeric,
  risk_pct numeric,
  rr numeric,
  pnl numeric not null,
  trade_date text not null,
  session text,
  strategy text,
  reason_entry text,
  reason_exit text,
  lessons text,
  image_data text,
  created_at timestamptz not null default now()
);

create table if not exists public.gridpips_mt5_commands (
  client_ref text primary key,
  user_email text not null,
  symbol text not null,
  side text not null,
  volume numeric not null default 0.01,
  stop_loss numeric,
  take_profit numeric,
  source_ea text not null,
  execution_mode text not null default 'metaapi',
  status text not null default 'executed',
  external_order_id text,
  error_message text,
  created_at timestamptz not null default now(),
  executed_at timestamptz
);

create index if not exists idx_gridpips_orders_email on public.gridpips_orders (user_email);
create index if not exists idx_gridpips_mpesa_email on public.gridpips_mpesa_transactions (user_email);
create index if not exists idx_gridpips_journal_email on public.gridpips_journal_trades (user_email);
create index if not exists idx_gridpips_mt5_cmd_email on public.gridpips_mt5_commands (user_email);

alter table public.gridpips_user_state enable row level security;
alter table public.gridpips_orders enable row level security;
alter table public.gridpips_mpesa_transactions enable row level security;
alter table public.gridpips_journal_trades enable row level security;
alter table public.gridpips_mt5_commands enable row level security;
