import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  CandlestickSeries,
  ColorType,
  CrosshairMode,
  LineStyle,
  createChart,
  createSeriesMarkers,
  type IChartApi,
  type IPriceLine,
  type IPrimitivePaneRenderer,
  type IPrimitivePaneView,
  type ISeriesApi,
  type ISeriesPrimitive,
  type SeriesAttachedParameter,
  type SeriesMarker,
  type Time,
  type UTCTimestamp,
} from 'lightweight-charts';
import type { CanvasRenderingTarget2D } from 'fancy-canvas';
import { Copy, Check, Maximize2, Minimize2, RotateCcw } from 'lucide-react';
import type { DrtAnalysisResult, DrtZone } from '../types';

interface DrtMappedChartProps {
  analysis: DrtAnalysisResult;
  heightClass?: string;
}

interface DrtOverlayConfig {
  showQuadrants: boolean;
  showPdArrays: boolean;
  drh: number;
  q75: number;
  eq50: number;
  q25: number;
  drl: number;
  zones: Array<DrtZone & { startTimeSec: number }>;
  isDark: boolean;
}

class DrtOverlayRenderer implements IPrimitivePaneRenderer {
  private readonly getDrawData: () => {
    config: DrtOverlayConfig;
    chart: IChartApi;
    series: ISeriesApi<'Candlestick'>;
  } | null;

  constructor(
    getDrawData: () => {
      config: DrtOverlayConfig;
      chart: IChartApi;
      series: ISeriesApi<'Candlestick'>;
    } | null
  ) {
    this.getDrawData = getDrawData;
  }

