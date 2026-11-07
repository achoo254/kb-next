import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createDocument, createLink, createSpace, createUser } from '../../test/content-fixtures';
import { type DbHandle, openPglite } from '../db/client';
import { eq } from 'drizzle-orm';
import { DOCUMENT_STATUSES, users } from '../db/schema';
import { findDocument, findLatestVersion, listChunks, listCollections, listDocuments, listLinks, listSpaces } from './content';
import { GUEST, type Viewer, viewerFor } from './viewer';
import { canRead } from './visibility';

/**
 * The read rule as a table: guest, author, another account, an account stored as a reviewer (left from the review
 * gate: it reads as any member), an admin by ADMIN_SUBS and one by role, and a removed account, against every
 * status, hidden or not.
 * Every read path of src/access/ must agree with it, and with the plain `canRead`.
 */
const ADMIN_SUB = 'admin:matrix';

let database: DbHandle;
let authorId: string;
let spaceId: string;
let hubId: string;
let deletedId: string;
type ViewerName = 'guest' | 'author' | 'other' | 'reviewer' | 'admin' | 'roleAdmin' | 'removed';
const viewers: Record<ViewerName, Viewer> = { guest: GUEST, author: GUEST, other: GUEST, reviewer: GUEST, admin: GUEST, roleAdmin: GUEST, removed: GUEST };
const cases: Array<{ id: string; status: (typeof DOCUMENT_STATUSES)[number]; hidden: boolean }> = [];

beforeAll(async () => {
  database = await openPglite();
  const db = database.db;
  authorId = await createUser(db);
  const otherId = await createUser(db);
  const adminId = await createUser(db, ADMIN_SUB);
  const reviewerId = await createUser(db);
  const roleAdminId = await createUser(db);
  const removedId = await createUser(db);
  await db.update(users).set({ role: 'reviewer' }).where(eq(users.id, reviewerId));
  await db.update(users).set({ role: 'admin' }).where(eq(users.id, roleAdminId));
  await db.update(users).set({ role: 'admin', removedAt: new Date() }).where(eq(users.id, removedId));
  const admins = new Set([ADMIN_SUB]);
  viewers.author = await viewerFor(db, admins, authorId);
  viewers.other = await viewerFor(db, admins, otherId);
  viewers.reviewer = await viewerFor(db, admins, reviewerId);
  viewers.admin = await viewerFor(db, admins, adminId);
  viewers.roleAdmin = await viewerFor(db, admins, roleAdminId);
  viewers.removed = await viewerFor(db, admins, removedId);
  spaceId = await createSpace(db);
  // An approved document by someone else that links to every case, so links can be checked from a readable end.
  hubId = await createDocument(db, { spaceId, authorId: otherId, title: 'hub', texts: ['hub'] });
  for (const status of DOCUMENT_STATUSES) {
    for (const hidden of [false, true]) {
      const id = await createDocument(db, { spaceId, authorId, status, hidden, title: `${status}${hidden ? ' hidden' : ''}`, texts: ['body'] });
      await createLink(db, hubId, id);
      cases.push({ id, status, hidden });
    }
  }
  deletedId = await createDocument(db, { spaceId, authorId, status: 'approved', deletedAt: new Date(), texts: ['gone'] });
  await createLink(db, hubId, deletedId);
});

afterAll(async () => {
  await database.close();
});

function expected(viewerName: ViewerName, status: string, hidden: boolean): boolean {
  if (viewerName === 'admin' || viewerName === 'roleAdmin' || viewerName === 'author') return true;
  return status === 'approved' && !hidden;
}

