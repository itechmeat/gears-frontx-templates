import { StrictMode, useState } from 'react';
import { renderToString } from 'react-dom/server';
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { ActionHandler, MfeHandlerMF, type ChildMfeBridge, type MfeEntryLifecycle } from '@gears-frontx/mfes';
import { afterEach, describe, expect, it, onTestFinished, vi } from 'vitest';

import { LANGUAGE_PROPERTY_ID, OVERLAY_CONTAINER_PROPERTY_ID, RENDER_WIDGET_ACTION_ID, THEME_PROPERTY_ID, WIDGETS_DOMAIN_ID, type ServedFile } from '../contract';
import { BUNDLE_TYPES, IN_BUNDLE_PARTS, WIDGET_ENTRIES } from '@gears-frontx/frontx-dashboard-widgets/testing';
import { createMockHost, DEMO_DASHBOARD_ID, DEMO_SERVED_FILE as DEMO_WITHOUT_BUNDLES } from '../mock/mockHost';
import { composeServedFile } from './served';

/** The demo file with the catalog bundles' parts, as a product serves it. */
const DEMO_SERVED_FILE = composeServedFile(DEMO_WITHOUT_BUNDLES, IN_BUNDLE_PARTS);
import { SharedRequests } from './binding';
import { Dashboard, type DashboardProps } from './Dashboard';
import { DashboardRoot, RENDER_RESERVED_FIELDS } from './DashboardRoot';
import { fetchHost, type DashboardHost } from './host';
import { extensionIdOf, renderStampIdOf, stampIdOf } from './ids';

/*
 * The runtime on the real FrontX registry and gts-plugin, in a simulated DOM:
 * the demo dashboard through the mock host, with stand-in widget entries that
 * write what they receive into their shadow root.
 */

const ENTRY = 'gts.frontx.mfes.mfe.entry.v1~frontx.mfes.mfe.entry_mf.v1~frontx.dashboard.mfe.';
/** The render type of the catalog pie chart, which stamps every pie cell's render. */
const PIE_RENDER = 'gts.frontx.dashboard.widget.render.v1~frontx.dashboard.widget.pie_chart_render.v1~';

/** The catalog entry of a widget type, keeping every render_widget payload the root sends it in `sent` before the widget takes it. */
const recordingEntryOf = (widgetType: string, sent: Record<string, unknown>[]) => (): MfeEntryLifecycle => {
  const real = WIDGET_ENTRIES[`${ENTRY}${widgetType}.v1`]();
  return {
    mount: (container, bridge, context) =>
      real.mount(
        container,
        new Proxy(bridge, {
          get: (target, key) => {
            if (key === 'registerActionHandler') {
              return (id: string, handler: ActionHandler) =>
                target.registerActionHandler(
                  id,
                  ActionHandler.fromFunction(async (type, payload) => {
                    if (id === RENDER_WIDGET_ACTION_ID && payload) sent.push(payload);
                    return handler.handleAction(type, payload);
                  }),
                );
            }
            const value = target[key as keyof ChildMfeBridge];
            if (typeof value === 'function') return (value as (...args: unknown[]) => unknown).bind(target);
            return value;
          },
        }),
        context,
      ),
    unmount: (container) => real.unmount(container),
  };
};

const TYPES = ['summary_card', 'metric_card', 'ranked_list_card', 'progress_list_card', 'radial_progress', 'grid', 'cartesian_chart', 'pie_chart', 'radar_chart', 'treemap_chart', 'waterfall_chart', 'activity_feed', 'funnel_chart', 'heatmap', 'markdown_card'];

/** A widget entry that shows the theme, the language and the keys of the data it receives, redrawn when a property changes. */
function probeEntry(): MfeEntryLifecycle {
  let root: HTMLElement | undefined;
  let bridge: ChildMfeBridge | undefined;
  let received: { render: Record<string, unknown>; data?: Record<string, unknown> } | undefined;
  let unsubscribe: (() => void)[] = [];
  const draw = () => {
    if (!root || !received) return;
    // The stamped render id the widget receives, kept out of the text the other tests read.
    root.dataset.render = String(received.render.id ?? '');
    root.textContent = `theme ${String(bridge?.getProperty(THEME_PROPERTY_ID)?.value)}; language ${String(bridge?.getProperty(LANGUAGE_PROPERTY_ID)?.value)}; data ${Object.keys(received.data ?? {}).sort().join(',')}`;
  };
  return {
    mount(container, childBridge) {
      bridge = childBridge;
      root = document.createElement('output');
      root.textContent = 'mounted';
      container.appendChild(root);
      unsubscribe = [THEME_PROPERTY_ID, LANGUAGE_PROPERTY_ID].map((id) => childBridge.subscribeToProperty(id, draw));
      childBridge.registerActionHandler(
        RENDER_WIDGET_ACTION_ID,
        ActionHandler.fromFunction(async (_type, payload) => {
          received = payload as { render: Record<string, unknown>; data?: Record<string, unknown> };
          draw();
        }),
      );
    },
    unmount() {
      unsubscribe.forEach((stop) => stop());
      root?.remove();
    },
  };
}

/** The value the demo host gives for the period the demo requests name. */
const DEMO_VARIABLES = { period: '30d' };

const entries = Object.fromEntries(TYPES.map((type) => [`${ENTRY}${type}.v1`, probeEntry]));

const shadowTexts = (container: HTMLElement) =>
  [...container.querySelectorAll<HTMLElement>('[data-widget-extension]')].map((host) => host.shadowRoot?.querySelector('output')?.textContent ?? '');

/** The element the overlay container property holds (the `element` of its holder), null for none, undefined when unset. */
const elementIn = (value: unknown) => (value === null ? null : (value as { element?: unknown } | undefined)?.element);

