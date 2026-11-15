import React, { useEffect, useState, useCallback } from 'react';
import { Download, Lock, Copy, CheckCircle2, Terminal, Link2, RefreshCw } from 'lucide-react';
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

  const initialServer = user.mt5Server || 'Exness-MT5Real';
  const [serverPreset, setServerPreset] = useState(
    PRESET_SERVERS.includes(initialServer) ? initialServer : 'CUSTOM'
  );
  const [customServer, setCustomServer] = useState(
    PRESET_SERVERS.includes(initialServer) ? '' : initialServer
  );
  const [mt5Login, setMt5Login] = useState(user.mt5Login || user.exnessAccountId || '');

  const [connecting, setConnecting] = useState(false);
  const [testingHeartbeat, setTestingHeartbeat] = useState(false);
  const [refreshingTelemetry, setRefreshingTelemetry] = useState(false);
  const [events, setEvents] = useState<Mt5TelemetryEvent[]>([]);
  const [statusMessage, setStatusMessage] = useState('');
  const [copiedCode, setCopiedCode] = useState(false);
  const [copiedField, setCopiedField] = useState<'url' | 'token' | null>(null);

  const effectiveServer = serverPreset === 'CUSTOM' ? customServer.trim() : serverPreset;

  const fetchMt5Status = useCallback(async (manual = false) => {
    if (!user.hasEaBots) return;
    if (manual) setRefreshingTelemetry(true);
    try {
      const res = await apiFetch<{ user: User; events: Mt5TelemetryEvent[] }>('/api/ea/mt5/status');
      if (res.user) {
        onUserUpdated(res.user);
        if (res.user.mt5BridgeToken) setBridgeToken(res.user.mt5BridgeToken);
      }
      setEvents(res.events || []);
    } catch {
      // ignore background poll errors
    } finally {
      if (manual) setRefreshingTelemetry(false);
    }
  }, [user.hasEaBots, onUserUpdated]);

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
          Purchase MQL5 EA Bots + MT5 Connection Bridge
        </h2>
        <p className="text-sm text-slate-600 leading-relaxed mb-6">
          Receive complete, uncompiled <span className="font-mono text-slate-900">.mq5</span> source code for two institutional Expert Advisors pre-wired with your personal MT5 WebRequest Bridge credentials, step-by-step MetaTrader 5 installation documentation, and live terminal telemetry.
        </p>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-6 text-sm text-slate-700">
          <div className="p-3 bg-slate-50 border border-slate-200 rounded-lg">
            · GRIDPIPs_ICT_SilverBullet_EA.mq5 (FVG + Bridge)
          </div>
          <div className="p-3 bg-slate-50 border border-slate-200 rounded-lg">
            · GRIDPIPs_SMC_OrderBlock_EA.mq5 (Sweeps + Bridge)
          </div>
          <div className="p-3 bg-slate-50 border border-slate-200 rounded-lg">
            · Auto-Embedded Bridge Token &amp; MT5 Endpoint
          </div>
          <div className="p-3 bg-slate-50 border border-slate-200 rounded-lg">
            · Live Exness MT5 Account Telemetry &amp; Events
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
    if (!effectiveServer) {
      setStatusMessage('Please enter your MT5 broker server name.');
      return;
    }
    setConnecting(true);
    setStatusMessage('');
    try {
      const res = await apiFetch<{ user: User }>('/api/ea/mt5/connect', {
        method: 'POST',
        body: JSON.stringify({ mt5Login, mt5Server: effectiveServer }),
      });
      onUserUpdated(res.user);
      if (res.user.mt5BridgeToken) setBridgeToken(res.user.mt5BridgeToken);
      setStatusMessage(`MT5 account ${mt5Login} (${effectiveServer}) saved and ready for live EA WebRequest pings.`);
      await fetchMt5Status(false);
    } catch (err) {
      setStatusMessage(err instanceof Error ? err.message : 'Failed to connect MT5');
    } finally {
      setConnecting(false);
    }
  }

  async function handleTestHeartbeat() {
    const activeToken = bridgeToken || user.mt5BridgeToken;
    if (!activeToken) return;
    setTestingHeartbeat(true);
    setStatusMessage('');
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
      setStatusMessage(`MT5 Bridge heartbeat verified (${res.status}) at ${new Date(res.syncedAt).toLocaleTimeString()}.`);
    } catch (err) {
      setStatusMessage(err instanceof Error ? err.message : 'Heartbeat test failed');
    } finally {
      setTestingHeartbeat(false);
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

  return (
    <div className="space-y-6">
      {/* Download Banner */}
      <div className="bg-slate-950 text-white rounded-xl p-6 flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
        <div>
          <div className="text-xs font-medium text-emerald-400 mb-1">
            Pre-Configured for Your MT5 Bridge · Both EAs Connected
          </div>
          <h2 className="text-xl font-bold">Download Your MQL5 Expert Advisors &amp; Connect MT5</h2>
          <p className="text-xs text-slate-300 mt-1">
            Your personal Bridge URL and Token are automatically injected into both .mq5 files in this pack.
          </p>
        </div>
        <a
          href="/api/ea/download"
          className="px-5 py-3 bg-blue-600 text-white text-sm font-semibold rounded-lg hover:bg-blue-700 inline-flex items-center gap-2 whitespace-nowrap shrink-0"
        >
          <Download className="w-4 h-4" />
          Download Complete .ZIP Pack
        </a>
      </div>

      {/* Live MT5 Telemetry Strip */}
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-4">
        <div className="bg-white border border-slate-200 rounded-xl p-4">
          <div className="text-xs text-slate-500">Bridge Status</div>
          <div className={`text-sm font-bold mt-1 ${user.mt5Connected ? 'text-emerald-700' : 'text-amber-700'}`}>
            {user.mt5Connected ? user.mt5Status || 'Connected' : 'Pending Link'}
          </div>
        </div>
        <div className="bg-white border border-slate-200 rounded-xl p-4">
          <div className="text-xs text-slate-500">MT5 Account</div>
          <div className="text-sm font-mono tabular-nums font-bold text-slate-950 mt-1">
            {user.mt5Login || 'Not Bound'}
          </div>
          <div className="text-xs text-slate-500 truncate">{user.mt5Server || 'Select server below'}</div>
        </div>
        <div className="bg-white border border-slate-200 rounded-xl p-4">
          <div className="text-xs text-slate-500">Balance / Equity</div>
          <div className="text-sm font-mono tabular-nums font-bold text-slate-950 mt-1">
            {user.mt5Balance !== null && user.mt5Balance !== undefined
              ? `$${user.mt5Balance.toFixed(2)} / $${(user.mt5Equity ?? user.mt5Balance).toFixed(2)}`
              : 'Awaiting EA ping'}
          </div>
        </div>
        <div className="bg-white border border-slate-200 rounded-xl p-4">
          <div className="text-xs text-slate-500">Active EA &amp; Chart</div>
          <div className="text-sm font-semibold text-slate-950 mt-1 truncate">
            {user.mt5EaName || 'Ready'}
          </div>
          <div className="text-xs font-mono text-slate-500">
            {user.mt5Symbol || '—'} · {user.mt5OpenPositions ?? 0} open
          </div>
        </div>
        <div className="bg-white border border-slate-200 rounded-xl p-4 flex flex-col justify-between">
          <div>
            <div className="text-xs text-slate-500">Last Telemetry Sync</div>
            <div className="text-xs font-mono tabular-nums font-semibold text-slate-950 mt-1">
              {user.mt5LastSync || 'Never'}
            </div>
          </div>
          <button
            type="button"
            onClick={() => fetchMt5Status(true)}
            className="text-xs font-semibold text-blue-600 hover:underline inline-flex items-center gap-1 mt-2 cursor-pointer self-start"
          >
            <RefreshCw className={`w-3 h-3 ${refreshingTelemetry ? 'animate-spin' : ''}`} />
            Refresh Telemetry
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* MT5 Account Bridge & Setup Checklist */}
        <div className="lg:col-span-5 space-y-6">
          <div className="bg-white border border-slate-200 rounded-xl p-6 space-y-5">
            <div className="flex items-center justify-between">
              <h3 className="text-base font-bold text-slate-950 flex items-center gap-2">
                <Link2 className="w-4 h-4 text-blue-600" />
                MT5 Terminal Bridge
              </h3>
              <span className={`text-xs font-semibold ${user.mt5Connected ? 'text-emerald-700' : 'text-amber-700'}`}>
                {user.mt5Connected ? 'Connected' : 'Pending Link'}
              </span>
            </div>

            <form onSubmit={handleConnectMt5} className="space-y-3.5">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Exness MT5 Login ID
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

              <button
                type="submit"
                disabled={connecting}
                className="w-full py-2.5 bg-slate-950 text-white text-xs font-semibold rounded-lg hover:bg-slate-800 cursor-pointer"
              >
                {connecting ? 'Binding MT5 Terminal...' : 'Save & Connect MT5 Account'}
              </button>
            </form>

            <div className="pt-4 border-t border-slate-200 space-y-2.5">
              <div className="text-xs font-semibold text-slate-700">MT5 WebRequest Whitelist &amp; Credentials</div>
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
                  Token: {bridgeToken || 'Bind MT5 to generate'}
                </span>
                {bridgeToken && (
                  <button
                    type="button"
                    onClick={() => copyText('token', bridgeToken)}
                    className="text-blue-600 font-sans font-semibold shrink-0 cursor-pointer"
                  >
                    {copiedField === 'token' ? 'Copied' : 'Copy'}
                  </button>
                )}
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
                {testingHeartbeat ? 'Pinging Bridge...' : 'Test MT5 Bridge Heartbeat'}
              </button>
            </div>

            {statusMessage && (
              <div className="p-3 bg-blue-50 border border-blue-200 text-blue-800 text-xs rounded-lg">
                {statusMessage}
              </div>
            )}
          </div>

          {/* Live Checklist + Recent Telemetry Events */}
          <div className="bg-white border border-slate-200 rounded-xl p-5 space-y-3">
            <h4 className="text-sm font-bold text-slate-950">MT5 Terminal Connection Steps</h4>
            <ol className="space-y-1.5 text-xs text-slate-600 list-decimal list-inside">
              <li>Download the .ZIP pack and place both .mq5 files into MT5 <span className="font-mono">MQL5/Experts/Advisors</span>.</li>
              <li>Press <span className="font-mono">F4</span> to open MetaEditor and press <span className="font-mono">F7</span> to compile each EA.</li>
              <li>In MT5 open <span className="font-mono">Tools → Options → Expert Advisors</span>, enable <span className="font-semibold">Allow algorithmic trading</span> and add <span className="font-mono">{window.location.origin}</span> under <span className="font-semibold">Allow WebRequest</span>.</li>
              <li>Drag the compiled EA onto your chart and turn <span className="font-semibold">Algo Trading</span> green. Live equity and order pings will appear automatically here.</li>
            </ol>

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

        {/* MQL5 Source Code & Installation Docs Viewer */}
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

          <div className="bg-slate-950 text-slate-200 p-4 overflow-auto max-h-[620px] flex-1">
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
