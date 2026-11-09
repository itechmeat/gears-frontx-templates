import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ActionHandler } from '@gears-frontx/react';

const registerDomain = vi.fn();
const updateSharedProperty = vi.fn();
const registerSchema = vi.fn();
const registerInstance = vi.fn();
const registerExtension = vi.fn().mockResolvedValue(undefined);
const getDomain = vi.fn();
const getExtension = vi.fn();
const getExtensionsForDomain = vi.fn((_domainId: string): unknown[] => []);
const executeActionsChain = vi.fn(() => undefined);
// A real `ExclusiveMountStrategy` needs a fully wired
// `mfes` registry/mounter/bridge to mount anything - out of scope here (that
// machinery is `mfes`'s own tested behaviour, Global Constraints). A
// fake stands in for it so the cases below can exercise only what this
// package owns: the order between a strategy settling and `routing.afterMount`
// / `routing.afterUnmount` being called.
//
// The Exclusive fake follows the call points of `ExclusiveMountStrategy`
// (mfes `ExclusiveMountStrategy.ts`) on the container hooks it was built with:
// `destroy(occupant)` when a mount evicts it, `create(subject)` before the
// physical mount, `destroy(subject)` when that mount fails, and
// `destroy(occupant)` when the slot detaches (`detach()` stands for the
// screen mounter's detach releasing its occupant). `exclusiveMount` records
// the call the handler makes on the strategy and is awaited first, so a case
// can make the strategy fail or hang through it; `physicalMount` is the
// mounter's own mount the strategy awaits.
const exclusiveMount = vi.fn();
const physicalMount = vi.fn().mockResolvedValue(undefined);
interface RecordedHooks {
  create(subject: string): unknown;
  destroy(subject: string, container?: Element): void;
}
class FakeExclusiveMountStrategy {
  static last: FakeExclusiveMountStrategy | undefined;
  private occupant: string | undefined;
  constructor(_mounter: unknown, private readonly hooks: RecordedHooks) {
    FakeExclusiveMountStrategy.last = this;
  }
  async mount(payload: { subject: string }): Promise<void> {
    await exclusiveMount(payload);
    const subject = payload.subject;
    if (this.occupant !== undefined && this.occupant !== subject) {
      this.hooks.destroy(this.occupant);
      this.occupant = undefined;
    }
    this.hooks.create(subject);
    try {
      await physicalMount(subject);
    } catch (error) {
      this.hooks.destroy(subject);
      throw error;
    }
    this.occupant = subject;
  }
  detach(): void {
    if (this.occupant !== undefined) {
      this.hooks.destroy(this.occupant);
      this.occupant = undefined;
    }
  }
}
const mockMfeRegistry = {
  registerDomain,
  updateSharedProperty,
  registerExtension,
  getDomain,
  getExtension,
  getExtensionsForDomain,
  executeActionsChain,
  typeSystem: {
    register: registerInstance,
    registerSchema,
  },
};

const mockApp = {
  mfeRegistry: mockMfeRegistry,
  themeRegistry: { getCurrent: () => undefined },
  i18nRegistry: { getLanguage: () => null },
};

// The screen domain needs a valid `route`: the injected router rejects a
// routed domain that declares none, and `bootstrapMFE` would then throw before
// ever reaching the manifest fetch these cases exercise.
vi.mock('@gears-frontx/react', async (importOriginal) => {
  const real = await importOriginal<Record<string, never>>();
  return {
    ...real,
    // `actions` is spread by the host bootstrap to append the chrome actions.
    screenDomain: { id: 'screen-domain', route: 'screen', actions: [] },
    ExclusiveMountStrategy: FakeExclusiveMountStrategy,
  };
});

/** `bootstrapMFE` freshly imported, run with the screen domain the shell implements. */
async function loadBootstrap(): Promise<{ bootstrapMFE: (app: never) => Promise<void> }> {
  const { bootstrapMFE } = await import('./bootstrap');
  const { registerScreenDomain } = await import('./screenDomain');
  return { bootstrapMFE: (app) => bootstrapMFE(app, [registerScreenDomain]) };
}

