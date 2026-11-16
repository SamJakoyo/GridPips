export type DarajaEnv = 'sandbox' | 'production';
export type DarajaTransactionType = 'CustomerPayBillOnline' | 'CustomerBuyGoodsOnline';

export interface DarajaConfigStatus {
  configured: boolean;
  env: DarajaEnv;
  missingEnvVars: string[];
  transactionType: DarajaTransactionType;
  shortCode: string;
  partyB: string;
  shortCodePreview: string;
  partyBPreview: string;
}

export interface DarajaStkInitiateInput {
  phone: string;
  amountKes: number;
  accountReference: string;
  transactionDesc: string;
  callbackUrl: string;
  settings?: Record<string, string>;
}

export interface DarajaStkInitiateResult {
  checkoutRequestId: string;
  merchantRequestId: string;
  responseCode: string;
  responseDescription: string;
  customerMessage: string;
  transactionType: DarajaTransactionType;
  shortCode: string;
  partyB: string;
}

export interface DarajaStkQueryResult {
  state: 'paid' | 'processing' | 'failed';
  resultCode: string;
  resultDesc: string;
}

export interface DarajaParsedCallback {
  merchantRequestId: string;
  checkoutRequestId: string;
  resultCode: number;
  resultDesc: string;
  mpesaReceiptNumber: string | null;
  amount: number | null;
  phoneNumber: string | null;
  transactionDate: string | null;
}

let cachedToken: { cacheKey: string; token: string; expiresAtMs: number } | null = null;

export function getDarajaEnv(): DarajaEnv {
  const raw = (process.env.MPESA_ENV || '').trim().toLowerCase();
  return raw === 'production' || raw === 'prod' || raw === 'live' ? 'production' : 'sandbox';
}

export function getDarajaBaseUrl(env: DarajaEnv = getDarajaEnv()): string {
  return env === 'production' ? 'https://api.safaricom.co.ke' : 'https://sandbox.safaricom.co.ke';
}

export function clearDarajaTokenCache(): void {
  cachedToken = null;
}

export const SAFARICOM_CALLBACK_IPS = new Set([
  '196.201.214.200',
  '196.201.214.206',
  '196.201.213.114',
  '196.201.214.207',
  '196.201.214.208',
  '196.201.213.44',
  '196.201.212.127',
  '196.201.212.138',
  '196.201.212.129',
  '196.201.212.136',
  '196.201.212.74',
  '196.201.212.69',
]);

export function isSafaricomCallbackIp(ip: string): boolean {
  const clean = ip.replace(/^::ffff:/, '').trim();
  return SAFARICOM_CALLBACK_IPS.has(clean);
}

export function getDarajaConfigStatus(settings?: Record<string, string>): DarajaConfigStatus {
  const env = getDarajaEnv();
  const consumerKey = (process.env.MPESA_CONSUMER_KEY || '').trim();
  const consumerSecret = (process.env.MPESA_CONSUMER_SECRET || '').trim();
  const passkey = (process.env.MPESA_PASSKEY || '').trim();
  const shortCode = (process.env.MPESA_SHORTCODE || '').trim();

  const isDarajaSandboxTestShortcode = shortCode === '174379';
  const envPartyB = (process.env.MPESA_PARTY_B || '').trim();
  const settingsPartyB = (settings?.mpesa_party_b || settings?.mpesa_till_number || '').trim();
  const usableSettingsPartyB =
    !isDarajaSandboxTestShortcode && settingsPartyB ? settingsPartyB : '';

  const partyB = envPartyB || usableSettingsPartyB || shortCode;

  const envTxType = (process.env.MPESA_TRANSACTION_TYPE || '').trim();
  const settingsTxType = (settings?.mpesa_transaction_type || '').trim();

  let transactionType: DarajaTransactionType = 'CustomerPayBillOnline';
  if (isDarajaSandboxTestShortcode && !envTxType && !envPartyB) {
    transactionType = 'CustomerPayBillOnline';
  } else if (envTxType === 'CustomerBuyGoodsOnline') {
    transactionType = 'CustomerBuyGoodsOnline';
  } else if (envTxType === 'CustomerPayBillOnline') {
    transactionType = 'CustomerPayBillOnline';
  } else if (shortCode && partyB && partyB !== shortCode) {
    transactionType = 'CustomerBuyGoodsOnline';
  } else if (!isDarajaSandboxTestShortcode && settingsTxType === 'CustomerBuyGoodsOnline') {
    transactionType = 'CustomerBuyGoodsOnline';
  }

  const missingEnvVars: string[] = [];
  if (!consumerKey) missingEnvVars.push('MPESA_CONSUMER_KEY');
  if (!consumerSecret) missingEnvVars.push('MPESA_CONSUMER_SECRET');
  if (!passkey) missingEnvVars.push('MPESA_PASSKEY');
  if (!shortCode) missingEnvVars.push('MPESA_SHORTCODE');

  return {
    configured: missingEnvVars.length === 0,
    env,
    missingEnvVars,
    transactionType,
    shortCode,
    partyB,
    shortCodePreview: shortCode ? `${shortCode.slice(0, 3)}***` : '',
    partyBPreview: partyB ? `${partyB.slice(0, 3)}***` : '',
  };
}

