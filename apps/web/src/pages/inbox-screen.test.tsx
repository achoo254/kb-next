/**
 * The inbox (C20) in jsdom: the board's seven notifications (five unread, counted per tab), the first one open with
 * what to do from it; opening one marks it read, its toggle marks it unread again; "Chỉ chưa đọc", "Đánh dấu đã đọc
 * hết" (then nothing unread: "Đã đọc hết"), the alerts tab; and the screen failing to load, then retried.
 */
import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { AppNotification } from '../api/notifications-api';
import { answer } from '../test/api-fakes';
import { renderWithI18n } from '../test/render';
import { InboxScreen } from './inbox-screen';
import { inboxVi, noticeView } from './inbox-messages';

const NOW = new Date('2026-11-03T14:05:00.000Z');
const minutesAgo = (n: number): string => new Date(NOW.getTime() - n * 60_000).toISOString();
const NET = { slug: 'networking', nameVi: 'Networking', nameEn: 'Networking', tint: '#C4B5FD', glow: '#8B5CF6' };

function note(id: string, minutes: number, read: boolean, rest: Pick<AppNotification, 'kind' | 'payload'> & Partial<AppNotification>): AppNotification {
  return { id, documentId: `doc-${id}`, place: null, createdAt: minutesAgo(minutes), readAt: read ? minutesAgo(minutes) : null, ...rest };
}

const BOARD: AppNotification[] = [
  note('n1', 5, false, {
    kind: 'mention',
    place: { space: NET, collection: { id: 'c1', nameVi: 'Giao thức nền tảng', nameEn: 'Core protocols' } },
    payload: { kind: 'mention', title: 'Giao thức DHCP', by: 'Linh', excerpt: '@Đạt xem giúp đoạn Lease và gia hạn nhé.', anchor: 'lease-va-gia-han' },
  }),
  note('n2', 32, false, { kind: 'comment', payload: { kind: 'comment', title: 'TCP vs UDP', by: 'Minh', excerpt: 'Thêm hình bắt tay 3 bước.', anchor: null } }),
  note('n3', 60, true, { kind: 'review', place: { space: NET, collection: null }, payload: { kind: 'review', title: 'Ghi chú swap trên Ubuntu', action: 'approved', reason: null, by: 'Linh' } }),
  note('n4', 120, false, { kind: 'review', payload: { kind: 'review', title: 'TCP vs UDP bằng hình', action: 'changes_requested', reason: 'Thêm link RFC 793.', by: 'Linh' } }),
  note('n5', 180, false, { kind: 'review', documentId: null, payload: { kind: 'review', title: 'Lối đi: Dựng cụm K8s', action: 'submitted', reason: null, by: 'Minh' } }),
  note('n6', 1320, false, { kind: 'stale', payload: { kind: 'stale', title: 'Deployment Guide', days: 186 } }),
  note('n7', 1380, true, { kind: 'permission', payload: { kind: 'permission', title: 'k8s-intro.pptx', hidden: true, by: 'Đạt' } }),
];

let items: AppNotification[];
let fail: boolean;
let calls: string[];

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(NOW);
  window.history.replaceState(null, '', '/inbox?lang=vi');
  items = BOARD;
  fail = false;
  calls = [];
  vi.stubGlobal(
    'fetch',
    vi.fn(async (path: string, init?: RequestInit) => {
      const url = String(path);
      const method = init?.method ?? 'GET';
      if (method !== 'GET') calls.push(`${method} ${url}`);
      if (url === '/api/me/notifications' && method === 'GET') {
        if (fail) return answer(500, { error: 'internal' });
        const unread = items.filter((n) => n.readAt === null).length;
        return answer(200, { notifications: items, unread: { total: unread, byKind: { mention: 1, comment: 1, review: 2, stale: 1, permission: 0 } } });
      }
      if (url === '/api/me/notifications/read-all') return answer(200, { marked: 5 });
      return new Response(null, { status: 204 });
    }),
  );
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

async function ready(): Promise<void> {
  await waitFor(() => expect(document.querySelector('[data-id="inbox-screen"]')?.getAttribute('data-state')).toBe('ready'));
}

