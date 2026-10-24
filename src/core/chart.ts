import { hitBar, renderBar } from "../charts/bar";
import { hitBaseline, renderBaseline } from "../charts/baseline";
import { hitBubble, renderBubble } from "../charts/bubble";
import { hitCandle, renderCandles } from "../charts/candle";
import { hitCombo, renderCombo } from "../charts/combo";
import { hitDonut, renderDonut } from "../charts/donut";
import { hitFunnel, renderFunnel } from "../charts/funnel";
import { FLOW_RIPPLE, hitXY, renderLine } from "../charts/line";
import { drawRadarHover, hitRadar, renderRadar } from "../charts/radar";
import { hitRangeArea, renderRangeArea } from "../charts/rangearea";
import type { RenderContext } from "../charts/registry";
import { hitScatter, renderScatter } from "../charts/scatter";
import { hitSparkline, renderSparkline } from "../charts/sparkline";
import { hitWaterfall, renderWaterfall } from "../charts/waterfall";
import { CanvasBackend } from "./canvas";
import { withAlpha } from "./color";
import { formatSI } from "./format";
import { Legend, type LegendItem } from "./legend";
import {
  boundDomain,
  extent,
  linearScale,
  logScale,
  padDomain,
} from "./scales";
import { easeOutCubic, sharedScheduler } from "./scheduler";
import { resolveTheme, seriesColor } from "./theme";
import { computeTicks, logTicks, timeFormatter, timeTicks } from "./ticks";
import { Tooltip } from "./tooltip";
import type {
  CategoryData,
  ChartData,
  ChartOptions,
  ChartType,
  DonutData,
  HoverInfo,
  NormalizedData,
  NormalizedXY,
  OHLCData,
  Rect,
  Scale,
  ThemeTokens,
  WaterfallBar,
  WaterfallData,
  XYData,
  ZoomOptions,
} from "./types";

interface TypeModule {
  render: (r: RenderContext) => void;
  hit?: (r: RenderContext, px: number, py: number) => HoverInfo | null;
  axes: boolean;
  defaultTooltip: boolean;
}

const MODULES: Record<ChartType, TypeModule> = {
  line: {
    render: (r) => renderLine(r, false),
    hit: (r, px) => hitXY(r, px),
    axes: true,
    defaultTooltip: true,
  },
  area: {
    render: (r) => renderLine(r, true),
    hit: (r, px) => hitXY(r, px),
    axes: true,
    defaultTooltip: true,
  },
  scatter: {
    render: renderScatter,
    hit: (r, px) => hitScatter(r, px),
    axes: true,
    defaultTooltip: true,
  },
  bubble: {
    render: renderBubble,
    hit: (r, px) => hitBubble(r, px),
    axes: true,
    defaultTooltip: true,
  },
  rangearea: {
    render: renderRangeArea,
    hit: (r, px) => hitRangeArea(r, px),
    axes: true,
    defaultTooltip: true,
  },
  pie: {
    render: renderDonut,
    hit: hitDonut,
    axes: false,
    defaultTooltip: true,
  },
  radar: {
    render: renderRadar,
    hit: hitRadar,
    axes: false,
    defaultTooltip: true,
  },
  funnel: {
    render: renderFunnel,
    hit: hitFunnel,
    axes: false,
    defaultTooltip: true,
  },
  bar: { render: renderBar, hit: hitBar, axes: true, defaultTooltip: true },
  combo: {
    render: renderCombo,
    hit: (r, px) => hitCombo(r, px),
    axes: true,
    defaultTooltip: true,
  },
  sparkline: {
    render: renderSparkline,
    hit: (r, px) => hitSparkline(r, px),
    axes: false,
    defaultTooltip: false,
  },
  donut: {
    render: renderDonut,
    hit: hitDonut,
    axes: false,
    defaultTooltip: true,
  },
  candle: {
    render: (r) => renderCandles(r, false),
    hit: (r, px) => hitCandle(r, px),
    axes: true,
    defaultTooltip: true,
  },
  ohlc: {
    render: (r) => renderCandles(r, true),
    hit: (r, px) => hitCandle(r, px),
    axes: true,
    defaultTooltip: true,
  },
  waterfall: {
    render: renderWaterfall,
    hit: hitWaterfall,
    axes: true,
    defaultTooltip: true,
  },
  baseline: {
    render: renderBaseline,
    hit: (r, px) => hitBaseline(r, px),
    axes: true,
    defaultTooltip: true,
  },
};

const LABEL_H = 20;
const GUTTER_PAD = 10;
/** chart types with a WebGPU series path */
const GPU_KIND: Partial<Record<ChartType, "line" | "area" | "points">> = {
  line: "line",
  area: "area",
  sparkline: "line",
  scatter: "points",
};
/** points retained beyond the window's left edge so they slide off-screen instead of vanishing mid-plot */
const EDGE_KEEP = 3;
/** default point count at which `renderer: "auto"` engages the GPU path */
const GPU_THRESHOLD = 50_000;

/** Chart instance. Create via {@link createChart}.
 * @category Charts
 */
export class Chart {
  readonly el: HTMLElement;
  readonly options: ChartOptions;
  private theme: ThemeTokens;
  private backend: CanvasBackend;
  private tooltip: Tooltip | null = null;
  private mod: TypeModule;
  private data: NormalizedData;
  private ro: ResizeObserver | null = null;
  private rect: DOMRect | null = null;
  private pointer: { x: number; y: number } | null = null;
  private hover: HoverInfo | null = null;
  private animStart: number | null = null;
  private animDur = 0;
  private view: { x: [number, number]; y: [number, number] } = {
    x: [0, 1],
    y: [0, 1],
  };
  private viewFrom: { x: [number, number]; y: [number, number] } | null = null;
  private viewTo: { x: [number, number]; y: [number, number] } = {
    x: [0, 1],
    y: [0, 1],
  };
  private reduced = false;
  private destroyed = false;
  private pendingView = false;
  private gpu: import("../gpu/series").GpuSeries | null = null;
  private gpuInit = false;
  /** bumped whenever xy data is replaced or reordered — triggers GPU re-upload */
  private dataRev = 0;
  /** memoized {@link computeDomains} — invalidated on data/hidden changes */
  private domCache: { x: [number, number]; y: [number, number] } | null = null;
  /** key of the last rasterized static layer (grid/ticks/labels) */
  private gridKey: string | null = null;
  /** memoized {@link makeScales} — keyed on view domain + plot + volBand */
  private scKey: string | null = null;
  private scCache: { xScale: Scale; yScale: Scale } | null = null;
  private lastAppendAt = 0;
  private estInterval = 400;
  private legend: Legend | null = null;
  /** series/slice indices hidden via legend toggles */
  private hidden = new Set<number>();
  /** user-driven zoom/pan domain override (data-space), released by resetZoom() */
  private viewOverride: {
    x: [number, number] | null;
    y: [number, number] | null;
  } | null = null;
  private selected: HoverInfo | null = null;
  /** active drag gesture (zoom select/pan) */
  private drag: {
    x0: number;
    y0: number;
    mode: "select" | "pan";
    moved: boolean;
    dom: { x: [number, number]; y: [number, number] };
  } | null = null;
  /** pointerdown bookkeeping for click detection */
  private downAt: { x: number; y: number } | null = null;
  private onScroll = (): void => {
    this.rect = null;
  };
  private frame = (now: number): boolean => {
    if (this.destroyed) return false;
    if (this.pendingView) {
      // append() folds layout + animation restart into the frame so bursts
      // of appends share one domain computation per rendered frame
      this.pendingView = false;
      this.viewFrom = {
        x: [this.view.x[0], this.view.x[1]],
        y: [this.view.y[0], this.view.y[1]],
      };
      this.viewTo = this.layout();
      this.animDur = this.resolveAnimDur();
      this.animStart = -1;
    }
    let more = false;
    if (this.animStart !== null) {
      if (this.animStart === -1) this.animStart = now;
      const raw =
        this.animDur <= 0
          ? 1
          : Math.min(1, (now - this.animStart) / this.animDur);
      const eased = easeOutCubic(raw);
      this.lerpView(eased);
      this.render(eased);
      if (raw < 1) more = true;
      else this.animStart = null;
    }
    if (this.pointer) {
      this.applyHover(this.pointer.x, this.pointer.y);
      this.pointer = null;
    }
    return more;
  };

