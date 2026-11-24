import React, { useEffect, useRef, useState } from 'react';
import {
  X,
  Coins,
  Smartphone,
  Copy,
  CheckCircle2,
  ShieldCheck,
  Loader2,
  RefreshCw,
  AlertCircle,
  Clock,
  ArrowRight,
  ChevronDown,
  ChevronUp,
  ExternalLink,
  QrCode,
} from 'lucide-react';
import QRCode from 'qrcode';
import { apiFetch } from '../lib/api';
import {
  SUBSCRIPTION_PLAN_SPECS,
  computeCyclePricing,
  formatShortDate,
  getPlanSpec,
} from '../lib/subscriptions';
import type { BillingCycle, Order, PublicConfig, User } from '../types';

interface CheckoutModalProps {
  productKey: 'analyzer' | 'drt_analyzer' | 'ea_bots';
  config: PublicConfig;
  user?: User | null;
  existingOrder?: Order | null;
  initialBillingCycle?: BillingCycle;
  onClose: () => void;
  onUnlocked: (user: User, order: Order) => void;
  onOrderSubmitted?: (order: Order) => void;
}

type StkPhase = 'idle' | 'polling' | 'paid' | 'failed' | 'submitted';

export const CheckoutModal: React.FC<CheckoutModalProps> = ({
  productKey,
  config,
  user,
  existingOrder,
  initialBillingCycle,
  onClose,
  onUnlocked,
  onOrderSubmitted,
}) => {
  const [order, setOrder] = useState<Order | null>(existingOrder || null);
  const [billingCycle, setBillingCycle] = useState<BillingCycle>(
    existingOrder?.billing_cycle || initialBillingCycle || 'monthly'
  );
  const [paymentMethod, setPaymentMethod] = useState<'mpesa' | 'crypto'>(
    existingOrder?.payment_method === 'crypto' ? 'crypto' : 'mpesa'
  );

  // M-Pesa Daraja state
  const [mpesaPhone, setMpesaPhone] = useState(existingOrder?.mpesa_phone || '');
  const [mpesaReceipt, setMpesaReceipt] = useState(existingOrder?.mpesa_receipt || '');
  const [showManualMpesa, setShowManualMpesa] = useState(
    Boolean(!config.mpesaConfigured || existingOrder?.mpesa_receipt)
  );

  const initialStkPhase: StkPhase =
    existingOrder?.payment_status === 'paid'
      ? 'paid'
      : existingOrder?.payment_status === 'failed'
      ? 'failed'
      : existingOrder?.payment_status === 'processing' && existingOrder?.mpesa_checkout_id
      ? 'polling'
      : existingOrder?.payment_status === 'processing' &&
        (existingOrder?.mpesa_receipt || existingOrder?.crypto_tx_hash)
      ? 'submitted'
      : 'idle';

  const [stkPhase, setStkPhase] = useState<StkPhase>(initialStkPhase);
  const [stkStatusMessage, setStkStatusMessage] = useState<string>(
    existingOrder?.mpesa_result_desc || ''
  );
  const [pollSecondsLeft, setPollSecondsLeft] = useState<number>(90);
  const [confirmedUser, setConfirmedUser] = useState<User | null>(null);

  // Crypto state
  const [cryptoCurrency, setCryptoCurrency] = useState<'USDT' | 'BTC'>(
    existingOrder?.crypto_currency === 'BTC' ? 'BTC' : 'USDT'
  );
  const [cryptoNetwork, setCryptoNetwork] = useState<'TRC20' | 'ERC20' | 'BTC'>(
    existingOrder?.crypto_network === 'ERC20'
      ? 'ERC20'
      : existingOrder?.crypto_currency === 'BTC'
      ? 'BTC'
      : 'TRC20'
  );
  const [txHash, setTxHash] = useState(existingOrder?.crypto_tx_hash || '');
  const [btcQuote, setBtcQuote] = useState<{ btcUsd: number; btcAmountFormatted: string } | null>(null);
  const [qrDataUrl, setQrDataUrl] = useState<string>('');
  const [cryptoExplorerUrl, setCryptoExplorerUrl] = useState<string>('');

  const [loading, setLoading] = useState(false);
  const [checkingStatus, setCheckingStatus] = useState(false);
  const [error, setError] = useState('');
  const [copiedKey, setCopiedKey] = useState<string | null>(null);

  const pollIntervalRef = useRef<number | null>(null);
  const countdownIntervalRef = useRef<number | null>(null);

  const isDrt = productKey === 'drt_analyzer' || productKey === 'ea_bots';
  const baseMonthlyUsd = isDrt
    ? Number(config.drtAnalyzerPriceUsd ?? config.eaBotsPriceUsd ?? 5.25)
    : Number(config.analyzerPriceUsd ?? 5.25);
  const usdKesRate = Number(config.usdKesRate || 130);
  const cyclePricing = computeCyclePricing(baseMonthlyUsd, usdKesRate, billingCycle);
  const planLocked = Boolean(
    existingOrder && ['processing', 'paid'].includes(existingOrder.payment_status)
  );
  const priceUsd =
    planLocked && order ? Number(order.amount_usd) : cyclePricing.amountUsd;
  const priceKes =
    planLocked && order && Number(order.amount_kes) > 0
      ? Number(order.amount_kes)
      : cyclePricing.amountKes;

  const isRenewal = isDrt
    ? Boolean(user?.hasDrtAnalyzer || user?.hasEaBots || user?.drtAnalyzerExpiresAt || user?.eaBotsExpiresAt)
    : Boolean(user?.hasAnalyzer || user?.analyzerExpiresAt);
  const currentExpiry = isDrt
    ? user?.drtAnalyzerExpiresAt ?? user?.eaBotsExpiresAt
    : user?.analyzerExpiresAt;

  const title = isDrt
    ? 'DRT Strategy Market Analyzer'
    : 'ICT Strategy Market Analyzer';
  const subtitle = isDrt
    ? 'Ali Khan Dealing Range Theory (25/50/75 DRT), Type 1/2/3 Ranges, SMT Divergence & PD Arrays'
    : 'Live TradingView Liquidity Sweeps, Premium/Discount PD Arrays & Daily Bias Scanner';

  const tillOrPaybillLabel =
    config.mpesaTransactionType === 'CustomerPayBillOnline'
      ? 'M-Pesa Paybill'
      : 'M-Pesa Buy Goods Till';
  const tillOrPaybillNumber = config.mpesaPartyB || config.mpesaTillNumber;

  const activeAddress =
    cryptoCurrency === 'BTC'
      ? config.cryptoAddresses.BTC
      : cryptoNetwork === 'ERC20'
      ? config.cryptoAddresses.USDT_ERC20
      : config.cryptoAddresses.USDT_TRC20;

  function clearPollingTimers() {
    if (pollIntervalRef.current) {
      window.clearInterval(pollIntervalRef.current);
      pollIntervalRef.current = null;
    }
    if (countdownIntervalRef.current) {
      window.clearInterval(countdownIntervalRef.current);
      countdownIntervalRef.current = null;
    }
  }

  useEffect(() => {
    return () => clearPollingTimers();
  }, []);

  async function pollMpesaStatus(targetOrderId: number, manual = false) {
    if (manual) setCheckingStatus(true);
    try {
      const res = await apiFetch<{
        status: 'pending' | 'processing' | 'paid' | 'failed';
        order: Order;
        user?: User;
        message?: string;
      }>(`/api/orders/${targetOrderId}/mpesa/status`);

      setOrder(res.order);

      if (res.status === 'paid') {
        clearPollingTimers();
        setStkPhase('paid');
        setStkStatusMessage(res.message || 'Payment confirmed and subscription activated.');
        if (res.user) {
          setConfirmedUser(res.user);
        }
        onOrderSubmitted?.(res.order);
      } else if (res.status === 'failed') {
        clearPollingTimers();
        setStkPhase('failed');
        setStkStatusMessage(res.message || 'M-Pesa payment was not completed.');
        onOrderSubmitted?.(res.order);
      } else if (res.message) {
        setStkStatusMessage(res.message);
      }
    } catch (err) {
      if (manual) {
        setError(err instanceof Error ? err.message : 'Unable to check Daraja payment status.');
      }
    } finally {
      if (manual) setCheckingStatus(false);
    }
  }

  // Automatic Daraja STK polling while awaiting handset PIN
  useEffect(() => {
    if (stkPhase !== 'polling' || !order?.id || !order.mpesa_checkout_id) {
      clearPollingTimers();
      return;
    }

    setPollSecondsLeft(90);
    countdownIntervalRef.current = window.setInterval(() => {
      setPollSecondsLeft((prev) => {
        if (prev <= 1) {
          clearPollingTimers();
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    pollIntervalRef.current = window.setInterval(() => {
      void pollMpesaStatus(order.id, false);
    }, 3500);

    return () => clearPollingTimers();
  }, [stkPhase, order?.id, order?.mpesa_checkout_id]);

  useEffect(() => {
    if (paymentMethod !== 'crypto') return;
    let active = true;
    apiFetch<{ btcUsd: number; btcAmountFormatted: string }>(
      `/api/crypto/quote?amountUsd=${encodeURIComponent(String(priceUsd))}`
    )
      .then((res) => {
        if (active) setBtcQuote({ btcUsd: res.btcUsd, btcAmountFormatted: res.btcAmountFormatted });
      })
      .catch(() => {});
    return () => {
      active = false;
    };
  }, [paymentMethod, priceUsd]);

  useEffect(() => {
    if (paymentMethod !== 'crypto' || !activeAddress) {
      setQrDataUrl('');
      return;
    }
    const qrPayload =
      cryptoCurrency === 'BTC' && btcQuote?.btcAmountFormatted
        ? `bitcoin:${activeAddress}?amount=${btcQuote.btcAmountFormatted}`
        : activeAddress;
    let active = true;
    QRCode.toDataURL(qrPayload, {
      width: 176,
      margin: 1,
      color: { dark: '#0f172a', light: '#ffffff' },
    })
      .then((url) => {
        if (active) setQrDataUrl(url);
      })
      .catch(() => {
        if (active) setQrDataUrl('');
      });
    return () => {
      active = false;
    };
  }, [paymentMethod, activeAddress, cryptoCurrency, btcQuote?.btcAmountFormatted]);

  async function ensureOrder(method: 'mpesa' | 'crypto'): Promise<Order> {
    const effectiveNetwork = method === 'crypto' ? (cryptoCurrency === 'BTC' ? 'BTC' : cryptoNetwork) : undefined;
    if (
      order &&
      order.payment_status !== 'paid' &&
      order.payment_method === method &&
      (order.billing_cycle || 'monthly') === billingCycle &&
      (method === 'mpesa' ||
        (order.crypto_currency === cryptoCurrency && order.crypto_network === effectiveNetwork))
    ) {
      return order;
    }
    const res = await apiFetch<{ order: Order }>('/api/orders/create', {
      method: 'POST',
      body: JSON.stringify({
        productKey,
        billingCycle,
        paymentMethod: method,
        cryptoCurrency: method === 'crypto' ? cryptoCurrency : undefined,
        cryptoNetwork: effectiveNetwork,
      }),
    });
    setOrder(res.order);
    onOrderSubmitted?.(res.order);
    return res.order;
  }

  async function handleSendDarajaStk(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const activeOrder = await ensureOrder('mpesa');
      const res = await apiFetch<{
        order: Order;
        mode: 'sandbox' | 'production';
        checkoutId: string;
        message: string;
      }>(`/api/orders/${activeOrder.id}/mpesa/stk`, {
        method: 'POST',
        body: JSON.stringify({ phone: mpesaPhone }),
      });
      setOrder(res.order);
      setStkStatusMessage(res.message);
      setStkPhase('polling');
      onOrderSubmitted?.(res.order);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : 'Unable to initiate Safaricom M-Pesa Daraja STK prompt.'
      );
    } finally {
      setLoading(false);
    }
  }

  async function handlePayWithWallet() {
    setError('');
    setLoading(true);
    try {
      const activeOrder = await ensureOrder('mpesa');
      const res = await apiFetch<{
        order: Order;
        user: User;
        status: string;
        message?: string;
      }>(`/api/orders/${activeOrder.id}/wallet/pay`, {
        method: 'POST',
      });
      setOrder(res.order);
      setConfirmedUser(res.user);
      setStkStatusMessage(res.message || 'Paid from confirmed KES Wallet balance.');
      setStkPhase('paid');
      onOrderSubmitted?.(res.order);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to complete wallet payment.');
    } finally {
      setLoading(false);
    }
  }

  async function handleSubmitManualMpesa(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const activeOrder = await ensureOrder('mpesa');
      const res = await apiFetch<{
        order: Order;
        user: User;
        status: string;
        message?: string;
      }>(`/api/orders/${activeOrder.id}/mpesa/confirm`, {
        method: 'POST',
        body: JSON.stringify({ mpesaReceipt: mpesaReceipt.trim() }),
      });
      setOrder(res.order);
      onOrderSubmitted?.(res.order);

      if (res.status === 'paid' || res.order.payment_status === 'paid') {
        setStkPhase('paid');
        setConfirmedUser(res.user);
        setStkStatusMessage(res.message || 'M-Pesa receipt verified and access unlocked.');
      } else {
        setStkPhase('submitted');
        setStkStatusMessage(
          res.message || 'M-Pesa confirmation code submitted and queued for verification.'
        );
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'M-Pesa confirmation submission failed.');
    } finally {
      setLoading(false);
    }
  }

  async function handleCryptoSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const activeOrder = await ensureOrder('crypto');
      const effectiveNetwork = cryptoCurrency === 'BTC' ? 'BTC' : cryptoNetwork;
      const res = await apiFetch<{
        order: Order;
        user: User;
        status: string;
        explorerUrl?: string;
        message?: string;
      }>(`/api/orders/${activeOrder.id}/crypto/submit`, {
        method: 'POST',
        body: JSON.stringify({
          txHash,
          cryptoCurrency,
          cryptoNetwork: effectiveNetwork,
        }),
      });
      setOrder(res.order);
      if (res.explorerUrl) setCryptoExplorerUrl(res.explorerUrl);
      onOrderSubmitted?.(res.order);

      if (res.status === 'paid' || res.order.payment_status === 'paid') {
        setStkPhase('paid');
        setConfirmedUser(res.user);
        setStkStatusMessage(res.message || 'Transaction confirmed on-chain and access unlocked.');
      } else {
        setStkPhase('submitted');
        setStkStatusMessage(
          res.message || 'Transaction hash recorded and queued for on-chain confirmation.'
        );
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Crypto TX submission failed.');
    } finally {
      setLoading(false);
    }
  }

  async function handleCheckCryptoStatus() {
    if (!order?.id) return;
    setCheckingStatus(true);
    setError('');
    try {
      const res = await apiFetch<{
        status: string;
        order: Order;
        user?: User;
        explorerUrl?: string | null;
        message?: string;
      }>(`/api/orders/${order.id}/crypto/status`);
      setOrder(res.order);
      if (res.explorerUrl) setCryptoExplorerUrl(res.explorerUrl);
      onOrderSubmitted?.(res.order);
      if (res.status === 'paid' || res.order.payment_status === 'paid') {
        setStkPhase('paid');
        if (res.user) setConfirmedUser(res.user);
        setStkStatusMessage(res.message || 'On-chain transaction confirmed and access unlocked.');
      } else if (res.message) {
        setStkStatusMessage(res.message);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to check blockchain status right now.');
    } finally {
      setCheckingStatus(false);
    }
  }

  function copyValue(key: string, value: string) {
    navigator.clipboard.writeText(value);
    setCopiedKey(key);
    setTimeout(() => setCopiedKey(null), 1800);
  }

  return (
    <div className="fixed inset-0 z-50 bg-slate-950/60 backdrop-blur-xs flex items-center justify-center p-4">
      <div className="bg-[#0B120E] border border-emerald-500/20 rounded-xl max-w-lg w-full shadow-2xl max-h-[92vh] overflow-y-auto">
        {/* Institutional Checkout Header */}
        <div className="px-6 py-5 border-b border-emerald-500/20 flex items-start justify-between gap-4 bg-[#070D0A]/80 rounded-t-xl">
          <div>
            <div className="flex items-center gap-2 text-xs font-medium text-slate-300 mb-1">
              <ShieldCheck className="w-3.5 h-3.5 text-[#16E563]" />
              <span>GRIDPIPs Subscription Billing</span>
              <span aria-hidden="true">·</span>
              <span>
                {order
                  ? `Invoice ${order.order_number}`
                  : isRenewal
                  ? 'Renew / Extend Plan'
                  : `${cyclePricing.spec.label} Plan`}
              </span>
            </div>
            <h2 className="text-lg font-bold text-white tracking-tight">{title}</h2>
            <p className="text-xs text-slate-400 mt-0.5">{subtitle}</p>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 text-slate-400 hover:text-white rounded-lg cursor-pointer shrink-0"
            aria-label="Close checkout"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-6 space-y-5">
          {/* Subscription Billing Cycle Selector */}
          {stkPhase !== 'paid' && stkPhase !== 'submitted' && (
            <div className="space-y-2">
              <div className="flex items-center justify-between text-xs">
                <span className="font-semibold text-slate-200">Subscription Billing Cycle</span>
                {isRenewal && currentExpiry && (
                  <span className="font-mono text-[11px] text-[#16E563]">
                    Extends +{cyclePricing.spec.durationDays}d from {formatShortDate(currentExpiry)}
                  </span>
                )}
              </div>
              <div className="grid grid-cols-3 gap-2">
                {SUBSCRIPTION_PLAN_SPECS.map((plan) => {
                  const quote = computeCyclePricing(baseMonthlyUsd, usdKesRate, plan.cycle);
                  const active = billingCycle === plan.cycle;
                  return (
                    <button
                      key={plan.cycle}
                      type="button"
                      disabled={planLocked || stkPhase === 'polling'}
                      onClick={() => {
                        setBillingCycle(plan.cycle);
                        setError('');
                        if (order && (order.billing_cycle || 'monthly') !== plan.cycle) {
                          setOrder(null);
                        }
                      }}
                      className={`p-2.5 rounded-lg border text-left transition-colors cursor-pointer disabled:opacity-60 ${
                        active
                          ? 'bg-[#0B0F19] border-[#0B0F19] text-white'
                          : 'bg-[#0B120E] border-emerald-500/20 hover:border-emerald-500/45 text-slate-100'
                      }`}
                    >
                      <div className="flex items-center justify-between gap-1">
                        <span className="text-xs font-bold">{plan.label}</span>
                        {plan.savingsBadge && (
                          <span
                            className={`text-[10px] font-mono font-bold ${
                              active ? 'text-[#E5A93C]' : 'text-[#16E563]'
                            }`}
                          >
                            -{plan.discountPct}%
                          </span>
                        )}
                      </div>
                      <div className="font-mono tabular-nums text-sm font-bold mt-1">
                        ${quote.amountUsd.toFixed(2)}
                      </div>
                      <div
                        className={`text-[10px] font-mono tabular-nums mt-0.5 ${
                          active ? 'text-slate-300' : 'text-slate-400'
                        }`}
                      >
                        {plan.durationDays}d · KES {quote.amountKes.toLocaleString()}
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {/* Amount & FX Conversion Ledger */}
          <div className="p-4 bg-[#070D0A] border border-emerald-500/20 rounded-lg flex items-center justify-between gap-4">
            <div>
              <div className="text-xs font-medium text-slate-400">
                {cyclePricing.spec.label} Subscription ({cyclePricing.spec.durationDays} Days)
              </div>
              <div className="text-xs text-slate-400 mt-0.5 font-mono tabular-nums">
                1 USD = KES {usdKesRate.toFixed(0)} · ${cyclePricing.effectiveMonthlyUsd.toFixed(2)}/mo equiv.
              </div>
            </div>
            <div className="text-right font-mono tabular-nums">
              <div className="text-lg font-bold text-white">${priceUsd.toFixed(2)} USD</div>
              <div className="text-xs font-semibold text-[#16E563]">
                KES {priceKes.toLocaleString()} via M-Pesa
              </div>
            </div>
          </div>

          {/* Success / Confirmed State */}
          {stkPhase === 'paid' && order ? (
            <div className="p-5 bg-emerald-500/12 border border-emerald-500/30 rounded-xl space-y-4">
              <div className="flex items-start gap-3">
                <CheckCircle2 className="w-6 h-6 text-[#16E563] shrink-0 mt-0.5" />
                <div>
                  <h3 className="text-base font-bold text-emerald-100">
                    Subscription Confirmed &amp; Active
                  </h3>
                  <p className="text-xs text-emerald-300 mt-1">
                    {stkStatusMessage || 'Your GRIDPIPs subscription is now active on your account.'}
                  </p>
                </div>
              </div>

              <div className="bg-[#0B120E] border border-emerald-500/30 rounded-lg divide-y divide-emerald-500/10 text-xs">
                <div className="px-3.5 py-2.5 flex items-center justify-between">
                  <span className="text-slate-400">Invoice Reference</span>
                  <span className="font-mono font-semibold text-white">{order.order_number}</span>
                </div>
                <div className="px-3.5 py-2.5 flex items-center justify-between">
                  <span className="text-slate-400">Subscription Plan</span>
                  <span className="font-semibold text-white">
                    {getPlanSpec(order.billing_cycle).label} ({order.duration_days || cyclePricing.spec.durationDays} days)
                  </span>
                </div>
                {order.subscription_ends_at && (
                  <div className="px-3.5 py-2.5 flex items-center justify-between">
                    <span className="text-slate-400">Valid Through</span>
                    <span className="font-mono font-semibold text-[#16E563]">
                      {formatShortDate(order.subscription_ends_at)}
                    </span>
                  </div>
                )}
                {order.mpesa_receipt && (
                  <div className="px-3.5 py-2.5 flex items-center justify-between">
                    <span className="text-slate-400">M-Pesa Receipt</span>
                    <span className="font-mono font-semibold text-[#16E563]">{order.mpesa_receipt}</span>
                  </div>
                )}
                <div className="px-3.5 py-2.5 flex items-center justify-between">
                  <span className="text-slate-400">Amount Settled</span>
                  <span className="font-mono font-semibold tabular-nums text-white">
                    ${Number(order.amount_usd).toFixed(2)} USD (KES {Number(order.amount_kes).toLocaleString()})
                  </span>
                </div>
              </div>

              <button
                type="button"
                onClick={() => {
                  if (confirmedUser) {
                    onUnlocked(confirmedUser, order);
                  } else {
                    onClose();
                  }
                }}
                className="w-full py-2.5 px-4 bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-semibold rounded-lg inline-flex items-center justify-center gap-2 cursor-pointer"
              >
                <span>Open {isDrt ? 'DRT Analyzer' : 'ICT Analyzer'}</span>
                <ArrowRight className="w-4 h-4" />
              </button>
            </div>
          ) : stkPhase === 'submitted' && order ? (
            <div className="p-5 bg-sky-500/12 border border-sky-500/30 rounded-xl space-y-4">
              <div className="flex items-start gap-3">
                <Clock className="w-5 h-5 text-[#16E563] shrink-0 mt-0.5" />
                <div>
                  <h3 className="text-sm font-bold text-white">
                    Payment Reference Submitted for Verification
                  </h3>
                  <p className="text-xs text-slate-200 mt-1 leading-relaxed">
                    {stkStatusMessage}
                  </p>
                </div>
              </div>

              <div className="bg-[#0B120E] border border-sky-500/30 rounded-lg divide-y divide-emerald-500/10 text-xs">
                <div className="px-3.5 py-2.5 flex items-center justify-between">
                  <span className="text-slate-400">Order Reference</span>
                  <span className="font-mono font-semibold text-white">{order.order_number}</span>
                </div>
                {order.payment_method === 'crypto' && order.crypto_network && (
                  <div className="px-3.5 py-2.5 flex items-center justify-between">
                    <span className="text-slate-400">Asset &amp; Network</span>
                    <span className="font-mono font-semibold text-white">
                      {order.crypto_currency || 'USDT'} ({order.crypto_network})
                    </span>
                  </div>
                )}
                <div className="px-3.5 py-2.5 flex items-center justify-between">
                  <span className="text-slate-400">Submitted Reference</span>
                  <span className="font-mono font-semibold text-white truncate max-w-[200px]">
                    {order.mpesa_receipt || order.crypto_tx_hash}
                  </span>
                </div>
                <div className="px-3.5 py-2.5 flex items-center justify-between">
                  <span className="text-slate-400">Status</span>
                  <span className="font-semibold text-[#F5B82E]">
                    {order.payment_method === 'crypto' ? 'Awaiting Block Confirmation' : 'Awaiting Settlement Review'}
                  </span>
                </div>
              </div>

              {order.payment_method === 'crypto' && (
                <div className="flex flex-wrap items-center gap-2">
                  <button
                    type="button"
                    disabled={checkingStatus}
                    onClick={() => void handleCheckCryptoStatus()}
                    className="flex-1 py-2.5 px-3 bg-[#16E563] text-[#041108] font-bold hover:bg-[#2BF074] text-xs rounded-lg inline-flex items-center justify-center gap-1.5 cursor-pointer disabled:opacity-60"
                  >
                    <RefreshCw className={`w-3.5 h-3.5 ${checkingStatus ? 'animate-spin' : ''}`} />
                    <span>{checkingStatus ? 'Verifying On-Chain...' : 'Check On-Chain Confirmation'}</span>
                  </button>
                  {cryptoExplorerUrl && (
                    <a
                      href={cryptoExplorerUrl}
                      target="_blank"
                      rel="noreferrer"
                      className="py-2.5 px-3 border border-emerald-500/25 bg-[#0B120E] hover:bg-emerald-500/10 text-slate-200 text-xs font-semibold rounded-lg inline-flex items-center gap-1"
                    >
                      <span>Explorer</span>
                      <ExternalLink className="w-3.5 h-3.5" />
                    </a>
                  )}
                </div>
              )}

              <button
                type="button"
                onClick={onClose}
                className="w-full py-2.5 px-4 bg-slate-950 hover:bg-slate-800 text-white text-sm font-semibold rounded-lg cursor-pointer"
              >
                Return to Subscriptions &amp; Billing
              </button>
            </div>
          ) : (
            <>
              {/* Payment Method Segmented Switcher */}
              <div className="grid grid-cols-2 gap-1 p-1 bg-[#0E1712] rounded-lg">
                <button
                  type="button"
                  onClick={() => {
                    setPaymentMethod('mpesa');
                    setError('');
                  }}
                  className={`py-2 px-3 text-xs font-semibold rounded-md inline-flex items-center justify-center gap-1.5 transition-colors cursor-pointer whitespace-nowrap ${
                    paymentMethod === 'mpesa'
                      ? 'bg-[#16E563] text-[#041108] font-bold'
                      : 'text-slate-300 hover:text-white'
                  }`}
                >
                  <Smartphone className="w-3.5 h-3.5 text-[#16E563]" />
                  <span>M-Pesa Daraja</span>
                </button>
                <button
                  type="button"
                  onClick={() => {
                    clearPollingTimers();
                    if (stkPhase === 'polling') setStkPhase('idle');
                    setPaymentMethod('crypto');
                    setError('');
                  }}
                  className={`py-2 px-3 text-xs font-semibold rounded-md inline-flex items-center justify-center gap-1.5 transition-colors cursor-pointer whitespace-nowrap ${
                    paymentMethod === 'crypto'
                      ? 'bg-[#16E563] text-[#041108] font-bold'
                      : 'text-slate-300 hover:text-white'
                  }`}
                >
                  <Coins className="w-3.5 h-3.5 text-[#16E563]" />
                  <span>Crypto (USDT / BTC)</span>
                </button>
              </div>

              {error && (
                <div className="p-3 bg-rose-500/12 border border-rose-500/30 text-rose-400 text-xs rounded-lg flex items-start gap-2">
                  <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                  <span>{error}</span>
                </div>
              )}

              {paymentMethod === 'mpesa' ? (
                <div className="space-y-4">
                  {/* Live Daraja Polling View */}
                  {stkPhase === 'polling' && order ? (
                    <div className="p-4 bg-[#070D0A] border border-emerald-500/20 rounded-xl space-y-4">
                      <div className="flex items-start justify-between gap-3">
                        <div className="flex items-start gap-2.5">
                          <Loader2 className="w-5 h-5 text-[#16E563] animate-spin shrink-0 mt-0.5" />
                          <div>
                            <div className="text-sm font-bold text-white">
                              Check Your Handset (+{order.mpesa_phone || mpesaPhone})
                            </div>
                            <p className="text-xs text-slate-300 mt-0.5">
                              {stkStatusMessage ||
                                `Enter your M-Pesa PIN to pay KES ${priceKes.toLocaleString()} to ${config.mpesaMerchantName}.`}
                            </p>
                          </div>
                        </div>
                        <span className="font-mono text-xs font-semibold tabular-nums text-slate-400 shrink-0">
                          {pollSecondsLeft > 0 ? `${pollSecondsLeft}s` : 'Timeout'}
                        </span>
                      </div>

                      {/* 3-Step Verification Progress */}
                      <div className="grid grid-cols-3 gap-2 pt-1 text-[11px]">
                        <div className="p-2 bg-emerald-500/12 border border-emerald-500/30 rounded-md text-emerald-300 font-medium">
                          1. STK Sent
                        </div>
                        <div className="p-2 bg-[#0B120E] border border-sky-500/40 rounded-md text-sky-300 font-semibold">
                          2. Enter PIN
                        </div>
                        <div className="p-2 bg-[#0B120E] border border-emerald-500/20 rounded-md text-slate-400">
                          3. Unlock
                        </div>
                      </div>

                      {order.mpesa_checkout_id && (
                        <div className="text-[11px] font-mono text-slate-400 truncate">
                          Daraja Checkout ID: {order.mpesa_checkout_id}
                        </div>
                      )}

                      <div className="flex flex-wrap items-center gap-2 pt-1">
                        <button
                          type="button"
                          disabled={checkingStatus}
                          onClick={() => void pollMpesaStatus(order.id, true)}
                          className="flex-1 py-2 px-3 bg-slate-950 hover:bg-slate-800 text-white text-xs font-semibold rounded-lg inline-flex items-center justify-center gap-1.5 cursor-pointer disabled:opacity-60"
                        >
                          <RefreshCw className={`w-3.5 h-3.5 ${checkingStatus ? 'animate-spin' : ''}`} />
                          <span>{checkingStatus ? 'Querying Daraja...' : 'Check Payment Status'}</span>
                        </button>
                        <button
                          type="button"
                          onClick={async () => {
                            clearPollingTimers();
                            setStkPhase('idle');
                            setStkStatusMessage('');
                            try {
                              const resetRes = await apiFetch<{ order: Order }>(
                                `/api/orders/${order.id}/mpesa/reset`,
                                { method: 'POST' }
                              );
                              setOrder(resetRes.order);
                              onOrderSubmitted?.(resetRes.order);
                            } catch {
                              // allow retry even if reset call fails
                            }
                          }}
                          className="py-2 px-3 border border-emerald-500/25 bg-[#0B120E] hover:bg-emerald-500/10 text-slate-200 text-xs font-semibold rounded-lg cursor-pointer"
                        >
                          Restart / Change Number
                        </button>
                      </div>
                    </div>
                  ) : (
                    <>
                      {/* Failed STK feedback */}
                      {stkPhase === 'failed' && (
                        <div className="p-3.5 bg-[#F5B82E]/12 border border-[#F5B82E]/30 rounded-lg text-xs text-amber-200 space-y-1">
                          <div className="font-semibold">Previous STK Push Not Completed</div>
                          <p>{stkStatusMessage || 'The prompt timed out or was cancelled on the handset.'}</p>
                        </div>
                      )}

                      {/* Merchant Info Bar */}
                      <div className="p-3.5 bg-emerald-500/10 border border-emerald-500/30 rounded-lg flex items-center justify-between gap-3">
                        <div>
                          <div className="text-xs font-semibold text-emerald-100">
                            {tillOrPaybillLabel} · {config.mpesaMerchantName}
                          </div>
                          <div className="font-mono text-xs text-emerald-300 mt-0.5 tabular-nums">
                            Number: <span className="font-bold">{tillOrPaybillNumber}</span> · KES{' '}
                            {priceKes.toLocaleString()}
                          </div>
                        </div>
                        <button
                          type="button"
                          onClick={() => copyValue('till', tillOrPaybillNumber)}
                          className="inline-flex items-center gap-1 text-xs text-[#16E563] font-semibold hover:underline cursor-pointer shrink-0"
                        >
                          {copiedKey === 'till' ? (
                            <CheckCircle2 className="w-3.5 h-3.5" />
                          ) : (
                            <Copy className="w-3.5 h-3.5" />
                          )}
                          <span>{copiedKey === 'till' ? 'Copied' : 'Copy'}</span>
                        </button>
                      </div>

                      {!config.mpesaConfigured && (
                        <div className="p-3 bg-[#F5B82E]/12 border border-[#F5B82E]/30 text-amber-200 text-xs rounded-lg leading-relaxed">
                          Safaricom Daraja STK Push credentials (<span className="font-mono">MPESA_CONSUMER_KEY</span>,{' '}
                          <span className="font-mono">MPESA_CONSUMER_SECRET</span>,{' '}
                          <span className="font-mono">MPESA_PASSKEY</span>,{' '}
                          <span className="font-mono">MPESA_SHORTCODE</span>) are not set on the server yet. Pay via{' '}
                          <span className="font-semibold">{tillOrPaybillNumber}</span> and enter your M-Pesa confirmation
                          code below.
                        </div>
                      )}

                      {Number(user?.walletBalanceKes || 0) >= priceKes && (
                        <div className="p-3.5 bg-slate-950 text-white rounded-lg flex items-center justify-between gap-3">
                          <div className="text-xs">
                            <div className="font-semibold text-emerald-400">
                              KES Wallet Available: KES {Number(user?.walletBalanceKes || 0).toLocaleString()}
                            </div>
                            <div className="text-slate-300 mt-0.5">
                              Instant unlock using your confirmed M-Pesa deposits.
                            </div>
                          </div>
                          <button
                            type="button"
                            disabled={loading}
                            onClick={() => void handlePayWithWallet()}
                            className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-semibold rounded-md cursor-pointer shrink-0 disabled:opacity-60"
                          >
                            Pay KES {priceKes.toLocaleString()}
                          </button>
                        </div>
                      )}

                      {/* Daraja STK Express Form */}
                      <form onSubmit={handleSendDarajaStk} className="space-y-3">
                        <div>
                          <label className="block text-xs font-semibold text-slate-200 mb-1.5">
                            Safaricom M-Pesa Phone Number
                          </label>
                          <input
                            type="tel"
                            required
                            value={mpesaPhone}
                            onChange={(e) => setMpesaPhone(e.target.value)}
                            placeholder="0712 345 678 or 254712345678"
                            className="w-full px-3.5 py-2.5 text-sm border border-emerald-500/25 rounded-lg bg-[#0E1712] text-white placeholder:text-slate-500 font-mono focus:border-[#16E563] focus:outline-none focus:outline-none focus:border-[#16E563]"
                          />
                        </div>
                        <button
                          type="submit"
                          disabled={loading || !config.mpesaConfigured}
                          className="w-full py-2.5 px-4 bg-emerald-600 text-white text-sm font-semibold rounded-lg hover:bg-emerald-700 disabled:opacity-50 cursor-pointer inline-flex items-center justify-center gap-2"
                        >
                          {loading && <Loader2 className="w-4 h-4 animate-spin" />}
                          <span>
                            {loading
                              ? 'Dispatching Daraja STK Prompt...'
                              : stkPhase === 'failed'
                              ? `Retry M-Pesa STK Push (KES ${priceKes.toLocaleString()})`
                              : `Send M-Pesa STK Push (KES ${priceKes.toLocaleString()})`}
                          </span>
                        </button>
                      </form>
                    </>
                  )}

                  {/* Collapsible Manual Till / Paybill Code Submission */}
                  <div className="pt-3 border-t border-emerald-500/20">
                    <button
                      type="button"
                      onClick={() => setShowManualMpesa((v) => !v)}
                      className="w-full flex items-center justify-between text-xs font-semibold text-slate-200 hover:text-white py-1 cursor-pointer"
                    >
                      <span>Already paid directly via Till / Paybill? Submit M-Pesa SMS Code</span>
                      {showManualMpesa ? (
                        <ChevronUp className="w-4 h-4 text-slate-400" />
                      ) : (
                        <ChevronDown className="w-4 h-4 text-slate-400" />
                      )}
                    </button>

                    {showManualMpesa && (
                      <form onSubmit={handleSubmitManualMpesa} className="mt-3 space-y-3">
                        <div>
                          <label className="block text-xs font-medium text-slate-300 mb-1.5">
                            M-Pesa Confirmation Code (from Safaricom SMS)
                          </label>
                          <input
                            type="text"
                            required
                            value={mpesaReceipt}
                            onChange={(e) => setMpesaReceipt(e.target.value.toUpperCase())}
                            placeholder="e.g. UAJ8K4M92P"
                            className="w-full px-3.5 py-2.5 text-sm border border-emerald-500/25 rounded-lg bg-[#0E1712] text-white placeholder:text-slate-500 font-mono focus:border-[#16E563] focus:outline-none uppercase focus:outline-none focus:border-[#16E563]"
                          />
                        </div>
                        <button
                          type="submit"
                          disabled={loading || mpesaReceipt.trim().length < 8}
                          className="w-full py-2.5 bg-[#16E563] text-[#041108] text-xs font-bold rounded-lg hover:bg-[#2BF074] disabled:opacity-50 cursor-pointer"
                        >
                          {loading ? 'Submitting Receipt...' : 'Submit M-Pesa Confirmation Code'}
                        </button>
                      </form>
                    )}
                  </div>
                </div>
              ) : (
                <form onSubmit={handleCryptoSubmit} className="space-y-4">
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-xs font-semibold text-slate-200 mb-1.5">Asset</label>
                      <select
                        value={cryptoCurrency}
                        onChange={(e) => {
                          const val = e.target.value as 'USDT' | 'BTC';
                          setCryptoCurrency(val);
                          setCryptoNetwork(val === 'BTC' ? 'BTC' : 'TRC20');
                        }}
                        className="w-full px-3 py-2 text-sm border border-emerald-500/25 rounded-lg bg-[#0E1712] text-white placeholder:text-slate-500 focus:border-[#16E563] focus:outline-none"
                      >
                        <option value="USDT">USDT</option>
                        <option value="BTC">Bitcoin (BTC)</option>
                      </select>
                    </div>
                    <div>
                      <label className="block text-xs font-semibold text-slate-200 mb-1.5">Network</label>
                      <select
                        value={cryptoCurrency === 'BTC' ? 'BTC' : cryptoNetwork}
                        disabled={cryptoCurrency === 'BTC'}
                        onChange={(e) => setCryptoNetwork(e.target.value as 'TRC20' | 'ERC20')}
                        className="w-full px-3 py-2 text-sm border border-emerald-500/25 rounded-lg bg-[#0E1712] text-white placeholder:text-slate-500 focus:border-[#16E563] focus:outline-none"
                      >
                        {cryptoCurrency === 'BTC' ? (
                          <option value="BTC">Bitcoin Mainnet</option>
                        ) : (
                          <>
                            <option value="TRC20">TRON (TRC20)</option>
                            <option value="ERC20">Ethereum (ERC20)</option>
                          </>
                        )}
                      </select>
                    </div>
                  </div>

                  <div className="p-4 bg-[#070D0A] border border-emerald-500/20 rounded-xl space-y-3">
                    <div className="flex items-start justify-between gap-3">
                      <div className="space-y-1">
                        <div className="text-xs font-semibold text-white">
                          {cryptoCurrency === 'BTC' && btcQuote
                            ? `Send ${btcQuote.btcAmountFormatted} BTC (≈ $${priceUsd.toFixed(2)} USD)`
                            : `Send exactly ${priceUsd.toFixed(2)} USDT (${cryptoNetwork})`}
                        </div>
                        <div className="text-[11px] text-[#F5B82E] font-medium">
                          {cryptoCurrency === 'BTC'
                            ? `Bitcoin Mainnet only (1 BTC ≈ $${btcQuote ? btcQuote.btcUsd.toLocaleString() : '—'})`
                            : cryptoNetwork === 'ERC20'
                            ? 'Send ONLY USDT on Ethereum (ERC20) — other tokens/chains will be lost'
                            : 'Send ONLY USDT on TRON (TRC20) — other tokens/chains will be lost'}
                        </div>
                      </div>
                      {cryptoCurrency === 'BTC' && btcQuote && (
                        <button
                          type="button"
                          onClick={() => copyValue('btcAmount', btcQuote.btcAmountFormatted)}
                          className="shrink-0 inline-flex items-center gap-1 text-[11px] font-semibold text-[#16E563] hover:text-[#16E563] cursor-pointer"
                        >
                          {copiedKey === 'btcAmount' ? (
                            <CheckCircle2 className="w-3.5 h-3.5" />
                          ) : (
                            <Copy className="w-3.5 h-3.5" />
                          )}
                          <span>{copiedKey === 'btcAmount' ? 'Copied BTC' : 'Copy BTC'}</span>
                        </button>
                      )}
                    </div>

                    <div className="flex flex-col sm:flex-row items-center gap-3.5 bg-[#0B120E] p-3 rounded-lg border border-emerald-500/20">
                      <div className="shrink-0 w-28 h-28 rounded-md border border-emerald-500/20 bg-[#0B120E] flex items-center justify-center p-1">
                        {qrDataUrl ? (
                          <img
                            src={qrDataUrl}
                            alt={`${cryptoCurrency} ${cryptoNetwork} deposit QR code`}
                            className="w-full h-full object-contain"
                          />
                        ) : (
                          <QrCode className="w-8 h-8 text-slate-300" />
                        )}
                      </div>
                      <div className="flex-1 min-w-0 w-full space-y-2">
                        <div className="flex items-center justify-between gap-2">
                          <span className="text-[11px] font-semibold text-slate-400 uppercase tracking-wide">
                            {cryptoCurrency === 'BTC' ? 'BTC Deposit Address' : `USDT ${cryptoNetwork} Address`}
                          </span>
                          <button
                            type="button"
                            onClick={() => copyValue('crypto', activeAddress)}
                            className="inline-flex items-center gap-1 text-xs font-semibold text-[#16E563] hover:text-[#16E563] cursor-pointer"
                          >
                            {copiedKey === 'crypto' ? (
                              <CheckCircle2 className="w-3.5 h-3.5" />
                            ) : (
                              <Copy className="w-3.5 h-3.5" />
                            )}
                            <span>{copiedKey === 'crypto' ? 'Copied' : 'Copy address'}</span>
                          </button>
                        </div>
                        <div className="font-mono text-xs text-white break-all bg-[#070D0A] p-2 rounded border border-emerald-500/20 select-all">
                          {activeAddress}
                        </div>
                      </div>
                    </div>
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-slate-200 mb-1.5">
                      Blockchain Transaction Hash (TXID)
                    </label>
                    <input
                      type="text"
                      required
                      value={txHash}
                      onChange={(e) => setTxHash(e.target.value)}
                      placeholder={
                        cryptoCurrency === 'BTC'
                          ? 'Paste 64-character Bitcoin TXID'
                          : cryptoNetwork === 'ERC20'
                          ? 'Paste 0x... Ethereum transaction hash'
                          : 'Paste 64-character TRON TRC20 TXID'
                      }
                      className="w-full px-3.5 py-2.5 text-sm border border-emerald-500/25 rounded-lg bg-[#0E1712] text-white placeholder:text-slate-500 font-mono focus:border-[#16E563] focus:outline-none focus:outline-none focus:border-[#16E563]"
                    />
                  </div>

                  <button
                    type="submit"
                    disabled={loading || txHash.trim().length < 20}
                    className="w-full py-2.5 bg-[#16E563] text-[#041108] font-bold text-sm font-semibold rounded-lg hover:bg-[#2BF074] disabled:opacity-50 cursor-pointer"
                  >
                    {loading ? 'Verifying On-Chain...' : 'Verify TX Hash & Unlock'}
                  </button>
                </form>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
};
