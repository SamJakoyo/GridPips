import React, { useEffect, useState } from 'react';
import { Copy, CheckCircle2, Mail, ArrowUpRight } from 'lucide-react';
import { apiFetch } from '../lib/api';
import type { EmailLogItem, Order, PublicConfig } from '../types';

/* ---------------- Responsive Order Management Dashboard ---------------- */
export const OrdersDashboardView: React.FC<{
  orders: Order[];
  onResumePayment: (order: Order) => void;
  onBuyNew: (product: 'analyzer' | 'ea_bots') => void;
}> = ({ orders, onResumePayment, onBuyNew }) => {
  const [filter, setFilter] = useState<'all' | 'paid' | 'pending'>('all');

  const filtered = orders.filter((o) => {
    if (filter === 'paid') return o.payment_status === 'paid';
    if (filter === 'pending') return o.payment_status !== 'paid';
    return true;
  });

  const totalSpent = orders
    .filter((o) => o.payment_status === 'paid')
    .reduce((acc, o) => acc + Number(o.amount_usd || 0), 0);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-4 flex-1 max-w-xl">
          <div className="bg-white border border-slate-200 rounded-xl p-4">
            <div className="text-xs text-slate-500">Total Orders</div>
            <div className="text-xl font-bold font-mono tabular-nums text-slate-950">{orders.length}</div>
          </div>
          <div className="bg-white border border-slate-200 rounded-xl p-4">
            <div className="text-xs text-slate-500">Total Paid</div>
            <div className="text-xl font-bold font-mono tabular-nums text-emerald-700">
              ${totalSpent.toFixed(2)}
            </div>
          </div>
        </div>

        <div className="flex flex-wrap gap-2">
          <button
            onClick={() => onBuyNew('analyzer')}
            className="px-4 py-2 bg-blue-600 text-white text-xs font-semibold rounded-lg hover:bg-blue-700 cursor-pointer"
          >
            + ICT Analyzer ($5.25)
          </button>
          <button
            onClick={() => onBuyNew('ea_bots')}
            className="px-4 py-2 bg-slate-950 text-white text-xs font-semibold rounded-lg hover:bg-slate-800 cursor-pointer"
          >
            + MQL5 EA Bots ($5.25)
          </button>
        </div>
      </div>

      <div className="bg-white border border-slate-200 rounded-xl p-6">
        <div className="flex flex-wrap items-center justify-between gap-4 mb-4">
          <h3 className="text-base font-bold text-slate-950">Order History &amp; Payment Verification</h3>
          <div className="flex items-center gap-1 p-1 bg-slate-100 rounded-lg">
            {(['all', 'paid', 'pending'] as const).map((f) => (
              <button
                key={f}
                onClick={() => setFilter(f)}
                className={`px-3 py-1 text-xs font-semibold rounded-md capitalize cursor-pointer ${
                  filter === f ? 'bg-white text-slate-950 shadow-xs' : 'text-slate-600'
                }`}
              >
                {f}
              </button>
            ))}
          </div>
        </div>

        {filtered.length === 0 ? (
          <p className="text-sm text-slate-500 py-6 text-center">
            No orders matching this filter. Purchase the $5.25 ICT Analyzer or MQL5 EA Bots Pack to see orders here.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b border-slate-200 text-xs text-slate-500">
                  <th className="py-2.5 pr-4">Order #</th>
                  <th className="py-2.5 pr-4">Product</th>
                  <th className="py-2.5 pr-4">Method</th>
                  <th className="py-2.5 pr-4">Reference / TX</th>
                  <th className="py-2.5 pr-4 text-right">Amount</th>
                  <th className="py-2.5 pr-4">Status</th>
                  <th className="py-2.5 text-right">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filtered.map((o) => (
                  <tr key={o.id} className="hover:bg-slate-50">
                    <td className="py-3 pr-4 font-mono text-xs font-semibold text-slate-900">
                      {o.order_number}
                    </td>
                    <td className="py-3 pr-4 text-slate-800">{o.product_name}</td>
                    <td className="py-3 pr-4 text-xs uppercase font-mono text-slate-600">
                      {o.payment_method}
                    </td>
                    <td className="py-3 pr-4 font-mono text-xs text-slate-500 max-w-[160px] truncate">
                      {o.mpesa_receipt || o.crypto_tx_hash || (o.mpesa_phone ? `STK +${o.mpesa_phone}` : 'Awaiting payment')}
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
                      <span
                        className={`text-xs font-semibold capitalize ${
                          o.payment_status === 'paid'
                            ? 'text-emerald-700'
                            : o.payment_status === 'failed' || o.payment_status === 'refunded'
                            ? 'text-rose-700'
                            : 'text-amber-700'
                        }`}
                      >
                        {o.payment_status}
                      </span>
                    </td>
                    <td className="py-3 text-right">
                      {o.payment_status !== 'paid' ? (
                        <button
                          onClick={() => onResumePayment(o)}
                          className="text-xs font-semibold text-blue-600 hover:underline cursor-pointer"
                        >
                          Verify / Pay
                        </button>
                      ) : (
                        <span className="text-xs text-slate-400">Unlocked</span>
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
                          .join(' · ') || 'Free Workspace'}
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
