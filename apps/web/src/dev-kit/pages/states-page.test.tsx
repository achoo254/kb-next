import { fireEvent, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { renderWithI18n } from '../../test/render';
import { StatesPage } from './states-page';

describe('StatesPage', () => {
  it('lays out the 18 state cards with their board codes', () => {
    renderWithI18n(<StatesPage />);
    expect(document.querySelector('[data-screen="X03-StatesCoverage"]')).not.toBeNull();
    expect(document.querySelectorAll('.x03-card')).toHaveLength(18);
    expect(document.querySelectorAll('.x03-card-full')).toHaveLength(3);
    const permission = screen.getByRole('region', { name: 'Permission changed' });
    expect(permission.textContent).toContain('C18');
    expect(permission.textContent).toContain('mẫu đầy đủ');
  });

  it('walks the retry sample through its steps and resets it', () => {
    renderWithI18n(<StatesPage />);
    const card = screen.getByRole('region', { name: 'Retry recover' });
    expect(card.textContent).toContain('Gửi bài thất bại');
    fireEvent.click(screen.getByRole('button', { name: 'Thử lại ngay' }));
    expect(card.textContent).toContain('Đang thử lại…');
    fireEvent.click(screen.getByRole('button', { name: 'Đang thử…' }));
    expect(card.textContent).toContain('Đã khôi phục');
    fireEvent.click(screen.getByRole('button', { name: 'Xem bài' }));
    expect(card.textContent).toContain('Đã khôi phục');
    fireEvent.click(screen.getByRole('button', { name: 'Đặt lại demo' }));
    expect(card.textContent).toContain('Gửi bài thất bại');
  });
});