afterEach(() => {
  // Here, not at the end of a test that turns fake timers on, so a failing assertion never leaves them on.
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('Dashboard on the real registry', () => {
  it('shows every cell of the demo dashboard and keeps the failing request in its own cell', async () => {
    const errors = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const root = new DashboardRoot({ host: createMockHost({ delayMs: 0, file: DEMO_SERVED_FILE }), entries, origin: 'http://localhost' });
    const { container } = render(<Dashboard root={root} dashboardId={DEMO_DASHBOARD_ID} theme="dark" language="en" variables={DEMO_VARIABLES} />);
    const cells = (DEMO_SERVED_FILE.instances.find((instance) => instance.id === DEMO_DASHBOARD_ID) as { layout: { cells: { widget: { id: string } }[] } }).layout.cells;
    const markdownCards = cells.filter((cell) => cell.widget.id.includes('.markdown_card.')).length;
    expect(markdownCards).toBe(3);
    await waitFor(() => expect(shadowTexts(container).filter((text) => text.startsWith('theme dark'))).toHaveLength(cells.length - 1), { timeout: 5000 });
    // The failing API path fails one cell; the dashboard and every other cell show.
    expect(screen.getAllByText('This widget cannot be shown')).toHaveLength(1);
    expect(errors.mock.calls.some(([line]) => String(line).includes('/api/demo/broken'))).toBe(true);
    // Data widgets get stamped data; the markdown cards (the section headings among them) get none.
    // The data keys show sorted, so the stamped id is one key among them, not always the first.
    expect(shadowTexts(container).filter((text) => /; data (.+,)?id(,|$)/.test(text))).toHaveLength(cells.length - 1 - markdownCards);
    // A widget's description shows under its title in the cell header.
    expect(screen.getByText('Commits and pull requests per repository').previousElementSibling?.textContent).toBe('Top repositories by commits');
    errors.mockRestore();
  }, 15_000);

  it('fails only the cells of a served widget part the registry rejects, and renders the rest of the dashboard', async () => {
    const errors = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    // The served widget list names one part per catalog bundle, each with the types its bundle declares; the pie
    // chart's manifest is one the registry rejects.
    const parts = TYPES.map((type) => ({
      types: BUNDLE_TYPES[type] ?? [],
      instances: IN_BUNDLE_PARTS.instances
        .filter((instance) => String(instance.id).endsWith(`.${type}.v1`))
        .map((instance) => (type === 'pie_chart' && String(instance.id).includes('mf_manifest') ? { ...instance, name: 7 } : instance)),
    }));
    vi.stubGlobal('fetch', (input: RequestInfo | URL) => {
      const url = String(input);
      const body = url.endsWith('/widgets.json') ? TYPES.map((type) => `${type}/widget.gts.json`) : parts[TYPES.indexOf(url.match(/\/(\w+)\/widget\.gts\.json$/)![1])];
      return Promise.resolve(new Response(JSON.stringify(body), { status: 200 }));
    });
    const root = new DashboardRoot({ host: createMockHost({ delayMs: 0, file: DEMO_WITHOUT_BUNDLES, widgetList: '/widgets/widgets.json' }), entries, origin: 'http://localhost' });
    const { container } = render(<Dashboard root={root} dashboardId={DEMO_DASHBOARD_ID} theme="light" language="en" variables={DEMO_VARIABLES} />);
    const cells = (DEMO_WITHOUT_BUNDLES.instances.find((instance) => instance.id === DEMO_DASHBOARD_ID) as { layout: { cells: { widget: { id: string } }[] } }).layout.cells;
    const pies = cells.filter((cell) => cell.widget.id.includes('.pie_chart.')).length;
    expect(pies).toBeGreaterThan(0);
    // Every cell but the pie charts (the failing API path is one of them) shows its widget.
    await waitFor(() => expect(shadowTexts(container).filter((text) => text.startsWith('theme light'))).toHaveLength(cells.length - pies), { timeout: 5000 });
    await waitFor(() => expect(screen.getAllByText('This widget cannot be shown')).toHaveLength(pies));
    expect(screen.queryByText('This dashboard cannot be shown')).toBeNull();
    // Each failed cell names the part's reason in its own line (the part's own line is proven in register.test.ts).
    expect(errors.mock.calls.filter(([line]) => String(line).includes('pie_chart.v1~') && String(line).includes('is left out'))).toHaveLength(pies);
  }, 15_000);

  it('mounts the product entry of a re-pointed pie_chart with each pie cell\'s render and data', async () => {
    const errors = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    // Way (b) of "Replace a template widget type": the catalog pie bundle stays off the served widget list, and the
    // product's own part carries the pie widget type with its `entry` trait set to the product's entry, the catalog
    // render and data types unchanged, and the product bundle's manifest and entry.
    const PIE = 'gts.frontx.dashboard.widget.widget.v1~frontx.dashboard.widget.data_widget.v1~frontx.dashboard.widget.pie_chart.v1~';
    const PIE_DATA = 'gts.frontx.dashboard.widget_data.widget_data.v1~frontx.dashboard.widget_data.pie_chart.v1~';
    const PRODUCT_MANIFEST = 'gts.frontx.mfes.mfe.mf_manifest.v1~frontx.product.widgets.pie_chart.v1';
    const PRODUCT_ENTRY = 'gts.frontx.mfes.mfe.entry.v1~frontx.mfes.mfe.entry_mf.v1~frontx.product.mfe.pie_chart.v1';
    const catalogPie = IN_BUNDLE_PARTS.types.find((type) => String(type.$id) === `gts://${PIE}`)!;
    const catalogManifest = IN_BUNDLE_PARTS.instances.find((instance) => String(instance.id).endsWith('.widgets.pie_chart.v1'))!;
    const catalogEntry = IN_BUNDLE_PARTS.instances.find((instance) => instance.id === `${ENTRY}pie_chart.v1`)!;
    const product = {
      types: [
        { ...catalogPie, 'x-gts-traits': { ...((catalogPie as { 'x-gts-traits'?: Record<string, unknown> })['x-gts-traits'] ?? {}), entry: PRODUCT_ENTRY } },
        ...BUNDLE_TYPES.pie_chart.filter((type) => String(type.$id) !== `gts://${PIE}`),
      ],
      instances: [{ ...catalogManifest, id: PRODUCT_MANIFEST }, { ...catalogEntry, id: PRODUCT_ENTRY, manifest: PRODUCT_MANIFEST }],
    };
    const otherParts = {
      types: IN_BUNDLE_PARTS.types.filter((type) => !BUNDLE_TYPES.pie_chart.includes(type)),
      instances: IN_BUNDLE_PARTS.instances.filter((instance) => !String(instance.id).endsWith('.pie_chart.v1')),
    };
    const file = composeServedFile(DEMO_WITHOUT_BUNDLES, otherParts, product);
    // The pie cells of the demo dashboard, in file order: the CI pie, the capacity pie, and the one whose data
    // request is the demo's own failing API path.
    const demo = file.instances.find((instance) => instance.id === DEMO_DASHBOARD_ID) as {
      layout: { cells: { widget: { id: string; title: string; render: Record<string, unknown>; data: { params?: { split?: unknown }; transform: string } } }[] };
    };
    const pies = demo.layout.cells.filter((cell) => cell.widget.id.includes('.pie_chart.'));
    expect(pies.map((cell) => cell.widget.title)).toEqual(['CI runs by outcome', 'Review capacity', 'Incidents (failing API)']);
    const [ciPie, capacityPie, failingPie] = pies;
    // The data the CI pie cell requests in the demo, as the mock API answers it for the period the host passes.
    const mock = createMockHost({ delayMs: 0, file });
    const outcomes = (await mock.request({ method: 'GET', path: '/api/demo/ci/outcomes?period=30d' }, new AbortController().signal)) as Record<string, number>;
    // A product entry whose lifecycle records every mount and every render_widget payload it is given.
    const served: { render: Record<string, unknown>; data: Record<string, unknown> }[] = [];
    let productMounts = 0;
    const productEntry = (): MfeEntryLifecycle => ({
      mount(container, bridge) {
        productMounts += 1;
        const output = document.createElement('output');
        output.textContent = 'mounted';
        container.appendChild(output);
        bridge.registerActionHandler(
          RENDER_WIDGET_ACTION_ID,
          ActionHandler.fromFunction(async (_type, payload) => {
            const { render, data } = payload as { render: Record<string, unknown>; data: Record<string, unknown> };
            served.push({ render, data });
            output.textContent = `mounted; data ${Object.keys(data ?? {}).sort().join(',')}`;
          }),
        );
      },
      unmount() {},
    });
    // The catalog pie entry stays in the map, counted: a re-pointed cell must never reach it.
    let catalogPieMounts = 0;
    const countedCatalogPie = () => ((catalogPieMounts += 1), probeEntry());
    const root = new DashboardRoot({ host: mock, entries: { ...entries, [`${ENTRY}pie_chart.v1`]: countedCatalogPie, [PRODUCT_ENTRY]: productEntry }, origin: 'http://localhost' });
    const { container } = render(<Dashboard root={root} dashboardId={DEMO_DASHBOARD_ID} theme="light" language="en" variables={DEMO_VARIABLES} />);
    await waitFor(() => expect(served).toHaveLength(2), { timeout: 5000 });
    await new Promise((resolve) => setTimeout(resolve, 300));
    expect(served).toHaveLength(2);
    // The product entry mounted for each pie cell of the dashboard, and for no other cell.
    expect(productMounts).toBe(pies.length);
    expect(shadowTexts(container).filter((text) => text.includes('data id,slices'))).toHaveLength(2);
    const stampOf = (cell: (typeof pies)[number]) => renderStampIdOf(PIE_RENDER, cell.widget.id, 'cell');
    const servedFor = (cell: (typeof pies)[number]) => served.find((payload) => payload.render.id === stampOf(cell))!;
    // Each render_widget carries the pie cell's render, stamped with the pie render type the product's copy names, and the pie cell's data.
    expect(servedFor(ciPie).render).toEqual({ ...ciPie.widget.render, id: stampOf(ciPie) });
    expect(servedFor(ciPie).data).toEqual({
      id: stampIdOf(PIE_DATA, ciPie.widget.id, 'cell'),
      slices: [
        { label: 'Passed', value: outcomes.passed },
        { label: 'Failed', value: outcomes.failed },
        { label: 'Cancelled', value: outcomes.cancelled },
        { label: 'Skipped', value: outcomes.skipped },
      ],
    });
    expect(servedFor(capacityPie).render).toEqual({ ...capacityPie.widget.render, id: stampOf(capacityPie) });
    expect(servedFor(capacityPie).data).toEqual({ id: stampIdOf(PIE_DATA, capacityPie.widget.id, 'cell'), slices: capacityPie.widget.data.params!.split });
    // The failing-API pie cell keeps the cannot-be-shown state the demo shows for it without the re-point, with its
    // own request line; no pie cell fails for the re-point.
    await waitFor(() => expect(screen.getAllByText('This widget cannot be shown')).toHaveLength(1), { timeout: 5000 });
    const lines = errors.mock.calls.map(([line]) => String(line));
    expect(lines).toHaveLength(1);
    expect(lines[0]).toContain(failingPie.widget.id);
    expect(lines[0]).toContain('/api/demo/broken');
    expect(catalogPieMounts).toBe(0);
    errors.mockRestore();
  }, 15_000);

  it('passes bundleOrigins to the entry handler: a bundle on another origin fails only its own cells, before any fetch', async () => {
    const errors = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const load = vi.spyOn(MfeHandlerMF.prototype, 'load').mockRejectedValue(new Error('no bundle server in jsdom'));
    // The grid has no in-bundle entry, so it loads from its bundle, whose manifest names a path on the page origin:
    // allowed by default, refused once the product lists only a CDN.
    const { [`${ENTRY}grid.v1`]: _grid, ...withoutGrid } = entries;
    const root = new DashboardRoot({ host: createMockHost({ delayMs: 0, file: DEMO_SERVED_FILE }), entries: withoutGrid, origin: globalThis.location.origin, bundleOrigins: ['https://cdn.example.com/analytics/widgets/'] });
    const { container } = render(<Dashboard root={root} dashboardId={DEMO_DASHBOARD_ID} theme="light" language="en" variables={DEMO_VARIABLES} />);
    const cells = (DEMO_SERVED_FILE.instances.find((instance) => instance.id === DEMO_DASHBOARD_ID) as { layout: { cells: { widget: { id: string } }[] } }).layout.cells;
    const grids = cells.filter((cell) => cell.widget.id.includes('.grid.v1~')).length;
    expect(grids).toBeGreaterThan(0);
    await waitFor(() => expect(shadowTexts(container).filter((text) => text.startsWith('theme light'))).toHaveLength(cells.length - grids - 1), { timeout: 5000 });
    expect(screen.getAllByText('This widget cannot be shown')).toHaveLength(grids + 1);
    expect(errors.mock.calls.some(([line]) => String(line).includes('outside the allowed bundle origins'))).toBe(true);
    expect(load).not.toHaveBeenCalled();
  }, 15_000);

  it.each([['an opaque address', 'data:,x'], ['a bare host name', 'localhost']])('allows nothing for %s in bundleOrigins', async (_name, listed) => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const load = vi.spyOn(MfeHandlerMF.prototype, 'load').mockRejectedValue(new Error('no bundle server in jsdom'));
    const { [`${ENTRY}grid.v1`]: _grid, ...withoutGrid } = entries;
    const root = new DashboardRoot({ host: createMockHost({ delayMs: 0, file: DEMO_SERVED_FILE }), entries: withoutGrid, origin: globalThis.location.origin, bundleOrigins: [listed] });
    const { container } = render(<Dashboard root={root} dashboardId={DEMO_DASHBOARD_ID} theme="light" language="en" variables={DEMO_VARIABLES} />);
    await waitFor(() => expect(shadowTexts(container).filter((text) => text.startsWith('theme light')).length).toBeGreaterThan(10), { timeout: 5000 });
    await waitFor(() => expect(screen.getAllByText('This widget cannot be shown').length).toBeGreaterThan(1), { timeout: 5000 });
    expect(load).not.toHaveBeenCalled();
  }, 15_000);

  it('reads a base address in bundleOrigins as its origin', async () => {
    const errors = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const load = vi.spyOn(MfeHandlerMF.prototype, 'load').mockRejectedValue(new Error('no bundle server in jsdom'));
    const { [`${ENTRY}grid.v1`]: _grid, ...withoutGrid } = entries;
    const root = new DashboardRoot({ host: createMockHost({ delayMs: 0, file: DEMO_SERVED_FILE }), entries: withoutGrid, origin: globalThis.location.origin, bundleOrigins: [`${globalThis.location.origin}/widgets/`] });
    render(<Dashboard root={root} dashboardId={DEMO_DASHBOARD_ID} theme="light" language="en" variables={DEMO_VARIABLES} />);
    await waitFor(() => expect(load).toHaveBeenCalled(), { timeout: 5000 });
    expect(errors.mock.calls.some(([line]) => String(line).includes('outside the allowed bundle origins'))).toBe(false);
  }, 15_000);

  it('shows the dashboard-level state for an unknown dashboard id', async () => {
    const errors = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const root = new DashboardRoot({ host: createMockHost({ delayMs: 0, file: DEMO_SERVED_FILE }), entries });
    render(<Dashboard root={root} dashboardId="gts.frontx.dashboard.dashboard.dashboard.v1~00000000-0000-4000-8000-000000000000" theme="light" language="en" />);
    expect(await screen.findByText('This dashboard cannot be shown')).toBeTruthy();
    expect(errors.mock.calls.some(([line]) => String(line).includes('no dashboard'))).toBe(true);
    errors.mockRestore();
  });

  describe('the frame choices of the layout', () => {
    const DESCRIPTION = 'Commits and pull requests per repository';
    /** The demo dashboard with only its described cell and these extra layout fields. */
    const showDescribed = (extra: Record<string, unknown>) => {
      const demo = DEMO_SERVED_FILE.instances.find((instance) => instance.id === DEMO_DASHBOARD_ID) as { layout: { cells: { widget: { description?: string } }[] } };
      const described = demo.layout.cells.find((cell) => cell.widget.description === DESCRIPTION);
      if (!described) throw new Error(`the demo dashboard has no cell described "${DESCRIPTION}"`);
      const file: ServedFile = { ...DEMO_SERVED_FILE, instances: [...DEMO_SERVED_FILE.instances.filter((instance) => instance.id !== DEMO_DASHBOARD_ID), { ...demo, layout: { cells: [described], ...extra } }] };
      const root = new DashboardRoot({ host: createMockHost({ delayMs: 0, file }), entries, origin: 'http://localhost' });
      return render(<Dashboard root={root} dashboardId={DEMO_DASHBOARD_ID} theme="dark" language="en" />);
    };

    it.each([
      ['without description_display', {}],
      ['with description_display line', { description_display: 'line' }],
    ])('draws the description as a line under the title %s', async (_name, extra) => {
      showDescribed(extra);
      const line = await screen.findByText(DESCRIPTION, {}, { timeout: 5000 });
      expect(line.getAttribute('title')).toBe(DESCRIPTION);
      expect(line.classList.contains('descriptionLine')).toBe(true);
      expect(line.previousElementSibling?.textContent).toBe('Top repositories by commits');
    });

    it('draws the description as a badge beside the cell actions with description_display badge', async () => {
      showDescribed({ description_display: 'badge' });
      const badge = (await screen.findByText(DESCRIPTION, {}, { timeout: 5000 })).parentElement!;
      expect(badge.classList.contains('description')).toBe(true);
      expect(badge.classList.contains('descriptionLine')).toBe(false);
      // The badge sits in the action group after the title, so it is no line under the title.
      expect(badge.parentElement!.previousElementSibling?.textContent).toBe('Top repositories by commits');
    });

    // The frame test owns the size of each value; here the layout's value reaches the frame.
    it.each([
      ['without card_size', {}, true],
      ['with card_size default', { card_size: 'default' }, false],
    ])('draws every framed cell as a kit card of the size the layout asks %s', async (_name, extra, small) => {
      showDescribed(extra);
      const title = await screen.findByText('Top repositories by commits', {}, { timeout: 5000 });
      expect(/sizeSm/.test(title.closest('[data-cell-frame="card"]')!.className)).toBe(small);
    });

    it('fails the dashboard for a card_size outside its values', async () => {
      const errors = vi.spyOn(console, 'error').mockImplementation(() => undefined);
      showDescribed({ card_size: 'large' });
      expect(await screen.findByText('This dashboard cannot be shown', {}, { timeout: 5000 })).toBeTruthy();
      errors.mockRestore();
    });

    it('fails the dashboard for a description_display outside its values', async () => {
      const errors = vi.spyOn(console, 'error').mockImplementation(() => undefined);
      showDescribed({ description_display: 'chip' });
      expect(await screen.findByText('This dashboard cannot be shown', {}, { timeout: 5000 })).toBeTruthy();
      expect(screen.queryByText(DESCRIPTION)).toBeNull();
      errors.mockRestore();
    });
  });

  it('keeps the dashboard-level console line on one line when its problem carries control characters', async () => {
    const errors = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const root = new DashboardRoot({ host: { ...createMockHost({ delayMs: 0 }), loadFile: () => Promise.reject(new Error('down\u2028[dashboard] faked\n\u0085line')) }, entries });
    render(<Dashboard root={root} dashboardId={DEMO_DASHBOARD_ID} theme="light" language="en" variables={DEMO_VARIABLES} />);
    expect(await screen.findByText('This dashboard cannot be shown')).toBeTruthy();
    const line = String(errors.mock.calls.find(([text]) => String(text).includes('cannot be shown'))?.[0]);
    expect(line).toContain('down\\u2028[dashboard] faked\\u000a\\u0085line');
    expect(line).not.toMatch(/[\u0000-\u001f\u007f-\u009f\u2028\u2029]/);
    errors.mockRestore();
  });

  it('keeps the cell-level console line on one line when the widget id carries control characters', async () => {
    const errors = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const root = new DashboardRoot({ host: createMockHost({ delayMs: 0, file: DEMO_SERVED_FILE }), entries, origin: 'http://localhost' });
    const widget = { id: 'gts.frontx.dashboard.widget.widget.v1~frontx.test.x\u2028[dashboard] faked\u0085y.v1~z', title: 'Forged', render: {} };
    const states: string[] = [];
    root.runCell({ dashboardId: DEMO_DASHBOARD_ID, widget, role: 'cell', shared: new SharedRequests({}, root.host, root.origin), update: (change) => void ('state' in change && states.push(change.state)) });
    await waitFor(() => expect(states).toContain('cannot-be-shown'));
    const line = String(errors.mock.calls.find(([text]) => String(text).includes('Forged') || String(text).includes('frontx.test.x'))?.[0]);
    expect(line).toContain('frontx.test.x\\u2028[dashboard] faked\\u0085y.v1~z');
    expect(line).not.toMatch(/[\u0000-\u001f\u007f-\u009f\u2028\u2029]/);
  });

  it('keeps the load-rejection console line to the first two lines of the error, escaped', async () => {
    const errors = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const root = new DashboardRoot({ host: createMockHost({ delayMs: 0, file: DEMO_SERVED_FILE }), entries });
    vi.spyOn(root, 'load').mockRejectedValue(new Error('first\u2028[dashboard] faked\nsecond\u0085line\nthird line'));
    render(<Dashboard root={root} dashboardId={`${DEMO_DASHBOARD_ID}\u2029`} theme="light" language="en" />);
    expect(await screen.findByText('This dashboard cannot be shown')).toBeTruthy();
    const line = String(errors.mock.calls.find(([text]) => String(text).includes('cannot be shown'))?.[0]);
    expect(line).toContain(`${DEMO_DASHBOARD_ID}\\u2029 cannot be shown: Error: first\\u2028[dashboard] faked second\\u0085line`);
    expect(line).not.toContain('third line');
    expect(line).not.toMatch(/[\u0000-\u001f\u007f-\u009f\u2028\u2029]/);
  });

  it('keeps the property console line on one line when the rejected value carries control characters', async () => {
    const errors = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const root = new DashboardRoot({ host: createMockHost({ delayMs: 60_000 }), entries, origin: 'http://localhost' });
    vi.spyOn(root.registry!, 'updateSharedProperty').mockImplementation(() => {
      throw new Error('rejected x\u2028[dashboard] faked\u0085y');
    });
    root.publish('dark', 'en');
    const lines = errors.mock.calls.map(([text]) => String(text)).filter((text) => text.includes('cannot be published'));
    expect(lines).toHaveLength(2);
    for (const line of lines) {
      expect(line).toContain('rejected x\\u2028[dashboard] faked\\u0085y');
      expect(line).not.toMatch(/[\u0000-\u001f\u007f-\u009f\u2028\u2029]/);
    }
  });

  it('fails only the cell whose render_widget chain ends in fallback', async () => {
    const errors = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const demo = DEMO_SERVED_FILE.instances.find((instance) => instance.id === DEMO_DASHBOARD_ID) as { layout: { cells: { widget: { id: string } }[] } };
    // One metric card and one pie chart; the metric card's entry refuses every render_widget.
    const cells = [demo.layout.cells.find((cell) => cell.widget.id.includes('.metric_card.')), demo.layout.cells.find((cell) => cell.widget.id.includes('.pie_chart.'))];
    const file: ServedFile = { ...DEMO_SERVED_FILE, instances: [...DEMO_SERVED_FILE.instances.filter((instance) => instance.id !== DEMO_DASHBOARD_ID), { ...demo, layout: { cells } }] };
    const refusing: MfeEntryLifecycle = {
      mount(container, bridge) {
        bridge.registerActionHandler(RENDER_WIDGET_ACTION_ID, ActionHandler.fromFunction(async () => Promise.reject(new Error('refused'))));
        container.appendChild(document.createElement('output'));
      },
      unmount() {},
    };
    const root = new DashboardRoot({ host: createMockHost({ delayMs: 0, file }), entries: { ...entries, [`${ENTRY}metric_card.v1`]: () => refusing }, origin: 'http://localhost' });
    const { container } = render(<Dashboard root={root} dashboardId={DEMO_DASHBOARD_ID} theme="light" language="en" variables={DEMO_VARIABLES} />);
    expect(await screen.findByText('This widget cannot be shown', {}, { timeout: 5000 })).toBeTruthy();
    await waitFor(() => expect(shadowTexts(container).some((text) => text.startsWith('theme light'))).toBe(true));
    expect(screen.getAllByText('This widget cannot be shown')).toHaveLength(1);
    expect(errors.mock.calls.some(([line]) => String(line).includes('fallback'))).toBe(true);
    errors.mockRestore();
  }, 15_000);

  it.each([
    ['data that fails its data type', "{'slices': [{'label': 'a', 'value': 'not a number'}]}", /fails .*pie_chart/],
    ['a result that names its own GTS schema', "{'$schema': 'https://json-schema.org/draft/2020-12/schema', 'slices': []}", /GTS field \$schema/],
  ])('fails only the cell for %s', async (_name, transform, reason) => {
    const errors = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const demo = DEMO_SERVED_FILE.instances.find((instance) => instance.id === DEMO_DASHBOARD_ID) as { layout: { cells: { widget: { id: string; data?: object } }[] } };
    const pies = demo.layout.cells.filter((cell) => cell.widget.id.includes('.pie_chart.') && 'params' in (cell.widget.data ?? {}));
    const metric = demo.layout.cells.find((cell) => cell.widget.id.includes('.metric_card.'))!;
    const bad = { ...pies[0], widget: { ...pies[0].widget, data: { params: {}, transform } } };
    const file: ServedFile = { ...DEMO_SERVED_FILE, instances: [...DEMO_SERVED_FILE.instances.filter((instance) => instance.id !== DEMO_DASHBOARD_ID), { ...demo, layout: { cells: [bad, metric] } }] };
    const root = new DashboardRoot({ host: createMockHost({ delayMs: 0, file }), entries, origin: 'http://localhost' });
    const { container } = render(<Dashboard root={root} dashboardId={DEMO_DASHBOARD_ID} theme="light" language="en" variables={DEMO_VARIABLES} />);
    expect(await screen.findByText('This widget cannot be shown', {}, { timeout: 5000 })).toBeTruthy();
    await waitFor(() => expect(shadowTexts(container).some((text) => text.startsWith('theme light; language en; data id'))).toBe(true));
    expect(screen.getAllByText('This widget cannot be shown')).toHaveLength(1);
    expect(errors.mock.calls.some(([line]) => reason.test(String(line)))).toBe(true);
    errors.mockRestore();
  }, 15_000);

  it('publishes the host theme id and language unchanged', async () => {
    const root = new DashboardRoot({ host: createMockHost({ delayMs: 0, file: DEMO_SERVED_FILE }), entries, origin: 'http://localhost' });
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const { container } = render(<Dashboard root={root} dashboardId={DEMO_DASHBOARD_ID} theme="dracula" language="de" variables={DEMO_VARIABLES} />);
    await waitFor(() => expect(shadowTexts(container).some((text) => text.startsWith('theme dracula; language de'))).toBe(true), { timeout: 5000 });
    vi.restoreAllMocks();
  }, 15_000);

  it('marks the frame with the canonical tag the widgets draw in, and en for a value that is not a BCP-47 tag', async () => {
    const root = new DashboardRoot({ host: createMockHost({ delayMs: 60_000 }), entries, origin: 'http://localhost' });
    const view = render(<Dashboard root={root} dashboardId={DEMO_DASHBOARD_ID} theme="light" language="pt-br" variables={DEMO_VARIABLES} />);
    expect(view.container.firstElementChild?.getAttribute('lang')).toBe('pt-BR');
    view.rerender(<Dashboard root={root} dashboardId={DEMO_DASHBOARD_ID} theme="light" language="pt_BR" variables={DEMO_VARIABLES} />);
    expect(view.container.firstElementChild?.getAttribute('lang')).toBe('en');
    view.unmount();
    // The served file never answers here: the dispose ends its read, so its timeout writes no line into a later test.
    await root.dispose();
  });

  it.each([
    ['the element the host passes as overlayContainer', true],
    ['the dashboard element without an overlayContainer', false],
  ])('mounts the open larger view inside %s', async (name, given) => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const overlayHost = document.body.appendChild(document.createElement('div'));
    const root = new DashboardRoot({ host: createMockHost({ delayMs: 0, file: DEMO_SERVED_FILE }), entries, origin: 'http://localhost' });
    const view = render(
      <Dashboard root={root} dashboardId={DEMO_DASHBOARD_ID} theme="light" language="en" variables={DEMO_VARIABLES} overlayContainer={given ? overlayHost : undefined} />,
    );
    const [open] = await screen.findAllByRole('button', { name: /^Open .+ larger$/ }, { timeout: 5000 });
    fireEvent.click(open);
    const dialog = await screen.findByRole('dialog');
    expect(overlayHost.contains(dialog), `overlay host should hold the dialog: ${name}`).toBe(given);
    expect(view.container.firstElementChild?.contains(dialog), `dashboard element should hold the dialog: ${name}`).toBe(!given);
    view.unmount();
    overlayHost.remove();
  }, 15_000);

  it('gives every widget the overlayContainer the host passes, and null once the host drops it', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const overlayHost = document.body.appendChild(document.createElement('div'));
    // Each widget's latest overlay container, by extension: as it reads it on mount and as the domain updates it.
    const seen = new Map<string, unknown>();
    let count = 0;
    const overlayEntry = (): MfeEntryLifecycle => {
      const id = String(count++);
      let stop: (() => void) | undefined;
      return {
        mount(_container, bridge) {
          seen.set(id, bridge.getProperty(OVERLAY_CONTAINER_PROPERTY_ID)?.value);
          stop = bridge.subscribeToProperty(OVERLAY_CONTAINER_PROPERTY_ID, (property) => seen.set(id, property.value));
          bridge.registerActionHandler(RENDER_WIDGET_ACTION_ID, ActionHandler.fromFunction(async () => undefined));
        },
        unmount() {
          stop?.();
        },
      };
    };
    const overlayEntries = Object.fromEntries(TYPES.map((type) => [`${ENTRY}${type}.v1`, overlayEntry]));
    const root = new DashboardRoot({ host: createMockHost({ delayMs: 0, file: DEMO_SERVED_FILE }), entries: overlayEntries, origin: 'http://localhost' });
    const props = { root, dashboardId: DEMO_DASHBOARD_ID, theme: 'light', language: 'en', variables: DEMO_VARIABLES };
    const view = render(<Dashboard {...props} overlayContainer={overlayHost} />);
    await waitFor(() => expect(seen.size).toBeGreaterThan(3), { timeout: 5000 });
    expect([...new Set([...seen.values()].map(elementIn))]).toEqual([overlayHost]);
    view.rerender(<Dashboard {...props} />);
    expect([...new Set([...seen.values()].map(elementIn))]).toEqual([null]);
    view.unmount();
    overlayHost.remove();
  }, 15_000);

  describe('with an overlay container React rendered', () => {
    /** Widget entries that keep the overlay container each widget last read, as the test above does. */
    const recording = () => {
      const seen = new Map<string, unknown>();
      let count = 0;
      const entry = (): MfeEntryLifecycle => {
        const id = String(count++);
        let stop: (() => void) | undefined;
        return {
          mount(_container, bridge) {
            seen.set(id, bridge.getProperty(OVERLAY_CONTAINER_PROPERTY_ID)?.value);
            stop = bridge.subscribeToProperty(OVERLAY_CONTAINER_PROPERTY_ID, (property) => seen.set(id, property.value));
            bridge.registerActionHandler(RENDER_WIDGET_ACTION_ID, ActionHandler.fromFunction(async () => undefined));
          },
          unmount() {
            stop?.();
          },
        };
      };
      return { seen, entries: Object.fromEntries(TYPES.map((type) => [`${ENTRY}${type}.v1`, entry])) };
    };

    /** A host that renders its own overlay element through a ref, beside `rows` rows of its own page. */
    function Host({ root, rows = 0 }: { root: DashboardRoot; rows?: number }) {
      const [overlays, setOverlays] = useState<HTMLElement | null>(null);
      return (
        <>
          <ul>
            {Array.from({ length: rows }, (_, index) => (
              <li key={index}>
                <span>row {index}</span>
              </li>
            ))}
          </ul>
          <div ref={setOverlays} data-testid="overlays" />
          <Dashboard root={root} dashboardId={DEMO_DASHBOARD_ID} theme="light" language="en" variables={DEMO_VARIABLES} overlayContainer={overlays} />
        </>
      );
    }

    it('gives every widget the element the host rendered', async () => {
      const errors = vi.spyOn(console, 'error').mockImplementation(() => undefined);
      const { seen, entries: overlayEntries } = recording();
      const root = new DashboardRoot({ host: createMockHost({ delayMs: 0, file: DEMO_SERVED_FILE }), entries: overlayEntries, origin: 'http://localhost' });
      const view = render(<Host root={root} />);
      const overlays = screen.getByTestId('overlays');
      expect(elementIn(root.registry?.getDomainProperty(WIDGETS_DOMAIN_ID, OVERLAY_CONTAINER_PROPERTY_ID))).toBe(overlays);
      await waitFor(() => expect(seen.size).toBeGreaterThan(3), { timeout: 5000 });
      expect([...new Set([...seen.values()].map(elementIn))]).toEqual([overlays]);
      expect(errors.mock.calls.filter(([line]) => String(line).includes('cannot be published'))).toEqual([]);
      // Every widget gets the very holder on the domain, which shows the type store no field of its own.
      const holder = root.registry?.getDomainProperty(WIDGETS_DOMAIN_ID, OVERLAY_CONTAINER_PROPERTY_ID);
      expect(holder).not.toBeInstanceOf(HTMLElement);
      expect(Object.keys(holder as object)).toEqual([]);
      expect([...new Set(seen.values())]).toEqual([holder]);
      // A render of the host with the same element publishes nothing again. The render does not run the effect that
      // publishes (its element did not change), so the call below proves the root's own skip of the same element.
      const writes = vi.spyOn(root.registry!, 'updateSharedProperty');
      view.rerender(<Host root={root} />);
      root.publishOverlayContainer(overlays);
      expect(writes.mock.calls.filter(([id]) => id === OVERLAY_CONTAINER_PROPERTY_ID)).toEqual([]);
      view.unmount();
      expect(root.registry?.getDomainProperty(WIDGETS_DOMAIN_ID, OVERLAY_CONTAINER_PROPERTY_ID)).toBeNull();
      await root.dispose();
    }, 15_000);

    it('publishes the element the host rendered next to a large tree of its own, within a time bound', async () => {
      const errors = vi.spyOn(console, 'error').mockImplementation(() => undefined);
      const root = new DashboardRoot({ host: createMockHost({ delayMs: 0, file: DEMO_SERVED_FILE }), entries, origin: 'http://localhost' });
      // The time the root takes to publish the element, which runs in a layout effect of the host's render.
      let spent = 0;
      const publish = root.publishOverlayContainer.bind(root);
      const timed = vi.spyOn(root, 'publishOverlayContainer').mockImplementation((element) => {
        const start = performance.now();
        publish(element);
        spent += performance.now() - start;
      });
      const view = render(<Host root={root} rows={2000} />);
      const overlays = screen.getByTestId('overlays');
      expect(timed).toHaveBeenCalledWith(overlays);
      expect(elementIn(root.registry?.getDomainProperty(WIDGETS_DOMAIN_ID, OVERLAY_CONTAINER_PROPERTY_ID))).toBe(overlays);
      expect(errors.mock.calls.filter(([line]) => String(line).includes('cannot be published'))).toEqual([]);
      // In this simulated DOM the test proves the element is published next to a large tree: a publish that walks the
      // host's tree overflows the call stack here, and the element is not on the domain. The time bound guards a
      // publish that walks the tree in a browser, where it took seconds; a loose bound, for a loaded machine.
      expect(spent).toBeLessThan(500);
      view.unmount();
      await root.dispose();
    }, 30_000);

    /** A host that renders two elements of its own through refs and names one of them as the overlay container. */
    function TwoContainers({ root, use }: { root: DashboardRoot; use: 'a' | 'b' }) {
      const [a, setA] = useState<HTMLElement | null>(null);
      const [b, setB] = useState<HTMLElement | null>(null);
      return (
        <>
          <div ref={setA} data-testid="a" />
          <div ref={setB} data-testid="b" />
          <Dashboard root={root} dashboardId={DEMO_DASHBOARD_ID} theme="light" language="en" variables={DEMO_VARIABLES} overlayContainer={use === 'a' ? a : b} />
        </>
      );
    }

    it('gives every widget the other element the host rendered when it names that one, and the first one back', async () => {
      vi.spyOn(console, 'error').mockImplementation(() => undefined);
      const { seen, entries: overlayEntries } = recording();
      const root = new DashboardRoot({ host: createMockHost({ delayMs: 0, file: DEMO_SERVED_FILE }), entries: overlayEntries, origin: 'http://localhost' });
      const view = render(<TwoContainers root={root} use="a" />);
      const [a, b] = [screen.getByTestId('a'), screen.getByTestId('b')];
      const widgets = () => [...new Set([...seen.values()].map(elementIn))];
      await waitFor(() => expect(seen.size).toBeGreaterThan(3), { timeout: 5000 });
      expect(widgets()).toEqual([a]);
      // The holders of a and b show the type store no field of their own, so it sees the same content in both: the
      // widgets must still get the element named last.
      view.rerender(<TwoContainers root={root} use="b" />);
      expect(widgets()).toEqual([b]);
      view.rerender(<TwoContainers root={root} use="a" />);
      expect(widgets()).toEqual([a]);
      view.unmount();
      await root.dispose();
    }, 15_000);
  });

  it('publishes null for an undefined overlay container from untyped code, and a second undefined publishes nothing', async () => {
    const root = new DashboardRoot({ host: createMockHost({ delayMs: 0, file: DEMO_SERVED_FILE }), entries, origin: 'http://localhost' });
    onTestFinished(() => root.dispose());
    const writes = vi.spyOn(root.registry!, 'updateSharedProperty');
    root.publishOverlayContainer(document.body);
    writes.mockClear();
    root.publishOverlayContainer(undefined as unknown as null);
    expect(writes.mock.calls).toEqual([[OVERLAY_CONTAINER_PROPERTY_ID, null]]);
    expect(root.registry?.getDomainProperty(WIDGETS_DOMAIN_ID, OVERLAY_CONTAINER_PROPERTY_ID)).toBeNull();
    root.publishOverlayContainer(undefined as unknown as null);
    expect(writes.mock.calls).toHaveLength(1);
  });

  it('publishes no overlay container once the Dashboard that passed one unmounts', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const overlayHost = document.body.appendChild(document.createElement('div'));
    onTestFinished(() => overlayHost.remove());
    const root = new DashboardRoot({ host: createMockHost({ delayMs: 0, file: DEMO_SERVED_FILE }), entries, origin: 'http://localhost' });
    const view = render(<Dashboard root={root} dashboardId={DEMO_DASHBOARD_ID} theme="light" language="en" variables={DEMO_VARIABLES} overlayContainer={overlayHost} />);
    expect(elementIn(root.registry?.getDomainProperty(WIDGETS_DOMAIN_ID, OVERLAY_CONTAINER_PROPERTY_ID))).toBe(overlayHost);
    view.unmount();
    expect(root.registry?.getDomainProperty(WIDGETS_DOMAIN_ID, OVERLAY_CONTAINER_PROPERTY_ID)).toBeNull();
  });

  it('keeps the overlay container another Dashboard on the root still shows when one unmounts', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const [oneHost, otherHost] = [0, 1].map(() => document.body.appendChild(document.createElement('div')));
    onTestFinished(() => [oneHost, otherHost].forEach((element) => element.remove()));
    const root = new DashboardRoot({ host: createMockHost({ delayMs: 0, file: DEMO_SERVED_FILE }), entries, origin: 'http://localhost' });
    const property = () => elementIn(root.registry?.getDomainProperty(WIDGETS_DOMAIN_ID, OVERLAY_CONTAINER_PROPERTY_ID));
    const one = render(<Dashboard root={root} dashboardId={DEMO_DASHBOARD_ID} theme="light" language="en" variables={DEMO_VARIABLES} overlayContainer={oneHost} />);
    const other = render(<Dashboard root={root} dashboardId={DEMO_DASHBOARD_ID} theme="light" language="en" variables={DEMO_VARIABLES} overlayContainer={otherHost} />);
    expect(property()).toBe(otherHost);
    one.unmount();
    expect(property()).toBe(otherHost);
    other.unmount();
    expect(property()).toBeNull();
  });

  it('renders on a server without throwing on the refresh version it reads', () => {
    const root = new DashboardRoot({ host: createMockHost({ delayMs: 0, file: DEMO_SERVED_FILE }), entries, origin: 'http://localhost' });
    expect(() => renderToString(<Dashboard root={root} dashboardId={DEMO_DASHBOARD_ID} theme="light" language="en" />)).not.toThrow();
  });

  it('retries the served file after a failed load', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const mock = createMockHost({ delayMs: 0, file: DEMO_SERVED_FILE });
    let calls = 0;
    const root = new DashboardRoot({ host: { ...mock, loadFile: (signal) => (++calls === 1 ? Promise.reject(new Error('down')) : mock.loadFile(signal)) }, entries });
    expect((await root.load(DEMO_DASHBOARD_ID)).ok).toBe(false);
    expect((await root.load(DEMO_DASHBOARD_ID)).ok).toBe(true);
    vi.restoreAllMocks();
  });

  it('fails the dashboard, and retries the served file on the next load, when the base file throws on read', async () => {
    const errors = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const mock = createMockHost({ delayMs: 0, file: DEMO_SERVED_FILE });
    const unreadable = Object.defineProperty({}, 'id', { enumerable: true, get: () => { throw new Error('unreadable'); } });
    let calls = 0;
    const root = new DashboardRoot({
      host: { ...mock, loadFile: (signal) => (++calls === 1 ? Promise.resolve({ ...DEMO_SERVED_FILE, instances: [...DEMO_SERVED_FILE.instances, unreadable] }) : mock.loadFile(signal)) },
      entries,
    });
    await expect(root.load(DEMO_DASHBOARD_ID)).resolves.toEqual({ ok: false });
    expect(errors.mock.calls.some(([line]) => String(line).includes('cannot be shown: the served file: ') && String(line).includes('unreadable'))).toBe(true);
    expect((await root.load(DEMO_DASHBOARD_ID)).ok).toBe(true);
    expect(calls).toBe(2);
  });

  it('fails the dashboard, and retries on the next load, for an answer the root cannot read at all', async () => {
    const errors = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const mock = createMockHost({ delayMs: 0, file: DEMO_SERVED_FILE });
    // A list that throws as soon as the root reads its items, before any part is read.
    const unreadable = new Proxy([], {
      get: (_target, key) => {
        if (key === 'then') return undefined;
        throw new Error('unreadable answer');
      },
    });
    let calls = 0;
    const root = new DashboardRoot({ host: { ...mock, loadFile: (signal) => (++calls === 1 ? Promise.resolve(unreadable) : mock.loadFile(signal)) }, entries });
    await expect(root.load(DEMO_DASHBOARD_ID)).resolves.toEqual({ ok: false });
    expect(errors.mock.calls.some(([line]) => String(line).includes('cannot be shown: the served file cannot be registered: '))).toBe(true);
    expect((await root.load(DEMO_DASHBOARD_ID)).ok).toBe(true);
  });

  it('fails the dashboard, and registers it again on the next load, for a dashboard the registration cannot read', async () => {
    const errors = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const demo = DEMO_SERVED_FILE.instances.find((instance) => instance.id === DEMO_DASHBOARD_ID) as { layout: unknown };
    // An in-code host answers with a dashboard whose layout throws on read until the host recovers.
    let broken = true;
    let reads = 0;
    const dashboard = Object.defineProperty({ ...demo }, 'layout', {
      enumerable: true,
      get: () => {
        reads += 1;
        if (broken) throw new Error('first\u2028[dashboard] faked\nsecond\u0085line\nthird line');
        return demo.layout;
      },
    });
    const file = { ...DEMO_SERVED_FILE, instances: [...DEMO_SERVED_FILE.instances.filter((instance) => instance.id !== DEMO_DASHBOARD_ID), dashboard] };
    const root = new DashboardRoot({ host: { ...createMockHost({ delayMs: 0 }), loadFile: () => Promise.resolve(file) }, entries });
    await expect(root.load(DEMO_DASHBOARD_ID)).resolves.toEqual({ ok: false });
    const lines = errors.mock.calls.map(([text]) => String(text)).filter((text) => text.includes('cannot be shown'));
    expect(lines).toHaveLength(1);
    expect(lines[0]).toContain('cannot be shown: the dashboard cannot be registered: Error: first\\u2028[dashboard] faked second\\u0085line');
    expect(lines[0]).not.toContain('third line');
    expect(lines[0]).not.toMatch(/[\u0000-\u001f\u007f-\u009f\u2028\u2029]/);
    broken = false;
    const before = reads;
    expect((await root.load(DEMO_DASHBOARD_ID)).ok).toBe(true);
    expect(reads).toBeGreaterThan(before);
  });

  it('shows a dashboard again after a quick switch away and back', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const other = 'gts.frontx.dashboard.dashboard.dashboard.v1~5b1e2d3c-4f5a-4b6c-8d7e-9f0a1b2c3d4e';
    const root = new DashboardRoot({ host: createMockHost({ delayMs: 0, file: DEMO_SERVED_FILE }), entries, origin: 'http://localhost' });
    const view = render(<Dashboard root={root} dashboardId={DEMO_DASHBOARD_ID} theme="light" language="en" variables={DEMO_VARIABLES} />);
    const shown = () => shadowTexts(view.container).filter((text) => text.startsWith('theme light')).length;
    await waitFor(() => expect(shown()).toBeGreaterThan(10), { timeout: 5000 });
    const before = shown();
    // A slow unregistration keeps the release of the first dashboard running while the viewer returns to it.
    const registry = root.registry!;
    const unregister = registry.unregisterExtension.bind(registry);
    vi.spyOn(registry, 'unregisterExtension').mockImplementation(async (id) => {
      await new Promise((resolve) => setTimeout(resolve, 100));
      return unregister(id);
    });
    view.rerender(<Dashboard root={root} dashboardId={other} theme="light" language="en" />);
    await waitFor(() => expect(view.container.textContent).toContain('CI runs, legend below'));
    view.rerender(<Dashboard root={root} dashboardId={DEMO_DASHBOARD_ID} theme="light" language="en" variables={DEMO_VARIABLES} />);
    await waitFor(() => expect(shown()).toBe(before), { timeout: 5000 });
    // Every cell of the dashboard came back with its widget, none left blank by a late release.
    await new Promise((resolve) => setTimeout(resolve, 300));
    expect(shown()).toBe(before);
    vi.restoreAllMocks();
  }, 20_000);

  it('fails only the cell whose data is not an object, and keeps rendering with an empty theme id', async () => {
    const errors = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const demo = DEMO_SERVED_FILE.instances.find((instance) => instance.id === DEMO_DASHBOARD_ID) as { layout: { cells: { widget: { id: string } }[] } };
    const metric = demo.layout.cells.find((cell) => cell.widget.id.includes('.metric_card.'))!;
    const bad = { ...metric, widget: { ...metric.widget, id: metric.widget.id.replace(/[0-9a-f]{4}$/, 'beef'), data: 'not a binding' } };
    const file: ServedFile = { ...DEMO_SERVED_FILE, instances: [...DEMO_SERVED_FILE.instances.filter((instance) => instance.id !== DEMO_DASHBOARD_ID), { ...demo, layout: { cells: [metric, bad] } }] };
    const root = new DashboardRoot({ host: createMockHost({ delayMs: 0, file }), entries, origin: 'http://localhost' });
    const { container } = render(<Dashboard root={root} dashboardId={DEMO_DASHBOARD_ID} theme="" language="en" />);
    expect(await screen.findByText('This widget cannot be shown', {}, { timeout: 5000 })).toBeTruthy();
    await waitFor(() => expect(shadowTexts(container).some((text) => text.includes('data id'))).toBe(true), { timeout: 5000 });
    expect(errors.mock.calls.some(([line]) => String(line).includes('cannot be published'))).toBe(true);
    errors.mockRestore();
  }, 15_000);

  it.each([
    { theme: '', language: 'de', shows: 'theme undefined; language de', rejected: 'the theme cannot be published' },
    { theme: 'dark', language: '', shows: 'theme dark; language undefined', rejected: 'the language cannot be published' },
  ])('publishes each property on its own: theme "$theme" with language "$language" shows "$shows"', async ({ theme, language, shows, rejected }) => {
    const errors = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const root = new DashboardRoot({ host: createMockHost({ delayMs: 0, file: DEMO_SERVED_FILE }), entries, origin: 'http://localhost' });
    const { container } = render(<Dashboard root={root} dashboardId={DEMO_DASHBOARD_ID} theme={theme} language={language} />);
    // The property type rejects the empty value; the other property still reaches every widget.
    await waitFor(() => expect(shadowTexts(container).some((text) => text.startsWith(`${shows};`))).toBe(true), { timeout: 5000 });
    expect(errors.mock.calls.filter(([line]) => String(line).includes('cannot be published')).map(([line]) => String(line).split(':')[0])).toEqual([`[dashboard] ${rejected}`]);
    errors.mockRestore();
  }, 15_000);

  it('keeps the last accepted language in the widgets for an empty one, while the frame falls back to en', async () => {
    const errors = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const root = new DashboardRoot({ host: createMockHost({ delayMs: 0, file: DEMO_SERVED_FILE }), entries, origin: 'http://localhost' });
    const view = render(<Dashboard root={root} dashboardId={DEMO_DASHBOARD_ID} theme="light" language="de" variables={DEMO_VARIABLES} />);
    await waitFor(() => expect(shadowTexts(view.container).some((text) => text.startsWith('theme light; language de;'))).toBe(true), { timeout: 5000 });
    view.rerender(<Dashboard root={root} dashboardId={DEMO_DASHBOARD_ID} theme="light" language="" variables={DEMO_VARIABLES} />);
    await waitFor(() => expect(errors.mock.calls.some(([line]) => String(line).startsWith('[dashboard] the language cannot be published'))).toBe(true));
    const drawn = shadowTexts(view.container).filter((text) => text.startsWith('theme '));
    expect(drawn.length).toBeGreaterThan(0);
    expect(drawn.every((text) => text.startsWith('theme light; language de;'))).toBe(true);
    expect(view.container.firstElementChild?.getAttribute('lang')).toBe('en');
    errors.mockRestore();
  }, 15_000);

  it('discards a load the viewer left before it settled, so the next mount loads again', async () => {
    const mock = createMockHost({ delayMs: 50, file: DEMO_SERVED_FILE });
    let files = 0;
    const root = new DashboardRoot({ host: { ...mock, loadFile: (signal) => (files++, mock.loadFile(signal)) }, entries, origin: 'http://localhost' });
    const first = render(<Dashboard root={root} dashboardId={DEMO_DASHBOARD_ID} theme="light" language="en" variables={DEMO_VARIABLES} />);
    const discarded = root.load(DEMO_DASHBOARD_ID);
    first.unmount();
    await new Promise((resolve) => setTimeout(resolve, 100));
    const second = render(<Dashboard root={root} dashboardId={DEMO_DASHBOARD_ID} theme="light" language="en" variables={DEMO_VARIABLES} />);
    await waitFor(() => expect(shadowTexts(second.container).some((text) => text.startsWith('theme light'))).toBe(true), { timeout: 5000 });
    // The served file is registered once; the second mount started its own dashboard load.
    expect(files).toBe(1);
    expect(root.load(DEMO_DASHBOARD_ID)).not.toBe(discarded);
  }, 15_000);

  it('keeps a widget that two dashboards share shown when the viewer switches between them', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const demo = DEMO_SERVED_FILE.instances.find((instance) => instance.id === DEMO_DASHBOARD_ID) as { layout: { cells: { widget: { id: string } }[] } };
    const shared = demo.layout.cells.find((cell) => cell.widget.id.includes('.metric_card.'))!;
    const second = { id: 'gts.frontx.dashboard.dashboard.dashboard.v1~1e2d3c4b-5a69-4788-9a0b-1c2d3e4f5a6b', title: 'Second', requests: (demo as { requests?: object }).requests, layout: { cells: [shared] } };
    const file: ServedFile = { ...DEMO_SERVED_FILE, instances: [...DEMO_SERVED_FILE.instances, second] };
    const root = new DashboardRoot({ host: createMockHost({ delayMs: 0, file }), entries, origin: 'http://localhost' });
    const view = render(<Dashboard root={root} dashboardId={DEMO_DASHBOARD_ID} theme="light" language="en" variables={DEMO_VARIABLES} />);
    await waitFor(() => expect(shadowTexts(view.container).filter((text) => text.startsWith('theme light')).length).toBeGreaterThan(10), { timeout: 5000 });
    // A slow unregistration keeps the first dashboard's release running while the second one mounts the shared widget.
    const registry = root.registry!;
    const unregister = registry.unregisterExtension.bind(registry);
    vi.spyOn(registry, 'unregisterExtension').mockImplementation(async (id) => {
      await new Promise((resolve) => setTimeout(resolve, 100));
      return unregister(id);
    });
    view.rerender(<Dashboard root={root} dashboardId={second.id} theme="light" language="en" />);
    await waitFor(() => expect(shadowTexts(view.container).filter((text) => text.startsWith('theme light'))).toHaveLength(1), { timeout: 5000 });
    await new Promise((resolve) => setTimeout(resolve, 600));
    expect(shadowTexts(view.container).filter((text) => text.startsWith('theme light'))).toHaveLength(1);
    expect(screen.queryByText('This widget cannot be shown')).toBeNull();
    vi.restoreAllMocks();
  }, 20_000);

  it('sends a shared request that only a larger view names at load, once', async () => {
    const mock = createMockHost({ delayMs: 0, file: DEMO_SERVED_FILE });
    const sent: string[] = [];
    const demo = DEMO_SERVED_FILE.instances.find((instance) => instance.id === DEMO_DASHBOARD_ID) as { requests: object; layout: { cells: { widget: { id: string; data?: object }; larger_view?: object }[] } };
    const pie = demo.layout.cells.find((cell) => cell.widget.id.includes('.pie_chart.') && 'params' in (cell.widget.data ?? {}))!;
    const larger = { ...pie.widget, id: pie.widget.id.replace(/[0-9a-f]{4}$/, 'aaaa'), data: { source: 'daily', transform: "{'slices': [{'label': 'days', 'value': double(size(response.daily))}]}" } };
    const file: ServedFile = { ...DEMO_SERVED_FILE, instances: [...DEMO_SERVED_FILE.instances.filter((instance) => instance.id !== DEMO_DASHBOARD_ID), { ...demo, layout: { cells: [{ ...pie, larger_view: larger }] } }] };
    const root = new DashboardRoot({ host: { ...createMockHost({ delayMs: 0, file }), request: (request, signal) => (sent.push(request.path), mock.request(request, signal)) }, entries, origin: 'http://localhost' });
    const { container } = render(<Dashboard root={root} dashboardId={DEMO_DASHBOARD_ID} theme="light" language="en" variables={DEMO_VARIABLES} />);
    await waitFor(() => expect(shadowTexts(container).some((text) => text.startsWith('theme light'))).toBe(true), { timeout: 5000 });
    expect(sent).toEqual(['/api/demo/delivery/daily']);
    // The overlay widget receives its render stamped with the larger_view role.
    fireEvent.click(screen.getByRole('button', { name: /larger/ }));
    const overlayRender = renderStampIdOf(PIE_RENDER, larger.id, 'larger_view');
    await waitFor(() => expect([...document.querySelectorAll<HTMLElement>('[data-widget-extension]')].map((host) => host.shadowRoot?.querySelector('output')?.dataset.render)).toContain(overlayRender), { timeout: 5000 });
  }, 15_000);

  it('renders a CEL int, double and uint the same through the whole binding path, and fails the cell of an integer past the exact range', async () => {
    const errors = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const demo = DEMO_SERVED_FILE.instances.find((instance) => instance.id === DEMO_DASHBOARD_ID) as { layout: { cells: { widget: { id: string } }[] } };
    const metric = demo.layout.cells.find((cell) => cell.widget.id.includes('.metric_card.'))!;
    const cellOf = (suffix: string, transform: string, n: number) => ({
      ...metric,
      widget: { ...metric.widget, id: metric.widget.id.replace(/[0-9a-f]{4}$/, suffix), render: {}, data: { params: { n }, transform } },
    });
    const cells = [
      cellOf('a001', "{'value': int(params.n)}", 42),
      cellOf('a002', "{'value': double(params.n)}", 42),
      cellOf('a003', "{'value': uint(params.n)}", 42),
      // 2^53 + 1 has no exact JSON number, so the cell fails with the reason rather than show a rounded value.
      cellOf('a004', "{'value': uint(params.n) * 2u + 1u}", 2 ** 52),
    ];
    const file: ServedFile = { ...DEMO_SERVED_FILE, instances: [...DEMO_SERVED_FILE.instances.filter((instance) => instance.id !== DEMO_DASHBOARD_ID), { ...demo, layout: { cells } }] };
    const root = new DashboardRoot({ host: createMockHost({ delayMs: 0, file }), entries: WIDGET_ENTRIES, origin: 'http://localhost' });
    const { container } = render(<Dashboard root={root} dashboardId={DEMO_DASHBOARD_ID} theme="light" language="en" variables={DEMO_VARIABLES} />);
    const values = () => [...container.querySelectorAll<HTMLElement>('[data-widget-extension]')].map((host) => host.shadowRoot?.textContent ?? '').filter((text) => text.includes('42'));
    await waitFor(() => expect(values()).toHaveLength(3), { timeout: 5000 });
    expect(await screen.findByText('This widget cannot be shown', {}, { timeout: 5000 })).toBeTruthy();
    expect(screen.getAllByText('This widget cannot be shown')).toHaveLength(1);
    const lines = errors.mock.calls.map(([line]) => String(line)).filter((line) => line.includes('transform failed'));
    expect(lines).toHaveLength(1);
    expect(lines[0]).toContain('a004');
    expect(lines[0]).toContain('the integer 9007199254740993 is outside the range a JSON number holds exactly');
    errors.mockRestore();
  }, 15_000);

  it('sends each widget the title of its own instance trimmed, none for a blank or absent one, and the widget is named by that title or by its own name', async () => {
    const demo = DEMO_SERVED_FILE.instances.find((instance) => instance.id === DEMO_DASHBOARD_ID) as { layout: { cells: { widget: { id: string } }[] } };
    const pie = demo.layout.cells.find((cell) => cell.widget.id.includes('.pie_chart.'))!;
    // The payloads the root sends the catalog pie entry.
    const sent: Record<string, unknown>[] = [];
    const pieOf = (suffix: string, title?: string) => ({
      id: pie.widget.id.replace(/[0-9a-f]{4}$/, suffix),
      ...(title === undefined ? {} : { title }),
      render: {},
      data: { params: {}, transform: "{'slices': [{'label': 'Passed', 'value': 3}]}" },
    });
    const cells = [
      { size: 'small', widget: pieOf('e001', 'Runs by outcome'), larger_view: pieOf('e002', 'Runs by outcome, all time') },
      { size: 'small', widget: pieOf('e003') },
      { size: 'small', widget: pieOf('e004', '  ') },
      { size: 'small', widget: pieOf('e005', '  Runs by result  '), larger_view: pieOf('e006') },
    ];
    const file: ServedFile = { ...DEMO_SERVED_FILE, instances: [...DEMO_SERVED_FILE.instances.filter((instance) => instance.id !== DEMO_DASHBOARD_ID), { ...demo, layout: { cells } }] };
    const root = new DashboardRoot({ host: createMockHost({ delayMs: 0, file }), entries: { ...WIDGET_ENTRIES, [`${ENTRY}pie_chart.v1`]: recordingEntryOf('pie_chart', sent) }, origin: 'http://localhost' });
    const { container } = render(<Dashboard root={root} dashboardId={DEMO_DASHBOARD_ID} theme="light" language="en" variables={DEMO_VARIABLES} />);
    // Document order: each cell's widget, then the open larger view.
    const names = () => [...document.querySelectorAll<HTMLElement>('[data-widget-extension]')].map((host) => host.shadowRoot?.querySelector('[role="figure"]')?.getAttribute('aria-label'));
    const shown = ['Runs by outcome', 'Chart', 'Chart', 'Runs by result'];
    await waitFor(() => expect(names()).toEqual(shown), { timeout: 5000 });
    // The payload of each cell, found by its render's stamp.
    const sentTo = (suffix: string) => sent.find((payload) => (payload.render as { id?: unknown } | undefined)?.id === renderStampIdOf(PIE_RENDER, pieOf(suffix).id, 'cell'));
    expect(sentTo('e001')?.title).toBe('Runs by outcome');
    expect(sentTo('e005')?.title).toBe('Runs by result');
    for (const suffix of ['e003', 'e004']) {
      expect(sentTo(suffix)).toBeDefined();
      expect(Object.hasOwn(sentTo(suffix)!, 'title')).toBe(false);
    }
    const [titled, untitled] = within(container).getAllByRole('button', { name: /larger/ });
    fireEvent.click(titled);
    await waitFor(() => expect(names()).toEqual([...shown, 'Runs by outcome, all time']), { timeout: 5000 });
    fireEvent.keyDown(await screen.findByRole('dialog'), { key: 'Escape' });
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull(), { timeout: 5000 });
    fireEvent.click(untitled);
    await waitFor(() => expect(names()).toEqual([...shown, 'Chart']), { timeout: 5000 });
  }, 15_000);

  it('sends each data widget the empty_text of its own instance, a larger view its own and never the cell\'s, and the widget shows it in its empty state', async () => {
    const demo = DEMO_SERVED_FILE.instances.find((instance) => instance.id === DEMO_DASHBOARD_ID) as { layout: { cells: { widget: { id: string } }[] } };
    const pie = demo.layout.cells.find((cell) => cell.widget.id.includes('.pie_chart.'))!;
    const sent: Record<string, unknown>[] = [];
    const pieOf = (suffix: string, emptyText?: string) => ({
      id: pie.widget.id.replace(/[0-9a-f]{4}$/, suffix),
      ...(emptyText === undefined ? {} : { empty_text: emptyText }),
      render: {},
      data: { params: {}, transform: "{'slices': []}" },
    });
    const cells = [
      { size: 'small', widget: pieOf('f001', 'Nothing this week.'), larger_view: pieOf('f002', 'Nothing in the whole history.') },
      { size: 'small', widget: pieOf('f003', 'Nothing this month.'), larger_view: pieOf('f004') },
      { size: 'small', widget: pieOf('f005') },
    ];
    const file: ServedFile = { ...DEMO_SERVED_FILE, instances: [...DEMO_SERVED_FILE.instances.filter((instance) => instance.id !== DEMO_DASHBOARD_ID), { ...demo, layout: { cells } }] };
    const root = new DashboardRoot({ host: createMockHost({ delayMs: 0, file }), entries: { ...WIDGET_ENTRIES, [`${ENTRY}pie_chart.v1`]: recordingEntryOf('pie_chart', sent) }, origin: 'http://localhost' });
    const { container } = render(<Dashboard root={root} dashboardId={DEMO_DASHBOARD_ID} theme="light" language="en" variables={DEMO_VARIABLES} />);
    // Document order: each cell's widget, then the open larger view; the text each draws, its stylesheets left out.
    const shownTexts = () =>
      [...document.querySelectorAll<HTMLElement>('[data-widget-extension]')].map((host) =>
        [...(host.shadowRoot?.children ?? [])].filter((child) => child.tagName !== 'STYLE').map((child) => child.textContent).join(''),
      );
    const shown = ['Nothing this week.', 'Nothing this month.', 'No data to show'];
    await waitFor(() => expect(shownTexts()).toEqual(shown), { timeout: 5000 });
    const sentTo = (suffix: string, role: 'cell' | 'larger_view') => sent.find((payload) => (payload.render as { id?: unknown } | undefined)?.id === renderStampIdOf(PIE_RENDER, pieOf(suffix).id, role));
    expect(sentTo('f001', 'cell')?.empty_text).toBe('Nothing this week.');
    expect(sentTo('f003', 'cell')?.empty_text).toBe('Nothing this month.');
    expect(Object.hasOwn(sentTo('f005', 'cell')!, 'empty_text')).toBe(false);
    const [first, second] = within(container).getAllByRole('button', { name: /larger/ });
    fireEvent.click(first);
    await waitFor(() => expect(shownTexts()).toEqual([...shown, 'Nothing in the whole history.']), { timeout: 5000 });
    expect(sentTo('f002', 'larger_view')?.empty_text).toBe('Nothing in the whole history.');
    fireEvent.keyDown(await screen.findByRole('dialog'), { key: 'Escape' });
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull(), { timeout: 5000 });
    fireEvent.click(second);
    await waitFor(() => expect(shownTexts()).toEqual([...shown, 'No data to show']), { timeout: 5000 });
    expect(Object.hasOwn(sentTo('f004', 'larger_view')!, 'empty_text')).toBe(false);
  }, 15_000);
});

