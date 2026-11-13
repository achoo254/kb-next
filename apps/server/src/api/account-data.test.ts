/**
 * An account deleted at the IdP (auth-next ADR 0018, POST /api/idp/account-deleted): which notices are taken, what
 * goes, what stays, that the account is signed out everywhere, and that a repeated notice changes nothing.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { and, eq, inArray } from 'drizzle-orm';
import { createDocument, createSpace, createUser } from '../../test/content-fixtures';
import { type FakeIdp, startFakeIdp } from '../../test/fake-idp';
import { api, signIn } from '../../test/sign-in';
import { ACCOUNT_DELETED_PATH } from '../auth/account-deleted';
import { createSession } from '../auth/session-store';
import { type TestServer, startTestServer } from '../../test/test-server';
import { auditLog, comments, documents, favorites, files, readingProgress, sessions, shareLinks, spaces, users } from '../db/schema';

const SECRET = 'test-secret-'.padEnd(40, 'x');

let idp: FakeIdp;
let server: TestServer;

const receiver = (): string => `${server.origin}${ACCOUNT_DELETED_PATH}`;
/** The IdP's POST: server to server, no Origin, no cookie. */
const notify = (body: string, type = 'application/secevent+jwt'): Promise<Response> =>
  fetch(receiver(), { method: 'POST', headers: { 'content-type': type }, body });
const noticeFor = (sub: string, options?: Parameters<FakeIdp['accountDeletedToken']>[2]): string => idp.accountDeletedToken(sub, receiver(), options);
const b64url = (value: string): string => Buffer.from(value).toString('base64url');

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

describe('POST /api/idp/account-deleted: which notices are taken', () => {
  const nowS = (): number => Math.floor(Date.now() / 1000);

  it.each([
    ['a key the IdP never published', () => noticeFor('careful', { how: 'stranger' })],
    ['another receiver', () => noticeFor('careful', { claims: { aud: 'https://chat.hoandat.com/api/idp/account-deleted' } })],
    ['an audience list', () => noticeFor('careful', { claims: { aud: [receiver()] } })],
    ['another issuer', () => noticeFor('careful', { claims: { iss: 'https://evil.example' } })],
    ['an expired notice', () => noticeFor('careful', { claims: { iat: nowS() - 1200, exp: nowS() - 600 } })],
    ['no expiry', () => noticeFor('careful', { claims: { exp: undefined } })],
    ['another event', () => noticeFor('careful', { claims: { events: { 'urn:hoandat:auth:event:account.created': {} } } })],
    ['no sub', () => noticeFor('', {})],
  ])('refuses %s with 401 and deletes nothing', async (_label, makeToken) => {
    idp.setSub('careful');
    const session = await signIn(server);
    const res = await notify(makeToken());
    expect(res.status).toBe(401);
    expect((await api(server, '/api/me', { cookie: session })).status).toBe(200);
  });

  it('refuses a token signed with another algorithm than ES256', async () => {
    idp.setSub('careful');
    const session = await signIn(server);
    const [, payload = '', signature = ''] = noticeFor('careful').split('.');
    const forged = `${b64url(JSON.stringify({ alg: 'RS256', kid: 'fake-key-1', typ: 'secevent+jwt' }))}.${payload}.${signature}`;
    expect((await notify(forged)).status).toBe(401);
    expect((await api(server, '/api/me', { cookie: session })).status).toBe(200);
  });

  it.each([
    ['an empty body', () => ''],
    ['not a JWS', () => 'hello'],
    ['another token type (a logout token)', () => noticeFor('careful', { typ: 'logout+jwt' })],
  ])('answers 400 to %s', async (_label, makeBody) => {
    expect((await notify(makeBody())).status).toBe(400);
  });

  it('answers 400 to a SET sent as another media type', async () => {
    expect((await notify(noticeFor('careful'), 'application/json')).status).toBe(400);
  });

  it('answers 202 to an account this app never saw', async () => {
    expect((await notify(noticeFor('never-signed-in'))).status).toBe(202);
  });
});

describe('POST /api/idp/account-deleted: what goes and what stays', () => {
  it('deletes the account’s own data, keeps its published texts by a nameless account, and signs it out everywhere', async () => {
    const db = server.database.db;
    const { session, userId, ids } = await leaverWithData('leaver');
    const res = await notify(noticeFor('leaver'));
    expect(res.status).toBe(202);

    // A text in the trash goes even when it was published; an official text stays whatever its step; a published
    // community text stays under the tombstone.
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

    // Every one of its sessions is gone.
    expect((await api(server, '/api/me', { cookie: session })).status).toBe(401);
    expect((await api(server, '/api/me', { cookie: ids.second })).status).toBe(401);

    const [tombstone] = await db.select().from(users).where(eq(users.id, userId));
    expect(tombstone).toMatchObject({ sub: `deleted:${userId}`, name: null, email: null, picture: null, role: 'member' });
    expect(tombstone?.deletedAt).not.toBeNull();
    const [line] = await db
      .select({ detail: auditLog.detail })
      .from(auditLog)
      .where(and(eq(auditLog.action, 'account.data-deleted'), eq(auditLog.targetId, userId)));
    expect(line?.detail).toEqual({ documents: 5, keptPublished: 2 });
  });

  it('takes the same notice again (the IdP retries) without changing anything', async () => {
    const db = server.database.db;
    const { userId } = await leaverWithData('twice');
    const notice = noticeFor('twice');
    expect((await notify(notice)).status).toBe(202);
    expect((await notify(notice)).status).toBe(202);
    const lines = await db
      .select({ id: auditLog.id })
      .from(auditLog)
      .where(and(eq(auditLog.action, 'account.data-deleted'), eq(auditLog.targetId, userId)));
    expect(lines).toHaveLength(1);
  });

  it('leaves a session opened in a race with the deletion worth nothing', async () => {
    const { userId } = await leaverWithData('racer');
    expect((await notify(noticeFor('racer'))).status).toBe(202);
    // A sign-in that had resolved the old account before the deletion committed opens its session afterwards.
    const late = `kb_session=${await createSession(server.database.db, userId, new Date(), null)}`;
    expect((await api(server, '/api/me', { cookie: late })).status).toBe(401);
    expect((await api(server, '/api/me/notifications', { cookie: late })).status).toBe(401);
    expect(await server.database.db.select().from(sessions).where(eq(sessions.userId, userId))).toEqual([]);
  });

  it('no longer offers a deletion of its own to a signed-in account', async () => {
    idp.setSub('still-here');
    const session = await signIn(server);
    const res = await api(server, '/api/me/delete-data', { method: 'POST', cookie: session, body: JSON.stringify({ confirm: 'DELETE', removePublished: false }) });
    expect(res.status).toBe(404);
    expect((await api(server, '/api/me', { cookie: session })).status).toBe(200);
  });
});
