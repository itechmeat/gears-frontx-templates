import { useState } from 'react';
import { act, fireEvent, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';

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
    expect(description.className).toContain('descriptionLine');
    expect(screen.queryByText(line, { selector: 'span' })).toBeNull();
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
    expect(description.className).toContain('descriptionLine');
    expect(screen.queryByText('Only a line', { selector: 'span' })).toBeNull();
  });

  it.each([
    ['without cardSize', {}, true],
    ['with cardSize sm', { cardSize: 'sm' as const }, true],
    ['with cardSize default', { cardSize: 'default' as const }, false],
  ])('draws a card of the kit size the frame asks %s', (_name, props, small) => {
    const { container } = render(<CellFrame title="Orders" state="shown" {...props} />);
    // The kit Card marks its small size with its own size class.
    expect(/sizeSm/.test(container.querySelector('[data-cell-frame="card"]')!.className)).toBe(small);
  });

  it.each([
    ['without cardSize', {}, false],
    ['with cardSize default', { cardSize: 'default' as const }, true],
  ])('starts a frameless cell where the cards of its size start their content %s', (_name, props, wide) => {
    const { container } = render(<CellFrame frame={false} state="shown" {...props} />);
    const frameless = container.querySelector('[data-cell-frame="none"]')!;
    expect(frameless.className).toContain('frameless');
    expect(frameless.className.includes('framelessDefault')).toBe(wide);
  });

  describe('with descriptionDisplay badge', () => {
    // jsdom lays nothing out: a cut text is a label whose content is wider than its box. The widths hold for the
    // whole test and are restored after it, also when it fails.
    const cutWidths = (cut: boolean) => {
      vi.spyOn(HTMLElement.prototype, 'scrollWidth', 'get').mockReturnValue(cut ? 300 : 80);
      vi.spyOn(HTMLElement.prototype, 'clientWidth', 'get').mockReturnValue(80);
    };
    afterEach(() => {
      vi.restoreAllMocks();
      vi.unstubAllGlobals();
    });

    it('shows the description as a badge beside the cell actions, on the title row, and no line under the title', () => {
      const line = 'Merged into the default branch, last 7 days';
      render(<CellFrame title="Orders" description={line} descriptionDisplay="badge" state="shown" largerView={{ title: 'Orders by day', state: 'shown' }} />);
      const badge = screen.getByText(line).parentElement!;
      expect(badge.className).toContain('description');
      // The badge and the larger-view button stand in one group after the title, so the description takes no line of its own.
      const larger = screen.getByRole('button', { name: 'Open Orders larger' });
      expect(badge.parentElement).toBe(larger.parentElement);
      expect(badge.nextElementSibling).toBe(larger);
      expect(badge.parentElement!.previousElementSibling?.textContent).toBe('Orders');
      expect(badge.parentElement!.parentElement!.children).toHaveLength(2);
    });

    it('shows the description badge of a cell without a larger view in the same place', () => {
      render(<CellFrame title="Orders" description="All time" descriptionDisplay="badge" state="shown" />);
      const badge = screen.getByText('All time').parentElement!;
      expect(badge.parentElement!.children).toHaveLength(1);
      expect(badge.parentElement!.previousElementSibling?.textContent).toBe('Orders');
    });

    it('shows the badge of a cell without a title, with no empty title element', () => {
      render(<CellFrame description="Only a line" descriptionDisplay="badge" state="shown" />);
      const badge = screen.getByText('Only a line').parentElement!;
      // The header holds the badge's group alone: no title element, empty or not, sits before it.
      expect(badge.parentElement!.parentElement!.children).toHaveLength(1);
    });

    it.each([
      ['a titled cell keeps half the header for its title', 'Orders', 'badgeHeader'],
      ['a cell without a title gives the badge the empty title column', undefined, 'badgeHeaderUntitled'],
    ])('lays the badge header out by whether the cell has a title: %s', (_name, title, kept) => {
      // jsdom lays nothing out; the header's columns come from the class it gets.
      render(<CellFrame title={title} description="Only a line" descriptionDisplay="badge" state="shown" largerView={{ title: 'Orders by day', state: 'shown' }} />);
      const header = screen.getByText('Only a line').closest('[class~="actions"]')!.parentElement!;
      const other = kept === 'badgeHeader' ? 'badgeHeaderUntitled' : 'badgeHeader';
      expect(header.classList.contains(kept)).toBe(true);
      expect(header.classList.contains(other)).toBe(false);
    });

    it('keeps a text that fits a plain badge, with no button and no tab stop', () => {
      cutWidths(false);
      render(<CellFrame title="Orders" description="All time" descriptionDisplay="badge" state="shown" />);
      expect(screen.queryByRole('button')).toBeNull();
      expect(screen.getByText('All time').closest('button')).toBeNull();
    });

    it('makes a cut badge a button that opens the whole text, named by the cell title, by Enter and by a click, and returns focus to it on Escape', async () => {
      const user = userEvent.setup();
      const line = 'Merged into the default branch over the last seven days, all repositories';
      cutWidths(true);
      render(<CellFrame title="Orders" description={line} descriptionDisplay="badge" state="shown" />);
      const button = screen.getByRole('button', { name: line });
      await user.tab();
      expect(document.activeElement).toBe(button);
      await user.keyboard('{Enter}');
      expect((await screen.findByRole('dialog', { name: 'Orders' })).textContent).toBe(line);
      await user.keyboard('{Escape}');
      await vi.waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
      await vi.waitFor(() => expect(document.activeElement).toBe(button));
      await user.click(button);
      expect((await screen.findByRole('dialog', { name: 'Orders' })).textContent).toBe(line);
    });

    it('names the popover of a cut badge in a cell without a title by the frame text, the default or the host one', async () => {
      const user = userEvent.setup();
      const line = 'Merged into the default branch over the last seven days, all repositories';
      cutWidths(true);
      const { unmount } = render(<CellFrame description={line} descriptionDisplay="badge" state="shown" />);
      await user.click(screen.getByRole('button', { name: line }));
      expect((await screen.findByRole('dialog', { name: 'Description' })).textContent).toBe(line);
      unmount();
      render(<CellFrame description={line} descriptionDisplay="badge" state="shown" texts={{ ...DEFAULT_FRAME_TEXTS, description: 'Beschreibung' }} />);
      await user.click(screen.getByRole('button', { name: line }));
      expect((await screen.findByRole('dialog', { name: 'Beschreibung' })).textContent).toBe(line);
    });

    it('follows the badge text that is in the page when a cut badge turns into a button, and turns plain again when it fits', () => {
      // Records what each live observer watches, so the test sees whether the observed text is the one on the page.
      const watched = new Map<object, { target: Element; callback: ResizeObserverCallback }>();
      class RecordingObserver {
        private readonly callback: ResizeObserverCallback;
        constructor(callback: ResizeObserverCallback) {
          this.callback = callback;
        }
        observe(target: Element) {
          watched.set(this, { target, callback: this.callback });
          this.callback([], this as unknown as ResizeObserver);
        }
        unobserve() {}
        disconnect() {
          watched.delete(this);
        }
      }
      vi.stubGlobal('ResizeObserver', RecordingObserver);
      const line = 'Merged into the default branch over the last seven days, all repositories';
      cutWidths(true);
      render(<CellFrame title="Orders" description={line} descriptionDisplay="badge" state="shown" />);
      // One observer, on the very node in the page (`toBe`: a detached copy of the text would be an equal node).
      const targets = () => [...watched.values()].map((entry) => entry.target);
      expect(targets()).toHaveLength(1);
      expect(targets()[0]).toBe(screen.getByRole('button', { name: line }).firstElementChild);
      cutWidths(false);
      act(() => [...watched.values()].forEach((entry) => entry.callback([], {} as ResizeObserver)));
      expect(screen.queryByRole('button')).toBeNull();
      expect(targets()).toHaveLength(1);
      expect(targets()[0]).toBe(screen.getByText(line));
    });

    it('opens the popover of a cut badge only by a press, not when the pointer rests on the badge', async () => {
      const user = userEvent.setup();
      const line = 'Merged into the default branch over the last seven days, all repositories';
      cutWidths(true);
      render(<CellFrame title="Orders" description={line} descriptionDisplay="badge" state="shown" />);
      await user.hover(screen.getByRole('button', { name: line }));
      await new Promise((resolve) => setTimeout(resolve, 400));
      expect(screen.queryByRole('dialog')).toBeNull();
    });
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

    it('leaves focus on a host-page control when the dashboard sits in a shadow root', async () => {
      const host = document.createElement('div');
      const outside = document.createElement('button');
      outside.textContent = 'host control';
      document.body.append(host, outside);
      const mount = document.createElement('div');
      host.attachShadow({ mode: 'open' }).append(mount);
      let set: (state: CellState) => void = () => undefined;
      const Harness = () => {
        const [state, setState] = useState<CellState>('cannot-be-shown');
        set = setState;
        return <CellFrame title="Orders" state={state} onRetry={() => setState('loading')} />;
      };
      const { unmount } = render(<Harness />, { container: mount });
      try {
        const cell = mount.querySelector<HTMLElement>('[data-cell-frame]')!;
        fireEvent.click(within(mount).getByRole('button', { name: 'Try again to load Orders' }));
        outside.focus();
        expect(document.activeElement).toBe(outside);
        act(() => set('cannot-be-shown'));
        expect(document.activeElement).toBe(outside);
        expect(cell.isConnected).toBe(true);
      } finally {
        unmount();
        host.remove();
        outside.remove();
      }
    });

    it('forgets a retry that changed nothing, so a later change of the cell leaves focus alone', () => {
      let set: (state: CellState) => void = () => undefined;
      const Harness = () => {
        const [state, setState] = useState<CellState>('cannot-be-shown');
        set = setState;
        return <CellFrame title="Orders" state={state} onRetry={() => undefined} />;
      };
      render(<Harness />);
      const button = screen.getByRole('button', { name: 'Try again to load Orders' });
      button.focus();
      fireEvent.click(button);
      button.blur();
      expect(document.activeElement).toBe(document.body);
      // A change the retry did not cause: a re-run after a variable change, then its widget.
      act(() => set('loading'));
      act(() => set('shown'));
      expect(document.activeElement).toBe(document.body);
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
