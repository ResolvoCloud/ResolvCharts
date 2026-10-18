---
editUrl: false
next: false
prev: false
title: "decimateM4"
---

> **decimateM4**(`xs`, `ys`, `pixelWidth`): `Float32Array`

Defined in: [decimate.ts:195](https://github.com/ResolvoCloud/ResolvCharts/blob/f42209c1a1401e6a178643e921171f0483ab5f09/src/core/decimate.ts#L195)

M4 (min-max) decimation: for each integer pixel column along x, keep the
first, min, max, and last points. Guarantees peaks are never dropped and
bounds path complexity to ~4 points per horizontal pixel.

xs must be pixel-space x coordinates, monotonically non-decreasing.
ys must be pixel-space y coordinates of equal length.

Returns interleaved [x, y] pairs ready for path construction.

## Parameters

### xs

`ArrayLike`\<`number`\>

### ys

`ArrayLike`\<`number`\>

### pixelWidth

`number`

## Returns

`Float32Array`
