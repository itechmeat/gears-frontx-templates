import type { CSSProperties, ReactNode } from 'react';
import { Area, AreaChart } from 'recharts';
import { Badge, ChartContainer, Text, VisuallyHidden, type ChartConfig } from '@gears-frontx/ui-kit';
import { MinusIcon, TrendingDownIcon, TrendingUpIcon } from 'lucide-react';
import type { RenderWidgetPayload, ValueFormat } from '@gears-frontx/frontx-dashboard-root/contract';

import { formatPoints, formatValue, nonFiniteProblemOf, relativeChangeOf } from '../format';
import { isLaidOut, useElementSize } from '../chart/size';
import { SafeLink } from '../links';
import { DEFAULT_WIDGET_TEXTS, emptyTextOf, WidgetCannotBeShown, WidgetEmpty, type WidgetTexts } from '../states';
import type { MetricCardData, MetricCardRender } from '../types';
import styles from '../widgets.module.css';

const FILL = { '--chart-aspect-ratio': 'auto', blockSize: '100%', inlineSize: '100%' } as CSSProperties;

const SPARK_CONFIG: ChartConfig = { y: { color: 'var(--chart-5)' } };

/** How the headline sits against `previous_value`: the direction, and the relative change when there is one. */
interface Trend {
  direction: 'up' | 'down' | 'flat';
  /** The relative percent `(value - previous_value) / |previous_value|`; null when no change is shown, or when it is beyond the largest number. */
  change: number | null;
}

/**
 * The way `value` moved from `base`: flat when the change shows as zero (`zero`) or the two are equal, otherwise up or
 * down, read by comparing, as their difference can overflow.
 */
const directionOf = (value: number, base: number, zero = false): Trend['direction'] => {
  if (zero) return 'flat';
  if (value > base) return 'up';
  if (value < base) return 'down';
  return 'flat';
};

