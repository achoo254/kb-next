/**
 * The editor's autosave states (board C02's save chip, Interaction's 800 ms pause) and the success criterion of
 * phase 9: go offline mid-edit, come back, and the server gets every word.
 */
import 'fake-indexeddb/auto';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ApiError, NETWORK_ERROR } from '../api/api-client';
import type { EditableDocument, SaveRequest, SaveResult } from '../api/authoring-api';
import { type AutosaveDeps, type AutosaveState, DocumentAutosave, RETRY_MS, SAVE_DELAY_MS, type Snapshot, openForEditing } from './editor-autosave';
import { type EditorDraft, deleteDraft, readDraft, resetDraftStore, writeDraft } from './editor-drafts';

/** This browser's copies, in memory (IndexedDB runs on timers the autosave tests fake). */
function memoryDrafts() {
  const kept = new Map<string, EditorDraft>();
  return {
    kept,
    writeDraft: (draft: EditorDraft) => {
      kept.set(draft.id, draft);
      return Promise.resolve(true);
    },
    deleteDraft: (id: string) => {
      kept.delete(id);
      return Promise.resolve();
    },
  };
}

const DOC: EditableDocument = {
  id: 'doc-1',
  title: 'Máy mới xin IP thế nào',
  body: 'Máy mới vào mạng chưa có IP.',
  type: 'note',
  lang: 'vi',
  origin: 'own',
  status: 'draft',
  planet: 'violet',
  rev: '2026-10-20T14:24:00.000Z',
  version: 1,
  savedAt: '2026-10-20T14:24:00.000Z',
  space: { slug: 'personal-x', nameVi: 'Vũ trụ của bạn', nameEn: 'Your universe', tint: '#F9A8D4', glow: '#EC4899', kind: 'personal' },
  collection: null,
};

/** A server that keeps what it is sent, can be unplugged, and answers `stale` when told. */
function fakeServer() {
  const control = { online: true, stale: false, fail: false };
  const saved: SaveRequest[] = [];
  const drafts = memoryDrafts();
  let rev = DOC.rev;
  const deps: AutosaveDeps = {
    save: vi.fn(async (_id: string, request: SaveRequest): Promise<SaveResult> => {
      if (!control.online) throw new ApiError(0, NETWORK_ERROR);
      if (control.fail) throw new ApiError(500, 'internal');
      if (control.stale || request.baseRev !== rev) throw new ApiError(409, 'stale');
      saved.push(request);
      rev = new Date(Date.parse(rev) + 1000).toISOString();
      return { rev, version: 1 + saved.length, savedAt: rev, changed: true };
    }),
    fetchDoc: vi.fn(async () => ({ ...DOC, rev })),
    writeDraft: drafts.writeDraft,
    deleteDraft: drafts.deleteDraft,
    online: () => control.online,
  };
  return { control, saved, deps, kept: drafts.kept, setRev: (next: string) => (rev = next) };
}

function text(body: string): () => Snapshot {
  return () => ({ title: DOC.title, body, planet: 'violet' });
}

let states: AutosaveState[] = [];
const statuses = (): string[] => states.map((s) => s.status);

