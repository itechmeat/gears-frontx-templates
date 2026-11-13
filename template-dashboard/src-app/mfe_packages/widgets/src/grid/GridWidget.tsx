import { useCallback, useId, useMemo, useState, type ComponentType, type CSSProperties } from 'react';
import { CircleAlertIcon, CircleCheckIcon, CircleXIcon, InfoIcon } from 'lucide-react';
import {
  DataGrid,
  DataGridOrderPlugin,
  DataGridPaginationPlugin,
  Link,
  VisuallyHidden,
  type DataGridLoadContext,
  type DataGridTableColumn,
  type DataGridTableGroup,
} from '@gears-frontx/ui-kit';
import type { RenderWidgetPayload, ValueFormat } from '@gears-frontx/frontx-dashboard-root/contract';

import { formatValue } from '../format';
import { DEFAULT_WIDGET_TEXTS, WidgetCannotBeShown, WidgetEmpty, type WidgetTexts } from '../states';
import type { GridColumn, GridData, GridRender, GridValue } from '../types';
import styles from '../widgets.module.css';
import { useAriaSort } from './useAriaSort';
import { useDataVersion } from './useDataVersion';
import { DEFAULT_PAGE_SIZES, checkGrid, isLink, isSafeHref, pinnedCount, sortRows } from './gridModel';

type RowItem = { id: number; row: GridValue[] };

// The kit takes stricter column ids than a column key allows (no `a__b` or `total_`), so the grid gives it its own, by position.
const columnId = (index: number) => `col_${index}`;
const indexOfColumnId = (id: string) => (/^col_\d+$/.test(id) ? Number(id.slice(4)) : -1);

// The width a column without its own width keeps before the grid scrolls sideways.
const FLEXIBLE_COLUMN_FLOOR = 160;

/**
 * The table's width floor: every column's own width, or the flexible floor.
 * The kit's fixed layout sizes columns from the first header row, where a column
 * group has no width, so without this floor a group's columns shrink to their
 * group title and their values break apart; with it the table scrolls sideways instead.
 */
const tableFloorOf = (columns: GridColumn[]) => columns.reduce((sum, column) => sum + (column.width ?? FLEXIBLE_COLUMN_FLOOR), 0);
type Order = DataGridLoadContext['order'];

const ROW_COLORS = {
  success: { icon: CircleCheckIcon },
  warning: { icon: CircleAlertIcon },
  error: { icon: CircleXIcon },
  info: { icon: InfoIcon },
} as const;

type RowColor = keyof typeof ROW_COLORS;
const rowColorOf = (value: GridValue): RowColor | null => (typeof value === 'string' && Object.hasOwn(ROW_COLORS, value) ? (value as RowColor) : null);

function CellText({ value, column, valueFormat, locale }: { value: GridValue; column: GridColumn; valueFormat: ValueFormat | undefined; locale: string }) {
  const truncate = column.overflow === 'truncate';
  if (isLink(value)) {
    if (!isSafeHref(value.href)) {
      return (
        <span className={truncate ? styles.truncate : undefined} title={truncate ? value.text : undefined}>
          {value.text}
        </span>
      );
    }
    return (
      // The link text and its external-link icon stay on one line, so a short id such as REQ-1000 never wraps.
      <Link href={value.href} external rel="noopener noreferrer" className={styles.gridLink}>
        <span className={truncate ? styles.truncate : undefined} title={truncate ? value.text : undefined}>
          {value.text}
        </span>
      </Link>
    );
  }
  // A delivered object that is not a well-formed link has no text to show.
  const text = typeof value === 'number' ? formatValue(value, valueFormat, locale, column.format?.notation) : typeof value === 'string' ? value : '';
  return truncate ? (
    <span className={styles.truncate} title={text}>
      {text}
    </span>
  ) : (
    <>{text}</>
  );
}

// @cpt-dod:cpt-frontx-dashboard-dod-widget-catalog-grid:p1
/**
 * The `grid` widget: the ui-kit DataGrid over the rows the transform
 * delivered. Its load callback answers every sort, page and page size from
 * those rows in memory and never sends a request.
 */
