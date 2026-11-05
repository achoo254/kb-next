/**
 * The review lifecycle through the web app's own clients (review-api.ts, notifications-api.ts): an author sends a
 * text for review (Jev's pre-review stored for admins only; without Jev the submission stands), takes it back, an
 * admin decides with a reason only the author and admins read, hides and shows a published text; every step tells
 * whoever it concerns (C20); the daily stale check tells an author once per change; a comment tells the author and
 * whoever it names.
 */
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { eq } from 'drizzle-orm';
import { ApiError } from '../../../web/src/api/api-client';
import { createDocument, fetchMyDocuments } from '../../../web/src/api/authoring-api';
import { fetchDocument, postComment } from '../../../web/src/api/content-api';
import { fetchHistory } from '../../../web/src/api/history-api';
import { fetchInbox, fetchUnread, markAllNotificationsRead, markNotificationRead } from '../../../web/src/api/notifications-api';
import { decideReview, fetchPublished, fetchReviewQueue, submitForReview, updatePublished, withdrawSubmission } from '../../../web/src/api/review-api';
import { type FakeIdp, startFakeIdp } from '../../test/fake-idp';
import { signIn } from '../../test/sign-in';
import { type TestServer, startTestServer } from '../../test/test-server';
import { documentVersions, documents, reviewEvents } from '../db/schema';
import { seedDatabase, seedId } from '../db/seed-database';
import type { JevJudge, JevResult } from '../jev/jev-client';
import { runStaleCheck } from '../notifications/stale-job';

const SECRET = 'test-secret-'.padEnd(40, 'x');
const DRAFT = seedId('document:new-host-ip');
const SENT_BACK = seedId('document:tcp-udp-pic');
const DHCP = seedId('document:dhcp');

let idp: FakeIdp;
let server: TestServer;
const clock = { now: new Date('2026-11-05T03:00:00Z') };
const sessions = { owner: '', admin: '', other: '' };
let current = '';
const jevControl = { fail: false, calls: 0 };

/** Jev's four judgments: on topic 3 of 4 levels, sources 0.71, a repeat of the first candidate 0.12, clean 0.03. */
const jev: JevJudge = {
  choose: () => Promise.reject(new Error('not used')),
  ask: (_purpose, _state, questions): Promise<JevResult> => {
    jevControl.calls += 1;
    if (jevControl.fail) return Promise.reject(new Error('Jev pre-review failed: TimeoutError'));
    const answers: JevResult['answers'] = {};
    for (const key of Object.keys(questions)) {
      if (key === 'onTopic') answers[key] = { type: 'score', score: 3, confidence: 0.9, probabilities: {} };
      else if (key === 'hasSources') answers[key] = { type: 'noul', noul: 0.71 };
      else if (key === 'inappropriate') answers[key] = { type: 'noul', noul: 0.03 };
      else answers[key] = { type: 'noul', noul: key === 'dupD1' ? 0.12 : 0.05 };
    }
    return Promise.resolve({ answers, usage: { inputTokens: 10, outputTokens: 1 } });
  },
};

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
  server = await startTestServer({ AUTH_ISSUER: idp.issuer, AUTH_CLIENT_SECRET: SECRET, ADMIN_SUBS: 'admin-sub' }, { submitLimitPer10Min: 100 }, () => clock.now, jev);
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
    headers.set('cookie', current);
    return realFetch(`${server.origin}${path}`, { ...init, headers });
  });
});

afterAll(async () => {
  vi.unstubAllGlobals();
  await server?.close();
  await idp?.close();
});

beforeEach(() => {
  jevControl.fail = false;
});

