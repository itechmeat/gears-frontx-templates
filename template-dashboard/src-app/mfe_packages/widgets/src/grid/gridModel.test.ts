import { describe, expect, it } from 'vitest';

import type { GridRender, GridValue } from '../types';
import { checkGrid, pinnedCount, sortRows } from './gridModel';

const columns = (...keys: string[]) => keys.map((key) => ({ key }));
const rows = (width: number, count = 1): GridValue[][] => Array.from({ length: count }, () => Array.from({ length: width }, () => null));

describe('grid checks', () => {
  it('passes a consistent configuration', () => {
    const render: GridRender = { columns: columns('a', 'b', 'c'), column_groups: [{ title: 'G', members: ['b', 'c'] }], row_color: 'a' };
    expect(checkGrid(render, { rows: rows(3, 2) })).toBeNull();
  });

  it.each<[string, GridRender, number]>([
    ['column key b repeats', { columns: columns('a', 'b', 'b') }, 3],
    ['names z, which is not a column', { columns: columns('a', 'b'), column_groups: [{ title: 'G', members: ['z'] }] }, 2],
    ['is not contiguous', { columns: columns('a', 'b', 'c'), column_groups: [{ title: 'G', members: ['a', 'c'] }] }, 3],
    ['repeats a', { columns: columns('a', 'b'), column_groups: [{ title: 'G', members: ['a', 'a'] }] }, 2],
    ['column b is in groups G and H', { columns: columns('a', 'b', 'c'), column_groups: [{ title: 'G', members: ['a', 'b'] }, { title: 'H', members: ['b', 'c'] }] }, 3],
    ['row_color names z', { columns: columns('a'), row_color: 'z' }, 1],
  ])('fails when %s', (expected, render, width) => {
    expect(checkGrid(render, { rows: rows(width) })).toContain(expected);
  });

  it('fails a row that does not have one value per column, naming its index', () => {
    expect(checkGrid({ columns: columns('a', 'b') }, { rows: [[1, 2], [1]] })).toContain('row 1');
  });
});

describe('grid sort', () => {
  const values: GridValue[] = ['beta', 10, null, 'Alpha', 2, { text: 'alpha 2', href: '/a' }, 10];
  const sort = (direction: 'asc' | 'desc') => sortRows(values.map((value, index) => ({ value, index })), (item) => item.value, direction, 'en');

  it('puts numbers first, then strings by the collator, then nulls, keeping equal values in delivered order', () => {
    expect(sort('asc').map((item) => item.index)).toEqual([4, 1, 6, 3, 5, 0, 2]);
  });

  it('reverses within each group and keeps nulls last when descending', () => {
    expect(sort('desc').map((item) => item.index)).toEqual([1, 6, 4, 0, 5, 3, 2]);
  });
});

describe('grid helpers', () => {
  it('extends a frozen count that cuts a group to the end of the group', () => {
    const render: GridRender = { columns: columns('a', 'b', 'c', 'd'), frozen_columns: 2, column_groups: [{ title: 'G', members: ['b', 'c'] }] };
    expect(pinnedCount(render)).toBe(3);
    expect(pinnedCount({ ...render, frozen_columns: 9 })).toBe(4);
    expect(pinnedCount({ ...render, frozen_columns: undefined })).toBe(0);
  });
});
