import { GtsPlugin, loadLifecycleStages } from '@gears-frontx/gts-plugin';
import { describe, expect, it, vi } from 'vitest';

import type { Dashboard, ServedFile } from '../contract';
import { BUNDLE_TYPES, IN_BUNDLE_PARTS } from '@gears-frontx/frontx-dashboard-widgets/testing';
import { STAND_IN, STAND_IN_TYPE_ID } from '../gts';
import { DEMO_DASHBOARD_ID, DEMO_SERVED_FILE as DEMO_WITHOUT_BUNDLES } from '../mock/mockHost';
import { composeServedFile } from './served';

/** The demo file with the catalog bundles' parts, as a product serves it. */
const DEMO_SERVED_FILE = composeServedFile(DEMO_WITHOUT_BUNDLES, IN_BUNDLE_PARTS);
import { effectiveTraits, registerBundle, registerDashboard, registerServedFile, renderTypeOf, slotOf } from './register';
import { uuidv5 } from './ids';

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

/**
 * A widget of one shipped type with one render field set, in a small cell: the type prefix, a demo widget, the field,
 * the uuid tail and the value. The tail is exactly two hex characters (`3${index}` over a list of at most 10 values),
 * as it completes the 12-character last group of the uuid.
 */
const withRender = (type: string, widget: { render: Record<string, unknown> }, field: string, uuid: string, value: unknown) => ({
  size: 'small',
  widget: { ...widget, id: `${type}1a2b3c4d-0000-4000-8000-0000000000${uuid}`, render: { ...widget.render, [field]: value } },
});

