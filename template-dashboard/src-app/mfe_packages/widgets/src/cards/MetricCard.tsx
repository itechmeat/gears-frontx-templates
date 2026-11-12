import type { CSSProperties } from 'react';
import { Area, AreaChart } from 'recharts';
import { Badge, ChartContainer, Text, VisuallyHidden, type ChartConfig } from '@gears-frontx/ui-kit';
import { MinusIcon, TrendingDownIcon, TrendingUpIcon } from 'lucide-react';
import type { RenderWidgetPayload, ValueFormat } from '@gears-frontx/frontx-dashboard-root/contract';

import { formatValue } from '../format';
import { SafeLink } from '../links';
import { DEFAULT_WIDGET_TEXTS, WidgetCannotBeShown, WidgetEmpty, type WidgetTexts } from '../states';
import type { MetricCardData, MetricCardRender } from '../types';
import styles from '../widgets.module.css';

const FILL = { '--chart-aspect-ratio': 'auto', blockSize: '100%', inlineSize: '100%' } as CSSProperties;

const SPARK_CONFIG: ChartConfig = { y: { color: 'var(--chart-5)' } };

/** How the headline sits against `previous_value`: the direction, and the relative change when there is one. */
interface Trend {
  direction: 'up' | 'down' | 'flat';
  /** The relative percent `(value - previous_value) / |previous_value|`; null when no change is shown. */
  change: number | null;
}

/** The trend of a value against its previous one: no previous value shows no trend, a 0 one shows the direction alone. */
const trendOf = (value: number, previous: number | null | undefined): Trend | null => {
  if (previous === null || previous === undefined) return null;
  if (previous === 0) return { direction: value > 0 ? 'up' : value < 0 ? 'down' : 'flat', change: null };
  const change = (value - previous) / Math.abs(previous);
  return { direction: change > 0 ? 'up' : change < 0 ? 'down' : 'flat', change };
};

/** The icon of a direction; the name and the change carry the meaning, never the colour alone. */
const ICON: Record<Trend['direction'], typeof TrendingUpIcon> = { up: TrendingUpIcon, down: TrendingDownIcon, flat: MinusIcon };

/** The badge paint of a direction: an improvement is success, a worsening danger; `better` says which direction improves, and `neutral` that none does. */
const variantOf = (direction: Trend['direction'], better: MetricCardRender['better']): 'success' | 'danger' | 'secondary' => {
  if (direction === 'flat' || better === 'neutral') return 'secondary';
  return (direction === 'up') === (better !== 'lower') ? 'success' : 'danger';
};

/** The direction icon with its accessible name (English, gears-frontx-templates#105), beside the change it stands for. */
function TrendBadge({ trend, better, texts, locale }: { trend: Trend; better: MetricCardRender['better']; texts: WidgetTexts; locale: string }) {
  const Icon = ICON[trend.direction];
  const variant = variantOf(trend.direction, better);
  return (
    <Badge variant={variant}>
      <Icon role="img" aria-label={texts.trend[trend.direction]} />
      {trend.change === null ? null : formatValue(trend.change, { value_type: 'percent' }, locale)}
    </Badge>
  );
}

/** A change as a signed percent: a plus before a rise, a minus before a fall, no sign on one that shows as 0%. */
function percentOf(change: number, locale: string): string {
  const shown = formatValue(Math.abs(change), { value_type: 'percent' }, locale);
  if (shown === formatValue(0, { value_type: 'percent' }, locale)) return shown;
  return change > 0 ? `+${shown}` : formatValue(change, { value_type: 'percent' }, locale);
}

/**
 * The comparison with `reference_value`: its name and value, and the difference of the headline from it, absolute
 * and, when the reference is not 0, in percent, painted by the same `better` rule as the trend.
 */
