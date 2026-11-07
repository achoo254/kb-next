/**
 * The publishing lifecycle through the web app's own clients (review-api.ts, notifications-api.ts): an author
 * publishes a text at once (guests read it), edits it, unpublishes and deletes it; texts left from the review gate
 * read as private until their author publishes them; an admin hides and shows a published text and the author cannot
 * undo that hide; every admin step tells the author (C20); the daily stale check tells an author once per change; a
 * comment tells the author and whoever it names.
 */
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { eq } from 'drizzle-orm';
import { ApiError } from '../../../web/src/api/api-client';
import { createDocument, fetchEditable, fetchMyDocuments, fetchTrash, saveDocument, trashDocument } from '../../../web/src/api/authoring-api';
import { fetchDocument, postComment } from '../../../web/src/api/content-api';
import { fetchInbox, fetchUnread, markAllNotificationsRead, markNotificationRead } from '../../../web/src/api/notifications-api';
import { fetchPublished, keepPrivate, publishDocument, updatePublished } from '../../../web/src/api/review-api';
import { fetchHistory } from '../../../web/src/api/history-api';
import { createShareLink, fetchShare } from '../../../web/src/api/share-api';
import { type FakeIdp, startFakeIdp } from '../../test/fake-idp';
import { signIn } from '../../test/sign-in';
import { type TestServer, startTestServer } from '../../test/test-server';
import { documentVersions, documents, notifications, reviewEvents, users } from '../db/schema';
import { seedDatabase, seedId } from '../db/seed-database';
import { runStaleCheck } from '../notifications/stale-job';

const SECRET = 'test-secret-'.padEnd(40, 'x');
const DRAFT = seedId('document:new-host-ip');
const SENT_BACK = seedId('document:tcp-udp-pic');
const WAITING = seedId('document:swap-ubuntu');
const REJECTED = seedId('document:dns-cache');
const DHCP = seedId('document:dhcp');

let idp: FakeIdp;
let server: TestServer;
const clock = { now: new Date('2026-11-05T03:00:00Z') };
const sessions = { owner: '', admin: '', other: '', guest: '' };
let current = '';

/** Each call a second later: what happens in turn is ordered in time, as in real use. */
async function as<T>(who: keyof typeof sessions, fn: () => Promise<T>): Promise<T> {
  clock.now = new Date(clock.now.getTime() + 1000);
  current = sessions[who];
  return fn();
}

async function failure(promise: Promise<unknown>): Promise<string> {
  try {
    await promise;
  } catch (error) {
    if (error instanceof ApiError) return error.code;
    throw error;
  }
  throw new Error('the call succeeded');
}

beforeAll(async () => {
  idp = await startFakeIdp({ clientId: 'kb-web', clientSecret: SECRET, sub: 'owner-sub', profile: { name: 'Chủ Nhà' } });
  server = await startTestServer({ AUTH_ISSUER: idp.issuer, AUTH_CLIENT_SECRET: SECRET, ADMIN_SUBS: 'admin-sub' }, { submitLimitPer10Min: 100 }, () => clock.now);
  await seedDatabase(server.database.db, 'owner-sub');
  sessions.owner = await signIn(server);
  idp.setSub('admin-sub');
  sessions.admin = await signIn(server);
  idp.setSub('other-sub');
  sessions.other = await signIn(server);
  const realFetch = globalThis.fetch;
  vi.stubGlobal('fetch', (path: string, init: RequestInit = {}) => {
    const headers = new Headers(init.headers);
    headers.set('origin', server.origin);
    if (current) headers.set('cookie', current);
    return realFetch(`${server.origin}${path}`, { ...init, headers });
  });
});

afterAll(async () => {
  vi.unstubAllGlobals();
  await server?.close();
  await idp?.close();
});

