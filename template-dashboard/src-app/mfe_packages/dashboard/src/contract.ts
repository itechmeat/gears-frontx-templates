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
  /** Query key (GET) or top-level body field (POST) to the name of the variable whose host value goes there. */
  variables?: Record<string, string>;
}

type DurationUnit = 'ms' | 's' | 'min' | 'h' | 'd';

/**
 * How a widget formats the numbers it shows. percent 0.25 means 25%. `decimals` is the exact number of fraction
 * digits, `max_decimals` the largest, so a whole value shows none; a format sets one of them at most. `unit_label` is
 * a unit word after a number; `currency` is an ISO 4217 code. A `compound` duration shows its two largest whole parts
 * (52 h is 2d 4h), so it takes neither `decimals` nor `max_decimals`.
 */
export type ValueFormat =
  | (({ decimals?: number; max_decimals?: never } | { decimals?: never; max_decimals?: number }) & (
      | { value_type: 'number'; unit_label?: string }
      | { value_type: 'percent' }
      | { value_type: 'duration'; unit: DurationUnit; compound?: false }
      | { value_type: 'currency'; currency: string }
    ))
  | { value_type: 'duration'; unit: DurationUnit; compound: true; decimals?: never; max_decimals?: never };

// @cpt-dod:cpt-frontx-dashboard-dod-widget-contract-base:p1
/** A widget instance as embedded in a cell: the widget base fields. A concrete widget type closes `render`, through its own render type or inline. */
export interface WidgetInstance {
  /** Combined anonymous id: the widget type chain followed by a lowercase UUID. */
  id: string;
  title?: string;
  /** A short text the frame shows under the title or in a badge, as the layout's `description_display` says; without it the header shows the title alone. */
  description?: string;
  render: Record<string, unknown>;
  /** Data widgets only. */
  value_format?: ValueFormat;
  /** Data widgets only: the text of the widget's empty state, in place of its own; 1 to 160 characters, shown as given. */
  empty_text?: string;
  /** Data widgets only: the binding (ADR-0011). */
  data?: unknown;
}

// @cpt-dod:cpt-frontx-dashboard-dod-dashboard-model-type:p1
/** One cell of the layout: a size class and a height class of the ui-kit Grid, and the widget it renders. */
export interface DashboardCell {
  size: GridSizeClass;
  /** `low` when absent. */
  height?: GridHeightClass;
  /** `true` when absent; `false` draws the widget with no card, header or larger-view button. */
  frame?: boolean;
  widget: WidgetInstance;
  larger_view?: WidgetInstance;
}

/** How the frame draws a widget's description: a line under the title, or a badge beside the cell's actions. */
export type DescriptionDisplay = 'line' | 'badge';

/**
 * The kit Card size of every framed cell: `sm` draws the title at the body text size with the small card's spacing,
 * `default` at the kit's card title size (heading 2) with the default spacing.
 */
export type CardSize = 'sm' | 'default';

export interface DashboardLayout {
  /** In reading and keyboard order. */
  cells: DashboardCell[];
  /** Lets spans move inside each size class's range to fill rows. `true` when absent. */
  flexible?: boolean;
  /** How the frame draws a widget's description: a line under the title, or a badge beside the cell's actions. `line` when absent. */
  description_display?: DescriptionDisplay;
  /** The kit Card size of every framed cell: `sm` titles at body size, `default` at the card title size. `sm` when absent. */
  card_size?: CardSize;
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
  /** The widget instance's title: the widget's accessible name, in place of its own English default. */
  title?: string;
  value_format?: ValueFormat;
  /** Data widgets only: the widget instance's `empty_text`, shown in the empty state; one with nothing visible shows the widget's own. */
  empty_text?: string;
  data?: TData;
}

/**
 * The step a cell or larger view failed at. `definition`: the served file is wrong for the widget (its own
 * registration, its traits, data type or render type, or its render). `mount`: the generated extension is rejected,
 * or the widget does not mount within its timeout (a bundle that does not load included). `request`: a data request
 * left the root and failed (the host rejected it, or it timed out); only this kind offers a retry. `request_refused`:
 * the root refused to build or send the request (a variable missing or of another kind, a key already set, a method
 * other than GET or POST, a path that is not same-origin, an unknown shared source). `transform`: the transform does
 * not parse or check, or its evaluation fails. `data`: the result is not an object, carries a GTS identity field or
 * fails the data type. `render_widget`: the widget did not take its payload. `unknown`: anything else, a defect of the
 * root.
 */
export type CellFailureKind = 'definition' | 'mount' | 'request' | 'request_refused' | 'transform' | 'data' | 'render_widget' | 'unknown';

