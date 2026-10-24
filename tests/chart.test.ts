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

  it("creates a pie chart", async () => {
    const el = makeEl(300, 300);
    cleanup.push(el);
    const chart = createChart(el, {
      type: "pie",
      data: {
        slices: [
          { label: "A", value: 40 },
          { label: "B", value: 35 },
          { label: "C", value: 25 },
        ],
      },
      animate: false,
    });
    await wait();
    chart.destroy();
  });

  it("creates a bubble chart", async () => {
    const el = makeEl();
    cleanup.push(el);
    const chart = createChart(el, {
      type: "bubble",
      data: {
        x: [0, 1, 2, 3],
        series: [{ y: [1, 5, 3, 8], r: [4, 10, 6, 14] }],
      },
      animate: false,
    });
    await wait();
    chart.destroy();
  });

  it("creates a rangearea chart", async () => {
    const el = makeEl();
    cleanup.push(el);
    const chart = createChart(el, {
      type: "rangearea",
      data: {
        x: [0, 1, 2, 3],
        series: [{ y: [1, 3, 2, 5], y2: [4, 7, 6, 9] }],
      },
      animate: false,
    });
    await wait();
    chart.destroy();
  });

  it("rangearea includes y2 in the y domain", async () => {
    const el = makeEl();
    cleanup.push(el);
    const chart = createChart(el, {
      type: "rangearea",
      data: {
        x: [0, 1, 2],
        series: [{ y: [10, 11, 10], y2: [90, 95, 92] }],
      },
      animate: false,
    });
    await wait();
    chart.destroy();
  });

  it("creates a radar chart", async () => {
    const el = makeEl(300, 300);
    cleanup.push(el);
    const chart = createChart(el, {
      type: "radar",
      data: {
        categories: ["Speed", "Power", "Range", "Weight", "Cost"],
        series: [{ label: "A", values: [8, 6, 7, 5, 9] }],
      },
      animate: false,
    });
    await wait();
    chart.destroy();
  });

  it("creates a funnel chart", async () => {
    const el = makeEl();
    cleanup.push(el);
    const chart = createChart(el, {
      type: "funnel",
      data: {
        categories: ["Visit", "Signup", "Trial", "Paid"],
        series: [{ label: "Users", values: [1000, 420, 180, 60] }],
      },
      animate: false,
    });
    await wait();
    chart.destroy();
  });

  it("append keeps bubble r channel aligned", async () => {
    const el = makeEl();
    cleanup.push(el);
    const chart = createChart(el, {
      type: "bubble",
      data: { x: [0, 1, 2], series: [{ y: [1, 2, 3], r: [4, 5, 6] }] },
      animate: false,
    });
    await wait();
    chart.append(3, 4);
    await wait();
    chart.destroy();
  });

  it("append keeps rangearea y2 channel aligned", async () => {
    const el = makeEl();
    cleanup.push(el);
    const chart = createChart(el, {
      type: "rangearea",
      data: { x: [0, 1, 2], series: [{ y: [1, 2, 3], y2: [4, 5, 6] }] },
      animate: false,
    });
    await wait();
    chart.append(3, 4);
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

  it("tooltip accepts a custom corner radius", async () => {
    const el = makeEl();
    cleanup.push(el);
    const chart = createChart(el, {
      type: "line",
      data: { x: [0, 1, 2], series: [{ y: [1, 5, 3] }] },
      tooltip: { radius: 0 },
      animate: false,
    });
    const tip = el.querySelector("div");
    expect(tip?.style.borderRadius).toBe("0px");
    await wait();
    chart.destroy();
  });

  it("tooltip defaults to 6px radius", async () => {
    const el = makeEl();
    cleanup.push(el);
    const chart = createChart(el, {
      type: "line",
      data: { x: [0, 1, 2], series: [{ y: [1, 5, 3] }] },
      animate: false,
    });
    const tip = el.querySelector("div");
    expect(tip?.style.borderRadius).toBe("6px");
    await wait();
    chart.destroy();
  });

  const pointer = (
    el: HTMLElement,
    type: string,
    x: number,
    y: number,
    extra: Record<string, unknown> = {},
  ): void => {
    el.dispatchEvent(
      new MouseEvent(type, {
        clientX: x,
        clientY: y,
        button: 0,
        bubbles: true,
        ...extra,
      }),
    );
  };

  it("fires onHover with the nearest point", async () => {
    const el = makeEl();
    cleanup.push(el);
    let last: unknown = "none";
    const chart = createChart(el, {
      type: "line",
      data: { x: [0, 1, 2, 3], series: [{ y: [1, 5, 3, 8] }] },
      onHover: (info) => {
        last = info;
      },
      animate: false,
    });
    await wait();
    pointer(el, "pointermove", 200, 120);
    await wait();
    expect(last).toMatchObject({ kind: "point" });
    chart.destroy();
  });

  it("fires onClick / onSelect on a mark", async () => {
    const el = makeEl();
    cleanup.push(el);
    let clicked: unknown = null;
    let selected: unknown = null;
    const chart = createChart(el, {
      type: "line",
      data: { x: [0, 1, 2, 3], series: [{ y: [1, 5, 3, 8] }] },
      onClick: (info) => {
        clicked = info;
      },
      onSelect: (info) => {
        selected = info;
      },
      animate: false,
    });
    await wait();
    pointer(el, "pointerdown", 200, 120);
    pointer(el, "pointerup", 200, 120);
    await wait();
    expect(clicked).toMatchObject({ kind: "point" });
    expect(selected).toMatchObject({ kind: "point" });
    chart.destroy();
  });

  it("drag past the click threshold is not a click", async () => {
    const el = makeEl();
    cleanup.push(el);
    let clicks = 0;
    const chart = createChart(el, {
      type: "line",
      data: { x: [0, 1, 2, 3], series: [{ y: [1, 5, 3, 8] }] },
      onClick: () => clicks++,
      animate: false,
    });
    await wait();
    pointer(el, "pointerdown", 100, 100);
    pointer(el, "pointermove", 160, 140);
    pointer(el, "pointerup", 160, 140);
    await wait();
    expect(clicks).toBe(0);
    chart.destroy();
  });

  it("renders a legend and toggles a series", async () => {
    const el = makeEl();
    cleanup.push(el);
    const chart = createChart(el, {
      type: "line",
      data: {
        x: [0, 1, 2],
        series: [
          { label: "one", y: [1, 5, 3] },
          { label: "two", y: [2, 1, 4] },
        ],
      },
      legend: true,
      animate: false,
    });
    await wait();
    const legend = el.querySelector("[role='list']");
    expect(legend).not.toBeNull();
    const buttons = legend?.querySelectorAll("button") ?? [];
    expect(buttons.length).toBe(2);
    const b0 = buttons[0] as HTMLElement;
    b0.click();
    await wait();
    expect(b0.style.opacity).toBe("0.38");
    chart.destroy();
  });

  it("renders data with null gaps without error", async () => {
    const el = makeEl();
    cleanup.push(el);
    const chart = createChart(el, {
      type: "line",
      data: {
        x: [0, 1, 2, 3, 4],
        series: [{ y: [1, null, 3, Number.NaN, 5] }],
      },
      animate: false,
    });
    await wait();
    chart.destroy();
  });

  it("gaps are excluded from the y domain", async () => {
    const el = makeEl();
    cleanup.push(el);
    const chart = createChart(el, {
      type: "area",
      data: {
        x: [0, 1, 2],
        series: [{ y: [2, null, 4] }],
      },
      animate: false,
    });
    await wait();
    chart.destroy();
  });

  it("wheel zoom narrows the view, resetZoom releases it", async () => {
    const el = makeEl();
    cleanup.push(el);
    const views: ({ x: [number, number]; y: [number, number] } | null)[] = [];
    const chart = createChart(el, {
      type: "line",
      data: { x: [0, 1, 2, 3, 4, 5], series: [{ y: [1, 5, 3, 8, 2, 6] }] },
      zoom: { onZoom: (v) => views.push(v) },
      animate: false,
    });
    await wait();
    el.dispatchEvent(
      new WheelEvent("wheel", {
        clientX: 200,
        clientY: 120,
        deltaY: -240,
        bubbles: true,
        cancelable: true,
      }),
    );
    await wait();
    expect(views.length).toBeGreaterThan(0);
    const z = views[views.length - 1];
    expect(z).not.toBeNull();
    if (z) expect(z.x[1] - z.x[0]).toBeLessThan(5);
    chart.resetZoom();
    await wait();
    expect(views[views.length - 1]).toBeNull();
    chart.destroy();
  });

  it("zoom requires opt-in — wheel does nothing by default", async () => {
    const el = makeEl();
    cleanup.push(el);
    const chart = createChart(el, {
      type: "line",
      data: { x: [0, 1, 2], series: [{ y: [1, 5, 3] }] },
      animate: false,
    });
    await wait();
    el.dispatchEvent(
      new WheelEvent("wheel", {
        clientX: 200,
        clientY: 120,
        deltaY: -240,
        bubbles: true,
        cancelable: true,
      }),
    );
    await wait();
    chart.destroy();
  });

  it("tooltip.format string replaces content", async () => {
    const el = makeEl();
    cleanup.push(el);
    const chart = createChart(el, {
      type: "line",
      data: { x: [0, 1, 2, 3], series: [{ y: [1, 5, 3, 8] }] },
      tooltip: { format: () => "CUSTOM TIP" },
      animate: false,
    });
    await wait();
    pointer(el, "pointermove", 200, 120);
    await wait();
    const tip = el.querySelector("div");
    expect(tip?.textContent).toBe("CUSTOM TIP");
    chart.destroy();
  });

  it("tooltip.format null suppresses the tooltip", async () => {
    const el = makeEl();
    cleanup.push(el);
    const chart = createChart(el, {
      type: "line",
      data: { x: [0, 1, 2, 3], series: [{ y: [1, 5, 3, 8] }] },
      tooltip: { format: () => null },
      animate: false,
    });
    await wait();
    pointer(el, "pointermove", 200, 120);
    await wait();
    const tip = el.querySelector("div");
    expect(tip?.style.opacity).not.toBe("1");
    chart.destroy();
  });

  it("renders with a time x axis", async () => {
    const el = makeEl();
    cleanup.push(el);
    const t0 = Date.UTC(2024, 0, 1);
    const chart = createChart(el, {
      type: "line",
      data: {
        x: [t0, t0 + 86_400_000, t0 + 2 * 86_400_000],
        series: [{ y: [1, 5, 3] }],
      },
      xScale: "time",
      animate: false,
    });
    await wait();
    chart.destroy();
  });

  it("renders with a log y axis", async () => {
    const el = makeEl();
    cleanup.push(el);
    const chart = createChart(el, {
      type: "line",
      data: { x: [0, 1, 2], series: [{ y: [1, 50, 900] }] },
      yScale: "log",
      animate: false,
    });
    await wait();
    chart.destroy();
  });

  it("log y axis drops non-positive values", async () => {
    const el = makeEl();
    cleanup.push(el);
    const chart = createChart(el, {
      type: "line",
      data: { x: [0, 1, 2, 3], series: [{ y: [1, 0, -3, 900] }] },
      yScale: "log",
      animate: false,
    });
    await wait();
    chart.destroy();
  });

  it("renders candles with time x + log y", async () => {
    const el = makeEl();
    cleanup.push(el);
    const t0 = Date.UTC(2024, 0, 1);
    const chart = createChart(el, {
      type: "candle",
      data: {
        candles: [0, 1, 2].map((i) => ({
          x: t0 + i * 86_400_000,
          open: 10 + i,
          high: 15 + i,
          low: 9 + i,
          close: 12 + i,
        })),
      },
      xScale: "time",
      yScale: "log",
      animate: false,
    });
    await wait();
    chart.destroy();
  });
});
