import { render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { DEFAULT_WIDGET_TEXTS, type WidgetTexts } from '../states';
import { MetricCard } from './MetricCard';
import { ProgressListCard } from './ProgressListCard';
import { RankedListCard } from './RankedListCard';
import { SummaryCard } from './SummaryCard';
import { METRIC_CARD_SAMPLE, PROGRESS_LIST_CARD_SAMPLE, RANKED_LIST_CARD_SAMPLE, SUMMARY_CARD_SAMPLE } from '../samples';

const PAINTS = [
  ['variantSuccess', 'success'],
  ['variantDanger', 'danger'],
  ['variantSecondary', 'neutral'],
] as const;

describe('metric_card', () => {
  afterEach(() => vi.restoreAllMocks());

  it('shows the headline, the caption and the trend with its icon named', () => {
    render(<MetricCard payload={METRIC_CARD_SAMPLE} />);
    expect(screen.getByText('44,000')).toBeTruthy();
    expect(screen.getByText('vs previous 28 days')).toBeTruthy();
    // The icon carries a localized accessible name, and the change stands beside it: the direction never rides on colour alone.
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
    const paint = (value: number, better?: 'higher' | 'lower') => {
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

  it('formats the values by value_format', () => {
    render(<ProgressListCard payload={{ render: {}, value_format: { value_type: 'percent' }, data: { rows: [{ label: 'Rollout', current: 0.5, target: 0.8 }] } }} />);
    expect(screen.getByText('50% of 80%')).toBeTruthy();
    expect(screen.getByRole('progressbar', { name: 'Rollout' }).getAttribute('aria-valuenow')).toBe('62.5');
  });

  it('keeps a row with a null label, and takes the wordings from the texts', () => {
    const german: WidgetTexts = { ...DEFAULT_WIDGET_TEXTS, progress: { of: 'von' } };
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
