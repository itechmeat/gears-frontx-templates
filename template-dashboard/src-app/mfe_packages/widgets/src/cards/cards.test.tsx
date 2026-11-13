import { render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { ValueFormat } from '@gears-frontx/frontx-dashboard-root/contract';

import { DEFAULT_WIDGET_TEXTS, type WidgetTexts } from '../states';
import type { MetricCardRender, RadialProgressData, RadialProgressRender } from '../types';
import { MetricCard } from './MetricCard';
import { ProgressListCard } from './ProgressListCard';
import { RadialProgress } from './RadialProgress';
import { RankedListCard } from './RankedListCard';
import { SummaryCard } from './SummaryCard';
import { METRIC_CARD_SAMPLE, PROGRESS_LIST_CARD_SAMPLE, RANKED_LIST_CARD_SAMPLE, SUMMARY_CARD_SAMPLE } from '../samples';

const PAINTS = [
  ['variantSuccess', 'success'],
  ['variantDanger', 'danger'],
  ['variantSecondary', 'neutral'],
] as const;

/**
 * The kit badges under an element, found by the class of a badge paint. A kit link carries variant classes of its own
 * (variantDefault, variantMuted, variantInherit), so a bare `[class*="variant"]` would find it too.
 */
const badgesIn = (element: Element) => [...element.querySelectorAll('*')].filter((node) => /variant(Success|Danger|Secondary|Warning|Info)/.test(node.getAttribute('class') ?? ''));

describe('metric_card', () => {
  afterEach(() => vi.restoreAllMocks());

  it('shows the headline, the caption and the trend with its icon named', () => {
    render(<MetricCard payload={METRIC_CARD_SAMPLE} />);
    expect(screen.getByText('44,000')).toBeTruthy();
    expect(screen.getByText('vs previous 28 days')).toBeTruthy();
    // The icon carries an accessible name (English, gears-frontx-templates#105), and the change stands beside it: the direction never rides on colour alone.
    expect(screen.getByRole('img', { name: 'Up' }).parentElement?.textContent).toBe('10%');
  });

  it('names the trend icon for each direction, from the texts', () => {
    const trend = (value: number, previous: number, texts?: WidgetTexts) => {
      const { unmount } = render(<MetricCard payload={{ render: {}, data: { value, previous_value: previous } }} texts={texts} />);
      const icon = screen.getByRole('img');
      const named = { name: icon.getAttribute('aria-label'), change: icon.parentElement?.textContent };
      unmount();
      return named;
    };
    expect(trend(110, 100)).toEqual({ name: 'Up', change: '10%' });
    expect(trend(90, 100)).toEqual({ name: 'Down', change: '-10%' });
    expect(trend(100, 100)).toEqual({ name: 'No change', change: '0%' });
    const german: WidgetTexts = { ...DEFAULT_WIDGET_TEXTS, trend: { up: 'steigend', down: 'fallend', flat: 'unverändert' } };
    expect(trend(110, 100, german).name).toBe('steigend');
  });

  it('paints the trend by the direction that improves, keeping the icon on the value\'s own direction', () => {
    const paint = (value: number, better?: 'higher' | 'lower' | 'neutral') => {
      const { unmount } = render(<MetricCard payload={{ render: better ? { better } : {}, data: { value, previous_value: 100 } }} />);
      const icon = screen.getByRole('img');
      const badge = icon.parentElement?.className ?? '';
      // The kit Badge names its variant in its class (variantSuccess, variantDanger, variantSecondary).
      const painted = { name: icon.getAttribute('aria-label'), paint: PAINTS.find(([variant]) => badge.includes(variant))?.[1] ?? badge };
      unmount();
      return painted;
    };
    expect(paint(120)).toEqual({ name: 'Up', paint: 'success' });
    expect(paint(80)).toEqual({ name: 'Down', paint: 'danger' });
    expect(paint(80, 'lower')).toEqual({ name: 'Down', paint: 'success' });
    expect(paint(120, 'lower')).toEqual({ name: 'Up', paint: 'danger' });
    expect(paint(100, 'lower')).toEqual({ name: 'No change', paint: 'neutral' });
    // With neither direction better, a rise and a fall both paint neutral; the icon keeps the value's direction.
    expect(paint(120, 'neutral')).toEqual({ name: 'Up', paint: 'neutral' });
    expect(paint(80, 'neutral')).toEqual({ name: 'Down', paint: 'neutral' });
  });

  it('shows no trend without a previous value, and the icon alone against 0', () => {
    const { unmount } = render(<MetricCard payload={{ render: {}, data: { value: 44_000, previous_value: null } }} />);
    expect(screen.getByText('44,000')).toBeTruthy();
    expect(screen.queryByRole('img')).toBeNull();
    unmount();
    const { unmount: unmountZero } = render(<MetricCard payload={{ render: {}, data: { value: -3, previous_value: 0 } }} />);
    expect(screen.getByText('-3')).toBeTruthy();
    // Against a previous value of 0 there is no change to show, so the direction icon stands alone.
    expect(screen.getByRole('img', { name: 'Down' }).parentElement?.textContent).toBe('');
    unmountZero();
  });

  it('shows no caption without value_label', () => {
    render(<MetricCard payload={{ ...METRIC_CARD_SAMPLE, render: {} }} />);
    expect(screen.getByText('44,000')).toBeTruthy();
    expect(screen.queryByText('vs previous 28 days')).toBeNull();
  });

  it('formats the headline by value_format', () => {
    const { unmount } = render(<MetricCard payload={{ render: {}, value_format: { value_type: 'percent' }, data: { value: 0.25 } }} />);
    expect(screen.getByText('25%')).toBeTruthy();
    unmount();
    render(<MetricCard payload={{ render: {}, value_format: { value_type: 'duration', unit: 's' }, data: { value: 90 } }} />);
    expect(screen.getByText('90 sec')).toBeTruthy();
  });

  it('draws the sparkline and breaks it at a null point', () => {
    const { container, unmount } = render(<MetricCard payload={{ render: {}, data: { value: 3, sparkline: [1, null, 3, 5] } }} />);
    const curve = container.querySelector('.recharts-area-curve');
    expect(curve).not.toBeNull();
    // The null step is a gap: the path starts once before it and once after it.
    expect(((curve?.getAttribute('d') ?? '').match(/M/g) ?? []).length).toBe(2);
    unmount();
    const { container: bare } = render(<MetricCard payload={{ render: {}, data: { value: 3 } }} />);
    expect(bare.querySelector('.recharts-area-curve')).toBeNull();
  });

  it('shows the empty state for a null value', () => {
    render(<MetricCard payload={{ ...METRIC_CARD_SAMPLE, data: { ...METRIC_CARD_SAMPLE.data, value: null } }} />);
    expect(screen.getByText('No data to show')).toBeTruthy();
  });

  it('shows its cannot-be-shown state without data', () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    render(<MetricCard payload={{ render: {} }} />);
    expect(screen.getByText('This widget cannot be shown')).toBeTruthy();
  });
});

