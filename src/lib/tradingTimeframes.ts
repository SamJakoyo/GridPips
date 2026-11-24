export const ANALYZER_TIMEFRAMES = ['1M', '5M', '15M', '30M', '1H', '4H', '1D', '1W'] as const;
export type AnalyzerTimeframe = (typeof ANALYZER_TIMEFRAMES)[number];

export type AssetClass = 'fx' | 'commodity' | 'index' | 'etf' | 'stock' | 'crypto';

export interface MarketCatalogItem {
  sym: string;
  tvSymbol: string;
  name: string;
  digits: number;
  assetClass: AssetClass;
  baselinePrice: number;
}

export const ASSET_CLASS_ORDER: AssetClass[] = [
  'fx',
  'commodity',
  'index',
  'etf',
  'stock',
  'crypto',
];

export const ASSET_CLASS_LABELS: Record<AssetClass, string> = {
  fx: 'Forex Pairs',
  commodity: 'Commodities',
  index: 'Indices',
  etf: 'ETFs',
  stock: 'Stocks',
  crypto: 'Crypto',
};

export const ASSET_CLASS_SHORT_LABELS: Record<AssetClass, string> = {
  fx: 'FX',
  commodity: 'CMDTY',
  index: 'INDEX',
  etf: 'ETF',
  stock: 'STOCK',
  crypto: 'CRYPTO',
};

