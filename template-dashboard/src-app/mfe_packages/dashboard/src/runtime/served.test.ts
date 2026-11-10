import { afterEach, describe, expect, it, onTestFinished, vi } from 'vitest';

import type { ServedFile } from '../contract';
import { RequestFailure } from './host';
import { composeServedFile, loadWidgetParts } from './served';

/*
 * The served file joined from its parts in the browser: the composition order,
 * and the widget list read that leaves an unreadable part out with one console
 * line while a list that cannot be read rejects.
 */

const LIST = 'http://localhost/widgets/widgets.json';

const partOf = (name: string, types = 1, instances = 1): ServedFile => ({
  types: Array.from({ length: types }, (_, index) => ({ $id: `${name}-type-${index}` })),
  instances: Array.from({ length: instances }, (_, index) => ({ id: `${name}-instance-${index}` })),
});

const json = (value: unknown) => JSON.stringify(value);

/** Stubs fetch to answer every request with `answer` and returns the requested addresses. */
function stubFetch(answer: (url: string) => Response) {
  const requested: string[] = [];
  vi.stubGlobal('fetch', (input: RequestInfo | URL) => {
    const url = String(input);
    requested.push(url);
    return Promise.resolve(answer(url));
  });
  return requested;
}

const listAnswering = (...addresses: string[]) => new Response(json(addresses), { status: 200 });

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('composeServedFile', () => {
  it('joins the types of every part in part order, then the instances of every part in part order', () => {
    const file = composeServedFile(partOf('catalog', 2, 1), partOf('metric_card', 1, 2));
    expect(file.types).toEqual([{ $id: 'catalog-type-0' }, { $id: 'catalog-type-1' }, { $id: 'metric_card-type-0' }]);
    expect(file.instances).toEqual([{ id: 'catalog-instance-0' }, { id: 'metric_card-instance-0' }, { id: 'metric_card-instance-1' }]);
  });

  it('leaves every part with its own lists', () => {
    const catalog = partOf('catalog', 2, 1);
    const bundles = partOf('bundles', 1, 1);
    const file = composeServedFile(catalog, bundles);
    file.types.push({ $id: 'added-later' });
    file.instances.length = 0;
    expect(catalog.types).toEqual([{ $id: 'catalog-type-0' }, { $id: 'catalog-type-1' }]);
    expect(catalog.instances).toEqual([{ id: 'catalog-instance-0' }]);
    expect(bundles.types).toEqual([{ $id: 'bundles-type-0' }]);
    expect(bundles.instances).toEqual([{ id: 'bundles-instance-0' }]);
  });
});

