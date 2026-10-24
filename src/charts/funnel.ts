import { formatSI } from "../core/format";
import { seriesColor } from "../core/theme";
import type { HoverInfo, NormalizedCategory, Rect } from "../core/types";
import type { RenderContext } from "./registry";

const ROW_GAP = 2;
const LABEL_MIN_W = 72;

interface Stage {
  cat: string;
  value: number;
  top: number;
  bot: number;
  w0: number;
  w1: number;
  color: string;
}

/**
 * Funnel: one stage per `categories` entry using the first series' values.
 * Each stage is a trapezoid whose bottom edge matches the next stage's top
 * width — the classic funnel silhouette.
 */
function stages(r: RenderContext, d: NormalizedCategory, t: number): Stage[] {
  const s = d.series[0];
  if (!s || r.hidden.has(0)) return [];
  const n = d.categories.length;
  let max = 0;
  for (let i = 0; i < s.values.length; i++) {
    const v = s.values[i] as number;
    if (v > max) max = v;
  }
  max ||= 1;
  const rowH = r.plot.h / Math.max(1, n);
  const out: Stage[] = [];
  for (let i = 0; i < n; i++) {
    const cur = s.values[i] as number;
    if (!Number.isFinite(cur)) continue;
    const pv = s.prevValues?.[i] as number;
    const prev = Number.isFinite(pv) ? pv : 0;
    const v = t < 1 ? prev + (cur - prev) * t : cur;
    const cur1 = (s.values[i + 1] as number) ?? cur;
    const pv1 = s.prevValues?.[i + 1] as number;
    const prev1 = Number.isFinite(pv1) ? pv1 : 0;
    const c1 = Number.isFinite(cur1) ? cur1 : cur;
    const v1 = i + 1 < n ? (t < 1 ? prev1 + (c1 - prev1) * t : c1) : v;
    out.push({
      cat: d.categories[i] ?? "",
      value: cur,
      top: r.plot.y + rowH * i,
      bot: r.plot.y + rowH * (i + 1) - ROW_GAP,
      w0: (Math.max(0, v) / max) * r.plot.w,
      w1: (Math.max(0, v1) / max) * r.plot.w,
      color: seriesColor(r.theme, i, undefined),
    });
  }
  return out;
}

function stageRect(r: RenderContext, st: Stage): Rect {
  const cx = r.plot.x + r.plot.w / 2;
  const w = Math.max(st.w0, st.w1);
  return { x: cx - w / 2, y: st.top, w, h: st.bot - st.top };
}

export function renderFunnel(r: RenderContext): void {
  if (r.data.kind !== "category") return;
  const d = r.data;
  const ctx = r.ctx;
  const cx = r.plot.x + r.plot.w / 2;
  for (const st of stages(r, d, r.t)) {
    ctx.beginPath();
    ctx.moveTo(cx - st.w0 / 2, st.top);
    ctx.lineTo(cx + st.w0 / 2, st.top);
    ctx.lineTo(cx + st.w1 / 2, st.bot);
    ctx.lineTo(cx - st.w1 / 2, st.bot);
    ctx.closePath();
    ctx.fillStyle = st.color;
    ctx.fill();
    const label = `${st.cat} · ${formatSI(st.value)}`;
    ctx.font = `11px ${r.theme.fontFamily}`;
    ctx.textBaseline = "middle";
    if (Math.min(st.w0, st.w1) >= LABEL_MIN_W) {
      ctx.fillStyle = "#ffffff";
      ctx.textAlign = "center";
      ctx.fillText(label, cx, (st.top + st.bot) / 2);
    } else {
      ctx.fillStyle = r.theme.textMuted;
      ctx.textAlign = "left";
      ctx.fillText(
        label,
        cx + Math.max(st.w0, st.w1) / 2 + 8,
        (st.top + st.bot) / 2,
      );
    }
  }
}

export function hitFunnel(
  r: RenderContext,
  px: number,
  py: number,
): HoverInfo | null {
  if (r.data.kind !== "category") return null;
  const d = r.data;
  const s = d.series[0];
  if (!s) return null;
  const cx = r.plot.x + r.plot.w / 2;
  for (const st of stages(r, d, 1)) {
    if (py < st.top || py > st.bot) continue;
    const frac = st.bot - st.top > 0 ? (py - st.top) / (st.bot - st.top) : 0;
    const w = st.w0 + (st.w1 - st.w0) * frac;
    if (Math.abs(px - cx) > w / 2 + 4) continue;
    return {
      kind: "bar",
      category: st.cat,
      seriesIndex: 0,
      label: s.label,
      color: st.color,
      value: st.value,
      px: cx,
      py,
      rect: stageRect(r, st),
    };
  }
  return null;
}
