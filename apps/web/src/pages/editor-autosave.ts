/**
 * Autosave of the editor (C02, board Interaction: "Tự lưu sau 800ms ngừng gõ", ⌘S saves at once). Every edit is
 * copied into this browser (IndexedDB, editor-drafts.ts) within a moment, and sent to the server 800 ms after typing
 * pauses, with the `rev` the text started from. The states of the board's save chip:
 * - `typing`: edited since the last save, waiting for the pause ("Đang gõ…");
 * - `saving`: on its way ("Đang lưu…");
 * - `saved`: the server has this text ("Đã lưu 21:24");
 * - `offline`: no connection; the text waits in this browser and goes as soon as the connection is back
 *   ("Offline · lưu trên máy");
 * - `failed`: the server refused or failed ("Lỗi lưu" + "Thử lại");
 * - `conflict`: someone saved this document elsewhere since this copy started (another tab or device): nothing is
 *   overwritten until the writer chooses to keep this copy or load the server's.
 * Leaving the page sends what is pending with a request that outlives it; a copy the server never got is offered
 * again the next time the document opens.
 */
import { useEffect, useState } from 'react';
import { ApiError, NETWORK_ERROR } from '../api/api-client';
import { type EditableDocument, type Planet, type SaveRequest, type SaveResult, fetchEditable, saveDocument } from '../api/authoring-api';
import { type EditorDraft, deleteDraft, readDraft, writeDraft } from './editor-drafts';

export const SAVE_DELAY_MS = 800;
/** The browser copy is written this long after an edit (and at once on leaving). */
export const DRAFT_DELAY_MS = 250;
/** The browser says it is online but the server did not answer: try again after this long. */
export const RETRY_MS = 15_000;

export type SaveStatus = 'saved' | 'typing' | 'saving' | 'offline' | 'failed' | 'conflict';

export interface Snapshot {
  title: string;
  body: string;
  planet: Planet | null;
}

export interface AutosaveState {
  status: SaveStatus;
  /** When the server last saved this text (ISO). */
  savedAt: string;
  version: number;
}

export interface AutosaveDeps {
  save(id: string, request: SaveRequest, keepalive?: boolean): Promise<SaveResult>;
  fetchDoc(id: string): Promise<EditableDocument>;
  writeDraft(draft: EditorDraft): Promise<boolean>;
  deleteDraft(id: string): Promise<void>;
  online(): boolean;
}

const LIVE_DEPS: AutosaveDeps = {
  save: saveDocument,
  fetchDoc: fetchEditable,
  writeDraft,
  deleteDraft,
  online: () => typeof navigator === 'undefined' || navigator.onLine,
};

function sameText(a: Snapshot, b: Snapshot): boolean {
  return a.title === b.title && a.body === b.body && a.planet === b.planet;
}

/** The chip of a document as it opens: saved, or the state of the copy this browser opened instead. */
export function initialAutosaveState(doc: EditableDocument, opened: OpenedAs): AutosaveState {
  const status: SaveStatus = opened === 'clean' ? 'saved' : opened === 'unsaved' ? 'typing' : opened;
  return { status, savedAt: doc.savedAt, version: doc.version };
}

/** The autosave of one open document; the screen calls `edited` on every change and renders `state`. */
export class DocumentAutosave {
  private rev: string;
  private read: () => Snapshot;
  /** Edits made so far, and how many of them the server has. */
  private edits = 0;
  private savedEdits = 0;
  private inFlight = false;
  private saveTimer: ReturnType<typeof setTimeout> | null = null;
  private draftTimer: ReturnType<typeof setTimeout> | null = null;
  private disposed = false;
  /** AI suggestions accepted into the text so far, and how many of them the server has in a saved version. */
  private aiAccepts = 0;
  private savedAiAccepts = 0;
  state: AutosaveState;

  constructor(
    private readonly doc: EditableDocument,
    start: Snapshot,
    private readonly onChange: (state: AutosaveState) => void,
    /** `unsaved`: the copy opened is newer than the server's (restored from this browser); `conflict`: it started from an older rev. */
    opened: 'clean' | 'unsaved' | 'conflict' | 'offline' = 'clean',
    baseRev: string = doc.rev,
    private readonly deps: AutosaveDeps = LIVE_DEPS,
    /** The opened copy holds an accepted AI suggestion the server has not saved yet. */
    aiMade = false,
  ) {
    this.rev = baseRev;
    if (aiMade) this.aiAccepts = 1;
    this.read = () => start;
    this.state = initialAutosaveState(doc, opened);
    if (opened !== 'clean') this.edits = 1;
    this.opened = opened;
  }

  private readonly opened: 'clean' | 'unsaved' | 'conflict' | 'offline';

  /** Starts what the opened copy needs: a newer copy from this browser is sent at once; an offline one is tried soon. */
  begin(): void {
    if (this.opened === 'unsaved') this.schedule(0);
    // Opened from this browser's copy because the server did not answer: try it once things settle.
    if (this.opened === 'offline') this.schedule(SAVE_DELAY_MS);
  }

