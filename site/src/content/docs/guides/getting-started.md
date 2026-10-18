---
title: Getting started
description: Install and render your first chart.
---

## Install

```sh
npm i resolvcharts
# or pnpm add resolvcharts / bun add resolvcharts
```

Requires Node ≥ 24 for tooling; the library itself runs in any modern browser. A CDN global build is available via unpkg/jsdelivr:

```html
<script src="https://unpkg.com/resolvcharts/dist/resolvcharts.global.min.js"></script>
```

## First chart

```ts
import { createChart } from "resolvcharts";

const chart = createChart(document.querySelector("#chart"), {
  type: "line",
  data: {
    x: [1, 2, 3, 4, 5],
    series: [{ label: "Revenue", y: [10, 14, 9, 21, 30] }],
  },
});
```

## Live streaming

```ts
setInterval(() => chart.append(Date.now(), sample()), 2000);
```

With `flow: true` the tween duration auto-follows the measured append cadence, so the line never stops moving. `window` controls the visible range, `maxPoints` the retained memory.

## WebGPU (opt-in)

```ts
createChart(el, { type: "scatter", renderer: "auto" });
```

Falls back to Canvas2D when WebGPU is unavailable. See the API reference for `gpu` adapter options.
