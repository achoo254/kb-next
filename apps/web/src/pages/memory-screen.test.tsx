import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ApiError } from '../api/api-client';
import type { Memory } from '../api/memory-api';
import { answer } from '../test/api-fakes';
import { renderWithI18n } from '../test/render';
import { MemoryScreen } from './memory-screen';
import { groupTopics } from './memory-topics';
import { undoFailure } from './memory-undo-card';

const MEMORY: Memory = {
  paused: false,
  sensitive: false,
  topics: [
    { id: 'doc-a', title: 'Máy chính', summary: 'Dùng PC Windows', updatedAt: '2026-11-27T10:00:00.000Z', chatId: null, url: '/d/doc-a' },
    { id: 'doc-b', title: 'Dự án Chat', summary: 'Đang làm bridge', updatedAt: '2026-11-26T10:00:00.000Z', chatId: 45, url: '/d/doc-b' },
  ],
};

type Handler = (path: string, method: string, init?: RequestInit) => Response | undefined;
let fetchMock: ReturnType<typeof vi.fn<(input: RequestInfo | URL, init?: RequestInit) => Promise<Response>>>;

/** Answers the memory API; other calls (the shell's own) get an empty 404. */
function serve(handler: Handler): void {
  fetchMock.mockImplementation(async (input: RequestInfo | URL, init?: RequestInit) => {
    const path = new URL(String(input), 'http://localhost').pathname;
    return handler(path, (init?.method ?? 'GET').toUpperCase(), init) ?? answer(404, { error: 'not-found' });
  });
}

function callsTo(method: string, path: string): Array<RequestInit | undefined> {
  return fetchMock.mock.calls
    .filter(([input, init]) => new URL(String(input), 'http://localhost').pathname === path && (init?.method ?? 'GET').toUpperCase() === method)
    .map(([, init]) => init);
}

beforeEach(() => {
  fetchMock = vi.fn<(input: RequestInfo | URL, init?: RequestInit) => Promise<Response>>();
  vi.stubGlobal('fetch', fetchMock);
});

afterEach(() => {
  vi.unstubAllGlobals();
  window.history.replaceState(null, '', '/');
});

