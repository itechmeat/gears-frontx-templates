import { GtsPlugin } from '@gears-frontx/gts-plugin';
import { describe, expect, it } from 'vitest';

import { cellFailuresOf } from '../layout/layoutChecks';
import { RENDER_WIDGET_ACTION_ID, WIDGET_EXT_TYPE_ID } from '../contract';
import { BUNDLE_SCHEMAS, SHARED_PROPERTY_SCHEMAS, WIDGETS_DOMAIN } from './index';

// A minimal concrete widget type: the widget base is abstract, so an embedded widget names a type derived from it.
const TEST_WIDGET = 'gts.frontx.dashboard.widget.widget.v1~frontx.dashboard.widget.test_card.v1~';
const widgetId = (uuid: string) => `${TEST_WIDGET}${uuid}`;

const TEST_MANIFEST = 'gts.frontx.mfes.mfe.mf_manifest.v1~frontx.dashboard.mfe.test.v1';
const TEST_ENTRY = 'gts.frontx.mfes.mfe.entry.v1~frontx.mfes.mfe.entry_mf.v1~frontx.dashboard.mfe.test_card.v1';

// gts-plugin resolves every reference, the `entry` trait included, so the test type gets a registered entry and manifest.
function plugin() {
  const gts = new GtsPlugin({ isolated: true });
  for (const schema of BUNDLE_SCHEMAS) gts.registerSchema(schema);
  gts.register({
    id: TEST_MANIFEST,
    name: 'test',
    metaData: { name: 'test', type: 'app', buildInfo: { buildVersion: '1', buildName: 'test' }, remoteEntry: { name: 'remoteEntry.js', path: '', type: 'module' }, publicPath: '/' },
    shared: [],
  });
  gts.register({
    id: TEST_ENTRY,
    requiredProperties: [],
    actions: [],
    domainActions: [],
    manifest: TEST_MANIFEST,
    exposedModule: './test',
    exposeAssets: { js: { sync: [], async: [] }, css: { sync: [], async: [] } },
  });
  gts.registerSchema({
    $id: `gts://${TEST_WIDGET}`,
    $schema: 'https://json-schema.org/draft/2020-12/schema',
    'x-gts-traits': { entry: TEST_ENTRY },
    allOf: [{ $ref: 'gts://gts.frontx.dashboard.widget.widget.v1~' }, { type: 'object', properties: { render: { additionalProperties: false } } }],
    unevaluatedProperties: false,
  });
  return gts;
}

function dashboard(layout: unknown, extra: Record<string, unknown> = {}) {
  return {
    id: 'gts.frontx.dashboard.dashboard.dashboard.v1~7f3c2a10-5b8e-4d21-9c6f-2e4a8b1d0c35',
    title: 'Sample',
    layout,
    ...extra,
  };
}

// The instance paths a gts-plugin 0.6 rejection names: its `Reason:` line joins the failures with `; `,
// each starting with its instance path (`/` alone for the root).
function instancePathsOf(error: unknown): string[] {
  const reason = /^Reason: (.*)$/m.exec(error instanceof Error ? error.message : String(error))?.[1] ?? '';
  return reason
    .split('; ')
    .map((failure) => /^(\/\S*)/.exec(failure)?.[1])
    .filter((path): path is string => path !== undefined);
}

type Embedded = { widget?: { id?: unknown }; larger_view?: { id?: unknown } };

// gts-plugin validates on registration, throws on an invalid instance, and looks up every
// x-gts-instance-ref, so the embedded widget instances are registered before the dashboard.
// A rejection reports the instance paths the plugin names, read as the dashboard root reads them.
function validate(instance: { id: string; layout?: unknown }): { valid: boolean; paths: string[] } {
  const gts = plugin();
  const cells = ((instance.layout as { cells?: Embedded[] } | undefined)?.cells ?? []) as Embedded[];
  for (const embedded of cells.flatMap((item) => [item.widget, item.larger_view])) {
    if (typeof embedded?.id === 'string') gts.register(embedded);
  }
  try {
    gts.register(instance);
  } catch (error) {
    return { valid: false, paths: instancePathsOf(error) };
  }
  return { valid: gts.validateInstance(instance.id).valid, paths: [] };
}

const cell = (uuid: string, extra: Record<string, unknown> = {}) => ({ size: 'small', widget: { id: widgetId(uuid), render: {} }, ...extra });
const ID = '0c9e4b72-3d1a-4f6e-8b25-91a7c4e0d6f3';

