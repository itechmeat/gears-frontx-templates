// Build config for the shared-chunk CSS fixture, run by
// `__tests__/build/shared-chunk-css.test.ts` in a child process: the
// federation plugin turns itself off under Vitest. FIXTURE_EXPOSES picks
// which of the exposes the build declares; `mfe.json` has entries for a and
// b only, so every build declares those two and c to t are exposes without
// an entry. FIXTURE_CSS_CODE_SPLIT=false builds without per-chunk CSS.
// FIXTURE_SKEW_LAZY_PANEL adds a plugin that, before frontx-mf-gts sees the
// bundle, deletes the lazy-panel chunk and changes how many dynamic imports
// its importer lists: `keep-call` leaves the importer's call to the deleted
// file and lists one import more, `drop-call` replaces that call with an
// empty promise and lists one import less.
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

export default defineConfig({
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
    frontxMfGts(),
  ],
  build: {
    emptyOutDir: true,
    target: 'esnext',
    modulePreload: false,
    minify: false,
    cssCodeSplit: process.env.FIXTURE_CSS_CODE_SPLIT !== 'false',
  },
});
