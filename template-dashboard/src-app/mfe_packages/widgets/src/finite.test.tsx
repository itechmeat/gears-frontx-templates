import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import type { ReactNode } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { MetricCard } from './cards/MetricCard';
import { ProgressListCard } from './cards/ProgressListCard';
import { RadialProgress } from './cards/RadialProgress';
import { RankedListCard } from './cards/RankedListCard';
import { SummaryCard } from './cards/SummaryCard';
import { CartesianChart } from './chart/CartesianChart';
import { PieChart } from './chart/PieChart';
import { GridWidget } from './grid/GridWidget';
import { Heatmap } from './heatmap/Heatmap';
import { METRIC_CARD_SAMPLE, PROGRESS_LIST_CARD_SAMPLE, RANKED_LIST_CARD_SAMPLE, SUMMARY_CARD_SAMPLE } from './samples';

type Payload = object;
// The table hands each widget its own payload with one number changed, so the drawing takes any payload.
type Draw = (payload: never) => ReactNode;

const CARTESIAN = (axis: 'value' | 'time', type: 'line' | 'scatter' = 'line'): Payload => ({
  render: { x_axis: { type: axis }, series: [{ name: 'Load', type }], reference_lines: [{ value: 5 }] },
  data: { series: [{ name: 'Load', points: [1, 2].map((x) => ({ x, y: x, ...(type === 'scatter' ? { size: x } : {}) })) }] },
});

/** One valid payload per catalog widget with numbers, and the number fields of each, as paths into the payload. */
const WIDGETS: Array<{ widget: string; draw: Draw; payload: Payload; inputs: string[] }> = [
  {
    widget: 'metric_card',
    draw: (payload) => <MetricCard payload={payload} />,
    payload: { ...METRIC_CARD_SAMPLE, data: { ...METRIC_CARD_SAMPLE.data, reference_value: 1 }, value_format: { value_type: 'number', decimals: 0 } },
    inputs: ['data.value', 'data.previous_value', 'data.reference_value', 'data.sparkline[2]', 'value_format.decimals'],
  },
  { widget: 'summary_card', draw: (payload) => <SummaryCard payload={payload} />, payload: SUMMARY_CARD_SAMPLE, inputs: ['data.rows[1].value'] },
  {
    widget: 'ranked_list_card',
    draw: (payload) => <RankedListCard payload={payload} />,
    payload: RANKED_LIST_CARD_SAMPLE,
    inputs: ['data.rows[1].label', 'data.rows[1].value', 'data.rows[1].secondary'],
  },
  {
    widget: 'progress_list_card',
    draw: (payload) => <ProgressListCard payload={payload} />,
    payload: { ...PROGRESS_LIST_CARD_SAMPLE, data: { rows: [PROGRESS_LIST_CARD_SAMPLE.data.rows[0], { label: 7, current: 1, target: 2, goal: 3 }] } },
    inputs: ['data.rows[1].label', 'data.rows[1].current', 'data.rows[1].target', 'data.rows[1].goal'],
  },
  {
    widget: 'radial_progress',
    draw: (payload) => <RadialProgress payload={payload} />,
    payload: { render: {}, data: { current: 1, target: 2, goal: 3 } },
    inputs: ['data.current', 'data.target', 'data.goal'],
  },
  {
    widget: 'pie_chart',
    draw: (payload) => <PieChart payload={payload} />,
    payload: { render: {}, data: { slices: [{ label: 'a', value: 1 }, { label: 2, value: 2 }] } },
    inputs: ['data.slices[1].label', 'data.slices[1].value'],
  },
  {
    widget: 'heatmap',
    draw: (payload) => <Heatmap payload={payload} />,
    payload: { render: { min_value: 0, max_value: 10 }, data: { rows: [{ x: 1, y: 1, value: 1 }, { x: 2, y: 2, value: 2 }] } },
    inputs: ['data.rows[1].x', 'data.rows[1].y', 'data.rows[1].value', 'render.min_value', 'render.max_value'],
  },
  {
    widget: 'cartesian_chart',
    draw: (payload) => <CartesianChart payload={payload} />,
    payload: CARTESIAN('value', 'scatter'),
    inputs: ['data.series[0].points[1].x', 'data.series[0].points[1].y', 'data.series[0].points[1].size', 'render.reference_lines[0].value'],
  },
  { widget: 'cartesian_chart', draw: (payload) => <CartesianChart payload={payload} />, payload: CARTESIAN('time'), inputs: ['data.series[0].points[1].x'] },
  {
    widget: 'grid',
    draw: (payload) => <GridWidget payload={payload} />,
    payload: {
      render: { columns: [{ key: 'n', width: 80 }, { key: 'p', kind: 'progress' }, { key: 's', kind: 'sparkline' }], page_sizes: [10], frozen_columns: 1 },
      data: { rows: [[1, 0.5, [1, 2]], [2, 0.25, [3, null, 4]]] },
    },
    inputs: ['data.rows[1][0]', 'data.rows[1][1]', 'data.rows[1][2][2]', 'render.columns[0].width', 'render.page_sizes[0]', 'render.frozen_columns'],
  },
];

