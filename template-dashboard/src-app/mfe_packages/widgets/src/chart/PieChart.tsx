import type { CSSProperties } from 'react';
import { Pie, PieChart as RechartsPieChart } from 'recharts';
import { ChartContainer, ChartTooltip, ChartTooltipContent, type ChartConfig } from '@gears-frontx/ui-kit';
import type { RenderWidgetPayload } from '@gears-frontx/frontx-dashboard-root/contract';

import { formatValue, textOf } from '../format';
import { DEFAULT_WIDGET_TEXTS, ValuesText, WidgetCannotBeShown, WidgetEmpty, type WidgetTexts } from '../states';
import type { PieData, PieRender } from '../types';
import { PALETTE, isCompact, legendOf, useElementSize } from './CartesianChart';
import { ChartShell } from './ChartShell';
import type { ValuesTable } from './DataView';
import styles from '../widgets.module.css';

const FILL = { '--chart-aspect-ratio': 'auto', blockSize: '100%', inlineSize: '100%' } as CSSProperties;

/** The narrowest compact pie that keeps its legend beside it. */
const PIE_SIDE_LEGEND_WIDTH = 240;

/** A radius as Recharts takes it: a percentage stays a string, a pixel value becomes a number. */
const radiusOf = (value: string | undefined) => (value === undefined ? undefined : value.endsWith('px') ? Number.parseFloat(value) : value);

/** The `pie_chart` widget: the kit chart with one Recharts pie; two radius items make a donut. */
export function PieChart({
  payload,
  locale = 'en',
  texts = DEFAULT_WIDGET_TEXTS,
  label: labelProp,
  container,
}: {
  payload: RenderWidgetPayload<PieRender, PieData>;
  locale?: string;
  texts?: WidgetTexts;
  label?: string;
  container?: HTMLElement | ShadowRoot | null;
}) {
  const { render, data, value_format } = payload;
  const label = labelProp ?? texts.chart;
  const [measure, { width, height }] = useElementSize();
  if (!data) return <WidgetCannotBeShown texts={texts} problem="pie_chart: no data" />;
  if (data.slices.length === 0) return <WidgetEmpty texts={texts} />;

  const format = (value: string | number | null) => (typeof value === 'number' ? formatValue(value, value_format, locale) : (value ?? ''));
  // Every slice is in the legend with its label and value; a null or zero slice has no size but keeps its entry.
  const config: ChartConfig = Object.fromEntries(
    data.slices.map((slice, index) => [`p${index}`, { label: `${textOf(slice.label, undefined, locale)} ${format(slice.value)}`.trim(), color: PALETTE[index % PALETTE.length] }]),
  );
  // Each slice carries its own fill, the series colour the kit chart writes for its key.
  const rows = data.slices.map((slice, index) => ({ key: `p${index}`, value: slice.value ?? 0, fill: `var(--color-p${index})` }));
  const table: ValuesTable = { columns: [texts.columns.label, texts.columns.value], rows: data.slices.map((slice) => [slice.label, slice.value]) };
  const [first, second] = render.radius ?? [];
  const inner = second === undefined ? 0 : radiusOf(first);
  const outer = radiusOf(second ?? first) ?? '80%';
  // A legend above or below a pie in a low cell leaves the pie a dot: there it moves beside the pie, and where
  // the cell is narrow too it is left out (the tooltip and the text alternative still name every slice).
  const asked = render.legend_position ?? 'bottom';
  const narrow = width > 0 && width < PIE_SIDE_LEGEND_WIDTH;
  const legend = !isCompact(height) || asked === 'none' ? asked : narrow ? 'none' : asked === 'top' || asked === 'bottom' ? 'right' : asked;

  return (
    <div ref={measure} className={styles.fill} role="figure" aria-label={label}>
      <ChartShell
        drillDown={render.drill_down === true}
        table={table}
        label={texts.dataOf(label)}
        texts={texts}
        format={(value, column) => (column === 0 ? textOf(value, undefined, locale) : format(value))}
        locale={locale}
        container={container}
        draw={(onPick) => (
          <ChartContainer config={config} style={FILL}>
            <RechartsPieChart>
              {/* The config label already carries the slice's formatted value, so the tooltip shows the label alone. */}
              <ChartTooltip content={<ChartTooltipContent nameKey="key" hideLabel formatter={(_value, key) => <span>{String(config[String(key)]?.label ?? '')}</span>} />} />
              <Pie data={rows} dataKey="value" nameKey="key" innerRadius={inner} outerRadius={outer} isAnimationActive={false} onClick={onPick ? (_entry: unknown, index: number) => onPick(index) : undefined} />
              {legendOf(legend, 'key')}
            </RechartsPieChart>
          </ChartContainer>
        )}
      />
      <ValuesText caption={label} columns={table.columns} rows={table.rows.map(([name, value]) => [textOf(name, undefined, locale), format(value)])} />
    </div>
  );
}
