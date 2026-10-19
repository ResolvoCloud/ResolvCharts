import { withAlpha } from "../core/color";
import type { HoverInfo, NormalizedCategory } from "../core/types";
import type { RenderContext } from "./registry";

const RINGS = 4;
const LABEL_PAD = 16;
const MIN_AXES = 3;
const START = -Math.PI / 2;

export interface RadarGeo {
  cx: number;
  cy: number;
  radius: number;
  max: number;
}

export function radarGeo(r: RenderContext, d: NormalizedCategory): RadarGeo {
  const cx = r.plot.x + r.plot.w / 2;
  const cy = r.plot.y + r.plot.h / 2;
  const radius = Math.max(1, Math.min(r.plot.w, r.plot.h) / 2 - LABEL_PAD);
  let max = 0;
  for (const s of d.series) {
    for (let i = 0; i < s.values.length; i++) {
      const v = s.values[i] as number;
      if (v > max) max = v;
    }
  }
  return { cx, cy, radius, max: max || 1 };
}

const angleOf = (i: number, n: number): number => START + (i / n) * Math.PI * 2;

export function renderRadar(r: RenderContext): void {
  if (r.data.kind !== "category") return;
  const d = r.data;
  const n = d.categories.length;
  if (n < MIN_AXES) return;
  const ctx = r.ctx;
  const { cx, cy, radius, max } = radarGeo(r, d);
  const animate = r.t < 1;

  ctx.strokeStyle = r.theme.grid;
  ctx.lineWidth = 1;
  for (let ring = 1; ring <= RINGS; ring++) {
    const rr = (radius * ring) / RINGS;
    ctx.beginPath();
    for (let i = 0; i <= n; i++) {
      const a = angleOf(i % n, n);
      const x = cx + Math.cos(a) * rr;
      const y = cy + Math.sin(a) * rr;
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.stroke();
  }
  ctx.beginPath();
  for (let i = 0; i < n; i++) {
    const a = angleOf(i, n);
    ctx.moveTo(cx, cy);
    ctx.lineTo(cx + Math.cos(a) * radius, cy + Math.sin(a) * radius);
  }
  ctx.stroke();

  for (const s of d.series) {
    ctx.beginPath();
    for (let i = 0; i < n; i++) {
      const cur = s.values[i] ?? 0;
      const prev = s.prevValues?.[i] ?? 0;
      const v = animate ? prev + (cur - prev) * r.t : cur;
      const rr = (Math.max(0, v) / max) * radius;
      const a = angleOf(i, n);
      const x = cx + Math.cos(a) * rr;
      const y = cy + Math.sin(a) * rr;
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.closePath();
    ctx.fillStyle = withAlpha(s.color, 0.16);
    ctx.fill();
    ctx.strokeStyle = s.color;
    ctx.lineWidth = 2;
    ctx.lineJoin = "round";
    ctx.stroke();
    ctx.fillStyle = s.color;
    ctx.beginPath();
    for (let i = 0; i < n; i++) {
      const cur = s.values[i] ?? 0;
      const prev = s.prevValues?.[i] ?? 0;
      const v = animate ? prev + (cur - prev) * r.t : cur;
      const rr = (Math.max(0, v) / max) * radius;
      const a = angleOf(i, n);
      const x = cx + Math.cos(a) * rr;
      const y = cy + Math.sin(a) * rr;
      ctx.moveTo(x + 2.5, y);
      ctx.arc(x, y, 2.5, 0, Math.PI * 2);
    }
    ctx.fill();
  }

  ctx.fillStyle = r.theme.textMuted;
  ctx.font = `11px ${r.theme.fontFamily}`;
  for (let i = 0; i < n; i++) {
    const a = angleOf(i, n);
    const lx = cx + Math.cos(a) * (radius + LABEL_PAD - 4);
    const ly = cy + Math.sin(a) * (radius + LABEL_PAD - 4);
    ctx.textAlign =
      Math.cos(a) > 0.3 ? "left" : Math.cos(a) < -0.3 ? "right" : "center";
    ctx.textBaseline =
      Math.sin(a) > 0.3 ? "top" : Math.sin(a) < -0.3 ? "bottom" : "middle";
    ctx.fillText(d.categories[i] ?? "", lx, ly);
  }
}

export function hitRadar(
  r: RenderContext,
  px: number,
  py: number,
): HoverInfo | null {
  if (r.data.kind !== "category") return null;
  const d = r.data;
  const n = d.categories.length;
  if (n < MIN_AXES) return null;
  const { cx, cy, radius } = radarGeo(r, d);
  const dx = px - cx;
  const dy = py - cy;
  if (Math.hypot(dx, dy) > radius + LABEL_PAD) return null;
  let rel = Math.atan2(dy, dx) - START;
  while (rel < 0) rel += Math.PI * 2;
  while (rel >= Math.PI * 2) rel -= Math.PI * 2;
  const i = Math.round((rel / (Math.PI * 2)) * n) % n;
  const values = d.series.map((s) => ({
    label: s.label,
    color: s.color,
    y: s.values[i] ?? 0,
  }));
  return {
    kind: "point",
    index: i,
    x: i,
    px,
    py,
    values,
    title: d.categories[i] ?? "",
  };
}

/** Hover accent: highlighted spoke + vertex dots (replaces the xy crosshair). */
export function drawRadarHover(r: RenderContext, info: HoverInfo): void {
  if (r.data.kind !== "category" || info.kind !== "point") return;
  const d = r.data;
  const n = d.categories.length;
  if (info.index < 0 || info.index >= n) return;
  const o = r.backend.overlay;
  const { cx, cy, radius, max } = radarGeo(r, d);
  const a = angleOf(info.index, n);
  o.strokeStyle = r.theme.crosshair;
  o.lineWidth = 1;
  o.beginPath();
  o.moveTo(cx, cy);
  o.lineTo(cx + Math.cos(a) * radius, cy + Math.sin(a) * radius);
  o.stroke();
  for (const s of d.series) {
    const v = s.values[info.index] ?? 0;
    const rr = (Math.max(0, v) / max) * radius;
    o.fillStyle = s.color;
    o.strokeStyle = r.theme.bg;
    o.lineWidth = 2;
    o.beginPath();
    o.arc(cx + Math.cos(a) * rr, cy + Math.sin(a) * rr, 4, 0, Math.PI * 2);
    o.fill();
    o.stroke();
  }
}
