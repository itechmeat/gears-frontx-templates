import { render, screen } from '@testing-library/react';
import type { ReactNode } from 'react';
import { describe, expect, it } from 'vitest';

import { ActivityFeed } from './cards/ActivityFeed';
import { RadialProgress } from './cards/RadialProgress';
import { CartesianChart } from './chart/CartesianChart';
import { FunnelChart } from './chart/FunnelChart';
import { PieChart } from './chart/PieChart';
import { RadarChart } from './chart/RadarChart';
import { TreemapChart } from './chart/TreemapChart';
import { WaterfallChart } from './chart/WaterfallChart';
import { GridWidget } from './grid/GridWidget';
import { Heatmap } from './heatmap/Heatmap';
import { ACTIVITY_FEED_SAMPLE, HEATMAP_SAMPLE } from './samples';

type Draw = (payload: never, label?: string) => ReactNode;

/** Each catalog widget that names itself: a payload it draws, the role it names, and its own English name. */
const NAMED: Array<{ widget: string; draw: Draw; payload: object; role: string; own: string }> = [
  {
    widget: 'cartesian_chart',
    draw: (payload, label) => <CartesianChart payload={payload} label={label} />,
    payload: { render: {}, data: { series: [{ name: 'Commits', points: [{ x: 'Mon', y: 3 }] }] } },
    role: 'figure',
    own: 'Chart',
  },
  { widget: 'pie_chart', draw: (payload, label) => <PieChart payload={payload} label={label} />, payload: { render: {}, data: { slices: [{ label: 'Passed', value: 3 }] } }, role: 'figure', own: 'Chart' },
  {
    widget: 'radar_chart',
    draw: (payload, label) => <RadarChart payload={payload} label={label} />,
    payload: { render: {}, data: { points: ['Mon', 'Tue', 'Wed'].map((axis, index) => ({ axis, series: null, value: index + 1 })) } },
    role: 'figure',
    own: 'Chart',
  },
  {
    widget: 'treemap_chart',
    draw: (payload, label) => <TreemapChart payload={payload} label={label} />,
    payload: { render: {}, data: { items: [{ label: 'api', value: 3, group: null }] } },
    role: 'figure',
    own: 'Chart',
  },
  {
    widget: 'waterfall_chart',
    draw: (payload, label) => <WaterfallChart payload={payload} label={label} />,
    payload: { render: {}, data: { steps: [{ label: 'Start', value: 3 }, { label: 'Up', value: 2 }] } },
    role: 'figure',
    own: 'Chart',
  },
  { widget: 'funnel_chart', draw: (payload, label) => <FunnelChart payload={payload} label={label} />, payload: { render: {}, data: { stages: [{ label: 'Opened', value: 3 }] } }, role: 'figure', own: 'Chart' },
  { widget: 'heatmap', draw: (payload, label) => <Heatmap payload={payload} label={label} />, payload: HEATMAP_SAMPLE, role: 'figure', own: 'Chart' },
  {
    widget: 'grid',
    draw: (payload, label) => <GridWidget payload={payload} label={label} />,
    payload: { render: { columns: [{ key: 'name', title: 'Name' }] }, data: { rows: [['api']] } },
    role: 'region',
    own: 'Table',
  },
  { widget: 'activity_feed', draw: (payload, label) => <ActivityFeed payload={payload} label={label} />, payload: ACTIVITY_FEED_SAMPLE, role: 'list', own: 'Activity' },
  {
    widget: 'radial_progress',
    draw: (payload, label) => <RadialProgress payload={payload} label={label} />,
    payload: { render: {}, data: { current: 3, target: 10 } },
    role: 'progressbar',
    own: 'Progress',
  },
];

describe('the accessible name of a widget', () => {
  it.each(NAMED)('of $widget is the title of its payload', async ({ widget, draw, payload, role }) => {
    render(<>{draw({ ...payload, title: 'Open pull requests' } as never)}</>);
    expect(await screen.findByRole(role, { name: 'Open pull requests' }), `should be named by the title: ${widget}`).toBeTruthy();
  });

  it.each(NAMED)('of $widget is its own English name without a title', async ({ widget, draw, payload, role, own }) => {
    render(<>{draw(payload as never)}</>);
    expect(await screen.findByRole(role, { name: own }), `should keep its own name: ${widget}`).toBeTruthy();
  });

  it.each(NAMED)('of $widget is the label its renderer passes, over the title of its payload', async ({ widget, draw, payload, role }) => {
    render(<>{draw({ ...payload, title: 'Open pull requests' } as never, 'Pull requests by age')}</>);
    expect(await screen.findByRole(role, { name: 'Pull requests by age' }), `should be named by the label: ${widget}`).toBeTruthy();
  });

  it.each(NAMED.flatMap((named) => ['', '   '].map((title) => ({ ...named, title }))))('of $widget is its own English name with the title $title', async ({ widget, draw, payload, role, own, title }) => {
    render(<>{draw({ ...payload, title } as never)}</>);
    expect(await screen.findByRole(role, { name: own }), `should keep its own name: ${widget}`).toBeTruthy();
  });
});