describe('publishing', () => {
  it('publishes the author’s draft at once: a guest reads it, no admin is told', async () => {
    const adminUnread = (await as('admin', () => fetchUnread())).total;
    expect(await as('guest', () => failure(fetchDocument(DRAFT)))).toBe('no-access');
    const published = await as('owner', () => publishDocument(DRAFT, { tags: ['dhcp', ' dora '] }));
    expect(published).toMatchObject({ status: 'approved', hidden: false });

    const read = await as('guest', () => fetchDocument(DRAFT));
    expect(read.document).toMatchObject({ status: 'approved', origin: 'community', title: 'Máy mới xin IP thế nào' });
    expect((await as('owner', () => fetchMyDocuments())).find((d) => d.id === DRAFT)).toMatchObject({ status: 'approved', hidden: false });
    const [row] = await server.database.db.select({ tags: documents.tags }).from(documents).where(eq(documents.id, DRAFT));
    expect(row?.tags).toEqual(['dhcp', 'dora']);
    expect((await as('admin', () => fetchUnread())).total).toBe(adminUnread);

    // The history shows when it was published, to its author and to other readers.
    const trail = await server.database.db.select({ action: reviewEvents.action, actorId: reviewEvents.actorId }).from(reviewEvents).where(eq(reviewEvents.documentId, DRAFT));
    expect(trail.filter((e) => e.action === 'published')).toHaveLength(1);
    for (const who of ['owner', 'other'] as const) {
      const events = (await as(who, () => fetchHistory(DRAFT))).events;
      expect(events.some((e) => e.kind === 'review' && e.action === 'published')).toBe(true);
    }
  });

  it('refuses what cannot be published, saying what to fix', async () => {
    const untitled = await as('owner', () => createDocument({ title: '', body: 'Chỉ có nội dung' }));
    expect(await as('owner', () => failure(publishDocument(untitled.id)))).toBe('title-required');
    const empty = await as('owner', () => createDocument({ title: 'Trống', body: '' }));
    expect(await as('owner', () => failure(publishDocument(empty.id)))).toBe('body-required');
    expect(await as('owner', () => failure(publishDocument(DRAFT)))).toBe('already-published');
    expect(await as('other', () => failure(publishDocument(empty.id)))).toBe('not-found');
    expect(await as('other', () => failure(publishDocument(DHCP)))).toBe('no-access');
    expect(await as('guest', () => failure(publishDocument(empty.id)))).toBe('sign-in-required');
  });

  it('lets the author edit a published text, which stays public', async () => {
    const editable = await as('owner', () => fetchEditable(DRAFT));
    await as('owner', () => saveDocument(DRAFT, { title: editable.title, body: 'DORA: Discover, Offer, Request, Ack.', baseRev: editable.rev }));
    const read = await as('guest', () => fetchDocument(DRAFT));
    expect(read.document.status).toBe('approved');
    expect(JSON.stringify(read.chunks)).toContain('Discover, Offer');
    // Someone else's published text stays theirs.
    expect(await as('other', () => failure(fetchEditable(DRAFT)))).toBe('no-access');
  });

  it('unpublishes: private again, its own origin back, its share links revoked', async () => {
    await as('owner', () => createShareLink(DRAFT, { expiry: 'none', access: 'view' }));
    await as('owner', () => keepPrivate(DRAFT));
    expect(await as('guest', () => failure(fetchDocument(DRAFT)))).toBe('no-access');
    expect(await as('other', () => failure(fetchDocument(DRAFT)))).toBe('no-access');
    expect((await as('owner', () => fetchMyDocuments())).find((d) => d.id === DRAFT)).toMatchObject({ status: 'private', origin: 'own' });
    expect((await as('owner', () => fetchShare(DRAFT))).link?.revokedAt).not.toBeNull();
    // Published again by its author whenever they like.
    expect(await as('owner', () => publishDocument(DRAFT))).toMatchObject({ status: 'approved' });
  });

  it('reads texts left from the review gate as private until their author publishes them', async () => {
    const db = server.database.db;
    for (const id of [WAITING, SENT_BACK, REJECTED]) expect(await as('other', () => failure(fetchDocument(id)))).toBe('no-access');
    // An admin's unread "waiting" notice of the old submission goes once its author acts on it.
    const [admin] = await db.select({ id: users.id }).from(users).where(eq(users.sub, 'admin-sub'));
    if (!admin) throw new Error('no admin');
    await db.insert(notifications).values({ userId: admin.id, documentId: WAITING, kind: 'review', payload: { kind: 'review', title: 'Ghi chú: swap trên Ubuntu', action: 'submitted', reason: null, by: 'Chủ Nhà' }, createdAt: clock.now });
    const waitingNotices = async (): Promise<number> => (await as('admin', () => fetchInbox({ kind: 'review' }))).notifications.filter((n) => n.documentId === WAITING).length;
    expect(await waitingNotices()).toBe(1);
    expect(await as('owner', () => publishDocument(WAITING))).toMatchObject({ status: 'approved' });
    expect(await waitingNotices()).toBe(0);
    expect((await as('guest', () => fetchDocument(WAITING))).document.status).toBe('approved');
    // Sent back long ago: published now, its 180 days without a change start again (no stale notice right away).
    await db.update(documents).set({ updatedAt: new Date('2025-01-01T00:00:00Z') }).where(eq(documents.id, SENT_BACK));
    expect(await as('owner', () => publishDocument(SENT_BACK))).toMatchObject({ status: 'approved' });
    expect((await as('other', () => fetchDocument(SENT_BACK))).document).toMatchObject({ status: 'approved', origin: 'community' });
    expect(await runStaleCheck(db, clock.now)).toBe(0);
    await as('owner', () => keepPrivate(REJECTED));
    expect((await as('owner', () => fetchMyDocuments())).find((d) => d.id === REJECTED)?.status).toBe('private');
  });

  it('lets the author move their published text to the trash', async () => {
    const note = await as('owner', () => createDocument({ title: 'Bài sẽ xoá', body: 'Nội dung' }));
    await as('owner', () => publishDocument(note.id));
    expect(await as('other', () => failure(trashDocument(note.id)))).toBe('no-access');
    await as('owner', () => trashDocument(note.id));
    expect(await as('guest', () => failure(fetchDocument(note.id)))).toBe('not-found');
    expect((await as('owner', () => fetchTrash())).map((d) => d.id)).toContain(note.id);
  });
});

