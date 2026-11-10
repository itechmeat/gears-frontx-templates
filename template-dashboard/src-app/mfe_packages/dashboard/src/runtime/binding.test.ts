import { afterEach, describe, expect, it, vi } from 'vitest';

import type { DashboardRequest } from '../contract';
import { CellFailure, SharedRequests, runBinding, type Binding } from './binding';
import { fetchHost, isSameOriginPath, REQUEST_TIMEOUT_MS, RESPONSE_SIZE_CAP, type DashboardHost } from './host';
import { extensionIdOf, stampIdOf, uuidv5 } from './ids';

const ORIGIN = 'https://app.example';

function hostOf(answers: Record<string, unknown>) {
  const sent: DashboardRequest[] = [];
  const host: DashboardHost = {
    loadFile: async () => ({}),
    request: async (request) => {
      sent.push(request);
      const answer = answers[request.path];
      if (answer instanceof Error) throw answer;
      return structuredClone(answer);
    },
  };
  return { host, sent };
}

const run = (binding: Binding, host: DashboardHost, requests: Record<string, DashboardRequest> = {}, isLive = () => true) =>
  runBinding({ binding, host, shared: new SharedRequests(requests, host, ORIGIN), origin: ORIGIN, isLive });

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe('same-origin paths', () => {
  it.each(['/a?b=1', '/', '/api/x'])('accepts %s', (path) => expect(isSameOriginPath(path, ORIGIN)).toBe(true));
  it.each(['https://other/x', '//other/x', '/\\other', 'x/y', '/a\u0001b'])('rejects %s', (path) => expect(isSameOriginPath(path, ORIGIN)).toBe(false));
});

describe('the three binding forms', () => {
  it('own: sends the request and evaluates the transform on the response', async () => {
    const { host, sent } = hostOf({ '/n': { items: [{ name: 'a', n: 3 }] } });
    const result = await run({ request: { method: 'GET', path: '/n' }, transform: "{'slices': response.items.map(r, {'label': r.name, 'value': r.n})}" }, host);
    expect(result).toEqual({ dropped: false, data: { slices: [{ label: 'a', value: 3 }] } });
    expect(sent).toHaveLength(1);
  });

  it('shared: sends one request for every cell that names it', async () => {
    const { host, sent } = hostOf({ '/s': { v: 2 } });
    const shared = new SharedRequests({ s: { method: 'GET', path: '/s' } }, host, ORIGIN);
    const binding = (factor: number): Binding => ({ source: 's', params: { f: factor }, transform: "{'value': response.v * params.f}" });
    const [a, b] = await Promise.all([1, 3].map((factor) => runBinding({ binding: binding(factor), host, shared, origin: ORIGIN, isLive: () => true })));
    expect([a, b]).toEqual([{ dropped: false, data: { value: 2 } }, { dropped: false, data: { value: 6 } }]);
    expect(sent).toHaveLength(1);
  });

  it('static: evaluates the params with no request', async () => {
    const { host, sent } = hostOf({});
    expect(await run({ params: { x: 1 }, transform: "{'value': params.x}" }, host)).toEqual({ dropped: false, data: { value: 1 } });
    expect(sent).toHaveLength(0);
  });
});

