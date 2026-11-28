export type BillingCycle = 'monthly' | 'quarterly' | 'annual';
export type SubscriptionStatus = 'active' | 'expiring_soon' | 'expired' | 'inactive';

export interface SubscriptionPlanMeta {
  cycle: BillingCycle;
  label: string;
  durationDays: number;
  months: number;
  discountPct: number;
}

export type ProductKey = 'analyzer' | 'drt_analyzer';

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
  hasDrtAnalyzer: boolean;
  hasEaBots: boolean;
  analyzerExpiresAt?: string | null;
  drtAnalyzerExpiresAt?: string | null;
  eaBotsExpiresAt?: string | null;
  analyzerSubscriptionStatus?: SubscriptionStatus;
  drtAnalyzerSubscriptionStatus?: SubscriptionStatus;
  eaBotsSubscriptionStatus?: SubscriptionStatus;
  analyzerDaysRemaining?: number | null;
  drtAnalyzerDaysRemaining?: number | null;
  eaBotsDaysRemaining?: number | null;
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
  drtYoutubeChannelUrl?: string;
  analyzerPriceUsd: number;
  drtAnalyzerPriceUsd?: number;
  eaBotsPriceUsd: number;
  usdKesRate: number;
  analyzerPriceKes: number;
  drtAnalyzerPriceKes?: number;
  eaBotsPriceKes: number;
  mpesaTillNumber: string;
  mpesaPartyB?: string;
  mpesaTransactionType?: 'CustomerBuyGoodsOnline' | 'CustomerPayBillOnline';
  mpesaMerchantName: string;
  mpesaConfigured?: boolean;
  mpesaEnv?: 'sandbox' | 'production';
  commissionPct: number;
  subscriptionPlans?: SubscriptionPlanMeta[];
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
  product_key: 'analyzer' | 'drt_analyzer' | 'ea_bots';
  product_name: string;
  billing_cycle?: BillingCycle;
  duration_days?: number;
  subscription_starts_at?: string | null;
  subscription_ends_at?: string | null;
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

export type IctTradeVerdict = 'Actionable Trade' | 'Wait for Setup' | 'No Trade';

export interface IctConfluenceCheck {
  id: 'mss_displacement' | 'signal_alignment' | 'pd_array_in_zone' | 'min_rr_dol' | 'pd_equilibrium';
  label: string;
  passed: boolean;
  required: boolean;
  detail: string;
}

export interface IctSetupLifecycle {
  status: 'Locked Active' | 'Locked Waiting' | 'Unlocked (No Trade)';
  isLocked: boolean;
  lockedAt: string | null;
  lockedBarTime: string | null;
  lockedBarTimestampSec: number | null;
  lastClosedBarTime: string;
  invalidationLevel: number | null;
  invalidationRule: string;
  validationLevel: number | null;
  validationZone: string | null;
  validationRule: string;
  targetDolLevel: number | null;
  liveProximity:
    | 'In Entry Zone'
    | 'Approaching Entry'
    | 'Waiting for Retracement'
    | 'In Progress Toward TP1/TP2'
    | 'Stand Aside';
  lastTransitionEvent: string | null;
  fractalRole: string;
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
  dailyBias: 'Bullish' | 'Bearish' | 'Neutral';
  tradeVerdict: IctTradeVerdict;
  verdictHeadline: string;
  verdictSummary: string;
  noTradeReasons: string[];
  confluenceChecks: IctConfluenceCheck[];
  lifecycle?: IctSetupLifecycle;
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
    direction: 'Long (Buy)' | 'Short (Sell)' | 'No Trade';
    entryZone: string | null;
    entryArrayName?: string | null;
    stopLoss: number | null;
    tp1: number | null;
    tp2: number | null;
    rrRatio: number | null;
    projectedRrToDol?: number | null;
    confluences: string[];
  };
  candles: Candle[];
  ictReferenceChannel: string;
  dataSource?: 'tradingview_live';
  lastUpdated?: string;
}

export type DrtRangeType = 'Type 1' | 'Type 2' | 'Type 3';

export type DrtQuadrantLabel =
  | 'Deep Premium (75–100%)'
  | 'Upper Premium (50–75%)'
  | 'Equilibrium (50%)'
  | 'Lower Discount (25–50%)'
  | 'Deep Discount (0–25%)';

export type DrtZoneType =
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

export interface DrtZone {
  type: DrtZoneType;
  top: number;
  bottom: number;
  ceMid: number;
  startIndex: number;
  endIndex: number;
  mitigated: boolean;
  pdZone: 'Premium' | 'Discount' | 'Equilibrium';
  quadrant: DrtQuadrantLabel;
}

export type DrtPdArrayCategory =
  | 'DRH / External BSL (1.00)'
  | 'DRL / External SSL (0.00)'
  | 'Relative Equal Highs (EQH)'
  | 'Relative Equal Lows (EQL)'
  | 'Fair Value Gap (FVG)'
  | 'Order Block (OB)'
  | 'Breaker Block'
  | 'Mitigation Block'
  | 'Rejection Block'
  | 'Liquidity Void';

export interface DrtPdArrayItem {
  id: string;
  name: string;
  category: DrtPdArrayCategory;
  direction: 'Bullish' | 'Bearish' | 'Neutral';
  zone: 'Premium' | 'Discount' | 'Equilibrium';
  quadrant: DrtQuadrantLabel;
  priority: number;
  top: number;
  bottom: number;
  midpoint: number;
  status: 'Unmitigated' | 'In Zone' | 'Mitigated' | 'Target Liquidity';
  distancePct: number;
  description: string;
  startIndex: number;
}

