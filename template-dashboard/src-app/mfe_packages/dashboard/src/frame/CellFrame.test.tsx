import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import { CellFrame } from './CellFrame';

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

  it('shows the larger-view widget\'s own description under the overlay title', async () => {
    const user = userEvent.setup();
    render(<CellFrame title="Orders" description="Cell line" state="shown" largerView={{ title: 'Orders by day', description: 'Overlay line', state: 'shown' }} />);
    await user.click(screen.getByRole('button', { name: 'Open Orders larger' }));
    const dialog = await screen.findByRole('dialog', { name: 'Orders by day', description: 'Overlay line' });
    expect(within(dialog).queryByText('Cell line')).toBeNull();
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
