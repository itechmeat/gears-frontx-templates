---
status: accepted
version: 1
date: 2026-10-31
description: "Decomposition of the dashboard template DESIGN into four features: the dashboard model, the dashboard runtime, the widget contract, and the widget catalog, with their scope, dependency order, and coverage of PRD and DESIGN identifiers."
---

# Decomposition: Dashboard Template

<!-- toc -->

- [1. Overview](#1-overview)
- [2. Entries](#2-entries)
  - [2.1 Dashboard Model - HIGH](#21-dashboard-model---high)
  - [2.2 Dashboard Runtime - HIGH](#22-dashboard-runtime---high)
  - [2.3 Widget Contract - HIGH](#23-widget-contract---high)
  - [2.4 Widget Catalog - HIGH](#24-widget-catalog---high)
- [3. Feature Dependencies](#3-feature-dependencies)

<!-- /toc -->

## 1. Overview

The DESIGN is decomposed into four features. Two are **model features** that declare GTS types: the dashboard model, which has no actor flows, and the widget contract, which has one actor flow, the publish flow. One is a **runtime feature** (the dashboard runtime) that owns the viewer and host flows. One is a **catalog feature** (the widget catalog) that owns the widget types, their render schemas and data shapes, the rendering rules, and one actor flow, the grid sort-and-page flow.

**Decomposition strategy:**

- The dashboard model owns the dashboard type, the layout, the cells, the layout checks, cell placement, the unknown-`source` check, and failure attribution. It is the data a dashboard author writes.
- The widget contract owns the widget base, `data_widget`, the widget-data base, the `render_widget` action, the `widgets` domain and its extension type, the entry declaration, the widget-author obligations, and the shared-dependency and budget rules. It is the contract a widget author writes against.
- The dashboard runtime owns the hosting, the registry, the GTS-file loading, the owner state machine and load lifecycle, the binding runner, the cell frame, the larger-view overlay, and teardown; it calls the model's checks. It is the code that renders a dashboard.
- The widget catalog owns the 9 widget types, each with its render type and data shape, the rendering rules, markdown safety, and the grid's client-side sort and page. It is what a dashboard author picks from.
- Each feature is `p1`: all four are needed for a complete template. The implementation order is the dependency order in section 3.

Each feature is delivered as a single phase; no sub-decomposition is needed at this level.

## 2. Entries

**Overall implementation status:**

- [ ] `p1` - **ID**: `cpt-frontx-dashboard-status-overall`

### 2.1 Dashboard Model - HIGH

- [ ] `p1` - **ID**: `cpt-frontx-dashboard-feature-dashboard-model`

- **Purpose**: Let a dashboard author describe a whole dashboard as checked data, so that a wrong dashboard is caught before it is shown and a widget that fails on its own never breaks the rest.

- **Depends On**: `cpt-frontx-dashboard-feature-widget-contract`

- **Scope**:
  - The dashboard GTS type and its instances.
  - The layout cells (a size class and a height class of the ui-kit Grid) as plain closed objects.
  - The embedded widget instance shape (`widget` and `larger_view` refer to the contract's widget base).
  - The dashboard's optional `requests` object for named shared requests.
  - The layout checks: cell failures from validation, unique widget ids.
  - Placement of cells on the ui-kit Grid with the kit's default config, read and reached by keyboard in the order of `cells`.
  - The unknown-`source` check on shared-request references.
  - Failure attribution: a failure of the dashboard itself, including an embedded widget that breaks the open widget base (for example no `id`), is dashboard-level; a failure at a widget's own registration against its type, or a later trait, entry, data type, request, transform, data validation, mount or `render_widget` failure, affects only its cell, or only its larger view for a `larger_view` instance.

- **Out of scope**:
  - The widget types and data types (feature-widget-contract, feature-widget-catalog).
  - The runtime that runs the checks (feature-dashboard-runtime).

- **Requirements Covered**:
  - [ ] `p1` - `cpt-frontx-dashboard-fr-dashboard-root` (type and layout checks)
  - [ ] `p1` - `cpt-frontx-dashboard-fr-per-cell-failure` (failure attribution: dashboard-level or cell-level)
  - [ ] `p1` - `cpt-frontx-dashboard-fr-dashboard-as-json`
  - [ ] `p1` - `cpt-frontx-dashboard-fr-shared-data` (the requests object shape)
  - [ ] `p1` - `cpt-frontx-dashboard-fr-static-data` (binding data in the dashboard JSON)
  - [ ] `p1` - `cpt-frontx-dashboard-fr-states` (which failures make the dashboard or a cell cannot-be-shown)
  - [ ] `p2` - `cpt-frontx-dashboard-usecase-author-dashboard` (the dashboard JSON an author writes)

- **Design Principles Covered**:
  - [ ] `p2` - `cpt-frontx-dashboard-principle-open-bases-closed-leaves`

- **Design Constraints Covered**:
  - [ ] `p2` - `cpt-frontx-dashboard-constraint-size-class-grid`
  - [ ] `p2` - `cpt-frontx-dashboard-constraint-one-gts-package`
  - [ ] `p2` - `cpt-frontx-dashboard-constraint-same-origin-data`

- **Domain Model Entities**:
  - Dashboard (type and instances)
  - Cell (size class, height class, widget, larger_view)
  - Widget instance (embedded in a cell)
  - Named shared request (dashboard `requests` values)

- **Design Components**:

  - [ ] `p2` - `cpt-frontx-dashboard-component-dashboard-root` (model side: dashboard type, layout checks, placement, unknown-`source` check, failure attribution)

- **API**:
  - The dashboard GTS type and instance schema.

- **Sequences**:

  - `cpt-frontx-dashboard-seq-runtime-flow` (load and layout-check steps)

- **Data**:
  - None (no database; `cpt-frontx-dashboard-db-none`).

### 2.2 Dashboard Runtime - HIGH

- [ ] `p1` - **ID**: `cpt-frontx-dashboard-feature-dashboard-runtime`

- **Purpose**: Turn a dashboard's JSON into a working, themed dashboard inside the product's page, so that the product writes no data, layout or rendering code.

- **Depends On**: `cpt-frontx-dashboard-feature-dashboard-model`, `cpt-frontx-dashboard-feature-widget-contract`

- **Scope**:
  - Hosting-agnostic mounting (single-page application or screen extension); the template is hosting-agnostic.
  - Registering the `widgets` domain the contract declares; the widget renders one action, including its own empty state.
  - Registering the dashboard instance, then each embedded widget instance on its own.
  - Generated extensions per cell and per larger view, with ids from the contract's extension id rule, `mount_ext`/`unmount_ext` with `history: "none"`; a fix takes effect on the next page load.
  - The served GTS-file fetch and registration; the bundle-schema guard.
  - The binding runner: own form (request and transform), shared form (shared request, held response, per-cell transform), static form (transform on params, no loader); request through the `DashboardHost` the product passes, CEL transform, stamp, register; the root runs the binding; widgets make no requests; a request that never answers times out; same-origin absolute paths; stamped with an id from the contract's stamped-data id rule.
  - The cell frame (title, loader, cannot-be-shown state, larger-view button) and the larger-view overlay inside the dashboard root's own container, with their keyboard and dialog accessibility; the widget renders one action, including its own empty state.
  - Theme and language publishing; teardown; late-result dropping.
  - Calling the model's layout checks, cell placement, unknown-`source` check and failure attribution at load.
  - The owner state machine and load lifecycle: supersede a load for a new dashboard id, join a running load for the same id, discard a load when the root unmounts while loading, start a new load when the root mounts again after a dashboard-level failure, run the bindings in Loaded; and the failed start.
  - The cannot-be-shown state (the placeholder) at dashboard and cell level, with its developer-log diagnostic.

- **Out of scope**:
  - The dashboard type, the layout checks, cell placement, the unknown-`source` check and failure attribution (feature-dashboard-model); the runtime calls them.
  - The widget types and the `render_widget` action contract (feature-widget-contract).
  - The 9 catalog widget types (feature-widget-catalog).

- **Requirements Covered**:
  - [ ] `p1` - `cpt-frontx-dashboard-fr-dashboard-root` (mount and render runtime)
  - [ ] `p1` - `cpt-frontx-dashboard-fr-runtime-source`
  - [ ] `p1` - `cpt-frontx-dashboard-fr-per-cell-failure` (cell and larger-view placeholders)
  - [ ] `p1` - `cpt-frontx-dashboard-fr-states` (dashboard loader, cell loader, cannot-be-shown placeholders)
  - [ ] `p1` - `cpt-frontx-dashboard-fr-same-origin-data`
  - [ ] `p1` - `cpt-frontx-dashboard-fr-no-product-data-code`
  - [ ] `p1` - `cpt-frontx-dashboard-fr-shared-data` (send-once runner behavior)
  - [ ] `p1` - `cpt-frontx-dashboard-fr-static-data` (static evaluation)
  - [ ] `p1` - `cpt-frontx-dashboard-fr-larger-view`
  - [ ] `p1` - `cpt-frontx-dashboard-fr-theme` (root side: theme and language publishing, root chrome)
  - [ ] `p1` - `cpt-frontx-dashboard-fr-safe-mappings`
  - [ ] `p1` - `cpt-frontx-dashboard-fr-isolation`
  - [ ] `p2` - `cpt-frontx-dashboard-fr-accessibility` (root side: cell frame, larger-view overlay)
  - [ ] `p1` - `cpt-frontx-dashboard-nfr-initial-render`
  - [ ] `p1` - `cpt-frontx-dashboard-nfr-no-persistence`
  - [ ] `p1` - `cpt-frontx-dashboard-nfr-visual-quality` (root side: cell frame)
  - [ ] `p2` - `cpt-frontx-dashboard-nfr-accessibility` (root side: cell frame, larger-view overlay)
  - [ ] `p2` - `cpt-frontx-dashboard-usecase-view-dashboard`
  - [ ] `p2` - `cpt-frontx-dashboard-usecase-adopt-template` (runtime side: hosting the dashboard root)
  - [ ] `p1` - `cpt-frontx-dashboard-contract-host`
  - [ ] `p1` - `cpt-frontx-dashboard-contract-same-origin-api`
  - [ ] `p1` - `cpt-frontx-dashboard-contract-runtime-loaded-json` (the served GTS file)
  - [ ] `p2` - `cpt-frontx-dashboard-interface-host`

- **Design Principles Covered**:
  - [ ] `p2` - `cpt-frontx-dashboard-principle-render-only`
  - [ ] `p2` - `cpt-frontx-dashboard-principle-per-instance-isolation`

- **Design Constraints Covered**:
  - [ ] `p2` - `cpt-frontx-dashboard-constraint-same-origin-data`
  - [ ] `p2` - `cpt-frontx-dashboard-constraint-hosting-agnostic`
  - [ ] `p2` - `cpt-frontx-dashboard-constraint-one-gts-package`
  - [ ] `p2` - `cpt-frontx-dashboard-constraint-one-root-per-registry` (runtime side: one registry, one root)

- **Domain Model Entities**:
  - Widget extension (generated per cell/larger view)

- **Design Components**:

  - [ ] `p2` - `cpt-frontx-dashboard-component-dashboard-root` (runtime side)
  - [ ] `p2` - `cpt-frontx-dashboard-component-binding-runner`
  - [ ] `p3` - `cpt-frontx-dashboard-tech-dashboard-stack`

- **API**:
  - Registration of the `widgets` domain that feature-widget-contract declares.
  - The binding runner internal interface (parse, check, evaluate, convert to JSON).

- **Sequences**:

  - `cpt-frontx-dashboard-seq-runtime-flow`
  - `cpt-frontx-dashboard-seq-open-dashboard`
  - `cpt-frontx-dashboard-seq-open-larger-view`

- **Data**:
  - None (no database; `cpt-frontx-dashboard-db-none`).

### 2.3 Widget Contract - HIGH

- [ ] `p1` - **ID**: `cpt-frontx-dashboard-feature-widget-contract`

- **Purpose**: Give widget authors one stable contract to build and publish widgets against, so that any widget that follows it works in any dashboard without a change to the dashboard root.

- **Depends On**: None

- **Scope**:
  - The abstract widget base (`id`, `title?`, `render`) and the `entry` trait schema; the widget base carries the entry trait.
  - The abstract `data_widget` (required `data`, `data_type` trait); an abstract data_widget between the base and every data-taking type.
  - The abstract widget-data base.
  - The `render_widget` action type; the widget renders one action, including its own empty state.
  - The `widgets` domain instance and its extension type; the domain's theme and language shared properties are FrontX's, referenced by id.
  - The manifest of each widget bundle, one per widget type.
  - The id rules: the generated-extension id rule, the stamped-data id rule, and the UUIDv5 namespace constant they share.
  - The entry declaration (a plain FrontX `entry_mf` instance: `requiredProperties`, `actions`, `domainActions`, `manifest`, `exposedModule`; the FrontX manifest pipeline adds `exposeAssets` when the bundle is built, so authors never write it).
  - The widget-author obligations (renders `render` and `data`, makes no requests, theme mapping, ui-kit tokens, formats, text not markup, no cut-off, no meaning by colour alone, keyboard-operable).
  - The shared-dependency and budget rules (ADR-0010).
  - The request type, the render base and the value_format type (part of the bundle).
  - The adoption procedure in the widget-author guide, including the product developer's re-point of a template widget type to another entry in the product's copy of the served file.

- **Out of scope**:
  - The 9 concrete widget types and their render types/data shapes (feature-widget-catalog).
  - The runtime that sends `render_widget` (feature-dashboard-runtime).

- **Requirements Covered**:
  - [ ] `p1` - `cpt-frontx-dashboard-fr-add-fix-widget`
  - [ ] `p1` - `cpt-frontx-dashboard-fr-widget-catalog` (contract side)
  - [ ] `p2` - `cpt-frontx-dashboard-fr-author-guides` (widget-author guide, including the adoption procedure)
  - [ ] `p1` - `cpt-frontx-dashboard-interface-contract`
  - [ ] `p2` - `cpt-frontx-dashboard-interface-binding`
  - [ ] `p2` - `cpt-frontx-dashboard-interface-render-widget`
  - [ ] `p3` - `cpt-frontx-dashboard-nfr-bundle-budget` (shared-dependency and root budget rules)
  - [ ] `p2` - `cpt-frontx-dashboard-usecase-add-fix-widget` (contract side: the publish flow)
  - [ ] `p2` - `cpt-frontx-dashboard-usecase-adopt-template` (contract side: the adoption procedure in the widget-author guide and the re-point of a widget type's entry)

- **Design Principles Covered**:
  - [ ] `p2` - `cpt-frontx-dashboard-principle-open-bases-closed-leaves`
  - [ ] `p2` - `cpt-frontx-dashboard-principle-per-instance-isolation`

- **Design Constraints Covered**:
  - [ ] `p2` - `cpt-frontx-dashboard-constraint-one-gts-package`
  - [ ] `p2` - `cpt-frontx-dashboard-constraint-hosting-agnostic` (FrontX-only deps)
  - [ ] `p2` - `cpt-frontx-dashboard-constraint-one-root-per-registry` (contract side: the fixed `widgets` domain id)
  - [ ] `p2` - `cpt-frontx-dashboard-constraint-permissive-licences` (contract side: shared dependencies)

- **Domain Model Entities**:
  - Widget base (abstract, `entry` trait)
  - Data widget (abstract, `data`, `data_type` trait)
  - Widget data base (abstract)
  - Binding (a `oneOf` of three closed forms — own, shared, static — a closed sub-schema of `data_widget`)
  - MFE entry (plain FrontX instance)

- **Design Components**:

  - [ ] `p2` - `cpt-frontx-dashboard-component-widget-catalog` (contract side: bases, traits, entry declaration)

- **API**:
  - The `render_widget` action type.
  - The `widgets` domain instance and its extension type.
  - The widget base, `data_widget`, and widget-data base schemas.
  - The `entry` and `data_type` trait schemas.

- **Sequences**:
  - None in the DESIGN. The contract's one actor flow, `cpt-frontx-dashboard-flow-widget-contract-publish`, is defined in its FEATURE and has no DESIGN sequence.

- **Data**:
  - None (no database; `cpt-frontx-dashboard-db-none`).

### 2.4 Widget Catalog - HIGH

- [ ] `p1` - **ID**: `cpt-frontx-dashboard-feature-widget-catalog`

- **Purpose**: Give dashboard authors a ready set of widget types for common dashboard content, so that most dashboards need no new widget code.

- **Depends On**: `cpt-frontx-dashboard-feature-widget-contract`

- **Scope**:
  - The 9 v1 widget types: `summary_card`, `metric_card`, `ranked_list_card`, `progress_list_card`, `grid`, `cartesian_chart`, `pie_chart`, `heatmap`, `markdown_card`.
  - The final render schemas and data shapes per type are decided in the widget catalog FEATURE.
  - The grid row cap and page sizes are set in the widget catalog FEATURE; the grid sorts and pages client-side over the rows the transform delivered.
  - Markdown safety: CommonMark, HTML as text, links active only for `http`, `https`, `mailto` and relative targets and opened with no opener, images only from same-origin paths.
  - The type-specific rendering rules (grid table semantics with `aria-sort`, chart colours from ui-kit tokens, the chart data view, tooltip text, per-type formats, text alternatives for charts and the heatmap); each type applies the contract's widget-author obligations.
  - The catalog widget libraries: the ui-kit chart component with Recharts, the ui-kit DataGrid, markdown-it.

- **Out of scope**:
  - The bases and traits (feature-widget-contract).
  - The runtime (feature-dashboard-runtime).
  - New widget types defined by a product (out of scope for the template).

- **Requirements Covered**:
  - [ ] `p1` - `cpt-frontx-dashboard-fr-widget-catalog` (the 9 types)
  - [ ] `p1` - `cpt-frontx-dashboard-fr-grid-sort-page`
  - [ ] `p1` - `cpt-frontx-dashboard-fr-markdown-safety`
  - [ ] `p2` - `cpt-frontx-dashboard-fr-accessibility` (widget side: the 9 widget types)
  - [ ] `p1` - `cpt-frontx-dashboard-fr-theme` (widget side: scope mapping, chart themes)
  - [ ] `p1` - `cpt-frontx-dashboard-nfr-visual-quality` (widget side: the 9 widget types)
  - [ ] `p2` - `cpt-frontx-dashboard-nfr-accessibility` (widget side: the 9 widget types)
  - [ ] `p2` - `cpt-frontx-dashboard-nfr-large-table`
  - [ ] `p3` - `cpt-frontx-dashboard-nfr-bundle-budget` (per-widget entry size)
  - [ ] `p2` - `cpt-frontx-dashboard-usecase-add-fix-widget` (the 9 types a widget author ships)
  - [ ] `p2` - `cpt-frontx-dashboard-fr-author-guides` (dashboard-author guide)
  - [ ] `p2` - `cpt-frontx-dashboard-usecase-author-dashboard` (catalog side: the widget types an author picks, the dashboard-author guide)

- **Design Principles Covered**:
  - [ ] `p2` - `cpt-frontx-dashboard-principle-open-bases-closed-leaves` (each concrete type closes itself)
  - [ ] `p2` - `cpt-frontx-dashboard-principle-per-instance-isolation` (per-instance chart themes)

- **Design Constraints Covered**:
  - [ ] `p2` - `cpt-frontx-dashboard-constraint-one-gts-package`
  - [ ] `p2` - `cpt-frontx-dashboard-constraint-permissive-licences` (catalog side: the widget libraries)

- **Domain Model Entities**:
  - The 9 widget types (concrete derived types)
  - The 9 render types (one per widget type, derived from the render base)
  - The 8 data types (one per data widget type)
  - The 9 MFE entries

- **Design Components**:

  - [ ] `p2` - `cpt-frontx-dashboard-component-widget-catalog` (the 9 types, libraries, rendering rules)

- **API**:
  - The 9 widget type schemas and 8 data type schemas.

- **Sequences**:
  - None in the DESIGN. The catalog's one actor flow, `cpt-frontx-dashboard-flow-widget-catalog-grid-sort-page`, is defined in its FEATURE and has no DESIGN sequence; the runtime drives the dashboard flows.

- **Data**:
  - None (no database; `cpt-frontx-dashboard-db-none`).

---

## 3. Feature Dependencies

```text
cpt-frontx-dashboard-feature-widget-contract
    ↓
    ├─→ cpt-frontx-dashboard-feature-dashboard-model
    │       ↓
    │       └─→ cpt-frontx-dashboard-feature-dashboard-runtime
    ├─→ cpt-frontx-dashboard-feature-dashboard-runtime
    └─→ cpt-frontx-dashboard-feature-widget-catalog
```

**Dependency Rationale**:

- `cpt-frontx-dashboard-feature-dashboard-model` requires `cpt-frontx-dashboard-feature-widget-contract`: the dashboard schema refers to the contract's widget base for `widget` and `larger_view`, and to the contract's request type for the `requests` values.
- `cpt-frontx-dashboard-feature-dashboard-runtime` requires `cpt-frontx-dashboard-feature-dashboard-model`: the runtime registers the dashboard type and runs the layout checks, cell placement, the unknown-`source` check and failure attribution the model defines.
- `cpt-frontx-dashboard-feature-dashboard-runtime` requires `cpt-frontx-dashboard-feature-widget-contract`: the runtime registers the `widgets` domain, its extension type and the `render_widget` action the contract declares, runs the contract's binding forms, and applies its id rules.
- `cpt-frontx-dashboard-feature-widget-catalog` requires `cpt-frontx-dashboard-feature-widget-contract`: each of the 9 types derives from the widget base or `data_widget` and sets the `entry` and `data_type` traits the contract defines.
- The order of work is: the contract first, then the model; the runtime and the catalog are independent of each other and can be developed in parallel. The first checkable slice is the contract, the model, the runtime and the `markdown_card` type.
