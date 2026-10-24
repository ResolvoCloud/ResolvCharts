/// <reference path="./env.d.ts" />
/** Round 2: integrated variants — shared x-cols, fused fillRuns, let/const clean test. */
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
dom.window.HTMLCanvasElement.prototype.getContext = (() =>
  stubCtx()) as unknown as typeof dom.window.HTMLCanvasElement.prototype.getContext;

const { renderLine } = await import("../src/charts/line");
const { linearScale } = await import("../src/core/scales");
const { lightTheme } = await import("../src/core/theme");

function bench(name: string, fn: () => void, time = 400): void {
  fn();
  fn();
  const warm = performance.now() + Math.min(150, time / 3);
  while (performance.now() < warm) fn();
  const start = performance.now();
  let iters = 0;
  while (performance.now() - start < time) {
    fn();
    iters++;
  }
  const hz = (iters / (performance.now() - start)) * 1000;
  console.log(
    `${name.padEnd(56)} ${hz.toFixed(1).padStart(12)} ops/s  ${(1000 / hz).toFixed(3).padStart(10)} ms/op`,
  );
}

const N = 100_000;
const sortedX = new Float64Array(N);
const y0 = new Float64Array(N);
const y1 = new Float64Array(N);
for (let i = 0; i < N; i++) {
  sortedX[i] = i;
  y0[i] = 50 + 30 * Math.sin(i / 500) + (i % 17);
  y1[i] = (y0[i] as number) * 0.7 + 10;
}
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
console.log("\n== A. renderLine with shared x px/col map (linear axes) ==");

let xpPx = new Float64Array(0);
let xpCol = new Int32Array(0);
let dspScratch = new Float32Array(0);

