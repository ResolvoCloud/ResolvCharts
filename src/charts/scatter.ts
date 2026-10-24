import { withAlpha } from "../core/color";
import { hitXY } from "./line";
import type { RenderContext } from "./registry";
import { isXY } from "./registry";

export function renderScatter(r: RenderContext): void {
  if (!isXY(r.data)) return;
  const d = r.data;
  const ctx = r.ctx;
  const t = r.t;
  const lerp = t < 1;
  const fallback = r.yScale.domain[0];
  const xMin = r.plot.x - 3;
  const xMax = r.plot.x + r.plot.w + 3;
  ctx.save();
  ctx.beginPath();
  ctx.rect(r.plot.x, r.plot.y, r.plot.w, r.plot.h);
  ctx.clip();
  for (let si = 0; si < d.series.length; si++) {
    if (r.hidden.has(si)) continue;
    const s = d.series[si];
    if (!s) continue;
    const y = s.y;
    const prev = s.prevY;
    ctx.fillStyle = withAlpha(s.color, 0.65);
    ctx.beginPath();
    for (let i = 0; i < d.sortedX.length; i++) {
      const x = r.xScale(d.sortedX[i] as number);
      if (x < xMin || x > xMax || !Number.isFinite(x)) continue;
      let yv = y[i] as number;
      if (!Number.isFinite(yv)) continue;
      if (lerp) {
        const pv = prev ? (prev[i] as number) : NaN;
        const p = Number.isFinite(pv) ? pv : fallback;
        yv = p + (yv - p) * t;
      }
      const yp = r.yScale(yv);
      if (!Number.isFinite(yp)) continue;
      ctx.moveTo(x + 2.5, yp);
      ctx.arc(x, yp, 2.5, 0, Math.PI * 2);
    }
    ctx.fill();
  }
  ctx.restore();
}

export { hitXY as hitScatter };
