import { describe, expect, it } from "vitest";
import { decimateM4 } from "../src/core/decimate";

describe("decimateM4", () => {
  it("passes through sparse data", () => {
    const xs = [0, 10, 20];
    const ys = [1, 5, 2];
    const out = decimateM4(xs, ys, 100);
    expect(out.length).toBe(6);
    expect(out[0]).toBe(0);
    expect(out[1]).toBe(1);
    expect(out[4]).toBe(20);
    expect(out[5]).toBe(2);
  });

  it("bounds output to ~4 points per pixel column", () => {
    const n = 100_000;
    const xs = new Float64Array(n);
    const ys = new Float64Array(n);
    for (let i = 0; i < n; i++) {
      xs[i] = (i / n) * 800;
      ys[i] = Math.sin(i / 1000) * 50;
    }
    const out = decimateM4(xs, ys, 800);
    expect(out.length / 2).toBeLessThanOrEqual(800 * 4 + 4);
  });

  it("preserves peaks (min and max per column)", () => {
    // 100 points squeezed into 1px column at x=5
    const xs: number[] = [];
    const ys: number[] = [];
    for (let i = 0; i < 100; i++) {
      xs.push(5);
      ys.push(i === 40 ? 999 : i === 70 ? -999 : i);
    }
    const out = decimateM4(xs, ys, 10);
    const ysOut: number[] = [];
    for (let i = 1; i < out.length; i += 2) ysOut.push(out[i] as number);
    expect(Math.max(...ysOut)).toBe(999);
    expect(Math.min(...ysOut)).toBe(-999);
    expect(ysOut[0]).toBe(0);
    expect(ysOut[ysOut.length - 1]).toBe(99);
  });

  it("empty input → empty output", () => {
    expect(decimateM4([], [], 100).length).toBe(0);
  });
});
