import { getTradingViewLiveQuotes } from './tradingViewFeed.ts';

export type CryptoNetwork = 'TRC20' | 'ERC20' | 'BTC';
export type CryptoCurrency = 'USDT' | 'BTC';

export const DEFAULT_CRYPTO_ADDRESSES = {
  USDT_TRC20: 'TDqm7SGqyDT5p9YrrHYmzwh9zPDo1y4AQJ',
  USDT_ERC20: '0x7ac8dd858f3154d83114d7134a85924fdbb22234',
  BTC: '13JdKdY8s8iVf5PAwy7popMHCqKvZsSrjD',
} as const;

const ETH_USDT_CONTRACT = '0xdac17f958d2ee523a2206206994597c13d831ec7';
const ERC20_TRANSFER_TOPIC =
  '0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef';
const TRON_USDT_CONTRACT = 'TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t';

let cachedBtcPrice: { priceUsd: number; fetchedAt: number } | null = null;

export async function getLiveBtcUsdPrice(): Promise<number> {
  if (cachedBtcPrice && Date.now() - cachedBtcPrice.fetchedAt < 30_000) {
    return cachedBtcPrice.priceUsd;
  }

  try {
    const quotes = await getTradingViewLiveQuotes();
    const btcQuote = quotes.find(
      (q) =>
        q.symbol.toUpperCase() === 'BTCUSD' ||
        q.tvSymbol.toUpperCase().includes('BTCUSD')
    );
    if (btcQuote && Number.isFinite(btcQuote.price) && btcQuote.price > 1000) {
      cachedBtcPrice = { priceUsd: btcQuote.price, fetchedAt: Date.now() };
      return btcQuote.price;
    }
  } catch {
    // Fallback below
  }

  try {
    const resp = await fetch('https://api.coinbase.com/v2/prices/BTC-USD/spot', {
      signal: AbortSignal.timeout(5000),
    });
    if (resp.ok) {
      const json = (await resp.json()) as { data?: { amount?: string } };
      const parsed = Number(json.data?.amount);
      if (Number.isFinite(parsed) && parsed > 1000) {
        cachedBtcPrice = { priceUsd: parsed, fetchedAt: Date.now() };
        return parsed;
      }
    }
  } catch {
    // Fallback below
  }

  return cachedBtcPrice?.priceUsd || 90000;
}

export function getExplorerTxUrl(
  currency: CryptoCurrency,
  network: CryptoNetwork,
  txHash: string
): string {
  if (currency === 'BTC' || network === 'BTC') {
    return `https://mempool.space/tx/${encodeURIComponent(txHash)}`;
  }
  if (network === 'ERC20') {
    return `https://etherscan.io/tx/${encodeURIComponent(txHash)}`;
  }
  return `https://tronscan.org/#/transaction/${encodeURIComponent(txHash)}`;
}

export function validateCryptoTxHashFormat(
  currency: CryptoCurrency,
  network: CryptoNetwork,
  rawHash: string
): { ok: true; normalizedHash: string } | { ok: false; error: string } {
  const trimmed = rawHash.trim();
  if (currency === 'USDT' && network === 'ERC20') {
    const prefixed = trimmed.startsWith('0x') || trimmed.startsWith('0X') ? `0x${trimmed.slice(2)}` : `0x${trimmed}`;
    if (!/^0x[a-fA-F0-9]{64}$/.test(prefixed)) {
      return {
        ok: false,
        error: 'Invalid Ethereum (ERC20) transaction hash. Expected 66-character 0x... hex TXID.',
      };
    }
    return { ok: true, normalizedHash: prefixed.toLowerCase() };
  }

  const stripped = trimmed.replace(/^0x/i, '');
  if (!/^[a-fA-F0-9]{64}$/.test(stripped)) {
    return {
      ok: false,
      error:
        currency === 'BTC' || network === 'BTC'
          ? 'Invalid Bitcoin transaction ID (TXID). Expected 64-character hex hash.'
          : 'Invalid TRON (TRC20) transaction ID (TXID). Expected 64-character hex hash.',
    };
  }
  return { ok: true, normalizedHash: stripped.toLowerCase() };
}