describe('summary_card', () => {
  afterEach(() => vi.restoreAllMocks());

  it('shows one label/value line per row, in delivered order', () => {
    const { container } = render(<SummaryCard payload={SUMMARY_CARD_SAMPLE} />);
    expect([...container.querySelectorAll('dl > div')].map((row) => row.textContent)).toEqual(['Sessions128,940', 'Conversions4,383', 'P75 latency (ms)812']);
  });

  it('keeps a row with a null label and shows a null value as empty', () => {
    const { container } = render(<SummaryCard payload={{ render: {}, data: { rows: [{ label: null, value: 5 }, { label: 'Bounce rate', value: null }] } }} />);
    expect([...container.querySelectorAll('dl > div')].map((row) => row.textContent)).toEqual(['5', 'Bounce rate']);
  });

  it('formats every row by value_format', () => {
    const { container, unmount } = render(
      <SummaryCard
        payload={{ render: {}, value_format: { value_type: 'percent' }, data: { rows: [{ label: 'Visitor to signup', value: 0.25 }, { label: 'Signup to active', value: null }] } }}
      />,
    );
    expect([...container.querySelectorAll('dl > div')].map((row) => row.textContent)).toEqual(['Visitor to signup25%', 'Signup to active']);
    unmount();
    render(<SummaryCard payload={{ render: {}, value_format: { value_type: 'duration', unit: 'min' }, data: { rows: [{ label: 'Session length', value: 90 }] } }} />);
    expect(screen.getByText('90 min')).toBeTruthy();
  });

  it('shows the empty state for no rows', () => {
    render(<SummaryCard payload={{ render: {}, data: { rows: [] } }} />);
    expect(screen.getByText('No data to show')).toBeTruthy();
  });

  it('shows its cannot-be-shown state without data', () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    render(<SummaryCard payload={{ render: {} }} />);
    expect(screen.getByText('This widget cannot be shown')).toBeTruthy();
  });
});

describe('ranked_list_card', () => {
  afterEach(() => vi.restoreAllMocks());

  it('never re-orders rows that are not sorted by value', () => {
    const rows = [3, 9, 1].map((value, index) => ({ label: `r${index}`, value }));
    const { container } = render(<RankedListCard payload={{ render: {}, data: { rows } }} />);
    expect([...container.querySelectorAll('ol > li')].map((row) => row.textContent)).toEqual(['1r03', '2r19', '3r21']);
  });

  it('shows one ranked row per data row, in the delivered order, under the render headings', () => {
    const { container } = render(<RankedListCard payload={RANKED_LIST_CARD_SAMPLE} />);
    expect(screen.getByText('Commits')).toBeTruthy();
    expect(screen.getByText('Reviewers')).toBeTruthy();
    expect([...container.querySelectorAll('ol > li')].map((row) => row.textContent)).toEqual([
      '1gears-frontx/ui-kit1,28434',
      '2gears-frontx/dashboard98627',
      '3gears-frontx/mfes61219',
      '4gears-frontx/templates34111',
    ]);
  });

  it('names the value columns by the default headings where the render names none', () => {
    render(<RankedListCard payload={{ render: {}, data: { rows: [{ label: 'api', value: 5, secondary: 2 }] } }} />);
    expect(screen.getByText('Value')).toBeTruthy();
    expect(screen.getByText('Secondary')).toBeTruthy();
  });

  it('hides the secondary column and its heading when no row has a secondary value', () => {
    const { container } = render(
      <RankedListCard payload={{ render: { secondary_label: 'Reviewers' }, data: { rows: [{ label: 'api', value: 5 }, { label: 'web', value: 3 }] } }} />,
    );
    expect(screen.queryByText('Reviewers')).toBeNull();
    expect([...container.querySelectorAll('ol > li')].map((row) => row.textContent)).toEqual(['1api5', '2web3']);
  });

  it('keeps a row with a null label, keeps the secondary column for an explicit null, and shows null values as empty', () => {
    const { container } = render(
      <RankedListCard payload={{ render: {}, data: { rows: [{ label: null, value: 5 }, { label: 'Coverage', value: null, secondary: null }] } }} />,
    );
    expect(screen.getByText('Secondary')).toBeTruthy();
    expect([...container.querySelectorAll('ol > li')].map((row) => row.textContent)).toEqual(['15', '2Coverage']);
  });

  it('formats every value by value_format', () => {
    render(<RankedListCard payload={{ render: {}, value_format: { value_type: 'percent' }, data: { rows: [{ label: 'Coverage', value: 0.25, secondary: 0.5 }] } }} />);
    expect(screen.getByText('25%')).toBeTruthy();
    expect(screen.getByText('50%')).toBeTruthy();
  });

  it('shows the empty state for no rows', () => {
    render(<RankedListCard payload={{ ...RANKED_LIST_CARD_SAMPLE, data: { rows: [] } }} />);
    expect(screen.getByText('No data to show')).toBeTruthy();
  });

  it('shows its cannot-be-shown state without data', () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    render(<RankedListCard payload={{ render: {} }} />);
    expect(screen.getByText('This widget cannot be shown')).toBeTruthy();
  });
});

