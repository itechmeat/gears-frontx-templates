# Guideline: The `src-app/mfe_packages/*` Contract

template-shell discovers, builds, and aggregates MFE packages under
`src-app/mfe_packages/*` **by convention, not by name** — none of the shell's
scripts or configs reference a specific MFE package name (only glob/scan). This
is the concrete, code-verified shape every directory under that path must have
to be picked up. It is the same shape `template-mfe` ships (`demo-mfe`,
`_blank-mfe`, `widgets-fixture-a`, `widgets-fixture-b`); any other source of MFE
packages (hand-authored, generated, a different template) must match it too.

This guideline is a snapshot of what the shell-owned scanners actually check —
not a separate spec. If the scanners change, this file must be updated to match
(`scripts/lib/mfe-tools.ts`, `scripts/generate-mfe-manifests.ts`).

## Directory-level rules

- Must live directly under `src-app/mfe_packages/<name>/`.

Three scanners read this directory: manifest generation
(`generate:mfe-manifests`), dev/build discovery (`getMFEPackages`, behind
`dev:all` and `build:mfes`), and `type-check:mfe`. Every rule below holds in all
three, on one shared predicate per rule rather than a copy each.

- `<name>` must not start with `.` and must not be `shared` — all three exclude
  these (`shared` is reserved for cross-MFE helper code the isolation boundary
  still applies to; it is never itself an MFE).
- A package whose `mfe.json` declares `"templateExample": true` is excluded by
  all three as well. It is content a template ships to be read and copied - a
  worked example, or the scaffold new packages are copied from - and a project
  that registered it would offer screens nobody asked for. Setting
  `FRONTX_INCLUDE_TEMPLATE_EXAMPLES` to exactly `1` puts those packages back
  into all three at once, for a run that means to watch the shipped examples
  work. A package copied from a flagged scaffold **must drop the flag**, or the
  copy is invisible to the shell for the same reason the scaffold is; the
  `add-mfe-package` procedure strips it as part of the copy so this cannot be
  forgotten. The root `workspaces` glob is not one of the three - it installs a
  flagged package unconditionally, so `npm install` keeps working on a scaffold.
  The compile guarantee for a flagged example rests on `type-check:mfe` with
  `FRONTX_INCLUDE_TEMPLATE_EXAMPLES=1`, which the `template-validate` composition
  job in CI sets for exactly that reason: every package it composes is a flagged
  example, so without the opt-in it would compile nothing.

## Required files

1. **`package.json`** with a `preview` or `dev` script that carries a literal
   `--port <N>` flag (e.g. `"preview": "vite preview --port 3010"`).
   `scripts/lib/mfe-tools.ts`'s `getMFEPackages()` (used by `dev-all.ts` and
   `build-mfes.ts`) tries `preview` first, falls back to `dev`, and extracts the
   port with `/--port\s+(\d+)/` — a differently-spelled flag (`--port=3010`, no
   space) will not match and the package is silently skipped with a warning.
   The port is strict and the package's own: the dev manifest addresses the
   package at it, so `dev:all` stops before building any screen package when two
   packages declare the same port or the port is taken on a loopback address,
   naming the port and the packages, and starts the preview with `--strictPort`
   so it never moves to another port (`scripts/lib/preview-ports.ts`). `dev:all`
   starts every package with `npm run preview -- --strictPort`, so a package
   needs a `preview` script to be started; a `dev` script only supplies the port.
2. **`mfe.json`** at the package root. This is the actual discovery predicate
   `scripts/generate-mfe-manifests.ts`'s `discoverPackages()` checks for — a
   directory without it is invisible to manifest generation even if it has a
   valid `package.json`. Declares `manifest` (this package's own MF manifest
   ID), `entries[]` (exposed modules + required/optional shared properties +
   actions), and `extensions[]` (domain + presentation metadata per screen or
   widget the package contributes), plus the optional `templateExample` flag
   described above. Optional `labelDictionaries[]` entries name a supported language code (`gts.frontx.i18n.lang.code.v1~`, each at most once) and a JSON file relative to the MFE's served root. Put those files in `public/labels/`. Each is an instance of `gts.frontx.i18n.dict.screen_labels.v1~`: `type` set to that id, `language` equal to the manifest entry's, and `labels` as `{ extension, label }` items naming only this package's own screen extensions, each once, with a non-empty label (the `template-mfe` `navigation-contribution` guideline shows one). Manifest generation fails the build on a missing or non-conforming file; a dictionary that cannot be loaded at runtime is ignored and the menu shows `presentation.label`. See the `gts-id-conventions` guideline in the `template-mfe`
   AI bundle for the ID taxonomy these fields use.