describe('the inbox', () => {
  it('shows the board: five unread, counted per tab, the first one open with what to do', async () => {
    renderWithI18n(<InboxScreen />);
    await ready();
    expect(screen.getByText('5 chưa đọc')).toBeTruthy();
    const tabs = within(screen.getByRole('tablist', { name: 'Loại thông báo' }));
    expect(tabs.getByRole('tab', { name: 'Tất cả 5' }).getAttribute('aria-selected')).toBe('true');
    expect(tabs.getByRole('tab', { name: 'Duyệt bài 2' })).toBeTruthy();
    expect(tabs.getByRole('tab', { name: 'Cảnh báo 1' })).toBeTruthy();
    const preview = within(screen.getByRole('region', { name: 'Xem trước thông báo' }));
    expect(preview.getByRole('heading', { name: '@Linh nhắc bạn trong Giao thức DHCP' })).toBeTruthy();
    expect(preview.getByText('Mention · 5 phút trước')).toBeTruthy();
    expect(preview.getByText('Linh · Networking › Giao thức nền tảng')).toBeTruthy();
    expect(preview.getByRole('link', { name: 'Mở đúng đoạn' }).getAttribute('href')).toBe('/d/doc-n1#lease-va-gia-han');
    // Opening the screen does not mark the first one read.
    expect(calls).toEqual([]);
  });

  it('marks a notification read when opened, and unread again from its toggle', async () => {
    renderWithI18n(<InboxScreen />);
    await ready();
    fireEvent.click(screen.getByRole('button', { name: /Bài "TCP vs UDP bằng hình" cần sửa/ }));
    await waitFor(() => expect(calls).toContain('POST /api/me/notifications/n4/read'));
    expect(screen.getByText('4 chưa đọc')).toBeTruthy();
    const preview = within(screen.getByRole('region', { name: 'Xem trước thông báo' }));
    expect(preview.getByText('Lời nhắn: "Thêm link RFC 793."')).toBeTruthy();
    expect(preview.getByRole('link', { name: 'Sửa bài' }).getAttribute('href')).toBe('/d/doc-n4/edit');
    fireEvent.click(preview.getByRole('button', { name: 'Đánh dấu chưa đọc' }));
    await waitFor(() => expect(calls).toContain('POST /api/me/notifications/n4/unread'));
    expect(screen.getByText('5 chưa đọc')).toBeTruthy();
  });

  it('filters unread only, marks all read, then has nothing left unread', async () => {
    renderWithI18n(<InboxScreen />);
    await ready();
    fireEvent.click(screen.getByRole('switch', { name: 'Chỉ chưa đọc' }));
    expect(screen.queryByText('Bài "Ghi chú swap trên Ubuntu" đã được duyệt')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Đánh dấu đã đọc hết' }));
    await waitFor(() => expect(calls).toContain('POST /api/me/notifications/read-all'));
    expect(screen.getByText('Đã đọc hết')).toBeTruthy();
    expect(screen.getByText('0 chưa đọc')).toBeTruthy();
  });

  it('groups stale texts and permission changes under alerts', async () => {
    renderWithI18n(<InboxScreen />);
    await ready();
    fireEvent.click(screen.getByRole('tab', { name: 'Cảnh báo 1' }));
    const list = within(screen.getByRole('region', { name: 'Danh sách thông báo' }));
    expect(list.getByText('Tài liệu có thể lỗi thời: Deployment Guide')).toBeTruthy();
    expect(list.getByText('Bài "k8s-intro.pptx" đã bị quản trị ẩn')).toBeTruthy();
    expect(list.queryByText('@Linh nhắc bạn trong Giao thức DHCP')).toBeNull();
  });

  it('says when it cannot load, and tries again', async () => {
    fail = true;
    renderWithI18n(<InboxScreen />);
    expect(await screen.findByText('Chưa tải được thông báo.')).toBeTruthy();
    fail = false;
    fireEvent.click(screen.getByRole('button', { name: 'Thử lại' }));
    await ready();
  });
});

describe('a notice left from the review gate', () => {
  it('opens the text itself, never the removed review queue', () => {
    const t = (key: keyof typeof inboxVi, vars: Record<string, string | number> = {}): string => inboxVi[key].replace(/\{(\w+)\}/g, (_, k: string) => String(vars[k] ?? ''));
    const view = noticeView(t, 'vi', note('n9', 10, false, { kind: 'review', payload: { kind: 'review', title: 'TCP', action: 'submitted', reason: null, by: 'Minh' } }));
    expect(view.actions.map((a) => a.href)).toEqual(['/d/doc-n9']);
    expect(view.body).not.toContain('Jev');
  });
});
