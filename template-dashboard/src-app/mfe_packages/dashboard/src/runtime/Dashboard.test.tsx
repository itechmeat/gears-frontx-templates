import { render, screen, waitFor } from '@testing-library/react';
import { ActionHandler, type ChildMfeBridge, type MfeEntryLifecycle } from '@gears-frontx/mfes';
import { describe, expect, it, vi } from 'vitest';

import { RENDER_WIDGET_ACTION_ID, THEME_PROPERTY_ID, type ServedFile } from '../contract';
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
          root!.textContent = `theme ${String(bridge?.getProperty(THEME_PROPERTY_ID)?.value)}; data ${Object.keys(received.data ?? {}).sort().join(',')}`;
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
    await waitFor(() => expect(shadowTexts(container).some((text) => text.startsWith('theme light; data id'))).toBe(true));
    expect(screen.getAllByText('This widget cannot be shown')).toHaveLength(1);
    expect(errors.mock.calls.some(([line]) => reason.test(String(line)))).toBe(true);
    errors.mockRestore();
  }, 15_000);
});
