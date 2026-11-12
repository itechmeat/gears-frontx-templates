import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';

import type { HeatmapData } from '../types';
import { DEFAULT_WIDGET_TEXTS, type WidgetTexts } from '../states';
import { HEATMAP_SAMPLE } from '../samples';
import { Heatmap, calendarOf, checkHeatmap } from './Heatmap';

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

  it.each([
    ['min_value above every value', { min_value: 50 }, ['0%', '0%', '0%']],
    ['max_value below every value', { max_value: -5 }, ['100%', '100%', '100%']],
  ])('keeps the derived scale end on its side with only %s set', (_name, scale, mixes) => {
    const { container } = render(<Heatmap payload={{ render: scale, data: DATA }} label="Commits" />);
    const tiles = [...container.querySelectorAll<HTMLElement>('[role="img"]')].filter((tile) => tile.style.getPropertyValue('--heat-mix') !== '');
    expect(tiles.map((tile) => tile.style.getPropertyValue('--heat-mix'))).toEqual(mixes);
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

  it('keeps the values of categories whose labels would collide in a joined key', () => {
    const data: HeatmapData = { rows: [{ x: 'a|string:b', y: 'c', value: 1 }, { x: 'a', y: 'b|string:c', value: 9 }] };
    const { container } = render(<Heatmap payload={{ render: {}, data }} label="Collide" />);
    const names = [...container.querySelectorAll('[role="img"]')].map((tile) => tile.getAttribute('aria-label'));
    expect(names).toContain('a|string:b, c: 1');
    expect(names).toContain('a, b|string:c: 9');
  });

  it('still draws exactly the tile limit', () => {
    const rows = Array.from({ length: 100 }, (_, index) => ({ x: index, y: index, value: index }));
    const { container } = render(<Heatmap payload={{ render: {}, data: { rows } }} label="Limit" />);
    expect(container.querySelectorAll('[role="img"]')).toHaveLength(10_000);
  });

  it('fails its own check instead of drawing more tiles than its limit', () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const rows = Array.from({ length: 101 }, (_, index) => ({ x: index, y: index, value: index }));
    render(<Heatmap payload={{ render: {}, data: { rows } }} label="Diagonal" />);
    expect(screen.getByText('This widget cannot be shown')).toBeTruthy();
  });

  it('treats a row without y like a null y in matrix mode', () => {
    const { container } = render(<Heatmap payload={{ render: {}, data: { rows: [{ x: 'a', value: 1 }, { x: 'b', y: null, value: 2 }] } }} label="No y" />);
    expect([...container.querySelectorAll('[role="img"]')].map((tile) => tile.getAttribute('aria-label'))).toEqual(['a: 1', 'b: 2']);
  });
});

// Thursday 2026-10-01 to Tuesday 2026-11-03; 2026-10-02 has no row, 2026-10-05 a null value.
const DAYS: HeatmapData = {
  rows: [
    { x: '2026-10-01', value: 4 },
    { x: '2026-10-03', y: null, value: 0 },
    { x: '2026-10-05', value: null },
    { x: '2026-10-14', value: 8 },
    { x: '2026-11-03', value: 2 },
  ],
};

const tileNames = (container: HTMLElement) => [...container.querySelectorAll('.heatCell')].map((tile) => tile.getAttribute('aria-label'));

