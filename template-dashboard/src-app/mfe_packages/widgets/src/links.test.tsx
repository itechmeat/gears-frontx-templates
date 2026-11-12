import { render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { SafeLink, isSafeHref, linkTargetOf } from './links';
import { DEFAULT_WIDGET_TEXTS } from './states';

const ORIGIN = window.location.origin;

describe('the grid link rule', () => {
  it.each([
    ['https://example.org/a', true],
    ['/relative/path', true],
    ['page?x=1', true],
    ['javascript:alert(1)', false],
    [' JavaScript:alert(1)', false],
    ['java\tscript:alert(1)', false],
    ['data:text/html,x', false],
    ['mailto:someone@example.org', false],
    ['//other.example/a', false],
    ['\\\\other.example/a', false],
    ['/\\other.example/a', false],
    [' ///other.example/a', false],
    ['\t//other.example/a', false],
    ['a//path', true],
  ])('treats %s as safe: %s', (href, safe) => {
    expect(isSafeHref(href)).toBe(safe);
  });
});

describe('the card link rule', () => {
  it.each([
    ['javascript:alert(1)', 'the javascript: scheme'],
    [' JavaScript:alert(1)', 'the javascript: scheme'],
    ['java\tscript:alert(1)', 'the javascript: scheme'],
    ['data:text/html,x', 'the data: scheme'],
    ['vbscript:msgbox(1)', 'the vbscript: scheme'],
    ['//other.example/a', 'a protocol-relative target'],
    ['/\\other.example/a', 'a protocol-relative target'],
    ['\\\\other.example/a', 'a protocol-relative target'],
    ['page?x=1', 'a relative target that does not start with /'],
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

  it('takes the new-tab note from the texts', () => {
    render(<SafeLink text="Report" href="https://example.org/r" texts={{ ...texts, link: { newTab: 'neuer Tab' } }} />);
    expect(screen.getByRole('link', { name: 'Report (neuer Tab)' })).toBeTruthy();
  });
});
