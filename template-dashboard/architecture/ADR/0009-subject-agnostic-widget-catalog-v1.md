---
status: accepted
version: 1
priority: p1
date: 2026-10-31
decision-makers: template-dashboard architecture maintainers
description: "Decision record for what the widget catalog contains: 9 subject-agnostic widget types, each a GTS type with its own render type (the render schema), a data type (the data shape) and one FrontX MFE entry that shows it, with 8 data widget types derived from data_widget and markdown_card derived from the base with no data, the grid sorting and paging client-side over the rows the transform delivered, and markdown rendered safely."
---

# ADR-0009: Subject-agnostic widget catalog

**ID**: `cpt-frontx-dashboard-adr-subject-agnostic-widget-catalog`

<!-- toc -->

- [Context and Problem Statement](#context-and-problem-statement)
- [Decision Drivers](#decision-drivers)
- [Considered Options](#considered-options)
- [Decision Outcome](#decision-outcome)
  - [Consequences](#consequences)
  - [Confirmation](#confirmation)
- [Pros and Cons of the Options](#pros-and-cons-of-the-options)
  - [Per-type data shapes with one entry per type](#per-type-data-shapes-with-one-entry-per-type)
  - [One generic tabular result with column bindings](#one-generic-tabular-result-with-column-bindings)
  - [A data field on every widget type](#a-data-field-on-every-widget-type)
  - [Subject-specific catalog](#subject-specific-catalog)
- [More Information](#more-information)
- [Traceability](#traceability)

<!-- /toc -->

## Context and Problem Statement

A widget type is three things: a GTS type (the `render` schema), a data type (the `data` schema, for data widgets), and one FrontX MFE entry that shows it. The catalog can be cut along subject lines (one widget type per subject and presentation shape) or along presentation shapes alone. The first grows with every new metric. The second stays small, but then a widget type must state which data it needs and in which form, and a dashboard author writes the binding that produces that form ([ADR-0011](0011-widget-data-binding-v1.md)).

A widget is a passive renderer: it renders the `render_widget {render, value_format?, data}` action, including its own empty state, and makes no requests. Dashboards are written by hand or generated, so a widget definition must be checkable before anything mounts: its render must fit its widget type.

What does the catalog contain, how does a widget type state the data it needs, and how does a widget type that compares values take more than one series?

## Decision Drivers

Drivers in priority order:

* A small catalog whose size is bounded by presentation shapes, not by shape times subject.
* The same widget type is reusable across many datasets without forking the catalog.
* A widget is a passive renderer: it receives data in the form its type declares and does not map columns or compute results.
* Checks happen before display: render that does not fit the widget type fails validation instead of showing wrong content.
* The data contract stays typed in GTS, so the root's registration validates it ([ADR-0003](0003-shared-data-types-and-schemas-v1.md)).
* The grid sorts and pages client-side over the rows the transform delivered.

## Considered Options

* Per-type data shapes with one entry per type
* One generic tabular result with column bindings
* A data field on every widget type
* Subject-specific catalog

## Decision Outcome

Chosen option: "Per-type data shapes with one entry per type", because the catalog stays bounded by presentation shapes, each widget type states exactly the data it needs, the widget does no mapping, and a dashboard author writes the binding that produces the shape.

**Widget type, data type, entry.** A widget type is a GTS type with its own render type (the `render` schema), a data type (the `data` schema), and one FrontX MFE entry that shows it. The widget type points to its entry through the `entry` trait, and to its data type through the `data_type` trait ([ADR-0008](0008-widget-type-and-mfe-realization-v1.md)). The root registers the render type and the data type from the served file.

**Widget base and `data_widget`.** The abstract widget base carries `id`, `title?`, and `render`. The abstract `data_widget` derives from it, adds a required `data` (the binding), and declares the `data_type` trait. Every data-taking widget type derives from `data_widget`; `markdown_card` derives from the base directly and closes itself, so its schema forbids `data`. `markdown_card` carries its text in `render`; its text is configuration, not data.

**Widget-data base.** The abstract widget-data base `gts.frontx.dashboard.widget_data.widget_data.v1~` carries `id`. Each data widget type has one closed derived data type, e.g. `…widget_data.v1~frontx.dashboard.widget_data.pie_chart.v1~`. The root stamps the transform result with `<data type>~<UUIDv5(namespace, widget id | role)>` and registers it, which validates it against its data type ([ADR-0003](0003-shared-data-types-and-schemas-v1.md)). There is one data type per widget type, even where two shapes are identical, so they can differ. Value fields accept `null`, and a widget renders a `null` as a gap or an empty value; for `metric_card`, a `null` `value` is the empty state.

**Nine widget types.** The catalog has 9 subject-agnostic widget types: 8 data widget types (`summary_card`, `metric_card`, `ranked_list_card`, `progress_list_card`, `grid`, `cartesian_chart`, `pie_chart`, `heatmap`) and `markdown_card`. No widget type gives its render a subject: the subject is the data the binding produces.

**Render schemas and data shapes per type.** This decision fixes the 9 widget types and the grid row cap of 500. The render schema and data shape of each type, including the richer render fields (series options and axes for `cartesian_chart`, radius and rose type for `pie_chart`, frozen columns, column groups and row colours for `grid`, scale bounds for `heatmap`), are specified in full in the [widget catalog FEATURE](../features/feature-widget-catalog/FEATURE.md). The value format and its unit sit on `data_widget`, so every data widget type inherits them.

**Grid row cap and page sizes.** The cap counts the rows the transform delivers in total, not the rows on one page: the grid's transform output is capped at 500 rows, and a larger result fails data validation and is never truncated. The page sizes are a render field, each up to 500, specified in the widget catalog FEATURE, which also carries the cap in the grid data schema. The grid always pages, client-side, over the rows the transform delivered ([ADR-0005](0005-data-grid-library-v1.md)).

Why 500: the cap equals the largest page size, so the whole capped result fits on one page at the largest size. The worst case is then one page of 500 rows, sorted and rendered in the browser, and the large-grid check measures exactly that case: the reference grid delivers 500 rows and is shown at a page size of 500 (`cpt-frontx-dashboard-nfr-large-table`). If that check fails, the cap is revisited.

**Data size of the other types.** The product owns the data size of the other 7 data types, as it owns the dashboard size; the template adds no cap for them. The only other template-side bound is the response-size cap of the binding ([ADR-0011](0011-widget-data-binding-v1.md)). The reference dashboard fixes the data sizes the budgets are measured with.

**Markdown safety.** `markdown_card` shows CommonMark as formatted text (`cpt-frontx-dashboard-fr-markdown-safety`). The threat: the dashboard author is trusted, but the markdown may be generated, so the rules hold for any text, including text that tries to run script or load content from elsewhere. The rules:

* Embedded HTML is shown as text, never rendered.
* A link or image target is read the way the browser's URL parser reads it: tab, line feed and carriage return are removed and character entities are decoded before the scheme is checked, so an obfuscated scheme is caught.
* Links use an allow-list: `http`, `https`, `mailto` and relative targets. A link with any other scheme (for example `javascript`, `vbscript`, `data`, `file` or `blob`) renders as plain text. Links open with no opener.
* Images load only from same-origin paths. Any other image shows its alt text, or nothing when it has none.

The parser that renders the markdown is markdown-it (MIT), a runtime library like the chart and grid libraries, so its licence must be Apache-2.0, MIT, ISC, BSD-2-Clause, BSD-3-Clause or 0BSD, or an `AND` of them (DESIGN §4.2). It runs with raw HTML off, and its link-validation hook applies the link and image rules above.

**Closed presentation fields.** Every concrete widget type ends with `unevaluatedProperties: false` and closes `render` with its own render type, one per widget type as there is one data type per widget type: a type derived from the open render base `gts.frontx.dashboard.widget.render.v1~`, e.g. `…widget.render.v1~frontx.dashboard.widget.pie_chart_render.v1~`, closed with `unevaluatedProperties: false`, which the widget type's `render` refers to by `$ref`. A misspelled render field, or one of the wrong type, fails the widget's own registration, and the widget gets the cannot-be-shown state ([ADR-0003](0003-shared-data-types-and-schemas-v1.md)).

**Contract changes.** The widget types and data types are part of the published contract: dashboard authors write against them, and a product's replacement entry must accept them ([ADR-0008](0008-widget-type-and-mfe-realization-v1.md)). Every type starts at `v1` and follows the stability rule of DESIGN §3.1. An incompatible change ships as a new type version. Consumers learn of each change from the release notes of the template release ([ADR-0010](0010-template-packages-and-host-contract-v1.md)). A replacement entry must accept its type's `render` and data shape.

### Consequences

* Good, because the catalog is bounded by presentation shapes: a new dataset needs no new widget type.
* Good, because each widget type states the exact data it needs, and the root's registration validates every answer against it.
* Good, because widgets do no column mapping and no result computing.
* Good, because render that does not fit the widget type fails before display.
* Good, because a widget type without data never requests data.
* Neutral, because one data type per widget type exists even where some shapes are identical; this keeps them free to differ.
* Bad, because the final render schemas and data shapes per type are a catalog decision that the FEATURE settles, so the ADR names the types and the FEATURE the details.

### Confirmation

* A schema test validates, for each of the 8 data widget types, one accepted `render` and one rejected `render`.
* A schema test checks that a misspelled render field on each concrete widget type fails validation, and that `markdown_card` accepts no `data`.
* A test renders a `markdown_card` whose body contains CommonMark formatting, a link, a same-origin image and embedded HTML, and checks that the formatting, link and image are shown, the HTML is shown as text and not rendered, and a `javascript:` link renders as plain text.
* An abuse-case test renders links whose scheme is hidden by tabs, line breaks, character entities or mixed case, and links with `vbscript`, `data`, `file` and `blob` schemes, and checks that each renders as plain text; it also checks that a cross-origin image shows its alt text and loads nothing.
* The package-wide licence check passes for the markdown parser, markdown-it (MIT).
* A test sends each data widget type an instance of its data shape and checks the root accepts it; it also checks an answer of another type's shape is rejected.
* A test checks the grid sorts and pages client-side over the rows the transform delivered, up to the row cap, and sends no request.
* A test checks that a grid result of 500 rows is accepted, and that a result of 501 rows fails data validation for its cell and is not truncated.
* A schema test checks that every data widget type has its own data type, and that every data widget type inherits `value_format` from `data_widget`.
* A test checks that a `null` value field is shown as a gap or empty value, and a `null` `value` on `metric_card` is the empty state.

## Pros and Cons of the Options

### Per-type data shapes with one entry per type

An abstract `data_widget` holds `data` and the `data_type` trait. Eight concrete data types and eight data shapes. One entry per widget type, pointed to by the `entry` trait.

* Good, because each widget type gets exactly the data it needs, in a typed shape.
* Good, because the root can check render against the type before mounting.
* Good, because the grid sorts and pages client-side on the rows the transform delivered.
* Neutral, because the shapes are many but small, and each is one schema.
* Bad, because the final render schemas and data shapes per type are a catalog decision.

### One generic tabular result with column bindings

Every widget receives the same tabular result. Each widget type binds result columns to its roles in its own render.

* Good, because the data contract is one shape and does not grow with the catalog.
* Bad, because each widget must map columns and check that the bound columns exist, so it is not a passive renderer.
* Bad, because the root cannot check that the data fits a widget type; only the widget can, at run time.
* Bad, because column bindings repeat the result columns in the render, which can drift from the data.

### A data field on every widget type

The widget base carries `data` and the `data_type` trait. A widget type without data leaves them out of use.

* Good, because the hierarchy has one level fewer.
* Bad, because `markdown_card` cannot satisfy a required `data_type` trait, so the traits must be optional and the check that a data widget has them is lost.

### Subject-specific catalog

One widget type per subject and presentation shape combination.

* Good, because each widget is pre-tuned to one subject.
* Bad, because the catalog grows with every new metric, which is the problem the template exists to solve.

## More Information

* **Review trigger**: revisit when a widget type needs a data shape the catalog cannot express, or when a product needs a subject-specific widget, or when the large-grid check fails at the row cap.
* **Scope**: this decision covers the catalog structure (widget type = GTS type + data type + entry), the 9 types, the grid's client-side sort and page, and markdown safety. This decision fixes the grid row cap of 500. The final render schemas and data shapes per type and the grid page sizes are decided in the [widget catalog FEATURE](../features/feature-widget-catalog/FEATURE.md), which carries the cap in the grid data schema.
* **Checklist applicability**: ARCH applicable; PERF applicable (client-side grid sort and page over at most 500 rows; the product owns the data size of the other types); SEC applicable (markdown safety); REL N/A; DATA applicable (per-type data shapes, closed render schemas); INT applicable (the widget types and data types are a published contract; see Contract changes); OPS N/A; MAINT applicable (one data type per widget type to maintain); TEST applicable; COMPL applicable (the markdown parser is MIT, one of the permissive licences of DESIGN §4.2); UX applicable (the catalog's visual consistency and accessibility); BIZ N/A.
* **Security review**: the markdown safety rules are reviewed as part of this decision by its decision makers; no separate security sign-off is recorded. Required abuse-case tests: scheme bypass of links (obfuscated, entity-encoded and non-allow-listed schemes) and cross-origin images (see Confirmation). Security monitoring: not applicable, because the template runs no service (DESIGN §4.2).
* Related: DESIGN §6 Worked Example shows the `pie_chart` and `cartesian_chart` types and shapes.

## Traceability

- **PRD**: [PRD.md](../PRD.md)
- **DESIGN**: [DESIGN.md](../DESIGN.md)

This decision directly addresses the following requirements or design elements:

* `cpt-frontx-dashboard-fr-widget-catalog` — the 9 subject-agnostic widget types, each a GTS type, a data type and an entry.
* `cpt-frontx-dashboard-fr-grid-sort-page` — the grid sorts and pages client-side over the rows the transform delivered.
* `cpt-frontx-dashboard-fr-markdown-safety` — `markdown_card` renders CommonMark safely: HTML as text, allow-listed links only, and same-origin images only.
* `cpt-frontx-dashboard-interface-contract` — the widget types and data shapes are part of the published contract.
