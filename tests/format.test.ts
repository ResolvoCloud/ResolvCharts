import { describe, expect, it } from "vitest";
import { formatNumber, formatSI } from "../src/core/format";

describe("formatSI", () => {
  it("abbreviates", () => {
    expect(formatSI(1500)).toBe("1.5k");
    expect(formatSI(2_500_000)).toBe("2.5M");
    expect(formatSI(3_000_000_000)).toBe("3B");
    expect(formatSI(120_000)).toBe("120k");
  });
  it("small numbers pass through", () => {
    expect(formatSI(42)).toBe("42");
    expect(formatSI(999)).toBe("999");
  });
  it("handles negatives and zero", () => {
    expect(formatSI(-1500)).toBe("-1.5k");
    expect(formatSI(0)).toBe("0");
  });
});

describe("formatNumber", () => {
  it("integers", () => {
    expect(formatNumber(7)).toBe("7");
  });
  it("floats round to 4 sig digits", () => {
    expect(formatNumber(1.23456)).toBe("1.235");
  });
  it("non-finite → empty", () => {
    expect(formatNumber(Number.NaN)).toBe("");
    expect(formatNumber(Infinity)).toBe("");
  });
});
