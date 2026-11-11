// Two sequential builds of this fixture in one Node process, sharing one
// loaded config and so one plugins array with one frontxMfGts() instance,
// the way a script calling Vite's build() twice reuses its plugins. Run by
// `__tests__/build/shared-chunk-css.test.ts` as
// `node reused-plugin-builds.mjs <firstOutDir> <secondOutDir>` with
// FIXTURE_EXPOSES set. The first build is a plain one with per-chunk CSS;
// the second turns on the vite:css-post hider and the late appender and
// builds without per-chunk CSS. The config is loaded once with Vite's own
// loader and passed with `configFile: false`: passing it while Vite also
// loads `vite.config.mjs` from the root would list every fixture plugin
// twice. Exits 0 when both builds pass, and 1 with the error on stderr when
// one fails.
import { fileURLToPath } from 'node:url';
import { build, loadConfigFromFile } from 'vite';

const [firstOutDir, secondOutDir] = process.argv.slice(2);
if (!firstOutDir || !secondOutDir) throw new Error('usage: reused-plugin-builds.mjs <firstOutDir> <secondOutDir>');
const root = fileURLToPath(new URL('.', import.meta.url));
const loaded = await loadConfigFromFile(
  { command: 'build', mode: 'production' },
  fileURLToPath(new URL('./vite.config.mjs', import.meta.url)),
  root
);
if (!loaded) throw new Error('fixture: vite.config.mjs did not load');
const { config } = loaded;

const buildOnce = (outDir, cssCodeSplit, logLevel) =>
  build({
    ...config,
    root,
    configFile: false,
    logLevel,
    build: { ...config.build, outDir, cssCodeSplit },
  });

try {
  await buildOnce(firstOutDir, true, 'error');
  process.env.FIXTURE_HIDE_CSS_POST = 'true';
  process.env.FIXTURE_LATE_CSS_APPENDER = 'true';
  await buildOnce(secondOutDir, false, 'warn');
} catch (error) {
  process.stderr.write(`${error instanceof Error ? error.stack ?? error.message : String(error)}\n`);
  process.exit(1);
}
process.exit(0);
