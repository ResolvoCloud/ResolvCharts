import type { Scale } from "./types";

/**
 * Map data-space points to pixel space (with optional lerp between prev and
 * current y for animation) into interleaved [x, y] pairs. Non-finite y
 * propagates as NaN — path builders split segments there (data gaps).
 *
 * Returns a subarray view of a pooled buffer — consume it before calling
 * mapSeriesPx again.
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
  /** log base per axis — folds `log_b` into the fused map */
  logs?: { x?: number | undefined; y?: number | undefined },
  /** y contains NaN gaps — false skips the per-point gap check */
  gaps = true,
  /**
   * Per axis: input array already holds `log_b` display-space values (NaN
   * where invalid). The per-point transform is then skipped — the loop runs
   * pure affine.
   */
  pre?: { x?: boolean | undefined; y?: boolean | undefined },
): Float32Array {
  const n = Math.min(xs.length, ys.length);
  // pooled output — callers consume before the next map/decimate call
  if (mapScratch.length < Math.max(1, n) * 2) {
    mapScratch = new Float32Array(Math.max(1, n) * 2);
  }
  const out = mapScratch;
  const lx = logs?.x;
  const invLx = lx ? 1 / Math.log(lx) : 0;
  const ly = logs?.y;
  const invLy = ly ? 1 / Math.log(ly) : 0;
  const lxT = pre?.x ? undefined : lx;
  const lyT = pre?.y ? undefined : ly;
  const xd = xScale.domain;
  const xr = xScale.range;
  const dx0 = lx ? Math.log(xd[0]) * invLx : xd[0];
  const dx1 = lx ? Math.log(xd[1]) * invLx : xd[1];
  const kx = (xr[1] - xr[0]) / (dx1 - dx0 || 1);
  const bx = xr[0] - dx0 * kx;
  const yd = yScale.domain;
  const yr = yScale.range;
  const dy0 = ly ? Math.log(yd[0]) * invLy : yd[0];
  const dy1 = ly ? Math.log(yd[1]) * invLy : yd[1];
  const ky = (yr[1] - yr[0]) / (dy1 - dy0 || 1);
  const by = yr[0] - dy0 * ky;
  const lerp = t < 1;
  // per-point progress: newest (rightmost) leads, tail lags by `flow`
  const inv = n > 1 ? flow / (n - 1) : 0;
  const f1 = 1 + flow;
  let o = 0;
  if (!gaps && lxT === undefined && lyT === undefined) {
    // verbatim fast loop — zero per-point branches beyond the original code
    for (let i = 0; i < n; i++) {
      let yv = ys[i] as number;
      if (lerp) {
        let ti = flow > 0 ? t * f1 - flow + i * inv : t;
        if (ti < 0) ti = 0;
        else if (ti > 1) ti = 1;
        const pv = prev ? (prev[i] as number) : NaN;
        const p = Number.isFinite(pv) ? pv : yFallback;
        yv = p + (yv - p) * ti;
      }
      out[o] = bx + (xs[i] as number) * kx;
      out[o + 1] = by + yv * ky;
      o += 2;
    }
    return out.subarray(0, o);
  }
  for (let i = 0; i < n; i++) {
    let yv = ys[i] as number;
    if (lerp && Number.isFinite(yv)) {
      let ti = flow > 0 ? t * f1 - flow + i * inv : t;
      if (ti < 0) ti = 0;
      else if (ti > 1) ti = 1;
      const pv = prev ? (prev[i] as number) : NaN;
      const p = Number.isFinite(pv) ? pv : yFallback;
      yv = p + (yv - p) * ti;
    }
    const xv = xs[i] as number;
    out[o] = lxT ? bx + Math.log(xv) * invLx * kx : bx + xv * kx;
    out[o + 1] = lyT
      ? yv > 0
        ? by + Math.log(yv) * invLy * ky
        : NaN
      : by + yv * ky;
    o += 2;
  }
  return out.subarray(0, o);
}

/** pooled output for decimateSeriesPx — callers consume before the next call */
let decScratch = new Float32Array(0);
/** pooled output for mapSeriesPx — callers consume before the next call */
let mapScratch = new Float32Array(0);

/**
 * Emit one M4 column: transform the raw-space first/min/max/last survivors
 * (affine, or log_b when `xb`-family `lx`/`ly` are nonzero) and write the
 * deduplicated first → screen-min → screen-max → last sequence. Everything
 * arrives by argument so callers keep their hot-loop variables in registers.
 * Returns the new output offset.
 */
