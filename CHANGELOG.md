# Changelog

## 0.5.0

### Added

- **Legend** — `legend: true | { position, toggle }`; click-to-toggle hides series/slices across rendering, domains, hit testing, tooltips, and GPU draws.
- **Zoom / pan** — `zoom: true | ZoomOptions`; wheel zoom around the cursor, drag-select zoom box or drag-pan (`drag: "select" | "pan"`), per-axis control (`axes`), double-click or `chart.resetZoom()` to release, `onZoom` callback. Log axes zoom in log space.
- **Click / select events** — `onClick(info | null, ev)` plus `onSelect` for persistent selection with accent markers; drags ≥6px don't count as clicks.
- **Time-aware x axis** — `xScale: "time"`; calendar-boundary ticks (ms→years) with a span-aware formatter.
- **Log scales** — `xScale: "log"`, `yScale: "log"`, `logBase`; non-positive values render as gaps; decade major ticks + minor gridlines.
- **Gap / null handling** — `null`/`NaN`/non-finite normalize to NaN; decimators emit separators between finite runs; path builders, fills, hits, and GPU shaders all split or cull at gaps.
- **Tooltip formatter** — `tooltip: { format(info, {x, y}) }` returning `{title, rows}`, `{html}`, a string, or `null` to suppress.
- **`resolvcharts-solid`** — SolidJS wrapper package (workspace: `solid/`); props map 1:1 to `ChartOptions`, reactive `data` updates via `setData()`, `type` changes rebuild.

### Performance

- **`hasGaps` fast-path** — clean series run the verbatim v0.4.0 loops; gap checks cost nothing unless data actually contains gaps.
- **Run-based decimation** — stored `gapIdx` break indices let the decimator iterate finite runs verbatim (gapped decimate 0.34 → 0.20 ms/100k).
- **Cached `log_b` display-space arrays** (`sortedXLog`, `yLog`) — built once at `setData`, maintained in `append`; log-axis decimation and `mapSeriesPx` drop all per-point `Math.log` (log-y/log-x decimate ≈ clean linear; `renderLine` log-y 2×100k ≈ linear parity).
- **`domains()` memoized** — zoom/pan no longer re-scan the dataset per event.
- **WebGPU under log scales** — data encodes in log space (reusing the cached arrays) so the affine GPU map reproduces the log scale exactly.
- **Legend inset cached** — no forced layout flush per `layout()` call.
- Zero regressions vs 0.4.0 on clean data; per-config costs documented in `BENCHMARK_COMPARISON.md`.

### Changed

- **`gpuThreshold` default lowered to 50,000** (was 100,000) — the WebGPU path wins per-frame well below this size; the floor only gates one-time adapter/upload cost.

## 0.4.1

### Added

- **Tooltip corner radius** — `tooltip` now accepts `boolean | { radius?: number | string }`. `{ radius: 0 }` gives sharp corners; numbers are px, strings accept any CSS `border-radius` value. Defaults to `6px`.

### Docs

- **Live examples page** (`site/guides/examples`) — 14 charts grouped by use case (ops monitoring, finance, product analytics, business reporting, scientific/comparison), backed by `site/public/demos.js`. Linked from the landing page hero.

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