3. **`vite.config.ts`** that runs `@module-federation/vite`'s `federation()`
   plugin, then `frontxMfGts()` (imported from
   `@gears-frontx/frontx-template-shell/build/mf-gts`) with `enforce: 'post'` so
   it runs after federation. Building without `frontxMfGts()` fails manifest
   generation with an explicit error naming the missing plugin. The config's
   `sharedDeps` constant (which feeds `rollupOptions.external`) always
   includes `@gears-frontx/routing`, so each MFE runtime evaluates exactly one
   copy of it, never shared across MFEs: the copy the MFE's registry receives
   must be the copy `<ExtensionRouter>` and `navigation()` read. The
   constant includes `@gears-frontx/routing-tanstack` only when the MFE renders
   `<ExtensionRouter>` or calls `navigation()`. A package declares each of the
   two it lists in its own `package.json` too, at an exact version
   (`@gears-frontx/routing-tanstack` under `dependencies`), so it resolves from
   the package's own root without relying on hoisting, and
   `policy:template-pin-drift` checks its version.

## Build-output contract (produced by `vite build`, consumed by the shell)

- `dist/mf-manifest.json` — the raw Module Federation manifest, written by
  `@module-federation/vite` itself.
- `dist/mfe-manifest.json` — the **enriched** manifest `frontxMfGts()` writes in
  its `closeBundle` hook: `mfe.json` merged with `dist/mf-manifest.json`'s
  `metaData`/`exposes`, plus resolved shared-dependency versions and standalone
  ESM chunk paths. `scripts/generate-mfe-manifests.ts` reads **this** file, not
  `mf-manifest.json` directly, and throws if it is missing or was not built by
  a `frontxMfGts()`-configured pipeline.
- `npm run build` copies the `dist/` of each package the aggregate carries
  into the shell's `dist/mfe/<name>/` (`scripts/layout-dist.ts`, which finds
  packages by the same rules as manifest generation and refuses a manifest id
  two packages declare), leaving out `index.html`,
  `mf-stats.json`, every top-level `@mf-types` entry and
  `mfe-manifest.json`, and addresses the package there in the shell's
  `dist/generated-mfe-manifests.json` as
  `mfe/<name>/`. Everything else a package build writes (`remoteEntry.js`,
  `mf-manifest.json`, `assets/`, `shared/`, its `public/` files) is deployed.

## Shared dependencies

The strings in `build.rollupOptions.external` are the package's shared
dependencies. Rollup leaves their imports bare, `frontxMfGts()` builds each one
into a standalone ESM file under `dist/shared/`, and at runtime the handler
points every bare import at that file. ES modules link by name, so
`frontxMfGts()` fails the build when a chunk imports a name that the shared
chunk for that package does not export. The error names the chunk, the name
and the package. When the importing chunk is itself a shared chunk, the two
packages' installed versions most likely do not fit each other. A shared chunk
does not export a name that two of its `export * from` lines supply from
different bindings, as ES modules link it, so importing that name fails the
build too. This happens when two shared packages each bundle their own copy of
a third package they both re-export; sharing the third package as well fixes it.

A CommonJS package needs one more step. esbuild gives its chunk only a default
export, the package's whole `module.exports`, so `frontxMfGts()` finds the
named exports by loading the package with Node's `require()` at build time. A
package that cannot load in Node, for example because it reads `window` when
it loads, keeps only the default export. **Such a package can stay shared if
its users read it through the default import**
(`import pkg from 'pkg'; pkg.name`). A named import of it
(`import { name } from 'pkg'`) fails the build. Switch that import to the
default import, or stop sharing the package: remove it from
`build.rollupOptions.external` and Vite bundles it into the MFE. Names read
through a namespace import (`import * as R from 'react'; R.useState`) cannot be
checked. For a package whose discovery failed they are `undefined`, so the
build warns about such an import, and the default import fixes it.

## CSS delivery into shadow roots