function Reference({ value, reference, render, valueFormat, texts, locale }: {
  value: number;
  reference: number;
  render: MetricCardRender;
  valueFormat: ValueFormat | undefined;
  texts: WidgetTexts;
  locale: string;
}) {
  const name = render.reference_label ?? texts.metric.reference;
  const difference = value - reference;
  // The direction and the sign come from the difference as shown: one that shows as zero (0.3 against 0.1 + 0.2) is flat, unsigned and neutral.
  const shown = formatValue(Math.abs(difference), valueFormat, locale);
  const direction: Trend['direction'] = shown === formatValue(0, valueFormat, locale) ? 'flat' : difference > 0 ? 'up' : 'down';
  const text = direction === 'flat' ? shown : direction === 'up' ? `+${shown}` : formatValue(difference, valueFormat, locale);
  // The percent's sign likewise comes from the percent as shown: one that shows as 0% (1000001 against 1000000) is unsigned.
  const change = reference === 0 ? null : direction === 'flat' ? 0 : difference / Math.abs(reference);
  const percent = change === null ? '' : ` (${percentOf(change, locale)})`;
  return (
    <>
      <Text typography="meta" tone="muted" render={<span />}>
        {name} {formatValue(reference, valueFormat, locale)}
      </Text>
      <Badge variant={variantOf(direction, render.better)}>
        <VisuallyHidden>{texts.metric.difference(name)}: </VisuallyHidden>
        {text}
        {percent}
      </Badge>
    </>
  );
}

/**
 * The `metric_card` widget: one headline value, an optional trend against `previous_value`, and an optional sparkline.
 * The cell's `label` and `container` are accepted like every widget takes them, but a card draws no overlay and its
 * numbers and words are its own text, so it uses neither.
 */
export function MetricCard({
  payload,
  locale = 'en',
  texts = DEFAULT_WIDGET_TEXTS,
}: {
  payload: RenderWidgetPayload<MetricCardRender, MetricCardData>;
  locale?: string;
  texts?: WidgetTexts;
  label?: string;
  container?: HTMLElement | ShadowRoot | null;
}) {
  const { render, data, value_format } = payload;
  if (!data) return <WidgetCannotBeShown texts={texts} problem="metric_card: no data" />;
  if (data.value === null) return <WidgetEmpty texts={texts} />;

  const trend = trendOf(data.value, data.previous_value);
  const reference = typeof data.reference_value === 'number' ? data.reference_value : null;
  // One point per step; a single point draws no line.
  const steps = (data.sparkline ?? []).map((y, index) => ({ step: index, y }));
  return (
    <div className={styles.metric}>
      <div className={styles.metricHead}>
        <Text typography="kpi" render={<strong />}>
          {formatValue(data.value, value_format, locale)}
        </Text>
        {/* The trend, the caption and the reference share one line that wraps, so a low card keeps room for its foot. */}
        {trend || render.value_label || reference !== null ? (
          <div className={styles.metricMeta}>
            {trend ? <TrendBadge trend={trend} better={render.better} texts={texts} locale={locale} /> : null}
            {render.value_label ? (
              <Text typography="meta" tone="muted" render={<span />}>
                {render.value_label}
              </Text>
            ) : null}
            {reference !== null ? <Reference value={data.value} reference={reference} render={render} valueFormat={value_format} texts={texts} locale={locale} /> : null}
          </div>
        ) : null}
      </div>
      {steps.length > 1 ? (
        <ChartContainer config={SPARK_CONFIG} style={FILL} className={styles.spark}>
          <AreaChart data={steps} margin={{ top: 4, right: 0, bottom: 0, left: 0 }}>
            {/* connectNulls off draws a null point as a gap, not a straight line through it. */}
            <Area dataKey="y" type="monotone" stroke="var(--color-y)" fill="var(--color-y)" fillOpacity={0.12} strokeWidth={2} connectNulls={false} isAnimationActive={false} />
          </AreaChart>
        </ChartContainer>
      ) : null}
      {render.link ? (
        <Text typography="meta" render={<p />} className={styles.cardFoot}>
          <SafeLink text={render.link.text} href={render.link.href} texts={texts} />
        </Text>
      ) : null}
    </div>
  );
}
