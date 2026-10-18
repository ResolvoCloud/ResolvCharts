import type { ChartOptions, ThemeTokens } from "./types";

const FONT = 'Inter, system-ui, -apple-system, "Segoe UI", sans-serif';

/** Built-in light theme.
 * @category Theming
 */
export const lightTheme: ThemeTokens = {
  bg: "#ffffff",
  text: "#1f1f1f",
  textMuted: "#8a8a8a",
  grid: "rgba(0,0,0,0.07)",
  axisBaseline: "rgba(0,0,0,0.15)",
  crosshair: "rgba(0,0,0,0.25)",
  series: ["#0070f3"],
  contextGray: "#b0b0b0",
  up: "#0e9f6e",
  down: "#e5484d",
  tooltipBg: "#ffffff",
  tooltipText: "#1f1f1f",
  tooltipMuted: "#8a8a8a",
  tooltipBorder: "rgba(0,0,0,0.08)",
  tooltipShadow: "0 4px 14px rgba(0,0,0,0.08)",
  fontFamily: FONT,
};

/** Built-in dark theme.
 * @category Theming
 */
export const darkTheme: ThemeTokens = {
  bg: "#0a0a0a",
  text: "#ededed",
  textMuted: "#8a8a8a",
  grid: "rgba(255,255,255,0.07)",
  axisBaseline: "rgba(255,255,255,0.18)",
  crosshair: "rgba(255,255,255,0.3)",
  series: ["#3b9dff"],
  contextGray: "#5c5c5c",
  up: "#34c98e",
  down: "#f2555a",
  tooltipBg: "#161616",
  tooltipText: "#ededed",
  tooltipMuted: "#8a8a8a",
  tooltipBorder: "rgba(255,255,255,0.1)",
  tooltipShadow: "0 4px 14px rgba(0,0,0,0.4)",
  fontFamily: FONT,
};

export const categoricalLight: string[] = [
  "#0070f3",
  "#0e9f6e",
  "#8e4ec6",
  "#f5a623",
];
export const categoricalDark: string[] = [
  "#3b9dff",
  "#34c98e",
  "#a97ef0",
  "#f5b84d",
];

/** Merge a theme option (`"light" | "dark" | partial tokens`) into full {@link ThemeTokens}.
 * @category Theming
 */
export function resolveTheme(
  opt: ChartOptions["theme"],
  accent: string | undefined,
): ThemeTokens {
  const base =
    opt === "dark"
      ? { ...darkTheme, series: [...categoricalDark] }
      : opt === "light" || opt === undefined
        ? { ...lightTheme, series: [...categoricalLight] }
        : { ...lightTheme, series: [...categoricalLight], ...opt };
  if (accent) base.series[0] = accent;
  return base;
}

export function seriesColor(
  theme: ThemeTokens,
  index: number,
  explicit: string | undefined,
): string {
  if (explicit) return explicit;
  return theme.series[index % theme.series.length] as string;
}
