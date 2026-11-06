/**
 * Opening a share link (H02) in jsdom: signed out (the card, sign in and come back, a peek at the first section),
 * signed in (save to the Universe, remix when the link allows it, read), expired, revoked, private (the text hidden
 * since it was shared: nothing about it), no such link, and a failed load with Try again.
 */
import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { SharedPreview } from '../api/share-api';
import { answer } from '../test/api-fakes';
import { renderWithI18n } from '../test/render';
import { SharedOpenScreen, openStateOf } from './shared-open-screen';

const TOKEN = 'AbCdEfGhIjKlMnOpQrStUvWxYz012345';

function preview(patch: Partial<SharedPreview> = {}): SharedPreview {
  return {
    access: 'view',
    signedIn: false,
    canRemix: false,
    document: {
      id: 'd1',
      title: 'Máy mới vào mạng',
      lang: 'vi',
      type: 'note',
      authorName: 'dattqh',
      readingMinutes: 4,
      sections: ['Wi-Fi', 'DHCP', 'ARP', 'DNS', 'HTTP'],
      peek: { heading: 'Wi-Fi', text: 'Cắm mạng: máy mới chưa có IP, chưa biết ai.' },
      space: { slug: 'networking', nameVi: 'Networking', nameEn: 'Networking', tint: 'x', glow: 'y' },
    },
    ...patch,
  };
}

let open: () => Response;
let calls: Array<{ method: string; url: string }>;

beforeEach(() => {
  window.history.replaceState(null, '', `/l/${TOKEN}?lang=vi`);
  open = () => answer(200, preview());
  calls = [];
  vi.stubGlobal(
    'fetch',
    vi.fn(async (path: string, init?: RequestInit) => {
      const url = String(path);
      const method = init?.method ?? 'GET';
      calls.push({ method, url });
      if (url === `/api/l/${TOKEN}`) return open();
      if (url === `/api/l/${TOKEN}/remix`) return answer(201, { id: 'copy1' });
      if (url === '/api/documents/d1/favorite') return new Response(null, { status: 204 });
      if (url.startsWith('/api/me/notifications')) return answer(401, { error: 'sign-in-required' });
      return answer(404, { error: 'not-found' });
    }),
  );
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('signed out', () => {
  it('shows the text’s card, signs in and comes back here, and peeks at its first section', async () => {
    renderWithI18n(<SharedOpenScreen token={TOKEN} />);
    expect(await screen.findByRole('heading', { name: 'Máy mới vào mạng' })).toBeTruthy();
    expect(screen.getByText('· 5 mục · ~4 phút')).toBeTruthy();
    expect(screen.getByText('dattqh')).toBeTruthy();
    expect(screen.getAllByText(/^(Wi-Fi|DHCP|ARP|DNS|HTTP)$/)).toHaveLength(5);
    // the sections after the first are locked until sign-in: a lock and words say so, not only their fade
    expect(screen.getAllByText('(mở khi đăng nhập)')).toHaveLength(4);
    expect(document.querySelectorAll('.open-step-lock')).toHaveLength(4);
    expect(screen.getByRole('link', { name: 'Đăng nhập để mở' }).getAttribute('href')).toBe(`/login?return=%2Fl%2F${TOKEN}`);
    fireEvent.click(screen.getByRole('button', { name: 'Xem trước 1 mục' }));
    expect(screen.getByText('Cắm mạng: máy mới chưa có IP, chưa biết ai.')).toBeTruthy();
    expect(document.querySelector('[data-id="open-screen"]')?.getAttribute('data-state')).toBe('guest');
    // The address shows only the start of the token.
    expect(document.querySelector('.open-address')?.textContent).toBe(`${window.location.host}/l/AbCd…`);
    // A guest reaches the privacy policy and the terms from here.
    const legal = screen.getByRole('navigation', { name: 'Chính sách và điều khoản' });
    expect(within(legal).getByRole('link', { name: 'Quyền riêng tư' }).getAttribute('href')).toBe('/privacy');
    expect(within(legal).getByRole('link', { name: 'Điều khoản' }).getAttribute('href')).toBe('/terms');
  });
});

describe('signed in', () => {
  it('saves the text to the Universe and opens it in the reader', async () => {
    open = () => answer(200, preview({ signedIn: true }));
    renderWithI18n(<SharedOpenScreen token={TOKEN} />);
    expect(await screen.findByText('của dattqh · đã mở trong vũ trụ của bạn')).toBeTruthy();
    expect(screen.getByRole('link', { name: 'Đọc' }).getAttribute('href')).toBe('/d/d1');
    expect(screen.queryByRole('button', { name: 'Remix' })).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Lưu vào vũ trụ của bạn' }));
    expect(await screen.findByRole('button', { name: 'Đã lưu vào vũ trụ' })).toBeTruthy();
    expect(calls).toContainEqual({ method: 'PUT', url: '/api/documents/d1/favorite' });
  });

  it('remixes the text into a draft when the link allows it, then opens the editor', async () => {
    const assign = vi.fn();
    vi.stubGlobal('location', { ...window.location, assign, search: '?lang=vi', pathname: `/l/${TOKEN}` });
    open = () => answer(200, preview({ signedIn: true, access: 'remix', canRemix: true }));
    renderWithI18n(<SharedOpenScreen token={TOKEN} />);
    fireEvent.click(await screen.findByRole('button', { name: 'Remix' }));
    await waitFor(() => expect(assign).toHaveBeenCalledWith('/d/copy1/edit'));
  });
});

describe('a link that does not open', () => {
  it.each([
    ['link-expired', 410, 'Link này đã tắt', 'Link đã hết hạn. Nhờ người gửi tạo link mới.'],
    ['link-revoked', 410, 'Link này đã tắt', 'Người gửi đã thu hồi link này. Nhờ họ gửi link mới.'],
    ['private', 404, 'Hành tinh riêng tư', 'Bài này không còn công khai nên link không mở được. Khi bài được hiện lại, link chạy lại.'],
    ['not-found', 404, 'Không có link này', 'Link sai hoặc không còn tồn tại. Kiểm tra lại đường dẫn người gửi đưa.'],
  ])('%s: says so, and tells nothing about the text', async (code, status, title, text) => {
    open = () => answer(status, { error: code });
    renderWithI18n(<SharedOpenScreen token={TOKEN} />);
    expect(await screen.findByRole('heading', { name: title })).toBeTruthy();
    expect(screen.getByText(text)).toBeTruthy();
    expect(screen.queryByText('Máy mới vào mạng')).toBeNull();
    expect(screen.getByRole('link', { name: 'Về vũ trụ của bạn' }).getAttribute('href')).toBe('/u');
  });

  it('tries again after a failed load', async () => {
    open = () => answer(500, { error: 'internal' });
    renderWithI18n(<SharedOpenScreen token={TOKEN} />);
    expect(await screen.findByRole('heading', { name: 'Chưa mở được link' })).toBeTruthy();
    open = () => answer(200, preview());
    fireEvent.click(screen.getByRole('button', { name: 'Thử lại' }));
    expect(await screen.findByRole('heading', { name: 'Máy mới vào mạng' })).toBeTruthy();
  });

  it('maps each API code to its state', () => {
    expect(openStateOf('link-expired')).toBe('expired');
    expect(openStateOf('rate-limited')).toBe('failed');
  });
});
