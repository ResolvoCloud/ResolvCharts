/**
 * Chart type discriminator.
 * @category Charts
 */
export type ChartType =
  | "line"
  | "area"
  | "bar"
  | "combo"
  | "sparkline"
  | "scatter"
  | "bubble"
  | "rangearea"
  | "donut"
  | "pie"
  | "radar"
  | "funnel"
  | "candle"
  | "ohlc"
  | "waterfall"
  | "baseline";

/**
 * Color/typography tokens used to render a chart.
 * @category Theming
 */
export interface ThemeTokens {
  bg: string;
  text: string;
  textMuted: string;
  grid: string;
  axisBaseline: string;
  crosshair: string;
  series: string[];
  contextGray: string;
  /** Candlestick/financial up color */
  up: string;
  /** Candlestick/financial down color */
  down: string;
  tooltipBg: string;
  tooltipText: string;
  tooltipMuted: string;
  tooltipBorder: string;
  tooltipShadow: string;
  fontFamily: string;
}

/**
 * One series of an xy chart. `null`/`NaN`/non-finite values are treated as
 * missing data and rendered as gaps.
 * @category Data
 */
export interface SeriesInput {
  label?: string;
  color?: string;
  y: ArrayLike<number | null>;
  /** For `bubble`: per-point radius value, scaled to a pixel range. */
  r?: ArrayLike<number | null>;
  /** For `rangearea`: upper band edge; `y` is the lower edge. */
  y2?: ArrayLike<number | null>;
}

/** Data for xy charts (line, area, scatter, bubble, rangearea, sparkline, baseline). `x` may be unsorted — it is sorted internally; non-finite `x` values are dropped.
 * @category Data
 */
export interface XYData {
  x: ArrayLike<number | null>;
  series: SeriesInput[];
}

/**
 * Per-series render style inside a `combo` chart.
 * @category Charts
 */
export type CategorySeriesKind = "column" | "line" | "area";

/**
 * One series of a categorical chart.
 * @category Data
 */
export interface CategorySeriesInput {
  label?: string;
  color?: string;
  /** For `combo`: how this series renders (default `"column"`). */
  kind?: CategorySeriesKind;
  /** `null`/`NaN` values are treated as missing (no mark drawn). */
  values: ArrayLike<number | null>;
}

/**
 * Data for `bar`, `combo`, `radar` and `funnel` charts (one entry per `categories` element).
 * @category Data
 */
export interface CategoryData {
  categories: string[];
  series: CategorySeriesInput[];
}

/**
 * One donut slice.
 * @category Data
 */
export interface DonutSlice {
  label: string;
  value: number;
  color?: string;
}

/**
 * Data for `donut` and `pie` charts.
 * @category Data
 */
export interface DonutData {
  slices: DonutSlice[];
}

/**
 * One OHLC candle. `x` is typically an epoch timestamp.
 * @category Data
 */
export interface OHLCCandle {
  x: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume?: number;
}

/**
 * Data for `candle` and `ohlc` charts.
 * @category Data
 */
export interface OHLCData {
  candles: OHLCCandle[];
}

/**
 * Data for `waterfall` charts.
 * @category Data
 */
export interface WaterfallData {
  categories: string[];
  /** Delta per category; entries listed in `totals` render as absolute columns. */
  values: ArrayLike<number>;
  /** Indices into `categories` that are absolute totals (e.g. start/end/subtotal). */
  totals?: number[];
}

/** Union of all per-type data shapes; the chart picks the matching member by `options.type`.
 * @category Data
 */
export type ChartData =
  | XYData
  | CategoryData
  | DonutData
  | OHLCData
  | WaterfallData;

/**
 * Segment interpolation: straight lines, step, monotone cubic (`smooth`, never
 * overshoots), or distance-weighted cubic (`cubic`, Chart.js-style splines that
 * may overshoot, shaped by {@link ChartOptions.tension}).
 * @category Charts
 */
export type CurveMode = "linear" | "step" | "smooth" | "cubic";

/**
 * Payload passed to `ChartOptions.onHover`.
 * @category Charts
 */
