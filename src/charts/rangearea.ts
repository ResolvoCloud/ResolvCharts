import { withAlpha } from "../core/color";
import { hitXY, seriesPoints } from "./line";
import type { RenderContext } from "./registry";
import { eachRun, isXY, segView, traceCurve } from "./registry";

/** pooled scratch for the reversed lower edge — consumed within the call */
let revScratch = new Float64Array(0);

/**
 * Range-area chart: a filled band between each series' `y` (lower edge) and
 * `y2` (upper edge) — confidence intervals, min/max envelopes. Series
 * without `y2` are skipped. Gaps (either edge missing) split the band into
 * separate closed pieces.
 */
export function renderRangeArea(r: RenderContext): void {
  if (!isXY(r.data)) return;
  const d = r.data;
  const ctx = r.ctx;
  const curve = r.opts.curve ?? "linear";
  const tension = r.opts.tension;
  ctx.save();
  ctx.beginPath();
  ctx.rect(r.plot.x, r.plot.y, r.plot.w, r.plot.h);
  ctx.clip();
  for (let si = 0; si < d.series.length; si++) {
    if (r.hidden.has(si)) continue;
    const s = d.series[si];
    if (!s?.y2) continue;
    const hi = seriesPoints(r, {
      y: s.y2,
      prevY: s.prevY2,
      hasGaps: s.hasGaps,
      gapIdx: s.gapIdx,
      yLog: s.y2Log ?? undefined,
      prevYLog: s.prevY2Log ?? null,
    });
    const lo = seriesPoints(r, s);
    const n = Math.min(hi.length, lo.length) / 2;
    if (n === 0) continue;
    if (revScratch.length < n * 2) revScratch = new Float64Array(n * 2);
    ctx.fillStyle = withAlpha(s.color, 0.2);
    // each finite run is an independent closed band piece
    eachRun(hi, n, (start, count) => {
      for (let i = 0; i < count; i++) {
        revScratch[2 * i] = lo[2 * (start + count - 1 - i)] as number;
        revScratch[2 * i + 1] = lo[2 * (start + count - 1 - i) + 1] as number;
      }
      const band = new Path2D();
      traceCurve(band, segView(hi, start, count), count, curve, false, tension);
      traceCurve(
        band,
        revScratch.subarray(0, count * 2),
        count,
        curve,
        true,
        tension,
      );
      band.closePath();
      ctx.fill(band);
    });
    ctx.strokeStyle = s.color;
    ctx.lineWidth = 1.5;
    ctx.lineJoin = "round";
    ctx.lineCap = "round";
    // both edges as subpaths in one stroke call (runs split on NaN)
    const edges = new Path2D();
    traceCurve(edges, hi, n, curve, false, tension);
    traceCurve(edges, lo, n, curve, false, tension);
    ctx.stroke(edges);
  }
  ctx.restore();
}

export { hitXY as hitRangeArea };
