import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { defaultGridConfig } from '@gears-frontx/ui-kit';
import { afterEach, describe, expect, it, vi } from 'vitest';

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
    // Different failures are a new check, logged again.
    rerender(<DashboardArea layout={layout} cellFailures={[0]} renderCell={renderCell} />);
    expect(log).toHaveBeenCalledTimes(2);
    log.mockRestore();
  });

  it('shows the dashboard-level cannot-be-shown state for a failure found before the layout checks', () => {
    render(<DashboardArea layout={{ cells: [cell(1)] }} failed renderCell={renderCell} />);
    expect(screen.getByText('This dashboard cannot be shown')).toBeTruthy();
    expect(screen.queryByText('Widget 1')).toBeNull();
  });

  it('does not run the layout checks on a failed dashboard, whose layout may not have the shape they read', () => {
    const log = vi.spyOn(console, 'error').mockImplementation(() => {});
    // A file that failed validation can carry anything as its layout, here one with no cells list.
    render(<DashboardArea layout={{} as DashboardLayout} failed renderCell={renderCell} />);
    expect(screen.getByText('This dashboard cannot be shown')).toBeTruthy();
    expect(log).not.toHaveBeenCalled();
    log.mockRestore();
  });

  it('keeps the layout-check console line on one line when a widget id carries control characters', () => {
    const log = vi.spyOn(console, 'error').mockImplementation(() => {});
    const forged = { size: 'small', widget: { id: `${W}x\u2028[dashboard] faked\u0085y`, title: 'Forged', render: {} } } as DashboardCell;
    render(<DashboardArea layout={{ cells: [forged, forged] }} renderCell={renderCell} />);
    const line = String(log.mock.calls[0]?.[0]);
    expect(line).toContain('x\\u2028[dashboard] faked\\u0085y repeats in cell 0 (widget), cell 1 (widget)');
    expect(line).not.toMatch(/[\u0000-\u001f\u007f-\u009f\u2028\u2029]/);
    log.mockRestore();
  });

  describe('a frameless cell breaks the cells into groups', () => {
    const heading = (n: number) => cell(n, { size: 'large', frame: false });
    const groupsOf = (layout: DashboardLayout) => {
      const { container, unmount } = render(<DashboardArea layout={layout} renderCell={renderCell} />);
      const groups = container.firstElementChild!;
      const shape = [...groups.children].map((child) =>
        child.querySelector('[data-fx-grid]') ? [...child.querySelectorAll('[data-fx-grid-item]')].map((item) => item.textContent) : child.textContent,
      );
      unmount();
      return shape;
    };

    it.each([
      ['first', [heading(1), cell(2), cell(3)], ['Widget 1', ['Widget 2', 'Widget 3']]],
      ['last', [cell(1), cell(2), heading(3)], [['Widget 1', 'Widget 2'], 'Widget 3']],
      ['in the middle', [cell(1), heading(2), cell(3)], [['Widget 1'], 'Widget 2', ['Widget 3']]],
      ['twice in a row', [cell(1), heading(2), heading(3), cell(4)], [['Widget 1'], 'Widget 2', 'Widget 3', ['Widget 4']]],
      ['as the only cell', [heading(1)], ['Widget 1']],
    ])('draws a heading %s as a block between Grids of the framed runs', (_name, cells, shape) => {
      expect(groupsOf({ cells })).toEqual(shape);
    });

    it('keeps the reading and Tab order equal to the order of cells', async () => {
      const user = userEvent.setup();
      const cells = [heading(1), cell(2), cell(3, { size: 'large' }), heading(4), heading(5), cell(6), cell(7, { size: 'medium' })];
      const { container } = render(<DashboardArea layout={{ cells }} renderCell={(item) => <button type="button">{item.widget.title}</button>} />);
      const titles = cells.map((item) => item.widget.title);
      expect([...container.querySelectorAll('button')].map((button) => button.textContent)).toEqual(titles);
      const tabbed: (string | null)[] = [];
      for (const _ of titles) {
        await user.tab();
        tabbed.push(document.activeElement!.textContent);
      }
      expect(tabbed).toEqual(titles);
    });

    it('restarts flexible filling after a break: two small cells after it fill the row as they would at the top', () => {
      const spans = (layout: DashboardLayout, ids: string[]) => {
        const { container, unmount } = render(<DashboardArea layout={layout} renderCell={renderCell} />);
        const placed = ids.map((title) => {
          const item = [...container.querySelectorAll<HTMLElement>('[data-fx-grid-item]')].find((element) => element.textContent === title)!;
          return defaultGridConfig.steps.map((step) => item.style.getPropertyValue(`--_grid-col-${step.name}`));
        });
        unmount();
        return placed;
      };
      const pair = ['Widget 3', 'Widget 4'];
      const atTop = spans({ cells: [cell(3), cell(4)] }, pair);
      expect(spans({ cells: [cell(1, { size: 'medium' }), heading(2), cell(3), cell(4)] }, pair)).toEqual(atTop);
      // Without the break the same pair continues the medium cell's row, so the break is what restarts it.
      expect(spans({ cells: [cell(1, { size: 'medium' }), cell(3), cell(4)] }, pair)).not.toEqual(atTop);
    });

    describe('the gap between the groups', () => {
      const original = globalThis.ResizeObserver;
      afterEach(() => {
        globalThis.ResizeObserver = original;
        vi.restoreAllMocks();
      });
      /** An observer that reports the given width, or never reports when it is undefined. */
      const observeAt = (width: number | undefined) => {
        globalThis.ResizeObserver = class {
          constructor(private readonly callback: ResizeObserverCallback) {}
          observe(target: Element) {
            if (width === undefined) return;
            const rect = { width, height: 320, top: 0, left: 0, right: width, bottom: 320, x: 0, y: 0 };
            this.callback([{ target, contentRect: rect } as unknown as ResizeObserverEntry], this as unknown as ResizeObserver);
          }
          unobserve() {}
          disconnect() {}
        } as unknown as typeof ResizeObserver;
      };
      const gapOf = (container: HTMLElement) => (container.firstElementChild as HTMLElement).style.getPropertyValue('--dashboard-group-gap');

      it.each([
        [1280, 'var(--grid-gap, var(--space-6))'],
        [390, 'var(--grid-gap, var(--space-4))'],
      ])('at %i px is the Grid gap of the step that width reaches', (width, gap) => {
        observeAt(width);
        const { container } = render(<DashboardArea layout={{ cells: [heading(1), cell(2)] }} renderCell={renderCell} />);
        expect(gapOf(container)).toBe(gap);
      });

      it('is set from the measured width before the observer reports, so the first frame has it', () => {
        observeAt(undefined);
        vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockReturnValue({ width: 1280, height: 0, top: 0, left: 0, right: 1280, bottom: 0, x: 0, y: 0, toJSON: () => ({}) });
        const { container } = render(<DashboardArea layout={{ cells: [heading(1), cell(2)] }} renderCell={renderCell} />);
        expect(gapOf(container)).toBe('var(--grid-gap, var(--space-6))');
      });
    });
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
