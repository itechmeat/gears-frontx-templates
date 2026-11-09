import { afterEach, describe, expect, it, vi } from 'vitest';
import { gtsPlugin, screenDomain } from '@gears-frontx/react';
import {
  extensionScreenSchema,
  languageCodeSchema,
  languageSchema,
  screenLabelsSchema,
  themeSchema,
} from '@gears-frontx/frontx-template-shell';
import { labelDictionaryUrl, MenuLabels } from './menuLabels';

const extension = 'gts.frontx.mfes.ext.extension.v1~frontx.screensets.layout.screen.v1~frontx.demo.screens.profile.v1';
const blankExtension = 'gts.frontx.mfes.ext.extension.v1~frontx.screensets.layout.screen.v1~frontx.blank.screens.home.v1';
const dictionary = (language: string, label = 'Profile') => ({
  type: 'gts.frontx.i18n.dict.screen_labels.v1~',
  language,
  labels: [{ extension, label }],
});

function store(): typeof gtsPlugin {
  const Plugin = gtsPlugin.constructor as new (options: { isolated: boolean }) => typeof gtsPlugin;
  const plugin = new Plugin({ isolated: true });
  plugin.registerSchema(themeSchema);
  plugin.registerSchema(languageCodeSchema);
  plugin.registerSchema(languageSchema);
  plugin.registerSchema(extensionScreenSchema);
  plugin.registerSchema(screenLabelsSchema);
  // An instance reference must find its entity, so the screen domain and each
  // screen's entry are on the store before the screens that name them.
  plugin.register(screenDomain);
  plugin.register(manifest);
  plugin.register(entry(profileEntry));
  plugin.register(entry(blankEntry));
  plugin.register({
    id: extension,
    domain: screenDomain.id,
    entry: profileEntry,
    route: '/profile',
    presentation: { label: 'Profile' },
  });
  plugin.register({
    id: blankExtension,
    domain: screenDomain.id,
    entry: blankEntry,
    route: '/blank-home',
    presentation: { label: 'Blank Home' },
  });
  return plugin;
}

const profileEntry = 'gts.frontx.mfes.mfe.entry.v1~frontx.mfes.mfe.entry_mf.v1~frontx.demo.mfe.profile.v1';
const blankEntry = 'gts.frontx.mfes.mfe.entry.v1~frontx.mfes.mfe.entry_mf.v1~frontx.blank.mfe.home.v1';
const manifest = {
  id: 'gts.frontx.mfes.mfe.mf_manifest.v1~frontx.demo.mfe.manifest.v1',
  name: 'demoMfe',
  metaData: {
    name: 'demoMfe',
    type: 'app',
    buildInfo: { buildVersion: '1.0.0', buildName: 'demoMfe' },
    remoteEntry: { name: 'remoteEntry.js', path: '', type: 'module' },
    globalName: 'demoMfe',
    publicPath: 'http://localhost:3999/',
  },
  shared: [],
};
const entry = (id: string) => ({
  id,
  requiredProperties: [],
  actions: [],
  domainActions: [],
  manifest: manifest.id,
  exposedModule: './screen',
  exposeAssets: { js: { sync: [], async: [] }, css: { sync: [], async: [] } },
});

afterEach(() => vi.unstubAllGlobals());

describe('screen label schemas', () => {
  it('validates dictionary languages and screen extension references in the real GTS store', () => {
    const plugin = store();
    const nonScreen = 'gts.frontx.mfes.comm.shared_property.v1~frontx.mfes.comm.language.v1~frontx.mfes.comm.label_probe.v1';
    plugin.register({ id: nonScreen, value: 'en' });
    expect(() => plugin.register(dictionary('en'))).not.toThrow();
    expect(() => plugin.register(dictionary('xx'))).toThrow(/to be one of/);
    expect(() => plugin.register({
      ...dictionary('en'),
      labels: [{ extension: nonScreen, label: 'Widget' }],
    })).toThrow(/does not match pattern/);
  });
});

