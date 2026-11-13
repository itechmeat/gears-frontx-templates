import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';

import type { CartesianData, CartesianRender, CartesianSeriesOption } from '../types';
import { DEFAULT_WIDGET_TEXTS } from '../states';
import { CartesianChart, checkCartesian } from './CartesianChart';

/*
 * The cartesian chart's orientation, percent stack, extreme marks, reference lines and bubble sizes.
 * The tests' charts are 640 by 320 pixels (src-app/test-setup.ts).
 */

const TEAMS: CartesianData = {
  series: [
    { name: 'Open', points: [{ x: 'Web', y: 12 }, { x: 'Data', y: 30 }, { x: 'Infra', y: 6 }] },
    { name: 'Closed', points: [{ x: 'Web', y: 4 }, { x: 'Data', y: 10 }, { x: 'Infra', y: 0 }] },
  ],
};

const alternative = (name: string) => within(screen.getByRole('figure', { name })).getByRole('table', { hidden: true });
/** The plot box: the clip rectangle Recharts draws the series in. */
const plotOf = (container: HTMLElement) => {
  const rect = container.querySelector('clipPath rect')!;
  const [x, y, width, height] = ['x', 'y', 'width', 'height'].map((name) => Number(rect.getAttribute(name)));
  return { left: x, top: y, right: x + width, bottom: y + height };
};
/** A bar's box from its path: Recharts draws a plain bar as "M x,y h w v h h -w Z". */
const boxOf = (path: Element) => {
  const numbers = (path.getAttribute('d') ?? '').match(/-?\d+(\.\d+)?/g)!.map(Number);
  const xs = numbers.filter((_, index) => index % 2 === 0);
  const ys = numbers.filter((_, index) => index % 2 === 1);
  return { left: Math.min(...xs), right: Math.max(...xs), top: Math.min(...ys), bottom: Math.max(...ys) };
};
const bars = (container: HTMLElement) =>
  [...container.querySelectorAll('.recharts-bar')].map((bar) => [...bar.querySelectorAll('.recharts-rectangle')].map((rect) => ({ ...rectOf(rect) })));
const rectOf = (rect: Element) => {
  const attribute = (name: string) => Number(rect.getAttribute(name));
  if (rect.hasAttribute('width')) return { x: attribute('x'), y: attribute('y'), width: attribute('width'), height: attribute('height') };
  const box = boxOf(rect);
  return { x: box.left, y: box.top, width: box.right - box.left, height: box.bottom - box.top };
};
const failsWith = (payload: { render: CartesianRender; data: CartesianData }, problem: string) => {
  const errors = vi.spyOn(console, 'error').mockImplementation(() => {});
  render(<CartesianChart payload={payload} />);
  expect(screen.getByText('This widget cannot be shown')).toBeTruthy();
  expect(errors.mock.calls.map((call) => String(call[0]))).toEqual([expect.stringContaining(problem)]);
  errors.mockRestore();
};

