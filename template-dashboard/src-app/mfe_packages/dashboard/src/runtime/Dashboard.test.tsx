import { StrictMode, useState } from 'react';
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { ActionHandler, MfeHandlerMF, type ChildMfeBridge, type MfeEntryLifecycle } from '@gears-frontx/mfes';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { LANGUAGE_PROPERTY_ID, RENDER_WIDGET_ACTION_ID, THEME_PROPERTY_ID, type ServedFile } from '../contract';
import { IN_BUNDLE_PARTS, WIDGET_ENTRIES } from '@gears-frontx/frontx-dashboard-widgets/testing';
import { createMockHost, DEMO_DASHBOARD_ID, DEMO_SERVED_FILE as DEMO_WITHOUT_BUNDLES } from '../mock/mockHost';
import { composeServedFile } from './served';

/** The demo file with the catalog bundles' parts, as a product serves it. */
const DEMO_SERVED_FILE = composeServedFile(DEMO_WITHOUT_BUNDLES, IN_BUNDLE_PARTS);
import { SharedRequests } from './binding';
import { Dashboard, type DashboardProps } from './Dashboard';
import { DashboardRoot, RENDER_RESERVED_FIELDS } from './DashboardRoot';
import { fetchHost, type DashboardHost } from './host';
import { renderStampIdOf, stampIdOf } from './ids';

/*
 * The runtime on the real FrontX registry and gts-plugin, in a simulated DOM:
 * the demo dashboard through the mock host, with stand-in widget entries that
 * write what they receive into their shadow root.
 */

const ENTRY = 'gts.frontx.mfes.mfe.entry.v1~frontx.mfes.mfe.entry_mf.v1~frontx.dashboard.mfe.';
const TYPES = ['summary_card', 'metric_card', 'ranked_list_card', 'progress_list_card', 'radial_progress', 'grid', 'cartesian_chart', 'pie_chart', 'funnel_chart', 'heatmap', 'markdown_card'];

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

  it('marks the frame with the canonical tag the widgets draw in, and en for a value that is not a BCP-47 tag', () => {
    const root = new DashboardRoot({ host: createMockHost({ delayMs: 60_000 }), entries, origin: 'http://localhost' });
    const view = render(<Dashboard root={root} dashboardId={DEMO_DASHBOARD_ID} theme="light" language="pt-br" variables={DEMO_VARIABLES} />);
    expect(view.container.firstElementChild?.getAttribute('lang')).toBe('pt-BR');
    view.rerender(<Dashboard root={root} dashboardId={DEMO_DASHBOARD_ID} theme="light" language="pt_BR" variables={DEMO_VARIABLES} />);
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
    const lines = failureLines(errors);
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
    const { container } = render(<Dashboard root={root} dashboardId={DEMO_DASHBOARD_ID} theme="light" language="en" variables={DEMO_VARIABLES} />);
    expect(await screen.findByText('This widget cannot be shown', {}, { timeout: 5000 })).toBeTruthy();
    await waitFor(() => expect(renderIds(container).filter(Boolean)).toHaveLength(1), { timeout: 5000 });
    expect(screen.getAllByText('This widget cannot be shown')).toHaveLength(1);
    const lines = failureLines(errors);
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
    const lines = failureLines(errors);
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
    const lines = failureLines(errors);
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
    const lines = failureLines(errors);
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
    const lines = failureLines(errors);
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
    const lines = failureLines(errors);
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
