import { act, fireEvent, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Canvas, CanvasData } from '../api/canvas-api';
import { answer } from '../test/api-fakes';
import { renderWithI18n } from '../test/render';
import { CanvasList } from './canvas-list';
import { CanvasRoute, CanvasScreen } from './canvas-screen';

const NET = { slug: 'networking', nameVi: 'Networking', nameEn: 'Networking', tint: '#C4B5FD', glow: '#8B5CF6' };
const ID = 'cv1';

function canvasOf(data: Partial<CanvasData> = {}): Canvas {
  return {
    id: ID,
    title: 'DHCP từ A đến Z',
    updatedAt: '2026-11-03T14:05:00.000Z',
    space: NET,
    canvas: {
      rev: 0,
      cards: [
        { id: 'idea', kind: 'idea', x: 250, y: 190, w: 220, title: 'Vì sao máy mới phải hét lên cả mạng?' },
        { id: 'lab', kind: 'document', x: 560, y: 300, w: 300, title: 'Giao thức DHCP', documentId: 'dhcp' },
        { id: 'diag', kind: 'diagram', x: 960, y: 170, w: 240, title: 'DORA 4 bước', steps: ['D', 'O', 'R', 'A'] },
        { id: 'url', kind: 'link', x: 780, y: 200, w: 200, title: 'RFC 2131 · DHCP', url: 'https://datatracker.ietf.org/doc/html/rfc2131' },
        { id: 'gone', kind: 'document', x: 100, y: 600, w: 230, title: '', documentId: 'hidden-doc' },
      ],
      connections: [
        { id: 'k1', from: 'idea', to: 'lab' },
        { id: 'k2', from: 'lab', to: 'diag' },
      ],
      ...data,
    },
    documents: { dhcp: { title: 'Giao thức DHCP', type: 'lab', origin: 'official', status: 'approved', headings: ['Broadcast là gì', 'Lease và gia hạn'] } },
  };
}

interface Saved {
  body: { title: string; canvas: CanvasData };
  keepalive: boolean;
}

let saves: Saved[];
let saveReply: () => Response | Promise<Response>;
let suggestion: unknown;