export type HoverInfo =
  | {
      kind: "point";
      index: number;
      x: number;
      px: number;
      py: number;
      values: { label: string; color: string; y: number }[];
      /** Tooltip title override (e.g. category name on `combo` charts). */
      title?: string;
    }
  | {
      kind: "bar";
      category: string;
      seriesIndex: number;
      label: string;
      color: string;
      value: number;
      px: number;
      py: number;
      rect: Rect;
    }
  | {
      kind: "slice";
      index: number;
      label: string;
      color: string;
      value: number;
      share: number;
      px: number;
      py: number;
    }
  | {
      kind: "candle";
      index: number;
      x: number;
      open: number;
      high: number;
      low: number;
      close: number;
      px: number;
      py: number;
    };

/** One row in the default tooltip layout.
 * @category Charts
 */
export interface TooltipRow {
  color?: string;
  label: string;
  value: string;
}

/** Return type for {@link TooltipOptions.format}.
 * @category Charts
 */
export interface TooltipContent {
  /** Bold header line (default: the hit's x/category label). */
  title?: string;
  /** Rows rendered with the default layout. */
  rows?: TooltipRow[];
  /** Raw HTML replacing the whole tooltip body. */
  html?: string;
}

/**
 * Custom tooltip content. `formatters` exposes the chart's active x/y label
 * formatters. Return `null` to suppress the tooltip for this hit, a string
 * for plain-text content, or a {@link TooltipContent} object.
 * @category Charts
 */
export type TooltipFormatter = (
  info: HoverInfo,
  formatters: { x: (v: number) => string; y: (v: number) => string },
) => TooltipContent | string | null;

/**
 * Tooltip customization — pass as `tooltip: { ... }` in {@link ChartOptions}.
 * @category Charts
 */
export interface TooltipOptions {
  /**
   * Corner radius of the tooltip box. Number = px, string = any CSS
   * border-radius value (`"0"`, `"2px 6px"`, `"50%"`). Default `6px`.
   */
  radius?: number | string;
  /** Custom content builder — see {@link TooltipFormatter}. */
  format?: TooltipFormatter;
}

/**
 * Legend display. Click an item to toggle its series (unless
 * `toggle: false`).
 * @category Charts
 */
export interface LegendOptions {
  /** Edge the legend sits on. Default `"bottom"`. */
  position?: "top" | "bottom" | "left" | "right";
  /** Click-to-toggle series visibility. Default `true`. */
  toggle?: boolean;
}

/**
 * Zoom/pan interactions on numeric-x charts (xy + ohlc data). The view is
 * released by double-click or {@link Chart.resetZoom}.
 * @category Charts
 */
export interface ZoomOptions {
  /** Mouse-wheel zoom around the cursor. Default `true`. */
  wheel?: boolean;
  /**
   * Drag gesture: `"select"` draws a zoom box (default), `"pan"` drags the
   * viewport, `false` disables dragging.
   */
  drag?: "select" | "pan" | false;
  /** Axes zoom/pan affects. Default `"x"`. */
  axes?: "x" | "y" | "xy";
  /** Double-click resets the view. Default `true`. */
  dblclick?: boolean;
  /** Called whenever the view override changes (`null` after reset). */
  onZoom?: (view: { x: [number, number]; y: [number, number] } | null) => void;
}

/**
 * Options accepted by {@link createChart}.
 * @category Charts
 */
