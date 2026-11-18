import React, { useEffect, useMemo, useState } from 'react';
import {
  ArrowUpRight,
  ShieldCheck,
  CheckCircle2,
  X,
  Pause,
  Play,
  TrendingUp,
  Zap,
  ChevronDown,
} from 'lucide-react';
import { LANDING_IMAGES } from '../assets/landingImages';
import { BrandLogo } from './BrandLogo';
import { LiveTradingViewChart } from './LiveTradingViewChart';
import { ANALYZER_TIMEFRAMES, TRADING_SYMBOLS, type AnalyzerTimeframe } from '../lib/tradingTimeframes';
import type { PublicConfig, User } from '../types';
import {
  apiFetch,
  type MarketMiniBar,
  type MarketSymbolQuote,
  type TradingViewMarketStatus,
} from '../lib/api';

interface LandingPageProps {
  config: PublicConfig;
  user: User | null;
  quotes: MarketSymbolQuote[];
  marketStatus?: TradingViewMarketStatus | null;
  onGoAuth: (mode: 'login' | 'register') => void;
  onGoWorkspace: () => void;
  onSelectProduct: (product: 'analyzer' | 'ea_bots', symbol?: string, timeframe?: AnalyzerTimeframe) => void;
}

type LegalDocKey = 'risk' | 'affiliate' | 'terms' | 'privacy';

const HERO_FRAMES = [
  {
    src: LANDING_IMAGES.heroTrader3d,
    alt: '3D quantitative forex trader analyzing candlestick markets at an architectural desk',
    caption: 'Execution Desk · ICT Killzone Mapping',
  },
  {
    src: LANDING_IMAGES.automatorCode3d,
    alt: 'Quantitative developer coding MQL5 Expert Advisors beside live candlestick price charts',
    caption: 'MQL5 Automation · Code & MetaTrader 5 Bridge',
  },
  {
    src: LANDING_IMAGES.gridPipsBanner,
    alt: 'Institutional candlestick liquidity curve across cream and slate editorial canvas',
    caption: 'Liquidity Flow · XAUUSD, Forex & Indices',
  },
];

