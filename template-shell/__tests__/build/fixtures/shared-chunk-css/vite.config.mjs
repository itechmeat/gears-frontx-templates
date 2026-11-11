// Build config for the shared-chunk CSS fixture, run by
// `__tests__/build/shared-chunk-css.test.ts` in a child process: the
// federation plugin turns itself off under Vitest. FIXTURE_EXPOSES picks
// which of the exposes the build declares; `mfe.json` has entries for a and
// b only, so every build declares those two and c to v are exposes without
// an entry. lifecycle-u.js and lifecycle-v.js are byte-identical on purpose:
// one importer would let Vite fold the empty stylesheet into that expose's
// own chunk, while two importers make it land in a shared CSS-only chunk,
// the shape the empty-stylesheet tests assert. FIXTURE_CSS_CODE_SPLIT=false
// builds without per-chunk CSS. FIXTURE_SKEW_LAZY_PANEL adds a plugin that,
// before frontx-mf-gts sees the bundle, deletes the lazy-panel chunk and
// changes how many dynamic imports its importer lists: `keep-call` leaves
// the importer's call to the deleted file and lists one import more,
// `drop-call` replaces that call with an empty promise and lists one import
// less. FIXTURE_LATE_CSS_APPENDER=true turns on a plugin listed after
// frontxMfGts() that appends a rule to the empty kit stylesheet, so its
// compiled CSS is no longer the empty string by the time Vite stores it.
// FIXTURE_HIDE_CSS_POST=true turns on a plugin listed before frontxMfGts()
// whose configResolved renames the resolved vite:css-post plugin, so the
// recorder cannot find it by name and cannot be placed before it. The late
// appender and the hider are always listed and read their variable when
// their hook runs, so `reused-plugin-builds.mjs` can build twice from one
// loaded config and turn them on for its second build only.
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vite';
import { federation } from '@module-federation/vite';
import { frontxMfGts } from '../../../../src/build/mf-gts.ts';

const allExposes = {
  './lifecycle-a': './src/lifecycle-a.js',
  './lifecycle-b': './src/lifecycle-b.js',
  './lifecycle-c': './src/lifecycle-c.js',
  './lifecycle-d': './src/lifecycle-d.js',
  './lifecycle-e': './src/lifecycle-e.js',
  './lifecycle-f': './src/lifecycle-f.js',
  './lifecycle-g': './src/lifecycle-g.js',
  './lifecycle-h': './src/lifecycle-h.js',
  './lifecycle-i': './src/lifecycle-i.js',
  './lifecycle-j': './src/lifecycle-j.js',
  './lifecycle-k': './src/lifecycle-k.js',
  './lifecycle-l': './src/lifecycle-l.js',
  './lifecycle-m': './src/lifecycle-m.js',
  './lifecycle-n': './src/lifecycle-n.js',
  './lifecycle-o': './src/lifecycle-o.js',
  './lifecycle-p': './src/lifecycle-p.js',
  './lifecycle-q': './src/lifecycle-q.js',
  './lifecycle-r': './src/lifecycle-r.js',
  './lifecycle-s': './src/lifecycle-s.js',
  './lifecycle-t': './src/lifecycle-t.js',
  './lifecycle-u': './src/lifecycle-u.js',
  './lifecycle-v': './src/lifecycle-v.js',
};
const picked = (process.env.FIXTURE_EXPOSES ?? 'a,b,c').split(',');

const skewMode = process.env.FIXTURE_SKEW_LAZY_PANEL;
if (skewMode && skewMode !== 'keep-call' && skewMode !== 'drop-call') {
  throw new Error(`fixture: unknown FIXTURE_SKEW_LAZY_PANEL '${skewMode}'`);
}
const skewLazyPanel = {
  name: 'fixture-skew-lazy-panel',
  enforce: 'post',
  generateBundle(_options, bundle) {
    const removed = Object.keys(bundle).find((f) => /lazy-panel-[A-Za-z0-9_-]{8}\.js$/.test(f));
    if (removed === undefined) throw new Error('fixture: no lazy-panel chunk to remove');
    delete bundle[removed];
    const base = removed.split('/').pop();
    let importers = 0;
    for (const output of Object.values(bundle)) {
      if (output.type !== 'chunk' || !output.dynamicImports.includes(removed)) continue;
      importers++;
      if (skewMode === 'keep-call') {
        output.dynamicImports.push('assets/fixture-extra.js');
      } else {
        const call = new RegExp(`__frontx_lazy\\(\\s*['"]\\./${base.replace(/[.-]/g, '\\$&')}['"]\\s*\\)`);
        if (!call.test(output.code)) throw new Error(`fixture: no call to ${base} in ${output.fileName}`);
        output.code = output.code.replace(call, 'Promise.resolve({})');
        output.dynamicImports = output.dynamicImports.filter((f) => f !== removed);
      }
    }
    if (importers === 0) throw new Error(`fixture: no chunk imports ${removed}`);
  },
};

// Listed after `frontxMfGts()` so the recorder's transform would see the
// stylesheet before this one without the placement fix in mf-gts.ts.
const lateCssAppender = {
  name: 'fixture-late-css-appender',
  transform(code, id) {
    if (process.env.FIXTURE_LATE_CSS_APPENDER !== 'true' || !id.endsWith('kit-zero.css')) return null;
    return { code: `${code}\n.late-added-rule { color: teal; }\n`, map: null };
  },
};

// Renames only the plugin's name: Vite and federation never look
// `vite:css-post` up by name, so the build itself runs unchanged.
const cssPostHider = {
  name: 'fixture-css-post-hider',
  configResolved(config) {
    if (process.env.FIXTURE_HIDE_CSS_POST !== 'true') return;
    const cssPost = config.plugins.find((plugin) => plugin.name === 'vite:css-post');
    if (!cssPost) throw new Error('fixture: no vite:css-post plugin to hide');
    cssPost.name = 'fixture-hidden-css-post';
  },
};

export default defineConfig({
  // `zero-kit/zero.css` stands in for a node_modules stylesheet, which the
  // fixture cannot carry (it ships no node_modules of its own): the bare
  // specifier resolves like a kit import to `src/kit-zero.css`, a stylesheet
  // that compiles to no CSS.
  resolve: {
    alias: {
      'zero-kit/zero.css': fileURLToPath(new URL('./src/kit-zero.css', import.meta.url)),
    },
  },
  plugins: [
    federation({
      name: 'sharedChunkCssFixture',
      filename: 'remoteEntry.js',
      exposes: Object.fromEntries(
        Object.entries(allExposes).filter(([key]) =>
          picked.includes(key.slice(-1))
        )
      ),
      shared: {},
      manifest: true,
      dts: false,
    }),
    ...(skewMode ? [skewLazyPanel] : []),
    cssPostHider,
    frontxMfGts(),
    lateCssAppender,
  ],
  build: {
    emptyOutDir: true,
    target: 'esnext',
    modulePreload: false,
    minify: false,
    cssCodeSplit: process.env.FIXTURE_CSS_CODE_SPLIT !== 'false',
  },
});
