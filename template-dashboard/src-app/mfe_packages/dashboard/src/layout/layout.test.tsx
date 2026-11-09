import { render, screen } from '@testing-library/react';
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

  it('reads cell failures from instance paths, leaving out paths under the widgets', () => {
    expect(cellFailuresOf(['/layout/cells/2/size', '/layout/cells/0', '/layout/cells/1/widget/render', '/layout/cells/3/larger_view/id', '/title'])).toEqual([0, 2]);
  });
});

describe('DashboardArea', () => {
  const renderCell = (item: DashboardCell) => <p>{item.widget.title}</p>;

  it('places every cell as one Grid item in the order of cells, with its size and height', () => {
    const { container } = render(
      <DashboardArea layout={{ flexible: false, cells: [cell(3, { size: 'large', height: 'high' }), cell(1), cell(2, { size: 'medium' })] }} renderCell={renderCell} />,
    );
    expect(container.querySelector('[data-fx-grid]')).not.toBeNull();
    expect(container.querySelector('[data-fx-grid-flexible]')).toBeNull();
    const items = [...container.querySelectorAll('[data-fx-grid-item]')];
    expect(items.map((item) => item.textContent)).toEqual(['Widget 3', 'Widget 1', 'Widget 2']);
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
    log.mockRestore();
  });

  it('renders nothing for an empty layout and announces the dashboard loader as a status', () => {
    const { container } = render(<DashboardArea layout={{ cells: [] }} renderCell={renderCell} />);
    expect(container.innerHTML).toBe('');
    render(<DashboardArea renderCell={renderCell} />);
    expect(screen.getByRole('status', { name: 'Loading dashboard' })).toBeTruthy();
  });
});