describe('menu label loading', () => {
  it('resolves files against dev, production, and sub-path MFE roots', () => {
    expect(labelDictionaryUrl('labels/en.json', 'http://localhost:3001/', 'http://localhost:3000/generated-mfe-manifests.json'))
      .toBe('http://localhost:3001/labels/en.json');
    expect(labelDictionaryUrl('labels/en.json', 'mfe/demo-mfe/', 'https://example.com/generated-mfe-manifests.json'))
      .toBe('https://example.com/mfe/demo-mfe/labels/en.json');
    expect(labelDictionaryUrl('labels/en.json', 'mfe/demo-mfe/', 'https://example.com/apps/console/generated-mfe-manifests.json'))
      .toBe('https://example.com/apps/console/mfe/demo-mfe/labels/en.json');
  });

  it('loads only the selected language, caches each file, and leaves absent languages empty', async () => {
    const loader = new MenuLabels(store());
    loader.configure([
      {
        manifest: { metaData: { publicPath: 'mfe/demo-mfe/' } },
        extensions: [{ id: extension }],
        labelDictionaries: [{ language: 'en', file: 'labels/en.json' }, { language: 'fr', file: 'labels/fr.json' }],
      },
      {
        manifest: { metaData: { publicPath: 'mfe/_blank-mfe/' } },
        extensions: [{ id: blankExtension }],
        labelDictionaries: [{ language: 'en', file: 'labels/en.json' }],
      },
    ], 'https://example.com/apps/console/generated-mfe-manifests.json');
    const fetchMock = vi.fn(async (url: string) => ({
      ok: true,
      json: async () => url.includes('/_blank-mfe/')
        ? { ...dictionary('en', 'Blank Home'), labels: [{ extension: blankExtension, label: 'Blank Home' }] }
        : dictionary(url.endsWith('/fr.json') ? 'fr' : 'en', url.endsWith('/fr.json') ? 'Profil' : 'Profile'),
    }));
    vi.stubGlobal('fetch', fetchMock);

    const english = await loader.load('en');
    expect(english.get(extension)).toBe('Profile');
    expect(loader.peek('en')).toEqual(english);
    expect(english.get(blankExtension)).toBe('Blank Home');
    expect((await loader.load('fr')).get(extension)).toBe('Profil');
    expect((await loader.load('es')).size).toBe(0);
    await loader.load('en');
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it.each([
    ['$schema and $id', { $schema: 'https://json-schema.org/draft/2020-12/schema', $id: 'gts://gts.frontx.i18n.dict.screen_labels.v1~', labels: [{ extension, label: 'Translated', id: extension }] }],
    ['shared property id', { id: 'gts.frontx.mfes.comm.shared_property.v1~frontx.mfes.comm.language.v1~frontx.mfes.comm.label_probe.v1', value: 'en' }],
    ['screen extension id', { id: extension, route: '/hijacked', presentation: { label: 'Hijacked' }, domain: 'gts.frontx.mfes.ext.domain.v1~frontx.screensets.layout.screen.v1', entry: 'gts.frontx.mfes.mfe.entry.v1~frontx.mfes.mfe.entry_mf.v1~frontx.demo.mfe.profile.v1' }],
  ])('registers a dictionary with %s only as screen labels', async (_name, extra) => {
    const plugin = store();
    const register = vi.spyOn(plugin, 'register');
    const loader = new MenuLabels(plugin);
    loader.configure([{
      manifest: { metaData: { publicPath: 'mfe/demo-mfe/' } },
      extensions: [{ id: extension }],
      labelDictionaries: [{ language: 'en', file: 'labels/en.json' }],
    }], 'https://example.com/generated-mfe-manifests.json');
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true, json: async () => ({ ...dictionary('en', 'Translated'), ...extra }) })));

    expect((await loader.load('en')).get(extension)).toBe('Translated');
    expect(register).toHaveBeenCalledWith(dictionary('en', 'Translated'));
    expect(register).toHaveBeenCalledTimes(1);
  });

  it('validates labels after removing unrelated dictionary fields', async () => {
    const loader = new MenuLabels(store());
    loader.configure([{
      manifest: { metaData: { publicPath: 'mfe/demo-mfe/' } },
      extensions: [{ id: extension }],
      labelDictionaries: [{ language: 'en', file: 'labels/en.json' }],
    }], 'https://example.com/generated-mfe-manifests.json');
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true, json: async () => ({
      ...dictionary('en', ''),
      id: extension,
      domain: 'gts.frontx.mfes.ext.domain.v1~frontx.screensets.layout.screen.v1',
      entry: 'gts.frontx.mfes.mfe.entry.v1~frontx.mfes.mfe.entry_mf.v1~frontx.demo.mfe.profile.v1',
      route: '/hijacked',
      presentation: { label: 'Hijacked' },
    }) })));
    const warning = vi.spyOn(console, 'warn').mockImplementation(() => {});

    expect((await loader.load('en')).size).toBe(0);
    expect(warning).toHaveBeenCalledTimes(1);
    warning.mockRestore();
  });

  it('uses the configured isolated type system for dictionary references', async () => {
    const plugin = store();
    const loader = new MenuLabels(gtsPlugin);
    loader.configure([{
      manifest: { metaData: { publicPath: 'mfe/demo-mfe/' } },
      extensions: [{ id: extension }],
      labelDictionaries: [{ language: 'en', file: 'labels/en.json' }],
    }], 'https://example.com/generated-mfe-manifests.json', plugin);
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true, json: async () => dictionary('en', 'Translated') })));

    expect((await loader.load('en')).get(extension)).toBe('Translated');
  });

  it.each([
    ['503', [{ ok: false, status: 503, statusText: 'Unavailable' }, { ok: true, json: async () => dictionary('en') }], 2, 'Profile'],
    ['network error', [new Error('offline'), { ok: true, json: async () => dictionary('en') }], 2, 'Profile'],
    ['404', [{ ok: false, status: 404, statusText: 'Not Found' }, { ok: true, json: async () => dictionary('en') }], 1, undefined],
    ['body read timeout', [{ ok: true, json: async () => { throw new DOMException('signal timed out', 'TimeoutError'); } }, { ok: true, json: async () => dictionary('en') }], 2, 'Profile'],
    ['invalid JSON', [{ ok: true, json: async () => { throw new SyntaxError('Unexpected end of JSON input'); } }, { ok: true, json: async () => dictionary('en') }], 1, undefined],
  ])('%s responses follow the retry policy', async (_name, responses, count, expected) => {
    const loader = new MenuLabels(store());
    loader.configure([{
      manifest: { metaData: { publicPath: 'mfe/demo-mfe/' } },
      extensions: [{ id: extension }],
      labelDictionaries: [{ language: 'en', file: 'labels/en.json' }],
    }], 'https://example.com/generated-mfe-manifests.json');
    const fetchMock = vi.fn(async (_url: string, _options?: RequestInit) => {
      const next = responses.shift();
      if (next instanceof Error) throw next;
      return next;
    });
    vi.stubGlobal('fetch', fetchMock);
    const warning = vi.spyOn(console, 'warn').mockImplementation(() => {});

    await loader.load('en');
    expect((await loader.load('en')).get(extension)).toBe(expected);
    expect(fetchMock).toHaveBeenCalledTimes(count);
    expect(fetchMock.mock.calls[0][1]?.signal).toBeInstanceOf(AbortSignal);
    warning.mockRestore();
  });

  it('does not publish a load with a retryable failure to peek', async () => {
    const loader = new MenuLabels(store());
    loader.configure([{
      manifest: { metaData: { publicPath: 'mfe/demo-mfe/' } },
      extensions: [{ id: extension }],
      labelDictionaries: [{ language: 'en', file: 'labels/en.json' }],
    }], 'https://example.com/generated-mfe-manifests.json');
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: false, status: 503, statusText: 'Unavailable' })));
    const warning = vi.spyOn(console, 'warn').mockImplementation(() => {});

    expect((await loader.load('en')).size).toBe(0);
    expect(loader.peek('en')).toBeUndefined();
    warning.mockRestore();
  });

  it('does not publish a load superseded by a later configure to peek', async () => {
    const loader = new MenuLabels(store());
    const source = {
      manifest: { metaData: { publicPath: 'mfe/demo-mfe/' } },
      extensions: [{ id: extension }],
      labelDictionaries: [{ language: 'en', file: 'labels/en.json' }],
    };
    loader.configure([source], 'https://example.com/generated-mfe-manifests.json');
    let respond = (_value: unknown) => {};
    vi.stubGlobal('fetch', vi.fn(() => new Promise((resolve) => { respond = resolve; })));

    const stale = loader.load('en');
    loader.configure([source], 'https://example.com/other/generated-mfe-manifests.json');
    respond({ ok: true, json: async () => dictionary('en') });

    expect((await stale).get(extension)).toBe('Profile');
    expect(loader.peek('en')).toBeUndefined();
  });

  it('skips non-array manifest dictionaries and loads valid siblings', async () => {
    const loader = new MenuLabels(store());
    loader.configure([
      {
        manifest: { metaData: { publicPath: 'mfe/broken/' } },
        labelDictionaries: 'invalid' as never,
      },
      {
        manifest: { metaData: { publicPath: 'mfe/demo-mfe/' } },
        extensions: [{ id: extension }],
        labelDictionaries: [{ language: 'en', file: 'labels/en.json' }],
      },
    ], 'https://example.com/generated-mfe-manifests.json');
    const fetchMock = vi.fn(async () => ({ ok: true, json: async () => dictionary('en') }));
    vi.stubGlobal('fetch', fetchMock);

    expect((await loader.load('en')).get(extension)).toBe('Profile');
    expect((await loader.load('fr')).size).toBe(0);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('skips non-object dictionary entries and loads valid siblings', async () => {
    const loader = new MenuLabels(store());
    loader.configure([{
      manifest: { metaData: { publicPath: 'mfe/demo-mfe/' } },
      extensions: [{ id: extension }],
      labelDictionaries: [null, 'labels/en.json', { language: 'en', file: 'labels/en.json' }] as never,
    }], 'https://example.com/generated-mfe-manifests.json');
    const fetchMock = vi.fn(async () => ({ ok: true, json: async () => dictionary('en') }));
    vi.stubGlobal('fetch', fetchMock);

    expect((await loader.load('en')).get(extension)).toBe('Profile');
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('drops labels for extensions the declaring manifest does not own', async () => {
    const loader = new MenuLabels(store());
    loader.configure([
      {
        manifest: { metaData: { publicPath: 'mfe/_blank-mfe/' } },
        extensions: [{ id: blankExtension }],
        labelDictionaries: [{ language: 'en', file: 'labels/en.json' }],
      },
      {
        manifest: { metaData: { publicPath: 'mfe/demo-mfe/' } },
        extensions: [{ id: extension }],
        labelDictionaries: [{ language: 'en', file: 'labels/en.json' }],
      },
    ], 'https://example.com/generated-mfe-manifests.json');
    vi.stubGlobal('fetch', vi.fn(async (url: string) => ({
      ok: true,
      json: async () => url.includes('/_blank-mfe/')
        ? { ...dictionary('en'), labels: [{ extension: blankExtension, label: 'Blank Home' }] }
        : { ...dictionary('en'), labels: [{ extension, label: 'Profile' }, { extension: blankExtension, label: 'Hijacked' }] },
    })));

    const labels = await loader.load('en');
    expect(labels.get(extension)).toBe('Profile');
    expect(labels.get(blankExtension)).toBe('Blank Home');
  });

  it('ignores a valid instance of another type without registering it or replacing the fallback label', async () => {
    const plugin = store();
    const loader = new MenuLabels(plugin);
    const id = 'gts.frontx.mfes.comm.shared_property.v1~frontx.mfes.comm.language.v1~frontx.mfes.comm.label_probe.v1';
    const unrelated = {
      ...dictionary('en', 'Hijacked label'),
      id,
      type: 'gts.frontx.mfes.comm.shared_property.v1~frontx.mfes.comm.language.v1~',
      value: 'en',
    };
    loader.configure([{
      manifest: { metaData: { publicPath: 'mfe/demo-mfe/' } },
      extensions: [{ id: extension }],
      labelDictionaries: [{ language: 'en', file: 'labels/en.json' }],
    }], 'https://example.com/generated-mfe-manifests.json');
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true, json: async () => unrelated })));
    const warning = vi.spyOn(console, 'warn').mockImplementation(() => {});

    const labels = await loader.load('en');
    expect(labels.get(extension) ?? 'Profile').toBe('Profile');
    expect(plugin.validateInstance(id).valid).toBe(false);
    expect(warning).toHaveBeenCalledTimes(1);
    warning.mockRestore();
  });

  it.each([
    ['failed fetch', () => ({ ok: false, status: 404, statusText: 'Not Found' })],
    ['invalid dictionary', () => ({ ok: true, json: async () => dictionary('en', '') })],
    ['mismatched language', () => ({ ok: true, json: async () => dictionary('fr') })],
    ['wrong type', () => ({ ok: true, json: async () => ({ ...dictionary('en'), type: 'wrong' }) })],
    ['missing type', () => ({ ok: true, json: async () => ({ language: 'en', labels: dictionary('en').labels }) })],
  ])('ignores a %s with one warning', async (_name, response) => {
    const loader = new MenuLabels(store());
    loader.configure([{
      manifest: { metaData: { publicPath: 'mfe/demo-mfe/' } },
      extensions: [{ id: extension }],
      labelDictionaries: [{ language: 'en', file: 'labels/en.json' }],
    }], 'https://example.com/generated-mfe-manifests.json');
    const fetchMock = vi.fn(async () => response());
    const warning = vi.spyOn(console, 'warn').mockImplementation(() => {});
    vi.stubGlobal('fetch', fetchMock);

    expect((await loader.load('en')).size).toBe(0);
    expect((await loader.load('en')).size).toBe(0);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(warning).toHaveBeenCalledTimes(1);
    warning.mockRestore();
  });
});
