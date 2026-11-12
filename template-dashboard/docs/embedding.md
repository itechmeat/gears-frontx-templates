# Embedding a dashboard in a product

This guide is for a product team that shows template dashboards inside its own React application, with no FrontX shell. The dashboard is a React component; each widget inside it is a FrontX MFE that the dashboard loads at runtime from its own widget bundle and mounts in its own shadow root. The product app does not contain the widgets: adding a widget type or shipping a fixed one is a publication of its bundle, not a rebuild of the app.

## Get the template

The two packages of the template, `@gears-frontx/frontx-dashboard-root` (`src-app/mfe_packages/dashboard`) and `@gears-frontx/frontx-dashboard-widgets` (`src-app/mfe_packages/widgets`), are not published to npm, and the template has no `frontx-template.json` manifest yet, so `frontx add` cannot apply it. Today a product gets it this way:

1. Clone the whole `gears-frontx-templates` repository, not only `template-dashboard`, at a commit the product has reviewed, and review the diff each time the product moves it: the product then runs this repository's build scripts and package code. The widget bundle build imports the FrontX manifest build plugin from `template-shell/src/build` of this repository (`src-app/mfe_packages/widgets/vite.bundle.config.ts`), so a copy of `template-dashboard` alone fails to build the bundles with `Could not resolve "../../../../template-shell/src/build/mf-gts"`.
2. Build the bundles in the clone: `cd template-dashboard && npm ci && npm run build:widgets` (see [Host the widget bundles](#host-the-widget-bundles)).
3. Connect the two packages to the product as workspace members: keep the clone inside the product's repository and add `<clone>/template-dashboard/src-app/mfe_packages/*` to the `workspaces` of the product's `package.json`, then `npm install`. The packages pin their dependencies to exact published versions, the same ones the template's dev harness tests, React 19.2.4 among them. The page must run one React: use that React version in the product, and make the product's bundler resolve `react` and `react-dom` to one copy, since the clone's own `node_modules` from step 2 holds another (with Vite, `resolve: { dedupe: ['react', 'react-dom'] }`, as `host/vite.config.ts` does). Two copies fail with React's invalid hook call error.

The packages export their TypeScript source, not built JavaScript (`exports` points at `./src/index.ts` and the other `.ts` and `.tsx` modules, plus `./served/catalog.gts.json`), so the product's bundler must compile TS, TSX and JSON imports from a workspace package; Vite does this as is. The repository root requires Node `>=24.14.0` (`engines` in its `package.json`), so the clone's scripts in steps 2 and 3 run on that Node version or later.

## What the product provides

- **A host.** An object with two functions that answer the dashboard's requests. The dashboard never reaches the network itself.
- **The served file.** One JSON object `{"types": [...], "instances": [...]}`: the widget types and data types, the manifest and entry of every widget bundle, and the dashboards. Start from `src-app/mfe_packages/dashboard/served/catalog.gts.json` (the catalog types) and add the product's dashboards to `instances`; the bundles' manifests and entries come from their builds (below).
- **The widget bundles.** One built bundle per widget type, served as static files, and the served widget list that names them (see [Host the widget bundles](#host-the-widget-bundles)).
- **A dashboard id, a theme id and a language.** The theme ids `dark`, `dracula` and `dracula-large` give the kit's dark scope; any other id gives the light scope.

## Embed the component

Create one dashboard root for the application, then render `<Dashboard>` wherever a dashboard shows. One `<Dashboard>` per root is on screen at a time.

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

## Dashboard variables

A dashboard may declare variables, such as a period, and its requests name the variables they depend on:

```json
"variables": {
  "period": {
    "title": "Period",
    "options": [{ "value": "7d", "label": "Last 7 days" }, { "value": "30d", "label": "Last 30 days" }],
    "default": "30d"
  }
},
"requests": {
  "summary": { "method": "GET", "path": "/api/summary?team=web", "variables": { "period": "period" } }
}
```

The dashboard sends `GET /api/summary?team=web&period=30d` at first. It draws a bar above the grid with one control per variable; picking "Last 7 days" sends the request again with `period=7d` and redraws only the cells whose request names `period`. A `POST` request gets each key as a top-level field of its body instead. A variable's options are unique and its `default` is one of them, or the dashboard does not load.

To keep the values in the product, for example in the URL, pass them in and listen for changes; with `hideVariables` the product draws its own control and the dashboard draws no bar:

```tsx
<Dashboard
  root={dashboards}
  dashboardId={id}
  theme={theme}
  language={language}
  variables={{ period: searchParams.get('period') ?? '30d' }}
  onVariablesChange={(values) => setSearchParams(values)}
  hideVariables={false}
/>
```

A value that is not one of the variable's options gives its default, and a name the dashboard does not declare is ignored; each writes one console line. Widgets never see variables: the API answers for the chosen value.

What the language covers: the `language` prop is published to the widgets as their `locale`, so numbers, dates and `value_format` units are formatted for the host language. The value must be a BCP-47 tag (`de`, `pt-BR`); another value the language property accepts (`pt_BR`) falls back to `en` for every number, date, unit and sort order, and for the `lang` attribute of the dashboard frame and of each widget. An empty string fails the language property, so the widgets keep the last language they accepted (`en` before any), while the frame's `lang` falls back to `en`. The words the dashboard frame shows (cell placeholders, "This widget cannot be shown", the dashboard states) come from the `texts` prop of `<Dashboard>`, with English defaults, so the product can hand over its own wordings. A widget's own words (its cannot-be-shown state, its "No data to show" empty state, the default accessible name "Chart") stay English: the renderer gets only `locale` and the shadow-root container, no text table. A text table keyed by the language is planned as separate work (gears-frontx-templates#105).

A minimal product entry that exports only `Dashboard`, `DashboardRoot` and `fetchHost` from the package root builds (Vite 6.4.6, esbuild minify, React deduped) to about 923 KB minified, 272 KB gzip, in one chunk, so a product may lazy-load the dashboard route. The FrontX MF handler keeps each load for the page's life, keyed by extension id (one per cell and per larger view, the same on every load of a dashboard), and unregistering an extension evicts nothing; only a failed load is dropped, so it can retry. Each widget's evaluation, with its React and with recharts for the chart widgets, stays in memory until the page reloads, and coming back to the same dashboard reuses it.

## Host the widget bundles

Build the bundles in the clone of the repository (see [Get the template](#get-the-template)), from `template-dashboard`:

```sh
npm run build:widgets                                      # every bundle under widgets/bundles
WIDGET_BUNDLE_BASE=https://cdn.example.com/analytics/widgets/ npm run build:widgets   # bundles served from another address
```

The build writes `src-app/mfe_packages/widgets/dist/`:

- `<widget_type>/`: the bundle. Its chunks, its stylesheets, the shared modules (`shared/`), and `widget.gts.json`, the bundle's part of the served file: its manifest and its entry, completed from the build.
- `widgets.json`: the served widget list, the address of every part in `dist/`.

Publish the whole `dist/` directory under `WIDGET_BUNDLE_BASE` (`/widgets/` by default) as static files. The chunks under `assets/` carry their content hash in their names, so they can be cached for long. The shared modules under `shared/` keep stable names (`shared/react.js`), with their content hash only in the manifest: serve them, `widgets.json` and the `widget.gts.json` parts so that each page load revalidates them (`cache-control: no-cache` or a short lifetime).

The dashboard reads the served file and the parts on the list on each page load: `fetchHost({ fileUrl, widgetList })` answers `loadFile` with the file followed by the parts, and so does `createMockHost({ widgetList })`; a file that is already a list gets the parts after its own. A product that answers `loadFile` with its own code returns the same list, `[file, ...(await loadWidgetParts(widgetListUrl, signal, fileHref))]`, where `fileHref` is the absolute address the file was read from: a relative `widgetListUrl` resolves against it, as in `fetchHost`, and without it against the page's address, so a file served from a CDN with a relative list would have the list requested from the app's origin. Or its backend serves one joined file and no list at all. `DashboardHost.loadFile` is typed `Promise<ServedAnswer>`, one `ServedFile` or a list of them, so a product that reads the answer itself tells the two apart. The root registers the file, then each part on its own. A part that cannot be read, or does not answer within 10 seconds, is left out with one console line, and so is a part the registry rejects (a malformed manifest, entry or type), a part with a type the base file or an earlier part already defines with other content, or with a manifest or entry id one of them, or the dashboard's own stand-in records or the runtime's lifecycle stage records, already brings with other content, and a part that brings a dashboard the base file or an earlier part already serves with other content, or that brings one manifest, entry or dashboard id twice with other content (the same type, manifest, entry or dashboard brought alike is fine; a base file with such an id twice fails every dashboard). Only the cells whose widget type names an entry that part failed to bring fail, and its dashboards never load. A part left out for a malformed item keeps in the store what it registered before that item, so a later part that brings one of those types otherwise is left out too. In a joined file (`composeServedFile`), one rejected item fails every dashboard in it.

### Add a widget type of the product

A widget type the template does not define ships the same way, with no change to the template or the app:

1. Make a bundle directory like `host/widget-bundles/deploy_pulse/` of this template: `mfe.json` (the manifest id, the remote entry address and the one entry), `lifecycle.tsx` (a renderer passed to `createWidgetLifecycle` from `@gears-frontx/frontx-dashboard-widgets/lifecycle`, as the default export), and `served.gts.json` with the new widget type and its data type (the widget type's `entry` trait names the entry in `mfe.json`). The widget type closes its `render` one of two ways, equally strict when a widget registers: with its own render type in the same file, derived from the render base like the catalog's (`allOf` with `$ref` to `gts://gts.frontx.dashboard.widget.render.v1~` and an object of its fields, then `unevaluatedProperties: false` at the top level, under an id such as `gts.frontx.dashboard.widget.render.v1~my_org.my_app.widget.deploy_pulse_render.v1~`), which its `render` refers to by `$ref` (close it with that top-level `unevaluatedProperties: false`: `additionalProperties: false` inside an `allOf` branch rejects the `id` the dashboard stamps, and every cell of that type fails); or inline in its `allOf`, as `render` with `additionalProperties: false` and its fields, the way `deploy_pulse` does. When the render type a widget type refers to is not registered, in the served file or in a part on the widget list, each cell and larger view of that widget type fails with the reference it could not resolve, and the rest of the dashboard shows. A widget type that leaves `render` open accepts any presentation field. A widget type with its own render type names it in its `render_type` trait as well, beside `entry` and `data_type`, as the catalog types do: the dashboard stamps each widget's `render` with that type and registers it, so a `render` the render type rejects fails its cell. Without `render_type` the dashboard stamps `render` with the render base, which checks only that it is an object, and the widget type's own check at the widget's registration is the only one, as for `deploy_pulse`. The renderer receives the stamped `render` with its `id` and ignores it; a dashboard never writes `render.id`. Top-level render fields named `id`, `$id`, `gtsId`, `gtsIid`, `gtsOid`, `gtsI`, `gts_id`, `gts_oid`, `gts_iid` and `$schema` are reserved: the dashboard refuses a render that carries one, and that cell fails. Any other top-level name, `type` among them, is checked by the render type like any other field. The bundles under `host/widget-bundles/` are dev-only fixtures of the host app, not shipped widgets, and name their types with `frontx.test`: a product names its own types with its own vendor segment in place of `frontx.test`. The data a widget's transform returns must not carry any GTS identity field at its top level: a result with `type`, `schema`, `$id`, `$schema`, `gtsId`, `gtsIid`, `gtsOid`, `gtsI`, `gtsTid`, `gtsType`, `gtsT`, `gts_id`, `gts_iid`, `gts_oid`, `gts_t`, `gts_tid` or `gts_type` fails its cell, and an `id` is replaced by the one the dashboard stamps; nest such a value under another key of the data type.
2. Build it into the same output: `WIDGET_BUNDLES_DIR=<the directory holding it> node src-app/mfe_packages/widgets/build-bundles.mjs deploy_pulse` (from `template-dashboard`). The build adds the bundle's types to its part and the part to `widgets.json`, which lists every part in `dist/`: remove the `dist/<widget_type>/` of a bundle the product no longer ships. A bundle that draws with recharts shares it with the catalog charts when it is named in `WIDGET_CHART_BUNDLES` (a comma list); otherwise it carries its own copy.
3. Publish the bundle directory and add its part's address to the published `widgets.json`. The published list is the product's: the `widgets.json` the build writes lists only what is in the local `dist/`, so on a release machine that built one bundle it is not the complete list. Dashboards can name the new type on the next page load.

### Replace a template widget type

To ship a fixed `pie_chart`, change its code, run `npm run build:widgets -- pie_chart`, and publish only `dist/pie_chart/`: its part keeps its address, so the published `widgets.json` does not change, and the other bundles stay as they are. The fix shows on the next page load. A fix keeps the type's `render` and data schemas; an incompatible change is a new widget type version.

To point a template widget type at a bundle of the product instead, build the product's bundle as above and set the template type's `entry` trait to the product's entry id in the product's copy of the served file; the template's copy does not change. To roll back, publish the previous bundle and its part again.

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

- It hands over only `GET` and `POST` requests whose `path` is a same-origin absolute path, such as `/api/demo/summary?team=web`. A request that names dashboard variables arrives already built, with the values in its query or body and no `variables` field.
- It waits at most 30 seconds. A rejected promise or a late answer fails every cell that depends on the request; the other cells keep working. Nothing is retried.
- The answer is the JSON value the binding's transform reads as `response`. Each widget's transform turns it into that widget's data; the data is then checked against the widget's data type, and data that does not fit fails only that cell.
- A request that several widgets name in the dashboard's `requests` object is sent once per dashboard load and per variable value it is built with.

The product's API owns authentication, access and errors. Every viewer who may see a dashboard must be able to get its widgets' data.

## Mock data

`createMockHost()` answers the demo dashboard from fixtures after a 300 ms delay, so the template runs without a backend. It comes from the `/mock` subpath, not the package root, so a product that imports only the root ships none of the fixtures or demo files:

```ts
import { DashboardRoot } from '@gears-frontx/frontx-dashboard-root';
import { createMockHost } from '@gears-frontx/frontx-dashboard-root/mock';

const root = new DashboardRoot({ host: createMockHost({ delayMs: 300, widgetList: '/widgets/widgets.json' }) });
```

To mock the product's own endpoints, copy `src-app/mfe_packages/dashboard/src/mock/mockHost.ts`: add one entry per path to `FIXTURES` (the path without its query string maps to a function of the body and the query that returns the response body), and pass the product's served file as `file`. A fixture that throws answers as a failed request.

## What shows when something fails

- A cell whose request, transform, data or widget fails shows "This widget cannot be shown"; the rest of the dashboard is unaffected. The same holds for a widget bundle that does not load, answers 404 or throws while it loads: only the cells of that widget type fail.
- A served file that cannot be loaded or registered, an unknown dashboard id, or a dashboard that fails its type shows "This dashboard cannot be shown".
- Each failure writes one line to the browser console naming the dashboard, the widget and the failing step. The viewer never sees the cause.

## Try it

`npm run build:widgets`, then `npm run dev:host`, serves `host/`, a plain React application with no FrontX shell that embeds the demo dashboard on the mock host at http://127.0.0.1:5198/. The app's own bundle holds no widget: the dev server serves `src-app/mfe_packages/widgets/dist/` under `/widgets/`, read from disk on every request, and the dashboard loads each widget from there. Its buttons switch the theme, leave and reopen the dashboard, and open an unknown dashboard id; the demo dashboard's "Period" bar changes the CI runs and the top repositories, not the other cells. `npm run build:host` and `npm run preview:host` run the same app from its production build on http://127.0.0.1:5197/.

To see a widget type the app never saw, build the product bundles of `host/widget-bundles` (`WIDGET_BUNDLES_DIR=host/widget-bundles node src-app/mfe_packages/widgets/build-bundles.mjs`) and open `?dashboard=gts.frontx.dashboard.dashboard.dashboard.v1~8d3a4f5e-6b7c-4d8e-9f0a-1b2c3d4e5f60`. The dashboard `gts.frontx.dashboard.dashboard.dashboard.v1~9e4b5a6f-7c8d-4e9f-8a0b-2c3d4e5f6a71` shows a bundle that throws while it loads and one whose files are missing, each failing only its own cell.

In tests the root runs the catalog widgets without bundles: `WIDGET_ENTRIES` and `IN_BUNDLE_PARTS` from `@gears-frontx/frontx-dashboard-widgets/testing` give it the lifecycles and the parts from the product's own bundle (`new DashboardRoot({ host, entries: WIDGET_ENTRIES })` with `composeServedFile(file, IN_BUNDLE_PARTS)`). It is a test path: the widgets' CSS stays outside their shadow roots, so a browser shows them unstyled.
