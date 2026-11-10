import type { MfeEntryLifecycle } from '@gears-frontx/mfes';
import { ENTRY_MF_TYPE_ID, type RenderWidgetPayload } from '@gears-frontx/frontx-dashboard-root';

import { ProgressListCard } from './cards/ProgressListCard';
import { RankedListCard } from './cards/RankedListCard';
import { CartesianChart } from './chart/CartesianChart';
import { PieChart } from './chart/PieChart';
import { GridWidget } from './grid/GridWidget';
import { MetricCard } from './cards/MetricCard';
import { SummaryCard } from './cards/SummaryCard';
import { createWidgetLifecycle } from './lifecycle';

/** The entry id of a catalog widget type, as the served file's entries and the types' `entry` traits name it. */
export const entryIdOf = (widgetType: string) => `${ENTRY_MF_TYPE_ID}frontx.dashboard.mfe.${widgetType}.v1`;

const as = <T,>(payload: RenderWidgetPayload) => payload as RenderWidgetPayload<never, never> as T;

/**
 * The catalog widget entries bundled with the product: each entry id names a
 * lifecycle factory, called once per generated extension. Pass it to the
 * dashboard root as `entries`.
 */
export const WIDGET_ENTRIES: Readonly<Record<string, () => MfeEntryLifecycle>> = {
  [entryIdOf('cartesian_chart')]: () =>
    createWidgetLifecycle((payload, { locale, container }) => <CartesianChart payload={as(payload)} locale={locale} container={container} />),
  [entryIdOf('pie_chart')]: () => createWidgetLifecycle((payload, { locale, container }) => <PieChart payload={as(payload)} locale={locale} container={container} />),
  [entryIdOf('metric_card')]: () => createWidgetLifecycle((payload, { locale }) => <MetricCard payload={as(payload)} locale={locale} />),
  [entryIdOf('summary_card')]: () => createWidgetLifecycle((payload, { locale }) => <SummaryCard payload={as(payload)} locale={locale} />),
  [entryIdOf('grid')]: () => createWidgetLifecycle((payload, { locale, container }) => <GridWidget payload={as(payload)} locale={locale} container={container} />),
  [entryIdOf('ranked_list_card')]: () =>
    createWidgetLifecycle((payload, { locale, container }) => <RankedListCard payload={as(payload)} locale={locale} container={container} />),
  [entryIdOf('progress_list_card')]: () =>
    createWidgetLifecycle((payload, { locale, container }) => <ProgressListCard payload={as(payload)} locale={locale} container={container} />),
};
