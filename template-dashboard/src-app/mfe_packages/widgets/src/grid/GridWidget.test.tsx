import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';

import type { GridColumn, GridData, GridRender, GridValue } from '../types';
import { DEFAULT_WIDGET_TEXTS } from '../states';
import { GridWidget } from './GridWidget';

const RENDER: GridRender = {
  columns: [
    { key: 'name', title: 'Name' },
    { key: 'count', title: 'Count', align: 'end' },
    { key: 'status', title: 'Status' },
    { key: 'link', title: 'Link', overflow: 'truncate' },
  ],
  page_sizes: [2, 5],
  column_groups: [{ title: 'Figures', members: ['count', 'status'] }],
  row_color: 'status',
};

const DATA: GridData = {
  rows: [
    ['Gamma', 3, 'success', { text: 'Open gamma', href: 'https://example.org/gamma' }],
    ['Alpha', 12, 'error', { text: 'Run it', href: 'javascript:alert(1)' }],
    ['Beta', null, null, null],
  ],
};

const bodyRows = () => screen.getAllByRole('row').filter((row) => within(row).queryAllByRole('cell').length > 0);
const firstCells = () => bodyRows().map((row) => within(row).getAllByRole('cell')[0].textContent);

describe('GridWidget', () => {
  afterEach(() => vi.restoreAllMocks());

  it('shows the first page with the first page size and the group heading', async () => {
    render(<GridWidget payload={{ render: RENDER, data: DATA }} />);
    expect(await screen.findByText('Gamma')).toBeTruthy();
    expect(firstCells()).toEqual(['Success: Gamma', 'Error: Alpha']);
    expect(screen.getByText('Figures')).toBeTruthy();
  });

  it('names the grid from the texts when the cell gives no name', async () => {
    render(<GridWidget payload={{ render: RENDER, data: DATA }} texts={{ ...DEFAULT_WIDGET_TEXTS, table: 'Tabelle' }} />);
    expect(await screen.findByText('Gamma')).toBeTruthy();
    expect(screen.getByRole('region', { name: 'Tabelle' })).toBeTruthy();
  });

  it('sorts and pages the held rows without a request, following the kit sort cycle, and marks the sorted header', async () => {
    const fetch = vi.spyOn(globalThis, 'fetch');
    const user = userEvent.setup();
    render(<GridWidget payload={{ render: RENDER, data: DATA }} />);
    await screen.findByText('Gamma');
    // The sorted header also carries a direction icon button with the same name; the label button is the first.
    const sortName = () => user.click(screen.getAllByRole('button', { name: /sorting of 'Name'/ })[0]);
    const nameHeader = () => screen.getByRole('columnheader', { name: /Name/ });
    await sortName();
    await vi.waitFor(() => expect(firstCells()).toEqual(['Success: Gamma', 'Beta']));
    expect(nameHeader().getAttribute('aria-sort')).toBe('descending');
    await user.click(screen.getByRole('button', { name: /page 2/i }));
    await vi.waitFor(() => expect(firstCells()).toEqual(['Error: Alpha']));
    await sortName();
    await vi.waitFor(() => expect(firstCells()).toEqual(['Error: Alpha', 'Beta']));
    expect(nameHeader().getAttribute('aria-sort')).toBe('ascending');
    await sortName();
    await vi.waitFor(() => expect(firstCells()).toEqual(['Success: Gamma', 'Error: Alpha']));
    expect(nameHeader().getAttribute('aria-sort')).toBe('none');
    expect(fetch).not.toHaveBeenCalled();
  });

  it('marks every sortable header with aria-sort none before any sort, also for a column without a title', async () => {
    render(<GridWidget payload={{ render: { columns: [{ key: 'name', title: 'Name' }, { key: 'code' }] }, data: { rows: [['a', 'x']] } }} />);
    await screen.findByText('a');
    await vi.waitFor(() => expect(screen.getAllByRole('columnheader').map((header) => header.getAttribute('aria-sort'))).toEqual(['none', 'none']));
  });

  it('marks only the sorted one of two columns that share a title', async () => {
    const user = userEvent.setup();
    render(<GridWidget payload={{ render: { columns: [{ key: 'a', title: 'Total' }, { key: 'b', title: 'Total' }] }, data: { rows: [[11, 12], [13, 14]] } }} />);
    await screen.findByText('11');
    await user.click(screen.getAllByRole('button', { name: /sorting of 'Total'/ })[1]);
    await vi.waitFor(() => expect(screen.getAllByRole('columnheader').map((header) => header.getAttribute('aria-sort'))).toEqual(['none', 'descending']));
  });

  it('accepts column keys that the kit would not take as column ids', async () => {
    const user = userEvent.setup();
    render(<GridWidget payload={{ render: { columns: [{ key: 'a__b', title: 'Name' }, { key: 'total_', title: 'Total' }] }, data: { rows: [['x', 2], ['y', 1]] } }} />);
    await screen.findByText('x');
    await user.click(screen.getAllByRole('button', { name: /sorting of 'Total'/ })[0]);
    await vi.waitFor(() => expect(screen.getAllByRole('row').slice(1).map((row) => within(row).getAllByRole('cell')[0].textContent)).toEqual(['x', 'y']));
    expect(screen.getByRole('columnheader', { name: /Total/ }).getAttribute('aria-sort')).toBe('descending');
  });

  it('shows new rows when its data changes', async () => {
    const columns = { columns: [{ key: 'name', title: 'Name' }] };
    const { rerender } = render(<GridWidget payload={{ render: columns, data: { rows: [['old']] } }} />);
    await screen.findByText('old');
    rerender(<GridWidget payload={{ render: columns, data: { rows: [['new']] } }} />);
    expect(await screen.findByText('new')).toBeTruthy();
    expect(screen.queryByText('old')).toBeNull();
  });

  it('keeps the viewer\'s sort when the same rows arrive again', async () => {
    const user = userEvent.setup();
    const render1 = { columns: [{ key: 'n', title: 'N' }] };
    const { rerender } = render(<GridWidget payload={{ render: render1, data: { rows: [[31], [32]] } }} />);
    await screen.findByText('31');
    await user.click(screen.getAllByRole('button', { name: /sorting of 'N'/ })[0]);
    await vi.waitFor(() => expect(firstCells()).toEqual(['32', '31']));
    rerender(<GridWidget payload={{ render: render1, data: { rows: [[31], [32]] } }} />);
    await vi.waitFor(() => expect(firstCells()).toEqual(['32', '31']));
  });

  it('pages the same rows by the new sizes when its page sizes change', async () => {
    const rows = { rows: [['r1'], ['r2'], ['r3'], ['r4']] };
    const { rerender } = render(<GridWidget payload={{ render: { columns: [{ key: 'n', title: 'N' }], page_sizes: [2, 4] }, data: rows }} />);
    await vi.waitFor(() => expect(firstCells()).toEqual(['r1', 'r2']));
    rerender(<GridWidget payload={{ render: { columns: [{ key: 'n', title: 'N' }], page_sizes: [1, 3] }, data: rows }} />);
    await vi.waitFor(() => expect(firstCells()).toEqual(['r1']));
  });

  it('follows a new language without losing the viewer\'s sort or page', async () => {
    const user = userEvent.setup();
    const payload = { render: { columns: [{ key: 'n', title: 'N' }], page_sizes: [2, 4] }, data: { rows: [[1234.5], [2345.5], [3456.5]] } };
    const { rerender } = render(<GridWidget payload={payload} locale="en" />);
    await screen.findByText('1,234.5');
    await user.click(screen.getAllByRole('button', { name: /sorting of 'N'/ })[0]);
    await vi.waitFor(() => expect(firstCells()).toEqual(['3,456.5', '2,345.5']));
    await user.click(screen.getByRole('button', { name: /page 2/i }));
    await vi.waitFor(() => expect(firstCells()).toEqual(['1,234.5']));
    rerender(<GridWidget payload={payload} locale="de" />);
    await vi.waitFor(() => expect(firstCells()).toEqual(['1.234,5']));
  });

  it('survives new data with fewer columns after a sort', async () => {
    const user = userEvent.setup();
    const { rerender } = render(<GridWidget payload={{ render: { columns: [{ key: 'a', title: 'A' }, { key: 'b', title: 'B' }] }, data: { rows: [['x', 1]] } }} />);
    await screen.findByText('x');
    await user.click(screen.getAllByRole('button', { name: /sorting of 'B'/ })[0]);
    rerender(<GridWidget payload={{ render: { columns: [{ key: 'c', title: 'C' }] }, data: { rows: [['y']] } }} />);
    expect(await screen.findByText('y')).toBeTruthy();
  });

  it('marks the sorted header only, when another title ends like it', async () => {
    const user = userEvent.setup();
    render(<GridWidget payload={{ render: { columns: [{ key: 'a', title: "Other 'Total" }, { key: 'b', title: 'Total' }] }, data: { rows: [[21, 22]] } }} />);
    await screen.findByText('21');
    await user.click(screen.getAllByRole('button', { name: "Change sorting of 'Total' column" })[0]);
    await vi.waitFor(() => expect(screen.getAllByRole('columnheader').map((header) => header.getAttribute('aria-sort'))).toEqual(['none', 'descending']));
  });

  it('shows the first page again after a sort', async () => {
    const user = userEvent.setup();
    render(<GridWidget payload={{ render: RENDER, data: DATA }} />);
    await screen.findByText('Gamma');
    await user.click(screen.getByRole('button', { name: /page 2/i }));
    await vi.waitFor(() => expect(firstCells()).toEqual(['Beta']));
    await user.click(screen.getByRole('button', { name: /sorting of 'Count'/ }));
    await vi.waitFor(() => expect(firstCells()).toEqual(['Error: Alpha', 'Success: Gamma']));
  });

  it('shows the first page with the new size after a page size change', async () => {
    const user = userEvent.setup();
    render(<GridWidget payload={{ render: RENDER, data: DATA }} />);
    await screen.findByText('Gamma');
    await user.click(screen.getByRole('button', { name: /page 2/i }));
    await vi.waitFor(() => expect(firstCells()).toEqual(['Beta']));
    await user.click(within(screen.getByRole('group', { name: 'Items per page' })).getByRole('button', { name: '5' }));
    await vi.waitFor(() => expect(firstCells()).toEqual(['Success: Gamma', 'Error: Alpha', 'Beta']));
  });

  it('draws a link only for a safe target, and names the row colour beside its icon', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    render(<GridWidget payload={{ render: RENDER, data: DATA }} />);
    const safe = await screen.findByRole('link', { name: /Open gamma/ });
    expect(safe.getAttribute('href')).toBe('https://example.org/gamma');
    expect(safe.getAttribute('target')).toBe('_blank');
    expect(safe.getAttribute('rel')).toContain('noopener');
    expect(screen.queryByRole('link', { name: /Run it/ })).toBeNull();
    expect(screen.getByText('Run it')).toBeTruthy();
    expect(screen.getByText('Success:', { exact: false })).toBeTruthy();
    expect(screen.getByText('Error:', { exact: false })).toBeTruthy();
  });

  it('sets the kit table floor variable to the sum of the column widths, 160 for a column without one', async () => {
    const render_ = { ...RENDER, columns: RENDER.columns.map((column, index) => (index === 1 ? { ...column, width: 90 } : column)) };
    const { container } = render(<GridWidget payload={{ render: render_, data: DATA }} />);
    await screen.findByText('Gamma');
    // A pin on the kit's documented table floor variable; the layout it gives is checked in the dev preview.
    const root = container.querySelector<HTMLElement>('[style*="--data-grid-table-min-inline-size"]');
    expect(root?.style.getPropertyValue('--data-grid-table-min-inline-size')).toBe(`${160 + 90 + 160 + 160}px`);
  });

  it('shows its own cannot-be-shown state when a check fails', () => {
    const log = vi.spyOn(console, 'error').mockImplementation(() => {});
    render(<GridWidget payload={{ render: { columns: [{ key: 'a' }, { key: 'a' }] }, data: { rows: [] } }} />);
    expect(screen.getByText('This widget cannot be shown')).toBeTruthy();
    expect(log).toHaveBeenCalledWith(expect.stringContaining('column key a repeats'));
  });

  it('shows the empty state for no rows', () => {
    render(<GridWidget payload={{ render: RENDER, data: { rows: [] } }} />);
    expect(screen.getByText('No data to show')).toBeTruthy();
  });

  describe('column kinds', () => {
    const KINDS: GridColumn[] = [
      { key: 'name', title: 'Name' },
      { key: 'state', title: 'State', kind: 'badge', tones: { Blocked: 'danger', Done: 'success' } },
      { key: 'share', title: 'Share', kind: 'progress' },
      { key: 'trend', title: 'Trend', kind: 'sparkline' },
    ];
    const ROWS: GridValue[][] = [
      ['r1', 'Blocked', 0.456, [3, null, 1, 5, 4]],
      ['r2', 'Waiting', 1, [2]],
      ['r3', null, null, null],
      ['r4', '  ', 0, [null, null]],
    ];
    // Rows whose badge text has no visible character: an empty cell, even when the tones name it.
    const INVISIBLE: GridValue[][] = [
      ['i1', '\u200B', null, null],
      ['i2', '\u00AD\uFEFF\u2800', null, null],
    ];
    const rowCells = (name: string) => within(bodyRows().find((row) => within(row).getAllByRole('cell')[0].textContent === name)!).getAllByRole('cell');

    it('draws a badge in its tone, neutral without one, and an empty cell for null or blank text', async () => {
      render(<GridWidget payload={{ render: { columns: KINDS }, data: { rows: ROWS } }} />);
      await screen.findByText('r1');
      const badgeOf = (name: string) => rowCells(name)[1].querySelector('[class*="variant"]');
      expect(badgeOf('r1')?.textContent).toBe('Blocked');
      expect(badgeOf('r1')?.className).toContain('variantDanger');
      expect(badgeOf('r2')?.className).toContain('variantSecondary');
      expect(badgeOf('r3')).toBeNull();
      expect(badgeOf('r4')).toBeNull();
      expect(rowCells('r4')[1].textContent).toBe('');
    });

    it('draws an empty cell, not an empty badge, for a badge text of invisible characters only', async () => {
      const columns = KINDS.map((column) => (column.kind === 'badge' ? { ...column, tones: { '\u200B': 'danger' as const } } : column));
      render(<GridWidget payload={{ render: { columns }, data: { rows: INVISIBLE } }} />);
      await screen.findByText('i1');
      for (const name of ['i1', 'i2']) {
        expect(rowCells(name)[1].querySelector('[class*="variant"]')).toBeNull();
        expect(rowCells(name)[1].textContent).toBe('');
      }
    });

    it('draws a progress value as a bar with its percent as text, and null as an empty cell', async () => {
      render(<GridWidget payload={{ render: { columns: KINDS }, data: { rows: ROWS } }} />);
      await screen.findByText('r1');
      // The percent carries the value; the bar is drawing only, hidden from assistive technology.
      const percentOf = (name: string) => within(rowCells(name)[2]).getByRole('progressbar', { hidden: true }).nextElementSibling?.textContent;
      expect(percentOf('r1')).toBe('45.6%');
      expect(percentOf('r2')).toBe('100%');
      expect(percentOf('r4')).toBe('0%');
      expect(within(rowCells('r1')[2]).queryByRole('progressbar')).toBeNull();
      expect(rowCells('r3')[2].textContent).toBe('');
    });

    it('draws a sparkline broken at a null, names its first, last, lowest and highest values, and draws nothing for null or no number', async () => {
      render(<GridWidget payload={{ render: { columns: KINDS }, data: { rows: ROWS } }} />);
      await screen.findByText('r1');
      const line = within(rowCells('r1')[3]).getByRole('img', { name: 'First 3, last 4, lowest 1, highest 5' });
      expect(line.querySelector('path')?.getAttribute('d')?.match(/M/g)).toHaveLength(2);
      expect(within(rowCells('r2')[3]).getByRole('img', { name: 'First 2, last 2, lowest 2, highest 2' }).querySelector('path')?.getAttribute('d')).toContain('h0');
      expect(within(rowCells('r3')[3]).queryByRole('img')).toBeNull();
      expect(within(rowCells('r4')[3]).queryByRole('img')).toBeNull();
    });

    it('draws a sparkline over a range as wide as the number line without overflow', async () => {
      render(<GridWidget payload={{ render: { columns: [{ key: 'name' }, { key: 'trend', kind: 'sparkline' }] }, data: { rows: [['w1', [1e308, -1e308, 0]]] } }} />);
      await screen.findByText('w1');
      expect(rowCells('w1')[1].querySelector('path')?.getAttribute('d')).toBe('M0.00 2.00 L50.00 22.00 L100.00 12.00');
    });

    it('takes the sparkline text alternative from the texts', async () => {
      const texts = { ...DEFAULT_WIDGET_TEXTS, grid: { ...DEFAULT_WIDGET_TEXTS.grid, sparkline: ({ first, last }: { first: string; last: string }) => `von ${first} bis ${last}` } };
      render(<GridWidget payload={{ render: { columns: KINDS }, data: { rows: ROWS } }} texts={texts} />);
      expect(await screen.findByRole('img', { name: 'von 3 bis 4' })).toBeTruthy();
    });

    it('sorts a progress column by its number and a badge column by its text, and offers no sort on a sparkline column', async () => {
      const user = userEvent.setup();
      render(<GridWidget payload={{ render: { columns: KINDS }, data: { rows: ROWS } }} />);
      await screen.findByText('r1');
      expect(screen.queryAllByRole('button', { name: /sorting of 'Trend'/ })).toEqual([]);
      expect(screen.getAllByRole('columnheader').map((header) => header.getAttribute('aria-sort'))).toEqual(['none', 'none', 'none', null]);
      await user.click(screen.getAllByRole('button', { name: /sorting of 'Share'/ })[0]);
      await vi.waitFor(() => expect(firstCells()).toEqual(['r2', 'r1', 'r4', 'r3']));
      await user.click(screen.getAllByRole('button', { name: /sorting of 'State'/ })[0]);
      await vi.waitFor(() => expect(firstCells()).toEqual(['r2', 'r1', 'r4', 'r3']));
      await user.click(screen.getAllByRole('button', { name: /sorting of 'State'/ })[0]);
      await vi.waitFor(() => expect(firstCells()).toEqual(['r4', 'r1', 'r2', 'r3']));
    });
  });

  describe('a badge column', () => {
    it('sorts by the text its badges show, so its numbers sort among its strings', async () => {
      const user = userEvent.setup();
      render(<GridWidget payload={{ render: { columns: [{ key: 'name', title: 'Name' }, { key: 'state', title: 'State', kind: 'badge' }] }, data: { rows: [['b1', 2], ['b2', '10'], ['b3', 1], ['b4', null]] } }} />);
      await screen.findByText('b1');
      await user.click(screen.getAllByRole('button', { name: /sorting of 'State'/ })[0]);
      await vi.waitFor(() => expect(firstCells()).toEqual(['b2', 'b1', 'b3', 'b4']));
      await user.click(screen.getAllByRole('button', { name: /sorting of 'State'/ })[0]);
      await vi.waitFor(() => expect(firstCells()).toEqual(['b3', 'b1', 'b2', 'b4']));
    });

    it('draws a link value as a badge with its text and no anchor', async () => {
      render(<GridWidget payload={{ render: { columns: [{ key: 'name' }, { key: 'state', kind: 'badge', tones: { Open: 'info' } }] }, data: { rows: [['l1', { text: 'Open', href: '/reports/1' }]] } }} />);
      await screen.findByText('l1');
      const cell = bodyRows()[0].querySelectorAll('td')[1];
      expect(cell.querySelector('[class*="variantInfo"]')?.textContent).toBe('Open');
      expect(cell.querySelector('a, [href]')).toBeNull();
    });
  });

  it('keeps the full text of a truncated link as its title', async () => {
    const text = 'A link text far longer than its column is wide';
    render(<GridWidget payload={{ render: { columns: [{ key: 'link', overflow: 'truncate', width: 40 }] }, data: { rows: [[{ text, href: '/reports/1' }]] } }} />);
    const link = await screen.findByRole('link', { name: text });
    expect(link.querySelector(`[title="${text}"]`)?.textContent).toBe(text);
  });

  describe('cross-checks of the column kinds', () => {
    const cases: [string, GridRender, GridData, string, GridRender, GridData][] = [
      ['a progress value above 1', { columns: [{ key: 'p', kind: 'progress' }] }, { rows: [[0.5], [1.5]] }, 'grid: row 1 column p holds a progress value outside 0 to 1', { columns: [{ key: 'p', kind: 'progress' }] }, { rows: [[0.5], [1]] }],
      ['a progress value below 0', { columns: [{ key: 'p', kind: 'progress' }] }, { rows: [[-0.1]] }, 'grid: row 0 column p holds a progress value outside 0 to 1', { columns: [{ key: 'p', kind: 'progress' }] }, { rows: [[0]] }],
      ['a progress value that is not a number', { columns: [{ key: 'p', kind: 'progress' }] }, { rows: [['half']] }, 'grid: row 0 column p holds a progress value that is not a number', { columns: [{ key: 'p', kind: 'progress' }] }, { rows: [[null]] }],
      ['a list outside a sparkline column', { columns: [{ key: 't' }] }, { rows: [[[1, 2]]] }, 'grid: row 0 column t holds a list outside a sparkline column', { columns: [{ key: 't', kind: 'sparkline' }] }, { rows: [[[1, 2]]] }],
      ['a value that is not a list in a sparkline column', { columns: [{ key: 't', kind: 'sparkline' }] }, { rows: [[7]] }, 'grid: row 0 column t holds a value that is not a list', { columns: [{ key: 't', kind: 'sparkline' }] }, { rows: [[[7]]] }],
      ['tones on a column that is not a badge', { columns: [{ key: 's', tones: { a: 'success' } }] }, { rows: [['a']] }, 'grid: column s has tones but is not a badge column', { columns: [{ key: 's', kind: 'badge', tones: { a: 'success' } }] }, { rows: [['a']] }],
      ['a sortable sparkline column', { columns: [{ key: 't', kind: 'sparkline', sortable: true }] }, { rows: [[[1]]] }, 'grid: sparkline column t is marked sortable', { columns: [{ key: 't', kind: 'sparkline', sortable: false }] }, { rows: [[[1]]] }],
    ];

    it.each(cases)('fails the cell for %s, naming no data, and draws once it is fixed', async (_name, failing, failingData, problem, fixed, fixedData) => {
      const log = vi.spyOn(console, 'error').mockImplementation(() => {});
      const { unmount } = render(<GridWidget payload={{ render: failing, data: failingData }} />);
      expect(screen.getByText('This widget cannot be shown')).toBeTruthy();
      expect(log).toHaveBeenCalledWith(`[widget] ${problem}`);
      unmount();
      render(<GridWidget payload={{ render: fixed, data: fixedData }} />);
      await vi.waitFor(() => expect(bodyRows().length).toBe(fixedData.rows.length));
      expect(screen.queryByText('This widget cannot be shown')).toBeNull();
    });
  });

  describe('search', () => {
    const COLUMNS: GridColumn[] = [
      { key: 'name', title: 'Name' },
      { key: 'size', title: 'Size' },
      { key: 'state', title: 'State', kind: 'badge' },
      { key: 'share', title: 'Share', kind: 'progress' },
      { key: 'trend', title: 'Trend', kind: 'sparkline' },
      { key: 'link', title: 'Link' },
    ];
    const ROWS: GridValue[][] = [
      ['Alpha', 1234.5, 'Open', 0.25, [77, 78], { text: 'Report one', href: '/r/1' }],
      ['beta', 10, 'Closed', 0.5, [1], null],
      ['Gamma', 20, 'open', 0.75, null, null],
      ['Delta', 30, 'Waiting', null, null, null],
    ];
    const payload = { render: { columns: COLUMNS, search: true, page_sizes: [2, 4] }, data: { rows: ROWS } };
    const box = () => screen.getByRole('searchbox', { name: 'Search the table' });

    it('draws no search box without search', async () => {
      render(<GridWidget payload={{ render: { columns: COLUMNS }, data: { rows: ROWS } }} />);
      await screen.findByText('Alpha');
      expect(screen.queryByRole('searchbox')).toBeNull();
    });

    it.each([
      ['open', ['Alpha', 'Gamma']],
      ['BETA', ['beta']],
      ['1,234', ['Alpha']],
      ['75%', ['Gamma']],
      ['report', ['Alpha']],
      ['77', []],
      ['  delta ', ['Delta']],
    ])('keeps the rows whose shown text contains %j, ignoring case', async (query, names) => {
      const user = userEvent.setup();
      render(<GridWidget payload={{ ...payload, render: { ...payload.render, page_sizes: [4] } }} />);
      await screen.findByText('Alpha');
      await user.type(box(), query);
      if (names.length === 0) expect(await screen.findByText('No rows match the search')).toBeTruthy();
      else await vi.waitFor(() => expect(firstCells()).toEqual(names));
    });

    it('shows the first page again after a new search, keeping the sort', async () => {
      const user = userEvent.setup();
      render(<GridWidget payload={payload} />);
      await screen.findByText('Alpha');
      await user.click(screen.getAllByRole('button', { name: /sorting of 'Size'/ })[0]);
      await vi.waitFor(() => expect(firstCells()).toEqual(['Alpha', 'Delta']));
      await user.click(screen.getByRole('button', { name: /page 2/i }));
      await vi.waitFor(() => expect(firstCells()).toEqual(['Gamma', 'beta']));
      await user.type(box(), 'a');
      await vi.waitFor(() => expect(firstCells()).toEqual(['Alpha', 'Delta']));
      expect(screen.getByRole('button', { name: /page 2/i })).toBeTruthy();
      await user.type(box(), 'm');
      await vi.waitFor(() => expect(firstCells()).toEqual(['Gamma']));
      await user.clear(box());
      await vi.waitFor(() => expect(firstCells()).toEqual(['Alpha', 'Delta']));
    });

    it('takes the box name and the no-match text from the texts', async () => {
      const user = userEvent.setup();
      const texts = { ...DEFAULT_WIDGET_TEXTS, grid: { ...DEFAULT_WIDGET_TEXTS.grid, search: 'Tabelle durchsuchen', noMatch: 'Keine Zeile passt' } };
      render(<GridWidget payload={payload} texts={texts} />);
      await screen.findByText('Alpha');
      await user.type(screen.getByRole('searchbox', { name: 'Tabelle durchsuchen' }), 'zzz');
      expect(await screen.findByText('Keine Zeile passt')).toBeTruthy();
      expect(screen.queryByText('No results found')).toBeNull();
    });

    it('is reached by Tab before the table', async () => {
      const user = userEvent.setup();
      render(<GridWidget payload={payload} />);
      await screen.findByText('Alpha');
      await user.tab();
      expect(document.activeElement).toBe(box());
    });
  });

  describe('the shared link rule', () => {
    const ORIGIN = window.location.origin;
    const linkRows = (href: string): GridData => ({ rows: [[{ text: 'Go', href }]] });
    const one = { columns: [{ key: 'link', title: 'Link' }] };

    it.each([
      ['a path from the site root', '/reports/1', '/reports/1'],
      ['a same-origin address', `${ORIGIN}/reports/2`, `${ORIGIN}/reports/2`],
      ['a mail address', 'mailto:team@example.org', 'mailto:team@example.org'],
    ])('links %s in the same tab', async (_name, href, shown) => {
      render(<GridWidget payload={{ render: one, data: linkRows(href) }} />);
      const link = await screen.findByRole('link', { name: 'Go' });
      expect(link.getAttribute('href')).toBe(shown);
      expect(link.getAttribute('target')).toBeNull();
    });

    it('opens another origin in a new tab without its opener, and says so', async () => {
      render(<GridWidget payload={{ render: one, data: linkRows('https://example.org/a') }} />);
      const link = await screen.findByRole('link', { name: 'Go (opens in a new tab)' });
      expect(link.getAttribute('target')).toBe('_blank');
      expect(link.getAttribute('rel')).toBe('noopener noreferrer');
    });

    it.each([
      ['a relative path not from the root', 'reports/1', 'a relative target that does not start with /'],
      ['a refused scheme', 'javascript:alert(1)', 'the javascript: scheme'],
    ])('draws %s as text with one console line naming only its kind', async (_name, href, kind) => {
      const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
      render(<GridWidget payload={{ render: one, data: linkRows(href) }} />);
      await screen.findByText('Go');
      expect(screen.queryByRole('link')).toBeNull();
      expect(warn).toHaveBeenCalledTimes(1);
      expect(warn).toHaveBeenCalledWith(`[widget] a link is shown as text: ${kind}`);
    });
  });
});

