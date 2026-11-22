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
  mt5Balance?: number | null;
  mt5Equity?: number | null;
  mt5Symbol?: string | null;
  mt5EaName?: string | null;
  mt5OpenPositions?: number;
  mt5Status?: string | null;
  mt5AutoTrade?: boolean;
  mt5ActiveBot?: 'silverbullet' | 'orderblock' | 'both' | string;
  mt5RiskPercent?: number;
  mt5ConnectionMode?: 'metaapi';
  mt5ApiConfigured?: boolean;
  mt5ProvisioningProfileConfigured?: boolean;
  walletBalanceKes?: number;
  commissionPct?: number | null;
  isSuspended: boolean;
  createdAt: string;
  lastLoginAt?: string | null;
}

export interface MpesaTransaction {
  id: number;
  tx_reference: string;
  user_id: number;
  order_id?: number | null;
  purpose: 'wallet_deposit' | 'order_payment' | string;
  business_short_code: string;
  party_b: string;
  transaction_type: 'CustomerBuyGoodsOnline' | 'CustomerPayBillOnline' | string;
  phone_number: string;
  amount_kes: number;
  merchant_request_id?: string | null;
  checkout_request_id?: string | null;
  mpesa_receipt_number?: string | null;
  result_code?: string | null;
  result_desc?: string | null;
  status: 'pending' | 'completed' | 'failed' | 'cancelled';
  credited_to_wallet: number;
  transaction_date?: string | null;
  callback_received_at?: string | null;
  source_ip?: string | null;
  created_at: string;
  updated_at: string;
  user_name?: string;
  user_email?: string;
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
  mpesaPartyB?: string;
  mpesaTransactionType?: 'CustomerBuyGoodsOnline' | 'CustomerPayBillOnline';
  mpesaMerchantName: string;
  mpesaConfigured?: boolean;
  mpesaEnv?: 'sandbox' | 'production';
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
  mpesa_merchant_request_id?: string | null;
  mpesa_result_code?: string | null;
  mpesa_result_desc?: string | null;
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
  timestampSec?: number;
  time: string;
  open: number;
  high: number;
  low: number;
  close: number;
}

export type IctZoneType =
  | 'Bullish FVG'
  | 'Bearish FVG'
  | 'Bullish OB'
  | 'Bearish OB'
  | 'Bullish Breaker'
  | 'Bearish Breaker'
  | 'Bullish Mitigation'
  | 'Bearish Mitigation'
  | 'Bullish Rejection'
  | 'Bearish Rejection'
  | 'Liquidity Void';

export interface IctZone {
  type: IctZoneType;
  top: number;
  bottom: number;
  ceMid: number;
  startIndex: number;
  endIndex: number;
  mitigated: boolean;
  pdZone?: 'Premium' | 'Discount' | 'Equilibrium';
}

export type PdArrayCategory =
  | 'Old High / BSL'
  | 'Old Low / SSL'
  | 'Equal Highs (EQH)'
  | 'Equal Lows (EQL)'
  | 'Rejection Block'
  | 'Order Block (OB)'
  | 'Fair Value Gap (FVG)'
  | 'Liquidity Void'
  | 'Breaker Block'
  | 'Mitigation Block';

export interface PdArrayItem {
  id: string;
  name: string;
  category: PdArrayCategory;
  direction: 'Bullish' | 'Bearish' | 'Neutral';
  zone: 'Premium' | 'Discount' | 'Equilibrium';
  priority: number;
  top: number;
  bottom: number;
  midpoint: number;
  status: 'Unmitigated' | 'In Zone' | 'Mitigated' | 'Target Liquidity';
  distancePct: number;
  description: string;
  startIndex: number;
}

export interface PremiumDiscountProfile {
  rangeHigh: number;
  rangeLow: number;
  equilibrium: number;
  premiumStart: number;
  discountEnd: number;
  currentPositionPct: number;
  currentZone: 'Premium' | 'Discount' | 'Equilibrium';
  quadrant:
    | 'Deep Premium (75-100%)'
    | 'Upper Premium (50-75%)'
    | 'Equilibrium (50%)'
    | 'Upper Discount (25-50%)'
    | 'Deep Discount (0-25%)';
  alignedWithBias: boolean;
  guidance: string;
}

export interface IctAnalysisResult {
  symbol: string;
  tvSymbol?: string;
  tradingViewUrl?: string;
  timeframe: string;
  currentPrice: number;
  bid?: number | null;
  ask?: number | null;
  changePct?: number | null;
  dailyBias: 'Bullish' | 'Bearish';
  po3Phase: string;
  activeKillzone: string;
  structureShift: string;
  mssIndex?: number | null;
  displacementDetected?: boolean;
  liquiditySweep?: string;
  sweepIndex?: number | null;
  drawOnLiquidity?: {
    label: string;
    price: number;
    side: 'BSL (Premium)' | 'SSL (Discount)';
  };
  bslLevel: number;
  sslLevel: number;
  equalHighsLevel?: number | null;
  equalLowsLevel?: number | null;
  premiumDiscount?: PremiumDiscountProfile;
  pdArrays?: PdArrayItem[];
  oteLevels: {
    fib618: number;
    fib705: number;
    fib786: number;
    zone?: 'Premium' | 'Discount';
  };
  zones: IctZone[];
  setup: {
    direction: 'Long (Buy)' | 'Short (Sell)';
    entryZone: string;
    entryArrayName?: string;
    stopLoss: number;
    tp1: number;
    tp2: number;
    rrRatio: number;
    confluences: string[];
  };
  candles: Candle[];
  ictReferenceChannel: string;
  dataSource?: 'tradingview_live';
  lastUpdated?: string;
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
