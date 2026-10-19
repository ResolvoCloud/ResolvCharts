import { withAlpha } from "../core/color";
import { hitXY } from "./line";
import type { RenderContext } from "./registry";
import { isXY } from "./registry";

const MIN_R = 3;
const MAX_R = 16;

/**
 * Bubble chart: scatter points sized by each series' `r` channel, mapped
 * linearly to [MIN_R, MAX_R] px across the dataset's radius extent.
 */
export function renderBubble(r: RenderContext): void {
  if (!isXY(r.data)) return;
  const d = r.data;
  const ctx = r.ctx;
  const t = r.t;
  const lerp = t < 1;
  const fallback = r.yScale.domain[0];
  let lo = Infinity;
  let hi = -Infinity;
  for (const s of d.series) {
    const rr = s.r;
    if (!rr) continue;
    for (let i = 0; i < rr.length; i++) {
      const v = rr[i] as number;
      if (v < lo) lo = v;
      if (v > hi) hi = v;
    }
  }
  if (lo === Infinity) {
    lo = 0;
    hi = 1;
  }
  const span = hi - lo || 1;
  const grow = lerp ? t : 1;
  const rad = (v: number) =>
    (MIN_R + ((v - lo) / span) * (MAX_R - MIN_R)) * grow;
  const xMin = r.plot.x - MAX_R;
  const xMax = r.plot.x + r.plot.w + MAX_R;
  ctx.save();
  ctx.beginPath();
  ctx.rect(r.plot.x, r.plot.y, r.plot.w, r.plot.h);
  ctx.clip();
  for (const s of d.series) {
    const y = s.y;
    const prev = s.prevY;
    const rr = s.r;
    ctx.fillStyle = withAlpha(s.color, 0.45);
    ctx.strokeStyle = s.color;
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    for (let i = 0; i < d.sortedX.length; i++) {
      const x = r.xScale(d.sortedX[i] as number);
      if (x < xMin || x > xMax) continue;
      let yv = y[i] as number;
      if (lerp) {
        const p = prev ? (prev[i] as number) : fallback;
        yv = p + (yv - p) * t;
      }
      const yp = r.yScale(yv);
      const pr = rad(rr ? (rr[i] as number) : lo + span / 2);
      if (pr <= 0) continue;
      ctx.moveTo(x + pr, yp);
      ctx.arc(x, yp, pr, 0, Math.PI * 2);
    }
    ctx.fill();
    ctx.stroke();
  }
  ctx.restore();
}

export { hitXY as hitBubble };
