/**
 * "Xoá dữ liệu của tôi" (H03, POST /api/me/delete-data): what goes, what stays, and that the account is signed out
 * everywhere and comes back empty when the same hoandat account signs in again.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { and, eq, inArray } from 'drizzle-orm';
import { createDocument, createSpace, createUser } from '../../test/content-fixtures';
import { type FakeIdp, startFakeIdp } from '../../test/fake-idp';
import { api, signIn } from '../../test/sign-in';
import { createSession } from '../auth/session-store';
import { type TestServer, startTestServer } from '../../test/test-server';
import { auditLog, comments, documents, favorites, files, readingProgress, sessions, shareLinks, spaces, users } from '../db/schema';

const SECRET = 'test-secret-'.padEnd(40, 'x');
const json = (body: unknown): string => JSON.stringify(body);

let idp: FakeIdp;
let server: TestServer;

beforeAll(async () => {
  idp = await startFakeIdp({ clientId: 'kb-web', clientSecret: SECRET, sub: 'leaver', profile: { name: 'Người Rời', email: 'leaver@example.com' } });
  server = await startTestServer({ AUTH_ISSUER: idp.issuer, AUTH_CLIENT_SECRET: SECRET });
});

afterAll(async () => {
  await server.close();
  await idp.close();
});

async function accountOf(sub: string): Promise<string> {
  const [row] = await server.database.db.select({ id: users.id }).from(users).where(eq(users.sub, sub));
  if (!row) throw new Error(`no account ${sub}`);
  return row.id;
}

/** An account with texts at every step, a personal Space, a file, and traces on someone else's text. */
async function leaverWithData(sub: string) {
  idp.setSub(sub);
  const session = await signIn(server);
  const second = await signIn(server);
  const db = server.database.db;
  const userId = await accountOf(sub);
  const spaceId = await createSpace(db);
  const personalId = await createSpace(db, `personal-${sub}`, userId);
  const otherId = await createUser(db);
  const ids = {
    draft: await createDocument(db, { spaceId, authorId: userId, status: 'draft', title: 'Bản nháp' }),
    pending: await createDocument(db, { spaceId, authorId: userId, status: 'pending', title: 'Chờ duyệt' }),
    trashed: await createDocument(db, { spaceId, authorId: userId, status: 'draft', deletedAt: new Date(), deletedBy: userId }),
    community: await createDocument(db, { spaceId, authorId: userId, status: 'approved', origin: 'community', title: 'Bài cộng đồng' }),
    trashedPublished: await createDocument(db, { spaceId, authorId: userId, status: 'approved', origin: 'community', deletedAt: new Date(), deletedBy: userId }),
    officialDraft: await createDocument(db, { spaceId, authorId: userId, status: 'draft', origin: 'official', title: 'Bản nháp chính thức' }),
    official: await createDocument(db, { spaceId, authorId: userId, status: 'approved', origin: 'official', title: 'Bài chính thức' }),
    personal: await createDocument(db, { spaceId: personalId, authorId: userId, status: 'private' }),
    others: await createDocument(db, { spaceId, authorId: otherId, status: 'approved' }),
    personalSpace: personalId,
    second,
  };
  await db.insert(comments).values({ documentId: ids.others, authorId: userId, body: 'Ghi chú của tôi' });
  await db.insert(favorites).values({ userId, documentId: ids.others });
  await db.insert(readingProgress).values({ userId, documentId: ids.others, progress: 40, updatedAt: new Date() });
  await db.insert(shareLinks).values({ documentId: ids.community, tokenHash: `hash-${sub}`, last4: 'abcd', createdBy: userId });
  await db.insert(files).values({ storageKey: `k${sub}`.padEnd(10, '0'), originalName: 'a.docx', mime: 'application/octet-stream', size: 3, sha256: 'x', ownerId: userId });
  return { session, userId, ids };
}

