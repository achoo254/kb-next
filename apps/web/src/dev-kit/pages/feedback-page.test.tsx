import { fireEvent, screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { renderWithI18n } from '../../test/render';
import { FeedbackPage } from './feedback-page';

function floatingToast(): HTMLElement | null {
  return document.querySelector<HTMLElement>('[data-id="fb-floating-toast"]');
}

describe('FeedbackPage', () => {
  it('lays out the board without a floating toast or dialog', () => {
    renderWithI18n(<FeedbackPage />);
    expect(document.querySelector('[data-screen="X01-Feedback"]')).not.toBeNull();
    expect(screen.getByRole('region', { name: 'Mẫu trạng thái hệ thống' })).toBeTruthy();
    expect(floatingToast()).toBeNull();
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('shows the toast of a trigger and closes it', () => {
    renderWithI18n(<FeedbackPage />);
    fireEvent.click(screen.getByRole('button', { name: 'Cảnh báo' }));
    const toast = floatingToast();
    expect(toast?.textContent).toContain('Bạn đang offline');
    expect(toast?.dataset.tone).toBe('warn');

    fireEvent.click(screen.getByRole('button', { name: 'Lỗi' }));
    expect(floatingToast()?.dataset.tone).toBe('error');

    const close = floatingToast();
    if (!close) throw new Error('toast missing');
    fireEvent.click(within(close).getByRole('button', { name: 'Dismiss notification' }));
    expect(floatingToast()).toBeNull();
  });

  it('keeps the note when the confirm is dismissed and shows the undo toast after a delete', () => {
    renderWithI18n(<FeedbackPage />);
    fireEvent.click(screen.getByRole('button', { name: 'Xoá ghi chú…' }));
    expect(screen.getByRole('dialog').textContent).toContain('Xoá "Ghi chú: ARP"?');
    fireEvent.click(screen.getByRole('button', { name: 'Giữ lại' }));
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(floatingToast()).toBeNull();

    fireEvent.click(screen.getByRole('button', { name: 'Xoá ghi chú…' }));
    fireEvent.click(screen.getByRole('button', { name: 'Xoá' }));
    expect(screen.queryByRole('dialog')).toBeNull();
    const toast = floatingToast();
    expect(toast?.dataset.tone).toBe('undo');
    if (!toast) throw new Error('toast missing');
    fireEvent.click(within(toast).getByRole('button', { name: 'Undo' }));
    expect(floatingToast()).toBeNull();
  });

  it('marks both fields invalid with their messages', () => {
    renderWithI18n(<FeedbackPage />);
    const title = screen.getByLabelText('Tiêu đề');
    expect(title.getAttribute('aria-invalid')).toBe('true');
    expect(screen.getByText('Cần một tiêu đề')).toBeTruthy();
    expect(screen.getByLabelText('Key OpenAI').getAttribute('aria-invalid')).toBe('true');
  });

  it('cycles the reconnect attempts and the recovery card', () => {
    renderWithI18n(<FeedbackPage />);
    expect(screen.getByText(/Thử lại sau 8 giây \(lần 1\)/)).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Thử ngay' }));
    expect(screen.getByText(/Thử lại sau 6 giây \(lần 2\)/)).toBeTruthy();

    const recovery = (): HTMLElement => screen.getByRole('alert');
    expect(recovery().textContent).toContain('Chưa gửi được');
    fireEvent.click(screen.getByRole('button', { name: 'Thử lại' }));
    expect(recovery().textContent).toContain('Đang thử lại…');
    fireEvent.click(screen.getByRole('button', { name: 'Khôi phục bản nháp' }));
    expect(recovery().textContent).toContain('Đã khôi phục');
  });
});
