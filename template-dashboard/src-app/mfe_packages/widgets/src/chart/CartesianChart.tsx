import { useLayoutEffect, useState, type CSSProperties } from 'react';
import { Area, Bar, CartesianGrid, ComposedChart, LabelList, Line, Scatter, ScatterChart, XAxis, YAxis, useYAxisScale, type LabelProps } from 'recharts';
import { ChartContainer, ChartLegend, ChartLegendContent, ChartTooltip, ChartTooltipContent, type ChartConfig } from '@gears-frontx/ui-kit';
import type { RenderWidgetPayload } from '@gears-frontx/frontx-dashboard-root';

import { formatValue, textOf } from '../format';
import { DEFAULT_WIDGET_TEXTS, ValuesText, WidgetCannotBeShown, WidgetEmpty, type WidgetTexts } from '../states';
import type { CartesianData, CartesianRender, CartesianSeriesOption, LegendPosition } from '../types';
import styles from '../widgets.module.css';
import { ChartShell } from './ChartShell';
import type { ValuesTable } from './DataView';

// The kit's five series colours in an order that keeps neighbours apart; the sixth series wraps to the first.
export const PALETTE = ['var(--chart-5)', 'var(--chart-4)', 'var(--chart-2)', 'var(--chart-1)', 'var(--chart-3)'];
const FILL = { '--chart-aspect-ratio': 'auto', blockSize: '100%', inlineSize: '100%' } as CSSProperties;

// A bar gets its value written above it from this width up, in `auto` mode.
const MIN_LABELLED_BAR = 28;
// About the width of one tick character at the kit chart's tick size, and the height of a tick line with a gap.
const TICK_CHAR_WIDTH = 6.5;
const TICK_TEXT_HEIGHT = 15;
const PRIMARY_AXIS_WIDTH = 44;
const SECONDARY_AXIS_WIDTH = 44;
// Tick text in the chart's chrome colour: Recharts paints it #666, which fails contrast on a dark card.
const TICK = { fill: 'var(--muted-foreground)' };
// A rotated tick stays on one line: Recharts wraps tick text to the slot width, which breaks a rotated label into overlapping lines.
const ROTATED_TICK = { ...TICK, width: 10_000 };
// Room between the plot and a legend beside it, so an x tick centred on the plot's edge stays clear of the legend.
const LEGEND_GAP = 16;
// The heights of a value label and of an end label line, at the micro text size, with the value label's offset.
const VALUE_LABEL_HEIGHT = 12;
const END_LABEL_HEIGHT = 12;
const VALUE_LABEL_OFFSET = 4;
// The room an axis title takes beside its ticks: one micro text line with a gap.
const AXIS_TITLE = 16;
const DAY = 86_400_000;

const ISO_DATE_TIME = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2}(\.\d+)?)?(Z|[+-]\d{2}:\d{2})?$/;

// @cpt-algo:cpt-frontx-dashboard-algo-widget-catalog-cartesian-checks:p2
/** The chart's own check of x values against the x axis type: the first problem found, or null. */
export function checkCartesian(render: CartesianRender, data: CartesianData): string | null {
  const axis = render.x_axis?.type ?? 'category';
  // The problem names the series and the point by position: series names are delivered data, which the console never gets.
  for (const [seriesIndex, series] of data.series.entries()) {
    for (const [index, point] of series.points.entries()) {
      if (point.x === null) continue;
      // @cpt-begin:cpt-frontx-dashboard-algo-widget-catalog-cartesian-checks:p2:inst-wc-cart-value-x
      if (axis === 'value' && typeof point.x !== 'number') return `cartesian_chart: series ${seriesIndex} point ${index} needs a number x`;
      // @cpt-end:cpt-frontx-dashboard-algo-widget-catalog-cartesian-checks:p2:inst-wc-cart-value-x
      // @cpt-begin:cpt-frontx-dashboard-algo-widget-catalog-cartesian-checks:p2:inst-wc-cart-time-x
      // A number must also be a time a date can hold: Date takes only ±8.64e15 milliseconds around 1970.
      if (axis === 'time' && !Number.isFinite(typeof point.x === 'number' ? new Date(point.x).getTime() : ISO_DATE_TIME.test(point.x) ? Date.parse(point.x) : NaN)) {
        return `cartesian_chart: series ${seriesIndex} point ${index} needs an ISO 8601 date-time or epoch milliseconds`;
      }
      // @cpt-end:cpt-frontx-dashboard-algo-widget-catalog-cartesian-checks:p2:inst-wc-cart-time-x
    }
  }
  // @cpt-begin:cpt-frontx-dashboard-algo-widget-catalog-cartesian-checks:p2:inst-wc-cart-log-y
  for (const [seriesIndex, series] of data.series.entries()) {
    const secondary = render.series?.find((option) => option.name === series.name)?.y_axis === 'secondary';
    if ((secondary ? render.y_axis_secondary?.type : render.y_axis?.type) !== 'log') continue;
    // On a value or time axis a point with a null x is not drawn, so its y is not checked.
    const index = series.points.findIndex((point) => (axis === 'category' || point.x !== null) && point.y !== null && !(point.y > 0));
    if (index >= 0) return `cartesian_chart: series ${seriesIndex} point ${index} needs a y above zero on its log axis`;
  }
  // @cpt-end:cpt-frontx-dashboard-algo-widget-catalog-cartesian-checks:p2:inst-wc-cart-log-y
  return null;
}

