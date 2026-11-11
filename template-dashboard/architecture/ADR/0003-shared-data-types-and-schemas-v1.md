---
status: accepted
version: 1
priority: p1
date: 2026-10-31
decision-makers: template-dashboard architecture maintainers
description: "Decision record for the GTS conventions of the template's types: GTS v0.17 with 2020-12 schemas, one dashboard package with namespaces dashboard, widget, widget_data and mfe, id conventions with literal base operands for embedded ids, per-instance registration of embedded widgets, stamped data registration, open bases and closed leaves, render on the widget base, and a bundle-schema guard that rejects a served type whose id equals a bundle base."
---

# ADR-0003: GTS conventions for the template's types

**ID**: `cpt-frontx-dashboard-adr-shared-data-types-and-schemas`

<!-- toc -->

- [Context and Problem Statement](#context-and-problem-statement)
- [Decision Drivers](#decision-drivers)
- [Considered Options](#considered-options)
- [Decision Outcome](#decision-outcome)
  - [Consequences](#consequences)
  - [Confirmation](#confirmation)
- [Pros and Cons of the Options](#pros-and-cons-of-the-options)
  - [Id operand for embedded instances](#id-operand-for-embedded-instances)
  - [Validation of embedded instances](#validation-of-embedded-instances)
  - [Package layout](#package-layout)
  - [GTS version](#gts-version)
  - [Stamped-data id](#stamped-data-id)
  - [Served type that equals a bundle base](#served-type-that-equals-a-bundle-base)
- [More Information](#more-information)
- [Traceability](#traceability)

<!-- /toc -->

## Context and Problem Statement

The template's types and instances (dashboards, widget types, data types, widget entries, widget instances) are written as GTS types and instances on the FrontX base types under `gts.frontx.mfes.*`. A dashboard embeds widget instances, and a binding stamps a data instance; both carry their own ids that name their own derived types. All parties need the same conventions for ids, packages, validation and registration, so a dashboard can be checked against registered types and the contracts do not drift. Which GTS conventions does the template follow, and under which GTS version?

Assumptions: FrontX runs GTS v0.17 (its gts-plugin 0.6.1 pins gts-ts 0.11.2). gts-plugin validates on registration with reference lookup on; More Information states what it rejects.

## Decision Drivers

Drivers in priority order:

* A dashboard must be checkable against the registered types, including every embedded widget instance against the type its own id names.
* Id fields of embedded types must accept the ids they are meant to hold; `/$id` would resolve to the type being validated (the dashboard) and reject every widget id.
* A widget that fails its own validation must affect only its cell or larger view, so each embedded widget is registered on its own.
* Stamped data must be validated against its data type, and FrontX's store has no removal call, so a deterministic combined id keeps the store bounded while every load re-validates.
* The template relies on `x-gts-instance-ref`, `x-gts-type-ref`, `x-gts-abstract` and traits as GTS v0.17 defines them.
* FrontX validates only by registering, and exposes no traits API, so the root resolves effective traits in its own code, following the spec.
* Template ids must not collide with FrontX ids; one dashboard package keeps them apart.

## Considered Options

* Id operand: a literal base operand in `x-gts-instance-ref`, or `/$id`
* Validation: per-instance registration of embedded widgets and stamped data, or a single polymorphic validation of the dashboard
* Packages: one dashboard package, or split model and view packages
* GTS version: target GTS v0.17, or interim workarounds on an older version
* Stamped-data id: a deterministic per-cell id, or a new id per load
* Served type that equals a bundle base: reject it before anything registers, or let the first registration win

## Decision Outcome

Chosen options: a literal base operand; per-instance registration of embedded widgets and stamped data; one dashboard package; GTS v0.17 as a prerequisite; a deterministic per-cell stamped-data id; and rejecting a served type that equals a bundle base before anything registers. Together these conventions form one GTS-conventions contract. Each bullet below states one convention. A bullet that is not one of these axes says what it follows from.

* **Schema form.** Every type schema has a top-level `$schema` of `https://json-schema.org/draft/2020-12/schema` and a `$id` of `gts://<type id>`. The whole hierarchy uses that one dialect, because `unevaluatedProperties` needs 2019-09 or later. Derived types use `allOf` with `$ref` to their parent. This follows from GTS v0.17, which uses JSON Schema.
* **Ids.** Combined anonymous ids with lowercase UUIDs. No separate `type` field. Embedded instances carry no `$schema`. No GTS ids as object keys. Every id starts at `v1`. These follow from the GTS v0.17 id form: an id names its own type chain, so an instance needs no separate type field or `$schema`.
* **Id operand.** Embedded `id` fields use literal base operands, never `/$id`. `/$id` resolves to the type being validated (the dashboard), so it would reject every widget id.
* **One dashboard package.** All template types live under one GTS package `dashboard`, with namespaces `dashboard`, `widget`, `widget_data` and `mfe`. The prefix `frontx.dashboard` keeps template ids apart from FrontX's own `gts.frontx.mfes.*` ids and from other templates.
* **Open bases, closed leaves.** The widget base, `data_widget` and the widget-data base are `x-gts-abstract: true`. They leave their top level and `render` open, so derived types can add and narrow. Every concrete type closes itself with `unevaluatedProperties: false`. That works through `allOf`, so base properties are not repeated. This follows from the per-instance registration axis: a check against a concrete type is exact only when the type rejects unknown fields, while the bases must stay open for derived types.
* **Traits.** `x-gts-traits-schema` sits at the top level: `entry` on the widget base (with `x-gts-instance-ref` to `gts.frontx.mfes.mfe.entry.v1~frontx.mfes.mfe.entry_mf.v1~`), and `data_type` on `data_widget` (with `x-gts-type-ref` to the widget-data base). Neither trait schema is closed, so lower layers can add traits. Values go in `x-gts-traits` on the concrete type. The spec combines trait schemas along the chain and merges values root to leaf (RFC 7396), then fills defaults. A concrete type must set every required trait. FrontX exposes no traits API, so the root resolves effective traits in its own code, following the spec. This follows from the GTS v0.17 axis, which defines traits.
* **Per-instance registration.** Embedded instances are not validated against their own type by the GTS spec or gts-ts. A document is validated against the rightmost type of its own id, and an embedded object only against the schema at its position. So the root registers each embedded widget instance (cell `widget` and `larger_view`) on its own, which validates it fully against its own type; and it registers each stamped data instance on its own, which validates it against its data type. The type store is shared across the realm, per compatible plugin copy, so it holds the registrations of every dashboard opened in the page's lifetime. Types, dashboards and widget instances stay registered for the life of the realm; they come from the bundle and the served file, which bound them. A failure affects only its cell or larger view.
* **Stamped data.** The transform result is stamped with a deterministic combined id `<data type>~<UUIDv5(namespace, widget id | role)>` and registered, which validates it against its data type. FrontX validates only by registering. Instances are last-write-wins, so a per-cell id means every load re-validates the new content under the same id. FrontX's store has no removal call, so stamped data stays registered for the life of the realm, as do the types, the dashboard and the widget instances. The id is deterministic (one per widget per role), so the next load replaces its content. The total is bounded by the served file: at most one instance per data widget and role, each holding the data that widget last showed. A page reload clears it. Stamped data is never persisted. `render_widget.data` is typed by the widget-data base, which FrontX checks only at base level, so the root's registration is the real check. Value fields accept `null`, and a widget renders a `null` as a gap or an empty value; a `null` label, `x`, `y` or series value shows as an empty label ([ADR-0009](0009-subject-agnostic-widget-catalog-v1.md)).
* **`default`** in a schema documents a default and fills nothing. The widget applies its `render` defaults itself. This follows from JSON Schema, where `default` is an annotation, not an assertion.
* **Bundle-schema guard.** The root's bundle carries the template's contract schemas (the dashboard type, the widget/data-widget/widget-data bases, the request type, the `render_widget` action, the `widgets` domain and its extension type `gts.frontx.mfes.ext.extension.v1~frontx.dashboard.mfe.widget_ext.v1~`). FrontX types, including the theme and language shared properties, are referenced by id and never copied into the bundle. They are registered before the served file is fetched. A served type whose id equals one of these bundle bases is rejected before anything registers; that is a dashboard-level failure. Everything else in the file belongs to the product.
* **Shared schema pieces.** A schema piece used by more than one type is its own GTS type, referenced with `gts://<type id>`; a `$ref` never points into another type's `$defs`, which GTS does not allow; this rule follows from that limit. The request type is such a piece: the dashboard's `requests` and an own binding both use it ([ADR-0011](0011-widget-data-binding-v1.md)). A field every type of a family shares is declared once on the family's base and inherited, as `value_format` is on `data_widget`; a type closes only the objects it declares itself, since a derived type cannot close an object that its base declares open.

### Consequences

* Good, because a generated dashboard can be checked by its producer against the registered types, and each embedded widget and stamped data instance is validated on its own.
* Good, because per-cell ids keep the stamped data bounded by the data widgets of the dashboards opened in the page, while every load re-validates.
* Good, because the literal operand holds wherever the type is embedded and accepts every derived id.
* Bad, because a dashboard that mentions long chained ids is verbose.
* Bad, because the template depends on the plugin's per-instance registration, on its reference lookup mode, on combined anonymous ids and on the reference keywords, none of which a bare GTS library guarantees. Mitigation: the DESIGN conformance tests.
* Bad, because FrontX can't list registered instances, so the root keeps its own index of what it registered.
* Bad, because FrontX's store has no removal call, so every type, dashboard, widget instance and stamped data instance stays registered for the life of the realm. The amount is bounded by the served file: at most one stamped instance per data widget and role, each the size of the data that widget last showed. A page reload clears it. This is accepted.

### Confirmation

* A schema review confirms that every embedded `id` field uses a literal base operand and none uses `/$id`, that no schema declares an object whose keys are GTS ids, and that every concrete type closes itself with `unevaluatedProperties: false`.
* A test registers the bundle and a dashboard whose widget carries an embedded id that names a type that does not fit, and confirms the widget's own registration rejects it and only its cell fails.
* A test validates a dashboard with an invalid cell widget, an invalid larger-view widget and a missing root field, and confirms that the first failure is attributed to that cell, the second to that larger view, and the third to the dashboard.
* A test confirms a served type whose id equals a bundle base is rejected before anything registers, and the dashboard shows the dashboard-level cannot-be-shown state.
* A test confirms a stamped data instance whose id names a different data type than the widget's is rejected on registration.
* A test of the trait helper confirms that effective traits equal the RFC 7396 merge of the traits along the `$id` chain, with the trait schema defaults filled in.
* A test confirms an embedded id whose rightmost type is abstract is rejected.
* A dependency check confirms every template-owned id carries a `frontx.dashboard.` segment in its derived part, and no template id reuses a FrontX id.

## Pros and Cons of the Options

### Id operand for embedded instances

**Literal base operand**

* Good, because the literal operand holds wherever the type is embedded and accepts every derived id.
* Good, because it reads the same in the schema and in its documentation.
* Bad, because the base type is written out in each id field.

**`/$id`**

* Good, because `/$id` is shorter to write.
* Bad, because `/$id` resolves to the top-level type being validated, so for an embedded id it checks against the wrong type and rejects valid instances.

### Validation of embedded instances

**Per-instance registration**

* Good, because each embedded widget and stamped data instance is validated against its own type, and a failure is attributed to its cell or larger view.
* Good, because stamped data is given a deterministic combined id, keeping the stamped data bounded by the data widgets of the dashboards opened.
* Bad, because the root must register each embedded instance on its own and keep its own index, since FrontX can't list registered instances.

**Single polymorphic validation of the dashboard**

* Good, because one call checks everything embedded.
* Bad, because the GTS spec and gts-ts do not validate embedded instances against their own type, so the root would need a second step of its own code anyway, and a failed embedded widget could not be attributed to its cell alone.

### Package layout

**One dashboard package**

* Good, because one package has a single place to look, and the prefix `frontx.dashboard` keeps template ids apart from FrontX and other templates.
* Bad, because model and view concerns sit in one package.

**Split model and view packages**

* Good, because the model could be generated and checked without view types.
* Bad, because it adds a dependency direction to maintain, and the single-package form already keeps template ids apart by namespace.

### GTS version

**Target v0.17**

* Good, because the types are written once, in the form they keep.
* Good, because the keywords (`x-gts-type-ref`, `x-gts-instance-ref`, abstract types, traits) carry the checks the template would otherwise implement.
* Bad, because FrontX must run v0.17 before the checks work end to end. gts-plugin 0.6.1 (gts-ts 0.11.2) has the v0.17 reference keywords; the theme and language shared property types remain a FrontX prerequisite, as the DESIGN says.

**Risk of the v0.17 prerequisite.** The template architect owns this prerequisite and tracks it with the FrontX maintainers. The risk is accepted: the template targets v0.17 rather than carry workarounds. gts-plugin 0.6.1 runs the v0.17 reference keywords and resolves references on registration (see More Information). If FrontX has not adopted the v0.17 reference keywords by the template's first non-alpha release, this axis is reviewed again.

**Interim workarounds**

* Good, because workarounds would run on an older GTS version.
* Bad, because workarounds need template code for reference kinds, abstract types and traits, redundant under v0.17.

### Stamped-data id

**Deterministic per-cell id**

* Good, because each load writes the same id again (last write wins), so the store holds at most one stamped instance per data widget and role.
* Good, because every load still validates the new content against its data type.
* Bad, because the namespace constant and the name parts of the id must stay fixed across releases.

**A new id per load**

* Good, because no id rule is needed.
* Bad, because FrontX's store has no removal call, so every load and every binding run adds an instance, and the store grows for the page's lifetime.

### Served type that equals a bundle base

**Reject it before anything registers**

* Good, because a served file cannot shadow a contract base the root relies on, and the product sees a clear dashboard-level failure.
* Bad, because one such type fails every dashboard in the served file.

**Let the first registration win**

* Good, because the rest of the served file still loads.
* Bad, because FrontX keeps the first definition of a type and drops a later one with only a console warning, so the product's served type is silently not used, and its derived types are checked against a base it did not write.

## More Information

* **Reference existence (lookup mode).** gts-plugin 0.6.1 (gts-ts 0.11.2) validates on registration with reference lookup on. It rejects a widget instance whose type's `entry` trait names an entry that is not registered, at that instance's own registration. It rejects a dashboard at the `id` of an embedded widget that is not registered (`/layout/cells/N/widget/id`), a path the layout checks do not count as a cell failure.
* **Load order under lookup.** The root registers, in this order: the bundle schemas (and the theme and language shared-property types where the store has none); the served file's types, then its manifests and entries (a file served in parts: the base file so, then each widget part on its own in list order, and a part the registry rejects, or one that brings a type the store already holds with other content, is left out with one diagnostic while its manifest and entry ids are recorded); each embedded widget instance (`widget` and `larger_view`) on its own; for each widget instance that fails its own registration, a stand-in instance in its place; and last the dashboard instance, with each failed widget replaced by its stand-in. The stand-in is an instance of the bundle's open stand-in type `gts.frontx.dashboard.widget.widget.v1~frontx.dashboard.widget.stand_in.v1~`, which adds nothing to the widget base and names a bundle entry that is never mounted. It carries every field of the failed widget except its `id`, so the dashboard still checks that widget against the open widget base. So a dangling `entry` or `data_type`, an `entry` that came with a widget part left out, a widget type that is not registered, or a `render` the concrete type does not allow fails only that cell or larger view, while an embedded widget with no `id`, or one that breaks the open widget base, still fails the dashboard. The root resolves the effective traits of each widget type it mounts (it needs the `entry` id for the generated extension) and fails the cell when a trait or the `data_type` schema cannot be resolved; under lookup on this only repeats what registration already checked. Tests on gts-plugin 0.6.1 cover each case (`dashboard/src/runtime/register.test.ts`); DESIGN §3.6 step 4 states the order.
* **Review trigger**: revisit when FrontX's GTS plugin changes its validation or listing behaviour, or when a validate-only GTS call arrives.
* **Scope**: this decision covers the GTS schema form, id conventions, the package, validation and registration, stamped data, `render` on the widget base, and the bundle-schema guard. It does not cover the `oneOf` data-widget binding, dashboard `requests` and the binding runner ([ADR-0011](0011-widget-data-binding-v1.md)), the widget catalog types ([ADR-0009](0009-subject-agnostic-widget-catalog-v1.md)), the `widgets` domain and `render_widget` ([ADR-0007](0007-extension-domain-taxonomy-v1.md)), or the widget type → entry trait ([ADR-0008](0008-widget-type-and-mfe-realization-v1.md)).
* **Checklist applicability**: ARCH applicable; PERF applicable (per-instance registration and validation of every widget and stamped data instance on each load counts against the initial-render budget; the realm-wide store grows as stated in Consequences); SEC applicable (the bundle-schema guard keeps a served file from replacing contract bases; the served file is trusted, DESIGN section 4.2); REL applicable (per-cell failure attribution); DATA applicable (schema form, id conventions, validation); INT applicable (GTS plugin prerequisites); OPS N/A because the template is source code with no service, no availability target and no runbook (DESIGN section 4.2); MAINT applicable; TEST applicable; COMPL N/A because this decision sets schema conventions only and handles no personal data; UX applicable for authors (long chained ids, covered by the author guides of DESIGN section 5; no migration, because v1 has no prior users; changes are communicated in release notes); BIZ applicable (the end-to-end checks wait on FrontX adopting GTS v0.17).
* Related: GTS specification v0.17; FrontX gts-plugin 0.6.1 (pins gts-ts 0.11.2).

## Traceability

- **PRD**: [PRD.md](../PRD.md)
- **DESIGN**: [DESIGN.md](../DESIGN.md)

This decision directly addresses the following requirements or design elements:

* `cpt-frontx-dashboard-fr-per-cell-failure` — each embedded widget and stamped data instance is registered on its own, so a failure is attributed to its cell or larger view.
* `cpt-frontx-dashboard-fr-runtime-source` — types and instances are read at runtime; the bundle bases are registered first, and a served type that collides with one is rejected.
* `cpt-frontx-dashboard-interface-contract` — the published shapes (ids, validation, registration, the `dashboard` package) that authors write against.
* `cpt-frontx-dashboard-fr-dashboard-as-json` — a dashboard embeds widget instances, each validated against the type its own id names.
