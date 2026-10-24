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

- **`submit`** — wall time of `chart.render(1)` on the JS thread (120 iterations, p50/p95/avg). For Canvas2D this is the full cost: decimation scan + path build + raster submit. For WebGPU it is uniform writes + draw/dispatch encoding only; raster happens on the GPU.
- **`gpuMs`** — measured GPU execution time via `timestamp-query` (quantized ~100 µs; indicative, not exact).
- **`appendMs`** — JS-side cost of `chart.append()` per call during a 3 s rAF stream.
- Two series per chart unless noted. Data: `50 + 30·sin(i/500) + (i%17)` style dense signals.

## Results

### Static render — `submit` ms (JS thread)

| Data | Canvas2D avg | WebGPU avg | WebGPU p95 | Speedup |
|---|---|---|---|---|
| line 100k (2 series) | 0.65 | 0.16 | 0.30 | ~4× |
| line 1M (2 series) | 4.09 | 0.18 | 0.30 | ~23× |
| line 5M (2 series) | 14.79 | 0.17 | 0.30 | ~87× |
| scatter 1M (2 series) | 140.9 | 0.15 | 0.20 | ~940× |

`renderer: "auto"` matched `webgpu` in every case (GPU engaged at ≥50k total points via `gpuThreshold`).

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
| canvas | 120.4 | 0.056 ms |
| webgpu | 120.4 | 0.051 ms |

Append itself is already cheap either way (typed-array shift in place). The difference is that the WebGPU path writes only the appended tail (24 bytes/series) to the ring buffer and never re-uploads the window, while each subsequent frame render is ~0.2 ms instead of ms-scale decimation.

## Takeaways

- Per-frame JS cost on the GPU path is effectively **O(1) in point count** — data lives in GPU buffers (affine-encoded); view changes are uniform writes.
- The old GPU path still paid an O(n) CPU decimation scan every frame; the compute pass removed it. That is where the 23–87× line numbers come from.
- Canvas2D remains the right default below ~50k total points (no adapter acquisition, no buffer upload; per-frame GPU win there is only ~0.1–0.2 ms) — hence `renderer: "auto"` + `gpuThreshold`.
- Scatter shows the largest gap because the Canvas2D path draws an arc per point; the GPU path is one instanced quad draw regardless of count.

## Reproduce

```bash
pnpm build
python3 -m http.server 8931
# open http://localhost:8931/bench/browser.html in a WebGPU-capable browser, then:
await window.runBench()   # in devtools; returns a JSON report
```

`bench/browser.html` measures: adapter probes (core + compatibility mode), render `submit`/`gpuMs` at 100k/1M/5M for `canvas`/`webgpu`/`auto`, 1M scatter, and a 3 s streaming-append A/B.
