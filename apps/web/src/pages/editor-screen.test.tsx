/**
 * The editor (C02) in jsdom: the board's draft opens with its step cards and warning, the save chip goes through
 * its states (typing, saving, saved, offline, failed, changed elsewhere), offline edits wait in this browser and are
 * sent when the connection returns, "AI viết hộ" streams and inserts only when accepted, no key leads to Own keys,
 * and each state of a document that cannot be edited here.
 */
import 'fake-indexeddb/auto';
import { act, fireEvent, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { EditableDocument } from '../api/authoring-api';
import { KEYS_NONE, KEYS_OPENAI, answer, eventStream } from '../test/api-fakes';
import { renderWithI18n } from '../test/render';
import { resetDraftStore } from './editor-drafts';
import { EditorScreen, textToSteps } from './editor-screen';

const ID = 'c5558d12-5814-45e0-8e97-6d23656aed6a';
const DOC: EditableDocument = {
  id: ID,
  title: 'Máy mới xin IP thế nào',
  body: [
    'Máy mới vào mạng chưa có IP. Nó phải hỏi cả mạng bằng broadcast, theo 4 bước gọi là DORA.',
    '1. **Discover**\n2. **Offer**\n3. **Request**\n4. **Acknowledge**',
    '> [!WARNING]\n> Mạng có DHCP giả mạo thì máy bạn có thể nhận nhầm gateway.',
    'Xem thêm [[',
  ].join('\n\n'),
  type: 'note',
  lang: 'vi',
  origin: 'own',
  status: 'draft',
  planet: 'violet',
  rev: '2026-10-20T14:24:00.000Z',
  version: 1,
  savedAt: '2026-10-20T14:24:00.000Z',
  space: { slug: 'personal-me', nameVi: 'Vũ trụ của bạn', nameEn: 'Your universe', tint: '#F9A8D4', glow: '#EC4899', kind: 'personal' },
  collection: null,
};

interface Put {
  title: string;
  body: string;
  planet?: string | null;
  baseRev: string;
  aiMade?: boolean;
}

let puts: Put[];
let putReply: (body: Put) => Response | Promise<Response>;
let editReply: () => Response | Promise<Response>;
let keysReply: () => Response;
let writeReply: () => Response;
let online = true;

function stubApi(): void {
  vi.stubGlobal(
    'fetch',
    vi.fn(async (path: string, init?: RequestInit) => {
      const url = String(path);
      if (url === `/api/documents/${ID}/edit`) return editReply();
      if (url === `/api/documents/${ID}` && init?.method === 'PUT') {
        if (!online) throw new TypeError('Failed to fetch');
        const body = JSON.parse(String(init.body)) as Put;
        puts.push(body);
        return putReply(body);
      }
      if (url === '/api/me/keys') return keysReply();
      if (url === `/api/documents/${ID}/links`) return answer(200, { backlinks: [], outgoing: [] });
      if (url === '/api/write') return writeReply();
      return answer(404, { error: 'not-found' });
    }),
  );
}

let revCounter = 0;
function saved(): Response {
  revCounter += 1;
  const at = new Date(Date.parse(DOC.rev) + revCounter * 1000).toISOString();
  return answer(200, { rev: at, version: 1, savedAt: at, changed: true });
}

beforeEach(async () => {
  puts = [];
  revCounter = 0;
  online = true;
  putReply = () => saved();
  editReply = () => answer(200, DOC);
  keysReply = () => answer(200, KEYS_OPENAI);
  writeReply = () => answer(500, { error: 'internal' });
  Object.defineProperty(window.navigator, 'onLine', { configurable: true, get: () => online });
  window.history.replaceState(null, '', `/d/${ID}/edit`);
  await resetDraftStore();
  await new Promise((resolve) => {
    const request = indexedDB.deleteDatabase('kb-editor');
    request.onsuccess = resolve;
    request.onerror = resolve;
  });
  stubApi();
});

afterEach(() => {
  vi.unstubAllGlobals();
});

const chip = (): HTMLElement | null => document.querySelector('[data-id="editor-save"]');
const chipState = (): string | null | undefined => chip()?.getAttribute('data-state');

async function open(): Promise<void> {
  renderWithI18n(<EditorScreen id={ID} />);
  await screen.findByDisplayValue(DOC.title);
}

describe('EditorScreen', () => {
  it('opens the board’s draft: title, step cards, the warning, the link being written, saved, words', async () => {
    await open();
    const steps = document.querySelector('.editor-steps');
    expect([...(steps?.querySelectorAll('.editor-step') ?? [])].map((s) => s.textContent)).toEqual(['D', 'O', 'R', 'A']);
    expect(document.querySelector('.editor-callout')?.textContent).toContain('Mạng có DHCP giả mạo');
    expect(document.querySelector('.editor-link-pending')?.textContent).toBe('[[');
    expect(chipState()).toBe('saved');
    expect(chip()?.textContent).toMatch(/^Saved 20\/10 21:24$/);
    expect(document.querySelector('[data-id="editor-words"]')?.textContent).toMatch(/^\d+ words · ~1 min read$/);
    expect(screen.getByRole('link', { name: 'History · v1' })).toHaveProperty('href', expect.stringContaining(`/d/${ID}/history`));
    expect(document.querySelector('.editor-crumb-tag')?.textContent).toBe('Yours · private');
    expect(await screen.findByText('OpenAI key ••••a1b2 · gpt-4.1-mini')).toBeTruthy();
    // Nothing to undo yet: opening is not an edit.
    expect(screen.getByRole('button', { name: 'Undo (⌘Z)' })).toHaveProperty('disabled', true);
  });

  it('saves 800 ms after the last change: typing → saving → saved, with the rev it started from', async () => {
    await open();
    fireEvent.change(screen.getByDisplayValue(DOC.title), { target: { value: 'Máy mới xin IP' } });
    expect(chipState()).toBe('typing');
    expect(chip()?.textContent).toBe('Typing…');
    await waitFor(() => expect(chipState()).toBe('saved'));
    expect(puts).toHaveLength(1);
    expect(puts[0]).toMatchObject({ title: 'Máy mới xin IP', baseRev: DOC.rev, planet: 'violet' });
    expect(puts[0]?.body).toContain('1. **Discover**\n2. **Offer**');
    expect(puts[0]?.body).toContain('> [!WARNING]');
    // The next save starts from the rev the server gave back.
    fireEvent.click(screen.getByRole('button', { name: 'Teal' }));
    await waitFor(() => expect(puts).toHaveLength(2));
    expect(puts[1]).toMatchObject({ planet: 'teal', baseRev: '2026-10-20T14:24:01.000Z' });
  });

  it('keeps what is typed offline on this device and sends it when the connection is back', async () => {
    await open();
    online = false;
    fireEvent.change(screen.getByDisplayValue(DOC.title), { target: { value: 'Viết khi mất mạng' } });
    await waitFor(() => expect(chipState()).toBe('offline'));
    expect(chip()?.textContent).toBe('Offline · kept on this device');
    expect(puts).toHaveLength(0);
    fireEvent.change(screen.getByDisplayValue('Viết khi mất mạng'), { target: { value: 'Viết khi mất mạng, thêm chữ' } });
    online = true;
    act(() => {
      window.dispatchEvent(new Event('online'));
    });
    await waitFor(() => expect(chipState()).toBe('saved'));
    expect(puts.at(-1)?.title).toBe('Viết khi mất mạng, thêm chữ');
  });

  it('shows a failed save with Retry, and a save made elsewhere with both ways out', async () => {
    await open();
    putReply = () => answer(500, { error: 'internal' });
    fireEvent.change(screen.getByDisplayValue(DOC.title), { target: { value: 'Lỗi' } });
    await waitFor(() => expect(chipState()).toBe('failed'));
    expect(chip()?.textContent).toBe('Not savedRetry');
    putReply = () => answer(409, { error: 'stale', rev: '2026-10-21T00:00:00.000Z' });
    fireEvent.click(screen.getByRole('button', { name: 'Retry' }));
    await waitFor(() => expect(chipState()).toBe('conflict'));
    expect(screen.getByRole('button', { name: 'Keep this version' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Load the other' })).toBeTruthy();
    // Keeping this version saves it over the server's current rev.
    editReply = () => answer(200, { ...DOC, rev: '2026-10-21T00:00:00.000Z' });
    putReply = () => saved();
    fireEvent.click(screen.getByRole('button', { name: 'Keep this version' }));
    await waitFor(() => expect(chipState()).toBe('saved'));
    expect(puts.at(-1)).toMatchObject({ title: 'Lỗi', baseRev: '2026-10-21T00:00:00.000Z' });
  });

  it('asks for a title before submitting', async () => {
    await open();
    fireEvent.change(screen.getByDisplayValue(DOC.title), { target: { value: '' } });
    fireEvent.click(screen.getByRole('button', { name: 'Submit for review' }));
    expect(screen.getByRole('alert').textContent).toBe('Add a title before submitting.');
    expect(screen.getByPlaceholderText('A short title…').getAttribute('aria-invalid')).toBe('true');
  });

  it('streams AI writing, and inserts it only when accepted (undoable)', async () => {
    // jsdom has no layout: scrolling the caret into view after the insert measures a Range.
    Range.prototype.getClientRects = () => [] as unknown as DOMRectList;
    Range.prototype.getBoundingClientRect = () => new DOMRect(0, 0, 10, 10);
    const scrollBy = vi.spyOn(window, 'scrollBy').mockImplementation(() => undefined);
    writeReply = () =>
      eventStream([
        ['delta', { text: 'Gần hết hạn, máy ' }],
        ['delta', { text: 'tự xin gia hạn.' }],
        ['done', { provider: 'openai', model: 'gpt-4.1-mini', last4: 'a1b2' }],
      ]);
    await open();
    await screen.findByText('OpenAI key ••••a1b2 · gpt-4.1-mini');
    fireEvent.click(screen.getByRole('button', { name: 'Continue' }));
    const card = await screen.findByRole('region', { name: 'AI suggestion' });
    await waitFor(() => expect(card.getAttribute('data-state')).toBe('done'));
    expect(card.textContent).toContain('Gần hết hạn, máy tự xin gia hạn.');
    expect(document.querySelector('.editor-content')?.textContent).not.toContain('tự xin gia hạn');
    fireEvent.click(screen.getByRole('button', { name: 'Accept' }));
    expect(document.querySelector('.editor-content')?.textContent).toContain('Gần hết hạn, máy tự xin gia hạn.');
    expect(screen.getByText('Inserted · ⌘Z to undo')).toBeTruthy();
    // The save that carries the accepted text tells the server it holds AI text; the next one does not.
    const withAi = (): Put[] => puts.filter((put) => put.body.includes('tự xin gia hạn.'));
    await waitFor(() => expect(withAi()).toHaveLength(1));
    expect(withAi()[0]?.aiMade).toBe(true);
    fireEvent.click(screen.getByRole('button', { name: 'Undo (⌘Z)' }));
    expect(document.querySelector('.editor-content')?.textContent).not.toContain('tự xin gia hạn');
    const after = puts.length;
    await waitFor(() => expect(puts.length).toBeGreaterThan(after));
    expect(puts.at(-1)?.aiMade).toBeUndefined();
    scrollBy.mockRestore();
  });

  it('without an own key: the AI actions wait and the card leads to Own keys', async () => {
    keysReply = () => answer(200, KEYS_NONE);
    await open();
    expect(await screen.findByText('AI writing needs your key')).toBeTruthy();
    expect(screen.getByRole('link', { name: 'Open Own keys' }).getAttribute('href')).toBe('/settings/keys');
    expect(screen.getByRole('button', { name: 'Continue' })).toHaveProperty('disabled', true);
  });

  it('tells a refused key apart and leads to Own keys', async () => {
    writeReply = () => eventStream([['error', { code: 'USER_KEY_REJECTED', provider: 'openai', last4: 'a1b2' }]]);
    await open();
    await screen.findByText('OpenAI key ••••a1b2 · gpt-4.1-mini');
    fireEvent.click(screen.getByRole('button', { name: 'Outline' }));
    expect((await screen.findByRole('alert')).textContent).toContain('The provider refused key ••••a1b2.');
  });

  it.each([
    [() => answer(403, { error: 'locked' }), 'editor-locked', 'This text is in review or published'],
    [() => answer(409, { error: 'not-editable' }), 'editor-not-editable', 'This file is not edited here'],
    [() => Promise.reject(new TypeError('Failed to fetch')), 'editor-offline', 'You are offline'],
  ] as const)('shows the state of a document it cannot edit (%#)', async (reply, id, title) => {
    editReply = reply;
    renderWithI18n(<EditorScreen id={ID} />);
    const state = await waitFor(() => {
      const found = document.querySelector(`[data-id="${id}"]`);
      if (!found) throw new Error(`no ${id}`);
      return found;
    });
    expect(state.textContent).toContain(title);
  });

  it('sends a journey on to its builder (C07)', async () => {
    const replace = vi.fn();
    vi.stubGlobal('location', { ...window.location, replace, pathname: `/d/${ID}/edit`, search: '' });
    editReply = () => answer(409, { error: 'journey' });
    renderWithI18n(<EditorScreen id={ID} />);
    await waitFor(() => expect(replace).toHaveBeenCalledWith(`/journey/${ID}/edit`));
  });

  it('refuses someone else’s document and an unknown one with the X02 panels', async () => {
    editReply = () => answer(403, { error: 'no-access' });
    const { unmount } = renderWithI18n(<EditorScreen id={ID} />);
    await waitFor(() => expect(document.querySelector('[data-id="editor-screen"]')?.getAttribute('data-state')).toBe('no-access'));
    expect(screen.getByText('403')).toBeTruthy();
    unmount();
    editReply = () => answer(404, { error: 'not-found' });
    renderWithI18n(<EditorScreen id={ID} />);
    await waitFor(() => expect(document.querySelector('[data-id="editor-screen"]')?.getAttribute('data-state')).toBe('not-found'));
  });
});

describe('textToSteps', () => {
  it('reads one step per line, with an optional description after a dash', () => {
    expect(textToSteps('Discover — Hét lên cả mạng\nOffer\n\n**Request** - Xin đúng IP')).toEqual([
      { term: 'Discover', text: 'Hét lên cả mạng' },
      { term: 'Offer', text: '' },
      { term: 'Request', text: 'Xin đúng IP' },
    ]);
    expect(textToSteps('Một bước')).toBeNull();
    expect(textToSteps('1\n2\n3\n4\n5\n6\n7')).toBeNull();
  });
});

describe('EditorScreen on a phone (M02 editor stage)', () => {
  afterEach(() => {
    delete document.documentElement.dataset.device;
  });

  it('edits the same draft in the phone layout: title, planet colour, autosave, "Next" and the AI sheet', async () => {
    document.documentElement.dataset.device = 'phone';
    await open();
    expect(document.querySelector('[data-screen="M02"]')).not.toBeNull();
    expect(document.querySelector('[data-id="tab-bar"]')).toBeNull();
    expect(screen.getByText('Yours · private · Your universe')).toBeTruthy();
    expect(chipState()).toBe('saved');
    // the same autosave as on a desktop
    fireEvent.change(screen.getByRole('textbox', { name: 'Title' }), { target: { value: 'Máy mới xin IP' } });
    fireEvent.click(screen.getByRole('button', { name: 'Teal' }));
    await waitFor(() => expect(puts.at(-1)).toMatchObject({ title: 'Máy mới xin IP', planet: 'teal' }));
    // "Next" needs a title, then goes to publishing (M03)
    fireEvent.change(screen.getByRole('textbox', { name: 'Title' }), { target: { value: ' ' } });
    fireEvent.click(screen.getByRole('button', { name: 'Next' }));
    expect(screen.getByRole('alert')).toBeTruthy();
    // the assistant opens as a sheet and closes from its handle
    fireEvent.click(screen.getByRole('button', { name: 'Ask AI to write on' }));
    expect(document.querySelector('[data-id="editor-ai-sheet"] [data-id="editor-assistant"]')).not.toBeNull();
    fireEvent.click(screen.getAllByRole('button', { name: 'Close the assistant' })[1] as HTMLElement);
    expect(document.querySelector('[data-id="editor-ai-sheet"]')).toBeNull();
  });
});
