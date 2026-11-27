import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, useSyncExternalStore, type CSSProperties, type RefObject } from 'react';

import { intlLocaleOf, kitScopeOf, type DashboardCell, type DashboardLayout, type FailureReport, type WidgetInstance } from '../contract';
import { DashboardArea, DEFAULT_DASHBOARD_TEXTS, type DashboardTexts } from '../DashboardArea';
import { CellFrame, DEFAULT_FRAME_TEXTS, isIcon, isNoIcon, StateBody, useRetryFocus, type CellAction, type CellState, type FrameTexts } from '../frame/CellFrame';
import { readValue, SharedRequests, UNREADABLE, variablesOfBinding, type VariableValues } from './binding';
import type { CellRun, DashboardRoot, LoadOutcome } from './DashboardRoot';
import type { Role } from './ids';
import { escapeControls, firstLineOf, slotOf } from './register';

/*
 * The dashboard as a React component: the single-page hosting form of the
 * dashboard root (DESIGN §3.3 Host interface). The host passes the root, a
 * dashboard id, its theme id and language; the widgets inside stay FrontX
 * MFEs, each mounted by the root's registry in its own shadow root.
 */

/** The quiet time after the last size change of a cell before its widget draws. */
const SETTLE_MS = 80;
const HIDDEN: CSSProperties = { display: 'none' };
const SLOT: CSSProperties = { display: 'flex', flex: 1, flexDirection: 'column', minBlockSize: 0 };
const PLACING_FRAME: CSSProperties = { ...SLOT, position: 'relative' };
const PLACING_LOADER: CSSProperties = { position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column' };

export interface DashboardProps {
  root: DashboardRoot;
  dashboardId: string;
  /** The host theme id, published unchanged to the widgets. */
  theme: string;
  /** The host language, published unchanged to the widgets. */
  language: string;
  texts?: { dashboard?: DashboardTexts; frame?: FrameTexts };
  /**
   * The variable values the requests take, by variable name, owned by the host (for example its own period control
   * or the product's URL). A request that names a variable missing here, or whose value is not a string, a finite
   * number or a boolean, fails its cell. A change of a value re-runs only the cells whose request names it.
   */
  variables?: VariableValues;
  /**
   * The element the larger-view overlay mounts in; without it, the dashboard's own element. A host whose page content
   * sits in its own stacking context, under a fixed sidebar for example, passes `document.body`. The overlay then takes
   * its kit theme scope (`data-theme`) and `lang` from that element and its ancestors, not from the dashboard. The
   * widgets open their own overlays (the sort menu of a table, for one) in the same element, each in a shadow root of
   * its own that carries the widget's styles, theme scope and language.
   */
  overlayContainer?: HTMLElement | null;
  /**
   * Called once each time a cell or an open larger view turns cannot-be-shown, and once each time a load of the
   * dashboard fails or the loaded dashboard fails a layout check, after that state is on screen; never during a render,
   * and never for a root disposed before or during the load or the cell's run. A widget's own cannot-be-shown state and
   * a failed `refresh` are not reported. The report's `message` may quote answer data (see `FailureReport`). A call
   * that throws, or returns a promise that rejects, writes one console line and changes nothing else; a new function on
   * every render re-runs no cell, and the newest one is called.
   */
  onFailure?: (report: FailureReport) => void;
  /**
   * The host's own actions on a cell or its larger view, such as "Show the rows", drawn by the frame as buttons before
   * the larger-view button, in the cell header and in the open larger view's header. Asked on each render of a framed
   * cell, and of a larger view only while it is open; a frameless cell asks nothing. The host decides per state whether
   * an action shows: with no check of `state` its actions show in every state. It is asked on each render, so it should
   * have no side effects. The list is checked: a value that is not a list, or a list that cannot be read, draws
   * nothing, and an item that cannot be read, without a string `id`, with an `id` already in the list, without a label
   * that is a non-blank string, without an `onSelect` function, or with an `icon` that is neither an icon nor no icon
   * (see `CellAction`) is skipped; each cell or larger view writes one console line for its problems, and again only
   * when they change. A `cellActions` that throws writes one such line, and its cell or larger view draws no host
   * action. An `onSelect` that throws, or returns a promise that rejects, writes one console line each time it runs;
   * the buttons stay, and an open larger view stays open. An icon whose component throws as it renders writes one
   * console line, and its cell or larger view draws no host action until its list of ids changes.
   */
  cellActions?: (target: CellActionTarget) => readonly CellAction[];
}

/** What the host's `cellActions` is asked about: one framed cell, or one open larger view. */
export interface CellActionTarget {
  dashboardId: string;
  /** The id of the widget instance: the cell's `widget`, or its `larger_view`. */
  widgetId: string;
  role: 'cell' | 'larger_view';
  /** What the cell or the larger view shows; a widget still laid out under its loader is `loading`. */
  state: CellState;
}

/** Hands a failure to the host's `onFailure`, when it gave one, through `callHost`. */
type Report = (failure: FailureReport) => void;

/**
 * Runs host code: a throw writes one console line naming it and gives nothing, so the dashboard goes on as without it.
 * A returned promise that rejects is a throw too: the same line, and no unhandled rejection.
 */
function callHost(name: string, call: () => unknown): void {
  const failed = (error: unknown) => console.error(`[dashboard] ${escapeControls(`the host ${name} failed: ${firstLineOf(error, 'it threw a value that cannot be shown')}`)}`);
  try {
    const result = call();
    if (result !== null && (typeof result === 'object' || typeof result === 'function')) {
      const { then } = result as { then?: unknown };
      if (typeof then === 'function') then.call(result, undefined, failed);
    }
  } catch (error) {
    failed(error);
  }
}

export function Dashboard({ root, dashboardId, theme, language, texts, variables, overlayContainer, onFailure, cellActions }: DashboardProps) {
  // The values are on the domain before any cell mounts: a layout effect runs before the cells' own effects.
  useLayoutEffect(() => root.publish(theme, language), [root, theme, language]);
  // On unmount the root keeps no element of a page the host may remove, unless another view on the root published its
  // own since. A changed container is published by the next effect of the same commit, and a widget's own state settles
  // on that last value.
  useLayoutEffect(() => {
    root.publishOverlayContainer(overlayContainer ?? null);
    return () => root.withdrawOverlayContainer(overlayContainer ?? null);
  }, [root, overlayContainer]);
  const [outcome, setOutcome] = useState<{ id: string; outcome: LoadOutcome }>();
  const [container, setContainer] = useState<HTMLElement | null>(null);
  const previous = useRef<string | undefined>(undefined);
  // A refresh of the root that read new definitions loads the dashboard again; the one drawn stays until it settles.
  const subscribe = useCallback((listener: () => void) => root.subscribe(listener), [root]);
  const getVersion = useCallback(() => root.version, [root]);
  // The same getter on a server render: the version is a plain counter.
  const version = useSyncExternalStore(subscribe, getVersion, getVersion);
  // Read through a ref: a new function on every render re-runs nothing, and the newest one is called.
  const onFailureNow = useRef(onFailure);
  onFailureNow.current = onFailure;
  const report = useCallback<Report>((failure) => {
    const call = onFailureNow.current;
    if (call) callHost('onFailure', () => call(failure));
  }, []);

  useEffect(() => {
    let current = true;
    let settled = false;
    const load = root.load(dashboardId);
    void load.then(() => (settled = true), () => (settled = true));
    void load
      .catch((error: unknown): LoadOutcome => {
        // The first two lines of the error, escaped like the root's own lines: a stack or an id must not fake another line.
        // `String()` itself throws for a value with no usable toString, such as Object.create(null).
        let text = 'it rejected with a value that cannot be shown';
        try {
          text = String(error).split('\n').slice(0, 2).join(' ');
        } catch {
          // The fallback text stands.
        }
        const message = escapeControls(`dashboard ${dashboardId} cannot be shown: ${text}`);
        console.error(`[dashboard] ${message}`);
        return { ok: false, failure: { kind: 'unknown', message } };
      })
      .then((result) => current && setOutcome({ id: dashboardId, outcome: result }));
    // A new dashboard id unregisters the generated extensions of the one before; leaving keeps them for a return.
    if (previous.current !== undefined && previous.current !== dashboardId) void root.release(previous.current);
    previous.current = dashboardId;
    return () => {
      current = false;
      // Unmounting while loading discards the load: the next mount starts a new one.
      if (!settled) root.forget(dashboardId, load);
    };
  }, [root, dashboardId, version]);

  const loaded = outcome?.id === dashboardId ? outcome.outcome : undefined;
  // The cells of a new load took their place in this commit, and the ones it dropped have left: their extensions go.
  useEffect(() => {
    if (loaded?.ok) void root.prune(dashboardId, loaded.dashboard);
  }, [root, dashboardId, loaded]);
  // Each failed load is a new outcome, reported once it shows. An outcome kept from before shows again when the host
  // returns to its id while the load in between has not settled: it was reported then, and is not again.
  const reportedLoad = useRef<LoadOutcome | undefined>(undefined);
  useEffect(() => {
    if (!loaded || loaded.ok || !loaded.failure || reportedLoad.current === loaded) return;
    reportedLoad.current = loaded;
    report({ scope: 'dashboard', kind: loaded.failure.kind, dashboardId, message: loaded.failure.message });
  }, [loaded, dashboardId, report]);
  const frameTexts = texts?.frame ?? DEFAULT_FRAME_TEXTS;
  return (
    <div data-theme={kitScopeOf(theme)} lang={intlLocaleOf(language)} ref={setContainer} style={{ display: 'contents' }}>
      <div ref={(element) => root.attach(element)} style={HIDDEN} />
      {loaded?.ok ? (
        <LoadedDashboard
          key={dashboardId}
          root={root}
          dashboardId={dashboardId}
          loaded={loaded}
          texts={texts?.dashboard}
          frameTexts={frameTexts}
          container={overlayContainer ?? container}
          values={variables}
          report={report}
          cellActions={cellActions}
        />
      ) : (
        <DashboardArea failed={loaded !== undefined} renderCell={() => null} texts={texts?.dashboard ?? DEFAULT_DASHBOARD_TEXTS} />
      )}
    </div>
  );
}

function LoadedDashboard({
  root,
  dashboardId,
  loaded,
  texts,
  frameTexts,
  container,
  values: given,
  report,
  cellActions,
}: {
  root: DashboardRoot;
  dashboardId: string;
  loaded: Extract<LoadOutcome, { ok: true }>;
  texts?: DashboardTexts;
  frameTexts: FrameTexts;
  container: HTMLElement | null;
  values?: VariableValues;
  report: Report;
  cellActions: DashboardProps['cellActions'];
}) {
  // One set of held shared answers per shown dashboard; it goes with the dashboard.
  const shared = useMemo(() => new SharedRequests(loaded.dashboard.requests ?? {}, root.host, root.origin), [loaded, root]);
  const plain = given !== null && typeof given === 'object' ? given : NO_VALUES;
  const names = namesOf(plain);
  // Values whose names cannot be listed are unreadable as a whole, and every such object is the same unreadable
  // values: the cells that name a variable fail, and the next readable values run them again.
  const values = names === undefined ? UNREADABLE_VALUES : plain;
  // The host may pass a new object with the same values on every render: the key stands for the values themselves.
  const valuesKey = names === undefined ? 'unreadable' : keyOfValues(values, names);
  // `valuesKey` stands for `values`.
  const current = useMemo(() => values, [valuesKey]);
  // The running cells and larger views by slot; a closed larger view has none.
  const runs = useRef(new Map<string, CellRun>()).current;
  // Every shared request a live cell or a larger view names is sent once per built request, as soon as the values are
  // known, not on the first widget that asks. At load that covers every cell and larger view, open or closed; on a
  // variable change only the slots with a live run (an open cell or an open larger view), so a closed larger view asks
  // for the new values when it opens. A slot that failed its registration, or whose run has ended (a fallback), sends
  // nothing. The cells' own effects run first, so a run ended before this commit is skipped.
  // The held answers last prefetched for: a new `loaded` or `root` builds new ones without a remount, and that is a load again.
  const prefetched = useRef<SharedRequests | null>(null);
  useEffect(() => {
    const atLoad = prefetched.current !== shared;
    prefetched.current = shared;
    loaded.dashboard.layout.cells.forEach((cell, index) => {
      for (const [widget, role] of [[cell.widget, 'cell'], [cell.larger_view, 'larger_view']] as const) {
        const slot = slotOf(index, role);
        const run = runs.get(slot);
        if (!widget || loaded.failed.has(slot) || run?.ended() || (!atLoad && !run)) continue;
        const source = (root.bindingOf(widget, undefined) as { source?: unknown } | undefined)?.source;
        if (typeof source === 'string' && shared.has(source)) void shared.get(source, current).catch(() => undefined);
      }
    });
    // `valuesKey` stands for `current`.
  }, [loaded, root, runs, shared, valuesKey]);
  // A retry runs the failed cell's binding again the way a variable change does, with the current values. For a shared
  // request it first drops the held failed answer, then re-runs every live run on that same shared request whose
  // request failed or that still waits on the dropped answer (a cell still mounting has not reported it yet), so the
  // request goes out once for all of them and each shows the new answer. A run with a good answer is left alone.
  const retry = (slotId: string) => {
    const run = runs.get(slotId);
    if (!run?.requestFailed()) return;
    const { source } = run;
    const dropped = source === undefined ? undefined : shared.forgetFailure(source, current);
    const affected = (other: CellRun) => other.source === source && (other.requestFailed() || (dropped !== undefined && other.waitsOn(dropped)));
    for (const other of [...runs.values()]) if (other === run || (source !== undefined && affected(other))) other.rerun(current);
  };
  // A loaded dashboard whose layout check fails shows the dashboard-level state too: a failure of kind `dashboard`.
  const layoutFailed = useCallback((message: string) => report({ scope: 'dashboard', kind: 'dashboard', dashboardId, message }), [report, dashboardId]);
  return (
    <DashboardArea
      layout={loaded.dashboard.layout}
      onLayoutFailure={layoutFailed}
      texts={texts ?? DEFAULT_DASHBOARD_TEXTS}
      renderCell={(cell, index) => (
        <Cell root={root} dashboardId={dashboardId} cell={cell} index={index} failed={loaded.failed} shared={shared} values={current} texts={frameTexts} container={container} runs={runs} retry={retry} layout={loaded.dashboard.layout} report={report} cellActions={cellActions} />
      )}
    />
  );
}

const NO_VALUES: VariableValues = {};

/**
 * The names the host's values carry, enumerable or not, or nothing when listing them throws (a Proxy). The listing
 * reads no property, so a value whose read throws fails only the cells whose request names it.
 */
const namesOf = (values: VariableValues) => {
  try {
    return Object.getOwnPropertyNames(values);
  } catch {
    return undefined;
  }
};

const unreadable = () => {
  throw new Error('unreadable');
};
/** Values every read of which throws: each variable a request names then fails its cells as one that cannot be read. */
const UNREADABLE_VALUES: VariableValues = new Proxy({}, { get: unreadable, has: unreadable, ownKeys: unreadable, getOwnPropertyDescriptor: unreadable });

/**
 * A key for the values of these names that tells every given value apart, by its type and text: a missing name, a
 * string "1" and a number 1, and a NaN all give different keys; any object or function gives one key per kind, as none
 * is a valid value, and so does a value that cannot be read, which fails only the cells whose request names it.
 */
const keyOfValues = (values: VariableValues, names: readonly string[]) =>
  JSON.stringify(
    [...names].sort().map((name) => {
      const read = readValue(values, name);
      if (read === UNREADABLE) return [name, 'unreadable'];
      if (!read) return [name];
      const { value } = read;
      // An object or a function is never a valid value: its kind is enough, and reading its text could throw.
      if (typeof value === 'function' || (value !== null && typeof value === 'object')) return [name, typeof value];
      // Only primitives and null reach here, and their text never runs host code.
      return [name, typeof value, String(value)];
    }),
  );

/** Runs a widget through the root and gives back its state and the element that holds its container. */
function useWidget(
  root: DashboardRoot,
  dashboardId: string,
  widget: WidgetInstance,
  role: Role,
  failure: string | undefined,
  shared: SharedRequests,
  values: VariableValues,
  runs: Map<string, CellRun>,
  slotId: string,
  report: Report,
) {
  const [state, setState] = useState<CellState | 'placing'>('loading');
  // True while the cannot-be-shown state came from a failed data request: the frame then offers a retry.
  const [retryable, setRetryable] = useState(false);
  // The failure of the cannot-be-shown state on screen; each failure of the root is a new object.
  const [shownFailure, setShownFailure] = useState<FailureReport>();
  const [placement, setPlacement] = useState<{ container: HTMLElement; placed: () => void }>();
  const slot = useRef<HTMLDivElement>(null);
  const run = useRef<CellRun>(undefined);
  const latest = useRef(values);
  latest.current = values;
  useEffect(() => {
    const cell = root.runCell({
      dashboardId,
      widget,
      role,
      failure,
      shared,
      values: latest.current,
      update: (change) => {
        if (!('state' in change)) return setPlacement(change);
        setState(change.state);
        setRetryable(change.retry === true);
        setShownFailure(change.failure);
      },
    });
    run.current = cell;
    runs.set(slotId, cell);
    return () => {
      run.current = undefined;
      if (runs.get(slotId) === cell) runs.delete(slotId);
      cell.leave();
    };
  }, [root, dashboardId, widget, role, failure, shared, runs, slotId]);
  // The host hears of a failure once it is on screen, once per failure (each is a new object); a cell that left, or
  // turned to loading first, reports nothing.
  useEffect(() => {
    if (state === 'cannot-be-shown' && shownFailure) report(shownFailure);
  }, [state, shownFailure, report]);
  // Only a change of a variable this widget's request names re-runs it: the values of those variables are its key.
  const binding = useMemo(() => root.bindingOf(widget, failure), [root, widget, failure]);
  const dependsOn = binding ? variablesOfBinding(binding, shared) : [];
  const dependencyKey = keyOfValues(values, dependsOn);
  // The key the cell last ran with: StrictMode runs this effect twice on mount, and the second run, with the same key,
  // must not re-run the cell. The root's own `latest` check covers a re-run the first show has not started yet.
  const ranWith = useRef(dependencyKey);
  useEffect(() => {
    if (ranWith.current === dependencyKey) return;
    ranWith.current = dependencyKey;
    run.current?.rerun(latest.current);
  }, [dependencyKey]);
  // The domain mounts the container under its own hidden root; the cell takes it once it shows.
  useEffect(() => {
    const target = slot.current;
    if ((state !== 'shown' && state !== 'placing') || !placement || !target) return undefined;
    if (placement.container.parentElement !== target) target.appendChild(placement.container);
    // The kit Grid settles the cell's span after its first layout; the widget draws once the slot keeps its size.
    let timer = setTimeout(placement.placed, SETTLE_MS);
    const observer = new ResizeObserver(() => {
      clearTimeout(timer);
      timer = setTimeout(placement.placed, SETTLE_MS);
    });
    observer.observe(target);
    return () => {
      clearTimeout(timer);
      observer.disconnect();
    };
  }, [state, placement]);
  return { state, slot, retryable };
}

function Cell({
  root,
  dashboardId,
  cell,
  index,
  failed,
  shared,
  values,
  texts,
  container,
  runs,
  retry,
  layout,
  report,
  cellActions,
}: {
  root: DashboardRoot;
  dashboardId: string;
  cell: DashboardCell;
  /** The dashboard layout's frame choices, the same for every cell. */
  layout: Pick<DashboardLayout, 'description_display' | 'card_size'>;
  index: number;
  failed: ReadonlyMap<string, string>;
  shared: SharedRequests;
  values: VariableValues;
  texts: FrameTexts;
  container: HTMLElement | null;
  runs: Map<string, CellRun>;
  retry: (slotId: string) => void;
  report: Report;
  cellActions: DashboardProps['cellActions'];
}) {
  const { state, slot, retryable } = useWidget(root, dashboardId, cell.widget, 'cell', failed.get(slotOf(index, 'cell')), shared, values, runs, slotOf(index, 'cell'), report);
  const [open, setOpen] = useState(false);
  // What the open larger view shows, for the host's actions on it.
  const [largerState, setLargerState] = useState<CellState>('loading');
  // A frameless cell has no button to open a larger view; one that names a larger view failed its registration.
  const frame = cell.frame !== false;
  const larger = frame ? cell.larger_view : undefined;
  const largerTitle = larger?.title ?? cell.widget.title ?? '';
  // A frameless cell has no header, so it asks for no action; a larger view is asked only while it is open.
  const actions = useHostActions(cellActions, frame ? { dashboardId, widgetId: cell.widget.id, role: 'cell', state: targetStateOf(state) } : undefined);
  const largerActions = useHostActions(cellActions, larger && open ? { dashboardId, widgetId: larger.id, role: 'larger_view', state: largerState } : undefined);
  const openChange = (next: boolean) => {
    setOpen(next);
    if (!next) setLargerState('loading');
  };
  return (
    <CellFrame
      frame={frame}
      title={cell.widget.title}
      description={cell.widget.description}
      descriptionDisplay={layout.description_display}
      cardSize={layout.card_size}
      container={container}
      state={state === 'placing' ? 'shown' : state}
      texts={texts}
      onRetry={retryable ? () => retry(slotOf(index, 'cell')) : undefined}
      actions={actions}
      largerView={
        larger
          ? {
              title: largerTitle,
              description: larger.description,
              // The larger view draws its own states inside the overlay.
              state: 'shown',
              content: open ? (
                <LargerView
                  root={root}
                  dashboardId={dashboardId}
                  widget={larger}
                  title={largerTitle}
                  failure={failed.get(slotOf(index, 'larger_view'))}
                  shared={shared}
                  values={values}
                  texts={texts}
                  runs={runs}
                  slotId={slotOf(index, 'larger_view')}
                  retry={retry}
                  report={report}
                  onState={setLargerState}
                />
              ) : null,
              onOpenChange: openChange,
              container,
              actions: largerActions,
            }
          : undefined
      }
    >
      <WidgetSlot state={state} slot={slot} texts={texts} />
    </CellFrame>
  );
}

function LargerView({
  root,
  dashboardId,
  widget,
  title,
  failure,
  shared,
  values,
  texts,
  runs,
  slotId,
  retry,
  report,
  onState,
}: {
  root: DashboardRoot;
  dashboardId: string;
  widget: WidgetInstance;
  /** The overlay's title, for the retry button's name. */
  title: string;
  failure?: string;
  shared: SharedRequests;
  values: VariableValues;
  texts: FrameTexts;
  runs: Map<string, CellRun>;
  slotId: string;
  retry: (slotId: string) => void;
  report: Report;
  /** Told what the larger view shows, for the host's actions on it. */
  onState: (state: CellState) => void;
}) {
  const { state, slot, retryable } = useWidget(root, dashboardId, widget, 'larger_view', failure, shared, values, runs, slotId, report);
  const shown = state === 'placing' ? 'shown' : state;
  const asked = targetStateOf(state);
  useEffect(() => onState(asked), [asked, onState]);
  // Inside the dialog too, a retry keeps focus in place: on this wrapper while it loads, then on the new button or here.
  const focus = useRetryFocus(shown, retryable ? () => retry(slotId) : undefined);
  return (
    <div ref={focus.wrapper} tabIndex={-1} style={SLOT}>
      <StateBody state={shown} texts={texts} onRetry={focus.retry} title={title} retryRef={focus.button}>
        <WidgetSlot state={state} slot={slot} texts={texts} />
      </StateBody>
    </div>
  );
}

/** The state the host's actions are asked with: a widget laid out under its loader (`placing`) still shows the loader. */
const targetStateOf = (state: CellState | 'placing'): CellState => (state === 'placing' ? 'loading' : state);

/** The fields of one item of the host's list, each read once. */
type ItemFields = Partial<Record<keyof CellAction, unknown>>;

/** Why the frame skips one item of the host's list, from the copies of its fields, or nothing for an item it draws. */
function skipReasonOf({ id, label, icon, onSelect }: ItemFields, ids: ReadonlySet<string>): string | undefined {
  if (typeof id !== 'string') return 'has no string id';
  if (ids.has(id)) return `repeats the id ${JSON.stringify(id)}`;
  if (typeof label !== 'string' || !label.trim()) return 'has no label';
  if (typeof onSelect !== 'function') return 'has no onSelect function';
  if (!isNoIcon(icon) && !isIcon(icon)) return 'has an icon that is not a string, a number, an element or a list of those';
  return undefined;
}

/**
 * Asks the host for the actions of one slot and checks the answer: the items the frame draws, each `onSelect` guarded,
 * and the one line that names what was wrong, if anything. Nothing the host gives is read outside a guard: the list
 * and each item's fields are read once, and only those copies are checked and drawn, so a getter that answers anew on
 * a second read cannot slip past the check.
 */
function checkedActions(ask: () => unknown, where: string): { actions: CellAction[]; problem?: string } {
  let given: unknown;
  try {
    given = ask();
  } catch (error) {
    return { actions: [], problem: `${where}: the host cellActions failed: ${firstLineOf(error, 'it threw a value that cannot be shown')}` };
  }
  let length: number;
  try {
    if (!Array.isArray(given)) return { actions: [], problem: `${where}: the host cellActions gave no list, so the slot draws no action` };
    length = given.length;
  } catch {
    // A revoked Proxy throws from the list check itself.
    return { actions: [], problem: `${where}: the host cellActions gave a list that cannot be read, so the slot draws no action` };
  }
  const actions: CellAction[] = [];
  const skipped: string[] = [];
  const ids = new Set<string>();
  for (let index = 0; index < length; index += 1) {
    let reason: string | undefined;
    try {
      const item: unknown = (given as readonly unknown[])[index];
      if (item === null || typeof item !== 'object') reason = 'is not an object';
      else {
        const { id, label, icon: read, onSelect } = item as ItemFields;
        // A list of icon parts is copied too: the frame draws the parts that were checked.
        const icon: unknown = Array.isArray(read) ? [...(read as unknown[])] : read;
        reason = skipReasonOf({ id, label, icon, onSelect }, ids);
        if (!reason) {
          const select = onSelect as () => unknown;
          ids.add(id as string);
          actions.push({ id: id as string, label: label as string, ...(isIcon(icon) ? { icon: icon as CellAction['icon'] } : {}), onSelect: () => void callHost('onSelect', () => select()) });
        }
      }
    } catch {
      reason = 'cannot be read';
    }
    if (reason) skipped.push(`item ${index + 1} ${reason}`);
  }
  return { actions, ...(skipped.length ? { problem: `${where}: the host cellActions gave items the frame skips: ${skipped.join('; ')}` } : {}) };
}

/**
 * The host's checked actions for one slot (a framed cell, or an open larger view), asked on each render; without a
 * target nothing is asked. The slot writes one console line for its problems, and again only when they change.
 */
function useHostActions(cellActions: DashboardProps['cellActions'], target: CellActionTarget | undefined): readonly CellAction[] | undefined {
  const checked = cellActions && target ? checkedActions(() => cellActions(target), `dashboard ${target.dashboardId}, widget ${target.widgetId}, ${target.role}`) : undefined;
  const problem = checked?.problem;
  const written = useRef<string | undefined>(undefined);
  useEffect(() => {
    if (problem === written.current) return;
    written.current = problem;
    if (problem) console.error(`[dashboard] ${escapeControls(problem)}`);
  }, [problem]);
  return checked?.actions;
}

/**
 * The element the widget's container goes into. While the root places it (`placing`), the slot already has its
 * full size so the widget draws at the cell's size, but stays hidden under the cell's loader until render_widget
 * has gone out.
 */
function WidgetSlot({ state, slot, texts }: { state: CellState | 'placing'; slot: RefObject<HTMLDivElement | null>; texts: FrameTexts }) {
  const placing = state === 'placing';
  return (
    <div style={PLACING_FRAME}>
      <div ref={slot} style={placing ? { ...SLOT, visibility: 'hidden' } : SLOT} />
      {placing ? (
        <div style={PLACING_LOADER}>
          <StateBody state="loading" texts={texts} />
        </div>
      ) : null}
    </div>
  );
}

