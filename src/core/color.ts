export function withAlpha(color: string, alpha: number): string {
  if (color.startsWith("#")) {
    let hex = color.slice(1);
    if (hex.length === 3) {
      hex = hex
        .split("")
        .map((c) => c + c)
        .join("");
    }
    const n = Number.parseInt(hex, 16);
    const r = (n >> 16) & 255;
    const g = (n >> 8) & 255;
    const b = n & 255;
    return `rgba(${r},${g},${b},${alpha})`;
  }
  const m = color.match(/^rgba?\(([^)]+)\)$/);
  if (m) {
    const parts = (m[1] as string).split(",").slice(0, 3).join(",");
    return `rgba(${parts},${alpha})`;
  }
  return color;
}
