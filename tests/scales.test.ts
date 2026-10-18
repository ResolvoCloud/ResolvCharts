import { describe, expect, it } from "vitest";
import {
  boundDomain,
  extent,
  linearScale,
  padDomain,
} from "../src/core/scales";

describe("linearScale", () => {
  it("maps domain to range", () => {
    const s = linearScale(0, 10, 0, 100);
    expect(s(0)).toBe(0);
    expect(s(5)).toBe(50);
    expect(s(10)).toBe(100);
    expect(s.invert(50)).toBe(5);
  });
  it("handles inverted range (y axis)", () => {
    const s = linearScale(0, 1, 200, 0);
    expect(s(0)).toBe(200);
    expect(s(1)).toBe(0);
    expect(s.invert(100)).toBeCloseTo(0.5);
  });
  it("handles degenerate domain", () => {
    const s = linearScale(5, 5, 0, 100);
    expect(Number.isFinite(s(5))).toBe(true);
  });
});

describe("extent", () => {
  it("returns min/max", () => {
    expect(extent([3, -1, 7])).toEqual([-1, 7]);
  });
  it("empty → [0,1]", () => {
    expect(extent([])).toEqual([0, 1]);
  });
  it("flat non-zero gets padded", () => {
    const [a, b] = extent([5, 5]);
    expect(a).toBeLessThan(5);
    expect(b).toBeGreaterThan(5);
  });
});

describe("padDomain", () => {
  it("pads 5% both sides", () => {
    const [a, b] = padDomain(0, 100);
    expect(a).toBeCloseTo(-5);
    expect(b).toBeCloseTo(105);
  });
  it("includeZero keeps zero unpadded", () => {
    const [a, b] = padDomain(10, 100, true);
    expect(a).toBe(0);
    expect(b).toBeGreaterThan(100);
  });
  it("negative domain pads below zero", () => {
    const [a] = padDomain(-50, -10, true);
    expect(a).toBeLessThan(-50);
  });
});

describe("boundDomain", () => {
  it("pins both ends", () => {
    expect(boundDomain([3.5, 20], 0, 100)).toEqual([0, 100]);
  });
  it("unset ends keep the fitted value", () => {
    expect(boundDomain([3.5, 20], 0)).toEqual([0, 20]);
    expect(boundDomain([3.5, 20], undefined, 100)).toEqual([3.5, 100]);
  });
  it("no bounds returns the domain unchanged", () => {
    expect(boundDomain([3.5, 20])).toEqual([3.5, 20]);
  });
  it("can shrink below the data extent", () => {
    expect(boundDomain([0, 200], 0, 100)).toEqual([0, 100]);
  });
});
