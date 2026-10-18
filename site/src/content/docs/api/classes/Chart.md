---
editUrl: false
next: false
prev: false
title: "Chart"
---

Defined in: [chart.ts:123](https://github.com/ResolvoCloud/ResolvCharts/blob/f42209c1a1401e6a178643e921171f0483ab5f09/src/core/chart.ts#L123)

Chart instance. Create via [createChart](/ResolvCharts/api/functions/createchart/).

## Constructors

### Constructor

> **new Chart**(`el`, `options`): `Chart`

Defined in: [chart.ts:189](https://github.com/ResolvoCloud/ResolvCharts/blob/f42209c1a1401e6a178643e921171f0483ab5f09/src/core/chart.ts#L189)

#### Parameters

##### el

`HTMLElement`

##### options

[`ChartOptions`](/ResolvCharts/api/interfaces/chartoptions/)

#### Returns

`Chart`

## Properties

### el

> `readonly` **el**: `HTMLElement`

Defined in: [chart.ts:124](https://github.com/ResolvoCloud/ResolvCharts/blob/f42209c1a1401e6a178643e921171f0483ab5f09/src/core/chart.ts#L124)

***

### options

> `readonly` **options**: [`ChartOptions`](/ResolvCharts/api/interfaces/chartoptions/)

Defined in: [chart.ts:125](https://github.com/ResolvoCloud/ResolvCharts/blob/f42209c1a1401e6a178643e921171f0483ab5f09/src/core/chart.ts#L125)

## Methods

### setData()

> **setData**(`data`): `void`

Defined in: [chart.ts:858](https://github.com/ResolvoCloud/ResolvCharts/blob/f42209c1a1401e6a178643e921171f0483ab5f09/src/core/chart.ts#L858)

Replace the chart data; the view morphs to the new dataset.

#### Parameters

##### data

[`ChartData`](/ResolvCharts/api/type-aliases/chartdata/)

#### Returns

`void`

***

### append()

> **append**(`x`, `y`): `void`

Defined in: [chart.ts:870](https://github.com/ResolvoCloud/ResolvCharts/blob/f42209c1a1401e6a178643e921171f0483ab5f09/src/core/chart.ts#L870)

Append one sample to every series of an xy chart (line/area/scatter/
sparkline). With `options.window`, old points are dropped FIFO and the
viewport pans smoothly. Non-monotonic x falls back to a resort.

#### Parameters

##### x

`number`

##### y

`number` \| `number`[]

#### Returns

`void`

***

### resize()

> **resize**(): `void`

Defined in: [chart.ts:954](https://github.com/ResolvoCloud/ResolvCharts/blob/f42209c1a1401e6a178643e921171f0483ab5f09/src/core/chart.ts#L954)

Re-measure the container and re-render (called automatically via ResizeObserver).

#### Returns

`void`

***

### destroy()

> **destroy**(): `void`

Defined in: [chart.ts:974](https://github.com/ResolvoCloud/ResolvCharts/blob/f42209c1a1401e6a178643e921171f0483ab5f09/src/core/chart.ts#L974)

Remove listeners, stop animation, release canvases and GPU resources.

#### Returns

`void`