describe('autosave', () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'Date'] });
    states = [];
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('waits for an 800 ms pause, then saves: typing → saving → saved, and drops the browser copy', async () => {
    const server = fakeServer();
    const autosave = new DocumentAutosave(DOC, DOC, (s) => states.push(s), 'clean', DOC.rev, server.deps);
    autosave.edited(text('Máy mới vào'));
    autosave.edited(text('Máy mới vào mạng'));
    expect(autosave.state.status).toBe('typing');
    await vi.advanceTimersByTimeAsync(SAVE_DELAY_MS - 1);
    expect(server.saved).toHaveLength(0);
    // The copy in this browser is there before the server has it.
    expect(server.kept.get(DOC.id)?.body).toBe('Máy mới vào mạng');
    await vi.advanceTimersByTimeAsync(1);
    expect(server.saved.map((s) => s.body)).toEqual(['Máy mới vào mạng']);
    expect(statuses().slice(-2)).toEqual(['saving', 'saved']);
    expect(autosave.state.savedAt).toBe('2026-10-20T14:24:01.000Z');
    expect(server.kept.has(DOC.id)).toBe(false);
  });

  it('loses nothing when the connection drops mid-edit: kept in the browser, sent when it comes back', async () => {
    const server = fakeServer();
    const autosave = new DocumentAutosave(DOC, DOC, (s) => states.push(s), 'clean', DOC.rev, server.deps);
    autosave.edited(text('Một'));
    await vi.advanceTimersByTimeAsync(SAVE_DELAY_MS);
    server.control.online = false;
    autosave.edited(text('Một hai'));
    autosave.edited(text('Một hai ba'));
    await vi.advanceTimersByTimeAsync(SAVE_DELAY_MS * 3);
    expect(autosave.state.status).toBe('offline');
    expect(server.kept.get(DOC.id)?.body).toBe('Một hai ba');

    server.control.online = true;
    autosave.reconnected();
    await vi.advanceTimersByTimeAsync(0);
    expect(server.saved.map((s) => s.body)).toEqual(['Một', 'Một hai ba']);
    expect(autosave.state.status).toBe('saved');
    expect(server.kept.has(DOC.id)).toBe(false);
  });

  it('retries on its own when the server did not answer though the browser is online', async () => {
    const server = fakeServer();
    const autosave = new DocumentAutosave(DOC, DOC, (s) => states.push(s), 'clean', DOC.rev, server.deps);
    server.deps.save = vi.fn().mockRejectedValueOnce(new ApiError(0, NETWORK_ERROR)).mockImplementation(fakeServer().deps.save);
    autosave.edited(text('Hai'));
    await vi.advanceTimersByTimeAsync(SAVE_DELAY_MS);
    expect(autosave.state.status).toBe('offline');
    await vi.advanceTimersByTimeAsync(RETRY_MS);
    expect(autosave.state.status).toBe('saved');
  });

  it('shows a failed save with a retry, and the retry saves', async () => {
    const server = fakeServer();
    const autosave = new DocumentAutosave(DOC, DOC, (s) => states.push(s), 'clean', DOC.rev, server.deps);
    server.control.fail = true;
    autosave.edited(text('Ba'));
    await vi.advanceTimersByTimeAsync(SAVE_DELAY_MS);
    expect(autosave.state.status).toBe('failed');
    expect(server.kept.get(DOC.id)?.body).toBe('Ba');
    server.control.fail = false;
    await autosave.save();
    expect(autosave.state.status).toBe('saved');
  });

  it('stops on a save made elsewhere, and overwrites only when asked', async () => {
    const server = fakeServer();
    const autosave = new DocumentAutosave(DOC, DOC, (s) => states.push(s), 'clean', DOC.rev, server.deps);
    server.setRev('2026-10-21T00:00:00.000Z');
    autosave.edited(text('Của tab này'));
    await vi.advanceTimersByTimeAsync(SAVE_DELAY_MS);
    expect(autosave.state.status).toBe('conflict');
    autosave.edited(text('Của tab này, thêm chữ'));
    await vi.advanceTimersByTimeAsync(SAVE_DELAY_MS * 2);
    expect(server.saved).toHaveLength(0);
    await autosave.overwrite();
    expect(server.saved.map((s) => s.body)).toEqual(['Của tab này, thêm chữ']);
    expect(autosave.state.status).toBe('saved');
  });

  it('never races its own saves: leaving while a save is on its way waits for it, and the next save starts from its rev', async () => {
    const server = fakeServer();
    let release: () => void = () => undefined;
    const realSave = server.deps.save;
    let calls = 0;
    server.deps.save = vi.fn(async (id: string, request: SaveRequest, keepalive?: boolean) => {
      // Only the first save is held on its way.
      calls += 1;
      if (calls === 1) await new Promise<void>((resolve) => (release = resolve));
      return realSave(id, request, keepalive);
    });
    const autosave = new DocumentAutosave(DOC, DOC, (s) => states.push(s), 'clean', DOC.rev, server.deps);
    autosave.edited(text('Một'));
    await vi.advanceTimersByTimeAsync(SAVE_DELAY_MS);
    // The save is on its way; the tab goes to the back and the writer had typed more.
    autosave.edited(text('Một hai'));
    autosave.leave();
    expect(server.deps.save).toHaveBeenCalledTimes(1);
    release();
    await vi.advanceTimersByTimeAsync(SAVE_DELAY_MS * 2);
    expect(server.saved.map((s) => s.body)).toEqual(['Một', 'Một hai']);
    expect(autosave.state.status).toBe('saved');
    // Leaving with a keepalive save then typing on: the next save waits for it and uses its rev.
    autosave.edited(text('Một hai ba'));
    autosave.leave();
    autosave.edited(text('Một hai ba bốn'));
    await vi.advanceTimersByTimeAsync(SAVE_DELAY_MS * 2);
    expect(server.saved.map((s) => s.body)).toEqual(['Một', 'Một hai', 'Một hai ba', 'Một hai ba bốn']);
    expect(statuses()).not.toContain('conflict');
  });

  it('sends what is pending when the page is left', async () => {
    const server = fakeServer();
    const autosave = new DocumentAutosave(DOC, DOC, (s) => states.push(s), 'clean', DOC.rev, server.deps);
    autosave.edited(text('Đóng tab'));
    autosave.leave();
    await vi.advanceTimersByTimeAsync(0);
    expect(server.deps.save).toHaveBeenCalledWith(DOC.id, expect.objectContaining({ body: 'Đóng tab' }), true);
  });
});

