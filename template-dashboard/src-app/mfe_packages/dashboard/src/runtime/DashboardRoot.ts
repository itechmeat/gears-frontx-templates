import { GtsPlugin } from '@gears-frontx/gts-plugin';
import type { MfeRegistry, TypeSystemPlugin } from '@gears-frontx/mfes';

import {
  LANGUAGE_PROPERTY_ID,
  RENDER_WIDGET_ACTION_ID,
  THEME_PROPERTY_ID,
  WIDGETS_DOMAIN_ID,
  type Dashboard,
  type WidgetInstance,
} from '../contract';
import { CellFailure, SharedRequests, formOf, runBinding, type Binding } from './binding';
import { withTimeout, type DashboardHost } from './host';
import { extensionIdOf, stampIdOf, type Role } from './ids';
import { effectiveTraits, registerBundle, registerDashboard, registerServedFile, typeOfWidget, type FileOutcome } from './register';
import { createWidgetsRegistry, WidgetEntryHandler, type WidgetEntries } from './registry';

/*
 * The dashboard root of the single-page hosting form: one registry with the
 * `widgets` domain, the served file and the dashboards it loaded, and the
 * flow of every cell (runtime FEATURE "Open a dashboard"). A product creates
 * one root and renders `<Dashboard root={...} />` wherever a dashboard shows;
 * one `Dashboard` at a time per root (DESIGN §2.2, one root per registry).
 */

export type LoadOutcome = { ok: true; dashboard: Dashboard; failed: ReadonlyMap<string, string> } | { ok: false };

/**
 * What a cell shows; the root reports each change to the cell's frame. `placing`: the data is ready and the cell lays out the widget's container, still under its loader, before `render_widget` goes out.
 */
export type CellUpdate = { state: 'loading' | 'placing' | 'shown' | 'cannot-be-shown' } | { container: HTMLElement; placed: () => void };

/** How long the root waits for a cell to take its widget's container before it sends `render_widget` anyway. */
const PLACE_TIMEOUT_MS = 2_000;

export interface DashboardRootOptions {
  /** Answers the root's dashboard and data requests (`fetchHost` for a same-origin API). */
  host: DashboardHost;
  /** The page origin binding paths resolve against; the current page's by default. */
  origin?: string;
  /**
   * The origins widget bundles may load from: the page origin by default. A
   * bundle on another origin (a CDN) loads only when its origin is listed here
   * and that server allows the page origin by CORS (DESIGN §3.5).
   */
  bundleOrigins?: readonly string[];
  /**
   * Tests only: widget entries loaded from the product's own bundle instead
   * of their widget bundles, by entry id (`WIDGET_ENTRIES` from
   * `@gears-frontx/frontx-dashboard-widgets/testing`).
   */
  entries?: WidgetEntries;
}

const MOUNT_TIMEOUT_MS = 30_000;

/**
 * Fields the type store (gts-ts 0.11) reads as an entity's id or schema before `id`; transform output must not
 * carry them. No catalog data type has a top-level field of these names, so valid data never does.
 */
const GTS_IDENTITY_FIELDS = ['$id', 'gtsId', 'gtsIid', 'gtsOid', 'gtsI', 'gts_id', 'gts_oid', 'gts_iid', '$schema', 'gtsTid', 'gtsType', 'gtsT', 'gts_t', 'gts_tid', 'gts_type', 'type', 'schema'];

/** An allowed bundle origin as the check compares it: a base address such as `https://cdn.example.com/widgets/` counts as its origin. */
const originOf = (address: string) => {
  try {
    return new URL(address).origin;
  } catch {
    return address;
  }
};

export class DashboardRoot {
  readonly types: TypeSystemPlugin;
  /** Absent when the registry rejected the `widgets` domain: a failed start, with no exit. */
  readonly registry?: MfeRegistry;
  readonly host: DashboardHost;
  readonly origin: string;
  private readonly bundleIds: Set<string>;
  private readonly containers = new Map<string, HTMLElement>();
  private readonly mountWaiters = new Map<string, Set<(error?: unknown) => void>>();
  private readonly leaving = new Set<string>();
  private readonly renderFallbacks = new Map<string, () => void>();
  private file?: Promise<FileOutcome>;
  private readonly loads = new Map<string, Promise<LoadOutcome>>();
  /** The generated extensions registered for each dashboard id. */
  private readonly extensions = new Map<string, Set<string>>();
  private published?: { theme: string; language: string };
  /** The release still running for a dashboard id. */
  private readonly releasing = new Map<string, Promise<void>>();

  constructor({ host, entries = {}, origin = globalThis.location?.origin ?? '', bundleOrigins = [origin] }: DashboardRootOptions) {
    this.host = host;
    this.origin = origin;
    this.types = new GtsPlugin({ isolated: true });
    this.bundleIds = registerBundle(this.types);
    try {
      this.registry = createWidgetsRegistry(this.types, new WidgetEntryHandler(entries, new Set(bundleOrigins.map(originOf))), this.containers, {
        mounted: (id, error) => {
          // A fresh mount ends any leave the root asked for earlier and whose unmount never ran.
          this.leaving.delete(id);
          for (const waiter of [...(this.mountWaiters.get(id) ?? [])]) waiter(error ?? undefined);
        },
        unmounted: (id) => {
          if (this.leaving.delete(id)) return;
          // The root did not ask for this unmount: it is the fallback of a `render_widget` chain.
          this.renderFallbacks.get(id)?.();
        },
      });
    } catch (error) {
      console.error(`[dashboard] the registry rejected the widgets domain: ${String(error)}`);
    }
  }

