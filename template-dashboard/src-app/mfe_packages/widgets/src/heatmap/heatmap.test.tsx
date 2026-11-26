import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';

import type { HeatmapData, HeatmapRender } from '../types';
import { DEFAULT_WIDGET_TEXTS, type WidgetTexts } from '../states';
import { HEATMAP_SAMPLE } from '../samples';
import { Heatmap, MAX_HEATMAP_TILES, checkHeatmap } from './Heatmap';
import { dayOf } from '../time';

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
    // The highest value mixes the whole chart colour over the card surface; a quarter of the scale, a quarter of the
    // way from the 20% floor to it.
    expect(tiles[3].style.getPropertyValue('--heat-mix')).toBe('100%');
    expect(tiles[0].style.getPropertyValue('--heat-mix')).toBe('40%');
    expect(tiles[0].getAttribute('data-strong')).toBeNull();
    expect(tiles[3].getAttribute('data-strong')).toBe('true');
    // With show_cell_values the number stands in the tile; a null value leaves the tile empty.
    expect(tiles[3].textContent).toBe('9');
    expect(tiles[1].textContent).toBe('');
    expect(tiles[1].className).toContain('heatEmpty');
  });

  it('draws the lowest value at the colour floor, so it never reads like a tile without a value', () => {
    const { container } = render(<Heatmap payload={{ render: {}, data: DATA }} label="Commits" />);
    const [, empty, lowest] = [...container.querySelectorAll<HTMLElement>('[role="img"]')];
    expect(lowest.getAttribute('aria-label')).toBe('20:00, Mon: 1');
    expect(lowest.style.getPropertyValue('--heat-mix')).toBe('20%');
    expect(lowest.className).not.toContain('heatEmpty');
    expect(empty.getAttribute('aria-label')).toBe('08:00, Fri');
    expect(empty.style.getPropertyValue('--heat-mix')).toBe('');
    expect(empty.className).toContain('heatEmpty');
    // The scale legend starts at the same floor.
    expect(container.querySelector<HTMLElement>('.heatScale')!.style.getPropertyValue('--heat-floor')).toBe('20%');
  });

  it('shows the empty state for no rows', () => {
    render(<Heatmap payload={{ render: {}, data: { rows: [] } }} />);
    expect(screen.getByText('No data to show')).toBeTruthy();
  });

  it.each([
    ['min_value above every value', { min_value: 50 }, ['20%', '20%', '20%']],
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
    // Measured: about 0.9 to 1.5 s alone, 1.5 s in the full suite at load 25, and one 6.5 s timeout at heavier load.
  }, 20_000);

  it('fails its own check instead of drawing more tiles than its limit', () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const rows = Array.from({ length: 101 }, (_, index) => ({ x: index, y: index, value: index }));
    render(<Heatmap payload={{ render: {}, data: { rows } }} label="Diagonal" />);
    expect(screen.getByText('This widget cannot be shown')).toBeTruthy();
  });

  describe('x labels wider than their columns', () => {
    // Twelve two-hour blocks, as the hour heatmap of the reference dashboard.
    const HOURS: HeatmapData = { rows: Array.from({ length: 12 }, (_, block) => ({ x: `${String(block * 2).padStart(2, '0')}:00`, y: 'Mon', value: block })) };
    /**
     * jsdom lays nothing out: a tile measures `tile` px wide and every x label `label` px, as on a page of the given
     * width, and the first column starts `before` px into the grid, after the y labels. jsdom applies no stylesheet, so
     * the columns stand with no gap.
     */
    const measure = (tile: number, label: number, before = 40) => {
      vi.spyOn(Element.prototype, 'getBoundingClientRect').mockImplementation(function (this: Element) {
        const cell = this.classList.contains('heatCell');
        const width = cell ? tile : 0;
        const left = cell ? before : 0;
        return { width, height: 0, top: 0, left, right: left + width, bottom: 0, x: left, y: 0, toJSON: () => ({}) } as DOMRect;
      });
      vi.spyOn(Element.prototype, 'scrollWidth', 'get').mockImplementation(function (this: Element) {
        return this.classList.contains('heatColumnAxis') ? label : 0;
      });
    };
    const named = (container: HTMLElement) =>
      [...container.querySelectorAll<HTMLElement>('.heatColumnAxis')].filter((label) => !label.classList.contains('heatColumnAxisSkipped')).map((label) => label.textContent);

    it('names every second column when a label is wider than its column, each label whole under its own column', () => {
      // A 390 px wide page: 20 px tiles under 30 px labels.
      measure(20, 30);
      const { container } = render(<Heatmap payload={{ render: { x_axis_label: 'Hour' }, data: HOURS }} label="Commits by hour" />);
      expect(named(container)).toEqual(['00:00', '04:00', '08:00', '12:00', '16:00', '20:00']);
      const first = container.querySelector<HTMLElement>('.heatColumnAxisThin')!;
      // Room for the label under its own column and the unnamed one beside it, never more: it is not cut, nor does it reach the next named one.
      expect(parseFloat(first.style.maxInlineSize)).toBeGreaterThanOrEqual(30);
      expect(parseFloat(first.style.maxInlineSize)).toBeLessThanOrEqual(44);
      // The skipped labels stay in the layout, so they are measured again when the cell grows.
      expect(container.querySelectorAll('.heatColumnAxis')).toHaveLength(12);
    });

    it('names a third of the columns when even two columns are too narrow for a label', () => {
      measure(12, 30);
      const { container } = render(<Heatmap payload={{ render: {}, data: HOURS }} label="Commits by hour" />);
      expect(named(container)).toEqual(['00:00', '06:00', '12:00', '18:00']);
    });

    /**
     * The named labels as their spans on the x axis, from their justifySelf and maxInlineSize, with columns `tile` px
     * wide and no gap: a centred label straddles its column's centre, a start one starts at its column, an end one ends
     * at it.
     */
    const spans = (container: HTMLElement, tile: number, label: number) =>
      [...container.querySelectorAll<HTMLElement>('.heatColumnAxis')].flatMap((element, index) => {
        if (element.classList.contains('heatColumnAxisSkipped')) return [];
        const width = Math.min(label, parseFloat(element.style.maxInlineSize));
        const align = element.style.justifySelf;
        let left = index * tile + (tile - width) / 2;
        if (align === 'start') left = index * tile;
        if (align === 'end') left = (index + 1) * tile - width;
        return [{ index, align, left, right: left + width }];
      });
    const clear = (named: { left: number; right: number }[]) => named.slice(1).every((span, index) => span.left > named[index].right);
    const columns = (count: number): HeatmapData => ({ rows: Array.from({ length: count }, (_, index) => ({ x: `c${index}`, y: 'Mon', value: index })) });

    it('keeps a named last label, which ends at the grid end, clear of the named one before it', () => {
      // 13 columns: at every second column the last is named, ends at its column's end and would cross its neighbour.
      measure(20, 34);
      const { container } = render(<Heatmap payload={{ render: {}, data: columns(13) }} label="Thirteen" />);
      const named = spans(container, 20, 34);
      expect(named.map((span) => span.index)).toEqual([0, 3, 6, 9, 12]);
      expect(named[0].align).toBe('');
      expect(named.at(-1)!.align).toBe('end');
      expect(clear(named)).toBe(true);
    });

    it('keeps a first label that starts at its column, as centring would cross the grid start, clear of the next named one', () => {
      // No room left of the first column: the first label starts at it and stands nearer the next named one.
      measure(20, 34, 0);
      const { container } = render(<Heatmap payload={{ render: {}, data: columns(12) }} label="Twelve" />);
      const named = spans(container, 20, 34);
      expect(named.map((span) => span.index)).toEqual([0, 3, 6, 9]);
      expect(named[0].align).toBe('start');
      expect(named.at(-1)!.align).toBe('');
      expect(clear(named)).toBe(true);
    });

    it('names every second column while two columns hold a label and the space beside it, and every third past that', () => {
      // Two 17 px columns hold a 30 px label and the 4 px space exactly; a 31 px label needs three.
      measure(17, 30);
      const { container: two } = render(<Heatmap payload={{ render: {}, data: HOURS }} label="Two" />);
      expect(named(two)).toEqual(['00:00', '04:00', '08:00', '12:00', '16:00', '20:00']);
      measure(17, 31);
      const { container: three } = render(<Heatmap payload={{ render: {}, data: HOURS }} label="Three" />);
      expect(named(three)).toEqual(['00:00', '06:00', '12:00', '18:00']);
    });

    it('keeps a first label that starts at its column clear of the next named one, and a named last label at the grid end', () => {
      // Both edge alignments drawn in one render: 20 px columns under 54 px labels, no room left of the first. A step
      // of 3 would put the next centred label over the first's end, so every fourth column is named, and the 13th,
      // named, ends at the grid's end; a centred label stands between the two edge ones.
      measure(20, 54, 0);
      const { container } = render(<Heatmap payload={{ render: {}, data: columns(13) }} label="Thirteen" />);
      const named = spans(container, 20, 54);
      expect(named.map((span) => span.index)).toEqual([0, 4, 8, 12]);
      expect(named[0].align).toBe('start');
      expect(named.at(-1)!.align).toBe('end');
      expect(clear(named)).toBe(true);
    });

    it('keeps a first label at its start clear of a named last label at the grid end when the two are neighbours', () => {
      // 5 columns of 20 px under 54 px labels, no room left of the first: at a step of 4 the first label (0 to 54)
      // and the fifth, ending at the grid's end (46 to 100), would cross, as both move towards each other. No step
      // fits, so only the first column is named.
      measure(20, 54, 0);
      const { container } = render(<Heatmap payload={{ render: {}, data: columns(5) }} label="Five" />);
      const named = spans(container, 20, 54);
      expect(named.map((span) => span.index)).toEqual([0]);
      expect(clear(named)).toBe(true);
    });

    it('keeps the label of a single column inside the grid, reaching back at most over the room left of it', () => {
      measure(20, 100, 10);
      const { container } = render(<Heatmap payload={{ render: {}, data: columns(1) }} label="One column" />);
      const only = container.querySelector<HTMLElement>('.heatColumnAxisThin')!;
      expect(only.textContent).toBe('c0');
      expect(only.style.justifySelf).toBe('end');
      // Its column and the 10 px before it.
      expect(parseFloat(only.style.maxInlineSize)).toBe(30);
    });

    it('names only the first column, at most as wide as all the columns, when no step lets a label stand whole', () => {
      measure(20, 100);
      const { container } = render(<Heatmap payload={{ render: {}, data: columns(3) }} label="Three columns" />);
      expect(named(container)).toEqual(['c0']);
      expect(parseFloat(container.querySelector<HTMLElement>('.heatColumnAxisThin')!.style.maxInlineSize)).toBe(60);
    });

    it('names every column whose label fits it', () => {
      // A 1440 px wide page: 48 px tiles.
      measure(48, 30);
      const { container } = render(<Heatmap payload={{ render: {}, data: HOURS }} label="Commits by hour" />);
      expect(named(container)).toHaveLength(12);
      expect(container.querySelector('.heatColumnAxisThin')).toBeNull();
    });
  });

  it('treats a row without y like a null y in matrix mode', () => {
    const { container } = render(<Heatmap payload={{ render: {}, data: { rows: [{ x: 'a', value: 1 }, { x: 'b', y: null, value: 2 }] } }} label="No y" />);
    expect([...container.querySelectorAll('[role="img"]')].map((tile) => tile.getAttribute('aria-label'))).toEqual(['a: 1', 'b: 2']);
  });

  it('gives the y rows the height the cell leaves, and the axis titles and the x labels their own rows', () => {
    const rows = (heatmapRender: HeatmapRender) => {
      const { container, unmount } = render(<Heatmap payload={{ render: heatmapRender, data: DATA }} label="Commits" />);
      const tracks = container.querySelector<HTMLElement>('.heatGrid')!.style.gridTemplateRows;
      unmount();
      return tracks;
    };
    const yRows = 'repeat(2, minmax(var(--heat-row-min), 1fr))';
    expect(rows({})).toBe(`${yRows} auto`);
    expect(rows({ x_axis_label: 'Hour', y_axis_label: 'Day' })).toBe(`auto ${yRows} auto auto`);
    expect(rows({ y_axis_label: 'Day' })).toBe(`auto ${yRows} auto`);
    expect(rows({ x_axis_label: 'Hour' })).toBe(`${yRows} auto auto`);
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

  /** Each rendered tile by its date: its grid column and row. */
  const placesOf = (container: HTMLElement) =>
    Object.fromEntries([...container.querySelectorAll<HTMLElement>('.heatCell')].map((tile) => [tile.getAttribute('aria-label')!.replace(/:.*/, ''), `${tile.style.gridColumn}/${tile.style.gridRow}`]));
  const weekdayLabels = (container: HTMLElement) => [...container.querySelectorAll<HTMLElement>('.heatRowAxis')].map((label) => [label.style.gridRow, label.textContent]);

  it('lays the days out as weeks by weekdays from Monday, with no tile outside the delivered range', () => {
    const { container } = render(<Heatmap payload={{ render: { mode: 'calendar' }, data: DAYS }} label="Daily" />);
    // Monday 2026-09-28 starts the first week (grid column 2), Monday 2026-11-02 the sixth (column 7); row 2 is Monday.
    expect(container.querySelector<HTMLElement>('.heatCalendar')!.style.gridTemplateColumns).toBe('var(--heat-day-label) repeat(6, var(--heat-tile-inline))');
    const places = placesOf(container);
    // Thursday the 1st opens the first column on its Thursday row: Monday to Wednesday before it have no tile.
    expect(places['Oct 1, 2026']).toBe('2/5');
    expect(places['Oct 4, 2026']).toBe('2/8');
    expect(places['Oct 5, 2026']).toBe('3/2');
    // The last column ends on the last date, Tuesday the 3rd.
    expect(places['Nov 2, 2026']).toBe('7/2');
    expect(places['Nov 3, 2026']).toBe('7/3');
    expect(Object.keys(places)).toHaveLength(34);
    // Every second weekday is named, from Monday.
    expect(weekdayLabels(container)).toEqual([['2', 'Mon'], ['3', ''], ['4', 'Wed'], ['5', ''], ['6', 'Fri'], ['7', ''], ['8', 'Sun']]);
  });

  it('lays the days out from Sunday when week_start is sunday', () => {
    const { container } = render(<Heatmap payload={{ render: { mode: 'calendar', week_start: 'sunday' }, data: DAYS }} label="Daily" />);
    const places = placesOf(container);
    // Sunday 2026-09-27 starts the first week: the 1st stands on its Thursday row, the 4th opens the second week.
    expect(places['Oct 1, 2026']).toBe('2/6');
    expect(places['Oct 4, 2026']).toBe('3/2');
    expect(places['Nov 1, 2026']).toBe('7/2');
    expect(places['Nov 3, 2026']).toBe('7/4');
    expect(weekdayLabels(container)).toEqual([['2', ''], ['3', 'Mon'], ['4', ''], ['5', 'Wed'], ['6', ''], ['7', 'Fri'], ['8', '']]);
  });

  it('labels each month over its first week, as wide as the weeks up to the next month', () => {
    // From Monday 2026-06-01 to Friday 2026-08-14: June, July and August each get their label.
    const rows = Array.from({ length: 75 }, (_, index) => ({ x: new Date(Date.UTC(2026, 5, 1 + index)).toISOString().slice(0, 10), value: index }));
    const { container, unmount } = render(<Heatmap payload={{ render: { mode: 'calendar' }, data: { rows } }} label="Daily" />);
    const months = (root: HTMLElement) => [...root.querySelectorAll<HTMLElement>('.heatMonth')].map((month) => [month.textContent, month.style.gridColumn]);
    expect(months(container)).toEqual([
      ['Jun', '2 / 7'],
      ['Jul', '7 / 11'],
      ['Aug', '11 / 13'],
    ]);
    unmount();
    // A month of under two weeks at an end is left without a label: its tiles still name their dates.
    const { container: short } = render(<Heatmap payload={{ render: { mode: 'calendar' }, data: DAYS }} label="Daily" />);
    expect(months(short)).toEqual([['Oct', '2 / 7']]);
    expect(placesOf(short)['Nov 3, 2026']).toBe('7/3');
  });

  it('fails its own check for two far dates without building their weeks', () => {
    const errors = vi.spyOn(console, 'error').mockImplementation(() => {});
    const started = performance.now();
    const { container } = render(<Heatmap payload={{ render: { mode: 'calendar', show_cell_values: true }, data: { rows: [{ x: '1000-01-01', value: 1 }, { x: '9999-12-31', value: 2 }] } }} label="Far" />);
    // About 469,500 weeks: a grid of that many would take seconds and millions of objects; the check reads two rows.
    expect(performance.now() - started).toBeLessThan(500);
    expect(screen.getByText('This widget cannot be shown')).toBeTruthy();
    expect(container.querySelectorAll('.heatCell')).toHaveLength(0);
    expect(errors.mock.calls.map((call) => String(call[0]))).toEqual([expect.stringMatching(new RegExp(`heatmap: \\d+ weeks of 7 days is over the ${MAX_HEATMAP_TILES} tile limit`))]);
  });

  it('draws 7 tiles for 130,000 rows in one week, reading the rows without a spread', () => {
    const rows = Array.from({ length: 130_000 }, (_, index) => ({ x: `2026-11-${String(2 + (index % 7)).padStart(2, '0')}`, value: index }));
    const { container } = render(<Heatmap payload={{ render: { mode: 'calendar' }, data: { rows } }} label="Busy" />);
    expect(container.querySelectorAll('.heatCell')).toHaveLength(7);
  }, 60_000);

  it('draws a tile per day in range: a day without a row or with a null value is an empty tile', () => {
    const { container } = render(<Heatmap payload={{ render: { mode: 'calendar', show_cell_values: true }, data: DAYS }} label="Daily" />);
    const tiles = [...container.querySelectorAll<HTMLElement>('.heatCell')];
    // 34 days from the 1st of October to the 3rd of November, each once.
    expect(tiles).toHaveLength(34);
    const named = (date: string) => tiles.find((tile) => tile.getAttribute('aria-label')!.startsWith(date))!;
    expect(named('Oct 1, 2026').getAttribute('aria-label')).toBe('Oct 1, 2026: 4');
    expect(named('Oct 1, 2026').style.getPropertyValue('--heat-mix')).toBe('60%');
    // The lowest value, 0, takes the colour floor; a day without a value stays an empty tile.
    expect(named('Oct 3, 2026').style.getPropertyValue('--heat-mix')).toBe('20%');
    expect(named('Oct 2, 2026').style.getPropertyValue('--heat-mix')).toBe('');
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

  it('measures again which values fit their tiles when only the locale changes', () => {
    // jsdom lays nothing out: a tile is 36 px wide and its text 8 px a character, so 1,234 (en) is cut and 1234 (es) fits.
    vi.spyOn(Element.prototype, 'scrollWidth', 'get').mockImplementation(function (this: Element) {
      return this.classList.contains('heatCell') ? (this.textContent ?? '').length * 8 : 0;
    });
    vi.spyOn(Element.prototype, 'clientWidth', 'get').mockImplementation(function (this: Element) {
      return this.classList.contains('heatCell') ? 36 : 0;
    });
    const payload = { render: { mode: 'calendar' as const, show_cell_values: true }, data: { rows: [{ x: '2026-10-01', value: 1234 }] } };
    const value = (root: HTMLElement) => root.querySelector<HTMLElement>('[data-heat-value]')!;
    const { container, rerender } = render(<Heatmap payload={payload} locale="en" label="Daily" />);
    expect([value(container).textContent, value(container).hidden]).toEqual(['1,234', true]);
    rerender(<Heatmap payload={payload} locale="es" label="Daily" />);
    expect([value(container).textContent, value(container).hidden]).toEqual(['1234', false]);
  });

  it('takes the render scale ends in calendar mode', () => {
    const { container } = render(<Heatmap payload={{ render: { mode: 'calendar', min_value: 0, max_value: 16 }, data: DAYS }} label="Daily" />);
    expect(tileNames(container)).toContain('Oct 14, 2026: 8');
    const tile = [...container.querySelectorAll<HTMLElement>('.heatCell')].find((cell) => cell.getAttribute('aria-label') === 'Oct 14, 2026: 8')!;
    expect(tile.style.getPropertyValue('--heat-mix')).toBe('60%');
    expect([...container.querySelectorAll('.heatLegend')].map((cell) => cell.textContent)).toEqual(['016']);
  });

  it('stands the colour scale beside the calendar, in the box the calendar fills, and the matrix scale under its grid', () => {
    const { container, unmount } = render(<Heatmap payload={{ render: { mode: 'calendar' }, data: DAYS }} label="Daily" />);
    const box = container.querySelector<HTMLElement>('.heatCalendarBox')!;
    expect([...box.children].map((child) => child.className)).toEqual([expect.stringContaining('heatCalendar'), 'heatLegend']);
    unmount();
    const { container: drill } = render(<Heatmap payload={{ render: { mode: 'calendar', drill_down: true }, data: DAYS }} label="Daily" />);
    expect(drill.querySelectorAll('.heatLegend')).toHaveLength(1);
    expect(drill.querySelector('.heatCalendarBox .heatLegend')).not.toBeNull();
    const { container: matrix } = render(<Heatmap payload={{ render: {}, data: DATA }} label="Commits" />);
    expect(matrix.querySelector('.heatGrid')!.nextElementSibling!.className).toBe('heatLegend');
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
    // The tiles follow the dates, week by week: Thursday the 1st and Saturday the 3rd, then over the week's end
    // Monday the 5th (a null value, but a row) and Wednesday the 14th.
    const order = [];
    for (let stop = 0; stop < 4; stop += 1) {
      await user.tab();
      order.push(document.activeElement?.getAttribute('aria-label'));
    }
    expect(order).toEqual(['Oct 1, 2026: 4', 'Oct 3, 2026: 0', 'Oct 5, 2026', 'Oct 14, 2026: 8']);
    await user.tab({ shift: true });
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
    // Two rows have 08:00: the picked one is the Monday row with 9, not the Friday row with no value.
    const picked = await within(region).findByText('08:00', { selector: '[aria-current="true"]' });
    expect(within(picked.closest('tr')!).getAllByRole('cell').map((cell) => cell.textContent)).toEqual(['08:00', 'Mon', '9']);
  });
});

describe('the shared date rule', () => {
  // One rule for the heatmap calendar and the cartesian time axis: a YYYY-MM-DD date of the calendar, read as its UTC midnight.
  it.each([
    ['2026-11-09', Date.UTC(2026, 10, 9)],
    ['2028-02-29', Date.UTC(2028, 1, 29)],
    // The earliest years, worked out from the calendar apart from Date: 719528 days before 1970 (the year 0 a leap
    // year), and 99 years of 365 days, 25 of them leap, plus 364 days later.
    ['0000-01-01', -62167219200000],
    ['0099-12-31', -59011545600000],
    ['2026-02-29', null],
    ['2026-02-30', null],
    ['2026-13-01', null],
    ['2026-1-09', null],
    ['2026-11-09T00:00:00Z', null],
    [20261109, null],
    [null, null],
  ])('reads %s as %s', (x, day) => {
    expect(dayOf(x)).toBe(day);
  });
});
