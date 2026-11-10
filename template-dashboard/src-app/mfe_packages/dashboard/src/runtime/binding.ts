import type { DashboardRequest } from '../contract';
import { compileTransform } from './cel';
import { isSameOriginPath, withTimeout, type DashboardHost } from './host';

/*
 * The binding runner (DESIGN §3.2, runtime FEATURE "Run a binding"): it turns
 * a widget's binding into data. Own and shared bindings ask the host for the
 * request's answer; a static binding needs no request. The caller stamps and
 * registers the result.
 */

export type Binding =
  | { request: DashboardRequest; transform: string }
  | { source: string; params?: Record<string, unknown>; transform: string }
  | { params?: Record<string, unknown>; transform: string };

export type BindingForm = 'own' | 'shared' | 'static';

export const formOf = (binding: Binding): BindingForm => ('request' in binding ? 'own' : 'source' in binding ? 'shared' : 'static');

/** A failure of one cell, with the developer-log text naming the failing step or request. */
export class CellFailure extends Error {}

/** The outcome of a binding: the data, or nothing when the cell left before it finished. */
export type BindingResult = { dropped: false; data: unknown } | { dropped: true };

/** Sends a request through the host, with the same-origin and method checks before anything leaves the root. */
export function sendRequest(host: DashboardHost, request: DashboardRequest, origin: string): Promise<unknown> {
  if (request.method !== 'GET' && request.method !== 'POST') return Promise.reject(new CellFailure(`request method ${String(request.method)} is not GET or POST`));
  if (!isSameOriginPath(request.path, origin)) return Promise.reject(new CellFailure(`request ${request.path} is not a same-origin path`));
  return withTimeout((signal) => host.request(request, signal));
}

/**
 * The shared requests of one dashboard load: each is sent once, when the
 * first cell asks for it, and its answer is held until the load is dropped.
 */
export class SharedRequests {
  private readonly held = new Map<string, Promise<unknown>>();

  constructor(
    private readonly requests: Record<string, DashboardRequest>,
    private readonly host: DashboardHost,
    private readonly origin: string,
  ) {}

  has(name: string): boolean {
    return Object.hasOwn(this.requests, name);
  }

  get(name: string): Promise<unknown> {
    let answer = this.held.get(name);
    if (!answer) {
      const request = this.requests[name];
      answer = request ? sendRequest(this.host, request, this.origin) : Promise.reject(new CellFailure(`unknown source ${name}`));
      // Every dependent cell reads the same answer; one rejection is reported by each of them.
      answer.catch(() => undefined);
      this.held.set(name, answer);
    }
    return answer;
  }
}

/**
 * Runs one binding. `isLive` says whether the cell's extension is still
 * mounted; a result that arrives after it left is dropped.
 */
export async function runBinding({
  binding,
  host,
  shared,
  origin,
  isLive,
}: {
  binding: Binding;
  host: DashboardHost;
  shared: SharedRequests;
  origin: string;
  isLive: () => boolean;
}): Promise<BindingResult> {
  let transform;
  try {
    transform = compileTransform(binding.transform);
  } catch (error) {
    throw new CellFailure(`transform does not parse or check: ${error instanceof Error ? error.message : String(error)}`);
  }
  let variables: Record<string, unknown>;
  const form = formOf(binding);
  if (form === 'static') {
    variables = { params: (binding as { params?: object }).params ?? {} };
  } else {
    let response: unknown;
    try {
      if (form === 'own') {
        response = await sendRequest(host, (binding as { request: DashboardRequest }).request, origin);
      } else {
        const { source, params } = binding as { source: string; params?: object };
        if (!shared.has(source)) throw new CellFailure(`unknown source ${source}`);
        response = await shared.get(source);
        variables = { response, params: params ?? {} };
      }
    } catch (error) {
      if (!isLive()) return { dropped: true };
      throw error instanceof CellFailure ? error : new CellFailure(`request failed: ${error instanceof Error ? error.message : String(error)}`);
    }
    if (!isLive()) return { dropped: true };
    variables = form === 'own' ? { response } : { response, params: (binding as { params?: object }).params ?? {} };
  }
  try {
    return { dropped: false, data: transform.evaluate(variables) };
  } catch (error) {
    throw new CellFailure(`transform failed: ${error instanceof Error ? error.message : String(error)}`);
  }
}