export interface ChartOptions {
  type: ChartType;
  data: ChartData;
  theme?: "light" | "dark" | Partial<ThemeTokens>;
  /** Accent color applied to the first series. */
  accent?: string;
  curve?: CurveMode;
  /**
   * Spline tension 0–1 for `curve: "cubic"` — `0` draws straight lines,
   * `1` is a very loose curve. Default `0.4` (Chart.js parity).
   */
  tension?: number;
  grid?: boolean;
  /**
   * `true`/`false` toggles the tooltip, or pass an object to customize it —
   * e.g. `{ radius: 0 }` for sharp corners (px number or CSS length).
   */
  tooltip?: boolean | TooltipOptions;
  /**
   * Series legend — `true` shows it at the bottom, or pass
   * {@link LegendOptions} to position it. Click an item to hide/show its
   * series (disable with `toggle: false`).
   */
  legend?: boolean | LegendOptions;
  /**
   * Zoom/pan for numeric-x charts — `true` enables wheel zoom + drag-select
   * + double-click reset, or pass {@link ZoomOptions}.
   */
  zoom?: boolean | ZoomOptions;
  /** `true` = 400 ms ease, a number = custom duration in ms, `false` = off. */
  animate?: boolean | number;
  /**
   * Continuous-flow mode for xy charts: points ease toward their targets with
   * a slight right-to-left ripple so transitions read as a wave, not a snap.
   * Unless `animate` is a number, the tween duration auto-follows the measured
   * `append()` cadence (EMA), so the pan finishes exactly as the next sample
   * arrives — perpetual motion, zero lag.
   */
  flow?: boolean;
  /**
   * For xy charts: number of points visible in the sliding window during
   * `append()`. Older points are dropped FIFO (see `maxPoints` for the
   * retention cap).
   */
  window?: number;
  /**
   * For xy charts: hard cap on retained datapoints during `append()` —
   * memory bound for live mode. A few extra points may be kept transiently so
   * dropped points slide off-screen smoothly. When `window` is unset, the
   * view shows the last `maxPoints`.
   */
  maxPoints?: number;

  /**
   * Render backend for xy series (line/area/sparkline/scatter). `"canvas"`
   * uses Canvas2D. `"webgpu"` rasterizes series on the GPU — instanced
   * lines, point sprites, compute decimation — while axes, grid, and
   * tooltips stay on Canvas2D. `"auto"` (default) engages WebGPU once the
   * point count crosses `gpuThreshold`, else Canvas2D.
   * Unknown to older browsers → silent fallback to Canvas2D.
   */
  renderer?: "auto" | "canvas" | "webgpu";
  /**
   * For `renderer: "auto"`: total visible xy points (x-length × series) at
   * which the GPU path engages. Below this, Canvas2D is faster. Once the
   * GPU attaches it stays attached for the chart's lifetime.
   * Default: 100,000.
   */
  gpuThreshold?: number;
  /**
   * WebGPU adapter options — only used when `renderer` resolves to WebGPU.
   * `powerPreference` picks the discrete GPU on dual-GPU systems;
   * `compat` requests compatibility mode (GLES 3.1 / D3D11 reach);
   * `timing` enables GPU-side pass timing via "timestamp-query" when the
   * adapter supports it (note: browsers require cross-origin isolation and
   * quantize to ~100 µs — dev/profiling use only);
   * `allowFallback` accepts software adapters like SwiftShader (off by
   * default — usually slower than Canvas2D).
   */
  gpu?: {
    powerPreference?: "default" | "low-power" | "high-performance";
    compat?: boolean;
    timing?: boolean;
    allowFallback?: boolean;
  };
  /**
   * Canvas2D context settings passed to `getContext("2d", …)` for all layers.
   * e.g. `{ willReadFrequently: true }` measurably cuts submit cost in Chrome
   * (~2×) by forcing CPU rasterization — useful for small/dense charts;
   * leave unset (default `{ alpha: true }`) to keep GPU compositing.
   * @category Charts
   */
  canvas?: CanvasRenderingContext2DSettings;
  /** For `bar`: stack series per category instead of grouping. */
  stacked?: boolean;
  /** For `baseline`: reference value the line is compared against (default: first point). */
  baseline?: number;
  /** Fixed CSS height in px; defaults to element height or 240 (32 for sparkline). */
  height?: number;
  /** Axis tick label formatters. */
  labels?: {
    x?: (v: number) => string;
    y?: (v: number) => string;
  };
  /**
   * Pin the y-axis domain. Each bound overrides the auto-fitted value —
   * unset ends still auto-fit. E.g. `{ yMin: 0, yMax: 100 }` frames a
   * utilization chart honestly; `{ yMin: 0 }` zero-anchors without a
   * ceiling. Values exceeding the bounds are clipped at the plot edge.
   */
  yMin?: number;
  yMax?: number;
  /**
   * X-axis scale for xy/ohlc charts: `"linear"` (default), `"time"` places
   * ticks on calendar boundaries (x = epoch ms), `"log"` maps values
   * logarithmically (x must be positive).
   */
  xScale?: "linear" | "time" | "log";
  /** Y-axis scale: `"linear"` (default) or `"log"` (values must be positive; non-positive values render as gaps). */
  yScale?: "linear" | "log";
  /** Logarithm base for `log` scales. Default `10`. */
  logBase?: number;
  /** Called on pointer hover with the nearest hit, or `null` on leave. */
  onHover?: (info: HoverInfo | null) => void;
  /** Called on click/tap with the hit under the cursor, or `null` on empty space. */
  onClick?: (info: HoverInfo | null, ev: PointerEvent) => void;
  /**
   * Called when the persistent selection changes — a click on a mark selects
   * it (and draws a marker), a click on empty space clears it.
   */
  onSelect?: (info: HoverInfo | null) => void;
}

