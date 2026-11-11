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
 * itself (its file is listed), and builds without per-chunk CSS the
 * CSS-delivery guard must catch: exposes that share a PostCSS stylesheet
 * (`shared.pcss`), exposes whose only CSS is that `node_modules`
 * stylesheet, and exposes that reach it through static imports of the
 * CSS-only chunk Vite removes, one importing it itself and one through a
 * module. Further exposes cover a direct dynamic stylesheet import
 * (`import('./theme.css')`, a CSS-only chunk Vite removes) written plain,
 * with a comment, spaced with double quotes, and through a module that only
 * imports the stylesheet, a lazily imported stylesheet that compiles to no
 * CSS (Vite keeps its empty chunk, which loads like any other lazy chunk),
 * and stylesheets imported only as `?raw` and `?url`, which Vite does not
 * extract. Two exposes whose only CSS is a stylesheet that compiles to no
 * CSS (`zero-kit/zero.css`, aliased to an empty file because the fixture
 * carries no node_modules) build with per-chunk CSS on and off and list no
 * CSS, and a watch rebuild whose stylesheets stay in Rollup's transform
 * cache keeps them building and listing no CSS. A plugin
 * listed after `frontxMfGts()` that fills the empty stylesheet makes the
 * guard fail again without per-chunk CSS: the recording must see the CSS
 * Vite stores, whatever the user's plugin order, and it must fail the same
 * way when vite:css-post cannot be found to place the recording before it
 * (`FIXTURE_HIDE_CSS_POST`): the recording is then off, also when an
 * earlier build of the same plugin instance in the same process recorded
 * the stylesheet empty (`reused-plugin-builds.mjs`). A watch rebuild of the
 * without-per-chunk-CSS build in which that empty stylesheet gains a rule
 * fails the guard naming the exposes: a recording that only ever added would
 * keep the stale empty recording and let the rebuild pass. The last cases
 * fail builds whose code loads through
 * `__frontx_lazy` a file the bundle does not have: a chunk another plugin
 * deleted after rendering, and a concatenated path no chunk was built for.
 *
 * The build runs `vite build` in a child process, with NODE_ENV unset and
 * `MFE_VITE_NO_TEST_ENV_CHECK=true`, the federation plugin's documented
 * opt-out of turning itself off under a test runner. Assertions read what
 * the shell consumes: `entries[].exposeAssets` in `dist/mfe-manifest.json`,
 * and for exposes with no entry, `mf-manifest.json`. The watch test runs
 * `vite build --watch` in a child process the same way and closes it before
 * returning.
 */

import { execFileSync, spawn, spawnSync, type ChildProcess } from 'node:child_process';
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

/** One expose entry of federation's raw mf-manifest.json. */
type ManifestExpose = { path: string; assets: { css: CssLists } };

const outDirs: string[] = [];
/** Watch children started by the running test, for `afterEach` to kill. */
const watchChildren = new Set<ChildProcess>();

afterEach(async () => {
  // A test that Vitest timed out never reached its `finally`, so its child
  // is still watching: stop it here, which runs after a timeout too, and
  // wait for it to close before the outDir it is still writing into is
  // removed.
  await Promise.all([...watchChildren].map((child) => stopWatchBuild(child)));
  for (const dir of outDirs.splice(0)) fs.rmSync(dir, { recursive: true, force: true });
  // A test that wrote a rule into the fixture's empty stylesheet must have
  // restored it: the fixture ships it empty and every other test relies on
  // that.
  expect(fs.statSync(path.join(fixtureDir, 'src', 'kit-zero.css')).size).toBe(0);
});

/** One child build may take up to its 120 s limit; the global test timeout is shorter. */
const BUILD_TEST_TIMEOUT_MS = 150_000;

/**
 * Builds the fixture in a child process and returns its outDir. A failed
 * build throws an error carrying the child's `stderr`; `onStderr` receives
 * the stderr of a build that passed.
 */
