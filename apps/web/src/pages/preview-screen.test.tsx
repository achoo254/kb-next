/**
 * Previewing a text (C05) in jsdom: as its author now (locked in their own Universe, "Của bạn · riêng tư") or as a guest
 * once published, on each device frame; the chat card with `ill-doc-planet`; its sections as the frame's step cards;
 * "Đăng" leading to C04; and a text that cannot be opened.
 */
import { fireEvent, screen, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { DocumentView } from '../api/content-api';
import { answer } from '../test/api-fakes';
import { renderWithI18n } from '../test/render';
import { PreviewScreen, leadOf, stepsOf } from './preview-screen';
import { DOC_ID, draftView } from './publish-test-data';

let view: DocumentView;
let status: number;

beforeEach(() => {
  window.history.replaceState(null, '', `/d/${DOC_ID}/preview?lang=vi`);
  view = draftView();
  status = 200;
  vi.stubGlobal(
    'fetch',
    vi.fn(async (path: string) => {
      const url = String(path);
      if (url.startsWith(`/api/documents/${DOC_ID}`)) return status === 200 ? answer(200, view) : answer(status, { error: status === 403 ? 'no-access' : 'not-found' });
      if (url.startsWith('/api/me/notifications')) return answer(200, { notifications: [], unread: { total: 0, byKind: { mention: 0, comment: 0, review: 0, stale: 0, permission: 0 } } });
      return answer(404, { error: 'not-found' });
    }),
  );
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('the preview', () => {
  it('shows the text as its author sees it now, locked in their own Universe', async () => {
    renderWithI18n(<PreviewScreen id={DOC_ID} />);
    const stage = within(await screen.findByRole('region', { name: 'Thiết bị' }));
    expect(stage.getByRole('heading', { name: 'Máy mới xin IP thế nào' })).toBeTruthy();
    expect(stage.getByText('Của bạn · riêng tư')).toBeTruthy();
    expect(stage.getByText('Vũ trụ của bạn · Đạt · 2 phút đọc')).toBeTruthy();
    expect(stage.getAllByText(/^(Discover|Offer|Request|Acknowledge)$/)).toHaveLength(4);
    expect(screen.getByText('Bây giờ: chỉ bạn thấy, nằm trong Vũ trụ của bạn')).toBeTruthy();
    expect(document.querySelector('[data-id="preview-orbit"]')?.getAttribute('data-locked')).toBe('true');
    expect(screen.getByText('Xem trước · chưa đăng')).toBeTruthy();
    expect(screen.getByRole('link', { name: 'Đăng' }).getAttribute('href')).toBe(`/d/${DOC_ID}/publish`);
    expect(screen.getByRole('link', { name: 'Sửa tiếp' }).getAttribute('href')).toBe(`/d/${DOC_ID}/edit`);
  });

  it('switches to a guest once approved, and between the device frames', async () => {
    renderWithI18n(<PreviewScreen id={DOC_ID} />);
    await screen.findByRole('region', { name: 'Thiết bị' });
    fireEvent.click(screen.getByRole('button', { name: 'Khách · sau khi đăng' }));
    expect(screen.getByText('Cộng đồng · đã đăng')).toBeTruthy();
    expect(screen.getByText('Sau khi đăng: hiện trong Vũ trụ của bạn cho mọi người')).toBeTruthy();
    expect(document.querySelector('[data-id="preview-orbit"]')?.hasAttribute('data-locked')).toBe(false);
    expect(screen.getByText('Máy tính · 1440 px')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Điện thoại' }));
    expect(document.querySelector('.preview-device')?.getAttribute('data-device')).toBe('phone');
    expect(screen.getByText('Điện thoại · 390 px')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Tablet' }));
    expect(screen.getByRole('button', { name: 'Tablet' }).getAttribute('aria-pressed')).toBe('true');
  });

  it('shows the chat card a share link gets, with ill-doc-planet', async () => {
    renderWithI18n(<PreviewScreen id={DOC_ID} />);
    const og = await screen.findByText('Khi dán link vào chat / mạng xã hội');
    const card = og.parentElement;
    expect(card?.querySelector('.preview-og-art img')?.getAttribute('src')).toBe('/art/ill-doc-planet.webp');
    expect(card?.textContent).toContain('Bài riêng tư chưa có link chia sẻ. Đây là thẻ sẽ hiện sau khi đăng.');
  });

  it('shows the X02 panel when the text cannot be opened', async () => {
    status = 403;
    renderWithI18n(<PreviewScreen id={DOC_ID} />);
    expect(await screen.findByText('403')).toBeTruthy();
  });
});

describe('what the frame shows', () => {
  it('takes the first paragraph as the lead and the ## sections as steps', () => {
    expect(leadOf(view)).toBe('Máy mới hỏi cả mạng để xin IP, qua 4 bước DORA.');
    expect(stepsOf(view)).toEqual(['Discover', 'Offer', 'Request', 'Acknowledge']);
    expect(leadOf(draftView({}, [{ anchor: 'a', heading: null, markdown: '1. **Một**\n\n**Hai** [[ba]]' }]))).toBe('Hai ba');
  });
});
