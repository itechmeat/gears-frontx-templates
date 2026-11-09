import type { GridHeightClass, GridSizeClass } from '@gears-frontx/ui-kit';

/*
 * The dashboard and widget contract as TypeScript types. The bundle schemas in
 * ./gts are the normative definition; these types mirror them for the code of
 * the dashboard root and the widgets.
 */

// @cpt-dod:cpt-frontx-dashboard-dod-widget-contract-request:p1
/** A request the dashboard root sends to the product's API. */
export interface DashboardRequest {
  method: 'GET' | 'POST';
  /** An absolute same-origin path; the query string is part of it. */
  path: string;
  /** JSON body, only with POST. */
  body?: unknown;
}

/** How a widget formats the numbers it shows. percent 0.25 means 25%. */
export type ValueFormat =
  | { value_type: 'number' | 'percent' }
  | { value_type: 'duration'; unit: 'ms' | 's' | 'min' | 'h' | 'd' };

// @cpt-dod:cpt-frontx-dashboard-dod-widget-contract-base:p1
/** A widget instance as embedded in a cell: the widget base fields. A concrete widget type narrows `render`. */
export interface WidgetInstance {
  /** Combined anonymous id: the widget type chain followed by a lowercase UUID. */
  id: string;
  title?: string;
  render: Record<string, unknown>;
  /** Data widgets only. */
  value_format?: ValueFormat;
  /** Data widgets only: the binding (ADR-0011). */
  data?: unknown;
}

// @cpt-dod:cpt-frontx-dashboard-dod-dashboard-model-type:p1
/** One cell of the layout: a size class and a height class of the ui-kit Grid, and the widget it renders. */
export interface DashboardCell {
  size: GridSizeClass;
  /** `low` when absent. */
  height?: GridHeightClass;
  widget: WidgetInstance;
  larger_view?: WidgetInstance;
}

export interface DashboardLayout {
  /** In reading and keyboard order. */
  cells: DashboardCell[];
  /** Lets spans move inside each size class's range to fill rows. `true` when absent. */
  flexible?: boolean;
}

export interface Dashboard {
  id: string;
  title: string;
  description?: string;
  requests?: Record<string, DashboardRequest>;
  layout: DashboardLayout;
}

/** The payload of the `render_widget` action: everything a widget gets. */
export interface RenderWidgetPayload<TRender = Record<string, unknown>, TData = unknown> {
  render: TRender;
  value_format?: ValueFormat;
  data?: TData;
}

export const DASHBOARD_TYPE_ID = 'gts.frontx.dashboard.dashboard.dashboard.v1~';
export const WIDGET_BASE_TYPE_ID = 'gts.frontx.dashboard.widget.widget.v1~';
export const REQUEST_TYPE_ID = 'gts.frontx.dashboard.widget.request.v1~';
