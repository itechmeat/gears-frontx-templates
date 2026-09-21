---
type: DESIGN
system: frontx-workspace-templates
status: draft
---

# Technical Design - Workspace Template Family

- [ ] `p3` - **ID**: `cpt-frontx-workspace-templates-design-workspace-templates`

<!-- toc -->

- [1. Architecture Overview](#1-architecture-overview)
  - [1.1 Architectural Vision](#11-architectural-vision)
  - [1.2 Architecture Drivers](#12-architecture-drivers)
  - [1.3 Architecture Layers](#13-architecture-layers)
- [2. Principles & Constraints](#2-principles--constraints)
  - [2.1 Design Principles](#21-design-principles)
  - [2.2 Constraints](#22-constraints)
  - [2.3 Obligations On The Consuming Level](#23-obligations-on-the-consuming-level)
- [3. Technical Architecture](#3-technical-architecture)
  - [3.1 Domain Model](#31-domain-model)
  - [3.2 Component Model](#32-component-model)
  - [3.3 API Contracts](#33-api-contracts)
  - [3.4 Internal Dependencies](#34-internal-dependencies)
  - [3.5 External Dependencies](#35-external-dependencies)
  - [3.6 Interactions & Sequences](#36-interactions--sequences)
  - [3.7 Database schemas & tables](#37-database-schemas--tables)
- [4. Additional context](#4-additional-context)
  - [Worked Example: The Family's GTS Surface](#worked-example-the-familys-gts-surface)
- [5. Traceability](#5-traceability)

<!-- /toc -->

**References to the FrontX ecosystem.** This document names the ecosystem decisions and artifacts it depends on by their `cpt-` id. None of them lives in this repository; they live in the FrontX ecosystem repository, [`gears-frontx`](https://github.com/constructorfabric/gears-frontx), at these paths on its `develop` branch:

| Named here as | File in the ecosystem repository |
|---|---|
| `cpt-frontx-adr-action-dispatch-and-chaining` | [architecture/ADR/0007-action-dispatch-and-chaining.md](https://github.com/constructorfabric/gears-frontx/blob/develop/architecture/ADR/0007-action-dispatch-and-chaining.md) |
| `cpt-frontx-adr-extension-domain-occupancy` | [architecture/ADR/0009-extension-domain-occupancy.md](https://github.com/constructorfabric/gears-frontx/blob/develop/architecture/ADR/0009-extension-domain-occupancy.md) |
| `cpt-frontx-adr-domain-extension-compatibility` | [architecture/ADR/0010-domain-extension-compatibility.md](https://github.com/constructorfabric/gears-frontx/blob/develop/architecture/ADR/0010-domain-extension-compatibility.md) |
| `cpt-frontx-adr-source-spec-syntax` | [architecture/ADR/0017-source-spec-syntax.md](https://github.com/constructorfabric/gears-frontx/blob/develop/architecture/ADR/0017-source-spec-syntax.md) |
| `cpt-frontx-adr-template-manifest-contract` | [architecture/ADR/0018-template-manifest-contract.md](https://github.com/constructorfabric/gears-frontx/blob/develop/architecture/ADR/0018-template-manifest-contract.md) |
| `cpt-frontx-adr-contract-schema-ownership` | [architecture/ADR/0027-contract-schema-ownership.md](https://github.com/constructorfabric/gears-frontx/blob/develop/architecture/ADR/0027-contract-schema-ownership.md) |
| `cpt-frontx-adr-uniform-template-mechanism` | [architecture/ADR/0030-uniform-template-mechanism.md](https://github.com/constructorfabric/gears-frontx/blob/develop/architecture/ADR/0030-uniform-template-mechanism.md) |
| `cpt-frontx-adr-template-territory-traceability` | [architecture/ADR/0033-template-territory-traceability.md](https://github.com/constructorfabric/gears-frontx/blob/develop/architecture/ADR/0033-template-territory-traceability.md) |
| the ecosystem's root PRD and DESIGN | [architecture/PRD.md](https://github.com/constructorfabric/gears-frontx/blob/develop/architecture/PRD.md), [architecture/DESIGN.md](https://github.com/constructorfabric/gears-frontx/blob/develop/architecture/DESIGN.md) |
| the CLI's own PRD and DESIGN | [packages/cli/architecture/PRD.md](https://github.com/constructorfabric/gears-frontx/blob/develop/packages/cli/architecture/PRD.md), [packages/cli/architecture/DESIGN.md](https://github.com/constructorfabric/gears-frontx/blob/develop/packages/cli/architecture/DESIGN.md) |
| the runtime's own PRD and DESIGN | [packages/mfes/architecture/PRD.md](https://github.com/constructorfabric/gears-frontx/blob/develop/packages/mfes/architecture/PRD.md), [packages/mfes/architecture/DESIGN.md](https://github.com/constructorfabric/gears-frontx/blob/develop/packages/mfes/architecture/DESIGN.md) |

## 1. Architecture Overview

### 1.1 Architectural Vision

The Workspace Template Family composes five independently-versioned template-territory directories - one shell, `template-workspace`, and four screens, `template-workspace-contacts`, `template-workspace-dashboard`, `template-workspace-chat`, `template-workspace-mail` - into one application, reusing the runtime's existing screen extension domain rather than declaring a family-specific one. The design problem this document owns is narrow and specific: what ecosystem-visible contract keeps five siblings, built and released on independent schedules by potentially different Template Developers, composing correctly without any one of them reading another's source. What is not this document's problem is restated from `cpt-frontx-adr-template-territory-traceability`: none of the five siblings' own internal file contents, build configuration, or component code is specified here or anywhere in the ecosystem artifact tree; the domain-model mapping this design is generated from carries that detail at file-level altitude and is referenced rather than duplicated ([mapping](../explorations/2026-09-02-workspace-template-domain-mapping.md)).

This document is this repository's own architecture over one template family it publishes, not part of the ecosystem repository's artifact tree. `cpt-frontx-adr-template-territory-traceability` leaves an artifact tree over the templates to the repository that publishes them, and this document is that latitude exercised for one family: the five family directories' own payload stays outside the ecosystem repository's traceability scan, and no `@cpt-` marker is expected or authoritative inside any of the five. What this document specifies instead is the contract boundary around that excluded territory - the shape a sibling's template manifest, its MFE manifest, and its runtime registration behavior must present to the rest of the family and to the runtime, never the sibling's own implementation of that shape. §2.1 states this boundary as an explicit design principle, and every component in §3.2 applies it by separating its own contract surface from its own shell-internal realization.

Three existing mechanisms carry the weight of this design, and this document adds no fourth: the runtime's screen extension domain and its existing admission and cardinality rules (`cpt-frontx-adr-extension-domain-occupancy`, `cpt-frontx-adr-domain-extension-compatibility`), already exercised today by the screen extensions `template-mfe`'s own MFE packages declare; the derived screen-extension schema that carries a screen's `presentation` metadata and is validated by `@gears-frontx/gts-plugin` before that extension is admitted, which this family extends with one static field rather than adding a channel; and the CLI's generic template mechanism (`cpt-frontx-adr-uniform-template-mechanism`, `cpt-frontx-adr-source-spec-syntax` as amended for a co-authored, independently-releasing family), which resolves, applies, and versions each of the five siblings uniformly, branching on none of them by kind.

### 1.2 Architecture Drivers

#### Functional Drivers

The requirements this document responds to are owned by its own [PRD](./PRD.md).

| Requirement | Design Response |
|-------------|------------------|
| `cpt-frontx-workspace-templates-fr-independent-sibling-release` | Each of the five siblings is its own template-territory directory with its own template manifest and source-spec ref; the CLI's existing uniform template mechanism resolves and applies each independently, branching on none of them by kind (§1.1, §3.2). |
| `cpt-frontx-workspace-templates-fr-registry-parity` | Each family directory carries its own `frontx-template.json` from the commit that creates, renames, or relocates it, so template discovery finds it by manifest presence and no guard in this repository is taught its name (§2.3, O1). |
| `cpt-frontx-workspace-templates-fr-screen-domain-registration` | Every screen sibling registers one extension entry against the existing screen extension domain identifier, following the shape `demo-mfe`'s own screen extensions already use (§3.2, Screen Registration; §4, Worked Example). |
| `cpt-frontx-workspace-templates-fr-hash-routing` | The shell resolves each registered extension's own declared `presentation.route` against the requested URL, never against a closed union of known screen identifiers; the prefix-free obligation (§2.3, O3) and the shell's own realization are stated at two separate altitudes (§3.2, Deep-Link Route Resolution; §3.6). |
| `cpt-frontx-workspace-templates-fr-i18n-namespace-registration` | A static, per-locale menu-label map declared on each screen's own extension entry under `presentation`, validated by GTS before admission and read by the shell exactly as it reads `presentation.label`, `.icon`, `.route` and `.order` today; no sibling code runs to produce a label, so every applied sibling is labeled from cold load (§3.2, Menu Label Dictionary; §3.3). |
| `cpt-frontx-workspace-templates-fr-internal-copy-i18n` | A screen's own internal UI copy resolves from a bundle-local namespace driven only by the existing `language` shared property, following the working precedent already exercised in `_blank-mfe` (§3.2, Menu Label Dictionary). |

#### NFR Allocation

| NFR ID | NFR Summary | Allocated To | Design Response | Verification Approach |
|--------|-------------|--------------|------------------|------------------------|
| `cpt-frontx-workspace-templates-nfr-no-kind-taxonomy` | No template-manifest field classifies a template by kind | Every one of the five siblings' own template manifests | The order-band, route-prefix, and screen/shell distinction are stated entirely in this document's own prose and in each template's own description; no new template-manifest field is proposed anywhere in this design (§1.1, §4, Worked Example). | Manual review of each of the five template manifests at authoring time; no new field in the template manifest contract's own schema. |
| `cpt-frontx-workspace-templates-nfr-territory-exclusion` | All five directories' own payload stays outside the ecosystem repository's traceability scan | Every one of the five family directories | The family's payload lives in this repository, outside the ecosystem artifact tree by construction, and no `@cpt-` marker is authored inside any of the five (§1.1). | Review at authoring time: no `@cpt-` marker inside any family directory's payload. |

#### Architecture Decision Records

This document records no decision of its own. Every mechanism it specifies is a family-scoped usage of a decision already recorded elsewhere:

* `cpt-frontx-adr-source-spec-syntax` - as amended, fixes that a co-authored template family publishes per-sibling refs; this design's independent-release requirement follows directly from that amendment.
* `cpt-frontx-adr-template-manifest-contract` - as amended, records that no manifest field declares a sibling requirement; this design's order-band and route-prefix conventions are consequences of that absence, carried as documented obligations rather than manifest-declared ones (§2.3).
* `cpt-frontx-adr-template-territory-traceability` - as amended, fixes that template territory is unspecified by the ecosystem artifact tree, that a `@cpt-` marker found in template payload binds nothing wherever it lives, and that whether the repository publishing the templates authors an artifact tree of its own is that repository's own decision; this document is that decision exercised for one family (§1.1).
* `cpt-frontx-adr-extension-domain-occupancy`, `cpt-frontx-adr-domain-extension-compatibility` - own the screen extension domain's admission rules and cardinality matrix this family reuses without modification.
* `cpt-frontx-adr-action-dispatch-and-chaining` - owns the actions-chains mediator the shell's existing chrome actions (`set_theme`, `set_menu_collapsed`) ride. This family adds no action to it: the menu label it needs is a static field, not a dispatch.
* `cpt-frontx-adr-contract-schema-ownership` - fixes that a contract's role belongs to DESIGN, its rationale to an ADR, and its field-level schema to the owning FEATURE. That division governs the ecosystem's own contracts; the menu-label field this design adds sits in a schema published from this repository's own template territory, so its shape is stated here (§3.3) and its authoritative JSON Schema text lands in the shell sibling's own `gts/` tree.

### 1.3 Architecture Layers

```mermaid
graph TD
    subgraph Family[Workspace Template Family - templates layer]
        Shell["template-workspace (shell)"]
        Contacts["template-workspace-contacts"]
        Dashboard["template-workspace-dashboard"]
        Chat["template-workspace-chat"]
        Mail["template-workspace-mail"]
    end
    subgraph Libs[Published libraries layer]
        MFES["@gears-frontx/mfes"]
        GTS["@gears-frontx/gts-plugin"]
        API["@gears-frontx/api"]
        UIKIT["@gears-frontx/ui-kit"]
    end
    Contacts -- "registers extension entry against" --> MFES
    Dashboard -- "registers extension entry against" --> MFES
    Chat -- "registers extension entry against" --> MFES
    Mail -- "registers extension entry against" --> MFES
    Shell -- "hosts screen extension domain via" --> MFES
    MFES -- "validates every entry against" --> GTS
    Contacts -. "own thin glue against" .-> API
    Dashboard -. "own thin glue against" .-> API
    Chat -. "own thin glue against" .-> API
    Mail -. "own thin glue against" .-> API
    Shell -. "own thin glue against" .-> API
```

| Layer | Responsibility | Technology |
|-------|-----------------|------------|
| Workspace Template Family (templates layer) | Five independently-versioned template-territory directories composing into one application; internal contents unspecified by the ecosystem artifact tree. | Template-territory directories, each carrying its own `frontx-template.json`; resolved by the CLI's generic source-spec mechanism. |
| Screen extension domain (published libraries layer, reused) | Admits each screen sibling's extension entry and exposes the admitted set, with its `presentation` metadata, to the shell's own menu. | `@gears-frontx/mfes`, unmodified by this design. |
| Type validation (published libraries layer, reused) | Validates every extension entry and shared property the family's manifests declare, including each screen's own `presentation` block and the per-locale label map inside it. | `@gears-frontx/gts-plugin`, unmodified by this design. |

## 2. Principles & Constraints

### 2.1 Design Principles

#### Two altitudes: ecosystem-visible contract surface vs. shell-internal realization

- [ ] `p1` - **ID**: `cpt-frontx-workspace-templates-principle-contract-vs-realization`

Everything this design specifies sits at exactly one of two altitudes, and every numbered obligation in this document classifies unambiguously into one of them.

The **contract surface** is what a sibling built independently of the other four must be able to rely on without reading another sibling's source: extension entries, `presentation` fields (`route`, `order`, `icon`, `label`, `labels`), and the shared properties every entry requires. All of it is static, GTS-visible, and validated by `@gears-frontx/gts-plugin` before an extension is admitted - none of it requires a sibling's code to have run. This is legitimately specified here because `cpt-frontx-adr-template-territory-traceability` (More Information) leaves an artifact tree over the templates to the repository that publishes them, which is this repository; this document does not ask the ecosystem repository to recognize such a contract generically, it states one family's own scoped usage, and carries the question of whether that generalization should ever happen as an explicit open question rather than deciding it here (PRD §11).

The **shell-internal realization** is how the shell turns that contract surface into working behavior inside its own template-territory code - URL-string parsing, in-memory registration storage, DOM and state management - which this document leaves unspecified, as template payload it deliberately does not constrain (`cpt-frontx-adr-template-territory-traceability`), and is never stated here as a numbered obligation. Where this document illustrates a realization choice, it is marked explicitly as illustrative expectation, not a requirement a Shell Template Developer must satisfy to comply with this design.

#### Reuse the existing screen extension domain

- [ ] `p2` - **ID**: `cpt-frontx-workspace-templates-principle-reuse-existing-domain`

The family declares no extension domain of its own. Every screen sibling registers against the runtime's existing screen extension domain, the same one `demo-mfe`'s own screen extensions already target, so the family adds no new admission surface the runtime must learn.

#### Convention over enforcement where no manifest field exists

- [ ] `p2` - **ID**: `cpt-frontx-workspace-templates-principle-convention-over-enforcement`

Where the manifest contract carries no field for a cross-sibling invariant - order-band uniqueness, route-prefix uniqueness - this design states the invariant as a documented, review-enforced convention rather than inventing a manifest field to enforce it mechanically. Adding an enforcement field the manifest contract does not otherwise need would widen the manifest's own surface for a single family's benefit, which the manifest-contract decision's own reasoning already declines to do generally.

### 2.2 Constraints

#### WORKSPACE-1 - No new extension domain

- [ ] `p2` - **ID**: `cpt-frontx-constraint-workspace-templates-no-new-domain`

No screen sibling's own MFE manifest declares an extension domain other than the runtime's existing screen extension domain (`gts.frontx.mfes.ext.domain.v1~frontx.screensets.layout.screen.v1`).

**ADRs**: `cpt-frontx-adr-extension-domain-occupancy` - cited for the domain-governance context this constraint operates inside; that record does not own this constraint, which this design defines and owns directly for this family.

#### WORKSPACE-2 - No manifest-readable template-kind field

- [ ] `p2` - **ID**: `cpt-frontx-constraint-workspace-templates-no-kind-field`

No template manifest belonging to any of the five family directories carries a field whose value classifies that template as a shell or a screen, or by any other kind. The distinction is prose-only, in each template's own description.

**ADRs**: `cpt-frontx-adr-template-manifest-contract` - cited for the manifest contract this constraint operates inside; the rule against a template-kind taxonomy is an ecosystem-wide convention this design does not originate and must not violate for this family.

### 2.3 Obligations On The Consuming Level

This design specifies the contract, not an enforcement mechanism for every part of it: some of what the family depends on is a fact this design states and a runtime or guard checks mechanically, and some is an obligation on whichever human role - Shell Template Developer or Screen Template Developer - authors the sibling that must honor it, because no manifest field or runtime check exists to hold it at rest. They are collected here as one normative list.

- **O1 - Manifest presence on every family-directory change.** Whoever creates, renames, or relocates any of the five family directories **MUST** leave that directory carrying its own `frontx-template.json` at its root in the same commit (`cpt-frontx-workspace-templates-fr-registry-parity`), because manifest presence is the only rule this repository's template discovery follows (`scripts/template-discovery.mjs`) and is the whole of what makes the directory a template. This is a review-time obligation; a directory that arrives without its manifest is silently not a template rather than a guard failure.
- **O2 - Order-band uniqueness across independently-versioned siblings.** A Screen Template Developer **MUST** keep their own sibling's `presentation.order` value inside the inclusive band the family's own convention reserves for it - contacts 100-199, dashboard 200-299, chat 300-399, mail 400-499, with the 500-599 band left for a future fifth screen (§4, Worked Example) - and **MUST NOT** assume the runtime arbitrates a collision: `presentation.order` is a flat number across the whole domain, and nothing in the runtime's own admission or cardinality checks compares one sibling's declared order against another's. Where a sibling ever declares more than one extension entry inside its own band, the entries' relative order is fixed by their own ascending declared values; no declared value may fall outside the sibling's own reserved band regardless of how many entries the sibling registers.
- **O3 - Prefix-free route set across independently-versioned siblings.** A Screen Template Developer **MUST** declare their own sibling's `presentation.route` so that no other applied sibling's own declared route is a proper prefix of it, and so that it is not itself a proper prefix of any other applied sibling's own declared route - `/mail` and `/mailbox` applied together would violate this, because a URL under `/mailbox` also matches `/mail` as a prefix, and the resolution component's own contract (§3.2, Deep-Link Route Resolution) states no tie-breaking rule for that case. This is a documented obligation on the authoring Screen Template Developer, for the same reason as O2: nothing in the runtime checks two siblings' declared routes against each other before both are applied to the same project.
- **O4 - Static menu-label map on every screen extension entry.** A Screen Template Developer **MUST** declare their own sibling's menu-chrome label statically, inside that sibling's own extension entry, as `presentation.label` plus a `presentation.labels` map keyed by language code (§3.3), and **MUST NOT** rely on any dispatch, callback, or other code path of the sibling's own to deliver it. The shell **MUST** resolve every admitted sibling's label from that static declaration alone, so a sibling that has never been mounted is labeled exactly as one that has, and a shell-wide language change re-resolves against the same declaration without the sibling being remounted. A sibling that declares no entry for the shell's current language falls back to its own `presentation.label`, which the schema requires and every sibling therefore carries (§3.2).
- **O5 - No cross-sibling build-time import.** No sibling's own code **MUST** import another sibling's or the shell's own application code at build time. Two siblings that share data - contacts records read by both contacts and dashboard, for instance - reach it through the shell's own REST surface at runtime, never through a shared module graph, because each sibling is bundled and versioned independently and no build-time import can cross that boundary safely.

## 3. Technical Architecture

### 3.1 Domain Model

| Entity | Definition | Representation |
|--------|------------|-----------------|
| Family | The five co-authored, independently-versioned template-territory directories this design specifies the contract for. | Structural concept; not a package or a template-manifest-declared entity. |
| Sibling | Any one of the family's five templates, named by its position in the family (shell or screen) in prose only. | Template-territory directory, each carrying its own `frontx-template.json` (template manifest). |
| Shell | The family's sole non-screen sibling: `template-workspace`. Hosts the screen extension domain, the icon-rail menu, the shared i18n core, and the route resolver. | Template-territory directory. |
| Screen | Any of the family's four occupant siblings: `template-workspace-contacts`, `-dashboard`, `-chat`, `-mail`. Registers exactly one extension entry against the shell's screen extension domain. | Template-territory directory; one `mfe.json`-shaped MFE manifest per sibling, following the `demo-mfe` package shape. |
| Order band | The inclusive, 100-wide range of `presentation.order` values this design reserves per screen sibling, so independently-versioned siblings avoid an exact-value collision without coordinating on one. | Documented convention (§2.3, O2), not an MFE-manifest-declared or runtime-enforced value. |
| Menu-label dictionary | The per-language display strings for a screen sibling's own menu-chrome label, declared statically inside that sibling's own extension entry and read by the shell from the admitted extension set without the sibling's code running. | `presentation.labels`, a new optional field on the derived screen-extension schema this family's shell publishes, beside the `presentation.label` that schema already requires (§3.3). |

### 3.2 Component Model

#### Screen Registration

- [ ] `p2` - **ID**: `cpt-frontx-component-workspace-templates-screen-registration`

##### Why this component exists

Every screen sibling needs a single, uniform way to become an occupant of the shell's own menu and routing surface, without the shell knowing about any specific sibling in advance. This is the family's own concrete application of the runtime's existing extension-registration mechanism, not a new mechanism.

##### Responsibility scope

This component is entirely contract surface (§2.1, `cpt-frontx-workspace-templates-principle-contract-vs-realization`): everything it specifies is a GTS-visible field a sibling built independently of the other four can rely on, with no shell-internal realization of its own.

- Each screen sibling's own MFE manifest declares exactly one extension entry against the runtime's existing screen extension domain identifier.
- Each entry carries a `presentation.route`, a `presentation.order` inside that sibling's own reserved band, an icon, and a menu-label i18n key resolved against that sibling's own namespace (§4, Worked Example).

##### Responsibility boundaries

- Does not declare a new extension domain, and does not add a field to the template manifest contract's own schema.
- Does not enforce order-band or route-prefix uniqueness against a sibling built independently; that is a documented obligation on the authoring Screen Template Developer (§2.3, O2, O3), not a mechanism this component implements.

##### Related components (by ID)

- `cpt-frontx-component-workspace-templates-hash-routing` - consumes the same registered extension set's own declared routes.

#### Deep-Link Route Resolution

- [ ] `p2` - **ID**: `cpt-frontx-component-workspace-templates-hash-routing`

##### Why this component exists

`presentation.route` is schema-required on every extension entry today but has had no real consumer in this ecosystem; the shell is the first template to read and act on it, resolving a URL to whichever sibling is currently registered rather than to a fixed, closed set the shell was built knowing about.

##### Contract surface (ecosystem-visible)

- Every screen sibling's own extension entry declares `presentation.route`, a URL path segment naming that sibling; this field, its GTS schema, and its use as the routing key are the ecosystem-visible contract any shell resolving this family's extension set can rely on.
- The registered route set **MUST** be prefix-free: no two applied siblings may declare a route where one is a proper prefix of the other (§2.3, O3) - the resolution component itself states no tie-breaking rule for that case, so a violation is a defect in the applied set, not a case this component resolves.
- A sibling applied to a project after the shell was built **MUST** be reachable by its own declared route without a shell rebuild: resolution reads the currently-registered set, never a set fixed at the shell's own build time.

##### Shell-internal realization (template territory, illustrative)

How the shell turns a browser URL into a matched route - hash-fragment parsing, `pushState`, or any other client-side routing technique - is the shell's own template-territory implementation, unspecified by this document (`cpt-frontx-adr-template-territory-traceability`). The split plan's own leaning, carried here only as illustrative expectation rather than a numbered obligation, is a hash-based parser reading the URL fragment and matching it against the registered route set. Whether the shell builds this on `@gears-frontx/routing`'s own machinery or hand-rolls it is likewise unspecified: the screen extension domain this family reuses is a single-occupant domain (one screen mounted at a time), so this design does not require, and does not preclude, that package's own compound-key, concurrent-occupancy addressing.

##### Related components (by ID)

- `cpt-frontx-component-workspace-templates-screen-registration` - supplies the registered extension set this component resolves against.

#### Menu Label Dictionary

- [ ] `p2` - **ID**: `cpt-frontx-component-workspace-templates-i18n-registration`

##### Why this component exists

The shell cannot read a translation key out of a bundle it does not import, and it cannot wait for a bundle it has not loaded either: the menu is built from the admitted extension set, and admission loads no remote, so an unrouted sibling's code has never run by the time its menu entry must render. Anything a sibling would have to execute to produce its own label therefore cannot label it from cold load. The label has to be static data the sibling declares and the shell reads, in the same pass it already reads `presentation.icon`, `.route` and `.order`.

##### Contract surface (ecosystem-visible)

- Each screen sibling declares its own menu-chrome label inside its own extension entry, under the `presentation` object the screen extension domain's derived schema already requires: `presentation.label`, the string that schema requires today, plus `presentation.labels`, a map from language code to display string (§3.3).
- The shell resolves an admitted sibling's label from that declaration alone. No sibling code runs, no action is dispatched, and nothing about the resolution depends on which sibling's screen content is currently routed - the domain admits every currently-applied sibling's extension at once (§3.6), so every applied sibling is labeled from cold load, including siblings that are never mounted.
- The fallback has exactly two steps, and both read fields the contract declares: the shell takes `presentation.labels[<the shell's currently-selected language>]`, and where that key is absent it takes `presentation.label`. `presentation.label` is schema-required, so every sibling carries it and the chain always terminates in a rendered string. There is no third step and no reference to a per-sibling default-locale field, because the contract declares none.
- Because the map carries every language the sibling supports up front, a shell-wide language change re-resolves against the same declaration, with no remount and no second read of anything the sibling owns.
- A screen sibling's own internal UI copy - everything the sibling itself renders inside its own zone - is a separate matter and stays with the sibling's code: it resolves from a namespace local to that sibling's own bundle, driven only by the existing `language` shared property, following the working `import.meta.glob('./i18n/*.json')` precedent already exercised in `_blank-mfe`. Only the chrome label is static.

##### Shell-internal realization (template territory, illustrative)

How the shell reads the current language and indexes the map - a selector over the `language` shared property, a memo, or a plain lookup at render - is the shell's own template-territory implementation, unspecified by this document.

##### Responsibility boundaries

- Does not give the shell any way to reach a sibling's own internal dictionary, and does not try to: a sibling's internal copy stays inside that sibling's bundle, unaffected by everything above.
- Does not prop-drill a translation function across the Module Federation boundary as a substitute: a function value has to be produced by running the sibling's code, which is exactly what an unrouted sibling has not done.
- Does not make the label a translation key the shell resolves against a shared dictionary: a key the shell cannot resolve is worse than a string it can render, and a shared dictionary would be one more thing five independently-versioned siblings must agree on.

##### Related components (by ID)

- `cpt-frontx-component-workspace-templates-screen-registration` - declares the extension entry this component's `presentation` fields sit inside.

### 3.3 API Contracts

#### Menu-label declaration on the screen extension entry

- [ ] `p2` - **ID**: `cpt-frontx-interface-workspace-templates-i18n-namespace-action`

- **Contract**: Two fields under the `presentation` object of every screen sibling's own extension entry. `presentation.label` is the string the derived screen-extension schema already requires and is the sibling's own fallback display string. `presentation.labels` is a new optional object whose property names are language codes, as the `language` shared property carries them, and whose values are plain display strings. The shell renders `presentation.labels[<currently-selected language>]` where that property exists and `presentation.label` otherwise (§3.2). Both fields are static manifest data, present before any of the sibling's code loads.

```json
"presentation": {
  "label": "Contacts",
  "labels": { "en": "Contacts", "de": "Kontakte", "fr": "Contacts" },
  "icon": "lucide:users",
  "route": "/contacts",
  "order": 100
}
```

- **Technology**: Validated by `@gears-frontx/gts-plugin` as part of the derived screen-extension schema, on the same path that already validates `label`, `icon`, `route` and `order`: an extension that declares a malformed `labels` map is refused at registration rather than rendering a broken menu entry. `labels` is an object with string values and no required property, so a sibling that declares none stays valid and falls back to `label`.
- **Owner**: The derived screen-extension schema `gts://gts.frontx.mfes.ext.extension.v1~frontx.screensets.layout.screen.v1~`, whose file in this repository today is `template-shell/src/gts/schemas/extension_screen.v1.json`. That schema is template territory published from this repository, not an ecosystem schema: the ecosystem's own `ext/extension.v1.json` (`@gears-frontx/gts-plugin`) requires only `id`, `domain` and `entry` and is not touched by this family. The shell sibling, `template-workspace`, publishes its own copy of the derived schema carrying `labels`, as part of its own contract surface, before any of the four screen siblings' first split release ships - a screen sibling cannot declare a field the schema validating it does not know.

| Public surface | Purpose |
|-----------------|---------|
| `presentation.label` | Required. The sibling's own fallback display string, rendered whenever the shell's current language has no entry in `labels`. Already required by the derived screen-extension schema and already carried by every screen extension in this repository. |
| `presentation.labels` | Optional. Language code to display string, covering every language the sibling supports, so a shell-wide language change re-resolves without the sibling being loaded or remounted (§3.2). |

### 3.4 Internal Dependencies

This document owns no package and no source of its own; the family's five siblings are template-territory directories, not packages this dependency-edge model governs. The dependency this design does specify is behavioral, not a package edge:

- Every screen sibling depends on the shell having already mounted the screen extension domain the sibling registers against; a screen sibling applied without the shell present has nothing to register against, which the runtime's own admission path already handles as an ordinary unmatched-domain case.
- No sibling depends on another sibling's own build output. A cross-sibling data need (dashboard reading contacts, for instance) is a runtime dependency on the shell's own REST surface, never a compile-time package or module dependency between two siblings.

### 3.5 External Dependencies

None owned here beyond what the runtime, the type-system provider, and the CLI's own template mechanism already declare externally. Each sibling's own third-party dependency list (the API client library, the icon set, the chart library dashboard alone needs) is template payload, unspecified by this document and carried at file-level detail by the domain-model mapping this design is generated from.

### 3.6 Interactions & Sequences

#### A screen sibling applied after the shell mounts and resolves a deep link

- [ ] `p2` - **ID**: `cpt-frontx-workspace-templates-seq-deep-link-screen-sibling`

**Use cases**: `cpt-frontx-workspace-templates-usecase-deep-link-to-screen-sibling`

**Actors**: `cpt-frontx-workspace-templates-actor-shell-developer`, `cpt-frontx-workspace-templates-actor-screen-developer`

```mermaid
sequenceDiagram
    participant Browser
    participant Shell as Shell (template-workspace)
    participant Domain as Screen extension domain (mfes)
    participant Screen as Routed screen sibling (e.g. contacts)
    Browser->>Shell: cold load / reload at a screen's own declared route
    Shell->>Domain: mount screen extension domain
    Domain->>Domain: admit every currently-applied screen sibling's own extension entry
    Domain-->>Shell: registered extension set (routes, order, icons, labels)
    Shell->>Shell: build icon-rail menu from registered set, each entry labeled from its own presentation.labels / .label
    Shell->>Shell: resolve URL's route segment against registered routes
    Shell->>Screen: mount only the matching sibling's own screen content
    Shell-->>Browser: sibling rendered, every menu entry already labeled
```

**Description**: The primary flow this design specifies. No step here is new runtime mechanism: domain admission, menu construction, and route resolution are the shell's own concrete use of capability the runtime already provides generically, and the family adds no action and no channel of its own. A screen sibling applied to the project after the shell's own release still resolves correctly, because the shell's menu and routing are both built from whatever is currently registered, never from a set fixed at the shell's own build time. Note what the diagram does not contain: no sibling sends the shell anything. Every label the menu renders came in with the admitted extension set as static `presentation` data, so a sibling whose remote has not been loaded - which, on this flow, is every sibling but the routed one - is labeled exactly like the one that has (§3.2, Menu Label Dictionary; §2.3, O4).

### 3.7 Database schemas & tables

Not applicable. This design owns no database and no durable persistence; the family's own runtime data (contacts, conversations, dashboard metrics) is owned by whichever sibling's own REST surface serves it, unspecified template payload this document does not carry.

## 4. Additional context

### Worked Example: The Family's GTS Surface

Requested as a concrete check for `cpt-frontx-workspace-templates-fr-screen-domain-registration` and the order-band and route-prefix obligations of §2.3: the shape one screen sibling's own MFE manifest takes, following the working pattern `demo-mfe`'s own MFE manifest already uses in this repository today (`template-mfe/src-app/mfe_packages/demo-mfe/mfe.json`).

```json
{
  "manifest": { "id": "...", "remoteEntry": "http://localhost:<port>/assets/remoteEntry.js" },
  "entries": [
    {
      "id": "gts.frontx.mfes.mfe.entry.v1~...~frontx.workspace.mfe.contacts.v1",
      "requiredProperties": [
        "gts.frontx.mfes.comm.shared_property.v1~frontx.mfes.comm.theme.v1~",
        "gts.frontx.mfes.comm.shared_property.v1~frontx.mfes.comm.language.v1~"
      ],
      "actions": [],
      "domainActions": [],
      "manifest": "...",
      "exposedModule": "./lifecycle-contacts"
    }
  ],
  "extensions": [
    {
      "id": "gts.frontx.mfes.ext.extension.v1~frontx.screensets.layout.screen.v1~frontx.workspace.screens.contacts.v1",
      "domain": "gts.frontx.mfes.ext.domain.v1~frontx.screensets.layout.screen.v1",
      "entry": "gts.frontx.mfes.mfe.entry.v1~...~frontx.workspace.mfe.contacts.v1",
      "presentation": {
        "label": "Contacts",
        "labels": { "en": "Contacts", "de": "Kontakte", "fr": "Contacts" },
        "icon": "lucide:users",
        "route": "/contacts",
        "order": 100
      }
    }
  ]
}
```

One field in this shape is new: `presentation.labels` (§3.3). `entries[].actions` is empty and stays empty - this family declares no action of its own. Every other field is unchanged: `domain` is the existing screen extension domain identifier; `requiredProperties` names the same two shared properties (`theme`, `language`) every screen entry in this repository already declares; `presentation.label`, `.icon`, `.route`, `.order` are the same four fields the screen extensions already in this repository carry. Beyond the one field, what is new is convention layered on top, stated as obligations rather than schema (§2.3):

| Sibling | Reserved order band | Declared route prefix |
|---|---|---|
| contacts | 100-199 | `/contacts` |
| dashboard | 200-299 | `/dashboard` |
| chat | 300-399 | `/chat` |
| mail | 400-499 | `/mail` |
| *(reserved for a future fifth screen)* | 500-599 | *(none yet)* |

`presentation.label` is a display string, not an i18n key: the shell renders it as it stands, exactly as it does today. `presentation.labels` beside it carries the same string per language, so the menu localizes without the shell importing the sibling's own translations and without the sibling's code having run (§3.2, Menu Label Dictionary). The Iconify-string convention (`icon: "lucide:users"`) is the shell's own existing consumption contract for menu icons; it diverges deliberately from how each sibling renders its own internal icons (`lucide-react` components imported directly inside that sibling's own zone) - the menu icon and a sibling's internal icons are two different, coexisting conventions, not an inconsistency this design resolves.

**What this worked example does not show**: how a screen sibling declares a runtime dependency on a shell-provided endpoint (contacts needs `/api/workspace/contacts` to exist, for instance). No field in the shape above carries that declaration, and no schema read for the domain-model mapping this design is generated from carries one either. This stays Open Question 2 (PRD §11); today an incompatible pairing surfaces as a runtime 404 rather than a refused mount, and this design does not add a field to close that gap.

**Recorded risks this design does not resolve**, carried forward from the domain-model mapping's own risk framing rather than restated in full (PRD §12 states these as family-scoped risks; the mechanisms themselves are the mapping's own):

- Kit CSS reaching a Shadow DOM root is de-risked, with working evidence already in the tree; whether **component** CSS (as opposed to token CSS) reaches a shadow root through an actual Module-Federation build has not been traced and is the one genuinely open technical question in that story, to be closed before the first screen sibling (contacts) is split.
- The obligation of §2.3, O1 has a real precedent of failing once already: while the templates still lived in the ecosystem repository, `template-inbox` was missing from that repository's enumerated artifact-registry exclusion list for a period despite carrying a manifest - the per-directory authoring step it needed was simply missed.
- If the shell's MF-host build layer depends on `template-shell`'s own published build export (Open Question 1's leaning for the first iteration), that dependency sits outside the pin-drift guard's own comparison scope, which compares every discovered template's ecosystem-package pins against the packages published from the ecosystem repository only.

## 5. Traceability

- **Features**: No FEATURE currently exists for this family. DECOMPOSITION and FEATURE authoring are explicitly deferred by team decision of 2026-09-02 until this PRD and DESIGN reach a settled state, with the maintainer's acceptance of both as the resumption trigger (PRD §4.2 states the decision and its trigger; the ecosystem root DESIGN's own member artifact chain rule, `cpt-frontx-constraint-member-artifact-chain`, does not apply here because it governs that repository's own layer members, and this family is not one).
- **Requirements**: [PRD](./PRD.md) - this family's own requirements, owned here.
- **Domain-model mapping**: [2026-09-02-workspace-template-domain-mapping.md](../explorations/2026-09-02-workspace-template-domain-mapping.md) - file-level detail for the split, referenced rather than duplicated throughout this document.
- **Ecosystem chain** (References): the ecosystem's root PRD and DESIGN describe the FrontX layers and the requirements binding every layer member equally; the CLI's own PRD and DESIGN own the generic template mechanism every one of the five siblings resolves through; the runtime's own PRD and DESIGN own the screen extension domain and the actions-chains channel this family reuses without modification.

This document's requirements are owned by its own [PRD](./PRD.md), per the same federated-ownership shape the FrontX layer model uses for a package member: each artifact set explains its own requirements, and the ecosystem's root PRD and DESIGN describe the layers and the requirements binding every member equally (that DESIGN's §1.3, Architecture Layers).
