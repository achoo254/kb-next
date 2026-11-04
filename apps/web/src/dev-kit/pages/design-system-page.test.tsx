import { fireEvent, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { renderWithI18n } from '../../test/render';
import { setTheme } from '../../ui/theme';
import { DesignSystemPage } from './design-system-page';

describe('DesignSystemPage', () => {
  afterEach(() => setTheme(null));

  it('lays out the board and switches the theme from its toggle', () => {
    renderWithI18n(<DesignSystemPage />);
    expect(document.querySelector('[data-screen="DesignSystem"]')).not.toBeNull();
    expect(screen.getByRole('region', { name: 'Bộ thành phần Universe' })).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Đổi giao diện sáng tối' }));
    expect(document.documentElement.dataset.theme).toBe('light');
  });

  it('toggles the toast sample', () => {
    renderWithI18n(<DesignSystemPage />);
    expect(screen.getByRole('status').textContent).toContain('Đã lưu vào thùng rác');
    fireEvent.click(screen.getByRole('button', { name: 'Hiện toast' }));
    expect(screen.queryByText('Đã lưu vào thùng rác')).toBeNull();
  });
});
