import { type Chart, createChart, type XYData } from "resolvcharts";
import { createSignal, For, Show } from "solid-js";
import { makeScatter, makeXY, siteTheme } from "../lib/theme";

type Renderer = "auto" | "canvas" | "webgpu";

interface Run {
  cfg: string;
  warmAvg: number;
  warmP95: number;
  coldAvg: number;
  coldP95: number;
  gpuMs: number | null;
  gpu: boolean;
}

const frame = () => new Promise<void>((r) => requestAnimationFrame(() => r()));
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

function stats(ts: number[]) {
  const s = [...ts].sort((a, b) => a - b);
  const q = (p: number) =>
    s[Math.min(s.length - 1, Math.floor(p * s.length))] ?? 0;
  return {
    avg: ts.reduce((a, b) => a + b, 0) / ts.length,
    p50: q(0.5),
    p95: q(0.95),
  };
}

const fmt = (ms: number) =>
  ms >= 100 ? ms.toFixed(0) : ms >= 10 ? ms.toFixed(1) : ms.toFixed(3);

/**
 * Live render benchmark — measures `chart.render(1)` on the JS thread,
 * warm (memoized repeat) and cold (after setData) paths.
 */
export default function RenderBench() {
  const [type, setType] = createSignal<"line" | "scatter">("line");
  const [points, setPoints] = createSignal(1_000_000);
  const [renderer, setRenderer] = createSignal<Renderer>("auto");
  const [running, setRunning] = createSignal(false);
  const [progress, setProgress] = createSignal(0);
  const [runs, setRuns] = createSignal<Run[]>([]);
  const [last, setLast] = createSignal<Run | null>(null);

  let stage: HTMLDivElement | undefined;
  let chart: Chart | null = null;

  const data = (n: number): XYData =>
    type() === "scatter" ? makeScatter(n) : makeXY(n);

  async function run() {
    if (running() || !stage) return;
    setRunning(true);
    setProgress(0);
    stage.innerHTML = "";
    chart = createChart(stage, {
      type: type(),
      renderer: renderer(),
      gpu: { timing: true },
      animate: false,
      tooltip: false,
      height: 240,
      theme: siteTheme,
      data: data(points()),
    });
    await sleep(400);
    const c = chart as unknown as {
      render: (t: number) => void;
      gpu?: { unavailable?: boolean; gpuMs?: number };
    };
    const gpu = !!c.gpu && !c.gpu.unavailable;
    const gpuTimes: number[] = [];
    const warm: number[] = [];
    const WARM = 120;
    for (let i = 0; i < WARM; i++) {
      const t0 = performance.now();
      c.render(1);
      warm.push(performance.now() - t0);
      if (c.gpu?.gpuMs != null) gpuTimes.push(c.gpu.gpuMs);
      if (i % 12 === 0) setProgress((i / (WARM + 30)) * 100);
      await frame();
    }
    // cold path: bump dataRev via setData, then time the very next render
    const cold: number[] = [];
    const COLD = 30;
    for (let i = 0; i < COLD; i++) {
      chart.setData(data(points()));
      const t0 = performance.now();
      c.render(1);
      cold.push(performance.now() - t0);
      setProgress(((WARM + i) / (WARM + COLD)) * 100);
      await frame();
      await frame();
    }
    const w = stats(warm);
    const cd = stats(cold);
    const g = gpuTimes.length ? stats(gpuTimes) : null;
    const r: Run = {
      cfg: `${type()} ${points() >= 1e6 ? `${points() / 1e6}M` : `${points() / 1e3}k`} ×2 · ${renderer()}${gpu ? "→gpu" : ""}`,
      warmAvg: w.avg,
      warmP95: w.p95,
      coldAvg: cd.avg,
      coldP95: cd.p95,
      gpuMs: g?.avg ?? null,
      gpu,
    };
    setRuns((rs) => [...rs.slice(-7), r]);
    setLast(r);
    setProgress(100);
    setRunning(false);
  }

  const ro = (v: () => number | null, unit = "ms") => (
    <span class="v" classList={{ idle: v() == null }}>
      {v() == null ? "—" : fmt(v() ?? 0)}
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
          <label for="rb-type">chart type</label>
          <select
            id="rb-type"
            value={type()}
            onChange={(e) => {
              const t = e.currentTarget.value as "line" | "scatter";
              setType(t);
              if (t === "scatter" && points() > 1e6) setPoints(1e6);
            }}
            disabled={running()}
          >
            <option value="line">line</option>
            <option value="scatter">scatter</option>
          </select>
        </div>
        <div class="field">
          <label for="rb-points">points / series (2 series)</label>
          <select
            id="rb-points"
            value={points()}
            onChange={(e) => setPoints(Number(e.currentTarget.value))}
            disabled={running()}
          >
            <option value={10_000}>10,000</option>
            <option value={100_000}>100,000</option>
            <option value={1_000_000}>1,000,000</option>
            <Show when={type() === "line"}>
              <option value={5_000_000}>5,000,000</option>
            </Show>
          </select>
        </div>
        <div class="field">
          <label for="rb-renderer">renderer</label>
          <select
            id="rb-renderer"
            value={renderer()}
            onChange={(e) => setRenderer(e.currentTarget.value as Renderer)}
            disabled={running()}
          >
            <option value="auto">auto</option>
            <option value="canvas">canvas</option>
            <option value="webgpu">webgpu</option>
          </select>
        </div>
        <button
          type="button"
          class="btn primary"
          onClick={run}
          disabled={running()}
          style={{ "margin-top": "auto" }}
        >
          {running() ? "measuring…" : "▶ run benchmark"}
        </button>
        <div class="micro">
          120 warm + 30 cold
          <br />
          render(1) · JS thread
        </div>
      </div>
      <div class="lab-stage">
        <div class="lab-readouts">
          <div class="readout">
            {ro(() => last()?.warmAvg ?? null)}
            <div class="k">warm render avg</div>
          </div>
          <div class="readout">
            {ro(() => last()?.warmP95 ?? null)}
            <div class="k">warm p95</div>
          </div>
          <div class="readout">
            {ro(() => last()?.coldAvg ?? null)}
            <div class="k">cold render avg</div>
          </div>
          <div class="readout">
            {ro(() => last()?.gpuMs ?? null)}
            <div class="k">gpu pass (avg)</div>
          </div>
        </div>
        <div class="progress">
          <i style={{ width: `${progress()}%` }} />
        </div>
        <div ref={stage} />
        <Show when={runs().length > 0}>
          <table class="runlog">
            <thead>
              <tr>
                <th>run</th>
                <th class="n">warm avg</th>
                <th class="n">warm p95</th>
                <th class="n">cold avg</th>
                <th class="n">cold p95</th>
                <th class="n">gpu ms</th>
              </tr>
            </thead>
            <tbody>
              <For each={runs()}>
                {(r) => (
                  <tr>
                    <td>{r.cfg}</td>
                    <td class="n">{fmt(r.warmAvg)}</td>
                    <td class="n">{fmt(r.warmP95)}</td>
                    <td class="n">{fmt(r.coldAvg)}</td>
                    <td class="n">{fmt(r.coldP95)}</td>
                    <td class="n">{r.gpuMs == null ? "—" : fmt(r.gpuMs)}</td>
                  </tr>
                )}
              </For>
            </tbody>
          </table>
        </Show>
      </div>
    </div>
  );
}
