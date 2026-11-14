export interface User {
  id: number;
  name: string;
  email: string;
  role: 'user' | 'influencer' | 'admin';
  exnessAccountId: string;
  exnessEmail?: string | null;
  exnessVerified: boolean;
  referralCode: string;
  hasAnalyzer: boolean;
  hasEaBots: boolean;
  mt5Login?: string | null;
  mt5Server?: string | null;
  mt5BridgeToken?: string | null;
  mt5Connected: boolean;
  mt5LastSync?: string | null;
  isSuspended: boolean;
  createdAt: string;
  lastLoginAt?: string | null;
}

export interface PublicConfig {
  exnessIbUrl: string;
  telegramUrl: string;
  ictYoutubeChannelId: string;
  analyzerPriceUsd: number;
  eaBotsPriceUsd: number;
  usdKesRate: number;
  analyzerPriceKes: number;
  eaBotsPriceKes: number;
  mpesaTillNumber: string;
  mpesaMerchantName: string;
  commissionPct: number;
  supabaseConfigured?: boolean;
  supabaseStatus?: 'connected' | 'missing_url' | 'missing_key' | 'not_configured';
  supabaseUrl?: string;
  supabaseAnonKey?: string;
  cryptoAddresses: {
    USDT_TRC20: string;
    USDT_ERC20: string;
    BTC: string;
  };
}

export interface Order {
  id: number;
  order_number: string;
  user_id: number;
  product_key: 'analyzer' | 'ea_bots';
  product_name: string;
  amount_usd: number;
  amount_kes: number;
  payment_method: 'mpesa' | 'crypto';
  payment_status: 'pending' | 'processing' | 'paid' | 'failed' | 'refunded';
  mpesa_phone?: string | null;
  mpesa_receipt?: string | null;
  mpesa_checkout_id?: string | null;
  crypto_currency?: string | null;
  crypto_network?: string | null;
  crypto_address?: string | null;
  crypto_tx_hash?: string | null;
  commission_usd: number;
  created_at: string;
  paid_at?: string | null;
  user_name?: string;
  user_email?: string;
}

export interface Candle {
  index: number;
  time: string;
  open: number;
  high: number;
  low: number;
  close: number;
}

export interface IctZone {
  type: 'Bullish FVG' | 'Bearish FVG' | 'Bullish OB' | 'Bearish OB';
  top: number;
  bottom: number;
  ceMid: number;
  startIndex: number;
  endIndex: number;
  mitigated: boolean;
}

export interface IctAnalysisResult {
  symbol: string;
  timeframe: string;
  currentPrice: number;
  dailyBias: 'Bullish' | 'Bearish';
  po3Phase: string;
  activeKillzone: string;
  structureShift: string;
  bslLevel: number;
  sslLevel: number;
  oteLevels: {
    fib618: number;
    fib705: number;
    fib786: number;
  };
  zones: IctZone[];
  setup: {
    direction: 'Long (Buy)' | 'Short (Sell)';
    entryZone: string;
    stopLoss: number;
    tp1: number;
    tp2: number;
    rrRatio: number;
    confluences: string[];
  };
  candles: Candle[];
  ictReferenceChannel: string;
}

export interface JournalTrade {
  id: number;
  instrument: string;
  side: 'Buy' | 'Sell';
  entry_price?: number | null;
  sl?: number | null;
  tp?: number | null;
  size?: number | null;
  risk_pct?: number | null;
  rr?: number | null;
  pnl: number;
  trade_date: string;
  session?: string | null;
  strategy?: string | null;
  reason_entry?: string | null;
  reason_exit?: string | null;
  lessons?: string | null;
  image_data?: string | null;
}

export interface PaperPosition {
  id: string;
  symbol: string;
  side: 'Buy' | 'Sell';
  size: number;
  entry: number;
  sl?: number | null;
  tp?: number | null;
}

export interface PaperHistoryItem {
  id: string;
  symbol: string;
  side: 'Buy' | 'Sell';
  entry: number;
  exit: number;
  pnl: number;
  closedAt: string;
}

export interface EmailLogItem {
  id: number;
  recipient_email: string;
  subject: string;
  body_preview: string;
  category: string;
  delivery_status: string;
  created_at: string;
}

export interface SecurityLogItem {
  id: number;
  event_type: string;
  severity: 'info' | 'warning' | 'critical';
  ip_address: string;
  user_email: string | null;
  details: string;
  created_at: string;
}
