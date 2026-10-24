import { withAlpha } from "../core/color";
import { decimateSeriesPx, mapSeriesPx } from "../core/decimate";
import { nearestIndex } from "../core/hit";
import type { HoverInfo } from "../core/types";
import type { RenderContext } from "./registry";
import { eachRun, isXY, segView, traceCurve } from "./registry";

/** fraction of the tween the trailing edge lags behind the leading point */
export const FLOW_RIPPLE = 0.35;

export interface BuiltPath {
  path: Path2D;
  /** pixel x of the first drawn point (area fill edge) */
  firstX: number;
  /** pixel x of the last drawn point */
  lastX: number;
  /** pixel y of the last drawn point */
  lastY: number;
}

/**
 * Materialize one series as interleaved [x, y] pixel pairs: scales to pixel
 * space, lerps y while animating, and M4-decimates when points exceed ~1.5x
 * the plot width. Shared by the Canvas2D path builder and the WebGPU backend.
 * NaN y values mark data gaps — {@link traceCurve}/{@link eachRun} split on
 * them.
 */
export function seriesPoints(
  r: RenderContext,
  s: {
    y: Float64Array;
    prevY: Float64Array | null;
    hasGaps?: boolean | undefined;
    gapIdx?: number[] | undefined;
    yLog?: Float64Array | undefined;
    prevYLog?: Float64Array | null;
  },
  yFallback?: number,
): Float32Array {
  const d = r.data;
  if (!isXY(d)) throw new Error("unreachable");
  const n = d.sortedX.length;
  if (n === 0) return new Float32Array(0);
  let fb = yFallback ?? r.yScale.domain[0];
  const flow = r.opts.flow ? FLOW_RIPPLE : 0;
  const lb = r.opts.logBase ?? 10;
  const logX = r.opts.xScale === "log";
  const logY = r.opts.yScale === "log";
  const logs =
    logX || logY
      ? { x: logX ? lb : undefined, y: logY ? lb : undefined }
      : undefined;
  // cached display-space arrays — the decimator runs pure affine on them
  const xs = logX && d.sortedXLog ? d.sortedXLog : d.sortedX;
  const ys = logY && s.yLog ? s.yLog : s.y;
  const prev = ys === s.y ? s.prevY : (s.prevYLog ?? null);
  const pre = logs ? { x: xs !== d.sortedX, y: ys !== s.y } : undefined;
  if (pre?.y && fb > 0) fb = Math.log(fb) / Math.log(lb);
  const gaps = s.hasGaps === true;
  return n > r.plot.w * 1.5
    ? decimateSeriesPx(
        xs,
        ys,
        prev,
        r.t,
        fb,
        r.xScale,
        r.yScale,
        r.plot.w,
        flow,
        logs,
        gaps,
        s.gapIdx,
        pre,
      )
    : mapSeriesPx(
        xs,
        ys,
        prev,
        r.t,
        fb,
        r.xScale,
        r.yScale,
        flow,
        logs,
        gaps,
        pre,
      );
}

export function buildPath(
  r: RenderContext,
  s: { y: Float64Array; prevY: Float64Array | null },
  yFallback?: number,
): BuiltPath {
  const path = new Path2D();
  const pts = seriesPoints(r, s, yFallback);
  const dn = pts.length / 2;
  if (dn === 0) return { path, firstX: 0, lastX: 0, lastY: 0 };
  traceCurve(path, pts, dn, r.opts.curve ?? "linear", false, r.opts.tension);
  let firstX = 0;
  let lastX = 0;
  let lastY = 0;
  let seen = false;
  eachRun(pts, dn, (start, count) => {
    if (!seen) {
      firstX = pts[2 * start] as number;
      seen = true;
    }
    lastX = pts[2 * (start + count) - 2] as number;
    lastY = pts[2 * (start + count) - 1] as number;
  });
  return { path, firstX, lastX, lastY };
}

/** Fill the area under a points array down to `base` — one closed subpath per finite run. */
export function fillRuns(
  r: RenderContext,
  path: Path2D,
  pts: Float32Array,
  base: number,
): void {
  const n = pts.length / 2;
  eachRun(pts, n, (start, count) => {
    traceCurve(
      path,
      segView(pts, start, count),
      count,
      r.opts.curve ?? "linear",
      false,
      r.opts.tension,
    );
    path.lineTo(pts[2 * (start + count) - 2] as number, base);
    path.lineTo(pts[2 * start] as number, base);
    path.closePath();
  });
}

export function renderLine(r: RenderContext, fill: boolean): void {
  if (!isXY(r.data)) return;
  const d = r.data;
  const ctx = r.ctx;
  ctx.save();
  ctx.beginPath();
  ctx.rect(r.plot.x, r.plot.y, r.plot.w, r.plot.h);
  ctx.clip();

  for (let i = 0; i < d.series.length; i++) {
    if (r.hidden.has(i)) continue;
    const s = d.series[i];
    if (!s) continue;
    const pts = seriesPoints(r, s);
    const dn = pts.length / 2;
    if (dn === 0) continue;
    const path = new Path2D();
    traceCurve(path, pts, dn, r.opts.curve ?? "linear", false, r.opts.tension);
    if (fill) {
      const area = new Path2D();
      fillRuns(r, area, pts, r.yScale(Math.max(0, r.yScale.domain[0])));
      const g = ctx.createLinearGradient(0, r.plot.y, 0, r.plot.y + r.plot.h);
      g.addColorStop(0, withAlpha(s.color, 0.16));
      g.addColorStop(1, withAlpha(s.color, 0));
      ctx.fillStyle = g;
      ctx.fill(area);
    }
    ctx.strokeStyle = s.color;
    ctx.lineWidth = 2;
    ctx.lineJoin = "round";
    ctx.lineCap = "round";
    ctx.stroke(path);
  }
  ctx.restore();
}

export function hitXY(r: RenderContext, px: number): HoverInfo | null {
  if (!isXY(r.data)) return null;
  const d = r.data;
  const idx = nearestIndex(d.sortedX, r.xScale.invert(px));
  if (idx < 0) return null;
  const xVal = d.sortedX[idx] as number;
  const sx = r.xScale(xVal);
  let py = r.plot.y + r.plot.h;
  const values: { label: string; color: string; y: number }[] = [];
  for (let i = 0; i < d.series.length; i++) {
    const s = d.series[i];
    if (!s || r.hidden.has(i)) continue;
    const yVal = s.y[idx] as number;
    if (!Number.isFinite(yVal)) continue;
    const sy = r.yScale(yVal);
    if (sy < py) py = sy;
    values.push({ label: s.label, color: s.color, y: yVal });
  }
  return { kind: "point", index: idx, x: xVal, px: sx, py, values };
}