function emitCol(
  out: Float32Array,
  o: number,
  cap: number,
  fXv: number,
  fYv: number,
  mnXv: number,
  mnYv: number,
  mxXv: number,
  mxYv: number,
  lXv: number,
  lYv: number,
  bx: number,
  kx: number,
  lx: number,
  invLx: number,
  by: number,
  ky: number,
  ly: number,
  invLy: number,
): number {
  if (o + 8 > cap) return o;
  const fX = lx ? bx + Math.log(fXv) * invLx * kx : bx + fXv * kx;
  const fY = ly ? by + Math.log(fYv) * invLy * ky : by + fYv * ky;
  const m1x = lx ? bx + Math.log(mnXv) * invLx * kx : bx + mnXv * kx;
  const m1y = ly ? by + Math.log(mnYv) * invLy * ky : by + mnYv * ky;
  const m2x = lx ? bx + Math.log(mxXv) * invLx * kx : bx + mxXv * kx;
  const m2y = ly ? by + Math.log(mxYv) * invLy * ky : by + mxYv * ky;
  const lX = lx ? bx + Math.log(lXv) * invLx * kx : bx + lXv * kx;
  const lY = ly ? by + Math.log(lYv) * invLy * ky : by + lYv * ky;
  // pixel-M4 emits the screen-min point first — for inverted/log axes that
  // is the raw max, so order the middle pair by transformed y
  let aX = m1x;
  let aY = m1y;
  let bX = m2x;
  let bY = m2y;
  if (m1y > m2y) {
    aX = m2x;
    aY = m2y;
    bX = m1x;
    bY = m1y;
  }
  out[o] = fX;
  out[o + 1] = fY;
  o += 2;
  if (aY !== fY || aX !== fX) {
    out[o] = aX;
    out[o + 1] = aY;
    o += 2;
  }
  if (bY !== aY || bX !== aX) {
    out[o] = bX;
    out[o + 1] = bY;
    o += 2;
  }
  if (lX !== bX || lY !== bY) {
    out[o] = lX;
    out[o + 1] = lY;
    o += 2;
  }
  return o;
}

