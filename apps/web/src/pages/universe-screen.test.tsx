import { act, fireEvent, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { SpaceListItem } from '../api/content-api';
import { renderWithI18n } from '../test/render';
import { copilotHref } from './universe-ai-panel';
import { SLOW_LOAD_MS, isEmptyUniverse } from './universe-data';
import { UniverseScreen } from './universe-screen';
import { BOARD_SPACES, doc, space } from './universe-test-data';

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
}

const RECENT = [doc('dhcp', { title: 'Giao thức DHCP', readProgress: 72 }), doc('k8s', { title: 'Kiến trúc cụm K8s' })];

/** Serves the Universe's API: `spaces` answers /api/spaces (a function may hold or fail it). */
function serve(spaces: SpaceListItem[] | (() => Promise<Response>)): ReturnType<typeof vi.fn> {
  const fetch = vi.fn(async (url: string) => {
    if (url === '/api/spaces') return typeof spaces === 'function' ? spaces() : json({ spaces });
    if (url === '/api/recent') return json({ documents: RECENT });
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
    expect(screen.getByRole('link', { name: 'Explain “Giao thức DHCP”' }).getAttribute('href')).toBe(copilotHref('Explain “Giao thức DHCP”'));
    expect(screen.getByRole('link', { name: 'Open AI Copilot' }).getAttribute('href')).toBe('/copilot');
    expect(screen.getByText('Copilot answers with sources, from the 21 documents you can read in 7 Spaces:')).toBeTruthy();
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

  it('shows the empty universe (S05) when the reader has nothing of their own yet', async () => {
    serve(BOARD_SPACES.filter((s) => s.kind !== 'personal'));
    renderWithI18n(<UniverseScreen />);
    await waitFor(() => expect(state()).toBe('empty'));
    expect(screen.getByRole('link', { name: 'Create your first planet' }).getAttribute('href')).toBe('/me');
    expect(screen.getByRole('link', { name: 'explore the shared Universe' }).getAttribute('href')).toBe('/u?shared=1');
    expect(screen.getByRole('link', { name: 'Networking · 8 labs' })).toBeTruthy();
    expect(screen.getByRole('link', { name: 'Explain “Giao thức DHCP”' })).toBeTruthy();
  });

  it('shows the whole Universe from "khám phá Universe chung"', async () => {
    window.history.replaceState(null, '', '/u?shared=1');
    serve([space('networking', { documentCount: 4 })]);
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
  it('is empty without a personal Space or with an empty one', () => {
    expect(isEmptyUniverse([])).toBe(true);
    expect(isEmptyUniverse([space('personal-u1', { kind: 'personal', documentCount: 0 })])).toBe(true);
    expect(isEmptyUniverse(BOARD_SPACES)).toBe(false);
  });
});
