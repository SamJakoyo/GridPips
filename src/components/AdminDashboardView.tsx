import React, { useEffect, useState } from 'react';
import {
  ShieldAlert,
  Check,
  XCircle,
  RefreshCw,
  Search,
  Smartphone,
  Activity,
  Pencil,
  X,
  Users,
  DollarSign,
  CheckCircle2,
  AlertCircle,
  Loader2,
} from 'lucide-react';
import { apiFetch } from '../lib/api';
import type { EmailLogItem, MpesaTransaction, Order, SecurityLogItem } from '../types';

interface WebsiteAnalyticsData {
  users: {
    totalUsers: number;
    active24hUsers: number;
    active7dUsers: number;
    exnessVerifiedUsers: number;
    analyzerHolders: number;
    eaBotHolders: number;
    mt5ConnectedUsers: number;
    totalWalletLiabilityKes: number;
  };
  orderFunnel: {
    totalOrders: number;
    paidOrders: number;
    pendingOrders: number;
    failedOrders: number;
    conversionPct: number;
  };
  mpesaFunnel: {
    totalAttempts: number;
    completedCount: number;
    pendingCount: number;
    failedOrCancelledCount: number;
    successRatePct: number;
  };
  engagement: {
    totalReferralClicks: number;
    clicks7d: number;
    journalTradesCount: number;
    savedSetupsCount: number;
    playbooksCount: number;
    mt5CommandsCount: number;
    emailsSentCount: number;
    criticalAlerts24h: number;
  };
  productBreakdown: Array<{
    productKey: string;
    productName: string;
    totalAttempts: number;
    paidCount: number;
    revenueUsd: number;
    revenueKes: number;
  }>;
  dailySeries: Array<{
    day: string;
    signups: number;
    paidOrders: number;
    totalOrders: number;
    revenueUsd: number;
    mpesaCompletedCount: number;
    mpesaCompletedKes: number;
  }>;
}

interface SiteCheckupItem {
  id: string;
  name: string;
  category: string;
  status: 'pass' | 'warn' | 'fail';
  latencyMs: number;
  summary: string;
  detail: string;
}