  constructor(el: HTMLElement, options: ChartOptions) {
    this.el = el;
    this.options = options;
    this.theme = resolveTheme(options.theme, options.accent);
    this.mod = MODULES[options.type];
    const style = getComputedStyle(el);
    if (style.position === "static") el.style.position = "relative";
    if (options.height) el.style.height = `${options.height}px`;
    const w = el.clientWidth || 320;
    const h = el.clientHeight || (options.type === "sparkline" ? 32 : 240);
    this.backend = new CanvasBackend(el, w, h, options.canvas);
    this.reduced =
      typeof matchMedia === "function" &&
      matchMedia("(prefers-reduced-motion: reduce)").matches;
    const tipOpt = options.tooltip ?? this.mod.defaultTooltip;
    if (tipOpt) {
      const radius = typeof tipOpt === "object" ? tipOpt.radius : undefined;
      this.tooltip = new Tooltip(el, this.theme, radius);
    }
    this.data = this.normalize(options.data, null);
    if (options.legend) {
      const lo = typeof options.legend === "object" ? options.legend : {};
      this.legend = new Legend(
        el,
        this.theme,
        lo.position ?? "bottom",
        lo.toggle !== false,
        (i) => this.onLegendToggle(i),
      );
      this.legend.setItems(this.legendItems(), this.hidden);
    }
    this.maybeInitGpu();
    this.bindEvents();
    const dom = this.layout();
    this.view = { x: [...dom.x], y: [...dom.y] };
    this.viewTo = { x: [...dom.x], y: [...dom.y] };
    this.startAnimation(dom);
  }

  /**
   * Lazily acquire the WebGPU backend. `"webgpu"` attaches unconditionally;
   * `"auto"` waits until the xy point count crosses `gpuThreshold` — small
   * charts never pay adapter/device acquisition.
   */
  private maybeInitGpu(): void {
    if (this.gpu || this.gpuInit || this.destroyed) return;
    if (!GPU_KIND[this.options.type]) return;
    const r = this.options.renderer ?? "auto";
    if (r !== "auto" && r !== "webgpu") return;
    if (r === "auto") {
      const d = this.data;
      const pts =
        d.kind === "xy" ? d.sortedX.length * Math.max(1, d.series.length) : 0;
      if (pts < (this.options.gpuThreshold ?? GPU_THRESHOLD)) return;
    }
    this.gpuInit = true;
    void import("../gpu/series").then(({ GpuSeries }) =>
      GpuSeries.create(this.options.gpu).then((g) => {
        if (!g || this.destroyed) {
          g?.destroy();
          return;
        }
        g.setSize(this.backend.width, this.backend.height, this.backend.dpr);
        const lb = this.options.logBase ?? 10;
        g.setLog(
          this.options.xScale === "log" ? lb : null,
          this.options.yScale === "log" ? lb : null,
        );
        this.backend.overlayCanvas.before(g.canvas);
        this.gpu = g;
        sharedScheduler.add((now) => {
          this.render(1);
          void now;
          return false;
        });
      }),
    );
  }

  private normalize(
    data: ChartData,
    prev: NormalizedData | null,
  ): NormalizedData {
    const t = this.options.type;
    if (t === "candle" || t === "ohlc") {
      const d = data as OHLCData;
      const n0 = d.candles.length;
      // drop candles with non-finite OHLC or unusable x (log needs x > 0)
      const logX = this.options.xScale === "log";
      const ok = (i: number): boolean => {
        const c = d.candles[i];
        if (!c) return false;
        const x = c.x ?? i;
        return (
          Number.isFinite(x) &&
          (!logX || x > 0) &&
          Number.isFinite(c.open) &&
          Number.isFinite(c.high) &&
          Number.isFinite(c.low) &&
          Number.isFinite(c.close)
        );
      };
      let n = 0;
      for (let i = 0; i < n0; i++) if (ok(i)) n++;
      let idx: Uint32Array | null = null;
      for (let i = 1; i < n0; i++) {
        if ((d.candles[i]?.x ?? i) < (d.candles[i - 1]?.x ?? i - 1)) {
          idx = new Uint32Array(n0);
          for (let k = 0; k < n0; k++) idx[k] = k;
          idx.sort((a, b) => (d.candles[a]?.x ?? 0) - (d.candles[b]?.x ?? 0));
          break;
        }
      }
      const x = new Float64Array(n);
      const open = new Float64Array(n);
      const high = new Float64Array(n);
      const low = new Float64Array(n);
      const close = new Float64Array(n);
      let hasVol = false;
      const volume = new Float64Array(n);
      let o = 0;
      for (let k = 0; k < n0; k++) {
        const i = idx ? (idx[k] as number) : k;
        if (!ok(i)) continue;
        const c = d.candles[i];
        if (!c) continue;
        x[o] = c.x ?? i;
        open[o] = c.open;
        high[o] = c.high;
        low[o] = c.low;
        close[o] = c.close;
        volume[o] = c.volume ?? 0;
        if (c.volume != null && c.volume > 0) hasVol = true;
        o++;
      }
      return {
        kind: "ohlc",
        x,
        open,
        high,
        low,
        close,
        volume: hasVol ? volume : null,
      };
    }
    if (t === "waterfall") {
      const d = data as WaterfallData;
      const totals = new Set(d.totals ?? []);
      let run = 0;
      const bars: WaterfallBar[] = d.categories.map((_, i) => {
        const raw = d.values[i] as number;
        const v = Number.isFinite(raw) ? raw : 0;
        if (totals.has(i)) {
          const bar: WaterfallBar = { start: 0, end: v, value: v, total: true };
          run = v;
          return bar;
        }
        const bar: WaterfallBar = {
          start: run,
          end: run + v,
          value: v,
          total: false,
        };
        run += v;
        return bar;
      });
      return { kind: "waterfall", categories: [...d.categories], bars };
    }
    if (t === "donut" || t === "pie") {
      const d = data as DonutData;
      const slices = d.slices.map((s, i) => ({
        label: s.label,
        value: Number.isFinite(s.value) ? Math.max(0, s.value) : 0,
        color: seriesColor(this.theme, i, s.color),
      }));
      const total = slices.reduce((a, s) => a + s.value, 0);
      return { kind: "donut", slices, total };
    }
    if (t === "bar" || t === "combo" || t === "radar" || t === "funnel") {
      const d = data as CategoryData;
      const prevSeries = prev?.kind === "category" ? prev.series : [];
      return {
        kind: "category",
        categories: [...d.categories],
        series: d.series.map((s, i) => {
          const values = new Float64Array(s.values.length);
          let hasGaps = false;
          for (let k = 0; k < values.length; k++) {
            const v = s.values[k] as number;
            if (Number.isFinite(v)) values[k] = v;
            else {
              values[k] = NaN;
              hasGaps = true;
            }
          }
          return {
            label: s.label ?? `Series ${i + 1}`,
            color: seriesColor(this.theme, i, s.color),
            kind: s.kind ?? "column",
            values,
            prevValues: prevSeries[i]?.values ?? null,
            hasGaps,
          };
        }),
      };
    }
    const d = data as XYData;
    const logX = this.options.xScale === "log";
    const n0 = d.x.length;
    // indices of usable points: finite x (positive when xScale is "log")
    let keep: Uint32Array | null = null;
    for (let i = 0; i < n0; i++) {
      const v = d.x[i] as number;
      if (!Number.isFinite(v) || (logX && v <= 0)) {
        keep = new Uint32Array(n0);
        let k = 0;
        for (let j = 0; j < n0; j++) {
          const w = d.x[j] as number;
          if (Number.isFinite(w) && !(logX && w <= 0)) keep[k++] = j;
        }
        keep = keep.subarray(0, k);
        break;
      }
    }
    const n = keep ? keep.length : n0;
    const xRaw = new Float64Array(n);
    for (let i = 0; i < n; i++) {
      xRaw[i] = d.x[keep ? (keep[i] as number) : i] as number;
    }
    // already-sorted x (the common case) skips the O(n log n) index sort
    let idx: Uint32Array | null = null;
    for (let i = 1; i < n; i++) {
      if ((xRaw[i] as number) < (xRaw[i - 1] as number)) {
        idx = new Uint32Array(n);
        for (let k = 0; k < n; k++) idx[k] = k;
        idx.sort((a, b) => (xRaw[a] as number) - (xRaw[b] as number));
        break;
      }
    }
    const sortedX = idx ? new Float64Array(n) : xRaw;
    if (idx) {
      for (let i = 0; i < n; i++) sortedX[i] = xRaw[idx[i] as number] as number;
    }
    const prevSeries = prev?.kind === "xy" ? prev.series : [];
    const nd: NormalizedXY = {
      kind: "xy",
      sortedX,
      series: d.series.map((s, i) => {
        let hasGaps = false;
        const chan = (
          src: ArrayLike<number | null> | undefined,
        ): Float64Array | null => {
          if (!src) return null;
          const out = new Float64Array(n);
          for (let k = 0; k < n; k++) {
            const pos = idx ? (idx[k] as number) : k;
            const v = src[keep ? (keep[pos] as number) : pos] as number;
            if (Number.isFinite(v)) out[k] = v;
            else {
              out[k] = NaN;
              hasGaps = true;
            }
          }
          return out;
        };
        const y = chan(s.y) ?? new Float64Array(n);
        return {
          label: s.label ?? `Series ${i + 1}`,
          color: seriesColor(this.theme, i, s.color),
          y,
          prevY: prevSeries[i]?.y ?? null,
          prevYLog: prevSeries[i]?.yLog ?? null,
          r: chan(s.r),
          y2: chan(s.y2),
          prevY2: prevSeries[i]?.y2 ?? null,
          prevY2Log: prevSeries[i]?.y2Log ?? null,
          hasGaps,
          pathCache: null,
        };
      }),
    };
    // rangearea needs both edges — a point missing either is a band gap
    if (t === "rangearea") {
      const logY = this.options.yScale === "log";
      for (const s of nd.series) {
        const y2 = s.y2;
        if (!y2) continue;
        for (let i = 0; i < n; i++) {
          const lo = s.y[i] as number;
          const hi = y2[i] as number;
          if (
            !Number.isFinite(lo) ||
            !Number.isFinite(hi) ||
            (logY && (lo <= 0 || hi <= 0))
          ) {
            s.y[i] = NaN;
            y2[i] = NaN;
            s.hasGaps = true;
          }
        }
      }
    }
    // path-break index per series — the decimator iterates the finite runs
    // between these instead of checking every point
    {
      const logY = this.options.yScale === "log";
      for (const s of nd.series) {
        let g: number[] | undefined;
        const y = s.y;
        for (let i = 0; i < y.length; i++) {
          const v = y[i] as number;
          if (!Number.isFinite(v) || (logY && v <= 0)) {
            if (!g) g = [];
            g.push(i);
          }
        }
        s.gapIdx = g;
      }
    }
    // display-space copies under log axes — the decimator then runs pure
    // affine per point; `Math.log` is paid once here, not per render
    {
      const invL = 1 / Math.log(this.options.logBase ?? 10);
      const logY = this.options.yScale === "log";
      if (logX) {
        const a = new Float64Array(n);
        for (let i = 0; i < n; i++) {
          const v = sortedX[i] as number;
          a[i] = v > 0 ? Math.log(v) * invL : NaN;
        }
        nd.sortedXLog = a;
      }
      if (logY) {
        for (const s of nd.series) {
          s.yLog = logMap(s.y, invL);
          if (s.y2) s.y2Log = logMap(s.y2, invL);
        }
      }
    }
    return nd;
  }

