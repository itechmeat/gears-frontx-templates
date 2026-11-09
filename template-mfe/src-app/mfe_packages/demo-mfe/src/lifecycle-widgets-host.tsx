/**
 * demo-mfe widgets-host lifecycle.
 *
 * Constructs a nested FrontX app that is the single owner of the widgets
 * ExtensionDomain. The widgets domain GTS instance is
 * authored inside `demo-mfe/mfe.json`'s `domains[]` array — content-addressed
 * by its GTS instance ID and registered into the nested type system from the
 * global runtime-fetched manifest. TypeScript transports the entity, never
 * defines it.
 *
 * Discovery follows the runtime-fetch contract: this nested app
 * fetches the same `generated-mfe-manifests.json` the host bootstrap fetches.
 * For each MFE package in the global manifest, schemas / manifest / domains /
 * entries are registered opaquely on the nested type system (order:
 * schemas → manifest → domains → entries → extensions). The widgets domain
 * instance is located in the registered domains by its GTS instance ID, then
 * the nested app takes ownership via `registry.registerDomain(domain, factory)`.
 * Extensions whose `domain` matches the widgets domain are registered opaquely
 * on the nested registry. No build-time imports of foreign-package mfe.json
 * files, no hardcoded URLs, no GTS-entity decomposition in L4 code.
 *
 * The widgets domain is itself routed (its own flat `route: "widgets"`,
 * admitted by the router of `@gears-frontx/routing` that the framework injects
 * into this nested app's registry): the registry starts the domain when
 * `WidgetsHostScreen`'s domain slot attaches its root, and the runtime's
 * `reflect` commands to that router write
 * every mount/unmount into the URL automatically from there, exactly like the
 * shell's own domains — this module builds no routing wiring of its own.
 */
import React, { useEffect, useState } from 'react';
import {
  createFrontX,
  effects,
  microfrontends,
  queryCacheShared,
  mock,
  gtsPlugin,
  ConcurrentMountStrategy,
  ExtensionDomainImplementation,
  ExtensionDomainImplementationFactory,
  ActionHandler,
  FRONTX_ACTION_MOUNT_EXT,
  FRONTX_ACTION_UNMOUNT_EXT,
  FRONTX_MFE_ENTRY_MF,
  MfeHandlerMF,
  ExtensionDomainSlot,
  ThemeAwareReactLifecycle,
  screenDomain,
  type ContainerHooks,
  type DomainContext,
  type ActionPayload,
  type MountStrategy,
  type ExtensionDomain,
  type Extension,
  type FrontXApp,
  type MfManifest,
  type MfeEntryMF,
  type JSONSchema,
  type ChildMfeBridge,
  type MfeMountContext,
  type MfeRegistry,
} from '@gears-frontx/react';
import {
  themeSchema,
  languageCodeSchema,
  languageSchema,
  extensionScreenSchema,
} from '@gears-frontx/frontx-template-shell';

const WIDGET_PING_ACTION_TYPE =
  'gts.frontx.mfes.comm.action.v1~frontx.widgets.test.widget_ping.v1~';

// The one app of this runtime: each extension instance is its own loaded copy
// of this bundle, so this copy builds exactly one app, here at module level.
// `microfrontends()` builds its registry lazily; `mount()` below reads
// `app.mfeRegistry` as its first statement, which places the registry's
// construction inside the mount window so the host links it.
// Exported test-only, like `bootstrapWidgetsRuntime`: a test that needs the real
// nested app reuses this one, since a runtime builds exactly one.
export const widgetsHostApp = createFrontX()
  .use(effects())
  .use(microfrontends({
    typeSystem: gtsPlugin,
    mfeHandlers: [new MfeHandlerMF(FRONTX_MFE_ENTRY_MF)],
  }))
  .use(queryCacheShared())
  .use(mock())
  .build();

const WIDGETS_DOMAIN_ID =
  'gts.frontx.mfes.ext.domain.v1~frontx.widgets.area.main.v1';

interface MfeManifestConfig {
  manifest: MfManifest;
  domains?: ExtensionDomain[];
  entries: MfeEntryMF[];
  extensions?: Extension[];
  schemas?: JSONSchema[];
}

