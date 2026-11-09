/**
 * Office files kept in this browser (IndexedDB `kb-office`, store `files`, one record per account and document): the
 * copy the editor opened from the server (`synced`, so it opens offline too) or the editor's saved file the server
 * does not have yet (`draft`, waiting to sync; `conflict` when someone saved on the server since; `failed` when the
 * server refused it).
 *
 * - Records belong to the account that made them (`userId`): another account signed in on the same browser never
 *   sees, opens or sends them; they stay until their own account comes back.
 * - Every change is one IndexedDB transaction that reads the record and writes it (no read here, write later), so a
 *   save in another tab or during a sync is never overwritten. Each editor save raises the record's `revision`; a
 *   sync settles the record only if it still holds the revision it sent (settleSent).
 * - The browser's real quota is respected (Jev's decision of 04/11/2026): offline use begins with
 *   `navigator.storage.persist()`; at most USABLE_SHARE of `navigator.storage.estimate()`'s quota is used, less what
 *   the editor's own cache takes (EDITOR_CACHE_BYTES, on the editor's origin, which `estimate()` here does not see);
 *   when a file does not fit, synced copies go first, least recently used first, each checked again in the
 *   transaction that deletes it; a draft is never evicted; H04 warns past NEAR_SHARE of what may be used.
 */
import type { FileKind, ServerVersion } from '../api/files-api';

export type OfficeEntryState = 'synced' | 'draft' | 'conflict' | 'failed';

export interface OfficeEntry {
  /** `<userId>|<documentId>`. */
  key: string;
  userId: string;
  documentId: string;
  /** The server's file this copy was opened from (a draft's base: the version it edits). */
  fileId: string;
  name: string;
  kind: FileKind;
  /** The file's bytes (an ArrayBuffer: it clones into IndexedDB the same in every browser). */
  bytes: ArrayBuffer;
  state: OfficeEntryState;
  /** Raised by every editor save: what a sync compares before settling the record. */
  revision: number;
  /** When the editor saved it here (ms); null for a server copy. */
  editedAt: number | null;
  /** Last opened or saved (ms): the least recently used synced copy is evicted first. */
  usedAt: number;
  /** Why the server refused it (`failed`): an API error code. */
  error: string | null;
  /** The server's version when a sync found a newer one (`conflict`), with its bytes when they could be fetched. */
  conflict: (ServerVersion & { bytes: ArrayBuffer | null }) | null;
}

/** Share of the browser's quota Knowledge Base may use. */
export const USABLE_SHARE = 0.8;
/** Share of that past which H04 warns. */
export const NEAR_SHARE = 0.9;
/** Room left for the editor's service-worker cache (docs/office-editor.md: about 100 MB). */
export const EDITOR_CACHE_BYTES = 100 * 1024 * 1024;

const DB_NAME = 'kb-office';
/** 2: records keyed by account and document (1 had no account: the feature was never released with it). */
const DB_VERSION = 2;
const STORE = 'files';

export function entryKey(userId: string, documentId: string): string {
  return `${userId}|${documentId}`;
}

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
      request = indexedDB.open(DB_NAME, DB_VERSION);
    } catch (error) {
      console.warn('office store unavailable', error);
      resolve(null);
      return;
    }
    request.onupgradeneeded = () => {
      const db = request.result;
      if (db.objectStoreNames.contains(STORE)) db.deleteObjectStore(STORE);
      db.createObjectStore(STORE, { keyPath: 'key' });
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => {
      console.warn('office store unavailable', request.error);
      resolve(null);
    };
    request.onblocked = () => resolve(null);
  });
  return opening;
}

const STATES: ReadonlySet<string> = new Set(['synced', 'draft', 'conflict', 'failed']);

/** An ArrayBuffer of any realm (what a structured clone returns may come from another one). */
function isArrayBuffer(value: unknown): value is ArrayBuffer {
  return Object.prototype.toString.call(value) === '[object ArrayBuffer]';
}

function isEntry(value: unknown): value is OfficeEntry {
  if (typeof value !== 'object' || value === null) return false;
  const entry = value as Partial<OfficeEntry>;
  return (
    typeof entry.key === 'string' &&
    typeof entry.userId === 'string' &&
    typeof entry.documentId === 'string' &&
    typeof entry.fileId === 'string' &&
    typeof entry.name === 'string' &&
    typeof entry.kind === 'string' &&
    isArrayBuffer(entry.bytes) &&
    typeof entry.state === 'string' &&
    STATES.has(entry.state) &&
    typeof entry.revision === 'number' &&
    typeof entry.usedAt === 'number'
  );
}

