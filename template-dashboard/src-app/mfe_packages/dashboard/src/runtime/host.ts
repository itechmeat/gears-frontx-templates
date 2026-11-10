import type { DashboardRequest } from '../contract';

/*
 * What the dashboard root asks of its host (DESIGN §3.3 Host interface). The
 * root never reaches the network on its own: it sends two kinds of request to
 * the host, and the host answers them.
 */

/** No request, the served file's included, is waited on for longer than this. */
export const REQUEST_TIMEOUT_MS = 30_000;
/** The largest response body `fetchHost` accepts: 1 MiB, counted after decoding. */
export const RESPONSE_SIZE_CAP = 1_048_576;

export interface DashboardHost {
  /** The dashboard request: answers with the served GTS file (`{types, instances}`). */
  loadFile(signal: AbortSignal): Promise<unknown>;
  /**
   * The data request of a binding: answers with the parsed JSON body for
   * `request`. A rejection fails every cell that depends on the request.
   */
  request(request: DashboardRequest, signal: AbortSignal): Promise<unknown>;
}

/** A failed request: the cell (or every cell depending on a shared request) shows its cannot-be-shown state. */
export class RequestFailure extends Error {}

/** The request type's `path` pattern: a single leading `/` not followed by `/` or `\`, no control characters. */
const PATH = /^\/([^/\\\x00-\x1F\x7F][^\x00-\x1F\x7F]*)?$/;

/** A same-origin request target: the path pattern holds and the path resolves to `origin` (DESIGN §2.2). */
export function isSameOriginPath(path: string, origin: string): boolean {
  if (!PATH.test(path)) return false;
  try {
    return new URL(path, origin).origin === origin;
  } catch {
    return false;
  }
}

/** Runs `run` with an abort signal that fires after `ms`; a late answer is a timeout failure. */
export async function withTimeout<T>(run: (signal: AbortSignal) => Promise<T>, ms: number = REQUEST_TIMEOUT_MS): Promise<T> {
  const controller = new AbortController();
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => {
      controller.abort();
      reject(new RequestFailure(`no answer within ${ms} ms`));
    }, ms);
  });
  try {
    return await Promise.race([run(controller.signal), timeout]);
  } finally {
    clearTimeout(timer);
  }
}

/**
 * The default host: the served file from `fileUrl` and every binding request
 * from the page's own origin, with the same-origin check, the 2xx and JSON
 * rules and the 1 MiB cap of DESIGN §3.5. A product whose data does not come
 * from its own origin passes its own `DashboardHost` instead.
 */
export function fetchHost({ fileUrl, origin = globalThis.location?.origin ?? '' }: { fileUrl: string; origin?: string }): DashboardHost {
  const read = async (path: string, init: RequestInit) => {
    if (!isSameOriginPath(path, origin)) throw new RequestFailure(`${path} is not a same-origin path`);
    let response: Response;
    try {
      response = await fetch(new URL(path, origin), init);
    } catch (error) {
      throw new RequestFailure(`network error: ${String(error)}`);
    }
    if (new URL(response.url || new URL(path, origin).href).origin !== origin) throw new RequestFailure(`${path} redirected to another origin`);
    if (response.status < 200 || response.status > 299) throw new RequestFailure(`${path} answered ${response.status}`);
    const bytes = new Uint8Array(await response.arrayBuffer());
    if (bytes.length > RESPONSE_SIZE_CAP) throw new RequestFailure(`${path} answered ${bytes.length} bytes, over the 1 MiB cap`);
    try {
      return JSON.parse(new TextDecoder().decode(bytes)) as unknown;
    } catch {
      throw new RequestFailure(`${path} did not answer valid JSON`);
    }
  };
  return {
    loadFile: (signal) => read(fileUrl, { method: 'GET', signal }),
    request: (request, signal) =>
      read(request.path, {
        method: request.method,
        signal,
        ...(request.method === 'POST' ? { body: JSON.stringify(request.body ?? null), headers: { 'content-type': 'application/json' } } : {}),
      }),
  };
}