describe('bundle schemas (GTS 0.17 through gts-plugin 0.6)', () => {
  it('accepts a dashboard with size and height classes and an optional flexible flag', () => {
    const result = validate(
      dashboard({
        flexible: false,
        cells: [
          cell(ID, { height: 'high' }),
          cell('5a2d8e14-9f07-4c3b-a6d1-2e8f0b7c4a59', { size: 'large', larger_view: { id: widgetId('9b1f6c3e-2a47-4d8e-b5c0-7e3a1d9f4b62'), render: {} } }),
        ],
      }),
    );
    expect(result).toEqual({ valid: true, paths: [] });
  });

  it('accepts a widget with a description of 1 to 160 characters and rejects an empty or longer one', () => {
    const widget = (description: string) => ({ id: widgetId(ID), title: 'Orders', description, render: {} });
    expect(() => plugin().register(widget('x'.repeat(160)))).not.toThrow();
    for (const description of ['', 'x'.repeat(161)]) {
      let paths: string[] = [];
      try {
        plugin().register(widget(description));
      } catch (error) {
        paths = instancePathsOf(error);
      }
      expect(paths).toContain('/description');
    }
  });

  it('accepts an empty layout', () => {
    expect(validate(dashboard({ cells: [] })).valid).toBe(true);
  });

  it.each([
    ['a size outside its values', { size: 'huge' }],
    ['a height outside its values', { height: 'tall' }],
    ['a coordinate field, which the cell does not declare', { x: 0 }],
  ])('rejects a cell with %s as a cell failure of that cell', (_name, extra) => {
    const result = validate(dashboard({ cells: [cell('5a2d8e14-9f07-4c3b-a6d1-2e8f0b7c4a59'), cell(ID, extra)] }));
    expect(result.valid).toBe(false);
    expect(result.paths.every((path) => path.startsWith('/layout/cells/1'))).toBe(true);
    expect(cellFailuresOf(result.paths)).toEqual([1]);
  });

  it('rejects a cell with no widget as a cell failure', () => {
    const result = validate(dashboard({ cells: [{ size: 'small' }] }));
    expect(result.valid).toBe(false);
    expect(cellFailuresOf(result.paths)).toEqual([0]);
  });

  it('rejects a dashboard with an extra field such as theme at the root, with no cell failure', () => {
    const result = validate(dashboard({ cells: [] }, { theme: 'dark' }));
    expect(result.valid).toBe(false);
    expect(result.paths).toEqual(['/']);
    expect(cellFailuresOf(result.paths)).toEqual([]);
  });

  it('rejects a requests name that breaks the name pattern', () => {
    const result = validate(dashboard({ cells: [] }, { requests: { 'Bad-Name': { method: 'GET', path: '/a' } } }));
    expect(result.valid).toBe(false);
    expect(result.paths.some((path) => path.startsWith('/requests'))).toBe(true);
  });

  it('accepts a named GET request and rejects a request to another host', () => {
    expect(validate(dashboard({ cells: [] }, { requests: { activity: { method: 'GET', path: '/a?b=1' } } })).valid).toBe(true);
    const result = validate(dashboard({ cells: [] }, { requests: { activity: { method: 'GET', path: '//other.example/x' } } }));
    expect(result.valid).toBe(false);
    expect(result.paths).toContain('/requests/activity/path');
  });
  describe('request variables', () => {
    const withRequests = (requests: Record<string, unknown>, extra: Record<string, unknown> = {}) => validate(dashboard({ cells: [] }, { requests, ...extra }));

    it('accepts requests that name variables, and requests without any', () => {
      expect(withRequests({ activity: { method: 'GET', path: '/a?b=1', variables: { period: 'period' } } })).toEqual({ valid: true, paths: [] });
      expect(withRequests({ totals: { method: 'POST', path: '/t', body: { a: 1 }, variables: { 'filter.period': 'period' } } }).valid).toBe(true);
      expect(withRequests({ activity: { method: 'GET', path: '/a' } }).valid).toBe(true);
    });

    it('rejects a dashboard that declares variables: the host owns them', () => {
      const result = withRequests({}, { variables: { period: { title: 'Period', options: [{ value: '7d', label: 'Last 7 days' }], default: '7d' } } });
      expect(result.valid).toBe(false);
    });

    it.each([
      ['a value that is not a variable name', { period: 'Period' }],
      ['a key outside the key pattern', { '1period': 'period' }],
      ['a value that is not a string', { period: 7 }],
    ])('rejects request variables with %s', (_name, variables) => {
      const result = withRequests({ activity: { method: 'GET', path: '/a', variables } });
      expect(result.valid).toBe(false);
      expect(result.paths.some((path) => path.startsWith('/requests/activity/variables'))).toBe(true);
    });
  });

  // gts-plugin 0.6 validates with reference lookup on. The DESIGN GTS rules rest on these two facts.
  it('rejects a widget whose entry is not registered, and a dashboard at the id of a widget that is not registered', () => {
    const gts = plugin();
    const dangling = 'gts.frontx.dashboard.widget.widget.v1~frontx.dashboard.widget.dangling_card.v1~';
    gts.registerSchema({
      $id: `gts://${dangling}`,
      $schema: 'https://json-schema.org/draft/2020-12/schema',
      'x-gts-traits': { entry: 'gts.frontx.mfes.mfe.entry.v1~frontx.mfes.mfe.entry_mf.v1~frontx.dashboard.mfe.missing.v1' },
      allOf: [{ $ref: 'gts://gts.frontx.dashboard.widget.widget.v1~' }, { type: 'object', properties: { render: { additionalProperties: false } } }],
      unevaluatedProperties: false,
    });
    const orphan = { id: `${dangling}${ID}`, render: {} };
    expect(() => gts.register(orphan)).toThrow(/trait 'entry' x-gts-instance-ref/);
    const registered = { id: widgetId('5a2d8e14-9f07-4c3b-a6d1-2e8f0b7c4a59'), render: {} };
    gts.register(registered);
    let paths: string[] = [];
    try {
      gts.register(dashboard({ cells: [{ size: 'small', widget: registered }, { size: 'small', widget: orphan }] }));
    } catch (error) {
      paths = instancePathsOf(error);
    }
    expect(paths).toEqual(['/layout/cells/1/widget/id']);
    // A known gap the DESIGN names: a path under a widget is not a cell failure (rule owned by layout.test.tsx),
    // so as of now the whole dashboard fails; the runtime slice decides how this stays a failure of the cell.
    expect(cellFailuresOf(paths)).toEqual([]);
  });
});

