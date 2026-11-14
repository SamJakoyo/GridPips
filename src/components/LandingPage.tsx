import React, { useEffect, useMemo, useState } from 'react';
import { ArrowUpRight, ShieldCheck, Send, CheckCircle2, X, Play, Pause, Activity } from 'lucide-react';
import { LANDING_IMAGES } from '../assets/landingImages';
import { BrandLogo } from './BrandLogo';
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

interface LiveCandle {
  open: number;
  high: number;
  low: number;
  close: number;
}

const STREAM_SYMBOLS = ['XAUUSD', 'EURUSD', 'NAS100', 'BTCUSD'] as const;

function buildSeedCandles(basePrice: number, digits: number): LiveCandle[] {
  const step = Math.pow(10, -digits) * (digits >= 4 ? 14 : 6);
  const candles: LiveCandle[] = [];
  let price = basePrice - step * 4;
  for (let i = 0; i < 28; i++) {
    const wave = Math.sin(i * 0.55) * step * 1.4 + (i > 17 ? step * 0.45 : -step * 0.15);
    const open = price;
    const close = Number((open + wave).toFixed(digits));
    const wickPad = step * (0.55 + ((i * 7) % 5) * 0.18);
    const high = Number((Math.max(open, close) + wickPad).toFixed(digits));
    const low = Number((Math.min(open, close) - wickPad * 0.85).toFixed(digits));
    candles.push({ open, high, low, close });
    price = close;
  }
  return candles;
}

function getNySessionLabel(now: Date): { clock: string; killzone: string } {
  const clock = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/New_York',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  }).format(now);
  const nyHour = Number(clock.split(':')[0]);
  let killzone = 'NY Macro Consolidation';
  if (nyHour >= 2 && nyHour < 5) killzone = 'London Open Killzone (02:00–05:00 NY)';
  else if (nyHour >= 7 && nyHour < 10) killzone = 'NY AM Killzone (07:00–10:00 NY)';
  else if (nyHour >= 10 && nyHour < 12) killzone = 'NY Silver Bullet Window (10:00–11:00 NY)';
  else if (nyHour >= 13 && nyHour < 16) killzone = 'NY PM Liquidity Expansion (13:30–16:00 NY)';
  else if (nyHour >= 19 || nyHour < 2) killzone = 'Asian Range Accumulation (19:00–00:00 NY)';
  return { clock, killzone };
}