  /** Attaches the element under which the domain places the widget containers before a cell takes them. */
  attach(element: HTMLElement | null): void {
    if (element) this.registry?.getMounter(WIDGETS_DOMAIN_ID).attach(element);
  }

  /** Publishes the host theme id and language on the `widgets` domain; a change restyles every widget and re-runs nothing. */
  publish(theme: string, language: string): void {
    if (!this.registry || (this.published?.theme === theme && this.published.language === language)) return;
    // The host can pass anything; a value the property type rejects keeps the last one and never breaks the render.
    try {
      this.registry.updateSharedProperty(THEME_PROPERTY_ID, theme);
      this.registry.updateSharedProperty(LANGUAGE_PROPERTY_ID, language);
      this.published = { theme, language };
    } catch (error) {
      console.error(`[dashboard] the theme or language cannot be published: ${String(error).split('\n')[0]}`);
    }
  }

  /** Loads a dashboard id: the served file once, then the dashboard's registrations. A failed load is retried on the next call. */
  load(dashboardId: string): Promise<LoadOutcome> {
    let load = this.loads.get(dashboardId);
    if (!load) {
      load = this.loadOnce(dashboardId);
      this.loads.set(dashboardId, load);
      void load.then((outcome) => {
        if (!outcome.ok && this.loads.get(dashboardId) === load) this.loads.delete(dashboardId);
      });
    }
    return load;
  }

  private async loadOnce(dashboardId: string): Promise<LoadOutcome> {
    const fail = (problem: string): LoadOutcome => {
      console.error(`[dashboard] dashboard ${dashboardId} cannot be shown: ${problem}`);
      return { ok: false };
    };
    if (!this.registry) return fail('the widgets domain was rejected at start');
    this.file ??= withTimeout((signal) => this.host.loadFile(signal)).then(
      (file) => registerServedFile(this.types, file, this.bundleIds),
      (error) => ({ ok: false, problem: `the served file could not be loaded: ${String(error)}` }) as const,
    );
    const file = await this.file;
    if (!file.ok) {
      this.file = undefined;
      return fail(file.problem);
    }
    const dashboard = file.dashboards.get(dashboardId);
    if (!dashboard) return fail(`no dashboard ${dashboardId} in the served file`);
    const outcome = registerDashboard(this.types, dashboard);
    if (!outcome.ok) return fail(outcome.problem);
    // Each failed widget is reported once, by its cell, when the cell runs.
    return { ok: true, dashboard, failed: outcome.failed };
  }

  /** Drops a load that has not settled, so the next mount of that id starts a new one (the owner state Loading to Started). */
  forget(dashboardId: string, load: Promise<LoadOutcome>): void {
    if (this.loads.get(dashboardId) === load) this.loads.delete(dashboardId);
  }

  /**
   * Unregisters the generated extensions of a dashboard the viewer left for
   * another one. A cell that starts before this finishes waits for it, so it
   * never reuses an extension about to be unregistered.
   */
  release(dashboardId: string): Promise<void> {
    const ids = this.extensions.get(dashboardId);
    this.extensions.delete(dashboardId);
    const before = this.releasing.get(dashboardId) ?? Promise.resolve();
    const done = before.then(async () => {
      for (const id of ids ?? []) {
        this.leaving.add(id);
        await this.registry?.unregisterExtension(id).catch(() => undefined);
        this.leaving.delete(id);
      }
    });
    this.releasing.set(dashboardId, done);
    void done.then(() => {
      if (this.releasing.get(dashboardId) === done) this.releasing.delete(dashboardId);
    });
    return done;
  }

