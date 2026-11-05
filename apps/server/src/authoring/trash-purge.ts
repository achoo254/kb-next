/**
 * What follows a purge of the trash (src/access/authoring.ts): the stored files of the deleted documents leave the
 * disk and the search indexes drop the documents. The server runs the 30-day purge once at start and then daily;
 * C08's "Xoá vĩnh viễn" and "Dọn thùng rác" finish their purge the same way.
 */
import { type PurgeResult, purgeTrash } from '../access/authoring';
import type { Db } from '../db/client';
import { safeErrorText } from '../log-error';
import type { IndexSync } from '../search/index-sync';

export const TRASH_PURGE_INTERVAL_MS = 24 * 60 * 60 * 1000;

type SearchSync = Pick<IndexSync, 'enqueue'>;

/**
 * Removes stored files by their disk names. KnowFlow keeps no uploaded file on disk yet: nothing writes the `files`
 * table until Office upload (C03, phase 10) adds the storage directory, so there is nothing to unlink and this
 * resolves at once. The purge already hands over the names, so the upload storage only has to fill this in.
 */
export function removeStoredFiles(_storageKeys: readonly string[]): Promise<void> {
  return Promise.resolve();
}

/** Unlinks the purged documents' files and drops the documents from search. */
export async function finishPurge(result: PurgeResult, sync: SearchSync | null): Promise<void> {
  await removeStoredFiles(result.storageKeys);
  if (result.documentIds.length > 0) sync?.enqueue(result.documentIds);
}

/** One run of the job: deletes what has been in the trash for 30 days or more, then finishes the purge. */
export async function runTrashPurge(db: Db, sync: SearchSync | null, now: Date): Promise<PurgeResult> {
  const result = await purgeTrash(db, now);
  await finishPurge(result, sync);
  return result;
}

export interface TrashPurgeJob {
  /** The run in progress (or the last one), for tests and shutdown. */
  readonly running: Promise<void>;
  stop(): void;
}

/**
 * Runs the purge now and then every TRASH_PURGE_INTERVAL_MS. A failed run is logged and the next one tries again;
 * the timer never keeps the process alive on its own.
 */
export function startTrashPurge(db: Db, sync: SearchSync | null, now: () => Date = () => new Date()): TrashPurgeJob {
  const run = async (): Promise<void> => {
    try {
      const { documentIds } = await runTrashPurge(db, sync, now());
      if (documentIds.length > 0) console.log(`trash purge: deleted ${documentIds.length} document(s) kept 30 days`);
    } catch (error) {
      console.error('trash purge failed', safeErrorText(error));
    }
  };
  const job = { running: run() };
  const timer = setInterval(() => {
    job.running = run();
  }, TRASH_PURGE_INTERVAL_MS);
  timer.unref();
  return {
    get running() {
      return job.running;
    },
    stop() {
      clearInterval(timer);
    },
  };
}
