import type { HoverInfo, NormalizedCategory, Rect } from "../core/types";
import type { RenderContext } from "./registry";

const MAX_BAR_W = 40;
const GAP_RATIO = 0.2;
const RADIUS = 3;

export function barGeometry(
  r: RenderContext,
  d: NormalizedCategory,
  catIdx: number,
  seriesIdx: number,
  value: number,
): Rect | null {
  const cats = d.categories.length;
  if (cats === 0) return null;
  const slot = r.plot.w / cats;
  const groupW = Math.min(slot * (1 - GAP_RATIO), MAX_BAR_W * d.series.length);
  const barW = groupW / d.series.length;
  const slotX = r.plot.x + slot * catIdx + (slot - groupW) / 2;
  const x = slotX + barW * seriesIdx;
  const base = r.yScale(0);
  const yv = r.yScale(value);
  const y = Math.min(base, yv);
  const h = Math.abs(base - yv);
  return { x, y, w: barW, h };
}

function topRounded(
  ctx: CanvasRenderingContext2D,
  rect: Rect,
  rad: number,
  up: boolean,
): void {
  const { x, y, w, h } = rect;
  if (h <= 0 || w <= 0) return;
  const r = Math.min(rad, h / 2, w / 2);
  ctx.beginPath();
  if (up) {
    ctx.moveTo(x, y + h);
    ctx.lineTo(x, y + r);
    ctx.arcTo(x, y, x + r, y, r);
    ctx.lineTo(x + w - r, y);
    ctx.arcTo(x + w, y, x + w, y + r, r);
    ctx.lineTo(x + w, y + h);
  } else {
    ctx.moveTo(x, y);
    ctx.lineTo(x + w, y);
    ctx.lineTo(x + w, y + h - r);
    ctx.arcTo(x + w, y + h, x + w - r, y + h, r);
    ctx.lineTo(x + r, y + h);
    ctx.arcTo(x, y + h, x, y + h - r, r);
    ctx.lineTo(x, y);
  }
  ctx.closePath();
  ctx.fill();
}

function stackedGeometry(
  r: RenderContext,
  d: NormalizedCategory,
  catIdx: number,
  v0: number,
  v1: number,
): Rect | null {
  const cats = d.categories.length;
  if (cats === 0) return null;
  const slot = r.plot.w / cats;
  const w = Math.min(slot * (1 - GAP_RATIO), MAX_BAR_W);
  const x = r.plot.x + slot * catIdx + (slot - w) / 2;
  const yTop = r.yScale(Math.max(v0, v1));
  const yBot = r.yScale(Math.min(v0, v1));
  return { x, y: yTop, w, h: Math.abs(yBot - yTop) };
}

export function renderBar(r: RenderContext): void {
  if (r.data.kind !== "category") return;
  const d = r.data;
  const ctx = r.ctx;
  ctx.save();
  ctx.beginPath();
  ctx.rect(r.plot.x, r.plot.y, r.plot.w, r.plot.h + 1);
  ctx.clip();
  const cats = d.categories.length;
  const slot = r.plot.w / Math.max(1, cats);
  const animate = r.t < 1;
  if (r.opts.stacked) {
    const w = Math.min(slot * (1 - GAP_RATIO), MAX_BAR_W);
    for (let ci = 0; ci < cats; ci++) {
      const x = r.plot.x + slot * ci + (slot - w) / 2;
      let pos = 0;
      let neg = 0;
      for (let si = 0; si < d.series.length; si++) {
        const s = d.series[si];
        if (!s) continue;
        const cur = s.values[ci] ?? 0;
        const prev = s.prevValues?.[ci] ?? 0;
        const v = animate ? prev + (cur - prev) * r.t : cur;
        const v0 = v >= 0 ? pos : neg + v;
        const v1 = v >= 0 ? pos + v : neg;
        if (v >= 0) pos = v1;
        else neg = v0;
        const yTop = r.yScale(Math.max(v0, v1));
        const h = Math.abs(r.yScale(Math.min(v0, v1)) - yTop);
        if (h <= 0) continue;
        ctx.fillStyle = s.color;
        ctx.fillRect(x, yTop, w, h);
      }
    }
  } else {
    const groupW = Math.min(
      slot * (1 - GAP_RATIO),
      MAX_BAR_W * d.series.length,
    );
    const barW = groupW / d.series.length;
    const base = r.yScale(0);
    for (let si = 0; si < d.series.length; si++) {
      const s = d.series[si];
      if (!s) continue;
      ctx.fillStyle = s.color;
      for (let ci = 0; ci < cats; ci++) {
        const cur = s.values[ci] ?? 0;
        const prev = s.prevValues?.[ci] ?? 0;
        const v = animate ? prev + (cur - prev) * r.t : cur;
        const x = r.plot.x + slot * ci + (slot - groupW) / 2 + barW * si;
        const yv = r.yScale(v);
        const y = Math.min(base, yv);
        const h = Math.abs(base - yv);
        if (h <= 0) continue;
        topRounded(ctx, { x, y, w: barW, h }, RADIUS, v >= 0);
      }
    }
  }
  ctx.restore();
}

