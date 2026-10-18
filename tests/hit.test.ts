import { describe, expect, it } from "vitest";
import { nearestIndex } from "../src/core/hit";

describe("nearestIndex", () => {
  const xs = [0, 10, 20, 30, 40];
  it("exact match", () => {
    expect(nearestIndex(xs, 20)).toBe(2);
  });
  it("nearest below", () => {
    expect(nearestIndex(xs, 12)).toBe(1);
  });
  it("nearest above", () => {
    expect(nearestIndex(xs, 18)).toBe(2);
  });
  it("clamps to ends", () => {
    expect(nearestIndex(xs, -5)).toBe(0);
    expect(nearestIndex(xs, 99)).toBe(4);
  });
  it("empty → -1", () => {
    expect(nearestIndex([], 5)).toBe(-1);
  });
});
