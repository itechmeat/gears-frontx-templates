import { Component, useLayoutEffect, useState, useSyncExternalStore, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { createRoot, type Root } from 'react-dom/client';
import type { ActionHandler, ChildMfeBridge, MfeEntryLifecycle } from '@gears-frontx/mfes';
import kitThemeCss from '@gears-frontx/ui-kit/theme.css?inline';
import {
  intlLocaleOf,
  kitScopeOf,
  LANGUAGE_PROPERTY_ID,
  OVERLAY_CONTAINER_PROPERTY_ID,
  RENDER_WIDGET_ACTION_ID,
  THEME_PROPERTY_ID,
  type OverlayContainerValue,
  type RenderWidgetPayload,
} from '@gears-frontx/frontx-dashboard-root/contract';

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
   * The element kit overlays (Dialog, Tooltip, Select, Popover, DropdownMenu)
   * open in, carrying the kit theme scope and the language. Without a host
   * overlay container it sits inside this widget's shadow root; with one, in a
   * shadow root of its own inside the host's element, which holds copies of the
   * widget's stylesheets. Either way the overlay keeps the widget's styles.
   */
  container: HTMLElement | null;
}

export type WidgetRenderer = (payload: RenderWidgetPayload, context: WidgetContext) => ReactNode;

/**
 * The kit's design tokens, for this widget's shadow root: document styles stop
 * at the shadow boundary, and a widget bundle cannot assume which host page
 * loads it. The kit declares its base tokens on `:root`, which matches nothing
 * inside a shadow root, so they move to `:host`; the light and dark blocks
 * already match the widget root's `data-theme`. The widget's own CSS and the
 * kit component CSS it uses come with its bundle: the FrontX MF handler puts
 * the entry's stylesheets into the same shadow root.
 */
