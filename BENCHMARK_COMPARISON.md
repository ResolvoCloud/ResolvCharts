# Benchmark Comparison

ResolvCharts vs Chart.js, ApexCharts, Highcharts — measured in the same browser session.

## Libraries tested

| Library | Version | Renderer | Minified size | Gzipped | vs ResolvCharts (gz) |
|---|---|---|---|---|---|
| **ResolvCharts** | 0.3.0 | Canvas2D / WebGPU | 59.6 KB | **19.5 KB** | — |
| Chart.js | 4.5.1 | Canvas2D | 208.5 KB | 70.7 KB | 3.6× larger (+263%) |
| Highcharts | 13.1.1 | SVG (+ optional WebGL "boost") | 280.2 KB | 102.3 KB | 5.2× larger (+425%) |
| ApexCharts | 8.3.1 | SVG | 939.8 KB | 269.8 KB | 13.8× larger (+1284%) |

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

## Results — static render (avg ms, JS thread)

### Line, two series

| Points | ResolvCharts Canvas | ResolvCharts WebGPU | Chart.js | Chart.js +dec | ApexCharts | Highcharts | HC +boost |
|---|---|---|---|---|---|---|---|
| 10k | **0.37** | — | 11.4 | — | 3.8 | 27.9 | — |
| 100k | **0.58** | **0.19** | 134.3 | 13.7 | 37.8 | 289.3 | 31.4 |
| 1M | **3.89** | **0.22** | 1379.5 | 135.9 | 484.2 | 3194.3 | 248.1 |
| 5M | 14.9 | **0.19** | — | — | — | — | — |

Slowdown vs ResolvCharts' best path at each size (competitor ms ÷ ours ms):

| Points | Chart.js | Chart.js +dec | ApexCharts | Highcharts | HC +boost |
|---|---|---|---|---|---|
| 10k | 31× slower | — | 10× | 75× | — |
| 100k | 707× | 72× | 199× | 1522× | 165× |
| 1M | 6416× | 632× | 2252× | 14857× | 1154× |

Even ResolvCharts' **Canvas2D** path beats every competitor's best configuration:
- 100k: 0.58 ms vs Chart.js+dec 13.7 ms → **24× faster (96% less time)**
- 1M: 3.89 ms vs Chart.js+dec 135.9 ms → **35× faster (97% less)**

### First render (init, ms)

| Points | ResolvCharts | Chart.js | Chart.js +dec | ApexCharts | Highcharts | HC +boost |
|---|---|---|---|---|---|---|
| 100k | 3.9–6.6 | 217 | 23.2 | 55.8 | 199.5 | 185 |
| 1M | 32.8 | 2077 | 258 | 512 | 1773 | 251 |

Ours initializes **8–63× faster** at 1M depending on competitor (HC+boost 251 ms = 7.7×; Chart.js 2077 ms = 63×).

### Scatter, 100k points

| ResolvCharts | Chart.js | ApexCharts | Highcharts | HC +boost |
|---|---|---|---|---|
| **14.9 ms** | 36.6 | 933.4 | 290.6 | 38.1 |

Ours is **2.5× faster than the closest competitor** (Chart.js, 59% less time); vs ApexCharts **63× faster**. Note: at exactly 100k the WebGPU path did not engage (`gpuThreshold` boundary) — the number shown is the Canvas2D path. At 1M our WebGPU path renders scatter in ~0.15 ms (see BENCHMARKS.md), where ApexCharts needed ~1 s just for 100k.

## Results — streaming (50k rolling window, append per rAF, 3 s)

| Library | Achieved fps | Per-call JS avg | fps vs ours | per-call vs ours |
|---|---|---|---|---|
| ResolvCharts canvas | **120.4** | **0.074 ms** | — | — |
| ResolvCharts WebGPU | 120.3 | 0.060 ms | — | — |
| ApexCharts | 17.2 | 57.7 ms | 7.0× lower | ~780× slower |
| Chart.js | 15.0 | 66.2 ms | 8.0× lower | ~890× slower |
| Highcharts | 12.6 | 78.1 ms | 9.5× lower | ~1060× slower |

All three competitors peg below **18 fps** — each frame spends 57–78 ms re-rendering the 50k×2 window. ResolvCharts holds the 120 Hz display cap; its per-call cost is only the append itself (typed-array shift, ~0.07 ms) since per-frame render is ~0.2–0.6 ms at this size.

## Takeaways

- **The gap widens with data.** At 10k the competitors are within ~10–75×; at 1M the best competitor (Chart.js with decimation) is 632× slower than our WebGPU path and 35× slower than our Canvas2D path.
- **Their "big data" modes still lose.** Chart.js decimation (−90% vs its default at 1M) and Highcharts boost (−92% vs plain SVG at 1M) both help them enormously — and still trail our Canvas2D fallback by ~35–64×.
- **Streaming is the starkest real-world gap:** 120 fps vs 12–17 fps. Competitors re-render the whole window per point; ours shifts a ring buffer.
- **Size:** ResolvCharts is 3.6–13.8× smaller gzipped, with zero dependencies.
- **Caveat:** competitor "update" numbers include data re-processing ours doesn't pay (see Methodology). Even discounting that, the streaming fps and init numbers — which don't share that asymmetry — show the same ordering.

## Reproduce

```bash
pnpm build
python3 -m http.server 8931
# ours:   http://localhost:8931/bench/browser.html      → await window.runBench()
# theirs: http://localhost:8931/bench/competitors.html  → await window.run('chartjs','render','line',100000)
```

`window.run(lib, 'render'|'stream', type, N, {iters})` — lib ∈ `chartjs`, `chartjs-dec`, `apexcharts`, `highcharts`, `highcharts-boost`.