export function hitBar(
  r: RenderContext,
  px: number,
  py: number,
): HoverInfo | null {
  if (r.data.kind !== "category") return null;
  const d = r.data;
  const cats = d.categories.length;
  if (cats === 0 || px < r.plot.x || px > r.plot.x + r.plot.w) return null;
  const cat = Math.min(
    cats - 1,
    Math.max(0, Math.floor(((px - r.plot.x) / r.plot.w) * cats)),
  );
  if (r.opts.stacked) {
    let pos = 0;
    let neg = 0;
    for (let si = 0; si < d.series.length; si++) {
      const s = d.series[si];
      if (!s) continue;
      const v = s.values[cat] ?? 0;
      const v0 = v >= 0 ? pos : neg + v;
      const v1 = v >= 0 ? pos + v : neg;
      if (v >= 0) pos = v1;
      else neg = v0;
      const rect = stackedGeometry(r, d, cat, v0, v1);
      if (
        rect &&
        px >= rect.x &&
        px <= rect.x + rect.w &&
        py >= rect.y &&
        py <= rect.y + rect.h
      ) {
        return {
          kind: "bar",
          category: d.categories[cat] ?? "",
          seriesIndex: si,
          label: s.label,
          color: s.color,
          value: v,
          px: rect.x + rect.w / 2,
          py,
          rect,
        };
      }
    }
    // hover in slot but not on a segment: report nearest top segment
    const s0 = d.series[d.series.length - 1];
    if (!s0) return null;
    const rect = stackedGeometry(r, d, cat, 0, pos);
    if (!rect) return null;
    return {
      kind: "bar",
      category: d.categories[cat] ?? "",
      seriesIndex: d.series.length - 1,
      label: s0.label,
      color: s0.color,
      value: s0.values[cat] ?? 0,
      px: rect.x + rect.w / 2,
      py: rect.y,
      rect,
    };
  }
  for (let si = 0; si < d.series.length; si++) {
    const s = d.series[si];
    if (!s) continue;
    const rect = barGeometry(r, d, cat, si, s.values[cat] ?? 0);
    if (rect && px >= rect.x && px <= rect.x + rect.w) {
      const inside = py >= rect.y && py <= rect.y + rect.h;
      return {
        kind: "bar",
        category: d.categories[cat] ?? "",
        seriesIndex: si,
        label: s.label,
        color: s.color,
        value: s.values[cat] ?? 0,
        px: rect.x + rect.w / 2,
        py: inside ? py : rect.y,
        rect,
      };
    }
  }
  const s = d.series[0];
  const rect = s ? barGeometry(r, d, cat, 0, s.values[cat] ?? 0) : null;
  if (!s || !rect) return null;
  return {
    kind: "bar",
    category: d.categories[cat] ?? "",
    seriesIndex: 0,
    label: s.label,
    color: s.color,
    value: s.values[cat] ?? 0,
    px: r.plot.x + (r.plot.w / cats) * (cat + 0.5),
    py: rect.y,
    rect,
  };
}
