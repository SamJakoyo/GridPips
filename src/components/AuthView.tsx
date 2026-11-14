import React, { useState } from 'react';
import { signInWithPopup } from 'firebase/auth';
import { ArrowUpRight, Shield, Lock, CheckCircle2, ArrowLeft } from 'lucide-react';
import { apiFetch, setSessionToken } from '../lib/api';
import { auth, googleProvider } from '../lib/firebase';
import { syncFirestoreTraderProfile } from '../lib/firestoreStore';
import { getSupabaseClient } from '../lib/supabase';
import { BrandLogo } from './BrandLogo';
import type { PublicConfig, User } from '../types';

interface AuthViewProps {
  initialMode: 'login' | 'register';
  config: PublicConfig;
  initialReferralCode: string;
  onSuccess: (user: User) => void;
  onBackLanding: () => void;
}

interface PendingOAuthUser {
  provider: 'firebase' | 'supabase';
  uid: string;
  email: string;
  name: string;
  accessToken: string;
}

function formatAuthError(err: unknown): string {
  const msg = err instanceof Error ? err.message : 'Authentication failed.';
  if (msg.includes('auth/popup-blocked')) {
    return 'Popup was blocked by your browser. Allow popups for this site or sign in with email credentials below.';
  }
  if (msg.includes('auth/popup-closed-by-user')) {
    return 'Sign-in window was closed before completion. Please try again.';
  }
  if (msg.includes('auth/unauthorized-domain')) {
    return 'This preview domain is not authorized in Firebase Auth settings. Use email credentials or Supabase Auth below.';
  }
  return msg;
}