  private set(patch: Partial<AutosaveState>): void {
    if (this.disposed) return;
    this.state = { ...this.state, ...patch };
    this.onChange(this.state);
  }

  private schedule(delay: number): void {
    if (this.saveTimer !== null) clearTimeout(this.saveTimer);
    this.saveTimer = setTimeout(() => {
      this.saveTimer = null;
      void this.save();
    }, delay);
  }

  private draftOf(snapshot: Snapshot): EditorDraft {
    return { id: this.doc.id, ...snapshot, baseRev: this.rev, editedAt: Date.now(), doc: this.doc, aiMade: this.aiPending };
  }

  /** The text holds an accepted AI suggestion no saved version has yet. */
  private get aiPending(): boolean {
    return this.aiAccepts > this.savedAiAccepts;
  }

  /**
   * An AI suggestion was just accepted into the text (after its edit): the next save that carries it tells the server,
   * which marks the version it writes AI-made. Once a save carrying it succeeds, later saves no longer say so.
   */
  aiAccepted(): void {
    if (this.disposed) return;
    this.aiAccepts += 1;
    this.keepDraft();
  }

  /** The request of one save: the text, the rev it started from, and whether it carries accepted AI text. */
  private request(snapshot: Snapshot): SaveRequest {
    return { ...snapshot, baseRev: this.rev, ...(this.aiPending ? { aiMade: true } : {}) };
  }

  private keepDraft(): void {
    if (this.draftTimer !== null) clearTimeout(this.draftTimer);
    this.draftTimer = null;
    void this.deps.writeDraft(this.draftOf(this.read()));
  }

  /** A change in the editor; `read` gives its text when it is needed (serializing on every key would be wasteful). */
  edited(read: () => Snapshot): void {
    if (this.disposed) return;
    this.read = read;
    this.edits += 1;
    if (this.draftTimer !== null) clearTimeout(this.draftTimer);
    this.draftTimer = setTimeout(() => this.keepDraft(), DRAFT_DELAY_MS);
    if (this.state.status === 'conflict') return;
    if (!this.deps.online()) {
      this.set({ status: 'offline' });
      return;
    }
    if (this.state.status !== 'saving') this.set({ status: 'typing' });
    this.schedule(SAVE_DELAY_MS);
  }

  get dirty(): boolean {
    return this.edits !== this.savedEdits;
  }

  /** Sends the text now (the pause ended, ⌘S, "Thử lại", back online). */
  async save(): Promise<void> {
    if (this.saveTimer !== null) clearTimeout(this.saveTimer);
    this.saveTimer = null;
    if (this.disposed || this.inFlight || !this.dirty || this.state.status === 'conflict') return;
    if (!this.deps.online()) {
      this.keepDraft();
      this.set({ status: 'offline' });
      return;
    }
    this.inFlight = true;
    const edits = this.edits;
    const aiAccepts = this.aiAccepts;
    const snapshot = this.read();
    this.set({ status: 'saving' });
    try {
      const saved = await this.deps.save(this.doc.id, this.request(snapshot));
      this.rev = saved.rev;
      this.savedEdits = edits;
      this.savedAiAccepts = aiAccepts;
      this.set({ savedAt: saved.savedAt, version: saved.version, status: this.dirty ? 'typing' : 'saved' });
      if (this.dirty) this.schedule(SAVE_DELAY_MS);
      else {
        if (this.draftTimer !== null) clearTimeout(this.draftTimer);
        this.draftTimer = null;
        await this.deps.deleteDraft(this.doc.id);
      }
    } catch (error) {
      this.keepDraft();
      if (error instanceof ApiError && error.code === 'stale') this.set({ status: 'conflict' });
      else if (error instanceof ApiError && error.code === NETWORK_ERROR) {
        this.set({ status: 'offline' });
        // No `online` event will come when the browser never noticed the loss (the server or the way to it is down).
        if (this.deps.online()) this.schedule(RETRY_MS);
      } else {
        if (!(error instanceof ApiError)) console.error('document save failed', error);
        this.set({ status: 'failed' });
      }
    } finally {
      this.inFlight = false;
    }
  }

  /** Back online: what waited goes now. */
  reconnected(): void {
    if (this.state.status === 'offline' || (this.dirty && this.state.status !== 'conflict')) {
      this.set({ status: 'typing' });
      void this.save();
    }
  }

  /** Conflict: keep this copy, over what the server has now. */
  async overwrite(): Promise<void> {
    try {
      const current = await this.deps.fetchDoc(this.doc.id);
      this.rev = current.rev;
      this.set({ status: 'typing' });
      await this.save();
    } catch (error) {
      if (!(error instanceof ApiError)) console.error('document reload failed', error);
      this.set({ status: error instanceof ApiError && error.code === NETWORK_ERROR ? 'offline' : 'failed' });
    }
  }

  /** Conflict: drop this copy (the screen then opens the server's text). */
  async discard(): Promise<void> {
    this.disposed = true;
    if (this.saveTimer !== null) clearTimeout(this.saveTimer);
    if (this.draftTimer !== null) clearTimeout(this.draftTimer);
    await this.deps.deleteDraft(this.doc.id);
  }