  private bindEvents(): void {
    this.el.addEventListener("pointermove", this.onMove, { passive: true });
    this.el.addEventListener("pointerleave", this.onLeave, { passive: true });
    this.el.addEventListener("pointerdown", this.onDown);
    this.el.addEventListener("pointerup", this.onUp);
    this.el.addEventListener("wheel", this.onWheel, { passive: false });
    this.el.addEventListener("dblclick", this.onDbl);
    window.addEventListener("scroll", this.onScroll, true);
    if (typeof ResizeObserver === "function") {
      this.ro = new ResizeObserver(() => this.resize());
      this.ro.observe(this.el);
    }
  }

  private pointerPos(e: PointerEvent | WheelEvent): { x: number; y: number } {
    if (!this.rect) this.rect = this.el.getBoundingClientRect();
    return { x: e.clientX - this.rect.left, y: e.clientY - this.rect.top };
  }

  private onMove = (e: PointerEvent): void => {
    const p = this.pointerPos(e);
    if (this.drag) {
      this.onDragMove(p);
      return;
    }
    this.pointer = p;
    sharedScheduler.add(this.frame);
  };

  private onLeave = (): void => {
    this.pointer = null;
    if (this.hover) {
      this.hover = null;
      this.paintOverlay();
      this.tooltip?.hide();
      this.options.onHover?.(null);
    }
  };

  private onDown = (e: PointerEvent): void => {
    if (e.button !== 0) return;
    const p = this.pointerPos(e);
    this.downAt = p;
    const z = this.zoomOpts();
    const mode = z?.drag;
    if (mode && this.canZoom()) {
      this.drag = {
        x0: p.x,
        y0: p.y,
        mode,
        moved: false,
        dom: {
          x: [this.view.x[0], this.view.x[1]],
          y: [this.view.y[0], this.view.y[1]],
        },
      };
      try {
        this.el.setPointerCapture(e.pointerId);
      } catch {
        // capture unsupported — drag still works inside the element
      }
    }
  };

  private onUp = (e: PointerEvent): void => {
    const p = this.pointerPos(e);
    const down = this.downAt;
    this.downAt = null;
    const drag = this.drag;
    this.drag = null;
    try {
      this.el.releasePointerCapture(e.pointerId);
    } catch {
      // not captured
    }
    if (drag?.moved && drag.mode === "select") {
      this.finishSelect(drag, p);
      this.paintOverlay();
      return;
    }
    if (drag?.moved) return;
    const moved = down ? Math.hypot(p.x - down.x, p.y - down.y) >= 6 : true;
    if (!moved) this.onClickAt(p, e);
  };

  private onWheel = (e: WheelEvent): void => {
    const z = this.zoomOpts();
    if (!z || z.wheel === false || !this.canZoom()) return;
    const p = this.pointerPos(e);
    const plot = this.backend.plot;
    if (
      p.x < plot.x ||
      p.x > plot.x + plot.w ||
      p.y < plot.y ||
      p.y > plot.y + plot.h
    ) {
      return;
    }
    e.preventDefault();
    const factor = Math.exp(e.deltaY * 0.0018);
    const axes = z.axes ?? "x";
    if (axes !== "y")
      this.zoomAxis("x", this.makeScales().xScale.invert(p.x), factor);
    if (axes !== "x")
      this.zoomAxis("y", this.makeScales().yScale.invert(p.y), factor);
    this.commitView(true);
  };

  private onDbl = (): void => {
    const z = this.zoomOpts();
    if (z && z.dblclick === false) return;
    this.resetZoom();
  };

  // ------------------------------------------------------------- zoom/pan --

  private zoomOpts(): ZoomOptions | null {
    const z = this.options.zoom;
    if (!z) return null;
    return z === true ? {} : z;
  }

  private canZoom(): boolean {
    return (
      this.zoomOpts() !== null &&
      (this.data.kind === "xy" || this.data.kind === "ohlc")
    );
  }

  /** transform pair for an axis — log axes zoom/pan in log space */
  private form(axis: "x" | "y"): {
    t: (v: number) => number;
    i: (v: number) => number;
  } {
    const isLog =
      axis === "x"
        ? this.options.xScale === "log"
        : this.options.yScale === "log";
    if (!isLog) return { t: (v) => v, i: (v) => v };
    const b = Math.log(this.options.logBase ?? 10);
    const base = this.options.logBase ?? 10;
    return { t: (v) => Math.log(v) / b, i: (v) => base ** v };
  }

  /** clamp a transformed-space candidate domain to the fitted data limits */
  private clampDomain(
    cand: [number, number],
    lim: [number, number],
    form: { t: (v: number) => number; i: (v: number) => number },
  ): [number, number] {
    const L0 = form.t(lim[0]);
    const L1 = form.t(lim[1]);
    let n0 = form.t(cand[0]);
    let n1 = form.t(cand[1]);
    if (n1 < n0) [n0, n1] = [n1, n0];
    const span = n1 - n0;
    const limSpan = L1 - L0;
    if (!Number.isFinite(span) || span <= 0) return lim;
    if (span >= limSpan) return lim;
    if (n0 < L0) {
      n1 += L0 - n0;
      n0 = L0;
    }
    if (n1 > L1) {
      n0 -= n1 - L1;
      n1 = L1;
    }
    return [form.i(n0), form.i(n1)];
  }

  /** zoom `axis` around the data-space `center` by `factor` (>1 zooms out) */
  private zoomAxis(axis: "x" | "y", center: number, factor: number): void {
    const lim = this.domains()[axis];
    const cur = this.viewOverride?.[axis] ?? this.view[axis];
    const f = this.form(axis);
    const t0 = f.t(cur[0]);
    const t1 = f.t(cur[1]);
    const tc = f.t(center);
    if (!Number.isFinite(tc)) return;
    this.setOverride(
      axis,
      [tc - (tc - t0) * factor, tc + (t1 - tc) * factor],
      lim,
      f,
    );
  }

  private setOverride(
    axis: "x" | "y",
    cand: [number, number],
    lim: [number, number],
    form: { t: (v: number) => number; i: (v: number) => number },
  ): void {
    if (!this.viewOverride) this.viewOverride = { x: null, y: null };
    this.viewOverride[axis] = this.clampDomain(cand, lim, form);
  }