function stubApi(canvas: Canvas | (() => Response | Promise<Response>) = canvasOf()): ReturnType<typeof vi.fn> {
  const fetchMock = vi.fn(async (path: string, init?: RequestInit) => {
    const url = String(path);
    if (url.endsWith('/suggestion')) return answer(200, { suggestion });
    if (url === `/api/canvases/${ID}` && init?.method === 'PUT') {
      saves.push({ body: JSON.parse(String(init.body)) as Saved['body'], keepalive: init.keepalive === true });
      return saveReply();
    }
    if (url === `/api/canvases/${ID}`) return typeof canvas === 'function' ? canvas() : answer(200, canvas);
    return answer(404, { error: 'not-found' });
  });
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

beforeEach(() => {
  saves = [];
  saveReply = () => answer(200, { updatedAt: '2026-11-05T02:00:00.000Z', rev: 1 });
  suggestion = null;
  window.localStorage.clear();
  window.history.replaceState(null, '', `/canvas/${ID}`);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

const cardButton = (name: RegExp): HTMLElement => within(screen.getByRole('group', { name: 'Cards' })).getByRole('button', { name });
const saveState = (): string | null | undefined => document.querySelector('[data-id="canvas-save"]')?.textContent;
const lastSave = (): Saved | undefined => saves.at(-1);

describe('CanvasScreen', () => {
  it('draws the board: each kind of card, its connections, the minimap and "saved"', async () => {
    stubApi();
    renderWithI18n(<CanvasScreen id={ID} />);
    expect(await screen.findByRole('button', { name: 'Lab · Official: Giao thức DHCP' })).toBeTruthy();
    expect(cardButton(/^Idea:/).textContent).toContain('Vì sao máy mới');
    expect(cardButton(/^Diagram:/).textContent).toBe('DiagramDORA 4 bướcDORA');
    expect(cardButton(/^Link:/).textContent).toContain('datatracker.ietf.org');
    expect(cardButton(/^Document: This document cannot be opened/)).toBeTruthy();
    // The lab's preview: its first two sections.
    expect(cardButton(/^Lab/).textContent).toContain('Broadcast là gì');
    expect(document.querySelectorAll('.canvas-link')).toHaveLength(2);
    expect(document.querySelectorAll('.canvas-minimap-card')).toHaveLength(5);
    expect(saveState()).toBe('saved');
    expect(screen.getByRole('navigation', { name: 'You are here' }).textContent).toContain('Canvas · DHCP từ A đến Z');
    expect(screen.getByRole('link', { name: '↔ Graph' }).getAttribute('href')).toBe('/graph?space=networking');
    expect(screen.getByRole('button', { name: 'Share' }).getAttribute('aria-disabled')).toBe('true');
    // Picking a document card shows its actions.
    fireEvent.pointerDown(cardButton(/^Lab/), { button: 0, pointerId: 1, clientX: 600, clientY: 320 });
    fireEvent.pointerUp(window, { pointerId: 1, clientX: 600, clientY: 320 });
    const bar = screen.getByRole('toolbar', { name: 'Card actions' });
    expect(within(bar).getByRole('link', { name: 'Open' }).getAttribute('href')).toBe('/d/dhcp');
    expect(within(bar).getByRole('link', { name: 'Ask AI' }).getAttribute('href')).toContain('scope=document%3Adhcp');
    expect(saves).toEqual([]);
  });

  it('saves a dragged card 800 ms after the pause, as one undoable change', async () => {
    stubApi();
    renderWithI18n(<CanvasScreen id={ID} />);
    const idea = await screen.findByRole('button', { name: /^Idea:/ });
    fireEvent.pointerDown(idea, { button: 0, pointerId: 1, clientX: 300, clientY: 200 });
    fireEvent.pointerMove(window, { pointerId: 1, clientX: 340, clientY: 230 });
    fireEvent.pointerMove(window, { pointerId: 1, clientX: 380, clientY: 260 });
    fireEvent.pointerUp(window, { pointerId: 1, clientX: 380, clientY: 260 });
    expect(idea.style.left).toBe('330px');
    expect(saveState()).toBe('saving…');
    // Kept in this browser at once, before the server has it.
    expect(window.localStorage.getItem(`kb.canvas.draft.${ID}`)).toContain('"x":330');
    await waitFor(() => expect(saves).toHaveLength(1), { timeout: 3000 });
    expect(lastSave()?.body.canvas.cards[0]).toMatchObject({ id: 'idea', x: 330, y: 250 });
    expect(lastSave()?.body.canvas.rev).toBeGreaterThan(0);
    await waitFor(() => expect(saveState()).toBe('saved'));
    expect(window.localStorage.getItem(`kb.canvas.draft.${ID}`)).toBeNull();

    fireEvent.keyDown(window, { key: 'z', ctrlKey: true });
    expect(idea.style.left).toBe('250px');
    await waitFor(() => expect(saves).toHaveLength(2), { timeout: 3000 });
    expect(lastSave()?.body.canvas.cards[0]).toMatchObject({ x: 250, y: 190 });
    fireEvent.keyDown(window, { key: 'Z', metaKey: true, shiftKey: true });
    expect(idea.style.left).toBe('330px');
    const revs = saves.map((s) => s.body.canvas.rev);
    expect([...revs].sort((a, b) => a - b)).toEqual(revs);
  });

  it('moves, adds, connects and deletes from the keyboard', async () => {
    stubApi();
    renderWithI18n(<CanvasScreen id={ID} />);
    const idea = await screen.findByRole('button', { name: /^Idea:/ });
    fireEvent.keyDown(idea, { key: 'ArrowRight' });
    fireEvent.keyDown(idea, { key: 'ArrowDown', shiftKey: true });
    expect([idea.style.left, idea.style.top]).toEqual(['260px', '230px']);

    // N: a note in the middle of the view, its dialog open to name it.
    fireEvent.keyDown(window, { key: 'n' });
    const dialog = await screen.findByRole('dialog', { name: 'Edit card' });
    fireEvent.change(within(dialog).getByLabelText('Title'), { target: { value: 'Câu hỏi relay' } });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Save' }));
    const note = cardButton(/^Note: Câu hỏi relay/);

    // L with the note picked, then the diagram: connected.
    fireEvent.keyDown(window, { key: 'l' });
    expect(screen.getByText(/Pick the second card to connect with “Câu hỏi relay”/)).toBeTruthy();
    fireEvent.keyDown(cardButton(/^Diagram:/), { key: 'Enter' });
    expect(document.querySelectorAll('.canvas-link')).toHaveLength(3);

    // Enter on the picked note opens it; Delete removes the picked card and its connection.
    fireEvent.keyDown(note, { key: 'Enter' });
    fireEvent.keyDown(note, { key: 'Enter' });
    const again = await screen.findByRole('dialog', { name: 'Edit card' });
    expect(within(again).getByText('DORA 4 bước')).toBeTruthy();
    fireEvent.click(within(again).getByRole('button', { name: 'Cancel' }));
    fireEvent.keyDown(window, { key: 'Delete' });
    expect(within(screen.getByRole('group', { name: 'Cards' })).queryByRole('button', { name: /Câu hỏi relay/ })).toBeNull();
    expect(document.querySelectorAll('.canvas-link')).toHaveLength(2);
    await waitFor(() => expect(lastSave()?.body.canvas.cards.some((c) => c.title === 'Câu hỏi relay')).toBe(false), { timeout: 3000 });
  });

  it("offers Jev's suggested connection and connects only when accepted", async () => {
    suggestion = { from: 'idea', to: 'diag', relevance: 91 };
    stubApi();
    renderWithI18n(<CanvasScreen id={ID} />);
    const banner = await screen.findByText('Jev suggests: connect Idea ↔ Diagram · 0.91');
    expect(document.querySelectorAll('.canvas-link')).toHaveLength(2);
    fireEvent.click(within(banner.parentElement ?? document.body).getByRole('button', { name: 'Connect' }));
    expect(document.querySelectorAll('.canvas-link')).toHaveLength(3);
    expect(screen.queryByText(/Jev suggests/)).toBeNull();
    await waitFor(() => expect(lastSave()?.body.canvas.connections).toHaveLength(3), { timeout: 3000 });
  });

  it('says when a save failed, retries it, and waits for the network when offline', async () => {
    saveReply = () => answer(500, { error: 'internal' });
    stubApi();
    renderWithI18n(<CanvasScreen id={ID} />);
    const idea = await screen.findByRole('button', { name: /^Idea:/ });
    fireEvent.keyDown(idea, { key: 'ArrowRight' });
    await waitFor(() => expect(saveState()).toBe('Not savedTry again'), { timeout: 3000 });
    saveReply = () => answer(200, { updatedAt: '2026-11-05T02:00:00.000Z', rev: 2 });
    fireEvent.click(screen.getByRole('button', { name: 'Try again' }));
    await waitFor(() => expect(saveState()).toBe('saved'));

    saveReply = () => Promise.reject(new TypeError('offline'));
    fireEvent.keyDown(idea, { key: 'ArrowRight' });
    await waitFor(() => expect(saveState()).toBe('Offline · saves once back online'), { timeout: 3000 });
    saveReply = () => answer(200, { updatedAt: '2026-11-05T02:00:00.000Z', rev: 3 });
    await act(async () => {
      window.dispatchEvent(new Event('online'));
    });
    await waitFor(() => expect(saveState()).toBe('saved'));
    expect(lastSave()?.body.canvas.cards[0]?.x).toBe(270);
  });

  it('stops autosave when another tab saved a newer state', async () => {
    saveReply = () => answer(409, { error: 'stale', rev: 99 });
    stubApi();
    renderWithI18n(<CanvasScreen id={ID} />);
    fireEvent.keyDown(await screen.findByRole('button', { name: /^Idea:/ }), { key: 'ArrowRight' });
    await waitFor(() => expect(saveState()).toBe('This canvas changed in another tabReload'), { timeout: 3000 });
  });

  it('restores changes the server never got, and sends pending ones when the page is left', async () => {
    const draft = { id: ID, title: 'DHCP từ A đến Z', canvas: { ...canvasOf().canvas, rev: 50, cards: [{ id: 'idea', kind: 'idea', x: 1, y: 2, w: 220, title: 'Đã sửa' }], connections: [] } };
    window.localStorage.setItem(`kb.canvas.draft.${ID}`, JSON.stringify(draft));
    stubApi();
    renderWithI18n(<CanvasScreen id={ID} />);
    expect(await screen.findByText('Restored the changes that were not saved last time.')).toBeTruthy();
    expect(cardButton(/^Idea: Đã sửa/)).toBeTruthy();
    await waitFor(() => expect(lastSave()?.body.canvas.rev).toBe(50));

    fireEvent.keyDown(cardButton(/^Idea:/), { key: 'ArrowLeft' });
    const before = saves.length;
    window.dispatchEvent(new Event('pagehide'));
    expect(saves).toHaveLength(before + 1);
    expect(lastSave()?.keepalive).toBe(true);
    expect(lastSave()?.body.canvas.cards[0]).toMatchObject({ x: -9 });
  });

  it('keeps an older copy of this browser out when the server has newer', async () => {
    window.localStorage.setItem(`kb.canvas.draft.${ID}`, JSON.stringify({ id: ID, title: 'cũ', canvas: { rev: 0, cards: [], connections: [] } }));
    stubApi(canvasOf({ rev: 7 }));
    renderWithI18n(<CanvasScreen id={ID} />);
    expect(await screen.findByRole('button', { name: /^Idea:/ })).toBeTruthy();
    expect(window.localStorage.getItem(`kb.canvas.draft.${ID}`)).toBeNull();
    expect(saves).toEqual([]);
  });

  it('shows an empty board, and a canvas that cannot be opened', async () => {
    stubApi(canvasOf({ cards: [], connections: [] }));
    const { unmount } = renderWithI18n(<CanvasScreen id={ID} />);
    expect(await screen.findByRole('heading', { name: 'This canvas is empty' })).toBeTruthy();
    expect(document.querySelector('[data-id="canvas-screen"]')?.getAttribute('data-state')).toBe('empty');
    fireEvent.click(screen.getByRole('button', { name: 'Add a note' }));
    expect(await screen.findByRole('dialog', { name: 'Edit card' })).toBeTruthy();
    unmount();

    stubApi(() => answer(404, { error: 'not-found' }));
    renderWithI18n(<CanvasScreen id={ID} />);
    expect(screen.getByRole('status').textContent).toBe('Opening the canvas…');
    await waitFor(() => expect(document.querySelector('[data-id="canvas-screen"]')?.getAttribute('data-state')).toBe('not-found'));
  });
});

describe('CanvasList', () => {
  it('lists the canvases, creates one in the Space asked for, and deletes after a confirm', async () => {
    window.history.replaceState(null, '', '/canvas?space=networking');
    const assign = vi.fn();
    vi.stubGlobal('location', { ...window.location, assign, search: '?space=networking' });
    const calls: Array<[string, string | undefined]> = [];
    vi.stubGlobal(
      'fetch',
      vi.fn(async (path: string, init?: RequestInit) => {
        calls.push([String(path), init?.method]);
        if (init?.method === 'POST') return answer(201, { ...canvasOf(), id: 'new1' });
        if (init?.method === 'DELETE') return new Response(null, { status: 204 });
        return answer(200, { canvases: [{ id: ID, title: 'DHCP từ A đến Z', updatedAt: '2026-11-03T14:05:00.000Z', spaceSlug: 'networking', cards: 7 }] });
      }),
    );
    renderWithI18n(<CanvasList />);
    const link = await screen.findByRole('link', { name: /DHCP từ A đến Z/ });
    expect(link.getAttribute('href')).toBe(`/canvas/${ID}`);
    expect(link.textContent).toContain('7 cards');
    expect(calls[0]?.[0]).toBe('/api/canvases?space=networking');

    fireEvent.change(screen.getByLabelText('Name of the new canvas'), { target: { value: 'Lối vào mạng' } });
    fireEvent.click(screen.getByRole('button', { name: 'Create canvas' }));
    await waitFor(() => expect(assign).toHaveBeenCalledWith('/canvas/new1'));

    fireEvent.click(screen.getByRole('button', { name: 'Delete DHCP từ A đến Z' }));
    fireEvent.click(within(await screen.findByRole('dialog')).getByRole('button', { name: 'Delete' }));
    await waitFor(() => expect(screen.getByText('You have no canvas yet.')).toBeTruthy());
  });

  it('says when the list could not load, and tries again', async () => {
    let ok = false;
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => (ok ? answer(200, { canvases: [] }) : answer(500, { error: 'internal' }))),
    );
    renderWithI18n(<CanvasList />);
    expect((await screen.findByRole('alert')).textContent).toContain('Could not load your canvases.');
    ok = true;
    fireEvent.click(screen.getByRole('button', { name: 'Try again' }));
    expect(await screen.findByText('You have no canvas yet.')).toBeTruthy();
  });
});

describe('Canvas on a phone', () => {
  afterEach(() => {
    delete document.documentElement.dataset.device;
  });

  it('says a phone has no Canvas and leads back to the Universe, without loading one', () => {
    document.documentElement.dataset.device = 'phone';
    const fetch = vi.fn();
    vi.stubGlobal('fetch', fetch);
    renderWithI18n(<CanvasRoute id="c1" />);
    expect(screen.getByText('Canvas is on desktop and tablet only.')).toBeTruthy();
    expect(screen.getByRole('link', { name: 'Back to the Universe' }).getAttribute('href')).toBe('/u');
    expect(fetch).not.toHaveBeenCalled();
  });
});