/**
 * Fused map + M4 decimation: scales data-space points to pixel space on the
 * fly (lerping y when animating), so no intermediate pixel arrays are ever
 * allocated. xs must be monotonically non-decreasing.
 *
 * Non-finite y values are gaps: the decimator emits one `[NaN, NaN]`
 * separator between contiguous runs so path builders split segments.
 *
 * Returns a subarray view of a pooled buffer — consume it before calling
 * decimateSeriesPx again.
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
  /** log base per axis — folds `log_b` into the fused map */
  logs?: { x?: number | undefined; y?: number | undefined },
  /** y contains NaN gaps — false selects the verbatim fast loop */
  gaps = true,
  /**
   * Sorted data indices where the series breaks (NaN, or non-positive under
   * log-y). When provided, the decimator iterates finite runs verbatim —
   * no per-point gap checks.
   */
  gapIdx?: ArrayLike<number> | null,
  /**
   * Per axis: input array already holds `log_b` display-space values (NaN
   * where invalid — the same positions `gapIdx` marks). M4 then accumulates
   * display-space values (log is monotonic, ordering is identical) and the
   * survivors only need the affine.
   */
  pre?: { x?: boolean | undefined; y?: boolean | undefined },
): Float32Array {
  const n = Math.min(xs.length, ys.length);
  if (n === 0) return new Float32Array(0);
  const lx = logs?.x;
  const invLx = lx ? 1 / Math.log(lx) : 0;
  const ly = logs?.y;
  const invLy = ly ? 1 / Math.log(ly) : 0;
  const lxT = pre?.x ? undefined : lx;
  const lyT = pre?.y ? undefined : ly;
  // output bound without a prescan: ≤ min(n, 4/col) decimated pts + ≤ n
  // separators (≤ one per gap) — slightly over-allocates, but the buffer is
  // pooled so the grow cost is paid once
  const maxPts = Math.min(n, 4 * (Math.ceil(pixelWidth) + 8)) + n + 1;
  // +8 slack: a column emits up to 4 points as one block — the grouped
  // capacity check must not starve when only a few slots remain
  if (decScratch.length < maxPts * 2 + 8) {
    decScratch = new Float32Array(Math.max(1, maxPts) * 2 + 8);
  }
  const out = decScratch;

  const xd = xScale.domain;
  const xr = xScale.range;
  const dx0 = lx ? Math.log(xd[0]) * invLx : xd[0];
  const dx1 = lx ? Math.log(xd[1]) * invLx : xd[1];
  const kx = (xr[1] - xr[0]) / (dx1 - dx0 || 1);
  const bx = xr[0] - dx0 * kx;
  const yd = yScale.domain;
  const yr = yScale.range;
  const dy0 = ly ? Math.log(yd[0]) * invLy : yd[0];
  const dy1 = ly ? Math.log(yd[1]) * invLy : yd[1];
  const ky = (yr[1] - yr[0]) / (dy1 - dy0 || 1);
  const by = yr[0] - dy0 * ky;
  const lerp = t < 1;
  const inv = n > 1 ? flow / (n - 1) : 0;
  const f1 = 1 + flow;
  const cap = out.length;

  if (!gaps && lxT === undefined && lyT === undefined) {
    // verbatim fast loop — hoisted first point, no per-point gap checks
    let o = 0;
    let yv0 = ys[0] as number;
    if (lerp) {
      let ti = flow > 0 ? t * f1 - flow : t;
      if (ti < 0) ti = 0;
      else if (ti > 1) ti = 1;
      const p = prev ? (prev[0] as number) : yFallback;
      yv0 = p + (yv0 - p) * ti;
    }
    let firstX = bx + (xs[0] as number) * kx;
    let firstY = by + yv0 * ky;
    let col = Math.floor(firstX);
    let minX = firstX;
    let minY = firstY;
    let maxX = firstX;
    let maxY = firstY;
    let lastX = firstX;
    let lastY = firstY;
    for (let i = 1; i < n; i++) {
      const x = bx + (xs[i] as number) * kx;
      let yv = ys[i] as number;
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

  // general path — run-split on `gapIdx` and/or log transforms. Runs hold
  // only valid points, so the inner loop does no gap checks; M4 accumulates
  // raw data values and the ≤4 survivors per pixel column are transformed
  // (affine or log_b) once at flush — log is monotonic, so raw-space
  // extrema map to pixel-space extrema.
  if (gapIdx != null || logs != null) {
    let o = 0;
    let emitted = false;
    const gl = gapIdx?.length ?? 0;
    let i0 = 0;
    for (let gi = 0; gi <= gl; gi++) {
      const i1 = gi < gl ? ((gapIdx as ArrayLike<number>)[gi] as number) : n;
      if (i1 <= i0) {
        i0 = i1 + 1;
        continue;
      }
      if (emitted && o + 2 <= cap) {
        out[o] = NaN;
        out[o + 1] = NaN;
        o += 2;
      }
      emitted = true;
      let started = false;
      let col = 0;
      // smallest x that falls into column col+1 — log-x advances columns
      // by compare, computing log only at each boundary
      let nextXv = Infinity;
      // raw-space M4 accumulators — plain locals. A closure-captured
      // accumulator or scale constant would sink into context storage and
      // measurably slow this loop, so emitCol takes everything by argument
      let firstX = 0;
      let firstY = 0;
      let minX = 0;
      let minY = 0;
      let maxX = 0;
      let maxY = 0;
      let lastX = 0;
      let lastY = 0;
      if (lxT === undefined) {
        for (let i = i0; i < i1; i++) {
          let yv = ys[i] as number;
          if (lerp) {
            let ti = flow > 0 ? t * f1 - flow + i * inv : t;
            if (ti < 0) ti = 0;
            else if (ti > 1) ti = 1;
            const pv = prev ? (prev[i] as number) : NaN;
            const p = Number.isFinite(pv) ? pv : yFallback;
            yv = p + (yv - p) * ti;
          }
          const xv = xs[i] as number;
          const c = Math.floor(bx + xv * kx);
          if (!started || c !== col) {
            if (started) {
              o = emitCol(
                out,
                o,
                cap,
                firstX,
                firstY,
                minX,
                minY,
                maxX,
                maxY,
                lastX,
                lastY,
                bx,
                kx,
                0,
                0,
                by,
                ky,
                lyT ?? 0,
                invLy,
              );
            }
            col = c;
            firstX = xv;
            firstY = yv;
            minX = maxX = lastX = xv;
            minY = maxY = lastY = yv;
            started = true;
          } else {
            if (yv < minY) {
              minY = yv;
              minX = xv;
            }
            if (yv > maxY) {
              maxY = yv;
              maxX = xv;
            }
            lastX = xv;
            lastY = yv;
          }
        }
      } else {
        for (let i = i0; i < i1; i++) {
          let yv = ys[i] as number;
          if (lerp) {
            let ti = flow > 0 ? t * f1 - flow + i * inv : t;
            if (ti < 0) ti = 0;
            else if (ti > 1) ti = 1;
            const pv = prev ? (prev[i] as number) : NaN;
            const p = Number.isFinite(pv) ? pv : yFallback;
            yv = p + (yv - p) * ti;
          }
          const xv = xs[i] as number;
          if (!started || xv >= nextXv) {
            const c = Math.floor(bx + Math.log(xv) * invLx * kx);
            if (!started || c !== col) {
              if (started) {
                o = emitCol(
                  out,
                  o,
                  cap,
                  firstX,
                  firstY,
                  minX,
                  minY,
                  maxX,
                  maxY,
                  lastX,
                  lastY,
                  bx,
                  kx,
                  lxT,
                  invLx,
                  by,
                  ky,
                  lyT ?? 0,
                  invLy,
                );
              }
              col = c;
              nextXv = Math.exp((c + 1 - bx) / (invLx * kx));
              firstX = xv;
              firstY = yv;
              minX = maxX = lastX = xv;
              minY = maxY = lastY = yv;
              started = true;
              continue;
            }
          }
          if (yv < minY) {
            minY = yv;
            minX = xv;
          }
          if (yv > maxY) {
            maxY = yv;
            maxX = xv;
          }
          lastX = xv;
          lastY = yv;
        }
      }
      if (started) {
        o = emitCol(
          out,
          o,
          cap,
          firstX,
          firstY,
          minX,
          minY,
          maxX,
          maxY,
          lastX,
          lastY,
          bx,
          kx,
          lxT ?? 0,
          invLx,
          by,
          ky,
          lyT ?? 0,
          invLy,
        );
      }
      i0 = i1 + 1;
    }
    return out.subarray(0, o);
  }

  let o = 0;
  let started = false;
  let col = 0;
  let firstX = 0;
  let firstY = 0;
  let minX = 0;
  let minY = 0;
  let maxX = 0;
  let maxY = 0;
  let lastX = 0;
  let lastY = 0;

  const flush = (): void => {
    if (o + 8 > cap) return;
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
  };

  for (let i = 0; i < n; i++) {
    let yv = ys[i] as number;
    if (lerp && Number.isFinite(yv)) {
      let ti = flow > 0 ? t * f1 - flow + i * inv : t;
      if (ti < 0) ti = 0;
      else if (ti > 1) ti = 1;
      const pv = prev ? (prev[i] as number) : NaN;
      const p = Number.isFinite(pv) ? pv : yFallback;
      yv = p + (yv - p) * ti;
    }
    // gap check inlined: log-y treats non-positive as missing
    if (!Number.isFinite(yv) || (lyT !== undefined && yv <= 0)) {
      if (started) {
        flush();
        started = false;
        if (o + 2 <= cap) {
          out[o] = NaN;
          out[o + 1] = NaN;
          o += 2;
        }
      }
      continue;
    }
    const xv = xs[i] as number;
    const x = lxT === undefined ? bx + xv * kx : bx + Math.log(xv) * invLx * kx;
    const y = lyT === undefined ? by + yv * ky : by + Math.log(yv) * invLy * ky;
    const c = Math.floor(x);
    if (!started || c !== col) {
      if (started) flush();
      col = c;
      firstX = x;
      firstY = y;
      minX = maxX = lastX = x;
      minY = maxY = lastY = y;
      started = true;
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
  if (started) flush();
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
 * @category Utilities
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
  // +8 slack: a column emits up to 4 points as one block — the grouped
  // capacity check must not starve when only a few slots remain
  const out = new Float32Array(Math.max(1, maxPts) * 2 + 8);

  let o = 0;
  const cap = out.length;
  let col = Math.floor(xs[0] as number);
  let firstX = xs[0] as number;
  let firstY = ys[0] as number;
  let minX = firstX;
  let minY = firstY;
  let maxX = firstX;
  let maxY = firstY;
  let lastX = firstX;
  let lastY = firstY;

  // flat emission — a closure capturing `o`/`out` would sink the
  // accumulators into context storage and measurably slow this loop
  for (let i = 1; i < n; i++) {
    const x = xs[i] as number;
    const y = ys[i] as number;
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
