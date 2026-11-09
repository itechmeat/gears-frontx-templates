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
      if (axis === 'time' && typeof point.x !== 'number' && !(ISO_DATE_TIME.test(point.x) && Number.isFinite(Date.parse(point.x)))) {
        return `cartesian_chart: series ${seriesIndex} point ${index} needs an ISO 8601 date-time or epoch milliseconds`;
      }
      // @cpt-end:cpt-frontx-dashboard-algo-widget-catalog-cartesian-checks:p2:inst-wc-cart-time-x
    }
  }
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

/** A value label written above a bar at the end label's row: the y axis it is drawn on and the value at its top. */
export interface LabelledTop {
  axis: 'primary' | 'secondary';
  value: number;
}

// The name of a series at its end, drawn on its last point so it follows a target that changes over the period.
// It moves up above any value label it would cover there. One component type for every render; LabelList clones the element with the point's props.
function EndLabel(props: LabelProps & { text?: string; last?: number; tops?: LabelledTop[] }) {
  const scales = { primary: useYAxisScale('primary'), secondary: useYAxisScale('secondary') };
  if (props.index !== props.last) return null;
  // Value label boxes as [top, bottom] pixel ranges, lowest on screen first, so each lift is checked against every box above it.
  const boxes = (props.tops ?? [])
    .map(({ axis, value }) => scales[axis]?.(value))
    .filter((y): y is number => typeof y === 'number' && Number.isFinite(y))
    .map((y) => [y - VALUE_LABEL_OFFSET - VALUE_LABEL_HEIGHT, y - VALUE_LABEL_OFFSET] as const)
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
// series that repeats an x gets one row per repeat, so no delivered point is overwritten.
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
      row[`s${index}`] = point.y;
      rows.set(key, row);
    }
  });
  const list = [...rows.values()];
  return axis === 'category' ? list : list.sort((a, b) => Number(a.x ?? 0) - Number(b.x ?? 0));
}