/** Rectangle in pixel space.
 * @category Types
 */
export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

/** Domain→range scale function returned by {@link linearScale}.
 * @category Utilities
 */
export interface Scale {
  (v: number): number;
  invert(px: number): number;
  domain: readonly [number, number];
  range: readonly [number, number];
}

export interface NormalizedSeries {
  label: string;
  color: string;
  y: Float64Array;
  prevY: Float64Array | null;
  /** `y` contains NaN gaps — selects the gap-aware decimate path. */
  hasGaps?: boolean;
  /**
   * Sorted indices of `y` positions that break the path (non-finite, or
   * non-positive under `yScale: "log"`). Lets the decimator iterate finite
   * runs verbatim instead of checking every point.
   */
  gapIdx?: number[] | undefined;
  /**
   * `log_b(y)` copy maintained under `yScale: "log"` (NaN where `y` is
   * non-finite or non-positive — the same positions as `gapIdx`). Feeding
   * display-space values to the decimator turns every per-point `Math.log`
   * into a plain affine multiply.
   */
  yLog?: Float64Array | undefined;
  /** Log-space twin of `prevY` — carried alongside it, never recomputed. */
  prevYLog?: Float64Array | null;
  /** `bubble` radius channel (aligned to `sortedX`). */
  r: Float64Array | null;
  /** `rangearea` upper edge. */
  y2: Float64Array | null;
  prevY2: Float64Array | null;
  /** Log-space twins of `y2`/`prevY2` (rangearea, `yScale: "log"` only). */
  y2Log?: Float64Array | null;
  prevY2Log?: Float64Array | null;
  /**
   * Render memo: decimated+traced Path2D (plus the fill area and pixel
   * bounds) for the last-rendered (view, t, curve, scales) key. Series
   * objects are recreated on setData/append, so staleness only needs the
   * scale/view key — see {@link renderLine}.
   */
  pathCache: {
    key: string;
    path: Path2D;
    area?: Path2D | undefined;
    x0: number;
    x1: number;
    y0: number;
    y1: number;
  } | null;
}

export interface NormalizedXY {
  kind: "xy";
  sortedX: Float64Array;
  /** `log_b(sortedX)` under `xScale: "log"` — see {@link NormalizedSeries.yLog}. */
  sortedXLog?: Float64Array | undefined;
  series: NormalizedSeries[];
}

export interface NormalizedCategory {
  kind: "category";
  categories: string[];
  series: {
    label: string;
    color: string;
    kind: CategorySeriesKind;
    values: Float64Array;
    prevValues: Float64Array | null;
    /** `values` contains NaN gaps. */
    hasGaps?: boolean;
  }[];
}

export interface NormalizedDonut {
  kind: "donut";
  slices: { label: string; value: number; color: string }[];
  total: number;
}

export interface NormalizedOHLC {
  kind: "ohlc";
  x: Float64Array;
  open: Float64Array;
  high: Float64Array;
  low: Float64Array;
  close: Float64Array;
  volume: Float64Array | null;
}

export interface WaterfallBar {
  /** Running-total start (bottom edge in value space). */
  start: number;
  /** Running-total end (top edge). For totals: start=0, end=value. */
  end: number;
  /** Signed delta, or absolute value for totals. */
  value: number;
  total: boolean;
}

export interface NormalizedWaterfall {
  kind: "waterfall";
  categories: string[];
  bars: WaterfallBar[];
}

export type NormalizedData =
  | NormalizedXY
  | NormalizedCategory
  | NormalizedDonut
  | NormalizedOHLC
  | NormalizedWaterfall;
