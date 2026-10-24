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
  const curve = r.opts.curve ?? "linear";
  if (curve === "linear") {
    // fused single pass — moveTo a run, lineTo through it, close at its end
    let started = false;
    let firstX = 0;
    let lastX = 0;
    for (let i = 0; i < n; i++) {
      const y = pts[2 * i + 1] as number;
      const x = pts[2 * i] as number;
      if (!Number.isFinite(y)) {
        if (started) {
          path.lineTo(lastX, base);
          path.lineTo(firstX, base);
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
      path.lineTo(lastX, base);
      path.lineTo(firstX, base);
      path.closePath();
    }
    return;
  }
  eachRun(pts, n, (start, count) => {
    traceCurve(
      path,
      segView(pts, start, count),
      count,
      curve,
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
  const curve = r.opts.curve ?? "linear";
  const tension = r.opts.tension;
  const base = fill ? r.yScale(Math.max(0, r.yScale.domain[0])) : 0;
  // memo key: everything that can change the traced geometry. Series objects
  // are replaced on setData/append, so data identity needs no keying.
  const key = [
    r.t,
    r.xScale.domain[0],
    r.xScale.domain[1],
    r.xScale.range[0],
    r.xScale.range[1],
    r.yScale.domain[0],
    r.yScale.domain[1],
    r.yScale.range[0],
    r.yScale.range[1],
    curve,
    tension,
    r.opts.flow ? 1 : 0,
    r.opts.xScale,
    r.opts.yScale,
    r.opts.logBase,
    fill ? 1 : 0,
  ].join("|");

  // pass 1: resolve paths (cache or rebuild) and track pixel bounds —
  // clip is skipped when every series lands inside the plot
  const plot = r.plot;
  const px0 = plot.x;
  const px1 = plot.x + plot.w;
  const py0 = plot.y;
  const py1 = plot.y + plot.h;
  let needClip = fill && (base < py0 || base > py1);
  const draws: {
    s: (typeof d.series)[number];
    pc: NonNullable<(typeof d.series)[number]["pathCache"]>;
  }[] = [];
  for (let i = 0; i < d.series.length; i++) {
    if (r.hidden.has(i)) continue;
    const s = d.series[i];
    if (!s) continue;
    let pc = s.pathCache;
    if (!pc || pc.key !== key) {
      const pts = seriesPoints(r, s);
      const dn = pts.length / 2;
      if (dn === 0) {
        s.pathCache = null;
        continue;
      }
      const path = new Path2D();
      traceCurve(path, pts, dn, curve, false, tension);
      let x0 = Infinity;
      let x1 = -Infinity;
      let y0 = Infinity;
      let y1 = -Infinity;
      for (let j = 0; j < pts.length; j += 2) {
        const xv = pts[j] as number;
        const yv = pts[j + 1] as number;
        if (xv < x0) x0 = xv;
        if (xv > x1) x1 = xv;
        if (yv < y0) y0 = yv;
        if (yv > y1) y1 = yv;
      }
      pc = { key, path, x0, x1, y0, y1 };
      if (fill) {
        const area = new Path2D();
        fillRuns(r, area, pts, base);
        pc.area = area;
      }
      s.pathCache = pc;
    }
    if (pc.x0 < px0 || pc.x1 > px1 || pc.y0 < py0 || pc.y1 > py1) {
      needClip = true;
    }
    draws.push({ s, pc });
  }

  // pass 2: draw
  ctx.save();
  if (needClip) {
    ctx.beginPath();
    ctx.rect(px0, py0, plot.w, plot.h);
    ctx.clip();
  }
  for (const { s, pc } of draws) {
    if (fill && pc.area) {
      const g = ctx.createLinearGradient(0, py0, 0, py1);
      g.addColorStop(0, withAlpha(s.color, 0.16));
      g.addColorStop(1, withAlpha(s.color, 0));
      ctx.fillStyle = g;
      ctx.fill(pc.area);
    }
    ctx.strokeStyle = s.color;
    ctx.lineWidth = 2;
    ctx.lineJoin = "round";
    ctx.lineCap = "round";
    ctx.stroke(pc.path);
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
