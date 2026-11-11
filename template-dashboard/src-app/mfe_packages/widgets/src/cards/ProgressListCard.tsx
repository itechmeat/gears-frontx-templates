import { Progress, Text } from '@gears-frontx/ui-kit';
import type { RenderWidgetPayload } from '@gears-frontx/frontx-dashboard-root/contract';

import { formatValue } from '../format';
import { DEFAULT_WIDGET_TEXTS, WidgetCannotBeShown, WidgetEmpty, type WidgetTexts } from '../states';
import type { ProgressListCardData, ProgressListCardRender } from '../types';
import styles from '../widgets.module.css';

/**
 * The share of its track a bar fills, 0 to 100: in proportion to `current` over `target`, full when
 * `current` reaches or exceeds `target`, and empty for a null `current` or a null or zero `target`.
 */
const shareOf = (current: number | null, target: number | null): number => {
  if (current === null || target === null || target <= 0) return 0;
  const share = (current / target) * 100;
  return Math.max(0, Math.min(100, Math.round(share * 100) / 100));
};

/**
 * The `progress_list_card` widget: one bar per data row, in delivered order, filling by `current` over
 * `target`, with the current and target values as text so the bar does not carry meaning alone. The cell's
 * `label` and `container` are accepted like every widget takes them, but a card draws no overlay and its
 * rows are its own text, so it uses neither.
 */
export function ProgressListCard({
  payload,
  locale = 'en',
  texts = DEFAULT_WIDGET_TEXTS,
}: {
  payload: RenderWidgetPayload<ProgressListCardRender, ProgressListCardData>;
  locale?: string;
  texts?: WidgetTexts;
  label?: string;
  container?: HTMLElement | ShadowRoot | null;
}) {
  const { data, value_format } = payload;
  if (!data) return <WidgetCannotBeShown texts={texts} problem="progress_list_card: no data" />;
  if (data.rows.length === 0) return <WidgetEmpty texts={texts} />;

  return (
    <ul className={styles.progressList}>
      {/* The rows keep their delivered place: a null label is an empty one, and the row stays. */}
      {data.rows.map((row, index) => {
        // One missing side shows as a plain hyphen, so the row keeps saying which side it lacks; with both sides missing it shows no values.
        const current = formatValue(row.current, value_format, locale);
        const target = formatValue(row.target, value_format, locale);
        const valueText = current === '' && target === '' ? '' : `${current || '-'} ${texts.progress.of} ${target || '-'}`;
        return (
          <li key={index} className={styles.progressRow}>
            <div className={styles.progressHead}>
              <Text typography="label" render={<span />}>
                {row.label ?? ''}
              </Text>
              <Text typography="meta" tone="muted" render={<span />}>
                {valueText}
              </Text>
            </div>
            {/* Named by its label, with its current and target values as its value text. */}
            <Progress value={shareOf(row.current, row.target)} aria-label={row.label === null ? undefined : String(row.label)} getAriaValueText={() => valueText} />
          </li>
        );
      })}
    </ul>
  );
}
