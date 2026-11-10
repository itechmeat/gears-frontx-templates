import { render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { DEFAULT_WIDGET_TEXTS, type WidgetTexts } from '../states';
import { MetricCard } from './MetricCard';
import { SummaryCard } from './SummaryCard';
import { METRIC_CARD_SAMPLE, SUMMARY_CARD_SAMPLE } from './samples';

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
