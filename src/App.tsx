import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AnimatePresence, MotionConfig, motion } from 'motion/react';
import {
  Activity,
  BarChart3,
  Bell,
  BookOpen,
  Calculator,
  Calendar,
  CandlestickChart,
  CheckSquare,
  CreditCard,
  Crown,
  Layers,
  LayoutDashboard,
  LogOut,
  Mail,
  Menu,
  NotebookPen,
  Search,
  Send,
  Shield,
  TrendingUp,
  Trophy,
  Users,
  X,
  ArrowUpRight,
  UserCircle,
  Check,
  Wallet,
} from 'lucide-react';
import {
  apiFetch,
  clearSessionToken,
  setSessionToken,
  INITIAL_MARKET_QUOTES,
  type MarketMiniBar,
  type MarketSymbolQuote,
  type TradingViewMarketStatus,
} from './lib/api';
import { getSupabaseClient } from './lib/supabase';
import {
  ASSET_CLASS_LABELS,
  ASSET_CLASS_ORDER,
  ASSET_CLASS_SHORT_LABELS,
  MARKET_CATALOG_GROUPS,
  type AnalyzerTimeframe,
  type AssetClass,
} from './lib/tradingTimeframes';
import type { JournalTrade, Order, PublicConfig, User } from './types';
import { LandingPage } from './components/LandingPage';
import { AuthView, type PendingOAuthUser } from './components/AuthView';
import { CheckoutModal } from './components/CheckoutModal';
import { IctAnalyzerView } from './components/IctAnalyzerView';
import { DrtAnalyzerView } from './components/DrtAnalyzerView';
import { EducationView } from './components/EducationView';
import {
  AnalyticsView,
  CalculatorsView,
  CalendarAndNewsView,
  JournalView,
  PaperTradingView,
  TradingPlanView,
  TradingViewChartsView,
} from './components/FreeToolsViews';
import {
  EmailsInboxView,
  OrdersDashboardView,
  ReferralsHubView,
} from './components/OrdersAndReferralsViews';
import { AdminDashboardView } from './components/AdminDashboardView';
import { AccountProfileView } from './components/AccountProfileView';
import { BrandLogo } from './components/BrandLogo';
import { LANDING_IMAGES } from './assets/landingImages';

type WorkspaceTab =
  | 'overview'
  | 'analyzer'
  | 'drt'
  | 'orders'
  | 'charts'
  | 'journal'
  | 'analytics'
  | 'calculators'
  | 'paper'
  | 'plan'
  | 'calendar'
  | 'education'
  | 'account'
  | 'referrals'
  | 'emails'
  | 'admin';

const DEFAULT_CONFIG: PublicConfig = {
  exnessIbUrl: 'https://one.exnessonelink.com/a/0p67hxlswg?source=app',
  telegramUrl: 'https://t.me/JakoyoFx',
  ictYoutubeChannelId: 'UCtjxa77NqamhVC8atV85Rog',
  drtYoutubeChannelUrl: 'https://youtube.com/@ali_khan_ict?si=mqOSzAkgagFGdb80',
  analyzerPriceUsd: 5.25,
  drtAnalyzerPriceUsd: 5.25,
  eaBotsPriceUsd: 5.25,
  usdKesRate: 130,
  analyzerPriceKes: 683,
  drtAnalyzerPriceKes: 683,
  eaBotsPriceKes: 683,
  mpesaTillNumber: '1921416',
  mpesaPartyB: '1921416',
  mpesaTransactionType: 'CustomerBuyGoodsOnline',
  mpesaMerchantName: 'AURVIK ENTERPRISES',
  commissionPct: 35,
  cryptoAddresses: {
    USDT_TRC20: 'TDqm7SGqyDT5p9YrrHYmzwh9zPDo1y4AQJ',
    USDT_ERC20: '0x7ac8dd858f3154d83114d7134a85924fdbb22234',
    BTC: '13JdKdY8s8iVf5PAwy7popMHCqKvZsSrjD',
  },
};

