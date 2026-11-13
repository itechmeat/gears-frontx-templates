import { cleanup, render, screen } from '@testing-library/react';
import type { ReactNode } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { MetricCard } from './cards/MetricCard';
import { ProgressListCard } from './cards/ProgressListCard';
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
