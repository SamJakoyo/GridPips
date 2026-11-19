import crypto from 'node:crypto';

const DEFAULT_PROVISIONING_URL = 'https://mt-provisioning-api-v1.agiliumtrade.agiliumtrade.ai';
const FALLBACK_CLIENT_REGION = 'london';
const VALID_CLIENT_FALLBACK_REGIONS = ['london', 'new-york'] as const;

export function getMt5ApiToken(): string {
  return (
    process.env.METAAPI_TOKEN ||
    process.env.MT5_API_KEY ||
    process.env.METATRADER5_API_KEY ||
    ''
  ).trim();
}

export function getMetaApiProvisioningProfileId(): string {
  return (process.env.METAAPI_PROVISIONING_PROFILE_ID || '').trim();
}

export function getOptionalMetaApiRegion(): string {
  const raw = (process.env.METAAPI_REGION || '').trim().toLowerCase().replace(/[^a-z0-9-]/g, '');
  return raw;
}

export function isMt5ApiConfigured(): boolean {
  return getMt5ApiToken().length >= 16;
}

export function isMetaApiProfileConfigured(): boolean {
  return getMetaApiProvisioningProfileId().length >= 8;
}

function getProvisioningUrl(): string {
  const custom = (process.env.METAAPI_PROVISIONING_URL || '').trim().replace(/\/+$/, '');
  // Guard against the invalid/non-existent single-agiliumtrade provisioning host
  if (custom && /^https:\/\/[a-z0-9.-]+$/i.test(custom) && !/^https:\/\/mt-provisioning-api-v1\.agiliumtrade\.ai$/i.test(custom)) {
    return custom;
  }
  return DEFAULT_PROVISIONING_URL;
}

function getClientApiBaseUrl(region?: string | null): string {
  const cleanRegion =
    (region || getOptionalMetaApiRegion() || FALLBACK_CLIENT_REGION)
      .toLowerCase()
      .replace(/[^a-z0-9-]/g, '') || FALLBACK_CLIENT_REGION;
  return `https://mt-client-api-v1.${cleanRegion}.agiliumtrade.ai`;
}

function describeFetchError(url: string, err: unknown): { message: string; code: string; retryable: boolean } {
  let host = url;
  try {
    host = new URL(url).host;
  } catch {
    // keep raw url
  }
  const errObj = err as {
    name?: string;
    message?: string;
    code?: string;
    cause?: { code?: string; message?: string; errno?: number };
  } | null;

  const causeCode = String(errObj?.cause?.code || errObj?.code || '').trim();
  const causeMsg = String(errObj?.cause?.message || '').trim();
  const baseMsg = String(errObj?.message || 'Network request failed').trim();

  if (errObj?.name === 'TimeoutError' || errObj?.name === 'AbortError' || causeCode === 'UND_ERR_CONNECT_TIMEOUT' || causeCode === 'ETIMEDOUT') {
    return {
      code: causeCode || 'ETIMEDOUT',
      retryable: true,
      message: `MetaApi Cloud timed out while contacting ${host}. Please try again in a few seconds.`,
    };
  }

  const retryableCodes = new Set(['ECONNRESET', 'EAI_AGAIN', 'EPIPE', 'UND_ERR_SOCKET', 'UND_ERR_CONNECT_TIMEOUT']);
  const retryable = retryableCodes.has(causeCode);
  const detail = [causeCode, causeMsg && causeMsg !== baseMsg ? causeMsg : ''].filter(Boolean).join(' — ');

  return {
    code: causeCode || 'NETWORK_ERROR',
    retryable,
    message: `Unable to reach MetaApi Cloud (${host}${detail ? `: ${detail}` : ''}). Please retry or verify server connectivity.`,
  };
}

class MetaApiHttpError extends Error {
  status: number;
  detail: string;
  constructor(status: number, detail: string) {
    super(`MetaApi Error (${status}): ${detail}`);
    this.name = 'MetaApiHttpError';
    this.status = status;
    this.detail = detail;
  }
}

