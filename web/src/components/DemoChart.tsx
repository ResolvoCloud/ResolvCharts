import { Chart, type ChartProps } from "resolvcharts-solid";
import { si, siteTheme } from "../lib/theme";

export interface DemoChartProps extends ChartProps {
  /** Optional tick formatter shorthand (functions can't cross the island boundary). */
  fmt?: "si" | "int" | "usd";
}

/** Site-themed wrapper around `<Chart>` — all props map to ChartOptions. */
export default function DemoChart(props: DemoChartProps) {
  const labels = () => {
    const f =
      props.fmt === "usd"
        ? (v: number) => `$${si(v)}`
        : props.fmt === "int"
          ? (v: number) => `${Math.round(v)}`
          : props.fmt === "si"
            ? si
            : undefined;
    return f ? { y: f } : undefined;
  };
  const { fmt: _fmt, ...rest } = props;
  return (
    <div class="chart-frame">
      <Chart
        theme={siteTheme}
        height={240}
        animate={true}
        {...rest}
        labels={labels() ?? rest.labels}
      />
    </div>
  );
}
