import React, { useState } from 'react';
import { ArrowUpRight, ShieldCheck, Send, CheckCircle2, X } from 'lucide-react';
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
      'Influencers and partners who refer new traders using their GRIDPIPs referral link earn a commission percentage (default 20%) on qualifying $5.25 software module purchases, withdrawable via M-Pesa (Kenya KES) or USDT (TRC20).',
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
      'GRIDPIPs stores only the account details necessary to operate your trading workspace, journal records, Exness IB verification, order receipts (MegaPay M-Pesa receipts or Crypto TXIDs), and referral commissions.',
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
      <div className={`bg-gradient-to-br from-slate-900 to-slate-800 flex items-center justify-center p-6 text-slate-300 text-sm ${className || ''}`}>
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
    <div className="min-h-screen bg-slate-50 text-slate-900">
      {/* Live Market Ticker */}
      <div className="bg-slate-950 text-slate-200 border-b border-slate-800 h-9 overflow-hidden flex items-center">
        <div className="animate-ticker whitespace-nowrap">
          {[...quotes, ...quotes].map((q, idx) => {
            const up = q.chgPct >= 0;
            return (
              <span
                key={`${q.sym}-${idx}`}
                className="inline-flex items-center gap-2.5 px-5 text-xs font-mono tabular-nums border-r border-slate-800/80"
              >
                <span className="font-semibold text-white">{q.sym}</span>
                <span className="text-slate-300">{q.price.toFixed(q.digits)}</span>
                <span className={up ? 'text-emerald-400' : 'text-rose-400'}>
                  {up ? '+' : ''}
                  {q.chgPct.toFixed(2)}%
                </span>
              </span>
            );
          })}
        </div>
      </div>

      {/* Strict 3-Zone Top Bar Contract */}
      <header className="sticky top-0 z-40 bg-white/95 backdrop-blur-md border-b border-slate-200">
        <div className="max-w-7xl mx-auto px-6 h-16 flex items-center justify-between gap-8">
          <a href="#top" className="shrink-0">
            <BrandLogo variant="dark" size="md" />
          </a>

          <nav className="hidden md:flex items-center gap-7 text-sm font-medium text-slate-600">
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
            <a
              href={config.telegramUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="hover:text-slate-950 transition-colors whitespace-nowrap shrink-0"
            >
              Community
            </a>
          </nav>

          <div className="flex items-center gap-3 shrink-0">
            <button
              onClick={() => (user ? onGoWorkspace() : onGoAuth('register'))}
              className="px-4 py-2 text-sm font-semibold text-white bg-blue-600 rounded-lg hover:bg-blue-700 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
            >
              {user ? 'Open Workspace' : 'Access Workspace'}
            </button>
          </div>
        </div>
      </header>

      {/* Hero Split */}
      <section id="top" className="bg-white border-b border-slate-200">
        <div className="max-w-7xl mx-auto px-6 py-14 lg:py-20">
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-10 items-stretch">
            <div className="lg:col-span-6 flex flex-col justify-center">
              <p className="text-xs font-semibold tracking-wide text-blue-600 mb-3">
                GRIDPIPs · Exness IB Partner Workspace · ICT &amp; MQL5 Automation
              </p>
              <h1
                className="text-slate-950 font-bold tracking-tight mb-5"
                style={{ fontSize: 'clamp(2.25rem, 4vw, 3.65rem)', lineHeight: 1.08, textWrap: 'balance' }}
              >
                Institutional ICT market analysis and MQL5 automation in one trading desk.
              </h1>
              <p className="text-base lg:text-lg text-slate-600 leading-relaxed mb-8 max-w-xl">
                Scan Fair Value Gaps, Order Blocks, and Killzones with our ${config.analyzerPriceUsd.toFixed(2)} ICT Analyzer, run verified MQL5 Expert Advisors directly on MT5, and use our trading journal, 8 risk calculators, and paper trading workspace free through your Exness account.
              </p>
              <div className="flex flex-wrap items-center gap-4">
                <button
                  onClick={() => (user ? onGoWorkspace() : onGoAuth('register'))}
                  className="px-6 py-3.5 bg-blue-600 text-white text-sm font-semibold rounded-lg hover:bg-blue-700 transition-colors inline-flex items-center gap-2 whitespace-nowrap cursor-pointer"
                >
                  {user ? 'Launch Trading Workspace' : 'Open Exness & Start Free'}
                  <ArrowUpRight className="w-4 h-4" />
                </button>
                <a
                  href={config.telegramUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="px-5 py-3.5 bg-slate-100 text-slate-900 text-sm font-semibold rounded-lg hover:bg-slate-200 transition-colors inline-flex items-center gap-2 whitespace-nowrap"
                >
                  <Send className="w-4 h-4 text-blue-600" />
                  Join JakoyoFX Telegram
                </a>
              </div>
              <div className="mt-6 flex flex-wrap items-center gap-x-4 gap-y-2 text-xs text-slate-500">
                <span>M-Pesa MegaPay Till ({config.mpesaTillNumber}) &amp; Crypto (USDT / BTC)</span>
                <span aria-hidden="true">·</span>
                <span>Full MQL5 source code included</span>
                <span aria-hidden="true">·</span>
                <span>{config.commissionPct}% Influencer Referral Program</span>
              </div>
            </div>

            <div className="lg:col-span-6">
              <div className="h-full min-h-[340px] lg:min-h-[440px] rounded-xl overflow-hidden border border-slate-200 bg-slate-950">
                <ImageWithFallback
                  src={LANDING_IMAGES.heroTrader3d}
                  alt="3D quantitative forex trader analyzing candlestick markets at an architectural desk"
                  className="w-full h-full object-cover"
                />
              </div>
            </div>
          </div>

          {/* 4-Column Key Platform Strip */}
          <div className="mt-12 pt-10 border-t border-slate-200 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
            <div>
              <div className="text-2xl font-bold font-mono tabular-nums text-slate-950">
                ${config.analyzerPriceUsd.toFixed(2)}{' '}
                <span className="text-xs font-medium text-slate-500">· KES {config.analyzerPriceKes}</span>
              </div>
              <div className="text-sm font-semibold text-slate-800 mt-1">ICT Strategy Analyzer</div>
              <p className="text-xs text-slate-500 mt-1">
                FVG, Order Blocks, BSL/SSL sweeps, OTE Fibs, and Killzone bias.
              </p>
            </div>
            <div>
              <div className="text-2xl font-bold font-mono tabular-nums text-slate-950">
                ${config.eaBotsPriceUsd.toFixed(2)}{' '}
                <span className="text-xs font-medium text-slate-500">· KES {config.eaBotsPriceKes}</span>
              </div>
              <div className="text-sm font-semibold text-slate-800 mt-1">MQL5 EA Bots + MT5 Bridge</div>
              <p className="text-xs text-slate-500 mt-1">
                Download compilable .mq5 source code, setup guide, and connect MT5.
              </p>
            </div>
            <div>
              <div className="text-2xl font-bold font-mono tabular-nums text-emerald-700">Free</div>
              <div className="text-sm font-semibold text-slate-800 mt-1">Core Trading Workspace</div>
              <p className="text-xs text-slate-500 mt-1">
                Journal, analytics, 8 calculators, $10k paper trading, and TradingView charts.
              </p>
            </div>
            <div>
              <div className="text-2xl font-bold font-mono tabular-nums text-blue-600">{config.commissionPct}%</div>
              <div className="text-sm font-semibold text-slate-800 mt-1">Influencer Commissions</div>
              <p className="text-xs text-slate-500 mt-1">
                Earn instant referral credit on every $5.25 license via M-Pesa or USDT.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* Capabilities Asymmetric Bento with 3D Human Visuals */}
      <section id="capabilities" className="py-16 lg:py-20 max-w-7xl mx-auto px-6">
        <div className="max-w-2xl mb-12">
          <p className="text-xs font-semibold text-blue-600 mb-2">Core Architecture</p>
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
                <div className="text-xs font-medium text-slate-500 mb-2">
                  01. Market Intelligence · ${config.analyzerPriceUsd.toFixed(2)} (KES {config.analyzerPriceKes}) Unlock
                </div>
                <h3 className="text-xl font-bold text-slate-950 mb-2">
                  ICT Strategy Market Analyzer
                </h3>
                <p className="text-sm text-slate-600 leading-relaxed mb-5">
                  Engineered around the Inner Circle Trader methodology (YouTube channel {config.ictYoutubeChannelId}). Automatically maps Buy-Side and Sell-Side Liquidity pools, Displacement Fair Value Gaps, Order Blocks, Optimal Trade Entry (0.618–0.786), and active London/New York Killzones.
                </p>
              </div>
              <div className="flex items-center justify-between pt-4 border-t border-slate-100">
                <span className="text-xs font-mono text-slate-500">EURUSD · XAUUSD · NAS100 · BTCUSD</span>
                <button
                  onClick={() => (user ? onSelectProduct('analyzer') : onGoAuth('register'))}
                  className="text-sm font-semibold text-blue-600 hover:text-blue-700 cursor-pointer"
                >
                  Unlock Analyzer →
                </button>
              </div>
            </div>
          </div>

          {/* Card 2: MQL5 EA Bots */}
          <div className="lg:col-span-5 bg-white border border-slate-200 rounded-xl overflow-hidden flex flex-col">
            <div className="h-64 sm:h-72 overflow-hidden bg-slate-900 border-b border-slate-200">
              <ImageWithFallback
                src={LANDING_IMAGES.automatorEa3d}
                alt="3D algorithmic engineer coding MQL5 Expert Advisors"
                className="w-full h-full object-cover"
              />
            </div>
            <div className="p-7 flex-1 flex flex-col justify-between">
              <div>
                <div className="text-xs font-medium text-slate-500 mb-2">
                  02. Execution Bots · ${config.eaBotsPriceUsd.toFixed(2)} (KES {config.eaBotsPriceKes}) Source &amp; Docs
                </div>
                <h3 className="text-xl font-bold text-slate-950 mb-2">
                  MQL5 Expert Advisors &amp; MT5 Bridge
                </h3>
                <p className="text-sm text-slate-600 leading-relaxed mb-5">
                  Receive two clean, compilable MQL5 (.mq5) bots (ICT Silver Bullet FVG &amp; SMC Liquidity Sweep), complete step-by-step MetaTrader 5 installation documentation, and direct MT5 WebRequest bridge telemetry inside your GRIDPIPs dashboard.
                </p>
              </div>
              <div className="flex items-center justify-between pt-4 border-t border-slate-100">
                <span className="text-xs font-mono text-slate-500">.mq5 Source + Setup Guide</span>
                <button
                  onClick={() => (user ? onSelectProduct('ea_bots') : onGoAuth('register'))}
                  className="text-sm font-semibold text-blue-600 hover:text-blue-700 cursor-pointer"
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
              <div className="text-xs font-medium text-slate-500 mb-2">
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
                  <CheckCircle2 className="w-4 h-4 text-emerald-600 mt-0.5 shrink-0" />
                  <span>Unlimited Trading Journal with screenshot uploads &amp; analytics</span>
                </div>
                <div className="flex items-start gap-2.5">
                  <CheckCircle2 className="w-4 h-4 text-emerald-600 mt-0.5 shrink-0" />
                  <span>$10,000 Paper Trading Simulator &amp; 8 Risk Calculators</span>
                </div>
                <div className="flex items-start gap-2.5">
                  <CheckCircle2 className="w-4 h-4 text-emerald-600 mt-0.5 shrink-0" />
                  <span>Official TradingView Advanced Charts &amp; Economic Calendar</span>
                </div>
                <div className="flex items-start gap-2.5">
                  <CheckCircle2 className="w-4 h-4 text-emerald-600 mt-0.5 shrink-0" />
                  <span>Automated email confirmations &amp; encrypted session security</span>
                </div>
              </div>
              <div className="flex flex-wrap gap-3">
                <button
                  onClick={() => (user ? onGoWorkspace() : onGoAuth('register'))}
                  className="px-5 py-2.5 bg-slate-950 text-white text-sm font-semibold rounded-lg hover:bg-slate-800 transition-colors cursor-pointer"
                >
                  Start Free with Exness
                </button>
                <a
                  href={config.telegramUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="px-5 py-2.5 border border-slate-300 text-slate-800 text-sm font-semibold rounded-lg hover:border-slate-400 transition-colors inline-flex items-center gap-2"
                >
                  Open t.me/JakoyoFx
                  <ArrowUpRight className="w-4 h-4" />
                </a>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Transparent Pricing */}
      <section id="pricing" className="py-16 bg-white border-t border-b border-slate-200">
        <div className="max-w-7xl mx-auto px-6">
          <div className="max-w-2xl mb-10">
            <p className="text-xs font-semibold text-blue-600 mb-2">Transparent Access</p>
            <h2 className="text-3xl font-bold tracking-tight text-slate-950">
              Free workspace for Exness traders. Two ${config.analyzerPriceUsd.toFixed(2)} pro modules.
            </h2>
            <p className="text-sm text-slate-600 mt-2">
              Pay seamlessly via M-Pesa MegaPay Till ({config.mpesaTillNumber} · {config.mpesaMerchantName}) or Crypto (USDT TRC20, USDT ERC20, BTC).
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <div className="border border-slate-200 rounded-xl p-7 flex flex-col justify-between bg-slate-50/50">
              <div>
                <div className="text-xs font-medium text-slate-500 mb-1">For All Exness Registered Traders</div>
                <h3 className="text-lg font-bold text-slate-950">Core Trading Workspace</h3>
                <div className="text-3xl font-bold font-mono tabular-nums text-slate-950 my-4">$0</div>
                <ul className="space-y-2.5 text-sm text-slate-600 mb-6">
                  <li>· TradingView Charts &amp; Watchlist</li>
                  <li>· Unlimited Trading Journal &amp; Analytics</li>
                  <li>· 8 Risk, Lot Size &amp; Margin Calculators</li>
                  <li>· $10,000 Paper Trading Simulator</li>
                  <li>· ICT ({config.ictYoutubeChannelId}) &amp; SMC Lessons</li>
                </ul>
              </div>
              <button
                onClick={() => (user ? onGoWorkspace() : onGoAuth('register'))}
                className="w-full py-2.5 border border-slate-300 bg-white text-slate-900 text-sm font-semibold rounded-lg hover:bg-slate-100 transition-colors cursor-pointer"
              >
                {user ? 'Open Workspace' : 'Register via Exness IB'}
              </button>
            </div>

            <div className="border border-blue-600 rounded-xl p-7 flex flex-col justify-between bg-white">
              <div>
                <div className="text-xs font-semibold text-blue-600 mb-1">ICT Algorithmic Scanner</div>
                <h3 className="text-lg font-bold text-slate-950">ICT Strategy Market Analyzer</h3>
                <div className="my-4">
                  <span className="text-3xl font-bold font-mono tabular-nums text-slate-950">
                    ${config.analyzerPriceUsd.toFixed(2)}
                  </span>
                  <span className="ml-2 text-xs font-mono text-slate-500">· KES {config.analyzerPriceKes}</span>
                </div>
                <ul className="space-y-2.5 text-sm text-slate-600 mb-6">
                  <li>· Automated FVG (BISI / SIBI) Detection</li>
                  <li>· Bullish &amp; Bearish Order Block Mapping</li>
                  <li>· BSL / SSL Liquidity Sweep Targets</li>
                  <li>· 0.618–0.786 OTE &amp; NY Killzone Timing</li>
                  <li>· Actionable Entry, SL &amp; TP Projections</li>
                </ul>
              </div>
              <button
                onClick={() => (user ? onSelectProduct('analyzer') : onGoAuth('register'))}
                className="w-full py-2.5 bg-blue-600 text-white text-sm font-semibold rounded-lg hover:bg-blue-700 transition-colors cursor-pointer"
              >
                Unlock Analyzer — ${config.analyzerPriceUsd.toFixed(2)}
              </button>
            </div>

            <div className="border border-slate-200 rounded-xl p-7 flex flex-col justify-between bg-white">
              <div>
                <div className="text-xs font-medium text-slate-500 mb-1">Full MQL5 Source + MT5 Connect</div>
                <h3 className="text-lg font-bold text-slate-950">MQL5 EA Bots Pack</h3>
                <div className="my-4">
                  <span className="text-3xl font-bold font-mono tabular-nums text-slate-950">
                    ${config.eaBotsPriceUsd.toFixed(2)}
                  </span>
                  <span className="ml-2 text-xs font-mono text-slate-500">· KES {config.eaBotsPriceKes}</span>
                </div>
                <ul className="space-y-2.5 text-sm text-slate-600 mb-6">
                  <li>· GRIDPIPs ICT Silver Bullet EA (.mq5)</li>
                  <li>· GRIDPIPs SMC Order Block EA (.mq5)</li>
                  <li>· Complete MT5 Installation Guide</li>
                  <li>· Live MT5 Account Bridge Connection</li>
                  <li>· Automated Risk % &amp; Daily Drawdown Guard</li>
                </ul>
              </div>
              <button
                onClick={() => (user ? onSelectProduct('ea_bots') : onGoAuth('register'))}
                className="w-full py-2.5 bg-slate-950 text-white text-sm font-semibold rounded-lg hover:bg-slate-800 transition-colors cursor-pointer"
              >
                Buy MQL5 Bots — ${config.eaBotsPriceUsd.toFixed(2)}
              </button>
            </div>
          </div>
        </div>
      </section>

      {/* Exness IB Banner */}
      <section className="py-14 max-w-7xl mx-auto px-6">
        <div className="bg-slate-950 text-white rounded-xl p-8 lg:p-10 flex flex-col lg:flex-row items-start lg:items-center justify-between gap-6">
          <div className="max-w-2xl">
            <div className="flex items-center gap-2 text-xs font-medium text-blue-400 mb-2">
              <ShieldCheck className="w-4 h-4" />
              <span>Required Brokerage Onboarding</span>
            </div>
            <h3 className="text-2xl font-bold tracking-tight mb-2">
              Open your Exness trading account to unlock GRIDPIPs access.
            </h3>
            <p className="text-sm text-slate-300 leading-relaxed">
              Account creation, deposits, and trade execution occur directly on Exness. Register using our official IB partner link, then link your Exness Account ID to unlock both the free workspace and $5.25 pro modules.
            </p>
          </div>
          <div className="flex flex-wrap gap-3 shrink-0">
            <a
              href={config.exnessIbUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="px-5 py-3 bg-blue-600 text-white text-sm font-semibold rounded-lg hover:bg-blue-700 transition-colors inline-flex items-center gap-2 whitespace-nowrap"
            >
              Open Exness Account
              <ArrowUpRight className="w-4 h-4" />
            </a>
            <button
              onClick={() => onGoAuth('login')}
              className="px-5 py-3 bg-slate-800 text-white text-sm font-semibold rounded-lg hover:bg-slate-700 transition-colors whitespace-nowrap cursor-pointer"
            >
              Sign In
            </button>
          </div>
        </div>
      </section>

      {/* Quiet Footer */}
      <footer className="bg-slate-950 text-slate-400 border-t border-slate-800 py-12">
        <div className="max-w-7xl mx-auto px-6 grid grid-cols-1 md:grid-cols-4 gap-8 text-sm">
          <div className="md:col-span-2">
            <BrandLogo variant="light" size="md" className="mb-3" />
            <p className="text-xs text-slate-400 leading-relaxed max-w-md">
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
        <div className="max-w-7xl mx-auto px-6 mt-8 pt-6 border-t border-slate-900 text-xs text-slate-500 flex flex-col sm:flex-row justify-between gap-2">
          <span>© 2026 GRIDPIPs. All rights reserved.</span>
          <span>Secured with scrypt hashing, rate limiting, and HTTP-only signed sessions.</span>
        </div>
      </footer>

      {legalDoc && (
        <div className="fixed inset-0 z-50 bg-slate-950/60 flex items-center justify-center p-4">
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
                className="px-4 py-2 bg-slate-950 text-white text-xs font-semibold rounded-lg hover:bg-slate-800 cursor-pointer"
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
