import { useEffect } from 'react';
import { Empty, EmptyHeader, EmptyTitle, Text, VisuallyHidden } from '@gears-frontx/ui-kit';

import styles from './widgets.module.css';

/** The widget's own wordings, default English; the host language replaces them. */
export interface WidgetTexts {
  empty: string;
  cannotBeShown: string;
  showData: string;
  showChart: string;
  dataOf: (title: string) => string;
}

export const DEFAULT_WIDGET_TEXTS: WidgetTexts = {
  empty: 'No data to show',
  cannotBeShown: 'This widget cannot be shown',
  showData: 'Show data',
  showChart: 'Show chart',
  dataOf: (title) => `Data of ${title}`,
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
