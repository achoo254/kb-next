/**
 * "Trạm điều khiển" (H03) in jsdom: the theme and reduced motion apply to the page at once and are saved for the
 * account (a failed save keeps them here and says so), the language, the way to the workspace by role, the key in use,
 * the device's default view, clearing the offline cache (synced copies only), signing out, and deleting one's data
 * behind a typed confirmation that lists what goes and what stays.
 */
import 'fake-indexeddb/auto';
import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { SessionState } from '../api/session-api';
import { SessionProvider } from '../layout/session-context';
import { KEYS_OPENAI, answer } from '../test/api-fakes';
import { renderWithI18n } from '../test/render';
import { DEFAULT_VIEW_KEY, DISPLAY_PREFS_KEY } from '../ui/display-prefs';
import { keepServerCopy, listEntries, resetOfficeStore } from './office-store';
import { SettingsScreen } from './settings-screen';

const SESSION: SessionState = { status: 'ready', signedIn: true, signInAvailable: true, user: { id: 'u1', name: 'dattqh', email: 'dat@example.com', picture: null } };

type Role = 'admin' | 'reviewer' | 'member';
let role: Role;
let failSave: boolean;
let failDelete: boolean;
let calls: Array<{ method: string; url: string; body: unknown }>;

const me = (): Record<string, unknown> => ({
  name: 'dattqh',
  email: 'dat@example.com',
  picture: null,
  lang: 'vi',
  theme: 'dark',
  reducedMotion: false,
  role,
  isAdmin: role === 'admin',
  canReview: role !== 'member',
  roleLocked: false,
  onboardedAt: null,
  interests: [],
});

beforeEach(async () => {
  window.history.replaceState(null, '', '/settings?lang=vi');
  localStorage.clear();
  delete document.documentElement.dataset.theme;
  delete document.documentElement.dataset.motion;
  role = 'admin';
  failSave = false;
  failDelete = false;
  calls = [];
  await resetOfficeStore();
  indexedDB.deleteDatabase('kb-office');
  vi.stubGlobal(
    'fetch',
    vi.fn(async (path: string, init?: RequestInit) => {
      const url = String(path);
      const method = init?.method ?? 'GET';
      const body: unknown = init?.body ? JSON.parse(String(init.body)) : null;
      if (method !== 'GET') calls.push({ method, url, body });
      if (url === '/api/me' && method === 'GET') return answer(200, me());
      if (url === '/api/me' && method === 'PATCH') return failSave ? answer(500, { error: 'internal' }) : answer(200, { ...me(), ...(body as object) });
      if (url === '/api/me/keys') return answer(200, KEYS_OPENAI);
      if (url === '/api/me/delete-data') return failDelete ? answer(500, { error: 'internal' }) : answer(200, { deletedDocuments: 4, keptPublished: 2 });
      if (url === '/auth/logout') return new Response(null, { status: 204 });
      return answer(404, { error: 'not-found' });
    }),
  );
});

afterEach(() => {
  vi.unstubAllGlobals();
});

function renderScreen(): void {
  renderWithI18n(
    <SessionProvider value={SESSION}>
      <SettingsScreen />
    </SessionProvider>,
  );
}

