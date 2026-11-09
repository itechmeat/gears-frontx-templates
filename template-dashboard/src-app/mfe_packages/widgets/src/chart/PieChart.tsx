import type { CSSProperties } from 'react';
import { Pie, PieChart as RechartsPieChart } from 'recharts';
import { ChartContainer, ChartTooltip, ChartTooltipContent, type ChartConfig } from '@gears-frontx/ui-kit';
import type { RenderWidgetPayload } from '@gears-frontx/frontx-dashboard-root';

import { formatValue, textOf } from '../format';
import { DEFAULT_WIDGET_TEXTS, ValuesText, WidgetCannotBeShown, WidgetEmpty, type WidgetTexts } from '../states';
import type { PieData, PieRender } from '../types';
import { PALETTE, legendOf } from './CartesianChart';
import { ChartShell } from './ChartShell';
import type { ValuesTable } from './DataView';
import styles from '../widgets.module.css';

const FILL = { '--chart-aspect-ratio': 'auto', blockSize: '100%', inlineSize: '100%' } as CSSProperties;

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

  return (
    <div className={styles.fill} role="figure" aria-label={label}>
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
              {legendOf(render.legend_position, 'key')}
            </RechartsPieChart>
          </ChartContainer>
        )}
      />
      <ValuesText caption={label} columns={table.columns} rows={table.rows.map(([name, value]) => [textOf(name, undefined, locale), format(value)])} />
    </div>
  );
}
