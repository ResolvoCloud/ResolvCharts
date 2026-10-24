# Benchmark Comparison

ResolvCharts vs Chart.js, ApexCharts, Highcharts — measured in the same browser session.

Benchmark date: 24 October 2026.

## Libraries tested

| Library | Version | Renderer | Minified size | Gzipped | vs ResolvCharts (gz) |
|---|---|---|---|---|---|
| **ResolvCharts** | 0.5.0 | Canvas2D / WebGPU | 125.6 KB | **31.8 KB** | — |
| Chart.js | 4.5.1 | Canvas2D | 208.5 KB | 70.7 KB | 3.3× larger (+230%) |
| Highcharts | 13.1.1 | SVG (+ optional WebGL "boost") | 280.2 KB | 102.3 KB | 4.8× larger (+378%) |
| ApexCharts | 8.3.1 | SVG | 939.8 KB | 269.8 KB | 12.6× larger (+1161%) |

Highcharts' `boost` module (WebGL path, needed for large datasets) ships separately — add ~50 KB on top of the core size. Chart.js `+dec` rows use its built-in `plugins.decimation` (min-max algorithm), its documented answer for large data.

## Test setup

- Machine: Apple M5 Pro, 48 GB RAM, macOS 27.0.1, Chromium (Playwright), devicePixelRatio 2
- Chart: 900 × 240 CSS px, **two series**, identical data `50 + 30·sin(i/500) + (i%17)` / `60 + 20·cos(i/300) + (i%13)`
- All libs: animations off, tooltips off, legend off, markers off (scatter: minimal markers)
- Harnesses: `bench/browser.html` (ours), `bench/competitors.html` (theirs, vendored dist builds in `bench/vendor/`)

## Methodology — read before trusting the ratios

- **ResolvCharts "submit"** = wall time of `chart.render(1)`: decimation scan + path build + raster submit (Canvas2D), or uniform writes + draw encoding (WebGPU).
- **Competitor "update"** = their documented full-refresh path on unchanged data: Chart.js `update('none')`, ApexCharts `updateSeries(sameData, false)`, Highcharts `setData(sameData)` on both series + `redraw()`. These include data re-parsing/re-point-building that ResolvCharts skips (it holds normalized typed arrays), so the gap is inflated vs a pure redraw — but this is the real cost a caller pays to refresh each library.
- Highcharts `redraw()` alone is incremental (~0.25 ms when nothing is dirty) — not comparable, so not shown.
- ApexCharts `updateOptions()` alone no-ops (~0.3 ms) — same reason.
- Streaming: 50k-point rolling window, one point appended to series 0 per rAF for 3 s. Ours: `append()`. Chart.js: `push`+`shift`+`update('none')`. Highcharts: `addPoint(v, redraw, shift)`. ApexCharts: `appendData()` — note it does **not** trim, so its window grows (only ~52 appends in 3 s, negligible skew).
- Each cell ran ≥2× with settle time between measurements.

## Results — static render (avg ms, JS thread)

### Line, two series

| Points | ResolvCharts Canvas | ResolvCharts WebGPU | Chart.js | Chart.js +dec | ApexCharts | Highcharts | HC +boost |
|---|---|---|---|---|---|---|---|
| 10k | **0.28** | — | 10.6 | — | 3.6 | 30.7 | — |
| 100k | **0.65** | **0.16** | 140.8 | 13.2 | 37.6 | 291.8 | 28.1 |
| 1M | **4.09** | **0.18** | 1409.6 | 126.6 | 424.1 | 3322.8 | 255.9 |
| 5M | 14.8 | **0.17** | — | — | — | — | — |

Slowdown vs ResolvCharts' best path at each size (competitor ms ÷ ours ms):

| Points | Chart.js | Chart.js +dec | ApexCharts | Highcharts | HC +boost |
|---|---|---|---|---|---|
| 10k | 38× slower | — | 13× | 110× | — |
| 100k | 880× | 83× | 235× | 1824× | 176× |
| 1M | 7831× | 703× | 2356× | 18460× | 1422× |

Even ResolvCharts' **Canvas2D** path beats every competitor's best configuration:
- 100k: 0.65 ms vs Chart.js+dec 13.2 ms → **20× faster (95% less time)**
- 1M: 4.09 ms vs Chart.js+dec 126.6 ms → **31× faster (97% less)**

### First render (init, ms)

| Points | ResolvCharts | Chart.js | Chart.js +dec | ApexCharts | Highcharts | HC +boost |
|---|---|---|---|---|---|---|
| 100k | 6.5 | 204 | 23.3 | 45.5 | 196.8 | 46.3 |
| 1M | 26.2 | 2010 | 214.5 | 468.5 | 1695 | 230 |

Ours initializes **9–77× faster** at 1M depending on competitor (HC+boost 230 ms = 8.8×; Chart.js 2010 ms = 77×).

