const STEPS = [1, 2, 2.5, 5, 10];

function niceStep(range: number, target: number): number {
  const raw = Math.abs(range) / Math.max(1, target);
  if (!Number.isFinite(raw) || raw === 0) return 1;
  const pow = 10 ** Math.floor(Math.log10(raw));
  const norm = raw / pow;
  let step = 10;
  for (const s of STEPS) {
    if (norm <= s) {
      step = s;
      break;
    }
  }
  return step * pow;
}

/** "Nice" round tick values covering `[min, max]`, ~`target` count.
 * @category Utilities
 */
export function computeTicks(min: number, max: number, target = 5): number[] {
  if (!(min < max)) return [min];
  const step = niceStep(max - min, target);
  const lo = Math.ceil(min / step) * step;
  const ticks: number[] = [];
  for (let v = lo; v <= max + step * 1e-9; v += step) {
    ticks.push(Math.abs(v) < step * 1e-9 ? 0 : v);
    if (ticks.length > 1000) break;
  }
  return ticks;
}
