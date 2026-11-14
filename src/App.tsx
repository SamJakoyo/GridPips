import React, { useCallback, useEffect, useState } from 'react';
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
  Sparkles,
  Film,
  Box,
} from 'lucide-react';
import { getRedirectResult, signOut } from 'firebase/auth';
import { apiFetch, clearSessionToken, setSessionToken, INITIAL_MARKET_QUOTES, type MarketSymbolQuote } from './lib/api';
import { auth } from './lib/firebase';
import { getSupabaseClient } from './lib/supabase';
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
import { GeminiDeskView, MediaStudioView } from './components/AiStudioViews';
import { ThreeLiquidityScene } from './components/ThreeLiquidityScene';
import { BrandLogo } from './components/BrandLogo';

type WorkspaceTab =
  | 'overview'
  | 'analyzer'
  | 'eabots'
  | 'orders'
  | 'aichat'
  | 'mediastudio'
  | 'liquidity3d'
  | 'charts'
  | 'journal'
  | 'analytics'
  | 'calculators'
  | 'paper'
  | 'plan'
  | 'calendar'
  | 'education'
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
  mpesaTillNumber: '5984120',
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
  const [orders, setOrders] = useState<Order[]>([]);
  const [journal, setJournal] = useState<JournalTrade[]>([]);
  const [watchlist, setWatchlist] = useState<string[]>(['EURUSD', 'GBPUSD', 'XAUUSD', 'NAS100', 'BTCUSD']);

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
        const redirectCred = await getRedirectResult(auth).catch(() => null);
        if (redirectCred?.user) {
          const idToken = await redirectCred.user.getIdToken();
          const fbRes = await fetch('/api/auth/firebase-session', {
            method: 'POST',
            credentials: 'include',
            headers: {
              'Content-Type': 'application/json',
              Authorization: `Bearer ${idToken}`,
            },
            body: JSON.stringify({ referralCode: ref ? ref.trim().toUpperCase() : '' }),
          });
          const fbData = await fbRes.json().catch(() => ({}));
          if (fbRes.ok && fbData.user) {
            if (fbData.sessionToken) setSessionToken(fbData.sessionToken);
            setUser(fbData.user);
            setScreen('workspace');
            loadUserWorkspaceData();
            return;
          }
          if (fbRes.status === 409 && fbData.needsExnessOnboarding) {
            setPendingGoogleOAuth({
              provider: 'firebase',
              uid: redirectCred.user.uid,
              email: fbData.email || redirectCred.user.email || '',
              name: fbData.name || redirectCred.user.displayName || 'Trader',
              accessToken: idToken,
            });
            setAuthMode('register');
            setScreen('auth');
            return;
          }
        }
        const sb = getSupabaseClient(cfg.supabaseUrl, cfg.supabaseAnonKey);
        if (sb) {
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
              body: JSON.stringify({}),
            });
            const sbSessionData = await res.json().catch(() => ({}));
            if (res.ok && sbSessionData.user) {
              if (sbSessionData.sessionToken) setSessionToken(sbSessionData.sessionToken);
              setUser(sbSessionData.user);
              setScreen('workspace');
              loadUserWorkspaceData();
            }
          }
        }
      })
      .finally(() => setBooting(false));
  }, [loadUserWorkspaceData]);

  // Smooth market quote tick
  useEffect(() => {
    const id = setInterval(() => {
      setQuotes((prev) =>
        prev.map((q) => {
          const delta = q.price * (Math.random() * 0.0012 - 0.0006);
          const nextPrice = Number((q.price + delta).toFixed(q.digits));
          const nextChg = Number((q.chgPct + (Math.random() * 0.06 - 0.03)).toFixed(2));
          return { ...q, price: nextPrice, chgPct: nextChg };
        })
      );
    }, 4000);
    return () => clearInterval(id);
  }, []);

  async function handleLogout() {
    clearSessionToken();
    await apiFetch('/api/auth/logout', { method: 'POST' }).catch(() => {});
    await signOut(auth).catch(() => {});
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
      <div className="min-h-screen bg-[#050505] flex items-center justify-center text-sm font-mono text-amber-400">
        Initializing Grid Pips Workspace...
      </div>
    );
  }

  if (screen === 'landing') {
    return (
      <LandingPage
        config={config}
        user={user}
        quotes={quotes}
        onGoAuth={(mode) => {
          setAuthMode(mode);
          setScreen('auth');
        }}
        onGoWorkspace={() => setScreen('workspace')}
        onSelectProduct={(product) => {
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
      label: 'Trading Desk',
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
      label: 'AI & 3D Studio',
      items: [
        { id: 'aichat', name: 'Gemini Desk', icon: <Sparkles className="w-4 h-4" /> },
        { id: 'mediastudio', name: 'Media Studio', icon: <Film className="w-4 h-4" /> },
        { id: 'liquidity3d', name: '3D Liquidity Lab', icon: <Box className="w-4 h-4" /> },
      ],
    },
    {
      label: 'Free Workspace',
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
      label: 'Partner & Account',
      items: [
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

  return (
    <div className="min-h-screen bg-slate-50 flex">
      {/* Desktop Sidebar */}
      <aside className="hidden lg:flex lg:w-64 lg:flex-col bg-white border-r border-slate-200 sticky top-0 h-screen">
        <div className="h-16 px-4 border-b border-slate-200 flex items-center justify-between gap-2">
          <button
            onClick={() => setScreen('landing')}
            className="cursor-pointer shrink-0"
          >
            <BrandLogo variant="dark" size="sm" />
          </button>
          <span className="text-[11px] font-mono text-slate-500 truncate">{user.exnessAccountId}</span>
        </div>

        <nav className="flex-1 overflow-y-auto p-3 space-y-5">
          {navGroups.map((group) => (
            <div key={group.label}>
              <div className="px-3 text-xs font-semibold text-slate-400 mb-1.5">{group.label}</div>
              <div className="space-y-0.5">
                {group.items.map((item) => {
                  const isActive = activeTab === item.id;
                  return (
                    <button
                      key={item.id}
                      onClick={() => setActiveTab(item.id)}
                      className={`w-full flex items-center justify-between px-3 py-2 rounded-lg text-xs font-semibold transition-colors cursor-pointer ${
                        isActive
                          ? 'bg-slate-950 text-white'
                          : 'text-slate-700 hover:bg-slate-100'
                      }`}
                    >
                      <span className="flex items-center gap-2.5">
                        {item.icon}
                        <span>{item.name}</span>
                      </span>
                      {item.tag && (
                        <span
                          className={`font-mono text-[11px] ${
                            isActive
                              ? 'text-blue-300'
                              : item.tag === 'Active'
                              ? 'text-emerald-700'
                              : 'text-blue-600'
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

        <div className="p-4 border-t border-slate-200 space-y-2">
          <a
            href={config.telegramUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="w-full py-2 px-3 bg-slate-100 text-slate-900 text-xs font-semibold rounded-lg hover:bg-slate-200 flex items-center justify-between"
          >
            <span className="inline-flex items-center gap-2">
              <Send className="w-3.5 h-3.5 text-blue-600" />
              JakoyoFX Telegram
            </span>
            <ArrowUpRight className="w-3.5 h-3.5" />
          </a>
          <button
            onClick={handleLogout}
            className="w-full py-2 px-3 text-xs font-semibold text-slate-600 hover:text-rose-700 flex items-center gap-2 cursor-pointer"
          >
            <LogOut className="w-3.5 h-3.5" />
            Sign Out ({user.name.split(' ')[0]})
          </button>
        </div>
      </aside>

      {/* Mobile Drawer */}
      {mobileMenuOpen && (
        <div className="fixed inset-0 z-50 lg:hidden flex">
          <div
            className="fixed inset-0 bg-slate-950/50"
            onClick={() => setMobileMenuOpen(false)}
          />
          <div className="relative w-72 bg-white h-full overflow-y-auto p-4 z-10 flex flex-col justify-between">
            <div>
              <div className="flex items-center justify-between pb-4 mb-4 border-b border-slate-200">
                <BrandLogo variant="dark" size="sm" />
                <button
                  onClick={() => setMobileMenuOpen(false)}
                  className="p-1.5 text-slate-500"
                  aria-label="Close menu"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
              <div className="space-y-4">
                {navGroups.map((group) => (
                  <div key={group.label}>
                    <div className="px-2 text-xs font-semibold text-slate-400 mb-1">
                      {group.label}
                    </div>
                    {group.items.map((item) => (
                      <button
                        key={item.id}
                        onClick={() => {
                          setActiveTab(item.id);
                          setMobileMenuOpen(false);
                        }}
                        className={`w-full flex items-center justify-between px-3 py-2.5 rounded-lg text-xs font-semibold ${
                          activeTab === item.id ? 'bg-slate-950 text-white' : 'text-slate-700'
                        }`}
                      >
                        <span className="flex items-center gap-2.5">
                          {item.icon}
                          <span>{item.name}</span>
                        </span>
                        {item.tag && <span className="font-mono">{item.tag}</span>}
                      </button>
                    ))}
                  </div>
                ))}
              </div>
            </div>
            <button
              onClick={handleLogout}
              className="mt-6 w-full py-2.5 border border-slate-200 rounded-lg text-xs font-semibold text-rose-700"
            >
              Sign Out
            </button>
          </div>
        </div>
      )}

      {/* Main Content Area */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Top Context Header */}
        <header className="sticky top-0 z-30 h-16 bg-white border-b border-slate-200 px-6 flex items-center justify-between gap-4">
          <div className="flex items-center gap-3 min-w-0">
            <button
              onClick={() => setMobileMenuOpen(true)}
              className="lg:hidden p-2 -ml-2 text-slate-700"
              aria-label="Open navigation"
            >
              <Menu className="w-5 h-5" />
            </button>
            <div className="text-sm font-semibold text-slate-950 truncate">
              Workspace / <span className="text-blue-600">{currentTabTitle}</span>
            </div>
          </div>

          <div className="flex items-center gap-3 shrink-0">
            <a
              href={config.exnessIbUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="hidden sm:inline-flex items-center gap-1.5 px-3 py-1.5 border border-slate-300 text-xs font-semibold text-slate-800 rounded-lg hover:bg-slate-50 whitespace-nowrap"
            >
              Exness Portal
              <ArrowUpRight className="w-3.5 h-3.5" />
            </a>
            {!user.hasAnalyzer && (
              <button
                onClick={() => setCheckoutState({ productKey: 'analyzer' })}
                className="px-3.5 py-1.5 bg-blue-600 text-white text-xs font-semibold rounded-lg hover:bg-blue-700 whitespace-nowrap cursor-pointer"
              >
                Unlock ICT ($5.25)
              </button>
            )}
          </div>
        </header>

        <main className="p-6 max-w-7xl w-full mx-auto flex-1">
          {activeTab === 'overview' && (
            <WorkspaceOverview
              user={user}
              config={config}
              quotes={quotes}
              journal={journal}
              orders={orders}
              onNavigate={setActiveTab}
              onUnlock={(productKey) => setCheckoutState({ productKey })}
            />
          )}
          {activeTab === 'analyzer' && (
            <IctAnalyzerView
              user={user}
              config={config}
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
              onResumePayment={(ord) =>
                setCheckoutState({ productKey: ord.product_key, existingOrder: ord })
              }
              onBuyNew={(productKey) => setCheckoutState({ productKey })}
            />
          )}
          {activeTab === 'aichat' && <GeminiDeskView />}
          {activeTab === 'mediastudio' && <MediaStudioView />}
          {activeTab === 'liquidity3d' && (
            <ThreeLiquidityScene onExit={() => setActiveTab('overview')} />
          )}
          {activeTab === 'charts' && (
            <TradingViewChartsView watchlist={watchlist} onUpdateWatchlist={handleUpdateWatchlist} />
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
          {activeTab === 'referrals' && <ReferralsHubView config={config} />}
          {activeTab === 'emails' && <EmailsInboxView />}
          {activeTab === 'admin' && user.role === 'admin' && (
            <AdminDashboardView onConfigSaved={loadConfig} />
          )}
        </main>
      </div>

      {checkoutState && (
        <CheckoutModal
          productKey={checkoutState.productKey}
          config={config}
          existingOrder={checkoutState.existingOrder}
          onClose={() => setCheckoutState(null)}
          onUnlocked={(updatedUser) => {
            setUser(updatedUser);
            setCheckoutState(null);
            loadUserWorkspaceData();
            setActiveTab(checkoutState.productKey === 'ea_bots' ? 'eabots' : 'analyzer');
          }}
        />
      )}
    </div>
  );
}

const WorkspaceOverview: React.FC<{
  user: User;
  config: PublicConfig;
  quotes: MarketSymbolQuote[];
  journal: JournalTrade[];
  orders: Order[];
  onNavigate: (tab: WorkspaceTab) => void;
  onUnlock: (productKey: 'analyzer' | 'ea_bots') => void;
}> = ({ user, config, quotes, journal, orders, onNavigate, onUnlock }) => {
  const totalPnl = journal.reduce((acc, t) => acc + Number(t.pnl || 0), 0);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-950">Welcome back, {user.name.split(' ')[0]}</h1>
          <p className="text-sm text-slate-500">
            Exness ID: <span className="font-mono text-slate-800">{user.exnessAccountId}</span> · Referral Code:{' '}
            <span className="font-mono text-blue-600">{user.referralCode}</span>
          </p>
        </div>
      </div>

      {/* Top KPI Row */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-white border border-slate-200 rounded-xl p-5">
          <div className="text-xs text-slate-500">ICT Strategy Analyzer</div>
          <div className="text-lg font-bold text-slate-950 mt-1">
            {user.hasAnalyzer ? 'Unlocked & Ready' : `$${config.analyzerPriceUsd.toFixed(2)} Required`}
          </div>
          <button
            onClick={() => (user.hasAnalyzer ? onNavigate('analyzer') : onUnlock('analyzer'))}
            className="text-xs font-semibold text-blue-600 hover:underline mt-2 cursor-pointer"
          >
            {user.hasAnalyzer ? 'Launch ICT Scanner →' : 'Unlock via M-Pesa / Crypto ($5.25) →'}
          </button>
        </div>

        <div className="bg-white border border-slate-200 rounded-xl p-5">
          <div className="text-xs text-slate-500">MQL5 EA Bots &amp; MT5</div>
          <div className="text-lg font-bold text-slate-950 mt-1">
            {user.hasEaBots
              ? user.mt5Connected
                ? `MT5 ${user.mt5Login}`
                : 'Ready to Connect'
              : `$${config.eaBotsPriceUsd.toFixed(2)} Required`}
          </div>
          <button
            onClick={() => (user.hasEaBots ? onNavigate('eabots') : onUnlock('ea_bots'))}
            className="text-xs font-semibold text-blue-600 hover:underline mt-2 cursor-pointer"
          >
            {user.hasEaBots ? 'Download .mq5 & Bridge →' : 'Buy EA Bots Pack →'}
          </button>
        </div>

        <div className="bg-white border border-slate-200 rounded-xl p-5">
          <div className="text-xs text-slate-500">Journal Performance</div>
          <div
            className={`text-lg font-bold font-mono tabular-nums mt-1 ${
              totalPnl >= 0 ? 'text-emerald-700' : 'text-rose-700'
            }`}
          >
            {totalPnl >= 0 ? '+' : ''}${totalPnl.toFixed(2)}
          </div>
          <button
            onClick={() => onNavigate('journal')}
            className="text-xs font-semibold text-slate-600 hover:text-slate-950 mt-2 cursor-pointer"
          >
            {journal.length} logged trade(s) →
          </button>
        </div>

        <div className="bg-white border border-slate-200 rounded-xl p-5">
          <div className="text-xs text-slate-500">Orders &amp; Referrals</div>
          <div className="text-lg font-bold font-mono tabular-nums text-slate-950 mt-1">
            {orders.length} Order(s)
          </div>
          <button
            onClick={() => onNavigate('referrals')}
            className="text-xs font-semibold text-slate-600 hover:text-slate-950 mt-2 cursor-pointer"
          >
            Earn {config.commissionPct}% Commissions →
          </button>
        </div>
      </div>

      {/* Market Overview Table & Community */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        <div className="lg:col-span-8 bg-white border border-slate-200 rounded-xl p-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-base font-bold text-slate-950">Market Overview</h2>
            <button
              onClick={() => onNavigate('charts')}
              className="text-xs font-semibold text-blue-600 hover:underline cursor-pointer"
            >
              Open TradingView Charts →
            </button>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b border-slate-200 text-xs text-slate-500">
                  <th className="py-2 pr-4">Symbol</th>
                  <th className="py-2 pr-4">Instrument</th>
                  <th className="py-2 pr-4 text-right">Price</th>
                  <th className="py-2 text-right">24h Change</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {quotes.map((q) => {
                  const up = q.chgPct >= 0;
                  return (
                    <tr key={q.sym} className="hover:bg-slate-50">
                      <td className="py-2.5 pr-4 font-mono font-bold text-slate-950">{q.sym}</td>
                      <td className="py-2.5 pr-4 text-slate-600 text-xs">{q.name}</td>
                      <td className="py-2.5 pr-4 text-right font-mono tabular-nums font-semibold">
                        {q.price.toFixed(q.digits)}
                      </td>
                      <td
                        className={`py-2.5 text-right font-mono tabular-nums font-semibold ${
                          up ? 'text-emerald-700' : 'text-rose-700'
                        }`}
                      >
                        {up ? '+' : ''}
                        {q.chgPct.toFixed(2)}%
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>

        <div className="lg:col-span-4 space-y-4">
          <div className="bg-slate-950 text-white rounded-xl p-6">
            <div className="text-xs font-medium text-blue-400 mb-1">JakoyoFX Trading Desk</div>
            <h3 className="text-lg font-bold mb-2">Join Our Telegram Community</h3>
            <p className="text-xs text-slate-300 leading-relaxed mb-4">
              Connect with fellow ICT &amp; SMC traders, review live Killzone setups, and get fast EA setup assistance.
            </p>
            <a
              href={config.telegramUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="w-full py-2.5 px-4 bg-blue-600 text-white text-xs font-semibold rounded-lg hover:bg-blue-700 inline-flex items-center justify-center gap-2"
            >
              <Send className="w-3.5 h-3.5" />
              Open t.me/JakoyoFx
            </a>
          </div>

          <div className="bg-white border border-slate-200 rounded-xl p-6">
            <h3 className="text-sm font-bold text-slate-950 mb-1">Free ICT &amp; SMC Education</h3>
            <p className="text-xs text-slate-600 mb-3">
              Watch ICT channel {config.ictYoutubeChannelId} lessons and Smart Money Concepts modules.
            </p>
            <button
              onClick={() => onNavigate('education')}
              className="w-full py-2 border border-slate-300 text-slate-800 text-xs font-semibold rounded-lg hover:bg-slate-50 cursor-pointer"
            >
              Open Academy
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
