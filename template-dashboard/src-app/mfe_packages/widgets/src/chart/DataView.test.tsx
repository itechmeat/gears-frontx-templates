import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { DataView, scrollPickedRow } from './DataView';

const TABLE = { columns: ['day', 'Orders', 'Target'], rows: [['Mon', 12, 10], ['Tue', 7, 10], ['Wed', null, 10]] };
const format = (value: string | number | null) => (value === null ? '' : String(value));

describe('DataView', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    delete (Element.prototype as Partial<Element>).scrollIntoView;
  });

  it('lists every delivered value and opens the picked row to show its fields, marked as current', async () => {
    render(<DataView table={TABLE} picked={1} label="Data of Orders" format={format} locale="en" />);
    const region = await screen.findByRole('region', { name: 'Data of Orders' });
    const rows = () => within(region).queryAllByRole('row').filter((row) => within(row).queryAllByRole('cell').length > 0).map((row) => within(row).getAllByRole('cell').map((cell) => cell.textContent));
    // The opened Tue row lists its fields under it: their names and Tue's values.
    await vi.waitFor(() => expect(rows()).toEqual([['Mon', '12', '10'], ['Tue', '7', '10'], ['day', 'Tue', ''], ['Orders', '7', ''], ['Target', '10', ''], ['Wed', '', '10']]));
    expect(within(region).getByText('Tue', { selector: '[aria-current="true"]' })).toBeTruthy();
  });

  it('scrolls the picked row into view once its fields show, and gives each column a width floor', async () => {
    const rowsAtScroll: number[] = [];
    Element.prototype.scrollIntoView = vi.fn(function scroll(this: Element) {
      rowsAtScroll.push(this.querySelector('[aria-current="true"]') ? screen.getAllByRole('row').length : -1);
    });
    const { container } = render(<DataView table={TABLE} picked={1} label="Data of Orders" format={format} locale="en" />);
    // The header row, the three data rows and the three field rows of the picked one.
    await vi.waitFor(() => expect(rowsAtScroll).toEqual([7]));
    expect(Element.prototype.scrollIntoView).toHaveBeenCalledWith({ block: 'nearest' });
    const root = container.querySelector<HTMLElement>('[style*="--data-grid-table-min-inline-size"]');
    expect(root?.style.getPropertyValue('--data-grid-table-min-inline-size')).toBe(`${3 * 112 + 32}px`);
  });

  it('scrolls the grid\'s own scroll area to put the picked row just under the header', () => {
    const scroller = document.createElement('div');
    scroller.style.overflowY = 'auto';
    scroller.innerHTML = '<table><thead><tr><th>day</th></tr></thead><tbody><tr><td>Tue</td></tr></tbody></table>';
    document.body.append(scroller);
    const rect = (top: number, height: number) => ({ top, height, bottom: top + height, left: 0, right: 0, width: 0, x: 0, y: top, toJSON: () => null }) as DOMRect;
    vi.spyOn(scroller, 'getBoundingClientRect').mockReturnValue(rect(100, 200));
    vi.spyOn(scroller.querySelector('thead')!, 'getBoundingClientRect').mockReturnValue(rect(100, 30));
    const cell = scroller.querySelector('td')!;
    vi.spyOn(cell, 'getBoundingClientRect').mockReturnValue(rect(400, 40));
    scroller.scrollTop = 50;
    scrollPickedRow(cell);
    expect(scroller.scrollTop).toBe(50 + 400 - 100 - 30);
    scroller.remove();
  });

  it('shows new values when its table changes', async () => {
    const { rerender } = render(<DataView table={{ columns: ['k', 'v'], rows: [['a', 1]] }} label="Live" format={format} locale="en" />);
    await screen.findByText('a');
    rerender(<DataView table={{ columns: ['k', 'v'], rows: [['b', 2]] }} label="Live" format={format} locale="en" />);
    expect(await screen.findByText('b')).toBeTruthy();
    expect(screen.queryByText('a')).toBeNull();
  });

  it('marks the sorted one of two headers with the same label', async () => {
    const user = userEvent.setup();
    render(<DataView table={{ columns: ['Orders', 'Orders'], rows: [['a', 1], ['b', 2]] }} label="Same" format={format} locale="en" />);
    const region = await screen.findByRole('region', { name: 'Same' });
    await within(region).findByText('a');
    await user.click(within(region).getAllByRole('button', { name: /sorting of 'Orders'/ })[1]);
    await vi.waitFor(() => expect(within(region).getAllByRole('columnheader').map((header) => header.getAttribute('aria-sort'))).toEqual(['none', 'descending']));
  });

  it('marks the sorted header with aria-sort', async () => {
    const user = userEvent.setup();
    render(<DataView table={TABLE} label="Data of Orders" format={format} locale="en" />);
    const region = await screen.findByRole('region', { name: 'Data of Orders' });
    await within(region).findByText('Mon');
    await user.click(within(region).getAllByRole('button', { name: /sorting of 'Orders'/ })[0]);
    await vi.waitFor(() => expect(within(region).getByRole('columnheader', { name: /Orders/ }).getAttribute('aria-sort')).toBe('descending'));
    // Descending by Orders: 12, 7, then the null value last.
    expect(within(region).getAllByRole('row').slice(1).map((row) => within(row).getAllByRole('cell')[0].textContent)).toEqual(['Mon', 'Tue', 'Wed']);
    expect(within(region).getByRole('columnheader', { name: /day/ }).getAttribute('aria-sort')).toBe('none');
  });
});
