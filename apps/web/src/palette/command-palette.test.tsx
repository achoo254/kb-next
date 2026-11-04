import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { DocumentSummary } from '../api/content-api';
import type { SearchResponse } from '../api/search-api';
import type { SessionState } from '../api/session-api';
import { AppShell, isPaletteShortcut } from '../layout/app-shell';
import { SessionProvider } from '../layout/session-context';
import { DHCP_ANSWER, NET_SPACE, searchResponse, searchResult } from '../pages/search-test-data';
import { renderWithI18n } from '../test/render';
import { CommandPalette, paletteItems } from './command-palette';

const RECENT: DocumentSummary[] = [
  { ...searchResult('dhcp', 'Giao thức DHCP'), updatedAt: new Date(Date.now() - 2 * 60_000).toISOString() },
  { ...searchResult('notes', 'lab-notes.docx', { type: 'office', origin: 'own', status: 'private' }), updatedAt: new Date(Date.now() - 26 * 3600_000).toISOString() },
];

function answer(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
}

function api(search: () => Promise<Response>) {
  return vi.fn(async (input: string | URL | Request) => {
    const url = String(input);
    if (url.startsWith('/api/recent')) return answer(200, { documents: RECENT });
    if (url.startsWith('/api/search')) return search();
    return answer(404, { error: 'not-found' });
  });
}

const paletteState = (): string | null => document.querySelector('[data-id="palette"]')?.getAttribute('data-state') ?? null;