const LiveMarketFeed: React.FC<{
  quotes: MarketSymbolQuote[];
  onAction: () => void;
  actionLabel: string;
}> = ({ quotes, onAction, actionLabel }) => {
  const [selectedSym, setSelectedSym] = useState<(typeof STREAM_SYMBOLS)[number]>('XAUUSD');
  const [streaming, setStreaming] = useState(true);
  const [now, setNow] = useState(() => new Date());

  const activeQuote = useMemo(
    () => quotes.find((q) => q.sym === selectedSym) || quotes[0] || { sym: 'XAUUSD', name: 'Gold', price: 2742.6, chgPct: 0.48, digits: 2 },
    [quotes, selectedSym]
  );

  const [candles, setCandles] = useState<LiveCandle[]>(() =>
    buildSeedCandles(activeQuote.price, activeQuote.digits)
  );
  const [tickCount, setTickCount] = useState(0);

  // Reset candle stream cleanly when user picks a different instrument
  useEffect(() => {
    setCandles(buildSeedCandles(activeQuote.price, activeQuote.digits));
  }, [selectedSym, activeQuote.digits]);

  // Real 1-second live clock + animated candle tick stream
  useEffect(() => {
    if (!streaming) return;
    const id = setInterval(() => {
      setNow(new Date());
      setTickCount((c) => c + 1);
      setCandles((prev) => {
        if (!prev.length) return prev;
        const last = prev[prev.length - 1];
        const digits = activeQuote.digits;
        const unit = Math.pow(10, -digits) * (digits >= 4 ? 8 : 4);
        const impulse = (Math.random() - 0.46) * unit * 1.9;
        const nextClose = Number((last.close + impulse).toFixed(digits));
        const shouldRollCandle = Math.random() > 0.72;

        if (shouldRollCandle) {
          const open = last.close;
          const rolled: LiveCandle = {
            open,
            close: nextClose,
            high: Number((Math.max(open, nextClose) + unit * 0.4).toFixed(digits)),
            low: Number((Math.min(open, nextClose) - unit * 0.4).toFixed(digits)),
          };
          return [...prev.slice(1), rolled];
        }

        const updatedLast: LiveCandle = {
          open: last.open,
          close: nextClose,
          high: Number(Math.max(last.high, nextClose).toFixed(digits)),
          low: Number(Math.min(last.low, nextClose).toFixed(digits)),
        };
        return [...prev.slice(0, -1), updatedLast];
      });
    }, 900);
    return () => clearInterval(id);
  }, [streaming, activeQuote.digits]);

  const { clock, killzone } = getNySessionLabel(now);
  const liveCandle = candles[candles.length - 1];
  const firstCandle = candles[0];
  const livePrice = liveCandle ? liveCandle.close : activeQuote.price;
  const sessionBias = liveCandle && firstCandle && liveCandle.close >= firstCandle.open ? 'Bullish Expansion' : 'Bearish Liquidity Draw';

  const allHighs = candles.map((c) => c.high);
  const allLows = candles.map((c) => c.low);
  const maxP = Math.max(...allHighs);
  const minP = Math.min(...allLows);
  const span = maxP - minP || 1;
  const bslPrice = Number((maxP - span * 0.08).toFixed(activeQuote.digits));
  const sslPrice = Number((minP + span * 0.1).toFixed(activeQuote.digits));
  const fvgTop = Number((minP + span * 0.56).toFixed(activeQuote.digits));
  const fvgBot = Number((minP + span * 0.42).toFixed(activeQuote.digits));

  const svgW = 820;
  const svgH = 300;
  const padX = 20;
  const padY = 24;
  const toY = (p: number) => padY + ((maxP - p) / span) * (svgH - padY * 2);
  const stepX = (svgW - padX * 2) / Math.max(1, candles.length);

  return (
    <div className="bg-black border border-neutral-800 rounded-xl overflow-hidden">
      {/* Live Stream Control Strip */}
      <div className="px-6 py-4 border-b border-neutral-800 flex flex-wrap items-center justify-between gap-4">
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex items-center gap-2 text-xs font-semibold text-white">
            <Activity className="w-4 h-4 text-red-500" />
            <span>Live ICT Liquidity Stream</span>
          </div>
          <span className="text-neutral-600" aria-hidden="true">·</span>
          <span className="text-xs font-mono tabular-nums text-neutral-300">
            NY EST {clock}
          </span>
          <span className="text-neutral-600 hidden sm:inline" aria-hidden="true">·</span>
          <span className="text-xs text-red-400 font-medium hidden sm:inline">{killzone}</span>
        </div>

        <div className="flex items-center gap-2">
          <div className="flex items-center gap-1 p-1 bg-neutral-900 border border-neutral-800 rounded-lg">
            {STREAM_SYMBOLS.map((sym) => (
              <button
                key={sym}
                type="button"
                onClick={() => setSelectedSym(sym)}
                className={`px-3 py-1 text-xs font-mono font-semibold rounded-md transition-colors cursor-pointer whitespace-nowrap ${
                  selectedSym === sym
                    ? 'bg-red-600 text-white'
                    : 'text-neutral-400 hover:text-white'
                }`}
              >
                {sym}
              </button>
            ))}
          </div>
          <button
            type="button"
            onClick={() => setStreaming((s) => !s)}
            className="px-3 py-1.5 bg-neutral-900 border border-neutral-700 hover:border-neutral-500 text-white text-xs font-semibold rounded-lg inline-flex items-center gap-1.5 cursor-pointer whitespace-nowrap"
          >
            {streaming ? <Pause className="w-3.5 h-3.5 text-red-500" /> : <Play className="w-3.5 h-3.5 text-white" />}
            {streaming ? 'Live' : 'Paused'}
          </button>
        </div>
      </div>

      {/* Live Metrics Bar */}
      <div className="px-6 py-4 bg-neutral-950 border-b border-neutral-800 grid grid-cols-2 md:grid-cols-4 gap-4">
        <div>
          <div className="text-xs text-neutral-400">Live Mark Price ({selectedSym})</div>
          <div className="text-2xl font-bold font-mono tabular-nums text-white mt-0.5">
            {livePrice.toFixed(activeQuote.digits)}
          </div>
        </div>
        <div>
          <div className="text-xs text-neutral-400">Structure Bias</div>
          <div className={`text-sm font-semibold mt-1.5 ${sessionBias.startsWith('Bullish') ? 'text-white' : 'text-red-500'}`}>
            {sessionBias}
          </div>
        </div>
        <div>
          <div className="text-xs text-neutral-400">BSL / SSL Liquidity Pool</div>
          <div className="text-sm font-mono tabular-nums font-semibold text-neutral-200 mt-1.5">
            {bslPrice.toFixed(activeQuote.digits)} / {sslPrice.toFixed(activeQuote.digits)}
          </div>
        </div>
        <div className="flex items-center md:justify-end">
          <button
            type="button"
            onClick={onAction}
            className="px-4 py-2 bg-red-600 text-white text-xs font-semibold rounded-lg hover:bg-red-700 transition-colors cursor-pointer whitespace-nowrap"
          >
            {actionLabel}
          </button>
        </div>
      </div>

      {/* Live Animated SVG Candlestick & Sweep Map */}
      <div className="relative bg-black p-4 sm:p-6 overflow-hidden">
        {streaming && (
          <div
            aria-hidden="true"
            className="pointer-events-none absolute inset-y-0 w-32 bg-gradient-to-r from-transparent via-red-600/10 to-transparent animate-live-scan"
          />
        )}
        <svg viewBox={`0 0 ${svgW} ${svgH}`} className="w-full h-64 sm:h-72 relative z-10">
          {/* Subtle grid */}
          {[0.2, 0.4, 0.6, 0.8].map((r) => (
            <line
              key={r}
              x1={padX}
              y1={padY + r * (svgH - padY * 2)}
              x2={svgW - padX}
              y2={padY + r * (svgH - padY * 2)}
              stroke="#1f1f23"
              strokeWidth={1}
            />
          ))}

          {/* FVG Imbalance Zone */}
          <rect
            x={padX + stepX * 12}
            y={Math.min(toY(fvgTop), toY(fvgBot))}
            width={svgW - padX * 2 - stepX * 12}
            height={Math.max(10, Math.abs(toY(fvgBot) - toY(fvgTop)))}
            fill="rgba(220, 38, 38, 0.14)"
            stroke="rgba(220, 38, 38, 0.55)"
            strokeWidth={1}
          />
          <text
            x={svgW - padX - 6}
            y={Math.min(toY(fvgTop), toY(fvgBot)) + 13}
            textAnchor="end"
            fill="#f87171"
            fontSize={10}
            fontFamily="JetBrains Mono, monospace"
          >
            ICT FVG ENTRY ZONE
          </text>

          {/* BSL & SSL Liquidity Lines */}
          <line
            x1={padX}
            y1={toY(bslPrice)}
            x2={svgW - padX}
            y2={toY(bslPrice)}
            stroke="#ffffff"
            strokeDasharray="4 4"
            strokeWidth={1}
            strokeOpacity={0.55}
          />
          <text x={padX + 4} y={toY(bslPrice) - 5} fill="#e5e5e5" fontSize={10} fontFamily="JetBrains Mono, monospace">
            BSL {bslPrice.toFixed(activeQuote.digits)}
          </text>

          <line
            x1={padX}
            y1={toY(sslPrice)}
            x2={svgW - padX}
            y2={toY(sslPrice)}
            stroke="#ef4444"
            strokeDasharray="4 4"
            strokeWidth={1}
            strokeOpacity={0.7}
          />
          <text x={padX + 4} y={toY(sslPrice) + 12} fill="#ef4444" fontSize={10} fontFamily="JetBrains Mono, monospace">
            SSL {sslPrice.toFixed(activeQuote.digits)}
          </text>

          {/* Live Price Beam */}
          <line
            x1={padX}
            y1={toY(livePrice)}
            x2={svgW - padX}
            y2={toY(livePrice)}
            stroke="#dc2626"
            strokeWidth={1.2}
          />

          {/* Candlesticks: Crisp White (Bullish) vs Crimson Red (Bearish) */}
          {candles.map((c, idx) => {
            const cx = padX + idx * stepX + stepX / 2;
            const isBull = c.close >= c.open;
            const color = isBull ? '#ffffff' : '#dc2626';
            const yOpen = toY(c.open);
            const yClose = toY(c.close);
            const yHigh = toY(c.high);
            const yLow = toY(c.low);
            const bodyTop = Math.min(yOpen, yClose);
            const bodyH = Math.max(2.5, Math.abs(yClose - yOpen));
            const isLast = idx === candles.length - 1;
            return (
              <g key={idx}>
                <line x1={cx} y1={yHigh} x2={cx} y2={yLow} stroke={color} strokeWidth={1.4} />
                <rect
                  x={cx - stepX * 0.28}
                  y={bodyTop}
                  width={Math.max(4, stepX * 0.56)}
                  height={bodyH}
                  fill={color}
                  rx={1}
                />
                {isLast && (
                  <circle
                    cx={cx}
                    cy={yClose}
                    r={tickCount % 2 === 0 ? 4.5 : 3}
                    fill="#ef4444"
                    stroke="#ffffff"
                    strokeWidth={1.5}
                  />
                )}
              </g>
            );
          })}
        </svg>

        <div className="mt-3 pt-3 border-t border-neutral-900 flex flex-wrap items-center justify-between gap-3 text-xs text-neutral-400">
          <div className="flex flex-wrap items-center gap-x-5 gap-y-1">
            <span>White Candles: Bullish Displacement</span>
            <span aria-hidden="true">·</span>
            <span>Red Candles: Bearish Imbalance</span>
            <span aria-hidden="true">·</span>
            <span>Red Zone: Fair Value Gap</span>
          </div>
          <span className="font-mono tabular-nums text-neutral-300">
            Tick #{tickCount + 1} · {streaming ? 'Streaming' : 'Paused'}
          </span>
        </div>
      </div>
    </div>
  );
};

