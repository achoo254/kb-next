import { act, fireEvent, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { DocumentView } from '../api/content-api';
import type { CopilotHistory } from '../api/copilot-api';
import type { KeysResponse } from '../api/keys-api';
import { KEYS_NONE, KEYS_OPENAI, answer, eventStream, openStream } from '../test/api-fakes';
import { renderWithI18n } from '../test/render';
import { CopilotScreen, historyGroups } from './copilot-screen';

const NOW = new Date();
const NET = { slug: 'networking', nameVi: 'Networking', nameEn: 'Networking', tint: '#C4B5FD', glow: '#8B5CF6' };

const DOCUMENT: DocumentView = {
  lang: 'en',
  translationAvailable: true,
  document: {
    id: 'dhcp',
    title: 'Giao thức DHCP',
    type: 'lab',
    origin: 'official',
    status: 'approved',
    lang: 'vi',
    aiTranslated: false,
    updatedAt: NOW.toISOString(),
    authorName: 'Đạt',
    translations: ['vi'],
    collectionId: 'c1',
    space: { ...NET, art: '/art/crystal-networking.webp', kind: 'public' },
    readProgress: 0,
    sourceUrl: null,
    createdAt: NOW.toISOString(),
    readingMinutes: 1,
    reviewedBy: null,
    readAnchor: null,
    collection: { id: 'c1', nameVi: 'Giao thức nền tảng', nameEn: 'Core protocols' },
  },
  translations: [{ id: 'dhcp', lang: 'vi', aiTranslated: false }],
  toc: [],
  chunks: [],
  backlinks: [],
  outgoing: [],
  related: [],
  versions: [],
};

const HISTORY = {
  items: [
    { id: 'q-today', task: 'summarize', question: 'Tóm tắt lab DNS trong 5 ý', scope: { kind: 'universe', id: null }, createdAt: NOW.toISOString() },
    { id: 'q-yesterday', task: 'answer', question: 'So sánh TCP và UDP bằng bảng', scope: { kind: 'universe', id: null }, createdAt: new Date(NOW.getTime() - 86_400_000).toISOString() },
  ],
};

const SOURCE = { n: 1, documentId: 'dhcp', anchor: 'tong-quan', title: 'Giao thức DHCP', section: 'DORA', spaceName: 'Networking', collectionName: 'Giao thức nền tảng', origin: 'official', status: 'approved' };

function answered(questionId = 'q-new'): Response {
  return eventStream([
    ['status', { stage: 'searching', jev: 'ok', found: 0 }],
    ['sources', { sources: [SOURCE] }],
    ['status', { stage: 'writing', jev: 'ok', found: 1 }],
    ['delta', { text: 'Máy mới gửi Discover tới cả mạng [1].' }],
    ['check', { citations: [{ n: 1, supported: true }] }],
    ['done', { questionId, provider: 'openai', model: 'gpt-4.1-mini', last4: 'a1b2' }],
  ]);
}

type Handler = (url: string, init?: RequestInit) => Response | Promise<Response>;
let fetchMock: ReturnType<typeof vi.fn>;
let routes: { keys: Handler; ask: Handler; prefs: Handler; item: Handler };

function asks(): Array<Record<string, unknown>> {
  return fetchMock.mock.calls.filter(([url]) => String(url) === '/api/ask').map(([, init]) => JSON.parse(String((init as RequestInit).body)) as Record<string, unknown>);
}

beforeEach(() => {
  routes = {
    keys: () => answer(200, KEYS_OPENAI),
    ask: () => answered(),
    prefs: () => answer(500, {}),
    item: () => answer(404, { error: 'not-found' }),
  };
  fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    if (url.startsWith('/api/documents/dhcp')) return answer(200, DOCUMENT);
    if (url === '/api/copilot/history') return answer(200, HISTORY);
    if (url.startsWith('/api/copilot/history/')) return routes.item(url, init);
    if (url === '/api/me/keys') return routes.keys(url, init);
    if (url === '/api/me/key-prefs') return routes.prefs(url, init);
    if (url === '/api/ask') return routes.ask(url, init);
    return answer(404, { error: 'not-found' });
  });
  vi.stubGlobal('fetch', fetchMock);
  window.history.replaceState(null, '', '/copilot');
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

function state(): string | null | undefined {
  return document.querySelector('[data-id="copilot-screen"]')?.getAttribute('data-state');
}

describe('CopilotScreen (C14)', () => {
  it('asks the question of its address in the scope it was opened with, then keeps the answer in the address', async () => {
    window.history.replaceState(null, '', `/copilot?${new URLSearchParams({ q: 'Máy mới lấy IP kiểu gì?', scope: 'space:networking', from: 'dhcp' }).toString()}`);
    renderWithI18n(<CopilotScreen />);
    await waitFor(() => expect(state()).toBe('done'));
    expect(asks()).toEqual([{ question: 'Máy mới lấy IP kiểu gì?', scope: { kind: 'space', id: 'networking' } }]);

    // scope chips of the page that opened Copilot, and the way back to it
    const chips = within(await screen.findByRole('group', { name: 'Scope' }));
    await waitFor(() => expect(chips.getAllByRole('button').map((chip) => chip.textContent)).toEqual(['Universe', 'Space · Networking', 'Collection · Core protocols', 'Document · Giao thức DHCP']));
    expect(chips.getByRole('button', { name: 'Space · Networking' }).getAttribute('aria-pressed')).toBe('true');
    expect(screen.getByRole('link', { name: 'Opened from: Giao thức DHCP' }).getAttribute('href')).toBe('/d/dhcp');

    // the answer, its citation, Jev's check and its sources
    expect(screen.getByRole('link', { name: 'Citation 1: Giao thức DHCP § DORA' }).getAttribute('href')).toBe('/d/dhcp#tong-quan');
    expect(screen.getByText('Jev: 1/1 citations match their sources')).toBeTruthy();
    const sources = within(screen.getByRole('complementary', { name: 'Sources' }));
    expect(sources.getByRole('heading', { name: 'Sources in scope · 1' })).toBeTruthy();
    expect(sources.getByRole('link', { name: /Giao thức DHCP § DORA/ }).getAttribute('href')).toBe('/d/dhcp#tong-quan');
    expect(screen.getByText('Written with OpenAI key ••••a1b2')).toBeTruthy();
    // what the API cannot do yet shows disabled
    expect(screen.getByRole('button', { name: 'Create a document from the answer' }).hasAttribute('disabled')).toBe(true);

    // the new question tops today's history, and a reload opens it instead of asking again
    const history = within(screen.getByRole('navigation', { name: 'Question history' }));
    await waitFor(() => expect(history.getAllByRole('button').map((item) => item.textContent)).toEqual(['Máy mới lấy IP kiểu gì?', 'Tóm tắt lab DNS trong 5 ý', 'So sánh TCP và UDP bằng bảng']));
    expect(history.getByRole('button', { name: 'Máy mới lấy IP kiểu gì?' }).getAttribute('aria-current')).toBe('true');
    expect(window.location.search).toBe('?scope=space%3Anetworking&from=dhcp&h=q-new');
  });

  it('opens a question of the history and asks the next one in the chosen scope', async () => {
    routes.item = () =>
      answer(200, {
        id: 'q-yesterday',
        task: 'answer',
        question: 'So sánh TCP và UDP bằng bảng',
        selection: null,
        scope: { kind: 'universe', id: null },
        answer: '| TCP | UDP |\n|---|---|\n| tin cậy | nhanh |',
        sources: [{ ...SOURCE, available: false, title: '' }],
        citations: null,
        provider: 'openai',
        model: 'gpt-4.1-mini',
        createdAt: HISTORY.items[1]?.createdAt,
      });
    renderWithI18n(<CopilotScreen />);
    expect(screen.getByText('Ask about the knowledge in this scope')).toBeTruthy();
    fireEvent.click(await screen.findByRole('button', { name: 'So sánh TCP và UDP bằng bảng' }));
    await waitFor(() => expect(state()).toBe('done'));
    expect(screen.getByRole('table')).toBeTruthy();
    expect(within(screen.getByRole('complementary', { name: 'Sources' })).getAllByText('Hidden · cannot be opened').length).toBeGreaterThan(0);

    fireEvent.change(screen.getByRole('textbox', { name: 'Question for the AI' }), { target: { value: 'Còn ICMP?' } });
    fireEvent.submit(screen.getByRole('textbox', { name: 'Question for the AI' }));
    await waitFor(() => expect(asks()).toEqual([{ question: 'Còn ICMP?', scope: { kind: 'universe' } }]));
  });

  it('asks for a key when the reader has none (403 NO_USER_KEY)', async () => {
    routes.keys = () => answer(200, KEYS_NONE);
    routes.ask = () => answer(403, { error: 'NO_USER_KEY' });
    window.history.replaceState(null, '', '/copilot?q=DHCP');
    renderWithI18n(<CopilotScreen />);
    await waitFor(() => expect(state()).toBe('no-key'));
    expect(screen.getByText('Add a key for AI answers')).toBeTruthy();
    expect(screen.getByRole('link', { name: 'Open Own keys' }).getAttribute('href')).toBe('/settings/keys');
    expect(screen.getByText('No key yet: add one for AI to write answers')).toBeTruthy();
    expect(screen.getByText('Writing answers · needs Own keys')).toBeTruthy();
  });

  it('says the key cannot use the chosen model (provider 404) and sends the reader to pick another', async () => {
    routes.keys = () => answer(200, KEYS_OPENAI);
    routes.ask = () => eventStream([['error', { code: 'MODEL_UNAVAILABLE', provider: 'openai', last4: 'a1b2' }]]);
    window.history.replaceState(null, '', '/copilot?q=DHCP');
    renderWithI18n(<CopilotScreen />);
    await waitFor(() => expect(state()).toBe('model-unavailable'));
    expect(screen.getByText('Your OpenAI key cannot use this model')).toBeTruthy();
    expect(screen.getByRole('link', { name: 'Change model' }).getAttribute('href')).toBe('/settings/keys');
  });

  it('reads the keys again when the reader comes back to the tab (a key added meanwhile)', async () => {
    let keys: KeysResponse = KEYS_NONE;
    routes.keys = () => answer(200, keys);
    renderWithI18n(<CopilotScreen />);
    await screen.findByText('No key yet: add one for AI to write answers');
    keys = KEYS_OPENAI;
    document.dispatchEvent(new Event('visibilitychange'));
    await waitFor(() => expect(screen.queryByText('No key yet: add one for AI to write answers')).toBeNull());
  });

  it('switches to another working key when this one is out of credit (D), then asks again', async () => {
    const keys: KeysResponse = {
      ...KEYS_OPENAI,
      keys: [...KEYS_OPENAI.keys, { provider: 'anthropic', last4: '7c1d', status: 'ok', updatedAt: NOW.toISOString(), lastCheckedAt: null }],
      models: { ...KEYS_OPENAI.models, anthropic: [{ id: 'claude-haiku-5-5', label: 'Claude Haiku 5.5' }] },
    };
    routes.keys = () => answer(200, keys);
    routes.prefs = () => answer(200, { ...keys, active: { provider: 'anthropic', model: 'claude-haiku-5-5', last4: '7c1d' } });
    let calls = 0;
    routes.ask = () => {
      calls += 1;
      return calls === 1 ? eventStream([['error', { code: 'USER_KEY_NO_CREDIT', provider: 'openai', last4: 'a1b2' }]]) : answered('q-claude');
    };
    window.history.replaceState(null, '', '/copilot?q=DHCP');
    renderWithI18n(<CopilotScreen />);
    await waitFor(() => expect(state()).toBe('no-credit'));
    expect(screen.getByText('Your OpenAI account is out of credit')).toBeTruthy();
    expect(screen.getByText('Top it up in OpenAI Platform, or use another key.')).toBeTruthy();
    fireEvent.click(await screen.findByRole('button', { name: 'Switch to Claude' }));
    await waitFor(() => expect(state()).toBe('done'));
    const prefs = fetchMock.mock.calls.find(([url]) => String(url) === '/api/me/key-prefs');
    expect(JSON.parse(String((prefs?.[1] as RequestInit).body))).toEqual({ provider: 'anthropic', model: 'claude-haiku-5-5' });
    expect(asks()).toHaveLength(2);
  });

  it('stops the answer being written ("Dừng") and keeps what was written', async () => {
    const stream = openStream();
    routes.ask = () => stream.response;
    window.history.replaceState(null, '', '/copilot?q=DHCP');
    renderWithI18n(<CopilotScreen />);
    await waitFor(() => expect(state()).toBe('searching'));
    stream.send('status', { stage: 'writing', jev: 'ok', found: 0 });
    stream.send('delta', { text: 'Một nửa câu' });
    await waitFor(() => expect(state()).toBe('writing'));
    expect(screen.getByText('Writing with OpenAI key ••••a1b2…')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Stop' }));
    expect(state()).toBe('stopped');
    expect(screen.getByText('Một nửa câu')).toBeTruthy();
    expect(screen.getByText('Stopped. This answer was not saved.')).toBeTruthy();
    expect((fetchMock.mock.calls.find(([url]) => String(url) === '/api/ask')?.[1] as RequestInit).signal?.aborted).toBe(true);
  });

  it('keeps a question asked offline until the browser is back online (F)', async () => {
    const online = vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(false);
    renderWithI18n(<CopilotScreen />);
    fireEvent.change(screen.getByRole('textbox', { name: 'Question for the AI' }), { target: { value: 'ICMP khác gì TCP?' } });
    fireEvent.submit(screen.getByRole('textbox', { name: 'Question for the AI' }));
    expect(state()).toBe('queued');
    expect(screen.getByText('Your question is waiting')).toBeTruthy();
    expect(asks()).toEqual([]);
    online.mockReturnValue(true);
    act(() => {
      window.dispatchEvent(new Event('online'));
    });
    await waitFor(() => expect(state()).toBe('done'));
    expect(asks()).toEqual([{ question: 'ICMP khác gì TCP?', scope: { kind: 'universe' } }]);
  });

  it('cancels a queued question', () => {
    vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(false);
    renderWithI18n(<CopilotScreen />);
    fireEvent.change(screen.getByRole('textbox', { name: 'Question for the AI' }), { target: { value: 'ICMP?' } });
    fireEvent.submit(screen.getByRole('textbox', { name: 'Question for the AI' }));
    fireEvent.click(screen.getByRole('button', { name: 'Cancel the question' }));
    expect(state()).toBe('empty');
  });
});

describe('historyGroups', () => {
  it('groups by the Saigon day: today, yesterday, earlier', () => {
    const now = new Date('2026-11-04T15:00:00.000Z'); // 22:00 in Saigon
    const item = (id: string, createdAt: string): CopilotHistory['items'][number] => ({ id, task: 'answer', question: id, scope: { kind: 'universe', id: null }, createdAt });
    const groups = historyGroups([item('a', '2026-11-03T17:30:00.000Z'), item('b', '2026-11-03T16:30:00.000Z'), item('c', '2026-10-30T10:00:00.000Z')], now);
    expect(groups.map((group) => [group.key, group.items.map((i) => i.id)])).toEqual([
      ['today', ['a']],
      ['yesterday', ['b']],
      ['earlier', ['c']],
    ]);
  });
});