const KIT_TOKENS = kitThemeCss.replace(/\/\*[\s\S]*?\*\//g, '').replace(/:root\b((?:\[[^\]]*\]|:not\([^()]*\))*)/g, (_match, tail: string) => (tail ? `:host(${tail})` : ':host'));

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
class DrawingBoundary extends Component<{ payload: unknown; children: ReactNode }, { failed: string | null; payload?: unknown }> {
  state: { failed: string | null; payload?: unknown } = { failed: null };
  // The text is taken once, safely: any thrown value, undefined or one whose toString throws, still shows the state.
  static getDerivedStateFromError(failed: unknown) {
    let text = 'unprintable error';
    try {
      text = String(failed);
    } catch {
      // Kept as unprintable.
    }
    return { failed: text };
  }
  static getDerivedStateFromProps(props: { payload: unknown }, state: { payload?: unknown }) {
    return props.payload === state.payload ? null : { failed: null, payload: props.payload };
  }
  render() {
    if (this.state.failed !== null) return <WidgetCannotBeShown texts={DEFAULT_WIDGET_TEXTS} problem={`drawing failed: ${this.state.failed}`} />;
    return this.props.children;
  }
}

/** Calls the renderer inside the boundary, so a renderer that throws on its payload is contained as well. */
function Drawn({ render, payload, context }: { render: WidgetRenderer; payload: RenderWidgetPayload; context: WidgetContext }) {
  return <>{render(payload, context)}</>;
}

/**
 * The host's overlay container as the shared property carries it: the `element` of the holder the root publishes
 * (`OverlayContainerValue` in the contract), when it is an element of the widget's own document, or none for anything
 * else (a bare element, an element of another document, a holder whose `element` or a check of it throws). The shape is read, not the
 * holder's class: the root's class is not this bundle's.
 */
const elementOf = (value: unknown, own: Document): HTMLElement | null => {
  // Every read is inside the try: a proxy can throw on the field, on the check of its prototype or on its document.
  try {
    const element = typeof value === 'object' && value !== null ? (value as Partial<OverlayContainerValue>).element : null;
    return element instanceof HTMLElement && element.ownerDocument === own ? element : null;
  } catch {
    return null;
  }
};

/**
 * A shadow root inside the host's overlay container for this widget's overlays, or null without a container. It
 * holds copies of the stylesheets of the widget's own shadow root (the kit tokens, the kit component CSS and the
 * widget CSS the bundle brings), so an overlay drawn there is styled as inside the widget, and the page's styles stay
 * out. It is removed when the widget unmounts or the host names another container.
 */
function useOverlayRoot(outside: HTMLElement | null, styled: Element | ShadowRoot): ShadowRoot | null {
  const [overlayRoot, setOverlayRoot] = useState<ShadowRoot | null>(null);
  useLayoutEffect(() => {
    if (!outside) return setOverlayRoot(null);
    // The container's own document makes the host, whatever guard picked the container.
    const host = outside.ownerDocument.createElement('div');
    host.dataset.widgetOverlays = '';
    const shadow = host.attachShadow({ mode: 'open' });
    for (const sheet of Array.from(styled.children)) if (sheet.matches('style, link[rel="stylesheet"]')) shadow.append(sheet.cloneNode(true));
    if ('adoptedStyleSheets' in styled) shadow.adoptedStyleSheets = [...styled.adoptedStyleSheets];
    outside.append(host);
    setOverlayRoot(shadow);
    return () => host.remove();
  }, [outside, styled]);
  return overlayRoot;
}

function WidgetHost({
  payload,
  theme,
  language,
  overlayContainer,
  styled,
  render,
}: {
  payload: Store<RenderWidgetPayload | undefined>;
  theme: Store<string | undefined>;
  language: Store<string | undefined>;
  overlayContainer: Store<HTMLElement | null>;
  styled: Element | ShadowRoot;
  render: WidgetRenderer;
}) {
  const current = useSyncExternalStore(payload.subscribe, payload.get);
  const scope = kitScopeOf(useSyncExternalStore(theme.subscribe, theme.get));
  const locale = intlLocaleOf(useSyncExternalStore(language.subscribe, language.get));
  const overlayRoot = useOverlayRoot(useSyncExternalStore(overlayContainer.subscribe, overlayContainer.get), styled);
  const [overlays, setOverlays] = useState<HTMLElement | null>(null);
  // Kit overlays open in this layer, in the theme scope and the language. Each overlay gets it as an explicit
  // `container`, which wins over any portal container the kit itself provides.
  const layer = <div ref={setOverlays} data-theme={scope} lang={locale} />;
  return (
    <div data-theme={scope} lang={locale} className={styles.widgetRoot}>
      {current ? (
        <DrawingBoundary payload={current}>
          <Drawn render={render} payload={current} context={{ locale, container: overlays }} />
        </DrawingBoundary>
      ) : null}
      {overlayRoot ? createPortal(layer, overlayRoot) : layer}
    </div>
  );
}

/** One lifecycle per generated extension: the entry's factory calls this for each, so no two widgets share state. */
export function createWidgetLifecycle(render: WidgetRenderer): MfeEntryLifecycle {
  const payload = new Store<RenderWidgetPayload | undefined>(undefined);
  const theme = new Store<string | undefined>(undefined);
  const language = new Store<string | undefined>(undefined);
  const overlayContainer = new Store<HTMLElement | null>(null);
  let root: Root | undefined;
  // The bridge the handler is registered on. The FrontX MF handler keeps one lifecycle per extension id for the page's
  // life, and an extension registered again (a dashboard left and opened again) comes with a new bridge.
  let registeredOn: ChildMfeBridge | undefined;
  let unsubscribe: (() => void)[] = [];

  return {
    mount(container: Element | ShadowRoot, bridge: ChildMfeBridge) {
      if (registeredOn !== bridge) {
        // Once per bridge: a bridge keeps the handler across unmounts and hands it to the next mount.
        bridge.registerActionHandler(
          RENDER_WIDGET_ACTION_ID,
          // A plain handler object: the bridge only calls `handleAction`, so the widget bundle carries no FrontX runtime.
          { handleAction: async (_type, received) => payload.set(received as unknown as RenderWidgetPayload) } satisfies ActionHandler,
        );
        registeredOn = bridge;
      }
      theme.set(bridge.getProperty(THEME_PROPERTY_ID)?.value as string | undefined);
      language.set(bridge.getProperty(LANGUAGE_PROPERTY_ID)?.value as string | undefined);
      overlayContainer.set(elementOf(bridge.getProperty(OVERLAY_CONTAINER_PROPERTY_ID)?.value, container.ownerDocument));
      // A mount after a failed one comes with no unmount between them: drop the earlier subscriptions and React root first.
      for (const stop of unsubscribe) stop();
      root?.unmount();
      payload.set(undefined);
      unsubscribe = [
        bridge.subscribeToProperty(THEME_PROPERTY_ID, (property) => theme.set(property.value as string)),
        bridge.subscribeToProperty(LANGUAGE_PROPERTY_ID, (property) => language.set(property.value as string)),
        bridge.subscribeToProperty(OVERLAY_CONTAINER_PROPERTY_ID, (property) => overlayContainer.set(elementOf(property.value, container.ownerDocument))),
      ];
      // `:scope` matches nothing on a shadow root, so the root's own children are looked at instead.
      if (!Array.from(container.children).some((child) => child.matches('style[data-kit-tokens]'))) {
        const tokens = document.createElement('style');
        tokens.dataset.kitTokens = '';
        tokens.textContent = KIT_TOKENS;
        container.prepend(tokens);
      }
      root = createRoot(container);
      root.render(<WidgetHost payload={payload} theme={theme} language={language} overlayContainer={overlayContainer} styled={container} render={render} />);
    },
    unmount() {
      // A remount shows nothing until the root sends its next render_widget, never the last mount's payload.
      payload.set(undefined);
      for (const stop of unsubscribe) stop();
      unsubscribe = [];
      root?.unmount();
      root = undefined;
      // The lifecycle lives for the page's life: it keeps no host element after the widget leaves.
      overlayContainer.set(null);
    },
  };
}
