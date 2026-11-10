import { Component, useState, useSyncExternalStore, type ReactNode } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { ActionHandler, type ChildMfeBridge, type MfeEntryLifecycle } from '@gears-frontx/mfes';
import {
  LANGUAGE_PROPERTY_ID,
  RENDER_WIDGET_ACTION_ID,
  THEME_PROPERTY_ID,
  type RenderWidgetPayload,
} from '@gears-frontx/frontx-dashboard-root';

import { DEFAULT_WIDGET_TEXTS, WidgetCannotBeShown } from './states';
import styles from './widgets.module.css';

/*
 * The MFE lifecycle every catalog widget entry shares (widget contract
 * FEATURE, "Entry declaration" and "Widget-author obligations"): it mounts the
 * widget into the shadow root the registry gives it, registers the
 * `render_widget` handler before `mount` resolves, follows the theme and
 * language shared properties, and resolves each `render_widget` as soon as it
 * holds the payload, before drawing.
 */

/** What a widget renderer gets besides its payload. */
export interface WidgetContext {
  /** The host language. */
  locale: string;
  /**
   * An element inside this widget's shadow root that carries the kit theme
   * scope: kit overlays (Dialog, Tooltip, Select, Popover, DropdownMenu)
   * open here, so they keep the widget's styles and theme.
   */
  container: HTMLElement | null;
}

export type WidgetRenderer = (payload: RenderWidgetPayload, context: WidgetContext) => ReactNode;

/** Host theme ids whose palette is dark; any other id maps to the kit's light scope. */
const DARK_THEMES = new Set(['dark', 'dracula', 'dracula-large']);
const kitScopeOf = (theme: string | undefined) => (theme && DARK_THEMES.has(theme) ? 'dark' : 'light');

/**
 * The page's stylesheets, as constructable sheets a shadow root adopts: the
 * kit's tokens and component styles and this package's CSS modules reach the
 * widget only this way, since document styles stop at the shadow boundary.
 */
let cached: { key: string; sheets: CSSStyleSheet[] } | undefined;

function documentSheets(): CSSStyleSheet[] {
  // Built once per set of page stylesheets and shared by every widget; a stylesheet added later builds it again.
  const key = Array.from(document.styleSheets, (sheet) => {
    try {
      return sheet.cssRules.length;
    } catch {
      return -1;
    }
  }).join(',');
  if (cached?.key === key) return cached.sheets;
  const sheets: CSSStyleSheet[] = [];
  for (const sheet of Array.from(document.styleSheets)) {
    let text = '';
    try {
      text = Array.from(sheet.cssRules, (rule) => rule.cssText).join('\n');
    } catch {
      continue;
    }
    try {
      const copy = new CSSStyleSheet();
      copy.replaceSync(text);
      sheets.push(copy);
    } catch {
      // A browser without constructable stylesheets keeps the widget unstyled rather than failing it.
    }
  }
  cached = { key, sheets };
  return sheets;
}

class Store<T> {
  private value: T;
  private readonly listeners = new Set<() => void>();
  constructor(value: T) {
    this.value = value;
  }
  get = () => this.value;
  set(value: T) {
    this.value = value;
    for (const listener of this.listeners) listener();
  }
  subscribe = (listener: () => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };
}

/**
 * Contains a widget that throws while drawing: its area shows the widget's own cannot-be-shown state and the
 * cell frame stays (widget contract FEATURE, widget-author obligations). A new payload draws again.
 */
class DrawingBoundary extends Component<{ payload: unknown; children: ReactNode }, { failed?: unknown; payload?: unknown }> {
  state: { failed?: unknown; payload?: unknown } = {};
  static getDerivedStateFromError(failed: unknown) {
    return { failed };
  }
  static getDerivedStateFromProps(props: { payload: unknown }, state: { failed?: unknown; payload?: unknown }) {
    return props.payload === state.payload ? null : { failed: undefined, payload: props.payload };
  }
  render() {
    if (this.state.failed !== undefined) return <WidgetCannotBeShown texts={DEFAULT_WIDGET_TEXTS} problem={`drawing failed: ${String(this.state.failed)}`} />;
    return this.props.children;
  }
}

