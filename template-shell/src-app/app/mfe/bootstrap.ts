/**
 * MFE Bootstrap
 *
 * Registers the domains the host implements and the extensions of the MFE
 * manifests with the FrontX app.
 *
 * MFE manifest configs are fetched at runtime from `generated-mfe-manifests.json`
 * in the shell's own folder (`manifestsUrl`), a public asset produced by
 * `scripts/generate-mfe-manifests.ts` before each `vite dev` / `vite build`. The
 * JSON shape is identical to what the future backend API will return so the
 * transport swap is a one-line URL change here.
 *
 * A screen's `publicPath` in the file may be relative: the production layout
 * (`scripts/layout-dist.ts`) writes `mfe/<package>/`. The MFE handler resolves
 * it against the document, which the shell is served as from its own folder,
 * the folder the file sits in. The entries are registered exactly as the file
 * carries them, so every runtime that registers them from the same file (a
 * nested app's own bootstrap included) registers the same content.
 */

import {
  FRONTX_SHARED_PROPERTY_THEME,
  FRONTX_SHARED_PROPERTY_LANGUAGE,
} from '@gears-frontx/react';
import type {
  FrontXApp,
  Extension,
  ExtensionDomain,
  MfManifest,
  MfeEntryMF,
  JSONSchema,
  MfeRegistry,
} from '@gears-frontx/react';
import { menuLabels, type LabelDictionaryManifest } from './menuLabels';

const MFE_MANIFESTS_FILE = 'generated-mfe-manifests.json';

/**
 * Where the manifest aggregate is served: in the shell's own folder.
 *
 * A build with a relative base (`./`, the production build) resolves it
 * against this module's own address rather than the document's: the document
 * can sit at any address the hosting answers with `index.html`, while every
 * built module lives in the shell's `assets/` folder (`build.assetsDir` in
 * vite.config.ts), one level below the aggregate. An absolute base (the dev
 * server's `/`) is used as it is.
 *
 * @param base - The build's base (`import.meta.env.BASE_URL`)
 * @param moduleUrl - The address of the module asking (`import.meta.url`)
 */
export function manifestsUrl(base: string, moduleUrl: string): string {
  if (base === '' || base.startsWith('.')) {
    return new URL(`../${MFE_MANIFESTS_FILE}`, moduleUrl).href;
  }
  return new URL(`${base.endsWith('/') ? base : `${base}/`}${MFE_MANIFESTS_FILE}`, moduleUrl).href;
}

/**
 * Shape of each MFE manifest config in the generated JSON.
 * Matches the output of scripts/generate-mfe-manifests.ts. `extensions` is
 * optional because an MFE may declare only loadable entries (with no
 * default wiring); the consumer chooses how those entries get wired into
 * domains. Self-declared `extensions[]` are still supported for MFEs that
 * propose default wirings the host should pick up. `domains` is optional
 * because most MFEs target host-owned domains; an MFE declares `domains`
 * only when it owns an ExtensionDomain instance (e.g., demo-mfe owns the
 * widgets domain — registered here so extensions targeting that domain
 * resolve content-addressed at the runtime store).
 */
interface MfeManifestConfig {
  manifest: MfManifest;
  domains?: ExtensionDomain[];
  entries: MfeEntryMF[];
  extensions?: Extension[];
  schemas?: JSONSchema[];
  labelDictionaries?: LabelDictionaryManifest[];
}

/**
 * First pass over every package: register every schema with an `$id` it
 * ships (its action types, and any derived `ExtensionDomain` or `Extension`
 * type a parent MFE declares) before any instance. A domain or entry names action types and an
 * extension chains through derived types by GTS type reference, which the
 * store requires to exist, so registering every package's schemas first keeps
 * the walk independent of the order of `generated-mfe-manifests.json`.
 * `registerSchema` resolves no reference and keeps the first definition of an
 * id (`cpt-frontx-algo-gts-type-provider-schema-write` in gears-frontx), so
 * the order within this pass does not matter.
 */
function registerAllSchemas(
  registry: MfeRegistry,
  manifests: readonly MfeManifestConfig[],
): void {
  for (const config of manifests) {
    for (const schema of config.schemas ?? []) {
      if (schema.$id) registry.typeSystem.registerSchema(schema);
    }
  }
}

/**
 * Returns true when the given domain ID is registered on the host registry —
 * i.e., this host owns the domain and is responsible for registering its
 * extensions. Foreign-domain extensions (those whose target domain is owned by
 * a different runtime, like the widgets domain owned by demo-mfe's child
 * FrontX app) MUST NOT be registered on the host registry; they reach their
 * owning runtime through a content-addressed dispatcher (see
 * `cpt-frontx-algo-framework-composition-content-addressed-discovery`).
 */
function hostOwnsDomain(registry: MfeRegistry, domainId: string): boolean {
  return registry.getDomain(domainId) !== undefined;
}

/**
 * Registers one package's manifest, domains and entries, after every
 * package's schemas and before any package's extensions. Runs for every
 * package before any extension is
 * registered, because an extension's `domain` and `entry` are GTS instance
 * references the store requires to exist, and a package's extension may name
 * a domain another package declares (widgets-fixture-a's widgets target the
 * widgets domain demo-mfe declares), whatever order the manifests come in.
 */
