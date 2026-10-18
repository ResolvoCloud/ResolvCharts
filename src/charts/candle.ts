import { withAlpha } from "../core/color";
import { nearestIndex } from "../core/hit";
import type { HoverInfo } from "../core/types";
import type { RenderContext } from "./registry";

export function renderCandles(r: RenderContext, ohlcStyle: boolean): void {
  if (r.data.kind !== "ohlc") return;
  const d = r.data;
  const ctx = r.ctx;
  const n = d.x.length;
  if (n === 0) return;

  ctx.save();
  ctx.beginPath();
  ctx.rect(r.plot.x, r.plot.y, r.plot.w, r.plot.h);
  ctx.clip();
  ctx.globalAlpha = r.t >= 1 ? 1 : r.t;

  // inline scale math: ~3x faster than closure calls at candle scale
  const xd = r.xScale.domain;
  const xr = r.xScale.range;
  const kx = (xr[1] - xr[0]) / (xd[1] - xd[0] || 1);
  const bx = xr[0] - xd[0] * kx;
  const yd = r.yScale.domain;
  const yr = r.yScale.range;
  const ky = (yr[1] - yr[0]) / (yd[1] - yd[0] || 1);
  const by = yr[0] - yd[0] * ky;

  const wickUp = new Path2D();
  const wickDown = new Path2D();
  const bodyUp = new Path2D();
  const bodyDown = new Path2D();
  const volUp = new Path2D();
  const volDown = new Path2D();
  const bandH = d.volume ? r.plot.h * 0.18 : 0;
  const bandBot = r.plot.y + r.plot.h;
  const vol = d.volume;

  if (n <= r.plot.w) {
    // sparse: one mark per candle, exact rendering
    const bodyW = Math.min((r.plot.w / n) * 0.6, 14);
    const half = bodyW / 2;
    let vmax = 0;
    if (vol) {
      for (let i = 0; i < n; i++) {
        const v = vol[i] as number;
        if (v > vmax) vmax = v;
      }
    }
    const vk = vmax > 0 ? bandH / vmax : 0;
    for (let i = 0; i < n; i++) {
      const up = (d.close[i] as number) >= (d.open[i] as number);
      const cx = bx + (d.x[i] as number) * kx;
      const hi = by + (d.high[i] as number) * ky;
      const lo = by + (d.low[i] as number) * ky;
      const wick = up ? wickUp : wickDown;
      wick.moveTo(cx, hi);
      wick.lineTo(cx, lo);
      if (ohlcStyle) {
        const op = by + (d.open[i] as number) * ky;
        const cl = by + (d.close[i] as number) * ky;
        wick.moveTo(cx - half, op);
        wick.lineTo(cx, op);
        wick.moveTo(cx, cl);
        wick.lineTo(cx + half, cl);
      } else {
        const op = by + (d.open[i] as number) * ky;
        const cl = by + (d.close[i] as number) * ky;
        const body = up ? bodyUp : bodyDown;
        body.rect(
          cx - half,
          Math.min(op, cl),
          bodyW,
          Math.max(1, Math.abs(cl - op)),
        );
      }
      if (vol) {
        const v = vol[i] as number;
        if (v > 0) {
          const h = v * vk;
          (up ? volUp : volDown).rect(cx - half, bandBot - h, bodyW, h);
        }
      }
    }
  } else {
    // dense: aggregate candles per integer pixel column — same output as
    // trading terminals; bounds mark count to ~plot width
    const maxCols = Math.min(n, Math.ceil(r.plot.w) + 1);
    const cxA = new Float64Array(maxCols);
    const oA = new Float64Array(maxCols);
    const hA = new Float64Array(maxCols);
    const lA = new Float64Array(maxCols);
    const cA = new Float64Array(maxCols);
    const vA = new Float64Array(maxCols);
    let nc = 0;
    let prevCol = -1;
    for (let i = 0; i < n; i++) {
      const c = Math.floor(bx + (d.x[i] as number) * kx);
      if (c !== prevCol) {
        prevCol = c;
        const k = nc++;
        cxA[k] = c + 0.5;
        oA[k] = d.open[i] as number;
        hA[k] = d.high[i] as number;
        lA[k] = d.low[i] as number;
        cA[k] = d.close[i] as number;
        vA[k] = vol ? (vol[i] as number) : 0;
      } else {
        const k = nc - 1;
        const hi = d.high[i] as number;
        const lo = d.low[i] as number;
        if (hi > (hA[k] as number)) hA[k] = hi;
        if (lo < (lA[k] as number)) lA[k] = lo;
        cA[k] = d.close[i] as number;
        if (vol) vA[k] = (vA[k] as number) + (vol[i] as number);
      }
    }
    const pitch = r.plot.w / nc;
    const bodyW = Math.max(0.5, Math.min(pitch * 0.6, 14));
    const half = bodyW / 2;
    let vmax = 0;
    if (vol) {
      for (let k = 0; k < nc; k++) {
        if ((vA[k] as number) > vmax) vmax = vA[k] as number;
      }
    }
    const vk = vmax > 0 ? bandH / vmax : 0;
    for (let k = 0; k < nc; k++) {
      const cx = cxA[k] as number;
      const up = (cA[k] as number) >= (oA[k] as number);
      const wick = up ? wickUp : wickDown;
      wick.moveTo(cx, by + (hA[k] as number) * ky);
      wick.lineTo(cx, by + (lA[k] as number) * ky);
      if (ohlcStyle) {
        const op = by + (oA[k] as number) * ky;
        const cl = by + (cA[k] as number) * ky;
        wick.moveTo(cx - half, op);
        wick.lineTo(cx, op);
        wick.moveTo(cx, cl);
        wick.lineTo(cx + half, cl);
      } else {
        const op = by + (oA[k] as number) * ky;
        const cl = by + (cA[k] as number) * ky;
        (up ? bodyUp : bodyDown).rect(
          cx - half,
          Math.min(op, cl),
          bodyW,
          Math.max(1, Math.abs(cl - op)),
        );
      }
      if (vol) {
        const v = vA[k] as number;
        if (v > 0) {
          const h = v * vk;
          (up ? volUp : volDown).rect(cx - half, bandBot - h, bodyW, h);
        }
      }
    }
  }

  // wicks first so bodies draw on top
  ctx.lineWidth = 1;
  ctx.strokeStyle = r.theme.up;
  ctx.stroke(wickUp);
  ctx.strokeStyle = r.theme.down;
  ctx.stroke(wickDown);
  if (!ohlcStyle) {
    ctx.fillStyle = r.theme.up;
    ctx.fill(bodyUp);
    ctx.fillStyle = r.theme.down;
    ctx.fill(bodyDown);
  }
  if (vol) {
    ctx.fillStyle = withAlpha(r.theme.up, 0.35);
    ctx.fill(volUp);
    ctx.fillStyle = withAlpha(r.theme.down, 0.35);
    ctx.fill(volDown);
  }
  ctx.restore();
}

export function hitCandle(r: RenderContext, px: number): HoverInfo | null {
  if (r.data.kind !== "ohlc") return null;
  const d = r.data;
  const idx = nearestIndex(d.x, r.xScale.invert(px));
  if (idx < 0) return null;
  return {
    kind: "candle",
    index: idx,
    x: d.x[idx] as number,
    open: d.open[idx] as number,
    high: d.high[idx] as number,
    low: d.low[idx] as number,
    close: d.close[idx] as number,
    px: r.xScale(d.x[idx] as number),
    py: r.yScale(d.close[idx] as number),
  };
}
