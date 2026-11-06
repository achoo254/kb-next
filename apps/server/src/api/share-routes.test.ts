/**
 * Share links through the web app's own client (share-api.ts): only a published text gets one, from its author or an
 * admin; opening one works signed in or not, logs when and who (never the token); a wrong, revoked or expired link
 * says so; a text hidden since it was shared is "private" to anyone who may not read it; a link that allows remix
 * copies the text into the recipient's drafts.
 */
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { ApiError } from '../../../web/src/api/api-client';
import { createDocument, fetchMyDocuments, restoreFromTrash, trashDocument } from '../../../web/src/api/authoring-api';
import { fetchInbox } from '../../../web/src/api/notifications-api';
import { decideReview, keepPrivate, submitForReview, updatePublished } from '../../../web/src/api/review-api';
import { changeShareLink, createShareLink, fetchShare, openSharedLink, remixShared, revokeShareLink } from '../../../web/src/api/share-api';
import { type FakeIdp, startFakeIdp } from '../../test/fake-idp';
import { signIn } from '../../test/sign-in';
import { type TestServer, startTestServer } from '../../test/test-server';
import { eq } from 'drizzle-orm';
import { pruneShareOpenings } from '../access/share-links';
import { documents, shareLinkVisits, shareLinks } from '../db/schema';
import { seedDatabase, seedId } from '../db/seed-database';
import { markdownLinkText } from './share-routes';

const SECRET = 'test-secret-'.padEnd(40, 'x');
const DHCP = seedId('document:dhcp');
const PENDING = seedId('document:swap-ubuntu');
const DAY_MS = 24 * 60 * 60 * 1000;

let idp: FakeIdp;
let server: TestServer;
const clock = { now: new Date('2026-11-05T03:00:00Z') };
const sessions = { owner: '', admin: '', other: '', guest: '' };
let current = '';

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