// The render_widget action as the mfes runtime checks it before a widget gets it: typeSystem.register(action),
// a transient instance with no id, whose target is a registered extension of the widgets domain.
describe('the render_widget action', () => {
  const EXTENSION = `${WIDGET_EXT_TYPE_ID}6f1d2c3b-4a5e-4f60-8b7c-9d0e1f2a3b4c`;

  function registry() {
    const gts = plugin();
    for (const schema of SHARED_PROPERTY_SCHEMAS) gts.registerSchema(schema);
    gts.register(WIDGETS_DOMAIN);
    gts.register({ id: EXTENSION, domain: WIDGETS_DOMAIN.id, entry: TEST_ENTRY });
    return gts;
  }

  const action = (payload: Record<string, unknown>) => ({ type: RENDER_WIDGET_ACTION_ID, target: EXTENSION, payload });

  it.each([
    ['no value_format', {}],
    ['a number value_format', { value_format: { value_type: 'number' } }],
    ['a duration value_format with its unit', { value_format: { value_type: 'duration', unit: 'ms' } }],
    ['a currency value_format with its code', { value_format: { value_type: 'currency', currency: 'EUR' } }],
    ['decimals on a percent', { value_format: { value_type: 'percent', decimals: 0 } }],
    ['a unit label and decimals on a number', { value_format: { value_type: 'number', unit_label: 'lines', decimals: 6 } }],
    ['decimals on a duration', { value_format: { value_type: 'duration', unit: 's', decimals: 1 } }],
  ])('accepts a payload with %s', (_name, extra) => {
    expect(() => registry().register(action({ render: { label: 'Deploys' }, ...extra }))).not.toThrow();
  });

  it.each([
    ['a value_type outside its values', { value_type: 'money' }, '/payload/value_format/value_type'],
    ['a duration with no unit', { value_type: 'duration' }, '/payload/value_format'],
    ['a unit on a number', { value_type: 'number', unit: 's' }, '/payload/value_format'],
    ['a currency with no code', { value_type: 'currency' }, '/payload/value_format'],
    ['a currency code on a number', { value_type: 'number', currency: 'EUR' }, '/payload/value_format'],
    ['a currency code that is not three capital letters', { value_type: 'currency', currency: 'eur' }, '/payload/value_format/currency'],
    ['a unit label on a percent', { value_type: 'percent', unit_label: 'points' }, '/payload/value_format'],
    ['decimals over 6', { value_type: 'number', decimals: 7 }, '/payload/value_format/decimals'],
    ['negative decimals', { value_type: 'number', decimals: -1 }, '/payload/value_format/decimals'],
    ['fractional decimals', { value_type: 'number', decimals: 1.5 }, '/payload/value_format/decimals'],
    ['an empty unit label', { value_type: 'number', unit_label: '' }, '/payload/value_format/unit_label'],
    ['a unit label of 25 characters', { value_type: 'number', unit_label: 'x'.repeat(25) }, '/payload/value_format/unit_label'],
    ['an extra field', { value_type: 'number', digits: 2 }, '/payload/value_format'],
  ])('rejects a value_format with %s', (_name, valueFormat, path) => {
    let paths: string[] = [];
    try {
      registry().register(action({ render: {}, value_format: valueFormat }));
    } catch (error) {
      paths = instancePathsOf(error);
    }
    expect(paths).toContain(path);
  });

  it.each([
    ['a string', 'compact'],
    ['an array', [{ label: 'Deploys' }]],
  ])('rejects a render that is %s', (_name, render) => {
    let paths: string[] = [];
    try {
      registry().register(action({ render }));
    } catch (error) {
      paths = instancePathsOf(error);
    }
    expect(paths).toContain('/payload/render');
  });
});

