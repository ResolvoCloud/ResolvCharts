/// <reference path="./env.d.ts" />
/**
 * Standalone perf harness. Bundled via tsdown, run under node + jsdom.
 * Measures JS-side cost of hot paths; canvas raster is stubbed out.
 */
import { JSDOM } from "jsdom";

// --- DOM / canvas stubs (must precede chart imports at runtime) ------------

class StubPath {
  moveTo(): void {}
  lineTo(): void {}
  bezierCurveTo(): void {}
  quadraticCurveTo(): void {}
  arc(): void {}
  arcTo(): void {}
  ellipse(): void {}
  rect(): void {}
  roundRect(): void {}
  closePath(): void {}
}

function stubCtx(): unknown {
  const noop = () => {};
  const target: Record<string, unknown> = {
    measureText: () => ({ width: 10 }),
    createLinearGradient: () => ({ addColorStop: noop }),
    getLineDash: () => [],
  };
  return new Proxy(target, {
    get(t, p) {
      if (p in t) return t[p as string];
      return noop;
    },
    set() {
      return true;
    },
  });
}

const dom = new JSDOM("<!doctype html><body></body>");
const g = globalThis as Record<string, unknown>;
g.window = dom.window;
g.document = dom.window.document;
g.getComputedStyle = dom.window.getComputedStyle.bind(dom.window);
g.Path2D = StubPath;
g.requestAnimationFrame = (cb: (t: number) => void) =>
  setTimeout(() => cb(performance.now()), 16);
g.cancelAnimationFrame = (id: number) => clearTimeout(id);
dom.window.HTMLCanvasElement.prototype.getContext = (() =>
  stubCtx()) as unknown as typeof dom.window.HTMLCanvasElement.prototype.getContext;

const { buildPath, renderLine } = await import("../src/charts/line");
const { withAlpha } = await import("../src/core/color");
const { renderCandles } = await import("../src/charts/candle");
const { renderScatter } = await import("../src/charts/scatter");
const { renderSparkline } = await import("../src/charts/sparkline");
const { smoothPath } = await import("../src/charts/registry");
const { createChart } = await import("../src/core/chart");
const { decimateM4 } = await import("../src/core/decimate");
const { formatSI } = await import("../src/core/format");
const { nearestIndex } = await import("../src/core/hit");
const { extent, linearScale } = await import("../src/core/scales");
const { computeTicks } = await import("../src/core/ticks");
const { lightTheme } = await import("../src/core/theme");

// --- tiny bench harness ------------------------------------------------------

const results: { name: string; hz: number; ms: number }[] = [];

function bench(name: string, fn: () => void, time = 400): void {
  fn(); // warm
  fn();
  const warmupUntil = performance.now() + Math.min(150, time / 3);
  while (performance.now() < warmupUntil) fn();
  const start = performance.now();
  let iters = 0;
  while (performance.now() - start < time) {
    fn();
    iters++;
  }
  const elapsed = performance.now() - start;
  const hz = (iters / elapsed) * 1000;
  results.push({ name, hz, ms: 1000 / hz });
  console.log(
    `${name.padEnd(52)} ${hz.toFixed(1).padStart(12)} ops/s  ${(1000 / hz).toFixed(3).padStart(10)} ms/op`,
  );
}

// --- data -------------------------------------------------------------------

const N = 100_000;
const xsRaw: number[] = new Array(N);
const ysRaw: number[] = new Array(N);
for (let i = 0; i < N; i++) {
  xsRaw[i] = i;
  ysRaw[i] = 50 + 30 * Math.sin(i / 500) + (i % 17);
}

const sortedX = Float64Array.from(xsRaw);
const y0 = Float64Array.from(ysRaw);
const y1 = Float64Array.from(ysRaw.map((v) => v * 0.7 + 10));

const xyData = {
  kind: "xy",
  sortedX,
  series: [
    { label: "a", color: "#0070f3", y: y0, prevY: null, pathCache: null },
    { label: "b", color: "#0e9f6e", y: y1, prevY: null, pathCache: null },
  ],
};

const plot = { x: 40, y: 8, w: 760, h: 200 };
const xScale = linearScale(0, N - 1, plot.x, plot.x + plot.w);
const yScale = linearScale(0, 100, plot.y + plot.h, plot.y);

const ctx = stubCtx() as CanvasRenderingContext2D;

const baseCtx = {
  backend: null,
  ctx,
  plot,
  theme: lightTheme,
  opts: { type: "line", animate: false, data: { x: [], series: [] } },
  data: xyData,
  hidden: new Set<number>(),
  xScale,
  yScale,
  t: 1,
};

const px = new Float64Array(N);
const py = new Float64Array(N);
for (let i = 0; i < N; i++) {
  px[i] = xScale(sortedX[i] as number);
  py[i] = yScale(y0[i] as number);
}

const M = 50_000;
const ohlc = {
  kind: "ohlc",
  x: new Float64Array(M),
  open: new Float64Array(M),
  high: new Float64Array(M),
  low: new Float64Array(M),
  close: new Float64Array(M),
  volume: new Float64Array(M),
};
let cc = 100;
for (let i = 0; i < M; i++) {
  const o = cc;
  cc += Math.sin(i / 300) * 2;
  ohlc.x[i] = i;
  ohlc.open[i] = o;
  ohlc.close[i] = cc;
  ohlc.high[i] = Math.max(o, cc) + 2;
  ohlc.low[i] = Math.min(o, cc) - 2;
  ohlc.volume[i] = 100 + (i % 500);
}

console.log("\n== normalize: sort vs monotonic check (100k pts) ==");

bench("idx.sort + reorder (current)", () => {
  const n = sortedX.length;
  const idx = new Uint32Array(n);
  for (let i = 0; i < n; i++) idx[i] = i;
  idx.sort((a, b) => (sortedX[a] as number) - (sortedX[b] as number));
  const sx = new Float64Array(n);
  const sy = new Float64Array(n);
  for (let i = 0; i < n; i++) {
    sx[i] = sortedX[idx[i] as number] as number;
    sy[i] = y0[idx[i] as number] as number;
  }
  void sx;
  void sy;
});