MFE screens render inside open shadow roots, and shadow roots do not see the
host document's stylesheets by default. Three delivery paths exist; pick by
what the package owns:

1. **No package-owned CSS (the `template-mfe` examples).** The host's compiled
   Tailwind covers `src-app/mfe_packages/**` content paths, and
   `ThemeAwareReactLifecycle.adoptHostStylesIntoShadowRoot()` clones every host
   `<style>`/`<link>` into the shadow root. A package that only uses Tailwind
   utilities and UI-kit components needs no stylesheet of its own.
   The copy is taken once, at mount, from the host `<head>` as it is then. A
   stylesheet the host adds or changes later — a lazily loaded chunk's CSS, a
   rule a CSS-in-JS library inserts after mount, a Vite dev-mode update —
   reaches a mounted MFE only on its next remount. Everything this path relies
   on is in the head before any MFE mounts: the shell's entry
   (`src-app/app/main.tsx`) imports `globals.css`, which holds the compiled
   Tailwind. What the copy carries is the host's own stylesheets: globals, the
   theme tokens, and the kit CSS of the components the host itself uses; a
   screen's kit CSS arrives through its manifest (path 2), not through this
   copy. Theme changes are not affected: the shell's theme variables reach the
   shadow root through CSS inheritance, not through the copy.
2. **Package-owned CSS imported plainly (the default).** A plain
   `import './styles.css'` or a CSS Module (`import styles from
   './x.module.css'`) is extracted by Vite into a CSS file per chunk
   (`build.cssCodeSplit: true`, which every package in `template-mfe` sets),
   and the host injects into the shadow root exactly the CSS files
   `dist/mfe-manifest.json` lists for the expose (`exposeAssets.css`).
   `@module-federation/vite` lists only the CSS of the expose's own chunk; when
   several exposes import one styled module, Rollup puts its CSS into a chunk
   they share, and federation lists that file for none of them.
   `frontxMfGts()` completes the lists: every expose gets the CSS files of the
   chunks it reaches, static imports in `css.sync`, chunks reached only
   through a dynamic import in `css.async`. The host appends the files in list
   order, so each list puts a chunk's CSS after the CSS of what it imports,
   and `css.sync` ends with the expose's own CSS. A CSS-only module several
   chunks share (a plain `.css` file imported from more than one place) gets a
   file Vite folds into every importer; it is listed wherever an importer is
   reached, ahead of that importer's own file. A stylesheet imported directly
   through a dynamic import (`import('./theme.css')`) gets a CSS-only chunk
   Vite removes; its file is listed in `css.async` for every expose that
   reaches the import, and Vite turns the import itself into an empty
   module (the lazy-import transform leaves it to Vite). A stylesheet
   imported that way that compiles to no CSS gets an empty chunk Vite
   keeps; its import goes through `__frontx_lazy` like any other lazy chunk.
   Every CSS file of the chunks an expose reaches is listed, a file built
   only from `node_modules` stylesheets (UI-kit component styles) included:
   the screen is styled at its own kit version, so its kit rules must arrive
   with it rather than rely on the host's. Rules the host also adopts are
   duplicated; that is harmless at the same kit version, and at a different
   one the screen's own rules win, appended after the adopted copy. Files
   federation already lists for an expose stay in its list, so a stylesheet
   the expose module imports itself, from `node_modules` or not, is delivered.
   Whatever
   package-own CSS is still unlisted (with `cssCodeSplit: false` all CSS goes
   into one file no chunk names) fails the build for an expose that would get
   no CSS at all; that check covers every stylesheet language Vite compiles to
   CSS (`.css`, `.less`, `.sass`, `.scss`, `.styl`, `.stylus`, `.pcss`,
   `.postcss`, `.sss`), not only `.css`. Imports Vite does not extract
   (`?inline`, `?raw`, `?url`) are not CSS to deliver and never fail it.
3. **`?inline` + `initializeStyles()`, for a plain stylesheet one lifecycle
   owns.** Import the stylesheet as a string (`import styles from
   './styles.css?inline'`) and append it in an `initializeStyles(container)`
   override (the `ThemeAwareReactLifecycle` hook) via a `<style>` element.
   Delivery then travels with the lifecycle chunk itself. It does not suit a CSS
   Module: the string carries no class map, so components reading
   `styles.frame` get `undefined`.