// The root stamps each widget's render with its widget type's render type and registers it, like the data.
describe('the stamped render', () => {
  const RENDER_BASE = 'gts.frontx.dashboard.widget.render.v1~';
  const METRIC_RENDER = `${RENDER_BASE}frontx.dashboard.widget.metric_card_render.v1~`;
  const METRIC_DATA = 'gts.frontx.dashboard.widget_data.widget_data.v1~frontx.dashboard.widget_data.metric_card.v1~';
  const DATA_WIDGET = 'gts.frontx.dashboard.widget.widget.v1~frontx.dashboard.widget.data_widget.v1~';
  const demo = DEMO_SERVED_FILE.instances.find((instance) => instance.id === DEMO_DASHBOARD_ID) as { layout: { cells: { widget: { id: string; render: Record<string, unknown> } }[] } };
  const metric = demo.layout.cells.find((cell) => cell.widget.id.includes('.metric_card.'))!;

  /** A product widget type on the metric_card entry and data type: its render open, or closed inline, and its traits. */
  const productType = (name: string, traits: Record<string, unknown>, render: Record<string, unknown>) => ({
    $id: `gts://${DATA_WIDGET}frontx.test.widget.${name}.v1~`,
    $schema: 'https://json-schema.org/draft/2020-12/schema',
    'x-gts-traits': { entry: `${ENTRY}metric_card.v1`, data_type: METRIC_DATA, ...traits },
    allOf: [{ $ref: `gts://${DATA_WIDGET}` }, { type: 'object', properties: { render } }],
    unevaluatedProperties: false,
  });
  const widgetOf = (type: string, suffix: string, render: Record<string, unknown>) => ({ ...metric, widget: { id: `${DATA_WIDGET}frontx.test.widget.${type}.v1~0d1e2f3a-4b5c-4d6e-8f70-81920a1b${suffix}`, title: type, render, data: { params: {}, transform: "{'value': 1}" } } });
  const fileWith = (types: Record<string, unknown>[], cells: unknown[], id = DEMO_DASHBOARD_ID): ServedFile => ({
    types: [...DEMO_SERVED_FILE.types, ...types],
    instances: [...DEMO_SERVED_FILE.instances.filter((instance) => instance.id !== id), { ...demo, id, layout: { cells } }],
  });
  const renderIds = (container: HTMLElement) =>
    [...container.querySelectorAll<HTMLElement>('[data-widget-extension]')].map((host) => host.shadowRoot?.querySelector('output')?.dataset.render ?? '');
  // Only the lines of this test's dashboard and failing widget: the spy is on the shared console, where another root's
  // late line could land while a test runs.
  const failureLines = (errors: { mock: { calls: unknown[][] } }, dashboardId: string, widgetId: string) =>
    errors.mock.calls.map(([line]) => String(line)).filter((line) => line.startsWith(`[dashboard] dashboard ${dashboardId}, widget ${widgetId} `));

  it('is the render type followed by a UUIDv5 of widget id, role and render, apart from the data stamp', () => {
    const id = renderStampIdOf(METRIC_RENDER, metric.widget.id, 'cell');
    expect(id).toMatch(new RegExp(`^${METRIC_RENDER.replace(/[.~]/g, '\\$&')}[0-9a-f]{8}-[0-9a-f]{4}-5[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$`));
    expect(renderStampIdOf(METRIC_RENDER, metric.widget.id, 'cell')).toBe(id);
    expect(renderStampIdOf(METRIC_RENDER, metric.widget.id, 'larger_view')).not.toBe(id);
    expect(id.slice(METRIC_RENDER.length)).not.toBe(stampIdOf(METRIC_DATA, metric.widget.id, 'cell').slice(METRIC_DATA.length));
    // A fixed vector computed apart from the code: SHA-1 UUIDv5 over the template namespace and `<widget id lowercased>|cell|render`.
    const fixed = 'gts.frontx.dashboard.widget.widget.v1~frontx.dashboard.widget.data_widget.v1~frontx.dashboard.widget.metric_card.v1~5A1B2C3D-4E5F-4A6B-8C7D-9E0F1A2B3C4D';
    expect(renderStampIdOf(METRIC_RENDER, fixed, 'cell')).toBe(`${METRIC_RENDER}7269d0d1-d796-5fde-884a-2c169eaa752a`);
  });

  it('reaches the widget with its id, stamped with the widget type\'s render type', async () => {
    const root = new DashboardRoot({ host: createMockHost({ delayMs: 0, file: fileWith([], [metric]) }), entries, origin: 'http://localhost' });
    const { container } = render(<Dashboard root={root} dashboardId={DEMO_DASHBOARD_ID} theme="light" language="en" variables={DEMO_VARIABLES} />);
    await waitFor(() => expect(renderIds(container)).toEqual([renderStampIdOf(METRIC_RENDER, metric.widget.id, 'cell')]), { timeout: 5000 });
  }, 15_000);

  it('stamps the render of a product widget type with the render type its render names by $ref', async () => {
    const referred = productType('ref_metric', {}, { $ref: `gts://${METRIC_RENDER}` });
    const cell = widgetOf('ref_metric', '0009', { value_label: 'fine' });
    const root = new DashboardRoot({ host: createMockHost({ delayMs: 0, file: fileWith([referred], [cell]) }), entries, origin: 'http://localhost' });
    const { container } = render(<Dashboard root={root} dashboardId={DEMO_DASHBOARD_ID} theme="light" language="en" variables={DEMO_VARIABLES} />);
    await waitFor(() => expect(renderIds(container)).toEqual([renderStampIdOf(METRIC_RENDER, cell.widget.id, 'cell')]), { timeout: 5000 });
  }, 15_000);

  it('fails only the cell whose render its render type rejects', async () => {
    const errors = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const referred = productType('ref_metric', {}, { $ref: `gts://${METRIC_RENDER}` });
    const cells = [metric, widgetOf('ref_metric', '0001', { radius: '50%' }), widgetOf('ref_metric', '0002', { value_label: 'fine' })];
    const root = new DashboardRoot({ host: createMockHost({ delayMs: 0, file: fileWith([referred], cells) }), entries, origin: 'http://localhost' });
    const { container } = render(<Dashboard root={root} dashboardId={DEMO_DASHBOARD_ID} theme="light" language="en" variables={DEMO_VARIABLES} />);
    expect(await screen.findByText('This widget cannot be shown', {}, { timeout: 5000 })).toBeTruthy();
    await waitFor(() => expect(renderIds(container).filter(Boolean)).toHaveLength(2), { timeout: 5000 });
    expect(screen.getAllByText('This widget cannot be shown')).toHaveLength(1);
    const lines = failureLines(errors, DEMO_DASHBOARD_ID, cells[1].widget.id);
    expect(lines).toHaveLength(1);
    expect(lines[0]).toContain('0001');
    // The widget's own registration judges the render against the same render type the stamp uses, and fails first.
    expect(lines[0]).toContain('the widget fails its own registration');
    expect(lines[0]).toContain('#/render/radius');
    errors.mockRestore();
  }, 15_000);

  it('fails only the cell whose render carries an id: a dashboard never writes it', async () => {
    const errors = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    // The first dashboard stamps the metric render. On the second, a widget whose render names that registered
    // stamp passes its own registration, and the root still refuses it: the root alone stamps a render.
    const SECOND = 'gts.frontx.dashboard.dashboard.dashboard.v1~1c2d3e4f-5a6b-4c7d-8e9f-0a1b2c3d4e5f';
    const stamp = renderStampIdOf(METRIC_RENDER, metric.widget.id, 'cell');
    const named = { ...metric, widget: { ...metric.widget, id: metric.widget.id.replace(/[0-9a-f]{4}$/, 'a0b1'), render: { ...metric.widget.render, id: stamp } } };
    const first = fileWith([], [metric]);
    const file: ServedFile = { ...first, instances: [...first.instances, { ...demo, id: SECOND, layout: { cells: [metric, named] } }] };
    const root = new DashboardRoot({ host: createMockHost({ delayMs: 0, file }), entries, origin: 'http://localhost' });
    const { container, rerender } = render(<Dashboard root={root} dashboardId={DEMO_DASHBOARD_ID} theme="light" language="en" variables={DEMO_VARIABLES} />);
    await waitFor(() => expect(renderIds(container)).toEqual([stamp]), { timeout: 5000 });
    rerender(<Dashboard root={root} dashboardId={SECOND} theme="light" language="en" />);
    expect(await screen.findByText('This widget cannot be shown', {}, { timeout: 5000 })).toBeTruthy();
    await waitFor(() => expect(renderIds(container).filter(Boolean)).toEqual([stamp]), { timeout: 5000 });
    expect(screen.getAllByText('This widget cannot be shown')).toHaveLength(1);
    const lines = failureLines(errors, SECOND, named.widget.id);
    expect(lines).toHaveLength(1);
    expect(lines[0]).toContain('a0b1');
    expect(lines[0]).toContain('the render carries the GTS field id');
    errors.mockRestore();
  }, 15_000);

  // The names the type store reads as an instance's identity or as a schema marker; the type names pass to the render type.
  it.each(['$id', 'gtsId', 'gtsIid', 'gtsOid', 'gtsI', 'gts_id', 'gts_oid', 'gts_iid', '$schema'])('fails only the cell whose render carries the reserved field %s', async (name) => {
    const errors = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    // An open render type lets the field through the widget's own registration; only the root's guard stops it.
    const open = productType('open_render', {}, {});
    const cell = widgetOf('open_render', '0004', { [name]: `${RENDER_BASE}0b7c1d2e-3f40-4a51-8b62-000000000099`, label: 'Deploys' });
    const root = new DashboardRoot({ host: createMockHost({ delayMs: 0, file: fileWith([open], [metric, cell]) }), entries, origin: 'http://localhost' });
    const { container } = render(<Dashboard root={root} dashboardId={DEMO_DASHBOARD_ID} theme="light" language="en" variables={DEMO_VARIABLES} />);
    expect(await screen.findByText('This widget cannot be shown', {}, { timeout: 5000 })).toBeTruthy();
    await waitFor(() => expect(renderIds(container).filter(Boolean)).toHaveLength(1), { timeout: 5000 });
    expect(screen.getAllByText('This widget cannot be shown')).toHaveLength(1);
    const lines = failureLines(errors, DEMO_DASHBOARD_ID, cell.widget.id);
    expect(lines).toHaveLength(1);
    expect(lines[0]).toContain('0004');
    expect(lines[0]).toContain(`the render carries the GTS field ${name}`);
    errors.mockRestore();
  }, 15_000);

  // The harm the guard stops: a render naming a stamp registered under another render type would register as that
  // stamp, be validated against that type instead of its own, and reach the widget.
  it.each(['gtsId', '$id'])('fails the cell whose render names a registered stamp in %s, and the widget receives no render', async (name) => {
    const errors = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const SECOND = 'gts.frontx.dashboard.dashboard.dashboard.v1~1c2d3e4f-5a6b-4c7d-8e9f-0a1b2c3d4e60';
    // The first dashboard registers two stamps: one of a widget whose render is inline, a render base instance, which
    // allows any field, and one of a widget whose render names the closed metric_card render.
    const open = productType('open_render', {}, {});
    const referred = productType('ref_metric', {}, { $ref: `gts://${METRIC_RENDER}` });
    const based = widgetOf('open_render', '0007', { label: 'Deploys' });
    const valid = widgetOf('ref_metric', '0008', { value_label: 'fine' });
    const baseStamp = renderStampIdOf(RENDER_BASE, based.widget.id, 'cell');
    const metricStamp = renderStampIdOf(METRIC_RENDER, valid.widget.id, 'cell');
    // The second dashboard shows the open widget with a render its own open type accepts, naming the metric stamp.
    const named = { ...based, widget: { ...based.widget, render: { label: 'Deploys', [name]: metricStamp } } };
    const first = fileWith([open, referred], [based, valid]);
    const file: ServedFile = { ...first, instances: [...first.instances, { ...demo, id: SECOND, layout: { cells: [named] } }] };
    const root = new DashboardRoot({ host: createMockHost({ delayMs: 0, file }), entries, origin: 'http://localhost' });
    const { container, rerender } = render(<Dashboard root={root} dashboardId={DEMO_DASHBOARD_ID} theme="light" language="en" variables={DEMO_VARIABLES} />);
    await waitFor(() => expect(renderIds(container)).toEqual([baseStamp, metricStamp]), { timeout: 5000 });
    rerender(<Dashboard root={root} dashboardId={SECOND} theme="light" language="en" />);
    expect(await screen.findByText('This widget cannot be shown', {}, { timeout: 5000 })).toBeTruthy();
    const lines = failureLines(errors, SECOND, named.widget.id);
    expect(lines).toHaveLength(1);
    expect(lines[0]).toContain(`the render carries the GTS field ${name}`);
    expect(renderIds(container).filter(Boolean)).toEqual([]);
    errors.mockRestore();
  }, 15_000);

  it('fails the cell whose render names the render base in a free type field: the field does not redirect validation', async () => {
    const errors = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const referred = productType('ref_metric', {}, { $ref: `gts://${METRIC_RENDER}` });
    const cell = widgetOf('ref_metric', '0008', { type: RENDER_BASE, radius: '50%' });
    const root = new DashboardRoot({ host: createMockHost({ delayMs: 0, file: fileWith([referred], [metric, cell]) }), entries, origin: 'http://localhost' });
    const { container } = render(<Dashboard root={root} dashboardId={DEMO_DASHBOARD_ID} theme="light" language="en" variables={DEMO_VARIABLES} />);
    expect(await screen.findByText('This widget cannot be shown', {}, { timeout: 5000 })).toBeTruthy();
    await waitFor(() => expect(renderIds(container).filter(Boolean)).toHaveLength(1), { timeout: 5000 });
    const lines = failureLines(errors, DEMO_DASHBOARD_ID, cell.widget.id);
    expect(lines).toHaveLength(1);
    expect(lines[0]).toContain('0008');
    // Judged against the metric_card render, not the open render base the field names.
    expect(lines[0]).toContain('#/render/radius');
    errors.mockRestore();
  }, 15_000);

  // Pins the reserved list to the type store, through the plugin's public API on a loaded store: a store release that
  // reads another top-level name as the instance's identity or as a schema marker fails here. `id` is reserved because
  // the root stamps it, and an object cannot carry it twice, so it is checked as the stamp alone. The candidates are
  // written out, apart from the list under test. The stamp is under the open render base: a closed render type rejects
  // any field it does not declare, which would hide whether the store read the field as data.
  it.each(['id', '$id', 'gtsId', 'gtsIid', 'gtsOid', 'gtsI', 'gts_id', 'gts_oid', 'gts_iid', '$schema', 'type', 'schema', 'gtsType', 'gtsTid', 'gtsT', 'gts_t', 'gts_tid', 'gts_type', 'radius'])(
    'has the store take a stamped render carrying %s as the stamp exactly when the root does not reserve the name',
    async (name) => {
      const root = new DashboardRoot({ host: createMockHost({ delayMs: 0, file: fileWith([], [metric]) }), entries, origin: 'http://localhost' });
      expect((await root.load(DEMO_DASHBOARD_ID)).ok).toBe(true);
      const stamp = renderStampIdOf(RENDER_BASE, metric.widget.id, 'cell');
      const other = `${RENDER_BASE}0b7c1d2e-3f40-4a51-8b62-000000000099`;
      const notFound = (id: string) => /^Entity not found/.test(root.types.validateInstance(id).errors[0]?.message ?? '');
      let threw = false;
      try {
        root.types.register(name === 'id' ? { value_label: 'ok', id: stamp } : { [name]: other, value_label: 'ok', id: stamp });
      } catch {
        threw = true;
      }
      const stampValid = !threw && root.types.validateInstance(stamp).valid;
      if (name === 'id' || !RENDER_RESERVED_FIELDS.includes(name)) {
        // A free name is data: the instance is the stamp, and the other id names nothing.
        expect(stampValid).toBe(true);
        expect(notFound(other)).toBe(true);
      } else {
        // A reserved name: the store registers under the other id, rejects the instance or takes it as a schema, never the stamp.
        expect(stampValid).toBe(false);
      }
    },
  );

  it('does not refuse a free top-level type field: a product render that declares one renders', async () => {
    const charted = productType('charted', {}, { additionalProperties: false, properties: { type: { enum: ['bar', 'line'] }, label: { type: 'string' } } });
    const cell = widgetOf('charted', '0005', { type: 'bar', label: 'Deploys' });
    const root = new DashboardRoot({ host: createMockHost({ delayMs: 0, file: fileWith([charted], [cell]) }), entries, origin: 'http://localhost' });
    const { container } = render(<Dashboard root={root} dashboardId={DEMO_DASHBOARD_ID} theme="light" language="en" variables={DEMO_VARIABLES} />);
    await waitFor(() => expect(renderIds(container)).toEqual([renderStampIdOf(RENDER_BASE, cell.widget.id, 'cell')]), { timeout: 5000 });
  }, 15_000);

  it('fails the cell run whose render throws while the root copies it for the stamp, with one console line', async () => {
    const errors = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const root = new DashboardRoot({ host: createMockHost({ delayMs: 0, file: fileWith([productType('open_render', {}, {})], [metric]) }), entries, origin: 'http://localhost' });
    expect((await root.load(DEMO_DASHBOARD_ID)).ok).toBe(true);
    // An in-code host may hand a render with a getter; the cell run reads it with no failure from load.
    const throwing = Object.defineProperty({ label: 'Deploys' }, 'value_label', { enumerable: true, get: () => { throw new Error('getter boom'); } });
    const { widget } = widgetOf('open_render', '0006', throwing);
    const states: string[] = [];
    root.runCell({ dashboardId: DEMO_DASHBOARD_ID, widget, role: 'cell', shared: new SharedRequests({}, root.host, root.origin), update: (change) => void ('state' in change && states.push(change.state)) });
    await waitFor(() => expect(states.at(-1)).toBe('cannot-be-shown'));
    const lines = failureLines(errors, DEMO_DASHBOARD_ID, widget.id);
    expect(lines).toHaveLength(1);
    expect(lines[0]).toContain('0006');
    expect(lines[0]).toContain('the render cannot be read: Error: getter boom');
    errors.mockRestore();
  });

  it('fails a cell run handed a widget that skipped registration, whose render its render type rejects, at the stamp', async () => {
    const errors = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const root = new DashboardRoot({ host: createMockHost({ delayMs: 0, file: fileWith([productType('ref_metric', {}, { $ref: `gts://${METRIC_RENDER}` })], [metric]) }), entries, origin: 'http://localhost' });
    expect((await root.load(DEMO_DASHBOARD_ID)).ok).toBe(true);
    // The load registered only the dashboard's own widgets: this one reaches the stamp with no registration of its own.
    const { widget } = widgetOf('ref_metric', '000a', { radius: '50%' });
    const states: string[] = [];
    root.runCell({ dashboardId: DEMO_DASHBOARD_ID, widget, role: 'cell', shared: new SharedRequests({}, root.host, root.origin), update: (change) => void ('state' in change && states.push(change.state)) });
    await waitFor(() => expect(states.at(-1)).toBe('cannot-be-shown'));
    const lines = failureLines(errors, DEMO_DASHBOARD_ID, widget.id);
    expect(lines).toHaveLength(1);
    expect(lines[0]).toContain('000a');
    expect(lines[0]).toContain(`the render fails ${METRIC_RENDER}`);
    expect(lines[0]).toContain('radius');
    errors.mockRestore();
  });

  it('fails only the cell whose render names an id that is no registered render', async () => {
    const errors = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const unknown = { ...metric, widget: { ...metric.widget, id: metric.widget.id.replace(/[0-9a-f]{4}$/, 'a0b2'), render: { id: `${METRIC_RENDER}0b7c1d2e-3f40-4a51-8b62-000000000077` } } };
    const root = new DashboardRoot({ host: createMockHost({ delayMs: 0, file: fileWith([], [metric, unknown]) }), entries, origin: 'http://localhost' });
    const { container } = render(<Dashboard root={root} dashboardId={DEMO_DASHBOARD_ID} theme="light" language="en" variables={DEMO_VARIABLES} />);
    expect(await screen.findByText('This widget cannot be shown', {}, { timeout: 5000 })).toBeTruthy();
    await waitFor(() => expect(renderIds(container).filter(Boolean)).toHaveLength(1), { timeout: 5000 });
    expect(screen.getAllByText('This widget cannot be shown')).toHaveLength(1);
    const lines = failureLines(errors, DEMO_DASHBOARD_ID, unknown.widget.id);
    expect(lines).toHaveLength(1);
    expect(lines[0]).toContain('a0b2');
    expect(lines[0]).toContain('/render/id x-gts-instance-ref');
    errors.mockRestore();
  }, 15_000);

  it('fails only the cell of a widget type whose render $ref is not a render type, and shows the rest', async () => {
    const errors = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    // A registered type outside the render chain that any render passes, so the widget registers and its run fails.
    const LOOSE = 'gts.frontx.test.loose.loose_type.v1~';
    const loose = { $id: `gts://${LOOSE}`, $schema: 'https://json-schema.org/draft/2020-12/schema', type: 'object' };
    const cell = widgetOf('loose_ref', '000b', metric.widget.render);
    const root = new DashboardRoot({ host: createMockHost({ delayMs: 0, file: fileWith([loose, productType('loose_ref', {}, { $ref: `gts://${LOOSE}` })], [metric, cell]) }), entries, origin: 'http://localhost' });
    const { container } = render(<Dashboard root={root} dashboardId={DEMO_DASHBOARD_ID} theme="light" language="en" variables={DEMO_VARIABLES} />);
    expect(await screen.findByText('This widget cannot be shown', {}, { timeout: 5000 })).toBeTruthy();
    await waitFor(() => expect(renderIds(container).filter(Boolean)).toEqual([renderStampIdOf(METRIC_RENDER, metric.widget.id, 'cell')]), { timeout: 5000 });
    expect(screen.getAllByText('This widget cannot be shown')).toHaveLength(1);
    const lines = errors.mock.calls.map(([line]) => String(line)).filter((line) => line.includes('000b'));
    expect(lines).toHaveLength(1);
    expect(lines[0]).toContain(`names gts.frontx.test.loose.loose_type.v1~, which is not the render base`);
    errors.mockRestore();
  }, 15_000);

  it('stamps an inline render of a product widget type, one with no $ref, with the render base, and renders it', async () => {
    const pulse = productType('inline_pulse', {}, { additionalProperties: false, properties: { label: { type: 'string' } } });
    const cell = widgetOf('inline_pulse', '0003', { label: 'Deploys' });
    const root = new DashboardRoot({ host: createMockHost({ delayMs: 0, file: fileWith([pulse], [cell]) }), entries, origin: 'http://localhost' });
    const { container } = render(<Dashboard root={root} dashboardId={DEMO_DASHBOARD_ID} theme="light" language="en" variables={DEMO_VARIABLES} />);
    await waitFor(() => expect(renderIds(container)).toEqual([renderStampIdOf(RENDER_BASE, cell.widget.id, 'cell')]), { timeout: 5000 });
    expect(shadowTexts(container)[0]).toContain('data id,value');
  }, 15_000);
});

