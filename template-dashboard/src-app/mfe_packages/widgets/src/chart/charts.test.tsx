import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { CartesianData, CartesianRender, FunnelData, FunnelRender, RadarData, RadarRender, TreemapData, TreemapRender, WaterfallData, WaterfallRender } from '../types';
import type { ValueFormat } from '@gears-frontx/frontx-dashboard-root/contract';
import { DEFAULT_WIDGET_TEXTS, type WidgetTexts } from '../states';
import { CartesianChart, checkCartesian } from './CartesianChart';
import { PieChart, checkPie } from './PieChart';
import { FunnelChart, checkFunnel } from './FunnelChart';
import { RadarChart, checkRadar } from './RadarChart';
import { TreemapChart, checkTreemap } from './TreemapChart';
import { WaterfallChart, checkWaterfall } from './WaterfallChart';
import { seriesColor } from './palette';

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
    const days = payload(['2026-11-09', '2026-11-10']);
    expect(checkCartesian(days.render, days.data)).toBeNull();
    const feb30 = payload(['2026-02-30']);
    expect(checkCartesian(feb30.render, feb30.data)).toBe('cartesian_chart: series 0 point 0 needs an ISO 8601 date-time, a YYYY-MM-DD date or epoch milliseconds');
    render(<CartesianChart payload={payload(['2026-11-09', '2026-11-10T00:00:00Z'])} label="Bare" />);
    expect(within(alternative('Bare')).getAllByRole('row', { hidden: true }).slice(1).map((row) => row.textContent?.replace(/\s/g, ' '))).toEqual(['Nov 9, 20261', 'Nov 10, 20261']);
  });

  it('takes date-times and bare dates of the years 0000 to 0099 on a time axis as the years they name', () => {
    const payload = (xs: string[]) => ({ render: { x_axis: { type: 'time' as const }, series: [{ name: 'A', type: 'line' as const }] }, data: { series: [{ name: 'A', points: xs.map((x) => ({ x, y: 1 })) }] } });
    const early = ['0099-12-30', '0099-12-31T10:00:00Z'];
    expect(checkCartesian(payload(early).render, payload(early).data)).toBeNull();
    render(<CartesianChart payload={payload(early)} label="Early" />);
    const rows = within(alternative('Early')).getAllByRole('row', { hidden: true }).slice(1).map((row) => row.children[0]?.textContent?.replace(/\s/g, ' '));
    expect(rows).toHaveLength(2);
    expect(rows.every((row) => row?.includes(', 99'))).toBe(true);
    expect(rows.join(' ')).not.toMatch(/19\d\d/);
    const others = ['0000-01-01', '0001-01-01', '0045-06-01'];
    expect(checkCartesian(payload(others).render, payload(others).data)).toBeNull();
    render(<CartesianChart payload={payload(others)} label="Earliest" />);
    const otherDates = within(alternative('Earliest')).getAllByRole('row', { hidden: true }).slice(1).map((row) => row.children[0]?.textContent?.replace(/\s/g, ' '));
    // The year 0 writes its era, 1 BC, so it does not read as the year 1 beside it.
    expect(otherDates).toEqual(['Jan 1, 1 BC', 'Jan 1, 1', 'Jun 1, 45']);
  });

  it('fails a date-time on a time axis whose day the calendar does not have, naming the series and the point', () => {
    const payload = (xs: string[]) => ({ render: { x_axis: { type: 'time' as const }, series: [{ name: 'A', type: 'line' as const }, { name: 'B', type: 'line' as const }] }, data: { series: [{ name: 'A', points: [{ x: '2026-11-09T10:00:00Z', y: 1 }] }, { name: 'B', points: xs.map((x) => ({ x, y: 1 })) }] } });
    const baseline = payload(['2026-02-28T10:00:00Z']);
    expect(checkCartesian(baseline.render, baseline.data)).toBeNull();
    const withFeb30 = payload(['2026-02-28T10:00:00Z', '2026-02-30T10:00:00Z']);
    expect(checkCartesian(withFeb30.render, withFeb30.data)).toBe(
      'cartesian_chart: series 1 point 1 needs an ISO 8601 date-time, a YYYY-MM-DD date or epoch milliseconds',
    );
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

  describe('long category names', () => {
    const LONG = [
      'Customer onboarding service', 'Payments reconciliation worker', 'Identity and access gateway', 'Search indexing pipeline',
      'Mobile push notification relay', 'Storage lifecycle manager', 'Messaging fan-out broker', 'Reports export scheduler',
      'Support ticket triage bot', 'Platform configuration store', 'Data warehouse loader', 'Security audit collector',
    ];
    /** The category ticks of a bar chart of `labels`: the text each shows and the full name its title carries, if any. */
    const ticksOf = (labels: string[], extra: Partial<CartesianRender> = {}, axis = extra.orientation === 'horizontal' ? 'yAxis' : 'xAxis') => {
      const data: CartesianData = { series: [{ name: 'A', points: labels.map((x, index) => ({ x, y: index + 1 })) }] };
      const { container, unmount } = render(<CartesianChart payload={{ render: { series: [{ name: 'A', type: 'bar' }], ...extra }, data }} />);
      const ticks = [...container.querySelectorAll(`.recharts-${axis}-tick-labels .recharts-cartesian-axis-tick-label`)].map((tick) => ({
        shown: tick.querySelector('.recharts-cartesian-axis-tick-value')?.textContent ?? '',
        full: tick.querySelector('title')?.textContent ?? null,
      }));
      unmount();
      return ticks;
    };

    it.each([['auto', {}], ['every', { x_axis: { tick_labels: 'every' as const } }]])(
      'labels each of 12 long names on an upright chart (tick_labels %s), cut to its slot, with the full name on hover',
      (_mode, extra) => {
        const ticks = ticksOf(LONG, extra);
        expect(ticks).toHaveLength(12);
        // The 640px test chart gives each of 12 categories about 49px: 6 characters, the last an ellipsis.
        expect(ticks.map((tick) => tick.shown)).toEqual(LONG.map((name) => `${Array.from(name).slice(0, 5).join('').trimEnd()}\u2026`));
        expect(ticks.map((tick) => tick.full)).toEqual(LONG);
      },
    );

    it('keeps a name that fits its slot whole, with no title', () => {
      expect(ticksOf(['Web', 'Data', 'Infra'])).toEqual([
        { shown: 'Web', full: null },
        { shown: 'Data', full: null },
        { shown: 'Infra', full: null },
      ]);
    });

    it('labels every 2nd of 24 names when a slot cannot hold a short label, each cut to the room of two slots', () => {
      const long = Array.from({ length: 24 }, (_, index) => `Category number ${String(index).padStart(3, '0')}`);
      const ticks = ticksOf(long, { x_axis: { tick_labels: 'every' } });
      expect(ticks.map((tick) => tick.full)).toEqual(long.filter((_, index) => index % 2 === 0));
      expect(ticks.every((tick) => tick.shown.endsWith('\u2026') && Array.from(tick.shown).length >= 5)).toBe(true);
    });

    it('cuts a name longer than a third of a horizontal chart beside the plot, on one line, with the full name on hover', () => {
      const name = 'A very long category name that takes far more room than a third of the chart';
      const ticks = ticksOf([name, 'Short'], { orientation: 'horizontal', x_axis: { type: 'category' } });
      expect(ticks).toHaveLength(2);
      expect(ticks[0].full).toBe(name);
      expect(ticks[0].shown.endsWith('\u2026')).toBe(true);
      // A third of the 640px chart, less the gap: about 30 characters.
      expect(Array.from(ticks[0].shown).length).toBeLessThanOrEqual(31);
      expect(ticks[1]).toEqual({ shown: 'Short', full: null });
    });

    it('cuts a turned name to a third of the chart height, with the full name on hover', () => {
      const name = 'A very long category name that would make the turned axis taller than the plot itself';
      const [tick] = ticksOf([name], { x_axis: { tick_angle: -45 } });
      expect(tick.full).toBe(name);
      expect(tick.shown.endsWith('\u2026')).toBe(true);
      // 320 / 3 less the axis gap, along a 45 degree line: about 20 characters.
      expect(Array.from(tick.shown).length).toBeLessThan(25);
    });
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

/** The payload fields a test passes beside the render and the data. */
type Extra = { value_format?: ValueFormat };

/**
 * The widget's body as the ResizeObserver reports it, for the describe block that calls this: each test starts at 600
 * by 300 px, `sized` sets another size (and, for a list, a size of its own apart from the widget's), and after each
 * test the observer comes back and the mocks are restored.
 */
const stubSizedObserver = () => {
  const original = globalThis.ResizeObserver;
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
  return sized;
};

describe('funnel_chart', () => {
  const STAGES: FunnelData['stages'] = [
    { label: 'Opened', value: 200 },
    { label: 'Reviewed', value: 150 },
    { label: 'Approved', value: 120 },
    { label: 'Merged', value: 96 },
  ];
  const draw = (stages: FunnelData['stages'], options: FunnelRender = {}, extra: Extra = {}) =>
    render(<FunnelChart payload={{ render: options, data: { stages }, ...extra }} label="Pull requests" />);
  const parts = (container: HTMLElement, part: string) => [...container.querySelectorAll('[data-stage]')].map((stage) => stage.querySelector(`[data-part="${part}"]`)?.textContent ?? null);
  const shares = (container: HTMLElement) => [...container.querySelectorAll('[data-stage]')].map((stage) => stage.querySelector('[data-share]')?.getAttribute('data-share') ?? null);
  const rowsOf = () => within(alternative('Pull requests')).getAllByRole('row', { hidden: true }).map((row) => [...row.children].map((cell) => cell.textContent));

  // The widget's body as the ResizeObserver reports it; a list size apart from the widget's, as the drill-down button
  // takes height from the list but not from the widget. The observer of the page, for a test before any measurement.
  const original = globalThis.ResizeObserver;
  const sized = stubSizedObserver();

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
    // The tooltip of a stage without a conversion names the stage and its value only.
    expect([...container.querySelectorAll('[data-stage]')].map((stage) => stage.getAttribute('title'))).toEqual(['a: 100', 'b: -', 'c: 40', 'd: 20, 50% of the previous stage']);
  });

  it('keeps a visible bar for a positive stage too small for a rounded share, and none for a stage of 0', () => {
    const { container } = draw([{ label: 'a', value: 1_000_000 }, { label: 'b', value: 1 }, { label: 'c', value: 0 }]);
    expect(shares(container)).toEqual(['100', '0', '0']);
    expect([...container.querySelectorAll<HTMLElement>('[data-share]')].map((bar) => bar.style.minInlineSize)).toEqual(['2px', '2px', '0']);
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
    expect(container.querySelector('[data-stage="2"]')?.getAttribute('title')).toBe('c: 5');
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
    // 120 px: a long label keeps only its least 3 em (44 px), not its whole estimated 246 px, beside "75%", so the
    // conversion shows while the label ends with an ellipsis.
    sized(120, 300);
    expect(parts(draw([{ label: 'Opened', value: 200 }, { label: 'Pull requests opened by everyone', value: 150 }]).container, 'conversion')).toEqual([null, '75%']);
    cleanup();
    // 60 px: a label shorter than 3 em keeps only its own width (15 px), so "75%" fits beside it.
    sized(60, 300);
    expect(parts(draw([{ label: 'a', value: 200 }, { label: 'b', value: 150 }]).container, 'conversion')).toEqual([null, '75%']);
    cleanup();
    sized(60, 300);
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
    // list height, where the text goes, bar height: 4 stages, each (height - 12) / 4 px high.
    [116, 'over', '8px'],
    [115, 'beside', '25.75px'],
    [76, 'beside', '16px'],
    [75, null, '15.75px'],
  ] as const)('lays 4 stages in a %i px list out with the text %s and %s bars', (height, textAt, bar) => {
    sized(600, 300, { width: 600, height });
    const { container } = draw(STAGES);
    expect(container.querySelectorAll('[class*="funnelLine"]')).toHaveLength(textAt === null ? 0 : 4);
    expect(container.querySelectorAll('[class*="funnelBeside"]')).toHaveLength(textAt === 'beside' ? 4 : 0);
    expect(bars(container)).toEqual(Array(4).fill(bar));
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
    const region = await screen.findByRole('region', { name: 'Data of Pull requests' });
    expect(await within(region).findByText('Approved', { selector: '[aria-current="true"]' })).toBeTruthy();
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


describe('radar_chart', () => {
  const POINTS: RadarData['points'] = [
    { axis: 'Mon', series: 'Web', value: 12 },
    { axis: 'Mon', series: 'API', value: 8 },
    { axis: 'Tue', series: 'Web', value: 7 },
    { axis: 'Tue', series: 'API', value: null },
    { axis: 'Wed', series: 'Web', value: 0 },
    { axis: 'Wed', series: 'API', value: 5 },
  ];
  const draw = (points: RadarData['points'], options: RadarRender = {}, extra: Extra = {}) =>
    render(<RadarChart payload={{ render: options, data: { points }, ...extra }} label="Commits" />);
  const axisTicks = (container: HTMLElement) => [...container.querySelectorAll('.recharts-polar-angle-axis-tick-value')].map((tick) => tick.textContent);
  const polygons = (container: HTMLElement) => [...container.querySelectorAll('.recharts-radar-polygon path')];
  const rowsOf = () => within(alternative('Commits')).getAllByRole('row', { hidden: true }).map((row) => [...row.children].map((cell) => cell.textContent));
  const radiusTicks = (container: HTMLElement) => [...container.querySelectorAll('.recharts-polar-radius-axis-tick-value')].map((tick) => tick.textContent);

  const sized = stubSizedObserver();

  it('draws one polygon per series in first-seen axis order, each in its series colour', () => {
    const { container } = draw(POINTS);
    expect(axisTicks(container)).toEqual(['Mon', 'Tue', 'Wed']);
    expect(polygons(container)).toHaveLength(2);
    expect(polygons(container).map((polygon) => polygon.getAttribute('fill'))).toEqual(['var(--color-s0)', 'var(--color-s1)']);
    // A gap of a null value draws no vertex: the API series, with no value on Tuesday, keeps three of four.
    const vertices = (polygon: Element) => (polygon.getAttribute('d') ?? '').match(/[ML]/g)?.length ?? 0;
    expect(polygons(container).map(vertices)).toEqual([4, 3]);
    // A zero value draws one at the centre: both stay inside the plot.
    expect(container.textContent).not.toMatch(/NaN|Infinity/);
  });

  it('draws the area at a low opacity by fill, and none with fill off, the stroke staying', () => {
    const filled = draw(POINTS);
    expect(polygons(filled.container).map((polygon) => polygon.getAttribute('fill-opacity'))).toEqual(['0.25', '0.25']);
    filled.unmount();
    const bare = draw(POINTS, { fill: false });
    expect(polygons(bare.container).map((polygon) => polygon.getAttribute('fill-opacity'))).toEqual(['0', '0']);
    expect(polygons(bare.container).map((polygon) => polygon.getAttribute('stroke'))).toEqual(['var(--color-s0)', 'var(--color-s1)']);
    bare.unmount();
  });

  it('names the series in a legend at the bottom or beside the plot; a single series draws none, and none hides it', () => {
    const named = draw(POINTS);
    expect(named.container.querySelector('.recharts-legend-wrapper')).not.toBeNull();
    named.unmount();
    const side = draw(POINTS, { legend_position: 'right' });
    expect(side.container.querySelector('.recharts-legend-wrapper')).not.toBeNull();
    expect(side.container.querySelector('[class*="legendSide"]')).not.toBeNull();
    side.unmount();
    const hidden = draw(POINTS, { legend_position: 'none' });
    expect(hidden.container.querySelector('.recharts-legend-wrapper')).toBeNull();
    hidden.unmount();
    const single = draw([{ axis: 'Mon', series: null, value: 3 }, { axis: 'Tue', series: null, value: 2 }, { axis: 'Wed', series: null, value: 1 }]);
    expect(single.container.querySelector('.recharts-legend-wrapper')).toBeNull();
    single.unmount();
  });

  it('names the unnamed series beside a named one by the texts, in the legend as in the data view', () => {
    const mixed = POINTS.map((point) => (point.series === 'API' ? { ...point, series: null } : point));
    const { container } = draw(mixed);
    expect([...container.querySelectorAll('.recharts-legend-wrapper [class*="legendItem"]')].map((item) => item.textContent)).toEqual(['Web', 'Series']);
    expect(rowsOf()[0]).toEqual(['Axis', 'Web', 'Series']);
  });

  it('writes the scale as bare numbers, the unit staying in the text alternative', () => {
    const { container } = draw(
      [{ axis: 'Mon', series: null, value: 80 }, { axis: 'Tue', series: null, value: 41 }, { axis: 'Wed', series: null, value: 8 }],
      {},
      { value_format: { value_type: 'number', unit_label: 'commits' } },
    );
    const ticks = radiusTicks(container);
    expect(ticks.length).toBeGreaterThan(1);
    expect(ticks.filter((tick) => tick?.includes('commits'))).toEqual([]);
    // The text alternative, which the data view shares its cells with, writes each delivered value with its unit.
    expect(rowsOf().slice(1).map((row) => row[1])).toEqual(['80\u00a0commits', '41\u00a0commits', '8\u00a0commits']);
  });

  it('takes scale_max as the top of the value axis, a larger value extending it, and rounds the largest value up without it', () => {
    const pinned = draw([{ axis: 'Mon', series: null, value: 93 }, { axis: 'Tue', series: null, value: 41 }, { axis: 'Wed', series: null, value: 8 }], { scale_max: 100 });
    expect(radiusTicks(pinned.container).at(-1)).toBe('100');
    pinned.unmount();
    // A value above scale_max extends the circle to that value: the outer circle is at least scale_max.
    const exceeded = draw([{ axis: 'Mon', series: null, value: 93 }, { axis: 'Tue', series: null, value: 41 }, { axis: 'Wed', series: null, value: 8 }], { scale_max: 50 });
    expect(radiusTicks(exceeded.container).at(-1)).toBe('93');
    exceeded.unmount();
    // Without it the axis takes the chart library's nice ticks over 0 to 9.3: five ticks 3 apart, the top one 12.
    const free = draw([{ axis: 'Mon', series: null, value: 9.3 }, { axis: 'Tue', series: null, value: 4.1 }, { axis: 'Wed', series: null, value: 8 }]);
    expect(radiusTicks(free.container)).toEqual(['0', '3', '6', '9', '12']);
    free.unmount();
    // A value already on a tick stays the top of the axis.
    const whole = draw([{ axis: 'Mon', series: null, value: 12 }, { axis: 'Tue', series: null, value: 4 }, { axis: 'Wed', series: null, value: 7 }]);
    expect(radiusTicks(whole.container).at(-1)).toBe('12');
    whole.unmount();
  });

  it('hides the axis labels of a cell of any height that cannot fit them, and keeps them in the text alternative', () => {
    const wide = [{ axis: 'Mon', series: null, value: 3 }, { axis: 'Wednesdays', series: null, value: 2 }, { axis: 'Fri', series: null, value: 1 }];
    // 300 by 195 px is compact and fits "Wednesdays" beside the circle: the labels stay.
    sized(300, 195);
    const fitted = draw(wide).container;
    expect(fitted.querySelectorAll('.recharts-polar-angle-axis-tick-value')).toHaveLength(3);
    cleanup();
    // A label that would not fit hides every label, in the drawing only.
    const longest = [{ axis: 'Mon', series: null, value: 3 }, { axis: 'Wednesday overflow', series: null, value: 2 }, { axis: 'Fri', series: null, value: 1 }];
    const hidden = draw(longest).container;
    expect(hidden.querySelectorAll('.recharts-polar-angle-axis-tick-value')).toHaveLength(0);
    expect(within(alternative('Commits')).getAllByRole('row', { hidden: true }).map((row) => row.children[0]?.textContent)).toEqual(['Axis', 'Mon', 'Wednesday overflow', 'Fri']);
    cleanup();
    // A high cell is judged the same way: in 300 by 300 px the circle takes most of the width, which leaves room
    // beside it for short labels and not for the 18 characters of "Wednesday overflow", which hide every label.
    sized(300, 300);
    const short = [{ axis: 'Mon', series: null, value: 3 }, { axis: 'Wed', series: null, value: 2 }, { axis: 'Fri', series: null, value: 1 }];
    expect(draw(short).container.querySelectorAll('.recharts-polar-angle-axis-tick-value')).toHaveLength(3);
    cleanup();
    expect(draw(longest).container.querySelectorAll('.recharts-polar-angle-axis-tick-value')).toHaveLength(0);
    expect(within(alternative('Commits')).getAllByRole('row', { hidden: true }).map((row) => row.children[0]?.textContent)).toEqual(['Axis', 'Mon', 'Wednesday overflow', 'Fri']);
  });

  it('keeps the axis labels of the demo radar on a phone, a chart 316 by 214 px over a bottom legend 28 px high', () => {
    // Seven weekdays and three series: the circle, radius 70.4 px, sits in the middle of the chart, so the labels have
    // 36.6 px above it, and by this geometry the lowest ones end at about 190.4 px, 2.6 px clear of the legend's entries
    // at 193 px, in the legend's own top padding (a browser measure of the drawn chart gave about 4 px).
    const week = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].flatMap((axis) => ['payments-api', 'web-console', 'mobile-app'].map((series, index) => ({ axis, series, value: index + 1 })));
    const rect = Element.prototype.getBoundingClientRect;
    vi.spyOn(Element.prototype, 'getBoundingClientRect').mockImplementation(function (this: Element) {
      return this.classList.contains('recharts-legend-wrapper') ? ({ width: 306, height: 28, top: 0, left: 0, right: 306, bottom: 28, x: 0, y: 0 } as DOMRect) : rect.call(this);
    });
    sized(316, 214);
    expect(draw(week).container.querySelectorAll('.recharts-polar-angle-axis-tick-value')).toHaveLength(7);
  });

  it('judges the fit of the axis labels from the plot area the legend leaves, around the circle centred in the whole chart', () => {
    // A 300 by 195 px chart with a legend 40 px high leaves a plot area 290 by 145 px: a circle of radius 58 centred at
    // 97.5 px from the top of the whole chart. A label needs 80 px above the centre (58 + 22) and, for four axes, 80 px
    // under it; for three axes the lowest vertex is 29 px under the centre, so 51 px.
    const twoSeries = (axes: string[]) => axes.flatMap((axis) => [{ axis, series: 'Web', value: 3 }, { axis, series: 'API', value: 2 }]);
    const wide = twoSeries(['Mon', 'Wednesdays', 'Fri', 'Sun']);
    const rect = Element.prototype.getBoundingClientRect;
    vi.spyOn(Element.prototype, 'getBoundingClientRect').mockImplementation(function (this: Element) {
      return this.classList.contains('recharts-legend-wrapper') ? ({ width: 290, height: 40, top: 0, left: 0, right: 290, bottom: 40, x: 0, y: 0 } as DOMRect) : rect.call(this);
    });
    sized(300, 195);
    expect(draw(wide, { legend_position: 'none' }).container.querySelectorAll('.recharts-polar-angle-axis-tick-value')).toHaveLength(4);
    cleanup();
    // A bottom legend leaves 64.5 px under the centre, down to its top padding, short of the 80 px the axis pointing
    // down needs; the 97.5 px above and the 150 px beside (133 px needed for "Wednesdays") would hold the labels.
    expect(draw(wide, { legend_position: 'bottom' }).container.querySelectorAll('.recharts-polar-angle-axis-tick-value')).toHaveLength(0);
    cleanup();
    // Three axes over the same bottom legend: the 97.5 px above the circle's centre hold the 80 px the label pointing up
    // needs. Centred in the plot area instead, the circle would leave only 77.5 px above it, and hide the labels.
    expect(draw(twoSeries(['Mon', 'Wed', 'Fri']), { legend_position: 'bottom' }).container.querySelectorAll('.recharts-polar-angle-axis-tick-value')).toHaveLength(3);
    cleanup();
    // A top legend leaves 64.5 px above the centre, down from its bottom padding, short of the 80 px the label pointing
    // up needs, while the 97.5 px under the centre and the 150 px beside (87.5 px needed) would hold the labels.
    expect(draw(twoSeries(['Mon', 'Wed', 'Fri', 'Sun']), { legend_position: 'top' }).container.querySelectorAll('.recharts-polar-angle-axis-tick-value')).toHaveLength(0);
  });

  it('never counts a legend lower than its own padding as room for the axis labels', () => {
    // A 300 by 150 px chart with a top legend 3 px high leaves a plot area 290 by 137 px: a circle of radius 54.8 centred
    // at 75 px from the top. The label pointing up needs 76.8 px above the centre, short of the 75 px there; the legend's
    // 12 px padding is taller than the legend itself and adds no room, so the labels hide.
    const twoSeries = (axes: string[]) => axes.flatMap((axis) => [{ axis, series: 'Web', value: 3 }, { axis, series: 'API', value: 2 }]);
    const rect = Element.prototype.getBoundingClientRect;
    vi.spyOn(Element.prototype, 'getBoundingClientRect').mockImplementation(function (this: Element) {
      return this.classList.contains('recharts-legend-wrapper') ? ({ width: 290, height: 3, top: 0, left: 0, right: 290, bottom: 3, x: 0, y: 0 } as DOMRect) : rect.call(this);
    });
    sized(300, 150);
    expect(draw(twoSeries(['Mon', 'Wed', 'Fri']), { legend_position: 'top' }).container.querySelectorAll('.recharts-polar-angle-axis-tick-value')).toHaveLength(0);
  });

  it('fails the cell on a negative value, naming its position and never its value', () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => {});
    draw([{ axis: 'Mon', series: 'Web', value: 3 }, { axis: 'Tue', series: 'Web', value: -1 }, { axis: 'Wed', series: 'Web', value: 2 }]);
    expect(screen.getByText('This widget cannot be shown')).toBeTruthy();
    expect(error).toHaveBeenCalledWith('[widget] radar_chart: data.points[1].value is below 0');
    expect(String(error.mock.calls[0][0])).not.toContain('1 is');
    expect(checkRadar({ points: [{ axis: 'Mon', series: null, value: 0 }, { axis: 'Tue', series: null, value: null }, { axis: 'Wed', series: null, value: 1 }] })).toBeNull();
  });

  // A radar takes five series at most, as more overlapping polygons stop being readable; the distinct colours
  // themselves are covered by 'draws one polygon per series in first-seen axis order'.
  it('fails the cell on more than 12 axes or 5 series, naming the point that crosses the bound', () => {
    const axes = Array.from({ length: 13 }, (_, index) => ({ axis: `a${index}`, series: null, value: 1 }));
    expect(checkRadar({ points: axes })).toBe('radar_chart: data.points[12].axis would be a 13th axis, and a radar takes at most 12');
    const fives = Array.from({ length: 5 }, (_, index) => ({ axis: ['Mon', 'Tue', 'Wed'][index % 3], series: `s${index}`, value: 1 }));
    expect(checkRadar({ points: [...fives] })).toBeNull();
    expect(checkRadar({ points: [...fives, { axis: 'Mon', series: 's5', value: 1 }] })).toBe('radar_chart: data.points[5].series would be a 6th series, and a radar takes at most 5');
  });

  it('fails the cell on a point that repeats the axis and the series of an earlier one, naming its position and never its value', () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => {});
    draw([...POINTS, { axis: 'Tue', series: 'Web', value: 99 }]);
    expect(screen.getByText('This widget cannot be shown')).toBeTruthy();
    expect(error).toHaveBeenCalledWith('[widget] radar_chart: data.points[6] repeats the axis and the series of an earlier point');
    expect(String(error.mock.calls[0][0])).not.toContain('99');
    // The unnamed series is one series: two of its points on one axis repeat as well.
    expect(checkRadar({ points: [{ axis: 'Mon', series: null, value: 1 }, { axis: 'Tue', series: null, value: 2 }, { axis: 'Wed', series: null, value: 3 }, { axis: 'Mon', series: null, value: 4 }] })).toBe(
      'radar_chart: data.points[3] repeats the axis and the series of an earlier point',
    );
    // The unnamed series and a series named "null" are two series: one point of each on one axis repeats nothing.
    expect(checkRadar({ points: [{ axis: 'Mon', series: null, value: 1 }, { axis: 'Mon', series: 'null', value: 2 }, { axis: 'Tue', series: null, value: 3 }, { axis: 'Wed', series: null, value: 3 }] })).toBeNull();
    // One axis with two series, or one series on two axes, repeats nothing.
    expect(checkRadar({ points: [{ axis: 'Mon', series: null, value: 1 }, { axis: 'Mon', series: 'Web', value: 2 }, { axis: 'Tue', series: null, value: 3 }, { axis: 'Wed', series: null, value: 3 }] })).toBeNull();
  });

  it('fails the cell on fewer than 3 distinct axes, which draw a dot or a line and no polygon', () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => {});
    // Three points on two axes: the schema counts the points, the widget counts the axes.
    draw([{ axis: 'Mon', series: 'Web', value: 3 }, { axis: 'Tue', series: 'Web', value: 2 }, { axis: 'Mon', series: 'API', value: 1 }]);
    expect(screen.getByText('This widget cannot be shown')).toBeTruthy();
    expect(error).toHaveBeenCalledWith('[widget] radar_chart: data.points has 2 distinct axes, and a radar takes at least 3');
    expect(checkRadar({ points: [{ axis: 'Mon', series: null, value: 1 }, { axis: 'Mon', series: 'API', value: 2 }, { axis: 'Mon', series: 'Web', value: 3 }] })).toBe('radar_chart: data.points has 1 distinct axis, and a radar takes at least 3');
    expect(checkRadar({ points: [{ axis: 'Mon', series: null, value: 1 }, { axis: 'Tue', series: null, value: 2 }, { axis: 'Wed', series: null, value: 3 }] })).toBeNull();
  });

  it.each([
    ['all zero', [{ axis: 'Mon', series: null, value: 0 }, { axis: 'Tue', series: null, value: 0 }, { axis: 'Wed', series: null, value: 0 }]],
    ['all null', [{ axis: 'Mon', series: null, value: null }, { axis: 'Tue', series: null, value: null }, { axis: 'Wed', series: null, value: null }]],
    ['zero and null', [{ axis: 'Mon', series: null, value: 0 }, { axis: 'Tue', series: null, value: null }, { axis: 'Wed', series: null, value: null }]],
  ])('shows the empty state when the values are %s', (_name, points) => {
    draw(points);
    expect(screen.getByText('No data to show')).toBeTruthy();
  });

  it('is a figure named by its label, with a text alternative of every axis and series, formatted by value_format', () => {
    draw(POINTS, {}, { value_format: { value_type: 'number', decimals: 0 } });
    expect(screen.getByRole('figure', { name: 'Commits' })).toBeTruthy();
    expect(rowsOf()).toEqual([
      ['Axis', 'Web', 'API'],
      ['Mon', '12', '8'],
      ['Tue', '7', ''],
      ['Wed', '0', '5'],
    ]);
  });

  it('takes its axis heading and the headings of unnamed series from the texts', () => {
    const texts: WidgetTexts = { ...DEFAULT_WIDGET_TEXTS, chart: 'Diagramm', columns: { ...DEFAULT_WIDGET_TEXTS.columns, series: 'Reihe' }, radar: { axis: 'Achse' } };
    render(<RadarChart payload={{ render: {}, data: { points: [{ axis: 'Mon', series: null, value: 3 }, { axis: 'Tue', series: null, value: 2 }, { axis: 'Wed', series: null, value: 1 }] } }} texts={texts} />);
    expect(within(alternative('Diagramm')).getAllByRole('columnheader', { hidden: true }).map((cell) => cell.textContent)).toEqual(['Achse', 'Reihe']);
  });

  it('opens the data view from the button, with every delivered value, and from a click on a point with drill_down', async () => {
    const user = userEvent.setup();
    const { unmount } = draw(POINTS, { drill_down: true });
    await user.click(screen.getByRole('button', { name: 'Show data' }));
    const region = await screen.findByRole('region', { name: 'Data of Commits' });
    expect(within(region).getAllByRole('row', { hidden: true }).length).toBeGreaterThan(3);
    unmount();
    cleanup();
    // A click near the first axis' vertex opens its row. The vertex stands above the centre of a 600 by 300 px plot.
    const picked = draw(POINTS, { drill_down: true });
    const wrapper = picked.container.querySelector('.recharts-wrapper')!;
    fireEvent.mouseMove(wrapper, { clientX: 300, clientY: 92, pageX: 300, pageY: 92 });
    // Recharts settles its tooltip state after the move, and the click reads it: wait until the tooltip shows a row.
    await waitFor(() => expect(picked.container.querySelector('.recharts-tooltip-wrapper [class*="tooltipRow"]')).not.toBeNull());
    fireEvent.click(wrapper, { clientX: 300, clientY: 92, pageX: 300, pageY: 92 });
    const opened = await screen.findByRole('region', { name: 'Data of Commits' });
    expect(await within(opened).findByText('Mon', { selector: '[aria-current="true"]' })).toBeTruthy();
  });

  it('leaves out of the tooltip the entry of a series with a gap at the hovered axis', async () => {
    // Tuesday's spoke points down and to the right of the centre of a 600 by 300 px plot; the API series has a null
    // value there, and with its Tuesday point left out no point at all.
    for (const points of [POINTS, POINTS.filter((point) => !(point.axis === 'Tue' && point.series === 'API'))]) {
      cleanup();
      const { container } = draw(points);
      fireEvent.mouseMove(container.querySelector('.recharts-wrapper')!, { clientX: 343, clientY: 175, pageX: 343, pageY: 175 });
      const entries = () => [...container.querySelectorAll('.recharts-tooltip-wrapper [class*="tooltipRow"]')].map((row) => row.textContent);
      await waitFor(() => expect(entries()).not.toEqual([]));
      expect(entries()).toEqual(['Web7']);
    }
  });

  it('draws no data view button and no clickable chart with drill-down off', () => {
    const { container } = draw(POINTS);
    expect(screen.queryByRole('button', { name: 'Show data' })).toBeNull();
    expect(container.querySelector('[class*="clickable"]')).toBeNull();
  });
});

