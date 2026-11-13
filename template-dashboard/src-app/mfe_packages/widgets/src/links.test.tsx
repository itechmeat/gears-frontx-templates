import { render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { SafeLink, hasVisibleText, linkTargetOf } from './links';
import { DEFAULT_WIDGET_TEXTS } from './states';

const ORIGIN = window.location.origin;

describe('the shared link rule', () => {
  it.each([
    ['javascript:alert(1)', 'the javascript: scheme'],
    [' JavaScript:alert(1)', 'the javascript: scheme'],
    ['java\tscript:alert(1)', 'the javascript: scheme'],
    ['data:text/html,x', 'the data: scheme'],
    ['vbscript:msgbox(1)', 'the vbscript: scheme'],
    ['//other.example/a', 'a protocol-relative target'],
    ['/\\other.example/a', 'a protocol-relative target'],
    ['\\\\other.example/a', 'a protocol-relative target'],
    [' //other.example/a', 'a protocol-relative target'],
    ['\t//other.example/a', 'a protocol-relative target'],
    // The tab goes before the protocol-relative check, as the browser drops it: what is left is `//host`.
    ['/\t/other.example/a', 'a protocol-relative target'],
    ['page?x=1', 'a relative target that does not start with /'],
    ['tok-3f9a:x', 'an unsupported scheme'],
    ['FILE:///etc/hosts', 'the file: scheme'],
    ['http://[::1', 'an unparsable target'],
  ])('refuses %s: %s', (href, problem) => {
    expect(linkTargetOf(href, ORIGIN)).toEqual({ problem });
  });

  it.each([
    ['/reports/weekly', { href: '/reports/weekly', external: false }],
    [`${ORIGIN}/reports`, { href: `${ORIGIN}/reports`, external: false }],
    ['https://example.org/a', { href: 'https://example.org/a', external: true }],
    ['http://example.org/a', { href: 'http://example.org/a', external: true }],
    ['mailto:team@example.org', { href: 'mailto:team@example.org', external: false }],
  ])('takes %s', (href, target) => {
    expect(linkTargetOf(href, ORIGIN)).toEqual(target);
  });
});

describe('a long run of spaces or controls in a target', () => {
  const RUN = 100_000;
  /** The result of `run` and the milliseconds it took. */
  const timed = <T,>(run: () => T) => {
    const start = performance.now();
    const result = run();
    return { result, ms: performance.now() - start };
  };
  const verdictOf = (target: ReturnType<typeof linkTargetOf>) => ('problem' in target ? target.problem : 'taken');
  // A wide budget: the linear trim takes at most a few milliseconds on this input, a trim regex seconds.
  // An inner run is the costly case for a trim that retries at each position; the second target has a leading and an inner run.
  const targets = (filler: string) => [`/a${filler}b`, `${filler}javascript:a${filler}b`];

  it.each([' ', '\u0001'])('reads a target with a 100k inner run of %j at once, with the verdict of the short form', (filler) => {
    targets(filler).forEach((short, index) => {
      const long = targets(filler.repeat(RUN))[index];
      const card = timed(() => linkTargetOf(long, ORIGIN));
      expect(card.ms).toBeLessThan(1000);
      expect(verdictOf(card.result)).toBe(verdictOf(linkTargetOf(short, ORIGIN)));
    });
  });
});

describe('SafeLink', () => {
  afterEach(() => vi.restoreAllMocks());
  const texts = DEFAULT_WIDGET_TEXTS;

  it('opens a link to another origin in a new tab without its opener, and says so', () => {
    render(<SafeLink text="Report" href="https://example.org/r" texts={texts} />);
    const link = screen.getByRole('link', { name: 'Report (opens in a new tab)' });
    expect(link.getAttribute('target')).toBe('_blank');
    expect(link.getAttribute('rel')).toBe('noopener noreferrer');
  });

  it('opens a same-origin link and a relative path in the same tab', () => {
    render(
      <>
        <SafeLink text="Same" href={`${ORIGIN}/a`} texts={texts} />
        <SafeLink text="Path" href="/a" texts={texts} />
      </>,
    );
    for (const name of ['Same', 'Path']) {
      const link = screen.getByRole('link', { name });
      expect(link.getAttribute('target')).toBeNull();
      expect(link.getAttribute('rel')).toBeNull();
    }
  });

  it('draws a refused target as its text, with one console line naming the reason and not the target', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    render(<SafeLink text="Run" href="javascript:alert(1)" texts={texts} />);
    expect(screen.queryByRole('link')).toBeNull();
    expect(screen.getByText('Run')).toBeTruthy();
    expect(warn).toHaveBeenCalledTimes(1);
    expect(warn).toHaveBeenCalledWith('[widget] a link is shown as text: the javascript: scheme');
  });

  it('opens the same host on another port or another scheme in a new tab: it is another origin', () => {
    const here = new URL(ORIGIN);
    const port = String((Number(here.port) || (here.protocol === 'https:' ? 443 : 80)) + 1);
    const otherScheme = here.protocol === 'https:' ? 'http:' : 'https:';
    render(
      <>
        <SafeLink text="Port" href={`${here.protocol}//${here.hostname}:${port}/a`} texts={texts} />
        <SafeLink text="Scheme" href={`${otherScheme}//${here.host}/a`} texts={texts} />
      </>,
    );
    for (const name of ['Port', 'Scheme']) {
      const link = screen.getByRole('link', { name: `${name} (opens in a new tab)` });
      expect(link.getAttribute('target')).toBe('_blank');
      expect(link.getAttribute('rel')).toBe('noopener noreferrer');
    }
  });

  it('names only the kind of a refused target in its console line, never the target text', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const KINDS = [
      'the javascript: scheme',
      'the data: scheme',
      'the vbscript: scheme',
      'the file: scheme',
      'the blob: scheme',
      'the ftp: scheme',
      'an unsupported scheme',
      'a protocol-relative target',
      'a relative target that does not start with /',
      'an unparsable target',
    ];
    const refused = ['tok-3f9a:x', 'javascript:tok', 'blob:tok', 'ftp://tok', 'x-tok:1', '//tok.example', 'tok/page', 'http://[tok', 'file:///tok'];
    render(
      <>
        {refused.map((href) => (
          <SafeLink key={href} text="Run" href={href} texts={texts} />
        ))}
      </>,
    );
    expect(warn).toHaveBeenCalledTimes(refused.length);
    for (const [line] of warn.mock.calls) {
      expect(KINDS).toContain(String(line).replace('[widget] a link is shown as text: ', ''));
      expect(String(line)).not.toContain('tok');
    }
  });

  it('takes the new-tab note from the texts', () => {
    render(<SafeLink text="Report" href="https://example.org/r" texts={{ ...texts, link: { newTab: 'neuer Tab' } }} />);
    expect(screen.getByRole('link', { name: 'Report (neuer Tab)' })).toBeTruthy();
  });
});