class WidgetsContainerHooks implements ContainerHooks {
  private readonly elements = new Map<string, HTMLElement>();

  create(extensionId: string): Element {
    const el = document.createElement('div');
    el.dataset.widgetExtensionId = extensionId;
    el.style.minHeight = '4rem';
    this.elements.set(extensionId, el);
    return el;
  }

  destroy(extensionId: string, container?: Element): void {
    if (!container || this.elements.get(extensionId) === container) {
      this.elements.delete(extensionId);
    }
  }
}

class WidgetsDomainImpl extends ExtensionDomainImplementation {
  private readonly strategy: ConcurrentMountStrategy;

  constructor(ctx: DomainContext, hooks: ContainerHooks) {
    super();
    this.strategy = new ConcurrentMountStrategy(ctx.mounter, hooks);
    ctx.registerHandler(FRONTX_ACTION_MOUNT_EXT, ActionHandler.fromFunction((_t, p) => this.strategy.mount(p as ActionPayload)));
    ctx.registerHandler(
      FRONTX_ACTION_UNMOUNT_EXT,
      ActionHandler.fromFunction(async (_t, p) => {
        await this.strategy.unmount!(p as ActionPayload);
      }),
    );
  }

  protected getMountStrategies(): MountStrategy[] {
    return [this.strategy];
  }
}

class WidgetsDomainFactory extends ExtensionDomainImplementationFactory {
  build(ctx: DomainContext): WidgetsDomainImpl {
    return new WidgetsDomainImpl(ctx, new WidgetsContainerHooks());
  }
}

/**
 * Bootstrap demo-mfe's widgets-host child runtime:
 *   1. Fetch the global manifest at runtime from the public-asset URL the
 *      generation script writes (runtime-fetch contract).
 *   2. First pass: register every package's schemas opaquely on the child
 *      type system so derived-schema chains resolve regardless of package
 *      iteration order.
 *   3. Second pass: for each package, register manifest, domains, then
 *      entries opaquely on the child type system (order:
 *      schemas → manifest → domains → entries → extensions). While iterating
 *      domains, locate the widgets domain by its GTS instance ID so the
 *      nested app can take ownership of it via `registry.registerDomain(...)`.
 *   4. Take ownership of the widgets domain (registerDomain on the nested
 *      registry, paired with the local `WidgetsDomainFactory`) — skipped when
 *      a cached registry (a remount) already owns it.
 *   5. Third pass: for each extension whose target domain is the widgets
 *      domain, register it opaquely on the child registry — skipped per
 *      extension already registered.
 *
 * GTS entities flow through unchanged — no spread, no override, no
 * decomposition, no L4 reconstruction. The generation script inlines the
 * resolved `MfManifest` object into each entry's `manifest` field so entries
 * are registered opaquely without any consumer-side spread. The widgets
 * domain instance is authored once in `demo-mfe/mfe.json` (`domains[]`) and
 * arrives here through the same fetched manifest pipeline as every other GTS
 * entity.
 *
 * Returns the located widgets domain declaration so the caller can read its
 * `route` and `defaultActionTimeout` without a second manifest walk.
 *
 * Exported for tests so they can run it without a full `mount()` cycle:
 * production code reaches this only through
 * `DemoMfeWidgetsHostLifecycle.mount()`.
 */
