import { GtsPlugin } from '@gears-frontx/gts-plugin';
import { MfeHandlerMF, type MfeEntryLifecycle, type MfeEntryMF } from '@gears-frontx/mfes';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { IN_BUNDLE_PARTS } from '@gears-frontx/frontx-dashboard-widgets/testing';
import { ENTRY_MF_TYPE_ID } from '../contract';
import { WidgetEntryHandler } from './registry';

/*
 * The entry handler of the widgets domain: an entry listed in `entries` loads
 * from its factory, any other entry loads from its bundle's origin, and a
 * bundle served from outside the allowed origins fails the cell before the
 * FrontX MF handler ever fetches it.
 */

interface ManifestInstance {
  id: string;
  metaData: { publicPath: string };
}

/** The manifest instance the widgets package serves for one catalog bundle, as a product would. */
const manifestOf = (widget: string): ManifestInstance => {
  const found = IN_BUNDLE_PARTS.instances.find((instance) => String(instance.id).endsWith(`frontx.dashboard.widgets.${widget}.v1`));
  if (!found) throw new Error(`no manifest of ${widget} in IN_BUNDLE_PARTS`);
  return found as unknown as ManifestInstance;
};

/** The entry instance the widgets package serves for one catalog bundle, with its manifest reference replaced. */
const entryOf = (widget: string, manifest: string): MfeEntryMF =>
  ({
    ...IN_BUNDLE_PARTS.instances.find((instance) => String(instance.id) === `${ENTRY_MF_TYPE_ID}frontx.dashboard.mfe.${widget}.v1`),
    manifest,
    exposedModule: `./${widget}`,
  }) as MfeEntryMF;

const stubLifecycle = (): MfeEntryLifecycle => ({ mount() {}, unmount() {} });

/** A type system holding the manifest instance, as the root's registry does for the served file. */
function typesWith(manifest: ManifestInstance) {
  const types = new GtsPlugin({ isolated: true });
  types.register(manifest);
  return types;
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('WidgetEntryHandler', () => {
  it('loads an entry listed in entries from its factory and never asks the MF handler', async () => {
    const load = vi.spyOn(MfeHandlerMF.prototype, 'load');
    const lifecycle = stubLifecycle();
    const create = vi.fn(() => lifecycle);
    const entry = entryOf('metric_card', manifestOf('metric_card').id);
    const handler = new WidgetEntryHandler({ [entry.id]: create }, new Set(['https://bundles.example.com']));
    await expect(handler.load(entry, 'ext-1')).resolves.toBe(lifecycle);
    expect(create).toHaveBeenCalledTimes(1);
    expect(load).not.toHaveBeenCalled();
  });

  it('rejects an entry whose bundle is served from an origin outside the allowed bundle origins', async () => {
    const load = vi.spyOn(MfeHandlerMF.prototype, 'load');
    const manifest = manifestOf('metric_card');
    const handler = new WidgetEntryHandler({}, new Set(['https://bundles.example.com']));
    handler.attachTypeSystem(typesWith(manifest));
    const entry = entryOf('metric_card', manifest.id);
    await expect(handler.load(entry, 'ext-2')).rejects.toThrow(manifest.metaData.publicPath);
    await expect(handler.load(entry, 'ext-2')).rejects.toThrow(/outside the allowed bundle origins/);
    expect(load).not.toHaveBeenCalled();
  });

  it.each([
    ['a shared module', (manifest: ManifestInstance) => ({ ...manifest, shared: [{ name: 'react', version: '19.2.4', chunkPath: 'https://evil.example.com/react.js', unwrapKey: null }] }), {}],
    ['the entry chunk', (manifest: ManifestInstance) => manifest, { js: { sync: ['https://evil.example.com/x.js'], async: [] }, css: { sync: [], async: [] } }],
    ['a stylesheet', (manifest: ManifestInstance) => manifest, { js: { sync: ['assets/x.js'], async: [] }, css: { sync: [], async: ['//evil.example.com/x.css'] } }],
    ['a lazy chunk', (manifest: ManifestInstance) => manifest, { js: { sync: ['assets/x.js'], async: ['https://evil.example.com/lazy.js'] }, css: { sync: [], async: [] } }],
    ['an entry stylesheet', (manifest: ManifestInstance) => manifest, { js: { sync: ['assets/x.js'], async: [] }, css: { sync: ['https://evil.example.com/x.css'], async: [] } }],
  ])('rejects a bundle on an allowed origin whose %s is addressed on another origin', async (_name, manifestWith, exposeAssets) => {
    const load = vi.spyOn(MfeHandlerMF.prototype, 'load');
    const handler = new WidgetEntryHandler({}, new Set([globalThis.location.origin]));
    const manifest = manifestWith(manifestOf('metric_card'));
    const entry = { ...entryOf('metric_card', manifest.id), manifest, ...(Object.keys(exposeAssets).length ? { exposeAssets } : {}) } as unknown as MfeEntryMF;
    await expect(handler.load(entry, 'ext-3')).rejects.toThrow(/evil\.example\.com.*outside the allowed bundle origins/);
    expect(load).not.toHaveBeenCalled();
  });

  it('loads an entry from an allowed bundle origin with the same entry and extension id', async () => {
    const lifecycle = stubLifecycle();
    const load = vi.spyOn(MfeHandlerMF.prototype, 'load').mockResolvedValue(lifecycle);
    const manifest = manifestOf('metric_card');
    const handler = new WidgetEntryHandler({}, new Set([globalThis.location.origin]));
    handler.attachTypeSystem(typesWith(manifest));
    const entry = entryOf('metric_card', manifest.id);
    const extensionId = 'gts.frontx.mfes.ext.extension.v1~frontx.dashboard.mfe.widget_ext.v1~0aa9a44b-6e37-4d0e-9b2f-2f5a8f9d1c01';
    await expect(handler.load(entry, extensionId)).resolves.toBe(lifecycle);
    expect(load).toHaveBeenCalledTimes(1);
    expect(load).toHaveBeenCalledWith(entry, extensionId);
  });

  it.each([
    ['no manifest registered', undefined],
    ['the unresolved "auto" publicPath', 'auto'],
    ['an empty publicPath', ''],
  ])('rejects an entry with %s before the MF handler is asked', async (_name, publicPath) => {
    const load = vi.spyOn(MfeHandlerMF.prototype, 'load');
    const handler = new WidgetEntryHandler({}, new Set([globalThis.location.origin]));
    const manifest = manifestOf('metric_card');
    if (publicPath !== undefined) handler.attachTypeSystem(typesWith({ ...manifest, metaData: { ...manifest.metaData, publicPath } }));
    else handler.attachTypeSystem(new GtsPlugin({ isolated: true }));
    await expect(handler.load(entryOf('metric_card', manifest.id), 'ext-4')).rejects.toThrow(/outside the allowed bundle origins|has no bundle address/);
    expect(load).not.toHaveBeenCalled();
  });
});
