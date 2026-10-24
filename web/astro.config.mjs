import solid from "@astrojs/solid-js";
import { defineConfig } from "astro/config";

export default defineConfig({
  site: "https://resolvocloud.github.io",
  base: "/ResolvCharts",
  integrations: [solid()],
});
