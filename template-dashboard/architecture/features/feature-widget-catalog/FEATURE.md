---
status: accepted
version: 1
date: 2026-10-31
description: "Feature: the widget catalog: the 9 v1 widget types, each with its render type and data shape, the rendering rules, markdown safety, and the grid's client-side sort and page."
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
  - [Take chart colours from kit tokens](#take-chart-colours-from-kit-tokens)
  - [Validate grid columns and groups](#validate-grid-columns-and-groups)
  - [Sort and page grid rows](#sort-and-page-grid-rows)
  - [Check the heatmap scale and calendar](#check-the-heatmap-scale-and-calendar)
  - [Check cartesian x and y values](#check-cartesian-x-and-y-values)
  - [Check the pie centre](#check-the-pie-centre)
- [4. States (CDSL)](#4-states-cdsl)
  - [No lifecycle states](#no-lifecycle-states)
- [5. Definitions of Done](#5-definitions-of-done)
  - [Nine widget types](#nine-widget-types)
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
  - [grid](#grid)
  - [cartesian_chart](#cartesian_chart)
  - [pie_chart](#pie_chart)
  - [heatmap](#heatmap)
  - [markdown_card](#markdown_card)
- [7. Acceptance Criteria](#7-acceptance-criteria)

<!-- /toc -->

## 1. Feature Context

- [ ] `p1` - `cpt-frontx-dashboard-feature-widget-catalog`

### 1.1 Overview

The 9 v1 widget types, each a GTS type with its own render type (the render schema), a data type (the data shape), and one FrontX MFE entry. The final render types and data shapes per type, the grid row cap and page sizes, the grid sorts and pages client-side over the rows the transform delivered, markdown safety, and the per-type rendering rules.

### 1.2 Purpose

A dashboard author picks from the catalog. The catalog is bounded by presentation shapes, not by subject: a new dataset needs no new widget type. Each type states the exact data it needs, and the root's registration validates every answer against it.

**Requirements**: `cpt-frontx-dashboard-fr-widget-catalog`, `cpt-frontx-dashboard-fr-grid-sort-page`, `cpt-frontx-dashboard-fr-markdown-safety`, `cpt-frontx-dashboard-fr-accessibility` (widget side), `cpt-frontx-dashboard-fr-theme` (widget side), `cpt-frontx-dashboard-nfr-visual-quality`, `cpt-frontx-dashboard-nfr-large-table`, `cpt-frontx-dashboard-nfr-bundle-budget`, `cpt-frontx-dashboard-nfr-accessibility` (widget side), `cpt-frontx-dashboard-fr-author-guides` (dashboard-author guide).

**Use cases**: `cpt-frontx-dashboard-usecase-add-fix-widget`, `cpt-frontx-dashboard-usecase-author-dashboard` (the widget types an author picks, the dashboard-author guide).

**Principles**: `cpt-frontx-dashboard-principle-open-bases-closed-leaves`, `cpt-frontx-dashboard-principle-per-instance-isolation`.

**Constraints**: `cpt-frontx-dashboard-constraint-one-gts-package`, `cpt-frontx-dashboard-constraint-permissive-licences` (widget libraries).

**Components**: `cpt-frontx-dashboard-component-widget-catalog` (the 9 types, libraries, rendering rules).

**Security in scope**: output safety. The markdown card follows `cpt-frontx-dashboard-algo-widget-catalog-markdown`; every other widget shows delivered text as text, and chart tooltips are built from text.

**Not applicable**:
- Persistence/DB: no database (`cpt-frontx-dashboard-db-none`).
- Sign-in and access: the host signs the viewer in, and the product's API owns access.
- Compliance/privacy: widgets store nothing and send nothing; they show only what the product's API returns. Library licences are in [Catalog libraries and licences](#catalog-libraries-and-licences).
- Reliability: widgets are passive. A widget shows its own cannot-be-shown state; the root owns failure scope and recovery.
- Progress and confirmation flows: grid sort, page and page size are immediate, client-side and change no data.
- Ops/rollout: no deployed service; a widget ships as an MFE build plus its types, entry and manifest in the served GTS file.

### 1.3 Actors

| Actor | Role in Feature |
|-------|-----------------|
| `cpt-frontx-dashboard-actor-dashboard-author` | Picks widget types from the catalog. |
| `cpt-frontx-dashboard-actor-widget-author` | Ships the 9 types (or fixes one). |
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

### Take chart colours from kit tokens

- [ ] `p2` - **ID**: `cpt-frontx-dashboard-algo-widget-catalog-chart-theme`

**Input**: the host theme id, and the series of a `cartesian_chart` or the slices of a `pie_chart`.

**Output**: a kit `ChartConfig` whose colours are kit chart tokens, followed by the active light or dark scope.

**Steps**:
1. [ ] - `p1` - Map the host theme id to the ui-kit light or dark scope (unknown gives light). - `inst-wc-chart-scope`
2. [ ] - `p1` - Give each series or slice, in delivered order, a step of the kit's series palette in a fixed order that keeps neighbours apart (`--chart-5`, `--chart-4`, `--chart-2`, `--chart-1`, `--chart-3`), wrapping after the fifth, with its name as the label. - `inst-wc-chart-build`
3. [ ] - `p1` - Pass the config to the kit `ChartContainer`, which writes one `--color-<key>` property per entry for the chart instance; every series paints itself with its property. - `inst-wc-chart-register`
4. [ ] - `p1` - On a theme change, build nothing: the kit tokens take their values from the new scope, and the chart restyles with no request. - `inst-wc-chart-rebuild`
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
6. [ ] - `p1` - **IF** a value does not fit its column's kind (a list outside a sparkline column, a value other than a list or null in a sparkline column, a value other than a number or null in a progress column, or a progress number outside 0 to 1), **RETURN** failure naming the widget, the first such row index and the column key, never the value. - `inst-wc-grid-values`
7. [ ] - `p1` - **RETURN** pass. - `inst-wc-grid-pass`

### Sort and page grid rows

- [ ] `p2` - **ID**: `cpt-frontx-dashboard-algo-widget-catalog-grid-sort`

**Input**: the delivered grid rows, the sort column and direction chosen by the viewer, and the page size.

**Output**: the rows in sorted order, showing the first page.

**Steps**:
1. [ ] - `p1` - Follow the header cycle of the ui-kit DataGrid: a click on a column that is not the sort column makes it the only sort column, descending; a second click sorts it ascending; a third click clears the sort, and the rows return to their delivered order. Only the sort column's header shows a sort state. - `inst-wc-sort-direction`
2. [ ] - `p1` - Group the values of the sort column by kind: numbers first, then strings, then nulls. The groups keep this order in both directions. - `inst-wc-sort-groups`
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
1. [ ] - `p1` - **FOR EACH** point with a non-null `x` - `inst-wc-cart-for-point`
   1. [ ] - `p1` - **IF** the x axis is `value` and `x` is not a number, **RETURN** failure naming the series and the point index. - `inst-wc-cart-value-x`
   2. [ ] - `p1` - **IF** the x axis is `time` and `x` is neither an ISO 8601 date-time string, nor a bare `YYYY-MM-DD` date of the calendar by the heatmap calendar's rule (2026-02-30 fails), nor a number of epoch milliseconds, each a time a date can hold (at most 8.64e15 from 1970), **RETURN** failure naming the series and the point index. - `inst-wc-cart-time-x`
2. [ ] - `p1` - **FOR EACH** series drawn on a `log` y axis (the primary axis, or the secondary one for a series option with `y_axis: secondary`), **IF** one of its drawn points (on a `value` or `time` x axis, a point with a null `x` is not drawn) has a non-null `y` that is not above zero, **RETURN** failure naming the series and the first such point index. - `inst-wc-cart-log-y`
3. [ ] - `p1` - **IF** `orientation` is `horizontal` and the x axis is not `category`, **RETURN** failure naming the x axis type. - `inst-wc-cart-orientation`
4. [ ] - `p1` - **IF** a series option sets `mark_extremes` and its `type` is neither `line` nor `area`, **RETURN** failure naming the option index and its type (the schema requires `type`; an option that reaches the widget without one draws as bars and is named `bar`). - `inst-wc-cart-extremes`
5. [ ] - `p1` - **FOR EACH** series that is not drawn as `scatter` (a series without an option draws as bars), **IF** one of its points has a non-null `size`, **RETURN** failure naming the series and the first such point index. - `inst-wc-cart-size`
6. [ ] - `p1` - **IF** `stack_mode` is `percent`, **FOR EACH** series on a y axis that carries a stack group (a bar, line or area series with a `stack_group`): **IF** the series has no stack group or is a scatter series, **RETURN** failure naming the series; **IF** one of its `y` values is negative, **RETURN** failure naming the series and the first such point index. - `inst-wc-cart-percent`
7. [ ] - `p1` - **FOR EACH** reference line, its `axis` `y` when absent: **IF** the axis is `y_secondary` and no series uses the secondary axis, **RETURN** failure naming the line index; **IF** its `value` is a string and the axis is not a `category` x axis, **RETURN** failure naming the line index; **IF** its `value` is a number and the axis is a `category` x axis, **RETURN** failure naming the line index; **IF** the axis is a `time` x axis and its `value` is neither an ISO 8601 date-time string, nor a bare `YYYY-MM-DD` date of the calendar, nor a number, each a time a date can hold (the bound of a point's x, `inst-wc-cart-time-x`), **RETURN** failure naming the line index; **IF** the axis is a value axis that carries a stack group under a percent stack and its `value` is outside 0 to 1, **RETURN** failure naming the line index; **IF** the axis is a `log` value axis (and no percent axis) and its `value` is not above zero, **RETURN** failure naming the line index. - `inst-wc-cart-reference`
8. [ ] - `p1` - **RETURN** pass. A `category` axis accepts every `x`. - `inst-wc-cart-pass`

### Check the pie centre

- [ ] `p2` - **ID**: `cpt-frontx-dashboard-algo-widget-catalog-card-checks`

**Input**: the `render_widget` payload of a `pie_chart`: its `render`.

**Output**: pass, or a failure naming the problem.

The pie widget runs this check itself, each time it accepts a `render_widget` payload and before it draws, with the same outcome as `cpt-frontx-dashboard-algo-widget-catalog-grid-checks`: on a failure, it shows its own cannot-be-shown state in its cell and writes the problem to the browser console.

**Steps**:
1. [ ] - `p1` - **IF** `center` is `total` and `radius` does not have two items with an inner radius above 0 (the pie is not a donut), **RETURN** failure naming the field. - `inst-wc-card-pie-center`
2. [ ] - `p1` - **IF** `center_label` is set and `center` is not `total`, **RETURN** failure naming the field. - `inst-wc-card-pie-center-label`
3. [ ] - `p1` - **RETURN** pass. - `inst-wc-card-pass`

## 4. States (CDSL)

### No lifecycle states

- [ ] `p2` - **ID**: `cpt-frontx-dashboard-state-widget-catalog-none`

**States**: `defined` (the catalog is data and rendering rules, with no lifecycle)

**Initial State**: `defined`

**Transitions**:
1. [ ] - `p1` - **FROM** `defined` **TO** `defined` **WHEN** a widget type is rendered (no transition; the catalog is static data). - `inst-wc-state-none`

## 5. Definitions of Done

### Nine widget types

- [ ] `p1` - **ID**: `cpt-frontx-dashboard-dod-widget-catalog-types`

The system **MUST** ship 9 widget types, each a closed derived GTS type with `unevaluatedProperties: false`, setting `entry` and (for data widgets) `data_type`, with `render` of its own render type: `summary_card`, `metric_card`, `ranked_list_card`, `progress_list_card`, `grid`, `cartesian_chart`, `pie_chart`, `heatmap` (derived from `data_widget`), and `markdown_card` (derived from the widget base, forbidding `data`, carrying its text in `render`).

Each widget type has one FrontX MFE entry, a plain `entry_mf` instance with `actions` [`render_widget`] and `domainActions` []; the FrontX manifest pipeline adds `exposeAssets` when the bundle is built. The full entry instances and the entry id table are in [MFE entries](#mfe-entries).

**Implements**: `cpt-frontx-dashboard-fr-widget-catalog`, `cpt-frontx-dashboard-usecase-add-fix-widget`.

**Principles**: `cpt-frontx-dashboard-principle-open-bases-closed-leaves` (each concrete type closes itself).

**Touches**:
- Entities: the 9 widget types, the 9 render types, the 8 data types, the 9 entries

### Per-type render schemas and data shapes

- [ ] `p1` - **ID**: `cpt-frontx-dashboard-dod-widget-catalog-shapes`

Each widget type **MUST** refer by `$ref` to its own render type `gts.frontx.dashboard.widget.render.v1~frontx.dashboard.widget.<widget_type>_render.v1~`, derived from the render base and closed with `unevaluatedProperties: false` (`summary_card` declares no render field, so its `render` is an empty object), **MUST** name that render type in its `render_type` trait, beside `entry` and `data_type`, so the root stamps and registers the widget's `render` against it, and each data widget type **MUST** declare a closed data shape derived from the widget-data base. Every data widget type inherits the optional `value_format` from `data_widget` and declares nothing for it; each type closes only its own `render`. The widget formats every number it shows by `value_format` for the host language: `number` (also when `value_format` is absent) as a plain number, `percent` as a percentage (0.25 shows as 25%), `duration` as the number in its `unit` (`ms`, `s`, `min`, `h` or `d`) with the localized unit, without converting to another unit, and `currency` as an amount in its `currency` code: the schema checks only the code's shape (three capital letters), the symbol comes from the host's locale data for the host language, and a code that data does not know shows as the code itself. `decimals` fixes the number of fraction digits for every value type, and `unit_label` writes a unit word after a `number`. Value fields accept `null` (shown as a gap or empty value). Each data type states its empty condition in its Presentation line. The full render type and data shape of every type are in [Widget Type and Data Schemas](#6-widget-type-and-data-schemas); the DESIGN worked example uses them.

**Implements**: `cpt-frontx-dashboard-fr-widget-catalog`.

**Touches**:
- Entities: the 9 widget types, the 9 render types, the 8 data types

### Grid row cap, page sizes, and client-side sort/page

- [ ] `p1` - **ID**: `cpt-frontx-dashboard-dod-widget-catalog-grid`

The grid's transform output **MUST** have a row cap of 500 rows (`maxItems` on the grid data type's `rows`). The grid **MUST** always page, with page sizes defaulting to `[10, 25, 50, 100, 500]` (the first entry is the initial page size), and sort and page client-side over the rows the transform delivered, sending no request. An over-cap result fails data validation and the cell shows the cannot-be-shown state; rows are never truncated. Sorting and paging follow `cpt-frontx-dashboard-algo-widget-catalog-grid-sort`. The grid is the ui-kit DataGrid, whose `load` callback answers from the delivered rows in memory, with its state kept in memory only (ADR-0005). Grid columns are keyed by position: `render.columns[i]` describes position `i` and has a required `key` (unique, `^[a-z][a-z0-9_]{0,63}$`). `column_groups[].members` and `row_color` refer to column keys. The grid widget runs the consistency checks of `cpt-frontx-dashboard-algo-widget-catalog-grid-checks` itself and shows its own cannot-be-shown state when one fails.

**Implements**: `cpt-frontx-dashboard-flow-widget-catalog-grid-sort-page`, `cpt-frontx-dashboard-algo-widget-catalog-grid-checks`, `cpt-frontx-dashboard-algo-widget-catalog-grid-sort`, `cpt-frontx-dashboard-fr-grid-sort-page`, `cpt-frontx-dashboard-nfr-large-table`.

### Markdown safety

- [ ] `p1` - **ID**: `cpt-frontx-dashboard-dod-widget-catalog-markdown`

`markdown_card` **MUST** render its body exactly as `cpt-frontx-dashboard-algo-widget-catalog-markdown` specifies: embedded HTML as text, targets read the way the browser URL parser reads them, links active only for `http`, `https`, `mailto` and relative targets and opened in a new browsing context with no opener, and images loaded only from same-origin paths.

**Implements**: `cpt-frontx-dashboard-algo-widget-catalog-markdown`, `cpt-frontx-dashboard-fr-markdown-safety`.

### Per-type rendering rules

- [ ] `p2` - **ID**: `cpt-frontx-dashboard-dod-widget-catalog-rendering`

Each widget entry **MUST** follow the widget-author obligations of `cpt-frontx-dashboard-dod-widget-contract-obligations`. Chart widgets draw with the ui-kit chart component and take their colours from kit tokens (`cpt-frontx-dashboard-algo-widget-catalog-chart-theme`, ADR-0004); the heatmap draws its tiles from kit tokens. The root has no chart-library dependency. The set of host theme ids that map to dark is enumerated in the theme helper and updated when the host adds a dark theme; themes beyond light and dark fold into one of the two.

**Per-type rules:** each type's presentation rules are stated once, with its schemas in [Widget Type and Data Schemas](#6-widget-type-and-data-schemas). `metric_card` with `value_label` shows it as the caption; without it, no caption shows.

**Cross-type rules:**

- A null label, `x`, `y` or series value is legal; it renders as an empty label and the row is kept.
- Empty state: the widget owns it. When its data meets the empty condition of its data type, the widget shows "No data to show" inside its cell, and the cell frame stays. The wording is the widget's own English text, not a localized one (widget contract FEATURE, entry declaration).
- The `grid`, `heatmap`, `cartesian_chart` and `pie_chart` widgets run their own cross-checks (`cpt-frontx-dashboard-algo-widget-catalog-grid-checks`, `cpt-frontx-dashboard-algo-widget-catalog-heatmap-checks`, `cpt-frontx-dashboard-algo-widget-catalog-cartesian-checks`, `cpt-frontx-dashboard-algo-widget-catalog-card-checks`) and show their own cannot-be-shown state when one fails: the static "This widget cannot be shown" with no error text, exposed as text to assistive technology, as `cpt-frontx-dashboard-dod-widget-contract-obligations` specifies (English, like every widget-owned wording).
- Chart tooltips are built from text, never HTML strings.
- Widget links: the `metric_card` foot link, the `ranked_list_card` row links and the `grid` link values go through one shared link rule. It reads a target the way the browser URL parser does (tabs and line breaks removed, leading and trailing controls and spaces trimmed) and takes `https:`, `http:`, `mailto:` and a path from the site root (`/...`, not `//`). Any other target (`javascript:`, `data:`, `vbscript:` or another scheme, a protocol-relative target, a relative target that does not start with `/`, an unparsable one) shows the link text alone and writes one console line naming the kind of target, never any of its text: the `javascript:`, `data:`, `vbscript:`, `file:`, `blob:` and `ftp:` schemes by name, any other scheme as an unsupported scheme; the cell does not fail. A link text with no visible character (empty, only spaces, or only invisible characters such as zero-width marks, the word joiner, the byte order mark or the soft hyphen) shows as plain text with no link and no tab stop, and writes no console line: a link needs a name. A link to another origin opens in a new tab without access to its opener (`rel="noopener noreferrer"`), and its accessible name ends with "(opens in a new tab)", the widget's own English text; any other link opens in the same tab. For the grid this replaced its earlier rule: a relative target that does not start with `/` is no longer a link, a link on the same origin no longer opens a new tab, and a `mailto:` target is now a link.
- Colour is never the only signal: the heatmap's numeric scale, progress values as text (in a progress card and a grid progress column), the trend icon, the status text in its badge (in a ranked card and a grid badge column), the signed reference difference, and naming in legends and tooltips.
- Legends: a legend takes at most half of its chart (its height above or below the plot, its width beside it) and scrolls beyond that, so the plot or the pie keeps room in a short cell.
- Small cells: a chart lower than 200 px (a small low cell) is compact. A widget `description` line takes 24 px from a low cell's body: the body is 78 px high instead of 102 px. A compact `cartesian_chart` draws its x ticks horizontally whatever `tick_angle` asks, thinning them out to fit, and leaves out the legend of a single series, which only repeats the cell's title. A compact `pie_chart` moves a legend asked above or below it to its right, and leaves the legend out when the chart is also narrower than 240 px. A compact `cartesian_chart` keeps its orientation, percent stack and reference lines with their labels, keeps the dots of its extreme marks but leaves out their value labels, which would cover the plot's few rows, and halves the largest bubble radius (9 px instead of 18 px). A low cell whose body also holds the drill-down button and a description line leaves a chart's plot at most 12 px high: there a reference label can fall on the axis ticks and bubbles do not fit, so a chart with drill-down, reference lines or bubble sizes belongs in a high cell. In each case the tooltip and the text alternative still name every value. A `grid` never gets lower than its header, a few rows and its pager; in a lower cell the cell scrolls. A grid link keeps its text and its link icon on one line.
- Heatmap size: a heatmap draws at most 10,000 tiles (distinct x values times distinct y values; in calendar mode, its weeks times 7); a larger one fails its own check and shows its own cannot-be-shown state, so sparse data cannot expand into a grid that exhausts the page. In calendar mode the weeks are counted from the earliest and the latest date alone, found in one pass over the rows, before any day of the grid is built: two rows years apart fail at once, and a list of any length is read without spreading it into a call.
- Text alternatives: `cartesian_chart`, `pie_chart` and `heatmap` each expose an accessible name and a text alternative of the delivered values for assistive technology. The default name and the column headings the configuration does not name (series, x, y, label, value) are the widget's own English texts, not localized ones (widget contract FEATURE, entry declaration; gears-frontx-templates#105).
- Drill-down: a `cartesian_chart` or `pie_chart` whose `render.drill_down` is `true` shows a "Show data" button that switches its area to the data view, and back with "Show chart" (English, like every widget-owned wording). The data view is a ui-kit DataGrid of every delivered value, one row per x position (or per point for an all-scatter chart, per slice for a pie), sortable client-side, with no request. A click on a bar, point or segment opens the data view with the row of that mark opened (its fields listed under it), marked, and scrolled to the top of the data view, under its header, so its fields show below it. The data view is at least as wide as a minimum width per column, and a data view wider than its cell scrolls sideways inside it. With `drill_down` off or absent the chart has no clickable marks. The button keeps the data view reachable by keyboard; its label names the view it opens, so it carries no pressed state.
- Progress and trend: each progress bar of `progress_list_card` has `role="progressbar"`, with its current and target values as text. The `metric_card` trend icon has an accessible name (up, down or no change), the widget's own English text.

**Principles**: `cpt-frontx-dashboard-principle-per-instance-isolation` (each chart widget evaluates its own copy of its chart library).

**Implements**: `cpt-frontx-dashboard-fr-theme` (widget side), `cpt-frontx-dashboard-fr-accessibility`, `cpt-frontx-dashboard-nfr-visual-quality`, `cpt-frontx-dashboard-algo-widget-catalog-heatmap-checks`, `cpt-frontx-dashboard-algo-widget-catalog-cartesian-checks`, `cpt-frontx-dashboard-algo-widget-catalog-card-checks`.

### Catalog libraries and licences

- [ ] `p2` - **ID**: `cpt-frontx-dashboard-dod-widget-catalog-libraries`

The catalog widgets **MUST** use the ui-kit chart component with Recharts (MIT, pinned to the version ui-kit pins) for `cartesian_chart` and `pie_chart`, the ui-kit DataGrid for `grid` and the chart data view, and markdown-it (MIT; CommonMark with raw HTML off and a link validation hook) for `markdown_card`, listed in `shared`, each entry under 100 KB own code only. The heatmap uses no chart library.

**Implements**: `cpt-frontx-dashboard-nfr-bundle-budget`.

**Constraints**: `cpt-frontx-dashboard-constraint-permissive-licences`.

### Widget accessibility walkthrough

- [ ] `p2` - **ID**: `cpt-frontx-dashboard-dod-widget-catalog-accessibility`

Every one of the 9 widget types **MUST** pass the host's accessibility checks in both the light and the dark theme, with the text alternatives and keyboard operation of [Per-type rendering rules](#per-type-rendering-rules). Each widget's controls expose their name, role and state, and its empty state ("No data to show") and its own cannot-be-shown state are exposed as text, so a screen reader tells them apart from the root's loaders. This is verified by a keyboard-only walkthrough and a screen-reader walkthrough of the reference dashboard in both themes, covering every widget type in its cell and in the larger view.

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
| 5 | `grid` | `gts.frontx.mfes.mfe.entry.v1~frontx.mfes.mfe.entry_mf.v1~frontx.dashboard.mfe.grid.v1` | `./grid` |
| 6 | `cartesian_chart` | `gts.frontx.mfes.mfe.entry.v1~frontx.mfes.mfe.entry_mf.v1~frontx.dashboard.mfe.cartesian_chart.v1` | `./cartesian_chart` |
| 7 | `pie_chart` | `gts.frontx.mfes.mfe.entry.v1~frontx.mfes.mfe.entry_mf.v1~frontx.dashboard.mfe.pie_chart.v1` | `./pie_chart` |
| 8 | `heatmap` | `gts.frontx.mfes.mfe.entry.v1~frontx.mfes.mfe.entry_mf.v1~frontx.dashboard.mfe.heatmap.v1` | `./heatmap` |
| 9 | `markdown_card` | `gts.frontx.mfes.mfe.entry.v1~frontx.mfes.mfe.entry_mf.v1~frontx.dashboard.mfe.markdown_card.v1` | `./markdown_card` |

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
    "data_type": "gts.frontx.dashboard.widget_data.widget_data.v1~frontx.dashboard.widget_data.summary_card.v1~",
    "render_type": "gts.frontx.dashboard.widget.render.v1~frontx.dashboard.widget.summary_card_render.v1~"
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
    "data_type": "gts.frontx.dashboard.widget_data.widget_data.v1~frontx.dashboard.widget_data.metric_card.v1~",
    "render_type": "gts.frontx.dashboard.widget.render.v1~frontx.dashboard.widget.metric_card_render.v1~"
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
        "link": { "type": "object", "required": ["text", "href"], "additionalProperties": false, "properties": { "text": { "type": "string", "description": "The link's text." }, "href": { "type": "string", "description": "The link's target, checked by the shared link rule: https, http, mailto, or a path starting with /. Any other target shows the text alone. A link to another origin opens in a new tab." } }, "description": "Optional link at the card's foot." }
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
- Link: `link` draws its `text` at the card's foot as a link through the shared link rule (the card links rule of `cpt-frontx-dashboard-dod-widget-catalog-rendering`). A card whose head and foot are taller than its cell scrolls inside the cell.
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
    "data_type": "gts.frontx.dashboard.widget_data.widget_data.v1~frontx.dashboard.widget_data.ranked_list_card.v1~",
    "render_type": "gts.frontx.dashboard.widget.render.v1~frontx.dashboard.widget.ranked_list_card_render.v1~"
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
              "href": { "type": ["string", "null"], "description": "Optional link target of the row: its label becomes a link, checked by the shared link rule (https, http, mailto, or a path starting with /). A refused target shows the label as text. Null or absent shows no link." }
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
- Status and link: a row's `status` shows as a badge with its text after the label, in the tone `status_tones` gives it, or neutral (the [Tones type](#tones-type)); a null, absent, empty or spaces-only status shows no badge. A row's `href` makes its label a link through the shared link rule; a null or absent `href`, or a label with no visible character (the shared link rule), leaves the label text.
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
    "data_type": "gts.frontx.dashboard.widget_data.widget_data.v1~frontx.dashboard.widget_data.progress_list_card.v1~",
    "render_type": "gts.frontx.dashboard.widget.render.v1~frontx.dashboard.widget.progress_list_card_render.v1~"
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
- Presentation: the bar fills in proportion to `current` over `target`, and it is full when `current` reaches or exceeds `target`. With a null or zero target, or a null `current`, the bar stays empty, and a null value shows as an empty value. The current and target values are always shown as text, so the bar does not carry meaning alone. Each bar has `role="progressbar"`, named by its label, with its current and target values as text. Bar colours come from kit tokens of the active scope. A null label shows as an empty label and the row stays.
- Goal: a row's number `goal` draws a short upright mark over its bar, in the text colour (`--foreground`), at `goal` over `target`, and adds the goal to the bar's value text and to the tooltip of the bar: the goal's name (`goal_label`, or the widget's own English "Goal"), a colon and the formatted goal. The bar runs from 0 to `target`, and a goal outside it extends nothing: its mark stands at the nearer end of the bar and the text adds "outside the bar". With a null or zero `target` the bar has no range, so the goal shows in the text alone. A null or absent goal shows nothing.
- Empty state: `rows` is empty. The widget shows its own English "No data to show" (gears-frontx-templates#105).

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
    "data_type": "gts.frontx.dashboard.widget_data.widget_data.v1~frontx.dashboard.widget_data.grid.v1~",
    "render_type": "gts.frontx.dashboard.widget.render.v1~frontx.dashboard.widget.grid_render.v1~"
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
              "width": { "type": "integer", "minimum": 1, "description": "Optional width in pixels. The table is at least as wide as the sum of its column widths, counting 160 pixels for a column without one; a grid wider than its cell scrolls sideways inside it." },
              "format": {
                "type": "object",
                "additionalProperties": false,
                "description": "Optional number format. notation applies to number-valued cells of a text or badge column only: standard shows the full number and compact shows the abbreviated number of the host language. A progress column shows a percent and takes no format.",
                "properties": { "notation": { "enum": ["standard", "compact"] } }
              },
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
          "description": "Optional page sizes offered. The first entry is the initial page size. Defaults to [10, 25, 50, 100, 500]."
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
        "search": { "type": "boolean", "default": false, "description": "Optional search box above the grid. It keeps the rows whose shown text (formatted numbers, badge text, progress percents and link text; sparklines are not searched) contains the typed text, ignoring case, in any column, and shows the first page. Without it, false." }
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
          "description": "One positional array per row, in the order of render.columns. A position that holds no value holds null. Capped at 500 rows; an over-cap result fails data validation.",
          "items": {
            "type": "array",
            "items": {
              "oneOf": [
                { "type": ["string", "number", "null"] },
                {
                  "type": "object",
                  "required": ["text", "href"],
                  "additionalProperties": false,
                  "description": "A link: its text, and its target, checked by the shared link rule of the widgets: https, http, mailto, or a path starting with /. Any other target shows the text alone. A link to another origin opens in a new tab; any other link opens in the same tab.",
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
        }
      }
    }
  ],
  "unevaluatedProperties": false
}
```

**Cross-references**:
- Data: each row is a positional array. Column `i` reads its value from `rows[r][i]`. A cell of a text column (`kind` absent or `text`) shows its value as text, formatted by the column's `format.notation` and the widget's `value_format`. A null value shows an empty cell. A long value wraps and is never cut off, unless its column's `overflow` is `truncate`: then the cell keeps one line, ends in an ellipsis and keeps the full text as its title. The column heading is the column's `title`, or its `key` when it has no `title`.
- Column kinds: `kind` chooses how a column's cells draw. `badge` draws a string as a badge with its text, toned by the column's `tones` (the shared tones type, the same badge as a `ranked_list_card` status); a value with no tone draws neutral, and null or a blank string is an empty cell, never an empty badge. `progress` draws a number from 0 to 1 as a bar with its percent as text beside it, which carries the value (the bar is hidden from assistive technology); the column's `format` and the widget's `value_format` do not apply to it, and null is an empty cell. `sparkline` draws a list of at most 60 numbers or nulls as a small line in the theme's chart colour, with no axes, broken at a null point, a lone point drawn as a dot; its text alternative names the first, last, lowest and highest values, formatted by the widget's `value_format`, and null or a list with no number is an empty cell. `tones` is allowed only on a badge column. A badge column sorts by its text and a progress column by its number; a sparkline column never sorts (`sortable` is false there, and true fails the check). A value that does not fit its column's kind fails the grid's own check (`cpt-frontx-dashboard-algo-widget-catalog-grid-checks`).
- Data schema change: the grid data type's row item takes a list (`{ "type": "array", "maxItems": 60, "items": { "type": ["number", "null"] } }`) besides text, a number, null and a link, for sparkline columns. A list of more than 60 points fails data validation; a list in any other column fails the grid's own check.
- Search: with `search` true, a search box named by the widget texts ("Search the table") stands above the grid, reachable by Tab with the kit's visible focus ring. Typing keeps the rows whose shown text contains the typed text (spaces at its ends ignored), ignoring case, in any column: formatted numbers, badge text, progress percents and link text; sparklines are not searched. Each new query keeps the sort and shows the first page, client-side, sending no request. A search that keeps no row shows the widget text "No rows match the search". Without `search`, no box shows.
- Links: a value `{text, href}` goes through the shared link rule of the widgets (see Cross-type rules): `https`, `http`, `mailto` and a path from the site root (`/x`, not `//x`) show as a link with its `text`; any other target shows `text` as plain text with one console line naming only the kind of target. A link to another origin opens in a new tab with `rel="noopener noreferrer"` and says so in its accessible name; any other link opens in the same tab. A link sorts by its text. A link value in a badge column shows its text as a badge, with no link.
- Paging: the grid always shows one page. The viewer pages and changes the page size client-side, sending no request. The pager shows the position and the total.
- Sorting: one active sort column, following the header cycle of the ui-kit DataGrid: descending, ascending, then the delivered order; only that header shows a sort state, exposed with `aria-sort`. Sorting is client-side over the rows the transform delivered. The comparison, null placement, stability and the reset to the first page follow `cpt-frontx-dashboard-algo-widget-catalog-grid-sort`.
- Frozen columns: the first `frozen_columns` columns stay visible at the leading edge while the viewer scrolls horizontally. A value larger than the number of columns freezes all columns. A group is frozen as a whole, so a count that ends inside a group freezes the whole group.
- Column groups: each group shows its `title` once, in a heading row above the column headings, spanning exactly its columns. A column outside every group has an empty cell in that heading row. Without `column_groups`, the grid has a single heading row.
- Row colour: with `row_color` set, a row whose value is one of `success`, `warning`, `error`, or `info`, matched exactly and case-sensitively, takes the row background of the kit token of that meaning in the active light or dark scope. The row also shows an icon of that meaning, with an accessible name, the widget's own English text (gears-frontx-templates#105). A null or any other value leaves the row uncoloured, and cell text keeps readable contrast.
- Empty state: `rows` is empty. The widget shows its own English "No data to show" (gears-frontx-templates#105).
- Consistency checks: the grid widget runs `cpt-frontx-dashboard-algo-widget-catalog-grid-checks` and shows its own cannot-be-shown state when one fails: there is exactly one column per data position, group members are columns, groups are contiguous, there are no repeats inside a group, no column belongs to two groups, `row_color` names a column, `tones` stands on badge columns only, no sparkline column is sortable, a list stands only in a sparkline column and a sparkline column holds only lists or null, and a progress column holds only numbers from 0 to 1 or null.

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
    "data_type": "gts.frontx.dashboard.widget_data.widget_data.v1~frontx.dashboard.widget_data.cartesian_chart.v1~",
    "render_type": "gts.frontx.dashboard.widget.render.v1~frontx.dashboard.widget.cartesian_chart_render.v1~"
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
          "description": "How each data series is drawn. A data series without an entry here draws as bars on the primary y axis.",
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
        "x_axis": {
          "type": "object",
          "additionalProperties": false,
          "properties": {
            "type": { "enum": ["category", "value", "time"], "default": "category", "description": "Without it, category." },
            "label": { "type": "string", "description": "A title written under the x axis ticks, and the x column heading of the data view and the text alternative." },
            "tick_labels": { "enum": ["auto", "every"], "default": "auto", "description": "auto skips tick labels that would collide; every labels each category, thinning out to every second, third and so on only when the labels cannot fit; a value or time axis has no categories, so there every acts as auto. Without it, auto." },
            "tick_angle": { "enum": [0, -45, -90], "default": 0, "description": "Rotation of the tick labels in degrees; a tilted axis grows to fit them. Without it, 0." }
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
  "description": "Data of a cartesian_chart widget, in long format.",
  "allOf": [
    { "$ref": "gts://gts.frontx.dashboard.widget_data.widget_data.v1~" },
    {
      "type": "object",
      "required": ["series"],
      "properties": {
        "series": {
          "type": "array",
          "description": "One entry per series, each with its name and points.",
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
        }
      }
    }
  ],
  "unevaluatedProperties": false
}
```

**Cross-references**:
- Presentation: on a category axis the x positions follow the delivered order, and on a value or time axis they are placed by value. On a time axis, `x` is an ISO 8601 date-time string, a bare `YYYY-MM-DD` date read as its UTC midnight, or a number of epoch milliseconds; the bare date follows the heatmap calendar's date rule, through the one date helper both widgets share. A non-null `x` that does not fit the axis type, and a non-null `y` not above zero on a drawn point of a series of a `log` y axis (on a `value` or `time` axis a point with a null `x` is not drawn), make the widget show its own cannot-be-shown state (`cpt-frontx-dashboard-algo-widget-catalog-cartesian-checks`). A null value is a gap. On a value or time axis, a line or area with no point at an x where another series has one is drawn straight through between its own points there (straight on the axis scale, so on a log axis between the logarithms), and no value is shown for it at that x; on a category axis, a series with no point at a category has a gap there, as a missing value. A series that repeats an x keeps every point: on a category axis each repeat has its own position, in delivered order. A null x shows as an empty label on a category axis; on a value or time axis a point with a null x has no position and is left out. A null series name shows as an empty label. Every series is named in the tooltip and, unless `legend_position` is `none`, in the legend, so series do not differ by colour alone. Numbers follow `value_format`, except on a series of the secondary axis, which shows plain numbers followed by the secondary axis `unit`; the tooltip, the value labels, the text alternative and the data view use the same formats. On a time axis, points that all fall on a midnight are days: every view shows the date alone, read in UTC when every point is a UTC midnight, so a day keeps its date in any time zone. Otherwise the x ticks show the time of day when the points span less than two days (with the day when they cross a local midnight) and dates beyond that, and the tooltip, the text alternative and the data view show the date with the time (seconds when a point has them). A data series without an entry in `render.series` draws as bars on the primary axis. A series `label` is written at that series' last point in the text colour, with a halo of the card colour where it crosses a bar, and moved up so it never covers a bar's value label at that point. Rotated tick labels stay on one line. Each axis `label` is written on its axis: the x title under the ticks, a y title along its axis outside the ticks. The chart has an accessible name (the widget's own English default "Chart": the root passes the renderer no cell label, gears-frontx-templates#105) and a text alternative of the delivered series, x and y values.
- Empty state: `series` is empty, or no series has a point. The widget shows its own English "No data to show" (gears-frontx-templates#105).
- Chart colours: the series colours, grid lines, axes, tooltip and legend are kit tokens of the active scope (`cpt-frontx-dashboard-algo-widget-catalog-chart-theme`, ADR-0004).
- Render options: `value_labels` writes each bar's value at its end, above a bar that grows up and below one that grows down (a zero bar has none), formatted by `value_format`; `auto` writes them only when every bar is wide enough, so a larger-view widget can set `auto` and show them where a cell has no room. `tick_labels` and `tick_angle` shape the x axis; `tick_labels: every` applies to a category axis, and a value or time axis keeps its own number ticks apart as with `auto`. A series with `label` shows that name at its last point, so a target line is named on the chart. A secondary axis shows `unit` after its tick values. `drill_down` follows the drill-down rule in [Per-type rendering rules](#per-type-rendering-rules).
- Orientation: `orientation` `horizontal` draws the chart turned: the categories down the vertical axis in delivered order (the first at the top), written level beside the plot in a column up to a third of the chart wide, and the values along the horizontal axis, the primary axis at the bottom and the secondary one at the top. Every series type turns with it: bars grow to the right, lines and areas run down the categories, scatter points stand at their category's row. `x_axis.label` is written along the category axis, `y_axis.label` under the bottom axis and `y_axis_secondary.label` over the top one; value labels stand right of the bars' ends and a series `label` right of its last point. `tick_angle` does not apply to a horizontal chart, whose categories are always level. It needs a `category` x axis.
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
    "data_type": "gts.frontx.dashboard.widget_data.widget_data.v1~frontx.dashboard.widget_data.pie_chart.v1~",
    "render_type": "gts.frontx.dashboard.widget.render.v1~frontx.dashboard.widget.pie_chart_render.v1~"
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
    "data_type": "gts.frontx.dashboard.widget_data.widget_data.v1~frontx.dashboard.widget_data.heatmap.v1~",
    "render_type": "gts.frontx.dashboard.widget.render.v1~frontx.dashboard.widget.heatmap_render.v1~"
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
- Presentation: the x and y categories follow the order of their first appearance in the delivered rows. The heatmap shows its colour scale with numbers, and the tooltip of each cell shows its x, y, and value, so values do not depend on colour alone. A null value leaves its cell empty. The colour scale is built from kit tokens of the active scope. The heatmap has an accessible name (the widget's own English default "Chart": the root passes the renderer no cell label, gears-frontx-templates#105) and a text alternative of the delivered x, y and values.
- Calendar mode: with `mode` `calendar` the heatmap draws one tile per day, a column per week and a row per weekday from `week_start` (Monday by default), the short month names over the columns and every second weekday named beside the rows. The calendar covers the weeks from the one holding the earliest date to the one holding the latest; days of those weeks outside the delivered range have no tile, and a day inside it without a row, or with a null value, is an empty tile. A month is named over the first week that starts in it (the first week, over its first delivered day), its label as wide as the weeks up to the next month, so no two labels overlap; a month label narrower than two weeks, possible only at the ends, is left out, and the tiles of those days still name their dates. A tile is a square of the largest size that lets every week fit the cell's width and the month row and seven weekdays fit its height, from 4 px up to 1.25 rem (2 rem with `show_cell_values`), so five months of weeks do not scroll sideways even in a small cell. When even 4 px tiles are wider than the cell, as a range of several years in a narrow cell, the calendar scrolls sideways inside its own box and the cell keeps its width; only then is the box a stop of the Tab order, a region named as the heatmap, which the arrow keys scroll. The box never scrolls up and down, so a wheel over it still scrolls the page or the cell. A calendar wants a high cell: a low cell leaves too little height for seven weekday rows, so there its tiles take the 4 px floor, the box keeps the month row and seven tile rows whole, and the cell scrolls vertically. With `show_cell_values` a value is written whole or not at all: the widget measures each tile as it is laid out and hides a value its tile would cut; the tile still names its value. Each tile names its date (medium date style of the host language) and its value. The colour scale, `min_value`, `max_value`, `show_cell_values` and the scale legend work as in matrix mode; `x_axis_label` stands under the calendar and names the date column of the data view, and `y_axis_label` has no place in calendar mode. The text alternative and the data view list the delivered dates and values, without a y column.
- Data type change: `y` of a row is no longer required. It stays `string`, `number` or `null`; matrix mode treats an omitted `y` like a null one, and calendar mode needs it omitted or null.
- Drill-down: with `drill_down` true the heatmap offers the chart data view (`ChartShell` and `DataView`, as `pie_chart` and `cartesian_chart` do): a button above the heatmap switches to the values table and back, and a click on a tile, or Enter or Space on it, opens the table with that tile's row picked, opened and marked. Only then are the tiles buttons, reached by Tab in date order, week by week (matrix mode: in y lines), each named as its tile; a button tile keeps the tile's text size, line height and tabular figures; a tile without a delivered row stays an image, with nothing to open. With `drill_down` absent or false no tile is clickable or focusable.
- Min/max check: when `min_value` is greater than `max_value`, the widget shows its own cannot-be-shown state (`cpt-frontx-dashboard-algo-widget-catalog-heatmap-checks`).
- Calendar checks: `week_start` with the matrix mode, a calendar row with a `y` that is not null, and a calendar row whose `x` is not a `YYYY-MM-DD` date each fail the widget's own check, with the same outcome (`cpt-frontx-dashboard-algo-widget-catalog-heatmap-checks`).
- Empty state: `rows` is empty. The widget shows its own English "No data to show" (gears-frontx-templates#105).

### markdown_card

**GTS ID**: `gts.frontx.dashboard.widget.widget.v1~frontx.dashboard.widget.markdown_card.v1~`

**Description**: A card that shows its markdown `body` (CommonMark, with embedded HTML shown as text). It is not a data widget: it has no `data`, no `data_type` trait, and it never requests data.

**Widget type schema:**

```json
{
  "$id": "gts://gts.frontx.dashboard.widget.widget.v1~frontx.dashboard.widget.markdown_card.v1~",
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "title": "MarkdownCard",
  "x-gts-traits": {
    "entry": "gts.frontx.mfes.mfe.entry.v1~frontx.mfes.mfe.entry_mf.v1~frontx.dashboard.mfe.markdown_card.v1",
    "render_type": "gts.frontx.dashboard.widget.render.v1~frontx.dashboard.widget.markdown_card_render.v1~"
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
- Safety: embedded HTML, links and images follow `cpt-frontx-dashboard-algo-widget-catalog-markdown`.
- Other widgets: the markdown card is the only widget that interprets markup. Every other delivered text is rendered as text.

## 7. Acceptance Criteria

- [ ] The 9 widget types ship, each closed with `unevaluatedProperties: false`; `markdown_card` forbids `data`; the 8 data types derive from the widget-data base.
- [ ] A misspelled render field on a concrete widget type fails validation and the widget gets the cannot-be-shown state.
- [ ] The grid sorts and pages client-side over the rows the transform delivered, up to the 500-row cap, with page sizes defaulting to `[10, 25, 50, 100, 500]`, sending no request.
- [ ] `markdown_card` renders CommonMark as `cpt-frontx-dashboard-algo-widget-catalog-markdown` specifies.
- [ ] Given a `markdown_card`, when `render_widget {render}` arrives, then it shows its body at once, sends no request, and shows no loader or empty state.
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
- [ ] Given a `grid` with a column whose `align` is `end`, one whose `format.notation` is `compact` over a number value, one with `compact` while the widget's `value_format` is `percent`, and one with a `title`, when it renders, then the first body is end-aligned, the number is abbreviated, the percent still shows as a percentage, and the heading shows the title.
- [ ] Given a `grid` with 8 columns and `frozen_columns` 2, when the viewer scrolls to the last column, then the first 2 columns stay visible. With `frozen_columns` 0 or absent, all columns scroll.
- [ ] Given a `grid` whose `column_groups` lists a group "Group B" over `c5` and `c6` before a group "Group A" over `c3` and `c4`, when it renders, then a heading row shows "Group A" once over `c3` and `c4` and "Group B" once over `c5` and `c6`, in column position.
- [ ] Given a `grid` with `row_color` set to a column whose values are "error", "Error", "unknown", and null, when it renders in the light scope, then the "error" row takes the error token background of the light scope and shows the error icon with its accessible name, and the other rows show no colour and no icon. When the host theme switches to dark, then the "error" row takes the error token background of the dark scope and no request is sent.
- [ ] Given a `grid` showing rows, when the viewer clicks a sortable column header, then the grid sorts by that column descending; a second click sorts it ascending, and a third click returns the delivered order. Only that header shows a sort state, with `aria-sort`.
- [ ] Given a `grid` whose sortable column holds, in delivered rows r1 to r7, the values 10, "Banana", null, 2, "apple", 2, and null, with host language English, when the viewer sorts ascending, then the row order is r4, r6, r1, r5, r2, r3, r7 (numbers numerically, then strings by the collator, then nulls; equal values keep delivered order). When the viewer sorts descending, then the row order is r1, r4, r6, r2, r5, r3, r7 (nulls stay last).
- [ ] Given a `grid` on its third page, when the viewer sorts by a column, then the grid shows the first page. Given a `grid` on its third page, when the viewer changes the page size, then the grid shows the first page.
- [ ] Given a `grid`, when the viewer changes the page or page size, then the grid pages in place, sending no request.
- [ ] Given a `grid` with no rows, then it shows "No data to show".
- [ ] Given a `grid` whose data has more than 500 rows, then it fails data validation and the cell shows the cannot-be-shown state; rows are never truncated.
- [ ] Given a `grid` page of 500 rows, when the viewer scrolls from the first row to the last, then the view stays responsive in the light and the dark scope (`cpt-frontx-dashboard-nfr-large-table`).
- [ ] Given a `grid`, when it is inspected, then its table exposes its headers and the sort state of the sorted header (`aria-sort`), its pager is a named navigation landmark, and the sort, page and page size controls can be operated with the keyboard alone.
- [ ] Given a `grid` with link values whose `href` is `https://example.org/a`, `/reports/1`, `mailto:team@example.org`, `reports/1` and `javascript:alert(1)`, when it renders, then the first is a link that opens in a new tab with no opener and says so in its name, the second and third are links that open in the same tab, and the last two show their text as plain text, each with one console line naming only the kind of target.
- [ ] Given a `grid` with a badge column whose `tones` maps "Blocked" to danger, a progress column and a sparkline column, and rows holding "Blocked", "Waiting", null and a blank string, the progress values 0.456, 1, 0 and null, and the lists `[3, null, 1, 5, 4]`, `[2]`, null and `[null, null]`, when it renders, then "Blocked" is a danger badge and "Waiting" a neutral one, null and the blank string are empty cells; the bars show 45.6%, 100% and 0% as text and null is empty; the first list draws a line broken at its null, named "First 3, last 4, lowest 1, highest 5", the second a dot, and the last two nothing. The progress and badge columns sort; the sparkline column offers no sort.
- [ ] Given a `grid` with a progress value of 1.5 or -0.1 or a string, a list in a text column, a number in a sparkline column, `tones` on a column that is not a badge, or `sortable` true on a sparkline column, when the widget receives `render_widget`, then it shows its own cannot-be-shown state and writes the problem to the browser console, naming the column key and row index and never the value.
- [ ] Given a `grid` with `search` true on its second page, when the viewer types into its search box, then the grid keeps the rows whose shown text contains the typed text, ignoring case, in any column but sparklines, keeps the sort and shows the first page; a text that matches no row shows "No rows match the search"; the box is reached by Tab and named by the widget texts.
- [ ] Given a `grid` column whose `overflow` is `truncate` and a value longer than the column, when it renders, then the cell keeps one line, ends in an ellipsis and carries the full value as its title.
- [ ] Given a `grid` whose `columns` has two entries with the same `key`, whose `column_groups` names a key that is not a column, whose group columns are not contiguous, whose column is in two groups, whose `row_color` is not a column key, or whose member is repeated within one group, when the widget receives `render_widget`, then in each case the widget draws no rows, shows its own cannot-be-shown state in its cell, and writes the problem to the browser console; the other cells are unaffected. Given a `grid` whose data has a row with fewer or more values than `columns`, when the widget receives `render_widget`, then the widget shows its own cannot-be-shown state in the same way.
- [ ] Given a `cartesian_chart` with a category x axis, when it renders, then the x positions follow the delivered order. With a value or time x axis, points are placed by value. A null value is a gap; a null x or series name is an empty label. Every series is named in the legend and the tooltip.
- [ ] Given a `cartesian_chart` whose data has a series with no entry in `render.series`, when it renders, then that series draws as bars on the primary axis.
- [ ] Given a `cartesian_chart` with two series and a `render.series` entry for each, one drawn as bars and one as a line on the secondary y axis, when it renders, then the legend names both series and a null value is a gap in the line.
- [ ] Given a `cartesian_chart` with a `time` x axis and points whose `x` values are "2026-10-01T00:00:00Z", 1790899200000 (epoch milliseconds for 2026-10-02T00:00:00Z), and "2026-10-03T12:00:00+02:00", when it renders, then each point is placed at its time.
- [ ] Given a `cartesian_chart` with a `time` x axis, a line "Requests" with points at 10:00, 10:05 and 10:10, and a line "Errors" with points at 10:02 and 10:07 of one day, when it renders, then each line is drawn unbroken through its own points, the ticks show times of day, and the tooltip, the text alternative and the data view show the date and time of each point, with no value for a series at a time it has no point.
- [ ] Given a `cartesian_chart` with two line series in the same `stack_group` on the same y axis, when it renders, then the second line is drawn at the sum of both series, and the tooltip and the data view show each series' own value.
- [ ] Given a `cartesian_chart` with `x_axis.label` "Elapsed seconds", `y_axis.label` "Requests" and `y_axis_secondary.label` "CPU", when it renders, then each title is written on its axis without covering a tick label.
- [ ] Given a `cartesian_chart` with a `time` x axis and a point whose `x` is "last week", or a `value` x axis and a point whose `x` is "ten", when the widget receives `render_widget`, then it shows its own cannot-be-shown state in its cell and writes the problem to the browser console; the other cells are unaffected.
- [ ] Given a `cartesian_chart` whose `y_axis` is `log` and a series on it with a point whose `y` is 0, or a `time` x axis and a point whose `x` is the number 1e20, when the widget receives `render_widget`, then it shows its own cannot-be-shown state in its cell and writes the problem to the browser console.
- [ ] Given a `pie_chart`, when it renders, then the legend and tooltip show each segment's label and value. A null or zero segment has no size but stays in the legend.
- [ ] Given a `pie_chart` with `radius` ["40%", "70%"], when it renders, then it draws a donut. Given `radius` ["big"], then validation fails.
- [ ] Given a `cartesian_chart` with `orientation` `horizontal` and bars over three categories, when it renders, then the categories stand down the vertical axis in delivered order and each bar's length follows its value; with a `value` or `time` x axis the widget shows its own cannot-be-shown state.
- [ ] Given a `cartesian_chart` with `stack_mode` `percent` and two bar series in one stack group, when it renders, then each x's segments fill the plot to 100%, the axis shows percents and the tooltip shows each value with its share; an x where both values are 0 draws both at 0%, and a negative value in the group shows the widget's own cannot-be-shown state.
- [ ] Given a line series with `mark_extremes` `both`, when it renders, then its first lowest and first highest values carry a dot and their value; on a bar series the widget shows its own cannot-be-shown state.
- [ ] Given a `reference_lines` entry above the data's highest value, when the chart renders, then its axis extends and the line, dashed by default, is drawn inside the plot with its label at its end; a `y_secondary` line without a secondary series, a category value on a y axis, or a number on a category x axis shows the widget's own cannot-be-shown state.
- [ ] Given a scatter series whose points carry `size`, when it renders, then the larger size draws the larger point, area in proportion, and the tooltip and the data view name the size by `size_label`; a `size` on a point of a bar, line or area series shows the widget's own cannot-be-shown state.
- [ ] Given a `cartesian_chart` or `pie_chart` with `drill_down` `true`, when the viewer activates "Show data", then the area shows the data view with every delivered value and no request is sent; when the viewer clicks a mark, the data view opens with that mark's row opened and marked. With `drill_down` absent, the chart has no "Show data" button and no clickable marks.
- [ ] Given a `cartesian_chart` with `value_labels` `always`, a line series with `label` "Goal" and `line_style` `dashed`, and a secondary axis with `unit` "%", when it renders, then every bar shows its value, the line is dashed and named "Goal" at its last point, and the secondary ticks end in "%".
- [ ] Given a `heatmap`, when it renders, then the categories follow first-appearance order, the scale is shown with numbers, the tooltip shows x, y, and value, and a null value leaves the cell empty.
- [ ] Given a `heatmap` with `min_value` 0, `max_value` 100, and `show_cell_values` true, when it renders, then the colour scale runs from 0 to 100 and each cell shows its value. Given `min_value` and `max_value` absent or null, then the scale takes the lowest and the highest value in the data.
- [ ] Given a `heatmap` with `mode` `calendar` and daily rows with no `y`, when it renders, then it draws a tile per day of the delivered range in weeks by weekdays from `week_start`, names the months over their first week, leaves a day without a row an empty tile, and fits every week in its cell without sideways scrolling. Given `week_start` with the matrix mode, a calendar row with a `y`, or a calendar row whose `x` is not a `YYYY-MM-DD` date, then the widget shows its own cannot-be-shown state.
- [ ] Given a `heatmap` with `drill_down` true, when a tile is clicked, or reached by Tab and pressed with Enter, then the data view opens with that tile's row picked; with `drill_down` absent no tile is a button.
- [ ] Given a `heatmap` whose `min_value` is greater than its `max_value`, when the widget receives `render_widget`, then it shows its own cannot-be-shown state in its cell and writes the problem to the browser console, as `cpt-frontx-dashboard-algo-widget-catalog-heatmap-checks` specifies; the other cells are unaffected.
- [ ] Given a data widget whose answer has a null label, x, y, or series value, when it renders, then that value shows as an empty label and the row or point stays.
- [ ] Given a chart widget, when it builds a tooltip, then the tooltip is built from text, never from HTML strings.
- [ ] Given a widget, when it conveys meaning, then colour is never the only signal: the heatmap's numeric scale, progress values as text, the trend icon, and series and segment naming in legends and tooltips all carry the meaning.
- [ ] Given the dashboard root, when it is inspected, then it has no chart-library dependency.
- [ ] Given a widget, when the host theme id maps to dark, then it uses the dark ui-kit scope; an unknown id gives light. The set of dark theme ids is enumerated and updated when the host adds a dark theme.
- [ ] Given the reference dashboard, when all 9 widget types are inspected in both scopes, in a cell and in the larger view, against the design-system reference, then every colour, font, and spacing value comes from kit tokens (`cpt-frontx-dashboard-nfr-visual-quality`), and no widget conveys meaning by colour alone (`cpt-frontx-dashboard-nfr-accessibility`).
- [ ] Given a dashboard with one cell of each data widget type, when one cell's transform output breaks its data type, then that cell shows the cannot-be-shown state and every other cell is unaffected. Each of these fixtures, run on its own, gives this result:
  - `summary_card`: a row `{"label": "A", "value": "12"}` (wrong type); a row `{"label": "A"}` (missing `value`); a row `{"label": "A", "value": 1, "unit": "x"}` (extra field).
  - `metric_card`: `{"value": "12"}` (wrong type); `{"previous_value": 1}` (missing `value`); `{"value": 1, "trend": "up"}` (extra field).
  - `ranked_list_card`: a row `{"label": "A", "value": "12"}` (wrong type); a row `{"label": "A"}` (missing `value`); a row `{"label": "A", "value": 1, "rank": 1}` (extra field).
  - `progress_list_card`: a row `{"label": "A", "current": "50", "target": 100}` (wrong type); a row `{"label": "A", "current": 50}` (missing `target`); a row `{"label": "A", "current": 50, "target": 100, "percent": 50}` (extra field).
  - `grid`: a row `["A", true]` (wrong type); `{}` (missing `rows`); `{"rows": [], "columns": []}` (extra field).
  - `cartesian_chart`: a point `{"x": "Mon", "y": "5"}` (wrong type); a point `{"x": "Mon"}` (missing `y`); a point `{"x": "Mon", "y": 5, "label": "a"}` (extra field).
  - `pie_chart`: a slice `{"label": "A", "value": "12"}` (wrong type); a slice `{"value": 12}` (missing `label`); a slice `{"label": "A", "value": 12, "color": "red"}` (extra field).
  - `heatmap`: a row `{"x": "Mon", "y": "09:00", "value": "3"}` (wrong type); a row `{"x": "Mon", "y": "09:00"}` (missing `value`); a row `{"x": "Mon", "y": "09:00", "value": 3, "color": "red"}` (extra field).
- [ ] Given each data widget type with data that meets its empty condition (`summary_card`, `ranked_list_card`, `progress_list_card`, `grid` and `heatmap` with `rows` [], `pie_chart` with `slices` [], `cartesian_chart` with `series` [] or only series with no points, and `metric_card` with a null `value`), when it renders, then the widget shows its own English "No data to show" (gears-frontx-templates#105) inside its cell, and the cell frame stays.
- [ ] Given a `summary_card` and a `grid` each showing the number 1234.5, when `value_format` is absent or `value_type` is `number`, then both show 1,234.5 for host language English. When `value_type` is `percent` and the value is 0.25, then both show 25%. When `value_type` is `duration` with `unit` `s` and the value is 90, then both show 90 with the localized unit for seconds, not converted to another unit. When `value_type` is `currency` with `currency` `USD`, then both show $1,234.50; with `decimals` 0 a `number` shows 1,235; with `unit_label` `lines` a `number` shows 1,234.5 lines, the label after a no-break space. The same formatting applies to the values of `metric_card`, `ranked_list_card`, `progress_list_card`, the chart tooltips and text alternatives, and the heatmap scale and cell values.
- [ ] Given a `cartesian_chart`, a `pie_chart`, and a `heatmap`, when they are inspected with assistive technology, then each has an accessible name (the widget's own English default "Chart": the root passes the renderer no cell label, gears-frontx-templates#105) and a text alternative that lists the delivered values (series, x and y; slice labels and values; heatmap x, y and values, or dates and values in calendar mode).
- [ ] Given the reference dashboard, when a keyboard-only walkthrough covers all 9 widget types in their cells in the light and in the dark theme, then every widget passes the host's accessibility checks (`cpt-frontx-dashboard-nfr-accessibility`).
- [ ] Given the reference dashboard, when a screen-reader walkthrough covers all 9 widget types in their cells and in the larger view, in the light and in the dark theme, then every control announces its name, role and state, each widget's empty and own cannot-be-shown states are read as text, the charts and the heatmap read their accessible name and text alternative, and every widget passes the host's accessibility checks (`cpt-frontx-dashboard-nfr-accessibility`).
- [ ] Given the dashboard-author guide, when it is reviewed, then it covers writing a dashboard JSON, the grid, the binding, the catalog, the layout checks, that the product owns dashboard and data size, that every viewer who may see a dashboard must be able to get its widgets' data, that the product's API owns errors and access, what the host must provide, and the documented limitations (the limitations of PRD §6.3 and the DESIGN limits of DESIGN §5). When a dashboard author who did not build the template and has not used it before follows the guide alone, then they write a first working dashboard in one working session.
