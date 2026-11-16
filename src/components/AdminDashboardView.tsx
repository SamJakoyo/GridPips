import React, { useEffect, useState } from 'react';
import { ShieldAlert, Check, XCircle, RefreshCw, Search, Smartphone } from 'lucide-react';
import { apiFetch } from '../lib/api';
import type { EmailLogItem, MpesaTransaction, Order, SecurityLogItem } from '../types';

interface AdminOverviewResponse {
  metrics: {
    totalRevenueUsd: number;
    totalRevenueKes: number;
    paidOrdersCount: number;
    totalUsers: number;
  };
  mpesaMetrics?: {
    totalDepositedKes: number;
    walletDepositedKes: number;
    completedCount: number;
    pendingCount: number;
    failedOrCancelledCount: number;
  };
  mpesaConfigAudit?: {
    configured: boolean;
    env: 'sandbox' | 'production';
    rawEnvSet: boolean;
    consumerKeySet: boolean;
    consumerSecretSet: boolean;
    passkeySet: boolean;
    shortCode: string;
    partyB: string;
    transactionType: string;
    callbackUrl: string | null;
    callbackSecretSet: boolean;
    mismatchWarnings: string[];
  };
  users: Array<{
    id: number;
    name: string;
    email: string;
    role: 'user' | 'influencer' | 'admin';
    exness_account_id: string;
    exness_verified: number;
    referral_code: string;
    has_analyzer: number;
    has_ea_bots: number;
    mt5_connected: number;
    mt5_login: string | null;
    wallet_balance_kes?: number;
    is_suspended: number;
    created_at: string;
    last_login_at: string | null;
  }>;
  orders: Order[];
  mpesaTransactions?: MpesaTransaction[];
  payouts: Array<{
    id: number;
    user_name: string;
    user_email: string;
    amount_usd: number;
    method: string;
    destination: string;
    status: string;
    created_at: string;
  }>;
  securityLogs: SecurityLogItem[];
  emailLogs: EmailLogItem[];
  settings: Record<string, string>;
}

interface SupabaseHealthResponse {
  status?: string;
  configured: boolean;
  reachable: boolean;
  cloudSync?: {
    configured: boolean;
    tablesReady: boolean;
    missingTables?: string[];
  };
  envDiagnostics?: {
    hasSecretKeyMisplacedInUrl?: boolean;
    supabaseUrlValid?: boolean;
    missingSessionSecret?: boolean;
    sessionSecretStrong?: boolean;
    missingMetaApiEnvVars?: string[];
    metaApiConfigured?: boolean;
    metaApiProfileConfigured?: boolean;
    missingMpesaDarajaEnvVars?: string[];
    mpesaDarajaConfigured?: boolean;
    mpesaDarajaEnv?: 'sandbox' | 'production';
    mpesaTransactionType?: string;
  };
}