describe('treemap_chart', () => {
  const ITEMS: TreemapData['items'] = [
    { label: 'payments-api', value: 420, group: null },
    { label: 'web-console', value: 260, group: null },
    { label: 'mobile-app', value: 140, group: null },
  ];
  const draw = (items: TreemapData['items'], options: TreemapRender = {}, extra: Extra = {}) =>
    render(<TreemapChart payload={{ render: options, data: { items }, ...extra }} label="Commits" />);
  const rowsOf = () => within(alternative('Commits')).getAllByRole('row', { hidden: true }).map((row) => [...row.children].map((cell) => cell.textContent));
  const tiles = (container: HTMLElement) => [...container.querySelectorAll<HTMLElement>('[class*="treemapTile"]')];
  const heads = (container: HTMLElement) => [...container.querySelectorAll<HTMLElement>('[class*="treemapGroupHead"]')];
  const faces = (container: HTMLElement) => [...container.querySelectorAll<HTMLElement>('[class*="treemapGroupFace"]')];
  const boxOf = (element: HTMLElement) => ['left', 'top', 'width', 'height'].map((side) => Number.parseFloat(element.style[side as 'left']));
  const ratioOf = ([, , width, height]: number[]) => Math.max(width / height, height / width);
  // Every rendered tile lies inside its box of width by height, and no two overlap.
  const expectTiled = (boxes: number[][], width: number, height: number) => {
    for (const [left, top, w, h] of boxes) {
      expect(left).toBeGreaterThanOrEqual(-1e-6);
      expect(top).toBeGreaterThanOrEqual(-1e-6);
      expect(left + w).toBeLessThanOrEqual(width + 1e-6);
      expect(top + h).toBeLessThanOrEqual(height + 1e-6);
    }
    for (const [a, b] of boxes.flatMap((first, index) => boxes.slice(index + 1).map((second) => [first, second] as const))) {
      const across = Math.min(a[0] + a[2], b[0] + b[2]) - Math.max(a[0], b[0]);
      const down = Math.min(a[1] + a[3], b[1] + b[3]) - Math.max(a[1], b[1]);
      expect(across <= 1e-6 || down <= 1e-6).toBe(true);
    }
  };
  const expectBoxes = (got: number[][], want: number[][]) => {
    expect(got).toHaveLength(want.length);
    for (const [index, box] of got.entries()) for (const [side, value] of box.entries()) expect(value).toBeCloseTo(want[index][side], 6);
  };

  const sized = stubSizedObserver();

  it('lays the values out squarified: the whole box for one, squares for four equals, no tile in a box without room', () => {
    sized(100, 50);
    expectBoxes(tiles(draw([{ label: 'a', value: 7, group: null }]).container).map(boxOf), [[0, 0, 100, 50]]);
    cleanup();
    sized(100, 100);
    const four = draw([1, 2, 3, 4].map((at) => ({ label: `v${at}`, value: 1, group: null })));
    expectBoxes(tiles(four.container).map(boxOf), [
      [0, 0, 50, 50],
      [50, 0, 50, 50],
      [0, 50, 50, 50],
      [50, 50, 50, 50],
    ]);
    cleanup();
    // A box without room draws no tile, like a value of 0, and keeps every item in the text alternative.
    sized(0, 100);
    expect(tiles(draw(ITEMS).container)).toHaveLength(0);
  });

  it('gives every tile the area of its value over the total, and covers the box with no overlap', () => {
    sized(320, 200);
    const values = [12, 7, 5, 3, 2, 1, 1];
    const boxes = tiles(draw(values.map((value, at) => ({ label: `v${at}`, value, group: null }))).container).map(boxOf);
    const total = values.reduce((sum, value) => sum + value, 0);
    for (const [index, [, , width, height]] of boxes.entries()) expect(width * height).toBeCloseTo((values[index] * 320 * 200) / total, 6);
    expect(boxes.reduce((sum, [, , width, height]) => sum + width * height, 0)).toBeCloseTo(320 * 200, 6);
    expectTiled(boxes, 320, 200);
  });

  it('lays each row across the shorter side, as Bruls, Huizing and van Wijk do: the textbook case keeps its worst aspect ratio under 3', () => {
    // The paper's values 6, 6, 4, 3, 2, 2, 1 in a 6 by 4 box (here 600 by 400): rows across the shorter side give a
    // worst aspect ratio of 2.78; rows across the longer side would leave a 36:1 sliver.
    sized(600, 400);
    const boxes = tiles(draw([6, 6, 4, 3, 2, 2, 1].map((value, at) => ({ label: `v${at}`, value, group: null }))).container).map(boxOf);
    expect(boxes).toHaveLength(7);
    expect(Math.max(...boxes.map(ratioOf))).toBeCloseTo(25 / 9, 6);
    expectBoxes(boxes.slice(0, 2), [
      [0, 0, 300, 200],
      [0, 200, 300, 200],
    ]);
  });

  it('keeps the aspect ratios low over random sorted sets, as the rendered tiles show', () => {
    // A fixed generator (the Park and Miller minimal standard), so the sets are the same on every run.
    let seed = 7;
    const next = () => (seed = (seed * 48271) % 2147483647) / 2147483647;
    sized(578, 222);
    const ratios: number[] = [];
    for (let set = 0; set < 40; set += 1) {
      const values = Array.from({ length: 12 }, () => 1 + Math.floor(next() * 100)).sort((a, b) => b - a);
      const boxes = tiles(draw(values.map((value, at) => ({ label: `v${at}`, value, group: null }))).container).map(boxOf);
      expect(boxes).toHaveLength(12);
      expectTiled(boxes, 578, 222);
      ratios.push(...boxes.map(ratioOf));
      cleanup();
    }
    expect(ratios.reduce((sum, ratio) => sum + ratio, 0) / ratios.length).toBeLessThan(2);
    expect(Math.max(...ratios)).toBeLessThan(25);
  });

  it('lays the same tiles out whatever order the items are delivered in, and keeps the delivered order for colours and views', async () => {
    const user = userEvent.setup();
    sized(600, 400);
    const items: TreemapData['items'] = [
      { label: 'p', value: 3, group: null },
      { label: 'q', value: 6, group: null },
      { label: 'r', value: 1, group: null },
      { label: 's', value: 4, group: null },
      { label: 't', value: 2, group: null },
    ];
    // Squarified assumes the values descending: the same items delivered unsorted lay out the same tile for each
    // of them as the same items delivered largest first.
    const boxesOf = (entries: TreemapData['items']) => {
      const { container, unmount } = draw(entries);
      const boxes = new Map(tiles(container).map((tile) => [tile.getAttribute('aria-label')!.split(':')[0]!, boxOf(tile)]));
      unmount();
      cleanup();
      return boxes;
    };
    const unsorted = boxesOf(items);
    const sorted = boxesOf([...items].sort((one, other) => (other.value ?? 0) - (one.value ?? 0)));
    expect([...unsorted.keys()]).toEqual(['p', 'q', 'r', 's', 't']);
    for (const [name, box] of unsorted) for (const [side, value] of box.entries()) expect(value).toBeCloseTo(sorted.get(name)![side], 6);
    // The delivered order stays for the colours, the text alternative and the data view, whatever the sizes are.
    const { container } = draw(items, { drill_down: true });
    expect(tiles(container).map((tile) => tile.style.getPropertyValue('--tile'))).toEqual([seriesColor(0), seriesColor(1), seriesColor(2), seriesColor(3), seriesColor(4)]);
    expect(rowsOf().slice(1).map((row) => row[0])).toEqual(['p', 'q', 'r', 's', 't']);
    await user.click(screen.getByRole('button', { name: 'Show data' }));
    const region = await screen.findByRole('region', { name: 'Data of Commits' });
    expect(within(region).getAllByRole('row', { hidden: true }).slice(1).map((row) => row.children[0]?.textContent)).toEqual(['p', 'q', 'r', 's', 't']);
  });

  it('draws one tile per positive item, as large as its value over the total, in the delivered order and palette colour', () => {
    sized(200, 100);
    const { container } = draw([
      { label: 'a', value: 3, group: null },
      { label: 'b', value: 1, group: null },
    ]);
    expect(tiles(container)).toHaveLength(2);
    expectBoxes(
      tiles(container).map(boxOf),
      [
        [0, 0, 150, 100],
        [150, 0, 50, 100],
      ],
    );
    expect(tiles(container).map((tile) => tile.getAttribute('data-share'))).toEqual(['75', '25']);
    // The delivered order of a treemap of many: the tiles come in the items' order, the first item's tile first in
    // the layout, at the box's corner.
    cleanup();
    const many = tiles(draw(ITEMS).container);
    expect(many.map((tile) => tile.getAttribute('aria-label'))).toEqual(['payments-api: 420', 'web-console: 260', 'mobile-app: 140']);
    expect(boxOf(many[0]).slice(0, 2)).toEqual([0, 0]);
  });

  it('keeps every tile at its slot: a tile too small for text draws no text box, and nothing leaves the box', () => {
    sized(200, 100);
    const { container } = draw([
      { label: 'large', value: 100, group: null },
      { label: 'tiny', value: 1, group: null },
    ]);
    const [large, tiny] = tiles(container);
    // A sliver of under 2 px: it writes nothing, so its box is all it has (no text with padding inside it).
    expect(boxOf(tiny)[2]).toBeCloseTo((200 * 1) / 101, 6);
    expect(tiny.children).toHaveLength(0);
    expect(large.querySelector('[class*="treemapText"]')).not.toBeNull();
    expectTiled(tiles(container).map(boxOf), 200, 100);
    cleanup();
    // 60 small items in a small box: every tile still inside its slot and no two overlapping.
    sized(240, 120);
    const crowd = tiles(draw(Array.from({ length: 60 }, (_, at) => ({ label: `item ${at}`, value: 60 - at, group: null }))).container).map(boxOf);
    expect(crowd).toHaveLength(60);
    expectTiled(crowd, 240, 120);
  });

  it('draws no tile for a positive value whose area scales to 0, and keeps it in the data view', () => {
    const { container } = draw([
      { label: 'huge', value: 1e308, group: null },
      { label: 'tiny', value: 5e-324, group: null },
    ]);
    expect(tiles(container)).toHaveLength(1);
    expect(boxOf(tiles(container)[0]).every(Number.isFinite)).toBe(true);
    expect(rowsOf().slice(1).map((row) => row[0])).toEqual(['huge', 'tiny']);
  });

  it('draws no tile for the item the rows before it leave no room for, in a wide box and a tall one', () => {
    // 1e-20 beside 1 keeps an area above 0, but the first row takes the whole box once rounded, so no room is left.
    const items: TreemapData['items'] = [
      { label: 'huge', value: 1, group: null },
      { label: 'tiny', value: 1e-20, group: null },
    ];
    sized(600, 300);
    expect(tiles(draw(items).container).map(boxOf)).toEqual([[0, 0, 600, 300]]);
    cleanup();
    sized(300, 600);
    expect(tiles(draw(items).container).map(boxOf)).toEqual([[0, 0, 300, 600]]);
    // A group the rows before it leave no room for draws no face either, and its item stays in the text alternative.
    cleanup();
    sized(600, 300);
    const grouped = draw([
      { label: 'huge', value: 1, group: 'Big' },
      { label: 'tiny', value: 1e-20, group: 'Small' },
    ]);
    expect(faces(grouped.container)).toHaveLength(1);
    expect(tiles(grouped.container)).toHaveLength(1);
  });

  it('draws no tile at all for the item the rows before it leave no room for, and keeps it in the text alternative', () => {
    // The same 1e-20 beside 1: with drill_down the tile would be a button, and an item with no room must leave
    // neither a button nor an image behind, while the text alternative still lists it.
    sized(600, 300);
    const { container } = draw(
      [
        { label: 'huge', value: 1, group: null },
        { label: 'tiny', value: 1e-20, group: null },
      ],
      { drill_down: true },
    );
    expect(within(container).queryByRole('img', { name: /^tiny:/ })).toBeNull();
    expect(within(container).queryByRole('button', { name: /^tiny:/ })).toBeNull();
    expect(within(container).getByRole('button', { name: /^huge:/ })).toBeTruthy();
    expect(rowsOf().slice(1).map((row) => row[0])).toEqual(['huge', 'tiny']);
  });

  it('names every tile and its value whatever the tile shows, and colours it by its palette place', () => {
    const { container } = draw(ITEMS);
    expect(tiles(container).map((tile) => tile.getAttribute('aria-label'))).toEqual(['payments-api: 420', 'web-console: 260', 'mobile-app: 140']);
    expect(tiles(container).map((tile) => tile.getAttribute('title'))).toEqual(['payments-api: 420', 'web-console: 260', 'mobile-app: 140']);
    expect(tiles(container).map((tile) => tile.style.getPropertyValue('--tile'))).toEqual([seriesColor(0), seriesColor(1), seriesColor(2)]);
  });

  it('formats the values with value_format, in the tiles and the text alternative', () => {
    const { container } = draw(ITEMS, {}, { value_format: { value_type: 'number', unit_label: 'commits' } });
    expect(tiles(container).map((tile) => tile.querySelector('[class*="treemapValue"]')?.textContent)).toEqual([
      '420\u00a0commits',
      '260\u00a0commits',
      '140\u00a0commits',
    ]);
    expect(rowsOf()).toEqual([
      ['Label', 'Value'],
      ['payments-api', '420\u00a0commits'],
      ['web-console', '260\u00a0commits'],
      ['mobile-app', '140\u00a0commits'],
    ]);
  });

  it('fails the cell on a negative value, naming its position and never its value', () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => {});
    draw([
      { label: 'a', value: 3, group: null },
      { label: 'b', value: -1, group: null },
    ]);
    expect(screen.getByText('This widget cannot be shown')).toBeTruthy();
    expect(error).toHaveBeenCalledWith('[widget] treemap_chart: data.items[1].value is below 0');
    expect(String(error.mock.calls[0][0])).not.toContain('1 is');
    expect(checkTreemap({ items: [{ label: 'a', value: 0, group: null }, { label: 'b', value: null, group: null }] })).toBeNull();
    expect(checkTreemap({ items: [{ label: 'a', value: 2, group: null }] })).toBeNull();
  });

  it.each([
    ['all zero', [{ label: 'a', value: 0, group: null }, { label: 'b', value: 0, group: null }]],
    ['all null', [{ label: 'a', value: null, group: null }, { label: 'b', value: null, group: null }]],
    ['zero and null', [{ label: 'a', value: 0, group: null }, { label: 'b', value: null, group: null }]],
  ])('shows the empty state when the values are %s', (_name, items) => {
    draw(items);
    expect(screen.getByText('No data to show')).toBeTruthy();
  });

  it('draws no tile for a value of 0 or null, and keeps the item in the data view', () => {
    const { container } = draw([
      { label: 'a', value: 3, group: null },
      { label: 'b', value: 0, group: null },
      { label: 'c', value: null, group: null },
      { label: 'd', value: 1, group: null },
    ]);
    expect(tiles(container)).toHaveLength(2);
    expect(rowsOf()).toHaveLength(5);
    expect(rowsOf().slice(1).map((row) => row[0])).toEqual(['a', 'b', 'c', 'd']);
  });

  it('keeps a group literally named "Other" apart from the items without a group', () => {
    const { container } = draw([
      { label: 'a', value: 2, group: 'Other' },
      { label: 'b', value: 1, group: null },
    ]);
    expect(faces(container)).toHaveLength(2);
    expect(faces(container).map((face) => face.style.getPropertyValue('--tile'))).toEqual([seriesColor(0), seriesColor(1)]);
    expect(tiles(container).map((tile) => tile.style.getPropertyValue('--tile'))).toEqual([seriesColor(0), seriesColor(1)]);
    expect(tiles(container).map((tile) => tile.getAttribute('data-share'))).toEqual(['66.67', '33.33']);
  });

  it('nests the items one level by group in first-seen order, a null group under the widget text "Other"', () => {
    sized(400, 200);
    const { container } = draw([
      { label: 'a', value: 4, group: 'Web' },
      { label: 'b', value: 3, group: null },
      { label: 'c', value: 2, group: 'Web' },
      { label: 'd', value: 1, group: 'Data' },
    ]);
    // The groups keep their first-seen order, each header writing its name and total.
    expect(heads(container).map((head) => head.textContent)).toEqual(['Web · 6', 'Other · 3', 'Data · 1']);
    expect(heads(container).map((head) => head.getAttribute('title'))).toEqual(['Web: 6', 'Other: 3', 'Data: 1']);
    expect(faces(container)).toHaveLength(3);
    expect(faces(container).map((face) => face.style.getPropertyValue('--tile'))).toEqual([seriesColor(0), seriesColor(1), seriesColor(2)]);
    // Every tile sits inside its group's face, in that group's colour.
    for (const face of faces(container)) {
      const [left, top, width, height] = boxOf(face);
      const inside = tiles(container).filter((tile) => {
        const [x, y] = boxOf(tile);
        return x >= left && y >= top && x < left + width && y < top + height;
      });
      expect(inside.length).toBeGreaterThan(0);
      expect(new Set(inside.map((tile) => tile.style.getPropertyValue('--tile')))).toEqual(new Set([face.style.getPropertyValue('--tile')]));
    }
    expect(tiles(container).map((tile) => tile.getAttribute('title'))).toEqual(['a: 4, Web', 'c: 2, Web', 'b: 3, Other', 'd: 1, Data']);
    expect(tiles(container).map((tile) => tile.getAttribute('data-share'))).toEqual(['40', '20', '30', '10']);
  });

  it('hides a group header that does not fit its group box, keeping the group in the tile tooltips', () => {
    sized(120, 100);
    const { container } = draw([
      { label: 'a', value: 1, group: 'A group with a long name' },
      { label: 'b', value: 1, group: 'Web' },
    ]);
    expect(heads(container).map((head) => head.textContent)).toEqual(['Web']);
    expect(faces(container)).toHaveLength(2);
    expect(tiles(container).at(0)?.getAttribute('title')).toBe('a: 1, A group with a long name');
  });

  it('writes the label and value of a tile where they fit by value_labels, and hides what does not', () => {
    sized(120, 160);
    const items: TreemapData['items'] = [
      { label: 'Long label here', value: 3, group: null },
      { label: 'x', value: 1, group: null },
    ];
    const { container } = draw(items);
    // The first tile of 120 by 120 is narrower than its label (an estimated 128 px with its padding): the label is
    // written for the styles to cut, and the value fits under it. The second of 120 by 40 fits the label's line and
    // padding (32 px) but not the value's second line (50 px).
    expect(tiles(container).map((tile) => tile.querySelector('[class*="treemapLabel"]')?.textContent ?? null)).toEqual(['Long label here', 'x']);
    expect(tiles(container).map((tile) => tile.querySelector('[class*="treemapValue"]')?.textContent ?? null)).toEqual(['3', null]);
    // The tooltip and the text alternative keep both anyway.
    expect(tiles(container).at(0)?.getAttribute('title')).toBe('Long label here: 3');
    expect(rowsOf().slice(1)).toEqual([
      ['Long label here', '3'],
      ['x', '1'],
    ]);
    cleanup();
    // A second tile of 120 by 30 is too low for even the label's line with its padding.
    sized(120, 120);
    expect(tiles(draw(items).container).map((tile) => tile.querySelector('[class*="treemapLabel"]')?.textContent ?? null)).toEqual(['Long label here', null]);
    cleanup();
    sized(600, 300);
    const wide = draw(items).container;
    expect(tiles(wide).map((tile) => tile.querySelector('[class*="treemapLabel"]')?.textContent)).toEqual(['Long label here', 'x']);
    expect(tiles(wide).map((tile) => tile.querySelector('[class*="treemapValue"]')?.textContent)).toEqual(['3', '1']);
    cleanup();
    // `always` writes both whatever the tile fits, `never` neither; the text alternative keeps every value.
    const always = draw(items, { value_labels: 'always' }).container;
    expect(tiles(always).map((tile) => tile.querySelector('[class*="treemapLabel"]')?.textContent)).toEqual(['Long label here', 'x']);
    expect(tiles(always).map((tile) => tile.querySelector('[class*="treemapValue"]')?.textContent)).toEqual(['3', '1']);
    cleanup();
    const never = draw(items, { value_labels: 'never' }).container;
    expect(never.querySelectorAll('[class*="treemapLabel"], [class*="treemapValue"]')).toHaveLength(0);
    expect(rowsOf().slice(1)).toEqual([
      ['Long label here', '3'],
      ['x', '1'],
    ]);
  });

  it('sets the room the fit arithmetic counts around the text on the box, for the styles to draw: 8 px of padding and a 2 px line gap', () => {
    sized(120, 160);
    const box = tiles(draw(ITEMS).container)[0].parentElement!;
    expect(box.style.getPropertyValue('--treemap-pad')).toBe('8px');
    expect(box.style.getPropertyValue('--treemap-gap')).toBe('2px');
  });

  it('writes the share of the total beside the value and in the tooltip with show_share, like other percents', () => {
    const { container } = draw(
      [
        { label: 'a', value: 3, group: null },
        { label: 'b', value: 1, group: null },
      ],
      { show_share: true },
    );
    expect(tiles(container).map((tile) => tile.querySelector('[class*="treemapShare"]')?.textContent)).toEqual(['75%', '25%']);
    expect(tiles(container).map((tile) => tile.getAttribute('title'))).toEqual(['a: 3, 75% of the total', 'b: 1, 25% of the total']);
    cleanup();
    // Without show_share no share is written anywhere, and the text alternative has no share column.
    expect(draw([{ label: 'a', value: 3, group: null }, { label: 'b', value: 1, group: null }]).container.querySelectorAll('[class*="treemapShare"]')).toHaveLength(0);
    expect(rowsOf()[0]).toEqual(['Label', 'Value']);
  });

  it('adds a share column to the text alternative and the data view with show_share, a null value without a share', async () => {
    const user = userEvent.setup();
    const items: TreemapData['items'] = [
      { label: 'a', value: 3, group: null },
      { label: 'b', value: null, group: null },
      { label: 'c', value: 1, group: null },
    ];
    const { unmount } = draw(items, { show_share: true, drill_down: true });
    // A null value and its share render as empty cells.
    expect(rowsOf()).toEqual([
      ['Label', 'Value', 'Share'],
      ['a', '3', '75%'],
      ['b', '', ''],
      ['c', '1', '25%'],
    ]);
    await user.click(screen.getByRole('button', { name: 'Show data' }));
    const region = await screen.findByRole('region', { name: 'Data of Commits' });
    expect(within(region).getAllByRole('columnheader').map((cell) => cell.textContent)).toEqual(['Label', 'Value', 'Share']);
    expect(within(region).getByText('75%')).toBeTruthy();
    unmount();
  });

  it('writes a group header with its total, and its share with show_share, while they fit; the name alone where only it fits', () => {
    sized(600, 300);
    const items: TreemapData['items'] = [
      { label: 'a', value: 4, group: 'Web' },
      { label: 'b', value: 2, group: 'Web' },
      { label: 'c', value: 3, group: 'Data' },
      { label: 'd', value: 1, group: 'Data' },
    ];
    const { container } = draw(items, { show_share: true });
    expect(heads(container).map((head) => head.textContent)).toEqual(['Web · 6 60%', 'Data · 4 40%']);
    expect(heads(container).map((head) => head.querySelector('[class*="treemapShare"]')?.textContent)).toEqual(['60%', '40%']);
    // The header is a flex box, which drops the spaces at the edges of its text runs: the text stands in one inline
    // run, so the spaces around the separator stay.
    expect(heads(container).map((head) => [head.childNodes.length, head.firstElementChild?.textContent])).toEqual([
      [1, 'Web · 6 60%'],
      [1, 'Data · 4 40%'],
    ]);
    cleanup();
    expect(heads(draw(items).container).map((head) => head.textContent)).toEqual(['Web · 6', 'Data · 4']);
    cleanup();
    // A box whose group faces fit the names but not the totals: the names alone.
    sized(50, 300);
    expect(heads(draw(items).container).map((head) => head.textContent)).toEqual(['Web', 'Data']);
  });

  it('writes only the share in a group header whose total is past the largest number, in its text and its title', () => {
    sized(600, 300);
    // Two finite values whose sum is not finite: the header and its title leave the total out, not an empty one.
    const { container } = draw(
      [
        { label: 'a', value: 1.5e308, group: 'Web' },
        { label: 'b', value: 1.5e308, group: 'Web' },
      ],
      { show_share: true },
    );
    expect(heads(container).map((head) => head.textContent)).toEqual(['Web · 100%']);
    expect(heads(container).map((head) => head.getAttribute('title'))).toEqual(['Web, 100% of the total']);
  });

  it('cuts a label longer than its tile and still writes the value under it, and keeps the whole label in the tooltip and the text alternative', () => {
    sized(240, 90);
    const items: TreemapData['items'] = [
      { label: 'A long repository name here', value: 3, group: null },
      { label: 'b', value: 1, group: null },
    ];
    const { container } = draw(items);
    // Tiles of 180 by 90 and 60 by 90: the long label (an estimated 233 px) is wider than its tile and is written for
    // the styles to cut; both values fit under their labels.
    expect(tiles(container).map((tile) => tile.querySelector('[class*="treemapLabel"]')?.textContent ?? null)).toEqual(['A long repository name here', 'b']);
    expect(tiles(container).map((tile) => tile.querySelector('[class*="treemapValue"]')?.textContent ?? null)).toEqual(['3', '1']);
    expect(tiles(container).at(0)?.getAttribute('title')).toBe('A long repository name here: 3');
    expect(rowsOf().slice(1).map((row) => row[0])).toEqual(['A long repository name here', 'b']);
  });

  it('writes no text in a tile narrower than the first three characters of its label and the ellipsis', () => {
    // Tiles of 160 by 100 and 40 by 100: the second fits a short label whole (an estimated 7 px and its 16 px of
    // padding) but not the start of a long one (four characters, an estimated 30 px, and its padding).
    sized(200, 100);
    const label = (items: TreemapData['items']) => tiles(draw(items).container).map((tile) => tile.querySelector('[class*="treemapLabel"]')?.textContent ?? null);
    expect(label([{ label: 'a', value: 4, group: null }, { label: 'b', value: 1, group: null }])).toEqual(['a', 'b']);
    cleanup();
    expect(label([{ label: 'a', value: 4, group: null }, { label: 'billing', value: 1, group: null }])).toEqual(['a', null]);
    expect(tiles(document.body).at(1)?.querySelector('[class*="treemapValue"]')).toBeNull();
    expect(tiles(document.body).at(1)?.getAttribute('title')).toBe('billing: 1');
  });

  it('is a figure named by its label, with a text alternative of every item, formatted by value_format', () => {
    draw(ITEMS, {}, { value_format: { value_type: 'number', decimals: 0 } });
    expect(screen.getByRole('figure', { name: 'Commits' })).toBeTruthy();
    expect(rowsOf()).toEqual([
      ['Label', 'Value'],
      ['payments-api', '420'],
      ['web-console', '260'],
      ['mobile-app', '140'],
    ]);
  });

  it('takes the group heading, the Other group and the share words from the texts', () => {
    const texts: WidgetTexts = { ...DEFAULT_WIDGET_TEXTS, chart: 'Diagramm', treemap: { group: 'Gruppe', share: 'Anteil', other: 'Rest', ofTotal: 'von der Gesamtzeit' } };
    const { container } = render(
      <TreemapChart
        payload={{
          render: { show_share: true },
          data: { items: [{ label: 'a', value: 3, group: null }, { label: 'b', value: 1, group: 'Web' }] },
        }}
        texts={texts}
      />,
    );
    expect(within(alternative('Diagramm')).getAllByRole('columnheader', { hidden: true }).map((cell) => cell.textContent)).toEqual(['Label', 'Gruppe', 'Value', 'Anteil']);
    expect(heads(container).map((head) => head.textContent)).toEqual(['Rest · 3 75%', 'Web · 1 25%']);
    expect(tiles(container).at(0)?.getAttribute('title')).toBe('a: 3, Rest, 75% von der Gesamtzeit');
  });

  it('opens the data view from the button and from a tile with drill_down', async () => {
    const user = userEvent.setup();
    const { container, unmount } = draw(ITEMS, { drill_down: true });
    await user.click(tiles(container)[0]);
    const region = await screen.findByRole('region', { name: 'Data of Commits' });
    expect(await within(region).findByText('payments-api', { selector: '[aria-current="true"]' })).toBeTruthy();
    await user.click(screen.getByRole('button', { name: 'Show chart' }));
    await user.click(screen.getByRole('button', { name: 'Show data' }));
    expect(await screen.findByRole('region', { name: 'Data of Commits' })).toBeTruthy();
    unmount();
  });

  it('draws no data view button and no clickable tile with drill-down off', () => {
    const { container } = draw(ITEMS);
    expect(screen.queryByRole('button', { name: 'Show data' })).toBeNull();
    expect(container.querySelector('button[class*="treemapTile"]')).toBeNull();
  });
});

