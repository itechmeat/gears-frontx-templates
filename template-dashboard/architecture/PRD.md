---
status: accepted
version: 1
date: 2026-10-31
description: Product requirements for the dashboard template - a declarative, backend-agnostic dashboard where a dashboard author writes one JSON per dashboard, a widget author adds or fixes a widget type at runtime without a product redeploy, and a dashboard viewer reads a dashboard whose widgets map data through a binding the author wrote.
---

# PRD — Dashboard Template

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
  - [5.1 Viewing Dashboards](#51-viewing-dashboards)
  - [5.2 Widgets and Presentation](#52-widgets-and-presentation)
  - [5.3 Authoring Dashboards and Widgets](#53-authoring-dashboards-and-widgets)
- [6. Non-Functional Requirements](#6-non-functional-requirements)
  - [6.1 NFR Inclusions](#61-nfr-inclusions)
  - [6.2 NFR Exclusions](#62-nfr-exclusions)
  - [6.3 Limitations and Known Gaps](#63-limitations-and-known-gaps)
- [7. Public Library Interfaces](#7-public-library-interfaces)
  - [7.1 Public API Surface](#71-public-api-surface)
  - [7.2 External Integration Contracts](#72-external-integration-contracts)
- [8. Use Cases](#8-use-cases)
  - [View a Dashboard](#view-a-dashboard)
  - [Ship a New or Fixed Widget Type](#ship-a-new-or-fixed-widget-type)
  - [Author a Dashboard](#author-a-dashboard)
  - [Adopt the Template in a Product](#adopt-the-template-in-a-product)
- [9. Acceptance Criteria](#9-acceptance-criteria)
- [10. Dependencies](#10-dependencies)
- [11. Assumptions](#11-assumptions)
  - [11.1 Open Questions](#111-open-questions)
- [12. Risks](#12-risks)

<!-- /toc -->

## 1. Overview

### 1.1 Purpose

`template-dashboard` is a declarative, backend-agnostic dashboard template. A **dashboard author** writes one JSON to draw a dashboard, with no product code. A **widget author** adds or fixes a widget type at runtime, without a product redeploy. A **dashboard viewer** reads a dashboard whose widgets map data through a binding the author wrote.

The template is a blueprint a product copies into any host application. It depends on its own runtime packages only, never on a host or shell template. Where it is copied and how a product signs in are the product's choices and out of scope.

The template provides three things. The first is the **dashboard root**, which renders a dashboard from its JSON. The second is a **widget catalog** of ready-to-use widget types. The third is the **dashboard and widget contract**, the published shapes a dashboard author and a widget author write against.

### 1.2 Background / Problem Statement

Teams that build cloud-project applications often need dashboards: summary cards, grids and charts that show how a project is going. Each team builds these screens from scratch. The result is many one-off dashboards with different layouts, different visual quality, and new fetch-and-shape code for each set of data.

This template lets a dashboard author draw a dashboard by writing one JSON, and lets a widget author add or fix a widget type as a separately shipped widget that the dashboard root loads at runtime. The product writes no data code: each widget's data is a binding the author wrote into the dashboard JSON, and the dashboard root runs it against the product's API.

### 1.3 Goals (Business Outcomes)

- A dashboard author gets a complete dashboard from one JSON, with no chart, grid or fetch code.
- A widget author adds a new widget type, or fixes an existing one, at runtime, without a product redeploy; a fix takes effect on the next page load.
- A dashboard viewer sees a complete dashboard within the initial render target (`cpt-frontx-dashboard-nfr-initial-render`), with clear feedback while a widget loads, when it has no data, and when it cannot be shown. A widget that cannot be shown does not affect the other widgets.
- The product writes no data code. Each widget's data is a binding the author wrote, run against the product's API, with the response turned into the widget's data by an expression the author wrote.
- The template is hosting-agnostic: a product copies it into a single-page application or into a host that runs a screen, with no restriction.

Business success metrics are not set at template level. The template is a building block, and adoption is measured by the products.

### 1.4 Glossary

| Term | Definition |
|------|------------|
| Dashboard | A set of widgets laid out on a grid, written as one JSON. |
| Dashboard author | A person who writes a dashboard JSON. |
| Widget | A single dashboard element such as a card, a grid or a chart. The template ships a catalog of widget types. |
| Widget author | A person, or an automated tool, that adds or fixes a widget type at runtime. |
| Product developer | A developer on a product team who copies the template into a host application and owns the product's copy of it. |
| Widget type | A kind of widget: the presentation settings it accepts, its data shape, and the widget that shows it. |
| Widget instance | One widget placed in a dashboard cell, with its presentation settings and, for a data widget, its binding. |
| Binding | Where a data widget's data comes from, and an expression that turns it into the widget's data. The data comes from a request of the widget's own, from a request the dashboard declares once and shares between several widgets, or from values written into the dashboard with no request. The binding is plain data, part of the dashboard JSON. |
| Dashboard root | The part of the template that renders a dashboard from its JSON and runs every widget's binding. |
| Widget catalog | The set of widget types the template ships. |
| Dashboard and widget contract | The published shapes a dashboard author and a widget author write against. |
| Host application | The application the template is copied into. It supplies a container, a dashboard id, and the theme and language values. |
| Larger view | A second widget instance the dashboard defines for a cell, shown in an overlay over the dashboard. It is independent of the cell widget. |
| Runtime-loaded JSON | The JSON the dashboard root reads at runtime for the widget types, data types and dashboards. A product may serve its own. |
| p95 | The 95th percentile: 95% of measured cases are at or below the stated value. |

## 2. Actors

### 2.1 Human Actors

#### Dashboard Author

**ID**: `cpt-frontx-dashboard-actor-dashboard-author`

**Role**: Writes a dashboard as one JSON: a title, cells on the grid, and in each cell a widget instance with its presentation settings and, for a data widget, its binding. May write by hand or generate the JSON. Assumed skill: can write JSON and simple expressions that pick and rename fields in a JSON answer; needs no front-end coding skill.

**Needs**: The widget catalog, which documents each widget type's presentation settings and data shape. Author guides aimed at the dashboard author's job.

#### Widget Author

**ID**: `cpt-frontx-dashboard-actor-widget-author`

**Role**: Adds a new widget type or fixes an existing one at runtime, by shipping a widget and registering its type and how the dashboard root loads it. Assumed skill: a front-end developer who can build, test and ship a web component.

**Needs**: The widget contract: the presentation settings and data shapes to derive from, the one action the widget renders, how to declare how the dashboard root loads the widget, and the rules a widget must follow (theming, accessibility, no requests). Author guides aimed at the widget author's job.

#### Dashboard Viewer

**ID**: `cpt-frontx-dashboard-actor-dashboard-viewer`

**Role**: An end user who opens a dashboard to understand the state of a project. Assumed skill: a general user of the host application; needs no training to read a dashboard.

**Needs**: Fast, readable dashboards. Sorting a grid and paging it. Opening and closing a larger view where the dashboard defines one. Clear feedback while a widget loads, when it has no data, and when it cannot be shown. A dashboard that follows the host's light or dark theme.

#### Product Developer

**ID**: `cpt-frontx-dashboard-actor-product-developer`

**Role**: A developer on the product team that adopts the template. Copies the template into a host application, places the dashboard root, and configures the product's API setup in the product's copy. Serves the product's copy of the runtime-loaded JSON, and may point a template widget type to the product's own widget there. Checks generated dashboards before serving them. Assumed skill: a front-end developer who knows the host application.

**Needs**: The author guides, the dashboard and widget contract, and a clear list of what the host and the product must provide.

### 2.2 System Actors

#### Consuming Backend

**ID**: `cpt-frontx-dashboard-actor-consuming-backend`

**Role**: The product's backend. A widget's binding calls it by a path the author wrote. It owns authentication, authorization, errors and access for every request. The template never signs in and never carries credentials. It, or another source the product chooses, also serves the runtime-loaded JSON and the widget code.

#### Host Application

**ID**: `cpt-frontx-dashboard-actor-host-application`

**Role**: The application the template is copied into. It supplies a container for the dashboard root, a dashboard id (for example from its route), and the theme and language values.

## 3. Operational Concept & Environment

### 3.1 Module-Specific Environment Constraints

- The template is copied into a host application and depends on its own runtime packages only. It does not depend on a host or shell template.
- The template runs in a host that supplies a container, a dashboard id, and the theme and language values.
- Sign-in and request authentication are out of scope. Each request a binding makes is authenticated by the product's API setup; the template carries no credentials. The product configures its API setup in its own copy of the template; a single-page host may share the host's setup, a separately loaded screen configures its own.

## 4. Scope

### 4.1 In Scope

- The dashboard root, which renders a dashboard from its JSON, runs every widget's binding, and owns the cell frame, the larger-view overlay and failure handling.
- The widget catalog of ready-to-use widget types.
- The dashboard and widget contract: the published shapes a dashboard author and a widget author write against.
- A binding per data widget, written into the dashboard JSON: where the data comes from (a request of the widget's own, a request the dashboard declares once for several widgets, or values written into the dashboard with no request) and an expression that turns it into the widget's data.
- Adding or fixing a widget type at runtime, without a product redeploy; a fix takes effect on the next page load.
- A larger view where the dashboard defines one, shown in an overlay the template owns.
- Light and dark theme, following the host's values.
- Grids that the viewer can sort and page, client-side, over the rows the expression delivered.
- Per-cell failure: a widget that fails affects only its cell or larger view.

### 4.2 Out of Scope

- Sign-in and request authentication. They belong to the product's API setup.
- The product's API, backend and data. The template calls the paths the author wrote; it owns no backend.
- Dashboard authoring UI. A dashboard is a JSON file; an editor is the product's choice.
- Generating dashboards. Generation is the product's job; the template treats generated and hand-written dashboards the same.
- Report generation and download.
- A frontend gateway.
- Defining new widget types from the dashboard JSON. A widget type is shipped and registered, not written inline.
- Filters that apply to the whole dashboard and that the viewer changes, and searching of any kind.
- Grouping chosen by the viewer. Grouped column headings the dashboard specifies are in scope.
- Refreshing a dashboard or its data on its own while it is open. To see newer data, the viewer reloads the page.
- A way to shorten or hide widget content on the dashboard.
- Saving any viewer state (see `cpt-frontx-dashboard-nfr-no-persistence`).
- Drilling down from one widget to another, and moving between items.
- Dependent requests and joins across services. They are the backend's job.
- Dashboard visibility, publication, sharing and audience settings.

## 5. Functional Requirements

### 5.1 Viewing Dashboards

#### Dashboard Root

- [ ] `p1` - **ID**: `cpt-frontx-dashboard-fr-dashboard-root`

The system **MUST** provide the dashboard root, wherever the host places it. The dashboard root **MUST** render the dashboard the host's dashboard id identifies, from its JSON. Dashboards open at the same time **MUST** each show only their own content.

**Rationale**: The dashboard root is the starting point for everything else in the template.

**Actors**: `cpt-frontx-dashboard-actor-dashboard-viewer`, `cpt-frontx-dashboard-actor-host-application`

#### Runtime Source

- [ ] `p1` - **ID**: `cpt-frontx-dashboard-fr-runtime-source`

The widget types, data types, widget instances and dashboards **MUST** be read at runtime, never baked in at build time. In v1 they come from a JSON file served as if from a backend; a product may serve its own. The dashboard root **MUST NOT** depend on where the file comes from.

**Rationale**: A widget author adds or fixes a widget type by changing what is served, with no product rebuild.

**Actors**: `cpt-frontx-dashboard-actor-widget-author`, `cpt-frontx-dashboard-actor-product-developer`, `cpt-frontx-dashboard-actor-consuming-backend`

#### Per-Cell Failure

- [ ] `p1` - **ID**: `cpt-frontx-dashboard-fr-per-cell-failure`

A failure **MUST** affect only its own scope. A widget that fails its own validation, request, expression, data validation, registration or mount **MUST** fail only its cell or larger view. A failure of the dashboard itself is dashboard-level. The other widgets **MUST** be unaffected.

**Rationale**: A dashboard is a set of independent widgets; one bad widget must not break the rest.

**Actors**: `cpt-frontx-dashboard-actor-dashboard-viewer`

#### Loading, Empty and Cannot-Be-Shown States

- [ ] `p1` - **ID**: `cpt-frontx-dashboard-fr-states`

The system **MUST** show every state by what the viewer sees:

- **Loading.** The dashboard area shows a loader until the dashboard arrives. A data widget whose data comes from a request shows a loader until its data arrives. A data widget whose data is written into the dashboard, and a widget with no binding, show their content at once.
- **Shown.** A data widget shows everything its binding defines, with nothing shortened or hidden. A widget with no binding shows its own content.
- **Empty.** When a data widget's data is valid and empty, the widget shows its own empty state.
- **Cannot be shown.** At the dashboard level, the dashboard is replaced when the runtime-loaded JSON or the dashboard cannot be fetched or read, including a request that never answers; when it fails a dashboard check (`cpt-frontx-dashboard-fr-dashboard-as-json`); when a type that comes with it cannot be accepted; or when no dashboard matches the requested id. At the cell or larger-view level, that cell or larger view is replaced when its widget fails a widget check (`cpt-frontx-dashboard-fr-dashboard-as-json`), when the request fails, when the response is larger than the response-size cap, when the expression fails, when the data fails validation (including grid data with more rows than the row cap), or when the widget fails to load. A widget that cannot draw the valid data it receives shows its own cannot-be-shown state in its area, and the other widgets are unaffected. Data over a cap is never shown in part.

The template **MUST** show no wrong or misleading content at any time.

**Rationale**: Loading can take time and a dashboard or widget can be invalid. Viewers must always know which state they see, and where.

**Actors**: `cpt-frontx-dashboard-actor-dashboard-viewer`, `cpt-frontx-dashboard-actor-consuming-backend`

#### Same-Origin Data

- [ ] `p1` - **ID**: `cpt-frontx-dashboard-fr-same-origin-data`

Every request a binding makes **MUST** go to a same-origin absolute path, using only the request forms the contract defines in the DESIGN. The template **MUST** reject any other target before the request is sent.

**Rationale**: Dashboard sources are trusted and product-controlled. The template does not call third parties from a dashboard.

**Actors**: `cpt-frontx-dashboard-actor-dashboard-author`, `cpt-frontx-dashboard-actor-product-developer`, `cpt-frontx-dashboard-actor-consuming-backend`

### 5.2 Widgets and Presentation

#### Widget Catalog Coverage

- [ ] `p1` - **ID**: `cpt-frontx-dashboard-fr-widget-catalog`

The system **MUST** ship a widget catalog of ready-to-use widget types, grouped by purpose:

- Cards: summary card, metric card, ranked list card, progress list card, markdown card.
- Data: grid.
- Charts: cartesian chart, pie chart, heatmap.

Each type **MUST** be usable on its own in any dashboard, with no widget code from the product. A widget type **MUST NOT** fix the meaning of its presentation settings, so a dashboard author can use it with data from any subject area. The final parameters and data shapes per type are defined in the widget catalog.

The widget types **MUST** support the following per-type capabilities:

- **Grid.** Frozen leading columns that stay visible while the viewer scrolls sideways. Grouped column headings. Column alignment. Row colouring as the dashboard specifies: the dashboard assigns each coloured row a colour meaning from a defined set, and the row colours adapt to the host's light or dark theme with readable contrast. A cell value may be a link that opens in a new tab. A column may keep one line per cell, with the full value still readable.
- **Ranked list card.** A secondary value next to each item's main value.
- **Progress list card.** The current value of each item against its target.
- **Cartesian chart.** Several series, on one or two y axes; values written on bars; a named line such as a target.
- **Cartesian chart and pie chart.** Optionally, a view of the delivered values as a table, opened from the chart or from a click on one of its marks, with that mark's row picked.
- **Metric card.** A trend of the value against the previous period.

Grid cells are text or links: no badges or sparklines.

**Rationale**: A complete, subject-neutral catalog lets dashboard authors build dashboards without chart or grid code.

**Actors**: `cpt-frontx-dashboard-actor-dashboard-author`, `cpt-frontx-dashboard-actor-dashboard-viewer`, `cpt-frontx-dashboard-actor-product-developer`

#### Grid Sort and Page

- [ ] `p1` - **ID**: `cpt-frontx-dashboard-fr-grid-sort-page`

The grid **MUST** sort and page client-side over the rows the expression delivered. The expression output **MUST** have a row cap. The grid **MUST** always page, with a largest page size defined in the widget catalog.

**Rationale**: A viewer needs to look through a long table in an order they choose, without the backend answering again.

**Actors**: `cpt-frontx-dashboard-actor-dashboard-viewer`

#### Larger View

- [ ] `p1` - **ID**: `cpt-frontx-dashboard-fr-larger-view`

A cell **MAY** define a larger view: a second widget instance shown in an overlay over the dashboard, with its own presentation settings and its own binding. A cell with a larger view **MUST** show a button that opens it; a cell without one **MUST** hide the button. The larger view **MUST** show the loading, empty and cannot-be-shown states like any widget. The overlay **MUST** be closable with a close button, with a click outside it, and with the Escape key, and **MUST** keep focus inside while open. Closing it **MUST** return the viewer to the unchanged dashboard. A page refresh closes any open overlay.

**Rationale**: Dense widgets need more room than a cell gives, and the dashboard may want to show something different there.

**Actors**: `cpt-frontx-dashboard-actor-dashboard-viewer`

#### Theme

- [ ] `p1` - **ID**: `cpt-frontx-dashboard-fr-theme`

The system **MUST** render the dashboard root, the widgets and the larger view in a light and in a dark theme. The template **MUST NOT** have a theme of its own: the dashboard **MUST** follow the host's light or dark value and the host's design-system look. When the host theme is switched, every shown widget and the larger view **MUST** switch to it without reload, without showing loading states again, and without re-running any binding. The viewer's position on the dashboard and an open larger view **MUST** be kept.

**Rationale**: Consistent theming keeps dashboards inside the look of the host application.

**Actors**: `cpt-frontx-dashboard-actor-dashboard-viewer`, `cpt-frontx-dashboard-actor-host-application`

#### Markdown Safety

- [ ] `p1` - **ID**: `cpt-frontx-dashboard-fr-markdown-safety`

The markdown card **MUST** show CommonMark as formatted text. It **MUST** show any HTML embedded in its text as plain text, never rendered. It **MUST** make a link active only when it leads to a web address, an email address or a relative address, and **MUST** show every other link as plain text. It **MUST** open a link so that the linked page cannot reach the dashboard. It **MUST** show an image only when it comes from the dashboard's own origin; any other image shows its description, or nothing.

**Rationale**: A markdown card must not place active content on a dashboard.

**Actors**: `cpt-frontx-dashboard-actor-dashboard-viewer`

#### Accessibility

- [ ] `p2` - **ID**: `cpt-frontx-dashboard-fr-accessibility`

Every widget and control **MUST** be operable with the keyboard alone. Every widget and control **MUST** be usable with a screen reader: each control exposes its name, role and state; a screen reader can tell when a widget is loading, empty or cannot be shown; charts and the heatmap offer a text alternative of the values they show. The larger view **MUST** take focus when it opens, keep it inside while open, and return it to the button that opened it when it closes. A widget **MUST NOT** convey meaning by color alone: row colors and chart series also differ in another visible way or are labelled.

**Rationale**: Dashboards are part of the host application and must be usable by the same people.

**Actors**: `cpt-frontx-dashboard-actor-dashboard-viewer`

#### Isolation

- [ ] `p1` - **ID**: `cpt-frontx-dashboard-fr-isolation`

One widget **MUST NOT** be able to change the state or behaviour of another widget, including another instance of the same widget type, or of the dashboard root. The time and memory widgets share are a known gap (section 6.3).

**Rationale**: Widgets are independently authored and shipped; isolation keeps them from breaking each other.

**Actors**: `cpt-frontx-dashboard-actor-widget-author`

### 5.3 Authoring Dashboards and Widgets

#### Dashboard as One JSON

- [ ] `p1` - **ID**: `cpt-frontx-dashboard-fr-dashboard-as-json`

A dashboard author **MUST** write a dashboard as one JSON: a title, cells on the grid, and in each cell a widget instance with its presentation settings and, for a data widget, its binding. The widget catalog **MUST** document each type's presentation settings and data shape. A product that generates dashboards **MUST** validate them against the registered types and the layout checks before serving them. The template **MUST** treat generated and hand-written dashboards the same.

The template **MUST** make these checks when it opens a dashboard:

- **Dashboard checks.** The dashboard follows the dashboard contract. Each cell names its size and height from the classes set in the DESIGN, and the cells are placed in the order the dashboard lists them, so no cell can overlap another or lie outside the grid. Every widget id in the dashboard is unique. Every type that comes with the dashboard in the runtime-loaded JSON can be accepted: a type cannot be accepted when it does not follow the dashboard and widget contract, or when it reuses the id of a base type the template provides. A failed dashboard check fails the whole dashboard. One type that cannot be accepted fails every dashboard read from the same runtime-loaded JSON.
- **Widget checks.** A widget instance's type is a registered widget type, and its presentation settings and binding match that type. A binding that uses a shared request names one the dashboard declares. A failed widget check fails only that cell or larger view.

**Rationale**: The whole surface for a dashboard author is one JSON and the catalog; no product code is needed.

**Actors**: `cpt-frontx-dashboard-actor-dashboard-author`, `cpt-frontx-dashboard-actor-product-developer`

#### Add or Fix a Widget Type at Runtime

- [ ] `p1` - **ID**: `cpt-frontx-dashboard-fr-add-fix-widget`

A widget author **MUST** be able to add a new widget type, or fix an existing one, at runtime, without a product redeploy. A fix released under the same widget type **MUST** take effect on the next page load. A product **MUST** be able to change which widget a template widget type points to, in its own copy of the runtime-loaded JSON.

**Rationale**: Widget fixes and additions must not wait for a product release.

**Actors**: `cpt-frontx-dashboard-actor-widget-author`, `cpt-frontx-dashboard-actor-product-developer`

#### No Product Data Code

- [ ] `p1` - **ID**: `cpt-frontx-dashboard-fr-no-product-data-code`

The product **MUST** write no data code for a dashboard. Each widget's data is a binding the author wrote into the dashboard JSON. The dashboard root **MUST** run the request against the product's API, evaluate the expression, validate the result, and pass it to the widget. Widgets **MUST NOT** make requests.

**Rationale**: A dashboard is data; the product supplies the API, not per-widget fetch code.

**Actors**: `cpt-frontx-dashboard-actor-dashboard-author`, `cpt-frontx-dashboard-actor-product-developer`, `cpt-frontx-dashboard-actor-consuming-backend`

#### Safe Mappings

- [ ] `p1` - **ID**: `cpt-frontx-dashboard-fr-safe-mappings`

A binding's expression **MUST** be evaluated against the parsed JSON response of its request, with no access to the host, the network, other widgets or any shared state. The template **MUST** cap the response size it accepts.

**Rationale**: A dashboard author and a widget author are trusted, but the template still keeps each mapping contained.

**Actors**: `cpt-frontx-dashboard-actor-dashboard-author`, `cpt-frontx-dashboard-actor-consuming-backend`

#### Shared Data

- [ ] `p1` - **ID**: `cpt-frontx-dashboard-fr-shared-data`

The system **MUST** fetch data shared by several widgets once per dashboard load. A dashboard author **MUST** be able to declare a request once and refer to it from several widgets; the dashboard root **MUST** send it once and give each widget its share of the response.

**Rationale**: When several widgets show data from the same source, fetching once keeps the dashboard fast and light on the API.

**Actors**: `cpt-frontx-dashboard-actor-dashboard-author`, `cpt-frontx-dashboard-actor-consuming-backend`

#### Static Data

- [ ] `p1` - **ID**: `cpt-frontx-dashboard-fr-static-data`

A data widget **MUST** be able to show data written into the dashboard JSON, with no request. The dashboard root **MUST** evaluate the widget's expression on those values and validate the result like fetched data.

**Rationale**: Some widgets show fixed reference data; fetching it would add a request for data that never changes.

**Actors**: `cpt-frontx-dashboard-actor-dashboard-author`

#### Author Guides by Audience

- [ ] `p2` - **ID**: `cpt-frontx-dashboard-fr-author-guides`

The template **MUST** ship an author guide for the dashboard author and one for the widget author. The dashboard-author guide **MUST** cover writing a dashboard JSON, the grid, the binding, the catalog, and the layout checks. The widget-author guide **MUST** cover deriving a widget type and its data type, building and shipping the widget, the one action it renders, how to declare how the dashboard root loads the widget, and the rules a widget must follow. Both guides **MUST** cover that the product owns dashboard and data size, that every viewer who may see a dashboard must be able to get its widgets' data, that the product's API owns errors and access, and what the host must provide. A product developer **MUST** be able to adopt the template using only the shipped guides. A dashboard author who has not used the template before **MUST** be able to write a first working dashboard from the dashboard-author guide in one working session. Both are verified by a walkthrough with someone who did not build the template.

**Rationale**: The two audiences have different jobs and need guides aimed at each.

**Actors**: `cpt-frontx-dashboard-actor-dashboard-author`, `cpt-frontx-dashboard-actor-widget-author`, `cpt-frontx-dashboard-actor-product-developer`

## 6. Non-Functional Requirements

### 6.1 NFR Inclusions

#### Visual Quality

- [ ] `p1` - **ID**: `cpt-frontx-dashboard-nfr-visual-quality`

The system **MUST** give all widget types one consistent look, in both light and dark themes.

**Threshold**: In design review, all widget types look consistent with the host application in both themes, with no widget styled on its own.

**Rationale**: Dashboards are decision tools, and visual quality shapes trust in the data.

**Verification Method**: Inspection against the design-system reference, in both themes.

#### Initial Render Latency

- [ ] `p1` - **ID**: `cpt-frontx-dashboard-nfr-initial-render`

The system **MUST** show the complete dashboard, with every data widget showing its data, within the threshold below, measured from the moment the viewer opens the dashboard.

**Threshold**: **Provisional.** Under 3 seconds at p95, including the evaluation of every widget. The reference conditions (reference device, network profile and reference dashboard) are fixed in the DESIGN. The threshold assumes the product's API answers within those reference conditions; the template is not held to backend latency beyond them. The figures are provisional and confirmed by measurement.

**Rationale**: A slow first view undermines the value of the dashboard.

**Verification Method**: Measured on the reference dashboard under the reference conditions.

#### Large Table Responsiveness

- [ ] `p2` - **ID**: `cpt-frontx-dashboard-nfr-large-table`

The system **MUST** keep one page of the grid widget, up to the row cap, rendering and scrolling smoothly.

**Threshold**: While a viewer scrolls a page of the grid widget, the view never stops responding for longer than 100 ms (provisional), under the reference conditions fixed in the DESIGN.

**Rationale**: A viewer scans a page of rows quickly, and a large page must not make the grid feel slow.

**Verification Method**: Measured by scrolling a capped page in the grid widget under the reference conditions.

#### Download Size Budget

- [ ] `p3` - **ID**: `cpt-frontx-dashboard-nfr-bundle-budget`

The system **MUST** keep the download size of the dashboard root and of each widget within a budget.

**Threshold**: **Provisional.** The dashboard root under 500 KB gzipped; each widget's own code under 100 KB. The figures are provisional and confirmed by measurement.

**Rationale**: A budget protects first-load time.

**Verification Method**: Analysis of download sizes measured as the DESIGN sets out.

#### Nothing Is Persisted

- [ ] `p1` - **ID**: `cpt-frontx-dashboard-nfr-no-persistence`

The template **MUST NOT** persist any state. No browser storage, no server.

**Rationale**: A dashboard is a read-only view; persistence is the product's job.

**Verification Method**: Inspection of the template packages for any storage use.

#### Accessibility Threshold

- [ ] `p2` - **ID**: `cpt-frontx-dashboard-nfr-accessibility`

The system **MUST** pass the host's accessibility checks for every widget type and the larger view, in both themes.

**Threshold**: 100% of widget types and the larger view pass the host's accessibility checks in both light and dark themes, verified by a keyboard-only walkthrough and a screen-reader walkthrough of the reference dashboard.

**Rationale**: Dashboards are part of the host application and must be usable by the same people, including keyboard and assistive-technology users.

**Verification Method**: A keyboard-only walkthrough and a screen-reader walkthrough of the reference dashboard, against the host's accessibility policy, in both themes.

### 6.2 NFR Exclusions

- Authentication, sessions and access rules: they belong to the host application and the product's API. The template carries no credentials and enforces no access rules of its own.
- Multi-tenant isolation, administration and dashboard-delivery availability: the template has no backend.
- Dashboard authoring and generation usability: authoring and generation are out of scope.
- On-prem and edge deployment portability: deployment belongs to the product.
- Safety and regulatory compliance: not applicable. The template is a read-only information UI.
- Privacy: no separate privacy NFR. The template adds no processing of personal data beyond what the product provides.
- Audit logging: not applicable at template level. The product owns audit.
- Internationalization and regional formats: inherited from the host. The template follows the host language value, and number and date formatting follow the host locale.
- Supported browsers and device support: inherited from the host application.
- Scalability and throughput: the template is a read-only view; concurrent-user and data-volume expectations belong to the host application and the product.
- Accessibility standard level: inherited from the host application's accessibility policy; the template targets the same conformance level as the host (see `cpt-frontx-dashboard-nfr-accessibility`).
- Monitoring and telemetry: not applicable at template level; the host and the product own observability.
- Recovery, backup and continuity: not applicable. The template persists nothing; a reload re-reads the runtime-loaded JSON.
- Support and diagnostics: product-owned. The template surfaces developer-facing diagnostics; the product owns support tiers and troubleshooting.

### 6.3 Limitations and Known Gaps

- **A request that never answers times out.** The timeout value is fixed in the DESIGN. A timed-out cell or larger view shows its cannot-be-shown state. When the runtime-loaded JSON or the dashboard times out, the dashboard shows its cannot-be-shown state.
- **One request per widget.** A widget has one binding; dependent requests and joins across services are the backend's job.
- **The grid sorts and pages client-side only.** It works on the rows the expression delivered, up to the row cap.
- **A theme change never re-runs a binding.** It restyles only; nothing is fetched or remounted.
- **The viewer's time zone is not sent.** Relative ranges resolve in the backend's time zone; a documented limitation.
- **A widget that blocks the main thread or leaks memory slows the dashboard root and the other widgets.** Widgets keep their state and behaviour apart, but they share the page's time and memory.
- **A widget that crashes without showing anything leaves its cell blank.** The dashboard cannot tell this apart from a widget that draws nothing; every other cell keeps working.
- **Grid cells are text or links.** A cell shows text or a link, with no badges or sparklines.
- **Column widths are set by the dashboard.** The viewer cannot resize grid columns.

## 7. Public Library Interfaces

The template publishes one public surface, its dashboard and widget contract. It has three integration contracts, listed in section 7.2: the host application supplies a container, a dashboard id, and the theme and language values; the product's API answers the requests bindings make; and the product serves the runtime-loaded JSON and the widget code.

### 7.1 Public API Surface

#### Dashboard and Widget Contract

- [ ] `p1` - **ID**: `cpt-frontx-dashboard-interface-contract`

**Type**: Data format

**Stability**: experimental

**Description**: The published shapes a dashboard author and a widget author write against: dashboards, cells, widget types, data types, widget instances, bindings, and the one action a widget renders. Its format and structure are defined in the DESIGN.

**Breaking Change Policy**: While it is experimental, changes are allowed and are announced in the template release notes; breaking changes are controlled and announced only when the Stability field says so.

### 7.2 External Integration Contracts

#### Host Container, Dashboard Id, Theme and Language

- [ ] `p1` - **ID**: `cpt-frontx-dashboard-contract-host`

**Direction**: required from client

**Protocol/Format**: Product-level need only: the host supplies a container for the dashboard root, a dashboard id, and the theme and language values. The technical form is defined in the DESIGN.

**Compatibility**: The template depends on its own runtime packages only; it does not depend on a host or shell template.

#### Same-Origin API

- [ ] `p1` - **ID**: `cpt-frontx-dashboard-contract-same-origin-api`

**Direction**: required from client

**Protocol/Format**: Product-level need only: the product's API answers the requests a binding makes, at same-origin absolute paths, using only the request forms the contract defines in the DESIGN. The product owns authentication, authorization, errors and access.

**Compatibility**: Follows the breaking change policy of `cpt-frontx-dashboard-interface-contract`.

#### Runtime-Loaded JSON and Widget Code

- [ ] `p1` - **ID**: `cpt-frontx-dashboard-contract-runtime-loaded-json`

**Direction**: required from client

**Protocol/Format**: Product-level need only: the product serves the runtime-loaded JSON, and the dashboard root reads it at runtime. It holds the widget types, the data types, the widget instances and the dashboards, and for each widget type where its widget code loads from. Widget authors add or fix widget types in it; the product owns its own copy and may point a template widget type to its own widget there. Each widget's code is served from where its widget type says, as the widget author shipped it. The format is defined in the DESIGN.

**Compatibility**: Follows the breaking change policy of `cpt-frontx-dashboard-interface-contract`. A fix under the same widget type keeps its presentation settings and data shape compatible; an incompatible change ships as a new version of the widget type.

## 8. Use Cases

### View a Dashboard

- [ ] `p2` - **ID**: `cpt-frontx-dashboard-usecase-view-dashboard`

**Actor**: `cpt-frontx-dashboard-actor-dashboard-viewer`

**Preconditions**:
- The host gives the dashboard root a container, a dashboard id, and the theme and language values.
- A dashboard JSON is served for that id, with widget types the runtime-loaded JSON registers.

**Main Flow**:
1. The viewer opens the dashboard, by its id.
2. The dashboard root shows a loader for the dashboard.
3. The dashboard root loads the runtime-loaded JSON and checks the dashboard.
4. Each cell mounts its widget, runs its binding, and shows its data, loading, empty or cannot-be-shown state.
5. The viewer sorts or pages a grid, or opens and closes a larger view, where the dashboard defines one.

**Postconditions**:
- The viewer sees the dashboard, with every widget in its own state.

**Alternative Flows**:
- **The dashboard itself fails**: the dashboard area shows the cannot-be-shown state.
- **A widget fails**: only that cell or larger view shows the cannot-be-shown state; the rest are unaffected.
- **A widget's data is empty**: the data is valid and has nothing in it; the widget shows its own empty state.
- **The viewer opens a larger view**: the overlay shows the larger view's widget, with its own loading, empty or cannot-be-shown state. The viewer closes it and is back on the unchanged dashboard.

### Ship a New or Fixed Widget Type

- [ ] `p2` - **ID**: `cpt-frontx-dashboard-usecase-add-fix-widget`

**Actor**: `cpt-frontx-dashboard-actor-widget-author`

**Preconditions**:
- The widget author has built a widget that follows the widget contract.

**Main Flow**:
1. The widget author ships the widget.
2. The widget author adds the widget type and its data type to the runtime-loaded JSON. For a fix, the widget author replaces the widget under the same widget type.
3. Existing dashboards can use the new type at once.
4. On the next page load, the fix takes effect.

**Postconditions**:
- The new or fixed widget type is available with no product redeploy.

**Alternative Flows**:
- **The widget type cannot be accepted**: every dashboard read from the same runtime-loaded JSON shows the cannot-be-shown state, until the widget author fixes or removes the type.
- **The widget fails to load**: only the cells and larger views that use it show the cannot-be-shown state; the rest are unaffected.
- **A dashboard is open when the fix ships**: the open dashboard keeps the widget it loaded; the fix shows on the next page load.

### Author a Dashboard

- [ ] `p2` - **ID**: `cpt-frontx-dashboard-usecase-author-dashboard`

**Actor**: `cpt-frontx-dashboard-actor-dashboard-author`

**Preconditions**:
- The widget types the author needs are in the runtime-loaded JSON.
- The author has the widget catalog and the dashboard-author guide.

**Main Flow**:
1. The author picks widget types from the widget catalog.
2. The author writes the dashboard JSON: a title, and cells on the grid, each with a widget instance and its presentation settings.
3. For each data widget, the author writes a binding: a request of the widget's own, a request the dashboard declares once and shares, or values written into the dashboard; and the expression that turns the data into the widget's data.
4. Where a cell needs more room, the author defines a larger view with its own widget instance and binding.
5. The dashboard is served in the runtime-loaded JSON. A product that generates dashboards checks a generated dashboard first.
6. The author opens the dashboard by its id and sees every widget in its own state.

**Postconditions**:
- The dashboard shows, built from one JSON with no product code.

**Alternative Flows**:
- **The dashboard fails a dashboard check**: the whole dashboard shows the cannot-be-shown state. The author finds the cause in the developer-facing diagnostics, fixes the JSON and reloads the page.
- **A widget fails a widget check, or its request or expression fails**: only that cell or larger view shows the cannot-be-shown state. The author fixes the widget instance or its binding and reloads the page.

### Adopt the Template in a Product

- [ ] `p2` - **ID**: `cpt-frontx-dashboard-usecase-adopt-template`

**Actor**: `cpt-frontx-dashboard-actor-product-developer`

**Preconditions**:
- The product has a host application and an API that answers at same-origin paths.

**Main Flow**:
1. The product developer copies the template into the host application, following the shipped guides.
2. The product developer configures the product's API setup in the product's copy.
3. The product developer places the dashboard root and gives it a container, a dashboard id, and the theme and language values.
4. The product developer serves the product's copy of the runtime-loaded JSON.
5. Where the product needs its own widget, the product developer points a template widget type to it in that copy.

**Postconditions**:
- The product shows dashboards from its runtime-loaded JSON, with no data code and no change to the template.

**Alternative Flows**:
- **The runtime-loaded JSON cannot be fetched or read**: every dashboard shows the cannot-be-shown state until the product serves a readable file.

## 9. Acceptance Criteria

- [ ] All 9 widget types are available, and a dashboard can use them with data from any subject area, with no widget code from the product.
- [ ] Opening a specific dashboard by its id shows that dashboard, wherever the host places the dashboard root.
- [ ] A dashboard author draws a complete dashboard from one JSON, with no product code, using only the widget catalog.
- [ ] A widget author adds a new widget type at runtime, and ships a fix under the same widget type, with no product redeploy; the fix shows on the next page load.
- [ ] The product writes no data code; each widget's data comes from its binding, run against the product's same-origin API.
- [ ] A binding whose request target is not a same-origin absolute path, or uses a request form the contract does not define, sends no request; every cell or larger view that uses it shows cannot-be-shown.
- [ ] While the reference dashboard runs, the only data requests in the browser's network traffic are the ones its bindings declare; no widget sends a request of its own.
- [ ] A request the dashboard declares once and several widgets use is sent exactly once per dashboard load, and each of those widgets shows its own share of the response.
- [ ] When a shared request fails or times out, every widget that uses it shows cannot-be-shown, and the other widgets are unaffected.
- [ ] A cell that has a larger view shows a button that opens it in an overlay over the dashboard; a cell with no larger view hides the button.
- [ ] A larger view closes with its close button and with a click outside it, and closing it returns the viewer to the unchanged dashboard. A larger view that is a grid can sort and page.
- [ ] A loader shows in place of the dashboard until it arrives, and each data widget whose data comes from a request shows a loader until its data arrives. A data widget whose data is written into the dashboard, and a widget with no binding such as the markdown card, show their content at once.
- [ ] A data widget that has valid data with no rows shows an empty state.
- [ ] A dashboard is replaced as a whole by a cannot-be-shown message, never by wrong content, when the runtime-loaded JSON or the dashboard cannot be fetched or read (including a request that never answers), when it fails a dashboard check (a cell with a size or height outside its classes, a repeated widget id, or JSON that does not follow the dashboard contract), when a type that comes with it cannot be accepted, or when its id matches no dashboard.
- [ ] A cell or larger view shows cannot-be-shown, and does not affect the other widgets, when its widget fails a widget check, when the request fails, when the response is larger than the response-size cap, when the expression fails, when the data fails validation (including grid data with more rows than the row cap), or when the widget fails to load.
- [ ] A widget that cannot draw the valid data it receives shows its own cannot-be-shown state in its area, and the other widgets are unaffected.
- [ ] Data over the response-size cap or the row cap is never shown in part: the cell or larger view shows cannot-be-shown. The caps are set in the DESIGN and the widget catalog.
- [ ] An expression that reads anything other than its request's response, or for a widget with written-in data those values, fails, and its cell or larger view shows cannot-be-shown.
- [ ] A request with no answer within the timeout set in the DESIGN makes every cell or larger view that uses it show cannot-be-shown.
- [ ] A dashboard that the product generates is shown in the same way as one that it writes by hand, and the product checks a generated dashboard against the published types and the layout checks before showing it.
- [ ] A product that points a template widget type to a different widget, in its own copy of the runtime-loaded JSON, shows that widget in every dashboard using the type, with no change to the template.
- [ ] A complete dashboard shows within 3 seconds at p95 (provisional) under the reference conditions fixed in the DESIGN, counted from the moment the dashboard viewer opens the dashboard.
- [ ] Switching the host between the light and dark theme switches the dashboard root, every shown widget, and a widget open in its larger view without reload: the page is not reloaded, no loading states show again, no request is sent, and the viewer's position on the dashboard and an open larger view are kept. The dashboard uses the host's design-system look.
- [ ] Two dashboards open at the same time (in two browser tabs, or side by side when the template is copied into separately loaded screens) each show only their own content.
- [ ] A dashboard viewer can sort a grid by a column, move between pages, and change the page size, client-side over the rows the binding delivered. The grid always pages.
- [ ] A page of up to 500 rows shown in the grid widget renders and scrolls smoothly, and the grid always pages.
- [ ] A grid can keep its leading columns visible while the viewer scrolls sideways, show grouped column headings, align columns, and colour rows as the dashboard specifies; the row colours stay readable in both the light and the dark theme. A link value opens in a new tab.
- [ ] A ranked list card can show a secondary value, a progress list card shows the current value against a target, a cartesian chart can show several series, and a metric card can show a trend against the previous period.
- [ ] A data widget shows everything its binding defines, with nothing shortened or hidden. A widget with no binding, such as the markdown card, shows its own content.
- [ ] Grid cells are text or links: no badges or sparklines.
- [ ] A markdown card shows typical markdown (CommonMark, with links and images) as formatted text, shows any HTML embedded in its text as plain text, never rendered, makes links active only for web, email and relative addresses and shows every other link as plain text, opens links so that the linked page cannot reach the dashboard, and shows images only from the dashboard's own origin, any other image as its description or nothing.
- [ ] The template works when copied into a single-page application.
- [ ] The template works when copied into a host that runs a screen.
- [ ] The template depends on its own runtime packages only and imports nothing from a host or shell template.
- [ ] Two widgets of the same type on one dashboard keep their own state: sorting or paging one grid does not change another grid, and a widget that fails leaves the other widgets and the dashboard root unchanged.
- [ ] In any dashboard, the way to open the larger view, the larger view, and the grid's sort, page and page size controls can be operated with the keyboard alone and pass the host accessibility checks, and no widget conveys meaning by color alone.
- [ ] With a screen reader, every control in the reference dashboard announces its name, role and state, each widget's loading, empty or cannot-be-shown state can be told apart, charts and the heatmap offer a text alternative of their values, and closing the larger view returns focus to the button that opened it.
- [ ] The template ships an author guide that covers how to write a dashboard JSON and the binding, the widget catalog and the layout checks, how to add or fix a widget type at runtime, that the product owns dashboard and data size, that every viewer who may see a dashboard must be able to get its widgets' data, that the product's API owns errors and access, and what the host must provide.
- [ ] A product developer can adopt the template using only the shipped guides, and a dashboard author who has not used the template before writes a first working dashboard from the dashboard-author guide in one working session; both are verified by a walkthrough with someone who did not build the template.
- [ ] The limitations in section 6.3 are visible in the documentation.

## 10. Dependencies

| Dependency | Description | Criticality |
|------------|-------------|-------------|
| Host application | Supplies a container, a dashboard id, and the theme and language values. | p1 |
| Product's API | Answers the requests a binding makes, at same-origin paths, with authentication and access the product owns. | p1 |
| Viewer data access | Every viewer who may see a dashboard must be able to get its widgets' data. | p1 |
| Host accessibility policy | The host application's accessibility policy and checks, which every widget and control follows (`cpt-frontx-dashboard-nfr-accessibility`). | p2 |
| Runtime-loaded JSON and widget code | Served by the product: the widget types, data types, widget instances and dashboards, and the code of each widget (`cpt-frontx-dashboard-contract-runtime-loaded-json`). | p1 |

## 11. Assumptions

- Dashboard sources are trusted and product-controlled in v1. Bindings call same-origin paths only.
- The product's API answers within the reference conditions the DESIGN fixes.
- A widget author follows the widget contract; the template does not stop a widget that blocks the main thread or leaks memory from slowing the dashboard root and the other widgets.
- Every viewer who may see a dashboard must be able to get its widgets' data.
- The host application has an accessibility policy with checks that the template can follow and be measured against (section 10).
- The runtime-loaded JSON may be replaced by a registered-types mechanism in a later version.

### 11.1 Open Questions

| Question | Owner | Resolution target |
|---------|-------|-------------------|
| Are the provisional NFR thresholds the right figures (3 s at p95 initial render, 100 ms grid scroll, 500 KB dashboard root and 100 KB per-widget download budgets)? | Template architect | Confirmed by measurement under the reference conditions fixed in the DESIGN. |
| Will the runtime-loaded JSON be replaced by a registered-types mechanism? | Template architect | A later version may replace it; tracked as a known risk in section 12. |

## 12. Risks

| Risk | Impact | Mitigation |
|------|--------|------------|
| A widget author ships a widget that blocks the main thread or leaks memory. | Slows the dashboard root and the other widgets. | Widgets keep their state and behaviour apart; the budget and the initial-render target catch heavy widgets early. |
| The runtime-loaded JSON grows large or slow to fetch. | Slows the first load of every dashboard. | The product owns the file's size; a later version may replace the runtime-loaded JSON with a registered-types mechanism. |
| The expression mechanism has a single external maintainer. | A maintenance break stops fixes. | The mechanism is isolated so it can be replaced without changing widgets or dashboards. |
| The download-size budget is provisional. | First-load time may exceed the provisional figures. | Measure download sizes early, as the DESIGN sets out; confirm or revise the figures from the measurements. |
| The loading, empty and cannot-be-shown states prove unclear in use. | Viewers may see unclear states during loading. | Take the requirements in this PRD as the baseline, review these states in use, and refine them. |
| Large dashboards or large answers from the product. | Initial render can exceed its budget, because the template shows whatever the binding asks for. | The author guide states that the product owns dashboard size and data size; the initial render is measured with the reference dashboard. |
| A viewer of a dashboard lacks permission for the data of its widgets. | Viewers without that permission see widgets that show cannot-be-shown, depending on what the product's API does. | The author guide states that every viewer who may see a dashboard must be able to get its widgets' data. |
