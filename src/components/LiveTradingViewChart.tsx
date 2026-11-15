import React, { useEffect, useRef, useState } from 'react';
import { Maximize2, Minimize2 } from 'lucide-react';
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
  heightClass = 'aspect-[16/9] min-h-[420px] max-h-[78vh]',
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const [expanded, setExpanded] = useState(false);

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

  useEffect(() => {
    if (!expanded) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setExpanded(false);
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [expanded]);

  return (
    <div
      className={
        expanded
          ? `fixed inset-3 sm:inset-5 z-50 rounded-xl overflow-hidden border shadow-2xl ${
              theme === 'dark' ? 'border-slate-700 bg-slate-950' : 'border-slate-300 bg-white'
            }`
          : `relative w-full ${heightClass} rounded-lg overflow-hidden border ${
              theme === 'dark' ? 'border-slate-800 bg-slate-950' : 'border-slate-200 bg-white'
            }`
      }
    >
      <button
        type="button"
        onClick={() => setExpanded((v) => !v)}
        title={expanded ? 'Exit landscape fullscreen (Esc)' : 'Expand landscape chart'}
        className={`absolute top-2.5 right-2.5 z-20 inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-md text-xs font-semibold border transition-colors cursor-pointer ${
          theme === 'dark'
            ? 'bg-slate-900/90 border-slate-700 text-slate-200 hover:bg-slate-800'
            : 'bg-white/90 border-slate-300 text-slate-800 hover:bg-slate-100'
        }`}
      >
        {expanded ? (
          <>
            <Minimize2 className="w-3.5 h-3.5" />
            <span>Exit Wide</span>
          </>
        ) : (
          <>
            <Maximize2 className="w-3.5 h-3.5" />
            <span>Wide View</span>
          </>
        )}
      </button>

      <div ref={containerRef} className="w-full h-full" />
    </div>
  );
};

