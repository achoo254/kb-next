/**
 * Versions and activity (C17) in jsdom: the board's timeline in Vietnamese (who, how, when, tags), the filters and
 * their empty state, the v3 ⇄ v4 comparison and picking another version, viewing a version, restoring (only who may
 * edit; confirm, then the new version), and the screens of a history that cannot be shown.
 */
import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { DocumentHistory, HistoryEvent, VersionDiff } from '../api/history-api';
import { answer } from '../test/api-fakes';
import { renderWithI18n } from '../test/render';
import { defaultPair, pickVersion } from './history-model';
import { HistoryScreen } from './history-screen';

const ID = '989fedf1-beab-4f13-894d-111654ebdc45';
const dat = { name: 'Đạt', role: 'admin' } as const;
const linh = { name: 'Linh', role: 'reviewer' } as const;
const minh = { name: 'Minh', role: 'member' } as const;
const ai = (version: number, at: string): HistoryEvent => ({ kind: 'version', at, actor: dat, version, via: 'api', aiMade: true, summary: null, restoredFrom: null, proposal: false });

/** The history of DHCP as the server gives it for board C17. */
const EVENTS: HistoryEvent[] = [
  { kind: 'visibility', at: '2026-11-03T14:40:00.000Z', actor: dat, hidden: false },
  { kind: 'visibility', at: '2026-11-03T14:12:00.000Z', actor: dat, hidden: true },
  { kind: 'review', at: '2026-11-03T03:02:00.000Z', actor: linh, action: 'approved', reason: null, version: 4 },
  { kind: 'version', at: '2026-11-02T14:30:00.000Z', actor: minh, version: 4, via: 'editor', aiMade: false, summary: 'thêm đoạn lease và DHCP snooping', restoredFrom: null, proposal: true },
  { kind: 'review', at: '2026-11-02T02:00:00.000Z', actor: linh, action: 'changes_requested', reason: 'thiếu nguồn cho đoạn broadcast', version: 3 },
  ai(3, '2026-10-31T07:05:00.000Z'),
  ai(2, '2026-10-29T13:40:00.000Z'),
  ai(1, '2026-10-28T02:12:00.000Z'),
];

function historyOf(patch: Partial<DocumentHistory> = {}): DocumentHistory {
  return {
    document: {
      id: ID,
      title: 'Giao thức DHCP',
      status: 'approved',
      origin: 'official',
      space: { slug: 'networking', nameVi: 'Networking', nameEn: 'Networking', tint: '#C4B5FD', glow: '#8B5CF6', kind: 'public' },
      collection: { id: 'c0', nameVi: 'Giao thức nền tảng', nameEn: 'Core protocols' },
    },
    canRestore: false,
    currentVersion: 4,
    events: EVENTS,
    ...patch,
  };
}

const DIFF: VersionDiff = {
  from: 3,
  to: 4,
  added: 3,
  removed: 1,
  lines: [
    { op: 'same', text: 'Vì chưa có IP, máy mới không biết server DHCP ở đâu.', heading: false },
    { op: 'add', text: 'Lease và gia hạn', heading: true },
    { op: 'add', text: 'IP chỉ được cho mượn có hạn.', heading: false },
    { op: 'same', text: 'Rủi ro: DHCP giả mạo', heading: true },
    { op: 'del', text: 'Một máy lạ trả lời nhanh hơn có thể đưa gateway sai.', heading: false },
    { op: 'add', text: 'Một máy lạ trả lời nhanh hơn có thể đưa gateway sai. Switch nên bật DHCP snooping.', heading: false },
  ],
};

let historyReply: () => Response | Promise<Response>;
let diffs: string[];
let restores: string[];

beforeEach(() => {
  diffs = [];
  restores = [];
  historyReply = () => answer(200, historyOf());
  window.history.replaceState(null, '', `/d/${ID}/history?lang=vi`);
  vi.stubGlobal(
    'fetch',
    vi.fn(async (path: string, init?: RequestInit) => {
      const url = String(path);
      if (url === `/api/documents/${ID}/history`) return historyReply();
      if (url.startsWith(`/api/documents/${ID}/diff?`)) {
        diffs.push(url.split('?')[1] ?? '');
        const params = new URLSearchParams(url.split('?')[1]);
        return answer(200, { ...DIFF, from: Number(params.get('from')), to: Number(params.get('to')) });
      }
      if (url === `/api/documents/${ID}/versions/3`) return answer(200, { version: 3, markdown: '# Giao thức DHCP\n\n## Broadcast là gì\n\nVì chưa có IP.', savedAt: '2026-10-31T07:05:00.000Z', editorName: 'Đạt' });
      if (url === `/api/documents/${ID}/versions/3/restore` && init?.method === 'POST') {
        restores.push(url);
        return answer(200, { rev: '2026-11-05T03:00:00.000Z', version: 5 });
      }
      return answer(404, { error: 'not-found' });
    }),
  );
});