describe('cartesian_chart orientation', () => {
  afterEach(() => vi.restoreAllMocks());

  it('draws horizontal bars: the categories down the vertical axis, the values along the horizontal one', () => {
    const { container } = render(<CartesianChart payload={{ render: { orientation: 'horizontal', series: [{ name: 'Open', type: 'bar' }] }, data: { series: [TEAMS.series[0]] } }} />);
    expect([...container.querySelectorAll('.recharts-yAxis-tick-labels .recharts-cartesian-axis-tick-value')].map((tick) => tick.textContent)).toEqual(['Web', 'Data', 'Infra']);
    // The x axis carries the numbers.
    expect([...container.querySelectorAll('.recharts-xAxis-tick-labels .recharts-cartesian-axis-tick-value')].every((tick) => /^\d+$/.test(tick.textContent ?? ''))).toBe(true);
    const [open] = bars(container);
    // Each bar starts at the same left edge, its length follows its value, and the bars stand one under the other.
    expect(new Set(open.map((bar) => Math.round(bar.x))).size).toBe(1);
    expect(open[1].width).toBeGreaterThan(open[0].width);
    expect(open[0].width).toBeGreaterThan(open[2].width);
    expect(open[0].width / open[1].width).toBeCloseTo(12 / 30, 1);
    expect(open[0].y).toBeLessThan(open[1].y);
    expect(open[1].y).toBeLessThan(open[2].y);
  });

  it('draws every series type horizontally, down the categories', () => {
    const data: CartesianData = { series: ['a', 'b', 'c'].map((name, index) => ({ name, points: [{ x: 'Web', y: 2 + index }, { x: 'Data', y: 5 + index }] })) };
    const { container } = render(
      <CartesianChart payload={{ render: { orientation: 'horizontal', series: [{ name: 'a', type: 'line' }, { name: 'b', type: 'area' }, { name: 'c', type: 'scatter' }] }, data }} />,
    );
    // The line runs from the first category down to the second: its y grows, as its x moves to the larger value.
    const line = (container.querySelector('.recharts-line-curve')?.getAttribute('d') ?? '').match(/-?\d+(\.\d+)?/g)!.map(Number);
    expect(line[3]).toBeGreaterThan(line[1]);
    expect(line[2]).toBeGreaterThan(line[0]);
    expect(container.querySelector('.recharts-area-curve')).not.toBeNull();
    const points = [...container.querySelectorAll('.recharts-scatter-symbol')].map((symbol) => symbol.querySelector('path')?.getAttribute('transform'));
    expect(points).toHaveLength(2);
    const [first, second] = points.map((transform) => (transform ?? '').match(/-?\d+(\.\d+)?/g)!.map(Number));
    expect(second[1]).toBeGreaterThan(first[1]);
    expect(second[0]).toBeGreaterThan(first[0]);
  });

  it.each([
    // Real plot height 320 - 30 - 46 - 8 = 236: 14 bars are 13.5px thick, too thin for a value; a guess of two 30px axes made them 14.4px.
    ['on the secondary axis', 14, { y_axis_secondary: { label: 'Rate' } }],
    // Real plot height 236 again: 13 bars are 14.5px thick, room for a value; a guess of two 46px axes made them 13.5px.
    ['on the primary axis', 13, { y_axis: { label: 'Open' } }],
  ] as const)('sizes the bars by each value axis with its own title, with a title only %s', (_name, count, axes) => {
    const categories = Array.from({ length: count }, (_, index) => `c${index}`);
    const data: CartesianData = {
      series: [
        { name: 'Open', points: categories.map((x, index) => ({ x, y: 10 + index })) },
        { name: 'Rate', points: categories.map((x) => ({ x, y: 0.5 })) },
      ],
    };
    const { container } = render(
      <CartesianChart payload={{ render: { ...axes, orientation: 'horizontal', value_labels: 'auto', legend_position: 'none', series: [{ name: 'Open', type: 'bar' }, { name: 'Rate', type: 'line', y_axis: 'secondary' }] }, data }} />,
    );
    const thickness = bars(container)[0][0].height;
    // The value labels show exactly when the drawn bars have the height of a value's line.
    expect(container.querySelectorAll('.valueLabel').length > 0).toBe(thickness >= 14);
    expect(container.querySelectorAll('.valueLabel').length).toBe(thickness >= 14 ? count : 0);
  });

  it('fails its own check for a horizontal chart whose x axis is not a category axis', () => {
    const data: CartesianData = { series: [{ name: 'a', points: [{ x: 1, y: 2 }] }] };
    expect(checkCartesian({ orientation: 'horizontal', x_axis: { type: 'value' } }, data)).toBe('cartesian_chart: orientation horizontal needs a category x axis, and the x axis is value');
    expect(checkCartesian({ orientation: 'horizontal', x_axis: { type: 'time' } }, { series: [{ name: 'a', points: [{ x: '2026-11-09T10:00:00Z', y: 2 }] }] })).toContain('the x axis is time');
    expect(checkCartesian({ orientation: 'horizontal' }, TEAMS)).toBeNull();
    expect(checkCartesian({ orientation: 'vertical', x_axis: { type: 'value' } }, data)).toBeNull();
    failsWith({ render: { orientation: 'horizontal', x_axis: { type: 'value' } }, data }, 'orientation horizontal needs a category x axis');
  });
});

