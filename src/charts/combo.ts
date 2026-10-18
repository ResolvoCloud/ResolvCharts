import { withAlpha } from "../core/color";
import type { HoverInfo, NormalizedCategory } from "../core/types";
import { GAP_RATIO, MAX_BAR_W, RADIUS, topRounded } from "./bar";
import type { RenderContext } from "./registry";
import { smoothPath } from "./registry";

type CatSeries = NormalizedCategory["series"][number];

/** pooled scratch for overlay [x, y] pairs — consumed within the call */
let ovScratch = new Float64Array(0);

function overlayPath(r: RenderContext, pts: Float64Array, n: number): Path2D {
  const path = new Path2D();
  if (n === 0) return path;
  const curve = r.opts.curve ?? "linear";
  if (curve === "step") {
    path.moveTo(pts[0] as number, pts[1] as number);
    for (let i = 1; i < n; i++) {
      const x = pts[2 * i] as number;
      path.lineTo(x, pts[2 * i - 1] as number);
      path.lineTo(x, pts[2 * i + 1] as number);
    }
  } else if (curve === "smooth") {
    smoothPath(path, pts, n);
  } else {
    path.moveTo(pts[0] as number, pts[1] as number);
    for (let i = 1; i < n; i++) {
      path.lineTo(pts[2 * i] as number, pts[2 * i + 1] as number);
    }
  }
  return path;
}

export function renderCombo(r: RenderContext): void {
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
  const valAt = (s: CatSeries, ci: number): number => {
    const cur = s.values[ci] ?? 0;
    const prev = s.prevValues?.[ci] ?? 0;
    return animate ? prev + (cur - prev) * r.t : cur;
  };

  let nCols = 0;
  for (const s of d.series) if (s.kind === "column") nCols++;
  if (r.opts.stacked) {
    const w = Math.min(slot * (1 - GAP_RATIO), MAX_BAR_W);
    for (let ci = 0; ci < cats; ci++) {
      const x = r.plot.x + slot * ci + (slot - w) / 2;
      let pos = 0;
      let neg = 0;
      for (const s of d.series) {
        if (s.kind !== "column") continue;
        const v = valAt(s, ci);
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
    const groupW = Math.min(slot * (1 - GAP_RATIO), MAX_BAR_W * nCols);
    const barW = groupW / Math.max(1, nCols);
    const base = r.yScale(0);
    let k = 0;
    for (const s of d.series) {
      if (s.kind !== "column") continue;
      ctx.fillStyle = s.color;
      for (let ci = 0; ci < cats; ci++) {
        const v = valAt(s, ci);
        const x = r.plot.x + slot * ci + (slot - groupW) / 2 + barW * k;
        const yv = r.yScale(v);
        const y = Math.min(base, yv);
        const h = Math.abs(base - yv);
        if (h <= 0) continue;
        topRounded(ctx, { x, y, w: barW, h }, RADIUS, v >= 0);
      }
      k++;
    }
  }

  // overlays ride on category centers
  const base = r.yScale(Math.max(0, r.yScale.domain[0]));
  if (ovScratch.length < cats * 2) ovScratch = new Float64Array(cats * 2);
  const pts = ovScratch;
  for (const s of d.series) {
    if (s.kind === "column") continue;
    for (let ci = 0; ci < cats; ci++) {
      pts[2 * ci] = r.plot.x + slot * (ci + 0.5);
      pts[2 * ci + 1] = r.yScale(valAt(s, ci));
    }
    const path = overlayPath(r, pts, cats);
    if (s.kind === "area" && cats > 1) {
      const area = new Path2D(path);
      area.lineTo(pts[2 * (cats - 1)] as number, base);
      area.lineTo(pts[0] as number, base);
      area.closePath();
      const g = ctx.createLinearGradient(0, r.plot.y, 0, r.plot.y + r.plot.h);
      g.addColorStop(0, withAlpha(s.color, 0.16));
      g.addColorStop(1, withAlpha(s.color, 0));
      ctx.fillStyle = g;
      ctx.fill(area);
    }
    ctx.strokeStyle = s.color;
    ctx.lineWidth = 2;
    ctx.lineJoin = "round";
    ctx.lineCap = "round";
    ctx.stroke(path);
  }
  ctx.restore();
}

export function hitCombo(r: RenderContext, px: number): HoverInfo | null {
  if (r.data.kind !== "category") return null;
  const d = r.data;
  const cats = d.categories.length;
  if (cats === 0 || px < r.plot.x || px > r.plot.x + r.plot.w) return null;
  const cat = Math.min(
    cats - 1,
    Math.max(0, Math.floor(((px - r.plot.x) / r.plot.w) * cats)),
  );
  const slot = r.plot.w / cats;
  let py = r.plot.y + r.plot.h;
  const values = d.series.map((s) => {
    const y = s.values[cat] ?? 0;
    const sy = r.yScale(y);
    if (sy < py) py = sy;
    return { label: s.label, color: s.color, y };
  });
  return {
    kind: "point",
    index: cat,
    x: cat,
    px: r.plot.x + slot * (cat + 0.5),
    py,
    values,
    title: d.categories[cat] ?? "",
  };
}
