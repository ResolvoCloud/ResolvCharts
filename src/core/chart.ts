import { hitBar, renderBar } from "../charts/bar";
import { hitBaseline, renderBaseline } from "../charts/baseline";
import { hitCandle, renderCandles } from "../charts/candle";
import { hitDonut, renderDonut } from "../charts/donut";
import { FLOW_RIPPLE, hitXY, renderLine, seriesPoints } from "../charts/line";
import type { RenderContext } from "../charts/registry";
import { hitScatter, renderScatter } from "../charts/scatter";
import { hitSparkline, renderSparkline } from "../charts/sparkline";
import { hitWaterfall, renderWaterfall } from "../charts/waterfall";
import { CanvasBackend } from "./canvas";
import { withAlpha } from "./color";
import { mapSeriesPx } from "./decimate";
import { formatSI } from "./format";
import { extent, linearScale, padDomain } from "./scales";
import { easeOutCubic, sharedScheduler } from "./scheduler";
import { resolveTheme, seriesColor } from "./theme";
import { computeTicks } from "./ticks";
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
  ThemeTokens,
  WaterfallBar,
  WaterfallData,
  XYData,
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
  bar: { render: renderBar, hit: hitBar, axes: true, defaultTooltip: true },
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
  private lastAppendAt = 0;
  private estInterval = 400;
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
    this.backend = new CanvasBackend(el, w, h);
    this.reduced =
      typeof matchMedia === "function" &&
      matchMedia("(prefers-reduced-motion: reduce)").matches;
    const wantTooltip = options.tooltip ?? this.mod.defaultTooltip;
    if (wantTooltip) this.tooltip = new Tooltip(el, this.theme);
    this.data = this.normalize(options.data, null);
    const wantGpu =
      GPU_KIND[options.type] &&
      (options.renderer === "webgpu" || options.renderer === "auto");
    if (wantGpu) {
      void import("../gpu/series").then(({ GpuSeries }) =>
        GpuSeries.create(options.gpu).then((g) => {
          if (!g || this.destroyed) {
            g?.destroy();
            return;
          }
          g.setSize(this.backend.width, this.backend.height, this.backend.dpr);
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
    this.bindEvents();
    const dom = this.layout();
    this.view = { x: [...dom.x], y: [...dom.y] };
    this.viewTo = { x: [...dom.x], y: [...dom.y] };
    this.startAnimation(dom);
  }

  private normalize(
    data: ChartData,
    prev: NormalizedData | null,
  ): NormalizedData {
    const t = this.options.type;
    if (t === "candle" || t === "ohlc") {
      const d = data as OHLCData;
      const n = d.candles.length;
      let idx: Uint32Array | null = null;
      for (let i = 1; i < n; i++) {
        if ((d.candles[i]?.x ?? i) < (d.candles[i - 1]?.x ?? i - 1)) {
          idx = new Uint32Array(n);
          for (let k = 0; k < n; k++) idx[k] = k;
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
      for (let i = 0; i < n; i++) {
        const c = d.candles[idx ? (idx[i] as number) : i];
        x[i] = c?.x ?? i;
        open[i] = c?.open ?? 0;
        high[i] = c?.high ?? 0;
        low[i] = c?.low ?? 0;
        close[i] = c?.close ?? 0;
        volume[i] = c?.volume ?? 0;
        if (c?.volume != null && c.volume > 0) hasVol = true;
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
        const v = d.values[i] ?? 0;
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
    if (t === "donut") {
      const d = data as DonutData;
      const slices = d.slices.map((s, i) => ({
        label: s.label,
        value: s.value,
        color: seriesColor(this.theme, i, s.color),
      }));
      const total = slices.reduce((a, s) => a + Math.max(0, s.value), 0);
      return { kind: "donut", slices, total };
    }
    if (t === "bar") {
      const d = data as CategoryData;
      const prevSeries = prev?.kind === "category" ? prev.series : [];
      return {
        kind: "category",
        categories: [...d.categories],
        series: d.series.map((s, i) => ({
          label: s.label ?? `Series ${i + 1}`,
          color: seriesColor(this.theme, i, s.color),
          values: Float64Array.from(s.values),
          prevValues: prevSeries[i]?.values ?? null,
        })),
      };
    }
    const d = data as XYData;
    const xRaw = Float64Array.from(d.x);
    const n = xRaw.length;
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
    return {
      kind: "xy",
      sortedX,
      series: d.series.map((s, i) => {
        const y = new Float64Array(n);
        const src = s.y;
        if (idx) {
          for (let k = 0; k < n; k++) y[k] = src[idx[k] as number] as number;
        } else {
          for (let k = 0; k < n; k++) y[k] = src[k] as number;
        }
        return {
          label: s.label ?? `Series ${i + 1}`,
          color: seriesColor(this.theme, i, s.color),
          y,
          prevY: prevSeries[i]?.y ?? null,
          pathCache: null,
        };
      }),
    };
  }

  private bindEvents(): void {
    this.el.addEventListener("pointermove", this.onMove, { passive: true });
    this.el.addEventListener("pointerleave", this.onLeave, { passive: true });
    window.addEventListener("scroll", this.onScroll, true);
    if (typeof ResizeObserver === "function") {
      this.ro = new ResizeObserver(() => this.resize());
      this.ro.observe(this.el);
    }
  }

  private onMove = (e: PointerEvent): void => {
    if (!this.rect) this.rect = this.el.getBoundingClientRect();
    this.pointer = {
      x: e.clientX - this.rect.left,
      y: e.clientY - this.rect.top,
    };
    sharedScheduler.add(this.frame);
  };

  private onLeave = (): void => {
    this.pointer = null;
    if (this.hover) {
      this.hover = null;
      this.backend.beginOverlay();
      this.tooltip?.hide();
      this.options.onHover?.(null);
    }
  };

  private layout(): { x: [number, number]; y: [number, number] } {
    const w = this.backend.width;
    const h = this.backend.height;
    const mod = this.mod;
    const dom = this.domains();
    if (!mod.axes) {
      this.backend.setPlot({ x: 2, y: 2, w: w - 4, h: h - 4 });
      return dom;
    }
    const ctx = this.backend.main;
    const fmtY = this.options.labels?.y ?? formatSI;
    const plotH = Math.max(1, h - 8 - LABEL_H);
    const yTicks =
      this.data.kind === "donut"
        ? []
        : computeTicks(dom.y[0], dom.y[1], Math.max(3, Math.floor(plotH / 48)));
    let gutter = 0;
    if (yTicks.length) {
      ctx.font = `11px ${this.theme.fontFamily}`;
      for (const t of yTicks) {
        gutter = Math.max(gutter, ctx.measureText(fmtY(t)).width);
      }
      gutter += GUTTER_PAD;
    }
    const plot: Rect = {
      x: gutter,
      y: 8,
      w: Math.max(1, w - gutter - 8),
      h: plotH,
    };
    this.backend.setPlot(plot);
    return dom;
  }

  private domains(): { x: [number, number]; y: [number, number] } {
    const d = this.data;
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
      for (const s of d.series) {
        const y = s.y;
        for (let i = Math.min(x0, y.length); i < y.length; i++) {
          const v = y[i] as number;
          if (v < min) min = v;
          if (v > max) max = v;
        }
      }
      if (min === Infinity) {
        min = 0;
        max = 1;
      }
      const includeZero =
        this.options.type === "area" || this.options.type === "sparkline";
      return { x, y: padDomain(min, max, includeZero) };
    }
    if (d.kind === "category") {
      let min = Infinity;
      let max = -Infinity;
      if (this.options.stacked) {
        for (let ci = 0; ci < d.categories.length; ci++) {
          let pos = 0;
          let neg = 0;
          for (const s of d.series) {
            const v = s.values[ci] ?? 0;
            if (v >= 0) pos += v;
            else neg += v;
          }
          min = Math.min(min, neg);
          max = Math.max(max, pos);
        }
      } else {
        for (const s of d.series) {
          const e = extent(s.values);
          min = Math.min(min, e[0]);
          max = Math.max(max, e[1]);
        }
      }
      if (min === Infinity) {
        min = 0;
        max = 1;
      }
      return { x: [0, d.categories.length], y: padDomain(min, max, true) };
    }
    if (d.kind === "ohlc") {
      const x = extent(d.x);
      let min = Infinity;
      let max = -Infinity;
      for (let i = 0; i < d.x.length; i++) {
        const lo = d.low[i] as number;
        const hi = d.high[i] as number;
        if (lo < min) min = lo;
        if (hi > max) max = hi;
      }
      if (min === Infinity) {
        min = 0;
        max = 1;
      }
      return { x, y: padDomain(min, max) };
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
        y: padDomain(min, max, true),
      };
    }
    return { x: [0, 1], y: [0, 1] };
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

  private makeScales(): {
    xScale: ReturnType<typeof linearScale>;
    yScale: ReturnType<typeof linearScale>;
  } {
    const plot = this.backend.plot;
    const dom = this.view;
    const volBand =
      this.data.kind === "ohlc" && this.data.volume ? plot.h * 0.18 : 0;
    return {
      xScale: linearScale(dom.x[0], dom.x[1], plot.x, plot.x + plot.w),
      yScale: linearScale(
        dom.y[0],
        dom.y[1],
        plot.y + plot.h - volBand,
        plot.y,
      ),
    };
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
      xScale,
      yScale,
      t,
    };
  }

  private drawStatic(scales = this.makeScales()): void {
    if (!this.mod.axes) return;
    const ctx = this.backend.grid();
    const plot = this.backend.plot;
    const { xScale, yScale } = scales;
    const fmtY = this.options.labels?.y ?? formatSI;
    ctx.font = `11px ${this.theme.fontFamily}`;
    ctx.fillStyle = this.theme.textMuted;

    const showGrid = this.options.grid ?? true;
    const yTicks = computeTicks(
      yScale.domain[0],
      yScale.domain[1],
      Math.max(3, Math.floor(plot.h / 48)),
    );
    if (showGrid) {
      ctx.strokeStyle = this.theme.grid;
      ctx.lineWidth = 1;
      ctx.beginPath();
      for (const t of yTicks) {
        const y = Math.round(yScale(t)) + 0.5;
        ctx.moveTo(plot.x, y);
        ctx.lineTo(plot.x + plot.w, y);
      }
      ctx.stroke();
    }
    ctx.textAlign = "right";
    ctx.textBaseline = "middle";
    for (const t of yTicks) {
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
      const fmtX = this.options.labels?.x ?? formatSI;
      const xTicks = computeTicks(
        xScale.domain[0],
        xScale.domain[1],
        Math.max(3, Math.floor(plot.w / 90)),
      );
      for (const t of xTicks) {
        const px = xScale(t);
        ctx.textAlign =
          px < plot.x + 24
            ? "left"
            : px > plot.x + plot.w - 24
              ? "right"
              : "center";
        ctx.fillText(fmtX(t), px, plot.y + plot.h + 6);
      }
    }
    if (this.options.type === "bar") {
      const base = Math.round(yScale(0)) + 0.5;
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
  }

  private render(t: number): void {
    this.backend.begin();
    const scales = this.makeScales();
    this.drawStatic(scales);
    if (this.gpu) this.gpuRender(t, scales);
    else this.mod.render(this.renderContext(t, scales));
    if (this.hover) this.drawHover(this.hover, scales.yScale);
  }

  /** series rasterization on the GPU; grid/labels/hover stay on Canvas2D */
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
    if (!g || !kind || d.kind !== "xy") {
      this.mod.render(this.renderContext(t, scales));
      return;
    }
    const r = this.renderContext(t, scales);
    const flow = this.options.flow ? FLOW_RIPPLE : 0;
    g.begin(this.backend.plot);
    for (const s of d.series) {
      if (kind === "points") {
        const pts = mapSeriesPx(
          d.sortedX,
          s.y,
          s.prevY,
          t,
          scales.yScale.domain[0],
          scales.xScale,
          scales.yScale,
          flow,
        );
        g.points(pts, s.color, 2.5, 0.65);
        continue;
      }
      const pts = seriesPoints(r, s);
      if (kind === "area") {
        const base = scales.yScale(Math.max(0, scales.yScale.domain[0]));
        g.area(pts, s.color, base, this.backend.plot);
      }
      g.line(pts, s.color, 2);
    }
    g.end();
  }

  private drawHover(info: HoverInfo, yScale = this.makeScales().yScale): void {
    const o = this.backend.overlay;
    const plot = this.backend.plot;
    this.backend.beginOverlay();
    if (info.kind === "point" || info.kind === "candle") {
      o.strokeStyle = this.theme.crosshair;
      o.lineWidth = 1;
      o.beginPath();
      const x = Math.round(info.px) + 0.5;
      o.moveTo(x, plot.y);
      o.lineTo(x, plot.y + plot.h);
      o.stroke();
      const d = this.data;
      if (d.kind === "xy" && info.kind === "point") {
        for (const v of info.values) {
          const s = d.series.find(
            (s2) => s2.label === v.label && s2.color === v.color,
          );
          const yv = s ? s.y[info.index] : v.y;
          o.fillStyle = v.color;
          o.strokeStyle = this.theme.bg;
          o.lineWidth = 2;
          o.beginPath();
          o.arc(info.px, yScale(yv as number), 4, 0, Math.PI * 2);
          o.fill();
          o.stroke();
        }
      }
    } else if (info.kind === "bar") {
      o.fillStyle = withAlpha(this.theme.text, 0.12);
      o.fillRect(info.rect.x, info.rect.y, info.rect.w, info.rect.h);
    } else {
      o.fillStyle = withAlpha(info.color, 0.25);
      const d = this.data;
      if (d.kind === "donut") {
        const cx = plot.x + plot.w / 2;
        const cy = plot.y + plot.h / 2;
        const rOuter = Math.min(plot.w, plot.h) / 2;
        const rInner = rOuter * 0.65;
        let a = -Math.PI / 2;
        for (let i = 0; i < d.slices.length; i++) {
          const s = d.slices[i];
          if (!s) continue;
          const frac = d.total > 0 ? s.value / d.total : 0;
          const a1 = a + frac * Math.PI * 2;
          if (i === info.index) {
            o.beginPath();
            o.arc(cx, cy, rOuter, a, a1);
            o.arc(cx, cy, rInner, a1, a, true);
            o.closePath();
            o.fill();
          }
          a = a1;
        }
      }
    }
  }

  private applyHover(px: number, py: number): void {
    const hit = this.mod.hit;
    if (!hit) return;
    const info = hit(this.renderContext(1), px, py);
    if (!info) {
      if (this.hover) {
        this.hover = null;
        this.backend.beginOverlay();
        this.tooltip?.hide();
        this.options.onHover?.(null);
      }
      return;
    }
    this.hover = info;
    this.drawHover(info);
    this.options.onHover?.(info);
    if (!this.tooltip) return;
    const fmtY = this.options.labels?.y ?? formatSI;
    if (info.kind === "point") {
      const fmtX = this.options.labels?.x ?? formatSI;
      this.tooltip.show(
        info.px,
        info.py,
        info.values.map((v) => ({
          color: v.color,
          label: v.label,
          value: fmtY(v.y),
        })),
        fmtX(info.x),
      );
    } else if (info.kind === "bar") {
      this.tooltip.show(
        info.px,
        info.py,
        [{ color: info.color, label: info.label, value: fmtY(info.value) }],
        info.category,
      );
    } else if (info.kind === "candle") {
      const fmtX = this.options.labels?.x ?? formatSI;
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
    if (d.kind !== "xy") {
      throw new Error(
        "[resolvcharts] append() requires xy data (line/area/scatter/sparkline)",
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
    if (steady) {
      // window full: shift in place instead of reallocating
      sortedX = d.sortedX;
      sortedX.copyWithin(0, 1);
      sortedX[n - 1] = x;
    } else {
      sortedX = new Float64Array(m);
      sortedX.set(d.sortedX.subarray(drop));
      sortedX[m - 1] = x;
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
      return {
        label: s.label,
        color: s.color,
        y: yNew,
        prevY,
        pathCache: null,
      };
    });

    const nd: NormalizedXY = { kind: "xy", sortedX, series };
    if (m > 1 && x < (sortedX[m - 2] as number)) resortXY(nd);
    this.data = nd;
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
    window.removeEventListener("scroll", this.onScroll, true);
    this.tooltip?.destroy();
    this.gpu?.destroy();
    this.backend.destroy();
  }
}

function resortXY(d: NormalizedXY): void {
  const n = d.sortedX.length;
  const idx = new Uint32Array(n);
  for (let i = 0; i < n; i++) idx[i] = i;
  const xs = d.sortedX;
  idx.sort((a, b) => (xs[a] as number) - (xs[b] as number));
  const sx = new Float64Array(n);
  for (let i = 0; i < n; i++) sx[i] = xs[idx[i] as number] as number;
  d.sortedX = sx;
  for (const s of d.series) {
    const ny = new Float64Array(n);
    const np = s.prevY ? new Float64Array(n) : null;
    for (let i = 0; i < n; i++) {
      const k = idx[i] as number;
      ny[i] = s.y[k] as number;
      if (np && s.prevY) np[i] = s.prevY[k] as number;
    }
    s.y = ny;
    s.prevY = np;
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