/**
 * Generates Safaricom Daraja timestamp in East Africa Time (EAT, UTC+3) formatted as YYYYMMDDHHmmss.
 */
export function getDarajaTimestamp(now: Date = new Date()): string {
  const eatMs = now.getTime() + 3 * 60 * 60 * 1000;
  const eat = new Date(eatMs);
  const pad = (n: number) => String(n).padStart(2, '0');
  return [
    eat.getUTCFullYear(),
    pad(eat.getUTCMonth() + 1),
    pad(eat.getUTCDate()),
    pad(eat.getUTCHours()),
    pad(eat.getUTCMinutes()),
    pad(eat.getUTCSeconds()),
  ].join('');
}

export function buildDarajaPassword(shortCode: string, passkey: string, timestamp: string): string {
  return Buffer.from(`${shortCode}${passkey}${timestamp}`, 'utf8').toString('base64');
}

export function mapDarajaResultMessage(code: string, fallbackDesc?: string): string {
  const cleanCode = String(code).trim();
  switch (cleanCode) {
    case '0':
      return 'Payment confirmed successfully by M-Pesa.';
    case '1':
      return 'Insufficient M-Pesa balance on your account. Top up and try again.';
    case '1001':
      return 'Unable to lock subscriber M-Pesa session. Another transaction may be in progress.';
    case '1019':
      return 'M-Pesa transaction expired before PIN confirmation.';
    case '1025':
      return 'M-Pesa request limit or maximum transaction threshold exceeded.';
    case '1032':
      return 'Request cancelled on your phone before entering your M-Pesa PIN.';
    case '1037':
      return 'STK prompt timed out — handset was unreachable or prompt was dismissed.';
    case '2001':
      return 'Incorrect M-Pesa PIN entered on handset. Please retry.';
    default:
      return fallbackDesc?.trim() || `M-Pesa transaction did not complete (Code ${cleanCode}).`;
  }
}

export async function getDarajaAccessToken(forceRefresh = false): Promise<string> {
  const consumerKey = (process.env.MPESA_CONSUMER_KEY || '').trim();
  const consumerSecret = (process.env.MPESA_CONSUMER_SECRET || '').trim();
  if (!consumerKey || !consumerSecret) {
    throw new Error('Missing MPESA_CONSUMER_KEY or MPESA_CONSUMER_SECRET.');
  }

  const env = getDarajaEnv();
  const cacheKey = `${env}:${consumerKey.slice(0, 8)}`;
  if (!forceRefresh && cachedToken && cachedToken.cacheKey === cacheKey && cachedToken.expiresAtMs > Date.now() + 60_000) {
    return cachedToken.token;
  }

  const credentials = Buffer.from(`${consumerKey}:${consumerSecret}`, 'utf8').toString('base64');
  const url = `${getDarajaBaseUrl(env)}/oauth/v1/generate?grant_type=client_credentials`;

  const resp = await fetch(url, {
    method: 'GET',
    headers: {
      Authorization: `Basic ${credentials}`,
      Accept: 'application/json',
    },
    signal: AbortSignal.timeout(12_000),
  });

  const payload = (await resp.json().catch(() => ({}))) as {
    access_token?: string;
    expires_in?: string | number;
    errorMessage?: string;
    error_description?: string;
  };

  if (!resp.ok || !payload.access_token) {
    throw new Error(
      payload.errorMessage ||
        payload.error_description ||
        `Safaricom Daraja OAuth failed (HTTP ${resp.status}). Verify Consumer Key & Secret for ${env}.`
    );
  }

  const expiresInSec = Math.max(120, Number(payload.expires_in || 3599));
  cachedToken = {
    cacheKey,
    token: payload.access_token,
    expiresAtMs: Date.now() + expiresInSec * 1000,
  };
  return payload.access_token;
}

