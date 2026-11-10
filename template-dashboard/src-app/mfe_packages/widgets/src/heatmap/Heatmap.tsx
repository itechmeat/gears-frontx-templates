import { Fragment, type CSSProperties } from 'react';
import { Text } from '@gears-frontx/ui-kit';
import type { RenderWidgetPayload } from '@gears-frontx/frontx-dashboard-root';

import { formatValue, textOf } from '../format';
import { DEFAULT_WIDGET_TEXTS, ValuesText, WidgetCannotBeShown, WidgetEmpty, type WidgetTexts } from '../states';
import type { HeatmapData, HeatmapRender } from '../types';
import styles from '../widgets.module.css';

/** From this much of the scale up, a tile's fill is dark enough for its value to read in the foreground over it. */
const STRONG_FROM = 60;

/** A cell's key: kind and text of a value, so 1 and "1" stay different cells. */
const keyOf = (value: string | number | null) => `${typeof value}:${String(value)}`;

// @cpt-algo:cpt-frontx-dashboard-algo-widget-catalog-heatmap-checks:p2
/** The heatmap's own scale check: the problem, or null. The text names the scale ends, never data content. */
export function checkHeatmap(render: HeatmapRender): string | null {
  const { min_value, max_value } = render;
  // @cpt-begin:cpt-frontx-dashboard-algo-widget-catalog-heatmap-checks:p2:inst-wc-heat-min-max
  if (min_value !== null && min_value !== undefined && max_value !== null && max_value !== undefined && min_value > max_value)
    return `heatmap: min_value ${min_value} is greater than max_value ${max_value}`;
  // @cpt-end:cpt-frontx-dashboard-algo-widget-catalog-heatmap-checks:p2:inst-wc-heat-min-max
  return null;
}

/**
 * The `heatmap` widget: a CSS grid of tiles, with no chart library, whose fill mixes a kit chart
 * colour token over the card surface by the value's place on the scale. Colour is never the only
 * signal: every tile names its x, y and value, and the delivered values stand in a visually hidden
 * table. The cell's `container` is accepted like every widget takes it, but the tiles carry their own
 * names and no overlay opens here, so it is unused.
 */