export async function bootstrapWidgetsRuntime(
  app: FrontXApp,
): Promise<ExtensionDomain> {
  const registry = app.mfeRegistry;
  if (!registry) {
    throw new Error(
      'demo-mfe widgets-host: app.mfeRegistry is undefined.',
    );
  }

  console.info(
    '[demo-mfe widgets-host] Fetching MFE manifests from /generated-mfe-manifests.json',
  );
  const response = await fetch('/generated-mfe-manifests.json');
  if (!response.ok) {
    throw new Error(
      `[demo-mfe widgets-host] Failed to load MFE manifests from /generated-mfe-manifests.json: ${response.status} ${response.statusText}`,
    );
  }
  const manifests = (await response.json()) as MfeManifestConfig[];

  for (const config of manifests) {
    for (const schema of config.schemas ?? []) {
      registry.typeSystem.registerSchema(schema);
    }
  }

  // This nested type system is the `gtsPlugin` singleton, which since
  // gts-plugin 0.3.2 shares one store with every compatible copy in the realm
  // (the shell's included), so the shell's registrations are already visible
  // here. This runtime must still not depend on the shell's own
  // registrations that put the three application-layer derived schemas onto
  // the store (theme and language in `main.tsx`, extension_screen in the
  // shell's screen domain implementation; see
  // `loader.ts`'s comment: "application-specific derived schemas ...
  // registered at the application layer"), because a standalone mount has no
  // shell. Re-registering identical content is silent, so they are registered
  // here unconditionally. They MUST be registered here before ANY domain that
  // references them by `x-gts-type-ref` in its own `sharedProperties` - not only
  // the well-known `screenDomain` registered below, but also any
  // manifest-declared domain in the loop that follows. Registering these
  // solution schemas ahead of the manifest-driven domain loop cover the
  // application-level schema ordering rule.
  registry.typeSystem.registerSchema(themeSchema);
  registry.typeSystem.registerSchema(languageCodeSchema);
  registry.typeSystem.registerSchema(languageSchema);
  registry.typeSystem.registerSchema(extensionScreenSchema);

  let widgetsDomain: ExtensionDomain | undefined;
  for (const config of manifests) {
    registry.typeSystem.register(config.manifest);
    for (const domain of config.domains ?? []) {
      registry.typeSystem.register(domain);
      if (domain.id === WIDGETS_DOMAIN_ID) {
        widgetsDomain = domain;
      }
    }
    for (const entry of config.entries) {
      registry.typeSystem.register(entry);
    }
  }

  if (!widgetsDomain) {
    throw new Error(
      `[demo-mfe widgets-host] Widgets domain ${WIDGETS_DOMAIN_ID} not found in any registered MFE manifest's domains[].`,
    );
  }

  // `screenDomain` is a well-known framework declaration (not authored in any
  // package's mfe.json), so it is registered directly here rather than
  // sourced from the fetched manifest — this registry never takes ownership
  // of it (no `registerDomain` call), it only needs the declaration present
  // for `x-gts-instance-ref` resolution (e.g. widget-a's "mount Hello World in the
  // shell's screen domain" escalates through here on its way up, and
  // admission validation for that action checks referenced entities against
  // THIS store before the action ever reaches cross-hop routing). Its own
  // four referenced schemas were already registered above.
  //
  // Registered only when the store does not hold it yet: the store is shared
  // with the shell, whose own `screenDomain` declaration adds its chrome
  // actions, and writing the plain framework one over it would replace the
  // shell's record (the store keeps the last write). A standalone mount, with
  // no shell, still gets it here. The type system has no lookup for an
  // instance, so a passing validation stands in for "already there": every
  // write is validated before it lands and types are never removed, so a
  // record that is there validates.
  if (!registry.typeSystem.validateInstance(screenDomain.id).valid) {
    registry.typeSystem.register(screenDomain);
  }

  // Guarded against a cached registry: every mount of the host lifecycle
  // runs this bootstrap against the same nested `MfeRegistry`, so a remount
  // finds the domain and its extensions already registered, and
  // `registerDomain`/`registerExtension` on an already-owned domain/extension
  // would either throw or duplicate the registration. Each registration runs
  // only for an entity the registry does not already hold.
  if (!registry.getDomain(WIDGETS_DOMAIN_ID)) {
    registry.registerDomain(widgetsDomain, new WidgetsDomainFactory());
  }

  for (const config of manifests) {
    for (const extension of config.extensions ?? []) {
      // Register every extension declared by any fetched manifest opaquely
      // on this nested type system — not just the widgets-domain ones this
      // registry owns and mounts below - so `x-gts-instance-ref` validation for an
      // action referencing a foreign-domain extension instance (e.g. the
      // shell's Hello World screen extension) resolves on this registry's
      // type system whether or not the shell registered it first. This
      // registration is type-system-only: it does not admit the extension
      // for mounting in this registry (that stays gated by the
      // WIDGETS_DOMAIN_ID check below, via `registerExtension`).
      registry.typeSystem.register(extension);
      if (extension.domain === WIDGETS_DOMAIN_ID && !registry.getExtension(extension.id)) {
        await registry.registerExtension(extension);
      }
    }
  }

  return widgetsDomain;
}

