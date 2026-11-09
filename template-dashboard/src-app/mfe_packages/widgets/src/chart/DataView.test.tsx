import { render, screen, within } from '@testing-library/react';
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
});
