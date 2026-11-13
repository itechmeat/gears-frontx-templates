import type { CSSProperties, Ref } from 'react';
import { Text } from '@gears-frontx/ui-kit';
import type { RenderWidgetPayload } from '@gears-frontx/frontx-dashboard-root/contract';

import { formatValue, nonFiniteProblemOf, percentInRange } from '../format';
import { DEFAULT_WIDGET_TEXTS, ValuesText, WidgetCannotBeShown, WidgetEmpty, type WidgetTexts } from '../states';
import type { FunnelData, FunnelRender } from '../types';
import { isCompact, useElementSize } from './CartesianChart';
import { ChartShell } from './ChartShell';
import type { ValuesTable } from './DataView';
import styles from '../widgets.module.css';

// The one fill of every stage: the first colour of the chart palette, as the radial ring and the first series take it.
const FILL = 'var(--chart-5)';
// The gap between two stages (the list's gap in the CSS module) and the heights that decide where a stage's text line
// goes: over its bar from 22 px (a 16 px line over a bar of at least 4 px, 2 px apart), beside it from 16 px (the line
// in the stage's first BESIDE_SHARE of width, the bar in the rest), and below that nowhere: the stage draws its bar alone.
const STAGE_GAP = 4;
const OVER_STAGE = 22;
const BESIDE_STAGE = 16;
const BESIDE_SHARE = 0.4;
// The estimate of a text's width: about 0.62 of its font size per character (the label, the value and the conversion
// are all 12 px), with 8 px between the parts of the line.
const CHAR_EM = 0.62;
const TEXT_PX = 12;
const PART_GAP = 8;
const HYPHEN = '-';

/** The funnel's own check of its data: the first stage with a negative value, by its position, or null. */
export function checkFunnel(data: FunnelData): string | null {
  const index = data.stages.findIndex((stage) => stage.value !== null && stage.value < 0);
  return index < 0 ? null : `funnel_chart: data.stages[${index}].value is below 0`;
}

/**
 * The conversion of each stage, its value over the previous stage's value: undefined for the first stage, which has
 * none, and null where there is no share to show (either value null, or a previous value of 0).
 */
export function conversionsOf(stages: FunnelData['stages']): Array<number | null | undefined> {
  return stages.map((stage, index) => {
    if (index === 0) return undefined;
    const previous = stages[index - 1].value;
    return stage.value === null || previous === null || previous === 0 ? null : (stage.value || 0) / previous;
  });
}

/**
 * The `funnel_chart` widget: one stage per row, in delivered order, each a bar centred in its row and as wide as its
 * value over the largest value, so a stage larger than the one before is drawn wider. Over the bar, a text line
 * names the stage, its value (by `value_labels`) and its share of the previous stage (by `show_conversion`). A null
 * value draws an empty stage with a hyphen. The text alternative and the data view list every stage with its value
 * and conversion.
 */