interface WidgetsHostScreenProps {
  /**
   * The SAME in-flight `bootstrapWidgetsRuntime(...)` promise
   * `DemoMfeWidgetsHostLifecycle.mount()` started synchronously (before any
   * `await`) and is itself awaiting before its own returned promise
   * resolves. This component never re-invokes `bootstrapWidgetsRuntime` —
   * it only subscribes to this already-started promise to drive its own
   * loading/error UI. The registry-level `registerDomain` call this promise
   * guards completes independently of (and strictly no later than) whatever
   * turn React schedules this effect on, so an action chain's `next`
   * continuation targeting the widgets domain is always routable by the
   * time `mount()` resolves — regardless of this component's own render
   * timing.
   */
  readonly bootstrap: Promise<ExtensionDomain>;
  readonly registry: MfeRegistry;
  /**
   * Signals `DemoMfeWidgetsHostLifecycle.mount()` that `ExtensionDomainSlot`'s
   * own `mounter.attach(root)` has completed for the widgets domain — i.e.
   * that `DefaultExtensionMounter` now has a DOM root to mount into, so a
   * `mount_ext` dispatched into this domain will not throw "no root attached
   * for domain ...". `registerDomain` completing (the `bootstrap` promise
   * above) is necessary for a chain's `next` continuation targeting this
   * domain to be ROUTABLE at all, but it is not sufficient for that
   * continuation to actually MOUNT anything: `ExtensionDomainSlot` only
   * renders once `bootstrap` has resolved, and its root-attach effect runs on
   * a LATER React commit than the microtask that resolves `mount()`'s own
   * promise and immediately drives the chain's `next` node. Awaiting this
   * signal too — not just `bootstrap` — closes that race.
   *
   * Called synchronously at the end of `handleAttached`, once this domain's
   * own opening mounts have been dispatched (or deferred behind the
   * enclosing entry) — not awaited, since `mfes` serializes each subject's
   * mount/unmount and this component relies on that ordering rather than on
   * any settlement of its own. If a chain's `next` continuation dispatched a `mount_ext` for this
   * domain before `DefaultExtensionMounter` had a root attached, it would
   * reject with "no root attached for domain ...". Calling this signal only
   * after the opening dispatch closes that race: any later `mount_ext` for
   * an extension the opening dispatch already mounted lands on the cheap,
   * safe `mountState === 'mounted'` early-return in `mountExtension` instead
   * of racing the root-attach timing a second time.
   */
  readonly onDomainAttached: () => void;
}

