import { act, fireEvent, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { SpaceListItem } from '../api/content-api';
import { KEYS_OPENAI, eventStream } from '../test/api-fakes';
import { renderWithI18n } from '../test/render';
import { SLOW_LOAD_MS, isEmptyUniverse } from './universe-data';
import { UniverseScreen } from './universe-screen';
import { BOARD_SPACES, doc, space } from './universe-test-data';

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
}

const RECENT = [doc('dhcp', { title: 'Giao thức DHCP', readProgress: 72 }), doc('k8s', { title: 'Kiến trúc cụm K8s' })];

/** Serves the Universe's API: `spaces` answers /api/spaces (a function may hold or fail it). */
function serve(spaces: SpaceListItem[] | (() => Promise<Response>), ask: () => Response = () => json({ error: 'NO_USER_KEY' }, 403)): ReturnType<typeof vi.fn> {
  const fetch = vi.fn(async (url: string) => {
    if (url === '/api/spaces') return typeof spaces === 'function' ? spaces() : json({ spaces });
    if (url === '/api/recent') return json({ documents: RECENT });
    if (url === '/api/me/keys') return json(KEYS_OPENAI);
    if (url === '/api/ask') return ask();
    return json({ error: 'not-found' }, 404);
  });
  vi.stubGlobal('fetch', fetch);
  return fetch;
}

function setOnline(online: boolean): void {
  Object.defineProperty(navigator, 'onLine', { configurable: true, get: () => online });
}

function state(): string | undefined {
  return document.querySelector<HTMLElement>('[data-id="universe-screen"]')?.dataset.state;
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
  setOnline(true);
  window.history.replaceState(null, '', '/');
});

