import { GtsPlugin, loadLifecycleStages } from '@gears-frontx/gts-plugin';
import { describe, expect, it, vi } from 'vitest';

import type { Dashboard, ServedFile } from '../contract';
import { IN_BUNDLE_PARTS } from '@gears-frontx/frontx-dashboard-widgets/testing';
import { STAND_IN, STAND_IN_TYPE_ID } from '../gts';
import CATALOG from '../../served/catalog.gts.json';
import { DEMO_DASHBOARD_ID, DEMO_SERVED_FILE as DEMO_WITHOUT_BUNDLES } from '../mock/mockHost';
import { composeServedFile } from './served';

/** The demo file with the catalog bundles' parts, as a product serves it. */
const DEMO_SERVED_FILE = composeServedFile(DEMO_WITHOUT_BUNDLES, IN_BUNDLE_PARTS);
import { effectiveTraits, registerBundle, registerDashboard, registerServedFile, slotOf } from './register';

// The registration order of DESIGN §3.6 step 4 and ADR-0003, on the real gts-plugin with reference lookup on.

const PIE = 'gts.frontx.dashboard.widget.widget.v1~frontx.dashboard.widget.data_widget.v1~frontx.dashboard.widget.pie_chart.v1~';
const PIE_ENTRY = 'gts.frontx.mfes.mfe.entry.v1~frontx.mfes.mfe.entry_mf.v1~frontx.dashboard.mfe.pie_chart.v1';
const PIE_DATA = 'gts.frontx.dashboard.widget_data.widget_data.v1~frontx.dashboard.widget_data.pie_chart.v1~';
const PIE_RENDER = 'gts.frontx.dashboard.widget.render.v1~frontx.dashboard.widget.pie_chart_render.v1~';
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

describe('dashboard variables at load', () => {
  const PERIOD = { title: 'Period', options: [{ value: '7d', label: 'Last 7 days' }, { value: '30d', label: 'Last 30 days' }], default: '30d' };
  const withVariable = (variable: Record<string, unknown>) => ({ ...dashboardOf([]), variables: { period: variable } }) as unknown as Dashboard;

  it('loads a dashboard whose variable default is one of its unique options', () => {
    expect(registerDashboard(loaded().types, withVariable(PERIOD))).toMatchObject({ ok: true, failed: new Map() });
  });

  it.each([
    ['a default outside its options', { ...PERIOD, default: '90d' }, 'the default 90d of the variable period is not one of its options'],
    ['repeated option values', { ...PERIOD, options: [...PERIOD.options, { value: '7d', label: 'One week' }] }, 'the variable period repeats the option value 7d'],
  ])('fails the whole load for %s, with the reason', (_name, variable, problem) => {
    expect(registerDashboard(loaded().types, withVariable(variable))).toEqual({ ok: false, problem });
  });

  it('registers none of the widgets of a dashboard its variables reject', () => {
    const { types } = loaded();
    const widget = pie('5f1e2d3c-4b5a-4968-8776-655443322110');
    const dashboard = { ...dashboardOf([{ size: 'small', widget }]), variables: { period: { ...PERIOD, options: [...PERIOD.options, { value: '7d', label: 'One week' }] } } } as unknown as Dashboard;
    expect(registerDashboard(types, dashboard)).toEqual({ ok: false, problem: 'the variable period repeats the option value 7d' });
    expect(types.validateInstance(widget.id)).toMatchObject({ valid: false });
    expect(types.validateInstance(DASHBOARD)).toMatchObject({ valid: false });
    // The same widget in a dashboard with valid variables is in the store, so the check above reads the store.
    expect(registerDashboard(types, { ...dashboard, variables: { period: PERIOD } } as unknown as Dashboard).ok).toBe(true);
    expect(types.validateInstance(widget.id)).toMatchObject({ valid: true });
  });
});

