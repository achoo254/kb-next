import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { DocumentView } from '../api/content-api';
import { KEYS_OPENAI, answer, openStream, sse } from '../test/api-fakes';
import { renderWithI18n } from '../test/render';
import { TranslateScreen, targetLanguage } from './translate-screen';
import { roundedWords, sourceParagraphs, splitParagraphs, translatedPercent, wordCount } from './translate-source';

const T = '2026-11-03T14:05:00.000Z';
const NET = { slug: 'networking', nameVi: 'Networking', nameEn: 'Networking', tint: '#C4B5FD', glow: '#8B5CF6' };

/** The board's document: five one-line paragraphs about DHCP. */
const VI = [
  'Máy mới cắm vào mạng chưa có địa chỉ IP, nên chưa nói chuyện được với ai.',
  'Discover: máy gửi broadcast tới 255.255.255.255, hỏi ai cấp được IP.',
  'Offer: DHCP server trả lời, mời một địa chỉ còn trống.',
  'Request: máy xin đúng địa chỉ được mời.',
  'Acknowledge: server chốt, cho mượn IP trong một thời hạn (lease).',
];
const EN = [
  'A new device on the network has no IP address yet, so it cannot talk to anyone.',
  'Discover: the device broadcasts to 255.255.255.255, asking who can give it an IP.',
  'Offer: a DHCP server replies with a free address.',
  'Request: the device asks for exactly that address.',
  'Acknowledge: the server confirms and lends the IP for a period (the lease).',
];

function view(overrides: Partial<DocumentView> = {}): DocumentView {
  return {
    lang: 'vi',
    translationAvailable: true,
    document: {
      id: 'dhcp',
      title: 'Giao thức DHCP',
      type: 'lab',
      origin: 'official',
      status: 'approved',
      lang: 'vi',
      aiTranslated: false,
      updatedAt: T,
      authorName: 'Đạt',
      translations: ['vi'],
      collectionId: null,
      space: { ...NET, art: '/art/crystal-networking.webp', kind: 'public' },
      readProgress: 0,
      sourceUrl: null,
      createdAt: T,
      readingMinutes: 1,
      reviewedBy: null,
      readAnchor: null,
      collection: null,
    },
    translations: [{ id: 'dhcp', lang: 'vi', aiTranslated: false }],
    toc: [{ anchor: 'tong-quan', title: null, level: 2 }],
    chunks: [{ anchor: 'tong-quan', heading: null, markdown: VI.join('\n\n') }],
    backlinks: [],
    outgoing: [],
    wikilinks: [],
    related: [],
    versions: [],
    ...overrides,
  };
}

const KEYS = KEYS_OPENAI;

let fetchMock: ReturnType<typeof vi.fn>;
type Handler = (url: string, init?: RequestInit) => Response | Promise<Response>;

function serve({ doc = () => answer(200, view()), keys = () => answer(200, KEYS), translate }: { doc?: Handler; keys?: Handler; translate: Handler }): void {
  fetchMock.mockImplementation(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    if (url === '/api/me/keys') return keys(url, init);
    if (url.endsWith('/translate')) return translate(url, init);
    return doc(url, init);
  });
}

function translateCalls(): Array<RequestInit | undefined> {
  return fetchMock.mock.calls.filter(([url]) => String(url).endsWith('/translate')).map(([, init]) => init as RequestInit | undefined);
}