/** The problem the real store finds with a data instance of one data type, or null: the data type prefix and the uuid tail. */
const problemOfFor = (dataPrefix: string, uuid: string) => (data: Record<string, unknown>) => {
  const id = `${dataPrefix}1a2b3c4d-0000-4000-8000-0000000000${uuid}`;
  const { types } = loaded();
  try {
    types.register({ ...data, id });
  } catch (error) {
    return error instanceof Error ? error.message : String(error);
  }
  const { valid, errors } = types.validateInstance(id);
  return valid ? null : JSON.stringify(errors);
};

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
  const shipped = IN_BUNDLE_PARTS.types.map((type) => String(type.$id).replace(/^gts:\/\//, '')).filter((id) => id.startsWith('gts.frontx.dashboard.widget.widget.v1~'));
  const demoWidgets = DEMO_WITHOUT_BUNDLES.instances.flatMap((item) =>
    ((item as { layout?: { cells?: Array<{ widget?: { id: string; render: Record<string, unknown> } }> } }).layout?.cells ?? []).flatMap((c) => (c.widget ? [c.widget] : [])),
  );
  // The fields and required fields each render type of the catalog declares, read from its own allOf part.
  const renderTypes = new Map(
    IN_BUNDLE_PARTS.types
      .filter((type) => /_render\.v1~$/.test(String(type.$id)))
      .map((type) => {
        const own = ((type as { allOf?: Array<{ properties?: Record<string, unknown>; required?: string[] }> }).allOf ?? []).find((part) => part.properties) ?? {};
        return [/\.([a-z_]+)_render\.v1~$/.exec(String(type.$id))![1], { fields: Object.keys(own.properties ?? {}), required: own.required ?? [] }] as const;
      }),
  );
  it('finds the fifteen shipped widget types and their fifteen render types in the bundles, so the table below is not empty', () => {
    expect(shipped).toHaveLength(15);
    expect([...renderTypes.keys()].sort()).toEqual(shipped.map((type) => /\.([a-z_]+)\.v1~$/.exec(type)![1]).sort());
  });
  // Pinned on purpose: the required render fields are the published render contract (ADR-0009), so the rows
  // derived from them below cannot lose a rule silently. Read from the type's top level and every allOf part
  // but the $ref to the render base, so the reading does not depend on which part carries `required`.
  it('ships the pinned required fields of each render type', () => {
    type Part = { $ref?: string; required?: string[] };
    const required = Object.fromEntries(
      IN_BUNDLE_PARTS.types
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
      radial_progress: [],
      grid: ['columns'],
      cartesian_chart: [],
      pie_chart: [],
      radar_chart: [],
      treemap_chart: [],
      waterfall_chart: [],
      activity_feed: [],
      funnel_chart: [],
      heatmap: [],
      markdown_card: ['body'],
    });
  });
  // One declared render field per type, with a value of the wrong type.
  const wrongValue: Record<string, Record<string, unknown>> = {
    metric_card: { value_label: 5 },
    ranked_list_card: { secondary_label: 5 },
    progress_list_card: { goal_label: 5 },
    radial_progress: { center_label: 5 },
    grid: { columns: 'key' },
    cartesian_chart: { drill_down: 'yes' },
    pie_chart: { radius: '50%' },
    radar_chart: { scale_max: 'high' },
    treemap_chart: { show_share: 'yes' },
    waterfall_chart: { connectors: 'yes' },
    activity_feed: { page_size: 'many' },
    funnel_chart: { show_conversion: 'yes' },
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

  it('accepts a grid column with a value_format of its own, and fails one whose value_format breaks the value_format type', () => {
    const type = shipped.find((id) => id.endsWith('.grid.v1~'))!;
    const grid = demoWidgets.find((widget) => widget.id.startsWith(type))!;
    const columns = grid.render.columns as Record<string, unknown>[];
    const withColumnFormat = (uuid: string, valueFormat: unknown) => ({
      ...grid,
      id: `${type}1a2b3c4d-0000-4000-8000-0000000000${uuid}`,
      render: { ...grid.render, columns: [{ ...columns[0], value_format: valueFormat }, ...columns.slice(1)] },
    });
    const { types } = loaded();
    const result = registerDashboard(types, dashboardOf([
      { size: 'small', widget: withColumnFormat('20', { value_type: 'percent', decimals: 1 }) },
      { size: 'small', widget: withColumnFormat('21', { value_type: 'duration' }) },
    ]));
    expect(result.ok && [...result.failed.keys()]).toEqual([slotOf(1, 'cell')]);
    expect(result.ok && result.failed.get(slotOf(1, 'cell'))).toMatch(/\/render\/columns\/0/);
  });

  it('accepts a cartesian_chart render with series_default, and fails one whose series_default carries a field it does not declare', () => {
    const type = shipped.find((id) => id.endsWith('.cartesian_chart.v1~'))!;
    const chart = demoWidgets.find((widget) => widget.id.startsWith(type))!;
    const withDefault = (uuid: string, seriesDefault: unknown) => ({ ...chart, id: `${type}1a2b3c4d-0000-4000-8000-0000000000${uuid}`, render: { ...chart.render, series_default: seriesDefault } });
    const { types } = loaded();
    const result = registerDashboard(types, dashboardOf([
      { size: 'small', widget: withDefault('30', { type: 'bar', y_axis: 'secondary', stack_group: 'runs' }) },
      { size: 'small', widget: withDefault('31', { stack_group: 'runs', label: 'Target' }) },
    ]));
    expect(result.ok && [...result.failed.keys()]).toEqual([slotOf(1, 'cell')]);
  });

  it('accepts cartesian_chart data in the series form or the long form, and fails data with both, neither, or a point without its series', () => {
    const DATA = 'gts.frontx.dashboard.widget_data.widget_data.v1~frontx.dashboard.widget_data.cartesian_chart.v1~';
    const { types } = loaded();
    const stamped = (uuid: string, data: Record<string, unknown>) => () => types.register({ ...data, id: `${DATA}1a2b3c4d-0000-4000-8000-0000000000${uuid}` });
    const series = [{ name: 'ok', points: [{ x: 'Mon', y: 10 }] }];
    const points = [{ x: 'Mon', y: 10, series: 'ok' }, { x: 'Mon', y: 1, series: 'failed' }, { x: 'Tue', y: 2, series: null, size: 3 }];
    expect(stamped('40', { series })).not.toThrow();
    expect(stamped('41', { points })).not.toThrow();
    expect(stamped('42', { series, points })).toThrow();
    expect(stamped('43', {})).toThrow();
    expect(stamped('44', { points: [{ x: 'Mon', y: 10 }] })).toThrow();
    expect(stamped('45', { points: [{ x: 'Mon', y: 10, series: 'ok', name: 'ok' }] })).toThrow();
  });

  it('accepts a markdown_card render with text_width reading or full, and fails one with another value', () => {
    const type = shipped.find((id) => id.endsWith('.markdown_card.v1~'))!;
    const { types } = loaded();
    const result = registerDashboard(types, dashboardOf([
      { size: 'large', widget: { id: `${type}1a2b3c4d-0000-4000-8000-0000000000e1`, render: { body: 'A paragraph.', text_width: 'reading' } } },
      { size: 'large', widget: { id: `${type}1a2b3c4d-0000-4000-8000-0000000000e2`, render: { body: 'A paragraph.', text_width: 'full' } } },
      { size: 'large', widget: { id: `${type}1a2b3c4d-0000-4000-8000-0000000000e3`, render: { body: 'A paragraph.', text_width: 'narrow' } } },
    ]));
    expect(result.ok && [...result.failed.keys()]).toEqual([slotOf(2, 'cell')]);
    expect(result.ok && result.failed.get(slotOf(2, 'cell'))).toMatch(/\/render\/text_width/);
  });

  it('accepts a markdown_card render with heading_style section or default, and fails one with another value', () => {
    const type = shipped.find((id) => id.endsWith('.markdown_card.v1~'))!;
    const { types } = loaded();
    const result = registerDashboard(types, dashboardOf([
      { size: 'large', frame: false, widget: { id: `${type}1a2b3c4d-0000-4000-8000-0000000000d1`, render: { body: '## Delivery', heading_style: 'section' } } },
      { size: 'large', frame: false, widget: { id: `${type}1a2b3c4d-0000-4000-8000-0000000000d2`, render: { body: '## Delivery', heading_style: 'default' } } },
      { size: 'large', frame: false, widget: { id: `${type}1a2b3c4d-0000-4000-8000-0000000000d3`, render: { body: '## Delivery', heading_style: 'loud' } } },
    ]));
    expect(result.ok && [...result.failed.keys()]).toEqual([slotOf(2, 'cell')]);
    expect(result.ok && result.failed.get(slotOf(2, 'cell'))).toMatch(/\/render\/heading_style/);
  });

  it('registers a data widget with max_decimals, and fails one that also sets decimals in its own cell', () => {
    const { types } = loaded();
    const result = registerDashboard(types, dashboardOf([
      { size: 'small', widget: pie('1a2b3c4d-0000-4000-8000-0000000000a1', { value_format: { value_type: 'number', max_decimals: 1 } }) },
      { size: 'small', widget: pie('1a2b3c4d-0000-4000-8000-0000000000a2', { value_format: { value_type: 'number', decimals: 1, max_decimals: 1 } }) },
    ]));
    expect(result.ok && [...result.failed.keys()]).toEqual([slotOf(1, 'cell')]);
    expect(result.ok && result.failed.get(slotOf(1, 'cell'))).toMatch(/\/value_format/);
  });

  it('registers a data widget with a compound duration, and fails one that also sets decimals in its own cell', () => {
    const { types } = loaded();
    const result = registerDashboard(types, dashboardOf([
      { size: 'small', widget: pie('1a2b3c4d-0000-4000-8000-0000000000b1', { value_format: { value_type: 'duration', unit: 'h', compound: true } }) },
      { size: 'small', widget: pie('1a2b3c4d-0000-4000-8000-0000000000b2', { value_format: { value_type: 'duration', unit: 'h', compound: true, decimals: 1 } }) },
    ]));
    expect(result.ok && [...result.failed.keys()]).toEqual([slotOf(1, 'cell')]);
    expect(result.ok && result.failed.get(slotOf(1, 'cell'))).toMatch(/\/value_format/);
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

  it('accepts each radial_progress display, and fails one outside the catalog values', () => {
    const type = shipped.find((id) => id.endsWith('.radial_progress.v1~'))!;
    const radial = demoWidgets.find((widget) => widget.id.startsWith(type))!;
    const { types } = loaded();
    const values = ['percent', 'value', 'both', 'ring'];
    const result = registerDashboard(types, dashboardOf(values.map((value, index) => withRender(type, radial, 'display', `3${index}`, value))));
    expect(result.ok && [...result.failed.keys()]).toEqual([slotOf(3, 'cell')]);
    expect(result.ok && result.failed.get(slotOf(3, 'cell'))).toMatch(/\/render\/display/);
  });

  it('accepts each funnel_chart value_labels, and fails one outside the catalog values', () => {
    const type = shipped.find((id) => id.endsWith('.funnel_chart.v1~'))!;
    const funnel = demoWidgets.find((widget) => widget.id.startsWith(type))!;
    const { types } = loaded();
    const values = ['auto', 'always', 'never', 'inside'];
    const result = registerDashboard(types, dashboardOf(values.map((value, index) => withRender(type, funnel, 'value_labels', `4${index}`, value))));
    expect(result.ok && [...result.failed.keys()]).toEqual([slotOf(3, 'cell')]);
    expect(result.ok && result.failed.get(slotOf(3, 'cell'))).toMatch(/\/render\/value_labels/);
  });

  it('accepts each radar_chart legend_position, and fails one outside the catalog values', () => {
    const type = shipped.find((id) => id.endsWith('.radar_chart.v1~'))!;
    const radar = demoWidgets.find((widget) => widget.id.startsWith(type))!;
    const { types } = loaded();
    const values = ['top', 'right', 'bottom', 'left', 'none', 'outside'];
    const result = registerDashboard(types, dashboardOf(values.map((value, index) => withRender(type, radar, 'legend_position', `5${index}`, value))));
    expect(result.ok && [...result.failed.keys()]).toEqual([slotOf(5, 'cell')]);
    expect(result.ok && result.failed.get(slotOf(5, 'cell'))).toMatch(/\/render\/legend_position/);
  });

  it('accepts each treemap_chart value_labels, and fails one outside the catalog values', () => {
    const type = shipped.find((id) => id.endsWith('.treemap_chart.v1~'))!;
    const treemap = demoWidgets.find((widget) => widget.id.startsWith(type))!;
    const { types } = loaded();
    const values = ['auto', 'always', 'never', 'inside'];
    const result = registerDashboard(types, dashboardOf(values.map((value, index) => withRender(type, treemap, 'value_labels', `6${index}`, value))));
    expect(result.ok && [...result.failed.keys()]).toEqual([slotOf(3, 'cell')]);
    expect(result.ok && result.failed.get(slotOf(3, 'cell'))).toMatch(/\/render\/value_labels/);
  });

  it('accepts each waterfall_chart value_labels, and fails one outside the catalog values', () => {
    const type = shipped.find((id) => id.endsWith('.waterfall_chart.v1~'))!;
    const waterfall = demoWidgets.find((widget) => widget.id.startsWith(type))!;
    const { types } = loaded();
    const values = ['auto', 'always', 'never', 'sometimes'];
    const result = registerDashboard(types, dashboardOf(values.map((value, index) => withRender(type, waterfall, 'value_labels', `7${index}`, value))));
    expect(result.ok && [...result.failed.keys()]).toEqual([slotOf(3, 'cell')]);
    expect(result.ok && result.failed.get(slotOf(3, 'cell'))).toMatch(/\/render\/value_labels/);
  });

  it('accepts each activity_feed time_style, and fails one outside the catalog values', () => {
    const type = shipped.find((id) => id.endsWith('.activity_feed.v1~'))!;
    const feed = demoWidgets.find((widget) => widget.id.startsWith(type))!;
    const { types } = loaded();
    const values = ['relative', 'absolute', 'soonest'];
    const result = registerDashboard(types, dashboardOf(values.map((value, index) => withRender(type, feed, 'time_style', `8${index}`, value))));
    expect(result.ok && [...result.failed.keys()]).toEqual([slotOf(2, 'cell')]);
    expect(result.ok && result.failed.get(slotOf(2, 'cell'))).toMatch(/\/render\/time_style/);
  });

  it('accepts the activity_feed page_size bounds the catalog names, and refuses one outside them', () => {
    const type = shipped.find((id) => id.endsWith('.activity_feed.v1~'))!;
    const feed = demoWidgets.find((widget) => widget.id.startsWith(type))!;
    const { types } = loaded();
    // The catalog pins page_size at 3 to 50: the bounds register, 2 and 51 fail their cells.
    const values = [3, 50, 2, 51];
    const result = registerDashboard(types, dashboardOf(values.map((value, index) => withRender(type, feed, 'page_size', `9${index}`, value))));
    expect(result.ok && [...result.failed.keys()]).toEqual([slotOf(2, 'cell'), slotOf(3, 'cell')]);
    expect(result.ok && result.failed.get(slotOf(2, 'cell'))).toMatch(/\/render\/page_size/);
    expect(result.ok && result.failed.get(slotOf(3, 'cell'))).toMatch(/\/render\/page_size/);
  });

  it('accepts ranked status tones from the shared tones type, and fails a tone outside its closed values or an empty status', () => {
    const type = shipped.find((id) => id.endsWith('.ranked_list_card.v1~'))!;
    const ranked = demoWidgets.find((widget) => widget.id.startsWith(type))!;
    const { types } = loaded();
    const values = [{ Open: 'info', Late: 'danger' }, { Open: 'purple' }, { '': 'info' }];
    const result = registerDashboard(types, dashboardOf(values.map((value, index) => withRender(type, ranked, 'status_tones', `2${index}`, value))));
    expect(result.ok && [...result.failed.keys()]).toEqual([slotOf(1, 'cell'), slotOf(2, 'cell')]);
    expect(result.ok && result.failed.get(slotOf(1, 'cell'))).toMatch(/\/render\/status_tones/);
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
    // The stand-in takes its id from the cell's place, and the neighbour in cell 0 is in the store as delivered.
    expect(result.ok && result.dashboard.layout.cells[1].widget).toEqual({ id: `${STAND_IN_TYPE_ID}${uuidv5('cell 1|cell')}`, render: {} });
    expect(types.validateInstance(`${PIE}1a2b3c4d-0000-4000-8000-000000000016`).valid).toBe(true);
  });

  it.each([
    ['widget', 'cell'],
    ['larger_view', 'larger_view'],
  ] as const)('fails only its slot when the getter of the cell\'s own %s throws', (key, role) => {
    const { types } = loaded();
    const cell: Record<string, unknown> = { size: 'small' };
    if (key === 'larger_view') cell.widget = pie('1a2b3c4d-0000-4000-8000-000000000018');
    throwing(cell, key);
    const result = registerDashboard(types, dashboardOf([{ size: 'small', widget: pie('1a2b3c4d-0000-4000-8000-000000000017') }, cell]));
    expect(result.ok).toBe(true);
    expect(result.ok && Object.fromEntries(result.failed)).toEqual({ [slotOf(1, role)]: 'the widget cannot be read: getter boom' });
    expect(types.validateInstance(`${PIE}1a2b3c4d-0000-4000-8000-000000000017`).valid).toBe(true);
    // The cell keeps its other fields; its failed slot holds a stand-in named by the cell's place.
    const ran = result.ok ? (result.dashboard.layout.cells[1] as unknown as Record<string, unknown>) : {};
    expect(ran.size).toBe('small');
    expect(ran[key]).toEqual({ id: `${STAND_IN_TYPE_ID}${uuidv5(`cell 1|${role}`)}`, render: {} });
  });

  it('fails the load of a dashboard that declares variables: the host owns them', () => {
    const result = registerDashboard(loaded().types, { ...dashboardOf([]), variables: { period: { title: 'Period', options: [{ value: '7d', label: 'Last 7 days' }], default: '7d' } } } as unknown as Dashboard);
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

  describe('a frameless cell', () => {
    const MARKDOWN = 'gts.frontx.dashboard.widget.widget.v1~frontx.dashboard.widget.markdown_card.v1~';
    const note = (uuid: string, extra: Record<string, unknown> = {}) => ({ id: `${MARKDOWN}${uuid}`, render: { body: '## Section' }, ...extra });

    it('registers a frameless markdown cell with no title, description or larger view, and a cell with frame true as before', () => {
      const result = registerDashboard(loaded().types, dashboardOf([
        { size: 'large', frame: false, widget: note('2b3c4d5e-0000-4000-8000-000000000001') },
        { size: 'small', frame: true, widget: pie('2b3c4d5e-0000-4000-8000-000000000002') },
      ]));
      expect(result).toMatchObject({ ok: true, failed: new Map() });
    });

    it.each([
      ['a widget title', { widget: note('2b3c4d5e-0000-4000-8000-000000000003', { title: 'Section' }) }, ['cell'], 'a widget title'],
      ['a widget description', { widget: note('2b3c4d5e-0000-4000-8000-000000000004', { description: 'Line' }) }, ['cell'], 'a widget description'],
      [
        'a larger view',
        { widget: note('2b3c4d5e-0000-4000-8000-000000000005'), larger_view: note('2b3c4d5e-0000-4000-8000-000000000006') },
        ['cell', 'larger_view'],
        'a larger_view',
      ],
      [
        'all three',
        { widget: note('2b3c4d5e-0000-4000-8000-000000000007', { title: 'T', description: 'D' }), larger_view: note('2b3c4d5e-0000-4000-8000-000000000008') },
        ['cell', 'larger_view'],
        'a widget title, a widget description, a larger_view',
      ],
      ['a size other than large', { size: 'medium', widget: note('2b3c4d5e-0000-4000-8000-00000000000b') }, ['cell'], 'the size medium'],
      ['a height', { height: 'low', widget: note('2b3c4d5e-0000-4000-8000-00000000000c') }, ['cell'], 'the height low'],
      ['a size and a height', { size: 'small', height: 'high', widget: note('2b3c4d5e-0000-4000-8000-00000000000d', { title: 'T' }) }, ['cell'], 'a widget title, the size small, the height high'],
    ] as const)('fails that cell only, with its reason, when it carries %s', (_name, slots, roles, named) => {
      const { types } = loaded();
      const result = registerDashboard(types, dashboardOf([
        { size: 'small', widget: pie('2b3c4d5e-0000-4000-8000-000000000009') },
        { size: 'large', frame: false, ...slots },
      ]));
      const reason = `the cell has frame false, which draws no header and spans the full width at the height of its content, and carries ${named}`;
      expect(result.ok && Object.fromEntries(result.failed)).toEqual(Object.fromEntries(roles.map((role) => [slotOf(1, role), reason])));
      // The widget itself is valid: it is in the store as delivered, not as a stand-in, and the neighbour is untouched.
      expect(types.validateInstance(slots.widget.id).valid).toBe(true);
      expect(result.ok && result.dashboard.layout.cells[1].widget).toEqual(slots.widget);
    });

    it('gives an invalid widget in a non-complying frameless cell its stand-in, and the dashboard still loads', () => {
      const { types } = loaded();
      // A title (frameless rule) and no body (the markdown_card type): validation fails the widget first.
      const invalid = { id: `${MARKDOWN}2b3c4d5e-0000-4000-8000-00000000000e`, title: 'Section', render: {} };
      const neighbour = pie('2b3c4d5e-0000-4000-8000-00000000000f');
      const result = registerDashboard(types, dashboardOf([{ size: 'large', frame: false, widget: invalid }, { size: 'small', widget: neighbour }]));
      expect(result.ok).toBe(true);
      expect(result.ok && [...result.failed.keys()]).toEqual([slotOf(0, 'cell')]);
      expect(result.ok && result.failed.get(slotOf(0, 'cell'))).not.toMatch(/frame false/);
      expect(types.validateInstance(neighbour.id).valid).toBe(true);
    });

    it('leaves a frame that is not a boolean to the type, which fails the load', () => {
      const result = registerDashboard(loaded().types, dashboardOf([{ size: 'large', frame: 'none', widget: note('2b3c4d5e-0000-4000-8000-00000000000a', { title: 'T' }) }]));
      expect(result.ok).toBe(false);
    });
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
  /** The types one catalog bundle's part carries, as its bundle's mfe.json declares them. */
  const bundleTypes = (widget: string) => BUNDLE_TYPES[widget] ?? [];
  /** One catalog bundle's part: its own types, then its manifest and entry from the in-bundle parts. */
  const bundlePart = (widget: string): ServedFile => ({ types: bundleTypes(widget), instances: IN_BUNDLE_PARTS.instances.filter((instance) => String(instance.id).endsWith(`.${widget}.v1`)) });
  const others = IN_BUNDLE_PARTS.instances.filter((instance) => !String(instance.id).endsWith('.pie_chart.v1'));
  // The part of the bundles beside the subject part, as one answer item: every bundle's types but the pie bundle's
  // own, and the other bundles' instances. otherTypes drops only the pie bundle's types, so a test that passes
  // `rest` has the metric bundle's types register from this part before its own part. A test that needs the metric
  // bundle's instances out of it too passes `rest`.
  const otherTypes = IN_BUNDLE_PARTS.types.filter((type) => !bundleTypes('pie_chart').includes(type));
  const otherPart = (instances: ServedFile['instances'] = others): ServedFile => ({ types: otherTypes, instances });
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

  /** Every id the left-out parts left recorded, instance and type ids alike. */
  const recordedIds = (parts: ReturnType<typeof loadedParts>) =>
    parts.outcome.ok ? [...parts.outcome.rejected.instances.keys(), ...parts.outcome.rejected.types.keys()] : [];

  it('leaves out a part whose manifest the registry rejects, with one console line, and fails only the cells it serves', () => {
    const pie = bundlePart('pie_chart');
    const broken = { ...pie, instances: pie.instances.map((instance) => (instance.id === PIE_MANIFEST ? { ...instance, name: 7 } : instance)) };
    const { types, outcome, lines } = loadedParts([DEMO_WITHOUT_BUNDLES, otherPart(), broken]);
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
    const { types, outcome, lines } = loadedParts([DEMO_WITHOUT_BUNDLES, otherPart(), broken]);
    expect(lines).toHaveLength(1);
    const result = registerDashboard(types, demoDashboard(), outcome.ok ? outcome.rejected : undefined);
    expect(result.ok && [...result.failed.keys()]).toEqual(pieSlots());
  });

  it('leaves out a part the registry rejects after its manifest and entry registered, and fails its cells with its line', () => {
    // The manifest and entry the part registered before its broken entry are its own, not healthy ones: the cells
    // they serve fail with the part line (DESIGN §3.6 step 4), wherever the failing item of the part sits.
    const pie = bundlePart('pie_chart');
    const brokenEntry = { id: 'gts.frontx.mfes.mfe.entry.v1~frontx.mfes.mfe.entry_mf.v1~frontx.test.mfe.broken.v1', manifest: 7 };
    const broken = { ...pie, instances: [...pie.instances, brokenEntry] };
    const { types, outcome, lines } = loadedParts([DEMO_WITHOUT_BUNDLES, otherPart(), broken]);
    expect(outcome.ok).toBe(true);
    expect(lines).toHaveLength(1);
    expect(lines[0]).toMatch(new RegExp(`the widget part "${PIE_MANIFEST.replace(/[.~]/g, '\\$&')}" is left out: the registry rejected it: `));
    const result = registerDashboard(types, demoDashboard(), outcome.ok ? outcome.rejected : undefined);
    expect(pieSlots().length).toBeGreaterThan(0);
    expect(result.ok && [...result.failed.keys()]).toEqual(pieSlots());
    expect(result.ok && result.failed.get(pieSlots()[0])).toMatch(/^the widget part ".*pie_chart.*" is left out: the registry rejected it: /);
  });

  it('leaves out a part whose type the registry rejects', () => {
    const pie = bundlePart('pie_chart');
    const bad = { $id: 'gts://not a type id', $schema: 'https://json-schema.org/draft/2020-12/schema', type: 'object' };
    const { types, outcome, lines } = loadedParts([DEMO_WITHOUT_BUNDLES, otherPart(), { ...pie, types: [...pie.types, bad] }]);
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
    const alike = loadedParts([DEMO_WITHOUT_BUNDLES, otherPart(rest), { ...metric, types: [...metric.types, dataType] }, { ...pie, types: [...pie.types, reordered] }]);
    expect(alike.lines).toEqual([]);
    expect(alike.outcome.ok && recordedIds(alike)).toEqual([]);
    const differing = loadedParts([DEMO_WITHOUT_BUNDLES, otherPart(rest), { ...metric, types: [...metric.types, dataType] }, { ...pie, types: [...pie.types, changed] }]);
    expect(differing.lines).toHaveLength(1);
    expect(differing.lines[0]).toMatch(/pie_chart.* is left out: .*frontx\.test\.widget_data\.shared\.v1~ .*already/);
    // The first definition stands; only the later part's cells fail.
    expect(differing.types.getSchema('gts.frontx.dashboard.widget_data.widget_data.v1~frontx.test.widget_data.shared.v1~')).toEqual(dataType);
    const result = registerDashboard(differing.types, demoDashboard(), differing.outcome.ok ? differing.outcome.rejected : undefined);
    expect(result.ok && [...result.failed.keys()]).toEqual(pieSlots());
  });

  it('names the first of two parts that brought a type alike in the line of the part left out for it', () => {
    // The metric part brings the data type, the first pie part brings it again alike, and the second pie part
    // brings it otherwise: the line names the metric part, whose registration held the type first, not the pie
    // part that carried it again last.
    const dataType = { $id: 'gts://gts.frontx.dashboard.widget_data.widget_data.v1~frontx.test.widget_data.shared.v1~', $schema: 'https://json-schema.org/draft/2020-12/schema', type: 'object', allOf: [{ $ref: 'gts://gts.frontx.dashboard.widget_data.widget_data.v1~' }] };
    const changed = { ...dataType, required: ['value'] };
    const reordered = Object.fromEntries(Object.entries(dataType).reverse());
    const pie = bundlePart('pie_chart');
    const metric = bundlePart('metric_card');
    const rest = others.filter((instance) => !String(instance.id).endsWith('.metric_card.v1'));
    const loadedFile = loadedParts([
      DEMO_WITHOUT_BUNDLES,
      otherPart(rest),
      { ...metric, types: [...metric.types, dataType] },
      { ...pie, types: [...pie.types, reordered] },
      { ...pie, types: [...pie.types, changed] },
    ]);
    expect(loadedFile.lines).toEqual([
      expect.stringMatching(
        /pie_chart.* is left out: its type gts\.frontx\.dashboard\.widget_data\.widget_data\.v1~frontx\.test\.widget_data\.shared\.v1~ is already defined otherwise by the widget part "gts\.frontx\.mfes\.mfe\.mf_manifest\.v1~frontx\.dashboard\.widgets\.metric_card\.v1"$/,
      ),
    ]);
  });

  it('names the part that defined a type first in the line of the part left out for it', () => {
    // An earlier part with no manifest brings the pie widget type: it registers, and the catalog pie part is left
    // out for the type alone. The line names the earlier part the way that part's own console line would name it,
    // and the pie cells fail with that line.
    const pie = bundlePart('pie_chart');
    const redefined = { ...IN_BUNDLE_PARTS.types.find((type) => String(type.$id) === `gts://${PIE}`)!, description: 'otherwise' };
    const fromPart = loadedParts([DEMO_WITHOUT_BUNDLES, otherPart(), { types: [redefined], instances: [] }, pie]);
    expect(fromPart.lines).toEqual([
      expect.stringMatching(
        new RegExp(
          `the widget part "${PIE_MANIFEST.replace(/[.~]/g, '\\$&')}" is left out: its type .*pie_chart\\.v1~ is already defined otherwise by the widget part number 3 of the answer \\(the served file is number 1\\)$`,
        ),
      ),
    ]);
    const result = registerDashboard(fromPart.types, demoDashboard(), fromPart.outcome.ok ? fromPart.outcome.rejected : undefined);
    expect(pieSlots().length).toBeGreaterThan(0);
    expect(result.ok && [...result.failed.keys()]).toEqual(pieSlots());
    expect(result.ok && result.failed.get(pieSlots()[0])).toMatch(/is already defined otherwise by the widget part number 3 of the answer \(the served file is number 1\)$/);
  });

  it('names no source in the line of a part left out for a shared-property type the root registered first', () => {
    // The root registers the theme shared-property type, the base file carries another definition of it, and the
    // store keeps the root's own: the served file is no source of the type, so a part that brings the base file's
    // definition is left out with a line that names no source at all.
    const THEME = 'gts.frontx.mfes.comm.shared_property.v1~frontx.mfes.comm.theme.v1~';
    const theme = {
      $id: `gts://${THEME}`,
      $schema: 'https://json-schema.org/draft/2020-12/schema',
      allOf: [{ $ref: 'gts://gts.frontx.mfes.comm.shared_property.v1~' }],
      properties: { value: { type: 'string', minLength: 1 } },
      description: 'otherwise',
    };
    const base = { ...DEMO_WITHOUT_BUNDLES, types: [...DEMO_WITHOUT_BUNDLES.types, theme] };
    const loadedFile = loadedParts([base, { types: [theme], instances: [] }]);
    expect(loadedFile.lines).toEqual([
      expect.stringMatching(
        new RegExp(`the widget part number 2 of the answer \\(the served file is number 1\\) is left out: its type ${THEME.replace(/[.~]/g, '\\$&')} is already defined otherwise$`),
      ),
    ]);
  });

  it('names no source in the line of a part left out for a shared-property type a base file carries alike', () => {
    // The root registers the theme shared-property type, the base file carries an identical copy of it, and the
    // store keeps the root's own: the identical copy makes the base file no source of the type, so a part that
    // brings the theme type otherwise is left out with a line that names no source at all.
    const THEME = 'gts.frontx.mfes.comm.shared_property.v1~frontx.mfes.comm.theme.v1~';
    const theme = {
      $id: `gts://${THEME}`,
      $schema: 'https://json-schema.org/draft/2020-12/schema',
      allOf: [{ $ref: 'gts://gts.frontx.mfes.comm.shared_property.v1~' }],
      properties: { value: { type: 'string', minLength: 1 } },
    };
    const otherwise = { ...theme, description: 'otherwise' };
    const base = { ...DEMO_WITHOUT_BUNDLES, types: [...DEMO_WITHOUT_BUNDLES.types, theme] };
    const loadedFile = loadedParts([base, { types: [otherwise], instances: [] }]);
    expect(loadedFile.lines).toEqual([
      expect.stringMatching(
        new RegExp(`the widget part number 2 of the answer \\(the served file is number 1\\) is left out: its type ${THEME.replace(/[.~]/g, '\\$&')} is already defined otherwise$`),
      ),
    ]);
  });

  it('names no source in the line of a part left out for a type the type store holds by itself, which a base file carries alike', () => {
    // The type store brings the shared-property base type by itself, before the root registers anything; the base
    // file carries an identical copy of it, and a later part brings it otherwise. The store's own definition was
    // first, so the base file is no source of the type, and the line names none.
    const SHARED = 'gts.frontx.mfes.comm.shared_property.v1~';
    const own = new GtsPlugin({ isolated: true }).getSchema(SHARED) as Record<string, unknown>;
    expect(own).toBeDefined();
    const base = { ...DEMO_WITHOUT_BUNDLES, types: [...DEMO_WITHOUT_BUNDLES.types, own] };
    const loadedFile = loadedParts([base, { types: [{ ...own, description: 'otherwise' }], instances: [] }]);
    expect(loadedFile.lines).toEqual([
      expect.stringMatching(
        new RegExp(`the widget part number 2 of the answer \\(the served file is number 1\\) is left out: its type ${SHARED.replace(/[.~]/g, '\\$&')} is already defined otherwise$`),
      ),
    ]);
  });

  it('names the served file the source of a base type the store holds from a failed earlier call', () => {
    // The first call fails on a base instance the registry rejects: the base types are in the store, and the root
    // drops the file and calls again on the same store with the same record of first sources, as the root does. The
    // first call registered the base types, so they keep the served file as their source, and a part that redefines
    // one of them is left out with a line naming the served file.
    const types = new GtsPlugin({ isolated: true });
    const bundleIds = registerBundle(types);
    const errors = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const catalogPie = IN_BUNDLE_PARTS.types.find((type) => String(type.$id) === `gts://${PIE}`)!;
    const base = { ...DEMO_WITHOUT_BUNDLES, types: [...DEMO_WITHOUT_BUNDLES.types, catalogPie] };
    const brokenEntry = { id: 'gts.frontx.mfes.mfe.entry.v1~frontx.mfes.mfe.entry_mf.v1~frontx.test.mfe.broken.v1', manifest: 7 };
    const broken = { ...base, instances: [...base.instances, brokenEntry] };
    const sources = new Map<string, string>();
    const first = registerServedFile(types, broken, bundleIds, sources);
    const redefined = { ...catalogPie, description: 'otherwise' };
    const second = registerServedFile(types, [base, { types: [redefined], instances: [] }], bundleIds, sources);
    const lines = errors.mock.calls.map(([line]) => String(line));
    errors.mockRestore();
    expect(first).toMatchObject({ ok: false, problem: expect.stringMatching(/the registry rejected it: /) });
    expect(second.ok).toBe(true);
    expect(lines).toEqual([
      expect.stringMatching(
        new RegExp(
          `the widget part number 2 of the answer \\(the served file is number 1\\) is left out: its type .*pie_chart\\.v1~ is already defined otherwise by the served file$`,
        ),
      ),
    ]);
  });

  it('serves the re-point of a catalog widget type to the product entry: the catalog part off the list, a product part carrying the type, and no failed cell', () => {
    // The re-point the guides describe: the catalog pie bundle stays off the widget list, and a product bundle's part
    // carries the pie widget type with its `entry` trait set to the product's own entry, the catalog render and data
    // types unchanged, and the product bundle's manifest and entry.
    const catalogPie = IN_BUNDLE_PARTS.types.find((type) => String(type.$id) === `gts://${PIE}`)!;
    const catalogManifest = IN_BUNDLE_PARTS.instances.find((instance) => instance.id === PIE_MANIFEST)!;
    const catalogEntry = IN_BUNDLE_PARTS.instances.find((instance) => instance.id === PIE_ENTRY)!;
    const PRODUCT_MANIFEST = 'gts.frontx.mfes.mfe.mf_manifest.v1~frontx.product.widgets.pie_chart.v1';
    const PRODUCT_ENTRY = 'gts.frontx.mfes.mfe.entry.v1~frontx.mfes.mfe.entry_mf.v1~frontx.product.mfe.pie_chart.v1';
    const product = {
      types: [
        { ...catalogPie, 'x-gts-traits': { ...((catalogPie as { 'x-gts-traits'?: Record<string, unknown> })['x-gts-traits'] ?? {}), entry: PRODUCT_ENTRY } },
        ...bundleTypes('pie_chart').filter((type) => String(type.$id) !== `gts://${PIE}`),
      ],
      instances: [{ ...catalogManifest, id: PRODUCT_MANIFEST }, { ...catalogEntry, id: PRODUCT_ENTRY, manifest: PRODUCT_MANIFEST }],
    };
    const { types, outcome, lines } = loadedParts([DEMO_WITHOUT_BUNDLES, otherPart(), product]);
    expect(lines).toEqual([]);
    expect(outcome.ok).toBe(true);
    // The product's copy of the type is the one in the store, and its effective entry is the product's own.
    expect(outcome.ok && types.getSchema(PIE)).toEqual(product.types[0]);
    expect(outcome.ok && effectiveTraits(types, PIE)).toEqual({ entry: PRODUCT_ENTRY, data_type: PIE_DATA });
    const result = registerDashboard(types, demoDashboard(), outcome.ok ? outcome.rejected : undefined);
    expect(result).toMatchObject({ ok: true, failed: new Map() });
  });

  const MARKDOWN_TYPE = 'gts.frontx.dashboard.widget.widget.v1~frontx.dashboard.widget.markdown_card.v1~';
  it.each([
    ['render type missing', 'markdown_card', MARKDOWN_TYPE, [] as ServedFile['types']],
    ['data type missing', 'pie_chart', PIE, [IN_BUNDLE_PARTS.types.find((type) => String(type.$id) === `gts://${PIE_RENDER}`)!]],
  ])('fails the cells of a type the base file copies with another entry with the part line: %s', (_missing, widget, widgetType, moreBaseTypes) => {
    // The old way of re-pointing, a copy of a catalog widget type with the product's entry in the base file: the
    // catalog part is left out for its type alone, the copy misses one type of its own, and the product entry the
    // cells resolve to names nothing. The markdown_card copy has no data type, so its cells can fail only by the
    // render type; the pie copy sits beside its render type in the base file, so its cell fails by the data type.
    const catalogType = IN_BUNDLE_PARTS.types.find((type) => String(type.$id) === `gts://${widgetType}`)!;
    const MANIFEST = `gts.frontx.mfes.mfe.mf_manifest.v1~frontx.dashboard.widgets.${widget}.v1`;
    const PRODUCT_MANIFEST = `gts.frontx.mfes.mfe.mf_manifest.v1~frontx.product.widgets.${widget}.v1`;
    const PRODUCT_ENTRY = `gts.frontx.mfes.mfe.entry.v1~frontx.mfes.mfe.entry_mf.v1~frontx.product.mfe.${widget}.v1`;
    const catalogManifest = IN_BUNDLE_PARTS.instances.find((instance) => instance.id === MANIFEST)!;
    const catalogEntry = IN_BUNDLE_PARTS.instances.find((instance) => instance.id === `gts.frontx.mfes.mfe.entry.v1~frontx.mfes.mfe.entry_mf.v1~frontx.dashboard.mfe.${widget}.v1`)!;
    const base = {
      ...DEMO_WITHOUT_BUNDLES,
      types: [
        ...DEMO_WITHOUT_BUNDLES.types,
        ...moreBaseTypes,
        { ...catalogType, 'x-gts-traits': { ...((catalogType as { 'x-gts-traits'?: Record<string, unknown> })['x-gts-traits'] ?? {}), entry: PRODUCT_ENTRY } },
      ],
      instances: [...DEMO_WITHOUT_BUNDLES.instances, { ...catalogManifest, id: PRODUCT_MANIFEST }, { ...catalogEntry, id: PRODUCT_ENTRY, manifest: PRODUCT_MANIFEST }],
    };
    // The part beside the subject part drops the subject bundle's types and instances too, so only the base file's
    // copy stands between the catalog part and its registration.
    const restTypes = IN_BUNDLE_PARTS.types.filter((type) => !bundleTypes(widget).includes(type));
    const restInstances = IN_BUNDLE_PARTS.instances.filter((instance) => !String(instance.id).endsWith(`.${widget}.v1`));
    const { types, outcome, lines } = loadedParts([base, { types: restTypes, instances: restInstances }, bundlePart(widget)]);
    expect(lines).toHaveLength(1);
    expect(lines[0]).toMatch(new RegExp(`the widget part "${MANIFEST.replace(/[.~]/g, '\\$&')}" is left out: its type .*${widget}\\.v1~ is already defined otherwise by the served file$`));
    const result = registerDashboard(types, demoDashboard(), outcome.ok ? outcome.rejected : undefined);
    const slots = slotsOf(widget);
    expect(slots.length).toBeGreaterThan(0);
    expect(result.ok && [...result.failed.keys()]).toEqual(slots);
    expect(result.ok && result.failed.get(slots[0])).toMatch(new RegExp(`^the widget part ".*${widget}.*" is left out: its type .* is already defined otherwise by the served file$`));
  });

  it('fails no cell of the healthy parts when a left-out part declares a type the registry refuses for its id', () => {
    // The refused id is recorded in the type map all the same; a widget type without a data_type trait must not
    // look it up under the string "undefined" and fail with an unrelated part's line, wherever the part sits.
    const rogue = { types: [{ $id: 'gts://undefined', type: 'object' }], instances: [] };
    for (const parts of [[DEMO_WITHOUT_BUNDLES, rogue, IN_BUNDLE_PARTS], [DEMO_WITHOUT_BUNDLES, IN_BUNDLE_PARTS, rogue]]) {
      const { types, outcome, lines } = loadedParts(parts);
      expect(lines).toHaveLength(1);
      expect(lines[0]).toMatch(/is left out: the registry rejected it: /);
      const result = registerDashboard(types, demoDashboard(), outcome.ok ? outcome.rejected : undefined);
      expect(result.ok && [...result.failed.keys()]).toEqual([]);
    }
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
    const pieType = () => IN_BUNDLE_PARTS.types.find((type) => String(type.$id) === `gts://${PIE}`)!;
    const dataType = { $id: 'gts://gts.frontx.dashboard.widget_data.widget_data.v1~frontx.test.widget_data.shared.v1~', $schema: 'https://json-schema.org/draft/2020-12/schema', type: 'object', allOf: [{ $ref: 'gts://gts.frontx.dashboard.widget_data.widget_data.v1~' }] };
    const failedSlots = (loadedFile: ReturnType<typeof loadedParts>) => {
      const result = registerDashboard(loadedFile.types, demoDashboard(), loadedFile.outcome.ok ? loadedFile.outcome.rejected : undefined);
      return result.ok ? [...result.failed.keys()] : result.problem;
    };

    it('loads the dashboard of a part that registers, and never the dashboard of a part it leaves out, wherever the failing item sits', () => {
      const pie = bundlePart('pie_chart');
      const healthy = loadedParts([DEMO_WITHOUT_BUNDLES, otherPart(), { ...pie, instances: [...pie.instances, ownDashboard] }]);
      expect(healthy.outcome.ok && healthy.outcome.dashboards.has(OWN_DASHBOARD)).toBe(true);
      for (const instances of [[...pie.instances, ownDashboard, badInstance], [...pie.instances, badInstance, ownDashboard]]) {
        const { outcome, lines } = loadedParts([DEMO_WITHOUT_BUNDLES, otherPart(), { ...pie, instances }]);
        expect(lines).toHaveLength(1);
        expect(outcome.ok && outcome.dashboards.has(OWN_DASHBOARD)).toBe(false);
      }
    });

    it('leaves out a part that brings a dashboard the base file already serves, and keeps the base dashboard', () => {
      const pie = bundlePart('pie_chart');
      const takeover = { ...demoDashboard(), title: 'Taken over' };
      const loadedFile = loadedParts([DEMO_WITHOUT_BUNDLES, otherPart(), { ...pie, instances: [...pie.instances, takeover] }]);
      expect(loadedFile.lines).toEqual([expect.stringMatching(/pie_chart.* is left out: its dashboard .* is already served otherwise$/)]);
      expect(loadedFile.outcome.ok && loadedFile.outcome.dashboards.get(DEMO_DASHBOARD_ID)?.title).toBe(demoDashboard().title);
      expect(failedSlots(loadedFile)).toEqual(pieSlots());
      // The part carries its own types and registers nothing, so its cells fail with its own line, not the registry's.
      const result = registerDashboard(loadedFile.types, demoDashboard(), loadedFile.outcome.ok ? loadedFile.outcome.rejected : undefined);
      expect(result.ok && result.failed.get(pieSlots()[0])).toMatch(/^the widget part ".*pie_chart.*" is left out: its dashboard .* is already served otherwise$/);
    });

    it('takes a part that brings a dashboard the base file already serves with the same content, keys in any order', () => {
      const pie = bundlePart('pie_chart');
      const alike = Object.fromEntries(Object.entries(demoDashboard()).reverse());
      const loadedFile = loadedParts([DEMO_WITHOUT_BUNDLES, otherPart(), { ...pie, instances: [...pie.instances, alike] }]);
      expect(loadedFile.lines).toEqual([]);
      expect(loadedFile.outcome.ok && loadedFile.outcome.dashboards.get(DEMO_DASHBOARD_ID)).toEqual(demoDashboard());
      expect(failedSlots(loadedFile)).toEqual([]);
    });

    it('registers nothing of a part whose type clashes, so a later part may bring its other types otherwise', () => {
      const metric = bundlePart('metric_card');
      const pie = bundlePart('pie_chart');
      const rest = others.filter((instance) => !String(instance.id).endsWith('.metric_card.v1'));
      const changed = { ...dataType, required: ['value'] };
      // A catalog type another part already brought: the summary widget type, with one field added.
      const summary = IN_BUNDLE_PARTS.types.find((type) => String(type.$id) === `gts://gts.frontx.dashboard.widget.widget.v1~frontx.dashboard.widget.data_widget.v1~frontx.dashboard.widget.summary_card.v1~`)!;
      const loadedFile = loadedParts([
        DEMO_WITHOUT_BUNDLES,
        otherPart(rest),
        // Its own types, its own new type, then a catalog type the bundles' parts already brought, otherwise.
        { ...metric, types: [...metric.types, dataType, { ...summary, description: 'otherwise' }] },
        { ...pie, types: [...pie.types, changed] },
      ]);
      expect(loadedFile.lines).toEqual([expect.stringMatching(/metric_card.* is left out: its type .*summary_card\.v1~ is already defined otherwise by the widget part "/)]);
      expect(loadedFile.types.getSchema('gts.frontx.dashboard.widget_data.widget_data.v1~frontx.test.widget_data.shared.v1~')).toEqual(changed);
      // Only the left-out part's cells fail; the later part that brings the type otherwise registers.
      expect(slotsOf('metric_card').length).toBeGreaterThan(0);
      expect(failedSlots(loadedFile)).toEqual(slotsOf('metric_card'));
    });

    it('keeps in the store the types a part registered before the registry rejected it, so a later part that brings one otherwise is left out too', () => {
      // The documented limit (DESIGN §3.6 step 4): the type store cannot take back a registration.
      const bad = { $id: 'gts://not a type id', $schema: 'https://json-schema.org/draft/2020-12/schema', type: 'object' };
      const metric = bundlePart('metric_card');
      const pie = bundlePart('pie_chart');
      const rest = others.filter((instance) => !String(instance.id).endsWith('.metric_card.v1'));
      const changed = { ...dataType, required: ['value'] };
      const loadedFile = loadedParts([DEMO_WITHOUT_BUNDLES, otherPart(rest), { ...metric, types: [...metric.types, dataType, bad] }, { ...pie, types: [...pie.types, changed] }]);
      expect(loadedFile.lines).toEqual([
        expect.stringMatching(/metric_card.* is left out: the registry rejected it: /),
        expect.stringMatching(/pie_chart.* is left out: its type .*frontx\.test\.widget_data\.shared\.v1~ is already defined otherwise by the widget part "gts\.frontx\.mfes\.mfe\.mf_manifest\.v1~frontx\.dashboard\.widgets\.metric_card\.v1"$/),
      ]);
      expect(loadedFile.types.getSchema('gts.frontx.dashboard.widget_data.widget_data.v1~frontx.test.widget_data.shared.v1~')).toEqual(dataType);
      expect([...(failedSlots(loadedFile) as string[])].sort()).toEqual([...slotsOf('metric_card'), ...slotsOf('pie_chart')].sort());
    });

    it('fails no cell of a healthy part through an entry a rejected part brings alike', () => {
      const pie = bundlePart('pie_chart');
      const entry = pie.instances.find((instance) => instance.id === PIE_ENTRY)!;
      const loadedFile = loadedParts([DEMO_WITHOUT_BUNDLES, otherPart(), pie, { types: [{ ...pieType(), description: 'otherwise' }], instances: [{ ...entry }] }]);
      expect(loadedFile.lines).toHaveLength(1);
      expect(loadedFile.outcome.ok && recordedIds(loadedFile)).toEqual([]);
      expect(failedSlots(loadedFile)).toEqual([]);
    });

    it('fails no cell when a rejected part names a registered type as an instance id', () => {
      // The instance id of a rejected part can equal a registered widget type id; the instance and type ids stay in
      // two maps, and a cell reads the instance map only for its widget's entry, so the healthy pie cells keep
      // registering and no type id of the part is recorded.
      const loadedFile = loadedParts([DEMO_WITHOUT_BUNDLES, otherPart(), bundlePart('pie_chart'), { types: [], instances: [{ id: PIE }, 7] }]);
      expect(loadedFile.lines).toHaveLength(1);
      expect(loadedFile.outcome.ok && [...loadedFile.outcome.rejected.types.keys()]).toEqual([]);
      expect(failedSlots(loadedFile)).toEqual([]);
    });

    it('leaves out a part that brings an entry a healthy part registered otherwise, and keeps the healthy entry', () => {
      const pie = bundlePart('pie_chart');
      const entry = pie.instances.find((instance) => instance.id === PIE_ENTRY)!;
      const copied = { ...entry, manifest: 'gts.frontx.mfes.mfe.mf_manifest.v1~frontx.dashboard.widgets.metric_card.v1' };
      const loadedFile = loadedParts([DEMO_WITHOUT_BUNDLES, otherPart(), pie, { types: [], instances: [copied] }]);
      expect(loadedFile.lines).toEqual([expect.stringMatching(/part number 4 of the answer \(the served file is number 1\) is left out: its instance .*pie_chart\.v1 is already registered otherwise$/)]);
      expect(loadedFile.outcome.ok && recordedIds(loadedFile)).toEqual([]);
      expect(failedSlots(loadedFile)).toEqual([]);
    });

    it('leaves out a part that brings one manifest, entry or dashboard id twice with other content, and takes one that brings it twice alike', () => {
      const pie = bundlePart('pie_chart');
      const manifest = pie.instances.find((instance) => instance.id === PIE_MANIFEST)!;
      const entry = pie.instances.find((instance) => instance.id === PIE_ENTRY)!;
      for (const [record, change] of [[manifest, { name: 'otherwise' }], [entry, { exposedModule: './otherwise' }], [ownDashboard, { title: 'Otherwise' }]] as const) {
        const what = String(record.id).startsWith('gts.frontx.dashboard.dashboard.') ? 'dashboard' : 'instance';
        const twice = loadedParts([DEMO_WITHOUT_BUNDLES, otherPart(), { ...pie, instances: [...pie.instances, ownDashboard, { ...record, ...change }] }]);
        expect(twice.lines).toEqual([expect.stringMatching(new RegExp(`pie_chart.* is left out: its ${what} ${String(record.id).replace(/[.~]/g, '\\$&')} comes twice, the second otherwise$`))]);
        expect(twice.outcome.ok && twice.outcome.dashboards.has(OWN_DASHBOARD)).toBe(false);
        expect(failedSlots(twice)).toEqual(pieSlots());
        const alike = loadedParts([DEMO_WITHOUT_BUNDLES, otherPart(), { ...pie, instances: [...pie.instances, ownDashboard, Object.fromEntries(Object.entries(record).reverse())] }]);
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
      const { lines } = loadedParts([DEMO_WITHOUT_BUNDLES, otherPart(), { ...pie, instances: [...pie.instances, { name: 'one' }, { name: 'two' }] }]);
      expect(lines).toEqual([expect.stringMatching(/pie_chart.* is left out: /)]);
      expect(lines[0]).not.toMatch(/comes twice/);
    });

    it('fails no cell of a later healthy part through what an earlier rejected part left behind', () => {
      const pie = bundlePart('pie_chart');
      const broken = { ...pie, instances: pie.instances.map((instance) => (instance.id === PIE_ENTRY ? { ...instance, manifest: 'gts.frontx.mfes.mfe.mf_manifest.v1~frontx.test.mfe.none.v1' } : instance)) };
      const loadedFile = loadedParts([DEMO_WITHOUT_BUNDLES, otherPart(), broken, pie]);
      expect(loadedFile.lines).toHaveLength(1);
      expect(loadedFile.outcome.ok && recordedIds(loadedFile)).toEqual([]);
      expect(failedSlots(loadedFile)).toEqual([]);
    });

    it('fails no cell of a later healthy part through the type ids a part left out before its types registered', () => {
      // The first pie part is left out by the pre-check (its extra dashboard is served already), before any of its
      // types registers: the type ids it declared are recorded, and the same part healthy clears them again.
      const pie = bundlePart('pie_chart');
      const takeover = { ...demoDashboard(), title: 'Taken over' };
      const leftOutEarly = { ...pie, instances: [...pie.instances, takeover] };
      const loadedFile = loadedParts([DEMO_WITHOUT_BUNDLES, otherPart(), leftOutEarly, pie]);
      expect(loadedFile.lines).toHaveLength(1);
      expect(loadedFile.outcome.ok && recordedIds(loadedFile)).toEqual([]);
      expect(failedSlots(loadedFile)).toEqual([]);
    });

    it('fails no cell when a later part registers the data type an earlier left-out part declared', () => {
      // The first part declares the pie data type and is left out by the pre-check before its types register, so
      // the id is recorded with its line; the next part registers the type and then fails on an unrelated entry, so
      // only a wholly healthy part clears the record. The type is in the store now, so the pie cells mount.
      const pieData = IN_BUNDLE_PARTS.types.find((type) => String(type.$id) === `gts://${PIE_DATA}`)!;
      const takeover = { ...demoDashboard(), title: 'Taken over' };
      const declares = { types: [pieData], instances: [takeover] };
      const registers = { types: [pieData], instances: [{ id: 'gts.frontx.mfes.mfe.entry.v1~frontx.mfes.mfe.entry_mf.v1~frontx.test.mfe.broken.v1', manifest: 7 }] };
      const pie = bundlePart('pie_chart');
      const withoutData = { ...pie, types: pie.types.filter((type) => String(type.$id) !== `gts://${PIE_DATA}`) };
      const loadedFile = loadedParts([DEMO_WITHOUT_BUNDLES, otherPart(), declares, registers, withoutData]);
      expect(loadedFile.lines).toEqual([
        expect.stringMatching(/the widget part number 3 of the answer \(the served file is number 1\) is left out: its dashboard .* is already served otherwise$/),
        expect.stringMatching(/the widget part number 4 of the answer \(the served file is number 1\) is left out: the registry rejected it: /),
      ]);
      // The record stays, with the line of the part that declared the type and registered nothing of it.
      expect(loadedFile.outcome.ok && loadedFile.outcome.rejected.types.get(PIE_DATA)).toMatch(/already served otherwise$/);
      // The type is in the store all the same, and the healthy part's cells mount with no failed cell.
      expect(loadedFile.types.getSchema(PIE_DATA)).toEqual(pieData);
      expect(failedSlots(loadedFile)).toEqual([]);
    });

    it('fails the pie cells with the left-out part\'s line when no part registers the data type it declared', () => {
      // The reverse: the data type is in no part that registers, so the record stands, and the cells of the type
      // fail with the line of the part that declared it, not with the registry's.
      const pieData = IN_BUNDLE_PARTS.types.find((type) => String(type.$id) === `gts://${PIE_DATA}`)!;
      const declares = { types: [pieData], instances: [{ ...demoDashboard(), title: 'Taken over' }] };
      const pie = bundlePart('pie_chart');
      const withoutData = { ...pie, types: pie.types.filter((type) => String(type.$id) !== `gts://${PIE_DATA}`) };
      const loadedFile = loadedParts([DEMO_WITHOUT_BUNDLES, otherPart(), declares, withoutData]);
      expect(loadedFile.lines).toEqual([expect.stringMatching(/the widget part number 3 of the answer \(the served file is number 1\) is left out: its dashboard .* is already served otherwise$/)]);
      const result = registerDashboard(loadedFile.types, demoDashboard(), loadedFile.outcome.ok ? loadedFile.outcome.rejected : undefined);
      expect(pieSlots().length).toBeGreaterThan(0);
      expect(result.ok && [...result.failed.keys()]).toEqual(pieSlots());
      expect(result.ok && result.failed.get(pieSlots()[0])).toMatch(/the widget part number 3 of the answer .* is left out: its dashboard .* is already served otherwise$/);
    });

    it.each([
      ['the stand-in manifest', STAND_IN.instances[0], { name: 'taken_over' }],
      ['the stand-in entry', STAND_IN.instances[1], { exposedModule: './taken_over' }],
      ['a lifecycle stage of the plugin', loadLifecycleStages()[0] as unknown as Record<string, unknown>, { description: 'otherwise' }],
    ])('leaves out a part that brings %s otherwise, and takes one that brings it alike', (_name, record, change) => {
      const pie = bundlePart('pie_chart');
      const otherwise = loadedParts([DEMO_WITHOUT_BUNDLES, otherPart(), { ...pie, instances: [...pie.instances, { ...record, ...change }] }]);
      expect(otherwise.lines).toEqual([expect.stringMatching(new RegExp(`is left out: its instance ${String(record.id).replace(/[.~]/g, '\\$&')} is already registered otherwise$`))]);
      expect(failedSlots(otherwise)).toEqual(pieSlots());
      const alike = loadedParts([DEMO_WITHOUT_BUNDLES, otherPart(), { ...pie, instances: [...pie.instances, { ...record }] }]);
      expect(alike.lines).toEqual([]);
      expect(failedSlots(alike)).toEqual([]);
    });

    it.each([
      // An in-code host can answer what JSON never carries: the content check of a held id cannot serialize it.
      ['a BigInt field on a held instance id', () => ({ ...STAND_IN.instances[0], size: 1n })],
      ['an instance whose id cannot be read', () => Object.defineProperty({}, 'id', { enumerable: true, get: () => { throw new Error('unreadable'); } })],
    ])('leaves out a part that throws on %s with its one line, and keeps the other parts', (_name, record) => {
      const pie = bundlePart('pie_chart');
      const loadedFile = loadedParts([DEMO_WITHOUT_BUNDLES, otherPart(), { ...pie, instances: [...pie.instances, record()] }]);
      expect(loadedFile.outcome.ok).toBe(true);
      expect(loadedFile.lines).toEqual([expect.stringMatching(/^\[dashboard\] the widget part .+ is left out: it cannot be read: /)]);
      expect(failedSlots(loadedFile)).toEqual(pieSlots());
    });

    it('names a part whose type id cannot be read by its manifest, and fails the cells of the type the base file holds with its line', () => {
      // The pie widget type registers from the base file, so the pie cells can name the entry the part failed to
      // bring; nothing of the part itself registers, and its unread type id must not take the instance ids down.
      const pie = bundlePart('pie_chart');
      const unreadable = { ...pieType() };
      Object.defineProperty(unreadable, '$id', { enumerable: true, get: () => { throw new Error('unreadable'); } });
      const base = { ...DEMO_WITHOUT_BUNDLES, types: [...DEMO_WITHOUT_BUNDLES.types, pieType()] };
      const broken = { ...pie, types: pie.types.map((schema) => (String(schema.$id) === `gts://${PIE}` ? unreadable : schema)) };
      const { types, outcome, lines } = loadedParts([base, otherPart(), broken]);
      expect(outcome.ok).toBe(true);
      expect(lines).toEqual([expect.stringMatching(new RegExp(`the widget part "${PIE_MANIFEST.replace(/[.~]/g, '\\$&')}" is left out: it cannot be read: unreadable$`))]);
      const result = registerDashboard(types, demoDashboard(), outcome.ok ? outcome.rejected : undefined);
      expect(result.ok && [...result.failed.keys()]).toEqual(pieSlots());
      expect(result.ok && result.failed.get(pieSlots()[0])).toMatch(/^the widget part ".*pie_chart.*" is left out: it cannot be read: unreadable$/);
    });

    it('fails every dashboard, not the caller, when the base file throws on read', () => {
      const unreadable = Object.defineProperty({}, 'id', { enumerable: true, get: () => { throw new Error('unreadable'); } });
      const { outcome } = loadedParts([{ ...DEMO_WITHOUT_BUNDLES, instances: [...DEMO_WITHOUT_BUNDLES.instances, unreadable] }, IN_BUNDLE_PARTS]);
      expect(outcome).toMatchObject({ ok: false, problem: expect.stringMatching(/^the served file: .*unreadable/) });
    });

    it('quotes and caps the part name in its console line', () => {
      const pie = bundlePart('pie_chart');
      const long = `${'gts.frontx.mfes.mfe.mf_manifest.v1~'}frontx.test.widgets.${'x'.repeat(300)}\n[dashboard] forged.v1`;
      const { lines } = loadedParts([DEMO_WITHOUT_BUNDLES, otherPart(), { ...pie, instances: [...pie.instances, { id: long, name: 7 }] }]);
      expect(lines).toHaveLength(1);
      expect(lines[0]).not.toContain('\n');
      expect(lines[0]).toMatch(/^\[dashboard\] the widget part "gts\.frontx\.mfes\.mfe\.mf_manifest\.v1~frontx\.dashboard\.widgets\.pie_chart\.v1, .*\.\.\." is left out: /);
      expect(lines[0].indexOf(' is left out')).toBeLessThan(240);
    });

    it('escapes every line break and control character a part id brings into its console line, in the name and in the reason', () => {
      const id = 'gts.frontx.mfes.mfe.mf_manifest.v1~frontx.test.widgets.a\u2028b\u2029c\u0085d\u007fe\u009bf\u0000g\rh.v1';
      const { lines } = loadedParts([DEMO_WITHOUT_BUNDLES, otherPart(), { types: [], instances: [{ id, name: 7 }] }]);
      expect(lines).toHaveLength(1);
      expect(lines[0]).toContain('frontx.test.widgets.a\\u2028b\\u2029c\\u0085d\\u007fe\\u009bf\\u0000g\\rh.v1" is left out');
      expect(lines[0]).not.toMatch(/[\u0000-\u001f\u007f-\u009f\u2028\u2029]/);
    });
  });

  describe('a product type whose parent a left-out part declared', () => {
    // A product widget type under the data widget chain, whose parent type comes by `$ref` from another part. The
    // part line is the one the pre-check writes for the pie part: it is left out before any of its types registers.
    const MY_TYPE = 'gts.frontx.dashboard.widget.widget.v1~frontx.dashboard.widget.data_widget.v1~frontx.test.widget.my_widget.v1~';
    const MID_TYPE = 'gts.frontx.dashboard.widget.widget.v1~frontx.dashboard.widget.data_widget.v1~frontx.test.widget.mid_widget.v1~';
    const PRODUCT_DATA = 'gts.frontx.dashboard.widget_data.widget_data.v1~frontx.test.widget_data.my.v1~';
    const PRODUCT_MANIFEST = 'gts.frontx.mfes.mfe.mf_manifest.v1~frontx.product.widgets.my.v1';
    const PRODUCT_ENTRY = 'gts.frontx.mfes.mfe.entry.v1~frontx.mfes.mfe.entry_mf.v1~frontx.product.mfe.my.v1';
    const PART_LINE = /the widget part ".*pie_chart.*" is left out: its dashboard .* is already served otherwise$/;
    const widgetType = (id: string, parent: string) => ({
      $id: `gts://${id}`,
      $schema: 'https://json-schema.org/draft/2020-12/schema',
      'x-gts-traits': { entry: PRODUCT_ENTRY, data_type: PRODUCT_DATA },
      allOf: [{ $ref: 'gts://gts.frontx.dashboard.widget.widget.v1~frontx.dashboard.widget.data_widget.v1~' }, { $ref: `gts://${parent}` }],
    });
    const productPart = (...types: Record<string, unknown>[]) => ({
      types: [
        ...types,
        { $id: `gts://${PRODUCT_DATA}`, $schema: 'https://json-schema.org/draft/2020-12/schema', type: 'object', allOf: [{ $ref: 'gts://gts.frontx.dashboard.widget_data.widget_data.v1~' }] },
      ],
      instances: [
        { ...IN_BUNDLE_PARTS.instances.find((instance) => instance.id === PIE_MANIFEST)!, id: PRODUCT_MANIFEST },
        { ...IN_BUNDLE_PARTS.instances.find((instance) => instance.id === PIE_ENTRY)!, id: PRODUCT_ENTRY, manifest: PRODUCT_MANIFEST },
      ],
    });
    const myWidget = (uuid: string) => ({ id: `${MY_TYPE}${uuid}`, title: 'Mine', render: {}, data: { params: {}, transform: "{'slices': []}" } });
    const leftOutPiePart = () => {
      const pie = bundlePart('pie_chart');
      return { ...pie, instances: [...pie.instances, { ...demoDashboard(), title: 'Taken over' }] };
    };

    it('fails the cells of a product type with the line of the part that left out its parent type', () => {
      const { types, outcome, lines } = loadedParts([DEMO_WITHOUT_BUNDLES, otherPart(), productPart(widgetType(MY_TYPE, PIE)), leftOutPiePart()]);
      expect(outcome.ok).toBe(true);
      expect(lines).toEqual([expect.stringMatching(PART_LINE)]);
      const result = registerDashboard(types, dashboardOf([{ size: 'small', widget: myWidget('1a2b3c4d-0000-4000-8000-000000000001') }]), outcome.ok ? outcome.rejected : undefined);
      expect(result.ok && [...result.failed.keys()]).toEqual([slotOf(0, 'cell')]);
      expect(result.ok && result.failed.get(slotOf(0, 'cell'))).toMatch(PART_LINE);
    });

    it('fails the cells of a product type with the line of the part that left out its grandparent type, through its registered parent', () => {
      const { types, outcome, lines } = loadedParts([DEMO_WITHOUT_BUNDLES, otherPart(), productPart(widgetType(MID_TYPE, PIE), widgetType(MY_TYPE, MID_TYPE)), leftOutPiePart()]);
      expect(outcome.ok).toBe(true);
      expect(lines).toEqual([expect.stringMatching(PART_LINE)]);
      const result = registerDashboard(types, dashboardOf([{ size: 'small', widget: myWidget('1a2b3c4d-0000-4000-8000-000000000002') }]), outcome.ok ? outcome.rejected : undefined);
      expect(result.ok && [...result.failed.keys()]).toEqual([slotOf(0, 'cell')]);
      expect(result.ok && result.failed.get(slotOf(0, 'cell'))).toMatch(PART_LINE);
    });

    it('fails the cells of a chained product type with no $ref parent with the line of the part that left out a prefix of its id', () => {
      // The product type id chains the pie widget type and its own segment, with no allOf `$ref` to the parent: the
      // registry walks the prefixes of the id as the parents. The left-out pie part holds the pie prefix, so the
      // cell fails with that part's line, not with the registry's own parent error.
      const CHAINED = `${PIE}frontx.test.widget.pie_plus.v1~`;
      const chained = {
        $id: `gts://${CHAINED}`,
        $schema: 'https://json-schema.org/draft/2020-12/schema',
        'x-gts-traits': { entry: PRODUCT_ENTRY, data_type: PRODUCT_DATA },
      };
      const { types, outcome, lines } = loadedParts([DEMO_WITHOUT_BUNDLES, otherPart(), productPart(chained), leftOutPiePart()]);
      expect(outcome.ok).toBe(true);
      expect(lines).toEqual([expect.stringMatching(PART_LINE)]);
      const result = registerDashboard(
        types,
        dashboardOf([{ size: 'small', widget: { ...myWidget('1a2b3c4d-0000-4000-8000-000000000008'), id: `${CHAINED}1a2b3c4d-0000-4000-8000-000000000008` } }]),
        outcome.ok ? outcome.rejected : undefined,
      );
      expect(result.ok && [...result.failed.keys()]).toEqual([slotOf(0, 'cell')]);
      expect(result.ok && result.failed.get(slotOf(0, 'cell'))).toMatch(PART_LINE);
    });

    it('fails the cells of a chained product type with the line of the part that left out the parent of a prefix the store has', () => {
      // The chained id's pie prefix is a type the store holds, so the walk goes through it: that prefix extends the
      // pie widget type by `$ref`, and the left-out pie part declared the pie type, so the cell fails with the pie
      // part's line and not with its own reason.
      const HOLDER = 'gts.frontx.dashboard.widget.widget.v1~frontx.dashboard.widget.data_widget.v1~frontx.test.widget.holder.v1~';
      const CHAINED = `${HOLDER}frontx.test.widget.holder_plus.v1~`;
      const holder = widgetType(HOLDER, PIE);
      const chained = {
        $id: `gts://${CHAINED}`,
        $schema: 'https://json-schema.org/draft/2020-12/schema',
        'x-gts-traits': { entry: PRODUCT_ENTRY, data_type: PRODUCT_DATA },
      };
      const { types, outcome, lines } = loadedParts([DEMO_WITHOUT_BUNDLES, otherPart(), productPart(holder, chained), leftOutPiePart()]);
      expect(outcome.ok).toBe(true);
      expect(lines).toEqual([expect.stringMatching(PART_LINE)]);
      const result = registerDashboard(
        types,
        dashboardOf([{ size: 'small', widget: { ...myWidget('1a2b3c4d-0000-4000-8000-000000000009'), id: `${CHAINED}1a2b3c4d-0000-4000-8000-000000000009` } }]),
        outcome.ok ? outcome.rejected : undefined,
      );
      expect(result.ok && [...result.failed.keys()]).toEqual([slotOf(0, 'cell')]);
      expect(result.ok && result.failed.get(slotOf(0, 'cell'))).toMatch(PART_LINE);
    });

    it('fails no product cell when a later part registers the parent type a left-out part declared first', () => {
      // The part that registers the parent brings it whole and fails on an unrelated entry of its own, after its
      // types and entries registered: the parent is in the store, so the record of the part that declared it first
      // counts no more, and the cell mounts.
      const pie = bundlePart('pie_chart');
      const { types, outcome, lines } = loadedParts([
        DEMO_WITHOUT_BUNDLES,
        otherPart(),
        leftOutPiePart(),
        productPart(widgetType(MY_TYPE, PIE)),
        { ...pie, instances: [...pie.instances, { id: 'gts.frontx.mfes.mfe.entry.v1~frontx.mfes.mfe.entry_mf.v1~frontx.test.mfe.broken.v1', manifest: 7 }] },
      ]);
      expect(outcome.ok).toBe(true);
      expect(lines).toEqual([expect.stringMatching(PART_LINE), expect.stringMatching(/is left out: the registry rejected it: /)]);
      const result = registerDashboard(types, dashboardOf([{ size: 'small', widget: myWidget('1a2b3c4d-0000-4000-8000-000000000003') }]), outcome.ok ? outcome.rejected : undefined);
      expect(result).toMatchObject({ ok: true, failed: new Map() });
    });

    it('names the left-out part behind a cycle in the $ref chain, and leaves an unknown parent its own reason', () => {
      const LOOP_A = 'gts.frontx.dashboard.widget.widget.v1~frontx.dashboard.widget.data_widget.v1~frontx.test.widget.loop_a.v1~';
      const LOOP_B = 'gts.frontx.dashboard.widget.widget.v1~frontx.dashboard.widget.data_widget.v1~frontx.test.widget.loop_b.v1~';
      const Z_TYPE = 'gts.frontx.dashboard.widget.widget.v1~frontx.dashboard.widget.data_widget.v1~frontx.test.widget.z_widget.v1~';
      const UNKNOWN = 'gts.frontx.test.widget.nowhere.v1~';
      // The left-out pie part keeps the record non-empty, so leftOut reaches the walk instead of returning at its
      // first line. One cycle member also extends the left-out pie type, so naming its part takes walking through
      // the cycle to that `$ref`: this is what the guards of the walk prove. Drop the visited set together with
      // the hop bound and the walk never ends, its RangeError dies in the catch of the lookup, the line is lost,
      // and this test fails. Into z_widget's unknown parent, which no part recorded, the walk names no part.
      const loopA = widgetType(LOOP_A, LOOP_B);
      loopA.allOf = [...loopA.allOf, { $ref: `gts://${PIE}` }];
      const { types, outcome, lines } = loadedParts([DEMO_WITHOUT_BUNDLES, otherPart(), productPart(loopA, widgetType(LOOP_B, LOOP_A), widgetType(Z_TYPE, UNKNOWN)), leftOutPiePart()]);
      expect(outcome.ok).toBe(true);
      expect(lines).toEqual([expect.stringMatching(PART_LINE)]);
      const widgetOf = (type: string, uuid: string) => ({ ...myWidget(uuid), id: `${type}${uuid}` });
      const result = registerDashboard(types, dashboardOf([
        { size: 'small', widget: widgetOf(LOOP_A, '1a2b3c4d-0000-4000-8000-000000000004') },
        { size: 'small', widget: widgetOf(Z_TYPE, '1a2b3c4d-0000-4000-8000-000000000005') },
      ]), outcome.ok ? outcome.rejected : undefined);
      expect(result.ok).toBe(true);
      expect(result.ok && [...result.failed.keys()]).toEqual([slotOf(0, 'cell'), slotOf(1, 'cell')]);
      // The loop_a cell fails with the pie part's line: the walk reaches the recorded pie type through the cycle.
      expect(result.ok && result.failed.get(slotOf(0, 'cell'))).toMatch(PART_LINE);
      // The unknown parent leaves z_widget's own unresolvable `$ref`, no part line.
      expect(result.ok && result.failed.get(slotOf(1, 'cell'))).toMatch(/GTS validation failed .*Could not resolve \$ref 'gts\.frontx\.test\.widget\.nowhere\.v1~'/);
    });

    it('fails the cell of a chain of parents past the hop bound with its own reason, and does not throw out', () => {
      // More than ANCESTOR_HOPS store-held parents, and the chain's last link held by no store, only recorded by
      // the left-out pie part: the walk gives up at the hop bound, the cell fails, and registration does not throw.
      // The chain length 21 must stay above ANCESTOR_HOPS, so the walk really gives up at the bound. Whether the
      // cell then fails with the part line or its own reason is no contract here: a higher bound walks further and
      // names the part, which is the better reason for the user, so the assertion below takes either. Kept next to
      // the cycle test because it covers the other shape the guards face, an acyclic chain deeper than the bound.
      const link = (n: number) => `gts.frontx.test.widget.chain_${n}.v1~`;
      const END = 'gts.frontx.test.widget.chain_end.v1~';
      const chain: Record<string, unknown>[] = [widgetType(MY_TYPE, link(1))];
      for (let n = 1; n <= 21; n += 1) {
        chain.push({
          $id: `gts://${link(n)}`,
          $schema: 'https://json-schema.org/draft/2020-12/schema',
          type: 'object',
          allOf: [{ $ref: `gts://${n < 21 ? link(n + 1) : END}` }],
        });
      }
      const pie = leftOutPiePart();
      const { types, outcome, lines } = loadedParts([
        DEMO_WITHOUT_BUNDLES,
        otherPart(),
        productPart(...chain),
        { ...pie, types: [...pie.types, { $id: `gts://${END}`, $schema: 'https://json-schema.org/draft/2020-12/schema', type: 'object' }] },
      ]);
      expect(outcome.ok).toBe(true);
      expect(lines).toEqual([expect.stringMatching(PART_LINE)]);
      const result = registerDashboard(types, dashboardOf([{ size: 'small', widget: myWidget('1a2b3c4d-0000-4000-8000-000000000006') }]), outcome.ok ? outcome.rejected : undefined);
      expect(result.ok).toBe(true);
      expect(result.ok && [...result.failed.keys()]).toEqual([slotOf(0, 'cell')]);
      expect(result.ok && result.failed.get(slotOf(0, 'cell'))).toMatch(/GTS validation failed|is left out/);
    });

    it('names the left-out part behind two branches that converge on a shared ancestor, in either allOf order', () => {
      // Two branches of the widget type's allOf meet in one shared ancestor, whose parent holds the left-out pie
      // type as its own parent. The long branch holds 19 store-held links, so it reaches the shared node at hop
      // 20, the bound: the node itself is walked, but its parent, the one that holds the pie `$ref`, sits at hop
      // 21 and is not walked, and the pie type is only read out of the record where the walk meets it. A walk that
      // never revisits a node keeps the shared node marked from the long branch, the short branch that reaches it
      // at hop 4 is dropped on it, and the pie part's line is lost, which is what the long-branch-first order
      // shows before the fix. A node the walk reaches again with fewer hops is walked again, so both orders name
      // the part, and the bound still ends a cycle: hops only grow along a walk, so no id ever comes back with
      // fewer hops.
      const SHARED = 'gts.frontx.dashboard.widget.widget.v1~frontx.dashboard.widget.data_widget.v1~frontx.test.widget.shared.v1~';
      const SHARED_PARENT = 'gts.frontx.dashboard.widget.widget.v1~frontx.dashboard.widget.data_widget.v1~frontx.test.widget.shared_parent.v1~';
      const LONG_LINKS = 19;
      const longLink = (n: number) => `gts.frontx.dashboard.widget.widget.v1~frontx.dashboard.widget.data_widget.v1~frontx.test.widget.long_${n}.v1~`;
      const shortLink = (n: number) => `gts.frontx.dashboard.widget.widget.v1~frontx.dashboard.widget.data_widget.v1~frontx.test.widget.short_${n}.v1~`;
      const SHORT_LINKS = 3;
      const plainType = (id: string, parent: string) => ({
        $id: `gts://${id}`,
        $schema: 'https://json-schema.org/draft/2020-12/schema',
        type: 'object',
        allOf: [{ $ref: `gts://${parent}` }],
      });
      const branches: Record<string, unknown>[] = [];
      for (let n = 1; n <= LONG_LINKS; n += 1) branches.push(plainType(longLink(n), n < LONG_LINKS ? longLink(n + 1) : SHARED));
      for (let n = 1; n <= SHORT_LINKS; n += 1) branches.push(plainType(shortLink(n), n < SHORT_LINKS ? shortLink(n + 1) : SHARED));
      branches.push(plainType(SHARED, SHARED_PARENT), plainType(SHARED_PARENT, PIE));
      const myType = (longFirst: boolean) => ({
        ...widgetType(MY_TYPE, longFirst ? longLink(1) : shortLink(1)),
        allOf: [
          { $ref: 'gts://gts.frontx.dashboard.widget.widget.v1~frontx.dashboard.widget.data_widget.v1~' },
          { $ref: `gts://${longFirst ? longLink(1) : shortLink(1)}` },
          { $ref: `gts://${longFirst ? shortLink(1) : longLink(1)}` },
        ],
      });
      for (const longFirst of [true, false]) {
        const { types, outcome, lines } = loadedParts([DEMO_WITHOUT_BUNDLES, otherPart(), productPart(myType(longFirst), ...branches), leftOutPiePart()]);
        expect(outcome.ok, longFirst ? 'long branch first' : 'short branch first').toBe(true);
        expect(lines, longFirst ? 'long branch first' : 'short branch first').toEqual([expect.stringMatching(PART_LINE)]);
        const result = registerDashboard(types, dashboardOf([{ size: 'small', widget: myWidget('1a2b3c4d-0000-4000-8000-000000000007') }]), outcome.ok ? outcome.rejected : undefined);
        expect(result.ok, longFirst ? 'long branch first' : 'short branch first').toBe(true);
        expect(result.ok && [...result.failed.keys()], longFirst ? 'long branch first' : 'short branch first').toEqual([slotOf(0, 'cell')]);
        expect(result.ok && result.failed.get(slotOf(0, 'cell')), longFirst ? 'long branch first' : 'short branch first').toMatch(PART_LINE);
      }
    });
  });
});

describe('the render type of a widget type', () => {
  const productType = (name: string, schema: Record<string, unknown>) => ({
    $id: `gts://${PIE.replace('pie_chart.v1~', `${name}.v1~`)}`,
    $schema: 'https://json-schema.org/draft/2020-12/schema',
    'x-gts-traits': { entry: PIE_ENTRY, data_type: PIE_DATA },
    ...schema,
  });
  const typesWith = (...extra: Record<string, unknown>[]) => loaded({ ...DEMO_SERVED_FILE, types: [...DEMO_SERVED_FILE.types, ...extra] }).types;
  const base = 'gts.frontx.dashboard.widget.render.v1~';

  it('is the $ref of render in an allOf member, as the catalog types declare it', () => {
    expect(renderTypeOf(loaded().types, PIE)).toBe(PIE_RENDER);
  });

  // The render base only groups render types, so the render_widget action can name one type for every render;
  // each catalog widget type names its own render type, read by the root's own rule. The type count and the
  // closed render types are checked in 'registration order under reference lookup' (the fifteen shipped types,
  // and an extra render field failing each of them).
  it('is, for every catalog widget type, its own render type, one to one with the catalog render types', () => {
    const types = loaded().types;
    // No bundle type is abstract: the abstract bases are the dashboard root's own schemas, so the bundles carry none.
    expect(IN_BUNDLE_PARTS.types.some((type) => (type as { 'x-gts-abstract'?: boolean })['x-gts-abstract'])).toBe(false);
    const ids = IN_BUNDLE_PARTS.types.map((type) => String(type.$id).replace(/^gts:\/\//, ''));
    const named = ids.filter((id) => id.startsWith('gts.frontx.dashboard.widget.widget.v1~')).map((id) => [id, renderTypeOf(types, id)] as const);
    const derived = ids.filter((id) => id.startsWith(base) && id !== base);
    for (const [id, renderType] of named) expect(renderType, `${id} names a render type of its own`).not.toBe(base);
    const shared = named.filter(([, renderType], i) => named.findIndex(([, other]) => other === renderType) !== i).map(([id, renderType]) => `${id} -> ${renderType}`);
    expect(shared, 'widget types that name a render type another widget type names').toEqual([]);
    expect(named.map(([, renderType]) => renderType).sort()).toEqual([...derived].sort());
  });

  it('is the $ref of render in the top-level properties', () => {
    const top = productType('top_render', { allOf: [{ $ref: `gts://${PIE.replace('frontx.dashboard.widget.pie_chart.v1~', '')}` }], properties: { render: { $ref: `gts://${PIE_RENDER}` } } });
    expect(renderTypeOf(typesWith(top), PIE.replace('pie_chart.v1~', 'top_render.v1~'))).toBe(PIE_RENDER);
  });

  it('is the render base for an inline render, and for a type that declares no render of its own', () => {
    const inline = productType('inline_render', { allOf: [{ $ref: `gts://${PIE.replace('frontx.dashboard.widget.pie_chart.v1~', '')}` }, { properties: { render: { type: 'object' } } }] });
    const bare = productType('bare_render', { allOf: [{ $ref: `gts://${PIE.replace('frontx.dashboard.widget.pie_chart.v1~', '')}` }] });
    const types = typesWith(inline, bare);
    expect(renderTypeOf(types, PIE.replace('pie_chart.v1~', 'inline_render.v1~'))).toBe(base);
    expect(renderTypeOf(types, PIE.replace('pie_chart.v1~', 'bare_render.v1~'))).toBe(base);
  });

  it('is the one $ref among the render declarations of a type, whatever their order, and fails two different ones', () => {
    const parent = { $ref: `gts://${PIE.replace('frontx.dashboard.widget.pie_chart.v1~', '')}` };
    const refFirst = productType('ref_first', { allOf: [parent, { properties: { render: { $ref: `gts://${PIE_RENDER}` } } }, { properties: { render: {} } }] });
    const inlineFirst = productType('inline_first', { allOf: [parent, { properties: { render: {} } }, { properties: { render: { $ref: `gts://${PIE_RENDER}` } } }] });
    const hiddenOutside = productType('hidden_outside', { properties: { render: {} }, allOf: [parent, { properties: { render: { $ref: `gts://${PIE_DATA}` } } }] });
    const two = productType('two_refs', { properties: { render: { $ref: `gts://${PIE_RENDER}` } }, allOf: [parent, { properties: { render: { $ref: `gts://${base}` } } }] });
    const types = typesWith(refFirst, inlineFirst, hiddenOutside, two);
    expect(renderTypeOf(types, PIE.replace('pie_chart.v1~', 'ref_first.v1~'))).toBe(PIE_RENDER);
    expect(renderTypeOf(types, PIE.replace('pie_chart.v1~', 'inline_first.v1~'))).toBe(PIE_RENDER);
    expect(() => renderTypeOf(types, PIE.replace('pie_chart.v1~', 'hidden_outside.v1~'))).toThrow(`names ${PIE_DATA}, which is not the render base`);
    expect(() => renderTypeOf(types, PIE.replace('pie_chart.v1~', 'two_refs.v1~'))).toThrow(`names more than one render type: ${PIE_RENDER}, ${base}`);
  });

  it('fails a type whose render names by $ref a type that is not the render base or derived from it, naming that type', () => {
    const parent = { $ref: `gts://${PIE.replace('frontx.dashboard.widget.pie_chart.v1~', '')}` };
    const data = productType('data_render', { allOf: [parent, { properties: { render: { $ref: `gts://${PIE_DATA}` } } }] });
    const near = productType('near_render', { allOf: [parent, { properties: { render: { $ref: `gts://${base.replace('render.v1~', 'render.v2~')}` } } }] });
    // The base id with one more digit before its `~` shares every character of the base but the `~`.
    const longer = productType('longer_render', { allOf: [parent, { properties: { render: { $ref: `gts://${base.replace('render.v1~', 'render.v10~')}` } } }] });
    const types = typesWith(data, near, longer);
    expect(() => renderTypeOf(types, PIE.replace('pie_chart.v1~', 'data_render.v1~'))).toThrow(`names ${PIE_DATA}, which is not the render base ${base}`);
    expect(() => renderTypeOf(types, PIE.replace('pie_chart.v1~', 'near_render.v1~'))).toThrow(`names ${base.replace('render.v1~', 'render.v2~')}, which is not the render base`);
    expect(() => renderTypeOf(types, PIE.replace('pie_chart.v1~', 'longer_render.v1~'))).toThrow(`names ${base.replace('render.v1~', 'render.v10~')}, which is not the render base`);
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

// The radial_progress data type on the real store: what a transform result must carry, as the root registers it.
describe('the radial_progress data type', () => {
  const RADIAL_DATA = 'gts.frontx.dashboard.widget_data.widget_data.v1~frontx.dashboard.widget_data.radial_progress.v1~';
  const problemOf = problemOfFor(RADIAL_DATA, 'b1');

  it.each([
    ['a current, a target and a goal', { current: 3, target: 10, goal: 8 }],
    ['null values and no goal', { current: null, target: null }],
  ])('takes %s', (_name, data) => {
    expect(problemOf(data)).toBeNull();
  });

  it.each([
    ['a missing target', { current: 3 }, /required property 'target'/],
    ['a string current', { current: '3', target: 10 }, /\/current is not of type/],
    ['a field it does not declare', { current: 3, target: 10, label: 'a' }, /unevaluated property/i],
  ])('fails %s', (_name, data, reason) => {
    expect(problemOf(data)).toMatch(reason);
  });
});

// The radar_chart data type on the real store: what a transform result must carry, as the root registers it.
describe('the radar_chart data type', () => {
  const RADAR_DATA = 'gts.frontx.dashboard.widget_data.widget_data.v1~frontx.dashboard.widget_data.radar_chart.v1~';
  const problemOf = problemOfFor(RADAR_DATA, 'd1');
  const points = (count: number) =>
    Array.from({ length: count }, (_, index) => ({ axis: `a${index}`, series: null, value: index % 3 }));

  it.each([
    ['three points of one unnamed series', { points: points(3) }],
    // 12 axes, and six series: the unnamed one and s1 to s5.
    ['120 points of six series, a null value and a null series', { points: [...Array.from({ length: 119 }, (_, index) => ({ axis: `a${index % 12}`, series: index % 6 === 0 ? null : `s${index % 6}`, value: index % 3 })), { axis: 'a11', series: 's5', value: null }] }],
  ])('takes %s', (_name, data) => {
    expect(problemOf(data)).toBeNull();
  });

  it.each([
    ['no points field', {}, /required property 'points'/],
    ['two points', { points: points(2) }, /\/points Too few items in `#\/points`, should be at least `3`/],
    ['121 points', { points: points(121) }, /\/points Too many items in `#\/points`, should be `120` at most/],
    ['a number axis', { points: [{ axis: 7, series: null, value: 1 }] }, /\/points\/0\/axis is not of type/],
    ['an axis over 40 characters', { points: [{ axis: 'x'.repeat(41), series: null, value: 1 }] }, /\/points\/0\/axis .* maximum length of `40`/],
    ['an empty axis', { points: [{ axis: '', series: null, value: 1 }] }, /\/points\/0\/axis .* minimum length of `1`/],
    ['a series over 40 characters', { points: [{ axis: 'a', series: 'x'.repeat(41), value: 1 }] }, /\/points\/0\/series .* maximum length of `40`/],
    ['a point without a series', { points: [{ axis: 'a', value: 1 }] }, /required property 'series'/],
    ['a string value', { points: [{ axis: 'a', series: null, value: '3' }] }, /\/points\/0\/value is not of type/],
    ['an extra point field', { points: [{ axis: 'a', series: null, value: 1, color: 'red' }] }, /\/points\/0 Additional property `color`/],
  ])('fails %s', (_name, data, reason) => {
    expect(problemOf(data)).toMatch(reason);
  });
});

// The funnel_chart data type on the real store: what a transform result must carry, as the root registers it.
describe('the funnel_chart data type', () => {
  const FUNNEL_DATA = 'gts.frontx.dashboard.widget_data.widget_data.v1~frontx.dashboard.widget_data.funnel_chart.v1~';
  const problemOf = problemOfFor(FUNNEL_DATA, 'c1');
  const stages = (count: number) => Array.from({ length: count }, (_, index) => ({ label: `Stage ${index + 1}`, value: 100 - index }));

  it.each([
    ['one stage', { stages: stages(1) }],
    ['twelve stages, a null value and an 80-character label', { stages: [...stages(11), { label: 'x'.repeat(80), value: null }] }],
  ])('takes %s', (_name, data) => {
    expect(problemOf(data)).toBeNull();
  });

  it.each([
    ['no stages field', {}, /required property 'stages'/],
    ['no stage', { stages: [] }, /\/stages Too few items in `#\/stages`, should be at least `1`/],
    ['thirteen stages', { stages: stages(13) }, /\/stages Too many items in `#\/stages`, should be `12` at most/],
    ['a string value', { stages: [{ label: 'a', value: '3' }] }, /\/stages\/0\/value is not of type/],
    ['a label over 80 characters', { stages: [{ label: 'x'.repeat(81), value: 3 }] }, /\/stages\/0\/label .* maximum length of `80`/],
    ['an empty label', { stages: [{ label: '', value: 3 }] }, /\/stages\/0\/label .* minimum length of `1`/],
    ['a stage without a value', { stages: [{ label: 'a' }] }, /required property 'value'/],
    ['an extra stage field', { stages: [{ label: 'a', value: 1, color: 'red' }] }, /\/stages\/0 Additional property `color`/],
  ])('fails %s', (_name, data, reason) => {
    expect(problemOf(data)).toMatch(reason);
  });
});

// The treemap_chart data type on the real store: what a transform result must carry, as the root registers it.
describe('the treemap_chart data type', () => {
  const TREEMAP_DATA = 'gts.frontx.dashboard.widget_data.widget_data.v1~frontx.dashboard.widget_data.treemap_chart.v1~';
  const problemOf = problemOfFor(TREEMAP_DATA, 'e1');
  const items = (count: number) => Array.from({ length: count }, (_, index) => ({ label: `i${index}`, value: index % 3, group: null }));

  it.each([
    ['one item', { items: items(1) }],
    ['60 items with groups, a null group, a null value and a 0', { items: [...items(58), { label: 'z', value: null, group: 'g' }, { label: 'y', value: 0, group: null }] }],
  ])('takes %s', (_name, data) => {
    expect(problemOf(data)).toBeNull();
  });

  it.each([
    ['no items field', {}, /required property 'items'/],
    ['no item', { items: [] }, /\/items Too few items in `#\/items`, should be at least `1`/],
    ['61 items', { items: items(61) }, /\/items Too many items in `#\/items`, should be `60` at most/],
    ['a number label', { items: [{ label: 7, value: 1, group: null }] }, /\/items\/0\/label is not of type/],
    ['a label over 80 characters', { items: [{ label: 'x'.repeat(81), value: 1, group: null }] }, /\/items\/0\/label .* maximum length of `80`/],
    ['an empty label', { items: [{ label: '', value: 1, group: null }] }, /\/items\/0\/label .* minimum length of `1`/],
    ['a group over 40 characters', { items: [{ label: 'a', value: 1, group: 'x'.repeat(41) }] }, /\/items\/0\/group .* maximum length of `40`/],
    ['an item without a group', { items: [{ label: 'a', value: 1 }] }, /required property 'group'/],
    ['a string value', { items: [{ label: 'a', value: '3', group: null }] }, /\/items\/0\/value is not of type/],
    ['an extra item field', { items: [{ label: 'a', value: 1, group: null, color: 'red' }] }, /\/items\/0 Additional property `color`/],
  ])('fails %s', (_name, data, reason) => {
    expect(problemOf(data)).toMatch(reason);
  });
});

// The waterfall_chart data type on the real store: what a transform result must carry, as the root registers it.
describe('the waterfall_chart data type', () => {
  const WATERFALL_DATA = 'gts.frontx.dashboard.widget_data.widget_data.v1~frontx.dashboard.widget_data.waterfall_chart.v1~';
  const problemOf = problemOfFor(WATERFALL_DATA, 'f1');
  const steps = (count: number) => Array.from({ length: count }, (_, index) => ({ label: `s${index}`, value: index % 4 - 1, kind: index % 3 === 2 ? 'total' : 'delta' }));

  it.each([
    ['two steps, the first a total that starts the sum', { steps: [{ label: 'Start', value: 5, kind: 'total' }, { label: 'a', value: -2, kind: 'delta' }] }],
    ['24 steps with kinds, a null delta and a null-value total', { steps: [...steps(21), { label: 'n', value: null, kind: 'delta' }, { label: 'm', value: null, kind: 'total' }, { label: 'End', value: 3, kind: 'total' }] }],
  ])('takes %s', (_name, data) => {
    expect(problemOf(data)).toBeNull();
  });

  it.each([
    ['no steps field', {}, /required property 'steps'/],
    ['no step', { steps: [] }, /\/steps Too few items in `#\/steps`, should be at least `2`/],
    ['25 steps', { steps: steps(25) }, /\/steps Too many items in `#\/steps`, should be `24` at most/],
    ['a number label', { steps: [{ label: 7, value: 1 }] }, /\/steps\/0\/label is not of type/],
    ['a label over 80 characters', { steps: [{ label: 'x'.repeat(81), value: 1 }] }, /\/steps\/0\/label .* maximum length of `80`/],
    ['an empty label', { steps: [{ label: '', value: 1 }] }, /\/steps\/0\/label .* minimum length of `1`/],
    ['a string value', { steps: [{ label: 'a', value: '3' }] }, /\/steps\/0\/value is not of type/],
    ['a step without a value', { steps: [{ label: 'a' }] }, /required property 'value'/],
    ['a kind outside its values', { steps: [{ label: 'a', value: 1, kind: 'sum' }] }, /\/steps\/0\/kind .* one of/],
    ['an extra step field', { steps: [{ label: 'a', value: 1, color: 'red' }] }, /\/steps\/0 Additional property `color`/],
  ])('fails %s', (_name, data, reason) => {
    expect(problemOf(data)).toMatch(reason);
  });
});

// The activity_feed data type on the real store: what a transform result must carry, as the root registers it.
describe('the activity_feed data type', () => {
  const FEED_DATA = 'gts.frontx.dashboard.widget_data.widget_data.v1~frontx.dashboard.widget_data.activity_feed.v1~';
  const problemOf = problemOfFor(FEED_DATA, 'a1');
  const items = (count: number) => Array.from({ length: count }, (_, index) => ({ time: '2026-11-04', title: `item ${index}` }));

  it.each([
    ['no items', { items: [] }],
    ['a bare date and an ISO 8601 date-time, with an optional text, tone and href', { items: [{ time: '2026-11-04', title: 'Deployed' }, { time: '2026-11-04T09:24:00Z', title: 'REQ-1042 in payments-api', text: 'Fix retry policy', tone: 'info', href: '/pulls/1042' }] }],
    ['200 items', { items: items(200) }],
  ])('takes %s', (_name, data) => {
    expect(problemOf(data)).toBeNull();
  });

  it.each([
    ['no items field', {}, /required property 'items'/],
    ['201 items', { items: items(201) }, /\/items Too many items in `#\/items`, should be `200` at most/],
    ['a number time', { items: [{ time: 7, title: 'a' }] }, /\/items\/0\/time is not of type/],
    ['an item without a time', { items: [{ title: 'a' }] }, /\/items\/0 must have required property 'time'/],
    ['a number title', { items: [{ time: '2026-11-04', title: 7 }] }, /\/items\/0\/title is not of type/],
    ['an item without a title', { items: [{ time: '2026-11-04' }] }, /\/items\/0 must have required property 'title'/],
    ['an empty title', { items: [{ time: '2026-11-04', title: '' }] }, /\/items\/0\/title .* minimum length of `1`/],
    ['a title over 120 characters', { items: [{ time: '2026-11-04', title: 'x'.repeat(121) }] }, /\/items\/0\/title .* maximum length of `120`/],
    ['a text over 400 characters', { items: [{ time: '2026-11-04', title: 'a', text: 'x'.repeat(401) }] }, /\/items\/0\/text .* maximum length of `400`/],
    ['a tone outside the shared tones', { items: [{ time: '2026-11-04', title: 'a', tone: 'purple' }] }, /\/items\/0\/tone .* one of/],
    ['a number href', { items: [{ time: '2026-11-04', title: 'a', href: 5 }] }, /\/items\/0\/href is not of type/],
    ['an extra item field', { items: [{ time: '2026-11-04', title: 'a', color: 'red' }] }, /\/items\/0 Additional property `color`/],
    ['an extra top field', { items: [], more: true }, /Invalid unevaluated property `#\/more`/],
  ])('fails %s', (_name, data, reason) => {
    expect(problemOf(data)).toMatch(reason);
  });

  // The time is a string to the schema: the widget's own cross-check refuses what no date reads as.
  it('takes an unparsable time at the schema, which the widget cross-check fails the cell for', () => {
    expect(problemOf({ items: [{ time: 'not a date', title: 'a' }] })).toBeNull();
  });
});

// The grid data type on the real store: the row cap, and the full count of a result the rows are the first part of.
describe('the grid data type', () => {
  const GRID_DATA = 'gts.frontx.dashboard.widget_data.widget_data.v1~frontx.dashboard.widget_data.grid.v1~';
  const problemOf = problemOfFor(GRID_DATA, '9a');
  const rows = (count: number) => Array.from({ length: count }, (_, index) => [`r${index}`]);

  it.each([
    ['500 rows', { rows: rows(500) }],
    ['500 rows of a result of 650', { rows: rows(500), total_rows: 650 }],
    ['a null total_rows', { rows: rows(2), total_rows: null }],
  ])('takes %s', (_name, data) => {
    expect(problemOf(data)).toBeNull();
  });

  it.each([
    ['501 rows, even with total_rows', { rows: rows(501), total_rows: 650 }, /\/rows Too many items in `#\/rows`, should be `500` at most/],
    ['a fractional total_rows', { rows: rows(2), total_rows: 2.5 }, /\/total_rows is not of type/],
    ['a string total_rows', { rows: rows(2), total_rows: '650' }, /\/total_rows is not of type/],
    ['a negative total_rows', { rows: rows(2), total_rows: -1 }, /\/total_rows Value in `#\/total_rows` is `-1`, but should be `0` at minimum/],
    ['an extra top field', { rows: rows(2), total: 650 }, /Invalid unevaluated property `#\/total`/],
  ])('fails %s', (_name, data, reason) => {
    expect(problemOf(data)).toMatch(reason);
  });

  // The schema says only integer: the widget cross-check fails a count below the rows delivered.
  it('takes a total_rows below the rows at the schema, which the widget cross-check fails the cell for', () => {
    expect(problemOf({ rows: rows(2), total_rows: 1 })).toBeNull();
  });
});

// Why every catalog widget checks its numbers itself: a transform can compute NaN or an infinity (CEL `0.0/0.0`,
// `1.0/0.0`), and the store takes them in a `number` field, and NaN even in an `integer` one.
describe('numbers that are not finite, on the real store', () => {
  const METRIC_DATA = 'gts.frontx.dashboard.widget_data.widget_data.v1~frontx.dashboard.widget_data.metric_card.v1~';
  const GRID_RENDER = 'gts.frontx.dashboard.widget.render.v1~frontx.dashboard.widget.grid_render.v1~';
  const validOf = (instance: Record<string, unknown>) => {
    const { types } = loaded();
    try {
      types.register(instance);
    } catch {
      return false;
    }
    return types.validateInstance(String(instance.id)).valid;
  };

  it.each([NaN, Infinity, -Infinity])('takes %s in a number field of a data type', (value) => {
    expect(validOf({ id: `${METRIC_DATA}1a2b3c4d-0000-4000-8000-0000000000a1`, value })).toBe(true);
  });

  it.each([
    [NaN, true],
    [Infinity, false],
    [-Infinity, false],
  ])('takes %s in an integer field of a render type: %s', (value, taken) => {
    expect(validOf({ id: `${GRID_RENDER}1a2b3c4d-0000-4000-8000-0000000000a2`, columns: [{ key: 'a' }], frozen_columns: value })).toBe(taken);
  });
});