function readonly<T>(work: (store: IDBObjectStore) => IDBRequest<T>): Promise<{ value: T } | null> {
  return openDb().then(
    (db) =>
      new Promise<{ value: T } | null>((resolve) => {
        if (!db) {
          resolve(null);
          return;
        }
        try {
          const request = work(db.transaction(STORE, 'readonly').objectStore(STORE));
          request.onsuccess = () => resolve({ value: request.result });
          request.onerror = () => resolve(null);
        } catch (error) {
          console.warn('office store failed', error);
          resolve(null);
        }
      }),
  );
}

/** What a change makes of the record it read: a new record, its deletion, or nothing (left as it is). */
type Change = (current: OfficeEntry | null) => OfficeEntry | 'delete' | null;

/**
 * Reads `key` and applies `change` in the same readwrite transaction. Resolves the record as it stands after the
 * transaction committed (null when there is none), or `failed` when the browser refused (no store, storage full).
 */
export function mutate(key: string, change: Change): Promise<OfficeEntry | null | 'failed'> {
  return openDb().then(
    (db) =>
      new Promise<OfficeEntry | null | 'failed'>((resolve) => {
        if (!db) {
          resolve('failed');
          return;
        }
        try {
          const tx = db.transaction(STORE, 'readwrite');
          const store = tx.objectStore(STORE);
          let after: OfficeEntry | null = null;
          const read = store.get(key);
          read.onsuccess = () => {
            const current = isEntry(read.result) ? read.result : null;
            const next = change(current);
            after = next === 'delete' ? null : (next ?? current);
            if (next === 'delete') store.delete(key);
            else if (next) store.put(next);
          };
          tx.oncomplete = () => resolve(after);
          tx.onerror = () => resolve('failed');
          tx.onabort = () => resolve('failed');
        } catch (error) {
          console.warn('office store failed', error);
          resolve('failed');
        }
      }),
  );
}

export async function readEntry(userId: string, documentId: string): Promise<OfficeEntry | null> {
  const found = await readonly((store) => store.get(entryKey(userId, documentId)));
  return found && isEntry(found.value) ? found.value : null;
}

/** The account's records (another account's are never listed). */
export async function listEntries(userId: string): Promise<OfficeEntry[]> {
  const found = await readonly((store) => store.getAll());
  return found && Array.isArray(found.value) ? found.value.filter(isEntry).filter((entry) => entry.userId === userId) : [];
}

async function allEntries(): Promise<OfficeEntry[]> {
  const found = await readonly((store) => store.getAll());
  return found && Array.isArray(found.value) ? found.value.filter(isEntry) : [];
}

/** Closes and forgets the connection (tests start each case on an empty database). */
export async function resetOfficeStore(): Promise<void> {
  const db = await opening;
  db?.close();
  opening = null;
}

export interface StorageStatus {
  /** Bytes this origin uses, and what Knowledge Base may use of the quota; null when the browser does not tell. */
  usage: number | null;
  usable: number | null;
  /** Past NEAR_SHARE of what may be used: H04 warns. */
  near: boolean;
  /** Whether the browser keeps this site's storage until the user clears it. */
  persisted: boolean;
}

async function estimate(): Promise<{ usage: number; quota: number } | null> {
  if (typeof navigator === 'undefined' || typeof navigator.storage?.estimate !== 'function') return null;
  try {
    const { usage, quota } = await navigator.storage.estimate();
    return typeof usage === 'number' && typeof quota === 'number' && quota > 0 ? { usage, quota } : null;
  } catch {
    return null;
  }
}

export function usableBytes(quota: number): number {
  return Math.max(0, quota * USABLE_SHARE - EDITOR_CACHE_BYTES);
}

async function isPersisted(): Promise<boolean> {
  if (typeof navigator === 'undefined' || typeof navigator.storage?.persisted !== 'function') return false;
  try {
    return await navigator.storage.persisted();
  } catch {
    return false;
  }
}

