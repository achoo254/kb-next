import { fireEvent, screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { renderWithI18n } from '../../test/render';
import { InteractionPage } from './interaction-page';

describe('InteractionPage', () => {
  it('lays out the board: layers, Copilot bar, four sections', () => {
    renderWithI18n(<InteractionPage />);
    expect(document.querySelector('[data-screen="Interaction"]')).not.toBeNull();
    const nav = screen.getByRole('region', { name: 'Kiến trúc điều hướng nhiều lớp' });
    expect(nav.querySelector('[data-id="ix-layer-universe"]')?.getAttribute('href')).toBe('/u');
    expect(within(nav).getByRole('link', { name: /AI Copilot/ }).getAttribute('href')).toBe('/copilot');
    for (const name of ['Năm tầng thu phóng', 'Hiển thị hybrid', 'Tương tác và phím tắt', 'Animation · thử ngay']) {
      expect(screen.getByRole('region', { name })).toBeTruthy();
    }
  });

  it('flies to the picked zoom level', () => {
    renderWithI18n(<InteractionPage />);
    expect(screen.getByRole('tabpanel', { name: 'Thiên hà · toàn bộ Universe' })).toBeTruthy();
    fireEvent.click(screen.getByRole('tab', { name: 'Bề mặt' }));
    expect(screen.getByRole('tab', { name: 'Bề mặt' }).getAttribute('aria-selected')).toBe('true');
    expect(screen.getByText('Bề mặt · mở Document')).toBeTruthy();
  });

  it('switches the hybrid view and its note', () => {
    renderWithI18n(<InteractionPage />);
    expect(screen.getByText('DHCP', { selector: '.kf-planet' })).toBeTruthy();
    fireEvent.click(screen.getByRole('tab', { name: 'Danh sách' }));
    expect(screen.getAllByRole('listitem')).toHaveLength(3);
    expect(screen.getByText('lab-notes.docx')).toBeTruthy();
    expect(screen.getByText(/Phương án 2D cho trình đọc màn hình/)).toBeTruthy();
    fireEvent.click(screen.getByRole('tab', { name: 'Docs' }));
    expect(screen.getByText('Giao thức DHCP')).toBeTruthy();
  });

  it('morphs the planet into a document and back', () => {
    renderWithI18n(<InteractionPage />);
    const morph = screen.getByRole('button', { name: 'Thử biến hình hành tinh thành tài liệu' });
    expect(morph.getAttribute('aria-pressed')).toBe('false');
    fireEvent.click(morph);
    expect(morph.getAttribute('aria-pressed')).toBe('true');
    expect(morph.textContent).toContain('Đã mở tài liệu · bấm để thu về');
    fireEvent.click(morph);
    expect(morph.textContent).toContain('Biến hình · bấm để mở');
  });
});
