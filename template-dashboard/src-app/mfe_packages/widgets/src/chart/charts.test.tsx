import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { CartesianData, CartesianRender, FunnelData, FunnelRender } from '../types';
import { DEFAULT_WIDGET_TEXTS, type WidgetTexts } from '../states';
import { CartesianChart, checkCartesian } from './CartesianChart';
import { PieChart, checkPie } from './PieChart';
import { BAR_CEILING, BAR_FLOOR, FunnelChart, checkFunnel, conversionsOf, funnelLayout } from './FunnelChart';

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
    // A number no date can hold: drawing it would throw a RangeError.
    expect(checkCartesian({ x_axis: { type: 'time' } }, { series: [{ name: 'a', points: [{ x: 1e20, y: 1 }] }] })).toContain('point 0 needs an ISO 8601');
    expect(checkCartesian({ x_axis: { type: 'time' } }, { series: [{ name: 'a', points: [{ x: '2026-11-09T10:00:00Z', y: 1 }, { x: 1_700_000_000_000, y: 2 }, { x: null, y: 3 }] }] })).toBeNull();
    expect(checkCartesian({}, DATA)).toBeNull();
  });

  it('fails a y not above zero on a log axis, on that axis only', () => {
    const series: CartesianData['series'] = [{ name: 'a', points: [{ x: 'Mon', y: 2 }, { x: 'Tue', y: 0 }] }, { name: 'b', points: [{ x: 'Mon', y: -1 }, { x: 'Tue', y: null }] }];
    expect(checkCartesian({ y_axis: { type: 'log' } }, { series })).toContain('series 0 point 1 needs a y above zero');
    const onSecondary = { y_axis_secondary: { type: 'log' as const }, series: [{ name: 'b', type: 'line' as const, y_axis: 'secondary' as const }] };
    expect(checkCartesian(onSecondary, { series })).toContain('series 1 point 0 needs a y above zero');
    expect(checkCartesian(onSecondary, { series: [series[0]] })).toBeNull();
    expect(checkCartesian({ y_axis: { type: 'log' } }, { series: [{ name: 'a', points: [{ x: 'Mon', y: 2 }, { x: 'Tue', y: null }] }] })).toBeNull();
    // On a value axis a point with a null x is not drawn, so its y does not count; on a category axis it is drawn.
    expect(checkCartesian({ x_axis: { type: 'value' }, y_axis: { type: 'log' } }, { series: [{ name: 'a', points: [{ x: 1, y: 2 }, { x: null, y: 0 }] }] })).toBeNull();
    expect(checkCartesian({ y_axis: { type: 'log' } }, { series: [{ name: 'a', points: [{ x: null, y: 0 }] }] })).toContain('needs a y above zero');
  });

  it('rotates the x tick labels of a chart of scatter series only, and makes room for them', () => {
    const data: CartesianData = { series: [{ name: 'a', points: [{ x: 1, y: 2 }, { x: 5, y: 3 }] }] };
    const { container } = render(<CartesianChart payload={{ render: { x_axis: { type: 'value', tick_angle: -90 }, series: [{ name: 'a', type: 'scatter' }] }, data }} />);
    const ticks = [...container.querySelectorAll('.recharts-xAxis-tick-labels .recharts-cartesian-axis-tick-value')];
    expect(ticks.length).toBeGreaterThan(0);
    for (const tick of ticks) expect(tick.getAttribute('transform')).toContain('rotate(-90');
    // The axis grows for the rotated labels, so the plot above it ends higher than with level labels.
    const lowestYTick = (tick_angle: 0 | -90) => {
      const { container: chart, unmount } = render(<CartesianChart payload={{ render: { x_axis: { type: 'value', tick_angle }, series: [{ name: 'a', type: 'scatter' }] }, data: { series: [{ name: 'a', points: [{ x: 1_000_000, y: 2 }, { x: 5_000_000, y: 3 }] }] } }} />);
      const y = Math.max(...[...chart.querySelectorAll('.recharts-yAxis-tick-labels .recharts-cartesian-axis-tick-value')].map((tick) => Number(tick.getAttribute('y'))));
      unmount();
      return y;
    };
    expect(lowestYTick(-90)).toBeLessThan(lowestYTick(0));
  });

  it('leaves a null-x point out of a scatter chart on a log axis, and picks the right row past it', async () => {
    const user = userEvent.setup();
    const data: CartesianData = { series: [{ name: 'a', points: [{ x: null, y: 0 }, { x: 1, y: 2 }, { x: 5, y: 3 }] }] };
    const { container } = render(<CartesianChart payload={{ render: { x_axis: { type: 'value' }, y_axis: { type: 'log' }, series: [{ name: 'a', type: 'scatter' }], drill_down: true }, data }} label="Spread" />);
    const marks = container.querySelectorAll('.recharts-scatter-symbol');
    expect(marks.length).toBe(2);
    expect(container.querySelectorAll('.recharts-yAxis-tick-labels .recharts-cartesian-axis-tick-value').length).toBeGreaterThan(0);
    await user.click(marks[1]);
    const region = await screen.findByRole('region', { name: 'Data of Spread' });
    // The values table keeps the null-x point as its first row; the picked mark is the third row, x 5.
    const current = await within(region).findByText('a', { selector: '[aria-current="true"]' });
    expect(within(current.closest('tr')!).getAllByRole('cell')[1].textContent).toBe('5');
  });

  it('keeps room left of a scatter chart for its first rotated x label', () => {
    // A localized date and time is longer than the y axis is wide, so at 45 degrees its label runs past it.
    const data: CartesianData = { series: [{ name: 'a', points: [{ x: '2026-11-09T10:00:00Z', y: 2 }, { x: '2026-11-12T10:00:00Z', y: 3 }] }] };
    const firstTickX = (tick_angle: 0 | -45) => {
      const { container, unmount } = render(<CartesianChart payload={{ render: { x_axis: { type: 'time', tick_angle }, series: [{ name: 'a', type: 'scatter' }] }, data }} />);
      const x = Number(container.querySelector('.recharts-xAxis-tick-labels .recharts-cartesian-axis-tick-value')?.getAttribute('x'));
      unmount();
      return x;
    };
    expect(firstTickX(-45)).toBeGreaterThan(firstTickX(0));
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

  it('formats each series by its axis and dates with times on a time axis, leaving out points with no x', () => {
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

  it('shows in the tooltip only the series delivered at the hovered time, with its own value', async () => {
    const data: CartesianData = {
      series: [
        { name: 'Requests', points: [{ x: '2026-11-09T10:00:00Z', y: 5 }, { x: '2026-11-09T10:05:00Z', y: 7 }, { x: '2026-11-09T10:10:00Z', y: 6 }] },
        { name: 'Errors', points: [{ x: '2026-11-09T10:02:00Z', y: 1 }, { x: '2026-11-09T10:07:00Z', y: 2 }] },
      ],
    };
    // Stacked, Errors is drawn at Requests plus its own value; the tooltip still shows its own value.
    const { container } = render(<CartesianChart payload={{ render: { x_axis: { type: 'time' }, series: [{ name: 'Requests', type: 'line', stack_group: 'g' }, { name: 'Errors', type: 'line', stack_group: 'g' }] }, data }} />);
    // Recharts handles the pointer on a later frame, so each hover waits for the expected tooltip.
    const hover = (x: number, expected: { tooltip: string; dots: number }) => {
      fireEvent.mouseMove(container.querySelector('.recharts-wrapper')!, { clientX: x, clientY: 100, pageX: x, pageY: 100 });
      return waitFor(() =>
        expect({ tooltip: container.querySelector('.recharts-tooltip-wrapper')?.textContent?.replace(/\s/g, ' '), dots: container.querySelectorAll('.recharts-active-dot circle').length }).toEqual(expected),
      );
    };
    // The chart is 640px wide in the tests: 200px is nearest 10:02, 340px nearest 10:05.
    await hover(200, { tooltip: 'Nov 9, 2026, 10:02 AMErrors1', dots: 1 });
    await hover(340, { tooltip: 'Nov 9, 2026, 10:05 AMRequests7', dots: 1 });
  });

  it('stacks line series that share a stack group', () => {
    const data: CartesianData = { series: [{ name: 'A', points: [{ x: 'Mon', y: 1 }, { x: 'Tue', y: 1 }] }, { name: 'B', points: [{ x: 'Mon', y: 1 }, { x: 'Tue', y: 1 }] }] };
    const lines = (stack_group?: string) => {
      const { container, unmount } = render(<CartesianChart payload={{ render: { series: [{ name: 'A', type: 'line', stack_group }, { name: 'B', type: 'line', stack_group }] }, data }} />);
      const paths = [...container.querySelectorAll('.recharts-line-curve')].map((curve) => curve.getAttribute('d'));
      unmount();
      return paths;
    };
    // Stacked, B (1 + 1) is drawn where an unstacked B of 2 would be.
    const stacked = lines('total');
    data.series[1].points = [{ x: 'Mon', y: 2 }, { x: 'Tue', y: 2 }];
    expect(stacked).toEqual(lines());
  });

  it('writes the axis labels on their axes', () => {
    const data: CartesianData = { series: [{ name: 'Requests', points: [{ x: 1, y: 5 }, { x: 2, y: 6 }] }, { name: 'CPU', points: [{ x: 1, y: 40 }, { x: 2, y: 50 }] }] };
    const { container } = render(
      <CartesianChart
        payload={{ render: { x_axis: { type: 'value', label: 'Elapsed seconds' }, y_axis: { label: 'Requests per second' }, y_axis_secondary: { label: 'CPU load' }, series: [{ name: 'Requests', type: 'line' }, { name: 'CPU', type: 'line', y_axis: 'secondary' }] }, data }}
      />,
    );
    const at = (text: string) => {
      const title = [...container.querySelectorAll('svg text')].find((node) => node.textContent === text);
      return { x: Number(title?.getAttribute('x')), y: Number(title?.getAttribute('y')) };
    };
    const ticks = (axis: string) => [...container.querySelectorAll(`.recharts-${axis}-tick-labels .recharts-cartesian-axis-tick-value`)].map((tick) => ({ x: Number(tick.getAttribute('x')), y: Number(tick.getAttribute('y')) }));
    // The x title sits under the x ticks; the primary title left of the left ticks, the secondary title right of the right ticks.
    expect(at('Elapsed seconds').y).toBeGreaterThan(Math.max(...ticks('xAxis').map((tick) => tick.y)));
    const yTicks = ticks('yAxis').map((tick) => tick.x);
    expect(at('Requests per second').x).toBeLessThan(Math.min(...yTicks));
    expect(at('CPU load').x).toBeGreaterThan(Math.max(...yTicks));
  });

  it('tells apart times within one day in the ticks and the text alternative', () => {
    const data: CartesianData = { series: [{ name: 'Requests', points: [{ x: '2026-11-09T10:00:00Z', y: 5 }, { x: '2026-11-09T11:00:00Z', y: 7 }, { x: '2026-11-09T12:00:00Z', y: 6 }] }] };
    const { container } = render(<CartesianChart payload={{ render: { x_axis: { type: 'time' }, series: [{ name: 'Requests', type: 'line' }] }, data }} label="Hourly" />);
    const rows = within(alternative('Hourly')).getAllByRole('row', { hidden: true }).slice(1).map((row) => row.textContent?.replace(/\s/g, ' '));
    expect(rows).toEqual(['Nov 9, 2026, 10:00 AM5', 'Nov 9, 2026, 11:00 AM7', 'Nov 9, 2026, 12:00 PM6']);
    const ticks = [...container.querySelectorAll('.recharts-xAxis-tick-labels .recharts-cartesian-axis-tick-value')].map((tick) => tick.textContent?.replace(/\s/g, ' ') ?? '');
    expect(ticks.length).toBeGreaterThan(1);
    expect(ticks.every((tick) => /^\d{1,2}:\d{2} [AP]M$/.test(tick))).toBe(true);
  });

  it('shows dates alone for points at midnight, seconds when a point has them, and date ticks over a longer span', () => {
    const chart = (label: string, xs: string[]) => {
      const { container } = render(<CartesianChart payload={{ render: { x_axis: { type: 'time' }, series: [{ name: 'A', type: 'line' }] }, data: { series: [{ name: 'A', points: xs.map((x) => ({ x, y: 1 })) }] } }} label={label} />);
      const rows = within(alternative(label)).getAllByRole('row', { hidden: true }).slice(1).map((row) => row.textContent?.replace(/\s/g, ' '));
      const ticks = [...container.querySelectorAll('.recharts-xAxis-tick-labels .recharts-cartesian-axis-tick-value')].map((tick) => tick.textContent?.replace(/\s/g, ' ') ?? '');
      return { rows, ticks };
    };
    expect(chart('Midnights', ['2026-11-09T00:00:00Z', '2026-11-10T00:00:00Z']).rows).toEqual(['Nov 9, 20261', 'Nov 10, 20261']);
    expect(chart('Seconds', ['2026-11-09T10:00:00Z', '2026-11-09T10:00:30Z']).rows).toEqual(['Nov 9, 2026, 10:00:00 AM1', 'Nov 9, 2026, 10:00:30 AM1']);
    const days = chart('Days', ['2026-11-09T10:00:00Z', '2026-11-12T10:00:00Z']).ticks;
    expect(days.length).toBeGreaterThan(0);
    expect(days.every((tick) => /^Nov \d{1,2}, 2026$/.test(tick))).toBe(true);
  });

  it('takes bare dates as points on a time axis, at their UTC midnight, and fails a date the calendar does not have', () => {
    const payload = (xs: string[]) => ({ render: { x_axis: { type: 'time' as const }, series: [{ name: 'A', type: 'line' as const }] }, data: { series: [{ name: 'A', points: xs.map((x) => ({ x, y: 1 })) }] } });
    expect(checkCartesian(payload(['2026-11-09', '2026-11-10']).render, payload(['2026-11-09', '2026-11-10']).data)).toBeNull();
    expect(checkCartesian(payload(['2026-02-30']).render, payload(['2026-02-30']).data)).toBe('cartesian_chart: series 0 point 0 needs an ISO 8601 date-time, a YYYY-MM-DD date or epoch milliseconds');
    render(<CartesianChart payload={payload(['2026-11-09', '2026-11-10T00:00:00Z'])} label="Bare" />);
    expect(within(alternative('Bare')).getAllByRole('row', { hidden: true }).slice(1).map((row) => row.textContent?.replace(/\s/g, ' '))).toEqual(['Nov 9, 20261', 'Nov 10, 20261']);
  });

  it('names the day on time ticks that cross a midnight within two days', () => {
    const data: CartesianData = { series: [{ name: 'A', points: [{ x: '2026-11-09T22:00:00Z', y: 1 }, { x: '2026-11-10T02:00:00Z', y: 2 }] }] };
    const { container } = render(<CartesianChart payload={{ render: { x_axis: { type: 'time' }, series: [{ name: 'A', type: 'line' }] }, data }} />);
    const ticks = [...container.querySelectorAll('.recharts-xAxis-tick-labels .recharts-cartesian-axis-tick-value')].map((tick) => tick.textContent?.replace(/\s/g, ' ') ?? '');
    expect(ticks.length).toBeGreaterThan(1);
    expect(ticks.every((tick) => /^Nov \d{1,2}, \d{1,2}:\d{2} [AP]M$/.test(tick))).toBe(true);
  });

  it('shows days delivered as UTC or as local midnights by their date in zones behind and ahead of UTC', () => {
    vi.stubEnv('TZ', 'America/New_York');
    try {
      const days = (label: string, xs: string[]) => {
        const { container } = render(<CartesianChart payload={{ render: { x_axis: { type: 'time' }, series: [{ name: 'A', type: 'line' }] }, data: { series: [{ name: 'A', points: xs.map((x, i) => ({ x, y: i + 1 })) }] } }} label={label} />);
        const rows = within(alternative(label)).getAllByRole('row', { hidden: true }).slice(1).map((row) => row.textContent);
        const ticks = [...container.querySelectorAll('.recharts-xAxis-tick-labels .recharts-cartesian-axis-tick-value')].map((tick) => tick.textContent ?? '');
        return { rows, ticks };
      };
      const utc = days('UTC days', ['2026-10-01T00:00:00Z', '2026-10-02T00:00:00Z']);
      expect(utc.rows).toEqual(['Oct 1, 20261', 'Oct 2, 20262']);
      expect(utc.ticks.length).toBeGreaterThan(0);
      expect(utc.ticks.every((tick) => /^Oct [12], 2026$/.test(tick))).toBe(true);
      // 04:00Z is a New York midnight in October.
      expect(days('Local days', ['2026-10-01T04:00:00Z', '2026-10-02T04:00:00Z']).rows).toEqual(['Oct 1, 20261', 'Oct 2, 20262']);
      // Ahead of UTC a local midnight falls on the UTC day before, so local days must be read in the local zone.
      vi.stubEnv('TZ', 'Asia/Tokyo');
      const tokyo = days('Tokyo days', ['2026-09-30T15:00:00Z', '2026-10-01T15:00:00Z']);
      expect(tokyo.rows).toEqual(['Oct 1, 20261', 'Oct 2, 20262']);
      expect(tokyo.ticks.length).toBeGreaterThan(0);
      expect(tokyo.ticks.every((tick) => /^Oct [12], 2026$/.test(tick))).toBe(true);
    } finally {
      vi.unstubAllEnvs();
    }
  });

  it('draws a line on a log axis straight on that scale where it passes another series\' x, on either y axis', () => {
    const data: CartesianData = { series: [{ name: 'A', points: [{ x: 0, y: 10 }, { x: 2, y: 1000 }] }, { name: 'B', points: [{ x: 1, y: 50 }] }] };
    const renders: CartesianRender[] = [
      { x_axis: { type: 'value' }, y_axis: { type: 'log' }, series: [{ name: 'A', type: 'line' }, { name: 'B', type: 'line' }] },
      { x_axis: { type: 'value' }, y_axis_secondary: { type: 'log' }, series: [{ name: 'A', type: 'line', y_axis: 'secondary' }, { name: 'B', type: 'line' }] },
    ];
    for (const render_ of renders) {
      const { container, unmount } = render(<CartesianChart payload={{ render: render_, data }} />);
      // The points of A's curve: its start, then the end of each segment.
      const d = container.querySelector('.recharts-line-curve')?.getAttribute('d') ?? '';
      const points = [d.slice(1).split(/[LC]/)[0], ...d.split(/[LC]/).slice(1).map((segment) => segment.trim().split(/[ ,]+/).slice(-2).join(','))].map((pair) => pair.split(',').map(Number));
      expect(points).toHaveLength(3);
      // 100 at the middle x sits halfway between 10 and 1000 on a log scale.
      expect(points[1][1]).toBeCloseTo((points[0][1] + points[2][1]) / 2, 0);
      unmount();
    }
  });

  it('keeps a line on a log axis drawn between values whose ratio is beyond the largest number', () => {
    const data: CartesianData = { series: [{ name: 'A', points: [{ x: 0, y: 1e-200 }, { x: 2, y: 1e200 }] }, { name: 'B', points: [{ x: 1, y: 1 }] }] };
    const { container } = render(<CartesianChart payload={{ render: { x_axis: { type: 'value' }, y_axis: { type: 'log' }, series: [{ name: 'A', type: 'line' }, { name: 'B', type: 'line' }] }, data }} />);
    const d = container.querySelector('.recharts-line-curve')?.getAttribute('d') ?? '';
    expect(d.split(/[LC]/).length - 1).toBe(2);
    expect(d).not.toMatch(/NaN|Infinity/);
  });

  it('shows ISO times of a scatter chart as localized dates and times in its text alternative', () => {
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
    const { unmount: unmountValue } = render(<CartesianChart payload={{ render: { x_axis: { type: 'value' } }, data: DATA }} />);
    expect(screen.getByText('This widget cannot be shown')).toBeTruthy();
    unmountValue();
    // The two checks the log axis and the time range add reach the same state and the console.
    const errors = vi.mocked(console.error);
    errors.mockClear();
    const { unmount: unmountLog } = render(<CartesianChart payload={{ render: { y_axis: { type: 'log' }, series: [{ name: 'a', type: 'line' }] }, data: { series: [{ name: 'a', points: [{ x: 'Mon', y: 0 }] }] } }} />);
    expect(screen.getByText('This widget cannot be shown')).toBeTruthy();
    unmountLog();
    render(<CartesianChart payload={{ render: { x_axis: { type: 'time' }, series: [{ name: 'a', type: 'line' }] }, data: { series: [{ name: 'a', points: [{ x: 1e20, y: 1 }] }] } }} />);
    expect(screen.getByText('This widget cannot be shown')).toBeTruthy();
    expect(errors.mock.calls.map((call) => String(call[0]))).toEqual([expect.stringContaining('needs a y above zero'), expect.stringContaining('needs an ISO 8601')]);
  });

  it('switches to the data view and back with drill-down on', async () => {
    const user = userEvent.setup();
    render(<CartesianChart payload={{ render: { ...RENDER, drill_down: true }, data: DATA }} label="Orders per day" />);
    // The label names the view the button opens, so the button carries no pressed state.
    expect(screen.getByRole('button', { name: 'Show data' }).hasAttribute('aria-pressed')).toBe(false);
    await user.click(screen.getByRole('button', { name: 'Show data' }));
    expect(await screen.findByRole('region', { name: 'Data of Orders per day' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Show chart' }).hasAttribute('aria-pressed')).toBe(false);
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

  it('keeps the data view and its sort when a new language renames its headings', async () => {
    const user = userEvent.setup();
    const payload = { render: { x_axis: { type: 'value' as const }, series: [{ name: 'A', type: 'scatter' as const }], drill_down: true }, data: { series: [{ name: 'A', points: [{ x: 1, y: 2 }, { x: 2, y: 3 }] }] } };
    const german: WidgetTexts = { ...DEFAULT_WIDGET_TEXTS, columns: { ...DEFAULT_WIDGET_TEXTS.columns, series: 'Reihe', y: 'Wert' } };
    const { rerender } = render(<CartesianChart payload={payload} label="Live" />);
    await user.click(screen.getByRole('button', { name: 'Show data' }));
    const region = await screen.findByRole('region', { name: 'Data of Live' });
    await user.click(within(region).getAllByRole('button', { name: /sorting of 'y'/ })[0]);
    const ys = () => within(region).getAllByRole('row').slice(1).map((row) => within(row).getAllByRole('cell')[2].textContent);
    await vi.waitFor(() => expect(ys()).toEqual(['3', '2']));
    rerender(<CartesianChart payload={payload} label="Live" locale="de" texts={german} />);
    await vi.waitFor(() => expect(within(region).getByRole('columnheader', { name: /Wert/ }).getAttribute('aria-sort')).toBe('descending'));
    expect(ys()).toEqual(['3', '2']);
  });

  it('labels the ticks of a value axis with many points, where tick_labels every has no categories to thin', () => {
    // 100 points on a 640px chart: a category step would keep only every 11th of the axis's few number ticks.
    const many: CartesianData = { series: [{ name: 'A', points: Array.from({ length: 100 }, (_, index) => ({ x: index, y: index % 7 })) }] };
    const { container } = render(<CartesianChart payload={{ render: { x_axis: { type: 'value', tick_labels: 'every' }, series: [{ name: 'A', type: 'line' }] }, data: many }} />);
    expect(container.querySelectorAll('.recharts-xAxis-tick-labels .recharts-cartesian-axis-tick-value').length).toBeGreaterThan(2);
  });

  it('labels every category with tick_labels every, and every n-th one when the labels do not fit', () => {
    const ticks = (labels: string[]) => {
      const data: CartesianData = { series: [{ name: 'A', points: labels.map((x, index) => ({ x, y: index })) }] };
      const { container, unmount } = render(<CartesianChart payload={{ render: { x_axis: { tick_labels: 'every' }, series: [{ name: 'A', type: 'bar' }] }, data }} />);
      const count = container.querySelectorAll('.recharts-xAxis-tick-labels .recharts-cartesian-axis-tick-value').length;
      unmount();
      return count;
    };
    expect(ticks(['a', 'b', 'c', 'd', 'e', 'f'])).toBe(6);
    // 24 labels of 19 characters do not fit one per category on the 640px test chart, so they are thinned to fewer than half.
    const long = Array.from({ length: 24 }, (_, index) => `Category number ${String(index).padStart(3, '0')}`);
    const thinned = ticks(long);
    expect(thinned).toBeGreaterThan(1);
    expect(thinned).toBeLessThan(long.length / 2);
  });

  // A guard on cost: it counts JSON.stringify calls on the values table, the content key the shell and the data view use.
  it('builds the values key only with drill-down on, and once per render with the data view open', async () => {
    const user = userEvent.setup();
    const stringify = vi.spyOn(JSON, 'stringify');
    // Counted by shape: the values key stringifies the rows, an array of rows; the data view's own headings key is an array of strings and is not counted.
    const tableCalls = () => stringify.mock.calls.filter(([value]) => Array.isArray(value) && value.length > 0 && value.every(Array.isArray)).length;
    const { rerender } = render(<CartesianChart payload={{ render: RENDER, data: DATA }} label="Orders per day" />);
    rerender(<CartesianChart payload={{ render: RENDER, data: DATA }} label="Orders per day" />);
    expect(tableCalls()).toBe(0);
    rerender(<CartesianChart payload={{ render: { ...RENDER, drill_down: true }, data: DATA }} label="Orders per day" />);
    await user.click(screen.getByRole('button', { name: 'Show data' }));
    await screen.findByRole('region', { name: 'Data of Orders per day' });
    stringify.mockClear();
    rerender(<CartesianChart payload={{ render: { ...RENDER, drill_down: true }, data: DATA }} label="Orders per day" />);
    // The shell keys the values once; the open data view takes that key as its version and builds only the small headings key.
    expect(tableCalls()).toBe(1);
  });

  it('names the chart and the columns of its values from the texts', () => {
    const texts: WidgetTexts = { ...DEFAULT_WIDGET_TEXTS, chart: 'Diagramm', columns: { series: 'Reihe', x: 'X-Wert', y: 'Y-Wert', label: 'Name', value: 'Wert', size: 'Groesse' } };
    const { unmount } = render(<CartesianChart payload={{ render: RENDER, data: DATA }} texts={texts} />);
    expect(within(alternative('Diagramm')).getAllByRole('columnheader', { hidden: true }).map((cell) => cell.textContent)).toEqual(['X-Wert', 'Orders', 'Target']);
    unmount();
    const scatter: CartesianData = { series: [{ name: 'A', points: [{ x: 1, y: 2 }] }] };
    const { unmount: unmountScatter } = render(<CartesianChart payload={{ render: { x_axis: { type: 'value' }, series: [{ name: 'A', type: 'scatter' }] }, data: scatter }} texts={texts} />);
    expect(within(alternative('Diagramm')).getAllByRole('columnheader', { hidden: true }).map((cell) => cell.textContent)).toEqual(['Reihe', 'X-Wert', 'Y-Wert']);
    unmountScatter();
    render(<PieChart payload={{ render: {}, data: { slices: [{ label: 'North', value: 3 }] } }} texts={texts} />);
    expect(within(alternative('Diagramm')).getAllByRole('columnheader', { hidden: true }).map((cell) => cell.textContent)).toEqual(['Name', 'Wert']);
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
    expect(rows.map((row) => row.textContent)).toEqual(['LabelValue', 'North25%', 'South0%', '']);
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
  it('writes the total of the slices in the hole of a donut, with its caption, and names it in the text alternative', () => {
    const { container } = render(
      <PieChart
        payload={{ render: { radius: ['60%', '80%'], center: 'total', center_label: 'tickets' }, data: { slices: [{ label: 'Open', value: 12 }, { label: 'Closed', value: 30 }, { label: 'Lost', value: null }] } }}
        label="Tickets"
      />,
    );
    expect(container.querySelector('[class*="pieTotal"]')?.textContent).toBe('42');
    expect(container.querySelector('[class*="pieCaption"]')?.textContent).toBe('tickets');
    const rows = within(alternative('Tickets')).getAllByRole('row', { hidden: true });
    expect(rows.map((row) => row.textContent)).toEqual(['LabelValue', 'Open12', 'Closed30', 'Lost', 'tickets42']);
  });

  it('formats the total by value_format and names it from the texts without a caption', () => {
    const texts: WidgetTexts = { ...DEFAULT_WIDGET_TEXTS, pie: { total: 'Summe' } };
    const { container } = render(
      <PieChart payload={{ render: { radius: ['60%', '80%'], center: 'total' }, value_format: { value_type: 'percent' }, data: { slices: [{ label: 'A', value: 0.25 }, { label: 'B', value: 0.5 }] } }} label="Share" texts={texts} />,
    );
    expect(container.querySelector('[class*="pieTotal"]')?.textContent).toBe('75%');
    expect(container.querySelector('[class*="pieCaption"]')).toBeNull();
    expect(within(alternative('Share')).getAllByRole('row', { hidden: true }).at(-1)?.textContent).toBe('Summe75%');
  });

  it('draws no centre without center total, as before', () => {
    const { container } = render(<PieChart payload={{ render: { radius: ['60%', '80%'] }, data: { slices: [{ label: 'A', value: 1 }] } }} label="Share" />);
    expect(container.querySelector('[class*="pieCenter"]')).toBeNull();
  });

  it('checks that a total stands in a donut, and that a centre caption comes with a total', () => {
    expect(checkPie({ radius: ['60%', '80%'], center: 'total', center_label: 'x' })).toBeNull();
    expect(checkPie({ center: 'none' })).toBeNull();
    expect(checkPie({ center: 'total' })).toBe('pie_chart: center total needs a donut, a radius of two items');
    expect(checkPie({ radius: ['80%'], center: 'total' })).toBe('pie_chart: center total needs a donut, a radius of two items');
    // An inner radius of 0 draws a full pie: no hole, so no total.
    expect(checkPie({ radius: ['0%', '80%'], center: 'total' })).toBe('pie_chart: center total needs a donut, a radius of two items');
    expect(checkPie({ radius: ['0px', '80%'], center: 'total' })).toBe('pie_chart: center total needs a donut, a radius of two items');
    expect(checkPie({ radius: ['40px', '80px'], center: 'total' })).toBeNull();
    expect(checkPie({ radius: ['60%', '80%'], center_label: 'x' })).toBe('pie_chart: center_label needs center total');
    expect(checkPie({ radius: ['60%', '80%'], center: 'none', center_label: 'x' })).toBe('pie_chart: center_label needs center total');
  });

  it('shows its cannot-be-shown state when a check fails, with the problem in the console', () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => {});
    render(<PieChart payload={{ render: { center: 'total' }, data: { slices: [{ label: 'A', value: 1 }] } }} />);
    expect(screen.getByText('This widget cannot be shown')).toBeTruthy();
    expect(error).toHaveBeenCalledWith('[widget] pie_chart: center total needs a donut, a radius of two items');
    error.mockRestore();
  });
});

describe('funnel_chart', () => {
  const STAGES: FunnelData['stages'] = [
    { label: 'Opened', value: 200 },
    { label: 'Reviewed', value: 150 },
    { label: 'Approved', value: 120 },
    { label: 'Merged', value: 96 },
  ];
  const draw = (stages: FunnelData['stages'], options: FunnelRender = {}, extra: object = {}) =>
    render(<FunnelChart payload={{ render: options, data: { stages }, ...extra }} label="Pull requests" />);
  const parts = (container: HTMLElement, part: string) => [...container.querySelectorAll('[data-stage]')].map((stage) => stage.querySelector(`[data-part="${part}"]`)?.textContent ?? null);
  const shares = (container: HTMLElement) => [...container.querySelectorAll('[data-stage]')].map((stage) => stage.querySelector('[data-share]')?.getAttribute('data-share') ?? null);
  const rowsOf = () => within(alternative('Pull requests')).getAllByRole('row', { hidden: true }).map((row) => [...row.children].map((cell) => cell.textContent));

  // The widget's body as the ResizeObserver reports it.
  const original = globalThis.ResizeObserver;
  // A list size apart from the widget's, as the drill-down button takes height from the list but not from the widget.
  const sized = (width: number, height: number, list?: { width: number; height: number }) => {
    globalThis.ResizeObserver = class {
      constructor(private readonly callback: ResizeObserverCallback) {}
      observe(target: Element) {
        const contentRect = list && target.tagName === 'OL' ? list : { width, height };
        this.callback([{ target, contentRect } as unknown as ResizeObserverEntry], this as unknown as ResizeObserver);
      }
      unobserve() {}
      disconnect() {}
    } as unknown as typeof ResizeObserver;
  };
  beforeEach(() => sized(600, 300));
  afterEach(() => {
    globalThis.ResizeObserver = original;
    vi.restoreAllMocks();
  });

  it('draws one bar per stage, as wide as its value over the largest, with its label, value and conversion', () => {
    const { container } = draw(STAGES);
    expect(container.querySelectorAll('ol li')).toHaveLength(4);
    expect(shares(container)).toEqual(['100', '75', '60', '48']);
    expect([...container.querySelectorAll('[data-stage] [class*="funnelLabel"]')].map((label) => label.textContent)).toEqual(['Opened', 'Reviewed', 'Approved', 'Merged']);
    expect(parts(container, 'value')).toEqual(['200', '150', '120', '96']);
    expect(parts(container, 'conversion')).toEqual([null, '75%', '80%', '80%']);
    // One fill colour from the theme for every stage.
    expect(new Set([...container.querySelectorAll<HTMLElement>('[data-share]')].map((bar) => bar.style.background))).toEqual(new Set(['var(--chart-5)']));
  });

  it('formats the values with value_format', () => {
    const { container } = draw([{ label: 'Visits', value: 1234.5 }, { label: 'Sign-ups', value: 0.5 }], {}, { value_format: { value_type: 'number', decimals: 1, unit_label: 'k' } });
    expect(parts(container, 'value')).toEqual(['1,234.5\u00a0k', '0.5\u00a0k']);
    expect(rowsOf()[1]).toEqual(['Visits', '1,234.5\u00a0k', '']);
  });

  it('fails the cell on a negative value, naming the stage by its position and never by its value', () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => {});
    draw([{ label: 'a', value: 3 }, { label: 'b', value: 1 }, { label: 'c', value: -7 }]);
    expect(screen.getByText('This widget cannot be shown')).toBeTruthy();
    expect(error).toHaveBeenCalledWith('[widget] funnel_chart: data.stages[2].value is below 0');
    expect(String(error.mock.calls[0][0])).not.toContain('7');
    expect(checkFunnel({ stages: [{ label: 'a', value: 0 }, { label: 'b', value: null }] })).toBeNull();
  });

  it.each([
    ['all zero', [{ label: 'a', value: 0 }, { label: 'b', value: 0 }]],
    ['all null', [{ label: 'a', value: null }, { label: 'b', value: null }]],
    ['zero and null', [{ label: 'a', value: 0 }, { label: 'b', value: null }]],
  ])('shows the empty state when the stages are %s', (_name, stages) => {
    draw(stages);
    expect(screen.getByText('No data to show')).toBeTruthy();
  });

  it('draws a null stage empty with a hyphen, and no conversion for it or the next stage', () => {
    const { container } = draw([{ label: 'a', value: 100 }, { label: 'b', value: null }, { label: 'c', value: 40 }, { label: 'd', value: 20 }]);
    expect(shares(container)).toEqual(['100', null, '40', '20']);
    expect(parts(container, 'empty')).toEqual([null, '-', null, null]);
    expect(parts(container, 'value')).toEqual(['100', null, '40', '20']);
    expect(parts(container, 'conversion')).toEqual([null, '-', '-', '50%']);
    expect(rowsOf().slice(1)).toEqual([['a', '100', ''], ['b', '-', '-'], ['c', '40', '-'], ['d', '20', '50%']]);
  });

  it('draws a stage larger than the one before wider, its conversion above 100%', () => {
    const { container } = draw([{ label: 'a', value: 80 }, { label: 'b', value: 100 }, { label: 'c', value: 50 }]);
    expect(shares(container)).toEqual(['80', '100', '50']);
    expect(parts(container, 'conversion')).toEqual([null, '125%', '50%']);
  });

  it('shows a hyphen for a conversion from a stage of 0, in the drawing and the text alternative alike', () => {
    const { container } = draw([{ label: 'a', value: 10 }, { label: 'b', value: 0 }, { label: 'c', value: 5 }]);
    expect(parts(container, 'conversion')).toEqual([null, '0%', '-']);
    expect(rowsOf().slice(1).map((row) => row[2])).toEqual(['', '0%', '-']);
    expect(shares(container)).toEqual(['100', '0', '50']);
    expect(container.innerHTML).not.toMatch(/∞|NaN|Infinity/);
    expect(conversionsOf([{ label: 'a', value: 0 }, { label: 'b', value: 5 }])).toEqual([undefined, null]);
  });

  it('shows no conversion with show_conversion false, in the drawing and the text alternative', () => {
    const { container } = draw(STAGES, { show_conversion: false });
    expect(parts(container, 'conversion')).toEqual([null, null, null, null]);
    expect(rowsOf()[0]).toEqual(['Label', 'Value']);
  });

  it('writes the values by value_labels: auto where they fit, always, never', () => {
    const long = [{ label: 'Pull requests opened by everyone', value: 1200 }, { label: 'Reviewed', value: 900 }];
    // 600 px wide: every line fits. 200 px wide: the long label alone takes an estimated 238 px, so its value is left out.
    expect(parts(draw(long).container, 'value')).toEqual(['1,200', '900']);
    cleanup();
    sized(200, 300);
    expect(parts(draw(long).container, 'value')).toEqual([null, '900']);
    cleanup();
    expect(parts(draw(long, { value_labels: 'always' }).container, 'value')).toEqual(['1,200', '900']);
    cleanup();
    sized(600, 300);
    expect(parts(draw(long, { value_labels: 'never' }).container, 'value')).toEqual([null, null]);
    // The text alternative keeps every value.
    expect(rowsOf().slice(1).map((row) => row[1])).toEqual(['1,200', '900']);
  });

  it('leaves the conversion out of a line too narrow for it beside a readable label, before the label, in either layout', () => {
    const labels = (container: HTMLElement) => [...container.querySelectorAll('[data-stage] [class*="funnelLabel"]')].map((label) => label.textContent);
    // 120 px: "Reviewed" keeps its least 3 em (44 px with the gap) beside "75%" (30 px), so the conversion shows.
    sized(120, 300);
    expect(parts(draw(STAGES).container, 'conversion')).toEqual([null, '75%', '80%', '80%']);
    cleanup();
    // 60 px: 44 + 30 - 8 = 66 px is more than the line, so every conversion is left out and every label stays.
    sized(60, 300);
    const { container } = draw(STAGES);
    expect(parts(container, 'conversion')).toEqual([null, null, null, null]);
    expect(labels(container)).toEqual(['Opened', 'Reviewed', 'Approved', 'Merged']);
    // The tooltip and the text alternative keep it.
    expect(container.querySelector('[data-stage="1"]')?.getAttribute('title')).toBe('Reviewed: 150, 75% of the previous stage');
    expect(rowsOf().slice(1).map((row) => row[2])).toEqual(['', '75%', '80%', '80%']);
    cleanup();
    // value_labels always keeps its value, and the conversion yields to the label beside it too.
    const always = draw(STAGES, { value_labels: 'always' }).container;
    expect(parts(always, 'value')).toEqual(['200', '150', '120', '96']);
    expect(parts(always, 'conversion')).toEqual([null, null, null, null]);
    cleanup();
    // Beside the bar the line has 40% of the width: 150 px leaves it 60 px, so the conversions go there too.
    const twelve = Array.from({ length: 12 }, (_, index) => ({ label: `Stage ${index + 1}`, value: 120 - index * 10 }));
    sized(150, 300);
    const beside = draw(twelve).container;
    expect(beside.querySelectorAll('[class*="funnelBeside"]')).toHaveLength(12);
    expect(parts(beside, 'conversion').filter(Boolean)).toHaveLength(0);
    expect(labels(beside)).toHaveLength(12);
    cleanup();
    sized(600, 300);
    expect(parts(draw(twelve).container, 'conversion').filter(Boolean)).toHaveLength(11);
  });

  it('leaves the auto values out in a low cell, and every text line where a stage is too low for one', () => {
    sized(600, 150);
    const { container } = draw(STAGES);
    expect(parts(container, 'value')).toEqual([null, null, null, null]);
    expect(parts(container, 'conversion')).toEqual([null, '75%', '80%', '80%']);
    expect(parts(draw(STAGES, { value_labels: 'always' }).container, 'value').filter(Boolean)).toHaveLength(4);
    cleanup();
    // 12 stages in 150 px: 8.8 px a stage, under the 16 px of a text line. The bars stay.
    const twelve = Array.from({ length: 12 }, (_, index) => ({ label: `Stage ${index + 1}`, value: 120 - index * 10 }));
    const low = draw(twelve).container;
    expect(low.querySelectorAll('[class*="funnelLine"]')).toHaveLength(0);
    expect(shares(low).filter(Boolean)).toHaveLength(12);
    expect(rowsOf()).toHaveLength(13);
  });

  it('writes the text line beside the bar of a stage too low to hold it over the bar', () => {
    // 12 stages in 300 px: 21.3 px a stage, under the 26 px of a line over a floor-high bar and above the 16 px of a line.
    sized(600, 300);
    const twelve = Array.from({ length: 12 }, (_, index) => ({ label: `Stage ${index + 1}`, value: 120 - index * 10 }));
    const { container } = draw(twelve);
    expect(container.querySelectorAll('[class*="funnelBeside"]')).toHaveLength(12);
    expect(container.querySelectorAll('[class*="funnelLabel"]')).toHaveLength(12);
    cleanup();
    sized(600, 400);
    expect(draw(twelve).container.querySelectorAll('[class*="funnelBeside"]')).toHaveLength(0);
  });

  it('shares the height of its list, not of the widget, among the stages', () => {
    // A 300 px widget whose list keeps 60 px: 12 px a stage, too low for a text line.
    sized(600, 300, { width: 600, height: 60 });
    const { container } = draw(STAGES);
    expect(container.querySelectorAll('[class*="funnelLine"]')).toHaveLength(0);
    expect(shares(container)).toEqual(['100', '75', '60', '48']);
  });

  const bars = (container: HTMLElement) => [...container.querySelectorAll<HTMLElement>('[data-stage] [class*="funnelTrack"]')].map((track) => track.style.blockSize);

  it('caps the bar height in a high cell, so the stages stack from the top at their own height', () => {
    // 4 stages in 300 px: 72 px a stage, 54 px under the text line, capped at 32.
    const { container } = draw(STAGES);
    expect(bars(container)).toEqual(['32px', '32px', '32px', '32px']);
    cleanup();
    // Before any measurement the bars take the ceiling too.
    globalThis.ResizeObserver = original;
    expect(bars(draw(STAGES).container)).toEqual(['32px', '32px', '32px', '32px']);
  });

  it('keeps the bar height at its floor in a low cell, dropping the text first', () => {
    // 12 stages in a 60 px list: 1.3 px a stage. No text line, every bar 8 px high (the list scrolls).
    const twelve = Array.from({ length: 12 }, (_, index) => ({ label: `Stage ${index + 1}`, value: 120 - index * 10 }));
    sized(600, 300, { width: 600, height: 60 });
    const { container } = draw(twelve);
    expect(container.querySelectorAll('[class*="funnelLine"]')).toHaveLength(0);
    expect(bars(container)).toEqual(Array(12).fill('8px'));
  });

  it.each([
    // list height, stages, where the text goes, bar height
    [300, 4, 'over', BAR_CEILING],
    [116, 4, 'over', BAR_FLOOR],
    [115, 4, 'beside', 25.75],
    [102, 4, 'beside', 22.5],
    [76, 4, 'beside', 16],
    [75, 4, null, 15.75],
    [62, 4, null, 12.5],
    [60, 12, null, BAR_FLOOR],
    [0, 4, 'over', BAR_CEILING],
  ] as const)('lays a %i px list of %i stages out with its text %s and a %f px bar', (height, count, textAt, bar) => {
    expect(funnelLayout(height, count)).toEqual({ textAt, bar });
  });

  it('never draws a bar above the ceiling or under the floor, whatever the height', () => {
    for (let count = 1; count <= 12; count += 1) {
      for (let height = 0; height <= 1000; height += 7) {
        const { bar } = funnelLayout(height, count);
        expect(bar).toBeGreaterThanOrEqual(BAR_FLOOR);
        expect(bar).toBeLessThanOrEqual(BAR_CEILING);
      }
    }
  });

  it('is a figure named by its label, with a text alternative of every stage, its value and its conversion', () => {
    draw(STAGES);
    expect(screen.getByRole('figure', { name: 'Pull requests' })).toBeTruthy();
    expect(rowsOf()).toEqual([
      ['Label', 'Value', 'Conversion'],
      ['Opened', '200', ''],
      ['Reviewed', '150', '75%'],
      ['Approved', '120', '80%'],
      ['Merged', '96', '80%'],
    ]);
  });

  it('takes its conversion heading and tooltip words from the texts', () => {
    const texts: WidgetTexts = { ...DEFAULT_WIDGET_TEXTS, chart: 'Diagramm', columns: { ...DEFAULT_WIDGET_TEXTS.columns, label: 'Stufe', value: 'Wert' }, funnel: { conversion: 'Umwandlung', ofPrevious: 'der vorigen Stufe' } };
    const { container } = render(<FunnelChart payload={{ render: {}, data: { stages: STAGES } }} texts={texts} />);
    expect(within(alternative('Diagramm')).getAllByRole('columnheader', { hidden: true }).map((cell) => cell.textContent)).toEqual(['Stufe', 'Wert', 'Umwandlung']);
    expect(container.querySelector('[data-stage="1"]')?.getAttribute('title')).toBe('Reviewed: 150, 75% der vorigen Stufe');
  });

  it('opens the data view from the button and from a stage with drill_down', async () => {
    const user = userEvent.setup();
    const { container } = draw(STAGES, { drill_down: true });
    await user.click(container.querySelector('[data-stage="2"]')!);
    expect(await screen.findByRole('region', { name: 'Data of Pull requests' })).toBeTruthy();
    await user.click(screen.getByRole('button', { name: 'Show chart' }));
    await user.click(screen.getByRole('button', { name: 'Show data' }));
    expect(await screen.findByRole('region', { name: 'Data of Pull requests' })).toBeTruthy();
  });

  it('draws no data view button and no clickable stage with drill-down off', () => {
    const { container } = draw(STAGES);
    expect(screen.queryByRole('button', { name: 'Show data' })).toBeNull();
    expect(container.querySelector('[class*="funnelPick"]')).toBeNull();
  });
});
