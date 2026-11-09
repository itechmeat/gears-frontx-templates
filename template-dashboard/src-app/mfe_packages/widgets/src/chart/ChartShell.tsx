import { useState, type ReactNode } from 'react';
import { ChartLineIcon, Table2Icon } from 'lucide-react';
import { Button } from '@gears-frontx/ui-kit';

import type { WidgetTexts } from '../states';
import styles from '../widgets.module.css';
import { DataView, type ValuesTable } from './DataView';

/** What a chart draws given the pick handler: a click on a mark picks the row of the values table it stands for. */
export type DrawChart = (onPick: ((row: number) => void) | undefined) => ReactNode;

/**
 * Holds a chart and, when `drill_down` is on, its data view: a button switches
 * between them, and a click on a mark opens the data view with that mark's row
 * picked. With drill-down off the chart draws no clickable marks.
 */
export function ChartShell({
  drillDown,
  table,
  draw,
  label,
  texts,
  format,
  locale,
  container,
}: {
  drillDown: boolean;
  table: ValuesTable;
  draw: DrawChart;
  label: string;
  texts: WidgetTexts;
  format: (value: string | number | null, column: number, row: number) => string;
  locale: string;
  container?: HTMLElement | ShadowRoot | null;
}) {
  const [view, setView] = useState<{ data: boolean; picked: number | null }>({ data: false, picked: null });
  if (!drillDown) return <div className={styles.chart}>{draw(undefined)}</div>;
  return (
    <div className={styles.chartShell}>
      <div className={styles.chartActions}>
        <Button variant="ghost" size="sm" icon={view.data ? <ChartLineIcon /> : <Table2Icon />} aria-pressed={view.data} onClick={() => setView({ data: !view.data, picked: null })}>
          {view.data ? texts.showChart : texts.showData}
        </Button>
      </div>
      {view.data ? (
        <DataView key={view.picked ?? 'all'} table={table} picked={view.picked} label={label} format={format} locale={locale} container={container} />
      ) : (
        <div className={`${styles.chart} ${styles.clickable}`}>{draw((row) => setView({ data: true, picked: row }))}</div>
      )}
    </div>
  );
}
