/**
 * Unit tests for auth plugin
 *
 * Covers:
 * 1. Bearer header attached when provider session is bearer token.
 * 2. Cookie-session credentials enabled only for relative URLs and allowlisted origins.
 * 3. Refresh+retry on 401: calls ctx.retry once with new Authorization.
 * 4. Custom transport binder is used and default binding is not.
 * 5. app.auth surface exists and delegates methods.
 * 6. CSRF header attached when csrfHeaderName + session.csrfToken are set.
 * 7. provider.onTransportError invoked on every transport error.
 * 8. Cookie session refresh path: retry without header override.
 * 9. Refresh dedup: concurrent 401s share a single in-flight refresh promise.
 * 10. provider.destroy() called on app.destroy().
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { RestPlugin, RestPluginHooks, RestRequestContext } from '@gears-frontx/api';
import type {
  AccessEvaluation,
  AuthProvider,
  AuthSession,
  AuthState,
  AuthStateListener,
  AuthTransition,
} from '@gears-frontx/auth';
import type { AuthRuntime, AuthTransportBinder } from '../src/plugins/auth';

// One app per runtime: every test loads its own module copy.
let apiRegistry: typeof import('@gears-frontx/api').apiRegistry;
let RestProtocol: typeof import('@gears-frontx/api').RestProtocol;
let createStore: typeof import('@gears-frontx/state').createStore;
let createFrontX: typeof import('../src/createFrontX').createFrontX;
let auth: typeof import('../src/plugins/auth').auth;
let frontxApiTransport: typeof import('../src/plugins/auth').frontxApiTransport;

beforeEach(async () => {
  vi.resetModules();
  ({ apiRegistry, RestProtocol } = await import('@gears-frontx/api'));
  ({ createStore } = await import('@gears-frontx/state'));
  ({ createFrontX } = await import('../src/createFrontX'));
  ({ auth, frontxApiTransport } = await import('../src/plugins/auth'));
});

/** Concrete auth transport plugins implement hooks; `RestPlugin` instance type omits optional hook keys. */
type AuthRestPlugin = RestPlugin & Pick<RestPluginHooks, 'onRequest' | 'onResponse' | 'onError'>;

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

function makeBearerProvider(
  token: string,
  refresh?: AuthProvider['refresh'],
): AuthProvider {
  return {
    getSession: vi.fn().mockResolvedValue({ kind: 'bearer', token } satisfies AuthSession),
    checkAuth: vi.fn().mockResolvedValue({ authenticated: true }),
    logout: vi.fn().mockResolvedValue({ type: 'none' }),
    ...(refresh ? { refresh } : {}),
  };
}

function makeCookieProvider(): AuthProvider {
  return {
    getSession: vi.fn().mockResolvedValue({ kind: 'cookie' } satisfies AuthSession),
    checkAuth: vi.fn().mockResolvedValue({ authenticated: true }),
    logout: vi.fn().mockResolvedValue({ type: 'none' }),
  };
}

function makeNullSessionProvider(): AuthProvider {
  return {
    getSession: vi.fn().mockResolvedValue(null),
    checkAuth: vi.fn().mockResolvedValue({ authenticated: false }),
    logout: vi.fn().mockResolvedValue({ type: 'none' }),
  };
}

/** Use frontxApiTransport directly to capture the internal plugin instance. */
function capturePlugin(
  provider: AuthProvider,
  opts?: { allowedCookieOrigins?: string[]; csrfHeaderName?: string },
): AuthRestPlugin {
  const binder = frontxApiTransport();
  let captured: AuthRestPlugin | null = null;

  binder({
    provider,
    allowedCookieOrigins: opts?.allowedCookieOrigins,
    csrfHeaderName: opts?.csrfHeaderName,
    addRestPlugin: (p: RestPlugin) => {
      captured = p as AuthRestPlugin;
    },
    removeRestPlugin: vi.fn(),
  });

  if (!captured) throw new Error('addRestPlugin was not called by binder');
  return captured;
}

function makeReqCtx(url: string, headers: Record<string, string> = {}): RestRequestContext {
  return { method: 'GET', url, headers };
}

// ---------------------------------------------------------------------------
// Suite
// ---------------------------------------------------------------------------

