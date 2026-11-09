---
status: accepted
version: 1
priority: p1
date: 2026-11-09
decision-makers: template-dashboard architecture maintainers
description: "Decision record for the charts of the catalog chart widget types: the ui-kit chart component (the shadcn chart on Recharts) for cartesian_chart and pie_chart, with series colours from the kit's chart tokens of the scope the host theme id maps to, and the heatmap drawn by its widget from kit tokens with no chart library; counted by the DESIGN budget rule."
---

# ADR-0004: Charting library

**ID**: `cpt-frontx-dashboard-adr-charting-library`

<!-- toc -->

- [Context and Problem Statement](#context-and-problem-statement)
- [Decision Drivers](#decision-drivers)
- [Considered Options](#considered-options)
- [Decision Outcome](#decision-outcome)
  - [Consequences](#consequences)
  - [Confirmation](#confirmation)
- [Pros and Cons of the Options](#pros-and-cons-of-the-options)
  - [The ui-kit chart component on Recharts](#the-ui-kit-chart-component-on-recharts)
  - [Apache ECharts with `echarts/core`](#apache-echarts-with-echartscore)
  - [Chart.js with `react-chartjs-2`](#chartjs-with-react-chartjs-2)
- [More Information](#more-information)
- [Traceability](#traceability)

<!-- /toc -->

## Context and Problem Statement

The catalog chart widget types `cartesian_chart`, `pie_chart` and `heatmap` draw cartesian charts (bar, line, area, scatter), pie charts and heatmaps from the typed data the dashboard root passes through `render_widget` ([ADR-0009](0009-subject-agnostic-widget-catalog-v1.md)). A widget is a passive renderer: it renders the `render_widget {render, value_format?, data}` action, including its own empty state, and makes no requests. Which charting library should the catalog chart widgets use, and how do charts take the host's light or dark look?

The template has no theme of its own. Its only theme input is the host theme id, a shared property the dashboard root publishes, and every widget maps that id to the light or dark scope of `@gears-frontx/ui-kit` ([ADR-0006](0006-theme-distribution-v1.md)). Charts must take their colours and typography from the kit tokens of that scope.

`@gears-frontx/ui-kit` ships a `Chart` component: a port of the shadcn chart on Recharts. `ChartContainer` sizes a Recharts chart and writes one `--color-<key>` custom property per series from a `ChartConfig`; `ChartTooltipContent` and `ChartLegendContent` draw the tooltip and the legend with kit styles. The kit publishes a five-step series palette, `--chart-1` to `--chart-5`, with a light and a dark value per step. The chart types themselves are Recharts components the widget composes inside the container.

FrontX isolates every widget instance: each evaluates its own copy of its code (FrontX ADR-0011). Every chart widget instance therefore evaluates its own copy of the charting library.

## Decision Drivers

* Charts must follow the ui-kit tokens of the light or dark scope the host theme id maps to, with no per-widget manual styling (`cpt-frontx-dashboard-nfr-visual-quality`).
* Charts must look like the charts of the rest of the product, which use the same kit component.
* A theme switch must restyle every chart without a request and without code that rebuilds a theme.
* The library must cover cartesian charts (bar, line, area, scatter, with a secondary axis and stacking) and pie charts.
* Download and evaluation cost must be understood under per-instance isolation.
* Charts must meet the accessibility requirement (`cpt-frontx-dashboard-fr-accessibility`): a localized accessible name, a text alternative of the delivered values, and colour never the only signal.

## Considered Options

* The ui-kit chart component on Recharts
* Apache ECharts with `echarts/core`
* Chart.js with `react-chartjs-2`

## Decision Outcome

Chosen option: "The ui-kit chart component on Recharts", because it is the chart of the kit the template already depends on, so the charts match the rest of the product, and its colours are CSS custom properties of the kit's own light and dark scopes, so a theme switch needs no theme code at all.

**Composition.** `cartesian_chart` and `pie_chart` render a kit `ChartContainer` with a `ChartConfig` built from the delivered series or slices, and compose the Recharts chart inside it: `ComposedChart` with `Bar`, `Line`, `Area` and `Scatter` for a cartesian chart, `PieChart` with `Pie` for a pie chart, with the kit's `ChartTooltip` and `ChartLegend` and their `*Content` components. The widget sets `--chart-aspect-ratio: auto` on the container so the chart fills its cell. Recharts is a dependency of the widgets package pinned to the version the kit pins.

**Colours and theme.** Each series or slice takes a step of the kit's series palette, `var(--chart-1)` to `var(--chart-5)`, in a fixed order that keeps neighbours apart and wraps after the fifth. The palette steps, the grid lines, the axes, the tooltip and the legend are kit tokens, so they follow the light or dark scope the widget selected from the host theme id. A theme switch changes the scope and nothing else: no theme object is built or registered, and no request is sent.

**The heatmap.** Recharts has no heatmap. The `heatmap` widget draws its tiles itself, as a grid of elements styled with the kit tokens of the active scope, with a numeric scale and a text alternative. It uses no chart library.

**Size and cost.** Recharts and ui-kit are listed in the manifest's `shared` array, so each is a shared dependency. Under the counting rule of the DESIGN, the budget measures transferred gzipped bytes on a cold load of the reference dashboard. Each widget entry counts only its own code against the per-widget figure. Shared dependencies are counted once, in an uncapped page total: their source text is fetched once only when every template widget publishes the same `contentHash` for it (FrontX ADR-0034), with realm-wide reach (FrontX ADR-0035). That reuse does not lower the evaluation cost: each chart instance evaluates its own copy (FrontX ADR-0011), and that cost counts against the initial-render budget. The figures of the DESIGN are provisional and confirmed by measurement.

**Accessibility.** Each chart has a localized accessible name and a text alternative of the delivered values, rendered as visually hidden text next to the chart. Every series is named in the tooltip and, unless the author hides the legend with `legend_position` `none`, in the legend; every slice is named with its value in the tooltip and the legend; the text alternative names them all in any case. So colour is never the only signal (`cpt-frontx-dashboard-fr-accessibility`). The widget catalog states these rules per chart type.

### Consequences

* Good, because the charts are the product's own kit charts, in both scopes, with no theme mapping in the template.
* Good, because a theme switch restyles every chart through CSS alone, with no rebuild and no request.
* Good, because the charts are SVG in the DOM, so their labels are text and inherit the kit's typography.
* Good, because the widget composes the chart from React components, so render options such as value labels, tilted tick labels, a secondary axis or a named line at the end of a series map to props of the matching Recharts component.
* Bad, because the heatmap is the widget's own drawing code, maintained with the catalog. Mitigation: it is a grid of styled tiles, with no axis or layout engine.
* Bad, because Recharts styles each chart element through its own props, so each chart type sets the kit colours on its own series components. Mitigation: one `ChartConfig` per chart and the `--color-<key>` properties keep the colour choice in one place per widget.
* Bad, because every chart instance evaluates Recharts again, and the per-instance cost of a chart widget is confirmed by measurement only, so the figures it counts against are provisional.

### Confirmation

Confirmed by rendering each chart widget type in the light and the dark kit scope, by inspecting them against the ui-kit tokens, by switching the host theme and checking that every chart restyles without a request, by a dependency check that finds Recharts pinned to the kit's version and no other chart library in the widgets package, and by measuring the chart widget entries under the counting rule of the DESIGN: transferred gzipped bytes of each entry's own code, Recharts and ui-kit counted once in the page total, and per-instance evaluation within the initial-render budget.

## Pros and Cons of the Options

### The ui-kit chart component on Recharts

The kit's `ChartContainer`, tooltip and legend, with the chart types composed from Recharts components.

* Good, because it is the chart the rest of the product uses, so the dashboard looks the same.
* Good, because the colours are kit custom properties that follow the active scope, so there is no theme to build.
* Good, because it covers bar, line, area and scatter series on one or two y axes, stacking and pie charts.
* Good, because its SVG output is in the DOM, and Recharts adds keyboard access to the tooltip.
* Neutral, because it is mid-sized, between Chart.js and ECharts.
* Bad, because it has no heatmap, so the heatmap widget draws its own tiles.
* Bad, because styling is set per series component, not by one theme object.

### Apache ECharts with `echarts/core`

A canvas-based library with a declarative option object, imported selectively.

* Good, because one registered theme object styles colours, typography, axes and tooltips for every chart type.
* Good, because it supports heatmap natively.
* Bad, because its theme must be built from kit token values in code and rebuilt and registered again on every theme change, since a canvas cannot read CSS custom properties.
* Bad, because its charts look like ECharts, not like the product's kit charts.
* Bad, because it is large to evaluate per instance.
* Neutral, because its canvas output needs the accessible name and text alternative the widget adds.

### Chart.js with `react-chartjs-2`

A smaller canvas library with a configuration object.

* Good, because it is smaller.
* Bad, because heatmaps need a third-party plugin.
* Bad, because theming is split between global defaults and per-dataset colours, built in code from token values and rebuilt on every theme change.
* Bad, because its charts do not match the product's kit charts.
* Neutral, because its canvas output needs the same accessible name and text alternative the widget adds.

## More Information

* **Review trigger**: if the measured cost of a chart widget exceeds the per-widget figure or the initial-render budget of the DESIGN, whose figures are provisional and confirmed by measurement, or if the kit replaces the library behind its chart component.
* **Isolation**: isolation is per instance, not a sandbox (FrontX ADR-0011).
* **Scope**: this decision covers the charting library and how charts take the kit's light and dark look. It does not cover the budget figures (the DESIGN), how the host theme id reaches widgets (ADR-0006), the data shapes of the chart widget types ([ADR-0009](0009-subject-agnostic-widget-catalog-v1.md)), or the data grid ([ADR-0005](0005-data-grid-library-v1.md)).
* **Checklist applicability**: ARCH applicable; PERF applicable (download counted once as a shared dependency, evaluation per instance); SEC N/A; REL N/A; DATA N/A; INT applicable (host theme id from the shared property, ADR-0006, and the ui-kit chart component and tokens); OPS N/A; MAINT applicable (the kit owns the chart component; the template owns the heatmap drawing); TEST applicable; COMPL applicable (Recharts is MIT); UX applicable (token-driven visual quality in light and dark); BIZ N/A.
* Related decisions: FrontX ADR-0011 (instance isolation), FrontX ADR-0034 (shared dependency source-text reuse by content hash), FrontX ADR-0035 (realm-wide reach of that reuse). ADR-0006 decides how the theme reaches widgets.

## Traceability

- **PRD**: [PRD.md](../PRD.md)
- **DESIGN**: [DESIGN.md](../DESIGN.md)

This decision directly addresses the following requirements or design elements:

* `cpt-frontx-dashboard-nfr-visual-quality` - the kit chart and the kit's chart tokens give every chart type the kit look, in light and dark, with no per-widget styling.
* `cpt-frontx-dashboard-fr-theme` - chart colours follow the host theme id through the kit scope it maps to, and a theme switch restyles every chart without a request.
* `cpt-frontx-dashboard-nfr-bundle-budget` - chart widget entries and the shared Recharts and ui-kit dependencies are counted by the rule of the DESIGN.
* `cpt-frontx-dashboard-nfr-initial-render` - the per-instance evaluation cost of Recharts counts against the initial-render budget.
* `cpt-frontx-dashboard-fr-widget-catalog` - the chart widget types `cartesian_chart` and `pie_chart` use this library, and `heatmap` draws its tiles from kit tokens.
