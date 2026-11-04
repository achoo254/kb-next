import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { SearchResponse } from '../api/search-api';
import { renderWithI18n } from '../test/render';
import { readAddress, addressOf, NO_FILTERS } from './search-filters';
import { SearchScreen, emptySuggestions } from './search-screen';
import { DHCP_ANSWER, NET_SPACE, searchResponse, searchResult } from './search-test-data';

const SPACES = {
  spaces: [
    { ...NET_SPACE, caption: { vi: '8 lab', en: '8 labs' }, documentCount: 8, collectionCount: 4, collections: [] },
    { slug: 'linux', nameVi: 'Linux', nameEn: 'Linux', tint: 'var(--tint-linux)', glow: 'var(--glow-linux)', art: '/art/crystal-linux.webp', kind: 'public', caption: { vi: '3 bài', en: '3 docs' }, documentCount: 3, collectionCount: 3, collections: [] },
  ],
};

function answer(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
}

/** The API: Spaces, and search answers chosen by whether the request is the keyword-only one. */
function api(full: () => Promise<Response>, keyword: () => Promise<Response> = full) {
  return vi.fn(async (input: string | URL | Request) => {
    const url = String(input);
    if (url === '/api/spaces') return answer(200, SPACES);
    if (url.startsWith('/api/search')) return new URLSearchParams(url.split('?')[1]).get('mode') === 'keyword' ? keyword() : full();
    return answer(404, { error: 'not-found' });
  });
}

const searches = (mock: ReturnType<typeof api>): URLSearchParams[] =>
  mock.mock.calls.map(([input]) => String(input)).filter((url) => url.startsWith('/api/search')).map((url) => new URLSearchParams(url.split('?')[1]));

const state = (): string | null => document.querySelector('[data-id="search-screen"]')?.getAttribute('data-state') ?? null;

let fetchMock: ReturnType<typeof api>;

beforeEach(() => {
  window.history.replaceState(null, '', '/search?q=dhcp');
});

afterEach(() => {
  vi.unstubAllGlobals();
});

function start(mock: ReturnType<typeof api>): void {
  fetchMock = mock;
  vi.stubGlobal('fetch', fetchMock);
  renderWithI18n(<SearchScreen />);
}