describe('an admin’s hand on published texts', () => {
  it('hides and shows a published text, telling its author', async () => {
    const hidden = await as('admin', () => updatePublished(SENT_BACK, { hidden: true }));
    expect(hidden.hidden).toBe(true);
    expect(await as('other', () => failure(fetchDocument(SENT_BACK)))).toBe('hidden');
    const listed = await as('admin', () => fetchPublished({ visibility: 'hidden' }));
    expect(listed.map((d) => d.id)).toContain(SENT_BACK);
    expect((await as('owner', () => fetchInbox({ kind: 'permission' }))).notifications[0]?.payload).toMatchObject({ kind: 'permission', hidden: true });
    await as('admin', () => updatePublished(SENT_BACK, { hidden: false, tags: [' tcp ', 'udp', 'tcp'] }));
    const shown = (await as('admin', () => fetchPublished({ q: 'TCP vs' }))).find((d) => d.id === SENT_BACK);
    expect(shown).toMatchObject({ hidden: false, tags: ['tcp', 'udp'] });
    expect(await as('admin', () => failure(updatePublished(REJECTED, { hidden: true })))).toBe('not-approved');
  });

  it('keeps an admin’s hide: the author unpublishing and publishing again does not show the text', async () => {
    await as('admin', () => updatePublished(SENT_BACK, { hidden: true }));
    await as('owner', () => keepPrivate(SENT_BACK));
    expect(await as('owner', () => publishDocument(SENT_BACK))).toMatchObject({ status: 'approved', hidden: true });
    expect(await as('guest', () => failure(fetchDocument(SENT_BACK)))).toBe('hidden');
    expect(await as('other', () => failure(fetchDocument(SENT_BACK)))).toBe('hidden');
    // Editing is the author's still; the text stays hidden.
    const editable = await as('owner', () => fetchEditable(SENT_BACK));
    await as('owner', () => saveDocument(SENT_BACK, { title: editable.title, body: `${editable.body}\n\nThêm một dòng.`, baseRev: editable.rev }));
    expect((await as('owner', () => fetchMyDocuments())).find((d) => d.id === SENT_BACK)).toMatchObject({ status: 'approved', hidden: true });
    await as('admin', () => updatePublished(SENT_BACK, { hidden: false }));
    expect((await as('guest', () => fetchDocument(SENT_BACK))).document.status).toBe('approved');
  });

  it('changes nothing of a text that is not published, whatever the patch holds', async () => {
    const before = await server.database.db.select().from(documents).where(eq(documents.id, REJECTED));
    const versions = await server.database.db.select().from(documentVersions).where(eq(documentVersions.documentId, REJECTED));
    expect(await as('admin', () => failure(updatePublished(REJECTED, { space: 'linux', title: 'Đổi tên', tags: ['x'], hidden: true })))).toBe('not-approved');
    expect(await server.database.db.select().from(documents).where(eq(documents.id, REJECTED))).toEqual(before);
    expect(await server.database.db.select().from(documentVersions).where(eq(documentVersions.documentId, REJECTED))).toHaveLength(versions.length);
    // A published text with a Collection that does not exist: refused before its new title is written.
    expect(await as('admin', () => failure(updatePublished(SENT_BACK, { title: 'Tên mới', collection: '00000000-0000-4000-8000-000000000000' })))).toBe('unknown-collection');
    expect((await as('admin', () => fetchPublished({ q: 'TCP vs' }))).find((d) => d.id === SENT_BACK)?.title).toBe('TCP vs UDP bằng hình');
  });
});