describe('progress_list_card', () => {
  afterEach(() => vi.restoreAllMocks());

  it('shows one bar per row, in the delivered order, with the current and target values as text', () => {
    const { container } = render(<ProgressListCard payload={PROGRESS_LIST_CARD_SAMPLE} />);
    expect([...container.querySelectorAll('ul > li')].map((row) => row.children[0].textContent)).toEqual([
      'Platform118 of 120',
      'Billing64 of 80',
      'Growth41 of 40',
      'Foundations12 of 60',
    ]);
  });

  it('gives every bar the progressbar role, named by its label, with its values as its value text', () => {
    render(<ProgressListCard payload={PROGRESS_LIST_CARD_SAMPLE} />);
    expect(screen.getAllByRole('progressbar')).toHaveLength(4);
    const platform = screen.getByRole('progressbar', { name: 'Platform' });
    expect(platform.getAttribute('aria-valuenow')).toBe('98.33');
    expect(platform.getAttribute('aria-valuetext')).toBe('118 of 120');
    // A row at or over its target has a full bar.
    expect(screen.getByRole('progressbar', { name: 'Growth' }).getAttribute('aria-valuenow')).toBe('100');
  });

  it('fills the bar at or over the target and keeps it empty for a null current or a null or zero target', () => {
    const { container } = render(
      <ProgressListCard
        payload={{
          render: {},
          data: {
            rows: [
              { label: 'At target', current: 40, target: 40 },
              { label: 'Over target', current: 41, target: 40 },
              { label: 'No current', current: null, target: 40 },
              { label: 'No target', current: 10, target: null },
              { label: 'Zero target', current: 10, target: 0 },
            ],
          },
        }}
      />,
    );
    expect([...container.querySelectorAll('[role="progressbar"]')].map((bar) => bar.getAttribute('aria-valuenow'))).toEqual(['100', '100', '0', '0', '0']);
    // A missing side shows as a plain hyphen, in the text and the value text alike, so the row keeps saying which side it lacks.
    expect([...container.querySelectorAll('ul > li')].map((row) => row.children[0].textContent)).toEqual([
      'At target40 of 40',
      'Over target41 of 40',
      'No current- of 40',
      'No target10 of -',
      'Zero target10 of 0',
    ]);
    expect(screen.getByRole('progressbar', { name: 'No current' }).getAttribute('aria-valuetext')).toBe('- of 40');
    expect(screen.getByRole('progressbar', { name: 'No target' }).getAttribute('aria-valuetext')).toBe('10 of -');
  });

  it('never fills a bar below its target, as the ring does not (2999999999999 of 3000000000000)', () => {
    render(<ProgressListCard payload={{ render: {}, data: { rows: [{ label: 'Near', current: 2999999999999, target: 3000000000000 }] } }} />);
    expect(screen.getByRole('progressbar', { name: 'Near' }).getAttribute('aria-valuenow')).toBe('99.99');
  });

  it('formats the values by value_format', () => {
    render(<ProgressListCard payload={{ render: {}, value_format: { value_type: 'percent' }, data: { rows: [{ label: 'Rollout', current: 0.5, target: 0.8 }] } }} />);
    expect(screen.getByText('50% of 80%')).toBeTruthy();
    expect(screen.getByRole('progressbar', { name: 'Rollout' }).getAttribute('aria-valuenow')).toBe('62.5');
  });

  it('keeps a row with a null label, and takes the wordings from the texts', () => {
    const german: WidgetTexts = { ...DEFAULT_WIDGET_TEXTS, progress: { ...DEFAULT_WIDGET_TEXTS.progress, of: 'von' } };
    const { container } = render(<ProgressListCard payload={{ render: {}, data: { rows: [{ label: null, current: 1, target: 2 }] } }} texts={german} />);
    expect(container.querySelectorAll('ul > li')).toHaveLength(1);
    expect(screen.getByText('1 von 2')).toBeTruthy();
    // A null label names no bar.
    expect(screen.getByRole('progressbar').getAttribute('aria-label')).toBeNull();
  });

  it('shows the empty state for no rows', () => {
    render(<ProgressListCard payload={{ ...PROGRESS_LIST_CARD_SAMPLE, data: { rows: [] } }} />);
    expect(screen.getByText('No data to show')).toBeTruthy();
  });

  it('shows its cannot-be-shown state without data', () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    render(<ProgressListCard payload={{ render: {} }} />);
    expect(screen.getByText('This widget cannot be shown')).toBeTruthy();
  });
});

