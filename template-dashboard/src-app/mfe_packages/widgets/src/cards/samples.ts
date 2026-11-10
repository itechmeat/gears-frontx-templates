import type { RenderWidgetPayload } from '@gears-frontx/frontx-dashboard-root/contract';

import type { MetricCardData, MetricCardRender, ProgressListCardData, ProgressListCardRender, RankedListCardData, RankedListCardRender, SummaryCardData, SummaryCardRender } from '../types';

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

/** A `ranked_list_card` sample: the repositories of the delivery space by their commits of the last 30 days, with the reviewers that touched each. */
export const RANKED_LIST_CARD_SAMPLE: CardSample<RankedListCardRender, RankedListCardData> = {
  render: { value_label: 'Commits', secondary_label: 'Reviewers' },
  value_format: { value_type: 'number' },
  data: {
    rows: [
      { label: 'gears-frontx/ui-kit', value: 1_284, secondary: 34 },
      { label: 'gears-frontx/dashboard', value: 986, secondary: 27 },
      { label: 'gears-frontx/mfes', value: 612, secondary: 19 },
      { label: 'gears-frontx/templates', value: 341, secondary: 11 },
    ],
  },
};

/** A `progress_list_card` sample: the deploys of the delivery teams this quarter, against the quarterly target of each. */
export const PROGRESS_LIST_CARD_SAMPLE: CardSample<ProgressListCardRender, ProgressListCardData> = {
  // The type closes an empty render, so the render carries nothing.
  render: {},
  value_format: { value_type: 'number' },
  data: {
    rows: [
      { label: 'Platform', current: 118, target: 120 },
      { label: 'Billing', current: 64, target: 80 },
      { label: 'Growth', current: 41, target: 40 },
      { label: 'Foundations', current: 12, target: 60 },
    ],
  },
};
