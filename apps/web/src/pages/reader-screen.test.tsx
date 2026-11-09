import { act, fireEvent, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { DocumentComments, DocumentSummary, DocumentView } from '../api/content-api';
import { KEYS_OPENAI, KEYS_NONE, answer, eventStream } from '../test/api-fakes';
import { SessionProvider } from '../layout/session-context';
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
    wikilinks: [],
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

type Route = (url: string, init?: RequestInit) => Response | Promise<Response>;
let fetchMock: ReturnType<typeof vi.fn>;
/** The reader's keys and the AI's answers (POST /api/ask). */
let keysRoute: Route = () => answer(200, KEYS_NONE);
let askRoute: Route = () => answer(403, { error: 'NO_USER_KEY' });

function serve(doc: Route, comments: Route = () => answer(200, COMMENTS)): void {
  fetchMock.mockImplementation(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    if (url.includes('/comments')) return comments(url, init);
    if (url.includes('/api/me/keys')) return keysRoute(url, init);
    if (url.includes('/api/ask')) return askRoute(url, init);
    if (url.includes('/progress')) {
      const body = JSON.parse(String(init?.body)) as { progress: number; anchor: string | null };
      return answer(200, body);
    }
    return doc(url, init);
  });
}

beforeEach(() => {
  keysRoute = () => answer(200, KEYS_NONE);
  askRoute = () => answer(403, { error: 'NO_USER_KEY' });
  window.history.replaceState(null, '', '/d/dhcp');
  fetchMock = vi.fn();
  vi.stubGlobal('fetch', fetchMock);
  serve(() => answer(200, view()));
  Element.prototype.scrollTo = vi.fn();
  Element.prototype.scrollIntoView = vi.fn();
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
    expect([...(steps?.querySelectorAll('li') ?? [])].map((li) => li.dataset.mark)).toEqual(['D', 'O', 'R', 'A']);
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

  it('links the [[ ]] titles the server resolved, and leaves an unresolved one as written', async () => {
    serve(() =>
      answer(
        200,
        view({
          toc: [{ anchor: 'tong-quan', title: null, level: 2 }],
          chunks: [{ anchor: 'tong-quan', heading: null, markdown: 'Trước DHCP, đọc [[ARP]]. Còn [[Bài chưa viết]].' }],
          wikilinks: [{ title: 'ARP', id: 'arp' }],
        }),
      ),
    );
    renderWithI18n(<ReaderScreen id="dhcp" />);
    await screen.findByRole('heading', { level: 1, name: 'Giao thức DHCP' });
    const passage = document.getElementById('tong-quan');
    expect([...(passage?.querySelectorAll('a') ?? [])].map((a) => [a.textContent, a.getAttribute('href')])).toEqual([['ARP', '/d/arp']]);
    expect(passage?.textContent).toContain('[[Bài chưa viết]]');
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
    expect(await screen.findByText('No key yet · AI needs your own key, Jev still suggests')).toBeTruthy();
    fireEvent.click(explain);
    const card = await screen.findByRole('region', { name: 'AI result' });
    await waitFor(() => expect(card.textContent).toContain('AI needs your own key to explain.'));
    expect(within(card).getByRole('link', { name: 'Add a key' }).getAttribute('href')).toBe('/settings/keys');
    const body = JSON.parse(String(fetchMock.mock.calls.find(([url]) => String(url) === '/api/ask')?.[1]?.body)) as Record<string, unknown>;
    expect(body).toMatchObject({ task: 'explain', scope: { kind: 'document', id: 'dhcp' } });
    fireEvent.click(screen.getByRole('button', { name: 'Summarise' }));
    await waitFor(() => expect(screen.getByRole('region', { name: 'AI result' }).textContent).toContain('to summarise'));
  });

  it('explains a selected passage from its toolbar, with sources, Jev’s check and the key', async () => {
    keysRoute = () => answer(200, KEYS_OPENAI);
    askRoute = () =>
      eventStream([
        ['status', { stage: 'searching', jev: 'ok', found: 0 }],
        ['sources', { sources: [{ n: 1, documentId: 'dhcp', anchor: 'broadcast', title: 'DHCP', section: 'Discover', spaceName: 'Networking', collectionName: null, origin: 'official', status: 'approved' }] }],
        ['status', { stage: 'writing', jev: 'ok', found: 1 }],
        ['delta', { text: 'Bạn hỏi to cả lớp [1].' }],
        ['check', { citations: [{ n: 1, supported: true }] }],
        ['done', { questionId: 'q1', provider: 'openai', model: 'gpt-4.1-mini', last4: 'a1b2' }],
      ]);
    Range.prototype.getClientRects = () => [] as unknown as DOMRectList;
    Range.prototype.getBoundingClientRect = () => new DOMRect(0, 0, 10, 10);
    renderWithI18n(<ReaderScreen id="dhcp" />);
    expect(await screen.findByText('Uses your OpenAI key ••••a1b2 · Jev checks citations for free')).toBeTruthy();
    const strong = document.querySelector('#broadcast strong');
    if (!strong?.firstChild) throw new Error('passage text missing');
    const range = document.createRange();
    range.selectNodeContents(strong);
    document.getSelection()?.removeAllRanges();
    document.getSelection()?.addRange(range);
    act(() => {
      document.dispatchEvent(new Event('selectionchange'));
    });
    const toolbar = await screen.findByRole('toolbar', { name: 'Actions on the selection' });
    expect(within(toolbar).getByRole('button', { name: 'Highlight' }).hasAttribute('disabled')).toBe(true);
    expect(within(toolbar).getByRole('link', { name: 'Ask Copilot' }).getAttribute('href')).toBe(
      `/copilot?${new URLSearchParams({ q: 'What does “255.255.255.255” mean?', scope: 'document:dhcp', from: 'dhcp' }).toString()}`,
    );
    fireEvent.click(within(toolbar).getByRole('button', { name: 'Explain' }));
    const card = await screen.findByRole('region', { name: 'AI result' });
    await waitFor(() => expect(card.getAttribute('data-state')).toBe('done'));
    expect(card.textContent).toContain('Explaining the selection');
    expect(within(card).getByRole('link', { name: '[1] DHCP § Discover' }).getAttribute('href')).toBe('/d/dhcp#broadcast');
    expect(within(card).getByRole('link', { name: 'Citation 1: DHCP § Discover' })).toBeTruthy();
    expect(card.textContent).toContain('Checked by Jev 1/1');
    expect(card.textContent).toContain('OpenAI key ••••a1b2');
    expect(within(toolbar).getByRole('button', { name: 'Explain' }).getAttribute('aria-pressed')).toBe('true');
    const body = JSON.parse(String(fetchMock.mock.calls.find(([url]) => String(url) === '/api/ask')?.[1]?.body)) as Record<string, unknown>;
    expect(body).toEqual({ task: 'explain', selection: '255.255.255.255', scope: { kind: 'document', id: 'dhcp' } });
  });

  it('offers an AI translation when the text is not in the reader’s language', async () => {
    serve(() => answer(200, view({ translationAvailable: false })));
    renderWithI18n(<ReaderScreen id="dhcp" />);
    expect((await screen.findByRole('link', { name: 'Translate with AI' })).getAttribute('href')).toBe('/d/dhcp/translate?to=en');
  });

  it('links each other language of the text to that translation', async () => {
    serve(() => answer(200, view({ translations: [{ id: 'dhcp', lang: 'vi', aiTranslated: false }, { id: 'dhcp-en', lang: 'en', aiTranslated: false }] })));
    renderWithI18n(<ReaderScreen id="dhcp" />);
    const link = await screen.findByRole('link', { name: 'EN version available' });
    expect(link.getAttribute('href')).toBe('/d/dhcp-en');
    expect(link.closest('.reader-meta-text')?.textContent).toBe('4 min read · VI · EN version available · updated 3 Nov');
  });

  it('shows a guest the comments and a sign-in button instead of the composer', async () => {
    serve(
      () => answer(200, view()),
      () => answer(200, COMMENTS),
    );
    window.history.replaceState(null, '', '/d/dhcp');
    renderWithI18n(
      <SessionProvider value={{ status: 'ready', signedIn: false, signInAvailable: true }}>
        <ReaderScreen id="dhcp" />
      </SessionProvider>,
    );
    const comments = await screen.findByRole('region', { name: 'Comments · 1' });
    expect(await within(comments).findByText('<b>@Linh</b> relay?')).toBeTruthy();
    expect(within(comments).queryByRole('textbox')).toBeNull();
    expect(within(comments).getByRole('link', { name: 'Sign in to comment' }).getAttribute('href')).toBe('/login?return=%2Fd%2Fdhcp%23binh-luan&go=1');
    window.history.replaceState(null, '', '/');
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
    expect(await screen.findByText('Comments open once the document is published.')).toBeTruthy();
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
    // Scrolling is measured on the next animation frame, then the save waits SAVE_DELAY_MS.
    await act(async () => {
      vi.advanceTimersByTime(SAVE_DELAY_MS + 20);
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

  it('sends a journey on to its run (Flow) instead of reading it as a text', async () => {
    const replace = vi.fn();
    vi.stubGlobal('location', { ...window.location, replace, pathname: '/d/path', search: '' });
    serve(() => answer(200, view({}, { id: 'path', type: 'journey', title: 'Máy mới vào mạng' })));
    renderWithI18n(<ReaderScreen id="path" />);
    await waitFor(() => expect(replace).toHaveBeenCalledWith('/journey/path'));
    expect(screen.queryByRole('heading', { level: 1, name: 'Máy mới vào mạng' })).toBeNull();
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

describe('ReaderScreen "Favourite"', () => {
  /** Serves the document as `favorite`, and answers the star's PUT / DELETE with `star` (recorded in `calls`). */
  function serveFavorite(favorite: boolean | null, star: Route): Array<{ url: string; method: string }> {
    const calls: Array<{ url: string; method: string }> = [];
    serve((url, init) => {
      if (url.endsWith('/favorite')) {
        calls.push({ url, method: init?.method ?? 'GET' });
        return star(url, init);
      }
      return answer(200, view({}, { favorite }));
    });
    return calls;
  }

  const favoriteButton = (): HTMLButtonElement => screen.getByRole('button', { name: 'Favourite' });

  it('starts from the document payload and turns off at once, before the server answers', async () => {
    let release: (res: Response) => void = () => undefined;
    const calls = serveFavorite(true, () => new Promise<Response>((resolve) => (release = resolve)));
    renderWithI18n(<ReaderScreen id="dhcp" />);
    await screen.findByRole('heading', { level: 1, name: 'Giao thức DHCP' });
    expect(favoriteButton().getAttribute('aria-pressed')).toBe('true');
    fireEvent.click(favoriteButton());
    expect(favoriteButton().getAttribute('aria-pressed')).toBe('false');
    // A second click while the first is on its way changes nothing.
    fireEvent.click(favoriteButton());
    expect(calls).toEqual([{ url: '/api/documents/dhcp/favorite', method: 'DELETE' }]);
    await act(async () => {
      release(new Response(null, { status: 204 }));
      await Promise.resolve();
    });
    await waitFor(() => expect(favoriteButton().getAttribute('aria-pressed')).toBe('false'));
    fireEvent.click(favoriteButton());
    expect(favoriteButton().getAttribute('aria-pressed')).toBe('true');
    await waitFor(() => expect(calls.at(-1)).toEqual({ url: '/api/documents/dhcp/favorite', method: 'PUT' }));
  });

  it('puts the star back and says so when the server refuses', async () => {
    serveFavorite(false, () => answer(500, { error: 'internal' }));
    renderWithI18n(<ReaderScreen id="dhcp" />);
    await screen.findByRole('heading', { level: 1, name: 'Giao thức DHCP' });
    fireEvent.click(favoriteButton());
    expect(favoriteButton().getAttribute('aria-pressed')).toBe('true');
    await waitFor(() => expect(favoriteButton().getAttribute('aria-pressed')).toBe('false'));
    expect(document.querySelector('[data-id="reader-favorite-status"]')?.textContent).toBe('The favourite was not saved · try again');
    expect(favoriteButton().title).toBe('The favourite was not saved · try again');
  });

  it('is off while offline, with the reason, and absent for a guest', async () => {
    const calls = serveFavorite(false, () => new Response(null, { status: 204 }));
    const { unmount } = renderWithI18n(<ReaderScreen id="dhcp" />);
    await screen.findByRole('heading', { level: 1, name: 'Giao thức DHCP' });
    vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(false);
    try {
      act(() => {
        window.dispatchEvent(new Event('offline'));
      });
      await waitFor(() => expect(favoriteButton().disabled).toBe(true));
      expect(favoriteButton().title).toBe('Offline · reconnect to save favourites');
      fireEvent.click(favoriteButton());
      expect(calls).toEqual([]);
    } finally {
      // never leave the next tests offline
      vi.restoreAllMocks();
      unmount();
    }

    serveFavorite(null, () => new Response(null, { status: 204 }));
    renderWithI18n(<ReaderScreen id="dhcp" />);
    await screen.findByRole('heading', { level: 1, name: 'Giao thức DHCP' });
    expect(screen.queryByRole('button', { name: 'Favourite' })).toBeNull();
  });

  it('toggles from the round button of the tablet actions (T02)', async () => {
    document.documentElement.dataset.device = 'tablet';
    try {
      const calls = serveFavorite(false, () => new Response(null, { status: 204 }));
      renderWithI18n(<ReaderScreen id="dhcp" />);
      await screen.findByRole('heading', { level: 1, name: 'Giao thức DHCP' });
      const star = within(document.querySelector<HTMLElement>('[data-id="reader-tablet-actions"]') ?? document.body).getByRole('button', { name: 'Favourite' });
      expect(star.getAttribute('aria-pressed')).toBe('false');
      fireEvent.click(star);
      expect(star.getAttribute('aria-pressed')).toBe('true');
      await waitFor(() => expect(calls).toEqual([{ url: '/api/documents/dhcp/favorite', method: 'PUT' }]));
    } finally {
      delete document.documentElement.dataset.device;
    }
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

describe('ReaderScreen on a tablet and a phone', () => {
  afterEach(() => {
    delete document.documentElement.dataset.device;
    sessionStorage.clear();
  });

  it('puts the contents in a drawer on a tablet (T02), and picking an entry closes it', async () => {
    document.documentElement.dataset.device = 'tablet';
    renderWithI18n(<ReaderScreen id="dhcp" />);
    await screen.findByRole('heading', { level: 1, name: 'Giao thức DHCP' });
    expect(document.querySelector('[data-id="reader-toc"]')).toBeNull();
    expect(document.querySelector('[data-id="reader-side"]')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Contents' }));
    const drawer = screen.getByRole('complementary', { name: 'Contents' });
    fireEvent.click(within(drawer).getByRole('link', { name: 'Broadcast là gì' }));
    expect(screen.queryByRole('complementary', { name: 'Contents' })).toBeNull();
    expect(within(screen.getByRole('region', { name: 'Backlinks and related' })).getByRole('link', { name: 'Giao thức ARP' })).toBeTruthy();
  });

  it('lays the text out for a phone (M05) with its contents sheet, and keeps Office files read-only', async () => {
    document.documentElement.dataset.device = 'phone';
    renderWithI18n(<ReaderScreen id="dhcp" />);
    await screen.findByRole('heading', { level: 1, name: 'Giao thức DHCP' });
    expect(document.querySelector('[data-screen="M05"]')).not.toBeNull();
    expect(screen.getByRole('navigation', { name: 'Open files' })).toBeTruthy();
    expect(within(screen.getByRole('region', { name: /Mentioned in/ })).getByRole('link', { name: /Giao thức ARP/ })).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Contents' }));
    const sheet = screen.getByRole('complementary', { name: 'Contents' });
    fireEvent.click(within(sheet).getByRole('button', { name: 'Broadcast là gì' }));
    expect(screen.queryByRole('complementary', { name: 'Contents' })).toBeNull();
    expect(Element.prototype.scrollIntoView).toHaveBeenCalled();
  });
});
