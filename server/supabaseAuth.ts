import { createClient, type SupabaseClient, type User as SupabaseAuthUser } from '@supabase/supabase-js';

function normalizeSupabaseUrl(raw?: string): string {
  if (!raw || typeof raw !== 'string') return '';
  let val = raw.trim().replace(/^['"]+|['"]+$/g, '');
  if (!val || val === 'undefined' || val === 'null' || val.includes('MY_SUPABASE')) {
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
      return parsed.toString().replace(/\/+$/, '');
    }
  } catch {
    return '';
  }
  return '';
}

function normalizeKey(raw?: string): string {
  if (!raw || typeof raw !== 'string') return '';
  const val = raw.trim().replace(/^['"]+|['"]+$/g, '');
  if (!val || val === 'undefined' || val === 'null' || val.includes('MY_SUPABASE')) {
    return '';
  }
  return val;
}

export function getSupabaseEnvConfig() {
  const url = normalizeSupabaseUrl(
    process.env.SUPABASE_URL ||
      process.env.NEXT_PUBLIC_SUPABASE_URL ||
      process.env.VITE_SUPABASE_URL
  );
  const anonKey = normalizeKey(
    process.env.SUPABASE_ANON_KEY ||
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ||
      process.env.VITE_SUPABASE_ANON_KEY ||
      process.env.SUPABASE_PUBLISHABLE_KEY ||
      process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY
  );
  const serviceRoleKey = normalizeKey(process.env.SUPABASE_SERVICE_ROLE_KEY);
  return {
    configured: Boolean(url && (anonKey || serviceRoleKey)),
    url,
    anonKey,
    serviceRoleKey,
  };
}

let serverClient: SupabaseClient | null = null;
let serverSig = '';

export function getServerSupabaseClient(): SupabaseClient | null {
  const { url, anonKey, serviceRoleKey } = getSupabaseEnvConfig();
  const key = serviceRoleKey || anonKey;
  if (!url || !key) return null;

  const sig = `${url}::${key}`;
  if (!serverClient || serverSig !== sig) {
    try {
      serverClient = createClient(url, key, {
        auth: {
          autoRefreshToken: false,
          persistSession: false,
        },
      });
      serverSig = sig;
    } catch (err) {
      console.warn('Server Supabase client skipped due to invalid configuration:', err);
      return null;
    }
  }
  return serverClient;
}

export async function verifySupabaseAccessToken(accessToken: string): Promise<SupabaseAuthUser | null> {
  const supabase = getServerSupabaseClient();
  if (!supabase || !accessToken) return null;
  try {
    const { data, error } = await supabase.auth.getUser(accessToken);
    if (error || !data.user) {
      return null;
    }
    return data.user;
  } catch {
    return null;
  }
}
