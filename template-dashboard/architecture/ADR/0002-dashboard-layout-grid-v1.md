---
status: accepted
version: 1
priority: p1
date: 2026-11-09
decision-makers: template-dashboard architecture maintainers
description: "Decision record for the dashboard layout grid: an ordered list of cells, each naming a size class (small, medium, large) and a height class (low, high) of the ui-kit Grid, placed by the Grid in list order with the kit's default config, with repeated widget ids checked by the dashboard root."
---

# ADR-0002: Dashboard layout grid

**ID**: `cpt-frontx-dashboard-adr-dashboard-layout-grid`

<!-- toc -->

- [Context and Problem Statement](#context-and-problem-statement)
- [Decision Drivers](#decision-drivers)
- [Considered Options](#considered-options)
- [Decision Outcome](#decision-outcome)
  - [Consequences](#consequences)
  - [Confirmation](#confirmation)
- [Pros and Cons of the Options](#pros-and-cons-of-the-options)
  - [Size and height classes placed by the ui-kit Grid](#size-and-height-classes-placed-by-the-ui-kit-grid)
  - [Integer `{x, y, w, h}` cells on a fixed column grid, rendered with CSS Grid](#integer-x-y-w-h-cells-on-a-fixed-column-grid-rendered-with-css-grid)
  - [A layout library at run time (react-grid-layout) in the dashboard root](#a-layout-library-at-run-time-react-grid-layout-in-the-dashboard-root)
- [More Information](#more-information)
- [Traceability](#traceability)

<!-- /toc -->

## Context and Problem Statement

A dashboard places widgets in cells. The dashboard root needs a layout model that is easy to store as data and easy to render. The dashboard is one JSON; the template renders it and does not edit it. The dashboard area has whatever width the host gives it, from a narrow panel to a wide screen. How should layout be represented and rendered?

`@gears-frontx/ui-kit` ships a `Grid` component for exactly this job: an ordered group of blocks whose widths follow size classes. A `GridItem` declares a size class (`small`, `medium`, `large`) and a height class (`low`, one row track, or `high`, two row tracks and the gap between them). The Grid's solver picks each item's span from its size class at the width of the Grid's own container, keeps the items in input order, and never lets two items overlap.

## Decision Drivers

* The stored layout must be simple to write by hand and to generate, and independent of pixel widths.
* The layout must work at any width the host gives the dashboard area, with no horizontal overflow and no layout code per dashboard.
* The dashboard root must not carry a layout library of its own, to keep its bundle small.
* Layout must render the same way for every dashboard, with no hidden collision logic in the template.
* Every widget must look like the rest of the product: the same spacing, row track and breakpoints as other ui-kit layouts.
* The rendered layout must work inside the style scope that the dashboard root owns, with no document-level stylesheets.

## Considered Options

* Size and height classes placed by the ui-kit Grid
* Integer `{x, y, w, h}` cells on a fixed column grid, rendered with CSS Grid
* A layout library at run time (react-grid-layout) in the dashboard root

## Decision Outcome

Chosen option: "Size and height classes placed by the ui-kit Grid", because it stores the least a dashboard author has to decide, adapts to every container width through the kit, cannot produce overlapping or out-of-range cells, and gives the dashboard the spacing and row track of every other ui-kit layout.

**The stored model.** The layout is an ordered array of cells. A cell names a `size` (`small`, `medium` or `large`), an optional `height` (`low` or `high`, `low` when absent), the `widget` it renders and an optional `larger_view` widget. The layout has an optional `flexible` flag, `true` when absent. The dashboard stores no column, row or pixel value.

**Rendering.** The dashboard root renders one ui-kit `Grid` with the kit's default config (`defaultGridConfig`: 12 columns, the container steps base 0px, sm 480px, md 768px and lg 1200px, and a row track of `10rem`). It passes the layout's `flexible` flag to the Grid. Each cell becomes one direct `GridItem` whose `layoutId` is the id of the cell's widget, with the cell's `size` and `height`. The cell frame of the root fills the item. The Grid sets the span of every item from its size class at the current container width, and lets spans move inside each class's range to fill rows when `flexible` is on. The root never computes a span, a column or a row itself. A cell with no `larger_view` hides its larger-view button.

**Row track and reading order.** One row track is the kit config's `rowHeight`: a `low` cell is one track high, a `high` cell two tracks and the gap between them. The DOM, reading and keyboard order of the cells is their order in `cells`; the Grid keeps it at every width and never reorders items. The model feature's placement procedure applies it (`cpt-frontx-dashboard-algo-dashboard-model-place-cells`).

**Layout checks.** The dashboard root runs the layout checks in its own code when it opens a dashboard. The model feature owns the procedure (`cpt-frontx-dashboard-algo-dashboard-model-layout-checks`); this ADR states its staging. Cell failures come first: a missing `widget`, or a `size` or `height` outside its values, found by the GTS validation of the dashboard. The check for unique widget ids across `widget` and `larger_view` runs only when no cell has a cell failure (every GTS instance id is unique, so a dashboard never holds the same widget instance twice; the Grid also needs a unique `layoutId` per item). One pass reports together all failures of the stage it reaches, with the dashboard's own validation failures. A failed layout check is a dashboard-level failure: the dashboard area shows the cannot-be-shown state, and no cell is mounted. A widget that fails its own registration gets a failed cell.

**Content taller than its cell.** A Grid item is a scroll container: a widget whose content is taller than its cell scrolls inside the cell and never overlaps a neighbour.

### Consequences

* Good, because the dashboard root uses a component the template already depends on, so the layout adds no library of its own.
* Good, because the layout adapts to every container width: at the base step a `medium` or `large` cell takes the whole row and a `small` one half of it, so a narrow host panel needs no horizontal scrolling.
* Good, because overlapping and out-of-range cells cannot be written: the only layout failure left is a repeated widget id.
* Good, because the dashboard follows the kit's spacing, breakpoints and row track, and a kit release that changes them changes every dashboard the same way.
* Neutral, because the author chooses a size class, not an exact width: at a given width the Grid decides the span, and with `flexible` on a span may move inside its class's range to fill a row.
* Bad, because a repeated widget id is not repaired at run time; the layout check rejects it, so one bad cell blocks the whole dashboard, and its JSON must be fixed.
* Bad, because there is no visual editor; layouts are written as data.

### Confirmation

Confirmed by rendering a test dashboard and checking that each cell becomes one Grid item with its widget id as `layoutId` and its `size` and `height`, in the order of `cells`, inside one Grid with the kit's default config and the layout's `flexible` flag. Fixtures confirm rejection: a cell with a `size` outside its values, a cell with no `widget`, and a repeated widget id across `widget` and `larger_view`. For each, the dashboard root renders no cells and shows the dashboard-level cannot-be-shown state. A review confirms that the dashboard root computes no span, column or row and has no layout dependency other than `@gears-frontx/ui-kit`.

## Pros and Cons of the Options

### Size and height classes placed by the ui-kit Grid

Cells name a size class and a height class; the kit Grid places them in list order at the width of its container.

* Good, because the stored model is small and holds no width, so the same dashboard fits a narrow panel and a wide screen.
* Good, because overlaps and out-of-range positions cannot occur, so the only layout check is the repeated widget id.
* Good, because the Grid's step CSS uses container queries, needs no JavaScript on resize, and keeps the input order for reading and focus.
* Good, because the Grid's styles live with the kit's own CSS, inside the style scope that the dashboard root owns.
* Neutral, because spans come from the kit config: the template uses the default config, and a product that wants other spans passes its own config with the stylesheet generated for it.
* Bad, because the author cannot place a cell at an exact column or leave a deliberate gap.

### Integer `{x, y, w, h}` cells on a fixed column grid, rendered with CSS Grid

Cells are integer coordinates on a fixed column grid (for example 60 columns), mapped to CSS grid lines.

* Good, because it uses browser-native layout with exact placement.
* Good, because a column count such as 60 divides into halves, thirds, quarters, fifths and sixths.
* Bad, because the stored coordinates assume one width: on a narrow container every cell shrinks in proportion, so the grid overflows horizontally or becomes unreadable unless the template adds its own reflow rules.
* Bad, because overlapping and out-of-range cells can be written, and the root needs bounds, `x + w` and overlap checks to reject them.
* Bad, because spacing, breakpoints and row track are the template's own, apart from the rest of the product's ui-kit layouts.

### A layout library at run time (react-grid-layout) in the dashboard root

The dashboard root would render and position cells through a drag-and-resize grid library.

* Good, because collision handling is built in.
* Bad, because the dashboard root would load an editing library only to display fixed layouts.
* Bad, because each isolated instance would pay for that code.
* Bad, because the library imposes its own DOM and document-level stylesheets that would have to be injected into the style scope that the dashboard root owns.

## More Information

* **Review trigger**: revisit when dashboards need exact placement or deliberate gaps that size classes cannot express, or when the kit Grid changes its model.
* **Scope**: this decision covers the stored cell model, the size and height classes, the row track, the reading and keyboard order, the rendering technique, and where invalid layouts are caught. It does not cover authoring, and it does not cover the kit Grid's own spans and steps, which the kit's default config owns.
* **Checklist applicability**: ARCH applicable; PERF applicable (no layout library of the template's own, container queries with no resize script); SEC N/A; REL applicable (invalid layouts rejected with the dashboard-level cannot-be-shown state); DATA applicable (stored cell format and its validation); INT applicable (the ui-kit Grid and its default config); OPS N/A; MAINT applicable (the kit owns the layout code); TEST applicable; COMPL N/A; UX applicable (size classes, the row track, adaptation to the container width, and the reading and keyboard order); BIZ N/A.

## Traceability

- **PRD**: [PRD.md](../PRD.md)
- **DESIGN**: [DESIGN.md](../DESIGN.md)

This decision directly addresses the following requirements or design elements:

* `cpt-frontx-dashboard-fr-dashboard-as-json` - the layout and cell types store a size class and a height class per cell, in reading order.
* `cpt-frontx-dashboard-fr-widget-catalog` — each cell holds one widget of the catalog and an optional larger-view widget.
* `cpt-frontx-dashboard-nfr-bundle-budget` - the dashboard root carries no layout library of its own.
* `cpt-frontx-dashboard-nfr-initial-render` - the kit Grid places cells with CSS container queries and runs no layout script on resize.