/** The width of an element, kept current by a ResizeObserver; 0 until it is laid out. */
function useElementWidth() {
  const [element, setElement] = useState<HTMLDivElement | null>(null);
  const [width, setWidth] = useState(0);
  useLayoutEffect(() => {
    if (!element) return;
    const observer = new ResizeObserver(([entry]) => setWidth(entry.contentRect.width));
    observer.observe(element);
    return () => observer.disconnect();
  }, [element]);
  return [setElement, width] as const;
}

export function legendOf(position: LegendPosition | undefined, nameKey?: string) {
  const at = position ?? 'bottom';
  if (at === 'none') return null;
  const side = at === 'left' || at === 'right';
  return (
    <ChartLegend
      layout={side ? 'vertical' : 'horizontal'}
      align={side ? at : 'center'}
      verticalAlign={side ? 'middle' : at}
      // A legend never takes more than half the chart, so the plot or the pie keeps room in a short cell; the rest scrolls.
      wrapperStyle={side ? { maxInlineSize: '50%', maxBlockSize: '100%', overflowY: 'auto', [at === 'right' ? 'paddingInlineStart' : 'paddingInlineEnd']: LEGEND_GAP } : { maxBlockSize: '50%', overflowY: 'auto' }}
      content={<ChartLegendContent nameKey={nameKey} className={side ? `${styles.legend} ${styles.legendSide}` : styles.legend} />}
    />
  );
}

/**
 * A bar value label at the end label's row: the y axis it is drawn on, the value at the bar's end, and whether
 * Recharts writes it below that end, which it does for a bar or stack segment that grows downwards.
 */
export interface LabelledTop {
  axis: 'primary' | 'secondary';
  value: number;
  below: boolean;
}

// The name of a series at its end, drawn on its last point so it follows a target that changes over the period.
// It moves up above any value label it would cover there. One component type for every render; LabelList clones the element with the point's props.
function EndLabel(props: LabelProps & { text?: string; last?: number; tops?: LabelledTop[] }) {
  const scales = { primary: useYAxisScale('primary'), secondary: useYAxisScale('secondary') };
  if (props.index !== props.last) return null;
  // Value label boxes as [top, bottom] pixel ranges, lowest on screen first, so each lift is checked against every box above it.
  const boxes = (props.tops ?? [])
    .map(({ axis, value, below }) => ({ y: scales[axis]?.(value), below }))
    .filter((box): box is { y: number; below: boolean } => typeof box.y === 'number' && Number.isFinite(box.y))
    .map(({ y, below }): readonly [number, number] => (below ? [y + VALUE_LABEL_OFFSET, y + VALUE_LABEL_OFFSET + VALUE_LABEL_HEIGHT] : [y - VALUE_LABEL_OFFSET - VALUE_LABEL_HEIGHT, y - VALUE_LABEL_OFFSET]))
    .sort((a, b) => b[0] - a[0]);
  let baseline = Number(props.y) - 8;
  for (const [top, bottom] of boxes) if (baseline > top && baseline - END_LABEL_HEIGHT < bottom) baseline = top - 2;
  return (
    <text x={Number(props.x)} y={baseline} textAnchor="end" className={styles.lineLabel}>
      {props.text}
    </text>
  );
}

type Row = Record<string, string | number | null>;

