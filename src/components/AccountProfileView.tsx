import React, { useState } from 'react';
import {
  Check,
  Copy,
  Eye,
  EyeOff,
  ArrowUpRight,
  Save,
  ShieldCheck,
  UserCheck,
  KeyRound,
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
  onNavigate: (tab: 'analyzer' | 'eabots' | 'orders' | 'referrals' | 'journal' | 'charts') => void;
  onUnlock: (productKey: 'analyzer' | 'ea_bots') => void;
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
  const [showBridgeToken, setShowBridgeToken] = useState(false);

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
      <div className="rounded-2xl border border-amber-200/80 bg-[radial-gradient(ellipse_at_top_left,_rgba(245,158,11,0.12),_#FFFFFF_52%,_#FAF7F0_100%)] p-6 sm:p-7 flex flex-wrap items-center justify-between gap-6">
        <div className="flex items-center gap-4 min-w-0">
          <div className="w-14 h-14 rounded-xl bg-[#E5A93C] text-[#090806] font-bold text-lg flex items-center justify-center shrink-0">
            {initials || 'GP'}
          </div>
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2 text-xs text-slate-500">
              <span className="capitalize font-medium text-amber-700">{user.role} account</span>
              <span aria-hidden="true">·</span>
              <span>{user.isSuspended ? 'Suspended' : 'Active member'}</span>
              <span aria-hidden="true">·</span>
              <span className="font-mono tabular-nums">Joined {formatDateTime(user.createdAt)}</span>
            </div>
            <h2 className="text-2xl font-bold text-slate-950 truncate mt-0.5">{user.name}</h2>
            <p className="text-xs font-mono text-slate-600 truncate">{user.email}</p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <a
            href={config.exnessIbUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1.5 px-4 py-2.5 rounded-lg bg-white border border-slate-300 hover:border-amber-500 text-xs font-semibold text-slate-900 whitespace-nowrap shrink-0"
          >
            Open Exness Portal
            <ArrowUpRight className="w-3.5 h-3.5 text-amber-600" />
          </a>
        </div>
      </div>

      {/* Key Identifiers & Entitlements Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
        <div className="rounded-2xl bg-white border border-slate-200 p-5">
          <div className="text-xs text-slate-500">Exness Account ID</div>
          <div className="mt-1.5 flex items-center justify-between gap-2">
            <span className="text-base font-mono font-bold text-slate-950 truncate">
              {user.exnessAccountId}
            </span>
            <button
              type="button"
              onClick={() => copyValue('exnessId', user.exnessAccountId)}
              className="p-1.5 rounded-md text-slate-500 hover:text-amber-600 hover:bg-slate-100 cursor-pointer shrink-0"
              aria-label="Copy Exness Account ID"
            >
              {copiedKey === 'exnessId' ? <Check className="w-4 h-4 text-emerald-600" /> : <Copy className="w-4 h-4" />}
            </button>
          </div>
          <div className="text-xs text-slate-600 mt-2">
            {user.exnessVerified ? 'IB verification active' : 'Verification pending'}
          </div>
        </div>

        <div className="rounded-2xl bg-white border border-slate-200 p-5">
          <div className="text-xs text-slate-500">Partner Referral Code</div>
          <div className="mt-1.5 flex items-center justify-between gap-2">
            <span className="text-base font-mono font-bold text-amber-700 truncate">
              {user.referralCode}
            </span>
            <button
              type="button"
              onClick={() => copyValue('refUrl', referralUrl)}
              className="p-1.5 rounded-md text-slate-500 hover:text-amber-600 hover:bg-slate-100 cursor-pointer shrink-0"
              aria-label="Copy Referral Link"
            >
              {copiedKey === 'refUrl' ? <Check className="w-4 h-4 text-emerald-600" /> : <Copy className="w-4 h-4" />}
            </button>
          </div>
          <button
            type="button"
            onClick={() => onNavigate('referrals')}
            className="text-xs font-semibold text-amber-700 hover:underline mt-2 cursor-pointer"
          >
            {config.commissionPct}% partner hub →
          </button>
        </div>

        <div className="rounded-2xl bg-white border border-slate-200 p-5">
          <div className="text-xs text-slate-500">ICT Strategy Analyzer</div>
          <div className="text-base font-bold text-slate-950 mt-1.5">
            {user.hasAnalyzer ? 'Unlocked & active' : 'Locked ($5.25)'}
          </div>
          <button
            type="button"
            onClick={() => (user.hasAnalyzer ? onNavigate('analyzer') : onUnlock('analyzer'))}
            className="text-xs font-semibold text-amber-700 hover:underline mt-2 cursor-pointer"
          >
            {user.hasAnalyzer ? 'Open live scanner →' : 'Unlock analyzer →'}
          </button>
        </div>

        <div className="rounded-2xl bg-white border border-slate-200 p-5">
          <div className="text-xs text-slate-500">MQL5 EA Bots &amp; MT5</div>
          <div className="text-base font-bold text-slate-950 mt-1.5">
            {user.hasEaBots
              ? user.mt5Connected
                ? `MT5 ${user.mt5Login || 'Connected'}`
                : 'Unlocked · Standby'
              : 'Locked ($5.25)'}
          </div>
          <button
            type="button"
            onClick={() => (user.hasEaBots ? onNavigate('eabots') : onUnlock('ea_bots'))}
            className="text-xs font-semibold text-amber-700 hover:underline mt-2 cursor-pointer"
          >
            {user.hasEaBots ? 'Manage MT5 bridge →' : 'Unlock EA bots →'}
          </button>
        </div>
      </div>

      {/* Main Details Split */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Editable Personal & Exness Details */}
        <div className="lg:col-span-7 rounded-2xl bg-white border border-slate-200 p-6">
          <div className="flex items-center gap-2 mb-1">
            <UserCheck className="w-4 h-4 text-amber-600" />
            <h3 className="text-base font-bold text-slate-950">Personal &amp; Broker Information</h3>
          </div>
          <p className="text-xs text-slate-500 mb-5">
            Review your registered member details or update your display name and linked Exness ID.
          </p>

          {notice && (
            <div className="mb-4 px-4 py-2.5 rounded-lg bg-emerald-50 border border-emerald-200 text-xs text-emerald-800">
              {notice}
            </div>
          )}
          {error && (
            <div className="mb-4 px-4 py-2.5 rounded-lg bg-rose-50 border border-rose-200 text-xs text-rose-700">
              {error}
            </div>
          )}

          <form onSubmit={handleSaveProfile} className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1.5">Full Name</label>
                <input
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  required
                  className="w-full px-3.5 py-2.5 rounded-lg bg-white border border-slate-300 text-sm text-slate-950 focus:outline-none focus:border-amber-500"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1.5">Primary Login Email</label>
                <input
                  type="email"
                  value={user.email}
                  disabled
                  className="w-full px-3.5 py-2.5 rounded-lg bg-slate-100 border border-slate-200 text-sm font-mono text-slate-500 cursor-not-allowed"
                />
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1.5">Exness Account ID</label>
                <input
                  type="text"
                  value={exnessAccountId}
                  onChange={(e) => setExnessAccountId(e.target.value)}
                  required
                  className="w-full px-3.5 py-2.5 rounded-lg bg-white border border-slate-300 text-sm font-mono text-slate-950 focus:outline-none focus:border-amber-500"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1.5">Exness Registered Email</label>
                <input
                  type="email"
                  value={exnessEmail}
                  onChange={(e) => setExnessEmail(e.target.value)}
                  className="w-full px-3.5 py-2.5 rounded-lg bg-white border border-slate-300 text-sm font-mono text-slate-950 focus:outline-none focus:border-amber-500"
                />
              </div>
            </div>

            <div className="pt-2 flex flex-wrap items-center justify-between gap-3">
              <div className="text-xs text-slate-500 font-mono tabular-nums">
                Last sign-in: {formatDateTime(user.lastLoginAt)}
              </div>
              <button
                type="submit"
                disabled={saving}
                className="inline-flex items-center gap-2 px-5 py-2.5 rounded-lg bg-[#E5A93C] hover:bg-[#F0B84D] text-[#090806] text-xs font-semibold disabled:opacity-60 cursor-pointer whitespace-nowrap"
              >
                <Save className="w-3.5 h-3.5" />
                {saving ? 'Saving changes...' : 'Save Information'}
              </button>
            </div>
          </form>
        </div>

        {/* MT5 Credentials, Security & Workspace Summary */}
        <div className="lg:col-span-5 space-y-5">
          <div className="rounded-2xl bg-white border border-slate-200 p-6 space-y-4">
            <div className="flex items-center gap-2">
              <KeyRound className="w-4 h-4 text-amber-600" />
              <h3 className="text-base font-bold text-slate-950">MT5 Terminal &amp; Bridge Details</h3>
            </div>

            <div className="divide-y divide-slate-200 text-xs">
              <div className="py-2.5 flex items-center justify-between gap-3">
                <span className="text-slate-500">Connection Status</span>
                <span className={user.mt5Connected ? 'font-semibold text-emerald-600' : 'font-semibold text-slate-700'}>
                  {user.mt5Connected ? 'Live Telemetry Connected' : 'Not Connected'}
                </span>
              </div>
              <div className="py-2.5 flex items-center justify-between gap-3">
                <span className="text-slate-500">MT5 Login / Server</span>
                <span className="font-mono text-slate-900">
                  {user.mt5Login || '—'} · {user.mt5Server || '—'}
                </span>
              </div>
              <div className="py-2.5 flex items-center justify-between gap-3">
                <span className="text-slate-500">MT5 Balance / Equity</span>
                <span className="font-mono tabular-nums text-slate-900">
                  {typeof user.mt5Balance === 'number'
                    ? `$${user.mt5Balance.toFixed(2)} / $${(user.mt5Equity ?? user.mt5Balance).toFixed(2)}`
                    : '—'}
                </span>
              </div>
              <div className="py-2.5 flex items-center justify-between gap-3">
                <span className="text-slate-500">Last MT5 Heartbeat</span>
                <span className="font-mono tabular-nums text-slate-600">{formatDateTime(user.mt5LastSync)}</span>
              </div>
            </div>

            {user.mt5BridgeToken && (
              <div className="pt-1">
                <div className="text-xs text-slate-500 mb-1.5">MT5 Bridge Token</div>
                <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-slate-100 border border-slate-200">
                  <span className="flex-1 font-mono text-xs text-amber-700 truncate">
                    {showBridgeToken ? user.mt5BridgeToken : '••••••••••••••••••••'}
                  </span>
                  <button
                    type="button"
                    onClick={() => setShowBridgeToken((v) => !v)}
                    className="p-1 text-slate-500 hover:text-slate-950 cursor-pointer"
                    aria-label={showBridgeToken ? 'Hide token' : 'Reveal token'}
                  >
                    {showBridgeToken ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                  </button>
                  <button
                    type="button"
                    onClick={() => copyValue('bridgeToken', user.mt5BridgeToken || '')}
                    className="p-1 text-slate-500 hover:text-amber-600 cursor-pointer"
                    aria-label="Copy Bridge Token"
                  >
                    {copiedKey === 'bridgeToken' ? (
                      <Check className="w-3.5 h-3.5 text-emerald-600" />
                    ) : (
                      <Copy className="w-3.5 h-3.5" />
                    )}
                  </button>
                </div>
              </div>
            )}
          </div>

          <div className="rounded-2xl bg-white border border-slate-200 p-6 space-y-3">
            <div className="flex items-center gap-2">
              <ShieldCheck className="w-4 h-4 text-amber-600" />
              <h3 className="text-base font-bold text-slate-950">Account Activity Summary</h3>
            </div>
            <div className="divide-y divide-slate-200 text-xs">
              <div className="py-2.5 flex items-center justify-between">
                <span className="text-slate-500">Orders Placed / Paid</span>
                <button
                  type="button"
                  onClick={() => onNavigate('orders')}
                  className="font-mono tabular-nums font-semibold text-slate-900 hover:text-amber-700 cursor-pointer"
                >
                  {orders.length} total · {paidOrdersCount} paid →
                </button>
              </div>
              <div className="py-2.5 flex items-center justify-between">
                <span className="text-slate-500">Journal Net P&amp;L ({journal.length} trades)</span>
                <button
                  type="button"
                  onClick={() => onNavigate('journal')}
                  className={`font-mono tabular-nums font-semibold cursor-pointer ${
                    totalPnl >= 0 ? 'text-emerald-600' : 'text-rose-600'
                  }`}
                >
                  {totalPnl >= 0 ? '+' : ''}${totalPnl.toFixed(2)} →
                </button>
              </div>
              <div className="py-2.5 flex items-center justify-between gap-4">
                <span className="text-slate-500 shrink-0">Saved Watchlist</span>
                <button
                  type="button"
                  onClick={() => onNavigate('charts')}
                  className="font-mono text-slate-600 hover:text-amber-700 truncate cursor-pointer text-right"
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
