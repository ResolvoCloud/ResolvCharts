# resolvcharts-solid

SolidJS wrapper for [resolvcharts](https://github.com/ResolvoCloud/ResolvCharts) — a minimal, zero-dependency canvas charting library.

```sh
npm install resolvcharts-solid
```

```tsx
import { Chart } from "resolvcharts-solid";

<Chart
  type="line"
  data={{ x: [0, 1, 2], series: [{ label: "A", y: [3, 7, 5] }] }}
  curve="smooth"
/>
```

Props map 1:1 to `ChartOptions` (see the resolvcharts README). All chart types work — `line` `area` `baseline` `sparkline` `scatter` `bubble` `rangearea` `bar` `combo` `radar` `funnel` `donut` `pie` `candle` `ohlc` `waterfall`. `data` changes are reactive and animate via `setData()`; `type` changes rebuild the chart; all other options are captured at mount — wrap in a keyed `<Show>` to force a rebuild. `onHover` is always the latest callback. `onReady` / `ref` expose the chart instance for `append()`, `resize()`, `destroy()`.

Streaming:

```tsx
const [chart, setChart] = createSignal<ChartInstance | null>(null);

<Chart ref={setChart} type="line" window={120} data={{ x: [], series: [{ y: [] }] }} />;
// chart()?.append(Date.now(), value)
```
