# Embedding a dashboard in a product

This guide is for a product team that shows template dashboards inside its own React application, with no FrontX shell. The dashboard is a React component; each widget inside it is a FrontX MFE that the dashboard mounts in its own shadow root.

## What the product provides

- **A host.** An object with two functions that answer the dashboard's requests. The dashboard never reaches the network itself.
- **The served file.** One JSON object `{"types": [...], "instances": [...]}`: the widget types and data types, the widget manifest and entries, and the dashboards. Start from `src-app/mfe_packages/dashboard/served/catalog.gts.json` and add the product's dashboards to `instances`.
- **The widget entries.** `WIDGET_ENTRIES` from the `widgets` package, bundled with the product.
- **A dashboard id, a theme id and a language.** The theme ids `dark`, `dracula` and `dracula-large` give the kit's dark scope; any other id gives the light scope.

## Embed the component

Create one dashboard root for the application, then render `<Dashboard>` wherever a dashboard shows. One `<Dashboard>` per root is on screen at a time.

```tsx
import '@gears-frontx/ui-kit/theme.css';
import { Dashboard, DashboardRoot, fetchHost } from '@gears-frontx/frontx-dashboard-root';
import { WIDGET_ENTRIES } from '@gears-frontx/frontx-dashboard-widgets';

const dashboards = new DashboardRoot({
  host: fetchHost({ fileUrl: '/insight/dashboards.gts.json' }),
  entries: WIDGET_ENTRIES,
});

export function DashboardPage({ id, theme, language }: { id: string; theme: string; language: string }) {
  return <Dashboard root={dashboards} dashboardId={id} theme={theme} language={language} />;
}
```

A theme or language change restyles the widgets in place; nothing is fetched again. A new `dashboardId` loads that dashboard. Leaving the page and coming back to the same dashboard runs its data requests again but does not fetch the served file again.

## Answer the requests

`fetchHost({ fileUrl })` answers both kinds of request over the page's own origin: the served file from `fileUrl`, and each data request at its `path`, with the method and body the dashboard names. A product whose API needs its own client, headers or session writes its own host instead:

```ts
import type { DashboardHost } from '@gears-frontx/frontx-dashboard-root';

export const insightHost: DashboardHost = {
  // The dashboard request: the served file.
  loadFile: (signal) => api.get('/dashboards/gts-file', { signal }),
  // A data request of a binding: answer with the parsed JSON body.
  request: ({ method, path, body }, signal) => (method === 'GET' ? api.get(path, { signal }) : api.post(path, body, { signal })),
};
```

Rules the dashboard applies to every answer:

- It hands over only `GET` and `POST` requests whose `path` is a same-origin absolute path, such as `/api/insight/summary?team=web`.
- It waits at most 30 seconds. A rejected promise or a late answer fails every cell that depends on the request; the other cells keep working. Nothing is retried.
- The answer is the JSON value the binding's transform reads as `response`. Each widget's transform turns it into that widget's data; the data is then checked against the widget's data type, and data that does not fit fails only that cell.
- A request that several widgets name in the dashboard's `requests` object is sent once per dashboard load.

The product's API owns authentication, access and errors. Every viewer who may see a dashboard must be able to get its widgets' data.

## Mock data

`createMockHost()` answers the demo dashboard from fixtures after a 300 ms delay, so the template runs without a backend:

```ts
import { createMockHost, DashboardRoot } from '@gears-frontx/frontx-dashboard-root';

const root = new DashboardRoot({ host: createMockHost({ delayMs: 300 }), entries: WIDGET_ENTRIES });
```

To mock the product's own endpoints, copy `src-app/mfe_packages/dashboard/src/mock/mockHost.ts`: add one entry per path to `FIXTURES` (the path without its query string maps to a function that returns the response body), and pass the product's served file as `file`. A fixture that throws answers as a failed request.

## What shows when something fails

- A cell whose request, transform, data or widget fails shows "This widget cannot be shown"; the rest of the dashboard is unaffected.
- A served file that cannot be loaded or registered, an unknown dashboard id, or a dashboard that fails its type shows "This dashboard cannot be shown".
- Each failure writes one line to the browser console naming the dashboard, the widget and the failing step. The viewer never sees the cause.

## Try it

`npm run dev:host` serves `host/`, a plain React application with no FrontX shell that embeds the demo dashboard on the mock host at http://127.0.0.1:5198/. Its buttons switch the theme, leave and reopen the dashboard, and open an unknown dashboard id.
