/** Deterministic, realistic-looking sample data for demos. */

function rng(seed: number) {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

/**
 * Price-like random walk: regime shifts (drift + volatility re-drawn every
 * ~120 points), so it reads like a real series instead of a clean sine.
 */
export function priceLike(n: number, seed = 7, start = 100) {
  const r = rng(seed);
  let v = start;
  let drift = 0;
  let vol = 1;
  const out = new Array<number>(n);
  for (let i = 0; i < n; i++) {
    if (i % 120 === 0) {
      drift = (r() - 0.45) * 0.9;
      vol = 0.5 + r() * 1.7;
    }
    v = Math.max(8, v + drift + (r() - 0.5) * 2 * vol * 0.7);
    out[i] = Math.round(v * 100) / 100;
  }
  return out;
}

/** Two equity-style lines — "this year" vs "last year". */
export function lineRealistic(n = 365) {
  return {
    x: Array.from({ length: n }, (_, i) => i),
    series: [
      { label: "2026", y: priceLike(n, 11, 100) },
      { label: "2025", y: priceLike(n, 29, 88) },
    ],
  };
}

/**
 * OHLC random walk: GARCH-ish volatility clustering, wicks scale with
 * volatility, volume correlates with absolute body size — like real tape.
 */
export function candlesRealistic(n = 140, seed = 5) {
  const r = rng(seed);
  let close = 96;
  let vol = 1.3;
  const candles = [];
  for (let i = 0; i < n; i++) {
    vol = Math.max(0.4, Math.min(3.2, vol * 0.9 + r() * 0.35));
    const open = close;
    const drift = Math.sin(i / 17) * 0.4 + (r() - 0.5) * 0.35;
    const body = (r() - 0.5) * 2 * vol + drift;
    close = Math.max(12, open + body);
    const high = Math.max(open, close) + r() * vol * 0.85;
    const low = Math.min(open, close) - r() * vol * 0.85;
    candles.push({
      x: i,
      open: Math.round(open * 100) / 100,
      high: Math.round(high * 100) / 100,
      low: Math.round(low * 100) / 100,
      close: Math.round(close * 100) / 100,
      volume: Math.round(220 + vol * 240 + Math.abs(body) * 320 + r() * 140),
    });
  }
  return { candles };
}