describe('cartesian_chart percent stack', () => {
  afterEach(() => vi.restoreAllMocks());

  const STACKED: CartesianRender = { stack_mode: 'percent', series: [{ name: 'Open', type: 'bar', stack_group: 'all' }, { name: 'Closed', type: 'bar', stack_group: 'all' }] };

  it('draws each stack as shares that fill the plot to 100% at every x, with percents on the axis', () => {
    const { container } = render(<CartesianChart payload={{ render: STACKED, data: TEAMS }} />);
    const [open, closed] = bars(container);
    const plot = plotOf(container);
    // Every category's two segments together reach from the bottom of the plot to its top.
    for (const at of [0, 1, 2]) {
      const segments = [open[at], closed[at]].filter((bar) => bar !== undefined && bar.height > 0);
      const top = Math.min(...segments.map((bar) => bar.y));
      const bottom = Math.max(...segments.map((bar) => bar.y + bar.height));
      expect(top).toBeCloseTo(plot.top, 0);
      expect(bottom).toBeCloseTo(plot.bottom, 0);
    }
    // Web: 12 of 16 open, 75%.
    expect(open[0].height / (plot.bottom - plot.top)).toBeCloseTo(0.75, 2);
    const ticks = [...container.querySelectorAll('.recharts-yAxis-tick-labels .recharts-cartesian-axis-tick-value')].map((tick) => tick.textContent);
    expect(ticks[0]).toBe('0%');
    expect(ticks.at(-1)).toBe('100%');
  });

  it('draws 0% for every member at an x whose group sums to 0, and shows the values and 0% in the tooltip', async () => {
    const data: CartesianData = {
      series: [
        { name: 'Open', points: [{ x: 'Web', y: 3 }, { x: 'Data', y: 0 }] },
        { name: 'Closed', points: [{ x: 'Web', y: 1 }, { x: 'Data', y: 0 }] },
      ],
    };
    const { container } = render(<CartesianChart payload={{ render: STACKED, data }} />);
    const [open, closed] = bars(container);
    expect([open[1]?.height ?? 0, closed[1]?.height ?? 0]).toEqual([0, 0]);
    // The plot is about 580px wide: Data, the second category, is at about 480px.
    fireEvent.mouseMove(container.querySelector('.recharts-wrapper')!, { clientX: 480, clientY: 100, pageX: 480, pageY: 100 });
    await waitFor(() => expect(container.querySelector('.recharts-tooltip-wrapper')?.textContent?.replace(/\s/g, ' ')).toBe('DataOpen0 (0%)Closed0 (0%)'));
    fireEvent.mouseMove(container.querySelector('.recharts-wrapper')!, { clientX: 200, clientY: 100, pageX: 200, pageY: 100 });
    await waitFor(() => expect(container.querySelector('.recharts-tooltip-wrapper')?.textContent?.replace(/\s/g, ' ')).toBe('WebOpen3 (75%)Closed1 (25%)'));
  });

  it('shows the exact share of ordinary values in the tooltip: 1 of 80 is 1.25%, rounded to 1.3%', async () => {
    const data: CartesianData = { series: [{ name: 'Open', points: [{ x: 'Web', y: 1 }] }, { name: 'Closed', points: [{ x: 'Web', y: 79 }] }] };
    const { container } = render(<CartesianChart payload={{ render: STACKED, data }} />);
    fireEvent.mouseMove(container.querySelector('.recharts-wrapper')!, { clientX: 300, clientY: 100, pageX: 300, pageY: 100 });
    await waitFor(() => expect(container.querySelector('.recharts-tooltip-wrapper')?.textContent?.replace(/\s/g, ' ')).toBe('WebOpen1 (1.3%)Closed79 (98.8%)'));
  });

  it('stacks lines as shares too, the top line at 100%', () => {
    const data: CartesianData = { series: [{ name: 'a', points: [{ x: 'Mon', y: 1 }, { x: 'Tue', y: 3 }] }, { name: 'b', points: [{ x: 'Mon', y: 3 }, { x: 'Tue', y: 1 }] }] };
    const { container } = render(<CartesianChart payload={{ render: { stack_mode: 'percent', series: [{ name: 'a', type: 'line', stack_group: 'g' }, { name: 'b', type: 'line', stack_group: 'g' }] }, data }} />);
    const top = (container.querySelectorAll('.recharts-line-curve')[1]?.getAttribute('d') ?? '').match(/-?\d+(\.\d+)?/g)!.map(Number);
    // Both points of the upper line stand on the plot's top edge.
    expect(top[1]).toBeCloseTo(plotOf(container).top, 0);
    expect(top[3]).toBeCloseTo(plotOf(container).top, 0);
  });

  it('fails its own check for a negative value in a percent stack', () => {
    const data: CartesianData = { series: [TEAMS.series[0], { name: 'Closed', points: [{ x: 'Web', y: 4 }, { x: 'Data', y: -1 }] }] };
    expect(checkCartesian(STACKED, data)).toBe('cartesian_chart: series 1 point 1 is negative, and a percent stack takes no negative value');
    // In an absolute stack a negative value draws below the axis as before.
    expect(checkCartesian({ ...STACKED, stack_mode: 'absolute' }, data)).toBeNull();
    failsWith({ render: STACKED, data }, 'series 1 point 1 is negative');
  });

  it('fails its own check for a series without a stack group on a percent stacked axis', () => {
    const render: CartesianRender = { stack_mode: 'percent', series: [{ name: 'Open', type: 'bar', stack_group: 'all' }, { name: 'Closed', type: 'line' }] };
    expect(checkCartesian(render, TEAMS)).toBe('cartesian_chart: series 1 is on a percent stacked axis without a stack group');
    // On the other axis it keeps its own values.
    expect(checkCartesian({ ...render, series: [render.series![0], { name: 'Closed', type: 'line', y_axis: 'secondary' }] }, TEAMS)).toBeNull();
  });
});

