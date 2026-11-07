/**
 * Publishing (C06) in jsdom: the steps while it goes, then "Đã đăng" with the way to the text and its share page (or,
 * when an admin hides it, a word saying so); what to fix when the title is missing (no Try again: the text must
 * change), a dropped connection then Try again. Only C04's "Đăng công khai" publishes (its `request`); visiting or
 * reloading /submit never does.
 */
import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { DocumentView } from '../api/content-api';
import { answer } from '../test/api-fakes';
import { renderWithI18n } from '../test/render';
import { SubmitScreen } from './submit-screen';

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

const OK_ANSWER = (): Response => answer(200, { status: 'approved', hidden: false, publishedAt: NOW.toISOString() });

let submit: () => Promise<Response>;
let calls: Array<{ url: string; body: unknown }>;
let release: () => void;
let status: DocumentView['document']['status'];

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(NOW);
  window.history.replaceState(null, '', `/d/${ID}/submit?lang=vi`);
  calls = [];
  status = 'draft';
  submit = () => Promise.resolve(OK_ANSWER());
  vi.stubGlobal(
    'fetch',
    vi.fn(async (path: string, init?: RequestInit) => {
      const url = String(path);
      if (url.startsWith(`/api/documents/${ID}/submit`)) {
        calls.push({ url, body: init?.body ? JSON.parse(String(init.body)) : null });
        return submit();
      }
      if (url.startsWith(`/api/documents/${ID}`)) return answer(200, { ...DOC, document: { ...DOC.document, status } });
      return answer(404, { error: 'not-found' });
    }),
  );
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe('publishing', () => {
  it('runs the steps, then says it is published, with the way to the text and its share page', async () => {
    submit = () =>
      new Promise((resolve) => {
        release = () => resolve(OK_ANSWER());
      });
    renderWithI18n(<SubmitScreen id={ID} request={{ space: 'networking', tags: ['dhcp'] }} />);
    expect(await screen.findByText('Đang đăng…')).toBeTruthy();
    await waitFor(() => expect(calls).toHaveLength(1));
    expect(calls[0]?.url).toBe(`/api/documents/${ID}/submit`);
    expect(await screen.findByText('lab-notes.docx · đã trích nội dung')).toBeTruthy();
    expect(screen.getByRole('progressbar').getAttribute('aria-valuenow')).toBe('67');
    release();
    expect(await screen.findByRole('heading', { name: 'Đã đăng' })).toBeTruthy();
    expect(screen.getByText('Đã đăng · mọi người đọc được ngay')).toBeTruthy();
    expect(screen.getByText('Công khai · kể cả khách đọc được')).toBeTruthy();
    expect(screen.getByRole('link', { name: 'Xem bài' }).getAttribute('href')).toBe(`/d/${ID}`);
    expect(screen.getByRole('link', { name: 'Chia sẻ' }).getAttribute('href')).toBe(`/d/${ID}/share`);
    expect(screen.queryByText(/duyệt/)).toBeNull();
  });

  it('says a text an admin hid stays hidden, without a share link', async () => {
    submit = () => Promise.resolve(answer(200, { status: 'approved', hidden: true, publishedAt: NOW.toISOString() }));
    renderWithI18n(<SubmitScreen id={ID} request={{ space: 'networking' }} />);
    expect(await screen.findByText('Quản trị đang ẩn bài này')).toBeTruthy();
    expect(screen.getByText('Đã đăng · quản trị đang ẩn bài này')).toBeTruthy();
    expect(screen.queryByRole('link', { name: 'Chia sẻ' })).toBeNull();
    expect(screen.getByRole('link', { name: 'Xem trong Của tôi' }).getAttribute('href')).toBe('/me');
  });

  it('says what to fix when the title is missing, with no Try again', async () => {
    submit = () => Promise.resolve(answer(400, { error: 'title-required' }));
    renderWithI18n(<SubmitScreen id={ID} request={{ space: 'networking', tags: ['dhcp'] }} />);
    const fix = within(await screen.findByRole('region', { name: 'Chưa đăng được' }));
    expect(fix.getByText('Thiếu tiêu đề', { selector: '.submit-fix-title' })).toBeTruthy();
    expect(fix.getByText('Thêm tiêu đề → đăng lại')).toBeTruthy();
    expect(fix.getByRole('link', { name: 'Thêm tiêu đề' }).getAttribute('href')).toBe(`/d/${ID}/edit`);
    expect(fix.queryByRole('button', { name: 'Thử lại' })).toBeNull();
    expect(screen.getByText('Chưa đăng được', { selector: '.submit-step-sub' })).toBeTruthy();
  });

  it('tries again after a dropped connection', async () => {
    submit = () => Promise.reject(new TypeError('Failed to fetch'));
    renderWithI18n(<SubmitScreen id={ID} request={{ space: 'networking', tags: ['dhcp'] }} />);
    const fix = within(await screen.findByRole('region', { name: 'Chưa đăng được' }));
    expect(fix.getByText('Mất mạng giữa chừng')).toBeTruthy();
    submit = () => Promise.resolve(OK_ANSWER());
    fireEvent.click(fix.getByRole('button', { name: 'Thử lại' }));
    expect(await screen.findByRole('heading', { name: 'Đã đăng' })).toBeTruthy();
  });

  it('shows a text published meanwhile as published, not as an error', async () => {
    submit = () => Promise.resolve(answer(409, { error: 'already-published' }));
    renderWithI18n(<SubmitScreen id={ID} request={{ space: 'networking', tags: ['dhcp'] }} />);
    expect(await screen.findByRole('heading', { name: 'Đã đăng' })).toBeTruthy();
    expect(screen.queryByRole('region', { name: 'Chưa đăng được' })).toBeNull();
  });
});

