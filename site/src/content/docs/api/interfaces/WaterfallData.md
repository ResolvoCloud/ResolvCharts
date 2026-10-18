---
editUrl: false
next: false
prev: false
title: "WaterfallData"
---

Defined in: [types.ts:131](https://github.com/ResolvoCloud/ResolvCharts/blob/f42209c1a1401e6a178643e921171f0483ab5f09/src/core/types.ts#L131)

Data for `waterfall` charts.

## Properties

### categories

> **categories**: `string`[]

Defined in: [types.ts:132](https://github.com/ResolvoCloud/ResolvCharts/blob/f42209c1a1401e6a178643e921171f0483ab5f09/src/core/types.ts#L132)

***

### values

> **values**: `ArrayLike`\<`number`\>

Defined in: [types.ts:134](https://github.com/ResolvoCloud/ResolvCharts/blob/f42209c1a1401e6a178643e921171f0483ab5f09/src/core/types.ts#L134)

Delta per category; entries listed in `totals` render as absolute columns.

***

### totals?

> `optional` **totals?**: `number`[]

Defined in: [types.ts:136](https://github.com/ResolvoCloud/ResolvCharts/blob/f42209c1a1401e6a178643e921171f0483ab5f09/src/core/types.ts#L136)

Indices into `categories` that are absolute totals (e.g. start/end/subtotal).