/** A copy of the payload with the value at a path such as `data.rows[1].value` replaced. */
function withValueAt(payload: Payload, path: string, value: number): Payload {
  const copy = structuredClone(payload);
  const keys = path.match(/[^.[\]]+/g)!;
  let at = copy as Record<string, unknown>;
  for (const key of keys.slice(0, -1)) at = at[key] as Record<string, unknown>;
  at[keys[keys.length - 1]] = value;
  return copy;
}

describe('numbers that are not finite', () => {
  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  it.each(WIDGETS.map(({ widget, draw, payload }) => [widget, draw, payload] as const))('draws the valid %s payload the table starts from', (_widget, draw, payload) => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => {});
    render(<>{draw(payload as never)}</>);
    expect(screen.queryByText('This widget cannot be shown')).toBeNull();
    expect(error.mock.calls.filter(([line]) => String(line).startsWith('[widget]'))).toEqual([]);
  });

  const rows = WIDGETS.flatMap(({ widget, draw, payload, inputs }) => inputs.flatMap((path) => [NaN, Infinity, -Infinity].map((value) => [widget, path, value, draw, payload] as const)));
  it.each(rows)('fails a %s cell with %s set to %s, naming the field and its position', (widget, path, value, draw, payload) => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => {});
    render(<>{draw(withValueAt(payload, path, value) as never)}</>);
    expect(screen.getByText('This widget cannot be shown')).toBeTruthy();
    expect(error).toHaveBeenCalledWith(`[widget] ${widget}: ${path} is not a finite number`);
  });
});

const BIG = 1.5e308;
const lines = (points: Array<Array<{ x: number; y: number }>>): Payload => ({
  render: { x_axis: { type: 'value' }, series: points.map((_, index) => ({ name: `S${index}`, type: 'line' })) },
  data: { series: points.map((list, index) => ({ name: `S${index}`, points: list })) },
});
const metric = (data: object): Payload => ({ render: {}, data });

/**
 * Derived numbers: every input is finite, but a difference, ratio, sum, span or scale built from them would overflow
 * or divide by 0. Each case names what the widget must still draw (selectors, and the text it must show), and no text,
 * style or SVG path may show a number that is not finite.
 */
