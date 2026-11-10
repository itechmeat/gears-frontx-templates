import { render } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import type { CartesianData, PieData } from '../types';
import { CartesianChart } from './CartesianChart';
import { PieChart } from './PieChart';

// A small low cell: every observed element reports this size.
let size = { width: 264, height: 110 };
const original = globalThis.ResizeObserver;

beforeEach(() => {
  globalThis.ResizeObserver = class {
    constructor(private readonly callback: ResizeObserverCallback) {}
    observe(target: Element) {
      const rect = { ...size, top: 0, left: 0, right: size.width, bottom: size.height, x: 0, y: 0 };
      this.callback([{ target, contentRect: rect } as unknown as ResizeObserverEntry], this as unknown as ResizeObserver);
    }
    unobserve() {}
    disconnect() {}
  } as unknown as typeof ResizeObserver;
});

afterEach(() => {
  globalThis.ResizeObserver = original;
  size = { width: 264, height: 110 };
});

const DAYS: CartesianData = { series: [{ name: 'Commits', points: Array.from({ length: 20 }, (_, day) => ({ x: `2026-10-${String(day + 1).padStart(2, '0')}`, y: day })) }] };
const SLICES: PieData = { slices: [{ label: 'Passed', value: 8 }, { label: 'Failed', value: 2 }] };

const tickAngles = (container: HTMLElement) =>
  [...container.querySelectorAll('.recharts-cartesian-axis-tick-value')].map((tick) => tick.getAttribute('transform') ?? tick.closest('[transform]')?.getAttribute('transform') ?? '');

describe('charts in a small low cell', () => {
  it('draws the x ticks of a compact chart horizontally whatever tick_angle asks', () => {
    const { container } = render(<CartesianChart payload={{ render: { x_axis: { tick_angle: -90 }, series: [{ name: 'Commits', type: 'bar' }] }, data: DAYS }} />);
    expect(tickAngles(container).length).toBeGreaterThan(0);
    expect(tickAngles(container).some((transform) => transform.includes('rotate(-90'))).toBe(false);
  });

  it('keeps the asked tick angle once the chart is tall enough', () => {
    size = { width: 640, height: 320 };
    const { container } = render(<CartesianChart payload={{ render: { x_axis: { tick_angle: -90 }, series: [{ name: 'Commits', type: 'bar' }] }, data: DAYS }} />);
    expect(tickAngles(container).some((transform) => transform.includes('rotate(-90'))).toBe(true);
  });

  it('leaves out the legend of a compact single-series chart, and keeps it for two series', () => {
    const one = render(<CartesianChart payload={{ render: { series: [{ name: 'Commits', type: 'line' }], legend_position: 'bottom' }, data: DAYS }} />);
    expect(one.container.querySelector('.recharts-legend-wrapper')).toBeNull();
    one.unmount();
    const two: CartesianData = { series: [...DAYS.series, { name: 'PRs', points: DAYS.series[0].points }] };
    const { container } = render(<CartesianChart payload={{ render: { series: [{ name: 'Commits', type: 'line' }, { name: 'PRs', type: 'line' }], legend_position: 'bottom' }, data: two }} />);
    expect(container.querySelector('.recharts-legend-wrapper')).not.toBeNull();
  });

  it('moves the legend of a compact pie beside it', () => {
    const { container } = render(<PieChart payload={{ render: { legend_position: 'bottom' }, data: SLICES }} />);
    expect(container.querySelector('.legendSide')).not.toBeNull();
  });

  it('leaves out the legend of a compact pie in a narrow cell', () => {
    size = { width: 200, height: 110 };
    const { container } = render(<PieChart payload={{ render: { legend_position: 'bottom' }, data: SLICES }} />);
    expect(container.querySelector('.recharts-legend-wrapper')).toBeNull();
  });
});
