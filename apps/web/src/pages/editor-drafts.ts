/**
 * The editor's copy of a document in this browser (IndexedDB `kb-editor`, store `drafts`, one record per document):
 * every edit lands here before the server has it, so closing the tab, a crash or going offline loses nothing; the
 * record goes once the server has the same text. It also keeps what the editor needs to open the document while
 * offline. Without IndexedDB (a private window that blocks it) the editor still saves to the server.
 */
import type { EditableDocument, Planet } from '../api/authoring-api';
import { currentAccountId } from './office-account';

export interface EditorDraft {
  id: string;
  title: string;
  body: string;
  planet: Planet | null;
  /** The server's `rev` this copy was edited from. */
  baseRev: string;
  /** When it was last edited here (ms). */
  editedAt: number;
  /** The document as last opened, to show the editor offline. */
  doc: EditableDocument;
  /** The account that wrote it (H04 lists only the signed-in account's); absent on copies written before. */
  userId?: string;
}

const DB_NAME = 'kb-editor';
const STORE = 'drafts';

let opening: Promise<IDBDatabase | null> | null = null;

function openDb(): Promise<IDBDatabase | null> {
  if (opening) return opening;
  opening = new Promise((resolve) => {
    if (typeof indexedDB === 'undefined') {
      resolve(null);
      return;
    }
    let request: IDBOpenDBRequest;
    try {
      request = indexedDB.open(DB_NAME, 1);
    } catch (error) {
      console.warn('editor drafts unavailable', error);
      resolve(null);
      return;
    }
    request.onupgradeneeded = () => {
      if (!request.result.objectStoreNames.contains(STORE)) request.result.createObjectStore(STORE, { keyPath: 'id' });
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => {
      console.warn('editor drafts unavailable', request.error);
      resolve(null);
    };
    request.onblocked = () => resolve(null);
  });
  return opening;
}

function isDraft(value: unknown, id: string): value is EditorDraft {
  if (typeof value !== 'object' || value === null) return false;
  const draft = value as Partial<EditorDraft>;
  return draft.id === id && typeof draft.title === 'string' && typeof draft.body === 'string' && typeof draft.baseRev === 'string' && typeof draft.editedAt === 'number' && typeof draft.doc === 'object' && draft.doc !== null;
}

function run<T>(mode: IDBTransactionMode, work: (store: IDBObjectStore) => IDBRequest<T>): Promise<T | null> {
  return openDb().then(
    (db) =>
      new Promise<T | null>((resolve) => {
        if (!db) {
          resolve(null);
          return;
        }
        try {
          const request = work(db.transaction(STORE, mode).objectStore(STORE));
          request.onsuccess = () => resolve(request.result);
          request.onerror = () => {
            console.warn('editor draft storage failed', request.error);
            resolve(null);
          };
        } catch (error) {
          console.warn('editor draft storage failed', error);
          resolve(null);
        }
      }),
  );
}

/** The copy kept for `id`, when there is one this code wrote. */
export async function readDraft(id: string): Promise<EditorDraft | null> {
  const value: unknown = await run('readonly', (store) => store.get(id));
  return isDraft(value, id) ? value : null;
}

/** Keeps the copy; resolves false when the browser could not (no IndexedDB, storage full). */
export async function writeDraft(draft: EditorDraft): Promise<boolean> {
  const userId = draft.userId ?? (await currentAccountId()) ?? undefined;
  return (await run('readwrite', (store) => store.put(userId ? { ...draft, userId } : draft))) !== null;
}

/** The copies `userId` wrote in this browser (H04 lists those not on the server yet); never another account's. */
export async function listDrafts(userId: string): Promise<EditorDraft[]> {
  const values: unknown = await run('readonly', (store) => store.getAll());
  const drafts = Array.isArray(values) ? values.filter((value: unknown): value is EditorDraft => typeof value === 'object' && value !== null && 'id' in value && typeof value.id === 'string' && isDraft(value, value.id)) : [];
  return drafts.filter((draft) => draft.userId === userId);
}

export async function deleteDraft(id: string): Promise<void> {
  await run('readwrite', (store) => store.delete(id));
}

/** Closes and forgets the open connection (tests start each case on an empty database). */
export async function resetDraftStore(): Promise<void> {
  const db = await opening;
  db?.close();
  opening = null;
}
