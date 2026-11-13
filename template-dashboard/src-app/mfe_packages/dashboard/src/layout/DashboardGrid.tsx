import { Fragment, useLayoutEffect, useRef, type ReactNode } from 'react';
import { Grid, GridItem, defaultGridConfig } from '@gears-frontx/ui-kit';

import type { DashboardCell, DashboardLayout } from '../contract';
import styles from '../frame/frame.module.css';

type Placed = { cell: DashboardCell; index: number };

/** The cells split at each frameless cell: a run of framed cells is one group, a frameless cell stands alone between them. */
const groupsOf = (cells: readonly DashboardCell[]) =>
  cells.reduce<Array<Placed | Placed[]>>((groups, cell, index) => {
    const last = groups.at(-1);
    if (cell.frame === false) groups.push({ cell, index });
    else if (Array.isArray(last)) last.push({ cell, index });
    else groups.push([{ cell, index }]);
    return groups;
  }, []);

/** The gap token of the default config's step at a width: the last step whose `minWidth` the width reaches. */
const gapAt = (width: number) => defaultGridConfig.steps.filter((step) => step.minWidth <= width).at(-1)?.gap ?? defaultGridConfig.steps[0].gap;

// @cpt-algo:cpt-frontx-dashboard-algo-dashboard-model-place-cells:p2
/**
 * Places the cells of a layout that passed the layout checks. A frameless cell (`frame: false`) breaks the cells into
 * groups: each run of framed cells is one ui-kit Grid with the kit's default config, and each frameless cell is a
 * full-width block between them whose height follows its content. Every framed cell is one direct GridItem keyed by
 * its widget id. The DOM keeps the order of `cells`, which is the reading and keyboard order. The Grid picks every span;
 * this component computes none, and never places a larger-view widget.
 *
 * The space between the groups is the Grid's own gap at the current width: the gap token of the default config's step
 * that the width reaches, read through the kit's `--grid-gap` hook the same way the Grid reads it.
 */
export function DashboardGrid({ layout, renderCell }: { layout: DashboardLayout; renderCell: (cell: DashboardCell, index: number) => ReactNode }) {
  const groupsElement = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    const element = groupsElement.current;
    if (!element) return undefined;
    // Set on the element, not through state: the observer reports before paint, so the first frame has the right gap.
    const observer = new ResizeObserver(([entry]) => element.style.setProperty('--dashboard-group-gap', `var(--grid-gap, var(${gapAt(entry.contentRect.width)}))`));
    observer.observe(element);
    return () => observer.disconnect();
  }, []);
  const flexible = layout.flexible ?? true;
  return (
    <div ref={groupsElement} className={styles.groups}>
      {groupsOf(layout.cells).map((group) => {
        if (!Array.isArray(group)) return <Fragment key={`frameless:${group.cell.widget.id}`}>{renderCell(group.cell, group.index)}</Fragment>;
        // @cpt-begin:cpt-frontx-dashboard-algo-dashboard-model-place-cells:p2:inst-dm-place-cell
        const items = group.map(({ cell, index }) => (
          <GridItem key={cell.widget.id} layoutId={cell.widget.id} size={cell.size} height={cell.height ?? 'low'}>
            {renderCell(cell, index)}
          </GridItem>
        ));
        // @cpt-end:cpt-frontx-dashboard-algo-dashboard-model-place-cells:p2:inst-dm-place-cell
        // @cpt-begin:cpt-frontx-dashboard-algo-dashboard-model-place-cells:p2:inst-dm-place-grid
        return (
          <Grid key={`grid:${group[0].cell.widget.id}`} config={defaultGridConfig} flexible={flexible}>
            {items}
          </Grid>
        );
        // @cpt-end:cpt-frontx-dashboard-algo-dashboard-model-place-cells:p2:inst-dm-place-grid
      })}
    </div>
  );
}