export async function storageStatus(): Promise<StorageStatus> {
  const measured = await estimate();
  const persisted = await isPersisted();
  if (!measured) return { usage: null, usable: null, near: false, persisted };
  const usable = usableBytes(measured.quota);
  return { usage: measured.usage, usable, near: measured.usage > usable * NEAR_SHARE, persisted };
}

let persistAsked = false;

/** Asks the browser once to keep this site's storage (the start of offline use: the first copy kept here). */
export async function askPersistence(): Promise<void> {
  if (persistAsked || typeof navigator === 'undefined' || typeof navigator.storage?.persist !== 'function') return;
  persistAsked = true;
  try {
    await navigator.storage.persist();
  } catch (error) {
    console.warn('persistent storage refused', error);
  }
}

/**
 * Makes room for `bytes` more: evicts synced copies (of any account: they are only caches), least recently used
 * first, never `keep`. Each is deleted only if, in the deleting transaction, it is still the same synced copy (a draft
 * written over it meanwhile stays). Resolves whether the bytes fit (true when the browser gives no estimate).
 */
export async function makeRoom(bytes: number, keep: string | null = null): Promise<boolean> {
  const measured = await estimate();
  if (!measured) return true;
  const usable = usableBytes(measured.quota);
  let usage = measured.usage;
  if (usage + bytes <= usable) return true;
  const evictable = (await allEntries()).filter((entry) => entry.state === 'synced' && entry.key !== keep).sort((a, b) => a.usedAt - b.usedAt);
  for (const candidate of evictable) {
    let evicted = false;
    await mutate(candidate.key, (current) => {
      if (!current || current.state !== 'synced' || current.revision !== candidate.revision || current.usedAt !== candidate.usedAt) return null;
      evicted = true;
      return 'delete';
    });
    if (evicted) usage -= candidate.bytes.byteLength;
    if (usage + bytes <= usable) return true;
  }
  return usage + bytes <= usable;
}

/**
 * Drops the account's synced copies (H03 "Xoá bộ nhớ đệm"): only caches, they download again when opened. A draft,
 * a conflict or a failed save is never dropped (each is checked again in the deleting transaction). How many went.
 */
export async function clearSyncedCopies(userId: string): Promise<number> {
  let cleared = 0;
  for (const candidate of (await listEntries(userId)).filter((entry) => entry.state === 'synced')) {
    let dropped = false;
    await mutate(candidate.key, (current) => {
      if (!current || current.state !== 'synced') return null;
      dropped = true;
      return 'delete';
    });
    if (dropped) cleared += 1;
  }
  return cleared;
}

/** Drops every record of the account, drafts included: its data was deleted on the server (H03). */
export async function forgetAccountFiles(userId: string): Promise<void> {
  for (const entry of await listEntries(userId)) await mutate(entry.key, () => 'delete');
}

export interface ServerCopy {
  userId: string;
  documentId: string;
  fileId: string;
  name: string;
  kind: FileKind;
  bytes: ArrayBuffer;
}

/**
 * Keeps the server's copy the editor opened, so it opens offline later; never over a draft (checked in the writing
 * transaction: the draft is newer work). Skipped when it does not fit. Resolves whether it was kept.
 */
export async function keepServerCopy(copy: ServerCopy, now: number = Date.now()): Promise<boolean> {
  const key = entryKey(copy.userId, copy.documentId);
  await askPersistence();
  if (!(await makeRoom(copy.bytes.byteLength, key))) return false;
  let kept = false;
  const result = await mutate(key, (current) => {
    if (current && current.state !== 'synced') return null;
    kept = true;
    return { ...copy, key, state: 'synced', revision: current?.revision ?? 0, editedAt: null, usedAt: now, error: null, conflict: null };
  });
  return kept && result !== 'failed';
}

/**
 * Keeps the editor's saved file as a draft of the document (it never leaves before the server has it), one revision
 * up. A draft keeps the base it was opened from; one in conflict stays in conflict (with the new bytes) until the user
 * chooses; a failed one becomes a draft again. Resolves `stored`, or `full` when the browser has no room even after
 * evicting every synced copy.
 */