export interface DrtDealingRange {
  drh: number;
  q75: number;
  eq50: number;
  q25: number;
  drl: number;
  sdPos25: number;
  sdPos50: number;
  sdNeg25: number;
  sdNeg50: number;
  rangeHighIndex: number;
  rangeLowIndex: number;
  currentPositionPct: number;
  currentZone: 'Premium' | 'Discount' | 'Equilibrium';
  quadrant: DrtQuadrantLabel;
  alignedWithBias: boolean;
  guidance: string;
}

export interface DrtSmtStatus {
  correlatedSymbol: string;
  inverseCorrelation: boolean;
  status: 'Bullish SMT Divergence' | 'Bearish SMT Divergence' | 'Aligned Correlation' | 'Unavailable';
  summary: string;
}

export interface DrtTriggerStatus {
  name:
    | '50% DRT Equilibrium Flip'
    | '25 DRT Discount Reclaim'
    | '75 DRT Premium Rejection'
    | 'DRH / DRL External Sweep'
    | 'Awaiting Quadrant Reaction';
  confirmed: boolean;
  triggerIndex: number | null;
  detail: string;
}

export interface DrtAnalysisResult {
  symbol: string;
  tvSymbol: string;
  tradingViewUrl: string;
  timeframe: string;
  currentPrice: number;
  bid: number | null;
  ask: number | null;
  changePct: number | null;
  bias: 'Bullish' | 'Bearish';
  rangeType: DrtRangeType;
  rangeTypeTitle: string;
  rangeTypeSummary: string;
  deliveryCycle: 'ERL → IRL (Rebalancing)' | 'IRL → ERL (Expanding)';
  deliveryCycleDetail: string;
  activeSessionWindow: string;
  dealingRange: DrtDealingRange;
  smt: DrtSmtStatus;
  trigger: DrtTriggerStatus;
  equalHighsLevel: number | null;
  equalLowsLevel: number | null;
  sweepIndex: number | null;
  sweepLabel: string;
  flipIndex: number | null;
  drawOnLiquidity: {
    label: string;
    price: number;
    side: 'DRH / Premium Liquidity' | 'DRL / Discount Liquidity' | '50% DRT Equilibrium';
  };
  pdArrays: DrtPdArrayItem[];
  zones: DrtZone[];
  setup: {
    direction: 'Long (Buy)' | 'Short (Sell)';
    entryModel: string;
    entryZone: string;
    entryArrayName: string;
    stopLoss: number;
    tp1: number;
    tp2: number;
    tp3: number;
    rrRatio: number;
    confluences: string[];
  };
  candles: Candle[];
  drtReferenceUrl: string;
  dataSource: 'tradingview_live';
  lastUpdated: string;
}

export interface JournalTrade {
  id: number;
  instrument: string;
  side: 'Buy' | 'Sell';
  entry_price?: number | null;
  exit_price?: number | null;
  sl?: number | null;
  tp?: number | null;
  size?: number | null;
  risk_pct?: number | null;
  rr?: number | null;
  r_multiple?: number | null;
  fees?: number | null;
  mfe?: number | null;
  mae?: number | null;
  pnl: number;
  trade_date: string;
  entry_time?: string | null;
  exit_time?: string | null;
  duration_min?: number | null;
  session?: string | null;
  strategy?: string | null;
  playbook?: string | null;
  setup_grade?: 'A+' | 'A' | 'B' | 'C' | string | null;
  mistakes_json?: string | null;
  confluences_json?: string | null;
  emotions?: string | null;
  rule_adherence_pct?: number | null;
  account_label?: string | null;
  rating?: number | null;
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
  openedAt?: string;
  playbook?: string;
  note?: string;
  riskUsd?: number | null;
}

export interface PaperPendingOrder {
  id: string;
  symbol: string;
  side: 'Buy' | 'Sell';
  orderType: 'Limit' | 'Stop';
  triggerPrice: number;
  size: number;
  sl?: number | null;
  tp?: number | null;
  playbook?: string;
  note?: string;
  createdAt: string;
}

export interface PaperHistoryItem {
  id: string;
  symbol: string;
  side: 'Buy' | 'Sell';
  size?: number;
  entry: number;
  exit: number;
  sl?: number | null;
  tp?: number | null;
  pnl: number;
  rMultiple?: number | null;
  playbook?: string;
  note?: string;
  closedAt: string;
  syncedToJournal?: boolean;
}

export interface TradingPlaybook {
  id: string;
  name: string;
  category: string;
  markets: string;
  timeframes: string;
  session: string;
  minRr: number;
  description: string;
  entryRules: string[];
  exitRules: string[];
  invalidationRule: string;
}

export interface ChecklistStageItem {
  id: string;
  text: string;
  checked: boolean;
}

export interface TradingPlanData {
  goals: string;
  entryRules: string;
  riskRules: string;
  preMarketRoutine?: string;
  postLossProtocol?: string;
  checked?: boolean[];
  riskLimits?: {
    maxRiskPerTradePct: number;
    maxDailyLossPct: number;
    maxWeeklyLossPct: number;
    maxTradesPerDay: number;
    dailyProfitTargetPct: number;
    accountSizeUsd: number;
  };
  playbooks?: TradingPlaybook[];
  checklists?: {
    preMarket: ChecklistStageItem[];
    preEntry: ChecklistStageItem[];
    duringTrade: ChecklistStageItem[];
    postSession: ChecklistStageItem[];
  };
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
