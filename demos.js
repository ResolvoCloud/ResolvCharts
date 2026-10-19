// Live demos for the docs "Examples" page.
// Each entry mounts into a <div data-demo="<name>"> element.
// Seeded RNG keeps every render stable across reloads.
window.demos = (() => {
  const mulberry32 = (seed) => () => {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  const rnd = mulberry32(42);
  const n = 200;
  const x = Array.from({ length: n }, (_, i) => i);
  const wave = (base, amp, f) =>
    x.map((i) => base + amp * Math.sin(i / f) + rnd() * 6);
  const fmtClock = (v) => new Date(v * 1000).toLocaleTimeString();
  const mk = (el, opts) => window.ResolvCharts.createChart(el, opts);

  return {
    // Ops monitoring
    cpu(el) {
      const win = 60;
      const xs = [];
      const ys = [];
      const now = Math.floor(Date.now() / 1000);
      let v = 40;
      for (let i = win; i > 0; i--) {
        xs.push(now - i);
        v = Math.min(95, Math.max(5, v + (rnd() - 0.5) * 8));
        ys.push(v);
      }
      const c = mk(el, {
        type: "line",
        curve: "smooth",
        flow: true,
        window: win,
        labels: { x: fmtClock, y: (v2) => `${Math.round(v2)}%` },
        data: { x: xs, series: [{ label: "CPU", y: ys }] },
      });
      setInterval(() => {
        v = Math.min(95, Math.max(5, v + (rnd() - 0.5) * 8));
        c.append(Math.floor(Date.now() / 1000), v);
      }, 1000);
    },
    mem(el) {
      mk(el, {
        type: "area",
        curve: "smooth",
        accent: "#8e4ec6",
        labels: { y: (v) => `${v.toFixed(0)} GB` },
        data: { x, series: [{ label: "RAM", y: wave(9, 3, 40) }] },
      });
    },
    services(el) {
      mk(el, {
        type: "line",
        data: {
          x,
          series: [
            { label: "api", y: wave(50, 25, 12) },
            { label: "web", y: wave(40, 20, 15) },
          ],
        },
      });
    },

    // Finance
    candles(el) {
      let c = 100;
      const candles = x.slice(0, 60).map((i) => {
        const o = c;
        c += (rnd() - 0.48) * 8;
        const cl = c;
        return {
          x: i,
          open: o,
          high: Math.max(o, cl) + rnd() * 4,
          low: Math.min(o, cl) - rnd() * 4,
          close: cl,
          volume: 200 + rnd() * 800,
        };
      });
      mk(el, { type: "candle", data: { candles } });
    },
    delta(el) {
      mk(el, {
        type: "baseline",
        baseline: 0,
        data: { x, series: [{ y: wave(0, 30, 12) }] },
      });
    },

    // Product analytics
    signup(el) {
      mk(el, {
        type: "funnel",
        data: {
          categories: ["Visit", "Signup", "Activate", "Trial", "Paid"],
          series: [{ label: "Users", values: [8400, 3200, 1400, 620, 280] }],
        },
      });
    },
    traffic(el) {
      mk(el, {
        type: "pie",
        data: {
          slices: [
            { label: "Organic", value: 42 },
            { label: "Direct", value: 24 },
            { label: "Referral", value: 18 },
            { label: "Social", value: 10 },
            { label: "Ads", value: 6 },
          ],
        },
      });
    },
    cohorts(el) {
      mk(el, {
        type: "bar",
        data: {
          categories: ["W1", "W2", "W3", "W4", "W5", "W6"],
          series: [{ label: "Retention %", values: [100, 62, 48, 39, 34, 31] }],
        },
      });
    },

    // Business
    cashflow(el) {
      mk(el, {
        type: "combo",
        data: {
          categories: ["Jan", "Feb", "Mar", "Apr", "May", "Jun"],
          series: [
            { label: "Inflow", values: [42, 55, 48, 61, 57, 70], kind: "column" },
            { label: "Outflow", values: [30, 41, 37, 45, 52, 49], kind: "column" },
            { label: "Net", values: [12, 14, 11, 16, 5, 21], kind: "area" },
          ],
        },
      });
    },
    pnl(el) {
      mk(el, {
        type: "waterfall",
        data: {
          categories: ["Revenue", "COGS", "Gross", "Opex", "Tax", "Net"],
          values: [500, -180, 320, -140, -45, 135],
          totals: [2, 5],
        },
      });
    },

    // Scientific / comparison
    tempRange(el) {
      const lo = wave(12, 6, 30);
      const hi = wave(21, 7, 30);
      mk(el, {
        type: "rangearea",
        curve: "smooth",
        labels: { y: (v) => `${v.toFixed(0)}°` },
        data: { x, series: [{ label: "Temp", y: lo, y2: hi }] },
      });
    },
    models(el) {
      mk(el, {
        type: "radar",
        data: {
          categories: ["Speed", "Power", "Range", "Weight", "Cost", "Safety"],
          series: [
            { label: "Model A", values: [8, 6, 7, 5, 9, 7] },
            { label: "Model B", values: [5, 8, 6, 7, 4, 8] },
          ],
        },
      });
    },
    clusters(el) {
      mk(el, {
        type: "bubble",
        data: {
          x: x.slice(0, 60),
          series: [
            {
              label: "A",
              y: wave(50, 20, 9).slice(0, 60),
              r: wave(4, 8, 7).slice(0, 60).map((v) => Math.max(2, v)),
            },
            {
              label: "B",
              y: wave(40, 18, 11).slice(0, 60),
              r: wave(4, 8, 8).slice(0, 60).map((v) => Math.max(2, v)),
            },
          ],
        },
      });
    },
    kpi(el) {
      mk(el, {
        type: "sparkline",
        data: { x, series: [{ y: wave(60, 18, 14) }] },
      });
    },
  };
})();

// auto-mount: every <div data-demo="name"> on the page gets its chart
const mountDemos = () => {
  for (const el of document.querySelectorAll(".chart-demo")) {
    const fn = window.demos?.[el.dataset.demo];
    if (fn) fn(el);
  }
};
if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", mountDemos);
} else {
  mountDemos();
}
