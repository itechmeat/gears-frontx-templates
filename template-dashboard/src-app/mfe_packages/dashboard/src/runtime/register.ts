import type { TypeSystemPlugin } from '@gears-frontx/mfes';

import { DASHBOARD_TYPE_ID, WIDGET_BASE_TYPE_ID, type Dashboard, type ServedFile, type WidgetInstance } from '../contract';
import { BUNDLE_SCHEMAS, SHARED_PROPERTY_SCHEMAS, STAND_IN, STAND_IN_TYPE_ID } from '../gts';
import { uuidv5, type Role } from './ids';

/*
 * What the dashboard root registers, and in which order (DESIGN §3.6 step 4,
 * ADR-0003). The type store resolves every reference on registration, so the
 * order decides where a dangling reference fails:
 *
 * 1. the bundle: its schemas, and the theme and language property types where the store has none;
 * 2. the served file: its types, then its manifests and entries; a rejection fails every dashboard in the file;
 * 3. each embedded widget instance on its own; a rejection is the failure of that cell or larger view;
 * 4. a stand-in for each widget that failed in step 3, so the dashboard still names a registered widget there;
 * 5. the dashboard instance, which checks each embedded widget against the open widget base.
 */

const message = (error: unknown) => (error instanceof Error ? error.message.split('\n').slice(0, 2).join(' ') : String(error));

const idOf = (schema: Record<string, unknown>) => String(schema.$id ?? '').replace(/^gts:\/\//, '');

/** Step 1. Returns the ids of the bundle schemas, which a served type must not reuse. */
export function registerBundle(types: TypeSystemPlugin): Set<string> {
  for (const schema of BUNDLE_SCHEMAS) types.registerSchema(schema);
  for (const schema of SHARED_PROPERTY_SCHEMAS) if (!types.getSchema(idOf(schema))) types.registerSchema(schema);
  types.registerSchema(STAND_IN.schema);
  for (const instance of STAND_IN.instances) types.register(instance);
  return new Set([...BUNDLE_SCHEMAS.map(idOf), STAND_IN_TYPE_ID]);
}

export type FileOutcome = { ok: true; dashboards: Map<string, Dashboard> } | { ok: false; problem: string };

/** Step 2: the whole served file, or a dashboard-level failure. */
export function registerServedFile(types: TypeSystemPlugin, file: unknown, bundleIds: ReadonlySet<string>): FileOutcome {
  const served = file as Partial<ServedFile> | null;
  if (!served || !Array.isArray(served.types) || !Array.isArray(served.instances)) return { ok: false, problem: 'the served file has no types and instances lists' };
  const isObject = (item: unknown) => item !== null && typeof item === 'object' && !Array.isArray(item);
  if (!served.types.every(isObject) || !served.instances.every(isObject)) return { ok: false, problem: 'the served file has an entry that is not an object' };
  const clash = served.types.map(idOf).find((id) => bundleIds.has(id));
  if (clash) return { ok: false, problem: `served type ${clash} equals a bundle base` };
  const dashboards = new Map<string, Dashboard>();
  try {
    for (const schema of served.types) types.registerSchema(schema);
    for (const instance of served.instances) {
      const id = String(instance.id ?? '');
      if (id.startsWith(DASHBOARD_TYPE_ID)) dashboards.set(id, instance as unknown as Dashboard);
      else types.register(instance);
    }
  } catch (error) {
    return { ok: false, problem: `the registry rejected the served file: ${message(error)}` };
  }
  return { ok: true, dashboards };
}

/** Where a failure of an embedded widget instance shows: its cell, as the widget or as the larger view. */
export const slotOf = (cell: number, role: Role) => `${cell}:${role}`;

export type DashboardOutcome =
  | { ok: true; failed: ReadonlyMap<string, string> }
  | { ok: false; problem: string };

/** Steps 3 to 5 for one dashboard. `failed` maps a slot to the reason its widget instance failed its own registration. */
export function registerDashboard(types: TypeSystemPlugin, dashboard: Dashboard): DashboardOutcome {
  const failed = new Map<string, string>();
  const cells = Array.isArray(dashboard.layout?.cells) ? dashboard.layout.cells : [];
  const validated = cells.map((cell, index) => {
    if (!cell || typeof cell !== 'object') return cell;
    const copy = { ...cell };
    for (const [key, role] of [['widget', 'cell'], ['larger_view', 'larger_view']] as const) {
      const widget = cell[key] as WidgetInstance | undefined;
      // A widget with no string id breaks the open widget base: the dashboard's own validation reports it.
      if (!widget || typeof widget.id !== 'string') continue;
      try {
        types.register(widget);
      } catch (error) {
        failed.set(slotOf(index, role), message(error));
        // The stand-in keeps every field of the widget, so a widget that also breaks the open base still fails the dashboard.
        const standIn = { ...widget, id: `${STAND_IN_TYPE_ID}${uuidv5(`${widget.id.toLowerCase()}|${role}`)}` };
        try {
          types.register(standIn);
          copy[key] = standIn;
        } catch {
          // Left in place: the dashboard registration below fails at this widget, at dashboard level.
        }
      }
    }
    return copy;
  });
  try {
    // Only a well-formed cells list gets its stand-ins; anything else registers as delivered, so the type rejects it.
    const wellFormed = Array.isArray(dashboard.layout?.cells);
    types.register(wellFormed ? { ...dashboard, layout: { ...dashboard.layout, cells: validated } } : dashboard);
  } catch (error) {
    return { ok: false, problem: `the dashboard fails its type: ${message(error)}` };
  }
  return { ok: true, failed };
}

/**
 * The effective traits of a widget type (widget contract FEATURE, "Resolve
 * effective traits"): the trait values merged root to leaf along the type
 * chain, with the trait schema's defaults filled.
 */
export function effectiveTraits(types: TypeSystemPlugin, typeId: string): Record<string, unknown> {
  const segments = typeId.split('~').filter(Boolean);
  const traits: Record<string, unknown> = {};
  const defaults: Record<string, unknown> = {};
  const required = new Set<string>();
  for (let i = 1; i <= segments.length; i++) {
    const id = `${segments.slice(0, i).join('~')}~`;
    const schema = types.getSchema(id) as Record<string, unknown> | undefined;
    if (!schema) throw new Error(`type ${id} is not registered`);
    const traitSchema = schema['x-gts-traits-schema'] as { properties?: Record<string, { default?: unknown }>; required?: string[] } | undefined;
    for (const [name, property] of Object.entries(traitSchema?.properties ?? {})) if (property.default !== undefined) defaults[name] = property.default;
    for (const name of traitSchema?.required ?? []) required.add(name);
    Object.assign(traits, schema['x-gts-traits'] as Record<string, unknown> | undefined);
  }
  const effective = { ...defaults, ...traits };
  for (const name of required) if (effective[name] === undefined) throw new Error(`trait ${name} of ${typeId} is not set`);
  return effective;
}

/** The widget type of an embedded widget instance: its id without the trailing instance segment. */
export const typeOfWidget = (widgetId: string) => widgetId.slice(0, widgetId.lastIndexOf('~') + 1);

export const isWidgetId = (id: unknown): id is string => typeof id === 'string' && id.startsWith(WIDGET_BASE_TYPE_ID);