export const AdminDashboardView: React.FC<{ onConfigSaved: () => Promise<void> }> = ({
  onConfigSaved,
}) => {
  const [tab, setTab] = useState<'orders' | 'mpesa' | 'users' | 'security' | 'payouts' | 'emails' | 'settings'>('orders');
  const [data, setData] = useState<AdminOverviewResponse | null>(null);
  const [health, setHealth] = useState<SupabaseHealthResponse | null>(null);
  const [mpesaSearch, setMpesaSearch] = useState('');
  const [mpesaFilter, setMpesaFilter] = useState<'all' | 'completed' | 'pending' | 'cancelled' | 'failed'>('all');
  const [settingsForm, setSettingsForm] = useState<Record<string, string>>({});
  const [savingSettings, setSavingSettings] = useState(false);
  const [feedback, setFeedback] = useState('');
  const [darajaTesting, setDarajaTesting] = useState(false);
  const [darajaTestResult, setDarajaTestResult] = useState<{ ok: boolean; message: string } | null>(null);

  async function loadAdmin() {
    const [res, healthRes] = await Promise.all([
      apiFetch<AdminOverviewResponse>('/api/admin/overview'),
      apiFetch<SupabaseHealthResponse>('/api/health/supabase').catch(() => null),
    ]);
    setData(res);
    setSettingsForm(res.settings);
    if (healthRes) setHealth(healthRes);
  }

  useEffect(() => {
    loadAdmin().catch(() => {});
  }, []);

  if (!data) {
    return (
      <div className="bg-white border border-slate-200 rounded-xl p-6 text-sm text-slate-500">
        Loading Admin Command Center...
      </div>
    );
  }

  async function updateOrderStatus(orderId: number, status: 'paid' | 'failed' | 'refunded') {
    await apiFetch(`/api/admin/orders/${orderId}/status`, {
      method: 'POST',
      body: JSON.stringify({ status }),
    });
    await loadAdmin();
  }

  async function updateUser(
    userId: number,
    patch: {
      role?: 'user' | 'influencer' | 'admin';
      isSuspended?: boolean;
      hasAnalyzer?: boolean;
      hasEaBots?: boolean;
      exnessVerified?: boolean;
    }
  ) {
    await apiFetch(`/api/admin/users/${userId}/update`, {
      method: 'POST',
      body: JSON.stringify(patch),
    });
    await loadAdmin();
  }

  async function updatePayoutStatus(payoutId: number, status: 'paid' | 'rejected') {
    await apiFetch(`/api/admin/payouts/${payoutId}/status`, {
      method: 'POST',
      body: JSON.stringify({ status }),
    });
    await loadAdmin();
  }

  async function handleSaveSettings(e: React.FormEvent) {
    e.preventDefault();
    setSavingSettings(true);
    setFeedback('');
    try {
      await apiFetch('/api/admin/settings', {
        method: 'POST',
        body: JSON.stringify(settingsForm),
      });
      await onConfigSaved();
      await loadAdmin();
      setFeedback('Platform settings updated live across the site.');
    } finally {
      setSavingSettings(false);
    }
  }

  async function handleTestDaraja() {
    setDarajaTesting(true);
    setDarajaTestResult(null);
    try {
      const res = await apiFetch<{ ok: boolean; message: string }>('/api/admin/mpesa/test', {
        method: 'POST',
      });
      setDarajaTestResult(res);
    } catch (err) {
      setDarajaTestResult({
        ok: false,
        message: err instanceof Error ? err.message : 'Daraja verification failed.',
      });
    } finally {
      setDarajaTesting(false);
    }
  }

  async function handleResetStaleStk() {
    setDarajaTesting(true);
    setDarajaTestResult(null);
    try {
      const res = await apiFetch<{ ok: boolean; message: string }>('/api/admin/mpesa/reset-stale', {
        method: 'POST',
      });
      setDarajaTestResult(res);
      await loadAdmin();
    } catch (err) {
      setDarajaTestResult({
        ok: false,
        message: err instanceof Error ? err.message : 'Unable to reset STK state.',
      });
    } finally {
      setDarajaTesting(false);
    }
  }

  return (
    <div className="space-y-6">
      {/* Admin KPIs */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-slate-950 text-white rounded-xl p-5">
          <div className="text-xs text-slate-400">Website Revenue (USD / KES)</div>
          <div className="text-2xl font-bold font-mono tabular-nums text-emerald-400 mt-1">
            ${data.metrics.totalRevenueUsd.toFixed(2)}
          </div>
          <div className="text-xs font-mono text-slate-400 mt-0.5">
            KES {Number(data.metrics.totalRevenueKes || 0).toLocaleString()}
          </div>
        </div>
        <div className="bg-white border border-slate-200 rounded-xl p-5">
          <div className="text-xs text-slate-500">Paid Orders</div>
          <div className="text-2xl font-bold font-mono tabular-nums text-slate-950 mt-1">
            {data.metrics.paidOrdersCount}
          </div>
        </div>
        <div className="bg-white border border-slate-200 rounded-xl p-5">
          <div className="text-xs text-slate-500">Registered Exness Users</div>
          <div className="text-2xl font-bold font-mono tabular-nums text-slate-950 mt-1">
            {data.metrics.totalUsers}
          </div>
        </div>
        <div className="bg-white border border-slate-200 rounded-xl p-5">
          <div className="text-xs text-slate-500">Security Events Logged</div>
          <div className="text-2xl font-bold font-mono tabular-nums text-blue-600 mt-1">
            {data.securityLogs.length}
          </div>
        </div>
      </div>

      {/* Navigation Tabs */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex flex-wrap gap-1 p-1 bg-slate-200/70 rounded-lg">
          {(
            [
              ['orders', 'Revenue & Orders'],
              ['mpesa', 'M-Pesa Deposits'],
              ['users', 'Users & Logins'],
              ['security', 'Security Center'],
              ['payouts', 'Influencer Payouts'],
              ['emails', 'Email Logs'],
              ['settings', 'Site Config'],
            ] as const
          ).map(([key, label]) => (
            <button
              key={key}
              onClick={() => setTab(key)}
              className={`px-3.5 py-1.5 text-xs font-semibold rounded-md cursor-pointer ${
                tab === key ? 'bg-white text-slate-950 shadow-xs' : 'text-slate-600'
              }`}
            >
              {label}
            </button>
          ))}
        </div>

        <button
          onClick={() => loadAdmin()}
          className="px-3 py-1.5 border border-slate-300 bg-white text-xs font-semibold rounded-lg hover:bg-slate-50 inline-flex items-center gap-1.5 cursor-pointer"
        >
          <RefreshCw className="w-3.5 h-3.5" />
          Refresh
        </button>
      </div>

      {/* Tab 1: Orders & Revenue */}
      {tab === 'orders' && (
        <div className="bg-white border border-slate-200 rounded-xl p-6 overflow-x-auto">
          <div className="flex flex-wrap items-center justify-between gap-2 mb-4">
            <h3 className="text-base font-bold text-slate-950">All Customer Orders &amp; Verification Queue</h3>
            <span className="text-xs font-mono text-slate-500">
              {data.orders.filter((o) => o.payment_status === 'processing').length} awaiting settlement check
            </span>
          </div>
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-b border-slate-200 text-xs text-slate-500">
                <th className="py-2 pr-4">Order</th>
                <th className="py-2 pr-4">Customer</th>
                <th className="py-2 pr-4">Product</th>
                <th className="py-2 pr-4">Gateway / Reference</th>
                <th className="py-2 pr-4 text-right">Amount</th>
                <th className="py-2 pr-4">Status</th>
                <th className="py-2 text-right">Controls</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {data.orders.map((o) => (
                <tr key={o.id}>
                  <td className="py-3 pr-4 font-mono text-xs font-semibold">{o.order_number}</td>
                  <td className="py-3 pr-4 text-xs">
                    <div className="font-semibold text-slate-900">{o.user_name}</div>
                    <div className="text-slate-500">{o.user_email}</div>
                  </td>
                  <td className="py-3 pr-4 text-xs text-slate-700">{o.product_name}</td>
                  <td className="py-3 pr-4 text-xs font-mono text-slate-600">
                    <div className="uppercase font-semibold">
                      {o.payment_method}{' '}
                      {o.mpesa_receipt
                        ? `(${o.mpesa_receipt})`
                        : o.crypto_tx_hash
                        ? `(${o.crypto_tx_hash.slice(0, 12)}...)`
                        : o.mpesa_phone
                        ? `(+${o.mpesa_phone})`
                        : ''}
                    </div>
                    {o.mpesa_checkout_id && (
                      <div className="text-[11px] text-slate-400 truncate max-w-[180px]">
                        {o.mpesa_checkout_id}
                      </div>
                    )}
                  </td>
                  <td className="py-3 pr-4 text-right font-mono tabular-nums font-semibold">
                    <div>${Number(o.amount_usd).toFixed(2)}</div>
                    {Number(o.amount_kes) > 0 && (
                      <div className="text-[11px] font-normal text-slate-500">
                        KES {Number(o.amount_kes).toLocaleString()}
                      </div>
                    )}
                  </td>
                  <td className="py-3 pr-4 text-xs font-semibold capitalize">
                    <span
                      className={
                        o.payment_status === 'paid'
                          ? 'text-emerald-700'
                          : o.payment_status === 'processing'
                          ? 'text-amber-700'
                          : o.payment_status === 'failed' || o.payment_status === 'refunded'
                          ? 'text-rose-700'
                          : 'text-slate-600'
                      }
                    >
                      {o.payment_status}
                    </span>
                  </td>
                  <td className="py-3 text-right space-x-2 whitespace-nowrap">
                    {o.payment_status !== 'paid' && (
                      <button
                        onClick={() => updateOrderStatus(o.id, 'paid')}
                        className="px-2.5 py-1 bg-emerald-600 text-white text-xs font-semibold rounded cursor-pointer"
                      >
                        Approve &amp; Unlock
                      </button>
                    )}
                    {o.payment_status === 'processing' && (
                      <button
                        onClick={() => updateOrderStatus(o.id, 'failed')}
                        className="px-2.5 py-1 border border-rose-300 text-rose-700 text-xs font-semibold rounded cursor-pointer"
                      >
                        Reject
                      </button>
                    )}
                    {o.payment_status === 'paid' && (
                      <button
                        onClick={() => updateOrderStatus(o.id, 'refunded')}
                        className="px-2.5 py-1 border border-slate-300 text-slate-700 text-xs font-semibold rounded cursor-pointer"
                      >
                        Refund
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Tab 2: M-Pesa Daraja Deposits & Callback Monitor */}
      {tab === 'mpesa' && (
        <div className="space-y-5">
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            <div className="bg-slate-950 text-white rounded-xl p-4">
              <div className="text-xs text-slate-400">Confirmed M-Pesa Volume</div>
              <div className="text-xl font-bold font-mono tabular-nums text-emerald-400 mt-1">
                KES {Number(data.mpesaMetrics?.totalDepositedKes || 0).toLocaleString()}
              </div>
              <div className="text-[11px] font-mono tabular-nums text-slate-400 mt-0.5">
                Wallet Top-ups: KES {Number(data.mpesaMetrics?.walletDepositedKes || 0).toLocaleString()}
              </div>
            </div>
            <div className="bg-white border border-slate-200 rounded-xl p-4">
              <div className="text-xs text-slate-500">Completed STK Payments</div>
              <div className="text-xl font-bold font-mono tabular-nums text-emerald-700 mt-1">
                {data.mpesaMetrics?.completedCount ?? 0}
              </div>
              <div className="text-[11px] text-slate-500 mt-0.5">Verified ResultCode 0</div>
            </div>
            <div className="bg-white border border-slate-200 rounded-xl p-4">
              <div className="text-xs text-slate-500">Pending STK Prompts</div>
              <div className="text-xl font-bold font-mono tabular-nums text-amber-700 mt-1">
                {data.mpesaMetrics?.pendingCount ?? 0}
              </div>
              <div className="text-[11px] text-slate-500 mt-0.5">Awaiting customer PIN</div>
            </div>
            <div className="bg-white border border-slate-200 rounded-xl p-4">
              <div className="text-xs text-slate-500">Cancelled / Failed</div>
              <div className="text-xl font-bold font-mono tabular-nums text-rose-700 mt-1">
                {data.mpesaMetrics?.failedOrCancelledCount ?? 0}
              </div>
              <div className="text-[11px] text-slate-500 mt-0.5">No balance credited</div>
            </div>
          </div>

          <div className="bg-white border border-slate-200 rounded-xl p-6 space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <h3 className="text-base font-bold text-slate-950">Safaricom Daraja STK Push &amp; Callback Ledger</h3>
                <p className="text-xs text-slate-500 mt-0.5">
                  All customer wallet deposits and license checkouts with CheckoutRequestID, MerchantRequestID, Receipt, and callback audit trail.
                </p>
              </div>

              <div className="flex flex-wrap items-center gap-2">
                <div className="relative">
                  <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                  <input
                    type="text"
                    value={mpesaSearch}
                    onChange={(e) => setMpesaSearch(e.target.value)}
                    placeholder="Search receipt, phone, ID..."
                    className="pl-8 pr-3 py-1.5 text-xs border border-slate-300 rounded-lg bg-white focus:outline-none focus:border-slate-900 w-52"
                  />
                </div>
                <div className="flex items-center gap-1 p-1 bg-slate-100 rounded-lg">
                  {(['all', 'completed', 'pending', 'cancelled', 'failed'] as const).map((statusKey) => (
                    <button
                      key={statusKey}
                      type="button"
                      onClick={() => setMpesaFilter(statusKey)}
                      className={`px-2.5 py-1 text-xs font-semibold rounded-md capitalize cursor-pointer ${
                        mpesaFilter === statusKey
                          ? 'bg-white text-slate-950 shadow-xs'
                          : 'text-slate-600 hover:text-slate-950'
                      }`}
                    >
                      {statusKey}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            {(() => {
              const q = mpesaSearch.trim().toLowerCase();
              const filteredTxs = (data.mpesaTransactions || []).filter((tx) => {
                if (mpesaFilter !== 'all' && tx.status !== mpesaFilter) return false;
                if (!q) return true;
                return [
                  tx.tx_reference,
                  tx.user_name,
                  tx.user_email,
                  tx.phone_number,
                  tx.mpesa_receipt_number,
                  tx.checkout_request_id,
                  tx.merchant_request_id,
                  tx.party_b,
                  tx.business_short_code,
                ]
                  .filter(Boolean)
                  .join(' ')
                  .toLowerCase()
                  .includes(q);
              });

              if (filteredTxs.length === 0) {
                return (
                  <div className="py-10 text-center border border-dashed border-slate-200 rounded-xl space-y-2">
                    <Smartphone className="w-6 h-6 text-slate-300 mx-auto" />
                    <div className="text-sm font-semibold text-slate-700">No M-Pesa Daraja transactions recorded</div>
                    <p className="text-xs text-slate-500">
                      Customer STK Push deposits and checkouts will appear here automatically in real time.
                    </p>
                  </div>
                );
              }

              return (
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-xs">
                    <thead>
                      <tr className="border-b border-slate-200 text-slate-500">
                        <th className="py-2 pr-4">Tx Ref &amp; Date</th>
                        <th className="py-2 pr-4">Customer &amp; Phone</th>
                        <th className="py-2 pr-4">Routing (Shortcode / Till)</th>
                        <th className="py-2 pr-4 text-right">Amount</th>
                        <th className="py-2 pr-4">Receipt &amp; Daraja IDs</th>
                        <th className="py-2">Status &amp; Callback</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {filteredTxs.map((tx) => (
                        <tr key={tx.id} className="align-top">
                          <td className="py-3 pr-4">
                            <div className="font-mono font-semibold text-slate-950">{tx.tx_reference}</div>
                            <div className="text-[11px] text-slate-500 mt-0.5">
                              {tx.purpose === 'wallet_deposit' ? 'Wallet Deposit' : 'Order Checkout'}
                            </div>
                            <div className="font-mono text-[11px] text-slate-400">{tx.created_at}</div>
                          </td>
                          <td className="py-3 pr-4">
                            <div className="font-semibold text-slate-900">{tx.user_name || 'Customer'}</div>
                            <div className="text-slate-500">{tx.user_email}</div>
                            <div className="font-mono text-slate-700 mt-0.5">+{tx.phone_number}</div>
                          </td>
                          <td className="py-3 pr-4 font-mono">
                            <div className="text-slate-900 font-semibold">
                              SC {tx.business_short_code} → Till {tx.party_b}
                            </div>
                            <div className="text-[11px] text-slate-500">{tx.transaction_type}</div>
                          </td>
                          <td className="py-3 pr-4 text-right font-mono tabular-nums font-bold text-slate-950">
                            KES {Number(tx.amount_kes).toLocaleString()}
                            {tx.purpose === 'wallet_deposit' && tx.credited_to_wallet === 1 && (
                              <div className="text-[11px] font-sans font-normal text-emerald-700 mt-0.5">
                                Wallet Credited
                              </div>
                            )}
                          </td>
                          <td className="py-3 pr-4 font-mono max-w-[240px]">
                            <div className="font-semibold text-emerald-700">
                              {tx.mpesa_receipt_number || 'Awaiting receipt'}
                            </div>
                            {tx.checkout_request_id && (
                              <div className="text-[11px] text-slate-500 truncate" title={tx.checkout_request_id}>
                                CID: {tx.checkout_request_id}
                              </div>
                            )}
                            {tx.merchant_request_id && (
                              <div className="text-[11px] text-slate-400 truncate" title={tx.merchant_request_id}>
                                MID: {tx.merchant_request_id}
                              </div>
                            )}
                          </td>
                          <td className="py-3 max-w-[240px]">
                            <div
                              className={`font-semibold uppercase ${
                                tx.status === 'completed'
                                  ? 'text-emerald-700'
                                  : tx.status === 'pending'
                                  ? 'text-amber-700'
                                  : 'text-rose-700'
                              }`}
                            >
                              {tx.status}
                              {tx.result_code ? ` (${tx.result_code})` : ''}
                            </div>
                            {tx.result_desc && (
                              <div className="text-[11px] text-slate-600 mt-0.5">{tx.result_desc}</div>
                            )}
                            {tx.source_ip && (
                              <div className="font-mono text-[11px] text-slate-400 mt-0.5">
                                Callback IP: {tx.source_ip}
                              </div>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              );
            })()}
          </div>
        </div>
      )}

      {/* Tab 3: Users & Logins */}
      {tab === 'users' && (
        <div className="bg-white border border-slate-200 rounded-xl p-6 overflow-x-auto">
          <h3 className="text-base font-bold text-slate-950 mb-4">User Directory, Exness IDs &amp; Logins</h3>
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-b border-slate-200 text-xs text-slate-500">
                <th className="py-2 pr-4">User</th>
                <th className="py-2 pr-4">Exness ID</th>
                <th className="py-2 pr-4">Role</th>
                <th className="py-2 pr-4">Access</th>
                <th className="py-2 pr-4">Last Login</th>
                <th className="py-2 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {data.users.map((u) => (
                <tr key={u.id}>
                  <td className="py-3 pr-4 text-xs">
                    <div className="font-semibold text-slate-900">{u.name}</div>
                    <div className="text-slate-500">{u.email}</div>
                  </td>
                  <td className="py-3 pr-4 font-mono text-xs text-slate-700">
                    <div>{u.exness_account_id}</div>
                    <div
                      className={`text-[11px] font-sans font-semibold mt-0.5 ${
                        u.exness_verified ? 'text-emerald-700' : 'text-amber-700'
                      }`}
                    >
                      {u.exness_verified ? 'Verified Exness Partner' : 'Pending IB Review'}
                    </div>
                  </td>
                  <td className="py-3 pr-4">
                    <select
                      value={u.role}
                      onChange={(e) =>
                        updateUser(u.id, { role: e.target.value as 'user' | 'influencer' | 'admin' })
                      }
                      className="px-2 py-1 text-xs border border-slate-300 rounded bg-white"
                    >
                      <option value="user">user</option>
                      <option value="influencer">influencer</option>
                      <option value="admin">admin</option>
                    </select>
                  </td>
                  <td className="py-3 pr-4 text-xs space-x-2 whitespace-nowrap">
                    <button
                      onClick={() => updateUser(u.id, { exnessVerified: !u.exness_verified })}
                      className={`px-2 py-1 rounded border cursor-pointer ${
                        u.exness_verified
                          ? 'border-emerald-600 text-emerald-700 bg-emerald-50/60'
                          : 'border-amber-500 text-amber-800 bg-amber-50'
                      }`}
                    >
                      {u.exness_verified ? 'Revoke IB' : 'Verify IB'}
                    </button>
                    <button
                      onClick={() => updateUser(u.id, { hasAnalyzer: !u.has_analyzer })}
                      className={`px-2 py-1 rounded border cursor-pointer ${
                        u.has_analyzer ? 'border-emerald-600 text-emerald-700' : 'border-slate-300 text-slate-500'
                      }`}
                    >
                      Analyzer {u.has_analyzer ? 'ON' : 'OFF'}
                    </button>
                    <button
                      onClick={() => updateUser(u.id, { hasEaBots: !u.has_ea_bots })}
                      className={`px-2 py-1 rounded border cursor-pointer ${
                        u.has_ea_bots ? 'border-emerald-600 text-emerald-700' : 'border-slate-300 text-slate-500'
                      }`}
                    >
                      EA Bots {u.has_ea_bots ? 'ON' : 'OFF'}
                    </button>
                  </td>
                  <td className="py-3 pr-4 font-mono text-xs text-slate-500">
                    {u.last_login_at || '—'}
                  </td>
                  <td className="py-3 text-right">
                    <button
                      onClick={() => updateUser(u.id, { isSuspended: !u.is_suspended })}
                      className={`px-2.5 py-1 text-xs font-semibold rounded cursor-pointer ${
                        u.is_suspended
                          ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                          : 'bg-rose-50 text-rose-700 border border-rose-200'
                      }`}
                    >
                      {u.is_suspended ? 'Unsuspend' : 'Suspend'}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Tab 3: Security Audit Center */}
      {tab === 'security' && (
        <div className="space-y-6">
          {/* Live Environment, Security & Cloud DB Readiness */}
          <div className="bg-white border border-slate-200 rounded-xl p-6 space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <ShieldAlert className="w-5 h-5 text-blue-600" />
                <h3 className="text-base font-bold text-slate-950">
                  Live Environment, Security &amp; Cloud DB Readiness
                </h3>
              </div>
              <span className="text-xs font-mono text-slate-500">
                Source: /api/health/supabase
              </span>
            </div>

            {!health ? (
              <p className="text-xs text-slate-500">Health telemetry unavailable.</p>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-xs">
                <div className="p-3.5 rounded-lg border border-slate-200 bg-slate-50/70 space-y-1">
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-semibold text-slate-900">1. SUPABASE_URL / VITE_SUPABASE_URL</span>
                    <span
                      className={`font-semibold ${
                        health.envDiagnostics?.supabaseUrlValid && !health.envDiagnostics?.hasSecretKeyMisplacedInUrl
                          ? 'text-emerald-700'
                          : 'text-rose-700'
                      }`}
                    >
                      {health.envDiagnostics?.hasSecretKeyMisplacedInUrl
                        ? 'Action Required (Secret Key in URL)'
                        : health.envDiagnostics?.supabaseUrlValid && health.reachable
                        ? 'Configured'
                        : 'Action Required'}
                    </span>
                  </div>
                  <p className="text-slate-600">
                    Must be your <span className="font-mono">https://&lt;project-ref&gt;.supabase.co</span> URL — never paste an <span className="font-mono">sb_secret_</span> or <span className="font-mono">service_role</span> key into the URL variable.
                  </p>
                </div>

                <div className="p-3.5 rounded-lg border border-slate-200 bg-slate-50/70 space-y-1">
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-semibold text-slate-900">2. SESSION_SECRET</span>
                    <span
                      className={`font-semibold ${
                        health.envDiagnostics?.sessionSecretStrong ? 'text-emerald-700' : 'text-amber-700'
                      }`}
                    >
                      {health.envDiagnostics?.sessionSecretStrong
                        ? 'Configured (32+ chars)'
                        : health.envDiagnostics?.missingSessionSecret
                        ? 'Action Required (Missing)'
                        : 'Too Short (<32 chars)'}
                    </span>
                  </div>
                  <p className="text-slate-600">
                    Set a 32+ character cryptographic random secret on the server to harden signed login session cookies.
                  </p>
                </div>

                <div className="p-3.5 rounded-lg border border-slate-200 bg-slate-50/70 space-y-1">
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-semibold text-slate-900">3. MetaApi Cloud MT5 Keys</span>
                    <span
                      className={`font-semibold ${
                        health.envDiagnostics?.metaApiConfigured && health.envDiagnostics?.metaApiProfileConfigured
                          ? 'text-emerald-700'
                          : 'text-amber-700'
                      }`}
                    >
                      {health.envDiagnostics?.metaApiConfigured && health.envDiagnostics?.metaApiProfileConfigured
                        ? 'Configured'
                        : `Missing: ${(health.envDiagnostics?.missingMetaApiEnvVars || ['METAAPI_TOKEN', 'METAAPI_PROVISIONING_PROFILE_ID']).join(', ')}`}
                    </span>
                  </div>
                  <p className="text-slate-600">
                    Server-only credentials (<span className="font-mono">METAAPI_TOKEN</span> &amp; <span className="font-mono">METAAPI_PROVISIONING_PROFILE_ID</span>) required for automated cloud MT5 provisioning and trading.
                  </p>
                </div>

                <div className="p-3.5 rounded-lg border border-slate-200 bg-slate-50/70 space-y-1">
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-semibold text-slate-900">4. Cloud DB Sync Tables (Supabase)</span>
                    <span
                      className={`font-semibold ${
                        health.cloudSync?.tablesReady ? 'text-emerald-700' : 'text-amber-700'
                      }`}
                    >
                      {health.cloudSync?.tablesReady ? 'Tables Ready' : 'Run SQL Migration'}
                    </span>
                  </div>
                  <p className="text-slate-600">
                    {health.cloudSync?.tablesReady
                      ? 'Orders, journal trades, paper state, trading plans, and MT5 links are persisting to Supabase Cloud Postgres.'
                      : `Run supabase/gridpips_cloud_tables.sql in Supabase SQL Editor (${(health.cloudSync?.missingTables || ['gridpips_user_state', 'gridpips_orders']).join(', ')}).`}
                  </p>
                </div>

                <div className="p-3.5 rounded-lg border border-slate-200 bg-slate-50/70 space-y-3 md:col-span-2">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span className="font-semibold text-slate-900">5. Safaricom M-Pesa Daraja API (Server Env Audit)</span>
                    <span
                      className={`font-semibold ${
                        health.envDiagnostics?.mpesaDarajaConfigured ? 'text-emerald-700' : 'text-amber-700'
                      }`}
                    >
                      {health.envDiagnostics?.mpesaDarajaConfigured
                        ? `Configured (${health.envDiagnostics.mpesaDarajaEnv?.toUpperCase() || 'SANDBOX'} · ${health.envDiagnostics.mpesaTransactionType || 'CustomerBuyGoodsOnline'})`
                        : `Missing: ${(health.envDiagnostics?.missingMpesaDarajaEnvVars || ['MPESA_CONSUMER_KEY', 'MPESA_CONSUMER_SECRET', 'MPESA_PASSKEY', 'MPESA_SHORTCODE']).join(', ')}`}
                    </span>
                  </div>

                  {data.mpesaConfigAudit && (
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-[11px] font-mono bg-white border border-slate-200 rounded-lg p-3">
                      <div>
                        <div className="text-slate-400">MPESA_ENV</div>
                        <div className={data.mpesaConfigAudit.env === 'production' ? 'font-bold text-emerald-700' : 'font-bold text-amber-700'}>
                          {data.mpesaConfigAudit.env} {data.mpesaConfigAudit.rawEnvSet ? '' : '(default)'}
                        </div>
                      </div>
                      <div>
                        <div className="text-slate-400">MPESA_SHORTCODE</div>
                        <div className="font-bold text-slate-900">{data.mpesaConfigAudit.shortCode || 'MISSING'}</div>
                      </div>
                      <div>
                        <div className="text-slate-400">MPESA_PARTY_B</div>
                        <div className="font-bold text-slate-900">{data.mpesaConfigAudit.partyB || 'MISSING'}</div>
                      </div>
                      <div>
                        <div className="text-slate-400">MPESA_TRANSACTION_TYPE</div>
                        <div className="font-bold text-slate-900 truncate">{data.mpesaConfigAudit.transactionType}</div>
                      </div>
                      <div>
                        <div className="text-slate-400">MPESA_CONSUMER_KEY</div>
                        <div className={data.mpesaConfigAudit.consumerKeySet ? 'font-bold text-emerald-700' : 'font-bold text-rose-700'}>
                          {data.mpesaConfigAudit.consumerKeySet ? 'SET (Server)' : 'MISSING'}
                        </div>
                      </div>
                      <div>
                        <div className="text-slate-400">MPESA_CONSUMER_SECRET</div>
                        <div className={data.mpesaConfigAudit.consumerSecretSet ? 'font-bold text-emerald-700' : 'font-bold text-rose-700'}>
                          {data.mpesaConfigAudit.consumerSecretSet ? 'SET (Server)' : 'MISSING'}
                        </div>
                      </div>
                      <div>
                        <div className="text-slate-400">MPESA_PASSKEY</div>
                        <div className={data.mpesaConfigAudit.passkeySet ? 'font-bold text-emerald-700' : 'font-bold text-rose-700'}>
                          {data.mpesaConfigAudit.passkeySet ? 'SET (Server)' : 'MISSING'}
                        </div>
                      </div>
                      <div>
                        <div className="text-slate-400">MPESA_CALLBACK_URL</div>
                        <div className={data.mpesaConfigAudit.callbackUrl ? 'font-bold text-emerald-700 truncate' : 'font-bold text-amber-700'}>
                          {data.mpesaConfigAudit.callbackUrl ? 'SET' : 'NOT SET'}
                        </div>
                      </div>
                    </div>
                  )}

                  {data.mpesaConfigAudit?.mismatchWarnings && data.mpesaConfigAudit.mismatchWarnings.length > 0 && (
                    <div className="p-2.5 bg-amber-50 border border-amber-200 rounded-md text-xs text-amber-900 space-y-1">
                      {data.mpesaConfigAudit.mismatchWarnings.map((warn, idx) => (
                        <div key={idx}>{warn}</div>
                      ))}
                    </div>
                  )}

                  <p className="text-slate-600">
                    For security, Daraja Consumer Key, Consumer Secret, and Passkey must be entered in your hosting <strong>Environment Variables / Secrets</strong> panel (Google AI Studio Secrets &amp; Vercel Project Settings → Environment Variables) — never stored in browser code.
                    {data.mpesaConfigAudit?.callbackUrl && (
                      <span className="block mt-1 font-mono text-[11px] text-slate-800 break-all">
                        Active MPESA_CALLBACK_URL: {data.mpesaConfigAudit.callbackUrl}
                      </span>
                    )}
                  </p>
                  <div className="flex flex-wrap items-center gap-2 pt-1">
                    <button
                      type="button"
                      disabled={darajaTesting}
                      onClick={() => void handleTestDaraja()}
                      className="px-3 py-1.5 bg-slate-950 hover:bg-slate-800 text-white text-xs font-semibold rounded-md cursor-pointer disabled:opacity-60"
                    >
                      {darajaTesting ? 'Testing Daraja...' : 'Verify Daraja OAuth Connection'}
                    </button>
                    <button
                      type="button"
                      disabled={darajaTesting}
                      onClick={() => void handleResetStaleStk()}
                      className="px-3 py-1.5 border border-slate-300 bg-white hover:bg-slate-50 text-slate-800 text-xs font-semibold rounded-md cursor-pointer disabled:opacity-60"
                    >
                      Restart STK State &amp; Clear Cache
                    </button>
                  </div>
                  {darajaTestResult && (
                    <div
                      className={`p-2.5 rounded-md border text-xs ${
                        darajaTestResult.ok
                          ? 'bg-emerald-50 border-emerald-200 text-emerald-800'
                          : 'bg-rose-50 border-rose-200 text-rose-700'
                      }`}
                    >
                      {darajaTestResult.message}
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>

          <div className="bg-white border border-slate-200 rounded-xl p-6">
            <div className="flex items-center gap-2 mb-4">
              <ShieldAlert className="w-5 h-5 text-blue-600" />
              <h3 className="text-base font-bold text-slate-950">Intrusion &amp; Authentication Audit Log</h3>
            </div>
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead>
                <tr className="border-b border-slate-200 text-slate-500">
                  <th className="py-2 pr-4">Timestamp</th>
                  <th className="py-2 pr-4">Severity</th>
                  <th className="py-2 pr-4">Event</th>
                  <th className="py-2 pr-4">IP Address</th>
                  <th className="py-2 pr-4">Account</th>
                  <th className="py-2">Details</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 font-mono">
                {data.securityLogs.map((log) => (
                  <tr key={log.id}>
                    <td className="py-2.5 pr-4 text-slate-500">{log.created_at}</td>
                    <td
                      className={`py-2.5 pr-4 font-semibold uppercase ${
                        log.severity === 'critical'
                          ? 'text-rose-700'
                          : log.severity === 'warning'
                          ? 'text-amber-700'
                          : 'text-emerald-700'
                      }`}
                    >
                      {log.severity}
                    </td>
                    <td className="py-2.5 pr-4 text-slate-900">{log.event_type}</td>
                    <td className="py-2.5 pr-4 text-slate-600">{log.ip_address}</td>
                    <td className="py-2.5 pr-4 text-slate-600">{log.user_email || '—'}</td>
                    <td className="py-2.5 text-slate-600 font-sans">{log.details}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          </div>
        </div>
      )}

      {/* Tab 4: Influencer Payouts */}
      {tab === 'payouts' && (
        <div className="bg-white border border-slate-200 rounded-xl p-6 overflow-x-auto">
          <h3 className="text-base font-bold text-slate-950 mb-4">Influencer Commission Payout Queue</h3>
          {data.payouts.length === 0 ? (
            <p className="text-sm text-slate-500">No payout requests submitted yet.</p>
          ) : (
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b border-slate-200 text-xs text-slate-500">
                  <th className="py-2 pr-4">Influencer</th>
                  <th className="py-2 pr-4">Method</th>
                  <th className="py-2 pr-4">Destination</th>
                  <th className="py-2 pr-4 text-right">Amount</th>
                  <th className="py-2 pr-4">Status</th>
                  <th className="py-2 text-right">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {data.payouts.map((p) => (
                  <tr key={p.id}>
                    <td className="py-3 pr-4 text-xs">
                      <div className="font-semibold text-slate-900">{p.user_name}</div>
                      <div className="text-slate-500">{p.user_email}</div>
                    </td>
                    <td className="py-3 pr-4 font-mono text-xs uppercase">{p.method}</td>
                    <td className="py-3 pr-4 font-mono text-xs">{p.destination}</td>
                    <td className="py-3 pr-4 text-right font-mono font-bold">${p.amount_usd.toFixed(2)}</td>
                    <td className="py-3 pr-4 text-xs font-semibold capitalize">{p.status}</td>
                    <td className="py-3 text-right space-x-2">
                      {p.status === 'pending' && (
                        <>
                          <button
                            onClick={() => updatePayoutStatus(p.id, 'paid')}
                            className="inline-flex items-center gap-1 px-2.5 py-1 bg-emerald-600 text-white text-xs rounded cursor-pointer"
                          >
                            <Check className="w-3 h-3" /> Paid
                          </button>
                          <button
                            onClick={() => updatePayoutStatus(p.id, 'rejected')}
                            className="inline-flex items-center gap-1 px-2.5 py-1 border border-rose-300 text-rose-700 text-xs rounded cursor-pointer"
                          >
                            <XCircle className="w-3 h-3" /> Reject
                          </button>
                        </>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}

      {/* Tab 5: Automated Email Dispatch Logs */}
      {tab === 'emails' && (
        <div className="bg-white border border-slate-200 rounded-xl p-6">
          <h3 className="text-base font-bold text-slate-950 mb-4">System Automated Email Dispatch Audit</h3>
          <div className="divide-y divide-slate-100">
            {data.emailLogs.map((em) => (
              <div key={em.id} className="py-3 text-xs">
                <div className="flex flex-wrap justify-between gap-2">
                  <span className="font-semibold text-slate-900">
                    To: {em.recipient_email} — {em.subject}
                  </span>
                  <span className="font-mono text-slate-500">
                    {em.delivery_status} · {em.created_at}
                  </span>
                </div>
                <p className="text-slate-600 mt-1">{em.body_preview}</p>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Tab 6: Live Platform Settings */}
      {tab === 'settings' && (
        <form onSubmit={handleSaveSettings} className="bg-white border border-slate-200 rounded-xl p-6 space-y-4 max-w-3xl">
          <h3 className="text-base font-bold text-slate-950">Global Platform Configuration</h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">Exness Partner IB Link</label>
              <input
                value={settingsForm.exness_ib_url || ''}
                onChange={(e) => setSettingsForm({ ...settingsForm, exness_ib_url: e.target.value })}
                className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg font-mono"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">Telegram Community Link</label>
              <input
                value={settingsForm.telegram_url || ''}
                onChange={(e) => setSettingsForm({ ...settingsForm, telegram_url: e.target.value })}
                className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg font-mono"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">ICT YouTube Channel ID</label>
              <input
                value={settingsForm.ict_youtube_channel_id || ''}
                onChange={(e) =>
                  setSettingsForm({ ...settingsForm, ict_youtube_channel_id: e.target.value })
                }
                className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg font-mono"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">Influencer Commission (%)</label>
              <input
                value={settingsForm.influencer_commission_pct || ''}
                onChange={(e) =>
                  setSettingsForm({ ...settingsForm, influencer_commission_pct: e.target.value })
                }
                className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg font-mono"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">ICT Analyzer Price (USD)</label>
              <input
                value={settingsForm.analyzer_price_usd || ''}
                onChange={(e) =>
                  setSettingsForm({ ...settingsForm, analyzer_price_usd: e.target.value })
                }
                className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg font-mono"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">MQL5 EA Bots Price (USD)</label>
              <input
                value={settingsForm.ea_bots_price_usd || ''}
                onChange={(e) =>
                  setSettingsForm({ ...settingsForm, ea_bots_price_usd: e.target.value })
                }
                className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg font-mono"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">M-Pesa Till / Paybill Display Number</label>
              <input
                value={settingsForm.mpesa_till_number || ''}
                onChange={(e) =>
                  setSettingsForm({ ...settingsForm, mpesa_till_number: e.target.value })
                }
                className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg font-mono"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">Daraja PartyB (Till / Paybill Shortcode)</label>
              <input
                value={settingsForm.mpesa_party_b || ''}
                onChange={(e) =>
                  setSettingsForm({ ...settingsForm, mpesa_party_b: e.target.value })
                }
                className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg font-mono"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">Daraja Transaction Type</label>
              <select
                value={settingsForm.mpesa_transaction_type || 'CustomerBuyGoodsOnline'}
                onChange={(e) =>
                  setSettingsForm({ ...settingsForm, mpesa_transaction_type: e.target.value })
                }
                className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg bg-white font-mono"
              >
                <option value="CustomerBuyGoodsOnline">CustomerBuyGoodsOnline (Till)</option>
                <option value="CustomerPayBillOnline">CustomerPayBillOnline (Paybill)</option>
              </select>
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">M-Pesa Merchant Name</label>
              <input
                value={settingsForm.mpesa_merchant_name || ''}
                onChange={(e) =>
                  setSettingsForm({ ...settingsForm, mpesa_merchant_name: e.target.value })
                }
                className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">USD to KES Exchange Rate</label>
              <input
                value={settingsForm.usd_kes_rate || ''}
                onChange={(e) =>
                  setSettingsForm({ ...settingsForm, usd_kes_rate: e.target.value })
                }
                className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg font-mono"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">USDT TRC20 Deposit Address</label>
              <input
                value={settingsForm.usdt_trc20_address || ''}
                onChange={(e) =>
                  setSettingsForm({ ...settingsForm, usdt_trc20_address: e.target.value })
                }
                className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg font-mono"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">USDT ERC20 Deposit Address</label>
              <input
                value={settingsForm.usdt_erc20_address || ''}
                onChange={(e) =>
                  setSettingsForm({ ...settingsForm, usdt_erc20_address: e.target.value })
                }
                className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg font-mono"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">Bitcoin (BTC) Deposit Address</label>
              <input
                value={settingsForm.btc_address || ''}
                onChange={(e) => setSettingsForm({ ...settingsForm, btc_address: e.target.value })}
                className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg font-mono"
              />
            </div>
          </div>

          {feedback && (
            <div className="p-3 bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs rounded-lg">
              {feedback}
            </div>
          )}

          <button
            type="submit"
            disabled={savingSettings}
            className="px-5 py-2.5 bg-blue-600 text-white text-xs font-semibold rounded-lg hover:bg-blue-700 cursor-pointer"
          >
            {savingSettings ? 'Saving...' : 'Save Global Settings'}
          </button>
        </form>
      )}
    </div>
  );
};
