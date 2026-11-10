# Embedding a dashboard in a product

This guide is for a product team that shows template dashboards inside its own React application, with no FrontX shell. The dashboard is a React component; each widget inside it is a FrontX MFE that the dashboard loads at runtime from its own widget bundle and mounts in its own shadow root. The product app does not contain the widgets: adding a widget type or shipping a fixed one is a publication of its bundle, not a rebuild of the app.

## Get the template

The two packages of the template, `@gears-frontx/frontx-dashboard-root` (`src-app/mfe_packages/dashboard`) and `@gears-frontx/frontx-dashboard-widgets` (`src-app/mfe_packages/widgets`), are not published to npm, and the template has no `frontx-template.json` manifest yet, so `frontx add` cannot apply it. Today a product gets it this way:

1. Clone the whole `gears-frontx-templates` repository, not only `template-dashboard`, at a commit the product has reviewed, and review the diff each time the product moves it: the product then runs this repository's build scripts and package code. The widget bundle build imports the FrontX manifest build plugin from `template-shell/src/build` of this repository (`src-app/mfe_packages/widgets/vite.bundle.config.ts`), so a copy of `template-dashboard` alone fails to build the bundles with `Could not resolve "../../../../template-shell/src/build/mf-gts"`.
2. Build the bundles in the clone: `cd template-dashboard && npm ci && npm run build:widgets` (see [Host the widget bundles](#host-the-widget-bundles)).
3. Connect the two packages to the product as workspace members: keep the clone inside the product's repository and add `<clone>/template-dashboard/src-app/mfe_packages/*` to the `workspaces` of the product's `package.json`, then `npm install`. The packages pin their dependencies to exact published versions, the same ones the template's dev harness tests.

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

The dashboard reads the served file and the parts on the list on each page load: `fetchHost({ fileUrl, widgetList })` joins them, and so does `createMockHost({ widgetList })`. A product that answers `loadFile` with its own code joins them itself with `composeServedFile(file, ...(await loadWidgetParts(widgetListUrl, signal)))`, or its backend serves the joined file and no list at all. A part that cannot be read, or does not answer within 10 seconds, is left out with one console line; only the cells of its widget types fail. A part that is read but that the registry rejects (a duplicate or malformed type) fails the whole served file, like any other item of it.

### Add a widget type of the product

A widget type the template does not define ships the same way, with no change to the template or the app:

1. Make a bundle directory like `host/widget-bundles/deploy_pulse/` of this template: `mfe.json` (the manifest id, the remote entry address and the one entry), `lifecycle.tsx` (a renderer passed to `createWidgetLifecycle` from `@gears-frontx/frontx-dashboard-widgets/lifecycle`, as the default export), and `served.gts.json` with the new widget type and its data type (the widget type's `entry` trait names the entry in `mfe.json`). Use the product's own vendor in the ids, as `acme.analytics` does there. The data a widget's transform returns must not carry any GTS identity field at its top level: a result with `type`, `schema`, `$id`, `$schema`, `gtsId`, `gtsIid`, `gtsOid`, `gtsI`, `gtsTid`, `gtsType`, `gtsT`, `gts_id`, `gts_iid`, `gts_oid`, `gts_t`, `gts_tid` or `gts_type` fails its cell, and an `id` is replaced by the one the dashboard stamps; nest such a value under another key of the data type.
2. Build it into the same output: `WIDGET_BUNDLES_DIR=<the directory holding it> node src-app/mfe_packages/widgets/build-bundles.mjs deploy_pulse` (from `template-dashboard`). The build adds the bundle's types to its part and the part to `widgets.json`, which lists every part in `dist/`: remove the `dist/<widget_type>/` of a bundle the product no longer ships. A bundle that draws with recharts shares it with the catalog charts when it is named in `WIDGET_CHART_BUNDLES` (a comma list); otherwise it carries its own copy.
3. Publish the bundle directory and add its part's address to the published `widgets.json`. The published list is the product's: the `widgets.json` the build writes lists only what is in the local `dist/`, so on a release machine that built one bundle it is not the complete list. Dashboards can name the new type on the next page load.

### Replace a template widget type

To ship a fixed `pie_chart`, change its code, run `npm run build:widgets -- pie_chart`, and publish only `dist/pie_chart/`: its part keeps its address, so the published `widgets.json` does not change, and the other bundles stay as they are. The fix shows on the next page load. A fix keeps the type's `render` and data schemas; an incompatible change is a new widget type version.

To point a template widget type at a bundle of the product instead, build the product's bundle as above and set the template type's `entry` trait to the product's entry id in the product's copy of the served file; the template's copy does not change. To roll back, publish the previous bundle and its part again.

### Bundle addresses, CORS and same origin

- The dashboard loads a bundle only from an allowed origin: the page's own origin by default. Bundles under the app's own origin need nothing more.
- To serve bundles from another origin, such as a CDN, list it when creating the root: `new DashboardRoot({ host, bundleOrigins: [location.origin, 'https://cdn.example.com'] })`, and build with `WIDGET_BUNDLE_BASE` set to that address. The CDN must answer the page origin with `Access-Control-Allow-Origin` for the chunks and the shared modules: the handler reads them with `fetch`, not with `<script>` tags. The stylesheets are added as `<link>` elements and need no CORS. A trailing slash on `WIDGET_BUNDLE_BASE` is optional, and a base address in `bundleOrigins` counts as its origin. An entry whose manifest points to an origin that is not listed fails its cells, with a console line naming the address.
- A bundle is code that runs in the page with the app's rights. Serve bundles only from servers the product controls; the template checks the origin of every address a bundle names, not the content. The FrontX MF handler follows HTTP redirects when it fetches a chunk or a shared module, and the template cannot see the final address: never redirect a bundle path to a server that is not allowed.

## Answer the requests

`fetchHost({ fileUrl })` answers both kinds of request over the page's own origin: the served file from `fileUrl`, and each data request at its `path`, with the method and body the dashboard names. A product whose API needs its own client, headers or session writes its own host instead:

```ts
import type { DashboardHost } from '@gears-frontx/frontx-dashboard-root';

export const productHost: DashboardHost = {
  // The dashboard request: the served file.
  loadFile: (signal) => api.get('/dashboards/gts-file', { signal }),
  // A data request of a binding: answer with the parsed JSON body.
  request: ({ method, path, body }, signal) => (method === 'GET' ? api.get(path, { signal }) : api.post(path, body, { signal })),
};
```

Rules the dashboard applies to every answer:

- It hands over only `GET` and `POST` requests whose `path` is a same-origin absolute path, such as `/api/demo/summary?team=web`.
- It waits at most 30 seconds. A rejected promise or a late answer fails every cell that depends on the request; the other cells keep working. Nothing is retried.
- The answer is the JSON value the binding's transform reads as `response`. Each widget's transform turns it into that widget's data; the data is then checked against the widget's data type, and data that does not fit fails only that cell.
- A request that several widgets name in the dashboard's `requests` object is sent once per dashboard load.

The product's API owns authentication, access and errors. Every viewer who may see a dashboard must be able to get its widgets' data.

## Mock data

`createMockHost()` answers the demo dashboard from fixtures after a 300 ms delay, so the template runs without a backend:

```ts
import { createMockHost, DashboardRoot } from '@gears-frontx/frontx-dashboard-root';

const root = new DashboardRoot({ host: createMockHost({ delayMs: 300, widgetList: '/widgets/widgets.json' }) });
```

To mock the product's own endpoints, copy `src-app/mfe_packages/dashboard/src/mock/mockHost.ts`: add one entry per path to `FIXTURES` (the path without its query string maps to a function that returns the response body), and pass the product's served file as `file`. A fixture that throws answers as a failed request.

## What shows when something fails

- A cell whose request, transform, data or widget fails shows "This widget cannot be shown"; the rest of the dashboard is unaffected. The same holds for a widget bundle that does not load, answers 404 or throws while it loads: only the cells of that widget type fail.
- A served file that cannot be loaded or registered, an unknown dashboard id, or a dashboard that fails its type shows "This dashboard cannot be shown".
- Each failure writes one line to the browser console naming the dashboard, the widget and the failing step. The viewer never sees the cause.

## Try it

`npm run build:widgets`, then `npm run dev:host`, serves `host/`, a plain React application with no FrontX shell that embeds the demo dashboard on the mock host at http://127.0.0.1:5198/. The app's own bundle holds no widget: the dev server serves `src-app/mfe_packages/widgets/dist/` under `/widgets/`, read from disk on every request, and the dashboard loads each widget from there. Its buttons switch the theme, leave and reopen the dashboard, and open an unknown dashboard id. `npm run build:host` and `npm run preview:host` run the same app from its production build on http://127.0.0.1:5197/.

To see a widget type the app never saw, build the product bundles of `host/widget-bundles` (`WIDGET_BUNDLES_DIR=host/widget-bundles node src-app/mfe_packages/widgets/build-bundles.mjs`) and open `?dashboard=gts.frontx.dashboard.dashboard.dashboard.v1~8d3a4f5e-6b7c-4d8e-9f0a-1b2c3d4e5f60`. The dashboard `gts.frontx.dashboard.dashboard.dashboard.v1~9e4b5a6f-7c8d-4e9f-8a0b-2c3d4e5f6a71` shows a bundle that throws while it loads and one whose files are missing, each failing only its own cell.

In tests the root runs the catalog widgets without bundles: `WIDGET_ENTRIES` and `IN_BUNDLE_PARTS` from `@gears-frontx/frontx-dashboard-widgets/testing` give it the lifecycles and the parts from the product's own bundle (`new DashboardRoot({ host, entries: WIDGET_ENTRIES })` with `composeServedFile(file, IN_BUNDLE_PARTS)`). It is a test path: the widgets' CSS stays outside their shadow roots, so a browser shows them unstyled.
