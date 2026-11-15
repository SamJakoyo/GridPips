import React, { useEffect, useState, useCallback } from 'react';
import {
  Download,
  Lock,
  Copy,
  CheckCircle2,
  Terminal,
  Link2,
  RefreshCw,
  Power,
  Zap,
  ShieldCheck,
  ExternalLink,
  XCircle,
} from 'lucide-react';
import { apiFetch } from '../lib/api';
import type { PublicConfig, User } from '../types';

interface EaBotsViewProps {
  user: User;
  config: PublicConfig;
  onUnlockClick: () => void;
  onUserUpdated: (user: User) => void;
}

interface Mt5TelemetryEvent {
  id: number;
  ea_name: string;
  symbol: string;
  status: string;
  balance: number;
  equity: number;
  open_positions: number;
  created_at: string;
}

interface Mt5TradeCommand {
  id: number;
  symbol: string;
  side: string;
  volume: number;
  stop_loss: number | null;
  take_profit: number | null;
  source_ea: string;
  execution_mode: string;
  status: string;
  external_order_id: string | null;
  error_message: string | null;
  created_at: string;
  executed_at: string | null;
}

const PRESET_SERVERS = [
  'Exness-MT5Real',
  'Exness-MT5Real2',
  'Exness-MT5Real5',
  'Exness-MT5Real14',
  'Exness-MT5Trial',
  'Exness-MT5Trial5',
  'Exness-MT5Trial8',
  'CUSTOM',
];

const TRADE_SYMBOLS = ['EURUSD', 'GBPUSD', 'USDJPY', 'XAUUSD', 'NAS100', 'US30', 'BTCUSD'];