describe('waterfall_chart', () => {
  // Coding 4.1, review 17, CI 3.2, waiting 2.1: the lead time of 26.4 the demo cell shows.
  const STEPS: WaterfallData['steps'] = [
    { label: 'Coding', value: 4.1 },
    { label: 'Review', value: 17 },
    { label: 'CI', value: 3.2 },
    { label: 'Waiting to deploy', value: 2.1 },
    { label: 'Lead time', value: 26.4, kind: 'total' },
  ];
  const draw = (steps: WaterfallData['steps'], options: WaterfallRender = {}, extra: Extra = {}) =>
    render(<WaterfallChart payload={{ render: options, data: { steps }, ...extra }} label="Lead time" />);
  const rowsOf = () => within(alternative('Lead time')).getAllByRole('row', { hidden: true }).map((row) => [...row.children].map((cell) => cell.textContent));
  // A drawn bar: the transparent base of the stack renders its own shapes, and is not a bar of the chart.
  const bars = (container: HTMLElement) => [...container.querySelectorAll('.recharts-bar-rectangle path')].filter((path) => path.getAttribute('fill') !== 'transparent');
  const connectors = (container: HTMLElement) => [...container.querySelectorAll('[class*="waterfallConnector"]')] as SVGLineElement[];
  const labels = (container: HTMLElement) => [...container.querySelectorAll('text[class*="valueLabel"]')].map((text) => text.textContent);
  const xTicks = (container: HTMLElement) => [...container.querySelectorAll('.recharts-xAxis-tick-labels .recharts-cartesian-axis-tick-value')].map((tick) => tick.textContent);
  // The drawn bars left to right, each by its edges: the top and the bottom on the screen, the plot's y growing down.
  const edgesOf = (container: HTMLElement) =>
    bars(container)
      .map((bar) => {
        const [x, y, width, height] = ['x', 'y', 'width', 'height'].map((name) => Number(bar.getAttribute(name)));
        return { left: x!, right: x! + width!, top: Math.min(y!, y! + height!), bottom: Math.max(y!, y! + height!) };
      })
      .sort((one, other) => one.left - other.left);
  const levelsOf = (container: HTMLElement) => connectors(container).map((line) => Number(line.getAttribute('y1')));
  const labelYs = (container: HTMLElement) => [...container.querySelectorAll('text[class*="valueLabel"]')].map((text) => Number(text.getAttribute('y')));
  const legendOf = (container: HTMLElement) => [...container.querySelectorAll('.recharts-legend-wrapper [class*="legendItem"]')].map((item) => item.textContent);
  // Hovers the first band of a 600 px chart, and reads the entries of the tooltip it opens.
  const hoverFirstBand = (container: HTMLElement) => fireEvent.mouseMove(container.querySelector('.recharts-wrapper')!, { clientX: 150, clientY: 100, pageX: 150, pageY: 100 });
  const tooltipRows = (container: HTMLElement) => [...container.querySelectorAll('.recharts-tooltip-wrapper [class*="tooltipRow"]')].map((row) => row.textContent);

  const sized = stubSizedObserver();

  it('draws one bar per step that draws, the deltas stacked from the running sum and the total from zero', () => {
    const { container } = draw(STEPS);
    // Four deltas and the total of the whole sum: five bars, every step named on the x axis.
    expect(bars(container)).toHaveLength(5);
    expect(xTicks(container)).toEqual(['Coding', 'Review', 'CI', 'Waiting to deploy', 'Lead time']);
    // The total bar reaches the running sum the deltas moved to; its own top is the highest of the chart.
    const tops = bars(container).map((bar) => Number(bar.getAttribute('y')));
    expect(tops[4]).toBeLessThan(tops[0]);
    expect(tops[4]).toBeLessThan(tops[1]);
    expect(container.textContent).not.toMatch(/NaN|Infinity/);
  });

  it('paints an increase, a decrease and a total in their tones, named in a legend at the bottom', () => {
    const steps: WaterfallData['steps'] = [
      { label: 'Start', value: 10, kind: 'total' },
      { label: 'Up', value: 4 },
      { label: 'Down', value: -3 },
      { label: 'End', value: 11, kind: 'total' },
    ];
    const { container } = draw(steps);
    // The library draws one series per tone, so the bars stand in the tree per series; the tones as a multiset
    // say the increase, the decrease and the two totals take their own tone.
    const fills = bars(container).map((bar) => bar.getAttribute('fill')).sort();
    expect(fills).toEqual(['var(--color-decrease)', 'var(--color-increase)', 'var(--color-total)', 'var(--color-total)']);
    expect(legendOf(container)).toEqual(['Increase', 'Decrease', 'Total']);
  });

  it('draws the first total from zero up to the sum it sets, and the delta after it from that sum', () => {
    // The steps Start 10 (a total), Up +4, Down -3 and End 11 (a total): the first bar spans zero to 10, the sum the
    // deltas move from, so the increase starts at its top and the last total stands on the same zero.
    const { container } = draw([
      { label: 'Start', value: 10, kind: 'total' },
      { label: 'Up', value: 4 },
      { label: 'Down', value: -3 },
      { label: 'End', value: 11, kind: 'total' },
    ]);
    const [start, up, down, end] = edgesOf(container);
    expect(start!.bottom).toBeCloseTo(end!.bottom, 6);
    expect(up!.bottom).toBeCloseTo(start!.top, 6);
    expect(down!.top).toBeCloseTo(up!.top, 6);
    expect(down!.bottom).toBeCloseTo(end!.top, 6);
  });

  it('names in its legend only the tones its steps take, in the order increase, decrease, total', () => {
    // Four increases and a total: no decrease to name.
    expect(legendOf(draw(STEPS).container)).toEqual(['Increase', 'Total']);
    cleanup();
    expect(legendOf(draw([{ label: 'Down', value: -3 }, { label: 'Up', value: 4 }]).container)).toEqual(['Increase', 'Decrease']);
  });

  it('stands each bar at the running sum across zero, and each connector at the end of the bar before it', () => {
    // 10, then -15 down through zero to -5, then +12 back up to 7, and the total 7 drawn from zero.
    const { container } = draw([
      { label: 'Start', value: 10 },
      { label: 'Down', value: -15 },
      { label: 'Up', value: 12 },
      { label: 'End', value: 7, kind: 'total' },
    ]);
    const [start, down, up, end] = edgesOf(container);
    // The first delta and the total stand on zero; the decrease spans 10 to -5, the increase -5 to 7.
    expect(end!.bottom).toBeCloseTo(start!.bottom, 6);
    expect(down!.top).toBeCloseTo(start!.top, 6);
    expect(down!.bottom).toBeGreaterThan(start!.bottom);
    expect(up!.bottom).toBeCloseTo(down!.bottom, 6);
    expect(up!.top).toBeCloseTo(end!.top, 6);
    expect(end!.top).toBeGreaterThan(start!.top);
    // A connector leaves at the sum the bar before it ends at: 10 (its top), -5 (its bottom), 7 (its top).
    expect(levelsOf(container)).toHaveLength(3);
    expect(levelsOf(container)[0]).toBeCloseTo(start!.top, 6);
    expect(levelsOf(container)[1]).toBeCloseTo(down!.bottom, 6);
    expect(levelsOf(container)[2]).toBeCloseTo(up!.top, 6);
  });

  it('draws a negative total down from zero, and writes its label and the label of a decrease above the bar', () => {
    // 5, then -8 down to -3, and the total -3 drawn from zero down.
    const { container } = draw(
      [
        { label: 'Start', value: 5 },
        { label: 'Down', value: -8 },
        { label: 'End', value: -3, kind: 'total' },
      ],
      { value_labels: 'always' },
    );
    const [start, down, end] = edgesOf(container);
    expect(end!.top).toBeCloseTo(start!.bottom, 6);
    expect(end!.bottom).toBeCloseTo(down!.bottom, 6);
    expect(down!.top).toBeCloseTo(start!.top, 6);
    // Each label stands over its bar's top edge, never inside it: the total's over zero, the decrease's over 5.
    expect(labels(container)).toEqual(['+5', '-8', '-3']);
    const [, downLabel, endLabel] = labelYs(container);
    expect(endLabel).toBeLessThan(end!.top);
    expect(downLabel).toBeLessThan(down!.top);
  });

  it('moves the running sum by each delta, a null delta drawing nothing and leaving the sum unchanged', () => {
    const steps: WaterfallData['steps'] = [
      { label: 'First', value: 5 },
      { label: 'Gap', value: null },
      { label: 'Down', value: -2 },
      { label: 'End', value: 3, kind: 'total' },
    ];
    const { container } = draw(steps);
    // Three bars: the null delta draws none, and the total after it is still the sum of 5 and -2.
    expect(bars(container)).toHaveLength(3);
    expect(xTicks(container)).toEqual(['First', 'Gap', 'Down', 'End']);
    expect(rowsOf()).toEqual([
      ['Label', 'Change', 'Running total'],
      ['First', '+5', '5'],
      ['Gap', '', '5'],
      ['Down', '-2', '3'],
      ['End', '3', '3'],
    ]);
  });

  it('writes the change with a sign on a delta and without one on a total, in the labels and the text alternative', () => {
    const { container } = draw(STEPS, { value_labels: 'always' }, { value_format: { value_type: 'duration', unit: 'h', decimals: 1 } });
    expect(labels(container)).toEqual(['+4.1 hr', '+17.0 hr', '+3.2 hr', '+2.1 hr', '26.4 hr']);
    expect(rowsOf()).toEqual([
      ['Label', 'Change', 'Running total'],
      ['Coding', '+4.1 hr', '4.1 hr'],
      ['Review', '+17.0 hr', '21.1 hr'],
      ['CI', '+3.2 hr', '24.3 hr'],
      ['Waiting to deploy', '+2.1 hr', '26.4 hr'],
      ['Lead time', '26.4 hr', '26.4 hr'],
    ]);
  });

  it('lays a thin connector from the end of one bar to the start of the next, level, and none after the last or with connectors off', () => {
    const connected = draw(STEPS).container;
    // Four connectors between the five bars: none before the first or after the last.
    expect(connectors(connected)).toHaveLength(4);
    for (const line of connectors(connected)) expect(line.getAttribute('y1')).toBe(line.getAttribute('y2'));
    cleanup();
    const bare = draw(STEPS, { connectors: false }).container;
    expect(connectors(bare)).toHaveLength(0);
  });

  it('joins the bars across a null delta with one connector, at the unchanged level', () => {
    const steps: WaterfallData['steps'] = [
      { label: 'First', value: 5 },
      { label: 'Gap', value: null },
      { label: 'Down', value: -2 },
      { label: 'End', value: 3, kind: 'total' },
    ];
    // The visible bars are First, Down and End: two connectors join the three, across the empty gap.
    expect(connectors(draw(steps).container)).toHaveLength(2);
  });

  it('touches the end of one bar and the start of the next with its connector, as the bars are laid out', () => {
    const { container } = draw(STEPS);
    // The bars stand in the tree per tone series, not left to right: sorted by x they line up with the connectors.
    const rects = bars(container)
      .map((bar) => ({ x: Number(bar.getAttribute('x')), width: Number(bar.getAttribute('width')) }))
      .sort((one, other) => one.x - other.x);
    const lines = connectors(container);
    // The connector out of a bar leaves its right edge and arrives at the next bar's left edge.
    expect(Number(lines[0]!.getAttribute('x1'))).toBeCloseTo(rects[0]!.x + rects[0]!.width, 6);
    expect(Number(lines[0]!.getAttribute('x2'))).toBeCloseTo(rects[1]!.x, 6);
    expect(Number(lines[3]!.getAttribute('x1'))).toBeCloseTo(rects[3]!.x + rects[3]!.width, 6);
    expect(Number(lines[3]!.getAttribute('x2'))).toBeCloseTo(rects[4]!.x, 6);
  });

  it('touches the bars with its connectors in a cell so narrow the chart thins its bars below their width', () => {
    // A 64 px cell leaves a plot of about 8 px: a band under 2 px, where the library draws each bar 0.9 of its band.
    sized(64, 300);
    const { container } = draw(STEPS);
    const edges = edgesOf(container);
    const lines = connectors(container);
    expect(edges).toHaveLength(5);
    expect(lines).toHaveLength(4);
    for (const [index, line] of lines.entries()) {
      expect(Number(line.getAttribute('x1'))).toBeCloseTo(edges[index]!.right, 6);
      expect(Number(line.getAttribute('x2'))).toBeCloseTo(edges[index + 1]!.left, 6);
    }
  });

  it('writes a value label above its bar when it fits the band the bar stands in, and keeps it in the text alternative below that', () => {
    // The bands of a five-step 600 px chart are wide enough for every label: auto writes them.
    expect(labels(draw(STEPS).container)).toEqual(['+4.1', '+17', '+3.2', '+2.1', '26.4']);
    cleanup();
    // A label the unit lengthens still shows: "+17.0 hr" (an estimated 50 px at the labels' 10 px) fits the 108.8 px
    // band its 56 px bar stands in. A label wider than its bar but not its band is the "+1,234.56" case below.
    expect(labels(draw(STEPS, {}, { value_format: { value_type: 'duration', unit: 'h', decimals: 1 } }).container)).toContain('+17.0 hr');
    cleanup();
    // A three-step 240 px chart has bands of about 61 px and bars of 35: "+1,234.56" (about 56 px) is wider than its
    // bar and fits its band, and a value wider than its band stays out of the drawing only.
    sized(240, 300);
    const wide = draw(
      [
        { label: 'a', value: 1234.56 },
        { label: 'b', value: 1234567.89 },
        { label: 'End', value: 1235802.45, kind: 'total' },
      ],
      {},
      { value_format: { value_type: 'number', decimals: 2 } },
    ).container;
    expect(labels(wide)).toEqual(['+1,234.56']);
    expect(rowsOf().slice(1).map((row) => row[1])).toEqual(['+1,234.56', '+1,234,567.89', '1,235,802.45']);
  });

  it('writes no value label in a low cell with auto, and still writes one with always; never writes none', () => {
    sized(300, 150);
    expect(labels(draw(STEPS).container)).toEqual([]);
    cleanup();
    const always = draw(STEPS, { value_labels: 'always' }).container;
    expect(labels(always)).toHaveLength(5);
    cleanup();
    expect(labels(draw(STEPS, { value_labels: 'never' }).container)).toEqual([]);
  });

  it('names the hovered step in the tooltip header, and its tone and signed change in the entry', async () => {
    const steps: WaterfallData['steps'] = [
      { label: 'First', value: 5 },
      { label: 'Gap', value: null },
      { label: 'Down', value: -2 },
    ];
    const { container } = draw(steps);
    hoverFirstBand(container);
    const entries = () => tooltipRows(container);
    await waitFor(() => expect(entries()).not.toEqual([]));
    // The hovered bar of the first band names its step in the header, and its signed change in the row.
    expect(container.querySelector('.recharts-tooltip-wrapper')?.textContent).toContain('First');
    expect(entries()[0]).toContain('Increase');
    expect(entries()[0]).toContain('+5');
  });

  it('writes no tooltip entry for a hovered step that draws no bar, a delta of exactly 0', async () => {
    const steps: WaterfallData['steps'] = [
      { label: 'Flat', value: 0 },
      { label: 'Up', value: 3 },
      { label: 'Down', value: -2 },
    ];
    const { container } = draw(steps);
    // The delta of 0 draws no bar: only the two others do.
    expect(bars(container)).toHaveLength(2);
    hoverFirstBand(container);
    // The cursor stands in the first band, left of the first drawn bar, and the tooltip names no tone for it.
    await waitFor(() => expect(container.querySelector('.recharts-tooltip-cursor')).not.toBeNull());
    const cursor = container.querySelector('.recharts-tooltip-cursor')!;
    expect(Number(cursor.getAttribute('x')) + Number(cursor.getAttribute('width'))).toBeLessThanOrEqual(edgesOf(container)[0]!.left);
    expect(tooltipRows(container)).toEqual([]);
  });

  it('fails the cell on a total whose value is not the running sum, naming the step and never its value', () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => {});
    draw([
      { label: 'First', value: 5 },
      { label: 'Rest', value: 4.1, kind: 'total' },
    ]);
    expect(screen.getByText('This widget cannot be shown')).toBeTruthy();
    expect(error).toHaveBeenCalledWith('[widget] waterfall_chart: data.steps[1] is a total, and its value is not the running sum of the steps before it');
    expect(String(error.mock.calls[0][0])).not.toContain('4.1');
    // A total within the relative tolerance, or with no value, is the running sum.
    expect(checkWaterfall({ steps: [{ label: 'a', value: 5 }, { label: 'b', value: 5.0000000001, kind: 'total' }] })).toBeNull();
    expect(checkWaterfall({ steps: [{ label: 'a', value: 5 }, { label: 'b', value: null, kind: 'total' }] })).toBeNull();
    expect(checkWaterfall({ steps: [{ label: 'a', value: 5 }, { label: 'b', value: 4, kind: 'total' }] })).toContain('data.steps[1]');
    // The first step may be the total the sum starts at: its value is the sum the deltas move from.
    expect(checkWaterfall({ steps: [{ label: 'a', value: null, kind: 'total' }, { label: 'b', value: 3 }] })).toBeNull();
    expect(checkWaterfall({ steps: [{ label: 'a', value: 10, kind: 'total' }, { label: 'b', value: -3 }, { label: 'c', value: 7, kind: 'total' }] })).toBeNull();
  });

  it('fails the cell on a running sum that leaves the finite range, naming the step that moves it out', () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => {});
    const most = Number.MAX_VALUE;
    draw([
      { label: 'First', value: most },
      { label: 'Second', value: most },
      { label: 'Rest', value: null },
    ]);
    expect(screen.getByText('This widget cannot be shown')).toBeTruthy();
    expect(error).toHaveBeenCalledWith('[widget] waterfall_chart: data.steps[1] moves the running sum out of the finite range');
    // A sum that comes back into the range over the same step never leaves it.
    expect(checkWaterfall({ steps: [{ label: 'a', value: most }, { label: 'b', value: -most }] })).toBeNull();
  });

  it('fails the cell on a step whose drawn extent leaves the finite range while the running sum stays in it', () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => {});
    // A start of one and a half units in the last place of the largest number, then a delta of minus the largest
    // number: the sum rounds to a finite value, and the extent from the start to it rounds beyond the largest number.
    const start = 3 * 2 ** 970;
    draw([
      { label: 'First', value: start },
      { label: 'Second', value: -Number.MAX_VALUE },
    ]);
    expect(screen.getByText('This widget cannot be shown')).toBeTruthy();
    expect(error).toHaveBeenCalledWith('[widget] waterfall_chart: data.steps[1] draws a bar whose extent is beyond the finite range');
    expect(String(error.mock.calls[0][0])).not.toMatch(/\d\.\d|e\+/);
  });

  it('reads a total accepted within the tolerance as the running sum it draws, on its label, its text alternative row and its data view cell', async () => {
    const user = userEvent.setup();
    const { container } = draw(
      [
        { label: 'First', value: 5 },
        { label: 'Sum', value: 5.000000001, kind: 'total' },
      ],
      { value_labels: 'always', drill_down: true },
      { value_format: { value_type: 'number', decimals: 9 } },
    );
    expect(labels(container)).toEqual(['+5.000000000', '5.000000000']);
    expect(rowsOf()[2]).toEqual(['Sum', '5.000000000', '5.000000000']);
    await user.click(screen.getByRole('button', { name: 'Show data' }));
    const region = await screen.findByRole('region', { name: 'Data of Lead time' });
    const rows = within(region).getAllByRole('row', { hidden: true }).map((row) => [...row.children].map((cell) => cell.textContent));
    expect(rows.find((row) => row.includes('Sum'))).toEqual(['Sum', '5.000000000', '5.000000000']);
  });

  it('sorts the data view by the change a total shows, the running sum it draws, when its delivered value is null', async () => {
    const user = userEvent.setup();
    draw(
      [
        { label: 'A', value: 1 },
        { label: 'B', value: 2 },
        { label: 'Sum', value: null, kind: 'total' },
        { label: 'C', value: 10 },
      ],
      { drill_down: true },
    );
    await user.click(screen.getByRole('button', { name: 'Show data' }));
    const region = await screen.findByRole('region', { name: 'Data of Lead time' });
    const labels = () => within(region).getAllByRole('row', { hidden: true }).slice(1).map((row) => row.children[0]?.textContent);
    // One click sorts the Change column descending, a second ascending; the total delivered as null shows the sum 3
    // the steps before it moved to, so it sorts between the +2 and the +10 and not with the empty cells at the end.
    const sorting = within(region).getByRole('button', { name: /sorting of 'Change'/ });
    await user.click(sorting);
    await user.click(sorting);
    await vi.waitFor(() => expect(labels()).toEqual(['A', 'B', 'Sum', 'C']));
  });

  it.each([
    ['all null', [{ label: 'a', value: null }, { label: 'b', value: null }] as WaterfallData['steps']],
    ['a total at the untouched sum', [{ label: 'a', value: 0, kind: 'total' }, { label: 'b', value: null }] as WaterfallData['steps']],
  ])('shows the empty state when no bar is drawn: %s', (_name, steps) => {
    draw(steps);
    expect(screen.getByText('No data to show')).toBeTruthy();
  });

  it('is a figure named by its label', () => {
    draw(STEPS);
    expect(screen.getByRole('figure', { name: 'Lead time' })).toBeTruthy();
  });

  it('takes its column headings and its legend names from the texts', () => {
    const texts: WidgetTexts = {
      ...DEFAULT_WIDGET_TEXTS,
      chart: 'Diagramm',
      waterfall: { change: 'Aenderung', running: 'Laufende Summe', increase: 'Mehr', decrease: 'Weniger', total: 'Summe' },
    };
    const steps: WaterfallData['steps'] = [
      { label: 'Start', value: 10, kind: 'total' },
      { label: 'Up', value: 4 },
      { label: 'Down', value: -3 },
      { label: 'End', value: 11, kind: 'total' },
    ];
    render(<WaterfallChart payload={{ render: {}, data: { steps } }} texts={texts} />);
    expect(within(alternative('Diagramm')).getAllByRole('columnheader', { hidden: true }).map((cell) => cell.textContent)).toEqual(['Label', 'Aenderung', 'Laufende Summe']);
    expect([...screen.getByRole('figure', { hidden: true }).querySelectorAll('[class*="legendItem"]')].map((item) => item.textContent)).toEqual(['Mehr', 'Weniger', 'Summe']);
  });

  it('opens the data view from the button, with every delivered step, and from a click on a bar with drill_down', async () => {
    const user = userEvent.setup();
    const { unmount } = draw(STEPS, { drill_down: true });
    await user.click(screen.getByRole('button', { name: 'Show data' }));
    const region = await screen.findByRole('region', { name: 'Data of Lead time' });
    expect(within(region).getAllByRole('row', { hidden: true }).length).toBeGreaterThan(3);
    unmount();
    cleanup();
    // A click on the second bar opens its row. The bar stands in the second band of a 600 px plot.
    const picked = draw(STEPS, { drill_down: true });
    const wrapper = picked.container.querySelector('.recharts-wrapper')!;
    fireEvent.mouseMove(wrapper, { clientX: 210, clientY: 100, pageX: 210, pageY: 100 });
    await waitFor(() => expect(picked.container.querySelector('.recharts-tooltip-wrapper [class*="tooltipRow"]')).not.toBeNull());
    fireEvent.click(wrapper, { clientX: 210, clientY: 100, pageX: 210, pageY: 100 });
    const opened = await screen.findByRole('region', { name: 'Data of Lead time' });
    expect(await within(opened).findByText('Review', { selector: '[aria-current="true"]' })).toBeTruthy();
  });

  it('draws no data view button and no clickable chart with drill-down off', () => {
    const { container } = draw(STEPS);
    expect(screen.queryByRole('button', { name: 'Show data' })).toBeNull();
    expect(container.querySelector('[class*="clickable"]')).toBeNull();
  });
});

