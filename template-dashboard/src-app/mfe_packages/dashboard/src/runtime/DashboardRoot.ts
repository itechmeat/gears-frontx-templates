import { GtsPlugin } from '@gears-frontx/gts-plugin';
import type { MfeRegistry, TypeSystemPlugin } from '@gears-frontx/mfes';

import {
  LANGUAGE_PROPERTY_ID,
  OVERLAY_CONTAINER_PROPERTY_ID,
  RENDER_WIDGET_ACTION_ID,
  THEME_PROPERTY_ID,
  WIDGETS_DOMAIN_ID,
  type CellFailureKind,
  type Dashboard,
  type DashboardFailureKind,
  type FailureReport,
  type OverlayContainerValue,
  type WidgetInstance,
} from '../contract';
import { CellFailure, SharedRequests, formOf, runBinding, type Binding, type BindingResult, type VariableValues } from './binding';
import { RequestFailure, withTimeout, type DashboardHost } from './host';
import { extensionIdOf, renderStampIdOf, stampIdOf, type Role } from './ids';
import { baseTypeChanged, effectiveTraits, escapeControls, firstLineOf, partTypeChanged, registerBundle, registerDashboard, registerServedFile, renderTypeOf, typeOfWidget, type FileOutcome, type TypeSources } from './register';
import { createWidgetsRegistry, WidgetEntryHandler, type WidgetEntries } from './registry';

/*
 * The dashboard root of the single-page hosting form: one registry with the
 * `widgets` domain, the served file and the dashboards it loaded, and the
 * flow of every cell (runtime FEATURE "Open a dashboard"). A product creates
 * one root and renders `<Dashboard root={...} />` wherever a dashboard shows;
 * one `Dashboard` at a time per root (DESIGN §2.2, one root per registry).
 */

/**
 * The result of `load`. A failed load carries `failure` with the kind of the step that failed and its console line
 * after `[dashboard] `; a load on or during a dispose carries none, as that is the host's own teardown.
 */
export type LoadOutcome = { ok: true; dashboard: Dashboard; failed: ReadonlyMap<string, string> } | { ok: false; failure?: { kind: DashboardFailureKind; message: string } };

/** The result of `refresh`: `problem` names why the root kept the definitions it read before. */
export type RefreshOutcome = { ok: true } | { ok: false; problem: string };

/**
 * The value the root publishes for the host's overlay container. The element sits in a private field: the type store
 * walks and copies the own fields of every value it registers, and an element a page framework rendered leads through
 * them into that framework's whole tree. The domain hands this same object to each widget.
 */
class OverlayContainer implements OverlayContainerValue {
  readonly #element: HTMLElement;
  constructor(element: HTMLElement) {
    this.#element = element;
  }
  get element(): HTMLElement {
    return this.#element;
  }
}

/** The reason every request of a disposed root fails with. */
const DISPOSED = 'the dashboard root is disposed';

/**
 * Runs `run` with a signal that aborts when `signal` or `stop` aborts. Either abort rejects at once, `stop` with
 * `reason` and `signal` with its own reason, whether or not the host heeds the signal, so nothing of the root waits on
 * that answer after it. Both listeners go once `run` settles or either signal aborts. `run` is called in the next
 * microtask, and not at all when either signal aborted before then.
 */
function untilStopped<T>(stop: AbortSignal, reason: string, signal: AbortSignal, run: (signal: AbortSignal) => Promise<T>): Promise<T> {
  if (stop.aborted) return Promise.reject(new RequestFailure(reason));
  const controller = new AbortController();
  return new Promise<T>((resolve, reject) => {
    const settled = () => {
      stop.removeEventListener('abort', stopped);
      signal.removeEventListener('abort', aborted);
    };
    const end = (failure: RequestFailure) => {
      settled();
      controller.abort(failure);
      reject(failure);
    };
    const stopped = () => end(new RequestFailure(reason));
    const aborted = () => end(signal.reason instanceof RequestFailure ? signal.reason : new RequestFailure('the request was aborted'));
    stop.addEventListener('abort', stopped, { once: true });
    signal.addEventListener('abort', aborted, { once: true });
    // A request aborted before it starts fails at once.
    if (signal.aborted) aborted();
    // A host that throws instead of returning a promise rejects like one that rejects. An abort that came before the
    // host is called keeps the host from being called.
    void Promise.resolve()
      .then(() => {
        if (controller.signal.aborted) throw controller.signal.reason;
        return run(controller.signal);
      })
      .then(resolve, reject)
      .finally(settled);
  });
}

/**
 * What a cell shows; the root reports each change to the cell's frame. `placing`: the data is ready and the cell lays out the widget's container, still under its loader, before `render_widget` goes out.
 * `retry` is true on a cannot-be-shown state that came from a failed data request (`RequestFailed`): the frame offers a retry.
 * `failure` comes with each cannot-be-shown state, for the host's `onFailure`, except on a root disposed before the cell ran.
 */
export type CellUpdate =
  | { state: 'loading' | 'placing' | 'shown' | 'cannot-be-shown'; retry?: boolean; failure?: Extract<FailureReport, { scope: 'cell' }> }
  | { container: HTMLElement; placed: () => void };