export const AuthView: React.FC<AuthViewProps> = ({
  initialMode,
  config,
  initialReferralCode,
  onSuccess,
  onBackLanding,
}) => {
  const [mode, setMode] = useState<'login' | 'register'>(initialMode);
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [exnessAccountId, setExnessAccountId] = useState('');
  const [exnessConfirmed, setExnessConfirmed] = useState(false);
  const [referralCode, setReferralCode] = useState(initialReferralCode);
  const [openedExness, setOpenedExness] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [infoNotice, setInfoNotice] = useState('');

  const [pendingOAuth, setPendingOAuth] = useState<PendingOAuthUser | null>(null);
  const supabase = getSupabaseClient(config.supabaseUrl, config.supabaseAnonKey);

  async function completeFirebaseSession(params: {
    uid: string;
    idToken: string;
    exnessId?: string;
    confirmed?: boolean;
  }) {
    const res = await fetch('/api/auth/firebase-session', {
      method: 'POST',
      credentials: 'include',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${params.idToken}`,
      },
      body: JSON.stringify({
        exnessAccountId: params.exnessId,
        exnessConfirmed: params.confirmed,
        referralCode,
      }),
    });

    const data = await res.json().catch(() => ({}));
    if (res.status === 409 && data.needsExnessOnboarding) {
      setPendingOAuth({
        provider: 'firebase',
        uid: params.uid,
        email: data.email || '',
        name: data.name || 'Trader',
        accessToken: params.idToken,
      });
      setMode('register');
      return;
    }

    if (!res.ok) {
      throw new Error(data.error || 'Google Sign-In failed.');
    }

    if (data.sessionToken) {
      setSessionToken(data.sessionToken);
    }

    const signedUser = data.user as User;
    await syncFirestoreTraderProfile({
      uid: params.uid,
      displayName: signedUser.name,
      email: signedUser.email,
      exnessAccountId: signedUser.exnessAccountId,
    }).catch((fsErr) => console.error('Firestore profile sync error:', fsErr));

    onSuccess(signedUser);
  }

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

    const data = await res.json().catch(() => ({}));
    if (res.status === 409 && data.needsExnessOnboarding) {
      setPendingOAuth({
        provider: 'supabase',
        uid: params.uid,
        email: data.email || email,
        name: data.name || name || 'Trader',
        accessToken: params.accessToken,
      });
      setMode('register');
      return;
    }

    if (!res.ok) {
      throw new Error(data.error || 'Supabase authentication failed.');
    }

    if (data.sessionToken) {
      setSessionToken(data.sessionToken);
    }

    onSuccess(data.user as User);
  }

  async function handleGoogleSignIn() {
    setError('');
    setInfoNotice('');
    setLoading(true);
    try {
      const cred = await signInWithPopup(auth, googleProvider);
      const idToken = await cred.user.getIdToken();
      await completeFirebaseSession({
        uid: cred.user.uid,
        idToken,
        exnessId: exnessAccountId,
        confirmed: exnessConfirmed,
      });
    } catch (err) {
      const code = err instanceof Error ? err.message : '';
      if (supabase && (code.includes('auth/unauthorized-domain') || code.includes('auth/popup-blocked'))) {
        const { error: oauthErr } = await supabase.auth.signInWithOAuth({
          provider: 'google',
          options: { redirectTo: window.location.origin },
        });
        if (oauthErr) {
          setError(oauthErr.message);
        }
      } else {
        setError(formatAuthError(err));
      }
    } finally {
      setLoading(false);
    }
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
        if (pendingOAuth.provider === 'supabase') {
          if (supabase) {
            await supabase.auth
              .updateUser({
                data: {
                  exness_account_id: exnessAccountId.trim().toUpperCase(),
                  exness_verified: true,
                  referral_code: referralCode.trim().toUpperCase() || undefined,
                },
              })
              .catch(() => {});
          }
          await completeSupabaseSession({
            uid: pendingOAuth.uid,
            accessToken: pendingOAuth.accessToken,
            userName: pendingOAuth.name,
            exnessId: exnessAccountId,
            confirmed: exnessConfirmed,
          });
        } else {
          await completeFirebaseSession({
            uid: pendingOAuth.uid,
            idToken: pendingOAuth.accessToken,
            exnessId: exnessAccountId,
            confirmed: exnessConfirmed,
          });
        }
        return;
      }

      // If Supabase is configured, authenticate directly against Supabase Auth first and bridge into Grid Pips
      if (supabase) {
        if (mode === 'register') {
          const { data, error: sbErr } = await supabase.auth.signUp({
            email: email.trim().toLowerCase(),
            password,
            options: {
              data: {
                full_name: name.trim(),
                exness_account_id: exnessAccountId.trim().toUpperCase(),
              },
            },
          });
          if (sbErr) throw new Error(sbErr.message);

          if (data.session?.access_token && data.user) {
            await completeSupabaseSession({
              uid: data.user.id,
              accessToken: data.session.access_token,
              userName: name.trim(),
              exnessId: exnessAccountId,
              confirmed: exnessConfirmed,
            });
            return;
          }

          // Supabase email confirmation enabled: still activate local workspace or prompt confirmation
          setInfoNotice(
            'Account created in Supabase! Check your email inbox to confirm your address, then sign in.'
          );
          setMode('login');
          return;
        } else {
          const { data, error: sbErr } = await supabase.auth.signInWithPassword({
            email: email.trim().toLowerCase(),
            password,
          });
          if (!sbErr && data.session?.access_token && data.user) {
            await completeSupabaseSession({
              uid: data.user.id,
              accessToken: data.session.access_token,
              exnessId: exnessAccountId,
              confirmed: exnessConfirmed,
            });
            return;
          }
          // Fall back to server scrypt check for existing pre-Supabase accounts (e.g. admin)
          if (sbErr && !sbErr.message.toLowerCase().includes('invalid login credentials')) {
            throw new Error(sbErr.message);
          }
        }
      }

      if (mode === 'register') {
        const res = await apiFetch<{ user: User; sessionToken?: string }>('/api/auth/register', {
          method: 'POST',
          body: JSON.stringify({
            name,
            email,
            password,
            exnessAccountId,
            exnessConfirmed,
            referralCode,
          }),
        });
        if (res.sessionToken) setSessionToken(res.sessionToken);
        onSuccess(res.user);
      } else {
        const res = await apiFetch<{ user: User; sessionToken?: string }>('/api/auth/login', {
          method: 'POST',
          body: JSON.stringify({ email, password }),
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
    <div className="min-h-screen bg-slate-50 flex flex-col justify-center py-12 px-4 sm:px-6">
      <div className="max-w-lg w-full mx-auto">
        <button
          onClick={onBackLanding}
          className="inline-flex items-center gap-1.5 text-sm font-medium text-slate-600 hover:text-slate-950 mb-6 cursor-pointer"
        >
          <ArrowLeft className="w-4 h-4" />
          Back to Grid Pips
        </button>

        <div className="bg-white border border-slate-200 rounded-xl p-8">
          <div className="mb-5 pb-4 border-b border-slate-100 flex items-center justify-between">
            <BrandLogo variant="dark" size="sm" />
            {supabase && (
              <span className="text-[11px] font-medium text-emerald-700">
                Supabase Connected
              </span>
            )}
          </div>
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
                  ? 'Link your Exness IB account to unlock free tools and paid modules.'
                  : 'Access your trading workspace, ICT analyzer, and EA bots.'}
              </p>
            </div>
            <Shield className="w-6 h-6 text-blue-600 shrink-0" />
          </div>

          {!pendingOAuth && (
            <>
              <button
                type="button"
                disabled={loading}
                onClick={handleGoogleSignIn}
                className="w-full mb-5 py-2.5 px-4 bg-white border border-slate-300 text-slate-900 text-sm font-semibold rounded-lg hover:bg-slate-50 transition-colors inline-flex items-center justify-center gap-2.5 cursor-pointer"
              >
                <svg className="w-4 h-4" viewBox="0 0 24 24" aria-hidden="true">
                  <path
                    fill="#4285F4"
                    d="M23.745 12.27c0-.7-.06-1.4-.19-2.07H12v4.51h6.6c-.29 1.52-1.14 2.82-2.4 3.68v3.05h3.88c2.27-2.09 3.665-5.17 3.665-9.17Z"
                  />
                  <path
                    fill="#34A853"
                    d="M12 24c3.24 0 5.95-1.08 7.93-2.91l-3.88-3.05c-1.08.72-2.45 1.16-4.05 1.16-3.12 0-5.77-2.11-6.72-4.96H1.29v3.14C3.26 21.3 7.31 24 12 24Z"
                  />
                  <path
                    fill="#FBBC05"
                    d="M5.28 14.24c-.24-.72-.38-1.49-.38-2.24s.14-1.52.38-2.24V6.62H1.29C.47 8.24 0 10.06 0 12s.47 3.76 1.29 5.38l3.99-3.14Z"
                  />
                  <path
                    fill="#EA4335"
                    d="M12 4.75c1.77 0 3.35.61 4.6 1.8l3.42-3.42C17.95 1.19 15.24 0 12 0 7.31 0 3.26 2.7 1.29 6.62l3.99 3.14c.95-2.85 3.6-4.96 6.72-4.96Z"
                  />
                </svg>
                Continue with Google
              </button>

              <div className="relative mb-5">
                <div className="absolute inset-0 flex items-center">
                  <div className="w-full border-t border-slate-200" />
                </div>
                <div className="relative flex justify-center text-xs">
                  <span className="px-2 bg-white text-slate-400">or use email credentials</span>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-1 p-1 bg-slate-100 rounded-lg mb-6">
                <button
                  type="button"
                  onClick={() => {
                    setMode('register');
                    setError('');
                    setInfoNotice('');
                  }}
                  className={`py-2 text-xs font-semibold rounded-md transition-colors cursor-pointer ${
                    mode === 'register' ? 'bg-white text-slate-950 shadow-sm' : 'text-slate-600 hover:text-slate-950'
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
                  className={`py-2 text-xs font-semibold rounded-md transition-colors cursor-pointer ${
                    mode === 'login' ? 'bg-white text-slate-950 shadow-sm' : 'text-slate-600 hover:text-slate-950'
                  }`}
                >
                  Existing Member Login
                </button>
              </div>
            </>
          )}

          {(mode === 'register' || pendingOAuth) && (
            <div className="mb-6 p-4 bg-slate-50 border border-slate-200 rounded-lg">
              <div className="text-xs font-semibold text-slate-900 mb-1.5">
                Step 1. Open your Exness brokerage account
              </div>
              <p className="text-xs text-slate-600 leading-relaxed mb-3">
                Access to both free workspace tools and $5.25 pro software requires registering your Exness account through our partner link.
              </p>
              <a
                href={config.exnessIbUrl}
                target="_blank"
                rel="noopener noreferrer"
                onClick={() => setOpenedExness(true)}
                className="inline-flex items-center gap-2 px-4 py-2 bg-slate-950 text-white text-xs font-semibold rounded-lg hover:bg-slate-800 transition-colors"
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
            <div className="mb-5 p-3 bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs font-medium rounded-lg">
              {infoNotice}
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
                  className="w-full px-3.5 py-2.5 text-sm border border-slate-300 rounded-lg focus:outline-none focus:border-blue-600 font-mono"
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
                  placeholder="Samuel Jakoyo"
                  className="w-full px-3.5 py-2.5 text-sm border border-slate-300 rounded-lg focus:outline-none focus:border-blue-600"
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
                    className="w-full px-3.5 py-2.5 text-sm border border-slate-300 rounded-lg focus:outline-none focus:border-blue-600"
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
                    className="w-full px-3.5 py-2.5 text-sm border border-slate-300 rounded-lg focus:outline-none focus:border-blue-600"
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
                    placeholder="e.g. JAKOYO"
                    className="w-full px-3.5 py-2.5 text-sm border border-slate-300 rounded-lg focus:outline-none focus:border-blue-600 font-mono uppercase"
                  />
                </div>

                <label className="flex items-start gap-2.5 text-xs text-slate-600 cursor-pointer pt-1">
                  <input
                    type="checkbox"
                    checked={exnessConfirmed}
                    onChange={(e) => setExnessConfirmed(e.target.checked)}
                    className="mt-0.5 rounded border-slate-300 text-blue-600"
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
              className="w-full py-3 bg-blue-600 text-white text-sm font-semibold rounded-lg hover:bg-blue-700 disabled:opacity-60 transition-colors cursor-pointer"
            >
              {loading
                ? 'Authenticating...'
                : pendingOAuth
                ? 'Link Exness & Enter Workspace'
                : mode === 'register'
                ? 'Complete Exness Verification & Enter'
                : 'Sign In Securely'}
            </button>
          </form>

          <div className="mt-6 pt-4 border-t border-slate-100 flex items-center justify-between text-xs text-slate-500">
            <span className="inline-flex items-center gap-1.5">
              <Lock className="w-3.5 h-3.5" />
              {supabase ? 'Supabase + Session Token Protected' : 'Encrypted Session Protected'}
            </span>
            <a
              href={config.telegramUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="text-blue-600 hover:underline font-medium"
            >
              Need help? t.me/JakoyoFx
            </a>
          </div>
        </div>
      </div>
    </div>
  );
};
