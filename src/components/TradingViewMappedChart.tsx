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
import type { IctAnalysisResult, IctZone } from '../types';

interface TradingViewMappedChartProps {
  analysis: IctAnalysisResult;
  heightClass?: string;
}

interface OverlayConfig {
  showPremiumDiscount: boolean;
  showPdArrays: boolean;
  rangeHigh: number;
  rangeLow: number;
  equilibrium: number;
  oteHigh: number;
  oteLow: number;
  oteZoneLabel: string;
  zones: Array<IctZone & { startTimeSec: number }>;
  isDark: boolean;
}

class IctOverlayRenderer implements IPrimitivePaneRenderer {
  private readonly getDrawData: () => {
    config: OverlayConfig;
    chart: IChartApi;
    series: ISeriesApi<'Candlestick'>;
  } | null;

  constructor(
    getDrawData: () => {
      config: OverlayConfig;
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

      // 1. Premium & Discount Background Regions + OTE Band
      if (config.showPremiumDiscount) {
        const yHigh = series.priceToCoordinate(config.rangeHigh);
        const yEq = series.priceToCoordinate(config.equilibrium);
        const yLow = series.priceToCoordinate(config.rangeLow);

        if (yHigh !== null && yEq !== null) {
          const topY = Math.max(0, Math.min(yHigh, yEq));
          const botY = Math.min(height, Math.max(yHigh, yEq));
          if (botY > topY) {
            ctx.fillStyle = config.isDark ? 'rgba(244, 63, 94, 0.08)' : 'rgba(244, 63, 94, 0.07)';
            ctx.fillRect(0, topY, width, botY - topY);

            ctx.font = '600 10px "JetBrains Mono", monospace';
            ctx.fillStyle = config.isDark ? 'rgba(253, 164, 175, 0.85)' : 'rgba(190, 18, 60, 0.85)';
            ctx.textAlign = 'left';
            ctx.fillText('PREMIUM ZONE (>50% EQ)', 10, topY + 14);
          }
        }

        if (yEq !== null && yLow !== null) {
          const topY = Math.max(0, Math.min(yEq, yLow));
          const botY = Math.min(height, Math.max(yEq, yLow));
          if (botY > topY) {
            ctx.fillStyle = config.isDark ? 'rgba(16, 185, 129, 0.08)' : 'rgba(16, 185, 129, 0.07)';
            ctx.fillRect(0, topY, width, botY - topY);

            ctx.font = '600 10px "JetBrains Mono", monospace';
            ctx.fillStyle = config.isDark ? 'rgba(134, 239, 172, 0.85)' : 'rgba(4, 120, 87, 0.85)';
            ctx.textAlign = 'left';
            ctx.fillText('DISCOUNT ZONE (<50% EQ)', 10, botY - 8);
          }
        }

        const yOteHigh = series.priceToCoordinate(config.oteHigh);
        const yOteLow = series.priceToCoordinate(config.oteLow);
        if (yOteHigh !== null && yOteLow !== null) {
          const oteTop = Math.min(yOteHigh, yOteLow);
          const oteH = Math.abs(yOteLow - yOteHigh);
          if (oteH >= 2) {
            ctx.fillStyle = 'rgba(245, 158, 11, 0.09)';
            ctx.fillRect(0, oteTop, width, oteH);
            ctx.font = '600 9px "JetBrains Mono", monospace';
            ctx.fillStyle = config.isDark ? 'rgba(251, 191, 36, 0.85)' : 'rgba(180, 83, 9, 0.85)';
            ctx.textAlign = 'left';
            ctx.fillText(`OTE 0.618–0.786 (${config.oteZoneLabel})`, 10, oteTop + Math.min(12, Math.max(9, oteH - 2)));
          }
        }
      }

      // 2. PD Array Boxes (FVGs, Order Blocks, Breakers, Rejections, Liquidity Voids)
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

          const isBreakerOrVoid = z.type.includes('Breaker') || z.type === 'Liquidity Void';
          const isRejection = z.type.includes('Rejection');
          const isBull = z.type.startsWith('Bullish');

          let fill = 'rgba(34, 197, 94, 0.16)';
          let stroke = 'rgba(34, 197, 94, 0.65)';
          let labelColor = config.isDark ? '#86efac' : '#15803d';

          if (isBreakerOrVoid) {
            fill = 'rgba(168, 85, 247, 0.15)';
            stroke = 'rgba(168, 85, 247, 0.65)';
            labelColor = config.isDark ? '#d8b4fe' : '#7e22ce';
          } else if (isRejection) {
            fill = 'rgba(245, 158, 11, 0.16)';
            stroke = 'rgba(245, 158, 11, 0.65)';
            labelColor = config.isDark ? '#fcd34d' : '#b45309';
          } else if (!isBull) {
            fill = 'rgba(244, 63, 94, 0.16)';
            stroke = 'rgba(244, 63, 94, 0.65)';
            labelColor = config.isDark ? '#fda4af' : '#be123c';
          }

          ctx.fillStyle = fill;
          ctx.fillRect(startX, rectTop, boxWidth, rectHeight);

          ctx.strokeStyle = stroke;
          ctx.lineWidth = 1;
          ctx.strokeRect(startX + 0.5, rectTop + 0.5, Math.max(1, boxWidth - 1), Math.max(1, rectHeight - 1));

          // 50% Consequent Encroachment / Mean Threshold dashed midline
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

          // Clean non-overlapping label on the right side of the box
          let labelY = rectTop + 11;
          for (const prevY of usedLabelYs) {
            if (Math.abs(labelY - prevY) < 12) {
              labelY = prevY + 12;
            }
          }
          if (labelY > 10 && labelY < height - 6) {
            usedLabelYs.push(labelY);
            const shortLabel = `${z.type}${z.pdZone ? ` · ${z.pdZone}` : ''}${z.mitigated ? ' (Tested)' : ''}`;
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

class IctOverlayPaneView implements IPrimitivePaneView {
  private readonly rendererInstance: IctOverlayRenderer;

  constructor(renderer: IctOverlayRenderer) {
    this.rendererInstance = renderer;
  }

  zOrder(): 'bottom' | 'normal' | 'top' {
    return 'bottom';
  }

  renderer(): IPrimitivePaneRenderer | null {
    return this.rendererInstance;
  }
}

class IctOverlayPrimitive implements ISeriesPrimitive<Time> {
  private chart: IChartApi | null = null;
  private series: ISeriesApi<'Candlestick'> | null = null;
  private requestUpdate: (() => void) | null = null;
  private config: OverlayConfig;
  private readonly paneView: IctOverlayPaneView;

  constructor(initialConfig: OverlayConfig) {
    this.config = initialConfig;
    const renderer = new IctOverlayRenderer(() => {
      if (!this.chart || !this.series) return null;
      return {
        config: this.config,
        chart: this.chart,
        series: this.series,
      };
    });
    this.paneView = new IctOverlayPaneView(renderer);
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

  updateConfig(next: OverlayConfig): void {
    this.config = next;
    if (this.requestUpdate) {
      this.requestUpdate();
    }
  }

  paneViews(): readonly IPrimitivePaneView[] {
    return [this.paneView];
  }
}

function buildPineScriptOverlay(analysis: IctAnalysisResult): string {
  const pd = analysis.premiumDiscount;
  const eq = pd?.equilibrium ?? (analysis.bslLevel + analysis.sslLevel) / 2;
  const rHigh = pd?.rangeHigh ?? analysis.bslLevel;
  const rLow = pd?.rangeLow ?? analysis.sslLevel;
  const bullFvgs = analysis.zones.filter((z) => z.type === 'Bullish FVG').slice(-2);
  const bearFvgs = analysis.zones.filter((z) => z.type === 'Bearish FVG').slice(-2);
  const hasActiveExecution =
    analysis.tradeVerdict !== 'No Trade' &&
    analysis.setup.stopLoss != null &&
    analysis.setup.tp1 != null &&
    analysis.setup.tp2 != null;

  const lines = [
    `//@version=5`,
    `indicator("GRIDPIPs ICT PD Arrays (${analysis.symbol} ${analysis.timeframe})", overlay=true)`,
    `// Verdict: ${analysis.verdictHeadline || analysis.tradeVerdict}`,
    `rangeHigh = ${rHigh}`,
    `rangeLow  = ${rLow}`,
    `eq50      = ${eq}`,
    `ote618    = ${analysis.oteLevels.fib618}`,
    `ote705    = ${analysis.oteLevels.fib705}`,
    `ote786    = ${analysis.oteLevels.fib786}`,
    ...(hasActiveExecution
      ? [
          `slLevel   = ${analysis.setup.stopLoss}`,
          `tp1Level  = ${analysis.setup.tp1}`,
          `tp2Level  = ${analysis.setup.tp2}`,
        ]
      : [`// Execution levels locked (No Trade — confluence gate failed)`]),
    `pHigh = plot(rangeHigh, "BSL / Premium High", color=color.new(color.aqua, 15), style=plot.style_linebr)`,
    `pEq   = plot(eq50,      "50% Equilibrium",    color=color.new(color.white, 20), style=plot.style_linebr)`,
    `pLow  = plot(rangeLow,  "SSL / Discount Low", color=color.new(color.aqua, 15), style=plot.style_linebr)`,
    `fill(pHigh, pEq, color=color.new(color.red, 92), title="Premium Zone")`,
    `fill(pEq, pLow,  color=color.new(color.green, 92), title="Discount Zone")`,
    `plot(ote705,   "OTE 0.705", color=color.amber, linewidth=2, style=plot.style_circles)`,
    ...(hasActiveExecution
      ? [
          `plot(slLevel,  "Stop Loss", color=color.red,   linewidth=1, style=plot.style_linebr)`,
          `plot(tp1Level, "TP1 (Partial)", color=color.green, linewidth=1, style=plot.style_linebr)`,
          `plot(tp2Level, "TP2 (External DOL)", color=color.teal,  linewidth=1, style=plot.style_linebr)`,
        ]
      : []),
    ...bullFvgs.map(
      (z, i) =>
        `hline(${z.ceMid}, "Bullish FVG CE #${i + 1} (${z.bottom}-${z.top})", color=color.new(color.lime, 30), linestyle=hline.style_dashed)`
    ),
    ...bearFvgs.map(
      (z, i) =>
        `hline(${z.ceMid}, "Bearish FVG CE #${i + 1} (${z.bottom}-${z.top})", color=color.new(color.fuchsia, 30), linestyle=hline.style_dashed)`
    ),
  ];
  return lines.join('\n');
}

export const TradingViewMappedChart: React.FC<TradingViewMappedChartProps> = ({
  analysis,
  heightClass = 'h-[470px]',
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const seriesRef = useRef<ISeriesApi<'Candlestick'> | null>(null);
  const primitiveRef = useRef<IctOverlayPrimitive | null>(null);
  const priceLinesRef = useRef<IPriceLine[]>([]);
  const markersPluginRef = useRef<ReturnType<typeof createSeriesMarkers<Time>> | null>(null);

  const [showPremiumDiscount, setShowPremiumDiscount] = useState(true);
  const [showPdArrays, setShowPdArrays] = useState(true);
  const [showExecutionLevels, setShowExecutionLevels] = useState(true);
  const [isDark, setIsDark] = useState(true);
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
      let ts = typeof c.timestampSec === 'number' && Number.isFinite(c.timestampSec) ? c.timestampSec : baseFallback + i * 900;
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

  const overlayConfig = useMemo<OverlayConfig>(() => {
    const pd = analysis.premiumDiscount;
    const rHigh = pd?.rangeHigh ?? analysis.bslLevel;
    const rLow = pd?.rangeLow ?? analysis.sslLevel;
    const eq = pd?.equilibrium ?? (rHigh + rLow) / 2;

    const indexToTs = new Map<number, number>();
    for (const nc of normalizedCandles) {
      indexToTs.set(nc.origIndex, nc.time);
    }
    const fallbackTs = normalizedCandles[0]?.time ?? Math.floor(Date.now() / 1000);

    return {
      showPremiumDiscount,
      showPdArrays,
      rangeHigh: rHigh,
      rangeLow: rLow,
      equilibrium: eq,
      oteHigh: Math.max(analysis.oteLevels.fib618, analysis.oteLevels.fib786),
      oteLow: Math.min(analysis.oteLevels.fib618, analysis.oteLevels.fib786),
      oteZoneLabel: analysis.oteLevels.zone || (analysis.dailyBias === 'Bullish' ? 'Discount' : 'Premium'),
      zones: analysis.zones.map((z) => ({
        ...z,
        startTimeSec: indexToTs.get(z.startIndex) ?? fallbackTs,
      })),
      isDark,
    };
  }, [analysis, normalizedCandles, showPremiumDiscount, showPdArrays, isDark]);

  // Create chart once
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
      crosshair: {
        mode: CrosshairMode.Normal,
      },
      rightPriceScale: {
        borderColor: '#1e293b',
        scaleMargins: { top: 0.08, bottom: 0.08 },
      },
      timeScale: {
        borderColor: '#1e293b',
        timeVisible: true,
        secondsVisible: false,
        rightOffset: 10,
      },
    });

    const candlestickSeries = chart.addSeries(CandlestickSeries, {
      upColor: '#22c55e',
      downColor: '#f43f5e',
      borderVisible: false,
      wickUpColor: '#22c55e',
      wickDownColor: '#f43f5e',
    });

    const primitive = new IctOverlayPrimitive(overlayConfig);
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
            if (w > 0 && h > 0) {
              chart.resize(w, h);
            }
          })
        : null;
    if (resizeObserver) {
      resizeObserver.observe(el);
    }

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

  // Update theme dynamically
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
      rightPriceScale: {
        borderColor: isDark ? '#1e293b' : '#e2e8f0',
      },
      timeScale: {
        borderColor: isDark ? '#1e293b' : '#e2e8f0',
      },
    });
  }, [isDark]);

  // Update candle series, price format precision, price lines, markers, and canvas overlays
  useEffect(() => {
    const chart = chartRef.current;
    const series = seriesRef.current;
    const primitive = primitiveRef.current;
    const markersPlugin = markersPluginRef.current;
    if (!chart || !series || !primitive) return;

    const priceStr = String(analysis.currentPrice);
    const precision = priceStr.includes('.') ? Math.min(6, Math.max(2, priceStr.split('.')[1]?.length ?? 2)) : 2;
    const minMove = Number(Math.pow(10, -precision).toFixed(precision));

    series.applyOptions({
      priceFormat: {
        type: 'price',
        precision,
        minMove,
      },
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

    // Clear previous price lines
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

    const pd = analysis.premiumDiscount;
    const eqPrice = pd?.equilibrium ?? (analysis.bslLevel + analysis.sslLevel) / 2;

    if (showPremiumDiscount) {
      addLine(analysis.bslLevel, 'BSL / Range High', '#38bdf8', LineStyle.Dashed, 1);
      addLine(analysis.sslLevel, 'SSL / Range Low', '#38bdf8', LineStyle.Dashed, 1);
      addLine(eqPrice, 'EQ 50%', isDark ? '#e2e8f0' : '#0f172a', LineStyle.Dashed, 2);
      addLine(analysis.oteLevels.fib705, 'OTE 0.705', '#f59e0b', LineStyle.Dotted, 1);

      if (
        typeof analysis.equalHighsLevel === 'number' &&
        Math.abs(analysis.equalHighsLevel - analysis.bslLevel) > minMove * 3
      ) {
        addLine(analysis.equalHighsLevel, 'EQH Liquidity', '#fb7185', LineStyle.Dotted, 1);
      }
      if (
        typeof analysis.equalLowsLevel === 'number' &&
        Math.abs(analysis.equalLowsLevel - analysis.sslLevel) > minMove * 3
      ) {
        addLine(analysis.equalLowsLevel, 'EQL Liquidity', '#34d399', LineStyle.Dotted, 1);
      }
    }

    if (
      showExecutionLevels &&
      analysis.tradeVerdict !== 'No Trade' &&
      analysis.setup.stopLoss != null &&
      analysis.setup.tp1 != null &&
      analysis.setup.tp2 != null
    ) {
      const isWait = analysis.tradeVerdict === 'Wait for Setup';
      addLine(analysis.setup.stopLoss, isWait ? 'SL (Limit)' : 'SL', '#f43f5e', LineStyle.Solid, 1);
      addLine(analysis.setup.tp1, isWait ? 'TP1 (Limit)' : 'TP1 (Partial)', '#10b981', LineStyle.Dashed, 1);
      addLine(analysis.setup.tp2, isWait ? 'TP2 DOL (Limit)' : 'TP2 (DOL)', '#059669', LineStyle.Dotted, 1);
    }

    // Candle markers for MSS & Liquidity Sweep
    if (markersPlugin) {
      const markers: Array<SeriesMarker<Time>> = [];
      const idxMap = new Map(normalizedCandles.map((nc) => [nc.origIndex, nc]));

      if (typeof analysis.sweepIndex === 'number') {
        const bar = idxMap.get(analysis.sweepIndex);
        if (bar) {
          const isBullSweep = analysis.liquiditySweep?.includes('SSL');
          markers.push({
            time: bar.time,
            position: isBullSweep ? 'belowBar' : 'aboveBar',
            color: '#38bdf8',
            shape: isBullSweep ? 'arrowUp' : 'arrowDown',
            text: isBullSweep ? 'SSL Sweep' : 'BSL Sweep',
          });
        }
      }

      if (typeof analysis.mssIndex === 'number') {
        const bar = idxMap.get(analysis.mssIndex);
        if (bar) {
          const isBullMss = analysis.structureShift.toLowerCase().includes('bullish');
          markers.push({
            time: bar.time,
            position: isBullMss ? 'belowBar' : 'aboveBar',
            color: isBullMss ? '#22c55e' : '#f43f5e',
            shape: isBullMss ? 'arrowUp' : 'arrowDown',
            text: isBullMss ? 'Bull MSS' : 'Bear MSS',
          });
        }
      }

      markers.sort((a, b) => Number(a.time) - Number(b.time));
      markersPlugin.setMarkers(markers);
    }

    primitive.updateConfig(overlayConfig);
    chart.timeScale().fitContent();
  }, [
    analysis,
    normalizedCandles,
    overlayConfig,
    showPremiumDiscount,
    showExecutionLevels,
    isDark,
  ]);

  useEffect(() => {
    if (!expanded) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setExpanded(false);
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [expanded]);

  const activeOhlc = hoveredOhlc || latestCandle;

  async function handleCopyPineScript() {
    const script = buildPineScriptOverlay(analysis);
    try {
      await navigator.clipboard.writeText(script);
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
      {/* Interactive TradingView Mapped Toolbar */}
      <div
        className={`px-4 py-3 border-b flex flex-wrap items-center justify-between gap-3 ${
          isDark ? 'border-slate-800 bg-slate-950/80' : 'border-slate-200 bg-slate-50'
        }`}
      >
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2 text-sm font-bold">
            <span>
              {analysis.tvSymbol || analysis.symbol} ({analysis.timeframe})
            </span>
            <span aria-hidden="true" className={isDark ? 'text-slate-600' : 'text-slate-300'}>
              ·
            </span>
            <span className="font-mono tabular-nums">{analysis.currentPrice}</span>
            <span
              className={`text-[11px] font-mono font-bold uppercase tracking-wider px-2 py-0.5 rounded border ${
                analysis.tradeVerdict === 'Actionable Trade'
                  ? 'border-emerald-500/40 bg-emerald-500/15 text-[#16E563]'
                  : analysis.tradeVerdict === 'Wait for Setup'
                  ? 'border-amber-500/40 bg-amber-500/15 text-[#F5B82E]'
                  : 'border-rose-500/40 bg-rose-500/15 text-rose-400'
              }`}
            >
              {analysis.tradeVerdict === 'Actionable Trade'
                ? 'Actionable'
                : analysis.tradeVerdict === 'Wait for Setup'
                ? 'Wait / Limit Only'
                : 'No Trade · Stand Aside'}
            </span>
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
            {analysis.tradeVerdict === 'No Trade'
              ? 'Live TradingView OHLC with Premium/Discount & PD Arrays mapped · Execution SL/TP lines hidden (No Trade)'
              : 'Live TradingView OHLC with mapped Premium/Discount zones, 50% Equilibrium, FVGs, Order Blocks, Breakers & SL/TP'}
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-1.5">
          <button
            type="button"
            onClick={() => setShowPremiumDiscount((v) => !v)}
            className={`px-2.5 py-1.5 text-xs font-semibold rounded-md border transition-colors cursor-pointer whitespace-nowrap shrink-0 ${
              showPremiumDiscount
                ? isDark
                  ? 'border-emerald-500/40 bg-emerald-500/15 text-emerald-300'
                  : 'border-emerald-300 bg-emerald-50 text-emerald-800'
                : isDark
                ? 'border-slate-700 text-slate-400 hover:text-white'
                : 'border-slate-300 text-slate-600 hover:text-slate-950'
            }`}
          >
            Premium/Discount
          </button>
          <button
            type="button"
            onClick={() => setShowPdArrays((v) => !v)}
            className={`px-2.5 py-1.5 text-xs font-semibold rounded-md border transition-colors cursor-pointer whitespace-nowrap shrink-0 ${
              showPdArrays
                ? isDark
                  ? 'border-blue-500/40 bg-blue-500/15 text-blue-300'
                  : 'border-blue-300 bg-blue-50 text-blue-800'
                : isDark
                ? 'border-slate-700 text-slate-400 hover:text-white'
                : 'border-slate-300 text-slate-600 hover:text-slate-950'
            }`}
          >
            PD Arrays
          </button>
          <button
            type="button"
            onClick={() => setShowExecutionLevels((v) => !v)}
            className={`px-2.5 py-1.5 text-xs font-semibold rounded-md border transition-colors cursor-pointer whitespace-nowrap shrink-0 ${
              showExecutionLevels
                ? isDark
                  ? 'border-amber-500/40 bg-amber-500/15 text-amber-300'
                  : 'border-amber-300 bg-amber-50 text-amber-800'
                : isDark
                ? 'border-slate-700 text-slate-400 hover:text-white'
                : 'border-slate-300 text-slate-600 hover:text-slate-950'
            }`}
          >
            SL / TP
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
            title="Reset zoom & fit all candles"
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
            onClick={handleCopyPineScript}
            title="Copy Pine Script v5 script with these exact levels to paste into TradingView.com"
            className={`px-2.5 py-1.5 text-xs font-semibold rounded-md border inline-flex items-center gap-1 transition-colors cursor-pointer whitespace-nowrap shrink-0 ${
              copiedPine
                ? 'border-emerald-500/50 bg-emerald-500/20 text-emerald-300'
                : isDark
                ? 'border-slate-700 bg-slate-900 text-slate-200 hover:bg-slate-800'
                : 'border-slate-300 bg-white text-slate-700 hover:bg-slate-100'
            }`}
          >
            {copiedPine ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
            <span>{copiedPine ? 'Pine Copied' : 'Copy Pine'}</span>
          </button>
          <button
            type="button"
            onClick={() => setExpanded((v) => !v)}
            title={expanded ? 'Exit fullscreen (Esc)' : 'Expand chart'}
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

      {/* TradingView Lightweight Charts Interactive Canvas */}
      <div
        ref={containerRef}
        className={expanded ? 'flex-1 w-full min-h-0' : `w-full ${heightClass}`}
      />

      {/* Crisp Footer Legend */}
      <div
        className={`px-4 py-2.5 border-t flex flex-wrap items-center justify-between gap-2 text-xs ${
          isDark ? 'border-slate-800 bg-slate-950/60 text-slate-400' : 'border-slate-200 bg-slate-50 text-slate-600'
        }`}
      >
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
          <span>Red tint (&gt;50%): Premium</span>
          <span>Green tint (&lt;50%): Discount</span>
          <span>Green / Red boxes: Bullish / Bearish FVG &amp; OB</span>
          <span>Purple / Amber boxes: Breaker, Void &amp; Rejection</span>
          <span>Drag to pan · Scroll to zoom · Crosshair for exact prices</span>
        </div>
        <span className="font-mono text-[11px] opacity-80">Powered by TradingView Lightweight Charts</span>
      </div>
    </div>
  );
};
