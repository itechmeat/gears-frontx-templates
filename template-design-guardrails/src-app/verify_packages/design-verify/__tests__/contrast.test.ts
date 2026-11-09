// @vitest-environment node
// The DESIGN.md contrast mode's pure part: which pairs it measures, the
// WCAG arithmetic, and how one theme's probe result becomes a runner state.
// The probe itself runs in the browser (like the rest of the CLI, exercised
// against a real app, not here).
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';
import { describe, expect, it } from 'vitest';
import {
  contrastPairs,
  contrastRatio,
  contrastState,
  ContrastInputError,
  probeExpression,
  relativeLuminance,
  threshold,
} from '../runner/contrast.mjs';
import { parseArgs, resolvePaths } from '../runner/config.mjs';
import { buildReport, diffReports, exitCode, gateLookup, summaryLines } from '../runner/report.mjs';
import { designMdParser, readSkillJson } from '../runner/skill.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const renderCheck = readSkillJson('rules/render-check.json');
const spec = renderCheck.designMdContrast;
const gateFor = gateLookup(renderCheck);
// A page that took the requested theme, as the runner reads it.
const inTheme = (theme: string) => ({ applied: { value: { id: theme, attribute: theme, stored: theme } }, themeKey: 'frontx:theme' });

async function shippedFront() {
  const { readDesignMd } = await designMdParser();
  return readDesignMd(path.resolve(here, '../../../../DESIGN.md')).front;
}

describe('contrastPairs', () => {
  it('takes every components entry with a text and a background colour, resolved to custom properties', async () => {
    const pairs = contrastPairs(await shippedFront(), spec);
    const names = pairs.map((p) => p.component);
    expect(names).toContain('badge-warning');
    expect(names).toContain('tooltip');
    // Background only, or text only: nothing to pair.
    expect(names).not.toContain('dialog-overlay');
    expect(names).not.toContain('button-link');
    expect(pairs.find((p) => p.component === 'badge-warning')).toEqual({
      component: 'badge-warning',
      text: { ref: '{colors.warning-foreground}', name: '--warning-foreground' },
      background: { ref: '{colors.warning-soft}', name: '--warning-soft' },
    });
    expect(pairs.find((p) => p.component === 'button-primary')?.font).toEqual({
      ref: '{typography.label}',
      size: '--text-label-size',
      weight: '--text-label-weight',
    });
  });

  it('refuses a pair that resolves to no custom property', () => {
    const front = { colors: { fg: 'var(--fg)', bad: '#fff' }, typography: {}, components: {} };
    const pair = (entry: object) => contrastPairs({ ...front, components: { x: entry } }, spec);
    expect(pair({ textColor: '{colors.fg}', backgroundColor: 'var(--bg)' })).toHaveLength(1);
    expect(() => pair({ textColor: '{colors.nope}', backgroundColor: 'var(--bg)' })).toThrow(ContrastInputError);
    expect(() => pair({ textColor: '{colors.bad}', backgroundColor: 'var(--bg)' })).toThrow(/resolves to no var\(--name\)/);
    expect(() => pair({ textColor: '{colors.fg}', backgroundColor: 'var(--bg)', typography: '{typography.none}' })).toThrow(
      /names no type role/,
    );
  });

  it.each([null, 'var(--card)', 3, ['{colors.fg}']])('refuses a components entry that is not a mapping (%j), naming the key', (entry) => {
    const front = { colors: { fg: 'var(--fg)' }, components: { card: entry } };
    expect(() => contrastPairs(front, spec)).toThrow(ContrastInputError);
    expect(() => contrastPairs(front, spec)).toThrow(/^DESIGN\.md components\.card is not a mapping/);
    expect(() => contrastPairs({ components: 'x' }, spec)).toThrow(ContrastInputError);
  });
});

describe('WCAG arithmetic', () => {
  it('computes luminance and ratio on known values', () => {
    expect(relativeLuminance([255, 255, 255])).toBeCloseTo(1, 6);
    expect(relativeLuminance([0, 0, 0])).toBe(0);
    expect(contrastRatio([0, 0, 0], [255, 255, 255])).toBeCloseTo(21, 6);
    expect(contrastRatio([255, 255, 255], [0, 0, 0])).toBeCloseTo(21, 6);
    // #767676 on white is the classic 4.54:1; #777777 just misses (4.48:1).
    expect(contrastRatio([0x76, 0x76, 0x76], [255, 255, 255])).toBeCloseTo(4.54, 2);
    expect(contrastRatio([0x77, 0x77, 0x77], [255, 255, 255])).toBeCloseTo(4.48, 2);
  });

  it('uses the large-text threshold from 24 px, or from 18.66 px at weight 700', () => {
    expect(threshold(spec, 16, 400)).toEqual({ large: false, min: 4.5 });
    expect(threshold(spec, 24, 400)).toEqual({ large: true, min: 3 });
    expect(threshold(spec, 18.66, 700)).toEqual({ large: true, min: 3 });
    expect(threshold(spec, 18.66, 600)).toEqual({ large: false, min: 4.5 });
  });
});

