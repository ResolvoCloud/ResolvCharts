/**
 * Example registry — one entry per card on the demo page.
 *
 * Entry shape:
 *   group:    section heading
 *   title:    card title
 *   dark:     card sits on a dark background (for theme:"dark" examples)
 *   compact:  narrow/short card (sparkline)
 *   options:  (shared) => ChartOptions — the createChart() config
 *   live:     (chart, shared) => cleanup? — optional streaming/ticker hook
 *
 * `shared` = deterministic demo datasets (seeded RNG — stable across reloads).
 * Global theme/renderer toggles are merged into `options` at mount; an
 * explicit `theme`/`renderer` in `options` wins.
 */

// ---------- deterministic helpers ----------

export function mulberry32(seed) {
  return () => {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
export const fmtClock = (v) => new Date(v * 1000).toLocaleTimeString();

export function makeShared() {
  const r1 = mulberry32(7);
  const n = 200;
  const x = Array.from({ length: n }, (_, i) => i);
  const y1 = x.map((i) => 50 + 30 * Math.sin(i / 12) + r1() * 10);
  const y2 = x.map((i) => 40 + 25 * Math.cos(i / 15) + r1() * 10);

  let c = 100;
  const candles = x.slice(0, 60).map((i) => {
    const o = c;
    c += (r1() - 0.48) * 8;
    const cl = c;
    return {
      x: i,
      open: o,
      high: Math.max(o, cl) + r1() * 4,
      low: Math.min(o, cl) - r1() * 4,
      close: cl,
      volume: 200 + r1() * 800,
    };
  });

  const seedWindow = (count, initial) => {
    const xs = [];
    const ys = [];
    const now = Math.floor(Date.now() / 1000);
    let v = initial;
    for (let i = count - 1; i >= 0; i--) {
      xs.push(now - i * 2);
      ys.push(v);
      v += (r1() - 0.5) * 8;
    }
    return { xs, ys };
  };

  const now = Math.floor(Date.now() / 1000);
  const netCats = [];
  const netDown = [];
  const netUp = [];
  for (let i = 19; i >= 0; i--) {
    netCats.push(new Date((now - i * 2) * 1000).toLocaleTimeString());
    netDown.push(40 + r1() * 120);
    netUp.push(10 + r1() * 40);
  }

  return {
    x,
    y1,
    y2,
    candles,
    seedWindow,
    net: { cats: netCats, down: netDown, up: netUp },
  };
}

// ---------- registry ----------

export const examples = [
  // XY charts
  {
    group: "XY",
    title: "Line",
    options: (d) => ({
      type: "line",
      data: {
        x: d.x,
        series: [
          { label: "A", y: d.y1 },
          { label: "B", y: d.y2 },
        ],
      },
    }),
  },
  {
    group: "XY",
    title: "Area (pinned dark theme)",
    dark: true,
    options: (d) => ({
      type: "area",
      theme: "dark",
      data: { x: d.x, series: [{ label: "Traffic", y: d.y1 }] },
    }),
  },
  {
    group: "XY",
    title: "Scatter",
    options: (d) => ({
      type: "scatter",
      data: {
        x: d.x.slice(0, 80),
        series: [{ label: "pts", y: d.y2.slice(0, 80) }],
      },
    }),
  },
  {
    group: "XY",
    title: "Bubble",
    options: (d) => ({
      type: "bubble",
      data: {
        x: d.x.slice(0, 60),
        series: [
          {
            label: "A",
            y: d.y1.slice(0, 60),
            r: d.y1.slice(0, 60).map((v) => 4 + (v % 16)),
          },
          {
            label: "B",
            y: d.y2.slice(0, 60),
            r: d.y2.slice(0, 60).map((v) => 4 + (v % 16)),
          },
        ],
      },
    }),
  },
  {
    group: "XY",
    title: "Range area (min–max band)",
    options: (d) => ({
      type: "rangearea",
      curve: "smooth",
      data: {
        x: d.x,
        series: [
          {
            label: "Temp",
            y: d.y1.map((v) => v - 8),
            y2: d.y1.map((v) => v + 8),
          },
        ],
      },
    }),
  },
  {
    group: "XY",
    title: "Baseline delta (vs. open)",
    options: (d) => ({
      type: "baseline",
      baseline: 0,
      data: { x: d.x, series: [{ y: d.y1.map((v) => v - 55) }] },
    }),
  },
  {
    group: "XY",
    title: "Sparkline",
    compact: true,
    options: (d) => ({
      type: "sparkline",
      data: { x: d.x, series: [{ y: d.y2 }] },
    }),
  },

  // Categorical
  {
    group: "Categorical",
    title: "Bar",
    options: () => ({
      type: "bar",
      data: {
        categories: ["Q1", "Q2", "Q3", "Q4", "Q5", "Q6"],
        series: [{ label: "Sales", values: [42, 67, 55, 89, 73, 95] }],
      },
    }),
  },
  {
    group: "Categorical",
    title: "Stacked bar (negative values below zero)",
    options: () => ({
      type: "bar",
      stacked: true,
      data: {
        categories: ["Q1", "Q2", "Q3", "Q4"],
        series: [
          { label: "Product", values: [30, 42, 38, 51] },
          { label: "Services", values: [20, 25, 28, 30] },
          { label: "Other", values: [8, 12, -6, 9] },
        ],
      },
    }),
  },
  {
    group: "Categorical",
    title: "Combo — cash flow (columns + area)",
    options: () => ({
      type: "combo",
      data: {
        categories: ["Jan", "Feb", "Mar", "Apr", "May", "Jun"],
        series: [
          { label: "Inflow", values: [42, 55, 48, 61, 57, 70], kind: "column" },
          {
            label: "Outflow",
            values: [30, 41, 37, 45, 52, 49],
            kind: "column",
          },
          { label: "Net", values: [12, 14, 11, 16, 5, 21], kind: "area" },
        ],
      },
    }),
  },
  {
    group: "Categorical",
    title: "Waterfall (P&L bridge)",
    options: () => ({
      type: "waterfall",
      data: {
        categories: ["Revenue", "COGS", "Gross", "Opex", "Tax", "Net"],
        values: [500, -180, 320, -140, -45, 135],
        totals: [2, 5],
      },
    }),
  },
  {
    group: "Categorical",
    title: "Donut",
    compact: true,
    options: () => ({
      type: "donut",
      data: {
        slices: [
          { label: "Search", value: 45 },
          { label: "Direct", value: 25 },
          { label: "Referral", value: 20 },
          { label: "Social", value: 10 },
        ],
      },
    }),
  },
  {
    group: "Categorical",
    title: "Pie",
    compact: true,
    options: () => ({
      type: "pie",
      data: {
        slices: [
          { label: "Search", value: 45 },
          { label: "Direct", value: 25 },
          { label: "Referral", value: 20 },
          { label: "Social", value: 10 },
        ],
      },
    }),
  },
  {
    group: "Categorical",
    title: "Funnel (signup flow)",
    options: () => ({
      type: "funnel",
      data: {
        categories: ["Visit", "Signup", "Trial", "Paid"],
        series: [{ label: "Users", values: [4200, 1800, 620, 240] }],
      },
    }),
  },
  {
    group: "Categorical",
    title: "Radar",
    options: () => ({
      type: "radar",
      data: {
        categories: ["Speed", "Power", "Range", "Weight", "Cost", "Safety"],
        series: [
          { label: "Model A", values: [8, 6, 7, 5, 9, 7] },
          { label: "Model B", values: [5, 8, 6, 7, 4, 8] },
        ],
      },
    }),
  },

  // Financial
  {
    group: "Financial",
    title: "Candlestick + volume",
    options: (d) => ({
      type: "candle",
      data: { candles: d.candles },
    }),
  },

  // Live
  {
    group: "Live",
    title: "Stream — new point every 100ms, window = 120",
    options: (d) => ({
      type: "line",
      window: 120,
      data: {
        x: d.x.slice(0, 60),
        series: [{ label: "live", y: d.y1.slice(0, 60) }],
      },
    }),
    live: (chart) => {
      let t = 60;
      const id = setInterval(() => {
        chart.append(t, 50 + 30 * Math.sin(t / 12) + Math.random() * 10);
        t++;
      }, 100);
      return () => clearInterval(id);
    },
  },
  {
    group: "Live",
    title: "CPU usage — every 2s, smooth + flow",
    options: (d) => {
      const seed = d.seedWindow(30, 38);
      return {
        type: "line",
        curve: "smooth",
        flow: true,
        window: 30,
        labels: { x: fmtClock, y: (v) => `${Math.round(v)}%` },
        data: { x: seed.xs, series: [{ label: "CPU", y: seed.ys }] },
      };
    },
    live: (chart) => {
      let cpu = 38;
      const id = setInterval(() => {
        cpu =
          Math.random() < 0.1
            ? clamp(cpu + 25 + Math.random() * 30, 3, 98)
            : clamp(cpu + (Math.random() - 0.52) * 10, 3, 98);
        chart.append(Math.floor(Date.now() / 1000), cpu);
      }, 2000);
      return () => clearInterval(id);
    },
  },
  {
    group: "Live",
    title: "RAM usage — every 2s, dark + accent",
    dark: true,
    options: (d) => {
      const seed = d.seedWindow(30, 9.4);
      return {
        type: "area",
        theme: "dark",
        accent: "#8e4ec6",
        curve: "smooth",
        flow: true,
        maxPoints: 40,
        labels: { x: fmtClock, y: (v) => `${v.toFixed(1)} GB` },
        data: { x: seed.xs, series: [{ label: "RAM", y: seed.ys }] },
      };
    },
    live: (chart) => {
      let ram = 9.4;
      const id = setInterval(() => {
        ram = clamp(
          ram + (10 - ram) * 0.05 + (Math.random() - 0.5) * 0.6,
          2,
          15.6,
        );
        chart.append(Math.floor(Date.now() / 1000), ram);
      }, 2000);
      return () => clearInterval(id);
    },
  },
  {
    group: "Live",
    title: "Network — sliding stacked bars via setData",
    options: (d) => ({
      type: "bar",
      stacked: true,
      labels: { y: (v) => `${Math.round(v)} Mbps` },
      data: {
        categories: d.net.cats,
        series: [
          { label: "Down", values: d.net.down, color: "#0070f3" },
          { label: "Up", values: d.net.up, color: "#f5a623" },
        ],
      },
    }),
    live: (chart, d) => {
      const { cats, down, up } = d.net;
      const id = setInterval(() => {
        cats.push(new Date(Date.now()).toLocaleTimeString());
        down.push(40 + Math.random() * 120);
        up.push(10 + Math.random() * 40);
        cats.shift();
        down.shift();
        up.shift();
        chart.setData({
          categories: [...cats],
          series: [
            { label: "Down", values: [...down], color: "#0070f3" },
            { label: "Up", values: [...up], color: "#f5a623" },
          ],
        });
      }, 2000);
      return () => clearInterval(id);
    },
  },
];
