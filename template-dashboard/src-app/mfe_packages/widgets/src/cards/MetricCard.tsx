import type { CSSProperties } from 'react';
import { Area, AreaChart } from 'recharts';
import { Badge, ChartContainer, Text, type ChartConfig } from '@gears-frontx/ui-kit';
import { MinusIcon, TrendingDownIcon, TrendingUpIcon } from 'lucide-react';
import type { RenderWidgetPayload } from '@gears-frontx/frontx-dashboard-root/contract';

import { formatValue } from '../format';
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

/** The icon and the badge paint of a direction; the name and the change carry the meaning, never the colour alone. */
const DIRECTION: Record<Trend['direction'], { icon: typeof TrendingUpIcon; variant: 'success' | 'danger' | 'secondary' }> = {
  up: { icon: TrendingUpIcon, variant: 'success' },
  down: { icon: TrendingDownIcon, variant: 'danger' },
  flat: { icon: MinusIcon, variant: 'secondary' },
};

/** The direction icon with its localized accessible name, beside the change it stands for. */
function TrendBadge({ trend, texts, locale }: { trend: Trend; texts: WidgetTexts; locale: string }) {
  const { icon: Icon, variant } = DIRECTION[trend.direction];
  return (
    <Badge variant={variant}>
      <Icon role="img" aria-label={texts.trend[trend.direction]} />
      {trend.change === null ? null : formatValue(trend.change, { value_type: 'percent' }, locale)}
    </Badge>
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
  // One point per step; a single point draws no line.
  const steps = (data.sparkline ?? []).map((y, index) => ({ step: index, y }));
  return (
    <div className={styles.metric}>
      <div className={styles.metricHead}>
        <Text typography="kpi" render={<strong />}>
          {formatValue(data.value, value_format, locale)}
        </Text>
        {trend || render.value_label ? (
          <div className={styles.metricMeta}>
            {trend ? <TrendBadge trend={trend} texts={texts} locale={locale} /> : null}
            {render.value_label ? (
              <Text typography="meta" tone="muted" render={<span />}>
                {render.value_label}
              </Text>
            ) : null}
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
    </div>
  );
}