describe('cartesian_chart extreme marks', () => {
  afterEach(() => vi.restoreAllMocks());

  // Mon and Thu tie for the highest value, Tue and Fri for the lowest; Wed is null.
  const WEEK: CartesianData = { series: [{ name: 'Load', points: [{ x: 'Mon', y: 9 }, { x: 'Tue', y: 2 }, { x: 'Wed', y: null }, { x: 'Thu', y: 9 }, { x: 'Fri', y: 2 }] }] };
  const marks = (container: HTMLElement) =>
    [...container.querySelectorAll('[data-extreme-mark]')].map((mark) => [mark.getAttribute('data-extreme-mark'), mark.querySelector('text')?.textContent, Math.round(Number(mark.querySelector('circle')?.getAttribute('cx')))]);
  const xOf = (container: HTMLElement, category: string) => {
    const tick = [...container.querySelectorAll('.recharts-xAxis-tick-labels .recharts-cartesian-axis-tick-value')].find((text) => text.textContent === category)!;
    return Math.round(Number(tick.getAttribute('x')));
  };

  it.each([
    ['min', ['min']],
    ['max', ['max']],
    ['both', ['max', 'min']],
  ] as const)('marks the %s of a line on the first such point in axis order, with the value', (asked, kinds) => {
    const { container } = render(<CartesianChart payload={{ render: { series: [{ name: 'Load', type: 'line', mark_extremes: asked }] }, data: WEEK }} />);
    const expected = kinds.map((kind) => (kind === 'max' ? ['max', '9', xOf(container, 'Mon')] : ['min', '2', xOf(container, 'Tue')]));
    expect(marks(container).sort()).toEqual(expected.sort());
  });

  it('marks the extremes of an area, the highest label above its point and the lowest below', () => {
    const { container } = render(<CartesianChart payload={{ render: { series: [{ name: 'Load', type: 'area', mark_extremes: 'both' }] }, data: WEEK }} />);
    const at = (kind: string) => {
      const mark = container.querySelector(`[data-extreme-mark="${kind}"]`)!;
      return { dot: Number(mark.querySelector('circle')!.getAttribute('cy')), text: Number(mark.querySelector('text')!.getAttribute('y')) };
    };
    expect(at('max').text).toBeLessThan(at('max').dot);
    expect(at('min').text).toBeGreaterThan(at('min').dot);
  });

  it('moves the highest label under its point when above it would leave the plot', () => {
    // 0 to 100 gives a domain of exactly 0 to 100: the highest point stands on the plot's top edge.
    const data: CartesianData = { series: [{ name: 'Load', points: [{ x: 'Mon', y: 0 }, { x: 'Tue', y: 100 }, { x: 'Wed', y: 40 }] }] };
    const { container } = render(<CartesianChart payload={{ render: { series: [{ name: 'Load', type: 'line', mark_extremes: 'both' }] }, data }} />);
    const mark = (kind: string) => {
      const group = container.querySelector(`[data-extreme-mark="${kind}"]`)!;
      return { dot: Number(group.querySelector('circle')!.getAttribute('cy')), text: Number(group.querySelector('text')!.getAttribute('y')) };
    };
    const plot = plotOf(container);
    expect(mark('max').dot).toBeCloseTo(plot.top, 0);
    // Below the point, inside the plot; the lowest, on the bottom edge, goes above its point the same way.
    expect(mark('max').text).toBeGreaterThan(mark('max').dot);
    expect(mark('min').dot).toBeCloseTo(plot.bottom, 0);
    expect(mark('min').text).toBeLessThan(mark('min').dot);
  });

  it('writes the extreme labels beside their points on a horizontal chart: the highest right of it, the lowest left of it', () => {
    // The highest, 45, stands well inside a 0 to 60 axis, so its label has room on its own side.
    const data: CartesianData = { series: [{ name: 'Load', points: [{ x: 'Web', y: 20 }, { x: 'Data', y: 45 }, { x: 'Infra', y: 35 }] }] };
    const { container } = render(<CartesianChart payload={{ render: { orientation: 'horizontal', series: [{ name: 'Load', type: 'line', mark_extremes: 'both' }] }, data }} />);
    const mark = (kind: string) => {
      const group = container.querySelector(`[data-extreme-mark="${kind}"]`)!;
      const text = group.querySelector('text')!;
      return { cx: Number(group.querySelector('circle')!.getAttribute('cx')), cy: Number(group.querySelector('circle')!.getAttribute('cy')), x: Number(text.getAttribute('x')), y: Number(text.getAttribute('y')), anchor: text.getAttribute('text-anchor') };
    };
    expect(mark('max')).toMatchObject({ anchor: 'start' });
    expect(mark('max').x).toBeGreaterThan(mark('max').cx);
    expect(mark('min')).toMatchObject({ anchor: 'end' });
    expect(mark('min').x).toBeLessThan(mark('min').cx);
    // Level with the point, not above or below it.
    expect(Math.abs(mark('max').y - mark('max').cy)).toBeLessThanOrEqual(4);
  });

  it('draws no mark for a series of nulls', () => {
    const { container } = render(
      <CartesianChart payload={{ render: { series: [{ name: 'Load', type: 'line', mark_extremes: 'both' }, { name: 'Empty', type: 'line', mark_extremes: 'both' }] }, data: { series: [...WEEK.series, { name: 'Empty', points: [{ x: 'Mon', y: null }] }] } }} />,
    );
    expect(container.querySelectorAll('[data-extreme-mark]')).toHaveLength(2);
  });

  it('fails its own check for mark_extremes on a bar or scatter series', () => {
    // Delivered JSON can leave out a type the TypeScript option requires.
    const UNTYPED = { name: 'Load', mark_extremes: 'max' } as CartesianSeriesOption;
    expect(checkCartesian({ series: [{ name: 'Load', type: 'bar', mark_extremes: 'max' }] }, WEEK)).toBe('cartesian_chart: series option 0 is a bar, and mark_extremes applies to a line or area');
    expect(checkCartesian({ series: [{ name: 'Load', type: 'scatter', mark_extremes: 'min' }] }, WEEK)).toContain('series option 0 is a scatter');
    // An option without a type draws as bars, and the reason says so.
    expect(checkCartesian({ series: [UNTYPED] }, WEEK)).toBe('cartesian_chart: series option 0 is a bar, and mark_extremes applies to a line or area');
    failsWith({ render: { series: [UNTYPED] }, data: WEEK }, 'series option 0 is a bar, and mark_extremes');
    cleanup();
    failsWith({ render: { series: [{ name: 'Load', type: 'bar', mark_extremes: 'both' }] }, data: WEEK }, 'mark_extremes applies to a line or area');
  });
});

describe('cartesian_chart end label on a horizontal chart', () => {
  it('writes the series name right of its last point, level with it', () => {
    const data: CartesianData = { series: [{ name: 'Target', points: [{ x: 'Web', y: 20 }, { x: 'Data', y: 60 }, { x: 'Infra', y: 35 }] }] };
    const { container } = render(<CartesianChart payload={{ render: { orientation: 'horizontal', series: [{ name: 'Target', type: 'line', label: 'Goal' }] }, data }} />);
    const label = [...container.querySelectorAll('.lineLabel')].find((text) => text.textContent === 'Goal')!;
    // The line's last point is its lowest category, Infra: the last pair of numbers of its path.
    const path = (container.querySelector('.recharts-line-curve')?.getAttribute('d') ?? '').match(/-?\d+(\.\d+)?/g)!.map(Number);
    const [x, y] = path.slice(-2);
    expect(label.getAttribute('text-anchor')).toBe('start');
    expect(Number(label.getAttribute('x'))).toBeGreaterThan(x);
    expect(Math.abs(Number(label.getAttribute('y')) - y)).toBeLessThanOrEqual(4);
  });
});