const LEGAL_DOCS: Record<LegalDocKey, { title: string; paragraphs: string[] }> = {
  risk: {
    title: 'Risk Disclosure',
    paragraphs: [
      'Trading foreign exchange (Forex), CFDs, commodities, indices, and cryptocurrencies on margin carries a high level of risk and may not be suitable for all investors. Leverage can amplify both profits and losses.',
      'Grid Pips provides market structure education, ICT analytical software, and MQL5 Expert Advisor source templates for informational and automation research purposes only. Nothing on this platform constitutes personalized financial or investment advice.',
      'Past backtest or live performance of any ICT strategy or MQL5 Expert Advisor does not guarantee future results. Only trade with capital you can afford to lose.',
    ],
  },
  affiliate: {
    title: 'Exness IB & Influencer Affiliate Disclosure',
    paragraphs: [
      'Grid Pips operates as an Introducing Broker (IB) partner for Exness. All client trading accounts, deposits, withdrawals, and order executions are handled directly by Exness under their regulated brokerage terms.',
      'Influencers and partners who refer new traders using their Grid Pips referral link earn a commission percentage (default 20%) on qualifying $5.25 software module purchases.',
    ],
  },
  terms: {
    title: 'Terms of Service',
    paragraphs: [
      'Access to the free trading tools and paid $5.25 pro modules (ICT Strategy Market Analyzer and MQL5 EA Bots Pack) is granted to registered members upon Exness IB onboarding confirmation.',
      'Paid software licenses grant single-trader personal usage rights to the downloadable MQL5 (.mq5) source files and ICT Analyzer engine. Redistribution, commercial reselling, or unauthorized reverse-engineering is prohibited.',
      'Members agree to maintain accurate account credentials and refrain from automated scraping, credential stuffing, or unauthorized API probing.',
    ],
  },
  privacy: {
    title: 'Privacy Policy & Security',
    paragraphs: [
      'Grid Pips stores only the account details necessary to operate your trading account, journal records, Exness IB verification, order receipts, and referral commissions.',
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
  marketStatus,
  onGoAuth,
  onGoWorkspace,
  onSelectProduct,
}) => {
  const [legalDoc, setLegalDoc] = useState<LegalDocKey | null>(null);
  const [demoOpen, setDemoOpen] = useState(false);
  const [heroMotionActive, setHeroMotionActive] = useState(true);
  const [frameIndex, setFrameIndex] = useState(0);
  const [phoneTf, setPhoneTf] = useState<'1D' | '1W' | '1M' | '3M' | '1Y'>('1D');
  const [phoneSymIndex, setPhoneSymIndex] = useState(0);
  const [miniBars, setMiniBars] = useState<MarketMiniBar[]>([]);
  const [miniBarsLoading, setMiniBarsLoading] = useState(true);
  const [nyClock, setNyClock] = useState(() => getNyClock());
  const [freeChartSymbol, setFreeChartSymbol] = useState<string>('EURUSD');
  const [freeChartTf, setFreeChartTf] = useState<AnalyzerTimeframe>('1M');

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
    }, 7000);
    return () => clearInterval(frameId);
  }, [heroMotionActive]);

  const featuredQuotes = useMemo(() => {
    const targetSyms = ['XAUUSD', 'EURUSD', 'BTCUSD', 'NAS100', 'GBPUSD'];
    return targetSyms
      .map((s, i) => quotes.find((q) => q.sym === s) || quotes[i % quotes.length])
      .filter(Boolean);
  }, [quotes]);

  const phoneQuote = featuredQuotes[phoneSymIndex % Math.max(1, featuredQuotes.length)] || quotes[0];
  const phoneSymbol = phoneQuote?.sym || 'XAUUSD';

  useEffect(() => {
    let cancelled = false;
    const loadMiniBars = async () => {
      try {
        const res = await apiFetch<{ bars: MarketMiniBar[] }>(
          `/api/market/mini-candles?symbol=${encodeURIComponent(phoneSymbol)}&tf=${encodeURIComponent(phoneTf)}`
        );
        if (!cancelled && Array.isArray(res.bars)) {
          setMiniBars(res.bars.slice(-12));
        }
      } catch {
        if (!cancelled) {
          setMiniBars([]);
        }
      } finally {
        if (!cancelled) {
          setMiniBarsLoading(false);
        }
      }
    };

    setMiniBarsLoading(true);
    loadMiniBars();
    if (!heroMotionActive) {
      return () => {
        cancelled = true;
      };
    }
    const pollId = setInterval(loadMiniBars, 20000);
    return () => {
      cancelled = true;
      clearInterval(pollId);
    };
  }, [phoneSymbol, phoneTf, heroMotionActive]);

  const normalizedPhoneCandles = useMemo(() => {
    if (!miniBars.length) return [];
    const highs = miniBars.map((b) => b.high);
    const lows = miniBars.map((b) => b.low);
    const maxHigh = Math.max(...highs);
    const minLow = Math.min(...lows);
    const span = Math.max(maxHigh - minLow, 1e-9);
    const toY = (price: number) => 66 - ((price - minLow) / span) * 58;
    return miniBars.map((b) => ({
      yHigh: toY(b.high),
      yLow: toY(b.low),
      yOpen: toY(b.open),
      yClose: toY(b.close),
      bull: b.close >= b.open,
    }));
  }, [miniBars]);

  return (
    <div className="min-h-screen bg-[#F7F5F0] text-slate-950">
      {/* Strict 3-Zone Top Bar Contract */}
      <header className="sticky top-0 z-40 bg-white/95 backdrop-blur-md border-b border-slate-200">
        <div className="max-w-7xl mx-auto px-6 h-16 flex items-center justify-between gap-6">
          <a href="#top" className="shrink-0">
            <BrandLogo variant="dark" size="md" />
          </a>

          <nav className="hidden md:flex items-center gap-7 text-sm font-semibold text-slate-600">
            <a
              href="#top"
              className="text-slate-950 hover:text-slate-950 transition-colors whitespace-nowrap shrink-0 border-b-2 border-amber-500 pb-0.5"
            >
              Home
            </a>
            <a
              href="#free-chart"
              className="hover:text-slate-950 transition-colors whitespace-nowrap shrink-0"
            >
              Live Chart
            </a>
            <a
              href="#capabilities"
              className="hover:text-slate-950 transition-colors whitespace-nowrap shrink-0"
            >
              Capabilities
            </a>
            <a
              href="#pricing"
              className="hover:text-slate-950 transition-colors whitespace-nowrap shrink-0"
            >
              Pricing
            </a>
            <a
              href="#education-preview"
              className="hover:text-slate-950 transition-colors whitespace-nowrap shrink-0"
            >
              Education
            </a>
          </nav>

          <div className="flex items-center gap-2.5 shrink-0">
            <button
              onClick={() => (user ? onGoWorkspace() : onGoAuth('register'))}
              className="px-5 py-2 bg-amber-400 hover:bg-amber-300 text-black text-sm font-semibold rounded-full transition-colors whitespace-nowrap shrink-0 cursor-pointer"
            >
              {user ? 'Open Dashboard →' : 'Get Started →'}
            </button>
          </div>
        </div>
      </header>

      {/* Hero Section — Warm Ivory & Gold */}
      <section
        id="top"
        className="relative overflow-hidden bg-[#F7F5F0] text-slate-950 border-b border-slate-200"
        style={{
          backgroundImage: 'radial-gradient(circle at 65% 42%, rgba(245, 158, 11, 0.16), transparent 60%)',
        }}
      >
        {/* Live Animated Wireframe Globe, Ascending Gold Trajectory Wave & Pulsing Candlesticks */}
        <svg
          aria-hidden="true"
          viewBox="0 0 1440 620"
          className="pointer-events-none absolute inset-0 w-full h-full opacity-25"
          preserveAspectRatio="xMidYMid slice"
        >
          <defs>
            <linearGradient id="goldWaveGrad" x1="0" y1="0" x2="1" y2="0">
              <stop offset="0%" stopColor="#f59e0b" stopOpacity="0.1" />
              <stop offset="50%" stopColor="#fbbf24" stopOpacity="0.85" />
              <stop offset="100%" stopColor="#fde68a" stopOpacity="0.3" />
            </linearGradient>
          </defs>

          {/* Rotating Golden Globe */}
          <g
            className={heroMotionActive ? 'animate-hero-globe' : 'animate-hero-globe animate-hero-paused'}
            stroke="#fbbf24"
            strokeOpacity="0.45"
            fill="none"
            strokeWidth="1.2"
          >
            <circle cx="960" cy="255" r="205" />
            <circle cx="960" cy="255" r="145" strokeDasharray="6 6" />
            <ellipse cx="960" cy="255" rx="205" ry="74" />
            <ellipse cx="960" cy="255" rx="125" ry="205" />
            <ellipse cx="960" cy="255" rx="52" ry="205" />
            <line x1="755" y1="255" x2="1165" y2="255" />
          </g>

          {/* Live Bullish Gold Momentum Curve */}
          <path
            d="M 40 530 Q 340 490 580 390 T 1060 270 T 1420 120"
            fill="none"
            stroke="url(#goldWaveGrad)"
            strokeWidth="2.5"
            className={heroMotionActive ? 'animate-hero-wave' : 'animate-hero-wave animate-hero-paused'}
          />

          {/* Live Pulsing Ascending Golden Candlesticks */}
          {[
            { x: 180, y: 470, h: 45 },
            { x: 225, y: 455, h: 52 },
            { x: 270, y: 430, h: 68 },
            { x: 315, y: 440, h: 48 },
            { x: 360, y: 405, h: 72 },
            { x: 405, y: 380, h: 85 },
            { x: 450, y: 392, h: 54 },
            { x: 495, y: 350, h: 78 },
            { x: 540, y: 320, h: 92 },
            { x: 1200, y: 265, h: 64 },
            { x: 1245, y: 220, h: 80 },
            { x: 1290, y: 175, h: 96 },
            { x: 1335, y: 190, h: 55 },
            { x: 1380, y: 130, h: 108 },
          ].map((c, idx) => (
            <g
              key={idx}
              className={heroMotionActive ? 'animate-hero-candle' : 'animate-hero-candle animate-hero-paused'}
              style={{ animationDelay: `${idx * 0.22}s` }}
            >
              <line
                x1={c.x + 6}
                y1={c.y - 18}
                x2={c.x + 6}
                y2={c.y + c.h + 18}
                stroke="#f59e0b"
                strokeWidth="1.5"
                strokeOpacity="0.55"
              />
              <rect
                x={c.x}
                y={c.y}
                width="12"
                height={c.h}
                rx="2"
                fill={idx % 2 === 0 ? '#f59e0b' : '#fbbf24'}
                fillOpacity={idx % 3 === 0 ? '0.42' : '0.72'}
              />
            </g>
          ))}
        </svg>

        <div className="relative z-10 max-w-7xl mx-auto px-6 pt-12 pb-8 lg:pt-16 lg:pb-10">
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-10 items-center">
            {/* Left Copy Column */}
            <div className="lg:col-span-6 flex flex-col justify-center">
              <div className="flex items-center gap-2 text-xs font-semibold text-amber-700 mb-5">
                <Zap className="w-3.5 h-3.5 text-amber-600" />
                <span>Trade the Global Markets</span>
                <span aria-hidden="true">·</span>
                <span className="text-slate-600">Grid Pips</span>
              </div>

              <h1
                className="font-bold tracking-tight mb-5"
                style={{ fontSize: 'clamp(2.35rem, 4.3vw, 3.85rem)', lineHeight: 1.06, textWrap: 'balance' }}
              >
                <span className="block text-slate-950">Smarter Trading.</span>
                <span className="block bg-gradient-to-r from-amber-600 via-amber-500 to-amber-700 bg-clip-text text-transparent">
                  Greater Possibilities.
                </span>
              </h1>

              <p className="text-[15px] lg:text-base font-normal text-slate-600 leading-relaxed mb-8 max-w-lg">
                Join Grid Pips — an institutional ICT market analyzer and MQL5 automation platform built for Exness traders, analysts, and automators worldwide.
              </p>

              <div className="flex flex-wrap items-center gap-4">
                <button
                  onClick={() => (user ? onGoWorkspace() : onGoAuth('register'))}
                  className="px-6 py-3.5 bg-amber-400 hover:bg-amber-300 text-black text-sm font-semibold rounded-full transition-colors inline-flex items-center gap-2 whitespace-nowrap cursor-pointer"
                >
                  {user ? 'Open Dashboard →' : 'Start Trading Now →'}
                </button>
                <button
                  type="button"
                  onClick={() => setDemoOpen(true)}
                  className="px-5 py-3.5 text-sm font-semibold text-slate-900 rounded-full border border-slate-300 hover:border-amber-500 bg-white/90 inline-flex items-center gap-2.5 whitespace-nowrap transition-colors cursor-pointer"
                >
                  <Play className="w-4 h-4 text-amber-600" />
                  Watch Demo
                </button>
              </div>

              {/* 3-Metric Bottom Row */}
              <div className="mt-10 pt-7 border-t border-slate-300/80 grid grid-cols-3 gap-6 max-w-lg">
                <div className="pr-4 border-r border-slate-300">
                  <div className="flex items-center gap-1.5 text-2xl font-bold font-mono tabular-nums text-amber-600">
                    <TrendingUp className="w-4 h-4 shrink-0" />
                    <span>${config.analyzerPriceUsd.toFixed(2)}</span>
                  </div>
                  <div className="text-xs text-slate-500 mt-1">ICT &amp; MQL5 Modules</div>
                </div>
                <div className="pr-4 border-r border-slate-300">
                  <div className="flex items-center gap-1.5 text-2xl font-bold font-mono tabular-nums text-amber-600">
                    <ShieldCheck className="w-4 h-4 shrink-0" />
                    <span>Free</span>
                  </div>
                  <div className="text-xs text-slate-500 mt-1">Exness Desk</div>
                </div>
                <div>
                  <div className="flex items-center gap-1.5 text-2xl font-bold font-mono tabular-nums text-amber-600">
                    <Zap className="w-4 h-4 shrink-0" />
                    <span>{config.commissionPct}%</span>
                  </div>
                  <div className="text-xs text-slate-500 mt-1">Referral Payout</div>
                </div>
              </div>
            </div>

            {/* Right Column: Landscape Live Animated 3D Picture + Tilted Live Interactive Grid Pips Smartphone Terminal */}
            <div className="lg:col-span-6 relative">
              <div className="relative w-full aspect-video rounded-xl overflow-hidden border border-amber-500/25 bg-black">
                {HERO_FRAMES.map((frame, idx) => {
                  const isActive = idx === frameIndex;
                  return (
                    <img
                      key={frame.src}
                      src={frame.src}
                      alt={frame.alt}
                      referrerPolicy="no-referrer"
                      className={`absolute inset-0 w-full h-full object-cover object-center transition-opacity duration-1000 ${
                        isActive ? 'opacity-90' : 'opacity-0 pointer-events-none'
                      } ${
                        heroMotionActive
                          ? 'animate-hero-picture'
                          : 'animate-hero-picture animate-hero-picture-paused'
                      }`}
                    />
                  );
                })}
                {/* Black & Gold Atmospheric Rim Scrim */}
                <div
                  className="absolute inset-0 pointer-events-none"
                  style={{
                    background:
                      'linear-gradient(120deg, rgba(5,5,5,0.45) 0%, rgba(245,158,11,0.14) 50%, rgba(5,5,5,0.88) 100%)',
                  }}
                />

                {/* Live Picture & Animation Controls */}
                <div className="absolute top-3 left-3 flex items-center gap-1.5 z-10">
                  <button
                    type="button"
                    onClick={() => setHeroMotionActive((m) => !m)}
                    className="px-2.5 py-1 bg-black/80 border border-neutral-700 hover:border-amber-400/70 text-white text-[11px] font-medium rounded-lg inline-flex items-center gap-1 cursor-pointer"
                  >
                    {heroMotionActive ? <Pause className="w-3 h-3 text-amber-400" /> : <Play className="w-3 h-3 text-amber-400" />}
                    {heroMotionActive ? 'Pause Live' : 'Play Live'}
                  </button>
                  <div className="flex items-center gap-0.5 bg-black/80 border border-neutral-700 rounded-lg p-0.5">
                    {HERO_FRAMES.map((_, idx) => (
                      <button
                        key={idx}
                        type="button"
                        onClick={() => setFrameIndex(idx)}
                        aria-label={`Switch live hero scene ${idx + 1}`}
                        className={`px-1.5 py-0.5 text-[10px] font-mono rounded cursor-pointer ${
                          idx === frameIndex ? 'bg-amber-400 text-black font-semibold' : 'text-neutral-300'
                        }`}
                      >
                        0{idx + 1}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Bottom Live NY Session Caption */}
                <div className="absolute bottom-3 left-3 right-36 text-[11px] font-mono tabular-nums text-neutral-200 truncate pointer-events-none">
                  {HERO_FRAMES[frameIndex].caption} · NY {nyClock}
                </div>
              </div>

              {/* Tilted Live Animated Grid Pips Smartphone Terminal */}
              {phoneQuote && (
                <div className="mt-5 sm:mt-0 sm:w-64 sm:ml-auto lg:absolute lg:-bottom-6 lg:right-2 lg:w-60 bg-[#0b0b0d] border-2 border-amber-400/55 rounded-3xl p-4 shadow-2xl lg:-rotate-3 transition-transform duration-300 hover:rotate-0">
                  <div className="flex items-center justify-between pb-2.5 border-b border-neutral-800">
                    <BrandLogo variant="light" size="sm" />
                    <button
                      type="button"
                      onClick={() => setPhoneSymIndex((i) => i + 1)}
                      className="text-[10px] font-mono text-amber-400 hover:text-amber-300 cursor-pointer"
                    >
                      Switch Pair ↻
                    </button>
                  </div>

                  <div className="pt-3 pb-2">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-semibold text-neutral-300 font-mono">
                        {phoneQuote.sym}
                      </span>
                      <span
                        className={`text-[10px] font-mono ${
                          phoneQuote.isMarketOpen === false ? 'text-rose-400' : 'text-amber-400'
                        }`}
                      >
                        {phoneQuote.marketStatusLabel === 'Open'
                          ? 'LIVE TICK'
                          : phoneQuote.marketStatusLabel
                            ? phoneQuote.marketStatusLabel.toUpperCase()
                            : 'LIVE TICK'}
                      </span>
                    </div>
                    <div
                      className={`text-2xl font-bold font-mono tabular-nums mt-0.5 transition-colors duration-200 ${
                        phoneQuote.chgPct >= 0 ? 'text-emerald-400' : 'text-rose-400'
                      }`}
                    >
                      {phoneQuote.price.toFixed(phoneQuote.digits)}
                    </div>
                    <div
                      className={`text-xs font-mono tabular-nums ${
                        phoneQuote.chgPct >= 0 ? 'text-emerald-400' : 'text-rose-400'
                      }`}
                    >
                      {phoneQuote.chgPct >= 0 ? '▲ +' : '▼ '}
                      {phoneQuote.chgPct.toFixed(2)}%
                    </div>
                  </div>

                  {/* Live TradingView Candlestick Chart */}
                  <div className="my-2 bg-black/80 border border-neutral-800 rounded-xl p-2">
                    <svg viewBox="0 0 180 72" className="w-full h-16">
                      {normalizedPhoneCandles.length > 0 ? (
                        normalizedPhoneCandles.map((c, idx) => {
                          const step = 164 / Math.max(1, normalizedPhoneCandles.length);
                          const x = 8 + idx * step;
                          const col = c.bull ? '#22c55e' : '#f59e0b';
                          const yTop = Math.min(c.yOpen, c.yClose);
                          const h = Math.max(2.5, Math.abs(c.yClose - c.yOpen));
                          return (
                            <g key={idx}>
                              <line
                                x1={x + 3}
                                y1={c.yHigh}
                                x2={x + 3}
                                y2={c.yLow}
                                stroke={col}
                                strokeWidth="1.2"
                              />
                              <rect
                                x={x}
                                y={yTop}
                                width="6"
                                height={h}
                                fill={col}
                                rx="1"
                              />
                            </g>
                          );
                        })
                      ) : (
                        <text
                          x="90"
                          y="39"
                          textAnchor="middle"
                          fill="#94a3b8"
                          fontSize="8.5"
                          fontFamily="monospace"
                        >
                          {miniBarsLoading ? 'Loading TradingView bars...' : 'Awaiting TradingView feed'}
                        </text>
                      )}
                    </svg>

                    <div className="mt-1.5 flex items-center justify-between gap-1">
                      {(['1D', '1W', '1M', '3M', '1Y'] as const).map((tf) => (
                        <button
                          key={tf}
                          type="button"
                          onClick={() => setPhoneTf(tf)}
                          className={`flex-1 py-0.5 text-[10px] font-mono rounded cursor-pointer ${
                            phoneTf === tf ? 'bg-amber-400 text-black font-semibold' : 'text-neutral-400 hover:text-white'
                          }`}
                        >
                          {tf}
                        </button>
                      ))}
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-2 pt-1">
                    <button
                      type="button"
                      onClick={() => (user ? onGoWorkspace() : onGoAuth('register'))}
                      className="py-2 bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-semibold rounded-xl cursor-pointer"
                    >
                      Buy ↗
                    </button>
                    <button
                      type="button"
                      onClick={() => (user ? onGoWorkspace() : onGoAuth('register'))}
                      className="py-2 bg-rose-600 hover:bg-rose-500 text-white text-xs font-semibold rounded-xl cursor-pointer"
                    >
                      Sell ↘
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Live TradingView Market Session Summary + Bottom 5-Item Market Quote Strip */}
          {marketStatus && (
            <div className="mt-10 flex flex-wrap items-center justify-between gap-2 text-xs font-mono text-slate-600">
              <span className="inline-flex items-center gap-2 font-semibold text-slate-800">
                <span
                  className={`w-2 h-2 rounded-full ${
                    marketStatus.traditionalOpen ? 'bg-emerald-500' : 'bg-amber-500'
                  }`}
                />
                TradingView Live Session: {marketStatus.summaryLabel}
              </span>
              <span className="text-[11px] text-slate-500">
                {marketStatus.openCount}/{marketStatus.totalCount} markets open · Updated{' '}
                {new Date(marketStatus.checkedAt).toLocaleTimeString()}
              </span>
            </div>
          )}

          <div
            className={`${marketStatus ? 'mt-3' : 'mt-12'} pt-4 pb-3 border-t border-b border-slate-300 grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-4`}
          >
            {featuredQuotes.map((q) => {
              const up = q.chgPct >= 0;
              return (
                <div
                  key={q.sym}
                  title={q.marketStatusLabel ? `${q.sym} · TradingView: ${q.marketStatusLabel}` : q.sym}
                  className="flex items-center justify-between lg:justify-center gap-2.5 text-xs font-mono tabular-nums lg:border-r lg:last:border-r-0 border-slate-300 pr-2"
                >
                  <span className="inline-flex items-center gap-1.5 font-semibold text-slate-950">
                    {typeof q.isMarketOpen === 'boolean' && (
                      <span
                        className={`w-1.5 h-1.5 rounded-full ${
                          q.isMarketOpen ? 'bg-emerald-500' : 'bg-rose-400'
                        }`}
                      />
                    )}
                    {q.sym}
                  </span>
                  <span className="text-slate-600">{q.price.toFixed(q.digits)}</span>
                  <span className={up ? 'text-emerald-600' : 'text-rose-600'}>
                    {up ? '▲ +' : '▼ '}
                    {q.chgPct.toFixed(2)}%
                  </span>
                </div>
              );
            })}
          </div>

          <div className="mt-4 flex justify-center">
            <a
              href="#free-chart"
              className="inline-flex items-center gap-1.5 text-xs font-medium text-slate-500 hover:text-amber-700 transition-colors"
            >
              <ChevronDown className="w-3.5 h-3.5" />
              Open Free Live Chart
            </a>
          </div>
        </div>
      </section>

      {/* Free Public Live Market Chart (No Login or Subscription Required) */}
      <section id="free-chart" className="bg-white text-slate-950 py-14 border-b border-slate-200">
        <div className="max-w-7xl mx-auto px-6 space-y-5">
          <div className="flex flex-wrap items-end justify-between gap-4">
            <div>
              <p className="text-xs font-semibold text-amber-700 mb-1">Free Live Terminal · No Account Required</p>
              <h2 className="text-2xl sm:text-3xl font-bold tracking-tight text-slate-950">
                Free Live Market Chart (1M to 1W)
              </h2>
            </div>

            <div className="flex flex-wrap items-center gap-2.5">
              <select
                value={freeChartSymbol}
                onChange={(e) => setFreeChartSymbol(e.target.value)}
                aria-label="Free chart symbol"
                className="px-3 py-2 text-xs font-mono font-semibold bg-white border border-slate-300 text-slate-950 rounded-lg"
              >
                {TRADING_SYMBOLS.map((sym) => (
                  <option key={sym} value={sym}>
                    {sym}
                  </option>
                ))}
              </select>

              <div className="flex flex-wrap items-center gap-1 p-1 bg-slate-100 border border-slate-200 rounded-lg">
                {ANALYZER_TIMEFRAMES.map((tf) => (
                  <button
                    key={tf}
                    type="button"
                    onClick={() => setFreeChartTf(tf)}
                    className={`px-2.5 py-1.5 text-xs font-mono font-semibold rounded-md cursor-pointer whitespace-nowrap shrink-0 ${
                      freeChartTf === tf
                        ? 'bg-amber-400 text-black'
                        : 'text-slate-600 hover:text-slate-950'
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
                className="px-4 py-2 bg-amber-400 hover:bg-amber-300 text-black text-xs font-semibold rounded-lg cursor-pointer whitespace-nowrap shrink-0"
              >
                Scan {freeChartSymbol} ({freeChartTf}) in ICT Analyzer →
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

      {/* Capabilities Asymmetric Bento with 3D Human Visuals */}
      <section id="capabilities" className="bg-[#F7F5F0] text-slate-950 py-16 lg:py-20 border-b border-slate-200">
        <div className="max-w-7xl mx-auto px-6">
          <div className="max-w-2xl mb-10">
            <p className="text-xs font-semibold mb-2 text-amber-700">Core Architecture</p>
            <h2 className="text-3xl font-bold tracking-tight text-slate-950" style={{ textWrap: 'balance' }}>
              Built for Inner Circle Trader precision and automated MT5 execution.
            </h2>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
            {/* Card 1: ICT Analyzer */}
            <div className="lg:col-span-7 bg-white border border-slate-200 rounded-xl overflow-hidden flex flex-col">
              <div className="h-64 sm:h-72 overflow-hidden bg-slate-900 border-b border-slate-200">
                <ImageWithFallback
                  src={LANDING_IMAGES.analystIct3d}
                  alt="3D female market strategist reviewing ICT smart money charts"
                  className="w-full h-full object-cover object-top"
                />
              </div>
              <div className="p-7 flex-1 flex flex-col justify-between">
                <div>
                  <div className="text-xs font-semibold mb-2 text-amber-700">
                    01. Market Intelligence · ${config.analyzerPriceUsd.toFixed(2)} One-Time License
                  </div>
                  <h3 className="text-xl font-bold text-slate-950 mb-2">
                    ICT Strategy Market Analyzer
                  </h3>
                  <p className="text-sm text-slate-600 leading-relaxed mb-5">
                    Engineered around the Inner Circle Trader methodology (YouTube channel {config.ictYoutubeChannelId}). Automatically maps Buy-Side and Sell-Side Liquidity pools, Displacement Fair Value Gaps, Order Blocks, Optimal Trade Entry (0.618–0.786), and active London/New York Killzones.
                  </p>
                </div>
                <div className="flex items-center justify-between pt-4 border-t border-slate-200">
                  <span className="text-xs font-mono text-slate-500">EURUSD · XAUUSD · NAS100 · BTCUSD</span>
                  <button
                    onClick={() => (user ? onSelectProduct('analyzer') : onGoAuth('register'))}
                    className="text-sm font-semibold cursor-pointer text-amber-700 hover:text-amber-600"
                  >
                    Get ICT Analyzer →
                  </button>
                </div>
              </div>
            </div>

            {/* Card 2: MQL5 EA Bots */}
            <div className="lg:col-span-5 bg-white border border-slate-200 rounded-xl overflow-hidden flex flex-col">
              <div className="h-64 sm:h-72 overflow-hidden bg-slate-900 border-b border-slate-200">
                <ImageWithFallback
                  src={LANDING_IMAGES.automatorEa3d}
                  alt="3D Black institutional trader operating multi-monitor MetaTrader 5 execution desk"
                  className="w-full h-full object-cover object-top"
                />
              </div>
              <div className="p-7 flex-1 flex flex-col justify-between">
                <div>
                  <div className="text-xs font-semibold mb-2 text-amber-700">
                    02. Execution Bots · ${config.eaBotsPriceUsd.toFixed(2)} Source &amp; Docs
                  </div>
                  <h3 className="text-xl font-bold text-slate-950 mb-2">
                    MQL5 Expert Advisors &amp; MT5 Bridge
                  </h3>
                  <p className="text-sm text-slate-600 leading-relaxed mb-5">
                    Receive two clean, compilable MQL5 (.mq5) bots (ICT Silver Bullet FVG &amp; SMC Liquidity Sweep), complete step-by-step MetaTrader 5 installation documentation, and direct MT5 WebRequest bridge telemetry inside your Grid Pips dashboard.
                  </p>
                </div>
                <div className="flex items-center justify-between pt-4 border-t border-slate-200">
                  <span className="text-xs font-mono text-slate-500">.mq5 Source + Setup Guide</span>
                  <button
                    onClick={() => (user ? onSelectProduct('ea_bots') : onGoAuth('register'))}
                    className="text-sm font-semibold cursor-pointer text-amber-700 hover:text-amber-600"
                  >
                    Get MQL5 Bots →
                  </button>
                </div>
              </div>
            </div>

            {/* Card 3: Education + Community */}
            <div id="education-preview" className="lg:col-span-12 bg-white border border-slate-200 rounded-xl overflow-hidden grid grid-cols-1 lg:grid-cols-12">
              <div className="lg:col-span-5 h-64 lg:h-auto bg-slate-900">
                <ImageWithFallback
                  src={LANDING_IMAGES.mentorCommunity3d}
                  alt="3D trading mentor presenting Smart Money Concepts liquidity structure"
                  className="w-full h-full object-cover object-top"
                />
              </div>
              <div className="lg:col-span-7 p-8 flex flex-col justify-center">
                <div className="text-xs font-semibold mb-2 text-amber-700">
                  03. Free Curriculum &amp; Live Community · Included with Exness Registration
                </div>
                <h3 className="text-2xl font-bold text-slate-950 mb-3">
                  ICT Mentorship Curriculum, Smart Money Concepts &amp; JakoyoFX Telegram
                </h3>
                <p className="text-sm text-slate-600 leading-relaxed mb-6">
                  Study directly from the official ICT YouTube library alongside structured Smart Money Concepts (SMC) breakdowns covering BOS, CHoCH, Inducement, and Mitigation Blocks. Connect with active traders inside our Telegram channel for daily bias discussions.
                </p>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-6 text-sm text-slate-700">
                  <div className="flex items-start gap-2.5">
                    <CheckCircle2 className="w-4 h-4 mt-0.5 shrink-0 text-amber-600" />
                    <span>Unlimited Trading Journal with screenshot uploads &amp; analytics</span>
                  </div>
                  <div className="flex items-start gap-2.5">
                    <CheckCircle2 className="w-4 h-4 mt-0.5 shrink-0 text-amber-600" />
                    <span>$10,000 Paper Trading Simulator &amp; 8 Risk Calculators</span>
                  </div>
                  <div className="flex items-start gap-2.5">
                    <CheckCircle2 className="w-4 h-4 mt-0.5 shrink-0 text-amber-600" />
                    <span>Official TradingView Advanced Charts &amp; Economic Calendar</span>
                  </div>
                  <div className="flex items-start gap-2.5">
                    <CheckCircle2 className="w-4 h-4 mt-0.5 shrink-0 text-amber-600" />
                    <span>Automated email confirmations &amp; encrypted session security</span>
                  </div>
                </div>
                <div className="flex flex-wrap gap-3">
                  <button
                    onClick={() => (user ? onGoWorkspace() : onGoAuth('register'))}
                    className="px-5 py-2.5 bg-amber-400 hover:bg-amber-300 text-black text-sm font-semibold rounded-full transition-colors cursor-pointer"
                  >
                    Start Free with Exness
                  </button>
                  <a
                    href={config.telegramUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="px-5 py-2.5 bg-slate-100 border border-slate-300 hover:border-amber-500 text-slate-950 text-sm font-semibold rounded-full transition-colors inline-flex items-center gap-2"
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
      <section id="pricing" className="py-16 bg-white text-slate-950 border-b border-slate-200">
        <div className="max-w-7xl mx-auto px-6">
          <div className="max-w-2xl mb-10">
            <p className="text-xs font-semibold mb-2 text-amber-700">Transparent Access</p>
            <h2 className="text-3xl font-bold tracking-tight text-slate-950">
              Free trading desk for Exness traders. Two ${config.analyzerPriceUsd.toFixed(2)} pro modules.
            </h2>
            <p className="text-sm text-slate-600 mt-2">
              Pay seamlessly with Crypto (USDT TRC20, USDT ERC20, or Bitcoin BTC) and mobile money checkout inside your dashboard.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <div className="border border-slate-200 rounded-xl p-7 flex flex-col justify-between bg-[#F7F5F0]">
              <div>
                <div className="text-xs font-medium text-slate-500 mb-1">For All Exness Registered Traders</div>
                <h3 className="text-lg font-bold text-slate-950">Core Trading Desk</h3>
                <div className="text-3xl font-bold font-mono tabular-nums text-slate-950 my-4">$0</div>
                <ul className="space-y-2.5 text-sm text-slate-700 mb-6">
                  <li>· TradingView Charts &amp; Watchlist</li>
                  <li>· Unlimited Trading Journal &amp; Analytics</li>
                  <li>· 8 Risk, Lot Size &amp; Margin Calculators</li>
                  <li>· $10,000 Paper Trading Simulator</li>
                  <li>· ICT ({config.ictYoutubeChannelId}) &amp; SMC Lessons</li>
                </ul>
              </div>
              <button
                onClick={() => (user ? onGoWorkspace() : onGoAuth('register'))}
                className="w-full py-2.5 bg-white border border-slate-300 hover:border-amber-500 text-slate-950 text-sm font-semibold rounded-full transition-colors cursor-pointer"
              >
                {user ? 'Open Dashboard' : 'Register via Exness IB'}
              </button>
            </div>

            <div className="border-2 border-amber-500 rounded-xl p-7 flex flex-col justify-between bg-white shadow-sm">
              <div>
                <div className="text-xs font-semibold mb-1 text-amber-700">ICT Algorithmic Scanner</div>
                <h3 className="text-lg font-bold text-slate-950">ICT Strategy Market Analyzer</h3>
                <div className="my-4">
                  <span className="text-3xl font-bold font-mono tabular-nums text-slate-950">
                    ${config.analyzerPriceUsd.toFixed(2)}
                  </span>
                </div>
                <ul className="space-y-2.5 text-sm text-slate-700 mb-6">
                  <li>· Automated FVG (BISI / SIBI) Detection</li>
                  <li>· Bullish &amp; Bearish Order Block Mapping</li>
                  <li>· BSL / SSL Liquidity Sweep Targets</li>
                  <li>· 0.618–0.786 OTE &amp; NY Killzone Timing</li>
                  <li>· Actionable Entry, SL &amp; TP Projections</li>
                </ul>
              </div>
              <button
                onClick={() => (user ? onSelectProduct('analyzer') : onGoAuth('register'))}
                className="w-full py-2.5 bg-amber-400 hover:bg-amber-300 text-black text-sm font-semibold rounded-full transition-colors cursor-pointer"
              >
                Get ICT Analyzer — ${config.analyzerPriceUsd.toFixed(2)}
              </button>
            </div>

            <div className="border border-slate-900 rounded-xl p-7 flex flex-col justify-between bg-slate-950 text-white">
              <div>
                <div className="text-xs font-semibold text-amber-400 mb-1">Full MQL5 Source + MT5 Connect</div>
                <h3 className="text-lg font-bold text-white">MQL5 EA Bots Pack</h3>
                <div className="my-4">
                  <span className="text-3xl font-bold font-mono tabular-nums text-white">
                    ${config.eaBotsPriceUsd.toFixed(2)}
                  </span>
                </div>
                <ul className="space-y-2.5 text-sm text-slate-300 mb-6">
                  <li>· Grid Pips ICT Silver Bullet EA (.mq5)</li>
                  <li>· Grid Pips SMC Order Block EA (.mq5)</li>
                  <li>· Complete MT5 Installation Guide</li>
                  <li>· Live MT5 Account Bridge Connection</li>
                  <li>· Automated Risk % &amp; Daily Drawdown Guard</li>
                </ul>
              </div>
              <button
                onClick={() => (user ? onSelectProduct('ea_bots') : onGoAuth('register'))}
                className="w-full py-2.5 bg-amber-400 text-black text-sm font-semibold rounded-full hover:bg-amber-300 transition-colors cursor-pointer"
              >
                Buy MQL5 Bots — ${config.eaBotsPriceUsd.toFixed(2)}
              </button>
            </div>
          </div>
        </div>
      </section>

      {/* Exness IB Banner */}
      <section className="bg-[#F7F5F0] py-14 border-b border-slate-200">
        <div className="max-w-7xl mx-auto px-6">
          <div className="bg-white text-slate-950 border border-slate-200 rounded-xl p-8 lg:p-10 flex flex-col lg:flex-row items-start lg:items-center justify-between gap-6">
            <div className="max-w-2xl">
              <div className="flex items-center gap-2 text-xs font-semibold mb-2 text-amber-700">
                <ShieldCheck className="w-4 h-4" />
                <span>Required Brokerage Onboarding</span>
              </div>
              <h3 className="text-2xl font-bold tracking-tight mb-2 text-slate-950">
                Open your Exness trading account to access Grid Pips.
              </h3>
              <p className="text-sm text-slate-600 leading-relaxed">
                Account creation, deposits, and trade execution occur directly on Exness. Register using our official IB partner link, then link your Exness Account ID to enter both the free trading tools and $5.25 pro modules.
              </p>
            </div>
            <div className="flex flex-wrap gap-3 shrink-0">
              <a
                href={config.exnessIbUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="px-6 py-3 bg-amber-400 hover:bg-amber-300 text-black text-sm font-semibold rounded-full transition-colors inline-flex items-center gap-2 whitespace-nowrap"
              >
                Open Exness Account
                <ArrowUpRight className="w-4 h-4" />
              </a>
              <button
                onClick={() => onGoAuth('login')}
                className="px-6 py-3 bg-slate-100 border border-slate-300 hover:border-amber-500 text-slate-950 text-sm font-semibold rounded-full transition-colors whitespace-nowrap cursor-pointer"
              >
                Member Login
              </button>
            </div>
          </div>
        </div>
      </section>

      {/* Quiet Footer */}
      <footer className="bg-white text-slate-600 py-12">
        <div className="max-w-7xl mx-auto px-6 grid grid-cols-1 md:grid-cols-4 gap-8 text-sm">
          <div className="md:col-span-2">
            <BrandLogo variant="dark" size="md" showTagline className="mb-3" />
            <p className="text-xs text-slate-500 leading-relaxed max-w-md">
              Risk Disclosure: CFDs and leveraged forex instruments carry a high risk of losing money rapidly. Grid Pips provides educational tools, ICT market analysis software, and MQL5 source code templates only. We do not hold client funds or execute brokerage orders.
            </p>
          </div>
          <div>
            <div className="text-xs font-semibold text-slate-950 mb-3">Integrations</div>
            <ul className="space-y-2 text-xs">
              <li>
                <a href={config.exnessIbUrl} target="_blank" rel="noopener noreferrer" className="hover:text-slate-950">
                  Exness IB Partner Portal
                </a>
              </li>
              <li>
                <a href={config.telegramUrl} target="_blank" rel="noopener noreferrer" className="hover:text-slate-950">
                  JakoyoFX Telegram Community
                </a>
              </li>
              <li>
                <a
                  href={`https://www.youtube.com/channel/${config.ictYoutubeChannelId}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="hover:text-slate-950"
                >
                  ICT YouTube Mentorship
                </a>
              </li>
            </ul>
          </div>
          <div>
            <div className="text-xs font-semibold text-slate-950 mb-3">Access &amp; Compliance</div>
            <ul className="space-y-2 text-xs">
              <li>
                <button onClick={() => onGoAuth('login')} className="hover:text-slate-950 cursor-pointer">
                  Member Sign In
                </button>
              </li>
              <li>
                <button onClick={() => onGoAuth('register')} className="hover:text-slate-950 cursor-pointer">
                  Exness Account Registration
                </button>
              </li>
              <li>
                <button onClick={() => setLegalDoc('risk')} className="hover:text-slate-950 cursor-pointer">
                  Risk Disclosure
                </button>
              </li>
              <li>
                <button onClick={() => setLegalDoc('affiliate')} className="hover:text-slate-950 cursor-pointer">
                  Exness IB &amp; Affiliate Terms
                </button>
              </li>
              <li>
                <button onClick={() => setLegalDoc('terms')} className="hover:text-slate-950 cursor-pointer">
                  Terms of Service
                </button>
              </li>
              <li>
                <button onClick={() => setLegalDoc('privacy')} className="hover:text-slate-950 cursor-pointer">
                  Privacy Policy
                </button>
              </li>
            </ul>
          </div>
        </div>
        <div className="max-w-7xl mx-auto px-6 mt-8 pt-6 border-t border-slate-200 text-xs text-slate-500 flex flex-col sm:flex-row justify-between gap-2">
          <span>© 2026 Grid Pips. All rights reserved.</span>
          <span>Secured with scrypt hashing, rate limiting, and HTTP-only signed sessions.</span>
        </div>
      </footer>

      {/* Watch Demo Modal */}
      {demoOpen && (
        <div className="fixed inset-0 z-50 bg-slate-950/70 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white border border-slate-200 rounded-2xl max-w-2xl w-full p-6 space-y-4 text-slate-950">
            <div className="flex items-center justify-between border-b border-slate-200 pb-3">
              <div>
                <h3 className="text-base font-bold text-slate-950">Grid Pips Platform Walkthrough</h3>
                <p className="text-xs text-slate-500">ICT Strategy Market Analyzer + MQL5 EA Bots Pack</p>
              </div>
              <button
                type="button"
                onClick={() => setDemoOpen(false)}
                className="p-1.5 text-slate-500 hover:text-slate-950 cursor-pointer"
                aria-label="Close demo preview"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs text-slate-600">
              <div className="p-4 rounded-xl bg-slate-50 border border-slate-200 space-y-2">
                <div className="font-semibold text-amber-700">01. Exness Onboarding &amp; Free Desk</div>
                <p>Link your Exness IB account ID once to access TradingView charts, unlimited journal with screenshots, 8 calculators, and $10,000 paper trading.</p>
              </div>
              <div className="p-4 rounded-xl bg-slate-50 border border-slate-200 space-y-2">
                <div className="font-semibold text-amber-700">02. $5.25 ICT Strategy Analyzer</div>
                <p>Detects London &amp; NY Killzones, Fair Value Gaps (BISI/SIBI), Order Blocks, 0.705 OTE Fibs, and BSL/SSL liquidity targets.</p>
              </div>
              <div className="p-4 rounded-xl bg-slate-50 border border-slate-200 space-y-2">
                <div className="font-semibold text-amber-700">03. $5.25 MQL5 EA Bots + MT5 Bridge</div>
                <p>Download compilable .mq5 Expert Advisors with full installation guide and connect directly to your MetaTrader 5 terminal.</p>
              </div>
              <div className="p-4 rounded-xl bg-slate-50 border border-slate-200 space-y-2">
                <div className="font-semibold text-amber-700">04. JakoyoFX Community &amp; Referrals</div>
                <p>Join t.me/JakoyoFx for daily setup discussions and share your referral link to earn 20% commission on licenses.</p>
              </div>
            </div>
            <div className="pt-2 flex flex-wrap justify-end gap-3">
              <button
                type="button"
                onClick={() => setDemoOpen(false)}
                className="px-4 py-2 border border-slate-300 text-slate-700 text-xs font-semibold rounded-full hover:text-slate-950 cursor-pointer"
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
                className="px-5 py-2 bg-amber-400 hover:bg-amber-300 text-black text-xs font-semibold rounded-full cursor-pointer"
              >
                {user ? 'Open Dashboard →' : 'Start Free with Exness →'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Legal Disclosure Modal */}
      {legalDoc && (
        <div className="fixed inset-0 z-50 bg-slate-950/70 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white border border-slate-200 rounded-xl max-w-lg w-full p-6 space-y-4">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <h3 className="text-base font-bold text-slate-950">{LEGAL_DOCS[legalDoc].title}</h3>
              <button
                type="button"
                onClick={() => setLegalDoc(null)}
                className="p-1.5 text-slate-500 hover:text-slate-950 cursor-pointer"
                aria-label="Close legal notice"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="space-y-3 text-xs text-slate-600 leading-relaxed">
              {LEGAL_DOCS[legalDoc].paragraphs.map((p, idx) => (
                <p key={idx}>{p}</p>
              ))}
            </div>
            <div className="pt-2 flex justify-end">
              <button
                type="button"
                onClick={() => setLegalDoc(null)}
                className="px-5 py-2 bg-slate-950 text-white text-xs font-semibold rounded-full hover:bg-slate-800 cursor-pointer"
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
