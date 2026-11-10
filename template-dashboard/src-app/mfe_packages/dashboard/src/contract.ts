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
export const DATA_WIDGET_TYPE_ID = 'gts.frontx.dashboard.widget.widget.v1~frontx.dashboard.widget.data_widget.v1~';
export const WIDGET_DATA_BASE_ID = 'gts.frontx.dashboard.widget_data.widget_data.v1~';
export const RENDER_WIDGET_ACTION_ID = 'gts.frontx.mfes.comm.action.v1~frontx.dashboard.mfe.render_widget.v1~';
export const WIDGET_EXT_TYPE_ID = 'gts.frontx.mfes.ext.extension.v1~frontx.dashboard.mfe.widget_ext.v1~';
export const WIDGETS_DOMAIN_ID = 'gts.frontx.mfes.ext.domain.v1~frontx.dashboard.mfe.widgets.v1';
export const ENTRY_MF_TYPE_ID = 'gts.frontx.mfes.mfe.entry.v1~frontx.mfes.mfe.entry_mf.v1~';
/** The FrontX theme and language shared properties the `widgets` domain shares; every widget entry requires both. */
export const THEME_PROPERTY_ID = 'gts.frontx.mfes.comm.shared_property.v1~frontx.mfes.comm.theme.v1~';
export const LANGUAGE_PROPERTY_ID = 'gts.frontx.mfes.comm.shared_property.v1~frontx.mfes.comm.language.v1~';

/** The served GTS file: the types and the instances (manifests, entries, dashboards) the root registers at runtime. */
export interface ServedFile {
  types: Record<string, unknown>[];
  instances: Record<string, unknown>[];
}
