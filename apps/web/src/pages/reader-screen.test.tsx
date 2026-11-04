import { act, fireEvent, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { DocumentComments, DocumentSummary, DocumentView } from '../api/content-api';
import { renderWithI18n } from '../test/render';
import { timeAgo } from './reader-messages';
import { SAVE_DELAY_MS, scrolledPercent } from './reader-progress';
import { ReaderScreen } from './reader-screen';

const NET = { slug: 'networking', nameVi: 'Networking', nameEn: 'Networking', tint: '#C4B5FD', glow: '#8B5CF6' };
const T = '2026-11-03T14:05:00.000Z';

function summary(id: string, title: string, extra: Partial<DocumentSummary> = {}): DocumentSummary {
  return {
    id,
    title,
    type: 'lab',
    origin: 'official',
    status: 'approved',
    lang: 'vi',
    aiTranslated: false,
    updatedAt: T,
    authorName: 'Đạt',
    translations: ['vi'],
    collectionId: 'c1',
    space: NET,
    readProgress: 0,
    ...extra,
  };
}

const OVERVIEW = [
  'Máy mới vào mạng chưa có IP.',
  '1. **Discover** Hét lên cả mạng xin IP',
  '2. **Offer** Server mời một IP',
  '3. **Request** Máy xin đúng IP đó',
  '4. **Acknowledge** Chốt, cho mượn có hạn',
].join('\n\n');

function view(overrides: Partial<DocumentView> = {}, documentOverrides: Partial<DocumentView['document']> = {}): DocumentView {
  return {
    lang: 'en',
    translationAvailable: true,
    document: {
      ...summary('dhcp', 'Giao thức DHCP', { readProgress: 72 }),
      sourceUrl: null,
      createdAt: T,
      readingMinutes: 4,
      reviewedBy: 'Linh',
      readAnchor: 'broadcast',
      collection: { id: 'c1', nameVi: 'Giao thức nền tảng', nameEn: 'Core protocols' },
      space: { ...NET, art: '/art/crystal-networking.webp', kind: 'public' },
      ...documentOverrides,
    },
    translations: [{ id: 'dhcp', lang: 'vi', aiTranslated: false }],
    toc: [
      { anchor: 'tong-quan', title: null, level: 2 },
      { anchor: 'broadcast', title: 'Broadcast là gì', level: 2 },
    ],
    chunks: [
      { anchor: 'tong-quan', heading: null, markdown: OVERVIEW },
      { anchor: 'broadcast', heading: 'Broadcast là gì', markdown: 'Gửi tới **255.255.255.255**. Xem [ARP](/d/arp) và [RFC](https://example.org/rfc2131).' },
    ],
    backlinks: [
      { kind: 'wikilink', label: null, document: summary('arp', 'Giao thức ARP') },
      { kind: 'relation', label: 'bước 1', document: summary('path', 'Máy mới vào mạng', { type: 'journey' }) },
      { kind: 'wikilink', label: null, document: summary('notes', 'lab-notes.docx', { type: 'office', origin: 'own', status: 'private' }) },
    ],
    outgoing: [],
    related: [
      { ...summary('arp', 'Giao thức ARP'), relevance: 75 },
      { ...summary('spoof', 'Ghi chú: DHCP giả mạo'), relevance: 68 },
      { ...summary('path', 'Máy mới vào mạng'), relevance: 60 },
      { ...summary('dns', 'DNS'), relevance: 34 },
    ],
    versions: [
      { version: 4, editorName: 'Đạt', createdAt: T },
      { version: 3, editorName: 'Đạt', createdAt: '2026-10-29T14:05:00.000Z' },
      { version: 2, editorName: 'Linh', createdAt: '2026-10-24T14:05:00.000Z' },
      { version: 1, editorName: 'Đạt', createdAt: '2026-10-01T03:00:00.000Z' },
    ],
    ...overrides,
  };
}

const COMMENTS: DocumentComments = {
  open: true,
  comments: [
    {
      id: 'k1',
      anchor: null,
      body: '<b>@Linh</b> relay?',
      createdAt: '2026-11-03T12:05:00.000Z',
      updatedAt: '2026-11-03T12:05:00.000Z',
      author: { name: 'Minh', picture: null, role: 'member' },
      mine: false,
    },
  ],
};

function answer(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
}

type Route = (url: string, init?: RequestInit) => Response | Promise<Response>;
let fetchMock: ReturnType<typeof vi.fn>;

function serve(doc: Route, comments: Route = () => answer(200, COMMENTS)): void {
  fetchMock.mockImplementation(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    if (url.includes('/comments')) return comments(url, init);
    if (url.includes('/progress')) {
      const body = JSON.parse(String(init?.body)) as { progress: number; anchor: string | null };
      return answer(200, body);
    }
    return doc(url, init);
  });
}