describe('metric_card reference and link', () => {
  afterEach(() => vi.restoreAllMocks());
  const metric = (data: Record<string, unknown>, renderOptions: Record<string, unknown> = {}, texts?: WidgetTexts) =>
    render(<MetricCard payload={{ render: renderOptions, data: { value: 110, ...data } }} texts={texts} />);

  it('shows the reference under the headline with the difference, absolute and in percent, painted by the better rule', () => {
    const { container } = metric({ reference_value: 100 }, { reference_label: 'Last week' });
    expect(screen.getByText('Last week 100')).toBeTruthy();
    const badge = badgesIn(container)[0];
    expect(badge.textContent).toBe('Difference from Last week: +10 (+10%)');
    expect(badge.className).toContain('variantSuccess');
  });

  it('paints a worse reference difference danger under better lower, and neutral under better neutral', () => {
    const paint = (better: string) => {
      const { container, unmount } = metric({ reference_value: 100 }, { better });
      const name = badgesIn(container)[0].className;
      unmount();
      return name;
    };
    expect(paint('lower')).toContain('variantDanger');
    expect(paint('neutral')).toContain('variantSecondary');
  });

  it('shows the difference alone against a zero reference, and nothing for a null one', () => {
    const { container, unmount } = metric({ reference_value: 0 });
    expect(badgesIn(container)[0].textContent).toBe('Difference from Reference: +110');
    unmount();
    const { container: none } = metric({ reference_value: null });
    expect(badgesIn(none)).toEqual([]);
    expect(screen.queryByText(/Reference/)).toBeNull();
  });

  // Each part carries a sign only when it does not show as zero; the badge is flat only when every shown part is zero,
  // otherwise its direction is the sign of the raw difference, painted by the better rule.
  it.each<{ case: string; value: number; reference: number; render: MetricCardRender; format?: ValueFormat; text: string; paint: string }>([
    // 0.3 - (0.1 + 0.2) is about -5.6e-17 in floating point: both parts show as zero.
    { case: '0.3 against 0.1 + 0.2', value: 0.3, reference: 0.1 + 0.2, render: {}, text: '0 (0%)', paint: 'neutral' },
    { case: '1.4 against 1, no decimals', value: 1.4, reference: 1, render: {}, format: { value_type: 'number', decimals: 0 }, text: '0 (+40%)', paint: 'success' },
    // The default format keeps three fraction digits: 0.0001 shows as 0.
    { case: '0.0002 against 0.0001', value: 0.0002, reference: 0.0001, render: {}, text: '0 (+100%)', paint: 'success' },
    { case: '0 against 0', value: 0, reference: 0, render: {}, text: '0', paint: 'neutral' },
    { case: '5 against 0', value: 5, reference: 0, render: {}, text: '+5', paint: 'success' },
    { case: '-5 against 0', value: -5, reference: 0, render: {}, text: '-5', paint: 'danger' },
    { case: '0.0002 against 0', value: 0.0002, reference: 0, render: {}, text: '0', paint: 'neutral' },
    { case: '-5 against -10', value: -5, reference: -10, render: {}, text: '+5 (+50%)', paint: 'success' },
    { case: '-10 against -5', value: -10, reference: -5, render: {}, text: '-5 (-100%)', paint: 'danger' },
    { case: '0.5 against 0.25', value: 0.5, reference: 0.25, render: {}, text: '+0.25 (+100%)', paint: 'success' },
    { case: '1000001 against 1000000', value: 1000001, reference: 1000000, render: {}, text: '+1 (0%)', paint: 'success' },
    { case: '999999 against 1000000', value: 999999, reference: 1000000, render: {}, text: '-1 (0%)', paint: 'danger' },
    { case: 'a rise, better lower', value: 110, reference: 100, render: { better: 'lower' }, text: '+10 (+10%)', paint: 'danger' },
    { case: 'a fall, better lower', value: 90, reference: 100, render: { better: 'lower' }, text: '-10 (-10%)', paint: 'success' },
    { case: 'a rise, better neutral', value: 110, reference: 100, render: { better: 'neutral' }, text: '+10 (+10%)', paint: 'neutral' },
  ])('shows the difference of $case as $text, painted $paint', ({ value, reference, render: renderOptions, format, text, paint }) => {
    const { container } = render(<MetricCard payload={{ render: renderOptions, data: { value, reference_value: reference }, value_format: format }} />);
    const [badge] = badgesIn(container);
    expect(badge.textContent).toBe(`Difference from Reference: ${text}`);
    expect(PAINTS.find(([variant]) => badge.className.includes(variant))?.[1] ?? badge.className).toBe(paint);
  });

  it('takes the reference name and the difference wording from the texts', () => {
    const texts: WidgetTexts = { ...DEFAULT_WIDGET_TEXTS, metric: { reference: 'Vergleich', difference: (name) => `Abstand zu ${name}` } };
    const { container } = metric({ reference_value: 120 }, {}, texts);
    expect(screen.getByText('Vergleich 120')).toBeTruthy();
    expect(badgesIn(container)[0].textContent).toBe('Abstand zu Vergleich: -10 (-8.33%)');
  });

  it('draws the link at the card foot, and a refused target as text', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const { unmount } = metric({}, { link: { text: 'All reports', href: '/reports' } });
    expect(screen.getByRole('link', { name: 'All reports' }).getAttribute('href')).toBe('/reports');
    unmount();
    metric({}, { link: { text: 'All reports', href: 'data:text/html,x' } });
    expect(screen.queryByRole('link')).toBeNull();
    expect(screen.getByText('All reports')).toBeTruthy();
    expect(warn).toHaveBeenCalledWith('[widget] a link is shown as text: the data: scheme');
  });

  it.each([
    ['empty', ''],
    ['only spaces', '   '],
    ['only a zero-width space', '​'],
  ])('draws a link text that is %s as text, with no link and no tab stop', (_kind, text) => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const { container } = metric({}, { link: { text, href: '/reports' } });
    expect(screen.queryByRole('link')).toBeNull();
    expect(container.querySelector('a, [href], [tabindex]')).toBeNull();
    expect(warn).not.toHaveBeenCalled();
  });

  it('finds the difference badge alone beside a foot link: the kit link is no badge', () => {
    const { container } = metric({ reference_value: 100 }, { link: { text: 'All reports', href: '/reports' } });
    expect(screen.getByRole('link', { name: 'All reports' })).toBeTruthy();
    expect(badgesIn(container).map((badge) => badge.textContent)).toEqual(['Difference from Reference: +10 (+10%)']);
  });

  it('draws as before without the new fields', () => {
    const { container } = render(<MetricCard payload={METRIC_CARD_SAMPLE} />);
    expect(screen.queryByRole('link')).toBeNull();
    expect(badgesIn(container)).toHaveLength(1);
  });
});