/**
 * A running cell: `leave` unmounts its extension; `rerun` runs its binding again with new variable values; `ended` is
 * true once the cell failed before its extension was ready or its `render_widget` fell back, so it sends no request.
 * `requestFailed` is true while the cell's last run ended in a failed data request; `source` is the shared request
 * its binding reads, if any; `waitsOn` is true when the newest run awaited this held answer of it, whether or not it
 * has reported the result yet. A retry is a `rerun` with the current values.
 */
export interface CellRun {
  leave: () => void;
  rerun: (values: VariableValues) => void;
  ended: () => boolean;
  requestFailed: () => boolean;
  waitsOn: (answer: Promise<unknown>) => boolean;
  source?: string;
}

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

/**
 * Top-level render fields the type store (gts-ts 0.11) reads as the instance's identity or as a schema marker, and `id`,
 * which the root stamps: a render carrying one would register under another id or not as an instance at all. The type
 * names (`type`, `schema`, `gtsType` and their kin) are not here: the store validates a render that carries one against
 * the stamp's render type, which judges it like any other field.
 */
export const RENDER_RESERVED_FIELDS = ['id', '$id', 'gtsId', 'gtsIid', 'gtsOid', 'gtsI', 'gts_id', 'gts_oid', 'gts_iid', '$schema'];