// One row per x position: in delivered order on a category axis, by value on a value or time axis,
// where a point with a null x has no position and is left out. The key keeps "1" and 1 apart, and a
// series that repeats an x gets one row per repeat, so no delivered point is overwritten. `v<i>` holds
// a series' delivered value, `s<i>` the value it is drawn at (see `drawnValues`).
function rowsOf(data: CartesianData, axis: 'category' | 'value' | 'time'): Row[] {
  const rows = new Map<string, Row>();
  data.series.forEach((series, index) => {
    const repeats = new Map<string, number>();
    for (const point of series.points) {
      if (axis !== 'category' && point.x === null) continue;
      const x = axis === 'time' && typeof point.x === 'string' ? Date.parse(point.x) : point.x;
      const value = `${typeof x}:${String(x)}`;
      const repeat = repeats.get(value) ?? 0;
      repeats.set(value, repeat + 1);
      const key = `${value}#${repeat}`;
      const row = rows.get(key) ?? { x };
      row[`v${index}`] = point.y;
      row[`s${index}`] = point.y;
      rows.set(key, row);
    }
  });
  const list = [...rows.values()];
  return axis === 'category' ? list : list.sort((a, b) => Number(a.x ?? 0) - Number(b.x ?? 0));
}

/**
 * Sets the drawn values of the line and area series in sorted rows. On a value or time axis a row exists for
 * every x of every series, so a line or area that has no point at another series' x would break there:
 * it gets the value on the straight line between its own points around that x (straight on the axis's
 * scale: on a log axis, between the logarithms), which is drawn and never shown as a value. A null value
 * stays a gap. Line series of a stack group then draw the running total of the group's lines on their axis,
 * in delivered order; bars and areas stack among themselves in Recharts.
 */
function drawnValues(rows: Row[], data: CartesianData, axis: 'category' | 'value' | 'time', optionOf: (name: string | null) => CartesianSeriesOption | undefined, logAxis: (index: number) => boolean) {
  const typeOf = (index: number) => optionOf(data.series[index].name)?.type ?? 'bar';
  if (axis !== 'category') {
    data.series.forEach((_, index) => {
      if (typeOf(index) !== 'line' && typeOf(index) !== 'area') return;
      const key = `v${index}`;
      let previous = -1;
      rows.forEach((row, at) => {
        if (!(key in row)) return;
        const from = rows[previous]?.[key];
        const to = row[key];
        if (previous >= 0 && typeof from === 'number' && typeof to === 'number') {
          const x0 = Number(rows[previous].x);
          const span = Number(row.x) - x0;
          const log = logAxis(index) && from > 0 && to > 0;
          for (let between = previous + 1; between < at; between += 1) {
            const share = span === 0 ? 0 : (Number(rows[between].x) - x0) / span;
            // Between the logarithms, which stays finite for any two positive values.
            rows[between][`s${index}`] = log ? Math.exp((1 - share) * Math.log(from) + share * Math.log(to)) : from + (to - from) * share;
          }
        }
        previous = at;
      });
    });
  }
  const totals = new Map<string, number[]>();
  data.series.forEach((series, index) => {
    const option = optionOf(series.name);
    if (typeOf(index) !== 'line' || option?.stack_group === undefined) return;
    const group = `${option.y_axis === 'secondary' ? 'secondary' : 'primary'}:${option.stack_group}`;
    const sums = totals.get(group) ?? rows.map(() => 0);
    totals.set(group, sums);
    rows.forEach((row, at) => {
      const value = row[`s${index}`];
      if (typeof value !== 'number') return;
      sums[at] += value;
      row[`s${index}`] = sums[at];
    });
  });
}

