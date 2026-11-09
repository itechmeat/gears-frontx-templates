import { GtsPlugin } from '@gears-frontx/gts-plugin';
import { describe, expect, it } from 'vitest';

import { cellFailuresOf, instancePathsOf } from '../layout/layoutChecks';
import { BUNDLE_SCHEMAS } from './index';

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
    expect(result.paths.length).toBeGreaterThan(0);
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
});
