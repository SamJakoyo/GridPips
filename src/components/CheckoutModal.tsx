import React, { useState } from 'react';
import { X, Coins, Smartphone, Copy, CheckCircle2 } from 'lucide-react';
import { apiFetch } from '../lib/api';
import type { Order, PublicConfig, User } from '../types';

interface CheckoutModalProps {
  productKey: 'analyzer' | 'ea_bots';
  config: PublicConfig;
  existingOrder?: Order | null;
  onClose: () => void;
  onUnlocked: (user: User, order: Order) => void;
}

export const CheckoutModal: React.FC<CheckoutModalProps> = ({
  productKey,
  config,
  existingOrder,
  onClose,
  onUnlocked,
}) => {
  const [order, setOrder] = useState<Order | null>(existingOrder || null);
  const [paymentMethod, setPaymentMethod] = useState<'mpesa' | 'crypto'>(
    existingOrder?.payment_method === 'crypto' ? 'crypto' : 'mpesa'
  );

  // M-Pesa MegaPay state
  const [mpesaPhone, setMpesaPhone] = useState(existingOrder?.mpesa_phone || '');
  const [mpesaReceipt, setMpesaReceipt] = useState('');
  const [stkPromptSent, setStkPromptSent] = useState(
    Boolean(existingOrder?.mpesa_checkout_id)
  );
  const [stkNotice, setStkNotice] = useState('');

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
  const [txHash, setTxHash] = useState('');

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [copiedKey, setCopiedKey] = useState<string | null>(null);

  const priceUsd =
    productKey === 'ea_bots' ? config.eaBotsPriceUsd : config.analyzerPriceUsd;
  const priceKes =
    productKey === 'ea_bots' ? config.eaBotsPriceKes : config.analyzerPriceKes;
  const title =
    productKey === 'ea_bots'
      ? 'MQL5 EA Bots Pack + MT5 Bridge'
      : 'ICT Strategy Market Analyzer';

  const activeAddress =
    cryptoCurrency === 'BTC'
      ? config.cryptoAddresses.BTC
      : cryptoNetwork === 'ERC20'
      ? config.cryptoAddresses.USDT_ERC20
      : config.cryptoAddresses.USDT_TRC20;

  async function ensureOrder(method: 'mpesa' | 'crypto'): Promise<Order> {
    if (order && order.payment_method === method) return order;
    const res = await apiFetch<{ order: Order }>('/api/orders/create', {
      method: 'POST',
      body: JSON.stringify({
        productKey,
        paymentMethod: method,
        cryptoCurrency: method === 'crypto' ? cryptoCurrency : undefined,
        cryptoNetwork:
          method === 'crypto'
            ? cryptoCurrency === 'BTC'
              ? 'BTC'
              : cryptoNetwork
            : undefined,
      }),
    });
    setOrder(res.order);
    return res.order;
  }

  async function handleSendMegaPayStk(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    setStkNotice('');
    setLoading(true);
    try {
      const activeOrder = await ensureOrder('mpesa');
      const res = await apiFetch<{
        order: Order;
        message: string;
        tillNumber: string;
      }>(`/api/orders/${activeOrder.id}/mpesa/stk`, {
        method: 'POST',
        body: JSON.stringify({ phone: mpesaPhone }),
      });
      setOrder(res.order);
      setStkPromptSent(true);
      setStkNotice(res.message);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to initiate MegaPay STK prompt.');
    } finally {
      setLoading(false);
    }
  }

  async function handleConfirmMpesa(simulateStk = false) {
    setError('');
    setLoading(true);
    try {
      const activeOrder = await ensureOrder('mpesa');
      const res = await apiFetch<{ order: Order; user: User }>(
        `/api/orders/${activeOrder.id}/mpesa/confirm`,
        {
          method: 'POST',
          body: JSON.stringify({
            mpesaReceipt: mpesaReceipt.trim(),
            simulateStk,
          }),
        }
      );
      onUnlocked(res.user, res.order);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'M-Pesa confirmation failed.');
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
      const res = await apiFetch<{ order: Order; user: User }>(
        `/api/orders/${activeOrder.id}/crypto/submit`,
        {
          method: 'POST',
          body: JSON.stringify({ txHash }),
        }
      );
      onUnlocked(res.user, res.order);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Crypto TX submission failed');
    } finally {
      setLoading(false);
    }
  }

  function copyValue(key: string, value: string) {
    navigator.clipboard.writeText(value);
    setCopiedKey(key);
    setTimeout(() => setCopiedKey(null), 1800);
  }

  return (
    <div className="fixed inset-0 z-50 bg-slate-950/60 backdrop-blur-xs flex items-center justify-center p-4">
      <div className="bg-white border border-slate-200 rounded-xl max-w-md w-full p-6 shadow-xl max-h-[92vh] overflow-y-auto">
        <div className="flex items-start justify-between gap-4 mb-5">
          <div>
            <div className="text-xs font-medium text-blue-600 mb-1">
              GRIDPIPs Checkout · Instant Unlock
            </div>
            <h2 className="text-lg font-bold text-slate-950">{title}</h2>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 text-slate-400 hover:text-slate-800 rounded-lg cursor-pointer"
            aria-label="Close checkout"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Amount Box */}
        <div className="p-3.5 bg-slate-50 border border-slate-200 rounded-lg flex items-center justify-between mb-4">
          <span className="text-xs font-medium text-slate-600">Total Due</span>
          <div className="text-right font-mono tabular-nums">
            <div className="text-base font-bold text-slate-950">${priceUsd.toFixed(2)} USD</div>
            <div className="text-xs font-semibold text-emerald-700">
              KES {priceKes.toLocaleString()} via M-Pesa
            </div>
          </div>
        </div>

        {/* Payment Method Switcher */}
        <div className="grid grid-cols-2 gap-1 p-1 bg-slate-100 rounded-lg mb-5">
          <button
            type="button"
            onClick={() => {
              setPaymentMethod('mpesa');
              setError('');
            }}
            className={`py-2 px-3 text-xs font-semibold rounded-md inline-flex items-center justify-center gap-1.5 transition-colors cursor-pointer ${
              paymentMethod === 'mpesa'
                ? 'bg-white text-slate-950 shadow-xs'
                : 'text-slate-600 hover:text-slate-950'
            }`}
          >
            <Smartphone className="w-3.5 h-3.5 text-emerald-600" />
            M-Pesa (MegaPay Till)
          </button>
          <button
            type="button"
            onClick={() => {
              setPaymentMethod('crypto');
              setError('');
            }}
            className={`py-2 px-3 text-xs font-semibold rounded-md inline-flex items-center justify-center gap-1.5 transition-colors cursor-pointer ${
              paymentMethod === 'crypto'
                ? 'bg-white text-slate-950 shadow-xs'
                : 'text-slate-600 hover:text-slate-950'
            }`}
          >
            <Coins className="w-3.5 h-3.5 text-blue-600" />
            Crypto (USDT / BTC)
          </button>
        </div>

        {error && (
          <div className="mb-4 p-3 bg-rose-50 border border-rose-200 text-rose-700 text-xs rounded-lg">
            {error}
          </div>
        )}

        {paymentMethod === 'mpesa' ? (
          <div className="space-y-4">
            {/* MegaPay Till Summary */}
            <div className="p-3.5 bg-emerald-50/70 border border-emerald-200 rounded-lg space-y-1.5">
              <div className="flex items-center justify-between text-xs">
                <span className="font-semibold text-emerald-950">
                  MegaPay Buy Goods Till ({config.mpesaMerchantName})
                </span>
                <button
                  type="button"
                  onClick={() => copyValue('till', config.mpesaTillNumber)}
                  className="inline-flex items-center gap-1 text-emerald-700 font-semibold hover:underline cursor-pointer"
                >
                  {copiedKey === 'till' ? (
                    <CheckCircle2 className="w-3.5 h-3.5" />
                  ) : (
                    <Copy className="w-3.5 h-3.5" />
                  )}
                  {copiedKey === 'till' ? 'Copied' : 'Copy Till'}
                </button>
              </div>
              <div className="font-mono text-sm font-bold text-emerald-900">
                Till Number: {config.mpesaTillNumber} · Amount: KES {priceKes}
              </div>
            </div>

            {/* Step 1: STK Push */}
            <form onSubmit={handleSendMegaPayStk} className="space-y-3">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                  Safaricom / Airtel M-Pesa Phone Number
                </label>
                <input
                  type="tel"
                  required
                  value={mpesaPhone}
                  onChange={(e) => setMpesaPhone(e.target.value)}
                  placeholder="e.g. 0712345678 or 254712345678"
                  className="w-full px-3.5 py-2.5 text-sm border border-slate-300 rounded-lg font-mono focus:outline-none focus:border-emerald-600"
                />
              </div>
              <button
                type="submit"
                disabled={loading}
                className="w-full py-2.5 bg-emerald-600 text-white text-sm font-semibold rounded-lg hover:bg-emerald-700 disabled:opacity-60 cursor-pointer"
              >
                {loading
                  ? 'Sending MegaPay STK Prompt...'
                  : `Send M-Pesa STK Push (KES ${priceKes})`}
              </button>
            </form>

            {stkNotice && (
              <div className="p-3 bg-blue-50 border border-blue-200 text-blue-900 text-xs rounded-lg leading-relaxed">
                {stkNotice}
              </div>
            )}

            {/* Step 2: M-Pesa Receipt Verification */}
            <div className="pt-4 border-t border-slate-200 space-y-3">
              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <label className="text-xs font-semibold text-slate-700">
                    M-Pesa Confirmation Code (SMS Receipt)
                  </label>
                  <button
                    type="button"
                    onClick={() => setMpesaReceipt('UAJ8K4M92P')}
                    className="text-xs text-blue-600 hover:underline cursor-pointer"
                  >
                    Fill sample code
                  </button>
                </div>
                <input
                  type="text"
                  value={mpesaReceipt}
                  onChange={(e) => setMpesaReceipt(e.target.value.toUpperCase())}
                  placeholder="e.g. UAJ8K4M92P"
                  className="w-full px-3.5 py-2.5 text-sm border border-slate-300 rounded-lg font-mono uppercase focus:outline-none focus:border-blue-600"
                />
              </div>

              <div className="grid grid-cols-1 gap-2">
                <button
                  type="button"
                  disabled={loading || mpesaReceipt.trim().length < 6}
                  onClick={() => handleConfirmMpesa(false)}
                  className="w-full py-2.5 bg-slate-950 text-white text-sm font-semibold rounded-lg hover:bg-slate-800 disabled:opacity-50 cursor-pointer"
                >
                  {loading ? 'Verifying Receipt...' : 'Verify M-Pesa Receipt & Unlock'}
                </button>
                {stkPromptSent && (
                  <button
                    type="button"
                    disabled={loading}
                    onClick={() => handleConfirmMpesa(true)}
                    className="w-full py-2 border border-emerald-600 text-emerald-700 text-xs font-semibold rounded-lg hover:bg-emerald-50 cursor-pointer"
                  >
                    Completed M-Pesa PIN on Phone — Confirm STK Now
                  </button>
                )}
              </div>
            </div>
          </div>
        ) : (
          <form onSubmit={handleCryptoSubmit} className="space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1.5">Asset</label>
                <select
                  value={cryptoCurrency}
                  onChange={(e) => {
                    const val = e.target.value as 'USDT' | 'BTC';
                    setCryptoCurrency(val);
                    setCryptoNetwork(val === 'BTC' ? 'BTC' : 'TRC20');
                  }}
                  className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg bg-white"
                >
                  <option value="USDT">USDT</option>
                  <option value="BTC">Bitcoin (BTC)</option>
                </select>
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1.5">Network</label>
                <select
                  value={cryptoCurrency === 'BTC' ? 'BTC' : cryptoNetwork}
                  disabled={cryptoCurrency === 'BTC'}
                  onChange={(e) => setCryptoNetwork(e.target.value as 'TRC20' | 'ERC20')}
                  className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg bg-white"
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

            <div className="p-3 bg-slate-50 border border-slate-200 rounded-lg">
              <div className="flex items-center justify-between mb-1">
                <span className="text-xs font-semibold text-slate-700">
                  Send exactly ${priceUsd.toFixed(2)} in {cryptoCurrency}
                </span>
                <button
                  type="button"
                  onClick={() => copyValue('crypto', activeAddress)}
                  className="inline-flex items-center gap-1 text-xs font-semibold text-blue-600 hover:text-blue-700 cursor-pointer"
                >
                  {copiedKey === 'crypto' ? (
                    <CheckCircle2 className="w-3.5 h-3.5" />
                  ) : (
                    <Copy className="w-3.5 h-3.5" />
                  )}
                  {copiedKey === 'crypto' ? 'Copied' : 'Copy address'}
                </button>
              </div>
              <div className="font-mono text-xs text-slate-800 break-all bg-white p-2 rounded border border-slate-200">
                {activeAddress}
              </div>
            </div>

            <div>
              <div className="flex items-center justify-between mb-1.5">
                <label className="text-xs font-semibold text-slate-700">
                  Transaction Hash (TXID)
                </label>
                <button
                  type="button"
                  onClick={() =>
                    setTxHash(
                      `0x${Array.from({ length: 24 }, () => Math.floor(Math.random() * 16).toString(16)).join('')}`
                    )
                  }
                  className="text-xs text-blue-600 hover:underline cursor-pointer"
                >
                  Fill test TXID
                </button>
              </div>
              <input
                type="text"
                required
                value={txHash}
                onChange={(e) => setTxHash(e.target.value)}
                placeholder="Paste blockchain TX hash"
                className="w-full px-3.5 py-2.5 text-sm border border-slate-300 rounded-lg font-mono focus:outline-none focus:border-blue-600"
              />
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full py-3 bg-blue-600 text-white text-sm font-semibold rounded-lg hover:bg-blue-700 disabled:opacity-60 cursor-pointer"
            >
              {loading ? 'Confirming On-Chain TX...' : 'Submit TX Hash & Unlock Access'}
            </button>
          </form>
        )}
      </div>
    </div>
  );
};
