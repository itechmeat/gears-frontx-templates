// @vitest-environment node

/**
 * Real builds of a fixture MFE package whose exposes share a module that
 * imports a CSS Module (`fixtures/shared-chunk-css`). Rollup hoists that CSS
 * into a chunk the exposes share, and `@module-federation/vite` attributes
 * the shared chunk's CSS file to none of them; the host injects into a
 * screen's shadow root only the files its expose lists, so without the
 * plugin's attribution the screens render without the shared styles. The
 * fixture also covers a lazy chunk that statically imports another chunk
 * with CSS (list order), a CSS-only module Vite folds into its importer
 * (`common.css`), a chunk whose only CSS comes from `node_modules`
 * (`sonner/dist/styles.css`, listed for every expose that reaches it, like
 * any other CSS the walk adds, also when reached only through a lazy chunk
 * or a direct dynamic import), an expose that imports that stylesheet
 * itself (its file is listed), and a build without per-chunk CSS whose
 * exposes share a PostCSS stylesheet (`shared.pcss`) the CSS-delivery guard
 * must catch. Further exposes cover a direct dynamic stylesheet import
 * (`import('./theme.css')`, a CSS-only chunk Vite removes) written plain,
 * with a comment, spaced with double quotes, and through a module that only
 * imports the stylesheet, a lazily imported stylesheet that compiles to no
 * CSS (Vite keeps its empty chunk, which loads like any other lazy chunk),
 * and stylesheets imported only as `?raw` and `?url`, which Vite does not
 * extract. The last cases fail builds whose code loads through
 * `__frontx_lazy` a file the bundle does not have: a chunk another plugin
 * deleted after rendering, and a concatenated path no chunk was built for.
 *
 * The build runs `vite build` in a child process, with NODE_ENV unset and
 * `MFE_VITE_NO_TEST_ENV_CHECK=true`, the federation plugin's documented
 * opt-out of turning itself off under a test runner. Assertions read what
 * the shell consumes: `entries[].exposeAssets` in `dist/mfe-manifest.json`,
 * and for exposes with no entry, `mf-manifest.json`.
 */

import { execFileSync } from 'node:child_process';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';

const fixtureDir = path.join(__dirname, 'fixtures', 'shared-chunk-css');
const viteBin = path.join(__dirname, '..', '..', 'node_modules', 'vite', 'bin', 'vite.js');

interface CssLists {
  sync: string[];
  async: string[];
}

const outDirs: string[] = [];

afterEach(() => {
  for (const dir of outDirs.splice(0)) fs.rmSync(dir, { recursive: true, force: true });
});

/** One child build may take up to its 120 s limit; the global test timeout is shorter. */
const BUILD_TEST_TIMEOUT_MS = 150_000;

function buildFixture(exposes: string, cssCodeSplit = true, extraEnv: Record<string, string> = {}): string {
  const outDir = fs.mkdtempSync(path.join(os.tmpdir(), 'shared-chunk-css-'));
  outDirs.push(outDir);
  const env: Record<string, string | undefined> = {
    ...process.env,
    FIXTURE_EXPOSES: exposes,
    FIXTURE_CSS_CODE_SPLIT: String(cssCodeSplit),
    ...extraEnv,
  };
  delete env.NODE_ENV;
  env.MFE_VITE_NO_TEST_ENV_CHECK = 'true';
  execFileSync(process.execPath, [viteBin, 'build', '--outDir', outDir, '--logLevel', 'error'], {
    cwd: fixtureDir,
    env,
    stdio: 'pipe',
    timeout: 120_000,
  });
  return outDir;
}

/** Drops Vite's content hash so assertions name files, not builds. */
function unhashed(lists: CssLists): CssLists {
  const strip = (f: string): string => f.replace(/-[A-Za-z0-9_-]{8}\.css$/, '.css');
  return { sync: lists.sync.map(strip), async: lists.async.map(strip) };
}

