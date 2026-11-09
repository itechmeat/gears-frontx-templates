# Data display and dashboards

## Start with a decision

Every metric or table answers one of: what changed, is action needed, where
is the problem, who owns the next step, what evidence supports the
conclusion. A metric that serves no decision and routes to no evidence goes
(DAT-001).

## KPI anatomy

A KPI set shares one anatomy: label; value and unit; timeframe or comparison
basis; delta or status when it means something; drill-down. The value is a
kit type role, not decoration (APP-002, `references/app-screens.md`).
Numbers in one family share baseline, size and format, and the value sits at
the same height in every widget.

## Charts

- The title states the metric, not the chart type; time range and
  aggregation are visible; axes, units, zero baseline and comparison basis
  are explicit where they change the reading.
- Hover detail also works by keyboard on interactive points; interactive
  charts have a table or text alternative (DAT-003).
- Direct labels before distant legends when space allows; area fills are
  translucent and below the line; notable points, current value and target
  are marked.
- No donut when a proportion bar or a count says it more directly.
- Palettes are in `references/color.md`.

## Status distributions

Segmented bars use proportional lengths, thin geometry and small or no gaps
as the kit pattern draws them; legend order matches segment order; legend
values align and share a number format; total and denominator are visible.
No thick rounded segments that look like pills.

## Source or system health

Show the healthy over total count once; source name, state and last update
in stable columns; keep the last trustworthy sync value on failure; a small
semantic cue plus state text, not a unique icon per source.

## Timelines

Milestones share one horizontal scale; completed, current, blocked and
future states have consistent geometry and cues; labels stay with their
markers; a blocked gate names blocker and owner, a future gate its condition
or date. Gantt-style views show the time scale, the today marker,
dependencies when drawn and a non-drag way to change things.

## Tables

Table anatomy is in `references/components.md`. For data:

- keep the primary entity and its state easy to scan; put type under the
  primary label when a type column fights for width;
- plain status text with a small dot where a chip adds weight;
- long evidence goes to an inspector, with a short link or count in the row;
- taller readable rows before tiny type and crowded columns; headers align
  with their cells.

## Dashboard grid

- Two widget widths, half and full (`widgetSpans`); thirds only for parallel
  KPI cards with identical anatomy (`thirdsPolicy`), both in
  `rules/layout-contract.json`.
- A dashboard's widgets are an ordered group of blocks, so they take the
  kit's `Grid` and `GridItem`: in its default 12-column config, `medium`
  prefers half width (6 columns) from the kit's own `sm` step (480 px) up,
  `large` prefers full width at every step, and below 480 px both take the
  whole row. The steps are container queries on the grid's own width, not
  the viewport, and are not the contract's breakpoints. Thirds, exact spans
  or fixed placement stay on `fallbackGrid` with CSS Modules
  (`references/layout.md`).
- Grid heights are fixed: a `GridItem` is one row track (`height="low"`,
  `10rem` by default) or two (`height="high"`), set by the config's
  `rowHeight` or `--grid-row-height`. Taller content scrolls inside the item,
  and the item clips what a child draws outside its box (a `panel` Card's
  shadow, an interactive Card's forced-colors focus outline). Widgets whose
  height must follow their content, or that need that outline unclipped,
  stay on `fallbackGrid`.
- Equal-width widgets in one row share height and internal baselines.
- Full width is for a relationship, sequence, table or issue list that needs
  it.

## Data honesty

No score without a formula or a route to its parts; no trend without
timeframe and basis; no status without a threshold or evidence; no precision
the source does not have. Partial, stale and estimated data **MUST** be
marked.