function registerMfePackageEntities(
  registry: MfeRegistry,
  config: MfeManifestConfig,
): void {
  // register() validates each instance against its schema and throws on
  // failure — invalid manifests/entries fail startup loudly rather than
  // persisting broken state into the registry. The aggregator script inlines
  // the resolved MfManifest object into each entry's `manifest` field so the
  // host registers entries opaquely — no spread/override needed here.
  registry.typeSystem.register(config.manifest);
  // Registration order: every package's schemas, then manifest → domains →
  // entries per package, then every package's extensions (`bootstrapMFE`).
  // Domains MUST be registered before any extension references them so the
  // content-addressed dispatcher can resolve target-domain ownership at the
  // GTS runtime store. Domain registration is opaque — the aggregator passes
  // each `ExtensionDomain` instance through verbatim.
  for (const domain of config.domains ?? []) {
    console.info(`[MFE Bootstrap] Registering domain ${domain.id}`);
    registry.typeSystem.register(domain);
  }
  for (const entry of config.entries) {
    registry.typeSystem.register(entry);
  }
}

/** Registers one package's extensions, after every package's entities. */
async function registerMfePackageExtensions(
  registry: MfeRegistry,
  config: MfeManifestConfig,
): Promise<void> {
  for (const extension of config.extensions ?? []) {
    // Only extensions whose target domain is owned by this host registry are
    // registered here. Extensions targeting a domain owned by another FrontX
    // app (e.g., widgets-fixture-a's two widget extensions target the widgets
    // domain owned by demo-mfe's child app) are dispatched to the owning
    // runtime by that runtime's own bootstrap.
    if (!hostOwnsDomain(registry, extension.domain)) {
      // This host doesn't own the target domain, so it must not admit/mount
      // this extension — but it still needs the declaration present on its
      // own type system: a registry's type system is not
      // guaranteed to share the realm store (an isolated `GtsPlugin` does
      // not), and `x-gts-instance-ref` admission validation for an
      // action originating here (e.g. Hello World's ping dispatched at the
      // shell's own registry, escalating down to widget-a two hops away)
      // checks referenced entities against THIS store, before the action
      // ever reaches cross-hop routing. Registering opaquely here (no
      // `registerExtension`/mounting) mirrors the widgets-host's own
      // registration of foreign-domain entities in
      // `bootstrapWidgetsRuntime`.
      registry.typeSystem.register(extension);
      continue;
    }
    await registry.registerExtension(extension);
    // The extension's own entry address, if it declares a route, is
    // supplied automatically at mount through the router's occupant value —
    // no shared-property broadcast to keep in step with registration.
  }
}

/**
 * Registers one extension domain this host implements, together with the
 * types its declaration names, on `app`'s registry.
 */
export type DomainRegistration = (app: FrontXApp) => void;

/**
 * Bootstrap MFE system for the host application.
 *
 * Runs each of `domains` first, so every domain the host implements is
 * registered before the manifest walk decides, per extension, whether this
 * host admits it (`hostOwnsDomain`). The registry admits an extension only
 * when its domain is already registered, and an extension whose domain is
 * not on the type system at all fails the walk, so a domain registered after
 * the walk admits none of the extensions the manifests declare for it. The registry
 * admits each routed domain to the router of `@gears-frontx/routing` that
 * the framework injects into it, and starts and stops the domain when its
 * root attaches and detaches; this function builds no routing wiring. It then
 * broadcasts the initial shared properties (theme, language) and
 * asynchronously registers the extensions declared in
 * `generated-mfe-manifests.json`.
 *
 * Mount/unmount lifecycle is not driven here.
 *
 * @param app - FrontX application instance
 * @param domains - The registrations of the domains this host implements
 */
export async function bootstrapMFE(app: FrontXApp, domains: readonly DomainRegistration[]): Promise<void> {
  const registry = app.mfeRegistry;
  if (!registry) {
    throw new Error('[MFE Bootstrap] mfeRegistry is not available on app instance');
  }

  for (const registerDomain of domains) {
    registerDomain(app);
  }

  const currentThemeId = app.themeRegistry?.getCurrent()?.id ?? 'default';
  registry.updateSharedProperty(FRONTX_SHARED_PROPERTY_THEME, currentThemeId);
  const derivedLanguage = app.i18nRegistry.getLanguage();
  registry.updateSharedProperty(FRONTX_SHARED_PROPERTY_LANGUAGE, derivedLanguage ?? 'en');

  const aggregateUrl = manifestsUrl(import.meta.env.BASE_URL, import.meta.url);
  console.info(`[MFE Bootstrap] Fetching MFE manifests from ${aggregateUrl}`);
  const response = await fetch(aggregateUrl);
  if (!response.ok) {
    throw new Error(
      `[MFE Bootstrap] Failed to load MFE manifests from ${aggregateUrl}: ${response.status} ${response.statusText}`,
    );
  }
  const manifests = (await response.json()) as MfeManifestConfig[];

  if (manifests.length === 0) {
    console.warn(
      '[MFE Bootstrap] No MFE manifests found. Run `npm run generate:mfe-manifests` to generate them.',
    );
    return;
  }
  // Three passes, each over every package, so no reference to a type,
  // manifest, domain or entry depends on manifest order: schemas, then
  // manifests, domains and entries, then extensions. Extensions are checked
  // one by one, so one extension referencing another needs it earlier.
  registerAllSchemas(registry, manifests);
  for (const config of manifests) {
    registerMfePackageEntities(registry, config);
  }
  for (const config of manifests) {
    await registerMfePackageExtensions(registry, config);
  }
  menuLabels.configure(manifests, aggregateUrl, registry.typeSystem);
}
