import { useEffect, type RefObject } from 'react';

/**
 * The kit DataGrid names each sortable header as a button ("Change sorting of
 * '<label>' column") and sets no `aria-sort`. This keeps `aria-sort` on every
 * sortable header cell under `ref`: the sorted column's direction, `none` on the
 * others. The grid draws its headers after its first load and redraws them on
 * its own, so a MutationObserver re-applies the state whenever they change.
 */
export function useAriaSort(ref: RefObject<HTMLElement | null>, sortedLabel: string | undefined, direction: 'asc' | 'desc' | undefined) {
  useEffect(() => {
    const root = ref.current;
    if (!root) return;
    const name = sortedLabel === undefined ? undefined : `'${sortedLabel}' column`;
    const apply = () => {
      root.querySelectorAll('th').forEach((header) => {
        const label = header.querySelector('button[aria-label]')?.getAttribute('aria-label');
        if (!label) return;
        const value = name !== undefined && direction !== undefined && label.endsWith(name) ? (direction === 'asc' ? 'ascending' : 'descending') : 'none';
        if (header.getAttribute('aria-sort') !== value) header.setAttribute('aria-sort', value);
      });
    };
    apply();
    const observer = new MutationObserver(apply);
    observer.observe(root, { childList: true, subtree: true });
    return () => observer.disconnect();
  }, [ref, sortedLabel, direction]);
}
