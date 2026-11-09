import { useCallback, useId, useLayoutEffect, useMemo, useRef, useState, type ComponentType } from 'react';
import { CircleAlertIcon, CircleCheckIcon, CircleXIcon, InfoIcon } from 'lucide-react';
import {
  DataGrid,
  DataGridEmptyStatePlugin,
  DataGridOrderPlugin,
  DataGridPaginationPlugin,
  Link,
  VisuallyHidden,
  type DataGridLoadContext,
  type DataGridTableColumn,
  type DataGridTableGroup,
} from '@gears-frontx/ui-kit';
import type { RenderWidgetPayload } from '@gears-frontx/frontx-dashboard-root';

import { formatValue } from '../format';
import { DEFAULT_WIDGET_TEXTS, WidgetCannotBeShown, WidgetEmpty, type WidgetTexts } from '../states';
import type { GridColumn, GridData, GridRender, GridValue } from '../types';
import styles from '../widgets.module.css';
import { DEFAULT_PAGE_SIZES, checkGrid, isLink, isSafeHref, pinnedCount, sortRows } from './gridModel';

type RowItem = { id: number; row: GridValue[] };
type Order = DataGridLoadContext['order'];

const ROW_COLORS = {
  success: { icon: CircleCheckIcon, name: 'Success' },
  warning: { icon: CircleAlertIcon, name: 'Warning' },
  error: { icon: CircleXIcon, name: 'Error' },
  info: { icon: InfoIcon, name: 'Info' },
} as const;

type RowColor = keyof typeof ROW_COLORS;
const rowColorOf = (value: GridValue): RowColor | null => (typeof value === 'string' && value in ROW_COLORS ? (value as RowColor) : null);

function CellText({ value, column, payload, locale }: { value: GridValue; column: GridColumn; payload: RenderWidgetPayload<GridRender, GridData>; locale: string }) {
  const truncate = column.overflow === 'truncate';
  if (isLink(value)) {
    if (!isSafeHref(value.href)) return <span className={truncate ? styles.truncate : undefined}>{value.text}</span>;
    return (
      <Link href={value.href} external rel="noopener noreferrer">
        <span className={truncate ? styles.truncate : undefined} title={truncate ? value.text : undefined}>
          {value.text}
        </span>
      </Link>
    );
  }
  const text = typeof value === 'number' ? formatValue(value, payload.value_format, locale, column.format?.notation) : (value ?? '');
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
  label = 'Table',
  container,
}: {
  payload: RenderWidgetPayload<GridRender, GridData>;
  locale?: string;
  texts?: WidgetTexts;
  /** Names the grid's region and pager; distinct per grid on a page. */
  label?: string;
  /** Where the grid's popups go, for a grid inside a shadow root. */
  container?: HTMLElement | ShadowRoot | null;
}) {
  const { render, data } = payload;
  const name = `grid-${useId().replace(/[^a-zA-Z0-9]/g, '')}`;
  const ref = useRef<HTMLDivElement>(null);
  const [order, setOrder] = useState<Order>(undefined);
  const problem = data ? checkGrid(render, data) : 'grid: no data';
  const rows = useMemo(() => data?.rows ?? [], [data]);
  const sizes = useMemo(() => render.page_sizes ?? DEFAULT_PAGE_SIZES, [render]);
  const keys = useMemo(() => render.columns.map((column) => column.key), [render]);
  const colorAt = render.row_color === undefined ? -1 : keys.indexOf(render.row_color);

  const columns = useMemo(() => {
    const pinned = pinnedCount(render);
    const columnOf = (column: GridColumn, index: number): DataGridTableColumn<RowItem> => ({
      id: column.key,
      label: column.title ?? '',
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
                <VisuallyHidden>{ROW_COLORS[color].name}: </VisuallyHidden>
              </>
            ) : null}
            <CellText value={item.row[index] ?? null} column={column} payload={payload} locale={locale} />
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
  }, [render, payload, locale, colorAt]);

  // @cpt-flow:cpt-frontx-dashboard-flow-widget-catalog-grid-sort-page:p1
  const load = useCallback(
    async (context: DataGridLoadContext) => {
      // @cpt-begin:cpt-frontx-dashboard-flow-widget-catalog-grid-sort-page:p1:inst-wc-sort-do
      const first = context.order?.[0];
      setOrder(context.order);
      const items: RowItem[] = rows.map((row, index) => ({ id: index + 1, row }));
      const column = first ? keys.indexOf(first.column) : -1;
      const sorted = first && column >= 0 ? sortRows(items, (item) => item.row[column] ?? null, first.direction, locale) : items;
      // @cpt-end:cpt-frontx-dashboard-flow-widget-catalog-grid-sort-page:p1:inst-wc-sort-do
      // @cpt-begin:cpt-frontx-dashboard-flow-widget-catalog-grid-sort-page:p1:inst-wc-page-do
      const limit = context.pagination?.limit ?? sizes[0];
      const start = ((context.pagination?.page ?? 1) - 1) * limit;
      return { results: sorted.slice(start, start + limit), total: rows.length };
      // @cpt-end:cpt-frontx-dashboard-flow-widget-catalog-grid-sort-page:p1:inst-wc-page-do
    },
    [rows, keys, locale, sizes],
  );

  // The kit grid names a sortable header as a button and sets no aria-sort; the widget sets it on the header cells.
  useLayoutEffect(() => {
    const sorted = order?.[0];
    const title = sorted ? render.columns.find((column) => column.key === sorted.column)?.title : undefined;
    ref.current?.querySelectorAll('th').forEach((header) => {
      const button = header.querySelector('button[aria-label]');
      if (!button) return;
      const active = sorted !== undefined && title !== undefined && button.getAttribute('aria-label')?.includes(`'${title}'`);
      header.setAttribute('aria-sort', active ? (sorted.direction === 'asc' ? 'ascending' : 'descending') : 'none');
    });
  });

  const Empty = useMemo(() => () => <WidgetEmpty texts={texts} />, [texts]);
  if (problem) return <WidgetCannotBeShown texts={texts} problem={problem} />;
  if (rows.length === 0) return <WidgetEmpty texts={texts} />;
  const excluded = render.columns.filter((column) => column.sortable === false).map((column) => column.key);
  return (
    <div ref={ref} className={styles.grid}>
      <DataGrid<RowItem> name={name} label={label} load={load} columns={columns} persistent="memory" stickyHeader portalContainer={container ?? undefined}>
        <DataGridPaginationPlugin defaultLimit={sizes[0]} limits={sizes} />
        <DataGridOrderPlugin excludedColumns={excluded} />
        <DataGridEmptyStatePlugin component={Empty} />
      </DataGrid>
    </div>
  );
}
