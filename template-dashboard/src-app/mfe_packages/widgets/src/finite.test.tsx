import { cleanup, render, screen, waitFor } from '@testing-library/react';
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
