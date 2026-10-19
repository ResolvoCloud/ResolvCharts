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
  return t >= 1 ? to : from + (to - from) * t;
}

export function isXY(d: NormalizedData): d is NormalizedXY {
  return d.kind === "xy";
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

/**
 * Trace `n` interleaved [x, y] pixel points into `path` honoring `curve`
 * (linear / step / smooth). `connect` continues the current subpath with a
 * lineTo instead of starting a new one — used for closed band shapes.
 */
export function traceCurve(
  path: CanvasPath,
  pts: ArrayLike<number>,
  n: number,
  curve: CurveMode,
  connect = false,
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
  } else {
    join(pts[0] as number, pts[1] as number);
    for (let i = 1; i < n; i++) {
      path.lineTo(pts[2 * i] as number, pts[2 * i + 1] as number);
    }
  }
}