const DERIVED: Array<{ name: string; draw: Draw; payload: Payload; shows: string[]; text?: RegExp }> = [
  // The percent is left out; the direction stays.
  { name: 'a metric trend of 1 against 1e-320', draw: (payload) => <MetricCard payload={payload} />, payload: metric({ value: 1, previous_value: 1e-320 }), shows: ['[aria-label="Up"]'], text: /^[^%]*$/ },
  { name: 'a metric trend of -1.5e308 against 1.5e308', draw: (payload) => <MetricCard payload={payload} />, payload: metric({ value: -BIG, previous_value: BIG }), shows: ['[aria-label="Down"]'], text: /-200%/ },
  // The absolute difference is beyond the largest number: the percent alone.
  { name: 'a metric reference of 1.5e308 against -1.5e308', draw: (payload) => <MetricCard payload={payload} />, payload: metric({ value: BIG, reference_value: -BIG }), shows: [], text: /: \+200%$/ },
  { name: 'a metric reference of 1 against 1e-320', draw: (payload) => <MetricCard payload={payload} />, payload: metric({ value: 1, reference_value: 1e-320 }), shows: [], text: /: \+1$/ },
  {
    name: 'a heatmap of 1.5e308 and -1.5e308 with no scale ends',
    draw: (payload) => <Heatmap payload={payload} />,
    payload: { render: { show_cell_values: true }, data: { rows: [{ x: 'a', y: 'a', value: BIG }, { x: 'b', y: 'a', value: -BIG }, { x: 'c', y: 'a', value: 0 }] } },
    shows: ['[style*="--heat-mix: 100%"]', '[style*="--heat-mix: 0%"]', '[style*="--heat-mix: 50%"]'],
  },
  {
    name: 'a heatmap whose scale ends are -1.5e308 and 1.5e308',
    draw: (payload) => <Heatmap payload={payload} />,
    payload: { render: { min_value: -BIG, max_value: BIG }, data: { rows: [{ x: 'a', y: 'a', value: 1 }, { x: 'b', y: 'a', value: BIG }] } },
    shows: ['[style*="--heat-mix: 50%"]', '[style*="--heat-mix: 100%"]'],
  },
  {
    name: 'a grid sparkline of 0 and 5e-324',
    draw: (payload) => <GridWidget payload={payload} />,
    payload: { render: { columns: [{ key: 's', kind: 'sparkline' }] }, data: { rows: [[[0, 5e-324]]] } },
    shows: ['svg path[d="M0.00 12.00 L100.00 12.00"]'],
  },
  {
    name: 'a grid sparkline of 1.5e308, -1.5e308 and 0',
    draw: (payload) => <GridWidget payload={payload} />,
    payload: { render: { columns: [{ key: 's', kind: 'sparkline' }] }, data: { rows: [[[BIG, -BIG, 0]]] } },
    shows: ['svg path[d="M0.00 2.00 L50.00 22.00 L100.00 12.00"]'],
  },
  {
    name: 'a progress list whose current and goal over target overflow',
    draw: (payload) => <ProgressListCard payload={payload} />,
    payload: { render: {}, data: { rows: [{ label: 'a', current: BIG, target: 1e-300, goal: BIG }] } },
    shows: ['[style*="--goal-at: 100%"]'],
  },
  // The percent is left out: the value text starts with the value and has no percent. The ring is full and the goal
  // tick stands at its end. The hole is empty because the value, 309 digits with their separators, fits no hole.
  {
    name: 'a radial progress whose current and goal over target overflow',
    draw: (payload) => <RadialProgress payload={payload} />,
    payload: { render: { display: 'both' }, data: { current: BIG, target: 1e-300, goal: BIG } },
    shows: ['[stroke-dasharray="100 100"]', '[class*="radialGoal"]', '[aria-valuenow="100"]', '[aria-valuetext^="150,000,000"]:not([aria-valuetext*="%"])'],
    text: /^$/,
  },
  {
    name: 'a donut of two 1e308 slices, whose total overflows',
    draw: (payload) => <PieChart payload={payload} />,
    payload: { render: { radius: ['50%', '80%'], center: 'total' }, data: { slices: [{ label: 'a', value: 1e308 }, { label: 'b', value: 1e308 }] } },
    shows: ['.recharts-pie-sector:nth-of-type(2)'],
  },
  {
    name: 'a percent stack of two 1e308 values',
    draw: (payload) => <CartesianChart payload={payload} />,
    payload: {
      render: { stack_mode: 'percent', series: [{ name: 'a', type: 'bar', stack_group: 'g' }, { name: 'b', type: 'bar', stack_group: 'g' }] },
      data: { series: [{ name: 'a', points: [{ x: 'p', y: 1e308 }] }, { name: 'b', points: [{ x: 'p', y: 1e308 }] }] },
    },
    shows: ['.recharts-bar-rectangle path'],
  },
  {
    name: 'a stacked line total of two 1e308 values',
    draw: (payload) => <CartesianChart payload={payload} />,
    payload: {
      render: { series: [{ name: 'a', type: 'line', stack_group: 'g' }, { name: 'b', type: 'line', stack_group: 'g' }] },
      data: { series: [{ name: 'a', points: [{ x: 'p', y: 1e308 }, { x: 'q', y: 1 }] }, { name: 'b', points: [{ x: 'p', y: 1e308 }, { x: 'q', y: 1 }] }] },
    },
    shows: ['.recharts-line-curve'],
  },
  { name: 'a line from 1.5e308 to -1.5e308', draw: (payload) => <CartesianChart payload={payload} />, payload: lines([[{ x: 1, y: BIG }, { x: 2, y: -BIG }]]), shows: ['svg.recharts-surface'] },
  {
    name: 'a line filled in between x values 1.5e308 apart',
    draw: (payload) => <CartesianChart payload={payload} />,
    payload: lines([[{ x: -BIG, y: 1 }, { x: BIG, y: 3 }], [{ x: 0, y: 1 }]]),
    shows: ['.recharts-line-curve'],
  },
];

