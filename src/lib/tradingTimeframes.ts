export const ANALYZER_TIMEFRAMES = ['1M', '5M', '15M', '30M', '1H', '4H', '1D', '1W'] as const;
export type AnalyzerTimeframe = (typeof ANALYZER_TIMEFRAMES)[number];

export const TRADING_SYMBOLS = [
  'EURUSD',
  'GBPUSD',
  'USDJPY',
  'XAUUSD',
  'NAS100',
  'US30',
  'BTCUSD',
  'ETHUSD',
] as const;

export function normalizeAnalyzerTimeframe(raw?: string): AnalyzerTimeframe {
  const upper = (raw || '1M').trim().toUpperCase();
  const aliasMap: Record<string, AnalyzerTimeframe> = {
    '1M': '1M',
    M1: '1M',
    '5M': '5M',
    M5: '5M',
    '15M': '15M',
    M15: '15M',
    '30M': '30M',
    M30: '30M',
    '1H': '1H',
    H1: '1H',
    '4H': '4H',
    H4: '4H',
    '1D': '1D',
    D1: '1D',
    '1W': '1W',
    W1: '1W',
  };
  return aliasMap[upper] || '1M';
}

export function toTradingViewInterval(tf: string): string {
  const norm = normalizeAnalyzerTimeframe(tf);
  switch (norm) {
    case '1M':
      return '1';
    case '5M':
      return '5';
    case '15M':
      return '15';
    case '30M':
      return '30';
    case '1H':
      return '60';
    case '4H':
      return '240';
    case '1D':
      return 'D';
    case '1W':
      return 'W';
    default:
      return '1';
  }
}

export function resolveTradingViewSymbol(sym: string): string {
  const upper = sym.trim().toUpperCase();
  if (upper.includes(':')) return upper;
  if (upper === 'XAUUSD' || upper === 'XAGUSD') return `OANDA:${upper}`;
  if (upper === 'NAS100' || upper === 'US100') return 'CAPITALCOM:US100';
  if (upper === 'US30') return 'CAPITALCOM:US30';
  if (upper === 'SPX500' || upper === 'US500') return 'CAPITALCOM:US500';
  if (upper === 'BTCUSD' || upper === 'ETHUSD') return `BITSTAMP:${upper}`;
  return `FX:${upper}`;
}
