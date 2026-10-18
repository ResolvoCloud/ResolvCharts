import { describe, expect, it } from "vitest";
import { computeTicks } from "../src/core/ticks";

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