describe('the theme and reduced motion', () => {
  it('applies the theme to every screen at once, saves it for the account and keeps a copy for the first paint', async () => {
    renderScreen();
    await waitFor(() => expect(screen.getByRole('radio', { name: 'Tối' }).getAttribute('aria-checked')).toBe('true'));
    fireEvent.click(screen.getByRole('radio', { name: 'Sáng' }));
    expect(document.documentElement.dataset.theme).toBe('light');
    await waitFor(() => expect(calls).toContainEqual({ method: 'PATCH', url: '/api/me', body: { theme: 'light', reducedMotion: false } }));
    expect(JSON.parse(localStorage.getItem(DISPLAY_PREFS_KEY) ?? '{}')).toEqual({ theme: 'light', reducedMotion: false });

    fireEvent.click(screen.getByRole('radio', { name: 'Theo hệ thống' }));
    expect(document.documentElement.dataset.theme).toBeUndefined();
    expect(screen.getByText(/^Theo máy: đang/)).toBeTruthy();
  });

  it('stops motion app-wide with the switch', async () => {
    renderScreen();
    const toggle = await screen.findByRole('switch', { name: 'Giảm chuyển động' });
    fireEvent.click(toggle);
    expect(document.documentElement.dataset.motion).toBe('reduce');
    expect(toggle.getAttribute('aria-checked')).toBe('true');
    expect(screen.getByText(/Đã dừng sao lấp lánh/)).toBeTruthy();
    await waitFor(() => expect(calls.at(-1)?.body).toEqual({ theme: 'dark', reducedMotion: true }));
    fireEvent.click(toggle);
    expect(document.documentElement.dataset.motion).toBeUndefined();
  });

  it('keeps the choice on this device and says so when the server does not save it', async () => {
    failSave = true;
    renderScreen();
    fireEvent.click(await screen.findByRole('radio', { name: 'Sáng' }));
    expect(await screen.findByText(/Chưa lưu được lên máy chủ/)).toBeTruthy();
    expect(document.documentElement.dataset.theme).toBe('light');
    expect(screen.getByRole('radio', { name: 'Sáng' }).getAttribute('aria-checked')).toBe('true');
  });

  it('changes the language of the page and of the account', async () => {
    renderScreen();
    fireEvent.click(await screen.findByRole('button', { name: 'English' }));
    expect(await screen.findByText('Control station')).toBeTruthy();
    await waitFor(() => expect(calls).toContainEqual({ method: 'PATCH', url: '/api/me', body: { lang: 'en' } }));
  });
});

describe('the account card', () => {
  it('leads an admin to the workspace settings, a reviewer to the queue, and a member nowhere', async () => {
    renderScreen();
    expect((await screen.findByRole('link', { name: /Cài đặt workspace/ })).getAttribute('href')).toBe('/admin/settings');
    expect(screen.getByRole('link', { name: 'Mở Scribe' }).getAttribute('href')).toBe('https://scribe.hoandat.com');
  });

  it('shows a reviewer the review queue', async () => {
    role = 'reviewer';
    renderScreen();
    expect((await screen.findByRole('link', { name: /Hàng duyệt/ })).getAttribute('href')).toBe('/admin');
  });

  it('shows a member no staff link', async () => {
    role = 'member';
    renderScreen();
    await screen.findByText('dat@example.com');
    await waitFor(() => expect(screen.queryByRole('link', { name: /Cài đặt workspace|Hàng duyệt/ })).toBeNull());
  });

  it('names the key in use and links to F03', async () => {
    renderScreen();
    const link = await screen.findByRole('link', { name: /Key riêng/ });
    expect(link.getAttribute('href')).toBe('/settings/keys');
    expect(await within(link).findByText('OpenAI ••••a1b2 · đang dùng')).toBeTruthy();
  });
});