describe('derived numbers', () => {
  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  it.each(DERIVED)('$name draws with no infinity and no NaN in its text, styles or paths', async ({ draw, payload, shows, text }) => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => {});
    const { container } = render(<>{draw(payload as never)}</>);
    // The grid loads its rows through the kit's load callback, after the first render.
    await waitFor(() => expect(shows.filter((selector) => !container.querySelector(selector))).toEqual([]));
    expect(screen.queryByText('This widget cannot be shown')).toBeNull();
    expect(error.mock.calls.filter(([line]) => String(line).startsWith('[widget]'))).toEqual([]);
    expect(container.innerHTML).not.toMatch(/∞|NaN|Infinity/);
    if (text) expect(container.textContent).toMatch(text);
  });
});

/*
 * One table of shares, part over whole, run through every place that shows or announces a share as a percent. Each
 * place keeps its own rounding rule on the share snapped by the shared helper (`percentOfShare` in format.ts):
 * - radial: the hole and the value text, rounded down to a whole percent, never 100% below the target;
 * - ring: the radial ring's `aria-valuenow`, the nearest hundredth, at most 100;
 * - bar and goal: a progress_list_card row's `aria-valuenow` and its goal mark, the nearest hundredth, at most 100;
 * - grid: a grid progress cell, nearest with up to 2 decimals (a progress value is 0 to 1, so not above the whole);
 * - stack: the share in a percent stack's tooltip, nearest with up to 1 decimal (members part and whole minus part);
 * - change: a metric card's percent from its reference (`part` against `whole`), nearest with up to 2 decimals, signed.
 * The last three rows sit on a half of a place's last digit, where the unsnapped share rounds the wrong way.
 */
