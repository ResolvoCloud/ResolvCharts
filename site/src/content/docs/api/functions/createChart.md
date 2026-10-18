---
editUrl: false
next: false
prev: false
title: "createChart"
---

> **createChart**(`el`, `options`): [`Chart`](/ResolvCharts/api/classes/chart/)

Defined in: [chart.ts:1025](https://github.com/ResolvoCloud/ResolvCharts/blob/f42209c1a1401e6a178643e921171f0483ab5f09/src/core/chart.ts#L1025)

Create a chart inside `el`.

## Parameters

### el

`HTMLElement`

### options

[`ChartOptions`](/ResolvCharts/api/interfaces/chartoptions/)

## Returns

[`Chart`](/ResolvCharts/api/classes/chart/)

## Example

```ts
const chart = createChart(document.getElementById("c")!, {
  type: "line",
  curve: "smooth",
  flow: true,
  window: 30,
  data: { x: xs, series: [{ label: "cpu", y: ys }] },
});
setInterval(() => chart.append(Date.now(), sample()), 2000);
```