describe('MemoryScreen', () => {
  it('lists general topics and conversation topics in their own groups', async () => {
    serve((path, method) => (path === '/api/memory' && method === 'GET' ? answer(200, MEMORY) : undefined));
    renderWithI18n(<MemoryScreen />);
    const general = await screen.findByRole('list', { name: 'General' });
    expect(within(general).getByRole('link', { name: 'Máy chính' }).getAttribute('href')).toBe('/d/doc-a');
    expect(within(general).queryByText('Dự án Chat')).toBeNull();
    const chats = screen.getByRole('list', { name: 'By conversation' });
    expect(within(chats).getByText('Conversation #45')).toBeTruthy();
    expect(within(chats).getByRole('link', { name: 'Edit' }).getAttribute('href')).toBe('/d/doc-b/edit');
  });

  it('shows the empty state when the AI remembered nothing', async () => {
    serve((path) => (path === '/api/memory' ? answer(200, { ...MEMORY, topics: [] }) : undefined));
    renderWithI18n(<MemoryScreen />);
    expect(await screen.findByText(/has not remembered anything yet/)).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Delete all memory' })).toBeNull();
  });

  it('saves a switch with PUT and puts it back when the save fails', async () => {
    let fail = false;
    serve((path, method, init) => {
      if (path === '/api/memory' && method === 'GET') return answer(200, MEMORY);
      if (path === '/api/memory/settings' && method === 'PUT') {
        if (fail) return answer(500, { error: 'internal' });
        const change = JSON.parse(String(init?.body)) as Partial<Memory>;
        return answer(200, { paused: change.paused ?? false, sensitive: change.sensitive ?? false });
      }
      return undefined;
    });
    renderWithI18n(<MemoryScreen />);
    const pause = await screen.findByRole('switch', { name: 'Pause memory' });
    fireEvent.click(pause);
    await waitFor(() => expect(callsTo('PUT', '/api/memory/settings')).toHaveLength(1));
    expect(JSON.parse(String(callsTo('PUT', '/api/memory/settings')[0]?.body))).toEqual({ paused: true });
    await waitFor(() => expect(pause.getAttribute('aria-checked')).toBe('true'));

    fail = true;
    const sensitive = screen.getByRole('switch', { name: 'Remember sensitive topics too' });
    fireEvent.click(sensitive);
    expect(sensitive.getAttribute('aria-checked')).toBe('true');
    expect(await screen.findByText('Your choice was not saved. Try again.')).toBeTruthy();
    expect(sensitive.getAttribute('aria-checked')).toBe('false');
  });

  it('only undoes when the undo button is pressed, then reloads the list', async () => {
    window.history.replaceState(null, '', '/memory?undo=tok-1');
    serve((path, method) => {
      if (path === '/api/memory' && method === 'GET') return answer(200, MEMORY);
      if (path === '/api/memory/undo' && method === 'POST') return answer(200, { undone: true, action: 'trashed', documentId: 'doc-a' });
      return undefined;
    });
    renderWithI18n(<MemoryScreen />);
    await screen.findByRole('list', { name: 'General' });
    expect(screen.getByText('Undo what was just remembered?')).toBeTruthy();
    expect(callsTo('POST', '/api/memory/undo')).toHaveLength(0);

    fireEvent.click(screen.getByRole('button', { name: 'Undo' }));
    expect(await screen.findByText('Undone: the new topic went to the trash.')).toBeTruthy();
    expect(JSON.parse(String(callsTo('POST', '/api/memory/undo')[0]?.body))).toEqual({ token: 'tok-1' });
    await waitFor(() => expect(callsTo('GET', '/api/memory')).toHaveLength(2));
  });

  it('has no undo card without an undo link', async () => {
    serve((path) => (path === '/api/memory' ? answer(200, MEMORY) : undefined));
    renderWithI18n(<MemoryScreen />);
    await screen.findByRole('list', { name: 'General' });
    expect(screen.queryByText('Undo what was just remembered?')).toBeNull();
  });

  it('moves one topic to the trash after the confirm', async () => {
    serve((path, method) => {
      if (path === '/api/memory' && method === 'GET') return answer(200, MEMORY);
      if (path === '/api/documents/doc-a' && method === 'DELETE') return new Response(null, { status: 204 });
      return undefined;
    });
    renderWithI18n(<MemoryScreen />);
    const general = await screen.findByRole('list', { name: 'General' });
    fireEvent.click(within(general).getByRole('button', { name: 'Delete' }));
    expect(callsTo('DELETE', '/api/documents/doc-a')).toHaveLength(0);
    const dialog = await screen.findByRole('dialog');
    expect(within(dialog).getByText(/30 days/)).toBeTruthy();
    fireEvent.click(within(dialog).getByRole('button', { name: 'Delete' }));
    await waitFor(() => expect(callsTo('DELETE', '/api/documents/doc-a')).toHaveLength(1));
  });
});

describe('memory helpers', () => {
  it('groups topics by whether they belong to a conversation, keeping the order', () => {
    const groups = groupTopics(MEMORY.topics);
    expect(groups.general.map((topic) => topic.id)).toEqual(['doc-a']);
    expect(groups.chats.map((topic) => topic.id)).toEqual(['doc-b']);
  });

  it('maps undo errors to friendly lines; only unknown failures may be retried', () => {
    expect(undoFailure(new ApiError(400, 'undo-expired'))).toEqual({ key: 'memory.undo.expired', retry: false });
    expect(undoFailure(new ApiError(400, 'undo-used'))).toEqual({ key: 'memory.undo.used', retry: false });
    expect(undoFailure(new ApiError(404, 'not-found'))).toEqual({ key: 'memory.undo.notFound', retry: false });
    expect(undoFailure(new ApiError(0, 'network'))).toEqual({ key: 'memory.undo.failed', retry: true });
  });
});