  private onDragMove(p: { x: number; y: number }): void {
    const drag = this.drag;
    if (!drag) return;
    const dx = p.x - drag.x0;
    const dy = p.y - drag.y0;
    if (!drag.moved && Math.hypot(dx, dy) < 4) return;
    drag.moved = true;
    const z = this.zoomOpts();
    const axes = z?.axes ?? "x";
    const plot = this.backend.plot;
    if (drag.mode === "pan") {
      const lim = this.domains();
      const panAxis = (axis: "x" | "y", dPx: number, spanPx: number): void => {
        const f = this.form(axis);
        const t0 = f.t(drag.dom[axis][0]);
        const t1 = f.t(drag.dom[axis][1]);
        const shift = (-dPx * (t1 - t0)) / Math.max(1, spanPx);
        this.setOverride(
          axis,
          [f.i(t0 + shift), f.i(t1 + shift)],
          lim[axis],
          f,
        );
      };
      if (axes !== "y") panAxis("x", dx, plot.w);
      // y range grows downward — dragging down pans toward higher values
      if (axes !== "x") panAxis("y", -dy, plot.h);
      this.commitView(false);
      return;
    }
    // select: draw the zoom box over the hover layer
    this.paintOverlay();
    const o = this.backend.overlay;
    const x0 = Math.max(plot.x, Math.min(drag.x0, p.x));
    const x1 = Math.min(plot.x + plot.w, Math.max(drag.x0, p.x));
    const y0 = Math.max(plot.y, Math.min(drag.y0, p.y));
    const y1 = Math.min(plot.y + plot.h, Math.max(drag.y0, p.y));
    const rx = axes === "y" ? plot.x : x0;
    const rw = axes === "y" ? plot.w : x1 - x0;
    const ry = axes === "x" ? plot.y : y0;
    const rh = axes === "x" ? plot.h : y1 - y0;
    o.fillStyle = withAlpha(this.theme.crosshair, 0.15);
    o.strokeStyle = this.theme.crosshair;
    o.lineWidth = 1;
    o.setLineDash([4, 3]);
    o.fillRect(rx, ry, rw, rh);
    o.strokeRect(rx + 0.5, ry + 0.5, rw, rh);
    o.setLineDash([]);
  }

  private finishSelect(
    drag: NonNullable<Chart["drag"]>,
    p: { x: number; y: number },
  ): void {
    const z = this.zoomOpts();
    const axes = z?.axes ?? "x";
    const scales = this.makeScales();
    const lim = this.domains();
    if (axes !== "y") {
      const a = scales.xScale.invert(Math.min(drag.x0, p.x));
      const b = scales.xScale.invert(Math.max(drag.x0, p.x));
      if (Number.isFinite(a) && Number.isFinite(b) && a !== b) {
        const f = this.form("x");
        this.setOverride("x", [a, b], lim.x, f);
      }
    }
    if (axes !== "x") {
      const a = scales.yScale.invert(Math.max(drag.y0, p.y));
      const b = scales.yScale.invert(Math.min(drag.y0, p.y));
      if (Number.isFinite(a) && Number.isFinite(b) && a !== b) {
        const f = this.form("y");
        this.setOverride("y", [a, b], lim.y, f);
      }
    }
    this.commitView(true);
  }

  /** push viewOverride into the animated view; `animate` retargets the tween */
  private commitView(animate: boolean): void {
    if (!this.viewOverride) return;
    const dom = this.layout();
    if (animate) {
      this.startAnimation(dom);
    } else {
      this.viewTo = { x: [...dom.x], y: [...dom.y] };
      this.view = { x: [...dom.x], y: [...dom.y] };
      this.animStart = null;
      sharedScheduler.add((now) => {
        this.render(1);
        void now;
        return false;
      });
    }
    this.zoomOpts()?.onZoom?.(dom);
  }

  /** Release the zoom/pan override — the view refits to the data. */
  resetZoom(): void {
    if (!this.viewOverride) return;
    this.viewOverride = null;
    const dom = this.layout();
    this.startAnimation(dom);
    this.zoomOpts()?.onZoom?.(null);
  }

  private withOverride(dom: { x: [number, number]; y: [number, number] }): {
    x: [number, number];
    y: [number, number];
  } {
    const o = this.viewOverride;
    if (!o) return dom;
    return {
      x: o.x ? [o.x[0], o.x[1]] : dom.x,
      y: o.y ? [o.y[0], o.y[1]] : dom.y,
    };
  }

  // ------------------------------------------------------------ selection --

  private onClickAt(p: { x: number; y: number }, e: PointerEvent): void {
    if (!this.options.onClick && !this.options.onSelect) return;
    const hit = this.mod.hit;
    const info = hit ? hit(this.renderContext(1), p.x, p.y) : null;
    this.options.onClick?.(info, e);
    if (info) {
      this.selected = info;
    } else {
      this.selected = null;
    }
    this.options.onSelect?.(info);
    this.paintOverlay();
  }

  // --------------------------------------------------------------- legend --

  private legendItems(): LegendItem[] {
    const d = this.data;
    const t = this.options.type;
    if (d.kind === "xy" && t !== "baseline" && t !== "sparkline") {
      return d.series.map((s) => ({ label: s.label, color: s.color }));
    }
    if (d.kind === "category" && t !== "funnel") {
      return d.series.map((s) => ({ label: s.label, color: s.color }));
    }
    if (d.kind === "donut") {
      return d.slices.map((s) => ({ label: s.label, color: s.color }));
    }
    return [];
  }

  private onLegendToggle(i: number): void {
    if (this.hidden.has(i)) this.hidden.delete(i);
    else this.hidden.add(i);
    this.domCache = null;
    this.legend?.mark(this.hidden);
    const dom = this.layout();
    this.startAnimation(dom);
  }

  /** major (labeled) + minor (gridline-only) ticks for the y domain */
  private yTickVals(
    dom: readonly [number, number],
    plotH: number,
  ): { major: number[]; minor: number[] } {
    if (this.options.yScale === "log") {
      return logTicks(dom[0], dom[1], this.options.logBase ?? 10);
    }
    return {
      major: computeTicks(dom[0], dom[1], Math.max(3, Math.floor(plotH / 48))),
      minor: [],
    };
  }

  /** x ticks — calendar boundaries on `time`, decades on `log` */
  private xTickVals(
    dom: readonly [number, number],
    plotW: number,
  ): { major: number[]; minor: number[] } {
    const xs = this.options.xScale;
    if (xs === "time") {
      return {
        major: timeTicks(dom[0], dom[1], Math.max(3, Math.floor(plotW / 90))),
        minor: [],
      };
    }
    if (xs === "log") {
      return logTicks(dom[0], dom[1], this.options.logBase ?? 10);
    }
    return {
      major: computeTicks(dom[0], dom[1], Math.max(3, Math.floor(plotW / 90))),
      minor: [],
    };
  }

  /** default x-label formatter — time-aware when `xScale: "time"` */
  private xFormatter(dom: readonly [number, number]): (v: number) => string {
    return (
      this.options.labels?.x ??
      (this.options.xScale === "time"
        ? timeFormatter(dom[1] - dom[0])
        : formatSI)
    );
  }

  private layout(): { x: [number, number]; y: [number, number] } {
    const w = this.backend.width;
    const h = this.backend.height;
    const mod = this.mod;
    const dom = this.withOverride(this.domains());
    const ins = this.legend?.inset() ?? {
      top: 0,
      right: 0,
      bottom: 0,
      left: 0,
    };
    if (!mod.axes) {
      this.backend.setPlot({
        x: 2 + ins.left,
        y: 2 + ins.top,
        w: Math.max(1, w - 4 - ins.left - ins.right),
        h: Math.max(1, h - 4 - ins.top - ins.bottom),
      });
      return dom;
    }
    const ctx = this.backend.main;
    const fmtY = this.options.labels?.y ?? formatSI;
    const plotH = Math.max(1, h - 8 - LABEL_H - ins.top - ins.bottom);
    const yTicks =
      this.data.kind === "donut" ? [] : this.yTickVals(dom.y, plotH).major;
    let gutter = 0;
    if (yTicks.length) {
      ctx.font = `11px ${this.theme.fontFamily}`;
      for (const t of yTicks) {
        gutter = Math.max(gutter, ctx.measureText(fmtY(t)).width);
      }
      gutter += GUTTER_PAD;
    }
    const plot: Rect = {
      x: gutter + ins.left,
      y: 8 + ins.top,
      w: Math.max(1, w - gutter - 8 - ins.left - ins.right),
      h: plotH,
    };
    this.backend.setPlot(plot);
    return dom;
  }

  /**
   * Data extents — memoized: zoom/pan events call this several times per
   * frame and the scan is O(n·series). Invalidated in setData/append/
   * legend toggle. Callers must not mutate the returned arrays.
   */
  private domains(): { x: [number, number]; y: [number, number] } {
    const cached = this.domCache;
    if (cached) return cached;
    const dom = this.computeDomains();
    this.domCache = dom;
    return dom;
  }

