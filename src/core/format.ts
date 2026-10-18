/** Compact number formatting: integers verbatim, else 4 significant digits. */
export function formatNumber(v: number): string {
  if (!Number.isFinite(v)) return "";
  if (Number.isInteger(v) && Math.abs(v) < 1e15) return String(v);
  return String(Number(v.toPrecision(4)));
}

const MAGNITUDES: [number, string][] = [
  [1e9, "B"],
  [1e6, "M"],
  [1e3, "k"],
];

/** SI-suffixed formatting: `1.2k`, `3.4M`, `5B`. */
export function formatSI(v: number): string {
  if (!Number.isFinite(v)) return "";
  const abs = Math.abs(v);
  for (const [m, s] of MAGNITUDES) {
    if (abs >= m) {
      const n = v / m;
      const digits = n >= 100 || Number.isInteger(n) ? 0 : 1;
      return `${n.toFixed(digits)}${s}`;
    }
  }
  return formatNumber(v);
}
