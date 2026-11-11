import { useEffect, useLayoutEffect, useMemo, useRef, useState, type CSSProperties, type RefObject } from 'react';

import { kitScopeOf, type DashboardCell, type WidgetInstance } from '../contract';
import { DashboardArea, DEFAULT_DASHBOARD_TEXTS, type DashboardTexts } from '../DashboardArea';
import { CellFrame, DEFAULT_FRAME_TEXTS, StateBody, type CellState, type FrameTexts } from '../frame/CellFrame';
import { SharedRequests } from './binding';
import type { DashboardRoot, LoadOutcome } from './DashboardRoot';
import type { Role } from './ids';
import { slotOf } from './register';

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
}

export function Dashboard({ root, dashboardId, theme, language, texts }: DashboardProps) {
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
        console.error(`[dashboard] dashboard ${dashboardId} cannot be shown: ${String(error)}`);
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
    <div data-theme={kitScopeOf(theme)} lang={language} ref={setContainer} style={{ display: 'contents' }}>
      <div ref={(element) => root.attach(element)} style={HIDDEN} />
      {loaded?.ok ? (
        <LoadedDashboard key={dashboardId} root={root} dashboardId={dashboardId} loaded={loaded} texts={texts?.dashboard} frameTexts={frameTexts} container={container} />
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
}: {
  root: DashboardRoot;
  dashboardId: string;
  loaded: Extract<LoadOutcome, { ok: true }>;
  texts?: DashboardTexts;
  frameTexts: FrameTexts;
  container: HTMLElement | null;
}) {
  // One set of held shared answers per shown dashboard; it goes with the dashboard.
  const shared = useMemo(() => new SharedRequests(loaded.dashboard.requests ?? {}, root.host, root.origin), [loaded, root]);
  // Every shared request a cell or a larger view names is sent once, at load, not on the first widget that asks.
  useEffect(() => {
    for (const cell of loaded.dashboard.layout.cells) {
      for (const widget of [cell.widget, cell.larger_view]) {
        const source = (widget?.data as { source?: unknown } | undefined)?.source;
        if (typeof source === 'string' && shared.has(source)) void shared.get(source).catch(() => undefined);
      }
    }
  }, [loaded, shared]);
  return (
    <DashboardArea
      layout={loaded.dashboard.layout}
      texts={texts ?? DEFAULT_DASHBOARD_TEXTS}
      renderCell={(cell, index) => (
        <Cell root={root} dashboardId={dashboardId} cell={cell} index={index} failed={loaded.failed} shared={shared} texts={frameTexts} container={container} />
      )}
    />
  );
}

/** Runs a widget through the root and gives back its state and the element that holds its container. */
function useWidget(root: DashboardRoot, dashboardId: string, widget: WidgetInstance, role: Role, failure: string | undefined, shared: SharedRequests) {
  const [state, setState] = useState<CellState | 'placing'>('loading');
  const [placement, setPlacement] = useState<{ container: HTMLElement; placed: () => void }>();
  const slot = useRef<HTMLDivElement>(null);
  useEffect(
    () =>
      root.runCell({
        dashboardId,
        widget,
        role,
        failure,
        shared,
        update: (change) => ('state' in change ? setState(change.state) : setPlacement(change)),
      }),
    [root, dashboardId, widget, role, failure, shared],
  );
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
  return { state, slot };
}

function Cell({
  root,
  dashboardId,
  cell,
  index,
  failed,
  shared,
  texts,
  container,
}: {
  root: DashboardRoot;
  dashboardId: string;
  cell: DashboardCell;
  index: number;
  failed: ReadonlyMap<string, string>;
  shared: SharedRequests;
  texts: FrameTexts;
  container: HTMLElement | null;
}) {
  const { state, slot } = useWidget(root, dashboardId, cell.widget, 'cell', failed.get(slotOf(index, 'cell')), shared);
  const [open, setOpen] = useState(false);
  const larger = cell.larger_view;
  return (
    <CellFrame
      title={cell.widget.title}
      state={state === 'placing' ? 'shown' : state}
      texts={texts}
      largerView={
        larger
          ? {
              title: larger.title ?? cell.widget.title ?? '',
              // The larger view draws its own states inside the overlay.
              state: 'shown',
              content: open ? <LargerView root={root} dashboardId={dashboardId} widget={larger} failure={failed.get(slotOf(index, 'larger_view'))} shared={shared} texts={texts} /> : null,
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
  texts,
}: {
  root: DashboardRoot;
  dashboardId: string;
  widget: WidgetInstance;
  failure?: string;
  shared: SharedRequests;
  texts: FrameTexts;
}) {
  const { state, slot } = useWidget(root, dashboardId, widget, 'larger_view', failure, shared);
  return (
    <StateBody state={state === 'placing' ? 'shown' : state} texts={texts}>
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

