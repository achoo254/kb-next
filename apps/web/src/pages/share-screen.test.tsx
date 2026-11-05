/**
 * A text's sharing (C18) in jsdom: locked until approved; making a link (shown in full once, copied); a link made
 * earlier (its last four characters, "Tạo link mới" after a confirm); changing expiry and access; revoking; the
 * "permission changed" banner of a hidden text (link paused); who has access; the access history (guests, the count,
 * never a token); and a text that cannot be opened.
 */
import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ShareView } from '../api/share-api';
import { answer } from '../test/api-fakes';
import { renderWithI18n } from '../test/render';
import { ShareScreen, historyText, shareState } from './share-screen';
import { shareVi } from './share-messages';

const ID = 'dhcp';
const NOW = new Date('2026-11-03T14:20:00.000Z');
const TOKEN = 'AbCdEfGhIjKlMnOpQrStUvWxYz012345';
const LINK = { id: 'l1', last4: '2345', access: 'view', expiry: '7d', expiresAt: '2026-11-10T13:31:00.000Z', expired: false, revokedAt: null, createdAt: '2026-11-03T13:31:00.000Z' } as const;

function shareView(patch: Partial<ShareView> = {}, doc: Partial<ShareView['document']> = {}): ShareView {
  return {
    document: {
      id: ID,
      title: 'Giao thức DHCP',
      origin: 'official',
      status: 'approved',
      hidden: false,
      lang: 'vi',
      type: 'lab',
      space: { slug: 'networking', nameVi: 'Networking', nameEn: 'Networking', tint: 'x', glow: 'y', art: '/art/crystal-networking.webp' },
      collection: { id: 'c1', nameVi: 'Giao thức nền tảng', nameEn: 'Core protocols' },
      sections: ['Discover', 'Offer', 'Request', 'Acknowledge'],
      authorName: 'Đạt',
      ...doc,
    },
    shareable: true,
    link: null,
    openings7d: 0,
    history: [{ kind: 'approved', at: '2026-11-03T12:58:00.000Z', by: 'Linh', detail: null }],
    approverName: 'Linh',
    permission: null,
    ...patch,
  };
}

let view: ShareView;
let calls: Array<{ method: string; url: string; body: unknown }>;

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(NOW);
  window.history.replaceState(null, '', `/d/${ID}/share?lang=vi`);
  view = shareView();
  calls = [];
  vi.stubGlobal(
    'fetch',
    vi.fn(async (path: string, init?: RequestInit) => {
      const url = String(path);
      const method = init?.method ?? 'GET';
      calls.push({ method, url, body: init?.body ? JSON.parse(String(init.body)) : null });
      if (url === `/api/documents/${ID}/share`) {
        if (method === 'POST') {
          const link = { ...LINK, id: 'l2', last4: TOKEN.slice(-4) };
          view = { ...view, link, history: [{ kind: 'created', at: NOW.toISOString(), by: 'Đạt', detail: '7d|view' }, ...view.history] };
          return answer(201, { token: TOKEN, path: `/l/${TOKEN}`, link });
        }
        if (method === 'PATCH') {
          const body = JSON.parse(String(init?.body)) as { expiry?: 'none' | '7d' | '30d'; access?: 'view' | 'remix' };
          const link = { ...(view.link ?? LINK), ...(body.expiry ? { expiry: body.expiry, expiresAt: body.expiry === 'none' ? null : LINK.expiresAt } : {}), ...(body.access ? { access: body.access } : {}) };
          view = { ...view, link };
          return answer(200, { link });
        }
        if (method === 'DELETE') {
          const link = { ...(view.link ?? LINK), revokedAt: NOW.toISOString() };
          view = { ...view, link };
          return answer(200, { link });
        }
        return answer(200, view);
      }
      if (url.startsWith(`/api/documents/${ID}/share`)) return answer(404, { error: 'not-found' });
      if (url.startsWith('/api/documents/nope/share')) return answer(403, { error: 'no-access' });
      if (url.startsWith('/api/me/notifications')) return answer(200, { notifications: [], unread: { total: 0, byKind: { mention: 0, comment: 0, review: 0, stale: 0, permission: 0 } } });
      return answer(404, { error: 'not-found' });
    }),
  );
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

async function linkCard(): Promise<ReturnType<typeof within>> {
  renderWithI18n(<ShareScreen id={ID} />);
  return within(await screen.findByText('Link công khai').then((label) => label.closest('[data-id="share-link"]') as HTMLElement));
}