describe('cell failures', () => {
  it('rejects a cross-origin path and a method other than GET or POST before sending', async () => {
    const { host, sent } = hostOf({});
    await expect(run({ request: { method: 'GET', path: '//other/x' }, transform: 'response' }, host)).rejects.toBeInstanceOf(CellFailure);
    await expect(run({ request: { method: 'PUT' as 'GET', path: '/x' }, transform: 'response' }, host)).rejects.toBeInstanceOf(CellFailure);
    expect(sent).toHaveLength(0);
  });

  it('fails a transform that does not parse before anything is sent', async () => {
    const { host, sent } = hostOf({ '/n': {} });
    await expect(run({ request: { method: 'GET', path: '/n' }, transform: '{{' }, host)).rejects.toThrow(/does not parse/);
    expect(sent).toHaveLength(0);
  });

  it('fails a transform that uses an undeclared identifier', async () => {
    await expect(run({ params: {}, transform: 'secret + 1' }, hostOf({}).host)).rejects.toThrow(/transform failed/);
  });

  it('fails an unknown source', async () => {
    await expect(run({ source: 'nope', transform: 'response' }, hostOf({}).host)).rejects.toThrow(/unknown source/);
  });

  it('fails every cell that depends on a failed shared request', async () => {
    const { host } = hostOf({ '/s': new Error('500') });
    const shared = new SharedRequests({ s: { method: 'GET', path: '/s' } }, host, ORIGIN);
    const results = await Promise.allSettled([0, 1].map(() => runBinding({ binding: { source: 's', transform: 'response' }, host, shared, origin: ORIGIN, isLive: () => true })));
    expect(results.map((result) => result.status)).toEqual(['rejected', 'rejected']);
  });

  it('times out a request that never answers', async () => {
    vi.useFakeTimers();
    const host: DashboardHost = { loadFile: async () => ({}), request: () => new Promise(() => undefined) };
    const pending = run({ request: { method: 'GET', path: '/slow' }, transform: 'response' }, host);
    const assertion = expect(pending).rejects.toThrow(/no answer within 30000 ms/);
    await vi.advanceTimersByTimeAsync(REQUEST_TIMEOUT_MS);
    await assertion;
  });

  it('drops the result of a cell that left before the answer', async () => {
    const { host } = hostOf({ '/n': { v: 1 } });
    expect(await run({ request: { method: 'GET', path: '/n' }, transform: 'response' }, host, {}, () => false)).toEqual({ dropped: true });
  });
});

describe('fetchHost', () => {
  const respond = (body: BodyInit | null, init: ResponseInit & { url?: string } = {}) =>
    vi.stubGlobal('fetch', vi.fn(async () => Object.defineProperty(new Response(body, init), 'url', { value: init.url ?? `${ORIGIN}/x` })));
  const request = (method: 'GET' | 'POST' = 'GET') => fetchHost({ fileUrl: '/file.json', origin: ORIGIN }).request({ method, path: '/x', ...(method === 'POST' ? { body: { a: 1 } } : {}) }, new AbortController().signal);

  it('accepts a body of exactly 1 MiB and fails one byte more', async () => {
    const json = (size: number) => `"${'a'.repeat(size - 2)}"`;
    respond(json(RESPONSE_SIZE_CAP));
    await expect(request()).resolves.toHaveLength(RESPONSE_SIZE_CAP - 2);
    respond(json(RESPONSE_SIZE_CAP + 1));
    await expect(request()).rejects.toThrow(/over the 1 MiB cap/);
  });

  it.each([
    ['a non-2xx status', () => respond('{}', { status: 403 }), /answered 403/],
    ['an empty body', () => respond(''), /valid JSON/],
    ['a body that is not JSON', () => respond('<html>'), /valid JSON/],
    ['a redirect to another origin', () => respond('{}', { url: 'https://other.example/x' }), /another origin/],
  ])('fails %s', async (_name, arrange, reason) => {
    arrange();
    await expect(request()).rejects.toThrow(reason);
  });

  it('sends a POST body as JSON', async () => {
    respond('{}');
    await request('POST');
    const init = vi.mocked(fetch).mock.calls[0][1]!;
    expect(init.method).toBe('POST');
    expect(init.body).toBe('{"a":1}');
  });
});

describe('deterministic ids', () => {
  it('computes RFC 9562 UUIDv5', () => {
    // The DNS namespace example: uuid5(NAMESPACE_DNS, 'python.org').
    expect(uuidv5('python.org', '6ba7b810-9dad-11d1-80b4-00c04fd430c8')).toBe('886313e1-3b8a-5372-9b90-0c9aee199e5d');
  });

  it('gives one id per widget and role, the same on every load and in any letter case', () => {
    const widget = 'gts.frontx.dashboard.widget.widget.v1~frontx.dashboard.widget.markdown_card.v1~0c9e4b72-3d1a-4f6e-8b25-91a7c4e0d6f3';
    expect(extensionIdOf(widget, 'cell', 'e')).toBe(extensionIdOf(widget.toUpperCase(), 'cell', 'E'));
    expect(extensionIdOf(widget, 'cell', 'e')).not.toBe(extensionIdOf(widget, 'larger_view', 'e'));
    expect(stampIdOf('t~', widget.toUpperCase(), 'cell')).toBe(stampIdOf('t~', widget, 'cell'));
    expect(stampIdOf('t~', widget, 'cell')).not.toBe(stampIdOf('t~', widget, 'larger_view'));
    expect(stampIdOf('t~', widget, 'cell')).toMatch(/^t~[0-9a-f]{8}-[0-9a-f]{4}-5[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
  });
});