describe('contrastState', () => {
  const pairs = [
    { component: 'card', text: { ref: '{colors.card-foreground}', name: '--card-foreground' }, background: { ref: '{colors.card}', name: '--card' } },
    { component: 'badge-warning', text: { ref: '{colors.warning}', name: '--warning' }, background: { ref: '{colors.warning-soft}', name: '--warning-soft' } },
    { component: 'heading', text: { ref: '{colors.muted-foreground}', name: '--muted-foreground' }, background: { ref: '{colors.card}', name: '--card' } },
    { component: 'chip', text: { ref: '{colors.x}', name: '--x' }, background: { ref: '{colors.card}', name: '--card' } },
  ];
  const result = (over: object) => ({
    component: 'c', text: 'rgb(0, 0, 0)', background: 'rgb(255, 255, 255)',
    textRgb: [0, 0, 0], backgroundRgb: [255, 255, 255], fontSizePx: 14, fontWeight: 400, empty: [], ...over,
  });
  const probe = {
    value: {
      results: [
        result({}),
        // 2.32:1.
        result({ textRgb: [170, 170, 170], text: 'rgb(170, 170, 170)' }),
        // 3.5:1 passes as large text only.
        result({ textRgb: [0x88, 0x88, 0x88], fontSizePx: 24 }),
        result({ empty: ['--x'] }),
      ],
    },
  };

  it('lists every measured pair, reports the ones below threshold and the unpaintable ones for review', () => {
    const state = contrastState({ theme: 'light', width: 1440, pairs, probe, spec, gateFor, ...inTheme('light') }) as Required<
      ReturnType<typeof contrastState>
    >;
    expect(state).toMatchObject({ check: 'design-md-contrast', route: 'DESIGN.md', theme: 'light', appliedTheme: 'light' });
    expect(state.contrast.map((c: { component: string; ratio: number; threshold: number }) => [c.component, c.threshold])).toEqual([
      ['card', 4.5],
      ['badge-warning', 4.5],
      ['heading', 3],
    ]);
    expect(state.contrast[0].ratio).toBe(21);
    expect(state.findings).toHaveLength(1);
    expect(state.findings[0]).toMatchObject({ id: 'design-md-contrast', gate: 'COL-001', target: 'components.badge-warning' });
    expect(state.findings[0].detail).toMatch(
      /^\{colors\.warning\} \(--warning, rgb\(170, 170, 170\)\) on \{colors\.warning-soft\} \(--warning-soft, rgb\(255, 255, 255\)\): 2\.32:1, needs 4\.5:1 for normal text$/,
    );
    expect(state.needsReview).toEqual([
      expect.objectContaining({ gate: 'COL-001', kind: 'needs-review', target: 'components.chip', detail: '{colors.x} on {colors.card}: --x not set in this theme' }),
    ]);

    const report = buildReport({ baseUrl: 'u', themeKey: 'k' }, [state]);
    expect(report.summary).toMatchObject({ totalFindings: 1, needsReview: 1, byGate: { 'COL-001': 1 } });
    expect(summaryLines(report).join('\n')).toContain('CONTRAST light: COL-001 components.badge-warning {colors.warning}');
    expect(exitCode(report, { failOnFindings: true })).toBe(1);
    // A sweep state with the same render state is another identity.
    const sweep = { route: 'DESIGN.md', theme: 'light', width: 1440, findings: [state.findings[0]] };
    expect(diffReports(buildReport({ baseUrl: 'u', themeKey: 'k' }, [sweep]), report).new).toHaveLength(1);
  });

  // Token contrast does not depend on the page width: a baseline taken with
  // other --widths (its first width is where the probe ran) must match.
  it('keys contrast findings by theme alone, whatever widths either run swept', () => {
    const atWidth = (width: number) => contrastState({ theme: 'light', width, pairs, probe, spec, gateFor, ...inTheme('light') });
    const baseline = buildReport({ baseUrl: 'u', themeKey: 'k' }, [atWidth(1440)]);
    const current = buildReport({ baseUrl: 'u', themeKey: 'k' }, [atWidth(390)]);
    expect(current.states[0]).toMatchObject({ probedWidth: 390 });
    expect(current.states[0]).not.toHaveProperty('width');
    const diff = diffReports(baseline, current);
    expect(diff).toMatchObject({ new: [], resolved: [], unverified: [], carriedOver: 1 });
    expect(exitCode(current, { failOnFindings: true }, diff)).toBe(0);
    expect(summaryLines(current, diff).join('\n')).not.toMatch(/DESIGN\.md light \d+px/);

    // A report written before this change put a width on the contrast state.
    const older = { states: [{ ...baseline.states[0], probedWidth: undefined, width: 1440 }] };
    expect(diffReports(older, current)).toMatchObject({ new: [], carriedOver: 1 });

    // A fixed contrast is resolved, not unverified, under another width.
    const fixed = contrastState({
      theme: 'light', width: 768, pairs: pairs.slice(0, 1), spec, gateFor, ...inTheme('light'),
      probe: { value: { results: [result({})] } },
    });
    const gone = diffReports(baseline, buildReport({ baseUrl: 'u', themeKey: 'k' }, [fixed]));
    expect(gone.resolved).toHaveLength(1);
    expect(gone.unverified).toEqual([]);
  });

  // The badge pairs the components map names are the ones the kit 0.5.0
  // badge CSS paints, and with the colours the light theme of that kit
  // computes (taken from a --design-md run on the composed shell) they meet
  // 4.5:1, so DESIGN.md Known Gaps records no badge pair.
  it('measures the kit 0.5.0 badge pairs at or above 4.5:1, which Known Gaps does not list', async () => {
    const measured: Record<string, [number[], number[], string]> = {
      'badge-success': [[4, 120, 87], [232, 248, 241], '4.99'],
      'badge-warning': [[146, 64, 14], [255, 247, 214], '6.59'],
      'badge-danger': [[190, 18, 60], [255, 241, 242], '5.72'],
      'badge-info': [[37, 99, 235], [234, 242, 255], '4.58'],
    };
    const badges = contrastPairs(await shippedFront(), spec).filter((p) => p.component in measured);
    expect(badges.map((p) => p.component).sort()).toEqual(Object.keys(measured).sort());
    expect(badges.filter((p) => p.component !== 'badge-info').map((p) => p.text.name).sort()).toEqual(
      ['--danger-foreground', '--success-foreground', '--warning-foreground'],
    );
    const results = badges.map((p) =>
      result({ textRgb: measured[p.component][0], backgroundRgb: measured[p.component][1], fontSizePx: 12 }),
    );
    const state = contrastState({ theme: 'light', pairs: badges, probe: { value: { results } }, spec, gateFor, ...inTheme('light') });
    expect(state.findings).toEqual([]);
    expect(
      Object.fromEntries((state.contrast ?? []).map((c: { component: string; ratio: number }) => [c.component, c.ratio.toFixed(2)])),
    ).toEqual(Object.fromEntries(Object.entries(measured).map(([k, v]) => [k, v[2]])));
    const designMd = fs.readFileSync(path.resolve(here, '../../../../DESIGN.md'), 'utf8');
    const knownGaps = designMd.slice(designMd.indexOf('## Known Gaps'));
    expect(knownGaps).not.toMatch(/badge/i);
  });

  it('turns a failed probe into an environment failure (exit 2)', () => {
    const failed = contrastState({ theme: 'dark', width: 1440, pairs, probe: { error: 'TypeError: x' }, spec, gateFor, ...inTheme('dark') });
    expect(failed.environmentError).toBe('contrast probe failed: TypeError: x');
    const short = contrastState({ theme: 'dark', width: 1440, pairs, probe: { value: { results: [] } }, spec, gateFor, ...inTheme('dark') });
    expect(short.environmentError).toMatch(/no result per pair/);
    expect(exitCode(buildReport({ baseUrl: 'u', themeKey: 'k' }, [failed]), { failOnFindings: false })).toBe(2);
  });

  // Without Studio, a page that never read the seeded key renders its
  // default theme: the dark pass measured light tokens.
  it('measures nothing in a page that is not in the requested theme, and says which theme it is in', () => {
    const lightPage = { value: { id: 'light', attribute: 'light', stored: 'light' } };
    const state = contrastState({
      theme: 'dark', width: 1440, pairs, probe, spec, gateFor, applied: lightPage, themeKey: 'frontx:theme',
    });
    expect(state).toMatchObject({ theme: 'dark', appliedTheme: 'light' });
    expect(state.environmentError).toBe(
      'contrast not measured: theme not applied: requested "dark", the page shows data-theme-id="light" ' +
        '(data-theme="light"; localStorage "frontx:theme" holds "light"); is "frontx:theme" the key the app ' +
        'restores its theme from, and "dark" a registered theme id?',
    );
    expect(state).not.toHaveProperty('contrast');
    expect(state).not.toHaveProperty('findings');
    const report = buildReport({ baseUrl: 'u', themeKey: 'frontx:theme' }, [state]);
    expect(exitCode(report, { failOnFindings: false })).toBe(2);
    expect(summaryLines(report).join('\n')).toContain('requested "dark", the page shows data-theme-id="light"');

    const unread = contrastState({
      theme: 'dark', pairs, probe, spec, gateFor, applied: { error: 'SecurityError: localStorage' }, themeKey: 'frontx:theme',
    });
    expect(unread.environmentError).toBe(
      'contrast not measured: could not read the applied theme (requested "dark"): SecurityError: localStorage',
    );
  });
});