beforeEach(() => {
  window.history.replaceState(null, '', '/d/dhcp/translate');
  fetchMock = vi.fn();
  vi.stubGlobal('fetch', fetchMock);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('TranslateScreen', () => {
  it('streams the translation paragraph by paragraph beside the numbered original, then links to it', async () => {
    const stream = openStream();
    serve({ translate: () => stream.response });
    renderWithI18n(<TranslateScreen id="dhcp" />);

    const source = await screen.findByRole('region', { name: 'Original in Vietnamese' });
    expect(within(source).getByText('Original · Tiếng Việt')).toBeTruthy();
    expect(within(source).getAllByRole('listitem').map((row) => row.textContent)).toEqual(VI.map((text, i) => `${i + 1}${text}`));
    expect(screen.getByRole('heading', { level: 1, name: 'Giao thức DHCP' })).toBeTruthy();
    expect(screen.getByText('VI → EN')).toBeTruthy();
    expect(screen.getByText('AI translation · not checked')).toBeTruthy();
    await waitFor(() => expect(translateCalls()).toHaveLength(1));
    expect(JSON.parse(String(translateCalls()[0]?.body))).toEqual({ to: 'en' });

    stream.send('paragraph', { index: 0, text: '# DHCP' });
    EN.slice(0, 3).forEach((text, i) => stream.send('paragraph', { index: i + 1, text }));
    stream.send('paragraph', { index: 4, text: 'Request: the device asks for' });

    const target = screen.getByRole('region', { name: 'Translation in English' });
    expect(within(target).getByText('gpt-4.1-mini · key ••••a1b2')).toBeTruthy();
    await waitFor(() => expect(screen.getByRole('progressbar', { name: 'Translation progress' }).getAttribute('aria-valuenow')).toBe('70'));
    const rows = within(target).getAllByRole('listitem');
    expect(rows.map((row) => row.dataset.state)).toEqual(['done', 'done', 'done', 'writing', 'waiting']);
    expect(rows[3]?.textContent).toBe('4Request: the device asks for|');
    // The row being written is lit on both sides.
    expect(source.querySelector('[data-current]')?.textContent).toContain('Request: máy xin');
    expect(screen.getByRole('button', { name: 'Stop' })).toBeTruthy();

    stream.send('paragraph', { index: 4, text: EN[3] });
    stream.send('paragraph', { index: 5, text: EN[4] });
    stream.send('done', { documentId: 'dhcp-en' });
    stream.end();

    const read = await screen.findByRole('link', { name: 'Read the translation' });
    expect(read.getAttribute('href')).toBe('/d/dhcp-en?lang=en');
    expect(screen.getByRole('progressbar').getAttribute('aria-valuenow')).toBe('100');
    expect(screen.getByRole('status').textContent).toBe('Translated and saved as a draft only you can see.');
    expect(within(target).getAllByRole('listitem').map((row) => row.textContent)).toEqual(EN.map((text, i) => `${i + 1}${text}`));
  });

  it('stops the stream on “Stop”: the request is aborted and nothing is offered to read', async () => {
    const stream = openStream();
    serve({ translate: () => stream.response });
    renderWithI18n(<TranslateScreen id="dhcp" />);
    await waitFor(() => expect(translateCalls()).toHaveLength(1));
    stream.send('paragraph', { index: 1, text: 'A new device' });
    fireEvent.click(await screen.findByRole('button', { name: 'Stop' }));

    expect((translateCalls()[0]?.signal as AbortSignal).aborted).toBe(true);
    expect(screen.getByRole('status').textContent).toBe('Stopped. The part translated so far was not saved.');
    expect(screen.queryByRole('link', { name: 'Read the translation' })).toBeNull();
    // "Translate again" starts a new run.
    fireEvent.click(screen.getByRole('button', { name: 'Translate again' }));
    await waitFor(() => expect(translateCalls()).toHaveLength(2));
  });

  it('asks for a key without calling the provider when the reader has no working key', async () => {
    serve({ keys: () => answer(200, { ...KEYS, keys: [], active: null }), translate: () => answer(500, {}) });
    renderWithI18n(<TranslateScreen id="dhcp" />);
    expect(await screen.findByRole('heading', { name: 'Add a key to translate' })).toBeTruthy();
    expect(screen.getByText('Translation runs on your own model (OpenAI, Gemini or Claude). This document is about 58 words.')).toBeTruthy();
    expect(screen.getByRole('link', { name: 'Open Own keys' }).getAttribute('href')).toBe('/settings/keys');
    expect(translateCalls()).toHaveLength(0);
  });

  it('shows the no-key state when the server answers 403 NO_USER_KEY', async () => {
    serve({ translate: () => answer(403, { error: 'NO_USER_KEY' }) });
    renderWithI18n(<TranslateScreen id="dhcp" />);
    expect(await screen.findByRole('heading', { name: 'Add a key to translate' })).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Stop' })).toBeNull();
  });

  it('says the key was refused, keeps what was written and offers to fix the key or try again', async () => {
    serve({ translate: () => new Response(sse('paragraph', { index: 1, text: 'A new device' }) + sse('error', { code: 'USER_KEY_REJECTED', provider: 'openai', last4: 'a1b2' })) });
    renderWithI18n(<TranslateScreen id="dhcp" />);
    expect((await screen.findByRole('alert')).textContent).toBe('The provider refused your key. Fix it in Own keys, then translate again.');
    expect(screen.getByText('A new device')).toBeTruthy();
    expect(screen.getByRole('link', { name: 'Open Own keys' }).getAttribute('href')).toBe('/settings/keys');
    expect(screen.getByRole('button', { name: 'Translate again' })).toBeTruthy();
  });

  it('treats a stream that ends without done as a dropped connection', async () => {
    serve({ translate: () => new Response(sse('paragraph', { index: 1, text: 'A new device' })) });
    renderWithI18n(<TranslateScreen id="dhcp" />);
    expect((await screen.findByRole('alert')).textContent).toBe('The connection dropped halfway. Nothing was saved.');
  });

  it('says when too many AI requests were made', async () => {
    serve({ translate: () => answer(429, { error: 'rate-limited' }) });
    renderWithI18n(<TranslateScreen id="dhcp" />);
    expect((await screen.findByRole('alert')).textContent).toBe('Too many AI requests in a minute. Wait a moment, then translate again.');
  });

  it('does not offer to translate again a document too long to translate', async () => {
    serve({ translate: () => answer(400, { error: 'too-long' }) });
    renderWithI18n(<TranslateScreen id="dhcp" />);
    expect((await screen.findByRole('alert')).textContent).toBe('This document is too long to translate in one go.');
    expect(screen.queryByRole('button', { name: 'Translate again' })).toBeNull();
  });

  it('sends the reader to save the key again when the server cannot read it', async () => {
    serve({ translate: () => answer(403, { error: 'USER_KEY_UNREADABLE' }) });
    renderWithI18n(<TranslateScreen id="dhcp" />);
    expect((await screen.findByRole('alert')).textContent).toBe('The server can no longer read your key. Save it again in Own keys, then translate again.');
    expect(screen.getByRole('link', { name: 'Open Own keys' }).getAttribute('href')).toBe('/settings/keys');
  });

  it('shows the switched-off state when own keys are off on the server', async () => {
    serve({ keys: () => answer(200, { ...KEYS, available: false, keys: [], active: null }), translate: () => answer(500, {}) });
    renderWithI18n(<TranslateScreen id="dhcp" />);
    expect(await screen.findByRole('heading', { name: 'AI translation is off' })).toBeTruthy();
    expect(translateCalls()).toHaveLength(0);
  });

  it('opens the original when the reader’s language has a translation of it', async () => {
    const stream = openStream();
    const english = view({ lang: 'en', document: { ...view().document, id: 'dhcp-en', lang: 'en', title: 'DHCP' }, translations: [{ id: 'dhcp', lang: 'vi', aiTranslated: false }, { id: 'dhcp-en', lang: 'en', aiTranslated: true }] });
    serve({ doc: (url) => answer(200, url === '/api/documents/dhcp' ? english : view()), translate: () => stream.response });
    renderWithI18n(<TranslateScreen id="dhcp" />);
    expect(await screen.findByRole('heading', { level: 1, name: 'Giao thức DHCP' })).toBeTruthy();
    expect(fetchMock.mock.calls.map(([url]) => String(url))).toContain('/api/documents/dhcp?lang=vi');
  });

  it('shows the not-found panel for a document that does not exist', async () => {
    serve({ doc: () => answer(404, { error: 'not-found' }), translate: () => answer(500, {}) });
    renderWithI18n(<TranslateScreen id="nope" />);
    await waitFor(() => expect(document.querySelector('[data-id="translate-screen"]')?.getAttribute('data-state')).toBe('not-found'));
    expect(document.querySelector('[data-id="error-not-found"]')).toBeTruthy();
  });
});

describe('translation helpers', () => {
  it('numbers the original as the server does: the title first, a fenced block whole', () => {
    expect(splitParagraphs('a\n\n```sh\nls\n\nls -l\n```\n\n\nb')).toEqual(['a', '```sh\nls\n\nls -l\n```', 'b']);
    const sections = view({
      toc: [
        { anchor: 'tong-quan', title: null, level: 2 },
        { anchor: 'lease', title: 'Lease', level: 3 },
      ],
      chunks: [
        { anchor: 'tong-quan', heading: null, markdown: 'Một.\n\nHai.' },
        { anchor: 'lease', heading: 'Lease', markdown: 'Ba.' },
      ],
    });
    expect(sourceParagraphs(sections)).toEqual(['# Giao thức DHCP', 'Một.', 'Hai.', '### Lease', 'Ba.']);
  });

  it('counts words and rounds them as "about N words"', () => {
    expect(wordCount(['Máy mới **cắm** vào mạng.', '- 255.255.255.255 là broadcast'])).toBe(8);
    expect(roundedWords(61)).toBe(61);
    expect(roundedWords(437)).toBe(440);
    expect(roundedWords(2389)).toBe(2400);
  });

  it('measures progress as rows done plus half of the row being written', () => {
    expect(translatedPercent(4, 5, false)).toBe(70);
    expect(translatedPercent(-1, 5, false)).toBe(0);
    expect(translatedPercent(0, 5, false)).toBe(0);
    expect(translatedPercent(5, 5, false)).toBe(90);
    expect(translatedPercent(5, 5, true)).toBe(100);
  });

  it('translates into ?to= or else the other language', () => {
    expect(targetLanguage('', 'vi')).toBe('en');
    expect(targetLanguage('', 'en')).toBe('vi');
    expect(targetLanguage('?to=vi', 'vi')).toBe('vi');
    expect(targetLanguage('?to=fr', 'en')).toBe('vi');
  });
});
