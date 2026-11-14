import { createClient, type SupabaseClient, type User as SupabaseAuthUser } from '@supabase/supabase-js';

export type SupabaseConfigStatus = 'connected' | 'missing_url' | 'missing_key' | 'not_configured';

export interface SupabaseEnvConfig {
  configured: boolean;
  status: SupabaseConfigStatus;
  url: string;
  anonKey: string;
  serviceRoleKey: string;
  hasSecretKeyMisplacedInUrl: boolean;
}

function normalizeSupabaseUrl(raw?: string): string {
  if (!raw || typeof raw !== 'string') return '';
  let val = raw.trim().replace(/^['"]+|['"]+$/g, '');
  if (!val || val === 'undefined' || val === 'null' || val.includes('MY_SUPABASE') || val.startsWith('sb_')) {
    return '';
  }

  // Extract project ref from Supabase Dashboard URL
  const dashMatch = val.match(/supabase\.com\/dashboard\/project\/([a-z0-9]{16,32})/i);
  if (dashMatch) {
    return `https://${dashMatch[1]}.supabase.co`;
  }

  // Extract project ref from direct DB host or pooler Postgres URI
  const dbHostMatch = val.match(/db\.([a-z0-9]{16,32})\.supabase\.co/i);
  if (dbHostMatch) {
    return `https://${dbHostMatch[1]}.supabase.co`;
  }

  const poolerUserMatch = val.match(/postgres\.([a-z0-9]{16,32})[:@]/i);
  if (/^postgres(ql)?:\/\//i.test(val) && poolerUserMatch) {
    return `https://${poolerUserMatch[1]}.supabase.co`;
  }

  // Allow bare project ref ID
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

export function getSupabaseEnvConfig(): SupabaseEnvConfig {
  const rawUrlCandidates = [
    process.env.SUPABASE_URL,
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.VITE_SUPABASE_URL,
    process.env.SUPABASE_PROJECT_URL,
    process.env.SUPABASE_PROJECT_REF,
    process.env.SUPABASE_PROJECT_ID,
    process.env.SUPABASE_DB_URL,
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

  const publicKeyCandidates = [
    process.env.SUPABASE_ANON_KEY,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    process.env.VITE_SUPABASE_ANON_KEY,
    process.env.SUPABASE_PUBLISHABLE_KEY,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
    process.env.VITE_SUPABASE_PUBLISHABLE_KEY,
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
    normalizeKey(process.env.SUPABASE_SECRET_KEY) ||
    rawUrlCandidates
      .map((v) => normalizeKey(v))
      .find((v) => isSecretSupabaseKey(v)) ||
    '';

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
      console.warn('Server Supabase client skipped due to invalid configuration:', err);
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
      console.warn('Server Supabase admin client skipped:', err);
      return null;
    }
  }
  return serverAdminClient;
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
    } catch {
      // fall through to direct REST lookup
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
  } catch {
    return null;
  }
}

export async function checkSupabaseHealth(): Promise<{
  status: SupabaseConfigStatus;
  configured: boolean;
  reachable: boolean;
  providers: { email?: boolean; google?: boolean };
  message: string;
}> {
  const cfg = getSupabaseEnvConfig();
  if (!cfg.url) {
    return {
      status: cfg.status,
      configured: false,
      reachable: false,
      providers: {},
      message: cfg.hasSecretKeyMisplacedInUrl
        ? 'SUPABASE_URL / VITE_SUPABASE_URL contains a secret key instead of your https://<project-ref>.supabase.co Project URL.'
        : 'SUPABASE_URL and VITE_SUPABASE_URL are not configured yet.',
    };
  }
  const key = cfg.anonKey || cfg.serviceRoleKey;
  if (!key) {
    return {
      status: cfg.status,
      configured: false,
      reachable: false,
      providers: {},
      message: 'SUPABASE_ANON_KEY / VITE_SUPABASE_ANON_KEY (publishable key) is missing.',
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
      providers: {
        email: Boolean(settings.external?.email),
        google: Boolean(settings.external?.google),
      },
      message: cfg.configured
        ? 'Supabase connection is active and reachable.'
        : 'Supabase endpoint reachable, waiting for public publishable/anon key.',
    };
  } catch (err) {
    return {
      status: cfg.status,
      configured: cfg.configured,
      reachable: false,
      providers: {},
      message: err instanceof Error ? err.message : 'Unable to reach Supabase auth service.',
    };
  }
}