### Scatter, 100k points

| ResolvCharts | Chart.js | ApexCharts | Highcharts | HC +boost |
|---|---|---|---|---|
| **14.3 ms** | 37.1 | 938.7 | 277.1 | 38.2 |

Ours is **2.6× faster than the closest competitor** (Chart.js, 61% less time); vs ApexCharts **66× faster**. The number shown is the Canvas2D path (forced `renderer: "canvas"`); under `renderer: "auto"` the WebGPU path engages at this size and renders in ~0.16 ms — **~230× faster than Chart.js** — and at 1M it renders scatter in ~0.15 ms (see BENCHMARKS.md), where ApexCharts needed ~1 s just for 100k.

## Results — streaming (50k rolling window, append per rAF, 3 s)

| Library | Achieved fps | Per-call JS avg | fps vs ours | per-call vs ours |
|---|---|---|---|---|
| ResolvCharts canvas | **120.4** | **0.056 ms** | — | — |
| ResolvCharts WebGPU | 120.4 | 0.051 ms | — | — |
| ApexCharts | 17.5 | 56.7 ms | 6.9× lower | ~1010× slower |
| Chart.js | 13.6 | 72.2 ms | 8.9× lower | ~1290× slower |
| Highcharts | 12.8 | 77.0 ms | 9.4× lower | ~1380× slower |

All three competitors peg below **18 fps** — each frame spends 57–78 ms re-rendering the 50k×2 window. ResolvCharts holds the 120 Hz display cap; its per-call cost is only the append itself (typed-array shift, ~0.05 ms) since per-frame render is ~0.2–0.6 ms at this size.

## Takeaways

- **The gap widens with data.** At 10k the competitors are within ~13–110×; at 1M the best competitor (Chart.js with decimation) is 703× slower than our WebGPU path and 31× slower than our Canvas2D path.
- **Their "big data" modes still lose.** Chart.js decimation (−91% vs its default at 1M) and Highcharts boost (−92% vs plain SVG at 1M) both help them enormously — and still trail our Canvas2D fallback by ~31–63×.
- **Streaming is the starkest real-world gap:** 120 fps vs 12–17 fps. Competitors re-render the whole window per point; ours shifts a ring buffer.
- **Size:** ResolvCharts is 3.3–12.6× smaller gzipped, with zero dependencies.
- **Caveat:** competitor "update" numbers include data re-processing ours doesn't pay (see Methodology). Even discounting that, the streaming fps and init numbers — which don't share that asymmetry — show the same ordering.

## Feature costs (v0.5.0+)

The new interaction/axis features keep the baseline hot loop unchanged — clean,
linear data runs the same verbatim loops as v0.4.0. Costs are confined to the
configs that opt into the heavier code paths (`bench/perf.ts`, 100k points):

| Config | Effect | Measured | Δ vs clean |
|---|---|---|---|
| Clean linear data | No change — per-series `hasGaps` flag selects the original fast loops | 0.16 ms/op decimate | baseline |
| Series containing gaps (`null`/`NaN`) | Stored `gapIdx` run boundaries — decimator iterates finite runs verbatim | 0.19 ms/op decimate | +20% |

Measured at ~0% vs clean (removed from the table): `yScale: "log"` and
`xScale: "log"` decimation (cached `log_b` arrays → verbatim affine loop),
`mapSeriesPx` under log (0.15 ms/op), `renderLine` log-y 2×100k (0.31 ms
isolated — the suite row reads ~0.6 due to ordering noise), `xScale: "time"`,
`legend`, `zoom`/`onClick`/`onSelect`, and `tooltip.format`.

Log-scale trade-offs: +8 B/pt per log-y series (+8 B/pt shared for log-x), one
`Math.log` per point at `setData`/`append` instead of per render, and animation
lerps in log space (geometric interpolation — visually consistent for log
charts). Raw arrays are kept for domains, tooltips, and hit testing.

Baseline deltas vs v0.4.0, clean data: `buildPath` −6% (0.186→0.174 ms), `renderLine`
−1% (0.319→0.317 ms), `renderCandles` −4% (0.166→0.160 ms), `renderSparkline` −8%
(0.165→0.151 ms), `domains()` +3% on a cold call (0.145→0.150 ms) but memoized — ~0
during zoom/pan. All within run noise; nothing regressed.

## Reproduce

```bash
pnpm build
python3 -m http.server 8931
# ours:   http://localhost:8931/bench/browser.html      → await window.runBench()
# theirs: http://localhost:8931/bench/competitors.html  → await window.run('chartjs','render','line',100000)
```

`window.run(lib, 'render'|'stream', type, N, {iters})` — lib ∈ `chartjs`, `chartjs-dec`, `apexcharts`, `highcharts`, `highcharts-boost`.
