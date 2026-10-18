import type { Scale } from "./types";

/**
 * Map data-space points to pixel space (with optional lerp between prev and
 * current y for animation) into interleaved [x, y] pairs.
 */
export function mapSeriesPx(
  xs: Float64Array,
  ys: Float64Array,
  prev: Float64Array | null,
  t: number,
  yFallback: number,
  xScale: Scale,
  yScale: Scale,
  flow = 0,
): Float32Array {
  const n = Math.min(xs.length, ys.length);
  const out = new Float32Array(Math.max(1, n) * 2);
  const xd = xScale.domain;
  const xr = xScale.range;
  const kx = (xr[1] - xr[0]) / (xd[1] - xd[0] || 1);
  const bx = xr[0] - xd[0] * kx;
  const yd = yScale.domain;
  const yr = yScale.range;
  const ky = (yr[1] - yr[0]) / (yd[1] - yd[0] || 1);
  const by = yr[0] - yd[0] * ky;
  const lerp = t < 1;
  // per-point progress: newest (rightmost) leads, tail lags by `flow`
  const inv = n > 1 ? flow / (n - 1) : 0;
  const f1 = 1 + flow;
  let o = 0;
  for (let i = 0; i < n; i++) {
    let yv = ys[i] as number;
    if (lerp) {
      let ti = flow > 0 ? t * f1 - flow + i * inv : t;
      if (ti < 0) ti = 0;
      else if (ti > 1) ti = 1;
      const p = prev ? (prev[i] as number) : yFallback;
      yv = p + (yv - p) * ti;
    }
    out[o] = bx + (xs[i] as number) * kx;
    out[o + 1] = by + yv * ky;
    o += 2;
  }
  return out.subarray(0, o);
}

/** pooled output for decimateSeriesPx — callers consume before the next call */
let decScratch = new Float32Array(0);

/**
 * Fused map + M4 decimation: scales data-space points to pixel space on the
 * fly (lerping y when animating), so no intermediate pixel arrays are ever
 * allocated. xs must be monotonically non-decreasing.
 *
 * Returns a subarray view of a pooled buffer — consume it before calling
 * decimateSeriesPx/mapSeriesPx again.
 */
export function decimateSeriesPx(
  xs: Float64Array,
  ys: Float64Array,
  prev: Float64Array | null,
  t: number,
  yFallback: number,
  xScale: Scale,
  yScale: Scale,
  pixelWidth: number,
  flow = 0,
): Float32Array {
  const n = Math.min(xs.length, ys.length);
  if (n === 0) return new Float32Array(0);
  const maxPts = Math.min(n, 4 * (Math.ceil(pixelWidth) + 8));
  if (decScratch.length < maxPts * 2) {
    decScratch = new Float32Array(Math.max(1, maxPts) * 2);
  }
  const out = decScratch;

  const xd = xScale.domain;
  const xr = xScale.range;
  const kx = (xr[1] - xr[0]) / (xd[1] - xd[0] || 1);
  const bx = xr[0] - xd[0] * kx;
  const yd = yScale.domain;
  const yr = yScale.range;
  const ky = (yr[1] - yr[0]) / (yd[1] - yd[0] || 1);
  const by = yr[0] - yd[0] * ky;
  const lerp = t < 1;
  const inv = n > 1 ? flow / (n - 1) : 0;
  const f1 = 1 + flow;

  let o = 0;
  let yv = ys[0] as number;
  if (lerp) {
    let ti = flow > 0 ? t * f1 - flow : t;
    if (ti < 0) ti = 0;
    else if (ti > 1) ti = 1;
    const p = prev ? (prev[0] as number) : yFallback;
    yv = p + (yv - p) * ti;
  }
  let firstX = bx + (xs[0] as number) * kx;
  let firstY = by + yv * ky;
  let col = Math.floor(firstX);
  let minX = firstX;
  let minY = firstY;
  let maxX = firstX;
  let maxY = firstY;
  let lastX = firstX;
  let lastY = firstY;

  const cap = out.length;
  for (let i = 1; i < n; i++) {
    const x = bx + (xs[i] as number) * kx;
    yv = ys[i] as number;
    if (lerp) {
      let ti = flow > 0 ? t * f1 - flow + i * inv : t;
      if (ti < 0) ti = 0;
      else if (ti > 1) ti = 1;
      const p = prev ? (prev[i] as number) : yFallback;
      yv = p + (yv - p) * ti;
    }
    const y = by + yv * ky;
    const c = Math.floor(x);
    if (c !== col) {
      if (o + 8 <= cap) {
        out[o] = firstX;
        out[o + 1] = firstY;
        o += 2;
        if (minY !== firstY || minX !== firstX) {
          out[o] = minX;
          out[o + 1] = minY;
          o += 2;
        }
        if (maxY !== minY || maxX !== minX) {
          out[o] = maxX;
          out[o + 1] = maxY;
          o += 2;
        }
        if (lastX !== maxX || lastY !== maxY) {
          out[o] = lastX;
          out[o + 1] = lastY;
          o += 2;
        }
      }
      col = c;
      firstX = x;
      firstY = y;
      minX = maxX = lastX = x;
      minY = maxY = lastY = y;
    } else {
      if (y < minY) {
        minY = y;
        minX = x;
      }
      if (y > maxY) {
        maxY = y;
        maxX = x;
      }
      lastX = x;
      lastY = y;
    }
  }
  if (o + 8 <= cap) {
    out[o] = firstX;
    out[o + 1] = firstY;
    o += 2;
    if (minY !== firstY || minX !== firstX) {
      out[o] = minX;
      out[o + 1] = minY;
      o += 2;
    }
    if (maxY !== minY || maxX !== minX) {
      out[o] = maxX;
      out[o + 1] = maxY;
      o += 2;
    }
    if (lastX !== maxX || lastY !== maxY) {
      out[o] = lastX;
      out[o + 1] = lastY;
      o += 2;
    }
  }
  return out.subarray(0, o);
}

