import { Chart, type ChartInstance } from "resolvcharts-solid";
import { createSignal, onCleanup, onMount } from "solid-js";
import { siteTheme } from "../lib/theme";

const WINDOW = 50_000;

/**
 * Layered harmonics — slow swells + medium ripple + faint texture, so the
 * 50k-point trace reads as two weaving bands instead of aliased sawtooth.
 */
const y1 = (i: number) =>
  52 +
  16 * Math.sin(i / 5200) +
  8 * Math.sin(i / 1150 + 1.9) +
  3.4 * Math.sin(i / 190) +
  1.1 * Math.sin(i / 43);
const y2 = (i: number) =>
  48 +
  13 * Math.cos(i / 4300 + 0.6) +
  7 * Math.sin(i / 860 + 0.4) +
  2.8 * Math.sin(i / 230 + 2.6) +
  1.1 * Math.cos(i / 57);

const heroData = () => {
  const x = new Array<number>(WINDOW);
  const a = new Array<number>(WINDOW);
  const b = new Array<number>(WINDOW);
  for (let i = 0; i < WINDOW; i++) {
    x[i] = i;
    a[i] = y1(i);
    b[i] = y2(i);
  }
  return {
    x,
    series: [
      { label: "sensor·a", y: a },
      { label: "sensor·b", y: b },
    ],
  };
};

/** Hero: 100k-point (50k × 2 series) rolling stream, appended every rAF. */
export default function HeroStream() {
  const [fps, setFps] = createSignal(0);
  const [appendUs, setAppendUs] = createSignal(0);
  const [gpu, setGpu] = createSignal<string>("probing…");

  let chart: ChartInstance | null = null;
  let host: HTMLDivElement | undefined;
  let raf = 0;
  let running = false;
  let x = WINDOW;
  let frames = 0;
  let appends = 0;
  let appendAcc = 0;
  let last = performance.now();

  const loop = (t: number) => {
    if (!running) return;
    x += 1;
    const a = performance.now();
    chart?.append(x, [y1(x), y2(x)]);
    appendAcc += performance.now() - a;
    appends++;
    frames++;
    if (t - last >= 800) {
      setFps((frames * 1000) / (t - last));
      setAppendUs((appendAcc / Math.max(1, appends)) * 1000);
      frames = 0;
      appends = 0;
      appendAcc = 0;
      last = t;
      const g = (chart as unknown as { gpu?: { unavailable?: boolean } } | null)
        ?.gpu;
      if (g) setGpu(g.unavailable ? "canvas" : "webgpu");
      else setGpu("canvas");
    }
    raf = requestAnimationFrame(loop);
  };

  const start = () => {
    if (running) return;
    running = true;
    last = performance.now();
    raf = requestAnimationFrame(loop);
  };
  const stop = () => {
    running = false;
    cancelAnimationFrame(raf);
  };

  let io: IntersectionObserver | null = null;
  onMount(() => {
    io = new IntersectionObserver(
      (es) => {
        for (const e of es) e.isIntersecting ? start() : stop();
      },
      { threshold: 0.05 },
    );
    if (host) io.observe(host);
  });
  onCleanup(() => {
    stop();
    io?.disconnect();
  });

  return (
    <div ref={host} class="panel">
      <div class="panel-head">
        <span class="dot" />
        <span>
          live — append() every frame, 50k-point rolling window × 2 series
        </span>
        <span class="spacer" />
        <span>{gpu()}</span>
      </div>
      <div class="panel-body">
        <Chart
          ref={(c) => (chart = c)}
          type="line"
          theme={siteTheme}
          height={320}
          window={WINDOW}
          flow={true}
          legend={{ position: "top" }}
          tooltip={false}
          animate={false}
          curve="smooth"
          data={heroData()}
        />
        <div class="hud" style={{ "margin-top": "12px" }}>
          <span class="chip">
            fps <b>{fps().toFixed(0)}</b>
          </span>
          <span class="chip">
            append() <b>{appendUs().toFixed(0)}µs</b>
          </span>
          <span class="chip">
            points on screen <b>{(WINDOW * 2).toLocaleString()}</b>
          </span>
          <span class="chip">
            renderer <b>{gpu()}</b>
          </span>
        </div>
      </div>
    </div>
  );
}
