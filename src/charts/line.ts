import { withAlpha } from "../core/color";
import { decimateSeriesPx, mapSeriesPx } from "../core/decimate";
import { nearestIndex } from "../core/hit";
import type { HoverInfo } from "../core/types";
import type { RenderContext } from "./registry";
import { isXY, traceCurve } from "./registry";

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
 */
export function seriesPoints(
  r: RenderContext,
  s: { y: Float64Array; prevY: Float64Array | null },
  yFallback?: number,
): Float32Array {
  const d = r.data;
  if (!isXY(d)) throw new Error("unreachable");
  const n = d.sortedX.length;
  if (n === 0) return new Float32Array(0);
  const fb = yFallback ?? r.yScale.domain[0];
  const flow = r.opts.flow ? FLOW_RIPPLE : 0;
  return n > r.plot.w * 1.5
    ? decimateSeriesPx(
        d.sortedX,
        s.y,
        s.prevY,
        r.t,
        fb,
        r.xScale,
        r.yScale,
        r.plot.w,
        flow,
      )
    : mapSeriesPx(d.sortedX, s.y, s.prevY, r.t, fb, r.xScale, r.yScale, flow);
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
  traceCurve(path, pts, dn, r.opts.curve ?? "linear");
  return {
    path,
    firstX: pts[0] as number,
    lastX: pts[2 * dn - 2] as number,
    lastY: pts[2 * dn - 1] as number,
  };
}

export function renderLine(r: RenderContext, fill: boolean): void {
  if (!isXY(r.data)) return;
  const d = r.data;
  const ctx = r.ctx;
  ctx.save();
  ctx.beginPath();
  ctx.rect(r.plot.x, r.plot.y, r.plot.w, r.plot.h);
  ctx.clip();

  for (const s of d.series) {
    const { path, firstX, lastX } = buildPath(r, s);
    if (fill && lastX !== firstX) {
      const area = new Path2D(path);
      const base = r.yScale(Math.max(0, r.yScale.domain[0]));
      area.lineTo(lastX, base);
      area.lineTo(firstX, base);
      area.closePath();
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
  const values = d.series.map((s) => {
    const yVal = s.y[idx] as number;
    const sy = r.yScale(yVal);
    if (sy < py) py = sy;
    return { label: s.label, color: s.color, y: yVal };
  });
  return { kind: "point", index: idx, x: xVal, px: sx, py, values };
}
