import type { HoverInfo, NormalizedCategory, Rect } from "../core/types";
import type { RenderContext } from "./registry";
import { axisBase, visibleSeries } from "./registry";

export const MAX_BAR_W = 40;
export const GAP_RATIO = 0.2;
export const RADIUS = 3;

export function barGeometry(
  r: RenderContext,
  d: NormalizedCategory,
  catIdx: number,
  ordinal: number,
  count: number,
  value: number,
): Rect | null {
  const cats = d.categories.length;
  if (cats === 0 || count === 0) return null;
  const slot = r.plot.w / cats;
  const groupW = Math.min(slot * (1 - GAP_RATIO), MAX_BAR_W * count);
  const barW = groupW / count;
  const slotX = r.plot.x + slot * catIdx + (slot - groupW) / 2;
  const x = slotX + barW * ordinal;
  const base = axisBase(r);
  const yv = r.yScale(value);
  if (!Number.isFinite(yv)) return null;
  const y = Math.min(base, yv);
  const h = Math.abs(base - yv);
  return { x, y, w: barW, h };
}

export function topRounded(
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
  if (!Number.isFinite(yTop) || !Number.isFinite(yBot)) return null;
  return { x, y: yTop, w, h: Math.abs(yBot - yTop) };
}

/** animated category value; NaN = missing datum */
function catValue(
  s: { values: Float64Array; prevValues: Float64Array | null },
  ci: number,
  t: number,
): number {
  const cur = s.values[ci] as number;
  if (!Number.isFinite(cur)) return NaN;
  if (t >= 1) return cur;
  const pv = s.prevValues?.[ci] as number;
  const prev = Number.isFinite(pv) ? pv : 0;
  return prev + (cur - prev) * t;
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
  const vis = visibleSeries(d.series.length, r.hidden);
  if (r.opts.stacked) {
    const w = Math.min(slot * (1 - GAP_RATIO), MAX_BAR_W);
    for (let ci = 0; ci < cats; ci++) {
      const x = r.plot.x + slot * ci + (slot - w) / 2;
      let pos = 0;
      let neg = 0;
      for (const si of vis) {
        const s = d.series[si];
        if (!s) continue;
        const v = catValue(s, ci, r.t);
        if (!Number.isFinite(v)) continue;
        const v0 = v >= 0 ? pos : neg + v;
        const v1 = v >= 0 ? pos + v : neg;
        if (v >= 0) pos = v1;
        else neg = v0;
        const yTop = r.yScale(Math.max(v0, v1));
        const h = Math.abs(r.yScale(Math.min(v0, v1)) - yTop);
        if (h <= 0 || !Number.isFinite(h)) continue;
        ctx.fillStyle = s.color;
        ctx.fillRect(x, yTop, w, h);
      }
    }
  } else {
    const groupW = Math.min(
      slot * (1 - GAP_RATIO),
      MAX_BAR_W * Math.max(1, vis.length),
    );
    const barW = groupW / Math.max(1, vis.length);
    const base = axisBase(r);
    for (let oi = 0; oi < vis.length; oi++) {
      const s = d.series[vis[oi] as number];
      if (!s) continue;
      ctx.fillStyle = s.color;
      for (let ci = 0; ci < cats; ci++) {
        const v = catValue(s, ci, r.t);
        if (!Number.isFinite(v)) continue;
        const x = r.plot.x + slot * ci + (slot - groupW) / 2 + barW * oi;
        const yv = r.yScale(v);
        if (!Number.isFinite(yv)) continue;
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
  const vis = visibleSeries(d.series.length, r.hidden);
  if (r.opts.stacked) {
    let pos = 0;
    let neg = 0;
    for (const si of vis) {
      const s = d.series[si];
      if (!s) continue;
      const v = s.values[cat] as number;
      if (!Number.isFinite(v)) continue;
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
    const last = vis[vis.length - 1];
    const s0 = last != null ? d.series[last] : null;
    if (!s0) return null;
    const rect = stackedGeometry(r, d, cat, 0, pos);
    if (!rect) return null;
    const v = s0.values[cat] as number;
    return {
      kind: "bar",
      category: d.categories[cat] ?? "",
      seriesIndex: last as number,
      label: s0.label,
      color: s0.color,
      value: Number.isFinite(v) ? v : 0,
      px: rect.x + rect.w / 2,
      py: rect.y,
      rect,
    };
  }
  for (let oi = 0; oi < vis.length; oi++) {
    const si = vis[oi] as number;
    const s = d.series[si];
    if (!s) continue;
    const rect = barGeometry(r, d, cat, oi, vis.length, s.values[cat] ?? NaN);
    if (rect && px >= rect.x && px <= rect.x + rect.w) {
      const inside = py >= rect.y && py <= rect.y + rect.h;
      const v = s.values[cat] as number;
      return {
        kind: "bar",
        category: d.categories[cat] ?? "",
        seriesIndex: si,
        label: s.label,
        color: s.color,
        value: Number.isFinite(v) ? v : 0,
        px: rect.x + rect.w / 2,
        py: inside ? py : rect.y,
        rect,
      };
    }
  }
  const first = vis[0];
  const s = first != null ? d.series[first] : null;
  const rect =
    s && first != null
      ? barGeometry(r, d, cat, 0, vis.length, s.values[cat] ?? NaN)
      : null;
  if (!s || !rect || first == null) return null;
  const v = s.values[cat] as number;
  return {
    kind: "bar",
    category: d.categories[cat] ?? "",
    seriesIndex: first,
    label: s.label,
    color: s.color,
    value: Number.isFinite(v) ? v : 0,
    px: r.plot.x + (r.plot.w / cats) * (cat + 0.5),
    py: rect.y,
    rect,
  };
}