/**
 * The step a dashboard load failed at. `start`: the registry rejected the `widgets` domain. `file`: the served file
 * cannot be loaded or registered. `dashboard`: the file has no dashboard of that id, or it fails registration.
 * `unknown`: the load itself failed, a defect of the root.
 */
export type DashboardFailureKind = 'start' | 'file' | 'dashboard' | 'unknown';

/**
 * What `<Dashboard>` hands the host's `onFailure` each time a cell or an open larger view turns cannot-be-shown, and
 * each time a dashboard load fails. Every field but `message` carries no data of an answer: ids and names from the
 * served file, and the kind. `message` is the diagnostic as the console line writes it after `[dashboard] `, escaped,
 * on one line; it may quote the host's own error text, transform error text and the type store's validation text,
 * any of which can carry answer data, so it is for the host's own logs, or to scrub before it goes to a third party.
 * Its wording is not stable.
 */
export type FailureReport =
  | {
      scope: 'cell';
      kind: CellFailureKind;
      dashboardId: string;
      widgetId: string;
      /** The widget id without its UUID: the widget type chain. */
      widgetType: string;
      role: 'cell' | 'larger_view';
      /** The shared request the binding reads, when it has one (a name from the served file). */
      source?: string;
      /** True when the frame offers a retry (kind `request` only). */
      retryable: boolean;
      /** The diagnostic, one line, escaped. May quote host error text and parts of an answer. Wording is not stable. */
      message: string;
    }
  | {
      scope: 'dashboard';
      kind: DashboardFailureKind;
      dashboardId: string;
      /** The diagnostic, one line, escaped. May quote host error text. Wording is not stable. */
      message: string;
    };

export const DASHBOARD_TYPE_ID ='gts.frontx.dashboard.dashboard.dashboard.v1~';
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
/**
 * The element a host names for overlays (the `overlayContainer` of `<Dashboard>`), or null for none. The `widgets`
 * domain shares it like the theme and the language; a widget opens its overlays (menus, popovers, dialogs) there, and
 * inside its own shadow root without one. No widget entry requires it.
 *
 * The value is an {@link OverlayContainerValue} that holds the element, or null for none; never the element itself.
 * The type store reads every value it is given: it walks the own enumerable fields of each nested object for
 * references, copies them and compares the copy with the value before, which stops at 64 levels; an element a page
 * framework rendered carries such fields that lead into the framework's whole tree (a React element does). The holder
 * keeps the element in a private field, which the store neither walks nor copies; the domain hands each widget the
 * holder the root published.
 *
 * The value schema is open (a page element is not JSON), so nothing in the type store checks what a widget receives.
 * A widget reads the value's `element` and uses it only when it is an `HTMLElement` of its own document, and treats
 * anything else (a bare element, an object whose `element` throws or holds something else) as no container. A
 * product's own widget bundle gets the value as `unknown` and reads that shape: the holder's class is the root's own,
 * so `instanceof` of it does not hold across bundles.
 */
export const OVERLAY_CONTAINER_PROPERTY_ID = 'gts.frontx.mfes.comm.shared_property.v1~frontx.dashboard.mfe.overlay_container.v1~';

/** The value of the overlay container property other than null: a holder of the host's element (see above). */
export interface OverlayContainerValue {
  readonly element: HTMLElement;
}

/** Host theme ids whose palette is dark; any other id maps to the kit's light scope. */
export const DARK_THEMES = new Set(['dark', 'dracula', 'dracula-large']);

/** The kit theme scope a host theme id draws in: the dashboard root and every widget share it. */
export const kitScopeOf = (theme: string | undefined): 'light' | 'dark' => (theme && DARK_THEMES.has(theme) ? 'dark' : 'light');

/**
 * The host language as every Intl constructor and the `lang` attribute take it: the dashboard frame and every widget
 * share it. The language property is a free string, so the host can deliver one that is not a BCP-47 tag ("pt_BR",
 * ""); Intl rejects it with a RangeError, so it falls back to `en`.
 */
export function intlLocaleOf(locale: string | undefined): string {
  try {
    return Intl.getCanonicalLocales(locale ?? 'en')[0] ?? 'en';
  } catch {
    return 'en';
  }
}

/** The served GTS file: the types and the instances (manifests, entries, dashboards) the root registers at runtime. */
export interface ServedFile {
  types: Record<string, unknown>[];
  instances: Record<string, unknown>[];
}

/** What a host answers to the dashboard request: one served file, or the file in parts, the base file first, then one part per widget bundle. */
export type ServedAnswer = ServedFile | ServedFile[];