afterEach(() => {
  vi.unstubAllGlobals();
});

const rows = (): string[] => [...document.querySelectorAll('.history-event')].map((li) => li.querySelector('.history-card-title')?.textContent ?? '');

describe('HistoryScreen', () => {
  it('tells the board’s activity: sentence, who and role, time, tags and version chips', async () => {
    renderWithI18n(<HistoryScreen id={ID} />);
    await screen.findByText('Hiện lại bài trong Universe');
    expect(rows()).toEqual([
      'Hiện lại bài trong Universe',
      'Quyền thay đổi: bài bị ẩn bởi Đạt',
      'Duyệt phiên bản v4',
      'Đề xuất sửa: thêm đoạn lease và DHCP snooping',
      'Yêu cầu sửa: thiếu nguồn cho đoạn broadcast',
      'Cập nhật qua API · AI tạo',
      'Cập nhật qua API · AI tạo',
      'Tạo bài qua API · AI tạo',
    ]);
    const who = [...document.querySelectorAll('.history-card-who')].map((el) => el.textContent);
    expect(who.slice(0, 6)).toEqual(['Đạt · Quản trị · 03/11 21:40', 'Đạt · Quản trị · 03/11 21:12', 'Linh · Người duyệt · 03/11 10:02', 'Minh · Thành viên · 02/11 21:30', 'Linh · Người duyệt · 02/11 09:00', 'Đạt · API · 31/10 14:05']);
    expect([...document.querySelectorAll('.history-tag')].map((el) => el.textContent)).toEqual(['Ẩn', 'Đã duyệt', 'Cần sửa']);
    expect([...document.querySelectorAll('.history-version')].map((el) => [el.textContent, el.getAttribute('aria-pressed')])).toEqual([
      ['v4 · nay', 'true'],
      ['v3', 'true'],
      ['v2', 'false'],
      ['v1', 'false'],
    ]);
    expect([...document.querySelectorAll('.history-avatar')].map((el) => el.textContent)).toEqual(['Đ', 'Đ', 'L', 'M', 'L', 'AI', 'AI', 'AI']);
    const crumbs = screen.getByRole('navigation', { name: 'Vị trí' });
    expect(within(crumbs).getByRole('link', { name: 'Giao thức DHCP' }).getAttribute('href')).toBe(`/d/${ID}`);
  });

  it('compares v3 with v4 first, and another pick keeps the newer version', async () => {
    renderWithI18n(<HistoryScreen id={ID} />);
    const lines = await screen.findByRole('list', { name: 'Thay đổi' });
    await waitFor(() => expect(lines.getAttribute('data-state')).toBe('ready'));
    expect(diffs).toEqual(['from=3&to=4']);
    expect(screen.getByText('+3 thêm')).toBeTruthy();
    expect(screen.getByText('−1 bỏ')).toBeTruthy();
    expect([...lines.querySelectorAll('.history-line')].map((l) => l.getAttribute('data-op'))).toEqual(['same', 'add', 'add', 'same', 'del', 'add']);
    fireEvent.click(screen.getByRole('button', { name: 'Chọn v2 để so sánh' }));
    await waitFor(() => expect(diffs).toEqual(['from=3&to=4', 'from=2&to=4']));
    expect(screen.getByRole('button', { name: 'Chọn v2 để so sánh' }).getAttribute('aria-pressed')).toBe('true');
    expect(screen.getByRole('button', { name: 'Chọn v3 để so sánh' }).getAttribute('aria-pressed')).toBe('false');
  });

  it('filters by kind, with a sentence when nothing is left', async () => {
    renderWithI18n(<HistoryScreen id={ID} />);
    await screen.findByText('Hiện lại bài trong Universe');
    fireEvent.click(screen.getByRole('button', { name: 'Duyệt' }));
    expect(rows()).toEqual(['Duyệt phiên bản v4', 'Yêu cầu sửa: thiếu nguồn cho đoạn broadcast']);
    fireEvent.click(screen.getByRole('button', { name: 'Hiển thị' }));
    expect(rows()).toHaveLength(2);
    fireEvent.click(screen.getByRole('button', { name: 'Nội dung' }));
    expect(rows()).toHaveLength(4);
    fireEvent.click(screen.getByRole('button', { name: 'Tất cả' }));
    expect(rows()).toHaveLength(8);
  });

  it('shows the empty filter and the one-version state', async () => {
    historyReply = () => answer(200, historyOf({ currentVersion: 1, events: [ai(1, '2026-10-28T02:12:00.000Z')] }));
    renderWithI18n(<HistoryScreen id={ID} />);
    await screen.findByText('Tạo bài qua API · AI tạo');
    expect(screen.getByText('Bài mới có một phiên bản. Lưu thêm là so sánh được.')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Duyệt' }));
    expect(screen.getByText('Chưa có hoạt động nào thuộc loại này.')).toBeTruthy();
  });

  it('opens an older version’s text', async () => {
    renderWithI18n(<HistoryScreen id={ID} />);
    fireEvent.click(await screen.findByRole('button', { name: 'Xem bản v3' }));
    const dialog = await screen.findByRole('dialog');
    await waitFor(() => expect(dialog.textContent).toContain('Broadcast là gì'));
    expect(dialog.textContent).toContain('Bản v3 · 31/10 14:05');
  });

  it('lets only who may edit restore: confirm, then a new version and the toast', async () => {
    renderWithI18n(<HistoryScreen id={ID} />);
    const locked = await screen.findByRole('button', { name: 'Khôi phục v3' });
    expect(locked.getAttribute('aria-disabled')).toBe('true');
    expect(locked.getAttribute('title')).toBe('Chỉ tác giả hoặc quản trị khôi phục được, khi bài chưa gửi duyệt.');
    fireEvent.click(locked);
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('restores for an editor after confirming', async () => {
    let restored = false;
    historyReply = () =>
      answer(
        200,
        restored
          ? historyOf({ canRestore: true, currentVersion: 5, events: [{ kind: 'version', at: '2026-11-05T03:00:00.000Z', actor: dat, version: 5, via: 'restore', aiMade: false, summary: null, restoredFrom: 3, proposal: false }, ...EVENTS] })
          : historyOf({ canRestore: true }),
      );
    renderWithI18n(<HistoryScreen id={ID} />);
    fireEvent.click(await screen.findByRole('button', { name: 'Khôi phục v3' }));
    const dialog = await screen.findByRole('dialog');
    expect(dialog.textContent).toContain('Khôi phục v3?');
    restored = true;
    fireEvent.click(within(dialog).getByRole('button', { name: 'Khôi phục' }));
    expect(await screen.findByText('Đã khôi phục v3 thành v5')).toBeTruthy();
    expect(restores).toHaveLength(1);
    await screen.findByText('Khôi phục v3');
    expect(rows()[0]).toBe('Khôi phục v3');
  });

  it('shows why a history cannot be shown', async () => {
    historyReply = () => answer(403, { error: 'no-access' });
    const { unmount } = renderWithI18n(<HistoryScreen id={ID} />);
    await waitFor(() => expect(document.querySelector('[data-id="history-screen"]')?.getAttribute('data-state')).toBe('no-access'));
    unmount();
    historyReply = () => Promise.reject(new TypeError('Failed to fetch'));
    renderWithI18n(<HistoryScreen id={ID} />);
    expect(await screen.findByText('Bạn đang offline')).toBeTruthy();
  });
});

describe('history-model', () => {
  it('compares the last two versions first and keeps the newer pick', () => {
    expect(defaultPair(EVENTS)).toEqual([3, 4]);
    expect(defaultPair([ai(1, '2026-10-28T02:12:00.000Z')])).toEqual([1, 1]);
    expect(pickVersion([3, 4], 2)).toEqual([2, 4]);
    expect(pickVersion([2, 4], 1)).toEqual([1, 4]);
    expect(pickVersion([3, 4], 4)).toEqual([3, 4]);
  });
});