describe('POST /api/me/delete-data', () => {
  it('needs a session, the typed confirmation and the choice about published texts', async () => {
    idp.setSub('careful');
    const session = await signIn(server);
    expect((await api(server, '/api/me/delete-data', { method: 'POST', body: json({ confirm: 'DELETE', removePublished: false }) })).status).toBe(401);
    for (const body of [{}, { confirm: 'XOA', removePublished: false }, { confirm: 'OK', removePublished: false }, { confirm: 'DELETE' }]) {
      const res = await api(server, '/api/me/delete-data', { method: 'POST', cookie: session, body: json(body) });
      expect(res.status, JSON.stringify(body)).toBe(400);
    }
    // Nothing happened: the account is still there.
    expect((await api(server, '/api/me', { cookie: session })).status).toBe(200);
  });

  it('deletes the account’s own data, keeps its published texts by a nameless account, and signs it out', async () => {
    const db = server.database.db;
    const { session, userId, ids } = await leaverWithData('leaver');
    // The typed word as the person typed it (Vietnamese, any case).
    const res = await api(server, '/api/me/delete-data', { method: 'POST', cookie: session, body: json({ confirm: ' xoá ', removePublished: false }) });
    expect(res.status).toBe(200);
    expect(res.headers.getSetCookie().some((c) => c.startsWith('kb_session=;'))).toBe(true);
    expect(await res.json()).toEqual({ deletedDocuments: 5, keptPublished: 2 });

    // A text in the trash goes even when it was published; an official text stays whatever its step.
    const left = await db
      .select({ id: documents.id })
      .from(documents)
      .where(inArray(documents.id, [ids.draft, ids.pending, ids.trashed, ids.trashedPublished, ids.community, ids.official, ids.officialDraft, ids.personal, ids.others]));
    expect(left.map((d) => d.id).sort()).toEqual([ids.community, ids.official, ids.officialDraft, ids.others].sort());
    expect(await db.select().from(spaces).where(eq(spaces.id, ids.personalSpace))).toEqual([]);
    expect(await db.select().from(comments).where(eq(comments.authorId, userId))).toEqual([]);
    expect(await db.select().from(favorites).where(eq(favorites.userId, userId))).toEqual([]);
    expect(await db.select().from(readingProgress).where(eq(readingProgress.userId, userId))).toEqual([]);
    expect(await db.select().from(files).where(eq(files.ownerId, userId))).toEqual([]);
    expect(await db.select().from(sessions).where(eq(sessions.userId, userId))).toEqual([]);
    const [link] = await db.select({ revokedAt: shareLinks.revokedAt }).from(shareLinks).where(eq(shareLinks.createdBy, userId));
    expect(link?.revokedAt).not.toBeNull();

    // Both of its sessions are gone, not only the one that asked.
    expect((await api(server, '/api/me', { cookie: session })).status).toBe(401);
    expect((await api(server, '/api/me', { cookie: ids.second })).status).toBe(401);

    const [tombstone] = await db.select().from(users).where(eq(users.id, userId));
    expect(tombstone).toMatchObject({ sub: `deleted:${userId}`, name: null, email: null, picture: null, role: 'member' });
    expect(tombstone?.deletedAt).not.toBeNull();
    const [line] = await db
      .select({ detail: auditLog.detail })
      .from(auditLog)
      .where(and(eq(auditLog.action, 'account.data-deleted'), eq(auditLog.targetId, userId)));
    expect(line?.detail).toEqual({ documents: 5, keptPublished: 2, removePublished: false });
  });

  it('removes its published community texts too when asked, never the official ones', async () => {
    const db = server.database.db;
    const { session, ids } = await leaverWithData('leaver-all');
    const res = await api(server, '/api/me/delete-data', { method: 'POST', cookie: session, body: json({ confirm: 'DELETE', removePublished: true }) });
    expect(await res.json()).toEqual({ deletedDocuments: 6, keptPublished: 1 });
    const left = await db
      .select({ id: documents.id })
      .from(documents)
      .where(inArray(documents.id, [ids.community, ids.official]));
    expect(left.map((d) => d.id)).toEqual([ids.official]);
  });

  it('leaves a session opened in a race with the deletion worth nothing', async () => {
    const { userId } = await leaverWithData('racer');
    const session = await signIn(server);
    expect((await api(server, '/api/me/delete-data', { method: 'POST', cookie: session, body: json({ confirm: 'DELETE', removePublished: false }) })).status).toBe(200);
    // A sign-in that had resolved the old account before the deletion committed opens its session afterwards.
    const late = `kb_session=${await createSession(server.database.db, userId, new Date(), null)}`;
    expect((await api(server, '/api/me', { cookie: late })).status).toBe(401);
    expect((await api(server, '/api/me/notifications', { cookie: late })).status).toBe(401);
    expect(await server.database.db.select().from(sessions).where(eq(sessions.userId, userId))).toEqual([]);
  });

  it('lets the same hoandat account start afresh, empty', async () => {
    idp.setSub('leaver');
    const session = await signIn(server);
    const me = await api(server, '/api/me', { cookie: session });
    expect(await me.json()).toMatchObject({ name: 'Người Rời', role: 'member', onboardedAt: null });
    const fresh = await accountOf('leaver');
    expect(await server.database.db.select().from(documents).where(eq(documents.authorId, fresh))).toEqual([]);
  });
});
