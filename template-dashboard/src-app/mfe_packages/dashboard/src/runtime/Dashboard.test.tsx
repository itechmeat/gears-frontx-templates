import { StrictMode } from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { ActionHandler, MfeHandlerMF, type ChildMfeBridge, type MfeEntryLifecycle } from '@gears-frontx/mfes';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { LANGUAGE_PROPERTY_ID, RENDER_WIDGET_ACTION_ID, THEME_PROPERTY_ID, type ServedFile } from '../contract';
import { IN_BUNDLE_PARTS, WIDGET_ENTRIES } from '@gears-frontx/frontx-dashboard-widgets/testing';
import { createMockHost, DEMO_DASHBOARD_ID, DEMO_SERVED_FILE as DEMO_WITHOUT_BUNDLES } from '../mock/mockHost';
import { composeServedFile } from './served';

/** The demo file with the catalog bundles' parts, as a product serves it. */
const DEMO_SERVED_FILE = composeServedFile(DEMO_WITHOUT_BUNDLES, IN_BUNDLE_PARTS);
import { SharedRequests } from './binding';
import { Dashboard } from './Dashboard';
import { DashboardRoot, RENDER_RESERVED_FIELDS } from './DashboardRoot';
import type { DashboardHost } from './host';
import { renderStampIdOf, stampIdOf } from './ids';

/*
 * The runtime on the real FrontX registry and gts-plugin, in a simulated DOM:
 * the demo dashboard through the mock host, with stand-in widget entries that
 * write what they receive into their shadow root.
 */

const ENTRY = 'gts.frontx.mfes.mfe.entry.v1~frontx.mfes.mfe.entry_mf.v1~frontx.dashboard.mfe.';
const TYPES = ['summary_card', 'metric_card', 'ranked_list_card', 'progress_list_card', 'grid', 'cartesian_chart', 'pie_chart', 'heatmap', 'markdown_card'];

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

const entries = Object.fromEntries(TYPES.map((type) => [`${ENTRY}${type}.v1`, probeEntry]));

