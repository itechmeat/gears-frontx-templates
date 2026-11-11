import { GtsPlugin } from '@gears-frontx/gts-plugin';
import { describe, expect, it, vi } from 'vitest';

import type { Dashboard, ServedFile } from '../contract';
import { IN_BUNDLE_PARTS } from '@gears-frontx/frontx-dashboard-widgets/testing';
import { DEMO_DASHBOARD_ID, DEMO_SERVED_FILE as DEMO_WITHOUT_BUNDLES } from '../mock/mockHost';
import { composeServedFile } from './served';

/** The demo file with the catalog bundles' parts, as a product serves it. */
const DEMO_SERVED_FILE = composeServedFile(DEMO_WITHOUT_BUNDLES, IN_BUNDLE_PARTS);
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
    // A valid entry id that nothing registers.
    dangling['x-gts-traits'] = { entry: PIE_ENTRY.replace('pie_chart.v1', 'pie_chart_missing.v1'), data_type: PIE_DATA };
    const { types, outcome } = loaded({ ...DEMO_SERVED_FILE, types: [...DEMO_SERVED_FILE.types, dangling] });
    // The served type itself registers: its trait value is checked when an instance of it registers.
    expect(outcome.ok).toBe(true);
    const widget = { ...pie('1a2b3c4d-0000-4000-8000-000000000005'), id: `${PIE.replace('pie_chart.v1~', 'pie_chart_x.v1~')}1a2b3c4d-0000-4000-8000-000000000005` };
    const result = registerDashboard(types, dashboardOf([{ size: 'small', widget }]));
    expect(result.ok && [...result.failed.keys()]).toEqual([slotOf(0, 'cell')]);
    expect(result.ok && result.failed.get(slotOf(0, 'cell'))).toMatch(/pie_chart_missing\.v1.*not found|not found.*pie_chart_missing\.v1/);
  });

  it('keeps a type whose data_type is not registered a failure of the cells that use it', () => {
    const dangling = { ...(DEMO_SERVED_FILE.types.find((type) => String(type.$id).endsWith('pie_chart.v1~') && String(type.$id).includes('.widget.'))!) };
    dangling.$id = `gts://${PIE.replace('pie_chart.v1~', 'pie_chart_y.v1~')}`;
    // A valid widget_data type id that nothing registers.
    dangling['x-gts-traits'] = { entry: PIE_ENTRY, data_type: PIE_DATA.replace('pie_chart.v1~', 'pie_chart_missing.v1~') };
    const { types, outcome } = loaded({ ...DEMO_SERVED_FILE, types: [...DEMO_SERVED_FILE.types, dangling] });
    expect(outcome.ok).toBe(true);
    const widget = { ...pie('1a2b3c4d-0000-4000-8000-00000000000b'), id: `${PIE.replace('pie_chart.v1~', 'pie_chart_y.v1~')}1a2b3c4d-0000-4000-8000-00000000000b` };
    const result = registerDashboard(types, dashboardOf([{ size: 'small', widget: pie('1a2b3c4d-0000-4000-8000-00000000000c') }, { size: 'small', widget }]));
    // Only the dangling cell fails; the other cell registers.
    expect(result.ok && [...result.failed.keys()]).toEqual([slotOf(1, 'cell')]);
    expect(result.ok && result.failed.get(slotOf(1, 'cell'))).toMatch(/pie_chart_missing\.v1.*not found|not found.*pie_chart_missing\.v1/);
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

  it.each([
    ['no layout', undefined],
    ['cells that are not a list', { cells: 'none' }],
    ['no cells', {}],
  ])('fails the dashboard with %s instead of repairing it', (_name, layout) => {
    const { types } = loaded();
    expect(registerDashboard(types, { id: DASHBOARD, title: 'Broken', layout } as unknown as Dashboard).ok).toBe(false);
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
    // A valid entry id whose manifest, a valid id too, is not registered.
    const broken = { ...entry, id: PIE_ENTRY.replace('pie_chart.v1', 'pie_chart_b.v1'), manifest: 'gts.frontx.mfes.mfe.mf_manifest.v1~nobody.dash.mfe.none.v1' };
    const { outcome } = loaded({ ...DEMO_SERVED_FILE, instances: [...DEMO_SERVED_FILE.instances, broken] });
    expect(outcome).toMatchObject({ ok: false, problem: expect.stringMatching(/not found/) });
  });

  it('is rejected when it has no types and instances lists', () => {
    expect(loaded({} as ServedFile).outcome.ok).toBe(false);
  });

  it('is rejected, not thrown, when an entry is not an object', () => {
    expect(loaded({ types: [null], instances: [] } as unknown as ServedFile).outcome).toMatchObject({ ok: false, problem: expect.stringMatching(/not an object/) });
  });
});

