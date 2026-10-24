import type { CanvasBackend } from "../core/canvas";
import type {
  ChartOptions,
  CurveMode,
  NormalizedData,
  NormalizedXY,
  Rect,
  Scale,
  ThemeTokens,
} from "../core/types";

export interface RenderContext {
  backend: CanvasBackend;
  ctx: CanvasRenderingContext2D;
  plot: Rect;
  theme: ThemeTokens;
  opts: ChartOptions;
  data: NormalizedData;
  /** series indices hidden via legend toggles (indexes `d.series` / donut slices) */
  hidden: ReadonlySet<number>;
  xScale: Scale;
  yScale: Scale;
  /** eased animation progress, 0..1 */
  t: number;
}

export type SeriesRenderer = (r: RenderContext) => void;

export function lerpY(
  s: { y: Float64Array; prevY: Float64Array | null },
  i: number,
  t: number,
  fallback: number,
): number {
  const to = s.y[i] ?? fallback;
  const from = s.prevY?.[i] ?? fallback;
  if (t >= 1) return to;
  return Number.isFinite(from) && Number.isFinite(to)
    ? from + (to - from) * t
    : to;
}

export function isXY(d: NormalizedData): d is NormalizedXY {
  return d.kind === "xy";
}

/**
 * Call `fn(start, count)` for each contiguous run of finite-y points in the
 * interleaved `[x, y]` array `pts` (length `n` points). NaN runs — data
 * gaps — are skipped, so path builders emit broken segments.
 */
export function eachRun(
  pts: ArrayLike<number>,
  n: number,
  fn: (start: number, count: number) => void,
): void {
  let i = 0;
  while (i < n) {
    if (!Number.isFinite(pts[2 * i + 1] as number)) {
      i++;
      continue;
    }
    let j = i + 1;
    while (j < n && Number.isFinite(pts[2 * j + 1] as number)) j++;
    fn(i, j - i);
    i = j;
  }
}

/** view of points `start..start+count` of an interleaved [x,y] typed array */
export function segView(
  pts: ArrayLike<number>,
  start: number,
  count: number,
): Float32Array | Float64Array {
  return (pts as Float32Array | Float64Array).subarray(
    2 * start,
    2 * (start + count),
  );
}

/** indices of visible series in `d.series` order */
export function visibleSeries(
  len: number,
  hidden: ReadonlySet<number>,
): number[] {
  const out: number[] = [];
  for (let i = 0; i < len; i++) {
    if (!hidden.has(i)) out.push(i);
  }
  return out;
}

/** zero anchor for bar-style charts — log domains can't show 0, anchor at the axis floor instead */
export function axisBase(r: RenderContext): number {
  return r.yScale(r.opts.yScale === "log" ? r.yScale.domain[0] : 0);
}

/** pooled scratch for smoothPath tangents — consumed within the call */
let smScratch = new Float64Array(0);

/**
 * Monotone cubic path (Fritsch–Carlson tangents) — never overshoots data.
 * `pts` is interleaved [x0, y0, x1, y1, ...] with `n` points.
 */