async function metaApiFetch<T>(
  url: string,
  init: RequestInit = {},
  maxAttempts = 2,
  timeoutMs = 15000
): Promise<T> {
  const token = getMt5ApiToken();
  if (!token) {
    throw new Error('METAAPI_TOKEN is not configured on the backend server.');
  }

  const headers = new Headers(init.headers);
  headers.set('auth-token', token);
  if (!headers.has('Accept')) {
    headers.set('Accept', 'application/json');
  }
  if (init.body && !headers.has('Content-Type')) {
    headers.set('Content-Type', 'application/json');
  }

  let lastErr: Error | null = null;
  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    let resp: Response;
    try {
      resp = await fetch(url, {
        ...init,
        headers,
        signal: AbortSignal.timeout(timeoutMs),
      });
    } catch (err) {
      const info = describeFetchError(url, err);
      lastErr = new Error(info.message);
      if (info.retryable && attempt < maxAttempts) {
        await new Promise((r) => setTimeout(r, 500 * attempt));
        continue;
      }
      throw lastErr;
    }

    const text = await resp.text();
    let parsed: unknown = null;
    try {
      parsed = text ? JSON.parse(text) : null;
    } catch {
      parsed = null;
    }

    if (!resp.ok) {
      const errObj = parsed as { message?: string; error?: string; details?: unknown } | null;
      const baseDetail = errObj?.message || errObj?.error || text || `HTTP ${resp.status}`;
      let extraDetail = '';
      if (Array.isArray(errObj?.details) && errObj.details.length > 0) {
        extraDetail = errObj.details
          .map((d) => {
            if (typeof d === 'string') return d;
            if (d && typeof d === 'object') {
              const obj = d as { parameter?: string; message?: string };
              return [obj.parameter, obj.message].filter(Boolean).join(': ');
            }
            return '';
          })
          .filter(Boolean)
          .join('; ');
      } else if (typeof errObj?.details === 'string' && errObj.details.trim()) {
        extraDetail = errObj.details.trim();
      }
      const detail = extraDetail ? `${baseDetail} (${extraDetail})` : baseDetail;
      const httpErr = new MetaApiHttpError(resp.status, detail);
      if (resp.status >= 502 && resp.status <= 504 && attempt < maxAttempts) {
        lastErr = httpErr;
        await new Promise((r) => setTimeout(r, 600 * attempt));
        continue;
      }
      throw httpErr;
    }

    return parsed as T;
  }

  throw lastErr || new Error('MetaApi Cloud request failed.');
}

async function metaApiClientFetch<T>(
  region: string | null | undefined,
  path: string,
  init: RequestInit = {},
  timeoutMs = 15000
): Promise<{ data: T; region: string }> {
  const primaryRegion =
    (region || getOptionalMetaApiRegion() || FALLBACK_CLIENT_REGION)
      .toLowerCase()
      .replace(/[^a-z0-9-]/g, '') || FALLBACK_CLIENT_REGION;

  const candidates = [
    primaryRegion,
    ...VALID_CLIENT_FALLBACK_REGIONS.filter((r) => r !== primaryRegion),
  ];

  let lastError: unknown = null;
  for (let i = 0; i < candidates.length; i += 1) {
    const candidateRegion = candidates[i];
    const url = `${getClientApiBaseUrl(candidateRegion)}${path}`;
    try {
      const data = await metaApiFetch<T>(url, init, timeoutMs <= 6000 ? 1 : 2, timeoutMs);
      return { data, region: candidateRegion };
    } catch (err) {
      lastError = err;
      // Only fall over to another regional host if the regional hostname failed DNS/connectivity
      const isDnsFailure = err instanceof Error && /ENOTFOUND|Unable to reach MetaApi Cloud/i.test(err.message);
      if (!isDnsFailure) {
        throw err;
      }
    }
  }

  throw lastError instanceof Error ? lastError : new Error('Unable to reach MetaApi client API.');
}

interface MetaApiAccountListItem {
  _id: string;
  login?: string;
  server?: string;
  platform?: string;
  state?: string;
  connectionStatus?: string;
  region?: string;
}

async function resolveAccountRegion(accountId: string, knownRegion?: string | null): Promise<{
  region: string;
  detail: MetaApiAccountListItem | null;
}> {
  const provBase = getProvisioningUrl();
  const detail = await metaApiFetch<MetaApiAccountListItem>(
    `${provBase}/users/current/accounts/${encodeURIComponent(accountId)}`
  ).catch(() => null);

  const resolved =
    detail?.region || knownRegion || getOptionalMetaApiRegion() || FALLBACK_CLIENT_REGION;
  return { region: resolved, detail };
}

let cachedMetaApiExnessServers: { fetchedAt: number; servers: string[] } | null = null;

