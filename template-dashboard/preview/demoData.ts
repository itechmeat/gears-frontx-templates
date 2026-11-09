import type { DashboardCell } from '@gears-frontx/frontx-dashboard-root';
import type { CartesianData, CartesianRender, GridData, GridRender, GridValue, PieData, PieRender } from '@gears-frontx/frontx-dashboard-widgets';

/*
 * Invented, vendor-neutral demo data for the dev preview. Every number and
 * name here is made up; none of it describes a real product or company.
 */

const W = 'gts.frontx.dashboard.widget.widget.v1~frontx.dashboard.widget.data_widget.v1~frontx.dashboard.widget.';
const uuid = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
export const widgetId = (type: 'cartesian_chart' | 'pie_chart' | 'grid', n: number) => `${W}${type}.v1~${uuid(n)}`;
export const typeOf = (id: string) => (id.includes('.cartesian_chart.') ? 'cartesian_chart' : id.includes('.pie_chart.') ? 'pie_chart' : 'grid');

const MONTHS = ['January 2026', 'February 2026', 'March 2026', 'April 2026', 'May 2026', 'June 2026', 'July 2026', 'August 2026', 'September 2026', 'October 2026', 'November 2026', 'December 2026'];
const orders = [1240, 1310, 1185, 1420, 1505, 1490, 1610, 1580, 1720, 1805, 1760, 1930];
const handling = [5.2, 4.8, 5.6, 4.4, 4.1, 4.3, 3.9, 4.0, 3.6, 3.4, 3.7, 3.2];

const ordersRender: CartesianRender = {
  series: [
    { name: 'Orders', type: 'bar' },
    { name: 'Target', type: 'line', label: 'Target', line_style: 'dashed' },
    { name: 'Handling time', type: 'line', y_axis: 'secondary' },
  ],
  x_axis: { type: 'category', label: 'Month', tick_labels: 'every', tick_angle: -45 },
  y_axis: { label: 'Orders' },
  y_axis_secondary: { label: 'Handling time', unit: ' h' },
  value_labels: 'auto',
  drill_down: true,
};
const ordersData: CartesianData = {
  series: [
    { name: 'Orders', points: MONTHS.map((x, i) => ({ x, y: orders[i] })) },
    { name: 'Target', points: MONTHS.map((x, i) => ({ x, y: i < 6 ? 1400 : 1700 })) },
    { name: 'Handling time', points: MONTHS.map((x, i) => ({ x, y: handling[i] })) },
  ],
};

const channelsRender: CartesianRender = {
  series: [
    { name: 'Email', type: 'area', stack_group: 'all' },
    { name: 'Chat', type: 'area', stack_group: 'all' },
    { name: 'Phone', type: 'area', stack_group: 'all' },
  ],
  x_axis: { type: 'category', label: 'Week' },
  legend_position: 'right',
};
const weeks = Array.from({ length: 10 }, (_, i) => `W${i + 1}`);
const channelsData: CartesianData = {
  series: [
    { name: 'Email', points: weeks.map((x, i) => ({ x, y: 120 + i * 7 })) },
    { name: 'Chat', points: weeks.map((x, i) => ({ x, y: 80 + ((i * 13) % 40) })) },
    { name: 'Phone', points: weeks.map((x, i) => ({ x, y: 40 + ((i * 7) % 20) })) },
  ],
};

const latencyRender: CartesianRender = {
  series: [{ name: 'p95 latency', type: 'line' }, { name: 'Budget', type: 'line', label: 'Budget', line_style: 'dashed' }],
  x_axis: { type: 'time', label: 'Day' },
  legend_position: 'top',
};
const days = Array.from({ length: 14 }, (_, i) => `2026-10-${String(i + 1).padStart(2, '0')}T00:00:00Z`);
const latencyData: CartesianData = {
  series: [
    { name: 'p95 latency', points: days.map((x, i) => ({ x, y: 0.31 + ((i * 37) % 17) / 100 })) },
    { name: 'Budget', points: days.map((x) => ({ x, y: 0.45 })) },
  ],
};

// Two series sampled at different times of one day, on two y axes with titles.
const todayRender: CartesianRender = {
  series: [{ name: 'Requests', type: 'line' }, { name: 'CPU', type: 'area', y_axis: 'secondary' }],
  x_axis: { type: 'time', label: 'Time' },
  y_axis: { label: 'Requests' },
  y_axis_secondary: { label: 'CPU', unit: '%' },
  drill_down: true,
};
const at = (minutes: number) => new Date(Date.UTC(2026, 10, 9, 8, minutes)).toISOString();
const todayData: CartesianData = {
  series: [
    { name: 'Requests', points: Array.from({ length: 13 }, (_, i) => ({ x: at(i * 20), y: 120 + ((i * 37) % 60) })) },
    { name: 'CPU', points: Array.from({ length: 9 }, (_, i) => ({ x: at(7 + i * 30), y: 35 + ((i * 23) % 30) })) },
  ],
};

// Line series stacked in one group, on a value x axis.
const stackedRender: CartesianRender = {
  series: [{ name: 'API', type: 'line', stack_group: 'load' }, { name: 'Web', type: 'line', stack_group: 'load' }, { name: 'Jobs', type: 'line', stack_group: 'load' }],
  x_axis: { type: 'value', label: 'Elapsed seconds' },
  y_axis: { label: 'Requests per second' },
};
const stackedData: CartesianData = {
  series: [
    { name: 'API', points: Array.from({ length: 10 }, (_, i) => ({ x: i * 10, y: 40 + ((i * 7) % 15) })) },
    { name: 'Web', points: Array.from({ length: 10 }, (_, i) => ({ x: i * 10, y: 25 + ((i * 11) % 12) })) },
    { name: 'Jobs', points: Array.from({ length: 10 }, (_, i) => ({ x: i * 10, y: 10 + ((i * 5) % 8) })) },
  ],
};

