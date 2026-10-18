# resolvcharts

[![npm](https://img.shields.io/npm/v/resolvcharts)](https://www.npmjs.com/package/resolvcharts)
[![license](https://img.shields.io/npm/l/resolvcharts)](./LICENSE)

A minimal, zero-dependency canvas charting library. Opinionated defaults, small API, fast rendering.

At [Resolvo Cloud](https://resolvocloud.com), we experienced glitchy live charts, bloated libraries and just overcomplicated processes for something as simple as charting, so we made ResolvCharts to Resolve that issue.

## Install

```sh
npm install resolvcharts
```

## Usage

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

Chart types: `line`, `area`, `bar` (grouped or `stacked`), `combo`, `sparkline`, `scatter`, `donut`, `candle`, `ohlc`, `waterfall`, `baseline`.

```ts
// Candlestick (+ optional volume band)
createChart(el, {
  type: "candle",  // or "ohlc" for bar-style
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
```

```ts
// Bar
createChart(el, {
  type: "bar",
  data: { categories: ["Q1", "Q2", "Q3"], series: [{ label: "Sales", values: [4, 7, 5] }] },
});

// Donut
createChart(el, {
  type: "donut",
  data: { slices: [{ label: "A", value: 40 }, { label: "B", value: 60 }] },
});
```

## Options

| Option | Default | Description |
|---|---|---|
| `type` | — | `line` `area` `bar` `combo` `sparkline` `scatter` `donut` `candle` `ohlc` `waterfall` `baseline` |
| `data` | — | `{x, series}` · `{categories, series}` · `{slices}` · `{candles}` · waterfall shape |
| `theme` | `"light"` | `"light"` `"dark"` or partial token object |
| `accent` | — | Primary series color |
| `curve` | `"linear"` | `linear` `step` `smooth` (monotone cubic, never overshoots) |
| `grid` | `true` | Faint horizontal gridlines |
| `tooltip` | auto | Hover tooltip (off for sparkline) |
| `animate` | `true` | `true` = 400 ms, a number = custom ms; respects `prefers-reduced-motion` |
| `flow` | `false` | Continuous-flow mode for xy charts — ripple easing + tween duration auto-follows append cadence |
| `window` | — | Visible points in the sliding window (xy charts) |
| `maxPoints` | — | Hard cap on retained datapoints during `append()`; shows last N when `window` is unset |
| `stacked` | `false` | Bar/combo charts: stack column series per category |
| `baseline` | first value | Baseline chart reference value |
| `height` | — | Chart height in px |
| `labels` | — | `{x?: (v)=>string, y?: (v)=>string}` tick formatters |
| `onHover` | — | `(info \| null) => void` |

## API

```ts
chart.setData(newData);  // animated transition
chart.append(x, y);      // streaming: append one sample (xy charts)
                         // number → single series, number[] → per-series value
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

---

A project by [Resolvo Cloud](https://resolvocloud.com)
