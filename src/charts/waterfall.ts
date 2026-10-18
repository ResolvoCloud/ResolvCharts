import type { HoverInfo, NormalizedWaterfall, Rect } from "../core/types";
import type { RenderContext } from "./registry";

const MAX_BAR_W = 48;
const GAP_RATIO = 0.25;
const RADIUS = 2;

function barRect(
  r: RenderContext,
  d: NormalizedWaterfall,
  i: number,
  end: number,
): Rect | null {
  const bar = d.bars[i];
  if (!bar) return null;
  const cats = d.bars.length;
  const slot = r.plot.w / Math.max(1, cats);
  const w = Math.min(slot * (1 - GAP_RATIO), MAX_BAR_W);
  const x = r.plot.x + slot * i + (slot - w) / 2;
  const yTop = r.yScale(Math.max(bar.start, end));
  const yBot = r.yScale(Math.min(bar.start, end));
  return { x, y: yTop, w, h: Math.abs(yBot - yTop) };
}

function barColor(
  r: RenderContext,
  bar: { value: number; total: boolean },
): string {
  if (bar.total) return r.theme.series[0] ?? r.theme.contextGray;
  return bar.value >= 0 ? r.theme.up : r.theme.down;
}

export function renderWaterfall(r: RenderContext): void {
  if (r.data.kind !== "waterfall") return;
  const d = r.data;
  const ctx = r.ctx;
  const n = d.bars.length;
  const slot = r.plot.w / Math.max(1, n);

  ctx.save();
  ctx.beginPath();
  ctx.rect(r.plot.x, r.plot.y, r.plot.w, r.plot.h + 1);
  ctx.clip();

  // dashed connectors from each bar's end to the next bar's edge
  const barW = Math.min(slot * (1 - GAP_RATIO), MAX_BAR_W);
  ctx.strokeStyle = r.theme.crosshair;
  ctx.lineWidth = 1;
  ctx.setLineDash([3, 3]);
  ctx.beginPath();
  for (let i = 1; i < n; i++) {
    const prev = d.bars[i - 1];
    if (!prev) continue;
    const y = r.yScale(prev.end);
    ctx.moveTo(r.plot.x + slot * (i - 1) + (slot + barW) / 2, y);
    ctx.lineTo(r.plot.x + slot * i + (slot - barW) / 2, y);
  }
  ctx.stroke();
  ctx.setLineDash([]);

  for (let i = 0; i < n; i++) {
    const bar = d.bars[i];
    if (!bar) continue;
    const end = bar.total
      ? bar.end * r.t
      : bar.start + (bar.end - bar.start) * r.t;
    const rect = barRect(r, d, i, end);
    if (!rect) continue;
    ctx.fillStyle = barColor(r, bar);
    const rad = Math.min(RADIUS, rect.h / 2, rect.w / 2);
    ctx.beginPath();
    if (rect.h <= 0) {
      ctx.rect(rect.x, rect.y - 0.5, rect.w, 1);
    } else {
      ctx.roundRect(rect.x, rect.y, rect.w, rect.h, rad);
    }
    ctx.fill();
  }
  ctx.restore();
}

export function hitWaterfall(
  r: RenderContext,
  px: number,
  _py: number,
): HoverInfo | null {
  if (r.data.kind !== "waterfall") return null;
  const d = r.data;
  const n = d.bars.length;
  if (n === 0 || px < r.plot.x || px > r.plot.x + r.plot.w) return null;
  const i = Math.min(
    n - 1,
    Math.max(0, Math.floor(((px - r.plot.x) / r.plot.w) * n)),
  );
  const bar = d.bars[i];
  if (!bar) return null;
  const rect = barRect(r, d, i, bar.end);
  if (!rect) return null;
  return {
    kind: "bar",
    category: d.categories[i] ?? "",
    seriesIndex: 0,
    label: bar.total ? "Total" : "Δ",
    color: barColor(r, bar),
    value: bar.value,
    px: rect.x + rect.w / 2,
    py: rect.y,
    rect,
  };
}