bench("monotonic check + copy", () => {
  const n = sortedX.length;
  let mono = true;
  for (let i = 1; i < n; i++) {
    if ((sortedX[i] as number) < (sortedX[i - 1] as number)) {
      mono = false;
      break;
    }
  }
  const sx = mono ? sortedX.slice() : new Float64Array(n);
  const sy = mono ? y0.slice() : new Float64Array(n);
  void sx;
  void sy;
});

console.log("\n== path build: 100k pts -> 760px plot ==");

bench("buildPath 100k (fused map+decimate)", () => {
  buildPath(
    baseCtx as unknown as Parameters<typeof buildPath>[0],
    xyData.series[0] as Parameters<typeof buildPath>[1],
  );
});

bench("decimateM4 alone (pre-mapped px)", () => {
  decimateM4(px, py, plot.w);
});

bench("smoothPath on decimated pts", () => {
  const dec = decimateM4(px, py, plot.w);
  smoothPath(new Path2D(), dec, dec.length / 2);
});

console.log("\n== renderers (stub ctx; JS cost only) ==");

const rCandle = {
  ...baseCtx,
  data: ohlc,
  opts: { type: "candle", data: { candles: [] } },
};
const rSpark = {
  ...baseCtx,
  plot: { x: 2, y: 2, w: 196, h: 28 },
  xScale: linearScale(0, N - 1, 2, 198),
  yScale: linearScale(0, 100, 30, 2),
};

bench("renderLine 2x100k t=1", () =>
  renderLine(baseCtx as unknown as Parameters<typeof renderLine>[0], false),
);
bench("renderCandles 50k + volume", () =>
  renderCandles(
    rCandle as unknown as Parameters<typeof renderCandles>[0],
    false,
  ),
);
bench("renderScatter 100k", () =>
  renderScatter(baseCtx as unknown as Parameters<typeof renderScatter>[0]),
);
bench("renderSparkline 100k (no decimation)", () =>
  renderSparkline(rSpark as unknown as Parameters<typeof renderSparkline>[0]),
);

console.log("\n== Chart end-to-end (jsdom + stub ctx) ==");

bench(
  "createChart line 100k sorted",
  () => {
    const el = document.createElement("div");
    const ch = createChart(el, {
      type: "line",
      animate: false,
      data: { x: xsRaw, series: [{ y: ysRaw }] },
    });
    ch.destroy();
  },
  400,
);

const shuffled = xsRaw.map((_v, i) => (i * 7919) % N);
bench(
  "createChart line 100k shuffled",
  () => {
    const el = document.createElement("div");
    const ch = createChart(el, {
      type: "line",
      animate: false,
      data: { x: shuffled, series: [{ y: ysRaw }] },
    });
    ch.destroy();
  },
  400,
);

const el = document.createElement("div");
document.body.append(el);
const live = createChart(el, {
  type: "line",
  animate: false,
  window: 10_000,
  data: {
    x: xsRaw.slice(0, 10_000),
    series: [{ y: ysRaw.slice(0, 10_000) }],
  },
});
let tt = 10_000;
bench(
  "append (window=10k full)",
  () => {
    live.append(tt++, 42);
  },
  300,
);

console.log("\n== misc kernels ==");

bench("extent 100k", () => extent(sortedX), 200);
bench("nearestIndex 100k", () => nearestIndex(sortedX, 51234.5), 200);
bench("computeTicks", () => computeTicks(0.13, 97.4, 5), 200);
bench("formatSI", () => formatSI(12345.6), 200);

// ============================================================================
// A/B experiments: variants implemented locally, measured against current src
// ============================================================================

type R = Parameters<typeof renderCandles>[0];

console.log("\n== A/B: candle scale calls: closures vs inlined math ==");

function renderCandlesInline(r: R): void {
  const d = ohlc;
  const ctx2 = r.ctx;
  const n = d.x.length;
  const slot = r.plot.w / Math.max(1, n);
  const bodyW = Math.min(slot * 0.6, 14);
  const half = bodyW / 2;
  const xd = r.xScale.domain;
  const xr = r.xScale.range;
  const kx = (xr[1] - xr[0]) / (xd[1] - xd[0] || 1);
  const bx = xr[0] - xd[0] * kx;
  const yd = r.yScale.domain;
  const yr = r.yScale.range;
  const ky = (yr[1] - yr[0]) / (yd[1] - yd[0] || 1);
  const by = yr[0] - yd[0] * ky;

  ctx2.save();
  ctx2.beginPath();
  ctx2.rect(r.plot.x, r.plot.y, r.plot.w, r.plot.h);
  ctx2.clip();

  const wickUp = new Path2D();
  const wickDown = new Path2D();
  const bodyUp = new Path2D();
  const bodyDown = new Path2D();
  for (let i = 0; i < n; i++) {
    const up = (d.close[i] as number) >= (d.open[i] as number);
    const wick = up ? wickUp : wickDown;
    const cx = bx + (d.x[i] as number) * kx;
    wick.moveTo(cx, by + (d.high[i] as number) * ky);
    wick.lineTo(cx, by + (d.low[i] as number) * ky);
    const body = up ? bodyUp : bodyDown;
    const op = by + (d.open[i] as number) * ky;
    const cl = by + (d.close[i] as number) * ky;
    body.rect(
      cx - half,
      Math.min(op, cl),
      bodyW,
      Math.max(1, Math.abs(cl - op)),
    );
  }
  ctx2.lineWidth = 1;
  ctx2.strokeStyle = lightTheme.up;
  ctx2.stroke(wickUp);
  ctx2.strokeStyle = lightTheme.down;
  ctx2.stroke(wickDown);
  ctx2.fillStyle = lightTheme.up;
  ctx2.fill(bodyUp);
  ctx2.fillStyle = lightTheme.down;
  ctx2.fill(bodyDown);

  const bandH = r.plot.h * 0.18;
  const bandBot = r.plot.y + r.plot.h;
  let vmax = 0;
  for (let i = 0; i < n; i++) {
    const v = d.volume[i] as number;
    if (v > vmax) vmax = v;
  }
  if (vmax > 0) {
    const volUp = new Path2D();
    const volDown = new Path2D();
    const k = bandH / vmax;
    for (let i = 0; i < n; i++) {
      const v = d.volume[i] as number;
      if (v <= 0) continue;
      const up = (d.close[i] as number) >= (d.open[i] as number);
      const cx = bx + (d.x[i] as number) * kx;
      (up ? volUp : volDown).rect(cx - half, bandBot - v * k, bodyW, v * k);
    }
    ctx2.fillStyle = withAlpha(lightTheme.up, 0.35);
    ctx2.fill(volUp);
    ctx2.fillStyle = withAlpha(lightTheme.down, 0.35);
    ctx2.fill(volDown);
  }
  ctx2.restore();
}