describe('this device', () => {
  it('remembers how C08 and A02 open', async () => {
    renderScreen();
    fireEvent.click(await screen.findByRole('button', { name: /Danh sách/ }));
    expect(localStorage.getItem(DEFAULT_VIEW_KEY)).toBe('list');
    expect(screen.getByRole('button', { name: /Danh sách/ }).getAttribute('aria-pressed')).toBe('true');
  });

  it('clears the synced Office copies, never an unsent draft', async () => {
    const bytes = new ArrayBuffer(4);
    await keepServerCopy({ userId: 'u1', documentId: 'd1', fileId: 'f1', name: 'a.docx', kind: 'docx', bytes });
    renderScreen();
    expect(await screen.findByText('1 tệp Office, 0 bản nháp chưa gửi')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Xoá bộ nhớ đệm' }));
    expect(await screen.findByText(/Đã xoá bản sao/)).toBeTruthy();
    expect(await listEntries('u1')).toEqual([]);
  });
});

describe('signing out', () => {
  it('asks first, then signs out', async () => {
    const assign = vi.fn();
    vi.stubGlobal('location', { ...window.location, assign });
    renderScreen();
    fireEvent.click(await screen.findByRole('button', { name: /Đăng xuất/ }));
    const dialog = await screen.findByRole('dialog', { name: 'Rời trạm?' });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Ở lại' }));
    expect(screen.queryByRole('dialog')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: /Đăng xuất/ }));
    fireEvent.click(within(await screen.findByRole('dialog')).getByRole('button', { name: 'Đăng xuất' }));
    await waitFor(() => expect(assign).toHaveBeenCalledWith('/'));
    expect(calls).toContainEqual({ method: 'POST', url: '/auth/logout', body: null });
  });
});

describe('deleting my data', () => {
  it('lists what goes and what stays, and needs the typed word', async () => {
    renderScreen();
    fireEvent.click(await screen.findByRole('button', { name: 'Xoá dữ liệu của tôi' }));
    const dialog = await screen.findByRole('dialog', { name: 'Xoá dữ liệu của tôi?' });
    expect(within(dialog).getByText(/Bản nháp, bài riêng tư/)).toBeTruthy();
    expect(within(dialog).getByText(/Bài chính thức, nhật ký kiểm toán/)).toBeTruthy();
    const confirm = within(dialog).getByRole('button', { name: 'Xoá vĩnh viễn' });
    expect(confirm.hasAttribute('disabled')).toBe(true);
    fireEvent.change(within(dialog).getByLabelText('Gõ XOÁ để xác nhận'), { target: { value: 'xoa' } });
    expect(confirm.hasAttribute('disabled')).toBe(true);
    fireEvent.change(within(dialog).getByLabelText('Gõ XOÁ để xác nhận'), { target: { value: 'xoá' } });
    expect(confirm.hasAttribute('disabled')).toBe(false);
    fireEvent.click(within(dialog).getByRole('button', { name: 'Huỷ' }));
    expect(calls.some((c) => c.url === '/api/me/delete-data')).toBe(false);
  });

  it('deletes, with the published texts when asked, and leaves for the start page', async () => {
    const assign = vi.fn();
    vi.stubGlobal('location', { ...window.location, assign });
    renderScreen();
    fireEvent.click(await screen.findByRole('button', { name: 'Xoá dữ liệu của tôi' }));
    const dialog = await screen.findByRole('dialog');
    fireEvent.click(within(dialog).getByRole('checkbox', { name: /Gỡ cả bài cộng đồng/ }));
    fireEvent.change(within(dialog).getByLabelText('Gõ XOÁ để xác nhận'), { target: { value: 'XOÁ' } });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Xoá vĩnh viễn' }));
    expect(await within(dialog).findByText(/Đã xoá 4 bài/)).toBeTruthy();
    expect(calls).toContainEqual({ method: 'POST', url: '/api/me/delete-data', body: { confirm: 'XOÁ', removePublished: true } });
    await waitFor(() => expect(assign).toHaveBeenCalledWith('/'), { timeout: 3000 });
  });

  it('says nothing was deleted when the server refuses', async () => {
    failDelete = true;
    renderScreen();
    fireEvent.click(await screen.findByRole('button', { name: 'Xoá dữ liệu của tôi' }));
    const dialog = await screen.findByRole('dialog');
    fireEvent.change(within(dialog).getByLabelText('Gõ XOÁ để xác nhận'), { target: { value: 'XOÁ' } });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Xoá vĩnh viễn' }));
    expect(await within(dialog).findByRole('alert')).toBeTruthy();
    expect(within(dialog).getByText(/Dữ liệu vẫn còn nguyên/)).toBeTruthy();
  });
});