describe('series colours past five', () => {
  // The `--color-<key>` values the kit chart style writes for the chart, in key order.
  const configColours = (container: HTMLElement, prefix: string) => {
    const text = [...container.querySelectorAll('style')].map((style) => style.textContent ?? '').join('\n');
    const light = text.split('[data-theme=')[0];
    return [...light.matchAll(new RegExp(`--color-${prefix}(\\d+): ([^;]+);`, 'g'))].sort((a, b) => Number(a[1]) - Number(b[1])).map((match) => match[2]);
  };
  // The colours themselves in each theme, read out of `light-dark(<light>, <dark>)`, not the custom property names
  // around them, which differ by position whatever the colour.
  const hexesOf = (colours: string[]) => colours.map((colour) => /light-dark\((#[0-9a-f]{6}), (#[0-9a-f]{6})\)/.exec(colour)?.slice(1).join(' '));
  const expectOwnColours = (colours: string[], count: number) => {
    expect(colours).toEqual(Array.from({ length: count }, (_, index) => seriesColor(index)));
    const hexes = hexesOf(colours);
    expect(hexes.every(Boolean)).toBe(true);
    // Each theme on its own: two series that share a light or a dark colour look alike in that theme.
    for (const theme of [0, 1]) expect(new Set(hexes.map((pair) => pair!.split(' ')[theme])).size).toBe(count);
  };

  it('gives each of 12 pie slices a colour of its own, the sixth unlike the first', () => {
    const slices = Array.from({ length: 12 }, (_, index) => ({ label: `s${index}`, value: 12 - index }));
    const { container } = render(<PieChart payload={{ render: {}, data: { slices } }} label="Share" />);
    const colours = configColours(container, 'p');
    expectOwnColours(colours, 12);
    expect(hexesOf(colours)[5]).not.toBe(hexesOf(colours)[0]);
  });

  it('gives each of 10 stacked bar series a colour of its own', () => {
    const names = Array.from({ length: 10 }, (_, index) => `team ${index}`);
    const payload = {
      render: { series: names.map((name) => ({ name, type: 'bar' as const, stack_group: 'all' })), x_axis: { type: 'category' as const } },
      data: { series: names.map((name, index) => ({ name, points: [{ x: 'Q1', y: index + 1 }, { x: 'Q2', y: index + 2 }] })) },
    };
    const { container } = render(<CartesianChart payload={payload} label="Stack" />);
    const colours = configColours(container, 's');
    expectOwnColours(colours, 10);
  });

  it('gives each of 12 treemap tiles a colour of its own', () => {
    const items = Array.from({ length: 12 }, (_, index) => ({ label: `t${index}`, value: 12 - index, group: null }));
    const { container } = render(<TreemapChart payload={{ render: {}, data: { items } }} label="Tiles" />);
    const colours = [...container.querySelectorAll<HTMLElement>('[class*="treemapTile"]')].map((tile) => tile.style.getPropertyValue('--tile'));
    expectOwnColours(colours, 12);
  });
});

describe('legend order', () => {
  const legendItems = (container: HTMLElement) => [...container.querySelectorAll('.recharts-legend-wrapper [class*="legendItem"]')].map((item) => item.textContent);
  const NAMES = Array.from({ length: 12 }, (_, index) => `Team ${String.fromCharCode(76 - index)}`);

  it('lists the 12 slices of a pie in slice order, not in the string order of their keys', async () => {
    const slices = NAMES.map((label, index) => ({ label, value: 12 - index }));
    const { container } = render(<PieChart payload={{ render: { legend_position: 'bottom' }, data: { slices } }} label="Share" />);
    // A pie legend item carries the slice's label and its value.
    await waitFor(() => expect(legendItems(container)).toEqual(NAMES.map((name, index) => `${name} ${12 - index}`)));
  });

  it('lists the 12 series of a bar chart in series order', () => {
    const payload = {
      render: { series: NAMES.map((name) => ({ name, type: 'bar' as const, stack_group: 'all' })), x_axis: { type: 'category' as const } },
      data: { series: NAMES.map((name, index) => ({ name, points: [{ x: 'Q1', y: index + 1 }] })) },
    };
    const { container } = render(<CartesianChart payload={payload} label="Stack" />);
    expect(legendItems(container)).toEqual(NAMES);
  });

  it('lists the series of a mixed chart in series order, whatever their types', () => {
    const names = ['Target', 'Actual', 'Forecast'];
    const payload = {
      render: { series: [{ name: 'Target', type: 'line' as const }, { name: 'Actual', type: 'bar' as const }, { name: 'Forecast', type: 'area' as const }], x_axis: { type: 'category' as const } },
      data: { series: names.map((name, index) => ({ name, points: [{ x: 'Q1', y: index + 1 }, { x: 'Q2', y: index + 2 }] })) },
    };
    const { container } = render(<CartesianChart payload={payload} label="Mixed" />);
    expect(legendItems(container)).toEqual(names);
  });
});
