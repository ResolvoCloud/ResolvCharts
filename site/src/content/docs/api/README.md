---
editUrl: false
next: false
prev: false
title: "resolvcharts"
---

## Charts

- [Chart](/ResolvCharts/api/classes/chart/)
- [createChart](/ResolvCharts/api/functions/createchart/)
- [ChartType](/ResolvCharts/api/type-aliases/charttype/)
- [CategorySeriesKind](/ResolvCharts/api/type-aliases/categoryserieskind/)
- [CurveMode](/ResolvCharts/api/type-aliases/curvemode/)
- [HoverInfo](/ResolvCharts/api/type-aliases/hoverinfo/)
- [ChartOptions](/ResolvCharts/api/interfaces/chartoptions/)

## Data

- [SeriesInput](/ResolvCharts/api/interfaces/seriesinput/)
- [XYData](/ResolvCharts/api/interfaces/xydata/)
- [CategorySeriesInput](/ResolvCharts/api/interfaces/categoryseriesinput/)
- [CategoryData](/ResolvCharts/api/interfaces/categorydata/)
- [DonutSlice](/ResolvCharts/api/interfaces/donutslice/)
- [DonutData](/ResolvCharts/api/interfaces/donutdata/)
- [OHLCCandle](/ResolvCharts/api/interfaces/ohlccandle/)
- [OHLCData](/ResolvCharts/api/interfaces/ohlcdata/)
- [WaterfallData](/ResolvCharts/api/interfaces/waterfalldata/)
- [ChartData](/ResolvCharts/api/type-aliases/chartdata/)

## Types

- [Rect](/ResolvCharts/api/interfaces/rect/)

## Theming

- [lightTheme](/ResolvCharts/api/variables/lighttheme/)
- [darkTheme](/ResolvCharts/api/variables/darktheme/)
- [resolveTheme](/ResolvCharts/api/functions/resolvetheme/)
- [ThemeTokens](/ResolvCharts/api/interfaces/themetokens/)

## Utilities

- [decimateM4](/ResolvCharts/api/functions/decimatem4/)
- [nearestIndex](/ResolvCharts/api/functions/nearestindex/)
- [computeTicks](/ResolvCharts/api/functions/computeticks/)
- [Scale](/ResolvCharts/api/interfaces/scale/)

## Formatting
Compact number formatting: integers verbatim, else 4 significant digits.

- [formatNumber](/ResolvCharts/api/functions/formatnumber/)

## Formatting
SI-suffixed formatting: `1.2k`, `3.4M`, `5B`.

- [formatSI](/ResolvCharts/api/functions/formatsi/)

## Utilities
`[min, max]` of `values`; degenerate inputs get a sane fallback domain.

- [extent](/ResolvCharts/api/functions/extent/)

## Utilities
Linear scale from domain `[d0, d1]` to range `[r0, r1]`, with `invert`.

- [linearScale](/ResolvCharts/api/functions/linearscale/)

## Utilities
Pad a domain by 5% on each end; `includeZero` anchors the axis at 0.

- [padDomain](/ResolvCharts/api/functions/paddomain/)
