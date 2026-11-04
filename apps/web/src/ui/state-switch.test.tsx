import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { StateSwitch } from './state-switch';

describe('StateSwitch', () => {
  it('marks the shown state pressed and reports a pick', () => {
    const onChange = vi.fn();
    const options = [
      { id: 'loading', label: 'Đang tải' },
      { id: 'empty', label: 'Trống' },
    ];
    render(<StateSwitch label="Trạng thái" options={options} value="loading" onChange={onChange} />);
    expect(screen.getByRole('group', { name: 'Trạng thái' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Đang tải' }).getAttribute('aria-pressed')).toBe('true');
    fireEvent.click(screen.getByRole('button', { name: 'Trống' }));
    expect(onChange).toHaveBeenCalledWith('empty');
  });
});