const tokenOf = (path: string): string => path.replace(/^\/l\//, '');

/** A text of the owner's, sent for review and approved: published, as a member's text is. */
async function publishedText(title: string, body = '## Bước một\n\nMáy mới hỏi cả mạng.\n\n## Bước hai\n\nServer trả lời.'): Promise<string> {
  const doc = await as('owner', () => createDocument({ title, body }));
  await as('owner', () => submitForReview(doc.id));
  await as('admin', () => decideReview(doc.id, 'approved'));
  return doc.id;
}

beforeAll(async () => {
  idp = await startFakeIdp({ clientId: 'kb-web', clientSecret: SECRET, sub: 'owner-sub', profile: { name: 'Chủ Nhà' } });
  server = await startTestServer({ AUTH_ISSUER: idp.issuer, AUTH_CLIENT_SECRET: SECRET, ADMIN_SUBS: 'admin-sub' }, { submitLimitPer10Min: 100, shareOpenLimitPerMinute: 1000, shareManageLimitPerMinute: 1000 }, () => clock.now);
  await seedDatabase(server.database.db, 'owner-sub');
  sessions.owner = await signIn(server);
  idp.setSub('admin-sub');
  idp.setProfile({ name: 'Đạt' });
  sessions.admin = await signIn(server);
  idp.setSub('other-sub');
  idp.setProfile({ name: 'Linh' });
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

describe('making a link', () => {
  it('is only for a published text, and only for its author or an admin', async () => {
    // A text waiting for review: locked, no link.
    const pending = await as('owner', () => fetchShare(PENDING));
    expect(pending.shareable).toBe(false);
    expect(await as('owner', () => failure(createShareLink(PENDING, { expiry: 'none', access: 'view' })))).toBe('not-shareable');
    // Someone else's published text: readable, not theirs to share.
    expect(await as('other', () => failure(fetchShare(DHCP)))).toBe('no-access');
    expect(await as('other', () => failure(createShareLink(DHCP, { expiry: 'none', access: 'view' })))).toBe('no-access');
    // A private text of someone else: as if it did not exist.
    expect(await as('other', () => failure(fetchShare(PENDING)))).toBe('not-found');
    expect(await as('guest', () => failure(fetchShare(DHCP)))).toBe('sign-in-required');
    // An admin shares an official text.
    const made = await as('admin', () => createShareLink(DHCP, { expiry: '7d', access: 'view' }));
    expect(made.path).toMatch(/^\/l\/[A-Za-z0-9_-]{32}$/);
    expect(made.link).toMatchObject({ access: 'view', expiry: '7d', expired: false, revokedAt: null, last4: made.token.slice(-4) });
  });

  it('keeps one live link: a new one stops the old', async () => {
    const id = await publishedText('Một link mỗi bài');
    const first = await as('owner', () => createShareLink(id, { expiry: 'none', access: 'view' }));
    const second = await as('owner', () => createShareLink(id, { expiry: '30d', access: 'remix' }));
    expect(await as('guest', () => failure(openSharedLink(tokenOf(first.path))))).toBe('link-revoked');
    expect((await as('guest', () => openSharedLink(tokenOf(second.path)))).document.title).toBe('Một link mỗi bài');
    const view = await as('owner', () => fetchShare(id));
    expect(view.link).toMatchObject({ id: second.link.id, access: 'remix', expiry: '30d' });
  });
});

describe('opening a link', () => {
  it('lets a guest peek at the first section with something to read, past a one-line note', async () => {
    const lesson = 'Máy mới chưa có IP nên gửi một gói hỏi cả mạng, rồi chờ server trả lời với địa chỉ để dùng.';
    const id = await publishedText('Bài có dòng thời lượng', `Thời lượng ước tính: 30 phút.\n\n## Bước 1 — Hỏi cả mạng\n\n${lesson}`);
    const made = await as('owner', () => createShareLink(id, { expiry: 'none', access: 'view' }));
    const guest = await as('guest', () => openSharedLink(tokenOf(made.path)));
    expect(guest.document.peek).toEqual({ heading: 'Bước 1 — Hỏi cả mạng', text: lesson });
  });

  it('previews the text for a guest and logs who opened it and when, never the token', async () => {
    const id = await publishedText('Máy mới vào mạng');
    const made = await as('owner', () => createShareLink(id, { expiry: 'none', access: 'view' }));
    const token = tokenOf(made.path);

    const guest = await as('guest', () => openSharedLink(token));
    expect(guest).toMatchObject({ signedIn: false, canRemix: false, access: 'view' });
    expect(guest.document).toMatchObject({ id, title: 'Máy mới vào mạng', authorName: 'Chủ Nhà', sections: ['Bước một', 'Bước hai'] });
    expect(guest.document.peek?.text).toBe('Máy mới hỏi cả mạng.');
    const member = await as('other', () => openSharedLink(token));
    expect(member.signedIn).toBe(true);

    const view = await as('owner', () => fetchShare(id));
    expect(view.openings7d).toBe(2);
    const opened = view.history.filter((h) => h.kind === 'opened');
    expect(opened.map((h) => h.by)).toEqual(['Linh', null]);
    expect(view.history.map((h) => h.kind)).toEqual(['opened', 'opened', 'created', 'approved']);
    expect(view.history.find((h) => h.kind === 'approved')?.by).toBe('Đạt');
    expect(view.approverName).toBe('Đạt');

    // Nothing stored or answered carries the token: the link keeps its sha256 and last four characters only.
    expect(JSON.stringify(view)).not.toContain(token);
    const stored = JSON.stringify([...(await server.database.db.select().from(shareLinks)), ...(await server.database.db.select().from(shareLinkVisits))]);
    expect(stored).not.toContain(token);
    expect(stored).not.toContain(token.slice(0, 12));
  });

  it('answers a wrong or malformed token with not-found', async () => {
    expect(await as('guest', () => failure(openSharedLink('A'.repeat(32))))).toBe('not-found');
    expect(await as('guest', () => failure(openSharedLink('short')))).toBe('not-found');
    expect(await as('other', () => failure(openSharedLink('%3Cscript%3E')))).toBe('not-found');
  });

  it('turns off a revoked link and an expired one for good; a running link’s new expiry counts from the change', async () => {
    const start = clock.now;
    const id = await publishedText('Link có hạn');
    const made = await as('owner', () => createShareLink(id, { expiry: '7d', access: 'view' }));
    const token = tokenOf(made.path);
    clock.now = new Date(clock.now.getTime() + 6 * DAY_MS);
    // Running: 7 days from now, so it still opens on day 8, past the first 7 days.
    expect(await as('owner', () => changeShareLink(id, { expiry: '7d' }))).toMatchObject({ expiry: '7d', expired: false });
    clock.now = new Date(clock.now.getTime() + 2 * DAY_MS);
    expect((await as('guest', () => openSharedLink(token))).document.id).toBe(id);
    clock.now = new Date(clock.now.getTime() + 6 * DAY_MS);
    expect(await as('guest', () => failure(openSharedLink(token)))).toBe('link-expired');
    expect((await as('owner', () => fetchShare(id))).link?.expired).toBe(true);
    // Expired stays off: neither a new expiry nor a new access revives the old token.
    expect(await as('owner', () => failure(changeShareLink(id, { expiry: 'none' })))).toBe('link-expired');
    expect(await as('owner', () => failure(changeShareLink(id, { access: 'remix' })))).toBe('link-expired');
    expect(await as('guest', () => failure(openSharedLink(token)))).toBe('link-expired');
    await as('owner', () => revokeShareLink(id));
    expect(await as('guest', () => failure(openSharedLink(token)))).toBe('link-revoked');
    expect(await as('owner', () => failure(revokeShareLink(id)))).toBe('no-link');
    expect(await as('owner', () => failure(changeShareLink(id, { access: 'remix' })))).toBe('no-link');
    expect((await as('owner', () => fetchShare(id))).history.slice(0, 3).map((h) => h.kind)).toEqual(['revoked', 'opened', 'changed']);
    // Back to where the clock was: the other sessions of this file would be idle past 14 days.
    clock.now = new Date(start.getTime() + 60_000);
  });

  it('says "private" once the text is hidden, to anyone who may not read it, and the author sees why', async () => {
    const id = await publishedText('Bài sẽ bị ẩn');
    const made = await as('owner', () => createShareLink(id, { expiry: 'none', access: 'view' }));
    const token = tokenOf(made.path);
    await as('admin', () => updatePublished(id, { hidden: true }));
    expect(await as('guest', () => failure(openSharedLink(token)))).toBe('private');
    expect(await as('other', () => failure(openSharedLink(token)))).toBe('private');
    // Its author still reads it (an author's own opening is not counted).
    expect((await as('owner', () => openSharedLink(token))).document.id).toBe(id);
    const view = await as('owner', () => fetchShare(id));
    expect(view.shareable).toBe(false);
    expect(view.permission).toMatchObject({ hidden: true, by: 'Đạt' });
    expect(view.openings7d).toBe(0);
    expect(view.history[0]?.kind).toBe('hidden');
    expect(view.history.some((h) => h.kind === 'hidden')).toBe(true);
    // No new link while hidden; shown again, the old link works again.
    expect(await as('owner', () => failure(createShareLink(id, { expiry: 'none', access: 'view' })))).toBe('not-shareable');
    await as('admin', () => updatePublished(id, { hidden: false }));
    expect((await as('guest', () => openSharedLink(token))).document.id).toBe(id);
    const inbox = await as('owner', () => fetchInbox({ kind: 'permission' }));
    expect(inbox.notifications.length).toBeGreaterThanOrEqual(2);
  });
});

describe('remix', () => {
  it('copies the text into the recipient’s drafts, crediting it, only when the link allows it', async () => {
    const id = await publishedText('Bài để remix');
    const viewOnly = await as('owner', () => createShareLink(id, { expiry: 'none', access: 'view' }));
    expect((await as('other', () => openSharedLink(tokenOf(viewOnly.path)))).canRemix).toBe(false);
    expect(await as('other', () => failure(remixShared(tokenOf(viewOnly.path))))).toBe('remix-off');
    await as('owner', () => changeShareLink(id, { access: 'remix' }));
    expect((await as('other', () => openSharedLink(tokenOf(viewOnly.path)))).canRemix).toBe(true);
    expect((await as('guest', () => openSharedLink(tokenOf(viewOnly.path)))).canRemix).toBe(false);
    expect(await as('guest', () => failure(remixShared(tokenOf(viewOnly.path))))).toBe('sign-in-required');
    const copy = await as('other', () => remixShared(tokenOf(viewOnly.path)));
    const mine = await as('other', () => fetchMyDocuments());
    expect(mine.find((d) => d.id === copy)).toMatchObject({ title: 'Bài để remix', status: 'draft' });
  });
});

describe('keeping a text private (C04)', () => {
  it('takes a waiting text out of the queue, and never unpublishes one', async () => {
    const doc = await as('owner', () => createDocument({ title: 'Giữ riêng', body: 'Nội dung' }));
    await as('owner', () => submitForReview(doc.id, { lang: 'en' }));
    await as('owner', () => keepPrivate(doc.id, { tags: ['riêng'] }));
    const mine = (await as('owner', () => fetchMyDocuments())).find((d) => d.id === doc.id);
    expect(mine).toMatchObject({ status: 'private', lang: 'en' });
    const published = await publishedText('Đã đăng');
    expect(await as('owner', () => failure(keepPrivate(published)))).toBe('published');
  });
});

describe('a text leaving the published state', () => {
  it('revokes its links when it goes to the trash; taking it out does not revive them', async () => {
    const id = await publishedText('Bài vào thùng rác');
    const token = tokenOf((await as('owner', () => createShareLink(id, { expiry: 'none', access: 'view' }))).path);
    await as('admin', () => trashDocument(id));
    expect(await as('guest', () => failure(openSharedLink(token)))).toBe('link-revoked');
    await as('admin', () => restoreFromTrash(id));
    expect(await as('guest', () => failure(openSharedLink(token)))).toBe('link-revoked');
    expect((await as('owner', () => fetchShare(id))).link?.revokedAt).not.toBeNull();
  });

  it('revokes its links when it is sent back or rejected after a later submission', async () => {
    for (const decision of ['changes_requested', 'rejected'] as const) {
      const id = await publishedText(`Gửi lại rồi ${decision}`);
      const token = tokenOf((await as('owner', () => createShareLink(id, { expiry: 'none', access: 'view' }))).path);
      // Back in the queue (as a published text sent again would be), then sent back.
      await server.database.db.update(documents).set({ status: 'pending' }).where(eq(documents.id, id));
      await as('admin', () => decideReview(id, decision, 'Cần sửa nguồn.'));
      expect(await as('guest', () => failure(openSharedLink(token)))).toBe('link-revoked');
      // Approved again later: the old link stays off; sharing again means a new link.
      await server.database.db.update(documents).set({ status: 'pending' }).where(eq(documents.id, id));
      await as('admin', () => decideReview(id, 'approved'));
      expect(await as('guest', () => failure(openSharedLink(token)))).toBe('link-revoked');
    }
  });

  it('keeps one live link per text in the database too', async () => {
    const id = await publishedText('Một link sống');
    const made = await as('owner', () => createShareLink(id, { expiry: 'none', access: 'view' }));
    const [row] = await server.database.db.select().from(shareLinks).where(eq(shareLinks.id, made.link.id));
    if (!row) throw new Error('link missing');
    await expect(server.database.db.insert(shareLinks).values({ documentId: id, tokenHash: 'x'.repeat(64), createdBy: row.createdBy })).rejects.toThrow();
  });
});

describe('remix limits', () => {
  it('lets one account remix at most 10 times a minute', async () => {
    const id = await publishedText('Remix nhiều lần');
    const token = tokenOf((await as('owner', () => createShareLink(id, { expiry: 'none', access: 'remix' }))).path);
    const codes: string[] = [];
    for (let i = 0; i < 11; i += 1) codes.push(await as('other', () => remixShared(token).then(() => 'ok', (e: unknown) => (e instanceof ApiError ? e.code : 'other'))));
    // The remix test above spent one of this minute's ten.
    expect(codes.filter((c) => c === 'ok').length).toBeLessThanOrEqual(10);
    expect(codes.at(-1)).toBe('rate-limited');
  });

  it('offers no remix of a stored file', async () => {
    const id = await publishedText('Tệp lưu');
    const token = tokenOf((await as('owner', () => createShareLink(id, { expiry: 'none', access: 'remix' }))).path);
    await server.database.db.update(documents).set({ type: 'office' }).where(eq(documents.id, id));
    expect((await as('admin', () => openSharedLink(token))).canRemix).toBe(false);
    expect(await as('admin', () => failure(remixShared(token)))).toBe('not-remixable');
  });

  it('escapes the original’s title in the credit link', () => {
    expect(markdownLinkText('A](javascript:x) [b')).toBe('A\\]\\(javascript:x\\) \\[b');
  });
});

describe('openings', () => {
  it('counts recipients only: the author and admins checking the link are not counted', async () => {
    const id = await publishedText('Ai mở link');
    const token = tokenOf((await as('owner', () => createShareLink(id, { expiry: 'none', access: 'view' }))).path);
    await as('owner', () => openSharedLink(token));
    await as('admin', () => openSharedLink(token));
    expect((await as('owner', () => fetchShare(id))).openings7d).toBe(0);
    await as('guest', () => openSharedLink(token));
    expect((await as('owner', () => fetchShare(id))).openings7d).toBe(1);
  });

  it('forgets openings older than 90 days, keeping newer ones and what was done to the link', async () => {
    const id = await publishedText('Dọn lượt mở');
    const made = await as('owner', () => createShareLink(id, { expiry: 'none', access: 'view' }));
    const at = clock.now.getTime();
    const day = (n: number): Date => new Date(at - n * DAY_MS);
    await server.database.db.insert(shareLinkVisits).values([
      { shareLinkId: made.link.id, kind: 'opened', visitedAt: day(91) },
      { shareLinkId: made.link.id, kind: 'opened', visitedAt: day(89) },
      { shareLinkId: made.link.id, kind: 'changed', userId: null, detail: '7d|', visitedAt: day(120) },
    ]);
    expect(await pruneShareOpenings(server.database.db, new Date(at))).toBe(1);
    const left = await server.database.db.select().from(shareLinkVisits).where(eq(shareLinkVisits.shareLinkId, made.link.id));
    expect(left.map((v) => v.kind).sort()).toEqual(['changed', 'created', 'opened']);
  });
});
