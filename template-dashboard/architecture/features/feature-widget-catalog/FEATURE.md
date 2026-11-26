---
status: accepted
version: 1
date: 2026-10-31
description: "Feature: the widget catalog: the 15 v1 widget types, each with its render type and data shape, the rendering rules, markdown safety, and the grid's client-side sort and page."
---

# Feature: Widget Catalog

- [ ] `p1` - **ID**: `cpt-frontx-dashboard-featstatus-widget-catalog`

<!-- toc -->

- [1. Feature Context](#1-feature-context)
  - [1.1 Overview](#11-overview)
  - [1.2 Purpose](#12-purpose)
  - [1.3 Actors](#13-actors)
  - [1.4 References](#14-references)
- [2. Actor Flows (CDSL)](#2-actor-flows-cdsl)
  - [Sort and page a grid](#sort-and-page-a-grid)
- [3. Processes / Business Logic (CDSL)](#3-processes--business-logic-cdsl)
  - [Render a markdown card safely](#render-a-markdown-card-safely)
  - [Take chart colours from the series palette](#take-chart-colours-from-the-series-palette)
  - [Validate grid columns and groups](#validate-grid-columns-and-groups)
  - [Sort and page grid rows](#sort-and-page-grid-rows)
  - [Check the heatmap scale and calendar](#check-the-heatmap-scale-and-calendar)
  - [Check cartesian x and y values](#check-cartesian-x-and-y-values)
  - [Check the pie centre, the radar points, the waterfall sum and the feed times](#check-the-pie-centre-the-radar-points-the-waterfall-sum-and-the-feed-times)
- [4. States (CDSL)](#4-states-cdsl)
  - [No lifecycle states](#no-lifecycle-states)
- [5. Definitions of Done](#5-definitions-of-done)
  - [Fifteen widget types](#fifteen-widget-types)
  - [Per-type render schemas and data shapes](#per-type-render-schemas-and-data-shapes)
  - [Grid row cap, page sizes, and client-side sort/page](#grid-row-cap-page-sizes-and-client-side-sortpage)
  - [Markdown safety](#markdown-safety)
  - [Per-type rendering rules](#per-type-rendering-rules)
  - [Catalog libraries and licences](#catalog-libraries-and-licences)
  - [Widget accessibility walkthrough](#widget-accessibility-walkthrough)
  - [Dashboard-author guide](#dashboard-author-guide)
- [6. Widget Type and Data Schemas](#6-widget-type-and-data-schemas)
  - [MFE entries](#mfe-entries)
  - [Tones type](#tones-type)
  - [summary_card](#summary_card)
  - [metric_card](#metric_card)
  - [ranked_list_card](#ranked_list_card)
  - [progress_list_card](#progress_list_card)
  - [radial_progress](#radial_progress)
  - [grid](#grid)
  - [cartesian_chart](#cartesian_chart)
  - [pie_chart](#pie_chart)
  - [radar_chart](#radar_chart)
  - [treemap_chart](#treemap_chart)
  - [waterfall_chart](#waterfall_chart)
  - [activity_feed](#activity_feed)
  - [funnel_chart](#funnel_chart)
  - [heatmap](#heatmap)
  - [markdown_card](#markdown_card)
- [7. Acceptance Criteria](#7-acceptance-criteria)

<!-- /toc -->

## 1. Feature Context

- [ ] `p1` - `cpt-frontx-dashboard-feature-widget-catalog`

### 1.1 Overview

The 15 v1 widget types, each a GTS type with its own render type (the render schema), a data type (the data shape), and one FrontX MFE entry. The final render types and data shapes per type, the grid row cap and page sizes, the grid sorts and pages client-side over the rows the transform delivered, markdown safety, and the per-type rendering rules.

### 1.2 Purpose

A dashboard author picks from the catalog. The catalog is bounded by presentation shapes, not by subject: a new dataset needs no new widget type. Each type states the exact data it needs, and the root's registration validates every answer against it.

**Requirements**: `cpt-frontx-dashboard-fr-widget-catalog`, `cpt-frontx-dashboard-fr-grid-sort-page`, `cpt-frontx-dashboard-fr-markdown-safety`, `cpt-frontx-dashboard-fr-accessibility` (widget side), `cpt-frontx-dashboard-fr-theme` (widget side), `cpt-frontx-dashboard-nfr-visual-quality`, `cpt-frontx-dashboard-nfr-large-table`, `cpt-frontx-dashboard-nfr-bundle-budget`, `cpt-frontx-dashboard-nfr-accessibility` (widget side), `cpt-frontx-dashboard-fr-author-guides` (dashboard-author guide).

**Use cases**: `cpt-frontx-dashboard-usecase-add-fix-widget`, `cpt-frontx-dashboard-usecase-author-dashboard` (the widget types an author picks, the dashboard-author guide).

**Principles**: `cpt-frontx-dashboard-principle-open-bases-closed-leaves`, `cpt-frontx-dashboard-principle-per-instance-isolation`.

**Constraints**: `cpt-frontx-dashboard-constraint-one-gts-package`, `cpt-frontx-dashboard-constraint-permissive-licences` (widget libraries).

**Components**: `cpt-frontx-dashboard-component-widget-catalog` (the 15 types, libraries, rendering rules).

**Security in scope**: output safety. The markdown card follows `cpt-frontx-dashboard-algo-widget-catalog-markdown`; every other widget shows delivered text as text, and chart tooltips are built from text.

**Not applicable**:
- Persistence/DB: no database (`cpt-frontx-dashboard-db-none`).
- Sign-in and access: the host signs the viewer in, and the product's API owns access.
- Compliance/privacy: widgets store nothing and send nothing; they show only what the product's API returns. Library licences are in [Catalog libraries and licences](#catalog-libraries-and-licences).
- Reliability: widgets are passive. A widget shows its own cannot-be-shown state; the root owns failure scope and recovery.
- Progress and confirmation flows: grid sort, page and page size are immediate, client-side and change no data.
- Ops/rollout: no deployed service; a widget ships as an MFE build plus its types, entry and manifest in its part of the served GTS file, the types declared in its `mfe.json`.

### 1.3 Actors

| Actor | Role in Feature |
|-------|-----------------|
| `cpt-frontx-dashboard-actor-dashboard-author` | Picks widget types from the catalog. |
| `cpt-frontx-dashboard-actor-widget-author` | Ships the 15 types (or fixes one). |
| `cpt-frontx-dashboard-actor-dashboard-viewer` | Sorts and pages grids; reads cards and charts. |

### 1.4 References

- **PRD**: [PRD.md](../../PRD.md)
- **Design**: [DESIGN.md](../../DESIGN.md) (§3.1 Domain Model, §6 Worked Example)
- **Dependencies**: `cpt-frontx-dashboard-feature-widget-contract`

## 2. Actor Flows (CDSL)

### Sort and page a grid

- [ ] `p1` - **ID**: `cpt-frontx-dashboard-flow-widget-catalog-grid-sort-page`

**Actor**: `cpt-frontx-dashboard-actor-dashboard-viewer`

**Success Scenarios**:
- The viewer sorts a grid by a column, pages it, changes the page size, and searches it when the grid has a search box, all client-side, with no request.

**Steps**:
1. [ ] - `p1` - The viewer clicks a sortable column header. - `inst-wc-sort-click`
2. [ ] - `p1` - The grid sorts the rows it holds in place, as `cpt-frontx-dashboard-algo-widget-catalog-grid-sort` specifies, and shows the first page. - `inst-wc-sort-do`
3. [ ] - `p1` - **IF** the viewer pages or changes the page size - `inst-wc-page`
   1. [ ] - `p1` - The grid shows another page of the delivered rows, or applies the new page size and shows the first page, in place. - `inst-wc-page-do`
4. [ ] - `p1` - **IF** the grid has `search` and the viewer types in its search box, the grid keeps the delivered rows whose shown text contains the typed text, ignoring case, in any column, keeps the sort, and shows the first page, in place. - `inst-wc-search-do`
5. [ ] - `p1` - **RETURN** - no request is sent, no binding re-runs. - `inst-wc-return`

## 3. Processes / Business Logic (CDSL)

### Render a markdown card safely

- [ ] `p2` - **ID**: `cpt-frontx-dashboard-algo-widget-catalog-markdown`

**Input**: a `markdown_card` body string from its `render`.

**Output**: rendered CommonMark (formatting, links and images), with HTML as text.

**Steps**:
1. [ ] - `p1` - Parse the body as CommonMark, including links and images. - `inst-wc-md-parse`
2. [ ] - `p1` - Render embedded HTML as plain text; create no element from it. - `inst-wc-md-html`
3. [ ] - `p1` - For each link and image target, read it the way the browser URL parser does: decode character references, remove every tab, line feed and carriage return anywhere in it, and trim leading and trailing control characters and spaces. Its scheme is the text before the first `:` when that text starts with a letter and holds only letters, digits, `+`, `-` and `.`, compared case-insensitively. A target with no scheme is relative. So `JavaScript:`, ` javascript:` and `java&#9;script:` all read as the `javascript` scheme. - `inst-wc-md-scheme`
4. [ ] - `p1` - **IF** a link's target is not relative and its scheme is not `http`, `https` or `mailto`, render the link inactive, showing its link text as plain text. This covers `javascript`, `vbscript`, `data`, `blob`, `file` and every other scheme. - `inst-wc-md-links`
5. [ ] - `p1` - Open every other link in a new browsing context, without access to the opener. - `inst-wc-md-noopener`
6. [ ] - `p1` - **IF** an image's target is not a same-origin path, do not load it; show its alt text, or nothing when it has none. A same-origin path is a relative target that resolves against the document base URL, as the browser resolves an image `src` (a `<base>` element included), to the page origin. Every target with a scheme is blocked, including `https`, `data` (also `data:image/*`), `blob` and `javascript`; so is a relative target that resolves to another origin, such as `//other.example/a.png`. Otherwise show the image with its alt text as the accessible name. - `inst-wc-md-images`
7. [ ] - `p1` - **RETURN** the rendered text. - `inst-wc-md-return`

### Take chart colours from the series palette

- [ ] `p2` - **ID**: `cpt-frontx-dashboard-algo-widget-catalog-chart-theme`

**Input**: the host theme id, and the series of a `cartesian_chart` or the slices of a `pie_chart`.

**Output**: a kit `ChartConfig` whose colours come from the template's series palette, followed by the active light or dark scope.

**Steps**:
1. [ ] - `p1` - Map the host theme id to the ui-kit light or dark scope (unknown gives light). - `inst-wc-chart-scope`
2. [ ] - `p1` - Give each series or slice, in delivered order, the colour of its position in the series palette (`src-app/mfe_packages/widgets/src/chart/palette.ts`): the host's `--dashboard-chart-<n>` when the host sets it, otherwise the template's colour of that position, one value per theme through `light-dark()`. The template has ten hand-tuned colours per theme, ordered so neighbours differ in hue and lightness, and past ten a generator that picks the grid colour farthest from every colour before it, so no position takes an earlier colour until the grid of several hundred colours is used up, after which the generated sequence starts again; the name is the label. - `inst-wc-chart-build`
3. [ ] - `p1` - Pass the config to the kit `ChartContainer`, which writes one `--color-<key>` property per entry for the chart instance; every series paints itself with its property. - `inst-wc-chart-register`
4. [ ] - `p1` - On a theme change, build nothing: `light-dark()` follows the `color-scheme` of the new kit scope, the kit tokens take their values from it, and the chart restyles with no request. - `inst-wc-chart-rebuild`
5. [ ] - `p1` - **RETURN** the config. - `inst-wc-chart-return`

### Validate grid columns and groups

- [ ] `p2` - **ID**: `cpt-frontx-dashboard-algo-widget-catalog-grid-checks`

**Input**: the `render_widget` payload of a `grid`: its `render` and its validated data.

**Output**: pass, or a failure naming the problem.

The grid widget runs these checks itself, each time it accepts a `render_widget` payload and before it draws. The root has no per-type knowledge and does not run them. On a failure, the widget draws no rows, shows its own cannot-be-shown state in its cell (the static "This widget cannot be shown", exposed as text, as `cpt-frontx-dashboard-dod-widget-contract-obligations` specifies; English, like every widget-owned wording, gears-frontx-templates#105), and writes the problem to the browser console (never data content). The cell frame stays and the other cells are unaffected.

**Steps**:
1. [ ] - `p1` - **IF** two columns share the same `key`, **RETURN** failure naming the widget and the key. - `inst-wc-grid-dup-key`
2. [ ] - `p1` - **FOR EACH** group in `column_groups` - `inst-wc-grid-for-group`
   1. [ ] - `p1` - **IF** a key in `members` is not the `key` of a grid column, **RETURN** failure naming the widget, the group, and the key. - `inst-wc-grid-group-member`
   2. [ ] - `p1` - **IF** the columns of the group are not contiguous in `columns` order, **RETURN** failure naming the widget and the group. - `inst-wc-grid-not-contiguous`
   3. [ ] - `p1` - **IF** a key is repeated within the group, **RETURN** failure naming the widget, the group, and the key. - `inst-wc-grid-repeated`
   4. [ ] - `p1` - **IF** a column of the group is also named by another group, **RETURN** failure naming the widget, the column, and both groups. - `inst-wc-grid-two-groups`
3. [ ] - `p1` - **IF** `row_color` is set and is not the `key` of a grid column, **RETURN** failure naming the widget and the key. - `inst-wc-grid-row-color`
4. [ ] - `p1` - **IF** a column that is not a badge column (`kind` other than `badge`) has `tones`, or a sparkline column has `sortable` true, **RETURN** failure naming the widget and the column key. - `inst-wc-grid-kinds`
5. [ ] - `p1` - **IF** any data row does not have exactly one value per column (its length differs from the number of `columns`), **RETURN** failure naming the widget and the first such row index. - `inst-wc-grid-positions`
6. [ ] - `p1` - **IF** `total_rows` is a number below the number of data rows, **RETURN** failure naming the widget and `total_rows`, never a count. - `inst-wc-grid-total-rows`
7. [ ] - `p1` - **IF** a value does not fit its column's kind (a list outside a sparkline column, a value other than a list or null in a sparkline column, a value other than a number or null in a progress column, or a progress number outside 0 to 1), **RETURN** failure naming the widget, the first such row index and the column key, never the value. - `inst-wc-grid-values`
8. [ ] - `p1` - **RETURN** pass. - `inst-wc-grid-pass`

### Sort and page grid rows

- [ ] `p2` - **ID**: `cpt-frontx-dashboard-algo-widget-catalog-grid-sort`

**Input**: the delivered grid rows, the sort column and direction chosen by the viewer, and the page size.

**Output**: the rows in sorted order, showing the first page.

**Steps**:
1. [ ] - `p1` - Follow the header cycle of the ui-kit DataGrid: a click on a column that is not the sort column makes it the only sort column, descending; a second click sorts it ascending; a third click clears the sort, and the rows return to their delivered order. Only the sort column's header shows a sort state. - `inst-wc-sort-direction`
2. [ ] - `p1` - Group the values of the sort column by kind: numbers first, then strings, then nulls. The groups keep this order in both directions. A `badge` column sorts by the text each badge shows, so its numbers join the strings; its nulls stay last. - `inst-wc-sort-groups`
3. [ ] - `p1` - Within the number group, compare numerically. Within the string group, compare with the collator of the host language. Reverse the order within both groups for a descending sort. Nulls stay last in both directions. - `inst-wc-sort-compare`
4. [ ] - `p1` - Keep the delivered order of rows whose sort values are equal (a stable sort). - `inst-wc-sort-stable`
5. [ ] - `p1` - **IF** the sort changes or the viewer changes the page size, show the first page. - `inst-wc-sort-first-page`
6. [ ] - `p1` - **RETURN** the sorted rows; no request is sent. - `inst-wc-sort-return`

### Check the heatmap scale and calendar

- [ ] `p2` - **ID**: `cpt-frontx-dashboard-algo-widget-catalog-heatmap-checks`

**Input**: the `render_widget` payload of a `heatmap`: its `render` and its validated data.

**Output**: pass, or a failure naming the problem.

The heatmap widget runs this check itself, each time it accepts a `render_widget` payload and before it draws, with the same outcome as `cpt-frontx-dashboard-algo-widget-catalog-grid-checks`: on a failure, it shows its own cannot-be-shown state in its cell and writes the problem to the browser console.

**Steps**:
1. [ ] - `p1` - **IF** `min_value` and `max_value` are both set (not null) and `min_value` is greater than `max_value`, **RETURN** failure naming both values. - `inst-wc-heat-min-max`
2. [ ] - `p1` - **IF** `week_start` is set and `mode` is `matrix` (set, or absent and so the default), **RETURN** failure naming the mode. - `inst-wc-heat-week-start`
3. [ ] - `p1` - **IF** `mode` is `calendar`, **FOR EACH** row in delivered order: **IF** its `y` is set and not null, **RETURN** failure naming the row index; **IF** its `x` is not a `YYYY-MM-DD` date of the calendar (a date-time, a number, null, or a day such as 2026-02-30 all fail), **RETURN** failure naming the row index. - `inst-wc-heat-calendar-rows`
4. [ ] - `p1` - **RETURN** pass. - `inst-wc-heat-pass`

### Check cartesian x and y values

- [ ] `p2` - **ID**: `cpt-frontx-dashboard-algo-widget-catalog-cartesian-checks`

**Input**: the `render_widget` payload of a `cartesian_chart`: its `render` and its validated data.

**Output**: pass, or a failure naming the problem.

The chart widget runs this check itself, each time it accepts a `render_widget` payload and before it draws, with the same outcome as `cpt-frontx-dashboard-algo-widget-catalog-grid-checks`: on a failure, it shows its own cannot-be-shown state in its cell and writes the problem to the browser console (never data content).

**Steps**:
1. [ ] - `p1` - **IF** the data has both `series` and `points`, or neither, **RETURN** failure naming that. The long form (`points`) becomes the series form first: one series per distinct `series` name, each with its points in delivered order, the series with an entry of their own in `render.series` first in the order of those entries and the others in the order their names first appear. Every later step runs on that series form; for the long form, a failure that names a series and a point names the point's index in `points` instead, and one that names a series names the index of its first point. - `inst-wc-cart-form`
2. [ ] - `p1` - **FOR EACH** point with a non-null `x` - `inst-wc-cart-for-point`
   1. [ ] - `p1` - **IF** the x axis is `value` and `x` is not a number, **RETURN** failure naming the series and the point index. - `inst-wc-cart-value-x`
   2. [ ] - `p1` - **IF** the x axis is `time` and `x` is neither an ISO 8601 date-time string whose date part is a day of the calendar and whose time of day is 00:00 to 23:59 (hour 24, which would read as the next day, fails), nor a bare `YYYY-MM-DD` date of the calendar by the heatmap calendar's rule (2026-02-30 fails, alone or before a time of day), nor a number of epoch milliseconds, each a time a date can hold (at most 8.64e15 from 1970), **RETURN** failure naming the series and the point index. - `inst-wc-cart-time-x`
3. [ ] - `p1` - **FOR EACH** series drawn on a `log` y axis (the primary axis, or the secondary one for a series option with `y_axis: secondary`), **IF** one of its drawn points (on a `value` or `time` x axis, a point with a null `x` is not drawn) has a non-null `y` that is not above zero, **RETURN** failure naming the series and the first such point index. - `inst-wc-cart-log-y`
4. [ ] - `p1` - **IF** `orientation` is `horizontal` and the x axis is not `category`, **RETURN** failure naming the x axis type. - `inst-wc-cart-orientation`
5. [ ] - `p1` - **IF** a series option sets `mark_extremes` and its `type` is neither `line` nor `area`, **RETURN** failure naming the option index and its type (the schema requires `type`; an option that reaches the widget without one draws as bars and is named `bar`). - `inst-wc-cart-extremes`
6. [ ] - `p1` - **FOR EACH** series that is not drawn as `scatter` (a series without an option of its own draws by `series_default`, or, without it, as bars), **IF** one of its points has a non-null `size`, **RETURN** failure naming the series and the first such point index. - `inst-wc-cart-size`
7. [ ] - `p1` - **IF** `stack_mode` is `percent`, **FOR EACH** series on a y axis that carries a stack group (a bar, line or area series with a `stack_group`): **IF** the series has no stack group or is a scatter series, **RETURN** failure naming the series; **IF** one of its `y` values is negative, **RETURN** failure naming the series and the first such point index. - `inst-wc-cart-percent`
8. [ ] - `p1` - **FOR EACH** reference line, its `axis` `y` when absent: **IF** the axis is `y_secondary` and no series uses the secondary axis, **RETURN** failure naming the line index; **IF** its `value` is a string and the axis is not a `category` x axis, **RETURN** failure naming the line index; **IF** its `value` is a number and the axis is a `category` x axis, **RETURN** failure naming the line index; **IF** the axis is a `time` x axis and its `value` is neither an ISO 8601 date-time string whose date part is a day of the calendar and whose time of day is 00:00 to 23:59, nor a bare `YYYY-MM-DD` date of the calendar, nor a number, each a time a date can hold (the bound of a point's x, `inst-wc-cart-time-x`), **RETURN** failure naming the line index; **IF** the axis is a value axis that carries a stack group under a percent stack and its `value` is outside 0 to 1, **RETURN** failure naming the line index; **IF** the axis is a `log` value axis (and no percent axis) and its `value` is not above zero, **RETURN** failure naming the line index. - `inst-wc-cart-reference`
9. [ ] - `p1` - **RETURN** pass. A `category` axis accepts every `x`. - `inst-wc-cart-pass`

### Check the pie centre, the radar points, the waterfall sum and the feed times

- [ ] `p2` - **ID**: `cpt-frontx-dashboard-algo-widget-catalog-card-checks`

**Input**: the `render_widget` payload of a `pie_chart` (its `render`), of a `radar_chart`, of a `waterfall_chart` or of an `activity_feed` (its validated data).

**Output**: pass, or a failure naming the problem.

The pie, the radar, the waterfall and the feed widgets run this check themselves, each time they accept a `render_widget` payload and before they draw, with the same outcome as `cpt-frontx-dashboard-algo-widget-catalog-grid-checks`: on a failure, the widget shows its own cannot-be-shown state in its cell and writes the problem to the browser console (never a value).

**Steps**:
1. [ ] - `p1` - **IF** a `pie_chart`'s `center` is `total` and `radius` does not have two items with an inner radius above 0 (the pie is not a donut), **RETURN** failure naming the field. - `inst-wc-card-pie-center`
2. [ ] - `p1` - **IF** a `pie_chart`'s `center_label` is set and `center` is not `total`, **RETURN** failure naming the field. - `inst-wc-card-pie-center-label`
3. [ ] - `p1` - **FOR EACH** point of a `radar_chart` in the delivered order - `inst-wc-card-radar-for-point`
   1. [ ] - `p1` - **IF** its `value` is below 0, **RETURN** failure naming the point index. - `inst-wc-card-radar-negative`
   2. [ ] - `p1` - **IF** its `axis` is not among the axes seen before it and 12 axes were seen, **RETURN** failure naming the point index. - `inst-wc-card-radar-axes`
   3. [ ] - `p1` - **IF** its `series` is not among the series seen before it and 5 series were seen (more overlapping polygons would hide each other), **RETURN** failure naming the point index. - `inst-wc-card-radar-series`
   4. [ ] - `p1` - **IF** its `axis` and its `series` together are those of a point before it (a null series being the one unnamed series), **RETURN** failure naming the point index: a second value of a series on one axis would hide the first. - `inst-wc-card-radar-repeat`
4. [ ] - `p1` - **IF** a `radar_chart`'s points have fewer than 3 distinct axes (the data type counts the points, not the axes; one or two axes draw a dot or a line and no polygon), **RETURN** failure naming the number of distinct axes. - `inst-wc-card-radar-min-axes`
5. [ ] - `p1` - **FOR EACH** step of a `waterfall_chart` in the delivered order, the running sum starting at 0 - `inst-wc-card-waterfall-for-step`
   1. [ ] - `p1` - **IF** it is a total after the first step, its `value` is not null, and its `value` and the running sum differ by more than one part in a billion of the larger of the two, **RETURN** failure naming the step index (the data type cannot add up the steps before a total). - `inst-wc-card-waterfall-total`
   2. [ ] - `p1` - Move the running sum: a delta with a value adds it, a first step that is a total with a value sets the sum to it, and a null delta or a later total leaves it. - `inst-wc-card-waterfall-sum`
   3. [ ] - `p1` - **IF** the running sum is not finite (two finite values can add up beyond the largest number), or a delta's move from the sum it starts at to the sum it ends at is not finite (it can round beyond the largest number while both sums are finite; a total's extent is the sum itself), **RETURN** failure naming the step index. - `inst-wc-card-waterfall-finite`
6. [ ] - `p1` - **FOR EACH** item of an `activity_feed` in the delivered order, **IF** its `time` is neither an ISO 8601 date-time whose date part is a day of the calendar, whose time of day is 00:00 to 23:59 and whose zone, when it carries one, is Z or an offset written +hh:mm, +hhmm or +hh (each with its minus form) nor a `YYYY-MM-DD` date of the calendar (so 2026-02-30, alone or before a time of day, fails, and so do hour 24 and an offset outside these forms), **RETURN** failure naming `data.items[N]` by its index, never its content (the data type takes any string as a time). - `inst-wc-card-feed-time`
7. [ ] - `p1` - **RETURN** pass. - `inst-wc-card-pass`

## 4. States (CDSL)

### No lifecycle states

- [ ] `p2` - **ID**: `cpt-frontx-dashboard-state-widget-catalog-none`

**States**: `defined` (the catalog is data and rendering rules, with no lifecycle)

**Initial State**: `defined`

**Transitions**:
1. [ ] - `p1` - **FROM** `defined` **TO** `defined` **WHEN** a widget type is rendered (no transition; the catalog is static data). - `inst-wc-state-none`

## 5. Definitions of Done

### Fifteen widget types

- [ ] `p1` - **ID**: `cpt-frontx-dashboard-dod-widget-catalog-types`

The system **MUST** ship 15 widget types, each a closed derived GTS type with `unevaluatedProperties: false`, setting `entry` and (for data widgets) `data_type`, with `render` of its own render type: `summary_card`, `metric_card`, `ranked_list_card`, `progress_list_card`, `radial_progress`, `grid`, `cartesian_chart`, `pie_chart`, `radar_chart`, `treemap_chart`, `waterfall_chart`, `activity_feed`, `funnel_chart`, `heatmap` (derived from `data_widget`), and `markdown_card` (derived from the widget base, forbidding `data`, carrying its text in `render`).

Each widget type has one FrontX MFE entry, a plain `entry_mf` instance with `actions` [`render_widget`] and `domainActions` []; the FrontX manifest pipeline adds `exposeAssets` when the bundle is built. The full entry instances and the entry id table are in [MFE entries](#mfe-entries).

**Implements**: `cpt-frontx-dashboard-fr-widget-catalog`, `cpt-frontx-dashboard-usecase-add-fix-widget`.

**Principles**: `cpt-frontx-dashboard-principle-open-bases-closed-leaves` (each concrete type closes itself).

**Touches**:
- Entities: the 15 widget types, the 15 render types, the 14 data types, the 15 entries

### Per-type render schemas and data shapes

- [ ] `p1` - **ID**: `cpt-frontx-dashboard-dod-widget-catalog-shapes`

Each widget type **MUST** refer by `$ref` to its own render type `gts.frontx.dashboard.widget.render.v1~frontx.dashboard.widget.<widget_type>_render.v1~`, derived from the render base and closed with `unevaluatedProperties: false` (`summary_card` declares no render field, so its `render` is an empty object), so the root reads it from that `$ref` and stamps and registers the widget's `render` against it, and each data widget type **MUST** declare a closed data shape derived from the widget-data base. Every data widget type inherits the optional `value_format` from `data_widget` and declares nothing for it; each type closes only its own `render`. The widget formats every number it shows by `value_format` for the host language: `number` (also when `value_format` is absent) as a plain number, `percent` as a percentage (0.25 shows as 25%), `duration` as the number in its `unit` (`ms`, `s`, `min`, `h` or `d`) with the localized unit, without converting to another unit (with `compound` true, as its two largest whole parts, such as 2d 4h), and `currency` as an amount in its `currency` code: the schema checks only the code's shape (three capital letters), the symbol comes from the host's locale data for the host language, and a code that data does not know shows as the code itself. `decimals` fixes the number of fraction digits for every value type, `max_decimals` caps them so a whole value shows none, and `unit_label` writes a unit word after a `number`. Value fields accept `null` (shown as a gap or empty value). Each data type states its empty condition in its Presentation line. The full render type and data shape of every type are in [Widget Type and Data Schemas](#6-widget-type-and-data-schemas); the DESIGN worked example uses them.

**Implements**: `cpt-frontx-dashboard-fr-widget-catalog`.

**Touches**:
- Entities: the 15 widget types, the 15 render types, the 14 data types

### Grid row cap, page sizes, and client-side sort/page

- [ ] `p1` - **ID**: `cpt-frontx-dashboard-dod-widget-catalog-grid`

The grid's transform output **MUST** have a row cap of 500 rows (`maxItems` on the grid data type's `rows`). The grid **MUST** show its rows one page at a time, with page sizes defaulting to `[10, 25, 50, 100, 500]` (the first entry is the initial page size), offer the pager whenever the delivered rows do not fit the smallest page size, and sort and page client-side over the rows the transform delivered, sending no request. An over-cap result fails data validation and the cell shows the cannot-be-shown state; rows are never truncated. Data that holds only the first rows of a larger result gives the full row count in the optional `total_rows`, and the grid then says that it shows only part of the result. Sorting and paging follow `cpt-frontx-dashboard-algo-widget-catalog-grid-sort`. The grid is the ui-kit DataGrid, whose `load` callback answers from the delivered rows in memory, with its state kept in memory only (ADR-0005). Grid columns are keyed by position: `render.columns[i]` describes position `i` and has a required `key` (unique, `^[a-z][a-z0-9_]{0,63}$`). `column_groups[].members` and `row_color` refer to column keys. The grid widget runs the consistency checks of `cpt-frontx-dashboard-algo-widget-catalog-grid-checks` itself and shows its own cannot-be-shown state when one fails.

**Implements**: `cpt-frontx-dashboard-flow-widget-catalog-grid-sort-page`, `cpt-frontx-dashboard-algo-widget-catalog-grid-checks`, `cpt-frontx-dashboard-algo-widget-catalog-grid-sort`, `cpt-frontx-dashboard-fr-grid-sort-page`, `cpt-frontx-dashboard-nfr-large-table`.

### Markdown safety

- [ ] `p1` - **ID**: `cpt-frontx-dashboard-dod-widget-catalog-markdown`

`markdown_card` **MUST** render its body exactly as `cpt-frontx-dashboard-algo-widget-catalog-markdown` specifies: embedded HTML as text, targets read the way the browser URL parser reads them, links active only for `http`, `https`, `mailto` and relative targets and opened in a new browsing context with no opener, and images loaded only from same-origin paths.

**Implements**: `cpt-frontx-dashboard-algo-widget-catalog-markdown`, `cpt-frontx-dashboard-fr-markdown-safety`.

### Per-type rendering rules

- [ ] `p2` - **ID**: `cpt-frontx-dashboard-dod-widget-catalog-rendering`

Each widget entry **MUST** follow the widget-author obligations of `cpt-frontx-dashboard-dod-widget-contract-obligations`. Chart widgets draw with the ui-kit chart component and take their series colours from the template's series palette and every other colour from kit tokens (`cpt-frontx-dashboard-algo-widget-catalog-chart-theme`, ADR-0004); the heatmap draws its tiles from kit tokens. The root has no chart-library dependency. The set of host theme ids that map to dark is enumerated in the theme helper and updated when the host adds a dark theme; themes beyond light and dark fold into one of the two.

**Per-type rules:** each type's presentation rules are stated once, with its schemas in [Widget Type and Data Schemas](#6-widget-type-and-data-schemas). `metric_card` with `value_label` shows it as the caption; without it, no caption shows.

**Cross-type rules:**

- A null label, `x`, `y` or series value is legal; it renders as an empty label and the row is kept.
- Empty state: the widget owns it. When its data meets the empty condition of its data type, the widget shows "No data to show" inside its cell, and the cell frame stays. The wording is the widget's own English text, not a localized one (widget contract FEATURE, entry declaration).
- The `grid`, `heatmap`, `cartesian_chart`, `pie_chart`, `radar_chart`, `waterfall_chart` and `activity_feed` widgets run their own cross-checks (`cpt-frontx-dashboard-algo-widget-catalog-grid-checks`, `cpt-frontx-dashboard-algo-widget-catalog-heatmap-checks`, `cpt-frontx-dashboard-algo-widget-catalog-cartesian-checks`, `cpt-frontx-dashboard-algo-widget-catalog-card-checks` for the pie, the radar, the waterfall, which checks each total against the running sum before it and the running sum against the finite range, and the feed, which checks each item's time), `radial_progress` checks its `target` and `current` ([radial_progress](#radial_progress)), and `funnel_chart` and `treemap_chart` check that no stage or item value is negative ([funnel_chart](#funnel_chart), [treemap_chart](#treemap_chart)); each shows their own cannot-be-shown state when one fails: the static "This widget cannot be shown" with no error text, exposed as text to assistive technology, as `cpt-frontx-dashboard-dod-widget-contract-obligations` specifies (English, like every widget-owned wording).
- Chart tooltips are built from text, never HTML strings.
- Widget links: the `metric_card` foot link, the `ranked_list_card` row links, the `grid` link values and the `activity_feed` item titles go through one shared link rule. It reads a target the way the browser URL parser does (tabs and line breaks removed, leading and trailing controls and spaces trimmed) and takes `https:`, `http:`, `mailto:` and a path from the site root (`/...`, not `//`). Any other target (`javascript:`, `data:`, `vbscript:` or another scheme, a protocol-relative target, a relative target that does not start with `/`, an unparsable one) shows the link text alone and writes one console line naming the kind of target, never any of its text: the `javascript:`, `data:`, `vbscript:`, `file:`, `blob:` and `ftp:` schemes by name, any other scheme as an unsupported scheme; the cell does not fail. A link text with no visible character (empty, only spaces, only invisible characters such as zero-width marks, the word joiner, the byte order mark, the soft hyphen, the braille pattern blank or the musical null notehead, or only combining marks) shows as plain text with no link and no tab stop, and writes no console line: a link needs a name. A link to another origin opens in a new tab without access to its opener (`rel="noopener noreferrer"`), and its accessible name ends with "(opens in a new tab)", the widget's own English text; any other link opens in the same tab. For the grid this replaced its earlier rule: a relative target that does not start with `/` is no longer a link, a link on the same origin no longer opens a new tab, and a `mailto:` target is now a link.
- Colour is never the only signal: the heatmap's numeric scale, progress values as text (in a progress card, a radial progress and a grid progress column), the trend icon, the status text in its badge (in a ranked card and a grid badge column), the signed reference difference, the tone of an `activity_feed` item named in text beside its mark, and naming in legends and tooltips.
- Legends: a legend takes at most half of its chart (its height above or below the plot, its width beside it) and scrolls beyond that, so the plot or the pie keeps room in a short cell.
- Small cells: a chart lower than 200 px (a small low cell) is compact. A low cell's body is 102 px high with the layout's `card_size` absent or `sm`, and 86 px with `default` (the kit card title size and its 16 px spacing). A widget `description` line (the layout's `description_display` absent or `line`) takes 24 px from it: 78 px (62 px with `card_size` `default`); a description badge (`description_display` `badge`) stands on the title's row and takes 4 px (the kit header's row gap): 98 px (82 px). A compact `cartesian_chart` draws its x ticks horizontally whatever `tick_angle` asks, thinning them out to fit, and leaves out the legend of a single series, which only repeats the cell's title. A compact `pie_chart` moves a legend asked above or below it to its right, and leaves the legend out when the chart is also narrower than 240 px. A compact `cartesian_chart` keeps its orientation, percent stack and reference lines with their labels, keeps the dots of its extreme marks but leaves out their value labels, which would cover the plot's few rows, and halves the largest bubble radius (9 px instead of 18 px). A low cell whose body also holds the drill-down button leaves a chart of one series without axis labels a plot 24 px high with no description, 20 px with a description badge and none with a description line (8 px, 4 px and none with `card_size` `default`); a larger-view button in the cell's header leaves 12 px with no description or a badge and none with `card_size` `default`, and a chart with axis labels and a secondary axis keeps no plot at all: there a reference label can fall on the axis ticks and bubbles do not fit, so a chart with drill-down, reference lines or bubble sizes belongs in a high cell. In each case the tooltip and the text alternative still name every value. A `radial_progress` in a low cell leaves out its caption (`center_label`), so the numbers keep the hole. A `radar_chart` in a cell of any height, low or high, hides all its axis labels when the longest one cannot fit between its circle and the edge of the chart or its legend, and keeps them in the tooltip and the text alternative. A `treemap_chart` in a low cell leaves out the labels and values `value_labels: auto` would hide (a tile writes its label while the tile fits the label's first three characters and an ellipsis, and its value while the tile fits the value), and keeps every name in the tooltips and the text alternative; a group header that its group box cannot fit is left out, and the group stays in the tile tooltips. A `funnel_chart` in a low cell leaves out the values `value_labels: auto` would show, and keeps its conversions while each label keeps at least 3 em (or its whole width, if shorter) beside them; a stage lower than 26 px writes its text line beside its bar instead of over it, and one lower than 16 px leaves out its whole text line, label, value and conversion, and keeps its bar; a bar is never lower than 8 px, so stages that do not fit even as bare 8 px bars scroll inside the widget's body. A `waterfall_chart` in a low cell leaves out the value labels `value_labels: auto` would show (a label shows only while the bar is wide enough for it, estimated from its length), and keeps every change in the tooltips and the text alternative. A `grid` never gets lower than its header, a few rows and its pager; in a lower cell the cell scrolls. A grid link keeps its text and its link icon on one line. An `activity_feed` keeps its title, its time and its text on wrapping rows that never overflow the cell, and scrolls its list inside the cell.
- Heatmap size: a heatmap draws at most 10,000 tiles (distinct x values times distinct y values; in calendar mode, its weeks times 7); a larger one fails its own check and shows its own cannot-be-shown state, so sparse data cannot expand into a grid that exhausts the page. In calendar mode the weeks are counted from the earliest and the latest date alone, found in one pass over the rows, before any day of the grid is built: two rows years apart fail at once, and a list of any length is read without spreading it into a call.
- Text alternatives: `cartesian_chart`, `pie_chart`, `radar_chart`, `treemap_chart`, `waterfall_chart`, `funnel_chart` and `heatmap` each expose an accessible name and a text alternative of the delivered values for assistive technology. The default name and the column headings the configuration does not name (series, x, y, label, group, value, conversion, axis, share, change, running total) are the widget's own English texts, not localized ones (widget contract FEATURE, entry declaration; gears-frontx-templates#105).
- Drill-down: a `cartesian_chart`, `pie_chart`, `radar_chart`, `treemap_chart`, `waterfall_chart` or `funnel_chart` whose `render.drill_down` is `true` shows a "Show data" button that switches its area to the data view, and back with "Show chart" (English, like every widget-owned wording). The data view is a ui-kit DataGrid of every delivered value, one row per x position (or per point for an all-scatter chart, per slice for a pie, per axis for a radar, per item for a treemap, per step for a waterfall, per stage for a funnel), sortable client-side, with no request. A click on a bar, point, segment, radar axis, tile or funnel stage opens the data view with the row of that mark opened (its fields listed under it), marked, and scrolled to the top of the data view, under its header, so its fields show below it. The data view is at least as wide as a minimum width per column, and a data view wider than its cell scrolls sideways inside it. With `drill_down` off or absent the chart has no clickable marks. The button keeps the data view reachable by keyboard; its label names the view it opens, so it carries no pressed state.
- Progress and trend: each progress bar of `progress_list_card` has `role="progressbar"`, with its current and target values as text, and so does the ring of `radial_progress`, whose value text also gives the percent and the goal. The `metric_card` trend icon has an accessible name (up, down or no change), the widget's own English text.

**Principles**: `cpt-frontx-dashboard-principle-per-instance-isolation` (each chart widget evaluates its own copy of its chart library).

**Implements**: `cpt-frontx-dashboard-fr-theme` (widget side), `cpt-frontx-dashboard-fr-accessibility`, `cpt-frontx-dashboard-nfr-visual-quality`, `cpt-frontx-dashboard-algo-widget-catalog-heatmap-checks`, `cpt-frontx-dashboard-algo-widget-catalog-cartesian-checks`, `cpt-frontx-dashboard-algo-widget-catalog-card-checks`.

### Catalog libraries and licences

- [ ] `p2` - **ID**: `cpt-frontx-dashboard-dod-widget-catalog-libraries`

The catalog widgets **MUST** use the ui-kit chart component with Recharts (MIT, pinned to the version ui-kit pins) for `cartesian_chart`, `pie_chart`, `radar_chart` and `waterfall_chart`, the ui-kit DataGrid for `grid` and the chart data view, and markdown-it (MIT; CommonMark with raw HTML off and a link validation hook) for `markdown_card`, listed in `shared`, each entry under 100 KB own code only. The heatmap, `radial_progress`, `funnel_chart`, `treemap_chart` and `activity_feed` use no chart library and import nothing from a module that does.

**Implements**: `cpt-frontx-dashboard-nfr-bundle-budget`.

**Constraints**: `cpt-frontx-dashboard-constraint-permissive-licences`.

### Widget accessibility walkthrough

- [ ] `p2` - **ID**: `cpt-frontx-dashboard-dod-widget-catalog-accessibility`

Every one of the 15 widget types **MUST** pass the host's accessibility checks in both the light and the dark theme, with the text alternatives and keyboard operation of [Per-type rendering rules](#per-type-rendering-rules). Each widget's controls expose their name, role and state, and its empty state ("No data to show") and its own cannot-be-shown state are exposed as text, so a screen reader tells them apart from the root's loaders. This is verified by a keyboard-only walkthrough and a screen-reader walkthrough of the reference dashboard in both themes, covering every widget type in its cell and in the larger view.

**Implements**: `cpt-frontx-dashboard-nfr-accessibility` (widget side), `cpt-frontx-dashboard-fr-accessibility`.

### Dashboard-author guide

- [ ] `p2` - **ID**: `cpt-frontx-dashboard-dod-widget-catalog-author-guide`

The template **MUST** ship a dashboard-author guide covering writing a dashboard JSON, the grid, the binding, the catalog, and the layout checks. It **MUST** also cover that the product owns dashboard and data size, that every viewer who may see a dashboard must be able to get its widgets' data, that the product's API owns errors and access, what the host must provide, and the documented limitations: the limitations of PRD §6.3 and the DESIGN limits listed in DESIGN §5. A walkthrough with someone who did not build the template **MUST** show that the guide alone is enough to write a working dashboard: a dashboard author who has not used the template before writes a first working dashboard from the guide in one working session.

**Implements**: `cpt-frontx-dashboard-fr-author-guides` (dashboard-author guide).

**Touches**:
- Entities: Dashboard, Cell, Widget instance, Binding

## 6. Widget Type and Data Schemas

Every schema is a full JSON block with `$schema` `https://json-schema.org/draft/2020-12/schema`, `$id` `gts://<type id>`, and the GTS rules in DESIGN §3.1. Each concrete widget type is closed (`unevaluatedProperties: false`), derives from `data_widget` (or the widget base for `markdown_card`), and sets `x-gts-traits` `{entry, data_type}`. Presentation fields sit in `render`, which refers by `$ref` to the type's own render type: derived from the render base `gts.frontx.dashboard.widget.render.v1~` and closed with `unevaluatedProperties: false`, as each data type is closed and derives from the widget-data base.

### MFE entries

One `entry_mf` instance per widget type, each in its own widget bundle (`widgets/bundles/<widget_type>/mfe.json`). Each entry has `actions` [`render_widget`], `domainActions` [], `requiredProperties` (theme and language), `manifest` (its bundle's manifest `gts.frontx.mfes.mfe.mf_manifest.v1~frontx.dashboard.widgets.<widget_type>.v1`), and `exposedModule` `./<widget_type>`; the FrontX manifest pipeline adds `exposeAssets` when the bundle is built.

**Entry instances:**

```json
{
  "id": "gts.frontx.mfes.mfe.entry.v1~frontx.mfes.mfe.entry_mf.v1~frontx.dashboard.mfe.summary_card.v1",
  "requiredProperties": [
    "gts.frontx.mfes.comm.shared_property.v1~frontx.mfes.comm.theme.v1~",
    "gts.frontx.mfes.comm.shared_property.v1~frontx.mfes.comm.language.v1~"
  ],
  "actions": [
    "gts.frontx.mfes.comm.action.v1~frontx.dashboard.mfe.render_widget.v1~"
  ],
  "domainActions": [],
  "manifest": "gts.frontx.mfes.mfe.mf_manifest.v1~frontx.dashboard.widgets.summary_card.v1",
  "exposedModule": "./summary_card"
}
```

```json
{
  "id": "gts.frontx.mfes.mfe.entry.v1~frontx.mfes.mfe.entry_mf.v1~frontx.dashboard.mfe.metric_card.v1",
  "requiredProperties": [
    "gts.frontx.mfes.comm.shared_property.v1~frontx.mfes.comm.theme.v1~",
    "gts.frontx.mfes.comm.shared_property.v1~frontx.mfes.comm.language.v1~"
  ],
  "actions": [
    "gts.frontx.mfes.comm.action.v1~frontx.dashboard.mfe.render_widget.v1~"
  ],
  "domainActions": [],
  "manifest": "gts.frontx.mfes.mfe.mf_manifest.v1~frontx.dashboard.widgets.metric_card.v1",
  "exposedModule": "./metric_card"
}
```

```json
{
  "id": "gts.frontx.mfes.mfe.entry.v1~frontx.mfes.mfe.entry_mf.v1~frontx.dashboard.mfe.ranked_list_card.v1",
  "requiredProperties": [
    "gts.frontx.mfes.comm.shared_property.v1~frontx.mfes.comm.theme.v1~",
    "gts.frontx.mfes.comm.shared_property.v1~frontx.mfes.comm.language.v1~"
  ],
  "actions": [
    "gts.frontx.mfes.comm.action.v1~frontx.dashboard.mfe.render_widget.v1~"
  ],
  "domainActions": [],
  "manifest": "gts.frontx.mfes.mfe.mf_manifest.v1~frontx.dashboard.widgets.ranked_list_card.v1",
  "exposedModule": "./ranked_list_card"
}
```

```json
{
  "id": "gts.frontx.mfes.mfe.entry.v1~frontx.mfes.mfe.entry_mf.v1~frontx.dashboard.mfe.progress_list_card.v1",
  "requiredProperties": [
    "gts.frontx.mfes.comm.shared_property.v1~frontx.mfes.comm.theme.v1~",
    "gts.frontx.mfes.comm.shared_property.v1~frontx.mfes.comm.language.v1~"
  ],
  "actions": [
    "gts.frontx.mfes.comm.action.v1~frontx.dashboard.mfe.render_widget.v1~"
  ],
  "domainActions": [],
  "manifest": "gts.frontx.mfes.mfe.mf_manifest.v1~frontx.dashboard.widgets.progress_list_card.v1",
  "exposedModule": "./progress_list_card"
}
```

```json
{
  "id": "gts.frontx.mfes.mfe.entry.v1~frontx.mfes.mfe.entry_mf.v1~frontx.dashboard.mfe.radial_progress.v1",
  "requiredProperties": [
    "gts.frontx.mfes.comm.shared_property.v1~frontx.mfes.comm.theme.v1~",
    "gts.frontx.mfes.comm.shared_property.v1~frontx.mfes.comm.language.v1~"
  ],
  "actions": [
    "gts.frontx.mfes.comm.action.v1~frontx.dashboard.mfe.render_widget.v1~"
  ],
  "domainActions": [],
  "manifest": "gts.frontx.mfes.mfe.mf_manifest.v1~frontx.dashboard.widgets.radial_progress.v1",
  "exposedModule": "./radial_progress"
}
```

```json
{
  "id": "gts.frontx.mfes.mfe.entry.v1~frontx.mfes.mfe.entry_mf.v1~frontx.dashboard.mfe.grid.v1",
  "requiredProperties": [
    "gts.frontx.mfes.comm.shared_property.v1~frontx.mfes.comm.theme.v1~",
    "gts.frontx.mfes.comm.shared_property.v1~frontx.mfes.comm.language.v1~"
  ],
  "actions": [
    "gts.frontx.mfes.comm.action.v1~frontx.dashboard.mfe.render_widget.v1~"
  ],
  "domainActions": [],
  "manifest": "gts.frontx.mfes.mfe.mf_manifest.v1~frontx.dashboard.widgets.grid.v1",
  "exposedModule": "./grid"
}
```

```json
{
  "id": "gts.frontx.mfes.mfe.entry.v1~frontx.mfes.mfe.entry_mf.v1~frontx.dashboard.mfe.cartesian_chart.v1",
  "requiredProperties": [
    "gts.frontx.mfes.comm.shared_property.v1~frontx.mfes.comm.theme.v1~",
    "gts.frontx.mfes.comm.shared_property.v1~frontx.mfes.comm.language.v1~"
  ],
  "actions": [
    "gts.frontx.mfes.comm.action.v1~frontx.dashboard.mfe.render_widget.v1~"
  ],
  "domainActions": [],
  "manifest": "gts.frontx.mfes.mfe.mf_manifest.v1~frontx.dashboard.widgets.cartesian_chart.v1",
  "exposedModule": "./cartesian_chart"
}
```

```json
{
  "id": "gts.frontx.mfes.mfe.entry.v1~frontx.mfes.mfe.entry_mf.v1~frontx.dashboard.mfe.pie_chart.v1",
  "requiredProperties": [
    "gts.frontx.mfes.comm.shared_property.v1~frontx.mfes.comm.theme.v1~",
    "gts.frontx.mfes.comm.shared_property.v1~frontx.mfes.comm.language.v1~"
  ],
  "actions": [
    "gts.frontx.mfes.comm.action.v1~frontx.dashboard.mfe.render_widget.v1~"
  ],
  "domainActions": [],
  "manifest": "gts.frontx.mfes.mfe.mf_manifest.v1~frontx.dashboard.widgets.pie_chart.v1",
  "exposedModule": "./pie_chart"
}
```

```json
{
  "id": "gts.frontx.mfes.mfe.entry.v1~frontx.mfes.mfe.entry_mf.v1~frontx.dashboard.mfe.radar_chart.v1",
  "requiredProperties": [
    "gts.frontx.mfes.comm.shared_property.v1~frontx.mfes.comm.theme.v1~",
    "gts.frontx.mfes.comm.shared_property.v1~frontx.mfes.comm.language.v1~"
  ],
  "actions": [
    "gts.frontx.mfes.comm.action.v1~frontx.dashboard.mfe.render_widget.v1~"
  ],
  "domainActions": [],
  "manifest": "gts.frontx.mfes.mfe.mf_manifest.v1~frontx.dashboard.widgets.radar_chart.v1",
  "exposedModule": "./radar_chart"
}
```

```json
{
  "id": "gts.frontx.mfes.mfe.entry.v1~frontx.mfes.mfe.entry_mf.v1~frontx.dashboard.mfe.treemap_chart.v1",
  "requiredProperties": [
    "gts.frontx.mfes.comm.shared_property.v1~frontx.mfes.comm.theme.v1~",
    "gts.frontx.mfes.comm.shared_property.v1~frontx.mfes.comm.language.v1~"
  ],
  "actions": [
    "gts.frontx.mfes.comm.action.v1~frontx.dashboard.mfe.render_widget.v1~"
  ],
  "domainActions": [],
  "manifest": "gts.frontx.mfes.mfe.mf_manifest.v1~frontx.dashboard.widgets.treemap_chart.v1",
  "exposedModule": "./treemap_chart"
}
```

```json
{
  "id": "gts.frontx.mfes.mfe.entry.v1~frontx.mfes.mfe.entry_mf.v1~frontx.dashboard.mfe.waterfall_chart.v1",
  "requiredProperties": [
    "gts.frontx.mfes.comm.shared_property.v1~frontx.mfes.comm.theme.v1~",
    "gts.frontx.mfes.comm.shared_property.v1~frontx.mfes.comm.language.v1~"
  ],
  "actions": [
    "gts.frontx.mfes.comm.action.v1~frontx.dashboard.mfe.render_widget.v1~"
  ],
  "domainActions": [],
  "manifest": "gts.frontx.mfes.mfe.mf_manifest.v1~frontx.dashboard.widgets.waterfall_chart.v1",
  "exposedModule": "./waterfall_chart"
}
```

```json
{
  "id": "gts.frontx.mfes.mfe.entry.v1~frontx.mfes.mfe.entry_mf.v1~frontx.dashboard.mfe.activity_feed.v1",
  "requiredProperties": [
    "gts.frontx.mfes.comm.shared_property.v1~frontx.mfes.comm.theme.v1~",
    "gts.frontx.mfes.comm.shared_property.v1~frontx.mfes.comm.language.v1~"
  ],
  "actions": [
    "gts.frontx.mfes.comm.action.v1~frontx.dashboard.mfe.render_widget.v1~"
  ],
  "domainActions": [],
  "manifest": "gts.frontx.mfes.mfe.mf_manifest.v1~frontx.dashboard.widgets.activity_feed.v1",
  "exposedModule": "./activity_feed"
}
```

```json
{
  "id": "gts.frontx.mfes.mfe.entry.v1~frontx.mfes.mfe.entry_mf.v1~frontx.dashboard.mfe.funnel_chart.v1",
  "requiredProperties": [
    "gts.frontx.mfes.comm.shared_property.v1~frontx.mfes.comm.theme.v1~",
    "gts.frontx.mfes.comm.shared_property.v1~frontx.mfes.comm.language.v1~"
  ],
  "actions": [
    "gts.frontx.mfes.comm.action.v1~frontx.dashboard.mfe.render_widget.v1~"
  ],
  "domainActions": [],
  "manifest": "gts.frontx.mfes.mfe.mf_manifest.v1~frontx.dashboard.widgets.funnel_chart.v1",
  "exposedModule": "./funnel_chart"
}
```

```json
{
  "id": "gts.frontx.mfes.mfe.entry.v1~frontx.mfes.mfe.entry_mf.v1~frontx.dashboard.mfe.heatmap.v1",
  "requiredProperties": [
    "gts.frontx.mfes.comm.shared_property.v1~frontx.mfes.comm.theme.v1~",
    "gts.frontx.mfes.comm.shared_property.v1~frontx.mfes.comm.language.v1~"
  ],
  "actions": [
    "gts.frontx.mfes.comm.action.v1~frontx.dashboard.mfe.render_widget.v1~"
  ],
  "domainActions": [],
  "manifest": "gts.frontx.mfes.mfe.mf_manifest.v1~frontx.dashboard.widgets.heatmap.v1",
  "exposedModule": "./heatmap"
}
```

```json
{
  "id": "gts.frontx.mfes.mfe.entry.v1~frontx.mfes.mfe.entry_mf.v1~frontx.dashboard.mfe.markdown_card.v1",
  "requiredProperties": [
    "gts.frontx.mfes.comm.shared_property.v1~frontx.mfes.comm.theme.v1~",
    "gts.frontx.mfes.comm.shared_property.v1~frontx.mfes.comm.language.v1~"
  ],
  "actions": [
    "gts.frontx.mfes.comm.action.v1~frontx.dashboard.mfe.render_widget.v1~"
  ],
  "domainActions": [],
  "manifest": "gts.frontx.mfes.mfe.mf_manifest.v1~frontx.dashboard.widgets.markdown_card.v1",
  "exposedModule": "./markdown_card"
}
```

**Entry id table:**

| # | Widget type | Entry id | `exposedModule` |
|---|-------------|----------|-----------------|
| 1 | `summary_card` | `gts.frontx.mfes.mfe.entry.v1~frontx.mfes.mfe.entry_mf.v1~frontx.dashboard.mfe.summary_card.v1` | `./summary_card` |
| 2 | `metric_card` | `gts.frontx.mfes.mfe.entry.v1~frontx.mfes.mfe.entry_mf.v1~frontx.dashboard.mfe.metric_card.v1` | `./metric_card` |
| 3 | `ranked_list_card` | `gts.frontx.mfes.mfe.entry.v1~frontx.mfes.mfe.entry_mf.v1~frontx.dashboard.mfe.ranked_list_card.v1` | `./ranked_list_card` |
| 4 | `progress_list_card` | `gts.frontx.mfes.mfe.entry.v1~frontx.mfes.mfe.entry_mf.v1~frontx.dashboard.mfe.progress_list_card.v1` | `./progress_list_card` |
| 5 | `radial_progress` | `gts.frontx.mfes.mfe.entry.v1~frontx.mfes.mfe.entry_mf.v1~frontx.dashboard.mfe.radial_progress.v1` | `./radial_progress` |
| 6 | `grid` | `gts.frontx.mfes.mfe.entry.v1~frontx.mfes.mfe.entry_mf.v1~frontx.dashboard.mfe.grid.v1` | `./grid` |
| 7 | `cartesian_chart` | `gts.frontx.mfes.mfe.entry.v1~frontx.mfes.mfe.entry_mf.v1~frontx.dashboard.mfe.cartesian_chart.v1` | `./cartesian_chart` |
| 8 | `pie_chart` | `gts.frontx.mfes.mfe.entry.v1~frontx.mfes.mfe.entry_mf.v1~frontx.dashboard.mfe.pie_chart.v1` | `./pie_chart` |
| 9 | `radar_chart` | `gts.frontx.mfes.mfe.entry.v1~frontx.mfes.mfe.entry_mf.v1~frontx.dashboard.mfe.radar_chart.v1` | `./radar_chart` |
| 10 | `treemap_chart` | `gts.frontx.mfes.mfe.entry.v1~frontx.mfes.mfe.entry_mf.v1~frontx.dashboard.mfe.treemap_chart.v1` | `./treemap_chart` |
| 11 | `waterfall_chart` | `gts.frontx.mfes.mfe.entry.v1~frontx.mfes.mfe.entry_mf.v1~frontx.dashboard.mfe.waterfall_chart.v1` | `./waterfall_chart` |
| 12 | `activity_feed` | `gts.frontx.mfes.mfe.entry.v1~frontx.mfes.mfe.entry_mf.v1~frontx.dashboard.mfe.activity_feed.v1` | `./activity_feed` |
| 13 | `funnel_chart` | `gts.frontx.mfes.mfe.entry.v1~frontx.mfes.mfe.entry_mf.v1~frontx.dashboard.mfe.funnel_chart.v1` | `./funnel_chart` |
| 14 | `heatmap` | `gts.frontx.mfes.mfe.entry.v1~frontx.mfes.mfe.entry_mf.v1~frontx.dashboard.mfe.heatmap.v1` | `./heatmap` |
| 15 | `markdown_card` | `gts.frontx.mfes.mfe.entry.v1~frontx.mfes.mfe.entry_mf.v1~frontx.dashboard.mfe.markdown_card.v1` | `./markdown_card` |

### Tones type

**GTS ID**: `gts.frontx.dashboard.widget.tones.v1~`

**Description**: A closed named type shared by the render types that colour a status value: `ranked_list_card` `status_tones` refers to it by `$ref`. The root registers it with the other bundle schemas, before the served file.

```json
{
  "$id": "gts://gts.frontx.dashboard.widget.tones.v1~",
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "title": "Tones",
  "description": "The tone each status value is drawn in: a status value (1 to 64 characters, any text) to one of neutral, success, warning, danger or info. A status value with no tone here draws neutral. Closed: no other tone.",
  "type": "object",
  "propertyNames": { "minLength": 1, "maxLength": 64 },
  "additionalProperties": { "enum": ["neutral", "success", "warning", "danger", "info"] }
}
```

**Cross-references**:
- Presentation: a status shows as a kit badge with the status text, so the tone never carries the meaning alone. Each tone takes the kit badge of its name, its colours from theme tokens of the active scope: `neutral` the secondary badge (`--secondary` fill, `--secondary-foreground` text), `success` (`--success-soft`, `--success-foreground`), `warning` (`--warning-soft`, `--warning-foreground`), `danger` (`--danger-soft`, `--danger-foreground`), `info` (`--info-soft`, `--info`). A status value with no tone in the map draws `neutral`.

### summary_card

**GTS ID**: `gts.frontx.dashboard.widget.widget.v1~frontx.dashboard.widget.data_widget.v1~frontx.dashboard.widget.summary_card.v1~`

**Description**: A card with one label/value line per data row, in delivered order.

**Widget type schema:**

```json
{
  "$id": "gts://gts.frontx.dashboard.widget.widget.v1~frontx.dashboard.widget.data_widget.v1~frontx.dashboard.widget.summary_card.v1~",
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "title": "SummaryCard",
  "x-gts-traits": {
    "entry": "gts.frontx.mfes.mfe.entry.v1~frontx.mfes.mfe.entry_mf.v1~frontx.dashboard.mfe.summary_card.v1",
    "data_type": "gts.frontx.dashboard.widget_data.widget_data.v1~frontx.dashboard.widget_data.summary_card.v1~"
  },
  "allOf": [
    { "$ref": "gts://gts.frontx.dashboard.widget.widget.v1~frontx.dashboard.widget.data_widget.v1~" },
    {
      "type": "object",
      "properties": {
        "render": { "$ref": "gts://gts.frontx.dashboard.widget.render.v1~frontx.dashboard.widget.summary_card_render.v1~" }
      }
    }
  ],
  "unevaluatedProperties": false
}
```

**Render type schema:**

```json
{
  "$id": "gts://gts.frontx.dashboard.widget.render.v1~frontx.dashboard.widget.summary_card_render.v1~",
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "title": "SummaryCardRender",
  "description": "Render of a summary_card widget. It has no presentation fields, so render is an empty object.",
  "allOf": [
    { "$ref": "gts://gts.frontx.dashboard.widget.render.v1~" },
    {
      "type": "object",
      "properties": {
      }
    }
  ],
  "unevaluatedProperties": false
}
```

**Data type schema:**

```json
{
  "$id": "gts://gts.frontx.dashboard.widget_data.widget_data.v1~frontx.dashboard.widget_data.summary_card.v1~",
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "title": "SummaryCardData",
  "description": "Data of a summary_card widget: one row per line, in delivered order.",
  "allOf": [
    { "$ref": "gts://gts.frontx.dashboard.widget_data.widget_data.v1~" },
    {
      "type": "object",
      "required": ["rows"],
      "properties": {
        "rows": {
          "type": "array",
          "description": "One row per line, in delivered order.",
          "items": {
            "type": "object",
            "required": ["label", "value"],
            "additionalProperties": false,
            "properties": {
              "label": { "type": ["string", "null"] },
              "value": { "type": ["number", "null"] }
            }
          }
        }
      }
    }
  ],
  "unevaluatedProperties": false
}
```

**Cross-references**:
- Presentation: one label/value line per row, in delivered order. A null value shows as an empty value after its label. A null label shows as an empty label and the row stays.
- Empty state: `rows` is empty. The widget shows its own English "No data to show" (gears-frontx-templates#105).

### metric_card

**GTS ID**: `gts.frontx.dashboard.widget.widget.v1~frontx.dashboard.widget.data_widget.v1~frontx.dashboard.widget.metric_card.v1~`

**Description**: A card with one headline value, an optional trend against `previous_value`, and an optional sparkline.

**Widget type schema:**

```json
{
  "$id": "gts://gts.frontx.dashboard.widget.widget.v1~frontx.dashboard.widget.data_widget.v1~frontx.dashboard.widget.metric_card.v1~",
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "title": "MetricCard",
  "x-gts-traits": {
    "entry": "gts.frontx.mfes.mfe.entry.v1~frontx.mfes.mfe.entry_mf.v1~frontx.dashboard.mfe.metric_card.v1",
    "data_type": "gts.frontx.dashboard.widget_data.widget_data.v1~frontx.dashboard.widget_data.metric_card.v1~"
  },
  "allOf": [
    { "$ref": "gts://gts.frontx.dashboard.widget.widget.v1~frontx.dashboard.widget.data_widget.v1~" },
    {
      "type": "object",
      "properties": {
        "render": { "$ref": "gts://gts.frontx.dashboard.widget.render.v1~frontx.dashboard.widget.metric_card_render.v1~" }
      }
    }
  ],
  "unevaluatedProperties": false
}
```

**Render type schema:**

```json
{
  "$id": "gts://gts.frontx.dashboard.widget.render.v1~frontx.dashboard.widget.metric_card_render.v1~",
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "title": "MetricCardRender",
  "description": "Render of a metric_card widget: its presentation fields, closed.",
  "allOf": [
    { "$ref": "gts://gts.frontx.dashboard.widget.render.v1~" },
    {
      "type": "object",
      "properties": {
        "value_label": { "type": "string", "description": "Optional caption of the headline value. Without it, no caption shows." },
        "better": { "enum": ["higher", "lower", "neutral"], "default": "higher", "description": "Optional direction of an improvement, which sets the trend's colour: higher (the default) paints a rise as success and a fall as danger; lower paints a fall as success and a rise as danger, for numbers where less is better such as lead time; neutral paints every change in the neutral (secondary) badge, for numbers where neither direction is better. The icon and its accessible name always follow the value's own direction." },
        "reference_label": { "type": "string", "description": "Optional name of reference_value, such as Last week, written before it. Without it, Reference." },
        "link": { "type": "object", "required": ["text", "href"], "additionalProperties": false, "properties": { "text": { "type": "string", "description": "The link's text." }, "href": { "type": "string", "description": "The link's target, checked by the shared link rule: https, http, mailto, or a path from the site root (/x, not //x). Any other target shows the text alone. A link to another origin opens in a new tab." } }, "description": "Optional link at the card's foot." }
      }
    }
  ],
  "unevaluatedProperties": false
}
```

**Data type schema:**

```json
{
  "$id": "gts://gts.frontx.dashboard.widget_data.widget_data.v1~frontx.dashboard.widget_data.metric_card.v1~",
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "title": "MetricCardData",
  "description": "Data of a metric_card widget.",
  "allOf": [
    { "$ref": "gts://gts.frontx.dashboard.widget_data.widget_data.v1~" },
    {
      "type": "object",
      "required": ["value"],
      "properties": {
        "value": { "type": ["number", "null"] },
        "previous_value": { "type": ["number", "null"] },
        "sparkline": {
          "type": "array",
          "items": { "type": ["number", "null"] }
        },
        "reference_value": { "type": ["number", "null"], "description": "Optional value the headline is compared with, such as last week's, shown under it with the difference: absolute, and in percent when the reference is not 0. The difference is coloured by the render's better rule, as the trend is. Absent or null shows no comparison." }
      }
    }
  ],
  "unevaluatedProperties": false
}
```

**Cross-references**:
- Presentation: the headline is `value`. The trend compares `value` with `previous_value` and shows a direction icon (up for an increase, down for a decrease, flat for no change) together with the change, so its meaning does not depend on colour. The colour says whether the change is an improvement: with `better` of `higher` (the default) a rise is success and a fall is danger, with `lower` a fall is success and a rise is danger, with `neutral` every change is neutral, and no change is neutral. The trend icon has an accessible name (up, down or no change), the widget's own English text (gears-frontx-templates#105). The change is the relative percent `(value − previous_value) / |previous_value|`, formatted for the host language. When `previous_value` is 0 or null, no change is shown: a 0 shows the direction icon alone, and a null shows no trend; the headline stays. The sparkline draws one point per step, and a null point is a gap.
- Reference: with a number `reference_value`, the line under the headline (which wraps, beside the trend and the caption) adds the reference's name (`reference_label`, or the widget's own English "Reference") and its formatted value, and a badge with the difference `value − reference_value`, formatted by `value_format` with a plus sign before a rise, and in brackets the relative percent `(value − reference_value) / |reference_value|` when the reference is not 0. Each part follows its own shown value: the difference and the percent each carry a sign only when they do not show as zero (1.4 against 1 with no decimals shows `0 (+40%)`, 1000001 against 1000000 shows `+1 (0%)`), and the badge is flat, unsigned and neutral only when every shown part is zero (0.3 against 0.1 + 0.2), otherwise its direction is the sign of the raw difference. The badge colour follows the same `better` rule as the trend; its accessible text starts with "Difference from" and the reference's name (the widget's own English text). A null or absent `reference_value` shows no reference.
- Link: `link` draws its `text` at the card's foot as a link through the shared link rule (Widget links of `cpt-frontx-dashboard-dod-widget-catalog-rendering`). A card whose head and foot are taller than its cell scrolls inside the cell.
- Empty state: `value` is null. The widget shows its own English "No data to show" (gears-frontx-templates#105).

### ranked_list_card

**GTS ID**: `gts.frontx.dashboard.widget.widget.v1~frontx.dashboard.widget.data_widget.v1~frontx.dashboard.widget.ranked_list_card.v1~`

**Description**: A card with one ranked item for each data row: the rank is the delivered position, followed by the label, the value, and an optional secondary value.

**Widget type schema:**

```json
{
  "$id": "gts://gts.frontx.dashboard.widget.widget.v1~frontx.dashboard.widget.data_widget.v1~frontx.dashboard.widget.ranked_list_card.v1~",
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "title": "RankedListCard",
  "x-gts-traits": {
    "entry": "gts.frontx.mfes.mfe.entry.v1~frontx.mfes.mfe.entry_mf.v1~frontx.dashboard.mfe.ranked_list_card.v1",
    "data_type": "gts.frontx.dashboard.widget_data.widget_data.v1~frontx.dashboard.widget_data.ranked_list_card.v1~"
  },
  "allOf": [
    { "$ref": "gts://gts.frontx.dashboard.widget.widget.v1~frontx.dashboard.widget.data_widget.v1~" },
    {
      "type": "object",
      "properties": {
        "render": { "$ref": "gts://gts.frontx.dashboard.widget.render.v1~frontx.dashboard.widget.ranked_list_card_render.v1~" }
      }
    }
  ],
  "unevaluatedProperties": false
}
```

**Render type schema:**

```json
{
  "$id": "gts://gts.frontx.dashboard.widget.render.v1~frontx.dashboard.widget.ranked_list_card_render.v1~",
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "title": "RankedListCardRender",
  "description": "Render of a ranked_list_card widget: its presentation fields, closed.",
  "allOf": [
    { "$ref": "gts://gts.frontx.dashboard.widget.render.v1~" },
    {
      "type": "object",
      "properties": {
        "value_label": { "type": "string", "description": "Optional heading of the primary value." },
        "secondary_label": { "type": "string", "description": "Optional heading of the secondary value." },
        "status_tones": { "$ref": "gts://gts.frontx.dashboard.widget.tones.v1~", "description": "Optional tone of each row status value; a status with no tone draws neutral." }
      }
    }
  ],
  "unevaluatedProperties": false
}
```

**Data type schema:**

```json
{
  "$id": "gts://gts.frontx.dashboard.widget_data.widget_data.v1~frontx.dashboard.widget_data.ranked_list_card.v1~",
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "title": "RankedListCardData",
  "description": "Data of a ranked_list_card widget.",
  "allOf": [
    { "$ref": "gts://gts.frontx.dashboard.widget_data.widget_data.v1~" },
    {
      "type": "object",
      "required": ["rows"],
      "properties": {
        "rows": {
          "type": "array",
          "description": "Rows in the delivered order. secondary is omitted when the data has no secondary value; status and href are optional.",
          "items": {
            "type": "object",
            "required": ["label", "value"],
            "additionalProperties": false,
            "properties": {
              "label": { "type": ["string", "number", "null"] },
              "value": { "type": ["number", "null"] },
              "secondary": { "type": ["number", "null"] },
              "status": { "type": ["string", "null"], "description": "Optional status of the row, shown as a badge after its label, toned by the render's status_tones (neutral when it names none). Null or absent shows no badge." },
              "href": { "type": ["string", "null"], "description": "Optional link target of the row: its label becomes a link, checked by the shared link rule (https, http, mailto, or a path from the site root (/x, not //x)). A refused target shows the label as text. Null or absent shows no link." }
            }
          }
        }
      }
    }
  ],
  "unevaluatedProperties": false
}
```

**Cross-references**:
- Presentation: the first row has rank 1, the second rank 2, and so on. The widget never re-ranks or re-orders the rows. `secondary` is optional; when absent, its column and heading are hidden. `value_label` and `secondary_label` replace the default headings of the two values. A null value or a null secondary value shows as an empty value. A null label shows as an empty label and the row stays.
- Status and link: a row's `status` shows as a badge with its text after the label, in the tone `status_tones` gives it, or neutral (the [Tones type](#tones-type)); a null or absent status, or one with no visible character (the test of Widget links), shows no badge. A row's `href` makes its label a link through the shared link rule; a null or absent `href`, or a label with no visible character (the shared link rule), leaves the label text.
- Empty state: `rows` is empty. The widget shows its own English "No data to show" (gears-frontx-templates#105).

### progress_list_card

**GTS ID**: `gts.frontx.dashboard.widget.widget.v1~frontx.dashboard.widget.data_widget.v1~frontx.dashboard.widget.progress_list_card.v1~`

**Description**: A card with one progress bar for each data row, showing the current value against the target.

**Widget type schema:**

```json
{
  "$id": "gts://gts.frontx.dashboard.widget.widget.v1~frontx.dashboard.widget.data_widget.v1~frontx.dashboard.widget.progress_list_card.v1~",
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "title": "ProgressListCard",
  "x-gts-traits": {
    "entry": "gts.frontx.mfes.mfe.entry.v1~frontx.mfes.mfe.entry_mf.v1~frontx.dashboard.mfe.progress_list_card.v1",
    "data_type": "gts.frontx.dashboard.widget_data.widget_data.v1~frontx.dashboard.widget_data.progress_list_card.v1~"
  },
  "allOf": [
    { "$ref": "gts://gts.frontx.dashboard.widget.widget.v1~frontx.dashboard.widget.data_widget.v1~" },
    {
      "type": "object",
      "properties": {
        "render": { "$ref": "gts://gts.frontx.dashboard.widget.render.v1~frontx.dashboard.widget.progress_list_card_render.v1~" }
      }
    }
  ],
  "unevaluatedProperties": false
}
```

**Render type schema:**

```json
{
  "$id": "gts://gts.frontx.dashboard.widget.render.v1~frontx.dashboard.widget.progress_list_card_render.v1~",
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "title": "ProgressListCardRender",
  "description": "Render of a progress_list_card widget: its presentation fields, closed.",
  "allOf": [
    { "$ref": "gts://gts.frontx.dashboard.widget.render.v1~" },
    {
      "type": "object",
      "properties": {
        "goal_label": { "type": "string", "description": "Optional name of a row goal, in the bar's text alternative and tooltip. Without it, Goal." }
      }
    }
  ],
  "unevaluatedProperties": false
}
```

**Data type schema:**

```json
{
  "$id": "gts://gts.frontx.dashboard.widget_data.widget_data.v1~frontx.dashboard.widget_data.progress_list_card.v1~",
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "title": "ProgressListCardData",
  "description": "Data of a progress_list_card widget.",
  "allOf": [
    { "$ref": "gts://gts.frontx.dashboard.widget_data.widget_data.v1~" },
    {
      "type": "object",
      "required": ["rows"],
      "properties": {
        "rows": {
          "type": "array",
          "description": "Rows in the delivered order.",
          "items": {
            "type": "object",
            "required": ["label", "current", "target"],
            "additionalProperties": false,
            "properties": {
              "label": { "type": ["string", "number", "null"] },
              "current": { "type": ["number", "null"] },
              "target": { "type": ["number", "null"] },
              "goal": { "type": ["number", "null"], "description": "Optional goal of the row: a mark on its bar at goal over target, and the goal in the bar's text alternative and tooltip. The bar runs from 0 to target: a goal outside it extends nothing, its mark stands at the nearer end and the text says it is outside the bar; with a null or zero target the goal shows in the text alone. Null or absent shows no goal." }
            }
          }
        }
      }
    }
  ],
  "unevaluatedProperties": false
}
```

**Cross-references**:
- Presentation: the bar fills in proportion to `current` over `target`, and it is full when `current` reaches or exceeds `target`. Reached and outside are decided on the share as shown: a bar is full only when its share, snapped to 15 significant digits, is at least 1 (below that it fills at most 99.99%, so 2999999999999 of 3000000000000 is not full while 0.3 of 0.1 + 0.2 is), and a goal is outside when its percent rounded to hundredths, where its mark stands, is below 0 or above 100. With a null or zero target, or a null `current`, the bar stays empty, and a null value shows as an empty value. The current and target values are always shown as text, so the bar does not carry meaning alone. Each bar has `role="progressbar"`, named by its label, with its current and target values as text. Bar colours come from kit tokens of the active scope. A null label shows as an empty label and the row stays.
- Goal: a row's number `goal` draws a short upright mark over its bar, in the text colour (`--foreground`), at `goal` over `target`, and adds the goal to the bar's value text and to the tooltip of the bar: the goal's name (`goal_label`, or the widget's own English "Goal"), a colon and the formatted goal. The bar runs from 0 to `target`, and a goal outside it extends nothing: its mark stands at the nearer end of the bar and the text adds "outside the bar". With a null or zero `target` the bar has no range, so the goal shows in the text alone. A null or absent goal shows nothing.
- Empty state: `rows` is empty. The widget shows its own English "No data to show" (gears-frontx-templates#105).

### radial_progress

**GTS ID**: `gts.frontx.dashboard.widget.widget.v1~frontx.dashboard.widget.data_widget.v1~frontx.dashboard.widget.radial_progress.v1~`

**Description**: One value against its target as a ring (a quota, a budget, a coverage goal), with the percent, the value or both in its hole.

**Widget type schema:**

```json
{
  "$id": "gts://gts.frontx.dashboard.widget.widget.v1~frontx.dashboard.widget.data_widget.v1~frontx.dashboard.widget.radial_progress.v1~",
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "title": "RadialProgress",
  "x-gts-traits": {
    "entry": "gts.frontx.mfes.mfe.entry.v1~frontx.mfes.mfe.entry_mf.v1~frontx.dashboard.mfe.radial_progress.v1",
    "data_type": "gts.frontx.dashboard.widget_data.widget_data.v1~frontx.dashboard.widget_data.radial_progress.v1~"
  },
  "allOf": [
    { "$ref": "gts://gts.frontx.dashboard.widget.widget.v1~frontx.dashboard.widget.data_widget.v1~" },
    {
      "type": "object",
      "properties": {
        "render": { "$ref": "gts://gts.frontx.dashboard.widget.render.v1~frontx.dashboard.widget.radial_progress_render.v1~" }
      }
    }
  ],
  "unevaluatedProperties": false
}
```

**Render type schema:**

```json
{
  "$id": "gts://gts.frontx.dashboard.widget.render.v1~frontx.dashboard.widget.radial_progress_render.v1~",
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "title": "RadialProgressRender",
  "description": "Render of a radial_progress widget: its presentation fields, closed.",
  "allOf": [
    { "$ref": "gts://gts.frontx.dashboard.widget.render.v1~" },
    {
      "type": "object",
      "properties": {
        "display": { "enum": ["percent", "value", "both"], "default": "percent", "description": "What the centre of the ring shows: percent, the share of target; value, current formatted by value_format; both, the percent with the value under it. Without it, percent." },
        "center_label": { "type": "string", "description": "Optional short caption under the centre number. Left out in a low cell. Where it does not fit the hole, it stands under the ring when the cell is taller than the ring by its line, and is left out otherwise." },
        "goal_label": { "type": "string", "description": "Optional name of the goal, in the ring's text alternative and tooltip. Without it, Goal." }
      }
    }
  ],
  "unevaluatedProperties": false
}
```

**Data type schema:**

```json
{
  "$id": "gts://gts.frontx.dashboard.widget_data.widget_data.v1~frontx.dashboard.widget_data.radial_progress.v1~",
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "title": "RadialProgressData",
  "description": "Data of a radial_progress widget: one value against its target.",
  "allOf": [
    { "$ref": "gts://gts.frontx.dashboard.widget_data.widget_data.v1~" },
    {
      "type": "object",
      "required": ["current", "target"],
      "properties": {
        "current": { "type": ["number", "null"], "description": "The value the ring fills by, over target; at or above 0 (a negative one fails the cell, a cross-check the widget runs). Full when it reaches or exceeds target; the text alternative says it is over the target only when it is above target. Null shows the empty state." },
        "target": { "type": ["number", "null"], "description": "The value of a full ring; above 0 (one at or below 0 fails the cell, a cross-check the widget runs). Null shows the empty state." },
        "goal": { "type": ["number", "null"], "description": "Optional goal: a tick on the ring at goal over target, and the goal in the text alternative and tooltip. A goal outside the ring extends nothing, its tick stands at the nearer end and the text says it is outside the ring. Null or absent shows no goal." }
      }
    }
  ],
  "unevaluatedProperties": false
}
```

**Cross-references**:
- Presentation: the ring fills clockwise from the top in proportion to `current` over `target`, and it is full when `current` reaches or exceeds `target`; below the target the ring never closes, so a share a hair under it fills and announces at most 99.99% while the text says 99%. Reached, over and outside are decided on the percent as shown: the ring is reached when the share, snapped to 15 significant digits, is at least 1 and over the target when it is above 1 (0.3 of 0.1 + 0.2 is full, shows 100% and is not over; 2999999999999 of 3000000000000 stays below), and a goal is outside when its percent rounded to hundredths, where its tick stands, is below 0 or above 100. The hole shows by `display`: `percent` the share of the target, rounded down to a whole percent (a share below the target never shows 100%), `value` the current value formatted by `value_format`, `both` the percent with the value under it; `center_label` is a caption under them. The ring stands in the square of its cell's shorter side and never draws past the cell. Each centre line is as large as the hole lets it be, by the measured width of the drawn text: a line that would fall under a readable size, or a caption that does not fit the hole, is left out of the hole (the caption first, then the value under the percent), and in a low cell (lower than 200 px) the caption is left out. A caption left out of the hole stands under the ring instead, centred, at its own size or as large as the ring's width lets it be, when the cell is taller than the ring by the caption's line, as a narrow high cell is; the ring keeps the square of the cell's width, and the ring and the caption are centred together. Otherwise, or when the caption would fall under the readable size there too, it is left out. A body too small for the ring draws nothing; the text alternative still says everything. The track (`--border-strong`), the fill (`--chart-5`) and the goal tick (`--foreground`) take kit tokens of the active scope; the fill is one colour.
- Checks: the widget fails its own cell with its own cannot-be-shown state, writing the reason to the console, when `target` is at or below 0 or `current` is below 0, and, like every catalog widget, when a number is not finite. A share beyond the largest number (a huge `current` over a tiny `target`) draws a full ring and leaves the percent out of every text.
- Goal: a number `goal` draws a short tick across the ring, in the text colour, at `goal` over `target`, and adds the goal to the text alternative and the tooltip of the ring: the goal's name (`goal_label`, or the widget's own English "Goal"), a colon and the formatted goal. A goal outside the ring extends nothing: its tick stands at the nearer end (the top, where the ring starts and ends) and the text adds "outside the ring"; a goal is outside by the same percent its tick stands at, so a goal equal to the target is on the ring's end even when its share carries binary error. A null or absent goal shows nothing.
- Text alternative: the ring has `role="progressbar"` with values 0 to 100, named "Progress" (the widget's own English text), and its value text reads the percent, the current value "of" the target, "over the target" when `current` exceeds `target`, and the goal, for example "70%, 34 of 48, Goal: 40". The percent is rounded down, and a share below the target never shows 100%. The type has no `drill_down`, so it has no data view: the value text is its text alternative.
- Empty state: `current` or `target` is null. The widget shows its own English "No data to show" (gears-frontx-templates#105).

### grid

**GTS ID**: `gts.frontx.dashboard.widget.widget.v1~frontx.dashboard.widget.data_widget.v1~frontx.dashboard.widget.grid.v1~`

**Description**: A table that pages and sorts client-side over the rows the transform delivered. The table is the ui-kit DataGrid (ADR-0005).

**Widget type schema:**

```json
{
  "$id": "gts://gts.frontx.dashboard.widget.widget.v1~frontx.dashboard.widget.data_widget.v1~frontx.dashboard.widget.grid.v1~",
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "title": "Grid",
  "x-gts-traits": {
    "entry": "gts.frontx.mfes.mfe.entry.v1~frontx.mfes.mfe.entry_mf.v1~frontx.dashboard.mfe.grid.v1",
    "data_type": "gts.frontx.dashboard.widget_data.widget_data.v1~frontx.dashboard.widget_data.grid.v1~"
  },
  "allOf": [
    { "$ref": "gts://gts.frontx.dashboard.widget.widget.v1~frontx.dashboard.widget.data_widget.v1~" },
    {
      "type": "object",
      "properties": {
        "render": { "$ref": "gts://gts.frontx.dashboard.widget.render.v1~frontx.dashboard.widget.grid_render.v1~" }
      }
    }
  ],
  "unevaluatedProperties": false
}
```

**Render type schema:**

```json
{
  "$id": "gts://gts.frontx.dashboard.widget.render.v1~frontx.dashboard.widget.grid_render.v1~",
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "title": "GridRender",
  "description": "Render of a grid widget: its presentation fields, closed.",
  "allOf": [
    { "$ref": "gts://gts.frontx.dashboard.widget.render.v1~" },
    {
      "type": "object",
      "required": ["columns"],
      "properties": {
        "columns": {
          "type": "array",
          "minItems": 1,
          "description": "Displayed columns, in display order. Each describes one data position. The consistency checks are validated by cpt-frontx-dashboard-algo-widget-catalog-grid-checks.",
          "items": {
            "type": "object",
            "required": ["key"],
            "additionalProperties": false,
            "properties": {
              "key": {
                "type": "string",
                "pattern": "^[a-z][a-z0-9_]{0,63}$",
                "description": "Unique column key. column_groups[].members and row_color refer to this key."
              },
              "title": { "type": "string", "description": "Optional heading." },
              "width": { "type": "integer", "minimum": 1, "description": "Optional width in pixels. The table is at least as wide as the sum of its column widths, counting 160 pixels for a column without one; a grid wider than its cell scrolls sideways inside it. With column_widths content, a width is the column's least width, and a wider value widens it." },
              "format": {
                "type": "object",
                "additionalProperties": false,
                "description": "Optional number format. notation applies to number-valued cells of a text or badge column only: standard shows the full number and compact shows the abbreviated number of the host language. A progress column shows a percent and takes no format.",
                "properties": { "notation": { "enum": ["standard", "compact"] } }
              },
              "value_format": { "$ref": "gts://gts.frontx.dashboard.widget.value_format.v1~", "description": "Optional value format of this column's numbers: a number in a text or badge cell, and the values a sparkline's text alternative names. Without it, the column takes the widget's value_format, so a percent column can sit beside plain counts. The column's format.notation still applies. A progress column shows a percent and takes none. Sorting and search read the column's numbers and the text this format shows." },
              "align": { "enum": ["start", "end", "center"], "default": "start", "description": "Optional alignment of the column body, in logical terms: start and end follow the writing direction of the host language." },
              "sortable": { "type": "boolean", "default": true, "description": "Whether a click on the header sorts by this column. Without it, true, except in a sparkline column, which never sorts: there it is false, and true fails the grid's own check. A badge column sorts by its text, a progress column by its number." },
              "overflow": { "enum": ["wrap", "truncate"], "default": "wrap", "description": "wrap shows the whole value on as many lines as it needs; truncate keeps one line per cell, ends a long value in an ellipsis and keeps its full text as the cell's title. Without it, wrap." },
              "kind": { "enum": ["text", "badge", "progress", "sparkline"], "default": "text", "description": "Optional way a cell draws its value. text (the default) shows it as text. badge shows a string as a badge toned by tones (null or a blank string is an empty cell). progress shows a number from 0 to 1 as a bar with its percent as text (null is an empty cell; a value that is not a number or lies outside 0 to 1 fails the grid's own check). sparkline shows a list of numbers or nulls as a small line in the theme's chart colour, with no axes, its text alternative naming the first, last, lowest and highest values (null is an empty cell; a value that is not a list fails the grid's own check). Without it, text." },
              "tones": { "$ref": "gts://gts.frontx.dashboard.widget.tones.v1~", "description": "Optional tone of each value of a badge column; a value with no tone draws neutral. Allowed with kind badge only: with any other kind it fails the grid's own check." }
            }
          }
        },
        "page_sizes": {
          "type": "array",
          "minItems": 1,
          "uniqueItems": true,
          "items": { "type": "integer", "minimum": 1, "maximum": 500 },
          "default": [10, 25, 50, 100, 500],
          "description": "Optional page sizes offered. The first entry is the initial page size. Defaults to [10, 25, 50, 100, 500]. When every row fits the smallest page size, the grid shows no pager."
        },
        "frozen_columns": { "type": "integer", "minimum": 0, "description": "Number of leading columns that stay visible during horizontal scrolling. 0 or absent freezes no column. More than the column count freezes all." },
        "column_groups": {
          "type": "array",
          "description": "Grouped column headings. A heading only: it never reorders rows or collapses columns.",
          "items": {
            "type": "object",
            "required": ["title", "members"],
            "additionalProperties": false,
            "properties": {
              "title": { "type": "string" },
              "members": {
                "type": "array",
                "minItems": 1,
                "items": { "type": "string", "pattern": "^[a-z][a-z0-9_]{0,63}$", "description": "A column key." }
              }
            }
          }
        },
        "row_color": {
          "type": "string",
          "pattern": "^[a-z][a-z0-9_]{0,63}$",
          "description": "Optional column key. Its value in a row names the row colour: success, warning, error, or info."
        },
        "search": { "type": "boolean", "default": false, "description": "Optional search box above the grid. It keeps the rows whose shown text (formatted numbers, badge text, progress percents and link text; sparklines are not searched) contains the typed text, ignoring case, in any column, and shows the first page. Without it, false." },
        "column_widths": { "enum": ["shared", "content"], "default": "shared", "description": "Optional way the columns get their widths. shared (the default): the columns share the grid's width, each column's width is its track, and a long value wraps. content: each column is as wide as its widest value or its title, every value stays on one line, and a grid wider than its cell scrolls sideways inside it." }
      }
    }
  ],
  "unevaluatedProperties": false
}
```

**Data type schema:**

```json
{
  "$id": "gts://gts.frontx.dashboard.widget_data.widget_data.v1~frontx.dashboard.widget_data.grid.v1~",
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "title": "GridData",
  "description": "Data of a grid widget. One positional array per row, in display order. A position that holds no value holds null.",
  "allOf": [
    { "$ref": "gts://gts.frontx.dashboard.widget_data.widget_data.v1~" },
    {
      "type": "object",
      "required": ["rows"],
      "properties": {
        "rows": {
          "type": "array",
          "maxItems": 500,
          "description": "One positional array per row, in the order of render.columns. A position that holds no value holds null. Capped at 500 rows; an over-cap result fails data validation. Data that holds only the first rows of a larger result gives the full row count in total_rows.",
          "items": {
            "type": "array",
            "items": {
              "oneOf": [
                { "type": ["string", "number", "null"] },
                {
                  "type": "object",
                  "required": ["text", "href"],
                  "additionalProperties": false,
                  "description": "A link: its text, and its target, checked by the shared link rule of the widgets: https, http, mailto, or a path from the site root (/x, not //x). Any other target shows the text alone. A link to another origin opens in a new tab; any other link opens in the same tab.",
                  "properties": {
                    "text": { "type": "string" },
                    "href": { "type": "string" }
                  }
                },
                {
                  "type": "array",
                  "maxItems": 60,
                  "description": "A sparkline: one point per step, a null point being a gap. Allowed in a sparkline column only: in any other column it fails the grid's own check.",
                  "items": { "type": ["number", "null"] }
                }
              ]
            }
          }
        },
        "total_rows": {
          "type": ["integer", "null"],
          "minimum": 0,
          "description": "Optional row count of the full result, when rows holds only its first rows; 0 or more. A count below the number of rows fails the grid's own check. A count above it adds a note with both counts above the table, and the search box then says that it searches only the rows shown. Absent, null or equal to the number of rows, it shows no note. With no rows the grid shows its empty state and no note, whatever the count. The grid never cuts rows itself, and the 500-row cap stays."
        }
      }
    }
  ],
  "unevaluatedProperties": false
}
```

**Cross-references**:
- Data: each row is a positional array. Column `i` reads its value from `rows[r][i]`. A cell of a text column (`kind` absent or `text`) shows its value as text, formatted by the column's `format.notation` and its value format: the column's own `value_format`, or the widget's `value_format` for a column without one. So a percent column can sit beside plain counts and still sort by its numbers. A null value shows an empty cell. A long value wraps and is never cut off, unless its column's `overflow` is `truncate`: then the cell keeps one line, ends in an ellipsis and keeps the full text as its title. The column heading is the column's `title`, or its `key` when it has no `title`.
- Column kinds: `kind` chooses how a column's cells draw. `badge` draws a string as a badge with its text, toned by the column's `tones` (the shared tones type, the same badge as a `ranked_list_card` status); a value with no tone draws neutral, and null or a value with no visible character (the test of Widget links) is an empty cell, never an empty badge. `progress` draws a number from 0 to 1 as a bar with its percent as text beside it, which carries the value (the bar is hidden from assistive technology); the column's `format` and the widget's `value_format` do not apply to it, and null is an empty cell. `sparkline` draws a list of at most 60 numbers or nulls as a small line in the theme's chart colour, with no axes, broken at a null point, a lone point drawn as a dot; its text alternative names the first, last, lowest and highest values, formatted by the column's value format (its own `value_format`, or the widget's), and null or a list with no number is an empty cell. `tones` is allowed only on a badge column. A badge column sorts by its text and a progress column by its number; a sparkline column never sorts (`sortable` is false there, and true fails the check). A value that does not fit its column's kind fails the grid's own check (`cpt-frontx-dashboard-algo-widget-catalog-grid-checks`).
- Data schema change: the grid data type's row item takes a list (`{ "type": "array", "maxItems": 60, "items": { "type": ["number", "null"] } }`) besides text, a number, null and a link, for sparkline columns. A list of more than 60 points fails data validation; a list in any other column fails the grid's own check.
- Search: with `search` true, a search box named by the widget texts ("Search the table") stands above the grid, reachable by Tab with the kit's visible focus ring. Typing keeps the rows whose shown text contains the typed text (spaces at its ends ignored), ignoring case, in any column: formatted numbers, badge text, progress percents and link text; sparklines are not searched. Each new query keeps the sort and shows the first page, client-side, sending no request. A search that keeps no row shows the widget text "No rows match the search". Without `search`, no box shows. When the rows are only part of the full result (see Partial result), the box is named "Search only the rows shown" instead.
- Links: a value `{text, href}` goes through the shared link rule of the widgets (see Cross-type rules): `https`, `http`, `mailto` and a path from the site root (`/x`, not `//x`) show as a link with its `text`; any other target shows `text` as plain text with one console line naming only the kind of target. A link to another origin opens in a new tab with `rel="noopener noreferrer"` and says so in its accessible name; any other link opens in the same tab. A link sorts by its text. A link value in a badge column shows its text as a badge, with no link.
- Column widths: with `column_widths` `shared` (the default), the ui-kit DataGrid uses its fixed table layout: the columns share the grid's width, a column's `width` is its track, and a long value wraps. With `content`, the DataGrid uses its auto table layout with the kit's own table floor (`max-content`): each column is as wide as its widest value or its title, every value stays on one line, and a grid wider than its cell scrolls sideways inside it. A column `width` is then the column's least width.
- Paging: the grid always shows one page. The viewer pages and changes the page size client-side, sending no request. The pager shows the position and the total. When every delivered row fits the smallest page size, the grid shows no pager, because each page size then shows all rows on one page. When the rows do not fit it, the pager stays, also on a larger page size that shows all rows, so the viewer can go back to a smaller one.
- Partial result: data may give `total_rows`, the row count of the full result, when `rows` holds only its first rows. A count above the number of rows adds a note in the grid's toolbar, after the search box: "Showing 500 of 650 rows", with both counts formatted for the host language. The note is text in the kit's muted tone before the table, so assistive technology reads it. It stays in view through a search. The grid itself never cuts rows: the 500-row cap stays. Without `total_rows`, with null, or with a count equal to the number of rows, the grid shows no note and draws as before. `total_rows` is 0 or more (a negative count fails data validation), and a count below the number of rows fails the grid's own check. The note is the widget text `grid.partial` and the box name `grid.searchPartial`, both optional members of the widget texts with these English defaults. The note is meta text in the kit's muted tone, as the other secondary text of the widgets.
- Sorting: one active sort column, following the header cycle of the ui-kit DataGrid: descending, ascending, then the delivered order; only that header shows a sort state, exposed with `aria-sort`. Sorting is client-side over the rows the transform delivered. The comparison, null placement, stability and the reset to the first page follow `cpt-frontx-dashboard-algo-widget-catalog-grid-sort`.
- Frozen columns: the first `frozen_columns` columns stay visible at the leading edge while the viewer scrolls horizontally. A value larger than the number of columns freezes all columns. A group is frozen as a whole, so a count that ends inside a group freezes the whole group.
- Column groups: each group shows its `title` once, in a heading row above the column headings, spanning exactly its columns. A column outside every group has an empty cell in that heading row. Without `column_groups`, the grid has a single heading row.
- Row colour: with `row_color` set, a row whose value is one of `success`, `warning`, `error`, or `info`, matched exactly and case-sensitively, takes the row background of the kit token of that meaning in the active light or dark scope. The row also shows an icon of that meaning, with an accessible name, the widget's own English text (gears-frontx-templates#105). A null or any other value leaves the row uncoloured, and cell text keeps readable contrast.
- Empty state: `rows` is empty. The widget shows its own English "No data to show" (gears-frontx-templates#105), with no partial-result note, also when `total_rows` is set.
- Consistency checks: the grid widget runs `cpt-frontx-dashboard-algo-widget-catalog-grid-checks` and shows its own cannot-be-shown state when one fails: there is exactly one column per data position, group members are columns, groups are contiguous, there are no repeats inside a group, no column belongs to two groups, `row_color` names a column, `tones` stands on badge columns only, no sparkline column is sortable, a list stands only in a sparkline column and a sparkline column holds only lists or null, a progress column holds only numbers from 0 to 1 or null, and `total_rows` is not below the number of rows.

### cartesian_chart

**GTS ID**: `gts.frontx.dashboard.widget.widget.v1~frontx.dashboard.widget.data_widget.v1~frontx.dashboard.widget.cartesian_chart.v1~`

**Description**: A chart on x and y axes with one or more series, each drawn as bars, a line, an area, or scatter points (the ui-kit chart component with Recharts, ADR-0004).

**Widget type schema:**

```json
{
  "$id": "gts://gts.frontx.dashboard.widget.widget.v1~frontx.dashboard.widget.data_widget.v1~frontx.dashboard.widget.cartesian_chart.v1~",
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "title": "CartesianChart",
  "x-gts-traits": {
    "entry": "gts.frontx.mfes.mfe.entry.v1~frontx.mfes.mfe.entry_mf.v1~frontx.dashboard.mfe.cartesian_chart.v1",
    "data_type": "gts.frontx.dashboard.widget_data.widget_data.v1~frontx.dashboard.widget_data.cartesian_chart.v1~"
  },
  "allOf": [
    { "$ref": "gts://gts.frontx.dashboard.widget.widget.v1~frontx.dashboard.widget.data_widget.v1~" },
    {
      "type": "object",
      "properties": {
        "render": { "$ref": "gts://gts.frontx.dashboard.widget.render.v1~frontx.dashboard.widget.cartesian_chart_render.v1~" }
      }
    }
  ],
  "unevaluatedProperties": false
}
```

**Render type schema:**

```json
{
  "$id": "gts://gts.frontx.dashboard.widget.render.v1~frontx.dashboard.widget.cartesian_chart_render.v1~",
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "title": "CartesianChartRender",
  "description": "Render of a cartesian_chart widget: its presentation fields, closed.",
  "allOf": [
    { "$ref": "gts://gts.frontx.dashboard.widget.render.v1~" },
    {
      "type": "object",
      "properties": {
        "series": {
          "type": "array",
          "description": "How each data series is drawn. A data series without an entry here draws by series_default, or, without it, as bars on the primary y axis.",
          "items": {
            "type": "object",
            "required": ["name", "type"],
            "additionalProperties": false,
            "properties": {
              "name": { "type": "string", "description": "The series name, matching a series name in the data." },
              "type": { "enum": ["bar", "line", "area", "scatter"], "description": "How the series is drawn." },
              "y_axis": { "enum": ["primary", "secondary"], "default": "primary", "description": "Which y axis the series uses. Without it, the primary axis." },
              "stack_group": { "type": "string", "description": "Optional stack group. Series with the same stack group on the same y axis are stacked in delivered order: bars and areas together, lines together." },
              "label": { "type": "string", "description": "A line or area only: a name written at the end of the series, at its last point, for example a target." },
              "line_style": { "enum": ["solid", "dashed"], "default": "solid", "description": "A line or area only. Without it, solid." },
              "mark_extremes": { "enum": ["min", "max", "both"], "description": "A line or area only (on another type, a cross-check the widget runs, cpt-frontx-dashboard-algo-widget-catalog-cartesian-checks): a mark with its value on the series' lowest point, highest point, or both; of equal values, the first point in axis order (the drawn order), skipping nulls." }
            }
          }
        },
        "series_default": {
          "type": "object",
          "additionalProperties": false,
          "description": "How every data series without an entry of its own in series is drawn, so a chart whose series names arrive with the data can still stack them. Each field left out takes its own default.",
          "properties": {
            "type": { "enum": ["bar", "line", "area", "scatter"], "default": "bar", "description": "How such a series is drawn. Without it, bars." },
            "y_axis": { "enum": ["primary", "secondary"], "default": "primary", "description": "Which y axis such a series uses. Without it, the primary axis." },
            "stack_group": { "type": "string", "description": "The stack group of such a series. Series with the same stack group on the same y axis are stacked in series order." }
          }
        },
        "x_axis": {
          "type": "object",
          "additionalProperties": false,
          "properties": {
            "type": { "enum": ["category", "value", "time"], "default": "category", "description": "Without it, category." },
            "label": { "type": "string", "description": "A title written under the x axis ticks, and the x column heading of the data view and the text alternative." },
            "tick_labels": { "enum": ["auto", "every"], "default": "auto", "description": "On a category axis both values label each category: a label longer than the room its tick has (the width of its slot on an upright chart, the category axis beside a horizontal chart, a third of the chart's height when turned) is cut with an ellipsis, and the full name shows on hover; only where a slot cannot hold even a few characters is every second, third and so on category labelled. On a value or time axis auto skips number labels that would collide, and every acts as auto. Without it, auto." },
            "tick_angle": { "enum": [0, -45, -90], "default": 0, "description": "Rotation of the tick labels in degrees; a tilted axis grows to fit them, up to a third of the chart's height, past which a category label is cut. Without it, 0." }
          }
        },
        "y_axis": {
          "type": "object",
          "additionalProperties": false,
          "properties": {
            "type": { "enum": ["value", "log"], "default": "value", "description": "Without it, value." },
            "label": { "type": "string", "description": "A title written along the primary y axis, outside its ticks." }
          }
        },
        "y_axis_secondary": {
          "type": "object",
          "additionalProperties": false,
          "description": "Settings of the secondary y axis, used by series whose y_axis is secondary.",
          "properties": {
            "type": { "enum": ["value", "log"], "default": "value", "description": "Without it, value." },
            "label": { "type": "string", "description": "A title written along the secondary y axis, outside its ticks." },
            "unit": { "type": "string", "description": "Written after every tick value of the secondary axis, for example %." }
          }
        },
        "legend_position": { "enum": ["top", "right", "bottom", "left", "none"], "default": "bottom", "description": "none hides the legend. Without it, bottom." },
        "value_labels": { "enum": ["auto", "always", "never"], "default": "never", "description": "Values written at the end of the bars (above a bar that grows up, below one that grows down; a zero bar has none): always, never, or auto when every bar is wide enough for its value. Without it, never." },
        "drill_down": { "type": "boolean", "default": false, "description": "Whether the chart offers its data view and opens it from a click on a mark. Without it, false." },
        "orientation": { "enum": ["vertical", "horizontal"], "default": "vertical", "description": "horizontal puts the categories on the vertical axis and the values on the horizontal one, for every series type; it needs a category x axis (a cross-check the widget runs). tick_angle does not apply to a horizontal chart. Without it, vertical." },
        "stack_mode": { "enum": ["absolute", "percent"], "default": "absolute", "description": "percent draws each stack group as shares of 100% at each x, its axis in percents and the tooltip with the value and its share. Every series on such an axis is in a stack group, no stacked value is negative (cross-checks the widget runs), and an x where a group sums to 0 draws 0% for each member. Without it, absolute." },
        "size_label": { "type": "string", "description": "The name of a scatter point's size, in the tooltip and the data view column. Without it, Size." },
        "reference_lines": {
          "type": "array",
          "maxItems": 8,
          "description": "Lines across the plot at a value, in the muted tone of the axes. A line outside the data extends its axis to hold it.",
          "items": {
            "type": "object",
            "required": ["value"],
            "additionalProperties": false,
            "properties": {
              "axis": { "enum": ["y", "y_secondary", "x"], "default": "y", "description": "The axis the value is on. y_secondary needs a series on the secondary axis (a cross-check the widget runs). Without it, y." },
              "value": { "type": ["number", "string"], "description": "A number on a value axis (on a percent stacked axis, a share from 0 to 1; on a log axis, above zero); on a time x axis, an ISO 8601 date-time string, a bare YYYY-MM-DD date read as its UTC midnight (a date of the calendar: 2026-02-30 fails), or a number of epoch milliseconds, as a point's x there; a category on a category x axis. A string anywhere else, a number on a category x axis, or a value outside these rules fails a cross-check the widget runs." },
              "label": { "type": "string", "description": "Text written at the line's end." },
              "line_style": { "enum": ["dashed", "solid"], "default": "dashed", "description": "Without it, dashed." }
            }
          }
        }
      }
    }
  ],
  "unevaluatedProperties": false
}
```

**Data type schema:**

```json
{
  "$id": "gts://gts.frontx.dashboard.widget_data.widget_data.v1~frontx.dashboard.widget_data.cartesian_chart.v1~",
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "title": "CartesianChartData",
  "description": "Data of a cartesian_chart widget: named series, each with its points, or long-form points that each name their series. Exactly one of the two.",
  "allOf": [
    { "$ref": "gts://gts.frontx.dashboard.widget_data.widget_data.v1~" },
    {
      "type": "object",
      "oneOf": [{ "required": ["series"] }, { "required": ["points"] }],
      "properties": {
        "series": {
          "type": "array",
          "description": "One entry per series, each with its name and points. The series form; with it, no points.",
          "items": {
            "type": "object",
            "required": ["name", "points"],
            "additionalProperties": false,
            "properties": {
              "name": { "type": ["string", "null"] },
              "points": {
                "type": "array",
                "items": {
                  "type": "object",
                  "required": ["x", "y"],
                  "additionalProperties": false,
                  "properties": {
                    "x": { "type": ["string", "number", "null"], "description": "On a value axis, a number. On a time axis, an ISO 8601 date-time string, a bare YYYY-MM-DD date read as its UTC midnight (a date of the calendar: 2026-02-30 fails), or a number of epoch milliseconds. On a category axis, any value. A mismatch is checked by the widget." },
                    "y": { "type": ["number", "null"], "description": "On a series of a log y axis, above zero. A y not above zero there is checked by the widget." },
                    "size": { "type": ["number", "null"], "minimum": 0, "description": "A scatter series only (on another type, a cross-check the widget runs): the point's size; its area grows in proportion to it, within the radius range the widget sets. Null or absent draws the smallest point." }
                  }
                }
              }
            }
          }
        },
        "points": {
          "type": "array",
          "description": "The long form: one entry per point, each naming its series; with it, no series. The widget builds one series per distinct name. Series order (which sets colours, stack order and legend order): the series that have an entry of their own in render.series first, in the order of those entries, then the others in the order their names first appear in the points. A check that fails on a point names the point's index here.",
          "items": {
            "type": "object",
            "required": ["x", "y", "series"],
            "additionalProperties": false,
            "properties": {
              "x": { "type": ["string", "number", "null"], "description": "On a value axis, a number. On a time axis, an ISO 8601 date-time string, a bare YYYY-MM-DD date read as its UTC midnight (a date of the calendar: 2026-02-30 fails), or a number of epoch milliseconds. On a category axis, any value. A mismatch is checked by the widget." },
              "y": { "type": ["number", "null"], "description": "On a series of a log y axis, above zero. A y not above zero there is checked by the widget." },
              "series": { "type": ["string", "null"], "description": "The name of the series the point belongs to. The widget gathers the points of one name into one series, in the order of the points; a series' points keep their order." },
              "size": { "type": ["number", "null"], "minimum": 0, "description": "A scatter series only (on another type, a cross-check the widget runs): the point's size; its area grows in proportion to it, within the radius range the widget sets. Null or absent draws the smallest point." }
            }
          }
        }
      }
    }
  ],
  "unevaluatedProperties": false
}
```

**Cross-references**:
- Presentation: on a category axis the x positions follow the delivered order, and on a value or time axis they are placed by value. On a time axis, `x` is an ISO 8601 date-time string, a bare `YYYY-MM-DD` date read as its UTC midnight, or a number of epoch milliseconds; the bare date follows the heatmap calendar's date rule, through the one date helper both widgets share. A date-time without a zone is read in the host zone, as the browser reads it; a date-time with `Z` or an offset is read at that zone. A date before the year 1 is written with its era (the year 0 as "1 BC"), so it does not read as the year 1. A non-null `x` that does not fit the axis type, and a non-null `y` not above zero on a drawn point of a series of a `log` y axis (on a `value` or `time` axis a point with a null `x` is not drawn), make the widget show its own cannot-be-shown state (`cpt-frontx-dashboard-algo-widget-catalog-cartesian-checks`). A null value is a gap. On a value or time axis, a line or area with no point at an x where another series has one is drawn straight through between its own points there (straight on the axis scale, so on a log axis between the logarithms), and no value is shown for it at that x; on a category axis, a series with no point at a category has a gap there, as a missing value. A series that repeats an x keeps every point: on a category axis each repeat has its own position, in delivered order. A null x shows as an empty label on a category axis; on a value or time axis a point with a null x has no position and is left out. A null series name shows as an empty label. Every series is named in the tooltip and, unless `legend_position` is `none`, in the legend, so series do not differ by colour alone. Numbers follow `value_format`, except on a series of the secondary axis, which shows plain numbers followed by the secondary axis `unit`; the tooltip, the value labels, the text alternative and the data view use the same formats. On a time axis, points that all fall on a midnight are days: every view shows the date alone, read in UTC when every point is a UTC midnight, so a day keeps its date in any time zone. Otherwise the x ticks show the time of day when the points span less than two days (with the day when they cross a local midnight) and dates beyond that, and the tooltip, the text alternative and the data view show the date with the time (seconds when a point has them). A data series without an entry in `render.series` draws by `render.series_default` when the render gives one, and otherwise as bars on the primary axis. A series `label` is written at that series' last point in the text colour, with a halo of the card colour where it crosses a bar, and moved up so it never covers a bar's value label at that point. Rotated tick labels stay on one line. Each axis `label` is written on its axis: the x title under the ticks, a y title along its axis outside the ticks. The chart has an accessible name (the widget's own English default "Chart": the root passes the renderer no cell label, gears-frontx-templates#105) and a text alternative of the delivered series, x and y values.
- Empty state: `series` is empty, or no series has a point. The widget shows its own English "No data to show" (gears-frontx-templates#105).
- Chart colours: the series colours come from the series palette of the active scope, the grid lines, axes, tooltip and legend are kit tokens of it (`cpt-frontx-dashboard-algo-widget-catalog-chart-theme`, ADR-0004).
- Render options: `value_labels` writes each bar's value at its end, above a bar that grows up and below one that grows down (a zero bar has none), formatted by `value_format`; `auto` writes them only when every bar is wide enough, so a larger-view widget can set `auto` and show them where a cell has no room. `tick_labels` and `tick_angle` shape the x axis; a long category name is cut with an ellipsis to the room its tick has and shows whole on hover, so no category loses its label for being long; a value or time axis keeps its own number ticks apart. A series with `label` shows that name at its last point, so a target line is named on the chart. A secondary axis shows `unit` after its tick values. `drill_down` follows the drill-down rule in [Per-type rendering rules](#per-type-rendering-rules).
- Orientation: `orientation` `horizontal` draws the chart turned: the categories down the vertical axis in delivered order (the first at the top), written level beside the plot in a column up to a third of the chart wide, and the values along the horizontal axis, the primary axis at the bottom and the secondary one at the top. Every series type turns with it: bars grow to the right, lines and areas run down the categories, scatter points stand at their category's row. `x_axis.label` is written along the category axis, `y_axis.label` under the bottom axis and `y_axis_secondary.label` over the top one; value labels stand right of the bars' ends and a series `label` right of its last point. `tick_angle` does not apply to a horizontal chart, whose categories are always level. It needs a `category` x axis.
- Long form and series_default: the data is either named `series` or long-form `points`, each point naming its `series`, exactly one of the two. The widget gathers the points of one name into one series before its checks. The series order sets the colours, the stack order and the legend order: the series with an entry of their own in `render.series` come first, in the order of those entries (an entry that names no series of the data takes no place), then the others in the order their names first appear in the points; the series form keeps its delivered order. `series_default` (`type`, `y_axis`, `stack_group`) draws every data series without an entry of its own, in either form, so the rows of an API with a column of outcomes stack into one bar per category with no series named in advance: a transform maps each row to `{x, y, series}` and `series_default` names the stack group.
- Percent stack: with `stack_mode` `percent`, each stack group is drawn as shares of 100% at each x: bars and areas of a group together, lines of a group together, as they stack. The axis that carries the groups runs from 0% to 100% with percent ticks, the tooltip shows each delivered value followed by its share, and the value labels, the text alternative and the data view keep the delivered values. An x where a group sums to 0 draws 0% for every member, and the tooltip shows their values and 0%. Every series on that axis must be in a stack group, and a negative value in a stacked series fails the widget's own check, with the same outcome as the other cartesian checks; the other axis keeps its own values. Under `absolute`, the default, stacks draw as before.
- Extreme marks: `mark_extremes` on a line or area series draws a dot in the series colour with the formatted value on its lowest point (`min`), its highest point (`max`) or both; of equal values, the first point in axis order (the drawn order) takes the mark; nulls are skipped, and a series with no value has no mark. The highest value stands above its dot and the lowest below (right and left of them on a horizontal chart); a label that would leave the plot moves to the dot's other side, and on a vertical chart a series `label` at the same point moves clear of it. On a bar or scatter series it fails the widget's own check.
- Reference lines: up to 8 `reference_lines` are drawn across the plot at their value, 1.5 px wide, in the muted tone of the axes (the kit's muted foreground), dashed unless `line_style` is `solid`. `axis` `y` and `y_secondary` lines run across the plot at a value of that axis (upright on a horizontal chart); an `x` line stands at its category, or at its number on a value or time axis (epoch milliseconds on a time axis). A value outside the data extends the axis so the line stays inside the plot. The `label` stands at the line's end: above its right end for a line across, right of its top for an upright one, in the same muted tone. On a time x axis the value is an ISO 8601 date-time string, a bare `YYYY-MM-DD` date (its UTC midnight) or a number of epoch milliseconds, as a point's x there, and the line stands where a point with that x stands. On a percent stacked axis the value is a share from 0 to 1, and on a log axis it is above zero. On any other value axis a very large value stretches the axis to hold it; that is not checked. A `y_secondary` line with no series on the secondary axis, a category on a y axis or a value x axis, a number on a category x axis, a value on a time x axis that is no date-time or past the times a date holds, a value outside 0 to 1 on a percent axis, and a value at or below zero on a log axis each fail the widget's own check.
- Bubble sizes: a scatter point's `size` (a number from 0, or null) sets its area in proportion to the size, the largest delivered size at a radius of 18 px and every point at least 3 px; a null or absent size draws the smallest point. The largest size counts across all series, so sizes compare between them. Over a value or time x axis next to other series, each sized point keeps its size on the row of its x (an ISO date-time x read as its time). The tooltip names the size by `size_label` ("Size" when absent) with its delivered value, and the text alternative and the data view list it in its own column (`<series>: <size_label>` over categories, one size column on a chart of scatter series only). Only a scatter series takes a `size`: a size on a point of any other series fails the widget's own check.

### pie_chart

**GTS ID**: `gts.frontx.dashboard.widget.widget.v1~frontx.dashboard.widget.data_widget.v1~frontx.dashboard.widget.pie_chart.v1~`

**Description**: A pie or donut chart with one segment for each data row (the ui-kit chart component with Recharts, ADR-0004).

**Widget type schema:**

```json
{
  "$id": "gts://gts.frontx.dashboard.widget.widget.v1~frontx.dashboard.widget.data_widget.v1~frontx.dashboard.widget.pie_chart.v1~",
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "title": "PieChart",
  "x-gts-traits": {
    "entry": "gts.frontx.mfes.mfe.entry.v1~frontx.mfes.mfe.entry_mf.v1~frontx.dashboard.mfe.pie_chart.v1",
    "data_type": "gts.frontx.dashboard.widget_data.widget_data.v1~frontx.dashboard.widget_data.pie_chart.v1~"
  },
  "allOf": [
    { "$ref": "gts://gts.frontx.dashboard.widget.widget.v1~frontx.dashboard.widget.data_widget.v1~" },
    {
      "type": "object",
      "properties": {
        "render": { "$ref": "gts://gts.frontx.dashboard.widget.render.v1~frontx.dashboard.widget.pie_chart_render.v1~" }
      }
    }
  ],
  "unevaluatedProperties": false
}
```

**Render type schema:**

```json
{
  "$id": "gts://gts.frontx.dashboard.widget.render.v1~frontx.dashboard.widget.pie_chart_render.v1~",
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "title": "PieChartRender",
  "description": "Render of a pie_chart widget: its presentation fields, closed.",
  "allOf": [
    { "$ref": "gts://gts.frontx.dashboard.widget.render.v1~" },
    {
      "type": "object",
      "properties": {
        "radius": {
          "type": "array",
          "minItems": 1,
          "maxItems": 2,
          "items": { "type": "string", "pattern": "^[0-9]{1,4}(\\.[0-9]{1,2})?(%|px)$" },
          "description": "Optional outer radius, or inner and outer radius, each a percentage or a pixel value, for example [\"50%\", \"70%\"] for a donut or [\"60px\"]. Two items make a donut."
        },
        "legend_position": { "enum": ["top", "right", "bottom", "left", "none"], "default": "bottom", "description": "none hides the legend. Without it, bottom." },
        "drill_down": { "type": "boolean", "default": false, "description": "Whether the chart offers its data view and opens it from a click on a segment. Without it, false." },
        "center": { "enum": ["none", "total"], "default": "none", "description": "total writes the sum of the slice values, formatted by value_format, in the middle of a donut; it needs a radius of two items with an inner radius above 0 (a cross-check the widget runs, cpt-frontx-dashboard-algo-widget-catalog-card-checks). Without it, none." },
        "center_label": { "type": "string", "description": "Optional short caption under the total. Allowed with center total only (a cross-check the widget runs)." }
      }
    }
  ],
  "unevaluatedProperties": false
}
```

**Data type schema:**

```json
{
  "$id": "gts://gts.frontx.dashboard.widget_data.widget_data.v1~frontx.dashboard.widget_data.pie_chart.v1~",
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "title": "PieChartData",
  "description": "Data of a pie_chart widget.",
  "allOf": [
    { "$ref": "gts://gts.frontx.dashboard.widget_data.widget_data.v1~" },
    {
      "type": "object",
      "required": ["slices"],
      "properties": {
        "slices": {
          "type": "array",
          "description": "One slice per segment, in delivered order.",
          "items": {
            "type": "object",
            "required": ["label", "value"],
            "additionalProperties": false,
            "properties": {
              "label": { "type": ["string", "number", "null"] },
              "value": { "type": ["number", "null"] }
            }
          }
        }
      }
    }
  ],
  "unevaluatedProperties": false
}
```

**Cross-references**:
- Presentation: every segment is listed with its label and value in the tooltip and, unless `legend_position` is `none`, in the legend, so segments do not differ by colour alone. A segment with a null or zero value has no size but stays in the legend. Segment colours are kit chart tokens of the active scope (`cpt-frontx-dashboard-algo-widget-catalog-chart-theme`). The chart has an accessible name (the widget's own English default "Chart": the root passes the renderer no cell label, gears-frontx-templates#105) and a text alternative of the delivered labels and values.
- Centre total: with `center: total` a donut writes the sum of the slice values (nulls left out), formatted by `value_format`, in the middle of its hole, and `center_label` under it as a short caption. The text is sized so the whole block stays inside the hole, from the size of a card headline down to a floor: a line that would fall under it is left out (the caption first). The text alternative ends with a row of the total, named by `center_label` or the widget's own English "Total". `center: total` without a donut (two radius items, the inner one above 0) and `center_label` without `center: total` fail the widget's own check (`cpt-frontx-dashboard-algo-widget-catalog-card-checks`).
- Empty state: `slices` is empty. The widget shows its own English "No data to show" (gears-frontx-templates#105).

### radar_chart

**GTS ID**: `gts.frontx.dashboard.widget.widget.v1~frontx.dashboard.widget.data_widget.v1~frontx.dashboard.widget.radar_chart.v1~`

**Description**: A radar (spider) chart with one spoke per axis and one polygon per series (the ui-kit chart component with Recharts, ADR-0004).

**Widget type schema:**

```json
{
  "$id": "gts://gts.frontx.dashboard.widget.widget.v1~frontx.dashboard.widget.data_widget.v1~frontx.dashboard.widget.radar_chart.v1~",
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "title": "RadarChart",
  "x-gts-traits": {
    "entry": "gts.frontx.mfes.mfe.entry.v1~frontx.mfes.mfe.entry_mf.v1~frontx.dashboard.mfe.radar_chart.v1",
    "data_type": "gts.frontx.dashboard.widget_data.widget_data.v1~frontx.dashboard.widget_data.radar_chart.v1~"
  },
  "allOf": [
    { "$ref": "gts://gts.frontx.dashboard.widget.widget.v1~frontx.dashboard.widget.data_widget.v1~" },
    {
      "type": "object",
      "properties": {
        "render": { "$ref": "gts://gts.frontx.dashboard.widget.render.v1~frontx.dashboard.widget.radar_chart_render.v1~" }
      }
    }
  ],
  "unevaluatedProperties": false
}
```

**Render type schema:**

```json
{
  "$id": "gts://gts.frontx.dashboard.widget.render.v1~frontx.dashboard.widget.radar_chart_render.v1~",
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "title": "RadarChartRender",
  "description": "Render of a radar_chart widget: its presentation fields, closed.",
  "allOf": [
    { "$ref": "gts://gts.frontx.dashboard.widget.render.v1~" },
    {
      "type": "object",
      "properties": {
        "scale_max": { "type": "number", "exclusiveMinimum": 0, "description": "Optional value the outer circle stands for at least: a larger delivered value extends the circle to that value. Without it, the largest delivered value, rounded up by the ticks rule of the radius axis." },
        "fill": { "type": "boolean", "default": true, "description": "Whether each series draws its polygon as a filled area over its stroke. Without it, true." },
        "legend_position": { "enum": ["top", "right", "bottom", "left", "none"], "default": "bottom", "description": "none hides the legend, which one series never shows. Without it, bottom." },
        "drill_down": { "type": "boolean", "default": false, "description": "Whether the chart offers its data view and opens it from a click on a spoke. Without it, false." }
      }
    }
  ],
  "unevaluatedProperties": false
}
```

**Data type schema:**

```json
{
  "$id": "gts://gts.frontx.dashboard.widget_data.widget_data.v1~frontx.dashboard.widget_data.radar_chart.v1~",
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "title": "RadarChartData",
  "description": "Data of a radar_chart widget: the values of the series on the axes, in the long format.",
  "allOf": [
    { "$ref": "gts://gts.frontx.dashboard.widget_data.widget_data.v1~" },
    {
      "type": "object",
      "required": ["points"],
      "properties": {
        "points": {
          "type": "array",
          "minItems": 3,
          "maxItems": 120,
          "description": "Three to 120 points in the delivered order. The widget shows 3 to 12 distinct axes and at most 5 distinct series, as more overlapping polygons stop being readable, and fails the cell outside them (a cross-check it runs, cpt-frontx-dashboard-algo-widget-catalog-card-checks).",
          "items": {
            "type": "object",
            "required": ["axis", "series", "value"],
            "additionalProperties": false,
            "properties": {
              "axis": { "type": "string", "minLength": 1, "maxLength": 40 },
              "series": { "type": ["string", "null"], "minLength": 1, "maxLength": 40, "description": "The name of the series, or null for the one unnamed series." },
              "value": { "type": ["number", "null"] }
            }
          }
        }
      }
    }
  ],
  "unevaluatedProperties": false
}
```

**Cross-references**:
- Presentation: the axes in first-seen order, at most 12 of them, each its own spoke; the series in first-seen order, at most 5 of them (more overlapping polygons would hide each other), each its own polygon in the colour of its position in the series palette, a null series being the one unnamed series. A series with no point on an axis draws a gap there: its polygon skips that vertex, and its tooltip entry is left out. Series colours come from the series palette of the active scope (`cpt-frontx-dashboard-algo-widget-catalog-chart-theme`). The chart has an accessible name (the widget's own English default "Chart": the root passes the renderer no cell label, gears-frontx-templates#105) and a text alternative of the delivered axes and series values.
- Scale: the outer circle is at least `scale_max` when it is given, and a larger delivered value extends it to that value; without `scale_max` it is the largest delivered value rounded up by the ticks rule of the radius axis. A value below 0, a point that repeats the axis and the series of an earlier point (a series has one value per axis, so a second one would hide the first), or points on fewer than 3 distinct axes, fail the cell, the problem naming a position or a count and never a value (`cpt-frontx-dashboard-algo-widget-catalog-card-checks`).
- Axis labels: a cell of any height, low or high, hides all the axis labels when the longest one cannot fit between the circle and the edge of the chart or its legend (the circle sits in the middle of the chart, so a legend under it leaves less room under the circle than above it; one long label hides the short ones too; a narrow high cell leaves as little room beside the circle as a low one), and keeps them in the tooltip and the text alternative.
- Empty state: every value null or 0. The widget shows its own English "No data to show" (gears-frontx-templates#105).

### treemap_chart

**GTS ID**: `gts.frontx.dashboard.widget.widget.v1~frontx.dashboard.widget.data_widget.v1~frontx.dashboard.widget.treemap_chart.v1~`

**Description**: One rectangle (a tile) per item, each as large as its value's share of the total, squarified into the cell (no chart library, its own layout over HTML, like the heatmap and the funnel), optionally nested one level by group.

**Widget type schema:**

```json
{
  "$id": "gts://gts.frontx.dashboard.widget.widget.v1~frontx.dashboard.widget.data_widget.v1~frontx.dashboard.widget.treemap_chart.v1~",
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "title": "TreemapChart",
  "x-gts-traits": {
    "entry": "gts.frontx.mfes.mfe.entry.v1~frontx.mfes.mfe.entry_mf.v1~frontx.dashboard.mfe.treemap_chart.v1",
    "data_type": "gts.frontx.dashboard.widget_data.widget_data.v1~frontx.dashboard.widget_data.treemap_chart.v1~"
  },
  "allOf": [
    { "$ref": "gts://gts.frontx.dashboard.widget.widget.v1~frontx.dashboard.widget.data_widget.v1~" },
    {
      "type": "object",
      "properties": {
        "render": { "$ref": "gts://gts.frontx.dashboard.widget.render.v1~frontx.dashboard.widget.treemap_chart_render.v1~" }
      }
    }
  ],
  "unevaluatedProperties": false
}
```

**Render type schema:**

```json
{
  "$id": "gts://gts.frontx.dashboard.widget.render.v1~frontx.dashboard.widget.treemap_chart_render.v1~",
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "title": "TreemapChartRender",
  "description": "Render of a treemap_chart widget: its presentation fields, closed.",
  "allOf": [
    { "$ref": "gts://gts.frontx.dashboard.widget.render.v1~" },
    {
      "type": "object",
      "properties": {
        "value_labels": { "enum": ["auto", "always", "never"], "default": "auto", "description": "Where a tile writes its label and value, formatted by value_format: auto writes the label, cut with an ellipsis when it is longer than its tile, and the value under it where the tile fits the value (estimated from their lengths); a tile too small for even the first three characters of the label and the ellipsis writes neither, and its name and value stay in its tooltip, the text alternative and the data view. always writes both whatever the tile fits, and never writes neither. Without it, auto." },
        "show_share": { "type": "boolean", "default": false, "description": "Whether a tile writes its value as a share of the total beside its value, and names it in its tooltip, the text alternative and the data view, formatted like the other percents. Without it, false." },
        "drill_down": { "type": "boolean", "default": false, "description": "Whether the chart offers its data view and opens it from a click on a tile. Without it, false." }
      }
    }
  ],
  "unevaluatedProperties": false
}
```

**Data type schema:**

```json
{
  "$id": "gts://gts.frontx.dashboard.widget_data.widget_data.v1~frontx.dashboard.widget_data.treemap_chart.v1~",
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "title": "TreemapChartData",
  "description": "Data of a treemap_chart widget: the items of the treemap, each a labelled value, optionally in a group.",
  "allOf": [
    { "$ref": "gts://gts.frontx.dashboard.widget_data.widget_data.v1~" },
    {
      "type": "object",
      "required": ["items"],
      "properties": {
        "items": {
          "type": "array",
          "minItems": 1,
          "maxItems": 60,
          "description": "One to 60 items in the delivered order. When any item names a group, the widget nests the items one level by group in first-seen order, and a null group goes under its Other group. All values zero or null shows the empty state.",
          "items": {
            "type": "object",
            "required": ["label", "value", "group"],
            "additionalProperties": false,
            "properties": {
              "label": { "type": "string", "minLength": 1, "maxLength": 80, "description": "The name of the item, which its tile writes while it fits." },
              "value": { "type": ["number", "null"], "description": "The value of the item; at or above 0 (a negative one fails the cell, naming the item's position, a cross-check the widget runs). A tile is as large as its value's share of the total. Null draws no tile, and the item stays in the data view." },
              "group": { "type": ["string", "null"], "minLength": 1, "maxLength": 40, "description": "The name of the group the item is nested under, or null to nest it under the widget's Other group. Without any group the tiles take their colours one by one, and with groups they take their group's colour." }
            }
          }
        }
      }
    }
  ],
  "unevaluatedProperties": false
}
```

**Cross-references**:
- Presentation: one tile per item with a value above 0, in delivered order, each as large as its value's share of the total, squarified into the measured box (a row of tiles across the shorter side of the room that is left, filled greedily while the worst aspect ratio of the row improves); a tile keeps exactly its share of the box at every cell size, the room around its text inside it, so a tile too small for any text draws at its slot's size and no tile overlaps another. A positive value too small beside the largest for its area to stay above 0 (5e-324 beside 1e308), or one the rows laid out before it leave no room for (1e-20 beside 1), draws no tile, like a 0, and stays in the text alternative and the data view; a group left no room the same way draws no tile and no header, and its items stay there too. Tile colours are the colours of the series palette by position (`cpt-frontx-dashboard-algo-widget-catalog-chart-theme`), which the widget sets as each tile's own `--tile` property, one colour per item without groups and one per group with them. Each tile is an image named by its label, value, group and share; with drill_down it is a button that opens the data view with its row picked. The chart has an accessible name (the widget's own English default "Chart": the root passes the renderer no cell label, gears-frontx-templates#105) and a text alternative of the delivered labels, groups and values (and with `show_share` their shares). A total beyond the largest number divides by the largest value instead, so shares and areas stay finite.
- Labels: `value_labels: auto` writes a tile's label, cut with an ellipsis when it is longer than its tile, and its value under it while the tile fits the value (estimated from the text lengths, with 8 px of room around the text: a tile at least 32 px high for the label's line, 50 px for the label and the value). A tile narrower than the first three characters of its label and the ellipsis, or the whole label when it is that short, writes neither. `always` writes both whatever the tile fits (the tile clips), `never` writes neither. What a tile does not write stays in its tooltip, which names the label, the value, the group and, with `show_share`, the share.
- Shares: `show_share: true` writes each tile's value as a share of the total beside its value, in the tile's own text colour, and names it in the tooltip, and in a share column of the text alternative and the data view (the widget's own English "Share"), formatted like the other percents; a null value has no share there.
- Groups: when any item names a group, the tiles are nested one level by group in first-seen order, and a null group goes under the widget's own English "Other" (gears-frontx-templates#105); a group literally named "Other" stays a group of its own beside it. A group whose header band its group box fits writes the group name over its tiles, followed by a comma, a space and its total (and with `show_share` its share) while they fit too, as "Web, 6 60%"; a group box too low for the band and an 8 px tile under it, or narrower than the whole name, draws no header, and the group stays in the tile tooltips. A group name is not cut with an ellipsis as a tile label is: a long group name in a narrow group box leaves that group without a header.
- Negative values: a value below 0 fails the cell naming the item (`treemap_chart: data.items[N].value is below 0`).
- Compact cells: a low cell hides the labels and values `auto` would hide, and keeps them in the tooltips and the text alternative.
- Empty state: every value null or 0. The widget shows its own English "No data to show" (gears-frontx-templates#105).

### waterfall_chart

**GTS ID**: `gts.frontx.dashboard.widget.widget.v1~frontx.dashboard.widget.data_widget.v1~frontx.dashboard.widget.waterfall_chart.v1~`

**Description**: How a sequence of labelled changes builds a total (a lead time split into its stages, a budget built from its line items): one bar per step of a running sum, each standing at the sum it leaves, a total drawn from zero, and a thin line joining one bar's end to the next bar's start (the ui-kit chart component with Recharts, like the cartesian, pie and radar charts).

**Widget type schema:**

```json
{
  "$id": "gts://gts.frontx.dashboard.widget.widget.v1~frontx.dashboard.widget.data_widget.v1~frontx.dashboard.widget.waterfall_chart.v1~",
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "title": "WaterfallChart",
  "x-gts-traits": {
    "entry": "gts.frontx.mfes.mfe.entry.v1~frontx.mfes.mfe.entry_mf.v1~frontx.dashboard.mfe.waterfall_chart.v1",
    "data_type": "gts.frontx.dashboard.widget_data.widget_data.v1~frontx.dashboard.widget_data.waterfall_chart.v1~"
  },
  "allOf": [
    { "$ref": "gts://gts.frontx.dashboard.widget.widget.v1~frontx.dashboard.widget.data_widget.v1~" },
    {
      "type": "object",
      "properties": {
        "render": { "$ref": "gts://gts.frontx.dashboard.widget.render.v1~frontx.dashboard.widget.waterfall_chart_render.v1~" }
      }
    }
  ],
  "unevaluatedProperties": false
}
```

**Render type schema:**

```json
{
  "$id": "gts://gts.frontx.dashboard.widget.render.v1~frontx.dashboard.widget.waterfall_chart_render.v1~",
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "title": "WaterfallChartRender",
  "description": "Render of a waterfall_chart widget: its presentation fields, closed.",
  "allOf": [
    { "$ref": "gts://gts.frontx.dashboard.widget.render.v1~" },
    {
      "type": "object",
      "properties": {
        "connectors": { "type": "boolean", "default": true, "description": "Whether a thin line joins one bar's end to the next bar's start, at the level both stand at. Without it, true." },
        "value_labels": { "enum": ["auto", "always", "never"], "default": "auto", "description": "Where a bar writes its change over its top edge, formatted by value_format: a delta's change with its sign (+4.1, -2), a total's running sum as the bare value, with no sign. auto writes it when the label fits the band the bar stands in, estimated from its length, and never in a low cell; the label stays in the tooltip, the text alternative and the data view below that. always writes it whatever the band fits, and never writes none. Without it, auto." },
        "drill_down": { "type": "boolean", "default": false, "description": "Whether the chart offers its data view and opens it from a click on a bar. Without it, false." }
      }
    }
  ],
  "unevaluatedProperties": false
}
```

**Data type schema:**

```json
{
  "$id": "gts://gts.frontx.dashboard.widget_data.widget_data.v1~frontx.dashboard.widget_data.waterfall_chart.v1~",
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "title": "WaterfallChartData",
  "description": "Data of a waterfall_chart widget: the steps of a running sum, each a labelled change or a total.",
  "allOf": [
    { "$ref": "gts://gts.frontx.dashboard.widget_data.widget_data.v1~" },
    {
      "type": "object",
      "required": ["steps"],
      "properties": {
        "steps": {
          "type": "array",
          "minItems": 2,
          "maxItems": 24,
          "description": "Two to 24 steps in the delivered order, of the running sum the chart starts at 0. A delta moves the running sum by its value (a negative one down); a null delta draws nothing and leaves the sum unchanged. A total draws the running sum from 0, and the first step may be a total: the start of the sum, its value the sum begins at. A total's own value stays null or the running sum itself, which the widget cross-checks; a step that moves the running sum out of the finite range fails the cell. All bars of no extent shows the empty state.",
          "items": {
            "type": "object",
            "required": ["label", "value"],
            "additionalProperties": false,
            "properties": {
              "label": { "type": "string", "minLength": 1, "maxLength": 80, "description": "The name of the step, which its band writes on the axis." },
              "value": { "type": ["number", "null"], "description": "The change of a delta step, or the running sum a total step draws: a total's value stays null or the running sum of the steps before it (the widget cross-checks the two, and a mismatch fails the cell naming the step's position). A null delta draws nothing and keeps the sum. A value out of the finite range fails the cell." },
              "kind": { "enum": ["delta", "total"], "default": "delta", "description": "Whether the step moves the running sum by its value (delta), or draws the running sum from zero (total). Without it, delta." }
            }
          }
        }
      }
    }
  ],
  "unevaluatedProperties": false
}
```

**Cross-references**:
- Presentation: one bar per step that draws one, in delivered order, standing at the running sum the chart starts at 0: a delta bar spans the sum its step moves to, a total bar spans the whole sum from 0, and a null delta draws none. The bars are drawn as one stacked series over a transparent base, so a bar of a delta starts where its step starts. The value axis starts at 0 or extends below it to the lowest running sum, and reaches the highest. An increase, a decrease and a total take one tone each, the kit's `--success`, `--danger` and `--muted-foreground` tokens of the active scope, and a legend at the bottom names the tones the drawn bars take, in the order "Increase", "Decrease", "Total" (a waterfall with no decrease names no decrease). With `connectors`, its default, a thin line joins one drawn bar's end to the next drawn bar's start, at the level both stand at, across a step that draws none as well, in a quiet neutral of the kit chrome at 3:1 or more against the card; it stays on the bars in a cell so narrow that the chart library draws them below their asked width.
- Labels: `value_labels: auto` writes a bar's change over the bar's top edge while it fits the band the bar stands in, estimated from the text length (0.62 of the label's 10 px font size, the kit's `--text-micro-size`, per character), and never in a low cell; `always` writes it whatever the band fits, `never` writes none. A delta's label is signed (+4.1, -2); a total's is the bare value with no sign (26.4, and -3 for a sum below zero, the minus being the value's own). The top edge of a bar below zero is the level it starts at for a decrease and zero for a total, so a label never stands inside its bar. What a bar does not write stays in its tooltip, the text alternative and the data view. The x axis writes each step's label under its bar, thinned to fit like the cartesian chart's ticks.
- Tooltip: the hovered bar's band names its step, and the entry names the tone and the step's change, signed on a delta, bare on a total, formatted by `value_format`; a step that draws none (a null delta, a delta of exactly 0, or a total whose running sum is 0) has no entry.
- Checks: the widget fails its own cell with its own cannot-be-shown state, writing the reason to the console, when a total's delivered value is neither null nor the running sum of the steps before it, naming the step by its position (`data.steps[3] is a total, and its value is not the running sum of the steps before it`) and never by its value, and when a step moves the running sum out of the finite range, naming the step that moved it out (`data.steps[1] moves the running sum out of the finite range`), when a delta draws a bar whose extent is beyond the finite range while the sum stays in it (a total's extent is the sum itself), naming that step (`data.steps[1] draws a bar whose extent is beyond the finite range`), and, like every catalog widget, when a number is not finite. A total within a relative tolerance of 1e-9 is the running sum, and its label, tooltip entry and change cell show the running sum it draws. The first step may be a total: the start of the sum, its value the sum begins at.
- Colour and accessibility: the chart is a figure with an accessible name (the widget's own English default "Chart", gears-frontx-templates#105) and a text alternative table of every delivered step: label, change (a signed delta, a bare total, empty for a null delta) and running total under the widget's own English headings "Change" and "Running total". `drill_down` opens the same data view as the other charts, one row per step, and a click on a bar opens its row.
- Empty state: no step draws a bar of any extent (every delta null, every total 0 or null). The widget shows its own English "No data to show" (gears-frontx-templates#105).

### activity_feed

**GTS ID**: `gts.frontx.dashboard.widget.widget.v1~frontx.dashboard.widget.data_widget.v1~frontx.dashboard.widget.activity_feed.v1~`

**Description**: A list of things that happened, in the delivered order the list keeps (an event log, the youngest pull requests): one item per row, each with its time, its title and an optional line of text, the list scrolling inside its cell and a Show more button revealing the next page of items (no chart library; the list is the accessible content, so there is no data view and no drill_down).

**Widget type schema:**

```json
{
  "$id": "gts://gts.frontx.dashboard.widget.widget.v1~frontx.dashboard.widget.data_widget.v1~frontx.dashboard.widget.activity_feed.v1~",
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "title": "ActivityFeed",
  "x-gts-traits": {
    "entry": "gts.frontx.mfes.mfe.entry.v1~frontx.mfes.mfe.entry_mf.v1~frontx.dashboard.mfe.activity_feed.v1",
    "data_type": "gts.frontx.dashboard.widget_data.widget_data.v1~frontx.dashboard.widget_data.activity_feed.v1~"
  },
  "allOf": [
    { "$ref": "gts://gts.frontx.dashboard.widget.widget.v1~frontx.dashboard.widget.data_widget.v1~" },
    {
      "type": "object",
      "properties": {
        "render": { "$ref": "gts://gts.frontx.dashboard.widget.render.v1~frontx.dashboard.widget.activity_feed_render.v1~" }
      }
    }
  ],
  "unevaluatedProperties": false
}
```

**Render type schema:**

```json
{
  "$id": "gts://gts.frontx.dashboard.widget.render.v1~frontx.dashboard.widget.activity_feed_render.v1~",
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "title": "ActivityFeedRender",
  "description": "Render of an activity_feed widget: its presentation fields, closed.",
  "allOf": [
    { "$ref": "gts://gts.frontx.dashboard.widget.render.v1~" },
    {
      "type": "object",
      "properties": {
        "time_style": { "enum": ["relative", "absolute"], "default": "relative", "description": "How an item writes its time: relative from the host clock, in the host language's relative wording (such as \"3 days ago\"), or absolute as the host language writes the date and, for a date-time, its time of day. Without it, relative." },
        "page_size": { "type": "integer", "minimum": 3, "maximum": 50, "default": 10, "description": "How many items the feed shows before its Show more button, which reveals the next page_size items in the delivered order, and disappears when everything is shown. Without it, 10." },
        "show_tone": { "type": "boolean", "default": true, "description": "Whether an item of a tone carries its mark beside the title, named in text for assistive technology. Without it, true." }
      }
    }
  ],
  "unevaluatedProperties": false
}
```

**Data type schema:**

```json
{
  "$id": "gts://gts.frontx.dashboard.widget_data.widget_data.v1~frontx.dashboard.widget_data.activity_feed.v1~",
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "title": "ActivityFeedData",
  "description": "Data of an activity_feed widget: the items of the feed, in the delivered order the list keeps.",
  "allOf": [
    { "$ref": "gts://gts.frontx.dashboard.widget_data.widget_data.v1~" },
    {
      "type": "object",
      "required": ["items"],
      "properties": {
        "items": {
          "type": "array",
          "maxItems": 200,
          "description": "0 to 200 items in the delivered order, which the feed keeps and shows, its Show more button revealing them by page. An empty list is the empty state. Each item needs a time and a title, and may carry a text, a tone of the shared tones, and a link target, which the shared link rule judges. A time no date reads as is legal here: the widget's own cross-check fails the cell naming the item by its position.",
          "items": {
            "type": "object",
            "required": ["time", "title"],
            "additionalProperties": false,
            "properties": {
              "time": { "type": "string", "description": "When the item happened: an ISO 8601 date-time, its zone as Z or an offset written +hh:mm, +hhmm or +hh (each with its minus form), or a bare YYYY-MM-DD date (its UTC midnight, the one date rule of the widgets). The widget cross-checks that a date reads as one, and a time that does not fails the cell naming the item's position." },
              "title": { "type": "string", "minLength": 1, "maxLength": 120, "description": "The one line of the item, beside its time: the link text when the item carries a target." },
              "text": { "type": "string", "maxLength": 400, "description": "An optional line under the title, which wraps." },
              "tone": { "enum": ["neutral", "success", "warning", "danger", "info"], "description": "The shared tone of the item's mark beside its title, written in text for assistive technology; a neutral item draws no mark. Without it, no mark." },
              "href": { "type": "string", "description": "The link target of the title, judged by the shared link rule: a refused one shows the title as text, and the cell does not fail." }
            }
          }
        }
      }
    }
  ],
  "unevaluatedProperties": false
}
```

**Cross-references**:
- Presentation: one list item per delivered item, in the delivered order, never re-sorted. Each item is a row of its title (a link when the item carries a target the shared link rule takes, a refused one showing the title as text), its time and its optional text under them, all wrapping inside the cell. The list scrolls inside the cell whatever its height, and the rows are laid out by kit layout components and tokens only.
- Time: `time_style: relative`, its default, writes each time against the host clock in the host language's relative wording (`Intl.RelativeTimeFormat` with `numeric: auto`, such as "3 days ago", "now", "in 2 hours", "yesterday"). A date-time counts its distance from the clock in the longest unit it fills, rounded, and a rounded count that reaches the next unit moves up to it (60 minutes read "in 1 hour", 7 days "last week", 12 months "last year"). A bare date has no time of day: it counts whole calendar days between the date and today's date in the host zone, so it reads "today", "yesterday", "tomorrow" or "in N days" and "N days ago", moving up to weeks, months and years by the same rule. `absolute` writes the date as the host language writes it (`Intl.DateTimeFormat`), with the time of day for a date-time and none for a bare date, which reads as its UTC midnight. A date-time without a zone is read in the host zone; one with `Z` or an offset (`+hh:mm`, `+hhmm` or `+hh`, each with its minus form) is read at that zone and written in the host zone. An absolute date before the year 1 is written with its era (the year 0 as "1 BC"), so it does not read as the year 1. A relative time is read against the host clock when the widget renders, and while the times are relative a minute tick renders the feed again, so they follow the host clock minute by minute between data updates ("now" turns "1 minute ago"); absolute times keep no tick. The delivered string stays the item's machine-readable `datetime`; the shown text is by the render.
- Paging: the feed shows the first `page_size` items (10 without the field, 3 to 50), and its Show more button, the widget's own English text (gears-frontx-templates#105), reveals the next `page_size` items in the delivered order; the button hides when everything is shown, and new data or a new `page_size` starts over at the first page. After each Show more the focus moves to the first revealed item (its link, or the item itself when it has none), so the keyboard stays in the list after the button goes and the revealed items are announced from their first one.
- Tone: with `show_tone`, its default, an item of a tone carries a mark beside its title painted by the tone's kit token, and the row names the tone in text before the title for assistive technology, so the tone never rides on colour alone; a neutral item draws no mark, and `show_tone: false` draws none anywhere.
- Checks: the widget fails its own cell with its own cannot-be-shown state, writing the reason to the console, when an item's time is neither an ISO 8601 date-time on a day of the calendar nor a `YYYY-MM-DD` date of the calendar (2026-02-30 fails, alone or before a time of day, and so does an offset outside `+hh:mm`, `+hhmm`, `+hh` and their minus forms), naming the item by its position (`activity_feed: data.items[1] needs an ISO 8601 date-time or a YYYY-MM-DD date as its time`) and never by its content, and, like every catalog widget, when a number is not finite. A refused link target shows the title as text and does not fail the cell.
- Accessibility: the list is the accessible content, named by the widget's own English "Activity" (the root passes the renderer no cell label, gears-frontx-templates#105): one list item per item, each `<time>` element carrying the delivered string, so no text alternative and no data view stand beside it, and there is no drill_down. An empty list is the empty state, the widget's own English "No data to show" (gears-frontx-templates#105).

### funnel_chart

**GTS ID**: `gts.frontx.dashboard.widget.widget.v1~frontx.dashboard.widget.data_widget.v1~frontx.dashboard.widget.funnel_chart.v1~`

**Description**: How many items pass each step of a process (visits, sign-ups, trials, purchases) as a funnel: one stage per step, each a bar as wide as its value, with its share of the previous stage.

**Widget type schema:**

```json
{
  "$id": "gts://gts.frontx.dashboard.widget.widget.v1~frontx.dashboard.widget.data_widget.v1~frontx.dashboard.widget.funnel_chart.v1~",
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "title": "FunnelChart",
  "x-gts-traits": {
    "entry": "gts.frontx.mfes.mfe.entry.v1~frontx.mfes.mfe.entry_mf.v1~frontx.dashboard.mfe.funnel_chart.v1",
    "data_type": "gts.frontx.dashboard.widget_data.widget_data.v1~frontx.dashboard.widget_data.funnel_chart.v1~"
  },
  "allOf": [
    { "$ref": "gts://gts.frontx.dashboard.widget.widget.v1~frontx.dashboard.widget.data_widget.v1~" },
    {
      "type": "object",
      "properties": {
        "render": { "$ref": "gts://gts.frontx.dashboard.widget.render.v1~frontx.dashboard.widget.funnel_chart_render.v1~" }
      }
    }
  ],
  "unevaluatedProperties": false
}
```

**Render type schema:**

```json
{
  "$id": "gts://gts.frontx.dashboard.widget.render.v1~frontx.dashboard.widget.funnel_chart_render.v1~",
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "title": "FunnelChartRender",
  "description": "Render of a funnel_chart widget: its presentation fields, closed.",
  "allOf": [
    { "$ref": "gts://gts.frontx.dashboard.widget.render.v1~" },
    {
      "type": "object",
      "properties": {
        "show_conversion": { "type": "boolean", "default": true, "description": "Whether each stage after the first shows its value over the previous stage's value as a percent, in its text line while its label keeps at least 3 em beside it (the tooltip, text alternative and data view always); the first stage shows none, and a stage after a previous value of 0 or null, or with a null value, shows a hyphen. Without it, true." },
        "value_labels": { "enum": ["auto", "always", "never"], "default": "auto", "description": "Whether each stage writes its value, formatted by value_format: auto when the stage's label, value and conversion fit its width together (estimated from their lengths), and never in a low cell; always, the conversion and then the label giving way; never. Without it, auto." },
        "drill_down": { "type": "boolean", "default": false, "description": "Whether the chart offers its data view and opens it from a click on a stage. Without it, false." }
      }
    }
  ],
  "unevaluatedProperties": false
}
```

**Data type schema:**

```json
{
  "$id": "gts://gts.frontx.dashboard.widget_data.widget_data.v1~frontx.dashboard.widget_data.funnel_chart.v1~",
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "title": "FunnelChartData",
  "description": "Data of a funnel_chart widget: the stages of a process, each with how many items reached it.",
  "allOf": [
    { "$ref": "gts://gts.frontx.dashboard.widget_data.widget_data.v1~" },
    {
      "type": "object",
      "required": ["stages"],
      "properties": {
        "stages": {
          "type": "array",
          "minItems": 1,
          "maxItems": 12,
          "description": "One to twelve stages in the delivered order, from the first step of the process to the last. All values zero or null shows the empty state.",
          "items": {
            "type": "object",
            "required": ["label", "value"],
            "additionalProperties": false,
            "properties": {
              "label": { "type": "string", "minLength": 1, "maxLength": 80, "description": "The name of the stage." },
              "value": { "type": ["number", "null"], "description": "How many items reached the stage; at or above 0 (a negative one fails the cell, naming the stage's position, a cross-check the widget runs). A stage larger than the one before is drawn wider, and its conversion reads above 100%. Null draws an empty stage with a hyphen, and neither it nor the next stage shows a conversion." }
            }
          }
        }
      }
    }
  ],
  "unevaluatedProperties": false
}
```

**Cross-references**:
- Presentation: one row per stage, in delivered order, stacked from the top at their own height; the rest of the cell stays empty. Each stage is a bar centred in its row, between 8 px (the kit's `--space-2`) and 32 px (the kit's `--control-height-sm`) high, as wide as its value over the largest value of the funnel, so a stage larger than the one before is drawn wider, never cut; a stage of 0 has no bar. Over the bar a text line names the stage, then its value formatted by `value_format` (by `value_labels`), then its conversion (by `show_conversion`): its value over the previous stage's value as a percent, written by the shared share-to-percent rule with up to 2 decimals (29 of 100 reads 29%, 1 of 80 reads 1.25%, 0.09 after 0.05 reads 180%). The first stage has no conversion. A null value draws an empty stage with a hyphen in place of its bar, and neither it nor the next stage has a conversion: they show a hyphen, as a stage after one of 0 does (no infinity, no "NaN", no "0%"), and the text alternative shows the same hyphen. A label too long for its row ends with an ellipsis; the tooltip of a stage gives its label, value and conversion in full.
- Fit and compact: with `value_labels: auto` a stage writes its value when its label, value and conversion fit its row's width together, estimated from their lengths (0.62 of the 12 px font size per character, 8 px between them); `always` writes it whatever the width, the label giving way; `never` writes none. The widths are an estimate: a line that turns out wider than its row anyway is clipped at the row's end without an ellipsis (only a too-long label ends with one). A stage writes its conversion only while its label keeps at least 3 em (about four characters and the ellipsis, or the whole label if shorter) beside it and the value shown, so in a narrow line the label comes first, then the conversion, then the value; `always` keeps its value and leaves the conversion out instead. In a low cell (lower than 200 px) the `auto` values are left out and the conversions stay. A stage gets its share of the list's height; the bar takes what its text line leaves, capped at 32 px. A stage lower than 26 px (its 16 px text line over a bar of at least 8 px, 2 px apart) writes the line beside its bar, in the first 40% of its width, where the fit is judged; a stage lower than 16 px leaves out its whole text line and keeps its bar. A bar is never lower than 8 px: where the stages do not fit even as bare 8 px bars (12 stages in a low cell), the list scrolls inside the widget's body. The text alternative and the data view still name every stage, value and, with `show_conversion`, conversion.
- Colour and accessibility: every bar takes one colour, the kit's blue chart token (`--chart-5`) of the active scope; the text is the kit's text. The chart is a figure with an accessible name (the widget's own English default "Chart", gears-frontx-templates#105) and a text alternative table of every stage: label, value (a hyphen for null) and, with `show_conversion`, the conversion under the widget's own English heading "Conversion". `drill_down` opens the same data view as the other charts, one row per stage, and a click on a stage opens its row.
- Checks: the widget fails its own cell with its own cannot-be-shown state, writing the reason to the console, when a stage value is negative, naming the stage by its position (`data.stages[2].value is below 0`) and never by its value, and, like every catalog widget, when a number is not finite. A conversion beyond the largest number shows a hyphen.
- Empty state: every stage value is 0 or null. The widget shows its own English "No data to show" (gears-frontx-templates#105).

### heatmap

**GTS ID**: `gts.frontx.dashboard.widget.widget.v1~frontx.dashboard.widget.data_widget.v1~frontx.dashboard.widget.heatmap.v1~`

**Description**: A two-axis grid of cells whose colour shows a value, drawn by the widget as tiles styled with kit tokens, with no chart library (ADR-0004).

**Widget type schema:**

```json
{
  "$id": "gts://gts.frontx.dashboard.widget.widget.v1~frontx.dashboard.widget.data_widget.v1~frontx.dashboard.widget.heatmap.v1~",
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "title": "Heatmap",
  "x-gts-traits": {
    "entry": "gts.frontx.mfes.mfe.entry.v1~frontx.mfes.mfe.entry_mf.v1~frontx.dashboard.mfe.heatmap.v1",
    "data_type": "gts.frontx.dashboard.widget_data.widget_data.v1~frontx.dashboard.widget_data.heatmap.v1~"
  },
  "allOf": [
    { "$ref": "gts://gts.frontx.dashboard.widget.widget.v1~frontx.dashboard.widget.data_widget.v1~" },
    {
      "type": "object",
      "properties": {
        "render": { "$ref": "gts://gts.frontx.dashboard.widget.render.v1~frontx.dashboard.widget.heatmap_render.v1~" }
      }
    }
  ],
  "unevaluatedProperties": false
}
```

**Render type schema:**

```json
{
  "$id": "gts://gts.frontx.dashboard.widget.render.v1~frontx.dashboard.widget.heatmap_render.v1~",
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "title": "HeatmapRender",
  "description": "Render of a heatmap widget: its presentation fields, closed.",
  "allOf": [
    { "$ref": "gts://gts.frontx.dashboard.widget.render.v1~" },
    {
      "type": "object",
      "properties": {
        "x_axis_label": { "type": "string", "description": "Optional x-axis title." },
        "y_axis_label": { "type": "string", "description": "Optional y-axis title." },
        "min_value": { "type": ["number", "null"], "description": "Optional lower end of the colour scale. Null or absent takes the lowest value in the rows. When both ends are set, it is not greater than max_value (a cross-check the widget runs, cpt-frontx-dashboard-algo-widget-catalog-heatmap-checks)." },
        "max_value": { "type": ["number", "null"], "description": "Optional upper end of the colour scale. Null or absent takes the highest value in the rows." },
        "show_cell_values": { "type": "boolean", "description": "Whether to show each cell's value inside the cell." },
        "mode": { "enum": ["matrix", "calendar"], "default": "matrix", "description": "matrix draws the x categories by the y categories. calendar draws one tile per day: a column per week, a row per weekday, the month names over the columns; every row's x is then a YYYY-MM-DD date and its y is omitted or null (a cross-check the widget runs, cpt-frontx-dashboard-algo-widget-catalog-heatmap-checks). Without it, matrix." },
        "week_start": { "enum": ["monday", "sunday"], "default": "monday", "description": "Calendar mode only: the weekday each week column starts on. Set with the matrix mode, it fails the widget's cross-check. Without it, monday." },
        "drill_down": { "type": "boolean", "default": false, "description": "Whether the heatmap offers its data view and opens it from a click on a tile; the tiles are then buttons. Without it, false." }
      }
    }
  ],
  "unevaluatedProperties": false
}
```

**Data type schema:**

```json
{
  "$id": "gts://gts.frontx.dashboard.widget_data.widget_data.v1~frontx.dashboard.widget_data.heatmap.v1~",
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "title": "HeatmapData",
  "description": "Data of a heatmap widget.",
  "allOf": [
    { "$ref": "gts://gts.frontx.dashboard.widget_data.widget_data.v1~" },
    {
      "type": "object",
      "required": ["rows"],
      "properties": {
        "rows": {
          "type": "array",
          "description": "One row per cell value. An omitted y counts as null.",
          "items": {
            "type": "object",
            "required": ["x", "value"],
            "additionalProperties": false,
            "properties": {
              "x": { "type": ["string", "number", "null"] },
              "y": { "type": ["string", "number", "null"] },
              "value": { "type": ["number", "null"] }
            }
          }
        }
      }
    }
  ],
  "unevaluatedProperties": false
}
```

**Cross-references**:
- Presentation: the x and y categories follow the order of their first appearance in the delivered rows. The heatmap shows its colour scale with numbers, and the tooltip of each cell shows its x, y, and value, so values do not depend on colour alone. A null value leaves its cell empty. In matrix mode each x label stands centred under its column while the widest label fits its column; when it does not, as the hour labels of a narrow cell, only every second column is named (every third, and so on, while even that is too narrow), each named label whole under its own column and clear of the next one, and the tiles still name every category. A named last label ends at the grid's end, and a first label that centring would push past the grid's start starts at its column; such an edge label stands nearer its named neighbour, and the step counts that too, so it stays as clear of it. With so few columns that no step lets a label stand whole, only the first column is named, at most as wide as all the columns, and its text is cut; a single column's label ends at the grid's end, at most as wide as its column and the room left of it. The colour scale is built from kit tokens of the active scope: a cell with a value mixes the chart colour over the card surface by its place on the scale, from 20% at the low end to all of it at the high end, so the lowest value never looks like an empty cell, and the scale legend runs over the same range. The heatmap has an accessible name (the widget's own English default "Chart": the root passes the renderer no cell label, gears-frontx-templates#105) and a text alternative of the delivered x, y and values.
- Calendar mode: with `mode` `calendar` the heatmap draws one tile per day, a column per week and a row per weekday from `week_start` (Monday by default), the short month names over the columns and every second weekday named beside the rows. The calendar covers the weeks from the one holding the earliest date to the one holding the latest; days of those weeks outside the delivered range have no tile, and a day inside it without a row, or with a null value, is an empty tile. A month is named over the first week that starts in it (the first week, over its first delivered day), its label as wide as the weeks up to the next month, so no two labels overlap; a month label narrower than two weeks, possible only at the ends, is left out, and the tiles of those days still name their dates. A tile is a square of the largest size that lets every week fit the cell's width and the month row and seven weekdays fit its height, from 4 px up to 1.25 rem (2 rem with `show_cell_values`), so five months of weeks do not scroll sideways even in a small cell. When even 4 px tiles are wider than the cell, as a range of several years in a narrow cell, the calendar scrolls sideways inside its own box and the cell keeps its width; only then is the box a stop of the Tab order, a region named as the heatmap, which the arrow keys scroll. The box never scrolls up and down, so a wheel over it still scrolls the page or the cell. A calendar wants a high cell: a low cell leaves too little height for seven weekday rows, so there its tiles take the 4 px floor, the box keeps the month row and seven tile rows whole, and the cell scrolls vertically. With `show_cell_values` a value is written whole or not at all: the widget measures each tile as it is laid out and hides a value its tile would cut; the tile still names its value. Each tile names its date (medium date style of the host language) and its value. The colour scale, `min_value`, `max_value`, `show_cell_values` and the scale legend work as in matrix mode; `x_axis_label` stands under the calendar and names the date column of the data view, and `y_axis_label` has no place in calendar mode. The text alternative and the data view list the delivered dates and values, without a y column.
- Data type change: `y` of a row is no longer required. It stays `string`, `number` or `null`; matrix mode treats an omitted `y` like a null one, and calendar mode needs it omitted or null.
- Drill-down: with `drill_down` true the heatmap offers the chart data view (`ChartShell` and `DataView`, as `pie_chart` and `cartesian_chart` do): a button above the heatmap switches to the values table and back, and a click on a tile, or Enter or Space on it, opens the table with that tile's row picked, opened and marked. Only then are the tiles buttons, reached by Tab in date order, week by week (matrix mode: in y lines), each named as its tile; a button tile keeps the tile's text size, line height and tabular figures; a tile without a delivered row stays an image, with nothing to open. With `drill_down` absent or false no tile is clickable or focusable.
- Matrix height: in matrix mode the grid takes the height of its cell. The y rows share the height that the axis titles, the x labels and the scale legend leave, each row at least 1 rem tall (1.5 rem with `show_cell_values`), and a cell too low for that scrolls.
- Min/max check: when `min_value` is greater than `max_value`, the widget shows its own cannot-be-shown state (`cpt-frontx-dashboard-algo-widget-catalog-heatmap-checks`).
- Calendar checks: `week_start` with the matrix mode, a calendar row with a `y` that is not null, and a calendar row whose `x` is not a `YYYY-MM-DD` date each fail the widget's own check, with the same outcome (`cpt-frontx-dashboard-algo-widget-catalog-heatmap-checks`).
- Empty state: `rows` is empty. The widget shows its own English "No data to show" (gears-frontx-templates#105).

### markdown_card

**GTS ID**: `gts.frontx.dashboard.widget.widget.v1~frontx.dashboard.widget.markdown_card.v1~`

**Description**: A card that shows its markdown `body` (CommonMark, with embedded HTML shown as text). It is not a data widget: it has no `data`, no `data_type` trait, and it never requests data. A markdown heading keeps its level (`#` is `h1`, `##` is `h2`, `###` is `h3`); in a cell with `frame` `false` and no `title`, a `##` heading with a paragraph is a section heading over the cells that follow, under the page's own top heading.

**Widget type schema:**

```json
{
  "$id": "gts://gts.frontx.dashboard.widget.widget.v1~frontx.dashboard.widget.markdown_card.v1~",
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "title": "MarkdownCard",
  "x-gts-traits": {
    "entry": "gts.frontx.mfes.mfe.entry.v1~frontx.mfes.mfe.entry_mf.v1~frontx.dashboard.mfe.markdown_card.v1"
  },
  "allOf": [
    { "$ref": "gts://gts.frontx.dashboard.widget.widget.v1~" },
    {
      "type": "object",
      "properties": {
        "render": { "$ref": "gts://gts.frontx.dashboard.widget.render.v1~frontx.dashboard.widget.markdown_card_render.v1~" }
      }
    }
  ],
  "unevaluatedProperties": false
}
```

**Render type schema:**

```json
{
  "$id": "gts://gts.frontx.dashboard.widget.render.v1~frontx.dashboard.widget.markdown_card_render.v1~",
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "title": "MarkdownCardRender",
  "description": "Render of a markdown_card widget: its presentation fields, closed.",
  "allOf": [
    { "$ref": "gts://gts.frontx.dashboard.widget.render.v1~" },
    {
      "type": "object",
      "required": ["body"],
      "properties": {
        "body": {
          "type": "string",
          "minLength": 1,
          "description": "The markdown to show: CommonMark, including links and images. Embedded HTML is shown as text."
        },
        "heading_style": {
          "enum": ["default", "section"],
          "default": "default",
          "description": "Optional look of the body's headings: default draws them as titles; section draws each one as a small uppercase section heading in the muted colour, at the kit's label size and weight, as a dashboard draws the heading over a group of cells. The heading level stays the one the markdown gives."
        },
        "text_width": {
          "enum": ["full", "reading"],
          "default": "full",
          "description": "Optional width of the body's running text: full runs every block but a table the full width of the card; reading keeps each paragraph, list and quote to at most 65 characters (65 ch of the body text, a fixed width, not a kit token), from the start of the card however wide its cell is. A heading, a code block, a rule and a paragraph that holds an image keep the card's width either way, and a table keeps its own width either way, never held to the reading width."
        }
      }
    }
  ],
  "unevaluatedProperties": false
}
```

**Cross-references**:
- Rendering: the card renders right after `render_widget`, with no data states, and sends no request.
- Markdown: the body is typical markdown, CommonMark including links and images. The card shows the formatting, the links, and the images.
- Section heading: with `heading_style` of `section`, each heading of the body draws as a small uppercase section heading: the kit's label size, weight and line height, in the muted colour. A product puts such a card, frameless, over a group of cells. The heading level does not change, so `## Section` stays an `h2`.
- Reading width: with `text_width` of `reading`, each paragraph, list and quote of the body runs in lines of at most 65 characters (65 `ch` of the body text, a fixed width), from the start of the cell, however wide the cell is, so a paragraph in a large cell stays readable. A heading, a code block, a rule and a paragraph that holds an image keep the full width of the card, and a table is not held to the reading width and keeps its own width: they are not running text, and a table or a code block held to the reading width would scroll where the cell has room. With `text_width` absent or `full`, every block other than a table runs the full width of the card, and a table keeps its own width.
- Safety: embedded HTML, links and images follow `cpt-frontx-dashboard-algo-widget-catalog-markdown`.
- Other widgets: the markdown card is the only widget that interprets markup. Every other delivered text is rendered as text.

## 7. Acceptance Criteria

- [ ] The 15 widget types ship, each closed with `unevaluatedProperties: false`; `markdown_card` forbids `data`; the 14 data types derive from the widget-data base.
- [ ] A misspelled render field on a concrete widget type fails validation and the widget gets the cannot-be-shown state.
- [ ] The grid sorts and pages client-side over the rows the transform delivered, up to the 500-row cap, with page sizes defaulting to `[10, 25, 50, 100, 500]`, sending no request.
- [ ] `markdown_card` renders CommonMark as `cpt-frontx-dashboard-algo-widget-catalog-markdown` specifies.
- [ ] Given a `markdown_card`, when `render_widget {render}` arrives, then it shows its body at once, sends no request, and shows no loader or empty state.
- [ ] Given a `markdown_card` whose body is `## Delivery` and a paragraph, with `heading_style` `section`, when it renders, then the heading stays an `h2` with its text and draws in capitals in the muted colour at the kit's label size, weight and line height, and the paragraph keeps the body look. With `heading_style` `default` or absent, the heading draws as a title. Given `heading_style` `loud`, the cell fails its render type.
- [ ] Given a `markdown_card` in a large cell whose body holds a heading, a paragraph longer than 65 characters, a list, a table and a code block, with `text_width` `reading`, when it renders, then the paragraph and the list are at most 65 `ch` of the body text wide and start at the start of the card, the heading and the code block keep the card's width, and the table is not held to the reading width and keeps its own width. With `text_width` `full` or absent, every block other than the table takes the card's width, and the table keeps its own width. Given `text_width` `narrow`, the cell fails its render type.
- [ ] A `null` value field is shown as a gap or empty value; a `null` `value` on `metric_card` is the empty state.
- [ ] Given a chart widget, when the host theme switches from light to dark, then its colours take the dark values of the kit chart tokens, and no request is sent, no loader shows, and nothing is remounted.
- [ ] Given a widget whose title, a label, or a chart tooltip value holds `<img src=x onerror=alert(1)>`, when it renders, then the text is shown as text and no element is created.
- [ ] Given a `markdown_card` whose body holds a heading, a raw `<b>` tag, a link with an `https` target, a link with a `mailto` target, and an image, when it renders, then the heading is formatted, no element is created from the raw tag and the tag shows as plain text, the links open in a new browsing context without access to the opener, and the image is shown with its alt text as accessible name.
- [ ] Given a `markdown_card` whose body holds links with the targets `javascript:alert(1)`, `JavaScript:alert(1)`, and ` javascript:alert(1)` (leading space), when it renders, then no link is active and each shows its text as plain text.
- [ ] Given a `markdown_card` whose body holds links with the targets `<java	script:alert(1)>` (a real tab inside), `java&#9;script:alert(1)` (an encoded tab), and `java&#10;script:alert(1)` (an encoded line feed), when it renders, then each target reads as the `javascript` scheme, no link is active, and each shows its text as plain text.
- [ ] Given a `markdown_card` whose body holds links with the targets `vbscript:x`, `data:text/html,x`, `blob:x`, `file:///etc/passwd`, and `custom-app:open`, when it renders, then no link is active. Given links with the targets `https://example.com`, `http://example.com`, `mailto:a@example.com`, and `reports/weekly`, then each link is active and opens in a new browsing context without access to the opener.
- [ ] Given a `markdown_card` whose body holds images with the targets `javascript:alert(1)`, `data:image/png;base64,iVBORw0KGgo=`, `blob:x`, `https://other.example/a.png`, and `//other.example/a.png`, when it renders, then none of them is loaded and each shows its alt text, or nothing when it has none. Given an image with the target `/assets/logo.png`, then the image loads from the page origin with its alt text as accessible name.
- [ ] Given a `metric_card` whose data has `value` 120 and `previous_value` 100, when it renders, then it shows the up direction icon and a change. The change is a relative increase of 20 percent. Given `value` 80, then it shows the down icon and a relative decrease of 20 percent, and given `value` 100, the flat icon and a change of 0 percent. Given `previous_value` 0, then it shows the direction icon and no change. Given a null `previous_value`, then it shows the headline and no trend. In each case, the trend icon has an accessible name for up, down or no change, the widget's own English text (gears-frontx-templates#105). Given `value` 80 against 100, the trend is coloured danger by default and success with `better` of `lower`; given 120 against 100 with `better` of `lower`, it is coloured danger; given 120 or 80 against 100 with `better` of `neutral`, it is coloured neutral; the icon and its name stay down and up.
- [ ] Given a `metric_card` whose data has a `sparkline`, when it renders, then the sparkline draws one point per step, and a null point is a gap.
- [ ] Given a `metric_card` with `value_label` "Open alerts", then the caption shows it. Without `value_label`, no caption shows.
- [ ] Given a `summary_card` with 3 rows, when it renders, then it shows 3 lines in delivered order, each with its label and formatted value, and a null value as an empty value.
- [ ] Given a `ranked_list_card` with `value_label` and `secondary_label`, when it renders, then the two headings show these labels. Given data with no `secondary`, then no secondary value and no secondary heading show.
- [ ] Given a `progress_list_card` with rows (current 120, target 100), (50, 100), (10, null), and (null, 100), when it renders, then the first bar is full, the second is half full, the third and the fourth are empty, and every value shows as text, a null side as a plain hyphen ("10 of -", "- of 100"), and no values when both sides are null. Each bar has `role="progressbar"`, is named by its label, and exposes its current and target values as text.
- [ ] Given a `radial_progress` with current 34, target 48 and goal 40, when it renders with each `display`, then the ring is 70.83% full and its hole shows 70% (`percent`), 34 (`value`) or 70% over 34 (`both`); its value text reads "70%, 34 of 48, Goal: 40" and the goal tick stands at 83.33% of the ring. Given current 60 and target 40, the ring is full and the value text adds "over the target"; given a goal of 60 against target 50, the tick stands at the top and the text adds "outside the ring"; given a target at or below 0 or a current below 0, the cell shows the widget's own cannot-be-shown state; given a `display` outside its values or a render field the type does not declare, the widget's registration fails.
- [ ] Given a `grid` with a column whose `align` is `end`, one whose `format.notation` is `compact` over a number value, one with `compact` while the widget's `value_format` is `percent`, and one with a `title`, when it renders, then the first body is end-aligned, the number is abbreviated, the percent still shows as a percentage, and the heading shows the title.
- [ ] Given a `grid` whose widget `value_format` is `number` and one of whose columns has its own `value_format` of `percent`, when it renders, then that column shows percentages, every other column shows plain numbers, and a sort by that column orders the rows by the numbers, not by the text the cells show.
- [ ] Given a `grid` with 8 columns and `frozen_columns` 2, when the viewer scrolls to the last column, then the first 2 columns stay visible. With `frozen_columns` 0 or absent, all columns scroll.
- [ ] Given a `grid` whose `column_groups` lists a group "Group B" over `c5` and `c6` before a group "Group A" over `c3` and `c4`, when it renders, then a heading row shows "Group A" once over `c3` and `c4` and "Group B" once over `c5` and `c6`, in column position.
- [ ] Given a `grid` with `row_color` set to a column whose values are "error", "Error", "unknown", and null, when it renders in the light scope, then the "error" row takes the error token background of the light scope and shows the error icon with its accessible name, and the other rows show no colour and no icon. When the host theme switches to dark, then the "error" row takes the error token background of the dark scope and no request is sent.
- [ ] Given a `grid` showing rows, when the viewer clicks a sortable column header, then the grid sorts by that column descending; a second click sorts it ascending, and a third click returns the delivered order. Only that header shows a sort state, with `aria-sort`.
- [ ] Given a `grid` whose sortable column holds, in delivered rows r1 to r7, the values 10, "Banana", null, 2, "apple", 2, and null, with host language English, when the viewer sorts ascending, then the row order is r4, r6, r1, r5, r2, r3, r7 (numbers numerically, then strings by the collator, then nulls; equal values keep delivered order). When the viewer sorts descending, then the row order is r1, r4, r6, r2, r5, r3, r7 (nulls stay last).
- [ ] Given a `grid` on its third page, when the viewer sorts by a column, then the grid shows the first page. Given a `grid` on its third page, when the viewer changes the page size, then the grid shows the first page.
- [ ] Given a `grid`, when the viewer changes the page or page size, then the grid pages in place, sending no request.
- [ ] Given a `grid` with page sizes `[5, 10]`, when it shows 5 rows, then it shows no pager. When it shows 6 rows, then it shows the pager, and the pager stays after the viewer picks the page size 10.
- [ ] Given a `grid` with `column_widths` `content` in a cell narrower than its values, when it renders, then each column is as wide as its widest value, no value wraps, and the grid scrolls sideways inside the cell.
- [ ] Given a `grid` with no rows, then it shows "No data to show".
- [ ] Given a `grid` whose data has more than 500 rows, then it fails data validation and the cell shows the cannot-be-shown state; rows are never truncated.
- [ ] Given a `grid` with `search` true whose data has 500 rows and `total_rows` 650, when it renders, then the text "Showing 500 of 650 rows" stands in its toolbar before the table and its search box is named "Search only the rows shown"; the note stays through a search that keeps no row. With `total_rows` absent, null or 500, no note shows and the box is named "Search the table". With no rows and `total_rows` 650, the grid shows "No data to show" and no note. A negative `total_rows` fails data validation.
- [ ] Given a `grid` page of 500 rows, when the viewer scrolls from the first row to the last, then the view stays responsive in the light and the dark scope (`cpt-frontx-dashboard-nfr-large-table`).
- [ ] Given a `grid` whose rows do not fit its smallest page size, when it is inspected, then its table exposes its headers and the sort state of the sorted header (`aria-sort`), its pager is a named navigation landmark, and the sort, page and page size controls can be operated with the keyboard alone.
- [ ] Given a `grid` with link values whose `href` is `https://example.org/a`, `/reports/1`, `mailto:team@example.org`, `reports/1` and `javascript:alert(1)`, when it renders, then the first is a link that opens in a new tab with no opener and says so in its name, the second and third are links that open in the same tab, and the last two show their text as plain text, each with one console line naming only the kind of target.
- [ ] Given a `grid` with a badge column whose `tones` maps "Blocked" to danger, a progress column and a sparkline column, and rows holding "Blocked", "Waiting", null and a blank string, the progress values 0.456, 1, 0 and null, and the lists `[3, null, 1, 5, 4]`, `[2]`, null and `[null, null]`, when it renders, then "Blocked" is a danger badge and "Waiting" a neutral one, null and the blank string are empty cells; the bars show 45.6%, 100% and 0% as text and null is empty; the first list draws a line broken at its null, named "First 3, last 4, lowest 1, highest 5", the second a dot, and the last two nothing. The progress and badge columns sort; the sparkline column offers no sort.
- [ ] Given a `grid` with a progress value of 1.5 or -0.1 or a string, a list in a text column, a number in a sparkline column, `tones` on a column that is not a badge, or `sortable` true on a sparkline column, when the widget receives `render_widget`, then it shows its own cannot-be-shown state and writes the problem to the browser console, never naming the value: the value checks name the column key and the row index, and the `tones` and `sortable` checks name the column key only.
- [ ] Given a `grid` with `search` true on its second page, when the viewer types into its search box, then the grid keeps the rows whose shown text contains the typed text, ignoring case, in any column but sparklines, keeps the sort and shows the first page; a text that matches no row shows "No rows match the search"; the box is reached by Tab and named by the widget texts.
- [ ] Given a `grid` column whose `overflow` is `truncate` and a value longer than the column, when it renders, then the cell keeps one line, ends in an ellipsis and carries the full value as its title.
- [ ] Given a `grid` whose `columns` has two entries with the same `key`, whose `column_groups` names a key that is not a column, whose group columns are not contiguous, whose column is in two groups, whose `row_color` is not a column key, or whose member is repeated within one group, when the widget receives `render_widget`, then in each case the widget draws no rows, shows its own cannot-be-shown state in its cell, and writes the problem to the browser console; the other cells are unaffected. Given a `grid` whose data has a row with fewer or more values than `columns`, or a `total_rows` below the number of rows, when the widget receives `render_widget`, then the widget shows its own cannot-be-shown state in the same way.
- [ ] Given a `cartesian_chart` with a category x axis, when it renders, then the x positions follow the delivered order. With a value or time x axis, points are placed by value. A null value is a gap; a null x or series name is an empty label. Every series is named in the legend and the tooltip.
- [ ] Given a `cartesian_chart` whose data has a series with no entry in `render.series`, when it renders, then that series draws by `series_default`, or, without it, as bars on the primary axis.
- [ ] Given a `cartesian_chart` with `series_default` `{type: bar, stack_group: runs}` and eight long-form points of two outcomes, "ok" first, over four days, when it renders, then it draws four bars of two stacked parts and a legend of two entries, "ok" then "failed"; with `stack_mode` `percent` each bar fills the plot to 100%; with twelve outcomes each takes a colour of its own.
- [ ] Given a `cartesian_chart` whose long-form points name the series c, a, b, d in that first-seen order and whose `render.series` lists b and then a, when it renders, then the series order, in the legend, the colours and the stacks, is b, a, c, d.
- [ ] Given a `cartesian_chart` whose data carries both `series` and `points`, or neither, when the root stamps the data, then the data fails its type and the cell shows the cannot-be-shown state; the widget's own check fails such data too. A long-form point that fails a widget check is named by its index in `points`.
- [ ] Given a `cartesian_chart` with two series and a `render.series` entry for each, one drawn as bars and one as a line on the secondary y axis, when it renders, then the legend names both series and a null value is a gap in the line.
- [ ] Given a `cartesian_chart` with a `time` x axis and points whose `x` values are "2026-10-01T00:00:00Z", 1790899200000 (epoch milliseconds for 2026-10-02T00:00:00Z), and "2026-10-03T12:00:00+02:00", when it renders, then each point is placed at its time.
- [ ] Given a `cartesian_chart` with a `time` x axis, a line "Requests" with points at 10:00, 10:05 and 10:10, and a line "Errors" with points at 10:02 and 10:07 of one day, when it renders, then each line is drawn unbroken through its own points, the ticks show times of day, and the tooltip, the text alternative and the data view show the date and time of each point, with no value for a series at a time it has no point.
- [ ] Given a `cartesian_chart` with two line series in the same `stack_group` on the same y axis, when it renders, then the second line is drawn at the sum of both series, and the tooltip and the data view show each series' own value.
- [ ] Given a `cartesian_chart` bar chart of 12 categories with names of 25 to 30 characters, upright or horizontal, when it renders, then each category is labelled, a label longer than its tick's room ends in an ellipsis, and hovering it shows the full name.
- [ ] Given a `cartesian_chart` with `x_axis.label` "Elapsed seconds", `y_axis.label` "Requests" and `y_axis_secondary.label` "CPU", when it renders, then each title is written on its axis without covering a tick label.
- [ ] Given a `cartesian_chart` with a `time` x axis and a point whose `x` is "last week", or a `value` x axis and a point whose `x` is "ten", when the widget receives `render_widget`, then it shows its own cannot-be-shown state in its cell and writes the problem to the browser console; the other cells are unaffected.
- [ ] Given a `cartesian_chart` whose `y_axis` is `log` and a series on it with a point whose `y` is 0, or a `time` x axis and a point whose `x` is the number 1e20, when the widget receives `render_widget`, then it shows its own cannot-be-shown state in its cell and writes the problem to the browser console.
- [ ] Given a `pie_chart`, when it renders, then the legend and tooltip show each segment's label and value. A null or zero segment has no size but stays in the legend.
- [ ] Given a `pie_chart` with `radius` ["40%", "70%"], when it renders, then it draws a donut. Given `radius` ["big"], then validation fails.
- [ ] Given a `funnel_chart` with stages Opened 200, Reviewed 150, Approved 120 and Merged 96, when it renders, then the bars are 100%, 75%, 60% and 48% as wide as the widest, each stage writes its label and value, and the conversions read 75%, 80% and 80% (the first stage none). Given a stage of 100 after one of 80, its bar is the widest and its conversion reads 125%. Given a null stage, it draws a hyphen in place of its bar and it and the next stage show a hyphen for their conversion; given a stage after one of 0, its conversion is a hyphen, in the drawing and the text alternative alike. Given a negative value at the third stage, the cell shows its own cannot-be-shown state and the console names `data.stages[2].value`, not the value. Given every value 0 or null, it shows the empty state. Given `value_labels` `inside` or a render field it does not declare, the cell fails its render type.
- [ ] Given a `radar_chart` with two series on three axes and a null value of one series on the second axis, when it renders, then each series draws its own polygon in its series tone with no vertex on that axis, and the hovered axis' tooltip has no entry for that series. Given a value below 0, a point that repeats the axis and the series of an earlier point, points on fewer than 3 distinct axes, a 13th distinct axis or a 6th distinct series, then it shows its own cannot-be-shown state in its cell and writes the problem, naming a position or a count and never a value, to the browser console (`cpt-frontx-dashboard-algo-widget-catalog-card-checks`).
- [ ] Given a `treemap_chart` with items a 3, b 1 in a cell whose box is twice as wide as it is high, when it renders, then the first tile is three quarters of the box and the second one quarter, each writes its label, cut with an ellipsis where it is longer than its tile, and its value under it while the tile fits the value, and a tile narrower than the first three characters of its label and the ellipsis writes neither but keeps its name and value in its tooltip. Given `show_share` `true`, each tile writes its share of the total beside its value (75%, 25%). Given items a 4 in "Web", b 3 with no group, c 2 in "Web" and d 1 in "Data", the tiles nest one level by group in first-seen order with b under "Other", each tile in its group's colour, and a group whose box fits the whole name writes it over its tiles. Given a value of 0 or null, it draws no tile and the item stays in the text alternative and the data view. Given a negative value on the second item, the cell shows its own cannot-be-shown state and the console names `data.items[1].value`, not the value. Given every value 0 or null, it shows the empty state. Given `value_labels` `inside` or a render field it does not declare, the cell fails its render type.
- [ ] Given a `waterfall_chart` with the steps Coding +4.1, Review +17, CI +3.2, Waiting to deploy +2.1 and the total Lead time 26.4, when it renders, then the deltas climb one after another, the total bar spans the whole sum from zero, a thin line joins one bar's end to the next bar's start, the legend names Increase and Total (no step decreases), and in a 1280 px wide page every bar writes its label, the +17.0 hr of Review included. Given the steps Start 10 (a total), Up +4, Down -3 and End 11 (a total), then the first total sets the sum the deltas move from, the decrease hangs below the level it starts at, the last total equals the running sum, and the legend names Increase, Decrease and Total in that order. Given a total whose value is not the running sum, or a step that moves the sum out of the finite range, the cell shows its own cannot-be-shown state and the console names `data.steps[N]`, not the value. Given a null delta, it draws no bar and the sum stays, the text alternative showing an empty change. Given every delta null, it shows the empty state. Given `value_labels` `sometimes` or a render field it does not declare, the cell fails its render type.
- [ ] Given a `waterfall_chart` with the steps 10, -15, +12 and the total 7, when it renders, then the decrease spans 10 down to -5 across zero, the increase -5 up to 7, the total stands on zero up to 7, and each connector leaves at the level the bar before it ends at (10, -5, 7). Given the steps 5, -8 and the total -3, then the total hangs from zero down to -3, its bare label -3 stands over zero and the decrease's label -8 over 5, each above its bar and never inside it (`value_labels` `always`).
- [ ] Given an `activity_feed` with `time_style` `absolute` and five of twelve items shown (`page_size` 5), when it renders, then the items stand in the delivered order, each row its title beside its time (the delivered string as the machine-readable `datetime`, the date as the host language writes it, with the time of day for a date-time and none for a bare date) and its text under them, and the Show more button reveals the next five and hides once all twelve stand. Given `time_style` `relative` (its default), a time three days before the host clock reads "3 days ago" in the host language. Given an item of a tone with `show_tone` on (its default), the row carries the tone's mark and names the tone in text before the title; a neutral item draws no mark. Given an item whose target the shared link rule refuses, the title shows as text and the cell does not fail. Given an item whose time is neither an ISO 8601 date-time nor a `YYYY-MM-DD` date, the cell shows its own cannot-be-shown state and the console names `data.items[N]`, not the value. Given `items` [], it shows the empty state. Given `page_size` 2 or a render field it does not declare, the cell fails its render type.
- [ ] Given a `cartesian_chart` with `orientation` `horizontal` and bars over three categories, when it renders, then the categories stand down the vertical axis in delivered order and each bar's length follows its value; with a `value` or `time` x axis the widget shows its own cannot-be-shown state.
- [ ] Given a `cartesian_chart` with `stack_mode` `percent` and two bar series in one stack group, when it renders, then each x's segments fill the plot to 100%, the axis shows percents and the tooltip shows each value with its share; an x where both values are 0 draws both at 0%, and a negative value in the group shows the widget's own cannot-be-shown state.
- [ ] Given a line series with `mark_extremes` `both`, when it renders, then its first lowest and first highest values carry a dot and their value; on a bar series the widget shows its own cannot-be-shown state.
- [ ] Given a `reference_lines` entry above the data's highest value, when the chart renders, then its axis extends and the line, dashed by default, is drawn inside the plot with its label at its end; a `y_secondary` line without a secondary series, a category value on a y axis, or a number on a category x axis shows the widget's own cannot-be-shown state.
- [ ] Given a scatter series whose points carry `size`, when it renders, then the larger size draws the larger point, area in proportion, and the tooltip and the data view name the size by `size_label`; a `size` on a point of a bar, line or area series shows the widget's own cannot-be-shown state.
- [ ] Given a `cartesian_chart`, `pie_chart`, `radar_chart`, `treemap_chart`, `waterfall_chart` or `funnel_chart` with `drill_down` `true`, when the viewer activates "Show data", then the area shows the data view with every delivered value and no request is sent; when the viewer clicks a mark, the data view opens with that mark's row opened and marked. With `drill_down` absent, the chart has no "Show data" button and no clickable marks.
- [ ] Given a `cartesian_chart` with `value_labels` `always`, a line series with `label` "Goal" and `line_style` `dashed`, and a secondary axis with `unit` "%", when it renders, then every bar shows its value, the line is dashed and named "Goal" at its last point, and the secondary ticks end in "%".
- [ ] Given a `heatmap`, when it renders, then the categories follow first-appearance order, the scale is shown with numbers, the tooltip shows x, y, and value, and a null value leaves the cell empty. The cell of the lowest value mixes 20% of the chart colour over the card surface, so in the light and the dark theme it differs from an empty cell, and the scale starts at that same 20%.
- [ ] Given a `heatmap` with `min_value` 0, `max_value` 100, and `show_cell_values` true, when it renders, then the colour scale runs from 0 to 100 and each cell shows its value. Given `min_value` and `max_value` absent or null, then the scale takes the lowest and the highest value in the data.
- [ ] Given a matrix `heatmap` with three y categories and both axis titles in a high cell, when it renders, then the three tile rows share the height the axis titles, the x labels and the scale leave, and the tile grid ends at the scale. Given seven y categories in a low cell, then each row stays 1 rem tall (1.5 rem with `show_cell_values`) and the cell scrolls. A calendar heatmap keeps its own tile size.
- [ ] Given a `heatmap` with `mode` `calendar` and daily rows with no `y`, when it renders, then it draws a tile per day of the delivered range in weeks by weekdays from `week_start`, names the months over their first week, leaves a day without a row an empty tile, and fits every week in its cell without sideways scrolling. Given `week_start` with the matrix mode, a calendar row with a `y`, or a calendar row whose `x` is not a `YYYY-MM-DD` date, then the widget shows its own cannot-be-shown state.
- [ ] Given a `heatmap` with `drill_down` true, when a tile is clicked, or reached by Tab and pressed with Enter, then the data view opens with that tile's row picked; with `drill_down` absent no tile is a button.
- [ ] Given a `heatmap` whose `min_value` is greater than its `max_value`, when the widget receives `render_widget`, then it shows its own cannot-be-shown state in its cell and writes the problem to the browser console, as `cpt-frontx-dashboard-algo-widget-catalog-heatmap-checks` specifies; the other cells are unaffected.
- [ ] Given a data widget whose answer has a null label, x, y, or series value, when it renders, then that value shows as an empty label and the row or point stays.
- [ ] Given a chart widget, when it builds a tooltip, then the tooltip is built from text, never from HTML strings.
- [ ] Given a widget, when it conveys meaning, then colour is never the only signal: the heatmap's numeric scale, progress values as text, the trend icon, and series and segment naming in legends and tooltips all carry the meaning.
- [ ] Given the dashboard root, when it is inspected, then it has no chart-library dependency.
- [ ] Given a widget, when the host theme id maps to dark, then it uses the dark ui-kit scope; an unknown id gives light. The set of dark theme ids is enumerated and updated when the host adds a dark theme.
- [ ] Given the reference dashboard, when all 15 widget types are inspected in both scopes, in a cell and in the larger view, against the design-system reference, then every colour, font, and spacing value comes from kit tokens (`cpt-frontx-dashboard-nfr-visual-quality`), and no widget conveys meaning by colour alone (`cpt-frontx-dashboard-nfr-accessibility`).
- [ ] Given a dashboard with one cell of each data widget type, when one cell's transform output breaks its data type, then that cell shows the cannot-be-shown state and every other cell is unaffected. Each of these fixtures, run on its own, gives this result:
  - `summary_card`: a row `{"label": "A", "value": "12"}` (wrong type); a row `{"label": "A"}` (missing `value`); a row `{"label": "A", "value": 1, "unit": "x"}` (extra field).
  - `metric_card`: `{"value": "12"}` (wrong type); `{"previous_value": 1}` (missing `value`); `{"value": 1, "trend": "up"}` (extra field).
  - `ranked_list_card`: a row `{"label": "A", "value": "12"}` (wrong type); a row `{"label": "A"}` (missing `value`); a row `{"label": "A", "value": 1, "rank": 1}` (extra field).
  - `progress_list_card`: a row `{"label": "A", "current": "50", "target": 100}` (wrong type); a row `{"label": "A", "current": 50}` (missing `target`); a row `{"label": "A", "current": 50, "target": 100, "percent": 50}` (extra field).
  - `radial_progress`: `{"current": "3", "target": 10}` (wrong type); `{"current": 3}` (missing `target`); `{"current": 3, "target": 10, "label": "a"}` (extra field).
  - `grid`: a row `["A", true]` (wrong type); `{}` (missing `rows`); `{"rows": [], "columns": []}` (extra field).
  - `cartesian_chart`: a point `{"x": "Mon", "y": "5"}` (wrong type); a point `{"x": "Mon"}` (missing `y`); a point `{"x": "Mon", "y": 5, "label": "a"}` (extra field).
  - `pie_chart`: a slice `{"label": "A", "value": "12"}` (wrong type); a slice `{"value": 12}` (missing `label`); a slice `{"label": "A", "value": 12, "color": "red"}` (extra field).
  - `radar_chart`: a point `{"axis": "Mon", "series": null, "value": "3"}` (wrong type); a point `{"axis": "Mon", "value": 3}` (missing `series`); two points (too few); a point `{"axis": "Mon", "series": null, "value": 3, "color": "red"}` (extra field).
  - `funnel_chart`: a stage `{"label": "A", "value": "12"}` (wrong type); `{}` (missing `stages`); 13 stages (too many); a label of 81 characters (too long); a stage `{"label": "a", "value": 1, "color": "red"}` (extra field).
  - `treemap_chart`: an item `{"label": "A", "value": "12", "group": null}` (wrong type); `{}` (missing `items`); 61 items (too many); an item without a `group`; a label of 81 characters (too long); an item `{"label": "a", "value": 1, "group": null, "color": "red"}` (extra field).
  - `waterfall_chart`: a step `{"label": "A", "value": "12"}` (wrong type); `{}` (missing `steps`); 25 steps (too many); a step `{"label": "A"}` (missing `value`); a step `{"label": "A", "value": 1, "kind": "sum"}` (kind outside its values); a step `{"label": "a", "value": 1, "color": "red"}` (extra field).
  - `activity_feed`: an item `{"time": "2026-11-04", "title": 7}` (wrong type); `{}` (missing `items`); 201 items (too many); an item `{"time": "2026-11-04"}` (missing `title`); an item `{"title": "A"}` (missing `time`); an item `{"time": "2026-11-04", "title": "A", "tone": "purple"}` (tone outside its values); an item `{"time": "2026-11-04", "title": "A", "color": "red"}` (extra field). A time that is no date, such as `Monday`, is legal here: the widget's own check fails the cell naming the item by its position.
  - `heatmap`: a row `{"x": "Mon", "y": "09:00", "value": "3"}` (wrong type); a row `{"x": "Mon", "y": "09:00"}` (missing `value`); a row `{"x": "Mon", "y": "09:00", "value": 3, "color": "red"}` (extra field).
- [ ] Given each data widget type with data that meets its empty condition (`summary_card`, `ranked_list_card`, `progress_list_card`, `grid` and `heatmap` with `rows` [], `pie_chart` with `slices` [], `cartesian_chart` with `series` [] or only series with no points, `radial_progress` with a null `current` or `target`, `funnel_chart`, `radar_chart` and `treemap_chart` with every value 0 or null, `waterfall_chart` with no step that draws a bar, `activity_feed` with `items` [], and `metric_card` with a null `value`), when it renders, then the widget shows its own English "No data to show" (gears-frontx-templates#105) inside its cell, and the cell frame stays.
- [ ] Given a `summary_card` and a `grid` each showing the number 1234.5, when `value_format` is absent or `value_type` is `number`, then both show 1,234.5 for host language English. When `value_type` is `percent` and the value is 0.25, then both show 25%. When `value_type` is `duration` with `unit` `s` and the value is 90, then both show 90 with the localized unit for seconds, not converted to another unit; with `compound` true they show 1m 30s. When `value_type` is `currency` with `currency` `USD`, then both show $1,234.50; with `decimals` 0 a `number` shows 1,235; with `max_decimals` 2 a `number` shows 1,234.5 and 1234 shows 1,234; with `unit_label` `lines` a `number` shows 1,234.5 lines, the label after a no-break space. The same formatting applies to the values of `metric_card`, `ranked_list_card`, `progress_list_card`, the chart tooltips and text alternatives, and the heatmap scale and cell values, except that a `metric_card` headline sets the unit word after an ordinary space, so a narrow card wraps it under the number, which stays whole.
- [ ] Given a `cartesian_chart`, a `pie_chart`, a `radar_chart`, a `treemap_chart`, a `waterfall_chart`, a `funnel_chart`, and a `heatmap`, when they are inspected with assistive technology, then each has an accessible name (the widget's own English default "Chart": the root passes the renderer no cell label, gears-frontx-templates#105) and a text alternative that lists the delivered values (series, x and y; slice labels and values; radar axes and series values; treemap item labels, groups and values; waterfall step labels, changes and running totals; stage labels, values and conversions; heatmap x, y and values, or dates and values in calendar mode).
- [ ] Given the reference dashboard, when a keyboard-only walkthrough covers all 15 widget types in their cells in the light and in the dark theme, then every widget passes the host's accessibility checks (`cpt-frontx-dashboard-nfr-accessibility`).
- [ ] Given the reference dashboard, when a screen-reader walkthrough covers all 15 widget types in their cells and in the larger view, in the light and in the dark theme, then every control announces its name, role and state, each widget's empty and own cannot-be-shown states are read as text, the charts and the heatmap read their accessible name and text alternative, and every widget passes the host's accessibility checks (`cpt-frontx-dashboard-nfr-accessibility`).
- [ ] Given the dashboard-author guide, when it is reviewed, then it covers writing a dashboard JSON, the grid, the binding, the catalog, the layout checks, that the product owns dashboard and data size, that every viewer who may see a dashboard must be able to get its widgets' data, that the product's API owns errors and access, what the host must provide, and the documented limitations (the limitations of PRD §6.3 and the DESIGN limits of DESIGN §5). When a dashboard author who did not build the template and has not used it before follows the guide alone, then they write a first working dashboard in one working session.