bench("A candles: scale closures (current)", () =>
  renderCandles(rCandle as unknown as R, false),
);
bench("B candles: inlined scale math", () =>
  renderCandlesInline(rCandle as unknown as R),
);

console.log("\n== A/B: candle column aggregation (semantic change) ==");

function renderCandlesAgg(r: R): void {
  const d = ohlc;
  const ctx2 = r.ctx;
  const n = d.x.length;
  const xd = r.xScale.domain;
  const xr = r.xScale.range;
  const kx = (xr[1] - xr[0]) / (xd[1] - xd[0] || 1);
  const bx = xr[0] - xd[0] * kx;
  const yd = r.yScale.domain;
  const yr = r.yScale.range;
  const ky = (yr[1] - yr[0]) / (yd[1] - yd[0] || 1);
  const by = yr[0] - yd[0] * ky;

  ctx2.save();
  ctx2.beginPath();
  ctx2.rect(r.plot.x, r.plot.y, r.plot.w, r.plot.h);
  ctx2.clip();

  // aggregate candles per integer pixel column
  const bodyW = Math.max(1, Math.min(2.5, 14));
  const wickUp = new Path2D();
  const wickDown = new Path2D();
  const bodyUp = new Path2D();
  const bodyDown = new Path2D();
  const volUp = new Path2D();
  const volDown = new Path2D();
  const bandH = r.plot.h * 0.18;
  const bandBot = r.plot.y + r.plot.h;
  let vmax = 0;
  for (let i = 0; i < n; i++) {
    const v = d.volume[i] as number;
    if (v > vmax) vmax = v;
  }
  const vk = vmax > 0 ? bandH / vmax : 0;

  let col = -1;
  let cx = 0;
  let go = 0;
  let gh = -Infinity;
  let gl = Infinity;
  let gc = 0;
  let gv = 0;
  const flushCol = () => {
    if (col < 0) return;
    const up = gc >= go;
    const wick = up ? wickUp : wickDown;
    const hi = by + gh * ky;
    const lo = by + gl * ky;
    wick.moveTo(cx, hi);
    wick.lineTo(cx, lo);
    const op = by + go * ky;
    const cl = by + gc * ky;
    (up ? bodyUp : bodyDown).rect(
      cx - bodyW / 2,
      Math.min(op, cl),
      bodyW,
      Math.max(1, Math.abs(cl - op)),
    );
    if (gv > 0) {
      const h = gv * vk;
      (up ? volUp : volDown).rect(cx - bodyW / 2, bandBot - h, bodyW, h);
    }
  };
  for (let i = 0; i < n; i++) {
    const pxv = bx + (d.x[i] as number) * kx;
    const c2 = Math.floor(pxv);
    if (c2 !== col) {
      flushCol();
      col = c2;
      cx = pxv;
      go = d.open[i] as number;
      gh = d.high[i] as number;
      gl = d.low[i] as number;
      gc = d.close[i] as number;
      gv = d.volume[i] as number;
    } else {
      const hi = d.high[i] as number;
      const lo = d.low[i] as number;
      if (hi > gh) gh = hi;
      if (lo < gl) gl = lo;
      gc = d.close[i] as number;
      gv += d.volume[i] as number;
      cx = pxv; // last x in the column
    }
  }
  flushCol();

  ctx2.lineWidth = 1;
  ctx2.strokeStyle = lightTheme.up;
  ctx2.stroke(wickUp);
  ctx2.strokeStyle = lightTheme.down;
  ctx2.stroke(wickDown);
  ctx2.fillStyle = lightTheme.up;
  ctx2.fill(bodyUp);
  ctx2.fillStyle = lightTheme.down;
  ctx2.fill(bodyDown);
  ctx2.fillStyle = withAlpha(lightTheme.up, 0.35);
  ctx2.fill(volUp);
  ctx2.fillStyle = withAlpha(lightTheme.down, 0.35);
  ctx2.fill(volDown);
  ctx2.restore();
}

bench("B candles: column-aggregated", () =>
  renderCandlesAgg(rCandle as unknown as R),
);

console.log("\n== A/B: scatter marker strategy ==");

function renderScatterRect(r: R): void {
  const d = xyData;
  const ctx2 = r.ctx;
  const xMin = r.plot.x - 3;
  const xMax = r.plot.x + r.plot.w + 3;
  ctx2.save();
  ctx2.beginPath();
  ctx2.rect(r.plot.x, r.plot.y, r.plot.w, r.plot.h);
  ctx2.clip();
  for (const s of d.series) {
    const y = s.y;
    ctx2.fillStyle = withAlpha(s.color, 0.65);
    ctx2.beginPath();
    for (let i = 0; i < d.sortedX.length; i++) {
      const x = r.xScale(d.sortedX[i] as number);
      if (x < xMin || x > xMax) continue;
      const yv = y[i] as number;
      const yp = r.yScale(yv);
      ctx2.rect(x - 1.5, yp - 1.5, 3, 3);
    }
    ctx2.fill();
  }
  ctx2.restore();
}

