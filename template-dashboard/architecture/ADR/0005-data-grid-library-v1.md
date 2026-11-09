---
status: accepted
version: 1
priority: p1
date: 2026-11-09
decision-makers: template-dashboard architecture maintainers
description: "Decision record for the component behind the grid widget type: the ui-kit DataGrid with its pagination and order plugins, whose load callback answers from the rows the transform delivered, up to the row cap; the grid holds all rows up to the cap, sorts and pages client-side, keeps its state in memory and never sends a request."
---

# ADR-0005: Data grid library

**ID**: `cpt-frontx-dashboard-adr-data-grid-library`

<!-- toc -->

- [Context and Problem Statement](#context-and-problem-statement)
- [Decision Drivers](#decision-drivers)
- [Considered Options](#considered-options)
- [Decision Outcome](#decision-outcome)
  - [Consequences](#consequences)
  - [Confirmation](#confirmation)
- [Pros and Cons of the Options](#pros-and-cons-of-the-options)
  - [The ui-kit DataGrid](#the-ui-kit-datagrid)
  - [The ui-kit DataTable](#the-ui-kit-datatable)
  - [A headless table library inside the widget](#a-headless-table-library-inside-the-widget)
  - [AG Grid Community Edition](#ag-grid-community-edition)
  - [No library: the kit Table rendered by the widget](#no-library-the-kit-table-rendered-by-the-widget)
- [More Information](#more-information)
- [Traceability](#traceability)

<!-- /toc -->

## Context and Problem Statement

The `grid` widget type shows tabular data. Its data is the grid's data shape, delivered through `render_widget` from the rows the binding's transform produced ([ADR-0009](0009-subject-agnostic-widget-catalog-v1.md), [ADR-0011](0011-widget-data-binding-v1.md)). The transform output has a row cap. The grid is a passive renderer: it receives its data and renders it, and makes no requests.

The grid sorts and pages client-side over the rows it received. The browser holds the rows the transform delivered, up to the row cap; the grid renders one page at a time. In FrontX each widget instance is isolated, so every grid instance evaluates its own copy of whatever library the grid uses.

`@gears-frontx/ui-kit` ships a `DataGrid`: a grid rendered through the kit's `Table`, fed by a `load(ctx)` callback, with plugins for paging, sorting, an empty state and expandable rows, column groups and pinned leading columns. It is built on TanStack Table inside the kit, so the widget does not depend on TanStack directly.

Which component renders the `grid` widget type?

## Decision Drivers

* The grid sorts and pages client-side over the rows the transform delivered; it must not fetch, filter or page from a backend.
* The grid must look and behave like the other tables of the product, in both kit scopes.
* Grouped column headings, frozen leading columns, column alignment and row colouring must be expressible.
* No state may be written to browser storage (`cpt-frontx-dashboard-nfr-no-persistence`).
* Small extra size per instance, because every grid instance evaluates its own copy (FrontX ADR-0011).
* Rendering performance with one page of up to the row cap.
* Accessibility: table semantics, sort state on headers, a named pager.

## Considered Options

* The ui-kit DataGrid
* The ui-kit DataTable
* A headless table library inside the widget
* AG Grid Community Edition
* No library: the kit Table rendered by the widget

## Decision Outcome

Chosen option: "The ui-kit DataGrid", because it is the product's own grid, built on the kit's `Table` and tokens, and its `load` contract, plugins, column groups and pinned columns cover the grid widget's presentation with no table library of the template's own.

**Data and load.** The widget builds one `DataGrid` column per displayed column; column `i` reads its value from position `i` of each delivered row. The widget holds every delivered row in memory. Its `load(ctx)` callback never sends a request: it sorts the held rows by `ctx.order` with the widget's own sort function, which follows the grid's sort rule in the widget catalog, takes the page `ctx.pagination` names, and returns that page with `total` set to the number of delivered rows. With no sort, the rows keep the delivered order. The grid is rendered with `persistent="memory"`, so its page, page size and sort live only while the dashboard is open, and the widget never turns on column-visibility persistence.

**Plugins.** `DataGridPaginationPlugin` draws the pager: `limits` are the grid's page sizes and `defaultLimit` the first of them. `DataGridOrderPlugin` makes the header of each sortable column a sort button; a column that is not sortable is in `excludedColumns`. A header click follows the kit's cycle: descending, then ascending, then the delivered order again. A grid with no rows shows the widget's own "No data to show" in place of the DataGrid. No other plugin is used: there is no search, filter, row selection, export or table configuration, because the grid shows exactly the rows it received.

**Client-side sort and page.** A sort click, a page change and a new page size each call the widget's `load`, which answers from the held rows. None of these sends a request or re-runs the binding: the grid works only on the rows the transform delivered, up to the row cap. The pager shows the position in the result and the total. A page size is always offered. The larger view of a grid is its own grid widget with its own data, and it sorts and pages the same way.

**Presentation features keyed by column.** Frozen leading columns are pinned with the kit's `sticky` column flag and stay visible during horizontal scroll; a group is pinned as a whole, so a frozen count that ends inside a group pins the whole group. Grouped column headings are kit column groups. Column alignment and row colouring are classes on the column's cells: row colouring is keyed by a column whose value names a ui-kit row-colour meaning, takes the kit token of that meaning, which adapts to the light or dark scope, and shows an icon with an accessible name in the row's first cell, so meaning is never conveyed by colour alone (`cpt-frontx-dashboard-fr-accessibility`). A cell shows its value as text; a column may ask for one line per cell, and then a long value ends in an ellipsis and keeps its full text as the cell's title. A value delivered as a link shows as a kit `Link` that opens in a new tab with no opener, and only for `http`, `https` and same-site relative targets (a target starting with `//` or `\\` is another site); any other target shows the link text as plain text.

**Sort state for assistive technology.** The kit grid names each sortable header as a button and does not set `aria-sort`. The grid widget sets `aria-sort` on the header cell of the active sort column and `none` on the other sortable headers.

**Grid checks.** The widget type's schema closes its presentation fields (`unevaluatedProperties: false`), so a misspelled field fails validation and the widget gets the cannot-be-shown state ([ADR-0003](0003-shared-data-types-and-schemas-v1.md)). [ADR-0009](0009-subject-agnostic-widget-catalog-v1.md) owns the row cap of 500: it counts every row the transform delivers, not the rows on one page. The page size is a separate render choice, decided in the widget catalog. Grid columns are keyed by position: data rows stay positional arrays, `render.columns[i]` describes position `i` and has a required `key` (unique, `^[a-z][a-z0-9_]{0,63}$`), and `column_groups[].members` and `row_color` refer to column keys. The consistency checks are based on keys: there is exactly one column per data position, group members are columns, groups are contiguous, there are no repeats inside a group, no column belongs to two groups, and `row_color` names a column. A failure of a consistency check gives the cannot-be-shown state.

**The data view of chart widgets.** The chart widgets that offer a view of their delivered values as a table (the widget catalog's drill-down) use the same kit `DataGrid`, with the same in-memory `load`, and the kit table tree plugin to open the row of a picked mark.

### Consequences

* Good, because the grid is the product's own grid, styled by the kit in both scopes, with no table markup of the template's own.
* Good, because the template adds no table library: the DataGrid and its TanStack core ship inside ui-kit, a shared dependency counted once.
* Good, because the `load` contract keeps the grid a passive renderer: every sort and page is answered from memory.
* Good, because column groups, pinned columns and the pager are kit features, configured, not built.
* Good, because the grid holds all rows up to the cap and renders one page at a time, so a result of any size up to the cap shows with the same grid.
* Bad, because the DataGrid does not virtualize rows: a page of 500 rows puts 500 rows in the DOM. Mitigation: the grid always pages, the first page size is small, and the large-table figure is confirmed by measurement.
* Bad, because the kit grid has no column resizing, so the viewer cannot change a column's width.
* Bad, because the kit's sort cycle includes a third click that returns to the delivered order, which the widget follows rather than defines.
* Bad, because the kit grid sets no `aria-sort`, so the widget adds it on the header cells. Mitigation: it lives in the one grid component every grid configuration shares.

### Confirmation

Confirmed by code review and by checks on the `grid` widget:

* The widget builds its table with the ui-kit `DataGrid`, and no other grid or table library appears in the dependency list of the widgets package.
* Cells show their value as text or as a kit link, and no column configuration selects a cell renderer.
* A click on a sortable header sorts the held rows and sends no request. A page control moves between pages and sends no request. A new page size changes the page size and sends no request.
* The grid writes nothing to browser storage.
* A row with a colour shows an icon with an accessible name, and no row meaning rests on colour alone.
* Frozen columns, grouped column headings, alignment, one-line cells, links and row colours render as configured.
* A test confirms the grid cross-checks: there is exactly one column per data position, group members are columns, groups are contiguous, there are no repeats inside a group, no column belongs to two groups, and `row_color` names a column. A failure of each check gives the cannot-be-shown state.
* The sorted header carries `aria-sort`, the pager is a named navigation landmark, and the grid passes an automated accessibility check and a keyboard test (`cpt-frontx-dashboard-fr-accessibility`).
* Scrolling a page of 500 rows is measured against `cpt-frontx-dashboard-nfr-large-table`.
* The transferred gzipped size of each `grid` widget entry is measured on a cold load of the reference dashboard under the counting rule of the DESIGN, with ui-kit counted once in the page total.

## Pros and Cons of the Options

### The ui-kit DataGrid

The kit's grid on its `Table`, fed by a `load` callback, extended by plugins.

* Good, because it is the product's grid, with kit styles in both scopes.
* Good, because column groups, pinned columns, the pager, header sorting and an empty-state slot are built in.
* Good, because the `load` contract lets the widget answer every sort and page from memory.
* Good, because it adds no library beyond ui-kit, which the template already shares.
* Bad, because it has no row virtualization and no column resizing.
* Bad, because it sets no `aria-sort`.

### The ui-kit DataTable

The kit's table for static, already-loaded rows with client-side sorting and paging.

* Good, because it is made for rows already in memory.
* Bad, because it has no column groups or pinned columns, so frozen columns and grouped headings would be built by hand around it.
* Bad, because the chart widgets' data view needs expandable rows, which only the DataGrid offers, so the catalog would use two table components.

### A headless table library inside the widget

TanStack Table with a virtualizer, rendered by the widget.

* Good, because rendering, virtualization and column resizing are fully the widget's.
* Bad, because the header and row markup, the pager, frozen columns, grouped headings and accessibility must be built and maintained by the template, apart from the kit's grid.
* Bad, because the widgets package depends on a table library of its own next to the one inside ui-kit.

### AG Grid Community Edition

A complete grid with built-in UI.

* Good, because rendering and accessibility come built in.
* Bad, because much of its weight is built-in UI the grid does not use, such as filtering, grouping and editing.
* Bad, because it is large, and every isolated instance would evaluate it again.
* Bad, because its own CSS conflicts with ui-kit.

### No library: the kit Table rendered by the widget

The widget renders the kit's `Table` from its configuration and its page of rows.

* Good, because it adds no component beyond the kit's table parts.
* Bad, because the pager, header sorting, pinned columns and grouped headings would be built and maintained by hand.

## More Information

* Evolution path: the grid widget keeps the DataGrid behind its own `render` schema. If the kit grid changes, only the widget changes, and grid configurations stay the same.
* Review trigger: a page of up to the row cap does not meet the large-table figure, which would call for virtualization; the row cap is raised; the kit grid gains column resizing or `aria-sort`, which the widget then uses instead of its own.
* Row order is the delivered order of the rows until the viewer sorts. Grouped column headings only label contiguous columns in the header.
* Scope: the `grid` widget type and the data view of the chart widgets. Does not change other widget types or the binding runner.
* Checklist applicability: ARCH applicable; PERF applicable (per-instance evaluation cost, a page of up to the row cap without virtualization); SEC applicable (cells show untrusted API values as text, and links only for `http`, `https` and relative targets); REL N/A because the template is source code with no service, no availability target and no runbook (DESIGN section 4.2); DATA N/A (the grid reads its data and persists nothing); INT applicable (the ui-kit DataGrid and its `load` contract; the render and data contract is owned by ADR-0009); OPS N/A because the template is source code with no service, no availability target and no runbook (DESIGN section 4.2); MAINT applicable (the kit owns the grid; the widget owns its `load`, its sort function and its checks); TEST applicable; COMPL applicable (ui-kit is Apache-2.0 and its TanStack core MIT); UX applicable (the viewer sorts and pages; no migration, because v1 has no prior users; changes are communicated in release notes; the author guides of DESIGN section 5 document the grid); BIZ N/A.

## Traceability

- **PRD**: [PRD.md](../PRD.md)
- **DESIGN**: [DESIGN.md](../DESIGN.md)

This decision directly addresses the following requirements or design elements:

* `cpt-frontx-dashboard-fr-grid-sort-page` — the grid sorts and pages client-side over the rows the transform delivered, never sends a request, and renders one page at a time.
* `cpt-frontx-dashboard-nfr-large-table` - the grid always pages, and a page of up to the row cap is measured against the large-table figure.
* `cpt-frontx-dashboard-fr-accessibility` - the grid uses the kit table semantics, adds `aria-sort`, and no row meaning rests on colour alone.
* `cpt-frontx-dashboard-nfr-bundle-budget` - the grid adds no library beyond ui-kit, a shared dependency whose source text is fetched once.
* `cpt-frontx-dashboard-fr-widget-catalog` - the `grid` widget type uses this component.
