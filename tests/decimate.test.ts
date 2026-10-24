import { describe, expect, it } from "vitest";
import {
  decimateM4,
  decimateSeriesPx,
  mapSeriesPx,
} from "../src/core/decimate";
import { linearScale, logScale } from "../src/core/scales";

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

describe("decimateSeriesPx / mapSeriesPx pre-transformed log inputs", () => {
  const n = 20_000;
  const invL = 1 / Math.log(10);
  const xs = new Float64Array(n);
  const xsRaw = new Float64Array(n);
  const xsL = new Float64Array(n);
  const y = new Float64Array(n);
  const yL = new Float64Array(n);
  const gapIdx: number[] = [];
  for (let i = 0; i < n; i++) {
    xs[i] = i;
    xsRaw[i] = i + 1;
    xsL[i] = Math.log(i + 1) * invL;
    const gap = i % 977 === 0;
    y[i] = gap ? NaN : 1 + 400 * Math.abs(Math.sin(i / 300));
    yL[i] = Number.isFinite(y[i]) ? Math.log(y[i] as number) * invL : NaN;
    if (gap) gapIdx.push(i);
  }
  const xS = linearScale(0, n - 1, 0, 800);
  const ySL = logScale(1, 200, 200, 0);
  const xSL = logScale(1, n, 0, 800);
  const yS = linearScale(0, 100, 200, 0);

  const eq = (a: Float32Array, b: Float32Array): void => {
    expect(a.length).toBe(b.length);
    for (let i = 0; i < a.length; i++) {
      const av = a[i] as number;
      const bv = b[i] as number;
      if (Number.isNaN(av) && Number.isNaN(bv)) continue;
      expect(Math.abs(av - bv)).toBeLessThan(1e-4);
    }
  };

  it("log-y: pre-transformed array emits identical pixels", () => {
    eq(
      decimateSeriesPx(
        xs,
        y,
        null,
        1,
        0,
        xS,
        ySL,
        800,
        0,
        { y: 10 },
        true,
        gapIdx,
      ),
      decimateSeriesPx(
        xs,
        yL,
        null,
        1,
        0,
        xS,
        ySL,
        800,
        0,
        { y: 10 },
        true,
        gapIdx,
        { y: true },
      ),
    );
  });

  it("log-x: pre-transformed array emits identical pixels", () => {
    eq(
      decimateSeriesPx(
        xsRaw,
        y,
        null,
        1,
        0,
        xSL,
        yS,
        800,
        0,
        { x: 10 },
        true,
        gapIdx,
      ),
      decimateSeriesPx(
        xsL,
        y,
        null,
        1,
        0,
        xSL,
        yS,
        800,
        0,
        { x: 10 },
        true,
        gapIdx,
        { x: true },
      ),
    );
  });

  it("mapSeriesPx log-y: pre-transformed array emits identical pixels", () => {
    eq(
      mapSeriesPx(xs, y, null, 1, 0, xS, ySL, 0, { y: 10 }, true),
      mapSeriesPx(xs, yL, null, 1, 0, xS, ySL, 0, { y: 10 }, true, { y: true }),
    );
  });
});