  /**
   * Runs one cell or larger view: traits, extension, mount, binding, stamp,
   * `render_widget`. Every failure stays in this cell. Returns the cleanup
   * that unmounts the extension when the cell leaves.
   */
  runCell({
    dashboardId,
    widget,
    role,
    failure,
    shared,
    update,
  }: {
    dashboardId: string;
    widget: WidgetInstance;
    role: Role;
    /** Set when the widget instance failed its own registration. */
    failure?: string;
    shared: SharedRequests;
    update: (change: CellUpdate) => void;
  }): () => void {
    let live = true;
    let extensionId: string | undefined;
    const registry = this.registry;
    const typeId = typeOfWidget(widget.id);
    const fail = (problem: string) => {
      if (!live) return;
      console.error(`[dashboard] dashboard ${dashboardId}, widget ${widget.id} (${typeId}), ${role}: ${problem}`);
      update({ state: 'cannot-be-shown' });
    };
    // A widget that failed its own registration may carry any `data`; only a checked binding is read.
    const binding = failure || widget.data === null || typeof widget.data !== 'object' ? undefined : (widget.data as Binding);
    update({ state: !failure && binding && formOf(binding) !== 'static' ? 'loading' : 'shown' });

    const run = async () => {
      if (!registry) return fail('the widgets domain was rejected at start');
      if (failure) return fail(`the widget fails its own registration: ${failure}`);
      let entry: string;
      let dataType: string | undefined;
      try {
        const traits = effectiveTraits(this.types, typeId);
        entry = String(traits.entry);
        dataType = traits.data_type === undefined ? undefined : String(traits.data_type);
        if (dataType !== undefined && !this.types.getSchema(dataType)) throw new Error(`data_type ${dataType} is not registered`);
      } catch (error) {
        return fail(`traits: ${String(error)}`);
      }
      const id = extensionIdOf(widget.id, role, entry);
      // Extension ids do not depend on the dashboard: a widget named by two dashboards waits for every running release.
      await Promise.all(this.releasing.values());
      if (!live) return;
      extensionId = id;
      try {
        if (!registry.getExtension(id)) await registry.registerExtension({ id, domain: WIDGETS_DOMAIN_ID, entry });
        let ids = this.extensions.get(dashboardId);
        if (!ids) this.extensions.set(dashboardId, (ids = new Set()));
        ids.add(id);
      } catch (error) {
        return fail(`the generated extension is rejected: ${String(error)}`);
      }
      if (!live) return;
      const mounted = new Promise<void>((resolve, reject) => {
        // Each run waits on its own: a re-run of the same extension never takes over an earlier run's waiter.
        const waiters = this.mountWaiters.get(id) ?? new Set<(error?: unknown) => void>();
        this.mountWaiters.set(id, waiters);
        const timer = setTimeout(() => waiter(new Error(`mount_ext did not finish within ${MOUNT_TIMEOUT_MS} ms`)), MOUNT_TIMEOUT_MS);
        const waiter = (error?: unknown) => {
          clearTimeout(timer);
          waiters.delete(waiter);
          if (error) reject(error instanceof Error ? error : new Error(String(error)));
          else resolve();
        };
        waiters.add(waiter);
      });
      registry.executeActionsChain({ action: { type: registry.typeSystem.resolveMountExtActionId(), target: WIDGETS_DOMAIN_ID, payload: { subject: id, history: 'none' } } });
      // The binding runs while the widget mounts; the root sends nothing before both have finished.
      const data = binding
        ? runBinding({ binding, host: this.host, shared, origin: this.origin, isLive: () => live })
        : Promise.resolve({ dropped: false as const, data: undefined });
      data.catch(() => undefined);
      try {
        await mounted;
      } catch (error) {
        return fail(`mount_ext failed: ${String(error)}`);
      }
      if (!live) return;
      let payload: Record<string, unknown> = { render: widget.render };
      try {
        const result = await data;
        if (result.dropped || !live) return;
        if (binding && dataType) {
          if (result.data === null || typeof result.data !== 'object' || Array.isArray(result.data)) throw new CellFailure(`the transform result is not an object`);
          // The stamp is the data's only identity: a result that names its own GTS id or schema would register under it unchecked.
          const named = GTS_IDENTITY_FIELDS.find((field) => Object.hasOwn(result.data as object, field));
          if (named) throw new CellFailure(`the transform result carries the GTS field ${named}`);
          const stamped = { ...(result.data as object), id: stampIdOf(dataType, widget.id, role) };
          try {
            this.types.register(stamped);
          } catch (error) {
            throw new CellFailure(`the data fails ${dataType}: ${String(error).split('\n').slice(0, 2).join(' ')}`);
          }
          payload = { ...payload, ...(widget.value_format ? { value_format: widget.value_format } : {}), data: stamped };
        }
      } catch (error) {
        return fail(error instanceof Error ? error.message : String(error));
      }
      if (!live) return;
      // The widget draws at the size of its cell: the root sends `render_widget` once the cell holds the container.
      update({ state: 'placing' });
      const container = this.containers.get(id);
      if (container) {
        await new Promise<void>((resolve) => {
          const timer = setTimeout(resolve, PLACE_TIMEOUT_MS);
          update({ container, placed: () => (clearTimeout(timer), resolve()) });
        });
      }
      if (!live) return;
      this.renderFallbacks.set(id, () => fail('the render_widget chain ended in fallback or timed out'));
      registry.executeActionsChain({
        action: { type: RENDER_WIDGET_ACTION_ID, target: id, payload },
        fallback: { action: { type: registry.typeSystem.resolveUnmountExtActionId(), target: WIDGETS_DOMAIN_ID, payload: { subject: id, history: 'none' } } },
      });
      // The widget resolves render_widget as soon as it holds the payload; a fallback turns the cell back to its placeholder.
      update({ state: 'shown' });
    };
    void run();

    return () => {
      live = false;
      if (!registry || !extensionId) return;
      this.renderFallbacks.delete(extensionId);
      this.leaving.add(extensionId);
      registry.executeActionsChain({ action: { type: registry.typeSystem.resolveUnmountExtActionId(), target: WIDGETS_DOMAIN_ID, payload: { subject: extensionId, history: 'none' } } });
    };
  }
}
