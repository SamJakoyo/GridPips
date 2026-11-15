/**
 * Node.js WebSocket RPC client implementing the vdemydiuk/mtapi (MtApi5) protocol:
 *   Repository: https://github.com/vdemydiuk/mtapi
 *
 * Wire format (MtClient/MtMessage.cs & MtService/MtServer.cpp):
 *   Endpoint: ws://<host>:<port>/ws (default port 8228)
 *   MessageType:
 *     0 = Command        -> "0;<expertHandle>;<commandId>;<commandType>;<jsonPayload>"
 *     1 = Response       <- "1;<expertHandle>;<commandId>;<ResponseJson>"
 *     2 = Event          <- "2;<expertHandle>;<eventType>;<payload>"
 *     3 = ExpertList     <- "3;<handle1>,<handle2>,..."
 *     4 = ExpertAdded    <- "4;<handle>"
 *     5 = ExpertRemoved  <- "5;<handle>"
 *     6 = ServiceRequest -> "6;0" (ExpertList)
 */

export const DEFAULT_MTAPI5_PORT = 8228;

// Exact integer codes from MtApi5/MtProtocol/Mt5CommandType.cs
export const Mt5CommandType = {
  GetQuote: 1,
  PositionsTotal: 6,
  AccountInfoDouble: 32,
  AccountInfoInteger: 33,
  AccountInfoString: 34,
  PositionCloseAll: 160,
  OrderSend: 301,
  Buy: 304,
  Sell: 305,
  GetSymbols: 306,
} as const;

// Exact integer codes from MtApi5/Mt5Enums.cs
export const ENUM_ACCOUNT_INFO_INTEGER = {
  ACCOUNT_LOGIN: 0,
  ACCOUNT_TRADE_MODE: 32,
  ACCOUNT_TRADE_ALLOWED: 33,
  ACCOUNT_TRADE_EXPERT: 34,
  ACCOUNT_LEVERAGE: 35,
} as const;

export const ENUM_ACCOUNT_INFO_DOUBLE = {
  ACCOUNT_BALANCE: 37,
  ACCOUNT_CREDIT: 38,
  ACCOUNT_PROFIT: 39,
  ACCOUNT_EQUITY: 40,
  ACCOUNT_MARGIN: 41,
  ACCOUNT_MARGIN_FREE: 42,
} as const;

export const ENUM_ACCOUNT_INFO_STRING = {
  ACCOUNT_NAME: 1,
  ACCOUNT_COMPANY: 2,
  ACCOUNT_SERVER: 3,
  ACCOUNT_CURRENCY: 36,
} as const;

interface MtApiResponseEnvelope<T> {
  ErrorCode: number;
  ErrorMessage?: string | null;
  Value?: T | null;
}

export interface MqlTradeResultPayload {
  Retcode?: number;
  Deal?: number;
  Order?: number;
  Volume?: number;
  Price?: number;
  Bid?: number;
  Ask?: number;
  Comment?: string;
  Request_id?: number;
}

interface FuncResultPayload<T> {
  RetVal: boolean;
  Result?: T | null;
}

export interface MtApi5AccountSnapshot {
  endpointUrl: string;
  expertHandle: number;
  availableHandles: number[];
  login: string;
  name: string;
  server: string;
  company: string;
  currency: string;
  leverage: number;
  tradeAllowed: boolean;
  tradeExpert: boolean;
  balance: number;
  equity: number;
  marginFree: number;
  profit: number;
  openPositions: number;
}

export interface MtApi5OrderExecutionResult {
  endpointUrl: string;
  expertHandle: number;
  orderId: string;
  dealId?: string;
  retcode: number;
  price: number;
  volume: number;
  comment: string;
}

export function getMtApi5DefaultHost(): string {
  return (process.env.MTAPI5_HOST || process.env.MTAPI_HOST || '').trim();
}

export function getMtApi5DefaultPort(): number {
  const parsed = Number(process.env.MTAPI5_PORT || process.env.MTAPI_PORT || DEFAULT_MTAPI5_PORT);
  return Number.isInteger(parsed) && parsed > 0 && parsed <= 65535 ? parsed : DEFAULT_MTAPI5_PORT;
}

export function isMtApi5DefaultConfigured(): boolean {
  return getMtApi5DefaultHost().length > 0;
}