function decimateShared(
  cols: Int32Array,
  pxs: Float64Array,
  ys: Float64Array,
  yS: typeof yScale,
): Float32Array {
  const n = Math.min(cols.length, ys.length);
  const yd = yS.domain;
  const yr = yS.range;
  const ky = (yr[1] - yr[0]) / (yd[1] - yd[0] || 1);
  const by = yr[0] - yd[0] * ky;
  const maxPts = Math.min(n, 4 * (Math.ceil(plot.w) + 8)) + 1;
  if (dspScratch.length < maxPts * 2) dspScratch = new Float32Array(maxPts * 2);
  const out = dspScratch;
  const cap = out.length;
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

function traceLinearFused(
  path: CanvasPath,
  pts: ArrayLike<number>,
  n: number,
): void {
  let started = false;
  for (let i = 0; i < n; i++) {
    const y = pts[2 * i + 1] as number;
    // biome-ignore lint/suspicious/noSelfCompare: intentional NaN check
    if (y !== y) {
      started = false;
      continue;
    }
    const x = pts[2 * i] as number;
    if (!started) {
      path.moveTo(x, y);
      started = true;
    } else path.lineTo(x, y);
  }
}

function renderLineShared(r: R): void {
  const d = xyData;
  const c2 = r.ctx;
  c2.save();
  c2.beginPath();
  c2.rect(r.plot.x, r.plot.y, r.plot.w, r.plot.h);
  c2.clip();
  const n = d.sortedX.length;
  const xs = d.sortedX;
  if (xpPx.length < n) {
    xpPx = new Float64Array(n);
    xpCol = new Int32Array(n);
  }
  const xd = r.xScale.domain;
  const xr = r.xScale.range;
  const kx = (xr[1] - xr[0]) / (xd[1] - xd[0] || 1);
  const bx = xr[0] - xd[0] * kx;
  for (let i = 0; i < n; i++) {
    const px = bx + (xs[i] as number) * kx;
    xpPx[i] = px;
    xpCol[i] = Math.floor(px);
  }
  const cols = xpCol.subarray(0, n);
  const pxs = xpPx.subarray(0, n);
  for (const s of d.series) {
    const pts = decimateShared(cols, pxs, s.y, r.yScale);
    const path = new Path2D();
    traceLinearFused(path, pts, pts.length / 2);
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
bench("B renderLine 2x100k (shared cols + fused trace)", () =>
  renderLineShared(baseCtx as unknown as R),
);

// 4 series to amplify the shared-x win
const y2 = new Float64Array(N);
const y3 = new Float64Array(N);
for (let i = 0; i < N; i++) {
  y2[i] = (y0[i] as number) * 0.5 + 20;
  y3[i] = (y0[i] as number) * 1.2 - 15;
}
const xy4 = {
  ...xyData,
  series: [
    ...xyData.series,
    { label: "c", color: "#f00", y: y2, prevY: null, pathCache: null },
    { label: "d", color: "#00f", y: y3, prevY: null, pathCache: null },
  ],
};
const ctx4 = { ...baseCtx, data: xy4 };
function renderLineShared4(r: R): void {
  const d = xy4;
  const c2 = r.ctx;
  c2.save();
  c2.beginPath();
  c2.rect(r.plot.x, r.plot.y, r.plot.w, r.plot.h);
  c2.clip();
  const n = d.sortedX.length;
  const xs = d.sortedX;
  if (xpPx.length < n) {
    xpPx = new Float64Array(n);
    xpCol = new Int32Array(n);
  }
  const xd = r.xScale.domain;
  const xr = r.xScale.range;
  const kx = (xr[1] - xr[0]) / (xd[1] - xd[0] || 1);
  const bx = xr[0] - xd[0] * kx;
  for (let i = 0; i < n; i++) {
    const px = bx + (xs[i] as number) * kx;
    xpPx[i] = px;
    xpCol[i] = Math.floor(px);
  }
  const cols = xpCol.subarray(0, n);
  const pxs = xpPx.subarray(0, n);
  for (const s of d.series) {
    const pts = decimateShared(cols, pxs, s.y, r.yScale);
    const path = new Path2D();
    traceLinearFused(path, pts, pts.length / 2);
    c2.strokeStyle = s.color;
    c2.lineWidth = 2;
    c2.lineJoin = "round";
    c2.lineCap = "round";
    c2.stroke(path);
  }
  c2.restore();
}
bench("A renderLine 4x100k (current)", () =>
  renderLine(ctx4 as unknown as Parameters<typeof renderLine>[0], false),
);
bench("B renderLine 4x100k (shared cols + fused trace)", () =>
  renderLineShared4(ctx4 as unknown as R),
);

// ============================================================================
console.log("\n== B. fillRuns linear: eachRun+segView vs fused ==");

const { fillRuns } = await import("../src/charts/line");
const { decimateSeriesPx } = await import("../src/core/decimate");
const pts = decimateSeriesPx(sortedX, y0, null, 1, 0, xScale, yScale, plot.w);
const base = yScale(0);

bench("A fillRuns (eachRun + segView + traceSeg)", () => {
  const p = new Path2D();
  fillRuns(baseCtx as unknown as Parameters<typeof fillRuns>[0], p, pts, base);
});

function fillRunsFused(
  path: Path2D,
  pts2: ArrayLike<number>,
  n: number,
  baseY: number,
): void {
  let started = false;
  let firstX = 0;
  let lastX = 0;
  for (let i = 0; i < n; i++) {
    const y = pts2[2 * i + 1] as number;
    const x = pts2[2 * i] as number;
    // biome-ignore lint/suspicious/noSelfCompare: intentional NaN check
    if (y !== y) {
      if (started) {
        path.lineTo(lastX, baseY);
        path.lineTo(firstX, baseY);
        path.closePath();
        started = false;
      }
      continue;
    }
    if (!started) {
      path.moveTo(x, y);
      firstX = x;
      started = true;
    } else {
      path.lineTo(x, y);
    }
    lastX = x;
  }
  if (started) {
    path.lineTo(lastX, baseY);
    path.lineTo(firstX, baseY);
    path.closePath();
  }
}

bench("B fillRuns fused", () => {
  const p = new Path2D();
  fillRunsFused(p, pts, pts.length / 2, base);
});

// ============================================================================
console.log("\n== C. let vs const — identical bodies, only keyword differs ==");

function extConst(xs: Float64Array): number {
  let min = Infinity;
  let max = -Infinity;
  for (let i = 0; i < xs.length; i++) {
    const v = xs[i] as number;
    if (v < min) min = v;
    if (v > max) max = v;
  }
  return max - min;
}
function extLet(xs: Float64Array): number {
  let min = Infinity;
  let max = -Infinity;
  for (let i = 0; i < xs.length; i++) {
    const v = xs[i] as number;
    if (v < min) min = v;
    if (v > max) max = v;
  }
  return max - min;
}
void extLet;
// same function but 'let' unused-mutate-free can't compile differently; run both
function extLet2(xs: Float64Array): number {
  let min = Infinity;
  let max = -Infinity;
  let i = 0;
  for (i = 1; i < xs.length; i++) {
    const v = xs[i] as number;
    if (v < min) min = v;
    if (v > max) max = v;
  }
  return max - min;
}
bench("A extent const-only", () => extConst(y0));
bench("B extent let temps", () => extLet2(y0));

// decimate-like kernel with several temps
function decConst(xs: Float64Array, ys: Float64Array): number {
  let col = Math.floor(xs[0] as number);
  let lastY = ys[0] as number;
  let runs = 0;
  for (let i = 1; i < xs.length; i++) {
    const x = xs[i] as number;
    const y = ys[i] as number;
    const c = Math.floor(x);
    if (c !== col) {
      runs++;
      col = c;
    }
    if (y > lastY) lastY = y;
  }
  return runs + lastY;
}
function decLet(xs: Float64Array, ys: Float64Array): number {
  let col = Math.floor(xs[0] as number);
  let lastY = ys[0] as number;
  let runs = 0;
  for (let i = 1; i < xs.length; i++) {
    const x = xs[i] as number;
    const y = ys[i] as number;
    const c = Math.floor(x);
    if (c !== col) {
      runs++;
      col = c;
    }
    if (y > lastY) lastY = y;
  }
  return runs + lastY;
}
bench("C decimate-kernel const temps", () => decConst(sortedX, y0));
bench("D decimate-kernel let temps", () => decLet(sortedX, y0));

// ============================================================================
console.log("\n== D. eachRun callback vs manual run loop (overhead alone) ==");

const { eachRun } = await import("../src/charts/registry");
bench("A eachRun callback x dn pts", () => {
  let runs = 0;
  eachRun(pts, pts.length / 2, () => runs++);
  void runs;
});
bench("B manual NaN scan x dn pts", () => {
  let runs = 0;
  let started = false;
  const nn = pts.length / 2;
  for (let i = 0; i < nn; i++) {
    const y = pts[2 * i + 1] as number;
    // biome-ignore lint/suspicious/noSelfCompare: intentional NaN check
    if (y === y) {
      if (!started) {
        runs++;
        started = true;
      }
    } else started = false;
  }
  void runs;
});

console.log("\ndone.");
