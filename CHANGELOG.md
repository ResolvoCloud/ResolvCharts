# Changelog

## 0.2.0

### Added

- **`combo` chart type** — per-series `kind`: `column` (default), `line`, or `area`. Columns group (or stack with `stacked: true`) per category; line/area series overlay on category centers.
- **`canvas` option** — pass `getContext("2d", …)` settings to all layers, e.g. `{ willReadFrequently: true }` which measurably reduces submit cost in Chrome.
- **`resolvcharts-react`** — React wrapper package (workspace: `react/`).

### Changed

- **Docs**: migrated to Starlight — landing page, guides, full-text search, and auto-generated categorized API reference. Deployed to GitHub Pages.
- **JSDoc coverage** across the public API (`@category` grouping).
- **Release pipeline** now uses npm Trusted Publishing (OIDC) — no tokens.

## 0.1.0

Initial release: 10 chart types, zero-dependency Canvas2D renderer, opt-in WebGPU backend (`renderer: "auto"`), `flow` continuous-motion streaming, `window`/`maxPoints` live retention, typed-array hot paths with M4 decimation.