  private computeDomains(): { x: [number, number]; y: [number, number] } {
    const d = this.data;
    const logY = this.options.yScale === "log";
    // domain candidates for a log axis must be strictly positive
    const yOk = (v: number): boolean => Number.isFinite(v) && (!logY || v > 0);
    if (d.kind === "xy") {
      const nx = d.sortedX.length;
      const vis = this.options.window ?? this.options.maxPoints;
      // kept edge points stay in the buffer but outside the visible domain
      const x0 = vis != null && nx > vis ? nx - vis : 0;
      // sortedX is monotonic — the extent is just first/last
      const x: [number, number] =
        nx > 0
          ? [d.sortedX[x0] as number, d.sortedX[nx - 1] as number]
          : [0, 1];
      let min = Infinity;
      let max = -Infinity;
      for (let si = 0; si < d.series.length; si++) {
        if (this.hidden.has(si)) continue;
        const s = d.series[si];
        if (!s) continue;
        const y = s.y;
        const i0 = Math.min(x0, y.length);
        if (!logY && !s.hasGaps) {
          // verbatim scan — no per-point checks needed
          for (let i = i0; i < y.length; i++) {
            const v = y[i] as number;
            if (v < min) min = v;
            if (v > max) max = v;
          }
        } else {
          for (let i = i0; i < y.length; i++) {
            const v = y[i] as number;
            if (!yOk(v)) continue;
            if (v < min) min = v;
            if (v > max) max = v;
          }
        }
        const y2 = s.y2;
        if (y2) {
          const j0 = Math.min(x0, y2.length);
          if (!logY && !s.hasGaps) {
            for (let i = j0; i < y2.length; i++) {
              const v = y2[i] as number;
              if (v < min) min = v;
              if (v > max) max = v;
            }
          } else {
            for (let i = j0; i < y2.length; i++) {
              const v = y2[i] as number;
              if (!yOk(v)) continue;
              if (v < min) min = v;
              if (v > max) max = v;
            }
          }
        }
      }
      if (min === Infinity) {
        min = logY ? 1 : 0;
        max = logY ? 10 : 1;
      }
      const includeZero =
        !logY &&
        (this.options.type === "area" || this.options.type === "sparkline");
      return {
        x,
        y: this.yDomain(
          logY ? this.logPad(min, max) : padDomain(min, max, includeZero),
        ),
      };
    }
    if (d.kind === "category") {
      let min = Infinity;
      let max = -Infinity;
      if (this.options.stacked) {
        for (let ci = 0; ci < d.categories.length; ci++) {
          let pos = 0;
          let neg = 0;
          for (let si = 0; si < d.series.length; si++) {
            if (this.hidden.has(si)) continue;
            const s = d.series[si];
            if (s?.kind !== "column") continue;
            const v = s.values[ci] as number;
            if (!Number.isFinite(v)) continue;
            if (v >= 0) pos += v;
            else neg += v;
          }
          min = Math.min(min, logY ? (pos > 0 ? pos : min) : neg);
          max = Math.max(max, pos);
        }
        for (let si = 0; si < d.series.length; si++) {
          if (this.hidden.has(si)) continue;
          const s = d.series[si];
          if (!s || s.kind === "column") continue;
          for (let i = 0; i < s.values.length; i++) {
            const v = s.values[i] as number;
            if (!yOk(v)) continue;
            if (v < min) min = v;
            if (v > max) max = v;
          }
        }
      } else {
        for (let si = 0; si < d.series.length; si++) {
          if (this.hidden.has(si)) continue;
          const s = d.series[si];
          if (!s) continue;
          for (let i = 0; i < s.values.length; i++) {
            const v = s.values[i] as number;
            if (!yOk(v)) continue;
            if (v < min) min = v;
            if (v > max) max = v;
          }
        }
      }
      if (min === Infinity) {
        min = logY ? 1 : 0;
        max = logY ? 10 : 1;
      }
      return {
        x: [0, d.categories.length],
        y: this.yDomain(
          logY ? this.logPad(min, max) : padDomain(min, max, true),
        ),
      };
    }
    if (d.kind === "ohlc") {
      const x = extent(d.x);
      let min = Infinity;
      let max = -Infinity;
      for (let i = 0; i < d.x.length; i++) {
        const lo = d.low[i] as number;
        const hi = d.high[i] as number;
        if (!yOk(lo) || !yOk(hi)) continue;
        if (lo < min) min = lo;
        if (hi > max) max = hi;
      }
      if (min === Infinity) {
        min = logY ? 1 : 0;
        max = logY ? 10 : 1;
      }
      return {
        x,
        y: this.yDomain(logY ? this.logPad(min, max) : padDomain(min, max)),
      };
    }
    if (d.kind === "waterfall") {
      let min = Infinity;
      let max = -Infinity;
      for (const b of d.bars) {
        min = Math.min(min, b.start, b.end);
        max = Math.max(max, b.start, b.end);
      }
      if (min === Infinity) {
        min = 0;
        max = 1;
      }
      return {
        x: [0, d.bars.length],
        y: this.yDomain(padDomain(min, max, true)),
      };
    }
    return { x: [0, 1], y: this.yDomain([0, 1]) };
  }

  /** pad a positive domain in log space (~5% each side) */
  private logPad(min: number, max: number): [number, number] {
    const base = this.options.logBase ?? 10;
    const lb = Math.log(base);
    const l0 = Math.log(min) / lb;
    const l1 = Math.log(max) / lb;
    const p = Math.max(l1 - l0, 0) * 0.05 + (l1 === l0 ? 0.5 : 0);
    return [base ** (l0 - p), base ** (l1 + p)];
  }

  private yDomain(y: [number, number]): [number, number] {
    const [lo, hi] = boundDomain(y, this.options.yMin, this.options.yMax);
    if (this.options.yScale !== "log") return [lo, hi];
    // log axes can't show non-positive bounds — fall back to the fitted end
    const base = this.options.logBase ?? 10;
    const l = lo > 0 ? lo : y[0] > 0 ? y[0] : 1;
    const h = hi > l ? hi : l * base;
    return [l, h];
  }

  private lerpView(eased: number): void {
    const f = this.viewFrom;
    const to = this.viewTo;
    const v = this.view;
    if (!f || eased >= 1) {
      v.x[0] = to.x[0];
      v.x[1] = to.x[1];
      v.y[0] = to.y[0];
      v.y[1] = to.y[1];
      return;
    }
    v.x[0] = f.x[0] + (to.x[0] - f.x[0]) * eased;
    v.x[1] = f.x[1] + (to.x[1] - f.x[1]) * eased;
    v.y[0] = f.y[0] + (to.y[0] - f.y[0]) * eased;
    v.y[1] = f.y[1] + (to.y[1] - f.y[1]) * eased;
  }

  private makeScales(): { xScale: Scale; yScale: Scale } {
    const plot = this.backend.plot;
    const dom = this.view;
    const volBand =
      this.data.kind === "ohlc" && this.data.volume ? plot.h * 0.18 : 0;
    const key = `${dom.x[0]}|${dom.x[1]}|${dom.y[0]}|${dom.y[1]}|${plot.x}|${plot.y}|${plot.w}|${plot.h}|${volBand}`;
    if (this.scKey === key && this.scCache) return this.scCache;
    const base = this.options.logBase ?? 10;
    const x0 =
      this.options.xScale === "log" ? Math.max(dom.x[0], 1e-300) : dom.x[0];
    const out = {
      xScale:
        this.options.xScale === "log"
          ? logScale(x0, dom.x[1], plot.x, plot.x + plot.w, base)
          : linearScale(dom.x[0], dom.x[1], plot.x, plot.x + plot.w),
      yScale:
        this.options.yScale === "log"
          ? logScale(
              dom.y[0],
              dom.y[1],
              plot.y + plot.h - volBand,
              plot.y,
              base,
            )
          : linearScale(dom.y[0], dom.y[1], plot.y + plot.h - volBand, plot.y),
    };
    this.scKey = key;
    this.scCache = out;
    return out;
  }

  private renderContext(t: number, scales = this.makeScales()): RenderContext {
    const { xScale, yScale } = scales;
    return {
      backend: this.backend,
      ctx: this.backend.main,
      plot: this.backend.plot,
      theme: this.theme,
      opts: this.options,
      data: this.data,
      hidden: this.hidden,
      xScale,
      yScale,
      t,
    };
  }