export interface OnChainVerifyResult {
  outcome: 'confirmed' | 'pending_confirmations' | 'unverified_queue' | 'rejected';
  message: string;
  explorerUrl: string;
  receivedAmount?: number;
  receivedUsd?: number;
  confirmations?: number;
}

async function verifyBtcOnChain(
  txHash: string,
  expectedAddress: string,
  expectedUsd: number
): Promise<OnChainVerifyResult> {
  const explorerUrl = getExplorerTxUrl('BTC', 'BTC', txHash);
  const endpoints = [
    `https://blockstream.info/api/tx/${encodeURIComponent(txHash)}`,
    `https://mempool.space/api/tx/${encodeURIComponent(txHash)}`,
  ];

  interface BtcTxInfo {
    status?: { confirmed?: boolean; block_height?: number };
    vout?: Array<{ scriptpubkey_address?: string; value?: number }>;
  }

  let txData: BtcTxInfo | null = null;

  for (const url of endpoints) {
    try {
      const resp = await fetch(url, { signal: AbortSignal.timeout(6500) });
      if (resp.status === 404) {
        return {
          outcome: 'unverified_queue',
          explorerUrl,
          message:
            'Bitcoin TXID recorded. Not indexed by mempool explorers yet — click "Check On-Chain Confirmation" in a minute.',
        };
      }
      if (resp.ok) {
        txData = (await resp.json()) as BtcTxInfo;
        break;
      }
    } catch {
      // Try secondary explorer
    }
  }

  const verifiedTx = txData;
  if (!verifiedTx || !Array.isArray(verifiedTx.vout)) {
    return {
      outcome: 'unverified_queue',
      explorerUrl,
      message:
        'Bitcoin TXID recorded. Blockchain explorer timed out; queued for confirmation re-check.',
    };
  }

  const matchedSatoshis = verifiedTx.vout
    .filter((v) => v.scriptpubkey_address === expectedAddress)
    .reduce((sum, v) => sum + Number(v.value || 0), 0);

  if (matchedSatoshis <= 0) {
    return {
      outcome: 'rejected',
      explorerUrl,
      message: `This Bitcoin transaction does not send any BTC to ${expectedAddress}. Verify the deposit address and TXID.`,
    };
  }

  const receivedBtc = matchedSatoshis / 1e8;
  const btcPriceUsd = await getLiveBtcUsdPrice();
  const receivedUsd = Number((receivedBtc * btcPriceUsd).toFixed(2));

  if (receivedUsd < expectedUsd * 0.94) {
    return {
      outcome: 'rejected',
      explorerUrl,
      receivedAmount: receivedBtc,
      receivedUsd,
      message: `Received ${receivedBtc.toFixed(8)} BTC (~$${receivedUsd.toFixed(2)}), which is less than the required $${expectedUsd.toFixed(2)} USD.`,
    };
  }

  if (verifiedTx.status?.confirmed) {
    return {
      outcome: 'confirmed',
      explorerUrl,
      receivedAmount: receivedBtc,
      receivedUsd,
      confirmations: 1,
      message: `Confirmed on Bitcoin blockchain (${receivedBtc.toFixed(8)} BTC ≈ $${receivedUsd.toFixed(2)}). License unlocked.`,
    };
  }

  return {
    outcome: 'pending_confirmations',
    explorerUrl,
    receivedAmount: receivedBtc,
    receivedUsd,
    confirmations: 0,
    message: `Detected ${receivedBtc.toFixed(8)} BTC (~$${receivedUsd.toFixed(2)}) in Bitcoin mempool. Waiting for 1 block confirmation.`,
  };
}