describe('UniverseScreen', () => {
  it('opens on the skeleton (S04), then shows every Space as a crystal in orbit order (C09)', async () => {
    serve(BOARD_SPACES);
    renderWithI18n(<UniverseScreen />);
    expect(state()).toBe('loading');
    expect(screen.getByRole('status').textContent).toBe('Loading the Universe…');
    await waitFor(() => expect(state()).toBe('ready'));

    const crystals = Array.from(document.querySelectorAll<HTMLAnchorElement>('.kf-scene-crystal a'));
    expect(crystals.map((link) => link.getAttribute('href'))).toEqual([
      '/s/networking',
      '/s/kubernetes',
      '/s/observability',
      '/s/personal-u1',
      '/s/weekly',
      '/s/docker',
      '/s/linux',
    ]);
    expect(screen.getByRole('link', { name: 'Networking · 8 labs' })).toBeTruthy();
    // the stage reads on with the started text, the panel offers a question about it
    expect(document.querySelector('[data-id="stage-card-continue"]')?.textContent).toContain('Giao thức DHCP');
    expect(screen.getByRole('button', { name: 'Explain “Giao thức DHCP”' })).toBeTruthy();
    expect(screen.getByRole('link', { name: 'Open AI Copilot' }).getAttribute('href')).toBe('/copilot');
    expect(screen.getByText('Copilot answers with sources, from the 21 documents you can read in 7 Spaces:')).toBeTruthy();
  });

  it('asks Copilot in the AI panel itself, with the answer’s sources and a way to open it in C14', async () => {
    const fetch = serve(BOARD_SPACES, () =>
      eventStream([
        ['status', { stage: 'searching', jev: 'ok', found: 0 }],
        ['sources', { sources: [{ n: 1, documentId: 'dhcp', anchor: 'tong-quan', title: 'Giao thức DHCP', section: 'DORA', spaceName: 'Networking', collectionName: null, origin: 'official', status: 'approved' }] }],
        ['delta', { text: 'Máy mới xin IP qua 4 bước DORA [1].' }],
        ['done', { questionId: 'q7', provider: 'openai', model: 'gpt-4.1-mini', last4: 'a1b2' }],
      ]),
    );
    renderWithI18n(<UniverseScreen />);
    fireEvent.click(await screen.findByRole('button', { name: 'Explain “Giao thức DHCP”' }));
    const thread = await screen.findByText('Máy mới xin IP qua 4 bước DORA', { exact: false });
    expect(thread).toBeTruthy();
    await waitFor(() => expect(document.querySelector('[data-id="universe-ai-thread"]')?.getAttribute('data-state')).toBe('done'));
    const ask = fetch.mock.calls.find(([url]) => url === '/api/ask');
    expect(JSON.parse(String((ask?.[1] as RequestInit).body))).toEqual({ question: 'Explain “Giao thức DHCP”', scope: { kind: 'universe' } });
    expect(screen.getByRole('link', { name: 'Citation 1: Giao thức DHCP § DORA' }).getAttribute('href')).toBe('/d/dhcp#tong-quan');
    expect(screen.getByText('Sources:')).toBeTruthy();
    expect(screen.getByRole('link', { name: 'Open AI Copilot' }).getAttribute('href')).toBe('/copilot?h=q7');
  });

  it('offers to try again when the load takes longer than 1.5 s', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    serve(() => new Promise<Response>(() => undefined));
    renderWithI18n(<UniverseScreen />);
    expect(document.querySelector('[data-id="universe-slow"]')).toBeNull();
    await act(async () => {
      await vi.advanceTimersByTimeAsync(SLOW_LOAD_MS + 10);
    });
    expect(screen.getByRole('button', { name: 'Try again' })).toBeTruthy();
  });

  it('shows the failed load with "Thử lại", which loads again', async () => {
    let calls = 0;
    serve(async () => {
      calls += 1;
      return calls === 1 ? json({ error: 'internal' }, 500) : json({ spaces: BOARD_SPACES });
    });
    renderWithI18n(<UniverseScreen />);
    await waitFor(() => expect(state()).toBe('failed'));
    fireEvent.click(screen.getByRole('button', { name: 'Try again' }));
    await waitFor(() => expect(state()).toBe('ready'));
  });

  it('shows the shared Universe (C09) to a reader without a Space of their own, or with an empty one', async () => {
    serve(BOARD_SPACES.filter((s) => s.kind !== 'personal'));
    const { unmount } = renderWithI18n(<UniverseScreen />);
    await waitFor(() => expect(state()).toBe('ready'));
    unmount();
    serve(BOARD_SPACES.map((s) => (s.kind === 'personal' ? { ...s, documentCount: 0 } : s)));
    renderWithI18n(<UniverseScreen />);
    await waitFor(() => expect(state()).toBe('ready'));
  });

  it('shows the empty universe (S05) only when no Space has anything to read', async () => {
    serve(BOARD_SPACES.filter((s) => s.kind !== 'personal').map((s) => ({ ...s, documentCount: 0 })));
    renderWithI18n(<UniverseScreen />);
    await waitFor(() => expect(state()).toBe('empty'));
    expect(screen.getByRole('link', { name: 'Create your first planet' }).getAttribute('href')).toBe('/create');
    expect(screen.getByRole('link', { name: /Write a note/ }).getAttribute('href')).toBe('/new');
    expect(screen.getByRole('link', { name: /Upload an Office file/ }).getAttribute('href')).toBe('/create');
    expect(screen.getByRole('link', { name: 'explore the shared Universe' }).getAttribute('href')).toBe('/u?shared=1');
    expect(screen.getByRole('link', { name: 'Networking · 8 labs' })).toBeTruthy();
    expect(screen.getByRole('link', { name: 'Explain “Giao thức DHCP”' })).toBeTruthy();
  });

  it('shows the whole Universe from "khám phá Universe chung"', async () => {
    window.history.replaceState(null, '', '/u?shared=1');
    serve([space('networking', { documentCount: 0 })]);
    renderWithI18n(<UniverseScreen />);
    await waitFor(() => expect(state()).toBe('ready'));
  });

  it('is offline (S05 with the offline planet) when the API cannot be reached, and loads once back online', async () => {
    let reachable = false;
    serve(async () => {
      if (!reachable) throw new TypeError('Failed to fetch');
      return json({ spaces: BOARD_SPACES });
    });
    renderWithI18n(<UniverseScreen />);
    await waitFor(() => expect(state()).toBe('offline'));
    const banner = document.querySelector('[data-id="universe-offline"]');
    expect(banner?.querySelector('img')?.getAttribute('src')).toBe('/art/ill-planet-offline.webp');
    reachable = true;
    act(() => {
      window.dispatchEvent(new Event('online'));
    });
    await waitFor(() => expect(state()).toBe('ready'));
    expect(document.querySelector('[data-id="universe-offline"]')).toBeNull();
  });

  it('starts offline without asking the API when the browser has no connection', async () => {
    setOnline(false);
    const fetch = serve(BOARD_SPACES);
    renderWithI18n(<UniverseScreen />);
    expect(state()).toBe('offline');
    expect(fetch).not.toHaveBeenCalledWith('/api/spaces', expect.anything());
  });

  it('keeps the Universe on screen with the offline notice when the connection drops', async () => {
    serve(BOARD_SPACES);
    renderWithI18n(<UniverseScreen />);
    await waitFor(() => expect(state()).toBe('ready'));
    act(() => {
      window.dispatchEvent(new Event('offline'));
    });
    expect(state()).toBe('ready');
    expect(document.querySelector('[data-id="universe-offline"]')).not.toBeNull();
  });

  it('plays the warp into a Space on Enter or a click', async () => {
    serve(BOARD_SPACES);
    renderWithI18n(<UniverseScreen />);
    await waitFor(() => expect(state()).toBe('ready'));
    const main = document.querySelector<HTMLElement>('.universe-main');
    expect(main?.dataset.warp).toBeUndefined();
    const docker = screen.getByRole('link', { name: 'docker · docker en' });
    const event = new MouseEvent('click', { bubbles: true, cancelable: true, button: 0 });
    act(() => {
      docker.dispatchEvent(event);
    });
    expect(event.defaultPrevented).toBe(true);
    expect(main?.dataset.warp).toBe('true');
  });
});

describe('isEmptyUniverse', () => {
  it('is empty only when no Space has a readable text', () => {
    expect(isEmptyUniverse([])).toBe(true);
    expect(isEmptyUniverse([space('networking', { documentCount: 0 }), space('personal-u1', { kind: 'personal', documentCount: 0 })])).toBe(true);
    // No Space of one's own, or an empty one: the shared Universe still has texts.
    expect(isEmptyUniverse(BOARD_SPACES.filter((s) => s.kind !== 'personal'))).toBe(false);
    expect(isEmptyUniverse([space('networking'), space('personal-u1', { kind: 'personal', documentCount: 0 })])).toBe(false);
    expect(isEmptyUniverse(BOARD_SPACES)).toBe(false);
  });
});