describe('loadWidgetParts', () => {
  it('resolves a relative part address against the list address', async () => {
    const requested = stubFetch((url) => (url === LIST ? listAnswering('metric_card/widget.gts.json') : new Response(json(partOf('metric_card')), { status: 200 })));
    await expect(loadWidgetParts(LIST, new AbortController().signal)).resolves.toEqual([partOf('metric_card')]);
    expect(requested).toEqual([LIST, 'http://localhost/widgets/metric_card/widget.gts.json']);
  });

  it('leaves out a part that does not answer in time and returns the others', async () => {
    const errors = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const hung = 'http://localhost/widgets/metric_card/widget.gts.json';
    vi.stubGlobal('fetch', (input: RequestInfo | URL) => {
      const url = String(input);
      if (url === LIST) return Promise.resolve(listAnswering('metric_card/widget.gts.json', 'grid/widget.gts.json'));
      // A part that never answers and ignores its signal, as a stalled server would.
      if (url === hung) return new Promise<Response>(() => undefined);
      return Promise.resolve(new Response(json(partOf('grid')), { status: 200 }));
    });
    await expect(loadWidgetParts(LIST, new AbortController().signal, undefined, 20)).resolves.toEqual([partOf('grid')]);
    expect(errors).toHaveBeenCalledTimes(1);
    expect(String(errors.mock.calls[0][0])).toContain('no answer within 20 ms');
  });

  it('keeps the part deadline in a browser without AbortSignal.any', async () => {
    const errors = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const original = Object.getOwnPropertyDescriptor(AbortSignal, 'any');
    Object.defineProperty(AbortSignal, 'any', { value: undefined, configurable: true });
    onTestFinished(() => {
      if (original) Object.defineProperty(AbortSignal, 'any', original);
      else delete (AbortSignal as { any?: unknown }).any;
    });
    const hung = 'http://localhost/widgets/metric_card/widget.gts.json';
    let hungSignal: AbortSignal | undefined;
    vi.stubGlobal('fetch', (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url === LIST) return Promise.resolve(listAnswering('metric_card/widget.gts.json', 'grid/widget.gts.json'));
      if (url === hung) {
        hungSignal = init?.signal ?? undefined;
        return new Promise<Response>(() => undefined);
      }
      return Promise.resolve(new Response(json(partOf('grid')), { status: 200 }));
    });
    await expect(loadWidgetParts(LIST, new AbortController().signal, undefined, 20)).resolves.toEqual([partOf('grid')]);
    expect(errors).toHaveBeenCalledTimes(1);
    // The late request is aborted too, not only left behind.
    expect(hungSignal?.aborted).toBe(true);
  });

  it('leaves out only the part whose address does not parse', async () => {
    const errors = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    stubFetch((url) => (url === LIST ? listAnswering('http://[', 'grid/widget.gts.json') : new Response(json(partOf('grid')), { status: 200 })));
    await expect(loadWidgetParts(LIST, new AbortController().signal)).resolves.toEqual([partOf('grid')]);
    expect(errors).toHaveBeenCalledTimes(1);
    expect(String(errors.mock.calls[0][0])).toContain('http://[');
  });

  it.each([
    ['answers 404', () => new Response('not found', { status: 404 })],
    ['answers a body that is not JSON', () => new Response('<html>login</html>', { status: 200 })],
    ['answers JSON without the types and instances arrays', () => new Response(json({ types: [] }), { status: 200 })],
  ])('leaves out the part that %s, keeps the others and says so once', async (_name, badAnswer) => {
    const errors = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const leftOut = 'http://localhost/widgets/metric_card/widget.gts.json';
    stubFetch((url) => (url === LIST ? listAnswering('metric_card/widget.gts.json', 'grid/widget.gts.json') : url === leftOut ? badAnswer() : new Response(json(partOf('grid')), { status: 200 })));
    await expect(loadWidgetParts(LIST, new AbortController().signal)).resolves.toEqual([partOf('grid')]);
    expect(errors).toHaveBeenCalledTimes(1);
    expect(errors.mock.calls[0]?.[0]).toContain(leftOut);
  });

  it.each([
    ['answers 404', () => new Response('not found', { status: 404 }), /answered 404/],
    ['is a JSON object, not an array', () => new Response(json(partOf('catalog')), { status: 200 }), /is not a list of addresses/],
    ['names an address that is not a string', () => new Response(json(['metric_card/widget.gts.json', 7]), { status: 200 }), /is not a list of addresses/],
  ])('rejects when the list %s', async (_name, badList, reason) => {
    const errors = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    stubFetch(() => badList());
    await expect(loadWidgetParts(LIST, new AbortController().signal)).rejects.toThrow(reason);
    // The list is not left out: a list failure rejects without a console line.
    expect(errors).not.toHaveBeenCalled();
  });

  it('rejects when the signal aborts during a part read instead of leaving the parts out', async () => {
    const errors = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const controller = new AbortController();
    const abortError = () => new DOMException('This operation was aborted', 'AbortError');
    let partRequested!: () => void;
    const partsRequested = new Promise<void>((resolve) => (partRequested = resolve));
    vi.stubGlobal('fetch', (input: RequestInfo | URL, init: RequestInit) => {
      if (String(input) === LIST && !init.signal?.aborted) return Promise.resolve(listAnswering('metric_card/widget.gts.json', 'grid/widget.gts.json'));
      partRequested();
      return new Promise<Response>((_resolve, reject) => {
        // As fetch does: a signal aborted before the request is answered rejects it.
        if (init.signal?.aborted) {
          reject(abortError());
          return;
        }
        init.signal?.addEventListener('abort', () => reject(abortError()));
      });
    });
    const pending = loadWidgetParts(LIST, controller.signal);
    // The abort lands while a part read is in flight, not before it starts.
    await partsRequested;
    controller.abort();
    await expect(pending).rejects.toThrow(RequestFailure);
    await expect(pending).rejects.toThrow(/network error/);
    expect(errors).not.toHaveBeenCalled();
  });
});