export const MARKET_CATALOG: MarketCatalogItem[] = [
  // Forex Majors, Crosses & Exotics (21 pairs)
  { sym: 'EURUSD', tvSymbol: 'FX:EURUSD', name: 'Euro / US Dollar', digits: 5, assetClass: 'fx', baselinePrice: 1.0845 },
  { sym: 'GBPUSD', tvSymbol: 'FX:GBPUSD', name: 'British Pound / US Dollar', digits: 5, assetClass: 'fx', baselinePrice: 1.2945 },
  { sym: 'USDJPY', tvSymbol: 'FX:USDJPY', name: 'US Dollar / Japanese Yen', digits: 3, assetClass: 'fx', baselinePrice: 152.45 },
  { sym: 'USDCHF', tvSymbol: 'FX:USDCHF', name: 'US Dollar / Swiss Franc', digits: 5, assetClass: 'fx', baselinePrice: 0.8812 },
  { sym: 'AUDUSD', tvSymbol: 'FX:AUDUSD', name: 'Australian Dollar / US Dollar', digits: 5, assetClass: 'fx', baselinePrice: 0.6542 },
  { sym: 'USDCAD', tvSymbol: 'FX:USDCAD', name: 'US Dollar / Canadian Dollar', digits: 5, assetClass: 'fx', baselinePrice: 1.3895 },
  { sym: 'NZDUSD', tvSymbol: 'FX:NZDUSD', name: 'New Zealand Dollar / US Dollar', digits: 5, assetClass: 'fx', baselinePrice: 0.5985 },
  { sym: 'EURGBP', tvSymbol: 'FX:EURGBP', name: 'Euro / British Pound', digits: 5, assetClass: 'fx', baselinePrice: 0.8375 },
  { sym: 'EURJPY', tvSymbol: 'FX:EURJPY', name: 'Euro / Japanese Yen', digits: 3, assetClass: 'fx', baselinePrice: 165.32 },
  { sym: 'GBPJPY', tvSymbol: 'FX:GBPJPY', name: 'British Pound / Japanese Yen', digits: 3, assetClass: 'fx', baselinePrice: 197.45 },
  { sym: 'AUDJPY', tvSymbol: 'FX:AUDJPY', name: 'Australian Dollar / Japanese Yen', digits: 3, assetClass: 'fx', baselinePrice: 99.85 },
  { sym: 'CADJPY', tvSymbol: 'FX:CADJPY', name: 'Canadian Dollar / Japanese Yen', digits: 3, assetClass: 'fx', baselinePrice: 109.72 },
  { sym: 'CHFJPY', tvSymbol: 'FX:CHFJPY', name: 'Swiss Franc / Japanese Yen', digits: 3, assetClass: 'fx', baselinePrice: 173.15 },
  { sym: 'EURAUD', tvSymbol: 'FX:EURAUD', name: 'Euro / Australian Dollar', digits: 5, assetClass: 'fx', baselinePrice: 1.6562 },
  { sym: 'EURCAD', tvSymbol: 'FX:EURCAD', name: 'Euro / Canadian Dollar', digits: 5, assetClass: 'fx', baselinePrice: 1.5068 },
  { sym: 'EURCHF', tvSymbol: 'FX:EURCHF', name: 'Euro / Swiss Franc', digits: 5, assetClass: 'fx', baselinePrice: 0.9554 },
  { sym: 'GBPAUD', tvSymbol: 'FX:GBPAUD', name: 'British Pound / Australian Dollar', digits: 5, assetClass: 'fx', baselinePrice: 1.9785 },
  { sym: 'GBPCAD', tvSymbol: 'FX:GBPCAD', name: 'British Pound / Canadian Dollar', digits: 5, assetClass: 'fx', baselinePrice: 1.7995 },
  { sym: 'AUDCAD', tvSymbol: 'FX:AUDCAD', name: 'Australian Dollar / Canadian Dollar', digits: 5, assetClass: 'fx', baselinePrice: 0.9092 },
  { sym: 'USDMXN', tvSymbol: 'FX:USDMXN', name: 'US Dollar / Mexican Peso', digits: 4, assetClass: 'fx', baselinePrice: 19.952 },
  { sym: 'USDZAR', tvSymbol: 'FX:USDZAR', name: 'US Dollar / South African Rand', digits: 4, assetClass: 'fx', baselinePrice: 17.845 },

  // Commodities: Metals, Energy & Agriculture (10 instruments)
  { sym: 'XAUUSD', tvSymbol: 'OANDA:XAUUSD', name: 'Gold Spot / US Dollar', digits: 2, assetClass: 'commodity', baselinePrice: 2745.5 },
  { sym: 'XAGUSD', tvSymbol: 'OANDA:XAGUSD', name: 'Silver Spot / US Dollar', digits: 3, assetClass: 'commodity', baselinePrice: 33.42 },
  { sym: 'XPTUSD', tvSymbol: 'OANDA:XPTUSD', name: 'Platinum Spot / US Dollar', digits: 2, assetClass: 'commodity', baselinePrice: 1018.4 },
  { sym: 'XPDUSD', tvSymbol: 'OANDA:XPDUSD', name: 'Palladium Spot / US Dollar', digits: 2, assetClass: 'commodity', baselinePrice: 1092.5 },
  { sym: 'USOIL', tvSymbol: 'TVC:USOIL', name: 'WTI Crude Oil', digits: 2, assetClass: 'commodity', baselinePrice: 71.25 },
  { sym: 'UKOIL', tvSymbol: 'TVC:UKOIL', name: 'Brent Crude Oil', digits: 2, assetClass: 'commodity', baselinePrice: 75.1 },
  { sym: 'NATGAS', tvSymbol: 'OANDA:NATGASUSD', name: 'Natural Gas', digits: 3, assetClass: 'commodity', baselinePrice: 2.745 },
  { sym: 'COPPER', tvSymbol: 'OANDA:XCUUSD', name: 'Copper Spot', digits: 4, assetClass: 'commodity', baselinePrice: 4.385 },
  { sym: 'CORN', tvSymbol: 'OANDA:CORNUSD', name: 'Corn Futures Spot', digits: 3, assetClass: 'commodity', baselinePrice: 4.185 },
  { sym: 'WHEAT', tvSymbol: 'OANDA:WHEATUSD', name: 'Wheat Futures Spot', digits: 3, assetClass: 'commodity', baselinePrice: 5.74 },

  // Global Indices (6 instruments)
  { sym: 'NAS100', tvSymbol: 'CAPITALCOM:US100', name: 'US Tech 100 Index', digits: 2, assetClass: 'index', baselinePrice: 20480.5 },
  { sym: 'US30', tvSymbol: 'CAPITALCOM:US30', name: 'Wall Street 30', digits: 2, assetClass: 'index', baselinePrice: 42850.0 },
  { sym: 'SPX500', tvSymbol: 'CAPITALCOM:US500', name: 'S&P 500 Index', digits: 2, assetClass: 'index', baselinePrice: 5860.25 },
  { sym: 'US2000', tvSymbol: 'CAPITALCOM:RTY', name: 'Russell 2000 Index', digits: 2, assetClass: 'index', baselinePrice: 2245.4 },
  { sym: 'GER40', tvSymbol: 'CAPITALCOM:DE40', name: 'Germany 40 (DAX)', digits: 2, assetClass: 'index', baselinePrice: 19450.0 },
  { sym: 'UK100', tvSymbol: 'CAPITALCOM:UK100', name: 'FTSE 100 Index', digits: 2, assetClass: 'index', baselinePrice: 8290.5 },

  // Exchange-Traded Funds / ETFs (10 instruments)
  { sym: 'SPY', tvSymbol: 'AMEX:SPY', name: 'SPDR S&P 500 ETF Trust', digits: 2, assetClass: 'etf', baselinePrice: 584.2 },
  { sym: 'QQQ', tvSymbol: 'NASDAQ:QQQ', name: 'Invesco QQQ Trust (Nasdaq-100)', digits: 2, assetClass: 'etf', baselinePrice: 496.8 },
  { sym: 'IWM', tvSymbol: 'AMEX:IWM', name: 'iShares Russell 2000 ETF', digits: 2, assetClass: 'etf', baselinePrice: 222.4 },
  { sym: 'DIA', tvSymbol: 'AMEX:DIA', name: 'SPDR Dow Jones Industrial ETF', digits: 2, assetClass: 'etf', baselinePrice: 427.6 },
  { sym: 'VOO', tvSymbol: 'AMEX:VOO', name: 'Vanguard S&P 500 ETF', digits: 2, assetClass: 'etf', baselinePrice: 536.9 },
  { sym: 'GLD', tvSymbol: 'AMEX:GLD', name: 'SPDR Gold Shares ETF', digits: 2, assetClass: 'etf', baselinePrice: 253.4 },
  { sym: 'SLV', tvSymbol: 'AMEX:SLV', name: 'iShares Silver Trust ETF', digits: 2, assetClass: 'etf', baselinePrice: 30.65 },
  { sym: 'USO', tvSymbol: 'AMEX:USO', name: 'United States Oil Fund ETF', digits: 2, assetClass: 'etf', baselinePrice: 73.2 },
  { sym: 'TLT', tvSymbol: 'NASDAQ:TLT', name: 'iShares 20+ Year Treasury Bond ETF', digits: 2, assetClass: 'etf', baselinePrice: 93.45 },
  { sym: 'ARKK', tvSymbol: 'AMEX:ARKK', name: 'ARK Innovation ETF', digits: 2, assetClass: 'etf', baselinePrice: 48.9 },

  // Major US Stocks (14 instruments)
  { sym: 'AAPL', tvSymbol: 'NASDAQ:AAPL', name: 'Apple Inc.', digits: 2, assetClass: 'stock', baselinePrice: 231.4 },
  { sym: 'MSFT', tvSymbol: 'NASDAQ:MSFT', name: 'Microsoft Corporation', digits: 2, assetClass: 'stock', baselinePrice: 428.15 },
  { sym: 'NVDA', tvSymbol: 'NASDAQ:NVDA', name: 'NVIDIA Corporation', digits: 2, assetClass: 'stock', baselinePrice: 141.5 },
  { sym: 'TSLA', tvSymbol: 'NASDAQ:TSLA', name: 'Tesla Inc.', digits: 2, assetClass: 'stock', baselinePrice: 259.8 },
  { sym: 'AMZN', tvSymbol: 'NASDAQ:AMZN', name: 'Amazon.com Inc.', digits: 2, assetClass: 'stock', baselinePrice: 189.25 },
  { sym: 'GOOGL', tvSymbol: 'NASDAQ:GOOGL', name: 'Alphabet Inc. (Class A)', digits: 2, assetClass: 'stock', baselinePrice: 168.4 },
  { sym: 'META', tvSymbol: 'NASDAQ:META', name: 'Meta Platforms Inc.', digits: 2, assetClass: 'stock', baselinePrice: 579.6 },
  { sym: 'NFLX', tvSymbol: 'NASDAQ:NFLX', name: 'Netflix Inc.', digits: 2, assetClass: 'stock', baselinePrice: 754.2 },
  { sym: 'AMD', tvSymbol: 'NASDAQ:AMD', name: 'Advanced Micro Devices Inc.', digits: 2, assetClass: 'stock', baselinePrice: 156.9 },
  { sym: 'PLTR', tvSymbol: 'NASDAQ:PLTR', name: 'Palantir Technologies Inc.', digits: 2, assetClass: 'stock', baselinePrice: 44.8 },
  { sym: 'COIN', tvSymbol: 'NASDAQ:COIN', name: 'Coinbase Global Inc.', digits: 2, assetClass: 'stock', baselinePrice: 214.5 },
  { sym: 'JPM', tvSymbol: 'NYSE:JPM', name: 'JPMorgan Chase & Co.', digits: 2, assetClass: 'stock', baselinePrice: 224.3 },
  { sym: 'V', tvSymbol: 'NYSE:V', name: 'Visa Inc.', digits: 2, assetClass: 'stock', baselinePrice: 288.7 },
  { sym: 'BA', tvSymbol: 'NYSE:BA', name: 'The Boeing Company', digits: 2, assetClass: 'stock', baselinePrice: 155.4 },

  // Crypto Currencies (12 instruments)
  { sym: 'BTCUSD', tvSymbol: 'BITSTAMP:BTCUSD', name: 'Bitcoin / US Dollar', digits: 2, assetClass: 'crypto', baselinePrice: 68240.5 },
  { sym: 'ETHUSD', tvSymbol: 'BITSTAMP:ETHUSD', name: 'Ethereum / US Dollar', digits: 2, assetClass: 'crypto', baselinePrice: 2645.2 },
  { sym: 'SOLUSD', tvSymbol: 'COINBASE:SOLUSD', name: 'Solana / US Dollar', digits: 2, assetClass: 'crypto', baselinePrice: 174.8 },
  { sym: 'XRPUSD', tvSymbol: 'BITSTAMP:XRPUSD', name: 'XRP / US Dollar', digits: 4, assetClass: 'crypto', baselinePrice: 0.5425 },
  { sym: 'BNBUSD', tvSymbol: 'BINANCE:BNBUSDT', name: 'BNB / US Dollar', digits: 2, assetClass: 'crypto', baselinePrice: 598.4 },
  { sym: 'ADAUSD', tvSymbol: 'COINBASE:ADAUSD', name: 'Cardano / US Dollar', digits: 4, assetClass: 'crypto', baselinePrice: 0.356 },
  { sym: 'DOGEUSD', tvSymbol: 'COINBASE:DOGEUSD', name: 'Dogecoin / US Dollar', digits: 5, assetClass: 'crypto', baselinePrice: 0.1425 },
  { sym: 'AVAXUSD', tvSymbol: 'COINBASE:AVAXUSD', name: 'Avalanche / US Dollar', digits: 2, assetClass: 'crypto', baselinePrice: 27.4 },
  { sym: 'LINKUSD', tvSymbol: 'COINBASE:LINKUSD', name: 'Chainlink / US Dollar', digits: 3, assetClass: 'crypto', baselinePrice: 11.85 },
  { sym: 'LTCUSD', tvSymbol: 'BITSTAMP:LTCUSD', name: 'Litecoin / US Dollar', digits: 2, assetClass: 'crypto', baselinePrice: 71.2 },
  { sym: 'DOTUSD', tvSymbol: 'COINBASE:DOTUSD', name: 'Polkadot / US Dollar', digits: 3, assetClass: 'crypto', baselinePrice: 4.32 },
  { sym: 'SUIUSD', tvSymbol: 'COINBASE:SUIUSD', name: 'Sui / US Dollar', digits: 4, assetClass: 'crypto', baselinePrice: 1.945 },
];