async function verifyUsdtErc20OnChain(
  txHash: string,
  expectedAddress: string,
  expectedUsd: number
): Promise<OnChainVerifyResult> {
  const explorerUrl = getExplorerTxUrl('USDT', 'ERC20', txHash);
  const rpcEndpoints = [
    'https://ethereum-rpc.publicnode.com',
    'https://cloudflare-eth.com',
  ];

  type EthReceipt = {
    status?: string;
    blockNumber?: string;
    logs?: Array<{ address?: string; topics?: string[]; data?: string }>;
  };

  let receipt: EthReceipt | null | undefined = undefined;
  for (const rpcUrl of rpcEndpoints) {
    try {
      const resp = await fetch(rpcUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          jsonrpc: '2.0',
          id: 1,
          method: 'eth_getTransactionReceipt',
          params: [txHash],
        }),
        signal: AbortSignal.timeout(6500),
      });
      if (resp.ok) {
        const json = (await resp.json()) as { result?: EthReceipt | null };
        receipt = json.result ?? null;
        break;
      }
    } catch {
      // Try next RPC
    }
  }

  if (receipt === undefined) {
    return {
      outcome: 'unverified_queue',
      explorerUrl,
      message:
        'Ethereum TXID recorded. Public RPC timed out; queued for confirmation check.',
    };
  }

  if (receipt === null) {
    return {
      outcome: 'pending_confirmations',
      explorerUrl,
      confirmations: 0,
      message:
        'Ethereum transaction is pending in mempool or not mined yet. Click "Check On-Chain Confirmation" once confirmed.',
    };
  }

  if (receipt.status !== '0x1') {
    return {
      outcome: 'rejected',
      explorerUrl,
      message: 'This Ethereum (ERC20) transaction failed or reverted on-chain.',
    };
  }

  const normalizedRecipient = expectedAddress.toLowerCase().replace(/^0x/, '').padStart(64, '0');
  let matchedUnits = 0n;

  for (const log of receipt.logs || []) {
    if (
      (log.address || '').toLowerCase() === ETH_USDT_CONTRACT &&
      Array.isArray(log.topics) &&
      (log.topics[0] || '').toLowerCase() === ERC20_TRANSFER_TOPIC &&
      (log.topics[2] || '').toLowerCase().replace(/^0x/, '').padStart(64, '0') === normalizedRecipient &&
      typeof log.data === 'string' &&
      log.data.startsWith('0x')
    ) {
      try {
        matchedUnits += BigInt(log.data);
      } catch {
        // Ignore malformed log data
      }
    }
  }

  if (matchedUnits <= 0n) {
    return {
      outcome: 'rejected',
      explorerUrl,
      message: `No USDT (ERC20) transfer to ${expectedAddress} found in this Ethereum transaction.`,
    };
  }

  const receivedUsdt = Number(matchedUnits) / 1e6;
  if (receivedUsdt < expectedUsd * 0.98) {
    return {
      outcome: 'rejected',
      explorerUrl,
      receivedAmount: receivedUsdt,
      receivedUsd: receivedUsdt,
      message: `Received ${receivedUsdt.toFixed(2)} USDT (ERC20), which is less than the required $${expectedUsd.toFixed(2)} USD.`,
    };
  }

  return {
    outcome: 'confirmed',
    explorerUrl,
    receivedAmount: receivedUsdt,
    receivedUsd: receivedUsdt,
    confirmations: 1,
    message: `Confirmed ${receivedUsdt.toFixed(2)} USDT on Ethereum (ERC20). License unlocked.`,
  };
}