describe('SearchScreen (C12)', () => {
  it('shows results grouped by Space, how each was found, suggestions, asking AI and a preview', async () => {
    start(api(async () => answer(200, DHCP_ANSWER)));
    await waitFor(() => expect(state()).toBe('results'));
    expect(screen.getByRole('searchbox', { name: 'Search terms' })).toHaveProperty('value', 'dhcp');
    expect(screen.getByText('3 results')).toBeTruthy();

    const results = screen.getByRole('region', { name: 'Results' });
    const net = within(results).getByRole('region', { name: 'Networking' });
    expect(within(net).getByText('2 results')).toBeTruthy();
    const dhcp = within(net).getAllByRole('link')[1];
    expect(dhcp?.getAttribute('href')).toBe('/d/dhcp#tong-quan');
    expect(dhcp?.textContent).toContain('Keyword match');
    expect(dhcp?.querySelector('mark')?.textContent).toBe('DHCP');
    expect(within(net).getByText('Networking › Core protocols · Minh')).toBeTruthy();
    const linux = within(results).getByRole('region', { name: 'Linux' });
    expect(within(linux).getByRole('img', { name: 'relevance 0.64' })).toBeTruthy();
    expect(within(linux).getByText(/By meaning · Jev/)).toBeTruthy();

    expect(screen.getByRole('button', { name: 'DHCP lease' })).toBeTruthy();
    expect(screen.getByRole('link', { name: /Ask AI about these results/ }).getAttribute('href')).toBe('/copilot?q=dhcp');
    expect(screen.getByText('AI reads the 3 passages above and answers with citations')).toBeTruthy();
    const preview = screen.getByRole('region', { name: 'Preview' });
    expect(within(preview).getByText('Giao thức DHCP')).toBeTruthy();

    // The keyword results and the full search are asked side by side.
    const asked = searches(fetchMock);
    expect(asked.map((p) => p.get('mode') ?? 'all').sort()).toEqual(['all', 'keyword']);
    expect(asked.every((p) => p.get('q') === 'dhcp')).toBe(true);
  });

  it('says keyword search is done while Jev still searches', async () => {
    let finish: (r: Response) => void = () => undefined;
    start(api(() => new Promise<Response>((resolve) => (finish = resolve)), async () => answer(200, DHCP_ANSWER)));
    expect(await screen.findByText('Keywords done · Jev is searching by meaning…')).toBeTruthy();
    expect(state()).toBe('searching');
    expect(screen.getByLabelText('Searching').getAttribute('aria-busy')).toBe('true');
    finish(answer(200, DHCP_ANSWER));
    await waitFor(() => expect(state()).toBe('results'));
  });

  it('shows nothing found with the telescope and shorter ways to ask', async () => {
    window.history.replaceState(null, '', '/search?q=c%E1%BA%A5p%20ph%C3%A1t%20ip%20v6');
    const none = searchResponse('cấp phát ip v6', [], { exact: true, variants: { hidden: 0, words: [] } });
    start(api(async () => answer(200, none)));
    await waitFor(() => expect(state()).toBe('empty'));
    const empty = document.querySelector('[data-id="search-empty"]');
    expect(empty?.querySelector('img')?.getAttribute('src')).toBe('/art/ill-telescope-empty.webp');
    expect(screen.getByText('Nothing on "cấp phát ip v6" yet')).toBeTruthy();
    expect(emptySuggestions(none)).toEqual(['cấp phát ip', 'cấp phát', 'cấp']);
    fireEvent.click(screen.getByRole('button', { name: 'cấp phát ip' }));
    expect(new URLSearchParams(window.location.search).get('q')).toBe('cấp phát ip');
  });

  it('flags keyword-only results when Jev failed, and searches again on retry', async () => {
    const keywordOnly: SearchResponse = { ...DHCP_ANSWER, meaning: 'failed' };
    start(api(async () => answer(200, keywordOnly)));
    await waitFor(() => expect(state()).toBe('keyword-only'));
    expect(screen.getByText('Jev is not answering, so these are keyword results only.')).toBeTruthy();
    const before = searches(fetchMock).length;
    fireEvent.click(screen.getByRole('button', { name: 'Retry' }));
    await waitFor(() => expect(searches(fetchMock).length).toBeGreaterThan(before));
  });

  it('keeps the keyword results when the full search fails as a whole', async () => {
    start(api(async () => answer(500, { error: 'internal' }), async () => answer(200, { ...DHCP_ANSWER, meaning: 'skipped' })));
    await waitFor(() => expect(state()).toBe('keyword-only'));
    expect(screen.getAllByText('Giao thức DHCP').length).toBeGreaterThan(0);
  });

  it('says when the search did not answer at all', async () => {
    start(api(async () => answer(429, { error: 'rate-limited' })));
    await waitFor(() => expect(state()).toBe('failed'));
    expect(screen.getByText('You are searching a little fast. Wait a minute and try again.')).toBeTruthy();
  });

  it('explains exact diacritics and shows every variant on request', async () => {
    window.history.replaceState(null, '', '/search?q=m%E1%BA%A1ng');
    const exact = searchResponse('mạng', [{ space: NET_SPACE, results: [searchResult('osi', 'Packet Journey')] }], { exact: true, variants: { hidden: 2, words: ['mang', 'màng'] } });
    start(api(async () => answer(200, exact)));
    expect(await screen.findByText('You typed accents, so only "mạng" shows. 2 results hidden: "mang", "màng".')).toBeTruthy();
    expect(screen.getByText('exact accents · 1 results')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Show every variant' }));
    expect(new URLSearchParams(window.location.search).get('variants')).toBe('1');
    await waitFor(() => expect(searches(fetchMock).some((p) => p.get('variants') === '1')).toBe(true));
  });

  it('filters by source, Space, type, language and time, and clears them', async () => {
    start(api(async () => answer(200, DHCP_ANSWER)));
    await waitFor(() => expect(state()).toBe('results'));
    const filters = screen.getByRole('complementary', { name: 'Filters' });
    expect(within(filters).getByRole('checkbox', { name: /Community/ }).textContent).toContain('1');

    fireEvent.click(within(filters).getByRole('checkbox', { name: /Community/ }));
    fireEvent.click(await within(filters).findByRole('checkbox', { name: 'Linux' }));
    fireEvent.click(within(filters).getByRole('button', { name: 'Note' }));
    fireEvent.change(within(filters).getByRole('combobox', { name: 'Language' }), { target: { value: 'en' } });
    fireEvent.change(within(filters).getByRole('combobox', { name: 'Time' }), { target: { value: '7d' } });
    await waitFor(() => {
      const last = searches(fetchMock).at(-1);
      expect(last?.get('origin')).toBe('official,own');
      expect(last?.get('space')).toBe('networking');
      expect(last?.get('type')).toBe('note');
      expect(last?.get('lang')).toBe('en');
      expect(last?.get('time')).toBe('7d');
    });
    expect(readAddress(window.location.search).filters).toEqual({ origins: ['official', 'own'], spaces: ['networking'], types: ['note'], lang: 'en', time: '7d' });

    fireEvent.click(within(filters).getByRole('button', { name: 'Clear' }));
    expect(readAddress(window.location.search).filters).toEqual(NO_FILTERS);
  });

  it('switches the mode', async () => {
    start(api(async () => answer(200, DHCP_ANSWER)));
    await waitFor(() => expect(state()).toBe('results'));
    fireEvent.click(screen.getByRole('button', { name: 'Keywords' }));
    expect(screen.getByRole('button', { name: 'Keywords' }).getAttribute('aria-pressed')).toBe('true');
    await waitFor(() => expect(searches(fetchMock).at(-1)?.get('mode')).toBe('keyword'));
  });

  it('waits for a query before searching', async () => {
    window.history.replaceState(null, '', '/search');
    start(api(async () => answer(200, DHCP_ANSWER)));
    expect(await screen.findByText('Search the Universe')).toBeTruthy();
    expect(state()).toBe('idle');
    expect(searches(fetchMock)).toHaveLength(0);
  });
});

describe('the address of a search', () => {
  it('round-trips, without the page language parameter', () => {
    const address = { q: 'dhcp', mode: 'meaning' as const, variants: true, filters: { origins: ['official' as const], spaces: [], types: ['lab' as const], lang: 'vi' as const, time: '30d' as const } };
    const href = addressOf(address);
    expect(href).toBe('/search?q=dhcp&mode=meaning&origin=official&space=&type=lab&doclang=vi&time=30d&variants=1');
    expect(readAddress(href.slice('/search'.length))).toEqual(address);
    expect(addressOf({ q: '', mode: 'all', variants: false, filters: NO_FILTERS })).toBe('/search');
  });
});

describe('a server where neither search runs', () => {
  it('says the search did not answer instead of "nothing found"', async () => {
    window.history.replaceState(null, '', '/search?q=dhcp');
    const off = searchResponse('dhcp', [], { keyword: 'off', meaning: 'off' });
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: string | URL | Request) => (String(input) === '/api/spaces' ? answer(200, SPACES) : answer(200, off))),
    );
    renderWithI18n(<SearchScreen />);
    await waitFor(() => expect(state()).toBe('failed'));
    expect(screen.getByText('The search server did not answer. Try again in a moment.')).toBeTruthy();
  });
});
