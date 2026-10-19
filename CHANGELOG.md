# Changelog

## 0.4.0

### Added

- **Five new chart types** — 15 total:
  - `pie` — donut variant that fills to the center (same `{ slices }` data, hover share tooltips included).
  - `bubble` — xy series with a per-point `r` channel mapped to a 3–16 px radius.
  - `rangearea` — filled band between `y` (lower) and `y2` (upper) per point; both edges are M4-decimated, so million-point bands stay fast.
  - `radar` — one spoke axis per category with ring grid and per-series polygons; spoke highlight + vertex dots on hover.
  - `funnel` — one trapezoid stage per category using the first series' values, with in-bar or side labels.
- **`SeriesInput.r` / `SeriesInput.y2`** channels — carried through `setData()`, `append()`, and internal re-sorts.
- **`BENCHMARK_COMPARISON.md`** — reproducible browser benchmarks vs Chart.js, ApexCharts, and Highcharts (init, render, streaming, scatter, bundle size).
- **Demo gallery** rebuilt as a data-driven example registry (`demo/examples.js` + `demo/demo.js`) — global theme/renderer toggles, per-card option source, seeded stable data.
- `resolvcharts-react` supports all new types out of the box (props map 1:1 to `ChartOptions`).

## 0.3.0

### Added

- **`yMin`/`yMax` options** — pin the y-axis domain; each bound overrides the auto-fitted end while unset ends still auto-fit. Values outside the bounds clip at the plot edge. Applies to all axes charts (xy, category, OHLC, waterfall).
- **`gpuThreshold` option** — point count at which `renderer: "auto"` (now the default) engages WebGPU (default: 100,000). Small charts never pay adapter/device acquisition.
- **`gpu.allowFallback` option** — opt in to software adapters (SwiftShader); off by default.
- **GPU compute decimation** — M4 (first/min/max/last per pixel column) runs in a compute shader above ~2 points/column, including flow-animation lerps. No CPU rescan, no readback.
- **Ring-buffer streaming** — `append()` writes only the new tail into per-series GPU buffers; pan/zoom, resize, and view animation are uniform writes (data lives on the GPU in affine-encoded form).
- **Device-loss recovery** — lost GPU devices are re-acquired and all resources rebuilt automatically; charts render via Canvas2D while recovering.

### Changed

- **`renderer: "auto"`** is now threshold-gated (was: attach whenever WebGPU exists). Detection hardened: Firefox `requestAdapter()` rejections and software adapters are treated as unavailable.

## 0.2.0

### Added

- **`combo` chart type** — per-series `kind`: `column` (default), `line`, or `area`. Columns group (or stack with `stacked: true`) per category; line/area series overlay on category centers.
- **`canvas` option** — pass `getContext("2d", …)` settings to all layers, e.g. `{ willReadFrequently: true }` which measurably reduces submit cost in Chrome.
- **`resolvcharts-react`** — React wrapper package (workspace: `react/`).

### Changed

- **Docs**: migrated to Starlight — landing page, guides, full-text search, and auto-generated categorized API reference. Deployed to GitHub Pages.
- **JSDoc coverage** across the public API (`@category` grouping).
- **Release pipeline** now uses npm Trusted Publishing (OIDC) — no tokens.

## 0.1.0

Initial release: 10 chart types, zero-dependency Canvas2D renderer, opt-in WebGPU backend (`renderer: "auto"`), `flow` continuous-motion streaming, `window`/`maxPoints` live retention, typed-array hot paths with M4 decimation.