async function verifyUsdtTrc20OnChain(
  txHash: string,
  expectedAddress: string,
  expectedUsd: number
): Promise<OnChainVerifyResult> {
  const explorerUrl = getExplorerTxUrl('USDT', 'TRC20', txHash);

  try {
    const resp = await fetch(
      `https://apilist.tronscanapi.com/api/transaction-info?hash=${encodeURIComponent(txHash)}`,
      { signal: AbortSignal.timeout(7000) }
    );
    if (resp.ok) {
      const data = (await resp.json()) as {
        hash?: string;
        confirmed?: boolean;
        contractRet?: string;
        trc20TransferInfo?: Array<{
          contract_address?: string;
          to_address?: string;
          amount_str?: string;
          decimals?: number;
        }>;
      };

      if (!data || !data.hash) {
        return {
          outcome: 'pending_confirmations',
          explorerUrl,
          confirmations: 0,
          message:
            'TRON transaction not indexed yet. Wait a few seconds and click "Check On-Chain Confirmation".',
        };
      }

      if (data.contractRet && data.contractRet !== 'SUCCESS') {
        return {
          outcome: 'rejected',
          explorerUrl,
          message: `TRON transaction status is ${data.contractRet} (not SUCCESS).`,
        };
      }

      const transfers = Array.isArray(data.trc20TransferInfo) ? data.trc20TransferInfo : [];
      const matching = transfers.filter(
        (t) =>
          t.contract_address === TRON_USDT_CONTRACT &&
          t.to_address === expectedAddress
      );

      if (matching.length === 0) {
        if (!data.confirmed) {
          return {
            outcome: 'pending_confirmations',
            explorerUrl,
            confirmations: 0,
            message: 'TRON transaction is awaiting finality. Click "Check On-Chain Confirmation" shortly.',
          };
        }
        return {
          outcome: 'rejected',
          explorerUrl,
          message: `No USDT (TRC20) transfer to ${expectedAddress} found in this TRON transaction.`,
        };
      }

      const receivedUsdt = matching.reduce((sum, t) => {
        const decimals = typeof t.decimals === 'number' ? t.decimals : 6;
        return sum + Number(t.amount_str || 0) / Math.pow(10, decimals);
      }, 0);

      if (receivedUsdt < expectedUsd * 0.98) {
        return {
          outcome: 'rejected',
          explorerUrl,
          receivedAmount: receivedUsdt,
          receivedUsd: receivedUsdt,
          message: `Received ${receivedUsdt.toFixed(2)} USDT (TRC20), which is less than the required $${expectedUsd.toFixed(2)} USD.`,
        };
      }

      if (data.confirmed) {
        return {
          outcome: 'confirmed',
          explorerUrl,
          receivedAmount: receivedUsdt,
          receivedUsd: receivedUsdt,
          confirmations: 1,
          message: `Confirmed ${receivedUsdt.toFixed(2)} USDT on TRON (TRC20). License unlocked.`,
        };
      }

      return {
        outcome: 'pending_confirmations',
        explorerUrl,
        receivedAmount: receivedUsdt,
        receivedUsd: receivedUsdt,
        confirmations: 0,
        message: `Detected ${receivedUsdt.toFixed(2)} USDT (TRC20) on TRON. Waiting for block confirmation.`,
      };
    }
  } catch {
    // Fallback to TronGrid below
  }

  try {
    const resp = await fetch(
      `https://api.trongrid.io/v1/transactions/${encodeURIComponent(txHash)}/events`,
      { signal: AbortSignal.timeout(6500) }
    );
    if (resp.ok) {
      const json = (await resp.json()) as {
        data?: Array<{
          event_name?: string;
          contract_address?: string;
          result?: { to?: string; value?: string };
        }>;
      };
      const events = Array.isArray(json.data) ? json.data : [];
      if (events.length > 0) {
        const usdtEvents = events.filter(
          (ev) =>
            ev.event_name === 'Transfer' &&
            ev.contract_address === TRON_USDT_CONTRACT
        );
        if (usdtEvents.length > 0) {
          const totalUsdt = usdtEvents.reduce(
            (sum, ev) => sum + Number(ev.result?.value || 0) / 1e6,
            0
          );
          if (totalUsdt >= expectedUsd * 0.98) {
            return {
              outcome: 'pending_confirmations',
              explorerUrl,
              receivedAmount: totalUsdt,
              receivedUsd: totalUsdt,
              message: `USDT TRC20 transfer (${totalUsdt.toFixed(2)} USDT) detected on TronGrid. Click "Check On-Chain Confirmation" to finalize.`,
            };
          }
        }
      }
    }
  } catch {
    // Fall through
  }

  return {
    outcome: 'unverified_queue',
    explorerUrl,
    message:
      'TRON (TRC20) TXID recorded and queued for confirmation. Click "Check On-Chain Confirmation" in a few seconds.',
  };
}

export async function verifyOnChainCryptoPayment(params: {
  currency: CryptoCurrency;
  network: CryptoNetwork;
  txHash: string;
  expectedAddress: string;
  expectedAmountUsd: number;
}): Promise<OnChainVerifyResult> {
  if (params.currency === 'BTC' || params.network === 'BTC') {
    return verifyBtcOnChain(params.txHash, params.expectedAddress, params.expectedAmountUsd);
  }
  if (params.network === 'ERC20') {
    return verifyUsdtErc20OnChain(params.txHash, params.expectedAddress, params.expectedAmountUsd);
  }
  return verifyUsdtTrc20OnChain(params.txHash, params.expectedAddress, params.expectedAmountUsd);
}