describe('the inbox', () => {
  it('counts unread, marks one and all read, and never shows another account’s', async () => {
    const before = await as('owner', () => fetchUnread());
    expect(before.total).toBeGreaterThan(0);
    const first = (await as('owner', () => fetchInbox({ unreadOnly: true }))).notifications[0];
    if (!first) throw new Error('no notification');
    expect(await as('other', () => failure(markNotificationRead(first.id)))).toBe('not-found');
    await as('owner', () => markNotificationRead(first.id));
    expect((await as('owner', () => fetchUnread())).total).toBe(before.total - 1);
    expect(await as('owner', () => markAllNotificationsRead())).toBe(before.total - 1);
    expect(await as('owner', () => fetchUnread())).toMatchObject({ total: 0 });
  });

  it('tells the author of a comment and whoever it names', async () => {
    current = sessions.other;
    await postComment(SENT_BACK, '@Chủ Nhà xem giúp phần UDP nhé');
    const mention = (await as('owner', () => fetchInbox({ kind: 'mention' }))).notifications[0];
    expect(mention?.payload).toMatchObject({ kind: 'mention', title: 'TCP vs UDP bằng hình', excerpt: '@Chủ Nhà xem giúp phần UDP nhé' });
    await as('other', () => postComment(SENT_BACK, 'Hình rõ quá'));
    expect((await as('owner', () => fetchInbox({ kind: 'comment' }))).notifications[0]?.payload).toMatchObject({ kind: 'comment', excerpt: 'Hình rõ quá' });
    // Nobody is told about their own comment.
    expect((await as('other', () => fetchInbox())).notifications.filter((n) => n.kind === 'comment' || n.kind === 'mention')).toEqual([]);
  });

  it('keeps a discussion’s words from whoever can no longer read the text', async () => {
    // Everyone signed in through the fake IdP is "Chủ Nhà": the other account, in the discussion already, is named.
    await as('owner', () => postComment(SENT_BACK, '@Chủ Nhà cảm ơn góp ý'));
    const mention = async () => (await as('other', () => fetchInbox({ kind: 'mention' }))).notifications[0];
    expect((await mention())?.payload).toMatchObject({ excerpt: '@Chủ Nhà cảm ơn góp ý' });
    await as('admin', () => updatePublished(SENT_BACK, { hidden: true }));
    expect(await mention()).toMatchObject({ place: null, payload: { excerpt: '' } });
    await as('admin', () => updatePublished(SENT_BACK, { hidden: false }));
  });

  it('tells an author once when an approved text goes 180 days unchanged', async () => {
    const db = server.database.db;
    await db
      .update(documents)
      .set({ updatedAt: new Date('2026-04-01T00:00:00Z') })
      .where(eq(documents.id, SENT_BACK));
    expect(await runStaleCheck(db, clock.now)).toBeGreaterThanOrEqual(1);
    const stale = (await as('owner', () => fetchInbox({ kind: 'stale' }))).notifications;
    const days = Math.floor((clock.now.getTime() - Date.parse('2026-04-01T00:00:00Z')) / (24 * 60 * 60 * 1000));
    expect(stale.map((n) => n.payload)).toContainEqual({ kind: 'stale', title: 'TCP vs UDP bằng hình', days });
    const again = await runStaleCheck(db, clock.now);
    expect((await as('owner', () => fetchInbox({ kind: 'stale' }))).notifications).toHaveLength(stale.length);
    expect(again).toBe(0);
  });
});
