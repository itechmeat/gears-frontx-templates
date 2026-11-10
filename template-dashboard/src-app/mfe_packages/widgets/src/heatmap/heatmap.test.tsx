import { render, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import type { HeatmapData } from '../types';
import { DEFAULT_WIDGET_TEXTS, type WidgetTexts } from '../states';
import { HEATMAP_SAMPLE } from './samples';
import { Heatmap, checkHeatmap } from './Heatmap';

// The rows deliver Fri before Mon and 20:00 before 08:00, so first appearance is testable.
const DATA: HeatmapData = {
  rows: [
    { x: '20:00', y: 'Fri', value: 3 },
    { x: '08:00', y: 'Mon', value: 9 },
    { x: '20:00', y: 'Mon', value: 1 },
    { x: '08:00', y: 'Fri', value: null },
  ],
};

const figure = (name: string) => within(screen.getByRole('figure', { name }));

describe('heatmap', () => {
  afterEach(() => vi.restoreAllMocks());

  it('draws the categories in the order of their first appearance, under the axis labels the render names', () => {
    const { container } = render(<Heatmap payload={{ render: { x_axis_label: 'Hour (UTC)', y_axis_label: 'Day' }, data: DATA }} label="Commits by hour" />);
    const rows = [...container.querySelectorAll('.heatRowAxis')].map((cell) => cell.textContent);
    const columns = [...container.querySelectorAll('.heatColumnAxis')].map((cell) => cell.textContent);
    expect(rows).toEqual(['Fri', 'Mon']);
    expect(columns).toEqual(['20:00', '08:00']);
    // The y-axis title over the row labels, the x-axis title under the columns.
    expect([...container.querySelectorAll('.heatTitle')].map((cell) => cell.textContent)).toEqual(['Day', 'Hour (UTC)']);
  });

  it('names every tile with its x, y and value, and colours it by its place on the scale', () => {
    const { container } = render(<Heatmap payload={{ render: { x_axis_label: 'Hour', y_axis_label: 'Day', show_cell_values: true }, data: DATA }} label="Commits" />);
    const tiles = [...container.querySelectorAll<HTMLElement>('[role="img"]')];
    expect(tiles.map((tile) => tile.getAttribute('title'))).toEqual(['20:00, Fri: 3', '08:00, Fri', '20:00, Mon: 1', '08:00, Mon: 9']);
    expect(tiles.map((tile) => tile.getAttribute('aria-label'))).toEqual(tiles.map((tile) => tile.getAttribute('title')));
    // The highest value mixes the whole chart colour over the card surface; a quarter of the scale, a quarter of it.
    expect(tiles[3].style.getPropertyValue('--heat-mix')).toBe('100%');
    expect(tiles[0].style.getPropertyValue('--heat-mix')).toBe('25%');
    expect(tiles[0].getAttribute('data-strong')).toBeNull();
    expect(tiles[3].getAttribute('data-strong')).toBe('true');
    // With show_cell_values the number stands in the tile; a null value leaves the tile empty.
    expect(tiles[3].textContent).toBe('9');
    expect(tiles[1].textContent).toBe('');
    expect(tiles[1].className).toContain('heatEmpty');
  });

  it('shows the empty state for no rows', () => {
    render(<Heatmap payload={{ render: {}, data: { rows: [] } }} />);
    expect(screen.getByText('No data to show')).toBeTruthy();
  });

  it('fails its own scale check when min_value is greater than max_value', () => {
    expect(checkHeatmap({ min_value: 5, max_value: 1 })).toContain('min_value 5 is greater than max_value 1');
    expect(checkHeatmap({ min_value: 1, max_value: 1 })).toBeNull();
    expect(checkHeatmap({ min_value: 1 })).toBeNull();
    expect(checkHeatmap({ max_value: 1 })).toBeNull();
    expect(checkHeatmap({ min_value: null, max_value: 1 })).toBeNull();
    expect(checkHeatmap({})).toBeNull();
    const errors = vi.spyOn(console, 'error').mockImplementation(() => {});
    render(<Heatmap payload={{ render: { min_value: 5, max_value: 1 }, data: DATA }} />);
    expect(screen.getByText('This widget cannot be shown')).toBeTruthy();
    expect(errors.mock.calls.map((call) => String(call[0]))).toEqual([expect.stringContaining('min_value 5 is greater than max_value 1')]);
  });

  it('takes the scale ends the render sets, and shows them as numbers under the grid', () => {
    const { container, unmount } = render(<Heatmap payload={{ render: { min_value: 0, max_value: 100 }, data: DATA }} label="Commits" />);
    expect([...container.querySelectorAll('.heatLegend')].map((cell) => cell.textContent)).toEqual(['0100']);
    unmount();
    // Without the render's ends, the delivered values bound the scale.
    const { container: free } = render(<Heatmap payload={{ render: {}, data: DATA }} label="Commits" />);
    expect([...free.querySelectorAll('.heatLegend')].map((cell) => cell.textContent)).toEqual(['19']);
  });

  it('offers a named text alternative of the delivered x, y and values', () => {
    render(<Heatmap payload={{ render: { x_axis_label: 'Hour', y_axis_label: 'Day' }, value_format: { value_type: 'percent' }, data: DATA }} label="Commits by hour" />);
    const table = figure('Commits by hour').getByRole('table', { hidden: true });
    expect(within(table).getAllByRole('columnheader', { hidden: true }).map((cell) => cell.textContent)).toEqual(['Hour', 'Day', 'Value']);
    expect(within(table).getAllByRole('row', { hidden: true }).map((row) => row.textContent)).toEqual(['HourDayValue', '20:00Fri300%', '08:00Mon900%', '20:00Mon100%', '08:00Fri']);
  });

  it('names the figure and the unnamed columns from the texts', () => {
    const texts: WidgetTexts = { ...DEFAULT_WIDGET_TEXTS, chart: 'Waermebild', columns: { ...DEFAULT_WIDGET_TEXTS.columns, x: 'Stunde', y: 'Tag', value: 'Wert' } };
    render(<Heatmap payload={{ render: {}, data: DATA }} texts={texts} />);
    const table = figure('Waermebild').getByRole('table', { hidden: true });
    expect(within(table).getAllByRole('columnheader', { hidden: true }).map((cell) => cell.textContent)).toEqual(['Stunde', 'Tag', 'Wert']);
  });

  it('renders the sample: commits by weekday and two-hour block', () => {
    const { container } = render(<Heatmap payload={HEATMAP_SAMPLE} label="Commits by hour" />);
    const xs = new Set(HEATMAP_SAMPLE.data.rows.map((row) => row.x)).size;
    const ys = new Set(HEATMAP_SAMPLE.data.rows.map((row) => row.y)).size;
    expect(container.querySelectorAll('[role="img"]').length).toBe(xs * ys);
    expect([...container.querySelectorAll('.heatTitle')].map((cell) => cell.textContent)).toEqual(['Weekday', 'Hour (UTC)']);
  });
});