describe('making and managing the link', () => {
  it('makes a link with the chosen expiry and access, shows it in full once and copies it', async () => {
    const writeText = vi.fn(() => Promise.resolve());
    vi.stubGlobal('navigator', { ...navigator, clipboard: { writeText } });
    const card = await linkCard();
    expect((card.getByRole('textbox') as HTMLInputElement).value).toBe('Chưa có link');
    fireEvent.click(card.getByRole('button', { name: 'Cho phép remix' }));
    fireEvent.click(card.getByRole('button', { name: 'Tạo link' }));
    const field = card.getByRole('textbox') as HTMLInputElement;
    await waitFor(() => expect(field.value).toBe(`${window.location.origin}/l/${TOKEN}`));
    expect(calls.find((c) => c.method === 'POST')?.body).toEqual({ expiry: '7d', access: 'remix' });
    fireEvent.click(card.getByRole('button', { name: 'Sao chép' }));
    await waitFor(() => expect(writeText).toHaveBeenCalledWith(`${window.location.origin}/l/${TOKEN}`));
    expect(await card.findByRole('button', { name: 'Đã chép' })).toBeTruthy();
  });

  it('shows a link made earlier by its last four characters; a new one needs a confirm', async () => {
    view = shareView({ link: LINK });
    const card = await linkCard();
    expect((card.getByRole('textbox') as HTMLInputElement).value).toBe(`${window.location.host}/l/••••2345`);
    expect(card.getByText('Ai có link: chỉ xem · hết hạn 10/11/2026.')).toBeTruthy();
    fireEvent.click(card.getByRole('button', { name: 'Tạo link mới' }));
    const dialog = within(await screen.findByRole('dialog'));
    expect(dialog.getByText(/Link đang dùng sẽ ngừng chạy/)).toBeTruthy();
    expect(calls.some((c) => c.method === 'POST')).toBe(false);
    fireEvent.click(dialog.getByRole('button', { name: 'Tạo link mới' }));
    await waitFor(() => expect((card.getByRole('textbox') as HTMLInputElement).value).toBe(`${window.location.origin}/l/${TOKEN}`));
  });

  it('changes the live link’s expiry and access, then revokes it', async () => {
    view = shareView({ link: LINK });
    const card = await linkCard();
    fireEvent.click(card.getByRole('button', { name: 'Không hạn' }));
    await waitFor(() => expect(card.getByRole('button', { name: 'Không hạn' }).getAttribute('aria-pressed')).toBe('true'));
    expect(calls.find((c) => c.method === 'PATCH')?.body).toEqual({ expiry: 'none' });
    fireEvent.click(card.getByRole('button', { name: 'Thu hồi link' }));
    expect(await card.findByText('Link đã thu hồi lúc 21:20. Ai mở link cũ sẽ thấy "link hết hiệu lực".')).toBeTruthy();
    expect(card.getByText('Không còn link nào đang hoạt động.')).toBeTruthy();
    expect(card.getByRole('button', { name: 'Tạo link mới' })).toBeTruthy();
    expect(card.queryByRole('button', { name: 'Thu hồi link' })).toBeNull();
  });

  it('keeps an expired link off: settings go to a new link, made at once', async () => {
    view = shareView({ link: { ...LINK, expired: true, expiresAt: '2026-11-01T00:00:00.000Z' } });
    const card = await linkCard();
    expect(card.getByText('Link đã hết hạn 01/11/2026. Tạo link mới để chia sẻ lại.')).toBeTruthy();
    expect(screen.getByText('Đã thu hồi')).toBeTruthy();
    fireEvent.click(card.getByRole('button', { name: '30 ngày' }));
    expect(calls.some((c) => c.method === 'PATCH')).toBe(false);
    fireEvent.click(card.getByRole('button', { name: 'Tạo link mới' }));
    await waitFor(() => expect((card.getByRole('textbox') as HTMLInputElement).value).toBe(`${window.location.origin}/l/${TOKEN}`));
    expect(calls.find((c) => c.method === 'POST')?.body).toEqual({ expiry: '30d', access: 'view' });
    expect(screen.queryByRole('dialog')).toBeNull();
  });
});