describe('cartesian_chart reference lines', () => {
  afterEach(() => vi.restoreAllMocks());

  const lineOf = (container: HTMLElement, index = 0) => container.querySelectorAll('.recharts-reference-line')[index];

  it('extends the value axis to a line above the data, and draws it inside the plot', () => {
    const { container } = render(<CartesianChart payload={{ render: { series: [{ name: 'Open', type: 'bar' }], reference_lines: [{ value: 50, label: 'Goal' }] }, data: { series: [TEAMS.series[0]] } }} />);
    const line = lineOf(container).querySelector('line')!;
    const y = Number(line.getAttribute('y1'));
    const plot = plotOf(container);
    // 50 is above the highest value, 30: without the extension Recharts would leave the line out.
    expect(y).toBeGreaterThanOrEqual(plot.top);
    expect(y).toBeLessThanOrEqual(plot.bottom);
    // It runs across the plot, in the muted tone, dashed by default, with its label at its end.
    expect(Number(line.getAttribute('x1'))).toBeCloseTo(plot.left, 0);
    expect(Number(line.getAttribute('x2'))).toBeCloseTo(plot.right, 0);
    expect(line.getAttribute('stroke')).toBe('var(--muted-foreground)');
    expect(line.getAttribute('stroke-dasharray')).toBe('4 4');
    // Recharts draws reference labels in a layer of their own.
    const label = [...container.querySelectorAll('.referenceLabel')].find((text) => text.textContent === 'Goal')!;
    expect(label).toBeDefined();
    expect(Number(label.getAttribute('x'))).toBeGreaterThan((plot.left + plot.right) / 2);
    // It stands above the line: its baseline at or over the line's y.
    expect(Number(label.getAttribute('y'))).toBeLessThanOrEqual(y);
  });

  it('draws a solid line, and an upright line at a category of the x axis', () => {
    const { container } = render(
      <CartesianChart payload={{ render: { series: [{ name: 'Open', type: 'bar' }], reference_lines: [{ value: 10, line_style: 'solid' }, { axis: 'x', value: 'Data', label: 'Release' }] }, data: { series: [TEAMS.series[0]] } }} />,
    );
    expect(lineOf(container, 0).querySelector('line')!.hasAttribute('stroke-dasharray')).toBe(false);
    const upright = lineOf(container, 1).querySelector('line')!;
    expect(upright.getAttribute('x1')).toBe(upright.getAttribute('x2'));
    const label = container.querySelector('.referenceLabel')!;
    expect(label.textContent).toBe('Release');
    // The label of an upright line stands at its top, right of it.
    expect(Number(label.getAttribute('x'))).toBeGreaterThan(Number(upright.getAttribute('x1')));
    expect(Number(label.getAttribute('y'))).toBeLessThan((plotOf(container).top + plotOf(container).bottom) / 2);
  });

  it('draws a line on the secondary axis and on a horizontal chart', () => {
    const data: CartesianData = { series: [TEAMS.series[0], { name: 'Rate', points: [{ x: 'Web', y: 0.2 }, { x: 'Data', y: 0.4 }, { x: 'Infra', y: 0.1 }] }] };
    const { container, unmount } = render(
      <CartesianChart payload={{ render: { series: [{ name: 'Open', type: 'bar' }, { name: 'Rate', type: 'line', y_axis: 'secondary' }], reference_lines: [{ axis: 'y_secondary', value: 0.3 }] }, data }} />,
    );
    // The line stands where 0.3 is on the secondary axis, read from two of its ticks, far from 0.3 on the primary one.
    // The secondary axis is the one right of the plot: its ticks have the larger x.
    const tickX = (axis: Element) => Number(axis.querySelector('.recharts-cartesian-axis-tick-value')?.getAttribute('x'));
    const ticks = [...container.querySelectorAll('.recharts-yAxis-tick-labels')].sort((a, b) => tickX(b) - tickX(a))[0].querySelectorAll('.recharts-cartesian-axis-tick-value');
    const [low, high] = [ticks[0], ticks[ticks.length - 1]].map((tick) => ({ value: Number(tick.textContent), y: Number(tick.getAttribute('y')) }));
    const expected = low.y + ((0.3 - low.value) / (high.value - low.value)) * (high.y - low.y);
    expect(Number(lineOf(container).querySelector('line')!.getAttribute('y1'))).toBeCloseTo(expected, 0);
    unmount();
    const { container: across } = render(<CartesianChart payload={{ render: { orientation: 'horizontal', series: [{ name: 'Open', type: 'bar' }], reference_lines: [{ value: 40 }] }, data: { series: [TEAMS.series[0]] } }} />);
    // On a horizontal chart a value line stands upright, inside the plot, past the longest bar.
    const line = lineOf(across).querySelector('line')!;
    const plot = plotOf(across);
    expect(line.getAttribute('x1')).toBe(line.getAttribute('x2'));
    expect(Number(line.getAttribute('x1'))).toBeLessThanOrEqual(plot.right);
    expect(Number(line.getAttribute('x1'))).toBeGreaterThan(Math.max(...bars(across)[0].map((bar) => bar.x + bar.width)));
  });

  it('fails its own check for a line on the secondary axis when no series uses it', () => {
    expect(checkCartesian({ reference_lines: [{ axis: 'y_secondary', value: 1 }] }, TEAMS)).toBe('cartesian_chart: reference line 0 is on y_secondary, and no series uses the secondary axis');
    failsWith({ render: { reference_lines: [{ value: 1 }, { axis: 'y_secondary', value: 1 }] }, data: TEAMS }, 'reference line 1 is on y_secondary');
  });

  it('fails its own check for a category value on a y axis or on a value x axis', () => {
    expect(checkCartesian({ reference_lines: [{ value: 'Web' }] }, TEAMS)).toBe('cartesian_chart: reference line 0 has a category value, and its axis is not a category x axis');
    const values: CartesianData = { series: [{ name: 'a', points: [{ x: 1, y: 2 }] }] };
    expect(checkCartesian({ x_axis: { type: 'value' }, reference_lines: [{ axis: 'x', value: 'one' }] }, values)).toContain('reference line 0 has a category value');
    expect(checkCartesian({ x_axis: { type: 'value' }, reference_lines: [{ axis: 'x', value: 1 }] }, values)).toBeNull();
    failsWith({ render: { reference_lines: [{ value: 'Web' }] }, data: TEAMS }, 'reference line 0 has a category value');
  });

  // Three days of a time axis, as points of a line and of a scatter, and as scatter points alone.
  const DAYS: CartesianData = {
    series: [
      { name: 'Load', points: [{ x: '2026-11-01T00:00:00Z', y: 4 }, { x: '2026-11-02T00:00:00Z', y: 9 }, { x: '2026-11-03T00:00:00Z', y: 6 }] },
      { name: 'Peaks', points: [{ x: '2026-11-01T00:00:00Z', y: 5 }, { x: '2026-11-02T00:00:00Z', y: 8 }, { x: '2026-11-03T00:00:00Z', y: 7 }] },
    ],
  };
  const symbolX = (container: HTMLElement, index: number) => Number((container.querySelectorAll('.recharts-scatter-symbol path')[index].getAttribute('transform') ?? '').match(/-?\d+(\.\d+)?/)![0]);

  it.each([
    ['beside a line', [{ name: 'Load', type: 'line' }, { name: 'Peaks', type: 'scatter' }]],
    ['among scatter points alone', [{ name: 'Load', type: 'scatter' }, { name: 'Peaks', type: 'scatter' }]],
  ] as const)('draws an ISO date-time line on a time x axis where a point with that x stands, %s', (_name, series) => {
    const { container } = render(
      <CartesianChart payload={{ render: { x_axis: { type: 'time' }, series: [...series], reference_lines: [{ axis: 'x', value: '2026-11-02T00:00:00Z' }, { axis: 'x', value: Date.parse('2026-11-03T00:00:00Z') }] }, data: DAYS }} />,
    );
    const xs = [0, 1].map((index) => Number(lineOf(container, index).querySelector('line')!.getAttribute('x1')));
    const points = [...container.querySelectorAll('.recharts-scatter-symbol path')].length;
    // The scatter's second and third points: the 2nd and the 3rd of November.
    expect(xs[0]).toBeCloseTo(symbolX(container, points - 2), 0);
    expect(xs[1]).toBeCloseTo(symbolX(container, points - 1), 0);
  });

  it('fails its own check for a line on a time x axis that is no date-time, or past the times a date holds', () => {
    const time: CartesianRender = { x_axis: { type: 'time' }, series: [{ name: 'Load', type: 'line' }] };
    const reason = 'cartesian_chart: reference line 0 needs an ISO 8601 date-time, a YYYY-MM-DD date or epoch milliseconds on the time x axis';
    expect(checkCartesian({ ...time, reference_lines: [{ axis: 'x', value: 'next week' }] }, DAYS)).toBe(reason);
    expect(checkCartesian({ ...time, reference_lines: [{ axis: 'x', value: 1e20 }] }, DAYS)).toBe(reason);
    expect(checkCartesian({ ...time, reference_lines: [{ axis: 'x', value: '2026-11-02T00:00:00Z' }] }, DAYS)).toBeNull();
    expect(checkCartesian({ ...time, reference_lines: [{ axis: 'x', value: 8.64e15 }] }, DAYS)).toBeNull();
    failsWith({ render: { ...time, reference_lines: [{ axis: 'x', value: 'next week' }] }, data: DAYS }, 'reference line 0 needs an ISO 8601 date-time');
    cleanup();
    failsWith({ render: { ...time, reference_lines: [{ axis: 'x', value: 1e20 }] }, data: DAYS }, 'reference line 0 needs an ISO 8601 date-time');
  });

  it('takes a bare date on a time x axis as its UTC midnight, and fails a date the calendar does not have', () => {
    const time: CartesianRender = { x_axis: { type: 'time' }, series: [{ name: 'Load', type: 'line' }] };
    expect(checkCartesian({ ...time, reference_lines: [{ axis: 'x', value: '2026-11-02' }] }, DAYS)).toBeNull();
    expect(checkCartesian({ ...time, reference_lines: [{ axis: 'x', value: '2026-02-30' }] }, DAYS)).toBe(
      'cartesian_chart: reference line 0 needs an ISO 8601 date-time, a YYYY-MM-DD date or epoch milliseconds on the time x axis',
    );
    // The line on a bare date stands where the line on that date's UTC midnight stands.
    const lineX = (value: string) => {
      const { container, unmount } = render(<CartesianChart payload={{ render: { ...time, reference_lines: [{ axis: 'x', value }] }, data: DAYS }} label="Days" />);
      const x = Number(container.querySelector('.recharts-reference-line line')?.getAttribute('x1'));
      unmount();
      return x;
    };
    expect(lineX('2026-11-02')).toBeCloseTo(lineX('2026-11-02T00:00:00Z'), 3);
  });

  it.each([
    ['y', { y_axis: { type: 'log' as const } }],
    ['y_secondary', { y_axis_secondary: { type: 'log' as const } }],
  ] as const)('fails its own check for a line at or below zero on a log %s axis', (on, axes) => {
    const options: CartesianRender = { ...axes, series: [{ name: 'Open', type: 'bar' }, { name: 'Closed', type: 'line', y_axis: 'secondary' }] };
    const data: CartesianData = { series: [{ name: 'Open', points: [{ x: 'Web', y: 12 }] }, { name: 'Closed', points: [{ x: 'Web', y: 4 }] }] };
    const reason = 'cartesian_chart: reference line 0 needs a value above zero on its log axis';
    expect(checkCartesian({ ...options, reference_lines: [{ axis: on, value: 0 }] }, data)).toBe(reason);
    expect(checkCartesian({ ...options, reference_lines: [{ axis: on, value: -3 }] }, data)).toBe(reason);
    expect(checkCartesian({ ...options, reference_lines: [{ axis: on, value: 2 }] }, data)).toBeNull();
    failsWith({ render: { ...options, reference_lines: [{ axis: on, value: 0 }] }, data }, 'needs a value above zero on its log axis');
  });

  it('fails its own check for a line off a percent axis, a share from 0 to 1', () => {
    const options: CartesianRender = { stack_mode: 'percent', series: [{ name: 'Open', type: 'bar', stack_group: 'all' }, { name: 'Closed', type: 'bar', stack_group: 'all' }] };
    const reason = 'cartesian_chart: reference line 0 is off its axis: on a percent axis a value is a share from 0 to 1';
    expect(checkCartesian({ ...options, reference_lines: [{ value: 50 }] }, TEAMS)).toBe(reason);
    expect(checkCartesian({ ...options, reference_lines: [{ value: 0.5 }] }, TEAMS)).toBeNull();
    // An axis with no stack group keeps its own values.
    expect(checkCartesian({ stack_mode: 'percent', series: [{ name: 'Open', type: 'bar', stack_group: 'all' }, { name: 'Closed', type: 'line', y_axis: 'secondary' }], reference_lines: [{ axis: 'y_secondary', value: 50 }] }, TEAMS)).toBeNull();
    failsWith({ render: { ...options, reference_lines: [{ value: 50 }] }, data: TEAMS }, 'on a percent axis a value is a share from 0 to 1');
    vi.restoreAllMocks();
    const { container } = render(<CartesianChart payload={{ render: { ...options, reference_lines: [{ value: 0.5 }] }, data: TEAMS }} />);
    // A share of 0.5 stands halfway up the plot.
    const plot = plotOf(container);
    expect(Number(lineOf(container).querySelector('line')!.getAttribute('y1'))).toBeCloseTo((plot.top + plot.bottom) / 2, 0);
  });

  it('fails its own check for a number value on a category x axis', () => {
    expect(checkCartesian({ reference_lines: [{ axis: 'x', value: 2 }] }, TEAMS)).toBe('cartesian_chart: reference line 0 has a number value on a category x axis, which takes a category');
    expect(checkCartesian({ reference_lines: [{ axis: 'x', value: 'Web' }] }, TEAMS)).toBeNull();
    failsWith({ render: { reference_lines: [{ axis: 'x', value: 2 }] }, data: TEAMS }, 'number value on a category x axis');
  });
});

