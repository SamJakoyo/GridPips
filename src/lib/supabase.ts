import { createClient, type SupabaseClient } from '@supabase/supabase-js';

let cachedClient: SupabaseClient | null = null;
let cachedKeySignature = '';

export function normalizeSupabaseUrl(raw?: string): string {
  if (!raw || typeof raw !== 'string') return '';
  let val = raw.trim().replace(/^['"]+|['"]+$/g, '');
  val = val.replace(/^(?:NEXT_PUBLIC_|VITE_)?SUPABASE_[A-Z_]*=/i, '').trim().replace(/^['"]+|['"]+$/g, '');
  if (!val || val === 'undefined' || val === 'null' || val.includes('MY_SUPABASE') || val.startsWith('sb_')) {
    return '';
  }

  const dashMatch = val.match(/supabase\.com\/dashboard\/project\/([a-z0-9]{16,32})/i);
  if (dashMatch) {
    return `https://${dashMatch[1]}.supabase.co`;
  }

  const dbHostMatch = val.match(/db\.([a-z0-9]{16,32})\.supabase\.co/i);
  if (dbHostMatch) {
    return `https://${dbHostMatch[1]}.supabase.co`;
  }

  const poolerUserMatch = val.match(/postgres\.([a-z0-9]{16,32})[:@]/i);
  if (/^postgres(ql)?:\/\//i.test(val) && poolerUserMatch) {
    return `https://${poolerUserMatch[1]}.supabase.co`;
  }

  if (/^[a-z0-9]{16,32}$/i.test(val)) {
    val = `https://${val}.supabase.co`;
  } else if (!/^https?:\/\//i.test(val) && val.includes('.supabase.')) {
    val = `https://${val}`;
  }

  try {
    const parsed = new URL(val);
    if (parsed.protocol === 'http:' || parsed.protocol === 'https:') {
      if (/\.supabase\.(co|in|net)$/i.test(parsed.hostname)) {
        return parsed.origin;
      }
      return parsed.toString().replace(/\/+$/, '');
    }
  } catch {
    return '';
  }
  return '';
}

function normalizePublicKey(raw?: string): string {
  if (!raw || typeof raw !== 'string') return '';
  const val = raw.trim().replace(/^['"]+|['"]+$/g, '');
  if (!val || val === 'undefined' || val === 'null' || val.includes('MY_SUPABASE') || val.startsWith('sb_secret_')) {
    return '';
  }
  if (val.startsWith('eyJ')) {
    try {
      const b64 = (val.split('.')[1] || '').replace(/-/g, '+').replace(/_/g, '/');
      const payload = JSON.parse(atob(b64)) as { role?: string };
      if (payload.role === 'service_role') return '';
    } catch {
      // ignore non-JWT
    }
  }
  return val;
}

export const DEFAULT_SUPABASE_URL = 'https://zxhbqwlnngggpseezcmn.supabase.co';

export function getSupabaseClient(runtimeUrl?: string, runtimeAnonKey?: string): SupabaseClient | null {
  const clientEnv = import.meta.env as Record<string, string | undefined>;
  const url =
    normalizeSupabaseUrl(runtimeUrl) ||
    normalizeSupabaseUrl(clientEnv.VITE_SUPABASE_URL) ||
    normalizeSupabaseUrl(clientEnv.NEXT_PUBLIC_SUPABASE_URL) ||
    DEFAULT_SUPABASE_URL;
  const anonKey =
    normalizePublicKey(runtimeAnonKey) ||
    normalizePublicKey(clientEnv.VITE_SUPABASE_ANON_KEY) ||
    normalizePublicKey(clientEnv.NEXT_PUBLIC_SUPABASE_ANON_KEY);

  if (!url || !anonKey) {
    return null;
  }

  const signature = `${url}::${anonKey}`;
  if (!cachedClient || cachedKeySignature !== signature) {
    try {
      cachedClient = createClient(url, anonKey, {
        auth: {
          flowType: 'pkce',
          persistSession: true,
          autoRefreshToken: true,
          detectSessionInUrl: true,
          storageKey: 'gridpips_supabase_auth',
        },
      });
      cachedKeySignature = signature;
    } catch (err) {
      console.warn('Supabase client skipped due to invalid configuration:', err);
      return null;
    }
  }
  return cachedClient;
}

export async function signOutSupabase(runtimeUrl?: string, runtimeAnonKey?: string): Promise<void> {
  const sb = getSupabaseClient(runtimeUrl, runtimeAnonKey);
  if (sb) {
    await sb.auth.signOut().catch(() => {});
  }
}
