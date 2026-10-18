import { withAlpha } from "../core/color";
import { buildPath, hitXY } from "./line";
import type { RenderContext } from "./registry";
import { isXY } from "./registry";

export function renderSparkline(r: RenderContext): void {
  if (!isXY(r.data)) return;
  const d = r.data;
  const ctx = r.ctx;
  const s = d.series[0];
  if (!s || d.sortedX.length === 0) return;
  const { path, firstX, lastX, lastY } = buildPath(r, s);
  const area = new Path2D(path);
  const base = r.plot.y + r.plot.h;
  area.lineTo(lastX, base);
  area.lineTo(firstX, base);
  area.closePath();
  ctx.fillStyle = withAlpha(s.color, 0.1);
  ctx.fill(area);
  ctx.strokeStyle = s.color;
  ctx.lineWidth = 1.5;
  ctx.lineJoin = "round";
  ctx.lineCap = "round";
  ctx.stroke(path);
  ctx.fillStyle = s.color;
  ctx.beginPath();
  ctx.arc(lastX, lastY, 2, 0, Math.PI * 2);
  ctx.fill();
}

export { hitXY as hitSparkline };
