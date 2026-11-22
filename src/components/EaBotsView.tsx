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
  XCircle,
  Radar,
} from 'lucide-react';
import { apiFetch, type AutoTradeRunResult } from '../lib/api';
import {
  ALL_EXNESS_MT5_SERVERS,
  BARE_EXNESS_SERVER_PREFIX_RE,
  EXNESS_MT5_SERVER_GROUPS,
} from '../lib/exnessServers';
import { LANDING_IMAGES } from '../assets/landingImages';
import {
  SUBSCRIPTION_PLAN_SPECS,
  computeCyclePricing,
  formatShortDate,
} from '../lib/subscriptions';
import type { BillingCycle, PublicConfig, User } from '../types';

interface EaBotsViewProps {
  user: User;
  config: PublicConfig;
  onUnlockClick: (cycle?: BillingCycle) => void;
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

const NUMERIC_MT5_LOGIN_RE = /^\d{4,16}$/;

const TRADE_SYMBOLS = ['EURUSD', 'GBPUSD', 'USDJPY', 'XAUUSD', 'NAS100', 'US30', 'BTCUSD'];

export const EaBotsView: React.FC<EaBotsViewProps> = ({
  user,
  config,
  onUnlockClick,
  onUserUpdated,
}) => {
  const [activeFile, setActiveFile] = useState<'silverbullet' | 'orderblock' | 'guide'>('silverbullet');
  const [selectedCycle, setSelectedCycle] = useState<BillingCycle>('monthly');
  const [fileContent, setFileContent] = useState('');
  const [fileName, setFileName] = useState('');
  const [discoveredServers, setDiscoveredServers] = useState<string[]>([]);
  const [serverFilter, setServerFilter] = useState('');

  const allKnownPresetServers = React.useMemo(
    () => Array.from(new Set([...ALL_EXNESS_MT5_SERVERS, ...discoveredServers])),
    [discoveredServers]
  );

  const rawSavedServer = (user.mt5Server || '').trim();
  const hasValidSavedServer = Boolean(
    rawSavedServer && !BARE_EXNESS_SERVER_PREFIX_RE.test(rawSavedServer)
  );
  const [serverPreset, setServerPreset] = useState(
    !hasValidSavedServer
      ? ''
      : ALL_EXNESS_MT5_SERVERS.includes(rawSavedServer)
      ? rawSavedServer
      : 'CUSTOM'
  );
  const [customServer, setCustomServer] = useState(
    hasValidSavedServer && !ALL_EXNESS_MT5_SERVERS.includes(rawSavedServer) ? rawSavedServer : ''
  );
  const savedNumericLogin =
    user.mt5Login && NUMERIC_MT5_LOGIN_RE.test(user.mt5Login.trim()) ? user.mt5Login.trim() : '';
  const [mt5Login, setMt5Login] = useState(savedNumericLogin);
  const [mt5Password, setMt5Password] = useState('');
  const [activeBot, setActiveBot] = useState<'silverbullet' | 'orderblock' | 'both'>(
    (user.mt5ActiveBot as 'silverbullet' | 'orderblock' | 'both') || 'both'
  );
  const [riskPercent, setRiskPercent] = useState(String(user.mt5RiskPercent ?? 1.0));

  const [mt5ApiConfigured, setMt5ApiConfigured] = useState(Boolean(user.mt5ApiConfigured));
  const [profileConfigured, setProfileConfigured] = useState(
    Boolean(user.mt5ProvisioningProfileConfigured)
  );

  useEffect(() => {
    if (typeof user.mt5ApiConfigured === 'boolean') {
      setMt5ApiConfigured(user.mt5ApiConfigured);
    }
    if (typeof user.mt5ProvisioningProfileConfigured === 'boolean') {
      setProfileConfigured(user.mt5ProvisioningProfileConfigured);
    }
  }, [user.mt5ApiConfigured, user.mt5ProvisioningProfileConfigured]);

  const [connecting, setConnecting] = useState(false);
  const [togglingAuto, setTogglingAuto] = useState(false);
  const [syncingLive, setSyncingLive] = useState(false);
  const [closingAll, setClosingAll] = useState(false);
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
  const [scanningAuto, setScanningAuto] = useState(false);
  const [bypassKillzone, setBypassKillzone] = useState(false);
  const [autoScanResult, setAutoScanResult] = useState<AutoTradeRunResult | null>(null);
  const [statusMessage, setStatusMessage] = useState('');
  const [errorMessage, setErrorMessage] = useState('');
  const [copiedCode, setCopiedCode] = useState(false);

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
          mt5ApiConfigured?: boolean;
          mt5ProvisioningProfileConfigured?: boolean;
        }>('/api/ea/mt5/status');
        if (res.user) {
          onUserUpdated(res.user);
        }
        setEvents(res.events || []);
        if (res.commands) setCommands(res.commands);
        if (typeof res.mt5ApiConfigured === 'boolean') setMt5ApiConfigured(res.mt5ApiConfigured);
        if (typeof res.mt5ProvisioningProfileConfigured === 'boolean') {
          setProfileConfigured(res.mt5ProvisioningProfileConfigured);
        }
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
    apiFetch<{ filename: string; content: string }>(`/api/ea/source/${activeFile}`)
      .then((res) => {
        setFileName(res.filename);
        setFileContent(res.content);
      })
      .catch(() => {});
  }, [activeFile, user.hasEaBots]);

  useEffect(() => {
    if (!user.hasEaBots) return;
    fetchMt5Status(false);
    const id = setInterval(() => fetchMt5Status(false), 10000);
    return () => clearInterval(id);
  }, [user.hasEaBots, fetchMt5Status]);

  useEffect(() => {
    if (!user.hasEaBots) return;
    apiFetch<{ servers?: string[] }>('/api/ea/mt5/servers')
      .then((res) => {
        if (Array.isArray(res.servers)) {
          setDiscoveredServers(res.servers.filter((s) => !ALL_EXNESS_MT5_SERVERS.includes(s)));
        }
      })
      .catch(() => {});
  }, [user.hasEaBots]);

  useEffect(() => {
    if (
      hasValidSavedServer &&
      serverPreset === 'CUSTOM' &&
      allKnownPresetServers.includes(rawSavedServer)
    ) {
      setServerPreset(rawSavedServer);
      setCustomServer('');
    }
  }, [allKnownPresetServers, hasValidSavedServer, rawSavedServer, serverPreset]);

  if (!user.hasEaBots) {
    const baseMonthlyUsd = Number(config.eaBotsPriceUsd || 5.25);
    const usdKesRate = Number(config.usdKesRate || 130);
    const activePlan = computeCyclePricing(baseMonthlyUsd, usdKesRate, selectedCycle);
    const isExpired = user.eaBotsSubscriptionStatus === 'expired';
    return (
      <div className="space-y-6">
        <div className="rounded-xl overflow-hidden border border-slate-900 bg-[#0B0F19] text-white">
          <div className="grid grid-cols-1 lg:grid-cols-12 items-stretch">
            <div className="lg:col-span-7 p-6 sm:p-8 lg:p-10 flex flex-col justify-between gap-6">
              <div className="space-y-4">
                <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.14em] text-[#E5A93C]">
                  <Lock className="w-3.5 h-3.5" />
                  <span>
                    MQL5 Automated Trading Pack · {isExpired ? 'Subscription Expired' : 'Pro Subscription'}
                  </span>
                </div>
                <h2 className="text-2xl sm:text-3xl font-bold tracking-tight text-white leading-tight">
                  Automated ICT &amp; SMC Expert Advisors + MetaApi Cloud MT5 Bridge
                </h2>
                <p className="text-sm text-slate-300 leading-relaxed max-w-2xl">
                  Deploy verified MQL5 source files directly in MetaTrader 5 or link your Exness MT5 account via MetaApi Cloud for server-side Killzone scanning, dynamic risk-% position sizing, live equity telemetry, and instant remote trade execution.
                </p>
                {isExpired && user.eaBotsExpiresAt && (
                  <div className="p-3 rounded-lg border border-amber-400/40 bg-amber-500/10 text-xs text-amber-200">
                    Your previous MQL5 EA Bots subscription ended on{' '}
                    <span className="font-mono font-semibold">{formatShortDate(user.eaBotsExpiresAt)}</span>. Renew below to resume MetaApi Cloud auto-trading and EA downloads.
                  </div>
                )}
              </div>

              <div className="space-y-5">
                {/* Interactive Billing Cycle Selector */}
                <div className="grid grid-cols-3 gap-2.5">
                  {SUBSCRIPTION_PLAN_SPECS.map((plan) => {
                    const quote = computeCyclePricing(baseMonthlyUsd, usdKesRate, plan.cycle);
                    const isSelected = selectedCycle === plan.cycle;
                    return (
                      <button
                        key={plan.cycle}
                        type="button"
                        onClick={() => setSelectedCycle(plan.cycle)}
                        className={`p-3 rounded-lg border text-left transition-colors cursor-pointer ${
                          isSelected
                            ? 'bg-white/10 border-[#E5A93C] text-white'
                            : 'bg-white/[0.03] border-white/10 hover:border-white/25 text-slate-300'
                        }`}
                      >
                        <div className="flex items-center justify-between gap-1">
                          <span className="text-xs font-bold text-white">{plan.label}</span>
                          {plan.savingsBadge && (
                            <span className="text-[10px] font-mono font-bold text-[#E5A93C]">
                              -{plan.discountPct}%
                            </span>
                          )}
                        </div>
                        <div className="font-mono tabular-nums text-base font-bold text-white mt-1">
                          ${quote.amountUsd.toFixed(2)}
                          <span className="text-[11px] font-normal text-slate-400">{plan.periodSuffix}</span>
                        </div>
                        <div className="text-[10px] font-mono tabular-nums text-slate-400 mt-0.5">
                          {plan.durationDays} days · KES {quote.amountKes.toLocaleString()}
                        </div>
                      </button>
                    );
                  })}
                </div>

                <div className="flex flex-wrap items-baseline gap-x-6 gap-y-2 border-y border-white/10 py-3.5">
                  <div>
                    <div className="text-[11px] uppercase tracking-wider text-slate-400">
                      Selected Plan · {activePlan.spec.label} ({activePlan.spec.durationDays} Days)
                    </div>
                    <div className="flex items-baseline gap-2.5 mt-0.5">
                      <span className="text-2xl font-bold font-mono tabular-nums text-white">
                        ${activePlan.amountUsd.toFixed(2)}
                      </span>
                      <span className="text-sm font-mono tabular-nums text-[#E5A93C]">
                        KES {activePlan.amountKes.toLocaleString()}
                      </span>
                      <span className="text-xs font-mono text-slate-400">
                        (${activePlan.effectiveMonthlyUsd.toFixed(2)}/mo)
                      </span>
                    </div>
                  </div>
                  <div className="h-8 w-px bg-white/10 hidden sm:block" />
                  <div className="text-xs text-slate-300 space-y-0.5">
                    <div className="font-semibold text-white">Full .mq5 Source + Cloud Execution</div>
                    <div className="text-slate-400">Safaricom M-Pesa Daraja STK · USDT (TRC20/ERC20) · BTC</div>
                  </div>
                </div>

                <div className="flex flex-wrap items-center gap-3">
                  <button
                    type="button"
                    onClick={() => onUnlockClick(selectedCycle)}
                    className="px-6 py-3 bg-[#E5A93C] hover:bg-[#d6982b] text-[#090806] text-sm font-bold rounded-lg transition-colors inline-flex items-center gap-2 whitespace-nowrap shrink-0 cursor-pointer"
                  >
                    <Zap className="w-4 h-4" />
                    <span>
                      {isExpired ? 'Renew' : 'Subscribe'} ({activePlan.spec.label}) — ${activePlan.amountUsd.toFixed(2)}
                    </span>
                  </button>
                  <div className="text-xs text-slate-400 flex items-center gap-1.5">
                    <ShieldCheck className="w-4 h-4 text-emerald-400 shrink-0" />
                    <span>Instant ZIP download &amp; MetaApi MT5 activation on confirmation</span>
                  </div>
                </div>
              </div>
            </div>

            <div className="lg:col-span-5 relative min-h-[260px] lg:min-h-[380px] border-t lg:border-t-0 lg:border-l border-white/10 overflow-hidden bg-slate-950">
              <img
                src={LANDING_IMAGES.automatorCode3d}
                alt="Grid Pips MQL5 Expert Advisor algorithms and MetaApi Cloud MT5"
                referrerPolicy="no-referrer"
                className="w-full h-full object-cover object-center"
              />
              <div
                aria-hidden="true"
                className="absolute inset-0 bg-gradient-to-t from-[#0B0F19] via-[#0B0F19]/45 to-transparent"
              />
              <div className="absolute inset-x-0 bottom-0 p-5 sm:p-6 space-y-2">
                <div className="text-[11px] font-mono uppercase tracking-[0.14em] text-[#E5A93C]">
                  Execution Architecture
                </div>
                <div className="text-sm font-semibold text-white">
                  Silver Bullet 15M FVG + 1H SMC Order Block Engine
                </div>
                <div className="text-xs text-slate-300 font-mono">
                  Exness Real &amp; Trial Servers · Auto Risk % · Cooldown Protection
                </div>
              </div>
            </div>
          </div>
        </div>

        <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
          <div className="px-6 py-4 border-b border-slate-200 flex flex-wrap items-center justify-between gap-2">
            <div>
              <h3 className="text-sm font-bold text-slate-950">Included in Your MQL5 EA Subscription</h3>
              <p className="text-xs text-slate-500 mt-0.5">
                Both compiled-ready .mq5 bots plus one-click MetaApi Cloud MT5 account bridging.
              </p>
            </div>
            <span className="text-xs font-mono text-slate-500">Continuous Strategy Updates · No VPS Required for Cloud Mode</span>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 divide-y sm:divide-y-0 sm:divide-x divide-slate-200">
            <div className="p-5 space-y-1.5">
              <div className="text-[11px] font-mono font-semibold text-amber-700">01 · SILVER BULLET EA</div>
              <div className="text-sm font-bold text-slate-950">ICT_SilverBullet_EA.mq5</div>
              <p className="text-xs text-slate-600 leading-relaxed">
                London &amp; NY Killzone Fair Value Gap automation with strict risk-per-trade lot sizing and R:R targets.
              </p>
            </div>
            <div className="p-5 space-y-1.5">
              <div className="text-[11px] font-mono font-semibold text-amber-700">02 · SMC ORDER BLOCK EA</div>
              <div className="text-sm font-bold text-slate-950">SMC_OrderBlock_EA.mq5</div>
              <p className="text-xs text-slate-600 leading-relaxed">
                Detects institutional liquidity sweeps and unmitigated order blocks with automated stop-loss protection.
              </p>
            </div>
            <div className="p-5 space-y-1.5">
              <div className="text-[11px] font-mono font-semibold text-amber-700">03 · CLOUD MT5 BRIDGE</div>
              <div className="text-sm font-bold text-slate-950">MetaApi Cloud Auto-Trade</div>
              <p className="text-xs text-slate-600 leading-relaxed">
                Connect any Exness Real or Trial MT5 account directly from the dashboard with live balance &amp; equity sync.
              </p>
            </div>
            <div className="p-5 space-y-1.5">
              <div className="text-[11px] font-mono font-semibold text-amber-700">04 · RISK CONTROLS</div>
              <div className="text-sm font-bold text-slate-950">Live Position &amp; Cooldown Guard</div>
              <p className="text-xs text-slate-600 leading-relaxed">
                Max concurrent position caps, 60-minute per-symbol cooldowns, dry-run scanner tests, and instant close-all.
              </p>
            </div>
          </div>
        </div>
      </div>
    );
  }

  async function handleConnectMt5(e: React.FormEvent) {
    e.preventDefault();
    const cleanLogin = mt5Login.trim();
    const cleanServer = effectiveServer.trim();
    const cleanPassword = mt5Password.trim();

    if (!cleanLogin || !cleanServer || !cleanPassword) {
      setErrorMessage(
        'Enter the numeric MT5 Login ID, exact Broker Server, and MT5 Trading Password to connect via MetaApi Cloud.'
      );
      return;
    }

    if (!NUMERIC_MT5_LOGIN_RE.test(cleanLogin)) {
      setErrorMessage(
        'MT5 Login ID must be the numeric account number shown in MT5 (e.g. 12345678), not an EXN-... Exness ID.'
      );
      return;
    }

    if (BARE_EXNESS_SERVER_PREFIX_RE.test(cleanServer)) {
      setErrorMessage(
        `${cleanServer} is only the prefix. Pick the exact numbered server shown in the client's MT5 terminal (e.g. Exness-MT5Real8 or ExnessKE-MT5Real4).`
      );
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
            mt5Login: cleanLogin,
            mt5Server: cleanServer,
            mt5Password: cleanPassword,
            autoTrade: true,
            activeBot,
            riskPercent: Number(riskPercent) || 1.0,
          }),
        }
      );
      onUserUpdated(res.user);
      setMt5Password('');
      setStatusMessage(
        res.message ||
          `Client MT5 account ${res.user.mt5Login || mt5Login} connected via MetaApi Cloud with Auto-Trading enabled.`
      );
      await fetchMt5Status(false);
    } catch (err) {
      setErrorMessage(err instanceof Error ? err.message : 'Failed to connect MT5 account via MetaApi Cloud.');
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
        `MetaApi Cloud sync complete — Balance: $${(res.user.mt5Balance ?? 0).toFixed(2)}, Open Positions: ${res.user.mt5OpenPositions ?? 0}.`
      );
    } catch (err) {
      setErrorMessage(err instanceof Error ? err.message : 'Unable to sync live MT5 account.');
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
      setErrorMessage(err instanceof Error ? err.message : 'Failed to execute trade via MetaApi Cloud.');
    } finally {
      setExecutingTrade(false);
    }
  }

  async function handleRunAutoScan(dryRun: boolean) {
    setScanningAuto(true);
    setStatusMessage('');
    setErrorMessage('');
    try {
      const res = await apiFetch<AutoTradeRunResult>('/api/ea/mt5/run-auto-scan', {
        method: 'POST',
        body: JSON.stringify({ dryRun, bypassKillzone }),
      });
      setAutoScanResult(res);
      if (res.executedCount > 0) {
        setStatusMessage(
          `Cloud Auto-Trade Engine executed ${res.executedCount} live order(s) across ${res.candidates.length} candidate setup(s).`
        );
      } else if (dryRun) {
        setStatusMessage(
          `Dry-run ICT/SMC scan complete (${res.candidates.length} setup(s) inspected; no live orders dispatched).`
        );
      } else {
        setStatusMessage(
          `Cloud Auto-Trade scan complete (${res.candidates.length} setup(s) inspected; 0 live orders placed).`
        );
      }
      await fetchMt5Status(false);
    } catch (err) {
      setErrorMessage(err instanceof Error ? err.message : 'Failed to execute cloud auto-trade scan.');
    } finally {
      setScanningAuto(false);
    }
  }

  function copySource() {
    navigator.clipboard.writeText(fileContent);
    setCopiedCode(true);
    setTimeout(() => setCopiedCode(false), 1800);
  }

  const autoTradeOn = Boolean(user.mt5AutoTrade);

  return (
    <div className="space-y-6">
      {/* Hero Banner */}
      <div className="bg-slate-950 text-white rounded-xl p-6 flex flex-col lg:flex-row items-start lg:items-center justify-between gap-4 border border-slate-800">
        <div>
          <div className="text-xs font-medium text-[#E5A93C] mb-1">
            {mt5ApiConfigured
              ? 'MetaApi Cloud MT5 Backend Ready'
              : 'MetaApi Cloud MT5 Integration (Server Configuration Needed)'}
          </div>
          <h2 className="text-xl font-bold">Connect Client MT5 Accounts via MetaApi Cloud</h2>
          <p className="text-xs text-slate-300 mt-1 max-w-2xl">
            Provision and deploy your clients&apos; MT5 trading accounts securely through the backend MetaApi Cloud connection for automated EA trade execution and live account telemetry.
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
            Mode: MetaApi Cloud
          </div>
        </div>

        <div className="bg-white border border-slate-200 rounded-xl p-4">
          <div className="text-xs text-slate-500">Client MT5 Account</div>
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

      {/* Cloud Auto-Trade Engine (ICT / SMC Server Scanner) */}
      <div className="bg-white border border-slate-200 rounded-xl p-6 space-y-4">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
          <div>
            <div className="text-xs font-semibold text-blue-600 flex items-center gap-1.5">
              <Radar className="w-4 h-4" />
              <span>Cloud Auto-Trade Engine · Server-Side ICT &amp; SMC Execution</span>
            </div>
            <h3 className="text-base font-bold text-slate-950 mt-1">
              Automated MetaApi Cloud Scanner (15M Silver Bullet &amp; 1H SMC Order Blocks)
            </h3>
            <p className="text-xs text-slate-600 mt-0.5 max-w-3xl">
              Evaluates live TradingView market sessions, ICT Killzones, unmitigated FVGs and Order Blocks, dynamic risk-% position sizing, max 3 open positions, and 60-minute per-symbol cooldowns before routing orders directly via MetaApi.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2.5 shrink-0">
            <label className="inline-flex items-center gap-1.5 text-xs text-slate-700 px-3 py-2 rounded-lg bg-slate-50 border border-slate-200 cursor-pointer">
              <input
                type="checkbox"
                checked={bypassKillzone}
                onChange={(e) => setBypassKillzone(e.target.checked)}
                className="rounded border-slate-300 text-blue-600"
              />
              <span>Override Killzone Wait</span>
            </label>

            <button
              type="button"
              disabled={scanningAuto}
              onClick={() => handleRunAutoScan(true)}
              className="px-4 py-2 bg-slate-100 hover:bg-slate-200 border border-slate-300 text-slate-900 text-xs font-semibold rounded-lg cursor-pointer whitespace-nowrap disabled:opacity-60"
            >
              {scanningAuto ? 'Scanning...' : 'Test Signal Scan (Dry Run)'}
            </button>

            <button
              type="button"
              disabled={scanningAuto}
              onClick={() => handleRunAutoScan(false)}
              className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold rounded-lg cursor-pointer whitespace-nowrap disabled:opacity-60"
            >
              {scanningAuto ? 'Running Scan...' : 'Run Cloud EA Scan Now'}
            </button>
          </div>
        </div>

        {autoScanResult && (
          <div className="pt-3 border-t border-slate-100 space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2 text-xs font-mono text-slate-600">
              <span>
                Scanned {autoScanResult.candidates.length} setup(s) · Live Executed: {autoScanResult.executedCount} · MetaApi:{' '}
                {autoScanResult.metaApiConfigured ? 'Configured' : 'Pending Env'}
              </span>
              <span>{new Date(autoScanResult.scannedAt).toLocaleTimeString()}</span>
            </div>

            {autoScanResult.candidates.length === 0 ? (
              <p className="text-xs text-slate-500">
                No qualified setups triggered during this scan. Try enabling Override Killzone Wait for dry-run inspection outside London/NY Killzone hours.
              </p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead>
                    <tr className="border-b border-slate-200 text-slate-500">
                      <th className="py-2 pr-3">Pair · TF</th>
                      <th className="py-2 pr-3">Strategy</th>
                      <th className="py-2 pr-3">Side</th>
                      <th className="py-2 pr-3">Lots</th>
                      <th className="py-2 pr-3">Entry / SL / TP1</th>
                      <th className="py-2 pr-3">R:R</th>
                      <th className="py-2 pr-3">Status</th>
                      <th className="py-2">Notes</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 font-mono">
                    {autoScanResult.candidates.map((c, idx) => (
                      <tr key={`${c.symbol}-${c.timeframe}-${idx}`}>
                        <td className="py-2 pr-3 font-bold text-slate-950">
                          {c.symbol} · {c.timeframe}
                        </td>
                        <td className="py-2 pr-3 font-sans text-slate-700">{c.strategy}</td>
                        <td
                          className={`py-2 pr-3 font-bold ${
                            c.side === 'BUY' ? 'text-emerald-700' : 'text-rose-700'
                          }`}
                        >
                          {c.side}
                        </td>
                        <td className="py-2 pr-3">{c.volume.toFixed(2)}</td>
                        <td className="py-2 pr-3 text-slate-700">
                          {c.entryPrice} / {c.stopLoss} / {c.tp1}
                        </td>
                        <td className="py-2 pr-3">{c.rrRatio.toFixed(2)}R</td>
                        <td className="py-2 pr-3">
                          <span
                            className={`font-semibold uppercase ${
                              c.status === 'executed'
                                ? 'text-emerald-700'
                                : c.status === 'signal_ready'
                                ? 'text-blue-700'
                                : c.status === 'failed'
                                ? 'text-rose-700'
                                : 'text-amber-700'
                            }`}
                          >
                            {c.status}
                          </span>
                        </td>
                        <td className="py-2 font-sans text-slate-600">{c.reason}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Left Column: Connect Client MT5 via MetaApi + Direct Auto-Trade Execution */}
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

            {!mt5ApiConfigured && (
              <div className="p-3 bg-amber-50 border border-amber-200 rounded-lg text-[11px] text-amber-900">
                <span className="font-semibold">Backend Env Pending:</span> Set{' '}
                <span className="font-mono">METAAPI_TOKEN</span> and{' '}
                <span className="font-mono">METAAPI_PROVISIONING_PROFILE_ID</span> in your server environment variables (<span className="font-mono">METAAPI_REGION</span> is optional).
              </div>
            )}

            {mt5ApiConfigured && !profileConfigured && (
              <div className="p-3 bg-blue-50 border border-blue-200 rounded-lg text-[11px] text-blue-900">
                <span className="font-semibold">Tip:</span> Set{' '}
                <span className="font-mono">METAAPI_PROVISIONING_PROFILE_ID</span> on your server so custom MT5 broker servers using your <span className="font-mono">servers.dat</span> file provision automatically.
              </div>
            )}

            <form onSubmit={handleConnectMt5} className="space-y-3.5">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Client MT5 Login ID (Numeric)
                </label>
                <input
                  type="text"
                  inputMode="numeric"
                  pattern="[0-9]{4,16}"
                  required
                  value={mt5Login}
                  onChange={(e) => setMt5Login(e.target.value.replace(/\s+/g, ''))}
                  placeholder="e.g. 12345678"
                  className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg font-mono"
                />
                <p className="text-[11px] text-slate-500 mt-1">
                  Enter the numeric MT5 account number shown in MT5 (not an EXN-... Exness ID).
                </p>
              </div>

              <div>
                <div className="flex items-center justify-between gap-2 mb-1">
                  <label className="block text-xs font-semibold text-slate-700">
                    Exact MT5 Broker Server
                  </label>
                  <span className="text-[11px] font-mono text-slate-500">
                    {allKnownPresetServers.length} Exness servers
                  </span>
                </div>
                <input
                  type="text"
                  value={serverFilter}
                  onChange={(e) => setServerFilter(e.target.value)}
                  placeholder="Quick filter (e.g. Real37, Trial8, KE, SC, VG)..."
                  className="mb-2 w-full px-3 py-1.5 text-xs border border-slate-200 rounded-lg bg-slate-50 font-mono"
                />
                <select
                  required
                  value={serverPreset}
                  onChange={(e) => setServerPreset(e.target.value)}
                  className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg bg-white font-mono"
                >
                  <option value="" disabled>
                    -- Select numbered MT5 server (e.g. Exness-MT5Real8) --
                  </option>
                  {EXNESS_MT5_SERVER_GROUPS.map((group) => {
                    const q = serverFilter.trim().toLowerCase();
                    const filtered = q
                      ? group.servers.filter((s) => s.toLowerCase().includes(q))
                      : group.servers;
                    if (filtered.length === 0) return null;
                    return (
                      <optgroup key={group.label} label={group.label}>
                        {filtered.map((srv) => (
                          <option key={srv} value={srv}>
                            {srv}
                          </option>
                        ))}
                      </optgroup>
                    );
                  })}
                  {discoveredServers.length > 0 && (() => {
                    const q = serverFilter.trim().toLowerCase();
                    const filteredDiscovered = q
                      ? discoveredServers.filter((s) => s.toLowerCase().includes(q))
                      : discoveredServers;
                    if (filteredDiscovered.length === 0) return null;
                    return (
                      <optgroup label="MetaApi Discovered Exness Servers">
                        {filteredDiscovered.map((srv) => (
                          <option key={srv} value={srv}>
                            {srv}
                          </option>
                        ))}
                      </optgroup>
                    );
                  })()}
                  <option value="CUSTOM">Other / Custom Numbered MT5 Server...</option>
                </select>
                {serverPreset === 'CUSTOM' && (
                  <input
                    type="text"
                    required
                    value={customServer}
                    onChange={(e) => setCustomServer(e.target.value)}
                    placeholder="Exact numbered MT5 server (e.g. Exness-MT5Real55)"
                    className="mt-2 w-full px-3 py-2 text-sm border border-slate-300 rounded-lg font-mono"
                  />
                )}
                <p className="text-[11px] text-slate-500 mt-1">
                  Includes Global (<span className="font-mono">Exness-MT5Real1–50</span> / <span className="font-mono">Trial1–30</span>) and regional (<span className="font-mono">ExnessKE</span>, <span className="font-mono">ExnessSC</span>, <span className="font-mono">ExnessVG</span>, <span className="font-mono">ExnessZA</span>, <span className="font-mono">ExnessMU</span>, <span className="font-mono">ExnessBV</span>, <span className="font-mono">ExnessCY</span>, <span className="font-mono">ExnessJO</span>) servers, plus custom entry.
                </p>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Client MT5 Trading Password
                </label>
                <input
                  type="password"
                  required
                  value={mt5Password}
                  onChange={(e) => setMt5Password(e.target.value)}
                  placeholder="MT5 master trading password"
                  autoComplete="new-password"
                  className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg font-mono"
                />
                <p className="text-[11px] text-slate-500 mt-1">
                  Use the account&apos;s MT5 trading password — not the read-only investor password or Exness portal login.
                </p>
              </div>

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
                {connecting ? 'Connecting via MetaApi Cloud...' : 'Connect Client MT5 via MetaApi Cloud'}
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
                    : `Execute ${execSide} ${execVolume} ${execSymbol} via MetaApi`}
                </button>
              </form>

              {user.mt5Connected && (
                <button
                  type="button"
                  onClick={handleCloseAllPositions}
                  disabled={closingAll}
                  className="w-full py-2 border border-rose-300 text-rose-700 bg-rose-50 hover:bg-rose-100 text-xs font-semibold rounded-lg inline-flex items-center justify-center gap-1.5 cursor-pointer"
                >
                  <XCircle className="w-3.5 h-3.5" />
                  {closingAll ? 'Closing MT5 Positions...' : 'Close All Open MT5 Positions'}
                </button>
              )}
            </div>
          </div>

          {/* Setup Guide & Live Telemetry Feed */}
          <div className="bg-white border border-slate-200 rounded-xl p-5 space-y-4">
            <h4 className="text-sm font-bold text-slate-950">MetaApi Cloud Connection Flow</h4>
            <ol className="space-y-1.5 text-xs text-slate-600 list-decimal list-inside">
              <li>Server reads <span className="font-mono">METAAPI_TOKEN</span>, <span className="font-mono">METAAPI_PROVISIONING_PROFILE_ID</span>, and optional <span className="font-mono">METAAPI_REGION</span> strictly on the backend.</li>
              <li>Enter your client&apos;s MT5 Login ID, Broker Server, and MT5 Password above and click <span className="font-semibold">Connect Client MT5 via MetaApi Cloud</span>.</li>
              <li>Toggle <span className="font-semibold">Enable MT5 Auto-Trading</span> to route live orders and monitor Balance/Equity.</li>
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