// A product's own data widget type closes render either inline, as the host's deploy_pulse bundle does, or with
// its own render type derived from the render base, as the catalog widget types do.
const RENDER_TYPE = 'gts.frontx.dashboard.widget.render.v1~frontx.dashboard.widget.test_pulse_render.v1~';
const RENDER_FIELDS = { label: { type: 'string' } };

describe.each([
  ['narrowing render inline', [], { additionalProperties: false, properties: RENDER_FIELDS }],
  [
    'with its own render type',
    [
      {
        $id: `gts://${RENDER_TYPE}`,
        $schema: 'https://json-schema.org/draft/2020-12/schema',
        allOf: [{ $ref: 'gts://gts.frontx.dashboard.widget.render.v1~' }, { type: 'object', properties: RENDER_FIELDS }],
        unevaluatedProperties: false,
      },
    ],
    { $ref: `gts://${RENDER_TYPE}` },
  ],
])("a product's own widget type %s", (_name, renderTypes: Record<string, unknown>[], render) => {
  const DATA_TYPE = 'gts.frontx.dashboard.widget_data.widget_data.v1~frontx.dashboard.widget_data.test_pulse.v1~';
  const PULSE = 'gts.frontx.dashboard.widget.widget.v1~frontx.dashboard.widget.data_widget.v1~frontx.dashboard.widget.test_pulse.v1~';

  function registry() {
    const gts = plugin();
    gts.registerSchema({
      $id: `gts://${DATA_TYPE}`,
      $schema: 'https://json-schema.org/draft/2020-12/schema',
      allOf: [{ $ref: 'gts://gts.frontx.dashboard.widget_data.widget_data.v1~' }, { type: 'object', properties: { deploys: { type: 'number' } } }],
      unevaluatedProperties: false,
    });
    for (const schema of renderTypes) gts.registerSchema(schema);
    gts.registerSchema({
      $id: `gts://${PULSE}`,
      $schema: 'https://json-schema.org/draft/2020-12/schema',
      'x-gts-traits': { entry: TEST_ENTRY, data_type: DATA_TYPE },
      allOf: [{ $ref: 'gts://gts.frontx.dashboard.widget.widget.v1~frontx.dashboard.widget.data_widget.v1~' }, { type: 'object', properties: { render } }],
      unevaluatedProperties: false,
    });
    return gts;
  }

  const pulse = (render: Record<string, unknown>) => ({
    id: `${PULSE}${ID}`,
    render,
    value_format: { value_type: 'number' },
    data: { params: {}, transform: "{'deploys': 1}" },
  });

  it('accepts an instance with its own render fields', () => {
    expect(() => registry().register(pulse({ label: 'Deploys' }))).not.toThrow();
  });

  it('rejects an instance with a render field its type does not declare', () => {
    let paths: string[] = [];
    try {
      registry().register(pulse({ label: 'Deploys', not_a_field: 1 }));
    } catch (error) {
      paths = instancePathsOf(error);
    }
    expect(paths).toContain('/render');
  });

  it('rejects an instance with a render field of the wrong type', () => {
    let paths: string[] = [];
    try {
      registry().register(pulse({ label: 5 }));
    } catch (error) {
      paths = instancePathsOf(error);
    }
    expect(paths).toContain('/render/label');
  });
});
