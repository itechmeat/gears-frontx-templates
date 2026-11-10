import type { CardSample } from '../cards/samples';
import type { HeatmapData, HeatmapRender } from '../types';

/** A `heatmap` sample: the commits of a work week by weekday and two-hour block of the day, UTC. */
export const HEATMAP_SAMPLE: CardSample<HeatmapRender, HeatmapData> = {
  render: { x_axis_label: 'Hour (UTC)', y_axis_label: 'Weekday', show_cell_values: true },
  value_format: { value_type: 'number' },
  data: {
    rows: [
      { x: '08:00', y: 'Mon', value: 214 },
      { x: '10:00', y: 'Mon', value: 296 },
      { x: '12:00', y: 'Mon', value: 247 },
      { x: '14:00', y: 'Mon', value: 167 },
      { x: '08:00', y: 'Tue', value: 235 },
      { x: '10:00', y: 'Tue', value: 326 },
      { x: '12:00', y: 'Tue', value: 272 },
      { x: '14:00', y: 'Tue', value: 184 },
      { x: '08:00', y: 'Wed', value: 225 },
      { x: '10:00', y: 'Wed', value: 311 },
      { x: '12:00', y: 'Wed', value: 260 },
      { x: '14:00', y: 'Wed', value: 92 },
      { x: '10:00', y: 'Sat', value: 36 },
      { x: '22:00', y: 'Sun', value: null },
    ],
  },
};
