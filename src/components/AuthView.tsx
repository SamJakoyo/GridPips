import React, { useEffect, useState } from 'react';
import { ArrowUpRight, Shield, Lock, CheckCircle2, ArrowLeft } from 'lucide-react';
import { apiFetch, setSessionToken } from '../lib/api';
import { getSupabaseClient, signOutSupabase } from '../lib/supabase';
import { BrandLogo } from './BrandLogo';
import { LANDING_IMAGES } from '../assets/landingImages';
import type { PublicConfig, User } from '../types';

export interface PendingOAuthUser {
  provider: 'supabase';
  uid: string;
  email: string;
  name: string;
  accessToken: string;
}

interface AuthViewProps {
  initialMode: 'login' | 'register';
  config: PublicConfig;
  initialReferralCode: string;
  initialPendingOAuth?: PendingOAuthUser | null;
  onSuccess: (user: User) => void;
  onBackLanding: () => void;
}

function formatAuthError(err: unknown): string {
  return err instanceof Error ? err.message : 'Authentication failed.';
}

export const AuthView: React.FC<AuthViewProps> = ({
  initialMode,
  config,
  initialReferralCode,
  initialPendingOAuth = null,
  onSuccess,
  onBackLanding,
}) => {
  const [mode, setMode] = useState<'login' | 'register'>(initialPendingOAuth ? 'register' : initialMode);
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [exnessAccountId, setExnessAccountId] = useState('');
  const [exnessConfirmed, setExnessConfirmed] = useState(false);
  const [referralCode, setReferralCode] = useState(initialReferralCode);
  const [openedExness, setOpenedExness] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [infoNotice, setInfoNotice] = useState(
    initialPendingOAuth
      ? `Account verified (${initialPendingOAuth.email}). Link your Exness Partner Account ID below to finish.`
      : ''
  );

  const [pendingOAuth, setPendingOAuth] = useState<PendingOAuthUser | null>(initialPendingOAuth);
  const supabase = getSupabaseClient(config.supabaseUrl, config.supabaseAnonKey);

  useEffect(() => {
    if (initialPendingOAuth) {
      setPendingOAuth(initialPendingOAuth);
      setMode('register');
      setInfoNotice(
        `Account verified (${initialPendingOAuth.email}). Link your Exness Partner Account ID below to finish.`
      );
    }
  }, [initialPendingOAuth]);

  async function completeSupabaseSession(params: {
    uid: string;
    accessToken: string;
    userName?: string;
    exnessId?: string;
    confirmed?: boolean;
  }) {
    const res = await fetch('/api/auth/supabase-session', {
      method: 'POST',
      credentials: 'include',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${params.accessToken}`,
      },
      body: JSON.stringify({
        name: params.userName || name,
        exnessAccountId: params.exnessId,
        exnessConfirmed: params.confirmed,
        referralCode,
      }),
    });

    const rawText = await res.text().catch(() => '');
    let data: Record<string, unknown> = {};
    if (rawText) {
      try {
        data = JSON.parse(rawText) as Record<string, unknown>;
      } catch {
        // non-JSON response
      }
    }

    if (res.status === 409 && data.needsExnessOnboarding) {
      setPendingOAuth({
        provider: 'supabase',
        uid: params.uid,
        email: (typeof data.email === 'string' && data.email) || email,
        name: (typeof data.name === 'string' && data.name) || name || 'Trader',
        accessToken: params.accessToken,
      });
      setMode('register');
      setInfoNotice(
        `Account verified (${(typeof data.email === 'string' && data.email) || email}). Complete Step 1 and enter your Exness Account ID below to enter.`
      );
      return;
    }

    if (!res.ok) {
      const serverErr =
        (typeof data.error === 'string' && data.error.trim()) ||
        (typeof data.message === 'string' && data.message.trim()) ||
        (rawText.trim() ? rawText.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 280) : '');
      throw new Error(serverErr || `Authentication failed (${res.status}).`);
    }

    if (typeof data.sessionToken === 'string' && data.sessionToken) {
      setSessionToken(data.sessionToken);
    }

    onSuccess(data.user as User);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    setInfoNotice('');

    if ((mode === 'register' || pendingOAuth) && (!exnessConfirmed || exnessAccountId.trim().length < 4)) {
      setError('Please enter your Exness Account ID (at least 4 characters) and check the Exness IB confirmation box.');
      return;
    }

    setLoading(true);
    try {
      if (pendingOAuth) {
        let freshSbToken = pendingOAuth.accessToken;
        if (supabase) {
          await supabase.auth
            .updateUser({
              data: {
                exness_account_id: exnessAccountId.trim().toUpperCase(),
                exness_verified: false,
                referral_code: referralCode.trim().toUpperCase() || undefined,
              },
            })
            .catch(() => {});
          const { data: sessData } = await supabase.auth.getSession().catch(() => ({ data: { session: null } }));
          if (sessData.session?.access_token) {
            freshSbToken = sessData.session.access_token;
          }
        }
        await completeSupabaseSession({
          uid: pendingOAuth.uid,
          accessToken: freshSbToken,
          userName: pendingOAuth.name,
          exnessId: exnessAccountId,
          confirmed: exnessConfirmed,
        });
        return;
      }

      if (mode === 'register') {
        const res = await apiFetch<{
          user?: User;
          sessionToken?: string;
          needsEmailConfirmation?: boolean;
          message?: string;
        }>('/api/auth/register', {
          method: 'POST',
          body: JSON.stringify({
            name: name.trim(),
            email: email.trim().toLowerCase(),
            password,
            exnessAccountId: exnessAccountId.trim().toUpperCase(),
            exnessConfirmed,
            referralCode: referralCode.trim().toUpperCase(),
          }),
        });
        if (res.needsEmailConfirmation) {
          setInfoNotice(res.message || 'Account created! Check your email inbox to confirm your address, then sign in.');
          setMode('login');
          return;
        }
        if (res.sessionToken) setSessionToken(res.sessionToken);
        if (res.user) onSuccess(res.user);
      } else {
        const res = await apiFetch<{ user: User; sessionToken?: string }>('/api/auth/login', {
          method: 'POST',
          body: JSON.stringify({
            email: email.trim().toLowerCase(),
            password,
          }),
        });
        if (res.sessionToken) setSessionToken(res.sessionToken);
        onSuccess(res.user);
      }
    } catch (err) {
      setError(formatAuthError(err));
    } finally {
      setLoading(false);
    }
  }

  return (
    <div
      className="min-h-screen bg-[#FAF9F6] text-slate-900 flex flex-col justify-center py-10 px-4 sm:px-6"
      style={{
        backgroundImage:
          'radial-gradient(circle at 18% 12%, rgba(229, 169, 60, 0.14), transparent 45%), radial-gradient(circle at 85% 85%, rgba(11, 15, 25, 0.05), transparent 45%)',
      }}
    >
      <div className="max-w-5xl w-full mx-auto">
        <div className="flex items-center justify-between gap-4 mb-6">
          <button
            onClick={onBackLanding}
            className="inline-flex items-center gap-1.5 text-sm font-medium text-slate-600 hover:text-slate-950 transition-colors cursor-pointer"
          >
            <ArrowLeft className="w-4 h-4" />
            Back to Grid Pips
          </button>
          <BrandLogo variant="dark" size="sm" />
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-stretch">
          {/* Left Obsidian & Gold Brand Visual Showcase */}
          <div className="hidden lg:flex lg:col-span-6 rounded-2xl overflow-hidden border border-slate-900 bg-[#0B0F19] flex-col justify-between shadow-lg">
            <div className="relative flex-1 bg-[#0B0F19] flex items-center justify-center p-4">
              <img
                src={LANDING_IMAGES.heroTrader3d}
                alt="Grid Pips institutional trading desk visual"
                className="w-full h-full object-cover rounded-xl border border-white/10"
              />
            </div>
            <div className="p-6 border-t border-white/10 bg-[#0E1320] space-y-2">
              <div className="text-xs font-semibold text-[#E5A93C] uppercase tracking-wider">
                Trade Smarter · Grow Bigger
              </div>
              <h2 className="text-xl font-bold text-white tracking-tight">
                Trade · <span className="text-[#E5A93C]">Invest</span> · Prosper
              </h2>
              <p className="text-xs text-slate-300 leading-relaxed">
                Link your Exness partner ID once to enter the institutional trading desk with live TradingView charts, the ICT Strategy Analyzer, and the standalone Ali Khan DRT Analyzer.
              </p>
            </div>
          </div>

          {/* Right Onboarding & Sign-In Card */}
          <div className="lg:col-span-6 bg-white border border-slate-200 rounded-2xl p-6 sm:p-8 flex flex-col justify-between shadow-sm">
            <div>
              <div className="flex items-center justify-between mb-6">
                <div>
                  <h1 className="text-2xl font-bold text-slate-950">
                    {pendingOAuth
                      ? 'Finish Exness IB Linking'
                      : mode === 'register'
                      ? 'Exness Account Onboarding'
                      : 'Sign in to Grid Pips'}
                  </h1>
                  <p className="text-sm text-slate-500 mt-1">
                    {pendingOAuth
                      ? `Signed in (${pendingOAuth.email}). Link your Exness Partner Account ID to enter.`
                      : mode === 'register'
                      ? 'Link your Exness IB account to access free tools and ICT / DRT analyzers.'
                      : 'Access your trading dashboard, ICT analyzer, and DRT analyzer.'}
                  </p>
                </div>
                <Shield className="w-6 h-6 text-[#D97706] shrink-0" />
              </div>

              {!pendingOAuth && (
                <div className="grid grid-cols-2 gap-1 p-1 bg-slate-100 border border-slate-200 rounded-xl mb-6">
                  <button
                    type="button"
                    onClick={() => {
                      setMode('register');
                      setError('');
                      setInfoNotice('');
                    }}
                    className={`py-2 text-xs font-semibold rounded-lg transition-colors cursor-pointer ${
                      mode === 'register'
                        ? 'bg-[#0B0F19] text-white shadow-xs'
                        : 'text-slate-600 hover:text-slate-950'
                    }`}
                  >
                    Register with Exness
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setMode('login');
                      setError('');
                      setInfoNotice('');
                    }}
                    className={`py-2 text-xs font-semibold rounded-lg transition-colors cursor-pointer ${
                      mode === 'login'
                        ? 'bg-[#0B0F19] text-white shadow-xs'
                        : 'text-slate-600 hover:text-slate-950'
                    }`}
                  >
                    Existing Member Login
                  </button>
                </div>
              )}

              {(mode === 'register' || pendingOAuth) && (
                <div className="mb-6 p-4 bg-amber-50/70 border border-amber-200 rounded-xl">
                  <div className="text-xs font-semibold text-slate-950 mb-1.5">
                    Step 1. Open your Exness brokerage account
                  </div>
                  <p className="text-xs text-slate-600 leading-relaxed mb-3">
                    Access to both free trading tools and ${config.analyzerPriceUsd.toFixed(2)}/mo ICT &amp; DRT Analyzer subscriptions requires registering your Exness account through our partner link.
                  </p>
                  <a
                    href={config.exnessIbUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    onClick={() => setOpenedExness(true)}
                    className="inline-flex items-center gap-2 px-4 py-2 bg-[#0B0F19] hover:bg-slate-800 text-[#E5A93C] text-xs font-semibold rounded-lg transition-colors"
                  >
                    Open Official Exness IB Link
                    <ArrowUpRight className="w-3.5 h-3.5" />
                  </a>
                  {openedExness && (
                    <div className="mt-2.5 flex items-center gap-1.5 text-xs text-emerald-700 font-medium">
                      <CheckCircle2 className="w-3.5 h-3.5" />
                      <span>Exness link opened. Enter your Exness Account ID below once created.</span>
                    </div>
                  )}
                </div>
              )}

              {infoNotice && (
                <div className="mb-5 p-3 bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs font-medium rounded-lg flex items-center justify-between gap-3">
                  <span>{infoNotice}</span>
                  {pendingOAuth && (
                    <button
                      type="button"
                      onClick={() => {
                        setPendingOAuth(null);
                        setInfoNotice('');
                        setError('');
                        void signOutSupabase(config.supabaseUrl, config.supabaseAnonKey);
                      }}
                      className="shrink-0 underline font-semibold text-emerald-900 hover:text-emerald-700 cursor-pointer"
                    >
                      Switch account
                    </button>
                  )}
                </div>
              )}

              {error && (
                <div className="mb-5 p-3 bg-rose-50 border border-rose-200 text-rose-700 text-xs font-medium rounded-lg">
                  {error}
                </div>
              )}

              <form onSubmit={handleSubmit} className="space-y-4">
                {(mode === 'register' || pendingOAuth) && (
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                      Exness Account ID / Trading Login
                    </label>
                    <input
                      type="text"
                      required
                      value={exnessAccountId}
                      onChange={(e) => setExnessAccountId(e.target.value)}
                      placeholder="e.g. EXN-29481024 or MT5 Login"
                      className="w-full px-3.5 py-2.5 text-sm bg-white text-slate-900 placeholder:text-slate-400 border border-slate-300 rounded-lg focus:outline-none focus:border-amber-500 font-mono"
                    />
                  </div>
                )}

                {!pendingOAuth && mode === 'register' && (
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                      Full Name
                    </label>
                    <input
                      type="text"
                      required
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                      placeholder="Daniel Mwangi"
                      className="w-full px-3.5 py-2.5 text-sm bg-white text-slate-900 placeholder:text-slate-400 border border-slate-300 rounded-lg focus:outline-none focus:border-amber-500"
                    />
                  </div>
                )}

                {!pendingOAuth && (
                  <>
                    <div>
                      <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                        Email Address
                      </label>
                      <input
                        type="email"
                        required
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                        placeholder="trader@example.com"
                        className="w-full px-3.5 py-2.5 text-sm bg-white text-slate-900 placeholder:text-slate-400 border border-slate-300 rounded-lg focus:outline-none focus:border-amber-500"
                      />
                    </div>

                    <div>
                      <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                        Password
                      </label>
                      <input
                        type="password"
                        required
                        minLength={mode === 'register' ? 8 : 6}
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        placeholder={mode === 'register' ? 'Minimum 8 characters' : 'Enter your password'}
                        className="w-full px-3.5 py-2.5 text-sm bg-white text-slate-900 placeholder:text-slate-400 border border-slate-300 rounded-lg focus:outline-none focus:border-amber-500"
                      />
                    </div>
                  </>
                )}

                {(mode === 'register' || pendingOAuth) && (
                  <>
                    <div>
                      <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                        Influencer Referral Code (Optional)
                      </label>
                      <input
                        type="text"
                        value={referralCode}
                        onChange={(e) => setReferralCode(e.target.value)}
                        placeholder="e.g. TRADER100"
                        className="w-full px-3.5 py-2.5 text-sm bg-white text-slate-900 placeholder:text-slate-400 border border-slate-300 rounded-lg focus:outline-none focus:border-amber-500 font-mono uppercase"
                      />
                    </div>

                    <label className="flex items-start gap-2.5 text-xs text-slate-600 cursor-pointer pt-1">
                      <input
                        type="checkbox"
                        checked={exnessConfirmed}
                        onChange={(e) => setExnessConfirmed(e.target.checked)}
                        className="mt-0.5 rounded border-slate-300 text-amber-600 focus:ring-amber-500"
                      />
                      <span>
                        I confirm I registered my Exness account via the Grid Pips Exness IB link and agree to automated email notifications.
                      </span>
                    </label>
                  </>
                )}

                <button
                  type="submit"
                  disabled={loading}
                  className="w-full py-3 bg-[#E5A93C] hover:bg-[#d6982b] text-[#090806] text-sm font-bold rounded-xl disabled:opacity-60 transition-colors cursor-pointer"
                >
                  {loading
                    ? 'Authenticating...'
                    : pendingOAuth
                    ? 'Link Exness & Enter Dashboard'
                    : mode === 'register'
                    ? 'Link Exness & Create Account'
                    : 'Sign In Securely'}
                </button>
              </form>
            </div>

            <div className="mt-6 pt-4 border-t border-slate-200 flex items-center justify-between text-xs text-slate-500">
              <span className="inline-flex items-center gap-1.5">
                <Lock className="w-3.5 h-3.5 text-[#D97706]" />
                Encrypted Session Protected
              </span>
              <a
                href={config.telegramUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="text-[#B45309] hover:underline font-medium"
              >
                Need help? t.me/JakoyoFx
              </a>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