export function Heatmap({
  payload,
  locale = 'en',
  texts = DEFAULT_WIDGET_TEXTS,
  label: labelProp,
}: {
  payload: RenderWidgetPayload<HeatmapRender, HeatmapData>;
  locale?: string;
  texts?: WidgetTexts;
  label?: string;
  container?: HTMLElement | ShadowRoot | null;
}) {
  const { render, data, value_format } = payload;
  const label = labelProp ?? texts.chart;
  if (!data) return <WidgetCannotBeShown texts={texts} problem="heatmap: no data" />;
  const problem = checkHeatmap(render);
  if (problem) return <WidgetCannotBeShown texts={texts} problem={problem} />;
  // The empty condition of the data type: no rows.
  if (data.rows.length === 0) return <WidgetEmpty texts={texts} />;

  // The categories keep the order of their first appearance in the delivered rows. A combination the
  // rows did not deliver, and a null value, leaves its tile empty.
  const rows = data.rows;
  const xs = [...new Set(rows.map((row) => row.x))];
  const ys = [...new Set(rows.map((row) => row.y))];
  const valueAt = new Map(rows.map((row) => [`${keyOf(row.x)}|${keyOf(row.y)}`, row.value] as const));

  // The scale ends: those the render sets, or the lowest and highest delivered value.
  const delivered = rows.flatMap((row) => (row.value === null ? [] : [row.value]));
  const scaleMin = render.min_value ?? delivered.reduce((least, value) => Math.min(least, value), Number.POSITIVE_INFINITY);
  const scaleMax = render.max_value ?? delivered.reduce((most, value) => Math.max(most, value), Number.NEGATIVE_INFINITY);
  const span = scaleMax - scaleMin;
  // The value's place on the scale, as the percent of the kit colour the tile mixes over the card surface.
  const mixOf = (value: number) => (span > 0 ? Math.min(100, Math.max(0, Math.round(((value - scaleMin) / span) * 100))) : 100);

  const place = (x: string | number | null, y: string | number | null) => [textOf(x, undefined, locale), textOf(y, undefined, locale)].filter(Boolean).join(', ');
  const cellName = (x: string | number | null, y: string | number | null, value: number | null) => {
    const where = place(x, y);
    return value === null ? where : `${where}: ${formatValue(value, value_format, locale)}`;
  };

  return (
    <div className={styles.heat} role="figure" aria-label={label}>
      <div
        className={render.show_cell_values === true ? `${styles.heatGrid} ${styles.heatValues}` : styles.heatGrid}
        style={{ gridTemplateColumns: `auto repeat(${xs.length}, minmax(0, 1fr))` }}
      >
        {/* The y-axis title stands over the row labels; the row of x categories, and the x-axis title under it, leave their first cell empty. */}
        {render.y_axis_label !== undefined ? (
          <>
            <Text typography="meta" tone="muted" render={<span />} className={styles.heatTitle}>
              {render.y_axis_label}
            </Text>
            {xs.map((_x, index) => (
              <span key={index} aria-hidden="true" />
            ))}
          </>
        ) : null}
        {ys.map((y) => (
          <Fragment key={keyOf(y)}>
            <Text typography="micro" tone="muted" render={<span />} className={styles.heatRowAxis} title={textOf(y, undefined, locale)}>
              {textOf(y, undefined, locale)}
            </Text>
            {xs.map((x) => {
              const value = valueAt.get(`${keyOf(x)}|${keyOf(y)}`) ?? null;
              const mix = value === null ? null : mixOf(value);
              const name = cellName(x, y, value);
              return (
                <span
                  key={keyOf(x)}
                  role="img"
                  title={name}
                  aria-label={name}
                  className={value === null ? `${styles.heatCell} ${styles.heatEmpty}` : styles.heatCell}
                  data-strong={mix !== null && mix >= STRONG_FROM ? 'true' : undefined}
                  style={mix === null ? undefined : ({ '--heat-mix': `${mix}%` } as CSSProperties)}
                >
                  {render.show_cell_values === true && value !== null ? formatValue(value, value_format, locale) : null}
                </span>
              );
            })}
          </Fragment>
        ))}
        <span aria-hidden="true" />
        {xs.map((x) => (
          <Text key={keyOf(x)} typography="micro" tone="muted" render={<span />} className={styles.heatColumnAxis} title={textOf(x, undefined, locale)}>
            {textOf(x, undefined, locale)}
          </Text>
        ))}
        {render.x_axis_label !== undefined ? (
          <>
            <span aria-hidden="true" />
            <Text
              typography="meta"
              tone="muted"
              render={<span />}
              className={`${styles.heatTitle} ${styles.heatTitleX}`}
              style={{ gridColumn: `2 / span ${xs.length}` }}
            >
              {render.x_axis_label}
            </Text>
          </>
        ) : null}
      </div>
      {/* The colour scale, with its ends as numbers. */}
      {Number.isFinite(scaleMin) && Number.isFinite(scaleMax) && span >= 0 ? (
        <div className={styles.heatLegend}>
          <Text typography="micro" tone="muted" render={<span />}>
            {formatValue(scaleMin, value_format, locale)}
          </Text>
          <span className={styles.heatScale} aria-hidden="true" />
          <Text typography="micro" tone="muted" render={<span />}>
            {formatValue(scaleMax, value_format, locale)}
          </Text>
        </div>
      ) : null}
      {/* A text alternative of the delivered x, y and values, in delivered order. */}
      <ValuesText
        caption={label}
        columns={[render.x_axis_label ?? texts.columns.x, render.y_axis_label ?? texts.columns.y, texts.columns.value]}
        rows={rows.map((row) => [textOf(row.x, undefined, locale), textOf(row.y, undefined, locale), formatValue(row.value, value_format, locale)])}
      />
    </div>
  );
}
