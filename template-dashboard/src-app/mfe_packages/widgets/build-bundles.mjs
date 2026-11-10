#!/usr/bin/env node
/*
 * Builds every widget bundle under bundles/ (or the ones named on the command
 * line) as its own Module Federation remote, one after another, into
 * dist/<widget_type>/. Each bundle gets its served-file part next to it,
 * dist/<widget_type>/widget.gts.json: the manifest and the entry the FrontX
 * manifest pipeline completed from the build, with the types and instances of
 * the bundle's own served.gts.json when it has one (a widget type the template
 * does not define). dist/widgets.json is the served
 * widget list: the address of every part built so far.
 *
 * WIDGET_BUNDLE_BASE is the address the bundles are served under, '/widgets/'
 * by default: a bundle's chunks load from <base><widget_type>/.
 */
import { existsSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { build } from 'vite';

const here = import.meta.dirname;
// A base written without its trailing slash still names a directory.
const base = (process.env.WIDGET_BUNDLE_BASE ?? '/widgets/').replace(/\/?$/, '/');
process.env.WIDGET_BUNDLE_BASE = base;
const bundlesDir = process.env.WIDGET_BUNDLES_DIR ? path.resolve(process.env.WIDGET_BUNDLES_DIR) : path.join(here, 'bundles');
const outDir = process.env.WIDGET_BUNDLES_OUT ? path.resolve(process.env.WIDGET_BUNDLES_OUT) : path.join(here, 'dist');
const types = process.argv.slice(2).length ? process.argv.slice(2) : readdirSync(bundlesDir).filter((name) => existsSync(path.join(bundlesDir, name, 'mfe.json')));

for (const type of types) {
  process.env.WIDGET_TYPE = type;
  process.env.WIDGET_BUNDLES_DIR = bundlesDir;
  process.env.WIDGET_BUNDLES_OUT = outDir;
  await build({ configFile: path.join(here, 'vite.bundle.config.ts'), logLevel: 'warn' });
  const { manifest, entries } = JSON.parse(readFileSync(path.join(outDir, type, 'mfe-manifest.json'), 'utf-8'));
  // The served file names the manifest by id; its own `remoteEntry` field is the authoring input only.
  const { remoteEntry: _authored, ...served } = manifest;
  // A new widget type brings its own served types (and may bring a dashboard that shows it) in served.gts.json.
  const extraPath = path.join(bundlesDir, type, 'served.gts.json');
  const extra = existsSync(extraPath) ? JSON.parse(readFileSync(extraPath, 'utf-8')) : { types: [], instances: [] };
  const part = { types: extra.types ?? [], instances: [served, ...entries, ...(extra.instances ?? [])] };
  writeFileSync(path.join(outDir, type, 'widget.gts.json'), `${JSON.stringify(part, null, 2)}\n`);
  console.log(`built ${type}`);
}

const listed = readdirSync(outDir).filter((name) => existsSync(path.join(outDir, name, 'widget.gts.json')));
writeFileSync(path.join(outDir, 'widgets.json'), `${JSON.stringify(listed.map((type) => `${base}${type}/widget.gts.json`), null, 2)}\n`);
