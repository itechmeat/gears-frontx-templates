import { GtsPlugin } from '@gears-frontx/gts-plugin';
import { describe, expect, it } from 'vitest';

import type { Dashboard, ServedFile } from '../contract';
import { DEMO_DASHBOARD_ID, DEMO_SERVED_FILE } from '../mock/mockHost';
import { effectiveTraits, registerBundle, registerDashboard, registerServedFile, slotOf } from './register';

// The registration order of DESIGN §3.6 step 4 and ADR-0003, on the real gts-plugin with reference lookup on.

const PIE = 'gts.frontx.dashboard.widget.widget.v1~frontx.dashboard.widget.data_widget.v1~frontx.dashboard.widget.pie_chart.v1~';
const PIE_ENTRY = 'gts.frontx.mfes.mfe.entry.v1~frontx.mfes.mfe.entry_mf.v1~frontx.dashboard.mfe.pie_chart.v1';
const PIE_DATA = 'gts.frontx.dashboard.widget_data.widget_data.v1~frontx.dashboard.widget_data.pie_chart.v1~';
const DASHBOARD = 'gts.frontx.dashboard.dashboard.dashboard.v1~0e2c4a68-1b3d-4f5a-8c7e-9d0f1a2b3c4d';

function loaded(file: ServedFile = DEMO_SERVED_FILE) {
  const types = new GtsPlugin({ isolated: true });
  const outcome = registerServedFile(types, file, registerBundle(types));
  return { types, outcome };
}

const pie = (uuid: string, extra: Record<string, unknown> = {}) => ({
  id: `${PIE}${uuid}`,
  title: 'Pie',
  render: { legend_position: 'bottom' },
  data: { params: {}, transform: "{'slices': []}" },
  ...extra,
});

const dashboardOf = (cells: unknown[]): Dashboard => ({ id: DASHBOARD, title: 'Order', layout: { cells } }) as unknown as Dashboard;

