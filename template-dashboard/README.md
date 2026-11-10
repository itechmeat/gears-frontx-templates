# template-dashboard: development harness

This folder holds the dashboard template's architecture documents (`architecture/`) and its two packages under `src-app/mfe_packages/`: `dashboard` (the contract, the bundle schemas, the dashboard root with its runtime and cell frame, the served catalog file and a mock host) and `widgets` (the catalog widgets and their MFE lifecycles). A product team embeds a dashboard as described in [docs/embedding.md](docs/embedding.md). The `package.json` here is a development harness, not part of the template: it installs both packages as workspaces and runs their type check and tests in one place.

```bash
npm ci
npm run type-check
npm test
```

## Dev preview

`preview/` is a dev-only page that mounts the dashboard area, the cell frame and the catalog widgets in a real browser, over invented, vendor-neutral demo data. It is not part of the template and no template manifest ships it. It checks layout, themes, legends, tooltips, the larger view and drill-down of the widget components by eye and with browser tools.

```bash
npm run dev:preview   # serves http://127.0.0.1:5199/
```

Query options:

- `?theme=light` or `?theme=dark` sets the kit theme; without it the page follows the system colour scheme.
- `?view=grid500` shows one grid of 500 rows on one page, mounted by the "Mount grid" button, for timing the first render, a sort and scrolling.

## Dev host

`host/` is a dev-only plain React application with no FrontX shell. It embeds the demo dashboard as a component, through the real runtime, on the mock host: the served file, the GTS registration, the widget MFEs in their shadow roots and every binding run as in a product.

```bash
npm run dev:host   # serves http://127.0.0.1:5198/
```

Query options: `?theme=dark`, `?dashboard=<dashboard id>`, `?delay=<ms>` (the mock host's answer delay).
