import React, { useEffect, useState } from 'react';
import { Download, Lock, Copy, CheckCircle2, Terminal, Link2 } from 'lucide-react';
import { apiFetch } from '../lib/api';
import type { PublicConfig, User } from '../types';

interface EaBotsViewProps {
  user: User;
  config: PublicConfig;
  onUnlockClick: () => void;
  onUserUpdated: (user: User) => void;
}

export const EaBotsView: React.FC<EaBotsViewProps> = ({
  user,
  config,
  onUnlockClick,
  onUserUpdated,
}) => {
  const [activeFile, setActiveFile] = useState<'silverbullet' | 'orderblock' | 'guide'>('silverbullet');
  const [fileContent, setFileContent] = useState('');
  const [fileName, setFileName] = useState('');
  const [mt5Login, setMt5Login] = useState(user.mt5Login || user.exnessAccountId || '');
  const [mt5Server, setMt5Server] = useState(user.mt5Server || 'Exness-MT5Real');
  const [connecting, setConnecting] = useState(false);
  const [testingHeartbeat, setTestingHeartbeat] = useState(false);
  const [statusMessage, setStatusMessage] = useState('');
  const [copiedCode, setCopiedCode] = useState(false);

  useEffect(() => {
    if (!user.hasEaBots) return;
    apiFetch<{ filename: string; content: string }>(`/api/ea/source/${activeFile}`)
      .then((res) => {
        setFileName(res.filename);
        setFileContent(res.content);
      })
      .catch(() => {});
  }, [activeFile, user.hasEaBots]);

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
          Receive complete, uncompiled <span className="font-mono text-slate-900">.mq5</span> source code for two institutional Expert Advisors, step-by-step MetaTrader 5 installation documentation, and direct MT5 WebRequest Bridge connectivity inside your GRIDPIPs dashboard.
        </p>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-6 text-sm text-slate-700">
          <div className="p-3 bg-slate-50 border border-slate-200 rounded-lg">
            · GRIDPIPs_ICT_SilverBullet_EA.mq5 (FVG + Killzones)
          </div>
          <div className="p-3 bg-slate-50 border border-slate-200 rounded-lg">
            · GRIDPIPs_SMC_OrderBlock_EA.mq5 (Liquidity Sweeps)
          </div>
          <div className="p-3 bg-slate-50 border border-slate-200 rounded-lg">
            · Complete MT5 MetaEditor Compilation Guide
          </div>
          <div className="p-3 bg-slate-50 border border-slate-200 rounded-lg">
            · Live Exness MT5 Account Bridge &amp; Telemetry
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
    setConnecting(true);
    setStatusMessage('');
    try {
      const res = await apiFetch<{ user: User }>('/api/ea/mt5/connect', {
        method: 'POST',
        body: JSON.stringify({ mt5Login, mt5Server }),
      });
      onUserUpdated(res.user);
      setStatusMessage(`MT5 terminal ${mt5Login} (${mt5Server}) connected and email confirmation dispatched.`);
    } catch (err) {
      setStatusMessage(err instanceof Error ? err.message : 'Failed to connect MT5');
    } finally {
      setConnecting(false);
    }
  }

  async function handleTestHeartbeat() {
    if (!user.mt5BridgeToken) return;
    setTestingHeartbeat(true);
    setStatusMessage('');
    try {
      const res = await apiFetch<{ syncedAt: string }>('/api/ea/mt5/heartbeat', {
        method: 'POST',
        body: JSON.stringify({
          token: user.mt5BridgeToken,
          login: mt5Login,
          server: mt5Server,
        }),
      });
      const me = await apiFetch<{ user: User }>('/api/auth/me');
      if (me.user) onUserUpdated(me.user);
      setStatusMessage(`MT5 Bridge heartbeat verified at ${new Date(res.syncedAt).toLocaleTimeString()}.`);
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

  return (
    <div className="space-y-6">
      {/* Download Banner */}
      <div className="bg-slate-950 text-white rounded-xl p-6 flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
        <div>
          <div className="text-xs font-medium text-emerald-400 mb-1">License Active · MQL5 Source Included</div>
          <h2 className="text-xl font-bold">Download Your MQL5 Expert Advisors &amp; Installation Docs</h2>
          <p className="text-xs text-slate-300 mt-1">
            Includes GRIDPIPs_ICT_SilverBullet_EA.mq5, GRIDPIPs_SMC_OrderBlock_EA.mq5, and INSTALLATION_GUIDE.txt.
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

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* MT5 Account Bridge */}
        <div className="lg:col-span-5 bg-white border border-slate-200 rounded-xl p-6 space-y-5">
          <div className="flex items-center justify-between">
            <h3 className="text-base font-bold text-slate-950 flex items-center gap-2">
              <Link2 className="w-4 h-4 text-blue-600" />
              MT5 Terminal Bridge
            </h3>
            <span
              className={`text-xs font-semibold ${
                user.mt5Connected ? 'text-emerald-700' : 'text-amber-700'
              }`}
            >
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
                value={mt5Server}
                onChange={(e) => setMt5Server(e.target.value)}
                className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg bg-white font-mono"
              >
                <option value="Exness-MT5Real">Exness-MT5Real</option>
                <option value="Exness-MT5Real2">Exness-MT5Real2</option>
                <option value="Exness-MT5Trial">Exness-MT5Trial</option>
                <option value="Exness-MT5Trial5">Exness-MT5Trial5</option>
              </select>
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
            <div className="text-xs font-semibold text-slate-700">EA WebRequest Bridge Credentials</div>
            <div className="p-2.5 bg-slate-50 border border-slate-200 rounded-lg text-xs font-mono break-all text-slate-700">
              Token: {user.mt5BridgeToken || 'Generate by connecting MT5'}
            </div>
            <div className="p-2.5 bg-slate-50 border border-slate-200 rounded-lg text-xs font-mono break-all text-slate-700">
              Endpoint: {window.location.origin}/api/ea/mt5/heartbeat
            </div>
            <button
              type="button"
              onClick={handleTestHeartbeat}
              disabled={testingHeartbeat}
              className="w-full py-2 border border-slate-300 text-slate-800 text-xs font-semibold rounded-lg hover:bg-slate-50 cursor-pointer"
            >
              {testingHeartbeat ? 'Pinging Bridge...' : 'Test MT5 Bridge Heartbeat'}
            </button>
            {user.mt5LastSync && (
              <div className="text-xs text-slate-500">
                Last telemetry sync: <span className="font-mono">{user.mt5LastSync}</span>
              </div>
            )}
          </div>

          {statusMessage && (
            <div className="p-3 bg-blue-50 border border-blue-200 text-blue-800 text-xs rounded-lg">
              {statusMessage}
            </div>
          )}
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

          <div className="bg-slate-950 text-slate-200 p-4 overflow-auto max-h-[500px] flex-1">
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
