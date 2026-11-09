---
status: accepted
version: 1
date: 2026-10-31
description: "Feature: the dashboard model - the dashboard GTS type with named shared requests, the inlined layout of cells with size and height classes of the ui-kit Grid, the layout checks and placement, per-cell failure attribution, and the cell load state."
---

# Feature: Dashboard Model

- [ ] `p1` - **ID**: `cpt-frontx-dashboard-featstatus-dashboard-model`

<!-- toc -->

- [1. Feature Context](#1-feature-context)
  - [1.1 Overview](#11-overview)
  - [1.2 Purpose](#12-purpose)
  - [1.3 Actors](#13-actors)
  - [1.4 References](#14-references)
- [2. Actor Flows (CDSL)](#2-actor-flows-cdsl)
  - [No actor flows](#no-actor-flows)
- [3. Processes / Business Logic (CDSL)](#3-processes--business-logic-cdsl)
  - [Check a layout](#check-a-layout)
  - [Place the cells](#place-the-cells)
  - [Check shared-request sources](#check-shared-request-sources)
  - [Attribute a failure](#attribute-a-failure)
- [4. States (CDSL)](#4-states-cdsl)
  - [Dashboard load state](#dashboard-load-state)
  - [Cell load state](#cell-load-state)
- [5. Definitions of Done](#5-definitions-of-done)
  - [Dashboard type and instances](#dashboard-type-and-instances)
  - [Layout checks](#layout-checks)
  - [Placement](#placement)
  - [Per-cell failure attribution](#per-cell-failure-attribution)
  - [Shared-request source check](#shared-request-source-check)
- [6. Domain Model](#6-domain-model)
  - [Dashboard type](#dashboard-type)
- [7. Acceptance Criteria](#7-acceptance-criteria)

<!-- /toc -->

## 1. Feature Context

- [ ] `p1` - `cpt-frontx-dashboard-feature-dashboard-model`

### 1.1 Overview

The dashboard GTS type, its instances, the inlined layout and its cells, each with a size class and a height class of the ui-kit Grid, the layout checks the root runs, the placement of cells on the Grid, per-cell failure attribution, and the cell load state. The dashboard type has an optional `requests` object of named shared requests, and a data widget's `data` is a `oneOf` of three closed forms (own, shared, static). This is the data a dashboard author writes and the root validates and places.

### 1.2 Purpose

A dashboard author writes one JSON: a title, an ordered list of cells, each with a size class and a height class, and in each cell a widget instance. The root validates the dashboard against its type and runs the layout checks before it mounts any cell; one pass reports the dashboard's root validation failures and its layout failures together. A failure of the dashboard itself, including an embedded widget that breaks the open widget base, is dashboard-level; a widget that fails its own registration against the type its `id` names gets a failed cell, so that failure affects only its cell or larger view. A cell whose `source` names no entry in `requests` is marked failed at cell scope before its binding runs.

**Requirements**: `cpt-frontx-dashboard-fr-dashboard-root`, `cpt-frontx-dashboard-fr-per-cell-failure`, `cpt-frontx-dashboard-fr-dashboard-as-json`, `cpt-frontx-dashboard-fr-shared-data`, `cpt-frontx-dashboard-fr-static-data`, `cpt-frontx-dashboard-fr-states`.

**Use cases**: `cpt-frontx-dashboard-usecase-author-dashboard` (the dashboard JSON an author writes).

**Principles**: `cpt-frontx-dashboard-principle-open-bases-closed-leaves`.

**Constraints**: `cpt-frontx-dashboard-constraint-size-class-grid`, `cpt-frontx-dashboard-constraint-one-gts-package`, `cpt-frontx-dashboard-constraint-same-origin-data`.

**Not applicable**: persistence/DB (no database, `cpt-frontx-dashboard-db-none`), auth/security (sign-in out of scope), ops/rollout (no deployed service), compliance/privacy (no data stored).

### 1.3 Actors

|| Actor | Role in Feature |
||-------|-----------------|
|| `cpt-frontx-dashboard-actor-dashboard-author` | Writes the dashboard JSON (by hand or generated). |
|| `cpt-frontx-dashboard-actor-dashboard-viewer` | Sees the dashboard or its cannot-be-shown state. |

### 1.4 References

- **PRD**: [PRD.md](../../PRD.md)
- **Design**: [DESIGN.md](../../DESIGN.md) (§3.1 Domain Model, §3.6 Runtime Flow load step and per-cell step)
- **Dependencies**: `cpt-frontx-dashboard-feature-widget-contract` (the dashboard schema `$ref`s the widget base and the request type that the widget contract declares)

## 2. Actor Flows (CDSL)

This feature has no actor flows of its own; the dashboard runtime drives the load and layout-check steps (see `cpt-frontx-dashboard-feature-dashboard-runtime`, flow `cpt-frontx-dashboard-flow-dashboard-runtime-open`). The model defines the data and the checks the runtime calls.

### No actor flows

Not applicable because the dashboard runtime drives the load and layout-check steps; the model defines only the data and the checks the runtime calls, with no actor flow of its own.

## 3. Processes / Business Logic (CDSL)

### Check a layout

- [ ] `p2` - **ID**: `cpt-frontx-dashboard-algo-dashboard-model-layout-checks`

**Input**: the dashboard's layout, after the GTS validation of the dashboard, with the cell failures that validation reported for the cells of the layout (any GTS failure whose instance path lies under a cell but not under its `widget` or `larger_view`, such as a missing `widget`, or a `size` or `height` outside its values).

**Output**: pass, or the failures of one pass, each naming its cells by zero-based index in `cells`. The diagnostics go to the developer log.

**Steps**:
1. [ ] - `p1` - **IF** the GTS validation reported a cell failure for any cell, **RETURN** failure naming each such cell by its index as a cell failure. The check below runs only on a layout whose cells have no cell failure. - `inst-dm-check-cell-failures`
2. [ ] - `p1` - Collect the `id` of every cell widget and every larger-view widget. A widget without a string `id` takes no part: the dashboard validation reports it, at dashboard level. - `inst-dm-check-ids`
3. [ ] - `p1` - **FOR EACH** `id` that occurs more than once, add a failure naming every cell that carries it and whether the `id` is on its cell widget or its larger-view widget. - `inst-dm-check-repeat`
4. [ ] - `p1` - **IF** the list of failures is not empty, **RETURN** failure with all of them. Otherwise **RETURN** pass. An empty `cells` array passes: no cell is rendered and no placeholder is shown. - `inst-dm-check-return`

The layout holds no position, so cells cannot overlap or lie outside the grid: the ui-kit Grid places every cell (ADR-0002). A widget id must be unique because every GTS instance id is unique and the Grid keys each item by its widget id.

Each failure is reported once. A non-empty failure list is a dashboard-level failure: the dashboard shows the cannot-be-shown state and no cell is mounted. One pass reports the dashboard's root validation failures and its layout failures together.

### Place the cells

- [ ] `p2` - **ID**: `cpt-frontx-dashboard-algo-dashboard-model-place-cells`

**Input**: a layout that passed `cpt-frontx-dashboard-algo-dashboard-model-layout-checks`.

**Output**: one ui-kit Grid in which each cell widget occupies one Grid item.

**Steps**:
1. [ ] - `p1` - Make one ui-kit `Grid` with the kit's default config (`defaultGridConfig`), flexible when the layout's `flexible` is `true` or absent. - `inst-dm-place-grid`
2. [ ] - `p1` - **FOR EACH** cell in `cells`, in order - `inst-dm-place-each`
   1. [ ] - `p1` - Place the cell widget, in its cell frame, in one direct `GridItem` whose `layoutId` is the widget's `id`, whose `size` is the cell's `size` and whose `height` is the cell's `height`, `low` when absent. - `inst-dm-place-cell`
   2. [ ] - `p1` - Do not place the larger-view widget: it shows only in the larger view. - `inst-dm-place-larger`
3. [ ] - `p1` - Keep the cells in the order of `cells`. The Grid keeps the DOM, reading and keyboard order equal to that order at every width (ADR-0002). - `inst-dm-place-order`
4. [ ] - `p1` - **RETURN**. The root computes no span, column or row: the Grid picks each span from the cell's size class at the width of the dashboard area. - `inst-dm-place-return`

### Check shared-request sources

- [ ] `p2` - **ID**: `cpt-frontx-dashboard-algo-dashboard-model-check-sources`

**Input**: the dashboard's `requests` and the `source` references of every cell and larger-view binding.

**Output**: each cell or larger view whose `source` names no entry in `requests`, marked failed at cell scope before its binding runs.

**Steps**:
1. [ ] - `p1` - Collect the names in the dashboard's `requests` (absent means none). - `inst-dm-src-names`
2. [ ] - `p1` - **FOR EACH** `source` reference across all cell and larger-view bindings - `inst-dm-src-each`
   1. [ ] - `p1` - **IF** `source` names no entry in `requests`, mark that cell or larger view failed at cell scope, before its binding runs: no request is sent and no transform is evaluated for it. - `inst-dm-src-unknown`
3. [ ] - `p1` - **RETURN**. The runtime runs this check after the layout checks, as a separate step; it is not a layout failure and the other cells are unaffected. - `inst-dm-src-return`

### Attribute a failure

- [ ] `p2` - **ID**: `cpt-frontx-dashboard-algo-dashboard-model-failure-attribution`

**Input**: the step that failed (file fetch, type rejection, dashboard validation, layout check, widget registration, trait resolution, request, transform, data validation, mount, `render_widget`) and, for a dashboard validation failure, its instance path.

**Output**: the scope the failure affects (dashboard or a single cell/larger view).

**Steps**:
1. [ ] - `p1` - **IF** the failure is a dashboard validation failure whose instance path lies under `layout.cells[i].widget` or `layout.cells[i].larger_view` - `inst-dm-fail-embedded`
   1. [ ] - `p1` - **RETURN** dashboard scope. Registering the dashboard instance checks each embedded widget only against the open widget base, so an embedded widget that breaks the base, such as one with no `id`, fails the whole dashboard. - `inst-dm-fail-embedded-return`
2. [ ] - `p1` - **IF** the failure is a file-fetch failure, a type rejection, any other dashboard validation failure, or a layout check failure - `inst-dm-fail-dashboard`
   1. [ ] - `p1` - **RETURN** dashboard scope. A validation failure under `layout.cells[i]` but not under its `widget` or `larger_view` is a cell failure that the layout check collects (`inst-dm-check-cell-failures`); a validation failure anywhere else, such as a missing `title` or an invalid `requests` name, fails the dashboard itself. - `inst-dm-fail-dashboard-return`
3. [ ] - `p1` - **ELSE** the failure is a failure of the widget's own registration against the type its `id` names, an unresolved trait or a missing `entry` or `data_type`, or a request, transform, data validation, mount or `render_widget` failure - `inst-dm-fail-cell`
   1. [ ] - `p1` - **RETURN** the scope of that cell for its `widget`, or of its larger view for its `larger_view`. - `inst-dm-fail-cell-return`

A dashboard-scope failure shows the dashboard-level cannot-be-shown state and mounts no cell. A cell-scope failure shows the cell's cannot-be-shown state; a failure affects only its cell or larger view, so the other cells are unaffected.

## 4. States (CDSL)

### Dashboard load state

- [ ] `p2` - **ID**: `cpt-frontx-dashboard-state-dashboard-model-load`

**States**: `loading`, `shown`, `cannot-be-shown`

**Initial State**: `loading`

**Transitions**:
1. [ ] - `p1` - **FROM** `loading` **TO** `shown` **WHEN** the dashboard has no validation failure and the layout checks pass; a widget that later fails its own registration against the type its `id` names fails only that cell or larger view. - `inst-dm-state-shown`
2. [ ] - `p1` - **FROM** `loading` **TO** `cannot-be-shown` **WHEN** the file can't be fetched, a type is rejected, the dashboard fails validation (including an embedded widget that breaks the open widget base), or the layout checks fail. - `inst-dm-state-cannot`

### Cell load state

A cell's own state machine belongs to the runtime (`cpt-frontx-dashboard-state-dashboard-runtime-cell`). The model contributes the failures it attributes to a cell (`cpt-frontx-dashboard-algo-dashboard-model-failure-attribution`) and the unknown-`source` check.

## 5. Definitions of Done

### Dashboard type and instances

- [ ] `p1` - **ID**: `cpt-frontx-dashboard-dod-dashboard-model-type`

The system **MUST** ship the dashboard GTS type `gts.frontx.dashboard.dashboard.dashboard.v1~` under the `dashboard` package, with a `title`, an optional `description`, an optional `requests` object (a name matching `^[a-z][a-z0-9_]{0,63}$` maps to a request of the request type `gts.frontx.dashboard.widget.request.v1~`, declared in `cpt-frontx-dashboard-feature-widget-contract`), and an inlined `layout` with an ordered array of closed cell objects (`size`, optional `height`, `widget`, optional `larger_view`) and an optional `flexible` flag. The `id` field names its base type as a literal operand. The type is closed with `unevaluatedProperties: false`, so a dashboard with any other field, such as `theme`, fails validation; there is no column, row or pixel field, the ui-kit Grid placing every cell. The full schema is in section 6. A data widget's `data` is a `oneOf` of three closed forms (own, shared, static). The dashboard embeds widget instances, each registered on its own by the runtime.

**Implements**: `cpt-frontx-dashboard-fr-dashboard-as-json`, `cpt-frontx-dashboard-fr-shared-data`, `cpt-frontx-dashboard-fr-static-data`.

**Constraints**: `cpt-frontx-dashboard-constraint-one-gts-package`, `cpt-frontx-dashboard-constraint-same-origin-data`.

**Covers (DESIGN)**: `cpt-frontx-dashboard-principle-open-bases-closed-leaves`, `cpt-frontx-dashboard-component-dashboard-root` (model side: the dashboard type).

**Touches**:
- Entities: Dashboard, Cell, Widget instance, Named shared request (dashboard `requests` values)

### Layout checks

- [ ] `p1` - **ID**: `cpt-frontx-dashboard-dod-dashboard-model-layout-checks`

The root **MUST** run the layout checks (`cpt-frontx-dashboard-algo-dashboard-model-layout-checks`) on every dashboard load and reject the whole dashboard when any check fails. Cell failures (a missing `widget`, or a `size` or `height` outside its values) come first; the repeated-`id` check runs only when no cell has a cell failure. One pass reports the dashboard's root validation failures and its layout failures together.

**Implements**: `cpt-frontx-dashboard-algo-dashboard-model-layout-checks`, `cpt-frontx-dashboard-fr-per-cell-failure`.

**Constraints**: `cpt-frontx-dashboard-constraint-size-class-grid`.

**Covers (DESIGN)**: `cpt-frontx-dashboard-component-dashboard-root` (model side: the layout checks), `cpt-frontx-dashboard-seq-runtime-flow` (load and layout-check steps).

**Touches**:
- Entities: Dashboard, Cell

### Placement

- [ ] `p1` - **ID**: `cpt-frontx-dashboard-dod-dashboard-model-placement`

The root **MUST** place the cells of a valid layout on one ui-kit Grid with the kit's default config (`cpt-frontx-dashboard-algo-dashboard-model-place-cells`): each cell is one Grid item with its widget id as `layoutId` and its `size` and `height`, the Grid is flexible unless the layout's `flexible` is `false`, the larger-view widget is never placed on the grid, and the root computes no span, column or row. Cells are read and reached by keyboard in the order of `cells`.

**Implements**: `cpt-frontx-dashboard-algo-dashboard-model-place-cells`.

**Constraints**: `cpt-frontx-dashboard-constraint-size-class-grid`.

**Touches**:
- Entities: Cell

### Per-cell failure attribution

- [ ] `p1` - **ID**: `cpt-frontx-dashboard-dod-dashboard-model-attribution`

The root **MUST** attribute each failure to its scope (`cpt-frontx-dashboard-algo-dashboard-model-failure-attribution`): dashboard-level or a single cell/larger view. Every dashboard validation failure is dashboard scope, including one whose instance path lies under a cell's `widget` or `larger_view`, because registering the dashboard checks embedded widgets only against the open widget base. Only a failure at the widget's own registration against the type its `id` names, or a later trait, entry, data type, request, transform, data validation, mount or `render_widget` failure, is cell (or larger-view) scope.

**Implements**: `cpt-frontx-dashboard-algo-dashboard-model-failure-attribution`, `cpt-frontx-dashboard-fr-per-cell-failure`.

**Covers (DESIGN)**: `cpt-frontx-dashboard-component-dashboard-root` (model side: failure attribution), `cpt-frontx-dashboard-seq-runtime-flow` (load step and per-cell step).

**Touches**:
- Entities: Dashboard, Cell

### Shared-request source check

- [ ] `p1` - **ID**: `cpt-frontx-dashboard-dod-dashboard-model-sources`

The root **MUST** check, after the layout checks, that every `source` reference names an entry in the dashboard's `requests` (`cpt-frontx-dashboard-algo-dashboard-model-check-sources`), and mark each cell or larger view whose `source` is unknown failed at cell scope before its binding runs.

**Implements**: `cpt-frontx-dashboard-algo-dashboard-model-check-sources`, `cpt-frontx-dashboard-fr-shared-data`.

**Constraints**: `cpt-frontx-dashboard-constraint-same-origin-data`.

**Touches**:
- Entities: Dashboard, Cell, Named shared request

## 6. Domain Model

The dashboard type is a GTS type. The layout and the cell are inlined closed subschemas of the dashboard, not GTS types of their own: they declare no `$id`, `$schema` or `title`, and are not independently addressable. The `widget` and `larger_view` fields `$ref` the widget base `gts://gts.frontx.dashboard.widget.widget.v1~`, declared in `cpt-frontx-dashboard-feature-widget-contract`.

### Dashboard type

**GTS ID**: `gts.frontx.dashboard.dashboard.dashboard.v1~`

**Description**: Top-level container of a dashboard. A Dashboard instance is one dashboard as the dashboard author writes or generates it; authoring is out of scope for the template. The dashboard carries no widget data and no theme: each data widget asks for its data through its binding, and the dashboard follows the host theme. The dashboard is structured as `id`, `title`, an optional `description`, an optional `requests` object of named shared requests, and the inlined `layout` of cells, each with a size class and a height class of the ui-kit Grid and each embedding one widget instance.

**Schema**:

```json
{
  "$id": "gts://gts.frontx.dashboard.dashboard.dashboard.v1~",
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "title": "Dashboard",
  "description": "Top-level container of a dashboard: identifier, title, optional description, optional named shared requests, and the embedded layout of cells on the ui-kit Grid.",
  "type": "object",
  "required": ["id", "title", "layout"],
  "properties": {
    "id": {
      "type": "string",
      "x-gts-instance-ref": "gts.frontx.dashboard.dashboard.dashboard.v1~",
      "description": "Combined anonymous instance identifier: the dashboard type chain followed by a lowercase UUID, for example gts.frontx.dashboard.dashboard.dashboard.v1~<uuid>. No separate type field exists; the base operand is a literal, never /$id."
    },
    "title": {
      "type": "string",
      "description": "Human-readable dashboard title."
    },
    "description": {
      "type": "string",
      "description": "Optional longer description of the dashboard purpose."
    },
    "requests": {
      "type": "object",
      "description": "Optional named shared requests. A shared-form binding names one of these in its source. Each name matches ^[a-z][a-z0-9_]{0,63}$ and maps to a request of the request type. Plain data, not GTS instances.",
      "propertyNames": { "pattern": "^[a-z][a-z0-9_]{0,63}$" },
      "additionalProperties": { "$ref": "gts://gts.frontx.dashboard.widget.request.v1~" }
    },
    "layout": { "$ref": "#/$defs/layout" }
  },
  "unevaluatedProperties": false,
  "$defs": {
    "layout": {
      "type": "object",
      "description": "Layout embedded in a Dashboard: an ordered array of cells, placed by the ui-kit Grid in this order. Inlined as the Dashboard layout property; not a GTS type and not independently addressable.",
      "required": ["cells"],
      "properties": {
        "cells": {
          "type": "array",
          "description": "Ordered array of layout cells, in reading and keyboard order. May be empty; an empty array renders nothing and shows no placeholder.",
          "items": { "$ref": "#/$defs/cell" }
        },
        "flexible": {
          "type": "boolean",
          "default": true,
          "description": "Whether spans may move inside each size class's range to fill rows (the ui-kit Grid's flexible mode). Without it, true."
        }
      },
      "unevaluatedProperties": false
    },
    "cell": {
      "type": "object",
      "description": "Embedded cell within a Layout: its size class and height class on the ui-kit Grid, the widget it renders, and an optional widget for its larger view. Inlined as each item of the layout cells array; not a GTS type and not independently addressable.",
      "required": ["size", "widget"],
      "properties": {
        "size": {
          "enum": ["small", "medium", "large"],
          "description": "Size class of the cell on the ui-kit Grid. The Grid picks the span from it at the width of the dashboard area."
        },
        "height": {
          "enum": ["low", "high"],
          "default": "low",
          "description": "Height class of the cell: low is one row track, high is two row tracks and the gap between them. Without it, low."
        },
        "widget": {
          "$ref": "gts://gts.frontx.dashboard.widget.widget.v1~",
          "description": "The widget rendered in this cell, embedded inline. It is registered on its own against the widget type that its id names. A data widget carries its own embedded binding in data."
        },
        "larger_view": {
          "$ref": "gts://gts.frontx.dashboard.widget.widget.v1~",
          "description": "Optional widget shown in the larger view of this cell, embedded inline and registered on its own. It is a second widget instance with its own id. When it is absent, the cell hides its larger-view button."
        }
      },
      "unevaluatedProperties": false
    }
  }
}
```

**Cross-references**:
- No abstract base (flat single-segment chain). The type is closed: no field other than the declared ones is accepted, so a dashboard with an extra field such as `theme` fails validation at the dashboard level.
- Related types: the widget base `gts.frontx.dashboard.widget.widget.v1~` (`cpt-frontx-dashboard-feature-widget-contract`), embedded inline through `$ref` in each cell's `widget` and `larger_view`.
- The layout and cell are inlined in the dashboard as `$defs.layout` and `$defs.cell`; they are not GTS types and carry no `$id`, `$schema` or `title` of their own. Both are closed. A cell names a `size` (`small`, `medium` or `large`) and an optional `height` (`low` or `high`, `low` when absent); the layout has an optional `flexible` flag, `true` when absent. There is no column, row or pixel field.
- Each `requests` value is a request of the request type `gts.frontx.dashboard.widget.request.v1~` (`cpt-frontx-dashboard-feature-widget-contract`), the same type an own binding's `request` uses.
- Widget validation: the dashboard validation checks each embedded widget only against the open widget base; a widget that breaks the base, such as one with no `id`, fails the dashboard. Each embedded widget is then registered on its own and validated against the type that its `id` names, as part of the dashboard load; a failure there is a widget-level failure of that cell or larger view, not a layout failure.
- Layout checks: the `size` and `height` values in this schema are checked by the GTS validation of the dashboard, and the layout checks of section 3 run after them.

## 7. Acceptance Criteria

- [ ] The Dashboard, Layout and Cell schemas are authored with their full JSON Schema declarations.
- [ ] The Dashboard passes GTS identifier grammar and GTS v0.17 schema validation, including the literal base operand of `id`; the inlined Layout and Cell subschemas are valid JSON Schema 2020-12.
- [ ] The Dashboard type identifier ends with `~`, every instance identifier does not, and every identifier carries `v1`.
- [ ] `cfs validate --artifact` on this file reports PASS.
- [ ] The Dashboard schema requires `id`, `title` and `layout`, declares only `id`, `title`, `description`, `requests` and `layout`, is closed with `unevaluatedProperties: false`, and declares no `theme`, `report`, `columns` or position field; the ui-kit Grid places every cell.
- [ ] A dashboard with an extra field such as `theme` fails validation, and the failure is dashboard-level.
- [ ] No field of the layout or a cell is changed in the browser; the rendered dashboard matches the provided layout.
- [ ] A cell with no `widget`, or whose `size` or `height` is not one of its values, fails the GTS validation of the dashboard, and the failure is a cell failure, collected once by the layout check, that names the cell; it is not also collected as an invalid root.
- [ ] A layout with a repeated widget id fails the layout checks: no cells are rendered and the dashboard shows the cannot-be-shown state.
- [ ] Given a layout in which the cell at index 2 has a `size` of `huge`, when the layout is validated and checked, then the failure names cell index 2 as a cell failure and no cells are rendered.
- [ ] Given a layout with one cell that has a cell failure and two other cells that carry the same widget id, when the layout is checked, then only the cell failure is named at its index, because the id check runs only on a layout whose cells have no cell failure; when the cell failure is removed, the repeated id is named with both cells.
- [ ] Given a cell with a coordinate field such as `x`, when the dashboard is validated, then the cell has a cell failure and the failure names it.
- [ ] Given a layout in which the `larger_view` widget of cell 0 and the `widget` of cell 2 carry the same id, when the layout is checked, then no cells are rendered and the failure names both.
- [ ] Given a cell whose `widget` and `larger_view` carry the same id, when the layout is checked, then the failure names that cell, for both roles.
- [ ] Given two cells whose `widget` ids are the same, when the layout is checked, then the failure names both cells.
- [ ] Given a layout with an empty `cells` array, when the layout is checked, then the layout is valid, no cell is rendered, and no placeholder is shown.
- [ ] A cell embeds one widget and an optional `larger_view`; a data widget carries its own embedded binding in `data`, and the cell carries no widget data.
- [ ] A cell without `larger_view` is valid, and its cell widget hides the larger-view button.
- [ ] The root resolves the embedded widget of a cell and its larger-view widget to the widget type that each `id` names, with no custom validation code; a failure at a widget's own registration against that type is a widget-level failure of that cell or larger view, not a layout failure, and an embedded widget that breaks the open widget base fails the dashboard.
- [ ] Given a valid cell with `size` `medium` and `height` `high`, when the root places it, then it is one item of the ui-kit Grid with its widget id as `layoutId`, size class `medium` and height class `high`; the larger-view widget is not placed on the grid.
- [ ] Given three cells, when the root places them, then the Grid items, and with them the reading and keyboard order, follow the order of `cells` at every width of the dashboard area.
- [ ] Given a layout without `flexible`, when the root places it, then the Grid is flexible; given `flexible` of `false`, then every cell takes its size class's preferred span.
- [ ] The Dashboard, Layout and Cell schemas are each closed with `unevaluatedProperties: false`, so a dashboard, layout or cell with any other field fails the validation of the dashboard.
- [ ] The Layout is inlined in the Dashboard and declares no `$id` or `title`; no layout reference or separate layout type exists.
- [ ] A dashboard missing `title` whose layout also has a cell with a `size` outside its values yields one pass that names both failures together, each by its instance path or its cell.
- [ ] A widget that fails its own registration against the type its `id` names fails only its cell (or its larger view for a `larger_view` widget); the other cells are unaffected.
- [ ] A cell or larger view whose `source` names no entry in the dashboard's `requests` is marked failed at cell scope before its binding runs; the other cells are unaffected.
- [ ] Given a dashboard whose `requests` has an entry named `Bad-Name`, when the dashboard is validated, then the validation fails and the failure is dashboard-level: no cell is mounted.
- [ ] Given a cell whose `larger_view` binding has a `source` that names no entry in `requests`, when the dashboard loads, then only that larger view is failed at cell scope; the cell widget and the other cells are unaffected.
- [ ] Given a dashboard with no `requests` object and a cell whose binding has a `source`, when the dashboard loads, then that cell is failed at cell scope and the other cells are unaffected.
- [ ] Given any of the unknown-`source` cases above, when the dashboard loads, then no request is sent and no transform is evaluated for the failed cell or larger view.
- [ ] Given (a) a dashboard missing `title`, (b) a cell whose embedded `widget` has no `id`, (c) a cell with a `size` of `huge`, and (d) a cell whose embedded `widget` has a `render` field its concrete type does not allow, when each failure is attributed, then (a) and (b) are dashboard scope, (c) is a cell failure collected by the layout check, which makes the dashboard fail at dashboard level, and (d) is the scope of that cell only.
- [ ] The frame shows a loader at mount only for the own and shared forms; a static binding starts without a loader and ends `shown` or `cannot-be-shown`; an empty result is shown by the widget's own empty state.
