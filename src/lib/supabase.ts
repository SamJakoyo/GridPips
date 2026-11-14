import { createClient, type SupabaseClient } from '@supabase/supabase-js';

let cachedClient: SupabaseClient | null = null;
let cachedKeySignature = '';

export function getSupabaseClient(runtimeUrl?: string, runtimeAnonKey?: string): SupabaseClient | null {
  const url = (runtimeUrl || import.meta.env.VITE_SUPABASE_URL || '').trim();
  const anonKey = (runtimeAnonKey || import.meta.env.VITE_SUPABASE_ANON_KEY || '').trim();

  if (!url || !anonKey) {
    return null;
  }

  const signature = `${url}::${anonKey}`;
  if (!cachedClient || cachedKeySignature !== signature) {
    cachedClient = createClient(url, anonKey, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: true,
      },
    });
    cachedKeySignature = signature;
  }
  return cachedClient;
}