describe('bootstrapMFE (host-app)', () => {
  let fetchSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    vi.resetModules();
    registerDomain.mockReset();
    updateSharedProperty.mockReset();
    registerSchema.mockReset();
    registerInstance.mockReset();
    registerExtension.mockReset();
    registerExtension.mockResolvedValue(undefined);
    getDomain.mockReset();
    getExtension.mockReset();
    getExtensionsForDomain.mockReset();
    getExtensionsForDomain.mockReturnValue([]);
    executeActionsChain.mockClear();
    exclusiveMount.mockClear();
    physicalMount.mockReset();
    physicalMount.mockResolvedValue(undefined);
    FakeExclusiveMountStrategy.last = undefined;

    fetchSpy = vi.spyOn(globalThis, 'fetch');
  });

  afterEach(() => {
    fetchSpy.mockRestore();
    vi.restoreAllMocks();
  });

  it('registers the screen domain and the screen extension type before fetching manifests', async () => {
    fetchSpy.mockResolvedValue(new Response('[]', { status: 200 }));
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

    const { bootstrapMFE } = await loadBootstrap();
    const { extensionScreenSchema } = await import('@gears-frontx/frontx-template-shell');
    await bootstrapMFE(mockApp as never);

    expect(registerDomain).toHaveBeenCalledTimes(1);
    expect(registerDomain.mock.calls[0][0].id).toBe('screen-domain');
    expect(registerSchema).toHaveBeenCalledWith(extensionScreenSchema);
    // The type goes on the type system before the domain that names it.
    expect(registerSchema.mock.invocationCallOrder[0]).toBeLessThan(registerDomain.mock.invocationCallOrder[0]);
    expect(registerDomain.mock.invocationCallOrder[0]).toBeLessThan(fetchSpy.mock.invocationCallOrder[0]);
    expect(updateSharedProperty.mock.calls.length).toBeGreaterThanOrEqual(2);
    expect(warnSpy).toHaveBeenCalled();
  });

  it('configures menu labels on the registry type system', async () => {
    const aggregate = [{
      manifest: { id: 'manifest.demo', metaData: { publicPath: '/mfe/demo/' } },
      entries: [],
      extensions: [{ id: 'ext.demo', domain: 'foreign-domain' }],
      labelDictionaries: [{ language: 'fr', file: 'labels/fr.json' }],
    }];
    fetchSpy.mockResolvedValue(new Response(JSON.stringify(aggregate), { status: 200 }));
    const { bootstrapMFE } = await loadBootstrap();
    const { menuLabels } = await import('./menuLabels');
    const configure = vi.spyOn(menuLabels, 'configure');

    await bootstrapMFE(mockApp as never);

    expect(configure).toHaveBeenCalledTimes(1);
    const [manifests, aggregateUrl, typeSystem] = configure.mock.calls[0];
    expect(manifests).toEqual(aggregate);
    expect(aggregateUrl).toMatch(/generated-mfe-manifests\.json$/);
    expect(typeSystem).toBe(mockMfeRegistry.typeSystem);
  });

  it('registers no domain and no screen type when the host implements none', async () => {
    fetchSpy.mockResolvedValue(new Response('[]', { status: 200 }));
    vi.spyOn(console, 'warn').mockImplementation(() => {});

    const { bootstrapMFE } = await import('./bootstrap');
    await bootstrapMFE(mockApp as never, []);

    expect(registerDomain).not.toHaveBeenCalled();
    expect(registerSchema).not.toHaveBeenCalled();
  });

  it('opts the screen domain into the host chrome actions', async () => {
    fetchSpy.mockResolvedValue(new Response('[]', { status: 200 }));
    vi.spyOn(console, 'warn').mockImplementation(() => {});

    const { bootstrapMFE } = await loadBootstrap();
    const { CHROME_SET_MENU_COLLAPSED, CHROME_SET_THEME } = await import('./chrome-actions');
    await bootstrapMFE(mockApp as never);

    const [screenDeclaration] = registerDomain.mock.calls[0];
    expect(screenDeclaration.actions).toEqual([CHROME_SET_THEME, CHROME_SET_MENU_COLLAPSED]);
    // Making them domain actions must not make them mandatory for the
    // extensions that mount into the domain.
    expect(screenDeclaration.extensionsActions).toBeUndefined();
    // The screen extension type and the two chrome action types.
    expect(registerSchema).toHaveBeenCalledTimes(3);
  });

  it("the screen mount handler only calls the strategy's own mount — URL reflection is the runtime's `reflect` commands to the injected router (ADR 0036), not this handler's concern", async () => {
    fetchSpy.mockResolvedValue(new Response('[]', { status: 200 }));
    vi.spyOn(console, 'warn').mockImplementation(() => {});

    const { bootstrapMFE } = await loadBootstrap();
    await bootstrapMFE(mockApp as never);

    const [, screenFactory] = registerDomain.mock.calls[0];
    const handlers = new Map<string, { handleAction: (t: string, p: unknown) => unknown }>();
    screenFactory.build({
      mounter: {},
      registerHandler: (actionTypeId: string, handler: { handleAction: (t: string, p: unknown) => unknown }) => {
        handlers.set(actionTypeId, handler);
      },
    });

    const mountHandler = handlers.get('gts.frontx.mfes.comm.action.v1~frontx.mfes.ext.mount_ext.v1~');
    expect(mountHandler).toBeDefined();
    await mountHandler!.handleAction('gts.frontx.mfes.comm.action.v1~frontx.mfes.ext.mount_ext.v1~', {
      subject: 'ext.hello-world',
    });

    expect(exclusiveMount).toHaveBeenCalledWith({ subject: 'ext.hello-world' });
  });

  async function buildScreen(): Promise<{
    mountId: string;
    mount: (subject: string) => Promise<unknown>;
    screenState: { getSnapshot(): string | undefined };
  }> {
    fetchSpy.mockResolvedValue(new Response('[]', { status: 200 }));
    vi.spyOn(console, 'warn').mockImplementation(() => {});

    const { bootstrapMFE } = await loadBootstrap();
    const { screenState } = await import('./screenState');
    await bootstrapMFE(mockApp as never);

    const [, screenFactory] = registerDomain.mock.calls[0];
    const handlers = new Map<string, { handleAction: (t: string, p: unknown) => unknown }>();
    screenFactory.build({
      mounter: {},
      registerHandler: (actionTypeId: string, handler: { handleAction: (t: string, p: unknown) => unknown }) => {
        handlers.set(actionTypeId, handler);
      },
    });
    const mountId = 'gts.frontx.mfes.comm.action.v1~frontx.mfes.ext.mount_ext.v1~';
    return {
      mountId,
      mount: (subject) => Promise.resolve(handlers.get(mountId)!.handleAction(mountId, { subject })),
      screenState,
    };
  }

  describe("the shell's screen state, driven by the screen strategy's container hooks", () => {
    it('is empty before any mount and holds the screen once it is mounted', async () => {
      const { mount, screenState } = await buildScreen();
      expect(screenState.getSnapshot()).toBeUndefined();

      await mount('ext.screen-a');

      expect(screenState.getSnapshot()).toBe('ext.screen-a');
    });

    it('holds the new screen after a successful mount evicts the previous one', async () => {
      const { mount, screenState } = await buildScreen();

      await mount('ext.screen-a');
      await mount('ext.screen-b');

      expect(screenState.getSnapshot()).toBe('ext.screen-b');
    });

    it('is empty after a mount that fails once it has evicted the previous screen', async () => {
      const { mount, screenState } = await buildScreen();
      await mount('ext.screen-a');
      expect(screenState.getSnapshot()).toBe('ext.screen-a');

      physicalMount.mockRejectedValueOnce(new Error('mount refused'));
      await expect(mount('ext.screen-b')).rejects.toThrow('mount refused');

      expect(screenState.getSnapshot()).toBeUndefined();
    });

    it('is empty after a first mount that fails', async () => {
      const { mount, screenState } = await buildScreen();

      physicalMount.mockRejectedValueOnce(new Error('mount refused'));
      await expect(mount('ext.bad')).rejects.toThrow('mount refused');

      expect(screenState.getSnapshot()).toBeUndefined();
    });

    it('is empty after the screen slot detaches', async () => {
      const { mount, screenState } = await buildScreen();
      await mount('ext.screen-a');
      expect(screenState.getSnapshot()).toBe('ext.screen-a');

      FakeExclusiveMountStrategy.last!.detach();

      expect(screenState.getSnapshot()).toBeUndefined();
    });

    it('is left alone when a screen other than the one it holds is destroyed', async () => {
      const { mount, screenState } = await buildScreen();
      await mount('ext.screen-a');

      const hooks = (FakeExclusiveMountStrategy.last as unknown as { hooks: RecordedHooks }).hooks;
      hooks.destroy('ext.other');

      expect(screenState.getSnapshot()).toBe('ext.screen-a');
    });
  });

  it('the screen domain registers no unmount_ext handler: an Exclusive domain declares none (ADR 0009)', async () => {
    fetchSpy.mockResolvedValue(new Response('[]', { status: 200 }));
    vi.spyOn(console, 'warn').mockImplementation(() => {});

    const { bootstrapMFE } = await loadBootstrap();
    await bootstrapMFE(mockApp as never);

    const [screenDeclaration, screenFactory] = registerDomain.mock.calls[0];
    const handlers = new Map<string, unknown>();
    screenFactory.build({
      mounter: {},
      registerHandler: (actionTypeId: string, handler: unknown) => {
        handlers.set(actionTypeId, handler);
      },
    });

    const unmountActionId = 'gts.frontx.mfes.comm.action.v1~frontx.mfes.ext.unmount_ext.v1~';
    expect(handlers.has('gts.frontx.mfes.comm.action.v1~frontx.mfes.ext.mount_ext.v1~')).toBe(true);
    expect(handlers.has(unmountActionId)).toBe(false);
    expect(screenDeclaration.actions).not.toContain(unmountActionId);
  });

  it('throws when the manifest fetch fails', async () => {
    fetchSpy.mockResolvedValue(new Response('not found', { status: 404, statusText: 'Not Found' }));

    const { bootstrapMFE } = await loadBootstrap();
    await expect(bootstrapMFE(mockApp as never)).rejects.toThrow(/Failed to load MFE manifests/);
  });

  it('registers schemas, manifest, entries, and extensions for each package', async () => {
    const screenDomainId = 'screen-domain';
    getDomain.mockImplementation((id: string) => (id === screenDomainId ? { id } : undefined));

    const manifestEntity = { $id: 'manifest.demo', id: 'manifest.demo' };
    const entry = { id: 'entry.demo', actions: ['act.a'], domainActions: ['act.b'] };
    const ext = { id: 'ext.demo', domain: screenDomainId };
    const schemaActionA = { $id: 'gts://act.a' };
    const schemaActionB = { $id: 'gts://act.b' };
    const schemaUnrelated = { $id: 'gts://other' };

    fetchSpy.mockResolvedValue(
      new Response(
        JSON.stringify([
          {
            manifest: manifestEntity,
            entries: [entry],
            extensions: [ext],
            schemas: [schemaActionA, schemaActionB, schemaUnrelated],
          },
        ]),
        { status: 200 },
      ),
    );

    const { bootstrapMFE } = await loadBootstrap();
    await bootstrapMFE(mockApp as never);

    // Every shipped schema with a $id is registered, declared action or not.
    expect(registerSchema).toHaveBeenCalledWith(schemaActionA);
    expect(registerSchema).toHaveBeenCalledWith(schemaActionB);
    expect(registerSchema).toHaveBeenCalledWith(schemaUnrelated);
    expect(registerInstance).toHaveBeenCalledWith(manifestEntity);
    expect(registerInstance).toHaveBeenCalledWith(entry);
    expect(registerExtension).toHaveBeenCalledWith(ext);
  });

  it('registers every extension in a package, in order', async () => {
    const extA = { id: 'ext.a', domain: 'screen-domain' };
    const extB = { id: 'ext.b', domain: 'screen-domain' };
    getDomain.mockImplementation((id: string) => (id === 'screen-domain' ? { id } : undefined));
    fetchSpy.mockResolvedValue(
      new Response(
        JSON.stringify([
          { manifest: { $id: 'manifest.demo', id: 'manifest.demo' }, entries: [], extensions: [extA, extB] },
        ]),
        { status: 200 },
      ),
    );

    const { bootstrapMFE } = await loadBootstrap();
    await expect(bootstrapMFE(mockApp as never)).resolves.toBeUndefined();

    expect(registerExtension).toHaveBeenCalledWith(extA);
    expect(registerExtension).toHaveBeenCalledWith(extB);
  });

  it("registers every package's schemas before any entity, and every domain before any extension", async () => {
    // The widget package comes first, the package declaring its domain and the
    // action type its entry names second. The real store refuses a reference to
    // an entity or type it does not hold yet (screenDomainOrder.test.tsx runs
    // it); this mocked one cannot, so the case pins the registration order.
    getDomain.mockReturnValue(undefined);
    const widget = { id: 'ext.widget', domain: 'widgets-domain', entry: 'entry.widget' };
    const widgetEntry = { id: 'entry.widget', actions: ['act.ping'], domainActions: [] };
    const widgetsDomain = { id: 'widgets-domain' };
    // The host entry declares act.ping: a walk that held declared action schemas
    // back until their own package's turn would register it after entry.widget.
    const hostEntry = { id: 'entry.host', actions: ['act.ping'], domainActions: [] };
    const pingSchema = { $id: 'gts://act.ping' };
    fetchSpy.mockResolvedValue(
      new Response(
        JSON.stringify([
          { manifest: { id: 'manifest.widget' }, entries: [widgetEntry], extensions: [widget] },
          { manifest: { id: 'manifest.host' }, domains: [widgetsDomain], entries: [hostEntry], schemas: [pingSchema] },
        ]),
        { status: 200 },
      ),
    );

    const { bootstrapMFE } = await loadBootstrap();
    await bootstrapMFE(mockApp as never);

    const orderOf = (id: string): number => {
      const index = registerInstance.mock.calls.findIndex(([instance]) => (instance as { id: string }).id === id);
      expect(index).toBeGreaterThan(-1);
      return registerInstance.mock.invocationCallOrder[index];
    };
    const schemaIndex = registerSchema.mock.calls.findIndex(([schema]) => (schema as { $id?: string }).$id === pingSchema.$id);
    expect(schemaIndex).toBeGreaterThan(-1);
    expect(registerSchema.mock.invocationCallOrder[schemaIndex]).toBeLessThan(orderOf('manifest.widget'));
    expect(orderOf('widgets-domain')).toBeLessThan(orderOf('ext.widget'));
    expect(orderOf('entry.widget')).toBeLessThan(orderOf('ext.widget'));
  });

  it('skips extension registration when host does not own the target domain', async () => {
    getDomain.mockReturnValue(undefined);
    fetchSpy.mockResolvedValue(
      new Response(
        JSON.stringify([
          {
            manifest: { $id: 'manifest.foreign', id: 'manifest.foreign' },
            entries: [],
            extensions: [{ id: 'ext.foreign', domain: 'foreign-domain' }],
          },
        ]),
        { status: 200 },
      ),
    );

    const { bootstrapMFE } = await loadBootstrap();
    await bootstrapMFE(mockApp as never);

    expect(registerExtension).not.toHaveBeenCalled();
  });

  describe('screen-domain chrome handlers', () => {
    /**
     * Bootstraps with the given `app.actions` surface and returns the handlers
     * the screen domain's implementation registered. The factory is taken from
     * the `registerDomain` call rather than reconstructed, so the handlers
     * under test are the ones the real bootstrap would have installed.
     */
    async function chromeHandlersFor(
      actions: Record<string, unknown>,
    ): Promise<Map<string, ActionHandler>> {
      fetchSpy.mockResolvedValue(new Response('[]', { status: 200 }));

      const { bootstrapMFE } = await loadBootstrap();
      await bootstrapMFE({ ...mockApp, actions } as never);

      const handlers = new Map<string, ActionHandler>();
      const [, screenFactory] = registerDomain.mock.calls[0];
      screenFactory.build({
        mounter: {},
        registerHandler: (actionTypeId: string, handler: ActionHandler) => {
          handlers.set(actionTypeId, handler);
        },
      });
      return handlers;
    }

    /**
     * The handler registered for `actionTypeId`, or a failure naming what was
     * not registered. `Map.get` returns `ActionHandler | undefined`, and calling
     * it optionally would hand every case below an `undefined` in place of the
     * call it meant to make: a screen domain that registered no handler at all
     * then fails as whatever shape each assertion happens to reject, or does not
     * fail, instead of as the missing registration it is.
     */
    function handlerFor(handlers: Map<string, ActionHandler>, actionTypeId: string): ActionHandler {
      const handler = handlers.get(actionTypeId);
      if (!handler) {
        throw new Error(`the screen domain registered no handler for '${actionTypeId}'`);
      }
      return handler;
    }

    beforeEach(() => {
      vi.spyOn(console, 'warn').mockImplementation(() => {});
    });

    it('applies the theme a set_theme action names through the host themes plugin', async () => {
      const changeTheme = vi.fn();
      const { CHROME_SET_THEME } = await import('./chrome-actions');

      const handlers = await chromeHandlersFor({ changeTheme });
      await handlerFor(handlers, CHROME_SET_THEME).handleAction(CHROME_SET_THEME, {
        themeId: 'dark',
      });

      expect(changeTheme).toHaveBeenCalledWith({ themeId: 'dark' });
    });

    it('collapses the menu a set_menu_collapsed action names through the host layout plugin', async () => {
      const toggleMenuCollapsed = vi.fn();
      const { CHROME_SET_MENU_COLLAPSED } = await import('./chrome-actions');

      const handlers = await chromeHandlersFor({ toggleMenuCollapsed });
      await handlerFor(handlers, CHROME_SET_MENU_COLLAPSED).handleAction(
        CHROME_SET_MENU_COLLAPSED,
        { collapsed: true },
      );

      expect(toggleMenuCollapsed).toHaveBeenCalledWith({ collapsed: true });
    });

    it.each([
      ['set_theme', 'CHROME_SET_THEME', { themeId: 'dark' }],
      ['set_menu_collapsed', 'CHROME_SET_MENU_COLLAPSED', { collapsed: true }],
    ] as const)(
      'resolves %s on a host that runs no plugin for it, leaving the chain to continue',
      async (_name, constantName, payload) => {
        const chromeActions = await import('./chrome-actions');
        const actionTypeId = chromeActions[constantName];

        // An empty `actions` surface is the shell that opted into neither the
        // themes nor the layout plugin — the only case these handlers still
        // guard against.
        const handlers = await chromeHandlersFor({});

        await expect(
          handlerFor(handlers, actionTypeId).handleAction(actionTypeId, payload),
        ).resolves.toBeUndefined();
      },
    );

    it('refuses a set_theme payload carrying no theme id rather than driving the plugin with it', async () => {
      const changeTheme = vi.fn();
      const { CHROME_SET_THEME } = await import('./chrome-actions');

      const handlers = await chromeHandlersFor({ changeTheme });

      // The action schema marks `themeId` required, so the mediator refuses
      // this action before any handler sees it; reaching the throw means schema
      // and handler have drifted apart.
      expect(() =>
        handlerFor(handlers, CHROME_SET_THEME).handleAction(CHROME_SET_THEME, {}),
      ).toThrow(/no string themeId/);
      expect(changeTheme).not.toHaveBeenCalled();
    });
  });

  describe('manifestsUrl', () => {
    it('reads the aggregate next to the shell at the root of a domain', async () => {
      const { manifestsUrl } = await import('./bootstrap');

      expect(manifestsUrl('./', 'https://example.com/assets/index-a1b2c3.js')).toBe(
        'https://example.com/generated-mfe-manifests.json',
      );
    });

    it('reads the aggregate next to the shell under a sub-path', async () => {
      const { manifestsUrl } = await import('./bootstrap');

      expect(manifestsUrl('./', 'https://example.com/apps/console/assets/index-a1b2c3.js')).toBe(
        'https://example.com/apps/console/generated-mfe-manifests.json',
      );
    });

    it('uses an absolute base (the dev server) as it is', async () => {
      const { manifestsUrl } = await import('./bootstrap');

      expect(manifestsUrl('/', 'http://localhost:5173/src-app/app/mfe/bootstrap.ts')).toBe(
        'http://localhost:5173/generated-mfe-manifests.json',
      );
    });
  });

  describe('screen load failure report', () => {
    const MOUNT_EXT = 'gts.frontx.mfes.comm.action.v1~frontx.mfes.ext.mount_ext.v1~';

    async function screenMountHandler(): Promise<ActionHandler> {
      fetchSpy.mockResolvedValue(new Response('[]', { status: 200 }));
      vi.spyOn(console, 'warn').mockImplementation(() => {});
      const { bootstrapMFE } = await loadBootstrap();
      await bootstrapMFE(mockApp as never);
      const handlers = new Map<string, ActionHandler>();
      const [, screenFactory] = registerDomain.mock.calls[0];
      screenFactory.build({
        mounter: {},
        registerHandler: (actionTypeId: string, handler: ActionHandler) => {
          handlers.set(actionTypeId, handler);
        },
      });
      const handler = handlers.get(MOUNT_EXT);
      if (!handler) throw new Error('the screen domain registered no mount handler');
      return handler;
    }

    it.each([
      [{ subject: 'ext.orders' }, 'push'],
      [{ subject: 'ext.orders', history: 'push' }, 'push'],
      [{ subject: 'ext.orders', history: 'replace' }, 'replace'],
      [{ subject: 'ext.orders', history: 'none' }, 'none'],
    ])('reports a failed mount of %j with history intent %s and still fails the action', async (payload, history) => {
      const handler = await screenMountHandler();
      const { screenLoadFailure } = await import('./screenLoadFailure');
      exclusiveMount.mockRejectedValueOnce(new Error('remote unreachable'));

      await expect(handler.handleAction(MOUNT_EXT, payload)).rejects.toThrow('remote unreachable');

      expect(screenLoadFailure.current()).toEqual({ extensionId: 'ext.orders', history });
    });

    it('ignores an earlier mount that settles after a later one, whichever way each ends', async () => {
      const handler = await screenMountHandler();
      const { screenLoadFailure } = await import('./screenLoadFailure');
      let failEarlier: (error: Error) => void = () => {};
      exclusiveMount.mockImplementationOnce(
        () => new Promise<void>((_resolve, reject) => {
          failEarlier = reject;
        }),
      );
      const earlier = handler.handleAction(MOUNT_EXT, { subject: 'ext.slow' });
      await handler.handleAction(MOUNT_EXT, { subject: 'ext.fast' });

      failEarlier(new Error('remote unreachable'));
      await expect(earlier).rejects.toThrow('remote unreachable');

      expect(screenLoadFailure.current()).toBeUndefined();
    });

    it('reports nothing for a mount that fails after a history step left its address', async () => {
      const handler = await screenMountHandler();
      const { screenLoadFailure } = await import('./screenLoadFailure');
      let fail: (error: Error) => void = () => {};
      exclusiveMount.mockImplementationOnce(
        () => new Promise<void>((_resolve, reject) => {
          fail = reject;
        }),
      );
      const pending = handler.handleAction(MOUNT_EXT, { subject: 'ext.orders' });

      screenLoadFailure.leave();
      fail(new Error('remote unreachable'));
      await expect(pending).rejects.toThrow('remote unreachable');

      expect(screenLoadFailure.current()).toBeUndefined();
    });

    it('clears the report as soon as the next mount starts', async () => {
      const handler = await screenMountHandler();
      const { screenLoadFailure } = await import('./screenLoadFailure');
      exclusiveMount.mockRejectedValueOnce(new Error('remote unreachable'));
      await expect(handler.handleAction(MOUNT_EXT, { subject: 'ext.orders' })).rejects.toThrow();
      exclusiveMount.mockImplementationOnce(() => new Promise<void>(() => {}));

      void handler.handleAction(MOUNT_EXT, { subject: 'ext.billing' });

      expect(screenLoadFailure.current()).toBeUndefined();
    });
  });
});