// @cpt-dod:cpt-frontx-dashboard-dod-widget-catalog-rendering:p2
/** The `cartesian_chart` widget: the kit chart with Recharts series on one or two y axes. */
export function CartesianChart({
  payload,
  locale = 'en',
  texts = DEFAULT_WIDGET_TEXTS,
  label = 'Chart',
  container,
}: {
  payload: RenderWidgetPayload<CartesianRender, CartesianData>;
  locale?: string;
  texts?: WidgetTexts;
  /** The chart's accessible name. */
  label?: string;
  container?: HTMLElement | ShadowRoot | null;
}) {
  const { render, data, value_format } = payload;
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
  const xText = (value: string | number | null) => (axis === 'time' && typeof value === 'number' ? new Intl.DateTimeFormat(locale, { dateStyle: 'medium' }).format(value) : textOf(value, undefined, locale));
  const xLabel = render.x_axis?.label ?? 'x';

  // Scatter series on a value or time x axis carry their own x and y per point, so the chart draws each series on two value axes.
  // On a category axis they draw as points over the categories of the composed chart below.
  if (axis !== 'category' && data.series.every((series) => typeOf(series.name) === 'scatter')) {
    // On a time axis an ISO x becomes epoch milliseconds, so every view of it shows the same localized date.
    const xOf = (x: string | number | null) => (axis === 'time' && typeof x === 'string' ? Date.parse(x) : x);
    const table: ValuesTable = { columns: ['series', xLabel, render.y_axis?.label ?? 'y'], rows: data.series.flatMap((series) => series.points.map((point) => [series.name, xOf(point.x), point.y])) };
    // The series of each table row, so a y value is formatted by its own series' axis.
    const seriesOfRow = data.series.flatMap((series, index) => series.points.map(() => index));
    const formatCell = (row: number, column: number, value: string | number | null) => (column === 1 ? xText(value) : column === 2 ? formatSeries(seriesOfRow[row])(value) : format(value));
    const scatterSecondary = data.series.some((_, index) => onSecondary(index));
    const offsets = data.series.map((_, index) => data.series.slice(0, index).reduce((sum, series) => sum + series.points.length, 0));
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
              <ScatterChart margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
                <CartesianGrid />
                <XAxis type="number" dataKey="x" name={xLabel} domain={['dataMin', 'dataMax']} tick={TICK} tickLine={false} axisLine={false} tickFormatter={(value: number) => xText(value)} />
                <YAxis
                  yAxisId="primary"
                  tick={TICK}
                  type="number"
                  dataKey="y"
                  name={render.y_axis?.label}
                  tickLine={false}
                  axisLine={false}
                  width={PRIMARY_AXIS_WIDTH}
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
                    width={SECONDARY_AXIS_WIDTH}
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
  const table: ValuesTable = { columns: [xLabel, ...data.series.map((series) => series.name ?? '')], rows: rows.map((row) => [row.x ?? null, ...data.series.map((_, index) => row[`s${index}`] ?? null)]) };
  const secondary = data.series.some((_, index) => onSecondary(index));

  // Value labels: `auto` writes them when each bar is wide enough. Bars of one stack share a slot; Recharts gives the slots 80% of a category.
  const barSlots = new Set(data.series.map((series, index) => (typeOf(series.name) === 'bar' ? (optionOf(series.name)?.stack_group ?? `s${index}`) : null)).filter(Boolean)).size;
  const angle = render.x_axis?.tick_angle ?? 0;
  // A rotated label runs left of its tick: the first category's label can pass the y axis, so the chart keeps that room and the plot is narrower by it.
  const firstLabel = rows.length > 0 ? xText(rows[0].x ?? null).length : 0;
  const rotatedOverhang = angle === 0 ? 0 : Math.max(0, Math.ceil(firstLabel * TICK_CHAR_WIDTH * Math.cos((Math.abs(angle) * Math.PI) / 180)) - PRIMARY_AXIS_WIDTH);
  const plotWidth = width - PRIMARY_AXIS_WIDTH - (secondary ? SECONDARY_AXIS_WIDTH : 8) - rotatedOverhang;
  const barWidth = barSlots > 0 && rows.length > 0 ? (plotWidth * 0.8) / rows.length / barSlots : 0;
  const labels = render.value_labels ?? 'never';
  const showValues = barSlots > 0 && (labels === 'always' || (labels === 'auto' && barWidth >= MIN_LABELLED_BAR));

  // Tick labels: `every` labels each category and thins out to every 2nd, 3rd... when a category is narrower than a label needs.
  const every = render.x_axis?.tick_labels === 'every';
  const longest = Math.max(0, ...rows.map((row) => xText(row.x ?? null).length));
  const slot = rows.length > 0 ? plotWidth / rows.length : 0;
  const sine = Math.sin((Math.abs(angle) * Math.PI) / 180);
  const needed = angle === 0 ? longest * TICK_CHAR_WIDTH + 8 : TICK_TEXT_HEIGHT / sine;
  const tickStep = slot > 0 ? Math.max(1, Math.ceil(needed / slot)) : 1;
  const axisHeight = angle === 0 ? 30 : Math.ceil(longest * TICK_CHAR_WIDTH * sine) + 16;
  // The row of a series' last drawn point, where its name goes; not the last row, which may hold only other series.
  const lastDrawn = (key: string) => rows.reduce((last, row, index) => (typeof row[key] === 'number' ? index : last), -1);
  const hasEndLabel = data.series.some((series) => optionOf(series.name)?.label);
  // The tops of the value labels at a row, where an end label there must not be drawn: a stacked bar's label sits at its stack's running total.
  const labelledTops = (rowIndex: number): LabelledTop[] => {
    if (!showValues) return [];
    const row = rows[rowIndex];
    const totals = new Map<string, number>();
    return data.series.flatMap((series, index) => {
      const value = row?.[`s${index}`];
      if (typeOf(series.name) !== 'bar' || typeof value !== 'number') return [];
      const option = optionOf(series.name);
      const axis = option?.y_axis === 'secondary' ? 'secondary' : 'primary';
      const stack = option?.stack_group === undefined ? undefined : `${axis}:${option.stack_group}`;
      const top = stack === undefined ? value : (totals.get(stack) ?? 0) + value;
      if (stack !== undefined) totals.set(stack, top);
      return [{ axis, value: top } as LabelledTop];
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
                tickFormatter={(value: string | number) => xText(value)}
                tickLine={false}
                axisLine={false}
                minTickGap={every ? 0 : 24}
                interval={every ? tickStep - 1 : undefined}
                angle={angle}
                tick={angle === 0 ? TICK : ROTATED_TICK}
                textAnchor={angle === 0 ? 'middle' : 'end'}
                height={axisHeight}
              />
              <YAxis
                yAxisId="primary"
                tick={TICK}
                tickLine={false}
                axisLine={false}
                width={PRIMARY_AXIS_WIDTH}
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
                  width={SECONDARY_AXIS_WIDTH}
                  scale={render.y_axis_secondary?.type === 'log' ? 'log' : 'auto'}
                  domain={render.y_axis_secondary?.type === 'log' ? ['auto', 'auto'] : undefined}
                  tickFormatter={(value: number) => `${formatValue(value, undefined, locale, 'compact')}${unit}`}
                />
              ) : null}
              <ChartTooltip content={<ChartTooltipContent
                    // The kit resolves a numeric label through the config, so the x comes from the hovered row itself.
                    labelFormatter={(value, payload) => {
                      const x = (payload?.[0] as { payload?: Row } | undefined)?.payload?.x;
                      return xText(x === undefined ? (value as string | number) : x);
                    }}
                    formatter={tooltipFormatter((key, value) => formatSeries(Number(key.slice(1)))(value))} />} />
              {legendOf(render.legend_position)}
              {data.series.map((series, index) => {
                const key = `s${index}`;
                const option = optionOf(series.name);
                const yAxisId = option?.y_axis === 'secondary' ? 'secondary' : 'primary';
                const dash = option?.line_style === 'dashed' ? '4 4' : undefined;
                const name = option?.label ? <LabelList dataKey={key} content={<EndLabel text={option.label} last={lastDrawn(key)} tops={labelledTops(lastDrawn(key))} />} /> : null;
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
                      <Area key={key} yAxisId={yAxisId} dataKey={key} stackId={option?.stack_group} type="monotone" stroke={`var(--color-${key})`} strokeDasharray={dash} fill={`var(--color-${key})`} fillOpacity={0.12} strokeWidth={2} isAnimationActive={false}>
                        {name}
                      </Area>
                    );
                  case 'scatter':
                    return <Scatter key={key} yAxisId={yAxisId} dataKey={key} fill={`var(--color-${key})`} isAnimationActive={false} />;
                  default:
                    return (
                      <Line key={key} yAxisId={yAxisId} dataKey={key} type="monotone" stroke={`var(--color-${key})`} strokeDasharray={dash} strokeWidth={2} dot={false} isAnimationActive={false}>
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