export async function keepDraft(copy: ServerCopy, now: number = Date.now()): Promise<'stored' | 'full'> {
  const key = entryKey(copy.userId, copy.documentId);
  await askPersistence();
  const current = await readEntry(copy.userId, copy.documentId);
  await makeRoom(copy.bytes.byteLength - (current?.bytes.byteLength ?? 0), key);
  // Written even past the soft limit: losing the user's work is worse than passing 80%; only the browser refuses.
  const result = await mutate(key, (existing) => {
    const unsent = existing && existing.state !== 'synced';
    return {
      ...copy,
      key,
      fileId: unsent ? existing.fileId : copy.fileId,
      state: existing?.state === 'conflict' ? 'conflict' : 'draft',
      revision: (existing?.revision ?? 0) + 1,
      editedAt: now,
      usedAt: now,
      error: null,
      conflict: existing?.state === 'conflict' ? existing.conflict : null,
    };
  });
  return result === 'failed' ? 'full' : 'stored';
}

/** What the server made of a draft that was sent. */
export type SentOutcome = { kind: 'saved'; fileId: string } | { kind: 'conflict'; conflict: NonNullable<OfficeEntry['conflict']> } | { kind: 'failed'; error: string };

/**
 * Settles a draft after a sync sent revision `sent` of it. Still that revision: synced under its new file, in
 * conflict, or failed. Saved again since: it stays a draft (now based on the file the server just made, when it
 * saved), so the newer edits go up on the next run and are never marked as on the server.
 */
export async function settleSent(userId: string, documentId: string, sent: number, outcome: SentOutcome): Promise<OfficeEntry | null | 'failed'> {
  return mutate(entryKey(userId, documentId), (current) => {
    if (!current || current.state === 'synced') return null;
    if (current.revision !== sent) return outcome.kind === 'saved' ? { ...current, fileId: outcome.fileId } : null;
    if (outcome.kind === 'saved') return { ...current, state: 'synced', fileId: outcome.fileId, editedAt: null, error: null, conflict: null };
    if (outcome.kind === 'conflict') return { ...current, state: 'conflict', error: null, conflict: outcome.conflict };
    return { ...current, state: 'failed', error: outcome.error };
  });
}

/** Merges `change` into the record in one transaction (only when it exists, and still at `revision` when given). */
export async function updateEntry(userId: string, documentId: string, change: Partial<Omit<OfficeEntry, 'key' | 'userId' | 'documentId'>>, revision?: number): Promise<OfficeEntry | null> {
  const result = await mutate(entryKey(userId, documentId), (current) => (!current || (revision !== undefined && current.revision !== revision) ? null : { ...current, ...change }));
  return result === 'failed' ? null : result;
}

/** Drops the record when still at `revision` (the draft became a document of its own). */
export async function dropEntry(userId: string, documentId: string, revision: number): Promise<void> {
  await mutate(entryKey(userId, documentId), (current) => (current && current.revision === revision ? 'delete' : null));
}

/** Marks an entry as just used (it moves to the back of the eviction line). */
export async function touchEntry(userId: string, documentId: string, now: number = Date.now()): Promise<void> {
  await mutate(entryKey(userId, documentId), (current) => (current ? { ...current, usedAt: now } : null));
}

/** Entries the server does not have yet (H04's queue). */
export function pending(entries: readonly OfficeEntry[]): OfficeEntry[] {
  return entries.filter((entry) => entry.state !== 'synced').sort((a, b) => (b.editedAt ?? 0) - (a.editedAt ?? 0));
}

/** Kinds the editor has opened online in this browser: its own cache then holds what they need offline. */
const WARM_KEY = 'kb-office-warm';

/** The kinds the Office editor opens. */
export type EditorKind = 'docx' | 'xlsx' | 'pptx';

export function isEditorKind(kind: unknown): kind is EditorKind {
  return kind === 'docx' || kind === 'xlsx' || kind === 'pptx';
}

export function warmKinds(): EditorKind[] {
  try {
    const value: unknown = JSON.parse(localStorage.getItem(WARM_KEY) ?? '[]');
    return Array.isArray(value) ? value.filter(isEditorKind) : [];
  } catch {
    return [];
  }
}

export function markWarm(kind: EditorKind): void {
  const kinds = new Set(warmKinds());
  if (kinds.has(kind)) return;
  kinds.add(kind);
  try {
    localStorage.setItem(WARM_KEY, JSON.stringify([...kinds]));
  } catch {
    // Storage blocked: the note on H04 just stays general.
  }
}