describe('the states of the text', () => {
  it('locks sharing until the text is approved', async () => {
    view = shareView({ shareable: false, approverName: null, history: [] }, { status: 'pending', origin: 'own' });
    renderWithI18n(<ShareScreen id={ID} />);
    expect(await screen.findByText('Bài chưa được duyệt nên chưa chia sẻ được')).toBeTruthy();
    expect(screen.queryByText('Link công khai')).toBeNull();
    expect(screen.getByText('Của bạn · Chờ duyệt')).toBeTruthy();
    expect(screen.getByRole('link', { name: 'Xem trạng thái duyệt' }).getAttribute('href')).toBe('/me');
    expect(document.querySelector('[data-id="share-screen"]')?.getAttribute('data-state')).toBe('locked');
  });

  it('shows the banner when an admin just hid it: the link is paused', async () => {
    view = shareView({ link: LINK, shareable: false, permission: { id: 'n1', hidden: true, by: 'Đạt', at: NOW.toISOString() } }, { hidden: true });
    renderWithI18n(<ShareScreen id={ID} />);
    const banner = (await screen.findByText(/Quyền vừa thay đổi/)).closest('[data-id="share-banner"]') as HTMLElement;
    expect(banner.textContent).toContain('Quyền vừa thay đổi: bài đã bị quản trị ẩn, link tạm ngưng.');
    expect(within(banner).getByRole('link', { name: 'Xem thông báo' }).getAttribute('href')).toBe('/inbox');
    expect(screen.getByText('Link tạm ngưng cho tới khi quản trị hiện lại bài.')).toBeTruthy();
    expect(screen.getAllByText('Tạm ngưng')).toHaveLength(2);
    // Settings wait for the text to be shown again; revoking the paused link still works.
    expect((screen.getByRole('button', { name: 'Không hạn' }) as HTMLButtonElement).disabled).toBe(true);
    expect((screen.getByRole('button', { name: 'Thu hồi link' }) as HTMLButtonElement).disabled).toBe(false);
  });

  it('lists who has access and the access history, a guest’s opening included', async () => {
    view = shareView({
      link: LINK,
      openings7d: 4,
      history: [
        { kind: 'opened', at: '2026-11-03T14:12:00.000Z', by: null, detail: null },
        { kind: 'changed', at: '2026-11-03T13:40:00.000Z', by: 'Đạt', detail: '7d|' },
        { kind: 'created', at: '2026-11-03T13:31:00.000Z', by: 'Đạt', detail: '30d|view' },
        { kind: 'approved', at: '2026-11-03T12:58:00.000Z', by: 'Linh', detail: null },
      ],
    });
    renderWithI18n(<ShareScreen id={ID} />);
    const history = within((await screen.findByText('Lịch sử truy cập')).parentElement as HTMLElement);
    expect(history.getAllByRole('listitem').map((li) => li.textContent)).toEqual([
      'Mở link · 21:12 hôm nayKhách chưa đăng nhập · 4 lượt mở trong 7 ngày',
      'Đổi hạn link sang 7 ngàyĐạt · 20:40',
      'Tạo link công khaiĐạt · 20:31',
      'Bài được duyệtLinh · 19:58',
    ]);
    expect(screen.getByText('Mọi người đã đăng nhập')).toBeTruthy();
    expect(screen.getByText('Linh')).toBeTruthy();
    expect(screen.getByText('Duyệt · sửa thẻ')).toBeTruthy();
    expect(screen.getByText('Toàn quyền')).toBeTruthy();
    expect(document.body.textContent).not.toContain(TOKEN);
  });

  it('shows the X02 panel for a text the viewer does not manage', async () => {
    renderWithI18n(<ShareScreen id="nope" />);
    expect(await screen.findByText('403')).toBeTruthy();
  });
});

describe('helpers', () => {
  it('names each state and each history line', () => {
    expect(shareState(shareView())).toBe('none');
    expect(shareState(shareView({ link: { ...LINK, revokedAt: NOW.toISOString() } }))).toBe('revoked');
    const t = (key: keyof typeof shareVi, vars?: Record<string, string | number>): string => shareVi[key].replace(/\{(\w+)\}/g, (_, k: string) => String(vars?.[k] ?? ''));
    expect(historyText(t, { kind: 'changed', at: NOW.toISOString(), by: 'Đạt', detail: '|remix' }, NOW, 'vi', null).title).toBe('Đổi quyền link: cho phép remix');
    expect(historyText(t, { kind: 'hidden', at: '2026-11-01T01:00:00.000Z', by: 'Đạt', detail: null }, NOW, 'vi', null)).toEqual({ title: 'Quản trị ẩn bài · link tạm ngưng', sub: 'Đạt · 01/11 08:00' });
  });
});
