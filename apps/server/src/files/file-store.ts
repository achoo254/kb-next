/**
 * The files directory (FILES_DIR, /var/lib/kb/files in production): each file under a random storage key, never a
 * name a user chose. Files are written 0640: the `kb` user reads and writes them, and nginx reads them through the
 * directory's group for X-Accel-Redirect (docs/deployment-guide.md: the directory is `kb:<nginx group>` with the
 * setgid bit, so new files take that group). Nobody else reads them.
 */
import { randomBytes } from 'node:crypto';
import { mkdir, unlink } from 'node:fs/promises';
import path from 'node:path';
import { safeErrorText } from '../log-error';

/** What extraction (src/extract/) also accepts as a storage key. */
const STORAGE_KEY = /^[A-Za-z0-9_-]{8,128}$/;
/** Mode of a stored file: owner read/write, group read (nginx), nobody else. */
export const STORED_FILE_MODE = 0o640;

/** 24 random bytes, base64url: 32 characters. */
export function newStorageKey(): string {
  return randomBytes(24).toString('base64url');
}

export function isStorageKey(key: string): boolean {
  return STORAGE_KEY.test(key);
}

/** Where a key lives; throws on anything that is not a storage key (no path ever comes from a request). */
export function storedPath(filesDir: string, key: string): string {
  if (!isStorageKey(key)) throw new Error('not a storage key');
  return path.join(filesDir, key);
}

/** Creates the directory in dev and tests; in production it exists with its owner and group already. */
export async function ensureFilesDir(filesDir: string): Promise<void> {
  await mkdir(filesDir, { recursive: true, mode: 0o750 });
}

/**
 * Unlinks stored files by key: one already gone is fine, one that cannot be removed is logged (the purge goes on;
 * a file left behind has no row and no reader). Keys that are not storage keys are skipped.
 */
export async function removeStoredFiles(filesDir: string, keys: readonly string[]): Promise<void> {
  for (const key of keys) {
    if (!isStorageKey(key)) continue;
    try {
      await unlink(path.join(filesDir, key));
    } catch (error) {
      if (typeof error === 'object' && error !== null && 'code' in error && error.code === 'ENOENT') continue;
      console.error('stored file removal failed', safeErrorText(error));
    }
  }
}