function WidgetsHostScreen({
  bootstrap,
  registry,
  onDomainAttached,
}: WidgetsHostScreenProps): React.ReactElement {
  const [widgetsDomain, setWidgetsDomain] = useState<ExtensionDomain | undefined>();
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    bootstrap
      .then((domain) => {
        if (!cancelled) setWidgetsDomain(domain);
      })
      .catch((err) => {
        const msg = err instanceof Error ? err.message : String(err);
        console.error('[demo-mfe widgets-host] runtime bootstrap failed:', err);
        if (!cancelled) setError(msg);
      });
    return () => {
      cancelled = true;
    };
  }, [bootstrap]);

  // `ExtensionDomainSlot` renders only once `widgetsDomain` is set (below), so
  // by the time this fires `widgetsDomain` is always defined — the non-null
  // assertion mirrors that render-gating rather than asserting past it.
  //
  // The registry starts this routed domain when the slot below attaches its
  // root — this handler only runs the auto-mount-on-attach pass.
  const handleAttached = (): void => {
    // Widgets Host's auto-mount-on-attach pass sends each `mount_ext` with
    // history intent `replace`; the runtime's `reflect` commands to the
    // injected router (ADR 0036) write each one into the URL, so this domain
    // builds no routing wiring of its own.
    const ids = registry.getExtensionsForDomain(WIDGETS_DOMAIN_ID).map((e) => e.id);
    for (const id of ids) {
      registry.executeActionsChain({
        action: { type: FRONTX_ACTION_MOUNT_EXT, target: WIDGETS_DOMAIN_ID, payload: { subject: id, history: 'replace' } },
      });
    }
    onDomainAttached(); // mount() resolves once the opening dispatch is made
  };

  if (error) {
    return (
      <div
        className="px-0 py-4 sm:p-4 text-red-700"
        data-demo-mfe-widgets-host="error"
      >
        Widgets host runtime failed: {error}
      </div>
    );
  }

  if (!widgetsDomain) {
    return (
      <div className="px-0 py-4 sm:p-4" data-demo-mfe-widgets-host="loading">
        Loading widgets host runtime…
      </div>
    );
  }

  const pingTargets = registry
    .getExtensionsForDomain(WIDGETS_DOMAIN_ID)
    .filter((ext) => {
      const entry = registry.typeSystem.getSchema(ext.entry) as
        | { actions?: readonly string[] }
        | undefined;
      return entry?.actions?.includes(WIDGET_PING_ACTION_TYPE) ?? false;
    });

  // `executeActionsChain` returns nothing awaitable: the chain is fire-and-forget.
  const handlePing = (extensionId: string): void => {
    registry.executeActionsChain({ action: { type: WIDGET_PING_ACTION_TYPE, target: extensionId, payload: {} } });
  };

  return (
    <div
      data-demo-mfe-widgets-host="true"
      className="flex h-full flex-col gap-2 px-0 py-4 sm:p-4"
    >
      <header>
        <h2 className="text-xl font-semibold">Widgets Host</h2>
        <p className="text-sm opacity-75">
          Multi-mount fixture: widgets-fixture-a's entry is wired here as
          two distinct extension instances (alpha and beta) sharing the same
          entry path; widgets-fixture-b's entry is wired as a third
          instance. All three render concurrently in the widgets domain
          slot below.
        </p>
      </header>
      <div className="flex flex-wrap gap-2">
        {pingTargets.map((ext) => {
          const role = ext.id.includes('widget_alpha') ? 'alpha' : 'beta';
          return (
            <button
              key={ext.id}
              type="button"
              data-testid={`ping-${role}`}
              data-target-extension-id={ext.id}
              onClick={() => handlePing(ext.id)}
              className="rounded border border-blue-400 bg-blue-100 px-3 py-1 text-sm text-blue-900 hover:bg-blue-200"
            >
              Ping {role}
            </button>
          );
        })}
      </div>
      <ExtensionDomainSlot
        registry={registry}
        domainId={WIDGETS_DOMAIN_ID}
        className="demo-mfe-widgets-host-slot"
        onAttached={handleAttached}
      />
    </div>
  );
}

class DemoMfeWidgetsHostLifecycle extends ThemeAwareReactLifecycle {
  /**
   * The `bootstrapWidgetsRuntime(...)` promise started synchronously (before
   * any `await`) inside `mount()`, and awaited by `mount()` itself before
   * `mount()`'s own returned promise settles. This is what closes the async
   * race: `registry.registerDomain(widgetsDomain, ...)` — the call that
   * makes the widgets domain routable/forward-able from the shell's
   * mediator — happens inside this promise's chain, and `mount()` does not
   * resolve until it has completed. `WidgetsHostScreen` also subscribes to
   * this SAME promise (passed down as a prop) purely to drive its own
   * loading/error UI; it never re-invokes `bootstrapWidgetsRuntime`.
   */
  private bootstrapPromise: Promise<ExtensionDomain> | undefined;

  /**
   * Resolves once `ExtensionDomainSlot`'s `onAttached` callback has fired for
   * the widgets domain and this screen has dispatched (or deferred behind the
   * enclosing entry) the opening `mount_ext` for every extension currently
   * registered on this domain — i.e. `DefaultExtensionMounter.attach(root)`
   * has actually run, so the domain has a DOM root to mount into. The
   * dispatches are not awaited, so it does not mean those mounts have
   * settled. `mount()` awaits this ALONGSIDE `bootstrapPromise` (see
   * that field's doc comment for why `registerDomain` completing is
   * necessary but not sufficient): `ExtensionDomainSlot` only renders — and
   * only then, on a LATER React commit, attaches — once
   * `bootstrapPromise` has resolved. Without also awaiting this signal, a
   * chain's `next` continuation targeting this domain (routable as soon as
   * `bootstrapPromise` resolves) can reach `ConcurrentMountStrategy.mount()`
   * before the mounter has a root, and `DefaultExtensionMounter.mount()`
   * throws "no root attached for domain ...".
   */
  private domainAttachedPromise: Promise<void> | undefined;

