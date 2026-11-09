/**
 * How a repo-script finds this repo's templates.
 *
 * A template IS its manifest (ADR-0018): a directory counts as one by
 * carrying `frontx-template.json`, never by matching a `template-*` name
 * prefix. That distinction is load-bearing rather than stylistic - the #470
 * split renamed `template-standard/` to `template-shell/` and added
 * `template-mfe/`, and a name-prefix glob would have kept passing while
 * quietly covering nothing.
 *
 * Every CI guard that walks templates (`validate-templates.mjs`,
 * `template-pin-drift-check.mjs`, `version-bump-on-change-check.mjs` and the
 * rest) discovers them through this module: `validate-templates.mjs` through
 * `findTemplateDirs`, the policy guards through `findGuardedTemplateDirs`.
 * Two copies of the rule is how they would come to disagree about what a
 * template is - and a discovery rule that finds nothing reports as a pass in
 * every caller that forgets to check (CodeRabbit on #493, which found the
 * duplication).
 */
import fs from 'node:fs';
import path from 'node:path';

/**
 * Mirrors `MANIFEST_FILENAME` (`packages/cli/src/manifest/types.ts` in
 * `gears-frontx`) - kept as a local literal rather than an import so a
 * repo-script keeps working straight after `npm ci`, with no
 * `build:packages:cli` prerequisite. The cross-repo sync guard that used to
 * compare this literal against that file lived here before the split and was
 * dropped along with it (see `template-discovery.test.mjs`'s note on the
 * confidence check that took its place) - `gears-frontx`'s own test suite has
 * no way to see a literal declared in this repo, so nothing compares the two
 * automatically any more.
 */
export const MANIFEST_FILENAME = 'frontx-template.json';

/**
 * Every top-level directory at `rootDir` that carries `manifestFilename`,
 * sorted. `manifestFilename` is a parameter, not a hardcoded read of the
 * constant above, because `validate-templates.mjs` passes the value the built
 * CLI itself exports - so that guard checks the CLI's own idea of the filename
 * rather than a second copy of it.
 *
 * `node_modules` is the ONE exclusion (install-time output, never something
 * this repo's own tree defines). A dot-prefixed top-level directory (`.git`,
 * `.github`, `.cf-studio`, ...) is deliberately NOT excluded: filtering it out
 * would reintroduce exactly the naming assumption manifest-presence discovery
 * exists to drop, and the cost is one `existsSync` per top-level entry.
 *
 * @param {string} rootDir
 * @param {string} [manifestFilename]
 * @returns {string[]} absolute paths, sorted
 */
export function findTemplateDirs(rootDir, manifestFilename = MANIFEST_FILENAME) {
  return fs
    .readdirSync(rootDir, { withFileTypes: true })
    .filter((entry) => entry.isDirectory() && entry.name !== 'node_modules')
    .map((entry) => path.join(rootDir, entry.name))
    .filter((dir) => fs.existsSync(path.join(dir, manifestFilename)))
    .sort();
}

/**
 * Templates that are in the repo but carry no manifest yet. `template-dashboard`
 * lands package by package, and its manifest comes with the runtime slice that
 * makes it appliable. Until then the policy guards still have to see its
 * packages, or a broken token or a deep `@gears-frontx/mfes` import there would
 * pass CI. Remove an entry in the PR that adds that template's manifest.
 *
 * Only the policy guards read this list. `validate-templates.mjs` checks the
 * manifest itself, so it keeps to `findTemplateDirs`.
 */
export const PRE_MANIFEST_TEMPLATE_DIRS = Object.freeze(['template-dashboard']);

/**
 * What every policy guard walks: the templates `findTemplateDirs` finds, plus
 * each `PRE_MANIFEST_TEMPLATE_DIRS` entry that exists as a directory under
 * `rootDir`. A listed directory that is missing is skipped, so a fixture root
 * without it behaves exactly as before.
 *
 * @param {string} rootDir
 * @param {readonly string[]} [preManifestDirs]
 * @returns {string[]} absolute paths, sorted, no duplicates
 */
export function findGuardedTemplateDirs(rootDir, preManifestDirs = PRE_MANIFEST_TEMPLATE_DIRS) {
  const listed = preManifestDirs
    .map((name) => path.join(rootDir, name))
    .filter((dir) => fs.statSync(dir, { throwIfNoEntry: false })?.isDirectory() === true);
  return [...new Set([...findTemplateDirs(rootDir), ...listed])].sort();
}
