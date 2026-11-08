import { act, cleanup, fireEvent, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { DocumentView } from '../api/content-api';
import { answer } from '../test/api-fakes';
import { renderWithI18n } from '../test/render';
import { PresentScreen, langOf, presentPath } from './present-screen';

const NET = { slug: 'networking', nameVi: 'Mạng', nameEn: 'Networking', tint: '#C4B5FD', glow: '#8B5CF6' };
const T = '2026-11-08T01:00:00.000Z';

function view(overrides: Partial<DocumentView> = {}): DocumentView {
  return {
    lang: 'vi',
    translationAvailable: true,
    document: {
      id: 'dhcp',
      title: 'Giao thức DHCP',
      type: 'note',
      origin: 'official',
      status: 'approved',
      lang: 'vi',
      aiTranslated: false,
      updatedAt: T,
      authorName: 'Đạt',
      translations: ['vi', 'en'],
      collectionId: 'c1',
      space: { ...NET, art: '/art/x.webp', kind: 'public' },
      readProgress: 0,
      sourceUrl: null,
      createdAt: T,
      readingMinutes: 4,
      reviewedBy: null,
      readAnchor: null,
      collection: null,
    },
    translations: [
      { id: 'dhcp', lang: 'vi', aiTranslated: false },
      { id: 'dhcp-en', lang: 'en', aiTranslated: false },
    ],
    toc: [],
    chunks: [
      { anchor: 'mo-dau', heading: null, markdown: '> [!TLDR]\n> - Máy mới xin IP\n> - Server cho mượn\n\nMáy mới vào mạng chưa có IP.' },
      { anchor: 'cac-buoc', heading: 'Bốn bước', markdown: '1. **Discover** hét lên\n2. **Offer** mời\n3. **Request** xin\n4. **Acknowledge** chốt' },
      { anchor: 'luu-y', heading: 'Lưu ý', markdown: '```sh\ndhclient -v\n```' },
    ],
    backlinks: [],
    outgoing: [],
    wikilinks: [],
    related: [],
    versions: [],
    ...overrides,
  };
}

let fetchMock: ReturnType<typeof vi.fn>;
let beacon: ReturnType<typeof vi.fn>;

function start(path = '/d/dhcp/present'): void {
  window.history.replaceState(null, '', path);
  renderWithI18n(<PresentScreen id="dhcp" />);
}

/**
 * Waits for the deck, then lets React run its effects: the text loads outside act(), so the key listener may not be
 * on yet when the deck first shows (a slow CI runner saw N pressed before it was).
 */
async function deckReady(): Promise<void> {
  await screen.findByRole('progressbar');
  await act(async () => {});
}

const counter = (): string => screen.getByRole('progressbar').getAttribute('aria-valuenow') ?? '';

beforeEach(() => {
  fetchMock = vi.fn(async () => answer(200, view()));
  vi.stubGlobal('fetch', fetchMock);
  beacon = vi.fn(() => true);
  Object.defineProperty(navigator, 'sendBeacon', { value: beacon, configurable: true });
  window.localStorage.clear();
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe('PresentScreen (C21)', () => {
  it('opens on the cover, then moves with the arrow keys and keeps the slide in the address', async () => {
    start();
    await deckReady();
    expect(screen.getByRole('heading', { name: 'Giao thức DHCP' })).toBeTruthy();
    expect(counter()).toBe('1');
    fireEvent.keyDown(window, { key: 'ArrowRight' });
    expect(counter()).toBe('2');
    expect(screen.getByText('TL;DR')).toBeTruthy();
    expect(window.location.hash).toBe('#2');
    fireEvent.keyDown(window, { key: 'ArrowLeft' });
    fireEvent.keyDown(window, { key: 'ArrowLeft' });
    expect(counter()).toBe('1');
  });

  it('opens at the slide of the address, and jumps through the contents with T', async () => {
    start('/d/dhcp/present#5');
    await deckReady();
    expect(counter()).toBe('5');
    fireEvent.keyDown(window, { key: 't' });
    expect(screen.getByText('Contents')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Lưu ý' }));
    expect(screen.getByRole('heading', { name: 'Lưu ý' })).toBeTruthy();
  });

  it('shows each step on its own slide', async () => {
    start();
    await deckReady();
    fireEvent.keyDown(window, { key: 't' });
    fireEvent.click(screen.getByRole('button', { name: 'Bốn bước' }));
    fireEvent.keyDown(window, { key: 'ArrowRight' });
    expect(screen.getByText('Step 1/4')).toBeTruthy();
    expect(screen.getByRole('heading', { name: 'Discover' })).toBeTruthy();
  });

  it('remembers the palette picked', async () => {
    start();
    await deckReady();
    const picker = screen.getByRole('combobox', { name: 'Palette' });
    fireEvent.change(picker, { target: { value: 'sunset' } });
    expect(document.querySelector('[data-id="present-screen"]')?.getAttribute('data-palette')).toBe('sunset');
    expect(window.localStorage.getItem('kb.present.palette')).toBe('sunset');
  });

  it('offers the other language at its first slide', async () => {
    start();
    const other = await screen.findByRole('link', { name: 'View in EN' });
    expect(other.getAttribute('href')).toBe('/d/dhcp-en/present?lang=en#1');
  });

  it('records how far this viewing went as it leaves, once', async () => {
    start();
    await deckReady();
    fireEvent.keyDown(window, { key: 'ArrowRight' });
    fireEvent.keyDown(window, { key: 'ArrowRight' });
    fireEvent.keyDown(window, { key: 'ArrowLeft' });
    cleanup();
    expect(beacon).toHaveBeenCalledTimes(1);
    const [url, body] = beacon.mock.calls[0] as [string, Blob];
    expect(url).toBe('/api/documents/dhcp/present-views');
    expect(JSON.parse(await body.text())).toMatchObject({ furthest: 3 });
  });

  it('opens the speaker view with N, and shows the full source there', async () => {
    const open = vi.fn(() => ({}) as Window);
    vi.stubGlobal('open', open);
    start('/d/dhcp/present#3');
    await deckReady();
    fireEvent.keyDown(window, { key: 'n' });
    expect(open).toHaveBeenCalledWith('/d/dhcp/present?lang=vi&view=speaker#3', 'kb-speaker');
    cleanup();
    start('/d/dhcp/present?view=speaker#3');
    expect(await screen.findByText('Notes')).toBeTruthy();
    expect(screen.getByText('Next')).toBeTruthy();
  });

  it('answers a text it may not show as the reader does', async () => {
    fetchMock.mockImplementation(async () => answer(403, { error: 'no-access' }));
    start();
    await waitFor(() => expect(document.querySelector('[data-id="present-screen"]')?.getAttribute('data-state')).toBe('no-access'));
  });

  it('moves on a tap: the left third goes back, the rest forward', async () => {
    start('/d/dhcp/present#3');
    await deckReady();
    const el = document.querySelector<HTMLElement>('[data-id="present-stage"]');
    if (!el) throw new Error('no stage');
    el.getBoundingClientRect = () => ({ left: 0, top: 0, width: 300, height: 600, right: 300, bottom: 600, x: 0, y: 0, toJSON: () => ({}) });
    act(() => {
      fireEvent.pointerDown(el, { clientX: 250, clientY: 300 });
      fireEvent.pointerUp(el, { clientX: 250, clientY: 300 });
    });
    expect(counter()).toBe('4');
    act(() => {
      fireEvent.pointerDown(el, { clientX: 20, clientY: 300 });
      fireEvent.pointerUp(el, { clientX: 20, clientY: 300 });
    });
    expect(counter()).toBe('3');
  });
});

describe('addresses', () => {
  it('reads the language of the address', () => {
    expect(langOf('?lang=en')).toBe('en');
    expect(langOf('?lang=fr')).toBeUndefined();
    expect(langOf('')).toBeUndefined();
    expect(presentPath('a b', 'vi')).toBe('/d/a%20b/present?lang=vi');
  });
});