const shadowTexts = (container: HTMLElement) =>
  [...container.querySelectorAll<HTMLElement>('[data-widget-extension]')].map((host) => host.shadowRoot?.querySelector('output')?.textContent ?? '');

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('Dashboard on the real registry', () => {
  it('shows every cell of the demo dashboard and keeps the failing request in its own cell', async () => {
    const errors = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const root = new DashboardRoot({ host: createMockHost({ delayMs: 0, file: DEMO_SERVED_FILE }), entries, origin: 'http://localhost' });
    const { container } = render(<Dashboard root={root} dashboardId={DEMO_DASHBOARD_ID} theme="dark" language="en" />);
    const cells = (DEMO_SERVED_FILE.instances.find((instance) => instance.id === DEMO_DASHBOARD_ID) as { layout: { cells: unknown[] } }).layout.cells;
    await waitFor(() => expect(shadowTexts(container).filter((text) => text.startsWith('theme dark'))).toHaveLength(cells.length - 1), { timeout: 5000 });
    // The failing API path fails one cell; the dashboard and every other cell show.
    expect(screen.getAllByText('This widget cannot be shown')).toHaveLength(1);
    expect(errors.mock.calls.some(([line]) => String(line).includes('/api/demo/broken'))).toBe(true);
    // Data widgets get stamped data; the markdown card gets none.
    expect(shadowTexts(container).filter((text) => text.includes('data id'))).toHaveLength(cells.length - 2);
    // A widget's description shows under its title in the cell header.
    expect(screen.getByText('Commits and pull requests per repository').previousElementSibling?.textContent).toBe('Top repositories by commits');
    errors.mockRestore();
  }, 15_000);

  it('fails only the cells of a served widget part the registry rejects, and renders the rest of the dashboard', async () => {
    const errors = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    // The served widget list names one part per catalog bundle; the pie chart's manifest is one the registry rejects.
    const parts = TYPES.map((type) => ({
      types: [],
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
    const { container } = render(<Dashboard root={root} dashboardId={DEMO_DASHBOARD_ID} theme="light" language="en" />);
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

  it('passes bundleOrigins to the entry handler: a bundle on another origin fails only its own cells, before any fetch', async () => {
    const errors = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const load = vi.spyOn(MfeHandlerMF.prototype, 'load').mockRejectedValue(new Error('no bundle server in jsdom'));
    // The grid has no in-bundle entry, so it loads from its bundle, whose manifest names a path on the page origin:
    // allowed by default, refused once the product lists only a CDN.
    const { [`${ENTRY}grid.v1`]: _grid, ...withoutGrid } = entries;
    const root = new DashboardRoot({ host: createMockHost({ delayMs: 0, file: DEMO_SERVED_FILE }), entries: withoutGrid, origin: globalThis.location.origin, bundleOrigins: ['https://cdn.example.com/analytics/widgets/'] });
    const { container } = render(<Dashboard root={root} dashboardId={DEMO_DASHBOARD_ID} theme="light" language="en" />);
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
    const { container } = render(<Dashboard root={root} dashboardId={DEMO_DASHBOARD_ID} theme="light" language="en" />);
    await waitFor(() => expect(shadowTexts(container).filter((text) => text.startsWith('theme light')).length).toBeGreaterThan(10), { timeout: 5000 });
    await waitFor(() => expect(screen.getAllByText('This widget cannot be shown').length).toBeGreaterThan(1), { timeout: 5000 });
    expect(load).not.toHaveBeenCalled();
  }, 15_000);

  it('reads a base address in bundleOrigins as its origin', async () => {
    const errors = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const load = vi.spyOn(MfeHandlerMF.prototype, 'load').mockRejectedValue(new Error('no bundle server in jsdom'));
    const { [`${ENTRY}grid.v1`]: _grid, ...withoutGrid } = entries;
    const root = new DashboardRoot({ host: createMockHost({ delayMs: 0, file: DEMO_SERVED_FILE }), entries: withoutGrid, origin: globalThis.location.origin, bundleOrigins: [`${globalThis.location.origin}/widgets/`] });
    render(<Dashboard root={root} dashboardId={DEMO_DASHBOARD_ID} theme="light" language="en" />);
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

  it('keeps the dashboard-level console line on one line when its problem carries control characters', async () => {
    const errors = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const root = new DashboardRoot({ host: { ...createMockHost({ delayMs: 0 }), loadFile: () => Promise.reject(new Error('down\u2028[dashboard] faked\n\u0085line')) }, entries });
    render(<Dashboard root={root} dashboardId={DEMO_DASHBOARD_ID} theme="light" language="en" />);
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
    const { container } = render(<Dashboard root={root} dashboardId={DEMO_DASHBOARD_ID} theme="light" language="en" />);
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
    const { container } = render(<Dashboard root={root} dashboardId={DEMO_DASHBOARD_ID} theme="light" language="en" />);
    expect(await screen.findByText('This widget cannot be shown', {}, { timeout: 5000 })).toBeTruthy();
    await waitFor(() => expect(shadowTexts(container).some((text) => text.startsWith('theme light; language en; data id'))).toBe(true));
    expect(screen.getAllByText('This widget cannot be shown')).toHaveLength(1);
    expect(errors.mock.calls.some(([line]) => reason.test(String(line)))).toBe(true);
    errors.mockRestore();
  }, 15_000);

  it('publishes the host theme id and language unchanged', async () => {
    const root = new DashboardRoot({ host: createMockHost({ delayMs: 0, file: DEMO_SERVED_FILE }), entries, origin: 'http://localhost' });
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const { container } = render(<Dashboard root={root} dashboardId={DEMO_DASHBOARD_ID} theme="dracula" language="de" />);
    await waitFor(() => expect(shadowTexts(container).some((text) => text.startsWith('theme dracula; language de'))).toBe(true), { timeout: 5000 });
    vi.restoreAllMocks();
  }, 15_000);

  it('marks the frame with the canonical tag the widgets draw in, and en for a value that is not a BCP-47 tag', () => {
    const root = new DashboardRoot({ host: createMockHost({ delayMs: 60_000 }), entries, origin: 'http://localhost' });
    const view = render(<Dashboard root={root} dashboardId={DEMO_DASHBOARD_ID} theme="light" language="pt-br" />);
    expect(view.container.firstElementChild?.getAttribute('lang')).toBe('pt-BR');
    view.rerender(<Dashboard root={root} dashboardId={DEMO_DASHBOARD_ID} theme="light" language="pt_BR" />);
    expect(view.container.firstElementChild?.getAttribute('lang')).toBe('en');
    view.unmount();
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
    const view = render(<Dashboard root={root} dashboardId={DEMO_DASHBOARD_ID} theme="light" language="en" />);
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
    view.rerender(<Dashboard root={root} dashboardId={DEMO_DASHBOARD_ID} theme="light" language="en" />);
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
    const view = render(<Dashboard root={root} dashboardId={DEMO_DASHBOARD_ID} theme="light" language="de" />);
    await waitFor(() => expect(shadowTexts(view.container).some((text) => text.startsWith('theme light; language de;'))).toBe(true), { timeout: 5000 });
    view.rerender(<Dashboard root={root} dashboardId={DEMO_DASHBOARD_ID} theme="light" language="" />);
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
    const first = render(<Dashboard root={root} dashboardId={DEMO_DASHBOARD_ID} theme="light" language="en" />);
    const discarded = root.load(DEMO_DASHBOARD_ID);
    first.unmount();
    await new Promise((resolve) => setTimeout(resolve, 100));
    const second = render(<Dashboard root={root} dashboardId={DEMO_DASHBOARD_ID} theme="light" language="en" />);
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
    const view = render(<Dashboard root={root} dashboardId={DEMO_DASHBOARD_ID} theme="light" language="en" />);
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
    const { container } = render(<Dashboard root={root} dashboardId={DEMO_DASHBOARD_ID} theme="light" language="en" />);
    await waitFor(() => expect(shadowTexts(container).some((text) => text.startsWith('theme light'))).toBe(true), { timeout: 5000 });
    expect(sent).toEqual(['/api/demo/delivery/daily']);
    // The overlay widget receives its render stamped with the larger_view role.
    fireEvent.click(screen.getByRole('button', { name: /larger/ }));
    const overlayRender = renderStampIdOf('gts.frontx.dashboard.widget.render.v1~frontx.dashboard.widget.pie_chart_render.v1~', larger.id, 'larger_view');
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
    const { container } = render(<Dashboard root={root} dashboardId={DEMO_DASHBOARD_ID} theme="light" language="en" />);
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
  const failureLines = (errors: { mock: { calls: unknown[][] } }) => errors.mock.calls.map(([line]) => String(line)).filter((line) => line.startsWith('[dashboard] dashboard'));

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
    const { container } = render(<Dashboard root={root} dashboardId={DEMO_DASHBOARD_ID} theme="light" language="en" />);
    await waitFor(() => expect(renderIds(container)).toEqual([renderStampIdOf(METRIC_RENDER, metric.widget.id, 'cell')]), { timeout: 5000 });
  }, 15_000);

  it('fails only the cell whose render its render type rejects at the stamp', async () => {
    const errors = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    // The open render passes the widget's own registration; only the stamp checks it against the metric_card render type.
    const loose = productType('loose_metric', { render_type: METRIC_RENDER }, {});
    const cells = [metric, widgetOf('loose_metric', '0001', { radius: '50%' }), widgetOf('loose_metric', '0002', { value_label: 'fine' })];
    const root = new DashboardRoot({ host: createMockHost({ delayMs: 0, file: fileWith([loose], cells) }), entries, origin: 'http://localhost' });
    const { container } = render(<Dashboard root={root} dashboardId={DEMO_DASHBOARD_ID} theme="light" language="en" />);
    expect(await screen.findByText('This widget cannot be shown', {}, { timeout: 5000 })).toBeTruthy();
    await waitFor(() => expect(renderIds(container).filter(Boolean)).toHaveLength(2), { timeout: 5000 });
    expect(screen.getAllByText('This widget cannot be shown')).toHaveLength(1);
    const lines = failureLines(errors);
    expect(lines).toHaveLength(1);
    expect(lines[0]).toContain('0001');
    expect(lines[0]).toContain(`the render fails ${METRIC_RENDER}`);
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
    const { container, rerender } = render(<Dashboard root={root} dashboardId={DEMO_DASHBOARD_ID} theme="light" language="en" />);
    await waitFor(() => expect(renderIds(container)).toEqual([stamp]), { timeout: 5000 });
    rerender(<Dashboard root={root} dashboardId={SECOND} theme="light" language="en" />);
    expect(await screen.findByText('This widget cannot be shown', {}, { timeout: 5000 })).toBeTruthy();
    await waitFor(() => expect(renderIds(container).filter(Boolean)).toEqual([stamp]), { timeout: 5000 });
    expect(screen.getAllByText('This widget cannot be shown')).toHaveLength(1);
    const lines = failureLines(errors);
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
    const { container } = render(<Dashboard root={root} dashboardId={DEMO_DASHBOARD_ID} theme="light" language="en" />);
    expect(await screen.findByText('This widget cannot be shown', {}, { timeout: 5000 })).toBeTruthy();
    await waitFor(() => expect(renderIds(container).filter(Boolean)).toHaveLength(1), { timeout: 5000 });
    expect(screen.getAllByText('This widget cannot be shown')).toHaveLength(1);
    const lines = failureLines(errors);
    expect(lines).toHaveLength(1);
    expect(lines[0]).toContain('0004');
    expect(lines[0]).toContain(`the render carries the GTS field ${name}`);
    errors.mockRestore();
  }, 15_000);

  // The harm the guard stops: a render naming a stamp registered under a looser render type would register as that
  // stamp, be validated against that type instead of its own, and reach the widget.
  it.each(['gtsId', '$id'])('fails the cell whose render names a registered stamp in %s, and the widget receives no render', async (name) => {
    const errors = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const SECOND = 'gts.frontx.dashboard.dashboard.dashboard.v1~1c2d3e4f-5a6b-4c7d-8e9f-0a1b2c3d4e60';
    // The first dashboard registers two stamps: one of a widget that names no render_type, a render base instance,
    // which allows any field, and one of a widget whose render_type is the closed metric_card render. That widget's
    // type keeps its render open, so only the stamp checks the render.
    const open = productType('open_render', {}, {});
    const loose = productType('loose_metric', { render_type: METRIC_RENDER }, {});
    const based = widgetOf('open_render', '0007', { label: 'Deploys' });
    const valid = widgetOf('loose_metric', '0008', { value_label: 'fine' });
    const baseStamp = renderStampIdOf(RENDER_BASE, based.widget.id, 'cell');
    // The second dashboard shows the same metric widget with a render the metric_card render rejects, naming the base stamp.
    const named = { ...valid, widget: { ...valid.widget, render: { radius: '50%', [name]: baseStamp } } };
    const first = fileWith([open, loose], [based, valid]);
    const file: ServedFile = { ...first, instances: [...first.instances, { ...demo, id: SECOND, layout: { cells: [named] } }] };
    const root = new DashboardRoot({ host: createMockHost({ delayMs: 0, file }), entries, origin: 'http://localhost' });
    const { container, rerender } = render(<Dashboard root={root} dashboardId={DEMO_DASHBOARD_ID} theme="light" language="en" />);
    await waitFor(() => expect(renderIds(container)).toEqual([baseStamp, renderStampIdOf(METRIC_RENDER, valid.widget.id, 'cell')]), { timeout: 5000 });
    rerender(<Dashboard root={root} dashboardId={SECOND} theme="light" language="en" />);
    expect(await screen.findByText('This widget cannot be shown', {}, { timeout: 5000 })).toBeTruthy();
    const lines = failureLines(errors);
    expect(lines).toHaveLength(1);
    expect(lines[0]).toContain(`the render carries the GTS field ${name}`);
    expect(renderIds(container).filter(Boolean)).toEqual([]);
    errors.mockRestore();
  }, 15_000);

  it('fails the cell whose render names the render base in a free type field: the field does not redirect validation', async () => {
    const errors = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const loose = productType('loose_metric', { render_type: METRIC_RENDER }, {});
    const cell = widgetOf('loose_metric', '0008', { type: RENDER_BASE, radius: '50%' });
    const root = new DashboardRoot({ host: createMockHost({ delayMs: 0, file: fileWith([loose], [metric, cell]) }), entries, origin: 'http://localhost' });
    const { container } = render(<Dashboard root={root} dashboardId={DEMO_DASHBOARD_ID} theme="light" language="en" />);
    expect(await screen.findByText('This widget cannot be shown', {}, { timeout: 5000 })).toBeTruthy();
    await waitFor(() => expect(renderIds(container).filter(Boolean)).toHaveLength(1), { timeout: 5000 });
    const lines = failureLines(errors);
    expect(lines).toHaveLength(1);
    expect(lines[0]).toContain('0008');
    expect(lines[0]).toContain(`the render fails ${METRIC_RENDER}`);
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
    const { container } = render(<Dashboard root={root} dashboardId={DEMO_DASHBOARD_ID} theme="light" language="en" />);
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
    const lines = failureLines(errors);
    expect(lines).toHaveLength(1);
    expect(lines[0]).toContain('0006');
    expect(lines[0]).toContain('the render cannot be read: Error: getter boom');
    errors.mockRestore();
  });

  it('fails only the cell whose render names an id that is no registered render', async () => {
    const errors = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const unknown = { ...metric, widget: { ...metric.widget, id: metric.widget.id.replace(/[0-9a-f]{4}$/, 'a0b2'), render: { id: `${METRIC_RENDER}0b7c1d2e-3f40-4a51-8b62-000000000077` } } };
    const root = new DashboardRoot({ host: createMockHost({ delayMs: 0, file: fileWith([], [metric, unknown]) }), entries, origin: 'http://localhost' });
    const { container } = render(<Dashboard root={root} dashboardId={DEMO_DASHBOARD_ID} theme="light" language="en" />);
    expect(await screen.findByText('This widget cannot be shown', {}, { timeout: 5000 })).toBeTruthy();
    await waitFor(() => expect(renderIds(container).filter(Boolean)).toHaveLength(1), { timeout: 5000 });
    expect(screen.getAllByText('This widget cannot be shown')).toHaveLength(1);
    const lines = failureLines(errors);
    expect(lines).toHaveLength(1);
    expect(lines[0]).toContain('a0b2');
    expect(lines[0]).toContain('/render/id x-gts-instance-ref');
    errors.mockRestore();
  }, 15_000);

  it('stamps the render of a product widget type with no render_type with the render base, and renders it', async () => {
    const pulse = productType('inline_pulse', {}, { additionalProperties: false, properties: { label: { type: 'string' } } });
    const cell = widgetOf('inline_pulse', '0003', { label: 'Deploys' });
    const root = new DashboardRoot({ host: createMockHost({ delayMs: 0, file: fileWith([pulse], [cell]) }), entries, origin: 'http://localhost' });
    const { container } = render(<Dashboard root={root} dashboardId={DEMO_DASHBOARD_ID} theme="light" language="en" />);
    await waitFor(() => expect(renderIds(container)).toEqual([renderStampIdOf(RENDER_BASE, cell.widget.id, 'cell')]), { timeout: 5000 });
    expect(shadowTexts(container)[0]).toContain('data id,value');
  }, 15_000);
});

// Dashboard variables: the root builds each request from the current values and re-runs only the cells that use them.
describe('dashboard variables', () => {
  const METRIC = `${ENTRY}metric_card.v1`;
  const demo = DEMO_SERVED_FILE.instances.find((instance) => instance.id === DEMO_DASHBOARD_ID) as { layout: { cells: { widget: { id: string } }[] } };
  const metric = demo.layout.cells.find((cell) => cell.widget.id.includes('.metric_card.'))!;
  const PERIOD = { title: 'Period', options: [{ value: '7d', label: 'Last 7 days' }, { value: '30d', label: 'Last 30 days' }, { value: '90d', label: 'Last 90 days' }], default: '30d' };
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
  const fileOf = (extra: Record<string, unknown> = { variables: { period: PERIOD } }, cells: unknown[] = CELLS): ServedFile => ({
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
   */
  const countingHost = (file: ServedFile, delays: Record<string, number> = {}, failing?: string) => {
    const sent: string[] = [];
    const mock = createMockHost({ delayMs: 0, file });
    const host: DashboardHost = {
      loadFile: (signal) => mock.loadFile(signal),
      request: async (request) => {
        sent.push(request.path);
        const delay = Object.entries(delays).find(([key]) => request.path.includes(key))?.[1] ?? 0;
        if (delay) await new Promise((resolve) => setTimeout(resolve, delay));
        if (failing && request.path.includes(failing)) throw new Error('500');
        const period = new URL(request.path, 'http://localhost').searchParams.get('period');
        return { value: period === null ? null : Number.parseInt(period, 10) };
      },
    };
    return { host, sent };
  };
  const values = (container: HTMLElement) => [...container.querySelectorAll<HTMLElement>('[data-widget-extension]')].map((host) => host.shadowRoot?.querySelector('output')?.textContent ?? '');
  /** What the four cells show at a period of `days` days: the three that use the period show it, the last one shows none. */
  const at = (days: number) => [`value ${days}`, `value ${days}`, `value ${days}`, 'value null'];
  const entriesWithValues = { ...entries, [METRIC]: valueEntry };
  const CANNOT = 'This widget cannot be shown';
  const settle = (ms = 300) => new Promise((resolve) => setTimeout(resolve, ms));

  it('re-requests only the cells that use a switched variable, and sends a shared request once per value', async () => {
    const { host, sent } = countingHost(fileOf());
    const changes: Record<string, string>[] = [];
    const { container } = render(<Dashboard root={new DashboardRoot({ host, entries: entriesWithValues, origin: 'http://localhost' })} dashboardId={VARIABLES_ID} theme="light" language="en" onVariablesChange={(next) => changes.push(next)} />);
    await waitFor(() => expect(values(container)).toEqual(at(30)), { timeout: 5000 });
    expect([...sent].sort()).toEqual(['/api/demo/ci/outcomes?period=30d', '/api/demo/repos/activity?period=30d', '/api/demo/teams/goals']);
    sent.length = 0;
    fireEvent.click(screen.getByRole('button', { name: 'Last 7 days' }));
    await waitFor(() => expect(values(container)).toEqual(at(7)), { timeout: 5000 });
    // One request for the two cells of the shared request, one for the own request, none for the cell that does not use the period.
    expect([...sent].sort()).toEqual(['/api/demo/ci/outcomes?period=7d', '/api/demo/repos/activity?period=7d']);
    expect(changes).toEqual([{ period: '7d' }]);
    // A value seen before keeps its shared answer; only the own request goes out again.
    sent.length = 0;
    fireEvent.click(screen.getByRole('button', { name: 'Last 30 days' }));
    await waitFor(() => expect(values(container)).toEqual(at(30)), { timeout: 5000 });
    expect(sent).toEqual(['/api/demo/repos/activity?period=30d']);
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

  it('draws no bar with hideVariables and builds the requests from the host values', async () => {
    const { host, sent } = countingHost(fileOf());
    const { container } = render(<Dashboard root={new DashboardRoot({ host, entries: entriesWithValues, origin: 'http://localhost' })} dashboardId={VARIABLES_ID} theme="light" language="en" variables={{ period: '90d' }} hideVariables />);
    await waitFor(() => expect(values(container)).toEqual(at(90)), { timeout: 5000 });
    expect(screen.queryByRole('group', { name: 'Period' })).toBeNull();
    expect(sent).toContain('/api/demo/ci/outcomes?period=90d');
  }, 15_000);

  it('gives the default for a host value outside the options and ignores an unknown name, each with one console line', async () => {
    const errors = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const { host } = countingHost(fileOf());
    const { container } = render(<Dashboard root={new DashboardRoot({ host, entries: entriesWithValues, origin: 'http://localhost' })} dashboardId={VARIABLES_ID} theme="light" language="en" variables={{ period: '1y x', team: 'web' }} />);
    await waitFor(() => expect(values(container)).toEqual(at(30)), { timeout: 5000 });
    const lines = errors.mock.calls.map(([line]) => String(line)).filter((line) => line.includes('host'));
    expect(lines).toHaveLength(2);
    expect(lines.filter((line) => line.includes('the host value 1y\\u2028x of the variable period is not one of its options, so it is 30d'))).toHaveLength(1);
    expect(lines.filter((line) => line.includes('the host variable team is not a variable of the dashboard'))).toHaveLength(1);
    expect(screen.getByRole('button', { name: 'Last 30 days' }).getAttribute('aria-pressed')).toBe('true');
  }, 15_000);

  it('adds nothing to the dashboard area of a dashboard without variables', async () => {
    const without = render(<Dashboard root={new DashboardRoot({ host: countingHost(fileOf({})).host, entries: entriesWithValues, origin: 'http://localhost' })} dashboardId={VARIABLES_ID} theme="light" language="en" />);
    // The ci request and the own request name an undeclared variable here, so only the cell that names none shows a value.
    await waitFor(() => expect(values(without.container).filter((text) => text.startsWith('value'))).toHaveLength(1), { timeout: 5000 });
    const plain = without.container.firstElementChild!.childElementCount;
    expect(screen.queryByRole('group', { name: 'Period' })).toBeNull();
    without.unmount();
    const withBar = render(<Dashboard root={new DashboardRoot({ host: countingHost(fileOf()).host, entries: entriesWithValues, origin: 'http://localhost' })} dashboardId={VARIABLES_ID} theme="light" language="en" />);
    await waitFor(() => expect(values(withBar.container)).toEqual(at(30)), { timeout: 5000 });
    expect(screen.getByRole('group', { name: 'Period' })).toBeTruthy();
    // The bar is the one element the variables add.
    expect(withBar.container.firstElementChild!.childElementCount).toBe(plain + 1);
  }, 15_000);

  it('keeps a cell whose data fails its own check in that cell, and shows the rest', async () => {
    const errors = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    // The widget fails its own registration; its stand-in still carries the data, which no step may read as a binding.
    const bad = cellOf('b005', { request: null, transform: 'response' });
    const { host } = countingHost(fileOf(undefined, [CELLS[3], bad]));
    const { container } = render(<Dashboard root={new DashboardRoot({ host, entries: entriesWithValues, origin: 'http://localhost' })} dashboardId={VARIABLES_ID} theme="light" language="en" />);
    await waitFor(() => expect(values(container)).toEqual(['value null']), { timeout: 5000 });
    expect(await screen.findByText(CANNOT)).toBeTruthy();
    expect(screen.getAllByText(CANNOT)).toHaveLength(1);
    expect(errors.mock.calls.some(([line]) => String(line).includes('b005') && String(line).includes('fails its own registration'))).toBe(true);
  }, 15_000);

  it('gives the default, not the bar\'s last pick, for a rejected host value, with one console line', async () => {
    const errors = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const { host } = countingHost(fileOf());
    const root = new DashboardRoot({ host, entries: entriesWithValues, origin: 'http://localhost' });
    const view = render(<Dashboard root={root} dashboardId={VARIABLES_ID} theme="light" language="en" />);
    await waitFor(() => expect(values(view.container)).toEqual(at(30)), { timeout: 5000 });
    fireEvent.click(screen.getByRole('button', { name: 'Last 7 days' }));
    await waitFor(() => expect(values(view.container)).toEqual(at(7)), { timeout: 5000 });
    view.rerender(<Dashboard root={root} dashboardId={VARIABLES_ID} theme="light" language="en" variables={{ period: '1y' }} />);
    await waitFor(() => expect(values(view.container)).toEqual(at(30)), { timeout: 5000 });
    expect(screen.getByRole('button', { name: 'Last 30 days' }).getAttribute('aria-pressed')).toBe('true');
    expect(errors.mock.calls.filter(([line]) => String(line).includes('the host value 1y of the variable period is not one of its options, so it is 30d'))).toHaveLength(1);
  }, 15_000);

  it('keeps a host value over a pick in the bar: the pick only goes to onVariablesChange', async () => {
    const { host, sent } = countingHost(fileOf());
    const changes: Record<string, string>[] = [];
    const { container } = render(<Dashboard root={new DashboardRoot({ host, entries: entriesWithValues, origin: 'http://localhost' })} dashboardId={VARIABLES_ID} theme="light" language="en" variables={{ period: '30d' }} onVariablesChange={(next) => changes.push(next)} />);
    await waitFor(() => expect(values(container)).toEqual(at(30)), { timeout: 5000 });
    fireEvent.click(screen.getByRole('button', { name: 'Last 7 days' }));
    expect(changes).toEqual([{ period: '7d' }]);
    await settle();
    expect(screen.getByRole('button', { name: 'Last 30 days' }).getAttribute('aria-pressed')).toBe('true');
    expect(sent.filter((path) => path.includes('period=7d'))).toEqual([]);
    expect(values(container)).toEqual(at(30));
  }, 15_000);

  // StrictMode mounts each cell twice and runs its effects twice: each request still goes out once. The root drops a
  // re-run before the first run started (its `latest` check), and the cell's `ranWith` ref skips the repeated re-run effect.
  it('sends each request once on first show inside StrictMode, through the root\'s latest check and the cell\'s ranWith ref', async () => {
    const { host, sent } = countingHost(fileOf());
    const { container } = render(
      <StrictMode>
        <Dashboard root={new DashboardRoot({ host, entries: entriesWithValues, origin: 'http://localhost' })} dashboardId={VARIABLES_ID} theme="light" language="en" />
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
    render(<Dashboard root={new DashboardRoot({ host, entries: { ...entries, [METRIC]: () => refusing }, origin: 'http://localhost' })} dashboardId={VARIABLES_ID} theme="light" language="en" />);
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
    const { container } = render(<Dashboard root={new DashboardRoot({ host, entries: entriesWithValues, origin: 'http://localhost' })} dashboardId={VARIABLES_ID} theme="light" language="en" />);
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
    render(<Dashboard root={new DashboardRoot({ host, entries: { ...entries, [METRIC]: () => refusingAfter(0) }, origin: 'http://localhost' })} dashboardId={VARIABLES_ID} theme="light" language="en" />);
    expect(await screen.findByText(CANNOT, {}, { timeout: 5000 })).toBeTruthy();
    expect(sent).toEqual(['/api/demo/ci/outcomes?period=30d']);
    fireEvent.click(screen.getByRole('button', { name: 'Last 7 days' }));
    await settle();
    expect(sent).toEqual(['/api/demo/ci/outcomes?period=30d']);
  }, 15_000);

  it('does not prefetch the shared source of a widget that failed its own registration', async () => {
    const errors = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    // An extra field breaks the binding form, so the widget fails its own registration with its source still named.
    const bad = cellOf('b006', { source: 'ci', transform: "{'value': response.value}", extra: 1 });
    const { host, sent } = countingHost(fileOf(undefined, [CELLS[3], bad]));
    const { container } = render(<Dashboard root={new DashboardRoot({ host, entries: entriesWithValues, origin: 'http://localhost' })} dashboardId={VARIABLES_ID} theme="light" language="en" />);
    await waitFor(() => expect(values(container)).toEqual(['value null']), { timeout: 5000 });
    expect(await screen.findByText(CANNOT)).toBeTruthy();
    expect(errors.mock.calls.some(([line]) => String(line).includes('b006') && String(line).includes('fails its own registration'))).toBe(true);
    fireEvent.click(screen.getByRole('button', { name: 'Last 7 days' }));
    await settle();
    expect(sent).toEqual(['/api/demo/teams/goals']);
  }, 15_000);

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
    const { container } = render(<Dashboard root={new DashboardRoot({ host, entries: entriesWithValues, origin: 'http://localhost' })} dashboardId={VARIABLES_ID} theme="light" language="en" />);
    await waitFor(() => expect(values(container)).toEqual(['value undefined']), { timeout: 5000 });
    await settle();
    expect(sent).toEqual([]);
  }, 15_000);

  it('keeps a cell whose render_widget fell back while its next answer was on the way cannot-be-shown, with one fallback line', async () => {
    const errors = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    let calls = 0;
    // The first render_widget is refused 200 ms after it arrives; the answer to the next value takes 500 ms.
    const { host } = countingHost(fileOf(undefined, [CELLS[2]]), { 'period=7d': 500 });
    render(<Dashboard root={new DashboardRoot({ host, entries: { ...entries, [METRIC]: () => refusingAfter(200, () => (calls += 1)) }, origin: 'http://localhost' })} dashboardId={VARIABLES_ID} theme="light" language="en" />);
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
