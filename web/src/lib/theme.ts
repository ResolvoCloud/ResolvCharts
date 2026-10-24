import type { ThemeTokens } from "resolvcharts";

/** Site-matched light theme passed to every chart instance. */
export const siteTheme: ThemeTokens = {
  bg: "#ffffff",
  text: "#101713",
  textMuted: "#63716a",
  grid: "rgba(16,23,19,0.06)",
  axisBaseline: "rgba(16,23,19,0.16)",
  crosshair: "rgba(16,23,19,0.3)",
  series: ["#0e9f6e", "#2563eb", "#b25e09", "#7c5cd6", "#d64541"],
  contextGray: "#9aa8a1",
  up: "#0e9f6e",
  down: "#d64541",
  tooltipBg: "#ffffff",
  tooltipText: "#101713",
  tooltipMuted: "#63716a",
  tooltipBorder: "#e4e9e6",
  tooltipShadow: "0 6px 20px rgba(16,23,19,0.12)",
  fontFamily: '"IBM Plex Mono", ui-monospace, monospace',
};

/** Benchmark-style dense two-series signal, `50 + 30·sin(i/500) + (i%17)`. */
export function makeXY(n: number) {
  const x = new Array<number>(n);
  const y1 = new Array<number>(n);
  const y2 = new Array<number>(n);
  for (let i = 0; i < n; i++) {
    x[i] = i;
    y1[i] = 50 + 30 * Math.sin(i / 500) + (i % 17);
    y2[i] = 60 + 20 * Math.cos(i / 300) + (i % 13);
  }
  return {
    x,
    series: [
      { label: "ch·a", y: y1 },
      { label: "ch·b", y: y2 },
    ],
  };
}

export function makeScatter(n: number) {
  const x = new Array<number>(n);
  const y1 = new Array<number>(n);
  const y2 = new Array<number>(n);
  let s = 42;
  const rnd = () => {
    s = (s * 16807) % 2147483647;
    return s / 2147483647;
  };
  for (let i = 0; i < n; i++) {
    x[i] = rnd() * 100;
    y1[i] = 40 + 25 * Math.sin(x[i] / 12) + rnd() * 20;
    y2[i] = 60 + 15 * Math.cos(x[i] / 9) + rnd() * 18;
  }
  return {
    x,
    series: [
      { label: "α", y: y1 },
      { label: "β", y: y2 },
    ],
  };
}

export const si = (v: number) =>
  Math.abs(v) >= 1e6
    ? `${(v / 1e6).toFixed(1)}M`
    : Math.abs(v) >= 1e3
      ? `${(v / 1e3).toFixed(0)}k`
      : `${v}`;
