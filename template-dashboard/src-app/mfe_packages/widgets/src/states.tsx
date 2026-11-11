import { useEffect } from 'react';
import { Empty, EmptyHeader, EmptyTitle, Text, VisuallyHidden } from '@gears-frontx/ui-kit';

import styles from './widgets.module.css';

/** The widget's own wordings: English, whatever the host language (gears-frontx-templates#105). */
export interface WidgetTexts {
  empty: string;
  cannotBeShown: string;
  showData: string;
  showChart: string;
  dataOf: (title: string) => string;
  /** The accessible names of the grid's row colour meanings. */
  rowMeaning: Record<'success' | 'warning' | 'error' | 'info', string>;
  /** The accessible name of a chart or a grid when the cell gives none. */
  chart: string;
  table: string;
  /**
   * The column headings of a chart's text alternative and data view where the configuration names none: the series
   * of a scatter point, the x and y of a point when the axis has no label, and the label and value of a pie slice.
   */
  columns: Record<'series' | 'x' | 'y' | 'label' | 'value', string>;
  /** The accessible names of the metric_card trend icon: an increase, a decrease, no change. */
  trend: Record<'up' | 'down' | 'flat', string>;
  /** The default headings of a ranked_list_card's two value columns, when the render names neither. */
  ranked: { value: string; secondary: string };
  /** The word between the current and the target value of a progress_list_card bar. */
  progress: { of: string };
}

export const DEFAULT_WIDGET_TEXTS: WidgetTexts = {
  empty: 'No data to show',
  cannotBeShown: 'This widget cannot be shown',
  showData: 'Show data',
  showChart: 'Show chart',
  dataOf: (title) => `Data of ${title}`,
  rowMeaning: { success: 'Success', warning: 'Warning', error: 'Error', info: 'Info' },
  chart: 'Chart',
  table: 'Table',
  columns: { series: 'Series', x: 'x', y: 'y', label: 'Label', value: 'Value' },
  trend: { up: 'Up', down: 'Down', flat: 'No change' },
  ranked: { value: 'Value', secondary: 'Secondary' },
  progress: { of: 'of' },
};

/** The empty state every widget owns: valid data that meets its data type's empty condition. */
export function WidgetEmpty({ texts }: { texts: WidgetTexts }) {
  return (
    <Empty className={styles.fill}>
      <EmptyHeader>
        <EmptyTitle>{texts.empty}</EmptyTitle>
      </EmptyHeader>
    </Empty>
  );
}

/** The widget's own cannot-be-shown state: static, with no error text. The problem goes to the console only. */
export function WidgetCannotBeShown({ texts, problem }: { texts: WidgetTexts; problem: string }) {
  useEffect(() => console.error(`[widget] ${problem}`), [problem]);
  return (
    <Text tone="muted" render={<p />} className={styles.cannot}>
      {texts.cannotBeShown}
    </Text>
  );
}

/** A text alternative of the values a widget shows only as graphics, for assistive technology. */
export function ValuesText({ caption, columns, rows }: { caption: string; columns: string[]; rows: string[][] }) {
  return (
    <VisuallyHidden>
      <table>
        <caption>{caption}</caption>
        <thead>
          <tr>
            {columns.map((column, index) => (
              <th key={index} scope="col">
                {column}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, rowIndex) => (
            <tr key={rowIndex}>
              {row.map((value, index) => (
                <td key={index}>{value}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </VisuallyHidden>
  );
}
