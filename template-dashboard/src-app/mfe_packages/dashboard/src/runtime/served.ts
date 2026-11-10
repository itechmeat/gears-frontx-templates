import type { ServedFile } from '../contract';
import { RequestFailure, withTimeout } from './host';

/** How long one part may take: a part that does not answer in time is left out, so the healthy parts still arrive within the served file's own 30 s. */
export const PART_TIMEOUT_MS = 10_000;

/*
 * The served file in parts (DESIGN §3.3 Widget bundles): the catalog types,
 * one part per widget bundle (its manifest and entry, and the types a new
 * widget type brings), and the dashboards. A product serves the joined file;
 * the helpers below join the parts in the browser for a product that serves
 * them as separate files.
 */

/** Joins served-file parts in order: every part's types, then every part's instances. */
export function composeServedFile(...parts: ServedFile[]): ServedFile {
  return { types: parts.flatMap((part) => part.types), instances: parts.flatMap((part) => part.instances) };
}

export const isPart = (value: unknown): value is ServedFile =>
  value !== null && typeof value === 'object' && Array.isArray((value as ServedFile).types) && Array.isArray((value as ServedFile).instances);

/** A signal that aborts when either of two does. */
function linked(first: AbortSignal, second: AbortSignal): AbortSignal {
  const controller = new AbortController();
  for (const signal of [first, second]) {
    if (signal.aborted) controller.abort();
    else signal.addEventListener('abort', () => controller.abort(), { once: true });
  }
  return controller.signal;
}

async function readJson(url: URL, signal: AbortSignal): Promise<unknown> {
  let response: Response;
  try {
    response = await fetch(url, { signal });
  } catch (error) {
    throw new RequestFailure(`network error for ${url.href}: ${String(error)}`);
  }
  if (!response.ok) throw new RequestFailure(`${url.href} answered ${response.status}`);
  try {
    return await response.json();
  } catch {
    throw new RequestFailure(`${url.href} did not answer valid JSON`);
  }
}

/**
 * Reads the served widget list at `listUrl`, a JSON array of the addresses of
 * the widget bundles' parts (`widget.gts.json`), and every part it names,
 * relative addresses against the list's own. A part that cannot be read is
 * left out with one console line: its widget types then have no entry, so
 * only their cells fail. A part that is read but that the registry rejects
 * fails the whole served file, like any other item of it. A list that cannot
 * be read rejects.
 */
export async function loadWidgetParts(listUrl: string, signal: AbortSignal, base: string = globalThis.location?.href ?? '', partTimeoutMs: number = PART_TIMEOUT_MS): Promise<ServedFile[]> {
  const listAt = new URL(listUrl, base);
  const list = await readJson(listAt, signal);
  if (!Array.isArray(list) || !list.every((item) => typeof item === 'string')) throw new RequestFailure(`${listAt.href} is not a list of addresses`);
  const parts = await Promise.all(
    list.map(async (address) => {
      let at: URL | undefined;
      try {
        // Built inside the boundary: a malformed address leaves out only its own part.
        at = new URL(address, listAt);
        const target = at;
        // The part's own deadline; the caller's cancellation still reaches its request.
        const part = await withTimeout((own) => readJson(target, linked(signal, own)), partTimeoutMs);
        if (!isPart(part)) throw new RequestFailure(`${at.href} has no types and instances lists`);
        return part;
      } catch (error) {
        if (signal.aborted) throw error;
        console.error(`[dashboard] the widget part ${at?.href ?? address} is left out: ${error instanceof Error ? error.message : String(error)}`);
        return undefined;
      }
    }),
  );
  return parts.filter((part): part is ServedFile => part !== undefined);
}