describe('a link text with no visible character', () => {
  afterEach(() => vi.restoreAllMocks());
  const BLANK = [
    ['empty', ''],
    ['spaces', '   '],
    ['a tab and a line break', '\t\n'],
    ['a no-break space', '\u00A0'],
    ['a zero-width space', '\u200B'],
    ['a zero-width non-joiner', '\u200C'],
    ['a zero-width joiner', '\u200D'],
    ['a word joiner', '\u2060'],
    ['a byte order mark', '\uFEFF'],
    ['a soft hyphen', '\u00AD'],
    ['a mix of them', ' \u200B\u00AD\uFEFF '],
  ];

  it.each(BLANK)('has no visible text: %s', (_kind, text) => {
    expect(hasVisibleText(text)).toBe(false);
  });

  it.each([['a word', 'Report'], ['0', '0'], ['a word between invisible marks', '\u200BRe\u00ADport\uFEFF'], ['a dot', '.']])('has visible text: %s', (_kind, text) => {
    expect(hasVisibleText(text)).toBe(true);
  });

  it.each(BLANK)('draws a link text of %s as text, with no anchor, no tab stop and no console line', (_kind, text) => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const { container } = render(
      <>
        <SafeLink text={text} href="/reports" texts={DEFAULT_WIDGET_TEXTS} />
        <SafeLink text={text} href="javascript:alert(1)" texts={DEFAULT_WIDGET_TEXTS} />
      </>,
    );
    expect(screen.queryByRole('link')).toBeNull();
    expect(container.querySelector('a, [href], [tabindex]')).toBeNull();
    expect(warn).not.toHaveBeenCalled();
  });
});