describe('ranked_list_card statuses and links', () => {
  afterEach(() => vi.restoreAllMocks());

  it('shows a status as a badge in its tone, neutral when the tones name none, and none for a null status', () => {
    const { container } = render(
      <RankedListCard
        payload={{
          render: { status_tones: { Late: 'danger', Done: 'success', Open: 'info', Waiting: 'warning' } },
          data: {
            rows: [
              { label: 'api', value: 5, status: 'Late' },
              { label: 'web', value: 4, status: 'Done' },
              { label: 'docs', value: 3, status: 'Open' },
              { label: 'ops', value: 2, status: 'Waiting' },
              { label: 'ui', value: 1, status: 'Paused' },
              { label: 'cli', value: 0, status: null },
            ],
          },
        }}
      />,
    );
    const badges = [...container.querySelectorAll('ol > li')].flatMap((row) => badgesIn(row)).map((badge) => [badge.textContent, /variant([A-Z][a-z]+)/.exec(badge.className)![1]]);
    expect(badges).toEqual([
      ['Late', 'Danger'],
      ['Done', 'Success'],
      ['Open', 'Info'],
      ['Waiting', 'Warning'],
      ['Paused', 'Secondary'],
    ]);
  });

  it('draws a status with no tones at all in the neutral badge', () => {
    const { container } = render(<RankedListCard payload={{ render: {}, data: { rows: [{ label: 'api', value: 5, status: 'Open' }] } }} />);
    expect(badgesIn(container.querySelector('ol > li')!)[0].className).toContain('variantSecondary');
  });

  it('makes a row label a link to its target, and a refused target plain text', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    render(
      <RankedListCard
        payload={{
          render: {},
          data: {
            rows: [
              { label: 'api', value: 5, href: '/services/api' },
              { label: 'web', value: 4, href: 'https://example.org/web' },
              { label: 'ops', value: 3, href: 'javascript:alert(1)' },
              { label: 'ui', value: 2, href: null },
            ],
          },
        }}
      />,
    );
    expect(screen.getByRole('link', { name: 'api' }).getAttribute('href')).toBe('/services/api');
    expect(screen.getByRole('link', { name: 'web (opens in a new tab)' }).getAttribute('target')).toBe('_blank');
    expect(screen.getAllByRole('link')).toHaveLength(2);
    expect(screen.getByText('ops')).toBeTruthy();
    expect(warn).toHaveBeenCalledTimes(1);
  });

  it('draws no link for a row with a target and a null, empty, blank or invisible label: a link needs a name', () => {
    const { container } = render(
      <RankedListCard
        payload={{
          render: {},
          data: {
            rows: [
              { label: null, value: 5, href: '/services/api' },
              { label: '', value: 4, href: 'https://example.org/web' },
              { label: '   ', value: 4, href: '/blank' },
              { label: '​', value: 4, href: '/zero-width' },
              { label: 'docs', value: 3, href: '/docs' },
              // A label of 0 is text: it keeps its link.
              { label: 0, value: 2, href: '/zero' },
            ],
          },
        }}
      />,
    );
    expect(screen.getAllByRole('link').map((link) => link.textContent)).toEqual(['docs', '0']);
    // The only tab stops are the two links: a blank label leaves none.
    expect([...container.querySelectorAll('a, [href], [tabindex]')].map((node) => node.textContent)).toEqual(['docs', '0']);
    expect(screen.queryByText('null')).toBeNull();
  });

  it('draws no badge for an empty, blank or invisible status, even one the tones name', () => {
    const { container } = render(
      <RankedListCard
        payload={{
          render: { status_tones: { '': 'danger', '  ': 'danger', '\u200B': 'danger' } },
          data: {
            rows: [
              { label: 'api', value: 5, status: '' },
              { label: 'ui', value: 4, status: '  ' },
              { label: 'cli', value: 4, status: '\u200B' },
              { label: 'ops', value: 4, status: '\u00AD\uFEFF\u2800' },
              { label: 'web', value: 4, status: 'Open' },
            ],
          },
        }}
      />,
    );
    expect(badgesIn(container).map((badge) => badge.textContent)).toEqual(['Open']);
  });
});

