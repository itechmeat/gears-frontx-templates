---
type: PRD
system: frontx-workspace-templates
status: draft
---

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
| `cpt-frontx-adr-template-territory-traceability` | [architecture/ADR/0033-template-territory-traceability.md](https://github.com/constructorfabric/gears-frontx/blob/develop/architecture/ADR/0033-template-territory-traceability.md) |
| the ecosystem's root PRD and DESIGN | [architecture/PRD.md](https://github.com/constructorfabric/gears-frontx/blob/develop/architecture/PRD.md), [architecture/DESIGN.md](https://github.com/constructorfabric/gears-frontx/blob/develop/architecture/DESIGN.md) |
| the CLI's own PRD | [packages/cli/architecture/PRD.md](https://github.com/constructorfabric/gears-frontx/blob/develop/packages/cli/architecture/PRD.md) |
| the runtime's own PRD | [packages/mfes/architecture/PRD.md](https://github.com/constructorfabric/gears-frontx/blob/develop/packages/mfes/architecture/PRD.md) |

The amendments to `cpt-frontx-adr-source-spec-syntax` and `cpt-frontx-adr-template-manifest-contract` that this document cites as amended land with [gears-frontx#609](https://github.com/constructorfabric/gears-frontx/pull/609), which merges before this change; the `develop` links above do not carry them yet.

## 1. Overview

### 1.1 Purpose

The Workspace Template Family is a co-authored, independently-versioned group of five top-level templates - `template-workspace`, the shell, plus `template-workspace-contacts`, `template-workspace-dashboard`, `template-workspace-chat`, and `template-workspace-mail`, each a screen member - that together produce one composed application: a shell hosting up to four screens, mounted through the ecosystem's existing screen extension domain. Each screen member is a feature template that carries nothing microfrontend-specific: a React feature, its API wiring included, which a project either renders as a plain React component in an application without microfrontends or wraps into a microfrontend with this repository's `template-mfe`. Wrapping is the step that gives a screen its MFE package, its MFE manifest and its Module Federation build (§5.2). The composed application this PRD specifies is the wrapped case: the shell plus each applied screen member wrapped by `template-mfe`. `template-workspace-chat` is the same template as the chat feature template FrontX places next to a calendar template, where a target console composes a shell app with two screens, calendar and chat, each wrapped by the mfe template: one template, usable inside this family or on its own (its name is an open question, §11). Each of the five is its own template-territory directory, carrying its own template manifest, its own version line, and its own release cadence, addressed by a source-spec whose shape is fixed by `cpt-frontx-adr-source-spec-syntax` and whose per-member ref namespace that record leaves to this family to declare (§5.1). What one template directory contains internally is not this PRD's subject: template payload sits outside the ecosystem artifact universe (`cpt-frontx-adr-template-territory-traceability`), and the file-level shape of the split is carried by the domain-model mapping this PRD is generated from, not restated here ([mapping](../explorations/2026-09-02-workspace-template-domain-mapping.md)).

This PRD owns what none of the five template directories could carry inside itself and what no ecosystem artifact owns either: the cross-member contract the split introduces between independently-versioned members that must nonetheless compose into one working application - the shell-screen integration surface, the GTS conventions the family's manifests share, the i18n and guard obligations the split adds, and the versioning and release model the family follows. It is this repository's own architecture over one template family it publishes, authored here because `cpt-frontx-adr-template-territory-traceability` leaves an artifact tree over the templates to the repository that publishes them. Ecosystem-level requirements binding every FrontX layer equally are owned by the ecosystem repository's root PRD; the CLI's own PRD owns the generic template mechanism - source-spec resolution, the template manifest contract, ownership-boundary declaration - that every template, including these five, resolves through; the runtime's own PRD owns extension-domain governance and host-microfrontend communication generically. This PRD owns only what is specific to this one family composing on top of those generic mechanisms.

### 1.2 Background / Problem Statement

The source this split works from is `template-inbox`: one template carrying one shell and four screens - contacts, dashboard, chat, mail - as one directory, one version, one release. It is not shipped state and never was. It exists on the reference branch of [gears-frontx#596](https://github.com/constructorfabric/gears-frontx/pull/596), which is closed and marked do-not-merge, and this family is what that branch's content becomes rather than something replacing a released template. Shaped that way, a Project Developer who wants the shell without chat, or dashboard alone against a different shell, cannot have it: the four screens and their shell version and release together, whether or not a given project uses all four. Splitting the monolith into five independently-versioned templates removes that coupling, but a split only pays off if the five pieces, built and released independently, still compose into one working application when a Project Developer applies the shell and any subset of the screens.

That is the problem this PRD addresses: independently-versioned members need a contract to agree on, stated once and discoverable without reading each other's source, so that a screen template built by one Template Developer against one shell version still mounts correctly, deep-links correctly, and labels its own menu entry correctly when applied alongside three other screens built by other Template Developers on their own schedules. Without that contract stated once, at the family's own altitude, each member's author would have to read the other four templates' source to discover the shape they must agree on - exactly the kind of open-ended-codebase guessing the ecosystem's root PRD identifies in its own problem statement (§1.2) as what a stable, narrow, explicitly-contracted surface is for.

### 1.3 Goals (Business Outcomes)

- **Independent release per member** - A Template Developer publishes a new version of one screen member without coordinating a release of the shell or of any other screen member. Target: each of the five templates carries its own version line and its own source-spec ref; Timeframe: first split release.
- **Deep-linkable multi-screen navigation** - A URL naming one of the family's screens resolves to that screen through the shell's own route resolution over the registered extension set, rather than through a closed route union. Target: every mounted screen member is reachable by a stable URL prefix it declares; Timeframe: first split release.
- **Discoverable menu labels across independently-versioned members** - Every applied screen member's own menu entry renders in the shell's own chosen language, without the shell importing that member's translation bundle at build time and without that member's code having run. Target: the shell resolves every applied screen's own menu label from static, GTS-validated data each wrapped screen's extension entry declares, read on the same pass that reads the screen's route, icon and order; Timeframe: first split release.
- **No template-kind taxonomy introduced** - The template manifest contract gains no field distinguishing a shell template from a screen template; the distinction stays prose-only, in each template's own description. Target: zero manifest-readable classification fields added by this split; Timeframe: first split release, held indefinitely.
- **Every family directory is a template by manifest presence alone** - Each of the five family directories carries its own `frontx-template.json`, which is what makes a top-level directory a template in this repository, and no guard here is taught any of the five names. Target: all five directories discovered as templates by `scripts/template-discovery.mjs` with no guard-side change; Timeframe: each directory's own creation commit.

### 1.4 Glossary

This PRD uses the ecosystem's root PRD vocabulary (its §1.4) for *template*, *project*, and *application*, and the runtime's own vocabulary (its PRD §1.4) for *microfrontend*, *extension*, and *extension domain*. The terms below are specific to this family and are prose-only: none names a template-manifest field, and none is a classification a template's own template manifest declares (`cpt-frontx-adr-template-manifest-contract`; rule against introducing a template-kind taxonomy).

| Term | Definition |
|------|------------|
| family | The five templates this PRD describes, co-authored and independently versioned, that compose into one application when applied together. |
| member | Any one of the family's five templates, also called a family member, named for its position in the family rather than for a manifest-declared kind. Members compose into one application; they are not sibling templates of one another. |
| sibling template | An alternative template of the same kind as another, such as a second calendar template next to a first one, which the repository may ship side by side so a project chooses one. |
| shell | The family's member that owns the application shell, the icon rail, theming, i18n core, and the domain-neutral API glue: `template-workspace`. Plays the runtime's Application Developer role (`cpt-frontx-mfes-actor-application-developer`) at the family's own surface. |
| screen | Any one of the family's four members: `template-workspace-contacts`, `-dashboard`, `-chat`, `-mail`. A feature template that carries nothing microfrontend-specific: usable as a plain React component, or wrapped by `template-mfe` into a microfrontend that mounts as an occupant of the shell's screen extension domain. |
| wrapped screen | A screen member wrapped by `template-mfe`: the MFE package the wrapping step produces around the screen's feature, carrying the MFE manifest and the Module Federation build. Whoever wraps a screen plays the runtime's Microfrontend Developer role (`cpt-frontx-mfes-actor-microfrontend-developer`) for it. Everything this PRD requires of an extension entry, a route, an order or a menu label is required of the wrapped screen. |
| screen extension domain | The existing runtime extension domain every wrapped screen's extension entry targets (`gts.frontx.mfes.ext.domain.v1~frontx.screensets.layout.screen.v1`), the same domain the screen extensions in this repository's own `template-mfe` packages already target (`template-mfe/src-app/mfe_packages/_blank-mfe/mfe.json` and `.../demo-mfe/mfe.json`). Not a new domain this split declares. |
| order band | The convention reserving each screen member an inclusive, 100-wide range of `presentation.order` values - contacts 100-199, dashboard 200-299, chat 300-399, mail 400-499 - so independently-versioned members do not have to coordinate an exact value to avoid colliding (§5.2). A documented convention, not a runtime-enforced one (§11). |
| template manifest | The `frontx-template.json` file each of the five family directories carries at its own root, governed by the manifest-contract decision (`cpt-frontx-adr-template-manifest-contract`). Carries a template's own identity, ownership boundary, and description; carries no field distinguishing a shell member from a screen member. |
| MFE manifest | The `mfe.json`-shaped manifest each wrapped screen's MFE package carries, produced by the wrapping step and following the MFE package shape `template-mfe`'s own packages already use - `_blank-mfe` is the scaffold, `demo-mfe` the worked example - declaring that package's extension entries, required and optional shared properties, and actions against the runtime's screen extension domain. A different file from, and unrelated in schema to, the template manifest above; the two are disambiguated by these qualified names everywhere in this document and its DESIGN. |

## 2. Actors

### 2.1 Human Actors

#### Shell Template Developer

**ID**: `cpt-frontx-workspace-templates-actor-shell-developer`

**Role**: Authors, versions, and publishes `template-workspace`. Declares the screen extension domain's admission rules the shell already inherits from the runtime, wires the shared i18n core and the two existing chrome-facing conventions the split plan carries forward, and implements deep-link resolution, matching an opened URL to a registered screen. Fills the root PRD's Template Developer role (`cpt-frontx-actor-template-developer`) and the runtime's Application Developer role (`cpt-frontx-mfes-actor-application-developer`) at the family's own surface.
**Needs**: A stable, cross-member statement of what a wrapped screen registers and how, so the shell can be built and released without waiting on any particular screen member's own release.

#### Screen Template Developer

**ID**: `cpt-frontx-workspace-templates-actor-screen-developer`

**Role**: Authors, versions, and publishes one of the four screen members as a React feature that carries nothing microfrontend-specific, and authors the member's own thin API glue against `@gears-frontx/api` rather than importing the shell's. States the values the wrapped screen's single extension entry declares - `presentation.route`, `presentation.order` inside the member's band, the menu icon, and the menu label with its per-language map - so the wrapping step can declare them without reading the member's source. Fills the root PRD's Template Developer role (`cpt-frontx-actor-template-developer`) at the family's own surface.
**Needs**: A documented order band and route-prefix convention to avoid colliding with a member built independently; a documented way to declare a menu label the shell renders without importing the member's translations or loading its bundle; no obligation to read another member's source to discover either.

### 2.2 System Actors

#### MFE Runtime

**ID**: `cpt-frontx-workspace-templates-actor-mfe-runtime`

**Role**: Admits each wrapped screen's extension into the shell's screen extension domain by contract matching, exposes the admitted set and its declared presentation metadata to the shell, and isolates each independently-bundled wrapped screen at load time. Owned entirely by `@gears-frontx/mfes`; this PRD adds no capability to it and no action to its communication channel.

#### GTS Type System

**ID**: `cpt-frontx-workspace-templates-actor-gts-type-system`

**Role**: Validates every extension entry and shared property the wrapped screens' MFE manifests declare, including each wrapped screen's presentation block and the per-language menu-label map inside it, before that extension is admitted. Owned entirely by `@gears-frontx/gts-plugin`.

## 3. Operational Concept & Environment

A Project Developer applies the shell, `template-mfe`, and any subset of the four screen members to a project, in any order the CLI's own composed-template resolution supports, and wraps each applied screen member into a microfrontend with `template-mfe`. The same screen members also serve an application without microfrontends, where the project renders each as a plain React component and none of the extension-domain flow below applies. Each wrapped screen registers one extension entry against the shell's screen extension domain at the member's own declared `presentation.route`, `presentation.order`, and menu icon; the shell resolves the registered set into an icon-rail menu and deep-links to whichever screen an opened URL names, never a closed union of known screen names. Every wrapped screen declares its menu label statically, inside its extension entry, as a per-language map beside the route, icon and order it already declares (§5.3); the shell reads that declaration off the admitted extension set and renders it in its own currently-selected language, without importing any member's translations at build time and without loading a member whose screen content is not the one currently routed. Two screen members that read shell-provided data - contacts records, for instance - do so over the shell's own HTTP surface, never through a build-time import of one another's or the shell's application code, because each member is versioned independently and, when wrapped, bundled independently, and no import can cross that boundary at runtime.

### 3.1 Module-Specific Environment Constraints

- Requires, for the wrapped case, the runtime's Module Federation composition and its screen extension domain to already be admitting the shell and its wrapped screens the way it admits the screen extensions `template-mfe`'s own packages declare. A screen member used as a plain React component requires neither.
- Requires, for the wrapped case, a browser environment with Shadow DOM support, since every wrapped screen's kit-styled UI renders inside a shadow root the shell's own trust-kernel isolation manages (owned by `@gears-frontx/mfes`, not restated here).
- Carries no environment constraint of its own beyond what the runtime and the CLI's template mechanism already state; this PRD introduces no new runtime dependency and no new communication channel, only one new declared field on an existing manifest surface (§5.3).

## 4. Scope

### 4.1 In Scope

- The family's own composition shape: one shell member plus up to four screen members, each an independently-versioned, independently-released top-level template directory, resolved and applied through the CLI's existing generic mechanism.
- The screen members' independence from microfrontends: each is a feature template usable as a plain React component, and the microfrontend case is produced by wrapping it with `template-mfe` (§5.2).
- The shell-screen integration contract: registration of each wrapped screen as an occupant of the existing screen extension domain, the order-band and route-prefix conventions that keep independently-versioned members from colliding, the shell's obligation to resolve the registered set into deep-linkable navigation rather than a closed route union, and the rule that no member imports another's code, or a package published from another template, at build time (§5.2).
- The static, per-language menu-label declaration this split adds to each wrapped screen's extension entry, so a screen member's menu label renders without a build-time import and without that member's code having run (§5.3).
- The manifest obligation the split's five simultaneous directory additions place on this repository's template discovery: each directory carries its own `frontx-template.json` from the commit that creates it, which is the whole of what makes it a template here, restated as a family-scoped acceptance criterion (§9).
- The family's versioning and release model: per-member independent version lines, and the per-member ref namespace they require. `cpt-frontx-adr-source-spec-syntax`, as amended, records that the source-spec carries a version in one repository-scoped place and leaves the ref namespace a family publishes to that family's own convention; this PRD is where this family declares its own (§5.1).

### 4.2 Out of Scope

- Any member's own internal file contents, directory layout, dataset, or styling: template payload sits outside the ecosystem artifact universe (`cpt-frontx-adr-template-territory-traceability`) and is carried at file-level detail by the domain-model mapping this PRD is generated from, not by this PRD ([mapping](../explorations/2026-09-02-workspace-template-domain-mapping.md)).
- The JSON Schema text of the menu-label field and the shell's own rendering of the resolved label: the field's shape and its owning schema file are stated by this family's own DESIGN (§3.3), and the schema itself is published from the shell member's own template territory. This PRD states only the observable requirement (§5.3).
- The generic template mechanism - source-spec resolution, manifest publication, ownership-boundary declaration, assembly-conflict prevention - all owned by the CLI's own PRD in the ecosystem repository; this PRD adds no requirement to it.
- Generic extension-domain governance and host-microfrontend communication - both owned by the runtime's own PRD in the ecosystem repository; this PRD adds no requirement to it, only a family-specific usage of what it already commits to.
- Where the shell's MF-host build layer is sourced from, given that it cannot be a package published from another template (§5.2), whether a wrapped screen's MFE manifest can declare a required shell-provided endpoint, and whether component CSS reaches a shadow root through an actual Module-Federation build - all three stay fully open (§11). Whether the per-screen API-glue pattern this PRD requires at §5.2 should later be standardized, and where, and where the `shared/` presentation utilities eventually belong, are addressed at §11 with a stated v1 default rather than left fully open.
- FEATURE and DECOMPOSITION authoring for this family: deferred by team decision on 2026-09-02, until the maintainer settles this PRD and its DESIGN into an accepted state; the resumption trigger is the maintainer's acceptance of both. No acceptance criterion in this PRD (§9) depends on either existing yet, and none is produced here.

## 5. Functional Requirements

### 5.1 Family Composition and Independent Release

#### Independently-versioned member composition

- [ ] `p1` - **ID**: `cpt-frontx-workspace-templates-fr-independent-member-release`

The family **MUST** be composed of five top-level template directories - one shell member and four screen members - each carrying its own template manifest, its own version line, and its own source-spec ref, resolvable and applicable independently of the others' release state.

**Rationale**: The whole point of splitting a monolithic template into a family is that a screen member's own release does not wait on the shell's, or on any other screen member's; a shared version line would reintroduce the coupling the split exists to remove.

**Actors**: `cpt-frontx-workspace-templates-actor-shell-developer`, `cpt-frontx-workspace-templates-actor-screen-developer`

#### Per-member release ref namespace

- [ ] `p1` - **ID**: `cpt-frontx-workspace-templates-fr-per-member-release-ref`

The family **MUST** publish its releases in a ref namespace that names the releasing member: one git tag per member release, of the form `<template>/v<semver>`, where the prefix is that member's own top-level directory name. A release of one member **MUST NOT** change the ref any other member's existing source-spec names, and every member's already-published source-spec **MUST** keep resolving to the same content after it.

**Rationale**: `cpt-frontx-adr-source-spec-syntax`, as amended, records that a source-spec carries its version in exactly one place and that the place is repository-scoped: `@ref` names a point in the repository's history, and every member addressed from that point is addressed at it. The record deliberately fixes no ref namespace - that is the family's own convention - but it does fix the consequence: a repository-wide ref advanced for one member moves the address of all five, which would give this family back precisely the shared release line it split to escape. A per-member tag is what makes the guarantee the split promises actually hold. No tag convention exists in this repository to inherit: it carries no tags at all, and its publish workflow publishes npm subpackages on a version change without cutting one. The shape names a template, not a family, so it serves a template published on its own just as well, and a vendor that forks one of these templates keeps the same `<template>/v<semver>` shape in its own repository: its consumers' source-specs differ from these only in the repository segment.

A consumer's reference then reads:

```text
github:constructorfabric/gears-frontx-templates//template-workspace-mail@template-workspace-mail/v1.2.0
```

where the subtree segment selects which member is materialized and the ref selects which of that member's releases the repository is read at.

**Actors**: `cpt-frontx-workspace-templates-actor-shell-developer`, `cpt-frontx-workspace-templates-actor-screen-developer`

#### Manifest-presence discovery obligation

- [ ] `p1` - **ID**: `cpt-frontx-workspace-templates-fr-registry-parity`

Each of the five family directories **MUST** carry its own `frontx-template.json` at its root in the same commit that creates, renames, or relocates it, so that the directory is discovered as a template by manifest presence and no guard in this repository has to be taught its name.

**Rationale**: Manifest presence is the one rule template discovery follows here, and every guard goes through it, so a directory that carries its manifest from its first commit is enrolled everywhere at once and a directory that does not is silently not a template at all. Creating five template directories at once multiplies any missed per-directory step by five; stating the obligation at the family's own altitude keeps it from being rediscovered per directory.

**Actors**: `cpt-frontx-workspace-templates-actor-shell-developer`, `cpt-frontx-workspace-templates-actor-screen-developer`

#### Description claims the member's unit and states its precondition

- [ ] `p1` - **ID**: `cpt-frontx-workspace-templates-fr-manifest-description-precondition`

Each of the five members' own template manifests **MUST** carry a description naming the unit that member contributes, in the words a stated intent would use for it, and each of the four screen members' descriptions **MUST** additionally state that the member is a React feature usable as a plain component or wrapped by `template-mfe`, and that the wrapped screen mounts into ground `template-workspace` establishes.

**Rationale**: The template manifest declares no compatibility requirement against another template, and no mechanism enforces one: the CLI's conflict check arbitrates contested ground, not absent ground, and admits an assembly in which a required template is simply not present (`cpt-frontx-adr-template-manifest-contract`, as amended). The description is the one place that decision leaves a precondition, and it is read twice over - by a human or an agent choosing the template, and by the ecosystem's scaffolding flow, which selects a template for a named unit by matching a stated intent against declared descriptions alone, special-casing no identity or naming pattern. A screen member whose description neither claims its unit nor names its precondition is therefore both unselectable for the screen a developer asked for and silently wrapped into a project that cannot host it.

**Actors**: `cpt-frontx-workspace-templates-actor-shell-developer`, `cpt-frontx-workspace-templates-actor-screen-developer`

### 5.2 Shell-Screen Integration Contract

#### Screen members carry nothing microfrontend-specific

- [ ] `p1` - **ID**: `cpt-frontx-workspace-templates-fr-mfe-agnostic-screen`

Each screen member **MUST** be a React feature that a project can render as a plain React component in an application without microfrontends. A screen member **MUST NOT** carry an MFE manifest, a Module Federation build, or a dependency on the microfrontend runtime; the microfrontend case **MUST** be produced by wrapping the member with `template-mfe`, the step that contributes the MFE package, its MFE manifest and its Module Federation build. Each screen member **MUST** state, for that step, the presentation values its wrapped screen declares: route, order inside the member's band, menu icon, and the menu label with its per-language map (§5.3).

**Rationale**: A feature template and the microfrontend wrapper are separate templates: the same feature serves a microfrontend composition such as this family's and a plain React application, and a project picks which. Keeping microfrontend concerns out of the feature leaves one wrapper, `template-mfe`, to own them for every feature template, rather than each screen carrying its own copy of them.

**Actors**: `cpt-frontx-workspace-templates-actor-screen-developer`

#### Screen registration against the existing screen extension domain

- [ ] `p1` - **ID**: `cpt-frontx-workspace-templates-fr-screen-domain-registration`

Each wrapped screen **MUST** register exactly one extension entry against the shell's screen extension domain (`gts.frontx.mfes.ext.domain.v1~frontx.screensets.layout.screen.v1`), the same domain identifier the screen extensions in this repository's `template-mfe` packages already target. The family **MUST NOT** declare a new extension domain of its own.

**Rationale**: The screen extension domain, its admission rules, and its cardinality matrix are already specified generically by the runtime (`cpt-frontx-fr-mfe-extension-domain-governance`, `cpt-frontx-fr-mfe-multi-occupant-domain`); reusing it rather than declaring a family-specific domain keeps the family from duplicating a contract the runtime already owns.

**Actors**: `cpt-frontx-workspace-templates-actor-screen-developer`

#### Shell resolves the registered set into deep-linkable navigation

- [ ] `p1` - **ID**: `cpt-frontx-workspace-templates-fr-route-resolution`

The shell **MUST** resolve a URL to the mounted screen it names using each registered extension's own declared `presentation.route`, rather than against a closed union of known screen identifiers. A screen member wrapped and applied to a project after the shell was built **MUST** be reachable by its own declared route without a shell rebuild. The registered route set **MUST** be prefix-free across every applied member - no applied member's own declared route may be a proper prefix of another applied member's own declared route (`/mail` and `/mailbox` applied together would violate this) - so a URL always resolves to exactly one member.

**Rationale**: `presentation.route` is required by the derived screen-extension schema this repository publishes but has never had a consumer - `template-shell` on `main` carries no routing of any kind, reads the field nowhere, and mounts a screen from a menu click rather than from a URL, so every part of this is net-new code for the workspace shell. A shell built later may parse the URL hash or use any other client-side technique; this requirement names none, because the technique is the shell's own template-territory implementation (§4.2), and a closed route union would reintroduce, inside the shell's own routing code, exactly the coupling to a fixed screen set the split exists to remove. This requirement states only the observable resolution outcome and the prefix-free precondition it depends on.

**Actors**: `cpt-frontx-workspace-templates-actor-shell-developer`

#### No cross-member build-time import

- [ ] `p1` - **ID**: `cpt-frontx-workspace-templates-fr-no-cross-member-import`

A member's own source **MUST NOT** import another member's source, another member's published package, or the shell's own application code at build time. A member **MUST NOT** depend on a package published from another template's territory in this repository, whether or not that template is a family member: a template-level package is used by the template that publishes it and by no other. What a member needs beyond its own content comes from a framework-level library of the FrontX ecosystem repository or is carried by the member itself. Each of the five members **MUST** carry its own thin API-glue layer, authored against `@gears-frontx/api`, for every endpoint it reads. Data whose subject matter belongs to another member **MUST** be reached over the shell's own REST surface at runtime, never through a shared module graph.

**Rationale**: Each member is versioned independently and, when wrapped, bundled independently, and Module Federation gives each remote its own module graph, so a build-time import across two members either fails to resolve or silently pins one member's release to another's - the coupling the split exists to remove. A dependency on another template's package couples the same way across templates, and templates spread by copy while packages are consumed as published and never edited, so a vendor that forks one template cannot change a package another template publishes. The cost this buys is real and is priced here rather than rediscovered per member: every screen writes its own small equivalent of the shell's `registry.ts`/`queries.ts` pattern instead of importing it.

**Actors**: `cpt-frontx-workspace-templates-actor-shell-developer`, `cpt-frontx-workspace-templates-actor-screen-developer`

### 5.3 Menu Labeling and Screen-Local Copy

#### Discoverable menu labeling for every applied member

- [ ] `p1` - **ID**: `cpt-frontx-workspace-templates-fr-menu-label-dictionary`

Every applied screen member's own menu-chrome label **MUST** render in the shell's own chosen language, for every applied member simultaneously - not only the one currently routed - without the shell importing that member's translation bundle at build time. A member's own label **MUST** be declared as static data in the wrapped screen's extension entry, from the values the screen member states (`cpt-frontx-workspace-templates-fr-mfe-agnostic-screen`), validated by the type system before the member's extension is admitted, and resolvable by the shell **without any of that member's own code having been loaded or executed**. A member's own label **MUST** continue to render correctly if the shell's chosen language changes while the member stays applied, without requiring that member to be loaded or remounted. The resolution **MUST** terminate in a rendered string for every admitted member, through a fallback the contract itself declares.

**Rationale**: A Project Developer applies screen members independently and expects the icon-rail menu to show every applied member's own label from cold load. Cold load is the binding constraint: admission is manifest-driven and loads no remote, so on the load that first paints the menu, every member but the routed one has run no code at all. Any mechanism that asks a member to produce, dispatch, or hand over its own label therefore cannot label it at the moment the label is needed - which is why the requirement is for static declared data rather than for a transport. A shell-wide language switch is likewise an event a member does not control and is in no position to answer, so the per-language strings must already be in the shell's hands. The field shape and its owning schema are this family's own DESIGN's concern, not restated here (§4.2).

**Actors**: `cpt-frontx-workspace-templates-actor-shell-developer`, `cpt-frontx-workspace-templates-actor-screen-developer`

#### Self-contained internal-copy translation

- [ ] `p2` - **ID**: `cpt-frontx-workspace-templates-fr-internal-copy-i18n`

A screen member's own internal UI copy **MUST** resolve from a namespace local to that member's own code, driven only by the current language it is given - the existing `language` shared property when wrapped, a plain input when rendered as a React component - needing no registration with the shell beyond that.

**Rationale**: A screen member's own internal strings are not shell-rendered chrome; requiring shell registration for them would place a build-time or registration cost on every string a member owns entirely, for no benefit the shell needs.

**Actors**: `cpt-frontx-workspace-templates-actor-screen-developer`

## 6. Non-Functional Requirements

### 6.1 NFR Inclusions

#### No template-kind taxonomy

- [ ] `p1` - **ID**: `cpt-frontx-workspace-templates-nfr-no-kind-taxonomy`

A template manifest belonging to any of the five family directories **MUST NOT** carry a field whose value classifies that template as a "shell template" or a "screen template," or by any other kind. The distinction between the shell and a screen **MUST** stay entirely in each template's own prose description.

**Threshold**: Zero new fields, in any of the five templates' own template manifests, whose value names a template kind.

**Rationale**: A classification taxonomy hardens the system and narrows what future templates can compose; its absence is a deliberate ecosystem-wide decision this family does not get an exception to.

#### Ecosystem traceability scan stays off template payload

- [ ] `p1` - **ID**: `cpt-frontx-workspace-templates-nfr-territory-exclusion`

The ecosystem artifact tree **MUST NOT** specify any of the five family directories' own payload, and the ecosystem repository's traceability registry **MUST NOT** scan it. A `@cpt-` marker authored inside any of the five binds nothing, wherever that payload lives.

**Threshold**: Zero `@cpt-` markers inside any of the five directories' own payload, and no family directory named by the ecosystem repository's own artifact registry.

**Rationale**: This is the direct consequence of `cpt-frontx-adr-template-territory-traceability`: the ecosystem tree specifies the mechanism templates resolve through, never a template's internals. The `cpt-` ids this PRD and its DESIGN declare are this family's own architecture ids, carried in this directory, not markers in template payload.

### 6.2 NFR Exclusions

The root PRD's §6.2 exclusions do not carry over unmodified: several are reasoned specifically from the root shipping no end-user-facing interface and no end-user data, and this family's whole purpose is a composed, end-user-facing application. Each category is evaluated here at this family's own scope.

- **Accessibility** (UX-PRD-002): Not applicable to this PRD's own scope, for a different reason than the root's. This family does compose an end-user-facing application, but this PRD governs only the cross-member shell-screen integration contract (§1.1); each member's own rendered UI - and its accessibility posture - is template payload, unspecified by the ecosystem artifact tree and documented at code altitude where the code lives (`cpt-frontx-adr-template-territory-traceability`; §4.2). Accessibility of the composed application is a Template Developer's own implementation concern, inherited in practice from `@gears-frontx/ui-kit`'s own accessibility posture, not a requirement this contract-level PRD states or excludes.
- **Internationalization** (UX-PRD-003): Explicitly **not excluded**. This family's own i18n split is in scope and specified at §5.3, in two halves: the shell-rendered menu label is static declared data (`cpt-frontx-workspace-templates-fr-menu-label-dictionary`), and every member's own internal UI copy resolves inside that member's own code (`cpt-frontx-workspace-templates-fr-internal-copy-i18n`). The root's blanket internationalization exclusion does not apply here.
- **Privacy / data handling** (SEC-PRD-005): Not applicable, for a family-specific reason distinct from the root's. The contacts, conversation, and message data this family's screens render is demo and mock data shipped with the templates, not real end-user personal data the product collects, stores, or processes; the shell's own HTTP surface (§3) serves that same demo data. Should a Project Developer wire that surface to a real backend carrying real personal data, the resulting privacy posture belongs to the consuming application built on the templates - the same allocation the root PRD makes generally.
- **Inclusivity** (UX-PRD-005): Not applicable to this PRD's own scope, for the same reason as Accessibility above: the composed application's inclusivity posture is each member's own rendered-UI concern, template payload outside this contract-level PRD's scope.
- **Regulatory Compliance** (COMPL-PRD-001 / COMPL-PRD-002 / COMPL-PRD-003): Not applicable, for the same demo-data reason as Privacy above: the family ships no real regulated data, only fictional demo content; a consuming application that wires the shell's HTTP surface to real regulated data owns its own compliance posture.
- **Safety** (SAFE-PRD-001/002): Not applicable, for the same reason the root PRD states: this family is frontend template content, not a safety-critical system, and this PRD introduces nothing that changes that.

## 7. Public Library Interfaces

### 7.1 Public API Surface

None owned here. This PRD describes no published package of its own; the runtime's public surface the family composes against is owned by the runtime's own PRD (its §7.1, Public API Surface).

### 7.2 External Integration Contracts

None owned here beyond the package-registry distribution contract every published artifact carries (`cpt-frontx-contract-package-registry-distribution`), which does not apply to template territory. The family's own manifest publication contract is owned by the CLI's own PRD (its §7.2, External Integration Contracts).

## 8. Use Cases

#### A screen member applied after the shell was built resolves a deep link

- [ ] `p2` - **ID**: `cpt-frontx-workspace-templates-usecase-deep-link-to-screen-member`

**Actor**: `cpt-frontx-workspace-templates-actor-shell-developer`

**Preconditions**:
- The shell and `template-mfe` are applied to a project and the shell is built; a screen member built and released after the shell's own release is subsequently applied to the same project and wrapped by `template-mfe`.
- A URL naming that screen member's own declared `presentation.route` is opened cold or reloaded.

**Main Flow**:
1. The runtime admits the newly-wrapped screen's extension into the shell's screen extension domain by contract matching (`cpt-frontx-workspace-templates-fr-screen-domain-registration`), the same admission path the screen extensions in this repository's `template-mfe` packages already exercise.
2. The admitted extension carries the member's own menu label with it, as static per-language data the type system validated at admission; the shell needs nothing further from the member to render it (`cpt-frontx-workspace-templates-fr-menu-label-dictionary`).
3. The shell's own icon-rail menu includes the newly-admitted member, at the order value the wrapped screen's MFE manifest declares, labeled in the shell's own current language from that declaration - including on the load where the member's own remote is never fetched.
4. The shell's router resolves the opened URL's route segment against the registered extension set's own declared routes (`cpt-frontx-workspace-templates-fr-route-resolution`), and mounts only the matching member's own screen content.

**Postconditions**:
- The deep-linked screen is mounted, and every applied member's menu entry - not only the mounted one's - renders labeled in the shell's own chosen language, without the shell having been rebuilt to know about any of them in advance.

**Alternative Flows**:
- **No registered route matches the opened URL's route segment**: the shell shows its own fallback; no member mounts. This is the shell's own routing behavior, not a runtime guarantee this PRD or the runtime makes.
- **Two applied screen members declare the same `presentation.order` band, or declare routes where one is a proper prefix of the other**: nothing in the runtime arbitrates either collision; both are documented, review-enforced conventions rather than mechanically-checked invariants (§11).

## 9. Acceptance Criteria

- [ ] All five family directories carry their own template manifest, version line, and source-spec ref, independently applicable and independently releasable - verifiable via `cpt-frontx-workspace-templates-fr-independent-member-release`.
- [ ] Each of the five directories carries its own `frontx-template.json` from the commit that creates, renames, or relocates it, and is discovered as a template by manifest presence alone - verifiable via `cpt-frontx-workspace-templates-fr-registry-parity`.
- [ ] Each member release is published as a `<template>/v<semver>` git tag, and after any one member's release every other member's already-published source-spec resolves to the content it resolved to before - verifiable via `cpt-frontx-workspace-templates-fr-per-member-release-ref`.
- [ ] Every member's template-manifest description names the unit it contributes, and every screen member's description states that it is usable as a plain React component or wrapped by `template-mfe`, and its precondition on `template-workspace` when wrapped - verifiable via `cpt-frontx-workspace-templates-fr-manifest-description-precondition`.
- [ ] Every screen member renders as a plain React component in an application without microfrontends, carries no MFE manifest, no Module Federation build and no dependency on the microfrontend runtime, and states the presentation values its wrapped screen declares - verifiable via `cpt-frontx-workspace-templates-fr-mfe-agnostic-screen`.
- [ ] Every wrapped screen registers exactly one extension entry against the existing screen extension domain, with no new domain declared by the family - verifiable via `cpt-frontx-workspace-templates-fr-screen-domain-registration`.
- [ ] A screen member wrapped and applied after the shell was built is reachable by its own declared route without a shell rebuild - verifiable via `cpt-frontx-workspace-templates-fr-route-resolution`.
- [ ] No member's own source imports another member's source or package, or the shell's own application code, no member depends on a package published from another template's territory, and every member reads its endpoints through its own glue against `@gears-frontx/api` - verifiable via `cpt-frontx-workspace-templates-fr-no-cross-member-import`.
- [ ] On a cold load where only one member is routed, every applied member's own menu-chrome label renders in the shell's chosen language, with no member's remote fetched but the routed one's, and no member's translation bundle imported by the shell at build time - verifiable via `cpt-frontx-workspace-templates-fr-menu-label-dictionary`.
- [ ] A screen member's own internal UI copy resolves from its own local namespace, driven only by the current language it is given - verifiable via `cpt-frontx-workspace-templates-fr-internal-copy-i18n`.
- [ ] No template-manifest field added by this split classifies a template by kind - verifiable via `cpt-frontx-workspace-templates-nfr-no-kind-taxonomy`.
- [ ] No family directory's own payload is specified or scanned by the ecosystem repository's artifact tree, and no `@cpt-` marker inside one binds anything - verifiable via `cpt-frontx-workspace-templates-nfr-territory-exclusion`.

## 10. Dependencies

| Dependency | Description | Criticality |
|------------|-------------|-------------|
| `@gears-frontx/mfes` screen extension domain | The existing runtime capability this family composes on in the wrapped case; owns extension-domain governance and host-microfrontend communication generically. | p1 |
| `template-mfe` | The wrapper that turns a screen member into a microfrontend for the composed application: contributes the MFE package, its MFE manifest and its Module Federation build. Needed only in the wrapped case; a screen member rendered as a plain React component does not use it. | p1 |
| `@gears-frontx/gts-plugin` | Validates every extension entry and shared property the wrapped screens' MFE manifests declare, including each screen's own presentation block. | p1 |
| CLI's generic template mechanism | Source-spec resolution, manifest publication, and assembly-conflict prevention that every one of the five templates resolves through. | p1 |
| Domain-model mapping | File-level detail for the split, referenced rather than duplicated by this PRD ([mapping](../explorations/2026-09-02-workspace-template-domain-mapping.md)). | p2 |

## 11. Assumptions

- The open questions below come from the domain-model mapping this PRD is generated from, from this PRD's own scope boundary, and from the separation of feature templates from the microfrontend wrapper; each is marked open, resolved for v1, or deferred:
  - **Open - MF-host build-layer sourcing.** The shell needs a Module-Federation host layer, and it cannot come from a package another template publishes (`cpt-frontx-workspace-templates-fr-no-cross-member-import`), so `template-shell`'s own build export and the packages published from `template-shell/packages/` - `@gears-frontx/react` among them - are not options for it. Two remain, and this PRD does not choose between them: `template-workspace` carries the host layer as its own template content, copied like the rest of the template, or the parts of it that are framework-level come from a framework-level library of the FrontX ecosystem repository and the rest is carried by the template. Which parts are framework-level is for the maintainers to settle. A known conflict bears on the answer: `template-mfe`'s own MFE packages (`demo-mfe`, `_blank-mfe` and the two widgets fixtures) depend on `@gears-frontx/react` and on `@gears-frontx/frontx-template-shell`, both published from `template-shell`, so the wrapper this family relies on consumes another template's packages. Whether and how that changes is outside this family's scope and is not decided here.
  - **Open - endpoint-availability declaration.** Whether a wrapped screen's MFE manifest gets a way to declare a required shell-provided endpoint, enforced by the runtime's existing subset-admission check, is not decided here; today a version mismatch surfaces as a runtime 404 rather than a refused mount, and this PRD states no requirement that changes that.
  - **Resolved for v1 - per-screen API-glue duplication, standardization deferred.** Each screen member authors its own thin glue against `@gears-frontx/api` (rather than importing the shell's own `registry.ts`/`queries.ts`); this PRD requires that shape at §5.2 (`cpt-frontx-workspace-templates-fr-no-cross-member-import`). Whether that pattern should later be standardized so five templates stop independently reinventing it, and where, is not decided here and stays open. A template-level package such as `@gears-frontx/react`, published from `template-shell`, is used by its own template only, so a standard the five members share would have to be a framework-level library of the ecosystem repository.
  - **Deferred to a future ui-kit DESIGN; eventual placement unresolved.** Whether `PresenceAvatar`, `IdentityAvatar`, and `format.ts` move into `@gears-frontx/ui-kit` is a decision about the kit's own scope, owned by whoever authors the kit's own DESIGN; this PRD does not decide it.
  - **Open - component CSS through Module Federation, confirmed.** Whether component (not token) CSS reaches a shadow root through an actual Module-Federation build, rather than only through the in-repo fixture already proven, is not confirmed by this PRD; the domain-model mapping's own risk framing places this before the first screen member (contacts) is split, not after.
  - **Open - should this family's shell-screen contract become a first-class ecosystem concept?** This PRD and its DESIGN state a cross-template contract surface scoped to one family, authored in this repository under the latitude `cpt-frontx-adr-template-territory-traceability` leaves to the repository that publishes the templates, and ask nothing of the boundary that decision draws between ecosystem artifact and template territory. Whether a future co-authored template family's own shell-screen contract generically deserves recognition as a first-class ecosystem concept - which would mean moving that boundary rather than working inside it per-family, as this PRD does - is not decided here. The candidate resolution, if this proves needed, is an amendment to `cpt-frontx-adr-template-territory-traceability`; the ecosystem repository's maintainers own that decision.
  - **Open - where a screen member states its presentation values, and how the wrapping step reads them.** This PRD requires each screen member to state the values its wrapped screen declares (§5.2) but not where: in the member's own AI guidelines or skills, in a data file the wrapping step reads, or in a ready wrapper the member ships beside its feature. The MFE-package scaffolding `template-mfe` offers today targets `template-shell`'s layout (`src-app/`), and whether it wraps a screen member into a project `template-workspace` establishes, unchanged, is not verified.
  - **Open - the chat member's scope and name.** Whether `template-workspace-chat` is also the chat feature template a console outside this family composes is not settled anywhere, and is for the maintainers to decide, together with whether it keeps the family prefix or is named for its feature alone, as `template-chat`; the same question applies to the other three screen members once one is offered outside this family.
- Order-band and prefix-free-route-set obligations across independently-versioned screen members are documented conventions this PRD states (§5.2) and a review obligation on each Screen Template Developer; neither is a runtime-enforced or mechanically-checked invariant, because `presentation.order` is a flat number across the whole domain and nothing in the runtime arbitrates a collision between two members claiming the same band, or a resolution ambiguity between two members whose declared routes are not prefix-free.
- Each of the five members may ship its own AI skills and guidelines under its own `.frontx/ai/` subtree, telling an agent how to work with and evolve that template; nothing in this PRD depends on what they say, and none is shared across members.
- In the wrapped case, every family member composes inside the same JavaScript realm and the same Module-Federation graph the runtime already governs; this PRD introduces no new isolation model and relies entirely on the runtime's existing one.

## 12. Risks

| Risk | Impact | Mitigation |
|------|--------|------------|
| A new family directory is created without its own `frontx-template.json`. | The directory is not a template as far as this repository is concerned: template discovery does not find it, and every guard that walks discovered templates skips it silently rather than failing on the change that caused it. | The manifest-presence obligation (`cpt-frontx-workspace-templates-fr-registry-parity`) states the requirement at the family's own altitude, in the same commit as each directory's own creation. |
| Two independently-versioned screen members declare the same order band, or declare routes where one is a proper prefix of the other (`/mail` and `/mailbox`, for instance). | The shell's icon-rail ordering becomes ambiguous between the two members with the same band, or the shell's route resolution has no defined match for a URL under the shorter prefix, with no runtime error surfaced either way. | The order-band convention (§5.2) and the prefix-free route-set obligation (§5.2) state both as review obligations; not resolved by a runtime guard in this pass. |
| A screen member is wrapped into a microfrontend in a project that has no `template-workspace`. (A screen member used as a plain React component without the shell is a supported case, not this risk.) | The apply and the wrapping succeed: the manifest declares no requirement on the shell, and the conflict check arbitrates contested ground rather than absent ground, so the member's files are written and its subtree claimed with no problem reported. The wrapped screen's extension finds no screen extension domain to be admitted into, and the screen is absent from the running application - the failure surfaces where the content runs, not where it was applied. | The precondition is stated in the member's own template-manifest description, which is the one place `cpt-frontx-adr-template-manifest-contract` as amended leaves for it (`cpt-frontx-workspace-templates-fr-manifest-description-precondition`); nothing mechanical catches it, and that record's own reopening criterion - a runtime enforcement shown to surface the incompatibility too late to act on - is what would change that. |
| `lucide-react` sits at two different major lines across the family's own dependency graph, and every ecosystem-package pin bump now touches five `package.json` files instead of two. | A future kit-icon change is not guaranteed to be observed by a screen member that pins its own copy; pin-bump review cost is multiplied by five. | Not addressed by this PRD; the pin-drift guard catches an inconsistency once it exists but does not reduce the number of files a bump touches, and the version-surface fact predates this split. |
| A member, or a wrapped screen's MFE package, ends up depending on a package published from another template's territory, the way `template-mfe`'s own MFE packages depend on `template-shell`'s packages. | The member's release is coupled to another template's, and a vendor that forks the member cannot change that package. The pin-drift guard compares every discovered template's ecosystem-package pins against the packages published from the ecosystem repository only, so a drift on such a package is not caught by the mechanism that catches every other pin. | `cpt-frontx-workspace-templates-fr-no-cross-member-import` forbids it for the members. How the shell's MF-host layer is sourced instead, and the existing dependency of `template-mfe`'s packages, stay with the MF-host sourcing question (§11). |
| Component CSS reaching a shadow root through an actual Module-Federation build has not been traced, only the token path and an in-repo fixture. | If component CSS does not reach the shadow root the way the fixture suggests, the first screen member split (contacts) discovers this only after the split rather than before. | Confirm before contacts is split, per the domain-model mapping's own sequencing risk (§11, Open - component CSS confirmation). |
