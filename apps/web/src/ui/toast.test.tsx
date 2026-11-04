import { fireEvent, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { renderWithI18n } from '../test/render';
import { Toast } from './toast';

describe('Toast', () => {
  it('announces the message and offers undo and close', () => {
    const onUndo = vi.fn();
    const onClose = vi.fn();
    renderWithI18n(<Toast tone="undo" message='Đã xoá "Ghi chú: ARP"' onUndo={onUndo} onClose={onClose} />);
    expect(screen.getByRole('status').textContent).toContain('Đã xoá "Ghi chú: ARP"');
    fireEvent.click(screen.getByRole('button', { name: 'Undo' }));
    fireEvent.click(screen.getByRole('button', { name: 'Dismiss notification' }));
    expect(onUndo).toHaveBeenCalledOnce();
    expect(onClose).toHaveBeenCalledOnce();
  });

  it('shows neither action when there is nothing to undo or close', () => {
    renderWithI18n(<Toast tone="success" variant="row" message="Đã đăng" />);
    expect(screen.queryByRole('button')).toBeNull();
    expect(screen.getByRole('status').dataset.variant).toBe('row');
  });
});
