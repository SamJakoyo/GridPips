import crypto from 'node:crypto';

const DEFAULT_PROVISIONING_URL = 'https://mt-provisioning-api-v1.agiliumtrade.ai';
const FALLBACK_CLIENT_REGION = 'london';

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
  return DEFAULT_PROVISIONING_URL;
}

function getClientApiBaseUrl(region?: string | null): string {
  const cleanRegion =
    (region || getOptionalMetaApiRegion() || FALLBACK_CLIENT_REGION)
      .toLowerCase()
      .replace(/[^a-z0-9-]/g, '') || FALLBACK_CLIENT_REGION;
  return `https://mt-client-api-v1.${cleanRegion}.agiliumtrade.ai`;
}

async function metaApiFetch<T>(url: string, init: RequestInit = {}): Promise<T> {
  const token = getMt5ApiToken();
  if (!token) {
    throw new Error('METAAPI_TOKEN is not configured on the backend server.');
  }

  const headers = new Headers(init.headers);
  headers.set('auth-token', token);
  if (init.body && !headers.has('Content-Type')) {
    headers.set('Content-Type', 'application/json');
  }

  const resp = await fetch(url, {
    ...init,
    headers,
    signal: AbortSignal.timeout(20000),
  });

  const text = await resp.text();
  let parsed: unknown = null;
  try {
    parsed = text ? JSON.parse(text) : null;
  } catch {
    parsed = null;
  }

  if (!resp.ok) {
    const errObj = parsed as { message?: string; error?: string; details?: unknown } | null;
    const detail = errObj?.message || errObj?.error || text || `HTTP ${resp.status}`;
    throw new Error(`MetaApi Error (${resp.status}): ${detail}`);
  }

  return parsed as T;
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

  if (!accountId) {
    const createPayload: Record<string, unknown> = {
      login: params.login,
      password: params.password,
      name: params.name,
      server: params.server,
      platform: 'mt5',
      magic: 20260525,
      type: 'cloud',
      reliability: 'regular',
    };

    if (profileId) {
      createPayload.provisioningProfileId = profileId;
    }
    if (optionalRegion) {
      createPayload.region = optionalRegion;
    }

    const created = await metaApiFetch<{ id: string; state?: string }>(
      `${baseUrl}/users/current/accounts`,
      {
        method: 'POST',
        headers: {
          'transaction-id': crypto.randomBytes(16).toString('hex'),
        },
        body: JSON.stringify(createPayload),
      }
    );
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
}): Promise<{
  balance: number | null;
  equity: number | null;
  openPositions: number;
  server: string | null;
  currency: string | null;
  region: string;
  connectionStatus: string;
}> {
  const { region, detail } = await resolveAccountRegion(params.accountId, params.region);
  const clientBase = getClientApiBaseUrl(region);

  const [info, positions] = await Promise.all([
    metaApiFetch<{
      balance?: number;
      equity?: number;
      server?: string;
      currency?: string;
    }>(
      `${clientBase}/users/current/accounts/${encodeURIComponent(params.accountId)}/account-information`
    ),
    metaApiFetch<Array<{ id?: string }>>(
      `${clientBase}/users/current/accounts/${encodeURIComponent(params.accountId)}/positions`
    ).catch(() => []),
  ]);

  return {
    balance: typeof info.balance === 'number' ? info.balance : null,
    equity: typeof info.equity === 'number' ? info.equity : null,
    openPositions: Array.isArray(positions) ? positions.length : 0,
    server: info.server || detail?.server || null,
    currency: info.currency || 'USD',
    region,
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
  const clientBase = getClientApiBaseUrl(region);

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

  const res = await metaApiFetch<{
    orderId?: string;
    positionId?: string;
    stringCode?: string;
    message?: string;
  }>(`${clientBase}/users/current/accounts/${encodeURIComponent(params.accountId)}/trade`, {
    method: 'POST',
    body: JSON.stringify(payload),
  });

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
  const clientBase = getClientApiBaseUrl(region);

  const positions = await metaApiFetch<Array<{ id?: string }>>(
    `${clientBase}/users/current/accounts/${encodeURIComponent(params.accountId)}/positions`
  );

  if (!Array.isArray(positions) || positions.length === 0) {
    return { closedCount: 0 };
  }

  let closedCount = 0;
  for (const pos of positions) {
    if (!pos?.id) continue;
    await metaApiFetch<unknown>(
      `${clientBase}/users/current/accounts/${encodeURIComponent(params.accountId)}/trade`,
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