describe('progress_list_card goals', () => {
  const bar = (name: string) => screen.getByRole('progressbar', { name });
  const markOf = (name: string) => bar(name).closest('li')!.querySelector<HTMLElement>('[class*="progressGoal"]');

  it('marks a goal on its bar and names it in the value text and the tooltip', () => {
    render(<ProgressListCard payload={{ render: {}, data: { rows: [{ label: 'Docs', current: 30, target: 50, goal: 40 }] } }} />);
    expect(bar('Docs').getAttribute('aria-valuetext')).toBe('30 of 50, Goal: 40');
    expect(markOf('Docs')!.style.getPropertyValue('--goal-at')).toBe('80%');
    expect(bar('Docs').closest('[title]')!.getAttribute('title')).toBe('Goal: 40');
  });

  it('stands a goal outside the bar at the nearer end and says so, and shows a goal without a target in the text alone', () => {
    render(
      <ProgressListCard
        payload={{
          render: { goal_label: 'Plan' },
          data: {
            rows: [
              { label: 'Over', current: 30, target: 50, goal: 60 },
              { label: 'Under', current: 30, target: 50, goal: -5 },
              { label: 'No target', current: 30, target: null, goal: 40 },
              { label: 'No goal', current: 30, target: 50, goal: null },
            ],
          },
        }}
      />,
    );
    expect(bar('Over').getAttribute('aria-valuetext')).toBe('30 of 50, Plan: 60, outside the bar');
    expect(markOf('Over')!.style.getPropertyValue('--goal-at')).toBe('100%');
    expect(bar('Under').getAttribute('aria-valuetext')).toBe('30 of 50, Plan: -5, outside the bar');
    expect(markOf('Under')!.style.getPropertyValue('--goal-at')).toBe('0%');
    expect(bar('No target').getAttribute('aria-valuetext')).toBe('30 of -, Plan: 40');
    expect(markOf('No target')).toBeNull();
    expect(bar('No goal').getAttribute('aria-valuetext')).toBe('30 of 50');
    expect(markOf('No goal')).toBeNull();
  });

  it('keeps a goal on the exact end of the bar inside it, though its share carries binary error', () => {
    render(<ProgressListCard payload={{ render: {}, data: { rows: [{ label: 'Edge', current: 0.1, target: 0.3, goal: 0.1 + 0.2 }] } }} />);
    expect(bar('Edge').getAttribute('aria-valuetext')).toBe('0.1 of 0.3, Goal: 0.3');
    expect(markOf('Edge')!.style.getPropertyValue('--goal-at')).toBe('100%');
  });

  it('keeps a goal on the zero end of the bar inside it, though its share is a hair below 0', () => {
    render(<ProgressListCard payload={{ render: {}, data: { rows: [{ label: 'Zero', current: 0.1, target: 0.3, goal: 0.3 - 0.1 - 0.2 }] } }} />);
    expect(bar('Zero').getAttribute('aria-valuetext')).not.toContain('outside');
    expect(markOf('Zero')!.style.getPropertyValue('--goal-at')).toBe('0%');
  });

  it('takes the goal name and the outside note from the texts', () => {
    const texts: WidgetTexts = { ...DEFAULT_WIDGET_TEXTS, progress: { of: 'von', goal: 'Ziel', goalOutside: 'ausserhalb' } };
    render(<ProgressListCard payload={{ render: {}, data: { rows: [{ label: 'Docs', current: 30, target: 50, goal: 60 }] } }} texts={texts} />);
    expect(bar('Docs').getAttribute('aria-valuetext')).toBe('30 von 50, Ziel: 60, ausserhalb');
  });
});

