/**
 * Sends the Office drafts kept in this browser (office-store.ts) to the server, as soon as there is a connection:
 * each becomes the document's next version (PUT /api/files/:id), unless someone saved on the server since the copy
 * was opened (a conflict, resolved on H04: keep mine, keep the server's, keep both).
 *
 * - Only the signed-in account's drafts are sent; signed out (or the session ended: 401), sending pauses and every
 *   draft stays as it is, to go up once that account signs in again.
 * - One sync at a time, across tabs too (Web Locks; one per tab where the browser has none): a save made while a
 *   draft is on its way is never marked as on the server (the store settles by revision).
 * - Without a connection a draft stays a draft; one the server refuses for good (too large, no right any more) is
 *   marked failed with the reason.
 *
 * Every change is announced on `window` (OFFICE_CHANGE) for the screens showing the queue.
 */
import { ApiError, NETWORK_ERROR } from '../api/api-client';
import { type ServerVersion, fetchFileBytes, saveFileVersion } from '../api/files-api';
import { uploadFile } from '../api/upload-api';
import { currentAccountId, forgetAccount } from './office-account';
import { type OfficeEntry, dropEntry, listEntries, readEntry, settleSent, updateEntry } from './office-store';

export const OFFICE_CHANGE = 'kb-office-change';
const LOCK = 'kb-office-sync';

/** Codes that mean "try again later", not "this file will never go". */
const PASSING = new Set([NETWORK_ERROR, 'rate-limited']);
const SIGNED_OUT = 'sign-in-required';

export function announce(): void {
  if (typeof window !== 'undefined') window.dispatchEvent(new Event(OFFICE_CHANGE));
}

let localTail: Promise<unknown> = Promise.resolve();

/** Runs `work` alone: across tabs with Web Locks, else after the previous work of this tab. */
function exclusive<T>(work: () => Promise<T>): Promise<T> {
  if (typeof navigator !== 'undefined' && navigator.locks && typeof navigator.locks.request === 'function') {
    return navigator.locks.request(LOCK, () => work()) as Promise<T>;
  }
  const run = localTail.then(work, work);
  localTail = run.catch(() => undefined);
  return run;
}

/** `sending`: a draft is on its way now (H04 "Đang gửi"). */
let sendingNow = 0;

export function syncing(): boolean {
  return sendingNow > 0;
}

export type SyncOutcome = 'synced' | 'conflict' | 'failed' | 'waiting' | 'paused';

/** The server's bytes of a version in conflict, when they can be had now (shown on H04 later, offline too). */
async function serverBytes(current: ServerVersion): Promise<ArrayBuffer | null> {
  if (!current.fileId) return null;
  try {
    return await fetchFileBytes(current.fileId);
  } catch {
    return null;
  }
}

/** Sends `entry`'s bytes over the server file `baseFileId` and settles the record by the revision sent. */
async function send(entry: OfficeEntry, baseFileId: string): Promise<SyncOutcome> {
  sendingNow++;
  announce();
  try {
    const outcome = await saveFileVersion(baseFileId, new Blob([entry.bytes]), entry.name);
    if (outcome.kind === 'saved') {
      const after = await settleSent(entry.userId, entry.documentId, entry.revision, { kind: 'saved', fileId: outcome.file.id });
      return after !== 'failed' && after?.state === 'synced' ? 'synced' : 'waiting';
    }
    await settleSent(entry.userId, entry.documentId, entry.revision, { kind: 'conflict', conflict: { ...outcome.current, bytes: await serverBytes(outcome.current) } });
    return 'conflict';
  } catch (error) {
    if (error instanceof ApiError && error.code === SIGNED_OUT) {
      // The session ended: nothing is marked; sending resumes once the account signs in again.
      forgetAccount();
      return 'paused';
    }
    if (!(error instanceof ApiError) || PASSING.has(error.code) || error.status >= 500) return 'waiting';
    await settleSent(entry.userId, entry.documentId, entry.revision, { kind: 'failed', error: error.code });
    return 'failed';
  } finally {
    sendingNow--;
    announce();
  }
}

