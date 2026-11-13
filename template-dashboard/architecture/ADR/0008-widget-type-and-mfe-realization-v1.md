---
status: accepted
version: 1
priority: p1
date: 2026-10-31
decision-makers: template-dashboard architecture maintainers
description: "Decision record for how a widget type points to the FrontX MFE entry that shows it: through the trait entry on the widget base, with an abstract data_widget between the base and every data-taking type that requires data and declares the trait data_type, and markdown_card derived from the base directly with no data."
---

# ADR-0008: Widget type and entry trait

**ID**: `cpt-frontx-dashboard-adr-widget-type-and-mfe-realization`

<!-- toc -->

- [Context and Problem Statement](#context-and-problem-statement)
- [Decision Drivers](#decision-drivers)
- [Considered Options](#considered-options)
- [Decision Outcome](#decision-outcome)
  - [Consequences](#consequences)
  - [Confirmation](#confirmation)
- [Pros and Cons of the Options](#pros-and-cons-of-the-options)
  - [The entry trait on the widget base](#the-entry-trait-on-the-widget-base)
  - [A link instance per widget type](#a-link-instance-per-widget-type)
  - [`realizes:` on a derived entry type](#realizes-on-a-derived-entry-type)
  - [Entry identifiers stored in dashboards](#entry-identifiers-stored-in-dashboards)
  - [Entries found by naming convention](#entries-found-by-naming-convention)
  - [Widgets bundled in the dashboard root](#widgets-bundled-in-the-dashboard-root)
- [More Information](#more-information)
- [Traceability](#traceability)

<!-- /toc -->

## Context and Problem Statement

A widget type is a GTS type that says what a widget's `render` and `data` look like ([ADR-0009](0009-subject-agnostic-widget-catalog-v1.md)). A FrontX MFE entry is the runtime artifact FrontX loads and mounts. The dashboard root generates one extension per cell (and per larger view) from the entry the widget type names, and mounts it ([ADR-0007](0007-extension-domain-taxonomy-v1.md)). The question is how a widget type points to the entry that shows it, how a product changes which entry a template widget type points to, and whether data widgets and data-free widgets share one base.

Stakeholders: widget authors (who ship types) and products (which change entries). The trait form is the v1 contract.

## Decision Drivers

Drivers in priority order:

* Dashboard definitions reference widget types only, so they keep working across entry re-releases and replacements.
* The link should not couple the template to FrontX's entry schema through a derived entry type or an extra entry field.
* A product must be able to change which entry a template widget type points to, in its own copy of the served file, with no template change.
* A data widget has `data`; a widget with no data (`markdown_card`) must not. The hierarchy should make the difference explicit.
* The entry is a plain FrontX MFE entry instance with no derived type and no extra field.

## Considered Options

* The `entry` trait on the widget base
* A link instance per widget type
* `realizes:` on a derived entry type
* Entry identifiers stored in dashboards
* Entries found by naming convention
* Widgets bundled in the dashboard root

## Decision Outcome

Chosen option: "The `entry` trait on the widget base", because it links a widget type to a plain FrontX entry through a trait, keeps dashboard definitions free of entry identifiers, lets a product change the entry in its own copy of the served file, and makes the data/data-free split explicit with `data_widget`.

**The widget base.** The abstract widget base `gts.frontx.dashboard.widget.widget.v1~` carries `id`, `title?`, `description?` (a line under the title), and `render`, an object of the open render base `gts.frontx.dashboard.widget.render.v1~` that each widget type closes. It declares the trait schema `entry`, with `x-gts-instance-ref` to the FrontX MFE entry type `gts.frontx.mfes.mfe.entry.v1~frontx.mfes.mfe.entry_mf.v1~`.

**The abstract `data_widget`.** The abstract `…widget.widget.v1~frontx.dashboard.widget.data_widget.v1~` derives from the widget base. It adds a required `data` (the binding, [ADR-0011](0011-widget-data-binding-v1.md)) and the trait schema `data_type`, with `x-gts-type-ref` to the widget-data base. The `data` field on `data_widget` is the binding; the `data` payload of `render_widget` is the stamped result the root produces from it. Every data-taking widget type derives from `data_widget`; `markdown_card` derives from the widget base directly and closes itself, so its schema forbids `data`.

**Widget types and entries.** A widget type is a closed derived type, e.g. `…data_widget.v1~frontx.dashboard.widget.pie_chart.v1~`. Its `render` refers by `$ref` to its own render type, a closed type derived from the render base (e.g. `…widget.render.v1~frontx.dashboard.widget.pie_chart_render.v1~`), and it sets the traits: `entry` (the entry id) and, for data widgets, `data_type` (the widget's data type id). A product's own widget type may close `render` the same way or narrow and close it inline; inline, the path through the action has no strict check (ADR-0003), so a derived render type of its own is recommended. A product changes which entry a template widget type points to by setting a different `entry` in its copy of the served GTS file. A fix is a new release of the same entry; a new widget is a new type. A fix keeps the `render` and data schemas compatible; an incompatible change ships as a new type version. A replaced widget must keep the per-widget states, the theme mapping and the accessibility of the template widget it replaces.

**The entry.** A widget's entry is a plain FrontX instance of `gts.frontx.mfes.mfe.entry.v1~frontx.mfes.mfe.entry_mf.v1~`, with no derived type and no extra field. The widget author writes `requiredProperties` (theme and language), `actions` (`render_widget`), `domainActions` ([]), `manifest` and `exposedModule`; the FrontX manifest pipeline adds `exposeAssets` when the bundle is built. Its `mount` resolves only after it has registered its `render_widget` handler. The 11 entries and their bundles' manifests reach the runtime only through the served GTS file, and the root registers them from there ([ADR-0010](0010-template-packages-and-host-contract-v1.md)).

**One bundle per widget type.** Each widget type ships as its own Module Federation remote with one manifest and one entry, and the root loads it at runtime with the FrontX MF handler; the host app contains no widget code. One remote per type, rather than one remote exposing all 11 entries, keeps a single type independently replaceable: a fix of one type rebuilds and republishes only that bundle, and a product re-points one type without carrying the other 10. The cost is 11 builds and 11 manifests instead of one, and the kit components a bundle uses are carried by that bundle; react, react-dom and recharts stay shared standalone modules, fetched once for every bundle with the same content hash.

**Release and rollback.** Publishing a widget deploys its MFE build, then adds its types, its entry and the manifest to the served GTS file. A new type is usable by existing dashboards at once. A fix under the same type shows on the next page load, with no product redeploy. To roll back a widget release, restore the previous types, entry and manifest in the served file, or redeploy the previous MFE build. A rollback also takes effect on the next page load. A release and its rollback both reach every dashboard that uses the type.

**Effective traits.** The spec combines trait schemas along the chain and merges values root to leaf (RFC 7396), then fills defaults. A concrete type must set every required trait. FrontX exposes no traits API, so the root resolves effective traits in its own code, following the spec ([ADR-0003](0003-shared-data-types-and-schemas-v1.md)).

### Consequences

* Good, because dashboards reference widget types only, so they keep loading after an entry is re-released or replaced.
* Good, because FrontX needs no change: entries stay plain FrontX MFE entries, and the link lives in a trait the root resolves.
* Good, because a product changes which entry a template widget type points to by setting a different `entry` in its copy of the served file, with no template change.
* Good, because `data_widget` makes the data/data-free split explicit, and `markdown_card` cannot carry `data`.
* Bad, because the root resolves effective traits itself, since FrontX exposes no traits API.
* Bad, because a product cannot add a widget type from the dashboard JSON; a widget type is shipped and registered.
* Bad, because a bad widget release reaches every dashboard that uses the type on the next page load. Mitigation: the rollback above, which needs no product build and also takes effect on the next page load.

### Confirmation

* Schema review confirms that widget instances in dashboards name widget types only, never entries, and that every concrete widget type sets `entry` and (for data widgets) `data_type`.
* A catalog check confirms the served GTS file carries one entry per widget type, 11 in all, each pointing to the manifest of its own widget bundle, and that no entry uses a type derived from the FrontX MFE entry type.
* A test confirms `data_widget` requires `data` and declares the `data_type` trait, and that `markdown_card` forbids `data`.
* A test confirms a product that sets a different `entry` on a template widget type in its copy of the served file mounts that entry, with no template change.
* An admission test confirms each widget entry is admitted into the `widgets` domain, and an entry lacking `render_widget` is rejected at admission.
* A test restores the previous entry and manifest in the served file and confirms the previous widget code mounts on the next page load.
* A test of the trait helper confirms effective traits equal the RFC 7396 merge of the traits along the `$id` chain, with defaults filled.

## Pros and Cons of the Options

### The entry trait on the widget base

The widget base declares the `entry` trait; a concrete widget type sets it to its entry id. `data_widget` adds `data` and the `data_type` trait.

* Good, because dashboards are stable across entry re-releases and replacements.
* Good, because it needs no derived entry type and no change in FrontX.
* Good, because a product changes the entry in its own copy of the served file.
* Good, because `data_widget` makes the data/data-free split explicit.
* Bad, because the root resolves effective traits itself.

### A link instance per widget type

A template-owned GTS instance of a link type names a widget type and its entry.

* Good, because the link sits in an instance, not on the type.
* Bad, because it adds a link type and one instance per widget type, which the trait form does without.
* Bad, because a product changes an entry by editing a separate instance and keeping it consistent with the type, instead of changing one trait value on the type.
* Bad, because nothing stops two instances from naming the same widget type, so the root would need a rule to choose between them.

### `realizes:` on a derived entry type

The template derives an entry type from the FrontX MFE entry type and adds a `realizes:` field that points to the widget type.

* Good, because the link sits on the entry itself, with no separate instance.
* Bad, because a derived entry type would couple the template to FrontX's entry schema.
* Bad, because a widget type cannot name its entry; the root finds it only by searching every entry for a matching `realizes:`, and two entries may claim the same type.

### Entry identifiers stored in dashboards

Each widget instance names the entry that shows it.

* Good, because there is no lookup.
* Bad, because dashboards are tied to entry identifiers and break when an entry is re-released under a new id.
* Bad, because replacing an entry means rewriting every stored and generated dashboard.

### Entries found by naming convention

The entry for a widget type is found by matching identifier segments, with no explicit link.

* Good, because no explicit link is stored.
* Bad, because a product's entry with its own identifier cannot be found, so a product cannot point a template widget type to it.
* Bad, because the coupling between the two families is hidden in naming conventions.

### Widgets bundled in the dashboard root

The dashboard root contains every widget type as an internal component; there are no widget entries.

* Good, because the browser fetches one bundle, and heavy libraries are evaluated once.
* Bad, because a widget author cannot add or fix a widget type at runtime; every change needs a rebuild of the dashboard root (`cpt-frontx-dashboard-fr-add-fix-widget`).
* Bad, because a product that adds widget types, the open-source case the template serves, rebuilds and redeploys its host app for each of them.

## More Information

* **Review trigger**: revisit when a derived entry type can be built without coupling the template to FrontX's entry schema.
* **Scope**: this record decides how a widget type points to its entry through the `entry` trait, the `data_widget` abstraction, and that the entry is a plain FrontX MFE entry. It does not decide which widget types exist ([ADR-0009](0009-subject-agnostic-widget-catalog-v1.md)), the `widgets` domain and `render_widget` ([ADR-0007](0007-extension-domain-taxonomy-v1.md)), the GTS conventions and traits ([ADR-0003](0003-shared-data-types-and-schemas-v1.md)), or the binding ([ADR-0011](0011-widget-data-binding-v1.md)).
* **Checklist applicability**: ARCH applicable; PERF N/A; SEC N/A; REL applicable (a widget release and its rollback reach every dashboard that uses the type on the next page load); DATA applicable (the trait schema and the data/data-free split); INT applicable (the entry is a FrontX MFE entry); OPS N/A; MAINT applicable; TEST applicable; COMPL N/A; UX N/A; BIZ applicable (a product changes the entry without a template change).

## Traceability

- **PRD**: [PRD.md](../PRD.md)
- **DESIGN**: [DESIGN.md](../DESIGN.md)

This decision directly addresses the following requirements or design elements:

* `cpt-frontx-dashboard-fr-add-fix-widget` — a product changes which entry a template widget type points to in its copy of the served file, and a fix shows on the next page load.
* `cpt-frontx-dashboard-fr-widget-catalog` — each widget type points to its entry through the `entry` trait, and `data_widget` separates data widgets from `markdown_card`.
* `cpt-frontx-dashboard-interface-contract` — the `entry` and `data_type` traits are part of the published contract.
