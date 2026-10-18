---
editUrl: false
next: false
prev: false
title: "ChartData"
---

> **ChartData** = [`XYData`](/ResolvCharts/api/interfaces/xydata/) \| [`CategoryData`](/ResolvCharts/api/interfaces/categorydata/) \| [`DonutData`](/ResolvCharts/api/interfaces/donutdata/) \| [`OHLCData`](/ResolvCharts/api/interfaces/ohlcdata/) \| [`WaterfallData`](/ResolvCharts/api/interfaces/waterfalldata/)

Defined in: [types.ts:142](https://github.com/ResolvoCloud/ResolvCharts/blob/f42209c1a1401e6a178643e921171f0483ab5f09/src/core/types.ts#L142)

Union of all per-type data shapes; the chart picks the matching member by `options.type`.