  draw(target: CanvasRenderingTarget2D): void {
    const data = this.getDrawData();
    if (!data) return;
    const { config, chart, series } = data;
    const timeScale = chart.timeScale();

    target.useMediaCoordinateSpace(({ context: ctx, mediaSize }) => {
      const width = mediaSize.width;
      const height = mediaSize.height;
      if (width <= 0 || height <= 0) return;

      // 1. Ali Khan 4-Quadrant DRT Bands (0.00 / 0.25 / 0.50 / 0.75 / 1.00)
      if (config.showQuadrants) {
        const yDrh = series.priceToCoordinate(config.drh);
        const yQ75 = series.priceToCoordinate(config.q75);
        const yEq = series.priceToCoordinate(config.eq50);
        const yQ25 = series.priceToCoordinate(config.q25);
        const yDrl = series.priceToCoordinate(config.drl);

        const drawBand = (
          yA: number | null,
          yB: number | null,
          fill: string,
          label: string,
          labelColor: string,
          alignTop: boolean
        ) => {
          if (yA === null || yB === null) return;
          const topY = Math.max(0, Math.min(yA, yB));
          const botY = Math.min(height, Math.max(yA, yB));
          const bandH = botY - topY;
          if (bandH <= 2) return;
          ctx.fillStyle = fill;
          ctx.fillRect(0, topY, width, bandH);
          if (bandH >= 16) {
            ctx.font = '600 10px "JetBrains Mono", monospace';
            ctx.fillStyle = labelColor;
            ctx.textAlign = 'left';
            ctx.fillText(label, 10, alignTop ? topY + 13 : botY - 6);
          }
        };

        // Deep Premium (75–100% DRT)
        drawBand(
          yDrh,
          yQ75,
          config.isDark ? 'rgba(244, 63, 94, 0.11)' : 'rgba(244, 63, 94, 0.08)',
          'DEEP PREMIUM (75–100% DRT · SELL ARRAYS)',
          config.isDark ? 'rgba(253, 164, 175, 0.9)' : 'rgba(190, 18, 60, 0.9)',
          true
        );

        // Upper Premium (50–75% DRT)
        drawBand(
          yQ75,
          yEq,
          config.isDark ? 'rgba(249, 115, 22, 0.05)' : 'rgba(249, 115, 22, 0.05)',
          'UPPER PREMIUM (50–75% DRT)',
          config.isDark ? 'rgba(253, 186, 116, 0.85)' : 'rgba(194, 65, 12, 0.85)',
          true
        );

        // Lower Discount (25–50% DRT)
        drawBand(
          yEq,
          yQ25,
          config.isDark ? 'rgba(14, 165, 233, 0.05)' : 'rgba(14, 165, 233, 0.05)',
          'LOWER DISCOUNT (25–50% DRT)',
          config.isDark ? 'rgba(125, 211, 252, 0.85)' : 'rgba(3, 105, 161, 0.85)',
          false
        );

        // Deep Discount (0–25% DRT)
        drawBand(
          yQ25,
          yDrl,
          config.isDark ? 'rgba(16, 185, 129, 0.11)' : 'rgba(16, 185, 129, 0.08)',
          'DEEP DISCOUNT (0–25% DRT · BUY ARRAYS)',
          config.isDark ? 'rgba(134, 239, 172, 0.9)' : 'rgba(4, 120, 87, 0.9)',
          false
        );
      }

      // 2. DRT PD Array Boxes (FVGs, Order Blocks, Breakers, Rejections)
      if (config.showPdArrays) {
        const usedLabelYs: number[] = [];

        for (const z of config.zones) {
          const xCoord = timeScale.timeToCoordinate(z.startTimeSec as UTCTimestamp);
          const yTop = series.priceToCoordinate(z.top);
          const yBot = series.priceToCoordinate(z.bottom);
          const yCe = series.priceToCoordinate(z.ceMid);

          if (yTop === null || yBot === null) continue;
          const startX = xCoord !== null ? Math.max(0, xCoord) : 0;
          const boxWidth = width - startX;
          if (boxWidth <= 4) continue;

          const rectTop = Math.min(yTop, yBot);
          const rectHeight = Math.max(3, Math.abs(yBot - yTop));

          const isBreaker = z.type.includes('Breaker');
          const isRejection = z.type.includes('Rejection');
          const isBull = z.type.startsWith('Bullish');

          let fill = 'rgba(16, 185, 129, 0.16)';
          let stroke = 'rgba(16, 185, 129, 0.7)';
          let labelColor = config.isDark ? '#86efac' : '#047857';

          if (isBreaker) {
            fill = 'rgba(168, 85, 247, 0.15)';
            stroke = 'rgba(168, 85, 247, 0.7)';
            labelColor = config.isDark ? '#d8b4fe' : '#7e22ce';
          } else if (isRejection) {
            fill = 'rgba(245, 158, 11, 0.16)';
            stroke = 'rgba(245, 158, 11, 0.7)';
            labelColor = config.isDark ? '#fcd34d' : '#b45309';
          } else if (!isBull) {
            fill = 'rgba(244, 63, 94, 0.16)';
            stroke = 'rgba(244, 63, 94, 0.7)';
            labelColor = config.isDark ? '#fda4af' : '#be123c';
          }

          ctx.fillStyle = fill;
          ctx.fillRect(startX, rectTop, boxWidth, rectHeight);

          ctx.strokeStyle = stroke;
          ctx.lineWidth = 1;
          ctx.strokeRect(startX + 0.5, rectTop + 0.5, Math.max(1, boxWidth - 1), Math.max(1, rectHeight - 1));

          if (yCe !== null && rectHeight >= 10) {
            ctx.save();
            ctx.setLineDash([4, 4]);
            ctx.strokeStyle = stroke;
            ctx.beginPath();
            ctx.moveTo(startX, yCe);
            ctx.lineTo(width, yCe);
            ctx.stroke();
            ctx.restore();
          }

          let labelY = rectTop + 11;
          for (const prevY of usedLabelYs) {
            if (Math.abs(labelY - prevY) < 12) {
              labelY = prevY + 12;
            }
          }
          if (labelY > 10 && labelY < height - 6) {
            usedLabelYs.push(labelY);
            const shortLabel = `${z.type} · ${z.pdZone}${z.mitigated ? ' (Tested)' : ''}`;
            ctx.font = '600 10px "JetBrains Mono", monospace';
            ctx.fillStyle = labelColor;
            ctx.textAlign = 'right';
            ctx.fillText(shortLabel, width - 8, labelY);
          }
        }
      }
    });
  }
}

class DrtOverlayPaneView implements IPrimitivePaneView {
  private readonly rendererInstance: DrtOverlayRenderer;
  constructor(renderer: DrtOverlayRenderer) {
    this.rendererInstance = renderer;
  }
  zOrder(): 'bottom' | 'normal' | 'top' {
    return 'bottom';
  }
  renderer(): IPrimitivePaneRenderer | null {
    return this.rendererInstance;
  }
}