describe('radial_progress', () => {
  afterEach(() => vi.restoreAllMocks());
  const ring = () => screen.getByRole('progressbar', { name: 'Progress' });
  const draw = (data: RadialProgressData, options: RadialProgressRender = {}, texts?: WidgetTexts) =>
    render(<RadialProgress payload={{ render: options, data, value_format: { value_type: 'number' } }} texts={texts} />);
  const centreOf = (container: HTMLElement) => [...container.querySelectorAll('svg text')].map((text) => text.textContent);
  const fillOf = (container: HTMLElement) => container.querySelector('[class*="radialFill"]')!.getAttribute('stroke-dasharray');
  /** Where the goal tick stands, as a share of the ring clockwise from the top, read from its outer end. */
  const tickShareOf = (container: HTMLElement) => {
    const svg = container.querySelector('svg')!;
    const centre = Number(svg.getAttribute('viewBox')!.split(' ')[2]) / 2;
    const tick = container.querySelector('[class*="radialGoal"]');
    if (!tick) return null;
    const angle = Math.atan2(Number(tick.getAttribute('y2')) - centre, Number(tick.getAttribute('x2')) - centre);
    return Math.round((((angle / Math.PI + 0.5) / 2 + 1) % 1) * 1000) / 10;
  };
  const failsWith = (data: RadialProgressData, reason: string) => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => {});
    draw(data);
    expect(screen.getByText('This widget cannot be shown')).toBeTruthy();
    expect(screen.queryByRole('progressbar')).toBeNull();
    expect(error).toHaveBeenCalledWith(`[widget] radial_progress: ${reason}`);
  };

  it.each([
    ['percent', ['75%']],
    ['value', ['30']],
    ['both', ['75%', '30']],
  ] as const)('draws the %s display in the hole, filling the ring by current over target', (display, centre) => {
    const { container } = draw({ current: 30, target: 40 }, { display });
    expect(centreOf(container)).toEqual(centre);
    expect(fillOf(container)).toBe('75 100');
    expect(ring().getAttribute('aria-valuenow')).toBe('75');
  });

  it('shows the percent without a display, and the caption under the numbers', () => {
    const { container } = draw({ current: 30, target: 40 }, { center_label: 'shipped' });
    expect(centreOf(container)).toEqual(['75%', 'shipped']);
  });

  // The shares table in finite.test.tsx owns the other rows; these two sit just under and exactly on the target.
  it.each([
    [99.7, 100, 99, '99.7'],
    [40, 40, 100, '100'],
  ])('shows %s of %s as %s percent, rounded down, in the hole and the whole value text (value now %s)', (current, target, shown, now) => {
    const { container } = draw({ current, target });
    expect(centreOf(container)).toEqual([`${shown}%`]);
    expect(ring().getAttribute('aria-valuetext')).toBe(`${shown}%, ${current} of ${target}`);
    expect(ring().getAttribute('aria-valuenow')).toBe(now);
  });

  it.each([
    [99.9999999999999, 100],
    [2999999999999, 3000000000000],
  ])('never rounds a percent below the target up to 100%, nor fills the ring or announces it full (%s of %s)', (current, target) => {
    const { container } = draw({ current, target });
    expect(centreOf(container)).toEqual(['99%']);
    expect(ring().getAttribute('aria-valuetext')!.split(', ')[0]).toBe('99%');
    expect(ring().getAttribute('aria-valuenow')).toBe('99.99');
    expect(fillOf(container)).toBe('99.99 100');
  });

  it('counts a current value whose share falls short of the target by binary error alone as reached, not over', () => {
    const { container } = draw({ current: 0.3, target: 0.1 + 0.2 });
    expect(centreOf(container)).toEqual(['100%']);
    expect(ring().getAttribute('aria-valuetext')).toBe('100%, 0.3 of 0.3');
    expect(ring().getAttribute('aria-valuenow')).toBe('100');
    expect(fillOf(container)).toBe('100 100');
  });

  it('keeps a goal on the exact end of the ring inside it, though its share carries binary error', () => {
    const { container } = draw({ current: 0.1, target: 0.3, goal: 0.1 + 0.2 });
    expect(tickShareOf(container)).toBe(0);
    expect(ring().getAttribute('aria-valuetext')).toBe('33%, 0.1 of 0.3, Goal: 0.3');
  });

  it('keeps a goal on the zero end of the ring inside it, though its share is a hair below 0', () => {
    const { container } = draw({ current: 0.1, target: 0.3, goal: 0.3 - 0.1 - 0.2 });
    expect(tickShareOf(container)).toBe(0);
    expect(ring().getAttribute('aria-valuetext')).not.toContain('outside');
  });

  it('reads a current value or goal of negative zero as 0', () => {
    const { container } = draw({ current: -0, target: 40, goal: -0 }, { display: 'both' });
    expect(centreOf(container)).toEqual(['0%', '0']);
    expect(ring().getAttribute('aria-valuetext')).toBe('0%, 0 of 40, Goal: 0');
  });

  it('leaves a caption that does not fit the hole out, keeping the numbers', () => {
    const { container } = draw({ current: 30, target: 40 }, { display: 'both', center_label: 'of the quarterly roadmap items shipped so far' });
    expect(centreOf(container)).toEqual(['75%', '30']);
  });

  it.each([0, -5])('fails a cell whose target is %s, naming the reason', (target) => failsWith({ current: 3, target }, 'data.target is not above 0'));

  it('fails a cell whose current value is below 0, naming the reason', () => failsWith({ current: -1, target: 10 }, 'data.current is below 0'));

  it.each([
    ['current', { current: null, target: 10 }],
    ['target', { current: 3, target: null }],
  ] as const)('shows the empty state for a null %s', (_field, data) => {
    draw(data);
    expect(screen.getByText('No data to show')).toBeTruthy();
    expect(screen.queryByRole('progressbar')).toBeNull();
  });

  it('draws a full ring for a current value above the target and says it is over the target', () => {
    const { container } = draw({ current: 60, target: 40 });
    expect(fillOf(container)).toBe('100 100');
    expect(ring().getAttribute('aria-valuenow')).toBe('100');
    expect(ring().getAttribute('aria-valuetext')).toBe('150%, 60 of 40, over the target');
  });

  it('names the ring and reads the percent, the value, the target and the goal in its value text', () => {
    const { container } = draw({ current: 34, target: 48, goal: 40 }, { goal_label: 'Plan' });
    expect(ring().getAttribute('aria-valuemin')).toBe('0');
    expect(ring().getAttribute('aria-valuemax')).toBe('100');
    expect(ring().getAttribute('aria-valuetext')).toBe('70%, 34 of 48, Plan: 40');
    expect(ring().getAttribute('title')).toBe('Plan: 40');
    expect(container.querySelector('svg')!.getAttribute('aria-hidden')).toBe('true');
  });

  it('draws the goal tick at goal over target', () => {
    const { container } = draw({ current: 30, target: 50, goal: 40 });
    expect(tickShareOf(container)).toBe(80);
    expect(ring().getAttribute('aria-valuetext')).toBe('60%, 30 of 50, Goal: 40');
  });

  it.each([60, -5])('stands a goal of %s outside the ring at its nearer end, the top, and says so', (goal) => {
    const { container } = draw({ current: 30, target: 50, goal });
    expect(tickShareOf(container)).toBe(0);
    expect(ring().getAttribute('aria-valuetext')).toBe(`60%, 30 of 50, Goal: ${goal}, outside the ring`);
  });

  it.each([
    ['null', { current: 30, target: 50, goal: null }],
    ['absent', { current: 30, target: 50 }],
  ] as const)('draws no tick for a %s goal', (_goal, data) => {
    expect(tickShareOf(draw(data).container)).toBeNull();
    expect(ring().getAttribute('aria-valuetext')).toBe('60%, 30 of 50');
  });

  describe('measuring its centre text', () => {
    // jsdom lays nothing out: each drawn line measures its width in em, as given here, times its font size.
    const measure = (emOf: Record<string, number>) =>
      Object.defineProperty(SVGElement.prototype, 'getComputedTextLength', {
        configurable: true,
        value(this: SVGElement) {
          return (emOf[this.textContent ?? ''] ?? 0) * Number(this.getAttribute('font-size'));
        },
      });
    // A 200 by 200 px body: a hole of 78.7 px.
    const original = globalThis.ResizeObserver;
    beforeEach(() => {
      globalThis.ResizeObserver = class {
        constructor(private readonly callback: ResizeObserverCallback) {}
        observe(target: Element) {
          this.callback([{ target, contentRect: { width: 200, height: 200 } } as unknown as ResizeObserverEntry], this as unknown as ResizeObserver);
        }
        unobserve() {}
        disconnect() {}
      } as unknown as typeof ResizeObserver;
    });
    afterEach(() => {
      globalThis.ResizeObserver = original;
      delete (SVGElement.prototype as { getComputedTextLength?: unknown }).getComputedTextLength;
    });
    const CJK = '本季度计划完成度说明文字进展情况';

    it.each([
      ['a wide caption', 'percent', { '75%': 1.9, [CJK]: 16 }, ['75%']],
      ['a wide caption under both numbers', 'both', { '75%': 1.9, '30': 1.2, [CJK]: 16 }, ['75%', '30']],
      ['a wide second line, the caption first', 'both', { '75%': 1.9, '30': 20, [CJK]: 4 }, ['75%']],
    ] as const)('leaves out what does not fit the hole by its measured width: %s', (_case, display, emOf, centre) => {
      measure(emOf);
      const { container } = draw({ current: 30, target: 40 }, { display, center_label: CJK });
      expect(centreOf(container)).toEqual(centre);
      // Every drawn line's corners stay inside the hole.
      const track = container.querySelector('[class*="radialTrack"]')!;
      const centreAt = Number(track.getAttribute('cx'));
      const hole = Number(track.getAttribute('r')) - Number(track.getAttribute('stroke-width')) / 2;
      for (const text of container.querySelectorAll('svg text')) {
        const size = Number(text.getAttribute('font-size'));
        const reach = Math.hypot(((emOf as Record<string, number>)[text.textContent!] * size) / 2, Math.abs(Number(text.getAttribute('y')) - centreAt) + (size * 1.2) / 2);
        expect(reach).toBeLessThanOrEqual(hole);
      }
    });
  });

  it('takes its name and every wording from the texts', () => {
    const texts: WidgetTexts = { ...DEFAULT_WIDGET_TEXTS, radial: { name: 'Fortschritt', of: 'von', goal: 'Ziel', overTarget: 'über dem Ziel', goalOutside: 'ausserhalb' } };
    draw({ current: 60, target: 40, goal: 50 }, {}, texts);
    expect(screen.getByRole('progressbar', { name: 'Fortschritt' }).getAttribute('aria-valuetext')).toBe('150%, 60 von 40, über dem Ziel, Ziel: 50, ausserhalb');
  });

  describe('in a low cell', () => {
    const original = globalThis.ResizeObserver;
    afterEach(() => {
      globalThis.ResizeObserver = original;
    });

    it('leaves the caption out and keeps the numbers inside the ring', () => {
      // A small low cell: the widget body reports 264 by 110 px.
      globalThis.ResizeObserver = class {
        constructor(private readonly callback: ResizeObserverCallback) {}
        observe(target: Element) {
          this.callback([{ target, contentRect: { width: 264, height: 110 } } as unknown as ResizeObserverEntry], this as unknown as ResizeObserver);
        }
        unobserve() {}
        disconnect() {}
      } as unknown as typeof ResizeObserver;
      const { container } = draw({ current: 30, target: 40 }, { display: 'both', center_label: 'shipped' });
      expect(centreOf(container)).toEqual(['75%', '30']);
      expect(container.querySelector('svg')!.getAttribute('viewBox')).toBe('0 0 110 110');
    });

    it('draws nothing in a body too small for the ring, keeping its value text', () => {
      globalThis.ResizeObserver = class {
        constructor(private readonly callback: ResizeObserverCallback) {}
        observe(target: Element) {
          this.callback([{ target, contentRect: { width: 10, height: 10 } } as unknown as ResizeObserverEntry], this as unknown as ResizeObserver);
        }
        unobserve() {}
        disconnect() {}
      } as unknown as typeof ResizeObserver;
      const { container } = draw({ current: 30, target: 40, goal: 20 }, { display: 'both' });
      expect(container.querySelector('svg')!.children).toHaveLength(0);
      expect(ring().getAttribute('aria-valuetext')).toBe('75%, 30 of 40, Goal: 20');
    });
  });
});
