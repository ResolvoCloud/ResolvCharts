---
editUrl: false
next: false
prev: false
title: "HoverInfo"
---

> **HoverInfo** = \{ `kind`: `"point"`; `index`: `number`; `x`: `number`; `px`: `number`; `py`: `number`; `values`: `object`[]; `title?`: `string`; \} \| \{ `kind`: `"bar"`; `category`: `string`; `seriesIndex`: `number`; `label`: `string`; `color`: `string`; `value`: `number`; `px`: `number`; `py`: `number`; `rect`: [`Rect`](/ResolvCharts/api/interfaces/rect/); \} \| \{ `kind`: `"slice"`; `index`: `number`; `label`: `string`; `color`: `string`; `value`: `number`; `share`: `number`; `px`: `number`; `py`: `number`; \} \| \{ `kind`: `"candle"`; `index`: `number`; `x`: `number`; `open`: `number`; `high`: `number`; `low`: `number`; `close`: `number`; `px`: `number`; `py`: `number`; \}

Defined in: [types.ts:159](https://github.com/ResolvoCloud/ResolvCharts/blob/f42209c1a1401e6a178643e921171f0483ab5f09/src/core/types.ts#L159)

Payload passed to `ChartOptions.onHover`.

## Union Members

### Type Literal

\{ `kind`: `"point"`; `index`: `number`; `x`: `number`; `px`: `number`; `py`: `number`; `values`: `object`[]; `title?`: `string`; \}

#### kind

> **kind**: `"point"`

#### index

> **index**: `number`

#### x

> **x**: `number`

#### px

> **px**: `number`

#### py

> **py**: `number`

#### values

> **values**: `object`[]

#### title?

> `optional` **title?**: `string`

Tooltip title override (e.g. category name on `combo` charts).

***

### Type Literal

\{ `kind`: `"bar"`; `category`: `string`; `seriesIndex`: `number`; `label`: `string`; `color`: `string`; `value`: `number`; `px`: `number`; `py`: `number`; `rect`: [`Rect`](/ResolvCharts/api/interfaces/rect/); \}

***

### Type Literal

\{ `kind`: `"slice"`; `index`: `number`; `label`: `string`; `color`: `string`; `value`: `number`; `share`: `number`; `px`: `number`; `py`: `number`; \}

***

### Type Literal

\{ `kind`: `"candle"`; `index`: `number`; `x`: `number`; `open`: `number`; `high`: `number`; `low`: `number`; `close`: `number`; `px`: `number`; `py`: `number`; \}
