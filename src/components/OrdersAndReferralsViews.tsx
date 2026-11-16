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
} from 'lucide-react';
import { apiFetch } from '../lib/api';
import type { EmailLogItem, MpesaTransaction, Order, PublicConfig, User } from '../types';

/* ---------------- Responsive Billing, KES Wallet, Licenses & Order Ledger ---------------- */
export const OrdersDashboardView: React.FC<{
  orders: Order[];
  user?: User;
  config?: PublicConfig;
  onUserUpdated?: (user: User) => void;
  onResumePayment: (order: Order) => void;
  onBuyNew: (product: 'analyzer' | 'ea_bots') => void;
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
  const activeLicensesCount =
    (user?.hasAnalyzer ? 1 : 0) + (user?.hasEaBots ? 1 : 0);

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

  return (
    <div className="space-y-6">
      {/* Billing & Wallet KPI Summary */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-slate-950 text-white rounded-xl p-4">
          <div className="text-xs text-slate-400">Confirmed KES Wallet</div>
          <div className="text-xl font-bold font-mono tabular-nums text-emerald-400 mt-1">
            KES {walletBalanceKes.toLocaleString()}
          </div>
          <div className="text-[11px] text-slate-400 mt-0.5 tabular-nums">
            Credited on verified M-Pesa callback
          </div>
        </div>

        <div className="bg-white border border-slate-200 rounded-xl p-4">
          <div className="text-xs text-slate-500">Total Paid (Licenses)</div>
          <div className="text-xl font-bold font-mono tabular-nums text-emerald-700 mt-1">
            ${totalSpentUsd.toFixed(2)}
          </div>
          <div className="text-[11px] font-mono tabular-nums text-slate-500 mt-0.5">
            KES {totalSpentKes.toLocaleString()} ({paidOrders.length} settled)
          </div>
        </div>

        <div className="bg-white border border-slate-200 rounded-xl p-4">
          <div className="text-xs text-slate-500">Active Licenses</div>
          <div className="text-xl font-bold font-mono tabular-nums text-slate-950 mt-1">
            {activeLicensesCount} / 2
          </div>
          <div className="text-[11px] text-slate-500 mt-0.5">Lifetime access</div>
        </div>

        <div className="bg-white border border-slate-200 rounded-xl p-4">
          <div className="text-xs text-slate-500">Pending Verification</div>
          <div
            className={`text-xl font-bold font-mono tabular-nums mt-1 ${
              pendingCount > 0 ? 'text-amber-700' : 'text-slate-950'
            }`}
          >
            {pendingCount}
          </div>
          <div className="text-[11px] text-slate-500 mt-0.5">
            {pendingCount > 0 ? 'Awaiting confirmation' : 'All up to date'}
          </div>
        </div>
      </div>

      {/* Safaricom M-Pesa Wallet Deposit Card & Ledger */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
        <div className="lg:col-span-5 bg-white border border-slate-200 rounded-xl p-5 space-y-4">
          <div className="flex items-start justify-between gap-3">
            <div>
              <div className="flex items-center gap-2 text-xs font-semibold text-emerald-700">
                <Wallet className="w-4 h-4" />
                <span>Safaricom M-Pesa STK Deposit</span>
              </div>
              <h3 className="text-base font-bold text-slate-950 mt-1">Top Up KES Wallet</h3>
              <p className="text-xs text-slate-500 mt-0.5">
                Buy Goods Till <span className="font-mono font-semibold text-slate-800">{tillDisplay}</span> · Wallet credits automatically after verified Daraja confirmation.
              </p>
            </div>
          </div>

          {!config?.mpesaConfigured && (
            <div className="p-3 bg-amber-50 border border-amber-200 rounded-lg text-xs text-amber-900 leading-relaxed">
              Daraja STK Push awaits production credentials in server environment variables (<span className="font-mono">MPESA_CONSUMER_KEY</span>, <span className="font-mono">MPESA_CONSUMER_SECRET</span>, <span className="font-mono">MPESA_PASSKEY</span>, <span className="font-mono">MPESA_SHORTCODE</span>).
            </div>
          )}

          <form onSubmit={handleDepositSubmit} className="space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Amount (KES)</label>
                <input
                  type="number"
                  min={10}
                  max={150000}
                  required
                  value={depositAmountKes}
                  onChange={(e) => setDepositAmountKes(e.target.value)}
                  className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg font-mono tabular-nums focus:outline-none focus:border-slate-900"
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
                  className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg font-mono focus:outline-none focus:border-slate-900"
                  placeholder="0712345678"
                />
              </div>
            </div>

            {depositError && (
              <div className="p-2.5 bg-rose-50 border border-rose-200 rounded-lg text-xs text-rose-700 flex items-start gap-2">
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
                    <span className="capitalize">{activeTx.tx_reference} · {activeTx.status}</span>
                  </span>
                  <span className="font-mono tabular-nums">KES {Number(activeTx.amount_kes).toLocaleString()}</span>
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
                    className="mt-1 px-2.5 py-1 bg-slate-950 text-white rounded text-[11px] font-semibold inline-flex items-center gap-1 cursor-pointer disabled:opacity-60"
                  >
                    <RefreshCw className={`w-3 h-3 ${checkingTxId === activeTx.id ? 'animate-spin' : ''}`} />
                    <span>Verify Status Now</span>
                  </button>
                )}
              </div>
            )}

            <button
              type="submit"
              disabled={depositing}
              className="w-full py-2.5 px-4 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold rounded-lg inline-flex items-center justify-center gap-2 cursor-pointer disabled:opacity-60"
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

        <div className="lg:col-span-7 bg-white border border-slate-200 rounded-xl p-5 flex flex-col">
          <div className="flex items-center justify-between gap-2 mb-3">
            <div>
              <h3 className="text-sm font-bold text-slate-950">My M-Pesa STK Transactions</h3>
              <p className="text-xs text-slate-500">
                Real-time Daraja deposit &amp; payment confirmations
              </p>
            </div>
            <button
              type="button"
              onClick={() => void loadWalletSummary()}
              className="px-2.5 py-1 border border-slate-300 bg-white hover:bg-slate-50 text-xs font-semibold rounded-md inline-flex items-center gap-1 cursor-pointer"
            >
              <RefreshCw className="w-3 h-3" />
              <span>Sync</span>
            </button>
          </div>

          {mpesaTxs.length === 0 ? (
            <div className="flex-1 flex flex-col items-center justify-center py-8 text-center border border-dashed border-slate-200 rounded-lg">
              <Smartphone className="w-6 h-6 text-slate-300 mb-2" />
              <div className="text-xs font-semibold text-slate-700">No M-Pesa STK requests yet</div>
              <p className="text-[11px] text-slate-500 mt-0.5 max-w-xs">
                Initiate a KES deposit or license checkout via M-Pesa Daraja to track receipts and status here.
              </p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead>
                  <tr className="border-b border-slate-200 text-slate-500">
                    <th className="py-2 pr-3">Reference</th>
                    <th className="py-2 pr-3">Phone</th>
                    <th className="py-2 pr-3 text-right">Amount</th>
                    <th className="py-2 pr-3">Receipt</th>
                    <th className="py-2 pr-3">Status</th>
                    <th className="py-2 text-right">Check</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {mpesaTxs.slice(0, 8).map((tx) => (
                    <tr key={tx.id}>
                      <td className="py-2.5 pr-3">
                        <div className="font-mono font-semibold text-slate-900">{tx.tx_reference}</div>
                        <div className="text-[11px] text-slate-400">
                          {tx.purpose === 'wallet_deposit' ? 'Wallet Deposit' : 'Order Payment'} · {tx.created_at.slice(0, 16)}
                        </div>
                      </td>
                      <td className="py-2.5 pr-3 font-mono text-slate-600">+{tx.phone_number}</td>
                      <td className="py-2.5 pr-3 text-right font-mono tabular-nums font-semibold text-slate-950">
                        KES {Number(tx.amount_kes).toLocaleString()}
                      </td>
                      <td className="py-2.5 pr-3 font-mono text-slate-600">
                        {tx.mpesa_receipt_number || '—'}
                      </td>
                      <td className="py-2.5 pr-3 font-semibold capitalize">
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
                      <td className="py-2.5 text-right">
                        {tx.status === 'pending' ? (
                          <button
                            type="button"
                            disabled={checkingTxId === tx.id}
                            onClick={() => void pollDepositStatus(tx.id, true)}
                            className="px-2 py-1 bg-slate-950 text-white rounded text-[11px] font-semibold cursor-pointer disabled:opacity-60"
                          >
                            {checkingTxId === tx.id ? '...' : 'Check'}
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

      {/* License Entitlements Strip */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="bg-white border border-slate-200 rounded-xl p-5 flex items-center justify-between gap-4">
          <div className="space-y-1">
            <div className="flex items-center gap-2 text-xs font-semibold">
              {user?.hasAnalyzer ? (
                <span className="inline-flex items-center gap-1 text-emerald-700">
                  <Unlock className="w-3.5 h-3.5" />
                  <span>Active License</span>
                </span>
              ) : (
                <span className="inline-flex items-center gap-1 text-slate-500">
                  <Lock className="w-3.5 h-3.5" />
                  <span>Not Unlocked</span>
                </span>
              )}
              <span aria-hidden="true" className="text-slate-300">·</span>
              <span className="font-mono tabular-nums text-slate-500">
                ${(config?.analyzerPriceUsd ?? 5.25).toFixed(2)} / KES {(config?.analyzerPriceKes ?? 683).toLocaleString()}
              </span>
            </div>
            <h3 className="text-sm font-bold text-slate-950">ICT Strategy Market Analyzer</h3>
            <p className="text-xs text-slate-500">
              Live TradingView liquidity sweeps, OTE levels, and killzone structure bias.
            </p>
          </div>
          {user?.hasAnalyzer ? (
            <button
              type="button"
              onClick={() => onLaunchProduct?.('analyzer')}
              className="px-3.5 py-2 border border-slate-300 bg-white hover:bg-slate-50 text-slate-900 text-xs font-semibold rounded-lg whitespace-nowrap shrink-0 cursor-pointer"
            >
              Open Tool
            </button>
          ) : (
            <button
              type="button"
              onClick={() => onBuyNew('analyzer')}
              className="px-3.5 py-2 bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold rounded-lg whitespace-nowrap shrink-0 cursor-pointer"
            >
              Unlock Now
            </button>
          )}
        </div>

        <div className="bg-white border border-slate-200 rounded-xl p-5 flex items-center justify-between gap-4">
          <div className="space-y-1">
            <div className="flex items-center gap-2 text-xs font-semibold">
              {user?.hasEaBots ? (
                <span className="inline-flex items-center gap-1 text-emerald-700">
                  <Unlock className="w-3.5 h-3.5" />
                  <span>Active License</span>
                </span>
              ) : (
                <span className="inline-flex items-center gap-1 text-slate-500">
                  <Lock className="w-3.5 h-3.5" />
                  <span>Not Unlocked</span>
                </span>
              )}
              <span aria-hidden="true" className="text-slate-300">·</span>
              <span className="font-mono tabular-nums text-slate-500">
                ${(config?.eaBotsPriceUsd ?? 5.25).toFixed(2)} / KES {(config?.eaBotsPriceKes ?? 683).toLocaleString()}
              </span>
            </div>
            <h3 className="text-sm font-bold text-slate-950">MQL5 EA Bots Pack + MetaApi MT5 Bridge</h3>
            <p className="text-xs text-slate-500">
              Silver Bullet &amp; SMC Order Block EAs plus cloud MT5 automated trade execution.
            </p>
          </div>
          {user?.hasEaBots ? (
            <button
              type="button"
              onClick={() => onLaunchProduct?.('ea_bots')}
              className="px-3.5 py-2 border border-slate-300 bg-white hover:bg-slate-50 text-slate-900 text-xs font-semibold rounded-lg whitespace-nowrap shrink-0 cursor-pointer"
            >
              Open Bots
            </button>
          ) : (
            <button
              type="button"
              onClick={() => onBuyNew('ea_bots')}
              className="px-3.5 py-2 bg-slate-950 hover:bg-slate-800 text-white text-xs font-semibold rounded-lg whitespace-nowrap shrink-0 cursor-pointer"
            >
              Unlock Now
            </button>
          )}
        </div>
      </div>

      {/* Billing Ledger & Invoice History */}
      <div className="bg-white border border-slate-200 rounded-xl p-6 space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h3 className="text-base font-bold text-slate-950">Billing Ledger &amp; Payment Receipts</h3>
            <p className="text-xs text-slate-500 mt-0.5">
              Safaricom M-Pesa Daraja STK Push, manual Till verification, and on-chain crypto invoices.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <div className="relative">
              <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search order # or receipt..."
                className="pl-8 pr-3 py-1.5 text-xs border border-slate-300 rounded-lg bg-white focus:outline-none focus:border-slate-900 w-48"
              />
            </div>

            <div className="flex items-center gap-1 p-1 bg-slate-100 rounded-lg">
              {(['all', 'paid', 'processing', 'failed'] as const).map((f) => (
                <button
                  key={f}
                  type="button"
                  onClick={() => setFilter(f)}
                  className={`px-2.5 py-1 text-xs font-semibold rounded-md capitalize cursor-pointer whitespace-nowrap ${
                    filter === f ? 'bg-white text-slate-950 shadow-xs' : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  {f}
                </button>
              ))}
            </div>

            {onRefresh && (
              <button
                type="button"
                onClick={() => void handleRefresh()}
                disabled={refreshing}
                className="px-3 py-1.5 border border-slate-300 bg-white hover:bg-slate-50 text-xs font-semibold rounded-lg inline-flex items-center gap-1.5 cursor-pointer"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${refreshing ? 'animate-spin' : ''}`} />
                <span>Refresh</span>
              </button>
            )}
          </div>
        </div>

        {filtered.length === 0 ? (
          <div className="py-10 text-center space-y-3 border border-dashed border-slate-200 rounded-xl">
            <Receipt className="w-7 h-7 text-slate-300 mx-auto" />
            <div className="text-sm font-semibold text-slate-800">
              {orders.length === 0 ? 'No invoices yet' : 'No invoices match your filter'}
            </div>
            <p className="text-xs text-slate-500 max-w-md mx-auto">
              {orders.length === 0
                ? 'Select the ICT Market Analyzer or MQL5 EA Bots Pack above to generate your first M-Pesa Daraja or Crypto invoice.'
                : 'Try clearing your search filter or switching tabs.'}
            </p>
            {orders.length === 0 && (
              <button
                type="button"
                onClick={() => onBuyNew('analyzer')}
                className="px-4 py-2 bg-slate-950 text-white text-xs font-semibold rounded-lg hover:bg-slate-800 cursor-pointer"
              >
                Unlock ICT Analyzer ($5.25)
              </button>
            )}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b border-slate-200 text-xs text-slate-500">
                  <th className="py-2.5 pr-4">Invoice &amp; Date</th>
                  <th className="py-2.5 pr-4">Product</th>
                  <th className="py-2.5 pr-4">Method</th>
                  <th className="py-2.5 pr-4">Receipt / Reference</th>
                  <th className="py-2.5 pr-4 text-right">Amount</th>
                  <th className="py-2.5 pr-4">Status</th>
                  <th className="py-2.5 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filtered.map((o) => (
                  <tr key={o.id} className="hover:bg-slate-50/80">
                    <td className="py-3 pr-4">
                      <div className="font-mono text-xs font-semibold text-slate-950">
                        {o.order_number}
                      </div>
                      <div className="text-[11px] font-mono text-slate-500">
                        {o.created_at.slice(0, 16).replace('T', ' ')}
                      </div>
                    </td>
                    <td className="py-3 pr-4 text-xs font-medium text-slate-800">
                      {o.product_name}
                    </td>
                    <td className="py-3 pr-4 text-xs uppercase font-mono text-slate-600">
                      <div>{o.payment_method === 'mpesa' ? 'M-Pesa Daraja' : `${o.crypto_currency || 'Crypto'}`}</div>
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
                          className="px-2.5 py-1 bg-slate-950 hover:bg-slate-800 text-white text-xs font-semibold rounded-md cursor-pointer"
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
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Printable Official Receipt Modal */}
      {receiptOrder && (
        <div className="fixed inset-0 z-50 bg-slate-950/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white border border-slate-200 rounded-xl max-w-md w-full p-6 shadow-2xl space-y-5">
            <div className="flex items-start justify-between border-b border-slate-200 pb-4">
              <div>
                <div className="text-xs font-semibold text-emerald-700">Official Payment Receipt</div>
                <h3 className="text-lg font-bold text-slate-950 mt-0.5">
                  {config?.mpesaMerchantName || 'GRIDPIPs Trading'}
                </h3>
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
                <span className="text-slate-500">Licensed Product</span>
                <span className="font-semibold text-slate-900 text-right max-w-[220px]">
                  {receiptOrder.product_name}
                </span>
              </div>
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
                className="flex-1 py-2.5 px-4 bg-slate-950 hover:bg-slate-800 text-white text-xs font-semibold rounded-lg inline-flex items-center justify-center gap-1.5 cursor-pointer"
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

/* ---------------- Influencer & Referral System ---------------- */
export const ReferralsHubView: React.FC<{ config: PublicConfig }> = ({ config }) => {
  const [data, setData] = useState<{
    referralCode: string;
    commissionPct: number;
    clicks: number;
    signups: Array<{ id: number; name: string; exness_account_id: string; has_analyzer: number; has_ea_bots: number; created_at: string }>;
    totalEarned: number;
    availableBalance: number;
    payouts: Array<{ id: number; amount_usd: number; method: string; destination: string; status: string; created_at: string }>;
  } | null>(null);
  const [method, setMethod] = useState<'mpesa' | 'crypto'>('mpesa');
  const [destination, setDestination] = useState('');
  const [amountUsd, setAmountUsd] = useState('5.00');
  const [copied, setCopied] = useState(false);
  const [message, setMessage] = useState('');

  async function loadDashboard() {
    const res = await apiFetch<typeof data>('/api/referrals/dashboard');
    setData(res);
  }

  useEffect(() => {
    loadDashboard().catch(() => {});
  }, []);

  if (!data) {
    return <div className="bg-white border border-slate-200 rounded-xl p-6 text-sm text-slate-500">Loading referral telemetry...</div>;
  }

  const shareUrl = `${window.location.origin}/?ref=${data.referralCode}`;

  function copyLink() {
    navigator.clipboard.writeText(shareUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 1800);
  }

  async function requestPayout(e: React.FormEvent) {
    e.preventDefault();
    setMessage('');
    try {
      await apiFetch('/api/referrals/payout', {
        method: 'POST',
        body: JSON.stringify({ method, destination, amountUsd: Number(amountUsd) }),
      });
      setDestination('');
      setMessage('Payout request submitted and logged for admin settlement.');
      await loadDashboard();
    } catch (err) {
      setMessage(err instanceof Error ? err.message : 'Payout request failed');
    }
  }

  return (
    <div className="space-y-6">
      <div className="bg-slate-950 text-white rounded-xl p-6 flex flex-col lg:flex-row lg:items-center justify-between gap-6">
        <div>
          <div className="text-xs font-medium text-blue-400 mb-1">
            Influencer Partner Program · {data.commissionPct}% Commission per $5.25 Sale
          </div>
          <h2 className="text-xl font-bold">Share Your GRIDPIPs Link &amp; Earn Automated Payouts</h2>
          <p className="text-xs text-slate-300 mt-1">
            Earn ${(5.25 * (data.commissionPct / 100)).toFixed(2)} every time a referred trader purchases the ICT Analyzer or MQL5 EA Bots Pack.
          </p>
        </div>

        <div className="flex items-center gap-2 bg-slate-900 border border-slate-800 rounded-lg p-2.5 max-w-full">
          <span className="font-mono text-xs text-slate-200 truncate max-w-[260px]">{shareUrl}</span>
          <button
            onClick={copyLink}
            className="px-3 py-1.5 bg-blue-600 text-white text-xs font-semibold rounded-md hover:bg-blue-700 inline-flex items-center gap-1.5 shrink-0 cursor-pointer"
          >
            {copied ? <CheckCircle2 className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
            {copied ? 'Copied' : 'Copy Link'}
          </button>
        </div>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-white border border-slate-200 rounded-xl p-4">
          <div className="text-xs text-slate-500">Link Clicks</div>
          <div className="text-xl font-bold font-mono tabular-nums text-slate-950">{data.clicks}</div>
        </div>
        <div className="bg-white border border-slate-200 rounded-xl p-4">
          <div className="text-xs text-slate-500">Referred Traders</div>
          <div className="text-xl font-bold font-mono tabular-nums text-slate-950">{data.signups.length}</div>
        </div>
        <div className="bg-white border border-slate-200 rounded-xl p-4">
          <div className="text-xs text-slate-500">Lifetime Commissions</div>
          <div className="text-xl font-bold font-mono tabular-nums text-emerald-700">
            ${data.totalEarned.toFixed(2)}
          </div>
        </div>
        <div className="bg-white border border-slate-200 rounded-xl p-4">
          <div className="text-xs text-slate-500">Available for Payout</div>
          <div className="text-xl font-bold font-mono tabular-nums text-blue-600">
            ${data.availableBalance.toFixed(2)}
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        <form onSubmit={requestPayout} className="lg:col-span-5 bg-white border border-slate-200 rounded-xl p-6 space-y-4">
          <h3 className="text-base font-bold text-slate-950">Request Commission Payout</h3>
          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">Payout Method</label>
            <select
              value={method}
              onChange={(e) => setMethod(e.target.value === 'crypto' ? 'crypto' : 'mpesa')}
              className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg bg-white font-medium text-slate-900"
            >
              <option value="mpesa">M-Pesa (Kenya KES Mobile)</option>
              <option value="crypto">USDT (TRC20 Wallet)</option>
            </select>
          </div>
          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">
              {method === 'mpesa' ? 'M-Pesa Phone Number' : 'USDT TRC20 Wallet Address'}
            </label>
            <input
              required
              value={destination}
              onChange={(e) => setDestination(e.target.value)}
              placeholder={method === 'mpesa' ? '0712345678 or 254712345678' : 'TX...'}
              className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg font-mono"
            />
          </div>
          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">Amount (USD · Min $5.00)</label>
            <input
              type="number"
              step="0.01"
              min="5"
              required
              value={amountUsd}
              onChange={(e) => setAmountUsd(e.target.value)}
              className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg font-mono"
            />
          </div>
          {message && (
            <div className="p-2.5 bg-slate-50 border border-slate-200 text-xs text-slate-700 rounded-lg">
              {message}
            </div>
          )}
          <button
            type="submit"
            className="w-full py-2.5 bg-blue-600 text-white text-xs font-semibold rounded-lg hover:bg-blue-700 cursor-pointer"
          >
            Submit Payout Request
          </button>
          <a
            href={config.telegramUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="block text-center text-xs text-slate-500 hover:text-blue-600 pt-1"
          >
            Questions? Message JakoyoFX on Telegram <ArrowUpRight className="w-3 h-3 inline" />
          </a>
        </form>

        <div className="lg:col-span-7 bg-white border border-slate-200 rounded-xl p-6">
          <h3 className="text-base font-bold text-slate-950 mb-4">Referred Traders &amp; Payout History</h3>
          {data.signups.length === 0 ? (
            <p className="text-sm text-slate-500">No referred signups yet. Share your link above to start tracking conversions.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead>
                  <tr className="border-b border-slate-200 text-xs text-slate-500">
                    <th className="py-2 pr-4">Trader</th>
                    <th className="py-2 pr-4">Exness ID</th>
                    <th className="py-2 pr-4">Products Unlocked</th>
                    <th className="py-2 text-right">Joined</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {data.signups.map((s) => (
                    <tr key={s.id}>
                      <td className="py-2.5 pr-4 font-medium text-slate-900">{s.name}</td>
                      <td className="py-2.5 pr-4 font-mono text-xs text-slate-600">{s.exness_account_id}</td>
                      <td className="py-2.5 pr-4 text-xs text-slate-600">
                        {[s.has_analyzer ? 'Analyzer' : null, s.has_ea_bots ? 'EA Bots' : null]
                          .filter(Boolean)
                          .join(' · ') || 'Free Tier'}
                      </td>
                      <td className="py-2.5 text-right font-mono text-xs text-slate-500">
                        {s.created_at.slice(0, 10)}
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
    <div className="bg-white border border-slate-200 rounded-xl p-6">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-base font-bold text-slate-950 flex items-center gap-2">
          <Mail className="w-4 h-4 text-blue-600" />
          Automated Email Notifications
        </h3>
        <span className="text-xs text-slate-500">Dispatched on sign-in, purchases &amp; MT5 sync</span>
      </div>
      {emails.length === 0 ? (
        <p className="text-sm text-slate-500">No automated emails logged yet.</p>
      ) : (
        <div className="divide-y divide-slate-100">
          {emails.map((em) => (
            <div key={em.id} className="py-3.5">
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
  );
};