function renderScatterDedup(r: R): void {
  const d = xyData;
  const ctx2 = r.ctx;
  const xMin = r.plot.x - 3;
  const xMax = r.plot.x + r.plot.w + 3;
  ctx2.save();
  ctx2.beginPath();
  ctx2.rect(r.plot.x, r.plot.y, r.plot.w, r.plot.h);
  ctx2.clip();
  for (const s of d.series) {
    const y = s.y;
    ctx2.fillStyle = withAlpha(s.color, 0.65);
    ctx2.beginPath();
    let lx = Number.NaN;
    let ly = Number.NaN;
    for (let i = 0; i < d.sortedX.length; i++) {
      const x = r.xScale(d.sortedX[i] as number);
      if (x < xMin || x > xMax) continue;
      const yv = y[i] as number;
      const yp = r.yScale(yv);
      const qx = Math.round(x);
      const qy = Math.round(yp);
      if (qx === lx && qy === ly) continue;
      lx = qx;
      ly = qy;
      ctx2.moveTo(x + 2.5, yp);
      ctx2.arc(x, yp, 2.5, 0, Math.PI * 2);
    }
    ctx2.fill();
  }
  ctx2.restore();
}

bench("A scatter: arc per point (current)", () =>
  renderScatter(baseCtx as unknown as R),
);
bench("B scatter: fillRect markers", () =>
  renderScatterRect(baseCtx as unknown as R),
);
bench("C scatter: pixel-dedup arcs", () =>
  renderScatterDedup(baseCtx as unknown as R),
);

console.log("\n== A/B: append internals — where the 27us goes ==");

const liveProbe = live as unknown as {
  layout(): void;
  domains(): void;
};
bench("A append full (current)", () => live.append(tt++, 42), 200);
bench("append: layout() alone", () => liveProbe.layout(), 200);
bench("append: domains() alone", () => liveProbe.domains(), 200);

console.log("\n== A/B: typed-array reuse vs alloc ==");

const srcBuf = new Float64Array(10_000).fill(1);
const reuseBuf = new Float64Array(10_000);
bench(
  "A new Float64Array + set 10k",
  () => {
    const a = new Float64Array(10_000);
    a.set(srcBuf);
    void a;
  },
  200,
);
bench(
  "B reuse buffer + set 10k",
  () => {
    reuseBuf.set(srcBuf);
  },
  200,
);

console.log("\n== A/B: scheduler Set iteration ==");

const fns = new Set<() => void>();
for (let i = 0; i < 8; i++) fns.add(() => {});
bench(
  "A [...set] spread per tick",
  () => {
    for (const f of [...fns]) f();
  },
  200,
);
bench(
  "B direct iteration",
  () => {
    for (const f of fns) f();
  },
  200,
);

// ============================================================================
// A/B round 2
// ============================================================================

console.log("\n== A/B: normalize x copy+check (100k) ==");

bench("A Float64Array.from + separate mono scan", () => {
  const xRaw = Float64Array.from(xsRaw);
  const n = xRaw.length;
  let mono = true;
  for (let i = 1; i < n; i++) {
    if ((xRaw[i] as number) < (xRaw[i - 1] as number)) {
      mono = false;
      break;
    }
  }
  void mono;
});
bench("B fused copy + mono check", () => {
  const n = xsRaw.length;
  const x = new Float64Array(n);
  let mono = true;
  let p = Number.NEGATIVE_INFINITY;
  for (let i = 0; i < n; i++) {
    const v = xsRaw[i] as number;
    x[i] = v;
    if (v < p) mono = false;
    p = v;
  }
  void mono;
});

console.log("\n== A/B: normalize y copy (100k) ==");

bench("A index loop", () => {
  const y = new Float64Array(N);
  for (let k = 0; k < N; k++) y[k] = ysRaw[k] as number;
  void y;
});
bench("B Float64Array.from", () => {
  const y = Float64Array.from(ysRaw);
  void y;
});

console.log("\n== A/B: scatter scale math + shared x map ==");

function renderScatterInline(r: R, shareX: boolean): void {
  const d = xyData;
  const ctx2 = r.ctx;
  const xMin = r.plot.x - 3;
  const xMax = r.plot.x + r.plot.w + 3;
  const xd = r.xScale.domain;
  const xr = r.xScale.range;
  const kx = (xr[1] - xr[0]) / (xd[1] - xd[0] || 1);
  const bx = xr[0] - xd[0] * kx;
  const yd = r.yScale.domain;
  const yr = r.yScale.range;
  const ky = (yr[1] - yr[0]) / (yd[1] - yd[0] || 1);
  const by = yr[0] - yd[0] * ky;
  ctx2.save();
  ctx2.beginPath();
  ctx2.rect(r.plot.x, r.plot.y, r.plot.w, r.plot.h);
  ctx2.clip();
  const n = d.sortedX.length;
  let pxs: Float64Array | null = null;
  if (shareX) {
    pxs = new Float64Array(n);
    for (let i = 0; i < n; i++) pxs[i] = bx + (d.sortedX[i] as number) * kx;
  }
  for (const s of d.series) {
    const y = s.y;
    ctx2.fillStyle = withAlpha(s.color, 0.65);
    ctx2.beginPath();
    for (let i = 0; i < n; i++) {
      const x = pxs ? (pxs[i] as number) : bx + (d.sortedX[i] as number) * kx;
      if (x < xMin || x > xMax) continue;
      const yp = by + (y[i] as number) * ky;
      ctx2.moveTo(x + 2.5, yp);
      ctx2.arc(x, yp, 2.5, 0, Math.PI * 2);
    }
    ctx2.fill();
  }
  ctx2.restore();
}

bench("A scatter: scale closures (current)", () =>
  renderScatter(baseCtx as unknown as R),
);
bench("B scatter: inlined scale math", () =>
  renderScatterInline(baseCtx as unknown as R, false),
);
bench("C scatter: inline + shared x map", () =>
  renderScatterInline(baseCtx as unknown as R, true),
);

console.log("\n== A/B: decimateSeriesPx closures vs flat loop ==");

const { decimateSeriesPx } = await import("../src/core/decimate");

bench("A decimateSeriesPx (closures)", () => {
  decimateSeriesPx(sortedX, y0, null, 1, 0, xScale, yScale, plot.w, 0);
});

console.log("\n== gap / log code paths ==");

const yGaps = Float64Array.from(y0);
const gapIndex: number[] = [];
for (let i = 0; i < N; i += 97) {
  yGaps[i] = NaN; // ~1% missing
  gapIndex.push(i);
}