describe('auth plugin', () => {
  beforeEach(() => {
    apiRegistry.reset();
    createStore({});
  });

  afterEach(() => {
    apiRegistry.reset();
  });

  // -------------------------------------------------------------------------
  // 1. Bearer header
  // -------------------------------------------------------------------------
  describe('bearer session', () => {
    it('attaches Authorization: Bearer header when provider returns bearer token', async () => {
      const plugin = capturePlugin(makeBearerProvider('tok-abc'));

      const result = (await plugin.onRequest?.(makeReqCtx('/api'))) as RestRequestContext;

      expect(result.headers['Authorization']).toBe('Bearer tok-abc');
    });

    it('passes through unmodified when session is null', async () => {
      const plugin = capturePlugin(makeNullSessionProvider());
      const ctx = makeReqCtx('/api');

      const result = (await plugin.onRequest?.(ctx)) as RestRequestContext;

      expect(result.headers['Authorization']).toBeUndefined();
    });
  });

  // -------------------------------------------------------------------------
  // 2. Cookie-session credentials
  // -------------------------------------------------------------------------
  describe('cookie session credentials', () => {
    it('sets withCredentials=true for relative URLs', async () => {
      const plugin = capturePlugin(makeCookieProvider());

      const result = (await plugin.onRequest?.(makeReqCtx('/relative/path'))) as RestRequestContext;

      expect(result.withCredentials).toBe(true);
    });

    it('does NOT set withCredentials for absolute URLs not in allowlist', async () => {
      const plugin = capturePlugin(makeCookieProvider(), {
        allowedCookieOrigins: ['https://trusted.example.com'],
      });

      const result = (await plugin.onRequest?.(
        makeReqCtx('https://other.example.com/api'),
      )) as RestRequestContext;

      expect(result.withCredentials).toBeFalsy();
    });

    it('sets withCredentials=true for absolute URLs from allowlisted origins', async () => {
      const plugin = capturePlugin(makeCookieProvider(), {
        allowedCookieOrigins: ['https://trusted.example.com'],
      });

      const result = (await plugin.onRequest?.(
        makeReqCtx('https://trusted.example.com/api'),
      )) as RestRequestContext;

      expect(result.withCredentials).toBe(true);
    });

    // -----------------------------------------------------------------------
    // 6. CSRF header
    // -----------------------------------------------------------------------
    it('attaches csrfHeaderName header when csrfHeaderName is configured and session has csrfToken', async () => {
      const provider: AuthProvider = {
        getSession: vi.fn().mockResolvedValue({ kind: 'cookie', csrfToken: 'csrf-abc' } satisfies AuthSession),
        checkAuth: vi.fn().mockResolvedValue({ authenticated: true }),
        logout: vi.fn().mockResolvedValue({ type: 'none' }),
      };
      const plugin = capturePlugin(provider, { csrfHeaderName: 'X-CSRF-Token' });

      const result = (await plugin.onRequest?.(makeReqCtx('/api'))) as RestRequestContext;

      expect(result.withCredentials).toBe(true);
      expect(result.headers['X-CSRF-Token']).toBe('csrf-abc');
    });

    it('does not attach csrf header when csrfToken is absent', async () => {
      const plugin = capturePlugin(makeCookieProvider(), { csrfHeaderName: 'X-CSRF-Token' });

      const result = (await plugin.onRequest?.(makeReqCtx('/api'))) as RestRequestContext;

      expect(result.withCredentials).toBe(true);
      expect(result.headers['X-CSRF-Token']).toBeUndefined();
    });
  });

  // -------------------------------------------------------------------------
  // 3. 401 refresh + retry
  // -------------------------------------------------------------------------
  describe('401 refresh and retry', () => {
    it('calls provider.refresh then ctx.retry with refreshed credentials on 401 (retryCount=0)', async () => {
      const refreshFn = vi.fn().mockResolvedValue({ kind: 'bearer', token: 'new-tok' } satisfies AuthSession);
      const plugin = capturePlugin(makeBearerProvider('old-tok', refreshFn));

      const errCtx = {
        error: new Error('HTTP 401'),
        request: makeReqCtx('/api'),
        response: { status: 401, headers: {}, data: null },
        retryCount: 0,
        retry: vi.fn().mockResolvedValue({ status: 200, headers: {}, data: {} }),
      };

      await plugin.onError?.(errCtx);

      expect(refreshFn).toHaveBeenCalledTimes(1);
      expect(errCtx.retry).toHaveBeenCalledWith({ headers: { Authorization: 'Bearer new-tok' } });
    });

    it('returns error without retry on 401 when retryCount > 0', async () => {
      const refreshFn = vi.fn().mockResolvedValue({ kind: 'bearer', token: 'new-tok' } satisfies AuthSession);
      const plugin = capturePlugin(makeBearerProvider('old-tok', refreshFn));

      const errCtx = {
        error: new Error('HTTP 401'),
        request: makeReqCtx('/api'),
        response: { status: 401, headers: {}, data: null },
        retryCount: 1,
        retry: vi.fn(),
      };

      const result = await plugin.onError?.(errCtx);

      expect(errCtx.retry).not.toHaveBeenCalled();
      expect(result).toBe(errCtx.error);
    });

    it('returns error without retry for non-401 status', async () => {
      const refreshFn = vi.fn().mockResolvedValue({ kind: 'bearer', token: 'new-tok' } satisfies AuthSession);
      const plugin = capturePlugin(makeBearerProvider('old-tok', refreshFn));

      const errCtx = {
        error: new Error('HTTP 500'),
        request: makeReqCtx('/api'),
        response: { status: 500, headers: {}, data: null },
        retryCount: 0,
        retry: vi.fn(),
      };

      const result = await plugin.onError?.(errCtx);

      expect(errCtx.retry).not.toHaveBeenCalled();
      expect(result).toBe(errCtx.error);
    });

    it('returns error when provider has no refresh method', async () => {
      const plugin = capturePlugin(makeBearerProvider('tok')); // no refresh

      const errCtx = {
        error: new Error('HTTP 401'),
        request: makeReqCtx('/api'),
        response: { status: 401, headers: {}, data: null },
        retryCount: 0,
        retry: vi.fn(),
      };

      const result = await plugin.onError?.(errCtx);

      expect(errCtx.retry).not.toHaveBeenCalled();
      expect(result).toBe(errCtx.error);
    });

    // -----------------------------------------------------------------------
    // 8. Cookie session refresh path
    // -----------------------------------------------------------------------
    it('calls provider.refresh and retries without header override on 401 with cookie session', async () => {
      const refreshFn = vi.fn().mockResolvedValue({ kind: 'cookie' } satisfies AuthSession);
      const provider: AuthProvider = {
        getSession: vi.fn().mockResolvedValue({ kind: 'cookie' } satisfies AuthSession),
        checkAuth: vi.fn().mockResolvedValue({ authenticated: true }),
        logout: vi.fn().mockResolvedValue({ type: 'none' }),
        refresh: refreshFn,
      };
      const plugin = capturePlugin(provider);

      const errCtx = {
        error: new Error('HTTP 401'),
        request: makeReqCtx('/api'),
        response: { status: 401, headers: {}, data: null },
        retryCount: 0,
        retry: vi.fn().mockResolvedValue({ status: 200, headers: {}, data: {} }),
      };

      await plugin.onError?.(errCtx);

      expect(refreshFn).toHaveBeenCalledTimes(1);
      expect(errCtx.retry).toHaveBeenCalledTimes(1);
      // Cookie retry must not inject any Authorization header
      expect(errCtx.retry).toHaveBeenCalledWith();
    });

    // -----------------------------------------------------------------------
    // 9. Refresh dedup
    // -----------------------------------------------------------------------
    it('deduplicates concurrent 401 refresh calls into a single in-flight promise', async () => {
      let resolveRefresh!: (value: AuthSession) => void;
      const pendingRefresh = new Promise<AuthSession>((resolve) => {
        resolveRefresh = resolve;
      });
      const refreshFn = vi.fn().mockReturnValue(pendingRefresh);
      const plugin = capturePlugin(makeBearerProvider('old-tok', refreshFn));

      const makeErrCtx = () => {
        return {
          error: new Error('HTTP 401'),
          request: makeReqCtx('/api'),
          response: { status: 401, headers: {}, data: null },
          retryCount: 0,
          retry: vi.fn().mockResolvedValue({ status: 200, headers: {}, data: {} }),
        };
      };

      const errCtx1 = makeErrCtx();
      const errCtx2 = makeErrCtx();

      // Start both concurrently before resolving refresh
      const p1 = plugin.onError?.(errCtx1);
      const p2 = plugin.onError?.(errCtx2);

      resolveRefresh({ kind: 'bearer', token: 'new-tok' });

      await Promise.all([p1, p2]);

      expect(refreshFn).toHaveBeenCalledTimes(1);
      expect(errCtx1.retry).toHaveBeenCalledWith({ headers: { Authorization: 'Bearer new-tok' } });
      expect(errCtx2.retry).toHaveBeenCalledWith({ headers: { Authorization: 'Bearer new-tok' } });
    });
  });

  // -------------------------------------------------------------------------
  // 4. Custom transport binder
  // -------------------------------------------------------------------------
  describe('custom transport binder', () => {
    it('invokes the custom binder on app init instead of default', () => {
      const customBinder: AuthTransportBinder = vi.fn().mockReturnValue({ destroy: vi.fn() });
      const provider = makeBearerProvider('tok');

      const app = createFrontX().use(auth({ provider, transport: customBinder })).build();

      expect(customBinder).toHaveBeenCalledTimes(1);
      expect(customBinder).toHaveBeenCalledWith(expect.objectContaining({ provider }));

      app.destroy();
    });

    it('does not add default AuthRestPlugin when custom binder does not call addRestPlugin', () => {
      // Custom binder that intentionally does not call addRestPlugin
      const customBinder: AuthTransportBinder = (_args: Parameters<AuthTransportBinder>[0]) => {
        return { destroy: vi.fn() };
      };
      const provider = makeBearerProvider('tok');

      const app = createFrontX().use(auth({ provider, transport: customBinder })).build();

      expect(apiRegistry.plugins.getAll(RestProtocol)).toHaveLength(0);

      app.destroy();
    });

    it('default binding registers one RestPlugin in apiRegistry when no custom binder given', () => {
      const provider = makeBearerProvider('tok');

      const app = createFrontX().use(auth({ provider })).build();

      expect(apiRegistry.plugins.getAll(RestProtocol)).toHaveLength(1);

      app.destroy();
    });
  });

  // -------------------------------------------------------------------------
  // 5. app.auth surface
  // -------------------------------------------------------------------------
  describe('app.auth surface', () => {
    it('is defined on the built app', () => {
      const provider = makeBearerProvider('tok');
      const app = createFrontX().use(auth({ provider })).build();

      expect(app.auth).toBeDefined();

      app.destroy();
    });

    it('exposes provider reference via app.auth.provider', () => {
      const provider = makeBearerProvider('tok');
      const app = createFrontX().use(auth({ provider })).build();

      expect(app.auth?.provider).toBe(provider);

      app.destroy();
    });

    it('app.auth.getSession delegates to provider.getSession', async () => {
      const provider = makeBearerProvider('tok');
      const app = createFrontX().use(auth({ provider })).build();
      const ctx = {};

      await app.auth?.getSession(ctx);

      expect(provider.getSession).toHaveBeenCalledWith(ctx);

      app.destroy();
    });

    it('app.auth.checkAuth delegates to provider.checkAuth', async () => {
      const provider = makeBearerProvider('tok');
      const app = createFrontX().use(auth({ provider })).build();

      await app.auth?.checkAuth();

      expect(provider.checkAuth).toHaveBeenCalled();

      app.destroy();
    });

    it('app.auth.logout delegates to provider.logout', async () => {
      const provider = makeBearerProvider('tok');
      const app = createFrontX().use(auth({ provider })).build();

      await app.auth?.logout();

      expect(provider.logout).toHaveBeenCalled();

      app.destroy();
    });

    it('app.auth.logout emits AuthEvents.LoggedOut once the provider logout resolves', async () => {
      const { eventBus } = await import('@gears-frontx/state');
      const { AuthEvents } = await import('../src/plugins/auth');
      let finishLogout!: () => void;
      const provider: AuthProvider = {
        ...makeBearerProvider('tok'),
        logout: vi.fn(
          () =>
            new Promise<AuthTransition>((resolve) => {
              finishLogout = () => resolve({ type: 'none' });
            }),
        ),
      };
      const loggedOut = vi.fn();
      eventBus.on(AuthEvents.LoggedOut, loggedOut);
      const app = createFrontX().use(auth({ provider })).build();

      const logout = app.auth?.logout();
      await Promise.resolve();
      expect(loggedOut).not.toHaveBeenCalled();

      finishLogout();
      await expect(logout).resolves.toEqual({ type: 'none' });
      expect(loggedOut).toHaveBeenCalledTimes(1);

      app.destroy();
    });

    it('app.auth.logout emits AuthEvents.LoggedOut and rethrows when the provider logout rejects', async () => {
      const { eventBus } = await import('@gears-frontx/state');
      const { AuthEvents } = await import('../src/plugins/auth');
      const provider: AuthProvider = {
        ...makeBearerProvider('tok'),
        logout: vi.fn().mockRejectedValue(new Error('identity provider down')),
      };
      const loggedOut = vi.fn();
      eventBus.on(AuthEvents.LoggedOut, loggedOut);
      const app = createFrontX().use(auth({ provider })).build();

      await expect(app.auth?.logout()).rejects.toThrow('identity provider down');
      expect(loggedOut).toHaveBeenCalledTimes(1);

      app.destroy();
    });

    it.each([
      {
        method: 'login' as const,
        call: (runtime: AuthRuntime | undefined) =>
          runtime?.login?.({ type: 'password', payload: { user: 'b' } }),
      },
      {
        method: 'handleCallback' as const,
        call: (runtime: AuthRuntime | undefined) =>
          runtime?.handleCallback?.({ params: { code: 'c' } }),
      },
    ])('app.auth.$method emits AuthEvents.LoggedIn only when the provider call resolves', async ({ method, call }) => {
      const { eventBus } = await import('@gears-frontx/state');
      const { AuthEvents } = await import('../src/plugins/auth');
      const providerCall = vi
        .fn()
        .mockRejectedValueOnce(new Error('bad credentials'))
        .mockResolvedValueOnce({ type: 'none' });
      const loggedIn = vi.fn();
      eventBus.on(AuthEvents.LoggedIn, loggedIn);
      const app = createFrontX()
        .use(auth({ provider: { ...makeBearerProvider('tok'), [method]: providerCall } }))
        .build();

      await expect(call(app.auth)).rejects.toThrow('bad credentials');
      expect(loggedIn).not.toHaveBeenCalled();

      await expect(call(app.auth)).resolves.toEqual({ type: 'none' });
      expect(loggedIn).toHaveBeenCalledTimes(1);

      app.destroy();
    });

    it.each([
      { method: 'login' as const, transition: { type: 'redirect' as const, redirectUrl: '/idp/authorize' }, emits: false },
      { method: 'handleCallback' as const, transition: { type: 'redirect' as const, redirectUrl: '/app' }, emits: true },
    ])(
      'app.auth.$method resolving to a redirect emits AuthEvents.LoggedIn: $emits',
      async ({ method, transition, emits }) => {
        const { eventBus } = await import('@gears-frontx/state');
        const { AuthEvents } = await import('../src/plugins/auth');
        const loggedIn = vi.fn();
        eventBus.on(AuthEvents.LoggedIn, loggedIn);
        const app = createFrontX()
          .use(auth({ provider: { ...makeBearerProvider('tok'), [method]: vi.fn().mockResolvedValue(transition) } }))
          .build();

        const result =
          method === 'login'
            ? app.auth?.login?.({ type: 'oauth', payload: {} })
            : app.auth?.handleCallback?.({ params: { code: 'c' } });
        await expect(result).resolves.toEqual(transition);
        expect(loggedIn).toHaveBeenCalledTimes(emits ? 1 : 0);

        app.destroy();
      }
    );

    it('passes through optional canAccess and subscribe when implemented', async () => {
      const unsubscribe = vi.fn();
      const provider: AuthProvider = {
        ...makeBearerProvider('tok'),
        canAccess: vi.fn().mockResolvedValue('allow'),
        subscribe: vi.fn().mockReturnValue(unsubscribe),
      };
      const app = createFrontX().use(auth({ provider })).build();

      const decision = await app.auth?.canAccess?.({ action: 'read', resource: 'x' });
      expect(decision).toBe('allow');
      expect(provider.canAccess).toHaveBeenCalledTimes(1);

      const listener = () => undefined;
      const unsub = app.auth?.subscribe?.(listener);
      expect(unsub).toBe(unsubscribe);
      expect(provider.subscribe).toHaveBeenCalledWith(listener);

      app.destroy();
    });

    // -----------------------------------------------------------------------
    // 10. provider.destroy() on app.destroy()
    // -----------------------------------------------------------------------
    it('calls provider.destroy() when app.destroy() is called', () => {
      const destroyFn = vi.fn();
      const provider: AuthProvider = { ...makeBearerProvider('tok'), destroy: destroyFn };
      const app = createFrontX().use(auth({ provider })).build();

      app.destroy();

      expect(destroyFn).toHaveBeenCalledTimes(1);
    });

    it('does not throw when provider has no destroy method', () => {
      const provider = makeBearerProvider('tok'); // no destroy
      const app = createFrontX().use(auth({ provider })).build();

      expect(() => {
        app.destroy();
      }).not.toThrow();
    });
  });

  // -------------------------------------------------------------------------
  // Session changes the provider drives on its own
  // -------------------------------------------------------------------------
  describe('provider-driven session changes', () => {
    type StreamProvider = AuthProvider & {
      push: (state: AuthState) => void;
      signInAs: (sub: string) => void;
      isListening: () => boolean;
    };

    /**
     * Provider signed in as `account-a`; `getIdentity` reports the current account when enabled.
     * With `stream: false` it has no `subscribe`, so the plugin learns the session only from refreshes.
     */
    function makeStreamProvider(options: { identity: boolean; stream?: boolean }): StreamProvider {
      let listener: AuthStateListener | null = null;
      let sub = 'account-a';
      const provider: StreamProvider = {
        ...makeBearerProvider('tok'),
        login: vi.fn().mockResolvedValue({ type: 'none' }),
        handleCallback: vi.fn().mockResolvedValue({ type: 'none' }),
        refresh: vi.fn().mockResolvedValue({ kind: 'bearer', token: 'tok' } satisfies AuthSession),
        subscribe: vi.fn((next: AuthStateListener) => {
          listener = next;
          return () => {
            listener = null;
          };
        }),
        push: (state) => {
          listener?.({ state });
        },
        signInAs: (next) => {
          sub = next;
        },
        isListening: () => listener !== null,
      };
      if (options.identity) {
        provider.getIdentity = vi.fn(async () => ({ sub }));
      }
      if (options.stream === false) {
        delete provider.subscribe;
      }
      return provider;
    }

    async function buildWithEvents(provider: AuthProvider) {
      const { eventBus } = await import('@gears-frontx/state');
      const { AuthEvents } = await import('../src/plugins/auth');
      const loggedIn = vi.fn();
      const loggedOut = vi.fn();
      eventBus.on(AuthEvents.LoggedIn, loggedIn);
      eventBus.on(AuthEvents.LoggedOut, loggedOut);
      const app = createFrontX().use(auth({ provider })).build();
      return { app, loggedIn, loggedOut };
    }

    /** Let identity lookups started by a state event settle. */
    async function settle(): Promise<void> {
      await new Promise<void>((resolve) => {
        setTimeout(resolve, 0);
      });
    }

    function deferred<T>() {
      let resolve!: (value: T) => void;
      let reject!: (error: unknown) => void;
      const promise = new Promise<T>((res, rej) => {
        resolve = res;
        reject = rej;
      });
      return { promise, resolve, reject };
    }

    function restPlugin(): AuthRestPlugin {
      return apiRegistry.plugins.getAll(RestProtocol)[0] as AuthRestPlugin;
    }

    function fail401(plugin: AuthRestPlugin, retry = vi.fn(async () => ({ status: 200, headers: {}, data: {} }))) {
      const result = plugin.onError?.({
        error: new Error('HTTP 401'),
        request: makeReqCtx('/api'),
        response: { status: 401, headers: {}, data: null },
        retryCount: 0,
        retry,
      });
      return { result, retry };
    }

    type Step = AuthState | { switchTo: string };

    it.each<{ name: string; identity: boolean; signedOutAtInit?: boolean; initFails?: boolean; steps: Step[]; loggedIn: number; loggedOut: number }>([
      { name: 'a session end', identity: true, steps: ['authenticated', 'unauthenticated'], loggedIn: 0, loggedOut: 1 },
      { name: 'a session start', identity: true, signedOutAtInit: true, steps: ['authenticated'], loggedIn: 1, loggedOut: 0 },
      {
        name: 'an account switch',
        identity: true,
        steps: ['authenticated', { switchTo: 'account-b' }, 'authenticated'],
        loggedIn: 1,
        loggedOut: 0,
      },
      { name: 'a repeated event for the same account', identity: true, steps: ['authenticated', 'authenticated'], loggedIn: 0, loggedOut: 0 },
      { name: 'a session end after an init check that rejected', identity: true, initFails: true, steps: ['unauthenticated'], loggedIn: 0, loggedOut: 1 },
      { name: 'loading and error states', identity: true, steps: ['authenticated', 'loading', 'error', 'authenticated'], loggedIn: 0, loggedOut: 0 },
      {
        name: 'an account switch from a provider without getIdentity',
        identity: false,
        steps: ['authenticated', { switchTo: 'account-b' }, 'authenticated'],
        loggedIn: 0,
        loggedOut: 0,
      },
    ])('follows the provider state stream: $name', async ({ identity, signedOutAtInit, initFails, steps, loggedIn, loggedOut }) => {
      const provider = makeStreamProvider({ identity });
      if (signedOutAtInit) vi.mocked(provider.checkAuth).mockResolvedValue({ authenticated: false });
      if (initFails) vi.mocked(provider.checkAuth).mockRejectedValue(new Error('down'));
      const events = await buildWithEvents(provider);

      for (const step of steps) {
        if (typeof step === 'string') {
          provider.push(step);
        } else {
          provider.signInAs(step.switchTo);
        }
        await settle();
      }

      expect(events.loggedIn).toHaveBeenCalledTimes(loggedIn);
      expect(events.loggedOut).toHaveBeenCalledTimes(loggedOut);
      events.app.destroy();
    });

    it.each(['login', 'handleCallback', 'session start'] as const)(
      'clears for an account switch that lands between the %s clear and its first identity lookup',
      async (trigger) => {
      const provider = makeStreamProvider({ identity: true });
      if (trigger === 'session start') vi.mocked(provider.checkAuth).mockResolvedValue({ authenticated: false });
      const { app, loggedIn } = await buildWithEvents(provider);
      await settle();

      const first = deferred<{ sub: string }>();
      vi.mocked(provider.getIdentity!).mockReturnValueOnce(first.promise);
      if (trigger === 'login') {
        await app.auth?.login?.({ type: 'password', payload: {} });
      } else if (trigger === 'handleCallback') {
        await app.auth?.handleCallback?.({ params: { code: 'c' } });
      } else {
        provider.push('authenticated');
      }
      await settle();
      expect(loggedIn).toHaveBeenCalledTimes(1);

      provider.signInAs('account-b');
      provider.push('authenticated');
      await settle();
      first.resolve({ sub: 'account-a' });
      await settle();

      expect(loggedIn).toHaveBeenCalledTimes(2);
      app.destroy();
    }
    );

    it.each(['login', 'handleCallback'] as const)(
      'app.auth.%s clears once more, by design, when the provider echoes the new session',
      async (method) => {
      const provider = makeStreamProvider({ identity: true });
      const { app, loggedIn } = await buildWithEvents(provider);
      provider.push('authenticated');
      await settle();

      provider.signInAs('account-b');
      if (method === 'login') {
        await app.auth?.login?.({ type: 'password', payload: {} });
      } else {
        await app.auth?.handleCallback?.({ params: { code: 'c' } });
      }
      provider.push('authenticated');
      await settle();
      // A report after the clear and before its identity lookup is not trusted as the baseline.
      expect(loggedIn).toHaveBeenCalledTimes(2);

      // The echo sets the baseline: a repeat is silent, a switch still clears.
      provider.push('authenticated');
      await settle();
      expect(loggedIn).toHaveBeenCalledTimes(2);
      provider.signInAs('account-c');
      provider.push('authenticated');
      await settle();
      expect(loggedIn).toHaveBeenCalledTimes(3);

      app.destroy();
    }
    );

    it('app.auth.logout clears once even when the provider echoes the session end', async () => {
      const provider = makeStreamProvider({ identity: true });
      const { app, loggedIn, loggedOut } = await buildWithEvents(provider);
      provider.push('authenticated');
      await settle();

      await app.auth?.logout();
      provider.push('unauthenticated');
      await settle();
      expect(loggedOut).toHaveBeenCalledTimes(1);

      // The stream is still followed after the echo.
      provider.push('authenticated');
      await settle();
      expect(loggedIn).toHaveBeenCalledTimes(1);

      app.destroy();
    });

    it.each([
      { name: 'another identity', noSession: false, switchTo: 'account-b', loggedIn: 1, loggedOut: 0 },
      { name: 'the same identity', noSession: false, switchTo: null, loggedIn: 0, loggedOut: 0 },
      { name: 'no session', noSession: true, switchTo: null, loggedIn: 0, loggedOut: 1 },
    ] as const)('app.auth.refresh landing on $name', async ({ noSession, switchTo, loggedIn, loggedOut }) => {
      const provider = makeStreamProvider({ identity: true });
      if (noSession) {
        vi.mocked(provider.refresh!).mockResolvedValue(null);
      }
      const events = await buildWithEvents(provider);
      provider.push('authenticated');
      await settle();

      if (switchTo) provider.signInAs(switchTo);
      await events.app.auth?.refresh?.();

      expect(events.loggedIn).toHaveBeenCalledTimes(loggedIn);
      expect(events.loggedOut).toHaveBeenCalledTimes(loggedOut);
      events.app.destroy();
    });

    it('a 401 refresh that lands on another identity clears before the retry', async () => {
      const provider = makeStreamProvider({ identity: true });
      const { app, loggedIn } = await buildWithEvents(provider);
      provider.push('authenticated');
      await settle();
      const plugin = apiRegistry.plugins.getAll(RestProtocol)[0] as AuthRestPlugin;

      provider.signInAs('account-b');
      const retry = vi.fn(async () => {
        expect(loggedIn).toHaveBeenCalledTimes(1);
        return { status: 200, headers: {}, data: {} };
      });
      await plugin.onError?.({
        error: new Error('HTTP 401'),
        request: makeReqCtx('/api'),
        response: { status: 401, headers: {}, data: null },
        retryCount: 0,
        retry,
      });

      expect(retry).toHaveBeenCalledTimes(1);
      expect(loggedIn).toHaveBeenCalledTimes(1);
      app.destroy();
    });

    it.each([
      { name: 'rejects', fail: (lookup: ReturnType<typeof vi.fn>) => lookup.mockRejectedValueOnce(new Error('down')) },
      { name: 'resolves to no identity', fail: (lookup: ReturnType<typeof vi.fn>) => lookup.mockResolvedValueOnce(null) },
      { name: 'resolves without a sub', fail: (lookup: ReturnType<typeof vi.fn>) => lookup.mockResolvedValueOnce({}) },
    ])('treats an identity lookup that $name during an authenticated session as a change', async ({ fail }) => {
      const provider = makeStreamProvider({ identity: true });
      const { app, loggedIn } = await buildWithEvents(provider);
      provider.push('authenticated');
      await settle();

      provider.signInAs('account-b');
      fail(vi.mocked(provider.getIdentity!));
      provider.push('authenticated');
      await settle();

      expect(loggedIn).toHaveBeenCalledTimes(1);
      app.destroy();
    });

    it('catches a switch after login when the identity lookup at login failed', async () => {
      const provider = makeStreamProvider({ identity: true });
      const { app, loggedIn } = await buildWithEvents(provider);
      provider.push('authenticated');
      await settle();

      vi.mocked(provider.getIdentity!).mockRejectedValueOnce(new Error('down'));
      await app.auth?.login?.({ type: 'password', payload: {} });
      await settle();
      provider.signInAs('account-b');
      provider.push('authenticated');
      await settle();

      expect(loggedIn).toHaveBeenCalledTimes(2);
      app.destroy();
    });

    it('catches a switch that arrives while the first identity lookup is still pending', async () => {
      const provider = makeStreamProvider({ identity: true });
      const first = deferred<{ sub: string }>();
      vi.mocked(provider.getIdentity!).mockReturnValueOnce(first.promise);
      const { app, loggedIn } = await buildWithEvents(provider);
      provider.push('authenticated');

      provider.signInAs('account-b');
      provider.push('authenticated');
      await settle();
      first.resolve({ sub: 'account-a' });
      await settle();

      expect(loggedIn).toHaveBeenCalledTimes(1);
      app.destroy();
    });

    it('drops an identity lookup that a newer state event overtook', async () => {
      const provider = makeStreamProvider({ identity: true });
      const { app, loggedIn } = await buildWithEvents(provider);
      provider.push('authenticated');
      await settle();

      const stale = deferred<{ sub: string }>();
      vi.mocked(provider.getIdentity!).mockReturnValueOnce(stale.promise);
      provider.push('authenticated');
      provider.signInAs('account-b');
      provider.push('authenticated');
      await settle();
      stale.resolve({ sub: 'account-a' });
      await settle();

      expect(loggedIn).toHaveBeenCalledTimes(1);
      app.destroy();
    });

    it('times out a hanging identity lookup, clears, and keeps 401 retries flowing', async () => {
      const provider = makeStreamProvider({ identity: true });
      const { app, loggedIn } = await buildWithEvents(provider);
      provider.push('authenticated');
      await settle();
      vi.useFakeTimers();
      try {
        vi.mocked(provider.getIdentity!).mockImplementation(() => new Promise(() => undefined));
        const first = fail401(restPlugin());
        const second = fail401(restPlugin());
        await vi.advanceTimersByTimeAsync(60_000);
        await Promise.all([first.result, second.result]);

        expect(first.retry).toHaveBeenCalledTimes(1);
        expect(second.retry).toHaveBeenCalledTimes(1);
        expect(loggedIn).toHaveBeenCalledTimes(1);

        const later = fail401(restPlugin());
        await vi.advanceTimersByTimeAsync(60_000);
        await later.result;
        expect(later.retry).toHaveBeenCalledTimes(1);
        expect(provider.refresh).toHaveBeenCalledTimes(2);
      } finally {
        vi.useRealTimers();
        app.destroy();
      }
    });

    it('does not deadlock when the identity lookup after a 401 refresh gets a 401 itself', async () => {
      const provider = makeStreamProvider({ identity: true });
      const { app, loggedIn } = await buildWithEvents(provider);
      provider.push('authenticated');
      await settle();
      // No timer advances: only a lookup that really completes can let the retry run.
      vi.useFakeTimers();
      try {
        const innerRetry = vi.fn(async () => ({ status: 200, headers: {}, data: {} }));
        vi.mocked(provider.getIdentity!).mockImplementationOnce(async () => {
          await fail401(restPlugin(), innerRetry).result;
          return { sub: 'account-b' };
        });
        const outer = fail401(restPlugin());
        await outer.result;

        expect(innerRetry).toHaveBeenCalledTimes(1);
        expect(outer.retry).toHaveBeenCalledTimes(1);
        expect(loggedIn).toHaveBeenCalledTimes(1);
      } finally {
        vi.useRealTimers();
        app.destroy();
      }
    });

    it.each([
      { name: 'a 401 refresh landing on another account', via: '401', loggedIn: 1, loggedOut: 0 },
      { name: 'app.auth.refresh resolving to no session', via: 'app.auth.refresh', loggedIn: 0, loggedOut: 1 },
    ] as const)('without a state stream, compares $name against the session found at init', async ({ via, loggedIn, loggedOut }) => {
      const provider = makeStreamProvider({ identity: true, stream: false });
      const events = await buildWithEvents(provider);
      await settle();
      expect(events.loggedIn).not.toHaveBeenCalled();
      expect(events.loggedOut).not.toHaveBeenCalled();

      if (via === '401') {
        provider.signInAs('account-b');
        await fail401(restPlugin()).result;
      } else {
        vi.mocked(provider.refresh!).mockResolvedValueOnce(null);
        await events.app.auth?.refresh?.();
      }

      expect(events.loggedIn).toHaveBeenCalledTimes(loggedIn);
      expect(events.loggedOut).toHaveBeenCalledTimes(loggedOut);
      events.app.destroy();
    });

    it('lets a login made during the init lookup win over the stale baseline', async () => {
      const provider = makeStreamProvider({ identity: true, stream: false });
      const initLookup = deferred<{ sub: string }>();
      vi.mocked(provider.getIdentity!).mockReturnValueOnce(initLookup.promise);
      const { app, loggedIn } = await buildWithEvents(provider);
      await settle();

      provider.signInAs('account-b');
      await app.auth?.login?.({ type: 'password', payload: {} });
      await settle();
      initLookup.resolve({ sub: 'account-a' });
      await settle();
      await fail401(restPlugin()).result;

      expect(loggedIn).toHaveBeenCalledTimes(1);
      app.destroy();
    });

    it('emits nothing at init for a provider that replays its state synchronously on subscribe', async () => {
      const provider = makeStreamProvider({ identity: true });
      const subscribe = provider.subscribe!;
      provider.subscribe = vi.fn((next: AuthStateListener) => {
        const unsubscribeProvider = subscribe(next);
        next({ state: 'authenticated' });
        return unsubscribeProvider;
      });
      const { app, loggedIn, loggedOut } = await buildWithEvents(provider);
      await settle();

      expect(loggedIn).not.toHaveBeenCalled();
      expect(loggedOut).not.toHaveBeenCalled();
      app.destroy();
    });

    it('clears for a refresh that resolves to no session before the init check completes', async () => {
      const provider = makeStreamProvider({ identity: true, stream: false });
      const initCheck = deferred<{ authenticated: boolean }>();
      vi.mocked(provider.checkAuth).mockReturnValueOnce(initCheck.promise);
      vi.mocked(provider.refresh!).mockResolvedValueOnce(null);
      const { app, loggedOut } = await buildWithEvents(provider);

      await app.auth?.refresh?.();
      initCheck.resolve({ authenticated: true });
      await settle();

      expect(loggedOut).toHaveBeenCalledTimes(1);
      app.destroy();
    });

    it('clears for a 401 refresh that lands while another identity check is still running', async () => {
      const provider = makeStreamProvider({ identity: true });
      const { app, loggedIn } = await buildWithEvents(provider);
      provider.push('authenticated');
      await settle();

      const firstLookup = deferred<{ sub: string }>();
      vi.mocked(provider.getIdentity!).mockReturnValueOnce(firstLookup.promise);
      const first = fail401(restPlugin());
      await settle();
      provider.signInAs('account-b');
      const second = fail401(restPlugin());
      await settle();
      firstLookup.resolve({ sub: 'account-a' });
      await Promise.all([first.result, second.result]);

      expect(provider.refresh).toHaveBeenCalledTimes(2);
      expect(loggedIn).toHaveBeenCalledTimes(1);
      app.destroy();
    });

    it('clears for an older refresh that resolves to no session after a newer one was applied', async () => {
      const provider = makeStreamProvider({ identity: true });
      const { app, loggedIn, loggedOut } = await buildWithEvents(provider);
      provider.push('authenticated');
      await settle();

      const older = deferred<AuthSession | null>();
      vi.mocked(provider.refresh!).mockReturnValueOnce(older.promise);
      const olderRefresh = app.auth?.refresh?.();
      provider.signInAs('account-b');
      await app.auth?.refresh?.();
      older.resolve(null);
      await olderRefresh;

      expect(loggedIn).toHaveBeenCalledTimes(1);
      // No session is never dropped for ordering while signed in: it fails closed.
      expect(loggedOut).toHaveBeenCalledTimes(1);
      app.destroy();
    });

    it.each([
      {
        name: 'app.auth.refresh',
        run: async (_app: { auth?: AuthRuntime }, error: Error) => {
          await expect(_app.auth!.refresh!()).rejects.toBe(error);
        },
      },
      {
        name: 'the 401 refresh',
        run: async (_app: { auth?: AuthRuntime }) => {
          const failed = fail401(restPlugin());
          await expect(failed.result).resolves.toBeInstanceOf(Error);
          expect(failed.retry).not.toHaveBeenCalled();
        },
      },
    ])('clears once when $name rejects while signed in', async ({ run }) => {
      const provider = makeStreamProvider({ identity: true });
      const error = new Error('refresh failed');
      vi.mocked(provider.refresh!).mockRejectedValue(error);
      const { app, loggedIn, loggedOut } = await buildWithEvents(provider);
      provider.push('authenticated');
      await settle();

      await run(app, error);
      await run(app, error);

      expect(loggedIn).toHaveBeenCalledTimes(1);
      expect(loggedOut).not.toHaveBeenCalled();
      app.destroy();
    });

    it('clears once for an identity that stays unknown, and again when a known one appears', async () => {
      const provider = makeStreamProvider({ identity: true, stream: false });
      const { app, loggedIn } = await buildWithEvents(provider);
      await settle();

      vi.mocked(provider.getIdentity!).mockRejectedValue(new Error('down'));
      await app.auth?.refresh?.();
      await app.auth?.refresh?.();
      await app.auth?.refresh?.();
      vi.mocked(provider.refresh!).mockRejectedValueOnce(new Error('refresh failed'));
      await app.auth?.refresh?.().catch(() => undefined);
      expect(loggedIn).toHaveBeenCalledTimes(1);

      vi.mocked(provider.getIdentity!).mockResolvedValue({ sub: 'account-a' });
      await app.auth?.refresh?.();
      expect(loggedIn).toHaveBeenCalledTimes(2);
      app.destroy();
    });

    it('stops refreshing on a 401 that persists after refreshes, until a request succeeds', async () => {
      const provider = makeStreamProvider({ identity: true });
      vi.mocked(provider.getIdentity!).mockRejectedValue(new Error('userinfo 401'));
      const { app, loggedIn } = await buildWithEvents(provider);
      await settle();
      const plugin = restPlugin();

      const results: unknown[] = [];
      for (let attempt = 0; attempt < 5; attempt += 1) {
        results.push(await fail401(plugin).result);
      }
      expect(provider.refresh).toHaveBeenCalledTimes(2);
      expect(results.slice(2).every((result) => result instanceof Error)).toBe(true);
      expect(loggedIn).toHaveBeenCalledTimes(1);

      await plugin.onResponse?.({ status: 200, headers: {}, data: {} });
      await fail401(plugin).result;
      expect(provider.refresh).toHaveBeenCalledTimes(3);
      app.destroy();
    });

    it('keeps a sign-out reported during init when a login attempt fails before the init check lands', async () => {
      const provider = makeStreamProvider({ identity: true });
      const initCheck = deferred<{ authenticated: boolean }>();
      vi.mocked(provider.checkAuth).mockReturnValueOnce(initCheck.promise);
      vi.mocked(provider.login!).mockRejectedValueOnce(new Error('bad password'));
      const { app, loggedOut } = await buildWithEvents(provider);

      provider.push('unauthenticated');
      await app.auth?.login?.({ type: 'password', payload: {} }).catch(() => undefined);
      initCheck.resolve({ authenticated: true });
      await settle();

      expect(loggedOut).toHaveBeenCalledTimes(1);
      app.destroy();
    });

    it('moves the query cache scope as soon as a report needs an identity check, without clearing', async () => {
      const { queryCache, readQueryCacheScopeGeneration, resetSharedQueryClient } = await import('../src/plugins/queryCache');
      const { peekSharedQueryClient } = await import('../src/testing/queryCacheTestHooks');
      const provider = makeStreamProvider({ identity: true });
      const app = createFrontX().use(queryCache()).use(auth({ provider })).build();
      try {
        provider.push('authenticated');
        await settle();
        const client = peekSharedQueryClient()!;
        client.setQueryData(['users'], ['a']);
        const before = readQueryCacheScopeGeneration(client);

        const lookup = deferred<{ sub: string }>();
        vi.mocked(provider.getIdentity!).mockReturnValueOnce(lookup.promise);
        provider.push('authenticated');
        await settle();

        expect(readQueryCacheScopeGeneration(client)).toBeGreaterThan(before);
        expect(client.getQueryData(['users'])).toEqual(['a']);
        lookup.resolve({ sub: 'account-a' });
        await settle();
        expect(client.getQueryData(['users'])).toEqual(['a']);
      } finally {
        app.destroy();
        resetSharedQueryClient();
      }
    });

    it.each([
      { name: 'login', state: 'authenticated', outcome: 'resolves', loggedIn: 1, loggedOut: 0 },
      { name: 'login', state: 'authenticated', outcome: 'rejects', loggedIn: 1, loggedOut: 0 },
      { name: 'logout', state: 'unauthenticated', outcome: 'resolves', loggedIn: 0, loggedOut: 1 },
    ] as const)(
      'clears once when the provider reports the new state while $name is running and then $outcome',
      async ({ name, state, outcome, loggedIn, loggedOut }) => {
        const provider = makeStreamProvider({ identity: true });
        const call = deferred<AuthTransition>();
        vi.mocked(name === 'login' ? provider.login! : provider.logout).mockReturnValueOnce(call.promise);
        const events = await buildWithEvents(provider);
        provider.push('authenticated');
        await settle();

        const running = name === 'login'
          ? events.app.auth!.login!({ type: 'password', payload: {} })
          : events.app.auth!.logout();
        provider.signInAs('account-b');
        provider.push(state);
        await settle();
        if (outcome === 'resolves') call.resolve({ type: 'none' });
        else call.reject(new Error('cancelled'));
        await running.catch(() => undefined);
        await settle();

        expect(events.loggedIn).toHaveBeenCalledTimes(loggedIn);
        expect(events.loggedOut).toHaveBeenCalledTimes(loggedOut);
        events.app.destroy();
      },
    );

    it.each([
      { name: 'a refresh', block: (p: AuthProvider, call: Promise<AuthTransition>) => vi.mocked(p.refresh!).mockReturnValueOnce(call.then(() => null)), run: (r: AuthRuntime) => r.refresh!() },
      { name: 'a login', block: (p: AuthProvider, call: Promise<AuthTransition>) => vi.mocked(p.login!).mockReturnValueOnce(call), run: (r: AuthRuntime) => r.login!({ type: 'password', payload: {} }) },
      { name: 'a callback', block: (p: AuthProvider, call: Promise<AuthTransition>) => vi.mocked(p.handleCallback!).mockReturnValueOnce(call), run: (r: AuthRuntime) => r.handleCallback!({ params: { code: 'c' } }) },
      { name: 'a logout', block: (p: AuthProvider, call: Promise<AuthTransition>) => vi.mocked(p.logout).mockReturnValueOnce(call), run: (r: AuthRuntime) => r.logout() },
    ])('emits nothing for $name that settles after destroy', async ({ block, run }) => {
      const provider = makeStreamProvider({ identity: true });
      const call = deferred<AuthTransition>();
      block(provider, call.promise);
      const { app, loggedIn, loggedOut } = await buildWithEvents(provider);
      provider.push('authenticated');
      await settle();

      const running = run(app.auth!);
      app.destroy();
      call.resolve({ type: 'none' });
      await running;
      await settle();

      expect(loggedIn).not.toHaveBeenCalled();
      expect(loggedOut).not.toHaveBeenCalled();
    });

    it('leaves no identity lookup timer behind after destroy', async () => {
      const provider = makeStreamProvider({ identity: true });
      const { app } = await buildWithEvents(provider);
      provider.push('authenticated');
      await settle();
      vi.useFakeTimers();
      try {
        vi.mocked(provider.getIdentity!).mockImplementation(() => new Promise(() => undefined));
        provider.push('authenticated');
        await vi.advanceTimersByTimeAsync(0);
        expect(vi.getTimerCount()).toBe(1);

        app.destroy();

        expect(vi.getTimerCount()).toBe(0);
      } finally {
        vi.useRealTimers();
      }
    });

    it('subscribes to the provider on init and unsubscribes on destroy', () => {
      const provider = makeStreamProvider({ identity: true });
      const app = createFrontX().use(auth({ provider })).build();
      expect(provider.isListening()).toBe(true);

      app.destroy();

      expect(provider.isListening()).toBe(false);
    });
  });

  // -------------------------------------------------------------------------
  // 7. Transport error hooks
  // -------------------------------------------------------------------------
  describe('transport error hooks', () => {
    it('calls provider.onTransportError for every transport error', async () => {
      const onTransportError = vi.fn();
      const provider: AuthProvider = { ...makeBearerProvider('tok'), onTransportError };
      const plugin = capturePlugin(provider);

      const err = new Error('Network failure');
      const errCtx = {
        error: err,
        request: makeReqCtx('/api'),
        response: { status: 500, headers: {}, data: null },
        retryCount: 0,
        retry: vi.fn(),
      };

      await plugin.onError?.(errCtx);

      expect(onTransportError).toHaveBeenCalledTimes(1);
      expect(onTransportError).toHaveBeenCalledWith(
        expect.objectContaining({ error: err, status: 500 }),
      );
    });

    it('calls provider.onTransportError even for 401 errors that will be retried', async () => {
      const onTransportError = vi.fn();
      const refreshFn = vi.fn().mockResolvedValue({ kind: 'bearer', token: 'new-tok' } satisfies AuthSession);
      const provider: AuthProvider = {
        ...makeBearerProvider('old-tok', refreshFn),
        onTransportError,
      };
      const plugin = capturePlugin(provider);

      const errCtx = {
        error: new Error('HTTP 401'),
        request: makeReqCtx('/api'),
        response: { status: 401, headers: {}, data: null },
        retryCount: 0,
        retry: vi.fn().mockResolvedValue({ status: 200, headers: {}, data: {} }),
      };

      await plugin.onError?.(errCtx);

      expect(onTransportError).toHaveBeenCalledTimes(1);
      expect(errCtx.retry).toHaveBeenCalledTimes(1);
    });

    it('does not throw when provider has no onTransportError hook', async () => {
      const plugin = capturePlugin(makeBearerProvider('tok')); // no onTransportError

      const errCtx = {
        error: new Error('HTTP 500'),
        request: makeReqCtx('/api'),
        response: { status: 500, headers: {}, data: null },
        retryCount: 0,
        retry: vi.fn(),
      };

      const result = await plugin.onError?.(errCtx);
      expect(result).toBe(errCtx.error);
    });
  });

  // -------------------------------------------------------------------------
  // 11. Protocol-relative URL credential leak
  // -------------------------------------------------------------------------
  describe('protocol-relative URL', () => {
    it('does NOT set withCredentials for protocol-relative URLs', async () => {
      const plugin = capturePlugin(makeCookieProvider());

      const result = (await plugin.onRequest?.(makeReqCtx('//cdn.example.com/asset'))) as RestRequestContext;

      expect(result.withCredentials).toBeUndefined();
    });
  });

  // -------------------------------------------------------------------------
  // 12. Opaque origin "null" (sandboxed iframe / file://)
  // -------------------------------------------------------------------------
  describe('opaque origin', () => {
    it('does NOT match opaque "null" origin against URL origins', async () => {
      const saved = (globalThis as Record<string, unknown>).location;
      (globalThis as Record<string, unknown>).location = { origin: 'null' };

      try {
        const plugin = capturePlugin(makeCookieProvider());

        // An absolute URL whose origin happens to be 'https://null' should NOT get credentials
        const result = (await plugin.onRequest?.(makeReqCtx('https://null/api'))) as RestRequestContext;

        expect(result.withCredentials).toBeUndefined();
      } finally {
        (globalThis as Record<string, unknown>).location = saved;
      }
    });
  });

  // -------------------------------------------------------------------------
  // 13. Custom session kind (pass-through)
  // -------------------------------------------------------------------------
  describe('custom session kind', () => {
    it('does not modify request for custom sessions', async () => {
      const provider: AuthProvider = {
        getSession: vi.fn().mockResolvedValue({ kind: 'custom' } satisfies AuthSession),
        checkAuth: vi.fn().mockResolvedValue({ authenticated: true }),
        logout: vi.fn().mockResolvedValue({ type: 'none' }),
      };
      const plugin = capturePlugin(provider);

      const original = makeReqCtx('/api');
      const result = (await plugin.onRequest?.(original)) as RestRequestContext;

      expect(result.headers['Authorization']).toBeUndefined();
      expect(result.withCredentials).toBeUndefined();
    });

    it('returns error without retry for refreshed custom sessions', async () => {
      const refreshFn = vi.fn().mockResolvedValue({ kind: 'custom' } satisfies AuthSession);
      const provider: AuthProvider = {
        getSession: vi.fn().mockResolvedValue({ kind: 'custom' } satisfies AuthSession),
        checkAuth: vi.fn().mockResolvedValue({ authenticated: true }),
        logout: vi.fn().mockResolvedValue({ type: 'none' }),
        refresh: refreshFn,
      };
      const plugin = capturePlugin(provider);

      const errCtx = {
        error: new Error('HTTP 401'),
        request: makeReqCtx('/api'),
        response: { status: 401, headers: {}, data: null },
        retryCount: 0,
        retry: vi.fn(),
      };

      const result = await plugin.onError?.(errCtx);

      expect(refreshFn).toHaveBeenCalledTimes(1);
      expect(errCtx.retry).not.toHaveBeenCalled();
      expect(result).toBe(errCtx.error);
    });
  });

  // -------------------------------------------------------------------------
  // 14a. Shared refresh must not bind to any single request's AbortSignal
  // -------------------------------------------------------------------------
  describe('shared refresh signal isolation', () => {
    it('does not pass first caller AbortSignal to provider.refresh (shared promise safety)', async () => {
      const refreshFn = vi
        .fn()
        .mockResolvedValue({ kind: 'bearer', token: 'new-tok' } satisfies AuthSession);
      const plugin = capturePlugin(makeBearerProvider('old-tok', refreshFn));

      const firstController = new AbortController();
      const errCtx = {
        error: new Error('HTTP 401'),
        request: { ...makeReqCtx('/api'), signal: firstController.signal },
        response: { status: 401, headers: {}, data: null },
        retryCount: 0,
        retry: vi.fn().mockResolvedValue({ status: 200, headers: {}, data: {} }),
      };

      await plugin.onError?.(errCtx);

      // Regression: shared refresh must not inherit the first caller's signal,
      // otherwise aborting one waiter cancels refresh for all.
      expect(refreshFn).toHaveBeenCalledWith();
      expect(refreshFn.mock.calls[0]?.[0]).toBeUndefined();
    });
  });

  // -------------------------------------------------------------------------
  // 14. Refresh rejection safety (concurrent waiters)
  // -------------------------------------------------------------------------
  describe('refresh rejection safety', () => {
    it('returns error for all concurrent waiters when refresh rejects', async () => {
      const refreshFn = vi.fn().mockRejectedValue(new Error('refresh failed'));
      const plugin = capturePlugin(makeBearerProvider('tok', refreshFn));

      const makeErrCtx = () => ({
        error: new Error('HTTP 401'),
        request: makeReqCtx('/api'),
        response: { status: 401, headers: {}, data: null },
        retryCount: 0,
        retry: vi.fn(),
      });

      const ctx1 = makeErrCtx();
      const ctx2 = makeErrCtx();

      const [result1, result2] = await Promise.all([
        plugin.onError?.(ctx1),
        plugin.onError?.(ctx2),
      ]);

      expect(result1).toBe(ctx1.error);
      expect(result2).toBe(ctx2.error);
      expect(ctx1.retry).not.toHaveBeenCalled();
      expect(ctx2.retry).not.toHaveBeenCalled();
      // Single refresh call (deduped)
      expect(refreshFn).toHaveBeenCalledTimes(1);
    });
  });

  // -------------------------------------------------------------------------
  // 15. Capability probe via app.auth runtime
  // -------------------------------------------------------------------------
  describe('auth capabilities', () => {
    it('sets all flags false for a minimal provider', () => {
      const app = createFrontX().use(auth({ provider: makeNullSessionProvider() })).build();

      expect(app.auth?.capabilities.hasCanAccess).toBe(false);
      expect(app.auth?.capabilities.hasCanAccessMany).toBe(false);
      expect(app.auth?.capabilities.hasEvaluateAccess).toBe(false);
      expect(app.auth?.capabilities.hasEvaluateMany).toBe(false);
      expect(app.auth?.capabilities.hasGetIdentity).toBe(false);
      expect(app.auth?.capabilities.hasGetPermissions).toBe(false);
      expect(app.auth?.capabilities.hasRefresh).toBe(false);
      expect(app.auth?.capabilities.hasSubscribe).toBe(false);

      app.destroy();
    });

    it('sets hasCanAccess=true when provider implements canAccess', () => {
      const provider: AuthProvider = {
        ...makeBearerProvider('tok'),
        canAccess: vi.fn().mockResolvedValue('allow'),
      };
      const app = createFrontX().use(auth({ provider })).build();

      expect(app.auth?.capabilities.hasCanAccess).toBe(true);
      app.destroy();
    });

    it('sets individual flags independently', () => {
      const provider: AuthProvider = {
        ...makeBearerProvider('tok'),
        refresh: vi.fn().mockResolvedValue(null),
        subscribe: vi.fn().mockReturnValue(vi.fn()),
        getPermissions: vi.fn().mockResolvedValue({ roles: [] }),
      };
      const app = createFrontX().use(auth({ provider })).build();

      expect(app.auth?.capabilities.hasRefresh).toBe(true);
      expect(app.auth?.capabilities.hasSubscribe).toBe(true);
      expect(app.auth?.capabilities.hasGetPermissions).toBe(true);
      expect(app.auth?.capabilities.hasCanAccess).toBe(false);
      expect(app.auth?.capabilities.hasGetIdentity).toBe(false);
      app.destroy();
    });

    it('app.auth.capabilities reflects probe result', () => {
      const provider: AuthProvider = {
        ...makeBearerProvider('tok'),
        canAccess: vi.fn().mockResolvedValue('allow'),
        evaluateAccess: vi.fn().mockResolvedValue({ decision: 'allow' }),
      };
      const app = createFrontX().use(auth({ provider })).build();

      expect(app.auth?.capabilities.hasCanAccess).toBe(true);
      expect(app.auth?.capabilities.hasEvaluateAccess).toBe(true);
      expect(app.auth?.capabilities.hasCanAccessMany).toBe(false);
      expect(app.auth?.capabilities.hasEvaluateMany).toBe(false);

      app.destroy();
    });
  });

  // -------------------------------------------------------------------------
  // 16. Fail-closed canAccess
  // -------------------------------------------------------------------------
  describe('fail-closed canAccess', () => {
    it('returns allow when provider resolves allow and session exists', async () => {
      const provider: AuthProvider = {
        ...makeBearerProvider('tok'),
        canAccess: vi.fn().mockResolvedValue('allow'),
      };
      const app = createFrontX().use(auth({ provider })).build();

      const decision = await app.auth!.canAccess({ action: 'read', resource: 'doc' });

      expect(decision).toBe('allow');
      app.destroy();
    });

    it('returns deny when provider has no canAccess', async () => {
      const provider = makeBearerProvider('tok'); // no canAccess
      const app = createFrontX().use(auth({ provider })).build();

      const decision = await app.auth!.canAccess({ action: 'read', resource: 'doc' });

      expect(decision).toBe('deny');
      app.destroy();
    });

    it('returns deny when session is null', async () => {
      const provider: AuthProvider = {
        ...makeNullSessionProvider(),
        canAccess: vi.fn().mockResolvedValue('allow'),
      };
      const app = createFrontX().use(auth({ provider })).build();

      const decision = await app.auth!.canAccess({ action: 'read', resource: 'doc' });

      expect(decision).toBe('deny');
      expect(provider.canAccess).not.toHaveBeenCalled();
      app.destroy();
    });

    it('returns deny when getSession throws', async () => {
      const provider: AuthProvider = {
        ...makeBearerProvider('tok'),
        getSession: vi.fn().mockRejectedValue(new Error('session error')),
        canAccess: vi.fn().mockResolvedValue('allow'),
      };
      const app = createFrontX().use(auth({ provider })).build();

      const decision = await app.auth!.canAccess({ action: 'read', resource: 'doc' });

      expect(decision).toBe('deny');
      expect(provider.canAccess).not.toHaveBeenCalled();
      app.destroy();
    });

    it('returns deny when provider.canAccess throws', async () => {
      const provider: AuthProvider = {
        ...makeBearerProvider('tok'),
        canAccess: vi.fn().mockRejectedValue(new Error('pdp error')),
      };
      const app = createFrontX().use(auth({ provider })).build();

      const decision = await app.auth!.canAccess({ action: 'read', resource: 'doc' });

      expect(decision).toBe('deny');
      app.destroy();
    });

    it('returns deny when provider.canAccess resolves malformed decision', async () => {
      const provider: AuthProvider = {
        ...makeBearerProvider('tok'),
        canAccess: vi.fn().mockResolvedValue('maybe' as unknown as 'allow' | 'deny'),
      };
      const app = createFrontX().use(auth({ provider })).build();

      const decision = await app.auth!.canAccess({ action: 'read', resource: 'doc' });

      expect(decision).toBe('deny');
      app.destroy();
    });

    it('returns deny for malformed query (missing action)', async () => {
      const provider: AuthProvider = {
        ...makeBearerProvider('tok'),
        canAccess: vi.fn().mockResolvedValue('allow'),
      };
      const app = createFrontX().use(auth({ provider })).build();

      const decision = await app.auth!.canAccess({ action: '', resource: 'doc' });

      expect(decision).toBe('deny');
      expect(provider.canAccess).not.toHaveBeenCalled();
      app.destroy();
    });

    it('returns deny for malformed query (missing resource)', async () => {
      const provider: AuthProvider = {
        ...makeBearerProvider('tok'),
        canAccess: vi.fn().mockResolvedValue('allow'),
      };
      const app = createFrontX().use(auth({ provider })).build();

      const decision = await app.auth!.canAccess({ action: 'read', resource: '' });

      expect(decision).toBe('deny');
      expect(provider.canAccess).not.toHaveBeenCalled();
      app.destroy();
    });

    it('does not throw when provider.canAccess rejects', async () => {
      const provider: AuthProvider = {
        ...makeBearerProvider('tok'),
        canAccess: vi.fn().mockRejectedValue(new Error('unexpected')),
      };
      const app = createFrontX().use(auth({ provider })).build();

      await expect(app.auth!.canAccess({ action: 'read', resource: 'doc' })).resolves.toBe('deny');
      app.destroy();
    });
  });

  // -------------------------------------------------------------------------
  // 17. Fail-closed evaluateAccess
  // -------------------------------------------------------------------------
  describe('fail-closed evaluateAccess', () => {
    it('returns allow evaluation when provider resolves allow and session exists', async () => {
      const provider: AuthProvider = {
        ...makeBearerProvider('tok'),
        evaluateAccess: vi.fn().mockResolvedValue({ decision: 'allow', reason: 'allowed' }),
      };
      const app = createFrontX().use(auth({ provider })).build();

      const result = await app.auth!.evaluateAccess({ action: 'read', resource: 'doc' });

      expect(result.decision).toBe('allow');
      app.destroy();
    });

    it('returns deny+unsupported when provider lacks evaluateAccess', async () => {
      const provider = makeBearerProvider('tok'); // no evaluateAccess
      const app = createFrontX().use(auth({ provider })).build();

      const result = await app.auth!.evaluateAccess({ action: 'read', resource: 'doc' });

      expect(result.decision).toBe('deny');
      expect(result.reason).toBe('unsupported');
      app.destroy();
    });

    it('returns deny+unauthenticated when session is null', async () => {
      const provider: AuthProvider = {
        ...makeNullSessionProvider(),
        evaluateAccess: vi.fn().mockResolvedValue({ decision: 'allow' }),
      };
      const app = createFrontX().use(auth({ provider })).build();

      const result = await app.auth!.evaluateAccess({ action: 'read', resource: 'doc' });

      expect(result.decision).toBe('deny');
      expect(result.reason).toBe('unauthenticated');
      expect(provider.evaluateAccess).not.toHaveBeenCalled();
      app.destroy();
    });

    it('returns deny+unauthenticated when getSession throws', async () => {
      const provider: AuthProvider = {
        ...makeBearerProvider('tok'),
        getSession: vi.fn().mockRejectedValue(new Error('session error')),
        evaluateAccess: vi.fn().mockResolvedValue({ decision: 'allow' }),
      };
      const app = createFrontX().use(auth({ provider })).build();

      const result = await app.auth!.evaluateAccess({ action: 'read', resource: 'doc' });

      expect(result.decision).toBe('deny');
      expect(result.reason).toBe('unauthenticated');
      app.destroy();
    });

    it('returns deny+provider_error when provider.evaluateAccess throws', async () => {
      const provider: AuthProvider = {
        ...makeBearerProvider('tok'),
        evaluateAccess: vi.fn().mockRejectedValue(new Error('pdp error')),
      };
      const app = createFrontX().use(auth({ provider })).build();

      const result = await app.auth!.evaluateAccess({ action: 'read', resource: 'doc' });

      expect(result.decision).toBe('deny');
      expect(result.reason).toBe('provider_error');
      app.destroy();
    });

    it('returns deny+provider_error when provider.evaluateAccess resolves malformed payload', async () => {
      const provider: AuthProvider = {
        ...makeBearerProvider('tok'),
        evaluateAccess: vi.fn().mockResolvedValue({} as unknown as { decision: 'allow' | 'deny' }),
      };
      const app = createFrontX().use(auth({ provider })).build();

      const result = await app.auth!.evaluateAccess({ action: 'read', resource: 'doc' });

      expect(result.decision).toBe('deny');
      expect(result.reason).toBe('provider_error');
      app.destroy();
    });

    it('returns deny+provider_error when provider.evaluateAccess resolves malformed constraints', async () => {
      const provider: AuthProvider = {
        ...makeBearerProvider('tok'),
        evaluateAccess: vi.fn().mockResolvedValue({
          decision: 'allow',
          constraints: { field: 'tenantId', op: 'eq', value: 'tenant_a' },
        } as unknown as AccessEvaluation),
      };
      const app = createFrontX().use(auth({ provider })).build();

      const result = await app.auth!.evaluateAccess({ action: 'read', resource: 'doc' });

      expect(result).toEqual({ decision: 'deny', reason: 'provider_error' });
      app.destroy();
    });

    it('returns deny+provider_error when provider.evaluateAccess resolves malformed reason shape', async () => {
      const provider: AuthProvider = {
        ...makeBearerProvider('tok'),
        evaluateAccess: vi.fn().mockResolvedValue({
          decision: 'allow',
          reason: { code: 'wrong_reason' },
        } as unknown as AccessEvaluation),
      };
      const app = createFrontX().use(auth({ provider })).build();

      const result = await app.auth!.evaluateAccess({ action: 'read', resource: 'doc' });

      expect(result).toEqual({ decision: 'deny', reason: 'provider_error' });
      app.destroy();
    });

    it('returns deny+provider_error when provider.evaluateAccess resolves malformed meta shape', async () => {
      const provider: AuthProvider = {
        ...makeBearerProvider('tok'),
        evaluateAccess: vi.fn().mockResolvedValue({
          decision: 'allow',
          meta: ['policy-meta'],
        } as unknown as AccessEvaluation),
      };
      const app = createFrontX().use(auth({ provider })).build();

      const result = await app.auth!.evaluateAccess({ action: 'read', resource: 'doc' });

      expect(result).toEqual({ decision: 'deny', reason: 'provider_error' });
      app.destroy();
    });

    it('passes through provider-defined reason and nested constraints/meta payloads', async () => {
      const provider: AuthProvider = {
        ...makeBearerProvider('tok'),
        evaluateAccess: vi.fn().mockResolvedValue({
          decision: 'deny',
          reason: 'tenant_scope_conflict',
          constraints: [
            {
              predicate: {
                field: 'tenant.id',
                op: 'custom_eq',
                value: 'tenant-1',
              },
            },
          ],
          meta: {
            source: 'pdp',
            audit: {
              policyId: 'p-1',
            },
          },
        } as AccessEvaluation),
      };
      const app = createFrontX().use(auth({ provider })).build();

      await expect(
        app.auth!.evaluateAccess({ action: 'read', resource: 'doc' }),
      ).resolves.toEqual({
        decision: 'deny',
        reason: 'tenant_scope_conflict',
        constraints: [
          {
            predicate: {
              field: 'tenant.id',
              op: 'custom_eq',
              value: 'tenant-1',
            },
          },
        ],
        meta: {
          source: 'pdp',
          audit: {
            policyId: 'p-1',
          },
        },
      });
      app.destroy();
    });

    it('returns deny+malformed for missing action', async () => {
      const provider: AuthProvider = {
        ...makeBearerProvider('tok'),
        evaluateAccess: vi.fn().mockResolvedValue({ decision: 'allow' }),
      };
      const app = createFrontX().use(auth({ provider })).build();

      const result = await app.auth!.evaluateAccess({ action: '', resource: 'doc' });

      expect(result.decision).toBe('deny');
      expect(result.reason).toBe('malformed');
      expect(provider.evaluateAccess).not.toHaveBeenCalled();
      app.destroy();
    });

    it('returns deny+aborted when signal is aborted on provider throw', async () => {
      const controller = new AbortController();
      const provider: AuthProvider = {
        ...makeBearerProvider('tok'),
        evaluateAccess: vi.fn().mockImplementation(() => {
          controller.abort();
          return Promise.reject(new Error('aborted'));
        }),
      };
      const app = createFrontX().use(auth({ provider })).build();

      const result = await app.auth!.evaluateAccess(
        { action: 'read', resource: 'doc' },
        { signal: controller.signal },
      );

      expect(result.decision).toBe('deny');
      expect(result.reason).toBe('aborted');
      app.destroy();
    });

    it('returns deny+timeout when signal is aborted with TimeoutError', async () => {
      const controller = new AbortController();
      const timeoutErr = Object.assign(new Error('Timeout'), { name: 'TimeoutError' });
      const provider: AuthProvider = {
        ...makeBearerProvider('tok'),
        evaluateAccess: vi.fn().mockImplementation(() => {
          controller.abort(timeoutErr);
          return Promise.reject(timeoutErr);
        }),
      };
      const app = createFrontX().use(auth({ provider })).build();

      const result = await app.auth!.evaluateAccess(
        { action: 'read', resource: 'doc' },
        { signal: controller.signal },
      );

      expect(result.decision).toBe('deny');
      expect(result.reason).toBe('timeout');
      app.destroy();
    });

    it('does not throw from evaluateAccess in any error path', async () => {
      const provider: AuthProvider = {
        ...makeBearerProvider('tok'),
        evaluateAccess: vi.fn().mockRejectedValue(new Error('unexpected')),
      };
      const app = createFrontX().use(auth({ provider })).build();

      await expect(
        app.auth!.evaluateAccess({ action: 'read', resource: 'doc' }),
      ).resolves.toMatchObject({ decision: 'deny' });
      app.destroy();
    });
  });

  // -------------------------------------------------------------------------
  // 18. Fail-closed canAccessMany
  // -------------------------------------------------------------------------
  describe('fail-closed canAccessMany', () => {
    const queries = [
      { action: 'read', resource: 'doc' },
      { action: 'write', resource: 'doc' },
    ];

    it('returns empty array for empty input', async () => {
      const provider = makeBearerProvider('tok');
      const app = createFrontX().use(auth({ provider })).build();

      const results = await app.auth!.canAccessMany([]);

      expect(results).toHaveLength(0);
      app.destroy();
    });

    it('returns all deny when provider lacks canAccess and canAccessMany', async () => {
      const provider = makeBearerProvider('tok'); // no access methods
      const app = createFrontX().use(auth({ provider })).build();

      const results = await app.auth!.canAccessMany(queries);

      expect(results).toEqual(['deny', 'deny']);
      app.destroy();
    });

    it('preserves order: fallback delegates to safeCanAccess per query', async () => {
      const canAccessFn = vi.fn()
        .mockResolvedValueOnce('allow')
        .mockResolvedValueOnce('deny');
      const provider: AuthProvider = {
        ...makeBearerProvider('tok'),
        canAccess: canAccessFn,
      };
      const app = createFrontX().use(auth({ provider })).build();

      const results = await app.auth!.canAccessMany(queries);

      expect(results).toEqual(['allow', 'deny']);
      expect(canAccessFn).toHaveBeenCalledTimes(2);
      app.destroy();
    });

    it('delegates to provider.canAccessMany when available', async () => {
      const canAccessManyFn = vi.fn().mockResolvedValue(['allow', 'deny']);
      const provider: AuthProvider = {
        ...makeBearerProvider('tok'),
        canAccessMany: canAccessManyFn,
      };
      const app = createFrontX().use(auth({ provider })).build();

      const results = await app.auth!.canAccessMany(queries);

      expect(results).toEqual(['allow', 'deny']);
      expect(canAccessManyFn).toHaveBeenCalledTimes(1);
      app.destroy();
    });

    it('routes malformed entries through per-query safe path before provider.canAccessMany', async () => {
      // Even if a provider would otherwise grant 'allow', a missing action/resource
      // must fail closed without delegating that entry to the bulk method.
      const canAccessManyFn = vi.fn().mockResolvedValue(['allow', 'allow']);
      const canAccessFn = vi.fn().mockResolvedValue('allow');
      const provider: AuthProvider = {
        ...makeBearerProvider('tok'),
        canAccess: canAccessFn,
        canAccessMany: canAccessManyFn,
      };
      const app = createFrontX().use(auth({ provider })).build();

      const malformed = [{ action: '', resource: 'doc' }, { action: 'read', resource: 'doc' }];
      const results = await app.auth!.canAccessMany(malformed);

      expect(results).toEqual(['deny', 'allow']);
      expect(canAccessManyFn).not.toHaveBeenCalled();
      app.destroy();
    });

    it('returns all deny when provider.canAccessMany throws', async () => {
      const provider: AuthProvider = {
        ...makeBearerProvider('tok'),
        canAccessMany: vi.fn().mockRejectedValue(new Error('batch error')),
      };
      const app = createFrontX().use(auth({ provider })).build();

      const results = await app.auth!.canAccessMany(queries);

      expect(results).toEqual(['deny', 'deny']);
      app.destroy();
    });

    it('returns all deny when provider.canAccessMany returns wrong result length', async () => {
      const provider: AuthProvider = {
        ...makeBearerProvider('tok'),
        canAccessMany: vi.fn().mockResolvedValue(['allow']),
      };
      const app = createFrontX().use(auth({ provider })).build();

      const results = await app.auth!.canAccessMany(queries);

      expect(results).toEqual(['deny', 'deny']);
      app.destroy();
    });

    it('normalizes malformed decisions from provider.canAccessMany to deny', async () => {
      const provider: AuthProvider = {
        ...makeBearerProvider('tok'),
        canAccessMany: vi.fn().mockResolvedValue([
          'allow',
          'maybe' as unknown as 'allow' | 'deny',
        ]),
      };
      const app = createFrontX().use(auth({ provider })).build();

      const results = await app.auth!.canAccessMany(queries);

      expect(results).toEqual(['allow', 'deny']);
      app.destroy();
    });

    it('returns all deny when session is null and provider has canAccessMany', async () => {
      const provider: AuthProvider = {
        ...makeNullSessionProvider(),
        canAccessMany: vi.fn().mockResolvedValue(['allow', 'allow']),
      };
      const app = createFrontX().use(auth({ provider })).build();

      const results = await app.auth!.canAccessMany(queries);

      expect(results).toEqual(['deny', 'deny']);
      expect(provider.canAccessMany).not.toHaveBeenCalled();
      app.destroy();
    });
  });

  // -------------------------------------------------------------------------
  // 19. Fail-closed evaluateMany
  // -------------------------------------------------------------------------
  describe('fail-closed evaluateMany', () => {
    const queries = [
      { action: 'read', resource: 'doc' },
      { action: 'write', resource: 'doc' },
    ];

    it('returns empty array for empty input', async () => {
      const provider = makeBearerProvider('tok');
      const app = createFrontX().use(auth({ provider })).build();

      const results = await app.auth!.evaluateMany([]);

      expect(results).toHaveLength(0);
      app.destroy();
    });

    it('returns all deny+unsupported when provider lacks evaluateAccess and evaluateMany', async () => {
      const provider = makeBearerProvider('tok'); // no evaluate methods
      const app = createFrontX().use(auth({ provider })).build();

      const results = await app.auth!.evaluateMany(queries);

      expect(results).toHaveLength(2);
      expect(results[0]).toMatchObject({ decision: 'deny', reason: 'unsupported' });
      expect(results[1]).toMatchObject({ decision: 'deny', reason: 'unsupported' });
      app.destroy();
    });

    it('delegates to provider.evaluateMany when available', async () => {
      const evalManyFn = vi.fn().mockResolvedValue([
        { decision: 'allow', reason: 'allowed' },
        { decision: 'deny', reason: 'denied' },
      ]);
      const provider: AuthProvider = {
        ...makeBearerProvider('tok'),
        evaluateMany: evalManyFn,
      };
      const app = createFrontX().use(auth({ provider })).build();

      const results = await app.auth!.evaluateMany(queries);

      expect(results[0].decision).toBe('allow');
      expect(results[1].decision).toBe('deny');
      expect(evalManyFn).toHaveBeenCalledTimes(1);
      app.destroy();
    });

    it('routes malformed entries through per-query safe path before provider.evaluateMany', async () => {
      // Mirrors the canAccessMany guarantee: a missing action/resource forces
      // the whole batch through safeEvaluateAccess, never the bulk method.
      const evalManyFn = vi.fn().mockResolvedValue([
        { decision: 'allow', reason: 'allowed' },
        { decision: 'allow', reason: 'allowed' },
      ]);
      const evalAccessFn = vi.fn().mockResolvedValue({ decision: 'allow', reason: 'allowed' });
      const provider: AuthProvider = {
        ...makeBearerProvider('tok'),
        evaluateAccess: evalAccessFn,
        evaluateMany: evalManyFn,
      };
      const app = createFrontX().use(auth({ provider })).build();

      const malformed = [{ action: 'read', resource: '' }, { action: 'read', resource: 'doc' }];
      const results = await app.auth!.evaluateMany(malformed);

      expect(results[0]).toEqual({ decision: 'deny', reason: 'malformed' });
      expect(results[1].decision).toBe('allow');
      expect(evalManyFn).not.toHaveBeenCalled();
      app.destroy();
    });

    it('fallback: preserves order via safeEvaluateAccess', async () => {
      const evaluateAccessFn = vi.fn()
        .mockResolvedValueOnce({ decision: 'allow', reason: 'allowed' })
        .mockResolvedValueOnce({ decision: 'deny', reason: 'denied' });
      const provider: AuthProvider = {
        ...makeBearerProvider('tok'),
        evaluateAccess: evaluateAccessFn,
      };
      const app = createFrontX().use(auth({ provider })).build();

      const results = await app.auth!.evaluateMany(queries);

      expect(results[0].decision).toBe('allow');
      expect(results[1].decision).toBe('deny');
      expect(evaluateAccessFn).toHaveBeenCalledTimes(2);
      app.destroy();
    });

    it('returns all deny+unauthenticated when session is null and provider has evaluateMany', async () => {
      const provider: AuthProvider = {
        ...makeNullSessionProvider(),
        evaluateMany: vi.fn().mockResolvedValue([{ decision: 'allow' }, { decision: 'allow' }]),
      };
      const app = createFrontX().use(auth({ provider })).build();

      const results = await app.auth!.evaluateMany(queries);

      expect(results).toHaveLength(2);
      expect(results[0]).toMatchObject({ decision: 'deny', reason: 'unauthenticated' });
      expect(results[1]).toMatchObject({ decision: 'deny', reason: 'unauthenticated' });
      expect(provider.evaluateMany).not.toHaveBeenCalled();
      app.destroy();
    });

    it('returns all deny+provider_error when provider.evaluateMany throws', async () => {
      const provider: AuthProvider = {
        ...makeBearerProvider('tok'),
        evaluateMany: vi.fn().mockRejectedValue(new Error('batch error')),
      };
      const app = createFrontX().use(auth({ provider })).build();

      const results = await app.auth!.evaluateMany(queries);

      expect(results).toHaveLength(2);
      expect(results[0]).toMatchObject({ decision: 'deny', reason: 'provider_error' });
      expect(results[1]).toMatchObject({ decision: 'deny', reason: 'provider_error' });
      app.destroy();
    });

    it('returns all deny+provider_error when provider.evaluateMany returns wrong result length', async () => {
      const provider: AuthProvider = {
        ...makeBearerProvider('tok'),
        evaluateMany: vi.fn().mockResolvedValue([{ decision: 'allow' }]),
      };
      const app = createFrontX().use(auth({ provider })).build();

      const results = await app.auth!.evaluateMany(queries);

      expect(results).toHaveLength(2);
      expect(results[0]).toMatchObject({ decision: 'deny', reason: 'provider_error' });
      expect(results[1]).toMatchObject({ decision: 'deny', reason: 'provider_error' });
      app.destroy();
    });

    it('normalizes malformed entries from provider.evaluateMany to deny+provider_error', async () => {
      const provider: AuthProvider = {
        ...makeBearerProvider('tok'),
        evaluateMany: vi.fn().mockResolvedValue([
          { decision: 'allow', reason: 'allowed' },
          {} as unknown as { decision: 'allow' | 'deny' },
        ]),
      };
      const app = createFrontX().use(auth({ provider })).build();

      const results = await app.auth!.evaluateMany(queries);

      expect(results[0]).toMatchObject({ decision: 'allow', reason: 'allowed' });
      expect(results[1]).toMatchObject({ decision: 'deny', reason: 'provider_error' });
      app.destroy();
    });

    it('normalizes malformed constraints while preserving provider-defined reason/meta entries', async () => {
      const malformedQueries = [
        { action: 'read', resource: 'doc' },
        { action: 'update', resource: 'doc' },
        { action: 'delete', resource: 'doc' },
        { action: 'list', resource: 'doc' },
      ];

      const provider: AuthProvider = {
        ...makeBearerProvider('tok'),
        evaluateMany: vi.fn().mockResolvedValue([
          { decision: 'allow', reason: 'allowed' },
          { decision: 'allow', constraints: { field: 'tenantId', op: 'eq', value: 'tenant_a' } },
          { decision: 'deny', reason: 'unknown_reason' },
          { decision: 'allow', meta: { source: 'scope', nested: { id: 'p-1' } } },
        ] as ReadonlyArray<AccessEvaluation>),
      };
      const app = createFrontX().use(auth({ provider })).build();

      const results = await app.auth!.evaluateMany(malformedQueries);

      expect(results).toEqual([
        { decision: 'allow', reason: 'allowed' },
        { decision: 'deny', reason: 'provider_error' },
        { decision: 'deny', reason: 'unknown_reason' },
        { decision: 'allow', meta: { source: 'scope', nested: { id: 'p-1' } } },
      ]);
      app.destroy();
    });
  });
});
