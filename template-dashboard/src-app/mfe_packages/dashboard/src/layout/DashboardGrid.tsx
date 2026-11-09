import type { ReactNode } from 'react';
import { Grid, GridItem, defaultGridConfig } from '@gears-frontx/ui-kit';

import type { DashboardCell, DashboardLayout } from '../contract';

// @cpt-algo:cpt-frontx-dashboard-algo-dashboard-model-place-cells:p2
/**
 * Places the cells of a layout that passed the layout checks on one ui-kit
 * Grid with the kit's default config. Each cell is one direct GridItem keyed by
 * its widget id, in the order of `cells`, which is the reading and keyboard
 * order. The Grid picks every span; this component computes none, and never
 * places a larger-view widget.
 */
export function DashboardGrid({ layout, renderCell }: { layout: DashboardLayout; renderCell: (cell: DashboardCell, index: number) => ReactNode }) {
  // @cpt-begin:cpt-frontx-dashboard-algo-dashboard-model-place-cells:p2:inst-dm-place-cell
  const items = layout.cells.map((cell, index) => (
    <GridItem key={cell.widget.id} layoutId={cell.widget.id} size={cell.size} height={cell.height ?? 'low'}>
      {renderCell(cell, index)}
    </GridItem>
  ));
  // @cpt-end:cpt-frontx-dashboard-algo-dashboard-model-place-cells:p2:inst-dm-place-cell
  // @cpt-begin:cpt-frontx-dashboard-algo-dashboard-model-place-cells:p2:inst-dm-place-grid
  return (
    <Grid config={defaultGridConfig} flexible={layout.flexible ?? true}>
      {items}
    </Grid>
  );
  // @cpt-end:cpt-frontx-dashboard-algo-dashboard-model-place-cells:p2:inst-dm-place-grid
}
