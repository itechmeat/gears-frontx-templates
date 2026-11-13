import { afterEach, describe, expect, it, vi } from 'vitest';

import type { ServedFile } from '../contract';
import { createMockHost, DEMO_SERVED_FILE } from './mockHost';

/*
 * The mock host's served file when the widget bundles come from a served list:
 * the demo file followed by every listed part, read on each request.
 */

const partOf = (widget: string): ServedFile => ({
  types: [{ $id: `gts.frontx.dashboard.widget.widget.v1~frontx.dashboard.widget.${widget}.v1~` }],
  instances: [{ id: `gts.frontx.mfes.mfe.entry.v1~frontx.mfes.mfe.entry_mf.v1~frontx.dashboard.mfe.${widget}.v1` }],
});

function stubWidgetList(parts: ServedFile[]) {
  vi.stubGlobal('fetch', (input: RequestInfo | URL) => {
    const url = String(input);
    if (url.endsWith('/widgets.json')) {
      return Promise.resolve(new Response(JSON.stringify(parts.map((_, index) => `bundle_${index}/widget.gts.json`)), { status: 200 }));
    }
    const index = Number(url.match(/bundle_(\d+)\/widget\.gts\.json$/)?.[1]);
    return Promise.resolve(new Response(JSON.stringify(parts[index]), { status: 200 }));
  });
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('the mock host', () => {
  it('answers loadFile with the demo file followed by the listed widget parts', async () => {
    const parts = [partOf('metric_card'), partOf('grid')];
    stubWidgetList(parts);
    const host = createMockHost({ delayMs: 0, widgetList: '/widgets/widgets.json' });
    expect(await host.loadFile(new AbortController().signal)).toEqual([DEMO_SERVED_FILE, ...parts]);
  });

  it('answers loadFile with the demo file itself and fetches nothing without a widget list', async () => {
    const fetchMock = vi.fn(() => Promise.resolve(new Response('{}', { status: 200 })));
    vi.stubGlobal('fetch', fetchMock);
    const host = createMockHost({ delayMs: 0 });
    const file = await host.loadFile(new AbortController().signal);
    expect(fetchMock).not.toHaveBeenCalled();
    expect(file).toEqual(DEMO_SERVED_FILE);
  });

  it('returns a file that is not {types, instances} unchanged and reads no list', async () => {
    const fetch = vi.fn();
    vi.stubGlobal('fetch', fetch);
    const broken = { broken: true };
    await expect(createMockHost({ delayMs: 0, file: broken, widgetList: '/widgets/widgets.json' }).loadFile(new AbortController().signal)).resolves.toEqual(broken);
    expect(fetch).not.toHaveBeenCalled();
  });

  it('appends the listed widget parts to a file that is already a list, and returns an empty list unchanged', async () => {
    const parts = [partOf('metric_card'), partOf('grid')];
    stubWidgetList(parts);
    const own = partOf('pie_chart');
    expect(await createMockHost({ delayMs: 0, file: [DEMO_SERVED_FILE, own], widgetList: '/widgets/widgets.json' }).loadFile(new AbortController().signal)).toEqual([DEMO_SERVED_FILE, own, ...parts]);
    const fetch = vi.fn();
    vi.stubGlobal('fetch', fetch);
    expect(await createMockHost({ delayMs: 0, file: [], widgetList: '/widgets/widgets.json' }).loadFile(new AbortController().signal)).toEqual([]);
    expect(fetch).not.toHaveBeenCalled();
  });

  it('reads the widget list again on each dashboard request', async () => {
    stubWidgetList([partOf('metric_card')]);
    const lists = vi.spyOn(globalThis, 'fetch');
    const host = createMockHost({ delayMs: 0, widgetList: '/widgets/widgets.json' });
    await host.loadFile(new AbortController().signal);
    await host.loadFile(new AbortController().signal);
    expect(lists.mock.calls.filter(([input]) => String(input).endsWith('/widgets.json'))).toHaveLength(2);
  });

  it('is exported from the ./mock subpath and not from the package root', async () => {
    // Cold imports through the package's own specifiers, as a product writes them.
    const root = await import('@gears-frontx/frontx-dashboard-root');
    for (const name of ['createMockHost', 'DEMO_SERVED_FILE', 'DEMO_DASHBOARD_ID']) expect(Object.keys(root)).not.toContain(name);
    const mock = await import('@gears-frontx/frontx-dashboard-root/mock');
    expect(typeof mock.createMockHost).toBe('function');
    // The cold import of the whole root takes over 30 s when the full suite runs in parallel.
  }, 60_000);
});