describe('the served file in parts', () => {
  const PIE_MANIFEST = 'gts.frontx.mfes.mfe.mf_manifest.v1~frontx.dashboard.widgets.pie_chart.v1';
  /** One catalog bundle's part: its manifest and entry from the in-bundle parts. */
  const bundlePart = (widget: string): ServedFile => ({ types: [], instances: IN_BUNDLE_PARTS.instances.filter((instance) => String(instance.id).endsWith(`.${widget}.v1`)) });
  const others = IN_BUNDLE_PARTS.instances.filter((instance) => !String(instance.id).endsWith('.pie_chart.v1'));
  const demoDashboard = () => DEMO_WITHOUT_BUNDLES.instances.find((instance) => instance.id === DEMO_DASHBOARD_ID) as unknown as Dashboard;
  const slotsOf = (widget: string) =>
    demoDashboard().layout.cells.flatMap((cell, index) => [
      ...(cell.widget.id.includes(`.${widget}.`) ? [slotOf(index, 'cell')] : []),
      ...(cell.larger_view?.id.includes(`.${widget}.`) ? [slotOf(index, 'larger_view')] : []),
    ]);
  const pieSlots = () => slotsOf('pie_chart');

  function loadedParts(parts: unknown[]) {
    const types = new GtsPlugin({ isolated: true });
    const errors = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const outcome = registerServedFile(types, parts, registerBundle(types));
    const lines = errors.mock.calls.map(([line]) => String(line));
    errors.mockRestore();
    return { types, outcome, lines };
  }

  it('leaves out a part whose manifest the registry rejects, with one console line, and fails only the cells it serves', () => {
    const pie = bundlePart('pie_chart');
    const broken = { ...pie, instances: pie.instances.map((instance) => (instance.id === PIE_MANIFEST ? { ...instance, name: 7 } : instance)) };
    const { types, outcome, lines } = loadedParts([DEMO_WITHOUT_BUNDLES, { types: [], instances: others }, broken]);
    expect(outcome.ok).toBe(true);
    expect(lines).toHaveLength(1);
    expect(lines[0]).toMatch(new RegExp(`the widget part ${PIE_MANIFEST.replace(/[.~]/g, '\\$&')} is left out: .+`));
    const result = registerDashboard(types, demoDashboard(), outcome.ok ? outcome.rejected : undefined);
    expect(pieSlots().length).toBeGreaterThan(0);
    expect(result.ok && [...result.failed.keys()]).toEqual(pieSlots());
    expect(result.ok && result.failed.get(pieSlots()[0])).toMatch(/widget part .*pie_chart.* is left out/);
  });

  it('leaves out a part whose entry the registry rejects even when its manifest already registered', () => {
    const pie = bundlePart('pie_chart');
    const broken = { ...pie, instances: pie.instances.map((instance) => (instance.id === PIE_ENTRY ? { ...instance, manifest: 'gts.frontx.mfes.mfe.mf_manifest.v1~nobody.dash.mfe.none.v1' } : instance)) };
    const { types, outcome, lines } = loadedParts([DEMO_WITHOUT_BUNDLES, { types: [], instances: others }, broken]);
    expect(lines).toHaveLength(1);
    const result = registerDashboard(types, demoDashboard(), outcome.ok ? outcome.rejected : undefined);
    expect(result.ok && [...result.failed.keys()]).toEqual(pieSlots());
  });

  it('leaves out a part whose type the registry rejects', () => {
    const bad = { $id: 'gts://not a type id', $schema: 'https://json-schema.org/draft/2020-12/schema', type: 'object' };
    const { types, outcome, lines } = loadedParts([DEMO_WITHOUT_BUNDLES, { types: [], instances: others }, { ...bundlePart('pie_chart'), types: [bad] }]);
    expect(lines).toHaveLength(1);
    const result = registerDashboard(types, demoDashboard(), outcome.ok ? outcome.rejected : undefined);
    expect(result.ok && [...result.failed.keys()]).toEqual(pieSlots());
  });

  it('takes a data type that two parts bring alike from both, and leaves out the later part that brings it otherwise', () => {
    const dataType = { $id: 'gts://gts.frontx.dashboard.widget_data.widget_data.v1~acme.dash.widget_data.shared.v1~', $schema: 'https://json-schema.org/draft/2020-12/schema', type: 'object', allOf: [{ $ref: 'gts://gts.frontx.dashboard.widget_data.widget_data.v1~' }] };
    const changed = { ...dataType, required: ['value'] };
    const pie = bundlePart('pie_chart');
    const metric = bundlePart('metric_card');
    const rest = others.filter((instance) => !String(instance.id).endsWith('.metric_card.v1'));
    const alike = loadedParts([DEMO_WITHOUT_BUNDLES, { types: [], instances: rest }, { ...metric, types: [dataType] }, { ...pie, types: [dataType] }]);
    expect(alike.lines).toEqual([]);
    expect(alike.outcome.ok && alike.outcome.rejected.size).toBe(0);
    const differing = loadedParts([DEMO_WITHOUT_BUNDLES, { types: [], instances: rest }, { ...metric, types: [dataType] }, { ...pie, types: [changed] }]);
    expect(differing.lines).toHaveLength(1);
    expect(differing.lines[0]).toMatch(/pie_chart.* is left out: .*acme\.dash\.widget_data\.shared\.v1~ .*already/);
    // The first definition stands; only the later part's cells fail.
    expect(differing.types.getSchema('gts.frontx.dashboard.widget_data.widget_data.v1~acme.dash.widget_data.shared.v1~')).toEqual(dataType);
    const result = registerDashboard(differing.types, demoDashboard(), differing.outcome.ok ? differing.outcome.rejected : undefined);
    expect(result.ok && [...result.failed.keys()]).toEqual(pieSlots());
  });

  it('still fails every dashboard when the first part, the base file, is rejected', () => {
    const clash = { $id: 'gts://gts.frontx.dashboard.widget.widget.v1~', $schema: 'https://json-schema.org/draft/2020-12/schema', type: 'object' };
    expect(loadedParts([{ ...DEMO_WITHOUT_BUNDLES, types: [clash, ...DEMO_WITHOUT_BUNDLES.types] }, IN_BUNDLE_PARTS]).outcome).toMatchObject({ ok: false });
  });

  describe('a part checked and applied whole', () => {
    const pieType = () => DEMO_WITHOUT_BUNDLES.types.find((type) => String(type.$id) === `gts://${PIE}`)!;
    const dataType = { $id: 'gts://gts.frontx.dashboard.widget_data.widget_data.v1~acme.dash.widget_data.shared.v1~', $schema: 'https://json-schema.org/draft/2020-12/schema', type: 'object', allOf: [{ $ref: 'gts://gts.frontx.dashboard.widget_data.widget_data.v1~' }] };
    const failedSlots = (loadedFile: ReturnType<typeof loadedParts>) => {
      const result = registerDashboard(loadedFile.types, demoDashboard(), loadedFile.outcome.ok ? loadedFile.outcome.rejected : undefined);
      return result.ok ? [...result.failed.keys()] : result.problem;
    };

    it('registers nothing of a part whose type clashes, so a later part may bring its other types otherwise', () => {
      const metric = bundlePart('metric_card');
      const rest = others.filter((instance) => !String(instance.id).endsWith('.metric_card.v1'));
      const changed = { ...dataType, required: ['value'] };
      const loadedFile = loadedParts([
        DEMO_WITHOUT_BUNDLES,
        { types: [], instances: rest },
        // Its own new type first, then a catalog type it brings otherwise.
        { ...metric, types: [dataType, { ...pieType(), description: 'otherwise' }] },
        { ...bundlePart('pie_chart'), types: [changed] },
      ]);
      expect(loadedFile.lines).toEqual([expect.stringMatching(/metric_card.* is left out: its type .*pie_chart\.v1~ is already defined otherwise$/)]);
      expect(loadedFile.types.getSchema('gts.frontx.dashboard.widget_data.widget_data.v1~acme.dash.widget_data.shared.v1~')).toEqual(changed);
      // Only the left-out part's cells fail; the later part that brings the type otherwise registers.
      expect(slotsOf('metric_card').length).toBeGreaterThan(0);
      expect(failedSlots(loadedFile)).toEqual(slotsOf('metric_card'));
    });
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
