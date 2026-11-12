import type { GridData, GridLink, GridRender, GridValue } from '../types';

export const DEFAULT_PAGE_SIZES = [10, 25, 50, 100, 500];

// @cpt-algo:cpt-frontx-dashboard-algo-widget-catalog-grid-checks:p2
/** The grid's own consistency checks: the first problem found, or null. The text names keys and indexes, never data. */
export function checkGrid(render: GridRender, data: GridData): string | null {
  const keys = render.columns.map((column) => column.key);
  // @cpt-begin:cpt-frontx-dashboard-algo-widget-catalog-grid-checks:p2:inst-wc-grid-dup-key
  const repeated = keys.find((key, index) => keys.indexOf(key) !== index);
  if (repeated !== undefined) return `grid: column key ${repeated} repeats`;
  // @cpt-end:cpt-frontx-dashboard-algo-widget-catalog-grid-checks:p2:inst-wc-grid-dup-key

  // @cpt-begin:cpt-frontx-dashboard-algo-widget-catalog-grid-checks:p2:inst-wc-grid-for-group
  const owner = new Map<string, string>();
  for (const group of render.column_groups ?? []) {
    const unknown = group.members.find((key) => !keys.includes(key));
    if (unknown !== undefined) return `grid: group ${group.title} names ${unknown}, which is not a column`;
    const positions = [...new Set(group.members.map((key) => keys.indexOf(key)))].sort((a, b) => a - b);
    if (positions.some((position, index) => index > 0 && position !== positions[index - 1] + 1)) return `grid: group ${group.title} is not contiguous`;
    const twice = group.members.find((key, index) => group.members.indexOf(key) !== index);
    if (twice !== undefined) return `grid: group ${group.title} repeats ${twice}`;
    for (const key of group.members) {
      const other = owner.get(key);
      if (other !== undefined) return `grid: column ${key} is in groups ${other} and ${group.title}`;
      owner.set(key, group.title);
    }
  }
  // @cpt-end:cpt-frontx-dashboard-algo-widget-catalog-grid-checks:p2:inst-wc-grid-for-group

  // @cpt-begin:cpt-frontx-dashboard-algo-widget-catalog-grid-checks:p2:inst-wc-grid-row-color
  if (render.row_color !== undefined && !keys.includes(render.row_color)) return `grid: row_color names ${render.row_color}, which is not a column`;
  // @cpt-end:cpt-frontx-dashboard-algo-widget-catalog-grid-checks:p2:inst-wc-grid-row-color

  // @cpt-begin:cpt-frontx-dashboard-algo-widget-catalog-grid-checks:p2:inst-wc-grid-positions
  const short = data.rows.findIndex((row) => row.length !== keys.length);
  if (short >= 0) return `grid: row ${short} does not have one value per column`;
  // @cpt-end:cpt-frontx-dashboard-algo-widget-catalog-grid-checks:p2:inst-wc-grid-positions
  return null;
}

export const isLink = (value: GridValue): value is GridLink =>
  typeof value === 'object' && value !== null && typeof value.text === 'string' && typeof value.href === 'string';

/** The value a grid cell sorts and reads by: a link by its text. */
export const plainOf = (value: GridValue): string | number | null => (isLink(value) ? value.text : typeof value === 'object' ? null : value);

// @cpt-algo:cpt-frontx-dashboard-algo-widget-catalog-grid-sort:p2
/**
 * The order of the delivered rows for one sort column and direction: numbers
 * first, then strings by the host language's collator, then nulls, which stay
 * last in both directions. Equal values keep their delivered order.
 */
export function sortRows<T>(items: readonly T[], valueOf: (item: T) => GridValue, direction: 'asc' | 'desc', locale: string): T[] {
  // @cpt-begin:cpt-frontx-dashboard-algo-widget-catalog-grid-sort:p2:inst-wc-sort-groups
  const collator = new Intl.Collator(locale, { numeric: true });
  const rank = (value: string | number | null) => (typeof value === 'number' ? 0 : typeof value === 'string' ? 1 : 2);
  const sign = direction === 'asc' ? 1 : -1;
  // @cpt-end:cpt-frontx-dashboard-algo-widget-catalog-grid-sort:p2:inst-wc-sort-groups
  // @cpt-begin:cpt-frontx-dashboard-algo-widget-catalog-grid-sort:p2:inst-wc-sort-compare
  // Array.prototype.sort is stable, which keeps equal rows in their delivered order (inst-wc-sort-stable).
  return [...items].sort((left, right) => {
    const a = plainOf(valueOf(left));
    const b = plainOf(valueOf(right));
    const groups = rank(a) - rank(b);
    if (groups !== 0) return groups;
    if (typeof a === 'number' && typeof b === 'number') return (a - b) * sign;
    if (typeof a === 'string' && typeof b === 'string') return collator.compare(a, b) * sign;
    return 0;
  });
  // @cpt-end:cpt-frontx-dashboard-algo-widget-catalog-grid-sort:p2:inst-wc-sort-compare
}

/** How many leading columns are pinned: `frozen_columns`, extended to the end of a group it cuts, since a kit group pins as a whole. */
export function pinnedCount(render: GridRender): number {
  let count = Math.min(render.frozen_columns ?? 0, render.columns.length);
  if (count === 0) return 0;
  for (const group of render.column_groups ?? []) {
    const positions = group.members.map((key) => render.columns.findIndex((column) => column.key === key));
    const first = Math.min(...positions);
    const last = Math.max(...positions);
    if (first < count && last >= count) count = last + 1;
  }
  return count;
}
