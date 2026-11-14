import { createClient, type SupabaseClient, type User as SupabaseAuthUser } from '@supabase/supabase-js';

export function getSupabaseEnvConfig() {
  const url = (process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || '').trim();
  const anonKey = (process.env.SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY || '').trim();
  const serviceRoleKey = (process.env.SUPABASE_SERVICE_ROLE_KEY || '').trim();
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
    serverClient = createClient(url, key, {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
    });
    serverSig = sig;
  }
  return serverClient;
}

export async function verifySupabaseAccessToken(accessToken: string): Promise<SupabaseAuthUser | null> {
  const supabase = getServerSupabaseClient();
  if (!supabase || !accessToken) return null;
  const { data, error } = await supabase.auth.getUser(accessToken);
  if (error || !data.user) {
    return null;
  }
  return data.user;
}