class DrtOverlayPrimitive implements ISeriesPrimitive<Time> {
  private chart: IChartApi | null = null;
  private series: ISeriesApi<'Candlestick'> | null = null;
  private requestUpdate: (() => void) | null = null;
  private config: DrtOverlayConfig;
  private readonly paneView: DrtOverlayPaneView;

  constructor(initialConfig: DrtOverlayConfig) {
    this.config = initialConfig;
    const renderer = new DrtOverlayRenderer(() => {
      if (!this.chart || !this.series) return null;
      return { config: this.config, chart: this.chart, series: this.series };
    });
    this.paneView = new DrtOverlayPaneView(renderer);
  }

  attached(param: SeriesAttachedParameter<Time>): void {
    this.chart = param.chart;
    this.series = param.series as ISeriesApi<'Candlestick'>;
    this.requestUpdate = param.requestUpdate;
    this.requestUpdate();
  }

  detached(): void {
    this.chart = null;
    this.series = null;
    this.requestUpdate = null;
  }

  updateConfig(next: DrtOverlayConfig): void {
    this.config = next;
    if (this.requestUpdate) {
      this.requestUpdate();
    }
  }

  paneViews(): readonly IPrimitivePaneView[] {
    return [this.paneView];
  }
}

function buildDrtPineScript(analysis: DrtAnalysisResult): string {
  const dr = analysis.dealingRange;
  const lines = [
    `//@version=5`,
    `indicator("GRIDPIPs DRT Dealing Range (${analysis.symbol} ${analysis.timeframe} · ${analysis.rangeType})", overlay=true)`,
    `drh100 = ${dr.drh}`,
    `drt75  = ${dr.q75}`,
    `drt50  = ${dr.eq50}`,
    `drt25  = ${dr.q25}`,
    `drl00  = ${dr.drl}`,
    `sdTarget = ${analysis.bias === 'Bullish' ? dr.sdPos25 : dr.sdNeg25}`,
    `slLevel  = ${analysis.setup.stopLoss}`,
    `tp1Level = ${analysis.setup.tp1}`,
    `tp2Level = ${analysis.setup.tp2}`,
    `p100 = plot(drh100, "1.00 DRH (BSL)", color=color.new(color.aqua, 10), style=plot.style_linebr)`,
    `p75  = plot(drt75,  "0.75 DRT Premium", color=color.new(color.orange, 10), linewidth=2, style=plot.style_linebr)`,
    `p50  = plot(drt50,  "0.50 DRT Equilibrium", color=color.new(color.white, 15), linewidth=2, style=plot.style_linebr)`,
    `p25  = plot(drt25,  "0.25 DRT Discount", color=color.new(color.orange, 10), linewidth=2, style=plot.style_linebr)`,
    `p00  = plot(drl00,  "0.00 DRL (SSL)", color=color.new(color.aqua, 10), style=plot.style_linebr)`,
    `fill(p100, p75, color=color.new(color.red, 90), title="Deep Premium (75-100%)")`,
    `fill(p25,  p00, color=color.new(color.green, 90), title="Deep Discount (0-25%)")`,
    `plot(sdTarget, "DRT ±0.25 SD Target", color=color.purple, style=plot.style_circles)`,
    `plot(slLevel,  "Stop Loss", color=color.red, linewidth=1, style=plot.style_linebr)`,
    `plot(tp1Level, "TP1 (50% EQ / 1.5R)", color=color.lime, linewidth=1, style=plot.style_linebr)`,
    `plot(tp2Level, "TP2 (External DRT)", color=color.teal, linewidth=1, style=plot.style_linebr)`,
  ];
  return lines.join('\n');
}