/**
 * M4 (min-max) decimation: for each integer pixel column along x, keep the
 * first, min, max, and last points. Guarantees peaks are never dropped and
 * bounds path complexity to ~4 points per horizontal pixel.
 *
 * xs must be pixel-space x coordinates, monotonically non-decreasing.
 * ys must be pixel-space y coordinates of equal length.
 *
 * Returns interleaved [x, y] pairs ready for path construction.
 */
export function decimateM4(
  xs: ArrayLike<number>,
  ys: ArrayLike<number>,
  pixelWidth: number,
): Float32Array {
  const n = Math.min(xs.length, ys.length);
  if (n === 0) return new Float32Array(0);
  // Output points are always input points: ≤ n total, ≤ 4 per pixel column.
  const maxPts = Math.min(n, 4 * (Math.ceil(pixelWidth) + 8));
  const out = new Float32Array(Math.max(1, maxPts) * 2);

  let o = 0;
  let col = Math.floor(xs[0] as number);
  let firstX = xs[0] as number;
  let firstY = ys[0] as number;
  let minX = firstX;
  let minY = firstY;
  let maxX = firstX;
  let maxY = firstY;
  let lastX = firstX;
  let lastY = firstY;

  const put = (x: number, y: number): void => {
    if (o + 2 <= out.length) {
      out[o] = x;
      out[o + 1] = y;
      o += 2;
    }
  };

  const flush = () => {
    put(firstX, firstY);
    if (minY !== firstY || minX !== firstX) put(minX, minY);
    if (maxY !== minY || maxX !== minX) put(maxX, maxY);
    if (lastX !== maxX || lastY !== maxY) put(lastX, lastY);
  };

  for (let i = 1; i < n; i++) {
    const x = xs[i] as number;
    const y = ys[i] as number;
    const c = Math.floor(x);
    if (c !== col) {
      flush();
      col = c;
      firstX = x;
      firstY = y;
      minX = maxX = lastX = x;
      minY = maxY = lastY = y;
    } else {
      if (y < minY) {
        minY = y;
        minX = x;
      }
      if (y > maxY) {
        maxY = y;
        maxX = x;
      }
      lastX = x;
      lastY = y;
    }
  }
  flush();
  return out.subarray(0, o);
}