// @cpt-dod:cpt-frontx-dashboard-dod-widget-catalog-rendering:p2
/** The `cartesian_chart` widget: the kit chart with Recharts series on one or two y axes. */
export function CartesianChart({
  payload,
  locale = 'en',
  texts = DEFAULT_WIDGET_TEXTS,
  label: labelProp,
  container,
}: {
  payload: RenderWidgetPayload<CartesianRender, CartesianData>;
  locale?: string;
  texts?: WidgetTexts;
  /** The chart's accessible name; `texts.chart` when the cell gives none. */
  label?: string;
  container?: HTMLElement | ShadowRoot | null;
}) {
  const { render, data, value_format } = payload;
  const label = labelProp ?? texts.chart;
  const [measure, width] = useElementWidth();
  if (!data) return <WidgetCannotBeShown texts={texts} problem="cartesian_chart: no data" />;
  const problem = checkCartesian(render, data);
  if (problem) return <WidgetCannotBeShown texts={texts} problem={problem} />;
  if (data.series.length === 0 || data.series.every((series) => series.points.length === 0)) return <WidgetEmpty texts={texts} />;

  const axis = render.x_axis?.type ?? 'category';
  const optionOf = (name: string | null): CartesianSeriesOption | undefined => render.series?.find((series) => series.name === name);
  const typeOf = (name: string | null) => optionOf(name)?.type ?? 'bar';
  const config: ChartConfig = Object.fromEntries(data.series.map((series, index) => [`s${index}`, { label: series.name ?? '', color: PALETTE[index % PALETTE.length] }]));
  const format = (value: string | number | null) => (typeof value === 'number' ? formatValue(value, value_format, locale) : (value ?? ''));
  const unit = render.y_axis_secondary?.unit ?? '';
  // A series on the secondary axis shows plain numbers with that axis's unit; the others follow value_format.
  const onSecondary = (index: number) => optionOf(data.series[index]?.name ?? null)?.y_axis === 'secondary';
  const formatSeries = (index: number) => (value: string | number | null) =>
    onSecondary(index) && typeof value === 'number' ? `${formatValue(value, undefined, locale)}${unit}` : format(value);
  // The tooltip names a series by its legend label and shows its value as the chart formats it.
  // A scatter entry is named by its axis: x by the x label, y by its series, which each point carries.
  const labelOf = (name: string, key: unknown, item: unknown) => {
    if (name === 'x') return xLabel;
    const series = (item as { payload?: { series?: unknown } } | undefined)?.payload?.series;
    if (name === 'y' && typeof series === 'number') return String(config[`s${series}`]?.label ?? '');
    return String(config[name]?.label ?? key);
  };
  const tooltipFormatter = (valueOf: (key: string, value: number, item: unknown) => string) =>
    function TooltipValue(value: unknown, key: unknown, item: unknown) {
      // A scatter entry names its axis by its dataKey ("x" or "y"); a series entry by its config key.
      const dataKey = (item as { dataKey?: unknown } | undefined)?.dataKey;
      const name = dataKey === 'x' || dataKey === 'y' ? String(dataKey) : String(key);
      return (
        <span className={styles.tooltipRow}>
          <span>{labelOf(name, key, item)}</span>
          <span className={styles.tooltipValue}>{typeof value === 'number' ? valueOf(name, value, item) : String(value ?? '')}</span>
        </span>
      );
    };
  // On a time axis, points that all fall on a midnight are days: every view shows the date alone, read in UTC when they
  // are UTC midnights, so a day delivered as 00:00Z keeps its date in any zone. Otherwise the ticks show the time of day
  // when the points span less than two days (with the day when they cross a local midnight) and dates beyond that,
  // and every other view shows the date with the time.
  const times = axis === 'time' ? data.series.flatMap((series) => series.points.map((point) => (typeof point.x === 'string' ? Date.parse(point.x) : point.x))).filter((x): x is number => typeof x === 'number') : [];
  const first = times.reduce((min, time) => Math.min(min, time), Infinity);
  const last = times.reduce((max, time) => Math.max(max, time), -Infinity);
  const utcDays = times.every((time) => time % DAY === 0);
  const days = utcDays || times.every((time) => new Date(time).setHours(0, 0, 0, 0) === time);
  const timeStyle = times.some((time) => time % 60_000 !== 0) ? 'medium' : 'short';
  const oneDay = times.length > 0 && new Date(first).toDateString() === new Date(last).toDateString();
  const dayFormat: Intl.DateTimeFormatOptions = { dateStyle: 'medium', ...(utcDays ? { timeZone: 'UTC' } : {}) };
  const hours: Intl.DateTimeFormatOptions = { hour: 'numeric', minute: '2-digit', ...(timeStyle === 'medium' ? { second: '2-digit' } : {}) };
  const tickDates = new Intl.DateTimeFormat(locale, days || last - first >= 2 * DAY ? dayFormat : oneDay ? { timeStyle } : { month: 'short', day: 'numeric', ...hours });
  const fullDates = new Intl.DateTimeFormat(locale, days ? dayFormat : { dateStyle: 'medium', timeStyle });
  const xText = (value: string | number | null) => (axis === 'time' && typeof value === 'number' ? fullDates.format(value) : textOf(value, undefined, locale));
  const tickText = (value: string | number | null) => (axis === 'time' && typeof value === 'number' ? tickDates.format(value) : textOf(value, undefined, locale));
  const xLabel = render.x_axis?.label ?? texts.columns.x;
  // Axis titles: the x title under the ticks, a y title along its axis, outside the ticks; each axis grows by the title's line.
  // The offsets keep the whole line inside the chart: the descenders of an x title, half the line height of a turned y title.
  const titleOf = (value: string | undefined, side: 'x' | 'primary' | 'secondary') =>
    value
      ? {
          value,
          fill: TICK.fill,
          className: styles.axisTitle,
          ...(side === 'x'
            ? { position: 'insideBottom' as const, offset: 3 }
            : { angle: side === 'primary' ? -90 : 90, position: side === 'primary' ? ('insideLeft' as const) : ('insideRight' as const), offset: 8, style: { textAnchor: 'middle' as const } }),
        }
      : undefined;
  const primaryWidth = PRIMARY_AXIS_WIDTH + (render.y_axis?.label ? AXIS_TITLE : 0);
  const secondaryWidth = SECONDARY_AXIS_WIDTH + (render.y_axis_secondary?.label ? AXIS_TITLE : 0);
  const xTitle = render.x_axis?.label ? AXIS_TITLE : 0;
  const angle = render.x_axis?.tick_angle ?? 0;
  const sine = Math.sin((Math.abs(angle) * Math.PI) / 180);
  // The x axis height for tick labels of up to `longest` characters at the tick angle, with the x title.
  const xAxisHeight = (longest: number) => (angle === 0 ? 30 : Math.ceil(longest * TICK_CHAR_WIDTH * sine) + 16) + xTitle;
  // A rotated label runs left of its tick: the first one's label can pass the y axis, so the chart keeps that room and the plot is narrower by it.
  const overhangOf = (firstLabel: number) => (angle === 0 ? 0 : Math.max(0, Math.ceil(firstLabel * TICK_CHAR_WIDTH * Math.cos((Math.abs(angle) * Math.PI) / 180)) - primaryWidth));
  const xTick = { angle, tick: angle === 0 ? TICK : ROTATED_TICK, textAnchor: angle === 0 ? ('middle' as const) : ('end' as const) };

  // Scatter series on a value or time x axis carry their own x and y per point, so the chart draws each series on two value axes.
  // On a category axis they draw as points over the categories of the composed chart below.
  if (axis !== 'category' && data.series.every((series) => typeOf(series.name) === 'scatter')) {
    // On a time axis an ISO x becomes epoch milliseconds, so every view of it shows the same localized date.
    const xOf = (x: string | number | null) => (axis === 'time' && typeof x === 'string' ? Date.parse(x) : x);
    const table: ValuesTable = { columns: [texts.columns.series, xLabel, render.y_axis?.label ?? texts.columns.y], rows: data.series.flatMap((series) => series.points.map((point) => [series.name, xOf(point.x), point.y])) };
    // The series of each table row, so a y value is formatted by its own series' axis.
    const seriesOfRow = data.series.flatMap((series, index) => series.points.map(() => index));
    const formatCell = (row: number, column: number, value: string | number | null) => (column === 1 ? xText(value) : column === 2 ? formatSeries(seriesOfRow[row])(value) : format(value));
    const scatterSecondary = data.series.some((_, index) => onSecondary(index));
    const offsets = data.series.map((_, index) => data.series.slice(0, index).reduce((sum, series) => sum + series.points.length, 0));
    // The first x tick sits at the smallest x.
    const xs = table.rows.map((row) => row[1]).filter((x): x is number => typeof x === 'number');
    // A reduce, not Math.min(...xs): spreading a very long series overflows the call stack.
    const firstOverhang = xs.length > 0 ? overhangOf(tickText(xs.reduce((min, x) => Math.min(min, x), Infinity)).length) : 0;
    return (
      <div className={styles.fill} role="figure" aria-label={label}>
        <ChartShell
          drillDown={render.drill_down === true}
          table={table}
          label={texts.dataOf(label)}
          texts={texts}
          format={(value, column, row) => formatCell(row, column, value)}
          locale={locale}
          container={container}
          draw={(onPick) => (
            <ChartContainer config={config} style={FILL}>
              <ScatterChart margin={{ top: 8, right: 8, bottom: 0, left: firstOverhang }}>
                <CartesianGrid />
                <XAxis type="number" dataKey="x" name={xLabel} domain={['dataMin', 'dataMax']} tickLine={false} axisLine={false} tickFormatter={(value: number) => tickText(value)} height={xAxisHeight(table.rows.reduce((max, row) => Math.max(max, tickText(row[1]).length), 0))} label={titleOf(render.x_axis?.label, 'x')} {...xTick} />
                <YAxis
                  yAxisId="primary"
                  tick={TICK}
                  type="number"
                  dataKey="y"
                  name={render.y_axis?.label}
                  tickLine={false}
                  axisLine={false}
                  width={primaryWidth}
                  label={titleOf(render.y_axis?.label, 'primary')}
                  scale={render.y_axis?.type === 'log' ? 'log' : 'auto'}
                  domain={['auto', 'auto']}
                  tickFormatter={(value: number) => formatValue(value, value_format, locale, 'compact')}
                />
                {scatterSecondary ? (
                  <YAxis
                    yAxisId="secondary"
                    tick={TICK}
                    orientation="right"
                    type="number"
                    dataKey="y"
                    name={render.y_axis_secondary?.label}
                    tickLine={false}
                    axisLine={false}
                    width={secondaryWidth}
                    label={titleOf(render.y_axis_secondary?.label, 'secondary')}
                    scale={render.y_axis_secondary?.type === 'log' ? 'log' : 'auto'}
                    domain={['auto', 'auto']}
                    tickFormatter={(value: number) => `${formatValue(value, undefined, locale, 'compact')}${unit}`}
                  />
                ) : null}
                <ChartTooltip
                  content={
                    <ChartTooltipContent
                      hideLabel
                      formatter={tooltipFormatter((key, value, item) => {
                        if (key === 'x') return xText(value);
                        const series = Number((item as { payload?: { series?: unknown } } | undefined)?.payload?.series);
                        return Number.isInteger(series) ? formatSeries(series)(value) : format(value);
                      })}
                    />
                  }
                />
                {legendOf(render.legend_position)}
                {data.series.map((series, index) => (
                  <Scatter
                    key={index}
                    name={`s${index}`}
                    yAxisId={onSecondary(index) ? 'secondary' : 'primary'}
                    data={series.points.map((point) => ({ x: axis === 'time' && typeof point.x === 'string' ? Date.parse(point.x) : point.x, y: point.y, series: index }))}
                    fill={`var(--color-s${index})`}
                    isAnimationActive={false}
                    onClick={onPick ? (_entry: unknown, pointIndex: number) => onPick(offsets[index] + pointIndex) : undefined}
                  />
                ))}
              </ScatterChart>
            </ChartContainer>
          )}
        />
        <ValuesText caption={label} columns={table.columns} rows={table.rows.map((row, rowIndex) => row.map((value, index) => formatCell(rowIndex, index, value)))} />
      </div>
    );
  }

  const rows = rowsOf(data, axis);
  drawnValues(rows, data, axis, optionOf, (index) => (onSecondary(index) ? render.y_axis_secondary?.type : render.y_axis?.type) === 'log');
  const table: ValuesTable = { columns: [xLabel, ...data.series.map((series) => series.name ?? '')], rows: rows.map((row) => [row.x ?? null, ...data.series.map((_, index) => row[`v${index}`] ?? null)]) };
  const secondary = data.series.some((_, index) => onSecondary(index));

  // Value labels: `auto` writes them when each bar is wide enough. Bars of one stack share a slot; Recharts gives the slots 80% of a category.
  const barSlots = new Set(data.series.map((series, index) => (typeOf(series.name) === 'bar' ? (optionOf(series.name)?.stack_group ?? `s${index}`) : null)).filter(Boolean)).size;
  // A rotated label runs left of its tick: the first category's label can pass the y axis, so the chart keeps that room and the plot is narrower by it.
  const firstLabel = rows.length > 0 ? tickText(rows[0].x ?? null).length : 0;
  const rotatedOverhang = overhangOf(firstLabel);
  const plotWidth = width - primaryWidth - (secondary ? secondaryWidth : 8) - rotatedOverhang;
  const barWidth = barSlots > 0 && rows.length > 0 ? (plotWidth * 0.8) / rows.length / barSlots : 0;
  const labels = render.value_labels ?? 'never';
  const showValues = barSlots > 0 && (labels === 'always' || (labels === 'auto' && barWidth >= MIN_LABELLED_BAR));

  // Tick labels: `every` labels each category and thins out to every 2nd, 3rd... when a category is narrower than a label needs.
  // Only a category axis has a tick per row; a value or time axis draws its own few number ticks, which minTickGap keeps apart.
  const every = axis === 'category' && render.x_axis?.tick_labels === 'every';
  const longest = rows.reduce((max, row) => Math.max(max, tickText(row.x ?? null).length), 0);
  const slot = rows.length > 0 ? plotWidth / rows.length : 0;
  const needed = angle === 0 ? longest * TICK_CHAR_WIDTH + 8 : TICK_TEXT_HEIGHT / sine;
  const tickStep = slot > 0 ? Math.max(1, Math.ceil(needed / slot)) : 1;
  // The row of a series' last drawn point, where its name goes; not the last row, which may hold only other series.
  const lastDrawn = (index: number) => rows.reduce((last, row, at) => (typeof row[`v${index}`] === 'number' ? at : last), -1);
  const hasEndLabel = data.series.some((series) => optionOf(series.name)?.label);
  // The tops of the value labels at a row, where an end label there must not be drawn: a stacked bar's label sits at its stack's running total.
  const labelledTops = (rowIndex: number): LabelledTop[] => {
    if (!showValues) return [];
    const row = rows[rowIndex];
    const totals = new Map<string, number>();
    return data.series.flatMap((series, index) => {
      const value = row?.[`v${index}`];
      // A zero-height bar has no value label.
      if (typeOf(series.name) !== 'bar' || typeof value !== 'number' || value === 0) return [];
      const option = optionOf(series.name);
      const axis = option?.y_axis === 'secondary' ? 'secondary' : 'primary';
      const stack = option?.stack_group === undefined ? undefined : `${axis}:${option.stack_group}`;
      const top = stack === undefined ? value : (totals.get(stack) ?? 0) + value;
      if (stack !== undefined) totals.set(stack, top);
      return [{ axis, value: top, below: value < 0 } as LabelledTop];
    });
  };

  return (
    <div ref={measure} className={styles.fill} role="figure" aria-label={label}>
      <ChartShell
        drillDown={render.drill_down === true}
        table={table}
        label={texts.dataOf(label)}
        texts={texts}
        format={(value, column) => (column === 0 ? xText(value) : formatSeries(column - 1)(value))}
        locale={locale}
        container={container}
        draw={(onPick) => (
          <ChartContainer config={config} style={FILL}>
            <ComposedChart
              data={rows}
              margin={{ top: showValues && hasEndLabel ? 34 : showValues || hasEndLabel ? 20 : 8, right: secondary ? 0 : 8, bottom: 0, left: rotatedOverhang }}
              onClick={
                onPick
                  ? (state) => {
                      // A click outside any point carries no index, and must not pick row 0.
                      if (state.activeTooltipIndex === null || state.activeTooltipIndex === undefined) return;
                      const index = Number(state.activeTooltipIndex);
                      if (Number.isInteger(index) && index >= 0) onPick(index);
                    }
                  : undefined
              }
            >
              <CartesianGrid vertical={false} />
              <XAxis
                dataKey="x"
                type={axis === 'category' ? 'category' : 'number'}
                domain={axis === 'category' ? undefined : ['dataMin', 'dataMax']}
                tickFormatter={(value: string | number) => tickText(value)}
                label={titleOf(render.x_axis?.label, 'x')}
                tickLine={false}
                axisLine={false}
                minTickGap={every ? 0 : 24}
                interval={every ? tickStep - 1 : undefined}
                {...xTick}
                height={xAxisHeight(longest)}
              />
              <YAxis
                yAxisId="primary"
                tick={TICK}
                tickLine={false}
                axisLine={false}
                width={primaryWidth}
                label={titleOf(render.y_axis?.label, 'primary')}
                scale={render.y_axis?.type === 'log' ? 'log' : 'auto'}
                domain={render.y_axis?.type === 'log' ? ['auto', 'auto'] : undefined}
                tickFormatter={(value: number) => formatValue(value, value_format, locale, 'compact')}
              />
              {secondary ? (
                <YAxis
                  yAxisId="secondary"
                  tick={TICK}
                  orientation="right"
                  tickLine={false}
                  axisLine={false}
                  width={secondaryWidth}
                  label={titleOf(render.y_axis_secondary?.label, 'secondary')}
                  scale={render.y_axis_secondary?.type === 'log' ? 'log' : 'auto'}
                  domain={render.y_axis_secondary?.type === 'log' ? ['auto', 'auto'] : undefined}
                  tickFormatter={(value: number) => `${formatValue(value, undefined, locale, 'compact')}${unit}`}
                />
              ) : null}
              <ChartTooltip
                content={(props) => (
                  <ChartTooltipContent
                    {...props}
                    // Only the series delivered at the hovered x: a drawn-only value between a line's own points is never shown.
                    // An entry's name is its dataKey (`s<i>`), the Recharts fallback for an item without a `name`.
                    payload={props.payload?.filter((item) => `v${String(item.name).slice(1)}` in ((item.payload as Row | undefined) ?? {}))}
                    // The kit resolves a numeric label through the config, so the x comes from the hovered row itself.
                    labelFormatter={(value, payload) => {
                      const x = (payload?.[0] as { payload?: Row } | undefined)?.payload?.x;
                      return xText(x === undefined ? (value as string | number) : x);
                    }}
                    // The delivered value, not the drawn one, which is a running total on a stacked line.
                    formatter={tooltipFormatter((key, value, item) => {
                      const delivered = (item as { payload?: Row } | undefined)?.payload?.[`v${key.slice(1)}`];
                      return formatSeries(Number(key.slice(1)))(typeof delivered === 'number' ? delivered : value);
                    })}
                  />
                )}
              />
              {legendOf(render.legend_position)}
              {data.series.map((series, index) => {
                const key = `s${index}`;
                const option = optionOf(series.name);
                const yAxisId = option?.y_axis === 'secondary' ? 'secondary' : 'primary';
                const dash = option?.line_style === 'dashed' ? '4 4' : undefined;
                const name = option?.label ? <LabelList dataKey={key} content={<EndLabel text={option.label} last={lastDrawn(index)} tops={labelledTops(lastDrawn(index))} />} /> : null;
                // The hover dot marks a delivered point only, never a drawn-only value between a line's points.
                const activeDot = (dot: { cx?: number; cy?: number; payload?: Row }) =>
                  typeof dot.payload?.[`v${index}`] === 'number' ? <circle cx={dot.cx} cy={dot.cy} r={4} fill={`var(--color-${key})`} stroke="var(--background)" strokeWidth={2} /> : <g />;
                switch (typeOf(series.name)) {
                  case 'bar':
                    return (
                      <Bar
                        key={key}
                        yAxisId={yAxisId}
                        dataKey={key}
                        stackId={option?.stack_group}
                        fill={`var(--color-${key})`}
                        radius={option?.stack_group ? 0 : [3, 3, 0, 0]}
                        isAnimationActive={false}
                        onClick={onPick ? (_entry: unknown, barIndex: number) => onPick(barIndex) : undefined}
                      >
                        {showValues ? <LabelList dataKey={key} position="top" offset={4} className={styles.valueLabel} formatter={(value) => (typeof value === 'number' ? formatSeries(index)(value) : '')} /> : null}
                      </Bar>
                    );
                  case 'area':
                    return (
                      <Area key={key} yAxisId={yAxisId} dataKey={key} stackId={option?.stack_group} type="monotone" stroke={`var(--color-${key})`} strokeDasharray={dash} fill={`var(--color-${key})`} fillOpacity={0.12} strokeWidth={2} activeDot={activeDot} isAnimationActive={false}>
                        {name}
                      </Area>
                    );
                  case 'scatter':
                    return <Scatter key={key} yAxisId={yAxisId} dataKey={key} fill={`var(--color-${key})`} isAnimationActive={false} />;
                  default:
                    return (
                      <Line key={key} yAxisId={yAxisId} dataKey={key} type="monotone" stroke={`var(--color-${key})`} strokeDasharray={dash} strokeWidth={2} dot={false} activeDot={activeDot} isAnimationActive={false}>
                        {name}
                      </Line>
                    );
                }
              })}
            </ComposedChart>
          </ChartContainer>
        )}
      />
      <ValuesText caption={label} columns={table.columns} rows={table.rows.map(([x, ...ys]) => [xText(x), ...ys.map((value, index) => formatSeries(index)(value))])} />
    </div>
  );
}