export async function fetchKnownExnessServersFromMetaApi(): Promise<string[]> {
  if (!isMt5ApiConfigured()) return [];
  const now = Date.now();
  if (cachedMetaApiExnessServers && now - cachedMetaApiExnessServers.fetchedAt < 15 * 60 * 1000) {
    return cachedMetaApiExnessServers.servers;
  }

  const baseUrl = getProvisioningUrl();
  const discovered = new Set<string>();
  const queries = ['Exness', 'ExnessSC', 'ExnessKE', 'ExnessVG'];

  await Promise.all(
    queries.map(async (q) => {
      try {
        const res = await metaApiFetch<Record<string, string[]> | string[]>(
          `${baseUrl}/known-mt-servers/5/search?query=${encodeURIComponent(q)}`,
          {},
          1
        );
        if (Array.isArray(res)) {
          for (const srv of res) {
            if (typeof srv === 'string' && srv.trim()) discovered.add(srv.trim());
          }
        } else if (res && typeof res === 'object') {
          for (const serverList of Object.values(res)) {
            if (Array.isArray(serverList)) {
              for (const srv of serverList) {
                if (typeof srv === 'string' && srv.trim()) {
                  discovered.add(srv.trim());
                }
              }
            }
          }
        }
      } catch {
        // ignore unsupported query or temporary MetaApi lookup issue
      }
    })
  );

  const servers = Array.from(discovered).sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
  if (servers.length > 0) {
    cachedMetaApiExnessServers = { fetchedAt: now, servers };
  }
  return servers;
}

export async function provisionAndDeployMt5Account(params: {
  login: string;
  password: string;
  server: string;
  name: string;
}): Promise<{
  accountId: string;
  region: string;
  state: string;
  connectionStatus: string;
}> {
  const baseUrl = getProvisioningUrl();
  const profileId = getMetaApiProvisioningProfileId();
  const optionalRegion = getOptionalMetaApiRegion();

  // Check if this MT5 login + server is already provisioned under our MetaApi token
  const existingAccounts = await metaApiFetch<MetaApiAccountListItem[]>(
    `${baseUrl}/users/current/accounts`
  ).catch(() => []);

  const matched = Array.isArray(existingAccounts)
    ? existingAccounts.find(
        (acc) =>
          String(acc.login || '') === String(params.login) &&
          String(acc.server || '').toLowerCase() === String(params.server).toLowerCase()
      )
    : undefined;

  let accountId = matched?._id || '';
  let region = matched?.region || optionalRegion || '';
  let state = matched?.state || 'CREATED';
  let connectionStatus = matched?.connectionStatus || 'DISCONNECTED';

  if (accountId && matched) {
    // Refresh password/name on existing MetaApi account so reconnecting with a new password works seamlessly
    await metaApiFetch<unknown>(
      `${baseUrl}/users/current/accounts/${encodeURIComponent(accountId)}`,
      {
        method: 'PUT',
        body: JSON.stringify({
          name: params.name,
          password: params.password,
          server: params.server,
        }),
      },
      1
    ).catch(() => {});
  }

  if (!accountId) {
    const buildCreatePayload = (includeProfile: boolean): Record<string, unknown> => {
      const payload: Record<string, unknown> = {
        login: params.login,
        password: params.password,
        name: params.name,
        server: params.server,
        platform: 'mt5',
        magic: 20260525,
        type: 'cloud-g2',
      };
      if (includeProfile && profileId) {
        payload.provisioningProfileId = profileId;
      }
      if (optionalRegion) {
        payload.region = optionalRegion;
      }
      return payload;
    };

    const submitCreate = (payload: Record<string, unknown>) =>
      metaApiFetch<{ id: string; state?: string }>(
        `${baseUrl}/users/current/accounts`,
        {
          method: 'POST',
          headers: {
            'transaction-id': crypto.randomBytes(16).toString('hex'),
          },
          body: JSON.stringify(payload),
        }
      );

    let created: { id: string; state?: string };
    try {
      created = await submitCreate(buildCreatePayload(Boolean(profileId)));
    } catch (err) {
      // If a configured provisioningProfileId doesn't contain this Exness server (or is invalid),
      // retry using MetaApi's built-in automatic broker server discovery.
      const shouldRetryWithoutProfile =
        Boolean(profileId) &&
        err instanceof MetaApiHttpError &&
        (err.status === 400 || err.status === 404) &&
        /profile|server|not found|invalid/i.test(err.detail);

      if (shouldRetryWithoutProfile) {
        created = await submitCreate(buildCreatePayload(false));
      } else {
        throw err;
      }
    }

    accountId = created.id;
    state = created.state || 'CREATED';
  }

  if (accountId && state !== 'DEPLOYED') {
    await metaApiFetch<unknown>(
      `${baseUrl}/users/current/accounts/${encodeURIComponent(accountId)}/deploy`,
      { method: 'POST' }
    ).catch(() => {});
  }

  const resolved = await resolveAccountRegion(accountId, region);
  region = resolved.region;
  if (resolved.detail) {
    state = resolved.detail.state || state;
    connectionStatus = resolved.detail.connectionStatus || connectionStatus;
  }

  return {
    accountId,
    region,
    state,
    connectionStatus,
  };
}