export default function App() {
  const [config, setConfig] = useState<PublicConfig>(DEFAULT_CONFIG);
  const [user, setUser] = useState<User | null>(null);
  const [booting, setBooting] = useState(true);
  const [screen, setScreen] = useState<'landing' | 'auth' | 'workspace'>('landing');
  const [authMode, setAuthMode] = useState<'login' | 'register'>('register');
  const [activeTab, setActiveTab] = useState<WorkspaceTab>('overview');
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  const [quotes, setQuotes] = useState<MarketSymbolQuote[]>(INITIAL_MARKET_QUOTES);
  const [marketStatus, setMarketStatus] = useState<TradingViewMarketStatus | null>(null);
  const [orders, setOrders] = useState<Order[]>([]);
  const [journal, setJournal] = useState<JournalTrade[]>([]);
  const [watchlist, setWatchlist] = useState<string[]>(['EURUSD', 'GBPUSD', 'XAUUSD', 'NAS100', 'BTCUSD']);
  const [chartSymbol, setChartSymbol] = useState('EURUSD');
  const [chartTimeframe, setChartTimeframe] = useState<AnalyzerTimeframe>('1M');
  const [drtSymbol, setDrtSymbol] = useState('EURUSD');
  const [drtTimeframe, setDrtTimeframe] = useState<AnalyzerTimeframe>('15M');
  const [assetSearch, setAssetSearch] = useState('');
  const [searchFocused, setSearchFocused] = useState(false);

  const [checkoutState, setCheckoutState] = useState<{
    productKey: 'analyzer' | 'drt_analyzer' | 'ea_bots';
    existingOrder?: Order | null;
    billingCycle?: 'monthly' | 'quarterly' | 'annual';
  } | null>(null);
  const [capturedRefCode, setCapturedRefCode] = useState('');
  const [pendingGoogleOAuth, setPendingGoogleOAuth] = useState<PendingOAuthUser | null>(null);

  const loadConfig = useCallback(async () => {
    try {
      const cfg = await apiFetch<PublicConfig>('/api/config/public');
      setConfig(cfg);
    } catch {
      // keep default
    }
  }, []);

  const loadUserWorkspaceData = useCallback(async () => {
    try {
      const [ordersRes, journalRes, wlRes] = await Promise.all([
        apiFetch<{ orders: Order[] }>('/api/orders/my'),
        apiFetch<{ trades: JournalTrade[] }>('/api/workspace/journal'),
        apiFetch<{ symbols: string[] }>('/api/workspace/watchlist'),
      ]);
      setOrders(ordersRes.orders || []);
      setJournal(journalRes.trades || []);
      if (wlRes.symbols?.length) setWatchlist(wlRes.symbols);
    } catch {
      // ignore if logged out
    }
  }, []);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const ref = params.get('ref');
    if (ref) {
      const cleanRef = ref.trim().toUpperCase();
      setCapturedRefCode(cleanRef);
      apiFetch('/api/referrals/track', {
        method: 'POST',
        body: JSON.stringify({ code: cleanRef, sourcePage: window.location.pathname }),
      }).catch(() => {});
    }

    Promise.all([
      apiFetch<PublicConfig>('/api/config/public').catch(() => DEFAULT_CONFIG),
      apiFetch<{ user: User | null }>('/api/auth/me').catch(() => ({ user: null })),
    ])
      .then(async ([cfg, meRes]) => {
        setConfig(cfg);
        if (meRes.user) {
          setUser(meRes.user);
          setScreen('workspace');
          loadUserWorkspaceData();
          return;
        }
        const sb = getSupabaseClient(cfg.supabaseUrl, cfg.supabaseAnonKey);
        if (sb) {
          const hasAuthCode = params.has('code') || window.location.hash.includes('access_token=');
          if (params.has('code')) {
            await sb.auth.exchangeCodeForSession(params.get('code')!).catch(() => {});
          }
          const { data } = await sb.auth.getSession();
          const token = data.session?.access_token;
          if (token) {
            const res = await fetch('/api/auth/supabase-session', {
              method: 'POST',
              credentials: 'include',
              headers: {
                'Content-Type': 'application/json',
                Authorization: `Bearer ${token}`,
              },
              body: JSON.stringify({ referralCode: ref ? ref.trim().toUpperCase() : '' }),
            });
            const sbSessionData = await res.json().catch(() => ({}));
            if (hasAuthCode) {
              window.history.replaceState({}, document.title, window.location.pathname);
            }
            if (res.ok && sbSessionData.user) {
              if (sbSessionData.sessionToken) setSessionToken(sbSessionData.sessionToken);
              setUser(sbSessionData.user);
              setScreen('workspace');
              loadUserWorkspaceData();
              return;
            }
            if (res.status === 409 && sbSessionData.needsExnessOnboarding && data.session?.user) {
              setPendingGoogleOAuth({
                provider: 'supabase',
                uid: data.session.user.id,
                email: sbSessionData.email || data.session.user.email || '',
                name: sbSessionData.name || 'Trader',
                accessToken: token,
              });
              setAuthMode('register');
              setScreen('auth');
              return;
            }
          }
        }
      })
      .finally(() => setBooting(false));
  }, [loadUserWorkspaceData]);

  // Live TradingView market quote & session status polling
  useEffect(() => {
    let active = true;
    const syncQuotes = async () => {
      try {
        const res = await apiFetch<{
          quotes: MarketSymbolQuote[];
          marketStatus?: TradingViewMarketStatus;
        }>('/api/market/quotes');
        if (active && Array.isArray(res.quotes) && res.quotes.length > 0) {
          setQuotes(res.quotes);
          if (res.marketStatus) {
            setMarketStatus(res.marketStatus);
          }
        }
      } catch {
        // retain last verified TradingView quotes if temporarily offline
      }
    };
    void syncQuotes();
    const id = setInterval(() => {
      void syncQuotes();
    }, 12000);
    return () => {
      active = false;
      clearInterval(id);
    };
  }, []);

  async function handleLogout() {
    clearSessionToken();
    await apiFetch('/api/auth/logout', { method: 'POST' }).catch(() => {});
    const sb = getSupabaseClient(config.supabaseUrl, config.supabaseAnonKey);
    if (sb) {
      await sb.auth.signOut().catch(() => {});
    }
    setUser(null);
    setOrders([]);
    setJournal([]);
    setScreen('landing');
  }

  function handleAuthSuccess(loggedInUser: User) {
    setUser(loggedInUser);
    setScreen('workspace');
    setActiveTab('overview');
    loadUserWorkspaceData();
  }

  async function handleUpdateWatchlist(symbols: string[]) {
    setWatchlist(symbols);
    await apiFetch('/api/workspace/watchlist', {
      method: 'POST',
      body: JSON.stringify({ symbols }),
    });
  }

  const filteredSearchQuotes = useMemo(() => {
    const q = assetSearch.trim().toLowerCase();
    if (!q) return quotes.slice(0, 8);
    return quotes
      .filter((item) => {
        const catLabel = ASSET_CLASS_LABELS[item.assetClass]?.toLowerCase() || '';
        const catShort = ASSET_CLASS_SHORT_LABELS[item.assetClass]?.toLowerCase() || '';
        return (
          item.sym.toLowerCase().includes(q) ||
          item.name.toLowerCase().includes(q) ||
          catLabel.includes(q) ||
          catShort.includes(q)
        );
      })
      .slice(0, 10);
  }, [assetSearch, quotes]);

  if (booting) {
    return (
      <div className="min-h-screen bg-[#FAF9F6] flex items-center justify-center text-sm font-mono text-slate-700">
        Initializing Grid Pips...
      </div>
    );
  }

  if (screen === 'landing') {
    return (
      <LandingPage
        config={config}
        user={user}
        quotes={quotes}
        marketStatus={marketStatus}
        onGoAuth={(mode) => {
          setAuthMode(mode);
          setScreen('auth');
        }}
        onGoWorkspace={() => setScreen('workspace')}
        onSelectProduct={(product, selectedSym, selectedTf) => {
          if (product === 'drt_analyzer') {
            if (selectedSym) setDrtSymbol(selectedSym);
            if (selectedTf) setDrtTimeframe(selectedTf);
          } else {
            if (selectedSym) setChartSymbol(selectedSym);
            if (selectedTf) setChartTimeframe(selectedTf);
          }
          if (!user) {
            setAuthMode('register');
            setScreen('auth');
            return;
          }
          setScreen('workspace');
          const isDrt = product === 'drt_analyzer';
          setActiveTab(isDrt ? 'drt' : 'analyzer');
          const hasDrt = Boolean(user.hasDrtAnalyzer ?? user.hasEaBots);
          if ((product === 'analyzer' && !user.hasAnalyzer) || (isDrt && !hasDrt)) {
            setCheckoutState({ productKey: product, billingCycle: 'monthly' });
          }
        }}
      />
    );
  }

  if (screen === 'auth' || !user) {
    return (
      <AuthView
        initialMode={authMode}
        config={config}
        initialReferralCode={capturedRefCode}
        initialPendingOAuth={pendingGoogleOAuth}
        onSuccess={(loggedInUser) => {
          setPendingGoogleOAuth(null);
          handleAuthSuccess(loggedInUser);
        }}
        onBackLanding={() => {
          setPendingGoogleOAuth(null);
          setScreen('landing');
        }}
      />
    );
  }

  const hasDrt = Boolean(user.hasDrtAnalyzer ?? user.hasEaBots);
  const bothProActive = Boolean(user.hasAnalyzer && hasDrt);
  const drtPriceUsd = config.drtAnalyzerPriceUsd ?? config.eaBotsPriceUsd;

  const navGroups: Array<{
    label: string;
    items: Array<{ id: WorkspaceTab; name: string; icon: React.ReactNode; tag?: string }>;
  }> = [
    {
      label: 'Trading desk',
      items: [
        { id: 'overview', name: 'Dashboard', icon: <LayoutDashboard className="w-4 h-4" /> },
        {
          id: 'analyzer',
          name: 'ICT Analyzer',
          icon: <Activity className="w-4 h-4" />,
          tag: user.hasAnalyzer
            ? 'Active'
            : user.analyzerSubscriptionStatus === 'expired'
            ? 'Expired'
            : `$${config.analyzerPriceUsd.toFixed(2)}/mo`,
        },
        {
          id: 'drt',
          name: 'DRT Analyzer',
          icon: <Layers className="w-4 h-4" />,
          tag: hasDrt
            ? 'Active'
            : (user.drtAnalyzerSubscriptionStatus ?? user.eaBotsSubscriptionStatus) === 'expired'
            ? 'Expired'
            : `$${drtPriceUsd.toFixed(2)}/mo`,
        },
        { id: 'orders', name: 'Subscriptions & Billing', icon: <CreditCard className="w-4 h-4" /> },
      ],
    },
    {
      label: 'Trading tools',
      items: [
        { id: 'charts', name: 'Live Charts', icon: <CandlestickChart className="w-4 h-4" /> },
        { id: 'journal', name: 'Trading Journal', icon: <NotebookPen className="w-4 h-4" /> },
        { id: 'analytics', name: 'Analytics', icon: <BarChart3 className="w-4 h-4" /> },
        { id: 'calculators', name: 'Risk Calculators', icon: <Calculator className="w-4 h-4" /> },
        { id: 'paper', name: 'Paper Trading', icon: <Activity className="w-4 h-4" /> },
        { id: 'plan', name: 'Trading Plan', icon: <CheckSquare className="w-4 h-4" /> },
        { id: 'calendar', name: 'Calendar', icon: <Calendar className="w-4 h-4" /> },
        { id: 'education', name: 'ICT & DRT Academy', icon: <BookOpen className="w-4 h-4" /> },
      ],
    },
    {
      label: 'Account & partner',
      items: [
        { id: 'account', name: 'My Information', icon: <UserCircle className="w-4 h-4" /> },
        { id: 'referrals', name: 'Influencer Referrals', icon: <Users className="w-4 h-4" /> },
        { id: 'emails', name: 'Email Inbox', icon: <Mail className="w-4 h-4" /> },
        ...(user.role === 'admin'
          ? [{ id: 'admin' as WorkspaceTab, name: 'Admin Console', icon: <Shield className="w-4 h-4" /> }]
          : []),
      ],
    },
  ];

  const firstName = (user.name || user.email || 'Trader').trim().split(/\s+/)[0];
  const userInitials = (user.name || user.email || 'GP')
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase() || '')
    .join('');

  const marketStatusTooltip = marketStatus
    ? `TradingView Live: ${quotes
        .map((q) => `${q.sym} ${q.marketStatusLabel || (q.isMarketOpen ? 'Open' : 'Closed')}`)
        .join(' · ')}`
    : 'Checking live TradingView market sessions...';

  const marketStatusStyle = !marketStatus
    ? 'bg-slate-50 border-slate-200 text-slate-500'
    : marketStatus.traditionalOpen
    ? 'bg-emerald-50 border-emerald-200 text-emerald-800'
    : marketStatus.cryptoOpen
    ? 'bg-amber-50 border-amber-200 text-amber-800'
    : 'bg-rose-50 border-rose-200 text-rose-700';

  const pendingOrdersCount = orders.filter(
    (o) => o.payment_status === 'pending' || o.payment_status === 'processing'
  ).length;

  return (
    <div className="min-h-screen bg-[#FAF9F6] text-slate-900 flex">
      {/* Desktop Crisp White & Gold Sidebar */}
      <aside className="hidden lg:flex lg:w-64 lg:flex-col bg-white border-r border-slate-200 sticky top-0 h-screen shrink-0">
        <div className="h-16 px-4 border-b border-slate-200 flex items-center justify-between gap-2">
          <button
            type="button"
            onClick={() => setScreen('landing')}
            className="cursor-pointer shrink-0"
          >
            <BrandLogo variant="dark" size="sm" />
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('account')}
            title="View my account information"
            className="text-[11px] font-mono text-slate-500 hover:text-[#B45309] truncate cursor-pointer"
          >
            {user.exnessAccountId}
          </button>
        </div>

        <nav className="flex-1 overflow-y-auto p-3 space-y-5">
          {navGroups.map((group) => (
            <div key={group.label}>
              <div className="px-3 text-[11px] font-medium text-slate-400 mb-1.5">{group.label}</div>
              <div className="space-y-1">
                {group.items.map((item) => {
                  const isActive = activeTab === item.id;
                  return (
                    <button
                      type="button"
                      key={item.id}
                      onClick={() => setActiveTab(item.id)}
                      className={`w-full flex items-center justify-between px-3 py-2 rounded-xl text-xs transition-colors cursor-pointer ${
                        isActive
                          ? 'bg-amber-50/90 border border-amber-300/80 text-slate-950 font-semibold shadow-2xs'
                          : 'border border-transparent text-slate-700 font-medium hover:text-slate-950 hover:bg-slate-50'
                      }`}
                    >
                      <span className="flex items-center gap-2.5 min-w-0">
                        <span className={isActive ? 'text-amber-600' : 'text-slate-400'}>
                          {item.icon}
                        </span>
                        <span className="truncate">{item.name}</span>
                      </span>
                      {item.tag && (
                        <span
                          className={`font-mono text-[10px] shrink-0 ${
                            item.tag === 'Active'
                              ? 'px-1.5 py-0.5 rounded bg-amber-100/80 text-amber-800 font-semibold'
                              : isActive
                              ? 'text-slate-900 font-semibold'
                              : 'text-slate-500'
                          }`}
                        >
                          {item.tag}
                        </span>
                      )}
                    </button>
                  );
                })}
              </div>
            </div>
          ))}
        </nav>

        {/* Bottom Obsidian & Gold "Go Pro" Card */}
        <div className="p-3.5 border-t border-slate-200 space-y-2.5">
          <div className="rounded-xl p-3.5 bg-[#0B0F19] border border-slate-900 space-y-2.5">
            <div className="flex items-center gap-2.5">
              <span className="w-8 h-8 rounded-lg bg-[#E5A93C]/15 border border-[#E5A93C]/40 flex items-center justify-center shrink-0">
                <Crown className="w-4 h-4 text-[#E5A93C]" />
              </span>
              <div className="min-w-0">
                <div className="text-xs font-bold text-white leading-tight">
                  {bothProActive ? 'Pro VIP Active' : 'Go Pro'}
                </div>
                <div className="text-[11px] text-amber-200/80 truncate">
                  {bothProActive ? 'ICT & DRT Unlocked' : 'Unlock ICT & DRT'}
                </div>
              </div>
            </div>
            <button
              type="button"
              onClick={() => {
                if (!user.hasAnalyzer) {
                  setCheckoutState({ productKey: 'analyzer', billingCycle: 'monthly' });
                } else if (!hasDrt) {
                  setCheckoutState({ productKey: 'drt_analyzer', billingCycle: 'monthly' });
                } else {
                  setActiveTab('orders');
                }
              }}
              className="w-full py-2 px-3 rounded-lg bg-[#E5A93C] hover:bg-[#d6982b] text-[#090806] text-xs font-bold transition-colors cursor-pointer"
            >
              {bothProActive ? 'Manage Plans →' : 'Upgrade Now →'}
            </button>
          </div>

          <button
            type="button"
            onClick={handleLogout}
            className="w-full py-1.5 px-3 text-xs font-medium text-slate-500 hover:text-rose-600 flex items-center gap-2 cursor-pointer transition-colors"
          >
            <LogOut className="w-3.5 h-3.5" />
            Sign out ({firstName})
          </button>
        </div>
      </aside>

      {/* Mobile Drawer */}
      {mobileMenuOpen && (
        <div className="fixed inset-0 z-50 lg:hidden flex">
          <div
            className="fixed inset-0 bg-slate-950/50 backdrop-blur-xs"
            onClick={() => setMobileMenuOpen(false)}
          />
          <div className="relative w-72 bg-white border-r border-slate-200 h-full overflow-y-auto p-4 z-10 flex flex-col justify-between shadow-xl">
            <div>
              <div className="flex items-center justify-between pb-4 mb-4 border-b border-slate-200">
                <BrandLogo variant="dark" size="sm" />
                <button
                  type="button"
                  onClick={() => setMobileMenuOpen(false)}
                  className="p-1.5 text-slate-500 hover:text-slate-950"
                  aria-label="Close menu"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
              <div className="space-y-4">
                {navGroups.map((group) => (
                  <div key={group.label}>
                    <div className="px-2 text-[11px] font-medium text-slate-400 mb-1">
                      {group.label}
                    </div>
                    {group.items.map((item) => {
                      const isActive = activeTab === item.id;
                      return (
                        <button
                          type="button"
                          key={item.id}
                          onClick={() => {
                            setActiveTab(item.id);
                            setMobileMenuOpen(false);
                          }}
                          className={`w-full flex items-center justify-between px-3 py-2.5 rounded-xl text-xs ${
                            isActive
                              ? 'bg-amber-50 border border-amber-300/80 text-slate-950 font-semibold'
                              : 'text-slate-700 font-medium hover:bg-slate-50 hover:text-slate-950'
                          }`}
                        >
                          <span className="flex items-center gap-2.5">
                            <span className={isActive ? 'text-amber-600' : 'text-slate-400'}>
                              {item.icon}
                            </span>
                            <span>{item.name}</span>
                          </span>
                          {item.tag && (
                            <span className={`font-mono text-[10px] ${item.tag === 'Active' ? 'text-amber-700 font-semibold' : 'text-slate-500'}`}>
                              {item.tag}
                            </span>
                          )}
                        </button>
                      );
                    })}
                  </div>
                ))}
              </div>
            </div>
            <button
              type="button"
              onClick={handleLogout}
              className="mt-6 w-full py-2.5 border border-rose-200 bg-rose-50 rounded-xl text-xs font-semibold text-rose-700"
            >
              Sign out
            </button>
          </div>
        </div>
      )}

      {/* Main Content Area */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Top White Context Header */}
        <header className="sticky top-0 z-30 h-16 bg-white/95 backdrop-blur-md border-b border-slate-200 px-4 sm:px-6 flex items-center justify-between gap-3 sm:gap-4">
          <div className="flex items-center gap-3 flex-1 min-w-0 max-w-md">
            <button
              type="button"
              onClick={() => setMobileMenuOpen(true)}
              className="lg:hidden p-2 -ml-2 text-slate-600 hover:text-slate-950"
              aria-label="Open navigation"
            >
              <Menu className="w-5 h-5" />
            </button>

            {/* Functional Asset & Market Search */}
            <div className="relative flex-1 min-w-0">
              <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
              <input
                type="text"
                value={assetSearch}
                onFocus={() => setSearchFocused(true)}
                onBlur={() => window.setTimeout(() => setSearchFocused(false), 180)}
                onChange={(e) => setAssetSearch(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && filteredSearchQuotes.length > 0) {
                    const top = filteredSearchQuotes[0];
                    setChartSymbol(top.sym);
                    setActiveTab('charts');
                    setAssetSearch('');
                    setSearchFocused(false);
                  }
                }}
                placeholder="Search 70+ markets (EURUSD, XAUUSD, USOIL, SPY, NVDA, BTCUSD)..."
                aria-label="Search assets and markets"
                className="w-full pl-9 pr-3 py-2 text-xs bg-slate-50 border border-slate-200 focus:border-amber-500 text-slate-900 placeholder:text-slate-400 rounded-xl focus:outline-none transition-colors"
              />
              {searchFocused && filteredSearchQuotes.length > 0 && (
                <div className="absolute left-0 right-0 top-full mt-1.5 bg-white border border-slate-200 rounded-xl shadow-lg overflow-hidden max-h-80 overflow-y-auto z-40">
                  {filteredSearchQuotes.map((item) => {
                    const up = item.chgPct >= 0;
                    return (
                      <button
                        type="button"
                        key={item.sym}
                        onMouseDown={() => {
                          setChartSymbol(item.sym);
                          setActiveTab('charts');
                          setAssetSearch('');
                          setSearchFocused(false);
                        }}
                        className="w-full px-3.5 py-2.5 flex items-center justify-between text-xs hover:bg-amber-50/70 cursor-pointer border-b last:border-b-0 border-slate-100"
                      >
                        <span className="flex items-center gap-2 min-w-0">
                          <span className="font-mono font-bold text-slate-950">{item.sym}</span>
                          <span className="text-[10px] font-mono text-amber-700 uppercase shrink-0">
                            {ASSET_CLASS_SHORT_LABELS[item.assetClass] || item.assetClass}
                          </span>
                          <span className="text-slate-500 truncate">{item.name}</span>
                        </span>
                        <span className="font-mono tabular-nums flex items-center gap-2 shrink-0">
                          <span className="text-slate-800">{item.price.toFixed(item.digits)}</span>
                          <span className={up ? 'text-emerald-600' : 'text-rose-600'}>
                            {up ? '+' : ''}
                            {item.chgPct.toFixed(2)}%
                          </span>
                        </span>
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          </div>

          <div className="flex items-center gap-2.5 shrink-0">
            <button
              type="button"
              onClick={() => setActiveTab('charts')}
              title={marketStatusTooltip}
              className={`hidden md:inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl border text-xs font-medium whitespace-nowrap cursor-pointer transition-colors ${marketStatusStyle}`}
            >
              <span>{marketStatus ? marketStatus.summaryLabel : 'Checking TradingView…'}</span>
            </button>

            <button
              type="button"
              onClick={() => setActiveTab('emails')}
              title="Notifications & Email Inbox"
              className="relative p-2 rounded-xl bg-slate-50 border border-slate-200 hover:border-amber-400 text-slate-600 hover:text-slate-950 cursor-pointer transition-colors"
              aria-label="Open notifications inbox"
            >
              <Bell className="w-4 h-4" />
              {pendingOrdersCount > 0 && (
                <span className="absolute -top-1 -right-1 w-4 h-4 rounded-full bg-rose-500 text-white font-mono text-[10px] font-bold flex items-center justify-center">
                  {pendingOrdersCount}
                </span>
              )}
            </button>

            <button
              type="button"
              onClick={() => setActiveTab('account')}
              title="My Information"
              className={`inline-flex items-center gap-2 px-3 py-1.5 rounded-xl border text-xs font-semibold transition-colors cursor-pointer whitespace-nowrap ${
                activeTab === 'account'
                  ? 'bg-amber-50 border-amber-400 text-slate-950'
                  : 'bg-slate-50 border-slate-200 hover:border-amber-400 text-slate-900'
              }`}
            >
              <span className="w-6 h-6 rounded-md bg-[#E5A93C] text-[#090806] font-bold text-[10px] flex items-center justify-center">
                {userInitials || 'GP'}
              </span>
              <span className="hidden sm:inline max-w-[120px] truncate">{user.name || firstName}</span>
            </button>
          </div>
        </header>

        <main className="p-4 sm:p-6 max-w-7xl w-full mx-auto flex-1">
          <MotionConfig reducedMotion="user">
            <AnimatePresence mode="wait">
              <motion.div
                key={activeTab}
                initial={{ opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -4 }}
                transition={{ duration: 0.18, ease: [0.22, 1, 0.36, 1] }}
              >
                {activeTab === 'overview' && (
                  <WorkspaceOverview
                    user={user}
                    config={config}
                    quotes={quotes}
                    marketStatus={marketStatus}
                    journal={journal}
                    orders={orders}
                    onNavigate={setActiveTab}
                    onUnlock={(productKey) => setCheckoutState({ productKey, billingCycle: 'monthly' })}
                    onOpenSymbolChart={(sym) => {
                      setChartSymbol(sym);
                      setActiveTab('charts');
                    }}
                  />
                )}
                {activeTab === 'analyzer' && (
                  <IctAnalyzerView
                    user={user}
                    config={config}
                    symbol={chartSymbol}
                    timeframe={chartTimeframe}
                    onSymbolChange={setChartSymbol}
                    onTimeframeChange={setChartTimeframe}
                    onOpenFreeChart={() => setActiveTab('charts')}
                    onUnlockClick={(cycle) =>
                      setCheckoutState({ productKey: 'analyzer', billingCycle: cycle || 'monthly' })
                    }
                  />
                )}
                {activeTab === 'drt' && (
                  <DrtAnalyzerView
                    user={user}
                    config={config}
                    symbol={drtSymbol}
                    timeframe={drtTimeframe}
                    onSymbolChange={setDrtSymbol}
                    onTimeframeChange={setDrtTimeframe}
                    onOpenFreeChart={() => {
                      setChartSymbol(drtSymbol);
                      setChartTimeframe(drtTimeframe);
                      setActiveTab('charts');
                    }}
                    onUnlockClick={(cycle) =>
                      setCheckoutState({ productKey: 'drt_analyzer', billingCycle: cycle || 'monthly' })
                    }
                  />
                )}
                {activeTab === 'orders' && (
                  <OrdersDashboardView
                    orders={orders}
                    user={user}
                    config={config}
                    onUserUpdated={(updated) => setUser(updated)}
                    onResumePayment={(ord) =>
                      setCheckoutState({
                        productKey: ord.product_key,
                        existingOrder: ord,
                        billingCycle: ord.billing_cycle || 'monthly',
                      })
                    }
                    onBuyNew={(productKey, cycle) =>
                      setCheckoutState({ productKey, billingCycle: cycle || 'monthly' })
                    }
                    onRefresh={loadUserWorkspaceData}
                    onLaunchProduct={(productKey) =>
                      setActiveTab(productKey === 'drt_analyzer' ? 'drt' : 'analyzer')
                    }
                  />
                )}
                {activeTab === 'charts' && (
                  <TradingViewChartsView
                    watchlist={watchlist}
                    symbol={chartSymbol}
                    timeframe={chartTimeframe}
                    onSymbolChange={setChartSymbol}
                    onTimeframeChange={setChartTimeframe}
                    onUpdateWatchlist={handleUpdateWatchlist}
                    onAnalyzeInIct={() => setActiveTab('analyzer')}
                  />
                )}
                {activeTab === 'journal' && (
                  <JournalView trades={journal} onRefresh={loadUserWorkspaceData} />
                )}
                {activeTab === 'analytics' && <AnalyticsView trades={journal} />}
                {activeTab === 'calculators' && <CalculatorsView />}
                {activeTab === 'paper' && <PaperTradingView quotes={quotes} />}
                {activeTab === 'plan' && <TradingPlanView />}
                {activeTab === 'calendar' && <CalendarAndNewsView />}
                {activeTab === 'education' && <EducationView config={config} />}
                {activeTab === 'account' && (
                  <AccountProfileView
                    user={user}
                    config={config}
                    orders={orders}
                    journal={journal}
                    watchlist={watchlist}
                    onUserUpdated={(updated) => setUser(updated)}
                    onNavigate={(tab) => setActiveTab(tab)}
                    onUnlock={(productKey) => setCheckoutState({ productKey, billingCycle: 'monthly' })}
                  />
                )}
                {activeTab === 'referrals' && <ReferralsHubView config={config} />}
                {activeTab === 'emails' && <EmailsInboxView />}
                {activeTab === 'admin' && user.role === 'admin' && (
                  <AdminDashboardView onConfigSaved={loadConfig} />
                )}
              </motion.div>
            </AnimatePresence>
          </MotionConfig>
        </main>
      </div>

      {checkoutState && (
        <CheckoutModal
          productKey={checkoutState.productKey}
          config={config}
          user={user}
          existingOrder={checkoutState.existingOrder}
          initialBillingCycle={checkoutState.billingCycle}
          onClose={() => {
            setCheckoutState(null);
            void loadUserWorkspaceData();
          }}
          onOrderSubmitted={() => {
            void loadUserWorkspaceData();
          }}
          onUnlocked={(updatedUser) => {
            setUser(updatedUser);
            setCheckoutState(null);
            void loadUserWorkspaceData();
            setActiveTab(
              checkoutState.productKey === 'drt_analyzer' || checkoutState.productKey === 'ea_bots'
                ? 'drt'
                : 'analyzer'
            );
          }}
        />
      )}
    </div>
  );
}

function getSparklinePoints(chgPct: number, seed: number): string {
  const up = chgPct >= 0;
  const pts: string[] = [];
  const steps = 8;
  for (let i = 0; i < steps; i++) {
    const x = Math.round((i / (steps - 1)) * 74);
    const wave = Math.sin((i + 1) * (seed + 1.3)) * 2.5;
    const baseY = up ? 16 - (i / (steps - 1)) * 11 : 5 + (i / (steps - 1)) * 11;
    const y = Math.max(2, Math.min(18, Number((baseY + wave).toFixed(1))));
    pts.push(`${x},${y}`);
  }
  return pts.join(' ');
}

function getKillzoneTimelineState(now: Date) {
  const hourStr = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/New_York',
    hour: '2-digit',
    hour12: false,
  }).format(now);
  const minuteStr = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/New_York',
    minute: '2-digit',
  }).format(now);
  const nyTimeFormatted = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/New_York',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  }).format(now);

  const nyHour = Number(hourStr) % 24;
  const nyDec = nyHour + Number(minuteStr) / 60;

  let activeKey: 'asian' | 'london' | 'nyam' | 'close' = 'asian';
  let detail = 'Asian range accumulation · 20:00 – 00:00';

  if (nyDec >= 2 && nyDec < 5) {
    activeKey = 'london';
    detail = 'London Open killzone · 02:00 – 05:00';
  } else if (nyDec >= 7 && nyDec < 11) {
    activeKey = 'nyam';
    detail = nyDec >= 10 ? 'ICT Silver Bullet window · 10:00 – 11:00' : 'New York AM killzone · 07:00 – 10:00';
  } else if (nyDec >= 13.5 && nyDec < 17) {
    activeKey = 'close';
    detail = 'New York PM & London Close · 13:30 – 16:00';
  } else if (nyDec >= 20 || nyDec < 2) {
    activeKey = 'asian';
    detail = 'Asian range accumulation · 20:00 – 00:00';
  } else if (nyDec >= 5 && nyDec < 7) {
    activeKey = 'london';
    detail = 'Pre-NY liquidity build · 05:00 – 07:00';
  } else {
    activeKey = 'nyam';
    detail = 'NY mid-session rebalance · 11:00 – 13:30';
  }

  return { activeKey, detail, nyTimeFormatted };
}