/**
 * A host page that owns the period, as a product does: it keeps the value, draws plain buttons outside the dashboard
 * and passes the value through the `variables` input.
 */
function PeriodHost(props: Omit<DashboardProps, 'variables'>) {
  const [period, setPeriod] = useState('30d');
  return (
    <>
      {[['7d', 'Last 7 days'], ['30d', 'Last 30 days'], ['90d', 'Last 90 days']].map(([value, label]) => (
        <button key={value} type="button" aria-pressed={period === value} onClick={() => setPeriod(value)}>
          {label}
        </button>
      ))}
      <Dashboard {...props} variables={{ period }} />
    </>
  );
}

// Variables: the host gives the values, the root builds each request from them and re-runs only the cells that use them.
describe('variables from the host', () => {
  const METRIC = `${ENTRY}metric_card.v1`;
  const demo = DEMO_SERVED_FILE.instances.find((instance) => instance.id === DEMO_DASHBOARD_ID) as { layout: { cells: { widget: { id: string } }[] } };
  const metric = demo.layout.cells.find((cell) => cell.widget.id.includes('.metric_card.'))!;
  const VARIABLES_ID = 'gts.frontx.dashboard.dashboard.dashboard.v1~2d3e4f5a-6b7c-4d8e-9f0a-1b2c3d4e5f60';

  /** A widget entry that writes the value of the data it receives. */
  const valueEntry = (): MfeEntryLifecycle => {
    let output: HTMLElement | undefined;
    return {
      mount(container, bridge) {
        output = document.createElement('output');
        container.appendChild(output);
        bridge.registerActionHandler(
          RENDER_WIDGET_ACTION_ID,
          ActionHandler.fromFunction(async (_type, payload) => {
            output!.textContent = `value ${String((payload as { data?: { value?: unknown } }).data?.value)}`;
          }),
        );
      },
      unmount() {
        output?.remove();
      },
    };
  };

  const cellOf = (suffix: string, data: Record<string, unknown>) => ({ ...metric, widget: { ...metric.widget, id: metric.widget.id.replace(/[0-9a-f]{4}$/, suffix), render: {}, data } });
  /** Two cells on one shared request that names the period, one own request that names it, one that does not. */
  const CELLS = [
    cellOf('b001', { source: 'ci', transform: "{'value': response.value}" }),
    cellOf('b002', { source: 'ci', transform: "{'value': response.value}" }),
    cellOf('b003', { request: { method: 'GET', path: '/api/demo/repos/activity', variables: { period: 'period' } }, transform: "{'value': response.value}" }),
    cellOf('b004', { request: { method: 'GET', path: '/api/demo/teams/goals' }, transform: "{'value': response.value}" }),
  ];
  const fileOf = (extra: Record<string, unknown> = {}, cells: unknown[] = CELLS): ServedFile => ({
    ...DEMO_SERVED_FILE,
    instances: [
      ...DEMO_SERVED_FILE.instances,
      {
        id: VARIABLES_ID,
        title: 'Variables',
        requests: { ci: { method: 'GET', path: '/api/demo/ci/outcomes', variables: { period: 'period' } } },
        ...extra,
        layout: { cells },
      },
    ],
  });
  /**
   * A host that counts every request path and answers with the number of days of the `period` it received (none for
   * a request without one). `delays` slows the answers whose path contains a key; a path containing `failing` fails.
   * `received(path)` settles once a request for `path` has arrived, so a test waits on the request, not on time.
   */
  const countingHost = (file: ServedFile, delays: Record<string, number> = {}, failing?: string) => {
    const sent: string[] = [];
    const waiting = new Map<string, () => void>();
    const received = (path: string) => (sent.includes(path) ? Promise.resolve() : new Promise<void>((resolve) => waiting.set(path, resolve)));
    const mock = createMockHost({ delayMs: 0, file });
    const host: DashboardHost = {
      loadFile: (signal) => mock.loadFile(signal),
      request: async (request) => {
        sent.push(request.path);
        waiting.get(request.path)?.();
        const delay = Object.entries(delays).find(([key]) => request.path.includes(key))?.[1] ?? 0;
        if (delay) await new Promise((resolve) => setTimeout(resolve, delay));
        if (failing && request.path.includes(failing)) throw new Error('500');
        const period = new URL(request.path, 'http://localhost').searchParams.get('period');
        return { value: period === null ? null : Number.parseInt(period, 10) };
      },
    };
    return { host, sent, received };
  };
  const values = (container: HTMLElement) => [...container.querySelectorAll<HTMLElement>('[data-widget-extension]')].map((host) => host.shadowRoot?.querySelector('output')?.textContent ?? '');
  /** What the four cells show at a period of `days` days: the three that use the period show it, the last one shows none. */
  const at = (days: number) => [`value ${days}`, `value ${days}`, `value ${days}`, 'value null'];
  const entriesWithValues = { ...entries, [METRIC]: valueEntry };
  const CANNOT = 'This widget cannot be shown';
  const settle = (ms = 300) => new Promise((resolve) => setTimeout(resolve, ms));

  it('re-requests only the cells that use a switched variable, and sends a shared request once per value', async () => {
    const { host, sent } = countingHost(fileOf());
    const { container } = render(<PeriodHost root={new DashboardRoot({ host, entries: entriesWithValues, origin: 'http://localhost' })} dashboardId={VARIABLES_ID} theme="light" language="en" />);
    await waitFor(() => expect(values(container)).toEqual(at(30)), { timeout: 5000 });
    expect([...sent].sort()).toEqual(['/api/demo/ci/outcomes?period=30d', '/api/demo/repos/activity?period=30d', '/api/demo/teams/goals']);
    sent.length = 0;
    fireEvent.click(screen.getByRole('button', { name: 'Last 7 days' }));
    await waitFor(() => expect(values(container)).toEqual(at(7)), { timeout: 5000 });
    // One request for the two cells of the shared request, one for the own request, none for the cell that does not use the period.
    expect([...sent].sort()).toEqual(['/api/demo/ci/outcomes?period=7d', '/api/demo/repos/activity?period=7d']);
    // A value seen before keeps its shared answer; only the own request goes out again.
    sent.length = 0;
    fireEvent.click(screen.getByRole('button', { name: 'Last 30 days' }));
    await waitFor(() => expect(values(container)).toEqual(at(30)), { timeout: 5000 });
    expect(sent).toEqual(['/api/demo/repos/activity?period=30d']);
  }, 15_000);

  it('fails each cell whose request names a variable the host does not give, with the name in its line, and shows the rest', async () => {
    const errors = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const { host, sent } = countingHost(fileOf());
    const { container } = render(<Dashboard root={new DashboardRoot({ host, entries: entriesWithValues, origin: 'http://localhost' })} dashboardId={VARIABLES_ID} theme="light" language="en" />);
    await waitFor(() => expect(screen.getAllByText(CANNOT)).toHaveLength(3), { timeout: 5000 });
    await waitFor(() => expect(values(container).filter(Boolean)).toEqual(['value null']), { timeout: 5000 });
    expect(sent).toEqual(['/api/demo/teams/goals']);
    const lines = errors.mock.calls.map(([line]) => String(line)).filter((line) => line.includes('the host gives no value for the variable period'));
    expect(lines.map((line) => line.match(/b00\d/)?.[0]).sort()).toEqual(['b001', 'b002', 'b003']);
  }, 15_000);

  it.each([
    ['NaN', Number.NaN],
    ['Infinity', Number.POSITIVE_INFINITY],
    ['an object', { days: 7 }],
    ['null', null],
  ])('fails the cells that use a host value that is %s, with a reason that names the variable and not the value', async (_name, value) => {
    const errors = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const { host, sent } = countingHost(fileOf());
    const variables = { period: value } as unknown as DashboardProps['variables'];
    render(<Dashboard root={new DashboardRoot({ host, entries: entriesWithValues, origin: 'http://localhost' })} dashboardId={VARIABLES_ID} theme="light" language="en" variables={variables} />);
    await waitFor(() => expect(screen.getAllByText(CANNOT)).toHaveLength(3), { timeout: 5000 });
    expect(sent).toEqual(['/api/demo/teams/goals']);
    const lines = errors.mock.calls.map(([line]) => String(line)).filter((line) => line.includes('the value of the variable period is not a string, a finite number or a boolean'));
    expect(lines).toHaveLength(3);
    expect(lines.some((line) => line.includes('days') || line.includes('NaN') || line.includes('Infinity'))).toBe(false);
  }, 15_000);

  it('counts variables that are not an object, such as a string, as none: the cells that name a variable fail with its name', async () => {
    const errors = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const { host, sent } = countingHost(fileOf());
    const variables = 'period=30d' as unknown as DashboardProps['variables'];
    const { container } = render(<Dashboard root={new DashboardRoot({ host, entries: entriesWithValues, origin: 'http://localhost' })} dashboardId={VARIABLES_ID} theme="light" language="en" variables={variables} />);
    await waitFor(() => expect(screen.getAllByText(CANNOT)).toHaveLength(3), { timeout: 5000 });
    await waitFor(() => expect(values(container).filter(Boolean)).toEqual(['value null']), { timeout: 5000 });
    expect(sent).toEqual(['/api/demo/teams/goals']);
    const lines = errors.mock.calls.map(([line]) => String(line)).filter((line) => line.includes('the host gives no value for the variable period'));
    expect(lines.map((line) => line.match(/b00\d/)?.[0]).sort()).toEqual(['b001', 'b002', 'b003']);
  }, 15_000);

  it('fails only the cells that name a variable whose value cannot be read, naming the variable and not the error', async () => {
    const errors = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const { host, sent } = countingHost(fileOf());
    const variables = Object.defineProperty({}, 'period', { enumerable: true, get: () => { throw new Error('secret-in-error'); } }) as DashboardProps['variables'];
    const { container } = render(<Dashboard root={new DashboardRoot({ host, entries: entriesWithValues, origin: 'http://localhost' })} dashboardId={VARIABLES_ID} theme="light" language="en" variables={variables} />);
    await waitFor(() => expect(screen.getAllByText(CANNOT)).toHaveLength(3), { timeout: 5000 });
    await waitFor(() => expect(values(container).filter(Boolean)).toEqual(['value null']), { timeout: 5000 });
    expect(sent).toEqual(['/api/demo/teams/goals']);
    const lines = errors.mock.calls.map(([line]) => String(line));
    expect(lines.filter((line) => line.includes('the value of the variable period cannot be read')).map((line) => line.match(/b00\d/)?.[0]).sort()).toEqual(['b001', 'b002', 'b003']);
    expect(lines.some((line) => line.includes('secret-in-error'))).toBe(false);
  }, 15_000);

  it('keeps the dashboard up for a function value whose text throws: the cells that use it fail, the rest show', async () => {
    const errors = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const { host, sent } = countingHost(fileOf());
    const period = Object.assign(() => '7d', { toString: () => { throw new Error('secret-in-text'); } });
    const { container } = render(<Dashboard root={new DashboardRoot({ host, entries: entriesWithValues, origin: 'http://localhost' })} dashboardId={VARIABLES_ID} theme="light" language="en" variables={{ period } as unknown as DashboardProps['variables']} />);
    await waitFor(() => expect(screen.getAllByText(CANNOT)).toHaveLength(3), { timeout: 5000 });
    await waitFor(() => expect(values(container).filter(Boolean)).toEqual(['value null']), { timeout: 5000 });
    expect(sent).toEqual(['/api/demo/teams/goals']);
    const lines = errors.mock.calls.map(([line]) => String(line));
    expect(lines.filter((line) => line.includes('the value of the variable period is not a string, a finite number or a boolean'))).toHaveLength(3);
    expect(lines.some((line) => line.includes('secret-in-text'))).toBe(false);
  }, 15_000);

  it('counts host values whose names cannot be listed as unreadable, and runs the cells again on the next readable values', async () => {
    const errors = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const { host } = countingHost(fileOf());
    const root = new DashboardRoot({ host, entries: entriesWithValues, origin: 'http://localhost' });
    const unlisted = new Proxy({ period: '7d' }, { ownKeys: () => { throw new Error('secret-in-listing'); } });
    const view = render(<Dashboard root={root} dashboardId={VARIABLES_ID} theme="light" language="en" variables={unlisted} />);
    await waitFor(() => expect(screen.getAllByText(CANNOT)).toHaveLength(3), { timeout: 5000 });
    await waitFor(() => expect(values(view.container).filter(Boolean)).toEqual(['value null']), { timeout: 5000 });
    expect(screen.queryByRole('button', { name: /^Try again/ })).toBeNull();
    const lines = errors.mock.calls.map(([line]) => String(line));
    expect(lines.filter((line) => line.includes('the value of the variable period cannot be read')).map((line) => line.match(/b00\d/)?.[0]).sort()).toEqual(['b001', 'b002', 'b003']);
    expect(lines.some((line) => line.includes('secret-in-listing'))).toBe(false);
    view.rerender(<Dashboard root={root} dashboardId={VARIABLES_ID} theme="light" language="en" variables={{ period: '90d' }} />);
    await waitFor(() => expect(values(view.container)).toEqual(at(90)), { timeout: 5000 });
  }, 15_000);

  it('runs the cells again when a value the host gives as a non-enumerable property changes', async () => {
    const { host } = countingHost(fileOf());
    const root = new DashboardRoot({ host, entries: entriesWithValues, origin: 'http://localhost' });
    const hidden = (period: string) => Object.defineProperty({}, 'period', { value: period, enumerable: false });
    const view = render(<Dashboard root={root} dashboardId={VARIABLES_ID} theme="light" language="en" variables={hidden('30d')} />);
    await waitFor(() => expect(values(view.container)).toEqual(at(30)), { timeout: 5000 });
    view.rerender(<Dashboard root={root} dashboardId={VARIABLES_ID} theme="light" language="en" variables={hidden('7d')} />);
    await waitFor(() => expect(values(view.container)).toEqual(at(7)), { timeout: 5000 });
  }, 15_000);

  it('keeps the dashboard up when one value\'s own descriptor throws: the cells that name it fail, the rest show', async () => {
    const errors = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    // The fourth cell names the readable `team`, so a failure that spread to every variable would fail it too.
    const teamCell = cellOf('b004', { request: { method: 'GET', path: '/api/demo/teams/goals', variables: { team: 'team' } }, transform: "{'value': response.value}" });
    const { host, sent } = countingHost(fileOf({}, [...CELLS.slice(0, 3), teamCell]));
    const given = new Proxy({ period: '7d', team: 'web' }, {
      getOwnPropertyDescriptor: (target, name) => {
        if (name === 'period') throw new Error('secret-in-descriptor');
        return Reflect.getOwnPropertyDescriptor(target, name);
      },
    });
    const view = render(<Dashboard root={new DashboardRoot({ host, entries: entriesWithValues, origin: 'http://localhost' })} dashboardId={VARIABLES_ID} theme="light" language="en" variables={given} />);
    await waitFor(() => expect(screen.getAllByText(CANNOT)).toHaveLength(3), { timeout: 5000 });
    await waitFor(() => expect(values(view.container).filter(Boolean)).toEqual(['value null']), { timeout: 5000 });
    const lines = errors.mock.calls.map(([line]) => String(line));
    expect(lines.filter((line) => line.includes('the value of the variable period cannot be read'))).toHaveLength(3);
    expect(lines.some((line) => line.includes('secret-in-descriptor'))).toBe(false);
    expect(sent).toEqual(['/api/demo/teams/goals?team=web']);
  }, 15_000);

  it('keeps a host value out of the failure line when the default host answers 500 to a GET that carries it', async () => {
    const errors = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL) => Object.defineProperty(new Response('{}', { status: 500 }), 'url', { value: String(input) })));
    const mock = createMockHost({ delayMs: 0, file: fileOf({}, [CELLS[2]]) });
    const host: DashboardHost = { loadFile: (signal) => mock.loadFile(signal), request: fetchHost({ fileUrl: '/f.json', origin: 'http://localhost' }).request };
    render(<Dashboard root={new DashboardRoot({ host, entries: entriesWithValues, origin: 'http://localhost' })} dashboardId={VARIABLES_ID} theme="light" language="en" variables={{ period: 'value-of-period' }} />);
    expect(await screen.findByText(CANNOT, {}, { timeout: 5000 })).toBeTruthy();
    const lines = errors.mock.calls.map(([line]) => String(line)).filter((line) => line.includes('b003'));
    expect(lines).toHaveLength(1);
    expect(lines[0]).toContain('request GET /api/demo/repos/activity failed: /api/demo/repos/activity answered 500');
    expect(lines[0]).not.toContain('value-of-period');
  }, 15_000);

  it('puts a number value into the query as its text', async () => {
    const { host, sent } = countingHost(fileOf());
    const { container } = render(<Dashboard root={new DashboardRoot({ host, entries: entriesWithValues, origin: 'http://localhost' })} dashboardId={VARIABLES_ID} theme="light" language="en" variables={{ period: 7 }} />);
    await waitFor(() => expect(values(container)).toEqual(at(7)), { timeout: 5000 });
    expect([...sent].sort()).toEqual(['/api/demo/ci/outcomes?period=7', '/api/demo/repos/activity?period=7', '/api/demo/teams/goals']);
  }, 15_000);

  it('shows the second value of two quick switches, never the slower answer to the first', async () => {
    const { host } = countingHost(fileOf(), { 'period=7d': 400 });
    const root = new DashboardRoot({ host, entries: entriesWithValues, origin: 'http://localhost' });
    const view = render(<Dashboard root={root} dashboardId={VARIABLES_ID} theme="light" language="en" variables={{ period: '30d' }} />);
    await waitFor(() => expect(values(view.container)).toEqual(at(30)), { timeout: 5000 });
    view.rerender(<Dashboard root={root} dashboardId={VARIABLES_ID} theme="light" language="en" variables={{ period: '7d' }} />);
    view.rerender(<Dashboard root={root} dashboardId={VARIABLES_ID} theme="light" language="en" variables={{ period: '90d' }} />);
    await waitFor(() => expect(values(view.container)).toEqual(at(90)), { timeout: 5000 });
    // The 7-day answers arrive after the 90-day ones and are dropped.
    await new Promise((resolve) => setTimeout(resolve, 600));
    expect(values(view.container)).toEqual(at(90));
  }, 15_000);

  it('keeps a cell whose data fails its own check in that cell, and shows the rest', async () => {
    const errors = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    // The widget fails its own registration; its stand-in still carries the data, which no step may read as a binding.
    const bad = cellOf('b005', { request: null, transform: 'response' });
    const { host } = countingHost(fileOf(undefined, [CELLS[3], bad]));
    const { container } = render(<PeriodHost root={new DashboardRoot({ host, entries: entriesWithValues, origin: 'http://localhost' })} dashboardId={VARIABLES_ID} theme="light" language="en" />);
    await waitFor(() => expect(values(container)).toEqual(['value null']), { timeout: 5000 });
    expect(await screen.findByText(CANNOT)).toBeTruthy();
    expect(screen.getAllByText(CANNOT)).toHaveLength(1);
    expect(errors.mock.calls.some(([line]) => String(line).includes('b005') && String(line).includes('fails its own registration'))).toBe(true);
  }, 15_000);

  // StrictMode mounts each cell twice and runs its effects twice: each request still goes out once. The root drops a
  // re-run before the first run started (its `latest` check), and the cell's `ranWith` ref skips the repeated re-run effect.
  it('sends each request once on first show inside StrictMode, through the root\'s latest check and the cell\'s ranWith ref', async () => {
    const { host, sent } = countingHost(fileOf());
    const { container } = render(
      <StrictMode>
        <PeriodHost root={new DashboardRoot({ host, entries: entriesWithValues, origin: 'http://localhost' })} dashboardId={VARIABLES_ID} theme="light" language="en" />
      </StrictMode>,
    );
    await waitFor(() => expect(values(container)).toEqual(at(30)), { timeout: 5000 });
    await settle();
    expect([...sent].sort()).toEqual(['/api/demo/ci/outcomes?period=30d', '/api/demo/repos/activity?period=30d', '/api/demo/teams/goals']);
  }, 15_000);

  it('keeps a cell whose render_widget fell back cannot-be-shown across a variable switch, with no request for the new value', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const refusing: MfeEntryLifecycle = {
      mount(container, bridge) {
        bridge.registerActionHandler(RENDER_WIDGET_ACTION_ID, ActionHandler.fromFunction(async () => Promise.reject(new Error('refused'))));
        container.appendChild(document.createElement('output'));
      },
      unmount() {},
    };
    const { host, sent } = countingHost(fileOf(undefined, [CELLS[2]]));
    render(<PeriodHost root={new DashboardRoot({ host, entries: { ...entries, [METRIC]: () => refusing }, origin: 'http://localhost' })} dashboardId={VARIABLES_ID} theme="light" language="en" />);
    expect(await screen.findByText(CANNOT, {}, { timeout: 5000 })).toBeTruthy();
    expect(sent).toEqual(['/api/demo/repos/activity?period=30d']);
    fireEvent.click(screen.getByRole('button', { name: 'Last 7 days' }));
    await settle();
    expect(screen.getAllByText(CANNOT)).toHaveLength(1);
    expect(sent).toEqual(['/api/demo/repos/activity?period=30d']);
  }, 15_000);

  it('shows data again on the next value in a cell whose own request failed on the value before', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const { host } = countingHost(fileOf(), {}, 'activity?period=7d');
    const { container } = render(<PeriodHost root={new DashboardRoot({ host, entries: entriesWithValues, origin: 'http://localhost' })} dashboardId={VARIABLES_ID} theme="light" language="en" />);
    await waitFor(() => expect(values(container)).toEqual(at(30)), { timeout: 5000 });
    fireEvent.click(screen.getByRole('button', { name: 'Last 7 days' }));
    expect(await screen.findByText(CANNOT, {}, { timeout: 5000 })).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Last 90 days' }));
    await waitFor(() => expect(values(container)).toEqual(at(90)), { timeout: 5000 });
    expect(screen.queryByText(CANNOT)).toBeNull();
  }, 15_000);

  it('shows the new value of a switch made while the cells still mount', async () => {
    const { host, sent } = countingHost(fileOf(), { 'period=30d': 400 });
    // A widget that takes 300 ms to mount: the switch below lands after the cells sent their first requests and before
    // their widgets are mounted.
    const slow = (): MfeEntryLifecycle => {
      const entry = valueEntry();
      return { mount: (container, bridge) => settle().then(() => entry.mount(container, bridge)), unmount: (container) => entry.unmount(container) };
    };
    const root = new DashboardRoot({ host, entries: { ...entries, [METRIC]: slow }, origin: 'http://localhost' });
    const view = render(<Dashboard root={root} dashboardId={VARIABLES_ID} theme="light" language="en" variables={{ period: '30d' }} />);
    await waitFor(() => expect(sent).toHaveLength(3), { timeout: 5000 });
    expect(values(view.container).filter((text) => text.startsWith('value'))).toEqual([]);
    view.rerender(<Dashboard root={root} dashboardId={VARIABLES_ID} theme="light" language="en" variables={{ period: '7d' }} />);
    await waitFor(() => expect(values(view.container)).toEqual(at(7)), { timeout: 5000 });
    await settle(600);
    expect(values(view.container)).toEqual(at(7));
  }, 15_000);

  /** A metric entry whose render_widget handler rejects after `ms`, and reports each call. */
  const refusingAfter = (ms: number, onCall: () => void = () => undefined): MfeEntryLifecycle => ({
    mount(container, bridge) {
      bridge.registerActionHandler(
        RENDER_WIDGET_ACTION_ID,
        ActionHandler.fromFunction(async () => {
          onCall();
          await settle(ms);
          throw new Error('refused');
        }),
      );
      container.appendChild(document.createElement('output'));
    },
    unmount() {},
  });

  it('sends no shared request for a new value from a cell whose render_widget fell back', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const { host, sent } = countingHost(fileOf(undefined, [CELLS[0]]));
    render(<PeriodHost root={new DashboardRoot({ host, entries: { ...entries, [METRIC]: () => refusingAfter(0) }, origin: 'http://localhost' })} dashboardId={VARIABLES_ID} theme="light" language="en" />);
    expect(await screen.findByText(CANNOT, {}, { timeout: 5000 })).toBeTruthy();
    expect(sent).toEqual(['/api/demo/ci/outcomes?period=30d']);
    fireEvent.click(screen.getByRole('button', { name: 'Last 7 days' }));
    await settle();
    expect(sent).toEqual(['/api/demo/ci/outcomes?period=30d']);
  }, 15_000);

  it('prefetches a closed larger view at load, and on a variable change only when it opens', async () => {
    // The cell uses no variable; its larger view reads the shared request that names the period.
    const cell = { ...CELLS[3], larger_view: cellOf('b007', { source: 'ci', transform: "{'value': response.value}" }).widget };
    const { host, sent } = countingHost(fileOf(undefined, [cell]));
    const { container } = render(<PeriodHost root={new DashboardRoot({ host, entries: entriesWithValues, origin: 'http://localhost' })} dashboardId={VARIABLES_ID} theme="light" language="en" />);
    await waitFor(() => expect(values(container)).toEqual(['value null']), { timeout: 5000 });
    await settle();
    // At load the closed larger view's shared request goes out with the cell's own.
    expect([...sent].sort()).toEqual(['/api/demo/ci/outcomes?period=30d', '/api/demo/teams/goals']);
    sent.length = 0;
    fireEvent.click(screen.getByRole('button', { name: 'Last 7 days' }));
    await settle();
    // The larger view is closed, so no run asks for the new value.
    expect(sent).toEqual([]);
    fireEvent.click(screen.getByRole('button', { name: /larger/ }));
    await waitFor(() => expect(sent).toEqual(['/api/demo/ci/outcomes?period=7d']), { timeout: 5000 });
    await waitFor(() => expect([...document.querySelectorAll<HTMLElement>('[data-widget-extension]')].map((host) => host.shadowRoot?.querySelector('output')?.textContent)).toContain('value 7'), { timeout: 5000 });
  }, 15_000);

  it('prefetches a closed larger view again for a new root with the same dashboard id', async () => {
    const cell = { ...CELLS[3], larger_view: cellOf('b007', { source: 'ci', transform: "{'value': response.value}" }).widget };
    const first = countingHost(fileOf(undefined, [cell]));
    const view = render(<PeriodHost root={new DashboardRoot({ host: first.host, entries: entriesWithValues, origin: 'http://localhost' })} dashboardId={VARIABLES_ID} theme="light" language="en" />);
    // The prefetch goes out in the effects of the commit that builds the held answers, the same pass as a cell's own
    // request or before it, so the cell's own request is the signal that the prefetch had its chance.
    await first.received('/api/demo/teams/goals');
    expect([...first.sent].sort()).toEqual(['/api/demo/ci/outcomes?period=30d', '/api/demo/teams/goals']);
    await waitFor(() => expect(values(view.container)).toEqual(['value null']), { timeout: 5000 });
    // The same dashboard id keeps the shown dashboard mounted; its new root holds no answers yet, so this is a load again.
    const second = countingHost(fileOf(undefined, [cell]));
    view.rerender(<PeriodHost root={new DashboardRoot({ host: second.host, entries: entriesWithValues, origin: 'http://localhost' })} dashboardId={VARIABLES_ID} theme="light" language="en" />);
    await second.received('/api/demo/teams/goals');
    expect([...second.sent].sort()).toEqual(['/api/demo/ci/outcomes?period=30d', '/api/demo/teams/goals']);
  }, 15_000);

  it('does not prefetch the shared source of a widget that failed its own registration', async () => {
    const errors = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    // An extra field breaks the binding form, so the widget fails its own registration with its source still named.
    const bad = cellOf('b006', { source: 'ci', transform: "{'value': response.value}", extra: 1 });
    const { host, sent } = countingHost(fileOf(undefined, [CELLS[3], bad]));
    const { container } = render(<PeriodHost root={new DashboardRoot({ host, entries: entriesWithValues, origin: 'http://localhost' })} dashboardId={VARIABLES_ID} theme="light" language="en" />);
    await waitFor(() => expect(values(container)).toEqual(['value null']), { timeout: 5000 });
    expect(await screen.findByText(CANNOT)).toBeTruthy();
    expect(errors.mock.calls.some(([line]) => String(line).includes('b006') && String(line).includes('fails its own registration'))).toBe(true);
    fireEvent.click(screen.getByRole('button', { name: 'Last 7 days' }));
    await settle();
    expect(sent).toEqual(['/api/demo/teams/goals']);
  }, 15_000);

  describe('the retry button', () => {
    /** The retry button of any cell: a titled cell's button is named `Try again to load <title>`. */
    const RETRY = /^Try again/;
    /**
     * A host that answers like `countingHost`, fails every path containing a key of `failing` (a set the test changes
     * between clicks) and holds a path containing a key of `gates` until that gate opens. `received(path, n)` settles once
     * the n-th request for `path` has arrived, and `answered(path, n)` once the n-th answer for it has gone back.
     */
    const retryHost = (file: ServedFile) => {
      const sent: string[] = [];
      const done: string[] = [];
      const failing = new Set<string>();
      const gates = new Map<string, Promise<void>>();
      const waiters: { list: string[]; path: string; n: number; resolve: () => void }[] = [];
      const wake = () => {
        for (const waiter of [...waiters]) {
          if (waiter.list.filter((path) => path === waiter.path).length >= waiter.n) {
            waiters.splice(waiters.indexOf(waiter), 1);
            waiter.resolve();
          }
        }
      };
      const until = (list: string[]) => (path: string, n = 1) => new Promise<void>((resolve) => {
        waiters.push({ list, path, n, resolve });
        wake();
      });
      const mock = createMockHost({ delayMs: 0, file });
      const host: DashboardHost = {
        loadFile: (signal) => mock.loadFile(signal),
        request: async (request) => {
          sent.push(request.path);
          wake();
          const gate = [...gates].find(([key]) => request.path.includes(key))?.[1];
          if (gate) await gate;
          try {
            if ([...failing].some((key) => request.path.includes(key))) throw new Error('503');
            const period = new URL(request.path, 'http://localhost').searchParams.get('period');
            return { value: period === null ? null : Number.parseInt(period, 10) };
          } finally {
            done.push(request.path);
            // After the answer is back: the cell reads it on the next microtask.
            void Promise.resolve().then(wake);
          }
        },
      };
      return { host, sent, failing, gates, received: until(sent), answered: until(done) };
    };
    const show = (host: DashboardHost, extra: Record<string, MfeEntryLifecycle | (() => MfeEntryLifecycle)> = {}) =>
      render(<PeriodHost root={new DashboardRoot({ host, entries: { ...entriesWithValues, ...extra } as typeof entries, origin: 'http://localhost' })} dashboardId={VARIABLES_ID} theme="light" language="en" />);
    const OWN = '/api/demo/teams/goals';

    it('shows the button for a failed request, sends it again on a click, and shows the widget on success', async () => {
      vi.spyOn(console, 'error').mockImplementation(() => undefined);
      const file = fileOf(undefined, [CELLS[3]]);
      const { host, sent, failing } = retryHost(file);
      failing.add('goals');
      const { container } = show(host);
      const button = await screen.findByRole('button', { name: RETRY }, { timeout: 5000 });
      expect(screen.getByText(CANNOT)).toBeTruthy();
      expect(sent).toEqual([OWN]);
      failing.clear();
      fireEvent.click(button);
      await waitFor(() => expect(values(container)).toEqual(['value null']), { timeout: 5000 });
      expect(sent).toEqual([OWN, OWN]);
      expect(screen.queryByText(CANNOT)).toBeNull();
      expect(screen.queryByRole('button', { name: RETRY })).toBeNull();
    }, 15_000);

    it('shows the button again when the retry fails again, and nothing changes after several tries', async () => {
      vi.spyOn(console, 'error').mockImplementation(() => undefined);
      const file = fileOf(undefined, [CELLS[3]]);
      const { host, sent, failing, answered } = retryHost(file);
      failing.add('goals');
      show(host);
      for (let attempt = 1; attempt <= 3; attempt += 1) {
        fireEvent.click(await screen.findByRole('button', { name: RETRY }, { timeout: 5000 }));
        await answered(OWN, attempt + 1);
      }
      expect(await screen.findByRole('button', { name: RETRY }, { timeout: 5000 })).toBeTruthy();
      expect(screen.getAllByText(CANNOT)).toHaveLength(1);
      expect(sent).toEqual([OWN, OWN, OWN, OWN]);
    }, 15_000);

    it('shows the loader while the retry runs', async () => {
      vi.spyOn(console, 'error').mockImplementation(() => undefined);
      const file = fileOf(undefined, [CELLS[3]]);
      const { host, failing, gates, received } = retryHost(file);
      failing.add('goals');
      const { container } = show(host);
      const button = await screen.findByRole('button', { name: RETRY }, { timeout: 5000 });
      failing.clear();
      let open: () => void = () => undefined;
      gates.set('goals', new Promise<void>((resolve) => (open = resolve)));
      fireEvent.click(button);
      await received(OWN, 2);
      expect(screen.getByRole('status', { name: 'Loading' })).toBeTruthy();
      expect(screen.queryByRole('button', { name: RETRY })).toBeNull();
      open();
      await waitFor(() => expect(values(container)).toEqual(['value null']), { timeout: 5000 });
    }, 15_000);

    it('sends a failed shared request once for the two cells that read it, and both show the new answer', async () => {
      vi.spyOn(console, 'error').mockImplementation(() => undefined);
      const file = fileOf(undefined, [CELLS[0], CELLS[1]]);
      const { host, sent, failing } = retryHost(file);
      failing.add('outcomes');
      const { container } = show(host);
      await waitFor(() => expect(screen.getAllByRole('button', { name: RETRY })).toHaveLength(2), { timeout: 5000 });
      expect(sent).toEqual(['/api/demo/ci/outcomes?period=30d']);
      failing.clear();
      fireEvent.click(screen.getAllByRole('button', { name: RETRY })[1]);
      await waitFor(() => expect(values(container)).toEqual(['value 30', 'value 30']), { timeout: 5000 });
      expect(sent).toEqual(['/api/demo/ci/outcomes?period=30d', '/api/demo/ci/outcomes?period=30d']);
      expect(screen.queryByRole('button', { name: RETRY })).toBeNull();
    }, 15_000);

    it('also re-runs a cell still mounting on the failed shared answer, so both cells recover with one new request', async () => {
      vi.spyOn(console, 'error').mockImplementation(() => undefined);
      const file = fileOf(undefined, [CELLS[0], CELLS[1]]);
      const { host, sent, failing } = retryHost(file);
      failing.add('outcomes');
      // The second metric widget to mount waits on a gate: its cell holds the failed shared answer but has not shown it.
      let open: () => void = () => undefined;
      const gate = new Promise<void>((resolve) => (open = resolve));
      let reached: () => void = () => undefined;
      const mounting = new Promise<void>((resolve) => (reached = resolve));
      let made = 0;
      const gated = (): MfeEntryLifecycle => {
        const entry = valueEntry();
        made += 1;
        if (made < 2) return entry;
        return { mount: (container, bridge) => (reached(), gate.then(() => entry.mount(container, bridge))), unmount: (container) => entry.unmount(container) };
      };
      const { container } = show(host, { [METRIC]: gated });
      const button = await screen.findByRole('button', { name: RETRY }, { timeout: 5000 });
      await mounting;
      expect(screen.getAllByRole('button', { name: RETRY })).toHaveLength(1);
      expect(sent).toEqual(['/api/demo/ci/outcomes?period=30d']);
      failing.clear();
      fireEvent.click(button);
      open();
      await waitFor(() => expect(values(container)).toEqual(['value 30', 'value 30']), { timeout: 5000 });
      expect(sent).toEqual(['/api/demo/ci/outcomes?period=30d', '/api/demo/ci/outcomes?period=30d']);
      expect(screen.queryByText(CANNOT)).toBeNull();
    }, 15_000);

    it('ends with the newest value when a variable changes while a retry is on the way', async () => {
      // Fake timers that also run with real time: the test can jump past the cell's settle time instead of waiting it out.
      vi.useFakeTimers({ shouldAdvanceTime: true });
      vi.spyOn(console, 'error').mockImplementation(() => undefined);
      const file = fileOf(undefined, [CELLS[2]]);
      const { host, failing, gates, received, answered } = retryHost(file);
      // Every value the widget is drawn with, in order: a stale answer that got through would show up here.
      const drawn: string[] = [];
      const recording = (): MfeEntryLifecycle => ({
        mount(container, bridge) {
          const output = document.createElement('output');
          container.appendChild(output);
          bridge.registerActionHandler(
            RENDER_WIDGET_ACTION_ID,
            ActionHandler.fromFunction(async (_type, payload) => {
              output.textContent = `value ${String((payload as { data?: { value?: unknown } }).data?.value)}`;
              drawn.push(output.textContent);
            }),
          );
        },
        unmount() {},
      });
      const ACTIVITY_30 = '/api/demo/repos/activity?period=30d';
      failing.add('period=30d');
      const { container } = show(host, { [METRIC]: recording });
      const button = await screen.findByRole('button', { name: RETRY }, { timeout: 5000 });
      failing.clear();
      let open: () => void = () => undefined;
      gates.set('period=30d', new Promise<void>((resolve) => (open = resolve)));
      fireEvent.click(button);
      await received(ACTIVITY_30, 2);
      fireEvent.click(screen.getByRole('button', { name: 'Last 7 days' }));
      await waitFor(() => expect(values(container)).toEqual(['value 7']), { timeout: 5000 });
      // The retry's answer for 30 days comes back after the newer run: its run token is stale, so it is dropped.
      open();
      await answered(ACTIVITY_30, 2);
      // A stale answer that got through would be drawn once the cell's quiet time after placing (80 ms) is over; jump
      // well past it.
      await act(() => vi.advanceTimersByTimeAsync(1000));
      expect(drawn).toEqual(['value 7']);
      expect(values(container)).toEqual(['value 7']);
      expect(screen.queryByRole('status', { name: 'Loading' })).toBeNull();
    }, 15_000);

    it('applies the same rule to a larger view whose own request failed', async () => {
      vi.spyOn(console, 'error').mockImplementation(() => undefined);
      const cell = { ...CELLS[3], larger_view: cellOf('b008', { request: { method: 'GET', path: '/api/demo/repos/activity' }, transform: "{'value': response.value}" }).widget };
      const file = fileOf(undefined, [cell]);
      const { host, sent, failing } = retryHost(file);
      failing.add('activity');
      show(host);
      await waitFor(() => expect(values(document.body)).toEqual(['value null']), { timeout: 5000 });
      expect(screen.queryByRole('button', { name: RETRY })).toBeNull();
      fireEvent.click(screen.getByRole('button', { name: /larger/ }));
      const dialog = await screen.findByRole('dialog');
      const button = await within(dialog).findByRole('button', { name: RETRY }, { timeout: 5000 });
      failing.clear();
      fireEvent.click(button);
      await waitFor(() => expect(values(document.body)).toEqual(['value null', 'value null']), { timeout: 5000 });
      expect(sent.filter((path) => path === '/api/demo/repos/activity')).toHaveLength(2);
      expect(within(dialog).queryByRole('button', { name: RETRY })).toBeNull();
    }, 15_000);

    it.each([
      ['a registration failure of the widget', () => cellOf('c001', { request: null, transform: 'response' })],
      ['a render that fails at its stamp', () => ({ ...cellOf('c002', { request: { method: 'GET', path: OWN }, transform: "{'value': response.value}" }), widget: { ...cellOf('c002', {}).widget, render: { gtsI: 'x' }, data: { request: { method: 'GET', path: OWN }, transform: "{'value': response.value}" } } })],
      ['a transform that fails', () => cellOf('c003', { request: { method: 'GET', path: OWN }, transform: "{'value': response.missing.deeper}" })],
      ['a transform result that is not an object', () => cellOf('c004', { request: { method: 'GET', path: OWN }, transform: '1' })],
      ['data that fails its data type', () => cellOf('c005', { request: { method: 'GET', path: OWN }, transform: "{'value': 'many'}" })],
      ['a variable the host does not give', () => cellOf('c006', { request: { method: 'GET', path: OWN, variables: { team: 'team' } }, transform: "{'value': response.value}" })],
      ['a shared source that is not declared', () => cellOf('c007', { source: 'nowhere', transform: "{'value': response.value}" })],
    ])('shows no button for %s', async (_name, cell) => {
      vi.spyOn(console, 'error').mockImplementation(() => undefined);
      const file = fileOf(undefined, [CELLS[3], cell()]);
      const { host } = retryHost(file);
      const { container } = show(host);
      await waitFor(() => expect(values(container)).toContain('value null'), { timeout: 5000 });
      expect(await screen.findByText(CANNOT, {}, { timeout: 5000 })).toBeTruthy();
      expect(screen.queryByRole('button', { name: RETRY })).toBeNull();
    }, 15_000);

    it('shows no button for a cell whose render_widget fell back', async () => {
      vi.spyOn(console, 'error').mockImplementation(() => undefined);
      const file = fileOf(undefined, [CELLS[3]]);
      const { host } = retryHost(file);
      show(host, { [METRIC]: () => refusingAfter(0) });
      expect(await screen.findByText(CANNOT, {}, { timeout: 5000 })).toBeTruthy();
      expect(screen.queryByRole('button', { name: RETRY })).toBeNull();
    }, 15_000);
  });

  describe('a frameless cell', () => {
    const markdown = (DEMO_SERVED_FILE.instances.find((instance) => instance.id === DEMO_DASHBOARD_ID) as { layout: { cells: { widget: { id: string } }[] } }).layout.cells.find((cell) =>
      cell.widget.id.includes('.markdown_card.'),
    )!;
    const heading = { size: 'large', frame: false, widget: { id: markdown.widget.id, render: { body: '## Section\n\nA paragraph.' } } };
    /** A metric cell with no title or description, so it may be frameless. */
    const untitled = (cell: (typeof CELLS)[number]) => {
      const { title: _title, description: _description, ...widget } = cell.widget as typeof cell.widget & { title?: string; description?: string };
      return { ...cell, size: 'large', frame: false, widget };
    };
    const framelessOf = (container: HTMLElement) => [...container.querySelectorAll<HTMLElement>('[data-cell-frame="none"]')];
    const CARD = '[data-cell-frame="card"]';

    it('draws the widget with no card, header or larger-view button, next to a framed cell', async () => {
      const { host } = countingHost(fileOf(undefined, [heading, CELLS[3]]));
      const { container } = render(<PeriodHost root={new DashboardRoot({ host, entries: entriesWithValues, origin: 'http://localhost' })} dashboardId={VARIABLES_ID} theme="light" language="en" />);
      await waitFor(() => expect(values(container)).toEqual([expect.stringMatching(/^theme light/), 'value null']), { timeout: 5000 });
      const [frameless] = framelessOf(container);
      expect(frameless).toBeDefined();
      expect(frameless.closest(CARD)).toBeNull();
      expect(frameless.querySelector(CARD)).toBeNull();
      expect(frameless.querySelector('[data-widget-extension]')).not.toBeNull();
      // The framed neighbour keeps its card and title.
      expect(container.querySelectorAll(CARD)).toHaveLength(1);
      expect(screen.queryByRole('button', { name: /larger/ })).toBeNull();
    }, 15_000);

    it.each([
      ['a widget title', { ...heading, widget: { ...heading.widget, title: 'Section' } }],
      ['a widget description', { ...heading, widget: { ...heading.widget, description: 'Line' } }],
      ['a larger_view', { ...heading, larger_view: { ...heading.widget, id: heading.widget.id.replace(/[0-9a-f]{4}$/, 'c001') } }],
    ])('fails the frameless cell that carries %s with its reason, without a card, and shows the rest', async (named, cell) => {
      const errors = vi.spyOn(console, 'error').mockImplementation(() => undefined);
      const { host } = countingHost(fileOf(undefined, [cell, CELLS[3]]));
      const { container } = render(<PeriodHost root={new DashboardRoot({ host, entries: entriesWithValues, origin: 'http://localhost' })} dashboardId={VARIABLES_ID} theme="light" language="en" />);
      await waitFor(() => expect(values(container)).toContain('value null'), { timeout: 5000 });
      expect(await screen.findByText(CANNOT)).toBeTruthy();
      expect(framelessOf(container)[0].textContent).toBe(CANNOT);
      expect(errors.mock.calls.some(([line]) => String(line).includes(`the cell has frame false, which draws no header and spans the full width at the height of its content, and carries ${named}`))).toBe(true);
      expect(screen.queryByText('Section')).toBeNull();
      expect(screen.queryByText('Line')).toBeNull();
      expect(screen.queryByRole('button', { name: /larger/ })).toBeNull();
    }, 15_000);

    it('shows the loader while its request runs and the cannot-be-shown text when it fails, both without a card', async () => {
      vi.spyOn(console, 'error').mockImplementation(() => undefined);
      let release: () => void = () => undefined;
      const answered = new Promise<void>((resolve) => (release = resolve));
      let asked: () => void = () => undefined;
      const sent = new Promise<void>((resolve) => (asked = resolve));
      const mock = createMockHost({ delayMs: 0, file: fileOf(undefined, [untitled(CELLS[3])]) });
      const host: DashboardHost = {
        loadFile: (signal) => mock.loadFile(signal),
        request: async () => {
          asked();
          await answered;
          throw new Error('500');
        },
      };
      const { container } = render(<PeriodHost root={new DashboardRoot({ host, entries: entriesWithValues, origin: 'http://localhost' })} dashboardId={VARIABLES_ID} theme="light" language="en" />);
      await sent;
      const [frameless] = framelessOf(container);
      expect(frameless.getAttribute('aria-busy')).toBe('true');
      expect(screen.getByRole('status', { name: 'Loading' })).toBeTruthy();
      expect(frameless.querySelector(CARD)).toBeNull();
      release();
      expect(await screen.findByText(CANNOT, {}, { timeout: 5000 })).toBeTruthy();
      // The request failed, so the cannot-be-shown text carries the retry button, still without a card.
      expect(framelessOf(container)[0].textContent).toBe(`${CANNOT}Try again`);
      expect(container.querySelector(CARD)).toBeNull();
    }, 15_000);
  });

  it('sends no request for the data of a widget type outside data_widget, and renders it without data', async () => {
    const WIDGET_BASE = 'gts.frontx.dashboard.widget.widget.v1~';
    const plain = {
      $id: `gts://${WIDGET_BASE}frontx.test.widget.plain.v1~`,
      $schema: 'https://json-schema.org/draft/2020-12/schema',
      'x-gts-traits': { entry: METRIC },
      allOf: [{ $ref: `gts://${WIDGET_BASE}` }, { type: 'object', properties: { data: { type: 'object' } } }],
    };
    const cell = { ...metric, widget: { id: `${WIDGET_BASE}frontx.test.widget.plain.v1~0d1e2f3a-4b5c-4d6e-8f70-81920a1bc001`, title: 'Plain', render: {}, data: { request: { method: 'GET', path: '/api/demo/teams/goals' }, transform: "{'value': response.value}" } } };
    const { host, sent } = countingHost({ ...fileOf(undefined, [cell]), types: [...DEMO_SERVED_FILE.types, plain] });
    const { container } = render(<PeriodHost root={new DashboardRoot({ host, entries: entriesWithValues, origin: 'http://localhost' })} dashboardId={VARIABLES_ID} theme="light" language="en" />);
    await waitFor(() => expect(values(container)).toEqual(['value undefined']), { timeout: 5000 });
    await settle();
    expect(sent).toEqual([]);
  }, 15_000);

  it('keeps a cell whose render_widget fell back while its next answer was on the way cannot-be-shown, with one fallback line', async () => {
    const errors = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    let calls = 0;
    // The first render_widget is refused 200 ms after it arrives; the answer to the next value takes 500 ms.
    const { host } = countingHost(fileOf(undefined, [CELLS[2]]), { 'period=7d': 500 });
    render(<PeriodHost root={new DashboardRoot({ host, entries: { ...entries, [METRIC]: () => refusingAfter(200, () => (calls += 1)) }, origin: 'http://localhost' })} dashboardId={VARIABLES_ID} theme="light" language="en" />);
    await waitFor(() => expect(calls).toBe(1), { timeout: 5000 });
    fireEvent.click(screen.getByRole('button', { name: 'Last 7 days' }));
    expect(await screen.findByText(CANNOT, {}, { timeout: 5000 })).toBeTruthy();
    // Past the late answer: the cell never leaves cannot-be-shown.
    for (let step = 0; step < 16; step += 1) {
      await settle(50);
      expect(screen.getAllByText(CANNOT)).toHaveLength(1);
    }
    expect(errors.mock.calls.filter(([line]) => String(line).includes('the render_widget chain ended in fallback'))).toHaveLength(1);
    expect(calls).toBe(1);
  }, 15_000);
});