describe('viewerFor', () => {
  it('makes an admin of a sub listed in ADMIN_SUBS or of an account given the role', () => {
    expect(viewers.admin).toMatchObject({ kind: 'user', isAdmin: true });
    expect(viewers.roleAdmin).toMatchObject({ kind: 'user', isAdmin: true });
    expect(viewers.author).toMatchObject({ kind: 'user', isAdmin: false });
  });

  it('reads an account stored as a reviewer as a member', () => {
    expect(viewers.reviewer).toEqual({ kind: 'user', userId: expect.any(String), isAdmin: false });
  });

  it('reads a removed account as a guest, whatever its role', () => {
    expect(viewers.removed).toEqual(GUEST);
  });

  it('reads an unknown or malformed account as a guest', async () => {
    expect(await viewerFor(database.db, new Set(), null)).toEqual(GUEST);
    expect(await viewerFor(database.db, new Set(), 'not-a-uuid')).toEqual(GUEST);
    expect(await viewerFor(database.db, new Set(), '00000000-0000-4000-8000-000000000000')).toEqual(GUEST);
  });
});

describe.each(Object.keys(viewers) as ViewerName[])('%s', (viewerName) => {
  it.each(DOCUMENT_STATUSES.flatMap((status) => [false, true].map((hidden) => ({ status, hidden }))))(
    'status $status, hidden $hidden',
    async ({ status, hidden }) => {
      const db = database.db;
      const viewer = viewers[viewerName];
      const doc = cases.find((c) => c.status === status && c.hidden === hidden);
      if (!doc) throw new Error('missing case');
      const want = expected(viewerName, status, hidden);

      expect(canRead(viewer, { status, hidden, authorId, deletedAt: null })).toBe(want);
      expect((await findDocument(db, viewer, doc.id)) !== null).toBe(want);
      expect((await listChunks(db, viewer, doc.id)) !== null).toBe(want);
      expect((await listDocuments(db, viewer, { spaceId })).some((d) => d.id === doc.id)).toBe(want);
      const hubLinks = (await listLinks(db, viewer, hubId)) ?? [];
      expect(hubLinks.some((l) => l.targetId === doc.id)).toBe(want);
      expect((await listLinks(db, viewer, doc.id)) !== null).toBe(want);
    },
  );

  it('never reads a document in the trash', async () => {
    const db = database.db;
    const viewer = viewers[viewerName];
    expect(canRead(viewer, { status: 'approved', hidden: false, authorId, deletedAt: new Date() })).toBe(false);
    expect(await findDocument(db, viewer, deletedId)).toBeNull();
    expect(await listChunks(db, viewer, deletedId)).toBeNull();
    expect((await listLinks(db, viewer, hubId))?.some((l) => l.targetId === deletedId)).toBe(false);
  });

  it('counts only readable documents per Space', async () => {
    const [space] = (await listSpaces(database.db, viewers[viewerName])).filter((s) => s.id === spaceId);
    const readable = cases.filter((c) => expected(viewerName, c.status, c.hidden)).length;
    expect(space?.documentCount).toBe(readable + 1);
  });
});

describe('personal Spaces', () => {
  it('are listed for their owner only', async () => {
    const db = database.db;
    const personalId = await createSpace(db, 'personal-of-author', authorId);
    await createDocument(db, { spaceId: personalId, authorId, status: 'private', texts: ['mine'] });
    for (const name of ['guest', 'other', 'reviewer', 'admin', 'roleAdmin'] as const) {
      expect((await listSpaces(db, viewers[name])).some((s) => s.id === personalId)).toBe(false);
      expect(await listCollections(db, viewers[name], personalId)).toBeNull();
    }
    const own = (await listSpaces(db, viewers.author)).find((s) => s.id === personalId);
    expect(own?.documentCount).toBe(1);
    expect(await listCollections(db, viewers.author, personalId)).toEqual([]);
  });
});

describe('malformed ids', () => {
  it('read as not found instead of failing the query', async () => {
    const db = database.db;
    expect(await findDocument(db, viewers.admin, 'nope')).toBeNull();
    expect(await listChunks(db, viewers.admin, "1' or '1'='1")).toBeNull();
    expect(await findLatestVersion(db, viewers.admin, 'nope')).toBeNull();
    expect(await listDocuments(db, viewers.admin, { spaceId: 'nope' })).toEqual([]);
  });
});
