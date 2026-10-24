/// <reference path="./env.d.ts" />
/**
 * A/B harness for JS-level optimization candidates.
 * Bundled via tsdown, run under node + jsdom stubs (canvas raster stubbed).
 */
import { JSDOM } from "jsdom";

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

const { renderLine } = await import("../src/charts/line");
const { renderScatter } = await import("../src/charts/scatter");
const { renderBubble } = await import("../src/charts/bubble");
const { smoothPath, splinePath, traceCurve } = await import(
  "../src/charts/registry"
);
const { decimateM4, decimateSeriesPx, mapSeriesPx } = await import(
  "../src/core/decimate"
);
const { linearScale } = await import("../src/core/scales");
const { lightTheme } = await import("../src/core/theme");

const results: { name: string; hz: number }[] = [];
function bench(name: string, fn: () => void, time = 400): void {
  fn();
  fn();
  const warmupUntil = performance.now() + Math.min(150, time / 3);
  while (performance.now() < warmupUntil) fn();
  const start = performance.now();
  let iters = 0;
  while (performance.now() - start < time) {
    fn();
    iters++;
  }
  const hz = (iters / (performance.now() - start)) * 1000;
  results.push({ name, hz });
  console.log(
    `${name.padEnd(56)} ${hz.toFixed(1).padStart(12)} ops/s  ${(1000 / hz).toFixed(3).padStart(10)} ms/op`,
  );
}

// --- shared data ------------------------------------------------------------

const N = 100_000;
const sortedX = new Float64Array(N);
const y0 = new Float64Array(N);
const y1 = new Float64Array(N);
for (let i = 0; i < N; i++) {
  sortedX[i] = i;
  y0[i] = 50 + 30 * Math.sin(i / 500) + (i % 17);
  y1[i] = y0[i] as number * 0.7 + 10;
}
// gappy variant (~1% NaN)
const yGaps = Float64Array.from(y0);
for (let i = 0; i < N; i += 97) yGaps[i] = NaN;

const plot = { x: 40, y: 8, w: 760, h: 200 };
const xScale = linearScale(0, N - 1, plot.x, plot.x + plot.w);
const yScale = linearScale(0, 100, plot.y + plot.h, plot.y);
const ctx = stubCtx() as CanvasRenderingContext2D;

const xyData = {
  kind: "xy",
  sortedX,
  series: [
    { label: "a", color: "#0070f3", y: y0, prevY: null, pathCache: null },
    { label: "b", color: "#0e9f6e", y: y1, prevY: null, pathCache: null },
  ],
};

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
type R = typeof baseCtx;

// ============================================================================
console.log("\n== 1. splinePath: Math.hypot vs sqrt ==");

const decPts = decimateSeriesPx(sortedX, y0, null, 1, 0, xScale, yScale, plot.w);
const dn = decPts.length / 2;
const rawPx = new Float64Array(N);
const rawPy = new Float64Array(N);
for (let i = 0; i < N; i++) {
  rawPx[i] = xScale(sortedX[i] as number);
  rawPy[i] = yScale(y0[i] as number);
}
const rawPts = new Float32Array(N * 2);
for (let i = 0; i < N; i++) {
  rawPts[2 * i] = rawPx[i] as number;
  rawPts[2 * i + 1] = rawPy[i] as number;
}