/** The trend of a value against its previous one: no previous value shows no trend, a 0 one shows the direction alone. */
const trendOf = (value: number, previous: number | null | undefined): Trend | null => {
  if (previous === null || previous === undefined) return null;
  if (previous === 0) return { direction: directionOf(value, 0), change: null };
  // An overflowing change keeps its sign (1 against 1e-320 rises), so the direction shows and the percent is left out.
  const change = relativeChangeOf(value, previous);
  return { direction: directionOf(change, 0), change: Number.isFinite(change) ? change : null };
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

/** A change as written, signed, and whether it shows as zero. */
interface Signed {
  text: string;
  zero: boolean;
}

/**
 * A change as `format` writes it, signed: the absolute change is formatted and compared with the formatted zero; one
 * that shows as zero carries no sign, a rise takes a plus, and a fall is formatted as the negative it is. Null when
 * `format` writes nothing (a change that is not finite).
 */
function signedOf(change: number, format: (n: number) => string): Signed | null {
  const shown = format(Math.abs(change));
  if (shown === '') return null;
  if (shown === format(0)) return { text: shown, zero: true };
  return { text: change > 0 ? `+${shown}` : format(change), zero: false };
}

/** A relative change as a signed percent: a plus before a rise, a minus before a fall, no sign on one that shows as 0%. */
const percentOf = (change: number, locale: string): Signed | null => signedOf(change, (n) => formatValue(n, { value_type: 'percent' }, locale));

/** What a comparison with `reference_value` draws from: the headline value, the reference and the card's render. */
interface ComparisonProps {
  value: number;
  reference: number;
  render: MetricCardRender;
  valueFormat: ValueFormat | undefined;
  texts: WidgetTexts;
  locale: string;
}

/** The reference's name and value. */
function ReferenceName({ name, reference, valueFormat, locale }: { name: string; reference: number; valueFormat: ValueFormat | undefined; locale: string }) {
  return (
    <Text typography="meta" tone="muted" render={<span />}>
      {name} {formatValue(reference, valueFormat, locale)}
    </Text>
  );
}

/**
 * The comparison with `reference_value`: its name and value, and the difference of the headline from it, absolute
 * and, when the reference is not 0, in percent, painted by the same `better` rule as the trend. A part beyond the
 * largest number is left out (1.5e308 against -1.5e308 shows the percent alone), and with neither part no badge shows.
 */
function Reference({ value, reference, render, valueFormat, texts, locale }: ComparisonProps) {
  const name = render.reference_label ?? texts.metric.reference;
  // Each part follows its own shown value: a sign only when it does not show as zero (1.4 against 1 with no decimals is `0 (+40%)`).
  const absolute = signedOf(value - reference, (n) => formatValue(n, valueFormat, locale));
  const percent = reference === 0 ? null : percentOf(relativeChangeOf(value, reference), locale);
  if (absolute === null && percent === null) return <ReferenceName name={name} reference={reference} valueFormat={valueFormat} locale={locale} />;
  // Flat only when every shown part is zero (0.3 against 0.1 + 0.2); otherwise the direction of the raw difference.
  const direction = directionOf(value, reference, (absolute === null || absolute.zero) && (percent === null || percent.zero));
  let percentText = '';
  if (percent) percentText = absolute ? ` (${percent.text})` : percent.text;
  return (
    <>
      <ReferenceName name={name} reference={reference} valueFormat={valueFormat} locale={locale} />
      <Badge variant={variantOf(direction, render.better)}>
        <VisuallyHidden>{texts.metric.difference(name)}: </VisuallyHidden>
        {absolute?.text ?? null}
        {percentText}
      </Badge>
    </>
  );
}

/** The headline of a null value under `null_value` `dash`: a plain hyphen (U+002D). */
const NO_VALUE = '-';

/** A change of a percent value in points, signed: a plus before a rise, no sign on one that shows as zero. */
const pointsOf = (difference: number, valueFormat: ValueFormat | undefined, locale: string): Signed | null =>
  signedOf(difference, (n) => formatPoints(n, valueFormat, locale));

/** The change in the badge as shown; when its spoken form differs, the shown text is hidden and the spoken one read. */
function changeTextOf(shown: string | null, spoken: string | null): ReactNode {
  if (shown === null) return null;
  if (shown === spoken) return shown;
  return (
    <>
      <span aria-hidden="true">{shown}</span>
      <VisuallyHidden>{spoken}</VisuallyHidden>
    </>
  );
}

/**
 * The comparison with `reference_value` under `reference_display` `change`: a badge with the direction icon and the
 * change alone, then `reference_label` as plain text; the reference's own value is not shown. A percent value changes
 * in percentage points, rounded as the headline; any other value by its relative percent, written as the trend writes
 * it with a plus before a rise, and against a 0 reference by the direction icon alone. A change that shows as zero is
 * flat, unsigned and neutral.
 * A screen reader reads the icon's name, the change and the label in that order; points are read in their spoken form.
 */
function ReferenceChange({ value, reference, render, valueFormat, texts, locale }: ComparisonProps) {
  let shown: string | null = null;
  let spoken: string | null = null;
  let zero = false;
  if (valueFormat?.value_type === 'percent') {
    const points = pointsOf(value - reference, valueFormat, locale);
    if (points) {
      const visible = texts.metric.points ?? DEFAULT_WIDGET_TEXTS.metric.points;
      // Without its own spoken form, a host that words the points has them read as shown, never in English.
      const said = texts.metric.pointsSpoken ?? texts.metric.points ?? DEFAULT_WIDGET_TEXTS.metric.pointsSpoken;
      [shown, spoken, zero] = [visible(points.text), said(points.text), points.zero];
    }
  } else if (reference !== 0) {
    const percent = percentOf(relativeChangeOf(value, reference), locale);
    if (percent) [shown, spoken, zero] = [percent.text, percent.text, percent.zero];
  }
  const direction = directionOf(value, reference, zero);
  const Icon = ICON[direction];
  return (
    <>
      <Badge variant={variantOf(direction, render.better)}>
        <Icon role="img" aria-label={texts.trend[direction]} />
        {changeTextOf(shown, spoken)}
      </Badge>
      {/* The render type requires the label with this form; a render that skipped the type draws none. */}
      {render.reference_label ? (
        <Text typography="meta" tone="muted" render={<span />}>
          {render.reference_label}
        </Text>
      ) : null}
    </>
  );
}

/** The comparison with `reference_value` in the form `reference_display` names: the change alone, or the values. */
function Comparison(props: ComparisonProps) {
  return props.render.reference_display === 'change' ? <ReferenceChange {...props} /> : <Reference {...props} />;
}

/**
 * The `metric_card` widget: one headline value, an optional trend against `previous_value`, and an optional sparkline.
 * A null value is the empty state, or with `null_value` `dash` a hyphen headline, hidden from assistive technology and
 * named there by the empty text, with the caption, the sparkline and the link, and no trend or comparison.
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
  // The sparkline is drawn only while the card is laid out (`isLaidOut`).
  const [measure, box] = useElementSize();
  if (!data) return <WidgetCannotBeShown texts={texts} problem="metric_card: no data" />;
  const nonFinite = nonFiniteProblemOf('metric_card', payload);
  if (nonFinite) return <WidgetCannotBeShown texts={texts} problem={nonFinite} />;
  const value = data.value;
  if (value === null && render.null_value !== 'dash') return <WidgetEmpty texts={texts} text={payload.empty_text} />;

  // The headline shows the unit word as its own piece, so the number is formatted without it.
  const unit = value_format?.value_type === 'number' && value !== null ? value_format.unit_label : undefined;
  const numberFormat = value_format?.value_type === 'number' ? { ...value_format, unit_label: undefined } : value_format;
  // A missing value has nothing to compare: no trend and no comparison.
  const trend = value === null ? null : trendOf(value, data.previous_value);
  const reference = value !== null && typeof data.reference_value === 'number' ? data.reference_value : null;
  // One point per step; a single point draws no line.
  const steps = (data.sparkline ?? []).map((y, index) => ({ step: index, y }));
  return (
    <div ref={measure} className={styles.metric}>
      <div className={styles.metricHead}>
        {/* The unit word is its own piece after an ordinary space: in a narrow card it wraps under the number, which stays whole. */}
        <Text typography="kpi" render={<strong />}>
          {value === null ? (
            <>
              <span aria-hidden="true">{NO_VALUE}</span>
              <VisuallyHidden>{emptyTextOf(payload.empty_text, texts)}</VisuallyHidden>
            </>
          ) : (
            formatValue(value, numberFormat, locale)
          )}
          {unit ? (
            <>
              {' '}
              <span className={styles.metricUnit}>{unit}</span>
            </>
          ) : null}
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
            {value !== null && reference !== null ? <Comparison value={value} reference={reference} render={render} valueFormat={value_format} texts={texts} locale={locale} /> : null}
          </div>
        ) : null}
      </div>
      {steps.length > 1 && isLaidOut(box) ? (
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
