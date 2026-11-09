import { useLayoutEffect, useState, type CSSProperties } from 'react';
import { Area, Bar, CartesianGrid, ComposedChart, LabelList, Line, Scatter, ScatterChart, XAxis, YAxis, type LabelProps } from 'recharts';
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

const ISO_DATE_TIME = /^\d{4}-\d{2}-\d{2}(T\d{2}:\d{2}(:\d{2}(\.\d+)?)?(Z|[+-]\d{2}:\d{2})?)?$/;

// @cpt-algo:cpt-frontx-dashboard-algo-widget-catalog-cartesian-checks:p2
/** The chart's own check of x values against the x axis type: the first problem found, or null. */
export function checkCartesian(render: CartesianRender, data: CartesianData): string | null {
  const axis = render.x_axis?.type ?? 'category';
  for (const series of data.series) {
    for (const [index, point] of series.points.entries()) {
      if (point.x === null) continue;
      // @cpt-begin:cpt-frontx-dashboard-algo-widget-catalog-cartesian-checks:p2:inst-wc-cart-value-x
      if (axis === 'value' && typeof point.x !== 'number') return `cartesian_chart: series ${series.name ?? ''} point ${index} needs a number x`;
      // @cpt-end:cpt-frontx-dashboard-algo-widget-catalog-cartesian-checks:p2:inst-wc-cart-value-x
      // @cpt-begin:cpt-frontx-dashboard-algo-widget-catalog-cartesian-checks:p2:inst-wc-cart-time-x
      if (axis === 'time' && typeof point.x !== 'number' && !(ISO_DATE_TIME.test(point.x) && Number.isFinite(Date.parse(point.x)))) {
        return `cartesian_chart: series ${series.name ?? ''} point ${index} needs an ISO 8601 date-time or epoch milliseconds`;
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
      content={<ChartLegendContent nameKey={nameKey} className={styles.legend} />}
    />
  );
}

// The name of a series at its end, drawn on its last point so it follows a target that changes over the period.
const endLabel = (text: string, last: number, color: string) =>
  function EndLabel(props: LabelProps) {
    if (props.index !== last) return null;
    return (
      <text x={Number(props.x)} y={Number(props.y) - 8} textAnchor="end" fill={color} className={styles.lineLabel}>
        {text}
      </text>
    );
  };

type Row = Record<string, string | number | null>;

// One row per x position: in delivered order on a category axis, by value on a value or time axis.
function rowsOf(data: CartesianData, axis: 'category' | 'value' | 'time'): Row[] {
  const rows = new Map<string, Row>();
  data.series.forEach((series, index) => {
    for (const point of series.points) {
      const x = axis === 'time' && typeof point.x === 'string' ? Date.parse(point.x) : point.x;
      const key = String(x);
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
  const xText = (value: string | number | null) => (axis === 'time' && typeof value === 'number' ? new Intl.DateTimeFormat(locale, { dateStyle: 'medium' }).format(value) : textOf(value, undefined, locale));
  const xLabel = render.x_axis?.label ?? 'x';

  // Scatter series carry their own x and y per point, so an all-scatter chart draws each series on two value axes.
  if (data.series.every((series) => typeOf(series.name) === 'scatter')) {
    const table: ValuesTable = { columns: ['series', xLabel, render.y_axis?.label ?? 'y'], rows: data.series.flatMap((series) => series.points.map((point) => [series.name, point.x, point.y])) };
    const offsets = data.series.map((_, index) => data.series.slice(0, index).reduce((sum, series) => sum + series.points.length, 0));
    return (
      <div className={styles.fill} role="figure" aria-label={label}>
        <ChartShell
          drillDown={render.drill_down === true}
          table={table}
          label={texts.dataOf(label)}
          texts={texts}
          format={format}
          locale={locale}
          container={container}
          draw={(onPick) => (
            <ChartContainer config={config} style={FILL}>
              <ScatterChart margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
                <CartesianGrid />
                <XAxis type="number" dataKey="x" name={xLabel} tickLine={false} axisLine={false} tickFormatter={(value: number) => xText(value)} />
                <YAxis type="number" dataKey="y" name={render.y_axis?.label} tickLine={false} axisLine={false} width={PRIMARY_AXIS_WIDTH} scale={render.y_axis?.type === 'log' ? 'log' : 'auto'} domain={['auto', 'auto']} />
                <ChartTooltip content={<ChartTooltipContent />} />
                {legendOf(render.legend_position)}
                {data.series.map((series, index) => (
                  <Scatter
                    key={index}
                    name={`s${index}`}
                    data={series.points.map((point) => ({ x: axis === 'time' && typeof point.x === 'string' ? Date.parse(point.x) : point.x, y: point.y }))}
                    fill={`var(--color-s${index})`}
                    isAnimationActive={false}
                    onClick={onPick ? (_entry: unknown, pointIndex: number) => onPick(offsets[index] + pointIndex) : undefined}
                  />
                ))}
              </ScatterChart>
            </ChartContainer>
          )}
        />
        <ValuesText caption={label} columns={table.columns} rows={table.rows.map((row) => row.map((value, index) => (index === 1 ? xText(value) : format(value))))} />
      </div>
    );
  }

  const rows = rowsOf(data, axis);
  const table: ValuesTable = { columns: [xLabel, ...data.series.map((series) => series.name ?? '')], rows: rows.map((row) => [row.x ?? null, ...data.series.map((_, index) => row[`s${index}`] ?? null)]) };
  const secondary = data.series.some((series) => optionOf(series.name)?.y_axis === 'secondary');
  const unit = render.y_axis_secondary?.unit ?? '';

  // Value labels: `auto` writes them when each bar is wide enough. Bars of one stack share a slot; Recharts gives the slots 80% of a category.
  const barSlots = new Set(data.series.map((series, index) => (typeOf(series.name) === 'bar' ? (optionOf(series.name)?.stack_group ?? `s${index}`) : null)).filter(Boolean)).size;
  const plotWidth = width - PRIMARY_AXIS_WIDTH - (secondary ? SECONDARY_AXIS_WIDTH : 8);
  const barWidth = barSlots > 0 && rows.length > 0 ? (plotWidth * 0.8) / rows.length / barSlots : 0;
  const labels = render.value_labels ?? 'never';
  const showValues = barSlots > 0 && (labels === 'always' || (labels === 'auto' && barWidth >= MIN_LABELLED_BAR));

  // Tick labels: `every` labels each category and thins out to every 2nd, 3rd... when a category is narrower than a label needs.
  const every = render.x_axis?.tick_labels === 'every';
  const angle = render.x_axis?.tick_angle ?? 0;
  const longest = Math.max(0, ...rows.map((row) => xText(row.x ?? null).length));
  const slot = rows.length > 0 ? plotWidth / rows.length : 0;
  const sine = Math.sin((Math.abs(angle) * Math.PI) / 180);
  const needed = angle === 0 ? longest * TICK_CHAR_WIDTH + 8 : TICK_TEXT_HEIGHT / sine;
  const tickStep = slot > 0 ? Math.max(1, Math.ceil(needed / slot)) : 1;
  const axisHeight = angle === 0 ? 30 : Math.ceil(longest * TICK_CHAR_WIDTH * sine) + 16;
  const hasEndLabel = data.series.some((series) => optionOf(series.name)?.label);

  return (
    <div ref={measure} className={styles.fill} role="figure" aria-label={label}>
      <ChartShell
        drillDown={render.drill_down === true}
        table={table}
        label={texts.dataOf(label)}
        texts={texts}
        format={(value) => format(value)}
        locale={locale}
        container={container}
        draw={(onPick) => (
          <ChartContainer config={config} style={FILL}>
            <ComposedChart
              data={rows}
              margin={{ top: showValues || hasEndLabel ? 20 : 8, right: secondary ? 0 : 8, bottom: 0, left: 0 }}
              onClick={
                onPick
                  ? (state) => {
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
                textAnchor={angle === 0 ? 'middle' : 'end'}
                height={axisHeight}
              />
              <YAxis
                yAxisId="primary"
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
                  orientation="right"
                  tickLine={false}
                  axisLine={false}
                  width={SECONDARY_AXIS_WIDTH}
                  scale={render.y_axis_secondary?.type === 'log' ? 'log' : 'auto'}
                  domain={render.y_axis_secondary?.type === 'log' ? ['auto', 'auto'] : undefined}
                  tickFormatter={(value: number) => `${formatValue(value, undefined, locale, 'compact')}${unit}`}
                />
              ) : null}
              <ChartTooltip content={<ChartTooltipContent labelFormatter={(value) => xText(value as string | number)} />} />
              {legendOf(render.legend_position)}
              {data.series.map((series, index) => {
                const key = `s${index}`;
                const option = optionOf(series.name);
                const yAxisId = option?.y_axis === 'secondary' ? 'secondary' : 'primary';
                const dash = option?.line_style === 'dashed' ? '4 4' : undefined;
                const name = option?.label ? <LabelList dataKey={key} content={endLabel(option.label, rows.length - 1, `var(--color-${key})`)} /> : null;
                switch (typeOf(series.name)) {
                  case 'bar':
                    return (
                      <Bar key={key} yAxisId={yAxisId} dataKey={key} stackId={option?.stack_group} fill={`var(--color-${key})`} radius={option?.stack_group ? 0 : [3, 3, 0, 0]} isAnimationActive={false}>
                        {showValues ? <LabelList dataKey={key} position="top" offset={4} className={styles.valueLabel} formatter={(value) => (typeof value === 'number' ? formatValue(value, value_format, locale) : '')} /> : null}
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
      <ValuesText caption={label} columns={table.columns} rows={table.rows.map(([x, ...ys]) => [xText(x), ...ys.map(format)])} />
    </div>
  );
}