describe('opening a document', () => {
  beforeEach(async () => {
    await resetDraftStore();
    await new Promise((resolve) => {
      const request = indexedDB.deleteDatabase('kb-editor');
      request.onsuccess = resolve;
      request.onerror = resolve;
    });
  });

  const draft = (patch: Partial<EditorDraft>): EditorDraft => ({ id: DOC.id, title: DOC.title, body: 'Bản trên máy', planet: 'violet', baseRev: DOC.rev, editedAt: 1, doc: DOC, ...patch });

  it('offers this browser’s newer copy, or flags it when the server moved on', async () => {
    const deps = { fetchDoc: async () => DOC, readDraft, deleteDraft };
    expect((await openForEditing(DOC.id, deps)).openedAs).toBe('clean');
    await writeDraft(draft({}));
    expect(await openForEditing(DOC.id, deps)).toMatchObject({ openedAs: 'unsaved', start: { body: 'Bản trên máy' } });
    await writeDraft(draft({ baseRev: '2026-10-19T00:00:00.000Z' }));
    expect(await openForEditing(DOC.id, deps)).toMatchObject({ openedAs: 'conflict', baseRev: '2026-10-19T00:00:00.000Z' });
    await writeDraft(draft({ body: DOC.body }));
    expect((await openForEditing(DOC.id, deps)).openedAs).toBe('clean');
    expect(await readDraft(DOC.id)).toBeNull();
  });

  it('opens from this browser’s copy when the server cannot be reached', async () => {
    const offline = { fetchDoc: () => Promise.reject(new ApiError(0, NETWORK_ERROR)), readDraft, deleteDraft };
    await expect(openForEditing(DOC.id, offline)).rejects.toMatchObject({ code: NETWORK_ERROR });
    await writeDraft(draft({}));
    expect(await openForEditing(DOC.id, offline)).toMatchObject({ openedAs: 'offline', start: { body: 'Bản trên máy' }, doc: { id: DOC.id } });
  });
});