/**
 * Just enough of a page for the probe: custom properties resolved from
 * `vars`, computed colours as `rgb(r, g, b)`, and a 1x1 canvas that keeps
 * the last colour filled. Only what the probe receives exists in the vm
 * context, so a probe that reaches for a module-scope name throws there.
 */
function fakePage(vars: Record<string, string>) {
  const resolve = (value = '') => value.replace(/^var\((--[\w-]+)\)$/, (_, name: string) => vars[name] ?? '');
  const rgb = (color: string) => {
    const fn = /^rgb\((\d+), (\d+), (\d+)\)$/.exec(color);
    if (fn) return [Number(fn[1]), Number(fn[2]), Number(fn[3])];
    const hex = /^#([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(color);
    return hex ? [1, 2, 3].map((i) => Number.parseInt(hex[i], 16)) : null;
  };
  let pixel = [0, 0, 0];
  let fill = '#000000';
  const ctx = {
    get fillStyle() {
      return fill;
    },
    set fillStyle(color: string) {
      if (rgb(color)) fill = color;
    },
    clearRect: () => {
      pixel = [0, 0, 0];
    },
    fillRect: () => {
      pixel = rgb(fill) ?? pixel;
    },
    getImageData: () => ({ data: [...pixel, 255] }),
  };
  const removed: unknown[] = [];
  type Node = { style: Record<string, string>; attrs: Record<string, string>; [key: string]: unknown };
  const element = (): Node => {
    const node: Node = {
      style: {},
      attrs: {},
      setAttribute: (key: string, value: string) => {
        node.attrs[key] = value;
      },
      getAttribute: (key: string) => node.attrs[key] ?? null,
      appendChild: () => undefined,
      remove: () => removed.push(node),
      getContext: () => ctx,
    };
    return node;
  };
  const documentElement = element();
  documentElement.attrs['data-theme'] = 'light';
  const body = element();
  const getComputedStyle = (el: Node) => ({
    backgroundColor: el === documentElement || el === body ? 'rgb(255, 255, 255)' : resolve(el.style.backgroundColor),
    color: resolve(el.style.color),
    fontSize: el.style.fontSize ? resolve(el.style.fontSize) : '16px',
    fontWeight: el.style.fontWeight ? resolve(el.style.fontWeight) : '400',
    getPropertyValue: (name: string) => vars[name] ?? '',
  });
  return { context: { document: { documentElement, body, createElement: element }, getComputedStyle }, removed };
}