export const EaBotsView: React.FC<EaBotsViewProps> = ({
  user,
  config,
  onUnlockClick,
  onUserUpdated,
}) => {
  const [activeFile, setActiveFile] = useState<'silverbullet' | 'orderblock' | 'guide'>('silverbullet');
  const [fileContent, setFileContent] = useState('');
  const [fileName, setFileName] = useState('');
  const [bridgeToken, setBridgeToken] = useState(user.mt5BridgeToken || '');
  const [bridgeEndpoint, setBridgeEndpoint] = useState(`${window.location.origin}/api/ea/mt5/heartbeat`);

  const [connectionMode, setConnectionMode] = useState<'mtapi5' | 'bridge'>(
    user.mt5ConnectionMode === 'mtapi5' || user.mt5Mtapi5DefaultConfigured ? 'mtapi5' : 'bridge'
  );
  const [mtapiHost, setMtapiHost] = useState(user.mt5MtapiHost || '127.0.0.1');
  const [mtapiPort, setMtapiPort] = useState(String(user.mt5MtapiPort || 8228));

  const initialServer = user.mt5Server || 'Exness-MT5Real';
  const [serverPreset, setServerPreset] = useState(
    PRESET_SERVERS.includes(initialServer) ? initialServer : 'CUSTOM'
  );
  const [customServer, setCustomServer] = useState(
    PRESET_SERVERS.includes(initialServer) ? '' : initialServer
  );
  const [mt5Login, setMt5Login] = useState(user.mt5Login || user.exnessAccountId || '');
  const [activeBot, setActiveBot] = useState<'silverbullet' | 'orderblock' | 'both'>(
    (user.mt5ActiveBot as 'silverbullet' | 'orderblock' | 'both') || 'both'
  );
  const [riskPercent, setRiskPercent] = useState(String(user.mt5RiskPercent ?? 1.0));

  const [connecting, setConnecting] = useState(false);
  const [togglingAuto, setTogglingAuto] = useState(false);
  const [syncingLive, setSyncingLive] = useState(false);
  const [closingAll, setClosingAll] = useState(false);
  const [rotatingToken, setRotatingToken] = useState(false);
  const [testingHeartbeat, setTestingHeartbeat] = useState(false);
  const [refreshingTelemetry, setRefreshingTelemetry] = useState(false);

  // Quick Auto-Trade execution form
  const [execSymbol, setExecSymbol] = useState('EURUSD');
  const [execSide, setExecSide] = useState<'BUY' | 'SELL'>('BUY');
  const [execVolume, setExecVolume] = useState('0.05');
  const [execSl, setExecSl] = useState('');
  const [execTp, setExecTp] = useState('');
  const [executingTrade, setExecutingTrade] = useState(false);

  const [events, setEvents] = useState<Mt5TelemetryEvent[]>([]);
  const [commands, setCommands] = useState<Mt5TradeCommand[]>([]);
  const [statusMessage, setStatusMessage] = useState('');
  const [errorMessage, setErrorMessage] = useState('');
  const [copiedCode, setCopiedCode] = useState(false);
  const [copiedField, setCopiedField] = useState<'url' | 'token' | null>(null);

  const effectiveServer = serverPreset === 'CUSTOM' ? customServer.trim() : serverPreset;

  const fetchMt5Status = useCallback(
    async (manual = false) => {
      if (!user.hasEaBots) return;
      if (manual) setRefreshingTelemetry(true);
      try {
        const res = await apiFetch<{
          user: User;
          events: Mt5TelemetryEvent[];
          commands?: Mt5TradeCommand[];
        }>('/api/ea/mt5/status');
        if (res.user) {
          onUserUpdated(res.user);
          if (res.user.mt5BridgeToken) setBridgeToken(res.user.mt5BridgeToken);
          if (res.user.mt5MtapiHost) setMtapiHost(res.user.mt5MtapiHost);
          if (res.user.mt5MtapiPort) setMtapiPort(String(res.user.mt5MtapiPort));
        }
        setEvents(res.events || []);
        if (res.commands) setCommands(res.commands);
      } catch {
        // ignore background poll errors
      } finally {
        if (manual) setRefreshingTelemetry(false);
      }
    },
    [user.hasEaBots, onUserUpdated]
  );

  useEffect(() => {
    if (!user.hasEaBots) return;
    apiFetch<{ filename: string; content: string; bridgeToken?: string; bridgeEndpoint?: string }>(
      `/api/ea/source/${activeFile}`
    )
      .then((res) => {
        setFileName(res.filename);
        setFileContent(res.content);
        if (res.bridgeToken) setBridgeToken(res.bridgeToken);
        if (res.bridgeEndpoint) setBridgeEndpoint(res.bridgeEndpoint);
      })
      .catch(() => {});
  }, [activeFile, user.hasEaBots]);

  useEffect(() => {
    if (!user.hasEaBots) return;
    fetchMt5Status(false);
    const id = setInterval(() => fetchMt5Status(false), 8000);
    return () => clearInterval(id);
  }, [user.hasEaBots, fetchMt5Status]);

  if (!user.hasEaBots) {
    return (
      <div className="max-w-3xl mx-auto bg-white border border-slate-200 rounded-xl p-8">
        <div className="flex items-center gap-2 text-xs font-semibold text-blue-600 mb-2">
          <Lock className="w-4 h-4" />
          <span>MQL5 Automated Trading Pack · ${config.eaBotsPriceUsd.toFixed(2)}</span>
        </div>
        <h2 className="text-2xl font-bold text-slate-950 mb-3">
          Purchase MQL5 EA Bots + MtApi5 Auto-Trade Bridge
        </h2>
        <p className="text-sm text-slate-600 leading-relaxed mb-6">
          Connect your clients&apos; MetaTrader 5 terminals with one click using the{' '}
          <span className="font-mono text-slate-900">vdemydiuk/mtapi (MtApi5)</span> WebSocket API or pre-wired{' '}
          <span className="font-mono text-slate-900">.mq5</span> Expert Advisors for automated execution, live equity sync, and order routing.
        </p>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-6 text-sm text-slate-700">
          <div className="p-3 bg-slate-50 border border-slate-200 rounded-lg">
            · GRIDPIPs_ICT_SilverBullet_EA.mq5 (FVG + Auto-Trade)
          </div>
          <div className="p-3 bg-slate-50 border border-slate-200 rounded-lg">
            · GRIDPIPs_SMC_OrderBlock_EA.mq5 (Sweeps + Auto-Trade)
          </div>
          <div className="p-3 bg-slate-50 border border-slate-200 rounded-lg">
            · Direct MtApi5 (vdemydiuk/mtapi) Socket API Connector
          </div>
          <div className="p-3 bg-slate-50 border border-slate-200 rounded-lg">
            · Live Client MT5 Equity, Execution &amp; Position Controls
          </div>
        </div>
        <button
          onClick={onUnlockClick}
          className="px-6 py-3 bg-blue-600 text-white text-sm font-semibold rounded-lg hover:bg-blue-700 transition-colors cursor-pointer"
        >
          Buy MQL5 EA Bots Pack — ${config.eaBotsPriceUsd.toFixed(2)} (M-Pesa / Crypto)
        </button>
      </div>
    );
  }

  async function handleConnectMt5(e: React.FormEvent) {
    e.preventDefault();
    if (connectionMode === 'mtapi5' && !mtapiHost.trim()) {
      setErrorMessage('Enter your MtApi5 Host / VPS Address or wss:// tunnel (port 8228).');
      return;
    }
    if (connectionMode === 'bridge' && (!mt5Login.trim() || !effectiveServer)) {
      setErrorMessage('Enter your client MT5 Login ID and broker server name.');
      return;
    }

    setConnecting(true);
    setStatusMessage('');
    setErrorMessage('');
    try {
      const res = await apiFetch<{ user: User; connectionMode?: string; message?: string }>(
        '/api/ea/mt5/connect',
        {
          method: 'POST',
          body: JSON.stringify({
            connectionMode,
            mtapiHost: connectionMode === 'mtapi5' ? mtapiHost.trim() : undefined,
            mtapiPort: connectionMode === 'mtapi5' ? Number(mtapiPort) || 8228 : undefined,
            mt5Login: mt5Login.trim(),
            mt5Server: effectiveServer,
            autoTrade: true,
            activeBot,
            riskPercent: Number(riskPercent) || 1.0,
          }),
        }
      );
      onUserUpdated(res.user);
      if (res.user.mt5BridgeToken) setBridgeToken(res.user.mt5BridgeToken);
      if (res.user.mt5Login) setMt5Login(res.user.mt5Login);
      setStatusMessage(
        res.message ||
          `Client MT5 account ${res.user.mt5Login || mt5Login} connected with Auto-Trading enabled.`
      );
      await fetchMt5Status(false);
    } catch (err) {
      setErrorMessage(err instanceof Error ? err.message : 'Failed to connect MT5 terminal.');
    } finally {
      setConnecting(false);
    }
  }

  async function handleToggleAutoTrade(nextEnabled?: boolean) {
    setTogglingAuto(true);
    setStatusMessage('');
    setErrorMessage('');
    try {
      const targetState = nextEnabled !== undefined ? nextEnabled : !Boolean(user.mt5AutoTrade);
      const res = await apiFetch<{ user: User }>('/api/ea/mt5/auto-trade', {
        method: 'POST',
        body: JSON.stringify({
          enabled: targetState,
          activeBot,
          riskPercent: Number(riskPercent) || 1.0,
        }),
      });
      onUserUpdated(res.user);
      setStatusMessage(
        res.user.mt5AutoTrade
          ? `Auto-Trading is now ACTIVE for MT5 ${res.user.mt5Login || 'account'}.`
          : 'Auto-Trading is paused. Existing positions remain protected by their SL/TP.'
      );
      await fetchMt5Status(false);
    } catch (err) {
      setErrorMessage(err instanceof Error ? err.message : 'Failed to toggle auto-trading.');
    } finally {
      setTogglingAuto(false);
    }
  }

  async function handleSyncLiveMt5() {
    setSyncingLive(true);
    setStatusMessage('');
    setErrorMessage('');
    try {
      const res = await apiFetch<{
        user: User;
        events: Mt5TelemetryEvent[];
        commands: Mt5TradeCommand[];
      }>('/api/ea/mt5/sync', { method: 'POST' });
      onUserUpdated(res.user);
      setEvents(res.events || []);
      setCommands(res.commands || []);
      setStatusMessage(
        res.user.mt5ConnectionMode === 'mtapi5'
          ? `Live MtApi5 sync completed — Balance: $${(res.user.mt5Balance ?? 0).toFixed(2)}, Open Positions: ${res.user.mt5OpenPositions ?? 0}.`
          : 'MT5 account telemetry and auto-trade queue synced.'
      );
    } catch (err) {
      setErrorMessage(err instanceof Error ? err.message : 'Unable to sync live MT5 terminal.');
    } finally {
      setSyncingLive(false);
    }
  }

  async function handleCloseAllPositions() {
    setClosingAll(true);
    setStatusMessage('');
    setErrorMessage('');
    try {
      const res = await apiFetch<{ ok: boolean; closedCount: number; message: string }>(
        '/api/ea/mt5/close-all',
        { method: 'POST' }
      );
      setStatusMessage(res.message);
      await fetchMt5Status(false);
    } catch (err) {
      setErrorMessage(err instanceof Error ? err.message : 'Failed to close MT5 positions.');
    } finally {
      setClosingAll(false);
    }
  }

  async function handleExecuteTrade(e: React.FormEvent) {
    e.preventDefault();
    setExecutingTrade(true);
    setStatusMessage('');
    setErrorMessage('');
    try {
      const res = await apiFetch<{ ok: boolean; mode: string; message: string }>(
        '/api/ea/mt5/execute',
        {
          method: 'POST',
          body: JSON.stringify({
            symbol: execSymbol,
            side: execSide,
            volume: Number(execVolume) || 0.01,
            stopLoss: execSl ? Number(execSl) : undefined,
            takeProfit: execTp ? Number(execTp) : undefined,
            sourceEa:
              activeBot === 'silverbullet'
                ? 'ICT Silver Bullet EA'
                : activeBot === 'orderblock'
                ? 'SMC Order Block EA'
                : 'GRIDPIPs Auto-Trade EA',
          }),
        }
      );
      setStatusMessage(res.message);
      await fetchMt5Status(false);
    } catch (err) {
      setErrorMessage(err instanceof Error ? err.message : 'Failed to send order to MT5.');
    } finally {
      setExecutingTrade(false);
    }
  }

  async function handleTestHeartbeat() {
    const activeToken = bridgeToken || user.mt5BridgeToken;
    if (!activeToken) return;
    setTestingHeartbeat(true);
    setStatusMessage('');
    setErrorMessage('');
    try {
      const res = await apiFetch<{ syncedAt: string; status: string }>('/api/ea/mt5/heartbeat', {
        method: 'POST',
        body: JSON.stringify({
          token: activeToken,
          login: mt5Login,
          server: effectiveServer || 'Exness-MT5Real',
          symbol: user.mt5Symbol || 'EURUSD',
          eaName: 'Dashboard Bridge Ping',
          status: 'BRIDGE_TEST_OK',
          balance: user.mt5Balance ?? 0,
          equity: user.mt5Equity ?? 0,
          openPositions: user.mt5OpenPositions ?? 0,
        }),
      });
      await fetchMt5Status(false);
      setStatusMessage(
        `MT5 Bridge heartbeat verified (${res.status}) at ${new Date(res.syncedAt).toLocaleTimeString()}.`
      );
    } catch (err) {
      setErrorMessage(err instanceof Error ? err.message : 'Heartbeat test failed');
    } finally {
      setTestingHeartbeat(false);
    }
  }

  async function handleRotateBridgeToken() {
    setRotatingToken(true);
    setStatusMessage('');
    setErrorMessage('');
    try {
      const res = await apiFetch<{ user: User; bridgeToken: string; message?: string }>(
        '/api/ea/mt5/rotate-token',
        { method: 'POST' }
      );
      onUserUpdated(res.user);
      setBridgeToken(res.bridgeToken);
      setStatusMessage(res.message || 'Generated a new MT5 Bridge API Key.');
    } catch (err) {
      setErrorMessage(err instanceof Error ? err.message : 'Unable to rotate bridge API key.');
    } finally {
      setRotatingToken(false);
    }
  }

  function copySource() {
    navigator.clipboard.writeText(fileContent);
    setCopiedCode(true);
    setTimeout(() => setCopiedCode(false), 1800);
  }

  function copyText(field: 'url' | 'token', value: string) {
    navigator.clipboard.writeText(value);
    setCopiedField(field);
    setTimeout(() => setCopiedField(null), 1600);
  }

  const autoTradeOn = Boolean(user.mt5AutoTrade);
  const isMtApi5Active = user.mt5ConnectionMode === 'mtapi5';

  return (
    <div className="space-y-6">
      {/* Hero Banner */}
      <div className="bg-slate-950 text-white rounded-xl p-6 flex flex-col lg:flex-row items-start lg:items-center justify-between gap-4 border border-slate-800">
        <div>
          <div className="text-xs font-medium text-[#E5A93C] mb-1">
            {isMtApi5Active
              ? `MtApi5 Socket API Connected (Expert #${user.mt5MtapiExpertHandle ?? '1'})`
              : 'MtApi5 (vdemydiuk/mtapi) + MQL5 EA Two-Way Auto-Trade Engine'}
          </div>
          <h2 className="text-xl font-bold">Connect Client MT5 Accounts &amp; Automate EA Trading</h2>
          <p className="text-xs text-slate-300 mt-1 max-w-2xl">
            Connect directly to any client MT5 terminal running <span className="font-mono text-[#E5A93C]">MtApi5 (ws://host:8228/ws)</span> from <span className="font-mono">vdemydiuk/mtapi</span>, or bind our pre-wired <span className="font-mono">.mq5</span> Expert Advisors for automated execution.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-3 shrink-0">
          <button
            type="button"
            disabled={togglingAuto}
            onClick={() => handleToggleAutoTrade(!autoTradeOn)}
            className={`px-4 py-2.5 text-xs font-semibold rounded-lg inline-flex items-center gap-2 cursor-pointer whitespace-nowrap transition-colors ${
              autoTradeOn
                ? 'bg-emerald-500 hover:bg-emerald-400 text-slate-950'
                : 'bg-[#E5A93C] hover:bg-[#F0B84D] text-[#090806]'
            }`}
          >
            <Power className="w-3.5 h-3.5" />
            {togglingAuto
              ? 'Updating...'
              : autoTradeOn
              ? 'Auto-Trading: ON (Click to Pause)'
              : 'Enable MT5 Auto-Trading'}
          </button>

          <a
            href="/api/ea/download"
            className="px-4 py-2.5 bg-blue-600 text-white text-xs font-semibold rounded-lg hover:bg-blue-700 inline-flex items-center gap-2 whitespace-nowrap"
          >
            <Download className="w-3.5 h-3.5" />
            Download .ZIP Pack
          </a>
        </div>
      </div>

      {/* Status / Error Alerts */}
      {statusMessage && (
        <div className="p-3.5 bg-emerald-950/90 border border-emerald-700/70 text-emerald-100 text-xs rounded-xl flex items-center gap-2">
          <ShieldCheck className="w-4 h-4 text-emerald-400 shrink-0" />
          <span>{statusMessage}</span>
        </div>
      )}
      {errorMessage && (
        <div className="p-3.5 bg-rose-950/90 border border-rose-700/70 text-rose-100 text-xs rounded-xl">
          {errorMessage}
        </div>
      )}

      {/* Live MT5 Telemetry Strip */}
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-4">
        <div className="bg-white border border-slate-200 rounded-xl p-4">
          <div className="text-xs text-slate-500">Auto-Trading Status</div>
          <div
            className={`text-sm font-bold mt-1 ${
              autoTradeOn && user.mt5Connected
                ? 'text-emerald-700'
                : user.mt5Connected
                ? 'text-blue-700'
                : 'text-amber-700'
            }`}
          >
            {user.mt5Connected
              ? autoTradeOn
                ? 'Auto-Trade ACTIVE'
                : user.mt5Status || 'Connected (Paused)'
              : 'Pending MT5 Link'}
          </div>
          <div className="text-[11px] text-slate-500 mt-0.5">
            Mode: {isMtApi5Active ? 'MtApi5 (vdemydiuk/mtapi)' : 'MQL5 EA Bridge'}
          </div>
        </div>

        <div className="bg-white border border-slate-200 rounded-xl p-4">
          <div className="text-xs text-slate-500">Client MT5 Account</div>
          <div className="text-sm font-mono tabular-nums font-bold text-slate-950 mt-1">
            {user.mt5Login || 'Not Bound'}
          </div>
          <div className="text-xs text-slate-500 truncate">{user.mt5Server || 'Select connection below'}</div>
        </div>

        <div className="bg-white border border-slate-200 rounded-xl p-4">
          <div className="text-xs text-slate-500">Balance / Equity</div>
          <div className="text-sm font-mono tabular-nums font-bold text-slate-950 mt-1">
            {user.mt5Balance !== null && user.mt5Balance !== undefined
              ? `$${user.mt5Balance.toFixed(2)} / $${(user.mt5Equity ?? user.mt5Balance).toFixed(2)}`
              : 'Awaiting live sync'}
          </div>
        </div>

        <div className="bg-white border border-slate-200 rounded-xl p-4">
          <div className="text-xs text-slate-500">Active EA &amp; Risk</div>
          <div className="text-sm font-semibold text-slate-950 mt-1 truncate">
            {activeBot === 'silverbullet'
              ? 'Silver Bullet EA'
              : activeBot === 'orderblock'
              ? 'SMC Order Block EA'
              : 'Both ICT & SMC EAs'}
          </div>
          <div className="text-xs font-mono text-slate-500">
            Risk {user.mt5RiskPercent ?? 1.0}% · {user.mt5OpenPositions ?? 0} open
          </div>
        </div>

        <div className="bg-white border border-slate-200 rounded-xl p-4 flex flex-col justify-between">
          <div>
            <div className="text-xs text-slate-500">Last Sync</div>
            <div className="text-xs font-mono tabular-nums font-semibold text-slate-950 mt-1">
              {user.mt5LastSync || 'Never'}
            </div>
          </div>
          <button
            type="button"
            onClick={handleSyncLiveMt5}
            disabled={syncingLive || refreshingTelemetry}
            className="text-xs font-semibold text-blue-600 hover:underline inline-flex items-center gap-1 mt-2 cursor-pointer self-start"
          >
            <RefreshCw className={`w-3 h-3 ${syncingLive || refreshingTelemetry ? 'animate-spin' : ''}`} />
            {syncingLive ? 'Syncing...' : 'Sync MT5 Now'}
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Left Column: Connect Client MT5 + Direct Auto-Trade Execution */}
        <div className="lg:col-span-5 space-y-6">
          <div className="bg-white border border-slate-200 rounded-xl p-6 space-y-5">
            <div className="flex items-center justify-between">
              <h3 className="text-base font-bold text-slate-950 flex items-center gap-2">
                <Link2 className="w-4 h-4 text-blue-600" />
                Connect Client MT5 Account
              </h3>
              <span className={`text-xs font-semibold ${user.mt5Connected ? 'text-emerald-700' : 'text-amber-700'}`}>
                {user.mt5Connected ? 'Linked' : 'Not Linked'}
              </span>
            </div>

            {/* Connection Mode Toggle */}
            <div className="grid grid-cols-2 gap-1.5 p-1 bg-slate-100 rounded-lg">
              <button
                type="button"
                onClick={() => setConnectionMode('mtapi5')}
                className={`py-2 px-2.5 text-xs font-semibold rounded-md cursor-pointer transition-colors ${
                  connectionMode === 'mtapi5'
                    ? 'bg-slate-950 text-white shadow-xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                MtApi5 API (Port 8228)
              </button>
              <button
                type="button"
                onClick={() => setConnectionMode('bridge')}
                className={`py-2 px-2.5 text-xs font-semibold rounded-md cursor-pointer transition-colors ${
                  connectionMode === 'bridge'
                    ? 'bg-slate-950 text-white shadow-xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                MQL5 .mq5 Bridge
              </button>
            </div>

            <form onSubmit={handleConnectMt5} className="space-y-3.5">
              {connectionMode === 'mtapi5' ? (
                <>
                  <div className="p-3 bg-slate-50 border border-slate-200 rounded-lg text-[11px] text-slate-600 space-y-1">
                    <div className="font-semibold text-slate-900 flex items-center justify-between">
                      <span>Uses vdemydiuk/mtapi WebSocket RPC</span>
                      <a
                        href="https://github.com/vdemydiuk/mtapi/releases"
                        target="_blank"
                        rel="noreferrer"
                        className="text-blue-600 hover:underline inline-flex items-center gap-1 font-semibold"
                      >
                        Download Installer
                        <ExternalLink className="w-3 h-3" />
                      </a>
                    </div>
                    <p>
                      Connects over <span className="font-mono text-slate-900">ws://host:8228/ws</span> directly to the client&apos;s running <span className="font-mono text-slate-900">MtApi5</span> EA and reads live Login, Server, Balance &amp; Equity automatically.
                    </p>
                  </div>

                  <div className="grid grid-cols-3 gap-2.5">
                    <div className="col-span-2">
                      <label className="block text-xs font-semibold text-slate-700 mb-1">
                        MtApi5 Host / VPS or Tunnel
                      </label>
                      <input
                        type="text"
                        required
                        value={mtapiHost}
                        onChange={(e) => setMtapiHost(e.target.value)}
                        placeholder="127.0.0.1 or vps-ip or wss://..."
                        className="w-full px-3 py-2 text-xs border border-slate-300 rounded-lg font-mono"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-semibold text-slate-700 mb-1">
                        Port
                      </label>
                      <input
                        type="number"
                        min="1"
                        max="65535"
                        required
                        value={mtapiPort}
                        onChange={(e) => setMtapiPort(e.target.value)}
                        className="w-full px-3 py-2 text-xs border border-slate-300 rounded-lg font-mono"
                      />
                    </div>
                  </div>
                </>
              ) : (
                <>
                  <div>
                    <div className="mb-3 p-3 bg-emerald-50 border border-emerald-200 rounded-lg text-[11px] text-emerald-900">
                      <span className="font-semibold">MT5 Bridge API Key Auto-Connected:</span> Your personal key is already generated and embedded into both downloadable <span className="font-mono">.mq5</span> EAs—no external paid API key required.
                    </div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">
                      Client MT5 Login ID
                    </label>
                    <input
                      type="text"
                      required
                      value={mt5Login}
                      onChange={(e) => setMt5Login(e.target.value)}
                      placeholder="e.g. 192837465"
                      className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg font-mono"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">
                      MT5 Broker Server
                    </label>
                    <select
                      value={serverPreset}
                      onChange={(e) => setServerPreset(e.target.value)}
                      className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg bg-white font-mono"
                    >
                      {PRESET_SERVERS.map((srv) => (
                        <option key={srv} value={srv}>
                          {srv === 'CUSTOM' ? 'Other / Custom MT5 Server...' : srv}
                        </option>
                      ))}
                    </select>
                    {serverPreset === 'CUSTOM' && (
                      <input
                        type="text"
                        required
                        value={customServer}
                        onChange={(e) => setCustomServer(e.target.value)}
                        placeholder="Enter exact MT5 Server (e.g. Exness-MT5Real18)"
                        className="mt-2 w-full px-3 py-2 text-sm border border-slate-300 rounded-lg font-mono"
                      />
                    )}
                  </div>
                </>
              )}

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Active EA Bot
                  </label>
                  <select
                    value={activeBot}
                    onChange={(e) => setActiveBot(e.target.value as 'silverbullet' | 'orderblock' | 'both')}
                    className="w-full px-2.5 py-2 text-xs border border-slate-300 rounded-lg bg-white font-medium"
                  >
                    <option value="both">Both ICT &amp; SMC EAs</option>
                    <option value="silverbullet">ICT Silver Bullet EA</option>
                    <option value="orderblock">SMC Order Block EA</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Risk % per Trade
                  </label>
                  <input
                    type="number"
                    min="0.1"
                    max="5"
                    step="0.1"
                    value={riskPercent}
                    onChange={(e) => setRiskPercent(e.target.value)}
                    className="w-full px-2.5 py-2 text-xs border border-slate-300 rounded-lg font-mono"
                  />
                </div>
              </div>

              <button
                type="submit"
                disabled={connecting}
                className="w-full py-2.5 bg-slate-950 text-white text-xs font-semibold rounded-lg hover:bg-slate-800 cursor-pointer transition-colors"
              >
                {connecting
                  ? 'Connecting to Client MT5...'
                  : connectionMode === 'mtapi5'
                  ? 'Connect Client MT5 via MtApi5 API'
                  : 'Bind MT5 Account & Activate Bridge'}
              </button>
            </form>

            {/* Quick Auto-Trade Signal Dispatcher */}
            <div className="pt-4 border-t border-slate-200 space-y-3">
              <div className="flex items-center justify-between">
                <h4 className="text-xs font-bold text-slate-950 flex items-center gap-1.5">
                  <Zap className="w-3.5 h-3.5 text-amber-500" />
                  Send Instant Auto-Trade to Client MT5
                </h4>
                <span className={`text-[11px] font-semibold ${autoTradeOn ? 'text-emerald-700' : 'text-slate-500'}`}>
                  {autoTradeOn ? 'Armed' : 'Paused'}
                </span>
              </div>

              <form onSubmit={handleExecuteTrade} className="space-y-2.5">
                <div className="grid grid-cols-3 gap-2">
                  <select
                    value={execSymbol}
                    onChange={(e) => setExecSymbol(e.target.value)}
                    className="px-2 py-2 text-xs font-mono font-semibold border border-slate-300 rounded-lg bg-white"
                  >
                    {TRADE_SYMBOLS.map((s) => (
                      <option key={s} value={s}>
                        {s}
                      </option>
                    ))}
                  </select>

                  <select
                    value={execSide}
                    onChange={(e) => setExecSide(e.target.value as 'BUY' | 'SELL')}
                    className={`px-2 py-2 text-xs font-mono font-bold border border-slate-300 rounded-lg bg-white ${
                      execSide === 'BUY' ? 'text-emerald-700' : 'text-rose-700'
                    }`}
                  >
                    <option value="BUY">BUY</option>
                    <option value="SELL">SELL</option>
                  </select>

                  <input
                    type="number"
                    min="0.01"
                    max="50"
                    step="0.01"
                    value={execVolume}
                    onChange={(e) => setExecVolume(e.target.value)}
                    placeholder="Lots"
                    className="px-2 py-2 text-xs font-mono border border-slate-300 rounded-lg"
                  />
                </div>

                <div className="grid grid-cols-2 gap-2">
                  <input
                    type="number"
                    step="any"
                    value={execSl}
                    onChange={(e) => setExecSl(e.target.value)}
                    placeholder="Stop Loss (optional)"
                    className="px-2.5 py-1.5 text-xs font-mono border border-slate-300 rounded-lg"
                  />
                  <input
                    type="number"
                    step="any"
                    value={execTp}
                    onChange={(e) => setExecTp(e.target.value)}
                    placeholder="Take Profit (optional)"
                    className="px-2.5 py-1.5 text-xs font-mono border border-slate-300 rounded-lg"
                  />
                </div>

                <button
                  type="submit"
                  disabled={executingTrade || !user.mt5Connected || !autoTradeOn}
                  className="w-full py-2.5 bg-blue-600 text-white text-xs font-semibold rounded-lg hover:bg-blue-700 disabled:opacity-50 cursor-pointer transition-colors"
                >
                  {executingTrade
                    ? 'Executing on MT5...'
                    : `Execute ${execSide} ${execVolume} ${execSymbol} on MT5`}
                </button>
              </form>

              {isMtApi5Active && (
                <button
                  type="button"
                  onClick={handleCloseAllPositions}
                  disabled={closingAll}
                  className="w-full py-2 border border-rose-300 text-rose-700 bg-rose-50 hover:bg-rose-100 text-xs font-semibold rounded-lg inline-flex items-center justify-center gap-1.5 cursor-pointer"
                >
                  <XCircle className="w-3.5 h-3.5" />
                  {closingAll ? 'Closing MT5 Positions...' : 'Close All Open MT5 Positions (MtApi5)'}
                </button>
              )}
            </div>

            <div className="pt-4 border-t border-slate-200 space-y-2.5">
              <div className="text-xs font-semibold text-slate-700">MQL5 WebRequest Bridge Credentials</div>
              <div className="p-2.5 bg-slate-50 border border-slate-200 rounded-lg text-xs font-mono flex items-center justify-between gap-2">
                <span className="truncate text-slate-700">Whitelist URL: {window.location.origin}</span>
                <button
                  type="button"
                  onClick={() => copyText('url', window.location.origin)}
                  className="text-blue-600 font-sans font-semibold shrink-0 cursor-pointer"
                >
                  {copiedField === 'url' ? 'Copied' : 'Copy'}
                </button>
              </div>
              <div className="p-2.5 bg-slate-50 border border-slate-200 rounded-lg text-xs font-mono flex items-center justify-between gap-2">
                <span className="truncate text-slate-700">
                  API Key: {bridgeToken || 'Bind MT5 to generate'}
                </span>
                <div className="flex items-center gap-2 shrink-0">
                  {bridgeToken && (
                    <button
                      type="button"
                      onClick={() => copyText('token', bridgeToken)}
                      className="text-blue-600 font-sans font-semibold cursor-pointer"
                    >
                      {copiedField === 'token' ? 'Copied' : 'Copy'}
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={handleRotateBridgeToken}
                    disabled={rotatingToken}
                    className="text-slate-600 hover:text-slate-950 font-sans font-semibold cursor-pointer"
                  >
                    {rotatingToken ? '...' : 'Regenerate'}
                  </button>
                </div>
              </div>
              <div className="p-2.5 bg-slate-50 border border-slate-200 rounded-lg text-xs font-mono break-all text-slate-600">
                Heartbeat Endpoint: {bridgeEndpoint}
              </div>
              <button
                type="button"
                onClick={handleTestHeartbeat}
                disabled={testingHeartbeat}
                className="w-full py-2 border border-slate-300 text-slate-800 text-xs font-semibold rounded-lg hover:bg-slate-50 cursor-pointer"
              >
                {testingHeartbeat ? 'Pinging Bridge...' : 'Test MQL5 Bridge Heartbeat'}
              </button>
            </div>
          </div>

          {/* Setup Guide & Live Telemetry Feed */}
          <div className="bg-white border border-slate-200 rounded-xl p-5 space-y-4">
            <h4 className="text-sm font-bold text-slate-950">MT5 Terminal Connection Steps</h4>
            <ol className="space-y-1.5 text-xs text-slate-600 list-decimal list-inside">
              <li>
                <span className="font-semibold text-slate-800">MtApi5 API (Recommended):</span> Install{' '}
                <span className="font-mono">MtApi5Installer_x64.msi</span> from{' '}
                <a
                  href="https://github.com/vdemydiuk/mtapi/releases"
                  target="_blank"
                  rel="noreferrer"
                  className="text-blue-600 hover:underline font-medium"
                >
                  github.com/vdemydiuk/mtapi/releases
                </a>
                , attach <span className="font-mono">MtApi5</span> EA to an MT5 chart (Algo Trading ON), then enter your VPS/tunnel host &amp; port <span className="font-mono">8228</span> above.
              </li>
              <li>
                <span className="font-semibold text-slate-800">Or MQL5 .mq5 Bridge:</span> Copy both <span className="font-mono">.mq5</span> files into <span className="font-mono">MQL5/Experts/Advisors</span>, compile in MetaEditor (<span className="font-mono">F7</span>), and whitelist <span className="font-mono">{window.location.origin}</span> under <span className="font-mono">Tools → Options → Expert Advisors</span>.
              </li>
              <li>
                Press <span className="font-semibold">Connect Client MT5 via MtApi5 API</span> and toggle <span className="font-semibold">Auto-Trading ON</span>.
              </li>
            </ol>

            {commands.length > 0 && (
              <div className="pt-3 border-t border-slate-100">
                <div className="text-xs font-semibold text-slate-700 mb-2">Recent MT5 Auto-Trade Orders</div>
                <div className="divide-y divide-slate-100 text-xs">
                  {commands.slice(0, 6).map((cmd) => (
                    <div key={cmd.id} className="py-1.5 flex items-center justify-between gap-2 font-mono tabular-nums">
                      <span className="text-slate-900 truncate">
                        {cmd.side} {cmd.volume} {cmd.symbol} {cmd.external_order_id ? `(#${cmd.external_order_id})` : ''}
                      </span>
                      <span
                        className={`shrink-0 font-semibold ${
                          cmd.status === 'executed'
                            ? 'text-emerald-700'
                            : cmd.status === 'failed'
                            ? 'text-rose-600'
                            : 'text-amber-700'
                        }`}
                      >
                        {cmd.status.toUpperCase()}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {events.length > 0 && (
              <div className="pt-3 border-t border-slate-100">
                <div className="text-xs font-semibold text-slate-700 mb-2">Recent MT5 Telemetry Feed</div>
                <div className="divide-y divide-slate-100 text-xs">
                  {events.slice(0, 5).map((ev) => (
                    <div key={ev.id} className="py-1.5 flex items-center justify-between gap-2 font-mono tabular-nums">
                      <span className="text-slate-800 truncate">
                        {ev.ea_name} · {ev.symbol}
                      </span>
                      <span className="text-emerald-700 shrink-0">{ev.status}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Right Column: MQL5 Source Code & Installation Docs Viewer */}
        <div className="lg:col-span-7 bg-white border border-slate-200 rounded-xl overflow-hidden flex flex-col">
          <div className="p-4 border-b border-slate-200 flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-1 p-1 bg-slate-100 rounded-lg">
              <button
                onClick={() => setActiveFile('silverbullet')}
                className={`px-3 py-1.5 text-xs font-semibold rounded-md cursor-pointer ${
                  activeFile === 'silverbullet' ? 'bg-white text-slate-950 shadow-xs' : 'text-slate-600'
                }`}
              >
                ICT Silver Bullet (.mq5)
              </button>
              <button
                onClick={() => setActiveFile('orderblock')}
                className={`px-3 py-1.5 text-xs font-semibold rounded-md cursor-pointer ${
                  activeFile === 'orderblock' ? 'bg-white text-slate-950 shadow-xs' : 'text-slate-600'
                }`}
              >
                SMC Order Block (.mq5)
              </button>
              <button
                onClick={() => setActiveFile('guide')}
                className={`px-3 py-1.5 text-xs font-semibold rounded-md cursor-pointer ${
                  activeFile === 'guide' ? 'bg-white text-slate-950 shadow-xs' : 'text-slate-600'
                }`}
              >
                Installation Guide
              </button>
            </div>

            <button
              onClick={copySource}
              className="inline-flex items-center gap-1.5 text-xs font-semibold text-blue-600 hover:text-blue-700 cursor-pointer"
            >
              {copiedCode ? <CheckCircle2 className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
              {copiedCode ? 'Copied' : `Copy ${fileName || 'code'}`}
            </button>
          </div>

          <div className="bg-slate-950 text-slate-200 p-4 overflow-auto max-h-[680px] flex-1">
            <div className="flex items-center gap-2 text-xs text-slate-400 mb-3 font-mono">
              <Terminal className="w-3.5 h-3.5" />
              <span>{fileName}</span>
            </div>
            <pre className="text-xs font-mono leading-relaxed whitespace-pre-wrap">{fileContent}</pre>
          </div>
        </div>
      </div>
    </div>
  );
};
