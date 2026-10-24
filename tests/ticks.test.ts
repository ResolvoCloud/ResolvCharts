import { describe, expect, it } from "vitest";
import {
  computeTicks,
  logTicks,
  timeFormatter,
  timeTicks,
} from "../src/core/ticks";

describe("computeTicks", () => {
  it("produces nice round ticks", () => {
    const t = computeTicks(0, 100, 5);
    expect(t.length).toBeGreaterThanOrEqual(3);
    expect(t.length).toBeLessThanOrEqual(11);
    for (const v of t) {
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThanOrEqual(100);
    }
  });
  it("works for small ranges", () => {
    const t = computeTicks(0, 1, 5);
    expect(t.length).toBeGreaterThanOrEqual(3);
    expect(t[0]).toBeCloseTo(0);
  });
  it("works for negative ranges", () => {
    const t = computeTicks(-50, 50, 5);
    expect(t).toContain(0);
  });
  it("handles equal min/max", () => {
    expect(computeTicks(5, 5)).toEqual([5]);
  });
});

const DAY = 86_400_000;

describe("timeTicks", () => {
  it("sub-day span lands on clock boundaries", () => {
    const t0 = Date.UTC(2024, 0, 1);
    const t = timeTicks(t0, t0 + 6 * 3_600_000, 6);
    expect(t.length).toBeGreaterThan(0);
    for (const v of t) {
      expect(v % 60_000).toBe(0);
      expect(v).toBeGreaterThanOrEqual(t0);
      expect(v).toBeLessThanOrEqual(t0 + 6 * 3_600_000);
    }
  });
  it("multi-year span uses year boundaries", () => {
    const t0 = new Date(2000, 3, 15).getTime();
    const t = timeTicks(t0, t0 + 20 * 365 * DAY, 6);
    expect(t.length).toBeGreaterThan(1);
    for (const v of t) {
      expect(new Date(v).getMonth()).toBe(0);
      expect(new Date(v).getDate()).toBe(1);
    }
  });
  it("degenerate domain returns the value", () => {
    expect(timeTicks(5, 5)).toEqual([5]);
  });
});

describe("timeFormatter", () => {
  it("seconds span shows HH:MM:SS", () => {
    const fmt = timeFormatter(3_600_000);
    const v = new Date(2024, 5, 1, 9, 30, 15).getTime();
    expect(fmt(v)).toBe("09:30:15");
  });
  it("year+ span shows year", () => {
    const fmt = timeFormatter(1000 * DAY);
    const v = new Date(2024, 5, 1).getTime();
    expect(fmt(v)).toBe("2024");
  });
  it("day range shows Month Day", () => {
    const fmt = timeFormatter(100 * DAY);
    const v = new Date(2024, 0, 15).getTime();
    expect(fmt(v)).toBe("Jan 15");
  });
});

describe("logTicks", () => {
  it("decades only for wide spans", () => {
    const { major, minor } = logTicks(1, 100_000);
    expect(major).toEqual([1, 10, 100, 1000, 10_000, 100_000]);
    expect(minor).toEqual([]);
  });
  it("minor gridlines for narrow spans", () => {
    const { major, minor } = logTicks(1, 100);
    expect(major).toEqual([1, 10, 100]);
    expect(minor).toContain(2);
    expect(minor).toContain(50);
  });
  it("partial decade clamps to domain", () => {
    const { major } = logTicks(3, 40);
    expect(major).toEqual([10]);
  });
  it("non-positive domain yields empty", () => {
    const { major, minor } = logTicks(0, 10);
    expect(major).toEqual([]);
    expect(minor).toEqual([]);
  });
});
