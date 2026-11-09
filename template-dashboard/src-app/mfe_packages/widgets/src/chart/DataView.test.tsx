import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import { DataView } from './DataView';

const TABLE = { columns: ['day', 'Orders', 'Target'], rows: [['Mon', 12, 10], ['Tue', 7, 10], ['Wed', null, 10]] };
const format = (value: string | number | null) => (value === null ? '' : String(value));

describe('DataView', () => {
  it('lists every delivered value and opens the picked row to show its fields, marked as current', async () => {
    render(<DataView table={TABLE} picked={1} label="Data of Orders" format={format} locale="en" />);
    const region = await screen.findByRole('region', { name: 'Data of Orders' });
    const rows = () => within(region).queryAllByRole('row').filter((row) => within(row).queryAllByRole('cell').length > 0).map((row) => within(row).getAllByRole('cell').map((cell) => cell.textContent));
    // The opened Tue row lists its fields under it: their names and Tue's values.
    await vi.waitFor(() => expect(rows()).toEqual([['Mon', '12', '10'], ['Tue', '7', '10'], ['day', 'Tue', ''], ['Orders', '7', ''], ['Target', '10', ''], ['Wed', '', '10']]));
    expect(within(region).getByText('Tue', { selector: '[aria-current="true"]' })).toBeTruthy();
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
