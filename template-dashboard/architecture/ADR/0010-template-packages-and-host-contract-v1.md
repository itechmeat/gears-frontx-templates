---
status: accepted
version: 1
priority: p1
date: 2026-10-31
decision-makers: template-dashboard architecture maintainers
description: "Decision record on how template-dashboard splits into packages, what the manifest channel carries, how the template serves its own GTS file of types and instances, where the dashboard root runs, how template schemas are registered, how shared dependencies are fetched and counted, and what the template requires from the host: a container, a dashboard id, and the theme and language values."
---

# ADR-0010: Template packages and host contract

**ID**: `cpt-frontx-dashboard-adr-template-packages-and-host-contract`

<!-- toc -->

- [Context and Problem Statement](#context-and-problem-statement)
- [Decision Drivers](#decision-drivers)
- [Considered Options](#considered-options)
- [Decision Outcome](#decision-outcome)
  - [Consequences](#consequences)
  - [Confirmation](#confirmation)
- [Pros and Cons of the Options](#pros-and-cons-of-the-options)
  - [Two packages, hosting-agnostic, host contract by role](#two-packages-hosting-agnostic-host-contract-by-role)
  - [One package per widget type](#one-package-per-widget-type)
  - [Types and entries built into the dashboard root](#types-and-entries-built-into-the-dashboard-root)
  - [Types and entries carried only in package manifests](#types-and-entries-carried-only-in-package-manifests)
  - [Bundle schemas registered by a package manifest or the host's bootstrap](#bundle-schemas-registered-by-a-package-manifest-or-the-hosts-bootstrap)
  - [Each widget entry bundles its own libraries](#each-widget-entry-bundles-its-own-libraries)
  - [A fixed host application](#a-fixed-host-application)
  - [The dashboard root only as a screen extension](#the-dashboard-root-only-as-a-screen-extension)
- [More Information](#more-information)
- [Traceability](#traceability)

<!-- /toc -->

## Context and Problem Statement

The dashboard runs inside a host application. The template is a blueprint: the product copies it into its project and modifies it. The template's code has parts with different roles: the dashboard root, which owns the `widgets` domain and renders dashboards; and a library of widgets, each widget type with one FrontX MFE entry ([ADR-0007](0007-extension-domain-taxonomy-v1.md), [ADR-0008](0008-widget-type-and-mfe-realization-v1.md)). The template has no backend access of its own; the product's API answers the requests a binding makes ([ADR-0011](0011-widget-data-binding-v1.md)). A product may change which entry a template widget type points to, in its own copy of the served file.

The GTS types and instances (widget types, data types, entries) are read at runtime, never baked in at build time. In v1 they come from a JSON file the template serves as if from a backend; a product may serve its own. The dashboard root registers the bundle schemas at start, before it fetches the file.

FrontX isolates every widget instance (FrontX ADR-0011). A shared dependency is built as one standalone chunk, and its source text is fetched once only when every template widget publishes the same `contentHash` for it (FrontX ADR-0034); the cache reaches the whole realm (FrontX ADR-0035). The realm cache holds 128 entries. This shapes the download size.

How does the template split into packages, what does it depend on, where does the served GTS file come from, where are the template's schemas registered, how are shared dependencies fetched and counted, and what does the template require from the host?

## Decision Drivers

* **Hosting-agnostic.** The dashboard root can be copied into a single-page application or into a host that runs a screen, with no restriction. The template depends on FrontX packages only, never on a host or shell template.
* Sign-in is out of scope; each request a binding makes is authenticated by the product, in the host it passes.
* No dashboard content and no backend configuration are packaged: dashboards and widget data come from the served file and the product's API.
* The template's schemas must be registered before any dashboard loads, in either hosting form.
* A product changes which entry a widget type points to by editing its copy of the served file, with no template change.
* Per-instance isolation: no package relies on state shared between instances, and the download size, with each shared dependency fetched once, stays within the budget (`cpt-frontx-dashboard-nfr-bundle-budget`).

## Considered Options

* Two packages, hosting-agnostic, host contract by role
* One package per widget type
* Types and entries built into the dashboard root
* Types and entries carried only in package manifests
* Bundle schemas registered by a package manifest or the host's bootstrap
* Each widget entry bundles its own libraries
* A fixed host application
* The dashboard root only as a screen extension

The options compare the parts of this decision that have real alternatives: the package split, the source of types and entries, the actor that registers the bundle schemas, and the shared dependencies with their budget basis. The other parts follow from constraints, not from a choice. Depending on FrontX packages only, the abstract hosting form and the host contract by role follow from the hosting-agnostic driver. Taking template changes by merging a release follows from the template being a blueprint the product copies. The last two options are excluded by the hosting-agnostic driver and are listed only for the record.

## Decision Outcome

Chosen option: "Two packages, hosting-agnostic, host contract by role", because the dashboard runs in the product's existing application, depends on FrontX packages alone, keeps the widget library one release unit, lets a product change entries in its own copy of the served file, leaves the hosting of the dashboard root to the product, names what it needs from the host by role, reads types and entries at runtime from a served file, and fetches each shared dependency once.

* **Dependencies.** The template depends on the FrontX packages it pins to exact published versions, including `@gears-frontx/ui-kit`, on a FrontX release that runs GTS v0.17. It depends on no host or shell template. It carries no endpoint configuration and makes no backend call: the root sends the served-file load and every widget data request to the `DashboardHost` the product passes ([ADR-0011](0011-widget-data-binding-v1.md)); the template ships `fetchHost`, a plain implementation over `fetch`, and the product passes its own host when its API needs more.
* **Packages, split by role.**
  * `dashboard`: the GTS types the template owns, in the `dashboard` package ([ADR-0003](0003-shared-data-types-and-schemas-v1.md)) — the dashboard type, the widget base, `data_widget`, the widget-data base, the request type, the `render_widget` action, the `widgets` domain and its extension type. It also holds the code of the dashboard root, the binding runner, the cell frame and the larger-view overlay, the trait helper, and the template's GTS file.
  * `widgets`: the code of the 9 widget entries, one per widget type, each in its own widget bundle with its own manifest. The widget author writes each bundle's manifest and entry in `bundles/<widget_type>/mfe.json`, and the FrontX manifest pipeline completes them from the bundle's build. They reach the runtime only through the served GTS file: publishing puts them there, and the root registers them from it. The entry is a plain FrontX MFE entry ([ADR-0008](0008-widget-type-and-mfe-realization-v1.md)). The package has no data-request code and no error chrome of the cell: a widget renders `render_widget` and shows its own empty state, and its own cannot-be-shown state when its own checks of the payload fail or its drawing fails (the static localized text, with the problem written to the console only). Every other cannot-be-shown state in a cell (a binding, transform or validation failure) is shown by the dashboard root, and its code is in `dashboard`. The cell frame belongs to the root, not to `widgets`.
* **Hosting of the dashboard root is abstract.** The dashboard root is either a screen extension the host mounts, or code copied into a single-page application. Everything else holds for both forms. The product copies the template into its project and modifies it for its form.
* **Registration of the template's schemas.** The bundle schemas (the contract types, the request type, the `render_widget` action, the `widgets` domain and its extension type) are registered by the dashboard root itself, at start, in either hosting form. No manifest and no host bootstrap registers them. The root registers them before it fetches the served file, so the bundle-schema guard (ADR-0003) can reject a colliding served type.
* **Manifest channel.** A package's manifest carries MFE entries and static extensions, never the template's GTS types: the root registers the bundle schemas itself, and every other type comes from the served file. Dashboards, widget instances and widget data never travel through the manifest; they come from the served file and the product's API.
* **The served GTS file.** The template serves its own JSON file of GTS types and instances: the widget types, the data types, the 9 entries with the manifests of their widget bundles, and the dashboards. It is the one runtime home of the entries. The dashboard root fetches it at start, as if a backend returned it, with the same 30000 ms timeout as a request. Then it applies the bundle-schema guard, which rejects the whole file if a served type id equals a bundle base, so nothing registers. Then it registers the contents before any dashboard loads. A product changes which entry a widget type points to by editing its copy of the file. A backend that returns GTS types and instances can replace the file without changing the dashboard root. Nothing in the flow depends on where the file comes from.
* **Cost of the served file.** The fetch and the registration of every item in the file run serially before a dashboard loads, so they sit on the critical path inside the initial-render window (`cpt-frontx-dashboard-nfr-initial-render`). In v1 the template's file holds 9 widget types, 8 data types, 9 entries, 9 manifests and the product's dashboards. The template does not cap the file: the product owns its copy, and so its size and growth, as it owns dashboard size. The initial-render measurement on the reference dashboard includes the fetch and the registration and records their time.
* **Shared dependencies and budget basis.** In every template widget entry, the packages listed in the manifest's `shared` array are built as shared dependencies, one standalone chunk each. The source text of a shared dependency is fetched once only when every template widget publishes the same `contentHash` for it (FrontX ADR-0034), and the cache reaches the whole realm (FrontX ADR-0035). The realm cache holds 128 entries. Each widget instance still evaluates its own copy (FrontX ADR-0011), so no state is shared between instances. The budget counts transferred gzipped bytes on a cold load of the reference dashboard: the dashboard root with the shared dependencies it fetches, each widget entry with its own code only, and each shared dependency once in the page total. The provisional figures are in the DESIGN.
* **Host contract by role.** The template names what it needs from the host by role: a container for the dashboard root, a dashboard id (for example from its route), and the theme and language values. It depends on no host or shell template. These are all of the host's duties:
  * supply the container, the dashboard id and the theme and language values, and pass on every theme or language change;
  * in the screen-extension form, register the root's entry and mount it as a screen extension, as for any FrontX screen extension;
  * in the single-page form, create the root and pass it its `DashboardHost`: the shipped `fetchHost`, or the product's own answers.

  The product, not the host, passes the root its `DashboardHost` in the MFE form and serves the GTS file. The bundle schemas are not a host duty: the root registers them. The technical form in which each input reaches the root in each hosting form is an open item in DESIGN §4.4.
* **Template changes reach a product's copy by merging a template release.** The release notes of each release list the changes to the contract: the widget types, the data shapes, the binding, and the `render_widget` action. Product code lives outside template-owned files, so release merges stay clean.

### Consequences

* Good, because the dashboard runs in any host application that meets the role-based requirements, with no dependency on a host or shell template.
* Good, because the manifests carry no dashboard content and the template holds no endpoint configuration, so a new dashboard needs no package change.
* Good, because a product changes which entry a widget type points to by editing its copy of the served file, with no template change.
* Good, because the served GTS file lets a backend that returns GTS types and instances replace it without changing the dashboard root.
* Good, because building the listed packages as shared dependencies lets FrontX fetch the source text of each once, and the budget counts it once.
* Bad, because the product copies and modifies the template, so its copy can drift from the template. The contract is the stable part: the widget types, the data shapes, the binding, and `render_widget`. A product takes template changes by merging a release.
* Bad, because widgets cannot share state between instances: each evaluates its own copy of every shared dependency (FrontX ADR-0011). Source reuse saves fetches, not evaluation; the evaluation cost falls under the initial-render budget.
* Bad, because the single fetch of a shared dependency holds only while every template widget publishes the same `contentHash` for it; widgets built from different package versions fetch it once per distinct hash and exceed the budget basis.
* Neutral, because the 9 widget types share one package for their code, but each ships as its own bundle with its own manifest, so one type is released, fixed or rolled back without the others.
* Bad, because the served file is a single point of failure: every widget type, data type and entry comes from it. A failed fetch (including a timeout) or a rejected type, manifest or entry is a dashboard-level failure, and one rejected item fails every dashboard in the file. This is accepted because the file is one release unit. A file served in parts narrows this to the base file: a widget part the registry rejects is left out, and only the cells whose widget type names an entry it failed to bring fail. There is no retry in v1. Remounting with the same dashboard id starts a new load, and a page reload also recovers. The product owns the file's availability and size.
* Bad, because the served file's fetch and registration add to the initial render, and the cost grows with the file. Mitigation: the product owns the file's size, and the initial-render measurement includes this step.
* Bad, because the served file and every manifest are trusted, product-controlled input that selects which code runs: an entry names the code FrontX loads. The root checks them only by GTS validation and the bundle-schema guard. The product keeps the file and its manifests under its own release control.
* Bad, because realm-wide reuse of shared-dependency source text trusts the `contentHash` a manifest declares. FrontX does not check the fetched text against it (FrontX ADR-0034), so every manifest registered in the realm is trusted input.
* Neutral, because the host the product passes carries only what the product puts in it, and the template adds no credentials or headers. If the product leaves out its auth, the product's API decides access, and a rejection (401 or 403) is a failed request: the cell shows the cannot-be-shown state, so the failure is closed.

### Confirmation

Confirmed when:

* A dependency check finds the template's packages depend on the pinned FrontX packages only, and on no host or shell template.
* A search of the template finds no endpoint configuration, and `widgets` contains no code that requests data from a backend and no error chrome. Its widgets show their own empty state, and their own cannot-be-shown state when their own checks of the payload fail or their drawing fails; every other cannot-be-shown state in a cell (a binding, transform or validation failure) is shown by the dashboard root, and its code is in `dashboard`.
* A test confirms the served GTS file carries exactly 9 entries, one per widget type, each with the manifest of its own widget bundle, and each served widget type names one of them in `entry`.
* A test confirms no package manifest carries a dashboard, a widget instance or widget data.
* A test confirms the dashboard root fetches the served GTS file at start and registers its contents before any dashboard loads; a test that serves the same GTS types and instances from a test backend instead of the file changes nothing.
* A test confirms a product that sets a different `entry` on a template widget type in its copy of the served file mounts that entry, with no template change.
* A test confirms, in both hosting forms, that the root registers the bundle schemas at start before it fetches the served file, that no manifest or host bootstrap registers them, and that a served type whose id equals a bundle base is rejected before anything registers.
* A test confirms that a served file that cannot be fetched, times out, or holds a rejected type, manifest or entry fails the dashboard at dashboard level with no retry, and that remounting with the same dashboard id starts a new load.
* A test confirms that a request rejected with 401 or 403, because the product's host carries no auth, is a failed request that shows the cannot-be-shown state.
* A check confirms each template release has release notes that list the changes to the contract (the widget types, the data shapes, the binding, and the `render_widget` action).
* A check confirms every listed shared package passes the package-wide licence check, and all template widgets publish the same `contentHash` for each shared dependency.
* Build review confirms the packages listed in each manifest's `shared` array are built as shared dependencies and no widget relies on state shared between instances.
* A measurement confirms transferred gzipped bytes on a cold load of the reference dashboard, with each shared dependency counted once, and records one fetch per shared dependency.
* The initial-render measurement on the reference dashboard records the time of the served file's fetch and registration inside the measured window.
* Both hosting forms are exercised: the dashboard root mounts as a screen extension in one, and is copied into a single-page application in the other.

## Pros and Cons of the Options

### Two packages, hosting-agnostic, host contract by role

A `dashboard` package and a `widgets` package, a dependency on FrontX packages only, and host requirements stated by role.

* Good, because the dashboard runs in any host that meets the role-based requirements, with no host or shell template dependency.
* Good, because the widget library is one release unit, and a product changes entries in its own copy of the served file.
* Good, because the served GTS file can be replaced by a backend without changing the dashboard root.
* Bad, because the product's copy can drift from the template; the contract is the stable part.

### One package per widget type

The `dashboard` package plus 9 widget packages, each with its own manifest.

* Good, because each widget type is released on its own.
* Bad, because 9 widget packages and 9 manifests are a heavy split for a catalog that is released together.
* Bad, because a product must merge 9 packages to take a catalog change.

### Types and entries built into the dashboard root

The widget types, the data types and the entries are part of the root's build; there is no served file.

* Good, because the root needs no fetch at start, so there is no extra request and no extra failure point.
* Bad, because a new widget type or a changed entry needs a product rebuild and redeploy, which `cpt-frontx-dashboard-fr-add-fix-widget` rules out.
* Bad, because a backend that returns GTS types and instances could not replace the source without changing the root (`cpt-frontx-dashboard-fr-runtime-source`).

### Types and entries carried only in package manifests

The widget bundles' manifests carry the widget types, the data types and the entries, and they are registered through the manifest channel; there is no served file.

* Good, because it uses the FrontX manifest channel and needs no file of its own.
* Bad, because a manifest is produced from a package build, so a product could not change an entry or add a type by editing a file; it would rebuild the package.
* Bad, because dashboards never travel through a manifest, so a second source is still needed for them.
* Bad, because the root would not control when the types register, so it could not apply the bundle-schema guard before them.

### Bundle schemas registered by a package manifest or the host's bootstrap

In the screen-extension form a template package manifest registers the bundle schemas; in the single-page form the host's bootstrap does.

* Good, because the schemas are in place before the root's code runs.
* Bad, because the actor differs per hosting form, so the two forms behave differently and the host contract gains a duty.
* Bad, because the root cannot tell whether the schemas were registered before it fetches the served file.

### Each widget entry bundles its own libraries

Every widget entry bundles ui-kit, Recharts and the other libraries into its own code; nothing is a shared dependency, and the budget counts each entry with its libraries.

* Good, because no two entries must publish the same `contentHash`, and each entry is self-contained.
* Neutral, because evaluation cost does not change: every widget instance evaluates its own copy either way (FrontX ADR-0011).
* Bad, because each library is fetched once per widget entry that uses it, so a page with several chart types downloads Recharts several times and exceeds the bundle budget (`cpt-frontx-dashboard-nfr-bundle-budget`).

### A fixed host application

Excluded by the hosting-agnostic driver; listed for the record. The template ships its own host application.

* Good, because the template controls the whole application.
* Bad, because the product already has an application; the template must be hosting-agnostic, not impose a host.

### The dashboard root only as a screen extension

Excluded by the hosting-agnostic driver; listed for the record. The template fixes the dashboard root as a screen extension the host mounts.

* Good, because a screen extension is one clean hosting form.
* Bad, because a single-page application that has no screen domain could not host the dashboard root; the template must be hosting-agnostic.

## More Information

* **Review trigger**: revisit when a product needs a hosting form the role-based contract cannot meet, or when FrontX changes shared-dependency fetching.
* **Scope**: this decision covers the package split, the dependencies, the served GTS file and its cost and failure mode, schema registration, shared dependencies and the budget basis, and the host contract by role. It does not cover the widget catalog ([ADR-0009](0009-subject-agnostic-widget-catalog-v1.md)), the `widgets` domain and `render_widget` ([ADR-0007](0007-extension-domain-taxonomy-v1.md)), the binding runner ([ADR-0011](0011-widget-data-binding-v1.md)), or the GTS conventions ([ADR-0003](0003-shared-data-types-and-schemas-v1.md)).
* **Checklist applicability**: ARCH applicable; PERF applicable (shared dependencies fetched once, budget basis, the served file's fetch and registration on the critical path); SEC applicable (no endpoint config, no backend call; the served file and manifests are trusted input that selects executed code; realm-wide reuse trusts declared content hashes; a product host without auth fails closed); REL applicable (the served file is a single point of failure, with no retry; recovery is a remount or a reload); DATA N/A; INT applicable (FrontX packages and the host contract); OPS N/A; MAINT applicable (the contract is the stable part); TEST applicable; COMPL applicable (permissive licences only); UX N/A; BIZ applicable (hosting-agnostic keeps adoption cheap).
* **Security review**: the trust points above are reviewed as part of this decision by its decision makers; no separate security sign-off is recorded. Required abuse-case tests: a served type that collides with a bundle base, and a request rejected because the product's host carries no auth (see Confirmation). Security monitoring: not applicable, because the template runs no service (DESIGN §4.2).
* Related decisions: FrontX ADR-0011 (instance isolation), FrontX ADR-0034 (shared dependency source-text reuse by content hash), FrontX ADR-0035 (realm-wide reach of that reuse).

## Traceability

- **PRD**: [PRD.md](../PRD.md)
- **DESIGN**: [DESIGN.md](../DESIGN.md)

This decision directly addresses the following requirements or design elements:

* `cpt-frontx-dashboard-fr-runtime-source` — the served GTS file is the v1 runtime source; a backend can replace it without changing the dashboard root.
* `cpt-frontx-dashboard-contract-host` — the template depends on FrontX packages only, never on a host or shell template, and the host supplies a container, a dashboard id, and the theme and language values.
* `cpt-frontx-dashboard-nfr-bundle-budget` — shared dependencies are fetched once and counted once in the page total.
* `cpt-frontx-dashboard-nfr-initial-render` — the served file's fetch and registration sit inside the initial-render window and are measured there.
* `cpt-frontx-dashboard-fr-add-fix-widget` — a product changes which entry a widget type points to in its own copy of the served file.
