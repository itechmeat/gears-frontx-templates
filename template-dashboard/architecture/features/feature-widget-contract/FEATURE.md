---
status: accepted
version: 1
date: 2026-10-31
description: "Feature: the widget contract: the widget base and its entry trait, the render base, data_widget with the binding, value_format and data_type trait, the value_format type, the request type, the widget-data base, the render_widget action, the widgets extension type and domain instance, the theme and language shared properties, the widgets manifest, the entry declaration, generated extension id derivation, widget-author obligations, and shared-dependency and budget rules."
---

# Feature: Widget Contract

- [ ] `p1` - **ID**: `cpt-frontx-dashboard-featstatus-widget-contract`

<!-- toc -->

- [1. Feature Context](#1-feature-context)
  - [1.1 Overview](#11-overview)
  - [1.2 Purpose](#12-purpose)
  - [1.3 Actors](#13-actors)
  - [1.4 References](#14-references)
- [2. Actor Flows (CDSL)](#2-actor-flows-cdsl)
  - [Ship or fix a widget type](#ship-or-fix-a-widget-type)
- [3. Processes / Business Logic (CDSL)](#3-processes--business-logic-cdsl)
  - [Resolve effective traits](#resolve-effective-traits)
  - [Validate a widget instance](#validate-a-widget-instance)
- [4. States (CDSL)](#4-states-cdsl)
  - [No lifecycle states](#no-lifecycle-states)
- [5. Definitions of Done](#5-definitions-of-done)
  - [Widget base and entry trait](#widget-base-and-entry-trait)
  - [data_widget and data_type trait](#data_widget-and-data_type-trait)
  - [Request type](#request-type)
  - [Widget-data base and stamped data](#widget-data-base-and-stamped-data)
  - [render_widget action](#render_widget-action)
  - [widgets extension type](#widgets-extension-type)
  - [widgets domain instance](#widgets-domain-instance)
  - [Generated extension instance](#generated-extension-instance)
  - [Theme and language shared properties](#theme-and-language-shared-properties)
  - [Entry declaration](#entry-declaration)
  - [Widgets manifest](#widgets-manifest)
  - [Widget-author obligations](#widget-author-obligations)
  - [Shared dependencies and budget](#shared-dependencies-and-budget)
  - [Publishing and rollback](#publishing-and-rollback)
  - [Widget-author guide](#widget-author-guide)
- [6. Acceptance Criteria](#6-acceptance-criteria)

<!-- /toc -->

## 1. Feature Context

- [ ] `p1` - `cpt-frontx-dashboard-feature-widget-contract`

### 1.1 Overview

The contract a widget author writes against: the abstract widget base and its `entry` trait, the render base, the abstract `data_widget` and its `data_type` trait, the value_format type, the request type, the widget-data base, the `render_widget` action, the `widgets` domain extension type and domain instance, the theme and language shared properties, the widgets manifest, the entry declaration (a plain FrontX `entry_mf` instance), generated extension id derivation, the widget-author obligations, and the shared-dependency and budget rules.

### 1.2 Purpose

A widget author derives a widget type from `data_widget` (or the widget base for a type with no data), closes `render` with its own render type, derived from the render base and referred to by `$ref` (a product's own widget type may instead narrow and close `render` inline), sets the `entry` and `data_type` traits, and builds a FrontX MFE entry. A product changes which entry a template widget type points to by setting a different `entry` in its copy of the served file. The root resolves effective traits itself, since FrontX exposes no traits API.

**Requirements**: `cpt-frontx-dashboard-fr-add-fix-widget`, `cpt-frontx-dashboard-fr-widget-catalog` (contract side), `cpt-frontx-dashboard-fr-author-guides` (widget-author guide), `cpt-frontx-dashboard-interface-contract`, `cpt-frontx-dashboard-interface-binding`, `cpt-frontx-dashboard-interface-render-widget`, `cpt-frontx-dashboard-nfr-bundle-budget`.

**Use cases**: `cpt-frontx-dashboard-usecase-add-fix-widget` (the publish flow), `cpt-frontx-dashboard-usecase-adopt-template` (contract side: the contract a product builds on).

**Principles**: `cpt-frontx-dashboard-principle-open-bases-closed-leaves`, `cpt-frontx-dashboard-principle-per-instance-isolation`.

**Constraints**: `cpt-frontx-dashboard-constraint-one-gts-package`, `cpt-frontx-dashboard-constraint-hosting-agnostic` (FrontX-only deps), `cpt-frontx-dashboard-constraint-one-root-per-registry` (fixed `widgets` domain id), `cpt-frontx-dashboard-constraint-permissive-licences` (shared dependencies).

**Components**: `cpt-frontx-dashboard-component-widget-catalog` (contract side: bases, traits, entry declaration).

**Not applicable**: persistence/DB (no database, `cpt-frontx-dashboard-db-none`), auth/security (sign-in out of scope; the contract is data), compliance/privacy (no data stored; the contract is data), reliability (static data; the runtime owns timeouts and recovery), user-experience flows (the runtime owns loading, feedback and cannot-be-shown states; the catalog owns presentation), performance beyond the download budgets (the runtime owns render budgets). Ops/rollout applies only to publishing a widget: `cpt-frontx-dashboard-dod-widget-contract-publish` states the publish order and the rollback.

### 1.3 Actors

| Actor | Role in Feature |
|-------|-----------------|
| `cpt-frontx-dashboard-actor-widget-author` | Derives a widget type, sets traits, builds an entry, follows the obligations. |
| `cpt-frontx-dashboard-actor-product-developer` | Points a template widget type to a different entry in the product's copy of the served file. |

### 1.4 References

- **PRD**: [PRD.md](../../PRD.md)
- **Design**: [DESIGN.md](../../DESIGN.md) (§3.1 Domain Model, §3.3 API Contracts)
- **Dependencies**: None (foundation feature; the dashboard model, the runtime and the catalog depend on it)

## 2. Actor Flows (CDSL)

**Use cases**: `cpt-frontx-dashboard-usecase-add-fix-widget`.

### Ship or fix a widget type

- [ ] `p2` - **ID**: `cpt-frontx-dashboard-flow-widget-contract-publish`

**Actor**: `cpt-frontx-dashboard-actor-widget-author`

**Success Scenarios**:
- The widget author ships a new widget type; existing dashboards can use it at once, with no product redeploy.
- The widget author ships a fix under the same widget type; it shows on the next page load, with no product redeploy.
- The product developer points a template widget type to a different entry in the product's copy of the served file; that entry mounts on the next page load, with no template change.

**Error Scenarios**:
- A type id of the base file (the whole file when it is served joined) equals a bundle base: the whole served file is rejected and nothing registers. A widget part with such a type is left out on its own, and only the cells whose widget type names an entry it failed to bring fail.
- The registry rejects a served type, manifest or entry: every dashboard in the served file fails. In a file served in parts this holds for the base file; a widget part with a rejected item is left out, and only the cells whose widget type names an entry it failed to bring fail.
- A widget instance is rejected at its own registration against the type its `id` names, an effective trait is unset, or its `entry` or `data_type` does not exist: only that cell fails, or only that larger view for a `larger_view` instance.

**Steps**:
1. [ ] - `p1` - The widget author deploys the MFE build of the widget. - `inst-wc-pub-deploy`
2. [ ] - `p1` - The widget author adds the widget type, its data type, the entry and the manifest to the served GTS file. For a fix, the widget author keeps the widget type and replaces its entry or MFE build. - `inst-wc-pub-add`
3. [ ] - `p1` - **IF** the change is incompatible with the widget type's `render` or data schema - `inst-wc-pub-incompatible`
   1. [ ] - `p1` - The widget author ships it as a new widget type version instead of a fix. - `inst-wc-pub-incompatible-version`
4. [ ] - `p1` - **IF** the product developer points a template widget type to a different entry - `inst-wc-pub-repoint`
   1. [ ] - `p1` - The product developer deploys the MFE build of that entry, adds the entry and its manifest to the product's copy of the served file, and sets that entry as the widget type's `entry` in that copy; the template is not changed, and the entry accepts the type's `render` and data schemas. - `inst-wc-pub-repoint-set`
5. [ ] - `p1` - On the next page load, the root loads the served file and registers the types, the manifest and the entry (`cpt-frontx-dashboard-flow-dashboard-runtime-open`). - `inst-wc-pub-load`
6. [ ] - `p1` - **IF** a served type id equals a bundle base, or the registry rejects a served type, manifest or entry - `inst-wc-pub-file-fail`
   1. [ ] - `p1` - **RETURN** a dashboard-level failure for every dashboard in the served file; when the file is served in parts and the item is in a widget part, leave out that part and fail only the cells whose widget type names an entry it failed to bring (`cpt-frontx-dashboard-algo-dashboard-runtime-load-file`). - `inst-wc-pub-file-fail-return`
7. [ ] - `p1` - The root validates each widget instance (`cpt-frontx-dashboard-algo-widget-contract-validate-instance`). - `inst-wc-pub-validate`
8. [ ] - `p1` - **IF** a widget instance fails validation - `inst-wc-pub-cell-fail`
   1. [ ] - `p1` - **RETURN** a failure of only that cell, or of only that larger view for a `larger_view` instance. - `inst-wc-pub-cell-fail-return`
9. [ ] - `p1` - **RETURN** the widget type usable by every dashboard in the served file, with no product redeploy. - `inst-wc-pub-return`

## 3. Processes / Business Logic (CDSL)

### Resolve effective traits

- [ ] `p2` - **ID**: `cpt-frontx-dashboard-algo-widget-contract-effective-traits`

**Input**: a widget type id (a type chain).

**Output**: the effective traits for that type.

**Steps**:
1. [ ] - `p1` - Walk the type's `$id` chain from root to leaf, fetching each schema with `getSchema`. - `inst-wc-trait-walk`
2. [ ] - `p1` - **IF** any schema along the chain is missing - `inst-wc-trait-missing-schema`
   1. [ ] - `p1` - **RETURN** a validation failure (never a partial result). - `inst-wc-trait-missing-schema-return`
3. [ ] - `p1` - Collect each schema's `x-gts-traits-schema` along the chain. - `inst-wc-trait-collect`
4. [ ] - `p1` - Merge the trait schemas along the chain. - `inst-wc-trait-merge-schema`
5. [ ] - `p1` - Merge the trait values (`x-gts-traits`) root to leaf (RFC 7396). - `inst-wc-trait-merge-values`
6. [ ] - `p1` - Fill the `default` values of the effective trait schema. - `inst-wc-trait-defaults`
7. [ ] - `p1` - **IF** a required trait is unset - `inst-wc-trait-missing`
   1. [ ] - `p1` - **RETURN** a validation failure. - `inst-wc-trait-missing-return`
8. [ ] - `p1` - **RETURN** the effective traits. - `inst-wc-trait-return`

### Validate a widget instance

- [ ] `p2` - **ID**: `cpt-frontx-dashboard-algo-widget-contract-validate-instance`

**Input**: an embedded widget instance.

**Output**: the widget validated against its own type, or a failure.

**Steps**:
1. [ ] - `p1` - Read the widget type from the rightmost type of the widget's `id` chain. - `inst-wc-val-type`
2. [ ] - `p1` - Register the widget instance on its own, which validates it against its own type. - `inst-wc-val-register`
3. [ ] - `p1` - **IF** registration rejects it - `inst-wc-val-fail`
   1. [ ] - `p1` - **RETURN** a cell-scope failure. - `inst-wc-val-fail-return`
4. [ ] - `p1` - Resolve its effective traits `entry` and `data_type` (`cpt-frontx-dashboard-algo-widget-contract-effective-traits`). - `inst-wc-val-traits`
5. [ ] - `p1` - Cross-check that `entry` and `data_type` exist. gts-plugin 0.6 validates with reference lookup on and already rejects at `inst-wc-val-register` an instance whose `entry` or `data_type` is not registered. The root resolves both traits anyway, for the generated extension and the stamp, and fails the cell when the `data_type` schema is missing; a missing `entry` fails the cell when the generated extension registers or mounts (DESIGN §3.6 step 5). - `inst-wc-val-crosscheck`
6. [ ] - `p1` - **RETURN** the validated widget and its traits. - `inst-wc-val-return`

## 4. States (CDSL)

### No lifecycle states

Not applicable because the contract is static data with no lifecycle; the runtime resolves effective traits and validates instances against it, with no state transitions of its own.

## 5. Definitions of Done

### Widget base and entry trait

- [ ] `p1` - **ID**: `cpt-frontx-dashboard-dod-widget-contract-base`

The system **MUST** ship the abstract widget base `gts.frontx.dashboard.widget.widget.v1~` with `id`, `title?`, a required open `render`, and the `entry` trait schema (`x-gts-instance-ref` to `gts.frontx.mfes.mfe.entry.v1~frontx.mfes.mfe.entry_mf.v1~`), open and abstract, so a product changes the entry in its copy of the served file.

`render` refers to the render base `gts.frontx.dashboard.widget.render.v1~`, the base type of a widget's render object. It guarantees only that `render` is an object, so it is not strict by itself: each concrete widget type closes `render`, and a widget instance is validated against its own type. A widget type closes it through its own render type: a closed type derived from the render base (`allOf` with `$ref` to the base and an object of the fields, then `unevaluatedProperties: false`), which the widget type's `render` refers to by `$ref`, as a data widget type names its own data type. Every catalog widget type has one, `gts.frontx.dashboard.widget.render.v1~frontx.dashboard.widget.<widget_type>_render.v1~` (`cpt-frontx-dashboard-feature-widget-catalog`). A product's own widget type does the same, or narrows and closes `render` inline in its `allOf` (`additionalProperties: false` with its fields); either way a wrong or unknown `render` field fails the widget's own registration. The widget base and the `render_widget` payload both refer to the render base.

The operand of `x-gts-instance-ref` on the `id` field is the literal base type, because the self-reference operand would resolve to the type being validated and would reject an id embedded in a layout cell or a dashboard.

**Schema**:

```json
{
  "$id": "gts://gts.frontx.dashboard.widget.widget.v1~",
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "title": "Widget",
  "description": "Abstract base of the 9 template widget types.",
  "x-gts-abstract": true,
  "type": "object",
  "required": ["id", "render"],
  "properties": {
    "id": {
      "type": "string",
      "x-gts-instance-ref": "gts.frontx.dashboard.widget.widget.v1~",
      "description": "Combined anonymous instance identifier: the widget's type chain followed by a UUID. The rightmost type of the chain is the widget type. The widget has no other identifier and no name of its own."
    },
    "title": {
      "type": "string",
      "description": "Display title shown in the widget chrome, as delivered."
    },
    "render": {
      "$ref": "gts://gts.frontx.dashboard.widget.render.v1~",
      "description": "Presentation fields, closed by each concrete widget type through its own render type or inline."
    }
  },
  "x-gts-traits-schema": {
    "type": "object",
    "required": ["entry"],
    "properties": {
      "entry": {
        "type": "string",
        "x-gts-instance-ref": "gts.frontx.mfes.mfe.entry.v1~frontx.mfes.mfe.entry_mf.v1~",
        "description": "The MFE entry the widget type renders through."
      }
    }
  }
}
```

**The render base schema**:

```json
{
  "$id": "gts://gts.frontx.dashboard.widget.render.v1~",
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "title": "Render",
  "description": "Base type of a widget's render object, its presentation fields. It guarantees only that render is an object, so it is not strict by itself: each concrete widget type closes it, through its own render type derived from this base (as every catalog widget type does) or by narrowing it inline, and a widget instance is validated against its own type.",
  "type": "object"
}
```

**Implements**: `cpt-frontx-dashboard-fr-add-fix-widget`.

**Components**: `cpt-frontx-dashboard-component-widget-catalog` (contract side).

**Principles**: `cpt-frontx-dashboard-principle-open-bases-closed-leaves`.

**Constraints**: `cpt-frontx-dashboard-constraint-one-gts-package`.

**Touches**:
- Entities: Widget base

### data_widget and data_type trait

- [ ] `p1` - **ID**: `cpt-frontx-dashboard-dod-widget-contract-data-widget`

The system **MUST** ship an abstract `data_widget` between the base and every data-taking type, deriving from the widget base, with a required `data` (the binding, a `oneOf` of three closed forms: own, shared, static), an optional `value_format`, and the `data_type` trait schema (`x-gts-type-ref` to the widget-data base). `markdown_card` derives from the widget base directly and forbids `data`.

The binding is the data contract a dashboard author writes. A data widget's `data` has exactly one of three forms; `request` is mutually exclusive with both `source` and `params`, and `params` is allowed only with `source` or alone:

- **own:** `{request, transform}`: `request` has `method` (`GET` or `POST`), `path` (an absolute same-origin path; the query string is part of the path), and an optional `body` (JSON, allowed only with `POST`). `transform` is a CEL expression whose single variable is `response`, the parsed JSON body.
- **shared:** `{source, params?, transform}`: `source` names an entry in the dashboard's `requests` object. `params` is any JSON object (absent means `{}`). `transform` is a CEL expression whose variables are `response` (the shared response) and `params`.
- **static:** `{params?, transform}`: `params` is any JSON object (absent means `{}`). `transform` is a CEL expression whose single variable is `params`.

`value_format` says how the widget formats the numbers it shows: `{value_type: number | percent | duration, unit?}`. `percent` 0.25 means 25%. `unit` is required when `value_type` is `duration` and is one of `ms` (milliseconds), `s` (seconds), `min` (minutes), `h` (hours) or `d` (days); the value is a number in that unit. `unit` is not allowed with `number` or `percent`; no other field is allowed. It is the closed value_format type `gts.frontx.dashboard.widget.value_format.v1~`, which `data_widget` and the `render_widget` payload both refer to. It sits on `data_widget`, so every data widget type inherits it and declares nothing for it; each type closes only its own `render`.

**Schema**:

```json
{
  "$id": "gts://gts.frontx.dashboard.widget.widget.v1~frontx.dashboard.widget.data_widget.v1~",
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "title": "DataWidget",
  "description": "Abstract base of the data widget types: a widget with a binding and the data_type trait.",
  "x-gts-abstract": true,
  "x-gts-traits-schema": {
    "type": "object",
    "required": ["data_type"],
    "properties": {
      "data_type": {
        "type": "string",
        "x-gts-type-ref": "gts.frontx.dashboard.widget_data.widget_data.v1~",
        "description": "The data type the widget type needs."
      }
    }
  },
  "allOf": [
    { "$ref": "gts://gts.frontx.dashboard.widget.widget.v1~" },
    {
      "type": "object",
      "required": ["data"],
      "properties": {
        "value_format": {
          "$ref": "gts://gts.frontx.dashboard.widget.value_format.v1~",
          "description": "How the widget formats the numbers it shows. percent 0.25 means 25%."
        },
        "data": {
          "oneOf": [
            {
              "type": "object",
              "unevaluatedProperties": false,
              "required": ["request", "transform"],
              "description": "own: send a request and evaluate the transform on the response.",
              "properties": {
                "request": { "$ref": "gts://gts.frontx.dashboard.widget.request.v1~" },
                "transform": {
                  "type": "string",
                  "description": "A CEL expression whose single variable is response, the parsed JSON body."
                }
              }
            },
            {
              "type": "object",
              "unevaluatedProperties": false,
              "required": ["source", "transform"],
              "description": "shared: evaluate the transform on a shared response and params.",
              "properties": {
                "source": {
                  "type": "string",
                  "pattern": "^[a-z][a-z0-9_]{0,63}$",
                  "description": "Names an entry in the dashboard's requests object."
                },
                "params": {
                  "type": "object",
                  "description": "Any JSON object. Absent means {}."
                },
                "transform": {
                  "type": "string",
                  "description": "A CEL expression whose variables are response (the shared response) and params."
                }
              }
            },
            {
              "type": "object",
              "unevaluatedProperties": false,
              "required": ["transform"],
              "description": "static: evaluate the transform on params, with no request.",
              "properties": {
                "params": {
                  "type": "object",
                  "description": "Any JSON object. Absent means {}."
                },
                "transform": {
                  "type": "string",
                  "description": "A CEL expression whose single variable is params."
                }
              }
            }
          ]
        }
      }
    }
  ]
}
```

**The value_format type schema**:

```json
{
  "$id": "gts://gts.frontx.dashboard.widget.value_format.v1~",
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "title": "ValueFormat",
  "description": "How a data widget formats the numbers it shows: the value type, and for a duration its unit. percent 0.25 means 25%. Closed: no other field.",
  "type": "object",
  "required": ["value_type"],
  "properties": {
    "value_type": { "enum": ["number", "percent", "duration"] },
    "unit": {
      "enum": ["ms", "s", "min", "h", "d"],
      "description": "The unit of a duration value: milliseconds, seconds, minutes, hours or days. Required when value_type is duration; not allowed otherwise."
    }
  },
  "allOf": [
    {
      "if": { "required": ["value_type"], "properties": { "value_type": { "const": "duration" } } },
      "then": { "required": ["unit"] },
      "else": { "not": { "required": ["unit"] } }
    }
  ],
  "unevaluatedProperties": false
}
```

**Implements**: `cpt-frontx-dashboard-fr-widget-catalog` (contract side), `cpt-frontx-dashboard-interface-binding`.

**Principles**: `cpt-frontx-dashboard-principle-open-bases-closed-leaves`.

**Touches**:
- Entities: Data widget, Widget base, Binding

### Request type

- [ ] `p1` - **ID**: `cpt-frontx-dashboard-dod-widget-contract-request`

The system **MUST** ship the request type `gts.frontx.dashboard.widget.request.v1~`, the one schema for a request: an own binding's `request` and every value of the dashboard's `requests` object reference it. A request is plain data inside the dashboard instance; it has no id and is never registered on its own.

A `path` starts with a single `/` that is not followed by `/` or `\`, and has no control characters, so a browser cannot read it as another host. The root resolves the path against the page origin and sends the request only when the resolved origin equals the page origin. A response redirected to another origin is a failed request.

**Schema**:

```json
{
  "$id": "gts://gts.frontx.dashboard.widget.request.v1~",
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "title": "Request",
  "description": "A request the dashboard root sends to the product's API: an own binding's request, or a named shared request of the dashboard.",
  "type": "object",
  "required": ["method", "path"],
  "properties": {
    "method": { "enum": ["GET", "POST"] },
    "path": {
      "type": "string",
      "pattern": "^/([^/\\\\\\x00-\\x1F\\x7F][^\\x00-\\x1F\\x7F]*)?$",
      "description": "An absolute same-origin path: a single leading slash not followed by a slash or a backslash, with no control characters; the query string is part of the path. The root resolves it against the page origin and rejects any other origin before sending."
    },
    "body": {
      "description": "JSON body, allowed only with POST."
    }
  },
  "allOf": [
    {
      "if": { "required": ["method"], "properties": { "method": { "const": "GET" } } },
      "then": { "not": { "required": ["body"] } }
    }
  ],
  "unevaluatedProperties": false
}
```

**Implements**: `cpt-frontx-dashboard-interface-binding`.

**Touches**:
- Entities: Request

### Widget-data base and stamped data

- [ ] `p1` - **ID**: `cpt-frontx-dashboard-dod-widget-contract-data-base`

The system **MUST** ship the abstract widget-data base `gts.frontx.dashboard.widget_data.widget_data.v1~` with `id`. The root stamps the transform result with `<data type>~<UUIDv5(namespace, widget id | role)>` and registers it, which validates it.

The transform result, the data a widget receives, must not carry a top-level field of these names: `$id`, `gtsId`, `gtsIid`, `gtsOid`, `gtsI`, `gts_id`, `gts_oid`, `gts_iid`, `$schema`, `gtsTid`, `gtsType`, `gtsT`, `gts_t`, `gts_tid`, `gts_type`, `type`, `schema` - the fields the type store reads as an entity's id or schema before `id`. An `id` is not in the list: the root replaces it with the stamp above. Nothing checks this at load: the transform result exists only when a cell runs. The check runs when the cell binds: a result that carries one of the names fails that cell (it shows its cannot-be-shown state), and the other cells are unaffected. A product data type that allows a top-level field of these names registers fine in the served file, and data with such a field fails every cell that delivers it. A transform nests such a value under another key of the data type.

**Schema**:

```json
{
  "$id": "gts://gts.frontx.dashboard.widget_data.widget_data.v1~",
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "title": "WidgetData",
  "description": "Abstract base of every data type. Carries the combined instance id.",
  "type": "object",
  "x-gts-abstract": true,
  "required": ["id"],
  "properties": {
    "id": {
      "type": "string",
      "x-gts-instance-ref": "gts.frontx.dashboard.widget_data.widget_data.v1~",
      "description": "Combined anonymous instance id: the data type chain followed by the root's UUIDv5 stamp, of the form <data type>~UUIDv5(namespace, widget id | role)."
    }
  }
}
```

**Implements**: `cpt-frontx-dashboard-interface-binding` (transform result), `cpt-frontx-dashboard-interface-render-widget` (data payload).

**Touches**:
- Entities: Widget data base

### render_widget action

- [ ] `p1` - **ID**: `cpt-frontx-dashboard-dod-widget-contract-render-action`

The system **MUST** ship the `render_widget {render, value_format?, data?}` action type. `render` is the widget instance's `render` object, already validated with the widget instance against its own type; the payload checks it against the render base, so it is an object. `value_format` is the data widget's value format, when it has one, checked against the closed value_format type; `data` is the stamped data instance, already validated against its data type. The widget gets nothing else: not the widget id, not the title (the root draws it in the cell frame), and not the binding. The widget renders the payload, including its own empty state, and makes no requests. The root sends it once `mount_ext` has finished and the data is valid; a `markdown_card` cell gets `render_widget {render}` at once, with no loader.

**Schema**:

```json
{
  "$id": "gts://gts.frontx.mfes.comm.action.v1~frontx.dashboard.mfe.render_widget.v1~",
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "title": "render_widget",
  "description": "Gives a mounted widget extension its render settings, and for a data widget its data.",
  "allOf": [
    { "$ref": "gts://gts.frontx.mfes.comm.action.v1~" },
    {
      "type": "object",
      "required": ["payload"],
      "properties": {
        "target": {
          "type": "string",
          "x-gts-instance-ref": "gts.frontx.mfes.ext.extension.v1~frontx.dashboard.mfe.widget_ext.v1~",
          "description": "A generated extension in the widgets domain."
        },
        "payload": {
          "type": "object",
          "required": ["render"],
          "additionalProperties": false,
          "properties": {
            "render": {
              "$ref": "gts://gts.frontx.dashboard.widget.render.v1~",
              "description": "The widget instance's render object, validated with the widget instance against its own type."
            },
            "value_format": {
              "$ref": "gts://gts.frontx.dashboard.widget.value_format.v1~",
              "description": "Data widget only: the widget instance's value_format."
            },
            "data": {
              "$ref": "gts://gts.frontx.dashboard.widget_data.widget_data.v1~",
              "description": "Data widget only: the stamped and validated data instance."
            }
          }
        }
      }
    }
  ],
  "unevaluatedProperties": false
}
```

**Implements**: `cpt-frontx-dashboard-interface-contract`, `cpt-frontx-dashboard-interface-render-widget`.

**Touches**:
- Entities: render_widget action

### widgets extension type

- [ ] `p1` - **ID**: `cpt-frontx-dashboard-dod-widget-contract-extension-type`

The system **MUST** ship the `widgets` extension type `gts.frontx.mfes.ext.extension.v1~frontx.dashboard.mfe.widget_ext.v1~`. It is the domain's `extensionsTypeId` and only narrows `domain` to the `widgets` domain id; every other field comes from the FrontX extension base unchanged. The root sets `entry` to the entry named by the widget type's `entry` trait.

**Schema**:

```json
{
  "$id": "gts://gts.frontx.mfes.ext.extension.v1~frontx.dashboard.mfe.widget_ext.v1~",
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "title": "Widgets Extension",
  "description": "Generated widget extension of the widgets domain. Narrows domain to the widgets domain; adds no field.",
  "allOf": [
    { "$ref": "gts://gts.frontx.mfes.ext.extension.v1~" },
    {
      "type": "object",
      "properties": {
        "domain": {
          "const": "gts.frontx.mfes.ext.domain.v1~frontx.dashboard.mfe.widgets.v1"
        }
      }
    }
  ]
}
```

**Implements**: `cpt-frontx-dashboard-interface-render-widget` (action target).

**Constraints**: `cpt-frontx-dashboard-constraint-one-gts-package`.

**Touches**:
- Entities: Widgets extension type

### widgets domain instance

- [ ] `p1` - **ID**: `cpt-frontx-dashboard-dod-widget-contract-domain`

The system **MUST** ship the `widgets` domain instance `gts.frontx.mfes.ext.domain.v1~frontx.dashboard.mfe.widgets.v1` with `sharedProperties` theme and language, `actions` `mount_ext` and `unmount_ext`, `extensionsActions` `render_widget`, `extensionsTypeId` the `widget_ext` extension type, `defaultActionTimeout` 30000 ms, and both lifecycle-stage lists empty. The domain has no `route`: generated extensions are not routed.

**Instance**:

```json
{
  "id": "gts.frontx.mfes.ext.domain.v1~frontx.dashboard.mfe.widgets.v1",
  "sharedProperties": [
    "gts.frontx.mfes.comm.shared_property.v1~frontx.mfes.comm.theme.v1~",
    "gts.frontx.mfes.comm.shared_property.v1~frontx.mfes.comm.language.v1~"
  ],
  "actions": [
    "gts.frontx.mfes.comm.action.v1~frontx.mfes.ext.mount_ext.v1~",
    "gts.frontx.mfes.comm.action.v1~frontx.mfes.ext.unmount_ext.v1~"
  ],
  "extensionsActions": [
    "gts.frontx.mfes.comm.action.v1~frontx.dashboard.mfe.render_widget.v1~"
  ],
  "extensionsTypeId": "gts.frontx.mfes.ext.extension.v1~frontx.dashboard.mfe.widget_ext.v1~",
  "defaultActionTimeout": 30000,
  "lifecycleStages": [],
  "extensionsLifecycleStages": []
}
```

**Implements**: `cpt-frontx-dashboard-interface-render-widget` (domain side).

**Constraints**: `cpt-frontx-dashboard-constraint-one-root-per-registry`.

**Touches**:
- Entities: widgets domain

### Generated extension instance

- [ ] `p2` - **ID**: `cpt-frontx-dashboard-dod-widget-contract-generated-extension`

The root generates one extension per cell (and per larger view). The extension id is `<widget_ext type>~<UUIDv5(namespace, widget id | role | entry id)>`, where role is `cell` or `larger_view`. A stamped data id is `<data type>~<UUIDv5(namespace, widget id | role)>`. The template uses one fixed UUIDv5 namespace constant, `b3f7a1c2-4d6e-4f8a-9c1b-3e5d7f9a2b04`, the template's own, for both extension ids and stamped data ids. The name parts are joined with `|`, in UTF-8, with ids in lowercase. A reload reuses the ids. Ids are never persisted.

**Example** (two generated extensions, one per cell, not a registered type):

```json
[
  {
    "id": "gts.frontx.mfes.ext.extension.v1~frontx.dashboard.mfe.widget_ext.v1~6b1f4e2a-93c7-5d08-a4e5-2c7f9b0d3e61",
    "domain": "gts.frontx.mfes.ext.domain.v1~frontx.dashboard.mfe.widgets.v1",
    "entry": "gts.frontx.mfes.mfe.entry.v1~frontx.mfes.mfe.entry_mf.v1~frontx.dashboard.mfe.pie_chart.v1"
  },
  {
    "id": "gts.frontx.mfes.ext.extension.v1~frontx.dashboard.mfe.widget_ext.v1~9d3a7c5e-1f42-5b86-8e0d-4a6c2f7b1d93",
    "domain": "gts.frontx.mfes.ext.domain.v1~frontx.dashboard.mfe.widgets.v1",
    "entry": "gts.frontx.mfes.mfe.entry.v1~frontx.mfes.mfe.entry_mf.v1~frontx.dashboard.mfe.grid.v1"
  }
]
```

**Implements**: `cpt-frontx-dashboard-interface-render-widget` (generated extension side).

**Touches**:
- DB: none; ids are never persisted (`cpt-frontx-dashboard-db-none`)
- Entities: Generated extension

### Theme and language shared properties

- [ ] `p1` - **ID**: `cpt-frontx-dashboard-dod-widget-contract-shared-properties`

The `widgets` domain shares the host's theme and language through the FrontX shared properties `gts.frontx.mfes.comm.shared_property.v1~frontx.mfes.comm.theme.v1~` and `gts.frontx.mfes.comm.shared_property.v1~frontx.mfes.comm.language.v1~`, and every widget entry requires both. FrontX refers to these ids but does not define their types, so the template carries a minimal schema for each (a non-empty string `value`, derived from the FrontX shared-property base) and the root registers it only when the type store has no schema under that id: a host without a FrontX shell can then register the domain and the entries. The root keeps a type store of its own, so it never reads a shell's store: a schema already registered under that id in the root's store is kept, and a shell's own validation of theme and language does not apply inside the dashboard. The theme value is the host theme id, which the widget helpers fold to the light or dark ui-kit scope (an unknown id gives light); the language value is the host language.

**Implements**: `cpt-frontx-dashboard-interface-contract` (shared properties every entry requires).

**Touches**:
- Entities: Theme shared property, Language shared property

### Entry declaration

- [ ] `p1` - **ID**: `cpt-frontx-dashboard-dod-widget-contract-entry`

A widget's entry **MUST** be a plain instance of the FrontX entry type `gts.frontx.mfes.mfe.entry.v1~frontx.mfes.mfe.entry_mf.v1~`, with no derived type and no extra field. The widget author writes `id`, `requiredProperties`, `actions`, `domainActions`, `manifest` and `exposedModule`; the FrontX manifest pipeline adds `exposeAssets` when the bundle is built. Its `mount` resolves only after it has registered its `render_widget` handler. The entry is authored in its bundle's `widgets/bundles/<widget_type>/mfe.json`, completed by the FrontX manifest pipeline, carried by the served GTS file, and registered by the root from it. The 9 entries of the catalog are written out in full in the widget catalog FEATURE (MFE entries).

The template's choices for the entry fields:
- `requiredProperties`: theme and language. Each widget maps the host theme id to the light or dark scope of `@gears-frontx/ui-kit` and follows a theme switch without a request. The language value is the widget's `locale`: it formats values, numbers and dates for the host language. The wording a widget owns (its cannot-be-shown state, its empty states, the default chart name) is English: the renderer gets only `locale` and the shadow-root container, no text table, so a widget's own words do not follow the host language yet (gears-frontx-templates#105).
- `actions`: `render_widget`, the one extension action the domain sends to its widgets, so only entries that handle it are admitted. `markdown_card` lists it too, although it never receives `data`.
- `domainActions`: empty. Widgets make no requests and send no action to the domain.
- `manifest`: the manifest of the entry's own widget bundle.
- `exposedModule`: `./<widget_type>` where `<widget_type>` is the widget type segment.
- The same entry serves a cell and the larger view.

**Implements**: `cpt-frontx-dashboard-fr-add-fix-widget`.

**Principles**: `cpt-frontx-dashboard-principle-per-instance-isolation`.

**Constraints**: `cpt-frontx-dashboard-constraint-hosting-agnostic`.

**Touches**:
- Entities: MFE entry

### Widgets manifest

- [ ] `p2` - **ID**: `cpt-frontx-dashboard-dod-widget-contract-manifest`

The system **MUST** ship one manifest per widget type, `gts.frontx.mfes.mfe.mf_manifest.v1~frontx.dashboard.widgets.<widget_type>.v1`, the manifest of that type's widget bundle: one Module Federation remote that exposes the type's one entry. Each of the 9 widget entries points to the manifest of its own bundle, so one type is built, published, fixed and rolled back without the others. The bundle's `widgets/bundles/<widget_type>/mfe.json` is the authoring input for its manifest and entry; the FrontX manifest pipeline completes it when the bundle is built, and the build writes the completed pair as the bundle's part of the served file (`widget.gts.json`). The served GTS file carries the completed manifests and entries, and the root registers them from it. An `mfe.json` carries no template GTS instance and no dashboard content.

| Field | Source | Content |
|-------|--------|---------|
| `id` | authored in the bundle's `mfe.json` | `gts.frontx.mfes.mfe.mf_manifest.v1~frontx.dashboard.widgets.<widget_type>.v1` |
| `remoteEntry` | authored in the bundle's `mfe.json` | location of the entry file of the bundle's build; the served part leaves it out |
| `metaData.publicPath` | set by the build (`WIDGET_BUNDLE_BASE`, `/widgets/` by default, then `<widget_type>/`) | the address the FrontX MF handler loads the bundle's chunks from |
| every other manifest field | produced by the FrontX manifest pipeline (the `frontx-mf-gts` build plugin) from the build | as FrontX defines the manifest type, with the shared modules and their content hashes |

A full JSON instance block is not shown because the manifest pipeline produces the manifest from the build; only `id` and `remoteEntry` are authored in `mfe.json`.

**Implements**: `cpt-frontx-dashboard-nfr-bundle-budget` (manifest side).

**Touches**:
- Entities: Widgets manifest

### Widget-author obligations

- [ ] `p2` - **ID**: `cpt-frontx-dashboard-dod-widget-contract-obligations`

A widget entry **MUST** render `render_widget` and, for data widgets, `data` (including its own empty state), make no requests, map the host theme id to the ui-kit light or dark scope (unknown gives light), style with ui-kit tokens only, format numbers and dates for the host language, show text never markup, never cut content off, never convey meaning by colour alone, and be keyboard-operable. It **MUST** be usable with a screen reader: each of its controls exposes its name, role and state, its empty and cannot-be-shown states are exposed as text, and values it shows only as graphics, such as a chart or the heatmap, have a text alternative.

A widget entry **MUST** resolve its `render_widget` handler as soon as it accepts the payload, before drawing. It **MUST** contain its own drawing and library start-up errors and show its own cannot-be-shown state in its area. That state is static and shows the same words as the cell placeholder ("This widget cannot be shown"; English, like every widget-owned wording), with no error text, exposed as text to assistive technology; the cell frame stays. The root sees only the action result: if the action ends in fallback or times out (`defaultActionTimeout`), the cell becomes cannot-be-shown. Accepted limitation: the root does not see a failure after the widget accepted the payload, so a widget that fails without showing anything leaves its cell blank.

The catalog FEATURE applies these obligations to each of the 9 types, for the theme, accessibility and visual-quality requirements.

**Implements**: `cpt-frontx-dashboard-interface-render-widget` (widget side).

### Shared dependencies and budget

- [ ] `p3` - **ID**: `cpt-frontx-dashboard-dod-widget-contract-shared-deps`

Every widget entry **MUST** list its packages in `shared`, built as shared dependencies, fetched once by contentHash (FrontX ADR-0034/0035).

Download budgets, provisional and confirmed by measurement, counted per DESIGN §4.1 (transferred gzipped bytes on a cold load of the reference dashboard, each shared dependency once in the page total):
- The dashboard root **MUST** stay under 500 KB gzipped, CEL library included.
- Each widget entry **MUST** stay under 100 KB gzipped, own code only.

Stateful packages are listed in `shared` too, and per-instance memory is held per extension id until unload, bounded by deterministic ids. Package subtrees live under `src-app/mfe_packages/{dashboard,widgets}/`; the architecture documents are not shipped.

**Dependency sets per entry**:

| Entries | Packages used |
|---------|---------------|
| Every widget entry | React with React DOM; the FrontX MFE runtime for the entry's bridge and lifecycle; `@gears-frontx/ui-kit`; and its own widget code only (the cell frame lives in the root) |
| Entries of `cartesian_chart`, `pie_chart` | in addition, Recharts, pinned to the version ui-kit pins, composed inside the ui-kit chart component, and lucide-react, pinned to the version ui-kit pins, for the chart actions |
| Entry of `grid` | in addition, lucide-react, pinned to the version ui-kit pins; the grid is the ui-kit DataGrid |
| Entry of `heatmap` | nothing beyond ui-kit: the heatmap draws its tiles from kit tokens |
| Entry of `markdown_card` | in addition, markdown-it |

A schema missing along the type chain is a failure, never a partial result.

**Implements**: `cpt-frontx-dashboard-nfr-bundle-budget`.

**Principles**: `cpt-frontx-dashboard-principle-per-instance-isolation`.

**Constraints**: `cpt-frontx-dashboard-constraint-hosting-agnostic`, `cpt-frontx-dashboard-constraint-permissive-licences` (every shared dependency is Apache-2.0, MIT, ISC, BSD-2-Clause, BSD-3-Clause or 0BSD, or an `AND` of them).

### Publishing and rollback

- [ ] `p2` - **ID**: `cpt-frontx-dashboard-dod-widget-contract-publish`

A widget author **MUST** publish a widget in this order: deploy the MFE build, then add the widget type, its data type, the entry and the manifest to the served GTS file. A new widget type is usable by existing dashboards at once. A fix released under the same widget type shows on the next page load. Neither needs a product redeploy. A fix keeps the widget type's `render` and data schemas compatible; an incompatible change ships as a new widget type version.

Rollback of a widget release: restore the previous widget type, data type, entry and manifest in the served file, or redeploy the previous MFE build. Rollback of the product: ship its previous build.

**Implements**: `cpt-frontx-dashboard-flow-widget-contract-publish`, `cpt-frontx-dashboard-fr-add-fix-widget`.

**Touches**:
- Entities: Widget base, MFE entry, Widgets manifest

### Widget-author guide

- [ ] `p2` - **ID**: `cpt-frontx-dashboard-dod-widget-contract-guide`

The template **MUST** ship a widget-author guide covering deriving a type and data type, building and shipping the entry, the publish order and rollback, the one action it renders, the entry declaration, and the obligations. It **MUST** also cover:
- the product owns dashboard size and data size;
- every viewer who may see a dashboard must be able to get its widgets' data;
- the product's API owns errors and access;
- what the host must provide (a container, a dashboard id, and the theme and language values);
- the documented limitations: the limitations of PRD §6.3, including that a widget that fails without showing anything leaves its cell blank, and the DESIGN limits listed in DESIGN §5.

The widget-author guide **MUST** also hold the procedure by which a product developer adopts the template, used together with the dashboard-author guide: copy the template, give the root the product's `DashboardHost` (the shipped `fetchHost` is the plain one), place the dashboard root with what the host must provide, serve the product's copy of the GTS file, and, where the product needs its own widget, point a template widget type to that widget's entry in that copy (`cpt-frontx-dashboard-flow-widget-contract-publish`, step 4).

A walkthrough with someone who did not build the template verifies the guide. A walkthrough in which a product developer who did not build the template adopts it using only the shipped guides verifies the adoption procedure.

**Implements**: `cpt-frontx-dashboard-fr-author-guides` (widget-author guide), `cpt-frontx-dashboard-usecase-adopt-template`.

## 6. Acceptance Criteria

- [ ] The widget base is abstract and open, with `id`, `title?`, a required open `render` of the render base, and the `entry` trait; the render base, the value_format type and the request type exist; `data_widget` has an optional `value_format`, inherited by every data widget type, and requires `data` (the binding `oneOf` of three closed forms) and has the `data_type` trait; `markdown_card` forbids `data`.
- [ ] Each catalog widget type refers by `$ref` to its own render type, a closed type derived from the render base; a product's own widget type may do the same or narrow and close `render` inline. Either way a `render` field of the wrong type, or one the type does not declare, fails the widget's own registration and only its cell.
- [ ] Binding forms pass: own `{request, transform}`, shared `{source, params?, transform}` and static `{params?, transform}` each validate against `data_widget`.
- [ ] Binding forms fail: `request` with `source`; `request` with `params`; a `source` that does not match `^[a-z][a-z0-9_]{0,63}$` (such as `Top-Hosts`); a form with no `transform`; an extra field in any form; a data widget with no `data`; a `markdown_card` with `data`.
- [ ] Request type passes: `GET` with a path such as `/api/items?limit=10`; `POST` with a JSON `body`.
- [ ] Request type fails: `GET` with a `body`; a method other than `GET` or `POST`; a path that does not start with `/` (such as `api/items` or `https://other.example/x`); `//other.example/x`; `/\other.example/x`; a path with a control character; an extra field. A path such as `/../x` passes the schema, and the root resolves it against the page origin before sending.
- [ ] `value_format` (the value_format type) passes: `{value_type: "number"}`, `{value_type: "percent"}`, and `{value_type: "duration", unit}` with each `unit` of `ms`, `s`, `min`, `h`, `d`.
- [ ] `value_format` fails: `duration` with no `unit`; a `unit` outside the enum; `unit` with `number` or `percent`; an extra field.
- [ ] A concrete widget type sets `entry` and `data_type`; a product that sets a different `entry` in its copy of the served file mounts that entry, with no template change.
- [ ] A new widget type added to the served file is usable by existing dashboards at once; a fix released under the same widget type shows on the next page load; neither needs a product redeploy.
- [ ] Restoring the previous widget type, data type, entry and manifest in the served file, or redeploying the previous MFE build, restores the previous widget on the next page load.
- [ ] The root resolves effective traits as the RFC 7396 merge along the `$id` chain, with defaults filled; a schema missing along the type chain is a failure, never a partial result.
- [ ] The `render_widget` action carries a single `target` (a `widget_ext` extension) and a closed payload of `{render, value_format?, data?}`: the widget's `render` object (of the render base) and, for a data widget, its `value_format` (of the value_format type) and the stamped data instance. It carries no widget id, title or binding.
- [ ] The `widgets` extension type narrows `domain` to the `widgets` domain id and adds no field; a generated extension's `entry` is the entry named by the widget type's `entry` trait.
- [ ] The `widgets` domain instance declares `sharedProperties` theme and language, `actions` `mount_ext` and `unmount_ext`, `extensionsActions` `render_widget`, `extensionsTypeId` the `widget_ext` extension type, `defaultActionTimeout` 30000, and both lifecycle-stage lists empty.
- [ ] The domain and every entry refer to the FrontX theme and language ids; the root registers the template's minimal schema for each only when the type store has none under that id, and never replaces a schema already registered.
- [ ] In each bundle's `mfe.json` the widget author writes the manifest's `id` and `remoteEntry`; the FrontX manifest pipeline produces the rest of the manifest and adds the entry's `exposeAssets` when the bundle is built.
- [ ] A generated extension id is the `widget_ext` type followed by `UUIDv5(namespace, widget id | role | entry id)`; a stamped data id is the data type followed by `UUIDv5(namespace, widget id | role)`; name parts are joined with `|`, in UTF-8, with ids in lowercase; ids are never persisted.
- [ ] A widget entry is a plain FrontX `entry_mf` instance with no derived type and no extra field, written without `exposeAssets`; its `mount` resolves only after it registers its `render_widget` handler.
- [ ] A widget entry follows the obligations: no requests, theme mapping, ui-kit tokens, formats, text not markup, no cut-off, no meaning by colour alone, keyboard-operable, and usable with a screen reader (name, role and state on each control; empty and cannot-be-shown states as text; a text alternative for values shown only as graphics).
- [ ] A widget entry resolves its `render_widget` handler before drawing; a widget whose drawing fails shows its own cannot-be-shown state in its area; an action that ends in fallback or times out makes the cell cannot-be-shown. The guide states the limit that a widget that fails without showing anything leaves its cell blank.
- [ ] Given a widget whose drawing fails, or whose own check fails, when it shows its own cannot-be-shown state, then the state shows the static text "This widget cannot be shown" (English, like every widget-owned wording; gears-frontx-templates#105), the same words as the cell placeholder's default, with no error text; a screen reader reads that text; and the cell frame stays.
- [ ] Every widget entry lists its packages in `shared`, fetched once by contentHash. Measured per DESIGN §4.1 against the provisional budgets: the dashboard root under 500 KB gzipped, CEL library included; each widget entry under 100 KB gzipped, own code only.
- [ ] The widget-author guide covers every topic of its DoD, checked as a list, including the limitations of PRD §6.3 and the DESIGN limits of DESIGN §5, and someone who did not build the template adopts it in a walkthrough using only the guide.
- [ ] In a walkthrough, a product developer who did not build the template adopts it using only the shipped guides: copies it, gives the root the product's `DashboardHost`, places the dashboard root with what the host must provide, serves the product's copy of the GTS file, and points a template widget type to another entry, and a dashboard from that copy shows.