export const LandingPage: React.FC<LandingPageProps> = ({
  config,
  user,
  quotes,
  onGoAuth,
  onGoWorkspace,
  onSelectProduct,
}) => {
  const [legalDoc, setLegalDoc] = useState<LegalDocKey | null>(null);

  return (
    <div className="min-h-screen bg-black text-white">
      {/* Live Market Ticker */}
      <div className="bg-black text-white border-b border-neutral-800 h-9 overflow-hidden flex items-center">
        <div className="animate-ticker whitespace-nowrap">
          {[...quotes, ...quotes].map((q, idx) => {
            const up = q.chgPct >= 0;
            return (
              <span
                key={`${q.sym}-${idx}`}
                className="inline-flex items-center gap-2.5 px-5 text-xs font-mono tabular-nums border-r border-neutral-800"
              >
                <span className="font-bold text-white">{q.sym}</span>
                <span className="text-neutral-300">{q.price.toFixed(q.digits)}</span>
                <span className={up ? 'text-white font-semibold' : 'text-red-500 font-semibold'}>
                  {up ? '▲ +' : '▼ '}
                  {q.chgPct.toFixed(2)}%
                </span>
              </span>
            );
          })}
        </div>
      </div>

      {/* Strict 3-Zone Top Bar Contract */}
      <header className="sticky top-0 z-40 bg-black/95 backdrop-blur-md border-b border-neutral-800">
        <div className="max-w-7xl mx-auto px-6 h-16 flex items-center justify-between gap-8">
          <a href="#top" className="shrink-0">
            <BrandLogo variant="light" accent="red" size="md" />
          </a>

          <nav className="hidden md:flex items-center gap-7 text-sm font-medium text-neutral-300">
            <a
              href="#live-feed"
              className="hover:text-white transition-colors whitespace-nowrap shrink-0"
            >
              Live Desk
            </a>
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
          </nav>

          <div className="flex items-center gap-3 shrink-0">
            <button
              onClick={() => (user ? onGoWorkspace() : onGoAuth('register'))}
              className="px-4 py-2 text-sm font-semibold text-white bg-red-600 rounded-lg hover:bg-red-700 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
            >
              {user ? 'Open Workspace' : 'Access Workspace'}
            </button>
          </div>
        </div>
      </header>

      {/* Hero Split (Black + Red + White) */}
      <section id="top" className="bg-black text-white border-b border-neutral-800">
        <div className="max-w-7xl mx-auto px-6 py-14 lg:py-20">
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-10 items-stretch">
            <div className="lg:col-span-6 flex flex-col justify-center">
              <p className="text-xs font-semibold tracking-wide text-red-500 mb-3">
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
                  className="px-6 py-3.5 bg-red-600 text-white text-sm font-semibold rounded-lg hover:bg-red-700 transition-colors inline-flex items-center gap-2 whitespace-nowrap cursor-pointer"
                >
                  {user ? 'Launch Trading Workspace' : 'Open Exness & Start Free'}
                  <ArrowUpRight className="w-4 h-4" />
                </button>
                <a
                  href={config.telegramUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="px-5 py-3.5 bg-neutral-900 border border-neutral-700 text-white text-sm font-semibold rounded-lg hover:bg-neutral-800 transition-colors inline-flex items-center gap-2 whitespace-nowrap"
                >
                  <Send className="w-4 h-4 text-red-500" />
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

            <div className="lg:col-span-6">
              <div className="h-full min-h-[340px] lg:min-h-[440px] rounded-xl overflow-hidden border border-neutral-800 bg-neutral-950">
                <ImageWithFallback
                  src={LANDING_IMAGES.heroTrader3d}
                  alt="3D quantitative forex trader analyzing candlestick markets at an architectural desk"
                  className="w-full h-full object-cover"
                />
              </div>
            </div>
          </div>

          {/* 4-Column Key Platform Strip */}
          <div className="mt-12 pt-10 border-t border-neutral-800 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
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
              <div className="text-2xl font-bold font-mono tabular-nums text-red-500">{config.commissionPct}%</div>
              <div className="text-sm font-semibold text-white mt-1">Influencer Commissions</div>
              <p className="text-xs text-neutral-400 mt-1">
                Earn instant referral credit on every $5.25 software license.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* Live Animated Market & ICT Liquidity Stream */}
      <section id="live-feed" className="bg-neutral-950 text-white py-14 lg:py-16 border-b border-neutral-800">
        <div className="max-w-7xl mx-auto px-6">
          <div className="max-w-2xl mb-8">
            <p className="text-xs font-semibold text-red-500 mb-2">Live Algorithmic Preview</p>
            <h2 className="text-2xl lg:text-3xl font-bold tracking-tight text-white" style={{ textWrap: 'balance' }}>
              Watch real-time price action sweep BSL/SSL liquidity and tap Fair Value Gaps.
            </h2>
          </div>

          <LiveMarketFeed
            quotes={quotes}
            onAction={() => (user ? onSelectProduct('analyzer') : onGoAuth('register'))}
            actionLabel={user ? 'Open Full Analyzer' : 'Start Free & Scan'}
          />
        </div>
      </section>

      {/* Capabilities Asymmetric Bento (Crisp White Contrast Band) */}
      <section id="capabilities" className="bg-white text-black py-16 lg:py-20">
        <div className="max-w-7xl mx-auto px-6">
          <div className="max-w-2xl mb-12">
            <p className="text-xs font-semibold text-red-600 mb-2">Core Architecture</p>
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
                  <div className="text-xs font-semibold text-red-600 mb-2">
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
                    className="text-sm font-semibold text-red-600 hover:text-red-700 cursor-pointer"
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
                  <div className="text-xs font-semibold text-red-600 mb-2">
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
                    className="text-sm font-semibold text-red-600 hover:text-red-700 cursor-pointer"
                  >
                    Get MQL5 Bots →
                  </button>
                </div>
              </div>
            </div>

            {/* Card 3: Education + Community */}
            <div id="education-preview" className="lg:col-span-12 bg-black text-white border border-neutral-800 rounded-xl overflow-hidden grid grid-cols-1 lg:grid-cols-12">
              <div className="lg:col-span-5 h-64 lg:h-auto bg-neutral-950">
                <ImageWithFallback
                  src={LANDING_IMAGES.mentorCommunity3d}
                  alt="3D trading mentor presenting Smart Money Concepts liquidity structure"
                  className="w-full h-full object-cover object-top"
                />
              </div>
              <div className="lg:col-span-7 p-8 flex flex-col justify-center">
                <div className="text-xs font-semibold text-red-500 mb-2">
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
                    <CheckCircle2 className="w-4 h-4 text-red-500 mt-0.5 shrink-0" />
                    <span>Unlimited Trading Journal with screenshot uploads &amp; analytics</span>
                  </div>
                  <div className="flex items-start gap-2.5">
                    <CheckCircle2 className="w-4 h-4 text-red-500 mt-0.5 shrink-0" />
                    <span>$10,000 Paper Trading Simulator &amp; 8 Risk Calculators</span>
                  </div>
                  <div className="flex items-start gap-2.5">
                    <CheckCircle2 className="w-4 h-4 text-red-500 mt-0.5 shrink-0" />
                    <span>Official TradingView Advanced Charts &amp; Economic Calendar</span>
                  </div>
                  <div className="flex items-start gap-2.5">
                    <CheckCircle2 className="w-4 h-4 text-red-500 mt-0.5 shrink-0" />
                    <span>Automated email confirmations &amp; encrypted session security</span>
                  </div>
                </div>
                <div className="flex flex-wrap gap-3">
                  <button
                    onClick={() => (user ? onGoWorkspace() : onGoAuth('register'))}
                    className="px-5 py-2.5 bg-red-600 text-white text-sm font-semibold rounded-lg hover:bg-red-700 transition-colors cursor-pointer"
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

      {/* Transparent Pricing (Black + Red + White) */}
      <section id="pricing" className="py-16 bg-neutral-950 text-white border-t border-b border-neutral-800">
        <div className="max-w-7xl mx-auto px-6">
          <div className="max-w-2xl mb-10">
            <p className="text-xs font-semibold text-red-500 mb-2">Transparent Access</p>
            <h2 className="text-3xl font-bold tracking-tight text-white">
              Free workspace for Exness traders. Two ${config.analyzerPriceUsd.toFixed(2)} pro modules.
            </h2>
            <p className="text-sm text-neutral-400 mt-2">
              Pay quickly with Crypto (USDT TRC20, USDT ERC20, or Bitcoin BTC) and mobile money checkout inside your workspace.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <div className="border border-neutral-800 rounded-xl p-7 flex flex-col justify-between bg-black">
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
                className="w-full py-2.5 border border-neutral-700 bg-neutral-900 text-white text-sm font-semibold rounded-lg hover:bg-neutral-800 transition-colors cursor-pointer"
              >
                {user ? 'Open Workspace' : 'Register via Exness IB'}
              </button>
            </div>

            <div className="border-2 border-red-600 rounded-xl p-7 flex flex-col justify-between bg-black">
              <div>
                <div className="text-xs font-semibold text-red-500 mb-1">ICT Algorithmic Scanner</div>
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
                className="w-full py-2.5 bg-red-600 text-white text-sm font-semibold rounded-lg hover:bg-red-700 transition-colors cursor-pointer"
              >
                Get ICT Analyzer — ${config.analyzerPriceUsd.toFixed(2)}
              </button>
            </div>

            <div className="border border-white rounded-xl p-7 flex flex-col justify-between bg-white text-black">
              <div>
                <div className="text-xs font-semibold text-red-600 mb-1">Full MQL5 Source + MT5 Connect</div>
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
          <div className="bg-black text-white border border-neutral-800 rounded-xl p-8 lg:p-10 flex flex-col lg:flex-row items-start lg:items-center justify-between gap-6">
            <div className="max-w-2xl">
              <div className="flex items-center gap-2 text-xs font-semibold text-red-500 mb-2">
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
                className="px-5 py-3 bg-red-600 text-white text-sm font-semibold rounded-lg hover:bg-red-700 transition-colors inline-flex items-center gap-2 whitespace-nowrap"
              >
                Open Exness Account
                <ArrowUpRight className="w-4 h-4" />
              </a>
              <button
                onClick={() => onGoAuth('login')}
                className="px-5 py-3 bg-neutral-900 border border-neutral-700 text-white text-sm font-semibold rounded-lg hover:bg-neutral-800 transition-colors whitespace-nowrap cursor-pointer"
              >
                Sign In
              </button>
            </div>
          </div>
        </div>
      </section>

      {/* Quiet Footer */}
      <footer className="bg-black text-neutral-400 border-t border-neutral-800 py-12">
        <div className="max-w-7xl mx-auto px-6 grid grid-cols-1 md:grid-cols-4 gap-8 text-sm">
          <div className="md:col-span-2">
            <BrandLogo variant="light" accent="red" size="md" className="mb-3" />
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
                className="px-4 py-2 bg-red-600 text-white text-xs font-semibold rounded-lg hover:bg-red-700 cursor-pointer"
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
