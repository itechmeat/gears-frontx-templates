#!/usr/bin/env node
/**
 * Checks the token NAMES in a DESIGN.md front matter against the custom
 * properties the installed `@gears-frontx/ui-kit` theme declares. Values are
 * never read: they live in the kit theme and the product theme.
 *
 *   node check-design-md.mjs [--design <path>] [--theme <path>] [--kit-version <v>]
 *
 * Defaults: `DESIGN.md` in the current directory, and the kit's exported
 * `@gears-frontx/ui-kit/theme.css` resolved from the current directory.
 *
 * The front matter `version` names the kit release the token names come
 * from; it must equal the installed kit's version. That version is read from
 * `@gears-frontx/ui-kit/package.json` resolved from the current directory,
 * or, when that export is missing or `--theme` is given, from the nearest
 * `package.json` named `@gears-frontx/ui-kit` above the theme file.
 * `--kit-version <v>` gives it instead; with `--theme` and no such
 * `package.json`, it is required.
 *
 * Findings, one line each: a front matter `version` that is not the kit's
 * version; a token map value that is not exactly one
 * `var(--name)`; a `components` value that is not exactly one `{group.key}` or
 * one `var(--name)`; a `var(--name)` in a token map or a `components` value
 * that the theme does not declare (as `--name:` or `@property --name`); a
 * `{group.key}` reference in `components` or in the markdown body with no such
 * map key; a theme property the token maps do not name (coverage).
 *
 * In the body, `{group.key}` with a lowercase group (`[a-z][a-z0-9-]*`), a dot
 * and key characters with no spaces is reserved for token references on every
 * line, fenced code and code spans included: an example that must show braces
 * uses another notation.
 *
 * Exit 0 clean, 1 findings, 2 usage or input error: a missing file or a
 * directory, front matter missing, unclosed or outside the supported subset,
 * `name`, `version` or `description` missing or holding a map, any other
 * top-level key that is not a map or not a lowercase group name
 * (`[a-z][a-z0-9-]*`, the shape body references use), a key off the shape of
 * its group (a `typography` or `components` key that is not a map of scalars,
 * a key in any other token map that is not a scalar), a reserved key
 * (`__proto__`, `constructor`, `prototype`) at any level, a kit theme it
 * cannot resolve, or a kit version it cannot find (no kit `package.json`, or
 * one with no `version`, and no `--kit-version`).
 *
 * The design-verify runners import `readDesignMd` and `InputError` from this
 * file, so the front matter has one parser; the CLI runs only when this file
 * is the entry point.
 */
import { readFileSync, realpathSync, statSync } from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';

const USAGE = 'usage: node check-design-md.mjs [--design <path>] [--theme <path>] [--kit-version <v>]';
const KIT = '@gears-frontx/ui-kit';
const KIT_THEME = `${KIT}/theme.css`;
const META_KEYS = new Set(['name', 'version', 'description']);
// Groups whose keys hold maps of scalars: typography roles and components.
const NESTED = new Set(['typography', 'components']);
// A token map group or `components`: the group shape a body reference can name.
const GROUP = /^[a-z][a-z0-9-]*$/;
// Keys that would reach Object.prototype through a lookup or an assignment.
const RESERVED = new Set(['__proto__', 'constructor', 'prototype']);
// Prefixes of kit custom properties the front matter need not name. Empty:
// every property the kit theme declares is public token surface (its
// header says a consumer brands the kit by overriding them), so coverage
// applies to all of them.
const IGNORE = [];
const VAR_ONLY = /^var\((--[\w-]+)\)$/;
const REF_ONLY = /^\{([^{}.]+)\.([^{}]+)\}$/;
// In the body only this shape is a reference, so CSS such as `.card { padding: 0.5rem }` is not one.
const BODY_REF = /\{([a-z][a-z0-9-]*)\.([\w.-]+)\}/g;

export class InputError extends Error {}

function readInput(file, what) {
  let stat;
  try {
    stat = statSync(file);
  } catch {
    throw new InputError(`${what} not found: ${file}`);
  }
  if (!stat.isFile()) throw new InputError(`${what} is not a file: ${file}`);
  try {
    return readFileSync(file, 'utf8');
  } catch (error) {
    throw new InputError(`cannot read ${what} ${file}: ${error.code ?? error.message}`);
  }
}

function resolveTheme(cwd) {
  try {
    return createRequire(path.join(cwd, 'package.json')).resolve(KIT_THEME);
  } catch {
    throw new InputError(`cannot resolve ${KIT_THEME} from ${cwd}; pass --theme <path to the kit theme.css>`);
  }
}

