import { useEffect, useLayoutEffect, useMemo, useRef, useState, type CSSProperties, type RefObject } from 'react';

import { intlLocaleOf, kitScopeOf, type Dashboard as DashboardModel, type DashboardCell, type WidgetInstance } from '../contract';
import { DashboardArea, DEFAULT_DASHBOARD_TEXTS, type DashboardTexts } from '../DashboardArea';
import { CellFrame, DEFAULT_FRAME_TEXTS, StateBody, type CellState, type FrameTexts } from '../frame/CellFrame';
import { VariablesBar } from '../frame/VariablesBar';
import { SharedRequests, variablesOfBinding, type VariableValues } from './binding';
import type { CellRun, DashboardRoot, LoadOutcome } from './DashboardRoot';
import type { Role } from './ids';
import { escapeControls, slotOf } from './register';

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
   * Controlled variable values from the host, by variable name (for example read from the product's URL). A name the
   * dashboard does not declare is ignored and a value that is not one of the variable's options gives its default,
   * each with one console line. Variables the host leaves out follow the dashboard's own bar.
   */
  variables?: Record<string, string>;
  /** Called with every variable value when the viewer picks another option in the bar. */
  onVariablesChange?: (values: Record<string, string>) => void;
  /** No variable bar: the host draws its own control and passes `variables`. */
  hideVariables?: boolean;
}