// Refresh and dispose: the host reads the definitions again without a new root, and releases a root it is done with.
describe('refresh and dispose of the root', () => {
  const METRIC = `${ENTRY}metric_card.v1`;
  const demo = DEMO_SERVED_FILE.instances.find((instance) => instance.id === DEMO_DASHBOARD_ID) as { layout: { cells: { widget: { id: string } }[] } };
  const metric = demo.layout.cells.find((cell) => cell.widget.id.includes('.metric_card.'))!;
  const EDITED_ID = 'gts.frontx.dashboard.dashboard.dashboard.v1~3e4f5a6b-7c8d-4e9f-8a0b-1c2d3e4f5a61';
  const cellOf = (suffix: string, data: Record<string, unknown>) => ({ ...metric, widget: { ...metric.widget, id: metric.widget.id.replace(/[0-9a-f]{4}$/, suffix), render: {}, data } });
  /** The served file with one more dashboard: one static cell per value, or one cell on `request` when given. */
  const fileOf = (values: number[], request?: Record<string, unknown>): ServedFile => ({
    ...DEMO_SERVED_FILE,
    instances: [
      ...DEMO_SERVED_FILE.instances,
      {
        id: EDITED_ID,
        title: 'Edited',
        layout: {
          cells: request
            ? [cellOf('c0ff', { request, transform: "{'value': response.value}" })]
            : values.map((value, index) => cellOf(`c00${index}`, { params: {}, transform: `{'value': ${value}}` })),
        },
      },
    ],
  });
  /** A host that answers the file `next()` gives at each call, counts the calls and hands out the data requests. */
  const editingHost = (next: (signal: AbortSignal) => Promise<unknown>) => {
    const calls = { file: 0, request: [] as AbortSignal[] };
    const host: DashboardHost = {
      loadFile: (signal) => ((calls.file += 1), next(signal) as Promise<ServedFile>),
      // A data request is never answered: a pending request for the dispose test.
      request: (_request, signal) => (calls.request.push(signal), new Promise(() => undefined)),
    };
    return { host, calls };
  };
  /** A metric entry that writes the value it receives, and counts how often its code is loaded, mounted and unmounted. */
  const counting = () => {
    const counts = { loaded: 0, mounted: 0, unmounted: 0 };
    const entry = (): MfeEntryLifecycle => {
      counts.loaded += 1;
      let output: HTMLElement | undefined;
      return {
        mount(container, bridge) {
          counts.mounted += 1;
          output = document.createElement('output');
          container.appendChild(output);
          bridge.registerActionHandler(
            RENDER_WIDGET_ACTION_ID,
            ActionHandler.fromFunction(async (_type, payload) => {
              output!.textContent = `value ${String((payload as { data?: { value?: unknown } }).data?.value)}`;
            }),
          );
        },
        unmount() {
          counts.unmounted += 1;
          output?.remove();
        },
      };
    };
    return { counts, entries: { ...entries, [METRIC]: entry } };
  };
  const values = (container: HTMLElement) => [...container.querySelectorAll<HTMLElement>('[data-widget-extension]')].map((host) => host.shadowRoot?.querySelector('output')?.textContent ?? '');
  const refreshLines = (errors: { mock: { calls: unknown[][] } }) => errors.mock.calls.map(([line]) => String(line)).filter((line) => line.includes('cannot be refreshed'));

  it('draws an edited definition after a refresh, with no new load of widget code, and keeps an unchanged dashboard as it is', async () => {
    let file = fileOf([7, 8]);
    const { host, calls } = editingHost(async () => file);
    const { counts, entries: withCounts } = counting();
    const root = new DashboardRoot({ host, entries: withCounts, origin: 'http://localhost' });
    const { container } = render(<Dashboard root={root} dashboardId={EDITED_ID} theme="light" language="en" />);
    await waitFor(() => expect(values(container)).toEqual(['value 7', 'value 8']), { timeout: 5000 });
    const loadedBefore = counts.loaded;
    expect(loadedBefore).toBe(2);
    // A refresh of the same definitions keeps every cell: nothing unmounts.
    await act(async () => expect(await root.refresh()).toEqual({ ok: true }));
    expect(calls.file).toBe(2);
    await new Promise((resolve) => setTimeout(resolve, 100));
    expect(counts.unmounted).toBe(0);
    // The binding of the first cell changes, and a third cell of the same type joins.
    file = fileOf([9, 8, 10]);
    await act(async () => expect(await root.refresh()).toEqual({ ok: true }));
    await waitFor(() => expect(values(container)).toEqual(['value 9', 'value 8', 'value 10']), { timeout: 5000 });
    // The two cells shown before mount their loaded code again; only the new cell's extension loads its own.
    expect(counts.loaded).toBe(loadedBefore + 1);
    expect(root.version).toBe(2);
  }, 15_000);

  it('keeps the last good definitions drawn when a refresh fails, reports the problem, and takes the next good one', async () => {
    const errors = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const answers: (() => Promise<unknown>)[] = [async () => fileOf([7]), async () => Promise.reject(new Error('offline')), async () => ({ instances: [] }), async () => fileOf([11])];
    const { host } = editingHost(() => answers.shift()!());
    const root = new DashboardRoot({ host, entries: counting().entries, origin: 'http://localhost' });
    const { container } = render(<Dashboard root={root} dashboardId={EDITED_ID} theme="light" language="en" />);
    await waitFor(() => expect(values(container)).toEqual(['value 7']), { timeout: 5000 });
    let outcome: unknown;
    await act(async () => void (outcome = await root.refresh()));
    expect(outcome).toEqual({ ok: false, problem: expect.stringMatching(/^the served file could not be loaded: .*offline/) });
    await act(async () => void (outcome = await root.refresh()));
    expect(outcome).toEqual({ ok: false, problem: 'the served file: it has no types and instances lists' });
    expect(refreshLines(errors)).toEqual([
      expect.stringMatching(/^\[dashboard\] the dashboard definitions cannot be refreshed: the served file could not be loaded: .*offline/),
      '[dashboard] the dashboard definitions cannot be refreshed: the served file: it has no types and instances lists',
    ]);
    expect(root.version).toBe(0);
    await new Promise((resolve) => setTimeout(resolve, 100));
    expect(values(container)).toEqual(['value 7']);
    await act(async () => expect(await root.refresh()).toEqual({ ok: true }));
    await waitFor(() => expect(values(container)).toEqual(['value 11']), { timeout: 5000 });
  }, 15_000);

  it('fails a refresh whose served file redefines a type the root holds, and keeps the type it holds', async () => {
    const errors = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const PIE = 'gts.frontx.dashboard.widget.widget.v1~frontx.dashboard.widget.data_widget.v1~frontx.dashboard.widget.pie_chart.v1~';
    const good = fileOf([7]);
    const changed = { ...good, types: good.types.map((type) => (String(type.$id) === `gts://${PIE}` ? { ...type, description: 'otherwise' } : type)) };
    expect(changed.types).not.toEqual(good.types);
    const answers = [good, changed];
    const { host } = editingHost(async () => answers.shift());
    const root = new DashboardRoot({ host, entries: counting().entries, origin: 'http://localhost' });
    const { container } = render(<Dashboard root={root} dashboardId={EDITED_ID} theme="light" language="en" />);
    await waitFor(() => expect(values(container)).toEqual(['value 7']), { timeout: 5000 });
    await act(async () => expect(await root.refresh()).toEqual({ ok: false, problem: `the served file: its type ${PIE} is already defined otherwise, and a type changes only in a new dashboard root` }));
    expect(refreshLines(errors)).toHaveLength(1);
    expect(root.types.getSchema(PIE)).toEqual(good.types.find((type) => String(type.$id) === `gts://${PIE}`));
  }, 15_000);

  /** The served file in parts: the base file with the edited dashboard, then one part per catalog bundle but `without`. */
  const partsOf = (values: number[], { without = [] as string[], extra = [] as unknown[], metricType = (type: Record<string, unknown>) => type } = {}) => {
    const edited = fileOf(values).instances.at(-1)!;
    const base = { ...DEMO_WITHOUT_BUNDLES, instances: [...DEMO_WITHOUT_BUNDLES.instances, edited] };
    const parts = TYPES.filter((type) => !without.includes(type)).map((type) => ({
      types: (BUNDLE_TYPES[type] ?? []).map((schema) => (type === 'metric_card' ? metricType(schema) : schema)),
      instances: IN_BUNDLE_PARTS.instances.filter((instance) => String(instance.id).endsWith(`.${type}.v1`)),
    }));
    return [base, ...parts, ...extra];
  };
  const METRIC_TYPE = 'gts.frontx.dashboard.widget.widget.v1~frontx.dashboard.widget.data_widget.v1~frontx.dashboard.widget.metric_card.v1~';

  it('refuses a refresh whose widget part brings its own held type otherwise, and keeps the working cells drawn', async () => {
    const errors = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const changed = partsOf([9], { metricType: (type) => (String(type.$id) === `gts://${METRIC_TYPE}` ? { ...type, description: 'otherwise' } : type) });
    expect(changed).not.toEqual(partsOf([9]));
    const answers: unknown[] = [partsOf([7]), changed];
    const { host } = editingHost(async () => answers.shift());
    const { counts, entries: withCounts } = counting();
    const root = new DashboardRoot({ host, entries: withCounts, origin: 'http://localhost' });
    const { container } = render(<Dashboard root={root} dashboardId={EDITED_ID} theme="light" language="en" />);
    await waitFor(() => expect(values(container)).toEqual(['value 7']), { timeout: 5000 });
    let outcome: unknown;
    await act(async () => void (outcome = await root.refresh()));
    expect(outcome).toEqual({
      ok: false,
      problem: expect.stringMatching(new RegExp(`^the widget part ".*metric_card\\.v1.*": its type ${METRIC_TYPE.replace(/[.~]/g, '\\$&')} is already defined otherwise, and a type changes only in a new dashboard root$`)),
    });
    expect(refreshLines(errors)).toHaveLength(1);
    expect(root.version).toBe(0);
    await new Promise((resolve) => setTimeout(resolve, 100));
    expect(counts.unmounted).toBe(0);
    expect(values(container)).toEqual(['value 7']);
    expect(errors.mock.calls.filter(([line]) => String(line).includes('is left out'))).toEqual([]);
  }, 15_000);

  /** The served file in parts with the edited dashboard moved from the base file into the metric part, its types passed through `metricTypes`. */
  const servedByMetricPart = (values: number[], metricTypes = (types: Record<string, unknown>[]) => types) => {
    const [base, ...parts] = partsOf(values) as unknown as { types: Record<string, unknown>[]; instances: Record<string, unknown>[] }[];
    const edited = base!.instances.at(-1)!;
    return [
      { ...base!, instances: base!.instances.slice(0, -1) },
      ...parts.map((part) => (part.instances.some((instance) => String(instance.id).endsWith('.metric_card.v1')) ? { types: metricTypes(part.types), instances: [...part.instances, edited] } : part)),
    ];
  };

  it.each([
    ['as held, then otherwise', true],
    ['otherwise, then as held', false],
  ])('refuses a refresh whose widget part brings its own held type twice, %s, and keeps the dashboard only that part serves drawn', async (_, heldFirst) => {
    const errors = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const twice = (types: Record<string, unknown>[]) =>
      types.flatMap((type) => {
        if (String(type.$id) !== `gts://${METRIC_TYPE}`) return [type];
        const otherwise = { ...type, description: 'otherwise' };
        return heldFirst ? [type, otherwise] : [otherwise, type];
      });
    const answers: unknown[] = [servedByMetricPart([7]), servedByMetricPart([9], twice)];
    const { host } = editingHost(async () => answers.shift());
    const { counts, entries: withCounts } = counting();
    const root = new DashboardRoot({ host, entries: withCounts, origin: 'http://localhost' });
    const { container } = render(<Dashboard root={root} dashboardId={EDITED_ID} theme="light" language="en" />);
    await waitFor(() => expect(values(container)).toEqual(['value 7']), { timeout: 5000 });
    let outcome: unknown;
    await act(async () => void (outcome = await root.refresh()));
    expect(outcome).toEqual({
      ok: false,
      problem: expect.stringMatching(new RegExp(`^the widget part ".*metric_card\\.v1.*": its type ${METRIC_TYPE.replace(/[.~]/g, '\\$&')} is already defined otherwise, and a type changes only in a new dashboard root$`)),
    });
    expect(refreshLines(errors)).toHaveLength(1);
    expect(root.version).toBe(0);
    await new Promise((resolve) => setTimeout(resolve, 100));
    expect(counts.unmounted).toBe(0);
    expect(values(container)).toEqual(['value 7']);
    expect(errors.mock.calls.filter(([line]) => String(line).includes('is left out') || String(line).includes('cannot be shown'))).toEqual([]);
  }, 15_000);

  /** A part with no manifest that brings the metric widget type otherwise: the metric part brought it first. */
  const CLASHING = { types: [{ ...BUNDLE_TYPES.metric_card.find((type) => String(type.$id) === `gts://${METRIC_TYPE}`)!, description: 'otherwise' }], instances: [] };
  const MARKDOWN_TYPES = (BUNDLE_TYPES.markdown_card ?? []).map((type) => String(type.$id).replace(/^gts:\/\//, ''));
  /** A second part named like the metric part (it carries the same manifest) that brings the metric widget type otherwise. */
  const TWIN = {
    types: CLASHING.types,
    instances: IN_BUNDLE_PARTS.instances.filter((instance) => String(instance.id).startsWith('gts.frontx.mfes.mfe.mf_manifest.v1~') && String(instance.id).endsWith('.metric_card.v1')),
  };

  it('refuses a refresh whose widget part brings its own held type otherwise while a later part under its name still brings that type as held', async () => {
    const errors = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    // A later part with the metric part's manifest id, another manifest content and the metric widget type as held,
    // but not the metric entry: on the first load it is left out for its manifest.
    const manifest = TWIN.instances[0] as { metaData: Record<string, unknown> };
    const twin = {
      types: BUNDLE_TYPES.metric_card.filter((type) => String(type.$id) === `gts://${METRIC_TYPE}`),
      instances: [{ ...manifest, metaData: { ...manifest.metaData, publicPath: '/widgets/metric_card_twin/' } }],
    };
    const changed = partsOf([9], { extra: [twin], metricType: (type) => (String(type.$id) === `gts://${METRIC_TYPE}` ? { ...type, description: 'otherwise' } : type) });
    const answers: unknown[] = [partsOf([7], { extra: [twin] }), changed];
    const { host } = editingHost(async () => answers.shift());
    const { counts, entries: withCounts } = counting();
    const root = new DashboardRoot({ host, entries: withCounts, origin: 'http://localhost' });
    const { container } = render(<Dashboard root={root} dashboardId={EDITED_ID} theme="light" language="en" />);
    await waitFor(() => expect(values(container)).toEqual(['value 7']), { timeout: 5000 });
    const leftOut = () => errors.mock.calls.map(([line]) => String(line)).filter((line) => line.includes('is left out'));
    expect(leftOut()).toEqual([expect.stringMatching(/is left out: its instance .*metric_card\.v1 is already registered otherwise$/)]);
    let outcome: unknown;
    await act(async () => void (outcome = await root.refresh()));
    expect(outcome).toEqual({
      ok: false,
      problem: expect.stringMatching(new RegExp(`^the widget part ".*metric_card\\.v1.*": its type ${METRIC_TYPE.replace(/[.~]/g, '\\$&')} is already defined otherwise, and a type changes only in a new dashboard root$`)),
    });
    expect(root.version).toBe(0);
    await new Promise((resolve) => setTimeout(resolve, 100));
    expect(counts.unmounted).toBe(0);
    expect(values(container)).toEqual(['value 7']);
    expect(leftOut()).toHaveLength(1);
  }, 15_000);

  it('refuses a refresh whose widget part without a manifest brings otherwise a type it brought itself', async () => {
    const errors = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const [first, ...rest] = BUNDLE_TYPES.markdown_card ?? [];
    const own = (schema: Record<string, unknown>) => partsOf([7], { without: ['markdown_card'], extra: [{ types: [schema, ...rest], instances: [] }] });
    const answers: unknown[] = [own(first!), own({ ...first!, description: 'otherwise' })];
    const { host } = editingHost(async () => answers.shift());
    const root = new DashboardRoot({ host, entries: counting().entries, origin: 'http://localhost' });
    const { container } = render(<Dashboard root={root} dashboardId={EDITED_ID} theme="light" language="en" />);
    await waitFor(() => expect(values(container)).toEqual(['value 7']), { timeout: 5000 });
    expect(root.types.getSchema(MARKDOWN_TYPES[0]!)).toBeTruthy();
    // The part comes last, after the base file and one part per catalog bundle but the markdown one.
    await act(async () =>
      expect(await root.refresh()).toEqual({
        ok: false,
        problem: `the widget part number ${TYPES.length + 1} of the answer (the served file is number 1): its type ${MARKDOWN_TYPES[0]} is already defined otherwise, and a type changes only in a new dashboard root`,
      }),
    );
    expect(refreshLines(errors)).toHaveLength(1);
  }, 15_000);

  it.each([
    ['the dashboards change while every widget part keeps its content', partsOf([7]), partsOf([9]), 0],
    ['a new widget part with new types joins', partsOf([7], { without: ['markdown_card'] }), partsOf([9]), 0],
    ['a part left out from the first load, its type brought first by another part, comes again', partsOf([7], { extra: [CLASHING] }), partsOf([9], { extra: [CLASHING] }), 2],
    ['a second part with the manifest of the part that brought a type, and that type otherwise, comes again', partsOf([7], { extra: [TWIN] }), partsOf([9], { extra: [TWIN] }), 2],
  ])('takes a refresh in which %s, and redraws', async (name, first, next, leftOut) => {
    const errors = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const answers: unknown[] = [first, next];
    const { host } = editingHost(async () => answers.shift());
    const root = new DashboardRoot({ host, entries: counting().entries, origin: 'http://localhost' });
    const { container } = render(<Dashboard root={root} dashboardId={EDITED_ID} theme="light" language="en" />);
    await waitFor(() => expect(values(container)).toEqual(['value 7']), { timeout: 5000 });
    const joins = name.startsWith('a new widget part');
    if (joins) expect(MARKDOWN_TYPES.length > 0 && MARKDOWN_TYPES.every((id) => !root.types.getSchema(id))).toBe(true);
    await act(async () => expect(await root.refresh()).toEqual({ ok: true }));
    await waitFor(() => expect(values(container)).toEqual(['value 9']), { timeout: 5000 });
    expect(root.version).toBe(1);
    if (joins) expect(MARKDOWN_TYPES.every((id) => root.types.getSchema(id))).toBe(true);
    // The clashing part is left out on each read, the first load's and the refresh's, naming the part that brought the type.
    const lines = errors.mock.calls.map(([line]) => String(line)).filter((line) => line.includes('is left out'));
    expect(lines).toHaveLength(leftOut);
    for (const line of lines) expect(line).toMatch(/is already defined otherwise by the widget part ".*metric_card\.v1.*"$/);
    expect(refreshLines(errors)).toEqual([]);
  }, 15_000);

  it('shows a dashboard missing from the refreshed file as one that cannot be shown', async () => {
    const errors = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    let file: ServedFile = fileOf([7]);
    const { host } = editingHost(async () => file);
    const root = new DashboardRoot({ host, entries: counting().entries, origin: 'http://localhost' });
    const { container } = render(<Dashboard root={root} dashboardId={EDITED_ID} theme="light" language="en" />);
    await waitFor(() => expect(values(container)).toEqual(['value 7']), { timeout: 5000 });
    file = DEMO_SERVED_FILE;
    await act(async () => expect(await root.refresh()).toEqual({ ok: true }));
    expect(await screen.findByText('This dashboard cannot be shown', {}, { timeout: 5000 })).toBeTruthy();
    expect(errors.mock.calls.some(([line]) => String(line).includes(`no dashboard ${EDITED_ID} in the served file`))).toBe(true);
  }, 15_000);

  it('lets the last of two refreshes win: the earlier file request is aborted and both calls resolve with the later outcome', async () => {
    const pending: { signal: AbortSignal; answer: (file: unknown) => void }[] = [];
    let first = true;
    const { host } = editingHost(
      (signal) =>
        first
          ? ((first = false), Promise.resolve(fileOf([7])))
          : new Promise((resolve) => pending.push({ signal, answer: resolve })),
    );
    const root = new DashboardRoot({ host, entries: counting().entries, origin: 'http://localhost' });
    const { container } = render(<Dashboard root={root} dashboardId={EDITED_ID} theme="light" language="en" />);
    await waitFor(() => expect(values(container)).toEqual(['value 7']), { timeout: 5000 });
    const earlier = root.refresh();
    // The earlier request reaches the host before the later call aborts it.
    await waitFor(() => expect(pending).toHaveLength(1));
    const later = root.refresh();
    await waitFor(() => expect(pending).toHaveLength(2));
    expect(pending[0].signal.aborted).toBe(true);
    expect(pending[1].signal.aborted).toBe(false);
    pending[1].answer(fileOf([12]));
    // The earlier answer comes last and is dropped.
    pending[0].answer(fileOf([99]));
    await act(async () => expect(await Promise.all([earlier, later])).toEqual([{ ok: true }, { ok: true }]));
    await waitFor(() => expect(values(container)).toEqual(['value 12']), { timeout: 5000 });
    await new Promise((resolve) => setTimeout(resolve, 100));
    expect(values(container)).toEqual(['value 12']);
    expect(root.version).toBe(1);
  }, 15_000);

  it('does not call the host for a file request a later refresh aborted before it went out', async () => {
    const pending: { signal: AbortSignal; answer: (file: unknown) => void }[] = [];
    let first = true;
    const { host } = editingHost(
      (signal) =>
        first
          ? ((first = false), Promise.resolve(fileOf([7])))
          : new Promise((resolve) => pending.push({ signal, answer: resolve })),
    );
    const root = new DashboardRoot({ host, entries: counting().entries, origin: 'http://localhost' });
    const { container } = render(<Dashboard root={root} dashboardId={EDITED_ID} theme="light" language="en" />);
    await waitFor(() => expect(values(container)).toEqual(['value 7']), { timeout: 5000 });
    // Both calls in one turn: the earlier request is aborted before the host is called.
    const earlier = root.refresh();
    const later = root.refresh();
    await waitFor(() => expect(pending).toHaveLength(1));
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(pending).toHaveLength(1);
    expect(pending[0].signal.aborted).toBe(false);
    pending[0].answer(fileOf([12]));
    await act(async () => expect(await Promise.all([earlier, later])).toEqual([{ ok: true }, { ok: true }]));
    await waitFor(() => expect(values(container)).toEqual(['value 12']), { timeout: 5000 });
  }, 15_000);

  it('tells every listener and resolves the refresh outcome when one listener throws, with one console line', async () => {
    const errors = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    let file: ServedFile = fileOf([7]);
    const { host } = editingHost(async () => file);
    const root = new DashboardRoot({ host, entries: counting().entries, origin: 'http://localhost' });
    const { container } = render(<Dashboard root={root} dashboardId={EDITED_ID} theme="light" language="en" />);
    await waitFor(() => expect(values(container)).toEqual(['value 7']), { timeout: 5000 });
    const told: string[] = [];
    root.subscribe(() => {
      throw new Error('listener broke');
    });
    root.subscribe(() => void told.push('after'));
    file = fileOf([12]);
    await act(async () => expect(await root.refresh()).toEqual({ ok: true }));
    expect(told).toEqual(['after']);
    expect(errors.mock.calls.map(([line]) => String(line))).toEqual(['[dashboard] a refresh listener failed: Error: listener broke']);
    await waitFor(() => expect(values(container)).toEqual(['value 12']), { timeout: 5000 });
  }, 15_000);

  it('resolves a refresh whose listener starts another refresh with the outcome of that later one, and tells the other listeners', async () => {
    const errors = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const answers: (() => Promise<unknown>)[] = [async () => fileOf([7]), async () => fileOf([12]), async () => Promise.reject(new Error('offline'))];
    const { host } = editingHost(() => answers.shift()!());
    const root = new DashboardRoot({ host, entries: counting().entries, origin: 'http://localhost' });
    const { container } = render(<Dashboard root={root} dashboardId={EDITED_ID} theme="light" language="en" />);
    await waitFor(() => expect(values(container)).toEqual(['value 7']), { timeout: 5000 });
    // The first listener starts one refresh from inside the first notification, and none after it.
    let later: Promise<unknown> | undefined;
    root.subscribe(() => void (later ??= root.refresh()));
    const told: number[] = [];
    root.subscribe(() => void told.push(root.version));
    let earlier!: Promise<unknown>;
    await act(async () => void (earlier = root.refresh()));
    const failed = { ok: false, problem: expect.stringMatching(/^the served file could not be loaded: .*offline/) };
    await act(async () => expect(await Promise.all([earlier, later])).toEqual([failed, failed]));
    // The other listener is told of the definitions the earlier call read, and those stay: the later read failed.
    expect(told).toEqual([1]);
    expect(root.version).toBe(1);
    expect(refreshLines(errors)).toHaveLength(1);
    await waitFor(() => expect(values(container)).toEqual(['value 12']), { timeout: 5000 });
  }, 15_000);

  it('tells the next listener and resolves the refresh outcome when a listener throws a value that cannot be turned into text', async () => {
    const errors = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    let file: ServedFile = fileOf([7]);
    const { host } = editingHost(async () => file);
    const root = new DashboardRoot({ host, entries: counting().entries, origin: 'http://localhost' });
    const told: string[] = [];
    // Subscribed before a second listener; String() throws for a value with no prototype.
    root.subscribe(() => {
      throw Object.create(null);
    });
    root.subscribe(() => void told.push('after'));
    file = fileOf([12]);
    await act(async () => expect(await root.refresh()).toEqual({ ok: true }));
    expect(told).toEqual(['after']);
    expect(errors.mock.calls.map(([line]) => String(line))).toEqual(['[dashboard] a refresh listener failed: listener threw a value that cannot be shown']);
  }, 15_000);

  it('keeps the refreshed definitions when the first read of the served file answers after the refresh', async () => {
    let answerFirst!: (file: unknown) => void;
    const answers: (() => Promise<unknown>)[] = [() => new Promise((resolve) => (answerFirst = resolve)), async () => fileOf([12]), async () => fileOf([12])];
    const { host } = editingHost(() => answers.shift()!());
    const { counts, entries: withCounts } = counting();
    const root = new DashboardRoot({ host, entries: withCounts, origin: 'http://localhost' });
    const { container } = render(<Dashboard root={root} dashboardId={EDITED_ID} theme="light" language="en" />);
    await waitFor(() => expect(answerFirst).toBeTypeOf('function'));
    await act(async () => expect(await root.refresh()).toEqual({ ok: true }));
    await waitFor(() => expect(values(container)).toEqual(['value 12']), { timeout: 5000 });
    // The first read answers last, with older definitions: they register nothing and the loads keep the refreshed ones.
    await act(async () => answerFirst(fileOf([7])));
    await new Promise((resolve) => setTimeout(resolve, 100));
    const unmountedBefore = counts.unmounted;
    // A refresh of the same definitions then keeps every cell.
    await act(async () => expect(await root.refresh()).toEqual({ ok: true }));
    await new Promise((resolve) => setTimeout(resolve, 100));
    expect(counts.unmounted).toBe(unmountedBefore);
    expect(values(container)).toEqual(['value 12']);
  }, 15_000);

  it('keeps the refreshed file when the first read of the served file fails after the refresh', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    let failFirst!: (error: Error) => void;
    const answers: (() => Promise<unknown>)[] = [() => new Promise((_, reject) => (failFirst = reject)), async () => fileOf([12])];
    const { host, calls } = editingHost(() => answers.shift()!());
    const root = new DashboardRoot({ host, entries: counting().entries, origin: 'http://localhost' });
    const { container } = render(<Dashboard root={root} dashboardId={EDITED_ID} theme="light" language="en" />);
    await waitFor(() => expect(failFirst).toBeTypeOf('function'));
    await act(async () => expect(await root.refresh()).toEqual({ ok: true }));
    await waitFor(() => expect(values(container)).toEqual(['value 12']), { timeout: 5000 });
    await act(async () => failFirst(new Error('late failure')));
    // Another dashboard loads from the file the refresh read: the served file is not requested again.
    expect((await root.load(DEMO_DASHBOARD_ID)).ok).toBe(true);
    expect(calls.file).toBe(2);
  }, 15_000);

  it('gives a load waiting on the first read of the served file the file a refresh read meanwhile', async () => {
    const errors = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    let answerFirst!: (file: unknown) => void;
    const answers: (() => Promise<unknown>)[] = [() => new Promise((resolve) => (answerFirst = resolve)), async () => fileOf([12])];
    const { host } = editingHost(() => answers.shift()!());
    const root = new DashboardRoot({ host, entries: counting().entries, origin: 'http://localhost' });
    const load = root.load(EDITED_ID);
    await waitFor(() => expect(answerFirst).toBeTypeOf('function'));
    expect(await root.refresh()).toEqual({ ok: true });
    // The first read answers last, with older definitions.
    answerFirst(fileOf([7]));
    const outcome = await load;
    expect(outcome.ok).toBe(true);
    expect(outcome.ok && outcome.dashboard.layout.cells.map((cell) => cell.widget.data)).toEqual([{ params: {}, transform: "{'value': 12}" }]);
    expect(errors).not.toHaveBeenCalled();
  });

  it('ends a refresh in flight at dispose with the disposed reason and no console line', async () => {
    const errors = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    let first = true;
    const { host } = editingHost((signal) => (first ? ((first = false), Promise.resolve(fileOf([7]))) : new Promise(() => void signal)));
    const root = new DashboardRoot({ host, entries: counting().entries, origin: 'http://localhost' });
    const { container } = render(<Dashboard root={root} dashboardId={EDITED_ID} theme="light" language="en" />);
    await waitFor(() => expect(values(container)).toEqual(['value 7']), { timeout: 5000 });
    const refreshing = root.refresh();
    await act(async () => root.dispose());
    expect(await refreshing).toEqual({ ok: false, problem: 'the dashboard root is disposed' });
    expect(refreshLines(errors)).toEqual([]);
  }, 15_000);

  it('ends a first read of the served file in flight at dispose: its request is aborted and the load fails with no console line', async () => {
    const errors = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const pending: { signal: AbortSignal; answer: (file: unknown) => void }[] = [];
    const { host } = editingHost((signal) => new Promise((resolve) => pending.push({ signal, answer: resolve })));
    const root = new DashboardRoot({ host, entries: counting().entries, origin: 'http://localhost' });
    const load = root.load(EDITED_ID);
    await waitFor(() => expect(pending).toHaveLength(1));
    await root.dispose();
    expect(pending[0].signal.aborted).toBe(true);
    pending[0].answer(fileOf([7]));
    expect(await load).toEqual({ ok: false });
    expect(errors).not.toHaveBeenCalled();
  });

  it('settles a request whose signal aborts even when the host never answers, and leaves no abort listener behind', async () => {
    const add = vi.spyOn(EventTarget.prototype, 'addEventListener');
    const remove = vi.spyOn(EventTarget.prototype, 'removeEventListener');
    const abortListeners = (spy: typeof add | typeof remove) => spy.mock.calls.filter(([type], at) => type === 'abort' && spy.mock.contexts[at] instanceof AbortSignal).length;
    const root = new DashboardRoot({ host: { loadFile: () => new Promise(() => undefined), request: () => new Promise(() => undefined) }, entries, origin: 'http://localhost' });
    const controller = new AbortController();
    const answer = root.host.request({ method: 'GET', path: '/api/demo/teams/goals' }, controller.signal);
    controller.abort();
    await expect(answer).rejects.toThrow('the request was aborted');
    // Every abort listener the request added on the root-wide disposal signal and on its own signal is removed.
    expect(abortListeners(add) - abortListeners(remove)).toBe(0);
  });

  it('leaves no widget and no line of a cell whose registration ends after dispose', async () => {
    const errors = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const { host } = editingHost(async () => fileOf([7]));
    const { counts, entries: withCounts } = counting();
    const root = new DashboardRoot({ host, entries: withCounts, origin: 'http://localhost' });
    const { container } = render(<Dashboard root={root} dashboardId={EDITED_ID} theme="light" language="en" />);
    await waitFor(() => expect(values(container)).toEqual(['value 7']), { timeout: 5000 });
    const register = root.registry!.registerExtension.bind(root.registry);
    let open!: () => void;
    const gate = new Promise<void>((resolve) => (open = resolve));
    const registering = vi.spyOn(root.registry!, 'registerExtension').mockImplementationOnce(async (extension) => (await gate, register(extension)));
    const states: string[] = [];
    const unregistering = vi.spyOn(root.registry!, 'unregisterExtension');
    const widget = cellOf('c001', { params: {}, transform: "{'value': 1}" }).widget;
    root.runCell({ dashboardId: EDITED_ID, widget, role: 'cell', shared: new SharedRequests({}, root.host, root.origin), update: (change) => void ('state' in change && states.push(change.state)) });
    // The dispose takes its list of extensions while the cell's registration is in flight.
    await waitFor(() => expect(registering).toHaveBeenCalledTimes(1));
    const disposing = root.dispose();
    open();
    await act(async () => disposing);
    await new Promise((resolve) => setTimeout(resolve, 500));
    expect(counts.mounted - counts.unmounted).toBe(0);
    // The cell takes back the extension it registered after the dispose took its list.
    expect(unregistering).toHaveBeenCalledWith(extensionIdOf(widget.id, 'cell', METRIC));
    expect(states).not.toContain('cannot-be-shown');
    expect(errors.mock.calls.filter(([line]) => String(line).includes('c001'))).toEqual([]);
  }, 15_000);

  it('leaves no widget, no line and no failed cell for a widget still mounting at dispose', async () => {
    const errors = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const { host } = editingHost(async () => fileOf([7]));
    const counts = { started: 0, mounted: 0, unmounted: 0 };
    let open!: () => void;
    const gate = new Promise<void>((resolve) => (open = resolve));
    const slowEntry = (): MfeEntryLifecycle => ({
      async mount(_container, bridge) {
        counts.started += 1;
        await gate;
        counts.mounted += 1;
        bridge.registerActionHandler(RENDER_WIDGET_ACTION_ID, ActionHandler.fromFunction(async () => undefined));
      },
      unmount() {
        counts.unmounted += 1;
      },
    });
    const root = new DashboardRoot({ host, entries: { ...entries, [METRIC]: slowEntry }, origin: 'http://localhost' });
    render(<Dashboard root={root} dashboardId={EDITED_ID} theme="light" language="en" />);
    await waitFor(() => expect(counts.started).toBe(1), { timeout: 5000 });
    const disposing = root.dispose();
    open();
    await act(async () => disposing);
    await new Promise((resolve) => setTimeout(resolve, 500));
    expect(counts.mounted - counts.unmounted).toBe(0);
    expect(screen.queryByText('This widget cannot be shown')).toBeNull();
    expect(errors.mock.calls.filter(([line]) => String(line).includes(EDITED_ID))).toEqual([]);
  }, 15_000);

  it('loads the code of a widget whose type a refresh changed, and unregisters the extension of the cell that left', async () => {
    const MARKDOWN = `${ENTRY}markdown_card.v1`;
    const markdown = demo.layout.cells.find((cell) => cell.widget.id.includes('.markdown_card.'))!;
    let file = fileOf([7]);
    const { host } = editingHost(async () => file);
    const { counts, entries: withCounts } = counting();
    let markdownLoaded = 0;
    const root = new DashboardRoot({ host, entries: { ...withCounts, [MARKDOWN]: () => ((markdownLoaded += 1), probeEntry()) }, origin: 'http://localhost' });
    const { container } = render(<Dashboard root={root} dashboardId={EDITED_ID} theme="light" language="en" />);
    await waitFor(() => expect(values(container)).toEqual(['value 7']), { timeout: 5000 });
    const before = extensionIdOf(cellOf('c000', {}).widget.id, 'cell', METRIC);
    expect(root.registry?.getExtension(before)).toBeDefined();
    // The one cell of the dashboard becomes a widget of another type.
    file = { ...file, instances: file.instances.map((instance) => (instance.id === EDITED_ID ? { ...instance, layout: { cells: [markdown] } } : instance)) };
    await act(async () => expect(await root.refresh()).toEqual({ ok: true }));
    await waitFor(() => expect(markdownLoaded).toBe(1), { timeout: 5000 });
    await waitFor(() => expect(counts.unmounted).toBe(1), { timeout: 5000 });
    await waitFor(() => expect(root.registry?.getExtension(before)).toBeUndefined(), { timeout: 5000 });
    expect(root.registry?.getExtension(extensionIdOf(markdown.widget.id, 'cell', MARKDOWN))).toBeDefined();
  }, 15_000);

  it('keeps the extension of a widget another dashboard of the root holds when the view leaves its dashboard for a third', async () => {
    const MARKDOWN = `${ENTRY}markdown_card.v1`;
    const markdown = demo.layout.cells.find((cell) => cell.widget.id.includes('.markdown_card.'))!;
    const OTHER_ID = EDITED_ID.replace(/1$/, '2');
    const THIRD_ID = EDITED_ID.replace(/1$/, '3');
    const edited = fileOf([7]).instances.find((instance) => instance.id === EDITED_ID)!;
    // Two dashboards of one file name the same widget; the third names another.
    const file: ServedFile = { ...fileOf([7]), instances: [...fileOf([7]).instances, { ...edited, id: OTHER_ID }, { ...edited, id: THIRD_ID, layout: { cells: [markdown] } }] };
    const { host } = editingHost(async () => file);
    let markdownLoaded = 0;
    const root = new DashboardRoot({ host, entries: { ...counting().entries, [MARKDOWN]: () => ((markdownLoaded += 1), probeEntry()) }, origin: 'http://localhost' });
    const other = render(<Dashboard root={root} dashboardId={OTHER_ID} theme="light" language="en" />);
    await waitFor(() => expect(values(other.container)).toEqual(['value 7']), { timeout: 5000 });
    // Left without a switch: the other dashboard keeps its extensions for a return.
    other.unmount();
    const { container, rerender } = render(<Dashboard root={root} dashboardId={EDITED_ID} theme="light" language="en" />);
    await waitFor(() => expect(values(container)).toEqual(['value 7']), { timeout: 5000 });
    const shared = extensionIdOf(cellOf('c000', {}).widget.id, 'cell', METRIC);
    const unregistering = vi.spyOn(root.registry!, 'unregisterExtension');
    rerender(<Dashboard root={root} dashboardId={THIRD_ID} theme="light" language="en" />);
    await waitFor(() => expect(markdownLoaded).toBe(1), { timeout: 5000 });
    await new Promise((resolve) => setTimeout(resolve, 200));
    expect(unregistering).not.toHaveBeenCalledWith(shared);
    expect(root.registry?.getExtension(shared)).toBeDefined();
    // The cell of the third dashboard finishes mounting: its widget is drawn.
    await waitFor(() => expect(shadowTexts(container).filter((text) => text.startsWith('theme light'))).toHaveLength(1), { timeout: 5000 });
  }, 15_000);

  it('keeps the extension of a widget another dashboard of the root holds when a refresh drops it from one', async () => {
    const MARKDOWN = `${ENTRY}markdown_card.v1`;
    const markdown = demo.layout.cells.find((cell) => cell.widget.id.includes('.markdown_card.'))!;
    const OTHER_ID = EDITED_ID.replace(/1$/, '2');
    // Two dashboards of one file name the same widget.
    const withOther = (served: ServedFile): ServedFile => ({ ...served, instances: [...served.instances, { ...fileOf([7]).instances.find((instance) => instance.id === EDITED_ID)!, id: OTHER_ID }] });
    let file = withOther(fileOf([7]));
    const { host } = editingHost(async () => file);
    let markdownLoaded = 0;
    const root = new DashboardRoot({ host, entries: { ...counting().entries, [MARKDOWN]: () => ((markdownLoaded += 1), probeEntry()) }, origin: 'http://localhost' });
    const other = render(<Dashboard root={root} dashboardId={OTHER_ID} theme="light" language="en" />);
    await waitFor(() => expect(values(other.container)).toEqual(['value 7']), { timeout: 5000 });
    other.unmount();
    const { container } = render(<Dashboard root={root} dashboardId={EDITED_ID} theme="light" language="en" />);
    await waitFor(() => expect(values(container)).toEqual(['value 7']), { timeout: 5000 });
    const shared = extensionIdOf(cellOf('c000', {}).widget.id, 'cell', METRIC);
    // The refresh drops the widget from the shown dashboard only.
    file = withOther({ ...fileOf([7]), instances: fileOf([7]).instances.map((instance) => (instance.id === EDITED_ID ? { ...instance, layout: { cells: [markdown] } } : instance)) });
    await act(async () => expect(await root.refresh()).toEqual({ ok: true }));
    await waitFor(() => expect(markdownLoaded).toBe(1), { timeout: 5000 });
    await new Promise((resolve) => setTimeout(resolve, 200));
    expect(root.registry?.getExtension(shared)).toBeDefined();
  }, 15_000);

  it('takes back the extension a cell registered after it left, and mounts nothing of it', async () => {
    const MARKDOWN = `${ENTRY}markdown_card.v1`;
    const markdown = demo.layout.cells.find((cell) => cell.widget.id.includes('.markdown_card.'))!;
    let file = fileOf([7]);
    const { host } = editingHost(async () => file);
    const { counts, entries: withCounts } = counting();
    const root = new DashboardRoot({ host, entries: { ...withCounts, [MARKDOWN]: () => probeEntry() }, origin: 'http://localhost' });
    const register = root.registry!.registerExtension.bind(root.registry);
    let open!: () => void;
    const gate = new Promise<void>((resolve) => (open = resolve));
    // The first registration, the metric cell's, ends only once the gate opens.
    const registering = vi.spyOn(root.registry!, 'registerExtension').mockImplementationOnce(async (extension) => (await gate, register(extension)));
    render(<Dashboard root={root} dashboardId={EDITED_ID} theme="light" language="en" />);
    await waitFor(() => expect(registering).toHaveBeenCalledTimes(1), { timeout: 5000 });
    const left = extensionIdOf(cellOf('c000', {}).widget.id, 'cell', METRIC);
    // The cell leaves while it registers: the refresh replaces it, and the prune after it runs before the gate opens.
    file = { ...file, instances: file.instances.map((instance) => (instance.id === EDITED_ID ? { ...instance, layout: { cells: [markdown] } } : instance)) };
    await act(async () => expect(await root.refresh()).toEqual({ ok: true }));
    await waitFor(() => expect(registering).toHaveBeenCalledTimes(2), { timeout: 5000 });
    await act(async () => open());
    await waitFor(() => expect(root.registry?.getExtension(left)).toBeUndefined(), { timeout: 5000 });
    expect(counts.mounted).toBe(0);
  }, 15_000);

  it.each([
    ['waits on the mount of that widget', 'mount'],
    ['unregisters another widget of its dashboard first', 'earlier'],
    ['is unregistering that widget', 'unregister'],
  ])('keeps the widget of a cell that waited on one release registered and drawn while another release that started meanwhile %s', async (_name, by) => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const { host } = editingHost(async () => fileOf([7]));
    const counts = { started: 0, mounted: 0, unmounted: 0 };
    let openMount!: () => void;
    const mountGate = new Promise<void>((resolve) => (openMount = resolve));
    // Only the first mount waits, and only when the release waits on a mount.
    let slowMount = by === 'mount';
    const entry = (): MfeEntryLifecycle => ({
      async mount(_container, bridge) {
        counts.started += 1;
        if (slowMount) {
          slowMount = false;
          await mountGate;
        }
        counts.mounted += 1;
        bridge.registerActionHandler(RENDER_WIDGET_ACTION_ID, ActionHandler.fromFunction(async () => undefined));
      },
      unmount() {
        counts.unmounted += 1;
      },
    });
    const root = new DashboardRoot({ host, entries: { ...entries, [METRIC]: entry }, origin: 'http://localhost' });
    // A failing assertion leaves the root with mounts in flight; it ends here so they never reach a later test.
    onTestFinished(() => root.dispose());
    const page = document.body.appendChild(document.createElement('div'));
    onTestFinished(() => page.remove());
    root.attach(page);
    expect((await root.load(EDITED_ID)).ok).toBe(true);
    const shared = new SharedRequests({}, root.host, root.origin);
    const run = (suffix: string, dashboardId: string) => {
      const states: string[] = [];
      const widget = cellOf(suffix, { params: {}, transform: "{'value': 1}" }).widget;
      const cell = root.runCell({
        dashboardId,
        widget,
        role: 'cell',
        shared,
        update: (change) => {
          if ('state' in change) return void states.push(change.state);
          page.appendChild(change.container);
          change.placed();
        },
      });
      return { cell, states, id: extensionIdOf(widget.id, 'cell', METRIC) };
    };
    // Dashboard one holds the widget (after another one when the release unregisters that one first); dashboard zero
    // holds a third widget.
    const earlier = by === 'earlier' ? run('c003', 'one') : undefined;
    if (earlier) await waitFor(() => expect(earlier.states.at(-1)).toBe('shown'), { timeout: 5000 });
    const widget = run('c001', 'one');
    if (by === 'mount') await waitFor(() => expect(counts.started).toBe(1), { timeout: 5000 });
    else await waitFor(() => expect(widget.states.at(-1)).toBe('shown'), { timeout: 5000 });
    const other = run('c002', 'zero');
    await waitFor(() => expect(other.states.at(-1)).toBe('shown'), { timeout: 5000 });
    // Each unregistration a test holds ends once its gate opens.
    const unregister = root.registry!.unregisterExtension.bind(root.registry);
    const gates = new Map<string, { opened: Promise<void>; open: () => void }>();
    const hold = (id: string) => {
      let open!: () => void;
      gates.set(id, { opened: new Promise<void>((resolve) => (open = resolve)), open });
    };
    const unregistering = vi.spyOn(root.registry!, 'unregisterExtension').mockImplementation(async (id) => (await gates.get(id)?.opened, unregister(id)));
    hold(other.id);
    if (by === 'earlier') hold(earlier!.id);
    if (by === 'unregister') hold(widget.id);
    for (const left of [earlier, widget, other]) left?.cell.leave();
    // The release of dashboard zero runs; a cell of the widget for dashboard two starts and waits on it.
    const first = root.release('zero');
    const cell = run('c001', 'two');
    // The release of dashboard one starts after the cell began to wait; nothing holds the widget at its call.
    const second = root.release('one');
    if (by === 'earlier') await waitFor(() => expect(unregistering).toHaveBeenCalledWith(earlier!.id));
    if (by === 'unregister') await waitFor(() => expect(unregistering).toHaveBeenCalledWith(widget.id));
    // The first release ends while the second one still runs.
    gates.get(other.id)!.open();
    await act(async () => first);
    await new Promise((resolve) => setTimeout(resolve, 50));
    openMount();
    for (const gate of gates.values()) gate.open();
    await act(async () => second);
    await waitFor(() => expect(cell.states.at(-1)).toBe('shown'), { timeout: 5000 });
    await new Promise((resolve) => setTimeout(resolve, 200));
    expect(cell.states).not.toContain('cannot-be-shown');
    expect(root.registry?.getExtension(cell.id)).toBeDefined();
    expect(page.querySelectorAll(`[data-widget-extension="${cell.id}"]`)).toHaveLength(1);
    await act(async () => root.dispose());
    expect(counts.mounted - counts.unmounted).toBe(0);
  }, 15_000);

  it.each([
    ['a refresh that replaces its cell', 'refresh'],
    ['a switch to another dashboard', 'switch'],
  ])('unmounts a widget whose mount was in flight at %s once the mount ends', async (_name, by) => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const MARKDOWN = `${ENTRY}markdown_card.v1`;
    const markdown = demo.layout.cells.find((cell) => cell.widget.id.includes('.markdown_card.'))!;
    let file = fileOf([7]);
    const { host } = editingHost(async () => file);
    const counts = { started: 0, mounted: 0, unmounted: 0 };
    let open!: () => void;
    const gate = new Promise<void>((resolve) => (open = resolve));
    const slowEntry = (): MfeEntryLifecycle => ({
      async mount(_container, bridge) {
        counts.started += 1;
        await gate;
        counts.mounted += 1;
        bridge.registerActionHandler(RENDER_WIDGET_ACTION_ID, ActionHandler.fromFunction(async () => undefined));
      },
      unmount() {
        counts.unmounted += 1;
      },
    });
    let markdownLoaded = 0;
    const root = new DashboardRoot({ host, entries: { ...entries, [METRIC]: slowEntry, [MARKDOWN]: () => ((markdownLoaded += 1), probeEntry()) }, origin: 'http://localhost' });
    const view = render(<Dashboard root={root} dashboardId={EDITED_ID} theme="light" language="en" />);
    await waitFor(() => expect(counts.started).toBe(1), { timeout: 5000 });
    const slow = extensionIdOf(cellOf('c000', {}).widget.id, 'cell', METRIC);
    if (by === 'refresh') {
      file = { ...file, instances: file.instances.map((instance) => (instance.id === EDITED_ID ? { ...instance, layout: { cells: [markdown] } } : instance)) };
      await act(async () => expect(await root.refresh()).toEqual({ ok: true }));
      // The new cell runs, so the prune of the extension that left has started.
      await waitFor(() => expect(markdownLoaded).toBe(1), { timeout: 5000 });
    } else {
      await act(async () => view.rerender(<Dashboard root={root} dashboardId={DEMO_DASHBOARD_ID} theme="light" language="en" variables={DEMO_VARIABLES} />));
    }
    await new Promise((resolve) => setTimeout(resolve, 100));
    expect(root.registry?.getExtension(slow)).toBeDefined();
    await act(async () => open());
    await waitFor(() => expect(root.registry?.getExtension(slow)).toBeUndefined(), { timeout: 5000 });
    // Only the widget that left unmounts: the cells of a dashboard switched to are other widgets of the same entry.
    expect(counts.unmounted).toBe(1);
    await act(async () => root.dispose());
    expect(counts.mounted - counts.unmounted).toBe(0);
  }, 15_000);

  it.each([
    ['a failed first load', false],
    ['a refresh', true],
  ])('names the served file the first source of a base type a widget part redefines after %s', async (_name, byRefresh) => {
    const errors = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const PIE = 'gts.frontx.dashboard.widget.widget.v1~frontx.dashboard.widget.data_widget.v1~frontx.dashboard.widget.pie_chart.v1~';
    const catalogPie = IN_BUNDLE_PARTS.types.find((type) => String(type.$id) === `gts://${PIE}`)!;
    // The catalog pie type comes in the base file, so the root registers it from the served file.
    const base = { ...DEMO_WITHOUT_BUNDLES, types: [...DEMO_WITHOUT_BUNDLES.types, catalogPie] };
    const brokenEntry = { id: 'gts.frontx.mfes.mfe.entry.v1~frontx.mfes.mfe.entry_mf.v1~frontx.test.mfe.broken.v1', manifest: 7 };
    const withRedefinedPie = [base, { types: [{ ...catalogPie, description: 'otherwise' }], instances: [] }];
    // A first load the registry fails on a base instance, or one that succeeds; then the base file again with a part.
    const answers: unknown[] = [byRefresh ? base : { ...base, instances: [...base.instances, brokenEntry] }, withRedefinedPie];
    const root = new DashboardRoot({ host: { loadFile: async () => answers.shift() as ServedFile, request: () => new Promise(() => undefined) }, entries, origin: 'http://localhost' });
    expect((await root.load(DEMO_DASHBOARD_ID)).ok).toBe(byRefresh);
    if (byRefresh) expect(await root.refresh()).toEqual({ ok: true });
    else expect((await root.load(DEMO_DASHBOARD_ID)).ok).toBe(true);
    const lines = errors.mock.calls.map(([line]) => String(line)).filter((line) => line.includes('is left out'));
    expect(lines).toEqual([expect.stringMatching(/the widget part number 2 of the answer \(the served file is number 1\) is left out: its type .*pie_chart\.v1~ is already defined otherwise by the served file$/)]);
  });

  it('releases on dispose every widget, its container, the pending requests and the listeners, and refuses later calls', async () => {
    const errors = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    let answerRefresh!: (file: unknown) => void;
    let first = true;
    const { host, calls } = editingHost(() =>
      first ? ((first = false), Promise.resolve(fileOf([], { method: 'GET', path: '/api/demo/teams/goals' }))) : new Promise((resolve) => (answerRefresh = resolve)),
    );
    const { counts, entries: withCounts } = counting();
    const root = new DashboardRoot({ host, entries: withCounts, origin: 'http://localhost' });
    const listener = vi.fn();
    root.subscribe(listener);
    const { container } = render(<Dashboard root={root} dashboardId={EDITED_ID} theme="light" language="en" />);
    // The cell's widget is mounted and its data request waits for an answer that never comes.
    await waitFor(() => expect(counts.mounted).toBe(1), { timeout: 5000 });
    await waitFor(() => expect(calls.request).toHaveLength(1));
    expect(container.querySelectorAll('[data-widget-extension]').length + document.querySelectorAll('[data-widget-extension]').length).toBeGreaterThan(0);
    // A refresh whose file answers only after the dispose.
    const refreshing = root.refresh();
    await waitFor(() => expect(answerRefresh).toBeTypeOf('function'));
    const disposing = root.dispose();
    expect(root.dispose()).toBe(disposing);
    await act(async () => disposing);
    expect(calls.request[0].aborted).toBe(true);
    expect(counts.unmounted).toBe(1);
    expect(document.querySelectorAll('[data-widget-extension]')).toHaveLength(0);
    // Nothing of the running cell reports after the dispose.
    expect(errors.mock.calls.filter(([line]) => String(line).includes(EDITED_ID))).toEqual([]);
    answerRefresh(fileOf([12], undefined));
    expect(await refreshing).toEqual({ ok: false, problem: 'the dashboard root is disposed' });
    expect(listener).not.toHaveBeenCalled();
    // The root holds no listener: the one added before the dispose is dropped, and one added after it is not kept.
    const listeners = (root as unknown as { listeners: Set<unknown> }).listeners;
    expect(listeners.size).toBe(0);
    // Nor the count of the cells that named each extension, nor the first source of each served type.
    const held = root as unknown as { cells: Map<string, number>; sources: Map<string, string> };
    expect([held.cells.size, held.sources.size]).toEqual([0, 0]);
    root.subscribe(listener);
    expect(listeners.size).toBe(0);
    // Later calls have their own results: no file request, no write to the domain, no extension.
    const filesBefore = calls.file;
    expect(await root.refresh()).toEqual({ ok: false, problem: 'the dashboard root is disposed' });
    expect(await root.load(EDITED_ID)).toEqual({ ok: false });
    expect(calls.file).toBe(filesBefore);
    const writes = vi.spyOn(root.registry!, 'updateSharedProperty');
    root.publish('dark', 'de');
    root.publishOverlayContainer(document.body);
    expect(writes).not.toHaveBeenCalled();
    const states: string[] = [];
    root.runCell({ dashboardId: EDITED_ID, widget: cellOf('c001', { params: {}, transform: "{'value': 1}" }).widget, role: 'cell', shared: new SharedRequests({}, root.host, root.origin), update: (change) => void ('state' in change && states.push(change.state)) });
    await waitFor(() => expect(states.at(-1)).toBe('cannot-be-shown'));
    expect(errors.mock.calls.some(([line]) => String(line).includes('c001') && String(line).includes('the dashboard root is disposed'))).toBe(true);
  }, 15_000);

  it('runs a new root made after the dispose of the one before on its own', async () => {
    const { host } = editingHost(async () => fileOf([7]));
    const first = new DashboardRoot({ host, entries: counting().entries, origin: 'http://localhost' });
    const shown = render(<Dashboard root={first} dashboardId={EDITED_ID} theme="light" language="en" />);
    await waitFor(() => expect(values(shown.container)).toEqual(['value 7']), { timeout: 5000 });
    shown.unmount();
    await first.dispose();
    const second = new DashboardRoot({ host, entries: counting().entries, origin: 'http://localhost' });
    const { container } = render(<Dashboard root={second} dashboardId={EDITED_ID} theme="light" language="en" />);
    await waitFor(() => expect(values(container)).toEqual(['value 7']), { timeout: 5000 });
  }, 15_000);
});
