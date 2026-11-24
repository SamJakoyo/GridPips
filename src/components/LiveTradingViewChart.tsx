import React, { useEffect, useMemo, useState } from 'react';
import { ArrowUpRight, Maximize2, Minimize2, RefreshCw } from 'lucide-react';
import { resolveTradingViewSymbol, toTradingViewInterval } from '../lib/tradingTimeframes';

interface LiveTradingViewChartProps {
  symbol: string;
  timeframe: string;
  theme?: 'light' | 'dark';
  heightClass?: string;
}

const TV_WIDGET_HOSTS = [
  'https://www.tradingview-widget.com',
  'https://s.tradingview.com',
] as const;

export const LiveTradingViewChart: React.FC<LiveTradingViewChartProps> = ({
  symbol,
  timeframe,
  theme = 'dark',
  heightClass = 'h-[460px]',
}) => {
  const [expanded, setExpanded] = useState(false);
  const [hostIdx, setHostIdx] = useState(0);
  const [reloadNonce, setReloadNonce] = useState(0);
  const [loaded, setLoaded] = useState(false);

  const tvSymbol = resolveTradingViewSymbol(symbol);
  const tvInterval = toTradingViewInterval(timeframe);
  const host = TV_WIDGET_HOSTS[hostIdx] || TV_WIDGET_HOSTS[0];

  const iframeSrc = useMemo(() => {
    const pageHost =
      typeof window !== 'undefined' && window.location.hostname
        ? window.location.hostname
        : 'www.gridpips.com';
    const pageUri =
      typeof window !== 'undefined' && window.location.href
        ? window.location.href
        : 'https://www.gridpips.com/';

    const hashSettings = {
      autosize: true,
      width: '100%',
      height: '100%',
      symbol: tvSymbol,
      interval: tvInterval,
      timezone: 'Etc/UTC',
      theme,
      style: '1',
      enable_publishing: false,
      allow_symbol_change: false,
      hide_side_toolbar: false,
      hide_top_toolbar: false,
      save_image: false,
      support_host: 'https://www.tradingview.com',
      'page-uri': pageUri,
      utm_source: pageHost,
      utm_medium: 'widget',
      utm_campaign: 'chart',
    };

    return `${host}/embed-widget/advanced-chart/?locale=en#${encodeURIComponent(
      JSON.stringify(hashSettings)
    )}`;
  }, [host, tvSymbol, tvInterval, theme]);

  // Reset loaded state whenever symbol, timeframe, theme, host, or reload changes
  useEffect(() => {
    setLoaded(false);
  }, [iframeSrc, reloadNonce]);

  // Automatic failover to TradingView secondary CDN mirror if primary embed doesn't fire onLoad within 6.5s
  useEffect(() => {
    if (loaded || hostIdx > 0) return;
    const timer = setTimeout(() => {
      setHostIdx(1);
    }, 6500);
    return () => clearTimeout(timer);
  }, [loaded, hostIdx, iframeSrc]);

  useEffect(() => {
    if (!expanded) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setExpanded(false);
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [expanded]);

  const directTvUrl = `https://www.tradingview.com/chart/?symbol=${encodeURIComponent(tvSymbol)}`;

  return (
    <div
      className={
        expanded
          ? `fixed inset-3 sm:inset-5 z-50 rounded-xl overflow-hidden border shadow-2xl ${
              theme === 'dark' ? 'border-emerald-500/30 bg-[#050907]' : 'border-slate-300 bg-white'
            }`
          : `relative w-full ${heightClass} min-h-[360px] rounded-lg overflow-hidden border ${
              theme === 'dark' ? 'border-emerald-500/20 bg-[#050907]' : 'border-slate-200 bg-white'
            }`
      }
    >
      {!loaded && (
        <div
          className={`absolute inset-0 z-10 flex flex-col items-center justify-center gap-2 text-xs ${
            theme === 'dark' ? 'bg-[#070D0A] text-slate-300' : 'bg-slate-50 text-slate-600'
          }`}
        >
          <RefreshCw className="w-4 h-4 animate-spin text-[#16E563]" />
          <span>
            Connecting live TradingView chart ({tvSymbol} · {timeframe})...
          </span>
        </div>
      )}

      <iframe
        key={`${iframeSrc}:${reloadNonce}`}
        src={iframeSrc}
        title={`${tvSymbol} ${timeframe} TradingView Chart`}
        loading="eager"
        allow="fullscreen"
        onLoad={() => setLoaded(true)}
        onError={() => {
          if (hostIdx === 0) {
            setHostIdx(1);
          }
        }}
        className="absolute inset-0 w-full h-full border-0 block"
      />

      {/* Compact non-intrusive bottom toolbar for reliability & fullscreen */}
      <div className="absolute bottom-2.5 right-2.5 z-20 flex items-center gap-1.5">
        <button
          type="button"
          onClick={() => {
            setHostIdx((prev) => (prev === 0 ? 1 : 0));
            setReloadNonce((n) => n + 1);
          }}
          title="Switch TradingView CDN server / reload widget"
          className={`inline-flex items-center gap-1 px-2 py-1 rounded-md text-[11px] font-semibold border transition-colors cursor-pointer ${
            theme === 'dark'
              ? 'bg-slate-900/90 border-slate-700 text-slate-300 hover:bg-slate-800'
              : 'bg-white/90 border-slate-300 text-slate-700 hover:bg-slate-100'
          }`}
        >
          <RefreshCw className="w-3 h-3" />
          <span>{hostIdx === 0 ? 'Reload' : 'Mirror 2'}</span>
        </button>

        <a
          href={directTvUrl}
          target="_blank"
          rel="noopener noreferrer"
          title="Open chart directly on TradingView.com"
          className={`inline-flex items-center gap-1 px-2 py-1 rounded-md text-[11px] font-semibold border transition-colors ${
            theme === 'dark'
              ? 'bg-slate-900/90 border-slate-700 text-slate-300 hover:bg-slate-800'
              : 'bg-white/90 border-slate-300 text-slate-700 hover:bg-slate-100'
          }`}
        >
          <span>TradingView</span>
          <ArrowUpRight className="w-3 h-3" />
        </a>

        <button
          type="button"
          onClick={() => setExpanded((v) => !v)}
          title={expanded ? 'Exit landscape fullscreen (Esc)' : 'Expand landscape chart'}
          className={`inline-flex items-center gap-1 px-2 py-1 rounded-md text-[11px] font-semibold border transition-colors cursor-pointer ${
            theme === 'dark'
              ? 'bg-slate-900/90 border-slate-700 text-slate-200 hover:bg-slate-800'
              : 'bg-white/90 border-slate-300 text-slate-800 hover:bg-slate-100'
          }`}
        >
          {expanded ? (
            <>
              <Minimize2 className="w-3 h-3" />
              <span>Exit Wide</span>
            </>
          ) : (
            <>
              <Maximize2 className="w-3 h-3" />
              <span>Wide View</span>
            </>
          )}
        </button>
      </div>
    </div>
  );
};