/** An allowed bundle origin as the check compares it: a base address such as `https://cdn.example.com/widgets/` counts as its origin. */
const originOf = (address: string): string[] => {
  try {
    const url = new URL(address);
    // Bundles load over http(s) only; any other value (data:, file:, a bare host name) allows nothing.
    return url.protocol === 'https:' || url.protocol === 'http:' ? [url.origin] : [];
  } catch {
    return [];
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
  /** What `dispose` waits on for each mount in flight: the registry unmounts only an extension whose mount ended. */
  private readonly mountEnds = new Map<string, Set<() => void>>();
  private readonly leaving = new Set<string>();
  private readonly renderFallbacks = new Map<string, () => void>();
  private file?: Promise<FileOutcome>;
  private readonly loads = new Map<string, Promise<LoadOutcome>>();
  /** The generated extensions registered for each dashboard id. */
  private readonly extensions = new Map<string, Set<string>>();
  /** How many cells that have not left name each extension id, from the start of their registration. */
  private readonly cells = new Map<string, number>();
  /** The last theme id and language the `widgets` domain accepted, each on its own. */
  private readonly published: { theme?: string; language?: string; overlays?: HTMLElement | null } = {};
  /** The release still running for a dashboard id. */
  private readonly releasing = new Map<string, Promise<void>>();
  /** The running release that lists each extension id, until it ends: a cell of that id waits for it. */
  private readonly unregistering = new Map<string, Promise<void>>();
  /** The first source of each type the served file brought, kept over every read of the file. */
  private readonly sources: TypeSources = new Map();
  /** Aborted by `dispose`: every request of the root in flight fails with it. */
  private readonly disposal = new AbortController();
  private disposing?: Promise<void>;
  /** The listeners `subscribe` added; each is called after a refresh read new definitions. */
  private readonly listeners = new Set<() => void>();
  private refreshed = 0;
  /** The newest `refresh` call, its token and the controller of its file request. */
  private refreshing?: { token: number; done: Promise<RefreshOutcome>; controller: AbortController };
  private refreshes = 0;
  /** The last outcome given for each dashboard id, with a key of its content: a load of the same content gives it again. */
  private readonly given = new Map<string, { key: string; outcome: LoadOutcome }>();
  /** The cells waiting to be placed, each with the end of its wait: `dispose` ends them all. */
  private readonly placing = new Set<() => void>();

  constructor({ host, entries = {}, origin = globalThis.location?.origin ?? '', bundleOrigins = [origin] }: DashboardRootOptions) {
    // Every request of the root goes through this host, so `dispose` ends them all.
    const disposal = this.disposal.signal;
    this.host = {
      loadFile: (signal) => untilStopped(disposal, DISPOSED, signal, (both) => host.loadFile(both)),
      request: (request, signal) => untilStopped(disposal, DISPOSED, signal, (both) => host.request(request, both)),
    };
    this.origin = origin;
    this.types = new GtsPlugin({ isolated: true });
    this.bundleIds = registerBundle(this.types);
    try {
      this.registry = createWidgetsRegistry(this.types, new WidgetEntryHandler(entries, new Set(bundleOrigins.flatMap(originOf))), this.containers, {
        mounted: (id, error) => {
          // A fresh mount ends any leave the root asked for earlier and whose unmount never ran.
          this.leaving.delete(id);
          for (const waiter of [...(this.mountWaiters.get(id) ?? [])]) waiter(error ?? undefined);
          for (const end of [...(this.mountEnds.get(id) ?? [])]) end();
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
    if (element && !this.disposed) this.registry?.getMounter(WIDGETS_DOMAIN_ID).attach(element);
  }

  private get disposed(): boolean {
    return this.disposal.signal.aborted;
  }

  /** How many times `refresh` read new definitions: a view loads its dashboard again when it changes. */
  get version(): number {
    return this.refreshed;
  }

  /**
   * Calls `listener` after each `refresh` that read new definitions, once `version` has changed; returns the call that
   * removes it. A disposed root keeps no listener.
   */
  subscribe(listener: () => void): () => void {
    if (this.disposed) return () => undefined;
    this.listeners.add(listener);
    return () => void this.listeners.delete(listener);
  }

  /**
   * Reads the served file again; each shown `Dashboard` then loads its dashboard from the new definitions and redraws
   * it, and one whose definition is unchanged keeps its cells as they are. A generated extension already registered
   * mounts the code it loaded, which is not loaded again; a cell with a new generated extension (a new widget, or a
   * widget whose type changed) loads its own copy of the code, even when another cell already loaded that type. A
   * dashboard missing from the new file shows its cannot-be-shown state, as on a first load.
   *
   * On any failure (the file request, the base file the type store rejects, a base type defined otherwise than the
   * type store holds it, or a type of a widget part defined otherwise than the store holds it from that same part,
   * which only a new root can take) the root keeps the definitions it read before, every shown dashboard stays as
   * drawn, one console line names the problem, and the outcome carries it. Any other widget part left out (one whose
   * type another source brought first, as on a first load) is left out and does not fail the refresh.
   *
   * The last call wins: a call made while another runs aborts the other's file request, and every earlier call
   * resolves with the outcome of the latest one. After `dispose` it resolves `{ ok: false }` and reads nothing; a call
   * still in flight when `dispose` runs resolves `{ ok: false }` with the disposed reason and writes no console line.
   */
  refresh(): Promise<RefreshOutcome> {
    if (this.disposed) return Promise.resolve(this.refreshFailed(DISPOSED));
    this.refreshing?.controller.abort();
    const controller = new AbortController();
    const token = (this.refreshes += 1);
    const done = this.refreshOnce(token, controller.signal);
    this.refreshing = { token, done, controller };
    return done;
  }

  private refreshFailed(problem: string): RefreshOutcome {
    console.error(`[dashboard] ${escapeControls(`the dashboard definitions cannot be refreshed: ${problem}`)}`);
    return { ok: false, problem };
  }

  private async refreshOnce(token: number, signal: AbortSignal): Promise<RefreshOutcome> {
    // A newer call took over: this one resolves with that call's outcome, and reports nothing of its own.
    const latest = () => (this.refreshing && this.refreshing.token !== token ? this.refreshing.done : undefined);
    let answer: unknown;
    try {
      answer = await withTimeout((timeout) => untilStopped(signal, 'a later refresh took over', timeout, (both) => this.host.loadFile(both)));
    } catch (error) {
      // A refresh in flight when the root was disposed ends with that reason and reports nothing after the dispose.
      if (this.disposed) return { ok: false, problem: DISPOSED };
      return latest() ?? this.refreshFailed(`the served file could not be loaded: ${String(error)}`);
    }
    if (this.disposed) return { ok: false, problem: DISPOSED };
    const newer = latest();
    if (newer) return newer;
    let file: FileOutcome;
    try {
      const [base] = Array.isArray(answer) ? answer : [answer];
      // The base file registers first on a type store of its own, as on a first load: a base file the store rejects
      // halfway leaves nothing of itself in the root's store.
      const trial = new GtsPlugin({ isolated: true });
      const trialBundle = registerBundle(trial);
      const changed = baseTypeChanged(this.types, trial, base);
      if (changed) return this.refreshFailed(`the served file: ${changed}`);
      // A widget part whose own type changed would be left out, and the cells it served would fail.
      const partChanged = partTypeChanged(this.types, answer, this.sources);
      if (partChanged) return this.refreshFailed(partChanged);
      const tried = registerServedFile(trial, base, trialBundle);
      if (!tried.ok) return this.refreshFailed(tried.problem);
      file = registerServedFile(this.types, answer, this.bundleIds, this.sources);
    } catch (error) {
      return this.refreshFailed(`the served file cannot be registered: ${String(error).split('\n').slice(0, 2).join(' ')}`);
    }
    if (!file.ok) return this.refreshFailed(file.problem);
    this.file = Promise.resolve(file);
    this.loads.clear();
    this.refreshed += 1;
    // A listener that throws is written as one line; the others are still told, and the outcome stays.
    for (const listener of [...this.listeners]) {
      try {
        listener();
      } catch (error) {
        console.error(`[dashboard] ${escapeControls(`a refresh listener failed: ${firstLineOf(error, 'listener threw a value that cannot be shown')}`)}`);
      }
    }
    // A listener may start a newer call: this one then resolves with that call's outcome.
    return latest() ?? { ok: true };
  }

  /**
   * Releases everything the root holds: it unmounts and unregisters every widget extension (each widget's own
   * unmount runs and its container leaves the page), disposes of the registry with its shared-property subscriptions,
   * aborts every request in flight (the served file's and the data requests'), clears its timers and drops its
   * listeners, loads and definitions. The widget code the page loaded stays in the page's module cache, which only a
   * page reload clears.
   *
   * A load or refresh in flight then resolves `{ ok: false }` with no console line, and a cell that was running shows
   * nothing more and leaves no widget behind.
   * After it, `load` and `refresh` resolve `{ ok: false }` with one console line, a cell run shows cannot-be-shown,
   * `publish`, `publishOverlayContainer`, `withdrawOverlayContainer` and `attach` do nothing, and `subscribe` adds nothing. A second call returns
   * the first call's promise. A new root made after it works on its own.
   */
  dispose(): Promise<void> {
    this.disposing ??= this.disposeOnce();
    return this.disposing;
  }

  private async disposeOnce(): Promise<void> {
    this.disposal.abort();
    this.refreshing?.controller.abort();
    this.listeners.clear();
    for (const end of [...this.placing]) end();
    // A widget still mounting is unregistered once its mount ended, within the mount timeout, so its unmount runs.
    const mountsEnded = Promise.all([...this.mountWaiters.keys()].map((id) => this.mountEnded(id)));
    for (const waiters of [...this.mountWaiters.values()]) for (const waiter of [...waiters]) waiter(new Error(DISPOSED));
    this.mountWaiters.clear();
    this.renderFallbacks.clear();
    this.loads.clear();
    this.given.clear();
    this.file = undefined;
    const ids = new Set([...this.extensions.values()].flatMap((set) => [...set]));
    this.extensions.clear();
    await Promise.all(this.releasing.values());
    await mountsEnded;
    for (const id of ids) {
      this.leaving.add(id);
      await this.registry?.unregisterExtension(id).catch(() => undefined);
    }
    await this.registry?.dispose().catch(() => undefined);
    for (const container of this.containers.values()) container.remove();
    this.containers.clear();
    this.leaving.clear();
    this.cells.clear();
    this.sources.clear();
  }

  /** Publishes the host theme id and language on the `widgets` domain; a change restyles every widget and re-runs nothing. */
  publish(theme: string, language: string): void {
    this.publishOne('theme', THEME_PROPERTY_ID, theme);
    this.publishOne('language', LANGUAGE_PROPERTY_ID, language);
  }

  /**
   * Publishes the element the widgets open their overlays in (the host's `overlayContainer`), or null for none, on the
   * `widgets` domain. Each widget then moves its overlays there; with null they stay inside its own shadow root. The
   * element goes out in a holder the type store does not walk (`OverlayContainerValue` in the contract), and the same
   * element again publishes nothing. Any value without an element (undefined from untyped code) is null.
   */
  publishOverlayContainer(value: HTMLElement | null): void {
    const element = value || null;
    if (!this.registry || this.disposed || (this.published.overlays ?? null) === element) return;
    try {
      this.registry.updateSharedProperty(OVERLAY_CONTAINER_PROPERTY_ID, element ? new OverlayContainer(element) : null);
      this.published.overlays = element;
    } catch (error) {
      console.error(`[dashboard] ${escapeControls(`the overlay container cannot be published: ${String(error).split('\n')[0]}`)}`);
    }
  }

  /** Publishes null in place of `element` while it is still the element published: one another view published since stays. */
  withdrawOverlayContainer(element: HTMLElement | null): void {
    if ((this.published.overlays ?? null) === element) this.publishOverlayContainer(null);
  }

  /**
   * Publishes the theme or the language. The host can pass anything; a value the property type rejects keeps the last
   * one of that property, never stops the other one and never breaks the render.
   */
  private publishOne(name: 'theme' | 'language', propertyId: string, value: string): void {
    if (!this.registry || this.disposed || this.published[name] === value) return;
    try {
      this.registry.updateSharedProperty(propertyId, value);
      this.published[name] = value;
    } catch (error) {
      console.error(`[dashboard] ${escapeControls(`the ${name} cannot be published: ${String(error).split('\n')[0]}`)}`);
    }
  }

  /** Loads a dashboard id: the served file once, then the dashboard's registrations. A failed load is retried on the next call. */
  load(dashboardId: string): Promise<LoadOutcome> {
    let load = this.loads.get(dashboardId);
    if (!load) {
      load = this.loadOnce(dashboardId);
      this.loads.set(dashboardId, load);
      const drop = () => {
        if (this.loads.get(dashboardId) === load) this.loads.delete(dashboardId);
      };
      // A rejected load is dropped too, so the bookkeeping never leaves an unhandled rejection behind.
      void load.then((outcome) => {
        if (!outcome.ok) drop();
      }, drop);
    }
    return load;
  }

  private async loadOnce(dashboardId: string): Promise<LoadOutcome> {
    const disposedAtStart = this.disposed;
    // Without a kind (a load on a disposed root) the outcome carries no failure: the dispose is the host's own.
    const fail = (problem: string, kind?: DashboardFailureKind): LoadOutcome => {
      // A load that was in flight when the root was disposed reports nothing after the dispose.
      if (this.disposed && !disposedAtStart) return { ok: false };
      // A part may bring the dashboard and the ids the problem quotes, so the line is escaped as the part line is.
      const message = escapeControls(`dashboard ${dashboardId} cannot be shown: ${problem}`);
      console.error(`[dashboard] ${message}`);
      return kind ? { ok: false, failure: { kind, message } } : { ok: false };
    };
    if (disposedAtStart) return fail(DISPOSED);
    if (!this.registry) return fail('the widgets domain was rejected at start', 'start');
    const pending = (this.file ??= this.readFile());
    let file: FileOutcome;
    try {
      file = await pending;
    } catch (error) {
      // An answer the registration cannot even read: the file is dropped like a failed one, so the next load retries.
      file = { ok: false, problem: `the served file cannot be registered: ${String(error).split('\n').slice(0, 2).join(' ')}` };
    }
    if (!file.ok) {
      // Only the file this load awaited is dropped: a refresh that read a file since keeps it.
      if (this.file === pending) this.file = undefined;
      return fail(file.problem, 'file');
    }
    const dashboard = file.dashboards.get(dashboardId);
    if (!dashboard) return fail(`no dashboard ${dashboardId} in the served file`, 'dashboard');
    let outcome: ReturnType<typeof registerDashboard>;
    try {
      outcome = registerDashboard(this.types, dashboard, file.rejected);
    } catch (error) {
      // A dashboard the registration cannot even read fails like a rejected one, so the next load retries.
      return fail(`the dashboard cannot be registered: ${String(error).split('\n').slice(0, 2).join(' ')}`, 'dashboard');
    }
    if (!outcome.ok) return fail(outcome.problem, 'dashboard');
    if (this.disposed) return fail(DISPOSED);
    // Each failed widget is reported once, by its cell, when the cell runs. The cells run the copies read on load.
    const loaded: LoadOutcome = { ok: true, dashboard: outcome.dashboard, failed: outcome.failed };
    // A load after a refresh that left this dashboard as it was gives the outcome given before, so its cells stay.
    let key: string;
    try {
      key = JSON.stringify([outcome.dashboard, [...outcome.failed]]);
    } catch {
      // A dashboard from an in-code host that JSON cannot write is given as new each time.
      return loaded;
    }
    const before = this.given.get(dashboardId);
    if (before?.key === key) return before.outcome;
    this.given.set(dashboardId, { key, outcome: loaded });
    return loaded;
  }

  /**
   * The served file's first read. A refresh that reads a file while this one is in flight takes over: this answer,
   * or its failure, then registers nothing and gives the file the refresh read, so the store and the loads keep the
   * newer definitions.
   */
  private readFile(): Promise<FileOutcome> {
    const pending: Promise<FileOutcome> = withTimeout((signal) => this.host.loadFile(signal)).then(
      (file) => (this.file === pending ? registerServedFile(this.types, file, this.bundleIds, this.sources) : this.newerFile()),
      (error) => (this.file === pending ? ({ ok: false, problem: `the served file could not be loaded: ${String(error)}` } as const) : this.newerFile()),
    );
    return pending;
  }

  /** The file a refresh read after a first read took over, or the disposed reason once `dispose` dropped it. */
  private newerFile(): Promise<FileOutcome> | FileOutcome {
    return this.file ?? { ok: false, problem: DISPOSED };
  }

  /** Drops a load that has not settled, so the next mount of that id starts a new one (the owner state Loading to Started). */
  forget(dashboardId: string, load: Promise<LoadOutcome>): void {
    if (this.loads.get(dashboardId) === load) this.loads.delete(dashboardId);
  }

  /**
   * Unregisters the generated extensions of a dashboard the viewer left for
   * another one, except those another running cell or dashboard of the root
   * holds at the call. A cell that starts before this finishes waits for it,
   * and so does a cell of a listed extension that was already waiting on
   * another release, so no cell reuses an extension about to be unregistered.
   */
  release(dashboardId: string): Promise<void> {
    const ids = this.extensions.get(dashboardId);
    this.extensions.delete(dashboardId);
    return this.unregister(dashboardId, [...(ids ?? [])].filter((id) => !this.held(id)));
  }

  /**
   * After a load of a shown dashboard (a refresh's included): unregisters the generated extensions of that dashboard
   * that no cell or larger view of `dashboard` names any more, a widget a refresh removed or whose type changed, and that
   * no other running cell or dashboard of the root holds. The cells that showed them have left by then.
   */
  prune(dashboardId: string, dashboard: Dashboard): Promise<void> {
    const ids = this.extensions.get(dashboardId);
    if (!ids || this.disposed) return Promise.resolve();
    const named = new Set<string>();
    for (const cell of dashboard.layout.cells) {
      for (const [widget, role] of [[cell.widget, 'cell'], [cell.larger_view, 'larger_view']] as const) {
        try {
          if (widget) named.add(extensionIdOf(widget.id, role, String(effectiveTraits(this.types, typeOfWidget(widget.id)).entry)));
        } catch {
          // A widget whose traits do not resolve runs no extension.
        }
      }
    }
    const stale = [...ids].filter((id) => !named.has(id));
    for (const id of stale) ids.delete(id);
    // Extension ids do not depend on the dashboard: one another dashboard of the root still holds stays registered.
    return this.unregister(dashboardId, stale.filter((id) => !this.held(id)));
  }

  /** Whether a running cell names the extension id, or a dashboard of the root holds it. */
  private held(id: string): boolean {
    return (this.cells.get(id) ?? 0) > 0 || [...this.extensions.values()].some((ids) => ids.has(id));
  }

  /**
   * Resolves once the mount in flight of `id` ended, or the mount timeout passed; at once when no mount of it is in
   * flight. The registry unmounts only an extension whose mount ended, so an unregister waits on this first.
   */
  private mountEnded(id: string): Promise<void> {
    if (!this.mountWaiters.get(id)?.size) return Promise.resolve();
    return new Promise<void>((resolve) => {
      const ends = this.mountEnds.get(id) ?? new Set<() => void>();
      this.mountEnds.set(id, ends);
      const end = () => {
        clearTimeout(timer);
        ends.delete(end);
        resolve();
      };
      const timer = setTimeout(end, MOUNT_TIMEOUT_MS);
      ends.add(end);
    });
  }

  /**
   * Unregisters `ids` after the release still running for the dashboard id; a cell that starts meanwhile waits for it,
   * and a cell of one of `ids` waits for it whenever it started. An extension still mounting is unregistered once its
   * mount ended, within the mount timeout, so its unmount runs. No cell holds a listed id while this runs: a cell
   * counts itself only once no running release lists its id, so every listed id is unregistered.
   */
  private unregister(dashboardId: string, ids: readonly string[]): Promise<void> {
    const before = this.releasing.get(dashboardId) ?? Promise.resolve();
    // Taken at the call: a dispose that comes before the release runs ends the mount waiters this reads.
    const mountsEnded = ids.map((id) => this.mountEnded(id));
    const done = before.then(async () => {
      for (const [at, id] of ids.entries()) {
        await mountsEnded[at];
        this.leaving.add(id);
        await this.registry?.unregisterExtension(id).catch(() => undefined);
        this.leaving.delete(id);
      }
    });
    this.releasing.set(dashboardId, done);
    for (const id of ids) this.unregistering.set(id, done);
    void done.then(() => {
      if (this.releasing.get(dashboardId) === done) this.releasing.delete(dashboardId);
      for (const id of ids) if (this.unregistering.get(id) === done) this.unregistering.delete(id);
    });
    return done;
  }

  /**
   * The binding of a widget, or nothing: only a widget that registered and whose type's effective traits carry
   * `data_type` (a data widget) has one. A widget that failed its own registration may carry any `data`, and a widget
   * type outside `data_widget` has no data to deliver, so neither sends a request.
   */
  bindingOf(widget: WidgetInstance, failure: string | undefined): Binding | undefined {
    if (failure || widget.data === null || typeof widget.data !== 'object') return undefined;
    try {
      return effectiveTraits(this.types, typeOfWidget(widget.id)).data_type === undefined ? undefined : (widget.data as Binding);
    } catch {
      // A type that does not resolve fails the cell at its traits.
      return undefined;
    }
  }

  /**
   * Runs one cell or larger view: traits, extension, mount, binding, stamp,
   * `render_widget`. Every failure stays in this cell. Returns its `leave`, which unmounts the extension when the
   * cell leaves, and its `rerun`, which runs the binding again with new variable values and sends a new
   * `render_widget` with the data, the extension staying mounted. Each binding run holds a token: only the newest
   * run of a cell that is still there delivers, so an answer for an older value is dropped.
   */
  runCell({
    dashboardId,
    widget,
    role,
    failure,
    shared,
    values = {},
    update,
  }: {
    dashboardId: string;
    widget: WidgetInstance;
    role: Role;
    /** Set when the widget instance failed its own registration. */
    failure?: string;
    shared: SharedRequests;
    /** The current variable values. */
    values?: VariableValues;
    update: (change: CellUpdate) => void;
  }): CellRun {
    let live = true;
    let token = 0;
    /** Set once the extension is mounted: from then on a re-run delivers its own data. */
    let deliver: ((data: Promise<BindingResult>, run: number) => Promise<void>) | undefined;
    /** Set when the cell failed before its extension was ready, or its `render_widget` fell back: nothing re-runs then. */
    let ended = false;
    /** Set when the newest run ended in a failed data request; a new run clears it. */
    let requestFailed = false;
    /** The held shared answer the newest run awaits; a new run clears it. */
    let awaited: Promise<unknown> | undefined;
    let current = values;
    let extensionId: string | undefined;
    const registry = this.registry;
    const typeId = typeOfWidget(widget.id);
    // A cell that runs on a disposed root fails with that reason; one that was running when the root was disposed
    // reports nothing more.
    const disposedAtStart = this.disposed;
    // After every await of the run: a cell that left, or a root disposed since, goes no further.
    const gone = () => !live || this.disposed;
    const binding = this.bindingOf(widget, failure);
    const source = binding && formOf(binding) === 'shared' ? (binding as { source: string }).source : undefined;
    // Without a kind (a cell on a disposed root) the state carries no failure for the host: the dispose is its own.
    const fail = (problem: string, kind?: CellFailureKind) => {
      if (!deliver) ended = true;
      if (!live || (this.disposed && !disposedAtStart)) return;
      const message = escapeControls(`dashboard ${dashboardId}, widget ${widget.id} (${typeId}), ${role}: ${problem}`);
      console.error(`[dashboard] ${message}`);
      requestFailed = kind === 'request' && !ended;
      const withFailure = kind ? { failure: { scope: 'cell' as const, kind, dashboardId, widgetId: widget.id, widgetType: typeId, role, ...(source === undefined ? {} : { source }), retryable: requestFailed, message } } : {};
      update({ state: 'cannot-be-shown', ...(requestFailed ? { retry: true } : {}), ...withFailure });
    };
    update({ state: !failure && binding && formOf(binding) !== 'static' ? 'loading' : 'shown' });

    const run = async () => {
      if (disposedAtStart) return fail(DISPOSED);
      if (!registry) return fail('the widgets domain was rejected at start', 'mount');
      if (failure) return fail(`the widget fails its own registration: ${failure}`, 'definition');
      let entry: string;
      let dataType: string | undefined;
      let renderType: string;
      try {
        const traits = effectiveTraits(this.types, typeId);
        entry = String(traits.entry);
        dataType = traits.data_type === undefined ? undefined : String(traits.data_type);
        if (dataType !== undefined && !this.types.getSchema(dataType)) throw new Error(`data_type ${dataType} is not registered`);
        renderType = renderTypeOf(this.types, typeId);
        if (!this.types.getSchema(renderType)) throw new Error(`render type ${renderType} is not registered`);
      } catch (error) {
        return fail(`traits: ${String(error)}`, 'definition');
      }
      // The render is stamped and registered as its own instance, so it is validated against its exact render type,
      // as the data is against its data type; a failure fails this cell before anything mounts.
      // Reading and copying the render runs inside the try: a render from an in-code host may throw from a getter.
      let render: Record<string, unknown> | undefined;
      try {
        const named = RENDER_RESERVED_FIELDS.find((field) => Object.hasOwn(widget.render, field));
        if (named) return fail(`the render carries the GTS field ${named}`, 'definition');
        render = { ...widget.render, id: renderStampIdOf(renderType, widget.id, role) };
        this.types.register(render);
      } catch (error) {
        const problem = String(error).split('\n').slice(0, 2).join(' ');
        return fail(render ? `the render fails ${renderType}: ${problem}` : `the render cannot be read: ${problem}`, 'definition');
      }
      const id = extensionIdOf(widget.id, role, entry);
      // Extension ids do not depend on the dashboard: a widget named by two dashboards waits for every running release.
      // A release that started during that wait and lists this id is waited for too, and so is each one after it; a
      // release ends within its dashboard's earlier release, the mount timeout per id and the registry's unregisters,
      // and a new one lists this id only while no cell holds it.
      await Promise.all(this.releasing.values());
      while (this.unregistering.has(id)) await this.unregistering.get(id);
      if (gone()) return;
      extensionId = id;
      this.cells.set(id, (this.cells.get(id) ?? 0) + 1);
      try {
        const registers = !registry.getExtension(id);
        if (registers) await registry.registerExtension({ id, domain: WIDGETS_DOMAIN_ID, entry });
        // The dispose took its list of extensions before this registration ended: this cell takes its own one back.
        if (this.disposed) return void (await registry.unregisterExtension(id).catch(() => undefined));
        // The cell left while it registered, so the prune after its leave did not see the id: it records nothing, and
        // takes back the extension it registered unless another cell or a dashboard of the root holds the id.
        if (!live) {
          if (registers && !this.held(id)) await registry.unregisterExtension(id).catch(() => undefined);
          return;
        }
        let ids = this.extensions.get(dashboardId);
        if (!ids) this.extensions.set(dashboardId, (ids = new Set()));
        ids.add(id);
      } catch (error) {
        return fail(`the generated extension is rejected: ${String(error)}`, 'mount');
      }
      if (gone()) return;
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
      latest = start(current);
      try {
        await mounted;
      } catch (error) {
        return fail(`mount_ext failed: ${String(error)}`, 'mount');
      }
      if (gone()) return;
      // A fallback unmounted the extension: the cell stays cannot-be-shown until the dashboard loads again, and a run
      // still in flight is dropped.
      const fellBack = (problem: string) => {
        ended = true;
        token += 1;
        fail(problem, 'render_widget');
      };
      deliver = (data, run) => this.deliverCell({ id, widget, role, binding, dataType, render, registry, data, isCurrent: () => live && run === token && !this.disposed, fail, fellBack, update });
      // A re-run during the mount replaced `latest`: the newest run delivers.
      await deliver(latest!.data, latest!.run);
    };
    let latest: { data: Promise<BindingResult>; run: number } | undefined;
    const start = (current: VariableValues) => {
      const run = ++token;
      requestFailed = false;
      awaited = undefined;
      const onShared = (answer: Promise<unknown>) => {
        if (run === token) awaited = answer;
      };
      const data = binding
        ? runBinding({ binding, host: this.host, shared, origin: this.origin, values: current, isLive: () => live && run === token, onShared })
        : Promise.resolve({ dropped: false as const, data: undefined });
      data.catch(() => undefined);
      return { data, run };
    };
    void run();

    return {
      leave: () => {
        if (live && extensionId) {
          const others = (this.cells.get(extensionId) ?? 1) - 1;
          if (others > 0) this.cells.set(extensionId, others);
          else this.cells.delete(extensionId);
        }
        live = false;
        // A disposed root unmounted every widget already.
        if (!registry || !extensionId || this.disposed) return;
        this.renderFallbacks.delete(extensionId);
        this.leaving.add(extensionId);
        registry.executeActionsChain({ action: { type: registry.typeSystem.resolveUnmountExtActionId(), target: WIDGETS_DOMAIN_ID, payload: { subject: extensionId, history: 'none' } } });
      },
      rerun: (next) => {
        current = next;
        // A cell with no request, or one that failed before its extension was ready, has nothing to re-run; a cell
        // whose binding has not started yet starts it with `current`.
        if (!live || ended || !binding || formOf(binding) === 'static' || latest === undefined) return;
        latest = start(next);
        update({ state: 'loading' });
        if (deliver) void deliver(latest.data, latest.run);
      },
      ended: () => ended,
      requestFailed: () => requestFailed,
      waitsOn: (answer) => awaited === answer,
      source,
    };
  }

  /** Stamps a binding run's data and sends `render_widget`, unless a newer run or the cell's leave made the run stale. */
  private async deliverCell({
    id,
    widget,
    role,
    binding,
    dataType,
    render,
    registry,
    data,
    isCurrent,
    fail,
    fellBack,
    update,
  }: {
    id: string;
    widget: WidgetInstance;
    role: Role;
    binding: Binding | undefined;
    dataType: string | undefined;
    render: Record<string, unknown>;
    registry: MfeRegistry;
    data: Promise<BindingResult>;
    isCurrent: () => boolean;
    fail: (problem: string, kind?: CellFailureKind) => void;
    fellBack: (problem: string) => void;
    update: (change: CellUpdate) => void;
  }): Promise<void> {
    // The title it checked, trimmed, so the widget's accessible name has no stray spaces; a blank title sends none.
    const title = typeof widget.title === 'string' ? widget.title.trim() : '';
    let payload: Record<string, unknown> = { render, ...(title ? { title } : {}) };
    try {
      const result = await data;
      if (result.dropped || !isCurrent()) return;
      if (binding && dataType) {
        if (result.data === null || typeof result.data !== 'object' || Array.isArray(result.data)) throw new CellFailure(`the transform result is not an object`, 'data');
        // The stamp is the data's only identity: a result that names its own GTS id or schema would register under it unchecked.
        const named = GTS_IDENTITY_FIELDS.find((field) => Object.hasOwn(result.data as object, field));
        if (named) throw new CellFailure(`the transform result carries the GTS field ${named}`, 'data');
        const stamped = { ...(result.data as object), id: stampIdOf(dataType, widget.id, role) };
        try {
          this.types.register(stamped);
        } catch (error) {
          throw new CellFailure(`the data fails ${dataType}: ${String(error).split('\n').slice(0, 2).join(' ')}`, 'data');
        }
        // The instance's own empty text, checked with the instance: a larger view sends its own, never the cell's.
        const emptyText = typeof widget.empty_text === 'string' ? { empty_text: widget.empty_text } : {};
        payload = { ...payload, ...(widget.value_format ? { value_format: widget.value_format } : {}), ...emptyText, data: stamped };
      }
    } catch (error) {
      if (!isCurrent()) return;
      // A failure the root does not know the step of is its own defect.
      return fail(error instanceof Error ? error.message : String(error), error instanceof CellFailure ? error.kind : 'unknown');
    }
    if (!isCurrent()) return;
    // The widget draws at the size of its cell: the root sends `render_widget` once the cell holds the container.
    update({ state: 'placing' });
    const container = this.containers.get(id);
    if (container) {
      await new Promise<void>((resolve) => {
        const end = () => {
          clearTimeout(timer);
          this.placing.delete(end);
          resolve();
        };
        const timer = setTimeout(end, PLACE_TIMEOUT_MS);
        this.placing.add(end);
        update({ container, placed: end });
      });
    }
    if (!isCurrent()) return;
    this.renderFallbacks.set(id, () => fellBack('the render_widget chain ended in fallback or timed out'));
    registry.executeActionsChain({
      action: { type: RENDER_WIDGET_ACTION_ID, target: id, payload },
      fallback: { action: { type: registry.typeSystem.resolveUnmountExtActionId(), target: WIDGETS_DOMAIN_ID, payload: { subject: id, history: 'none' } } },
    });
    // The widget resolves render_widget as soon as it holds the payload; a fallback turns the cell back to its placeholder.
    update({ state: 'shown' });
  }
}