export async function testDarajaConnection(settings?: Record<string, string>): Promise<{
  ok: boolean;
  env: DarajaEnv;
  transactionType: DarajaTransactionType;
  shortCode: string;
  partyB: string;
  message: string;
}> {
  clearDarajaTokenCache();
  const status = getDarajaConfigStatus(settings);
  if (!status.configured) {
    return {
      ok: false,
      env: status.env,
      transactionType: status.transactionType,
      shortCode: status.shortCode,
      partyB: status.partyB,
      message: `Missing environment variable(s): ${status.missingEnvVars.join(', ')}`,
    };
  }
  await getDarajaAccessToken(true);
  return {
    ok: true,
    env: status.env,
    transactionType: status.transactionType,
    shortCode: status.shortCode,
    partyB: status.partyB,
    message: `Safaricom Daraja (${status.env}) OAuth token verified successfully for Shortcode ${status.shortCode} (${status.transactionType}).`,
  };
}

export async function initiateDarajaStkPush(
  input: DarajaStkInitiateInput
): Promise<DarajaStkInitiateResult> {
  const status = getDarajaConfigStatus(input.settings);
  if (!status.configured) {
    throw new Error(
      `M-Pesa Daraja is not configured on the server (missing: ${status.missingEnvVars.join(', ')}).`
    );
  }

  const passkey = (process.env.MPESA_PASSKEY || '').trim();
  const token = await getDarajaAccessToken();
  const timestamp = getDarajaTimestamp();
  const password = buildDarajaPassword(status.shortCode, passkey, timestamp);

  const amount = Math.max(1, Math.round(input.amountKes));
  const partyB =
    status.transactionType === 'CustomerBuyGoodsOnline'
      ? status.partyB || status.shortCode
      : status.shortCode;
  const accountReference = input.accountReference.replace(/[^a-zA-Z0-9-]/g, '').slice(0, 12) || 'GRIDPIPS';
  const transactionDesc = input.transactionDesc.replace(/[^a-zA-Z0-9 ._-]/g, '').slice(0, 13) || 'GRIDPIPs Pay';

  const body = {
    BusinessShortCode: status.shortCode,
    Password: password,
    Timestamp: timestamp,
    TransactionType: status.transactionType,
    Amount: amount,
    PartyA: input.phone,
    PartyB: partyB,
    PhoneNumber: input.phone,
    CallBackURL: input.callbackUrl,
    AccountReference: accountReference,
    TransactionDesc: transactionDesc,
  };

  const resp = await fetch(`${getDarajaBaseUrl(status.env)}/mpesa/stkpush/v1/processrequest`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
      Accept: 'application/json',
    },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(15_000),
  });

  const data = (await resp.json().catch(() => ({}))) as {
    MerchantRequestID?: string;
    CheckoutRequestID?: string;
    ResponseCode?: string;
    ResponseDescription?: string;
    CustomerMessage?: string;
    errorCode?: string;
    errorMessage?: string;
  };

  if (!resp.ok || data.errorCode || data.ResponseCode !== '0' || !data.CheckoutRequestID) {
    throw new Error(
      data.errorMessage ||
        data.ResponseDescription ||
        `Safaricom Daraja STK Push rejected request (HTTP ${resp.status}).`
    );
  }

  return {
    checkoutRequestId: data.CheckoutRequestID,
    merchantRequestId: data.MerchantRequestID || '',
    responseCode: data.ResponseCode,
    responseDescription: data.ResponseDescription || 'Success. Request accepted for processing',
    customerMessage:
      data.CustomerMessage ||
      `STK Push sent to +${input.phone}. Enter your M-Pesa PIN to complete payment.`,
    transactionType: status.transactionType,
    shortCode: status.shortCode,
    partyB,
  };
}