describe('registration order under reference lookup', () => {
  it('registers the catalog and the demo dashboard with no failed cell', () => {
    const { types, outcome } = loaded();
    expect(outcome.ok).toBe(true);
    const dashboard = outcome.ok ? outcome.dashboards.get(DEMO_DASHBOARD_ID) : undefined;
    expect(dashboard).toBeDefined();
    const result = registerDashboard(types, dashboard!);
    expect(result).toMatchObject({ ok: true, failed: new Map() });
    // The cells run copies of what was served, equal in content.
    expect(result.ok && result.dashboard).toEqual(dashboard);
    expect(result.ok && result.dashboard.layout.cells[0].widget).not.toBe(dashboard!.layout.cells[0].widget);
  });

  // A widget that fails its own type stays a failure of its own cell. Every shipped widget type closes its
  // render object: each row takes a valid widget of that type from the demo dashboards and changes its render.
  const shipped = CATALOG.types.map((type) => String(type.$id).replace(/^gts:\/\//, '')).filter((id) => id.startsWith('gts.frontx.dashboard.widget.widget.v1~'));
  const demoWidgets = DEMO_WITHOUT_BUNDLES.instances.flatMap((item) =>
    ((item as { layout?: { cells?: Array<{ widget?: { id: string; render: Record<string, unknown> } }> } }).layout?.cells ?? []).flatMap((c) => (c.widget ? [c.widget] : [])),
  );
  // The fields and required fields each render type of the catalog declares, read from its own allOf part.
  const renderTypes = new Map(
    CATALOG.types
      .filter((type) => /_render\.v1~$/.test(String(type.$id)))
      .map((type) => {
        const own = ((type as { allOf?: Array<{ properties?: Record<string, unknown>; required?: string[] }> }).allOf ?? []).find((part) => part.properties) ?? {};
        return [/\.([a-z_]+)_render\.v1~$/.exec(String(type.$id))![1], { fields: Object.keys(own.properties ?? {}), required: own.required ?? [] }] as const;
      }),
  );
  it('finds the nine shipped widget types and their nine render types in the catalog, so the table below is not empty', () => {
    expect(shipped).toHaveLength(9);
    expect([...renderTypes.keys()].sort()).toEqual(shipped.map((type) => /\.([a-z_]+)\.v1~$/.exec(type)![1]).sort());
  });
  // Pinned on purpose: the required render fields are the published render contract (ADR-0009), so the rows
  // derived from them below cannot lose a rule silently. Read from the type's top level and every allOf part
  // but the $ref to the render base, so the reading does not depend on which part carries `required`.
  it('ships the pinned required fields of each render type', () => {
    type Part = { $ref?: string; required?: string[] };
    const required = Object.fromEntries(
      CATALOG.types
        .filter((type) => /_render\.v1~$/.test(String(type.$id)))
        .map((type) => {
          const parts = [type as Part, ...((type as { allOf?: Part[] }).allOf ?? []).filter((part) => !part.$ref)];
          return [/\.([a-z_]+)_render\.v1~$/.exec(String(type.$id))![1], parts.flatMap((part) => part.required ?? []).sort()];
        }),
    );
    expect(required).toEqual({
      summary_card: [],
      metric_card: [],
      ranked_list_card: [],
      progress_list_card: [],
      grid: ['columns'],
      cartesian_chart: [],
      pie_chart: [],
      heatmap: [],
      markdown_card: ['body'],
    });
  });
  // One declared render field per type, with a value of the wrong type.
  const wrongValue: Record<string, Record<string, unknown>> = {
    metric_card: { value_label: 5 },
    ranked_list_card: { secondary_label: 5 },
    grid: { columns: 'key' },
    cartesian_chart: { drill_down: 'yes' },
    pie_chart: { radius: '50%' },
    heatmap: { show_cell_values: 'yes' },
    markdown_card: { body: 5 },
  };
  it('has a wrong value for every render type that declares a field, and for no other', () => {
    const missing = [...renderTypes].filter(([name, { fields }]) => fields.length > 0 && !wrongValue[name]).map(([name]) => name);
    expect(missing, `render types that declare fields but have no wrongValue entry: ${missing.join(', ')}`).toEqual([]);
    const stale = Object.entries(wrongValue).filter(([name, wrong]) => !renderTypes.get(name)?.fields.includes(Object.keys(wrong)[0])).map(([name]) => name);
    expect(stale, `wrongValue entries whose field their render type does not declare: ${stale.join(', ')}`).toEqual([]);
  });
  type Change = (render: Record<string, unknown>) => Record<string, unknown>;
  const cases = shipped.flatMap((type) => {
    const name = /\.([a-z_]+)\.v1~$/.exec(type)![1];
    const wrong = wrongValue[name];
    const required = renderTypes.get(name)?.required ?? [];
    const field = wrong && Object.keys(wrong)[0];
    return [
      [`${name} with an extra render field`, type, ((render) => ({ ...render, not_a_field: 1 })) as Change, /\/render Invalid unevaluated property `#\/render\/not_a_field`/] as const,
      // Anchored to the type error, so an unevaluated-property error on the same field does not match.
      ...(wrong ? [[`${name} with a render field of the wrong type`, type, ((render) => ({ ...render, ...wrong })) as Change, new RegExp(`/render/${field} is not of type `)] as const] : []),
      ...required.map(
        (missing) =>
          [
            `${name} without its required render field ${missing}`,
            type,
            ((render) => Object.fromEntries(Object.entries(render).filter(([key]) => key !== missing))) as Change,
            new RegExp(`/render must have required property '${missing}'`),
          ] as const,
      ),
    ];
  });
  it.each(cases)('keeps a widget failing its own render type a failure of its own cell: %s', (_name, type, change, reason) => {
    const valid = demoWidgets.find((widget) => widget.id.startsWith(type) && /^[0-9a-f-]{36}$/.test(widget.id.slice(type.length)));
    expect(valid).toBeDefined();
    const { types } = loaded();
    const result = registerDashboard(types, dashboardOf([
      { size: 'small', widget: valid },
      // Its own id, so the failure is its own type check, not a repeated id.
      { size: 'small', widget: { ...valid, id: `${type}1a2b3c4d-0000-4000-8000-00000000000d`, render: change(valid!.render) } },
    ]));
    expect(result.ok).toBe(true);
    expect(result.ok && [...result.failed.keys()]).toEqual([slotOf(1, 'cell')]);
    expect(result.ok && result.failed.get(slotOf(1, 'cell'))).toMatch(reason);
  });

  it('keeps a data widget with a wrong value_format a failure of its own cell', () => {
    const { types } = loaded();
    const wrong = pie('1a2b3c4d-0000-4000-8000-00000000000f', { value_format: { value_type: 'money' } });
    const result = registerDashboard(types, dashboardOf([{ size: 'small', widget: pie('1a2b3c4d-0000-4000-8000-00000000000e') }, { size: 'small', widget: wrong }]));
    expect(result.ok && [...result.failed.keys()]).toEqual([slotOf(1, 'cell')]);
    expect(result.ok && result.failed.get(slotOf(1, 'cell'))).toMatch(/\/value_format\/value_type/);
  });

  it('accepts a metric_card render with better neutral, and fails one with a direction outside the catalog values', () => {
    const type = shipped.find((id) => id.endsWith('.metric_card.v1~'))!;
    const metric = demoWidgets.find((widget) => widget.id.startsWith(type))!;
    const { types } = loaded();
    const result = registerDashboard(types, dashboardOf([
      { size: 'small', widget: { ...metric, id: `${type}1a2b3c4d-0000-4000-8000-000000000010`, render: { ...metric.render, better: 'neutral' } } },
      { size: 'small', widget: { ...metric, id: `${type}1a2b3c4d-0000-4000-8000-000000000011`, render: { ...metric.render, better: 'sideways' } } },
    ]));
    expect(result.ok && [...result.failed.keys()]).toEqual([slotOf(1, 'cell')]);
    expect(result.ok && result.failed.get(slotOf(1, 'cell'))).toMatch(/\/render\/better/);
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

  it('keeps a type whose render type is not registered a failure of the cells that use it', () => {
    const dangling = structuredClone(DEMO_SERVED_FILE.types.find((type) => String(type.$id).endsWith('pie_chart.v1~') && String(type.$id).includes('.widget.'))!) as {
      $id: string;
      allOf: Array<{ properties?: { render?: { $ref: string } } }>;
    };
    dangling.$id = `gts://${PIE.replace('pie_chart.v1~', 'pie_chart_r.v1~')}`;
    // A valid render type id that nothing registers.
    dangling.allOf.find((part) => part.properties?.render)!.properties!.render!.$ref = 'gts://gts.frontx.dashboard.widget.render.v1~frontx.dashboard.widget.pie_chart_missing_render.v1~';
    const { types, outcome } = loaded({ ...DEMO_SERVED_FILE, types: [...DEMO_SERVED_FILE.types, dangling] });
    // The served type itself registers: its render reference is resolved when an instance of it registers.
    expect(outcome.ok).toBe(true);
    const widget = { ...pie('1a2b3c4d-0000-4000-8000-000000000010'), id: `${PIE.replace('pie_chart.v1~', 'pie_chart_r.v1~')}1a2b3c4d-0000-4000-8000-000000000010` };
    const result = registerDashboard(types, dashboardOf([{ size: 'small', widget: pie('1a2b3c4d-0000-4000-8000-000000000011') }, { size: 'small', widget }]));
    // Only the cell of that type fails; the other cell registers.
    expect(result.ok && [...result.failed.keys()]).toEqual([slotOf(1, 'cell')]);
    expect(result.ok && result.failed.get(slotOf(1, 'cell'))).toMatch(/Could not resolve \$ref '[^']*pie_chart_missing_render\.v1~'/);
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

  const throwing = (target: Record<string, unknown>, field: string) =>
    Object.defineProperty(target, field, { enumerable: true, get: () => { throw new Error('getter boom'); } });

  // A widget from an in-code host is read once, as a JSON copy: a getter that throws anywhere in it fails its slot only.
  it.each([
    ['the render', (widget: Record<string, unknown>) => throwing(widget, 'render')],
    ['the data', (widget: Record<string, unknown>) => throwing(widget, 'data')],
    ['the title', (widget: Record<string, unknown>) => throwing(widget, 'title')],
    ['the render id inside the render', (widget: Record<string, unknown>) => throwing(widget.render as Record<string, unknown>, 'id')],
    ['a render field inside the render', (widget: Record<string, unknown>) => throwing(widget.render as Record<string, unknown>, 'value_label')],
  ])('keeps a widget whose getter on %s throws a failure of its slot only', (_name, breakIt) => {
    const { types } = loaded();
    const broken = pie('1a2b3c4d-0000-4000-8000-000000000013', { render: { legend_position: 'bottom' } });
    breakIt(broken);
    const larger = pie('1a2b3c4d-0000-4000-8000-000000000014');
    breakIt(larger);
    const result = registerDashboard(types, dashboardOf([
      { size: 'small', widget: pie('1a2b3c4d-0000-4000-8000-000000000012') },
      { size: 'small', widget: broken },
      { size: 'small', widget: pie('1a2b3c4d-0000-4000-8000-000000000015'), larger_view: larger },
    ]));
    expect(result.ok).toBe(true);
    expect(result.ok && Object.fromEntries(result.failed)).toEqual({
      [slotOf(1, 'cell')]: 'the widget cannot be read: getter boom',
      [slotOf(2, 'larger_view')]: 'the widget cannot be read: getter boom',
    });
    // The neighbours are in the store as delivered.
    for (const uuid of ['012', '015']) expect(types.validateInstance(`${PIE}1a2b3c4d-0000-4000-8000-000000000${uuid}`).valid).toBe(true);
    // The cells run the copies: the failed slots hold a minimal stand-in, the neighbours plain copies.
    const cells = result.ok ? result.dashboard.layout.cells : [];
    expect(cells[1].widget).toEqual({ id: expect.stringMatching(new RegExp(`^${STAND_IN_TYPE_ID.replace(/[.~]/g, '\\$&')}`)), render: {} });
    expect(cells[2].larger_view).toEqual({ id: expect.stringMatching(new RegExp(`^${STAND_IN_TYPE_ID.replace(/[.~]/g, '\\$&')}`)), render: {} });
    expect(cells[0].widget).toEqual(pie('1a2b3c4d-0000-4000-8000-000000000012'));
  });

  it('gives a widget whose id getter throws a stand-in from its place, and fails only its slot', () => {
    const { types } = loaded();
    const result = registerDashboard(types, dashboardOf([
      { size: 'small', widget: pie('1a2b3c4d-0000-4000-8000-000000000016') },
      { size: 'small', widget: throwing({ title: 'Pie', render: {} }, 'id') },
    ]));
    expect(result.ok && Object.fromEntries(result.failed)).toEqual({ [slotOf(1, 'cell')]: 'the widget cannot be read: getter boom' });
  });

  it('leaves an array of variables to the type, which fails the load', () => {
    const result = registerDashboard(loaded().types, { ...dashboardOf([]), variables: [{ options: [{ value: 'a' }, { value: 'a' }], default: 'a' }] } as unknown as Dashboard);
    expect(result.ok).toBe(false);
    expect(!result.ok && result.problem).toMatch(/^the dashboard fails its type: /);
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
    const broken = { ...entry, id: PIE_ENTRY.replace('pie_chart.v1', 'pie_chart_b.v1'), manifest: 'gts.frontx.mfes.mfe.mf_manifest.v1~frontx.test.mfe.none.v1' };
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
    expect(lines[0]).toMatch(new RegExp(`the widget part "${PIE_MANIFEST.replace(/[.~]/g, '\\$&')}" is left out: .+`));
    const result = registerDashboard(types, demoDashboard(), outcome.ok ? outcome.rejected : undefined);
    expect(pieSlots().length).toBeGreaterThan(0);
    expect(result.ok && [...result.failed.keys()]).toEqual(pieSlots());
    expect(result.ok && result.failed.get(pieSlots()[0])).toMatch(/widget part .*pie_chart.* is left out/);
  });

  it('leaves out a part whose entry the registry rejects even when its manifest already registered', () => {
    const pie = bundlePart('pie_chart');
    const broken = { ...pie, instances: pie.instances.map((instance) => (instance.id === PIE_ENTRY ? { ...instance, manifest: 'gts.frontx.mfes.mfe.mf_manifest.v1~frontx.test.mfe.none.v1' } : instance)) };
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
    const dataType = { $id: 'gts://gts.frontx.dashboard.widget_data.widget_data.v1~frontx.test.widget_data.shared.v1~', $schema: 'https://json-schema.org/draft/2020-12/schema', type: 'object', allOf: [{ $ref: 'gts://gts.frontx.dashboard.widget_data.widget_data.v1~' }] };
    const changed = { ...dataType, required: ['value'] };
    const pie = bundlePart('pie_chart');
    const metric = bundlePart('metric_card');
    const rest = others.filter((instance) => !String(instance.id).endsWith('.metric_card.v1'));
    // Built apart, the same type can carry its keys in another order: it is still the same type.
    const reordered = Object.fromEntries(Object.entries(dataType).reverse());
    const alike = loadedParts([DEMO_WITHOUT_BUNDLES, { types: [], instances: rest }, { ...metric, types: [dataType] }, { ...pie, types: [reordered] }]);
    expect(alike.lines).toEqual([]);
    expect(alike.outcome.ok && alike.outcome.rejected.size).toBe(0);
    const differing = loadedParts([DEMO_WITHOUT_BUNDLES, { types: [], instances: rest }, { ...metric, types: [dataType] }, { ...pie, types: [changed] }]);
    expect(differing.lines).toHaveLength(1);
    expect(differing.lines[0]).toMatch(/pie_chart.* is left out: .*frontx\.test\.widget_data\.shared\.v1~ .*already/);
    // The first definition stands; only the later part's cells fail.
    expect(differing.types.getSchema('gts.frontx.dashboard.widget_data.widget_data.v1~frontx.test.widget_data.shared.v1~')).toEqual(dataType);
    const result = registerDashboard(differing.types, demoDashboard(), differing.outcome.ok ? differing.outcome.rejected : undefined);
    expect(result.ok && [...result.failed.keys()]).toEqual(pieSlots());
  });

  it('still fails every dashboard when the first part, the base file, is rejected', () => {
    const clash = { $id: 'gts://gts.frontx.dashboard.widget.widget.v1~', $schema: 'https://json-schema.org/draft/2020-12/schema', type: 'object' };
    expect(loadedParts([{ ...DEMO_WITHOUT_BUNDLES, types: [clash, ...DEMO_WITHOUT_BUNDLES.types] }, IN_BUNDLE_PARTS]).outcome).toMatchObject({
      ok: false,
      problem: expect.stringMatching(/^the served file: its type gts\.frontx\.dashboard\.widget\.widget\.v1~ equals a bundle base/),
    });
  });

  describe('a part checked and applied whole', () => {
    const OWN_DASHBOARD = 'gts.frontx.dashboard.dashboard.dashboard.v1~5b1e2d3c-4a5f-4e6d-8c7b-9a0b1c2d3e4f';
    const ownDashboard = { ...demoDashboard(), id: OWN_DASHBOARD, title: 'Pie only' };
    const badInstance = { id: 'gts.frontx.mfes.mfe.entry.v1~frontx.mfes.mfe.entry_mf.v1~frontx.test.mfe.broken.v1', manifest: 7 };
    const pieType = () => DEMO_WITHOUT_BUNDLES.types.find((type) => String(type.$id) === `gts://${PIE}`)!;
    const dataType = { $id: 'gts://gts.frontx.dashboard.widget_data.widget_data.v1~frontx.test.widget_data.shared.v1~', $schema: 'https://json-schema.org/draft/2020-12/schema', type: 'object', allOf: [{ $ref: 'gts://gts.frontx.dashboard.widget_data.widget_data.v1~' }] };
    const failedSlots = (loadedFile: ReturnType<typeof loadedParts>) => {
      const result = registerDashboard(loadedFile.types, demoDashboard(), loadedFile.outcome.ok ? loadedFile.outcome.rejected : undefined);
      return result.ok ? [...result.failed.keys()] : result.problem;
    };

    it('loads the dashboard of a part that registers, and never the dashboard of a part it leaves out, wherever the failing item sits', () => {
      const pie = bundlePart('pie_chart');
      const healthy = loadedParts([DEMO_WITHOUT_BUNDLES, { types: [], instances: others }, { ...pie, instances: [...pie.instances, ownDashboard] }]);
      expect(healthy.outcome.ok && healthy.outcome.dashboards.has(OWN_DASHBOARD)).toBe(true);
      for (const instances of [[...pie.instances, ownDashboard, badInstance], [...pie.instances, badInstance, ownDashboard]]) {
        const { outcome, lines } = loadedParts([DEMO_WITHOUT_BUNDLES, { types: [], instances: others }, { ...pie, instances }]);
        expect(lines).toHaveLength(1);
        expect(outcome.ok && outcome.dashboards.has(OWN_DASHBOARD)).toBe(false);
      }
    });

    it('leaves out a part that brings a dashboard the base file already serves, and keeps the base dashboard', () => {
      const pie = bundlePart('pie_chart');
      const takeover = { ...demoDashboard(), title: 'Taken over' };
      const loadedFile = loadedParts([DEMO_WITHOUT_BUNDLES, { types: [], instances: others }, { ...pie, instances: [...pie.instances, takeover] }]);
      expect(loadedFile.lines).toEqual([expect.stringMatching(/pie_chart.* is left out: its dashboard .* is already served otherwise$/)]);
      expect(loadedFile.outcome.ok && loadedFile.outcome.dashboards.get(DEMO_DASHBOARD_ID)?.title).toBe(demoDashboard().title);
      expect(failedSlots(loadedFile)).toEqual(pieSlots());
    });

    it('takes a part that brings a dashboard the base file already serves with the same content, keys in any order', () => {
      const pie = bundlePart('pie_chart');
      const alike = Object.fromEntries(Object.entries(demoDashboard()).reverse());
      const loadedFile = loadedParts([DEMO_WITHOUT_BUNDLES, { types: [], instances: others }, { ...pie, instances: [...pie.instances, alike] }]);
      expect(loadedFile.lines).toEqual([]);
      expect(loadedFile.outcome.ok && loadedFile.outcome.dashboards.get(DEMO_DASHBOARD_ID)).toEqual(demoDashboard());
      expect(failedSlots(loadedFile)).toEqual([]);
    });

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
      expect(loadedFile.types.getSchema('gts.frontx.dashboard.widget_data.widget_data.v1~frontx.test.widget_data.shared.v1~')).toEqual(changed);
      // Only the left-out part's cells fail; the later part that brings the type otherwise registers.
      expect(slotsOf('metric_card').length).toBeGreaterThan(0);
      expect(failedSlots(loadedFile)).toEqual(slotsOf('metric_card'));
    });

    it('keeps in the store the types a part registered before the registry rejected it, so a later part that brings one otherwise is left out too', () => {
      // The documented limit (DESIGN §3.6 step 4): the type store cannot take back a registration.
      const bad = { $id: 'gts://not a type id', $schema: 'https://json-schema.org/draft/2020-12/schema', type: 'object' };
      const metric = bundlePart('metric_card');
      const rest = others.filter((instance) => !String(instance.id).endsWith('.metric_card.v1'));
      const changed = { ...dataType, required: ['value'] };
      const loadedFile = loadedParts([DEMO_WITHOUT_BUNDLES, { types: [], instances: rest }, { ...metric, types: [dataType, bad] }, { ...bundlePart('pie_chart'), types: [changed] }]);
      expect(loadedFile.lines).toEqual([
        expect.stringMatching(/metric_card.* is left out: the registry rejected it: /),
        expect.stringMatching(/pie_chart.* is left out: its type .*frontx\.test\.widget_data\.shared\.v1~ is already defined otherwise$/),
      ]);
      expect(loadedFile.types.getSchema('gts.frontx.dashboard.widget_data.widget_data.v1~frontx.test.widget_data.shared.v1~')).toEqual(dataType);
      expect([...(failedSlots(loadedFile) as string[])].sort()).toEqual([...slotsOf('metric_card'), ...slotsOf('pie_chart')].sort());
    });

    it('fails no cell of a healthy part through an entry a rejected part brings alike', () => {
      const pie = bundlePart('pie_chart');
      const entry = pie.instances.find((instance) => instance.id === PIE_ENTRY)!;
      const loadedFile = loadedParts([DEMO_WITHOUT_BUNDLES, { types: [], instances: others }, pie, { types: [{ ...pieType(), description: 'otherwise' }], instances: [{ ...entry }] }]);
      expect(loadedFile.lines).toHaveLength(1);
      expect(loadedFile.outcome.ok && [...loadedFile.outcome.rejected.keys()]).toEqual([]);
      expect(failedSlots(loadedFile)).toEqual([]);
    });

    it('leaves out a part that brings an entry a healthy part registered otherwise, and keeps the healthy entry', () => {
      const pie = bundlePart('pie_chart');
      const entry = pie.instances.find((instance) => instance.id === PIE_ENTRY)!;
      const copied = { ...entry, manifest: 'gts.frontx.mfes.mfe.mf_manifest.v1~frontx.dashboard.widgets.metric_card.v1' };
      const loadedFile = loadedParts([DEMO_WITHOUT_BUNDLES, { types: [], instances: others }, pie, { types: [], instances: [copied] }]);
      expect(loadedFile.lines).toEqual([expect.stringMatching(/part number 4 of the answer \(the served file is number 1\) is left out: its instance .*pie_chart\.v1 is already registered otherwise$/)]);
      expect(loadedFile.outcome.ok && loadedFile.outcome.rejected.size).toBe(0);
      expect(failedSlots(loadedFile)).toEqual([]);
    });

    it('leaves out a part that brings one manifest, entry or dashboard id twice with other content, and takes one that brings it twice alike', () => {
      const pie = bundlePart('pie_chart');
      const manifest = pie.instances.find((instance) => instance.id === PIE_MANIFEST)!;
      const entry = pie.instances.find((instance) => instance.id === PIE_ENTRY)!;
      for (const [record, change] of [[manifest, { name: 'otherwise' }], [entry, { exposedModule: './otherwise' }], [ownDashboard, { title: 'Otherwise' }]] as const) {
        const what = String(record.id).startsWith('gts.frontx.dashboard.dashboard.') ? 'dashboard' : 'instance';
        const twice = loadedParts([DEMO_WITHOUT_BUNDLES, { types: [], instances: others }, { ...pie, instances: [...pie.instances, ownDashboard, { ...record, ...change }] }]);
        expect(twice.lines).toEqual([expect.stringMatching(new RegExp(`pie_chart.* is left out: its ${what} ${String(record.id).replace(/[.~]/g, '\\$&')} comes twice, the second otherwise$`))]);
        expect(twice.outcome.ok && twice.outcome.dashboards.has(OWN_DASHBOARD)).toBe(false);
        expect(failedSlots(twice)).toEqual(pieSlots());
        const alike = loadedParts([DEMO_WITHOUT_BUNDLES, { types: [], instances: others }, { ...pie, instances: [...pie.instances, ownDashboard, Object.fromEntries(Object.entries(record).reverse())] }]);
        expect(alike.lines).toEqual([]);
        expect(failedSlots(alike)).toEqual([]);
      }
    });

    it('fails every dashboard when the base file brings one dashboard id twice with other content', () => {
      const { outcome } = loadedParts([{ ...DEMO_WITHOUT_BUNDLES, instances: [...DEMO_WITHOUT_BUNDLES.instances, { ...demoDashboard(), title: 'Otherwise' }] }, IN_BUNDLE_PARTS]);
      expect(outcome).toMatchObject({ ok: false, problem: expect.stringMatching(/^the served file: its dashboard .* comes twice, the second otherwise$/) });
    });

    it('leaves two records with no id to the registry, so the part line names its own reason, not a repeated id', () => {
      const pie = bundlePart('pie_chart');
      const { lines } = loadedParts([DEMO_WITHOUT_BUNDLES, { types: [], instances: others }, { ...pie, instances: [...pie.instances, { name: 'one' }, { name: 'two' }] }]);
      expect(lines).toEqual([expect.stringMatching(/pie_chart.* is left out: /)]);
      expect(lines[0]).not.toMatch(/comes twice/);
    });

    it('fails no cell of a later healthy part through what an earlier rejected part left behind', () => {
      const pie = bundlePart('pie_chart');
      const broken = { ...pie, instances: pie.instances.map((instance) => (instance.id === PIE_ENTRY ? { ...instance, manifest: 'gts.frontx.mfes.mfe.mf_manifest.v1~frontx.test.mfe.none.v1' } : instance)) };
      const loadedFile = loadedParts([DEMO_WITHOUT_BUNDLES, { types: [], instances: others }, broken, pie]);
      expect(loadedFile.lines).toHaveLength(1);
      expect(loadedFile.outcome.ok && loadedFile.outcome.rejected.size).toBe(0);
      expect(failedSlots(loadedFile)).toEqual([]);
    });

    it.each([
      ['the stand-in manifest', STAND_IN.instances[0], { name: 'taken_over' }],
      ['the stand-in entry', STAND_IN.instances[1], { exposedModule: './taken_over' }],
      ['a lifecycle stage of the plugin', loadLifecycleStages()[0] as unknown as Record<string, unknown>, { description: 'otherwise' }],
    ])('leaves out a part that brings %s otherwise, and takes one that brings it alike', (_name, record, change) => {
      const pie = bundlePart('pie_chart');
      const otherwise = loadedParts([DEMO_WITHOUT_BUNDLES, { types: [], instances: others }, { ...pie, instances: [...pie.instances, { ...record, ...change }] }]);
      expect(otherwise.lines).toEqual([expect.stringMatching(new RegExp(`is left out: its instance ${String(record.id).replace(/[.~]/g, '\\$&')} is already registered otherwise$`))]);
      expect(failedSlots(otherwise)).toEqual(pieSlots());
      const alike = loadedParts([DEMO_WITHOUT_BUNDLES, { types: [], instances: others }, { ...pie, instances: [...pie.instances, { ...record }] }]);
      expect(alike.lines).toEqual([]);
      expect(failedSlots(alike)).toEqual([]);
    });

    it.each([
      // An in-code host can answer what JSON never carries: the content check of a held id cannot serialize it.
      ['a BigInt field on a held instance id', () => ({ ...STAND_IN.instances[0], size: 1n })],
      ['an instance whose id cannot be read', () => Object.defineProperty({}, 'id', { enumerable: true, get: () => { throw new Error('unreadable'); } })],
    ])('leaves out a part that throws on %s with its one line, and keeps the other parts', (_name, record) => {
      const pie = bundlePart('pie_chart');
      const loadedFile = loadedParts([DEMO_WITHOUT_BUNDLES, { types: [], instances: others }, { ...pie, instances: [...pie.instances, record()] }]);
      expect(loadedFile.outcome.ok).toBe(true);
      expect(loadedFile.lines).toEqual([expect.stringMatching(/^\[dashboard\] the widget part .+ is left out: it cannot be read: /)]);
      expect(failedSlots(loadedFile)).toEqual(pieSlots());
    });

    it('fails every dashboard, not the caller, when the base file throws on read', () => {
      const unreadable = Object.defineProperty({}, 'id', { enumerable: true, get: () => { throw new Error('unreadable'); } });
      const { outcome } = loadedParts([{ ...DEMO_WITHOUT_BUNDLES, instances: [...DEMO_WITHOUT_BUNDLES.instances, unreadable] }, IN_BUNDLE_PARTS]);
      expect(outcome).toMatchObject({ ok: false, problem: expect.stringMatching(/^the served file: .*unreadable/) });
    });

    it('quotes and caps the part name in its console line', () => {
      const pie = bundlePart('pie_chart');
      const long = `${'gts.frontx.mfes.mfe.mf_manifest.v1~'}frontx.test.widgets.${'x'.repeat(300)}\n[dashboard] forged.v1`;
      const { lines } = loadedParts([DEMO_WITHOUT_BUNDLES, { types: [], instances: others }, { ...pie, instances: [...pie.instances, { id: long, name: 7 }] }]);
      expect(lines).toHaveLength(1);
      expect(lines[0]).not.toContain('\n');
      expect(lines[0]).toMatch(/^\[dashboard\] the widget part "gts\.frontx\.mfes\.mfe\.mf_manifest\.v1~frontx\.dashboard\.widgets\.pie_chart\.v1, .*\.\.\." is left out: /);
      expect(lines[0].indexOf(' is left out')).toBeLessThan(240);
    });

    it('escapes every line break and control character a part id brings into its console line, in the name and in the reason', () => {
      const id = 'gts.frontx.mfes.mfe.mf_manifest.v1~frontx.test.widgets.a\u2028b\u2029c\u0085d\u007fe\u009bf\u0000g\rh.v1';
      const { lines } = loadedParts([DEMO_WITHOUT_BUNDLES, { types: [], instances: others }, { types: [], instances: [{ id, name: 7 }] }]);
      expect(lines).toHaveLength(1);
      expect(lines[0]).toContain('frontx.test.widgets.a\\u2028b\\u2029c\\u0085d\\u007fe\\u009bf\\u0000g\\rh.v1" is left out');
      expect(lines[0]).not.toMatch(/[\u0000-\u001f\u007f-\u009f\u2028\u2029]/);
    });
  });
});

describe('effective traits', () => {
  it('merges the trait values along the type chain', () => {
    const { types } = loaded();
    expect(effectiveTraits(types, PIE)).toEqual({ entry: PIE_ENTRY, data_type: PIE_DATA, render_type: PIE_RENDER });
  });

  it('fails for a type that is not registered', () => {
    const { types } = loaded();
    expect(() => effectiveTraits(types, PIE.replace('pie_chart.v1~', 'nothing.v1~'))).toThrow(/not registered/);
  });
});