/**
 * Every `import(...)` and `__frontx_lazy(...)` call with a string argument,
 * in any quote style, with any spacing and comments around it.
 */
function dynamicImportCalls(code: string): Array<{ callee: string; target: string }> {
  const gap = String.raw`(?:\s|/\*[\s\S]*?\*/)*`;
  const call = new RegExp(String.raw`\b(import|__frontx_lazy)${gap}\(${gap}(['"\`])([^'"\`]+)\2`, 'g');
  return [...code.matchAll(call)].map((m) => ({ callee: m[1], target: m[3] }));
}

function readJson<T>(file: string): T {
  return JSON.parse(fs.readFileSync(file, 'utf-8')) as T;
}

describe('frontxMfGts shared-chunk CSS attribution', () => {
  it('lists the shared chunk CSS for every expose that declares CSS of its own, before that CSS, and lazy chunk CSS as async with dependencies first', () => {
    const outDir = buildFixture('a,b');
    const enriched = readJson<{ entries: Array<{ exposedModule: string; exposeAssets: { css: CssLists } }> }>(
      path.join(outDir, 'mfe-manifest.json')
    );
    const css = Object.fromEntries(
      enriched.entries.map((e) => [e.exposedModule, unhashed(e.exposeAssets.css)])
    );
    expect(css).toEqual({
      './lifecycle-a': { sync: ['assets/shared.css', 'assets/lifecycle-a.css'], async: [] },
      './lifecycle-b': {
        sync: ['assets/shared.css', 'assets/lifecycle-b.css'],
        async: ['assets/lazy-dep.css', 'assets/lazy-panel.css', 'assets/lazy-other.css'],
      },
    });
  }, BUILD_TEST_TIMEOUT_MS);

  it('builds an expose whose only CSS sits in the shared chunk and lists that CSS for it', () => {
    const outDir = buildFixture('a,b,c');
    const raw = readJson<{ exposes: Array<{ path: string; assets: { css: CssLists } }> }>(
      path.join(outDir, 'mf-manifest.json')
    );
    const exposeC = raw.exposes.find((e) => e.path === './lifecycle-c');
    expect(exposeC && unhashed(exposeC.assets.css)).toEqual({ sync: ['assets/shared.css'], async: [] });
  }, BUILD_TEST_TIMEOUT_MS);

  it('lists CSS that Vite merged from a CSS-only shared chunk into a lazy importer, and the node_modules-only CSS of a chunk two exposes share', () => {
    const outDir = buildFixture('a,b,d,e,f');
    const raw = readJson<{ exposes: Array<{ path: string; assets: { css: CssLists } }> }>(
      path.join(outDir, 'mf-manifest.json')
    );
    const css = Object.fromEntries(raw.exposes.map((e) => [e.path, unhashed(e.assets.css)]));
    expect(css['./lifecycle-f']).toEqual({ sync: [], async: ['assets/common.css'] });
    // lifecycle-d and lifecycle-e share the toolbar chunk, whose own CSS file
    // is built only from `sonner/dist/styles.css`; the walk lists it for both,
    // after the CSS of what that chunk imports.
    expect(css['./lifecycle-d']).toEqual({ sync: ['assets/common.css', 'assets/toolbar.css'], async: [] });
    expect(css['./lifecycle-e']).toEqual({ sync: ['assets/common.css', 'assets/toolbar.css'], async: [] });

    const assetsDir = path.join(outDir, 'assets');
    const vendorCss = fs
      .readdirSync(assetsDir)
      .filter((f) => f.endsWith('.css'))
      .filter((f) => fs.readFileSync(path.join(assetsDir, f), 'utf-8').includes('data-sonner-toaster'));
    expect(vendorCss).toHaveLength(1);
    const listed = raw.exposes.flatMap((e) => [...e.assets.css.sync, ...e.assets.css.async]);
    expect(listed).toContain(`assets/${vendorCss[0]}`);
  }, BUILD_TEST_TIMEOUT_MS);

  it('lists node_modules-only CSS reached only lazily: through a lazy chunk, and through a direct dynamic import Vite removes', () => {
    const outDir = buildFixture('a,b,q,r');
    const raw = readJson<{ exposes: Array<{ path: string; assets: { css: CssLists } }> }>(
      path.join(outDir, 'mf-manifest.json')
    );
    const assetsDir = path.join(outDir, 'assets');
    const vendorCss = fs
      .readdirSync(assetsDir)
      .filter((f) => f.endsWith('.css'))
      .filter((f) => fs.readFileSync(path.join(assetsDir, f), 'utf-8').includes('data-sonner-toaster'))
      .map((f) => `assets/${f}`);
    expect(vendorCss).toHaveLength(1);
    // lifecycle-q imports `lazy-toaster.js`, whose only CSS is
    // `sonner/dist/styles.css`; lifecycle-r imports that stylesheet itself.
    for (const expose of ['./lifecycle-q', './lifecycle-r']) {
      const css = raw.exposes.find((e) => e.path === expose)?.assets.css;
      expect(css, expose).toEqual({ sync: [], async: vendorCss });
    }
  }, BUILD_TEST_TIMEOUT_MS);

  it('keeps the node_modules CSS federation lists for an expose that imports it itself', () => {
    const outDir = buildFixture('a,b,g');
    const raw = readJson<{ exposes: Array<{ path: string; assets: { css: CssLists } }> }>(
      path.join(outDir, 'mf-manifest.json')
    );
    const exposeG = raw.exposes.find((e) => e.path === './lifecycle-g');
    expect(exposeG && unhashed(exposeG.assets.css)).toEqual({ sync: ['assets/lifecycle-g.css'], async: [] });
    const listedFile = path.join(outDir, (exposeG as { assets: { css: CssLists } }).assets.css.sync[0]);
    expect(fs.readFileSync(listedFile, 'utf-8')).toContain('data-sonner-toaster');
  }, BUILD_TEST_TIMEOUT_MS);

  it('lists the CSS of a directly imported lazy stylesheet as async, leaves no dynamic import of a removed file, and builds an expose whose stylesheets are ?raw and ?url only', () => {
    const outDir = buildFixture('a,b,j,k,l,m,n');
    const raw = readJson<{ exposes: Array<{ path: string; assets: { css: CssLists; js: { sync: string[] } } }> }>(
      path.join(outDir, 'mf-manifest.json')
    );
    const exposeCalls = (expose: string): Array<{ callee: string; target: string; exists: boolean }> => {
      const files = raw.exposes.find((e) => e.path === expose)?.assets.js.sync ?? [];
      expect(files.length).toBeGreaterThan(0);
      return files.flatMap((file) => {
        const code = fs.readFileSync(path.join(outDir, file), 'utf-8');
        expect(code).not.toMatch(/theme(-[lmn])?-[A-Za-z0-9_-]{8}\.js/);
        return dynamicImportCalls(code).map((c) => ({
          ...c,
          exists: fs.existsSync(path.join(outDir, path.dirname(file), c.target)),
        }));
      });
    };
    const css = Object.fromEntries(raw.exposes.map((e) => [e.path, unhashed(e.assets.css)]));
    expect(css['./lifecycle-j']).toEqual({ sync: [], async: ['assets/theme.css'] });
    expect(css['./lifecycle-l']).toEqual({ sync: [], async: ['assets/theme-l.css'] });
    expect(css['./lifecycle-m']).toEqual({ sync: [], async: ['assets/theme-m.css'] });
    expect(css['./lifecycle-n']).toEqual({ sync: [], async: ['assets/theme-n.css'] });
    expect(css['./lifecycle-k']).toEqual({ sync: [], async: [] });

    // Plain, commented and spaced, double-quoted forms of `import('./theme*.css')`,
    // and an `import()` of a module that only imports a stylesheet.
    for (const expose of ['./lifecycle-j', './lifecycle-l', './lifecycle-m', './lifecycle-n']) {
      expect(exposeCalls(expose)).toEqual([]);
    }
    // A lazy chunk that stays still loads through the runtime resolver.
    const lazyPanel = exposeCalls('./lifecycle-b');
    expect(lazyPanel.length).toBeGreaterThan(0);
    for (const call of lazyPanel) expect(call).toMatchObject({ callee: '__frontx_lazy', exists: true });
  }, BUILD_TEST_TIMEOUT_MS);

  it('builds an expose that lazily imports a stylesheet compiling to no CSS and loads the chunk Vite keeps through __frontx_lazy', () => {
    const outDir = buildFixture('a,b,o');
    const raw = readJson<{ exposes: Array<{ path: string; assets: { js: { sync: string[] } } }> }>(
      path.join(outDir, 'mf-manifest.json')
    );
    const files = raw.exposes.find((e) => e.path === './lifecycle-o')?.assets.js.sync ?? [];
    expect(files.length).toBeGreaterThan(0);
    const calls = files.flatMap((file) =>
      dynamicImportCalls(fs.readFileSync(path.join(outDir, file), 'utf-8')).map((c) => ({
        ...c,
        exists: fs.existsSync(path.join(outDir, path.dirname(file), c.target)),
      }))
    );
    expect(calls).toEqual([
      { callee: '__frontx_lazy', target: expect.stringMatching(/empty-[A-Za-z0-9_-]{8}\.js$/), exists: true },
    ]);
  }, BUILD_TEST_TIMEOUT_MS);

  it('fails a build without per-chunk CSS when exposes need a shared PostCSS stylesheet no list names', () => {
    let stderr = '';
    try {
      buildFixture('a,b,h,i', false);
    } catch (error) {
      stderr = String((error as { stderr?: Buffer }).stderr ?? '');
    }
    expect(stderr).toMatch(/expose '\.\/lifecycle-h' needs: \S*shared\.pcss/);
    expect(stderr).toMatch(/expose '\.\/lifecycle-i' needs: \S*shared\.pcss/);
  }, BUILD_TEST_TIMEOUT_MS);

  it('fails the build when a chunk still loads through __frontx_lazy a chunk that was deleted after rendering', () => {
    let stderr = '';
    let failed = false;
    try {
      buildFixture('a,b', true, { FIXTURE_SKEW_LAZY_PANEL: 'keep-call' });
    } catch (error) {
      failed = true;
      stderr = String((error as { stderr?: Buffer }).stderr ?? '');
    }
    expect(failed).toBe(true);
    expect(stderr).toMatch(/loads '\.\/lazy-panel-[A-Za-z0-9_-]{8}\.js' through __frontx_lazy, but the bundle has no such file/);
  }, BUILD_TEST_TIMEOUT_MS);

  it('builds when a chunk whose dynamic imports changed after rendering no longer loads the chunk that was deleted', () => {
    const outDir = buildFixture('a,b', true, { FIXTURE_SKEW_LAZY_PANEL: 'drop-call' });
    expect(fs.existsSync(path.join(outDir, 'mfe-manifest.json'))).toBe(true);
    expect(fs.readdirSync(path.join(outDir, 'assets')).filter((f) => /^lazy-panel-.*\.js$/.test(f))).toEqual([]);
  }, BUILD_TEST_TIMEOUT_MS);

  it('fails the build when a chunk loads through __frontx_lazy a concatenated path no chunk has', () => {
    let stderr = '';
    let failed = false;
    try {
      buildFixture('a,b,p');
    } catch (error) {
      failed = true;
      stderr = String((error as { stderr?: Buffer }).stderr ?? '');
    }
    expect(failed).toBe(true);
    expect(stderr).toMatch(/loads '\.\/missing-lazy\.js' through __frontx_lazy, but the bundle has no such file/);
  }, BUILD_TEST_TIMEOUT_MS);
});
