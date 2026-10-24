import { describe, expect, it } from "vitest";
import { splinePath, traceCurve } from "../src/charts/registry";

type Cmd = [string, ...number[]];

function recorder(): { path: CanvasPath; calls: Cmd[] } {
  const calls: Cmd[] = [];
  const path = {
    moveTo: (x: number, y: number) => calls.push(["m", x, y]),
    lineTo: (x: number, y: number) => calls.push(["l", x, y]),
    bezierCurveTo: (...a: number[]) => calls.push(["b", ...a]),
    closePath: () => calls.push(["z"]),
  } as unknown as CanvasPath;
  return { path, calls };
}

// interleaved [x, y] pixel pairs
const PTS = [0, 0, 10, 10, 20, 0, 30, 10];

describe("splinePath", () => {
  it("anchors every segment at the data points", () => {
    const { path, calls } = recorder();
    splinePath(path, PTS, 4, 0.4);
    expect(calls[0]).toEqual(["m", 0, 0]);
    const segs = calls.slice(1);
    expect(segs.every((c) => c[0] === "b")).toBe(true);
    for (let i = 0; i < 3; i++) {
      expect(segs[i]?.[5]).toBe(PTS[2 * (i + 1)]);
      expect(segs[i]?.[6]).toBe(PTS[2 * (i + 1) + 1]);
    }
  });

  it("tension 0 degenerates to straight-line control points", () => {
    const { path, calls } = recorder();
    splinePath(path, PTS, 4, 0);
    for (const c of calls.slice(1)) {
      // cp1 equals the segment start, cp2 equals the segment end
      const i = calls.indexOf(c) - 1;
      expect(c[1]).toBe(PTS[2 * i]);
      expect(c[2]).toBe(PTS[2 * i + 1]);
      expect(c[3]).toBe(PTS[2 * (i + 1)]);
      expect(c[4]).toBe(PTS[2 * (i + 1) + 1]);
    }
  });

  it("first control point leaves p0 at tension fraction toward p1", () => {
    const { path, calls } = recorder();
    splinePath(path, PTS, 4, 0.5);
    const [, c1x, c1y] = calls[1] as Cmd;
    // s12 = 1 at the open start: cp2 = p0 + t * (p1 - p0)
    expect(c1x).toBeCloseTo(0 + 0.5 * 10);
    expect(c1y).toBeCloseTo(0 + 0.5 * 10);
  });

  it("falls back to lineTo for fewer than 3 points", () => {
    const { path, calls } = recorder();
    splinePath(path, PTS, 2, 0.4);
    expect(calls).toEqual([
      ["m", 0, 0],
      ["l", 10, 10],
    ]);
  });
});

describe('traceCurve "cubic"', () => {
  it("emits beziers through traceCurve and honors connect", () => {
    const { path, calls } = recorder();
    traceCurve(path, PTS, 4, "cubic", true, 0.4);
    expect(calls[0]).toEqual(["l", 0, 0]); // connect → lineTo, not moveTo
    expect(calls.filter((c) => c[0] === "b")).toHaveLength(3);
  });
});
