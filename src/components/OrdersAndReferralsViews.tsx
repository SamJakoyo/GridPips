import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  Copy,
  CheckCircle2,
  Mail,
  ArrowUpRight,
  Receipt,
  Search,
  RefreshCw,
  Printer,
  X,
  Lock,
  Unlock,
  Clock,
  AlertCircle,
  Wallet,
  Smartphone,
  Loader2,
  ShieldCheck,
  Share2,
  Users,
  DollarSign,
  TrendingUp,
} from 'lucide-react';
import { apiFetch } from '../lib/api';
import { LANDING_IMAGES } from '../assets/landingImages';
import {
  computeCyclePricing,
  describeSubscriptionStatus,
  formatShortDate,
  getPlanSpec,
} from '../lib/subscriptions';
import type { BillingCycle, EmailLogItem, MpesaTransaction, Order, PublicConfig, User } from '../types';

const DEPOSIT_PRESETS_KES = [500, 1000, 2500, 5000] as const;

/* ---------------- Executive Subscriptions, KES Wallet & Billing Ledger ---------------- */
export const OrdersDashboardView: React.FC<{
  orders: Order[];
  user?: User;
  config?: PublicConfig;
  onUserUpdated?: (user: User) => void;
  onResumePayment: (order: Order) => void;
  onBuyNew: (product: 'analyzer' | 'ea_bots', cycle?: BillingCycle) => void;
  onRefresh?: () => Promise<void> | void;
  onLaunchProduct?: (product: 'analyzer' | 'ea_bots') => void;
}> = ({ orders, user, config, onUserUpdated, onResumePayment, onBuyNew, onRefresh, onLaunchProduct }) => {
  const [filter, setFilter] = useState<'all' | 'paid' | 'processing' | 'failed'>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [refreshing, setRefreshing] = useState(false);
  const [receiptOrder, setReceiptOrder] = useState<Order | null>(null);

  // KES Wallet & M-Pesa Daraja Deposit state
  const [walletBalanceKes, setWalletBalanceKes] = useState<number>(
    Number(user?.walletBalanceKes || 0)
  );
  const [mpesaTxs, setMpesaTxs] = useState<MpesaTransaction[]>([]);
  const [depositAmountKes, setDepositAmountKes] = useState('500');
  const [depositPhone, setDepositPhone] = useState('');
  const [depositing, setDepositing] = useState(false);
  const [depositError, setDepositError] = useState('');
  const [activeTx, setActiveTx] = useState<MpesaTransaction | null>(null);
  const [depositStatusMessage, setDepositStatusMessage] = useState('');
  const [checkingTxId, setCheckingTxId] = useState<number | null>(null);
  const pollTimerRef = useRef<number | null>(null);

  useEffect(() => {
    setWalletBalanceKes(Number(user?.walletBalanceKes || 0));
  }, [user?.walletBalanceKes]);

  const loadWalletSummary = useCallback(async () => {
    try {
      const res = await apiFetch<{ walletBalanceKes: number; transactions: MpesaTransaction[] }>(
        '/api/wallet/summary'
      );
      setWalletBalanceKes(Number(res.walletBalanceKes || 0));
      setMpesaTxs(res.transactions || []);
    } catch {
      // ignore
    }
  }, []);

  useEffect(() => {
    void loadWalletSummary();
    return () => {
      if (pollTimerRef.current) window.clearInterval(pollTimerRef.current);
    };
  }, [loadWalletSummary]);

  const pollDepositStatus = useCallback(
    async (txId: number, manual = false) => {
      if (manual) setCheckingTxId(txId);
      try {
        const res = await apiFetch<{
          status: 'pending' | 'completed' | 'failed' | 'cancelled';
          transaction: MpesaTransaction;
          user?: User;
          walletBalanceKes?: number;
          message?: string;
        }>(`/api/wallet/mpesa/${txId}/status`);

        setActiveTx(res.transaction);
        if (typeof res.walletBalanceKes === 'number') {
          setWalletBalanceKes(res.walletBalanceKes);
        }
        if (res.user) {
          onUserUpdated?.(res.user);
        }
        if (res.message) {
          setDepositStatusMessage(res.message);
        }
        if (res.status !== 'pending') {
          if (pollTimerRef.current) {
            window.clearInterval(pollTimerRef.current);
            pollTimerRef.current = null;
          }
          void loadWalletSummary();
        }
      } catch (err) {
        if (manual) {
          setDepositError(
            err instanceof Error ? err.message : 'Unable to query M-Pesa deposit status.'
          );
        }
      } finally {
        if (manual) setCheckingTxId(null);
      }
    },
    [loadWalletSummary, onUserUpdated]
  );

  useEffect(() => {
    if (pollTimerRef.current) {
      window.clearInterval(pollTimerRef.current);
      pollTimerRef.current = null;
    }
    if (!activeTx || activeTx.status !== 'pending') return;

    pollTimerRef.current = window.setInterval(() => {
      void pollDepositStatus(activeTx.id, false);
    }, 3500);

    return () => {
      if (pollTimerRef.current) {
        window.clearInterval(pollTimerRef.current);
        pollTimerRef.current = null;
      }
    };
  }, [activeTx, pollDepositStatus]);

  async function handleDepositSubmit(e: React.FormEvent) {
    e.preventDefault();
    setDepositError('');
    setDepositStatusMessage('');
    setDepositing(true);
    try {
      const res = await apiFetch<{
        transaction: MpesaTransaction;
        message: string;
      }>('/api/wallet/mpesa/deposit', {
        method: 'POST',
        body: JSON.stringify({
          phone: depositPhone,
          amountKes: Number(depositAmountKes),
        }),
      });
      setActiveTx(res.transaction);
      setDepositStatusMessage(res.message);
      await loadWalletSummary();
    } catch (err) {
      setDepositError(
        err instanceof Error ? err.message : 'Unable to send M-Pesa STK Push deposit request.'
      );
    } finally {
      setDepositing(false);
    }
  }

  const normalizedQuery = searchQuery.trim().toLowerCase();
  const filtered = orders.filter((o) => {
    if (filter === 'paid' && o.payment_status !== 'paid') return false;
    if (filter === 'processing' && !['pending', 'processing'].includes(o.payment_status)) return false;
    if (filter === 'failed' && !['failed', 'refunded'].includes(o.payment_status)) return false;

    if (!normalizedQuery) return true;
    const haystack = [
      o.order_number,
      o.product_name,
      o.mpesa_receipt,
      o.mpesa_checkout_id,
      o.mpesa_phone,
      o.crypto_tx_hash,
      o.payment_method,
    ]
      .filter(Boolean)
      .join(' ')
      .toLowerCase();
    return haystack.includes(normalizedQuery);
  });

  const paidOrders = orders.filter((o) => o.payment_status === 'paid');
  const totalSpentUsd = paidOrders.reduce((acc, o) => acc + Number(o.amount_usd || 0), 0);
  const totalSpentKes = paidOrders.reduce((acc, o) => acc + Number(o.amount_kes || 0), 0);
  const pendingCount = orders.filter((o) => ['pending', 'processing'].includes(o.payment_status)).length;
  const activeLicensesCount = (user?.hasAnalyzer ? 1 : 0) + (user?.hasEaBots ? 1 : 0);

  async function handleRefresh() {
    setRefreshing(true);
    try {
      await Promise.all([
        onRefresh ? Promise.resolve(onRefresh()) : Promise.resolve(),
        loadWalletSummary(),
      ]);
    } finally {
      setRefreshing(false);
    }
  }

  const tillDisplay = config?.mpesaPartyB || config?.mpesaTillNumber || '1921416';
  const merchantName = config?.mpesaMerchantName || 'AURVIK ENTERPRISES';
  const analyzerSubInfo = describeSubscriptionStatus(
    Boolean(user?.hasAnalyzer),
    user?.analyzerSubscriptionStatus,
    user?.analyzerExpiresAt,
    user?.analyzerDaysRemaining
  );
  const eaBotsSubInfo = describeSubscriptionStatus(
    Boolean(user?.hasEaBots),
    user?.eaBotsSubscriptionStatus,
    user?.eaBotsExpiresAt,
    user?.eaBotsDaysRemaining
  );

  return (
    <div className="space-y-6">
      {/* Unified Executive Subscriptions & Wallet Strip */}
      <div className="relative overflow-hidden rounded-xl border border-slate-900 bg-[#0B0F19] text-white">
        <img
          src={LANDING_IMAGES.gridPipsBanner}
          alt=""
          aria-hidden="true"
          referrerPolicy="no-referrer"
          className="absolute inset-0 w-full h-full object-cover opacity-15 pointer-events-none select-none"
        />
        <div
          aria-hidden="true"
          className="absolute inset-0 bg-gradient-to-r from-[#0B0F19] via-[#0B0F19]/92 to-[#0B0F19]/80 pointer-events-none"
        />

        <div className="relative z-10 px-6 py-5 border-b border-white/10 flex flex-wrap items-center justify-between gap-4">
          <div>
            <div className="text-[11px] font-mono uppercase tracking-[0.14em] text-[#E5A93C]">
              Subscription Desk &amp; Treasury · {merchantName}
            </div>
            <h2 className="text-lg sm:text-xl font-bold tracking-tight text-white mt-0.5">
              Subscriptions, KES Wallet &amp; Billing Ledger
            </h2>
          </div>
          <div className="flex items-center gap-2.5">
            <span className="text-xs font-mono text-slate-300 hidden sm:inline">
              Buy Goods Till <strong className="text-white">{tillDisplay}</strong>
            </span>
            {onRefresh && (
              <button
                type="button"
                onClick={() => void handleRefresh()}
                disabled={refreshing}
                className="px-3.5 py-2 border border-white/15 bg-white/5 hover:bg-white/10 text-white text-xs font-semibold rounded-lg inline-flex items-center gap-1.5 whitespace-nowrap shrink-0 cursor-pointer transition-colors disabled:opacity-60"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${refreshing ? 'animate-spin' : ''}`} />
                <span>Sync Ledger</span>
              </button>
            )}
          </div>
        </div>

        <div className="relative z-10 grid grid-cols-2 lg:grid-cols-4 divide-y lg:divide-y-0 divide-x divide-white/10">
          <div className="px-6 py-4">
            <div className="text-[11px] uppercase tracking-wider text-slate-400">Confirmed KES Wallet</div>
            <div className="text-2xl font-bold font-mono tabular-nums text-emerald-400 mt-1">
              KES {walletBalanceKes.toLocaleString()}
            </div>
            <div className="text-[11px] text-slate-400 mt-1">
              Auto-credited on verified Daraja callback
            </div>
          </div>

          <div className="px-6 py-4">
            <div className="text-[11px] uppercase tracking-wider text-slate-400">Subscription Spend</div>
            <div className="text-2xl font-bold font-mono tabular-nums text-white mt-1">
              ${totalSpentUsd.toFixed(2)}
            </div>
            <div className="text-[11px] font-mono tabular-nums text-slate-400 mt-1">
              KES {totalSpentKes.toLocaleString()} · {paidOrders.length} settled
            </div>
          </div>

          <div className="px-6 py-4">
            <div className="text-[11px] uppercase tracking-wider text-slate-400">Active Subscriptions</div>
            <div className="text-2xl font-bold font-mono tabular-nums text-[#E5A93C] mt-1">
              {activeLicensesCount} / 2
            </div>
            <div className="text-[11px] text-slate-400 mt-1">
              {activeLicensesCount === 2 ? 'Analyzer & EA Bots active' : 'Monthly, Quarterly & Annual plans'}
            </div>
          </div>

          <div className="px-6 py-4">
            <div className="text-[11px] uppercase tracking-wider text-slate-400">Pending Verification</div>
            <div
              className={`text-2xl font-bold font-mono tabular-nums mt-1 ${
                pendingCount > 0 ? 'text-amber-300' : 'text-white'
              }`}
            >
              {pendingCount}
            </div>
            <div className="text-[11px] text-slate-400 mt-1">
              {pendingCount > 0 ? 'Action required in ledger below' : 'All invoices reconciled'}
            </div>
          </div>
        </div>
      </div>

      {/* Active Subscriptions & Renewal Desk */}
      <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
        <div className="px-6 py-4 border-b border-slate-200 flex flex-wrap items-center justify-between gap-2">
          <div>
            <h3 className="text-sm font-bold text-slate-950">Active Subscriptions &amp; Renewal Plans</h3>
            <p className="text-xs text-slate-500 mt-0.5">
              Flexible 30-day Monthly, 90-day Quarterly (-10%), or 365-day Annual (-20%) plans. Early renewals automatically extend your current expiry date.
            </p>
          </div>
          <span className="text-xs font-mono text-slate-500">Account: {user?.exnessAccountId || 'Linked'}</span>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 divide-y lg:divide-y-0 lg:divide-x divide-slate-200">
          {/* ICT Analyzer Subscription Card */}
          <div className="p-6 flex flex-col justify-between gap-4">
            <div className="space-y-1.5 min-w-0">
              <div className="flex flex-wrap items-center gap-2 text-xs font-semibold">
                <span
                  className={`inline-flex items-center gap-1.5 ${
                    analyzerSubInfo.tone === 'emerald'
                      ? 'text-emerald-700'
                      : analyzerSubInfo.tone === 'rose'
                      ? 'text-rose-700'
                      : 'text-amber-700'
                  }`}
                >
                  {user?.hasAnalyzer ? <Unlock className="w-3.5 h-3.5" /> : <Lock className="w-3.5 h-3.5" />}
                  <span>{analyzerSubInfo.label}</span>
                </span>
                <span aria-hidden="true" className="text-slate-300">·</span>
                <span className="font-mono tabular-nums text-slate-600">
                  From ${(config?.analyzerPriceUsd ?? 5.25).toFixed(2)}/mo (KES {(config?.analyzerPriceKes ?? 683).toLocaleString()}/mo)
                </span>
              </div>
              <h4 className="text-base font-bold text-slate-950">ICT Strategy Market Analyzer</h4>
              <p className="text-xs text-slate-600 leading-relaxed">
                Dual TradingView charts, Premium/Discount dealing ranges, full PD Array matrix, and OTE trade setups.
              </p>
              <div className="text-[11px] font-mono text-slate-500 pt-1">
                {analyzerSubInfo.detail}
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-2 pt-2 border-t border-slate-100">
              {user?.hasAnalyzer ? (
                <>
                  <button
                    type="button"
                    onClick={() => onLaunchProduct?.('analyzer')}
                    className="px-4 py-2 border border-slate-300 bg-white hover:bg-slate-50 text-slate-900 text-xs font-semibold rounded-lg whitespace-nowrap shrink-0 cursor-pointer transition-colors"
                  >
                    Open Analyzer
                  </button>
                  <button
                    type="button"
                    onClick={() => onBuyNew('analyzer', 'monthly')}
                    className="px-4 py-2 bg-[#0B0F19] hover:bg-slate-800 text-[#E5A93C] text-xs font-bold rounded-lg whitespace-nowrap shrink-0 cursor-pointer transition-colors"
                  >
                    Renew / Extend Plan
                  </button>
                </>
              ) : (
                <>
                  <button
                    type="button"
                    onClick={() => onBuyNew('analyzer', 'monthly')}
                    className="px-4 py-2 bg-[#0B0F19] hover:bg-slate-800 text-[#E5A93C] text-xs font-bold rounded-lg whitespace-nowrap shrink-0 cursor-pointer transition-colors"
                  >
                    {user?.analyzerSubscriptionStatus === 'expired' ? 'Renew Monthly' : 'Subscribe Monthly'}
                  </button>
                  <button
                    type="button"
                    onClick={() => onBuyNew('analyzer', 'annual')}
                    className="px-3.5 py-2 border border-slate-300 bg-white hover:bg-slate-50 text-slate-800 text-xs font-semibold rounded-lg whitespace-nowrap shrink-0 cursor-pointer transition-colors"
                  >
                    Annual (-20%)
                  </button>
                </>
              )}
            </div>
          </div>

          {/* MQL5 EA Bots Subscription Card */}
          <div className="p-6 flex flex-col justify-between gap-4">
            <div className="space-y-1.5 min-w-0">
              <div className="flex flex-wrap items-center gap-2 text-xs font-semibold">
                <span
                  className={`inline-flex items-center gap-1.5 ${
                    eaBotsSubInfo.tone === 'emerald'
                      ? 'text-emerald-700'
                      : eaBotsSubInfo.tone === 'rose'
                      ? 'text-rose-700'
                      : 'text-amber-700'
                  }`}
                >
                  {user?.hasEaBots ? <Unlock className="w-3.5 h-3.5" /> : <Lock className="w-3.5 h-3.5" />}
                  <span>{eaBotsSubInfo.label}</span>
                </span>
                <span aria-hidden="true" className="text-slate-300">·</span>
                <span className="font-mono tabular-nums text-slate-600">
                  From ${(config?.eaBotsPriceUsd ?? 5.25).toFixed(2)}/mo (KES {(config?.eaBotsPriceKes ?? 683).toLocaleString()}/mo)
                </span>
              </div>
              <h4 className="text-base font-bold text-slate-950">MQL5 EA Bots Pack + MetaApi MT5 Bridge</h4>
              <p className="text-xs text-slate-600 leading-relaxed">
                Silver Bullet &amp; SMC Order Block .mq5 bots plus one-click MetaApi Cloud MT5 auto-execution.
              </p>
              <div className="text-[11px] font-mono text-slate-500 pt-1">
                {eaBotsSubInfo.detail}
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-2 pt-2 border-t border-slate-100">
              {user?.hasEaBots ? (
                <>
                  <button
                    type="button"
                    onClick={() => onLaunchProduct?.('ea_bots')}
                    className="px-4 py-2 border border-slate-300 bg-white hover:bg-slate-50 text-slate-900 text-xs font-semibold rounded-lg whitespace-nowrap shrink-0 cursor-pointer transition-colors"
                  >
                    Open EA Bots
                  </button>
                  <button
                    type="button"
                    onClick={() => onBuyNew('ea_bots', 'monthly')}
                    className="px-4 py-2 bg-[#0B0F19] hover:bg-slate-800 text-[#E5A93C] text-xs font-bold rounded-lg whitespace-nowrap shrink-0 cursor-pointer transition-colors"
                  >
                    Renew / Extend Plan
                  </button>
                </>
              ) : (
                <>
                  <button
                    type="button"
                    onClick={() => onBuyNew('ea_bots', 'monthly')}
                    className="px-4 py-2 bg-[#0B0F19] hover:bg-slate-800 text-[#E5A93C] text-xs font-bold rounded-lg whitespace-nowrap shrink-0 cursor-pointer transition-colors"
                  >
                    {user?.eaBotsSubscriptionStatus === 'expired' ? 'Renew Monthly' : 'Subscribe Monthly'}
                  </button>
                  <button
                    type="button"
                    onClick={() => onBuyNew('ea_bots', 'annual')}
                    className="px-3.5 py-2 border border-slate-300 bg-white hover:bg-slate-50 text-slate-800 text-xs font-semibold rounded-lg whitespace-nowrap shrink-0 cursor-pointer transition-colors"
                  >
                    Annual (-20%)
                  </button>
                </>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Safaricom M-Pesa Wallet Deposit & STK Feed */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-stretch">
        <div className="lg:col-span-5 bg-white border border-slate-200 rounded-xl overflow-hidden flex flex-col">
          <div className="px-6 py-4 border-b border-slate-200 flex items-center justify-between gap-2">
            <div>
              <div className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider text-emerald-700">
                <Wallet className="w-3.5 h-3.5" />
                <span>Safaricom M-Pesa Daraja</span>
              </div>
              <h3 className="text-base font-bold text-slate-950 mt-0.5">Top Up KES Wallet</h3>
            </div>
            <div className="text-right">
              <div className="text-[10px] uppercase tracking-wider text-slate-400">Buy Goods Till</div>
              <div className="text-xs font-mono font-bold text-slate-950">{tillDisplay}</div>
            </div>
          </div>

          <div className="p-6 space-y-4 flex-1 flex flex-col justify-between">
            <div className="space-y-4">
              <p className="text-xs text-slate-600 leading-relaxed">
                Merchant: <strong className="text-slate-900">{merchantName}</strong>. Enter your Safaricom number to receive an instant M-Pesa PIN prompt; your wallet credits automatically upon confirmed callback.
              </p>

              {!config?.mpesaConfigured && (
                <div className="p-3 bg-amber-50 border border-amber-200 rounded-lg text-xs text-amber-900 leading-relaxed">
                  Daraja STK Push awaits live credentials (<span className="font-mono">MPESA_CONSUMER_KEY</span>, <span className="font-mono">MPESA_CONSUMER_SECRET</span>, <span className="font-mono">MPESA_PASSKEY</span>, <span className="font-mono">MPESA_SHORTCODE</span>).
                </div>
              )}

              <div>
                <div className="text-[11px] font-semibold text-slate-500 mb-1.5">Quick Amount (KES)</div>
                <div className="grid grid-cols-4 gap-2">
                  {DEPOSIT_PRESETS_KES.map((preset) => {
                    const active = Number(depositAmountKes) === preset;
                    return (
                      <button
                        key={preset}
                        type="button"
                        onClick={() => setDepositAmountKes(String(preset))}
                        className={`py-1.5 px-2 text-xs font-mono tabular-nums font-semibold rounded-lg border cursor-pointer transition-colors ${
                          active
                            ? 'bg-[#0B0F19] border-[#0B0F19] text-[#E5A93C]'
                            : 'bg-white border-slate-200 text-slate-700 hover:border-slate-400'
                        }`}
                      >
                        {preset.toLocaleString()}
                      </button>
                    );
                  })}
                </div>
              </div>

              <form onSubmit={handleDepositSubmit} className="space-y-3.5">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">Amount (KES)</label>
                    <input
                      type="number"
                      min={10}
                      max={150000}
                      required
                      value={depositAmountKes}
                      onChange={(e) => setDepositAmountKes(e.target.value)}
                      className="w-full px-3 py-2.5 text-sm border border-slate-300 rounded-lg font-mono tabular-nums focus:outline-none focus:border-slate-900"
                      placeholder="500"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">M-Pesa Number</label>
                    <input
                      type="tel"
                      required
                      value={depositPhone}
                      onChange={(e) => setDepositPhone(e.target.value)}
                      className="w-full px-3 py-2.5 text-sm border border-slate-300 rounded-lg font-mono focus:outline-none focus:border-slate-900"
                      placeholder="0712345678"
                    />
                  </div>
                </div>

                {depositError && (
                  <div className="p-3 bg-rose-50 border border-rose-200 rounded-lg text-xs text-rose-700 flex items-start gap-2">
                    <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                    <span>{depositError}</span>
                  </div>
                )}

                {activeTx && (
                  <div
                    className={`p-3 rounded-lg border text-xs space-y-1.5 ${
                      activeTx.status === 'completed'
                        ? 'bg-emerald-50 border-emerald-200 text-emerald-900'
                        : activeTx.status === 'pending'
                        ? 'bg-slate-50 border-slate-200 text-slate-800'
                        : 'bg-amber-50 border-amber-200 text-amber-900'
                    }`}
                  >
                    <div className="flex items-center justify-between gap-2 font-semibold">
                      <span className="inline-flex items-center gap-1.5">
                        {activeTx.status === 'pending' ? (
                          <Loader2 className="w-3.5 h-3.5 animate-spin text-emerald-600" />
                        ) : activeTx.status === 'completed' ? (
                          <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
                        ) : (
                          <AlertCircle className="w-3.5 h-3.5 text-amber-700" />
                        )}
                        <span className="capitalize">
                          {activeTx.tx_reference} · {activeTx.status}
                        </span>
                      </span>
                      <span className="font-mono tabular-nums">
                        KES {Number(activeTx.amount_kes).toLocaleString()}
                      </span>
                    </div>
                    {depositStatusMessage && <p className="text-[11px]">{depositStatusMessage}</p>}
                    {activeTx.mpesa_receipt_number && (
                      <div className="font-mono text-[11px] font-semibold">
                        Receipt: {activeTx.mpesa_receipt_number}
                      </div>
                    )}
                    {activeTx.status === 'pending' && (
                      <button
                        type="button"
                        disabled={checkingTxId === activeTx.id}
                        onClick={() => void pollDepositStatus(activeTx.id, true)}
                        className="mt-1 px-2.5 py-1 bg-[#0B0F19] text-white rounded text-[11px] font-semibold inline-flex items-center gap-1 cursor-pointer disabled:opacity-60"
                      >
                        <RefreshCw
                          className={`w-3 h-3 ${checkingTxId === activeTx.id ? 'animate-spin' : ''}`}
                        />
                        <span>Verify Status Now</span>
                      </button>
                    )}
                  </div>
                )}

                <button
                  type="submit"
                  disabled={depositing}
                  className="w-full py-2.5 px-4 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold rounded-lg inline-flex items-center justify-center gap-2 cursor-pointer transition-colors disabled:opacity-60"
                >
                  {depositing ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <Smartphone className="w-4 h-4" />
                  )}
                  <span>
                    {depositing
                      ? 'Sending Daraja STK Prompt...'
                      : `Send M-Pesa STK Push (KES ${Number(depositAmountKes || 0).toLocaleString()})`}
                  </span>
                </button>
              </form>
            </div>

            <div className="pt-3 border-t border-slate-100 flex items-center gap-2 text-[11px] text-slate-500">
              <ShieldCheck className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
              <span>Encrypted Safaricom Daraja API · Instant receipt reconciliation</span>
            </div>
          </div>
        </div>

        <div className="lg:col-span-7 bg-white border border-slate-200 rounded-xl overflow-hidden flex flex-col">
          <div className="px-6 py-4 border-b border-slate-200 flex items-center justify-between gap-2">
            <div>
              <h3 className="text-sm font-bold text-slate-950">M-Pesa STK Transaction Feed</h3>
              <p className="text-xs text-slate-500 mt-0.5">
                Real-time Daraja wallet deposits &amp; checkout confirmations
              </p>
            </div>
            <button
              type="button"
              onClick={() => void loadWalletSummary()}
              className="px-3 py-1.5 border border-slate-300 bg-white hover:bg-slate-50 text-xs font-semibold rounded-lg inline-flex items-center gap-1.5 whitespace-nowrap shrink-0 cursor-pointer"
            >
              <RefreshCw className="w-3.5 h-3.5" />
              <span>Sync</span>
            </button>
          </div>

          <div className="p-6 flex-1 flex flex-col">
            {mpesaTxs.length === 0 ? (
              <div className="flex-1 flex flex-col items-center justify-center py-10 text-center">
                <div className="w-11 h-11 rounded-lg bg-slate-100 text-slate-400 flex items-center justify-center mb-3">
                  <Smartphone className="w-5 h-5" />
                </div>
                <div className="text-sm font-semibold text-slate-900">No M-Pesa STK activity yet</div>
                <p className="text-xs text-slate-500 mt-1 max-w-sm">
                  Initiate a KES wallet deposit on the left or start a subscription via M-Pesa Daraja to track live callbacks and receipts here.
                </p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead>
                    <tr className="border-b border-slate-200 text-[11px] uppercase tracking-wider text-slate-500">
                      <th className="py-2.5 pr-3">Reference</th>
                      <th className="py-2.5 pr-3">Phone</th>
                      <th className="py-2.5 pr-3 text-right">Amount</th>
                      <th className="py-2.5 pr-3">Receipt</th>
                      <th className="py-2.5 pr-3">Status</th>
                      <th className="py-2.5 text-right">Check</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {mpesaTxs.slice(0, 8).map((tx) => (
                      <tr key={tx.id} className="hover:bg-slate-50/70">
                        <td className="py-3 pr-3">
                          <div className="font-mono font-semibold text-slate-900">{tx.tx_reference}</div>
                          <div className="text-[11px] text-slate-400">
                            {tx.purpose === 'wallet_deposit' ? 'Wallet Deposit' : 'Subscription Checkout'} ·{' '}
                            {tx.created_at.slice(0, 16)}
                          </div>
                        </td>
                        <td className="py-3 pr-3 font-mono text-slate-600">+{tx.phone_number}</td>
                        <td className="py-3 pr-3 text-right font-mono tabular-nums font-semibold text-slate-950">
                          KES {Number(tx.amount_kes).toLocaleString()}
                        </td>
                        <td className="py-3 pr-3 font-mono text-slate-600">
                          {tx.mpesa_receipt_number || '—'}
                        </td>
                        <td className="py-3 pr-3 font-semibold capitalize">
                          <span
                            className={
                              tx.status === 'completed'
                                ? 'text-emerald-700'
                                : tx.status === 'pending'
                                ? 'text-amber-700'
                                : 'text-rose-700'
                            }
                          >
                            {tx.status}
                          </span>
                        </td>
                        <td className="py-3 text-right">
                          {tx.status === 'pending' ? (
                            <button
                              type="button"
                              disabled={checkingTxId === tx.id}
                              onClick={() => void pollDepositStatus(tx.id, true)}
                              className="px-2.5 py-1 bg-[#0B0F19] text-white rounded text-[11px] font-semibold cursor-pointer disabled:opacity-60"
                            >
                              {checkingTxId === tx.id ? '...' : 'Verify'}
                            </button>
                          ) : (
                            <span className="text-[11px] text-slate-400">—</span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Billing Ledger & Invoice History */}
      <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
        <div className="px-6 py-4 border-b border-slate-200 flex flex-wrap items-center justify-between gap-3">
          <div>
            <h3 className="text-base font-bold text-slate-950">Subscription Invoices &amp; Official Receipts</h3>
            <p className="text-xs text-slate-500 mt-0.5">
              Complete billing ledger of Monthly, Quarterly, and Annual subscription invoices and renewals.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <div className="relative">
              <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search invoice # or receipt..."
                className="pl-8 pr-3 py-1.5 text-xs border border-slate-300 rounded-lg bg-white focus:outline-none focus:border-slate-900 w-48"
              />
            </div>

            <div className="flex items-center gap-1 p-1 bg-slate-100 rounded-lg">
              {(['all', 'paid', 'processing', 'failed'] as const).map((f) => (
                <button
                  key={f}
                  type="button"
                  onClick={() => setFilter(f)}
                  className={`px-2.5 py-1 text-xs font-semibold rounded-md capitalize cursor-pointer whitespace-nowrap shrink-0 ${
                    filter === f ? 'bg-white text-slate-950 shadow-xs' : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  {f}
                </button>
              ))}
            </div>
          </div>
        </div>

        <div className="p-6">
          {filtered.length === 0 ? (
            <div className="py-10 text-center space-y-3">
              <div className="w-11 h-11 rounded-lg bg-slate-100 text-slate-400 flex items-center justify-center mx-auto">
                <Receipt className="w-5 h-5" />
              </div>
              <div className="text-sm font-semibold text-slate-900">
                {orders.length === 0 ? 'No subscription invoices yet' : 'No invoices match your filter'}
              </div>
              <p className="text-xs text-slate-500 max-w-md mx-auto">
                {orders.length === 0
                  ? 'Subscribe to the ICT Market Analyzer or MQL5 EA Bots Pack above to generate your first M-Pesa Daraja or Crypto subscription invoice.'
                  : 'Try clearing your search term or switching status tabs.'}
              </p>
              {orders.length === 0 && !user?.hasAnalyzer && (
                <button
                  type="button"
                  onClick={() => onBuyNew('analyzer', 'monthly')}
                  className="px-4 py-2 bg-[#0B0F19] text-[#E5A93C] text-xs font-bold rounded-lg hover:bg-slate-800 cursor-pointer"
                >
                  Subscribe to ICT Analyzer (${(config?.analyzerPriceUsd ?? 5.25).toFixed(2)}/mo)
                </button>
              )}
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead>
                  <tr className="border-b border-slate-200 text-[11px] uppercase tracking-wider text-slate-500">
                    <th className="py-2.5 pr-4">Invoice &amp; Date</th>
                    <th className="py-2.5 pr-4">Subscription Plan &amp; Coverage</th>
                    <th className="py-2.5 pr-4">Method</th>
                    <th className="py-2.5 pr-4">Receipt / Reference</th>
                    <th className="py-2.5 pr-4 text-right">Amount</th>
                    <th className="py-2.5 pr-4">Status</th>
                    <th className="py-2.5 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {filtered.map((o) => {
                    const planSpec = getPlanSpec(o.billing_cycle);
                    return (
                    <tr key={o.id} className="hover:bg-slate-50/80">
                      <td className="py-3 pr-4">
                        <div className="font-mono text-xs font-semibold text-slate-950">
                          {o.order_number}
                        </div>
                        <div className="text-[11px] font-mono text-slate-500">
                          {o.created_at.slice(0, 16).replace('T', ' ')}
                        </div>
                      </td>
                      <td className="py-3 pr-4 text-xs">
                        <div className="font-semibold text-slate-900">{o.product_name}</div>
                        <div className="text-[11px] font-mono text-slate-500 mt-0.5">
                          {planSpec.label} ({o.duration_days || planSpec.durationDays}d)
                          {o.subscription_ends_at
                            ? ` · Valid thru ${formatShortDate(o.subscription_ends_at)}`
                            : ''}
                        </div>
                      </td>
                      <td className="py-3 pr-4 text-xs uppercase font-mono text-slate-600">
                        <div>
                          {o.payment_method === 'mpesa'
                            ? 'M-Pesa Daraja'
                            : `${o.crypto_currency || 'Crypto'}`}
                        </div>
                        {o.mpesa_phone && (
                          <div className="text-[11px] text-slate-400">+{o.mpesa_phone}</div>
                        )}
                      </td>
                      <td className="py-3 pr-4 font-mono text-xs text-slate-600 max-w-[190px]">
                        <div className="truncate">
                          {o.mpesa_receipt ||
                            o.crypto_tx_hash ||
                            o.mpesa_checkout_id ||
                            'Awaiting checkout'}
                        </div>
                        {o.mpesa_result_desc && o.payment_status !== 'paid' && (
                          <div className="text-[11px] font-sans text-slate-500 truncate">
                            {o.mpesa_result_desc}
                          </div>
                        )}
                      </td>
                      <td className="py-3 pr-4 text-right font-mono tabular-nums font-semibold text-slate-950">
                        <div>${Number(o.amount_usd).toFixed(2)}</div>
                        {Number(o.amount_kes) > 0 && (
                          <div className="text-[11px] font-normal text-slate-500">
                            KES {Number(o.amount_kes).toLocaleString()}
                          </div>
                        )}
                      </td>
                      <td className="py-3 pr-4">
                        {o.payment_status === 'paid' ? (
                          <span className="inline-flex items-center gap-1 text-xs font-semibold text-emerald-700">
                            <CheckCircle2 className="w-3.5 h-3.5" />
                            <span>Paid</span>
                          </span>
                        ) : o.payment_status === 'processing' ? (
                          <span className="inline-flex items-center gap-1 text-xs font-semibold text-amber-700">
                            <Clock className="w-3.5 h-3.5" />
                            <span>Processing</span>
                          </span>
                        ) : o.payment_status === 'failed' || o.payment_status === 'refunded' ? (
                          <span className="inline-flex items-center gap-1 text-xs font-semibold text-rose-700 capitalize">
                            <AlertCircle className="w-3.5 h-3.5" />
                            <span>{o.payment_status}</span>
                          </span>
                        ) : (
                          <span className="text-xs font-semibold text-slate-500">Pending</span>
                        )}
                      </td>
                      <td className="py-3 text-right whitespace-nowrap space-x-2">
                        {o.payment_status === 'paid' ? (
                          <button
                            type="button"
                            onClick={() => setReceiptOrder(o)}
                            className="px-2.5 py-1 border border-slate-300 bg-white hover:bg-slate-50 text-slate-800 text-xs font-semibold rounded-md inline-flex items-center gap-1 cursor-pointer"
                          >
                            <Receipt className="w-3 h-3" />
                            <span>Receipt</span>
                          </button>
                        ) : (
                          <button
                            type="button"
                            onClick={() => onResumePayment(o)}
                            className="px-2.5 py-1 bg-[#0B0F19] hover:bg-slate-800 text-[#E5A93C] text-xs font-semibold rounded-md cursor-pointer"
                          >
                            {o.payment_status === 'processing' && o.mpesa_checkout_id
                              ? 'Check STK'
                              : o.payment_status === 'failed'
                              ? 'Retry Pay'
                              : 'Complete Pay'}
                          </button>
                        )}
                      </td>
                    </tr>
                  );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>

      {/* Printable Official Receipt Modal */}
      {receiptOrder && (
        <div className="fixed inset-0 z-50 bg-slate-950/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white border border-slate-200 rounded-xl max-w-md w-full p-6 shadow-2xl space-y-5">
            <div className="flex items-start justify-between border-b border-slate-200 pb-4">
              <div>
                <div className="text-xs font-semibold text-emerald-700">Official Payment Receipt</div>
                <h3 className="text-lg font-bold text-slate-950 mt-0.5">{merchantName}</h3>
                <div className="text-xs font-mono text-slate-500 mt-0.5">
                  {receiptOrder.order_number}
                </div>
              </div>
              <button
                type="button"
                onClick={() => setReceiptOrder(null)}
                className="p-1.5 text-slate-400 hover:text-slate-800 rounded-lg cursor-pointer"
                aria-label="Close receipt"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-2.5 text-xs">
              <div className="flex justify-between py-1 border-b border-slate-100">
                <span className="text-slate-500">Customer</span>
                <span className="font-semibold text-slate-900">
                  {user?.name || receiptOrder.user_name || 'Verified Trader'}
                </span>
              </div>
              {user?.email && (
                <div className="flex justify-between py-1 border-b border-slate-100">
                  <span className="text-slate-500">Account Email</span>
                  <span className="font-mono text-slate-800">{user.email}</span>
                </div>
              )}
              <div className="flex justify-between py-1 border-b border-slate-100">
                <span className="text-slate-500">Subscription Module</span>
                <span className="font-semibold text-slate-900 text-right max-w-[220px]">
                  {receiptOrder.product_name}
                </span>
              </div>
              <div className="flex justify-between py-1 border-b border-slate-100">
                <span className="text-slate-500">Billing Cycle</span>
                <span className="font-mono text-slate-900">
                  {getPlanSpec(receiptOrder.billing_cycle).label} ({receiptOrder.duration_days || getPlanSpec(receiptOrder.billing_cycle).durationDays} days)
                </span>
              </div>
              {receiptOrder.subscription_ends_at && (
                <div className="flex justify-between py-1 border-b border-slate-100">
                  <span className="text-slate-500">Coverage Window</span>
                  <span className="font-mono text-emerald-700">
                    {formatShortDate(receiptOrder.subscription_starts_at || receiptOrder.paid_at || receiptOrder.created_at)} – {formatShortDate(receiptOrder.subscription_ends_at)}
                  </span>
                </div>
              )}
              <div className="flex justify-between py-1 border-b border-slate-100">
                <span className="text-slate-500">Payment Method</span>
                <span className="font-mono uppercase text-slate-900">
                  {receiptOrder.payment_method === 'mpesa'
                    ? 'Safaricom M-Pesa Daraja'
                    : `${receiptOrder.crypto_currency || 'Crypto'} (${receiptOrder.crypto_network || 'Mainnet'})`}
                </span>
              </div>
              <div className="flex justify-between py-1 border-b border-slate-100">
                <span className="text-slate-500">Confirmation Reference</span>
                <span className="font-mono font-semibold text-emerald-700 break-all text-right max-w-[210px]">
                  {receiptOrder.mpesa_receipt ||
                    receiptOrder.crypto_tx_hash ||
                    receiptOrder.mpesa_checkout_id ||
                    'Confirmed'}
                </span>
              </div>
              <div className="flex justify-between py-1 border-b border-slate-100">
                <span className="text-slate-500">Paid Date</span>
                <span className="font-mono text-slate-800">
                  {(receiptOrder.paid_at || receiptOrder.created_at).slice(0, 19).replace('T', ' ')} UTC
                </span>
              </div>
              <div className="flex justify-between pt-2 text-sm">
                <span className="font-bold text-slate-950">Total Settled</span>
                <span className="font-mono font-bold tabular-nums text-slate-950">
                  ${Number(receiptOrder.amount_usd).toFixed(2)} USD
                  {Number(receiptOrder.amount_kes) > 0
                    ? ` (KES ${Number(receiptOrder.amount_kes).toLocaleString()})`
                    : ''}
                </span>
              </div>
            </div>

            <div className="flex items-center gap-2 pt-2">
              <button
                type="button"
                onClick={() => window.print()}
                className="flex-1 py-2.5 px-4 bg-[#0B0F19] hover:bg-slate-800 text-[#E5A93C] text-xs font-bold rounded-lg inline-flex items-center justify-center gap-1.5 cursor-pointer"
              >
                <Printer className="w-3.5 h-3.5" />
                <span>Print / Save PDF</span>
              </button>
              <button
                type="button"
                onClick={() => setReceiptOrder(null)}
                className="py-2.5 px-4 border border-slate-300 bg-white hover:bg-slate-50 text-slate-700 text-xs font-semibold rounded-lg cursor-pointer"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

/* ---------------- Institutional Influencer & Partner Dashboard ---------------- */
interface ReferralDashboardResponse {
  referralCode: string;
  role?: 'user' | 'influencer' | 'admin';
  commissionPct: number;
  isCustomCommission?: boolean;
  analyzerPriceUsd?: number;
  eaBotsPriceUsd?: number;
  usdKesRate?: number;
  clicks: number;
  paidConversions?: number;
  signups: Array<{
    id: number;
    name: string;
    email?: string;
    exness_account_id: string;
    exness_verified?: number;
    has_analyzer: number;
    has_ea_bots: number;
    paid_orders_count?: number;
    commission_earned_usd?: number;
    created_at: string;
  }>;
  totalEarned: number;
  paidOutTotal?: number;
  pendingPayoutTotal?: number;
  availableBalance: number;
  payouts: Array<{
    id: number;
    amount_usd: number;
    method: string;
    destination: string;
    status: string;
    created_at: string;
    processed_at?: string | null;
  }>;
}

export const ReferralsHubView: React.FC<{ config: PublicConfig }> = ({ config }) => {
  const [data, setData] = useState<ReferralDashboardResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [activeLedgerTab, setActiveLedgerTab] = useState<'signups' | 'payouts'>('signups');
  const [method, setMethod] = useState<'mpesa' | 'crypto'>('mpesa');
  const [destination, setDestination] = useState('');
  const [amountUsd, setAmountUsd] = useState('5.00');
  const [submitting, setSubmitting] = useState(false);
  const [copiedLink, setCopiedLink] = useState(false);
  const [copiedPromo, setCopiedPromo] = useState(false);
  const [feedback, setFeedback] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  const loadDashboard = useCallback(async (isRefresh = false) => {
    if (isRefresh) setRefreshing(true);
    try {
      const res = await apiFetch<ReferralDashboardResponse>('/api/referrals/dashboard');
      setData(res);
    } catch {
      // keep existing
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    void loadDashboard(false);
  }, [loadDashboard]);

  if (loading || !data) {
    return (
      <div className="bg-white border border-slate-200 rounded-xl p-8 flex items-center gap-3 text-sm text-slate-600">
        <Loader2 className="w-4 h-4 animate-spin text-amber-600" />
        <span>Syncing influencer partner ledger from cloud database...</span>
      </div>
    );
  }

  const shareUrl = `${window.location.origin}/?ref=${data.referralCode}`;
  const productPrice = Number(data.analyzerPriceUsd || config.analyzerPriceUsd || 5.25);
  const usdKesRate = Number(data.usdKesRate || 130);
  const monthlyPrice = computeCyclePricing(productPrice, usdKesRate, 'monthly').amountUsd;
  const quarterlyPrice = computeCyclePricing(productPrice, usdKesRate, 'quarterly').amountUsd;
  const annualPrice = computeCyclePricing(productPrice, usdKesRate, 'annual').amountUsd;
  const perMonthlyUsd = Number((monthlyPrice * (data.commissionPct / 100)).toFixed(2));
  const perQuarterlyUsd = Number((quarterlyPrice * (data.commissionPct / 100)).toFixed(2));
  const perAnnualUsd = Number((annualPrice * (data.commissionPct / 100)).toFixed(2));
  const conversionRate =
    data.clicks > 0 ? Math.min(100, Math.round((data.signups.length / data.clicks) * 1000) / 10) : 0;
  const paidOutTotal = Number(data.paidOutTotal || 0);
  const pendingPayoutTotal = Number(data.pendingPayoutTotal || 0);
  const paidConversions = Number(data.paidConversions || 0);

  function copyLink() {
    navigator.clipboard.writeText(shareUrl);
    setCopiedLink(true);
    setTimeout(() => setCopiedLink(false), 1800);
  }

  function copyPromoScript() {
    const script = `Trade with institutional ICT Premium & Discount PD Arrays, dual TradingView charts, and MQL5 EA Bots on Grid Pips. Register free with my partner link: ${shareUrl}`;
    navigator.clipboard.writeText(script);
    setCopiedPromo(true);
    setTimeout(() => setCopiedPromo(false), 1800);
  }

  async function requestPayout(e: React.FormEvent) {
    e.preventDefault();
    setFeedback(null);
    setSubmitting(true);
    try {
      await apiFetch('/api/referrals/payout', {
        method: 'POST',
        body: JSON.stringify({ method, destination, amountUsd: Number(amountUsd) }),
      });
      setDestination('');
      setFeedback({
        type: 'success',
        text: 'Payout request submitted and saved to the Admin disbursement queue.',
      });
      setActiveLedgerTab('payouts');
      await loadDashboard(true);
    } catch (err) {
      setFeedback({
        type: 'error',
        text: err instanceof Error ? err.message : 'Payout request failed.',
      });
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="space-y-6">
      {/* Partner Console Hero */}
      <div className="rounded-xl overflow-hidden border border-slate-900 bg-[#0B0F19] text-white">
        <div className="grid grid-cols-1 lg:grid-cols-12 items-stretch">
          <div className="lg:col-span-8 p-6 sm:p-8 flex flex-col justify-between gap-6">
            <div className="space-y-2.5">
              <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] font-mono uppercase tracking-[0.14em] text-[#E5A93C]">
                <span>Influencer Partner Desk</span>
                <span aria-hidden="true" className="text-white/25">·</span>
                <span>
                  {data.commissionPct}% Recurring Payout{data.isCustomCommission ? ' (Custom Tier)' : ''}
                </span>
                <span aria-hidden="true" className="text-white/25">·</span>
                <span>Code: {data.referralCode}</span>
              </div>
              <h2 className="text-xl sm:text-2xl font-bold tracking-tight text-white">
                Earn {data.commissionPct}% on Every New Subscription &amp; Renewal
              </h2>
              <p className="text-xs sm:text-sm text-slate-300 leading-relaxed max-w-2xl">
                Share your tracked Grid Pips URL across Telegram, YouTube, X, or WhatsApp. You earn <strong className="text-white">${perMonthlyUsd.toFixed(2)}</strong> per Monthly plan, <strong className="text-white">${perQuarterlyUsd.toFixed(2)}</strong> per Quarterly plan, and <strong className="text-white">${perAnnualUsd.toFixed(2)}</strong> per Annual plan — paid repeatedly on every renewal via M-Pesa KES or USDT TRC20.
              </p>
            </div>

            <div className="space-y-2.5">
              <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2 bg-white/5 border border-white/15 rounded-lg p-2">
                <div className="flex-1 px-2.5 py-1.5 font-mono text-xs text-slate-100 truncate select-all">
                  {shareUrl}
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <button
                    type="button"
                    onClick={copyLink}
                    className="px-3.5 py-2 bg-[#E5A93C] hover:bg-[#d6982b] text-[#090806] text-xs font-bold rounded-md inline-flex items-center gap-1.5 whitespace-nowrap shrink-0 cursor-pointer transition-colors"
                  >
                    {copiedLink ? <CheckCircle2 className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                    <span>{copiedLink ? 'Link Copied' : 'Copy Link'}</span>
                  </button>
                  <button
                    type="button"
                    onClick={copyPromoScript}
                    className="px-3 py-2 border border-white/20 hover:bg-white/10 text-white text-xs font-semibold rounded-md inline-flex items-center gap-1.5 whitespace-nowrap shrink-0 cursor-pointer transition-colors"
                  >
                    {copiedPromo ? <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" /> : <Share2 className="w-3.5 h-3.5" />}
                    <span>{copiedPromo ? 'Copied Pitch' : 'Copy Pitch'}</span>
                  </button>
                </div>
              </div>
            </div>
          </div>

          <div className="lg:col-span-4 relative min-h-[190px] border-t lg:border-t-0 lg:border-l border-white/10 overflow-hidden bg-slate-950">
            <img
              src={LANDING_IMAGES.mentorCommunity3d}
              alt="Grid Pips partner network and trader community"
              referrerPolicy="no-referrer"
              className="w-full h-full object-cover object-center"
            />
            <div
              aria-hidden="true"
              className="absolute inset-0 bg-gradient-to-t from-[#0B0F19] via-[#0B0F19]/55 to-transparent"
            />
            <div className="absolute inset-x-0 bottom-0 p-5 flex items-end justify-between gap-3">
              <div>
                <div className="text-[11px] uppercase tracking-wider text-slate-300">Available to Withdraw</div>
                <div className="text-2xl font-bold font-mono tabular-nums text-[#E5A93C]">
                  ${data.availableBalance.toFixed(2)}
                </div>
                <div className="text-[11px] font-mono text-slate-300">
                  ≈ KES {Math.round(data.availableBalance * usdKesRate).toLocaleString()}
                </div>
              </div>
              <button
                type="button"
                onClick={() => void loadDashboard(true)}
                disabled={refreshing}
                className="p-2 border border-white/20 bg-black/40 hover:bg-black/60 text-white rounded-lg cursor-pointer"
                title="Refresh partner stats"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${refreshing ? 'animate-spin' : ''}`} />
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* 4-Column Partner Performance KPI Strip */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-white border border-slate-200 rounded-xl p-5">
          <div className="flex items-center justify-between text-xs text-slate-500">
            <span>Tracked Link Clicks</span>
            <TrendingUp className="w-4 h-4 text-slate-400" />
          </div>
          <div className="text-2xl font-bold font-mono tabular-nums text-slate-950 mt-2">
            {data.clicks.toLocaleString()}
          </div>
          <div className="text-[11px] text-slate-500 mt-1 tabular-nums">
            {conversionRate}% click-to-signup rate
          </div>
        </div>

        <div className="bg-white border border-slate-200 rounded-xl p-5">
          <div className="flex items-center justify-between text-xs text-slate-500">
            <span>Referred Traders</span>
            <Users className="w-4 h-4 text-slate-400" />
          </div>
          <div className="text-2xl font-bold font-mono tabular-nums text-slate-950 mt-2">
            {data.signups.length.toLocaleString()}
          </div>
          <div className="text-[11px] text-slate-500 mt-1 tabular-nums">
            {paidConversions} paid subscription payment{paidConversions === 1 ? '' : 's'}
          </div>
        </div>

        <div className="bg-white border border-slate-200 rounded-xl p-5">
          <div className="flex items-center justify-between text-xs text-slate-500">
            <span>Lifetime Commissions</span>
            <DollarSign className="w-4 h-4 text-emerald-600" />
          </div>
          <div className="text-2xl font-bold font-mono tabular-nums text-emerald-700 mt-2">
            ${data.totalEarned.toFixed(2)}
          </div>
          <div className="text-[11px] font-mono tabular-nums text-slate-500 mt-1">
            Disbursed: ${paidOutTotal.toFixed(2)}
          </div>
        </div>

        <div className="bg-white border border-slate-200 rounded-xl p-5">
          <div className="flex items-center justify-between text-xs text-slate-500">
            <span>Available Balance</span>
            <Wallet className="w-4 h-4 text-amber-600" />
          </div>
          <div className="text-2xl font-bold font-mono tabular-nums text-slate-950 mt-2">
            ${data.availableBalance.toFixed(2)}
          </div>
          <div className="text-[11px] font-mono tabular-nums text-slate-500 mt-1">
            {pendingPayoutTotal > 0 ? `Pending queue: $${pendingPayoutTotal.toFixed(2)}` : 'Min payout $5.00'}
          </div>
        </div>
      </div>

      {/* Payout Request Form + Referred Traders / Payout History Ledger */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        <form
          onSubmit={requestPayout}
          className="lg:col-span-5 bg-white border border-slate-200 rounded-xl overflow-hidden"
        >
          <div className="px-6 py-4 border-b border-slate-200 flex items-center justify-between gap-2">
            <div>
              <h3 className="text-sm font-bold text-slate-950">Request Commission Payout</h3>
              <p className="text-xs text-slate-500 mt-0.5">
                Processed directly by the Grid Pips treasury desk
              </p>
            </div>
            <span className="font-mono text-xs font-semibold tabular-nums text-emerald-700">
              ${data.availableBalance.toFixed(2)} avail.
            </span>
          </div>

          <div className="p-6 space-y-4">
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1.5">Payout Channel</label>
              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => setMethod('mpesa')}
                  className={`py-2 px-3 text-xs font-semibold rounded-lg border cursor-pointer transition-colors ${
                    method === 'mpesa'
                      ? 'bg-[#0B0F19] border-[#0B0F19] text-[#E5A93C]'
                      : 'bg-white border-slate-300 text-slate-700 hover:bg-slate-50'
                  }`}
                >
                  M-Pesa (KES)
                </button>
                <button
                  type="button"
                  onClick={() => setMethod('crypto')}
                  className={`py-2 px-3 text-xs font-semibold rounded-lg border cursor-pointer transition-colors ${
                    method === 'crypto'
                      ? 'bg-[#0B0F19] border-[#0B0F19] text-[#E5A93C]'
                      : 'bg-white border-slate-300 text-slate-700 hover:bg-slate-50'
                  }`}
                >
                  USDT (TRC20)
                </button>
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                {method === 'mpesa' ? 'M-Pesa Phone Number' : 'USDT TRC20 Wallet Address'}
              </label>
              <input
                required
                value={destination}
                onChange={(e) => setDestination(e.target.value)}
                placeholder={method === 'mpesa' ? '0712345678 or 254712345678' : 'T... (TRC20 address)'}
                className="w-full px-3 py-2.5 text-sm border border-slate-300 rounded-lg font-mono focus:outline-none focus:border-slate-900"
              />
            </div>

            <div>
              <div className="flex items-center justify-between mb-1">
                <label className="block text-xs font-semibold text-slate-700">
                  Amount (USD · Min $5.00)
                </label>
                {data.availableBalance >= 5 && (
                  <button
                    type="button"
                    onClick={() => setAmountUsd(data.availableBalance.toFixed(2))}
                    className="text-[11px] font-semibold text-amber-700 hover:text-amber-800 cursor-pointer"
                  >
                    Use Max (${data.availableBalance.toFixed(2)})
                  </button>
                )}
              </div>
              <input
                type="number"
                step="0.01"
                min="5"
                required
                value={amountUsd}
                onChange={(e) => setAmountUsd(e.target.value)}
                className="w-full px-3 py-2.5 text-sm border border-slate-300 rounded-lg font-mono tabular-nums focus:outline-none focus:border-slate-900"
              />
              {method === 'mpesa' && Number(amountUsd) > 0 && (
                <div className="text-[11px] font-mono text-slate-500 mt-1 tabular-nums">
                  Estimated M-Pesa disbursement: KES{' '}
                  {Math.round(Number(amountUsd) * usdKesRate).toLocaleString()} (@ {usdKesRate} KES/USD)
                </div>
              )}
            </div>

            {feedback && (
              <div
                className={`p-3 rounded-lg border text-xs flex items-start gap-2 ${
                  feedback.type === 'success'
                    ? 'bg-emerald-50 border-emerald-200 text-emerald-900'
                    : 'bg-rose-50 border-rose-200 text-rose-800'
                }`}
              >
                {feedback.type === 'success' ? (
                  <CheckCircle2 className="w-4 h-4 shrink-0 mt-0.5 text-emerald-600" />
                ) : (
                  <AlertCircle className="w-4 h-4 shrink-0 mt-0.5 text-rose-600" />
                )}
                <span>{feedback.text}</span>
              </div>
            )}

            <button
              type="submit"
              disabled={submitting}
              className="w-full py-2.5 px-4 bg-[#0B0F19] hover:bg-slate-800 text-[#E5A93C] text-xs font-bold rounded-lg inline-flex items-center justify-center gap-2 cursor-pointer transition-colors disabled:opacity-60"
            >
              {submitting && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
              <span>{submitting ? 'Submitting Request...' : 'Submit Payout Request'}</span>
            </button>

            <a
              href={config.telegramUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="block text-center text-xs text-slate-500 hover:text-slate-900 pt-1"
            >
              Partner support via Telegram <ArrowUpRight className="w-3 h-3 inline" />
            </a>
          </div>
        </form>

        <div className="lg:col-span-7 bg-white border border-slate-200 rounded-xl overflow-hidden">
          <div className="px-6 py-4 border-b border-slate-200 flex flex-wrap items-center justify-between gap-3">
            <div>
              <h3 className="text-sm font-bold text-slate-950">Partner Activity Ledger</h3>
              <p className="text-xs text-slate-500 mt-0.5">
                Track referred trader signups, recurring subscription commissions, and disbursement status
              </p>
            </div>
            <div className="flex items-center gap-1 p-1 bg-slate-100 rounded-lg">
              <button
                type="button"
                onClick={() => setActiveLedgerTab('signups')}
                className={`px-3 py-1.5 text-xs font-semibold rounded-md cursor-pointer whitespace-nowrap shrink-0 ${
                  activeLedgerTab === 'signups'
                    ? 'bg-white text-slate-950 shadow-xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                Referred Traders ({data.signups.length})
              </button>
              <button
                type="button"
                onClick={() => setActiveLedgerTab('payouts')}
                className={`px-3 py-1.5 text-xs font-semibold rounded-md cursor-pointer whitespace-nowrap shrink-0 ${
                  activeLedgerTab === 'payouts'
                    ? 'bg-white text-slate-950 shadow-xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                Payout History ({data.payouts.length})
              </button>
            </div>
          </div>

          <div className="p-6">
            {activeLedgerTab === 'signups' ? (
              data.signups.length === 0 ? (
                <div className="py-10 text-center space-y-2">
                  <div className="w-11 h-11 rounded-lg bg-slate-100 text-slate-400 flex items-center justify-center mx-auto">
                    <Users className="w-5 h-5" />
                  </div>
                  <div className="text-sm font-semibold text-slate-900">No referred traders yet</div>
                  <p className="text-xs text-slate-500 max-w-sm mx-auto">
                    Copy your referral link or promo pitch above to start tracking signups and earning {data.commissionPct}% commissions.
                  </p>
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-xs">
                    <thead>
                      <tr className="border-b border-slate-200 text-[11px] uppercase tracking-wider text-slate-500">
                        <th className="py-2.5 pr-3">Trader</th>
                        <th className="py-2.5 pr-3">Exness ID</th>
                        <th className="py-2.5 pr-3">Unlocked</th>
                        <th className="py-2.5 pr-3 text-right">Commission</th>
                        <th className="py-2.5 text-right">Joined</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {data.signups.map((s) => (
                        <tr key={s.id} className="hover:bg-slate-50/70">
                          <td className="py-3 pr-3">
                            <div className="font-semibold text-slate-900">{s.name}</div>
                            {s.email && <div className="text-[11px] text-slate-400">{s.email}</div>}
                          </td>
                          <td className="py-3 pr-3 font-mono text-slate-600">{s.exness_account_id}</td>
                          <td className="py-3 pr-3 text-slate-700 font-medium">
                            {[s.has_analyzer ? 'ICT Analyzer' : null, s.has_ea_bots ? 'EA Bots' : null]
                              .filter(Boolean)
                              .join(' · ') || 'Free Tier'}
                          </td>
                          <td className="py-3 pr-3 text-right font-mono tabular-nums font-semibold text-emerald-700">
                            ${Number(s.commission_earned_usd || 0).toFixed(2)}
                          </td>
                          <td className="py-3 text-right font-mono text-slate-500">
                            {s.created_at.slice(0, 10)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )
            ) : data.payouts.length === 0 ? (
              <div className="py-10 text-center space-y-2">
                <div className="w-11 h-11 rounded-lg bg-slate-100 text-slate-400 flex items-center justify-center mx-auto">
                  <Wallet className="w-5 h-5" />
                </div>
                <div className="text-sm font-semibold text-slate-900">No payout requests yet</div>
                <p className="text-xs text-slate-500 max-w-sm mx-auto">
                  Once your available balance reaches $5.00, submit a payout via M-Pesa or USDT TRC20 on the left to track settlement here.
                </p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead>
                    <tr className="border-b border-slate-200 text-[11px] uppercase tracking-wider text-slate-500">
                      <th className="py-2.5 pr-3">Date</th>
                      <th className="py-2.5 pr-3">Channel</th>
                      <th className="py-2.5 pr-3">Destination</th>
                      <th className="py-2.5 pr-3 text-right">Amount</th>
                      <th className="py-2.5 text-right">Status</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {data.payouts.map((p) => (
                      <tr key={p.id} className="hover:bg-slate-50/70">
                        <td className="py-3 pr-3 font-mono text-slate-600">
                          {p.created_at.slice(0, 10)}
                        </td>
                        <td className="py-3 pr-3 font-mono uppercase text-slate-700">{p.method}</td>
                        <td className="py-3 pr-3 font-mono text-slate-600 max-w-[180px] truncate">
                          {p.destination}
                        </td>
                        <td className="py-3 pr-3 text-right font-mono tabular-nums font-semibold text-slate-950">
                          ${Number(p.amount_usd).toFixed(2)}
                        </td>
                        <td className="py-3 text-right font-semibold capitalize">
                          <span
                            className={
                              p.status === 'paid'
                                ? 'text-emerald-700'
                                : p.status === 'rejected'
                                ? 'text-rose-700'
                                : 'text-amber-700'
                            }
                          >
                            {p.status}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

/* ---------------- Automated Email Notifications Inbox ---------------- */
export const EmailsInboxView: React.FC = () => {
  const [emails, setEmails] = useState<EmailLogItem[]>([]);

  useEffect(() => {
    apiFetch<{ emails: EmailLogItem[] }>('/api/notifications/emails')
      .then((res) => setEmails(res.emails || []))
      .catch(() => {});
  }, []);

  return (
    <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
      <div className="px-6 py-4 border-b border-slate-200 flex items-center justify-between gap-2">
        <h3 className="text-base font-bold text-slate-950 flex items-center gap-2">
          <Mail className="w-4 h-4 text-amber-600" />
          <span>Automated Email Notifications</span>
        </h3>
        <span className="text-xs text-slate-500">Dispatched on sign-in, purchases &amp; payouts</span>
      </div>
      <div className="p-6">
        {emails.length === 0 ? (
          <p className="text-sm text-slate-500">No automated emails logged yet.</p>
        ) : (
          <div className="divide-y divide-slate-100">
            {emails.map((em) => (
              <div key={em.id} className="py-3.5 first:pt-0 last:pb-0">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="text-sm font-semibold text-slate-950">{em.subject}</span>
                  <span className="text-xs font-mono text-slate-500">
                    {em.category} · {em.delivery_status} · {em.created_at}
                  </span>
                </div>
                <p className="text-xs text-slate-600 mt-1">{em.body_preview}</p>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};