bench("decimateSeriesPx clean (gaps=false)", () => {
  decimateSeriesPx(
    sortedX,
    y0,
    null,
    1,
    0,
    xScale,
    yScale,
    plot.w,
    0,
    undefined,
    false,
  );
});
bench("decimateSeriesPx ~1% gaps (legacy loop)", () => {
  decimateSeriesPx(
    sortedX,
    yGaps,
    null,
    1,
    0,
    xScale,
    yScale,
    plot.w,
    0,
    undefined,
    true,
  );
});
bench("decimateSeriesPx ~1% gaps (gapIdx runs)", () => {
  decimateSeriesPx(
    sortedX,
    yGaps,
    null,
    1,
    0,
    xScale,
    yScale,
    plot.w,
    0,
    undefined,
    true,
    gapIndex,
  );
});

const { logScale } = await import("../src/core/scales");
const { mapSeriesPx } = await import("../src/core/decimate");
const logYScale = logScale(1, 200, plot.y + plot.h, plot.y);
const logXScale = logScale(1, N, plot.x, plot.x + plot.w);
const xsLog = new Float64Array(N);
const y0Log = new Float64Array(N);
const xsL = new Float64Array(N);
const invL10 = 1 / Math.log(10);
for (let i = 0; i < N; i++) {
  xsLog[i] = i + 1;
  y0Log[i] = Math.log(y0[i] as number) * invL10;
  xsL[i] = Math.log(i + 1) * invL10;
}
function logMapBench(a: Float64Array): Float64Array {
  const o = new Float64Array(a.length);
  for (let i = 0; i < a.length; i++) {
    const v = a[i] as number;
    o[i] = v > 0 ? Math.log(v) * invL10 : NaN;
  }
  return o;
}

bench("mapSeriesPx log-y 100k (pre-transformed)", () => {
  mapSeriesPx(
    sortedX,
    y0Log,
    null,
    1,
    0,
    xScale,
    logYScale,
    0,
    { y: 10 },
    false,
    { y: true },
  );
});
bench("mapSeriesPx log-y 100k (raw fallback)", () => {
  mapSeriesPx(sortedX, y0, null, 1, 0, xScale, logYScale, 0, { y: 10 });
});
bench("decimateSeriesPx log-y (pre-transformed)", () => {
  decimateSeriesPx(
    sortedX,
    y0Log,
    null,
    1,
    0,
    xScale,
    logYScale,
    plot.w,
    0,
    { y: 10 },
    false,
    undefined,
    { y: true },
  );
});
bench("decimateSeriesPx log-y (raw fallback)", () => {
  decimateSeriesPx(
    sortedX,
    y0,
    null,
    1,
    0,
    xScale,
    logYScale,
    plot.w,
    0,
    { y: 10 },
    true,
  );
});
bench("decimateSeriesPx log-x (pre-transformed)", () => {
  decimateSeriesPx(
    xsL,
    y0,
    null,
    1,
    0,
    logXScale,
    yScale,
    plot.w,
    0,
    { x: 10 },
    false,
    undefined,
    { x: true },
  );
});
bench("decimateSeriesPx log-x (column thresholds)", () => {
  decimateSeriesPx(
    xsLog,
    y0,
    null,
    1,
    0,
    logXScale,
    yScale,
    plot.w,
    0,
    { x: 10 },
    false,
  );
});

const rLogY = {
  ...baseCtx,
  opts: { ...baseCtx.opts, yScale: "log" as const },
  yScale: logYScale,
  data: {
    ...xyData,
    series: xyData.series.map((s) => ({
      ...s,
      yLog: logMapBench(s.y),
    })),
  },
};
bench("renderLine 2x100k log-y", () =>
  renderLine(rLogY as unknown as Parameters<typeof renderLine>[0], false),
);

function decimateFlat(
  xs: Float64Array,
  ys: Float64Array,
  xScale2: typeof xScale,
  yScale2: typeof yScale,
  pixelWidth: number,
): Float32Array {
  const n = Math.min(xs.length, ys.length);
  if (n === 0) return new Float32Array(0);
  const maxPts = Math.min(n, 4 * (Math.ceil(pixelWidth) + 8));
  const out = new Float32Array(Math.max(1, maxPts) * 2);
  const xd = xScale2.domain;
  const xr = xScale2.range;
  const kx = (xr[1] - xr[0]) / (xd[1] - xd[0] || 1);
  const bx = xr[0] - xd[0] * kx;
  const yd = yScale2.domain;
  const yr = yScale2.range;
  const ky = (yr[1] - yr[0]) / (yd[1] - yd[0] || 1);
  const by = yr[0] - yd[0] * ky;

  let o = 0;
  let firstX = bx + (xs[0] as number) * kx;
  let firstY = by + (ys[0] as number) * ky;
  let col = Math.floor(firstX);
  let minX = firstX;
  let minY = firstY;
  let maxX = firstX;
  let maxY = firstY;
  let lastX = firstX;
  let lastY = firstY;

  for (let i = 1; i < n; i++) {
    const x = bx + (xs[i] as number) * kx;
    const y = by + (ys[i] as number) * ky;
    if (Math.floor(x) !== col) {
      if (o + 8 <= out.length) {
        out[o] = firstX;
        out[o + 1] = firstY;
        o += 2;
        if (minY !== firstY || minX !== firstX) {
          out[o] = minX;
          out[o + 1] = minY;
          o += 2;
        }
        if (maxY !== minY || maxX !== minX) {
          out[o] = maxX;
          out[o + 1] = maxY;
          o += 2;
        }
        if (lastX !== maxX || lastY !== maxY) {
          out[o] = lastX;
          out[o + 1] = lastY;
          o += 2;
        }
      }
      col = Math.floor(x);
      firstX = x;
      firstY = y;
      minX = maxX = lastX = x;
      minY = maxY = lastY = y;
    } else {
      if (y < minY) {
        minY = y;
        minX = x;
      }
      if (y > maxY) {
        maxY = y;
        maxX = x;
      }
      lastX = x;
      lastY = y;
    }
  }
  if (o + 8 <= out.length) {
    out[o] = firstX;
    out[o + 1] = firstY;
    o += 2;
    if (minY !== firstY || minX !== firstX) {
      out[o] = minX;
      out[o + 1] = minY;
      o += 2;
    }
    if (maxY !== minY || maxX !== minX) {
      out[o] = maxX;
      out[o + 1] = maxY;
      o += 2;
    }
    if (lastX !== maxX || lastY !== maxY) {
      out[o] = lastX;
      out[o + 1] = lastY;
      o += 2;
    }
  }
  return out.subarray(0, o);
}

