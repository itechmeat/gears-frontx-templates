# PRD - Workspace Template Family

<!-- toc -->

- [1. Overview](#1-overview)
  - [1.1 Purpose](#11-purpose)
  - [1.2 Background / Problem Statement](#12-background--problem-statement)
  - [1.3 Goals (Business Outcomes)](#13-goals-business-outcomes)
  - [1.4 Glossary](#14-glossary)
- [2. Actors](#2-actors)
  - [2.1 Human Actors](#21-human-actors)
  - [2.2 System Actors](#22-system-actors)
- [3. Operational Concept & Environment](#3-operational-concept--environment)
  - [3.1 Module-Specific Environment Constraints](#31-module-specific-environment-constraints)
- [4. Scope](#4-scope)
  - [4.1 In Scope](#41-in-scope)
  - [4.2 Out of Scope](#42-out-of-scope)
- [5. Functional Requirements](#5-functional-requirements)
  - [5.1 Family Composition and Independent Release](#51-family-composition-and-independent-release)
  - [5.2 Shell-Screen Integration Contract](#52-shell-screen-integration-contract)
  - [5.3 Menu Labeling and Screen-Local Copy](#53-menu-labeling-and-screen-local-copy)
- [6. Non-Functional Requirements](#6-non-functional-requirements)
  - [6.1 NFR Inclusions](#61-nfr-inclusions)
  - [6.2 NFR Exclusions](#62-nfr-exclusions)
- [7. Public Library Interfaces](#7-public-library-interfaces)
  - [7.1 Public API Surface](#71-public-api-surface)
  - [7.2 External Integration Contracts](#72-external-integration-contracts)
- [8. Use Cases](#8-use-cases)
- [9. Acceptance Criteria](#9-acceptance-criteria)
- [10. Dependencies](#10-dependencies)
- [11. Assumptions](#11-assumptions)
- [12. Risks](#12-risks)

<!-- /toc -->

**References to the FrontX ecosystem.** This document names the ecosystem decisions and artifacts it depends on by their `cpt-` id. None of them lives in this repository; they live in the FrontX ecosystem repository, [`gears-frontx`](https://github.com/constructorfabric/gears-frontx), at these paths on its `develop` branch:

| Named here as | File in the ecosystem repository |
|---|---|
| `cpt-frontx-adr-source-spec-syntax` | [architecture/ADR/0017-source-spec-syntax.md](https://github.com/constructorfabric/gears-frontx/blob/develop/architecture/ADR/0017-source-spec-syntax.md) |
| `cpt-frontx-adr-template-manifest-contract` | [architecture/ADR/0018-template-manifest-contract.md](https://github.com/constructorfabric/gears-frontx/blob/develop/architecture/ADR/0018-template-manifest-contract.md) |
| `cpt-frontx-adr-contract-schema-ownership` | [architecture/ADR/0027-contract-schema-ownership.md](https://github.com/constructorfabric/gears-frontx/blob/develop/architecture/ADR/0027-contract-schema-ownership.md) |
| `cpt-frontx-adr-template-territory-traceability` | [architecture/ADR/0033-template-territory-traceability.md](https://github.com/constructorfabric/gears-frontx/blob/develop/architecture/ADR/0033-template-territory-traceability.md) |
| the ecosystem's root PRD and DESIGN | [architecture/PRD.md](https://github.com/constructorfabric/gears-frontx/blob/develop/architecture/PRD.md), [architecture/DESIGN.md](https://github.com/constructorfabric/gears-frontx/blob/develop/architecture/DESIGN.md) |
| the CLI's own PRD | [packages/cli/architecture/PRD.md](https://github.com/constructorfabric/gears-frontx/blob/develop/packages/cli/architecture/PRD.md) |
| the runtime's own PRD | [packages/mfes/architecture/PRD.md](https://github.com/constructorfabric/gears-frontx/blob/develop/packages/mfes/architecture/PRD.md) |

## 1. Overview

### 1.1 Purpose

The Workspace Template Family is a co-authored, independently-versioned group of five top-level templates - `template-workspace`, the shell, plus `template-workspace-contacts`, `template-workspace-dashboard`, `template-workspace-chat`, and `template-workspace-mail`, each a screen sibling - that together produce one composed application: a shell hosting up to four screens, mounted through the ecosystem's existing screen extension domain. Each of the five is its own template-territory directory, carrying its own template manifest, its own version line, and its own release cadence (`cpt-frontx-adr-source-spec-syntax`, as amended for a co-authored family that releases its siblings apart). What one template directory contains internally is not this PRD's subject: template payload sits outside the ecosystem artifact universe (`cpt-frontx-adr-template-territory-traceability`), and the file-level shape of the split is carried by the domain-model mapping this PRD is generated from, not restated here ([mapping](../explorations/2026-09-02-workspace-template-domain-mapping.md)).

This PRD owns what none of the five template directories could carry inside itself and what no ecosystem artifact owns either: the ecosystem-facing contract the split introduces between independently-versioned siblings that must nonetheless compose into one working application - the shell-screen integration surface, the GTS conventions the family's manifests share, the i18n and guard obligations the split adds, and the versioning and release model the family follows. It is this repository's own architecture over one template family it publishes, authored here because `cpt-frontx-adr-template-territory-traceability` leaves an artifact tree over the templates to the repository that publishes them. Ecosystem-level requirements binding every FrontX layer equally are owned by the ecosystem repository's root PRD; the CLI's own PRD owns the generic template mechanism - source-spec resolution, the template manifest contract, ownership-boundary declaration - that every template, including these five, resolves through; the runtime's own PRD owns extension-domain governance and host-microfrontend communication generically. This PRD owns only what is specific to this one family composing on top of those generic mechanisms.

### 1.2 Background / Problem Statement

Today a single template, `template-inbox`, ships one shell and four screens - contacts, dashboard, chat, mail - as one repository, one version, one release. A Project Developer who wants the shell without chat, or who wants dashboard alone against a different shell, cannot have it: the four screens and their shell version and release together, whether or not a given project uses all four. Splitting the monolith into five independently-versioned templates removes that coupling, but a split only pays off if the five pieces, built and released independently, still compose into one working application when a Project Developer applies the shell and any subset of the screens.

That is the problem this PRD addresses: independently-versioned siblings need an ecosystem-visible contract to agree on, discoverable without reading each other's source, so that a screen template built by one Template Developer against one shell version still mounts correctly, deep-links correctly, and labels its own menu entry correctly when applied alongside three other screens built by other Template Developers on their own schedules. Without that contract stated at ecosystem altitude, each sibling's author would have to read the other four templates' source to discover the shape they must agree on - exactly the kind of open-ended-codebase guessing the ecosystem's root PRD identifies in its own problem statement (§1.2) as what a stable, narrow, explicitly-contracted surface is for.

### 1.3 Goals (Business Outcomes)

- **Independent release per sibling** - A Template Developer publishes a new version of one screen sibling without coordinating a release of the shell or of any other screen sibling. Target: each of the five templates carries its own version line and its own source-spec ref; Timeframe: first split release.
- **Deep-linkable multi-screen navigation** - A URL naming one of the family's screens resolves to that screen through the shell's own hash-based routing, driven by the registered extension set rather than a closed route union. Target: every mounted screen sibling is reachable by a stable URL prefix it declares; Timeframe: first split release.
- **Discoverable menu labels across independently-versioned siblings** - Every applied screen sibling's own menu entry renders in the shell's own chosen language, without the shell importing that sibling's translation bundle at build time and without that sibling's code having run. Target: the shell resolves every applied screen's own menu label from static, GTS-validated data the screen's own extension entry declares, read on the same pass that reads the screen's route, icon and order; Timeframe: first split release.
- **No template-kind taxonomy introduced** - The template manifest contract gains no field distinguishing a shell template from a screen template; the distinction stays prose-only, in each template's own description. Target: zero manifest-readable classification fields added by this split; Timeframe: first split release, held indefinitely.
- **Every family directory is a template by manifest presence alone** - Each of the five family directories carries its own `frontx-template.json`, which is what makes a top-level directory a template in this repository, and no guard here is taught any of the five names. Target: all five directories discovered as templates by `scripts/template-discovery.mjs` with no guard-side change; Timeframe: each directory's own creation commit.

### 1.4 Glossary

This PRD uses the ecosystem's root PRD vocabulary (its §1.4) for *template*, *project*, and *application*, and the runtime's own vocabulary (its PRD §1.4) for *microfrontend*, *extension*, and *extension domain*. The terms below are specific to this family and are prose-only: none names a template-manifest field, and none is a classification a template's own template manifest declares (`cpt-frontx-adr-template-manifest-contract`; rule against introducing a template-kind taxonomy).

| Term | Definition |
|------|------------|
| family | The five templates this PRD describes, co-authored and independently versioned, that compose into one application when applied together. |
| sibling | Any one of the family's five templates, named for its position in the family rather than for a manifest-declared kind. |
| shell | The family's sibling that owns the application shell, the icon rail, theming, i18n core, and the domain-neutral API glue: `template-workspace`. Plays the runtime's Application Developer role (`cpt-frontx-mfes-actor-application-developer`) at the family's own surface. |
| screen | Any one of the family's four siblings that mounts as an occupant of the shell's screen extension domain: `template-workspace-contacts`, `-dashboard`, `-chat`, `-mail`. Plays the runtime's Microfrontend Developer role (`cpt-frontx-mfes-actor-microfrontend-developer`) at the family's own surface. |
| screen extension domain | The existing runtime extension domain every screen sibling's own extension entry targets (`gts.frontx.mfes.ext.domain.v1~frontx.screensets.layout.screen.v1`), the same domain `demo-mfe`'s own screen extensions already target today. Not a new domain this split declares. |
| order band | The convention reserving each screen sibling an inclusive, 100-wide range of `presentation.order` values - contacts 100-199, dashboard 200-299, chat 300-399, mail 400-499 - so independently-versioned siblings do not have to coordinate an exact value to avoid colliding (§5.2). A documented convention, not a runtime-enforced one (§11). |
| template manifest | The `frontx-template.json` file each of the five family directories carries at its own root, governed by the manifest-contract decision (`cpt-frontx-adr-template-manifest-contract`). Carries a template's own identity, ownership boundary, and description; carries no field distinguishing a shell sibling from a screen sibling. |
| MFE manifest | The `mfe.json`-shaped manifest each screen sibling's own microfrontend package carries, following the `demo-mfe` package shape, declaring that package's extension entries, required and optional shared properties, and actions against the runtime's screen extension domain. A different file from, and unrelated in schema to, the template manifest above; the two are disambiguated by these qualified names everywhere in this document and its DESIGN. |

## 2. Actors

### 2.1 Human Actors

#### Shell Template Developer

**ID**: `cpt-frontx-workspace-templates-actor-shell-developer`

**Role**: Authors, versions, and publishes `template-workspace`. Declares the screen extension domain's admission rules the shell already inherits from the runtime, wires the shared i18n core and the two existing chrome-facing conventions the split plan carries forward, and implements deep-link resolution, matching an opened URL to a registered screen. Fills the root PRD's Template Developer role (`cpt-frontx-actor-template-developer`) and the runtime's Application Developer role (`cpt-frontx-mfes-actor-application-developer`) at the family's own surface.
**Needs**: A stable, ecosystem-visible statement of what a screen sibling registers and how, so the shell can be built and released without waiting on any particular screen sibling's own release.

#### Screen Template Developer

**ID**: `cpt-frontx-workspace-templates-actor-screen-developer`

**Role**: Authors, versions, and publishes one of the four screen siblings. Registers one extension entry against the shell's existing screen extension domain, declares the sibling's own `presentation.route` and `presentation.order`, and authors the sibling's own thin API glue against `@gears-frontx/api` rather than importing the shell's. Fills the root PRD's Template Developer role (`cpt-frontx-actor-template-developer`) and the runtime's Microfrontend Developer role (`cpt-frontx-mfes-actor-microfrontend-developer`) at the family's own surface.
**Needs**: A documented order band and route-prefix convention to avoid colliding with a sibling built independently; a documented way to hand the shell a menu label without the shell importing the sibling's translations; no obligation to read another sibling's source to discover either.

### 2.2 System Actors

#### MFE Runtime

**ID**: `cpt-frontx-workspace-templates-actor-mfe-runtime`

**Role**: Admits each screen sibling's extension into the shell's screen extension domain by contract matching, exposes the admitted set and its declared presentation metadata to the shell, and isolates each independently-bundled sibling at load time. Owned entirely by `@gears-frontx/mfes`; this PRD adds no capability to it and no action to its communication channel.

#### GTS Type System

**ID**: `cpt-frontx-workspace-templates-actor-gts-type-system`

**Role**: Validates every extension entry and shared property the family's own MFE manifests declare, including each screen sibling's own presentation block and the per-language menu-label map inside it, before that extension is admitted. Owned entirely by `@gears-frontx/gts-plugin`.

## 3. Operational Concept & Environment

A Project Developer applies the shell and any subset of the four screen siblings to a project, in any order the CLI's own composed-template resolution supports. Each applied screen sibling registers one extension entry against the shell's screen extension domain at the sibling's own declared `presentation.route`, `presentation.order`, and menu icon; the shell resolves the registered set into an icon-rail menu and deep-links to whichever screen an opened URL names, never a closed union of known screen names. Every applied screen sibling declares its own menu label statically, inside its own extension entry, as a per-language map beside the route, icon and order it already declares (§5.3); the shell reads that declaration off the admitted extension set and renders it in its own currently-selected language, without importing any sibling's translations at build time and without loading a sibling whose screen content is not the one currently routed. Two screen siblings that read shell-provided data - contacts records, for instance - do so over the shell's own HTTP surface, never through a build-time import of one another's or the shell's application code, because each sibling is bundled and versioned independently and no import can cross that boundary at runtime.

### 3.1 Module-Specific Environment Constraints

- Requires the runtime's Module Federation composition and its screen extension domain to already be admitting the shell and its screens as it admits `demo-mfe`'s own screen extensions today.
- Requires a browser environment with Shadow DOM support, since every screen sibling's own kit-styled UI renders inside a shadow root the shell's own trust-kernel isolation manages (owned by `@gears-frontx/mfes`, not restated here).
- Carries no environment constraint of its own beyond what the runtime and the CLI's template mechanism already state; this PRD introduces no new runtime dependency and no new communication channel, only one new declared field on an existing manifest surface (§5.3).

## 4. Scope

### 4.1 In Scope

- The family's own composition shape: one shell sibling plus up to four screen siblings, each an independently-versioned, independently-released top-level template directory, resolved and applied through the CLI's existing generic mechanism.
- The shell-screen integration contract: registration of each screen sibling as an occupant of the existing screen extension domain, the order-band and route-prefix conventions that keep independently-versioned siblings from colliding, and the shell's obligation to resolve the registered set into deep-linkable navigation rather than a closed route union (§5.2).
- The static, per-language menu-label declaration this split adds to each screen sibling's own extension entry, so a screen sibling's menu label renders without a build-time import and without that sibling's code having run (§5.3).
- The manifest obligation the split's five simultaneous directory additions place on this repository's template discovery: each directory carries its own `frontx-template.json` from the commit that creates it, which is the whole of what makes it a template here, restated as a family-scoped acceptance criterion (§9).
- The family's versioning and release model: per-sibling independent version lines and source-spec refs, already fixed by `cpt-frontx-adr-source-spec-syntax` as amended, restated here as the model this family follows.

### 4.2 Out of Scope

- Any sibling's own internal file contents, directory layout, dataset, or styling: template payload sits outside the ecosystem artifact universe (`cpt-frontx-adr-template-territory-traceability`) and is carried at file-level detail by the domain-model mapping this PRD is generated from, not by this PRD ([mapping](../explorations/2026-09-02-workspace-template-domain-mapping.md)).
- The JSON Schema text of the menu-label field and the shell's own rendering of the resolved label: the field's shape and its owning schema file are stated by this family's own DESIGN (§3.3), and the schema itself is published from the shell sibling's own template territory. This PRD states only the observable requirement (§5.3).
- The generic template mechanism - source-spec resolution, manifest publication, ownership-boundary declaration, assembly-conflict prevention - all owned by the CLI's own PRD in the ecosystem repository; this PRD adds no requirement to it.
- Generic extension-domain governance and host-microfrontend communication - both owned by the runtime's own PRD in the ecosystem repository; this PRD adds no requirement to it, only a family-specific usage of what it already commits to.
- Where the shell's MF-host build layer is sourced from, whether a screen sibling's own MFE manifest can declare a required shell-provided endpoint, and whether component CSS reaches a shadow root through an actual Module-Federation build - all three stay fully open (§11). Whether `@gears-frontx/react` should later standardize the per-screen API-glue pattern this PRD requires for the first split release, and where the `shared/` presentation utilities eventually belong, are addressed at §11 with a stated v1 default rather than left fully open.
- FEATURE and DECOMPOSITION authoring for this family: deferred by team decision on 2026-09-02, until the maintainer settles this PRD and its DESIGN into an accepted state; the resumption trigger is the maintainer's acceptance of both. No acceptance criterion in this PRD (§9) depends on either existing yet, and none is produced here.

## 5. Functional Requirements

### 5.1 Family Composition and Independent Release

#### Independently-versioned sibling composition

- [ ] `p1` - **ID**: `cpt-frontx-workspace-templates-fr-independent-sibling-release`

The family **MUST** be composed of five top-level template directories - one shell sibling and four screen siblings - each carrying its own template manifest, its own version line, and its own source-spec ref, resolvable and applicable independently of the others' release state.

**Rationale**: The whole point of splitting a monolithic template into a family is that a screen sibling's own release does not wait on the shell's, or on any other screen sibling's; a shared version line would reintroduce the coupling the split exists to remove.

**Actors**: `cpt-frontx-workspace-templates-actor-shell-developer`, `cpt-frontx-workspace-templates-actor-screen-developer`

#### Manifest-presence discovery obligation

- [ ] `p1` - **ID**: `cpt-frontx-workspace-templates-fr-registry-parity`

Each of the five family directories **MUST** carry its own `frontx-template.json` at its root in the same commit that creates, renames, or relocates it, so that the directory is discovered as a template by manifest presence and no guard in this repository has to be taught its name.

**Rationale**: Manifest presence is the one rule template discovery follows here, and every guard goes through it, so a directory that carries its manifest from its first commit is enrolled everywhere at once and a directory that does not is silently not a template at all. Creating five template directories at once multiplies any missed per-directory step by five; stating the obligation at the family's own altitude keeps it from being rediscovered per directory.

**Actors**: `cpt-frontx-workspace-templates-actor-shell-developer`, `cpt-frontx-workspace-templates-actor-screen-developer`

### 5.2 Shell-Screen Integration Contract

#### Screen registration against the existing screen extension domain

- [ ] `p1` - **ID**: `cpt-frontx-workspace-templates-fr-screen-domain-registration`

Each screen sibling **MUST** register exactly one extension entry against the shell's screen extension domain (`gts.frontx.mfes.ext.domain.v1~frontx.screensets.layout.screen.v1`), the same domain identifier the runtime's own `demo-mfe` reference already targets. The family **MUST NOT** declare a new extension domain of its own.

**Rationale**: The screen extension domain, its admission rules, and its cardinality matrix are already specified generically by the runtime (`cpt-frontx-fr-mfe-extension-domain-governance`, `cpt-frontx-fr-mfe-multi-occupant-domain`); reusing it rather than declaring a family-specific domain keeps the family from duplicating a contract the runtime already owns.

**Actors**: `cpt-frontx-workspace-templates-actor-screen-developer`

#### Shell resolves the registered set into deep-linkable navigation

- [ ] `p1` - **ID**: `cpt-frontx-workspace-templates-fr-hash-routing`

The shell **MUST** resolve a URL to the mounted screen it names using each registered extension's own declared `presentation.route`, rather than against a closed union of known screen identifiers. A screen sibling applied to a project after the shell was built **MUST** be reachable by its own declared route without a shell rebuild. The registered route set **MUST** be prefix-free across every applied sibling - no applied sibling's own declared route may be a proper prefix of another applied sibling's own declared route (`/mail` and `/mailbox` applied together would violate this) - so a URL always resolves to exactly one sibling.

**Rationale**: `presentation.route` is already schema-required on every extension entry but has never had a real consumer in this ecosystem; a closed route union would reintroduce, inside the shell's own routing code, exactly the coupling to a fixed screen set the split exists to remove. How the shell parses a URL into a route match is the shell's own implementation, out of this PRD's scope (§4.2); this requirement states only the observable resolution outcome and the prefix-free precondition it depends on.

**Actors**: `cpt-frontx-workspace-templates-actor-shell-developer`

### 5.3 Menu Labeling and Screen-Local Copy

#### Discoverable menu labeling for every applied sibling

- [ ] `p1` - **ID**: `cpt-frontx-workspace-templates-fr-i18n-namespace-registration`

Every applied screen sibling's own menu-chrome label **MUST** render in the shell's own chosen language, for every applied sibling simultaneously - not only the one currently routed - without the shell importing that sibling's translation bundle at build time. A sibling's own label **MUST** be declared as static data in that sibling's own manifest surface, validated by the type system before the sibling's extension is admitted, and resolvable by the shell **without any of that sibling's own code having been loaded or executed**. A sibling's own label **MUST** continue to render correctly if the shell's chosen language changes while the sibling stays applied, without requiring that sibling to be loaded or remounted. The resolution **MUST** terminate in a rendered string for every admitted sibling, through a fallback the contract itself declares.

**Rationale**: A Project Developer applies screen siblings independently and expects the icon-rail menu to show every applied sibling's own label from cold load. Cold load is the binding constraint: admission is manifest-driven and loads no remote, so on the load that first paints the menu, every sibling but the routed one has run no code at all. Any mechanism that asks a sibling to produce, dispatch, or hand over its own label therefore cannot label it at the moment the label is needed - which is why the requirement is for static declared data rather than for a transport. A shell-wide language switch is likewise an event a sibling does not control and is in no position to answer, so the per-language strings must already be in the shell's hands. The field shape and its owning schema are this family's own DESIGN's concern, not restated here (§4.2).

**Actors**: `cpt-frontx-workspace-templates-actor-shell-developer`, `cpt-frontx-workspace-templates-actor-screen-developer`

#### Self-contained internal-copy translation

- [ ] `p2` - **ID**: `cpt-frontx-workspace-templates-fr-internal-copy-i18n`

A screen sibling's own internal UI copy **MUST** resolve from a namespace local to that sibling's own bundle, driven only by the existing `language` shared property, needing no registration with the shell beyond that property.

**Rationale**: A screen sibling's own internal strings are not shell-rendered chrome; requiring shell registration for them would place a build-time or registration cost on every string a sibling owns entirely, for no benefit the shell needs.

**Actors**: `cpt-frontx-workspace-templates-actor-screen-developer`

## 6. Non-Functional Requirements

### 6.1 NFR Inclusions

#### No template-kind taxonomy

- [ ] `p1` - **ID**: `cpt-frontx-workspace-templates-nfr-no-kind-taxonomy`

No template-manifest field introduced by this split **MUST** classify a template as a "shell template" or a "screen template," or by any other kind. The distinction between the shell and a screen **MUST** stay entirely in each template's own prose description.

**Threshold**: Zero new fields, in any of the five templates' own template manifests, whose value names a template kind.

**Rationale**: A classification taxonomy hardens the system and narrows what future templates can compose; its absence is a deliberate ecosystem-wide decision this family does not get an exception to.

#### Ecosystem traceability scan stays off template payload

- [ ] `p1` - **ID**: `cpt-frontx-workspace-templates-nfr-territory-exclusion`

None of the five family directories' own payload **MUST** be specified by the ecosystem artifact tree or scanned by the ecosystem repository's traceability registry, and no `@cpt-` marker authored inside any of the five binds anything, wherever that payload lives.

**Threshold**: Zero `@cpt-` markers inside any of the five directories' own payload, and no family directory named by the ecosystem repository's own artifact registry.

**Rationale**: This is the direct consequence of `cpt-frontx-adr-template-territory-traceability`: the ecosystem tree specifies the mechanism templates resolve through, never a template's internals. The `cpt-` ids this PRD and its DESIGN declare are this family's own architecture ids, carried in this directory, not markers in template payload.

### 6.2 NFR Exclusions

The root PRD's §6.2 exclusions do not carry over unmodified: several are reasoned specifically from the root shipping no end-user-facing interface and no end-user data, and this family's whole purpose is a composed, end-user-facing application. Each category is evaluated here at this family's own scope.

- **Accessibility** (UX-PRD-002): Not applicable to this PRD's own scope, for a different reason than the root's. This family does compose an end-user-facing application, but this PRD governs only the ecosystem-facing shell-screen integration contract (§1.1); each sibling's own rendered UI - and its accessibility posture - is template payload, unspecified by the ecosystem artifact tree and documented at code altitude where the code lives (`cpt-frontx-adr-template-territory-traceability`; §4.2). Accessibility of the composed application is a Template Developer's own implementation concern, inherited in practice from `@gears-frontx/ui-kit`'s own accessibility posture, not a requirement this contract-level PRD states or excludes.
- **Internationalization** (UX-PRD-003): Explicitly **not excluded**. This family's own i18n split is in scope and specified at §5.3, in two halves: the shell-rendered menu label is static declared data (`cpt-frontx-workspace-templates-fr-i18n-namespace-registration`), and every sibling's own internal UI copy resolves inside that sibling's own bundle (`cpt-frontx-workspace-templates-fr-internal-copy-i18n`). The root's blanket internationalization exclusion does not apply here.
- **Privacy / data handling** (SEC-PRD-005): Not applicable, for a family-specific reason distinct from the root's. The contacts, conversation, and message data this family's screens render is demo and mock data shipped with the templates, not real end-user personal data the product collects, stores, or processes; the shell's own HTTP surface (§3) serves that same demo data. Should a Project Developer wire that surface to a real backend carrying real personal data, the resulting privacy posture belongs to the consuming application built on the templates - the same allocation the root PRD makes generally.
- **Inclusivity** (UX-PRD-005): Not applicable to this PRD's own scope, for the same reason as Accessibility above: the composed application's inclusivity posture is each sibling's own rendered-UI concern, template payload outside this contract-level PRD's scope.
- **Regulatory Compliance** (COMPL-PRD-001 / COMPL-PRD-002 / COMPL-PRD-003): Not applicable, for the same demo-data reason as Privacy above: the family ships no real regulated data, only fictional demo content; a consuming application that wires the shell's HTTP surface to real regulated data owns its own compliance posture.
- **Safety** (SAFE-PRD-001/002): Not applicable, for the same reason the root PRD states: this family is frontend template content, not a safety-critical system, and this PRD introduces nothing that changes that.

## 7. Public Library Interfaces

### 7.1 Public API Surface

None owned here. This PRD describes no published package of its own; the runtime's public surface that the family's addressed action rides on is owned by the runtime's own PRD (its §7.1, Public API Surface).

### 7.2 External Integration Contracts

None owned here beyond the package-registry distribution contract every published artifact carries (`cpt-frontx-contract-package-registry-distribution`), which does not apply to template territory. The family's own manifest publication contract is owned by the CLI's own PRD (its §7.2, External Integration Contracts).

## 8. Use Cases

#### A screen sibling applied after the shell was built resolves a deep link

- [ ] `p2` - **ID**: `cpt-frontx-workspace-templates-usecase-deep-link-to-screen-sibling`

**Actor**: `cpt-frontx-workspace-templates-actor-shell-developer`

**Preconditions**:
- The shell is applied to a project and built; a screen sibling built and released after the shell's own release is subsequently applied to the same project.
- A URL naming that screen sibling's own declared `presentation.route` is opened cold or reloaded.

**Main Flow**:
1. The runtime admits the newly-applied screen sibling's extension into the shell's screen extension domain by contract matching (`cpt-frontx-workspace-templates-fr-screen-domain-registration`), the same admission path `demo-mfe`'s own screen extensions already exercise.
2. The admitted extension carries the sibling's own menu label with it, as static per-language data the type system validated at admission; the shell needs nothing further from the sibling to render it (`cpt-frontx-workspace-templates-fr-i18n-namespace-registration`).
3. The shell's own icon-rail menu includes the newly-admitted sibling, at the order value the sibling's own MFE manifest declares, labeled in the shell's own current language from that declaration - including on the load where the sibling's own remote is never fetched.
4. The shell's router resolves the opened URL's route segment against the registered extension set's own declared routes (`cpt-frontx-workspace-templates-fr-hash-routing`), and mounts only the matching sibling's own screen content.

**Postconditions**:
- The deep-linked screen is mounted, and every applied sibling's menu entry - not only the mounted one's - renders labeled in the shell's own chosen language, without the shell having been rebuilt to know about any of them in advance.

**Alternative Flows**:
- **No registered route matches the opened URL's route segment**: the shell shows its own fallback; no sibling mounts. This is the shell's own routing behavior, not a runtime guarantee this PRD or the runtime makes.
- **Two applied screen siblings declare the same `presentation.order` band, or declare routes where one is a proper prefix of the other**: nothing in the runtime arbitrates either collision; both are documented, review-enforced conventions rather than mechanically-checked invariants (§11).

## 9. Acceptance Criteria

- [ ] All five family directories carry their own template manifest, version line, and source-spec ref, independently applicable and independently releasable - verifiable via `cpt-frontx-workspace-templates-fr-independent-sibling-release`.
- [ ] Each of the five directories carries its own `frontx-template.json` from the commit that creates, renames, or relocates it, and is discovered as a template by manifest presence alone - verifiable via `cpt-frontx-workspace-templates-fr-registry-parity`.
- [ ] Every screen sibling registers exactly one extension entry against the existing screen extension domain, with no new domain declared by the family - verifiable via `cpt-frontx-workspace-templates-fr-screen-domain-registration`.
- [ ] A screen sibling applied after the shell was built is reachable by its own declared route without a shell rebuild - verifiable via `cpt-frontx-workspace-templates-fr-hash-routing`.
- [ ] On a cold load where only one sibling is routed, every applied sibling's own menu-chrome label renders in the shell's chosen language, with no sibling's remote fetched but the routed one's, and no sibling's translation bundle imported by the shell at build time - verifiable via `cpt-frontx-workspace-templates-fr-i18n-namespace-registration`.
- [ ] A screen sibling's own internal UI copy resolves from its own bundle-local namespace, driven only by the existing `language` shared property - verifiable via `cpt-frontx-workspace-templates-fr-internal-copy-i18n`.
- [ ] No template-manifest field added by this split classifies a template by kind - verifiable via `cpt-frontx-workspace-templates-nfr-no-kind-taxonomy`.
- [ ] No family directory's own payload is specified or scanned by the ecosystem repository's artifact tree, and no `@cpt-` marker inside one binds anything - verifiable via `cpt-frontx-workspace-templates-nfr-territory-exclusion`.

## 10. Dependencies

| Dependency | Description | Criticality |
|------------|-------------|-------------|
| `@gears-frontx/mfes` screen extension domain | The existing runtime capability this family composes on; owns extension-domain governance and host-microfrontend communication generically. | p1 |
| `@gears-frontx/gts-plugin` | Validates every extension entry and shared property the family's own MFE manifests declare, including each screen's own presentation block. | p1 |
| CLI's generic template mechanism | Source-spec resolution, manifest publication, and assembly-conflict prevention that every one of the five templates resolves through. | p1 |
| Domain-model mapping | File-level detail for the split, referenced rather than duplicated by this PRD ([mapping](../explorations/2026-09-02-workspace-template-domain-mapping.md)). | p2 |

## 11. Assumptions

- Five open questions were raised by the domain-model mapping this PRD is generated from. Two are resolved or given a stated default by this PRD; three stay fully open and are not resolved here. A sixth question, not raised by the mapping but by this PRD's own scope boundary, is added below:
  - **Open - MF-host build-layer sourcing.** Whether the shell's Module-Federation host layer is sourced from `template-shell`'s own published build export or from a `packages/`-promoted framework is not decided here; either choice is compatible with the requirements this PRD states.
  - **Open - endpoint-availability declaration.** Whether a screen sibling's own MFE manifest gets a way to declare a required shell-provided endpoint, enforced by the runtime's existing subset-admission check, is not decided here; today a version mismatch surfaces as a runtime 404 rather than a refused mount, and this PRD states no requirement that changes that.
  - **Resolved for v1 - per-screen API-glue duplication, standardization deferred.** Each screen sibling authors its own thin glue against `@gears-frontx/api` (rather than importing the shell's own `registry.ts`/`queries.ts`); this PRD requires that shape for the first split release (§5.3, Operational Concept). Whether `@gears-frontx/react` should later standardize that pattern so five templates stop independently reinventing it is not decided here and stays open.
  - **Deferred to a future ui-kit DESIGN; eventual placement unresolved.** Whether `PresenceAvatar`, `IdentityAvatar`, and `format.ts` move into `@gears-frontx/ui-kit` is a decision about the kit's own scope, owned by whoever authors the kit's own DESIGN; this PRD does not decide it.
  - **Open - component CSS through Module Federation, confirmed.** Whether component (not token) CSS reaches a shadow root through an actual Module-Federation build, rather than only through the in-repo fixture already proven, is not confirmed by this PRD; the domain-model mapping's own risk framing places this before the first screen sibling (contacts) is split, not after.
  - **Open - should this family's shell-screen contract become a first-class ecosystem concept?** This PRD and its DESIGN state a cross-template contract surface scoped to one family, authored in this repository under the latitude `cpt-frontx-adr-template-territory-traceability` leaves to the repository that publishes the templates, and ask nothing of the boundary that decision draws between ecosystem artifact and template territory. Whether a future co-authored template family's own shell-screen contract generically deserves recognition as a first-class ecosystem concept - which would mean moving that boundary rather than working inside it per-family, as this PRD does - is not decided here. The candidate resolution, if this proves needed, is an amendment to `cpt-frontx-adr-template-territory-traceability`; the ecosystem repository's maintainers own that decision.
- Order-band and prefix-free-route-set obligations across independently-versioned screen siblings are documented conventions this PRD states (§5.2) and a review obligation on each Screen Template Developer; neither is a runtime-enforced or mechanically-checked invariant, because `presentation.order` is a flat number across the whole domain and nothing in the runtime arbitrates a collision between two siblings claiming the same band, or a resolution ambiguity between two siblings whose declared routes are not prefix-free.
- Every family member composes inside the same JavaScript realm and the same Module-Federation graph the runtime already governs; this PRD introduces no new isolation model and relies entirely on the runtime's existing one.

## 12. Risks

| Risk | Impact | Mitigation |
|------|--------|------------|
| A new family directory is created without its own `frontx-template.json`. | The directory is not a template as far as this repository is concerned: template discovery does not find it, and every guard that walks discovered templates skips it silently rather than failing on the change that caused it. | The manifest-presence obligation (`cpt-frontx-workspace-templates-fr-registry-parity`) states the requirement at the family's own altitude, in the same commit as each directory's own creation. |
| Two independently-versioned screen siblings declare the same order band, or declare routes where one is a proper prefix of the other (`/mail` and `/mailbox`, for instance). | The shell's icon-rail ordering becomes ambiguous between the two siblings with the same band, or the shell's route resolution has no defined match for a URL under the shorter prefix, with no runtime error surfaced either way. | The order-band convention (§5.2) and the prefix-free route-set obligation (§5.2) state both as review obligations; not resolved by a runtime guard in this pass. |
| `lucide-react` sits at two different major lines across the family's own dependency graph, and every ecosystem-package pin bump now touches five `package.json` files instead of two. | A future kit-icon change is not guaranteed to be observed by a screen sibling that pins its own copy; pin-bump review cost is multiplied by five. | Not addressed by this PRD; the pin-drift guard catches an inconsistency once it exists but does not reduce the number of files a bump touches, and the version-surface fact predates this split. |
| The shell's MF-host build layer depends on `template-shell`'s own published build export rather than a `packages/`-promoted framework (Open Question 1, leaning toward this option for the first iteration). | The pin-drift guard compares every discovered template's ecosystem-package pins against the packages published from the ecosystem repository; a pin on a package published from a template's own territory is not an ecosystem pin and sits outside that comparison, so a drift here would not be caught by the same mechanism that catches every other pin. | Not resolved by this PRD; carried as part of Open Question 1's own go/no-go (§11). |
| Component CSS reaching a shadow root through an actual Module-Federation build has not been traced, only the token path and an in-repo fixture. | If component CSS does not reach the shadow root the way the fixture suggests, the first screen sibling split (contacts) discovers this only after the split rather than before. | Confirm before contacts is split, per the domain-model mapping's own sequencing risk (§11, Open - component CSS confirmation). |
