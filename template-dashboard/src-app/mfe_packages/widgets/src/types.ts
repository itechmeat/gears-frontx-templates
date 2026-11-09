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
  /** Values written above bars: `auto` when every bar is wide enough. */
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