function open(searchAnswer: () => Promise<Response>, initialQuery = '') {
  vi.stubGlobal('fetch', api(searchAnswer));
  const navigate = vi.fn();
  const onClose = vi.fn();
  renderWithI18n(<CommandPalette initialQuery={initialQuery} onClose={onClose} navigate={navigate} />);
  const input = screen.getByRole('combobox', { name: 'Search knowledge or ask AI' });
  return { navigate, onClose, input };
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('CommandPalette (F01)', () => {
  it('offers the recent texts and the quick commands before anything is typed; a command runs on its letter', async () => {
    const { navigate, input } = open(async () => answer(200, DHCP_ANSWER));
    expect(document.activeElement).toBe(input);
    expect(paletteState()).toBe('empty');
    expect(await screen.findByText('Lab · 2 minutes ago')).toBeTruthy();
    const options = screen.getAllByRole('option');
    expect(options.map((o) => o.textContent)).toEqual([
      'Giao thức DHCPLab · 2 minutes ago',
      'lab-notes.docxWord file · yesterday',
      'New noteN',
      'Open CanvasC',
      'Ask AIA',
      'Upload an Office fileU',
    ]);
    expect(options[0]?.getAttribute('aria-selected')).toBe('true');
    // Typing goes into the search while a text is selected…
    fireEvent.keyDown(input, { key: 'c' });
    expect(navigate).not.toHaveBeenCalled();
    // …and runs the command once one is selected.
    for (let i = 0; i < 3; i += 1) fireEvent.keyDown(input, { key: 'ArrowDown' });
    expect(options[3]?.getAttribute('aria-selected')).toBe('true');
    fireEvent.keyDown(input, { key: 'c' });
    expect(navigate).toHaveBeenCalledWith('/canvas');
  });

  it('shows keyword matches by Space, results by meaning and a preview; Enter opens, ⇧Enter shows them all, Tab toggles the preview', async () => {
    const { navigate, onClose, input } = open(async () => answer(200, DHCP_ANSWER), 'dhcp');
    await waitFor(() => expect(paletteState()).toBe('results'));
    expect(screen.getByRole('option', { name: /Ask AI: “dhcp”/ }).getAttribute('href')).toBe('/copilot?q=dhcp');
    expect(screen.getByText('Keyword matches · 2 · by Space')).toBeTruthy();
    const net = screen.getByRole('group', { name: 'Networking' });
    expect(within(net).getAllByRole('option')[0]?.querySelector('mark')?.textContent).toBe('DHCP');
    expect(screen.getByText('By meaning · Jev')).toBeTruthy();
    expect(screen.getByRole('option', { name: /syslog/ }).textContent).toContain('Đọc log dhclient');

    const preview = screen.getByRole('complementary', { name: 'Preview' });
    expect(within(preview).getByText('Giao thức DHCP')).toBeTruthy();
    expect(within(preview).getByText('Lab · VI')).toBeTruthy();
    fireEvent.keyDown(input, { key: 'Tab' });
    expect(screen.queryByRole('complementary', { name: 'Preview' })).toBeNull();
    fireEvent.keyDown(input, { key: 'Tab' });
    expect(screen.getByRole('complementary', { name: 'Preview' })).toBeTruthy();

    fireEvent.keyDown(input, { key: 'Enter', shiftKey: true });
    expect(navigate).toHaveBeenLastCalledWith('/search?q=dhcp');
    fireEvent.keyDown(input, { key: 'ArrowUp' });
    fireEvent.keyDown(input, { key: 'Enter' });
    expect(navigate).toHaveBeenLastCalledWith('/copilot?q=dhcp');
    fireEvent.keyDown(input, { key: 'ArrowDown' });
    fireEvent.keyDown(input, { key: 'Enter' });
    expect(navigate).toHaveBeenLastCalledWith('/d/dhcp#tong-quan');
    expect(screen.getByRole('link', { name: /See all results/ }).getAttribute('href')).toBe('/search?q=dhcp');
    fireEvent.keyDown(input, { key: 'Escape' });
    expect(onClose).toHaveBeenCalled();
  });

  it('shows the loading rows while Jev searches', async () => {
    open(() => new Promise<Response>(() => undefined), 'dhcp');
    expect(await screen.findByText('Jev is searching by meaning…')).toBeTruthy();
    expect(paletteState()).toBe('searching');
    expect(document.querySelector('[aria-busy="true"]')).toBeTruthy();
  });

  it('says when nothing is found, by keyword or by meaning', async () => {
    open(async () => answer(200, searchResponse('sao lưu etcd', [])), 'sao lưu etcd');
    await waitFor(() => expect(paletteState()).toBe('none'));
    expect(screen.getByText('Nothing on “sao lưu etcd” by keyword or by meaning.')).toBeTruthy();
    expect(screen.getByRole('link', { name: 'Ask AI' }).getAttribute('href')).toBe('/copilot?q=sao+l%C6%B0u+etcd');
  });

  it('says when it matches exact accents, and when Jev did not answer', async () => {
    const exact: SearchResponse = searchResponse('mạng', [{ space: NET_SPACE, results: [searchResult('osi', 'Packet Journey')] }], { exact: true, meaning: 'failed' });
    open(async () => answer(200, exact), 'mạng');
    expect(await screen.findByText('Matching exact accents · type without them for every variant')).toBeTruthy();
    expect(screen.getByText('Exact matches for “mạng” · 1 · by Space')).toBeTruthy();
    expect(screen.getByText('Jev is not answering · keyword results only')).toBeTruthy();
  });

  it('builds no result items for an empty answer', () => {
    expect(paletteItems('x', [], searchResponse('x', []))).toEqual([]);
    expect(paletteItems('', [], null).map((item) => item.kind)).toEqual(['command', 'command', 'command', 'command']);
  });
});

describe('the ⌘K shortcut', () => {
  const SIGNED_IN: SessionState = { status: 'ready', signedIn: true, signInAvailable: true, user: { name: 'Đạt', email: null, picture: null } };

  beforeEach(() => {
    vi.stubGlobal('fetch', api(async () => answer(200, DHCP_ANSWER)));
  });

  it('opens and closes the palette from anywhere, and from the ⌘K button', async () => {
    renderWithI18n(
      <SessionProvider value={SIGNED_IN}>
        <AppShell screen="C09">
          <p>content</p>
        </AppShell>
      </SessionProvider>,
    );
    expect(screen.queryByRole('dialog')).toBeNull();
    fireEvent.keyDown(document, { key: 'k', ctrlKey: true });
    expect(screen.getByRole('dialog', { name: 'Quick search' })).toBeTruthy();
    fireEvent.keyDown(document, { key: 'K', metaKey: true });
    expect(screen.queryByRole('dialog')).toBeNull();

    const button = screen.getByRole('link', { name: 'Quick search and commands (⌘K)' });
    fireEvent.click(button);
    expect(screen.getByRole('dialog')).toBeTruthy();
    expect(button.getAttribute('aria-expanded')).toBe('true');
    fireEvent.keyDown(screen.getByRole('combobox'), { key: 'Escape' });
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
  });

  it('is ⌘K or Ctrl+K only', () => {
    expect(isPaletteShortcut({ key: 'k', metaKey: true, ctrlKey: false, altKey: false, shiftKey: false })).toBe(true);
    expect(isPaletteShortcut({ key: 'k', metaKey: false, ctrlKey: false, altKey: false, shiftKey: false })).toBe(false);
    expect(isPaletteShortcut({ key: 'k', metaKey: false, ctrlKey: true, altKey: false, shiftKey: true })).toBe(false);
  });
});