beforeEach(() => {
  window.history.replaceState(null, '', '/d/dhcp');
  fetchMock = vi.fn();
  vi.stubGlobal('fetch', fetchMock);
  serve(() => answer(200, view()));
  Element.prototype.scrollTo = vi.fn();
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe('ReaderScreen', () => {
  it('shows the document: meta, contents, passages with anchors, step cards, links, related and versions', async () => {
    renderWithI18n(<ReaderScreen id="dhcp" />);
    expect(await screen.findByRole('heading', { level: 1, name: 'Giao thức DHCP' })).toBeTruthy();
    expect(String(fetchMock.mock.calls[0]?.[0])).toBe('/api/documents/dhcp?lang=en');
    expect(screen.getByText('Official')).toBeTruthy();
    expect(screen.getByText('Reviewed by Linh')).toBeTruthy();
    expect(screen.getByText('4 min read · VI · updated 3 Nov')).toBeTruthy();

    const toc = screen.getByRole('navigation', { name: 'Contents' });
    const entries = within(toc).getAllByRole('link');
    expect(entries.map((a) => [a.textContent, a.getAttribute('href')])).toEqual([
      ['Overview', '#tong-quan'],
      ['Broadcast là gì', '#broadcast'],
      ['Comments', '#binh-luan'],
    ]);
    // Resumes at the passage read last (already on screen: no scroll, but it is the current one).
    await waitFor(() => expect(within(toc).getByRole('link', { name: 'Broadcast là gì' }).getAttribute('aria-current')).toBe('location'));

    expect(document.getElementById('broadcast')?.querySelector('h2')?.textContent).toBe('Broadcast là gì');
    const steps = document.querySelector('ol.reader-steps');
    expect(steps).toBeTruthy();
    expect([...(steps?.querySelectorAll('li') ?? [])].map((li) => li.dataset.letter)).toEqual(['D', 'O', 'R', 'A']);
    expect(screen.getByRole('link', { name: 'RFC' }).getAttribute('rel')).toBe('noopener noreferrer');
    expect(screen.getByRole('link', { name: 'ARP' }).getAttribute('target')).toBeNull();

    const backlinks = screen.getByRole('region', { name: 'Backlinks · 3 documents mention this one' });
    expect(within(backlinks).getAllByRole('link').map((a) => a.textContent)).toEqual(['Máy mới vào mạngPath', 'Giao thức ARPLab', 'lab-notes.docxYours']);

    const related = screen.getByRole('region', { name: /Related/ });
    expect(within(related).getAllByRole('link')).toHaveLength(3);
    expect(within(related).getByRole('img', { name: 'Relevance 0.75' })).toBeTruthy();

    const versions = screen.getByRole('button', { name: /Versions and activity/ });
    expect(versions.textContent).toContain('Linh reviewed 3 Nov · 4 versions');
    fireEvent.click(versions);
    expect(screen.getByText('v2 · Linh · 24 Oct')).toBeTruthy();

    const crumbs = screen.getByRole('navigation', { name: 'You are here' });
    expect(within(crumbs).getAllByRole('link').map((a) => a.getAttribute('href'))).toEqual(['/u', '/s/networking', '/s/networking?c=c1']);
  });

  it('renders Markdown without raw HTML or script URLs', async () => {
    serve(() =>
      answer(
        200,
        view({
          toc: [{ anchor: 'tong-quan', title: null, level: 2 }],
          chunks: [{ anchor: 'tong-quan', heading: null, markdown: 'Hi <script>alert(1)</script><img src=x onerror=alert(1)> [bad](javascript:alert(1))' }],
        }),
      ),
    );
    renderWithI18n(<ReaderScreen id="dhcp" />);
    await screen.findByRole('heading', { level: 1, name: 'Giao thức DHCP' });
    const passage = document.getElementById('tong-quan');
    expect(passage?.querySelector('script')).toBeNull();
    expect(passage?.querySelector('img')).toBeNull();
    expect(passage?.querySelector('a')?.getAttribute('href') ?? '').not.toContain('javascript');
  });

  it('opens at a #anchor deep link', async () => {
    window.history.replaceState(null, '', '/d/dhcp#tong-quan');
    renderWithI18n(<ReaderScreen id="dhcp" />);
    const overview = await screen.findByRole('link', { name: 'Overview' });
    await waitFor(() => expect(overview.getAttribute('aria-current')).toBe('location'));
    expect(Element.prototype.scrollTo).toHaveBeenCalled();
  });

  it('asks for the reader’s own key before AI explains or summarises', async () => {
    renderWithI18n(<ReaderScreen id="dhcp" />);
    const explain = await screen.findByRole('button', { name: 'Explain this passage' });
    expect(screen.getByText('No key yet · AI needs your own key, Jev still suggests')).toBeTruthy();
    fireEvent.click(explain);
    const notice = screen.getByRole('status');
    expect(notice.textContent).toContain('AI needs your own key to explain.');
    expect(within(notice).getByRole('link', { name: 'Add a key' }).getAttribute('href')).toBe('/settings');
    fireEvent.click(screen.getByRole('button', { name: 'Summarise' }));
    expect(screen.getByRole('status').textContent).toContain('to summarise');
  });

  it('offers an AI translation when the text is not in the reader’s language', async () => {
    serve(() => answer(200, view({ translationAvailable: false })));
    renderWithI18n(<ReaderScreen id="dhcp" />);
    expect((await screen.findByRole('link', { name: 'Translate with AI' })).getAttribute('href')).toBe('/settings');
  });

  it('shows comments as plain text and posts a new one', async () => {
    serve(
      () => answer(200, view()),
      (_url, init) =>
        init?.method === 'POST'
          ? answer(200, { ...COMMENTS.comments[0], id: 'k2', body: 'Cảm ơn', author: { name: 'Bạn', picture: null, role: 'member' }, mine: true })
          : answer(200, COMMENTS),
    );
    renderWithI18n(<ReaderScreen id="dhcp" />);
    const comments = await screen.findByRole('region', { name: 'Comments · 1' });
    expect(await within(comments).findByText('<b>@Linh</b> relay?')).toBeTruthy();
    expect(comments.querySelector('b')).toBeNull();
    fireEvent.change(within(comments).getByRole('textbox', { name: 'Write a comment' }), { target: { value: '  Cảm ơn  ' } });
    fireEvent.click(within(comments).getByRole('button', { name: 'Send' }));
    expect(await screen.findByText('Cảm ơn')).toBeTruthy();
    const post = fetchMock.mock.calls.find(([, init]) => (init as RequestInit | undefined)?.method === 'POST');
    expect(JSON.parse(String((post?.[1] as RequestInit).body))).toEqual({ body: 'Cảm ơn', anchor: null });
  });

  it('has no composer on a document that is not published', async () => {
    serve(
      () => answer(200, view()),
      () => answer(200, { open: false, comments: [] }),
    );
    renderWithI18n(<ReaderScreen id="dhcp" />);
    expect(await screen.findByText('Comments open once the document is approved.')).toBeTruthy();
    expect(screen.queryByRole('textbox', { name: 'Write a comment' })).toBeNull();
  });

  it('saves the reading progress while scrolling, once per pause', async () => {
    renderWithI18n(<ReaderScreen id="dhcp" />);
    await screen.findByRole('heading', { level: 1, name: 'Giao thức DHCP' });
    const panel = document.querySelector<HTMLElement>('[data-id="reader-panel"]');
    if (!panel) throw new Error('no panel');
    Object.defineProperties(panel, { scrollHeight: { value: 2000 }, clientHeight: { value: 740 }, scrollTop: { value: 1060, writable: true } });
    vi.useFakeTimers();
    fireEvent.scroll(panel);
    fireEvent.scroll(panel);
    await act(async () => {
      vi.advanceTimersByTime(SAVE_DELAY_MS);
    });
    vi.useRealTimers();
    await waitFor(() => expect(fetchMock.mock.calls.filter(([url]) => String(url).includes('/progress'))).toHaveLength(1));
    const save = fetchMock.mock.calls.find(([url]) => String(url).includes('/progress'));
    expect(JSON.parse(String((save?.[1] as RequestInit).body))).toMatchObject({ progress: 90 });
  });

  it('shows the loading shapes, then the states of a document that cannot be read', async () => {
    let release: (value: Response) => void = () => undefined;
    serve(() => new Promise<Response>((resolve) => (release = resolve)));
    const first = renderWithI18n(<ReaderScreen id="dhcp" />);
    expect(screen.getByLabelText('Loading the document').getAttribute('aria-busy')).toBe('true');
    release(answer(403, { error: 'no-access' }));
    await waitFor(() => expect(document.querySelector('[data-id="error-forbidden"]')).toBeTruthy());
    first.unmount();

    serve(() => answer(403, { error: 'hidden' }));
    const second = renderWithI18n(<ReaderScreen id="dhcp" />);
    expect(await screen.findByText('This document is hidden for now')).toBeTruthy();
    second.unmount();

    serve(() => Promise.reject(new TypeError('Failed to fetch')));
    renderWithI18n(<ReaderScreen id="dhcp" />);
    expect(await screen.findByText('You are offline')).toBeTruthy();
    serve(() => answer(200, view()));
    fireEvent.click(screen.getByRole('button', { name: 'Try again' }));
    expect(await screen.findByRole('heading', { level: 1, name: 'Giao thức DHCP' })).toBeTruthy();
  });

  it('shows the offline banner and pauses AI when the connection drops while reading', async () => {
    renderWithI18n(<ReaderScreen id="dhcp" />);
    await screen.findByRole('heading', { level: 1, name: 'Giao thức DHCP' });
    vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(false);
    act(() => {
      window.dispatchEvent(new Event('offline'));
    });
    expect(document.querySelector('[data-id="reader-offline-banner"]')?.textContent).toMatch(/^Offline · reading the copy loaded at \d\d:\d\d · AI paused$/);
    expect((screen.getByRole('button', { name: 'Explain this passage' }) as HTMLButtonElement).disabled).toBe(true);
    vi.restoreAllMocks();
  });
});

describe('reader helpers', () => {
  it('says how long ago and how far down', () => {
    const now = new Date('2026-11-03T14:05:00.000Z').getTime();
    expect(timeAgo('vi', '2026-11-03T12:05:00.000Z', now)).toBe('2 giờ trước');
    expect(timeAgo('en', '2026-11-03T13:05:00.000Z', now)).toBe('1 hour ago');
    expect(scrolledPercent(0, 740, 740)).toBe(100);
    expect(scrolledPercent(0, 740, 1480)).toBe(50);
    expect(scrolledPercent(0, 0, 0)).toBe(0);
  });
});
