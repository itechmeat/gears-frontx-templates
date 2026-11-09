import { useCallback, useEffect, useId, useMemo, useRef, useState } from 'react';
import {
  DataGrid,
  DataGridOrderPlugin,
  DataGridTableTreePlugin,
  useDataGridPluginContext,
  type DataGridItem,
  type DataGridLoadContext,
  type DataGridTableColumn,
  type DataGridTableTreePluginApi,
} from '@gears-frontx/ui-kit';

import { sortRows } from '../grid/gridModel';
import { useAriaSort } from '../grid/useAriaSort';
import styles from '../widgets.module.css';

type Value = string | number | null;

/** The values behind a chart as a flat table: one column per field, one row per delivered point or slice. */
export interface ValuesTable {
  columns: string[];
  rows: Value[][];
}

// A data row, or a detail row under an opened data row: one per field, its name and its value.
type Item = DataGridItem & { values: Value[]; detailOf?: number; field?: number };

const isDataRow = (item: DataGridItem) => (item as Item).detailOf === undefined;

/** Opens the picked row once it has loaded, through the kit table tree plugin, which then loads its detail rows. */
function OpenPicked({ id }: { id: number }) {
  const context = useDataGridPluginContext();
  const loaded = context.useStore((store) => store.visibleRecords.some((record) => record.id === id));
  const opened = useRef(false);
  useEffect(() => {
    if (!loaded || opened.current) return;
    const tree = context.getPlugin<DataGridTableTreePluginApi>('tableTree');
    if (!tree) return;
    opened.current = true;
    tree.toggle(id);
  }, [context, id, loaded]);
  return null;
}

/**
 * The data view of a chart: every delivered value in a sortable kit DataGrid,
 * held in memory. Each row opens to list its fields; the picked row (the
 * mark the viewer clicked) opens on its own and is marked and scrolled into view.
 */
export function DataView({
  table,
  picked,
  label,
  format,
  locale,
  container,
}: {
  table: ValuesTable;
  /** Index of the picked row in `table.rows`. */
  picked?: number | null;
  label: string;
  /** Formats a value of the column at this index, in the delivered row at this index. */
  format: (value: Value, column: number, row: number) => string;
  locale: string;
  container?: HTMLElement | ShadowRoot | null;
}) {
  const name = `data-view-${useId().replace(/[^a-zA-Z0-9]/g, '')}`;
  const pickedId = picked === null || picked === undefined ? 0 : picked + 1;
  // The picked row scrolls into view once, not again on every render after the viewer scrolled away.
  const scrolled = useRef(false);
  // The chart rebuilds its table and formatter on every render; the grid needs stable columns and load, so it keys them by content.
  const formatRef = useRef(format);
  formatRef.current = format;
  const tableKey = JSON.stringify(table);
  const stable = useMemo(() => table, [tableKey]);
  const [order, setOrder] = useState<{ column: string; direction: 'asc' | 'desc' } | undefined>(undefined);
  const [root, setRoot] = useState<HTMLDivElement | null>(null);
  const ids = useMemo(() => stable.columns.map((_, index) => `field_${index}`), [stable]);
  const columns = useMemo<DataGridTableColumn<Item>[]>(
    () =>
      stable.columns.map((title, index) => ({
        id: ids[index],
        label: title,
        getClassName: (item) => (item.id === pickedId ? styles.picked : undefined),
        render: (item) => {
          // A detail row holds a field name and that field's value, formatted as its own column.
          const field = (item as Item).field;
          const value = item.values[index] ?? null;
          const row = Number((item as Item).detailOf ?? item.id) - 1;
          const text = field === undefined ? formatRef.current(value, index, row) : index === 1 ? formatRef.current(value, field, row) : String(value ?? '');
          if (index > 0 || item.id !== pickedId) return text;
          return (
            <span
              aria-current="true"
              ref={(element) => {
                if (!element || scrolled.current) return;
                scrolled.current = true;
                element.scrollIntoView?.({ block: 'nearest' });
              }}
            >
              {text}
            </span>
          );
        },
      })),
    [stable, ids, pickedId],
  );
  const load = useCallback(
    async (context: DataGridLoadContext) => {
      const parent = context.tree?.parentId;
      if (parent !== null && parent !== undefined) {
        const values = stable.rows[Number(parent) - 1] ?? [];
        const details: Item[] = stable.columns.map((name, index) => ({ id: `${parent}-${index}`, detailOf: Number(parent), field: index, values: [name, values[index] ?? null] }));
        return { results: details, total: details.length };
      }
      const items: Item[] = stable.rows.map((values, index) => ({ id: index + 1, values }));
      const first = context.order?.[0];
      setOrder(first);
      const column = first ? ids.indexOf(first.column) : -1;
      const results = first && column >= 0 ? sortRows(items, (item) => item.values[column] ?? null, first.direction, locale) : items;
      return { results, total: results.length };
    },
    [stable, ids, locale],
  );
  const sortedIndex = order ? ids.indexOf(order.column) : -1;
  const sortedLabel = sortedIndex >= 0 ? stable.columns[sortedIndex] : undefined;
  // An x label may equal a series name: count the same-labelled columns before the sorted one.
  const occurrence = stable.columns.slice(0, Math.max(sortedIndex, 0)).filter((title) => title === sortedLabel).length;
  useAriaSort(root, sortedLabel, order?.direction, occurrence);
  return (
    <div ref={setRoot} className={styles.grid}>
      <DataGrid<Item> name={name} label={label} load={load} columns={columns} persistent="memory" stickyHeader portalContainer={container ?? undefined}>
        <DataGridOrderPlugin />
        <DataGridTableTreePlugin<Item> expandable={isDataRow} />
        {pickedId > 0 ? <OpenPicked id={pickedId} /> : null}
      </DataGrid>
    </div>
  );
}
