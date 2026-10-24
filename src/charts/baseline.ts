import { withAlpha } from "../core/color";
import { fillRuns, hitXY, seriesPoints } from "./line";
import type { RenderContext } from "./registry";
import { isXY, traceCurve } from "./registry";

/**
 * Baseline/delta chart: one line colored green above a reference value and
 * red below, with matching gradient fills (lightweight-charts BaselineSeries
 * model). Uses the first series only.
 */
export function renderBaseline(r: RenderContext): void {
  if (!isXY(r.data)) return;
  const d = r.data;
  const s = d.series[0];
  if (!s || d.sortedX.length === 0 || r.hidden.has(0)) return;
  const ctx = r.ctx;
  const base = r.opts.baseline ?? (s.y[0] as number);
  const basePx = Math.max(
    r.plot.y,
    Math.min(r.plot.y + r.plot.h, r.yScale(base)),
  );
  const pts = seriesPoints(r, s, base);
  const path = new Path2D();
  traceCurve(
    path,
    pts,
    pts.length / 2,
    r.opts.curve ?? "linear",
    false,
    r.opts.tension,
  );
  const area = new Path2D();
  fillRuns(r, area, pts, basePx);

  const regions: {
    top: number;
    bot: number;
    color: string;
    gFrom: number;
    gTo: number;
  }[] = [
    { top: r.plot.y, bot: basePx, color: r.theme.up, gFrom: 0.28, gTo: 0.05 },
    {
      top: basePx,
      bot: r.plot.y + r.plot.h,
      color: r.theme.down,
      gFrom: 0.05,
      gTo: 0.28,
    },
  ];
  for (const reg of regions) {
    if (reg.bot - reg.top <= 0) continue;
    ctx.save();
    ctx.beginPath();
    ctx.rect(r.plot.x, reg.top, r.plot.w, reg.bot - reg.top);
    ctx.clip();
    const g = ctx.createLinearGradient(0, reg.top, 0, reg.bot);
    g.addColorStop(0, withAlpha(reg.color, reg.gFrom));
    g.addColorStop(1, withAlpha(reg.color, reg.gTo));
    ctx.fillStyle = g;
    ctx.fill(area);
    ctx.strokeStyle = reg.color;
    ctx.lineWidth = 2;
    ctx.lineJoin = "round";
    ctx.lineCap = "round";
    ctx.stroke(path);
    ctx.restore();
  }
  // baseline hairline
  ctx.strokeStyle = r.theme.axisBaseline;
  ctx.lineWidth = 1;
  ctx.setLineDash([4, 4]);
  ctx.beginPath();
  const bx = Math.round(basePx) + 0.5;
  ctx.moveTo(r.plot.x, bx);
  ctx.lineTo(r.plot.x + r.plot.w, bx);
  ctx.stroke();
  ctx.setLineDash([]);
}

export { hitXY as hitBaseline };
