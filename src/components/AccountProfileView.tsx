import React, { useState } from 'react';
import {
  Check,
  Copy,
  ArrowUpRight,
  Save,
  ShieldCheck,
  UserCheck,
  Layers,
} from 'lucide-react';
import { apiFetch } from '../lib/api';
import type { JournalTrade, Order, PublicConfig, User } from '../types';

interface AccountProfileViewProps {
  user: User;
  config: PublicConfig;
  orders: Order[];
  journal: JournalTrade[];
  watchlist: string[];
  onUserUpdated: (user: User) => void;
  onNavigate: (tab: 'analyzer' | 'drt' | 'orders' | 'referrals' | 'journal' | 'charts') => void;
  onUnlock: (productKey: 'analyzer' | 'drt_analyzer') => void;
}

function formatDateTime(iso?: string | null): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export const AccountProfileView: React.FC<AccountProfileViewProps> = ({
  user,
  config,
  orders,
  journal,
  watchlist,
  onUserUpdated,
  onNavigate,
  onUnlock,
}) => {
  const [name, setName] = useState(user.name);
  const [exnessAccountId, setExnessAccountId] = useState(user.exnessAccountId);
  const [exnessEmail, setExnessEmail] = useState(user.exnessEmail || user.email);
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState('');
  const [error, setError] = useState('');
  const [copiedKey, setCopiedKey] = useState<string | null>(null);
  const hasDrt = Boolean(user.hasDrtAnalyzer ?? user.hasEaBots);
  const drtDaysRemaining = user.drtAnalyzerDaysRemaining ?? user.eaBotsDaysRemaining;
  const drtStatus = user.drtAnalyzerSubscriptionStatus ?? user.eaBotsSubscriptionStatus;
  const drtExpiresAt = user.drtAnalyzerExpiresAt ?? user.eaBotsExpiresAt;
  const drtPriceUsd = config.drtAnalyzerPriceUsd ?? config.eaBotsPriceUsd;

  const initials = (user.name || user.email || 'TR')
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase() || '')
    .join('');

  const referralUrl =
    typeof window !== 'undefined'
      ? `${window.location.origin}/?ref=${encodeURIComponent(user.referralCode)}`
      : `/?ref=${encodeURIComponent(user.referralCode)}`;

  const paidOrdersCount = orders.filter((o) => o.payment_status === 'paid').length;
  const totalPnl = journal.reduce((acc, t) => acc + Number(t.pnl || 0), 0);

  function copyValue(key: string, value: string) {
    navigator.clipboard?.writeText(value).catch(() => {});
    setCopiedKey(key);
    window.setTimeout(() => {
      setCopiedKey((cur) => (cur === key ? null : cur));
    }, 1800);
  }

  async function handleSaveProfile(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setNotice('');
    setError('');
    try {
      const res = await apiFetch<{ user: User }>('/api/auth/profile', {
        method: 'PATCH',
        body: JSON.stringify({
          name: name.trim(),
          exnessAccountId: exnessAccountId.trim().toUpperCase(),
          exnessEmail: exnessEmail.trim().toLowerCase(),
        }),
      });
      onUserUpdated(res.user);
      setNotice('Your profile and Exness account details have been updated.');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to update your profile.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-6">
      {/* Identity Overview Banner */}
      <div
        className="rounded-2xl border border-emerald-500/25 bg-[#0B120E] p-6 sm:p-7 flex flex-wrap items-center justify-between gap-6"
        style={{
          backgroundImage: 'radial-gradient(circle at 12% 0%, rgba(22, 229, 99, 0.14), transparent 50%)',
        }}
      >
        <div className="flex items-center gap-4 min-w-0">
          <div className="w-14 h-14 rounded-xl bg-[#16E563] text-[#041108] font-bold text-lg flex items-center justify-center shrink-0">
            {initials || 'GP'}
          </div>
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2 text-xs text-slate-400">
              <span className="capitalize font-semibold text-[#16E563]">{user.role} account</span>
              <span aria-hidden="true">·</span>
              <span>{user.isSuspended ? 'Suspended' : 'Active member'}</span>
              <span aria-hidden="true">·</span>
              <span className="font-mono tabular-nums">Joined {formatDateTime(user.createdAt)}</span>
            </div>
            <h2 className="text-2xl font-bold text-white truncate mt-0.5">{user.name}</h2>
            <p className="text-xs font-mono text-slate-400 truncate">{user.email}</p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <a
            href={config.exnessIbUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1.5 px-4 py-2.5 rounded-xl bg-[#0E1712] border border-emerald-500/25 hover:border-[#16E563] text-xs font-semibold text-white whitespace-nowrap shrink-0 transition-colors"
          >
            Open Exness Portal
            <ArrowUpRight className="w-3.5 h-3.5 text-[#16E563]" />
          </a>
        </div>
      </div>

      {/* Key Identifiers & Entitlements Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
        <div className="rounded-2xl bg-[#0B120E] border border-emerald-500/20 p-5">
          <div className="text-xs text-slate-400">Exness Account ID</div>
          <div className="mt-1.5 flex items-center justify-between gap-2">
            <span className="text-base font-mono font-bold text-white truncate">
              {user.exnessAccountId}
            </span>
            <button
              type="button"
              onClick={() => copyValue('exnessId', user.exnessAccountId)}
              className="p-1.5 rounded-md text-slate-400 hover:text-[#16E563] hover:bg-emerald-500/10 cursor-pointer shrink-0"
              aria-label="Copy Exness Account ID"
            >
              {copiedKey === 'exnessId' ? <Check className="w-4 h-4 text-[#16E563]" /> : <Copy className="w-4 h-4" />}
            </button>
          </div>
          <div
            className={`text-xs font-semibold mt-2 ${
              user.exnessVerified ? 'text-[#16E563]' : 'text-[#F5B82E]'
            }`}
          >
            {user.exnessVerified ? 'Verified Exness Partner' : 'Pending IB Review'}
          </div>
          {!user.exnessVerified && (
            <div className="text-[11px] text-slate-400 mt-0.5">
              Awaiting partner confirmation in Admin Console
            </div>
          )}
        </div>

        <div className="rounded-2xl bg-[#0B120E] border border-emerald-500/20 p-5">
          <div className="text-xs text-slate-400">Partner Referral Code</div>
          <div className="mt-1.5 flex items-center justify-between gap-2">
            <span className="text-base font-mono font-bold text-[#F5B82E] truncate">
              {user.referralCode}
            </span>
            <button
              type="button"
              onClick={() => copyValue('refUrl', referralUrl)}
              className="p-1.5 rounded-md text-slate-400 hover:text-[#16E563] hover:bg-emerald-500/10 cursor-pointer shrink-0"
              aria-label="Copy Referral Link"
            >
              {copiedKey === 'refUrl' ? <Check className="w-4 h-4 text-[#16E563]" /> : <Copy className="w-4 h-4" />}
            </button>
          </div>
          <button
            type="button"
            onClick={() => onNavigate('referrals')}
            className="text-xs font-semibold text-[#F5B82E] hover:underline mt-2 cursor-pointer"
          >
            {config.commissionPct}% partner hub →
          </button>
        </div>

        <div className="rounded-2xl bg-[#0B120E] border border-emerald-500/20 p-5">
          <div className="text-xs text-slate-400">ICT Strategy Analyzer</div>
          <div className="text-base font-bold text-white mt-1.5">
            {user.hasAnalyzer
              ? user.analyzerDaysRemaining != null
                ? `Active · ${user.analyzerDaysRemaining}d left`
                : 'Active subscription'
              : user.analyzerSubscriptionStatus === 'expired'
              ? 'Subscription expired'
              : `From $${config.analyzerPriceUsd.toFixed(2)}/mo`}
          </div>
          <button
            type="button"
            onClick={() => (user.hasAnalyzer ? onNavigate('analyzer') : onUnlock('analyzer'))}
            className="text-xs font-semibold text-[#16E563] hover:underline mt-2 cursor-pointer"
          >
            {user.hasAnalyzer ? 'Open live scanner →' : 'Subscribe to analyzer →'}
          </button>
        </div>

        <div className="rounded-2xl bg-[#0B120E] border border-emerald-500/20 p-5">
          <div className="text-xs text-slate-400">DRT Strategy Analyzer</div>
          <div className="text-base font-bold text-white mt-1.5">
            {hasDrt
              ? drtDaysRemaining != null
                ? `Active · ${drtDaysRemaining}d left`
                : 'Active subscription'
              : drtStatus === 'expired'
              ? 'Subscription expired'
              : `From $${drtPriceUsd.toFixed(2)}/mo`}
          </div>
          <button
            type="button"
            onClick={() => (hasDrt ? onNavigate('drt') : onUnlock('drt_analyzer'))}
            className="text-xs font-semibold text-[#F5B82E] hover:underline mt-2 cursor-pointer"
          >
            {hasDrt ? 'Open DRT scanner →' : 'Subscribe to DRT analyzer →'}
          </button>
        </div>
      </div>

      {/* Main Details Split */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Editable Personal & Exness Details */}
        <div className="lg:col-span-7 rounded-2xl bg-[#0B120E] border border-emerald-500/20 p-6">
          <div className="flex items-center gap-2 mb-1">
            <UserCheck className="w-4 h-4 text-[#16E563]" />
            <h3 className="text-base font-bold text-white">Personal &amp; Broker Information</h3>
          </div>
          <p className="text-xs text-slate-400 mb-5">
            Review your registered member details or update your display name and linked Exness ID.
          </p>

          {notice && (
            <div className="mb-4 px-4 py-2.5 rounded-xl bg-emerald-500/12 border border-emerald-500/35 text-xs text-emerald-300">
              {notice}
            </div>
          )}
          {error && (
            <div className="mb-4 px-4 py-2.5 rounded-xl bg-rose-500/12 border border-rose-500/35 text-xs text-rose-300">
              {error}
            </div>
          )}

          <form onSubmit={handleSaveProfile} className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-medium text-slate-300 mb-1.5">Full Name</label>
                <input
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  required
                  className="w-full px-3.5 py-2.5 rounded-xl bg-[#0E1712] border border-emerald-500/25 text-sm text-white focus:outline-none focus:border-[#16E563]"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-300 mb-1.5">Primary Login Email</label>
                <input
                  type="email"
                  value={user.email}
                  disabled
                  className="w-full px-3.5 py-2.5 rounded-xl bg-[#070D0A] border border-emerald-500/15 text-sm font-mono text-slate-500 cursor-not-allowed"
                />
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-medium text-slate-300 mb-1.5">Exness Account ID</label>
                <input
                  type="text"
                  value={exnessAccountId}
                  onChange={(e) => setExnessAccountId(e.target.value)}
                  required
                  className="w-full px-3.5 py-2.5 rounded-xl bg-[#0E1712] border border-emerald-500/25 text-sm font-mono text-white focus:outline-none focus:border-[#16E563]"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-300 mb-1.5">Exness Registered Email</label>
                <input
                  type="email"
                  value={exnessEmail}
                  onChange={(e) => setExnessEmail(e.target.value)}
                  className="w-full px-3.5 py-2.5 rounded-xl bg-[#0E1712] border border-emerald-500/25 text-sm font-mono text-white focus:outline-none focus:border-[#16E563]"
                />
              </div>
            </div>

            <div className="pt-2 flex flex-wrap items-center justify-between gap-3">
              <div className="text-xs text-slate-400 font-mono tabular-nums">
                Last sign-in: {formatDateTime(user.lastLoginAt)}
              </div>
              <button
                type="submit"
                disabled={saving}
                className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-[#16E563] hover:bg-[#2BF074] text-[#041108] text-xs font-bold disabled:opacity-60 cursor-pointer whitespace-nowrap transition-colors"
              >
                <Save className="w-3.5 h-3.5" />
                {saving ? 'Saving changes...' : 'Save Information'}
              </button>
            </div>
          </form>
        </div>

        {/* Active Analyzer Subscriptions & Workspace Summary */}
        <div className="lg:col-span-5 space-y-5">
          <div className="rounded-2xl bg-[#0B120E] border border-emerald-500/20 p-6 space-y-4">
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <Layers className="w-4 h-4 text-[#16E563]" />
                <h3 className="text-base font-bold text-white">Active Analyzer Subscriptions</h3>
              </div>
              <button
                type="button"
                onClick={() => onNavigate('orders')}
                className="text-xs font-semibold text-[#16E563] hover:underline cursor-pointer"
              >
                Manage →
              </button>
            </div>

            <div className="divide-y divide-emerald-500/15 text-xs">
              <div className="py-2.5 flex items-center justify-between gap-3">
                <span className="text-slate-400">ICT Strategy Analyzer</span>
                <span className={user.hasAnalyzer ? 'font-semibold text-[#16E563]' : 'font-semibold text-slate-400'}>
                  {user.hasAnalyzer
                    ? user.analyzerDaysRemaining != null
                      ? `Active (${user.analyzerDaysRemaining}d left)`
                      : 'Active'
                    : user.analyzerSubscriptionStatus === 'expired'
                    ? 'Expired'
                    : 'Not Subscribed'}
                </span>
              </div>
              <div className="py-2.5 flex items-center justify-between gap-3">
                <span className="text-slate-400">ICT Renewal / Expiry</span>
                <span className="font-mono tabular-nums text-slate-200">
                  {user.analyzerExpiresAt ? formatDateTime(user.analyzerExpiresAt) : '—'}
                </span>
              </div>
              <div className="py-2.5 flex items-center justify-between gap-3">
                <span className="text-slate-400">DRT Strategy Analyzer</span>
                <span className={hasDrt ? 'font-semibold text-[#16E563]' : 'font-semibold text-slate-400'}>
                  {hasDrt
                    ? drtDaysRemaining != null
                      ? `Active (${drtDaysRemaining}d left)`
                      : 'Active'
                    : drtStatus === 'expired'
                    ? 'Expired'
                    : 'Not Subscribed'}
                </span>
              </div>
              <div className="py-2.5 flex items-center justify-between gap-3">
                <span className="text-slate-400">DRT Renewal / Expiry</span>
                <span className="font-mono tabular-nums text-slate-200">
                  {drtExpiresAt ? formatDateTime(drtExpiresAt) : '—'}
                </span>
              </div>
            </div>

            {config.drtYoutubeChannelUrl && (
              <div className="pt-1 flex items-center justify-between gap-2 text-xs">
                <span className="text-slate-400">DRT Strategy Framework</span>
                <a
                  href={config.drtYoutubeChannelUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1 font-semibold text-[#F5B82E] hover:underline"
                >
                  Ali Khan ICT YouTube
                  <ArrowUpRight className="w-3.5 h-3.5" />
                </a>
              </div>
            )}
          </div>

          <div className="rounded-2xl bg-[#0B120E] border border-emerald-500/20 p-6 space-y-3">
            <div className="flex items-center gap-2">
              <ShieldCheck className="w-4 h-4 text-[#16E563]" />
              <h3 className="text-base font-bold text-white">Account Activity Summary</h3>
            </div>
            <div className="divide-y divide-emerald-500/15 text-xs">
              <div className="py-2.5 flex items-center justify-between">
                <span className="text-slate-400">Orders Placed / Paid</span>
                <button
                  type="button"
                  onClick={() => onNavigate('orders')}
                  className="font-mono tabular-nums font-semibold text-slate-200 hover:text-[#16E563] cursor-pointer"
                >
                  {orders.length} total · {paidOrdersCount} paid →
                </button>
              </div>
              <div className="py-2.5 flex items-center justify-between">
                <span className="text-slate-400">Journal Net P&amp;L ({journal.length} trades)</span>
                <button
                  type="button"
                  onClick={() => onNavigate('journal')}
                  className={`font-mono tabular-nums font-semibold cursor-pointer ${
                    totalPnl >= 0 ? 'text-[#16E563]' : 'text-rose-400'
                  }`}
                >
                  {totalPnl >= 0 ? '+' : ''}${totalPnl.toFixed(2)} →
                </button>
              </div>
              <div className="py-2.5 flex items-center justify-between gap-4">
                <span className="text-slate-400 shrink-0">Saved Watchlist</span>
                <button
                  type="button"
                  onClick={() => onNavigate('charts')}
                  className="font-mono text-slate-300 hover:text-[#16E563] truncate cursor-pointer text-right"
                >
                  {watchlist.join(' · ')} →
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