export function Dashboard({ root, dashboardId, theme, language, texts, variables, onVariablesChange, hideVariables = false }: DashboardProps) {
  // Both values are on the domain before any cell mounts: a layout effect runs before the cells' own effects.
  useLayoutEffect(() => root.publish(theme, language), [root, theme, language]);
  const [outcome, setOutcome] = useState<{ id: string; outcome: LoadOutcome }>();
  const [container, setContainer] = useState<HTMLElement | null>(null);
  const previous = useRef<string | undefined>(undefined);

  useEffect(() => {
    let current = true;
    let settled = false;
    const load = root.load(dashboardId);
    void load.then(() => (settled = true), () => (settled = true));
    void load
      .catch((error: unknown): LoadOutcome => {
        // The first two lines of the error, escaped like the root's own lines: a stack or an id must not fake another line.
        console.error(`[dashboard] ${escapeControls(`dashboard ${dashboardId} cannot be shown: ${String(error).split('\n').slice(0, 2).join(' ')}`)}`);
        return { ok: false };
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
  }, [root, dashboardId]);

  const loaded = outcome?.id === dashboardId ? outcome.outcome : undefined;
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
          container={container}
          hostValues={variables}
          onVariablesChange={onVariablesChange}
          hideVariables={hideVariables}
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
  hostValues,
  onVariablesChange,
  hideVariables,
}: {
  root: DashboardRoot;
  dashboardId: string;
  loaded: Extract<LoadOutcome, { ok: true }>;
  texts?: DashboardTexts;
  frameTexts: FrameTexts;
  container: HTMLElement | null;
  hostValues?: Record<string, string>;
  onVariablesChange?: (values: Record<string, string>) => void;
  hideVariables: boolean;
}) {
  // One set of held shared answers per shown dashboard; it goes with the dashboard.
  const shared = useMemo(() => new SharedRequests(loaded.dashboard.requests ?? {}, root.host, root.origin), [loaded, root]);
  const values = useVariableValues(loaded.dashboard, dashboardId, hostValues);
  const [picked, setPicked] = useState<Record<string, string>>({});
  // The bar's own picks count where the host passes no value; a host value always wins, and a rejected one gives the default.
  const current = useMemo(() => ({ ...values.defaults, ...picked, ...values.host }), [values, picked]);
  const valuesKey = JSON.stringify(current);
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
  // request it first drops the held failed answer, then re-runs every live run whose request failed on that same shared
  // request, so the request goes out once for all of them and each shows the new answer.
  const retry = (slotId: string) => {
    const run = runs.get(slotId);
    if (!run?.requestFailed()) return;
    const { source } = run;
    if (source !== undefined) shared.forgetFailure(source, current);
    for (const other of [...runs.values()]) if (other === run || (source !== undefined && other.source === source && other.requestFailed())) other.rerun(current);
  };
  const declared = loaded.dashboard.variables;
  const bar =
    declared && Object.keys(declared).length > 0 && !hideVariables ? (
      <VariablesBar
        variables={declared}
        values={current}
        container={container}
        onChange={(name, value) => {
          setPicked((before) => ({ ...before, [name]: value }));
          onVariablesChange?.({ ...current, [name]: value });
        }}
      />
    ) : undefined;
  return (
    <DashboardArea
      layout={loaded.dashboard.layout}
      texts={texts ?? DEFAULT_DASHBOARD_TEXTS}
      bar={bar}
      renderCell={(cell, index) => (
        <Cell root={root} dashboardId={dashboardId} cell={cell} index={index} failed={loaded.failed} shared={shared} values={current} texts={frameTexts} container={container} runs={runs} retry={retry} />
      )}
    />
  );
}

/**
 * The dashboard's variable defaults and the host's values that apply. A host name the dashboard does not declare is
 * ignored and a host value that is not one of its variable's options gives the default, even over the bar's last
 * pick, each with one console line per rejected value each time the host values change.
 */
function useVariableValues(dashboard: DashboardModel, dashboardId: string, hostValues: Record<string, string> | undefined) {
  const hostKey = JSON.stringify(hostValues ?? {});
  const result = useMemo(() => {
    const declared = dashboard.variables ?? {};
    const defaults = Object.fromEntries(Object.entries(declared).map(([name, variable]) => [name, variable.default]));
    const host: Record<string, string> = {};
    const problems: string[] = [];
    for (const [name, value] of Object.entries(hostValues ?? {})) {
      const variable = Object.hasOwn(declared, name) ? declared[name] : undefined;
      if (!variable) problems.push(`the host variable ${name} is not a variable of the dashboard and is ignored`);
      else if (!variable.options.some((option) => option.value === value)) {
        problems.push(`the host value ${String(value)} of the variable ${name} is not one of its options, so it is ${variable.default}`);
        // The default, not the bar's last pick: the host still drives this variable.
        host[name] = variable.default;
      } else host[name] = value;
    }
    return { defaults, host, problems };
    // `hostKey` stands for `hostValues`.
  }, [dashboard, hostKey]);
  useEffect(() => {
    for (const problem of result.problems) console.error(`[dashboard] ${escapeControls(`dashboard ${dashboardId}: ${problem}`)}`);
  }, [result, dashboardId]);
  return result;
}

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
) {
  const [state, setState] = useState<CellState | 'placing'>('loading');
  // True while the cannot-be-shown state came from a failed data request: the frame then offers a retry.
  const [retryable, setRetryable] = useState(false);
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
  // Only a change of a variable this widget's request names re-runs it: the values of those variables are its key.
  const binding = useMemo(() => root.bindingOf(widget, failure), [root, widget, failure]);
  const dependsOn = binding ? variablesOfBinding(binding, shared) : [];
  const dependencyKey = JSON.stringify(dependsOn.map((name) => values[name] ?? null));
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
}: {
  root: DashboardRoot;
  dashboardId: string;
  cell: DashboardCell;
  index: number;
  failed: ReadonlyMap<string, string>;
  shared: SharedRequests;
  values: VariableValues;
  texts: FrameTexts;
  container: HTMLElement | null;
  runs: Map<string, CellRun>;
  retry: (slotId: string) => void;
}) {
  const { state, slot, retryable } = useWidget(root, dashboardId, cell.widget, 'cell', failed.get(slotOf(index, 'cell')), shared, values, runs, slotOf(index, 'cell'));
  const [open, setOpen] = useState(false);
  // A frameless cell has no button to open a larger view; one that names a larger view failed its registration.
  const frame = cell.frame !== false;
  const larger = frame ? cell.larger_view : undefined;
  return (
    <CellFrame
      frame={frame}
      title={cell.widget.title}
      description={cell.widget.description}
      state={state === 'placing' ? 'shown' : state}
      texts={texts}
      onRetry={retryable ? () => retry(slotOf(index, 'cell')) : undefined}
      largerView={
        larger
          ? {
              title: larger.title ?? cell.widget.title ?? '',
              description: larger.description,
              // The larger view draws its own states inside the overlay.
              state: 'shown',
              content: open ? (
                <LargerView
                  root={root}
                  dashboardId={dashboardId}
                  widget={larger}
                  failure={failed.get(slotOf(index, 'larger_view'))}
                  shared={shared}
                  values={values}
                  texts={texts}
                  runs={runs}
                  slotId={slotOf(index, 'larger_view')}
                  retry={retry}
                />
              ) : null,
              onOpenChange: setOpen,
              container,
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
  failure,
  shared,
  values,
  texts,
  runs,
  slotId,
  retry,
}: {
  root: DashboardRoot;
  dashboardId: string;
  widget: WidgetInstance;
  failure?: string;
  shared: SharedRequests;
  values: VariableValues;
  texts: FrameTexts;
  runs: Map<string, CellRun>;
  slotId: string;
  retry: (slotId: string) => void;
}) {
  const { state, slot, retryable } = useWidget(root, dashboardId, widget, 'larger_view', failure, shared, values, runs, slotId);
  return (
    <StateBody state={state === 'placing' ? 'shown' : state} texts={texts} onRetry={retryable ? () => retry(slotId) : undefined}>
      <WidgetSlot state={state} slot={slot} texts={texts} />
    </StateBody>
  );
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

