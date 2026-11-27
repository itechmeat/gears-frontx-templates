import { useState } from 'react';
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, onTestFinished, vi } from 'vitest';

import { CellFrame, DEFAULT_FRAME_TEXTS, type CellAction, type CellState } from './CellFrame';

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
    // jsdom lays nothing out: a cut text is a label whose content is wider than its box, and a node out of the page
    // measures 0, as in a browser. The widths hold for the whole test and are restored after it, also when it fails.
    const cutWidths = (cut: boolean) => {
      vi.spyOn(HTMLElement.prototype, 'scrollWidth', 'get').mockImplementation(function (this: HTMLElement) {
        return this.isConnected ? (cut ? 300 : 80) : 0;
      });
      vi.spyOn(HTMLElement.prototype, 'clientWidth', 'get').mockImplementation(function (this: HTMLElement) {
        return this.isConnected ? 80 : 0;
      });
    };
    afterEach(() => {
      vi.restoreAllMocks();
      vi.unstubAllGlobals();
      vi.useRealTimers();
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

    it('follows the badge as its width changes: a cut badge is a button, turns plain when it fits, and a button again when cut', () => {
      // Every live observer, its callback fired by the test as a resize would. A text that left the page measures 0
      // wide, as in a browser, so an observer left on the old text sees no cut.
      const live = new Set<RecordingObserver>();
      class RecordingObserver {
        readonly callback: ResizeObserverCallback;
        constructor(callback: ResizeObserverCallback) {
          this.callback = callback;
        }
        observe() {
          live.add(this);
          this.callback([], this as unknown as ResizeObserver);
        }
        unobserve() {}
        disconnect() {
          live.delete(this);
        }
      }
      vi.stubGlobal('ResizeObserver', RecordingObserver);
      const resize = () => act(() => [...live].forEach((observer) => observer.callback([], observer as unknown as ResizeObserver)));
      const line = 'Merged into the default branch over the last seven days, all repositories';
      cutWidths(true);
      render(<CellFrame title="Orders" description={line} descriptionDisplay="badge" state="shown" />);
      expect(screen.getByRole('button', { name: line })).toBeTruthy();
      expect(live.size).toBe(1);
      cutWidths(false);
      resize();
      expect(screen.queryByRole('button')).toBeNull();
      expect(screen.getByText(line).closest('button')).toBeNull();
      // The observer of the text that left the page is gone: exactly one watches the text in the page.
      expect(live.size).toBe(1);
      cutWidths(true);
      resize();
      expect(screen.getByRole('button', { name: line })).toBeTruthy();
      expect(live.size).toBe(1);
    });

    it('opens the popover of a cut badge only by a press, not when the pointer rests on the badge', async () => {
      // Fake timers, advanced far past any hover delay a popover could have. They also follow real time, as user-event
      // waits on a timer between its steps.
      vi.useFakeTimers({ shouldAdvanceTime: true });
      const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
      const line = 'Merged into the default branch over the last seven days, all repositories';
      cutWidths(true);
      render(<CellFrame title="Orders" description={line} descriptionDisplay="badge" state="shown" />);
      await user.hover(screen.getByRole('button', { name: line }));
      await act(() => vi.advanceTimersByTimeAsync(2000));
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

  // The host's own actions: plain data the frame draws as kit buttons, so the header keeps one look and one focus order.
  describe('the host actions', () => {
    const namesOf = (buttons: HTMLElement[]) => buttons.map((button) => button.getAttribute('aria-label') ?? button.textContent);
    const icon = <svg data-testid="rows-icon" />;

    it('draws two actions as buttons named by their labels, before the larger-view button and in Tab order, each run once by Enter, Space and a click', async () => {
      const user = userEvent.setup();
      const details = vi.fn();
      const rows = vi.fn();
      const actions: CellAction[] = [
        { id: 'details', label: 'Details', onSelect: details },
        { id: 'rows', label: 'Rows', onSelect: rows },
      ];
      render(
        <CellFrame title="Orders" state="shown" actions={actions} largerView={{ title: 'Orders by day', state: 'shown' }}>
          <p>chart</p>
        </CellFrame>,
      );
      const cell = screen.getByRole('group', { name: 'Orders' });
      expect(namesOf(within(cell).getAllByRole('button'))).toEqual(['Details', 'Rows', 'Open Orders larger']);
      await user.tab();
      expect(document.activeElement).toBe(within(cell).getByRole('button', { name: 'Details' }));
      await user.keyboard('{Enter}');
      expect(details).toHaveBeenCalledTimes(1);
      await user.keyboard(' ');
      expect(details).toHaveBeenCalledTimes(2);
      await user.tab();
      expect(document.activeElement).toBe(within(cell).getByRole('button', { name: 'Rows' }));
      await user.click(within(cell).getByRole('button', { name: 'Rows' }));
      expect([details.mock.calls.length, rows.mock.calls.length]).toEqual([2, 1]);
      await user.tab();
      expect(document.activeElement).toBe(within(cell).getByRole('button', { name: 'Open Orders larger' }));
      expect(screen.queryByRole('dialog')).toBeNull();
    });

    it('draws an icon action with no text, named by its label, with the label in a tooltip on hover and on keyboard focus, opened in the container', async () => {
      const user = userEvent.setup();
      const overlays = document.body.appendChild(document.createElement('div'));
      onTestFinishedRemove(overlays);
      render(
        <CellFrame title="Orders" state="shown" container={overlays} actions={[{ id: 'rows', label: 'Show the rows', icon, onSelect: () => undefined }]}>
          <p>chart</p>
        </CellFrame>,
      );
      const button = screen.getByRole('button', { name: 'Show the rows' });
      expect(button.textContent).toBe('');
      expect(within(button).getByTestId('rows-icon')).toBeTruthy();
      await user.hover(button);
      const hovered = await screen.findByText('Show the rows', undefined, { timeout: 2000 });
      expect(overlays.contains(hovered)).toBe(true);
      await user.unhover(button);
      await waitFor(() => expect(screen.queryByText('Show the rows')).toBeNull(), { timeout: 2000 });
      await user.tab();
      expect(document.activeElement).toBe(button);
      const focused = await screen.findByText('Show the rows', undefined, { timeout: 2000 });
      expect(overlays.contains(focused)).toBe(true);
    });

    it('gives the larger-view button the same tooltip, with its accessible name, in the larger view\'s container', async () => {
      const user = userEvent.setup();
      const overlays = document.body.appendChild(document.createElement('div'));
      onTestFinishedRemove(overlays);
      render(<CellFrame title="Orders" state="shown" largerView={{ title: 'Orders by day', state: 'shown', container: overlays }} />);
      const button = screen.getByRole('button', { name: 'Open Orders larger' });
      expect(button.textContent).toBe('');
      await user.hover(button);
      const tip = await screen.findByText('Open Orders larger', undefined, { timeout: 2000 });
      expect(overlays.contains(tip)).toBe(true);
      // The trigger still opens the larger view.
      await user.click(button);
      expect(await screen.findByRole('dialog', { name: 'Orders by day' })).toBeTruthy();
    });

    it('draws the larger view\'s own actions in the overlay header under its title, and keeps the overlay open after one runs', async () => {
      const user = userEvent.setup();
      const rows = vi.fn();
      render(<CellFrame title="Orders" state="shown" largerView={{ title: 'Orders by day', state: 'shown', content: <p>large chart</p>, actions: [{ id: 'rows', label: 'Rows', onSelect: rows }] }} />);
      expect(namesOf(screen.getAllByRole('button'))).toEqual(['Open Orders larger']);
      await user.click(screen.getByRole('button', { name: 'Open Orders larger' }));
      const dialog = await screen.findByRole('dialog', { name: 'Orders by day' });
      const action = within(dialog).getByRole('button', { name: 'Rows' });
      // In the header, after the title, before the body.
      expect(within(dialog).getByText('Orders by day').compareDocumentPosition(action) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
      expect(action.compareDocumentPosition(within(dialog).getByText('large chart')) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
      await user.click(action);
      expect(rows).toHaveBeenCalledTimes(1);
      expect(screen.getByRole('dialog', { name: 'Orders by day' })).toBeTruthy();
    });

    it('puts the actions between the description badge and the larger-view button', () => {
      render(
        <CellFrame title="Orders" description="Last 30 days" descriptionDisplay="badge" state="shown" actions={[{ id: 'rows', label: 'Rows', onSelect: () => undefined }]} largerView={{ title: 'Orders by day', state: 'shown' }} />,
      );
      const [badge, rows, larger] = [screen.getByText('Last 30 days'), screen.getByRole('button', { name: 'Rows' }), screen.getByRole('button', { name: 'Open Orders larger' })];
      const follows = (first: Element, second: Element) => Boolean(first.compareDocumentPosition(second) & Node.DOCUMENT_POSITION_FOLLOWING);
      expect([follows(badge, rows), follows(rows, larger)]).toEqual([true, true]);
      // One group of actions on the title's row holds all three.
      const group = rows.parentElement!.parentElement!;
      expect([group.contains(badge), group.contains(larger)]).toEqual([true, true]);
    });

    it.each([
      ['no actions', undefined],
      ['an empty list', []],
    ])('draws no control of the host for %s, and the header as without the prop', async (_case, actions) => {
      const { container } = render(<CellFrame title="Orders" state="shown" actions={actions} largerView={{ title: 'Orders by day', state: 'shown' }} />);
      const plain = render(<CellFrame title="Orders" state="shown" largerView={{ title: 'Orders by day', state: 'shown' }} />);
      // The kit's generated ids differ between two renders; the markup is otherwise the same.
      const markup = (element: HTMLElement) => element.innerHTML.replace(/base-ui-[\w-]+/g, 'id');
      expect(markup(container)).toBe(markup(plain.container));
    });

    it('opens the tooltip of an icon action in the open larger view inside the larger view\'s container', async () => {
      const user = userEvent.setup();
      const overlays = document.body.appendChild(document.createElement('div'));
      onTestFinishedRemove(overlays);
      render(<CellFrame title="Orders" state="shown" largerView={{ title: 'Orders by day', state: 'shown', container: overlays, actions: [{ id: 'rows', label: 'Show the rows', icon, onSelect: () => undefined }] }} />);
      await user.click(screen.getByRole('button', { name: 'Open Orders larger' }));
      const dialog = await screen.findByRole('dialog', { name: 'Orders by day' });
      expect(overlays.contains(dialog)).toBe(true);
      await user.hover(within(dialog).getByRole('button', { name: 'Show the rows' }));
      const tip = await screen.findByText('Show the rows', undefined, { timeout: 2000 });
      expect(overlays.contains(tip)).toBe(true);
    });

    it('opens the header\'s tooltips in the larger view\'s container without container, and the larger view\'s in container without its own', async () => {
      const user = userEvent.setup();
      const larger = document.body.appendChild(document.createElement('div'));
      onTestFinishedRemove(larger);
      const actions: CellAction[] = [{ id: 'rows', label: 'Show the rows', icon, onSelect: () => undefined }];
      const first = render(<CellFrame title="Orders" state="shown" actions={actions} largerView={{ title: 'Orders by day', state: 'shown', container: larger }} />);
      await user.hover(screen.getByRole('button', { name: 'Show the rows' }));
      expect(larger.contains(await screen.findByText('Show the rows', undefined, { timeout: 2000 }))).toBe(true);
      first.unmount();
      const cell = document.body.appendChild(document.createElement('div'));
      onTestFinishedRemove(cell);
      render(<CellFrame title="Orders" state="shown" container={cell} largerView={{ title: 'Orders by day', state: 'shown', actions }} />);
      const open = screen.getByRole('button', { name: 'Open Orders larger' });
      await user.hover(open);
      expect(cell.contains(await screen.findByText('Open Orders larger', undefined, { timeout: 2000 }))).toBe(true);
      await user.click(open);
      const dialog = await screen.findByRole('dialog', { name: 'Orders by day' });
      await user.hover(within(dialog).getByRole('button', { name: 'Show the rows' }));
      expect(cell.contains(await screen.findByText('Show the rows', undefined, { timeout: 2000 }))).toBe(true);
    });

    it('shows the whole label of a text action in a tooltip on hover and on keyboard focus, and names the button by its label once', async () => {
      const user = userEvent.setup();
      const overlays = document.body.appendChild(document.createElement('div'));
      onTestFinishedRemove(overlays);
      const label = 'Show every row of the table behind this widget';
      render(<CellFrame title="Orders" state="shown" container={overlays} actions={[{ id: 'rows', label, onSelect: () => undefined }]} />);
      const button = screen.getByRole('button', { name: label });
      expect(button.textContent).toBe(label);
      expect(button.hasAttribute('aria-label')).toBe(false);
      await user.hover(button);
      await waitFor(() => expect(overlays.textContent).toBe(label), { timeout: 2000 });
      // The tooltip is not tied to the button as its description, so a screen reader hears the name once.
      expect(button.hasAttribute('aria-describedby')).toBe(false);
      await user.unhover(button);
      await waitFor(() => expect(overlays.textContent).toBe(''), { timeout: 2000 });
      await user.tab();
      expect(document.activeElement).toBe(button);
      await waitFor(() => expect(overlays.textContent).toBe(label), { timeout: 2000 });
    });

    it('draws the actions of a cell with no title, description or larger view, and none in a frameless cell', () => {
      const actions = [{ id: 'rows', label: 'Rows', onSelect: () => undefined }];
      const { rerender } = render(<CellFrame state="shown" actions={actions} />);
      expect(namesOf(screen.getAllByRole('button'))).toEqual(['Rows']);
      rerender(<CellFrame frame={false} state="shown" actions={actions} />);
      expect(screen.queryByRole('button')).toBeNull();
    });
  });
});

/** Removes an element the test put on the page once the test ends, also when it fails. */
const onTestFinishedRemove = (element: HTMLElement) => onTestFinished(() => element.remove());
