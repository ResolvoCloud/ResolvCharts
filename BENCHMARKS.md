# Benchmarks

Canvas2D vs WebGPU render paths, measured in a real browser.

Benchmark date: 24 October 2026.

## Test device

| | |
|---|---|
| Machine | Apple M5 Pro, 48 GB RAM |
| OS | macOS 27.0.1 |
| Browser | Chromium 152 (Playwright) |
| GPU adapter | Apple Metal 3 (WebGPU `core-features-and-limits`, `timestamp-query`, `subgroups`) |
| Display | devicePixelRatio 2 |
| Chart size | 900 × 240 CSS px (~1800 × 480 device px plot) |

## Methodology

- **`submit`** — wall time of `chart.render(1)` on the JS thread (120 iterations, p50/p95/avg). A **whole-frame memo** keys each render on `(t, dataRev, gridRev, view domain, plot, hidden, hover, gpu state)` — an unchanged view returns early before `clearRect`, so `submit` ≈ 0 for repeat renders. A cold render (data/view change) still pays the full path: ~4 ms at line 1M canvas, ~140 ms at scatter 1M canvas, ~0.25–0.4 ms WebGPU encode+submit.
- **`gpuMs`** — measured GPU execution time via `timestamp-query` (quantized ~100 µs; indicative, not exact).
- **`appendMs`** — JS-side cost of `chart.append()` per call during a 3 s rAF stream.
- Two series per chart unless noted. Data: `50 + 30·sin(i/500) + (i%17)` style dense signals.

## Results

### Static render — `submit` ms (JS thread)

| Data | Canvas2D avg | WebGPU avg | WebGPU p95 |
|---|---|---|---|
| line 100k (2 series) | 0.027 | 0.017 | 0.10 |
| line 1M (2 series) | 0.015 | 0.013 | 0.10 |
| line 5M (2 series) | 0.023 | 0.010 | 0.10 |
| scatter 1M (2 series) | 0.014 | 0.012 | 0.10 |

`renderer: "auto"` matched `webgpu` in every case (GPU engaged at ≥50k total points via `gpuThreshold`).

The numbers collapsed vs the previous run because `render()` now memoizes the whole frame: a repeat call with unchanged `(data, view, t, hidden, hover)` returns immediately — the previous frame is already on screen. This is the common real-world case (hover repaints, tooltips, programmatic re-renders). During animation/zoom/pan/append the key changes every frame and the full path still runs; streaming numbers below reflect that.

### GPU-side pass time (`gpuMs`)

| Data | avg | p95 |
|---|---|---|
| line 100k | 0.23 ms | 0.26 |
| line 1M | 0.43 ms | 0.52 |
| line 5M | 0.12 ms | 0.20 |

The 5M case is cheaper than 1M on the GPU because M4 compute decimation collapses the data to ≤4 points per pixel column before rasterization — vertex work is bounded by plot width, not point count.

### Streaming — `window: 50_000`, `flow: true`, append per rAF

| Renderer | fps | append() JS avg |
|---|---|---|
| canvas | 120.2 | 0.093 ms |
| webgpu | 120.3 | 0.117 ms |

Append itself is already cheap either way (typed-array shift in place). The difference is that the WebGPU path writes only the appended tail (24 bytes/series) to the ring buffer and never re-uploads the window, while each subsequent frame render is ~0.2 ms instead of ms-scale decimation.

## Safari cross-check

| | |
|---|---|
| Browser | Safari 27.0.1 (WebKit 605.1.15) |
| WebGPU | supported (`navigator.gpu`, Metal) |
| Timing note | `performance.now()` quantized to ~1 ms — sub-ms cells only resolvable via averages |

`submit` avg ms vs Chromium 152 (same build, same machine). Safari figures predate the whole-frame memo — repeat renders there are now ~0 as well; treat them as the warm/cold-path comparison:

| Cell | Chromium (post-memo) | Safari (pre-memo) |
|---|---|---|
| line 100k canvas | 0.027 | ~0.45 |
| line 100k webgpu | 0.017 | ~0.35 |
| line 1M canvas | 0.015 | ~0.9 |
| scatter 1M canvas | 0.014 | ~545 (p50 352) |

Differences vs Chrome:

- **Memoized line path is sub-ms in both engines** — repeat renders of an unchanged view are one `stroke()` + blit in either renderer.
- **WebGPU submit is comparable** (~0.35 vs ~0.25 ms at 100k) — the GPU path works end-to-end on WebKit, including `timestamp-query`-free adapters (gpuMs not available without the feature).
- **Scatter/bubble arc raster is ~4× slower in WebKit** (~545 ms vs ~140 ms at 1M canvas). On Safari, `renderer: "auto"`/WebGPU (~0.2 ms, one instanced quad draw) is effectively required at large point counts — Canvas2D `arc`-per-point is ~2700× slower.
- WebGPU submit reads higher than this doc's original Chromium 152 run (~0.16–0.18) in **both** browsers on this machine — the delta is session/driver state, not engine or code.

## Takeaways

- Repeat renders are **free** (~0.01–0.03 ms, the memo key compare): an unchanged view early-returns before `clearRect`. Cold renders still do the real work.
- Cold-path JS cost is effectively **O(decimated output)**, not O(n): Canvas2D decimates+traces to ≤4 pts/column; WebGPU either reuses the cached decimation buffer or dispatches the compute pass once per (data, view) change.
- Canvas2D remains the right default below ~50k total points (no adapter acquisition, no buffer upload) — hence `renderer: "auto"` + `gpuThreshold`.
- Cold scatter is the largest cold-path gap (~140 ms canvas — arc per point — vs ~0.2 ms GPU instanced quad); the memo makes it a non-issue on repaints but first paint of 1M scatter still wants WebGPU.

## Reproduce

```bash
pnpm build
python3 -m http.server 8931
# open http://localhost:8931/bench/browser.html in a WebGPU-capable browser, then:
await window.runBench()   # in devtools; returns a JSON report
```

`bench/browser.html` measures: adapter probes (core + compatibility mode), render `submit`/`gpuMs` at 100k/1M/5M for `canvas`/`webgpu`/`auto`, 1M scatter, and a 3 s streaming-append A/B.