function buildFixture(
  exposes: string,
  cssCodeSplit = true,
  extraEnv: Record<string, string> = {},
  logLevel = 'error',
  onStderr?: (stderr: string) => void
): string {
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
  const result = spawnSync(process.execPath, [viteBin, 'build', '--outDir', outDir, '--logLevel', logLevel], {
    cwd: fixtureDir,
    env,
    stdio: 'pipe',
    timeout: 120_000,
  });
  if (result.error || result.status !== 0) {
    throw Object.assign(result.error ?? new Error(`vite build exited with ${result.status ?? result.signal}`), {
      stderr: result.stderr,
    });
  }
  onStderr?.(String(result.stderr));
  return outDir;
}

/** Drops Vite's content hash so assertions name files, not builds. */
function stripHash(file: string): string {
  return file.replace(/-[A-Za-z0-9_-]{8}\.css$/, '.css');
}

function unhashed(lists: CssLists): CssLists {
  return { sync: lists.sync.map(stripHash), async: lists.async.map(stripHash) };
}

/**
 * The expose's stripped CSS lists, failing the test naming the expose when
 * it is missing instead of hiding it behind an empty-list diff.
 */
function exposeCss(raw: { exposes: ManifestExpose[] }, exposePath: string): CssLists {
  const expose = raw.exposes.find((e) => e.path === exposePath);
  expect(expose, exposePath).toBeDefined();
  return unhashed((expose as ManifestExpose).assets.css);
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

/**
 * One overall budget for the watch test: every wait is derived from the
 * test's start plus `WATCH_TEST_TIMEOUT_MS - WATCH_WAIT_MARGIN_MS`, so slow
 * runs always fail with the child's captured output inside the test timeout
 * instead of Vitest's generic timeout, which reports nothing about the child
 * and leaves it running.
 */
const WATCH_TEST_TIMEOUT_MS = 150_000;
/** Kept back from the test timeout so the waits always fail first. */
const WATCH_WAIT_MARGIN_MS = 15_000;

/**
 * A `vite build --watch` child over the fixture, with its output captured
 * for polling and for the failure message. Vite's watch branch logs one
 * `built in` line per build on Rollup's BUNDLE_END, as
 * `built in ${event.duration}ms.`; the non-watch branch's reporter form
 * (`built in 1.42s`) never appears in a watch child, but the count matches
 * both formats, so counting those lines tells a successful rebuild from a
 * failed one, which only logs its error and keeps watching.
 */
function startWatchBuild(
  outDir: string,
  options: { exposes?: string; cssCodeSplit?: boolean; extraEnv?: Record<string, string> } = {}
): {
  child: ChildProcess;
  buildsSeen: () => number;
  buildsStarted: () => number;
  failed: () => boolean;
  tail: () => string;
  stderrAll: () => string;
} {
  const env: Record<string, string | undefined> = {
    ...process.env,
    FIXTURE_EXPOSES: options.exposes ?? 'a,b,u,v',
    FIXTURE_CSS_CODE_SPLIT: String(options.cssCodeSplit ?? true),
    ...(options.extraEnv ?? {}),
  };
  delete env.NODE_ENV;
  env.MFE_VITE_NO_TEST_ENV_CHECK = 'true';
  const child = spawn(process.execPath, [viteBin, 'build', '--watch', '--outDir', outDir], {
    cwd: fixtureDir,
    env,
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  watchChildren.add(child);
  let stdout = '';
  let stderr = '';
  child.stdout?.on('data', (chunk: Buffer) => {
    stdout += chunk;
  });
  child.stderr?.on('data', (chunk: Buffer) => {
    stderr += chunk;
  });
  // A build failure after the `built in` line: the plugin's closeBundle
  // rejection Vite does not await kills the child (the crash prints the
  // error to stderr), and a build-phase error surfaces through Vite's own
  // error logging.
  const failure = /error during build|CSS imported by an exposed module was not attributed/;
  return {
    child,
    buildsSeen: () => (stdout.match(/built in \d+(?:\.\d+)?(?:ms|s|m)/g) ?? []).length,
    // Vite logs "build started..." on every BUNDLE_START, the first build's too.
    buildsStarted: () => (stdout.match(/build started\.\.\./g) ?? []).length,
    failed: () =>
      child.exitCode !== null ||
      child.signalCode !== null ||
      failure.test(stdout) ||
      failure.test(stderr),
    tail: () => `child stdout tail:\n${stdout.slice(-3000)}\nchild stderr tail:\n${stderr.slice(-3000)}`,
    stderrAll: () => stderr,
  };
}

/**
 * Polls until `predicate` holds or the shared absolute `deadlineMs` passes,
 * naming `what` and the captured output on timeout.
 */
async function waitFor(
  what: string,
  predicate: () => boolean,
  deadlineMs: number,
  context: () => string
): Promise<void> {
  while (Date.now() < deadlineMs) {
    if (predicate()) return;
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  throw new Error(`timed out at the watch deadline waiting for ${what}\n${context()}`);
}

/**
 * Closes the watcher, waiting for the child to be gone before returning:
 * SIGTERM first, SIGKILL only when SIGTERM did not end it in time, and the
 * `close` event waited for after the escalation too (bounded, so a child
 * that never reaps cannot hang the cleanup), because cleanup removes the
 * outDir the child may still be writing into.
 */
async function stopWatchBuild(child: ChildProcess): Promise<void> {
  if (child.exitCode === null && child.signalCode === null) child.kill('SIGTERM');
  await new Promise<void>((resolve) => {
    const timer = setTimeout(() => {
      child.kill('SIGKILL');
      // SIGKILL cannot be handled, but the exit and the stream close still
      // take a moment: wait for `close` here as well, bounded, so the
      // outDir is never removed around a child that has not exited yet.
      const killTimer = setTimeout(resolve, 5_000);
      child.once('close', () => {
        clearTimeout(killTimer);
        resolve();
      });
    }, 10_000);
    child.once('close', () => {
      clearTimeout(timer);
      resolve();
    });
    // A watcher that already died while the test ran emitted `close` before
    // this listener existed.
    if (child.exitCode !== null || child.signalCode !== null) {
      clearTimeout(timer);
      resolve();
    }
  });
  watchChildren.delete(child);
}

/** The expose's CSS lists from the build's mf-manifest.json, or undefined while it is missing. */
function tryReadExposeCss(outDir: string): ManifestExpose[] | undefined {
  try {
    return readJson<{ exposes: ManifestExpose[] }>(path.join(outDir, 'mf-manifest.json')).exposes;
  } catch {
    return undefined;
  }
}

/**
 * The entries of the build's enriched mfe-manifest.json, or undefined while
 * it is missing. The plugin writes this file in its own closeBundle, after
 * the CSS-delivery guard, so its presence per build is that build's proof
 * the guard passed.
 */
function tryReadEnrichedEntries(
  outDir: string
): Array<{ exposedModule: string; exposeAssets: { css: CssLists } }> | undefined {
  try {
    return readJson<{ entries: Array<{ exposedModule: string; exposeAssets: { css: CssLists } }> }>(
      path.join(outDir, 'mfe-manifest.json')
    ).entries;
  } catch {
    return undefined;
  }
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
    const raw = readJson<{ exposes: ManifestExpose[] }>(path.join(outDir, 'mf-manifest.json'));
    const exposeC = raw.exposes.find((e) => e.path === './lifecycle-c');
    expect(exposeC && unhashed(exposeC.assets.css)).toEqual({ sync: ['assets/shared.css'], async: [] });
  }, BUILD_TEST_TIMEOUT_MS);

  it('lists CSS that Vite merged from a CSS-only shared chunk into a lazy importer, and the node_modules-only CSS of a chunk two exposes share', () => {
    const outDir = buildFixture('a,b,d,e,f');
    const raw = readJson<{ exposes: ManifestExpose[] }>(path.join(outDir, 'mf-manifest.json'));
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
    const raw = readJson<{ exposes: ManifestExpose[] }>(path.join(outDir, 'mf-manifest.json'));
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
    const raw = readJson<{ exposes: ManifestExpose[] }>(path.join(outDir, 'mf-manifest.json'));
    const exposeG = raw.exposes.find((e) => e.path === './lifecycle-g');
    expect(exposeG && unhashed(exposeG.assets.css)).toEqual({ sync: ['assets/lifecycle-g.css'], async: [] });
    const listedFile = path.join(outDir, (exposeG as ManifestExpose).assets.css.sync[0]);
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

  it('builds exposes whose only CSS is a stylesheet that compiles to no CSS, with per-chunk CSS on', () => {
    const outDir = buildFixture('a,b,u,v');
    const raw = readJson<{
      exposes: Array<{ path: string; assets: { css: CssLists; js: { sync: string[] } } }>;
    }>(path.join(outDir, 'mf-manifest.json'));
    // `zero-kit/zero.css` compiles to no CSS, so there is no file to deliver:
    // both exposes build with per-chunk CSS on and list no CSS at all.
    const css = Object.fromEntries(raw.exposes.map((e) => [e.path, unhashed(e.assets.css)]));
    expect(css['./lifecycle-u']).toEqual({ sync: [], async: [] });
    expect(css['./lifecycle-v']).toEqual({ sync: [], async: [] });
    for (const expose of ['./lifecycle-u', './lifecycle-v']) {
      const files = raw.exposes.find((e) => e.path === expose)?.assets.js.sync ?? [];
      expect(files.length, expose).toBeGreaterThan(0);
    }
  }, BUILD_TEST_TIMEOUT_MS);

  it('builds exposes whose only CSS is a stylesheet that compiles to no CSS, without per-chunk CSS', () => {
    let stderr = '';
    const outDir = buildFixture('a,b,u,v', false, {}, 'warn', (output) => {
      stderr = output;
    });
    // The recorder is placed before vite:css-post, so the build does not
    // warn that the exclusions are off.
    expect(stderr).not.toContain('could not place the empty-CSS recorder');
    const raw = readJson<{ exposes: ManifestExpose[] }>(path.join(outDir, 'mf-manifest.json'));
    // The empty stylesheet sits in the chunk the two exposes share, so
    // federation credits the single style file to neither of them and both
    // list no CSS: without the empty-CSS recording the guard would fail the
    // build counting it as CSS the lists never name.
    expect(exposeCss(raw, './lifecycle-u')).toEqual({ sync: [], async: [] });
    expect(exposeCss(raw, './lifecycle-v')).toEqual({ sync: [], async: [] });
  }, BUILD_TEST_TIMEOUT_MS);

  it('fails a build without per-chunk CSS when a plugin listed after frontxMfGts() fills the empty stylesheet', () => {
    let stderr = '';
    let failed = false;
    try {
      buildFixture('a,b,u,v', false, { FIXTURE_LATE_CSS_APPENDER: 'true' });
    } catch (error) {
      failed = true;
      stderr = String((error as { stderr?: Buffer }).stderr ?? '');
    }
    // The appended rule makes `zero-kit/zero.css` compile to CSS that Vite
    // stores and delivers to no expose, so the guard must still fail naming
    // both: a recording that ran before the late plugin would silently skip
    // the stylesheet and leave both screens unstyled.
    expect(failed, 'build should fail the CSS guard').toBe(true);
    expect(stderr).toMatch(/expose '\.\/lifecycle-u' needs: \S*kit-zero\.css/);
    expect(stderr).toMatch(/expose '\.\/lifecycle-v' needs: \S*kit-zero\.css/);
  }, BUILD_TEST_TIMEOUT_MS);

  it('fails a build without per-chunk CSS when the recorder cannot be placed before vite:css-post and a later plugin fills the empty stylesheet', () => {
    let stderr = '';
    let failed = false;
    try {
      buildFixture(
        'a,b,u,v',
        false,
        { FIXTURE_HIDE_CSS_POST: 'true', FIXTURE_LATE_CSS_APPENDER: 'true' },
        'warn'
      );
    } catch (error) {
      failed = true;
      stderr = String((error as { stderr?: Buffer }).stderr ?? '');
    }
    // With vite:css-post unfindable the recorder stays where frontxMfGts()
    // is listed, ahead of the late appender, and would record the stylesheet
    // empty before the appender fills it. The guard must record nothing
    // instead, so it counts the filled stylesheet and fails naming both.
    expect(failed, 'build should fail the CSS guard').toBe(true);
    expect(stderr).toContain('could not place the empty-CSS recorder before vite:css-post');
    expect(stderr).toMatch(/expose '\.\/lifecycle-u' needs: \S*kit-zero\.css/);
    expect(stderr).toMatch(/expose '\.\/lifecycle-v' needs: \S*kit-zero\.css/);
  }, BUILD_TEST_TIMEOUT_MS);

  it('fails the second of two builds sharing one frontxMfGts() instance when its recorder cannot be placed and a later plugin fills the empty stylesheet', () => {
    const firstOutDir = fs.mkdtempSync(path.join(os.tmpdir(), 'shared-chunk-css-reuse-'));
    const secondOutDir = fs.mkdtempSync(path.join(os.tmpdir(), 'shared-chunk-css-reuse-'));
    outDirs.push(firstOutDir, secondOutDir);
    const env: Record<string, string | undefined> = { ...process.env, FIXTURE_EXPOSES: 'a,b,u,v' };
    delete env.NODE_ENV;
    delete env.FIXTURE_HIDE_CSS_POST;
    delete env.FIXTURE_LATE_CSS_APPENDER;
    env.MFE_VITE_NO_TEST_ENV_CHECK = 'true';
    let stderr = '';
    let failed = false;
    try {
      execFileSync(process.execPath, ['reused-plugin-builds.mjs', firstOutDir, secondOutDir], {
        cwd: fixtureDir,
        env,
        stdio: 'pipe',
        timeout: 120_000,
      });
    } catch (error) {
      failed = true;
      stderr = String((error as { stderr?: Buffer }).stderr ?? '');
    }
    // The first build records `zero-kit/zero.css` empty and passes. The
    // second cannot place its recorder, so it must count the stylesheet the
    // late appender fills: a recording kept from the first build would skip
    // it and let the build pass with both screens unstyled.
    expect(fs.existsSync(path.join(firstOutDir, 'mfe-manifest.json')), 'first build should pass').toBe(true);
    expect(failed, 'second build should fail the CSS guard').toBe(true);
    expect(stderr).toContain('could not place the empty-CSS recorder before vite:css-post');
    expect(stderr).toMatch(/expose '\.\/lifecycle-u' needs: \S*kit-zero\.css/);
    expect(stderr).toMatch(/expose '\.\/lifecycle-v' needs: \S*kit-zero\.css/);
  }, BUILD_TEST_TIMEOUT_MS);

  it('keeps building the empty-stylesheet exposes on a watch rebuild whose stylesheets stay cached', async () => {
    const outDir = fs.mkdtempSync(path.join(os.tmpdir(), 'shared-chunk-css-watch-'));
    outDirs.push(outDir);
    const manifestExposes = (): ManifestExpose[] | undefined => tryReadExposeCss(outDir);
    const watch = startWatchBuild(outDir);
    try {
      // Every wait shares one deadline inside the test timeout, so a slow
      // run fails here with the child's captured output, never with Vitest's
      // generic timeout.
      const deadline = Date.now() + WATCH_TEST_TIMEOUT_MS - WATCH_WAIT_MARGIN_MS;
      await waitFor('the first build', () => watch.buildsSeen() > 0 || watch.failed(), deadline, watch.tail);
      // The plugin writes the enriched mfe-manifest.json in its own
      // closeBundle, after the CSS-delivery guard, so its presence is this
      // build's proof the guard passed; the raw mf-manifest.json exists even
      // when the guard then fails.
      await waitFor(
        'the first build enriched manifest',
        () => tryReadEnrichedEntries(outDir) !== undefined || watch.failed(),
        deadline,
        watch.tail
      );
      expect(watch.failed(), watch.tail()).toBe(false);
      expect(exposeCss({ exposes: manifestExposes() ?? [] }, './lifecycle-u')).toEqual({ sync: [], async: [] });
      expect(exposeCss({ exposes: manifestExposes() ?? [] }, './lifecycle-v')).toEqual({ sync: [], async: [] });

      // Touch an unrelated JS source. Its content is unchanged, so Rollup
      // serves every module whose file did not change from its transform
      // cache, kit-zero.css included: a rebuild that re-transformed the
      // stylesheet would re-record it either way and could not catch a
      // broken recording. The rebuild must then still succeed with the
      // recording carried over from the first build; a recording cleared in
      // buildStart (or one that missed the cached stylesheet) fails the
      // guard after Vite has already logged the second `built in` line and
      // the federation plugin has written mf-manifest.json, so neither
      // tells a passed rebuild from a failed one: the guard throws in the
      // plugin's own closeBundle, whose rejection Vite does not await, the
      // watcher dies on it, and the enriched mfe-manifest.json, emptied out
      // when the rebuild started, is never written again because the plugin
      // writes it last, after the guard. So require the rebuild to give
      // both back: its own enriched manifest and a watcher that is still
      // alive, with the touched expose's shared CSS still attributed. Vite
      // empties the outDir when each build starts, so everything read
      // afterwards is the rebuild's own.
      const touched = path.join(fixtureDir, 'src', 'lifecycle-b.js');
      // The first touch can land before the watcher has attached its file
      // watchers, so re-touch every few seconds until the second build is
      // seen; a touch the watcher already caught would only queue one more
      // rebuild of the same fixture, which the reads below tolerate.
      let lastTouch = Date.now();
      const retouch = (): void => {
        lastTouch = Date.now();
        const now = new Date();
        fs.utimesSync(touched, now, now);
      };
      retouch();
      await waitFor(
        'the rebuild to finish',
        () => {
          // Retouch only while no rebuild has started: a touch during a running
          // rebuild would queue a third build, whose emptyOutDir could land
          // between the second build's manifest write and the reads below.
          if (watch.buildsStarted() <= 1 && Date.now() - lastTouch >= 3_000) retouch();
          return watch.buildsSeen() > 1 || watch.failed();
        },
        deadline,
        watch.tail
      );
      await waitFor(
        'the rebuilt enriched manifest',
        () => tryReadEnrichedEntries(outDir) !== undefined || watch.failed(),
        deadline,
        watch.tail
      );
      expect(watch.failed(), watch.tail()).toBe(false);
      const rebuiltCss = Object.fromEntries(
        (tryReadEnrichedEntries(outDir) ?? []).map((e) => [e.exposedModule, unhashed(e.exposeAssets.css)])
      );
      expect(rebuiltCss['./lifecycle-a']?.sync).toContain('assets/shared.css');
      expect(rebuiltCss['./lifecycle-b']?.sync).toContain('assets/shared.css');
      await waitFor('the rebuilt manifest', () => manifestExposes() !== undefined, deadline, watch.tail);
      expect(exposeCss({ exposes: manifestExposes() ?? [] }, './lifecycle-u')).toEqual({ sync: [], async: [] });
      expect(exposeCss({ exposes: manifestExposes() ?? [] }, './lifecycle-v')).toEqual({ sync: [], async: [] });
    } finally {
      await stopWatchBuild(watch.child);
    }
  }, WATCH_TEST_TIMEOUT_MS);

  it('fails a watch rebuild without per-chunk CSS when the empty stylesheet gains a rule', async () => {
    const kitZeroPath = path.join(fixtureDir, 'src', 'kit-zero.css');
    // The fixture ships the stylesheet empty; put it back before anything
    // else runs, and let afterEach double-check the byte count too.
    expect(fs.statSync(kitZeroPath).size, 'kit-zero.css must ship empty').toBe(0);
    const restoreKitZero = (): void => {
      fs.writeFileSync(kitZeroPath, '');
      expect(fs.statSync(kitZeroPath).size).toBe(0);
    };
    const outDir = fs.mkdtempSync(path.join(os.tmpdir(), 'shared-chunk-css-watch-'));
    outDirs.push(outDir);
    const watch = startWatchBuild(outDir, { cssCodeSplit: false });
    try {
      const deadline = Date.now() + WATCH_TEST_TIMEOUT_MS - WATCH_WAIT_MARGIN_MS;
      await waitFor('the first build', () => watch.buildsSeen() > 0 || watch.failed(), deadline, watch.tail);
      await waitFor(
        'the first build enriched manifest',
        () => tryReadEnrichedEntries(outDir) !== undefined || watch.failed(),
        deadline,
        watch.tail
      );
      expect(watch.failed(), watch.tail()).toBe(false);
      expect(exposeCss({ exposes: tryReadExposeCss(outDir) ?? [] }, './lifecycle-u')).toEqual({
        sync: [],
        async: [],
      });

      // Give the empty stylesheet a rule. The rebuild re-transforms the
      // changed file, so the recording must replace its stale empty entry;
      // the guard then sees CSS the single style file names for neither
      // expose and fails the rebuild naming both. A recording that only ever
      // added would keep the empty entry and the rebuild would pass.
      // The first write can land before the watcher has attached its file
      // watchers, so write the rule again every few seconds until the
      // rebuild has started (or the watcher has failed); a write the watcher
      // already caught only queues one more rebuild of the same content.
      let lastWrite = Date.now();
      const writeRule = (): void => {
        lastWrite = Date.now();
        fs.writeFileSync(kitZeroPath, '.watch-added-rule { color: olive; }\n');
      };
      writeRule();
      await waitFor(
        'the rebuild to start',
        () => {
          if (watch.buildsStarted() > 1 || watch.failed()) return true;
          if (Date.now() - lastWrite >= 3_000) writeRule();
          return false;
        },
        deadline,
        watch.tail
      );
      await waitFor('the rebuild to fail the guard', () => watch.failed(), deadline, watch.tail);
      const stderr = watch.stderrAll();
      expect(stderr).toMatch(/CSS imported by an exposed module was not attributed/);
      expect(stderr).toMatch(/expose '\.\/lifecycle-u' needs: \S*kit-zero\.css/);
      expect(stderr).toMatch(/expose '\.\/lifecycle-v' needs: \S*kit-zero\.css/);
    } finally {
      restoreKitZero();
      await stopWatchBuild(watch.child);
      restoreKitZero();
    }
  }, WATCH_TEST_TIMEOUT_MS);

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

  it('fails a build without per-chunk CSS when a lazy chunk is the only carrier of the node_modules stylesheet', () => {
    let stderr = '';
    try {
      buildFixture('a,b,q', false);
    } catch (error) {
      stderr = String((error as { stderr?: Buffer }).stderr ?? '');
    }
    expect(stderr).toMatch(/expose '\.\/lifecycle-q' needs: \S*sonner\/dist\/styles\.css/);
  }, BUILD_TEST_TIMEOUT_MS);

  it('fails a build without per-chunk CSS when the expose dynamic-imports the node_modules stylesheet itself', () => {
    let stderr = '';
    try {
      buildFixture('a,b,q,r', false);
    } catch (error) {
      stderr = String((error as { stderr?: Buffer }).stderr ?? '');
    }
    // r's direct dynamic import gives the sonner stylesheet a chunk of its
    // own (the CSS-only chunk Vite removes), recovered for r through the
    // dynamic import; q's lazy chunk statically imports that same chunk, so
    // the same recovery reaches q through it.
    expect(stderr).toMatch(/expose '\.\/lifecycle-q' needs: \S*sonner\/dist\/styles\.css/);
    expect(stderr).toMatch(/expose '\.\/lifecycle-r' needs: \S*sonner\/dist\/styles\.css/);
  }, BUILD_TEST_TIMEOUT_MS);

  it('fails a build without per-chunk CSS when static imports are the only carriers of the node_modules stylesheet', () => {
    let stderr = '';
    try {
      buildFixture('a,b,s,t', false);
    } catch (error) {
      stderr = String((error as { stderr?: Buffer }).stderr ?? '');
    }
    // Rollup hoists the stylesheet into a CSS-only chunk both exposes reach
    // through static imports, and Vite removes it and strips those imports:
    // neither expose's own chunk holds CSS, so without the recovered chunk
    // the build passes and both screens render unstyled.
    expect(stderr).toMatch(/expose '\.\/lifecycle-s' needs: \S*sonner\/dist\/styles\.css/);
    expect(stderr).toMatch(/expose '\.\/lifecycle-t' needs: \S*sonner\/dist\/styles\.css/);
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