export const DrtMappedChart: React.FC<DrtMappedChartProps> = ({
  analysis,
  heightClass = 'h-[450px]',
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const seriesRef = useRef<ISeriesApi<'Candlestick'> | null>(null);
  const primitiveRef = useRef<DrtOverlayPrimitive | null>(null);
  const priceLinesRef = useRef<IPriceLine[]>([]);
  const markersPluginRef = useRef<ReturnType<typeof createSeriesMarkers<Time>> | null>(null);

  const [showQuadrants, setShowQuadrants] = useState(true);
  const [showPdArrays, setShowPdArrays] = useState(true);
  const [showTargets, setShowTargets] = useState(true);
  const [isDark, setIsDark] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const [copiedPine, setCopiedPine] = useState(false);

  const normalizedCandles = useMemo(() => {
    const out: Array<{
      time: UTCTimestamp;
      open: number;
      high: number;
      low: number;
      close: number;
      origIndex: number;
    }> = [];
    let lastTs = 0;
    const baseFallback = Math.floor(Date.now() / 1000) - analysis.candles.length * 900;
    for (let i = 0; i < analysis.candles.length; i++) {
      const c = analysis.candles[i];
      let ts =
        typeof c.timestampSec === 'number' && Number.isFinite(c.timestampSec)
          ? c.timestampSec
          : baseFallback + i * 900;
      if (ts <= lastTs) ts = lastTs + 60;
      lastTs = ts;
      out.push({
        time: ts as UTCTimestamp,
        open: c.open,
        high: c.high,
        low: c.low,
        close: c.close,
        origIndex: c.index,
      });
    }
    return out;
  }, [analysis.candles]);

  const latestCandle = normalizedCandles[normalizedCandles.length - 1];
  const [hoveredOhlc, setHoveredOhlc] = useState<{
    open: number;
    high: number;
    low: number;
    close: number;
  } | null>(null);

  const overlayConfig = useMemo<DrtOverlayConfig>(() => {
    const dr = analysis.dealingRange;
    const indexToTs = new Map<number, number>();
    for (const nc of normalizedCandles) {
      indexToTs.set(nc.origIndex, nc.time);
    }
    const fallbackTs = normalizedCandles[0]?.time ?? Math.floor(Date.now() / 1000);
    return {
      showQuadrants,
      showPdArrays,
      drh: dr.drh,
      q75: dr.q75,
      eq50: dr.eq50,
      q25: dr.q25,
      drl: dr.drl,
      zones: analysis.zones.map((z) => ({
        ...z,
        startTimeSec: indexToTs.get(z.startIndex) ?? fallbackTs,
      })),
      isDark,
    };
  }, [analysis, normalizedCandles, showQuadrants, showPdArrays, isDark]);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    const chart = createChart(el, {
      autoSize: true,
      layout: {
        background: { type: ColorType.Solid, color: '#090f1d' },
        textColor: '#94a3b8',
        fontFamily: '"JetBrains Mono", monospace',
        fontSize: 11,
      },
      grid: {
        vertLines: { color: 'rgba(30, 41, 59, 0.7)' },
        horzLines: { color: 'rgba(30, 41, 59, 0.7)' },
      },
      crosshair: { mode: CrosshairMode.Normal },
      rightPriceScale: {
        borderColor: '#1e293b',
        scaleMargins: { top: 0.1, bottom: 0.1 },
      },
      timeScale: {
        borderColor: '#1e293b',
        timeVisible: true,
        secondsVisible: false,
        rightOffset: 10,
      },
    });

    const candlestickSeries = chart.addSeries(CandlestickSeries, {
      upColor: '#10b981',
      downColor: '#f43f5e',
      borderVisible: false,
      wickUpColor: '#10b981',
      wickDownColor: '#f43f5e',
    });

    const primitive = new DrtOverlayPrimitive(overlayConfig);
    candlestickSeries.attachPrimitive(primitive);
    const markersPlugin = createSeriesMarkers<Time>(candlestickSeries, []);

    chart.subscribeCrosshairMove((param) => {
      if (!param.time || !param.seriesData) {
        setHoveredOhlc(null);
        return;
      }
      const bar = param.seriesData.get(candlestickSeries) as
        | { open?: number; high?: number; low?: number; close?: number }
        | undefined;
      if (bar && typeof bar.open === 'number' && typeof bar.close === 'number') {
        setHoveredOhlc({
          open: bar.open,
          high: bar.high ?? bar.open,
          low: bar.low ?? bar.close,
          close: bar.close,
        });
      } else {
        setHoveredOhlc(null);
      }
    });

    chartRef.current = chart;
    seriesRef.current = candlestickSeries;
    primitiveRef.current = primitive;
    markersPluginRef.current = markersPlugin;

    const resizeObserver =
      typeof ResizeObserver !== 'undefined'
        ? new ResizeObserver((entries) => {
            const entry = entries[0];
            if (!entry) return;
            const w = Math.floor(entry.contentRect.width);
            const h = Math.floor(entry.contentRect.height);
            if (w > 0 && h > 0) chart.resize(w, h);
          })
        : null;
    resizeObserver?.observe(el);

    return () => {
      resizeObserver?.disconnect();
      chart.remove();
      chartRef.current = null;
      seriesRef.current = null;
      primitiveRef.current = null;
      markersPluginRef.current = null;
      priceLinesRef.current = [];
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const chart = chartRef.current;
    if (!chart) return;
    chart.applyOptions({
      layout: {
        background: { type: ColorType.Solid, color: isDark ? '#090f1d' : '#ffffff' },
        textColor: isDark ? '#94a3b8' : '#334155',
      },
      grid: {
        vertLines: { color: isDark ? 'rgba(30, 41, 59, 0.7)' : 'rgba(226, 232, 240, 0.8)' },
        horzLines: { color: isDark ? 'rgba(30, 41, 59, 0.7)' : 'rgba(226, 232, 240, 0.8)' },
      },
      rightPriceScale: { borderColor: isDark ? '#1e293b' : '#e2e8f0' },
      timeScale: { borderColor: isDark ? '#1e293b' : '#e2e8f0' },
    });
  }, [isDark]);

  useEffect(() => {
    const chart = chartRef.current;
    const series = seriesRef.current;
    const primitive = primitiveRef.current;
    const markersPlugin = markersPluginRef.current;
    if (!chart || !series || !primitive) return;

    const priceStr = String(analysis.currentPrice);
    const precision = priceStr.includes('.')
      ? Math.min(6, Math.max(2, priceStr.split('.')[1]?.length ?? 2))
      : 2;
    const minMove = Number(Math.pow(10, -precision).toFixed(precision));

    series.applyOptions({
      priceFormat: { type: 'price', precision, minMove },
    });

    series.setData(
      normalizedCandles.map((c) => ({
        time: c.time,
        open: c.open,
        high: c.high,
        low: c.low,
        close: c.close,
      }))
    );

    for (const pl of priceLinesRef.current) {
      try {
        series.removePriceLine(pl);
      } catch {
        // ignore
      }
    }
    priceLinesRef.current = [];

    const addLine = (
      price: number,
      title: string,
      color: string,
      lineStyle: LineStyle,
      lineWidth: 1 | 2 | 3 | 4 = 1
    ) => {
      if (!Number.isFinite(price)) return;
      const pl = series.createPriceLine({
        price,
        color,
        lineWidth,
        lineStyle,
        axisLabelVisible: true,
        title,
      });
      priceLinesRef.current.push(pl);
    };

    const dr = analysis.dealingRange;
    if (showQuadrants) {
      addLine(dr.drh, '1.00 DRH', '#38bdf8', LineStyle.Solid, 1);
      addLine(dr.q75, '0.75 DRT', '#f97316', LineStyle.Dashed, 2);
      addLine(dr.eq50, '0.50 EQ', isDark ? '#e2e8f0' : '#0f172a', LineStyle.Dashed, 2);
      addLine(dr.q25, '0.25 DRT', '#f97316', LineStyle.Dashed, 2);
      addLine(dr.drl, '0.00 DRL', '#38bdf8', LineStyle.Solid, 1);

      if (
        typeof analysis.equalHighsLevel === 'number' &&
        Math.abs(analysis.equalHighsLevel - dr.drh) > minMove * 3
      ) {
        addLine(analysis.equalHighsLevel, 'EQH', '#fb7185', LineStyle.Dotted, 1);
      }
      if (
        typeof analysis.equalLowsLevel === 'number' &&
        Math.abs(analysis.equalLowsLevel - dr.drl) > minMove * 3
      ) {
        addLine(analysis.equalLowsLevel, 'EQL', '#34d399', LineStyle.Dotted, 1);
      }
    }

    if (showTargets) {
      addLine(analysis.setup.stopLoss, 'SL', '#f43f5e', LineStyle.Solid, 1);
      addLine(analysis.setup.tp1, 'TP1 (EQ/1.5R)', '#10b981', LineStyle.Dashed, 1);
      addLine(analysis.setup.tp2, 'TP2 (DRT)', '#059669', LineStyle.Dotted, 1);
      addLine(
        analysis.bias === 'Bullish' ? dr.sdPos25 : dr.sdNeg25,
        analysis.bias === 'Bullish' ? '+0.25 SD' : '-0.25 SD',
        '#a855f7',
        LineStyle.Dotted,
        1
      );
    }

    if (markersPlugin) {
      const markers: Array<SeriesMarker<Time>> = [];
      const idxMap = new Map(normalizedCandles.map((nc) => [nc.origIndex, nc]));

      if (typeof analysis.sweepIndex === 'number') {
        const bar = idxMap.get(analysis.sweepIndex);
        if (bar) {
          const isDrlSweep = analysis.sweepLabel.includes('DRL');
          markers.push({
            time: bar.time,
            position: isDrlSweep ? 'belowBar' : 'aboveBar',
            color: '#38bdf8',
            shape: isDrlSweep ? 'arrowUp' : 'arrowDown',
            text: isDrlSweep ? 'DRL Sweep' : 'DRH Sweep',
          });
        }
      }

      if (typeof analysis.flipIndex === 'number') {
        const bar = idxMap.get(analysis.flipIndex);
        if (bar) {
          const isBull = analysis.bias === 'Bullish';
          markers.push({
            time: bar.time,
            position: isBull ? 'belowBar' : 'aboveBar',
            color: '#f97316',
            shape: isBull ? 'arrowUp' : 'arrowDown',
            text: '50% DRT Flip',
          });
        }
      }

      markers.sort((a, b) => Number(a.time) - Number(b.time));
      markersPlugin.setMarkers(markers);
    }

    primitive.updateConfig(overlayConfig);
    chart.timeScale().fitContent();
  }, [analysis, normalizedCandles, overlayConfig, showQuadrants, showTargets, isDark]);

  useEffect(() => {
    if (!expanded) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setExpanded(false);
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [expanded]);

  const activeOhlc = hoveredOhlc || latestCandle;

  async function handleCopyPine() {
    try {
      await navigator.clipboard.writeText(buildDrtPineScript(analysis));
      setCopiedPine(true);
      setTimeout(() => setCopiedPine(false), 2500);
    } catch {
      setCopiedPine(false);
    }
  }

  return (
    <div
      className={
        expanded
          ? `fixed inset-3 sm:inset-5 z-50 rounded-xl overflow-hidden border shadow-2xl flex flex-col ${
              isDark ? 'border-slate-700 bg-[#090f1d] text-white' : 'border-slate-300 bg-white text-slate-950'
            }`
          : `rounded-xl overflow-hidden border flex flex-col ${
              isDark ? 'border-slate-800 bg-[#090f1d] text-white' : 'border-slate-200 bg-white text-slate-950'
            }`
      }
    >
      <div
        className={`px-4 py-3 border-b flex flex-wrap items-center justify-between gap-3 ${
          isDark ? 'border-slate-800 bg-slate-950/80' : 'border-slate-200 bg-slate-50'
        }`}
      >
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2 text-sm font-bold">
            <span>
              {analysis.tvSymbol} ({analysis.timeframe}) · {analysis.rangeType} DRT Map
            </span>
            <span aria-hidden="true" className={isDark ? 'text-slate-600' : 'text-slate-300'}>
              ·
            </span>
            <span className="font-mono tabular-nums">{analysis.currentPrice}</span>
            {activeOhlc && (
              <span
                className={`text-xs font-mono tabular-nums font-normal hidden sm:inline ${
                  isDark ? 'text-slate-400' : 'text-slate-500'
                }`}
              >
                O {activeOhlc.open} H {activeOhlc.high} L {activeOhlc.low} C {activeOhlc.close}
              </span>
            )}
          </div>
          <div className={`text-xs mt-0.5 ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>
            Ali Khan DRT 0.00 / 0.25 / 0.50 / 0.75 / 1.00 Quadrants, Premium/Discount PD Arrays, 50% Flip &amp; SD Targets
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-1.5">
          <button
            type="button"
            onClick={() => setShowQuadrants((v) => !v)}
            className={`px-2.5 py-1.5 text-xs font-semibold rounded-md border transition-colors cursor-pointer whitespace-nowrap shrink-0 ${
              showQuadrants
                ? isDark
                  ? 'border-orange-500/40 bg-orange-500/15 text-orange-300'
                  : 'border-orange-300 bg-orange-50 text-orange-800'
                : isDark
                ? 'border-slate-700 text-slate-400 hover:text-white'
                : 'border-slate-300 text-slate-600 hover:text-slate-950'
            }`}
          >
            DRT Quadrants
          </button>
          <button
            type="button"
            onClick={() => setShowPdArrays((v) => !v)}
            className={`px-2.5 py-1.5 text-xs font-semibold rounded-md border transition-colors cursor-pointer whitespace-nowrap shrink-0 ${
              showPdArrays
                ? isDark
                  ? 'border-emerald-500/40 bg-emerald-500/15 text-emerald-300'
                  : 'border-emerald-300 bg-emerald-50 text-emerald-800'
                : isDark
                ? 'border-slate-700 text-slate-400 hover:text-white'
                : 'border-slate-300 text-slate-600 hover:text-slate-950'
            }`}
          >
            PD Arrays
          </button>
          <button
            type="button"
            onClick={() => setShowTargets((v) => !v)}
            className={`px-2.5 py-1.5 text-xs font-semibold rounded-md border transition-colors cursor-pointer whitespace-nowrap shrink-0 ${
              showTargets
                ? isDark
                  ? 'border-purple-500/40 bg-purple-500/15 text-purple-300'
                  : 'border-purple-300 bg-purple-50 text-purple-800'
                : isDark
                ? 'border-slate-700 text-slate-400 hover:text-white'
                : 'border-slate-300 text-slate-600 hover:text-slate-950'
            }`}
          >
            SL / TP / SD
          </button>
          <button
            type="button"
            onClick={() => setIsDark((v) => !v)}
            className={`px-2.5 py-1.5 text-xs font-semibold rounded-md border transition-colors cursor-pointer whitespace-nowrap shrink-0 ${
              isDark
                ? 'border-slate-700 bg-slate-900 text-slate-200 hover:bg-slate-800'
                : 'border-slate-300 bg-white text-slate-700 hover:bg-slate-100'
            }`}
          >
            {isDark ? 'Light' : 'Dark'}
          </button>
          <button
            type="button"
            onClick={() => chartRef.current?.timeScale().fitContent()}
            className={`px-2.5 py-1.5 text-xs font-semibold rounded-md border inline-flex items-center gap-1 transition-colors cursor-pointer whitespace-nowrap shrink-0 ${
              isDark
                ? 'border-slate-700 bg-slate-900 text-slate-200 hover:bg-slate-800'
                : 'border-slate-300 bg-white text-slate-700 hover:bg-slate-100'
            }`}
          >
            <RotateCcw className="w-3.5 h-3.5" />
            <span>Fit</span>
          </button>
          <button
            type="button"
            onClick={handleCopyPine}
            className={`px-2.5 py-1.5 text-xs font-semibold rounded-md border inline-flex items-center gap-1 transition-colors cursor-pointer whitespace-nowrap shrink-0 ${
              copiedPine
                ? 'border-emerald-500/50 bg-emerald-500/20 text-emerald-300'
                : isDark
                ? 'border-slate-700 bg-slate-900 text-slate-200 hover:bg-slate-800'
                : 'border-slate-300 bg-white text-slate-700 hover:bg-slate-100'
            }`}
          >
            {copiedPine ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
            <span>{copiedPine ? 'DRT Pine Copied' : 'Copy DRT Pine'}</span>
          </button>
          <button
            type="button"
            onClick={() => setExpanded((v) => !v)}
            className={`px-2.5 py-1.5 text-xs font-semibold rounded-md border inline-flex items-center gap-1 transition-colors cursor-pointer whitespace-nowrap shrink-0 ${
              isDark
                ? 'border-slate-700 bg-slate-900 text-slate-200 hover:bg-slate-800'
                : 'border-slate-300 bg-white text-slate-700 hover:bg-slate-100'
            }`}
          >
            {expanded ? <Minimize2 className="w-3.5 h-3.5" /> : <Maximize2 className="w-3.5 h-3.5" />}
            <span>{expanded ? 'Exit' : 'Wide'}</span>
          </button>
        </div>
      </div>

      <div
        ref={containerRef}
        className={expanded ? 'flex-1 w-full min-h-0' : `w-full ${heightClass}`}
      />

      <div
        className={`px-4 py-2.5 border-t flex flex-wrap items-center justify-between gap-2 text-xs ${
          isDark ? 'border-slate-800 bg-slate-950/60 text-slate-400' : 'border-slate-200 bg-slate-50 text-slate-600'
        }`}
      >
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
          <span>Orange dashed: 0.25 DRT &amp; 0.75 DRT</span>
          <span>White dashed: 0.50 DRT Equilibrium</span>
          <span>Cyan solid: 1.00 DRH / 0.00 DRL</span>
          <span>Purple dotted: ±0.25 SD Target</span>
        </div>
        <span className="font-mono text-[11px] opacity-80">DRT Quadrant Chart · TradingView Lightweight</span>
      </div>
    </div>
  );
};
