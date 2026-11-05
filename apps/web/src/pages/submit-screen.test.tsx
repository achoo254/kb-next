/**
 * Sending for review (C06) in jsdom: the steps while it goes (Jev running), then "Đã gửi duyệt" with its place in the
 * queue (and no Jev scores: they are for admins); what to fix when the title is missing (no Try again: the text must
 * change), a dropped connection then Try again; the text's latest review result as a card; and the placement a link
 * passes along (C04).
 */
import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { DocumentView } from '../api/content-api';
import type { AppNotification } from '../api/notifications-api';
import { answer } from '../test/api-fakes';
import { renderWithI18n } from '../test/render';
import { SubmitScreen, submitRequestOf } from './submit-screen';

const NOW = new Date('2026-11-03T14:05:00.000Z');
const ID = 'd1';
const SPACE = { slug: 'personal-x', nameVi: 'Vũ trụ của bạn', nameEn: 'Your universe', tint: '#F9A8D4', glow: '#EC4899' };

const DOC = {
  lang: 'vi',
  translationAvailable: true,
  document: {
    id: ID,
    title: 'lab-notes.docx',
    type: 'office',
    origin: 'own',
    status: 'draft',
    lang: 'vi',
    aiTranslated: false,
    updatedAt: NOW.toISOString(),
    authorName: 'Đạt',
    translations: ['vi'],
    collectionId: null,
    space: { ...SPACE, art: '/art/crystal-personal.webp', kind: 'personal' },
    readProgress: 0,
    sourceUrl: null,
    createdAt: NOW.toISOString(),
    readingMinutes: 3,
    reviewedBy: null,
    readAnchor: null,
    collection: null,
  },
  translations: [{ id: ID, lang: 'vi', aiTranslated: false }],
  toc: [],
  chunks: [{ anchor: 'a', heading: null, markdown: 'Nội dung' }],
  backlinks: [],
  outgoing: [],
  wikilinks: [],
  related: [],
  versions: [],
  file: { id: 'f1', name: 'lab-notes.docx', kind: 'docx', size: 1000, version: 1, savedAt: NOW.toISOString(), editable: true },
} satisfies DocumentView;

const CHANGES: AppNotification = {
  id: 'n1',
  kind: 'review',
  documentId: ID,
  place: null,
  payload: { kind: 'review', title: 'lab-notes.docx', action: 'changes_requested', reason: 'Thiếu nguồn: thêm link RFC 2131.', by: 'Linh' },
  createdAt: new Date(NOW.getTime() - 2 * 3_600_000).toISOString(),
  readAt: null,
};

let submit: () => Promise<Response>;
let calls: Array<{ url: string; body: unknown }>;
let release: () => void;

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(NOW);
  window.history.replaceState(null, '', `/d/${ID}/submit?lang=vi`);
  calls = [];
  submit = () => Promise.resolve(answer(200, { status: 'pending', queuePosition: 3, submittedAt: NOW.toISOString(), preReviewed: true }));
  vi.stubGlobal(
    'fetch',
    vi.fn(async (path: string, init?: RequestInit) => {
      const url = String(path);
      if (url.startsWith(`/api/documents/${ID}/submit`)) {
        calls.push({ url, body: init?.body ? JSON.parse(String(init.body)) : null });
        return submit();
      }
      if (url.startsWith(`/api/documents/${ID}`)) return answer(200, DOC);
      if (url.startsWith('/api/me/notifications')) return answer(200, { notifications: [CHANGES], unread: { total: 1, byKind: { mention: 0, comment: 0, review: 1, stale: 0, permission: 0 } } });
      return answer(404, { error: 'not-found' });
    }),
  );
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe('sending for review', () => {
  it('runs the steps, then says it was sent and where it waits, without Jev’s scores', async () => {
    submit = () =>
      new Promise((resolve) => {
        release = () => resolve(answer(200, { status: 'pending', queuePosition: 3, submittedAt: NOW.toISOString(), preReviewed: true }));
      });
    renderWithI18n(<SubmitScreen id={ID} />);
    expect(await screen.findByText('Jev đang chấm 4 tiêu chí…')).toBeTruthy();
    await waitFor(() => expect(calls).toHaveLength(1));
    expect(await screen.findByText('lab-notes.docx · đã trích nội dung')).toBeTruthy();
    expect(screen.getByRole('progressbar').getAttribute('aria-valuenow')).toBe('50');
    release();
    expect(await screen.findByRole('heading', { name: 'Đã gửi duyệt' })).toBeTruthy();
    expect(screen.getByText('Vị trí 3 trong hàng')).toBeTruthy();
    expect(screen.getByText('Đã chấm 4 tiêu chí · điểm chỉ quản trị xem')).toBeTruthy();
    expect(screen.getByText('Chưa có link chia sẻ · có sau khi duyệt')).toBeTruthy();
    expect(screen.queryByText(/0,9|0\.9/)).toBeNull();
    expect(screen.getByRole('link', { name: 'Xem trong Của tôi' }).getAttribute('href')).toBe('/me');
    // The text's latest review result, from the inbox.
    const card = document.querySelector('[data-id="submit-notice-changes"]');
    expect(card?.textContent).toContain('"Thiếu nguồn: thêm link RFC 2131." · Linh');
  });

  it('says what to fix when the title is missing, with no Try again', async () => {
    submit = () => Promise.resolve(answer(400, { error: 'title-required' }));
    renderWithI18n(<SubmitScreen id={ID} />);
    const fix = within(await screen.findByRole('region', { name: 'Chưa gửi được' }));
    expect(fix.getByText('Thiếu tiêu đề', { selector: '.submit-fix-title' })).toBeTruthy();
    expect(fix.getByText('Thêm tiêu đề → gửi lại')).toBeTruthy();
    expect(fix.getByRole('link', { name: 'Thêm tiêu đề' }).getAttribute('href')).toBe(`/d/${ID}/edit`);
    expect(fix.queryByRole('button', { name: 'Thử lại' })).toBeNull();
    expect(screen.getByText('Chưa vào hàng duyệt')).toBeTruthy();
  });

  it('tries again after a dropped connection', async () => {
    submit = () => Promise.reject(new TypeError('Failed to fetch'));
    renderWithI18n(<SubmitScreen id={ID} />);
    const fix = within(await screen.findByRole('region', { name: 'Chưa gửi được' }));
    expect(fix.getByText('Mất mạng giữa chừng')).toBeTruthy();
    submit = () => Promise.resolve(answer(200, { status: 'pending', queuePosition: 1, submittedAt: NOW.toISOString(), preReviewed: false }));
    fireEvent.click(fix.getByRole('button', { name: 'Thử lại' }));
    expect(await screen.findByText('Vị trí 1 trong hàng')).toBeTruthy();
    expect(screen.getByText('Jev chưa chấm được · quản trị vẫn duyệt bình thường')).toBeTruthy();
  });

  it('says a text already waiting needs no second send', async () => {
    submit = () => Promise.resolve(answer(409, { error: 'already-pending' }));
    renderWithI18n(<SubmitScreen id={ID} />);
    expect(await screen.findByText('Bài đã nằm trong hàng duyệt')).toBeTruthy();
  });
});

describe('a link to it', () => {
  it('passes on where the text goes and its tags (C04)', () => {
    expect(submitRequestOf('?space=networking&collection=c1&tags=dhcp&tags=dora')).toEqual({ space: 'networking', collection: 'c1', tags: ['dhcp', 'dora'] });
    expect(submitRequestOf('?lang=vi')).toEqual({});
  });
});
