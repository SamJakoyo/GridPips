import React, { useCallback, useEffect, useRef, useState } from 'react';
import { AnimatePresence, MotionConfig, motion } from 'motion/react';
import {
  Activity,
  BarChart3,
  BookOpen,
  Bot,
  Calculator,
  Calendar,
  CandlestickChart,
  CheckSquare,
  CreditCard,
  LayoutDashboard,
  LogOut,
  Mail,
  Menu,
  NotebookPen,
  Send,
  Shield,
  Users,
  X,
  ArrowUpRight,
  UserCircle,
  Check,
} from 'lucide-react';
import {
  apiFetch,
  clearSessionToken,
  setSessionToken,
  INITIAL_MARKET_QUOTES,
  type MarketSymbolQuote,
  type TradingViewMarketStatus,
} from './lib/api';
import { getSupabaseClient } from './lib/supabase';
import type { AnalyzerTimeframe } from './lib/tradingTimeframes';
import type { JournalTrade, Order, PublicConfig, User } from './types';
import { LandingPage } from './components/LandingPage';
import { AuthView, type PendingOAuthUser } from './components/AuthView';
import { CheckoutModal } from './components/CheckoutModal';
import { IctAnalyzerView } from './components/IctAnalyzerView';
import { EaBotsView } from './components/EaBotsView';
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