interface SiteCheckupResponse {
  checkedAt: string;
  targetOrigin: string;
  summary: {
    total: number;
    passed: number;
    warnings: number;
    failed: number;
  };
  checks: SiteCheckupItem[];
}

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
  websiteAnalytics?: WebsiteAnalyticsData;
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
  firewallStatus?: {
    wafEnabled: boolean;
    jsonLimitDefault: string;
    jsonLimitJournal: string;
    stkRateLimit: string;
    adminRateLimit: string;
    authRateLimit: string;
    callbackSecretConfigured: boolean;
    sessionSecretStrong: boolean;
    wafBlocks24h: number;
    activeTempBlockedIps: number;
  };
  users: Array<{
    id: number;
    name: string;
    email: string;
    role: 'user' | 'influencer' | 'admin';
    exness_account_id: string;
    exness_verified: number;
    referral_code: string;
    referred_by?: number | null;
    referrer_name?: string | null;
    referrer_code?: string | null;
    commission_pct?: number | null;
    has_analyzer: number;
    has_ea_bots: number;
    analyzer_expires_at?: string | null;
    ea_bots_expires_at?: string | null;
    mt5_connected: number;
    mt5_login: string | null;
    wallet_balance_kes?: number;
    is_suspended: number;
    created_at: string;
    last_login_at: string | null;
  }>;
  influencers?: Array<{
    id: number;
    name: string;
    email: string;
    role: 'user' | 'influencer' | 'admin';
    referral_code: string;
    exness_account_id: string;
    commission_pct: number | null;
    effective_commission_pct: number;
    is_suspended: number;
    clicks: number;
    signups: number;
    paid_conversions: number;
    total_earned_usd: number;
    paid_out_usd: number;
    pending_payout_usd: number;
    available_balance_usd: number;
    created_at: string;
    last_login_at: string | null;
  }>;
  influencerSummary?: {
    totalInfluencers: number;
    activeReferrersCount: number;
    totalClicks: number;
    totalSignups: number;
    totalPaidConversions: number;
    totalCommissionsUsd: number;
    totalPaidOutUsd: number;
    pendingPayoutsUsd: number;
  };
  orders: Order[];
  mpesaTransactions?: MpesaTransaction[];
  payouts: Array<{
    id: number;
    user_id?: number;
    user_name: string;
    user_email: string;
    referral_code?: string;
    amount_usd: number;
    method: string;
    destination: string;
    status: string;
    created_at: string;
    processed_at?: string | null;
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
  const [tab, setTab] = useState<'analytics' | 'orders' | 'mpesa' | 'users' | 'security' | 'payouts' | 'emails' | 'settings'>('analytics');
  const [data, setData] = useState<AdminOverviewResponse | null>(null);
  const [health, setHealth] = useState<SupabaseHealthResponse | null>(null);
  const [checkupRunning, setCheckupRunning] = useState(false);
  const [checkupError, setCheckupError] = useState('');
  const [checkupResult, setCheckupResult] = useState<SiteCheckupResponse | null>(null);
  const [mpesaSearch, setMpesaSearch] = useState('');
  const [mpesaFilter, setMpesaFilter] = useState<'all' | 'completed' | 'pending' | 'cancelled' | 'failed'>('all');
  const [userSearch, setUserSearch] = useState('');
  const [userRoleFilter, setUserRoleFilter] = useState<'all' | 'user' | 'influencer' | 'admin'>('all');
  const [influencerSearch, setInfluencerSearch] = useState('');
  const [payoutStatusFilter, setPayoutStatusFilter] = useState<'all' | 'pending' | 'paid' | 'rejected'>('all');
  const [refreshingAdmin, setRefreshingAdmin] = useState(false);
  const [adminNotice, setAdminNotice] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [editingUser, setEditingUser] = useState<AdminOverviewResponse['users'][number] | null>(null);
  const [editForm, setEditForm] = useState({
    name: '',
    exnessAccountId: '',
    role: 'user' as 'user' | 'influencer' | 'admin',
    referralCode: '',
    walletBalanceKes: '0',
    commissionPct: '',
    referredByCode: '',
    exnessVerified: false,
    hasAnalyzer: false,
    hasEaBots: false,
    analyzerExpiresAt: '',
    eaBotsExpiresAt: '',
    isSuspended: false,
  });
  const [savingUser, setSavingUser] = useState(false);
  const [editUserError, setEditUserError] = useState('');
  const [settingsForm, setSettingsForm] = useState<Record<string, string>>({});
  const [savingSettings, setSavingSettings] = useState(false);
  const [feedback, setFeedback] = useState('');
  const [settingsError, setSettingsError] = useState('');
  const [darajaTesting, setDarajaTesting] = useState(false);
  const [darajaTestResult, setDarajaTestResult] = useState<{ ok: boolean; message: string } | null>(null);
  const [domainInput, setDomainInput] = useState('www.gridpips.com');
  const [domainChecking, setDomainChecking] = useState(false);
  const [domainCheckError, setDomainCheckError] = useState('');
  const [domainCheckResult, setDomainCheckResult] = useState<{
    domain: string;
    dnsRecords: { a: string[]; cname: string[] };
    pointsToVercel: boolean;
    healthStatus: number | null;
    healthEnv: string | null;
    healthRedirectLocation: string | null;
    callbackStatus: number | null;
    callbackRedirectLocation: string | null;
    callbackAccepted: boolean;
    readyForCallbacks: boolean;
    recommendedCallbackUrl: string | null;
    diagnostics: string[];
  } | null>(null);

  async function handleRunSiteCheckup() {
    setCheckupRunning(true);
    setCheckupError('');
    try {
      const res = await apiFetch<SiteCheckupResponse>('/api/admin/checkup', { method: 'POST' });
      setCheckupResult(res);
    } catch (err) {
      setCheckupError(err instanceof Error ? err.message : 'Unable to complete website checkup.');
    } finally {
      setCheckupRunning(false);
    }
  }

  async function loadAdmin() {
    setRefreshingAdmin(true);
    try {
      const [res, healthRes] = await Promise.all([
        apiFetch<AdminOverviewResponse>('/api/admin/overview'),
        apiFetch<SupabaseHealthResponse>('/api/health/supabase').catch(() => null),
      ]);
      setData(res);
      setSettingsForm(res.settings);
      if (healthRes) setHealth(healthRes);
    } finally {
      setRefreshingAdmin(false);
    }
  }

  useEffect(() => {
    loadAdmin().catch(() => {});
    handleRunSiteCheckup().catch(() => {});
  }, []);

  if (!data) {
    return (
      <div className="bg-white border border-slate-200 rounded-xl p-8 flex items-center gap-3 text-sm text-slate-600">
        <Loader2 className="w-4 h-4 animate-spin text-amber-600" />
        <span>Syncing Admin Command Center &amp; Cloud Directory...</span>
      </div>
    );
  }

  function openEditUserModal(u: AdminOverviewResponse['users'][number]) {
    setEditUserError('');
    setEditingUser(u);
    setEditForm({
      name: u.name || '',
      exnessAccountId: u.exness_account_id || '',
      role: u.role,
      referralCode: u.referral_code || '',
      walletBalanceKes: String(Number(u.wallet_balance_kes || 0)),
      commissionPct:
        typeof u.commission_pct === 'number' && Number.isFinite(u.commission_pct)
          ? String(u.commission_pct)
          : '',
      referredByCode: u.referrer_code || '',
      exnessVerified: Boolean(u.exness_verified),
      hasAnalyzer: Boolean(u.has_analyzer),
      hasEaBots: Boolean(u.has_ea_bots),
      analyzerExpiresAt: u.analyzer_expires_at ? u.analyzer_expires_at.slice(0, 10) : '',
      eaBotsExpiresAt: u.ea_bots_expires_at ? u.ea_bots_expires_at.slice(0, 10) : '',
      isSuspended: Boolean(u.is_suspended),
    });
  }

  async function handleSaveEditedUser(e: React.FormEvent) {
    e.preventDefault();
    if (!editingUser) return;
    setSavingUser(true);
    setEditUserError('');
    try {
      const res = await apiFetch<{ ok: boolean; cloudSynced?: boolean }>(
        `/api/admin/users/${editingUser.id}/update`,
        {
          method: 'POST',
          body: JSON.stringify({
            name: editForm.name.trim(),
            exnessAccountId: editForm.exnessAccountId.trim(),
            role: editForm.role,
            referralCode: editForm.referralCode.trim(),
            walletBalanceKes: Number(editForm.walletBalanceKes || 0),
            commissionPct: editForm.commissionPct.trim() === '' ? null : Number(editForm.commissionPct),
            referredByCode: editForm.referredByCode.trim(),
            exnessVerified: editForm.exnessVerified,
            hasAnalyzer: editForm.hasAnalyzer,
            hasEaBots: editForm.hasEaBots,
            analyzerExpiresAt: editForm.analyzerExpiresAt
              ? `${editForm.analyzerExpiresAt}T23:59:59.000Z`
              : null,
            eaBotsExpiresAt: editForm.eaBotsExpiresAt
              ? `${editForm.eaBotsExpiresAt}T23:59:59.000Z`
              : null,
            isSuspended: editForm.isSuspended,
          }),
        }
      );
      setEditingUser(null);
      await loadAdmin();
      setAdminNotice({
        type: 'success',
        text: `Saved changes for ${editForm.name.trim() || editingUser.email}${res.cloudSynced ? ' and synced to Cloud DB.' : '.'}`,
      });
    } catch (err) {
      setEditUserError(err instanceof Error ? err.message : 'Unable to save user edits.');
    } finally {
      setSavingUser(false);
    }
  }

  async function updateOrderStatus(orderId: number, status: 'paid' | 'failed' | 'refunded') {
    setAdminNotice(null);
    try {
      await apiFetch(`/api/admin/orders/${orderId}/status`, {
        method: 'POST',
        body: JSON.stringify({ status }),
      });
      await loadAdmin();
      setAdminNotice({
        type: 'success',
        text: `Order #${orderId} marked ${status.toUpperCase()} and synced.`,
      });
    } catch (err) {
      setAdminNotice({
        type: 'error',
        text: err instanceof Error ? err.message : 'Unable to update order status.',
      });
    }
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
    setAdminNotice(null);
    try {
      const res = await apiFetch<{ ok: boolean; cloudSynced?: boolean }>(
        `/api/admin/users/${userId}/update`,
        {
          method: 'POST',
          body: JSON.stringify(patch),
        }
      );
      await loadAdmin();
      setAdminNotice({
        type: 'success',
        text: `User #${userId} updated${res.cloudSynced ? ' and persisted to Cloud DB.' : '.'}`,
      });
    } catch (err) {
      setAdminNotice({
        type: 'error',
        text: err instanceof Error ? err.message : 'Unable to update user account.',
      });
    }
  }

  async function updatePayoutStatus(payoutId: number, status: 'paid' | 'rejected') {
    setAdminNotice(null);
    try {
      const res = await apiFetch<{ ok: boolean; cloudPersisted?: boolean }>(
        `/api/admin/payouts/${payoutId}/status`,
        {
          method: 'POST',
          body: JSON.stringify({ status }),
        }
      );
      await loadAdmin();
      setAdminNotice({
        type: 'success',
        text: `Payout #${payoutId} marked ${status.toUpperCase()}${res.cloudPersisted ? ' and synced to Cloud DB.' : '.'}`,
      });
    } catch (err) {
      setAdminNotice({
        type: 'error',
        text: err instanceof Error ? err.message : 'Unable to update payout status.',
      });
    }
  }

  async function handleSaveSettings(e: React.FormEvent) {
    e.preventDefault();
    setSavingSettings(true);
    setFeedback('');
    setSettingsError('');
    try {
      const saved = await apiFetch<{ settings: Record<string, string>; cloudPersisted?: boolean }>(
        '/api/admin/settings',
        {
          method: 'POST',
          body: JSON.stringify(settingsForm),
        }
      );
      if (saved.settings) {
        setSettingsForm(saved.settings);
      }
      await onConfigSaved();
      await loadAdmin();
      setFeedback(
        saved.cloudPersisted
          ? 'Platform settings saved to Cloud DB and updated live across the site.'
          : 'Platform settings saved and updated live across this server.'
      );
    } catch (err) {
      setSettingsError(
        err instanceof Error ? err.message : 'Failed to save platform settings. Please try again.'
      );
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

  async function handleCheckDomain(e: React.FormEvent) {
    e.preventDefault();
    if (!domainInput.trim()) return;
    setDomainChecking(true);
    setDomainCheckError('');
    setDomainCheckResult(null);
    try {
      const res = await apiFetch<NonNullable<typeof domainCheckResult>>('/api/admin/domain/check', {
        method: 'POST',
        body: JSON.stringify({ domain: domainInput.trim() }),
      });
      setDomainCheckResult(res);
    } catch (err) {
      setDomainCheckError(err instanceof Error ? err.message : 'Domain verification failed.');
    } finally {
      setDomainChecking(false);
    }
  }

  return (
    <div className="space-y-6">
      {/* Unified Executive Admin KPI Strip */}
      <div className="rounded-xl overflow-hidden border border-slate-900 bg-[#0B0F19] text-white">
        <div className="px-6 py-4 border-b border-white/10 flex flex-wrap items-center justify-between gap-3">
          <div>
            <div className="text-[11px] font-mono uppercase tracking-[0.14em] text-[#E5A93C]">
              Grid Pips Operations · Cloud-Synced Console
            </div>
            <h2 className="text-lg font-bold tracking-tight text-white mt-0.5">
              Admin Command Center
            </h2>
          </div>
          <button
            type="button"
            onClick={() => void loadAdmin()}
            disabled={refreshingAdmin}
            className="px-3.5 py-2 border border-white/15 bg-white/5 hover:bg-white/10 text-white text-xs font-semibold rounded-lg inline-flex items-center gap-1.5 cursor-pointer whitespace-nowrap shrink-0 disabled:opacity-60"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${refreshingAdmin ? 'animate-spin' : ''}`} />
            <span>{refreshingAdmin ? 'Syncing Cloud...' : 'Sync All Data'}</span>
          </button>
        </div>

        <div className="grid grid-cols-2 lg:grid-cols-4 divide-y lg:divide-y-0 divide-x divide-white/10">
          <div className="px-6 py-4">
            <div className="text-[11px] uppercase tracking-wider text-slate-400">Website Revenue</div>
            <div className="text-2xl font-bold font-mono tabular-nums text-emerald-400 mt-1">
              ${data.metrics.totalRevenueUsd.toFixed(2)}
            </div>
            <div className="text-[11px] font-mono text-slate-400 mt-1 tabular-nums">
              KES {Number(data.metrics.totalRevenueKes || 0).toLocaleString()} · {data.metrics.paidOrdersCount} paid
            </div>
          </div>
          <div className="px-6 py-4">
            <div className="text-[11px] uppercase tracking-wider text-slate-400">Registered Accounts</div>
            <div className="text-2xl font-bold font-mono tabular-nums text-white mt-1">
              {data.metrics.totalUsers.toLocaleString()}
            </div>
            <div className="text-[11px] text-slate-400 mt-1 tabular-nums">
              {data.users.filter((u) => u.exness_verified).length} Exness verified
            </div>
          </div>
          <div className="px-6 py-4">
            <div className="text-[11px] uppercase tracking-wider text-slate-400">Influencer Partners</div>
            <div className="text-2xl font-bold font-mono tabular-nums text-[#E5A93C] mt-1">
              {data.influencerSummary?.activeReferrersCount ?? data.influencers?.length ?? 0}
            </div>
            <div className="text-[11px] font-mono text-slate-400 mt-1 tabular-nums">
              ${(data.influencerSummary?.pendingPayoutsUsd ?? 0).toFixed(2)} pending payout
            </div>
          </div>
          <div className="px-6 py-4">
            <div className="text-[11px] uppercase tracking-wider text-slate-400">Security Events</div>
            <div className="text-2xl font-bold font-mono tabular-nums text-white mt-1">
              {data.securityLogs.length}
            </div>
            <div className="text-[11px] text-slate-400 mt-1">
              {health?.cloudSync?.tablesReady ? 'Supabase Cloud DB active' : 'Local SQLite store'}
            </div>
          </div>
        </div>
      </div>

      {adminNotice && (
        <div
          className={`px-4 py-3 rounded-xl border text-xs font-medium flex items-center justify-between gap-3 ${
            adminNotice.type === 'success'
              ? 'bg-emerald-50 border-emerald-200 text-emerald-900'
              : 'bg-rose-50 border-rose-200 text-rose-800'
          }`}
        >
          <span className="inline-flex items-center gap-2">
            {adminNotice.type === 'success' ? (
              <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
            ) : (
              <AlertCircle className="w-4 h-4 text-rose-600 shrink-0" />
            )}
            <span>{adminNotice.text}</span>
          </span>
          <button
            type="button"
            onClick={() => setAdminNotice(null)}
            className="text-slate-500 hover:text-slate-900 cursor-pointer"
            aria-label="Dismiss notice"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* Navigation Tabs */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex flex-wrap gap-1 p-1 bg-slate-200/70 rounded-lg">
          {(
            [
              ['analytics', 'Analytics & Checkups'],
              ['orders', 'Revenue & Orders'],
              ['mpesa', 'M-Pesa Deposits'],
              ['users', `Users (${data.users.length})`],
              ['payouts', `Influencers & Payouts (${data.influencers?.length ?? 0})`],
              ['security', 'Security Center'],
              ['emails', 'Email Logs'],
              ['settings', 'Site Config'],
            ] as const
          ).map(([key, label]) => (
            <button
              key={key}
              type="button"
              onClick={() => setTab(key)}
              className={`px-3.5 py-1.5 text-xs font-semibold rounded-md cursor-pointer whitespace-nowrap shrink-0 ${
                tab === key ? 'bg-[#0B0F19] text-[#E5A93C] shadow-xs' : 'text-slate-600 hover:text-slate-950'
              }`}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      {/* Tab 0: Website Analytics & Live Checkups */}
      {tab === 'analytics' && (
        <div className="space-y-6">
          {/* Funnel & Engagement KPIs */}
          {data.websiteAnalytics && (
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
              <div className="bg-white border border-slate-200 rounded-xl p-5">
                <div className="text-xs text-slate-500">Active Accounts (24h / 7d)</div>
                <div className="text-2xl font-bold font-mono tabular-nums text-slate-950 mt-1">
                  {data.websiteAnalytics.users.active24hUsers}{' '}
                  <span className="text-sm font-normal text-slate-500">
                    / {data.websiteAnalytics.users.active7dUsers}
                  </span>
                </div>
                <div className="text-xs text-slate-500 mt-1 tabular-nums">
                  {data.websiteAnalytics.users.exnessVerifiedUsers} Exness verified ·{' '}
                  {data.websiteAnalytics.users.mt5ConnectedUsers} MT5 linked
                </div>
              </div>

              <div className="bg-white border border-slate-200 rounded-xl p-5">
                <div className="text-xs text-slate-500">Checkout Conversion Rate</div>
                <div className="text-2xl font-bold font-mono tabular-nums text-emerald-700 mt-1">
                  {data.websiteAnalytics.orderFunnel.conversionPct.toFixed(1)}%
                </div>
                <div className="text-xs text-slate-500 mt-1 font-mono tabular-nums">
                  {data.websiteAnalytics.orderFunnel.paidOrders} paid / {data.websiteAnalytics.orderFunnel.totalOrders}{' '}
                  orders
                </div>
              </div>

              <div className="bg-white border border-slate-200 rounded-xl p-5">
                <div className="text-xs text-slate-500">M-Pesa STK Completion</div>
                <div className="text-2xl font-bold font-mono tabular-nums text-blue-700 mt-1">
                  {data.websiteAnalytics.mpesaFunnel.successRatePct.toFixed(1)}%
                </div>
                <div className="text-xs text-slate-500 mt-1 font-mono tabular-nums">
                  {data.websiteAnalytics.mpesaFunnel.completedCount} ok ·{' '}
                  {data.websiteAnalytics.mpesaFunnel.pendingCount} pending ·{' '}
                  {data.websiteAnalytics.mpesaFunnel.failedOrCancelledCount} failed
                </div>
              </div>

              <div className="bg-white border border-slate-200 rounded-xl p-5">
                <div className="text-xs text-slate-500">Confirmed Wallet Liability</div>
                <div className="text-2xl font-bold font-mono tabular-nums text-slate-950 mt-1">
                  KES {Number(data.websiteAnalytics.users.totalWalletLiabilityKes || 0).toLocaleString()}
                </div>
                <div className="text-xs text-slate-500 mt-1 font-mono tabular-nums">
                  {data.websiteAnalytics.engagement.totalReferralClicks} ref clicks ({data.websiteAnalytics.engagement.clicks7d}{' '}
                  in 7d)
                </div>
              </div>
            </div>
          )}

          {/* Live Website Checkups & System Diagnostics */}
          <div className="bg-white border border-slate-200 rounded-xl p-6 space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <h3 className="text-base font-bold text-slate-950 flex items-center gap-2">
                  <Activity className="w-4 h-4 text-blue-600" />
                  Live Website Checkups &amp; Endpoint Diagnostics
                </h3>
                <p className="text-xs text-slate-500 mt-0.5">
                  Probes live HTTPS availability, M-Pesa Daraja callback and OAuth auth, Supabase Cloud Postgres, market data feeds, SEO files, and session security.
                </p>
              </div>
              <button
                type="button"
                disabled={checkupRunning}
                onClick={() => void handleRunSiteCheckup()}
                className="px-4 py-2 bg-slate-950 hover:bg-slate-800 text-white text-xs font-semibold rounded-lg cursor-pointer disabled:opacity-60 inline-flex items-center gap-1.5 whitespace-nowrap shrink-0"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${checkupRunning ? 'animate-spin' : ''}`} />
                {checkupRunning ? 'Running Checkups...' : 'Run Full Website Checkup'}
              </button>
            </div>

            {checkupError && (
              <div className="p-3 rounded-lg border border-rose-200 bg-rose-50 text-xs text-rose-700">
                {checkupError}
              </div>
            )}

            {checkupResult && (
              <div className="space-y-3">
                <div className="flex flex-wrap items-center justify-between gap-3 py-2.5 px-3.5 bg-slate-50 border border-slate-200 rounded-lg text-xs">
                  <div className="flex flex-wrap items-center gap-3 font-mono tabular-nums">
                    <span className="font-semibold text-emerald-700">
                      {checkupResult.summary.passed} PASSED
                    </span>
                    <span aria-hidden="true" className="text-slate-300">
                      ·
                    </span>
                    <span className="font-semibold text-amber-700">
                      {checkupResult.summary.warnings} WARNINGS
                    </span>
                    <span aria-hidden="true" className="text-slate-300">
                      ·
                    </span>
                    <span className="font-semibold text-rose-700">
                      {checkupResult.summary.failed} FAILED
                    </span>
                  </div>
                  <div className="font-mono tabular-nums text-[11px] text-slate-500">
                    Target: {checkupResult.targetOrigin} · Checked {new Date(checkupResult.checkedAt).toLocaleTimeString()}
                  </div>
                </div>

                <div className="overflow-x-auto">
                  <table className="w-full text-left text-xs">
                    <thead>
                      <tr className="border-b border-slate-200 text-slate-500">
                        <th className="py-2 pr-4">Category</th>
                        <th className="py-2 pr-4">System Check</th>
                        <th className="py-2 pr-4">Status</th>
                        <th className="py-2 pr-4 text-right">Latency</th>
                        <th className="py-2 pr-4">Result</th>
                        <th className="py-2">Diagnostic Detail</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {checkupResult.checks.map((chk) => (
                        <tr key={chk.id} className="align-top">
                          <td className="py-2.5 pr-4 text-slate-500 whitespace-nowrap">{chk.category}</td>
                          <td className="py-2.5 pr-4 font-semibold text-slate-950 whitespace-nowrap">{chk.name}</td>
                          <td className="py-2.5 pr-4 whitespace-nowrap font-mono font-bold">
                            {chk.status === 'pass' ? (
                              <span className="text-emerald-700">PASS</span>
                            ) : chk.status === 'warn' ? (
                              <span className="text-amber-700">WARN</span>
                            ) : (
                              <span className="text-rose-700">FAIL</span>
                            )}
                          </td>
                          <td className="py-2.5 pr-4 text-right font-mono tabular-nums text-slate-500 whitespace-nowrap">
                            {chk.latencyMs > 0 ? `${chk.latencyMs} ms` : '—'}
                          </td>
                          <td className="py-2.5 pr-4 font-mono text-slate-900 whitespace-nowrap">{chk.summary}</td>
                          <td className="py-2.5 text-slate-600">{chk.detail}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {!checkupResult && checkupRunning && (
              <div className="py-8 text-center text-xs text-slate-500">
                Running live diagnostics across domain, Daraja OAuth, Supabase, and market feeds...
              </div>
            )}
          </div>

          {/* 7-Day Trend + Product & Feature Engagement */}
          {data.websiteAnalytics && (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              <div className="bg-white border border-slate-200 rounded-xl p-6 space-y-4">
                <div>
                  <h3 className="text-base font-bold text-slate-950">7-Day Signup &amp; Revenue Activity</h3>
                  <p className="text-xs text-slate-500 mt-0.5">
                    Daily registrations, completed checkouts, and verified M-Pesa inflows (UTC).
                  </p>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-xs">
                    <thead>
                      <tr className="border-b border-slate-200 text-slate-500">
                        <th className="py-2 pr-3">Date</th>
                        <th className="py-2 pr-3 text-right">Signups</th>
                        <th className="py-2 pr-3 text-right">Paid / Orders</th>
                        <th className="py-2 pr-3 text-right">Revenue</th>
                        <th className="py-2 text-right">M-Pesa KES</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 font-mono tabular-nums">
                      {data.websiteAnalytics.dailySeries.map((row) => (
                        <tr key={row.day}>
                          <td className="py-2.5 pr-3 text-slate-700">{row.day}</td>
                          <td className="py-2.5 pr-3 text-right font-semibold text-slate-950">{row.signups}</td>
                          <td className="py-2.5 pr-3 text-right text-slate-700">
                            {row.paidOrders} / {row.totalOrders}
                          </td>
                          <td className="py-2.5 pr-3 text-right font-semibold text-emerald-700">
                            ${row.revenueUsd.toFixed(2)}
                          </td>
                          <td className="py-2.5 text-right text-slate-900">
                            {row.mpesaCompletedKes > 0 ? `KES ${row.mpesaCompletedKes.toLocaleString()}` : '—'}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

              <div className="bg-white border border-slate-200 rounded-xl p-6 space-y-5">
                <div>
                  <h3 className="text-base font-bold text-slate-950">Product Sales &amp; Platform Engagement</h3>
                  <p className="text-xs text-slate-500 mt-0.5">
                    License distribution and trader tool usage recorded across the platform.
                  </p>
                </div>

                {data.websiteAnalytics.productBreakdown.length === 0 ? (
                  <p className="text-xs text-slate-500 py-3">No product checkouts initiated yet.</p>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-left text-xs">
                      <thead>
                        <tr className="border-b border-slate-200 text-slate-500">
                          <th className="py-2 pr-3">Product</th>
                          <th className="py-2 pr-3 text-right">Paid / Attempts</th>
                          <th className="py-2 pr-3 text-right">USD</th>
                          <th className="py-2 text-right">KES</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100 font-mono tabular-nums">
                        {data.websiteAnalytics.productBreakdown.map((prod) => (
                          <tr key={prod.productKey}>
                            <td className="py-2.5 pr-3 font-sans font-semibold text-slate-950">{prod.productName}</td>
                            <td className="py-2.5 pr-3 text-right text-slate-700">
                              {prod.paidCount} / {prod.totalAttempts}
                            </td>
                            <td className="py-2.5 pr-3 text-right font-semibold text-emerald-700">
                              ${Number(prod.revenueUsd || 0).toFixed(2)}
                            </td>
                            <td className="py-2.5 text-right text-slate-700">
                              KES {Number(prod.revenueKes || 0).toLocaleString()}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}

                <div className="pt-3 border-t border-slate-200 grid grid-cols-2 sm:grid-cols-3 gap-3 text-xs">
                  <div>
                    <div className="text-slate-500">Analyzer Licenses</div>
                    <div className="font-mono tabular-nums font-bold text-slate-950 mt-0.5">
                      {data.websiteAnalytics.users.analyzerHolders}
                    </div>
                  </div>
                  <div>
                    <div className="text-slate-500">EA Bot Licenses</div>
                    <div className="font-mono tabular-nums font-bold text-slate-950 mt-0.5">
                      {data.websiteAnalytics.users.eaBotHolders}
                    </div>
                  </div>
                  <div>
                    <div className="text-slate-500">Journal Trades Logged</div>
                    <div className="font-mono tabular-nums font-bold text-slate-950 mt-0.5">
                      {data.websiteAnalytics.engagement.journalTradesCount}
                    </div>
                  </div>
                  <div>
                    <div className="text-slate-500">Saved ICT Setups</div>
                    <div className="font-mono tabular-nums font-bold text-slate-950 mt-0.5">
                      {data.websiteAnalytics.engagement.savedSetupsCount}
                    </div>
                  </div>
                  <div>
                    <div className="text-slate-500">MT5 Bridge Commands</div>
                    <div className="font-mono tabular-nums font-bold text-slate-950 mt-0.5">
                      {data.websiteAnalytics.engagement.mt5CommandsCount}
                    </div>
                  </div>
                  <div>
                    <div className="text-slate-500">Automated Emails</div>
                    <div className="font-mono tabular-nums font-bold text-slate-950 mt-0.5">
                      {data.websiteAnalytics.engagement.emailsSentCount}
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      )}

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
                  <td className="py-3 pr-4 text-xs text-slate-700">
                    <div className="font-medium text-slate-900">{o.product_name}</div>
                    <div className="text-[11px] font-mono text-slate-500 capitalize">
                      {o.billing_cycle || 'monthly'} ({o.duration_days || 30}d)
                      {o.subscription_ends_at ? ` · thru ${o.subscription_ends_at.slice(0, 10)}` : ''}
                    </div>
                  </td>
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
        <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
          <div className="px-6 py-4 border-b border-slate-200 flex flex-wrap items-center justify-between gap-3">
            <div>
              <h3 className="text-base font-bold text-slate-950">
                Website User Directory, Exness IDs &amp; Account Editor
              </h3>
              <p className="text-xs text-slate-500 mt-0.5">
                Synced from Supabase Auth, profiles &amp; Cloud state. Edit any user&apos;s profile, role, wallet, commission %, or licenses.
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <div className="relative">
                <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  value={userSearch}
                  onChange={(e) => setUserSearch(e.target.value)}
                  placeholder="Search name, email, Exness, ref..."
                  className="pl-8 pr-3 py-1.5 text-xs border border-slate-300 rounded-lg bg-white focus:outline-none focus:border-slate-900 w-56"
                />
              </div>
              <div className="flex items-center gap-1 p-1 bg-slate-100 rounded-lg">
                {(['all', 'user', 'influencer', 'admin'] as const).map((rf) => (
                  <button
                    key={rf}
                    type="button"
                    onClick={() => setUserRoleFilter(rf)}
                    className={`px-2.5 py-1 text-xs font-semibold rounded-md capitalize cursor-pointer whitespace-nowrap shrink-0 ${
                      userRoleFilter === rf
                        ? 'bg-white text-slate-950 shadow-xs'
                        : 'text-slate-600 hover:text-slate-900'
                    }`}
                  >
                    {rf}
                  </button>
                ))}
              </div>
            </div>
          </div>

          <div className="p-6 overflow-x-auto">
            {(() => {
              const q = userSearch.trim().toLowerCase();
              const filteredUsers = data.users.filter((u) => {
                if (userRoleFilter !== 'all' && u.role !== userRoleFilter) return false;
                if (!q) return true;
                return [u.name, u.email, u.exness_account_id, u.referral_code, u.referrer_code]
                  .filter(Boolean)
                  .join(' ')
                  .toLowerCase()
                  .includes(q);
              });

              if (filteredUsers.length === 0) {
                return (
                  <p className="text-sm text-slate-500 py-6 text-center">
                    No users match your current search or role filter.
                  </p>
                );
              }

              return (
                <table className="w-full text-left text-sm">
                  <thead>
                    <tr className="border-b border-slate-200 text-[11px] uppercase tracking-wider text-slate-500">
                      <th className="py-2.5 pr-4">User</th>
                      <th className="py-2.5 pr-4">Exness ID</th>
                      <th className="py-2.5 pr-4">Referral / Wallet</th>
                      <th className="py-2.5 pr-4">Role</th>
                      <th className="py-2.5 pr-4">Licenses &amp; IB</th>
                      <th className="py-2.5 pr-4">Last Login</th>
                      <th className="py-2.5 text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {filteredUsers.map((u) => (
                      <tr key={u.id} className="hover:bg-slate-50/70">
                        <td className="py-3 pr-4 text-xs">
                          <div className="font-semibold text-slate-950 flex items-center gap-1.5">
                            <span>{u.name}</span>
                            {u.is_suspended ? (
                              <span className="text-[10px] font-bold uppercase text-rose-700">
                                [Suspended]
                              </span>
                            ) : null}
                          </div>
                          <div className="text-slate-500">{u.email}</div>
                          {u.referrer_code && (
                            <div className="text-[11px] text-amber-700 font-mono mt-0.5">
                              Ref by: {u.referrer_code}
                            </div>
                          )}
                        </td>
                        <td className="py-3 pr-4 font-mono text-xs text-slate-700">
                          <div>{u.exness_account_id}</div>
                          <div
                            className={`text-[11px] font-sans font-semibold mt-0.5 ${
                              u.exness_verified ? 'text-emerald-700' : 'text-amber-700'
                            }`}
                          >
                            {u.exness_verified ? 'Verified IB' : 'Pending IB'}
                          </div>
                        </td>
                        <td className="py-3 pr-4 font-mono text-xs">
                          <div className="font-semibold text-slate-900">{u.referral_code}</div>
                          <div className="text-[11px] text-slate-500 tabular-nums">
                            KES {Number(u.wallet_balance_kes || 0).toLocaleString()}
                            {typeof u.commission_pct === 'number' ? ` · ${u.commission_pct}% comm` : ''}
                          </div>
                        </td>
                        <td className="py-3 pr-4">
                          <select
                            value={u.role}
                            onChange={(e) =>
                              void updateUser(u.id, {
                                role: e.target.value as 'user' | 'influencer' | 'admin',
                              })
                            }
                            className="px-2 py-1 text-xs border border-slate-300 rounded-md bg-white font-semibold"
                          >
                            <option value="user">user</option>
                            <option value="influencer">influencer</option>
                            <option value="admin">admin</option>
                          </select>
                        </td>
                        <td className="py-3 pr-4 text-xs space-y-1 whitespace-nowrap">
                          <div className="space-x-1.5">
                            <button
                              type="button"
                              onClick={() => void updateUser(u.id, { exnessVerified: !u.exness_verified })}
                              className={`px-2 py-1 rounded border cursor-pointer ${
                                u.exness_verified
                                  ? 'border-emerald-600 text-emerald-700 bg-emerald-50/60'
                                  : 'border-amber-500 text-amber-800 bg-amber-50'
                              }`}
                            >
                              {u.exness_verified ? 'IB OK' : 'Verify IB'}
                            </button>
                            <button
                              type="button"
                              onClick={() => void updateUser(u.id, { hasAnalyzer: !u.has_analyzer })}
                              className={`px-2 py-1 rounded border cursor-pointer ${
                                u.has_analyzer
                                  ? 'border-emerald-600 text-emerald-700 bg-emerald-50/50'
                                  : 'border-slate-300 text-slate-500'
                              }`}
                            >
                              Analyzer {u.has_analyzer ? 'ON' : 'OFF'}
                            </button>
                            <button
                              type="button"
                              onClick={() => void updateUser(u.id, { hasEaBots: !u.has_ea_bots })}
                              className={`px-2 py-1 rounded border cursor-pointer ${
                                u.has_ea_bots
                                  ? 'border-emerald-600 text-emerald-700 bg-emerald-50/50'
                                  : 'border-slate-300 text-slate-500'
                              }`}
                            >
                              DRT {u.has_ea_bots ? 'ON' : 'OFF'}
                            </button>
                          </div>
                          {(u.analyzer_expires_at || u.ea_bots_expires_at) && (
                            <div className="text-[10px] font-mono text-slate-500">
                              {u.analyzer_expires_at ? `ICT exp ${u.analyzer_expires_at.slice(0, 10)}` : ''}
                              {u.analyzer_expires_at && u.ea_bots_expires_at ? ' · ' : ''}
                              {u.ea_bots_expires_at ? `DRT exp ${u.ea_bots_expires_at.slice(0, 10)}` : ''}
                            </div>
                          )}
                        </td>
                        <td className="py-3 pr-4 font-mono text-xs text-slate-500 whitespace-nowrap">
                          {u.last_login_at ? u.last_login_at.slice(0, 16) : '—'}
                        </td>
                        <td className="py-3 text-right whitespace-nowrap space-x-1.5">
                          <button
                            type="button"
                            onClick={() => openEditUserModal(u)}
                            className="px-2.5 py-1 bg-[#0B0F19] hover:bg-slate-800 text-[#E5A93C] text-xs font-semibold rounded inline-flex items-center gap-1 cursor-pointer"
                          >
                            <Pencil className="w-3 h-3" />
                            <span>Edit</span>
                          </button>
                          <button
                            type="button"
                            onClick={() => void updateUser(u.id, { isSuspended: !u.is_suspended })}
                            className={`px-2.5 py-1 text-xs font-semibold rounded cursor-pointer ${
                              u.is_suspended
                                ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                                : 'bg-rose-50 text-rose-700 border border-rose-200'
                            }`}
                          >
                            {u.is_suspended ? 'Restore' : 'Suspend'}
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              );
            })()}
          </div>
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

                  <div className="pt-2 border-t border-slate-200 space-y-2">
                    <div className="font-semibold text-slate-900">
                      Test Custom Domain (Namecheap DNS) &amp; Callback URL
                    </div>
                    <form onSubmit={handleCheckDomain} className="flex flex-wrap items-center gap-2">
                      <input
                        type="text"
                        value={domainInput}
                        onChange={(e) => setDomainInput(e.target.value)}
                        placeholder="gridpips.com or app.yourdomain.com"
                        className="flex-1 min-w-[220px] px-3 py-1.5 text-xs bg-white border border-slate-300 rounded-md focus:outline-none focus:border-slate-900 font-mono"
                      />
                      <button
                        type="submit"
                        disabled={domainChecking || !domainInput.trim()}
                        className="px-3 py-1.5 bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold rounded-md cursor-pointer disabled:opacity-60"
                      >
                        {domainChecking ? 'Checking DNS & HTTPS...' : 'Check Domain'}
                      </button>
                    </form>
                    {domainCheckError && (
                      <div className="p-2.5 rounded-md border bg-rose-50 border-rose-200 text-rose-700 text-xs">
                        {domainCheckError}
                      </div>
                    )}
                    {domainCheckResult && (
                      <div
                        className={`p-3 rounded-md border text-xs space-y-1.5 ${
                          domainCheckResult.readyForCallbacks
                            ? 'bg-emerald-50 border-emerald-200 text-emerald-900'
                            : 'bg-amber-50 border-amber-200 text-amber-900'
                        }`}
                      >
                        <div className="font-semibold flex flex-wrap items-center justify-between gap-2">
                          <span>
                            {domainCheckResult.domain}:{' '}
                            {domainCheckResult.readyForCallbacks
                              ? 'Ready for Safaricom M-Pesa Callbacks'
                              : 'Action Required Before Using as Callback Host'}
                          </span>
                          <span className="font-mono text-[11px]">
                            Vercel DNS: {domainCheckResult.pointsToVercel ? 'YES' : 'NO'} · /api/health:{' '}
                            {domainCheckResult.healthStatus ?? 'ERR'} · Callback POST:{' '}
                            {domainCheckResult.callbackStatus ?? 'ERR'}
                          </span>
                        </div>
                        <div className="font-mono text-[11px] text-slate-700">
                          A: {domainCheckResult.dnsRecords.a.join(', ') || 'none'} · CNAME:{' '}
                          {domainCheckResult.dnsRecords.cname.join(', ') || 'none'}
                          {domainCheckResult.healthEnv ? ` · Live Env: ${domainCheckResult.healthEnv}` : ''}
                        </div>
                        {domainCheckResult.recommendedCallbackUrl && (
                          <div className="font-mono text-[11px] bg-white/80 border border-emerald-300 rounded px-2 py-1 text-emerald-900 break-all">
                            MPESA_CALLBACK_URL={domainCheckResult.recommendedCallbackUrl}
                          </div>
                        )}
                        {domainCheckResult.diagnostics.length > 0 && (
                          <ul className="list-disc pl-4 space-y-0.5 text-[11px]">
                            {domainCheckResult.diagnostics.map((d, i) => (
                              <li key={i}>{d}</li>
                            ))}
                          </ul>
                        )}
                      </div>
                    )}
                  </div>
                </div>

                {data.firewallStatus && (
                  <div className="p-3.5 rounded-lg border border-slate-200 bg-slate-50/70 space-y-2.5 md:col-span-2">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <span className="font-semibold text-slate-900">
                        6. Application Firewall (WAF), Payload Caps &amp; STK Throttling
                      </span>
                      <span
                        className={`font-semibold ${
                          data.firewallStatus.callbackSecretConfigured && data.firewallStatus.sessionSecretStrong
                            ? 'text-emerald-700'
                            : 'text-amber-700'
                        }`}
                      >
                        {data.firewallStatus.callbackSecretConfigured
                          ? 'Active · Strict Callback Token Enforced'
                          : 'Active · Add MPESA_CALLBACK_SECRET on Vercel'}
                      </span>
                    </div>
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-[11px] font-mono bg-white border border-slate-200 rounded-lg p-3">
                      <div>
                        <div className="text-slate-400">L7 WAF FILTER</div>
                        <div className="font-bold text-emerald-700">
                          {data.firewallStatus.wafEnabled ? 'ENABLED' : 'OFF'}
                        </div>
                      </div>
                      <div>
                        <div className="text-slate-400">JSON BODY CAPS</div>
                        <div className="font-bold text-slate-900">
                          {data.firewallStatus.jsonLimitDefault} · {data.firewallStatus.jsonLimitJournal} journal
                        </div>
                      </div>
                      <div>
                        <div className="text-slate-400">STK / ADMIN LIMITS</div>
                        <div className="font-bold text-slate-900 truncate">
                          {data.firewallStatus.stkRateLimit}
                        </div>
                      </div>
                      <div>
                        <div className="text-slate-400">24H BLOCKS / BANS</div>
                        <div className="font-bold text-slate-900 tabular-nums">
                          {data.firewallStatus.wafBlocks24h} blocks · {data.firewallStatus.activeTempBlockedIps} temp bans
                        </div>
                      </div>
                    </div>
                    <p className="text-slate-600">
                      Blocks automated <span className="font-mono">.env/.git/wp-admin/.php</span> scanners, path traversal, and XSS/SQLi query probes with automatic 15-minute IP cooldowns, enforces 256KB JSON limits on auth/payment routes, and throttles M-Pesa STK Push ({data.firewallStatus.stkRateLimit}) &amp; Admin ({data.firewallStatus.adminRateLimit}).
                      {!data.firewallStatus.callbackSecretConfigured && (
                        <span className="block mt-1 text-amber-800">
                          Action required on Vercel: add <span className="font-mono font-semibold">MPESA_CALLBACK_SECRET</span> (32+ chars) and append <span className="font-mono font-semibold">?token=&lt;secret&gt;</span> to <span className="font-mono font-semibold">MPESA_CALLBACK_URL</span> so unauthorized callback POSTs receive HTTP 403 immediately.
                        </span>
                      )}
                    </p>
                  </div>
                )}
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

      {/* Tab 4: Influencers & Payouts */}
      {tab === 'payouts' && (
        <div className="space-y-6">
          {/* Influencer Summary KPI Row */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            <div className="bg-white border border-slate-200 rounded-xl p-5">
              <div className="flex items-center justify-between text-xs text-slate-500">
                <span>Influencers &amp; Referrers</span>
                <Users className="w-4 h-4 text-slate-400" />
              </div>
              <div className="text-2xl font-bold font-mono tabular-nums text-slate-950 mt-2">
                {data.influencerSummary?.totalInfluencers ?? 0}
                <span className="text-xs font-normal text-slate-500 ml-1.5">
                  ({data.influencerSummary?.activeReferrersCount ?? data.influencers?.length ?? 0} active)
                </span>
              </div>
              <div className="text-[11px] text-slate-500 mt-1">
                Global rate: {data.settings.influencer_commission_pct || '35'}% (recurring)
              </div>
            </div>

            <div className="bg-white border border-slate-200 rounded-xl p-5">
              <div className="flex items-center justify-between text-xs text-slate-500">
                <span>Total Clicks &amp; Signups</span>
                <Activity className="w-4 h-4 text-slate-400" />
              </div>
              <div className="text-2xl font-bold font-mono tabular-nums text-slate-950 mt-2">
                {(data.influencerSummary?.totalClicks ?? 0).toLocaleString()}
                <span className="text-xs font-normal text-slate-500 ml-1.5">
                  / {(data.influencerSummary?.totalSignups ?? 0).toLocaleString()} signups
                </span>
              </div>
              <div className="text-[11px] text-slate-500 mt-1 tabular-nums">
                {data.influencerSummary?.totalPaidConversions ?? 0} paid license conversions
              </div>
            </div>

            <div className="bg-white border border-slate-200 rounded-xl p-5">
              <div className="flex items-center justify-between text-xs text-slate-500">
                <span>Total Commissions Earned</span>
                <DollarSign className="w-4 h-4 text-emerald-600" />
              </div>
              <div className="text-2xl font-bold font-mono tabular-nums text-emerald-700 mt-2">
                ${(data.influencerSummary?.totalCommissionsUsd ?? 0).toFixed(2)}
              </div>
              <div className="text-[11px] font-mono text-slate-500 mt-1 tabular-nums">
                Disbursed: ${(data.influencerSummary?.totalPaidOutUsd ?? 0).toFixed(2)}
              </div>
            </div>

            <div className="bg-white border border-slate-200 rounded-xl p-5">
              <div className="flex items-center justify-between text-xs text-slate-500">
                <span>Pending Payout Queue</span>
                <DollarSign className="w-4 h-4 text-amber-600" />
              </div>
              <div className="text-2xl font-bold font-mono tabular-nums text-amber-700 mt-2">
                ${(data.influencerSummary?.pendingPayoutsUsd ?? 0).toFixed(2)}
              </div>
              <div className="text-[11px] text-slate-500 mt-1 tabular-nums">
                {data.payouts.filter((p) => p.status === 'pending').length} request(s) awaiting action
              </div>
            </div>
          </div>

          {/* Influencer Partner Directory */}
          <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
            <div className="px-6 py-4 border-b border-slate-200 flex flex-wrap items-center justify-between gap-3">
              <div>
                <h3 className="text-base font-bold text-slate-950">Influencer Partner Directory</h3>
                <p className="text-xs text-slate-500 mt-0.5">
                  Every user with the Influencer role or active referral traffic. Click Edit Partner to adjust their code, role, or custom commission %.
                </p>
              </div>
              <div className="relative">
                <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  value={influencerSearch}
                  onChange={(e) => setInfluencerSearch(e.target.value)}
                  placeholder="Search partner or ref code..."
                  className="pl-8 pr-3 py-1.5 text-xs border border-slate-300 rounded-lg bg-white focus:outline-none focus:border-slate-900 w-56"
                />
              </div>
            </div>

            <div className="p-6 overflow-x-auto">
              {(() => {
                const list = data.influencers || [];
                const q = influencerSearch.trim().toLowerCase();
                const filteredInf = list.filter((inf) => {
                  if (!q) return true;
                  return [inf.name, inf.email, inf.referral_code, inf.exness_account_id]
                    .filter(Boolean)
                    .join(' ')
                    .toLowerCase()
                    .includes(q);
                });

                if (filteredInf.length === 0) {
                  return (
                    <div className="py-8 text-center space-y-2">
                      <p className="text-sm font-semibold text-slate-800">
                        No influencer partners or active referrers found yet.
                      </p>
                      <p className="text-xs text-slate-500">
                        Promote any registered user to the <span className="font-mono font-semibold">influencer</span> role in the Users tab to manage them here.
                      </p>
                    </div>
                  );
                }

                return (
                  <table className="w-full text-left text-xs">
                    <thead>
                      <tr className="border-b border-slate-200 text-[11px] uppercase tracking-wider text-slate-500">
                        <th className="py-2.5 pr-3">Partner</th>
                        <th className="py-2.5 pr-3">Ref Code</th>
                        <th className="py-2.5 pr-3 text-right">Rate</th>
                        <th className="py-2.5 pr-3 text-right">Clicks</th>
                        <th className="py-2.5 pr-3 text-right">Signups</th>
                        <th className="py-2.5 pr-3 text-right">Paid Sales</th>
                        <th className="py-2.5 pr-3 text-right">Earned</th>
                        <th className="py-2.5 pr-3 text-right">Paid Out</th>
                        <th className="py-2.5 pr-3 text-right">Available</th>
                        <th className="py-2.5 text-right">Manage</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {filteredInf.map((inf) => {
                        const matchingUser = data.users.find((u) => u.id === inf.id);
                        return (
                          <tr key={inf.id} className="hover:bg-slate-50/70">
                            <td className="py-3 pr-3">
                              <div className="font-semibold text-slate-950">
                                {inf.name}{' '}
                                <span className="text-[10px] font-mono uppercase text-amber-700">
                                  ({inf.role})
                                </span>
                              </div>
                              <div className="text-slate-500">{inf.email}</div>
                            </td>
                            <td className="py-3 pr-3 font-mono font-semibold text-slate-900">
                              {inf.referral_code}
                            </td>
                            <td className="py-3 pr-3 text-right font-mono tabular-nums text-slate-700">
                              {inf.effective_commission_pct}%
                              {inf.commission_pct !== null ? ' *' : ''}
                            </td>
                            <td className="py-3 pr-3 text-right font-mono tabular-nums text-slate-700">
                              {inf.clicks}
                            </td>
                            <td className="py-3 pr-3 text-right font-mono tabular-nums text-slate-700">
                              {inf.signups}
                            </td>
                            <td className="py-3 pr-3 text-right font-mono tabular-nums font-semibold text-slate-900">
                              {inf.paid_conversions}
                            </td>
                            <td className="py-3 pr-3 text-right font-mono tabular-nums font-semibold text-emerald-700">
                              ${inf.total_earned_usd.toFixed(2)}
                            </td>
                            <td className="py-3 pr-3 text-right font-mono tabular-nums text-slate-600">
                              ${inf.paid_out_usd.toFixed(2)}
                            </td>
                            <td className="py-3 pr-3 text-right font-mono tabular-nums font-bold text-slate-950">
                              ${inf.available_balance_usd.toFixed(2)}
                            </td>
                            <td className="py-3 text-right whitespace-nowrap">
                              {matchingUser && (
                                <button
                                  type="button"
                                  onClick={() => openEditUserModal(matchingUser)}
                                  className="px-2.5 py-1 bg-[#0B0F19] hover:bg-slate-800 text-[#E5A93C] text-xs font-semibold rounded inline-flex items-center gap-1 cursor-pointer"
                                >
                                  <Pencil className="w-3 h-3" />
                                  <span>Edit Partner</span>
                                </button>
                              )}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                );
              })()}
            </div>
          </div>

          {/* Payout Requests Queue */}
          <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
            <div className="px-6 py-4 border-b border-slate-200 flex flex-wrap items-center justify-between gap-3">
              <div>
                <h3 className="text-base font-bold text-slate-950">Influencer Commission Payout Queue</h3>
                <p className="text-xs text-slate-500 mt-0.5">
                  Approving or rejecting a payout persists to Cloud DB and emails the influencer automatically.
                </p>
              </div>
              <div className="flex items-center gap-1 p-1 bg-slate-100 rounded-lg">
                {(['all', 'pending', 'paid', 'rejected'] as const).map((pf) => (
                  <button
                    key={pf}
                    type="button"
                    onClick={() => setPayoutStatusFilter(pf)}
                    className={`px-2.5 py-1 text-xs font-semibold rounded-md capitalize cursor-pointer whitespace-nowrap shrink-0 ${
                      payoutStatusFilter === pf
                        ? 'bg-white text-slate-950 shadow-xs'
                        : 'text-slate-600 hover:text-slate-900'
                    }`}
                  >
                    {pf}
                  </button>
                ))}
              </div>
            </div>

            <div className="p-6 overflow-x-auto">
              {(() => {
                const filteredPayouts = data.payouts.filter(
                  (p) => payoutStatusFilter === 'all' || p.status === payoutStatusFilter
                );
                if (filteredPayouts.length === 0) {
                  return (
                    <p className="text-sm text-slate-500 py-6 text-center">
                      No payout requests match this filter.
                    </p>
                  );
                }
                return (
                  <table className="w-full text-left text-sm">
                    <thead>
                      <tr className="border-b border-slate-200 text-[11px] uppercase tracking-wider text-slate-500">
                        <th className="py-2.5 pr-4">Influencer</th>
                        <th className="py-2.5 pr-4">Date</th>
                        <th className="py-2.5 pr-4">Method</th>
                        <th className="py-2.5 pr-4">Destination</th>
                        <th className="py-2.5 pr-4 text-right">Amount</th>
                        <th className="py-2.5 pr-4">Status</th>
                        <th className="py-2.5 text-right">Action</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {filteredPayouts.map((p) => (
                        <tr key={p.id} className="hover:bg-slate-50/70">
                          <td className="py-3 pr-4 text-xs">
                            <div className="font-semibold text-slate-950">
                              {p.user_name}{' '}
                              {p.referral_code ? (
                                <span className="font-mono text-[11px] text-slate-500">
                                  ({p.referral_code})
                                </span>
                              ) : null}
                            </div>
                            <div className="text-slate-500">{p.user_email}</div>
                          </td>
                          <td className="py-3 pr-4 font-mono text-xs text-slate-500">
                            {p.created_at.slice(0, 10)}
                          </td>
                          <td className="py-3 pr-4 font-mono text-xs uppercase text-slate-700">
                            {p.method}
                          </td>
                          <td className="py-3 pr-4 font-mono text-xs text-slate-700">{p.destination}</td>
                          <td className="py-3 pr-4 text-right font-mono tabular-nums font-bold text-slate-950">
                            ${Number(p.amount_usd).toFixed(2)}
                          </td>
                          <td className="py-3 pr-4 text-xs font-semibold capitalize">
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
                          <td className="py-3 text-right space-x-2 whitespace-nowrap">
                            {p.status === 'pending' ? (
                              <>
                                <button
                                  type="button"
                                  onClick={() => void updatePayoutStatus(p.id, 'paid')}
                                  className="inline-flex items-center gap-1 px-2.5 py-1 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold rounded cursor-pointer"
                                >
                                  <Check className="w-3 h-3" /> Mark Paid
                                </button>
                                <button
                                  type="button"
                                  onClick={() => void updatePayoutStatus(p.id, 'rejected')}
                                  className="inline-flex items-center gap-1 px-2.5 py-1 border border-rose-300 hover:bg-rose-50 text-rose-700 text-xs font-semibold rounded cursor-pointer"
                                >
                                  <XCircle className="w-3 h-3" /> Reject
                                </button>
                              </>
                            ) : (
                              <span className="text-[11px] font-mono text-slate-400">
                                {p.processed_at ? p.processed_at.slice(0, 10) : 'Processed'}
                              </span>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                );
              })()}
            </div>
          </div>
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
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                DRT Strategy YouTube Channel URL
              </label>
              <input
                value={settingsForm.drt_youtube_channel_url || ''}
                onChange={(e) =>
                  setSettingsForm({ ...settingsForm, drt_youtube_channel_url: e.target.value })
                }
                className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg font-mono"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Influencer Payout Commission (%)
              </label>
              <input
                value={settingsForm.influencer_commission_pct || ''}
                onChange={(e) =>
                  setSettingsForm({ ...settingsForm, influencer_commission_pct: e.target.value })
                }
                className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg font-mono"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                ICT Analyzer Monthly Price (USD)
              </label>
              <input
                value={settingsForm.analyzer_price_usd || ''}
                onChange={(e) =>
                  setSettingsForm({ ...settingsForm, analyzer_price_usd: e.target.value })
                }
                className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg font-mono"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                DRT Analyzer Monthly Price (USD)
              </label>
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

          {settingsError && (
            <div className="p-3 bg-rose-50 border border-rose-200 text-rose-700 text-xs rounded-lg">
              {settingsError}
            </div>
          )}

          {feedback && (
            <div className="p-3 bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs rounded-lg">
              {feedback}
            </div>
          )}

          <button
            type="submit"
            disabled={savingSettings}
            className="px-5 py-2.5 bg-[#0B0F19] hover:bg-slate-800 text-[#E5A93C] text-xs font-bold rounded-lg cursor-pointer disabled:opacity-60"
          >
            {savingSettings ? 'Saving to Cloud DB...' : 'Save Global Settings'}
          </button>
        </form>
      )}

      {/* Full Edit User & Influencer Partner Modal */}
      {editingUser && (
        <div className="fixed inset-0 z-50 bg-slate-950/65 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white border border-slate-200 rounded-xl max-w-2xl w-full shadow-2xl overflow-hidden max-h-[92vh] flex flex-col">
            <div className="px-6 py-4 bg-[#0B0F19] text-white flex items-center justify-between gap-3">
              <div>
                <div className="text-[11px] font-mono uppercase tracking-[0.14em] text-[#E5A93C]">
                  Edit Website Account · #{editingUser.id}
                </div>
                <h3 className="text-base font-bold text-white mt-0.5">{editingUser.email}</h3>
              </div>
              <button
                type="button"
                onClick={() => setEditingUser(null)}
                className="p-1.5 text-slate-400 hover:text-white rounded-lg cursor-pointer"
                aria-label="Close edit modal"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSaveEditedUser} className="p-6 space-y-5 overflow-y-auto">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Full Name</label>
                  <input
                    required
                    value={editForm.name}
                    onChange={(e) => setEditForm({ ...editForm, name: e.target.value })}
                    className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:outline-none focus:border-slate-900"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Exness Account ID
                  </label>
                  <input
                    required
                    value={editForm.exnessAccountId}
                    onChange={(e) => setEditForm({ ...editForm, exnessAccountId: e.target.value })}
                    className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg font-mono focus:outline-none focus:border-slate-900"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Account Role</label>
                  <select
                    value={editForm.role}
                    onChange={(e) =>
                      setEditForm({
                        ...editForm,
                        role: e.target.value as 'user' | 'influencer' | 'admin',
                      })
                    }
                    className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg bg-white font-semibold"
                  >
                    <option value="user">User (Trader)</option>
                    <option value="influencer">Influencer Partner</option>
                    <option value="admin">Admin</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Referral Code (Unique)
                  </label>
                  <input
                    required
                    value={editForm.referralCode}
                    onChange={(e) =>
                      setEditForm({ ...editForm, referralCode: e.target.value.toUpperCase() })
                    }
                    className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg font-mono uppercase focus:outline-none focus:border-slate-900"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    KES Wallet Balance
                  </label>
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    value={editForm.walletBalanceKes}
                    onChange={(e) => setEditForm({ ...editForm, walletBalanceKes: e.target.value })}
                    className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg font-mono tabular-nums focus:outline-none focus:border-slate-900"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Custom Commission % (blank = site default {data.settings.influencer_commission_pct || 35}%)
                  </label>
                  <input
                    type="number"
                    step="0.5"
                    min="0"
                    max="80"
                    placeholder={`Default (${data.settings.influencer_commission_pct || 35}%)`}
                    value={editForm.commissionPct}
                    onChange={(e) => setEditForm({ ...editForm, commissionPct: e.target.value })}
                    className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg font-mono tabular-nums focus:outline-none focus:border-slate-900"
                  />
                </div>
                <div className="sm:col-span-2">
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Referred By Partner Code (optional)
                  </label>
                  <input
                    placeholder="Leave blank if organic signup"
                    value={editForm.referredByCode}
                    onChange={(e) =>
                      setEditForm({ ...editForm, referredByCode: e.target.value.toUpperCase() })
                    }
                    className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg font-mono uppercase focus:outline-none focus:border-slate-900"
                  />
                </div>
                <div>
                  <div className="flex items-center justify-between mb-1">
                    <label className="block text-xs font-semibold text-slate-700">
                      ICT Analyzer Expiry Date
                    </label>
                    <button
                      type="button"
                      onClick={() => {
                        const base = editForm.analyzerExpiresAt
                          ? Math.max(Date.now(), new Date(`${editForm.analyzerExpiresAt}T00:00:00Z`).getTime())
                          : Date.now();
                        const next = new Date(base + 30 * 86400000).toISOString().slice(0, 10);
                        setEditForm({ ...editForm, hasAnalyzer: true, analyzerExpiresAt: next });
                      }}
                      className="text-[11px] font-semibold text-amber-700 hover:underline cursor-pointer"
                    >
                      +30 days
                    </button>
                  </div>
                  <input
                    type="date"
                    value={editForm.analyzerExpiresAt}
                    onChange={(e) => setEditForm({ ...editForm, analyzerExpiresAt: e.target.value })}
                    className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg font-mono focus:outline-none focus:border-slate-900"
                  />
                </div>
                <div>
                  <div className="flex items-center justify-between mb-1">
                    <label className="block text-xs font-semibold text-slate-700">
                      DRT Analyzer Expiry Date
                    </label>
                    <button
                      type="button"
                      onClick={() => {
                        const base = editForm.eaBotsExpiresAt
                          ? Math.max(Date.now(), new Date(`${editForm.eaBotsExpiresAt}T00:00:00Z`).getTime())
                          : Date.now();
                        const next = new Date(base + 30 * 86400000).toISOString().slice(0, 10);
                        setEditForm({ ...editForm, hasEaBots: true, eaBotsExpiresAt: next });
                      }}
                      className="text-[11px] font-semibold text-amber-700 hover:underline cursor-pointer"
                    >
                      +30 days
                    </button>
                  </div>
                  <input
                    type="date"
                    value={editForm.eaBotsExpiresAt}
                    onChange={(e) => setEditForm({ ...editForm, eaBotsExpiresAt: e.target.value })}
                    className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg font-mono focus:outline-none focus:border-slate-900"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 pt-2 border-t border-slate-200 text-xs">
                <label className="flex items-center gap-2 font-semibold text-slate-800 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={editForm.exnessVerified}
                    onChange={(e) => setEditForm({ ...editForm, exnessVerified: e.target.checked })}
                    className="rounded border-slate-300"
                  />
                  <span>Exness IB Verified</span>
                </label>
                <label className="flex items-center gap-2 font-semibold text-slate-800 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={editForm.hasAnalyzer}
                    onChange={(e) => setEditForm({ ...editForm, hasAnalyzer: e.target.checked })}
                    className="rounded border-slate-300"
                  />
                  <span>ICT Analyzer</span>
                </label>
                <label className="flex items-center gap-2 font-semibold text-slate-800 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={editForm.hasEaBots}
                    onChange={(e) => setEditForm({ ...editForm, hasEaBots: e.target.checked })}
                    className="rounded border-slate-300"
                  />
                  <span>DRT Analyzer</span>
                </label>
                <label className="flex items-center gap-2 font-semibold text-rose-700 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={editForm.isSuspended}
                    onChange={(e) => setEditForm({ ...editForm, isSuspended: e.target.checked })}
                    className="rounded border-slate-300"
                  />
                  <span>Suspended</span>
                </label>
              </div>

              {editUserError && (
                <div className="p-3 bg-rose-50 border border-rose-200 text-rose-700 text-xs rounded-lg flex items-start gap-2">
                  <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                  <span>{editUserError}</span>
                </div>
              )}

              <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-200">
                <button
                  type="button"
                  onClick={() => setEditingUser(null)}
                  className="px-4 py-2 border border-slate-300 bg-white hover:bg-slate-50 text-slate-700 text-xs font-semibold rounded-lg cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={savingUser}
                  className="px-5 py-2 bg-[#0B0F19] hover:bg-slate-800 text-[#E5A93C] text-xs font-bold rounded-lg inline-flex items-center gap-2 cursor-pointer disabled:opacity-60"
                >
                  {savingUser && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                  <span>{savingUser ? 'Saving & Syncing...' : 'Save Account Changes'}</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
