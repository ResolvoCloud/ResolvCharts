---
editUrl: false
next: false
prev: false
title: "ChartOptions"
---

Defined in: [types.ts:207](https://github.com/ResolvoCloud/ResolvCharts/blob/f42209c1a1401e6a178643e921171f0483ab5f09/src/core/types.ts#L207)

Options accepted by [createChart](/ResolvCharts/api/functions/createchart/).

## Charts

### canvas?

> `optional` **canvas?**: `CanvasRenderingContext2DSettings`

Defined in: [types.ts:269](https://github.com/ResolvoCloud/ResolvCharts/blob/f42209c1a1401e6a178643e921171f0483ab5f09/src/core/types.ts#L269)

Canvas2D context settings passed to `getContext("2d", …)` for all layers.
e.g. `{ willReadFrequently: true }` measurably cuts submit cost in Chrome
(~2×) by forcing CPU rasterization — useful for small/dense charts;
leave unset (default `{ alpha: true }`) to keep GPU compositing.

## Other

### type

> **type**: [`ChartType`](/ResolvCharts/api/type-aliases/charttype/)

Defined in: [types.ts:208](https://github.com/ResolvoCloud/ResolvCharts/blob/f42209c1a1401e6a178643e921171f0483ab5f09/src/core/types.ts#L208)

***

### data

> **data**: [`ChartData`](/ResolvCharts/api/type-aliases/chartdata/)

Defined in: [types.ts:209](https://github.com/ResolvoCloud/ResolvCharts/blob/f42209c1a1401e6a178643e921171f0483ab5f09/src/core/types.ts#L209)

***

### theme?

> `optional` **theme?**: `Partial`\<[`ThemeTokens`](/ResolvCharts/api/interfaces/themetokens/)\> \| `"light"` \| `"dark"`

Defined in: [types.ts:210](https://github.com/ResolvoCloud/ResolvCharts/blob/f42209c1a1401e6a178643e921171f0483ab5f09/src/core/types.ts#L210)

***

### accent?

> `optional` **accent?**: `string`

Defined in: [types.ts:212](https://github.com/ResolvoCloud/ResolvCharts/blob/f42209c1a1401e6a178643e921171f0483ab5f09/src/core/types.ts#L212)

Accent color applied to the first series.

***

### curve?

> `optional` **curve?**: [`CurveMode`](/ResolvCharts/api/type-aliases/curvemode/)

Defined in: [types.ts:213](https://github.com/ResolvoCloud/ResolvCharts/blob/f42209c1a1401e6a178643e921171f0483ab5f09/src/core/types.ts#L213)

***

### grid?

> `optional` **grid?**: `boolean`

Defined in: [types.ts:214](https://github.com/ResolvoCloud/ResolvCharts/blob/f42209c1a1401e6a178643e921171f0483ab5f09/src/core/types.ts#L214)

***

### tooltip?

> `optional` **tooltip?**: `boolean`

Defined in: [types.ts:215](https://github.com/ResolvoCloud/ResolvCharts/blob/f42209c1a1401e6a178643e921171f0483ab5f09/src/core/types.ts#L215)

***

### legend?

> `optional` **legend?**: `boolean`

Defined in: [types.ts:216](https://github.com/ResolvoCloud/ResolvCharts/blob/f42209c1a1401e6a178643e921171f0483ab5f09/src/core/types.ts#L216)

***

### animate?

> `optional` **animate?**: `number` \| `boolean`

Defined in: [types.ts:218](https://github.com/ResolvoCloud/ResolvCharts/blob/f42209c1a1401e6a178643e921171f0483ab5f09/src/core/types.ts#L218)

`true` = 400 ms ease, a number = custom duration in ms, `false` = off.

***

### flow?

> `optional` **flow?**: `boolean`

Defined in: [types.ts:226](https://github.com/ResolvoCloud/ResolvCharts/blob/f42209c1a1401e6a178643e921171f0483ab5f09/src/core/types.ts#L226)

Continuous-flow mode for xy charts: points ease toward their targets with
a slight right-to-left ripple so transitions read as a wave, not a snap.
Unless `animate` is a number, the tween duration auto-follows the measured
`append()` cadence (EMA), so the pan finishes exactly as the next sample
arrives — perpetual motion, zero lag.

***

### window?

> `optional` **window?**: `number`

Defined in: [types.ts:232](https://github.com/ResolvoCloud/ResolvCharts/blob/f42209c1a1401e6a178643e921171f0483ab5f09/src/core/types.ts#L232)

For xy charts: number of points visible in the sliding window during
`append()`. Older points are dropped FIFO (see `maxPoints` for the
retention cap).

***

### maxPoints?

> `optional` **maxPoints?**: `number`

Defined in: [types.ts:239](https://github.com/ResolvoCloud/ResolvCharts/blob/f42209c1a1401e6a178643e921171f0483ab5f09/src/core/types.ts#L239)

For xy charts: hard cap on retained datapoints during `append()` —
memory bound for live mode. A few extra points may be kept transiently so
dropped points slide off-screen smoothly. When `window` is unset, the
view shows the last `maxPoints`.

***

### renderer?

> `optional` **renderer?**: `"auto"` \| `"canvas"` \| `"webgpu"`

Defined in: [types.ts:248](https://github.com/ResolvoCloud/ResolvCharts/blob/f42209c1a1401e6a178643e921171f0483ab5f09/src/core/types.ts#L248)

Render backend for xy series (line/area/sparkline/scatter). `"canvas"`
(default) uses Canvas2D. `"webgpu"` rasterizes series on the GPU —
instanced lines and point sprites — while axes, grid, and tooltips stay
on Canvas2D. `"auto"` uses WebGPU when available, else Canvas2D.
Unknown to older browsers → silent fallback to Canvas2D.

***

### gpu?

> `optional` **gpu?**: `object`

Defined in: [types.ts:257](https://github.com/ResolvoCloud/ResolvCharts/blob/f42209c1a1401e6a178643e921171f0483ab5f09/src/core/types.ts#L257)

WebGPU adapter options — only used when `renderer` resolves to WebGPU.
`powerPreference` picks the discrete GPU on dual-GPU systems;
`compat` requests compatibility mode (GLES 3.1 / D3D11 reach);
`timing` enables GPU-side pass timing via "timestamp-query" when the
adapter supports it (note: browsers quantize to ~100 µs unless the
WebGPU developer-features flag is enabled).

#### powerPreference?

> `optional` **powerPreference?**: `"default"` \| `"low-power"` \| `"high-performance"`

#### compat?

> `optional` **compat?**: `boolean`

#### timing?

> `optional` **timing?**: `boolean`

***

### stacked?

> `optional` **stacked?**: `boolean`

Defined in: [types.ts:271](https://github.com/ResolvoCloud/ResolvCharts/blob/f42209c1a1401e6a178643e921171f0483ab5f09/src/core/types.ts#L271)

For `bar`: stack series per category instead of grouping.

***

### baseline?

> `optional` **baseline?**: `number`

Defined in: [types.ts:273](https://github.com/ResolvoCloud/ResolvCharts/blob/f42209c1a1401e6a178643e921171f0483ab5f09/src/core/types.ts#L273)

For `baseline`: reference value the line is compared against (default: first point).

***

### height?

> `optional` **height?**: `number`

Defined in: [types.ts:275](https://github.com/ResolvoCloud/ResolvCharts/blob/f42209c1a1401e6a178643e921171f0483ab5f09/src/core/types.ts#L275)

Fixed CSS height in px; defaults to element height or 240 (32 for sparkline).

***

### labels?

> `optional` **labels?**: `object`

Defined in: [types.ts:277](https://github.com/ResolvoCloud/ResolvCharts/blob/f42209c1a1401e6a178643e921171f0483ab5f09/src/core/types.ts#L277)

Axis tick label formatters.

#### x?

> `optional` **x?**: (`v`) => `string`

##### Parameters

###### v

`number`

##### Returns

`string`

#### y?

> `optional` **y?**: (`v`) => `string`

##### Parameters

###### v

`number`

##### Returns

`string`

***

### onHover?

> `optional` **onHover?**: (`info`) => `void`

Defined in: [types.ts:282](https://github.com/ResolvoCloud/ResolvCharts/blob/f42209c1a1401e6a178643e921171f0483ab5f09/src/core/types.ts#L282)

Called on pointer hover with the nearest hit, or `null` on leave.

#### Parameters

##### info

[`HoverInfo`](/ResolvCharts/api/type-aliases/hoverinfo/) \| `null`

#### Returns

`void`
