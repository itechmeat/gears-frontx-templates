---
status: accepted
version: 1
priority: p1
date: 2026-11-09
decision-makers: template-dashboard architecture maintainers
description: "Decision record for where the dashboard's look comes from and how a theme change reaches every widget: the host theme and language shared properties, whose values the host supplies, published unchanged by the dashboard root, with @gears-frontx/ui-kit in every widget and chart colours taken from the kit's chart tokens of the active scope."
---

# ADR-0006: Theme distribution

**ID**: `cpt-frontx-dashboard-adr-theme-distribution`

<!-- toc -->

- [Context and Problem Statement](#context-and-problem-statement)
- [Decision Drivers](#decision-drivers)
- [Considered Options](#considered-options)
- [Decision Outcome](#decision-outcome)
  - [Consequences](#consequences)
  - [Confirmation](#confirmation)
- [Pros and Cons of the Options](#pros-and-cons-of-the-options)
  - [Host theme and language shared properties used unchanged, with ui-kit in every widget](#host-theme-and-language-shared-properties-used-unchanged-with-ui-kit-in-every-widget)
  - [Template-owned theme instance with light and dark palettes](#template-owned-theme-instance-with-light-and-dark-palettes)
  - [Theme instance supplied by the backend and referenced by the dashboard](#theme-instance-supplied-by-the-backend-and-referenced-by-the-dashboard)
  - [Pre-generated CSS and chart theme JSON supplied by a backend](#pre-generated-css-and-chart-theme-json-supplied-by-a-backend)
  - [Separate theme bundle delivered as its own artifact](#separate-theme-bundle-delivered-as-its-own-artifact)
- [More Information](#more-information)
- [Traceability](#traceability)

<!-- /toc -->

## Context and Problem Statement

A dashboard must render in a light and in a dark theme, follow the host's theme, and look like the rest of the host application (`cpt-frontx-dashboard-fr-theme`, `cpt-frontx-dashboard-nfr-visual-quality`). The template's UI is spread over isolated widget instances the dashboard root mounts in one `widgets` domain, including the larger view. FrontX isolates every widget instance (FrontX ADR-0011), so no theme object or style code is held in common between them, and each chart widget evaluates its own copy of Recharts ([ADR-0004](0004-charting-library-v1.md)).

The host already supplies theme and language values. The FrontX design system `@gears-frontx/ui-kit` provides components and tokens in a light and a dark scope. The dashboard arrives as one JSON and carries no theme.

Assumption: FrontX defines the types of its theme and language shared properties. It does not define them yet; this is a FrontX prerequisite listed in DESIGN §3.1.

Where does the dashboard's look come from, how does a theme reach every widget, including the larger view, and how does a theme switch reach them without a reload?

## Decision Drivers

* The template has no theme of its own: the dashboard follows the host's light or dark value and uses the host's design-system look (`cpt-frontx-dashboard-fr-theme`).
* The host supplies the theme and language values; the template takes them as given.
* One theme input that reaches every widget, including the larger view.
* Per-instance isolation: each widget styles itself, and each chart widget takes its colours from the kit tokens of its own scope.
* A theme switch reaches every mounted widget and an open larger view without a reload, without re-running any binding and without showing loading states again.
* As few template-owned contracts as possible: every GTS type the template owns must be versioned and frozen.

## Considered Options

* Host theme and language shared properties used unchanged, with ui-kit in every widget
* Template-owned theme instance with light and dark palettes
* Theme instance supplied by the backend and referenced by the dashboard
* Pre-generated CSS and chart theme JSON supplied by a backend
* Separate theme bundle delivered as its own artifact

## Decision Outcome

Chosen option: "Host theme and language shared properties used unchanged, with ui-kit in every widget", because it gives the dashboard the host's look, reaches every widget through the standard FrontX shared-property channel, adds no template-owned theme contract, and needs no backend support.

The decision has these parts:

1. **One theme input.** The template's only theme input is the host theme value, which the host supplies. The template uses it unchanged. The `widgets` domain shares it through the FrontX theme and language properties hosts already use (`gts.frontx.mfes.comm.shared_property.v1~frontx.mfes.comm.theme.v1~` and `…~frontx.mfes.comm.language.v1~`); the template refers to these ids and carries a minimal schema for each, which the root registers only when its type store has none under that id.
2. **Delivery to every widget.** The dashboard root publishes the theme and language with `updateSharedProperty` on every mount, before any cell mounts, and republishes them on every change. `updateSharedProperty` validates the value against the property type. FrontX refers to these ids but does not define their types, which is a FrontX prerequisite listed in DESIGN §3.1, so the template's minimal schema (a non-empty string `value`, derived from the FrontX shared-property base) stands in for each, and a schema already in the root's type store under that id is kept. It reaches every widget in the root's registry that declares the property. FrontX does not replay updates when a bridge is reactivated, so widgets read `getProperty` on mount. The larger view is a widget instance in the same domain, so it receives them the same way.
3. **The look comes from ui-kit.** Every widget uses `@gears-frontx/ui-kit`. The kit has two scopes, light and dark, and the host theme maps onto one of them. Each widget maps the host theme id to one of the two scopes; an unknown id gives light. Every color, font and spacing value comes from kit tokens of that scope, and no widget carries manual styling.
4. **Chart colours in each chart widget.** Each chart widget draws with the ui-kit chart component, whose series colours, grid lines, axes, tooltip and legend are kit tokens of the active scope (`--chart-1` to `--chart-5` for the series). Nothing is built or registered per theme ([ADR-0004](0004-charting-library-v1.md)).
5. **Theme switch.** A theme switch is a shared-property change only. The host updates the property; the dashboard root republishes it; each widget selects the new kit scope, and the chart colours follow it through the kit's custom properties. A theme change never re-runs any binding or remounts anything (`cpt-frontx-dashboard-fr-theme`).
6. **No template theme.** The template defines no theme type, no theme instance, no palettes or row tints, no theme-id-to-mode map, and no CSS-variable projection. The dashboard references no theme.

### Consequences

* Good, because the dashboard looks like the host application; there is no second look to keep in step with the host's design system.
* Good, because one input reaches every widget, including the larger view, through the same FrontX channel.
* Good, because the template owns no theme contract: no type to version and freeze, no instance to validate, and nothing in the dashboard.
* Good, because a theme switch is a property change: no reload, no request and no loading states.
* Good, because the dashboard root has no chart library dependency; charts live only in chart widgets.
* Bad, because a product cannot give the dashboard a look of its own that differs from the host's design system, and all dashboards share that look.
* Bad, because chart colors are limited to what the kit tokens offer in each scope.
* Bad, because every widget repeats the scope mapping. Mitigation: it is one small helper per package, and the per-instance cost is minor next to evaluating the widget's libraries.
* Bad, because the dark-theme set is enumerated per helper, and it must gain an entry when the host adds a dark theme. Mitigation: each package keeps the set in one place, so a new host dark theme is one edit per package.
* Bad, because themes beyond light and dark fold into one of the two scopes, so a host theme that is neither is not shown distinctly.
* Bad, because an unknown theme id falls back to the light scope.
* Neutral, because every widget evaluates its own copy of the kit (FrontX ADR-0011); the kit is a shared dependency, so its source text is fetched once only when every template widget publishes the same `contentHash` for it (FrontX ADR-0034), with realm-wide reach (FrontX ADR-0035), and it is counted once in the page total ([ADR-0010](0010-template-packages-and-host-contract-v1.md)).

### Confirmation

Confirmed by design review, tests and inspection:

* Design review finds no theme type, theme instance, palette, row tint, or theme-id map in the template packages, and no theme field in the dashboard types.
* A test checks that the dashboard root publishes the theme and language on every mount and republishes them on every change.
* A test checks that a widget in the larger view follows a light and dark switch while the larger view is open.
* A test checks that every widget selects the kit's light or dark scope for each host theme value, and that an unrecognised id selects light.
* A test checks that each chart widget paints its series with the kit's chart tokens and restyles on a theme change with no request.
* A dependency check finds no chart library dependency in the dashboard root package.
* A test switches the theme on the open reference dashboard and checks that no binding re-runs, no loading state is shown again, and the dashboard position and an open larger view are kept.
* Design inspection of all widget types in both scopes, in a cell and in the larger view, against the design-system reference.

## Pros and Cons of the Options

### Host theme and language shared properties used unchanged, with ui-kit in every widget

The template takes the theme and language the host supplies and forwards them unchanged. Every widget maps the theme to the kit's light or dark scope and styles itself with kit tokens; chart widgets take their colours from the same tokens.

* Good, because the look is the host's, in both modes, with nothing template-specific to maintain.
* Good, because every widget, including the larger view, uses the same FrontX channel.
* Good, because it adds no GTS contract and needs no backend.
* Neutral, because every widget carries a small scope-mapping helper.
* Bad, because a template-specific or per-dashboard look is not possible.
* Bad, because the helper knows only the light and dark kit scopes, so a host theme beyond them folds into one of the two.

### Template-owned theme instance with light and dark palettes

The template ships a GTS theme instance with a light and a dark palette, chart defaults and row tints, and projects it to CSS variables in the dashboard root.

* Good, because the template controls its look independently of the host.
* Bad, because the dashboard would have a second look next to the host's design system, which the PRD rules out.
* Bad, because it adds a theme type and instance that must be versioned, validated and frozen, and a mode map that every product must extend for its host themes.

### Theme instance supplied by the backend and referenced by the dashboard

The dashboard instance refers to a theme instance that the backend supplies with the dashboard.

* Good, because each dashboard could carry its own look.
* Bad, because every product backend must store and serve a theme, although the look belongs to the host's frontend.
* Bad, because a missing or broken theme reference needs a fallback and a diagnostic path.

### Pre-generated CSS and chart theme JSON supplied by a backend

A backend resolves the theme into CSS and a chart theme in JSON and sends both.

* Good, because the dashboard root would only apply what it receives.
* Bad, because the theme would exist in several formats that must be kept in step with the host's design system.
* Bad, because it adds a request and a failure path to something the host already provides.

### Separate theme bundle delivered as its own artifact

The theme is a standalone artifact, fetched apart from the template's code.

* Good, because the theme could change without a template release.
* Bad, because it duplicates what the host's theme and the kit already provide.
* Bad, because it adds a fetch and a second failure point.

## More Information

* Related ADRs: [ADR-0004](0004-charting-library-v1.md) (each chart widget takes its colours from the kit's chart tokens), [ADR-0007](0007-extension-domain-taxonomy-v1.md) (the `widgets` domain shares theme and language), [ADR-0010](0010-template-packages-and-host-contract-v1.md) (the theme and language shared properties in the host contract; shared dependencies and the budget basis).
* Review trigger: revisit if the host's theme value changes its meaning, if the kit's scope model changes, if products need a dashboard look that differs from the host's design system, or if FrontX stops isolating widget instances (FrontX ADR-0011).
* Scope: decides the theme input, how it reaches every widget, where the look comes from, and how a theme switch propagates. The kit's tokens and the host's theme catalog are owned by FrontX. The exact scope mapping is specified in the FEATURE documents.
* Checklist applicability: ARCH applicable; PERF applicable (the theme needs no request, a switch needs no reload); SEC N/A; REL applicable (the theme has no network failure path); DATA N/A; INT applicable (the host's theme shared property is the contract with the host and with every widget); OPS N/A; MAINT applicable (the scope mapping is one helper per package); TEST applicable; COMPL N/A; UX applicable (the host's look in both modes, the same look in the larger view, and live switching); BIZ N/A.

## Traceability

- **PRD**: [PRD.md](../PRD.md)
- **DESIGN**: [DESIGN.md](../DESIGN.md)

This decision directly addresses the following requirements or design elements:

* `cpt-frontx-dashboard-fr-theme` — the dashboard follows the host's light or dark theme and the host's design-system look, and a switch reaches every widget and the larger view without a reload and without re-running any binding.
* `cpt-frontx-dashboard-nfr-visual-quality` - every widget styles itself with ui-kit tokens of one scope, and charts use the kit's chart tokens of the same scope.
* `cpt-frontx-dashboard-interface-contract` — the domain model has no theme type, and the dashboard references no theme.
* `cpt-frontx-dashboard-contract-host` — the host supplies the theme and language values.