/** Sends one draft of the signed-in account (or a failed one again, "Thử lại"); a conflict waits for a choice. */
export function syncEntry(documentId: string): Promise<SyncOutcome | null> {
  return exclusive(async () => {
    const userId = await currentAccountId();
    if (!userId) return 'paused';
    const entry = await readEntry(userId, documentId);
    if (!entry || entry.state === 'synced' || entry.state === 'conflict') return null;
    return send(entry, entry.fileId);
  });
}

export interface SyncReport {
  synced: number;
  conflicts: number;
  failed: number;
  waiting: number;
  /** Signed out: nothing was sent. */
  paused: boolean;
}

/** Sends every draft of the signed-in account, one at a time. */
export function syncAll(): Promise<SyncReport> {
  return exclusive(async () => {
    const report: SyncReport = { synced: 0, conflicts: 0, failed: 0, waiting: 0, paused: false };
    const userId = await currentAccountId();
    if (!userId) return { ...report, paused: true };
    for (const entry of await listEntries(userId)) {
      if (entry.state !== 'draft') continue;
      const outcome = await send(entry, entry.fileId);
      if (outcome === 'synced') report.synced++;
      else if (outcome === 'conflict') report.conflicts++;
      else if (outcome === 'failed') report.failed++;
      else {
        if (outcome === 'paused') report.paused = true;
        else report.waiting++;
        // No connection, or no session: the next drafts would fail the same way.
        break;
      }
    }
    return report;
  });
}

/** "Giữ bản này": the draft saved on top of the server's version (which stays in the history). */
export function keepMine(documentId: string): Promise<SyncOutcome | null> {
  return exclusive(async () => {
    const userId = await currentAccountId();
    if (!userId) return 'paused';
    const entry = await readEntry(userId, documentId);
    if (!entry?.conflict) return null;
    if (!entry.conflict.fileId) {
      await settleSent(userId, documentId, entry.revision, { kind: 'failed', error: 'not-editable' });
      announce();
      return 'failed';
    }
    return send(entry, entry.conflict.fileId);
  });
}

/** "Giữ bản kia": the server's version replaces the draft here, unless the draft was saved again meanwhile. */
export function keepServer(documentId: string): Promise<boolean> {
  return exclusive(async () => {
    const userId = await currentAccountId();
    const entry = userId ? await readEntry(userId, documentId) : null;
    if (!userId || !entry?.conflict?.fileId) return false;
    const bytes = entry.conflict.bytes ?? (await fetchFileBytes(entry.conflict.fileId));
    const after = await updateEntry(userId, documentId, { state: 'synced', fileId: entry.conflict.fileId, bytes, editedAt: null, error: null, conflict: null }, entry.revision);
    announce();
    return after?.state === 'synced';
  });
}

/** "lab-notes.docx" → "lab-notes (bản offline).docx", with the suffix of the reader's language. */
export function copyName(name: string, suffix: string): string {
  const dot = name.lastIndexOf('.');
  return dot > 0 ? `${name.slice(0, dot)} (${suffix})${name.slice(dot)}` : `${name} (${suffix})`;
}

/**
 * "Giữ cả hai": the draft becomes a new document of its own; here the record becomes the server's copy (when its bytes
 * were kept) or goes (the new document holds the draft). Settled right after the upload, so pressing again never
 * uploads a second copy. Resolves the new document's name.
 */
export function keepBoth(documentId: string, suffix: string): Promise<string | null> {
  return exclusive(async () => {
    const userId = await currentAccountId();
    const entry = userId ? await readEntry(userId, documentId) : null;
    if (!userId || !entry?.conflict) return null;
    const name = copyName(entry.name, suffix);
    await uploadFile(new Blob([entry.bytes]), name);
    const { fileId, bytes } = entry.conflict;
    if (fileId && bytes) await updateEntry(userId, documentId, { state: 'synced', fileId, bytes, editedAt: null, error: null, conflict: null }, entry.revision);
    else await dropEntry(userId, documentId, entry.revision);
    announce();
    return name;
  });
}

/**
 * Syncs now and whenever the connection comes back (main.tsx installs it once). Returns the uninstaller.
 */
export function installOfficeSync(): () => void {
  const run = (): void => {
    if (navigator.onLine) void syncAll().catch((error: unknown) => console.warn('office sync failed', error));
  };
  window.addEventListener('online', run);
  run();
  return () => window.removeEventListener('online', run);
}