  /**
   * Leaving the page (or its tab going to the back): keep the copy and send what is pending with a request that
   * outlives the page. One request at a time, as for every save: while one is on its way it carries on (the copy in
   * this browser covers the rest), so two saves from the same rev never race into a false "changed elsewhere".
   */
  leave(): void {
    if (this.disposed || !this.dirty) return;
    this.keepDraft();
    if (this.inFlight || this.state.status === 'conflict' || !this.deps.online()) return;
    if (this.saveTimer !== null) clearTimeout(this.saveTimer);
    this.saveTimer = null;
    this.inFlight = true;
    const edits = this.edits;
    const aiAccepts = this.aiAccepts;
    this.deps
      .save(this.doc.id, this.request(this.read()), true)
      .then(
        (saved) => {
          this.rev = saved.rev;
          this.savedEdits = edits;
          this.savedAiAccepts = aiAccepts;
          this.set({ savedAt: saved.savedAt, version: saved.version, status: this.dirty ? 'typing' : 'saved' });
          if (!this.dirty) void this.deps.deleteDraft(this.doc.id);
        },
        // The browser copy stays: it is offered again when the document opens, or sent by the next save.
        () => undefined,
      )
      .finally(() => {
        this.inFlight = false;
        if (this.dirty && !this.disposed && this.state.status !== 'conflict') this.schedule(SAVE_DELAY_MS);
      });
  }

  dispose(): void {
    this.leave();
    this.disposed = true;
    if (this.saveTimer !== null) clearTimeout(this.saveTimer);
    if (this.draftTimer !== null) clearTimeout(this.draftTimer);
  }
}

export type OpenedAs = 'clean' | 'unsaved' | 'conflict' | 'offline';

export interface OpenedDocument {
  doc: EditableDocument;
  start: Snapshot;
  openedAs: OpenedAs;
  /** The rev the start text was edited from. */
  baseRev: string;
  /** The opened copy holds an accepted AI suggestion the server has not saved yet (a browser copy). */
  aiMade: boolean;
}

/**
 * Opens a document for editing: the server's text, or this browser's newer copy (`unsaved`: it started from the
 * server's current rev; `conflict`: the server changed since; `offline`: the server cannot be reached).
 */
export async function openForEditing(id: string, deps: { fetchDoc(id: string): Promise<EditableDocument>; readDraft(id: string): Promise<EditorDraft | null>; deleteDraft(id: string): Promise<void> } = { fetchDoc: fetchEditable, readDraft, deleteDraft }): Promise<OpenedDocument> {
  let doc: EditableDocument;
  try {
    doc = await deps.fetchDoc(id);
  } catch (error) {
    const draft = error instanceof ApiError && error.code === NETWORK_ERROR ? await deps.readDraft(id) : null;
    if (!draft) throw error;
    return { doc: draft.doc, start: { title: draft.title, body: draft.body, planet: draft.planet }, openedAs: 'offline', baseRev: draft.baseRev, aiMade: draft.aiMade === true };
  }
  const server: Snapshot = { title: doc.title, body: doc.body, planet: doc.planet };
  const draft = await deps.readDraft(id);
  if (!draft) return { doc, start: server, openedAs: 'clean', baseRev: doc.rev, aiMade: false };
  const copy: Snapshot = { title: draft.title, body: draft.body, planet: draft.planet };
  if (sameText(copy, server)) {
    await deps.deleteDraft(id);
    return { doc, start: server, openedAs: 'clean', baseRev: doc.rev, aiMade: false };
  }
  return { doc, start: copy, openedAs: draft.baseRev === doc.rev ? 'unsaved' : 'conflict', baseRev: draft.baseRev, aiMade: draft.aiMade === true };
}

/** The autosave of the open document as React state; saves pending work on leaving and when the connection returns. */
export function useDocumentAutosave(opened: OpenedDocument): { state: AutosaveState; autosave: DocumentAutosave } {
  const [state, setState] = useState<AutosaveState>(() => initialAutosaveState(opened.doc, opened.openedAs));
  // One autosave per opened document (the screen remounts for another one); it starts nothing until the effect runs.
  const [autosave] = useState(() => new DocumentAutosave(opened.doc, opened.start, setState, opened.openedAs, opened.baseRev, LIVE_DEPS, opened.aiMade));

  useEffect(() => {
    autosave.begin();
    const onOnline = (): void => autosave.reconnected();
    const onOffline = (): void => {
      if (autosave.dirty) void autosave.save();
    };
    const onHidden = (): void => {
      if (document.visibilityState === 'hidden') autosave.leave();
    };
    const onLeave = (): void => autosave.leave();
    window.addEventListener('online', onOnline);
    window.addEventListener('offline', onOffline);
    window.addEventListener('pagehide', onLeave);
    document.addEventListener('visibilitychange', onHidden);
    return () => {
      window.removeEventListener('online', onOnline);
      window.removeEventListener('offline', onOffline);
      window.removeEventListener('pagehide', onLeave);
      document.removeEventListener('visibilitychange', onHidden);
      autosave.leave();
    };
  }, [autosave]);

  return { state, autosave };
}
