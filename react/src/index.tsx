import type { CSSProperties, ReactElement, Ref } from "react";
import { useEffect, useRef } from "react";
import {
  type ChartData,
  type Chart as ChartInstance,
  type ChartOptions,
  createChart,
} from "resolvcharts";

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
  ref?: Ref<ChartInstance>;
  className?: string;
  style?: CSSProperties;
}

/**
 * `<Chart type="line" data={...} />` — props map 1:1 to `ChartOptions`.
 * `data` updates animate via `setData()`; `type` changes rebuild the chart.
 * Other options are captured at mount — pass a React `key` to force a rebuild.
 */
export function Chart({
  data,
  onHover,
  onReady,
  ref,
  className,
  style,
  ...options
}: ChartProps): ReactElement {
  const elRef = useRef<HTMLDivElement | null>(null);
  const chartRef = useRef<ChartInstance | null>(null);
  const dataRef = useRef(data);
  const onHoverRef = useRef(onHover);
  const onReadyRef = useRef(onReady);
  const optionsRef = useRef(options);
  dataRef.current = data;
  onHoverRef.current = onHover;
  onReadyRef.current = onReady;
  optionsRef.current = options;

  const type = options.type;
  useEffect(() => {
    const el = elRef.current;
    if (!el) return;
    const chart = createChart(el, {
      ...optionsRef.current,
      type,
      data: dataRef.current,
      onHover: (info) => onHoverRef.current?.(info),
    });
    chartRef.current = chart;
    if (typeof ref === "function") ref(chart);
    else if (ref) ref.current = chart;
    onReadyRef.current?.(chart);
    return () => {
      chart.destroy();
      chartRef.current = null;
      if (typeof ref === "function") ref(null);
      else if (ref) ref.current = null;
    };
  }, [type, ref]);

  const mounted = useRef(false);
  useEffect(() => {
    if (!mounted.current) {
      mounted.current = true;
      return;
    }
    chartRef.current?.setData(data);
  }, [data]);

  return <div ref={elRef} className={className} style={style} />;
}
