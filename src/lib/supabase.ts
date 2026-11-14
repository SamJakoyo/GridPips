import { createClient, type SupabaseClient } from '@supabase/supabase-js';

let cachedClient: SupabaseClient | null = null;
let cachedKeySignature = '';

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
  if (!val || val === 'undefined' || val === 'null' || val.includes('MY_SUPABASE') || val.startsWith('sb_secret_')) {
    return '';
  }
  return val;
}

export function getSupabaseClient(runtimeUrl?: string, runtimeAnonKey?: string): SupabaseClient | null {
  const url = normalizeSupabaseUrl(runtimeUrl) || normalizeSupabaseUrl(import.meta.env.VITE_SUPABASE_URL);
  const anonKey = normalizeKey(runtimeAnonKey) || normalizeKey(import.meta.env.VITE_SUPABASE_ANON_KEY);

  if (!url || !anonKey) {
    return null;
  }

  const signature = `${url}::${anonKey}`;
  if (!cachedClient || cachedKeySignature !== signature) {
    try {
      cachedClient = createClient(url, anonKey, {
        auth: {
          persistSession: true,
          autoRefreshToken: true,
          detectSessionInUrl: true,
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
