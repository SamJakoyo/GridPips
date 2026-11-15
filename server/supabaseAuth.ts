import { createClient, type SupabaseClient, type User as SupabaseAuthUser } from '@supabase/supabase-js';

export type SupabaseConfigStatus = 'connected' | 'missing_url' | 'missing_key' | 'not_configured';

export interface SupabaseEnvConfig {
  configured: boolean;
  status: SupabaseConfigStatus;
  url: string;
  anonKey: string;
  serviceRoleKey: string;
  hasSecretKeyMisplacedInUrl: boolean;
  missingEnvVars: string[];
}

export interface SupabaseProfileRecord {
  id: string;
  email: string;
  full_name: string;
  role: 'user' | 'influencer' | 'admin';
  exness_account_id: string;
  exness_verified: boolean;
  referral_code: string;
  has_analyzer: boolean;
  has_ea_bots: boolean;
  created_at?: string;
  updated_at?: string;
}

function normalizeSupabaseUrl(raw?: string): string {
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

function normalizeKey(raw?: string): string {
  if (!raw || typeof raw !== 'string') return '';
  const val = raw.trim().replace(/^['"]+|['"]+$/g, '');
  if (!val || val === 'undefined' || val === 'null' || val.includes('MY_SUPABASE')) {
    return '';
  }
  return val;
}

function isSecretSupabaseKey(val: string): boolean {
  if (!val) return false;
  if (val.startsWith('sb_secret_')) return true;
  if (val.startsWith('eyJ')) {
    try {
      const payload = JSON.parse(Buffer.from(val.split('.')[1] || '', 'base64url').toString('utf8')) as {
        role?: string;
      };
      if (payload.role === 'service_role') return true;
    } catch {
      // ignore non-JWT
    }
  }
  return false;
}

function normalizePublicAnonKey(raw?: string): string {
  const val = normalizeKey(raw);
  if (!val || isSecretSupabaseKey(val)) {
    return '';
  }
  return val;
}

export const DEFAULT_SUPABASE_URL = 'https://zxhbqwlnngggpseezcmn.supabase.co';

export function getSupabaseEnvConfig(): SupabaseEnvConfig {
  const rawUrlCandidates = [
    process.env.SUPABASE_URL,
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.VITE_SUPABASE_URL,
    process.env.STORAGE_SUPABASE_URL,
    process.env.SUPABASE_PROJECT_URL,
    process.env.SUPABASE_PROJECT_REF,
    process.env.SUPABASE_PROJECT_ID,
    process.env.SUPABASE_DB_URL,
    process.env.POSTGRES_URL,
    process.env.POSTGRES_URL_NON_POOLING,
    process.env.POSTGRES_PRISMA_URL,
    process.env.DATABASE_URL,
  ];

  const hasSecretKeyMisplacedInUrl = rawUrlCandidates.some(
    (v) => typeof v === 'string' && isSecretSupabaseKey(v.trim())
  );

  let url = '';
  for (const candidate of rawUrlCandidates) {
    const normalized = normalizeSupabaseUrl(candidate);
    if (normalized) {
      url = normalized;
      break;
    }
  }
  if (!url) {
    url = DEFAULT_SUPABASE_URL;
  }

  const publicKeyCandidates = [
    process.env.SUPABASE_ANON_KEY,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    process.env.VITE_SUPABASE_ANON_KEY,
    process.env.SUPABASE_PUBLISHABLE_KEY,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
    process.env.VITE_SUPABASE_PUBLISHABLE_KEY,
    process.env.SUPABASE_PUBLISHABLE_DEFAULT_KEY,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_DEFAULT_KEY,
    process.env.VITE_SUPABASE_PUBLISHABLE_DEFAULT_KEY,
  ];

  let anonKey = '';
  for (const candidate of publicKeyCandidates) {
    const normalized = normalizePublicAnonKey(candidate);
    if (normalized) {
      anonKey = normalized;
      break;
    }
  }

  const serviceRoleKey =
    normalizeKey(process.env.SUPABASE_SERVICE_ROLE_KEY) ||
    normalizeKey(process.env.SUPABASE_SERVICE_KEY) ||
    normalizeKey(process.env.SUPABASE_SECRET_KEY) ||
    rawUrlCandidates
      .map((v) => normalizeKey(v))
      .find((v) => isSecretSupabaseKey(v)) ||
    '';

  const missingEnvVars: string[] = [];
  if (!url) missingEnvVars.push('SUPABASE_URL');
  if (!anonKey) missingEnvVars.push('SUPABASE_ANON_KEY');
  if (!serviceRoleKey) missingEnvVars.push('SUPABASE_SERVICE_ROLE_KEY');

  const hasAnyKey = Boolean(anonKey || serviceRoleKey);
  let status: SupabaseConfigStatus = 'not_configured';
  if (url && anonKey) {
    status = 'connected';
  } else if (!url && hasAnyKey) {
    status = 'missing_url';
  } else if (url && !anonKey) {
    status = 'missing_key';
  }

  return {
    configured: Boolean(url && anonKey),
    status,
    url,
    anonKey,
    serviceRoleKey,
    hasSecretKeyMisplacedInUrl,
    missingEnvVars,
  };
}

let serverPublicClient: SupabaseClient | null = null;
let serverPublicSig = '';

let serverAdminClient: SupabaseClient | null = null;
let serverAdminSig = '';

export function getServerSupabaseClient(): SupabaseClient | null {
  const { url, anonKey, serviceRoleKey } = getSupabaseEnvConfig();
  const key = anonKey || serviceRoleKey;
  if (!url || !key) return null;

  const sig = `${url}::${key}`;
  if (!serverPublicClient || serverPublicSig !== sig) {
    try {
      serverPublicClient = createClient(url, key, {
        auth: {
          autoRefreshToken: false,
          persistSession: false,
        },
      });
      serverPublicSig = sig;
    } catch (err) {
      console.error('Server Supabase client initialization failed:', err);
      return null;
    }
  }
  return serverPublicClient;
}

export function getServerSupabaseAdminClient(): SupabaseClient | null {
  const { url, serviceRoleKey } = getSupabaseEnvConfig();
  if (!url || !serviceRoleKey) return null;

  const sig = `${url}::${serviceRoleKey}`;
  if (!serverAdminClient || serverAdminSig !== sig) {
    try {
      serverAdminClient = createClient(url, serviceRoleKey, {
        auth: {
          autoRefreshToken: false,
          persistSession: false,
        },
      });
      serverAdminSig = sig;
    } catch (err) {
      console.error('Server Supabase admin client initialization failed:', err);
      return null;
    }
  }
  return serverAdminClient;
}

function getScopedUserSupabaseClient(accessToken: string): SupabaseClient | null {
  const { url, anonKey } = getSupabaseEnvConfig();
  if (!url || !anonKey || !accessToken) return null;
  return createClient(url, anonKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
    global: {
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    },
  });
}

export async function upsertSupabaseProfile(
  profile: Omit<SupabaseProfileRecord, 'created_at' | 'updated_at'>,
  userAccessToken?: string
): Promise<{ profile: SupabaseProfileRecord | null; error: string | null }> {
  const client =
    getServerSupabaseAdminClient() ||
    (userAccessToken ? getScopedUserSupabaseClient(userAccessToken) : null);

  if (!client) {
    const cfg = getSupabaseEnvConfig();
    const missing = cfg.missingEnvVars.join(', ') || 'SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY';
    return {
      profile: null,
      error: `Cannot write to Supabase profiles table. Missing server env variable(s): ${missing}`,
    };
  }

  const { data, error } = await client
    .from('profiles')
    .upsert(
      {
        ...profile,
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'id' }
    )
    .select('*')
    .single();

  if (error) {
    console.error('Supabase profiles upsert error:', error);
    return {
      profile: null,
      error: `Supabase profiles error (${error.code || 'DB_ERROR'}): ${error.message}`,
    };
  }

  return { profile: data as SupabaseProfileRecord, error: null };
}

export async function fetchSupabaseProfileById(
  userId: string,
  userAccessToken?: string
): Promise<{ profile: SupabaseProfileRecord | null; error: string | null }> {
  const client =
    getServerSupabaseAdminClient() ||
    (userAccessToken ? getScopedUserSupabaseClient(userAccessToken) : null);

  if (!client) {
    return { profile: null, error: 'Supabase server client not configured.' };
  }

  const { data, error } = await client.from('profiles').select('*').eq('id', userId).maybeSingle();
  if (error) {
    console.error('Supabase profiles select error:', error);
    return {
      profile: null,
      error: `Supabase profiles query error (${error.code || 'DB_ERROR'}): ${error.message}`,
    };
  }

  return { profile: (data as SupabaseProfileRecord | null) || null, error: null };
}

export async function fetchSupabaseProfileByEmail(
  email: string
): Promise<{ profile: SupabaseProfileRecord | null; error: string | null }> {
  const client = getServerSupabaseAdminClient();
  if (!client) {
    return { profile: null, error: 'Supabase admin client not configured.' };
  }

  const { data, error } = await client
    .from('profiles')
    .select('*')
    .eq('email', email.toLowerCase())
    .maybeSingle();

  if (error) {
    console.error('Supabase profiles select by email error:', error);
    return {
      profile: null,
      error: `Supabase profiles query error (${error.code || 'DB_ERROR'}): ${error.message}`,
    };
  }

  return { profile: (data as SupabaseProfileRecord | null) || null, error: null };
}

export interface SupabaseSavedSetupRecord {
  id: string;
  user_id: string;
  symbol: string;
  timeframe: string;
  bias: 'Bullish' | 'Bearish';
  entry_zone: string;
  stop_loss: number;
  tp1: number;
  notes: string;
  created_at: string;
}

export interface SupabasePlaybookRecord {
  id: string;
  user_id: string;
  title: string;
  pair: string;
  timeframe: string;
  rules_summary: string;
  created_at: string;
}

export async function listSupabaseSavedSetups(
  userId: string
): Promise<{ setups: SupabaseSavedSetupRecord[]; error: string | null }> {
  const client = getServerSupabaseAdminClient();
  if (!client) {
    return { setups: [], error: 'Supabase admin client not configured.' };
  }
  const { data, error } = await client
    .from('saved_setups')
    .select('*')
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
    .limit(30);
  if (error) {
    console.error('Supabase saved_setups select error:', error);
    return {
      setups: [],
      error: `Supabase saved_setups error (${error.code || 'DB_ERROR'}): ${error.message}`,
    };
  }
  return { setups: (data as SupabaseSavedSetupRecord[]) || [], error: null };
}

export async function createSupabaseSavedSetup(
  record: Omit<SupabaseSavedSetupRecord, 'id' | 'created_at'>
): Promise<{ setup: SupabaseSavedSetupRecord | null; error: string | null }> {
  const client = getServerSupabaseAdminClient();
  if (!client) {
    return { setup: null, error: 'Supabase admin client not configured.' };
  }
  const { data, error } = await client
    .from('saved_setups')
    .insert(record)
    .select('*')
    .single();
  if (error) {
    console.error('Supabase saved_setups insert error:', error);
    return {
      setup: null,
      error: `Supabase saved_setups insert error (${error.code || 'DB_ERROR'}): ${error.message}`,
    };
  }
  return { setup: data as SupabaseSavedSetupRecord, error: null };
}

export async function deleteSupabaseSavedSetup(
  setupId: string,
  userId: string
): Promise<{ deleted: boolean; error: string | null }> {
  const client = getServerSupabaseAdminClient();
  if (!client) {
    return { deleted: false, error: 'Supabase admin client not configured.' };
  }
  const { error } = await client
    .from('saved_setups')
    .delete()
    .eq('id', setupId)
    .eq('user_id', userId);
  if (error) {
    console.error('Supabase saved_setups delete error:', error);
    return {
      deleted: false,
      error: `Supabase saved_setups delete error (${error.code || 'DB_ERROR'}): ${error.message}`,
    };
  }
  return { deleted: true, error: null };
}

export async function listSupabasePlaybooks(
  userId: string
): Promise<{ playbooks: SupabasePlaybookRecord[]; error: string | null }> {
  const client = getServerSupabaseAdminClient();
  if (!client) {
    return { playbooks: [], error: 'Supabase admin client not configured.' };
  }
  const { data, error } = await client
    .from('strategy_playbooks')
    .select('*')
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
    .limit(40);
  if (error) {
    console.error('Supabase strategy_playbooks select error:', error);
    return {
      playbooks: [],
      error: `Supabase strategy_playbooks error (${error.code || 'DB_ERROR'}): ${error.message}`,
    };
  }
  return { playbooks: (data as SupabasePlaybookRecord[]) || [], error: null };
}

export async function createSupabasePlaybook(
  record: Omit<SupabasePlaybookRecord, 'id' | 'created_at'>
): Promise<{ playbook: SupabasePlaybookRecord | null; error: string | null }> {
  const client = getServerSupabaseAdminClient();
  if (!client) {
    return { playbook: null, error: 'Supabase admin client not configured.' };
  }
  const { data, error } = await client
    .from('strategy_playbooks')
    .insert(record)
    .select('*')
    .single();
  if (error) {
    console.error('Supabase strategy_playbooks insert error:', error);
    return {
      playbook: null,
      error: `Supabase strategy_playbooks insert error (${error.code || 'DB_ERROR'}): ${error.message}`,
    };
  }
  return { playbook: data as SupabasePlaybookRecord, error: null };
}

export async function deleteSupabasePlaybook(
  playbookId: string,
  userId: string
): Promise<{ deleted: boolean; error: string | null }> {
  const client = getServerSupabaseAdminClient();
  if (!client) {
    return { deleted: false, error: 'Supabase admin client not configured.' };
  }
  const { error } = await client
    .from('strategy_playbooks')
    .delete()
    .eq('id', playbookId)
    .eq('user_id', userId);
  if (error) {
    console.error('Supabase strategy_playbooks delete error:', error);
    return {
      deleted: false,
      error: `Supabase strategy_playbooks delete error (${error.code || 'DB_ERROR'}): ${error.message}`,
    };
  }
  return { deleted: true, error: null };
}

export async function verifySupabaseAccessToken(accessToken: string): Promise<SupabaseAuthUser | null> {
  if (!accessToken) return null;
  const supabase = getServerSupabaseClient() || getServerSupabaseAdminClient();
  if (supabase) {
    try {
      const { data, error } = await supabase.auth.getUser(accessToken);
      if (!error && data.user) {
        return data.user;
      }
    } catch (err) {
      console.error('Supabase getUser exception:', err);
    }
  }

  const { url, anonKey, serviceRoleKey } = getSupabaseEnvConfig();
  const apiKey = anonKey || serviceRoleKey;
  if (!url || !apiKey) return null;

  try {
    const resp = await fetch(`${url}/auth/v1/user`, {
      headers: {
        apikey: apiKey,
        Authorization: `Bearer ${accessToken}`,
      },
    });
    if (!resp.ok) return null;
    const user = (await resp.json()) as SupabaseAuthUser;
    return user && user.id ? user : null;
  } catch (err) {
    console.error('Supabase REST user lookup failed:', err);
    return null;
  }
}

export async function checkSupabaseHealth(): Promise<{
  status: SupabaseConfigStatus;
  configured: boolean;
  reachable: boolean;
  missingEnvVars: string[];
  providers: { email?: boolean; google?: boolean };
  message: string;
}> {
  const cfg = getSupabaseEnvConfig();
  if (!cfg.url) {
    return {
      status: cfg.status,
      configured: false,
      reachable: false,
      missingEnvVars: cfg.missingEnvVars,
      providers: {},
      message: cfg.hasSecretKeyMisplacedInUrl
        ? 'SUPABASE_URL / VITE_SUPABASE_URL contains a secret key instead of your https://<project-ref>.supabase.co Project URL.'
        : `Missing Supabase env variable(s): ${cfg.missingEnvVars.join(', ')}`,
    };
  }
  const key = cfg.anonKey || cfg.serviceRoleKey;
  if (!key) {
    return {
      status: cfg.status,
      configured: false,
      reachable: false,
      missingEnvVars: cfg.missingEnvVars,
      providers: {},
      message: `Missing Supabase env variable(s): ${cfg.missingEnvVars.join(', ')}`,
    };
  }

  try {
    const resp = await fetch(`${cfg.url}/auth/v1/settings`, {
      headers: { apikey: key },
    });
    if (!resp.ok) {
      return {
        status: cfg.status,
        configured: cfg.configured,
        reachable: false,
        missingEnvVars: cfg.missingEnvVars,
        providers: {},
        message: `Supabase auth endpoint returned HTTP ${resp.status}.`,
      };
    }
    const settings = (await resp.json()) as {
      external?: { email?: boolean; google?: boolean };
    };
    return {
      status: cfg.status,
      configured: cfg.configured,
      reachable: true,
      missingEnvVars: cfg.missingEnvVars,
      providers: {
        email: Boolean(settings.external?.email),
        google: Boolean(settings.external?.google),
      },
      message: cfg.configured
        ? 'Supabase connection is active and reachable.'
        : `Missing Supabase env variable(s): ${cfg.missingEnvVars.join(', ')}`,
    };
  } catch (err) {
    return {
      status: cfg.status,
      configured: cfg.configured,
      reachable: false,
      missingEnvVars: cfg.missingEnvVars,
      providers: {},
      message: err instanceof Error ? err.message : 'Unable to reach Supabase auth service.',
    };
  }
}
