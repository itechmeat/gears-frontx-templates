import { act } from '@testing-library/react';
import type { ActionHandler, ChildMfeBridge } from '@gears-frontx/mfes';
import { RENDER_WIDGET_ACTION_ID } from '@gears-frontx/frontx-dashboard-root/contract';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { Popover, PopoverContent, PopoverTrigger } from '@gears-frontx/ui-kit';

import { createWidgetLifecycle } from './lifecycle';

// The vitest config processes CSS modules only, so the kit's theme.css reaches the widget as an empty
// string here (a built widget bundle inlines the real file). The fixture keeps the :root input the
// tokens style is supposed to receive and move onto :host.
vi.mock('@gears-frontx/ui-kit/theme.css?inline', () => ({
  default: ':root { --kit-fixture-surface: white; } :root[data-theme="dark"] { --kit-fixture-surface: black; } @media (prefers-color-scheme: dark) { :root:not([data-theme=\'light\']) { --kit-fixture-surface: black; } }',
}));

function mountPoint() {
  const host = document.createElement('div');
  document.body.appendChild(host);
  return { host, shadow: host.attachShadow({ mode: 'open' }) };
}

function bridge() {
  const handlers = new Map<string, ActionHandler>();
  const child = {
    registerActionHandler: (type: string, handler: ActionHandler) => handlers.set(type, handler),
    getProperty: () => undefined,
    subscribeToProperty: () => () => undefined,
  } as unknown as ChildMfeBridge;
  const send = (payload: unknown) => act(async () => handlers.get(RENDER_WIDGET_ACTION_ID)!.handleAction(RENDER_WIDGET_ACTION_ID, payload as Record<string, unknown>));
  return { child, send };
}

function Boom(): never {
  throw new Error('cannot draw');
}

afterEach(() => vi.restoreAllMocks());

describe('the widget lifecycle', () => {
  it('shows the widget its own cannot-be-shown state when drawing throws, and draws again on a new payload', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const lifecycle = createWidgetLifecycle((payload) => ((payload.render as { ok?: boolean }).ok ? <output>drawn</output> : <Boom />));
    const { shadow } = mountPoint();
    const { child, send } = bridge();
    await act(async () => lifecycle.mount(shadow, child));
    await send({ render: {} });
    expect(shadow.textContent).toContain('This widget cannot be shown');
    await send({ render: { ok: true } });
    expect(shadow.querySelector('output')?.textContent).toBe('drawn');
  });

  it('shows nothing after a remount until the next payload', async () => {
    const lifecycle = createWidgetLifecycle((payload) => <output>{String((payload.render as { v: number }).v)}</output>);
    const { shadow } = mountPoint();
    const { child, send } = bridge();
    await act(async () => lifecycle.mount(shadow, child));
    await send({ render: { v: 42 } });
    expect(shadow.querySelector('output')?.textContent).toBe('42');
    await act(async () => lifecycle.unmount(shadow));
    await act(async () => lifecycle.mount(shadow, child));
    expect(shadow.querySelector('output')).toBeNull();
    await send({ render: { v: 7 } });
    expect(shadow.querySelector('output')?.textContent).toBe('7');
  });

  it('contains a renderer that throws on its payload', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const lifecycle = createWidgetLifecycle(() => {
      throw new Error('bad payload');
    });
    const { shadow } = mountPoint();
    const { child, send } = bridge();
    await act(async () => lifecycle.mount(shadow, child));
    await send({ render: {} });
    expect(shadow.textContent).toContain('This widget cannot be shown');
  });

  it.each([
    ['undefined', undefined],
    ['a value whose toString throws', { toString: () => { throw new Error('no text'); } }],
  ])('contains a renderer that throws %s', async (_name, thrown) => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const lifecycle = createWidgetLifecycle(() => {
      throw thrown;
    });
    const { shadow } = mountPoint();
    const { child, send } = bridge();
    await act(async () => lifecycle.mount(shadow, child));
    await send({ render: {} });
    expect(shadow.textContent).toContain('This widget cannot be shown');
  });
});

describe('the render_widget handler across bridges', () => {
  it('registers on the new bridge when the same lifecycle mounts again, as after a dashboard is left and opened again', async () => {
    // The FrontX MF handler keeps one lifecycle per extension id; the extension registered again brings a new bridge.
    const lifecycle = createWidgetLifecycle((payload) => <output>{String((payload.render as { text?: string }).text)}</output>);
    const { shadow } = mountPoint();
    const first = bridge();
    await act(async () => lifecycle.mount(shadow, first.child));
    await first.send({ render: { text: 'first' } });
    await act(async () => lifecycle.unmount(shadow));
    const second = bridge();
    await act(async () => lifecycle.mount(shadow, second.child));
    await second.send({ render: { text: 'second' } });
    expect(shadow.textContent).toContain('second');
    await act(async () => lifecycle.unmount(shadow));
  });
});

