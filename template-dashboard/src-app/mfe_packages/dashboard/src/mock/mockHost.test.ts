import { afterEach, describe, expect, it, vi } from 'vitest';

import type { ServedFile } from '../contract';
import { createMockHost, DEMO_SERVED_FILE } from './mockHost';

/*
 * The mock host's served file when the widget bundles come from a served list:
 * the demo file with every listed part joined after it, read on each request.
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
  it('answers loadFile with the demo file and the listed widget parts joined after it', async () => {
    const parts = [partOf('metric_card'), partOf('grid')];
    stubWidgetList(parts);
    const host = createMockHost({ delayMs: 0, widgetList: '/widgets/widgets.json' });
    const file = (await host.loadFile(new AbortController().signal)) as ServedFile;
    expect(file.types).toEqual([...DEMO_SERVED_FILE.types, ...parts.flatMap((part) => part.types)]);
    expect(file.instances).toEqual([...DEMO_SERVED_FILE.instances, ...parts.flatMap((part) => part.instances)]);
  });

  it('answers loadFile with the demo file itself and fetches nothing without a widget list', async () => {
    const fetchMock = vi.fn(() => Promise.resolve(new Response('{}', { status: 200 })));
    vi.stubGlobal('fetch', fetchMock);
    const host = createMockHost({ delayMs: 0 });
    const file = await host.loadFile(new AbortController().signal);
    expect(fetchMock).not.toHaveBeenCalled();
    expect(file).toEqual(DEMO_SERVED_FILE);
  });
});
