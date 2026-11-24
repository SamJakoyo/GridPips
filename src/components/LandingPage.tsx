import React, { useEffect, useMemo, useState } from 'react';
import {
  ArrowUpRight,
  ShieldCheck,
  CheckCircle2,
  X,
  Play,
  TrendingUp,
  Zap,
  ChevronDown,
  Maximize2,
  Crown,
  Layers,
  Activity,
} from 'lucide-react';
import { LANDING_IMAGES } from '../assets/landingImages';
import { BrandLogo } from './BrandLogo';
import { LiveTradingViewChart } from './LiveTradingViewChart';
import {
  ANALYZER_TIMEFRAMES,
  MARKET_CATALOG_GROUPS,
  type AnalyzerTimeframe,
} from '../lib/tradingTimeframes';
import type { PublicConfig, User } from '../types';
import type { MarketSymbolQuote, TradingViewMarketStatus } from '../lib/api';

interface LandingPageProps {
  config: PublicConfig;
  user: User | null;
  quotes: MarketSymbolQuote[];
  marketStatus?: TradingViewMarketStatus | null;
  onGoAuth: (mode: 'login' | 'register') => void;
  onGoWorkspace: () => void;
  onSelectProduct: (product: 'analyzer' | 'drt_analyzer', symbol?: string, timeframe?: AnalyzerTimeframe) => void;
}

type LegalDocKey = 'risk' | 'affiliate' | 'terms' | 'privacy';

const LEGAL_DOCS: Record<LegalDocKey, { title: string; paragraphs: string[] }> = {
  risk: {
    title: 'Risk Disclosure',
    paragraphs: [
      'Trading foreign exchange (Forex), CFDs, commodities, indices, and cryptocurrencies on margin carries a high level of risk and may not be suitable for all investors. Leverage can amplify both profits and losses.',
      'Grid Pips provides market structure education, the ICT Strategy Market Analyzer, and the DRT (Dealing Range Theory) Strategy Analyzer for informational and analytical research purposes only. Nothing on this platform constitutes personalized financial or investment advice.',
      'Past backtest or live performance of any ICT or DRT strategy setup does not guarantee future results. Only trade with capital you can afford to lose.',
    ],
  },
  affiliate: {
    title: 'Exness IB & Influencer Affiliate Disclosure',
    paragraphs: [
      'Grid Pips operates as an Introducing Broker (IB) partner for Exness. All client trading accounts, deposits, withdrawals, and order executions are handled directly by Exness under their regulated brokerage terms.',
      'Influencers and partners who refer new traders using their Grid Pips referral link earn a recurring commission percentage (default 35%) on every qualifying subscription purchase and renewal.',
    ],
  },
  terms: {
    title: 'Terms of Service',
    paragraphs: [
      'Access to the free trading tools and paid subscription modules (ICT Strategy Market Analyzer and DRT Strategy Market Analyzer, starting at $5.25/month each) is granted to registered members upon Exness IB onboarding confirmation.',
      'Active software subscriptions grant single-trader personal usage rights to the ICT Analyzer engine, the separate DRT Dealing Range Theory engine, dual TradingView mapped charts, and Pine Script exports. Redistribution, commercial reselling, or unauthorized reverse-engineering is prohibited.',
      'Members agree to maintain accurate account credentials and refrain from automated scraping, credential stuffing, or unauthorized API probing.',
    ],
  },
  privacy: {
    title: 'Privacy Policy & Security',
    paragraphs: [
      'Grid Pips stores only the account details necessary to operate your trading account, journal records, Exness IB verification, order receipts, and referral commissions.',
      'Passwords are protected with scrypt key derivation and per-user cryptographic salts. Sessions use HMAC-SHA256 signed HTTP-only cookies alongside Helmet security headers and strict rate limiting.',
      'We do not sell personal trader data to third parties. Automated notifications for registrations, subscription activations, and partner payouts are stored securely in your member Email Inbox.',
    ],
  },
};

function ImageWithFallback({
  src,
  alt,
  className,
}: {
  src: string;
  alt: string;
  className?: string;
}) {
  const [failed, setFailed] = useState(false);
  if (failed) {
    return (
      <div
        className={`bg-gradient-to-br from-[#0B150F] to-[#050907] flex items-center justify-center p-6 text-emerald-200/70 text-sm ${
          className || ''
        }`}
      >
        <span>{alt}</span>
      </div>
    );
  }
  return (
    <img
      src={src}
      alt={alt}
      referrerPolicy="no-referrer"
      onError={() => setFailed(true)}
      className={className}
    />
  );
}

function getNyClock(): string {
  return new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/New_York',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  }).format(new Date());
}

