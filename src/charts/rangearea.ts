import { withAlpha } from "../core/color";
import { hitXY, seriesPoints } from "./line";
import type { RenderContext } from "./registry";
import { isXY, traceCurve } from "./registry";

/** pooled scratch for the reversed lower edge — consumed within the call */
let revScratch = new Float64Array(0);

/**
 * Range-area chart: a filled band between each series' `y` (lower edge) and
 * `y2` (upper edge) — confidence intervals, min/max envelopes. Series
 * without `y2` are skipped.
 */
export function renderRangeArea(r: RenderContext): void {
  if (!isXY(r.data)) return;
  const d = r.data;
  const ctx = r.ctx;
  const curve = r.opts.curve ?? "linear";
  ctx.save();
  ctx.beginPath();
  ctx.rect(r.plot.x, r.plot.y, r.plot.w, r.plot.h);
  ctx.clip();
  for (const s of d.series) {
    if (!s.y2) continue;
    const hi = seriesPoints(r, { y: s.y2, prevY: s.prevY2 });
    const lo = seriesPoints(r, s);
    const n = Math.min(hi.length, lo.length) / 2;
    if (n === 0) continue;
    if (revScratch.length < n * 2) revScratch = new Float64Array(n * 2);
    for (let i = 0; i < n; i++) {
      revScratch[2 * i] = lo[2 * (n - 1 - i)] as number;
      revScratch[2 * i + 1] = lo[2 * (n - 1 - i) + 1] as number;
    }
    const band = new Path2D();
    traceCurve(band, hi, n, curve);
    traceCurve(band, revScratch, n, curve, true);
    band.closePath();
    ctx.fillStyle = withAlpha(s.color, 0.2);
    ctx.fill(band);
    ctx.strokeStyle = s.color;
    ctx.lineWidth = 1.5;
    ctx.lineJoin = "round";
    ctx.lineCap = "round";
    // both edges as subpaths in one stroke call
    const edges = new Path2D();
    traceCurve(edges, hi, n, curve);
    traceCurve(edges, lo, n, curve);
    ctx.stroke(edges);
  }
  ctx.restore();
}

export { hitXY as hitRangeArea };