  /**
   * Resolve function for `domainAttachedPromise`, wired to `WidgetsHostScreen`'s
   * `onDomainAttached` prop each `mount()`. Set synchronously inside `mount()`
   * before `WidgetsHostScreen` is rendered, so the prop is always defined by
   * the time the component's `handleAttached` callback could possibly fire.
   */
  private onDomainAttached: () => void = () => {};

  constructor() {
    super(widgetsHostApp);
  }

  async mount(container: Element | ShadowRoot, bridge: ChildMfeBridge, mountContext?: MfeMountContext): Promise<void> {
    // Read here — synchronously inside this override, before any `await` and
    // before delegating to `ThemeAwareReactLifecycle.mount()` (which is what
    // actually calls `createRoot(...).render(...)`) — so the registry's
    // construction happens strictly within the ambient mounting-bridge
    // rendezvous window `DefaultMountManager.mountExtension` opens around the
    // synchronous portion of this very call. Reading it lazily inside a React
    // hook instead risks the rendezvous window having already closed by the
    // time React actually runs the component's initial render. After the
    // first mount the registry already exists and this read returns it.
    const registry = widgetsHostApp.mfeRegistry;
    if (!registry) {
      throw new Error('demo-mfe widgets-host: app.mfeRegistry is undefined.');
    }

    // Kick off the manifest fetch + domain-registration bootstrap
    // synchronously (still within the same synchronous prefix as the
    // registry read above — invoking an async function runs its
    // body up to its first `await` synchronously). `super.mount()` then
    // renders `WidgetsHostScreen`, which receives this same promise to
    // drive its own loading/error UI without re-triggering bootstrap.
    this.bootstrapPromise = bootstrapWidgetsRuntime(widgetsHostApp);

    let resolveDomainAttached!: () => void;
    this.domainAttachedPromise = new Promise<void>((resolve) => {
      resolveDomainAttached = resolve;
    });
    this.onDomainAttached = resolveDomainAttached;

    super.mount(container, bridge, mountContext);

    // `DefaultMountManager` awaits whatever this override returns (its
    // `void | Promise<void>` mount() contract) and only marks the extension
    // `mounted` — and only lets a chain's `next` continuation dispatch —
    // after that await settles. Awaiting both promises here, rather than
    // leaving either to fire-and-forget inside a React effect, is what
    // closes BOTH races: `registerDomain` making the domain routable
    // (`bootstrapPromise`), and `DefaultExtensionMounter.attach(root)` giving
    // it somewhere to actually mount into (`domainAttachedPromise`) — see
    // each field's doc comment. If `bootstrapPromise` rejects,
    // `Promise.all` rejects immediately without waiting on
    // `domainAttachedPromise` (which would otherwise never resolve, since
    // `WidgetsHostScreen` never renders `ExtensionDomainSlot` on the error
    // path).
    await Promise.all([this.bootstrapPromise, this.domainAttachedPromise]);
  }

  protected renderContent(): React.ReactNode {
    if (!this.bootstrapPromise || !this.domainAttachedPromise) {
      throw new Error(
        'demo-mfe widgets-host: renderContent() called before mount() started the bootstrap.',
      );
    }
    const registry = widgetsHostApp.mfeRegistry;
    if (!registry) {
      throw new Error(
        'demo-mfe widgets-host: nested app has no mfeRegistry.',
      );
    }
    return (
      <WidgetsHostScreen
        bootstrap={this.bootstrapPromise}
        registry={registry}
        onDomainAttached={this.onDomainAttached}
      />
    );
  }
}

const lifecycle = new DemoMfeWidgetsHostLifecycle();
export default lifecycle;