const SHARES: Array<{ part: number; whole: number; radial: string; ring: string; bar: string; grid: string | null; stack: string | null; change: string }> = [
  { part: 29, whole: 100, radial: '29%', ring: '29', bar: '29', grid: '29%', stack: '29%', change: '-71%' },
  { part: 57, whole: 100, radial: '57%', ring: '57', bar: '57', grid: '57%', stack: '57%', change: '-43%' },
  { part: 58, whole: 100, radial: '58%', ring: '58', bar: '58', grid: '58%', stack: '58%', change: '-42%' },
  { part: 29, whole: 50, radial: '58%', ring: '58', bar: '58', grid: '58%', stack: '58%', change: '-42%' },
  { part: 0.21, whole: 0.28, radial: '75%', ring: '75', bar: '75', grid: '75%', stack: '75%', change: '-25%' },
  { part: 0.09, whole: 0.1, radial: '90%', ring: '90', bar: '90', grid: '90%', stack: '90%', change: '-10%' },
  { part: 0.09, whole: 0.05, radial: '180%', ring: '100', bar: '100', grid: null, stack: null, change: '+80%' },
  { part: 1, whole: 80, radial: '1%', ring: '1.25', bar: '1.25', grid: '1.25%', stack: '1.3%', change: '-98.75%' },
  { part: 34, whole: 48, radial: '70%', ring: '70.83', bar: '70.83', grid: '70.83%', stack: '70.8%', change: '-29.17%' },
  { part: 2.01, whole: 200, radial: '1%', ring: '1.01', bar: '1.01', grid: '1.01%', stack: '1%', change: '-99%' },
  { part: 0.7, whole: 200, radial: '0%', ring: '0.35', bar: '0.35', grid: '0.35%', stack: '0.4%', change: '-99.65%' },
  { part: 0.05, whole: 200, radial: '0%', ring: '0.03', bar: '0.03', grid: '0.03%', stack: '0%', change: '-99.98%' },
];

describe.each(SHARES)('$part of $whole shown as a percent', ({ part, whole, radial, ring, bar, grid, stack, change }) => {
  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  it(`radial: ${radial} in the hole and the value text, the ring at ${ring}`, () => {
    const { container } = render(<RadialProgress payload={{ render: {}, data: { current: part, target: whole } }} />);
    const ringBar = within(container).getByRole('progressbar');
    expect([container.querySelector('svg text')?.textContent, ringBar.getAttribute('aria-valuetext')?.split(', ')[0]]).toEqual([radial, radial]);
    expect(ringBar.getAttribute('aria-valuenow')).toBe(ring);
  });

  it(`progress_list_card: the bar and its goal mark at ${bar}`, () => {
    const { container } = render(<ProgressListCard payload={{ render: {}, data: { rows: [{ label: 'Row', current: part, target: whole, goal: part }] } }} />);
    expect(within(container).getByRole('progressbar').getAttribute('aria-valuenow')).toBe(bar);
    expect(container.querySelector<HTMLElement>('[class*="progressGoal"]')!.style.getPropertyValue('--goal-at')).toBe(`${bar}%`);
  });

  it(`metric_card: ${change} from the reference`, () => {
    const { container } = render(<MetricCard payload={{ render: {}, data: { value: part, reference_value: whole } }} />);
    expect(container.textContent?.match(/\(([^)]+)\)/)?.[1]).toBe(change);
  });

  it.skipIf(grid === null)(`grid: a progress cell shows ${grid}`, async () => {
    const { container } = render(<GridWidget payload={{ render: { columns: [{ key: 'p', kind: 'progress' }] }, data: { rows: [[part / whole]] } }} />);
    await waitFor(() => expect(container.querySelector('[class*="gridProgressText"]')?.textContent).toBe(grid));
  });

  it.skipIf(stack === null)(`cartesian_chart: the percent stack tooltip shows ${stack}`, async () => {
    const series = [
      { name: 'Part', points: [{ x: 'Web', y: part }] },
      { name: 'Rest', points: [{ x: 'Web', y: Number((whole - part).toPrecision(12)) }] },
    ];
    const stackRender = { stack_mode: 'percent' as const, series: series.map(({ name }) => ({ name, type: 'bar' as const, stack_group: 'all' })) };
    const { container } = render(<CartesianChart payload={{ render: stackRender, data: { series } }} />);
    fireEvent.mouseMove(container.querySelector('.recharts-wrapper')!, { clientX: 300, clientY: 100, pageX: 300, pageY: 100 });
    await waitFor(() => expect(container.querySelector('.recharts-tooltip-wrapper')?.textContent?.match(/^WebPart\S+ \(([^)]+)\)/)?.[1]).toBe(stack));
  });
});
