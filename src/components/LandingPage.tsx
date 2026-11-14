import React, { useEffect, useState } from 'react';
import { ArrowUpRight, ShieldCheck, Send, CheckCircle2, X, Pause, Play } from 'lucide-react';
import { LANDING_IMAGES } from '../assets/landingImages';
import { BrandLogo, type BrandAccent } from './BrandLogo';
import type { PublicConfig, User } from '../types';
import type { MarketSymbolQuote } from '../lib/api';

interface LandingPageProps {
  config: PublicConfig;
  user: User | null;
  quotes: MarketSymbolQuote[];
  onGoAuth: (mode: 'login' | 'register') => void;
  onGoWorkspace: () => void;
  onSelectProduct: (product: 'analyzer' | 'ea_bots') => void;
}

type LegalDocKey = 'risk' | 'affiliate' | 'terms' | 'privacy';
type ThemeKey = 'crimson' | 'gold' | 'navy' | 'emerald' | 'mono';

interface ThemeTokens {
  id: ThemeKey;
  label: string;
  swatch: string;
  logoAccent: BrandAccent;
  heroBg: string;
  bandBg: string;
  headerBg: string;
  cardDarkBg: string;
  borderDark: string;
  accentTextOnDark: string;
  accentTextOnLight: string;
  ctaBtn: string;
  cardHighlightBorder: string;
  secondaryBtnDark: string;
  quoteUpText: string;
  quoteDownText: string;
  modalCloseBtn: string;
}

const THEME_PRESETS: Record<ThemeKey, ThemeTokens> = {
  gold: {
    id: 'gold',
    label: 'Sovereign Gold',
    swatch: '#d97706',
    logoAccent: 'gold',
    heroBg: 'bg-stone-950',
    bandBg: 'bg-neutral-950',
    headerBg: 'bg-stone-950/95',
    cardDarkBg: 'bg-stone-950',
    borderDark: 'border-stone-800',
    accentTextOnDark: 'text-amber-400',
    accentTextOnLight: 'text-amber-700',
    ctaBtn: 'bg-amber-600 hover:bg-amber-700 text-white',
    cardHighlightBorder: 'border-2 border-amber-500',
    secondaryBtnDark: 'bg-stone-900 border border-stone-700 hover:bg-stone-800 text-white',
    quoteUpText: 'text-amber-300',
    quoteDownText: 'text-rose-400',
    modalCloseBtn: 'bg-amber-600 hover:bg-amber-700 text-white',
  },
  crimson: {
    id: 'crimson',
    label: 'Crimson Black',
    swatch: '#dc2626',
    logoAccent: 'red',
    heroBg: 'bg-black',
    bandBg: 'bg-neutral-950',
    headerBg: 'bg-black/95',
    cardDarkBg: 'bg-black',
    borderDark: 'border-neutral-800',
    accentTextOnDark: 'text-red-500',
    accentTextOnLight: 'text-red-600',
    ctaBtn: 'bg-red-600 hover:bg-red-700 text-white',
    cardHighlightBorder: 'border-2 border-red-600',
    secondaryBtnDark: 'bg-neutral-900 border border-neutral-700 hover:bg-neutral-800 text-white',
    quoteUpText: 'text-white',
    quoteDownText: 'text-red-500',
    modalCloseBtn: 'bg-red-600 hover:bg-red-700 text-white',
  },
  navy: {
    id: 'navy',
    label: 'Institutional Navy',
    swatch: '#2563eb',
    logoAccent: 'blue',
    heroBg: 'bg-slate-950',
    bandBg: 'bg-slate-900',
    headerBg: 'bg-slate-950/95',
    cardDarkBg: 'bg-slate-950',
    borderDark: 'border-slate-800',
    accentTextOnDark: 'text-blue-400',
    accentTextOnLight: 'text-blue-600',
    ctaBtn: 'bg-blue-600 hover:bg-blue-700 text-white',
    cardHighlightBorder: 'border-2 border-blue-500',
    secondaryBtnDark: 'bg-slate-900 border border-slate-700 hover:bg-slate-800 text-white',
    quoteUpText: 'text-emerald-400',
    quoteDownText: 'text-rose-400',
    modalCloseBtn: 'bg-blue-600 hover:bg-blue-700 text-white',
  },
  emerald: {
    id: 'emerald',
    label: 'Emerald Carbon',
    swatch: '#059669',
    logoAccent: 'emerald',
    heroBg: 'bg-zinc-950',
    bandBg: 'bg-neutral-950',
    headerBg: 'bg-zinc-950/95',
    cardDarkBg: 'bg-zinc-950',
    borderDark: 'border-zinc-800',
    accentTextOnDark: 'text-emerald-400',
    accentTextOnLight: 'text-emerald-700',
    ctaBtn: 'bg-emerald-600 hover:bg-emerald-700 text-white',
    cardHighlightBorder: 'border-2 border-emerald-500',
    secondaryBtnDark: 'bg-zinc-900 border border-zinc-700 hover:bg-zinc-800 text-white',
    quoteUpText: 'text-emerald-400',
    quoteDownText: 'text-rose-400',
    modalCloseBtn: 'bg-emerald-600 hover:bg-emerald-700 text-white',
  },
  mono: {
    id: 'mono',
    label: 'Swiss Mono',
    swatch: '#ffffff',
    logoAccent: 'mono',
    heroBg: 'bg-black',
    bandBg: 'bg-neutral-950',
    headerBg: 'bg-black/95',
    cardDarkBg: 'bg-black',
    borderDark: 'border-neutral-800',
    accentTextOnDark: 'text-neutral-300',
    accentTextOnLight: 'text-neutral-900',
    ctaBtn: 'bg-white hover:bg-neutral-200 text-black',
    cardHighlightBorder: 'border-2 border-white',
    secondaryBtnDark: 'bg-neutral-900 border border-neutral-700 hover:bg-neutral-800 text-white',
    quoteUpText: 'text-white',
    quoteDownText: 'text-neutral-400',
    modalCloseBtn: 'bg-black hover:bg-neutral-800 text-white',
  },
};

