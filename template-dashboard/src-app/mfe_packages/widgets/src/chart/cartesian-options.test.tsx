import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';

import type { CartesianData, CartesianRender } from '../types';
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
  ] as const)('marks the %s of a line on its first occurrence, with the value', (asked, kinds) => {
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

  it('draws no mark for a series of nulls', () => {
    const { container } = render(
      <CartesianChart payload={{ render: { series: [{ name: 'Load', type: 'line', mark_extremes: 'both' }, { name: 'Empty', type: 'line', mark_extremes: 'both' }] }, data: { series: [...WEEK.series, { name: 'Empty', points: [{ x: 'Mon', y: null }] }] } }} />,
    );
    expect(container.querySelectorAll('[data-extreme-mark]')).toHaveLength(2);
  });

  it('fails its own check for mark_extremes on a bar or scatter series', () => {
    expect(checkCartesian({ series: [{ name: 'Load', type: 'bar', mark_extremes: 'max' }] }, WEEK)).toBe('cartesian_chart: series option 0 is a bar, and mark_extremes applies to a line or area');
    expect(checkCartesian({ series: [{ name: 'Load', type: 'scatter', mark_extremes: 'min' }] }, WEEK)).toContain('series option 0 is a scatter');
    failsWith({ render: { series: [{ name: 'Load', type: 'bar', mark_extremes: 'both' }] }, data: WEEK }, 'mark_extremes applies to a line or area');
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
    expect(lineOf(container)).toBeDefined();
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
