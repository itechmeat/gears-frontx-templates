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
    expect(container.querySelector('.recharts-line-curve[stroke-dasharray="4 4"]')).not.toBeNull();
    const table = alternative('Orders per day');
    expect(within(table).getAllByRole('columnheader', { hidden: true }).map((cell) => cell.textContent)).toEqual(['x', 'Orders', 'Target']);
    expect(within(table).getAllByRole('row', { hidden: true })[1].textContent).toBe('Mon1210');
    expect(within(table).getAllByRole('row', { hidden: true })[3].textContent).toBe('Wed10');
  });

  it('formats each series by its axis and dates on a time axis, leaving out points with no x', () => {
    const data: CartesianData = {
      series: [
        { name: 'Share', points: [{ x: '2026-10-01T12:00:00Z', y: 0.25 }, { x: null, y: 0.5 }] },
        { name: 'Load', points: [{ x: '2026-10-01T12:00:00Z', y: 40 }] },
      ],
    };
    render(
      <CartesianChart
        payload={{ render: { x_axis: { type: 'time' }, series: [{ name: 'Share', type: 'line' }, { name: 'Load', type: 'line', y_axis: 'secondary' }], y_axis_secondary: { unit: ' rps' } }, value_format: { value_type: 'percent' }, data }}
        label="Share and load"
      />,
    );
    const rows = within(alternative('Share and load')).getAllByRole('row', { hidden: true });
    expect(rows.map((row) => row.textContent?.replace(/\s/g, ' '))).toEqual(['xShareLoad', 'Oct 1, 2026, 12:00 PM25%40 rps']);
  });

  it('names a line at its own last point when it ends before the other series', () => {
    const data: CartesianData = {
      series: [
        { name: 'Orders', points: [{ x: 'Mon', y: 12 }, { x: 'Tue', y: 7 }, { x: 'Wed', y: 9 }] },
        { name: 'Target', points: [{ x: 'Mon', y: 10 }, { x: 'Tue', y: 10 }] },
      ],
    };
    const { container } = render(<CartesianChart payload={{ render: RENDER, data }} />);
    const goal = [...container.querySelectorAll('text')].find((text) => text.textContent === 'Goal');
    expect(goal).toBeDefined();
    expect(Number(goal?.getAttribute('y'))).toBeGreaterThan(0);
  });

  it('lifts a line name above the value label it would cover at the same point', () => {
    const data: CartesianData = { series: [{ name: 'Orders', points: [{ x: 'Mon', y: 10 }] }, { name: 'Target', points: [{ x: 'Mon', y: 10 }] }] };
    const { container } = render(<CartesianChart payload={{ render: RENDER, data }} />);
    const goal = [...container.querySelectorAll('text')].find((text) => text.textContent === 'Goal');
    const value = [...container.querySelectorAll('.recharts-label-list text')].find((text) => text.textContent === '10');
    expect(goal).toBeDefined();
    expect(value).toBeDefined();
    // The value label's text runs about 12px up from its baseline: the name's baseline sits above that.
    expect(Number(goal?.getAttribute('y'))).toBeLessThan(Number(value?.getAttribute('y')) - 12);
  });

  it('lifts a line name clear of the value label Recharts writes below a negative bar', () => {
    // The line ends a little below the bar's end, where the bar's value label hangs.
    const data: CartesianData = {
      series: [
        { name: 'Orders', points: [{ x: 'Mon', y: 5 }, { x: 'Tue', y: -10 }] },
        { name: 'Target', points: [{ x: 'Mon', y: 0 }, { x: 'Tue', y: -12 }] },
      ],
    };
    const { container } = render(<CartesianChart payload={{ render: RENDER, data }} />);
    const goal = Number([...container.querySelectorAll('text')].find((text) => text.textContent === 'Goal')?.getAttribute('y'));
    const value = Number([...container.querySelectorAll('.recharts-label-list text')].find((text) => text.textContent === '-10')?.getAttribute('y'));
    expect(Number.isFinite(goal) && Number.isFinite(value)).toBe(true);
    // The value label runs about 12px down from its top; the name runs about 12px up from its baseline.
    const overlaps = goal > value && goal - 12 < value + 12;
    expect(overlaps).toBe(false);
  });

  it('writes tick labels in the chart chrome colour, not the Recharts grey', () => {
    const { container } = render(<CartesianChart payload={{ render: { ...RENDER, x_axis: { tick_angle: -90 }, series: [...RENDER.series!, { name: 'Target', type: 'line', y_axis: 'secondary' }] }, data: DATA }} />);
    const ticks = [...container.querySelectorAll('.recharts-cartesian-axis-tick-value')];
    expect(ticks.length).toBeGreaterThan(0);
    expect(ticks.map((tick) => tick.getAttribute('fill'))).toEqual(ticks.map(() => 'var(--muted-foreground)'));
  });

  it('draws lines and areas on a time axis through their own points when the series are sampled at different times', () => {
    const data: CartesianData = {
      series: [
        { name: 'Requests', points: [{ x: '2026-11-09T10:00:00Z', y: 5 }, { x: '2026-11-09T10:05:00Z', y: 7 }, { x: '2026-11-09T10:10:00Z', y: 6 }] },
        { name: 'Errors', points: [{ x: '2026-11-09T10:02:00Z', y: 1 }, { x: '2026-11-09T10:07:00Z', y: 2 }] },
      ],
    };
    for (const type of ['line', 'area'] as const) {
      const { container, unmount } = render(<CartesianChart payload={{ render: { x_axis: { type: 'time' }, series: [{ name: 'Requests', type }, { name: 'Errors', type }] }, data }} label={`Sampled ${type}`} />);
      const curves = [...container.querySelectorAll(type === 'line' ? '.recharts-line-curve' : '.recharts-area-curve')];
      // One path segment per step between the five times either series has, over the times each series spans:
      // Requests from 10:00 to 10:10 (4 steps), Errors from 10:02 to 10:07 (2 steps). A line broken at every other time draws none.
      expect(curves.map((curve) => (curve.getAttribute('d') ?? '').split(/[LC]/).length - 1)).toEqual([4, 2]);
      // The values a line is drawn through between its own points are never shown: at 10:05 only Requests has a value.
      const rows = within(alternative(`Sampled ${type}`)).getAllByRole('row', { hidden: true });
      expect(rows.map((row) => row.textContent?.replace(/\s/g, ' '))).toEqual(['xRequestsErrors', 'Nov 9, 2026, 10:00 AM5', 'Nov 9, 2026, 10:02 AM1', 'Nov 9, 2026, 10:05 AM7', 'Nov 9, 2026, 10:07 AM2', 'Nov 9, 2026, 10:10 AM6']);
      unmount();
    }
  });

  it('stacks line series that share a stack group', () => {
    const data: CartesianData = { series: [{ name: 'A', points: [{ x: 'Mon', y: 1 }, { x: 'Tue', y: 1 }] }, { name: 'B', points: [{ x: 'Mon', y: 1 }, { x: 'Tue', y: 1 }] }] };
    const lines = (stack_group?: string) => {
      const { container, unmount } = render(<CartesianChart payload={{ render: { series: [{ name: 'A', type: 'line', stack_group }, { name: 'B', type: 'line', stack_group }] }, data }} />);
      const paths = [...container.querySelectorAll('.recharts-line-curve')].map((curve) => curve.getAttribute('d'));
      unmount();
      return paths;
    };
    const [apart, overlapping] = lines();
    expect(apart).toBe(overlapping);
    const [below, above] = lines('total');
    expect(below).not.toBe(above);
  });

  it('writes the axis labels on their axes', () => {
    const data: CartesianData = { series: [{ name: 'Requests', points: [{ x: 1, y: 5 }, { x: 2, y: 6 }] }, { name: 'CPU', points: [{ x: 1, y: 40 }, { x: 2, y: 50 }] }] };
    const { container } = render(
      <CartesianChart
        payload={{ render: { x_axis: { type: 'value', label: 'Elapsed seconds' }, y_axis: { label: 'Requests' }, y_axis_secondary: { label: 'CPU' }, series: [{ name: 'Requests', type: 'line' }, { name: 'CPU', type: 'line', y_axis: 'secondary' }] }, data }}
      />,
    );
    const texts = [...container.querySelectorAll('svg text')].map((text) => text.textContent);
    expect(texts).toEqual(expect.arrayContaining(['Elapsed seconds', 'Requests', 'CPU']));
  });

  it('tells apart times within one day in the ticks and the text alternative', () => {
    const data: CartesianData = { series: [{ name: 'Requests', points: [{ x: '2026-11-09T10:00:00Z', y: 5 }, { x: '2026-11-09T11:00:00Z', y: 7 }, { x: '2026-11-09T12:00:00Z', y: 6 }] }] };
    const { container } = render(<CartesianChart payload={{ render: { x_axis: { type: 'time' }, series: [{ name: 'Requests', type: 'line' }] }, data }} label="Hourly" />);
    const rows = within(alternative('Hourly')).getAllByRole('row', { hidden: true }).slice(1).map((row) => row.textContent);
    expect(new Set(rows).size).toBe(3);
    const ticks = [...container.querySelectorAll('.recharts-xAxis-tick-labels .recharts-cartesian-axis-tick-value')].map((tick) => tick.textContent);
    expect(ticks.length).toBeGreaterThan(1);
    expect(new Set(ticks).size).toBe(ticks.length);
  });

  it('shows ISO times of a scatter chart as localized dates in its text alternative', () => {
    render(<CartesianChart payload={{ render: { x_axis: { type: 'time' }, series: [{ name: 'A', type: 'scatter' }] }, data: { series: [{ name: 'A', points: [{ x: '2026-11-09T12:00:00Z', y: 1 }] }] } }} label="Times" />);
    const rows = within(alternative('Times')).getAllByRole('row', { hidden: true });
    expect(rows[1].textContent?.replace(/\s/g, ' ')).toBe('ANov 9, 2026, 12:00 PM1');
  });

  it('keeps every point of a series that repeats an x', () => {
    render(<CartesianChart payload={{ render: {}, data: { series: [{ name: 'A', points: [{ x: 'Mon', y: 1 }, { x: 'Mon', y: 2 }] }] } }} label="Repeats" />);
    const rows = within(alternative('Repeats')).getAllByRole('row', { hidden: true });
    expect(rows.map((row) => row.textContent)).toEqual(['xA', 'Mon1', 'Mon2']);
  });

  it('formats a scatter series on the secondary axis by that axis', () => {
    const data: CartesianData = { series: [{ name: 'Share', points: [{ x: 1, y: 0.5 }] }, { name: 'Load', points: [{ x: 2, y: 40 }] }] };
    render(
      <CartesianChart
        payload={{ render: { x_axis: { type: 'value' }, series: [{ name: 'Share', type: 'scatter' }, { name: 'Load', type: 'scatter', y_axis: 'secondary' }], y_axis_secondary: { unit: ' rps' } }, value_format: { value_type: 'percent' }, data }}
        label="Spread"
      />,
    );
    const rows = within(alternative('Spread')).getAllByRole('row', { hidden: true });
    expect(rows.slice(1).map((row) => row.textContent)).toEqual(['Share150%', 'Load240 rps']);
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

  it('opens the data view with the clicked point\'s row picked, counting the points of earlier series', async () => {
    const user = userEvent.setup();
    const scatter: CartesianData = { series: [{ name: 'A', points: [{ x: 1, y: 2 }, { x: 2, y: 3 }] }, { name: 'B', points: [{ x: 5, y: 8 }] }] };
    const { container } = render(<CartesianChart payload={{ render: { x_axis: { type: 'value' }, series: [{ name: 'A', type: 'scatter' }, { name: 'B', type: 'scatter' }], drill_down: true }, data: scatter }} label="Spread" />);
    const marks = container.querySelectorAll('.recharts-scatter-symbol');
    expect(marks).toHaveLength(3);
    await user.click(marks[2]);
    const region = await screen.findByRole('region', { name: 'Data of Spread' });
    expect(await within(region).findByText('B', { selector: '[aria-current="true"]' })).toBeTruthy();
  });

  it('opens the data view with the clicked bar\'s row picked', async () => {
    const user = userEvent.setup();
    const { container } = render(<CartesianChart payload={{ render: { ...RENDER, drill_down: true }, data: DATA }} label="Orders per day" />);
    const bars = container.querySelectorAll('.recharts-bar-rectangle');
    await user.click(bars[1].querySelector('path') ?? bars[1]);
    const region = await screen.findByRole('region', { name: 'Data of Orders per day' });
    expect(await within(region).findByText('Tue', { selector: '[aria-current="true"]' })).toBeTruthy();
  });

  it('drops a pick when new values arrive, so no other point is opened in its place', async () => {
    const user = userEvent.setup();
    const scatter = (y: number): CartesianData => ({ series: [{ name: 'A', points: [{ x: 1, y }, { x: 2, y: 3 }] }] });
    const props = (y: number) => ({ render: { x_axis: { type: 'value' as const }, series: [{ name: 'A', type: 'scatter' as const }], drill_down: true }, data: scatter(y) });
    const { container, rerender } = render(<CartesianChart payload={props(2)} label="Live" />);
    await user.click(container.querySelectorAll('.recharts-scatter-symbol')[1]);
    const region = await screen.findByRole('region', { name: 'Data of Live' });
    // The picked row (x 2) is marked in its first cell, which holds the series name.
    expect(await within(region).findByText('A', { selector: '[aria-current="true"]' })).toBeTruthy();
    rerender(<CartesianChart payload={props(5)} label="Live" />);
    await within(await screen.findByRole('region', { name: 'Data of Live' })).findByText('5');
    expect(document.querySelector('[aria-current="true"]')).toBeNull();
  });

  it('draws no data view button and no clickable chart with drill-down off', () => {
    const { container } = render(<CartesianChart payload={{ render: RENDER, data: DATA }} />);
    expect(screen.queryByRole('button', { name: 'Show data' })).toBeNull();
    expect(container.querySelector('.clickable')).toBeNull();
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

  it('opens the data view with the clicked segment\'s row picked', async () => {
    const user = userEvent.setup();
    const { container } = render(<PieChart payload={{ render: { drill_down: true }, data: { slices: [{ label: 'North', value: 3 }, { label: 'South', value: 1 }] } }} label="Share" />);
    const sectors = container.querySelectorAll('.recharts-pie-sector');
    expect(sectors).toHaveLength(2);
    await user.click(sectors[1].querySelector('path') ?? sectors[1]);
    const region = await screen.findByRole('region', { name: 'Data of Share' });
    expect(await within(region).findByText('South', { selector: '[aria-current="true"]' })).toBeTruthy();
  });

  it('shows the empty state for no slices', () => {
    render(<PieChart payload={{ render: {}, data: { slices: [] } }} />);
    expect(screen.getByText('No data to show')).toBeTruthy();
  });
});
