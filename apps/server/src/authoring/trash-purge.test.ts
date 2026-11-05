/**
 * The daily trash purge: a document 30 days or more in the trash is deleted for good with its stored files (rows and
 * bytes on disk), the search sync drops it, a younger one stays; the job runs at start, survives a failing run, and
 * stops.
 */
import { access, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { eq } from 'drizzle-orm';
import { TRASH_DAYS } from '../access/authoring';
import { type DbHandle, openPglite } from '../db/client';
import { documents, files } from '../db/schema';
import { seedDatabase, seedId } from '../db/seed-database';
import { SEED_LATEST_UPDATE } from '../db/seed-data';
import { finishPurge, runTrashPurge, startTrashPurge } from './trash-purge';

const DAY = 24 * 60 * 60 * 1000;
let database: DbHandle;
let ownerId = '';
let filesDir = '';

/** A fake search sync recording what it was asked to drop. */
function fakeSync(): { enqueue(ids: Iterable<string>): void; queued: string[] } {
  const queued: string[] = [];
  return { queued, enqueue: (ids) => queued.push(...ids) };
}

async function trash(key: string, at: Date): Promise<string> {
  const id = seedId(`document:${key}`);
  await database.db.update(documents).set({ deletedAt: at, deletedBy: ownerId }).where(eq(documents.id, id));
  return id;
}

beforeAll(async () => {
  database = await openPglite();
  filesDir = await mkdtemp(path.join(tmpdir(), 'kb-purge-'));
  ({ ownerId } = await seedDatabase(database.db, 'owner-sub'));
});

afterAll(async () => {
  await database?.close();
  if (filesDir) await rm(filesDir, { recursive: true, force: true });
});

describe('runTrashPurge', () => {
  it('runs without search, and leaves the seed’s own trash (27 and 3 days old) alone on the boards’ day', async () => {
    const result = await runTrashPurge(database.db, null, filesDir, SEED_LATEST_UPDATE);
    expect(result.documentIds).not.toContain(seedId('document:boot-notes'));
    expect(result.documentIds).not.toContain(seedId('document:arp-old'));
  });

  it('deletes what has been in the trash 30 days with its files on disk, keeps what has not, and drops it from search', async () => {
    const now = new Date('2026-12-20T00:00:00Z');
    const old = await trash('lab-notes', new Date(now.getTime() - (TRASH_DAYS + 1) * DAY));
    const young = await trash('subnet-xlsx', new Date(now.getTime() - (TRASH_DAYS - 1) * DAY));
    await database.db.insert(files).values({ storageKey: 'ab12-lab-notes', originalName: 'lab-notes.docx', mime: 'application/octet-stream', size: 10, sha256: 'x', ownerId, documentId: old });
    await writeFile(path.join(filesDir, 'ab12-lab-notes'), 'old bytes');
    // Another file stays: the purge removes only the purged documents' keys.
    await writeFile(path.join(filesDir, 'cd34-keep-this'), 'other bytes');
    const sync = fakeSync();

    const result = await runTrashPurge(database.db, sync, filesDir, now);

    expect(result.documentIds).toContain(old);
    expect(result.documentIds).not.toContain(young);
    expect(result.storageKeys).toEqual(['ab12-lab-notes']);
    expect(sync.queued).toEqual(result.documentIds);
    expect(await database.db.select().from(documents).where(eq(documents.id, old))).toEqual([]);
    expect(await database.db.select().from(files).where(eq(files.storageKey, 'ab12-lab-notes'))).toEqual([]);
    expect(await database.db.select({ id: documents.id }).from(documents).where(eq(documents.id, young))).toHaveLength(1);
    await expect(access(path.join(filesDir, 'ab12-lab-notes'))).rejects.toThrow();
    await expect(access(path.join(filesDir, 'cd34-keep-this'))).resolves.toBeUndefined();
  });

  it('takes a file already gone from disk in its stride, and never follows a key that is not a storage key', async () => {
    await writeFile(path.join(tmpdir(), 'kb-purge-outside'), 'outside');
    await finishPurge({ documentIds: [], storageKeys: ['zz99-never-written', '../kb-purge-outside'] }, null, filesDir);
    await expect(access(path.join(tmpdir(), 'kb-purge-outside'))).resolves.toBeUndefined();
    await rm(path.join(tmpdir(), 'kb-purge-outside'));
  });

  it('asks the sync for nothing when nothing was purged', async () => {
    const sync = fakeSync();
    await finishPurge({ documentIds: [], storageKeys: [] }, sync, filesDir);
    expect(sync.queued).toEqual([]);
  });
});

describe('startTrashPurge', () => {
  it('purges at once, keeps the server up when a run fails, and stops its timer', async () => {
    const now = new Date('2027-03-01T00:00:00Z');
    const old = await trash('k8s-intro', new Date(now.getTime() - (TRASH_DAYS + 2) * DAY));
    const sync = fakeSync();
    const job = startTrashPurge(database.db, sync, filesDir, () => now);
    await job.running;
    expect(sync.queued).toContain(old);
    job.stop();

    const failing = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const broken = startTrashPurge(database.db, null, filesDir, () => new Date(Number.NaN));
    await broken.running;
    broken.stop();
    expect(failing).toHaveBeenCalledWith('trash purge failed', expect.any(String));
    failing.mockRestore();
  });
});
