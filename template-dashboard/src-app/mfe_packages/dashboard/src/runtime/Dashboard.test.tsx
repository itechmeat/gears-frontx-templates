import { render, screen, waitFor } from '@testing-library/react';
import { ActionHandler, type ChildMfeBridge, type MfeEntryLifecycle } from '@gears-frontx/mfes';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { LANGUAGE_PROPERTY_ID, RENDER_WIDGET_ACTION_ID, THEME_PROPERTY_ID, type ServedFile } from '../contract';
import { createMockHost, DEMO_DASHBOARD_ID, DEMO_SERVED_FILE } from '../mock/mockHost';
import { Dashboard } from './Dashboard';
import { DashboardRoot } from './DashboardRoot';

/*
 * The runtime on the real FrontX registry and gts-plugin, in a simulated DOM:
 * the demo dashboard through the mock host, with stand-in widget entries that
 * write what they receive into their shadow root.
 */

const ENTRY = 'gts.frontx.mfes.mfe.entry.v1~frontx.mfes.mfe.entry_mf.v1~frontx.dashboard.mfe.';
const TYPES = ['summary_card', 'metric_card', 'ranked_list_card', 'progress_list_card', 'grid', 'cartesian_chart', 'pie_chart', 'heatmap', 'markdown_card'];

/** A widget entry that shows the theme and the keys of the data it receives. */
function probeEntry(): MfeEntryLifecycle {
  let root: HTMLElement | undefined;
  let bridge: ChildMfeBridge | undefined;
  return {
    mount(container, childBridge) {
      bridge = childBridge;
      root = document.createElement('output');
      root.textContent = 'mounted';
      container.appendChild(root);
      childBridge.registerActionHandler(
        RENDER_WIDGET_ACTION_ID,
        ActionHandler.fromFunction(async (_type, payload) => {
          const received = payload as { render: Record<string, unknown>; data?: Record<string, unknown> };
          root!.textContent = `theme ${String(bridge?.getProperty(THEME_PROPERTY_ID)?.value)}; language ${String(bridge?.getProperty(LANGUAGE_PROPERTY_ID)?.value)}; data ${Object.keys(received.data ?? {}).sort().join(',')}`;
        }),
      );
    },
    unmount() {
      root?.remove();
    },
  };
}

const entries = Object.fromEntries(TYPES.map((type) => [`${ENTRY}${type}.v1`, probeEntry]));

const shadowTexts = (container: HTMLElement) =>
  [...container.querySelectorAll<HTMLElement>('[data-widget-extension]')].map((host) => host.shadowRoot?.querySelector('output')?.textContent ?? '');

afterEach(() => vi.restoreAllMocks());

describe('Dashboard on the real registry', () => {
  it('shows every cell of the demo dashboard and keeps the failing request in its own cell', async () => {
    const errors = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const root = new DashboardRoot({ host: createMockHost({ delayMs: 0 }), entries, origin: 'http://localhost' });
    const { container } = render(<Dashboard root={root} dashboardId={DEMO_DASHBOARD_ID} theme="dark" language="en" />);
    const cells = (DEMO_SERVED_FILE.instances.find((instance) => instance.id === DEMO_DASHBOARD_ID) as { layout: { cells: unknown[] } }).layout.cells;
    await waitFor(() => expect(shadowTexts(container).filter((text) => text.startsWith('theme dark'))).toHaveLength(cells.length - 1), { timeout: 5000 });
    // The failing API path fails one cell; the dashboard and every other cell show.
    expect(screen.getAllByText('This widget cannot be shown')).toHaveLength(1);
    expect(errors.mock.calls.some(([line]) => String(line).includes('/api/insight/broken'))).toBe(true);
    // Data widgets get stamped data; the markdown card gets none.
    expect(shadowTexts(container).filter((text) => text.includes('data id'))).toHaveLength(cells.length - 2);
    errors.mockRestore();
  }, 15_000);

  it('shows the dashboard-level state for an unknown dashboard id', async () => {
    const errors = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const root = new DashboardRoot({ host: createMockHost({ delayMs: 0 }), entries });
    render(<Dashboard root={root} dashboardId="gts.frontx.dashboard.dashboard.dashboard.v1~00000000-0000-4000-8000-000000000000" theme="light" language="en" />);
    expect(await screen.findByText('This dashboard cannot be shown')).toBeTruthy();
    expect(errors.mock.calls.some(([line]) => String(line).includes('no dashboard'))).toBe(true);
    errors.mockRestore();
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
    const root = new DashboardRoot({ host: createMockHost({ delayMs: 0 }), entries, origin: 'http://localhost' });
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const { container } = render(<Dashboard root={root} dashboardId={DEMO_DASHBOARD_ID} theme="dracula" language="de" />);
    await waitFor(() => expect(shadowTexts(container).some((text) => text.startsWith('theme dracula; language de'))).toBe(true), { timeout: 5000 });
    vi.restoreAllMocks();
  }, 15_000);

  it('retries the served file after a failed load', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const mock = createMockHost({ delayMs: 0 });
    let calls = 0;
    const root = new DashboardRoot({ host: { ...mock, loadFile: (signal) => (++calls === 1 ? Promise.reject(new Error('down')) : mock.loadFile(signal)) }, entries });
    expect((await root.load(DEMO_DASHBOARD_ID)).ok).toBe(false);
    expect((await root.load(DEMO_DASHBOARD_ID)).ok).toBe(true);
    vi.restoreAllMocks();
  });

  it('shows a dashboard again after a quick switch away and back', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const other = 'gts.frontx.dashboard.dashboard.dashboard.v1~5b1e2d3c-4f5a-4b6c-8d7e-9f0a1b2c3d4e';
    const root = new DashboardRoot({ host: createMockHost({ delayMs: 0 }), entries, origin: 'http://localhost' });
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

  it('discards a load the viewer left before it settled, so the next mount loads again', async () => {
    const mock = createMockHost({ delayMs: 50 });
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
    const mock = createMockHost({ delayMs: 0 });
    const sent: string[] = [];
    const demo = DEMO_SERVED_FILE.instances.find((instance) => instance.id === DEMO_DASHBOARD_ID) as { requests: object; layout: { cells: { widget: { id: string; data?: object }; larger_view?: object }[] } };
    const pie = demo.layout.cells.find((cell) => cell.widget.id.includes('.pie_chart.') && 'params' in (cell.widget.data ?? {}))!;
    const larger = { ...pie.widget, id: pie.widget.id.replace(/[0-9a-f]{4}$/, 'aaaa'), data: { source: 'daily', transform: "{'slices': [{'label': 'days', 'value': double(size(response.daily))}]}" } };
    const file: ServedFile = { ...DEMO_SERVED_FILE, instances: [...DEMO_SERVED_FILE.instances.filter((instance) => instance.id !== DEMO_DASHBOARD_ID), { ...demo, layout: { cells: [{ ...pie, larger_view: larger }] } }] };
    const root = new DashboardRoot({ host: { ...createMockHost({ delayMs: 0, file }), request: (request, signal) => (sent.push(request.path), mock.request(request, signal)) }, entries, origin: 'http://localhost' });
    const { container } = render(<Dashboard root={root} dashboardId={DEMO_DASHBOARD_ID} theme="light" language="en" />);
    await waitFor(() => expect(shadowTexts(container).some((text) => text.startsWith('theme light'))).toBe(true), { timeout: 5000 });
    expect(sent).toEqual(['/api/insight/delivery/daily']);
  }, 15_000);
});
