import { createChart } from "../dist/index.mjs";
import { examples, makeShared } from "./examples.js";

const root = document.querySelector("#root");
const ui = {
  theme: document.querySelector("#ui-theme"),
  renderer: document.querySelector("#ui-renderer"),
};

// restore toggles
ui.theme.value = localStorage.getItem("demo.theme") || "light";
ui.renderer.value = localStorage.getItem("demo.renderer") || "auto";

let cleanups = [];

function mount() {
  for (const c of cleanups) c();
  cleanups = [];
  root.innerHTML = "";

  const shared = makeShared();
  let group = null;
  let grid = null;

  for (const ex of examples) {
    if (ex.group !== group) {
      group = ex.group;
      const h = document.createElement("h2");
      h.textContent = group;
      grid = document.createElement("div");
      grid.className = "grid";
      root.append(h, grid);
    }

    const card = document.createElement("article");
    card.className = `card${ex.dark ? " dark" : ""}`;

    const h3 = document.createElement("h3");
    h3.textContent = ex.title;

    const el = document.createElement("div");
    el.className = `chart${ex.compact ? " spark" : ""}`;

    const det = document.createElement("details");
    const sum = document.createElement("summary");
    sum.textContent = "options";
    const pre = document.createElement("pre");
    pre.textContent = `createChart(el, ${ex.options.toString()}(shared))`;
    det.append(sum, pre);

    card.append(h3, el, det);
    grid.append(card);

    const opts = {
      renderer: ui.renderer.value,
      theme: ui.theme.value,
      ...ex.options(shared),
    };
    const chart = createChart(el, opts);
    cleanups.push(() => chart.destroy());
    if (ex.live) cleanups.push(ex.live(chart, shared));
  }
}

for (const sel of [ui.theme, ui.renderer]) {
  sel.addEventListener("change", () => {
    localStorage.setItem(
      `demo.${sel === ui.theme ? "theme" : "renderer"}`,
      sel.value,
    );
    mount();
  });
}

mount();