  private drawStatic(scales = this.makeScales()): void {
    if (!this.mod.axes) return;
    const plot = this.backend.plot;
    const { xScale, yScale } = scales;
    // grid bitmap is reusable while data/view/layout are unchanged —
    // the offscreen redraw + text pass then costs just one blit
    const key = [
      this.dataRev,
      this.backend.gridRev,
      xScale.domain[0],
      xScale.domain[1],
      yScale.domain[0],
      yScale.domain[1],
      plot.x,
      plot.y,
      plot.w,
      plot.h,
    ].join("|");
    if (this.gridKey === key) {
      this.backend.blitGrid();
      return;
    }
    const ctx = this.backend.grid();
    const fmtY = this.options.labels?.y ?? formatSI;
    ctx.font = `11px ${this.theme.fontFamily}`;
    ctx.fillStyle = this.theme.textMuted;

    const showGrid = this.options.grid ?? true;
    const yT = this.yTickVals(yScale.domain, plot.h);
    const strokeTicks = (ticks: number[], alpha: number): void => {
      ctx.strokeStyle =
        alpha === 1 ? this.theme.grid : withAlpha(this.theme.grid, alpha);
      ctx.lineWidth = 1;
      ctx.beginPath();
      for (const t of ticks) {
        const y = Math.round(yScale(t)) + 0.5;
        if (!Number.isFinite(y)) continue;
        ctx.moveTo(plot.x, y);
        ctx.lineTo(plot.x + plot.w, y);
      }
      ctx.stroke();
    };
    if (showGrid) {
      strokeTicks(yT.minor, 0.5);
      strokeTicks(yT.major, 1);
    }
    ctx.textAlign = "right";
    ctx.textBaseline = "middle";
    for (const t of yT.major) {
      ctx.fillText(fmtY(t), plot.x - GUTTER_PAD, yScale(t));
    }

    ctx.textBaseline = "top";
    const d = this.data;
    if (d.kind === "category" || d.kind === "waterfall") {
      ctx.textAlign = "center";
      const cats = d.categories;
      const n = d.kind === "category" ? cats.length : d.bars.length;
      const slot = plot.w / Math.max(1, n);
      for (let i = 0; i < n; i++) {
        ctx.fillText(
          cats[i] ?? "",
          plot.x + slot * (i + 0.5),
          plot.y + plot.h + 6,
        );
      }
    } else if (d.kind === "xy" || d.kind === "ohlc") {
      const fmtX = this.xFormatter(xScale.domain);
      const xT = this.xTickVals(xScale.domain, plot.w);
      if (showGrid) {
        ctx.strokeStyle = withAlpha(this.theme.grid, 0.5);
        ctx.lineWidth = 1;
        ctx.beginPath();
        for (const t of xT.minor) {
          const px = xScale(t);
          if (!Number.isFinite(px)) continue;
          ctx.moveTo(Math.round(px) + 0.5, plot.y);
          ctx.lineTo(Math.round(px) + 0.5, plot.y + plot.h);
        }
        ctx.stroke();
      }
      for (const t of xT.major) {
        const px = xScale(t);
        if (!Number.isFinite(px)) continue;
        ctx.textAlign =
          px < plot.x + 24
            ? "left"
            : px > plot.x + plot.w - 24
              ? "right"
              : "center";
        ctx.fillText(fmtX(t), px, plot.y + plot.h + 6);
      }
    }
    if (this.options.type === "bar" || this.options.type === "combo") {
      const y0 = this.options.yScale === "log" ? yScale.domain[0] : 0;
      const base = Math.round(yScale(y0)) + 0.5;
      if (base >= plot.y && base <= plot.y + plot.h + 1) {
        ctx.strokeStyle = this.theme.axisBaseline;
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(plot.x, base);
        ctx.lineTo(plot.x + plot.w, base);
        ctx.stroke();
      }
    }
    this.backend.blitGrid();
    this.gridKey = key;
  }

  /** key of the last fully rasterized frame — repeat renders are skipped */
  private frameKey: string | null = null;

  private render(t: number): void {
    // whole-frame memo: identical (data, view, layout, hover, gpu state)
    // produces identical pixels — the previous frame is already on screen
    const dom = this.view;
    const plot = this.backend.plot;
    let hid = "";
    for (const h of this.hidden) hid += h + ",";
    const gpu = this.gpu;
    const key = `${t}|${this.dataRev}|${this.backend.gridRev}|${dom.x[0]}|${dom.x[1]}|${dom.y[0]}|${dom.y[1]}|${plot.x}|${plot.y}|${plot.w}|${plot.h}|${hid}|${JSON.stringify(this.hover)}|${gpu ? (gpu.unavailable ? 2 : 1) : 0}`;
    if (this.frameKey === key) return;
    this.frameKey = key;
    this.backend.begin();
    const scales = this.makeScales();
    this.drawStatic(scales);
    if (this.gpu) this.gpuRender(t, scales);
    else this.mod.render(this.renderContext(t, scales));
    if (this.hover) this.drawHover(this.hover, scales.yScale);
  }

  /**
   * Series rasterization on the GPU; grid/labels/hover stay on Canvas2D.
   * Raw data lives in GPU buffers — the per-frame cost is uniform writes +
   * instanced draws, with compute decimation above the density threshold.
   */
  private gpuRender(
    t: number,
    scales: {
      xScale: ReturnType<typeof linearScale>;
      yScale: ReturnType<typeof linearScale>;
    },
  ): void {
    const g = this.gpu;
    const d = this.data;
    const kind = GPU_KIND[this.options.type];
    if (!g || g.unavailable || !kind || d.kind !== "xy") {
      this.mod.render(this.renderContext(t, scales));
      return;
    }
    g.syncData(d, this.dataRev);
    const view = { x: scales.xScale.domain, y: scales.yScale.domain };
    const flow = this.options.flow ? FLOW_RIPPLE : 0;
    g.begin(this.backend.plot, t, flow);
    for (let i = 0; i < d.series.length; i++) {
      const s = d.series[i];
      if (!s || this.hidden.has(i)) continue;
      if (kind === "points") {
        g.points(i, s.color, 2.5, 0.65, view);
        continue;
      }
      if (kind === "area") {
        g.area(i, s.color, Math.max(0, scales.yScale.domain[0]), view);
      }
      g.line(i, s.color, 2, view);
    }
    g.end();
  }

  /** repaint the overlay layer: persistent selection marker, then hover marks */
  private paintOverlay(): void {
    this.backend.beginOverlay();
    const scales = this.makeScales();
    if (this.selected) this.drawSelected(this.selected, scales.yScale);
    if (this.hover) this.drawHover(this.hover, scales.yScale);
  }

  private drawSelected(info: HoverInfo, yScale: Scale): void {
    const o = this.backend.overlay;
    if (info.kind === "point" || info.kind === "candle") {
      for (const v of info.kind === "point" ? info.values : []) {
        const yy = yScale(v.y);
        if (!Number.isFinite(yy)) continue;
        o.strokeStyle = v.color;
        o.lineWidth = 2;
        o.beginPath();
        o.arc(info.px, yy, 6, 0, Math.PI * 2);
        o.stroke();
      }
      if (info.kind === "candle" && Number.isFinite(info.py)) {
        o.strokeStyle = this.theme.crosshair;
        o.lineWidth = 2;
        o.beginPath();
        o.arc(info.px, info.py, 6, 0, Math.PI * 2);
        o.stroke();
      }
    } else if (info.kind === "bar") {
      o.strokeStyle = info.color;
      o.lineWidth = 2;
      o.setLineDash([4, 3]);
      o.strokeRect(
        info.rect.x + 1,
        info.rect.y + 1,
        Math.max(0, info.rect.w - 2),
        Math.max(0, info.rect.h - 2),
      );
      o.setLineDash([]);
    } else {
      o.fillStyle = withAlpha(info.color, 0.35);
      const d = this.data;
      if (d.kind === "donut") {
        this.paintSlice(info.index, o, 1);
      }
    }
  }

  /** fill one donut slice on the overlay ctx (t=1 angles, hidden-aware) */
  private paintSlice(
    index: number,
    o: CanvasRenderingContext2D,
    alphaMul: number,
  ): void {
    const d = this.data;
    if (d.kind !== "donut") return;
    const plot = this.backend.plot;
    const cx = plot.x + plot.w / 2;
    const cy = plot.y + plot.h / 2;
    const rOuter = Math.min(plot.w, plot.h) / 2;
    const rInner = this.options.type === "pie" ? 0 : rOuter * 0.65;
    let total = 0;
    for (let i = 0; i < d.slices.length; i++) {
      if (!this.hidden.has(i)) total += d.slices[i]?.value ?? 0;
    }
    let a = -Math.PI / 2;
    for (let i = 0; i < d.slices.length; i++) {
      const s = d.slices[i];
      if (!s) continue;
      const frac = total > 0 && !this.hidden.has(i) ? s.value / total : 0;
      const a1 = a + frac * Math.PI * 2;
      if (i === index && frac > 0) {
        o.fillStyle = withAlpha(s.color, 0.25 * alphaMul);
        o.beginPath();
        o.arc(cx, cy, rOuter, a, a1);
        o.arc(cx, cy, rInner, a1, a, true);
        o.closePath();
        o.fill();
      }
      a = a1;
    }
  }

