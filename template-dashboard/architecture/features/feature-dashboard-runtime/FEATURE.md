---
status: accepted
version: 1
date: 2026-10-31
description: "Feature: the dashboard runtime — hosting-agnostic mounting, the widgets domain registry, served GTS-file loading, the binding runner, the cell frame, the larger-view overlay, the placeholder, theme and language publishing, the owner state machine, and teardown."
---

# Feature: Dashboard Runtime

- [ ] `p1` - **ID**: `cpt-frontx-dashboard-featstatus-dashboard-runtime`

<!-- toc -->

- [1. Feature Context](#1-feature-context)
  - [1.1 Overview](#11-overview)
  - [1.2 Purpose](#12-purpose)
  - [1.3 Actors](#13-actors)
  - [1.4 References](#14-references)
- [2. Actor Flows (CDSL)](#2-actor-flows-cdsl)
  - [Open a dashboard](#open-a-dashboard)
  - [Open a larger view](#open-a-larger-view)
  - [Switch theme](#switch-theme)
  - [Leave a dashboard](#leave-a-dashboard)
- [3. Processes / Business Logic (CDSL)](#3-processes--business-logic-cdsl)
  - [Register the widgets domain](#register-the-widgets-domain)
  - [Load the served GTS file](#load-the-served-gts-file)
  - [Run a binding](#run-a-binding)
  - [Show the placeholder](#show-the-placeholder)
  - [Publish theme and language](#publish-theme-and-language)
- [4. States (CDSL)](#4-states-cdsl)
  - [Owner state](#owner-state)
  - [Cell state](#cell-state)
- [5. Definitions of Done](#5-definitions-of-done)
  - [Hosting-agnostic mount](#hosting-agnostic-mount)
  - [widgets domain and generated extensions](#widgets-domain-and-generated-extensions)
  - [Served-file loading](#served-file-loading)
  - [Binding runner](#binding-runner)
  - [Variables from the host](#variables-from-the-host)
  - [Cell frame and larger-view overlay](#cell-frame-and-larger-view-overlay)
  - [Placeholder](#placeholder)
  - [Theme and language publishing](#theme-and-language-publishing)
  - [Owner state machine and load lifecycle](#owner-state-machine-and-load-lifecycle)
  - [Initial render](#initial-render)
  - [No persistence](#no-persistence)
- [6. Acceptance Criteria](#6-acceptance-criteria)

<!-- /toc -->

## 1. Feature Context

- [ ] `p1` - `cpt-frontx-dashboard-feature-dashboard-runtime`

### 1.1 Overview

The code that renders a dashboard from its JSON: hosting-agnostic mounting, the `widgets` domain, the served GTS-file loading, the binding runner, the cell frame, the larger-view overlay, the placeholder, theme and language publishing, the owner state machine, and teardown.

**Trust boundary.** The dashboard JSON, the request answers and the data are untrusted: any fault in them stays in its cell or rejects the load with a reason. The host's code is product code: the template does not defend against a host that breaks the contract on purpose, beyond reading each widget object once, as a JSON copy, on load, so a widget whose own property getter throws fails only its cell, with `the widget cannot be read`.

### 1.2 Purpose

The product writes no data code; the runtime runs each widget's binding against the product's same-origin API, stamps and validates the result, and sends `render_widget` to the widget. It owns the cell frame and the larger-view overlay, maps the host theme id to a UI-kit scope for its own chrome, localizes its own text, and shows the cannot-be-shown state with a developer-log diagnostic on every failure. This feature also calls the cannot-be-shown state the placeholder: the two names mean one static display. It is hosting-agnostic.

**Requirements**: `cpt-frontx-dashboard-fr-dashboard-root`, `cpt-frontx-dashboard-fr-runtime-source`, `cpt-frontx-dashboard-fr-per-cell-failure` (cell and larger-view placeholders), `cpt-frontx-dashboard-fr-states`, `cpt-frontx-dashboard-fr-same-origin-data`, `cpt-frontx-dashboard-fr-no-product-data-code`, `cpt-frontx-dashboard-fr-shared-data`, `cpt-frontx-dashboard-fr-static-data`, `cpt-frontx-dashboard-fr-larger-view`, `cpt-frontx-dashboard-fr-theme`, `cpt-frontx-dashboard-fr-safe-mappings`, `cpt-frontx-dashboard-fr-isolation`, `cpt-frontx-dashboard-fr-accessibility` (root side: cell frame, larger-view overlay), `cpt-frontx-dashboard-nfr-initial-render`, `cpt-frontx-dashboard-nfr-no-persistence`, `cpt-frontx-dashboard-nfr-visual-quality` (root side: cell frame), `cpt-frontx-dashboard-nfr-accessibility` (root side: cell frame, larger-view overlay), `cpt-frontx-dashboard-contract-host`, `cpt-frontx-dashboard-contract-same-origin-api`, `cpt-frontx-dashboard-contract-runtime-loaded-json` (the served GTS file), `cpt-frontx-dashboard-interface-host`.

**Use cases**: `cpt-frontx-dashboard-usecase-view-dashboard`, `cpt-frontx-dashboard-usecase-adopt-template` (runtime side: hosting the dashboard root).

**Principles**: `cpt-frontx-dashboard-principle-render-only`, `cpt-frontx-dashboard-principle-per-instance-isolation`.

**Constraints**: `cpt-frontx-dashboard-constraint-same-origin-data`, `cpt-frontx-dashboard-constraint-hosting-agnostic`, `cpt-frontx-dashboard-constraint-one-gts-package`, `cpt-frontx-dashboard-constraint-one-root-per-registry` (registry and root side).

**Components**: `cpt-frontx-dashboard-component-dashboard-root` (runtime side), `cpt-frontx-dashboard-component-binding-runner`.

**Not applicable**: persistence/DB (no database, `cpt-frontx-dashboard-db-none`), auth beyond same-origin (sign-in is out of scope), compliance/privacy (no data stored).

### 1.3 Actors

| Actor | Role in Feature |
|-------|-----------------|
| `cpt-frontx-dashboard-actor-dashboard-viewer` | Opens a dashboard, opens/closes a larger view, switches theme. |
| `cpt-frontx-dashboard-actor-host-application` | Supplies a container, a dashboard id, and the theme and language values. |
| `cpt-frontx-dashboard-actor-consuming-backend` | Answers the requests a binding makes, same-origin. |

### 1.4 References

- **PRD**: [PRD.md](../../PRD.md)
- **Design**: [DESIGN.md](../../DESIGN.md) (§3.6 Interactions & Sequences): `cpt-frontx-dashboard-seq-runtime-flow`, `cpt-frontx-dashboard-seq-open-dashboard`, `cpt-frontx-dashboard-seq-open-larger-view`; stack: `cpt-frontx-dashboard-tech-dashboard-stack`.
- **Dependencies**: `cpt-frontx-dashboard-feature-dashboard-model`, `cpt-frontx-dashboard-feature-widget-contract`

## 2. Actor Flows (CDSL)

**Use cases**: `cpt-frontx-dashboard-usecase-view-dashboard`.

### Open a dashboard

- [ ] `p1` - **ID**: `cpt-frontx-dashboard-flow-dashboard-runtime-open`

**Actor**: `cpt-frontx-dashboard-actor-dashboard-viewer`

**Design**: `cpt-frontx-dashboard-seq-runtime-flow`, `cpt-frontx-dashboard-seq-open-dashboard`.

**Success Scenarios**:
- The viewer opens a dashboard id and sees the dashboard with every widget in its own state.
- The viewer returns to a dashboard the root has already loaded: the cells remount from the kept registrations without fetching the served file again, and every binding runs again.
- The viewer opens a dashboard id again after a dashboard-level failure: the root starts a new load.

**Error Scenarios**:
- The dashboard itself fails (file, type, validation, including an embedded widget that breaks the open widget base, or layout): the dashboard area shows the cannot-be-shown state.
- A widget fails (its own registration against the type its `id` names, missing `entry` or `data_type`, mount, binding, or `render_widget`): only its cell shows the cannot-be-shown state.
- The dashboard id names no dashboard in the served file: the dashboard area shows the cannot-be-shown state with a developer-log diagnostic naming the id.

**Steps**:
1. [ ] - `p1` - The host gives the root a container, a dashboard id, and the theme and language values. - `inst-dr-open-host`
2. [ ] - `p1` - **IF** the root's start failed (the registry rejected the `widgets` domain at an earlier mount) - `inst-dr-open-start-failed`
   1. [ ] - `p1` - Show the same dashboard-level cannot-be-shown state (`cpt-frontx-dashboard-algo-dashboard-runtime-show-placeholder`) and **RETURN**. - `inst-dr-open-start-failed-return`
3. [ ] - `p1` - **IF** the dashboard id is the one the root holds - `inst-dr-open-same`
   1. [ ] - `p1` - **IF** the root is loading this id, join the running load and **RETURN** its outcome. - `inst-dr-open-same-join`
   2. [ ] - `p1` - **IF** the root holds this id as loaded - `inst-dr-open-same-loaded`
      1. [ ] - `p1` - The root re-publishes theme and language (`cpt-frontx-dashboard-algo-dashboard-runtime-publish-theme`), remounts the cells from the kept registrations without fetching the served file again, and runs every binding again; the root does not re-fetch the served file, re-register the dashboard, or re-register the widget instances. - `inst-dr-open-same-remount`
      2. [ ] - `p1` - **RETURN** the dashboard shown. - `inst-dr-open-same-return`
   3. [ ] - `p1` - **ELSE** the root holds this id after a dashboard-level failure: start a new load at step 4. - `inst-dr-open-same-retry`
4. [ ] - `p1` - Show the dashboard-level loader ("Loading dashboard") in place of the dashboard, announced as a status. It stays until the dashboard is shown (step 18.1) or the cannot-be-shown state replaces it. - `inst-dr-open-loader`
5. [ ] - `p1` - On the root's first mount only, the root registers its bundle schemas. - `inst-dr-open-bundle`
6. [ ] - `p1` - On the root's first mount only, the root registers the `widgets` domain (`cpt-frontx-dashboard-algo-dashboard-runtime-register-domain`). - `inst-dr-open-domain`
7. [ ] - `p1` - **IF** the registry rejects the `widgets` domain - `inst-dr-open-domain-fail`
   1. [ ] - `p1` - **RETURN**. The domain algorithm has shown the dashboard-level cannot-be-shown state; this failed start has no exit. - `inst-dr-open-domain-fail-return`
8. [ ] - `p1` - The root publishes theme and language (`cpt-frontx-dashboard-algo-dashboard-runtime-publish-theme`). - `inst-dr-open-theme`
9. [ ] - `p1` - The root loads the served GTS file (`cpt-frontx-dashboard-algo-dashboard-runtime-load-file`). - `inst-dr-open-load`
10. [ ] - `p1` - **IF** a new dashboard id has superseded this load, or the root has been unmounted, since this load began - `inst-dr-open-superseded-1`
    1. [ ] - `p1` - Discard this load: unregister any extension registered so far, show nothing, mount nothing, and **RETURN**. This check runs after this step and again after each later step that waits. - `inst-dr-open-superseded-1-return`
11. [ ] - `p1` - **IF** the load fails (the file fetch fails or times out, a type id of the base file equals a bundle base, or the registry rejects a type, manifest or entry of the base file) - `inst-dr-open-load-fail`
    1. [ ] - `p1` - Show the dashboard-level cannot-be-shown state (`cpt-frontx-dashboard-algo-dashboard-runtime-show-placeholder`), mount no cell, and **RETURN**. - `inst-dr-open-load-fail-show`
12. [ ] - `p1` - **IF** the dashboard id names no dashboard in the served file - `inst-dr-open-unknown`
    1. [ ] - `p1` - Show the dashboard-level cannot-be-shown state (`cpt-frontx-dashboard-algo-dashboard-runtime-show-placeholder`), write a developer-log diagnostic naming the id, mount no cell, and **RETURN**. - `inst-dr-open-unknown-show`
13. [ ] - `p1` - **FOR EACH** embedded widget instance (each cell's `widget` and each `larger_view`), the root registers it on its own (`cpt-frontx-dashboard-algo-widget-contract-validate-instance`), before the dashboard: under reference lookup the dashboard names each embedded widget by its `id`. - `inst-dr-open-register-widget`
    1. [ ] - `p1` - **IF** the widget instance fails its own registration, or its type's `entry` came with a widget part left out, mark that cell, or that larger view for a `larger_view` instance, failed at cell scope (`cpt-frontx-dashboard-algo-dashboard-model-failure-attribution`), and register a stand-in in its place: an instance of the bundle's open stand-in type with every field of the failed widget except its `id` (DESIGN §3.6 step 4); the dashboard and the other cells are unaffected. After that, for a cell with `frame` `false` whose widget carries a `title` or `description`, or that carries a `larger_view`, a `size` other than `large` or any `height` (a frameless cell draws no header and is drawn full width at the height of its content, so the root fails the cell rather than drop them): a valid widget there stays registered as it is, with no stand-in, and its cell and larger view fail with a reason that names each of them; a widget that failed its own registration keeps its stand-in and its own reason. - `inst-dr-open-register-widget-fail`
14. [ ] - `p1` - The root registers the dashboard instance, each failed widget replaced by its stand-in, which validates it; embedded widgets are checked only against the open widget base. - `inst-dr-open-register`
15. [ ] - `p1` - The root runs the layout checks (`cpt-frontx-dashboard-algo-dashboard-model-layout-checks`). - `inst-dr-open-layout`
16. [ ] - `p1` - **IF** a new dashboard id has superseded this load, or the root has been unmounted - `inst-dr-open-superseded-2`
    1. [ ] - `p1` - Discard this load: unregister any extension registered so far, show nothing, mount nothing, and **RETURN**. - `inst-dr-open-superseded-2-return`
17. [ ] - `p1` - **IF** the registry rejects the dashboard instance (step 14), including an embedded widget that breaks the open widget base such as one with no `id`, or a layout check fails; each is dashboard scope by `cpt-frontx-dashboard-algo-dashboard-model-failure-attribution` - `inst-dr-open-fail`
    1. [ ] - `p1` - Show the dashboard-level cannot-be-shown state (`cpt-frontx-dashboard-algo-dashboard-runtime-show-placeholder`), mount no cell, and **RETURN**. - `inst-dr-open-fail-show`
18. [ ] - `p1` - **ELSE** - `inst-dr-open-ok`
    1. [ ] - `p1` - The root places the cells (`cpt-frontx-dashboard-algo-dashboard-model-place-cells`), the dashboard replaces the dashboard-level loader, and the owner state becomes Loaded. From here the bindings run in Loaded, each cell in its own cell state (`cpt-frontx-dashboard-state-dashboard-runtime-cell`). - `inst-dr-open-loaded`
    2. [ ] - `p1` - Collect the shared request names referenced by any cell or larger view, and run the source check (`cpt-frontx-dashboard-algo-dashboard-model-check-sources`), which marks each cell or larger view whose `source` is unknown as failed. - `inst-dr-open-shared-collect`
    3. [ ] - `p1` - Send each referenced shared request once; hold each response until teardown. - `inst-dr-open-shared-send`
    4. [ ] - `p1` - **FOR EACH** cell in parallel - `inst-dr-open-cell`
       1. [ ] - `p1` - **IF** the cell's widget instance failed its own registration (step 13.1) - `inst-dr-open-cell-regfail`
          1. [ ] - `p1` - Show the cell's cannot-be-shown state (`cpt-frontx-dashboard-algo-dashboard-runtime-show-placeholder`); this cell stops here and the other cells are unaffected. - `inst-dr-open-cell-regfail-show`
       2. [ ] - `p1` - Read the widget type and its effective traits `entry` and `data_type` (`cpt-frontx-dashboard-algo-widget-contract-effective-traits`). - `inst-dr-open-traits`
       3. [ ] - `p1` - **IF** the traits can't be resolved, or the `entry` or `data_type` they name doesn't exist - `inst-dr-open-traits-fail`
          1. [ ] - `p1` - Show the cell's cannot-be-shown state; this cell stops here and the other cells are unaffected. - `inst-dr-open-traits-fail-show`
       4. [ ] - `p1` - Register a generated extension in `widgets`, mount it with `mount_ext` (`history: "none"`); the cell frame shows a loader for own and shared forms only. The registry loads the entry's widget bundle from the `publicPath` of the manifest the entry names; each generated extension gets its own evaluation of the bundle. - `inst-dr-open-mount`
       5. [ ] - `p1` - **IF** the generated extension's registration or `mount_ext` fails, including a widget bundle that does not load, answers outside 2xx, throws while it evaluates, or is served from an origin outside the allowed bundle origins - `inst-dr-open-mount-fail`
          1. [ ] - `p1` - Show the cell's cannot-be-shown state; this cell stops here and the other cells are unaffected. - `inst-dr-open-mount-fail-show`
       6. [ ] - `p1` - **IF** the widget has a binding (data widget) - `inst-dr-open-binding`
          1. [ ] - `p1` - Run the binding by form (`cpt-frontx-dashboard-algo-dashboard-runtime-run-binding`): own — send the request and evaluate the transform on `response`; shared — start the shared request if not running, then evaluate the transform on `response` and `params`; static — evaluate the transform on `params` at once, with no loader. - `inst-dr-open-run`
          2. [ ] - `p1` - **IF** the viewer has left the dashboard or a new dashboard id has begun to load since the binding started (checked after each step of this cell that waits: the request, the shared request, and `mount_ext`) - `inst-dr-open-superseded-3`
             1. [ ] - `p1` - Drop the result: register nothing, send nothing, show nothing; this cell stops here. The owner state machine handles the rest (Loaded to Loading). - `inst-dr-open-superseded-3-return`
          3. [ ] - `p1` - **IF** the binding fails (request, timeout, CEL, data validation, registration, or the shared request it depends on) - `inst-dr-open-binding-fail`
             1. [ ] - `p1` - Show the cell's cannot-be-shown state; this cell stops here and the other cells are unaffected. - `inst-dr-open-binding-fail-show`
          4. [ ] - `p1` - **ELSE** send `render_widget {render, value_format?, data}` once `mount_ext` finished and the data is valid. - `inst-dr-open-render`
       7. [ ] - `p1` - **ELSE** (markdown_card, no binding) send `render_widget {render}` at once, with no loader. - `inst-dr-open-nodata`
       8. [ ] - `p1` - **IF** the `render_widget` action chain ends in `fallback`, or does not finish within the domain's `defaultActionTimeout` (30000 ms) - `inst-dr-open-render-fail`
          1. [ ] - `p1` - Show the cell's cannot-be-shown state with a developer-log diagnostic; the other cells are unaffected. - `inst-dr-open-render-fail-show`
       9. [ ] - `p1` - **ELSE** the cell is shown. The widget's handler resolves as soon as it accepts the payload, before drawing; a widget that fails while drawing shows the cannot-be-shown state itself, in its cell (a widget obligation). - `inst-dr-open-render-ok`
19. [ ] - `p1` - **RETURN** the dashboard shown. Every failure path above has returned already; a cell that stopped shows its own cannot-be-shown state inside the shown dashboard. - `inst-dr-open-return`

### Open a larger view

- [ ] `p1` - **ID**: `cpt-frontx-dashboard-flow-dashboard-runtime-larger-view`

**Actor**: `cpt-frontx-dashboard-actor-dashboard-viewer`

**Design**: `cpt-frontx-dashboard-seq-open-larger-view`.

**Success Scenarios**:
- The viewer clicks the larger-view button and sees the larger-view widget; closing returns to the unchanged dashboard, with focus back on the larger-view button.

**Error Scenarios**:
- The larger-view widget fails: the overlay shows the cannot-be-shown state; the cell and the other cells are unaffected.

**Steps**:
1. [ ] - `p1` - The viewer clicks the cell's larger-view button (shown only when the cell has `larger_view`). - `inst-dr-lv-click`
2. [ ] - `p1` - The root opens the overlay inside its own container, as a dialog (`role="dialog"`, `aria-modal="true"`) whose accessible name is the larger-view widget's title. The page behind the overlay becomes inert, and focus moves into the overlay. - `inst-dr-lv-open`
3. [ ] - `p1` - The root runs the cell flow (`cpt-frontx-dashboard-flow-dashboard-runtime-open`, steps 18.4.1–18.4.9) for the `larger_view` widget, with its own binding: own form as for a cell; shared form: evaluate the transform on the held response and the binding's `params`; static as for a cell. The cell and its larger view are independent snapshots for the own and static forms; a shared-form larger view shows the same held response as its cell. A failure shows the cannot-be-shown state in the overlay only. - `inst-dr-lv-run`
4. [ ] - `p1` - While the overlay is open, Tab and Shift+Tab cycle focus inside it. The close button, Escape, a click outside, or a page refresh closes it; on close, focus returns to the larger-view button that opened it. - `inst-dr-lv-close`
5. [ ] - `p1` - An open larger view closes (its extension unmounts) when the viewer leaves the dashboard or another dashboard loads. - `inst-dr-lv-lifecycle`
6. [ ] - `p1` - **RETURN** the unchanged dashboard. - `inst-dr-lv-return`

### Switch theme

- [ ] `p2` - **ID**: `cpt-frontx-dashboard-flow-dashboard-runtime-theme`

**Actor**: `cpt-frontx-dashboard-actor-host-application`

**Success Scenarios**:
- The host switches the theme; every widget and the larger view restyle without a reload or a re-run binding.
- The host changes the language; the root's own text and every widget follow it without a reload or a re-run binding.

**Steps**:
1. [ ] - `p1` - The host updates the theme (or language) shared property. - `inst-dr-theme-host`
2. [ ] - `p1` - The root maps the host theme id to a UI-kit scope for its own chrome (cell frame, loaders, overlay, close button) and, for a language change, localizes its own text. - `inst-dr-theme-map`
3. [ ] - `p1` - The root republishes the value on `widgets` (`cpt-frontx-dashboard-algo-dashboard-runtime-publish-theme`). - `inst-dr-theme-repub`
4. [ ] - `p1` - Each widget selects the new kit scope (theme) or follows the new language; chart colours follow the kit scope through its custom properties, with nothing rebuilt. - `inst-dr-theme-widgets`
5. [ ] - `p1` - **RETURN** — no binding re-runs, nothing remounts. - `inst-dr-theme-return`

### Leave a dashboard

- [ ] `p2` - **ID**: `cpt-frontx-dashboard-flow-dashboard-runtime-leave`

**Actor**: `cpt-frontx-dashboard-actor-dashboard-viewer`

**Success Scenarios**:
- Every extension is unmounted, including any open larger view; late results are dropped.

**Steps**:
1. [ ] - `p1` - The viewer leaves the dashboard. - `inst-dr-leave-go`
2. [ ] - `p1` - The root closes any open larger view (its extension unmounts) and unmounts every cell extension. - `inst-dr-leave-unmount`
3. [ ] - `p1` - The root keeps the types, the dashboard instance, the widget instances, the stamped data instances, and the generated extensions registered, so a return to the same dashboard reuses them. - `inst-dr-leave-keep`
4. [ ] - `p1` - Before another dashboard loads, the root unregisters the generated extensions. - `inst-dr-leave-unregister`
5. [ ] - `p1` - The root does not cancel requests in flight: each one ends with its answer or its 30000 ms timeout. The root drops any result for an extension no longer mounted, registers no stamped data for it, and never sends to an unmounted extension. - `inst-dr-leave-drop`
6. [ ] - `p1` - The root drops the held shared responses. - `inst-dr-leave-shared`
7. [ ] - `p1` - A load superseded by a new dashboard id drops its shared responses and unregisters its generated extensions. - `inst-dr-leave-supersede`
8. [ ] - `p1` - The types, the dashboard instances, the widget instances and the stamped data instances stay registered for the life of the root. Stamped-data ids are deterministic (one per widget per role), so the next load of a dashboard replaces their content; the total is bounded by the widgets in the served file. A page reload clears all of it. Nothing is persisted. - `inst-dr-leave-kept`
9. [ ] - `p1` - **RETURN**. - `inst-dr-leave-return`

## 3. Processes / Business Logic (CDSL)

### Register the widgets domain

- [ ] `p2` - **ID**: `cpt-frontx-dashboard-algo-dashboard-runtime-register-domain`

**Input**: the hosting form of the root (a single-page application or an MFE); it decides who creates the root and where it mounts, not how the registry is built.

**Output**: the `widgets` domain registered in the root's registry.

**Steps**:
1. [ ] - `p1` - Obtain the registry. The root builds its own registry, synchronously when it is created, over its own isolated type store; the product passes no registry, and the registry survives an unmount of the root's host. One root owns one registry (`cpt-frontx-dashboard-constraint-one-root-per-registry`), so several roots on one page each have their own. The registry loads widget entries with the FrontX MF handler (`MfeHandlerMF` of `@gears-frontx/mfes`), from allowed bundle origins only: the page's own origin unless the product lists more. - `inst-dr-domain-registry`
2. [ ] - `p1` - Register the `widgets` domain with `sharedProperties` theme and language, `actions` [`mount_ext`, `unmount_ext`], `extensionsActions` [`render_widget`], `extensionsTypeId` the `widgets` extension type, `defaultActionTimeout` 30000 ms, `lifecycleStages` [] and `extensionsLifecycleStages` [], no `route`. - `inst-dr-domain-declare`
3. [ ] - `p1` - **IF** the registry throws while the root builds the domain, the root has a failed start. Every root builds its own registry, so no other root can hold the `widgets` domain there first; what remains is a domain the registry cannot accept, such as one whose listed action has no handler (ADR-0007). - `inst-dr-domain-reject`
   1. [ ] - `p1` - The root logs the reason and shows the dashboard-level cannot-be-shown state (`cpt-frontx-dashboard-algo-dashboard-runtime-show-placeholder`); no dashboard loads, and every later mount or load of that root shows the same placeholder. Every other root is unaffected. **RETURN** a dashboard-level failure. - `inst-dr-domain-reject-show`
4. [ ] - `p1` - Attach the domain's root element through the FrontX mounter. - `inst-dr-domain-attach`
5. [ ] - `p1` - **RETURN** the domain. - `inst-dr-domain-return`

### Load the served GTS file

- [ ] `p2` - **ID**: `cpt-frontx-dashboard-algo-dashboard-runtime-load-file`

**Input**: the served GTS file URL. The root does not depend on where the file comes from.

**Output**: the file's types, manifests and entries registered, the root's own index of what it registered, and the manifest and entry ids that the widget parts left out failed to bring.

**Steps**:
1. [ ] - `p1` - Fetch the served GTS file with a timeout of 30000 ms. - `inst-dr-load-fetch`
2. [ ] - `p1` - **IF** the fetch fails or times out - `inst-dr-load-fail`
   1. [ ] - `p1` - **RETURN** a dashboard-level failure. - `inst-dr-load-fail-return`
3. [ ] - `p1` - **IF** any type id of the base file (the whole file when it is served joined) equals a bundle base - `inst-dr-load-guard`
   1. [ ] - `p1` - Reject the whole file; nothing registers. **RETURN** a dashboard-level failure. - `inst-dr-load-guard-return`
4. [ ] - `p1` - Register the base file's types, manifests and entries. - `inst-dr-load-register`
5. [ ] - `p1` - **IF** the registry rejects any type, manifest or entry of the base file - `inst-dr-load-reject`
   1. [ ] - `p1` - **RETURN** a dashboard-level failure. The base file is trusted, product-controlled input and one release unit, so one rejected item fails every dashboard in it. - `inst-dr-load-reject-return`
6. [ ] - `p1` - **FOR EACH** widget part, when the file is served in parts, in list order - `inst-dr-load-parts`
   1. [ ] - `p1` - Check the part whole before anything of it registers, then register its types, then its manifests and entries. A part is left out, before anything of it registers, when a type id equals a bundle base, when the store already holds a type id with other content (the store keeps the first definition; a part that brings the same content registers), when the base file, a registered part or the store before the file (the stand-in manifest and entry, the plugin's lifecycle stages) already holds one of its manifest, entry or other instance ids with other content (the same content registers), or when the base file or a registered part already serves one of its dashboard ids with other content (the same content registers). It is also left out when the registry rejects one of its types, manifests or entries; the store cannot take back what the part registered before that item, so those types and instances stay. - `inst-dr-load-part-register`
   2. [ ] - `p1` - **IF** the part is left out - `inst-dr-load-part-reject`
      1. [ ] - `p1` - Write one developer-log diagnostic naming the part and the reason, and record the manifest and entry ids the part failed to bring, never an id the base file or a registered part already brought: every widget whose type names one of those entries fails in its own cell (Open a dashboard, step 13.1). The part's dashboards never load; the other parts and every other dashboard still load. - `inst-dr-load-part-reject-record`
   3. [ ] - `p1` - **ELSE** add the part's dashboards to the file's dashboards, and clear from the recorded ids each manifest and entry id the part registered. - `inst-dr-load-part-accept`
7. [ ] - `p1` - Keep the root's own index of what it registered (FrontX can't list registered instances). - `inst-dr-load-index`
8. [ ] - `p1` - **RETURN** the registered set. - `inst-dr-load-return`

### Run a binding

- [ ] `p2` - **ID**: `cpt-frontx-dashboard-algo-dashboard-runtime-run-binding`

**Input**: a binding (one of three forms: own, shared, or static), the widget id, the role, the data type id, the dashboard's `requests` map (for the shared form), and the value of each variable the host gives.

**Output**: the stamped, validated data; a cell-scope failure; or a dropped result when the cell's extension is no longer mounted or a newer run of the cell started.

A request that names variables in its `variables` field is **built** before the same-origin check, which runs on the built request: for `GET` each key is appended to the path's query with the host's value of its variable as text, encoded by `URLSearchParams`, after any query already in the path; for `POST` each key becomes a top-level field of the body with the value as given, which must then be an object (an absent body counts as `{}`). A key already present in the path's query or in the body (`request <method> <path>: key <k> is already set`), a `POST` body that is not an object, a variable the host gives no value for (`the host gives no value for the variable <name>`), and a value that is not a string, a finite number or a boolean (`the value of the variable <name> is not a string, a finite number or a boolean`) are each a cell-scope failure before anything is sent; no reason carries the value. The host gets the built request, without the `variables` field.

A request is **failed** when any of these happens, and each is a cell-scope failure with a developer-log diagnostic:

- a network error;
- no answer within 30000 ms (timeout);
- a status outside 2xx, including 401 and 403;
- a redirect to another origin;
- a body that is not valid JSON (an empty body is not valid JSON);
- a body over the response-size cap of 1 MiB: 1,048,576 bytes of the decoded body.

There is no retry and no circuit breaker; the product's API owns errors, throttling and access. A request is **same-origin** when its `path` has a single leading `/` that is not followed by `/` or `\`, and no control characters (the request type's `path` pattern), and when the origin of the path resolved against the page origin equals the page origin. The root checks this before it sends anything.

**Steps**:
1. [ ] - `p1` - Parse and check the CEL transform through the internal interface. **IF** it fails, **RETURN** a cell-scope failure before anything is sent or evaluated. - `inst-dr-bind-parse`
2. [ ] - `p1` - **SWITCH** on the binding form. - `inst-dr-bind-form`
3. [ ] - `p1` - **own** (`{request, transform}`): - `inst-dr-bind-own`
   1. [ ] - `p1` - Build the request from the host's variable values; **IF** building fails, **RETURN** a cell-scope failure before the request is sent. **IF** the built request is not same-origin or not `GET`/`POST`, **RETURN** a cell-scope failure before the request is sent. - `inst-dr-bind-own-origin`
   2. [ ] - `p1` - Send the request, a GET or POST request through the host's data request, with a timeout of 30000 ms; a request that never answers times out. A POST body is sent as JSON. The root adds no credentials and no headers beyond what the product's `DashboardHost` sends. - `inst-dr-bind-own-request`
   3. [ ] - `p1` - **IF** the cell's extension is no longer mounted (the viewer left the dashboard, or another dashboard id began to load), or a newer run of this cell started (a variable it depends on changed), **RETURN** a dropped result: nothing is shown, evaluated, stamped or registered. - `inst-dr-bind-own-dropped`
   4. [ ] - `p1` - **IF** the request failed (any cause listed above), **RETURN** a cell-scope failure. - `inst-dr-bind-own-fail`
   5. [ ] - `p1` - Evaluate the CEL transform on `response` (the parsed JSON body) through the internal interface. - `inst-dr-bind-own-cel`
4. [ ] - `p1` - **shared** (`{source, params?, transform}`): - `inst-dr-bind-shared`
   1. [ ] - `p1` - **IF** the source check (`cpt-frontx-dashboard-algo-dashboard-model-check-sources`) marked this cell or larger view failed because its `source` is not in the dashboard's `requests` map, **RETURN** a cell-scope failure before anything runs. - `inst-dr-bind-shared-unknown`
   2. [ ] - `p1` - Build the shared request from the host's variable values. **IF** the built request (method, built path and built body) is not running, start it (send once); the shared request uses the same building, same-origin, GET/POST, timeout, and response-size cap checks, and the same failure causes, as the own form; hold the response of each built request until teardown, so every cell on it reads one answer and a value seen before sends nothing. - `inst-dr-bind-shared-start`
   3. [ ] - `p1` - **IF** the cell's extension is no longer mounted, or a newer run of this cell started, **RETURN** a dropped result: nothing is shown, evaluated, stamped or registered. - `inst-dr-bind-shared-dropped`
   4. [ ] - `p1` - **IF** the shared request failed (any cause listed above), **RETURN** a cell-scope failure; every dependent cell fails, and the developer log names the request. - `inst-dr-bind-shared-fail`
   5. [ ] - `p1` - When it answers, evaluate the CEL transform on `response` and `params` through the internal interface. - `inst-dr-bind-shared-cel`
5. [ ] - `p1` - **static** (`{params?, transform}`): - `inst-dr-bind-static`
   1. [ ] - `p1` - Evaluate the CEL transform on `params` (absent means `{}`) at once, with no loader, through the internal interface. - `inst-dr-bind-static-cel`
6. [ ] - `p1` - **IF** the transform errors, **RETURN** a cell-scope failure. - `inst-dr-bind-celfail`
7. [ ] - `p1` - Stamp the result with `<data type>~<UUIDv5(namespace, widget id | role)>`, a deterministic combined id. - `inst-dr-bind-stamp`
8. [ ] - `p1` - Register the stamped data, which validates it against the data type. - `inst-dr-bind-register`
9. [ ] - `p1` - **IF** registration rejects it, **RETURN** a cell-scope failure. - `inst-dr-bind-regfail`
10. [ ] - `p1` - **RETURN** the stamped, validated data. - `inst-dr-bind-return`

CEL evaluation has no time bound, because no Worker is in scope. Its input is bounded by the 1 MiB response-size cap, and dashboard authors are trusted. This is an accepted risk: the root never claims a transform timeout.

### Show the placeholder

- [ ] `p1` - **ID**: `cpt-frontx-dashboard-algo-dashboard-runtime-show-placeholder`

**Input**: a cannot-be-shown trigger, its level (dashboard or cell), and its place.

**Output**: one cannot-be-shown state (the placeholder) in that place and one diagnostic in the developer log.

The placeholder is this feature's name for the cannot-be-shown state: the static display that replaces a dashboard, a cell, or a larger view that cannot be shown. Its text is "This dashboard cannot be shown" at dashboard level and "This widget cannot be shown" in a cell or a larger view.

**Steps**:
1. [ ] - `p1` - **IF** the trigger is at dashboard level - `inst-dr-placeholder-if-dashboard`
   1. [ ] - `p1` - The root replaces the dashboard-level loader with one placeholder in place of the dashboard and mounts no cell. - `inst-dr-placeholder-dashboard`
2. [ ] - `p1` - **ELSE** the trigger is at cell level: the root shows the placeholder in that cell, or in the overlay for a larger view, only; the other cells are unaffected. - `inst-dr-placeholder-cell`
3. [ ] - `p1` - The placeholder is static: no retry, no error text, no failure class; the root localizes it, draws it in its mapped UI-kit scope, and exposes its text to assistive technology. - `inst-dr-placeholder-static`
4. [ ] - `p1` - Write one diagnostic to the developer log that names the dashboard id, the widget id and widget type, and the failing step or request; the diagnostic is never shown to the viewer. - `inst-dr-placeholder-diagnostic`
5. [ ] - `p1` - **RETURN**. - `inst-dr-placeholder-return`

The triggers, by level:

| Level | Trigger | Detected in |
|---|---|---|
| Dashboard | the `widgets` domain is rejected by the registry | Register the widgets domain, step 3; Open a dashboard, steps 2 and 7 |
| Dashboard | the served GTS file can't be fetched, or its fetch times out | Load the served GTS file, step 2; Open a dashboard, step 11 |
| Dashboard | a type id of the base file equals a bundle base | Load the served GTS file, step 3; Open a dashboard, step 11 |
| Dashboard | the registry rejects a type, manifest or entry of the base file | Load the served GTS file, step 5; Open a dashboard, step 11 |
| Dashboard | the dashboard id names no dashboard in the served file | Open a dashboard, step 12 |
| Dashboard | the dashboard fails validation (including an embedded widget that breaks the open widget base, such as one with no `id`) or a layout check fails | Open a dashboard, step 17 |
| Cell | a widget instance fails its own registration against the type its `id` names | Open a dashboard, steps 13.1 and 18.4.1 |
| Cell | the widget's `entry` or `data_type` doesn't exist | Open a dashboard, step 18.4.3 |
| Cell | the widget's `entry` came with a widget part left out | Load the served GTS file, step 6; Open a dashboard, step 13.1 |
| Cell | the generated extension's registration or `mount_ext` fails, its widget bundle fails to load or is served from an origin that is not allowed | Open a dashboard, step 18.4.5 |
| Cell | the transform fails to parse or check | Run a binding, step 1 |
| Cell | the request is not same-origin or not GET/POST | Run a binding, step 3.1 |
| Cell | the request fails (any listed cause, including the timeout and the response-size cap) | Run a binding, step 3.4 |
| Cell | an unknown `source` (shared binding) | Open a dashboard, step 18.2 (`cpt-frontx-dashboard-algo-dashboard-model-check-sources`); Run a binding, step 4.1 |
| Cell | the shared request it depends on fails (any listed cause) | Run a binding, step 4.4 |
| Cell | the CEL transform errors | Run a binding, step 6 |
| Cell | data validation rejects the stamped data | Run a binding, step 9 |
| Cell | the `render_widget` action chain ends in `fallback` or times out | Open a dashboard, step 18.4.8 |

### Publish theme and language

- [ ] `p2` - **ID**: `cpt-frontx-dashboard-algo-dashboard-runtime-publish-theme`

**Input**: the host theme id and the host language, on every mount of the root and on every change while the root is mounted.

**Output**: both values published unchanged on the `widgets` domain, and the root's own chrome in the matching UI-kit scope and language.

**Steps**:
1. [ ] - `p2` - Read both values: in an MFE, through the bridge's `getProperty`; in a single-page application, from the application. On a mount, read the current values; on a change, take the new value from the subscription. - `inst-dr-publish-read`
2. [ ] - `p2` - Map the host theme id to the light or dark scope of `@gears-frontx/ui-kit` for the root's own chrome: the cell frame, the loaders, the overlay, and the close button. - `inst-dr-publish-map`
3. [ ] - `p2` - Localize the root's own text for the host language. - `inst-dr-publish-localize`
4. [ ] - `p2` - Publish both values unchanged on the `widgets` domain, updating the shared property. - `inst-dr-publish-update`
5. [ ] - `p2` - On every mount, both values are on the domain before any extension mounts or mounts again, because every widget entry requires them; FrontX does not replay property updates when a bridge is activated again, so a change made while the root was unmounted reaches the domain through this republication. - `inst-dr-publish-before-mount`
6. [ ] - `p2` - **RETURN**. A change sends no action, no loader shows again, and nothing is remounted. - `inst-dr-publish-return`

## 4. States (CDSL)

### Owner state

- [ ] `p1` - **ID**: `cpt-frontx-dashboard-state-dashboard-runtime-owner`

**States**: Idle, Started, Loading, Loaded, Placeholder

**Initial State**: Idle, before the first mount of the root

**Transitions**:
1. [ ] - `p1` - **FROM** Idle **TO** Started **WHEN** the root registers the `widgets` domain (`cpt-frontx-dashboard-algo-dashboard-runtime-register-domain`). - `inst-dr-owner-idle-started`
2. [ ] - `p1` - **FROM** Idle **TO** Placeholder **WHEN** the registry rejects the `widgets` domain; this start-failed placeholder has no exit. - `inst-dr-owner-idle-placeholder`
3. [ ] - `p1` - **FROM** Started **TO** Loading **WHEN** the root begins to load a dashboard id; the dashboard-level loader shows. - `inst-dr-owner-started-loading`
4. [ ] - `p1` - **FROM** Loading **TO** Loading **WHEN** the root begins to load another dashboard id; the earlier load is superseded and discarded, and nothing of it mounts. - `inst-dr-owner-loading-superseded`
5. [ ] - `p1` - **FROM** Loading **TO** Started **WHEN** the root is unmounted while loading; the load is discarded and nothing mounts. - `inst-dr-owner-loading-unmount`
6. [ ] - `p1` - **FROM** Loading **TO** Loaded **WHEN** the dashboard passes its dashboard-level checks (`cpt-frontx-dashboard-flow-dashboard-runtime-open`, step 17). Loading ends there: the dashboard replaces the dashboard-level loader, and the bindings run in Loaded, each cell in its own cell state. - `inst-dr-owner-loading-loaded`
7. [ ] - `p1` - **FROM** Loading **TO** Placeholder **WHEN** a dashboard-level trigger occurs at load (the file can't be fetched or its fetch times out, a type id of the base file equals a bundle base, the registry rejects a type, manifest or entry of the base file, the dashboard fails validation, a layout check fails, or the dashboard id names no dashboard in the served file); the placeholder replaces the dashboard-level loader. - `inst-dr-owner-loading-placeholder`
8. [ ] - `p1` - **FROM** Loaded **TO** Loading **WHEN** the root begins to load another dashboard id, including while the loaded dashboard's bindings still run. First the root closes any open larger view, unmounts the cells, unregisters the generated extensions of the loaded dashboard, and drops its held shared responses; every later result of its bindings is dropped, so nothing of it is sent or shown after that. - `inst-dr-owner-loaded-loading`
9. [ ] - `p1` - **FROM** Placeholder **TO** Loading **WHEN** the root begins to load another dashboard id, or the same dashboard id again after a dashboard-level failure; never when the placeholder comes from a failed start. - `inst-dr-owner-placeholder-loading`

The root keeps, per state: in Loading, the dashboard id it loads; in Loaded and Placeholder, the dashboard id, its outcome, and the registered generated extensions by widget id.

A request to load the id that is already loading joins that load. A superseded or discarded load is checked after each step that waits.

Unmounting the root in Loaded or Placeholder changes no state. A root mounted again with the dashboard id it holds in Loaded shows the dashboard again, mounts its cells again and runs every binding again, with no transition.

Recovery from a dashboard-level failure: mounting the root again with the same dashboard id starts a new load (Placeholder to Loading), and a page reload also recovers. A failed start has no recovery inside the page; only a page reload starts the root again.

### Cell state

- [ ] `p2` - **ID**: `cpt-frontx-dashboard-state-dashboard-runtime-cell`

**States**: `loading`, `shown`, `cannot-be-shown`

**Initial State**: `loading` for the own and shared forms; a static binding and a `markdown_card` start without a loader

**Transitions**:
1. [ ] - `p1` - **FROM** `loading` **TO** `shown` **WHEN** `render_widget {render, value_format?, data}` is sent with valid data and its action chain ends in `next` within the domain's `defaultActionTimeout` (30000 ms). - `inst-dr-cell-shown`
2. [ ] - `p1` - **FROM** `loading` **TO** `cannot-be-shown` **WHEN** the request fails (any cause listed in `cpt-frontx-dashboard-algo-dashboard-runtime-run-binding`), the shared request it depends on fails, its `source` is unknown, the transform fails to parse or check, the CEL transform errors, data validation fails, or mount fails. - `inst-dr-cell-cannot`
3. [ ] - `p1` - **FROM** `loading` **TO** `cannot-be-shown` **WHEN** the `render_widget` action chain ends in `fallback` or does not finish within the domain's `defaultActionTimeout` (30000 ms); the developer log gets a diagnostic. - `inst-dr-cell-render-cannot`
4. [ ] - `p1` - **FROM** `shown` or `cannot-be-shown` **TO** `loading` **WHEN** the host changes the value of a variable that the cell's own request or its shared request names; the binding runs again with the new values, the extension stays mounted, and the cell then moves to `shown` with a new `render_widget` or to `cannot-be-shown` as above. An answer for an older value is dropped. - `inst-dr-cell-variable-rerun`
5. [ ] - `p1` - **FROM** `cannot-be-shown` **TO** `loading` **WHEN** the viewer clicks the retry button, which the frame shows under the cannot-be-shown text only when the cell's own or shared data request failed after it left the root: the host rejected it (a network error, an HTTP status outside 2xx, an answer that is not JSON or is over the 1 MiB cap, a redirect to another origin) or it timed out. The binding runs again through the same path as a variable change, with the current values and a new run token, so a newer run (a variable change during the retry) wins. For a shared request the root drops the held failed answer and runs again every live cell on that shared request that failed on it or still waits on the dropped answer (a cell still mounting), so the request goes out once for all of them; a cell that already holds a good answer is not run again. The cell then moves to `shown`, or to `cannot-be-shown` with the button again; nothing changes after several retries. No button shows for a request the root refused to build or send (an unknown variable or source, a method other than GET or POST, a path that is not same-origin), a transform or data-type failure, a registration, render or traits failure, a failed mount or a `render_widget` fallback. A larger view follows the same rule inside its overlay. - `inst-dr-cell-retry`
6. [ ] - `p1` - **FROM** (no loader) **TO** `shown` **WHEN** a static binding evaluates successfully, or a `markdown_card` gets `render_widget {render}`, and the action chain ends in `next`. - `inst-dr-cell-static-shown`
7. [ ] - `p1` - **FROM** (no loader) **TO** `cannot-be-shown` **WHEN** a static binding fails (parse or check, CEL error, or data validation), the `render_widget` action chain ends in `fallback` or times out, or the cell fails before its extension mounts (its widget instance fails its own registration, or its `entry` or `data_type` doesn't exist). - `inst-dr-cell-static-cannot`

A loader shows at mount only for the own and shared forms. A failed shared request moves every dependent cell to `cannot-be-shown`, and the developer log names the request; the other cells are unaffected.

The widget owns the empty state, and the root has no `empty` state. When a widget's data is valid and empty by its data type's rule (`cpt-frontx-dashboard-feature-widget-catalog`), the widget shows its own English "No data to show" (gears-frontx-templates#105); for the root, that cell is `shown`.

The widget's handler resolves as soon as it accepts the payload, before drawing. A widget that fails while drawing shows the cannot-be-shown state itself, in its cell (a widget obligation). Known limit, accepted: a widget that crashes without showing anything leaves its cell blank, and the root cannot see it.

## 5. Definitions of Done

### Hosting-agnostic mount

- [ ] `p1` - **ID**: `cpt-frontx-dashboard-dod-dashboard-runtime-hosting`

The root **MUST** mount into a single-page application or a screen extension, depending on FrontX packages only and no host or shell template. One root owns one registry: the root builds its own registry, over its own isolated type store, when it is created, in both forms, so dashboards open at the same time, on one page or in separately loaded screens, each show only their own content. A root whose registry throws while it builds the `widgets` domain has a failed start: it shows the dashboard-level cannot-be-shown state on every mount, and every other root is unaffected.

**Implements**: `cpt-frontx-dashboard-flow-dashboard-runtime-open`, `cpt-frontx-dashboard-algo-dashboard-runtime-register-domain`, `cpt-frontx-dashboard-fr-dashboard-root`, `cpt-frontx-dashboard-contract-host`, `cpt-frontx-dashboard-interface-host`.

**Components**: `cpt-frontx-dashboard-component-dashboard-root` (runtime side).

**Constraints**: `cpt-frontx-dashboard-constraint-hosting-agnostic`, `cpt-frontx-dashboard-constraint-one-root-per-registry`.

### widgets domain and generated extensions

- [ ] `p1` - **ID**: `cpt-frontx-dashboard-dod-dashboard-runtime-domain`

The root **MUST** register the `widgets` domain and generate one extension per cell and per larger view, with deterministic UUIDv5 ids, mounting with `history: "none"`; a reload reuses the ids. A rejected domain shows the dashboard-level cannot-be-shown state; no dashboard loads, and every later mount shows the same placeholder.

**Implements**: `cpt-frontx-dashboard-algo-dashboard-runtime-register-domain`, `cpt-frontx-dashboard-fr-isolation`.

**Principles**: `cpt-frontx-dashboard-principle-per-instance-isolation`.

### Served-file loading

- [ ] `p1` - **ID**: `cpt-frontx-dashboard-dod-dashboard-runtime-load-file`

The root **MUST** read the widget types, data types, widget instances and dashboards at runtime from the served GTS file, never baked in at build time, and **MUST NOT** depend on where the file comes from (`cpt-frontx-dashboard-algo-dashboard-runtime-load-file`). It fetches the file with a timeout of 30000 ms; a fetch that fails or times out is a dashboard-level failure. Before anything registers, it checks every type id of the base file against the bundle bases and rejects the whole file on a match. It then registers the types, manifests and entries; if the registry rejects any of them, the dashboard can't be shown. The base file is trusted, product-controlled input and one release unit: one rejected item fails every dashboard in it. A product may serve the file in parts: the base file (the catalog types and the dashboards), then one part per widget bundle (`loadWidgetParts` over the served widget list; `fetchHost` and the mock host answer `loadFile` so). The root registers each widget part on its own, after the base file: a part that cannot be read, that brings a type id equal to a bundle base, or that the registry rejects, is left out with one diagnostic, so only the cells whose widget type names an entry it failed to bring fail, and its dashboards never load. A product that joins the parts into one file (`composeServedFile`) gets the whole-file rule again.

**Implements**: `cpt-frontx-dashboard-algo-dashboard-runtime-load-file`, `cpt-frontx-dashboard-fr-runtime-source`.

**Constraints**: `cpt-frontx-dashboard-constraint-one-gts-package`.

### Binding runner

- [ ] `p1` - **ID**: `cpt-frontx-dashboard-dod-dashboard-runtime-binding`

The root **MUST** run each binding (`cpt-frontx-dashboard-algo-dashboard-runtime-run-binding`) in one of three forms (own, shared or static), and widgets never make requests; the root runs the binding. It hands every request to the host's data request (DESIGN §3.3 Host interface) and waits at most 30000 ms for the answer; the shipped `fetchHost` sends a `GET` or a `POST` over the page's own origin. A POST body is sent as JSON, and the root adds no credentials and no headers beyond what the product's `DashboardHost` sends (the shipped `fetchHost` adds only the JSON content type of a POST). Before sending, it requires a same-origin path: the path has a single leading `/` that is not followed by `/` or `\`, and no control characters (the request type's `path` pattern), and it resolves against the page origin to that same origin. Every failure cause listed in the run-binding algorithm is a cell-scope failure, with no retry. The root itself enforces the method, the same-origin path and the 30000 ms timeout for every host; the shipped `fetchHost` also enforces the transport causes (network error, non-2xx status, redirect to another origin, body that is not valid JSON, body over 1 MiB = 1,048,576 decoded bytes). A product host that answers with its own client applies those transport rules itself, and the response-size bound on CEL time then rests on that host. A shared request is sent once and held until teardown. A static binding is evaluated with no loader. The root parses and checks the CEL transform before any run, evaluates it, stamps and registers the result, and sends `render_widget`; CEL evaluation has no time bound, an accepted risk bounded by the response-size cap and trusted dashboard authors. A cell and its larger view are independent snapshots for the own and static forms; a shared-form larger view shows the same held response as its cell.

**Implements**: `cpt-frontx-dashboard-algo-dashboard-runtime-run-binding`, `cpt-frontx-dashboard-fr-no-product-data-code`, `cpt-frontx-dashboard-fr-same-origin-data`, `cpt-frontx-dashboard-fr-shared-data`, `cpt-frontx-dashboard-fr-static-data`, `cpt-frontx-dashboard-fr-safe-mappings`, `cpt-frontx-dashboard-contract-same-origin-api`.

**Components**: `cpt-frontx-dashboard-component-binding-runner`.

**Principles**: `cpt-frontx-dashboard-principle-render-only`.

**Constraints**: `cpt-frontx-dashboard-constraint-same-origin-data`.

### Variables from the host

- [ ] `p1` - **ID**: `cpt-frontx-dashboard-dod-dashboard-runtime-variables`

The host owns the variables; a dashboard declares none. The `Dashboard` component **MUST** take the values from its optional `variables` prop, a record of variable name to a string, a finite number or a boolean, and keep the held shared answers of the shown dashboard (one `SharedRequests` of the binding runner, which goes with the dashboard); the root receives the values through `runCell` and `rerun`. The root **MUST** build every request that names variables from those values (`cpt-frontx-dashboard-algo-dashboard-runtime-run-binding`): a request that names a variable the host does not give, or whose value is of another kind, fails its cell with a reason that names the variable and not the value. When the host changes a value, the root **MUST** re-run only the cells and open larger views whose own request or shared request names that variable: they go to `loading` and get a new `render_widget`; the other cells send nothing. A new object with the same values re-runs nothing. Shared requests are held by the built request, so a changed shared request is sent once for all its cells. At load every shared request a cell or a larger view names is sent at once, a closed larger view's too; on a value change only the shared requests of live runs (open cells and open larger views whose run has not ended) are sent ahead, and a closed larger view sends its request for the new values when it opens. Each run of a cell holds a token, and only the newest run of a cell still mounted delivers, so two quick switches never show the first answer after the second. After a `render_widget` fallback a cell stays cannot-be-shown until the dashboard loads again: a value change does not revive it and sends no request for it. Widgets never see variables, and the CEL transform's variables do not change. The dashboard draws no control for a variable: the host draws its own, outside the dashboard.

**Implements**: `cpt-frontx-dashboard-algo-dashboard-runtime-run-binding`, `cpt-frontx-dashboard-fr-shared-data`, `cpt-frontx-dashboard-fr-no-product-data-code`.

**Components**: `cpt-frontx-dashboard-component-dashboard-root` (runtime side), `cpt-frontx-dashboard-component-binding-runner`.

**Principles**: `cpt-frontx-dashboard-principle-render-only`.

### Cell frame and larger-view overlay

- [ ] `p1` - **ID**: `cpt-frontx-dashboard-dod-dashboard-runtime-frame`

The root **MUST** own the cell frame (title, loader, cannot-be-shown state, the retry button of a cell whose data request failed, larger-view button) and the larger-view overlay inside its own container; the widget renders one action, including its own empty state. A cell with `frame` `false` gets no card: no border, background, header or larger-view button, the widget's content drawn as a full-width block between the grid groups, as tall as its content, at the inline edge of a small card's content; its loader and cannot-be-shown text (and the retry button) still show, without the card. The dashboard-level loader and the cell loaders are announced as a status. The cannot-be-shown states are exposed as text with their own wording, so a screen reader tells them apart from the loaders and from the widget's empty state. The larger-view button and the overlay's close button are operable with the keyboard alone and expose their name, role and state. The overlay is a dialog (`role="dialog"`, `aria-modal="true"`) whose accessible name is the larger-view widget's title: focus moves into it on open, Tab cycles inside it, the page behind it is inert, the close button, Escape, a click outside or a page refresh closes it, and focus returns to the larger-view button. The frame and the overlay pass the host's accessibility checks in both themes, verified by a keyboard-only walkthrough and a screen-reader walkthrough of the reference dashboard. An open larger view closes (its extension unmounts) when the viewer leaves the dashboard or another dashboard loads.

**Implements**: `cpt-frontx-dashboard-flow-dashboard-runtime-larger-view`, `cpt-frontx-dashboard-fr-larger-view`, `cpt-frontx-dashboard-fr-states`, `cpt-frontx-dashboard-fr-accessibility` (root side), `cpt-frontx-dashboard-nfr-accessibility` (root side), `cpt-frontx-dashboard-nfr-visual-quality` (root side).

**Principles**: `cpt-frontx-dashboard-principle-render-only`.

### Placeholder

- [ ] `p1` - **ID**: `cpt-frontx-dashboard-dod-dashboard-runtime-placeholder`

The root **MUST** show the cannot-be-shown state (the placeholder) on every failure: no retry, no error text, no failure class. Each failure writes one developer-log diagnostic naming the dashboard id, the widget id and type, and the failing step or request; the diagnostic is never shown to the viewer.

**Implements**: `cpt-frontx-dashboard-algo-dashboard-runtime-show-placeholder`, `cpt-frontx-dashboard-fr-states`.

### Theme and language publishing

- [ ] `p2` - **ID**: `cpt-frontx-dashboard-dod-dashboard-runtime-theme`

The root **MUST** publish the host theme id and host language unchanged as the shared properties of the `widgets` domain, map the host theme id to a UI-kit scope for its own chrome (cell frame, loaders, overlay, close button), and localize its own text. On every mount, the root reads the current values and publishes them before any extension mounts. In an MFE, it reads through the bridge's `getProperty`; in a single-page application, from the application.

**Implements**: `cpt-frontx-dashboard-algo-dashboard-runtime-publish-theme`, `cpt-frontx-dashboard-fr-theme`.

### Owner state machine and load lifecycle

- [ ] `p1` - **ID**: `cpt-frontx-dashboard-dod-dashboard-runtime-owner`

The root **MUST** track its state with the owner state machine (`cpt-frontx-dashboard-state-dashboard-runtime-owner`). The dashboard-level loader shows from the start of a load until the dashboard or the placeholder replaces it. Loading ends when the dashboard passes its dashboard-level checks; the bindings run in Loaded. A new dashboard id while loading supersedes the earlier load; a request for the id already loading joins that load; unmounting the root while loading discards the load. A new dashboard id after loading, including while bindings still run, first unmounts the loaded cells, unregisters their generated extensions, and drops their held shared responses and every later result. A failed start (rejected domain) has no exit, and every later mount shows the same placeholder. Unmounting the root in Loaded or Placeholder changes no state. Returning to a dashboard the root has already loaded remounts its cells from the kept registrations without fetching the served file again, and runs every binding again. Opening the same dashboard id again after a dashboard-level failure starts a new load; a page reload also recovers. A superseded load is checked after every step that waits; the extensions it registered are unregistered; nothing is shown. A dashboard id that names no dashboard in the served file shows the dashboard-level cannot-be-shown state with a developer-log diagnostic naming the id. The types, the dashboard instances, the widget instances and the stamped data instances stay registered for the life of the root, bounded by the widgets in the served file; deterministic stamped-data ids make the next load of a dashboard replace their content, and a page reload clears them; requests in flight are not cancelled, and their results are dropped.

**Implements**: `cpt-frontx-dashboard-state-dashboard-runtime-owner`, `cpt-frontx-dashboard-flow-dashboard-runtime-open`, `cpt-frontx-dashboard-flow-dashboard-runtime-leave`.

### Initial render

- [ ] `p1` - **ID**: `cpt-frontx-dashboard-dod-dashboard-runtime-initial-render`

The root **MUST** show the complete dashboard, with every data widget showing its data, within 3 s at p95 (provisional), measured as DESIGN §4.1 sets out: on the reference dashboard, under the reference conditions with the test stub API, over at least 30 runs. Parallel cells, deterministic extension ids, and parsing and checking each CEL transform before it runs serve this budget.

**Implements**: `cpt-frontx-dashboard-nfr-initial-render`, `cpt-frontx-dashboard-flow-dashboard-runtime-open`.

### No persistence

- [ ] `p1` - **ID**: `cpt-frontx-dashboard-dod-dashboard-runtime-no-persistence`

The root and widgets **MUST NOT** persist any state: no browser storage and no server (`cpt-frontx-dashboard-db-none`). Registrations live in memory only, for the life of the root. Late results for unmounted extensions are dropped.

**Implements**: `cpt-frontx-dashboard-flow-dashboard-runtime-leave`, `cpt-frontx-dashboard-nfr-no-persistence`.

## 6. Acceptance Criteria

- [ ] A dashboard opens in a single-page application and as a screen extension, with no host or shell template dependency.
- [ ] Two dashboards open at the same time, each in its own root, each show only their own content: every root builds its own registry and type store, in a separately loaded screen as well as on one page.
- [ ] Opening a dashboard shows the "Loading dashboard" loader, announced as a status, in place of the dashboard from the start of the load until the dashboard or the dashboard-level cannot-be-shown state replaces it.
- [ ] Each cell mounts its own extension, runs its binding, and shows loading, shown, or cannot-be-shown; a widget whose data is valid and empty shows its own "No data to show", and the root records that cell as shown.
- [ ] Types, data types, widget instances and dashboards come from the served GTS file at runtime; changing the served file changes what the root shows on the next page load, with no rebuild, and the root works the same whichever location serves the file.
- [ ] A served GTS file that can't be fetched, or whose fetch does not answer within 30000 ms, shows the dashboard-level cannot-be-shown state and mounts no cell.
- [ ] A base file (or a file served joined) with a type whose id equals a bundle base is rejected as a whole before anything registers, and the dashboard-level cannot-be-shown state shows.
- [ ] A served file with a type, manifest or entry that the registry rejects shows the dashboard-level cannot-be-shown state for every dashboard in that file; in a file served in parts this holds for the base file only.
- [ ] A widget part with a type whose id equals a bundle base, whose type, manifest or entry the registry rejects, that brings a type the store already holds with other content, that brings a manifest or entry id the base file or a registered part already brought with other content, or that brings a dashboard id already served with other content, is left out with one developer-log line naming it: only the cells whose widget type names an entry it failed to bring show the cannot-be-shown state, the part's dashboards never load, and the rest of the dashboard renders.
- [ ] A dashboard that fails validation, or whose layout fails a check, shows the dashboard-level cannot-be-shown state and mounts no cell.
- [ ] A dashboard whose cell 1 `widget` has no `id` fails the open widget base when the dashboard instance registers: the dashboard-level cannot-be-shown state shows and no cell is mounted, as the model's failure attribution gives. A cell widget whose `render` has a field its concrete type does not allow passes the dashboard registration and fails its own registration: only that cell shows the cannot-be-shown state.
- [ ] A widget instance that fails its own registration against the type its `id` names shows the cannot-be-shown state in its cell only, or in its larger view only for a `larger_view` instance; the other cells are unaffected.
- [ ] A cell whose data request failed (host rejection or timeout) shows a kit `Button` with the frame text `retry` ("Try again" by default) under the cannot-be-shown text, reachable by Tab with a visible focus ring; its accessible name carries the cell's title (`retryNamed(title)`, "Try again to load <title>" by default) and is the plain text in a cell without a title. A click sends the request again (a failed shared request once for every cell that reads it), shows the loader, then the widget or the cannot-be-shown state with the button again. Focus stays with the cell: on the cell itself while it loads, on the new button when the retry fails again, on the cell when the widget shows. A cell that fails in any other way shows no button.
- [ ] A cell with `frame` `false` draws its widget with no card, header or larger-view button; while its request runs it shows the loader and on a failure the cannot-be-shown text, both without a card. One whose widget carries a `title` or `description`, or that carries a `larger_view`, a `size` other than `large` or a `height`, shows the cannot-be-shown state with no card and writes one console line that names each of them; when its widget also fails its own type, the widget gets a stand-in, the line names that failure instead, and the dashboard still loads.
- [ ] A widget whose `entry` or `data_type` doesn't exist shows the cannot-be-shown state in its cell only.
- [ ] A failing `mount_ext` shows the cannot-be-shown state in its cell only.
- [ ] A widget bundle that answers 404, throws while it evaluates or is served from an origin that is not allowed shows the cannot-be-shown state in the cells of its entry only.
- [ ] A widget bundle rebuilt and republished shows on the next page load with no rebuild of the host app, and a widget type whose bundle part is added to the served widget list renders.
- [ ] A `render_widget` whose action chain ends in `fallback`, or does not finish within 30000 ms, shows the cannot-be-shown state in its cell only and writes a developer-log diagnostic.
- [ ] A request to a non-same-origin path or a method other than GET/POST is rejected before it is sent: `/a?b=1` is accepted; `https://other/x`, `//other/x` and `/\other` are rejected before sending.
- [ ] A same-origin request whose response redirects to another origin fails only its cell.
- [ ] A request that never answers times out after 30000 ms and the cell shows the cannot-be-shown state.
- [ ] A response with a non-2xx status (including 401 and 403), a network error, or a body that is not valid JSON (including an empty body) fails only its cell; the request is not retried.
- [ ] A response body of exactly 1,048,576 decoded bytes is accepted; one byte more fails only its cell; a shared response over the cap fails every dependent cell.
- [ ] A POST request carries its body as JSON, and the root adds no credentials or headers beyond what the product's `DashboardHost` sends.
- [ ] A transform that fails to parse or check fails only its cell and is never evaluated; a transform that errors, or data that fails validation, fails only its cell.
- [ ] The larger-view overlay opens inside the root's container as a dialog (`role="dialog"`, `aria-modal="true"`) named by the larger-view widget's title; focus moves into it on open, Tab cycles inside it, and the page behind it is inert.
- [ ] The larger-view overlay closes on the close button, Escape, a click outside, or a page refresh, and focus returns to the larger-view button that opened it.
- [ ] A failing larger-view widget shows the cannot-be-shown state in the overlay only; its cell and the other cells are unaffected.
- [ ] A keyboard-only walkthrough of the reference dashboard, in both themes, operates every larger-view button and close button, and the cell frame and the overlay pass the host's accessibility checks.
- [ ] A screen-reader walkthrough of the reference dashboard, in both themes, hears every larger-view button and close button announce its name, role and state; hears the dashboard-level and cell loaders announced as a status; reads the dashboard and cell cannot-be-shown states as text that differs from the loaders and from a widget's empty state; hears the overlay announced as a dialog named by the larger-view title; and finds focus back on the larger-view button after the overlay closes.
- [ ] In design review, the cell frame, loaders, overlay and close button look consistent with the host application in both the light and the dark UI-kit scope.
- [ ] An open larger view closes (its extension unmounts) when the viewer leaves the dashboard or another dashboard loads.
- [ ] A theme switch restyles every widget and the root's own chrome without a reload or a re-run binding.
- [ ] A language change updates the root's own text and every widget without a reload or a re-run binding.
- [ ] Leaving the dashboard unmounts every extension, including any open larger view; a late result for an unmounted extension is dropped and registers nothing.
- [ ] A shared request is sent once even when several widgets refer to it.
- [ ] An unknown `source` fails only its cell before anything runs.
- [ ] A failing shared request fails all its dependent cells.
- [ ] A static binding is evaluated and validated without a request, with no loader.
- [ ] A cell and its larger view are independent snapshots for the own and static forms; a shared-form larger view shows the same held response as its cell.
- [ ] Returning to a dashboard the root has already loaded remounts its cells from the kept registrations without fetching the served file again, and runs every binding again.
- [ ] While dashboard A is still loading (before its cells mount), when the viewer opens dashboard B, A is discarded: nothing of A is shown, the extensions A registered are unregistered, and B loads.
- [ ] When the viewer opens dashboard B while A's bindings still run, A's cells unmount, A's generated extensions are unregistered, A's held shared responses are dropped, no later result of A is sent or shown, and B loads.
- [ ] Opening the dashboard id that is already loading joins that load: the served file is fetched once and the dashboard shows once.
- [ ] Unmounting the root while a dashboard is loading discards the load: nothing mounts, and the next mount starts a new load.
- [ ] After a dashboard-level failure, mounting the root again with the same dashboard id starts a new load; opening another dashboard id also starts a new load; a page reload also recovers.
- [ ] A dashboard id that names no dashboard in the served file shows the dashboard-level cannot-be-shown state with a developer-log diagnostic naming the id.
- [ ] A registry that rejects the `widgets` domain shows the dashboard-level cannot-be-shown state; a later mount or load shows the same placeholder.
- [ ] The placeholder is static: no retry, no error text, no failure class; each failure writes one developer-log diagnostic naming the dashboard id, widget id and type, and the failing step or request; it's never shown to the viewer.
- [ ] The root maps the host theme id to a UI-kit scope for its own chrome (cell frame, loaders, overlay, close button) and localizes its own text for the host language.
- [ ] In an MFE, the root reads the theme and language through the bridge's `getProperty`; in a single-page application, from the application.
- [ ] On the DESIGN §4.1 reference dashboard, under the reference conditions with the test stub API, over at least 30 runs, the complete dashboard shows within 3 s at p95 (provisional).
- [ ] Neither the root nor any widget calls a browser storage API (local storage, session storage, IndexedDB, Cache Storage, or cookies); package inspection finds no storage use.
- [ ] One widget can't change the state or behaviour of another widget, including another instance of the same widget type, or of the root: a widget that fails or changes its own state leaves every other cell and the root unchanged.
- [ ] Given a variable used by a shared request of two cells and by the own request of a third, and a fourth cell whose request names no variable, when the host passes another value, then the shared request is sent once with the new value, the own request once, the fourth cell sends nothing, and the three dependent cells show the new data.
- [ ] Given two quick switches whose first answer arrives after the second, when both answers arrive, then the cells show the second value's data only.
- [ ] Given a request that names a variable the host does not give, or a host value that is `NaN`, an infinite number or an object, when the dashboard loads, then each cell that uses it fails with a developer-log line that names the variable and not the value, no request is sent for it, and the other cells show.
- [ ] Given a `GET` request with `variables` whose value holds `&`, `=`, `#` and a space, when it is built, then the value is encoded and appended after the query already in the path; a key already in the query or the body, a `POST` body that is not an object, and a variable the host does not give each fail the cell before anything is sent.
