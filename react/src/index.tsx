import type {
  CSSProperties,
  ForwardedRef,
  ForwardRefExoticComponent,
  ReactElement,
  RefAttributes,
} from "react";
import { forwardRef, useEffect, useRef } from "react";
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
  className?: string;
  style?: CSSProperties;
}

const setRef = (ref: ForwardedRef<ChartInstance>, v: ChartInstance | null) => {
  if (typeof ref === "function") ref(v);
  else if (ref) ref.current = v;
};

/**
 * `<Chart type="line" data={...} ref={chartRef} />` — props map 1:1 to
 * `ChartOptions`. `data` updates animate via `setData()`; `type` changes
 * rebuild the chart. Other options are captured at mount — pass a React
 * `key` to force a rebuild. `ref` yields the chart instance (React 18/19).
 */
export const Chart: ForwardRefExoticComponent<
  ChartProps & RefAttributes<ChartInstance>
> = forwardRef<ChartInstance, ChartProps>(function Chart(
  { data, onHover, onReady, className, style, ...options },
  ref,
): ReactElement {
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
    onReadyRef.current?.(chart);
    return () => {
      chart.destroy();
      chartRef.current = null;
    };
  }, [type]);

  // keeps the forwarded ref pointed at the live chart — covers mount,
  // `type` rebuilds, and mid-life ref swaps (ref identity is in the deps
  // but never rebuilds the chart itself)
  // biome-ignore lint/correctness/useExhaustiveDependencies: `type` re-syncs the ref after a chart rebuild
  useEffect(() => {
    setRef(ref, chartRef.current);
    return () => setRef(ref, null);
  }, [ref, type]);

  const mounted = useRef(false);
  useEffect(() => {
    if (!mounted.current) {
      mounted.current = true;
      return;
    }
    chartRef.current?.setData(data);
  }, [data]);

  return <div ref={elRef} className={className} style={style} />;
});

Chart.displayName = "Chart";
