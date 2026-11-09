import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';

import type { GridData, GridRender } from '../types';
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
});