/** Calls the renderer inside the boundary, so a renderer that throws on its payload is contained as well. */
function Drawn({ render, payload, context }: { render: WidgetRenderer; payload: RenderWidgetPayload; context: WidgetContext }) {
  return <>{render(payload, context)}</>;
}

function WidgetHost({ payload, theme, language, render }: { payload: Store<RenderWidgetPayload | undefined>; theme: Store<string | undefined>; language: Store<string | undefined>; render: WidgetRenderer }) {
  const current = useSyncExternalStore(payload.subscribe, payload.get);
  const scope = kitScopeOf(useSyncExternalStore(theme.subscribe, theme.get));
  const locale = useSyncExternalStore(language.subscribe, language.get) ?? 'en';
  const [overlays, setOverlays] = useState<HTMLElement | null>(null);
  return (
    <div data-theme={scope} lang={locale} className={styles.widgetRoot}>
      {current ? (
        <DrawingBoundary payload={current}>
          <Drawn render={render} payload={current} context={{ locale, container: overlays }} />
        </DrawingBoundary>
      ) : null}
      {/* Kit overlays open here, inside the shadow root and the theme scope. gears-frontx#763 adds PortalContainerProvider /
          usePortalContainer() to ui-kit 0.6.0; an explicit `container` keeps winning over it, so this stays valid after that. */}
      <div ref={setOverlays} data-theme={scope} />
    </div>
  );
}

/** One lifecycle per generated extension: the entry's factory calls this for each, so no two widgets share state. */
export function createWidgetLifecycle(render: WidgetRenderer): MfeEntryLifecycle {
  const payload = new Store<RenderWidgetPayload | undefined>(undefined);
  const theme = new Store<string | undefined>(undefined);
  const language = new Store<string | undefined>(undefined);
  let root: Root | undefined;
  let registered = false;
  let unsubscribe: (() => void)[] = [];
  // The page sheets this lifecycle adopted, so a remount replaces them instead of stacking stale copies.
  const adopted = new Set<CSSStyleSheet>();

  return {
    mount(container: Element | ShadowRoot, bridge: ChildMfeBridge) {
      if (!registered) {
        // Registered once: the bridge keeps it across unmounts and hands it to the next mount.
        bridge.registerActionHandler(
          RENDER_WIDGET_ACTION_ID,
          ActionHandler.fromFunction(async (_type, received) => payload.set(received as unknown as RenderWidgetPayload)),
        );
        registered = true;
      }
      theme.set(bridge.getProperty(THEME_PROPERTY_ID)?.value as string | undefined);
      language.set(bridge.getProperty(LANGUAGE_PROPERTY_ID)?.value as string | undefined);
      unsubscribe = [
        bridge.subscribeToProperty(THEME_PROPERTY_ID, (property) => theme.set(property.value as string)),
        bridge.subscribeToProperty(LANGUAGE_PROPERTY_ID, (property) => language.set(property.value as string)),
      ];
      if (container instanceof ShadowRoot) {
        // The page's sheets first, then any sheet the widget's own code adopted into this root on an earlier mount.
        const page = documentSheets();
        container.adoptedStyleSheets = [...page, ...(container.adoptedStyleSheets ?? []).filter((sheet) => !page.includes(sheet) && !adopted.has(sheet))];
        page.forEach((sheet) => adopted.add(sheet));
      }
      root = createRoot(container);
      root.render(<WidgetHost payload={payload} theme={theme} language={language} render={render} />);
    },
    unmount() {
      // A remount shows nothing until the root sends its next render_widget, never the last mount's payload.
      payload.set(undefined);
      for (const stop of unsubscribe) stop();
      unsubscribe = [];
      root?.unmount();
      root = undefined;
    },
  };
}