const WorkspaceOverview: React.FC<{
  user: User;
  config: PublicConfig;
  quotes: MarketSymbolQuote[];
  marketStatus: TradingViewMarketStatus | null;
  journal: JournalTrade[];
  orders: Order[];
  onNavigate: (tab: WorkspaceTab) => void;
  onUnlock: (productKey: 'analyzer' | 'drt_analyzer') => void;
  onOpenSymbolChart: (sym: string) => void;
}> = ({ user, config, quotes, marketStatus, journal, orders, onNavigate, onUnlock, onOpenSymbolChart }) => {
  const [nyClock, setNyClock] = useState(() => new Date());
  const prevQuotesRef = useRef<Record<string, number>>({});
  const [tickDirs, setTickDirs] = useState<Record<string, 'up' | 'down'>>({});
  const [tickSeq, setTickSeq] = useState(0);

  // Market Overview interactive chart & category filter state
  const [overviewSym, setOverviewSym] = useState<string>('XAUUSD');
  const [overviewTf, setOverviewTf] = useState<'1D' | '1W' | '1M' | '3M' | '1Y'>('1D');
  const [overviewBars, setOverviewBars] = useState<MarketMiniBar[]>([]);
  const [loadingBars, setLoadingBars] = useState(true);
  const [assetCategoryFilter, setAssetCategoryFilter] = useState<'all' | AssetClass>('all');
  const [tableSearch, setTableSearch] = useState('');

  useEffect(() => {
    const id = window.setInterval(() => setNyClock(new Date()), 1000);
    return () => window.clearInterval(id);
  }, []);

  useEffect(() => {
    let cancelled = false;
    setLoadingBars(true);
    apiFetch<{ bars: MarketMiniBar[] }>(
      `/api/market/mini-candles?symbol=${encodeURIComponent(overviewSym)}&tf=${encodeURIComponent(overviewTf)}`
    )
      .then((res) => {
        if (!cancelled && Array.isArray(res.bars)) {
          setOverviewBars(res.bars.slice(-28));
        }
      })
      .catch(() => {
        if (!cancelled) setOverviewBars([]);
      })
      .finally(() => {
        if (!cancelled) setLoadingBars(false);
      });
    return () => {
      cancelled = true;
    };
  }, [overviewSym, overviewTf]);

  useEffect(() => {
    const nextDirs: Record<string, 'up' | 'down'> = {};
    let changed = false;
    for (const q of quotes) {
      const prev = prevQuotesRef.current[q.sym];
      if (typeof prev === 'number' && prev !== q.price) {
        nextDirs[q.sym] = q.price > prev ? 'up' : 'down';
        changed = true;
      }
      prevQuotesRef.current[q.sym] = q.price;
    }
    if (changed) {
      setTickDirs(nextDirs);
      setTickSeq((s) => s + 1);
      const timer = window.setTimeout(() => setTickDirs({}), 750);
      return () => window.clearTimeout(timer);
    }
  }, [quotes]);

  const totalPnl = journal.reduce((acc, t) => acc + Number(t.pnl || 0), 0);
  const winningTrades = journal.filter((t) => Number(t.pnl || 0) > 0).length;
  const winRatePct = journal.length > 0 ? Math.round((winningTrades / journal.length) * 100) : 0;

  const firstName = (user.name || user.email || 'Trader').trim().split(/\s+/)[0];
  const userInitials = (user.name || user.email || 'GP')
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase() || '')
    .join('');

  const selectedQuote = quotes.find((q) => q.sym === overviewSym) || quotes[0];
  const killzone = getKillzoneTimelineState(nyClock);
  const hasDrt = Boolean(user.hasDrtAnalyzer ?? user.hasEaBots);
  const drtDaysRemaining = user.drtAnalyzerDaysRemaining ?? user.eaBotsDaysRemaining;
  const drtStatus = user.drtAnalyzerSubscriptionStatus ?? user.eaBotsSubscriptionStatus;
  const drtPriceUsd = config.drtAnalyzerPriceUsd ?? config.eaBotsPriceUsd;

  const topAssets = useMemo(() => {
    const order = ['BTCUSD', 'XAUUSD', 'EURUSD', 'NVDA', 'SPY', 'USOIL'];
    return order
      .map((s) => quotes.find((q) => q.sym === s))
      .filter((q): q is MarketSymbolQuote => Boolean(q));
  }, [quotes]);

  const filteredTableQuotes = useMemo(() => {
    const q = tableSearch.trim().toLowerCase();
    return quotes.filter((item) => {
      if (assetCategoryFilter !== 'all' && item.assetClass !== assetCategoryFilter) return false;
      if (!q) return true;
      return item.sym.toLowerCase().includes(q) || item.name.toLowerCase().includes(q);
    });
  }, [quotes, assetCategoryFilter, tableSearch]);

  const categoryCounts = useMemo(() => {
    const counts: Record<string, number> = { all: quotes.length };
    for (const c of ASSET_CLASS_ORDER) counts[c] = 0;
    for (const item of quotes) {
      counts[item.assetClass] = (counts[item.assetClass] || 0) + 1;
    }
    return counts;
  }, [quotes]);

  const chartGeometry = useMemo(() => {
    if (!overviewBars.length) return null;
    const highs = overviewBars.map((b) => b.high);
    const lows = overviewBars.map((b) => b.low);
    const maxHigh = Math.max(...highs);
    const minLow = Math.min(...lows);
    const span = Math.max(maxHigh - minLow, 1e-9);
    const padTop = 18;
    const padBottom = 26;
    const usableH = 190 - padTop - padBottom;
    const toY = (price: number) => padTop + ((maxHigh - price) / span) * usableH;

    const candles = overviewBars.map((b, idx) => {
      const x = 44 + (idx / Math.max(1, overviewBars.length - 1)) * 540;
      const yOpen = toY(b.open);
      const yClose = toY(b.close);
      const yHigh = toY(b.high);
      const yLow = toY(b.low);
      return { x, yOpen, yClose, yHigh, yLow, bull: b.close >= b.open };
    });

    const smoothPoints = candles.map((c) => `${c.x.toFixed(1)},${c.yClose.toFixed(1)}`).join(' ');
    const areaPoints = `${candles[0].x.toFixed(1)},170 ${smoothPoints} ${candles[candles.length - 1].x.toFixed(1)},170`;
    const gridLevels = [0, 0.33, 0.66, 1].map((ratio) => {
      const price = maxHigh - ratio * span;
      return { y: padTop + ratio * usableH, price };
    });
    return { candles, smoothPoints, areaPoints, gridLevels };
  }, [overviewBars]);

  return (
    <div className="space-y-5">
      {/* Welcome Banner — Crisp White & Institutional Gold */}
      <div
        className="relative overflow-hidden rounded-2xl border border-slate-200 bg-white p-5 sm:p-6 shadow-xs"
        style={{
          backgroundImage:
            'radial-gradient(circle at 90% 10%, rgba(229, 169, 60, 0.14), transparent 46%)',
        }}
      >
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-center">
          <div className="lg:col-span-7 space-y-4">
            <div className="flex items-center gap-3.5">
              <div className="w-12 h-12 rounded-xl bg-[#0B0F19] border border-[#E5A93C]/50 text-[#E5A93C] font-bold text-base flex items-center justify-center shrink-0">
                {userInitials || 'GP'}
              </div>
              <div className="min-w-0">
                <h1 className="text-2xl sm:text-3xl font-bold text-slate-950 tracking-tight leading-tight">
                  Welcome back, {firstName}!
                </h1>
                <p className="text-xs sm:text-sm text-slate-500 mt-0.5">
                  Here&apos;s what&apos;s happening with your ICT &amp; DRT trading desk today.
                </p>
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 text-xs text-slate-600">
              <button
                type="button"
                onClick={() => onNavigate('account')}
                className="hover:text-slate-950 transition-colors cursor-pointer"
              >
                Exness ID <span className="font-mono font-semibold text-slate-950 ml-1">{user.exnessAccountId}</span>
                <span className="text-slate-300 mx-1.5">·</span>
                <span className={user.exnessVerified ? 'text-emerald-700 font-semibold' : 'text-amber-700 font-semibold'}>
                  {user.exnessVerified ? 'Verified Partner' : 'Pending IB Review'}
                </span>
              </button>
              <span aria-hidden="true" className="text-slate-300">|</span>
              <button
                type="button"
                onClick={() => onNavigate('referrals')}
                className="hover:text-slate-950 transition-colors cursor-pointer"
              >
                Referral <span className="font-mono font-semibold text-slate-950 ml-1">{user.referralCode}</span>
                <span className="text-[#B45309] font-semibold ml-1.5">({config.commissionPct}% payout)</span>
              </button>
            </div>

            <div className="flex flex-wrap items-center gap-3 pt-1">
              <button
                type="button"
                onClick={() => (user.hasAnalyzer ? onNavigate('analyzer') : onUnlock('analyzer'))}
                className="px-5 py-2.5 rounded-xl bg-[#0B0F19] hover:bg-slate-800 text-[#E5A93C] text-xs sm:text-sm font-bold transition-colors cursor-pointer whitespace-nowrap shrink-0 inline-flex items-center gap-2"
              >
                <Activity className="w-4 h-4" />
                {user.hasAnalyzer
                  ? 'Launch ICT Analyzer'
                  : `Subscribe ICT Analyzer ($${config.analyzerPriceUsd.toFixed(2)}/mo)`}
              </button>
              <button
                type="button"
                onClick={() => (hasDrt ? onNavigate('drt') : onUnlock('drt_analyzer'))}
                className="px-5 py-2.5 rounded-xl bg-[#E5A93C] hover:bg-[#d6982b] text-[#090806] text-xs sm:text-sm font-bold transition-colors cursor-pointer whitespace-nowrap shrink-0 inline-flex items-center gap-2"
              >
                <Layers className="w-4 h-4" />
                {hasDrt
                  ? 'Launch DRT Analyzer'
                  : `Subscribe DRT Analyzer ($${drtPriceUsd.toFixed(2)}/mo)`}
              </button>
              <a
                href={config.exnessIbUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="px-4 py-2.5 rounded-xl bg-slate-50 border border-slate-200 hover:border-amber-400 text-xs sm:text-sm font-semibold text-slate-700 hover:text-slate-950 transition-colors inline-flex items-center gap-1.5 whitespace-nowrap shrink-0"
              >
                Exness Portal
                <ArrowUpRight className="w-3.5 h-3.5 text-[#B45309]" />
              </a>
            </div>
          </div>

          <div className="lg:col-span-5 flex flex-col items-stretch lg:items-end gap-2">
            <div className="text-xs sm:text-sm italic text-amber-800/90 font-medium lg:text-right">
              &ldquo;Dream it. Trade it. Achieve it.&rdquo;
            </div>
            <div className="w-full rounded-xl overflow-hidden border border-slate-200 bg-[#0B0F19]">
              <img
                src={LANDING_IMAGES.heroTrader3d}
                alt="Grid Pips institutional trading desk"
                className="w-full h-36 sm:h-40 object-cover object-center"
              />
            </div>
          </div>
        </div>
      </div>

      {/* 4 Crisp White KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
        {/* KPI 1: ICT Analyzer */}
        <button
          type="button"
          onClick={() => (user.hasAnalyzer ? onNavigate('analyzer') : onUnlock('analyzer'))}
          className="text-left rounded-2xl bg-white border border-slate-200 hover:border-amber-400 transition-colors p-4 flex items-center gap-4 cursor-pointer shadow-xs"
        >
          <span className="w-11 h-11 rounded-xl bg-amber-50 border border-amber-200 text-amber-700 flex items-center justify-center shrink-0">
            <Wallet className="w-5 h-5" />
          </span>
          <div className="min-w-0 flex-1">
            <div className="flex items-center justify-between gap-2">
              <span className="text-xs text-slate-500">ICT Strategy Analyzer</span>
              {user.hasAnalyzer && <Check className="w-3.5 h-3.5 text-emerald-600 shrink-0" />}
            </div>
            <div className="text-lg font-bold text-slate-950 font-mono tabular-nums truncate mt-0.5">
              {user.hasAnalyzer
                ? user.analyzerDaysRemaining != null
                  ? `${user.analyzerDaysRemaining}d Active`
                  : 'Active Plan'
                : `$${config.analyzerPriceUsd.toFixed(2)}/mo`}
            </div>
            <div className="text-xs font-semibold text-[#B45309] mt-0.5 truncate">
              {user.hasAnalyzer ? 'Open live scanner →' : 'Subscribe now →'}
            </div>
          </div>
        </button>

        {/* KPI 2: DRT Analyzer */}
        <button
          type="button"
          onClick={() => (hasDrt ? onNavigate('drt') : onUnlock('drt_analyzer'))}
          className="text-left rounded-2xl bg-white border border-slate-200 hover:border-amber-400 transition-colors p-4 flex items-center gap-4 cursor-pointer shadow-xs"
        >
          <span className="w-11 h-11 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-700 flex items-center justify-center shrink-0">
            <Layers className="w-5 h-5" />
          </span>
          <div className="min-w-0 flex-1">
            <div className="flex items-center justify-between gap-2">
              <span className="text-xs text-slate-500">DRT Strategy Analyzer</span>
              {hasDrt && <Check className="w-3.5 h-3.5 text-emerald-600 shrink-0" />}
            </div>
            <div className="text-lg font-bold text-slate-950 font-mono tabular-nums truncate mt-0.5">
              {hasDrt
                ? drtDaysRemaining != null
                  ? `${drtDaysRemaining}d Active`
                  : 'Active Plan'
                : drtStatus === 'expired'
                ? 'Expired'
                : `$${drtPriceUsd.toFixed(2)}/mo`}
            </div>
            <div className="text-xs font-semibold text-emerald-700 mt-0.5 truncate">
              {hasDrt ? 'Open DRT scanner →' : 'Subscribe DRT →'}
            </div>
          </div>
        </button>

        {/* KPI 3: Journal Net P&L / Trades */}
        <button
          type="button"
          onClick={() => onNavigate('journal')}
          className="text-left rounded-2xl bg-white border border-slate-200 hover:border-amber-400 transition-colors p-4 flex items-center gap-4 cursor-pointer shadow-xs"
        >
          <span className="w-11 h-11 rounded-xl bg-slate-100 border border-slate-200 text-slate-800 flex items-center justify-center shrink-0">
            <TrendingUp className="w-5 h-5" />
          </span>
          <div className="min-w-0 flex-1">
            <div className="text-xs text-slate-500">Journal Net P&amp;L</div>
            <div
              className={`text-lg font-bold font-mono tabular-nums truncate mt-0.5 ${
                totalPnl >= 0 ? 'text-slate-950' : 'text-rose-600'
              }`}
            >
              {totalPnl >= 0 ? '+' : '-'}${Math.abs(totalPnl).toFixed(2)}
            </div>
            <div className="text-xs font-medium text-emerald-700 mt-0.5 font-mono tabular-nums">
              {journal.length} logged trade{journal.length === 1 ? '' : 's'}
            </div>
          </div>
        </button>

        {/* KPI 4: Win Rate & 35% Referrals */}
        <button
          type="button"
          onClick={() => onNavigate(journal.length > 0 ? 'analytics' : 'referrals')}
          className="text-left rounded-2xl bg-white border border-amber-200 hover:border-[#E5A93C] transition-colors p-4 flex items-center gap-4 cursor-pointer shadow-xs"
        >
          <span className="w-11 h-11 rounded-xl bg-[#0B0F19] border border-[#E5A93C]/40 text-[#E5A93C] flex items-center justify-center shrink-0">
            <Trophy className="w-5 h-5" />
          </span>
          <div className="min-w-0 flex-1">
            <div className="text-xs text-slate-500">
              {journal.length > 0 ? 'Journal Win Rate' : 'Partner Payouts'}
            </div>
            <div className="text-lg font-bold text-slate-950 font-mono tabular-nums truncate mt-0.5">
              {journal.length > 0 ? `${winRatePct}%` : `${config.commissionPct}%`}
            </div>
            <div className="text-xs font-semibold text-[#B45309] mt-0.5 truncate">
              {orders.length} order{orders.length === 1 ? '' : 's'} · {config.commissionPct}% partner hub →
            </div>
          </div>
        </button>
      </div>

      {/* Main 8/4 Split: Market Overview Chart + Top Assets */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
        {/* Left 8 Cols: Crisp White Market Overview Candlestick Chart + Quotes Table */}
        <div className="lg:col-span-8 space-y-5">
          <div className="rounded-2xl bg-white border border-slate-200 p-5 sm:p-6 shadow-xs">
            <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
              <div className="flex flex-wrap items-center gap-2.5">
                <h2 className="text-base font-bold text-slate-950">Market Overview</h2>
                <select
                  value={overviewSym}
                  onChange={(e) => setOverviewSym(e.target.value)}
                  aria-label="Market overview chart symbol"
                  className="px-2.5 py-1 text-xs font-mono font-bold bg-slate-50 border border-slate-300 text-slate-900 rounded-lg focus:outline-none focus:border-amber-500 max-w-[200px]"
                >
                  {MARKET_CATALOG_GROUPS.map((group) => (
                    <optgroup key={group.assetClass} label={group.label}>
                      {group.items.map((item) => (
                        <option key={item.sym} value={item.sym}>
                          {item.sym} · {item.name}
                        </option>
                      ))}
                    </optgroup>
                  ))}
                </select>
                {selectedQuote && (
                  <span className="text-xs font-mono tabular-nums text-slate-700">
                    {selectedQuote.price.toFixed(selectedQuote.digits)}{' '}
                    <span className={selectedQuote.chgPct >= 0 ? 'text-emerald-600 font-semibold' : 'text-rose-600 font-semibold'}>
                      ({selectedQuote.chgPct >= 0 ? '+' : ''}
                      {selectedQuote.chgPct.toFixed(2)}%)
                    </span>
                  </span>
                )}
              </div>

              {/* 1D 1W 1M 3M 1Y Segmented Filter */}
              <div className="flex items-center gap-1 p-1 bg-slate-100 border border-slate-200 rounded-lg">
                {(['1D', '1W', '1M', '3M', '1Y'] as const).map((tf) => (
                  <button
                    key={tf}
                    type="button"
                    onClick={() => setOverviewTf(tf)}
                    className={`px-2.5 py-1 text-xs font-mono font-bold rounded-md transition-colors cursor-pointer ${
                      overviewTf === tf
                        ? 'bg-[#0B0F19] text-white shadow-2xs'
                        : 'text-slate-600 hover:text-slate-950'
                    }`}
                  >
                    {tf}
                  </button>
                ))}
              </div>
            </div>

            {/* Clean Light Candlestick & Gold Trendline Chart */}
            <div className="relative rounded-xl bg-slate-50 border border-slate-200 p-3">
              {selectedQuote && (
                <div className="absolute top-3 right-3 px-2.5 py-1 rounded-lg bg-white border border-slate-200 shadow-2xs font-mono text-xs tabular-nums font-bold text-slate-950">
                  {selectedQuote.price.toLocaleString(undefined, {
                    minimumFractionDigits: selectedQuote.digits,
                    maximumFractionDigits: selectedQuote.digits,
                  })}
                </div>
              )}
              <svg viewBox="0 0 600 190" className="w-full h-48 sm:h-52">
                <defs>
                  <linearGradient id="overviewGoldArea" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#E5A93C" stopOpacity="0.22" />
                    <stop offset="100%" stopColor="#E5A93C" stopOpacity="0" />
                  </linearGradient>
                </defs>
                {chartGeometry ? (
                  <>
                    {chartGeometry.gridLevels.map((g, idx) => (
                      <g key={idx}>
                        <line
                          x1="40"
                          y1={g.y}
                          x2="592"
                          y2={g.y}
                          stroke="rgba(15, 23, 42, 0.08)"
                          strokeWidth="1"
                        />
                        <text
                          x="4"
                          y={g.y + 3}
                          fill="#64748B"
                          fontSize="9"
                          fontFamily="IBM Plex Mono, monospace"
                        >
                          {g.price.toFixed(selectedQuote?.digits ?? 2)}
                        </text>
                      </g>
                    ))}
                    <polygon points={chartGeometry.areaPoints} fill="url(#overviewGoldArea)" />
                    <polyline
                      fill="none"
                      stroke="#D97706"
                      strokeWidth="1.6"
                      strokeOpacity="0.85"
                      points={chartGeometry.smoothPoints}
                    />
                    {chartGeometry.candles.map((c, idx) => {
                      const col = c.bull ? '#059669' : '#E11D48';
                      const top = Math.min(c.yOpen, c.yClose);
                      const h = Math.max(3, Math.abs(c.yClose - c.yOpen));
                      return (
                        <g key={idx}>
                          <line
                            x1={c.x}
                            y1={c.yHigh}
                            x2={c.x}
                            y2={c.yLow}
                            stroke={col}
                            strokeWidth="1.3"
                          />
                          <rect
                            x={c.x - 4}
                            y={top}
                            width="8"
                            height={h}
                            rx="1.5"
                            fill={col}
                          />
                        </g>
                      );
                    })}
                  </>
                ) : (
                  <text
                    x="300"
                    y="98"
                    textAnchor="middle"
                    fill="#64748B"
                    fontSize="12"
                    fontFamily="IBM Plex Mono, monospace"
                  >
                    {loadingBars
                      ? `Loading live ${overviewSym} (${overviewTf}) TradingView candles...`
                      : `Open TradingView chart to view live ${overviewSym} bars`}
                  </text>
                )}
              </svg>
            </div>

            {/* Live Market Quotes Table with Asset-Class Filters */}
            <div className="mt-5 space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="text-xs font-mono text-slate-500">
                  {marketStatus
                    ? `Live TradingView Feeds · ${marketStatus.openCount}/${marketStatus.totalCount} open`
                    : `Live TradingView Feeds · ${quotes.length} markets`}
                </div>
                <button
                  type="button"
                  onClick={() => onNavigate('charts')}
                  className="text-xs font-semibold text-[#B45309] hover:underline cursor-pointer"
                >
                  Open full TradingView terminal →
                </button>
              </div>

              <div className="flex flex-wrap items-center justify-between gap-2.5">
                <div className="flex flex-wrap items-center gap-1 p-1 bg-slate-100 border border-slate-200 rounded-xl">
                  {(
                    [
                      ['all', 'All'],
                      ['fx', 'Forex'],
                      ['commodity', 'Commodities'],
                      ['index', 'Indices'],
                      ['etf', 'ETFs'],
                      ['stock', 'Stocks'],
                      ['crypto', 'Crypto'],
                    ] as const
                  ).map(([catKey, catLabel]) => {
                    const active = assetCategoryFilter === catKey;
                    return (
                      <button
                        key={catKey}
                        type="button"
                        onClick={() => setAssetCategoryFilter(catKey)}
                        className={`px-2.5 py-1 text-[11px] font-semibold rounded-lg transition-colors cursor-pointer whitespace-nowrap ${
                          active
                            ? 'bg-[#0B0F19] text-white'
                            : 'text-slate-600 hover:text-slate-950'
                        }`}
                      >
                        {catLabel}{' '}
                        <span className={`font-mono text-[10px] ${active ? 'text-[#E5A93C]' : 'text-slate-400'}`}>
                          {categoryCounts[catKey] ?? 0}
                        </span>
                      </button>
                    );
                  })}
                </div>

                <input
                  type="text"
                  value={tableSearch}
                  onChange={(e) => setTableSearch(e.target.value)}
                  placeholder="Filter ticker..."
                  aria-label="Filter market quotes table"
                  className="w-36 sm:w-44 px-3 py-1.5 text-xs bg-white border border-slate-300 focus:border-amber-500 text-slate-900 placeholder:text-slate-400 rounded-lg focus:outline-none"
                />
              </div>

              <div className="overflow-x-auto max-h-[420px] overflow-y-auto rounded-xl border border-slate-200">
                <table className="w-full text-left text-sm">
                  <thead className="sticky top-0 bg-slate-50 z-10">
                    <tr className="border-b border-slate-200 text-xs text-slate-500">
                      <th className="py-2.5 pl-3 pr-4 font-semibold">Symbol</th>
                      <th className="py-2.5 pr-4 font-semibold">Instrument</th>
                      <th className="py-2.5 pr-4 font-semibold">Class</th>
                      <th className="py-2.5 pr-4 font-semibold">Session</th>
                      <th className="py-2.5 pr-4 text-right font-semibold">Price</th>
                      <th className="py-2.5 pr-4 text-right font-semibold">24h</th>
                      <th className="py-2.5 pr-3 text-right font-semibold">Trend</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {filteredTableQuotes.map((q, idx) => {
                      const up = q.chgPct >= 0;
                      const sparkPoints = getSparklinePoints(q.chgPct, idx + 1);
                      const dir = tickDirs[q.sym];
                      const statusLabel =
                        q.marketStatusLabel || (q.isMarketOpen === true ? 'Open' : q.isMarketOpen === false ? 'Closed' : '—');
                      return (
                        <tr
                          key={q.sym}
                          onClick={() => onOpenSymbolChart(q.sym)}
                          className="group hover:bg-amber-50/50 transition-colors cursor-pointer"
                        >
                          <td className="py-2.5 pl-3 pr-4 font-mono font-bold text-slate-950 group-hover:text-[#B45309] transition-colors whitespace-nowrap">
                            {q.sym}
                          </td>
                          <td className="py-2.5 pr-4 text-slate-600 text-xs whitespace-nowrap">{q.name}</td>
                          <td className="py-2.5 pr-4 font-mono text-[11px] text-amber-700 whitespace-nowrap">
                            {ASSET_CLASS_SHORT_LABELS[q.assetClass] || q.assetClass}
                          </td>
                          <td
                            className={`py-2.5 pr-4 text-xs font-medium whitespace-nowrap ${
                              q.isMarketOpen === true ? 'text-emerald-700' : 'text-slate-400'
                            }`}
                          >
                            {statusLabel}
                          </td>
                          <td className="py-2.5 pr-4 text-right font-mono tabular-nums font-semibold text-slate-900 whitespace-nowrap">
                            <span
                              key={dir ? `${q.sym}-${tickSeq}` : q.sym}
                              className={
                                dir === 'up'
                                  ? 'inline-block animate-price-up'
                                  : dir === 'down'
                                  ? 'inline-block animate-price-down'
                                  : ''
                              }
                            >
                              {q.price.toLocaleString(undefined, {
                                minimumFractionDigits: q.digits,
                                maximumFractionDigits: q.digits,
                              })}
                            </span>
                          </td>
                          <td
                            className={`py-2.5 pr-4 text-right font-mono tabular-nums font-semibold whitespace-nowrap ${
                              up ? 'text-emerald-600' : 'text-rose-600'
                            }`}
                          >
                            {up ? '+' : ''}
                            {q.chgPct.toFixed(2)}%
                          </td>
                          <td className="py-2.5 pr-3 text-right">
                            <svg
                              viewBox="0 0 76 20"
                              className="w-16 h-5 inline-block"
                              aria-hidden="true"
                            >
                              <polyline
                                fill="none"
                                stroke={up ? '#059669' : '#E11D48'}
                                strokeWidth="1.6"
                                strokeLinecap="round"
                                strokeLinejoin="round"
                                points={sparkPoints}
                              />
                            </svg>
                          </td>
                        </tr>
                      );
                    })}
                    {filteredTableQuotes.length === 0 && (
                      <tr>
                        <td colSpan={7} className="py-6 text-center text-xs text-slate-500">
                          No instruments match &ldquo;{tableSearch}&rdquo;.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        </div>

        {/* Right 4 Cols: Top Assets + JakoyoFX Community Card + Killzones */}
        <div className="lg:col-span-4 space-y-5">
          {/* Top Assets Card */}
          <div className="rounded-2xl bg-white border border-slate-200 p-5 shadow-xs">
            <div className="flex items-center justify-between gap-2 mb-3.5">
              <h3 className="text-sm font-bold text-slate-950">Top Assets</h3>
              <button
                type="button"
                onClick={() => onNavigate('charts')}
                className="text-xs font-semibold text-[#B45309] hover:underline cursor-pointer"
              >
                View All →
              </button>
            </div>
            <div className="divide-y divide-slate-100">
              {topAssets.map((asset) => {
                const up = asset.chgPct >= 0;
                return (
                  <button
                    type="button"
                    key={asset.sym}
                    onClick={() => onOpenSymbolChart(asset.sym)}
                    className="w-full py-3 flex items-center justify-between gap-3 hover:bg-amber-50/50 rounded-lg px-1.5 -mx-1.5 transition-colors cursor-pointer text-left"
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      <span className="w-9 h-9 rounded-full bg-amber-50 border border-amber-200 text-amber-800 font-mono font-bold text-[11px] flex items-center justify-center shrink-0">
                        {asset.sym.slice(0, 3)}
                      </span>
                      <div className="min-w-0">
                        <div className="text-xs font-bold text-slate-950 truncate">{asset.name}</div>
                        <div className="text-[11px] font-mono text-slate-500">{asset.sym}</div>
                      </div>
                    </div>
                    <div className="text-right font-mono tabular-nums shrink-0">
                      <div className="text-xs font-bold text-slate-950">
                        {asset.price.toLocaleString(undefined, {
                          minimumFractionDigits: asset.digits,
                          maximumFractionDigits: asset.digits,
                        })}
                      </div>
                      <div className={`text-[11px] font-semibold ${up ? 'text-emerald-600' : 'text-rose-600'}`}>
                        {up ? '↑ +' : '↓ '}
                        {asset.chgPct.toFixed(2)}%
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>
          </div>

          {/* JakoyoFX Community Obsidian & Gold Card */}
          <div className="rounded-2xl bg-[#0B0F19] border border-slate-900 overflow-hidden shadow-sm">
            <div className="relative h-36 bg-[#0B0F19] overflow-hidden">
              <img
                src={LANDING_IMAGES.mentorCommunity3d}
                alt="Trade anywhere anytime on Grid Pips"
                className="w-full h-full object-cover object-top"
              />
              <div className="absolute inset-0 bg-gradient-to-t from-[#0B0F19] via-[#0B0F19]/40 to-transparent" />
            </div>
            <div className="p-5 pt-3 space-y-3">
              <div>
                <div className="text-xs font-semibold text-[#E5A93C]">JakoyoFX Trading Desk</div>
                <h3 className="text-base font-bold text-white mt-0.5">Trade Anywhere, Anytime</h3>
                <p className="text-xs text-slate-300 leading-relaxed mt-1">
                  Join fellow ICT, DRT, and SMC traders on web &amp; mobile, review live killzone setups, and refine Premium/Discount PD Array entries.
                </p>
              </div>
              <a
                href={config.telegramUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="w-full py-2.5 px-4 bg-[#E5A93C] hover:bg-[#d6982b] text-[#090806] text-xs font-bold rounded-xl inline-flex items-center justify-center gap-2 transition-colors"
              >
                <Send className="w-3.5 h-3.5" />
                Open t.me/JakoyoFx
              </a>
            </div>
          </div>

          {/* Killzones (NY time) Crisp White Card */}
          <div className="rounded-2xl bg-white border border-slate-200 p-5 space-y-3.5 shadow-xs">
            <div className="flex items-center justify-between gap-2">
              <h3 className="text-sm font-bold text-slate-950">Killzones (NY time)</h3>
              <span className="text-xs font-mono tabular-nums font-semibold text-[#B45309]">{killzone.nyTimeFormatted} NY</span>
            </div>

            <div className="grid grid-cols-4 gap-1.5">
              {(
                [
                  { key: 'asian', label: 'Asian' },
                  { key: 'london', label: 'London' },
                  { key: 'nyam', label: 'NY AM' },
                  { key: 'close', label: 'Close' },
                ] as const
              ).map((seg) => {
                const isActive = killzone.activeKey === seg.key;
                return (
                  <div key={seg.key} className="space-y-1.5">
                    <div
                      className={`relative overflow-hidden h-2 rounded-sm ${
                        isActive ? 'bg-[#E5A93C]' : 'bg-slate-200'
                      }`}
                    >
                      {isActive && (
                        <div
                          aria-hidden="true"
                          className="absolute inset-y-0 w-1/2 bg-gradient-to-r from-transparent via-white/60 to-transparent animate-killzone-shimmer"
                        />
                      )}
                    </div>
                    <div
                      className={`text-[11px] font-medium ${
                        isActive ? 'text-slate-950 font-semibold' : 'text-slate-500'
                      }`}
                    >
                      {seg.label}
                    </div>
                  </div>
                );
              })}
            </div>

            <div className="text-xs text-slate-500 pt-0.5 font-mono tabular-nums">
              {killzone.detail}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