describe('cartesian_chart bubble sizes', () => {
  afterEach(() => vi.restoreAllMocks());

  const BUBBLES: CartesianData = {
    series: [{ name: 'Repos', points: [{ x: 1, y: 10, size: 400 }, { x: 2, y: 20, size: 100 }, { x: 3, y: 15, size: 25 }, { x: 4, y: 12, size: null }] }],
  };
  const RENDER: CartesianRender = { x_axis: { type: 'value' }, series: [{ name: 'Repos', type: 'scatter' }], size_label: 'Contributors', drill_down: true };
  /** A circle symbol's radius from its path, which Recharts starts at its leftmost point: "M-r,0A...". */
  const radii = (container: HTMLElement) => [...container.querySelectorAll('.recharts-scatter-symbol path')].map((path) => Math.abs(Number((path.getAttribute('d') ?? '').match(/^M(-?\d+(\.\d+)?)/)?.[1])));

  it('gives each point an area in proportion to its size, a missing size the smallest bubble', () => {
    const { container } = render(<CartesianChart payload={{ render: RENDER, data: BUBBLES }} />);
    const [large, medium, small, none] = radii(container);
    expect(large).toBeGreaterThan(medium);
    expect(medium).toBeGreaterThan(small);
    expect(small).toBeGreaterThanOrEqual(none);
    // Areas in proportion: 400 against 100 is four times the area, twice the radius.
    expect(large / medium).toBeCloseTo(2, 1);
    expect(large).toBeCloseTo(18, 0);
  });

  it('keeps every bubble, the ones at the edges of the data too, inside the plot', () => {
    const { container } = render(<CartesianChart payload={{ render: RENDER, data: BUBBLES }} />);
    const plot = plotOf(container);
    const discs = [...container.querySelectorAll('.recharts-scatter-symbol path')].map((path) => {
      const [cx, cy] = (path.getAttribute('transform') ?? '').match(/-?\d+(\.\d+)?/g)!.map(Number);
      const r = Math.abs(Number((path.getAttribute('d') ?? '').match(/^M(-?\d+(\.\d+)?)/)?.[1]));
      return { left: cx - r, right: cx + r, top: cy - r, bottom: cy + r };
    });
    expect(discs).toHaveLength(4);
    for (const disc of discs) {
      expect(disc.left).toBeGreaterThanOrEqual(plot.left - 0.5);
      expect(disc.right).toBeLessThanOrEqual(plot.right + 0.5);
      expect(disc.top).toBeGreaterThanOrEqual(plot.top - 0.5);
      expect(disc.bottom).toBeLessThanOrEqual(plot.bottom + 0.5);
    }
  });

  it('names the size in the tooltip and the data view by size_label', async () => {
    const user = userEvent.setup();
    const { container } = render(<CartesianChart payload={{ render: RENDER, data: BUBBLES }} label="Repos" />);
    fireEvent.mouseEnter(container.querySelectorAll('.recharts-scatter-symbol')[0]);
    fireEvent.mouseMove(container.querySelectorAll('.recharts-scatter-symbol')[0]);
    await waitFor(() => expect(container.querySelector('.recharts-tooltip-wrapper')?.textContent).toContain('Contributors400'));
    expect(within(alternative('Repos')).getAllByRole('columnheader', { hidden: true }).map((cell) => cell.textContent)).toEqual(['Series', 'x', 'y', 'Contributors']);
    await user.click(screen.getByRole('button', { name: 'Show data' }));
    const region = await screen.findByRole('region', { name: 'Data of Repos' });
    expect(await within(region).findByRole('columnheader', { name: /Contributors/ })).toBeTruthy();
  });

  it('sizes scatter points over categories, and lists the sizes in their own column', () => {
    const data: CartesianData = { series: [{ name: 'Repos', points: [{ x: 'Web', y: 10, size: 9 }, { x: 'Data', y: 20, size: 1 }] }] };
    const { container } = render(<CartesianChart payload={{ render: { series: [{ name: 'Repos', type: 'scatter' }] }, data }} label="Over categories" />);
    const [large, small] = radii(container);
    expect(large / small).toBeCloseTo(3, 1);
    expect(within(alternative('Over categories')).getAllByRole('columnheader', { hidden: true }).map((cell) => cell.textContent)).toEqual(['x', 'Repos', 'Repos: Size']);
  });

  it('takes the size name from the texts when the render gives no size_label', () => {
    const data: CartesianData = { series: [{ name: 'Repos', points: [{ x: 'Web', y: 10, size: 9 }] }] };
    const texts = { ...DEFAULT_WIDGET_TEXTS, columns: { ...DEFAULT_WIDGET_TEXTS.columns, size: 'Groesse' } };
    render(<CartesianChart payload={{ render: { series: [{ name: 'Repos', type: 'scatter' }] }, data }} label="Sized" texts={texts} />);
    expect(within(alternative('Sized')).getAllByRole('columnheader', { hidden: true }).map((cell) => cell.textContent)).toEqual(['x', 'Repos', 'Repos: Groesse']);
  });

  it('sizes scatter points on a time axis next to a line, and lists their sizes', () => {
    const data: CartesianData = {
      series: [
        { name: 'Load', points: [{ x: '2026-11-01T00:00:00Z', y: 4 }, { x: '2026-11-02T00:00:00Z', y: 9 }, { x: '2026-11-03T00:00:00Z', y: 6 }] },
        { name: 'Repos', points: [{ x: '2026-11-01T00:00:00Z', y: 5, size: 100 }, { x: '2026-11-02T00:00:00Z', y: 8, size: 25 }, { x: '2026-11-03T00:00:00Z', y: 7, size: 400 }] },
      ],
    };
    const { container } = render(<CartesianChart payload={{ render: { x_axis: { type: 'time' }, series: [{ name: 'Load', type: 'line' }, { name: 'Repos', type: 'scatter' }] }, data }} label="Over time" />);
    const [medium, small, large] = radii(container);
    expect(large).toBeGreaterThan(medium);
    expect(medium).toBeGreaterThan(small);
    expect(large / medium).toBeCloseTo(2, 1);
    const rows = within(alternative('Over time')).getAllByRole('row', { hidden: true }).slice(1);
    expect(rows.map((row) => [...row.querySelectorAll('td')].at(-1)?.textContent)).toEqual(['100', '25', '400']);
  });

  it('fails its own check for a size on a point of a series that is not a scatter', () => {
    const data: CartesianData = { series: [{ name: 'a', points: [{ x: 'Web', y: 1 }, { x: 'Data', y: 2, size: 3 }] }] };
    expect(checkCartesian({ series: [{ name: 'a', type: 'bar' }] }, data)).toBe('cartesian_chart: series 0 point 1 has a size, and only a scatter series takes one');
    // A series without an option draws as bars, so it takes no size either.
    expect(checkCartesian({}, data)).toContain('series 0 point 1 has a size');
    expect(checkCartesian({ series: [{ name: 'a', type: 'scatter' }] }, data)).toBeNull();
    expect(checkCartesian({}, { series: [{ name: 'a', points: [{ x: 'Web', y: 1, size: null }] }] })).toBeNull();
    failsWith({ render: { series: [{ name: 'a', type: 'line' }] }, data }, 'only a scatter series takes one');
  });
});