**Package-owned CSS must never carry Tailwind's preflight (`@tailwind base` /
the `@import "tailwindcss"` base layer).** A second preflight inside the shadow
root — one the package compiled itself — lands after the UI-kit component CSS
and its element resets (`button { background: transparent }` and friends)
visibly break kit controls. A package-owned stylesheet destined for
`initializeStyles()` must contain the utilities and components layers only;
`injectBaseResets()` already provides the box-model resets a shadow root needs.
This rule is about path 2 and 3 stylesheets. The shell's own preflight does
reach the shadow root through path 1 (`adoptHostStylesIntoShadowRoot()` clones
every host stylesheet), and the lifecycle deliberately neutralises it — see the
counter-declarations in `ThemeAwareReactLifecycle`.

## What the shell does with a conforming package

- `npm run dev:all` (`scripts/dev-all.ts`) builds every conforming package,
  starts its preview server on the port read from step 1, and runs the host.
- `npm run build:mfes` (`scripts/build-mfes.ts`) builds every conforming
  package with zero MFEs present, printing "skipping" and exiting 0 — the
  shell-only seed (no `template-mfe` applied) must stay green.
- `npm run generate:mfe-manifests` aggregates every package's
  `dist/mfe-manifest.json` into `public/generated-mfe-manifests.json`, the file
  every FrontX app instance (host or nested) reads at runtime to discover MFEs.
  It addresses each package at its preview port; the production copy in `dist/`
  addresses it as `mfe/<name>/`, a path the MFE loader resolves against the
  shell's page (the document), so the file has to be served from the folder
  of the shell's `index.html`.
- `npm run type-check:mfe` (`scripts/run-mfe-type-checks.ts`) type-checks every
  conforming, non-example package independently; it degrades to a no-op when
  none exist. A flagged package is skipped unless
  `FRONTX_INCLUDE_TEMPLATE_EXAMPLES` is set to `1`, same as manifest generation
  and dev/build discovery.

## Page chrome a mounted screen can rely on

- **One `h1` per page.** A screen renders its own page heading as one `h1`,
  and keeping it to one is the screen's job. The shell's header holds a
  visually hidden `<h1>FrontX</h1>` (`src-app/app/layout/Header.tsx`) only while
  no other level-one heading is in the document or an open shadow root
  (`useOtherHeadingOne.ts`): an `h1` without `role` or `aria-level`, an `h1`-`h6`
  without `role` and with `aria-level="1"`, or a `[role="heading"]` with
  `aria-level="1"`. A heading under `hidden` or `aria-hidden="true"` does not
  count, nor, where the browser has `Element.checkVisibility`, one hidden by CSS
  (`display`, `visibility`, `content-visibility`, a closed `<details>`). A screen with
  such a heading therefore does not sit beside a second one from the shell, and
  a screen without one still leaves the page with the shell's. The check runs in
  the frame after a DOM change, a resize, or a `class`/`style`/`data-state` change on a
  heading or its ancestors; a heading shown or hidden by any other route (a
  sibling selector, a stylesheet change) is followed at the next of those. Headings in closed
  shadow roots are not seen.
- **The screen keeps the width on narrow viewports.** Below 768 px the menu
  starts collapsed to its 56 px icon rail, an expanded menu lies over the screen
  behind a backdrop instead of pushing it aside, and the header and screen are inert (out of
  keyboard reach) until the menu collapses again: on choosing a menu item, on a
  screen change, on an Escape no other layer has handled (`preventDefault`), or on the backdrop
  (`src-app/app/layout/useNarrowViewportMenu.ts`). A screen lays itself out for
  the width left beside that rail.

## Non-requirements

- No MFE package name is ever referenced by shell code, config, or scripts —
  every shell-side consumer of this directory (`dev-all.ts`, `build-mfes.ts`,
  `generate-mfe-manifests.ts`, `run-mfe-type-checks.ts`, the `workspaces` glob,
  the `eslint.config.js`/`tsconfig.app.json`/`vitest.config.ts` overrides) reads
  it by glob/scan. Comments in `src-app/app/mfe/bootstrap.ts` may mention example
  MFE names for illustration only — that is documentation, not a dependency.
- The shell does not care how many packages exist under `src-app/mfe_packages/`,
  including zero.