/** The kit `package.json` path: resolved through the exports, else the nearest one named for the kit above `from`. */
function findKitManifest(cwd, from, viaExports) {
  if (viaExports) {
    try {
      return createRequire(path.join(cwd, 'package.json')).resolve(`${KIT}/package.json`);
    } catch {
      // The kit may not export package.json: fall back to the walk up.
    }
  }
  for (let dir = path.dirname(from); ; dir = path.dirname(dir)) {
    const file = path.join(dir, 'package.json');
    try {
      if (JSON.parse(readFileSync(file, 'utf8')).name === KIT) return file;
    } catch {
      // No package.json here, or one that is not JSON: not the kit's.
    }
    if (path.dirname(dir) === dir) return undefined;
  }
}

/** The installed kit version, from `--kit-version` or the kit's own `package.json`. */
function kitVersion(given, cwd, themePath, viaExports) {
  if (given !== undefined) {
    const version = given.trim();
    if (version === '') throw new InputError(`--kit-version is empty\n${USAGE}`);
    return { version, source: '--kit-version' };
  }
  const manifest = findKitManifest(cwd, themePath, viaExports);
  if (!manifest) {
    throw new InputError(
      `no ${KIT} package.json found above ${themePath}; pass --kit-version <the installed kit version>`,
    );
  }
  let version;
  try {
    ({ version } = JSON.parse(readInput(manifest, 'kit package.json')));
  } catch (error) {
    if (error instanceof InputError) throw error;
    throw new InputError(`cannot parse ${manifest}: ${error.message}`);
  }
  if (typeof version !== 'string' || version === '') {
    throw new InputError(`${manifest} has no version; pass --kit-version <the installed kit version>`);
  }
  return { version, source: manifest };
}