export async function fetchMt5AccountState(params: {
  accountId: string;
  region?: string | null;
  timeoutMs?: number;
  skipRegionLookup?: boolean;
}): Promise<{
  balance: number | null;
  equity: number | null;
  openPositions: number;
  server: string | null;
  currency: string | null;
  region: string;
  connectionStatus: string;
}> {
  const timeoutMs = params.timeoutMs ?? 15000;
  const { region: resolvedRegion, detail } =
    params.skipRegionLookup && params.region
      ? { region: params.region, detail: null }
      : await resolveAccountRegion(params.accountId, params.region);

  const accountPath = `/users/current/accounts/${encodeURIComponent(params.accountId)}`;
  const infoRes = await metaApiClientFetch<{
    balance?: number;
    equity?: number;
    server?: string;
    currency?: string;
  }>(resolvedRegion, `${accountPath}/account-information`, {}, timeoutMs);

  const activeRegion = infoRes.region;
  const positions = await metaApiClientFetch<Array<{ id?: string }>>(
    activeRegion,
    `${accountPath}/positions`,
    {},
    timeoutMs
  )
    .then((r) => r.data)
    .catch(() => []);

  const info = infoRes.data;
  return {
    balance: typeof info.balance === 'number' ? info.balance : null,
    equity: typeof info.equity === 'number' ? info.equity : null,
    openPositions: Array.isArray(positions) ? positions.length : 0,
    server: info.server || detail?.server || null,
    currency: info.currency || 'USD',
    region: activeRegion,
    connectionStatus: detail?.connectionStatus || 'CONNECTED',
  };
}

export async function executeMt5TradeOrder(params: {
  accountId: string;
  region?: string | null;
  symbol: string;
  side: 'BUY' | 'SELL';
  volume: number;
  stopLoss?: number | null;
  takeProfit?: number | null;
  comment?: string;
}): Promise<{
  orderId: string;
  positionId?: string;
  stringCode: string;
  message: string;
}> {
  const { region } = await resolveAccountRegion(params.accountId, params.region);

  const payload: Record<string, unknown> = {
    actionType: params.side === 'BUY' ? 'ORDER_TYPE_BUY' : 'ORDER_TYPE_SELL',
    symbol: params.symbol,
    volume: params.volume,
    comment: params.comment || 'GRIDPIPs Auto-Trade EA',
  };
  if (typeof params.stopLoss === 'number' && params.stopLoss > 0) {
    payload.stopLoss = params.stopLoss;
  }
  if (typeof params.takeProfit === 'number' && params.takeProfit > 0) {
    payload.takeProfit = params.takeProfit;
  }

  const { data: res } = await metaApiClientFetch<{
    orderId?: string;
    positionId?: string;
    stringCode?: string;
    message?: string;
  }>(
    region,
    `/users/current/accounts/${encodeURIComponent(params.accountId)}/trade`,
    {
      method: 'POST',
      body: JSON.stringify(payload),
    }
  );

  return {
    orderId: String(res.orderId || res.positionId || `MT5-${Date.now()}`),
    positionId: res.positionId ? String(res.positionId) : undefined,
    stringCode: String(res.stringCode || 'TRADE_RETCODE_DONE'),
    message: String(res.message || 'Trade executed on MetaTrader 5 account via MetaApi.'),
  };
}

export async function closeAllMt5Positions(params: {
  accountId: string;
  region?: string | null;
}): Promise<{ closedCount: number }> {
  const { region } = await resolveAccountRegion(params.accountId, params.region);
  const accountPath = `/users/current/accounts/${encodeURIComponent(params.accountId)}`;

  const { data: positions, region: activeRegion } = await metaApiClientFetch<Array<{ id?: string }>>(
    region,
    `${accountPath}/positions`
  );

  if (!Array.isArray(positions) || positions.length === 0) {
    return { closedCount: 0 };
  }

  let closedCount = 0;
  for (const pos of positions) {
    if (!pos?.id) continue;
    await metaApiClientFetch<unknown>(
      activeRegion,
      `${accountPath}/trade`,
      {
        method: 'POST',
        body: JSON.stringify({
          actionType: 'POSITION_CLOSE_ID',
          positionId: pos.id,
        }),
      }
    );
    closedCount += 1;
  }

  return { closedCount };
}
