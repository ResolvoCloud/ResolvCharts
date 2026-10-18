/** Parse a CSS color (#rgb, #rrggbb, rgb(), rgba()) into linear-ish 0-1 rgba. */
export function parseColor(c: string): [number, number, number, number] {
  if (c.startsWith("#")) {
    const h = c.slice(1);
    if (h.length === 3) {
      return [
        parseInt(h[0] as string, 16) / 15,
        parseInt(h[1] as string, 16) / 15,
        parseInt(h[2] as string, 16) / 15,
        1,
      ];
    }
    if (h.length === 6) {
      return [
        parseInt(h.slice(0, 2), 16) / 255,
        parseInt(h.slice(2, 4), 16) / 255,
        parseInt(h.slice(4, 6), 16) / 255,
        1,
      ];
    }
  }
  const m = /rgba?\(([^)]+)\)/.exec(c);
  if (m) {
    const parts = (m[1] as string).split(",").map((v) => Number.parseFloat(v));
    return [
      (parts[0] ?? 0) / 255,
      (parts[1] ?? 0) / 255,
      (parts[2] ?? 0) / 255,
      parts[3] ?? 1,
    ];
  }
  return [0, 0, 0, 1];
}
