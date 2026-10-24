import {
  type ChartData,
  type Chart as ChartInstance,
  type ChartOptions,
  createChart,
} from "resolvcharts";
import type { JSX } from "solid-js";
import { createEffect, onCleanup, onMount } from "solid-js";

export type {
  Chart as ChartInstance,
  ChartData,
  ChartOptions,
  ChartType,
  HoverInfo,
} from "resolvcharts";

export interface ChartProps extends Omit<ChartOptions, "data" | "onHover"> {
  data: ChartData;
  /**
   * Live-updated — always the latest render's callback, never triggers a
   * chart rebuild.
   */
  onHover?: ChartOptions["onHover"];
  /** Called with the chart instance once mounted (for `append()`, etc.). */
  onReady?: (chart: ChartInstance) => void;
  /** Ref to the underlying chart instance. */
  ref?: (chart: ChartInstance | null) => void;
  class?: string;
  style?: JSX.CSSProperties | string;
}

/**
 * `<Chart type="line" data={data()} />` — props map 1:1 to `ChartOptions`.
 * `data` updates animate via `setData()`; `type` changes rebuild the chart.
 * All other options are captured at mount — wrap in a keyed `<Show>`/Dynamic
 * to force a rebuild.
 */
export function Chart(props: ChartProps): JSX.Element {
  const el = document.createElement("div");
  if (props.class) el.className = props.class;
  const style = props.style;
  if (typeof style === "string") el.style.cssText = style;
  else if (style) Object.assign(el.style, style);

  let chart: ChartInstance | null = null;
  let mounted = false;

  const build = () => {
    const {
      data,
      onHover,
      onReady,
      ref,
      class: _c,
      style: _s,
      ...options
    } = props;
    chart = createChart(el, {
      ...options,
      data,
      onHover: (info) => props.onHover?.(info),
    });
    props.ref?.(chart);
    props.onReady?.(chart);
  };

  const teardown = () => {
    chart?.destroy();
    chart = null;
    props.ref?.(null);
  };

  onMount(() => {
    mounted = true;
    build();
  });
  onCleanup(teardown);

  // `type` changes rebuild the chart (data carries over via the data effect)
  let prevType = props.type;
  createEffect(() => {
    if (props.type === prevType) return;
    prevType = props.type;
    if (!mounted) return;
    teardown();
    build();
  });

  // `data` updates stream through the existing chart
  let dataInit = false;
  createEffect(() => {
    const data = props.data;
    if (!dataInit) {
      dataInit = true;
      return;
    }
    chart?.setData(data);
  });

  return el;
}