describe('registration order under reference lookup', () => {
  it('registers the catalog and the demo dashboard with no failed cell', () => {
    const { types, outcome } = loaded();
    expect(outcome.ok).toBe(true);
    const dashboard = outcome.ok ? outcome.dashboards.get(DEMO_DASHBOARD_ID) : undefined;
    expect(dashboard).toBeDefined();
    const result = registerDashboard(types, dashboard!);
    expect(result).toEqual({ ok: true, failed: new Map() });
  });

  it('keeps a widget that fails its own type a failure of its own cell', () => {
    const { types } = loaded();
    const result = registerDashboard(types, dashboardOf([
      { size: 'small', widget: pie('1a2b3c4d-0000-4000-8000-000000000001') },
      { size: 'small', widget: pie('1a2b3c4d-0000-4000-8000-000000000002', { render: { not_a_field: 1 } }) },
    ]));
    expect(result.ok).toBe(true);
    expect(result.ok && [...result.failed.keys()]).toEqual([slotOf(1, 'cell')]);
  });

  it('keeps a widget of an unregistered type a failure of its own cell', () => {
    const { types } = loaded();
    const unknown = { ...pie('1a2b3c4d-0000-4000-8000-000000000003'), id: `${PIE.replace('pie_chart.v1~', 'pie_chart.v2~')}1a2b3c4d-0000-4000-8000-000000000003` };
    const result = registerDashboard(types, dashboardOf([{ size: 'small', widget: pie('1a2b3c4d-0000-4000-8000-000000000004') }, { size: 'small', widget: unknown }]));
    expect(result.ok && [...result.failed.keys()]).toEqual([slotOf(1, 'cell')]);
  });

  it('keeps a type whose entry is not registered a failure of the cells that use it', () => {
    const dangling = { ...(DEMO_SERVED_FILE.types.find((type) => String(type.$id).endsWith('pie_chart.v1~') && String(type.$id).includes('.widget.'))!) };
    dangling.$id = `gts://${PIE.replace('pie_chart.v1~', 'pie_chart_x.v1~')}`;
    dangling['x-gts-traits'] = { entry: `${PIE_ENTRY}_missing`, data_type: PIE_DATA };
    const { types, outcome } = loaded({ ...DEMO_SERVED_FILE, types: [...DEMO_SERVED_FILE.types, dangling] });
    // The served type itself registers: its trait value is checked when an instance of it registers.
    expect(outcome.ok).toBe(true);
    const widget = { ...pie('1a2b3c4d-0000-4000-8000-000000000005'), id: `${PIE.replace('pie_chart.v1~', 'pie_chart_x.v1~')}1a2b3c4d-0000-4000-8000-000000000005` };
    const result = registerDashboard(types, dashboardOf([{ size: 'small', widget }]));
    expect(result.ok && [...result.failed.keys()]).toEqual([slotOf(0, 'cell')]);
  });

  it('keeps a failing larger view a failure of the larger view only', () => {
    const { types } = loaded();
    const result = registerDashboard(types, dashboardOf([
      { size: 'small', widget: pie('1a2b3c4d-0000-4000-8000-000000000006'), larger_view: pie('1a2b3c4d-0000-4000-8000-000000000007', { render: { radius: 7 } }) },
    ]));
    expect(result.ok && [...result.failed.keys()]).toEqual([slotOf(0, 'larger_view')]);
  });

  it('fails the dashboard for an embedded widget with no id', () => {
    const { types } = loaded();
    const { id: _, ...noId } = pie('1a2b3c4d-0000-4000-8000-000000000008');
    expect(registerDashboard(types, dashboardOf([{ size: 'small', widget: noId }])).ok).toBe(false);
  });

  it('fails the dashboard for a widget that also breaks the open widget base', () => {
    const { types } = loaded();
    const broken = pie('1a2b3c4d-0000-4000-8000-000000000009', { title: 7 });
    expect(registerDashboard(types, dashboardOf([{ size: 'small', widget: broken }])).ok).toBe(false);
  });

  it('fails the dashboard for a cell that breaks the layout schema', () => {
    const { types } = loaded();
    expect(registerDashboard(types, dashboardOf([{ size: 'huge', widget: pie('1a2b3c4d-0000-4000-8000-00000000000a') }])).ok).toBe(false);
  });
});

describe('the served file', () => {
  it('is rejected as a whole when a served type reuses a bundle base id', () => {
    const clash = { $id: 'gts://gts.frontx.dashboard.widget.widget.v1~', $schema: 'https://json-schema.org/draft/2020-12/schema', type: 'object' };
    const { types, outcome } = loaded({ ...DEMO_SERVED_FILE, types: [clash, ...DEMO_SERVED_FILE.types] });
    expect(outcome).toMatchObject({ ok: false });
    // Nothing of the file registered.
    expect(types.getSchema(PIE)).toBeUndefined();
  });

  it('fails every dashboard when the registry rejects an entry', () => {
    const entry = DEMO_SERVED_FILE.instances.find((instance) => instance.id === PIE_ENTRY)!;
    const { outcome } = loaded({ ...DEMO_SERVED_FILE, instances: [...DEMO_SERVED_FILE.instances, { ...entry, id: `${PIE_ENTRY}_broken`, manifest: 'gts.frontx.mfes.mfe.mf_manifest.v1~nobody.v1' }] });
    expect(outcome.ok).toBe(false);
  });

  it('is rejected when it has no types and instances lists', () => {
    expect(loaded({} as ServedFile).outcome.ok).toBe(false);
  });
});

describe('effective traits', () => {
  it('merges the trait values along the type chain', () => {
    const { types } = loaded();
    expect(effectiveTraits(types, PIE)).toEqual({ entry: PIE_ENTRY, data_type: PIE_DATA });
  });

  it('fails for a type that is not registered', () => {
    const { types } = loaded();
    expect(() => effectiveTraits(types, PIE.replace('pie_chart.v1~', 'nothing.v1~'))).toThrow(/not registered/);
  });
});
