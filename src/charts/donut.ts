import { formatSI } from "../core/format";
import type { HoverInfo, NormalizedDonut } from "../core/types";
import type { RenderContext } from "./registry";

const INNER = 0.65;
const GAP = 0.015;
const START = -Math.PI / 2;

/** donut keeps a center hole; pie fills to the middle */
const innerRatio = (r: RenderContext): number =>
  r.opts.type === "pie" ? 0 : INNER;

export interface DonutGeo {
  cx: number;
  cy: number;
  rOuter: number;
  rInner: number;
  angles: { a0: number; a1: number }[];
}

export function donutGeometry(
  r: RenderContext,
  d: NormalizedDonut,
  t: number,
): DonutGeo {
  const cx = r.plot.x + r.plot.w / 2;
  const cy = r.plot.y + r.plot.h / 2;
  const rOuter = Math.max(1, Math.min(r.plot.w, r.plot.h) / 2);
  const rInner = rOuter * innerRatio(r);
  const angles: { a0: number; a1: number }[] = [];
  let a = START;
  const sweep = Math.PI * 2 * Math.min(1, Math.max(0, t));
  for (const s of d.slices) {
    const frac = d.total > 0 ? s.value / d.total : 0;
    const a1 = a + frac * sweep;
    angles.push({ a0: a, a1 });
    a = a + frac * Math.PI * 2;
  }
  return { cx, cy, rOuter, rInner, angles };
}

export function renderDonut(r: RenderContext): void {
  if (r.data.kind !== "donut") return;
  const d = r.data;
  const ctx = r.ctx;
  const geo = donutGeometry(r, d, r.t);
  for (let i = 0; i < d.slices.length; i++) {
    const s = d.slices[i];
    const an = geo.angles[i];
    if (!s || !an || an.a1 - an.a0 <= 0) continue;
    const a0 = an.a0 + GAP / 2;
    const a1 = an.a1 - GAP / 2;
    if (a1 <= a0) continue;
    ctx.beginPath();
    ctx.arc(geo.cx, geo.cy, geo.rOuter, a0, a1);
    if (geo.rInner > 0) {
      ctx.arc(geo.cx, geo.cy, geo.rInner, a1, a0, true);
    } else {
      // pie wedge: route through the center so closePath doesn't cut a chord
      ctx.lineTo(geo.cx, geo.cy);
    }
    ctx.closePath();
    ctx.fillStyle = s.color;
    ctx.fill();
  }
  if (r.opts.type !== "pie" && d.slices.length > 0 && r.t > 0.5) {
    ctx.fillStyle = r.theme.text;
    ctx.font = `600 20px ${r.theme.fontFamily}`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(formatSI(d.total), geo.cx, geo.cy);
  }
}

export function hitDonut(
  r: RenderContext,
  px: number,
  py: number,
): HoverInfo | null {
  if (r.data.kind !== "donut") return null;
  const d = r.data;
  const geo = donutGeometry(r, d, 1);
  const dx = px - geo.cx;
  const dy = py - geo.cy;
  const dist = Math.hypot(dx, dy);
  if (dist < geo.rInner || dist > geo.rOuter) return null;
  let angle = Math.atan2(dy, dx);
  while (angle < START) angle += Math.PI * 2;
  while (angle >= START + Math.PI * 2) angle -= Math.PI * 2;
  for (let i = 0; i < geo.angles.length; i++) {
    const an = geo.angles[i];
    const s = d.slices[i];
    if (!an || !s) continue;
    if (angle >= an.a0 && angle < an.a1) {
      return {
        kind: "slice",
        index: i,
        label: s.label,
        color: s.color,
        value: s.value,
        share: d.total > 0 ? s.value / d.total : 0,
        px,
        py,
      };
    }
  }
  return null;
}