export function GridWidget({
  payload,
  locale = 'en',
  texts = DEFAULT_WIDGET_TEXTS,
  label: labelProp,
  container,
}: {
  payload: RenderWidgetPayload<GridRender, GridData>;
  locale?: string;
  texts?: WidgetTexts;
  /** Names the grid's region and pager; distinct per grid on a page. `texts.table` when the cell gives none. */
  label?: string;
  /** Where the grid's popups go, for a grid inside a shadow root. */
  container?: HTMLElement | ShadowRoot | null;
}) {
  const { render, data, value_format } = payload;
  const label = labelProp ?? texts.table;
  const name = `grid-${useId().replace(/[^a-zA-Z0-9]/g, '')}`;
  const [root, setRoot] = useState<HTMLDivElement | null>(null);
  const [order, setOrder] = useState<Order>(undefined);
  const problem = data ? checkGrid(render, data) : 'grid: no data';
  const rows = useMemo(() => data?.rows ?? [], [data]);
  // Versioned by content: a re-delivery of the same rows keeps the viewer's sort and page.
  const rowsKey = useMemo(() => JSON.stringify(rows), [rows]);
  const dataVersion = useDataVersion(rowsKey);
  const sizes = useMemo(() => (render.page_sizes?.length ? render.page_sizes : DEFAULT_PAGE_SIZES), [render]);
  const keys = useMemo(() => render.columns.map((column) => column.key), [render]);
  const colorAt = render.row_color === undefined ? -1 : keys.indexOf(render.row_color);

  const columns = useMemo(() => {
    const pinned = pinnedCount(render);
    const columnOf = (column: GridColumn, index: number): DataGridTableColumn<RowItem> => ({
      id: columnId(index),
      label: column.title ?? column.key,
      width: column.width,
      sticky: index < pinned,
      cellOverflow: column.overflow === 'truncate' ? 'nowrap' : 'wrap',
      getClassName: (item) => {
        const color = colorAt >= 0 ? rowColorOf(item.row[colorAt] ?? null) : null;
        return [column.align === 'end' ? styles.alignEnd : column.align === 'center' ? styles.alignCenter : '', color ? styles[`row-${color}`] : ''].join(' ').trim() || undefined;
      },
      render: (item) => {
        const color = index === 0 && colorAt >= 0 ? rowColorOf(item.row[colorAt] ?? null) : null;
        const Icon: ComponentType<{ className?: string; 'aria-hidden'?: boolean }> | null = color ? ROW_COLORS[color].icon : null;
        return (
          <>
            {Icon && color ? (
              <>
                <Icon className={styles.rowIcon} aria-hidden />
                <VisuallyHidden>{texts.rowMeaning[color]}: </VisuallyHidden>
              </>
            ) : null}
            <CellText value={item.row[index] ?? null} column={column} valueFormat={value_format} locale={locale} />
          </>
        );
      },
    });
    const result: (DataGridTableColumn<RowItem> | DataGridTableGroup<RowItem>)[] = [];
    const placed = new Set<string>();
    render.columns.forEach((column, index) => {
      if (placed.has(column.key)) return;
      const groupIndex = (render.column_groups ?? []).findIndex((group) => group.members.includes(column.key));
      if (groupIndex < 0) {
        result.push(columnOf(column, index));
        return;
      }
      const group = render.column_groups![groupIndex];
      const members = render.columns.map((item, position) => [item, position] as const).filter(([item]) => group.members.includes(item.key));
      members.forEach(([item]) => placed.add(item.key));
      result.push({ id: `group_${groupIndex}`, label: group.title, sticky: members.every(([, position]) => position < pinned), columns: members.map(([item, position]) => columnOf(item, position)) });
    });
    return result;
  }, [render, value_format, locale, colorAt, texts]);

  // @cpt-flow:cpt-frontx-dashboard-flow-widget-catalog-grid-sort-page:p1
  const load = useCallback(
    async (context: DataGridLoadContext) => {
      // @cpt-begin:cpt-frontx-dashboard-flow-widget-catalog-grid-sort-page:p1:inst-wc-sort-do
      const first = context.order?.[0];
      setOrder(context.order);
      const items: RowItem[] = rows.map((row, index) => ({ id: index + 1, row }));
      const column = first ? indexOfColumnId(first.column) : -1;
      const sorted = first && column >= 0 ? sortRows(items, (item) => item.row[column] ?? null, first.direction, locale) : items;
      // @cpt-end:cpt-frontx-dashboard-flow-widget-catalog-grid-sort-page:p1:inst-wc-sort-do
      // @cpt-begin:cpt-frontx-dashboard-flow-widget-catalog-grid-sort-page:p1:inst-wc-page-do
      const limit = context.pagination?.limit ?? sizes[0];
      const start = ((context.pagination?.page ?? 1) - 1) * limit;
      return { results: sorted.slice(start, start + limit), total: rows.length };
      // @cpt-end:cpt-frontx-dashboard-flow-widget-catalog-grid-sort-page:p1:inst-wc-page-do
    },
    [rows, locale, sizes],
  );

  const headingOf = (column: GridColumn) => column.title ?? column.key;
  // A sort kept from earlier data may name a column the new render no longer has.
  const orderedAt = order?.[0] ? indexOfColumnId(order[0].column) : -1;
  const sortedAt = orderedAt < render.columns.length ? orderedAt : -1;
  const sortedHeading = sortedAt >= 0 ? headingOf(render.columns[sortedAt]) : undefined;
  // Two columns may share a title: count the same-titled sortable columns before the sorted one.
  const occurrence = render.columns.slice(0, Math.max(sortedAt, 0)).filter((column) => column.sortable !== false && headingOf(column) === sortedHeading).length;
  useAriaSort(root, sortedHeading, order?.[0]?.direction, occurrence);

  if (problem) return <WidgetCannotBeShown texts={texts} problem={problem} />;
  if (rows.length === 0) return <WidgetEmpty texts={texts} />;
  const excluded = render.columns.flatMap((column, index) => (column.sortable === false ? [columnId(index)] : []));
  return (
    <div ref={setRoot} className={styles.grid} style={{ '--data-grid-table-min-inline-size': `${tableFloorOf(render.columns)}px` } as CSSProperties}>
      {/* The kit keeps loaded records and its pager size, and reloads on neither a new load nor new limits: new rows or new page sizes remount the grid, which starts it again unsorted on page 1. A new language does not: the columns render it, and the sort and page stay; text already on the page keeps the old language's collation until the next sort or page. */}
      <DataGrid<RowItem> key={`${dataVersion}:${sizes.join(',')}`} name={name} label={label} load={load} columns={columns} persistent="memory" stickyHeader portalContainer={container ?? undefined}>
        <DataGridPaginationPlugin defaultLimit={sizes[0]} limits={sizes} />
        <DataGridOrderPlugin excludedColumns={excluded} />
      </DataGrid>
    </div>
  );
}