export const LandingPage: React.FC<LandingPageProps> = ({
  config,
  user,
  quotes,
  marketStatus,
  onGoAuth,
  onGoWorkspace,
  onSelectProduct,
}) => {
  const [legalDoc, setLegalDoc] = useState<LegalDocKey | null>(null);
  const [demoOpen, setDemoOpen] = useState(false);
  const [artworkOpen, setArtworkOpen] = useState(false);
  const [nyClock, setNyClock] = useState(() => getNyClock());
  const [freeChartSymbol, setFreeChartSymbol] = useState<string>('EURUSD');
  const [freeChartTf, setFreeChartTf] = useState<AnalyzerTimeframe>('15M');

  const drtPriceUsd = config.drtAnalyzerPriceUsd ?? config.eaBotsPriceUsd;

  useEffect(() => {
    const clockId = setInterval(() => {
      setNyClock(getNyClock());
    }, 1000);
    return () => clearInterval(clockId);
  }, []);

  const featuredQuotes = useMemo(() => {
    const targetSyms = ['EURUSD', 'XAUUSD', 'USOIL', 'SPY', 'NVDA', 'BTCUSD'];
    return targetSyms
      .map((s, i) => quotes.find((q) => q.sym === s) || quotes[i % quotes.length])
      .filter(Boolean);
  }, [quotes]);

  return (
    <div className="min-h-screen bg-[#050907] text-slate-100">
      {/* Strict 3-Zone Obsidian Emerald Top Bar */}
      <header className="sticky top-0 z-40 bg-[#050907]/90 backdrop-blur-md border-b border-emerald-500/15">
        <div className="max-w-7xl mx-auto px-6 h-16 flex items-center justify-between gap-8">
          <a href="#top" className="shrink-0">
            <BrandLogo variant="light" size="md" />
          </a>

          <nav className="hidden md:flex items-center gap-7 text-sm font-medium text-slate-300">
            <a
              href="#top"
              className="text-[#16E563] hover:text-[#2BF074] transition-colors whitespace-nowrap shrink-0 border-b-2 border-[#16E563] pb-0.5"
            >
              Home
            </a>
            <a
              href="#free-chart"
              className="hover:text-white transition-colors whitespace-nowrap shrink-0"
            >
              Markets
            </a>
            <a
              href="#capabilities"
              className="hover:text-white transition-colors whitespace-nowrap shrink-0"
            >
              Analyzers
            </a>
            <a
              href="#pricing"
              className="hover:text-white transition-colors whitespace-nowrap shrink-0"
            >
              Pricing
            </a>
            <a
              href="#education-preview"
              className="hover:text-white transition-colors whitespace-nowrap shrink-0"
            >
              Learn
            </a>
          </nav>

          <div className="flex items-center gap-3 shrink-0">
            <button
              type="button"
              onClick={() => (user ? onGoWorkspace() : onGoAuth('register'))}
              className="px-5 py-2 bg-[#16E563] hover:bg-[#2BF074] text-[#041108] text-sm font-bold rounded-full transition-colors whitespace-nowrap shrink-0 cursor-pointer"
            >
              {user ? 'Open Dashboard →' : 'Get Started →'}
            </button>
          </div>
        </div>
      </header>

      {/* Hero Section — Obsidian Black & Electric Neon Emerald featuring the exact brand artwork */}
      <section
        id="top"
        className="relative overflow-hidden bg-[#050907] text-white border-b border-emerald-500/15"
        style={{
          backgroundImage:
            'radial-gradient(circle at 68% 36%, rgba(22, 229, 99, 0.22), transparent 52%), radial-gradient(circle at 12% 70%, rgba(22, 229, 99, 0.12), transparent 44%)',
        }}
      >
        <div className="relative z-10 max-w-7xl mx-auto px-6 pt-12 pb-10 lg:pt-16 lg:pb-12">
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-10 items-center">
            {/* Left Copy Column */}
            <div className="lg:col-span-5 flex flex-col justify-center">
              <div className="flex items-center gap-2 text-xs font-semibold text-[#16E563] mb-4">
                <Zap className="w-3.5 h-3.5 text-[#16E563]" />
                <span>Trade Smarter. Grow Bigger.</span>
                <span aria-hidden="true" className="text-slate-600">·</span>
                <span className="font-mono tabular-nums text-slate-400">NY {nyClock}</span>
              </div>

              <h1
                className="font-extrabold tracking-tight mb-3"
                style={{ fontSize: 'clamp(2.5rem, 4.4vw, 3.85rem)', lineHeight: 1.04, textWrap: 'balance' }}
              >
                <span className="text-white">Grid</span>
                <span className="text-[#16E563]">pips</span>
              </h1>

              <div className="text-xl sm:text-2xl font-bold tracking-tight text-white mb-5">
                Trade <span className="text-slate-500 mx-1">·</span>{' '}
                <span className="text-[#16E563]">Invest</span>{' '}
                <span className="text-slate-500 mx-1">·</span> Prosper
              </div>

              <p className="text-[15px] lg:text-base font-normal text-slate-300 leading-relaxed mb-8 max-w-lg">
                Your ultimate trading platform for forex, gold, indices, and crypto. Scan live TradingView liquidity sweeps in the ICT Analyzer, map 4-quadrant PD Arrays in the DRT Analyzer, and manage every setup in one desk.
              </p>

              <div className="flex flex-wrap items-center gap-3.5">
                <button
                  type="button"
                  onClick={() => (user ? onGoWorkspace() : onGoAuth('register'))}
                  className="px-6 py-3.5 bg-[#16E563] hover:bg-[#2BF074] text-[#041108] text-sm font-bold rounded-full transition-colors inline-flex items-center gap-2 whitespace-nowrap cursor-pointer shadow-[0_0_28px_rgba(22,229,99,0.28)]"
                >
                  {user ? 'Open Dashboard →' : 'Start Trading Now →'}
                </button>
                <button
                  type="button"
                  onClick={() => setDemoOpen(true)}
                  className="px-5 py-3.5 text-sm font-semibold text-white rounded-full border border-emerald-500/35 hover:border-[#16E563] bg-white/5 hover:bg-white/10 inline-flex items-center gap-2.5 whitespace-nowrap transition-colors cursor-pointer"
                >
                  <Play className="w-4 h-4 text-[#16E563]" />
                  Watch Demo
                </button>
                {!user && (
                  <button
                    type="button"
                    onClick={() => onGoAuth('login')}
                    className="px-4 py-3.5 text-sm font-semibold text-slate-300 hover:text-[#16E563] whitespace-nowrap transition-colors cursor-pointer"
                  >
                    Member Login
                  </button>
                )}
              </div>

              {/* 3-Metric Proof Row */}
              <div className="mt-10 pt-7 border-t border-emerald-500/20 grid grid-cols-3 gap-5 max-w-lg">
                <div className="pr-4 border-r border-emerald-500/15">
                  <div className="flex items-center gap-1.5 text-2xl font-bold font-mono tabular-nums text-[#16E563]">
                    <TrendingUp className="w-4 h-4 shrink-0" />
                    <span>${config.analyzerPriceUsd.toFixed(2)}</span>
                  </div>
                  <div className="text-xs text-slate-400 mt-1">ICT &amp; DRT Analyzers</div>
                </div>
                <div className="pr-4 border-r border-emerald-500/15">
                  <div className="flex items-center gap-1.5 text-2xl font-bold font-mono tabular-nums text-white">
                    <ShieldCheck className="w-4 h-4 shrink-0 text-[#16E563]" />
                    <span>Free</span>
                  </div>
                  <div className="text-xs text-slate-400 mt-1">Exness Desk</div>
                </div>
                <div>
                  <div className="flex items-center gap-1.5 text-2xl font-bold font-mono tabular-nums text-[#F5B82E]">
                    <Zap className="w-4 h-4 shrink-0" />
                    <span>{config.commissionPct}%</span>
                  </div>
                  <div className="text-xs text-slate-400 mt-1">Referral Payout</div>
                </div>
              </div>
            </div>

            {/* Right Column: Exact Uploaded Picture Showcase */}
            <div className="lg:col-span-7 relative">
              <div className="relative rounded-2xl overflow-hidden border border-emerald-500/35 bg-[#070E0A] shadow-[0_24px_70px_rgba(0,0,0,0.75)]">
                <div className="relative bg-[#050907]">
                  <ImageWithFallback
                    src={LANDING_IMAGES.brandHeroArtwork}
                    alt="Grid Pips Trade Invest Prosper platform hero and live dashboard showcase"
                    className="w-full h-auto block object-contain"
                  />
                  <button
                    type="button"
                    onClick={() => setArtworkOpen(true)}
                    aria-label="Inspect full platform artwork"
                    className="absolute top-3 right-3 px-3 py-1.5 rounded-lg bg-[#050907]/85 border border-emerald-500/35 hover:border-[#16E563] text-xs font-semibold text-white inline-flex items-center gap-1.5 cursor-pointer transition-colors"
                  >
                    <Maximize2 className="w-3.5 h-3.5 text-[#16E563]" />
                    <span>Full View</span>
                  </button>
                </div>
                <div className="px-5 py-3 bg-[#09120D] border-t border-emerald-500/15 flex flex-wrap items-center justify-between gap-2 text-xs">
                  <span className="italic text-emerald-200/90 font-medium">
                    &ldquo;Your Financial Freedom Awaits — Dream it. Trade it. Achieve it.&rdquo;
                  </span>
                  <span className="font-mono text-slate-400">
                    ICT Liquidity + Ali Khan DRT Engine
                  </span>
                </div>
              </div>
            </div>
          </div>

          {/* Live TradingView Market Session Summary + 5-Item Quote Strip */}
          {marketStatus && (
            <div className="mt-10 flex flex-wrap items-center justify-between gap-2 text-xs font-mono text-slate-400">
              <span className="font-semibold text-emerald-300">
                TradingView Live Session · {marketStatus.summaryLabel}
              </span>
              <span className="text-[11px] text-slate-400 tabular-nums">
                {marketStatus.openCount}/{marketStatus.totalCount} markets open · Updated{' '}
                {new Date(marketStatus.checkedAt).toLocaleTimeString()}
              </span>
            </div>
          )}

          <div
            className={`${
              marketStatus ? 'mt-3' : 'mt-12'
            } pt-4 pb-3 border-t border-b border-emerald-500/20 grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-4`}
          >
            {featuredQuotes.map((q) => {
              const up = q.chgPct >= 0;
              return (
                <button
                  type="button"
                  key={q.sym}
                  onClick={() => {
                    setFreeChartSymbol(q.sym);
                    document.getElementById('free-chart')?.scrollIntoView({ behavior: 'smooth' });
                  }}
                  title={q.marketStatusLabel ? `${q.sym} · TradingView: ${q.marketStatusLabel}` : q.sym}
                  className="flex items-center justify-between lg:justify-center gap-2.5 text-xs font-mono tabular-nums lg:border-r lg:last:border-r-0 border-emerald-500/15 pr-2 hover:text-[#16E563] transition-colors cursor-pointer"
                >
                  <span className="font-bold text-white">{q.sym}</span>
                  <span className="text-slate-300">{q.price.toFixed(q.digits)}</span>
                  <span className={up ? 'text-[#16E563]' : 'text-rose-400'}>
                    {up ? '▲ +' : '▼ '}
                    {q.chgPct.toFixed(2)}%
                  </span>
                </button>
              );
            })}
          </div>

          <div className="mt-4 flex justify-center">
            <a
              href="#free-chart"
              className="inline-flex items-center gap-1.5 text-xs font-medium text-slate-400 hover:text-[#16E563] transition-colors"
            >
              <ChevronDown className="w-3.5 h-3.5" />
              Open Free Live Market Chart
            </a>
          </div>
        </div>
      </section>

      {/* Free Public Live Market Chart (No Login or Subscription Required) */}
      <section id="free-chart" className="bg-[#080E0B] text-white py-14 border-b border-emerald-500/15">
        <div className="max-w-7xl mx-auto px-6 space-y-5">
          <div className="flex flex-wrap items-end justify-between gap-4">
            <div>
              <p className="text-xs font-semibold text-[#16E563] mb-1">
                Free Live Terminal · No Account Required
              </p>
              <h2 className="text-2xl sm:text-3xl font-bold tracking-tight text-white">
                Free Live Market Chart (1M to 1W)
              </h2>
            </div>

            <div className="flex flex-wrap items-center gap-2.5">
              <select
                value={freeChartSymbol}
                onChange={(e) => setFreeChartSymbol(e.target.value)}
                aria-label="Free chart symbol"
                className="px-3 py-2 text-xs font-mono font-semibold bg-[#0E1712] border border-emerald-500/25 text-white rounded-lg focus:outline-none focus:border-[#16E563]"
              >
                {MARKET_CATALOG_GROUPS.map((group) => (
                  <optgroup key={group.assetClass} label={group.label} className="bg-[#080E0B] text-emerald-300">
                    {group.items.map((item) => (
                      <option key={item.sym} value={item.sym} className="bg-[#0B120E] text-white">
                        {item.sym} — {item.name}
                      </option>
                    ))}
                  </optgroup>
                ))}
              </select>

              <div className="flex flex-wrap items-center gap-1 p-1 bg-[#0D1611] border border-emerald-500/20 rounded-lg">
                {ANALYZER_TIMEFRAMES.map((tf) => (
                  <button
                    key={tf}
                    type="button"
                    onClick={() => setFreeChartTf(tf)}
                    className={`px-2.5 py-1.5 text-xs font-mono font-semibold rounded-md cursor-pointer whitespace-nowrap shrink-0 transition-colors ${
                      freeChartTf === tf
                        ? 'bg-[#16E563] text-[#041108]'
                        : 'text-slate-400 hover:text-white'
                    }`}
                  >
                    {tf}
                  </button>
                ))}
              </div>

              <button
                type="button"
                onClick={() =>
                  user ? onSelectProduct('analyzer', freeChartSymbol, freeChartTf) : onGoAuth('register')
                }
                className="px-4 py-2 bg-[#16E563] hover:bg-[#2BF074] text-[#041108] text-xs font-bold rounded-lg cursor-pointer whitespace-nowrap shrink-0 transition-colors"
              >
                Scan in ICT Analyzer →
              </button>
              <button
                type="button"
                onClick={() =>
                  user ? onSelectProduct('drt_analyzer', freeChartSymbol, freeChartTf) : onGoAuth('register')
                }
                className="px-4 py-2 bg-[#F5B82E] hover:bg-[#F8C957] text-[#090806] text-xs font-bold rounded-lg cursor-pointer whitespace-nowrap shrink-0 transition-colors"
              >
                Scan in DRT Analyzer →
              </button>
            </div>
          </div>

          <LiveTradingViewChart
            symbol={freeChartSymbol}
            timeframe={freeChartTf}
            heightClass="h-[380px] sm:h-[520px]"
          />
        </div>
      </section>

      {/* Capabilities Bento */}
      <section id="capabilities" className="bg-[#050907] text-white py-16 lg:py-20 border-b border-emerald-500/15">
        <div className="max-w-7xl mx-auto px-6">
          <div className="max-w-2xl mb-10">
            <p className="text-xs font-semibold mb-2 text-[#16E563]">Core Architecture</p>
            <h2 className="text-3xl font-bold tracking-tight text-white" style={{ textWrap: 'balance' }}>
              Two separate institutional analyzers: ICT Liquidity &amp; Ali Khan DRT Dealing Ranges.
            </h2>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
            {/* Card 1: ICT Analyzer */}
            <div className="lg:col-span-6 bg-[#0B120E] border border-emerald-500/20 hover:border-[#16E563]/50 transition-colors rounded-2xl overflow-hidden flex flex-col">
              <div className="h-60 sm:h-68 overflow-hidden bg-[#070D09] border-b border-emerald-500/15 relative">
                <ImageWithFallback
                  src={LANDING_IMAGES.analystIct3d}
                  alt="Market strategist reviewing ICT liquidity pools and fair value gaps"
                  className="w-full h-full object-cover object-top"
                />
                <div className="absolute inset-0 bg-gradient-to-t from-[#0B120E] via-transparent to-transparent" />
              </div>
              <div className="p-7 flex-1 flex flex-col justify-between">
                <div>
                  <div className="text-xs font-semibold mb-2 text-[#16E563]">
                    01. ICT Liquidity Engine · ${config.analyzerPriceUsd.toFixed(2)}/mo Subscription (Save up to 20%)
                  </div>
                  <h3 className="text-xl font-bold text-white mb-2 flex items-center gap-2">
                    <Activity className="w-5 h-5 text-[#16E563] shrink-0" />
                    <span>ICT Strategy Market Analyzer</span>
                  </h3>
                  <p className="text-sm text-slate-300 leading-relaxed mb-5">
                    Engineered around the Inner Circle Trader methodology (YouTube channel {config.ictYoutubeChannelId}). Automatically maps Buy-Side and Sell-Side Liquidity pools, Displacement Fair Value Gaps, Order Blocks, Optimal Trade Entry (0.618–0.786), and active London/New York Killzones.
                  </p>
                </div>
                <div className="flex items-center justify-between pt-4 border-t border-emerald-500/15">
                  <span className="text-xs font-mono text-slate-400">EURUSD · XAUUSD · NAS100 · BTCUSD</span>
                  <button
                    type="button"
                    onClick={() => (user ? onSelectProduct('analyzer') : onGoAuth('register'))}
                    className="text-sm font-semibold cursor-pointer text-[#16E563] hover:text-[#2BF074]"
                  >
                    Subscribe ICT Analyzer →
                  </button>
                </div>
              </div>
            </div>

            {/* Card 2: DRT Analyzer */}
            <div className="lg:col-span-6 bg-[#0B120E] border border-amber-400/25 hover:border-[#F5B82E]/60 transition-colors rounded-2xl overflow-hidden flex flex-col">
              <div className="h-60 sm:h-68 overflow-hidden bg-[#070D09] border-b border-amber-400/15 relative">
                <ImageWithFallback
                  src={LANDING_IMAGES.automatorEa3d}
                  alt="Institutional trader mapping Dealing Range Theory quadrants and PD Arrays"
                  className="w-full h-full object-cover object-top"
                />
                <div className="absolute inset-0 bg-gradient-to-t from-[#0B120E] via-transparent to-transparent" />
              </div>
              <div className="p-7 flex-1 flex flex-col justify-between">
                <div>
                  <div className="text-xs font-semibold mb-2 text-[#F5B82E]">
                    02. Dealing Range Theory · ${drtPriceUsd.toFixed(2)}/mo Subscription (Save up to 20%)
                  </div>
                  <h3 className="text-xl font-bold text-white mb-2 flex items-center gap-2">
                    <Layers className="w-5 h-5 text-[#F5B82E] shrink-0" />
                    <span>DRT Strategy Market Analyzer</span>
                  </h3>
                  <p className="text-sm text-slate-300 leading-relaxed mb-5">
                    Built strictly around Ali Khan ICT&apos;s Dealing Range Theory. Maps 0.00 / 0.25 / 0.50 / 0.75 / 1.00 DRT quadrants, classifies Type 1/2/3 dealing ranges, detects live correlated SMT Divergence, 50% DRT Equilibrium Flips, and Premium vs. Discount PD Arrays (FVG, OB, Breaker &amp; Rejection Blocks).
                  </p>
                </div>
                <div className="flex items-center justify-between pt-4 border-t border-emerald-500/15">
                  <span className="text-xs font-mono text-slate-400">0/25/50/75/100 DRT + SMT + PD Arrays</span>
                  <button
                    type="button"
                    onClick={() => (user ? onSelectProduct('drt_analyzer') : onGoAuth('register'))}
                    className="text-sm font-semibold cursor-pointer text-[#F5B82E] hover:text-amber-300"
                  >
                    Subscribe DRT Analyzer →
                  </button>
                </div>
              </div>
            </div>

            {/* Card 3: Education + Community */}
            <div
              id="education-preview"
              className="lg:col-span-12 bg-[#0B120E] border border-emerald-500/20 rounded-2xl overflow-hidden grid grid-cols-1 lg:grid-cols-12"
            >
              <div className="lg:col-span-5 h-64 lg:h-auto bg-[#070D09] relative">
                <ImageWithFallback
                  src={LANDING_IMAGES.mentorCommunity3d}
                  alt="Trading mentor presenting Smart Money Concepts and Dealing Range structure"
                  className="w-full h-full object-cover object-top"
                />
                <div className="absolute inset-0 bg-gradient-to-r from-transparent via-transparent to-[#0B120E]/80 hidden lg:block" />
              </div>
              <div className="lg:col-span-7 p-8 flex flex-col justify-center">
                <div className="text-xs font-semibold mb-2 text-[#16E563]">
                  03. Free Curriculum &amp; Live Community · Included with Exness Registration
                </div>
                <h3 className="text-2xl font-bold text-white mb-3">
                  ICT Mentorship, Ali Khan DRT Framework &amp; JakoyoFX Telegram
                </h3>
                <p className="text-sm text-slate-300 leading-relaxed mb-6">
                  Study directly from the official ICT YouTube library and Ali Khan&apos;s Dealing Range Theory breakdowns alongside structured Smart Money Concepts (SMC) modules. Connect with active traders inside our Telegram channel for daily killzone bias discussions.
                </p>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-6 text-sm text-slate-200">
                  <div className="flex items-start gap-2.5">
                    <CheckCircle2 className="w-4 h-4 mt-0.5 shrink-0 text-[#16E563]" />
                    <span>Unlimited Trading Journal with screenshot uploads &amp; analytics</span>
                  </div>
                  <div className="flex items-start gap-2.5">
                    <CheckCircle2 className="w-4 h-4 mt-0.5 shrink-0 text-[#16E563]" />
                    <span>$10,000 Paper Trading Simulator &amp; 8 Risk Calculators</span>
                  </div>
                  <div className="flex items-start gap-2.5">
                    <CheckCircle2 className="w-4 h-4 mt-0.5 shrink-0 text-[#16E563]" />
                    <span>Official TradingView Advanced Charts &amp; Economic Calendar</span>
                  </div>
                  <div className="flex items-start gap-2.5">
                    <CheckCircle2 className="w-4 h-4 mt-0.5 shrink-0 text-[#16E563]" />
                    <span>{config.commissionPct}% recurring influencer referral payouts</span>
                  </div>
                </div>
                <div className="flex flex-wrap gap-3">
                  <button
                    type="button"
                    onClick={() => (user ? onGoWorkspace() : onGoAuth('register'))}
                    className="px-5 py-2.5 bg-[#16E563] hover:bg-[#2BF074] text-[#041108] text-sm font-bold rounded-full transition-colors cursor-pointer"
                  >
                    Start Free with Exness
                  </button>
                  <a
                    href={config.telegramUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="px-5 py-2.5 bg-white/5 border border-emerald-500/30 hover:border-[#16E563] text-white text-sm font-semibold rounded-full transition-colors inline-flex items-center gap-2"
                  >
                    Open t.me/JakoyoFx
                    <ArrowUpRight className="w-4 h-4 text-[#16E563]" />
                  </a>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Transparent Pricing */}
      <section id="pricing" className="py-16 bg-[#080E0B] text-white border-b border-emerald-500/15">
        <div className="max-w-7xl mx-auto px-6">
          <div className="max-w-2xl mb-10">
            <p className="text-xs font-semibold mb-2 text-[#16E563]">Transparent Access</p>
            <h2 className="text-3xl font-bold tracking-tight text-white">
              Free trading desk for Exness traders. Two ${config.analyzerPriceUsd.toFixed(2)}/mo pro analyzers.
            </h2>
            <p className="text-sm text-slate-400 mt-2">
              Pay seamlessly with M-Pesa Till ({config.mpesaTillNumber}) or Crypto (USDT TRC20, USDT ERC20, or Bitcoin BTC) inside your dashboard. Save 10% quarterly or 20% annually.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {/* Free Core Desk */}
            <div className="border border-emerald-500/20 rounded-2xl p-7 flex flex-col justify-between bg-[#0B120E]">
              <div>
                <div className="text-xs font-medium text-slate-400 mb-1">For All Exness Registered Traders</div>
                <h3 className="text-lg font-bold text-white">Core Trading Desk</h3>
                <div className="text-3xl font-bold font-mono tabular-nums text-white my-4">$0</div>
                <ul className="space-y-2.5 text-sm text-slate-300 mb-6">
                  <li>· TradingView Charts &amp; Watchlist</li>
                  <li>· Unlimited Trading Journal &amp; Analytics</li>
                  <li>· 8 Risk, Lot Size &amp; Margin Calculators</li>
                  <li>· $10,000 Paper Trading Simulator</li>
                  <li>· ICT &amp; Ali Khan DRT Education Academy</li>
                </ul>
              </div>
              <button
                type="button"
                onClick={() => (user ? onGoWorkspace() : onGoAuth('register'))}
                className="w-full py-2.5 bg-white/5 border border-emerald-500/30 hover:border-[#16E563] text-white text-sm font-semibold rounded-full transition-colors cursor-pointer"
              >
                {user ? 'Open Dashboard' : 'Register via Exness IB'}
              </button>
            </div>

            {/* ICT Analyzer — Electric Neon Emerald */}
            <div className="border-2 border-[#16E563] rounded-2xl p-7 flex flex-col justify-between bg-[#0D1A12] shadow-[0_0_35px_rgba(22,229,99,0.12)]">
              <div>
                <div className="text-xs font-semibold mb-1 text-[#16E563]">ICT Algorithmic Scanner</div>
                <h3 className="text-lg font-bold text-white">ICT Strategy Market Analyzer</h3>
                <div className="my-4">
                  <span className="text-3xl font-bold font-mono tabular-nums text-white">
                    ${config.analyzerPriceUsd.toFixed(2)}
                  </span>
                  <span className="text-xs text-slate-400 ml-1">/month</span>
                </div>
                <ul className="space-y-2.5 text-sm text-slate-200 mb-6">
                  <li>· Automated FVG (BISI / SIBI) Detection</li>
                  <li>· Bullish &amp; Bearish Order Block Mapping</li>
                  <li>· BSL / SSL Liquidity Sweep Targets</li>
                  <li>· 0.618–0.786 OTE &amp; NY Killzone Timing</li>
                  <li>· Dual Live &amp; Mapped TradingView Charts</li>
                </ul>
              </div>
              <button
                type="button"
                onClick={() => (user ? onSelectProduct('analyzer') : onGoAuth('register'))}
                className="w-full py-2.5 bg-[#16E563] hover:bg-[#2BF074] text-[#041108] text-sm font-bold rounded-full transition-colors cursor-pointer"
              >
                Subscribe ICT Analyzer — ${config.analyzerPriceUsd.toFixed(2)}/mo
              </button>
            </div>

            {/* DRT Analyzer — VIP Gold matching the Go Pro card in the artwork */}
            <div className="border-2 border-[#F5B82E]/70 rounded-2xl p-7 flex flex-col justify-between bg-gradient-to-b from-[#1A1508] via-[#11100A] to-[#0B100D]">
              <div>
                <div className="text-xs font-semibold text-[#F5B82E] mb-1 inline-flex items-center gap-1.5">
                  <Crown className="w-3.5 h-3.5" />
                  <span>Ali Khan Dealing Range Theory</span>
                </div>
                <h3 className="text-lg font-bold text-white">DRT Strategy Market Analyzer</h3>
                <div className="my-4">
                  <span className="text-3xl font-bold font-mono tabular-nums text-white">
                    ${drtPriceUsd.toFixed(2)}
                  </span>
                  <span className="text-xs text-slate-400 ml-1">/month</span>
                </div>
                <ul className="space-y-2.5 text-sm text-slate-200 mb-6">
                  <li>· 0.00 / 0.25 / 0.50 / 0.75 / 1.00 DRT Grid</li>
                  <li>· Type 1, Type 2 &amp; Type 3 Dealing Ranges</li>
                  <li>· Live Correlated SMT Divergence Engine</li>
                  <li>· Premium &amp; Discount PD Array Matrix</li>
                  <li>· 50% Equilibrium Flips &amp; DRT Pine Script</li>
                </ul>
              </div>
              <button
                type="button"
                onClick={() => (user ? onSelectProduct('drt_analyzer') : onGoAuth('register'))}
                className="w-full py-2.5 bg-[#F5B82E] hover:bg-[#F8C957] text-[#090806] text-sm font-bold rounded-full transition-colors cursor-pointer"
              >
                Subscribe DRT Analyzer — ${drtPriceUsd.toFixed(2)}/mo
              </button>
            </div>
          </div>
        </div>
      </section>

      {/* Exness IB Banner */}
      <section className="bg-[#050907] py-14 border-b border-emerald-500/15">
        <div className="max-w-7xl mx-auto px-6">
          <div className="bg-[#0B120E] text-white border border-emerald-500/25 rounded-2xl p-8 lg:p-10 flex flex-col lg:flex-row items-start lg:items-center justify-between gap-6">
            <div className="max-w-2xl">
              <div className="flex items-center gap-2 text-xs font-semibold mb-2 text-[#16E563]">
                <ShieldCheck className="w-4 h-4" />
                <span>Required Brokerage Onboarding</span>
              </div>
              <h3 className="text-2xl font-bold tracking-tight mb-2 text-white">
                Open your Exness trading account to access Grid Pips.
              </h3>
              <p className="text-sm text-slate-300 leading-relaxed">
                Account creation, deposits, and trade execution occur directly on Exness. Register using our official IB partner link, then link your Exness Account ID to enter both the free trading tools and ${config.analyzerPriceUsd.toFixed(2)}/mo pro subscription analyzers.
              </p>
            </div>
            <div className="flex flex-wrap gap-3 shrink-0">
              <a
                href={config.exnessIbUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="px-6 py-3 bg-[#16E563] hover:bg-[#2BF074] text-[#041108] text-sm font-bold rounded-full transition-colors inline-flex items-center gap-2 whitespace-nowrap"
              >
                Open Exness Account
                <ArrowUpRight className="w-4 h-4" />
              </a>
              <button
                type="button"
                onClick={() => onGoAuth('login')}
                className="px-6 py-3 bg-white/5 border border-emerald-500/30 hover:border-[#16E563] text-white text-sm font-semibold rounded-full transition-colors whitespace-nowrap cursor-pointer"
              >
                Member Login
              </button>
            </div>
          </div>
        </div>
      </section>

      {/* Quiet Dark Footer */}
      <footer className="bg-[#040705] text-slate-400 py-12">
        <div className="max-w-7xl mx-auto px-6 grid grid-cols-1 md:grid-cols-4 gap-8 text-sm">
          <div className="md:col-span-2">
            <BrandLogo variant="light" size="md" showTagline className="mb-3" />
            <p className="text-xs text-slate-400 leading-relaxed max-w-md">
              Risk Disclosure: CFDs and leveraged forex instruments carry a high risk of losing money rapidly. Grid Pips provides educational tools, the ICT Strategy Market Analyzer, and the DRT Dealing Range Theory Analyzer only. We do not hold client funds or execute brokerage orders.
            </p>
          </div>
          <div>
            <div className="text-xs font-semibold text-white mb-3">Integrations</div>
            <ul className="space-y-2 text-xs">
              <li>
                <a href={config.exnessIbUrl} target="_blank" rel="noopener noreferrer" className="hover:text-[#16E563]">
                  Exness IB Partner Portal
                </a>
              </li>
              <li>
                <a href={config.telegramUrl} target="_blank" rel="noopener noreferrer" className="hover:text-[#16E563]">
                  JakoyoFX Telegram Community
                </a>
              </li>
              <li>
                <a
                  href={`https://www.youtube.com/channel/${config.ictYoutubeChannelId}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="hover:text-[#16E563]"
                >
                  ICT YouTube Mentorship
                </a>
              </li>
              {config.drtYoutubeChannelUrl && (
                <li>
                  <a
                    href={config.drtYoutubeChannelUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="hover:text-[#16E563]"
                  >
                    Ali Khan ICT (DRT Strategy)
                  </a>
                </li>
              )}
            </ul>
          </div>
          <div>
            <div className="text-xs font-semibold text-white mb-3">Access &amp; Compliance</div>
            <ul className="space-y-2 text-xs">
              <li>
                <button type="button" onClick={() => onGoAuth('login')} className="hover:text-[#16E563] cursor-pointer">
                  Member Sign In
                </button>
              </li>
              <li>
                <button type="button" onClick={() => onGoAuth('register')} className="hover:text-[#16E563] cursor-pointer">
                  Exness Account Registration
                </button>
              </li>
              <li>
                <button type="button" onClick={() => setLegalDoc('risk')} className="hover:text-[#16E563] cursor-pointer">
                  Risk Disclosure
                </button>
              </li>
              <li>
                <button type="button" onClick={() => setLegalDoc('affiliate')} className="hover:text-[#16E563] cursor-pointer">
                  Exness IB &amp; Affiliate Terms
                </button>
              </li>
              <li>
                <button type="button" onClick={() => setLegalDoc('terms')} className="hover:text-[#16E563] cursor-pointer">
                  Terms of Service
                </button>
              </li>
              <li>
                <button type="button" onClick={() => setLegalDoc('privacy')} className="hover:text-[#16E563] cursor-pointer">
                  Privacy Policy
                </button>
              </li>
            </ul>
          </div>
        </div>
        <div className="max-w-7xl mx-auto px-6 mt-8 pt-6 border-t border-emerald-500/15 text-xs text-slate-500 flex flex-col sm:flex-row justify-between gap-2">
          <span>© 2026 Grid Pips. All rights reserved.</span>
          <span>Secured with scrypt hashing, rate limiting, and HTTP-only signed sessions.</span>
        </div>
      </footer>

      {/* Fullscreen Exact Artwork Modal */}
      {artworkOpen && (
        <div
          className="fixed inset-0 z-50 bg-black/90 backdrop-blur-sm flex items-center justify-center p-4"
          onClick={() => setArtworkOpen(false)}
        >
          <div
            className="relative max-w-6xl w-full bg-[#080E0B] border border-emerald-500/35 rounded-2xl overflow-hidden"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="px-5 py-3 border-b border-emerald-500/20 flex items-center justify-between">
              <BrandLogo variant="light" size="sm" />
              <button
                type="button"
                onClick={() => setArtworkOpen(false)}
                className="p-1.5 text-slate-400 hover:text-white cursor-pointer"
                aria-label="Close full artwork preview"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <img
              src={LANDING_IMAGES.brandHeroArtwork}
              alt="Grid Pips platform overview"
              referrerPolicy="no-referrer"
              className="w-full max-h-[82vh] object-contain bg-[#050907]"
            />
          </div>
        </div>
      )}

      {/* Watch Demo Modal */}
      {demoOpen && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-[#0B120E] border border-emerald-500/30 rounded-2xl max-w-2xl w-full p-6 space-y-4 text-white">
            <div className="flex items-center justify-between border-b border-emerald-500/20 pb-3">
              <div>
                <h3 className="text-base font-bold text-white">Grid Pips Platform Walkthrough</h3>
                <p className="text-xs text-slate-400">ICT Strategy Market Analyzer + DRT Strategy Market Analyzer</p>
              </div>
              <button
                type="button"
                onClick={() => setDemoOpen(false)}
                className="p-1.5 text-slate-400 hover:text-white cursor-pointer"
                aria-label="Close demo preview"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs text-slate-300">
              <div className="p-4 rounded-xl bg-[#070E0A] border border-emerald-500/20 space-y-2">
                <div className="font-semibold text-[#16E563]">01. Exness Onboarding &amp; Free Desk</div>
                <p>Link your Exness IB account ID once to access TradingView charts, unlimited journal with screenshots, 8 calculators, and $10,000 paper trading.</p>
              </div>
              <div className="p-4 rounded-xl bg-[#070E0A] border border-emerald-500/20 space-y-2">
                <div className="font-semibold text-[#16E563]">02. ${config.analyzerPriceUsd.toFixed(2)}/mo ICT Strategy Analyzer</div>
                <p>Detects London &amp; NY Killzones, Premium/Discount PD Arrays, Fair Value Gaps (BISI/SIBI), Order Blocks, 0.705 OTE Fibs, and BSL/SSL liquidity targets.</p>
              </div>
              <div className="p-4 rounded-xl bg-[#070E0A] border border-amber-400/25 space-y-2">
                <div className="font-semibold text-[#F5B82E]">03. ${drtPriceUsd.toFixed(2)}/mo DRT Strategy Analyzer</div>
                <p>Standalone Ali Khan Dealing Range Theory scanner mapping 0/25/50/75/100 DRT quadrants, Type 1/2/3 ranges, live SMT divergence, 50% equilibrium flips, and PD Arrays.</p>
              </div>
              <div className="p-4 rounded-xl bg-[#070E0A] border border-emerald-500/20 space-y-2">
                <div className="font-semibold text-[#16E563]">04. JakoyoFX Community &amp; {config.commissionPct}% Referrals</div>
                <p>Join t.me/JakoyoFx for daily setup discussions and share your referral link to earn {config.commissionPct}% recurring commission on subscriptions and renewals.</p>
              </div>
            </div>
            <div className="pt-2 flex flex-wrap justify-end gap-3">
              <button
                type="button"
                onClick={() => setDemoOpen(false)}
                className="px-4 py-2 border border-emerald-500/25 text-slate-300 text-xs font-semibold rounded-full hover:text-white cursor-pointer"
              >
                Close
              </button>
              <button
                type="button"
                onClick={() => {
                  setDemoOpen(false);
                  if (user) onGoWorkspace();
                  else onGoAuth('register');
                }}
                className="px-5 py-2 bg-[#16E563] hover:bg-[#2BF074] text-[#041108] text-xs font-bold rounded-full cursor-pointer"
              >
                {user ? 'Open Dashboard →' : 'Start Free with Exness →'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Legal Disclosure Modal */}
      {legalDoc && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-[#0B120E] border border-emerald-500/30 rounded-2xl max-w-lg w-full p-6 space-y-4 text-white">
            <div className="flex items-center justify-between border-b border-emerald-500/20 pb-3">
              <h3 className="text-base font-bold text-white">{LEGAL_DOCS[legalDoc].title}</h3>
              <button
                type="button"
                onClick={() => setLegalDoc(null)}
                className="p-1.5 text-slate-400 hover:text-white cursor-pointer"
                aria-label="Close legal notice"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="space-y-3 text-xs text-slate-300 leading-relaxed">
              {LEGAL_DOCS[legalDoc].paragraphs.map((p, idx) => (
                <p key={idx}>{p}</p>
              ))}
            </div>
            <div className="pt-2 flex justify-end">
              <button
                type="button"
                onClick={() => setLegalDoc(null)}
                className="px-5 py-2 bg-[#16E563] hover:bg-[#2BF074] text-[#041108] text-xs font-bold rounded-full cursor-pointer"
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
