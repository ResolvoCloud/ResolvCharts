import type { Scale } from "./types";

/** Linear scale from domain `[d0, d1]` to range `[r0, r1]`, with `invert`. */
export function linearScale(
  d0: number,
  d1: number,
  r0: number,
  r1: number,
): Scale {
  const dd = d1 - d0 || 1;
  const dr = r1 - r0;
  const fn = ((v: number) => r0 + ((v - d0) / dd) * dr) as Scale;
  fn.invert = (px: number) => d0 + ((px - r0) / dr) * dd;
  fn.domain = [d0, d1];
  fn.range = [r0, r1];
  return fn;
}

/** `[min, max]` of `values`; degenerate inputs get a sane fallback domain. */
export function extent(values: ArrayLike<number>): [number, number] {
  let min = Infinity;
  let max = -Infinity;
  for (let i = 0; i < values.length; i++) {
    const v = values[i] as number;
    if (v < min) min = v;
    if (v > max) max = v;
  }
  if (min === Infinity) return [0, 1];
  if (min === max)
    return min === 0
      ? [0, 1]
      : [min - Math.abs(min) * 0.1, max + Math.abs(max) * 0.1];
  return [min, max];
}

/** Pad a domain by 5% on each end; `includeZero` anchors the axis at 0. */
export function padDomain(
  min: number,
  max: number,
  includeZero = false,
): [number, number] {
  let lo = includeZero ? Math.min(0, min) : min;
  let hi = includeZero ? Math.max(0, max) : max;
  if (lo === hi) {
    hi = lo + 1;
  }
  const pad = (hi - lo) * 0.05;
  if (!includeZero) {
    lo -= pad;
    hi += pad;
  } else {
    if (lo < 0) lo -= pad;
    if (hi > 0) hi += pad;
  }
  return [lo, hi];
}