describe('heatmap in calendar mode', () => {
  afterEach(() => vi.restoreAllMocks());

  it('lays the days out as weeks by weekdays from Monday, with no tile outside the delivered range', () => {
    const layout = calendarOf(DAYS.rows, 'monday', 'en');
    // Monday 2026-09-28 starts the first week, Monday 2026-11-02 the sixth.
    expect(layout.weeks).toBe(6);
    expect(layout.weekdays).toEqual(['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']);
    // The first column: Monday to Wednesday before the first date have no tile, Thursday the 1st has one.
    expect(layout.days.map((line) => line[0]?.date ?? null)).toEqual([null, null, null, '2026-10-01', '2026-10-02', '2026-10-03', '2026-10-04']);
    // The last column ends on the last date, Tuesday the 3rd.
    expect(layout.days.map((line) => line[5]?.date ?? null)).toEqual(['2026-11-02', '2026-11-03', null, null, null, null, null]);
  });

  it('lays the days out from Sunday when week_start is sunday', () => {
    const layout = calendarOf(DAYS.rows, 'sunday', 'en');
    expect(layout.weeks).toBe(6);
    expect(layout.weekdays).toEqual(['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']);
    // Sunday 2026-09-27 starts the first week: the 1st stands on its Thursday line.
    expect(layout.days.map((line) => line[0]?.date ?? null)).toEqual([null, null, null, null, '2026-10-01', '2026-10-02', '2026-10-03']);
    expect(layout.days.map((line) => line[5]?.date ?? null)).toEqual(['2026-11-01', '2026-11-02', '2026-11-03', null, null, null, null]);
  });

  it('labels each month over its first week, as wide as the weeks up to the next month', () => {
    // From Monday 2026-06-01 to Friday 2026-08-14: June, July and August each get their label.
    const rows = Array.from({ length: 75 }, (_, index) => ({ x: new Date(Date.UTC(2026, 5, 1 + index)).toISOString().slice(0, 10), value: index }));
    expect(calendarOf(rows, 'monday', 'en').months).toEqual([
      { start: 0, end: 5, name: 'Jun' },
      { start: 5, end: 9, name: 'Jul' },
      { start: 9, end: 11, name: 'Aug' },
    ]);
    // A month of under two weeks at an end is left without a label: its tiles still name their dates.
    expect(calendarOf(DAYS.rows, 'monday', 'en').months).toEqual([{ start: 0, end: 5, name: 'Oct' }]);
    const { container } = render(<Heatmap payload={{ render: { mode: 'calendar' }, data: { rows } }} label="Daily" />);
    const months = [...container.querySelectorAll<HTMLElement>('.heatMonth')];
    expect(months.map((month) => [month.textContent, month.style.gridColumn])).toEqual([
      ['Jun', '2 / 7'],
      ['Jul', '7 / 11'],
      ['Aug', '11 / 13'],
    ]);
  });

  it('draws a tile per day in range: a day without a row or with a null value is an empty tile', () => {
    const { container } = render(<Heatmap payload={{ render: { mode: 'calendar', show_cell_values: true }, data: DAYS }} label="Daily" />);
    const tiles = [...container.querySelectorAll<HTMLElement>('.heatCell')];
    // 34 days from the 1st of October to the 3rd of November, each once.
    expect(tiles).toHaveLength(34);
    const named = (date: string) => tiles.find((tile) => tile.getAttribute('aria-label')!.startsWith(date))!;
    expect(named('Oct 1, 2026').getAttribute('aria-label')).toBe('Oct 1, 2026: 4');
    expect(named('Oct 1, 2026').style.getPropertyValue('--heat-mix')).toBe('50%');
    expect(named('Oct 1, 2026').textContent).toBe('4');
    expect(named('Oct 2, 2026').getAttribute('aria-label')).toBe('Oct 2, 2026');
    expect(named('Oct 2, 2026').className).toContain('heatEmpty');
    expect(named('Oct 5, 2026').className).toContain('heatEmpty');
    expect(named('Oct 14, 2026').getAttribute('data-strong')).toBe('true');
    // The scale legend shows its ends; the text alternative has no y column.
    expect([...container.querySelectorAll('.heatLegend')].map((cell) => cell.textContent)).toEqual(['08']);
    const table = figure('Daily').getByRole('table', { hidden: true });
    expect(within(table).getAllByRole('columnheader', { hidden: true }).map((cell) => cell.textContent)).toEqual(['x', 'Value']);
  });

  it('takes the render scale ends in calendar mode', () => {
    const { container } = render(<Heatmap payload={{ render: { mode: 'calendar', min_value: 0, max_value: 16 }, data: DAYS }} label="Daily" />);
    expect(tileNames(container)).toContain('Oct 14, 2026: 8');
    const tile = [...container.querySelectorAll<HTMLElement>('.heatCell')].find((cell) => cell.getAttribute('aria-label') === 'Oct 14, 2026: 8')!;
    expect(tile.style.getPropertyValue('--heat-mix')).toBe('50%');
    expect([...container.querySelectorAll('.heatLegend')].map((cell) => cell.textContent)).toEqual(['016']);
  });

  it('fails its own check for a row with a y in calendar mode', () => {
    const data: HeatmapData = { rows: [{ x: '2026-10-01', value: 1 }, { x: '2026-10-02', y: 'Fri', value: 2 }] };
    expect(checkHeatmap({ mode: 'calendar' }, data)).toBe('heatmap: row 1 has a y, and calendar mode takes none');
    expect(checkHeatmap({ mode: 'calendar' }, { rows: [{ x: '2026-10-02', y: 0, value: 2 }] })).toContain('row 0 has a y');
    expect(checkHeatmap({ mode: 'calendar' }, DAYS)).toBeNull();
    const errors = vi.spyOn(console, 'error').mockImplementation(() => {});
    render(<Heatmap payload={{ render: { mode: 'calendar' }, data }} />);
    expect(screen.getByText('This widget cannot be shown')).toBeTruthy();
    expect(errors.mock.calls.map((call) => String(call[0]))).toEqual([expect.stringContaining('row 1 has a y')]);
  });

  it.each([['a date-time', '2026-10-01T00:00:00Z'], ['no date of the calendar', '2026-02-30'], ['a weekday', 'Mon'], ['a number', 20261001], ['null', null]])(
    'fails its own check for an x that is %s in calendar mode',
    (_name, x) => {
      expect(checkHeatmap({ mode: 'calendar' }, { rows: [{ x: '2026-10-01', value: 1 }, { x, value: 2 }] })).toBe('heatmap: row 1 has an x that is not a YYYY-MM-DD date, as calendar mode needs');
      const errors = vi.spyOn(console, 'error').mockImplementation(() => {});
      render(<Heatmap payload={{ render: { mode: 'calendar' }, data: { rows: [{ x, value: 2 }] } }} />);
      expect(screen.getByText('This widget cannot be shown')).toBeTruthy();
      expect(errors).toHaveBeenCalled();
    },
  );

  it('fails its own check for week_start outside calendar mode', () => {
    expect(checkHeatmap({ week_start: 'sunday' })).toBe('heatmap: week_start applies only in calendar mode, and the mode is matrix');
    expect(checkHeatmap({ mode: 'matrix', week_start: 'monday' })).toBe('heatmap: week_start applies only in calendar mode, and the mode is matrix');
    expect(checkHeatmap({ mode: 'calendar', week_start: 'sunday' }, DAYS)).toBeNull();
    const errors = vi.spyOn(console, 'error').mockImplementation(() => {});
    render(<Heatmap payload={{ render: { week_start: 'monday' }, data: DATA }} />);
    expect(screen.getByText('This widget cannot be shown')).toBeTruthy();
    expect(errors.mock.calls.map((call) => String(call[0]))).toEqual([expect.stringContaining('week_start applies only in calendar mode')]);
  });

  it('draws no button and no clickable tile with drill-down off, so Tab reaches no tile', async () => {
    const user = userEvent.setup();
    const { container } = render(<Heatmap payload={{ render: { mode: 'calendar' }, data: DAYS }} label="Daily" />);
    expect(screen.queryByRole('button')).toBeNull();
    expect(container.querySelectorAll('button, [tabindex]')).toHaveLength(0);
    await user.tab();
    expect(document.activeElement).toBe(document.body);
  });

  it('opens the data view with the clicked tile picked, with drill-down on', async () => {
    const user = userEvent.setup();
    render(<Heatmap payload={{ render: { mode: 'calendar', drill_down: true }, data: DAYS }} label="Daily" />);
    // Only a day with a row is a button: the 2nd of October has none and stays an image.
    expect(screen.queryByRole('button', { name: 'Oct 2, 2026' })).toBeNull();
    await user.click(screen.getByRole('button', { name: 'Oct 14, 2026: 8' }));
    const region = await screen.findByRole('region', { name: 'Data of Daily' });
    expect(await within(region).findByText('2026-10-14', { selector: '[aria-current="true"]' })).toBeTruthy();
    // The button switches back to the calendar.
    await user.click(screen.getByRole('button', { name: 'Show chart' }));
    expect(screen.getByRole('button', { name: 'Oct 14, 2026: 8' })).toBeTruthy();
  });

  it('reaches the tiles by Tab with drill-down on and opens one by Enter', async () => {
    const user = userEvent.setup();
    render(<Heatmap payload={{ render: { mode: 'calendar', drill_down: true }, data: DAYS }} label="Daily" />);
    await user.tab();
    expect(document.activeElement?.textContent).toBe('Show data');
    await user.tab();
    // The tiles follow in weekday lines: the first is the first Monday's, the 5th of October (a null value, but a row).
    expect(document.activeElement?.getAttribute('aria-label')).toBe('Oct 5, 2026');
    await user.keyboard('{Enter}');
    const region = await screen.findByRole('region', { name: 'Data of Daily' });
    expect(await within(region).findByText('2026-10-05', { selector: '[aria-current="true"]' })).toBeTruthy();
  });

  it('opens the data view from a matrix tile too, with drill-down on', async () => {
    const user = userEvent.setup();
    render(<Heatmap payload={{ render: { drill_down: true }, data: DATA }} label="Commits" />);
    await user.click(screen.getByRole('button', { name: '08:00, Mon: 9' }));
    const region = await screen.findByRole('region', { name: 'Data of Commits' });
    expect(await within(region).findByText('08:00', { selector: '[aria-current="true"]' })).toBeTruthy();
  });
});
