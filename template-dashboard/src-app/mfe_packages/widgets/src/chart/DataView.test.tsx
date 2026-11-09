import { render, screen, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { DataView } from './DataView';

const TABLE = { columns: ['day', 'Orders', 'Target'], rows: [['Mon', 12, 10], ['Tue', 7, 10], ['Wed', null, 10]] };
const format = (value: string | number | null) => (value === null ? '' : String(value));

describe('DataView', () => {
  it('lists every delivered value and opens the picked row to show its fields', async () => {
    render(<DataView table={TABLE} picked={1} label="Data of Orders" format={format} locale="en" />);
    const region = await screen.findByRole('region', { name: 'Data of Orders' });
    await vi.waitFor(() => expect(within(region).getByText('Orders', { selector: 'td *, td' })).toBeTruthy());
    const cells = within(region).getAllByRole('cell').map((cell) => cell.textContent);
    expect(cells).toEqual(expect.arrayContaining(['Mon', 'Tue', 'Wed', 'day', 'Orders', 'Target']));
    const picked = within(region).getAllByRole('row').find((row) => within(row).queryAllByRole('cell')[0]?.textContent === 'Tue');
    expect(picked?.querySelector('[class*="picked"]')).not.toBeNull();
  });
});
