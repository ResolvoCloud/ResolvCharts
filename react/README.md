# resolvcharts-react

React wrapper for [resolvcharts](https://github.com/ResolvoCloud/ResolvCharts) — a minimal, zero-dependency canvas charting library.

```sh
npm install resolvcharts-react
```

```tsx
import { Chart } from "resolvcharts-react";

<Chart
  type="line"
  data={{ x: [0, 1, 2], series: [{ label: "A", y: [3, 7, 5] }] }}
  curve="smooth"
/>
```

Props map 1:1 to `ChartOptions` (see the resolvcharts README). `data` changes animate via `setData()`; `type` changes rebuild the chart; all other options are captured at mount — pass a React `key` to force a rebuild. `onHover` is always the latest callback. `onReady` / `ref` expose the chart instance for `append()`, `resize()`, `destroy()`.

Streaming:

```tsx
const ref = useRef<ChartInstance>(null);

<Chart ref={ref} type="line" window={120} data={{ x: [], series: [{ y: [] }] }} />;
// ref.current?.append(Date.now(), value)
```
