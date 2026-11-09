import { useCallback, useEffect, useId, useMemo, useRef } from 'react';
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
import styles from '../widgets.module.css';

type Value = string | number | null;

/** The values behind a chart as a flat table: one column per field, one row per delivered point or slice. */
export interface ValuesTable {
  columns: string[];
  rows: Value[][];
}

// A data row, or a detail row under an opened data row: one per field, its name and its value.
type Item = DataGridItem & { values: Value[]; detailOf?: number };

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
  format: (value: Value) => string;
  locale: string;
  container?: HTMLElement | ShadowRoot | null;
}) {
  const name = `data-view-${useId().replace(/[^a-zA-Z0-9]/g, '')}`;
  const pickedId = picked === null || picked === undefined ? 0 : picked + 1;
  const ids = useMemo(() => table.columns.map((_, index) => `field_${index}`), [table]);
  const columns = useMemo<DataGridTableColumn<Item>[]>(
    () =>
      table.columns.map((title, index) => ({
        id: ids[index],
        label: title,
        getClassName: (item) => (item.id === pickedId ? styles.picked : undefined),
        render: (item) => {
          const text = format(item.values[index] ?? null);
          if (index > 0 || item.id !== pickedId) return text;
          return (
            <span aria-current="true" ref={(element) => element?.scrollIntoView?.({ block: 'nearest' })}>
              {text}
            </span>
          );
        },
      })),
    [table, ids, pickedId, format],
  );
  const load = useCallback(
    async (context: DataGridLoadContext) => {
      const parent = context.tree?.parentId;
      if (parent !== null && parent !== undefined) {
        const values = table.rows[Number(parent) - 1] ?? [];
        const details: Item[] = table.columns.map((field, index) => ({ id: `${parent}-${index}`, detailOf: Number(parent), values: [field, values[index] ?? null] }));
        return { results: details, total: details.length };
      }
      const items: Item[] = table.rows.map((values, index) => ({ id: index + 1, values }));
      const first = context.order?.[0];
      const column = first ? ids.indexOf(first.column) : -1;
      const results = first && column >= 0 ? sortRows(items, (item) => item.values[column] ?? null, first.direction, locale) : items;
      return { results, total: results.length };
    },
    [table, ids, locale],
  );
  return (
    <div className={styles.grid}>
      <DataGrid<Item> name={name} label={label} load={load} columns={columns} persistent="memory" stickyHeader portalContainer={container ?? undefined}>
        <DataGridOrderPlugin />
        <DataGridTableTreePlugin<Item> expandable={isDataRow} />
        {pickedId > 0 ? <OpenPicked id={pickedId} /> : null}
      </DataGrid>
    </div>
  );
}
