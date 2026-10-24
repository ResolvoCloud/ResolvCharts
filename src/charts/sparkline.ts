import { withAlpha } from "../core/color";
import { fillRuns, hitXY, seriesPoints } from "./line";
import type { RenderContext } from "./registry";
import { isXY, traceCurve } from "./registry";

export function renderSparkline(r: RenderContext): void {
  if (!isXY(r.data)) return;
  const d = r.data;
  const ctx = r.ctx;
  const s = d.series[0];
  if (!s || d.sortedX.length === 0 || r.hidden.has(0)) return;
  const pts = seriesPoints(r, s);
  const dn = pts.length / 2;
  const path = new Path2D();
  traceCurve(path, pts, dn, r.opts.curve ?? "linear", false, r.opts.tension);
  const area = new Path2D();
  fillRuns(r, area, pts, r.plot.y + r.plot.h);
  ctx.fillStyle = withAlpha(s.color, 0.1);
  ctx.fill(area);
  ctx.strokeStyle = s.color;
  ctx.lineWidth = 1.5;
  ctx.lineJoin = "round";
  ctx.lineCap = "round";
  ctx.stroke(path);
  // end dot on the last finite point
  for (let i = dn - 1; i >= 0; i--) {
    const y = pts[2 * i + 1] as number;
    if (!Number.isFinite(y)) continue;
    ctx.fillStyle = s.color;
    ctx.beginPath();
    ctx.arc(pts[2 * i] as number, y, 2, 0, Math.PI * 2);
    ctx.fill();
    break;
  }
}

export { hitXY as hitSparkline };