export function FunnelChart({
  payload,
  locale = 'en',
  texts = DEFAULT_WIDGET_TEXTS,
  label: labelProp,
  container,
}: {
  payload: RenderWidgetPayload<FunnelRender, FunnelData>;
  locale?: string;
  texts?: WidgetTexts;
  label?: string;
  container?: HTMLElement | ShadowRoot | null;
}) {
  const { render, data, value_format } = payload;
  const label = labelProp ?? texts.chart;
  const [measure, { height }] = useElementSize();
  // The stages share the list's own box, which leaves out the data view button of a chart with drill-down.
  const [measureList, list] = useElementSize();
  if (!data) return <WidgetCannotBeShown texts={texts} problem="funnel_chart: no data" />;
  const nonFinite = nonFiniteProblemOf('funnel_chart', payload);
  if (nonFinite) return <WidgetCannotBeShown texts={texts} problem={nonFinite} />;
  const problem = checkFunnel(data);
  if (problem) return <WidgetCannotBeShown texts={texts} problem={problem} />;
  const { stages } = data;
  const largest = stages.reduce((most, stage) => Math.max(most, stage.value ?? 0), 0);
  if (!(largest > 0)) return <WidgetEmpty texts={texts} />;

  const showConversion = render.show_conversion !== false;
  const valueLabels = render.value_labels ?? 'auto';
  const conversions = conversionsOf(stages);
  const valueOf = (value: number | null) => (value === null ? HYPHEN : formatValue(value || 0, value_format, locale));
  // A share beyond the largest number is no share to show either: formatValue leaves it empty.
  const conversionOf = (share: number | null | undefined) => (share === undefined ? '' : (share !== null && formatValue(share, { value_type: 'percent' }, locale)) || HYPHEN);

  const compact = isCompact(height);
  // Before the first measurement (and in a test document) every stage keeps its text line and everything fits.
  const stageHeight = list.height > 0 ? (list.height - STAGE_GAP * (stages.length - 1)) / stages.length : Infinity;
  const textAt = stageHeight >= OVER_STAGE ? 'over' : stageHeight >= BESIDE_STAGE ? 'beside' : null;
  const room = list.width > 0 ? list.width * (textAt === 'beside' ? BESIDE_SHARE : 1) : Infinity;
  const widthOf = (text: string, px: number) => (text === '' ? 0 : text.length * CHAR_EM * px + PART_GAP);

  const columns = [texts.columns.label, texts.columns.value, ...(showConversion ? [texts.funnel.conversion] : [])];
  const table: ValuesTable = { columns, rows: stages.map((stage, index) => [stage.label, stage.value, ...(showConversion ? [conversions[index] ?? null] : [])]) };
  const format = (value: string | number | null, column: number, row: number) =>
    column === 0 ? String(value ?? '') : column === 1 ? valueOf(typeof value === 'number' ? value : null) : conversionOf(conversions[row]);

  return (
    <div ref={measure} className={styles.fill} role="figure" aria-label={label}>
      <ChartShell
        drillDown={render.drill_down === true}
        table={table}
        label={texts.dataOf(label)}
        texts={texts}
        format={format}
        locale={locale}
        container={container}
        draw={(onPick) => (
          <ol ref={measureList as unknown as Ref<HTMLOListElement>} className={styles.funnel} aria-hidden>
            {stages.map((stage, index) => {
              const value = stage.value === null ? '' : valueOf(stage.value);
              const conversion = showConversion ? conversionOf(conversions[index]) : '';
              // auto: the value shows when the label, the value and the conversion fit the stage's width together, never in a low cell.
              const fits = widthOf(stage.label, TEXT_PX) + widthOf(value, TEXT_PX) + widthOf(conversion, TEXT_PX) - PART_GAP <= room;
              const shownValue = valueLabels === 'always' || (valueLabels === 'auto' && !compact && fits) ? value : '';
              const share = stage.value === null ? null : percentInRange((stage.value || 0) / largest);
              const tooltip = [`${stage.label}: ${valueOf(stage.value)}`, conversion ? `${conversion} ${texts.funnel.ofPrevious}` : ''].filter(Boolean).join(', ');
              return (
                <li key={index} className={[styles.funnelStage, textAt === 'beside' ? styles.funnelBeside : '', onPick ? styles.funnelPick : ''].filter(Boolean).join(' ')} title={tooltip} data-stage={index} onClick={onPick ? () => onPick(index) : undefined}>
                  {textAt ? (
                    <div className={styles.funnelLine}>
                      <Text typography="label" render={<span />} className={styles.funnelLabel}>
                        {stage.label}
                      </Text>
                      {shownValue ? (
                        <Text typography="meta" render={<span />} className={styles.funnelValue} data-part="value">
                          {shownValue}
                        </Text>
                      ) : null}
                      {conversion ? (
                        <Text typography="meta" tone="muted" render={<span />} className={styles.funnelValue} data-part="conversion">
                          {conversion}
                        </Text>
                      ) : null}
                    </div>
                  ) : null}
                  <div className={styles.funnelTrack}>
                    {share === null ? (
                      <Text typography="meta" tone="muted" render={<span />} data-part="empty">
                        {HYPHEN}
                      </Text>
                    ) : (
                      <span className={styles.funnelBar} data-share={share} style={{ inlineSize: `${share}%`, minInlineSize: share > 0 ? 2 : 0, background: FILL } as CSSProperties} />
                    )}
                  </div>
                </li>
              );
            })}
          </ol>
        )}
      />
      <ValuesText caption={label} columns={columns} rows={table.rows.map((row, rowIndex) => row.map((value, column) => format(value, column, rowIndex)))} />
    </div>
  );
}