export function buildMtApi5WsUrl(hostInput: string, portInput?: number | null): {
  wsUrl: string;
  cleanHost: string;
  cleanPort: number;
} {
  const raw = String(hostInput || '').trim();
  if (!raw) {
    throw new Error('MtApi5 Host / Address is required (e.g. 127.0.0.1, VPS IP, or wss:// tunnel).');
  }

  const fallbackPort =
    typeof portInput === 'number' && Number.isInteger(portInput) && portInput > 0 && portInput <= 65535
      ? portInput
      : getMtApi5DefaultPort();

  // If user pasted a full ws://, wss://, http://, or https:// URL
  if (/^(wss?|https?):\/\//i.test(raw)) {
    const normalizedProtocol = raw
      .replace(/^http:\/\//i, 'ws://')
      .replace(/^https:\/\//i, 'wss://');
    let parsed: URL;
    try {
      parsed = new URL(normalizedProtocol);
    } catch {
      throw new Error('Invalid MtApi5 WebSocket URL format.');
    }
    const port = parsed.port ? Number(parsed.port) : parsed.protocol === 'wss:' ? 443 : fallbackPort;
    const path = !parsed.pathname || parsed.pathname === '/' ? '/ws' : parsed.pathname;
    const includePort =
      parsed.port !== '' || (parsed.protocol === 'ws:' && port !== 80) || (parsed.protocol === 'wss:' && port !== 443);
    const wsUrl = `${parsed.protocol}//${parsed.hostname}${includePort ? `:${port}` : ''}${path}`;
    return {
      wsUrl,
      cleanHost: parsed.hostname,
      cleanPort: port,
    };
  }

  // Strip accidental trailing /ws or slashes
  const stripped = raw.replace(/\/+ws$/i, '').replace(/\/+$/, '');
  if (/[\s/\\?#]/.test(stripped)) {
    throw new Error('MtApi5 host must be an IP, hostname, or valid ws:// / wss:// URL.');
  }

  let hostname = stripped;
  let port = fallbackPort;

  // Handle host:port syntax (for IPv4/domain)
  const colonIdx = stripped.lastIndexOf(':');
  if (colonIdx > 0 && !stripped.includes('[')) {
    const maybePort = Number(stripped.slice(colonIdx + 1));
    if (Number.isInteger(maybePort) && maybePort > 0 && maybePort <= 65535) {
      hostname = stripped.slice(0, colonIdx);
      port = maybePort;
    }
  }

  const protocol = port === 443 ? 'wss' : 'ws';
  const wsUrl = `${protocol}://${hostname}:${port}/ws`;
  return {
    wsUrl,
    cleanHost: hostname,
    cleanPort: port,
  };
}

class MtApi5RpcSession {
  private ws: WebSocket | null = null;
  private nextCommandId = 1;
  private pendingCommands = new Map<
    number,
    {
      resolve: (payload: string) => void;
      reject: (err: Error) => void;
      timer: ReturnType<typeof setTimeout>;
    }
  >();
  private expertListWaiter: {
    resolve: (handles: number[]) => void;
    reject: (err: Error) => void;
    timer: ReturnType<typeof setTimeout>;
  } | null = null;
  private knownHandles: number[] = [];

  constructor(private readonly wsUrl: string) {}

  async connect(timeoutMs = 7000): Promise<void> {
    if (typeof globalThis.WebSocket !== 'function') {
      throw new Error('Node WebSocket client is unavailable in this runtime.');
    }

    await new Promise<void>((resolve, reject) => {
      let settled = false;
      const ws = new globalThis.WebSocket(this.wsUrl);
      this.ws = ws;

      const timer = setTimeout(() => {
        if (!settled) {
          settled = true;
          try {
            ws.close();
          } catch {
            // ignore close error
          }
          reject(
            new Error(
              `Timed out connecting to MtApi5 Service at ${this.wsUrl}. Verify MtApi5 is running on port 8228 and reachable from the server.`
            )
          );
        }
      }, timeoutMs);

      ws.addEventListener('open', () => {
        if (!settled) {
          settled = true;
          clearTimeout(timer);
          resolve();
        }
      });

      ws.addEventListener('error', () => {
        if (!settled) {
          settled = true;
          clearTimeout(timer);
          reject(
            new Error(
              `Unable to reach MtApi5 WebSocket at ${this.wsUrl}. Ensure MtApi5 Service is installed, port is forwarded/accessible, and MtApi5 EA is attached in MT5.`
            )
          );
        }
      });

      ws.addEventListener('close', () => {
        this.rejectAllPending(new Error('MtApi5 WebSocket connection closed unexpectedly.'));
      });

      ws.addEventListener('message', (event: MessageEvent) => {
        const raw = typeof event.data === 'string' ? event.data : String(event.data || '');
        this.handleRawFrame(raw);
      });
    });
  }

  private rejectAllPending(err: Error): void {
    if (this.expertListWaiter) {
      clearTimeout(this.expertListWaiter.timer);
      this.expertListWaiter.reject(err);
      this.expertListWaiter = null;
    }
    for (const [id, entry] of this.pendingCommands.entries()) {
      clearTimeout(entry.timer);
      entry.reject(err);
      this.pendingCommands.delete(id);
    }
  }

  private handleRawFrame(raw: string): void {
    const firstSep = raw.indexOf(';');
    if (firstSep === -1) return;

    const msgType = Number(raw.slice(0, firstSep));
    const body = raw.slice(firstSep + 1);

    // 1 = Response -> "<expertHandle>;<commandId>;<payload>"
    if (msgType === 1) {
      const p1 = body.indexOf(';');
      if (p1 === -1) return;
      const p2 = body.indexOf(';', p1 + 1);
      if (p2 === -1) return;

      const commandId = Number(body.slice(p1 + 1, p2));
      const payload = body.slice(p2 + 1);
      const pending = this.pendingCommands.get(commandId);
      if (pending) {
        clearTimeout(pending.timer);
        this.pendingCommands.delete(commandId);
        pending.resolve(payload);
      }
      return;
    }

    // 3 = ExpertList -> "<h1,h2,...>" or empty string
    if (msgType === 3) {
      const handles = body
        .split(',')
        .map((part) => Number(part.trim()))
        .filter((num) => Number.isInteger(num) && num > 0);
      this.knownHandles = handles;
      if (this.expertListWaiter) {
        clearTimeout(this.expertListWaiter.timer);
        const w = this.expertListWaiter;
        this.expertListWaiter = null;
        w.resolve(handles);
      }
      return;
    }

    // 4 = ExpertAdded -> "<handle>"
    if (msgType === 4) {
      const handle = Number(body.trim());
      if (Number.isInteger(handle) && handle > 0 && !this.knownHandles.includes(handle)) {
        this.knownHandles.push(handle);
      }
      return;
    }

    // 5 = ExpertRemoved -> "<handle>"
    if (msgType === 5) {
      const handle = Number(body.trim());
      this.knownHandles = this.knownHandles.filter((h) => h !== handle);
    }
  }

  async requestExpertHandles(timeoutMs = 5000): Promise<number[]> {
    if (!this.ws || this.ws.readyState !== 1) {
      throw new Error('MtApi5 WebSocket is not open.');
    }

    return await new Promise<number[]>((resolve, reject) => {
      const timer = setTimeout(() => {
        if (this.expertListWaiter) {
          this.expertListWaiter = null;
          if (this.knownHandles.length > 0) {
            resolve(this.knownHandles);
          } else {
            reject(new Error('Timed out waiting for MtApi5 ExpertList response.'));
          }
        }
      }, timeoutMs);

      this.expertListWaiter = { resolve, reject, timer };
      // MessageType.ServiceRequest (6) ; ServiceRequestType.ExpertList (0)
      this.ws!.send('6;0');
    });
  }

  async sendCommand<T>(
    expertHandle: number,
    commandType: number,
    payloadObj?: Record<string, unknown> | null,
    timeoutMs = 8000
  ): Promise<T> {
    if (!this.ws || this.ws.readyState !== 1) {
      throw new Error('MtApi5 WebSocket is not open.');
    }

    const commandId = this.nextCommandId++;
    const payload = payloadObj ? JSON.stringify(payloadObj) : '';
    const frame = `0;${expertHandle};${commandId};${commandType};${payload}`;

    const rawResponse = await new Promise<string>((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pendingCommands.delete(commandId);
        reject(new Error(`MtApi5 command #${commandType} timed out after ${timeoutMs}ms.`));
      }, timeoutMs);

      this.pendingCommands.set(commandId, { resolve, reject, timer });
      this.ws!.send(frame);
    });

    if (!rawResponse) {
      throw new Error('Empty response received from MetaTrader 5 via MtApi5.');
    }

    const envelope = JSON.parse(rawResponse) as MtApiResponseEnvelope<T>;
    if (envelope.ErrorCode !== 0) {
      throw new Error(
        `MtApi5 Error ${envelope.ErrorCode}: ${envelope.ErrorMessage || 'MetaTrader 5 execution error'}`
      );
    }

    return envelope.Value as T;
  }

  close(): void {
    try {
      this.rejectAllPending(new Error('MtApi5 session closed.'));
      if (this.ws && (this.ws.readyState === 0 || this.ws.readyState === 1)) {
        this.ws.close();
      }
    } catch {
      // ignore close errors
    } finally {
      this.ws = null;
    }
  }
}

async function openReadySession(params: {
  host: string;
  port?: number | null;
  preferredHandle?: number | null;
}): Promise<{
  session: MtApi5RpcSession;
  wsUrl: string;
  expertHandle: number;
  handles: number[];
}> {
  const { wsUrl } = buildMtApi5WsUrl(params.host, params.port);
  const session = new MtApi5RpcSession(wsUrl);
  await session.connect();

  try {
    const handles = await session.requestExpertHandles();
    if (!handles.length) {
      throw new Error(
        'Connected to MtApi5 Service, but no MtApi5 EA handle is registered yet. Open MetaTrader 5, drag the MtApi5 Expert Advisor onto any chart, and turn Algo Trading ON.'
      );
    }
    const expertHandle =
      params.preferredHandle && handles.includes(params.preferredHandle)
        ? params.preferredHandle
        : handles[0];
    return { session, wsUrl, expertHandle, handles };
  } catch (err) {
    session.close();
    throw err;
  }
}

export async function fetchMtApi5AccountSnapshot(params: {
  host: string;
  port?: number | null;
  preferredHandle?: number | null;
}): Promise<MtApi5AccountSnapshot> {
  const { session, wsUrl, expertHandle, handles } = await openReadySession(params);
  try {
    const [
      loginNum,
      leverageNum,
      tradeAllowedNum,
      tradeExpertNum,
      nameStr,
      companyStr,
      serverStr,
      currencyStr,
      balance,
      equity,
      marginFree,
      profit,
      openPositions,
    ] = await Promise.all([
      session.sendCommand<number>(expertHandle, Mt5CommandType.AccountInfoInteger, {
        PropertyId: ENUM_ACCOUNT_INFO_INTEGER.ACCOUNT_LOGIN,
      }),
      session.sendCommand<number>(expertHandle, Mt5CommandType.AccountInfoInteger, {
        PropertyId: ENUM_ACCOUNT_INFO_INTEGER.ACCOUNT_LEVERAGE,
      }),
      session.sendCommand<number>(expertHandle, Mt5CommandType.AccountInfoInteger, {
        PropertyId: ENUM_ACCOUNT_INFO_INTEGER.ACCOUNT_TRADE_ALLOWED,
      }),
      session.sendCommand<number>(expertHandle, Mt5CommandType.AccountInfoInteger, {
        PropertyId: ENUM_ACCOUNT_INFO_INTEGER.ACCOUNT_TRADE_EXPERT,
      }),
      session.sendCommand<string>(expertHandle, Mt5CommandType.AccountInfoString, {
        PropertyId: ENUM_ACCOUNT_INFO_STRING.ACCOUNT_NAME,
      }),
      session.sendCommand<string>(expertHandle, Mt5CommandType.AccountInfoString, {
        PropertyId: ENUM_ACCOUNT_INFO_STRING.ACCOUNT_COMPANY,
      }),
      session.sendCommand<string>(expertHandle, Mt5CommandType.AccountInfoString, {
        PropertyId: ENUM_ACCOUNT_INFO_STRING.ACCOUNT_SERVER,
      }),
      session.sendCommand<string>(expertHandle, Mt5CommandType.AccountInfoString, {
        PropertyId: ENUM_ACCOUNT_INFO_STRING.ACCOUNT_CURRENCY,
      }),
      session.sendCommand<number>(expertHandle, Mt5CommandType.AccountInfoDouble, {
        PropertyId: ENUM_ACCOUNT_INFO_DOUBLE.ACCOUNT_BALANCE,
      }),
      session.sendCommand<number>(expertHandle, Mt5CommandType.AccountInfoDouble, {
        PropertyId: ENUM_ACCOUNT_INFO_DOUBLE.ACCOUNT_EQUITY,
      }),
      session.sendCommand<number>(expertHandle, Mt5CommandType.AccountInfoDouble, {
        PropertyId: ENUM_ACCOUNT_INFO_DOUBLE.ACCOUNT_MARGIN_FREE,
      }),
      session.sendCommand<number>(expertHandle, Mt5CommandType.AccountInfoDouble, {
        PropertyId: ENUM_ACCOUNT_INFO_DOUBLE.ACCOUNT_PROFIT,
      }),
      session.sendCommand<number>(expertHandle, Mt5CommandType.PositionsTotal, null),
    ]);

    return {
      endpointUrl: wsUrl,
      expertHandle,
      availableHandles: handles,
      login: String(loginNum || ''),
      name: String(nameStr || ''),
      server: String(serverStr || ''),
      company: String(companyStr || ''),
      currency: String(currencyStr || 'USD'),
      leverage: Number(leverageNum || 0),
      tradeAllowed: Boolean(tradeAllowedNum),
      tradeExpert: Boolean(tradeExpertNum),
      balance: Number(balance || 0),
      equity: Number(equity || 0),
      marginFree: Number(marginFree || 0),
      profit: Number(profit || 0),
      openPositions: Math.max(0, Math.trunc(Number(openPositions || 0))),
    };
  } finally {
    session.close();
  }
}

export async function executeMtApi5Order(params: {
  host: string;
  port?: number | null;
  preferredHandle?: number | null;
  symbol: string;
  side: 'BUY' | 'SELL';
  volume: number;
  stopLoss?: number | null;
  takeProfit?: number | null;
  comment?: string;
}): Promise<MtApi5OrderExecutionResult> {
  const { session, wsUrl, expertHandle } = await openReadySession(params);
  try {
    const commandType = params.side === 'BUY' ? Mt5CommandType.Buy : Mt5CommandType.Sell;
    const cmdParams: Record<string, unknown> = {
      Volume: params.volume,
      Price: 0.0,
      Sl: typeof params.stopLoss === 'number' && params.stopLoss > 0 ? params.stopLoss : 0.0,
      Tp: typeof params.takeProfit === 'number' && params.takeProfit > 0 ? params.takeProfit : 0.0,
      Symbol: params.symbol,
      Comment: params.comment || 'GRIDPIPs MtApi5 EA',
    };

    const res = await session.sendCommand<FuncResultPayload<MqlTradeResultPayload>>(
      expertHandle,
      commandType,
      cmdParams,
      12000
    );

    const tradeRes = res?.Result;
    if (!res?.RetVal) {
      const code = tradeRes?.Retcode ?? 0;
      const note = tradeRes?.Comment || 'Order rejected by MetaTrader 5 terminal.';
      throw new Error(`MT5 Order Rejected (Retcode ${code}): ${note}`);
    }

    return {
      endpointUrl: wsUrl,
      expertHandle,
      orderId: String(tradeRes?.Order || tradeRes?.Deal || `MT5-${Date.now()}`),
      dealId: tradeRes?.Deal ? String(tradeRes.Deal) : undefined,
      retcode: Number(tradeRes?.Retcode ?? 10009),
      price: Number(tradeRes?.Price ?? 0),
      volume: Number(tradeRes?.Volume ?? params.volume),
      comment: String(tradeRes?.Comment || 'Executed via MtApi5'),
    };
  } finally {
    session.close();
  }
}

export async function closeAllMtApi5Positions(params: {
  host: string;
  port?: number | null;
  preferredHandle?: number | null;
}): Promise<{
  endpointUrl: string;
  expertHandle: number;
  closedCount: number;
}> {
  const { session, wsUrl, expertHandle } = await openReadySession(params);
  try {
    const closedCount = await session.sendCommand<number>(
      expertHandle,
      Mt5CommandType.PositionCloseAll,
      null,
      12000
    );
    return {
      endpointUrl: wsUrl,
      expertHandle,
      closedCount: Math.max(0, Math.trunc(Number(closedCount || 0))),
    };
  } finally {
    session.close();
  }
}
