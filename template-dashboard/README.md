# template-dashboard: development harness

This folder holds the dashboard template's architecture documents (`architecture/`) and its two packages under `src-app/mfe_packages/`: `dashboard` (the contract, the layout and the cell frame of the dashboard root) and `widgets` (the catalog widgets). The `package.json` here is a development harness, not part of the template: it installs both packages as workspaces and runs their type check and tests in one place.

```bash
npm ci
npm run type-check
npm test
```

## Dev preview

`preview/` is a dev-only page that mounts the dashboard area, the cell frame and the catalog widgets in a real browser, over invented, vendor-neutral demo data. It is not part of the template and no template manifest ships it. It exists to check layout, themes, legends, tooltips, the larger view and drill-down by eye and with browser tools until the template has its own runtime.

```bash
npm run dev:preview   # serves http://127.0.0.1:5199/
```

Query options:

- `?theme=light` or `?theme=dark` sets the kit theme; without it the page follows the system colour scheme.
- `?view=grid500` shows one grid of 500 rows on one page, mounted by the "Mount grid" button, for timing the first render, a sort and scrolling.