export async function queryDarajaStkStatus(
  checkoutRequestId: string,
  settings?: Record<string, string>
): Promise<DarajaStkQueryResult> {
  const status = getDarajaConfigStatus(settings);
  if (!status.configured) {
    throw new Error('M-Pesa Daraja credentials are not configured.');
  }

  const passkey = (process.env.MPESA_PASSKEY || '').trim();
  const token = await getDarajaAccessToken();
  const timestamp = getDarajaTimestamp();
  const password = buildDarajaPassword(status.shortCode, passkey, timestamp);

  const resp = await fetch(`${getDarajaBaseUrl(status.env)}/mpesa/stkpushquery/v1/query`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
      Accept: 'application/json',
    },
    body: JSON.stringify({
      BusinessShortCode: status.shortCode,
      Password: password,
      Timestamp: timestamp,
      CheckoutRequestID: checkoutRequestId,
    }),
    signal: AbortSignal.timeout(12_000),
  });

  const data = (await resp.json().catch(() => ({}))) as {
    ResponseCode?: string;
    ResponseDescription?: string;
    ResultCode?: string | number;
    ResultDesc?: string;
    errorCode?: string;
    errorMessage?: string;
  };

  // Daraja returns errorCode 500.001.1001 ("The transaction is being processed") while awaiting PIN entry
  if (
    data.errorCode === '500.001.1001' ||
    (data.errorMessage && /being processed|in progress/i.test(data.errorMessage))
  ) {
    return {
      state: 'processing',
      resultCode: 'PENDING',
      resultDesc: 'Waiting for M-Pesa PIN confirmation on your handset...',
    };
  }

  if (data.ResultCode !== undefined && data.ResultCode !== null) {
    const codeStr = String(data.ResultCode).trim();
    if (codeStr === '0') {
      return {
        state: 'paid',
        resultCode: '0',
        resultDesc: data.ResultDesc || 'Payment confirmed via M-Pesa Daraja.',
      };
    }
    return {
      state: 'failed',
      resultCode: codeStr,
      resultDesc: mapDarajaResultMessage(codeStr, data.ResultDesc),
    };
  }

  if (!resp.ok || data.errorCode) {
    return {
      state: 'processing',
      resultCode: data.errorCode || String(resp.status),
      resultDesc: data.errorMessage || 'Awaiting Safaricom Daraja confirmation...',
    };
  }

  return {
    state: 'processing',
    resultCode: 'PENDING',
    resultDesc: data.ResponseDescription || 'Awaiting M-Pesa PIN confirmation on your handset...',
  };
}

export function parseDarajaCallback(body: unknown): DarajaParsedCallback | null {
  if (!body || typeof body !== 'object') return null;
  const root = body as {
    Body?: {
      stkCallback?: {
        MerchantRequestID?: string;
        CheckoutRequestID?: string;
        ResultCode?: number | string;
        ResultDesc?: string;
        CallbackMetadata?: {
          Item?: Array<{ Name?: string; Value?: string | number }>;
        };
      };
    };
  };

  const cb = root.Body?.stkCallback;
  if (!cb || !cb.CheckoutRequestID) return null;

  const items = Array.isArray(cb.CallbackMetadata?.Item) ? cb.CallbackMetadata.Item : [];
  const findVal = (name: string): string | number | undefined =>
    items.find((it) => it?.Name === name)?.Value;

  const receiptRaw = findVal('MpesaReceiptNumber');
  const amountRaw = findVal('Amount');
  const phoneRaw = findVal('PhoneNumber');
  const dateRaw = findVal('TransactionDate');

  return {
    merchantRequestId: String(cb.MerchantRequestID || ''),
    checkoutRequestId: String(cb.CheckoutRequestID || ''),
    resultCode: Number(cb.ResultCode ?? -1),
    resultDesc: String(cb.ResultDesc || ''),
    mpesaReceiptNumber: receiptRaw ? String(receiptRaw).trim().toUpperCase() : null,
    amount: amountRaw !== undefined && Number.isFinite(Number(amountRaw)) ? Number(amountRaw) : null,
    phoneNumber: phoneRaw !== undefined ? String(phoneRaw).trim() : null,
    transactionDate: dateRaw !== undefined ? String(dateRaw).trim() : null,
  };
}
