import starlight from "@astrojs/starlight";
import { defineConfig } from "astro/config";
import starlightTypeDoc from "starlight-typedoc";

export default defineConfig({
  site: "https://resolvocloud.github.io",
  base: "/ResolvCharts",
  integrations: [
    starlight({
      title: "ResolvCharts",
      description:
        "Minimal, zero-dependency canvas charting library with optional WebGPU rendering.",
      social: [
        {
          icon: "github",
          label: "GitHub",
          href: "https://github.com/ResolvoCloud/ResolvCharts",
        },
        {
          icon: "npm",
          label: "npm",
          href: "https://www.npmjs.com/package/resolvcharts",
        },
      ],
      plugins: [
        starlightTypeDoc({
          entryPoints: ["src/index.ts"],
          tsconfig: "tsconfig.json",
          sidebar: {
            label: "API Reference",
            collapsed: false,
          },
        }),
      ],
    }),
  ],
});
