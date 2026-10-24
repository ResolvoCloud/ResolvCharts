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

const DAY = 86_400_000;
const MS_STEPS = [
  1, 2, 5, 10, 20, 50, 100, 250, 500, 1000, 2000, 5000, 15000, 30000, 60000,
  120000, 300000, 900000, 1800000, 3600000, 7200000, 10800000, 21600000,
  43200000,
];

function midnightCeil(t: number): number {
  const d = new Date(t);
  d.setHours(0, 0, 0, 0);
  return d.getTime() <= t ? d.getTime() + DAY : d.getTime();
}

/**
 * Time-axis ticks on epoch-ms domain `[min, max]` — sub-day steps land on
 * clock boundaries, day+ steps on local midnights, long spans on month or
 * year boundaries. ~`target` count.
 * @category Utilities
 */
export function timeTicks(min: number, max: number, target = 6): number[] {
  const span = max - min;
  if (!(span > 0) || !Number.isFinite(span)) return [min];
  const raw = span / Math.max(1, target);
  const ticks: number[] = [];
  if (raw < DAY) {
    let step = MS_STEPS[MS_STEPS.length - 1] as number;
    for (const s of MS_STEPS) {
      if (raw <= s) {
        step = s;
        break;
      }
    }
    // epoch-aligned: tz offsets are whole minutes, so clock boundaries hold
    for (let v = Math.ceil(min / step) * step; v <= max; v += step) {
      ticks.push(v);
      if (ticks.length > 2000) break;
    }
    return ticks;
  }
  if (raw <= 10 * DAY) {
    const step = raw <= 2 * DAY ? DAY : raw <= 4 * DAY ? 2 * DAY : 7 * DAY;
    for (let v = midnightCeil(min); v <= max; v += step) {
      ticks.push(v);
      if (ticks.length > 2000) break;
    }
    return ticks;
  }
  // months / years via the calendar
  const monthStep =
    raw <= 70 * DAY
      ? 1
      : raw <= 140 * DAY
        ? 2
        : raw <= 250 * DAY
          ? 3
          : raw <= 550 * DAY
            ? 6
            : 12;
  const d0 = new Date(min);
  const startYear = d0.getFullYear();
  const startMonth =
    monthStep === 12 ? 0 : Math.floor(d0.getMonth() / monthStep) * monthStep;
  for (let k = 0; k < 2400; k++) {
    const m = startMonth + k * monthStep;
    const v = new Date(startYear + Math.floor(m / 12), m % 12, 1).getTime();
    if (v > max) break;
    if (v >= min) ticks.push(v);
  }
  return ticks;
}

const MONTHS = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "May",
  "Jun",
  "Jul",
  "Aug",
  "Sep",
  "Oct",
  "Nov",
  "Dec",
];
const pad2 = (v: number): string => (v < 10 ? `0${v}` : String(v));

/** Default formatter for `xScale: "time"` — picked per visible `span` (ms).
 * @category Utilities
 */
export function timeFormatter(span: number): (v: number) => string {
  if (span < 1000) {
    return (v) => {
      const d = new Date(v);
      return `${pad2(d.getHours())}:${pad2(d.getMinutes())}:${pad2(d.getSeconds())}.${String(d.getMilliseconds()).padStart(3, "0")}`;
    };
  }
  if (span < DAY) {
    return (v) => {
      const d = new Date(v);
      return `${pad2(d.getHours())}:${pad2(d.getMinutes())}:${pad2(d.getSeconds())}`;
    };
  }
  if (span < 60 * DAY) {
    return (v) => {
      const d = new Date(v);
      return `${MONTHS[d.getMonth()]} ${d.getDate()}, ${pad2(d.getHours())}:${pad2(d.getMinutes())}`;
    };
  }
  if (span < 400 * DAY) {
    return (v) => {
      const d = new Date(v);
      return `${MONTHS[d.getMonth()]} ${d.getDate()}`;
    };
  }
  if (span < 900 * DAY) {
    return (v) => {
      const d = new Date(v);
      return `${MONTHS[d.getMonth()]} ${d.getFullYear()}`;
    };
  }
  return (v) => String(new Date(v).getFullYear());
}

/**
 * Log-axis ticks for a positive domain `[min, max]`. `major` carries powers
 * of `base` (labeled); `minor` carries `2..9 × base^k` gridlines, only when
 * the domain spans fewer than ~3 decades.
 * @category Utilities
 */
export function logTicks(
  min: number,
  max: number,
  base = 10,
): { major: number[]; minor: number[] } {
  const invLb = 1 / Math.log(base);
  const major: number[] = [];
  const minor: number[] = [];
  if (!(min > 0) || !(max > min)) {
    if (min > 0) major.push(min);
    return { major, minor };
  }
  const e0 = Math.ceil(Math.log(min) * invLb - 1e-9);
  const e1 = Math.floor(Math.log(max) * invLb + 1e-9);
  for (let e = e0; e <= e1; e++) major.push(base ** e);
  if (e1 - e0 <= 2) {
    const lo = Math.floor(Math.log(min) * invLb);
    for (let e = lo; e <= e1; e++) {
      const p = base ** e;
      for (let m = 2; m < base; m++) {
        const v = m * p;
        if (v > min && v < max) minor.push(v);
        if (minor.length > 400) return { major, minor };
      }
    }
  }
  return { major, minor };
}
