import { afterEach, describe, expect, it, vi } from 'vitest';

import type { DashboardRequest } from '../contract';
import { CellFailure, RequestFailed, SharedRequests, runBinding, variablesOfBinding, type Binding, type VariableValues } from './binding';
import { fetchHost, isSameOriginPath, REQUEST_TIMEOUT_MS, RESPONSE_SIZE_CAP, type DashboardHost } from './host';
import { extensionIdOf, stampIdOf, uuidv5 } from './ids';

const ORIGIN = 'https://app.example';

function hostOf(answers: Record<string, unknown>) {
  const sent: DashboardRequest[] = [];
  const host: DashboardHost = {
    loadFile: async () => ({ types: [], instances: [] }),
    request: async (request) => {
      sent.push(request);
      const answer = answers[request.path];
      if (answer instanceof Error) throw answer;
      return structuredClone(answer);
    },
  };
  return { host, sent };
}

const run = (binding: Binding, host: DashboardHost, requests: Record<string, DashboardRequest> = {}, isLive = () => true, values: VariableValues = {}) =>
  runBinding({ binding, host, shared: new SharedRequests(requests, host, ORIGIN), origin: ORIGIN, values, isLive });

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

describe('transform results as JSON', () => {
  const evaluate = (transform: string, params: Record<string, unknown> = { n: 42 }) => run({ params, transform }, hostOf({}).host);

  it.each(["{'value': int(params.n)}", "{'value': double(params.n)}", "{'value': uint(params.n)}", "{'value': 42u}"])('gives the number 42 for %s', async (transform) => {
    expect(await evaluate(transform)).toEqual({ dropped: false, data: { value: 42 } });
  });

  it('gives the CEL JSON text of a duration, a timestamp and bytes', async () => {
    const transform = "{'d': duration('90s'), 'f': duration('-1.5s'), 't': timestamp('2024-01-01T00:00:00Z'), 'b': b'abc'}";
    expect(await evaluate(transform)).toEqual({ dropped: false, data: { d: '90s', f: '-1.5s', t: '2024-01-01T00:00:00.000Z', b: 'YWJj' } });
  });

  // A difference of durations may come back with seconds and nanos of opposite signs (seconds -1, nanos +500000000).
  it.each([
    ["duration('1s') - duration('1.5s')", '-0.5s'],
    ["duration('-0.5s')", '-0.5s'],
    ["duration('0.000000001s')", '0.000000001s'],
  ])('gives the text of the duration %s as %s', async (expression, text) => {
    expect(await evaluate(`{'d': ${expression}}`)).toEqual({ dropped: false, data: { d: text } });
  });

  it('gives the base64 text of bytes at 0x80 and above', async () => {
    expect(await evaluate("{'b': b'\\x80\\xff'}")).toEqual({ dropped: false, data: { b: 'gP8=' } });
  });

  // An int or uint beyond Number.MAX_SAFE_INTEGER has no exact JSON number: the cell fails with the reason, never a rounded value.
  it.each(["{'value': 9007199254740993u}", "{'value': 9007199254740993}", "{'value': -9007199254740993}", "{'value': [uint(params.n), 18446744073709551615u]}"])(
    'fails the cell for an integer a JSON number cannot hold exactly: %s',
    async (transform) => {
      await expect(evaluate(transform)).rejects.toThrow(/^transform failed: the integer -?\d+ is outside the range a JSON number holds exactly/);
    },
  );

  it('keeps the largest exact integer', async () => {
    expect(await evaluate("{'value': uint(9007199254740991)}")).toEqual({ dropped: false, data: { value: Number.MAX_SAFE_INTEGER } });
  });

  it('fails the cell for a value with no JSON form', async () => {
    await expect(evaluate("{'value': type(1)}")).rejects.toThrow('transform failed: the result holds a CEL value with no JSON form');
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
    const host: DashboardHost = { loadFile: async () => ({ types: [], instances: [] }), request: () => new Promise(() => undefined) };
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

describe('which failures are a failed request (the retry button)', () => {
  const kindOf = async (pending: Promise<unknown>) => {
    const error = await pending.then(() => undefined, (failure: unknown) => failure);
    return error instanceof RequestFailed ? 'request' : error instanceof CellFailure ? 'cell' : 'other';
  };

  it.each([
    ['an own request the host rejects', { request: { method: 'GET', path: '/x' }, transform: 'response' } as Binding],
    ['a shared request the host rejects', { source: 's', transform: 'response' } as Binding],
  ])('counts %s', async (_name, binding) => {
    const { host } = hostOf({ '/x': new Error('503'), '/s': new Error('network down') });
    expect(await kindOf(run(binding, host, { s: { method: 'GET', path: '/s' } }))).toBe('request');
  });

  it.each([
    ['an own request that times out', { request: { method: 'GET', path: '/slow' }, transform: 'response' } as Binding],
    ['a shared request that times out', { source: 's', transform: 'response' } as Binding],
  ])('counts %s', async (_name, binding) => {
    vi.useFakeTimers();
    const host: DashboardHost = { loadFile: async () => ({ types: [], instances: [] }), request: () => new Promise(() => undefined) };
    const kind = kindOf(run(binding, host, { s: { method: 'GET', path: '/slow' } }));
    await vi.advanceTimersByTimeAsync(REQUEST_TIMEOUT_MS);
    expect(await kind).toBe('request');
  });

  it.each([
    ['a cross-origin own path', { request: { method: 'GET', path: '//other/x' }, transform: 'response' } as Binding, {}],
    ['a method other than GET or POST', { request: { method: 'PUT' as 'GET', path: '/x' }, transform: 'response' } as Binding, {}],
    ['a cross-origin shared path', { source: 'far', transform: 'response' } as Binding, {}],
    ['an unknown source', { source: 'nope', transform: 'response' } as Binding, {}],
    ['an undeclared variable', { request: { method: 'GET', path: '/x', variables: { team: 'team' } }, transform: 'response' } as Binding, {}],
    ['a transform that fails on the answer', { request: { method: 'GET', path: '/ok' }, transform: 'response.missing.deeper' } as Binding, {}],
  ])('does not count %s', async (_name, binding, values) => {
    const { host } = hostOf({ '/ok': {} });
    expect(await kindOf(run(binding, host, { far: { method: 'GET', path: '//other/x' } }, () => true, values))).toBe('cell');
  });

  it('forgets a failed shared answer only: the next read sends it again once, a good or pending answer is kept', async () => {
    let fail = true;
    let calls = 0;
    let release: () => void = () => undefined;
    const host: DashboardHost = {
      loadFile: async () => ({ types: [], instances: [] }),
      request: async (request) => {
        calls += 1;
        if (request.path === '/slow') await new Promise<void>((resolve) => (release = resolve));
        if (request.path === '/s' && fail) throw new Error('503');
        return { ok: request.path };
      },
    };
    const shared = new SharedRequests({ s: { method: 'GET', path: '/s' }, good: { method: 'GET', path: '/good' }, slow: { method: 'GET', path: '/slow' } }, host, ORIGIN);
    await expect(shared.get('s')).rejects.toThrow('503');
    await shared.get('good');
    const slow = shared.get('slow');
    expect(calls).toBe(3);
    fail = false;
    for (const name of ['s', 'good', 'slow', 'unknown']) shared.forgetFailure(name);
    // Two readers after the retry share one new request.
    expect(await Promise.all([shared.get('s'), shared.get('s')])).toEqual([{ ok: '/s' }, { ok: '/s' }]);
    await shared.get('good');
    expect(shared.get('slow')).toBe(slow);
    expect(calls).toBe(4);
    release();
    await slow;
  });
});

describe('requests built from dashboard variables', () => {
  const PERIOD = { period: 'a&b=c#d e' };
  const own = (request: DashboardRequest): Binding => ({ request, transform: 'response' });

  it('appends an encoded GET value after the query already in the path, and sends no variables field', async () => {
    const { host, sent } = hostOf({ '/n?team=web&period=a%26b%3Dc%23d+e': { v: 1 } });
    const result = await run(own({ method: 'GET', path: '/n?team=web', variables: { period: 'period' } }), host, {}, undefined, PERIOD);
    expect(result).toEqual({ dropped: false, data: { v: 1 } });
    expect(sent).toEqual([{ method: 'GET', path: '/n?team=web&period=a%26b%3Dc%23d+e' }]);
    expect(new URLSearchParams(sent[0].path.split('?')[1]).get('period')).toBe('a&b=c#d e');
  });

  it('sets a POST value as a top-level body field, an absent body counting as {}', async () => {
    const { host, sent } = hostOf({ '/p': {} });
    await run(own({ method: 'POST', path: '/p', body: { team: 'web' }, variables: { period: 'period' } }), host, {}, undefined, PERIOD);
    await run(own({ method: 'POST', path: '/p', variables: { period: 'period' } }), host, {}, undefined, PERIOD);
    expect(sent).toEqual([
      { method: 'POST', path: '/p', body: { team: 'web', period: 'a&b=c#d e' } },
      { method: 'POST', path: '/p', body: { period: 'a&b=c#d e' } },
    ]);
  });

  it.each([
    ['a key already in the path\'s query', { method: 'GET', path: '/n?period=7d', variables: { period: 'period' } }, 'request GET /n?period=7d: key period is already set'],
    ['a key already in the body', { method: 'POST', path: '/p', body: { period: '7d' }, variables: { period: 'period' } }, 'request POST /p: key period is already set'],
    ['a POST body that is not an object', { method: 'POST', path: '/p', body: [1], variables: { period: 'period' } }, 'request POST /p: the body is not an object'],
    ['a variable the dashboard does not declare', { method: 'GET', path: '/n', variables: { team: 'team' } }, 'request GET /n: unknown variable team'],
  ] as [string, DashboardRequest, string][])('fails the cell for %s, before anything is sent', async (_name, request, reason) => {
    const { host, sent } = hostOf({});
    await expect(run(own(request), host, {}, undefined, PERIOD)).rejects.toThrow(reason);
    await expect(run(own(request), host, {}, undefined, PERIOD)).rejects.toBeInstanceOf(CellFailure);
    expect(sent).toHaveLength(0);
  });

  it('keeps a fragment of a GET path after the appended value', async () => {
    const { host, sent } = hostOf({ '/n?team=web&period=7d#top': {} });
    await run(own({ method: 'GET', path: '/n?team=web#top', variables: { period: 'period' } }), host, {}, undefined, { period: '7d' });
    expect(sent.map((request) => request.path)).toEqual(['/n?team=web&period=7d#top']);
  });

  it('encodes a control character in a value, so the built path passes the path check', async () => {
    const { host, sent } = hostOf({ '/n?period=a%01b': {} });
    await expect(run(own({ method: 'GET', path: '/n', variables: { period: 'period' } }), host, {}, undefined, { period: 'a\u0001b' })).resolves.toBeDefined();
    expect(sent.map((request) => request.path)).toEqual(['/n?period=a%01b']);
  });

  it('fails a cross-origin path that names a variable, before anything is sent', async () => {
    const { host, sent } = hostOf({});
    await expect(run(own({ method: 'GET', path: '//other/x', variables: { period: 'period' } }), host, {}, undefined, PERIOD)).rejects.toThrow(/not a same-origin path/);
    expect(sent).toHaveLength(0);
  });

  it.each([
    ['a null request', { request: null, transform: 'response' }],
    ['variables that are not an object', { request: { method: 'GET', path: '/n', variables: 'period' }, transform: 'response' }],
    ['a variable name that is not a string', { request: { method: 'GET', path: '/n', variables: { period: 7 } }, transform: 'response' }],
    // The shared request named "7" names a variable: only the string check keeps the number 7 from reading it.
    ['a source that is not a string', { source: 7, transform: 'response' }],
  ])('reads no variables from a binding with %s', (_name, binding) => {
    const shared = new SharedRequests({ 7: { method: 'GET', path: '/s', variables: { period: 'period' } } }, hostOf({}).host, ORIGIN);
    expect(variablesOfBinding(binding as unknown as Binding, shared)).toEqual([]);
  });

  it('sends a shared request once per built request, and again for a new value', async () => {
    const { host, sent } = hostOf({ '/s?period=7d': { v: 7 }, '/s?period=30d': { v: 30 } });
    const shared = new SharedRequests({ s: { method: 'GET', path: '/s', variables: { period: 'period' } } }, host, ORIGIN);
    const read = (period: string) => runBinding({ binding: { source: 's', transform: 'response.v' }, host, shared, origin: ORIGIN, values: { period }, isLive: () => true });
    expect(await Promise.all([read('7d'), read('7d')])).toEqual([{ dropped: false, data: 7 }, { dropped: false, data: 7 }]);
    expect(await read('30d')).toEqual({ dropped: false, data: 30 });
    expect(await read('7d')).toEqual({ dropped: false, data: 7 });
    expect(sent.map((request) => request.path)).toEqual(['/s?period=7d', '/s?period=30d']);
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

  it('loads the served file from any URL, a CDN included, and applies the binding rules only to data requests', async () => {
    respond('{"types": [], "instances": []}', { url: 'https://cdn.example.com/f.json' });
    await expect(fetchHost({ fileUrl: 'https://cdn.example.com/f.json', origin: ORIGIN }).loadFile(new AbortController().signal)).resolves.toEqual({ types: [], instances: [] });
    await expect(fetchHost({ fileUrl: '/f.json', origin: ORIGIN }).request({ method: 'GET', path: 'https://cdn.example.com/x' }, new AbortController().signal)).rejects.toThrow(/not a same-origin path/);
  });

  it('answers the file followed by the parts of the served widget list, the list read against the file\'s address', async () => {
    const answers: Record<string, unknown> = {
      'https://cdn.example.com/served/file.json': { types: [{ $id: 'file-type' }], instances: [{ id: 'file-instance' }] },
      'https://cdn.example.com/served/widgets.json': ['parts/grid.json'],
      'https://cdn.example.com/served/parts/grid.json': { types: [{ $id: 'part-type' }], instances: [{ id: 'part-instance' }] },
    };
    const fetched: string[] = [];
    vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL) => (fetched.push(String(input)), new Response(JSON.stringify(answers[String(input)]), { status: 200 }))));
    const file = await fetchHost({ fileUrl: 'https://cdn.example.com/served/file.json', widgetList: 'widgets.json', origin: ORIGIN }).loadFile(new AbortController().signal);
    expect(fetched).toEqual(['https://cdn.example.com/served/file.json', 'https://cdn.example.com/served/widgets.json', 'https://cdn.example.com/served/parts/grid.json']);
    expect(file).toEqual([answers['https://cdn.example.com/served/file.json'], answers['https://cdn.example.com/served/parts/grid.json']]);
  });

  it('appends the parts of the served widget list to a served file that is already a list', async () => {
    const answers: Record<string, unknown> = {
      'https://cdn.example.com/served/file.json': [{ types: [{ $id: 'file-type' }], instances: [] }, { types: [], instances: [{ id: 'own-part' }] }],
      'https://cdn.example.com/served/widgets.json': ['parts/grid.json'],
      'https://cdn.example.com/served/parts/grid.json': { types: [{ $id: 'part-type' }], instances: [{ id: 'part-instance' }] },
    };
    vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL) => new Response(JSON.stringify(answers[String(input)]), { status: 200 })));
    const file = await fetchHost({ fileUrl: 'https://cdn.example.com/served/file.json', widgetList: 'widgets.json', origin: ORIGIN }).loadFile(new AbortController().signal);
    expect(file).toEqual([...(answers['https://cdn.example.com/served/file.json'] as unknown[]), answers['https://cdn.example.com/served/parts/grid.json']]);
  });

  it('returns a served file that is not {types, instances} unchanged and reads no list', async () => {
    respond('"not a file"');
    await expect(fetchHost({ fileUrl: '/f.json', widgetList: '/widgets.json', origin: ORIGIN }).loadFile(new AbortController().signal)).resolves.toBe('not a file');
    expect(vi.mocked(fetch)).toHaveBeenCalledTimes(1);
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
