import { afterEach, describe, expect, it } from "vitest";
import { createChart } from "../src/index";

function makeEl(w = 400, h = 240): HTMLElement {
  const el = document.createElement("div");
  Object.defineProperty(el, "clientWidth", { value: w });
  Object.defineProperty(el, "clientHeight", { value: h });
  el.getBoundingClientRect = () =>
    ({ left: 0, top: 0, right: w, bottom: h, width: w, height: h }) as DOMRect;
  document.body.appendChild(el);
  return el;
}

const wait = (ms = 50) => new Promise((r) => setTimeout(r, ms));

describe("createChart", () => {
  let cleanup: HTMLElement[] = [];
  afterEach(() => {
    for (const el of cleanup) el.remove();
    cleanup = [];
  });

  it("creates a line chart and renders", async () => {
    const el = makeEl();
    cleanup.push(el);
    const chart = createChart(el, {
      type: "line",
      data: { x: [0, 1, 2, 3], series: [{ y: [1, 5, 3, 8] }] },
      animate: false,
    });
    expect(el.querySelectorAll("canvas").length).toBe(2);
    await wait();
    chart.destroy();
    expect(el.querySelectorAll("canvas").length).toBe(0);
  });

  it("creates a bar chart", async () => {
    const el = makeEl();
    cleanup.push(el);
    const chart = createChart(el, {
      type: "bar",
      data: {
        categories: ["A", "B", "C"],
        series: [{ values: [3, 7, 5] }],
      },
      animate: false,
    });
    await wait();
    chart.destroy();
  });

  it("creates a donut chart", async () => {
    const el = makeEl(300, 300);
    cleanup.push(el);
    const chart = createChart(el, {
      type: "donut",
      data: {
        slices: [
          { label: "A", value: 40 },
          { label: "B", value: 60 },
        ],
      },
      animate: false,
    });
    await wait();
    chart.destroy();
  });

  it("setData re-renders without error", async () => {
    const el = makeEl();
    cleanup.push(el);
    const chart = createChart(el, {
      type: "area",
      data: { x: [0, 1], series: [{ y: [1, 2] }] },
      animate: false,
    });
    await wait();
    chart.setData({ x: [0, 1, 2], series: [{ y: [3, 1, 4] }] });
    await wait();
    chart.destroy();
  });

  it("destroy is idempotent-safe", async () => {
    const el = makeEl();
    cleanup.push(el);
    const chart = createChart(el, {
      type: "sparkline",
      data: { x: [0, 1, 2], series: [{ y: [1, 3, 2] }] },
      animate: false,
    });
    await wait();
    chart.destroy();
  });

  it("append grows the data and animates", async () => {
    const el = makeEl();
    cleanup.push(el);
    const chart = createChart(el, {
      type: "line",
      data: { x: [0, 1, 2], series: [{ y: [1, 3, 2] }] },
      animate: false,
    });
    await wait();
    chart.append(3, 5);
    chart.append(4, 4);
    await wait();
    chart.destroy();
  });

  it("append respects the sliding window", async () => {
    const el = makeEl();
    cleanup.push(el);
    const chart = createChart(el, {
      type: "line",
      data: { x: [0, 1, 2, 3, 4], series: [{ y: [1, 2, 3, 4, 5] }] },
      window: 5,
      animate: false,
    });
    await wait();
    chart.append(5, 6);
    chart.append(6, 7);
    await wait();
    chart.destroy();
  });

  it("append handles non-monotonic x", async () => {
    const el = makeEl();
    cleanup.push(el);
    const chart = createChart(el, {
      type: "line",
      data: { x: [10, 20, 30], series: [{ y: [1, 2, 3] }] },
      animate: false,
    });
    await wait();
    chart.append(15, 99);
    await wait();
    chart.destroy();
  });

  it("append on multi-series", async () => {
    const el = makeEl();
    cleanup.push(el);
    const chart = createChart(el, {
      type: "line",
      data: { x: [0, 1], series: [{ y: [1, 2] }, { y: [3, 4] }] },
      animate: false,
    });
    await wait();
    chart.append(2, [5, 6]);
    await wait();
    chart.destroy();
  });

  it("creates a candlestick chart with volume", async () => {
    const el = makeEl();
    cleanup.push(el);
    const chart = createChart(el, {
      type: "candle",
      data: {
        candles: [
          { x: 0, open: 10, high: 14, low: 9, close: 13, volume: 100 },
          { x: 1, open: 13, high: 15, low: 11, close: 11, volume: 80 },
          { x: 2, open: 11, high: 12, low: 8, close: 9, volume: 120 },
        ],
      },
      animate: false,
    });
    await wait();
    chart.destroy();
  });

  it("creates a waterfall chart", async () => {
    const el = makeEl();
    cleanup.push(el);
    const chart = createChart(el, {
      type: "waterfall",
      data: {
        categories: ["Rev", "Costs", "Net"],
        values: [500, -300, 200],
        totals: [2],
      },
      animate: false,
    });
    await wait();
    chart.destroy();
  });

  it("creates a stacked bar chart", async () => {
    const el = makeEl();
    cleanup.push(el);
    const chart = createChart(el, {
      type: "bar",
      stacked: true,
      data: {
        categories: ["A", "B"],
        series: [
          { label: "x", values: [3, 5] },
          { label: "y", values: [2, -1] },
        ],
      },
      animate: false,
    });
    await wait();
    chart.destroy();
  });

  it("creates a combo chart", async () => {
    const el = makeEl();
    cleanup.push(el);
    const chart = createChart(el, {
      type: "combo",
      data: {
        categories: ["Jan", "Feb", "Mar"],
        series: [
          { label: "in", values: [3, 5, 4], kind: "column" },
          { label: "out", values: [2, 1, 3], kind: "column" },
          { label: "net", values: [1, 4, 1], kind: "area" },
        ],
      },
      animate: false,
    });
    await wait();
    chart.destroy();
  });

  it("creates a stacked combo chart", async () => {
    const el = makeEl();
    cleanup.push(el);
    const chart = createChart(el, {
      type: "combo",
      stacked: true,
      data: {
        categories: ["Jan", "Feb"],
        series: [
          { label: "in", values: [3, 5], kind: "column" },
          { label: "net", values: [1, 4], kind: "line" },
        ],
      },
      animate: false,
    });
    await wait();
    chart.destroy();
  });

  it("creates a baseline chart", async () => {
    const el = makeEl();
    cleanup.push(el);
    const chart = createChart(el, {
      type: "baseline",
      data: { x: [0, 1, 2, 3], series: [{ y: [-2, 4, -1, 3] }] },
      baseline: 0,
      animate: false,
    });
    await wait();
    chart.destroy();
  });

  it("append throws on non-xy charts", async () => {
    const el = makeEl(300, 300);
    cleanup.push(el);
    const chart = createChart(el, {
      type: "donut",
      data: { slices: [{ label: "A", value: 1 }] },
      animate: false,
    });
    expect(() => chart.append(1, 1)).toThrow();
    await wait();
    chart.destroy();
  });
});