bench("A splinePath hypot (decimated)", () =>
  splinePath(new Path2D(), decPts, dn, 0.4, false),
);
// local copy of splinePath with sqrt — replicate internals
const spScratch = { a: new Float64Array(0) };
function splinePathSqrt(
  c: CanvasPath,
  pts: ArrayLike<number>,
  n: number,
  tension = 0.4,
): void {
  const need = 4 * n;
  if (spScratch.a.length < need) spScratch.a = new Float64Array(need);
  const sp = spScratch.a;
  const c1x = sp.subarray(0, n);
  const c1y = sp.subarray(n, 2 * n);
  const c2x = sp.subarray(2 * n, 3 * n);
  const c2y = sp.subarray(3 * n, 4 * n);
  for (let i = 0; i < n; i++) {
    const px = pts[2 * Math.max(i - 1, 0)] as number;
    const py = pts[2 * Math.max(i - 1, 0) + 1] as number;
    const nx = pts[2 * Math.min(i + 1, n - 1)] as number;
    const ny = pts[2 * Math.min(i + 1, n - 1) + 1] as number;
    const x = pts[2 * i] as number;
    const y = pts[2 * i + 1] as number;
    const ax = x - px;
    const ay = y - py;
    const bx = nx - x;
    const by = ny - y;
    const d01 = Math.sqrt(ax * ax + ay * ay);
    const d12 = Math.sqrt(bx * bx + by * by);
    const sum = d01 + d12;
    const s01 = sum === 0 ? 0 : d01 / sum;
    const s12 = sum === 0 ? 0 : d12 / sum;
    const dx = nx - px;
    const dy = ny - py;
    c1x[i] = x - tension * s01 * dx;
    c1y[i] = y - tension * s01 * dy;
    c2x[i] = x + tension * s12 * dx;
    c2y[i] = y + tension * s12 * dy;
  }
  c.moveTo(pts[0] as number, pts[1] as number);
  for (let i = 0; i < n - 1; i++) {
    c.bezierCurveTo(
      c2x[i] as number,
      c2y[i] as number,
      c1x[i + 1] as number,
      c1y[i + 1] as number,
      pts[2 * (i + 1)] as number,
      pts[2 * (i + 1) + 1] as number,
    );
  }
}
bench("B splinePath sqrt (decimated)", () =>
  splinePathSqrt(new Path2D(), decPts, dn, 0.4),
);

// ============================================================================
console.log("\n== 2. traceCurve linear: eachRun+segView vs fused single pass ==");

function traceLinearFused(
  path: CanvasPath,
  pts: ArrayLike<number>,
  n: number,
): void {
  let started = false;
  for (let i = 0; i < n; i++) {
    const y = pts[2 * i + 1] as number;
    if (y !== y) {
      started = false;
      continue;
    }
    const x = pts[2 * i] as number;
    if (!started) {
      path.moveTo(x, y);
      started = true;
    } else {
      path.lineTo(x, y);
    }
  }
}

// decimated pts (no NaN) — the common case
bench("A traceCurve linear decimated (eachRun)", () =>
  traceCurve(new Path2D(), decPts, dn, "linear", false, 0.4),
);
bench("B traceCurve linear decimated (fused)", () =>
  traceLinearFused(new Path2D(), decPts, dn),
);
// raw 100k pts
bench("A traceCurve linear 100k raw (eachRun)", () =>
  traceCurve(new Path2D(), rawPts, N, "linear", false, 0.4),
);
bench("B traceCurve linear 100k raw (fused)", () =>
  traceLinearFused(new Path2D(), rawPts, N),
);

// gappy input
const gapPts = Float32Array.from(rawPts);
for (let i = 0; i < N; i += 97) gapPts[2 * i + 1] = NaN;
bench("A traceCurve linear 100k gappy (eachRun)", () =>
  traceCurve(new Path2D(), gapPts, N, "linear", false, 0.4),
);
bench("B traceCurve linear 100k gappy (fused)", () =>
  traceLinearFused(new Path2D(), gapPts, N),
);

// ============================================================================
console.log("\n== 3. Number.isFinite vs v!==v vs (v-v)===0 ==");

bench("A Number.isFinite scan 100k", () => {
  let s = 0;
  for (let i = 0; i < N; i++) {
    if (Number.isFinite(y0[i] as number)) s++;
  }
  void s;
});
bench("B v!==v scan 100k (NaN only)", () => {
  let s = 0;
  for (let i = 0; i < N; i++) {
    const v = y0[i] as number;
    if (v === v) s++;
  }
  void s;
});
bench("C (v-v)===0 scan 100k (finite)", () => {
  let s = 0;
  for (let i = 0; i < N; i++) {
    const v = y0[i] as number;
    if (v - v === 0) s++;
  }
  void s;
});

