/**
 * When the screen domain is registered relative to the manifest walk, through
 * the real runtime: the registry `microfrontends()` builds, the real
 * `bootstrapMFE` and the real screen domain registration. Only the manifest
 * fetch is stubbed.
 *
 * `bootstrapOnce` holds one bootstrap per module instance, so every case
 * imports the shell's modules afresh.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, render, screen, waitFor } from '@testing-library/react';

const SCREEN_DOMAIN = 'gts.frontx.mfes.ext.domain.v1~frontx.screensets.layout.screen.v1';
const MANIFEST_ID = 'gts.frontx.mfes.mfe.mf_manifest.v1~frontx.order.mfe.manifest.v1';
const THEME = 'gts.frontx.mfes.comm.shared_property.v1~frontx.mfes.comm.theme.v1~';
const LANGUAGE = 'gts.frontx.mfes.comm.shared_property.v1~frontx.mfes.comm.language.v1~';
const ENTRY_ID = 'gts.frontx.mfes.mfe.entry.v1~frontx.mfes.mfe.entry_mf.v1~frontx.order.mfe.overview.v1';
const EXTENSION_ID =
  'gts.frontx.mfes.ext.extension.v1~frontx.screensets.layout.screen.v1~frontx.order.screens.overview.v1';

const manifest = {
  id: MANIFEST_ID,
  name: 'orderMfe',
  metaData: {
    name: 'orderMfe',
    type: 'app',
    buildInfo: { buildVersion: '1.0.0', buildName: 'orderMfe' },
    remoteEntry: { name: 'remoteEntry.js', path: '', type: 'module' },
    globalName: 'orderMfe',
    publicPath: 'http://localhost:3999/',
  },
  shared: [],
};

const aggregate = [
  {
    manifest,
    entries: [
      {
        id: ENTRY_ID,
        requiredProperties: [THEME, LANGUAGE],
        actions: [],
        domainActions: [],
        manifest,
        exposedModule: './overview',
        exposeAssets: { js: { sync: [], async: [] }, css: { sync: [], async: [] } },
      },
    ],
    extensions: [
      {
        id: EXTENSION_ID,
        domain: SCREEN_DOMAIN,
        entry: ENTRY_ID,
        route: '/overview',
        presentation: { label: 'Overview', icon: 'lucide:home', order: 0 },
      },
    ],
  },
];

async function buildApp() {
  const react = await import('@gears-frontx/react');
  const { themeSchema, languageCodeSchema, languageSchema, screenLabelsSchema } = await import('@gears-frontx/frontx-template-shell');
  react.gtsPlugin.registerSchema(themeSchema);
  react.gtsPlugin.registerSchema(languageCodeSchema);
  react.gtsPlugin.registerSchema(languageSchema);
  react.gtsPlugin.registerSchema(screenLabelsSchema);
  const app = react
    .createFrontX()
    .useAll(react.presets.full())
    .use(react.microfrontends({ typeSystem: react.gtsPlugin, mfeHandlers: [] }))
    .build();
  const registry = app.mfeRegistry;
  if (!registry) throw new Error('the microfrontends plugin built no registry');
  return { react, app, registry };
}

describe('the screen domain and the manifest walk', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.spyOn(globalThis, 'fetch').mockImplementation(() => Promise.resolve(new Response(JSON.stringify(aggregate))));
    vi.spyOn(console, 'info').mockImplementation(() => {});
  });

  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
    window.history.replaceState(null, '', '/');
  });

  it('a screen domain registered after the walk does not admit the screens the walk recorded', async () => {
    const { react, app, registry } = await buildApp();
    const { bootstrapMFE } = await import('./bootstrap');
    const { registerScreenDomain } = await import('./screenDomain');
    // The screen type is on the type system, only the domain is missing. A
    // GTS instance reference must find its entity, so the walk refuses the
    // screen instead of recording it.
    const { extensionScreenSchema } = await import('@gears-frontx/frontx-template-shell');
    react.gtsPlugin.registerSchema(extensionScreenSchema);

    await expect(bootstrapMFE(app, [])).rejects.toThrow(/Referenced entity '[^']*screen\.v1' not found/);
    registerScreenDomain(app);

    expect(registry.getDomain(SCREEN_DOMAIN)).toBeDefined();
    expect(registry.getExtension(EXTENSION_ID)).toBeUndefined();
    expect(registry.getExtensionsForDomain(SCREEN_DOMAIN)).toEqual([]);
    // Releases the page's routed `screen` route for the next case.
    await registry.unregisterDomain(SCREEN_DOMAIN);
  });

  it('the screen container registers the domain before the walk, and a menu rendered before it lists and mounts its screens', async () => {
    const { react, app, registry } = await buildApp();
    const { Menu } = await import('@/app/layout/Menu');
    const { MfeScreenContainer } = await import('./MfeScreenContainer');
    const { screenState } = await import('./screenState');

    const menu = render(
      <react.FrontXProvider app={app}>
        <Menu />
      </react.FrontXProvider>,
    );
    // Nothing has started the bootstrap yet: no domain, no menu item.
    await act(async () => {});
    expect(registry.getDomain(SCREEN_DOMAIN)).toBeUndefined();
    expect(screen.queryByTestId(`menu-item-${EXTENSION_ID}`)).toBeNull();

    render(
      <react.FrontXProvider app={app}>
        <MfeScreenContainer />
      </react.FrontXProvider>,
    );

    const item = await waitFor(() => menu.getByTestId(`menu-item-${EXTENSION_ID}`));
    expect(registry.getExtensionsForDomain(SCREEN_DOMAIN).map((extension) => extension.id)).toEqual([EXTENSION_ID]);

    // The admitted screen mounts: the mount action reaches the screen domain's
    // implementation, whose container hooks record the screen before it loads.
    act(() => item.click());
    await waitFor(() => expect(screenState.getSnapshot()).toBe(EXTENSION_ID));
  });

  it('without a screen container there is no screen domain, and the menu stays blank without an error', async () => {
    const { react, app, registry } = await buildApp();
    const { Menu } = await import('@/app/layout/Menu');
    const errorSpy = vi.spyOn(console, 'error');

    render(
      <react.FrontXProvider app={app}>
        <Menu />
      </react.FrontXProvider>,
    );
    await act(async () => {});

    expect(registry.getDomain(SCREEN_DOMAIN)).toBeUndefined();
    expect(screen.queryByTestId(/^menu-item-/)).toBeNull();
    expect(screen.queryByText(/No screens yet/)).toBeNull();
    expect(globalThis.fetch).not.toHaveBeenCalled();
    expect(errorSpy).not.toHaveBeenCalled();
  });
});