bench("B decimateSeriesPx flat loop", () => {
  decimateFlat(sortedX, y0, xScale, yScale, plot.w);
});

console.log("\n== A/B: smoothPath allocations ==");

const decPts = decimateM4(px, py, plot.w);
const dn2 = decPts.length / 2;

let smScratch = new Float64Array(0);
function smoothPathScratch(
  c: CanvasPath,
  pts: ArrayLike<number>,
  n: number,
): void {
  if (n < 3) {
    for (let i = 0; i < n; i++) {
      const x = pts[2 * i] as number;
      const y = pts[2 * i + 1] as number;
      if (i === 0) c.moveTo(x, y);
      else c.lineTo(x, y);
    }
    return;
  }
  const segs = n - 1;
  const need = segs + n; // m ++ tang (dx kept in-register)
  if (smScratch.length < need) smScratch = new Float64Array(need);
  const m = smScratch.subarray(0, segs);
  const tang = smScratch.subarray(segs, segs + n);
  for (let i = 0; i < segs; i++) {
    const dxi = (pts[2 * (i + 1)] as number) - (pts[2 * i] as number);
    m[i] =
      dxi === 0
        ? 0
        : ((pts[2 * (i + 1) + 1] as number) - (pts[2 * i + 1] as number)) / dxi;
  }
  tang[0] = m[0] as number;
  for (let i = 1; i < segs; i++) {
    const a = m[i - 1] as number;
    const b = m[i] as number;
    tang[i] = a * b <= 0 ? 0 : (a + b) / 2;
  }
  tang[n - 1] = m[segs - 1] as number;
  for (let i = 0; i < segs; i++) {
    const mi = m[i] as number;
    if (mi !== 0) {
      const ti = tang[i] as number;
      const ti1 = tang[i + 1] as number;
      const lim = 3 * Math.abs(mi);
      if (Math.abs(ti) > lim) tang[i] = Math.sign(ti) * lim;
      if (Math.abs(ti1) > lim) tang[i + 1] = Math.sign(ti1) * lim;
    }
  }
  c.moveTo(pts[0] as number, pts[1] as number);
  for (let i = 0; i < segs; i++) {
    const x0 = pts[2 * i] as number;
    const x1 = pts[2 * (i + 1)] as number;
    const yy0 = pts[2 * i + 1] as number;
    const yy1 = pts[2 * (i + 1) + 1] as number;
    const h = (x1 - x0) / 3;
    c.bezierCurveTo(
      x0 + h,
      yy0 + h * (tang[i] as number),
      x1 - h,
      yy1 - h * (tang[i + 1] as number),
      x1,
      yy1,
    );
  }
}

bench("A smoothPath (3 allocs)", () => {
  smoothPath(new Path2D(), decPts, dn2);
});
bench("B smoothPath (pooled scratch)", () => {
  smoothPathScratch(new Path2D(), decPts, dn2);
});

console.log("\n== A/B: buildPath output buffer alloc vs pool ==");

let decScratch = new Float32Array(0);
function decimateFlatPooled(
  xs: Float64Array,
  ys: Float64Array,
  pixelWidth: number,
): Float32Array {
  const n = Math.min(xs.length, ys.length);
  if (n === 0) return new Float32Array(0);
  const maxPts = Math.min(n, 4 * (Math.ceil(pixelWidth) + 8));
  if (decScratch.length < maxPts * 2) {
    decScratch = new Float32Array(maxPts * 2);
  }
  const out = decScratch;
  const xd = xScale.domain;
  const xr = xScale.range;
  const kx = (xr[1] - xr[0]) / (xd[1] - xd[0] || 1);
  const bx = xr[0] - xd[0] * kx;
  const yd = yScale.domain;
  const yr = yScale.range;
  const ky = (yr[1] - yr[0]) / (yd[1] - yd[0] || 1);
  const by = yr[0] - yd[0] * ky;
  let o = 0;
  for (let i = 0; i < n; i++) {
    out[o] = bx + (xs[i] as number) * kx;
    out[o + 1] = by + (ys[i] as number) * ky;
    o += 2;
  }
  return out.subarray(0, o);
}

bench("A fresh Float32Array(2n) per call", () => {
  decimateSeriesPx(sortedX, y0, null, 1, 0, xScale, yScale, plot.w, 0);
});
bench("B pooled Float32Array scratch", () => {
  decimateFlatPooled(sortedX, y0, plot.w);
});

console.log("\n== A/B: domains() redundancy at init (100k, no window) ==");

const big = createChart(document.createElement("div"), {
  type: "line",
  animate: false,
  data: { x: xsRaw, series: [{ y: ysRaw }, { y: ysRaw }] },
});
const bigProbe = big as unknown as {
  layout(): void;
  domains(): { x: [number, number]; y: [number, number] };
};
bench("domains() xy 2x100k", () => bigProbe.domains(), 200);
bench("layout() xy 2x100k", () => bigProbe.layout(), 200);
big.destroy();

console.log("\n== A/B: append steady-state pieces (10k buffer) ==");

const wA = new Float64Array(10_000);
const wB = new Float64Array(10_000);
bench("copyWithin shift 10k", () => wA.copyWithin(0, 1), 200);
bench("set copy 10k", () => wB.set(wA), 200);
bench(
  "scalar append: [y] array wrap",
  () => {
    const v = 42;
    const ys = Array.isArray(v) ? v : [v];
    void ys[0];
  },
  200,
);
bench(
  "scalar append: direct branch",
  () => {
    const v = 42;
    const y0v = typeof v === "number" ? v : v[0];
    void y0v;
  },
  200,
);

