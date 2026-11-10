import type { RenderWidgetPayload } from '@gears-frontx/frontx-dashboard-root';

import type { MetricCardData, MetricCardRender, SummaryCardData, SummaryCardRender } from '../types';

/** A card payload with its data delivered: what a cell hands the widget. */
export type CardSample<TRender, TData> = RenderWidgetPayload<TRender, TData> & { data: TData };

/** A `metric_card` sample: active users over the last 28 days against the 28 before, with the daily steps. */
export const METRIC_CARD_SAMPLE: CardSample<MetricCardRender, MetricCardData> = {
  render: { value_label: 'vs previous 28 days' },
  data: {
    value: 44_000,
    previous_value: 40_000,
    sparkline: [38_100, 39_400, 40_000, 41_302, 42_800, 43_500, 44_000],
  },
};

/** A `summary_card` sample: the week's product numbers, one line per row in delivered order. */
export const SUMMARY_CARD_SAMPLE: CardSample<SummaryCardRender, SummaryCardData> = {
  // The type closes an empty render, so the render carries nothing.
  render: {},
  value_format: { value_type: 'number' },
  data: {
    rows: [
      { label: 'Sessions', value: 128_940 },
      { label: 'Conversions', value: 4_383 },
      { label: 'P75 latency (ms)', value: 812 },
    ],
  },
};
