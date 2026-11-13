import { useState } from 'react';
import { act, fireEvent, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import { CellFrame, DEFAULT_FRAME_TEXTS, type CellState } from './CellFrame';

describe('CellFrame', () => {
  it('announces the loader as a status and marks the cell busy', () => {
    const { container } = render(<CellFrame title="Orders" state="loading" />);
    expect(screen.getByRole('status', { name: 'Loading' })).toBeTruthy();
    expect(container.querySelector('[aria-busy="true"]')).not.toBeNull();
  });

  it('shows the cannot-be-shown text with its own wording', () => {
    render(<CellFrame title="Orders" state="cannot-be-shown" />);
    expect(screen.getByText('This widget cannot be shown')).toBeTruthy();
    expect(screen.queryByRole('status')).toBeNull();
  });

  it('shows the widget with the title and no larger-view button when the cell has no larger view', () => {
    render(
      <CellFrame title="Orders" state="shown">
        <p>chart</p>
      </CellFrame>,
    );
    expect(screen.getByText('Orders')).toBeTruthy();
    expect(screen.getByText('chart')).toBeTruthy();
    expect(screen.queryByRole('button')).toBeNull();
  });

  it('opens the larger view as a dialog named by its title and returns focus to its button on close', async () => {
    const user = userEvent.setup();
    const onOpenChange = vi.fn();
    render(
      <CellFrame title="Orders" state="shown" largerView={{ title: 'Orders by day', state: 'shown', content: <p>large chart</p>, onOpenChange }}>
        <p>chart</p>
      </CellFrame>,
    );
    const button = screen.getByRole('button', { name: 'Open Orders larger' });
    await user.click(button);
    const dialog = await screen.findByRole('dialog', { name: 'Orders by day' });
    expect(dialog.getAttribute('aria-modal')).toBe('true');
    expect(dialog.textContent).toContain('large chart');
    expect(onOpenChange).toHaveBeenLastCalledWith(true);
    await user.keyboard('{Escape}');
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(onOpenChange).toHaveBeenLastCalledWith(false);
    expect(document.activeElement).toBe(button);
  });

  it('closes the larger view with its close button', async () => {
    const user = userEvent.setup();
    render(<CellFrame title="Orders" state="shown" largerView={{ title: 'Orders by day', state: 'shown', content: <p>large chart</p> }} />);
    const button = screen.getByRole('button', { name: 'Open Orders larger' });
    await user.click(button);
    await user.click(within(await screen.findByRole('dialog')).getByRole('button', { name: 'Close' }));
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(document.activeElement).toBe(button);
  });

  it('shows the description under the title on one line, with the full text in its title attribute', () => {
    const line = 'Merged into the default branch, last 7 days';
    render(<CellFrame title="Orders" description={line} state="shown" />);
    const description = screen.getByText(line);
    expect(description.getAttribute('title')).toBe(line);
    expect(description.previousElementSibling?.textContent).toBe('Orders');
    expect(description.className).toContain('description');
  });

  it('keeps the header of a titled cell without a description exactly as the title alone', () => {
    // The header markup of a titled cell is the title element alone, with or without an empty description.
    const headerOf = (description?: string) => {
      const { unmount } = render(<CellFrame title="Orders" description={description} state="shown" />);
      const header = screen.getByText('Orders').parentElement!;
      const markup = { children: header.children.length, html: header.innerHTML };
      unmount();
      return markup;
    };
    const alone = headerOf();
    expect(alone.children).toBe(1);
    expect(headerOf('')).toEqual(alone);
    expect(headerOf('A line').children).toBe(2);
  });

  it('shows the description of a cell without a title, with no empty title element', () => {
    render(<CellFrame description="Only a line" state="shown" />);
    const description = screen.getByText('Only a line');
    // The header holds the description alone: no title element, empty or not, sits before it.
    expect(description.parentElement!.children).toHaveLength(1);
    expect(description.className).toContain('description');
  });

  it('shows the larger-view widget\'s own description under the overlay title', async () => {
    const user = userEvent.setup();
    render(<CellFrame title="Orders" description="Cell line" state="shown" largerView={{ title: 'Orders by day', description: 'Overlay line', state: 'shown' }} />);
    await user.click(screen.getByRole('button', { name: 'Open Orders larger' }));
    const dialog = await screen.findByRole('dialog', { name: 'Orders by day', description: 'Overlay line' });
    expect(within(dialog).queryByText('Cell line')).toBeNull();
  });

  describe('the retry button', () => {
    it('shows under the cannot-be-shown text only with onRetry, is reached by Tab and runs on Enter and a click', async () => {
      const user = userEvent.setup();
      const onRetry = vi.fn();
      const { rerender } = render(<CellFrame title="Orders" state="cannot-be-shown" />);
      expect(screen.queryByRole('button')).toBeNull();
      rerender(<CellFrame title="Orders" state="cannot-be-shown" onRetry={onRetry} />);
      const button = screen.getByRole('button', { name: 'Try again to load Orders' });
      expect(button.textContent).toBe('Try again');
      expect(button.previousElementSibling?.textContent).toBe('This widget cannot be shown');
      await user.tab();
      expect(document.activeElement).toBe(button);
      await user.keyboard('{Enter}');
      await user.click(button);
      expect(onRetry).toHaveBeenCalledTimes(2);
    });

    it('shows no button in the loading or shown state even with onRetry', () => {
      const { rerender } = render(<CellFrame state="loading" onRetry={() => undefined} />);
      expect(screen.queryByRole('button')).toBeNull();
      rerender(<CellFrame state="shown" onRetry={() => undefined} />);
      expect(screen.queryByRole('button')).toBeNull();
    });

    it('takes its text and name from the host texts, and the default when host texts written before it have none', () => {
      const { retry: _retry, ...older } = DEFAULT_FRAME_TEXTS;
      const { rerender } = render(<CellFrame state="cannot-be-shown" onRetry={() => undefined} texts={{ ...DEFAULT_FRAME_TEXTS, retry: 'Erneut versuchen' }} />);
      expect(screen.getByRole('button', { name: 'Erneut versuchen' })).toBeTruthy();
      rerender(<CellFrame state="cannot-be-shown" onRetry={() => undefined} texts={older} />);
      expect(screen.getByRole('button', { name: 'Try again' })).toBeTruthy();
    });

    it('names the button by the cell title, and plainly in a cell without one', () => {
      const { rerender } = render(<CellFrame title="Orders" state="cannot-be-shown" onRetry={() => undefined} />);
      expect(screen.getByRole('button', { name: 'Try again to load Orders' })).toBeTruthy();
      rerender(<CellFrame state="cannot-be-shown" onRetry={() => undefined} />);
      expect(screen.getByRole('button', { name: 'Try again' }).getAttribute('aria-label')).toBeNull();
    });

    it('falls back to the default for blank host texts, and names by the host text alone when the host gives no retryNamed', () => {
      const { retryNamed: _named, ...withoutNamed } = DEFAULT_FRAME_TEXTS;
      const { rerender } = render(<CellFrame title="Orders" state="cannot-be-shown" onRetry={() => undefined} texts={{ ...withoutNamed, retry: '  ' }} />);
      expect(screen.getByRole('button', { name: 'Try again to load Orders' }).textContent).toBe('Try again');
      rerender(<CellFrame title="Orders" state="cannot-be-shown" onRetry={() => undefined} texts={{ ...withoutNamed, retry: 'Erneut versuchen' }} />);
      expect(screen.getByRole('button', { name: 'Erneut versuchen' })).toBeTruthy();
      rerender(<CellFrame title="Orders" state="cannot-be-shown" onRetry={() => undefined} texts={{ ...DEFAULT_FRAME_TEXTS, retry: 'Erneut versuchen', retryNamed: (title) => `Erneut versuchen: ${title}` }} />);
      expect(screen.getByRole('button', { name: 'Erneut versuchen: Orders' }).textContent).toBe('Erneut versuchen');
      rerender(<CellFrame title="Orders" state="cannot-be-shown" onRetry={() => undefined} texts={{ ...DEFAULT_FRAME_TEXTS, retryNamed: () => ' ' }} />);
      expect(screen.getByRole('button', { name: 'Try again' })).toBeTruthy();
    });

    it.each([
      ['framed', true],
      ['frameless', false],
    ])('keeps focus in the %s cell across a retry: on the cell while it loads, then on the new button when it fails again', async (_name, frame) => {
      const user = userEvent.setup();
      const Harness = () => {
        const [state, setState] = useState<CellState>('cannot-be-shown');
        return (
          <>
            <CellFrame frame={frame} title={frame ? 'Orders' : undefined} state={state} onRetry={() => setState('loading')} />
            <button type="button" onClick={() => setState('cannot-be-shown')}>
              fail
            </button>
          </>
        );
      };
      const { container } = render(<Harness />);
      const cell = container.querySelector<HTMLElement>('[data-cell-frame]')!;
      await user.tab();
      await user.keyboard('{Enter}');
      expect(screen.getByRole('status', { name: 'Loading' })).toBeTruthy();
      expect(document.activeElement).toBe(cell);
      if (frame) expect(cell.getAttribute('aria-label')).toBe('Orders');
      // The failure arrives while focus is still on the cell: it moves to the new button.
      fireEvent.click(screen.getByRole('button', { name: 'fail' }));
      expect(document.activeElement).toBe(screen.getByRole('button', { name: frame ? 'Try again to load Orders' : 'Try again' }));
    });

    it('keeps focus on the cell when the retry shows the widget, and leaves focus the viewer moved elsewhere', async () => {
      const user = userEvent.setup();
      let set: (state: CellState) => void = () => undefined;
      const Harness = () => {
        const [state, setState] = useState<CellState>('cannot-be-shown');
        set = setState;
        return (
          <>
            <CellFrame title="Orders" state={state} onRetry={() => setState('loading')}>
              <p>chart</p>
            </CellFrame>
            <button type="button">elsewhere</button>
          </>
        );
      };
      const { container } = render(<Harness />);
      const cell = container.querySelector<HTMLElement>('[data-cell-frame]')!;
      await user.click(screen.getByRole('button', { name: 'Try again to load Orders' }));
      expect(document.activeElement).toBe(cell);
      act(() => set('shown'));
      expect(screen.getByText('chart')).toBeTruthy();
      expect(document.activeElement).toBe(cell);
      // A second round where the viewer moves on before the failure: focus stays where they put it.
      act(() => set('cannot-be-shown'));
      await user.click(screen.getByRole('button', { name: 'Try again to load Orders' }));
      screen.getByRole('button', { name: 'elsewhere' }).focus();
      act(() => set('cannot-be-shown'));
      expect(document.activeElement).toBe(screen.getByRole('button', { name: 'elsewhere' }));
    });

    it('shows in a frameless cell too', () => {
      render(<CellFrame frame={false} state="cannot-be-shown" onRetry={() => undefined} />);
      expect(screen.getByRole('button', { name: 'Try again' })).toBeTruthy();
    });
  });

  describe('frame false', () => {
    it('draws the widget with no card, no header and no larger-view button', () => {
      const { container } = render(
        <CellFrame frame={false} title="Orders" description="Line" state="shown" largerView={{ title: 'Orders by day', state: 'shown' }}>
          <h2>Section</h2>
        </CellFrame>,
      );
      const outer = container.firstElementChild!;
      expect(outer.getAttribute('data-cell-frame')).toBe('none');
      expect(container.querySelector('[data-cell-frame="card"]')).toBeNull();
      expect(screen.queryByText('Orders')).toBeNull();
      expect(screen.queryByText('Line')).toBeNull();
      expect(screen.queryByRole('button')).toBeNull();
      expect(screen.getByRole('heading', { level: 2, name: 'Section' })).toBeTruthy();
    });

    it('keeps the loader, announced as a status, with the cell busy', () => {
      const { container } = render(<CellFrame frame={false} state="loading" />);
      expect(screen.getByRole('status', { name: 'Loading' })).toBeTruthy();
      expect(container.firstElementChild!.getAttribute('aria-busy')).toBe('true');
      expect(container.querySelector('[data-cell-frame="card"]')).toBeNull();
    });

    it('keeps the cannot-be-shown text', () => {
      const { container } = render(<CellFrame frame={false} state="cannot-be-shown" />);
      expect(screen.getByText('This widget cannot be shown')).toBeTruthy();
      expect(container.querySelector('[data-cell-frame="card"]')).toBeNull();
    });

    it('draws the card as before when frame is true', () => {
      const { container } = render(<CellFrame frame title="Orders" state="shown" />);
      expect(container.querySelector('[data-cell-frame="card"]')).not.toBeNull();
      expect(screen.getByText('Orders')).toBeTruthy();
    });
  });

  it('shows the cannot-be-shown state in the overlay only', async () => {
    const user = userEvent.setup();
    render(
      <CellFrame title="Orders" state="shown" largerView={{ title: 'Orders by day', state: 'cannot-be-shown' }}>
        <p>chart</p>
      </CellFrame>,
    );
    await user.click(screen.getByRole('button', { name: 'Open Orders larger' }));
    const dialog = await screen.findByRole('dialog');
    expect(dialog.textContent).toContain('This widget cannot be shown');
    expect(screen.getByText('chart')).toBeTruthy();
  });
});
