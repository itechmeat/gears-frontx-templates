import { render } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { isLinkActive, isSameOriginImage } from './markdownModel';
import { MARKDOWN_CARD_SAMPLE } from '../samples';
import { DEFAULT_WIDGET_TEXTS, type WidgetTexts } from '../states';
import { MarkdownCard } from './MarkdownCard';

const card = (body: string) => {
  const { container, unmount } = render(<MarkdownCard payload={{ render: { body } }} />);
  const root = container.querySelector('.markdown');
  expect(root).not.toBeNull();
  return { html: () => root!.innerHTML, text: () => root!.textContent ?? '', unmount };
};

describe('markdown_card', () => {
  it('renders bold and lists', () => {
    const root = card('A **bold** word\n\n- one\n- two');
    expect(root.html()).toContain('<strong>bold</strong>');
    expect([...root.html().matchAll(/<li>/g)].length).toBe(2);
    expect(root.text()).toContain('one');
    root.unmount();
  });

  it('keeps the heading level of the markdown: # is h1, ## is h2 and ### is h3, so a section heading under the page title is ##', () => {
    const root = card('# Top\n\n## Section\n\nA paragraph.\n\n### Part');
    expect(root.html()).toContain('<h1>Top</h1>');
    expect(root.html()).toContain('<h2>Section</h2>');
    expect(root.html()).toContain('<h3>Part</h3>');
    expect(root.html()).toContain('<p>A paragraph.</p>');
    root.unmount();
  });

  it.each([
    ['reading', true],
    ['full', false],
    [undefined, false],
  ] as const)('holds the running text to the reading width only under text_width %s, and keeps the markup', (textWidth, reading) => {
    const { container } = render(<MarkdownCard payload={{ render: { body: '## Delivery\n\nA paragraph.', ...(textWidth ? { text_width: textWidth } : {}) } }} />);
    const root = container.querySelector('.markdown')!;
    expect(root.classList.contains('markdownReading'), `should carry the reading width: ${String(textWidth)}`).toBe(reading);
    expect(root.innerHTML).toBe('<h2>Delivery</h2>\n<p>A paragraph.</p>\n');
  });

  it.each([
    ['section', true],
    ['default', false],
    [undefined, false],
  ] as const)('draws the headings as section headings only under heading_style %s, and keeps their level and text', (headingStyle, section) => {
    const { container } = render(<MarkdownCard payload={{ render: { body: '## Delivery\n\nA paragraph.', ...(headingStyle ? { heading_style: headingStyle } : {}) } }} />);
    const root = container.querySelector('.markdown')!;
    expect(root.classList.contains('markdownSection'), `should carry the section look: ${String(headingStyle)}`).toBe(section);
    expect(root.innerHTML).toBe('<h2>Delivery</h2>\n<p>A paragraph.</p>\n');
  });

  it('names a warning card first in reading order, with an icon hidden from assistive technology, outside the markdown, and keeps the body', () => {
    const { container } = render(<MarkdownCard payload={{ render: { body: '## Delivery\n\nA paragraph.', tone: 'warning' } }} />);
    const card = container.firstElementChild as HTMLElement;
    expect(card.textContent).toBe('Warning: Delivery\nA paragraph.\n');
    const icons = [...card.querySelectorAll('svg')];
    expect(icons).toHaveLength(1);
    expect(icons[0].getAttribute('aria-hidden')).toBe('true');
    const markdown = card.querySelector('.markdown')!;
    expect(markdown.innerHTML).toBe('<h2>Delivery</h2>\n<p>A paragraph.</p>\n');
    expect(markdown.contains(icons[0])).toBe(false);
    expect(markdown.textContent).not.toContain('Warning');
    expect(card.classList.contains('markdownTone-warning')).toBe(true);
  });

  it.each([
    ['danger', 'Error'],
    ['success', 'Success'],
    ['info', 'Info'],
  ] as const)('names a card of tone %s %s, with its icon and surface', (tone, name) => {
    const { container } = render(<MarkdownCard payload={{ render: { body: 'A paragraph.', tone } }} />);
    const card = container.firstElementChild as HTMLElement;
    expect(card.textContent).toBe(`${name}: A paragraph.\n`);
    expect(card.querySelectorAll('svg[aria-hidden="true"]')).toHaveLength(1);
    expect(card.classList.contains(`markdownTone-${tone}`)).toBe(true);
  });

  it.each(['neutral', undefined] as const)('adds no name, icon or surface to a card of tone %s', (tone) => {
    const { container } = render(<MarkdownCard payload={{ render: { body: 'A paragraph.', ...(tone ? { tone } : {}) } }} />);
    const card = container.firstElementChild as HTMLElement;
    expect(card.classList.contains('markdown')).toBe(true);
    expect(card.textContent).toBe('A paragraph.\n');
    expect(container.querySelector('svg')).toBeNull();
    expect(container.querySelector('[class*="markdownTone"]')).toBeNull();
  });

  it.each(['success', 'warning', 'danger', 'info'] as const)('gives a card of tone %s no live or note role, so nothing is announced on mount', (tone) => {
    const { container } = render(<MarkdownCard payload={{ render: { body: 'A paragraph.', tone } }} />);
    expect(container.querySelectorAll('[role="alert"], [role="status"], [role="note"], [role="log"], [aria-live]')).toHaveLength(0);
  });

  it("takes the tone's name from the host's widget texts", () => {
    const texts: WidgetTexts = { ...DEFAULT_WIDGET_TEXTS, feed: { ...DEFAULT_WIDGET_TEXTS.feed, tone: { ...DEFAULT_WIDGET_TEXTS.feed.tone, warning: 'Achtung' } } };
    const { container } = render(<MarkdownCard payload={{ render: { body: 'A paragraph.', tone: 'warning' } }} texts={texts} />);
    expect(container.textContent).toBe('Achtung: A paragraph.\n');
  });

  it('keeps the section headings and the reading width of a toned card, with its surface and icon', () => {
    const { container } = render(<MarkdownCard payload={{ render: { body: '## Delivery\n\nA paragraph.', tone: 'info', heading_style: 'section', text_width: 'reading' } }} />);
    const markdown = container.querySelector('.markdown')!;
    expect(markdown.classList.contains('markdownSection')).toBe(true);
    expect(markdown.classList.contains('markdownReading')).toBe(true);
    expect(markdown.innerHTML).toBe('<h2>Delivery</h2>\n<p>A paragraph.</p>\n');
    expect(container.querySelector('.markdownTone-info svg[aria-hidden="true"]')).not.toBeNull();
  });

  it('shows embedded HTML as text and creates no element from it', () => {
    const root = card('Hello <script>alert(1)</script> and <b>bold</b> text');
    expect(root.html()).not.toContain('<script>');
    expect(root.html()).not.toContain('<b>');
    expect(root.text()).toContain('<script>alert(1)</script>');
    expect(root.text()).toContain('<b>bold</b>');
    root.unmount();
  });

  it('renders links of every other scheme inactive, as their link text alone', () => {
    for (const target of ['javascript:alert(1)', ' JavaScript:alert(1)', 'java&#9;script:alert(1)', '&#106;avascript:alert(1)', 'javascript&colon;alert(1)', 'data:text/html,hi', 'vbscript:x', 'file:///etc/passwd']) {
      const root = card(`[click](${target})`);
      expect(root.html(), target).not.toContain('<a');
      expect(root.html(), target).not.toContain('</a>');
      expect(root.text(), target).toContain('click');
      root.unmount();
    }
  });

  it('opens active links in a new browsing context with no access to the opener', () => {
    const root = card('[docs](https://example.com/a), [guide](/docs/guide) and [mail](mailto:team@example.com)');
    const links = [...document.querySelectorAll('.markdown a')];
    expect(links.map((link) => link.getAttribute('href'))).toEqual(['https://example.com/a', '/docs/guide', 'mailto:team@example.com']);
    for (const link of links) {
      expect(link.getAttribute('target')).toBe('_blank');
      expect(link.getAttribute('rel')).toBe('noopener noreferrer');
    }
    root.unmount();
  });

  it('loads same-origin images only, and shows the alt text of the others', () => {
    const root = card('![Chart](https://cdn.example/a.png) ![Remote](//other.example/a.png) ![Local](/img/a.png) and ![Blocked](data:image/png;base64,AAA)');
    const images = [...document.querySelectorAll('.markdown img')];
    expect(images.map((image) => image.getAttribute('src'))).toEqual(['/img/a.png']);
    expect(images[0].getAttribute('alt')).toBe('Local');
    const text = root.text();
    expect(text).toContain('Chart');
    expect(text).toContain('Remote');
    expect(text).toContain('Blocked');
    root.unmount();
    // An image with no alt text shows nothing.
    const empty = card('![](https://cdn.example/b.png)');
    expect(empty.html()).not.toContain('<img');
    empty.unmount();
  });

  it.each([' ', '\u0001'])('reads a target with a 100k inner run of %j at once, with the verdict of the short form', (filler) => {
    // An inner run is the costly case for a trim that retries at each position; the second target has a leading and an inner run.
    const targets = (run: string) => [`/a${run}b`, `${run}javascript:a${run}b`];
    targets(filler).forEach((short, index) => {
      const long = targets(filler.repeat(100_000))[index];
      // A wide budget: the linear trim takes at most a few milliseconds on this input, a trim regex seconds.
      const start = performance.now();
      const active = isLinkActive(long);
      expect(performance.now() - start).toBeLessThan(1000);
      expect(active).toBe(isLinkActive(short));
    });
  });

  it('reads targets the browser URL parser does, in the model the rules use', () => {
    expect(isLinkActive('JavaScript:alert(1)')).toBe(false);
    expect(isLinkActive('\tjavascript:alert(1)\n')).toBe(false);
    expect(isLinkActive('mailto:a@b.example')).toBe(true);
    expect(isLinkActive('HTTP://example.com')).toBe(true);
    expect(isLinkActive('docs/guide')).toBe(true);
    expect(isSameOriginImage('/img/a.png')).toBe(true);
    expect(isSameOriginImage('img/a.png')).toBe(true);
    expect(isSameOriginImage('//other.example/a.png')).toBe(false);
    expect(isSameOriginImage('https://cdn.example/a.png')).toBe(false);
    expect(isSameOriginImage('data:image/png;base64,AAA')).toBe(false);
    // Decoded, this reads as a path of the page origin; as the browser loads it, the host is evil.example.
    const smuggled = `//${location.host}%2F@evil.example/p.png`;
    expect(isSameOriginImage(smuggled)).toBe(false);
    expect(card(`![x](${smuggled})`).html()).not.toContain('<img');
    // A same-origin address with user info is not loaded either.
    expect(isSameOriginImage(`//user@${location.host}/p.png`)).toBe(false);
    expect(isSameOriginImage(`//user:password@${location.host}/p.png`)).toBe(false);
    expect(isSameOriginImage(`//${location.host}/p.png`)).toBe(true);
  });

  it('resolves image targets against a <base> element, as the browser loads them', () => {
    const base = document.createElement('base');
    base.href = 'https://cdn.example/assets/';
    document.head.append(base);
    try {
      // Under this base, `img/a.png` loads from cdn.example, not from the page origin.
      expect(isSameOriginImage('img/a.png')).toBe(false);
      expect(isSameOriginImage('/img/a.png')).toBe(false);
    } finally {
      base.remove();
    }
    expect(isSameOriginImage('img/a.png')).toBe(true);
  });

  it('renders the sample note with its link', () => {
    render(<MarkdownCard payload={MARKDOWN_CARD_SAMPLE} />);
    const link = document.querySelector('.markdown a');
    expect(link?.getAttribute('href')).toBe('https://example.com/metrics');
    expect(link?.getAttribute('target')).toBe('_blank');
    expect(link?.getAttribute('rel')).toBe('noopener noreferrer');
    expect(document.querySelector('.markdown strong')?.textContent).toBe('engineering organisation');
    expect(document.querySelectorAll('.markdown li').length).toBe(2);
  });

  it('keeps a tag in a link text as text', () => {
    const root = card('[see <script>x</script>](https://example.com)');
    expect(root.text()).toContain('see <script>x</script>');
    expect(root.html()).not.toContain('<script');
    root.unmount();
  });

  it('renders an autolink, a reference link and a linked image of a dangerous scheme inactive', () => {
    for (const body of ['<javascript:alert(1)>', '[x][r]\n\n[r]: javascript:alert(1)', '[![i](/a.png)](javascript:x)']) {
      const root = card(body);
      expect(root.html(), body).not.toMatch(/<a[\s>]|<\/a>/);
      root.unmount();
    }
  });
});