export const MARKET_CATALOG_BY_SYM: Record<string, MarketCatalogItem> = Object.fromEntries(
  MARKET_CATALOG.map((item) => [item.sym, item])
);

export const MARKET_CATALOG_GROUPS: Array<{
  assetClass: AssetClass;
  label: string;
  items: MarketCatalogItem[];
}> = ASSET_CLASS_ORDER.map((assetClass) => ({
  assetClass,
  label: ASSET_CLASS_LABELS[assetClass],
  items: MARKET_CATALOG.filter((item) => item.assetClass === assetClass),
}));

export const TRADING_SYMBOLS = MARKET_CATALOG.map((item) => item.sym);

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
  const known = MARKET_CATALOG_BY_SYM[upper];
  if (known) return known.tvSymbol;
  if (upper === 'US100') return 'CAPITALCOM:US100';
  if (upper === 'US500') return 'CAPITALCOM:US500';
  if (upper === 'WTI' || upper === 'CL') return 'TVC:USOIL';
  if (upper === 'BRENT') return 'TVC:UKOIL';
  if (upper.endsWith('USDT')) return `BINANCE:${upper}`;
  if (upper.length <= 5 && /^[A-Z]+$/.test(upper)) return `NASDAQ:${upper}`;
  return `FX:${upper}`;
}
