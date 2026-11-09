import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';

import type { CartesianData, CartesianRender } from '../types';
import { CartesianChart, checkCartesian } from './CartesianChart';
import { PieChart } from './PieChart';

const DATA: CartesianData = {
  series: [
    { name: 'Orders', points: [{ x: 'Mon', y: 12 }, { x: 'Tue', y: 7 }, { x: 'Wed', y: null }] },
    { name: 'Target', points: [{ x: 'Mon', y: 10 }, { x: 'Tue', y: 10 }, { x: 'Wed', y: 10 }] },
  ],
};

const RENDER: CartesianRender = {
  series: [
    { name: 'Orders', type: 'bar' },
    { name: 'Target', type: 'line', line_style: 'dashed', label: 'Goal' },
  ],
  value_labels: 'always',
};

const alternative = (name: string) => within(screen.getByRole('figure', { name })).getByRole('table', { hidden: true });

describe('cartesian_chart', () => {
  afterEach(() => vi.restoreAllMocks());

  it('checks x values against the x axis type', () => {
    expect(checkCartesian({ x_axis: { type: 'value' } }, { series: [{ name: 'a', points: [{ x: 'Mon', y: 1 }] }] })).toContain('point 0 needs a number x');
    expect(checkCartesian({ x_axis: { type: 'time' } }, { series: [{ name: 'a', points: [{ x: 'yesterday', y: 1 }] }] })).toContain('ISO 8601');
    expect(checkCartesian({ x_axis: { type: 'time' } }, { series: [{ name: 'a', points: [{ x: '2026-11-09T10:00:00Z', y: 1 }, { x: 1_700_000_000_000, y: 2 }, { x: null, y: 3 }] }] })).toBeNull();
    expect(checkCartesian({}, DATA)).toBeNull();
  });

  it('draws the series in the kit chart and offers a named text alternative of the values', () => {
    const { container } = render(<CartesianChart payload={{ render: RENDER, data: DATA }} label="Orders per day" />);
    expect(container.querySelector('[data-chart]')).not.toBeNull();
    expect(container.querySelectorAll('.recharts-bar-rectangle').length).toBeGreaterThan(0);
    expect(container.querySelector('.recharts-label-list')).not.toBeNull();
    expect(container.querySelector('.recharts-line-curve')?.getAttribute('stroke-dasharray')).toBe('4 4');
    const table = alternative('Orders per day');
    expect(within(table).getAllByRole('columnheader', { hidden: true }).map((cell) => cell.textContent)).toEqual(['x', 'Orders', 'Target']);
    expect(within(table).getAllByRole('row', { hidden: true })[1].textContent).toBe('Mon1210');
    expect(within(table).getAllByRole('row', { hidden: true })[3].textContent).toBe('Wed10');
  });

  it('shows the empty state and its own cannot-be-shown state', () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const { unmount } = render(<CartesianChart payload={{ render: {}, data: { series: [] } }} />);
    expect(screen.getByText('No data to show')).toBeTruthy();
    unmount();
    render(<CartesianChart payload={{ render: { x_axis: { type: 'value' } }, data: DATA }} />);
    expect(screen.getByText('This widget cannot be shown')).toBeTruthy();
  });

  it('switches to the data view and back with drill-down on', async () => {
    const user = userEvent.setup();
    render(<CartesianChart payload={{ render: { ...RENDER, drill_down: true }, data: DATA }} label="Orders per day" />);
    await user.click(screen.getByRole('button', { name: 'Show data' }));
    expect(await screen.findByRole('region', { name: 'Data of Orders per day' })).toBeTruthy();
    await user.click(screen.getByRole('button', { name: 'Show chart' }));
    expect(screen.queryByRole('region', { name: 'Data of Orders per day' })).toBeNull();
  });

  it('draws no data view button with drill-down off', () => {
    render(<CartesianChart payload={{ render: RENDER, data: DATA }} />);
    expect(screen.queryByRole('button', { name: 'Show data' })).toBeNull();
  });
});

describe('pie_chart', () => {
  it('lists every slice with its value in the text alternative, formatted by value_format', () => {
    render(
      <PieChart
        payload={{ render: { radius: ['50%', '70%'] }, value_format: { value_type: 'percent' }, data: { slices: [{ label: 'North', value: 0.25 }, { label: 'South', value: 0 }, { label: null, value: null }] } }}
        label="Share by region"
      />,
    );
    const rows = within(alternative('Share by region')).getAllByRole('row', { hidden: true });
    expect(rows.map((row) => row.textContent)).toEqual(['labelvalue', 'North25%', 'South0%', '']);
  });

  it('shows the empty state for no slices', () => {
    render(<PieChart payload={{ render: {}, data: { slices: [] } }} />);
    expect(screen.getByText('No data to show')).toBeTruthy();
  });
});