describe('the property subscriptions', () => {
  it('stops the earlier subscriptions when it mounts again with no unmount between, as after a failed mount', async () => {
    const stopped = vi.fn();
    const lifecycle = createWidgetLifecycle(() => null);
    const { shadow } = mountPoint();
    const { child } = bridge();
    (child as unknown as { subscribeToProperty: () => () => void }).subscribeToProperty = () => stopped;
    await act(async () => lifecycle.mount(shadow, child));
    expect(stopped).not.toHaveBeenCalled();
    await act(async () => lifecycle.mount(document.createElement('div').attachShadow({ mode: 'open' }), child));
    expect(stopped).toHaveBeenCalledTimes(2);
  });
});

describe('a repeated mount', () => {
  it('unmounts the earlier React root when it mounts again with no unmount between', async () => {
    const lifecycle = createWidgetLifecycle(() => null);
    const { shadow } = mountPoint();
    const { child } = bridge();
    await act(async () => lifecycle.mount(shadow, child));
    expect(shadow.querySelector('div')).not.toBeNull();
    const next = document.createElement('div').attachShadow({ mode: 'open' });
    await act(async () => lifecycle.mount(next, child));
    expect(shadow.querySelector('div')).toBeNull();
    expect(next.querySelector('div')).not.toBeNull();
    await act(async () => lifecycle.unmount(next));
  });
});

describe('a repeated mount and the last payload', () => {
  it('shows nothing from the earlier payload until the next render_widget', async () => {
    const lifecycle = createWidgetLifecycle((payload) => <output>{String((payload.render as { text?: string }).text)}</output>);
    const { shadow } = mountPoint();
    const { child, send } = bridge();
    await act(async () => lifecycle.mount(shadow, child));
    await send({ render: { text: 'earlier' } });
    expect(shadow.textContent).toContain('earlier');
    const next = document.createElement('div').attachShadow({ mode: 'open' });
    await act(async () => lifecycle.mount(next, child));
    expect(next.textContent).not.toContain('earlier');
    await send({ render: { text: 'later' } });
    expect(next.textContent).toContain('later');
    await act(async () => lifecycle.unmount(next));
  });
});

describe('the kit tokens style the mount adds', () => {
  it('adds exactly one style to the shadow root, as its first child', async () => {
    const lifecycle = createWidgetLifecycle(() => null);
    const { shadow } = mountPoint();
    const { child } = bridge();
    await act(async () => lifecycle.mount(shadow, child));
    const tokens = shadow.querySelectorAll('style[data-kit-tokens]');
    expect(tokens).toHaveLength(1);
    expect(shadow.firstChild).toBe(tokens[0]);
    await act(async () => lifecycle.unmount(shadow));
  });

  it('adds no second style on a mount after an unmount', async () => {
    const lifecycle = createWidgetLifecycle(() => null);
    const { shadow } = mountPoint();
    const { child } = bridge();
    await act(async () => lifecycle.mount(shadow, child));
    await act(async () => lifecycle.unmount(shadow));
    await act(async () => lifecycle.mount(shadow, child));
    expect(shadow.querySelectorAll('style[data-kit-tokens]')).toHaveLength(1);
    await act(async () => lifecycle.unmount(shadow));
  });

  it('declares the kit tokens on :host and never on :root', async () => {
    const lifecycle = createWidgetLifecycle(() => null);
    const { shadow } = mountPoint();
    const { child } = bridge();
    await act(async () => lifecycle.mount(shadow, child));
    const text = shadow.querySelector('style[data-kit-tokens]')?.textContent ?? '';
    expect(text).toContain(':host');
    expect(text).toContain(':host([data-theme="dark"])');
    expect(text).toContain(":host(:not([data-theme='light']))");
    expect(text).not.toContain(':root');
    await act(async () => lifecycle.unmount(shadow));
  });
});

describe('kit overlays', () => {
  it('opens a kit popup inside the widget shadow root, in its theme scope, never in the page body', async () => {
    const lifecycle = createWidgetLifecycle((_payload, { container }) => (
      <Popover defaultOpen>
        <PopoverTrigger>Details</PopoverTrigger>
        <PopoverContent container={container ?? undefined}>Popup text</PopoverContent>
      </Popover>
    ));
    const { host, shadow } = mountPoint();
    const { child, send } = bridge();
    await act(async () => lifecycle.mount(shadow, child));
    await send({ render: {} });
    const popup = Array.from(shadow.querySelectorAll('*')).find((node) => node.textContent === 'Popup text' && node.children.length === 0);
    expect(popup).toBeTruthy();
    // The popup sits in the overlay layer, the themed last child of the themed widget root, not inline beside its
    // trigger (whose nearest themed ancestor is the widget root itself) and not in the light DOM of the page.
    const layer = popup?.closest('[data-theme]');
    const widgetRoot = shadow.querySelector('[data-theme]');
    expect(layer).toBeTruthy();
    expect(layer).not.toBe(widgetRoot);
    expect(layer?.parentElement).toBe(widgetRoot);
    expect(widgetRoot?.lastElementChild).toBe(layer);
    expect(document.body.textContent).not.toContain('Popup text');
    expect(host.textContent).toBe('');
    await act(async () => lifecycle.unmount(shadow));
  });
});
