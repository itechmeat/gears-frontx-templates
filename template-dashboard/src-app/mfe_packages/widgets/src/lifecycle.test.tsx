import { act } from '@testing-library/react';
import type { ActionHandler, ChildMfeBridge } from '@gears-frontx/mfes';
import { RENDER_WIDGET_ACTION_ID } from '@gears-frontx/frontx-dashboard-root';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { createWidgetLifecycle } from './lifecycle';

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
});
