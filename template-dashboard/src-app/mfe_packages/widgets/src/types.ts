/*
 * The render options and data shapes of the catalog widget types this package
 * draws, as the widget catalog FEATURE declares them. The widget type and data
 * type schemas there are normative; these types mirror them.
 */

export interface CartesianSeriesOption {
  name: string;
  type: 'bar' | 'line' | 'area' | 'scatter';
  y_axis?: 'primary' | 'secondary';
  stack_group?: string;
  /** A line or area only: a name written at the end of the series, such as a target. */
  label?: string;
  /** A line or area only. */
  line_style?: 'solid' | 'dashed';
}

export type LegendPosition = 'top' | 'right' | 'bottom' | 'left' | 'none';

export interface CartesianRender {
  series?: CartesianSeriesOption[];
  x_axis?: {
    type?: 'category' | 'value' | 'time';
    label?: string;
    /** `auto` skips labels that would collide; `every` labels every category, thinning out only when they cannot fit. */
    tick_labels?: 'auto' | 'every';
    tick_angle?: 0 | -45 | -90;
  };
  y_axis?: { type?: 'value' | 'log'; label?: string };
  y_axis_secondary?: { type?: 'value' | 'log'; label?: string; unit?: string };
  legend_position?: LegendPosition;
  /** Values written at the bars' ends (below a bar that grows down): `auto` when every bar is wide enough. */
  value_labels?: 'auto' | 'always' | 'never';
  /** Marks open the data view with the picked row expanded, and a button opens the whole data view. */
  drill_down?: boolean;
}

export interface CartesianPoint {
  x: string | number | null;
  y: number | null;
}

export interface CartesianData {
  series: { name: string | null; points: CartesianPoint[] }[];
}

export interface PieRender {
  /** Outer radius, or inner and outer radius, each `<n>%` or `<n>px`. Two items make a donut. */
  radius?: string[];
  legend_position?: LegendPosition;
  drill_down?: boolean;
}

export interface PieData {
  slices: { label: string | number | null; value: number | null }[];
}

export interface GridColumn {
  key: string;
  title?: string;
  /** Width in pixels; the table is at least the sum of the widths (a floor for a column without one) and scrolls sideways in a narrower cell. */
  width?: number;
  format?: { notation?: 'standard' | 'compact' };
  align?: 'start' | 'end' | 'center';
  sortable?: boolean;
  /** `truncate` keeps one line per cell; the full text stays in the cell's title. */
  overflow?: 'wrap' | 'truncate';
}

export interface GridRender {
  columns: GridColumn[];
  page_sizes?: number[];
  frozen_columns?: number;
  column_groups?: { title: string; members: string[] }[];
  row_color?: string;
}

/** A grid value drawn as a link that opens in a new tab. */
export interface GridLink {
  text: string;
  href: string;
}

export type GridValue = string | number | null | GridLink;

export interface GridData {
  rows: GridValue[][];
}

/** The `metric_card` render: an optional caption of the headline value; without it, no caption shows. */
export interface MetricCardRender {
  value_label?: string;
}

export interface MetricCardData {
  /** The headline. Null is the data type's empty condition. */
  value: number | null;
  /**
   * The value the trend compares with. Absent or null shows no trend; 0 shows
   * the direction icon alone, without a change.
   */
  previous_value?: number | null;
  /** One point per step; a null point is a gap. */
  sparkline?: (number | null)[];
}

/** The `summary_card` render: the type closes an empty render, so it carries nothing. */
export type SummaryCardRender = Record<string, never>;

/** The `summary_card` data: one row per line, in delivered order. */
export interface SummaryCardData {
  rows: { label: string | null; value: number | null }[];
}

/** The `ranked_list_card` render: optional headings of the two value columns; the defaults stand in where they are absent. */
export interface RankedListCardRender {
  value_label?: string;
  secondary_label?: string;
}

export interface RankedListCardData {
  /** Rows in the delivered order: the rank is the position, and the widget never re-ranks or re-orders them. */
  rows: {
    label: string | number | null;
    value: number | null;
    /** Omitted when the data has no secondary value; a null one shows as an empty value. */
    secondary?: number | null;
  }[];
}

/** The `heatmap` render: the axis titles, the ends of the colour scale, and whether the cells show their values. */
export interface HeatmapRender {
  x_axis_label?: string;
  y_axis_label?: string;
  /** The lower end of the colour scale; null or absent takes the lowest value in the rows. */
  min_value?: number | null;
  /** The upper end of the colour scale; null or absent takes the highest value in the rows. */
  max_value?: number | null;
  /** Whether to show each cell's value inside the cell. */
  show_cell_values?: boolean;
}

export interface HeatmapData {
  /** One row per cell value, in delivered order; the x and y categories keep the order of their first appearance. */
  rows: { x: string | number | null; y: string | number | null; value: number | null }[];
}

/** The `markdown_card` render: the CommonMark body to show, with embedded HTML as text. It carries no data. */
export interface MarkdownCardRender {
  body: string;
}

/** The `progress_list_card` render: the type closes an empty render, so it carries nothing. */
export type ProgressListCardRender = Record<string, never>;

export interface ProgressListCardData {
  /** Rows in the delivered order: the bar fills by `current` over `target`. */
  rows: {
    label: string | number | null;
    current: number | null;
    target: number | null;
  }[];
}