// ============================================================================
console.log("\n== 4. Math.floor vs |0 for pixel columns ==");

bench("A Math.floor 100k", () => {
  let s = 0;
  for (let i = 0; i < N; i++) s += Math.floor(rawPx[i] as number);
  void s;
});
bench("B x|0 100k", () => {
  let s = 0;
  for (let i = 0; i < N; i++) s += (rawPx[i] as number) | 0;
  void s;
});

// ============================================================================
console.log("\n== 5. mapSeriesPx: fresh alloc vs pooled scratch ==");

let mapScratch = new Float32Array(0);
function mapPooled(
  xs: Float64Array,
  ys: Float64Array,
  xS: typeof xScale,
  yS: typeof yScale,
): Float32Array {
  const n = Math.min(xs.length, ys.length);
  if (mapScratch.length < n * 2) mapScratch = new Float32Array(n * 2);
  const out = mapScratch;
  const xd = xS.domain;
  const xr = xS.range;
  const kx = (xr[1] - xr[0]) / (xd[1] - xd[0] || 1);
  const bx = xr[0] - xd[0] * kx;
  const yd = yS.domain;
  const yr = yS.range;
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

const xs1k = sortedX.subarray(0, 1000) as Float64Array;
const ys1k = y0.subarray(0, 1000) as Float64Array;
const xS1k = linearScale(0, 999, plot.x, plot.x + plot.w);
bench("A mapSeriesPx fresh alloc 1k", () =>
  mapSeriesPx(xs1k, ys1k, null, 1, 0, xS1k, yScale, 0, undefined, false),
);
bench("B mapSeriesPx pooled 1k", () => mapPooled(xs1k, ys1k, xS1k, yScale));

// ============================================================================
console.log("\n== 6. decimateM4: closure flush vs flat loop ==");

function decimateM4Flat(
  xs: ArrayLike<number>,
  ys: ArrayLike<number>,
  pixelWidth: number,
): Float32Array {
  const n = Math.min(xs.length, ys.length);
  if (n === 0) return new Float32Array(0);
  const maxPts = Math.min(n, 4 * (Math.ceil(pixelWidth) + 8));
  const out = new Float32Array(Math.max(1, maxPts) * 2);
  const cap = out.length;
  let o = 0;
  let col = Math.floor(xs[0] as number);
  let firstX = xs[0] as number;
  let firstY = ys[0] as number;
  let minX = firstX;
  let minY = firstY;
  let maxX = firstX;
  let maxY = firstY;
  let lastX = firstX;
  let lastY = firstY;
  for (let i = 1; i < n; i++) {
    const x = xs[i] as number;
    const y = ys[i] as number;
    const c = Math.floor(x);
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

bench("A decimateM4 (closures)", () => decimateM4(rawPx, rawPy, plot.w));
bench("B decimateM4 flat", () => decimateM4Flat(rawPx, rawPy, plot.w));

// ============================================================================
console.log("\n== 7. scheduler Set: spread snapshot vs direct iteration ==");

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
  "B direct Set iteration",
  () => {
    for (const f of fns) f();
  },
  200,
);

// ============================================================================
console.log("\n== 8. topRounded: Rect object arg vs scalar args ==");

function topRoundedObj(
  c: CanvasRenderingContext2D,
  rect: { x: number; y: number; w: number; h: number },
  rad: number,
): void {
  const { x, y, w, h } = rect;
  if (h <= 0 || w <= 0) return;
  const r = Math.min(rad, h / 2, w / 2);
  c.beginPath();
  c.moveTo(x, y + h);
  c.lineTo(x, y + r);
  c.arcTo(x, y, x + r, y, r);
  c.lineTo(x + w - r, y);
  c.arcTo(x + w, y, x + w, y + r, r);
  c.lineTo(x + w, y + h);
  c.closePath();
  c.fill();
}
function topRoundedScalar(
  c: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  rad: number,
): void {
  if (h <= 0 || w <= 0) return;
  const r = Math.min(rad, h / 2, w / 2);
  c.beginPath();
  c.moveTo(x, y + h);
  c.lineTo(x, y + r);
  c.arcTo(x, y, x + r, y, r);
  c.lineTo(x + w - r, y);
  c.arcTo(x + w, y, x + w, y + r, r);
  c.lineTo(x + w, y + h);
  c.closePath();
  c.fill();
}

const BARS = 2000;
bench("A topRounded Rect obj x2000", () => {
  for (let i = 0; i < BARS; i++) {
    topRoundedObj(ctx, { x: i, y: 10, w: 8, h: 50 }, 3);
  }
});
bench("B topRounded scalars x2000", () => {
  for (let i = 0; i < BARS; i++) {
    topRoundedScalar(ctx, i, 10, 8, 50, 3);
  }
});

// ============================================================================
console.log("\n== 9. renderLine: current vs fused linear-to-Path2D ==");

let fuseScratch = new Float32Array(0);
function renderLineFused(r: R): void {
  const d = xyData;
  const c2 = r.ctx;
  c2.save();
  c2.beginPath();
  c2.rect(r.plot.x, r.plot.y, r.plot.w, r.plot.h);
  c2.clip();
  const xd = r.xScale.domain;
  const xr = r.xScale.range;
  const kx = (xr[1] - xr[0]) / (xd[1] - xd[0] || 1);
  const bx = xr[0] - xd[0] * kx;
  const yd = r.yScale.domain;
  const yr = r.yScale.range;
  const ky = (yr[1] - yr[0]) / (yd[1] - yd[0] || 1);
  const by = yr[0] - yd[0] * ky;
  const n = d.sortedX.length;
  const xs = d.sortedX;
  const colsN = Math.ceil(r.plot.w) + 8;
  if (fuseScratch.length < colsN * 8) fuseScratch = new Float32Array(colsN * 8);
  for (const s of d.series) {
    const ys = s.y;
    const path = new Path2D();
    let col = -Infinity;
    let started = false;
    let firstX = 0;
    let firstY = 0;
    let minX = 0;
    let minY = 0;
    let maxX = 0;
    let maxY = 0;
    let lastX = 0;
    let lastY = 0;
    for (let i = 0; i < n; i++) {
      const yv = ys[i] as number;
      if (yv !== yv) {
        if (started) {
          path.lineTo(firstX, firstY);
          if (minY !== firstY || minX !== firstX) path.lineTo(minX, minY);
          if (maxY !== minY || maxX !== minX) path.lineTo(maxX, maxY);
          if (lastX !== maxX || lastY !== maxY) path.lineTo(lastX, lastY);
          started = false;
        }
        continue;
      }
      const x = bx + (xs[i] as number) * kx;
      const y = by + yv * ky;
      const c = Math.floor(x);
      if (!started) {
        path.moveTo(x, y);
        col = c;
        firstX = minX = maxX = lastX = x;
        firstY = minY = maxY = lastY = y;
        started = true;
        continue;
      }
      if (c !== col) {
        path.lineTo(firstX, firstY);
        if (minY !== firstY || minX !== firstX) path.lineTo(minX, minY);
        if (maxY !== minY || maxX !== minX) path.lineTo(maxX, maxY);
        if (lastX !== maxX || lastY !== maxY) path.lineTo(lastX, lastY);
        col = c;
        firstX = minX = maxX = lastX = x;
        firstY = minY = maxY = lastY = y;
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
    if (started) {
      path.lineTo(firstX, firstY);
      if (minY !== firstY || minX !== firstX) path.lineTo(minX, minY);
      if (maxY !== minY || maxX !== minX) path.lineTo(maxX, maxY);
      if (lastX !== maxX || lastY !== maxY) path.lineTo(lastX, lastY);
    }
    c2.strokeStyle = s.color;
    c2.lineWidth = 2;
    c2.lineJoin = "round";
    c2.lineCap = "round";
    c2.stroke(path);
  }
  c2.restore();
}

bench("A renderLine 2x100k (current)", () =>
  renderLine(baseCtx as unknown as Parameters<typeof renderLine>[0], false),
);
bench("B renderLine 2x100k (fused direct)", () =>
  renderLineFused(baseCtx as unknown as R),
);

// gappy variant
const xyGap = {
  ...xyData,
  series: [
    {
      label: "a",
      color: "#0070f3",
      y: yGaps,
      prevY: null,
      pathCache: null,
      hasGaps: true,
    },
  ],
};
const gapCtx = { ...baseCtx, data: xyGap };
bench("A renderLine 100k gappy (current)", () =>
  renderLine(gapCtx as unknown as Parameters<typeof renderLine>[0], false),
);

// ============================================================================
console.log("\n== 10. let vs const — final check on real kernels ==");

bench("A extent const temps", () => {
  let min = Infinity;
  let max = -Infinity;
  for (let i = 0; i < N; i++) {
    const v = y0[i] as number;
    if (v < min) min = v;
    if (v > max) max = v;
  }
  void min;
  void max;
});
bench("B extent let temps", () => {
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
});
bench("C extent inline expr", () => {
  let min = Infinity;
  let max = -Infinity;
  for (let i = 0; i < N; i++) {
    if ((y0[i] as number) < min) min = y0[i] as number;
    if ((y0[i] as number) > max) max = y0[i] as number;
  }
  void min;
  void max;
});

// ============================================================================
console.log("\n== 11. scatter/bubble: per-point scale closure vs inline ==");

function renderScatterInline(r: R): void {
  const d = xyData;
  const c2 = r.ctx;
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
  c2.save();
  c2.beginPath();
  c2.rect(r.plot.x, r.plot.y, r.plot.w, r.plot.h);
  c2.clip();
  for (const s of d.series) {
    const y = s.y;
    c2.fillStyle = s.color;
    c2.beginPath();
    for (let i = 0; i < d.sortedX.length; i++) {
      const x = bx + (d.sortedX[i] as number) * kx;
      if (x < xMin || x > xMax || x !== x) continue;
      const yv = y[i] as number;
      if (yv !== yv) continue;
      const yp = by + yv * ky;
      if (yp !== yp) continue;
      c2.moveTo(x + 2.5, yp);
      c2.arc(x, yp, 2.5, 0, Math.PI * 2);
    }
    c2.fill();
  }
  c2.restore();
}

bench("A scatter scale closures (current)", () =>
  renderScatter(baseCtx as unknown as Parameters<typeof renderScatter>[0]),
);
bench("B scatter inline affine", () =>
  renderScatterInline(baseCtx as unknown as R),
);
void renderBubble;

// ============================================================================
console.log("\n== 12. hidden.has(si) Set vs boolean[] / Uint8 ==");

const hidSet = new Set<number>([1]);
const hidArr = [false, true];
const hidU8 = new Uint8Array([0, 1]);
bench(
  "A Set.has x1M",
  () => {
    let s = 0;
    for (let i = 0; i < 500_000; i++) {
      if (hidSet.has(i & 1)) s++;
    }
    void s;
  },
  200,
);
bench(
  "B bool[] x1M",
  () => {
    let s = 0;
    for (let i = 0; i < 500_000; i++) {
      if (hidArr[i & 1]) s++;
    }
    void s;
  },
  200,
);
bench(
  "C Uint8 x1M",
  () => {
    let s = 0;
    for (let i = 0; i < 500_000; i++) {
      if (hidU8[i & 1]) s++;
    }
    void s;
  },
  200,
);

console.log("\ndone.");