  private drawHover(info: HoverInfo, yScale: Scale): void {
    const o = this.backend.overlay;
    const plot = this.backend.plot;
    if (info.kind === "point" && this.options.type === "radar") {
      drawRadarHover(this.renderContext(1), info);
      return;
    }
    if (info.kind === "point" || info.kind === "candle") {
      o.strokeStyle = this.theme.crosshair;
      o.lineWidth = 1;
      o.beginPath();
      const x = Math.round(info.px) + 0.5;
      o.moveTo(x, plot.y);
      o.lineTo(x, plot.y + plot.h);
      o.stroke();
      const d = this.data;
      if (info.kind === "point" && (d.kind === "xy" || d.kind === "category")) {
        for (const v of info.values) {
          const s = d.series.find(
            (s2) => s2.label === v.label && s2.color === v.color,
          );
          const yv = s
            ? "y" in s
              ? s.y[info.index]
              : s.values[info.index]
            : v.y;
          const yy = yScale(yv as number);
          if (!Number.isFinite(yy)) continue;
          o.fillStyle = v.color;
          o.strokeStyle = this.theme.bg;
          o.lineWidth = 2;
          o.beginPath();
          o.arc(info.px, yy, 4, 0, Math.PI * 2);
          o.fill();
          o.stroke();
        }
      }
    } else if (info.kind === "bar") {
      o.fillStyle = withAlpha(this.theme.text, 0.12);
      o.fillRect(info.rect.x, info.rect.y, info.rect.w, info.rect.h);
    } else {
      this.paintSlice(info.index, o, 1);
    }
  }

  private applyHover(px: number, py: number): void {
    const hit = this.mod.hit;
    if (!hit) return;
    const info = hit(this.renderContext(1), px, py);
    if (!info) {
      if (this.hover) {
        this.hover = null;
        this.paintOverlay();
        this.tooltip?.hide();
        this.options.onHover?.(null);
      }
      return;
    }
    this.hover = info;
    this.paintOverlay();
    this.options.onHover?.(info);
    if (!this.tooltip) return;
    const fmtY = this.options.labels?.y ?? formatSI;
    const tipOpt = this.options.tooltip;
    const format = typeof tipOpt === "object" ? tipOpt.format : undefined;
    if (format) {
      const fmtX = this.xFormatter(this.view.x);
      const content = format(info, { x: fmtX, y: fmtY });
      if (content == null) {
        this.tooltip.hide();
      } else if (typeof content === "string") {
        this.tooltip.show(info.px, info.py, [], undefined, { text: content });
      } else {
        this.tooltip.show(
          info.px,
          info.py,
          content.rows ?? [],
          content.title,
          content.html != null ? { html: content.html } : undefined,
        );
      }
      return;
    }
    if (info.kind === "point") {
      const fmtX = this.xFormatter(this.view.x);
      this.tooltip.show(
        info.px,
        info.py,
        info.values.map((v) => ({
          color: v.color,
          label: v.label,
          value: fmtY(v.y),
        })),
        info.title ?? fmtX(info.x),
      );
    } else if (info.kind === "bar") {
      this.tooltip.show(
        info.px,
        info.py,
        [{ color: info.color, label: info.label, value: fmtY(info.value) }],
        info.category,
      );
    } else if (info.kind === "candle") {
      const fmtX = this.xFormatter(this.view.x);
      this.tooltip.show(
        info.px,
        info.py,
        [
          { label: "Open", value: fmtY(info.open) },
          { label: "High", value: fmtY(info.high) },
          { label: "Low", value: fmtY(info.low) },
          { label: "Close", value: fmtY(info.close) },
        ],
        fmtX(info.x),
      );
    } else {
      this.tooltip.show(
        info.px,
        info.py,
        [{ color: info.color, label: info.label, value: fmtY(info.value) }],
        `${Math.round(info.share * 100)}%`,
      );
    }
  }

  private resolveAnimDur(): number {
    if (this.reduced) return 0;
    const a = this.options.animate ?? true;
    if (typeof a === "number") return Math.max(0, a);
    if (!a) return 0;
    // flow mode: tween for the measured append cadence so the pan finishes
    // exactly when the next sample arrives — perpetual motion, zero lag
    if (this.options.flow) {
      return Math.min(10_000, Math.max(60, this.estInterval));
    }
    return 400;
  }

  private startAnimation(
    dom: { x: [number, number]; y: [number, number] } = this.domains(),
  ): void {
    this.animDur = this.resolveAnimDur();
    this.viewFrom = {
      x: [this.view.x[0], this.view.x[1]],
      y: [this.view.y[0], this.view.y[1]],
    };
    this.viewTo = dom;
    this.animStart = -1;
    sharedScheduler.add(this.frame);
  }

  /** Replace the chart data; the view morphs to the new dataset. */
  setData(data: ChartData): void {
    const prev = this.data;
    this.data = this.normalize(data, prev);
    this.dataRev++;
    this.domCache = null;
    this.legend?.setItems(this.legendItems(), this.hidden);
    this.maybeInitGpu();
    const dom = this.layout();
    this.startAnimation(dom);
  }

  /**
   * Append one sample to every series of an xy chart (line/area/scatter/
   * sparkline). With `options.window`, old points are dropped FIFO and the
   * viewport pans smoothly. Non-monotonic x falls back to a resort.
   */
  append(x: number, y: number | number[]): void {
    const d = this.data;
    if (!Number.isFinite(x)) return;
    if (this.options.xScale === "log" && x <= 0) return;
    if (d.kind !== "xy") {
      throw new Error(
        "[resolvcharts] append() requires xy data (line/area/scatter/bubble/rangearea/sparkline)",
      );
    }
    // EMA of append cadence — drives flow-mode tween duration
    const nowT =
      typeof performance === "undefined" ? Date.now() : performance.now();
    if (this.lastAppendAt > 0) {
      const dt = nowT - this.lastAppendAt;
      if (dt > 0 && dt < 60_000) {
        this.estInterval = this.estInterval * 0.7 + dt * 0.3;
      }
    }
    this.lastAppendAt = nowT;

    const logY = this.options.yScale === "log";
    const invLb = 1 / Math.log(this.options.logBase ?? 10);
    const ys = Array.isArray(y) ? y : [y];
    const n = d.sortedX.length;
    // retention cap: maxPoints wins, else window; the EDGE_KEEP margin keeps
    // outgoing points in the buffer so they animate fully off-screen
    const win = this.options.window;
    const cap =
      this.options.maxPoints != null
        ? this.options.maxPoints + EDGE_KEEP
        : win != null
          ? win + EDGE_KEEP
          : undefined;
    const drop = cap != null ? Math.max(0, n + 1 - cap) : 0;
    const m = n + 1 - drop;
    const steady = drop === 1;

    let sortedX: Float64Array;
    let sortedXLog: Float64Array | undefined;
    if (steady) {
      // window full: shift in place instead of reallocating
      sortedX = d.sortedX;
      sortedX.copyWithin(0, 1);
      sortedX[n - 1] = x;
      sortedXLog = d.sortedXLog;
      if (sortedXLog) {
        sortedXLog.copyWithin(0, 1);
        sortedXLog[n - 1] = x > 0 ? Math.log(x) * invLb : NaN;
      }
    } else {
      sortedX = new Float64Array(m);
      sortedX.set(d.sortedX.subarray(drop));
      sortedX[m - 1] = x;
      if (d.sortedXLog) {
        sortedXLog = new Float64Array(m);
        sortedXLog.set(d.sortedXLog.subarray(drop));
        sortedXLog[m - 1] = x > 0 ? Math.log(x) * invLb : NaN;
      }
    }

    const series = d.series.map((s, i) => {
      const v = ys[i] ?? s.y[n - 1] ?? 0;
      let yNew: Float64Array;
      let prevY: Float64Array;
      if (steady) {
        // shifted in place, s.y now holds the previous alignment and its
        // last slot already equals yNew[m-2] — reuse it as prevY; recycle
        // the old prevY buffer as yNew so steady-state appends don't alloc
        s.y.copyWithin(0, 1);
        prevY = s.y;
        yNew = s.prevY && s.prevY.length === m ? s.prevY : new Float64Array(m);
        yNew.set(prevY);
        yNew[m - 1] = v;
      } else {
        yNew = new Float64Array(m);
        yNew.set(s.y.subarray(drop));
        yNew[m - 1] = v;
        prevY = new Float64Array(m);
        prevY.set(s.y.subarray(drop));
        prevY[m - 1] =
          m > 1 ? (yNew[m - 2] as number) : (yNew[m - 1] as number);
      }
      // auxiliary channels (bubble r, rangearea y2) ride along — the new
      // tail duplicates the last retained value
      let rNew: Float64Array | null = null;
      if (s.r) {
        rNew = new Float64Array(m);
        rNew.set(s.r.subarray(drop));
        rNew[m - 1] = s.r[n - 1] as number;
      }
      let y2New: Float64Array | null = null;
      let prevY2: Float64Array | null = null;
      if (s.y2) {
        y2New = new Float64Array(m);
        y2New.set(s.y2.subarray(drop));
        y2New[m - 1] = s.y2[n - 1] as number;
        prevY2 = new Float64Array(m);
        prevY2.set(s.y2.subarray(drop));
        prevY2[m - 1] =
          m > 1 ? (y2New[m - 2] as number) : (y2New[m - 1] as number);
      }
      // display-space log channels mirror the raw copies — the new tail
      // transforms once, the rest shifts like the raw arrays
      let yLogNew: Float64Array | undefined;
      let prevYLog: Float64Array | null = null;
      if (logY) {
        const lv = v > 0 ? Math.log(v) * invLb : NaN;
        const sl = s.yLog;
        if (steady && sl) {
          sl.copyWithin(0, 1);
          prevYLog = sl;
          yLogNew =
            s.prevYLog && s.prevYLog.length === m
              ? s.prevYLog
              : new Float64Array(m);
          yLogNew.set(prevYLog);
          yLogNew[m - 1] = lv;
        } else if (sl) {
          yLogNew = new Float64Array(m);
          yLogNew.set(sl.subarray(drop));
          yLogNew[m - 1] = lv;
          prevYLog = new Float64Array(m);
          prevYLog.set(sl.subarray(drop));
          prevYLog[m - 1] = m > 1 ? (yLogNew[m - 2] as number) : lv;
        } else {
          yLogNew = logMap(yNew, invLb);
          prevYLog = logMap(prevY, invLb);
        }
      }
      let y2LogNew: Float64Array | null = null;
      let prevY2Log: Float64Array | null = null;
      if (logY && y2New) {
        const w = y2New[m - 1] as number;
        const s2l = s.y2Log;
        if (s2l) {
          y2LogNew = new Float64Array(m);
          y2LogNew.set(s2l.subarray(drop));
          y2LogNew[m - 1] = w > 0 ? Math.log(w) * invLb : NaN;
          prevY2Log = new Float64Array(m);
          prevY2Log.set(s2l.subarray(drop));
          prevY2Log[m - 1] =
            m > 1 ? (y2LogNew[m - 2] as number) : (y2LogNew[m - 1] as number);
        } else {
          y2LogNew = logMap(y2New, invLb);
          prevY2Log = prevY2 ? logMap(prevY2, invLb) : null;
        }
      }
      // shift the break index with the buffer, extend if the tail breaks
      let gapIdx = s.gapIdx;
      if (gapIdx && drop > 0) {
        let w = 0;
        for (let j = 0; j < gapIdx.length; j++) {
          const g = (gapIdx[j] as number) - drop;
          if (g >= 0) gapIdx[w++] = g;
        }
        gapIdx.length = w;
        if (w === 0) gapIdx = undefined;
      }
      const bad =
        !Number.isFinite(v) ||
        (logY && v <= 0) ||
        (y2New !== null &&
          (!Number.isFinite(y2New[m - 1] as number) ||
            (logY && (y2New[m - 1] as number) <= 0)));
      if (bad) {
        if (!gapIdx) gapIdx = [];
        gapIdx.push(m - 1);
      }
      return {
        label: s.label,
        color: s.color,
        y: yNew,
        prevY,
        yLog: yLogNew,
        prevYLog,
        r: rNew,
        y2: y2New,
        prevY2,
        y2Log: y2LogNew,
        prevY2Log,
        hasGaps: s.hasGaps || !Number.isFinite(v),
        gapIdx,
        pathCache: null,
      };
    });

    const nd: NormalizedXY = { kind: "xy", sortedX, sortedXLog, series };
    const resort = m > 1 && x < (sortedX[m - 2] as number);
    if (resort) {
      resortXY(nd);
      // reorder invalidates positional indices — rescan
      for (const s of nd.series) {
        let g: number[] | undefined;
        for (let i = 0; i < s.y.length; i++) {
          const v = s.y[i] as number;
          if (!Number.isFinite(v) || (logY && v <= 0)) {
            if (!g) g = [];
            g.push(i);
          }
        }
        s.gapIdx = g;
      }
    }
    this.data = nd;
    this.domCache = null;
    if (resort) {
      this.dataRev++;
    } else if (this.gpu && !this.gpu.unavailable) {
      // ring-buffer path: only the appended tail reaches the GPU. s.y[n-1]
      // still holds the pre-append tail value (steady state shifts in place),
      // which is what the new point animates up from
      const ok = this.gpu.appended(
        x,
        d.series.map((s, i) => ys[i] ?? (s.y[n - 1] as number)),
        d.series.map((s) => s.y[n - 1] as number),
        drop,
      );
      if (!ok) this.dataRev++;
    }
    this.maybeInitGpu();
    this.pendingView = true;
    sharedScheduler.add(this.frame);
  }

