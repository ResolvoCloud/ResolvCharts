# resolvcharts

[![npm](https://img.shields.io/npm/v/resolvcharts)](https://www.npmjs.com/package/resolvcharts)
[![license](https://img.shields.io/npm/l/resolvcharts)](./LICENSE)

A minimal, zero-dependency charting library. Small API, super fast rendering.

At [Resolvo Cloud](https://resolvocloud.com), we experienced glitchy live charts, bloated libraries and just overcomplicated processes for something as simple as charting, so we made ResolvCharts to Resolve that issue.

The result? A Lightweight library, with our benchmarks showing over 30x faster rendering than alternative charting solutions we've explored.

## Install

```sh
npm install resolvcharts
```

Or drop in the CDN build (exposes a global `ResolvCharts`):

```html
<script src="https://unpkg.com/resolvcharts/dist/resolvcharts.global.min.js"></script>
```

## Quick start

```ts
import { createChart } from "resolvcharts";

const chart = createChart(document.querySelector("#chart")!, {
  type: "line",
  data: {
    x: [0, 1, 2, 3, 4],
    series: [{ label: "Revenue", y: [12, 19, 14, 27, 22] }],
  },
});
```

## Chart types

The `data` shape depends on `type` — pick the row you need:

| `type` | `data` shape | Use case |
|---|---|---|
| `line` | `{ x, series: [{ y }] }` | Trends over an x axis |
| `area` | `{ x, series: [{ y }] }` | Line + filled gradient |
| `baseline` | `{ x, series: [{ y }] }` | Delta vs a reference value |
| `sparkline` | `{ x, series: [{ y }] }` | Tiny inline chart, no axes |
| `scatter` | `{ x, series: [{ y }] }` | Point clouds |
| `bubble` | `{ x, series: [{ y, r }] }` | Scatter + radius channel |
| `rangearea` | `{ x, series: [{ y, y2 }] }` | Min–max band, confidence intervals |
| `bar` | `{ categories, series: [{ values }] }` | Categorical groups; `stacked` supported |
| `combo` | `{ categories, series: [{ values, kind }] }` | Columns + line/area overlay |
| `radar` | `{ categories, series: [{ values }] }` | Multi-axis polygon comparison |
| `funnel` | `{ categories, series: [{ values }] }` | Stage drop-off (first series) |
| `donut` | `{ slices: [{ label, value }] }` | Share of a total |
| `pie` | `{ slices: [{ label, value }] }` | Donut without the hole |
| `candle` / `ohlc` | `{ candles: [{ x, open, high, low, close, volume? }] }` | Financial OHLC (+ volume band) |
| `waterfall` | `{ categories, values, totals? }` | P&L bridges, signed deltas |

## Examples

```ts
// Bar
createChart(el, {
  type: "bar",
  data: { categories: ["Q1", "Q2", "Q3"], series: [{ label: "Sales", values: [4, 7, 5] }] },
});

// Stacked bar (negative values stack below zero)
createChart(el, {
  type: "bar", stacked: true,
  data: { categories: ["Q1", "Q2"], series: [{ label: "A", values: [3, 5] }, { label: "B", values: [2, -1] }] },
});

// Combo — per-series `kind`: "column" (default), "line", or "area".
// Columns group per category; line/area series overlay on category centers.
createChart(el, {
  type: "combo",
  data: {
    categories: ["Jan", "Feb", "Mar"],
    series: [
      { label: "Inflow",  values: [42, 55, 48], kind: "column" },
      { label: "Outflow", values: [30, 41, 37], kind: "column" },
      { label: "Net",     values: [12, 14, 11], kind: "area" },
    ],
  },
});

// Candlestick (+ optional volume band); "ohlc" renders bar-style
createChart(el, {
  type: "candle",
  data: { candles: [{ x: 0, open: 100, high: 108, low: 98, close: 105, volume: 1200 }] },
});

// Waterfall — P&L bridge. Signed deltas; `totals` marks absolute columns.
createChart(el, {
  type: "waterfall",
  data: {
    categories: ["Revenue", "COGS", "Gross", "Opex", "Net"],
    values: [500, -180, 320, -140, 135],
    totals: [2, 4],
  },
});

// Baseline delta — green above reference, red below
createChart(el, {
  type: "baseline",
  baseline: 0,   // default: first value
  data: { x: [0, 1, 2], series: [{ y: [-2, 4, -1] }] },
});

// Donut / pie — same data, "pie" fills to the center
createChart(el, {
  type: "donut",
  data: { slices: [{ label: "A", value: 40 }, { label: "B", value: 60 }] },
});

// Bubble — per-point `r` scales circle radius
createChart(el, {
  type: "bubble",
  data: { x: [0, 1, 2], series: [{ label: "A", y: [3, 7, 5], r: [4, 12, 8] }] },
});

// Range area — band between `y` (lower) and `y2` (upper)
createChart(el, {
  type: "rangearea",
  data: { x: [0, 1, 2], series: [{ label: "Temp", y: [10, 12, 11], y2: [18, 21, 19] }] },
});

// Radar — one axis per category
createChart(el, {
  type: "radar",
  data: {
    categories: ["Speed", "Power", "Range", "Cost"],
    series: [{ label: "A", values: [8, 6, 7, 9] }],
  },
});

// Funnel — stage widths follow the first series' values
createChart(el, {
  type: "funnel",
  data: {
    categories: ["Visit", "Signup", "Trial", "Paid"],
    series: [{ label: "Users", values: [4200, 1800, 620, 240] }],
  },
});
```

## Options

Universal:

| Option | Default | Description |
|---|---|---|
| `type` | — | Any row in the table above |
| `data` | — | Matching shape from the table above |
| `theme` | `"light"` | `"light"` `"dark"` or partial token object |
| `accent` | — | Primary series color |
| `curve` | `"linear"` | `linear` `step` `smooth` (monotone cubic, never overshoots) |
| `grid` | `true` | Faint horizontal gridlines |
| `tooltip` | auto | Hover tooltip (off for sparkline); object form: `{ radius, format }` |
| `legend` | — | Series legend — `true` or `{ position, toggle }`; click an item to hide/show its series |
| `zoom` | — | `true` or `{ wheel, drag: "select" \| "pan", axes: "x" \| "y" \| "xy", dblclick, onZoom }` — wheel zoom + drag-select/drag-pan + double-click reset |
| `animate` | `true` | `true` = 400 ms, a number = custom ms; respects `prefers-reduced-motion` |
| `height` | — | Chart height in px |
| `labels` | — | `{x?: (v)=>string, y?: (v)=>string}` tick formatters |
| `onHover` | — | `(info \| null) => void` |
| `onClick` | — | `(info \| null, ev) => void` — hit under the cursor, or `null` on empty space |
| `onSelect` | — | `(info \| null) => void` — persistent selection; click a mark to select, empty space to clear |

xy charts (`line` `area` `scatter` `bubble` `rangearea` `sparkline` `baseline`):

| Option | Default | Description |
|---|---|---|
| `flow` | `false` | Continuous-flow mode — ripple easing + tween duration auto-follows append cadence |
| `window` | — | Visible points in the sliding window |
| `maxPoints` | — | Hard cap on retained datapoints during `append()`; shows last N when `window` is unset |
| `xScale` | `"linear"` | `"time"` = calendar ticks on epoch-ms x values; `"log"` = logarithmic (x must be positive) |
| `renderer` | `"auto"` | `"webgpu"` rasterizes series on the GPU; `"canvas"` forces Canvas2D |
| `gpuThreshold` | `50000` | Total point count at which `"auto"` engages WebGPU |
| `gpu` | — | WebGPU adapter options (`powerPreference`, `compat`, `timing`) |

Type-specific:

| Option | Default | Description |
|---|---|---|
| `stacked` | `false` | `bar`/`combo`: stack column series per category |
| `baseline` | first value | `baseline` chart reference value |
| `yScale` | `"linear"` | `"log"` = logarithmic y axis (non-positive values render as gaps) |
| `logBase` | `10` | Logarithm base for `log` scales |
| `canvas` | — | `getContext("2d", …)` settings for all layers, e.g. `{ willReadFrequently: true }` |

Missing data: `null`, `NaN`, and non-finite values in `y`, `y2`, `r`, or `values` render as gaps — lines break across them, fills split into runs, and they are excluded from domains and hit testing. Non-finite `x` values are dropped.

## Theming

```ts
createChart(el, {
  type: "line",
  theme: "dark",
  // or override individual tokens:
  // theme: { bg: "#0b0e14", grid: "#1f2430", series: ["#7aa2f7", "#9ece6a"] },
  accent: "#7aa2f7",
  data: { x, series },
});
```

Tokens: `bg` `text` `textMuted` `grid` `axisBaseline` `crosshair` `series[]` `contextGray` `up` `down` `tooltipBg` `tooltipText` `tooltipMuted` `tooltipBorder` `tooltipShadow` `fontFamily`.

## API

```ts
chart.setData(newData);  // animated transition; shape must match `type`
chart.append(x, y);      // streaming: append one sample (xy charts)
                         // number → single series, number[] → per-series value
chart.resetZoom();       // release the zoom/pan view (double-click also resets)
chart.resize();          // manual resize (ResizeObserver handles automatically)
chart.destroy();
```

### Live streaming

```ts
const chart = createChart(el, {
  type: "line",
  window: 120,  // keep last 120 points — viewport pans smoothly
  data: { x: [], series: [{ y: [] }] },
});

setInterval(() => chart.append(Date.now(), latestValue), 100);
```

The viewport (x/y domain) animates toward the new domain on every `append()` — points slide in instead of jumping, and outgoing points slide fully off the left edge before being dropped. If appends arrive faster than the animation duration, retargeting is continuous (no pops). With `flow: true` the tween duration auto-follows the measured append cadence, so the pan finishes exactly as the next sample arrives.

## Performance

- Fused scale + M4 decimation — at most ~4 points per horizontal pixel, peaks preserved, single pass, zero intermediate arrays
- Per-pixel-column candle aggregation — dense series render ~one mark per pixel instead of overdrawing thousands
- Dirty-flag rendering — zero CPU when idle
- Layered canvases — grid, series, and cursor on separate layers
- DPR-aware — crisp hairlines on retina displays
- Columnar `Float64Array` internals, binary-search hit testing
- Zero-allocation streaming — steady-state `append()` reuses buffers via `copyWithin` and buffer ping-pong
- O(n) monotonic fast path — already-sorted data skips the index sort entirely
- Feature-gated slow paths — gap detection and log transforms run per-series only when the data/config needs them; clean linear data uses the original verbatim loops (see [Feature costs](./BENCHMARK_COMPARISON.md#feature-costs-v050))

### Benchmarks

Same machine, browser, data, and chart size (900×240, two series). Methodology and full tables: [BENCHMARK_COMPARISON.md](./BENCHMARK_COMPARISON.md).

| | resolvcharts | Chart.js 4.5 | ApexCharts 8.3 | Highcharts 13.1 |
|---|---|---|---|---|
| Line render, 1M pts ×2 | **0.18 ms** | 127–1410 ms | 424 ms | 256–3323 ms |
| Streaming, 50k window | **120 fps** | 15 fps | 17 fps | 13 fps |
| Bundle (gzip) | **31.8 KB** | 70.7 KB | 269.8 KB | 102.3 KB |

Chart.js range = built-in decimation on/off; Highcharts range = WebGL boost module on/off. Even the Canvas2D fallback (4.1 ms at 1M) is ~31× faster than the best competitor configuration.

*Last benchmarked as of 24 October 2026*
---

A project by [Resolvo Cloud](https://resolvocloud.com)