describe('sending for review', () => {
  it('puts the author’s draft in the queue with Jev’s pre-review, for admins only, and tells the admins', async () => {
    const sent = await as('owner', () => submitForReview(DRAFT));
    expect(sent).toMatchObject({ status: 'pending', preReviewed: true });
    // The seed already has a text waiting; this one is behind it.
    expect(sent.queuePosition).toBeGreaterThanOrEqual(2);

    const queue = await as('admin', () => fetchReviewQueue());
    const item = queue.find((q) => q.id === DRAFT);
    expect(item).toMatchObject({ title: 'Máy mới xin IP thế nào', authorName: 'Chủ Nhà' });
    expect(item?.preReview).toMatchObject({ onTopic: 0.75, hasSources: 0.71, inappropriate: 0.03 });
    expect(queue[0]?.id).toBe(DRAFT);

    // The author's own list says only "pending"; scores never reach a member.
    const mine = await as('owner', () => fetchMyDocuments());
    expect(mine.find((d) => d.id === DRAFT)).toMatchObject({ status: 'pending' });
    expect(await as('owner', () => failure(fetchReviewQueue()))).toBe('admin-only');

    const inbox = await as('admin', () => fetchInbox());
    expect(inbox.notifications[0]?.payload).toMatchObject({ kind: 'review', action: 'submitted', title: 'Máy mới xin IP thế nào', by: 'Chủ Nhà' });
  });

  it('stands without Jev: the submission goes through, no scores', async () => {
    jevControl.fail = true;
    const sent = await as('owner', () => submitForReview(SENT_BACK));
    expect(sent.preReviewed).toBe(false);
    const item = (await as('admin', () => fetchReviewQueue())).find((q) => q.id === SENT_BACK);
    expect(item?.preReview).toBeNull();
  });

  it('refuses what cannot be sent, saying what to fix', async () => {
    const untitled = await as('owner', () => createDocument({ title: '', body: 'Chỉ có nội dung' }));
    expect(await as('owner', () => failure(submitForReview(untitled.id)))).toBe('title-required');
    const empty = await as('owner', () => createDocument({ title: 'Trống', body: '' }));
    expect(await as('owner', () => failure(submitForReview(empty.id)))).toBe('body-required');
    expect(await as('owner', () => failure(submitForReview(DRAFT)))).toBe('already-pending');
    expect(await as('other', () => failure(submitForReview(empty.id)))).toBe('not-found');
    expect(await as('other', () => failure(submitForReview(DHCP)))).toBe('no-access');
  });

  it('lets the author take it back, and only while it waits; the admins’ notice of it goes too', async () => {
    const note = await as('owner', () => createDocument({ title: 'Rút lại', body: 'Nội dung' }));
    await as('owner', () => submitForReview(note.id));
    const noticesOf = async (): Promise<number> => (await as('admin', () => fetchInbox({ kind: 'review' }))).notifications.filter((n) => n.documentId === note.id).length;
    expect(await noticesOf()).toBe(1);
    expect(await as('other', () => failure(withdrawSubmission(note.id)))).toBe('not-found');
    await as('owner', () => withdrawSubmission(note.id));
    expect(await noticesOf()).toBe(0);
    expect((await as('owner', () => fetchMyDocuments())).find((d) => d.id === note.id)?.status).toBe('draft');
    expect(await as('owner', () => failure(withdrawSubmission(note.id)))).toBe('not-pending');

    // Sent again while an admin has not read the first notice (sent back meanwhile): no second notice.
    await as('owner', () => submitForReview(note.id));
    await as('admin', () => decideReview(note.id, 'rejected', 'Chưa đủ.'));
    await as('owner', () => submitForReview(note.id));
    expect(await noticesOf()).toBe(1);
  });
});

describe('an admin’s verdict', () => {
  it('needs a reason to send back, which only the author and admins read', async () => {
    expect(await as('admin', () => failure(decideReview(SENT_BACK, 'changes_requested')))).toBe('invalid-body');
    expect(await as('owner', () => failure(decideReview(SENT_BACK, 'approved')))).toBe('admin-only');
    await as('admin', () => decideReview(SENT_BACK, 'changes_requested', 'Thêm link RFC 793 nhé.'));

    const told = (await as('owner', () => fetchInbox({ kind: 'review' }))).notifications[0];
    expect(told?.payload).toMatchObject({ kind: 'review', action: 'changes_requested', reason: 'Thêm link RFC 793 nhé.', title: 'TCP vs UDP bằng hình' });
    expect(told?.readAt).toBeNull();
    const own = (await as('owner', () => fetchMyDocuments())).find((d) => d.id === SENT_BACK);
    expect(own?.review).toMatchObject({ action: 'changes_requested', reason: 'Thêm link RFC 793 nhé.' });
    expect(await as('admin', () => failure(decideReview(SENT_BACK, 'approved')))).toBe('not-pending');
  });

  it('approves: published as a community text, its reasons still hidden from other readers', async () => {
    // Last changed long ago: approval starts its 180 days again (no stale notice right away).
    await server.database.db.update(documents).set({ updatedAt: new Date('2025-01-01T00:00:00Z') }).where(eq(documents.id, SENT_BACK));
    await as('owner', () => submitForReview(SENT_BACK));
    const decided = await as('admin', () => decideReview(SENT_BACK, 'approved'));
    expect(decided).toMatchObject({ status: 'approved', origin: 'community' });
    expect((await as('other', () => fetchDocument(SENT_BACK))).document.status).toBe('approved');
    const activity = await as('other', () => fetchHistory(SENT_BACK));
    expect(JSON.stringify(activity)).not.toContain('RFC 793');
    expect((await as('owner', () => fetchInbox({ kind: 'review' }))).notifications[0]?.payload).toMatchObject({ action: 'approved', reason: null });
    expect(await runStaleCheck(server.database.db, clock.now)).toBe(0);
  });

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
    expect(await as('admin', () => failure(updatePublished(DRAFT, { hidden: true })))).toBe('not-approved');
  });

  it('changes nothing of a text that is not published, whatever the patch holds', async () => {
    const before = await server.database.db.select().from(documents).where(eq(documents.id, DRAFT));
    const versions = await server.database.db.select().from(documentVersions).where(eq(documentVersions.documentId, DRAFT));
    expect(await as('admin', () => failure(updatePublished(DRAFT, { space: 'linux', title: 'Đổi tên', tags: ['x'], hidden: true })))).toBe('not-approved');
    expect(await server.database.db.select().from(documents).where(eq(documents.id, DRAFT))).toEqual(before);
    expect(await server.database.db.select().from(documentVersions).where(eq(documentVersions.documentId, DRAFT))).toHaveLength(versions.length);
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

describe('Jev’s scores stay with the submission event', () => {
  it('are recorded on the submitted event, never on the verdict', async () => {
    const events = await server.database.db.select().from(reviewEvents).where(eq(reviewEvents.documentId, DRAFT));
    expect(events.find((e) => e.action === 'submitted')?.jevScores).toMatchObject({ onTopic: 0.75 });
  });
});
