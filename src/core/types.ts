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
  | "donut"
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
 * One series of an xy chart.
 * @category Data
 */
export interface SeriesInput {
  label?: string;
  color?: string;
  y: ArrayLike<number>;
}

/** Data for xy charts (line, area, scatter, sparkline, baseline). `x` may be unsorted — it is sorted internally.
 * @category Data
 */
export interface XYData {
  x: ArrayLike<number>;
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
  values: ArrayLike<number>;
}

/**
 * Data for `bar` and `combo` charts (one entry per `categories` element).
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
 * Data for `donut` charts.
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
 * Segment interpolation: straight lines, step, or monotone cubic.
 * @category Charts
 */
export type CurveMode = "linear" | "step" | "smooth";

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
  grid?: boolean;
  tooltip?: boolean;
  legend?: boolean;
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
   * (default) uses Canvas2D. `"webgpu"` rasterizes series on the GPU —
   * instanced lines and point sprites — while axes, grid, and tooltips stay
   * on Canvas2D. `"auto"` uses WebGPU when available, else Canvas2D.
   * Unknown to older browsers → silent fallback to Canvas2D.
   */
  renderer?: "auto" | "canvas" | "webgpu";
  /**
   * WebGPU adapter options — only used when `renderer` resolves to WebGPU.
   * `powerPreference` picks the discrete GPU on dual-GPU systems;
   * `compat` requests compatibility mode (GLES 3.1 / D3D11 reach);
   * `timing` enables GPU-side pass timing via "timestamp-query" when the
   * adapter supports it (note: browsers quantize to ~100 µs unless the
   * WebGPU developer-features flag is enabled).
   */
  gpu?: {
    powerPreference?: "default" | "low-power" | "high-performance";
    compat?: boolean;
    timing?: boolean;
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
  /** Called on pointer hover with the nearest hit, or `null` on leave. */
  onHover?: (info: HoverInfo | null) => void;
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
  pathCache: { key: string; path: Path2D } | null;
}

export interface NormalizedXY {
  kind: "xy";
  sortedX: Float64Array;
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