export function smoothPath(
  ctx: CanvasPath,
  pts: ArrayLike<number>,
  n: number,
  connect = false,
): void {
  if (n < 3) {
    for (let i = 0; i < n; i++) {
      const x = pts[2 * i] as number;
      const y = pts[2 * i + 1] as number;
      if (i === 0 && !connect) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    return;
  }
  const segs = n - 1;
  const need = segs + n;
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
  if (connect) ctx.lineTo(pts[0] as number, pts[1] as number);
  else ctx.moveTo(pts[0] as number, pts[1] as number);
  for (let i = 0; i < segs; i++) {
    const x0 = pts[2 * i] as number;
    const x1 = pts[2 * (i + 1)] as number;
    const y0 = pts[2 * i + 1] as number;
    const y1 = pts[2 * (i + 1) + 1] as number;
    const h = (x1 - x0) / 3;
    ctx.bezierCurveTo(
      x0 + h,
      y0 + h * (tang[i] as number),
      x1 - h,
      y1 - h * (tang[i + 1] as number),
      x1,
      y1,
    );
  }
}

/** pooled scratch for splinePath control points — consumed within the call */
let spScratch = new Float64Array(0);

/**
 * Distance-weighted cubic spline (Chart.js `cubicInterpolationMode: "default"`,
 * Rob Spencer's method) — pleasant curves that may overshoot local extrema.
 * `pts` is interleaved [x0, y0, x1, y1, ...] with `n` points; `tension` scales
 * control-point distance (0 = straight lines).
 */
export function splinePath(
  ctx: CanvasPath,
  pts: ArrayLike<number>,
  n: number,
  tension = 0.4,
  connect = false,
): void {
  if (n < 3) {
    for (let i = 0; i < n; i++) {
      const x = pts[2 * i] as number;
      const y = pts[2 * i + 1] as number;
      if (i === 0 && !connect) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    return;
  }
  const need = 4 * n;
  if (spScratch.length < need) spScratch = new Float64Array(need);
  const c1x = spScratch.subarray(0, n);
  const c1y = spScratch.subarray(n, 2 * n);
  const c2x = spScratch.subarray(2 * n, 3 * n);
  const c2y = spScratch.subarray(3 * n, 4 * n);
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
  if (connect) ctx.lineTo(pts[0] as number, pts[1] as number);
  else ctx.moveTo(pts[0] as number, pts[1] as number);
  for (let i = 0; i < n - 1; i++) {
    ctx.bezierCurveTo(
      c2x[i] as number,
      c2y[i] as number,
      c1x[i + 1] as number,
      c1y[i + 1] as number,
      pts[2 * (i + 1)] as number,
      pts[2 * (i + 1) + 1] as number,
    );
  }
}

function traceSeg(
  path: CanvasPath,
  pts: ArrayLike<number>,
  n: number,
  curve: CurveMode,
  connect: boolean,
  tension: number,
): void {
  if (n === 0) return;
  const join = (x: number, y: number) =>
    connect ? path.lineTo(x, y) : path.moveTo(x, y);
  if (curve === "step") {
    join(pts[0] as number, pts[1] as number);
    for (let i = 1; i < n; i++) {
      const x = pts[2 * i] as number;
      path.lineTo(x, pts[2 * i - 1] as number);
      path.lineTo(x, pts[2 * i + 1] as number);
    }
  } else if (curve === "smooth") {
    smoothPath(path, pts, n, connect);
  } else if (curve === "cubic") {
    splinePath(path, pts, n, tension, connect);
  } else {
    join(pts[0] as number, pts[1] as number);
    for (let i = 1; i < n; i++) {
      path.lineTo(pts[2 * i] as number, pts[2 * i + 1] as number);
    }
  }
}

/**
 * Trace `n` interleaved [x, y] pixel points into `path` honoring `curve`
 * (linear / step / smooth / cubic). `connect` continues the current subpath
 * with a lineTo instead of starting a new one — used for closed band shapes.
 * `tension` only applies to `cubic`.
 *
 * NaN y values break the trace: each contiguous finite run becomes its own
 * subpath. With `connect: true` the caller guarantees gap-free input and the
 * trace is emitted verbatim.
 */
export function traceCurve(
  path: CanvasPath,
  pts: ArrayLike<number>,
  n: number,
  curve: CurveMode,
  connect = false,
  tension = 0.4,
): void {
  if (n === 0) return;
  if (connect) {
    traceSeg(path, pts, n, curve, true, tension);
    return;
  }
  if (curve === "linear") {
    // fused single pass — no per-run callback or subarray views
    let started = false;
    for (let i = 0; i < n; i++) {
      const y = pts[2 * i + 1] as number;
      if (!Number.isFinite(y)) {
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
    return;
  }
  eachRun(pts, n, (start, count) =>
    traceSeg(path, segView(pts, start, count), count, curve, false, tension),
  );
}
