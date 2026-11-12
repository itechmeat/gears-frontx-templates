import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { VariablesBar } from './VariablesBar';

const options = (count: number) => Array.from({ length: count }, (_, index) => ({ value: `v${index}`, label: `Option ${index}` }));

describe('VariablesBar', () => {
  it('draws up to 5 options as a toggle group named and labelled by the title, the current value pressed', () => {
    const onChange = vi.fn();
    render(<VariablesBar variables={{ period: { title: 'Period', options: options(5), default: 'v0' } }} values={{ period: 'v2' }} onChange={onChange} />);
    const group = screen.getByRole('group', { name: 'Period' });
    expect(screen.getByText('Period')).toBeTruthy();
    expect(group.querySelectorAll('button')).toHaveLength(5);
    expect(screen.getByRole('button', { name: 'Option 2' }).getAttribute('aria-pressed')).toBe('true');
    fireEvent.click(screen.getByRole('button', { name: 'Option 4' }));
    expect(onChange).toHaveBeenCalledWith('period', 'v4');
    // Pressing the selected option again keeps it: a single choice is never empty.
    onChange.mockClear();
    fireEvent.click(screen.getByRole('button', { name: 'Option 2' }));
    expect(onChange).not.toHaveBeenCalled();
  });

  it('draws more than 5 options as a select with a visible label that names it', () => {
    render(<VariablesBar variables={{ team: { title: 'Team', options: options(6), default: 'v0' } }} values={{ team: 'v5' }} onChange={() => undefined} />);
    const select = screen.getByRole('combobox', { name: 'Team' });
    expect(select.textContent).toContain('Option 5');
    expect(screen.queryByRole('group', { name: 'Team' })).toBeNull();
  });

  it('draws one control per variable, in declaration order', () => {
    render(
      <VariablesBar
        variables={{ period: { title: 'Period', options: options(2), default: 'v0' }, team: { title: 'Team', options: options(8), default: 'v0' } }}
        values={{}}
        onChange={() => undefined}
      />,
    );
    expect(document.querySelectorAll('[role="group"], [role="combobox"]')).toHaveLength(2);
    expect(screen.getByRole('group', { name: 'Period' }).compareDocumentPosition(screen.getByRole('combobox', { name: 'Team' })) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });
});