// ============================================================================
// A/B round 3
// ============================================================================

const { decimateSeriesPx: dsp } = await import("../src/core/decimate");

console.log("\n== A/B: shared x-pixel map across series (2x100k) ==");

// precompute pixel columns + px once; per-series decimate reuses them
let colScratch = new Int32Array(0);
let pxScratch = new Float32Array(0);

function xMapCols(
  xs: Float64Array,
  xScale2: typeof xScale,
): { cols: Int32Array; pxs: Float32Array } {
  const n = xs.length;
  if (colScratch.length < n) {
    colScratch = new Int32Array(n);
    pxScratch = new Float32Array(n);
  }
  const cols = colScratch;
  const pxs = pxScratch;
  const xd = xScale2.domain;
  const xr = xScale2.range;
  const kx = (xr[1] - xr[0]) / (xd[1] - xd[0] || 1);
  const bx = xr[0] - xd[0] * kx;
  for (let i = 0; i < n; i++) {
    const pxv = bx + (xs[i] as number) * kx;
    pxs[i] = pxv;
    cols[i] = Math.floor(pxv);
  }
  return { cols: cols.subarray(0, n), pxs: pxs.subarray(0, n) };
}

function decimateCols(
  cols: Int32Array,
  pxs: Float32Array,
  ys: Float64Array,
  yScale2: typeof yScale,
  pixelWidth: number,
): Float32Array {
  const n = Math.min(cols.length, ys.length);
  if (n === 0) return new Float32Array(0);
  const maxPts = Math.min(n, 4 * (Math.ceil(pixelWidth) + 8));
  const out = new Float32Array(Math.max(1, maxPts) * 2);
  const yd = yScale2.domain;
  const yr = yScale2.range;
  const ky = (yr[1] - yr[0]) / (yd[1] - yd[0] || 1);
  const by = yr[0] - yd[0] * ky;
  let o = 0;
  let firstX = pxs[0] as number;
  let firstY = by + (ys[0] as number) * ky;
  let col = cols[0] as number;
  let minX = firstX;
  let minY = firstY;
  let maxX = firstX;
  let maxY = firstY;
  let lastX = firstX;
  let lastY = firstY;
  const cap = out.length;
  for (let i = 1; i < n; i++) {
    const x = pxs[i] as number;
    const y = by + (ys[i] as number) * ky;
    const c = cols[i] as number;
    if (c !== col) {
      if (o + 8 <= cap) {
        out[o] = firstX;
        out[o + 1] = firstY;
        o += 2;
        if (minY !== firstY || minX !== firstX) {
          out[o] = minX;
          out[o + 1] = minY;
          o += 2;
        }
        if (maxY !== minY || maxX !== minX) {
          out[o] = maxX;
          out[o + 1] = maxY;
          o += 2;
        }
        if (lastX !== maxX || lastY !== maxY) {
          out[o] = lastX;
          out[o + 1] = lastY;
          o += 2;
        }
      }
      col = c;
      firstX = x;
      firstY = y;
      minX = maxX = lastX = x;
      minY = maxY = lastY = y;
    } else {
      if (y < minY) {
        minY = y;
        minX = x;
      }
      if (y > maxY) {
        maxY = y;
        maxX = x;
      }
      lastX = x;
      lastY = y;
    }
  }
  if (o + 8 <= cap) {
    out[o] = firstX;
    out[o + 1] = firstY;
    o += 2;
    if (minY !== firstY || minX !== firstX) {
      out[o] = minX;
      out[o + 1] = minY;
      o += 2;
    }
    if (maxY !== minY || maxX !== minX) {
      out[o] = maxX;
      out[o + 1] = maxY;
      o += 2;
    }
    if (lastX !== maxX || lastY !== maxY) {
      out[o] = lastX;
      out[o + 1] = lastY;
      o += 2;
    }
  }
  return out.subarray(0, o);
}

bench("A 2 series x decimateSeriesPx (re-maps x)", () => {
  dsp(sortedX, y0, null, 1, 0, xScale, yScale, plot.w, 0);
  dsp(sortedX, y1, null, 1, 0, xScale, yScale, plot.w, 0);
});
bench("B shared cols + per-series decimate", () => {
  const { cols, pxs } = xMapCols(sortedX, xScale);
  decimateCols(cols, pxs, y0, yScale, plot.w);
  decimateCols(cols, pxs, y1, yScale, plot.w);
});

console.log("\n== A/B: decimate direct to Path2D (linear) ==");

function decimateToPath(
  xs: Float64Array,
  ys: Float64Array,
  _pixelWidth: number,
): Path2D {
  const n = Math.min(xs.length, ys.length);
  const p = new Path2D();
  if (n === 0) return p;
  const xd = xScale.domain;
  const xr = xScale.range;
  const kx = (xr[1] - xr[0]) / (xd[1] - xd[0] || 1);
  const bx = xr[0] - xd[0] * kx;
  const yd = yScale.domain;
  const yr = yScale.range;
  const ky = (yr[1] - yr[0]) / (yd[1] - yd[0] || 1);
  const by = yr[0] - yd[0] * ky;
  let firstX = bx + (xs[0] as number) * kx;
  let firstY = by + (ys[0] as number) * ky;
  let col = Math.floor(firstX);
  let minX = firstX;
  let minY = firstY;
  let maxX = firstX;
  let maxY = firstY;
  let lastX = firstX;
  let lastY = firstY;
  const flush = () => {
    p.lineTo(firstX, firstY);
    if (minY !== firstY || minX !== firstX) p.lineTo(minX, minY);
    if (maxY !== minY || maxX !== minX) p.lineTo(maxX, maxY);
    if (lastX !== maxX || lastY !== maxY) p.lineTo(lastX, lastY);
  };
  p.moveTo(firstX, firstY);
  for (let i = 1; i < n; i++) {
    const x = bx + (xs[i] as number) * kx;
    const y = by + (ys[i] as number) * ky;
    const c = Math.floor(x);
    if (c !== col) {
      flush();
      col = c;
      firstX = x;
      firstY = y;
      minX = maxX = lastX = x;
      minY = maxY = lastY = y;
    } else {
      if (y < minY) {
        minY = y;
        minX = x;
      }
      if (y > maxY) {
        maxY = y;
        maxX = x;
      }
      lastX = x;
      lastY = y;
    }
  }
  flush();
  return p;
}

