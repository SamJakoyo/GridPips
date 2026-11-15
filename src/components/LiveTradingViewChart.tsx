import React, { useEffect, useRef } from 'react';
import { resolveTradingViewSymbol, toTradingViewInterval } from '../lib/tradingTimeframes';

interface LiveTradingViewChartProps {
  symbol: string;
  timeframe: string;
  theme?: 'light' | 'dark';
  heightClass?: string;
}

export const LiveTradingViewChart: React.FC<LiveTradingViewChartProps> = ({
  symbol,
  timeframe,
  theme = 'dark',
  heightClass = 'h-[440px]',
}) => {
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    el.innerHTML = '';

    const widgetContainer = document.createElement('div');
    widgetContainer.className = 'tradingview-widget-container';
    widgetContainer.style.width = '100%';
    widgetContainer.style.height = '100%';

    const widgetInner = document.createElement('div');
    widgetInner.className = 'tradingview-widget-container__widget';
    widgetInner.style.width = '100%';
    widgetInner.style.height = '100%';
    widgetContainer.appendChild(widgetInner);

    const script = document.createElement('script');
    script.src = 'https://s3.tradingview.com/external-embedding/embed-widget-advanced-chart.js';
    script.type = 'text/javascript';
    script.async = true;
    script.innerHTML = JSON.stringify({
      autosize: true,
      symbol: resolveTradingViewSymbol(symbol),
      interval: toTradingViewInterval(timeframe),
      timezone: 'Etc/UTC',
      theme,
      style: '1',
      locale: 'en',
      enable_publishing: false,
      allow_symbol_change: false,
      hide_side_toolbar: false,
      support_host: 'https://www.tradingview.com',
    });

    widgetContainer.appendChild(script);
    el.appendChild(widgetContainer);
  }, [symbol, timeframe, theme]);

  return (
    <div
      ref={containerRef}
      className={`w-full ${heightClass} rounded-lg overflow-hidden border ${
        theme === 'dark' ? 'border-slate-800 bg-slate-950' : 'border-slate-200 bg-white'
      }`}
    />
  );
};