type WorkspaceTab =
  | 'overview'
  | 'analyzer'
  | 'eabots'
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
  analyzerPriceUsd: 5.25,
  eaBotsPriceUsd: 5.25,
  usdKesRate: 130,
  analyzerPriceKes: 683,
  eaBotsPriceKes: 683,
  mpesaTillNumber: '1921416',
  mpesaPartyB: '1921416',
  mpesaTransactionType: 'CustomerBuyGoodsOnline',
  mpesaMerchantName: 'GRIDPIPs Trading',
  commissionPct: 20,
  cryptoAddresses: {
    USDT_TRC20: 'TX9kGridPipsUSDT7xR8mN4vQ2wK9pL3zF1',
    USDT_ERC20: '0x71C9GridPips4E8A9B2F1D3c0E6a8b7d9F2a1C',
    BTC: 'bc1qgridpips8v9k2x4m7n0p3q5r6s8t9w',
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

  const [checkoutState, setCheckoutState] = useState<{
    productKey: 'analyzer' | 'ea_bots';
    existingOrder?: Order | null;
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

  // Live TradingView market quote & session status polling (no synthetic random ticks)
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

  if (booting) {
    return (
      <div className="min-h-screen bg-[#F7F5F0] flex items-center justify-center text-sm font-mono text-amber-700">
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
          if (selectedSym) setChartSymbol(selectedSym);
          if (selectedTf) setChartTimeframe(selectedTf);
          if (!user) {
            setAuthMode('register');
            setScreen('auth');
            return;
          }
          setScreen('workspace');
          setActiveTab(product === 'analyzer' ? 'analyzer' : 'eabots');
          if ((product === 'analyzer' && !user.hasAnalyzer) || (product === 'ea_bots' && !user.hasEaBots)) {
            setCheckoutState({ productKey: product });
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
          tag: user.hasAnalyzer ? 'Active' : '$5.25',
        },
        {
          id: 'eabots',
          name: 'MQL5 EA Bots',
          icon: <Bot className="w-4 h-4" />,
          tag: user.hasEaBots ? 'Active' : '$5.25',
        },
        { id: 'orders', name: 'Orders & Billing', icon: <CreditCard className="w-4 h-4" /> },
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
        { id: 'education', name: 'ICT & SMC Academy', icon: <BookOpen className="w-4 h-4" /> },
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

  const currentTabTitle =
    navGroups.flatMap((g) => g.items).find((i) => i.id === activeTab)?.name || 'Dashboard';

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
    ? 'bg-slate-50 border-slate-200 text-slate-600'
    : marketStatus.traditionalOpen
    ? 'bg-emerald-50 border-emerald-200 text-emerald-700'
    : marketStatus.cryptoOpen
    ? 'bg-amber-50 border-amber-200 text-amber-800'
    : 'bg-rose-50 border-rose-200 text-rose-700';

  return (
    <div className="min-h-screen bg-[#F7F5F0] text-slate-900 flex">
      {/* Desktop Sidebar */}
      <aside className="hidden lg:flex lg:w-64 lg:flex-col bg-white border-r border-slate-200 sticky top-0 h-screen shrink-0">
        <div className="h-16 px-4 border-b border-slate-200 flex items-center justify-between gap-2">
          <button
            onClick={() => setScreen('landing')}
            className="cursor-pointer shrink-0"
          >
            <BrandLogo variant="dark" size="sm" />
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('account')}
            title="View my account information"
            className="text-[11px] font-mono text-slate-500 hover:text-amber-600 truncate cursor-pointer"
          >
            {user.exnessAccountId}
          </button>
        </div>

        <nav className="flex-1 overflow-y-auto p-3 space-y-5">
          {navGroups.map((group) => (
            <div key={group.label}>
              <div className="px-3 text-[11px] font-medium text-slate-500 mb-1.5">{group.label}</div>
              <div className="space-y-0.5">
                {group.items.map((item) => {
                  const isActive = activeTab === item.id;
                  return (
                    <button
                      key={item.id}
                      onClick={() => setActiveTab(item.id)}
                      className={`w-full flex items-center justify-between px-3 py-2 rounded-lg text-xs font-medium transition-colors cursor-pointer ${
                        isActive
                          ? 'bg-amber-50 border border-amber-200 text-slate-950'
                          : 'border border-transparent text-slate-600 hover:text-slate-950 hover:bg-slate-100'
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
                          className={`font-mono text-[10px] px-1.5 py-0.5 rounded border shrink-0 ${
                            item.tag === 'Active'
                              ? 'border-amber-200 bg-amber-50 text-amber-700'
                              : 'border-slate-200 bg-slate-100 text-slate-600'
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

        <div className="p-3.5 border-t border-slate-200 space-y-2">
          <a
            href={config.telegramUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="w-full py-2.5 px-3 bg-slate-50 border border-slate-200 hover:border-amber-400 text-slate-800 text-xs font-medium rounded-lg flex items-center justify-between transition-colors"
          >
            <span className="inline-flex items-center gap-2">
              <Send className="w-3.5 h-3.5 text-amber-600" />
              JakoyoFX Telegram
            </span>
            <ArrowUpRight className="w-3.5 h-3.5 text-slate-400" />
          </a>
          <button
            onClick={handleLogout}
            className="w-full py-2 px-3 text-xs font-medium text-slate-500 hover:text-rose-600 flex items-center gap-2 cursor-pointer transition-colors"
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
            className="fixed inset-0 bg-black/50"
            onClick={() => setMobileMenuOpen(false)}
          />
          <div className="relative w-72 bg-white border-r border-slate-200 h-full overflow-y-auto p-4 z-10 flex flex-col justify-between">
            <div>
              <div className="flex items-center justify-between pb-4 mb-4 border-b border-slate-200">
                <BrandLogo variant="dark" size="sm" />
                <button
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
                    <div className="px-2 text-[11px] font-medium text-slate-500 mb-1">
                      {group.label}
                    </div>
                    {group.items.map((item) => {
                      const isActive = activeTab === item.id;
                      return (
                        <button
                          key={item.id}
                          onClick={() => {
                            setActiveTab(item.id);
                            setMobileMenuOpen(false);
                          }}
                          className={`w-full flex items-center justify-between px-3 py-2.5 rounded-lg text-xs font-medium ${
                            isActive
                              ? 'bg-amber-50 border border-amber-200 text-slate-950'
                              : 'text-slate-600 hover:text-slate-950'
                          }`}
                        >
                          <span className="flex items-center gap-2.5">
                            <span className={isActive ? 'text-amber-600' : 'text-slate-400'}>
                              {item.icon}
                            </span>
                            <span>{item.name}</span>
                          </span>
                          {item.tag && <span className="font-mono text-[10px] text-amber-600">{item.tag}</span>}
                        </button>
                      );
                    })}
                  </div>
                ))}
              </div>
            </div>
            <button
              onClick={handleLogout}
              className="mt-6 w-full py-2.5 border border-slate-200 bg-slate-50 rounded-lg text-xs font-semibold text-rose-600"
            >
              Sign out
            </button>
          </div>
        </div>
      )}

      {/* Main Content Area */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Top Context Header */}
        <header className="sticky top-0 z-30 h-16 bg-white/95 backdrop-blur-sm border-b border-slate-200 px-4 sm:px-6 flex items-center justify-between gap-3 sm:gap-4">
          <div className="flex items-center gap-3 min-w-0">
            <button
              onClick={() => setMobileMenuOpen(true)}
              className="lg:hidden p-2 -ml-2 text-slate-700"
              aria-label="Open navigation"
            >
              <Menu className="w-5 h-5" />
            </button>
            <div className="text-sm font-medium text-slate-500 truncate">
              Grid Pips / <span className="font-semibold text-slate-950">{currentTabTitle}</span>
            </div>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            <button
              type="button"
              onClick={() => setActiveTab('charts')}
              title={marketStatusTooltip}
              className={`hidden md:inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border text-xs font-medium whitespace-nowrap cursor-pointer transition-colors ${marketStatusStyle}`}
            >
              <span>{marketStatus ? marketStatus.summaryLabel : 'Checking TradingView…'}</span>
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('account')}
              title="My Information"
              className={`hidden sm:inline-flex items-center gap-2 px-3 py-1.5 rounded-lg border text-xs font-medium transition-colors cursor-pointer whitespace-nowrap ${
                activeTab === 'account'
                  ? 'bg-amber-50 border-amber-500 text-slate-950'
                  : 'bg-slate-50 border-slate-200 hover:border-amber-400 text-slate-700'
              }`}
            >
              <span className="w-5 h-5 rounded bg-[#E5A93C] text-[#090806] font-bold text-[10px] flex items-center justify-center">
                {userInitials || 'GP'}
              </span>
              <span>{firstName}</span>
            </button>
            {user.hasEaBots && (
              <button
                type="button"
                onClick={() => setActiveTab('eabots')}
                className={`hidden sm:inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border text-xs font-semibold transition-colors cursor-pointer whitespace-nowrap ${
                  user.mt5Connected
                    ? 'bg-emerald-50 border-emerald-300 text-emerald-700 hover:border-emerald-500'
                    : 'bg-amber-50 border-amber-300 text-amber-800 hover:bg-amber-100'
                }`}
              >
                <Bot className="w-3.5 h-3.5" />
                {user.mt5Connected
                  ? user.mt5AutoTrade
                    ? 'MT5 Auto-Trade ON'
                    : 'MT5 Linked'
                  : 'Connect MT5'}
              </button>
            )}
            <a
              href={config.exnessIbUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="hidden sm:inline-flex items-center gap-1.5 px-3.5 py-1.5 bg-slate-50 border border-slate-200 hover:border-slate-300 text-xs font-medium text-slate-800 rounded-lg whitespace-nowrap transition-colors"
            >
              Exness Portal
              <ArrowUpRight className="w-3.5 h-3.5 text-slate-500" />
            </a>
            {!user.hasAnalyzer && (
              <button
                onClick={() => setCheckoutState({ productKey: 'analyzer' })}
                className="px-3.5 py-1.5 bg-[#E5A93C] hover:bg-[#F0B84D] text-[#090806] text-xs font-semibold rounded-lg whitespace-nowrap cursor-pointer transition-colors"
              >
                Unlock ICT (${config.analyzerPriceUsd.toFixed(2)})
              </button>
            )}
          </div>
        </header>

        <main className="p-6 max-w-7xl w-full mx-auto flex-1">
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
                    onUnlock={(productKey) => setCheckoutState({ productKey })}
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
                    onUnlockClick={() => setCheckoutState({ productKey: 'analyzer' })}
                  />
                )}
                {activeTab === 'eabots' && (
                  <EaBotsView
                    user={user}
                    config={config}
                    onUnlockClick={() => setCheckoutState({ productKey: 'ea_bots' })}
                    onUserUpdated={(updated) => setUser(updated)}
                  />
                )}
                {activeTab === 'orders' && (
                  <OrdersDashboardView
                    orders={orders}
                    user={user}
                    config={config}
                    onUserUpdated={(updated) => setUser(updated)}
                    onResumePayment={(ord) =>
                      setCheckoutState({ productKey: ord.product_key, existingOrder: ord })
                    }
                    onBuyNew={(productKey) => setCheckoutState({ productKey })}
                    onRefresh={loadUserWorkspaceData}
                    onLaunchProduct={(productKey) =>
                      setActiveTab(productKey === 'ea_bots' ? 'eabots' : 'analyzer')
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
                    onUnlock={(productKey) => setCheckoutState({ productKey })}
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
            setActiveTab(checkoutState.productKey === 'ea_bots' ? 'eabots' : 'analyzer');
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

const HERO_CANDLES = [
  { x: 18, yOpen: 112, yClose: 104, yHigh: 96, yLow: 120, up: true },
  { x: 46, yOpen: 104, yClose: 115, yHigh: 98, yLow: 124, up: false },
  { x: 74, yOpen: 113, yClose: 99, yHigh: 90, yLow: 118, up: true },
  { x: 102, yOpen: 99, yClose: 85, yHigh: 78, yLow: 106, up: true },
  { x: 130, yOpen: 86, yClose: 96, yHigh: 81, yLow: 102, up: false },
  { x: 158, yOpen: 94, yClose: 74, yHigh: 66, yLow: 98, up: true },
  { x: 186, yOpen: 75, yClose: 66, yHigh: 56, yLow: 82, up: true },
  { x: 214, yOpen: 67, yClose: 80, yHigh: 61, yLow: 87, up: false },
  { x: 242, yOpen: 78, yClose: 55, yHigh: 46, yLow: 83, up: true },
  { x: 270, yOpen: 55, yClose: 36, yHigh: 25, yLow: 60, up: true },
  { x: 298, yOpen: 36, yClose: 45, yHigh: 29, yLow: 52, up: false },
  { x: 326, yOpen: 44, yClose: 22, yHigh: 12, yLow: 49, up: true },
];

const HERO_TREND_PATH =
  'M 18 108 L 46 110 L 74 104 L 102 90 L 130 92 L 158 82 L 186 69 L 214 75 L 242 60 L 270 42 L 298 41 L 326 27';

const WorkspaceOverview: React.FC<{
  user: User;
  config: PublicConfig;
  quotes: MarketSymbolQuote[];
  marketStatus: TradingViewMarketStatus | null;
  journal: JournalTrade[];
  orders: Order[];
  onNavigate: (tab: WorkspaceTab) => void;
  onUnlock: (productKey: 'analyzer' | 'ea_bots') => void;
  onOpenSymbolChart: (sym: string) => void;
}> = ({ user, config, quotes, marketStatus, journal, orders, onNavigate, onUnlock, onOpenSymbolChart }) => {
  const [nyClock, setNyClock] = useState(() => new Date());
  const prevQuotesRef = useRef<Record<string, number>>({});
  const [tickDirs, setTickDirs] = useState<Record<string, 'up' | 'down'>>({});
  const [tickSeq, setTickSeq] = useState(0);

  useEffect(() => {
    const id = window.setInterval(() => setNyClock(new Date()), 1000);
    return () => window.clearInterval(id);
  }, []);

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
  const firstName = (user.name || user.email || 'Trader').trim().split(/\s+/)[0];
  const featuredGold = quotes.find((q) => q.sym === 'XAUUSD') || quotes[0];
  const featuredUp = (featuredGold?.chgPct ?? 0) >= 0;
  const featuredTickDir = featuredGold ? tickDirs[featuredGold.sym] : undefined;
  const killzone = getKillzoneTimelineState(nyClock);

  let heroSubtext =
    'Analyze live TradingView liquidity sweeps, automate MT5 execution, and log every setup in one platform.';
  if (user.hasAnalyzer && user.hasEaBots) {
    heroSubtext = 'Your ICT analyzer and EA bots are unlocked. Pick up where you left off.';
  } else if (user.hasAnalyzer) {
    heroSubtext = 'Your ICT Strategy Analyzer is unlocked and synced with live TradingView data.';
  } else if (user.hasEaBots) {
    heroSubtext = 'Your MQL5 EA Bots Pack is unlocked. Connect your MT5 terminal below.';
  }

  return (
    <div className="space-y-5">
      {/* Light Editorial Ivory + Gold Hero Banner */}
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.35, ease: [0.22, 1, 0.36, 1] }}
        className="relative overflow-hidden rounded-2xl border border-amber-200/80 bg-[radial-gradient(ellipse_at_top_left,_rgba(245,158,11,0.14),_#FFFFFF_52%,_#FAF7F0_100%)] p-6 sm:p-7"
      >
        {/* Subtle ambient gold drift */}
        <div
          aria-hidden="true"
          className="pointer-events-none absolute -top-24 -left-16 w-80 h-80 rounded-full bg-[#E5A93C]/15 blur-3xl animate-hero-ambient"
        />

        <div className="relative z-10 grid grid-cols-1 lg:grid-cols-12 gap-6 items-center">
          <div className="lg:col-span-7 space-y-4">
            <motion.h1
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.32, delay: 0.05 }}
              className="text-3xl sm:text-4xl font-bold text-slate-950 tracking-tight leading-[1.12] max-w-md"
            >
              Welcome back, {firstName}
            </motion.h1>
            <motion.p
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.32, delay: 0.1 }}
              className="text-sm text-slate-600 max-w-lg leading-relaxed"
            >
              {heroSubtext}
            </motion.p>

            <motion.div
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.32, delay: 0.14 }}
              className="flex flex-wrap items-center gap-2.5 pt-0.5"
            >
              <button
                type="button"
                onClick={() => onNavigate('account')}
                className="px-3 py-1.5 rounded-lg bg-amber-50/80 border border-amber-200 hover:border-amber-400 text-xs text-slate-700 hover:text-slate-950 transition-colors cursor-pointer whitespace-nowrap inline-flex items-center gap-1.5"
              >
                <span>Exness ID</span>
                <span className="font-mono font-semibold text-amber-700">{user.exnessAccountId}</span>
                <span
                  className={`font-semibold ${
                    user.exnessVerified ? 'text-emerald-700' : 'text-amber-700'
                  }`}
                >
                  · {user.exnessVerified ? 'Verified Partner' : 'Pending IB Review'}
                </span>
              </button>
              <button
                type="button"
                onClick={() => onNavigate('account')}
                className="px-3 py-1.5 rounded-lg bg-amber-50/80 border border-amber-200 hover:border-amber-400 text-xs text-slate-700 hover:text-slate-950 transition-colors cursor-pointer whitespace-nowrap"
              >
                Referral code <span className="font-mono font-semibold text-slate-950 ml-1">{user.referralCode}</span>
              </button>
              <button
                type="button"
                onClick={() => onNavigate('account')}
                className="px-3 py-1.5 rounded-lg bg-transparent text-xs font-semibold text-amber-700 hover:underline cursor-pointer whitespace-nowrap"
              >
                My information →
              </button>
            </motion.div>

            <motion.div
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.32, delay: 0.18 }}
              className="flex flex-wrap items-center gap-3 pt-1"
            >
              <motion.button
                type="button"
                whileHover={{ y: -1 }}
                whileTap={{ scale: 0.985 }}
                onClick={() => (user.hasAnalyzer ? onNavigate('analyzer') : onUnlock('analyzer'))}
                className="px-5 py-2.5 rounded-lg bg-[#E5A93C] hover:bg-[#F0B84D] text-[#090806] text-xs sm:text-sm font-semibold transition-colors cursor-pointer whitespace-nowrap shrink-0"
              >
                {user.hasAnalyzer ? 'Launch ICT Scanner' : `Unlock ICT Analyzer ($${config.analyzerPriceUsd.toFixed(2)})`}
              </motion.button>
              <motion.button
                type="button"
                whileHover={{ y: -1 }}
                whileTap={{ scale: 0.985 }}
                onClick={() => (user.hasEaBots ? onNavigate('eabots') : onUnlock('ea_bots'))}
                className="px-5 py-2.5 rounded-lg bg-white border border-slate-300 hover:border-amber-500 text-slate-900 text-xs sm:text-sm font-semibold transition-colors cursor-pointer whitespace-nowrap shrink-0 inline-flex items-center gap-2"
              >
                <Bot className="w-4 h-4 text-amber-600" />
                {user.hasEaBots
                  ? user.mt5Connected
                    ? 'Manage MT5 & EA Auto-Trade'
                    : 'Connect Client MT5 Account'
                  : `Get MQL5 EA Bots ($${config.eaBotsPriceUsd.toFixed(2)})`}
              </motion.button>
            </motion.div>
          </div>

          {/* Right Live Highlight + Animated Ascending Gold Candlestick Chart */}
          <div className="lg:col-span-5 flex flex-col items-end">
            {featuredGold && (
              <button
                type="button"
                onClick={() => onOpenSymbolChart(featuredGold.sym)}
                className="text-right mb-2 cursor-pointer group"
              >
                <div className="text-xs text-slate-500 group-hover:text-slate-700 transition-colors">
                  {featuredGold.sym} · {featuredGold.sym === 'XAUUSD' ? 'Gold' : featuredGold.name}
                  {featuredGold.marketStatusLabel ? ` · ${featuredGold.marketStatusLabel}` : ''}
                </div>
                <div className="flex items-baseline justify-end gap-2 mt-0.5">
                  <motion.span
                    key={`${featuredGold.sym}-${featuredGold.price}`}
                    initial={featuredTickDir ? { scale: 1.04 } : false}
                    animate={{ scale: 1 }}
                    transition={{ duration: 0.25 }}
                    className={`text-xl sm:text-2xl font-mono tabular-nums font-bold text-amber-600 ${
                      featuredTickDir === 'up'
                        ? 'animate-price-up'
                        : featuredTickDir === 'down'
                        ? 'animate-price-down'
                        : ''
                    }`}
                  >
                    {featuredGold.price.toLocaleString(undefined, {
                      minimumFractionDigits: featuredGold.digits,
                      maximumFractionDigits: featuredGold.digits,
                    })}
                  </motion.span>
                  <span
                    className={`text-xs font-mono tabular-nums font-semibold ${
                      featuredUp ? 'text-emerald-600' : 'text-rose-600'
                    }`}
                  >
                    {featuredUp ? '▲ +' : '▼ '}
                    {featuredGold.chgPct.toFixed(2)}%
                  </span>
                </div>
              </button>
            )}

            <div className="w-full max-w-[360px]">
              <svg viewBox="0 0 344 136" className="w-full h-auto" aria-hidden="true">
                <defs>
                  <linearGradient id="heroGoldFill" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#E5A93C" stopOpacity="0.26" />
                    <stop offset="100%" stopColor="#E5A93C" stopOpacity="0" />
                  </linearGradient>
                  <radialGradient id="heroTipGlow" cx="50%" cy="50%" r="50%">
                    <stop offset="0%" stopColor="#F5C451" stopOpacity="0.85" />
                    <stop offset="100%" stopColor="#E5A93C" stopOpacity="0" />
                  </radialGradient>
                </defs>
                {[28, 56, 84, 112].map((y) => (
                  <line
                    key={y}
                    x1="8"
                    y1={y}
                    x2="338"
                    y2={y}
                    stroke="rgba(15,23,42,0.07)"
                    strokeWidth="1"
                  />
                ))}
                <motion.polygon
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  transition={{ duration: 0.9, delay: 0.25 }}
                  points="18,108 46,110 74,104 102,90 130,92 158,82 186,69 214,75 242,60 270,42 298,41 326,27 326,130 18,130"
                  fill="url(#heroGoldFill)"
                />
                <motion.path
                  d={HERO_TREND_PATH}
                  fill="none"
                  stroke="#E5A93C"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  initial={{ pathLength: 0, opacity: 0.4 }}
                  animate={{ pathLength: 1, opacity: 1 }}
                  transition={{ duration: 1.05, ease: [0.22, 1, 0.36, 1], delay: 0.12 }}
                />
                {HERO_CANDLES.map((c, idx) => {
                  const color = c.up ? '#22C55E' : '#EF4444';
                  const top = Math.min(c.yOpen, c.yClose);
                  const height = Math.max(5, Math.abs(c.yClose - c.yOpen));
                  const isLast = idx === HERO_CANDLES.length - 1;
                  return (
                    <motion.g
                      key={idx}
                      initial={{ opacity: 0, scaleY: 0.35 }}
                      animate={{ opacity: 1, scaleY: 1 }}
                      transition={{
                        duration: 0.36,
                        delay: 0.08 + idx * 0.045,
                        ease: [0.22, 1, 0.36, 1],
                      }}
                      style={{ transformOrigin: `${c.x}px ${c.yLow}px` }}
                    >
                      <line x1={c.x} y1={c.yHigh} x2={c.x} y2={c.yLow} stroke={color} strokeWidth="1.5" />
                      <rect
                        x={c.x - 4.5}
                        y={top}
                        width="9"
                        height={height}
                        rx="1.5"
                        fill={color}
                        className={isLast ? 'animate-hero-live-candle' : undefined}
                      />
                    </motion.g>
                  );
                })}
                {/* Live tip halo */}
                <motion.circle
                  cx="326"
                  cy="27"
                  r="11"
                  fill="url(#heroTipGlow)"
                  animate={{ opacity: [0.45, 0.95, 0.45], scale: [0.85, 1.15, 0.85] }}
                  transition={{ duration: 2.6, repeat: Infinity, ease: 'easeInOut' }}
                  style={{ transformOrigin: '326px 27px' }}
                />
                <circle cx="326" cy="27" r="2.8" fill="#F5C451" />
              </svg>
            </div>
          </div>
        </div>
      </motion.div>

      {/* 4-Column KPI Row */}
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.28, delay: 0.08 }}
          whileHover={{ y: -2 }}
          className="rounded-2xl bg-white border border-slate-200 hover:border-amber-300 transition-colors p-5"
        >
          <div className="flex items-center justify-between gap-2">
            <span className="text-xs text-slate-500">ICT Strategy Analyzer</span>
            {user.hasAnalyzer && (
              <span className="w-5 h-5 rounded-full bg-emerald-100 border border-emerald-300 flex items-center justify-center">
                <Check className="w-3 h-3 text-emerald-600" />
              </span>
            )}
          </div>
          <div className="text-lg font-bold text-slate-950 mt-1.5">
            {user.hasAnalyzer ? 'Unlocked and ready' : `$${config.analyzerPriceUsd.toFixed(2)} required`}
          </div>
          <button
            type="button"
            onClick={() => (user.hasAnalyzer ? onNavigate('analyzer') : onUnlock('analyzer'))}
            className="text-xs font-semibold text-amber-700 hover:underline mt-2.5 cursor-pointer"
          >
            {user.hasAnalyzer ? 'Launch ICT Scanner →' : 'Unlock via M-Pesa / Crypto →'}
          </button>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.28, delay: 0.14 }}
          whileHover={{ y: -2 }}
          className="rounded-2xl bg-white border border-slate-200 hover:border-amber-300 transition-colors p-5"
        >
          <div className="text-xs text-slate-500">MQL5 EA Bots and MT5</div>
          <div className="text-lg font-bold text-slate-950 mt-1.5">
            {user.hasEaBots
              ? user.mt5Connected
                ? `MT5 ${user.mt5Login}`
                : 'Ready to connect'
              : `$${config.eaBotsPriceUsd.toFixed(2)} required`}
          </div>
          <button
            type="button"
            onClick={() => (user.hasEaBots ? onNavigate('eabots') : onUnlock('ea_bots'))}
            className="text-xs font-semibold text-amber-700 hover:underline mt-2.5 cursor-pointer"
          >
            {user.hasEaBots
              ? user.mt5Connected
                ? 'Manage MT5 Auto-Trading →'
                : 'Connect Client MT5 Account →'
              : 'Buy EA Bots Pack →'}
          </button>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.28, delay: 0.2 }}
          whileHover={{ y: -2 }}
          className="rounded-2xl bg-white border border-slate-200 hover:border-amber-300 transition-colors p-5"
        >
          <div className="text-xs text-slate-500">Journal performance</div>
          <div
            className={`text-lg font-bold font-mono tabular-nums mt-1.5 ${
              totalPnl >= 0 ? 'text-amber-600' : 'text-rose-600'
            }`}
          >
            {totalPnl >= 0 ? '+' : '-'}${Math.abs(totalPnl).toFixed(2)}
          </div>
          <button
            type="button"
            onClick={() => onNavigate('journal')}
            className="text-xs font-semibold text-slate-600 hover:text-slate-950 mt-2.5 cursor-pointer"
          >
            {journal.length} logged trade{journal.length === 1 ? '' : 's'} →
          </button>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.28, delay: 0.26 }}
          whileHover={{ y: -2 }}
          className="rounded-2xl bg-white border border-slate-200 hover:border-amber-300 transition-colors p-5"
        >
          <div className="text-xs text-slate-500">Orders and referrals</div>
          <div className="text-lg font-bold font-mono tabular-nums text-slate-950 mt-1.5">
            {orders.length} order{orders.length === 1 ? '' : 's'}
          </div>
          <button
            type="button"
            onClick={() => onNavigate('referrals')}
            className="text-xs font-semibold text-amber-700 hover:underline mt-2.5 cursor-pointer"
          >
            Earn {config.commissionPct}% commissions →
          </button>
        </motion.div>
      </div>

      {/* Market Overview Table & Right Rail */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.34, delay: 0.22 }}
          className="lg:col-span-8 rounded-2xl bg-white border border-slate-200 p-6"
        >
          <div className="flex flex-wrap items-center justify-between gap-2 mb-4">
            <div className="flex flex-wrap items-center gap-2.5">
              <h2 className="text-base font-bold text-slate-950">Market overview</h2>
              {marketStatus && (
                <span className="text-xs font-mono text-slate-500">
                  · TradingView {marketStatus.openCount}/{marketStatus.totalCount} open
                </span>
              )}
            </div>
            <button
              type="button"
              onClick={() => onNavigate('charts')}
              className="text-xs font-semibold text-amber-700 hover:underline cursor-pointer"
            >
              Open TradingView charts →
            </button>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b border-slate-200 text-xs text-slate-500">
                  <th className="py-2.5 pr-4 font-medium">Symbol</th>
                  <th className="py-2.5 pr-4 font-medium">Instrument</th>
                  <th className="py-2.5 pr-4 font-medium">TradingView Session</th>
                  <th className="py-2.5 pr-4 text-right font-medium">Price</th>
                  <th className="py-2.5 pr-4 text-right font-medium">24h</th>
                  <th className="py-2.5 text-right font-medium">Trend</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {quotes.map((q, idx) => {
                  const up = q.chgPct >= 0;
                  const sparkPoints = getSparklinePoints(q.chgPct, idx + 1);
                  const dir = tickDirs[q.sym];
                  const statusLabel = q.marketStatusLabel || (q.isMarketOpen === true ? 'Open' : q.isMarketOpen === false ? 'Closed' : '—');
                  const statusClass =
                    q.isMarketOpen === true
                      ? 'text-emerald-700'
                      : q.isMarketOpen === false
                      ? 'text-slate-500'
                      : 'text-slate-400';
                  return (
                    <tr
                      key={q.sym}
                      onClick={() => onOpenSymbolChart(q.sym)}
                      className="group hover:bg-amber-50/50 transition-colors cursor-pointer"
                    >
                      <td className="py-3 pr-4 font-mono font-bold text-slate-950 group-hover:text-amber-700 transition-colors whitespace-nowrap">
                        {q.sym}
                      </td>
                      <td className="py-3 pr-4 text-slate-600 text-xs whitespace-nowrap">{q.name}</td>
                      <td className={`py-3 pr-4 text-xs font-medium whitespace-nowrap ${statusClass}`}>
                        {statusLabel}
                      </td>
                      <td className="py-3 pr-4 text-right font-mono tabular-nums font-semibold text-slate-900 whitespace-nowrap">
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
                        className={`py-3 pr-4 text-right font-mono tabular-nums font-semibold whitespace-nowrap ${
                          up ? 'text-emerald-600' : 'text-rose-600'
                        }`}
                      >
                        {up ? '+' : ''}
                        {q.chgPct.toFixed(2)}%
                      </td>
                      <td className="py-2.5 text-right">
                        <svg
                          viewBox="0 0 76 20"
                          className="w-16 h-5 inline-block transition-transform duration-200 group-hover:scale-105"
                          aria-hidden="true"
                        >
                          <motion.polyline
                            fill="none"
                            stroke={up ? '#22C55E' : '#EF4444'}
                            strokeWidth="1.6"
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            points={sparkPoints}
                            initial={{ pathLength: 0, opacity: 0.4 }}
                            animate={{ pathLength: 1, opacity: 1 }}
                            transition={{ duration: 0.65, delay: 0.15 + idx * 0.05 }}
                          />
                        </svg>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </motion.div>

        <div className="lg:col-span-4 space-y-5">
          {/* Warm Amber Gold Telegram Card */}
          <motion.div
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.34, delay: 0.28 }}
            whileHover={{ y: -2 }}
            className="rounded-2xl bg-[#E5A93C] text-[#090806] p-6"
          >
            <div className="text-xs font-semibold text-[#3F2D0B] mb-1">JakoyoFX Trading Desk</div>
            <h3 className="text-lg font-bold tracking-tight mb-2">Join our Telegram community</h3>
            <p className="text-xs text-[#2B1E06] leading-relaxed mb-5">
              Trade alongside fellow ICT and SMC traders, review live killzone setups, and get fast EA setup help.
            </p>
            <motion.a
              whileHover={{ scale: 1.01 }}
              whileTap={{ scale: 0.985 }}
              href={config.telegramUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="w-full py-2.5 px-4 bg-[#0B0A08] text-white text-xs font-semibold rounded-lg hover:bg-[#1A1813] inline-flex items-center justify-center gap-2 transition-colors"
            >
              <Send className="w-3.5 h-3.5 text-[#E5A93C]" />
              Open t.me/JakoyoFx
            </motion.a>
          </motion.div>

          {/* Killzones (NY time) Card */}
          <motion.div
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.34, delay: 0.34 }}
            className="rounded-2xl bg-white border border-slate-200 p-5 space-y-3.5"
          >
            <div className="flex items-center justify-between gap-2">
              <h3 className="text-sm font-bold text-slate-950">Killzones (NY time)</h3>
              <span className="text-xs font-mono tabular-nums text-amber-700">{killzone.nyTimeFormatted} NY</span>
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
                          className="absolute inset-y-0 w-1/2 bg-gradient-to-r from-transparent via-white/45 to-transparent animate-killzone-shimmer"
                        />
                      )}
                    </div>
                    <div
                      className={`text-[11px] font-medium ${
                        isActive ? 'text-slate-950' : 'text-slate-500'
                      }`}
                    >
                      {seg.label}
                    </div>
                  </div>
                );
              })}
            </div>

            <div className="text-xs text-slate-600 pt-0.5 font-mono tabular-nums">
              {killzone.detail}
            </div>
          </motion.div>
        </div>
      </div>
    </div>
  );
};