bench("A decimate -> array -> path.lineTo", () => {
  const pts = dsp(sortedX, y0, null, 1, 0, xScale, yScale, plot.w, 0);
  const p = new Path2D();
  const dn3 = pts.length / 2;
  p.moveTo(pts[0] as number, pts[1] as number);
  for (let i = 1; i < dn3; i++) {
    p.lineTo(pts[2 * i] as number, pts[2 * i + 1] as number);
  }
});
bench("B decimate -> Path2D directly", () => {
  decimateToPath(sortedX, y0, plot.w);
});

console.log("\n== A/B: decimateM4 flat vs closures ==");

bench("A decimateM4 (closures)", () => decimateM4(px, py, plot.w), 200);
bench(
  "B decimateCols on premapped",
  () => {
    const cols2 = new Int32Array(N);
    for (let i = 0; i < N; i++) cols2[i] = Math.floor(px[i] as number);
    const pxf = Float32Array.from(px);
    decimateCols(cols2, pxf, y0, yScale, plot.w);
  },
  200,
);

console.log("\n== A/B: append series objects: map vs mutate ==");

interface S {
  label: string;
  y: Float64Array;
  prevY: Float64Array | null;
}
const seriesArr: S[] = [
  { label: "a", y: new Float64Array(10_000), prevY: new Float64Array(10_000) },
];
let av = 0;
bench(
  "A .map new objects",
  () => {
    const next = seriesArr.map((s) => {
      s.y.copyWithin(0, 1);
      s.y[9999] = av++;
      return { label: s.label, y: s.y, prevY: s.prevY };
    });
    void next;
  },
  200,
);
bench(
  "B mutate in place",
  () => {
    for (const s of seriesArr) {
      const p = s.prevY;
      s.prevY = s.y;
      s.y = p as Float64Array;
      s.y.copyWithin(0, 1);
      s.y[9999] = av++;
    }
  },
  200,
);

console.log("\n== A/B: ohlc extent scan vs tracked minmax ==");

bench(
  "A domain scan 50k ohlc (low/high)",
  () => {
    let min = Infinity;
    let max = -Infinity;
    for (let i = 0; i < M; i++) {
      const lo = ohlc.low[i] as number;
      const hi = ohlc.high[i] as number;
      if (lo < min) min = lo;
      if (hi > max) max = hi;
    }
    void min;
    void max;
  },
  200,
);

// ============================================================================
// A/B round 4: let vs const in real hot paths
// ============================================================================

console.log("\n== A/B: let vs const — loop-carried temps (extent, 100k) ==");

bench(
  "A const temps in loop",
  () => {
    let min = Infinity;
    let max = -Infinity;
    for (let i = 0; i < N; i++) {
      const v = y0[i] as number;
      if (v < min) min = v;
      if (v > max) max = v;
    }
    void min;
    void max;
  },
  200,
);
bench(
  "B let temps in loop",
  () => {
    let min = Infinity;
    let max = -Infinity;
    for (let i = 0; i < N; i++) {
      let v = y0[i] as number;
      if (v < min) min = v;
      if (v > max) max = v;
      v = 0;
    }
    void min;
    void max;
  },
  200,
);

console.log("\n== A/B: let vs const — decimate inner temps (100k) ==");

function decimateConst(xs: Float64Array, ys: Float64Array): number {
  let col = Math.floor(xs[0] as number);
  let lastY = ys[0] as number;
  let o = 0;
  for (let i = 1; i < xs.length; i++) {
    const x = xs[i] as number;
    const y = ys[i] as number;
    const c = Math.floor(x);
    if (c !== col) {
      o++;
      col = c;
    } else if (y > lastY) {
      lastY = y;
    }
  }
  return o;
}

function decimateLet(xs: Float64Array, ys: Float64Array): number {
  let col = Math.floor(xs[0] as number);
  let lastY = ys[0] as number;
  let o = 0;
  for (let i = 1; i < xs.length; i++) {
    let x = xs[i] as number;
    let y = ys[i] as number;
    let c = Math.floor(x);
    if (c !== col) {
      o++;
      col = c;
    } else if (y > lastY) {
      lastY = y;
    }
    x = 0;
    y = 0;
    c = 0;
  }
  return o;
}

bench("A decimate loop: const temps", () => decimateConst(sortedX, y0), 200);
bench("B decimate loop: let temps", () => decimateLet(sortedX, y0), 200);

console.log("\n== A/B: const destructure vs let (scale unpack, x1M) ==");

bench(
  "A const destructure",
  () => {
    let acc = 0;
    for (let i = 0; i < 250; i++) {
      const [d0, d1] = xScale.domain;
      const [r0, r1] = xScale.range;
      const k = (r1 - r0) / (d1 - d0 || 1);
      acc += k;
    }
    void acc;
  },
  200,
);
bench(
  "B let destructure",
  () => {
    let acc = 0;
    for (let i = 0; i < 250; i++) {
      let [d0, d1] = xScale.domain;
      let [r0, r1] = xScale.range;
      const k = (r1 - r0) / (d1 - d0 || 1);
      acc += k;
      d0 = d1 = r0 = r1 = 0;
    }
    void acc;
  },
  200,
);

console.log("\n== A/B: for-of const vs indexed let (typed array, 100k) ==");

bench(
  "A for (const v of typedArr)",
  () => {
    let s = 0;
    for (const v of y0) s += v;
    void s;
  },
  200,
);
bench(
  "B for (let i) indexed",
  () => {
    let s = 0;
    for (let i = 0; i < y0.length; i++) s += y0[i] as number;
    void s;
  },
  200,
);
bench(
  "C for (let v of typedArr)",
  () => {
    let s = 0;
    for (let v of y0) {
      s += v;
      v = 0;
    }
    void s;
  },
  200,
);

console.log("\ndone.");