  /** Re-measure the container and re-render (called automatically via ResizeObserver). */
  resize(): void {
    const w = this.el.clientWidth || 320;
    const h =
      this.el.clientHeight || (this.options.type === "sparkline" ? 32 : 240);
    if (w === this.backend.width && h === this.backend.height) {
      if (this.backend.dpr === (window.devicePixelRatio || 1)) return;
    }
    this.backend.resize(w, h);
    this.gpu?.setSize(w, h, this.backend.dpr);
    this.legend?.invalidate();
    this.rect = null;
    this.layout();
    this.animStart = null;
    sharedScheduler.add((now) => {
      this.render(1);
      void now;
      return false;
    });
  }

  /** Remove listeners, stop animation, release canvases and GPU resources. */
  destroy(): void {
    this.destroyed = true;
    sharedScheduler.remove(this.frame);
    this.ro?.disconnect();
    this.el.removeEventListener("pointermove", this.onMove);
    this.el.removeEventListener("pointerleave", this.onLeave);
    this.el.removeEventListener("pointerdown", this.onDown);
    this.el.removeEventListener("pointerup", this.onUp);
    this.el.removeEventListener("wheel", this.onWheel);
    this.el.removeEventListener("dblclick", this.onDbl);
    window.removeEventListener("scroll", this.onScroll, true);
    this.tooltip?.destroy();
    this.legend?.destroy();
    this.gpu?.destroy();
    this.backend.destroy();
  }
}

/** `log_b` display-space copy — non-positive and non-finite become NaN. */
function logMap(a: Float64Array, invL: number): Float64Array {
  const o = new Float64Array(a.length);
  for (let i = 0; i < a.length; i++) {
    const v = a[i] as number;
    o[i] = v > 0 ? Math.log(v) * invL : NaN;
  }
  return o;
}

function resortXY(d: NormalizedXY): void {
  const n = d.sortedX.length;
  const idx = new Uint32Array(n);
  for (let i = 0; i < n; i++) idx[i] = i;
  const xs = d.sortedX;
  idx.sort((a, b) => (xs[a] as number) - (xs[b] as number));
  const sx = new Float64Array(n);
  const sxl = d.sortedXLog ? new Float64Array(n) : null;
  for (let i = 0; i < n; i++) {
    const k = idx[i] as number;
    sx[i] = xs[k] as number;
    if (sxl && d.sortedXLog) sxl[i] = d.sortedXLog[k] as number;
  }
  d.sortedX = sx;
  if (sxl) d.sortedXLog = sxl;
  for (const s of d.series) {
    const ny = new Float64Array(n);
    const np = s.prevY ? new Float64Array(n) : null;
    const nl = s.yLog ? new Float64Array(n) : null;
    const npl = s.prevYLog ? new Float64Array(n) : null;
    const nr = s.r ? new Float64Array(n) : null;
    const ny2 = s.y2 ? new Float64Array(n) : null;
    const np2 = s.prevY2 ? new Float64Array(n) : null;
    const nl2 = s.y2Log ? new Float64Array(n) : null;
    const np2l = s.prevY2Log ? new Float64Array(n) : null;
    for (let i = 0; i < n; i++) {
      const k = idx[i] as number;
      ny[i] = s.y[k] as number;
      if (np && s.prevY) np[i] = s.prevY[k] as number;
      if (nl && s.yLog) nl[i] = s.yLog[k] as number;
      if (npl && s.prevYLog) npl[i] = s.prevYLog[k] as number;
      if (nr && s.r) nr[i] = s.r[k] as number;
      if (ny2 && s.y2) ny2[i] = s.y2[k] as number;
      if (np2 && s.prevY2) np2[i] = s.prevY2[k] as number;
      if (nl2 && s.y2Log) nl2[i] = s.y2Log[k] as number;
      if (np2l && s.prevY2Log) np2l[i] = s.prevY2Log[k] as number;
    }
    s.y = ny;
    s.prevY = np;
    s.yLog = nl ?? undefined;
    s.prevYLog = npl;
    s.r = nr;
    s.y2 = ny2;
    s.prevY2 = np2;
    s.y2Log = nl2;
    s.prevY2Log = np2l;
  }
}

/**
 * Create a chart inside `el`.
 * @category Charts
 *
 * @example
 * ```ts
 * const chart = createChart(document.getElementById("c")!, {
 *   type: "line",
 *   curve: "smooth",
 *   flow: true,
 *   window: 30,
 *   data: { x: xs, series: [{ label: "cpu", y: ys }] },
 * });
 * setInterval(() => chart.append(Date.now(), sample()), 2000);
 * ```
 */
export function createChart(el: HTMLElement, options: ChartOptions): Chart {
  return new Chart(el, options);
}
