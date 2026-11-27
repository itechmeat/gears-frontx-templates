# Embedding a dashboard in a product

This guide is for a product team that shows template dashboards inside its own React application, with no FrontX shell. The dashboard is a React component; each widget inside it is a FrontX MFE that the dashboard loads at runtime from its own widget bundle and mounts in its own shadow root. The product app does not contain the widgets: adding a widget type or shipping a fixed one is a publication of its bundle, not a rebuild of the app.

## Get the template

The two packages of the template, `@gears-frontx/frontx-dashboard-root` (`src-app/mfe_packages/dashboard`) and `@gears-frontx/frontx-dashboard-widgets` (`src-app/mfe_packages/widgets`), are not published to npm, and the template has no `frontx-template.json` manifest yet, so `frontx add` cannot apply it. Today a product gets it this way:

1. Clone the whole `gears-frontx-templates` repository, not only `template-dashboard`, at a commit the product has reviewed, and review the diff each time the product moves it: the product then runs this repository's build scripts and package code. The widget bundle build imports the FrontX manifest build plugin from `template-shell/src/build` of this repository (`src-app/mfe_packages/widgets/vite.bundle.config.ts`), so a copy of `template-dashboard` alone fails to build the bundles with `Could not resolve "../../../../template-shell/src/build/mf-gts"`.
2. Build the bundles in the clone: `cd template-dashboard && npm ci && npm run build:widgets` (see [Host the widget bundles](#host-the-widget-bundles)).
3. Connect the two packages to the product as workspace members: keep the clone inside the product's repository and add `<clone>/template-dashboard/src-app/mfe_packages/*` to the `workspaces` of the product's `package.json`, then `npm install`. The packages pin their dependencies to exact published versions, the same ones the template's dev harness tests, React 19.2.4 among them. The page must run one React: use that React version in the product, and make the product's bundler resolve `react` and `react-dom` to one copy, since the clone's own `node_modules` from step 2 holds another (with Vite, `resolve: { dedupe: ['react', 'react-dom'] }`, as `host/vite.config.ts` does). Two copies fail with React's invalid hook call error.

The packages export their TypeScript source, not built JavaScript (`exports` points at `./src/index.ts` and the other `.ts` and `.tsx` modules, plus `./served/catalog.gts.json`), so the product's bundler must compile TS, TSX and JSON imports from a workspace package; Vite does this as is. The product's `tsc` type-checks that source under the product's own `tsconfig.json`. The dev harness checks it with `strict` on, without `erasableSyntaxOnly` or `declaration`. Under `erasableSyntaxOnly` the runtime binding module (`src/runtime/binding.ts`), the shared test setup and the test stubs carry no constructor parameter properties, but the widget registry (`src/runtime/registry.ts`) still declares fields that way, so a product build with `erasableSyntaxOnly` on fails there with TS1294 (four sites). The repository root requires Node `>=24.14.0` (`engines` in its `package.json`), so the clone's scripts in steps 2 and 3 run on that Node version or later.

## What the product provides

- **A host.** An object with two functions that answer the dashboard's requests. The dashboard never reaches the network itself.
- **The served file.** One JSON object `{"types": [...], "instances": [...]}`: the widget types and data types, the manifest and entry of every widget bundle, and the dashboards. Start from `src-app/mfe_packages/dashboard/served/catalog.gts.json`, the base file with empty `types` and `instances`, and add the product's dashboards to `instances`; each bundle's types, manifest and entry come from its build, in its part of the served file (below).
- **The widget bundles.** One built bundle per widget type, served as static files, and the served widget list that names them (see [Host the widget bundles](#host-the-widget-bundles)).
- **A dashboard id, a theme id and a language.** The theme ids `dark`, `dracula` and `dracula-large` give the kit's dark scope; any other id gives the light scope.

## Embed the component

Create one dashboard root for the application, then render `<Dashboard>` wherever a dashboard shows.

One `<Dashboard>` per root is on screen at a time: two views on one root are not supported.

```tsx
import '@gears-frontx/ui-kit/theme.css';
import { Dashboard, DashboardRoot, fetchHost } from '@gears-frontx/frontx-dashboard-root';

const dashboards = new DashboardRoot({
  host: fetchHost({ fileUrl: '/analytics/dashboards.gts.json', widgetList: '/widgets/widgets.json' }),
});

export function DashboardPage({ id, theme, language }: { id: string; theme: string; language: string }) {
  return <Dashboard root={dashboards} dashboardId={id} theme={theme} language={language} />;
}
```

A theme or language change restyles the widgets in place; nothing is fetched again. A new `dashboardId` loads that dashboard. Leaving the page and coming back to the same dashboard runs its data requests again but does not fetch the served file again.

## Refresh and dispose

When the dashboard definitions change while the page is open (a user saved an edited dashboard, say), call `refresh()` on the root. It reads the served file again, and every shown `<Dashboard>` redraws from the new definitions; no new root and no page reload are needed.

```tsx
async function saveDashboard(edited: unknown) {
  const response = await fetch('/analytics/dashboards', { method: 'PUT', body: JSON.stringify(edited) });
  if (!response.ok) {
    showToast(`The dashboard was not saved: HTTP ${response.status}`);
    return;
  }
  const outcome = await dashboards.refresh();
  if (!outcome.ok) showToast(`The dashboard was saved but cannot be redrawn: ${outcome.problem}`);
}
```

- A cell whose generated extension stays registered mounts the code that extension loaded, so its code is not loaded again. A dashboard whose definition is unchanged keeps its cells as they are; a changed one runs its cells again, so their data requests go out again. A cell with a new generated extension (a new widget, or a widget that changed its type) loads its own copy of the widget's code, even when another cell of the page already loaded that type: the code is loaded once per generated extension, not once per page.
- A dashboard missing from the new file shows "This dashboard cannot be shown".
- A refresh that fails (the file request fails or times out, the base file is rejected, the file defines otherwise a base type the root already holds, or a widget part defines otherwise a type that the same part brought before) resolves `{ ok: false, problem }` and writes one console line; the dashboards stay as they were drawn from the definitions read before. A served file that changes a base type the root already holds is refused this way, and so is one whose widget part brings otherwise a type that the same part brought before (the problem names the type and the part): the cells that part serves keep working, and a host that needs such a change makes a new root. A widget type's definition changes only with a new root. A widget part left out for another reason (its type was brought first by the base file or another part, so it was left out on the first load as well) is left out again and does not fail the refresh.
- Calls do not pile up: a call made while another runs aborts the other's file request, and both resolve with the outcome of the later one.

When the product is done with a root (the analytics area closes for good, the user signs out), unmount its `<Dashboard>` and call `dispose()`. It unmounts and unregisters every widget, removes their containers from the page, aborts the requests in flight, clears its timers and listeners, and disposes of its registry. A `load` or a `refresh` still in flight then resolves `{ ok: false }`, and so does every later one; a second `dispose()` returns the same promise. A new root works on its own. The widget code the page loaded stays in the page's module cache until a page reload, so a new root loads its own copy: keep one root for the page's life and refresh it rather than making new ones.

## Chart colours

Every chart that colours by series, slice, tile or group (cartesian, pie, radar, treemap) takes the colour of the series' position, the first series the first colour. The template ships ten colours for the light theme and ten for the dark one, ordered so that neighbours differ in hue and lightness, each at 3:1 or more against the card surface. Past the tenth, a generator gives each next series the colour farthest from all the colours before it, so a series never takes an earlier series' colour (the generator runs out only after several hundred series).

A host sets its own colours with the CSS custom properties `--dashboard-chart-1`, `--dashboard-chart-2` and so on. They inherit into the widgets, which keep each widget in its own shadow root, but only down the page tree: set them on an element that holds the dashboard and, when the host passes an `overlayContainer` outside the dashboard's element, that container too, such as `:root`. Set only on an element around `<Dashboard>`, they do not reach a larger view that opens in `document.body`, and its chart draws the template's colours while the cell draws the host's. The theme the host passes picks the light or dark scope on the dashboard's element (`data-theme="light"` or `"dark"`), and a host with an `overlayContainer` keeps the same `data-theme` on that container or an ancestor (see [Where overlays open](#where-overlays-open)), so a host gives each theme its own values with that attribute. These rules hold in both cases:

```css
:root,
[data-theme='light'] {
  --dashboard-chart-1: #1f6feb;
  --dashboard-chart-2: #d1242f;
  --dashboard-chart-3: #1a7f37;
}
[data-theme='dark'] {
  --dashboard-chart-1: #58a6ff;
  --dashboard-chart-2: #ff7b72;
  --dashboard-chart-3: #3fb950;
}
```

A series whose property the host does not set takes the template's colour of its own position. With the three colours above, series 4 to 10 take the template's colours 4 to 10 and series 11 on take the generated ones; nothing wraps back to the host's first colour. To replace the template's colours for up to N series, set N properties. A host palette shorter than the number of series continues with the template's colour of the same position, so a host colour can come out close to a later template colour, and a host avoids that by setting as many colours as it has series. The single-colour charts (funnel, heatmap, the radial ring, the sparklines of a metric card and a grid) keep the kit's chart tokens and ignore these properties.

The template's colours are written with the CSS `light-dark()` function, which picks the light or the dark colour by the `color-scheme` the kit sets on each theme scope. It needs a current browser: in an older one without it, a series whose colour the host does not set draws without a palette colour.

### For a host that embedded dashboards with an earlier template version

Earlier versions of the template coloured the series of these four charts with the kit's five chart tokens, in the order `--chart-5`, `--chart-4`, `--chart-2`, `--chart-1`, `--chart-3`, and the sixth series took the first colour again. With this version the same dashboards draw the template's ten colours above, so their series change colour. In the dark theme the first series draws `#5193f4`, while the single-colour charts keep the kit's dark chart token `#60a5fa`. A host that wants the colours its dashboards had maps these properties to the kit's chart tokens in the earlier order:

```css
:root,
[data-theme] {
  --dashboard-chart-1: var(--chart-5);
  --dashboard-chart-2: var(--chart-4);
  --dashboard-chart-3: var(--chart-2);
  --dashboard-chart-4: var(--chart-1);
  --dashboard-chart-5: var(--chart-3);
}
```

A `var()` in a custom property takes its value on the element that declares the property, and the widgets inherit that value. This rule declares the properties on `:root` and on every element with a `data-theme`, so each theme scope takes its own chart tokens: the kit's for a host that keeps them, the host's own for a host that sets `--chart-1` to `--chart-5` itself. It reaches the widgets, and the larger view and the widget overlays by the same rules as above: the dashboard's element carries `data-theme`, and a host that passes an `overlayContainer` keeps `data-theme` on that container or an ancestor. The chart tokens must be set in the host page (the kit's theme stylesheet, or the host's own values) on those elements; where they are not, the properties have no value and the series draw the template's colours.

A host whose charts show more than five series and that wants the earlier wrap repeats the five for `--dashboard-chart-6` onward, one property per series it shows: `--dashboard-chart-6: var(--chart-5)`, `--dashboard-chart-7: var(--chart-4)`, and so on.

## Where overlays open

A cell's larger view opens in an overlay that mounts inside the dashboard's own element. When the product's page content sits in its own stacking context (an ancestor with `isolation: isolate`, a `transform`, or a positioned element with a `z-index`) under a fixed part of the page, such as a sidebar, that part covers the overlay. Pass the element the overlay mounts in as `overlayContainer`, usually `document.body`:

```tsx
<Dashboard root={dashboards} dashboardId={id} theme={theme} language={language} overlayContainer={document.body} />
```

The element can also be one the host renders itself. Keep it in state through a callback ref, not in a ref object: setting the state renders the dashboard again once the element exists, and a ref object changes without a render, so the dashboard would not see the element.

```tsx
import { useState } from 'react';

export function DashboardPage({ id, theme, language }: { id: string; theme: string; language: string }) {
  const [overlays, setOverlays] = useState<HTMLElement | null>(null);
  return (
    <>
      <div ref={setOverlays} className="page-overlays" />
      <Dashboard root={dashboards} dashboardId={id} theme={theme} language={language} overlayContainer={overlays} />
    </>
  );
}
```

Outside the dashboard's element the overlay takes its kit theme scope and `lang` from the given element and its ancestors, not from the dashboard: keep `data-theme` (`light` or `dark`, the scope the theme id gives) and `lang` on that element or an ancestor such as `<html>`. Without `overlayContainer`, or with `null`, the overlay stays inside the dashboard. Pass an element of the dashboard's own document: the widgets take no element of another document, window or frame, and their overlays then stay inside the widgets.

The widgets open their own overlays (a menu or a popover a widget draws through the kit) in the same element. Each widget keeps its overlays in a shadow root of their own inside that element, which holds copies of the widget's stylesheets and carries the widget's theme scope and language, so they look as they do inside the widget and the page's styles do not reach them. Without `overlayContainer` they open inside the widget's own shadow root. When the host changes `overlayContainer`, or sets it to `null`, each widget mounts its overlay layer again in the new place. An overlay a widget has open at that moment stays open and moves there, and its content is drawn again: what the user typed in it is lost. A chart's tooltip is not an overlay: it is drawn inside the chart and stays there.

The popover of a cut description badge (the layout's `description_display` `badge`) opens in the same place as the larger view. A host that draws `CellFrame` itself, outside `<Dashboard>`, and sets `descriptionDisplay` to `badge` passes the element the popover mounts in as the frame's `container`, an element inside the dashboard's theme scope (and inside the shadow root when the dashboard sits in one). Without `container` the popover mounts in the document body: outside a shadow root, so the kit styles there do not reach it, and outside the root's theme scope.

## Actions on a cell

Pass `cellActions` to put the product's own buttons on a cell and on its larger view, such as "Show the rows" or "Open the source". The dashboard calls it with the cell (or the open larger view) and draws the buttons it returns before the larger-view button, so they look and behave like the dashboard's own.

```tsx
import { TableIcon } from 'lucide-react';
import { Dashboard, DashboardRoot, fetchHost, type CellAction, type CellActionTarget } from '@gears-frontx/frontx-dashboard-root';

const dashboards = new DashboardRoot({ host: fetchHost({ fileUrl: '/analytics/dashboards.gts.json' }) });

declare function openRows(widgetId: string): void;

/** A rows button on every cell that shows its widget; nothing while it loads or when it cannot be shown. */
function actionsOf({ widgetId, state }: CellActionTarget): CellAction[] {
  if (state !== 'shown') return [];
  return [{ id: 'rows', label: 'Show the rows', icon: <TableIcon />, onSelect: () => openRows(widgetId) }];
}

export function DashboardPage({ id, theme, language }: { id: string; theme: string; language: string }) {
  return <Dashboard root={dashboards} dashboardId={id} theme={theme} language={language} cellActions={actionsOf} />;
}
```

- The target is `{ dashboardId, widgetId, role, state }`: `widgetId` is the id of the cell's widget, or of its larger view when `role` is `larger_view`; `state` is `loading`, `shown` or `cannot-be-shown`. Return `[]` for a state where an action makes no sense; with no check of `state`, the actions show in every state, while the cell loads and when it cannot be shown too.
- An action is `{ id, label, icon?, onSelect }`. `id` is unique within the list. With an `icon` the button shows the icon only, and `label` is its accessible name and a tooltip on hover and on keyboard focus (as on the larger-view button); without one the button shows `label`. Write `label` in the host language. `onSelect` takes no argument: the function the product builds already knows the cell.
- The dashboard asks on each render of a cell, and of a larger view only while it is open; a cell with `frame` `false` has no header and is never asked. A new function on every render is fine.
- The buttons of an open larger view sit in its header, under its title, and the larger view stays open after one runs. Tooltips open where the larger view opens (`overlayContainer`, or the dashboard's own element).
- A list that is not a list, or an item without a string `id`, with an `id` already used, without a non-blank `label`, without an `onSelect` function or with an `icon` that is not a React node, is skipped with one console line per cell until the list changes. A `cellActions` or an `onSelect` that throws writes one console line; the cell then shows no product button, and the rest of the dashboard keeps working.
- In a narrow cell a description badge narrows first, then the buttons wrap onto more rows, and in a cell narrower than about 18 rem (a small cell on a phone) the buttons take a row of their own under the title. Keep a cell to three or four buttons: in a small cell on a phone the body gives the header the room it needs.
- A chart widget already has its own "Show data" button, which shows its values as a table; an action that only shows the same values duplicates it.

## Variables

The product owns its variables, such as a period: the dashboard JSON declares none. A request names the variables it depends on, and the product passes their values through the `variables` input of `<Dashboard>`:

```json
"requests": {
  "summary": { "method": "GET", "path": "/api/summary?team=web", "variables": { "period": "period" } }
}
```

The product keeps the value in its own state or URL and draws its own control outside the dashboard (`PeriodPicker` stands for the product's control):

```tsx
const [period, setPeriod] = useState('30d');

<PeriodPicker value={period} onChange={setPeriod} />
<Dashboard
  root={dashboards}
  dashboardId={id}
  theme={theme}
  language={language}
  variables={{ period }}
/>
```

The dashboard sends `GET /api/summary?team=web&period=30d`. When the product passes `7d`, the dashboard sends the request again with `period=7d` and redraws only the cells whose request names `period`; the other cells keep their data. A `POST` request gets each key as a top-level field of its body instead, with the value as given. A value is a string, a finite number or a boolean; a number or a boolean goes into a query as its text. A request that names a variable the product does not pass, whose value is of another kind, or whose value cannot be read (a getter that throws), fails its cell with a console line that names the variable, never the value; the rest of the dashboard shows. A key the request already has in its query or body fails the cell too. Widgets never see variables: the API answers for the given value.

What the language covers: the `language` prop is published to the widgets as their `locale`, so numbers, dates and `value_format` units are formatted for the host language. The value must be a BCP-47 tag (`de`, `pt-BR`); another value the language property accepts (`pt_BR`) falls back to `en` for every number, date, unit and sort order, and for the `lang` attribute of the dashboard frame and of each widget. An empty string fails the language property, so the widgets keep the last language they accepted (`en` before any), while the frame's `lang` falls back to `en`. The words the dashboard frame shows (cell placeholders, "This widget cannot be shown", the "Try again" button of a cell whose data request failed, the dashboard states) come from the `texts` prop of `<Dashboard>`, with English defaults, so the product can hand over its own wordings: `texts.frame` is a `FrameTexts` object with `loading`, `cannotBeShown`, `openLarger(title)`, `close` the optional `retry` (the retry button's text, and its accessible name in a cell without a title; without it or blank, "Try again") and the optional `retryNamed(title)` (the button's accessible name in a cell with a title, starting with the `retry` text; without it, "Try again to load <title>", or the `retry` text alone when the product gives its own `retry`), and `texts.dashboard` holds `loading` and `cannotBeShown` for the dashboard states. A widget's own words (its cannot-be-shown state, its "No data to show" empty state, the default accessible name "Chart", the points of a `metric_card` change, written "pp" and read "percentage points") stay English: the renderer gets only `locale`, the shadow-root container and the payload, no text table. The payload carries the cell's title, so a chart, a grid, a heatmap, an activity feed or a radial progress takes the title as its accessible name in place of "Chart", "Table", "Activity" or "Progress". A text table keyed by the language is planned as separate work (gears-frontx-templates#105).

A dashboard can replace the empty-state wording per widget instead: a data widget instance in the served file may carry `empty_text` (1 to 160 characters), which the widget shows in place of "No data to show". It is the served file's own text, like a cell title, so it does not follow `language`; a product that serves the file per language writes it in that language. A text with nothing visible (only spaces or invisible characters) shows "No data to show", and a larger view shows its own instance's `empty_text`. A `metric_card` render with `null_value` `dash` shows a null value as a hyphen headline with its caption, sparkline and link instead of the empty state, the hyphen named for assistive technology by the `empty_text`, or by "No data to show" without one.

A minimal product entry that exports only `Dashboard`, `DashboardRoot` and `fetchHost` from the package root builds (Vite 6.4.6, esbuild minify, React deduped) to about 923 KB minified, 272 KB gzip, in one chunk, so a product may lazy-load the dashboard route. The FrontX MF handler keeps each load for the page's life, keyed by extension id (one per cell and per larger view, the same on every load of a dashboard), and unregistering an extension evicts nothing; only a failed load is dropped, so it can retry. Each widget's evaluation, with its React and with recharts for the chart widgets, stays in memory until the page reloads, and coming back to the same dashboard reuses it.

## Host the widget bundles

Build the bundles in the clone of the repository (see [Get the template](#get-the-template)), from `template-dashboard`:

```sh
npm run build:widgets                                      # every bundle under widgets/bundles
WIDGET_BUNDLE_BASE=https://cdn.example.com/analytics/widgets/ npm run build:widgets   # bundles served from another address
```

The build writes `src-app/mfe_packages/widgets/dist/`:

- `<widget_type>/`: the bundle. Its chunks, its stylesheets, the shared modules (`shared/`), and `widget.gts.json`, the bundle's part of the served file: its manifest and its entry, completed from the build, and its widget, render and data types, which its `mfe.json` declares.
- `widgets.json`: the served widget list: the parts of the last full build, plus the bundles built by name since, not every part in `dist/`.

Publish the whole `dist/` directory under `WIDGET_BUNDLE_BASE` (`/widgets/` by default) as static files. The chunks under `assets/` carry their content hash in their names, so they can be cached for long. The shared modules under `shared/` keep stable names (`shared/react.js`), with their content hash only in the manifest: serve them, `widgets.json` and the `widget.gts.json` parts so that each page load revalidates them (`cache-control: no-cache` or a short lifetime).

The dashboard reads the served file and the parts on the list on each page load: `fetchHost({ fileUrl, widgetList })` answers `loadFile` with the file followed by the parts, and so does `createMockHost({ widgetList })`; a file that is already a list gets the parts after its own. A product that answers `loadFile` with its own code returns the same list, `[file, ...(await loadWidgetParts(widgetListUrl, signal, fileHref))]`, where `fileHref` is the absolute address the file was read from: a relative `widgetListUrl` resolves against it, as in `fetchHost`, and without it against the page's address, so a file served from a CDN with a relative list would have the list requested from the app's origin. Or its backend serves one joined file and no list at all. `DashboardHost.loadFile` is typed `Promise<ServedAnswer>`, one `ServedFile` or a list of them, so a product that reads the answer itself tells the two apart. The root registers the file, then each part on its own. A part that cannot be read, or does not answer within 10 seconds, is left out with one console line, and so is a part the registry rejects (a malformed manifest, entry or type), a part with a type the base file or an earlier part already defines with other content, whose console line names the source that defined the type first: the served file, or the widget part by its quoted manifest ids or, without any, by its place in the answer (`its type <id> is already defined otherwise by the widget part "<manifest ids>"`, or `... by the widget part number <n> of the answer (the served file is number 1)`; a type the type store held before the served file, one of its own or one the dashboard registers itself, names no source, even when the served file carries an identical copy of it), or with a manifest or entry id one of them, or the dashboard's own stand-in records or the runtime's lifecycle stage records, already brings with other content, and a part that brings a dashboard the base file or an earlier part already serves with other content, or that brings one manifest, entry or dashboard id twice with other content (the same type, manifest, entry or dashboard brought alike is fine; a base file with such an id twice fails every dashboard). Only the cells whose widget type, a type it extends, its render type or its data type came only with that part, or whose widget type names an entry that part failed to bring, fail, and its dashboards never load. A part left out for a malformed item keeps in the store what it registered before that item, so a later part that brings one of those types otherwise is left out too. In a joined file (`composeServedFile`), one rejected item fails every dashboard in it.

The catalog widget types now arrive in the catalog bundles' parts, not in the base file. A product's own widget type, its render type and its data type therefore get ids of their own, under the product's own vendor segment (the fixtures use `frontx.test`). A copy of a catalog type under the same id with other content leaves one of the two bundles out, and which one depends on the order of the widget list, which the build writes sorted. A copy of a catalog type with other content in the base file leaves that catalog bundle's part out, and the part's line still shows in the console; the cells of the type then fail only when something they need came only with that part, its render or data type or its entry, and they fail with the part's line. A base file that keeps the old catalog's render and data types and points the widget type at an entry the product serves mounts the cells. A product that re-pointed a catalog type in its served file the old way moves that change to one of the two ways of [Replace a template widget type](#replace-a-template-widget-type) when it takes this release.

### Add a widget type of the product

A widget type the template does not define ships the same way, with no change to the template or the app:

1. Make a bundle directory like `host/widget-bundles/deploy_pulse/` of this template: `mfe.json` (the manifest id, the remote entry address, the one entry, and the `schemas` of the new widget type, its data type and, when it has one of its own, its render type; the widget type's `entry` trait names the entry in `mfe.json`), `lifecycle.tsx` (a renderer passed to `createWidgetLifecycle` from `@gears-frontx/frontx-dashboard-widgets/lifecycle`, as the default export), and `served.gts.json` with instances only, such as a dashboard that shows the type. The widget type closes its `render` one of two ways: with its own render type in the same `schemas`, derived from the render base like the catalog's (`allOf` with `$ref` to `gts://gts.frontx.dashboard.widget.render.v1~` and an object of its fields, then `unevaluatedProperties: false` at the top level, under an id such as `gts.frontx.dashboard.widget.render.v1~my_org.my_app.widget.deploy_pulse_render.v1~`), which its `render` refers to by `$ref` (close it with that top-level `unevaluatedProperties: false`: `additionalProperties: false` inside an `allOf` branch rejects the `id` the dashboard stamps, and every cell of that type fails); or inline in its `allOf`, as `render` with `additionalProperties: false` and its fields, the way `deploy_pulse` does. Both are equally strict when a widget registers, but an inline `render` leaves the path through the `render_widget` action with no strict check (the stamp uses the render base, and only the widget's own registration checks `render`), so a derived render type of its own is recommended, as every catalog widget type has. The render base is a grouping type on purpose: it declares only the optional stamped `id` and no render field, so the action names one type for every render, and a render instance belongs by its id to its derived render type and is checked strictly against it. When the render type a widget type refers to is not registered, in the served file or in a part on the widget list, each cell and larger view of that widget type fails with the reference it could not resolve, and the rest of the dashboard shows. A widget type that leaves `render` open accepts any presentation field. The dashboard reads a widget type's render type from the `$ref` of its `render`, as the catalog types declare it: it stamps each widget's `render` with that type and registers it, so a `render` the render type rejects fails its cell. For a `render` declared inline the dashboard stamps it with the render base, which checks only that it is an object, and the widget type's own check at the widget's registration is the only one, as for `deploy_pulse`. The renderer receives the stamped `render` with its `id` and ignores it; a dashboard never writes `render.id`. Top-level render fields named `id`, `$id`, `gtsId`, `gtsIid`, `gtsOid`, `gtsI`, `gts_id`, `gts_oid`, `gts_iid` and `$schema` are reserved: the dashboard refuses a render that carries one, and that cell fails. Any other top-level name, `type` among them, is checked by the render type like any other field. The bundles under `host/widget-bundles/` are dev-only fixtures of the host app, not shipped widgets, and name their types with `frontx.test`: a product names its own types with its own vendor segment in place of `frontx.test`. The data a widget's transform returns must not carry any GTS identity field at its top level: a result with `type`, `schema`, `$id`, `$schema`, `gtsId`, `gtsIid`, `gtsOid`, `gtsI`, `gtsTid`, `gtsType`, `gtsT`, `gts_id`, `gts_iid`, `gts_oid`, `gts_t`, `gts_tid` or `gts_type` fails its cell, and an `id` is replaced by the one the dashboard stamps; nest such a value under another key of the data type.
2. Build it into the same output by name: `WIDGET_BUNDLES_DIR=<the directory holding it> node src-app/mfe_packages/widgets/build-bundles.mjs deploy_pulse` (from `template-dashboard`). A build that names bundles adds the bundle's types to its part and the part to `widgets.json`, starting from the list the build itself writes and keeping the entries it already names; a full build of one bundles directory owns the catalog of its out dir and lists only the bundles it built, so build the product's bundles by name after a full build of the catalog bundles, for example `WIDGET_BUNDLES_DIR=host/widget-bundles node src-app/mfe_packages/widgets/build-bundles.mjs broken_init deploy_pulse`. A part directory of a bundle the product no longer ships stays on disk but a full build no longer lists it, so nothing loads it: remove the `dist/<widget_type>/` by hand to be rid of it. A bundle that draws with recharts shares it with the catalog charts when it is named in `WIDGET_CHART_BUNDLES` (a comma list); otherwise it carries its own copy.
3. Publish the bundle directory and add its part's address to the published `widgets.json`. The published list is the product's: the `widgets.json` the build writes holds the parts of the last full build plus the bundles built by name since, not everything in the local `dist/`, so on a release machine that built one bundle it is not the complete list. Dashboards can name the new type on the next page load.

### Replace a template widget type

To ship a fixed `pie_chart`, change its code, run `npm run build:widgets -- pie_chart`, and publish only `dist/pie_chart/`: its part keeps its address, so the published `widgets.json` does not change, and the other bundles stay as they are. The fix shows on the next page load. A fix keeps the type's `render` and data schemas; an incompatible change is a new widget type version.

To point a template widget type at a bundle of the product instead, build the product's bundle as above and set the template type's `entry` trait to the product's entry id in the type's `schemas`, one of two ways. Either change the trait in that template bundle's own `mfe.json` in the product's copy of the template and rebuild its part, or keep that bundle off the served widget list and let the product's bundle declare the type: a part may not replace a type another part brought, so the product's `schemas` then carry the template type with the product's entry id and its render and data types unchanged. The first way is a change in the product's copy of the template; the second changes no template file. To roll back, publish the previous bundle and its part again.

### Bundle addresses, CORS and same origin

- The dashboard loads a bundle only from an allowed origin: the page's own origin by default. Bundles under the app's own origin need nothing more.
- To serve bundles from another origin, such as a CDN, list it when creating the root: `new DashboardRoot({ host, bundleOrigins: [location.origin, 'https://cdn.example.com'] })`, and build with `WIDGET_BUNDLE_BASE` set to that address. The CDN must allow the page origin to read its files cross-origin (`Access-Control-Allow-Origin` for the product's origin) for the chunks, the shared modules, every `widget.gts.json` part, and `widgets.json` when it is served from the CDN: the handler reads the chunks and the shared modules with `fetch`, not with `<script>` tags, and the build writes the absolute CDN address of every `widget.gts.json` part into `widgets.json`, which `loadWidgetParts` reads with a cross-origin `fetch`. A part that cannot be read is left out, so only its widget types' cells fail; a `widgets.json` that cannot be read fails the dashboard. The stylesheets are added as `<link>` elements and need no CORS. A trailing slash on `WIDGET_BUNDLE_BASE` is optional, and a base address in `bundleOrigins` counts as its origin. An entry whose manifest points to an origin that is not listed fails its cells, with a console line naming the address.
- A bundle is code that runs in the page with the app's rights. Serve bundles only from servers the product controls; the template checks the origin of every address a bundle names, not the content. The FrontX MF handler follows HTTP redirects when it fetches a chunk or a shared module, and the template cannot see the final address: never redirect a bundle path to a server that is not allowed.

## Answer the requests

`fetchHost({ fileUrl })` answers both kinds of request over the page's own origin: the served file from `fileUrl`, and each data request at its `path`, with the method and body the dashboard names. A product whose API needs its own client, headers or session writes its own host instead:

```ts
import type { DashboardHost } from '@gears-frontx/frontx-dashboard-root';

export const productHost: DashboardHost = {
  // The dashboard request: the served file, or the file in parts (`ServedAnswer`).
  loadFile: (signal) => api.get('/dashboards/gts-file', { signal }),
  // A data request of a binding: answer with the parsed JSON body.
  request: ({ method, path, body }, signal) => (method === 'GET' ? api.get(path, { signal }) : api.post(path, body, { signal })),
};
```

Rules the dashboard applies to every answer:

- It hands over only `GET` and `POST` requests whose `path` is a same-origin absolute path, such as `/api/demo/summary?team=web`. A request that names variables arrives already built, with the product's values in its query or body and no `variables` field.
- It waits at most 30 seconds. A rejected promise or a late answer fails every cell that depends on the request; the other cells keep working. Nothing is retried.
- The answer is the JSON value the binding's transform reads as `response`. Each widget's transform turns it into that widget's data; the data is then checked against the widget's data type, and data that does not fit fails only that cell.
- A request that several widgets name in the dashboard's `requests` object is sent once per dashboard load and per variable value it is built with.

The product's API owns authentication, access and errors. Every viewer who may see a dashboard must be able to get its widgets' data.

The dashboard JSON, the answers and the data are untrusted: any fault in them stays in its cell or rejects the load with a reason. The host's code is product code: the dashboard does not defend against a host that breaks the contract on purpose, beyond reading each widget object once, as a JSON copy, on load.

## Mock data

`createMockHost()` answers the demo dashboard from fixtures after a 300 ms delay, so the template runs without a backend. Its demo file holds the demo dashboards; the widget types come with the parts of the widget list it is given (`createMockHost({ widgetList })`), as in a product. It comes from the `/mock` subpath, not the package root, so a product that imports only the root ships none of the fixtures or demo files:

```ts
import { DashboardRoot } from '@gears-frontx/frontx-dashboard-root';
import { createMockHost } from '@gears-frontx/frontx-dashboard-root/mock';

const root = new DashboardRoot({ host: createMockHost({ delayMs: 300, widgetList: '/widgets/widgets.json' }) });
```

To mock the product's own endpoints, copy `src-app/mfe_packages/dashboard/src/mock/mockHost.ts`: add one entry per path to `FIXTURES` (the path without its query string maps to a function of the body and the query that returns the response body), and pass the product's served file as `file`. A fixture that throws answers as a failed request.

## What shows when something fails

- A cell whose request, transform, data or widget fails shows "This widget cannot be shown"; the rest of the dashboard is unaffected. The same holds for a widget bundle that does not load, answers 404 or throws while it loads: only the cells of that widget type fail.
- A served file that cannot be loaded or registered, an unknown dashboard id, a dashboard that fails its type, or one that fails a layout check (two cells that name one widget id, for one) shows "This dashboard cannot be shown".
- Each failure writes one line to the browser console naming the dashboard, the widget and the failing step. The viewer never sees the cause.

### Tell the product of failures

Pass `onFailure` to hear of each failure the viewer sees, for example to count them in the product's tracker. `<Dashboard>` calls it once each time a cell or an open larger view turns to "This widget cannot be shown", and once each time a load of the dashboard fails or the loaded dashboard fails its layout check, after that state is on screen. A retry that fails again calls it again.

```tsx
import { Dashboard, DashboardRoot, fetchHost, type FailureReport } from '@gears-frontx/frontx-dashboard-root';

const dashboards = new DashboardRoot({ host: fetchHost({ fileUrl: '/analytics/dashboards.gts.json' }) });

declare function track(event: string, fields: Record<string, string | boolean>): void;

/** The tracker gets the fields that carry no answer data; the message stays in the product's own log. */
function reportFailure(report: FailureReport) {
  const { message, ...fields } = report;
  track('dashboard_failure', fields);
  console.warn(`dashboard failure: ${message}`);
}

export function DashboardPage({ id, theme, language }: { id: string; theme: string; language: string }) {
  return <Dashboard root={dashboards} dashboardId={id} theme={theme} language={language} onFailure={reportFailure} />;
}
```

- A cell report is `{ scope: 'cell', kind, dashboardId, widgetId, widgetType, role, source?, retryable, message }`: `role` is `cell` or `larger_view`, `source` the name of the shared request the cell reads, and `retryable` true when the cell offers "Try again". Its `kind` is the step that failed: `definition` (the served file is wrong for this widget), `mount` (its bundle or its mount), `request` (the data request failed after it left; the only kind with a retry), `request_refused` (the dashboard refused to send it: a variable missing or of another kind, a path that is not same-origin, an unknown shared request), `transform`, `data` (the transform's result does not fit the widget's data type), `render_widget` (the widget did not take its data), or `unknown` (a defect of the dashboard root).
- A dashboard report is `{ scope: 'dashboard', kind, dashboardId, message }`, with `kind` `start` (the root could not start), `file` (the served file cannot be loaded or registered), `dashboard` (no dashboard of that id, one that fails its type, or one that fails a layout check) or `unknown`.
- `message` is the console line after `[dashboard] `, on one line. It can quote the product API's own error text, the transform's error text and the data type's validation text, any of which can hold parts of an answer: keep it in the product's own logs, or scrub it before it goes to a third-party tracker. Its wording may change between versions; group and count by the other fields.
- Nothing is reported for a root disposed before or during a load or a cell's run, a cell that left before it failed, a widget's own "cannot be shown" (a widget that cannot draw valid data), or a failed `refresh()`, whose outcome its caller already gets.
- An `onFailure` that throws, or returns a promise that rejects, writes one console line and changes nothing else. A new function on every render is fine: no cell runs again, and the newest one is called.

## Try it

`npm run build:widgets`, then `npm run dev:host`, serves `host/`, a plain React application with no FrontX shell that embeds the demo dashboard on the mock host at http://127.0.0.1:5198/. The app's own bundle holds no widget: the dev server serves `src-app/mfe_packages/widgets/dist/` under `/widgets/`, read from disk on every request, and the dashboard loads each widget from there. Its buttons switch the theme, leave and reopen the dashboard, and open an unknown dashboard id; its own "Period" control, outside the dashboard, passes the period to the dashboard's `variables` and changes the CI runs and the top repositories, not the other cells. `npm run build:host` and `npm run preview:host` run the same app from its production build on http://127.0.0.1:5197/.

To see a widget type the app never saw, run the full `npm run build:widgets` first (a full build owns the catalog of `dist/` and lists only the bundles it built) and then the product bundles of `host/widget-bundles` by name into the same output (`WIDGET_BUNDLES_DIR=host/widget-bundles node src-app/mfe_packages/widgets/build-bundles.mjs broken_init deploy_pulse`), which starts from the list the full build wrote, keeps the catalog's entries on it and adds the product's bundles, so the list holds the parts of the last full build plus the bundles built by name since, and open `?dashboard=gts.frontx.dashboard.dashboard.dashboard.v1~8d3a4f5e-6b7c-4d8e-9f0a-1b2c3d4e5f60`. A full `build:widgets` after that takes the product parts off the list again; their directories stay in `dist/`, and nothing loads them until the product build by name runs again. The dashboard `gts.frontx.dashboard.dashboard.dashboard.v1~9e4b5a6f-7c8d-4e9f-8a0b-2c3d4e5f6a71` shows a bundle that throws while it loads and one whose files are missing, each failing only its own cell.

In tests the root runs the catalog widgets without bundles: `WIDGET_ENTRIES` and `IN_BUNDLE_PARTS` from `@gears-frontx/frontx-dashboard-widgets/testing` give it the lifecycles and the parts from the product's own bundle (`new DashboardRoot({ host, entries: WIDGET_ENTRIES })` with `composeServedFile(file, IN_BUNDLE_PARTS)`). It is a test path: the widgets' CSS stays outside their shadow roots, so a browser shows them unstyled.
