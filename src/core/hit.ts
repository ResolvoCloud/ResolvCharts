/**
 * Binary search for the index whose value is nearest to `target`.
 * `xs` must be sorted ascending. Returns -1 for empty input.
 */
export function nearestIndex(xs: ArrayLike<number>, target: number): number {
  const n = xs.length;
  if (n === 0) return -1;
  if (target <= (xs[0] as number)) return 0;
  if (target >= (xs[n - 1] as number)) return n - 1;
  let lo = 0;
  let hi = n - 1;
  while (hi - lo > 1) {
    const mid = (lo + hi) >> 1;
    if ((xs[mid] as number) < target) lo = mid;
    else hi = mid;
  }
  const dLo = Math.abs(target - (xs[lo] as number));
  const dHi = Math.abs(target - (xs[hi] as number));
  return dHi < dLo ? hi : lo;
}
