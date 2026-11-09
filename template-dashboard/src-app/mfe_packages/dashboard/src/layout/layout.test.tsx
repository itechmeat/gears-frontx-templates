import { render, screen } from '@testing-library/react';
import { defaultGridConfig } from '@gears-frontx/ui-kit';
import { describe, expect, it, vi } from 'vitest';

import type { DashboardCell, DashboardLayout } from '../contract';
import { DashboardArea } from '../DashboardArea';
import { cellFailuresOf, checkLayout } from './layoutChecks';

const W = 'gts.frontx.dashboard.widget.widget.v1~frontx.dashboard.widget.test_card.v1~';
const id = (n: number) => `${W}00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const cell = (n: number, extra: Partial<DashboardCell> = {}): DashboardCell => ({ size: 'small', widget: { id: id(n), title: `Widget ${n}`, render: {} }, ...extra });

describe('layout checks', () => {
  it('passes distinct widget ids and an empty layout', () => {
    expect(checkLayout({ cells: [cell(1), cell(2, { larger_view: { id: id(3), render: {} } })] }, [])).toEqual({ ok: true });
    expect(checkLayout({ cells: [] }, [])).toEqual({ ok: true });
  });

  it('reports cell failures first, by index, and skips the id check', () => {
    const layout: DashboardLayout = { cells: [cell(1), cell(1), cell(2)] };
    expect(checkLayout(layout, [2, 0, 2])).toEqual({ ok: false, failures: [{ kind: 'cell', cell: 0 }, { kind: 'cell', cell: 2 }] });
    expect(checkLayout(layout, [])).toEqual({ ok: false, failures: [{ kind: 'repeated-id', id: id(1), at: [{ cell: 0, role: 'widget' }, { cell: 1, role: 'widget' }] }] });
  });

  it('names both roles when a larger view repeats a widget id', () => {
    const layout: DashboardLayout = { cells: [cell(1, { larger_view: { id: id(2), render: {} } }), cell(3), cell(2)] };
    expect(checkLayout(layout, [])).toEqual({ ok: false, failures: [{ kind: 'repeated-id', id: id(2), at: [{ cell: 0, role: 'larger_view' }, { cell: 2, role: 'widget' }] }] });
    const same: DashboardLayout = { cells: [cell(1, { larger_view: { id: id(1), render: {} } })] };
    expect(checkLayout(same, [])).toEqual({ ok: false, failures: [{ kind: 'repeated-id', id: id(1), at: [{ cell: 0, role: 'widget' }, { cell: 0, role: 'larger_view' }] }] });
  });

  it('leaves a widget without a string id out of the id check', () => {
    const layout = { cells: [cell(1), { size: 'small', widget: { render: {} } }, { size: 'small', widget: { render: {} } }] } as unknown as DashboardLayout;
    expect(checkLayout(layout, [])).toEqual({ ok: true });
  });

  it('reads cell failures from instance paths, leaving out paths under the widgets', () => {
    expect(cellFailuresOf(['/layout/cells/2/size', '/layout/cells/0', '/layout/cells/1/widget/render', '/layout/cells/3/larger_view/id', '/title'])).toEqual([0, 2]);
    // A sibling whose name only starts like a widget field is a cell failure, not a widget path.
    expect(cellFailuresOf(['/layout/cells/1/widget2', '/layout/cells/4/larger_views'])).toEqual([1, 4]);
  });
});

describe('DashboardArea', () => {
  const renderCell = (item: DashboardCell) => <p>{item.widget.title}</p>;

  it('places every cell as one Grid item in the order of cells, with its size and height, and never the larger view', () => {
    const { container } = render(
      <DashboardArea
        layout={{ flexible: false, cells: [cell(3, { size: 'large', height: 'high' }), cell(1, { larger_view: { id: id(9), title: 'Larger 9', render: {} } }), cell(2, { size: 'medium' })] }}
        renderCell={renderCell}
      />,
    );
    expect(container.querySelector('[data-fx-grid]')).not.toBeNull();
    expect(container.querySelector('[data-fx-grid-flexible]')).toBeNull();
    const items = [...container.querySelectorAll<HTMLElement>('[data-fx-grid-item]')];
    expect(items.map((item) => item.textContent)).toEqual(['Widget 3', 'Widget 1', 'Widget 2']);
    // A Grid that is not flexible gives each item its size class's preferred span at every step, taken
    // here from the kit's own default config; high spans two row tracks, low (the default) one.
    const lg = (item: HTMLElement) => [item.style.getPropertyValue('--_grid-col-lg'), item.style.getPropertyValue('--_grid-row-lg')].map((value) => value.split('/')[1]?.trim());
    const span = (size: 'small' | 'medium' | 'large') => `span ${defaultGridConfig.sizes[size].lg.preferred}`;
    expect(items.map(lg)).toEqual([
      [span('large'), 'span 2'],
      [span('small'), 'span 1'],
      [span('medium'), 'span 1'],
    ]);
    expect(screen.queryByText('Larger 9')).toBeNull();
  });

  it('is flexible when the layout does not say otherwise', () => {
    const { container } = render(<DashboardArea layout={{ cells: [cell(1)] }} renderCell={renderCell} />);
    expect(container.querySelector('[data-fx-grid-flexible]')).not.toBeNull();
  });

  it('shows the dashboard-level cannot-be-shown state and mounts no cell when a check fails', () => {
    const log = vi.spyOn(console, 'error').mockImplementation(() => {});
    render(<DashboardArea layout={{ cells: [cell(1), cell(1)] }} renderCell={renderCell} />);
    expect(screen.getByText('This dashboard cannot be shown')).toBeTruthy();
    expect(screen.queryByText('Widget 1')).toBeNull();
    expect(log).toHaveBeenCalledWith(expect.stringContaining('repeats in cell 0 (widget), cell 1 (widget)'));
    log.mockRestore();
  });

  it('shows a cell failure from validation at dashboard level', () => {
    const log = vi.spyOn(console, 'error').mockImplementation(() => {});
    render(<DashboardArea layout={{ cells: [cell(1), cell(2)] }} cellFailures={[1]} renderCell={renderCell} />);
    expect(screen.getByText('This dashboard cannot be shown')).toBeTruthy();
    expect(screen.queryByText('Widget 1')).toBeNull();
    log.mockRestore();
  });

  it('logs a layout failure once while the same cell failures arrive in a new array on each render', () => {
    const log = vi.spyOn(console, 'error').mockImplementation(() => {});
    const layout: DashboardLayout = { cells: [cell(1), cell(2)] };
    const { rerender } = render(<DashboardArea layout={layout} cellFailures={[1]} renderCell={renderCell} />);
    rerender(<DashboardArea layout={layout} cellFailures={[1]} renderCell={renderCell} />);
    expect(log).toHaveBeenCalledTimes(1);
    log.mockRestore();
  });

  it('shows the dashboard-level cannot-be-shown state for a failure found before the layout checks', () => {
    render(<DashboardArea layout={{ cells: [cell(1)] }} failed renderCell={renderCell} />);
    expect(screen.getByText('This dashboard cannot be shown')).toBeTruthy();
    expect(screen.queryByText('Widget 1')).toBeNull();
  });

  it('renders nothing for an empty layout', () => {
    const { container } = render(<DashboardArea layout={{ cells: [] }} renderCell={renderCell} />);
    expect(container.innerHTML).toBe('');
  });

  it('announces the dashboard loader as a status', () => {
    render(<DashboardArea renderCell={renderCell} />);
    expect(screen.getByRole('status', { name: 'Loading dashboard' })).toBeTruthy();
  });
});
