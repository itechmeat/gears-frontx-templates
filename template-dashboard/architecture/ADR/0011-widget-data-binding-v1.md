---
status: accepted
version: 1
priority: p1
date: 2026-10-31
decision-makers: template-dashboard architecture maintainers
description: "Decision record for the widget data binding: a binding is one of three forms (own, shared or static), the request goes to a same-origin API path, the transform is a CEL expression whose variables depend on the form, the dashboard root sends each request to the host the product passes, with a request timeout, a shared request is sent once per load and per built request, dashboard variables build requests and re-run only the cells that use them, and the CEL library is @marcbachmann/cel-js behind a small internal interface."
---

# ADR-0011: Widget data binding

**ID**: `cpt-frontx-dashboard-adr-widget-data-binding`

<!-- toc -->

- [Context and Problem Statement](#context-and-problem-statement)
- [Decision Drivers](#decision-drivers)
- [Considered Options](#considered-options)
- [Decision Outcome](#decision-outcome)
  - [Consequences](#consequences)
  - [Confirmation](#confirmation)
  - [Dashboard variables: a second kind later](#dashboard-variables-a-second-kind-later)
- [Pros and Cons of the Options](#pros-and-cons-of-the-options)
  - [A CEL transform over the parsed JSON response](#a-cel-transform-over-the-parsed-json-response)
  - [A product-supplied data adapter](#a-product-supplied-data-adapter)
  - [JSONPath or jq over the response](#jsonpath-or-jq-over-the-response)
  - [CEL library: `@marcbachmann/cel-js`](#cel-library-marcbachmanncel-js)
  - [CEL library: `@bufbuild/cel`](#cel-library-bufbuildcel)
  - [Sharing: named shared requests](#sharing-named-shared-requests)
  - [Sharing: template-side coalescing of identical own requests](#sharing-template-side-coalescing-of-identical-own-requests)
  - [Binding forms: own, shared and static](#binding-forms-own-shared-and-static)
  - [Binding forms: one own request per widget only](#binding-forms-one-own-request-per-widget-only)
- [More Information](#more-information)
- [Traceability](#traceability)

<!-- /toc -->

## Context and Problem Statement

A data widget shows data, but the product writes no data code. The data must come from the product's API and be shaped into the widget's data type, and the shaping must be part of the dashboard so a dashboard author controls it. The binding connects a data widget to its data through one of three forms: a request the author writes, a shared request the dashboard declares once, or values written into the dashboard with no request. The binding is plain data, part of the dashboard JSON.

The dashboard root runs the binding, not the widget: widgets never make requests. The root sends the request (if any), evaluates the transform, validates the result, and passes it to the widget through `render_widget` ([ADR-0007](0007-extension-domain-taxonomy-v1.md)). What is the transform language, how are the three binding forms run, and what trust, sharing and timeout apply?

## Decision Drivers

* The binding is plain data, part of the dashboard JSON, editable like the rest of it.
* The product writes no data code; the dashboard root runs the binding.
* The binding has three forms — own, shared and static — with transform variables that depend on the form; shared requests are plain data in the dashboard JSON, sent once per dashboard load.
* Dashboard sources are trusted and product-controlled; requests go to same-origin absolute paths with `GET` or `POST` only, and the root sends every request to the `DashboardHost` the product passes.
* A failing shared request fails every dependent cell; any other failure, including a request that never answers (which times out and shows the cell's cannot-be-shown state), affects only its cell or larger view.
* Static bindings evaluate at once, with no request.
* The transform sees only its declared variables, with no access to the host, the network, other widgets or shared state.
* The transform library must be small, dependency-free, return plain JS, give authors feedback before anything runs, and be swappable behind a small internal interface.

## Considered Options

* A CEL transform over the parsed JSON response
* A product-supplied data adapter
* JSONPath or jq over the response
* CEL library: `@marcbachmann/cel-js`
* CEL library: `@bufbuild/cel`
* Sharing: named shared requests
* Sharing: template-side coalescing of identical own requests
* Binding forms: own, shared and static
* Binding forms: one own request per widget only

The options cover four parts of this decision: the transform language, the CEL library, how identical requests are shared, and the binding forms.

## Decision Outcome

Chosen option: "A CEL transform over the parsed JSON response", because the binding stays plain data in the dashboard JSON, the product writes no data code, CEL is a small expression language with no runtime dependencies that returns plain JS, and the root can run it with a request timeout and a response-size cap. For the other parts, the chosen options are "CEL library: `@marcbachmann/cel-js`", "Sharing: named shared requests" and "Binding forms: own, shared and static", for the reasons in their pros and cons below.

**The binding (three forms).** A data widget's `data` is a binding with exactly one of three forms; `request` is mutually exclusive with both `source` and `params`, and `params` is allowed only with `source` or alone; the binding is plain data, part of the dashboard JSON:
- **own:** `{request, transform}` — `request` has `method` (`GET` or `POST`), `path` (an absolute same-origin path; the query string is part of the path), and an optional `body` (JSON, allowed only with `POST`). `transform` is a CEL expression whose single variable is `response`, the parsed JSON body.
- **shared:** `{source, params?, transform}` — `source` names an entry in the dashboard's `requests` object. `params` is any JSON object (absent means `{}`). `transform` is a CEL expression whose variables are `response` (the shared response) and `params`.
- **static:** `{params?, transform}` — `params` is any JSON object (absent means `{}`). `transform` is a CEL expression whose single variable is `params`. Binding `params` is the transform's input values; it is unrelated to the widget's `render` field.

**Shared requests.** The dashboard has an optional `requests` object: a name maps to a request with the same fields as an own binding's request (`method`, `path`, `body?`). Names match `^[a-z][a-z0-9_]{0,63}$`. The runner sends each shared request once per dashboard load and per built request (method, built path and built body, see Dashboard variables), in parallel with own requests, and only if at least one cell or larger view refers to it. Shared requests use the same trust rules, timeout and response-size cap as own requests. The root keeps each built request's response until teardown and runs every dependent transform on it, so returning to a value seen before sends nothing for a shared request.

**Dashboard variables.** A dashboard may declare up to 8 variables in an optional `variables` object (names match the `requests` name pattern), each of the closed variable type `gts.frontx.dashboard.dashboard.variable.v1~`: a `title` (the control's visible label and accessible name), 2 to 12 closed `{value, label}` options and a `default`. One kind exists today, a choice from a list, such as a period. The root checks at load what the type cannot: option values are unique and the `default` is one of them; otherwise the whole dashboard fails to load with that reason. A request, own or shared, names the variables it depends on in its own optional `variables` object: each key is a query key (`GET`) or a top-level body field (`POST`), each value a variable name. Before the same-origin check, which runs on the built request, the root builds the request from the current values: for `GET` it appends each key to the path's query with `URLSearchParams`, after any query already there; for `POST` it sets each key as a top-level body field, the body then having to be an object (absent counts as `{}`). A key already set in the query or the body, and a variable the dashboard does not declare, fail the cell. The host interface does not change: `host.request` gets the built request, without `variables`. The values start at the defaults; the `Dashboard` component takes optional host values (`variables`), a change callback (`onVariablesChange`) and `hideVariables`, and otherwise draws a bar of kit controls above the grid. When a value changes, the root re-runs only the cells and open larger views whose own or shared request names that variable, and drops every answer for an older value. Widgets never see variables, and the CEL transform's variables do not change: a transform that needs the period reads it from the response.

**The runner.** Widgets never make requests. The dashboard root runs each cell and each larger view in parallel, by binding form, then stamps the result, registers it (which validates it against the widget's data type) and sends it in `render_widget`. The step-by-step flow is in the runtime FEATURE (`cpt-frontx-dashboard-flow-dashboard-runtime-open`, `cpt-frontx-dashboard-algo-dashboard-runtime-run-binding`); DESIGN §3.6 gives the system view.

**Every request goes to the product's host, no template-side coalescing.** The root sends the served-file load and every widget data request to the `DashboardHost` the product passes when it creates the root; the template ships `fetchHost`, a plain implementation over `fetch`, and a product whose API needs its own client, headers or session passes its own host. The root keeps no cache of its own and joins nothing but the named shared requests: two cells with identical own requests each send their own. Named shared requests are the explicit way to share, and the only one for POST. A product that wants identical GETs joined implements that in its own host. The host calls are named in the runtime FEATURE (`cpt-frontx-dashboard-dod-dashboard-runtime-binding`).

**Per-cell failure and static evaluation.** A failed or timed-out shared request shows the cannot-be-shown state in every dependent cell; the developer log names the request. A `source` with no matching entry in `requests` fails only that cell, before anything runs. Each dependent transform succeeds or fails on its own. A static binding's transform is evaluated without a loader, then stamped and registered, which validates it against the widget's data type exactly like fetched data; a CEL error or failed validation shows the cell's cannot-be-shown state. CEL has no current-time function, so static data can't depend on the date.

**Trust, timeout and safe mappings.** Dashboard sources are trusted and product-controlled. Requests go to same-origin absolute paths. The rule: a `path` has a single leading `/` that is not followed by `/` or `\`, and no control characters (the request type's `path` pattern); the root resolves it against the page origin and sends it only if the resolved origin equals the page origin. Any other target is rejected before the request is sent. A response that was redirected to another origin is a failed request. Sign-in and request authentication are out of scope; each request is authenticated by the product, in the host it passes, and the template carries no credentials. A request that never answers times out and shows the cell's cannot-be-shown state; the timeout is a named constant of the root, in milliseconds, and the value is set in the DESIGN. The transform sees only its declared variables (`response` and/or `params`), with no access to the host, the network, other widgets or any shared state; the root caps the response size it accepts, and the cap is set in the DESIGN.

**CEL library.** The template uses `@marcbachmann/cel-js` (MIT, no runtime dependencies, about 24 KB gzipped), version pinned, with `homogeneousAggregateLiterals: false` and `unlistedVariablesAreDyn: true`. The binding runner wraps it behind a small internal interface (parse, check, evaluate, convert to JSON), so it can be swapped in one module. `env.check()` and its caret errors give authors feedback before anything runs. Golden tests of typical transforms guard spec behaviour. The runner declares the form's variables explicitly. Because `unlistedVariablesAreDyn: true` makes `check()` accept an undeclared name, such a name fails at evaluation with an unknown-variable error; a golden test checks that a transform using it fails before any data reaches the widget. JSON numbers arrive as CEL `double`, and CEL never converts numbers implicitly, so authors write `r[1] + 1.0` or `int(r[1])`; a missing field is an error, so optional fields need `has()`.

**Evaluation cost.** Transforms run on the main thread, inside the initial-render window (`cpt-frontx-dashboard-nfr-initial-render`). Each transform is parsed and checked before any run, then runs once per load. The cost grows with the response size, which the response-size cap bounds, and with the number of transforms that depend on one response. The template fixes no estimate: the initial-render measurement on the reference dashboard includes every transform and records their time. The request timeout is a failure bound, not a render target.

### Consequences

* Good, because the binding is plain data in the dashboard JSON, so a dashboard author controls the data shaping with no product code, and the product writes no data code; the root runs the binding against the product's same-origin API.
* Good, because a shared request is sent once, keeping the dashboard fast and light on the API.
* Good, because a static binding needs no request, so a widget with fixed data shows at once.
* Good, because CEL is small, dependency-free, returns plain JS, gives authors caret feedback before anything runs, and the library is pinned and wrapped behind a small interface so it can be swapped in one module.
* Good, because a request timeout and a response-size cap contain a slow or huge response to its cell or larger view.
* Bad, because the single-maintainer library is a maintenance risk. Mitigation: pinning, the wrapper interface and golden tests; `@bufbuild/cel` is the alternative behind the same interface.
* Bad, because transform evaluation has no time bound: it runs on the main thread, no JS CEL library limits it, and no Worker is in scope, so a CPU-heavy transform can block the whole page. This is an accepted risk: dashboard sources are trusted, and the response-size cap bounds the input. The review trigger below covers evaluation-time limiting.
* Bad, because a failing shared request fails all its dependent cells (a known trade-off for sharing).
* Good, because a dashboard variable such as a period changes what every dependent cell shows with no product code, and only the cells whose request names it are re-run.
* Neutral, because the shared answers of every value the viewer picked stay held until teardown: at most one answer per combination of option values of the variables a shared request names.

### Confirmation

* A test runs the donut binding (`POST /…/run`, transform `{'slices': response.rows.map(r, {'label': string(r[0]), 'value': double(r[1])})}`) and confirms the stamped result validates against the `pie_chart` data type and reaches the widget through `render_widget`.
* A test confirms a request to a non-same-origin path or a method other than `GET`/`POST` is rejected before it is sent.
* An abuse-case test confirms the paths `//host/x`, `/\host/x`, `https://host/x` and a path with a tab or line break are rejected before they are sent, that an encoded form such as `/%2F%2Fhost/x` stays on the page origin, and that a response redirected to another origin fails the cell.
* A test confirms a request that never answers times out and the cell shows the cannot-be-shown state.
* A test confirms a transform that errors, or a result that fails validation, fails only its cell.
* A test confirms the root caps the response size it accepts, and an over-cap response fails the cell.
* A test confirms `env.check()` reports a malformed transform with a caret before the request is sent, that `has()` on a missing field does not error, and that a missing field without `has()` does.
* A test confirms the library is pinned and wrapped behind the internal interface, and that golden tests of typical transforms pass.
* A test confirms one network call is made per shared request, even when several widgets refer to it, and that every request is handed to the `DashboardHost` the root was given.
* A test confirms an unknown `source` (no matching entry in `requests`) fails only that cell before anything runs, and that a failing shared request fails all its dependent cells.
* A test confirms a static binding is evaluated and its result validated without a request.
* A test confirms a variable value with `&`, `=`, `#` and a space is encoded and appended after the path's own query, that a key already set, a `POST` body that is not an object and an unknown variable each fail the cell before anything is sent, and that the host gets no `variables` field.
* A test confirms that switching a variable re-requests only the dependent cells, sends a shared request once per value, and shows the second of two quick switches only.
* A test confirms that a dashboard whose variable default is outside its options, or whose options repeat a value, fails to load.
* The initial-render measurement on the reference dashboard records the time spent evaluating transforms inside the measured window.

### Dashboard variables: a second kind later

Today a variable has one kind, a choice from a list, and the variable type is closed (`unevaluatedProperties: false` on the variable and on each option). A second kind, such as a date range, is added as an optional `kind` field of this same type, whose absence means the choice from a list:

* The variable type gains `kind` (for example `enum: ["list", "date_range"]`, absent meaning `list`) and the date range's own fields. `options` and `default` become required only when `kind` is absent or `list`, through an `if`/`then` on `kind`, and the date range's fields only when `kind` is `date_range`.
* Every variable written today carries no `kind`, so it stays valid with the same meaning: no dashboard needs an edit.
* A root built before the change rejects a dashboard that uses `kind`: today's closed type refuses the unknown field, so that dashboard fails to load with the reason instead of being read as a list. A product upgrades the root before it serves such dashboards.
* A request still names a variable by name. A kind with more than one value (a start and an end) widens the request's `variables` value pattern to a variable part, such as `range.from`; today's values all match the wider pattern.
* A derived type of `variable.v1` is not the path. The dashboard's `variables` values `$ref` the base type directly and are plain data with no `id` that could name a derived type, and the base's `unevaluatedProperties: false` refuses every field a derived type adds: on the installed gts-plugin, a type derived from `variable.v1` with one more field has that field, and its own `id`, refused as unevaluated.

## Pros and Cons of the Options

### A CEL transform over the parsed JSON response

The binding is one of three forms; the transform is a CEL expression over its declared variables, run by the root, with a request timeout and a response-size cap.

* Good, because the binding is plain data, and the product writes no data code.
* Good, because CEL is small, dependency-free, returns plain JS, and gives caret feedback.
* Good, because the library is swappable behind the internal interface.
* Bad, because the library has a single maintainer and no conformance suite. Mitigation: pinning, the wrapper, golden tests.
* Bad, because no JS CEL library limits evaluation time, so a CPU-heavy transform can block the page. Accepted: dashboard sources are trusted, and the response-size cap bounds the input.

### A product-supplied data adapter

The product implements a data adapter the root calls; the dashboard carries a query the adapter interprets.

* Good, because the product controls the data shaping in its own code.
* Bad, because the product writes data code for every dashboard, which is what the template exists to avoid.
* Bad, because the shaping is not part of the dashboard, so a dashboard author cannot control it.

### JSONPath or jq over the response

The transform is a JSONPath or jq expression over the response.

* Good, because both are small and well-known.
* Bad, because JSONPath cannot reshape or compute (it only selects), so it cannot produce most widget data shapes.
* Bad, because jq is a C library wrapped for JS, with a larger footprint and a different language to learn.

### CEL library: `@marcbachmann/cel-js`

MIT, no runtime dependencies, about 24 KB gzipped (about 5% of the root budget), version 8.x, by one maintainer.

* Good, because it is small, has no dependencies and returns plain JS.
* Good, because its typed errors carry a code, a range and a caret, which gives authors the best feedback before anything runs.
* Neutral, because it needs `homogeneousAggregateLiterals: false` and `unlistedVariablesAreDyn: true` to run typical transforms.
* Bad, because it has one maintainer and runs no official cel-spec conformance suite. Mitigation: pinning, the wrapper interface and golden tests.

### CEL library: `@bufbuild/cel`

Apache-2.0, maintained by Buf, in beta.

* Good, because a company maintains it and it runs the official cel-spec conformance suite in CI.
* Bad, because it is about 68 KB gzipped (about 14% of the root budget) and depends on `@bufbuild/cel-spec`, `@bufbuild/re2` and, as a peer, `@bufbuild/protobuf`.
* Bad, because it returns CEL maps and lists that need a converter to JSON, and its errors carry weaker source locations.
* Neutral, because it stays the alternative behind the same internal interface.

### Sharing: named shared requests

A dashboard names a request once in `requests`, and widgets refer to it with `source`; the runner sends it once per dashboard load and holds the answer until teardown.

* Good, because sharing is explicit in the dashboard JSON and works for POST too.
* Good, because the template adds no coalescing code of its own.
* Bad, because a dashboard author must name a shared request to share data; identical own POSTs are never joined.

### Sharing: template-side coalescing of identical own requests

The root finds identical own requests in a dashboard and sends each once.

* Good, because authors share data without naming a request.
* Bad, because a product that wants identical GETs joined can do it in its own host, so template-side coalescing adds complexity for no gain.
* Bad, because it cannot coalesce POSTs, so named shared requests are still needed for POST.

### Binding forms: own, shared and static

A binding is one of three closed forms: its own request, a shared request the dashboard names, or values written into the dashboard.

* Good, because it covers data for one widget, data shared by several widgets (`cpt-frontx-dashboard-fr-shared-data`) and fixed data with no request (`cpt-frontx-dashboard-fr-static-data`).
* Bad, because there are three forms to validate and document, and a failing shared request fails every dependent cell.

### Binding forms: one own request per widget only

Every data widget has its own request and transform; there is no shared or static form.

* Good, because one form gives the simplest schema and runner.
* Bad, because widgets that show the same data each send their own request, and POSTs are never joined (`cpt-frontx-dashboard-fr-shared-data`).
* Bad, because a widget with fixed data needs a request (`cpt-frontx-dashboard-fr-static-data`).

## More Information

* **Review trigger**: revisit if the single-maintainer CEL library stops being maintained, or if a real transform needs evaluation-time limiting. The response-size cap of 1 MiB (1,048,576 decoded bytes) and the timeout of 30000 ms are set in the DESIGN. Grid rows are positional arrays: see [ADR-0005](0005-data-grid-library-v1.md) and the grid data type in the [widget catalog FEATURE](../features/feature-widget-catalog/FEATURE.md).
* **Scope**: this decision covers the three binding forms, shared requests, dashboard variables and how they build requests, the runner, the request path to the product's host, trust, timeout, safe mappings, and the CEL library. It does not cover the widget catalog data shapes ([ADR-0009](0009-subject-agnostic-widget-catalog-v1.md)), the GTS conventions or stamped data ([ADR-0003](0003-shared-data-types-and-schemas-v1.md)), the `widgets` domain or `render_widget` ([ADR-0007](0007-extension-domain-taxonomy-v1.md)), or the packages ([ADR-0010](0010-template-packages-and-host-contract-v1.md)).
* **Checklist applicability**: ARCH applicable; PERF applicable (request timeout, response-size cap, one request per shared request, transform evaluation inside the initial-render window); SEC applicable (the same-origin rule, no credentials, safe mappings, response-size cap); REL applicable (per-cell failure, timeout, shared-request failure); DATA applicable (the binding schema, CEL over the parsed JSON); INT applicable (same-origin API, the `DashboardHost` the product passes); OPS N/A; MAINT applicable (pinned, wrapped library); TEST applicable; COMPL applicable (MIT licence); UX N/A; BIZ applicable (the product writes no data code).
* **Security review**: the same-origin rule, the safe mappings and the response-size cap are reviewed as part of this decision by its decision makers; no separate security sign-off is recorded. Required abuse-case tests: cross-origin path variants and redirects, a transform that tries to reach a variable other than its declared ones (fails at evaluation with an unknown-variable error), and an over-cap response (see Confirmation). Security monitoring: not applicable, because the template runs no service (DESIGN §4.2).
* **Notes**: The PRD calls the binding's `transform` field 'an expression'; this ADR uses `transform` for the field name.
* Related: [google/cel-spec](https://github.com/google/cel-spec).

## Traceability

- **PRD**: [PRD.md](../PRD.md)
- **DESIGN**: [DESIGN.md](../DESIGN.md)

This decision directly addresses the following requirements or design elements:

* `cpt-frontx-dashboard-fr-no-product-data-code` / `cpt-frontx-dashboard-fr-same-origin-data` — the product writes no data code; the root runs the binding against the product's same-origin API, and requests go to same-origin absolute paths with `GET` or `POST` only.
* `cpt-frontx-dashboard-fr-safe-mappings` — the transform sees only its declared variables, with no host, network or shared state, and the root caps the response size.
* `cpt-frontx-dashboard-fr-shared-data` / `cpt-frontx-dashboard-fr-static-data` — data shared by several widgets is fetched once per dashboard load from a request the dashboard declares once, and a data widget can show data written into the dashboard, with no request, validated like fetched data.
* `cpt-frontx-dashboard-nfr-initial-render` — transforms run on the main thread inside the initial-render window, and their time is measured there; the request timeout is a failure bound, not a render target.
* `cpt-frontx-dashboard-fr-per-cell-failure` / `cpt-frontx-dashboard-fr-states` — a failed request, timeout, CEL error or data validation error affects only its cell or larger view, and a timed-out or failed cell shows the cannot-be-shown state.