/** Custom property names a stylesheet declares; values are skipped unread. */
function declaredNames(css) {
  // A comment becomes a space, so text on either side of it never joins into one name.
  const text = css.replace(/\/\*[\s\S]*?\*\//g, ' ');
  return new Set(
    [...text.matchAll(/(?:^|[{;\s])(--[\w-]+)\s*:|@property\s+(--[\w-]+)/g)].map((m) => m[1] ?? m[2]),
  );
}

/**
 * Parses the front matter subset DESIGN.md uses: the three meta scalars, token
 * maps of scalars, `typography` and `components` as maps of scalar maps,
 * two-space indent, keys plain or double-quoted, values
 * double-quoted strings or plain scalars of word characters, `.`, `+` and `-`
 * (words, numbers, a version with build metadata such as `0.4.1+build.2`),
 * full-line `#` comments,
 * and trailing spaces or a ` # comment` after a value or a key with no
 * value (a `#` inside a quoted value is text). Anything else is an input
 * error rather than a guess. Returns the maps and the index of the closing
 * `---` line.
 */
function parseFrontMatter(lines) {
  if (lines[0] !== '---') throw new InputError('DESIGN.md has no front matter (its first line must be ---)');
  const end = lines.indexOf('---', 1);
  if (end === -1) throw new InputError('DESIGN.md front matter is not closed with ---');
  const stack = [Object.create(null)]; // stack[d] is the open map at depth d
  let open = null; // the last key that had no value: its map starts on the next line
  const keys = []; // keys[d] is the open key at depth d, so keys.join('.') is its full path
  for (let i = 1; i < end; i += 1) {
    const line = lines[i];
    if (line.trim() === '' || line.trimStart().startsWith('#')) continue;
    // JSON keeps leading and trailing spaces visible in the message.
    const bad = (why) => new InputError(`DESIGN.md front matter line ${i + 1}: ${why}: ${JSON.stringify(line)}`);
    const m = /^( *)("[^"\\]*"|[\w-]+):(?: +("[^"\\]*"|[\w.+-]+))?(.*)$/.exec(line);
    const depth = m ? m[1].length / 2 : -1;
    if (!m || !Number.isInteger(depth)) throw bad('unsupported YAML');
    // After the value (or a key with no value) only spaces and a ` # comment` may follow.
    if (!/^[ \t]*(?:[ \t]#.*)?$/.test(m[4])) {
      throw bad(`unexpected text after the ${m[3] === undefined ? 'key' : 'value'}`);
    }
    if (open) {
      if (depth !== open.depth + 1) throw bad(`"${open.at}" has no entries`);
      stack[depth] = open.map[open.key] = Object.create(null);
    } else if (depth >= stack.length) {
      throw bad('unexpected indent');
    }
    stack.length = depth + 1;
    const map = stack[depth];
    const key = m[2].replace(/^"|"$/g, '');
    if (RESERVED.has(key)) throw bad('reserved key');
    if (Object.hasOwn(map, key)) throw bad('duplicate key');
    if (depth === 0 && !META_KEYS.has(key) && !GROUP.test(key)) {
      throw bad(`top-level key "${key}" must match ${GROUP.source}`);
    }
    keys.length = depth;
    keys.push(key);
    const at = keys.join('.');
    // The shape is fixed per group: only `typography` and `components` hold maps of scalars.
    const wantsMap = depth === 0 ? !META_KEYS.has(key) : depth === 1 && NESTED.has(keys[0]);
    if (wantsMap === (m[3] !== undefined)) {
      throw bad(`"${at}" must be ${wantsMap ? 'a map' : 'a scalar'}`);
    }
    if (m[3] === undefined) {
      open = { map, key, depth, at };
    } else {
      map[key] = m[3].replace(/^"|"$/g, '');
      open = null;
    }
  }
  if (open) throw new InputError(`DESIGN.md front matter: "${open.at}" has no entries`);
  for (const key of META_KEYS) {
    if (!Object.hasOwn(stack[0], key)) throw new InputError(`DESIGN.md front matter: "${key}" is missing`);
  }
  return { front: stack[0], end };
}

/**
 * Reads and parses a DESIGN.md: its lines, the front matter maps and the
 * index of the closing `---`. Throws InputError on any input error.
 */
export function readDesignMd(designPath) {
  // A leading BOM would hide the opening ---.
  const lines = readInput(designPath, 'DESIGN.md').replace(/^\u{FEFF}/u, '').split(/\r?\n/);
  return { lines, ...parseFrontMatter(lines) };
}

/** One line per finding; empty when the names and the kit version match. */
function check(lines, front, end, themeNames, kit) {
  const findings = [];
  if (front.version !== kit.version) {
    findings.push(
      `version: DESIGN.md names kit ${front.version}, the installed kit is ${kit.version} (${kit.source}); ` +
        `update the token names to that kit and set version to ${kit.version}`,
    );
  }
  const leaves = (value, at) =>
    typeof value === 'object'
      ? Object.entries(value).flatMap(([key, child]) => leaves(child, `${at}.${key}`))
      : [[at, value]];
  const tokenMaps = Object.create(null);
  for (const [key, value] of Object.entries(front)) {
    if (key !== 'components' && !META_KEYS.has(key)) tokenMaps[key] = value;
  }
  const missing = ([, group, key]) => !Object.hasOwn(tokenMaps, group) || !Object.hasOwn(tokenMaps[group], key);

  const named = new Set();
  for (const [at, value] of leaves(tokenMaps, '').map(([at, v]) => [at.slice(1), v])) {
    const name = VAR_ONLY.exec(value)?.[1];
    if (!name) findings.push(`${at}: "${value}" is not exactly one var(--name)`);
    else if (!themeNames.has(name)) findings.push(`${at}: ${name} is not declared by the kit theme`);
    else named.add(name);
  }

  for (const [at, value] of leaves(front.components ?? {}, 'components')) {
    const ref = REF_ONLY.exec(value);
    const name = VAR_ONLY.exec(value)?.[1];
    if (ref) {
      if (missing(ref)) findings.push(`${at}: ${ref[0]} names no front matter token`);
    } else if (!name) {
      findings.push(`${at}: "${value}" is not exactly one {group.key} or var(--name)`);
    } else if (!themeNames.has(name)) {
      findings.push(`${at}: ${name} is not declared by the kit theme`);
    }
  }

  for (let i = end + 1; i < lines.length; i += 1) {
    for (const ref of lines[i].matchAll(BODY_REF)) {
      if (missing(ref)) findings.push(`DESIGN.md line ${i + 1}: ${ref[0]} names no front matter token`);
    }
  }

  for (const name of themeNames) {
    if (!named.has(name) && !IGNORE.some((prefix) => name.startsWith(prefix))) {
      findings.push(`${name}: declared by the kit theme, not named in the token maps`);
    }
  }
  return findings;
}

function main(argv, cwd) {
  let values;
  try {
    ({ values } = parseArgs({
      args: argv,
      options: { design: { type: 'string' }, theme: { type: 'string' }, 'kit-version': { type: 'string' } },
    }));
  } catch (error) {
    throw new InputError(`${error.message}\n${USAGE}`);
  }
  const designPath = path.resolve(cwd, values.design ?? 'DESIGN.md');
  const { lines, front, end } = readDesignMd(designPath);
  const themePath = values.theme ? path.resolve(cwd, values.theme) : resolveTheme(cwd);
  const themeNames = declaredNames(readInput(themePath, 'theme'));
  const kit = kitVersion(values['kit-version'], cwd, themePath, values.theme === undefined);
  const findings = check(lines, front, end, themeNames, kit);
  for (const line of findings) console.log(line);
  if (findings.length > 0) return 1;
  console.log(`${designPath}: kit ${kit.version}, every token name matches ${themePath}`);
  return 0;
}

/** Whether this file is the process entry point; an argv[1] that names no file (`node -e ... arg`) is not. */
function isEntryPoint() {
  try {
    return realpathSync(process.argv[1]) === realpathSync(fileURLToPath(import.meta.url));
  } catch {
    return false;
  }
}

if (isEntryPoint()) {
  try {
    process.exitCode = main(process.argv.slice(2), process.cwd());
  } catch (error) {
    if (!(error instanceof InputError)) throw error;
    console.error(error.message);
    process.exitCode = 2;
  }
}