const HERO_FRAMES = [
  {
    src: LANDING_IMAGES.heroTrader3d,
    alt: '3D quantitative forex trader analyzing candlestick markets at an architectural desk',
    caption: 'Execution Desk · ICT Killzone Mapping',
  },
  {
    src: LANDING_IMAGES.analystIct3d,
    alt: '3D strategist inspecting smart money liquidity pools and fair value gaps',
    caption: 'Liquidity Analysis · BSL & FVG Structure',
  },
  {
    src: LANDING_IMAGES.automatorEa3d,
    alt: '3D algorithmic engineer developing MQL5 automated trading bots',
    caption: 'MQL5 Automation · MetaTrader 5 Bridge',
  },
];

const LEGAL_DOCS: Record<LegalDocKey, { title: string; paragraphs: string[] }> = {
  risk: {
    title: 'Risk Disclosure',
    paragraphs: [
      'Trading foreign exchange (Forex), CFDs, commodities, indices, and cryptocurrencies on margin carries a high level of risk and may not be suitable for all investors. Leverage can amplify both profits and losses.',
      'GRIDPIPs provides market structure education, ICT analytical software, and MQL5 Expert Advisor source templates for informational and automation research purposes only. Nothing on this platform constitutes personalized financial or investment advice.',
      'Past backtest or live performance of any ICT strategy or MQL5 Expert Advisor does not guarantee future results. Only trade with capital you can afford to lose.',
    ],
  },
  affiliate: {
    title: 'Exness IB & Influencer Affiliate Disclosure',
    paragraphs: [
      'GRIDPIPs operates as an Introducing Broker (IB) partner for Exness. All client trading accounts, deposits, withdrawals, and order executions are handled directly by Exness under their regulated brokerage terms.',
      'Influencers and partners who refer new traders using their GRIDPIPs referral link earn a commission percentage (default 20%) on qualifying $5.25 software module purchases.',
    ],
  },
  terms: {
    title: 'Terms of Service',
    paragraphs: [
      'Access to the free trading workspace and paid $5.25 pro modules (ICT Strategy Market Analyzer and MQL5 EA Bots Pack) is granted to registered members upon Exness IB onboarding confirmation.',
      'Paid software licenses grant single-trader personal usage rights to the downloadable MQL5 (.mq5) source files and ICT Analyzer engine. Redistribution, commercial reselling, or unauthorized reverse-engineering is prohibited.',
      'Members agree to maintain accurate account credentials and refrain from automated scraping, credential stuffing, or unauthorized API probing.',
    ],
  },
  privacy: {
    title: 'Privacy Policy & Security',
    paragraphs: [
      'GRIDPIPs stores only the account details necessary to operate your trading workspace, journal records, Exness IB verification, order receipts, and referral commissions.',
      'Passwords are protected with scrypt key derivation and per-user cryptographic salts. Sessions use HMAC-SHA256 signed HTTP-only cookies alongside Helmet security headers and strict rate limiting.',
      'We do not sell personal trader data to third parties. Automated notifications for registrations, payments, MT5 bindings, and payouts are stored securely in your member Email Inbox.',
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
  const [failed, setFailed] = React.useState(false);
  if (failed) {
    return (
      <div className={`bg-gradient-to-br from-neutral-950 to-black flex items-center justify-center p-6 text-neutral-300 text-sm ${className || ''}`}>
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
  onGoAuth,
  onGoWorkspace,
  onSelectProduct,
}) => {
  const [themeKey, setThemeKey] = useState<ThemeKey>(() => {
    try {
      const saved = localStorage.getItem('gridpips_landing_theme_v2') as ThemeKey | null;
      return saved && THEME_PRESETS[saved] ? saved : 'gold';
    } catch {
      return 'gold';
    }
  });
  const [legalDoc, setLegalDoc] = useState<LegalDocKey | null>(null);
  const [heroMotionActive, setHeroMotionActive] = useState(true);
  const [frameIndex, setFrameIndex] = useState(0);
  const [nyClock, setNyClock] = useState(() => getNyClock());

  const theme = THEME_PRESETS[themeKey];

  function handleSelectTheme(next: ThemeKey) {
    setThemeKey(next);
    try {
      localStorage.setItem('gridpips_landing_theme_v2', next);
    } catch {
      // ignore storage failure
    }
  }

  // Live NY clock update (1s) + gentle living picture crossfade (8s) when active
  useEffect(() => {
    const clockId = setInterval(() => {
      setNyClock(getNyClock());
    }, 1000);
    return () => clearInterval(clockId);
  }, []);

  useEffect(() => {
    if (!heroMotionActive) return;
    const frameId = setInterval(() => {
      setFrameIndex((i) => (i + 1) % HERO_FRAMES.length);
    }, 7500);
    return () => clearInterval(frameId);
  }, [heroMotionActive]);

  const goldQuote = quotes.find((q) => q.sym === 'XAUUSD') || quotes[0];
  const eurQuote = quotes.find((q) => q.sym === 'EURUSD') || quotes[1];

  return (
    <div className={`min-h-screen ${theme.heroBg} text-white`}>
      {/* Calm Static Live Market Quote Bar (Reduced Motion) */}
      <div className={`${theme.heroBg} text-white border-b ${theme.borderDark} py-2`}>
        <div className="max-w-7xl mx-auto px-6 flex items-center justify-between gap-4 overflow-x-auto">
          <div className="flex items-center gap-6 whitespace-nowrap">
            {quotes.slice(0, 5).map((q) => {
              const up = q.chgPct >= 0;
              return (
                <span
                  key={q.sym}
                  className="inline-flex items-center gap-2 text-xs font-mono tabular-nums"
                >
                  <span className="font-semibold text-white">{q.sym}</span>
                  <span className="text-neutral-300">{q.price.toFixed(q.digits)}</span>
                  <span className={up ? theme.quoteUpText : theme.quoteDownText}>
                    {up ? '+' : ''}
                    {q.chgPct.toFixed(2)}%
                  </span>
                </span>
              );
            })}
          </div>
          <span className="hidden lg:inline-block text-xs font-mono tabular-nums text-neutral-400 shrink-0">
            NY EST {nyClock}
          </span>
        </div>
      </div>

      {/* Strict 3-Zone Top Bar Contract */}
      <header className={`sticky top-0 z-40 ${theme.headerBg} backdrop-blur-md border-b ${theme.borderDark}`}>
        <div className="max-w-7xl mx-auto px-6 h-16 flex items-center justify-between gap-8">
          <a href="#top" className="shrink-0">
            <BrandLogo variant="light" accent={theme.logoAccent} size="md" />
          </a>

          <nav className="hidden md:flex items-center gap-7 text-sm font-medium text-neutral-300">
            <a
              href="#capabilities"
              className="hover:text-white transition-colors whitespace-nowrap shrink-0"
            >
              Capabilities
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
              Education
            </a>
            <a
              href={config.telegramUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="hover:text-white transition-colors whitespace-nowrap shrink-0"
            >
              Community
            </a>
          </nav>

          <div className="flex items-center gap-3 shrink-0">
            <button
              onClick={() => (user ? onGoWorkspace() : onGoAuth('register'))}
              className={`px-4 py-2 text-sm font-semibold rounded-lg transition-colors whitespace-nowrap shrink-0 cursor-pointer ${theme.ctaBtn}`}
            >
              {user ? 'Open Workspace' : 'Access Workspace'}
            </button>
          </div>
        </div>
      </header>

      {/* Hero Split with Live Animated Picture & Theme Switcher */}
      <section id="top" className={`${theme.heroBg} text-white border-b ${theme.borderDark}`}>
        <div className="max-w-7xl mx-auto px-6 py-12 lg:py-16">
          {/* Curated Theme Selector Bar */}
          <div className="mb-10 pb-5 border-b border-neutral-800/80 flex flex-wrap items-center justify-between gap-3">
            <span className="text-xs font-medium text-neutral-400">
              Select Workspace Aesthetic
            </span>
            <div className="flex flex-wrap items-center gap-1.5" role="group" aria-label="Landing page theme">
              {(Object.values(THEME_PRESETS) as ThemeTokens[]).map((preset) => {
                const active = preset.id === themeKey;
                return (
                  <button
                    key={preset.id}
                    type="button"
                    onClick={() => handleSelectTheme(preset.id)}
                    className={`px-3 py-1.5 rounded-lg text-xs font-medium inline-flex items-center gap-2 transition-colors whitespace-nowrap shrink-0 cursor-pointer border ${
                      active
                        ? 'bg-white text-black border-white'
                        : 'bg-neutral-900/80 text-neutral-300 border-neutral-800 hover:border-neutral-600 hover:text-white'
                    }`}
                  >
                    <span
                      className="w-2.5 h-2.5 rounded-full border border-black/20 shrink-0"
                      style={{ backgroundColor: preset.swatch }}
                    />
                    <span>{preset.label}</span>
                  </button>
                );
              })}
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-12 gap-10 items-stretch">
            <div className="lg:col-span-6 flex flex-col justify-center">
              <p className={`text-xs font-semibold tracking-wide mb-3 ${theme.accentTextOnDark}`}>
                GRIDPIPs · Exness IB Partner · ICT &amp; MQL5 Automation
              </p>
              <h1
                className="text-white font-bold tracking-tight mb-5"
                style={{ fontSize: 'clamp(2.25rem, 4vw, 3.65rem)', lineHeight: 1.08, textWrap: 'balance' }}
              >
                Institutional ICT market analysis and MQL5 automation in one trading desk.
              </h1>
              <p className="text-base lg:text-lg text-neutral-300 leading-relaxed mb-8 max-w-xl">
                Scan Fair Value Gaps, Order Blocks, and Killzones with our ${config.analyzerPriceUsd.toFixed(2)} ICT Analyzer, run verified MQL5 Expert Advisors directly on MT5, and use our trading journal, 8 risk calculators, and paper trading workspace free through your Exness account.
              </p>
              <div className="flex flex-wrap items-center gap-4">
                <button
                  onClick={() => (user ? onGoWorkspace() : onGoAuth('register'))}
                  className={`px-6 py-3.5 text-sm font-semibold rounded-lg transition-colors inline-flex items-center gap-2 whitespace-nowrap cursor-pointer ${theme.ctaBtn}`}
                >
                  {user ? 'Launch Trading Workspace' : 'Open Exness & Start Free'}
                  <ArrowUpRight className="w-4 h-4" />
                </button>
                <a
                  href={config.telegramUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className={`px-5 py-3.5 text-sm font-semibold rounded-lg transition-colors inline-flex items-center gap-2 whitespace-nowrap ${theme.secondaryBtnDark}`}
                >
                  <Send className={`w-4 h-4 ${theme.accentTextOnDark}`} />
                  Join JakoyoFX Telegram
                </a>
              </div>
              <div className="mt-6 flex flex-wrap items-center gap-x-4 gap-y-2 text-xs text-neutral-400">
                <span>Crypto accepted (USDT TRC20/ERC20, BTC)</span>
                <span aria-hidden="true">·</span>
                <span>Full MQL5 source code included</span>
                <span aria-hidden="true">·</span>
                <span>{config.commissionPct}% Influencer Referral Program</span>
              </div>
            </div>

            {/* Live Animated 3D Picture Frame */}
            <div className="lg:col-span-6">
              <div className={`relative h-full min-h-[360px] lg:min-h-[450px] rounded-xl overflow-hidden border ${theme.borderDark} bg-black`}>
                {HERO_FRAMES.map((frame, idx) => {
                  const isActive = idx === frameIndex;
                  return (
                    <img
                      key={frame.src}
                      src={frame.src}
                      alt={frame.alt}
                      referrerPolicy="no-referrer"
                      className={`absolute inset-0 w-full h-full object-cover transition-opacity duration-1000 ${
                        isActive ? 'opacity-100' : 'opacity-0 pointer-events-none'
                      } ${
                        heroMotionActive
                          ? 'animate-hero-picture'
                          : 'animate-hero-picture animate-hero-picture-paused'
                      }`}
                    />
                  );
                })}

                {/* Measured Dark Scrim with Calm Live Telemetry & Picture Controls */}
                <div className="absolute inset-x-0 bottom-0 p-5 bg-gradient-to-t from-black via-black/75 to-transparent flex flex-wrap items-end justify-between gap-4">
                  <div>
                    <div className="text-xs font-medium text-neutral-300">
                      {HERO_FRAMES[frameIndex].caption}
                    </div>
                    <div className="mt-1 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs font-mono tabular-nums text-white">
                      {goldQuote && (
                        <span>
                          XAUUSD {goldQuote.price.toFixed(goldQuote.digits)}
                        </span>
                      )}
                      {eurQuote && (
                        <span className="text-neutral-300">
                          EURUSD {eurQuote.price.toFixed(eurQuote.digits)}
                        </span>
                      )}
                      <span className="text-neutral-400">NY {nyClock}</span>
                    </div>
                  </div>

                  <div className="flex items-center gap-2">
                    <div className="flex items-center gap-1 bg-black/70 border border-neutral-700 rounded-lg p-1">
                      {HERO_FRAMES.map((_, idx) => (
                        <button
                          key={idx}
                          type="button"
                          onClick={() => setFrameIndex(idx)}
                          aria-label={`Show live picture frame ${idx + 1}`}
                          className={`px-2 py-1 text-[11px] font-mono rounded-md transition-colors cursor-pointer ${
                            idx === frameIndex ? 'bg-white text-black font-semibold' : 'text-neutral-300 hover:text-white'
                          }`}
                        >
                          0{idx + 1}
                        </button>
                      ))}
                    </div>
                    <button
                      type="button"
                      onClick={() => setHeroMotionActive((m) => !m)}
                      className="px-3 py-1.5 bg-black/75 border border-neutral-700 hover:border-neutral-500 text-white text-xs font-medium rounded-lg inline-flex items-center gap-1.5 cursor-pointer whitespace-nowrap"
                    >
                      {heroMotionActive ? <Pause className="w-3.5 h-3.5" /> : <Play className="w-3.5 h-3.5" />}
                      {heroMotionActive ? 'Pause' : 'Play'}
                    </button>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* 4-Column Key Platform Strip */}
          <div className={`mt-12 pt-10 border-t ${theme.borderDark} grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6`}>
            <div>
              <div className="text-2xl font-bold font-mono tabular-nums text-white">
                ${config.analyzerPriceUsd.toFixed(2)}
              </div>
              <div className="text-sm font-semibold text-white mt-1">ICT Strategy Analyzer</div>
              <p className="text-xs text-neutral-400 mt-1">
                FVG, Order Blocks, BSL/SSL sweeps, OTE Fibs, and Killzone bias.
              </p>
            </div>
            <div>
              <div className="text-2xl font-bold font-mono tabular-nums text-white">
                ${config.eaBotsPriceUsd.toFixed(2)}
              </div>
              <div className="text-sm font-semibold text-white mt-1">MQL5 EA Bots + MT5 Bridge</div>
              <p className="text-xs text-neutral-400 mt-1">
                Download compilable .mq5 source code, setup guide, and connect MT5.
              </p>
            </div>
            <div>
              <div className="text-2xl font-bold font-mono tabular-nums text-white">Free</div>
              <div className="text-sm font-semibold text-white mt-1">Core Trading Workspace</div>
              <p className="text-xs text-neutral-400 mt-1">
                Journal, analytics, 8 calculators, $10k paper trading, and TradingView charts.
              </p>
            </div>
            <div>
              <div className={`text-2xl font-bold font-mono tabular-nums ${theme.accentTextOnDark}`}>
                {config.commissionPct}%
              </div>
              <div className="text-sm font-semibold text-white mt-1">Influencer Commissions</div>
              <p className="text-xs text-neutral-400 mt-1">
                Earn instant referral credit on every $5.25 software license.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* Capabilities Asymmetric Bento (Crisp White Contrast Band) */}
      <section id="capabilities" className="bg-white text-black py-16 lg:py-20">
        <div className="max-w-7xl mx-auto px-6">
          <div className="max-w-2xl mb-12">
            <p className={`text-xs font-semibold mb-2 ${theme.accentTextOnLight}`}>Core Architecture</p>
            <h2 className="text-3xl font-bold tracking-tight text-black" style={{ textWrap: 'balance' }}>
              Built for Inner Circle Trader precision and automated MT5 execution.
            </h2>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
            {/* Card 1: ICT Analyzer */}
            <div className="lg:col-span-7 bg-white border border-neutral-200 rounded-xl overflow-hidden flex flex-col">
              <div className="h-64 sm:h-72 overflow-hidden bg-black border-b border-neutral-200">
                <ImageWithFallback
                  src={LANDING_IMAGES.analystIct3d}
                  alt="3D female market strategist reviewing ICT smart money charts"
                  className="w-full h-full object-cover object-top"
                />
              </div>
              <div className="p-7 flex-1 flex flex-col justify-between">
                <div>
                  <div className={`text-xs font-semibold mb-2 ${theme.accentTextOnLight}`}>
                    01. Market Intelligence · ${config.analyzerPriceUsd.toFixed(2)} One-Time License
                  </div>
                  <h3 className="text-xl font-bold text-black mb-2">
                    ICT Strategy Market Analyzer
                  </h3>
                  <p className="text-sm text-neutral-600 leading-relaxed mb-5">
                    Engineered around the Inner Circle Trader methodology (YouTube channel {config.ictYoutubeChannelId}). Automatically maps Buy-Side and Sell-Side Liquidity pools, Displacement Fair Value Gaps, Order Blocks, Optimal Trade Entry (0.618–0.786), and active London/New York Killzones.
                  </p>
                </div>
                <div className="flex items-center justify-between pt-4 border-t border-neutral-100">
                  <span className="text-xs font-mono text-neutral-500">EURUSD · XAUUSD · NAS100 · BTCUSD</span>
                  <button
                    onClick={() => (user ? onSelectProduct('analyzer') : onGoAuth('register'))}
                    className={`text-sm font-semibold cursor-pointer ${theme.accentTextOnLight}`}
                  >
                    Get ICT Analyzer →
                  </button>
                </div>
              </div>
            </div>

            {/* Card 2: MQL5 EA Bots */}
            <div className="lg:col-span-5 bg-white border border-neutral-200 rounded-xl overflow-hidden flex flex-col">
              <div className="h-64 sm:h-72 overflow-hidden bg-black border-b border-neutral-200">
                <ImageWithFallback
                  src={LANDING_IMAGES.automatorEa3d}
                  alt="3D algorithmic engineer coding MQL5 Expert Advisors"
                  className="w-full h-full object-cover"
                />
              </div>
              <div className="p-7 flex-1 flex flex-col justify-between">
                <div>
                  <div className={`text-xs font-semibold mb-2 ${theme.accentTextOnLight}`}>
                    02. Execution Bots · ${config.eaBotsPriceUsd.toFixed(2)} Source &amp; Docs
                  </div>
                  <h3 className="text-xl font-bold text-black mb-2">
                    MQL5 Expert Advisors &amp; MT5 Bridge
                  </h3>
                  <p className="text-sm text-neutral-600 leading-relaxed mb-5">
                    Receive two clean, compilable MQL5 (.mq5) bots (ICT Silver Bullet FVG &amp; SMC Liquidity Sweep), complete step-by-step MetaTrader 5 installation documentation, and direct MT5 WebRequest bridge telemetry inside your GRIDPIPs dashboard.
                  </p>
                </div>
                <div className="flex items-center justify-between pt-4 border-t border-neutral-100">
                  <span className="text-xs font-mono text-neutral-500">.mq5 Source + Setup Guide</span>
                  <button
                    onClick={() => (user ? onSelectProduct('ea_bots') : onGoAuth('register'))}
                    className={`text-sm font-semibold cursor-pointer ${theme.accentTextOnLight}`}
                  >
                    Get MQL5 Bots →
                  </button>
                </div>
              </div>
            </div>

            {/* Card 3: Education + Community */}
            <div id="education-preview" className={`lg:col-span-12 ${theme.heroBg} text-white border ${theme.borderDark} rounded-xl overflow-hidden grid grid-cols-1 lg:grid-cols-12`}>
              <div className="lg:col-span-5 h-64 lg:h-auto bg-black">
                <ImageWithFallback
                  src={LANDING_IMAGES.mentorCommunity3d}
                  alt="3D trading mentor presenting Smart Money Concepts liquidity structure"
                  className="w-full h-full object-cover object-top"
                />
              </div>
              <div className="lg:col-span-7 p-8 flex flex-col justify-center">
                <div className={`text-xs font-semibold mb-2 ${theme.accentTextOnDark}`}>
                  03. Free Curriculum &amp; Live Community · Included with Exness Registration
                </div>
                <h3 className="text-2xl font-bold text-white mb-3">
                  ICT Mentorship Curriculum, Smart Money Concepts &amp; JakoyoFX Telegram
                </h3>
                <p className="text-sm text-neutral-300 leading-relaxed mb-6">
                  Study directly from the official ICT YouTube library alongside structured Smart Money Concepts (SMC) breakdowns covering BOS, CHoCH, Inducement, and Mitigation Blocks. Connect with active traders inside our Telegram channel for daily bias discussions.
                </p>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-6 text-sm text-neutral-200">
                  <div className="flex items-start gap-2.5">
                    <CheckCircle2 className={`w-4 h-4 mt-0.5 shrink-0 ${theme.accentTextOnDark}`} />
                    <span>Unlimited Trading Journal with screenshot uploads &amp; analytics</span>
                  </div>
                  <div className="flex items-start gap-2.5">
                    <CheckCircle2 className={`w-4 h-4 mt-0.5 shrink-0 ${theme.accentTextOnDark}`} />
                    <span>$10,000 Paper Trading Simulator &amp; 8 Risk Calculators</span>
                  </div>
                  <div className="flex items-start gap-2.5">
                    <CheckCircle2 className={`w-4 h-4 mt-0.5 shrink-0 ${theme.accentTextOnDark}`} />
                    <span>Official TradingView Advanced Charts &amp; Economic Calendar</span>
                  </div>
                  <div className="flex items-start gap-2.5">
                    <CheckCircle2 className={`w-4 h-4 mt-0.5 shrink-0 ${theme.accentTextOnDark}`} />
                    <span>Automated email confirmations &amp; encrypted session security</span>
                  </div>
                </div>
                <div className="flex flex-wrap gap-3">
                  <button
                    onClick={() => (user ? onGoWorkspace() : onGoAuth('register'))}
                    className={`px-5 py-2.5 text-sm font-semibold rounded-lg transition-colors cursor-pointer ${theme.ctaBtn}`}
                  >
                    Start Free with Exness
                  </button>
                  <a
                    href={config.telegramUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="px-5 py-2.5 border border-neutral-700 text-white text-sm font-semibold rounded-lg hover:border-neutral-500 transition-colors inline-flex items-center gap-2"
                  >
                    Open t.me/JakoyoFx
                    <ArrowUpRight className="w-4 h-4" />
                  </a>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Transparent Pricing */}
      <section id="pricing" className={`py-16 ${theme.bandBg} text-white border-t border-b ${theme.borderDark}`}>
        <div className="max-w-7xl mx-auto px-6">
          <div className="max-w-2xl mb-10">
            <p className={`text-xs font-semibold mb-2 ${theme.accentTextOnDark}`}>Transparent Access</p>
            <h2 className="text-3xl font-bold tracking-tight text-white">
              Free workspace for Exness traders. Two ${config.analyzerPriceUsd.toFixed(2)} pro modules.
            </h2>
            <p className="text-sm text-neutral-400 mt-2">
              Pay quickly with Crypto (USDT TRC20, USDT ERC20, or Bitcoin BTC) and mobile checkout inside your workspace.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <div className={`border ${theme.borderDark} rounded-xl p-7 flex flex-col justify-between ${theme.cardDarkBg}`}>
              <div>
                <div className="text-xs font-medium text-neutral-400 mb-1">For All Exness Registered Traders</div>
                <h3 className="text-lg font-bold text-white">Core Trading Workspace</h3>
                <div className="text-3xl font-bold font-mono tabular-nums text-white my-4">$0</div>
                <ul className="space-y-2.5 text-sm text-neutral-300 mb-6">
                  <li>· TradingView Charts &amp; Watchlist</li>
                  <li>· Unlimited Trading Journal &amp; Analytics</li>
                  <li>· 8 Risk, Lot Size &amp; Margin Calculators</li>
                  <li>· $10,000 Paper Trading Simulator</li>
                  <li>· ICT ({config.ictYoutubeChannelId}) &amp; SMC Lessons</li>
                </ul>
              </div>
              <button
                onClick={() => (user ? onGoWorkspace() : onGoAuth('register'))}
                className={`w-full py-2.5 text-sm font-semibold rounded-lg transition-colors cursor-pointer ${theme.secondaryBtnDark}`}
              >
                {user ? 'Open Workspace' : 'Register via Exness IB'}
              </button>
            </div>

            <div className={`${theme.cardHighlightBorder} rounded-xl p-7 flex flex-col justify-between ${theme.cardDarkBg}`}>
              <div>
                <div className={`text-xs font-semibold mb-1 ${theme.accentTextOnDark}`}>ICT Algorithmic Scanner</div>
                <h3 className="text-lg font-bold text-white">ICT Strategy Market Analyzer</h3>
                <div className="my-4">
                  <span className="text-3xl font-bold font-mono tabular-nums text-white">
                    ${config.analyzerPriceUsd.toFixed(2)}
                  </span>
                </div>
                <ul className="space-y-2.5 text-sm text-neutral-300 mb-6">
                  <li>· Automated FVG (BISI / SIBI) Detection</li>
                  <li>· Bullish &amp; Bearish Order Block Mapping</li>
                  <li>· BSL / SSL Liquidity Sweep Targets</li>
                  <li>· 0.618–0.786 OTE &amp; NY Killzone Timing</li>
                  <li>· Actionable Entry, SL &amp; TP Projections</li>
                </ul>
              </div>
              <button
                onClick={() => (user ? onSelectProduct('analyzer') : onGoAuth('register'))}
                className={`w-full py-2.5 text-sm font-semibold rounded-lg transition-colors cursor-pointer ${theme.ctaBtn}`}
              >
                Get ICT Analyzer — ${config.analyzerPriceUsd.toFixed(2)}
              </button>
            </div>

            <div className="border border-white rounded-xl p-7 flex flex-col justify-between bg-white text-black">
              <div>
                <div className={`text-xs font-semibold mb-1 ${theme.accentTextOnLight}`}>Full MQL5 Source + MT5 Connect</div>
                <h3 className="text-lg font-bold text-black">MQL5 EA Bots Pack</h3>
                <div className="my-4">
                  <span className="text-3xl font-bold font-mono tabular-nums text-black">
                    ${config.eaBotsPriceUsd.toFixed(2)}
                  </span>
                </div>
                <ul className="space-y-2.5 text-sm text-neutral-700 mb-6">
                  <li>· GRIDPIPs ICT Silver Bullet EA (.mq5)</li>
                  <li>· GRIDPIPs SMC Order Block EA (.mq5)</li>
                  <li>· Complete MT5 Installation Guide</li>
                  <li>· Live MT5 Account Bridge Connection</li>
                  <li>· Automated Risk % &amp; Daily Drawdown Guard</li>
                </ul>
              </div>
              <button
                onClick={() => (user ? onSelectProduct('ea_bots') : onGoAuth('register'))}
                className="w-full py-2.5 bg-black text-white text-sm font-semibold rounded-lg hover:bg-neutral-800 transition-colors cursor-pointer"
              >
                Buy MQL5 Bots — ${config.eaBotsPriceUsd.toFixed(2)}
              </button>
            </div>
          </div>
        </div>
      </section>

      {/* Exness IB Banner */}
      <section className="bg-white py-14">
        <div className="max-w-7xl mx-auto px-6">
          <div className={`${theme.heroBg} text-white border ${theme.borderDark} rounded-xl p-8 lg:p-10 flex flex-col lg:flex-row items-start lg:items-center justify-between gap-6`}>
            <div className="max-w-2xl">
              <div className={`flex items-center gap-2 text-xs font-semibold mb-2 ${theme.accentTextOnDark}`}>
                <ShieldCheck className="w-4 h-4" />
                <span>Required Brokerage Onboarding</span>
              </div>
              <h3 className="text-2xl font-bold tracking-tight mb-2 text-white">
                Open your Exness trading account to access GRIDPIPs.
              </h3>
              <p className="text-sm text-neutral-300 leading-relaxed">
                Account creation, deposits, and trade execution occur directly on Exness. Register using our official IB partner link, then link your Exness Account ID to enter both the free workspace and $5.25 pro modules.
              </p>
            </div>
            <div className="flex flex-wrap gap-3 shrink-0">
              <a
                href={config.exnessIbUrl}
                target="_blank"
                rel="noopener noreferrer"
                className={`px-5 py-3 text-sm font-semibold rounded-lg transition-colors inline-flex items-center gap-2 whitespace-nowrap ${theme.ctaBtn}`}
              >
                Open Exness Account
                <ArrowUpRight className="w-4 h-4" />
              </a>
              <button
                onClick={() => onGoAuth('login')}
                className={`px-5 py-3 text-sm font-semibold rounded-lg transition-colors whitespace-nowrap cursor-pointer ${theme.secondaryBtnDark}`}
              >
                Sign In
              </button>
            </div>
          </div>
        </div>
      </section>

      {/* Quiet Footer */}
      <footer className={`${theme.heroBg} text-neutral-400 border-t ${theme.borderDark} py-12`}>
        <div className="max-w-7xl mx-auto px-6 grid grid-cols-1 md:grid-cols-4 gap-8 text-sm">
          <div className="md:col-span-2">
            <BrandLogo variant="light" accent={theme.logoAccent} size="md" className="mb-3" />
            <p className="text-xs text-neutral-400 leading-relaxed max-w-md">
              Risk Disclosure: CFDs and leveraged forex instruments carry a high risk of losing money rapidly. GRIDPIPs provides educational tools, ICT market analysis software, and MQL5 source code templates only. We do not hold client funds or execute brokerage orders.
            </p>
          </div>
          <div>
            <div className="text-xs font-semibold text-white mb-3">Integrations</div>
            <ul className="space-y-2 text-xs">
              <li>
                <a href={config.exnessIbUrl} target="_blank" rel="noopener noreferrer" className="hover:text-white">
                  Exness IB Partner Portal
                </a>
              </li>
              <li>
                <a href={config.telegramUrl} target="_blank" rel="noopener noreferrer" className="hover:text-white">
                  JakoyoFX Telegram Community
                </a>
              </li>
              <li>
                <a
                  href={`https://www.youtube.com/channel/${config.ictYoutubeChannelId}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="hover:text-white"
                >
                  ICT YouTube Mentorship
                </a>
              </li>
            </ul>
          </div>
          <div>
            <div className="text-xs font-semibold text-white mb-3">Access &amp; Compliance</div>
            <ul className="space-y-2 text-xs">
              <li>
                <button onClick={() => onGoAuth('login')} className="hover:text-white cursor-pointer">
                  Member Sign In
                </button>
              </li>
              <li>
                <button onClick={() => onGoAuth('register')} className="hover:text-white cursor-pointer">
                  Exness Account Registration
                </button>
              </li>
              <li>
                <button onClick={() => setLegalDoc('risk')} className="hover:text-white cursor-pointer">
                  Risk Disclosure
                </button>
              </li>
              <li>
                <button onClick={() => setLegalDoc('affiliate')} className="hover:text-white cursor-pointer">
                  Exness IB &amp; Affiliate Terms
                </button>
              </li>
              <li>
                <button onClick={() => setLegalDoc('terms')} className="hover:text-white cursor-pointer">
                  Terms of Service
                </button>
              </li>
              <li>
                <button onClick={() => setLegalDoc('privacy')} className="hover:text-white cursor-pointer">
                  Privacy Policy
                </button>
              </li>
            </ul>
          </div>
        </div>
        <div className="max-w-7xl mx-auto px-6 mt-8 pt-6 border-t border-neutral-900 text-xs text-neutral-500 flex flex-col sm:flex-row justify-between gap-2">
          <span>© 2026 GRIDPIPs. All rights reserved.</span>
          <span>Secured with scrypt hashing, rate limiting, and HTTP-only signed sessions.</span>
        </div>
      </footer>

      {legalDoc && (
        <div className="fixed inset-0 z-50 bg-black/75 flex items-center justify-center p-4">
          <div className="bg-white border border-neutral-200 rounded-xl max-w-lg w-full p-6 space-y-4">
            <div className="flex items-center justify-between border-b border-neutral-100 pb-3">
              <h3 className="text-base font-bold text-black">{LEGAL_DOCS[legalDoc].title}</h3>
              <button
                type="button"
                onClick={() => setLegalDoc(null)}
                className="p-1.5 text-neutral-500 hover:text-black cursor-pointer"
                aria-label="Close legal notice"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="space-y-3 text-xs text-neutral-700 leading-relaxed">
              {LEGAL_DOCS[legalDoc].paragraphs.map((p, idx) => (
                <p key={idx}>{p}</p>
              ))}
            </div>
            <div className="pt-2 flex justify-end">
              <button
                type="button"
                onClick={() => setLegalDoc(null)}
                className={`px-4 py-2 text-xs font-semibold rounded-lg cursor-pointer ${theme.modalCloseBtn}`}
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
