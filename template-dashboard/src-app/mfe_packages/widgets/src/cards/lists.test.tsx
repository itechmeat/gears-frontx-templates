import { render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { DEFAULT_WIDGET_TEXTS, type WidgetTexts } from '../states';
import { ProgressListCard } from './ProgressListCard';
import { RankedListCard } from './RankedListCard';
import { PROGRESS_LIST_CARD_SAMPLE, RANKED_LIST_CARD_SAMPLE } from './samples';

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
    // A null value shows as an empty one: a missing side drops out of the text.
    expect([...container.querySelectorAll('ul > li')].map((row) => row.children[0].textContent)).toEqual([
      'At target40 of 40',
      'Over target41 of 40',
      'No current40',
      'No target10',
      'Zero target10 of 0',
    ]);
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
