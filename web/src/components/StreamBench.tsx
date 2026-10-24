import { type Chart, createChart } from "resolvcharts";
import { createSignal, Show } from "solid-js";
import { makeXY, siteTheme } from "../lib/theme";

type Renderer = "auto" | "canvas" | "webgpu";

const frame = () => new Promise<void>((r) => requestAnimationFrame(() => r()));
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const WINDOW = 50_000;
const DURATION = 4000;

/**
 * Live streaming benchmark — 50k-point rolling window, one append per rAF
 * for 4 s, reporting achieved fps + per-call append() cost.
 */
export default function StreamBench() {
  const [renderer, setRenderer] = createSignal<Renderer>("auto");
  const [running, setRunning] = createSignal(false);
  const [fps, setFps] = createSignal<number | null>(null);
  const [appendMs, setAppendMs] = createSignal<number | null>(null);
  const [liveFps, setLiveFps] = createSignal(0);
  const [gpu, setGpu] = createSignal(false);
  const [progress, setProgress] = createSignal(0);

  let stage: HTMLDivElement | undefined;
  let chart: Chart | null = null;

  async function run() {
    if (running() || !stage) return;
    setRunning(true);
    setFps(null);
    setAppendMs(null);
    setProgress(0);
    stage.innerHTML = "";
    chart = createChart(stage, {
      type: "line",
      renderer: renderer(),
      flow: true,
      animate: false,
      window: WINDOW,
      tooltip: false,
      height: 240,
      theme: siteTheme,
      data: makeXY(WINDOW),
    });
    await sleep(400);
    const c = chart as unknown as { gpu?: { unavailable?: boolean } };
    setGpu(!!c.gpu && !c.gpu.unavailable);

    let x = WINDOW;
    let frames = 0;
    let winFrames = 0;
    let winLast = performance.now();
    const appendTimes: number[] = [];
    const y1 = (i: number) => 50 + 30 * Math.sin(i / 500) + (i % 17);
    const y2 = (i: number) => 60 + 20 * Math.cos(i / 300) + (i % 13);
    const t0 = performance.now();
    while (performance.now() - t0 < DURATION) {
      await frame();
      x += 1;
      const a = performance.now();
      chart?.append(x, [y1(x), y2(x)]);
      appendTimes.push(performance.now() - a);
      frames++;
      winFrames++;
      const t = performance.now();
      if (t - winLast >= 500) {
        setLiveFps((winFrames * 1000) / (t - winLast));
        winFrames = 0;
        winLast = t;
      }
      setProgress(Math.min(100, ((t - t0) / DURATION) * 100));
    }
    const elapsed = performance.now() - t0;
    const avg = appendTimes.reduce((a, b) => a + b, 0) / appendTimes.length;
    setFps((frames / elapsed) * 1000);
    setAppendMs(avg);
    setRunning(false);
  }

  const cell = (v: () => number | null, digits: number, unit: string) => (
    <span class="v" classList={{ idle: v() == null }}>
      {v() == null ? "—" : (v() ?? 0).toFixed(digits)}
      <span style={{ "font-size": "10px", color: "var(--muted)" }}>
        {" "}
        {unit}
      </span>
    </span>
  );

  return (
    <div class="lab">
      <div class="lab-controls">
        <div class="field">
          <label for="sb-renderer">renderer</label>
          <select
            id="sb-renderer"
            value={renderer()}
            onChange={(e) => setRenderer(e.currentTarget.value as Renderer)}
            disabled={running()}
          >
            <option value="auto">auto</option>
            <option value="canvas">canvas</option>
            <option value="webgpu">webgpu</option>
          </select>
        </div>
        <div class="field">
          <label for="sb-window">window</label>
          <select id="sb-window" disabled>
            <option>50,000 pts × 2 series</option>
          </select>
        </div>
        <div class="field">
          <label for="sb-duration">duration</label>
          <select id="sb-duration" disabled>
            <option>4 s · append per rAF</option>
          </select>
        </div>
        <button
          type="button"
          class="btn primary"
          onClick={run}
          disabled={running()}
          style={{ "margin-top": "auto" }}
        >
          {running()
            ? `streaming… ${liveFps().toFixed(0)} fps`
            : "▶ run stream test"}
        </button>
        <div class="micro">
          {gpu() ? "webgpu engaged" : "canvas2d"}
          <br />
          vs competitors: 12–17 fps
        </div>
      </div>
      <div class="lab-stage">
        <div class="lab-readouts">
          <div class="readout">
            {cell(fps, 1, "fps")}
            <div class="k">achieved fps</div>
          </div>
          <div class="readout">
            {cell(appendMs, 3, "ms")}
            <div class="k">append() js avg</div>
          </div>
          <div class="readout">
            <span class="v" classList={{ idle: !running() && fps() == null }}>
              {running()
                ? liveFps().toFixed(0)
                : fps() == null
                  ? "—"
                  : (fps() ?? 0).toFixed(0)}
              <span style={{ "font-size": "10px", color: "var(--muted)" }}>
                {" "}
                fps
              </span>
            </span>
            <div class="k">live</div>
          </div>
          <div class="readout">
            <span class="v" classList={{ idle: !running() && fps() == null }}>
              {running() || fps() != null ? (gpu() ? "GPU" : "CPU") : "—"}
            </span>
            <div class="k">raster path</div>
          </div>
        </div>
        <div class="progress">
          <i style={{ width: `${progress()}%` }} />
        </div>
        <div ref={stage} />
        <Show when={fps() != null}>
          <div class="micro">
            display cap on this machine applies — competitors peg at 12–17 fps
            on the same workload (see table below)
          </div>
        </Show>
      </div>
    </div>
  );
}