describe('the probe and the flag', () => {
  it('runs the serialised probe on its own, with nothing from this module in scope', () => {
    const probePairs = [
      { component: 'card', text: { ref: 'a', name: '--card-foreground' }, background: { ref: 'b', name: '--card' }, font: { ref: 'f', size: '--text-label-size', weight: '--text-label-weight' } },
      { component: 'chip', text: { ref: 'c', name: '--x' }, background: { ref: 'b', name: '--card' } },
    ];
    const page = fakePage({
      '--card-foreground': 'rgb(17, 24, 39)',
      '--card': 'rgb(255, 255, 255)',
      '--text-label-size': '14px',
      '--text-label-weight': '600',
    });
    const value = JSON.parse(JSON.stringify(vm.runInNewContext(probeExpression(probePairs), page.context)));
    expect(value).toEqual({
      results: [
        {
          component: 'card', background: 'rgb(255, 255, 255)', text: 'rgb(17, 24, 39)',
          backgroundRgb: [255, 255, 255], textRgb: [17, 24, 39], fontSizePx: 14, fontWeight: 600, empty: [],
        },
        {
          component: 'chip', background: 'rgb(255, 255, 255)', text: '',
          backgroundRgb: [255, 255, 255], textRgb: null, fontSizePx: 16, fontWeight: 400, empty: ['--x'],
        },
      ],
    });
    // The probe host leaves the page.
    expect(page.removed).toHaveLength(1);
    const state = contrastState({ theme: 'light', width: 1440, pairs: probePairs, probe: { value }, spec, gateFor, ...inTheme('light') });
    expect(state.contrast?.[0]).toMatchObject({ component: 'card', ratio: 17.73, threshold: 4.5 });
    expect(state.needsReview?.[0]).toMatchObject({ target: 'components.chip' });
  });

  it('parses --design-md and resolves it against the project root', () => {
    const { config, errors } = parseArgs(['--design-md', 'DESIGN.md']);
    expect(errors).toEqual([]);
    expect(resolvePaths(config, '/app').designMd).toBe('/app/DESIGN.md');
  });
});