describe('opening /submit without publishing', () => {
  it('never publishes a text on a visit or reload: one not published goes to C04 to be published from there', async () => {
    const replace = vi.fn();
    vi.stubGlobal('location', { ...window.location, replace, search: '?lang=vi', pathname: `/d/${ID}/submit` });
    renderWithI18n(<SubmitScreen id={ID} />);
    expect(screen.getByRole('status').textContent).toBe('Đang mở bài');
    await waitFor(() => expect(replace).toHaveBeenCalledWith(`/d/${ID}/publish`));
    expect(calls).toEqual([]);
  });

  it('sends a text left waiting for review back to C04 too: it is private until its author publishes it', async () => {
    status = 'pending';
    const replace = vi.fn();
    vi.stubGlobal('location', { ...window.location, replace, search: '?lang=vi', pathname: `/d/${ID}/submit` });
    renderWithI18n(<SubmitScreen id={ID} />);
    await waitFor(() => expect(replace).toHaveBeenCalledWith(`/d/${ID}/publish`));
    expect(calls).toEqual([]);
  });

  it('shows a published text as published, without publishing it again', async () => {
    status = 'approved';
    renderWithI18n(<SubmitScreen id={ID} />);
    expect(await screen.findByRole('heading', { name: 'Đã đăng' })).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Thử lại' })).toBeNull();
    expect(calls).toEqual([]);
  });

  it('publishes what C04 chose, once, and offers the AI translation C04 asked for', async () => {
    renderWithI18n(<SubmitScreen id={ID} request={{ space: 'networking', collection: 'c1', tags: ['dhcp', 'dora'], lang: 'vi' }} translateTo="en" />);
    expect(await screen.findByRole('heading', { name: 'Đã đăng' })).toBeTruthy();
    expect(calls.map((c) => c.body)).toEqual([{ space: 'networking', collection: 'c1', tags: ['dhcp', 'dora'], lang: 'vi' }]);
    expect(screen.getByRole('link', { name: 'Tạo bản dịch EN bằng AI' }).getAttribute('href')).toBe(`/d/${ID}/translate?to=en`);
  });
});

describe('publishing on a phone (M03 stages)', () => {
  afterEach(() => {
    delete document.documentElement.dataset.device;
  });

  it('shows the steps, then "Đã đăng" with the way to the text, its share page and to write another', async () => {
    document.documentElement.dataset.device = 'phone';
    submit = () =>
      new Promise((resolve) => {
        release = () => resolve(OK_ANSWER());
      });
    renderWithI18n(<SubmitScreen id={ID} request={{ space: 'networking', tags: ['dhcp'] }} />);
    expect(await screen.findByRole('heading', { name: 'Đang đăng…' })).toBeTruthy();
    expect(document.querySelector('[data-screen="M03"]')).not.toBeNull();
    expect(screen.getByRole('list', { name: 'Các bước đăng bài' }).querySelectorAll('li')).toHaveLength(3);
    await waitFor(() => expect(calls).toHaveLength(1));
    release();
    expect(await screen.findByRole('heading', { name: 'Đã đăng' })).toBeTruthy();
    expect(screen.getByRole('link', { name: 'Xem bài' }).getAttribute('href')).toBe(`/d/${ID}`);
    expect(screen.getByRole('link', { name: 'Chia sẻ' }).getAttribute('href')).toBe(`/d/${ID}/share`);
    expect(screen.getByRole('link', { name: 'Viết bài khác' }).getAttribute('href')).toBe('/create');
  });

  it('says it was not published and tries again after a dropped connection; "Để sau" goes back to the text', async () => {
    document.documentElement.dataset.device = 'phone';
    submit = () => Promise.reject(new TypeError('Failed to fetch'));
    renderWithI18n(<SubmitScreen id={ID} request={{ space: 'networking', tags: ['dhcp'] }} />);
    expect(await screen.findByRole('heading', { name: 'Chưa đăng được' })).toBeTruthy();
    expect(screen.getByRole('link', { name: 'Để sau' }).getAttribute('href')).toBe(`/d/${ID}`);
    submit = () => Promise.resolve(OK_ANSWER());
    fireEvent.click(screen.getByRole('button', { name: 'Thử lại' }));
    expect(await screen.findByRole('heading', { name: 'Đã đăng' })).toBeTruthy();
    expect(calls).toHaveLength(2);
  });

  it('leads to the fix when retrying cannot help (no title)', async () => {
    document.documentElement.dataset.device = 'phone';
    submit = () => Promise.resolve(answer(400, { error: 'title-required' }));
    renderWithI18n(<SubmitScreen id={ID} request={{ space: 'networking', tags: ['dhcp'] }} />);
    expect(await screen.findByRole('heading', { name: 'Chưa đăng được' })).toBeTruthy();
    expect(screen.getByRole('link', { name: 'Thêm tiêu đề' }).getAttribute('href')).toBe(`/d/${ID}/edit`);
    expect(screen.queryByRole('button', { name: 'Thử lại' })).toBeNull();
  });
});