const teamsRender: CartesianRender = {
  series: [{ name: 'Closed', type: 'bar' }],
  x_axis: { type: 'category', label: 'Team', tick_labels: 'every', tick_angle: -90 },
  value_labels: 'always',
  legend_position: 'none',
  drill_down: true,
};
const teamsData: CartesianData = {
  series: [{ name: 'Closed', points: ['North support', 'South support', 'Billing desk', 'Onboarding', 'Field service'].map((x, i) => ({ x, y: [312, 287, 198, 145, 96][i] })) }],
};

const regionsRender: PieRender = { radius: ['55%', '80%'], legend_position: 'bottom', drill_down: true };
const regionsData: PieData = {
  slices: [
    { label: 'North', value: 0.34 },
    { label: 'South', value: 0.27 },
    { label: 'East', value: 0.21 },
    { label: 'West', value: 0.12 },
    { label: 'Central', value: 0.06 },
  ],
};

const STATUSES = ['success', 'warning', 'error', 'info', 'none'];
const SUBJECTS = [
  'Cannot reset the password from the mobile app after the last update',
  'Invoice shows the wrong billing period',
  'Export to spreadsheet stops at the first thousand lines and the remaining lines never arrive',
  'Request to add a second delivery address',
  'Dashboard loads slowly in the morning',
];

export const gridRender = (pageSizes: number[]): GridRender => ({
  columns: [
    { key: 'ref', title: 'Request', width: 110, sortable: true },
    { key: 'subject', title: 'Subject', width: 260, overflow: 'truncate' },
    { key: 'owner', title: 'Owner', width: 140 },
    { key: 'opened', title: 'Opened', align: 'end', width: 110 },
    { key: 'amount', title: 'Amount', align: 'end', format: { notation: 'compact' }, width: 100 },
    { key: 'status', title: 'Status', width: 100 },
  ],
  frozen_columns: 1,
  column_groups: [{ title: 'Figures', members: ['opened', 'amount'] }],
  page_sizes: pageSizes,
  row_color: 'status',
});

export const gridRows = (count: number): GridValue[][] =>
  Array.from({ length: count }, (_, i) => [
    i % 4 === 0 ? { text: `REQ-${1000 + i}`, href: `https://example.com/requests/${1000 + i}` } : `REQ-${1000 + i}`,
    SUBJECTS[i % SUBJECTS.length],
    ['Alex Doe', 'Sam Lee', 'Kim Park', 'Robin Fox'][i % 4],
    (i * 7) % 31,
    ((i * 7919) % 100000) + 250,
    STATUSES[i % STATUSES.length],
  ]);

const gridData = (count: number): GridData => ({ rows: gridRows(count) });

export interface DemoWidget {
  render: unknown;
  data: unknown;
  value_format?: { value_type: 'number' | 'percent' };
}

export const DEMO_DATA: Record<string, DemoWidget> = {
  [widgetId('cartesian_chart', 1)]: { render: ordersRender, data: ordersData },
  [widgetId('cartesian_chart', 2)]: { render: { ...ordersRender, value_labels: 'always', x_axis: { ...ordersRender.x_axis, tick_angle: 0 } }, data: ordersData },
  [widgetId('cartesian_chart', 3)]: { render: channelsRender, data: channelsData },
  [widgetId('cartesian_chart', 4)]: { render: latencyRender, data: latencyData },
  [widgetId('cartesian_chart', 5)]: { render: teamsRender, data: teamsData },
  [widgetId('pie_chart', 6)]: { render: regionsRender, data: regionsData, value_format: { value_type: 'percent' } },
  [widgetId('pie_chart', 7)]: { render: { ...regionsRender, radius: ['80%'], legend_position: 'right' }, data: regionsData, value_format: { value_type: 'percent' } },
  [widgetId('grid', 8)]: { render: gridRender([10, 25, 50]), data: gridData(60) },
  [widgetId('grid', 9)]: { render: gridRender([50, 500]), data: gridData(60) },
  [widgetId('grid', 10)]: { render: gridRender([500, 50]), data: gridData(500) },
  [widgetId('cartesian_chart', 11)]: { render: todayRender, data: todayData },
  [widgetId('cartesian_chart', 12)]: { render: stackedRender, data: stackedData },
};

const cell = (size: DashboardCell['size'], height: DashboardCell['height'], id: string, title: string, larger?: string): DashboardCell => ({
  size,
  height,
  widget: { id, title, render: {} },
  ...(larger ? { larger_view: { id: larger, title, render: {} } } : {}),
});

export const DEMO_CELLS: DashboardCell[] = [
  cell('large', 'high', widgetId('cartesian_chart', 1), 'Orders per month', widgetId('cartesian_chart', 2)),
  cell('small', 'low', widgetId('pie_chart', 6), 'Requests by region', widgetId('pie_chart', 7)),
  cell('medium', 'low', widgetId('cartesian_chart', 3), 'Tickets by channel'),
  cell('medium', 'low', widgetId('cartesian_chart', 4), 'Response time'),
  cell('small', 'high', widgetId('cartesian_chart', 5), 'Closed this month'),
  cell('medium', 'high', widgetId('cartesian_chart', 11), 'Requests and CPU today'),
  cell('medium', 'high', widgetId('cartesian_chart', 12), 'Load by source'),
  cell('large', 'high', widgetId('grid', 8), 'Open requests', widgetId('grid', 9)),
];

export const GRID_500_CELLS: DashboardCell[] = [cell('large', 'high', widgetId('grid', 10), 'Requests (500 rows)')];
