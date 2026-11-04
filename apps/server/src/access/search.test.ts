/**
 * Search against a real Meilisearch (test/meili.ts): diacritics, who sees what, sync after changes, rebuild.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createDocument, createLink, createSpace, createUser, updateDocument } from '../../test/content-fixtures';
import { MEILI_SETUP_TIMEOUT_MS, type TestMeili, startTestMeili } from '../../test/meili';
import { type DbHandle, openPglite } from '../db/client';
import { IndexSync, checkDrift, ensureIndexes } from '../search/index-sync';
import { MeiliClient, MeiliError } from '../search/meili-client';
import { rebuildIndexes } from '../search/rebuild-indexes';
import { PRIVATE_INDEX, PUBLIC_INDEX } from '../search/search-indexes';
import { findDocument, listChunks, listDocuments, listLinks, listSpaces } from './content';
import { searchChunks } from './search';
import { GUEST, type Viewer, viewerFor } from './viewer';

const ADMIN_SUB = 'admin:search';

let database: DbHandle;
let meili: TestMeili;
let sync: IndexSync;
const logs: string[] = [];
let alice: Viewer;
let bob: Viewer;
let admin: Viewer;
let aliceId: string;
let bobId: string;

beforeAll(async () => {
  database = await openPglite();
  meili = await startTestMeili();
  await ensureIndexes(meili.client);
  sync = new IndexSync(database.db, meili.client, { retryDelaysMs: [20, 20], log: (m) => logs.push(m) });
  aliceId = await createUser(database.db);
  bobId = await createUser(database.db);
  const adminId = await createUser(database.db, ADMIN_SUB);
  const admins = new Set([ADMIN_SUB]);
  alice = await viewerFor(database.db, admins, aliceId);
  bob = await viewerFor(database.db, admins, bobId);
  admin = await viewerFor(database.db, admins, adminId);
}, MEILI_SETUP_TIMEOUT_MS);

afterAll(async () => {
  sync?.close();
  await meili?.close();
  await database?.close();
});

async function titles(viewer: Viewer, query: string, spaceId?: string): Promise<string[]> {
  const hits = await searchChunks(database.db, meili.client, viewer, query, { spaceId });
  return [...new Set(hits.map((h) => h.title))].sort();
}

describe('diacritics', () => {
  let spaceId: string;
  beforeAll(async () => {
    spaceId = await createSpace(database.db);
    const docs = [
      ['Mạng máy tính', 'Mạng máy tính nối nhiều máy tính với nhau.'],
      ['Mang theo laptop', 'Nhớ mang theo laptop khi đi học.'],
      ['Màng lọc nước', 'Màng lọc giữ lại cặn bẩn trong nước.'],
      ['Đường dây điện', 'Đường dây điện cao thế chạy qua cánh đồng.'],
    ];
    const ids = [];
    for (const [title, text] of docs) ids.push(await createDocument(database.db, { spaceId, authorId: aliceId, title, texts: [text ?? ''] }));
    sync.enqueue(ids);
    await sync.idle();
  });

  it('"mạng" finds only the text that has "mạng"', async () => {
    expect(await titles(GUEST, 'mạng', spaceId)).toEqual(['Mạng máy tính']);
  });

  it('"mang" finds every variant', async () => {
    expect(await titles(GUEST, 'mang', spaceId)).toEqual(['Mang theo laptop', 'Màng lọc nước', 'Mạng máy tính']);
  });

  it('"màng" and "đường" find only their own word', async () => {
    expect(await titles(GUEST, 'màng', spaceId)).toEqual(['Màng lọc nước']);
    expect(await titles(GUEST, 'đường', spaceId)).toEqual(['Đường dây điện']);
    expect(await titles(GUEST, 'duong', spaceId)).toEqual(['Đường dây điện']);
  });

  it('keeps typo tolerance for queries without diacritics only', async () => {
    expect(await titles(GUEST, 'lapotp', spaceId)).toEqual(['Mang theo laptop']);
    expect(await titles(GUEST, 'mạnh', spaceId)).toEqual([]);
  });
});

describe("another account's pending document", () => {
  let spaceId: string;
  let pendingId: string;
  let bobDocId: string;
  beforeAll(async () => {
    spaceId = await createSpace(database.db);
    pendingId = await createDocument(database.db, {
      spaceId,
      authorId: aliceId,
      status: 'pending',
      title: 'Kế hoạch quokkapending',
      texts: ['Kế hoạch bí mật quokkapending của Alice'],
    });
    bobDocId = await createDocument(database.db, { spaceId, authorId: bobId, title: 'Bài của Bob', texts: ['Bob viết về quokkapending'] });
    await createLink(database.db, bobDocId, pendingId);
    sync.enqueue([pendingId, bobDocId]);
    await sync.idle();
  });

  it('is found by its author and an admin, never by another account or a guest', async () => {
    expect(await titles(alice, 'quokkapending', spaceId)).toEqual(['Bài của Bob', 'Kế hoạch quokkapending']);
    expect(await titles(admin, 'quokkapending', spaceId)).toEqual(['Bài của Bob', 'Kế hoạch quokkapending']);
    expect(await titles(bob, 'quokkapending', spaceId)).toEqual(['Bài của Bob']);
    expect(await titles(GUEST, 'quokkapending', spaceId)).toEqual(['Bài của Bob']);
    expect(await titles(bob, 'bí mật', spaceId)).toEqual([]);
    expect(await titles(bob, 'bi mat', spaceId)).toEqual([]);
  });

  it('is not reachable through any other read path for that account', async () => {
    const db = database.db;
    expect(await findDocument(db, bob, pendingId)).toBeNull();
    expect(await listChunks(db, bob, pendingId)).toBeNull();
    expect(await listLinks(db, bob, pendingId)).toBeNull();
    expect(await listLinks(db, bob, bobDocId)).toEqual([]);
    expect((await listDocuments(db, bob, { spaceId })).map((d) => d.id)).toEqual([bobDocId]);
    expect((await listSpaces(db, bob)).find((s) => s.id === spaceId)?.documentCount).toBe(1);
  });

  it('follows status changes, and a lagging index never leaks', async () => {
    await updateDocument(database.db, pendingId, { status: 'approved' });
    sync.enqueue([pendingId]);
    await sync.idle();
    expect(await titles(bob, 'quokkapending', spaceId)).toContain('Kế hoạch quokkapending');

    // Hidden in Postgres, index not told yet: the hit is still dropped.
    await updateDocument(database.db, pendingId, { hidden: true });
    expect(await titles(bob, 'quokkapending', spaceId)).toEqual(['Bài của Bob']);
    sync.enqueue([pendingId]);
    await sync.idle();
    expect(await titles(bob, 'quokkapending', spaceId)).toEqual(['Bài của Bob']);
    expect(await titles(alice, 'quokkapending', spaceId)).toContain('Kế hoạch quokkapending');

    await updateDocument(database.db, pendingId, { deletedAt: new Date() });
    sync.enqueue([pendingId]);
    await sync.idle();
    for (const viewer of [alice, admin, bob]) expect(await titles(viewer, 'quokkapending', spaceId)).toEqual(['Bài của Bob']);
  });
});

describe('rebuild', () => {
  it('restores identical results after the indexes are deleted', async () => {
    const queries = ['mạng', 'mang', 'màng', 'đường', 'quokkapending', 'laptop'];
    const viewers = [GUEST, alice, bob, admin];
    const snapshot = async (): Promise<string[][]> => {
      const out: string[][] = [];
      for (const viewer of viewers) for (const q of queries) out.push(await titles(viewer, q));
      return out;
    };
    const before = await snapshot();
    expect(before.flat().length).toBeGreaterThan(0);

    await meili.client.deleteIndex(meili.client.uid(PUBLIC_INDEX));
    await meili.client.deleteIndex(meili.client.uid(PRIVATE_INDEX));
    await expect(searchChunks(database.db, meili.client, GUEST, 'mang')).rejects.toBeInstanceOf(MeiliError);

    const result = await rebuildIndexes(database.db, meili.client);
    expect(result.publicChunks + result.privateChunks).toBeGreaterThan(0);
    expect(await snapshot()).toEqual(before);
    expect(await checkDrift(database.db, meili.client)).toEqual([]);
  });
});

describe('sync failures', () => {
  it('retries a failed push and then succeeds', async () => {
    class FlakyMeili extends MeiliClient {
      failures = 1;
      override async addDocuments(uid: string, docs: readonly object[]): Promise<void> {
        if (this.failures-- > 0) throw new MeiliError(0, 'unreachable');
        return super.addDocuments(uid, docs);
      }
    }
    const flaky = new FlakyMeili(meili.config);
    const flakyLogs: string[] = [];
    const flakySync = new IndexSync(database.db, flaky, { retryDelaysMs: [20], log: (m) => flakyLogs.push(m) });
    const spaceId = await createSpace(database.db);
    const id = await createDocument(database.db, { spaceId, authorId: aliceId, title: 'Retry walrusretry', texts: ['walrusretry secret text'] });
    flakySync.enqueue([id]);
    await flakySync.idle();
    expect(await titles(GUEST, 'walrusretry', spaceId)).toEqual(['Retry walrusretry']);
    expect(flakyLogs).toHaveLength(1);
    expect(flakyLogs[0]).toMatch(/retry 1 .*unreachable/);
    expect(flakyLogs.join('\n')).not.toMatch(/walrusretry|secret/);
    flakySync.close();
  });

  it('gives up after the last retry, logging no document text, and reports the drift', async () => {
    const dead = new MeiliClient({ ...meili.config, url: 'http://127.0.0.1:9' });
    const deadLogs: string[] = [];
    const deadSync = new IndexSync(database.db, dead, { retryDelaysMs: [5], log: (m) => deadLogs.push(m) });
    const spaceId = await createSpace(database.db);
    const id = await createDocument(database.db, { spaceId, authorId: aliceId, title: 'Lost narwhallost', texts: ['narwhallost text'] });
    deadSync.enqueue([id]);
    await deadSync.idle();
    expect(deadLogs).toHaveLength(2);
    expect(deadLogs[1]).toMatch(/gave up on 1 document\(s\), run `pnpm reindex`/);
    expect(deadLogs.join('\n')).not.toMatch(/narwhallost/);
    expect(await checkDrift(database.db, meili.client)).toEqual([{ index: PUBLIC_INDEX, expected: expect.any(Number), actual: expect.any(Number) }]);
    deadSync.close();
    // Leave the shared indexes consistent for later tests.
    await rebuildIndexes(database.db, meili.client);
  });

  it('logged nothing in the normal runs', () => {
    expect(logs).toEqual([]);
  });
});
