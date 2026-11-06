/**
 * Workspace settings (C19) through the web app's own clients (workspace-api.ts, review-api.ts): roles an admin grants
 * and what each role may open (a reviewer the review queue, never A02, A03 or C19), bootstrap admins nobody changes,
 * removing an account and putting it back, invite links (hashed, expiring, revocable, raising a role never lowering
 * it), and the audit trail of all of it.
 */
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { and, eq, gt, isNull } from 'drizzle-orm';
import { ApiError } from '../../../web/src/api/api-client';
import { fetchMe } from '../../../web/src/api/content-api';
import { createAdminToken, decideReview, fetchAdminTokens, fetchPublished, fetchReviewQueue, submitForReview } from '../../../web/src/api/review-api';
import {
  acceptInvite,
  changeRole,
  createInvite,
  fetchAudit,
  fetchIntegrations,
  fetchInvite,
  fetchInviteInfo,
  fetchMembers,
  fetchSignInInfo,
  removeMember,
  restoreMember,
  revokeInvite,
} from '../../../web/src/api/workspace-api';
import { createDocument, createSpace } from '../../test/content-fixtures';
import { type FakeIdp, startFakeIdp } from '../../test/fake-idp';
import { cookieFrom, location, signIn } from '../../test/sign-in';
import { type TestServer, startTestServer } from '../../test/test-server';
import { createSession } from '../auth/session-store';
import { documentVersions, documents, inviteLinks, users } from '../db/schema';

const SECRET = 'test-secret-'.padEnd(40, 'x');
const DAY = 24 * 60 * 60 * 1000;

let idp: FakeIdp;
let server: TestServer;
const clock = { now: new Date('2026-11-05T03:00:00Z') };
const sessions: Record<'admin' | 'linh' | 'minh' | 'an', string> = { admin: '', linh: '', minh: '', an: '' };
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

async function idOf(sub: string): Promise<string> {
  const [row] = await server.database.db.select({ id: users.id }).from(users).where(eq(users.sub, sub));
  if (!row) throw new Error(`no account ${sub}`);
  return row.id;
}

/** The sign-in round trip of `sub`, answering where the callback sends the browser and the session it set, if any. */
async function trySignIn(sub: string): Promise<{ to: string; session: string | null }> {
  idp.setSub(sub);
  const start = await fetch(`${server.origin}/auth/login?return=/u`, { redirect: 'manual' });
  const consent = await fetch(location(start), { redirect: 'manual' });
  const callback = await fetch(location(consent), { redirect: 'manual', headers: { cookie: cookieFrom(start, 'kb_login') } });
  const set = callback.headers.getSetCookie().some((c) => c.startsWith('kb_session=') && !c.startsWith('kb_session=;'));
  return { to: location(callback), session: set ? cookieFrom(callback, 'kb_session') : null };
}

beforeAll(async () => {
  idp = await startFakeIdp({ clientId: 'kb-web', clientSecret: SECRET, sub: 'admin-sub', profile: { name: 'Đạt' } });
  server = await startTestServer({ AUTH_ISSUER: idp.issuer, AUTH_CLIENT_SECRET: SECRET, ADMIN_SUBS: 'admin-sub' }, {}, () => clock.now);
  sessions.admin = await signIn(server);
  idp.setSub('linh');
  sessions.linh = await signIn(server);
  idp.setSub('minh');
  sessions.minh = await signIn(server);
  idp.setSub('an');
  sessions.an = await signIn(server);
  const realFetch = globalThis.fetch;
  vi.stubGlobal('fetch', (path: string | URL, init: RequestInit = {}) => {
    if (typeof path !== 'string' || !path.startsWith('/')) return realFetch(path, init);
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

describe('members and roles', () => {
  it('lists the members for an admin, the bootstrap admin first and locked', async () => {
    const members = await as('admin', () => fetchMembers());
    expect(members).toHaveLength(4);
    expect(members[0]).toMatchObject({ name: 'Đạt', role: 'admin', bootstrap: true, you: true });
    expect(members.slice(1).every((m) => m.role === 'member' && !m.bootstrap && !m.you)).toBe(true);
  });

  it('refuses the workspace to members and reviewers', async () => {
    expect(await as('minh', () => failure(fetchMembers()))).toBe('admin-only');
    expect(await as('minh', () => failure(fetchAudit(null)))).toBe('admin-only');
    expect(await as('minh', () => failure(createInvite('member')))).toBe('admin-only');
  });

  it('lets a reviewer use the review queue (A01) but not A02, A03 or C19', async () => {
    const linh = await idOf('linh');
    expect(await as('linh', () => failure(fetchReviewQueue()))).toBe('reviewer-only');
    expect(await as('admin', () => changeRole(linh, 'reviewer'))).toMatchObject({ role: 'reviewer' });
    expect(await as('linh', () => fetchMe())).toMatchObject({ role: 'reviewer', isAdmin: false, canReview: true, roleLocked: false });

    // Minh writes a text and sends it: Linh sees it waiting, opens it and approves it.
    const db = server.database.db;
    const spaceId = await createSpace(db, 'networking');
    const minh = await idOf('minh');
    const text = await createDocument(db, { spaceId, authorId: minh, status: 'draft', title: 'DNS bằng hình' });
    await db.insert(documentVersions).values({ documentId: text, version: 1, markdown: '# DNS bằng hình\n\nTên miền thành địa chỉ.', editorId: minh, via: 'editor' });
    await as('minh', () => submitForReview(text));
    expect((await as('linh', () => fetchReviewQueue())).map((q) => q.id)).toContain(text);
    expect(await as('linh', () => decideReview(text, 'approved'))).toMatchObject({ status: 'approved' });

    expect(await as('linh', () => failure(fetchPublished()))).toBe('admin-only');
    expect(await as('linh', () => failure(fetchAdminTokens()))).toBe('admin-only');
    expect(await as('linh', () => failure(fetchMembers()))).toBe('admin-only');
  });

  it('never lets a reviewer decide on their own text; an admin still may', async () => {
    const db = server.database.db;
    const linh = await idOf('linh');
    const [space] = await db.select({ id: documents.spaceId }).from(documents).where(eq(documents.authorId, await idOf('minh')));
    if (!space) throw new Error('no space');
    const own = await createDocument(db, { spaceId: space.id, authorId: linh, status: 'draft', title: 'Bài của Linh' });
    await db.insert(documentVersions).values({ documentId: own, version: 1, markdown: '# Bài của Linh\n\nNội dung.', editorId: linh, via: 'editor' });
    await as('linh', () => submitForReview(own));
    expect((await as('linh', () => fetchReviewQueue())).map((q) => q.id)).not.toContain(own);
    expect(await as('linh', () => failure(decideReview(own, 'approved')))).toBe('own-text');
    expect((await as('admin', () => fetchReviewQueue())).map((q) => q.id)).toContain(own);
    expect(await as('admin', () => decideReview(own, 'approved'))).toMatchObject({ status: 'approved' });
  });

  it('makes an admin of another account, who still cannot change the bootstrap admin or itself', async () => {
    const an = await idOf('an');
    const admin = await idOf('admin-sub');
    expect(await as('admin', () => changeRole(an, 'admin'))).toMatchObject({ role: 'admin' });
    expect((await as('an', () => fetchMembers())).length).toBe(4);
    expect(await as('an', () => failure(changeRole(admin, 'member')))).toBe('locked');
    expect(await as('an', () => failure(removeMember(admin)))).toBe('locked');
    expect(await as('an', () => failure(changeRole(an, 'member')))).toBe('self');
    expect(await as('admin', () => failure(changeRole('00000000-0000-4000-8000-000000000000', 'member')))).toBe('not-found');
  });

  it('lets a token made by an admin by role act only while it is one', async () => {
    const an = await idOf('an');
    const { token } = await as('an', () => createAdminToken('pipeline'));
    const call = (): Promise<Response> => fetch(`${server.origin}/api/admin/review`, { headers: { authorization: `Bearer ${token}` } });
    expect((await call()).status).toBe(200);
    await as('admin', () => changeRole(an, 'member'));
    expect((await call()).status).toBe(401);
    expect(await as('an', () => failure(fetchMembers()))).toBe('admin-only');
  });
});

describe('removing an account', () => {
  it('signs it out, refuses its sign-ins and sends its waiting texts back to drafts, until it is put back', async () => {
    const db = server.database.db;
    const minh = await idOf('minh');
    const [space] = await db.select({ spaceId: documents.spaceId }).from(documents).where(eq(documents.authorId, minh));
    if (!space) throw new Error('no space');
    const waiting = await createDocument(db, { spaceId: space.spaceId, authorId: minh, status: 'pending', title: 'Chờ duyệt' });
    const published = await createDocument(db, { spaceId: space.spaceId, authorId: minh, status: 'approved', title: 'Đã duyệt' });

    const removed = await as('admin', () => removeMember(minh));
    expect(removed.removedAt).not.toBeNull();
    expect(await as('minh', () => failure(fetchMe()))).toBe('sign-in-required');
    const [w] = await db.select({ status: documents.status }).from(documents).where(eq(documents.id, waiting));
    const [p] = await db.select({ status: documents.status }).from(documents).where(eq(documents.id, published));
    expect([w?.status, p?.status]).toEqual(['draft', 'approved']);

    // A sign-in that passed its check just before the removal opens its session just after: it is worth nothing.
    const late = `kb_session=${await createSession(server.database.db, minh, new Date(), null)}`;
    expect((await fetch(`${server.origin}/api/me`, { headers: { cookie: late, origin: server.origin } })).status).toBe(401);
    expect((await fetch(`${server.origin}/api/me/notifications`, { headers: { cookie: late, origin: server.origin } })).status).toBe(401);

    const refused = await trySignIn('minh');
    expect(refused).toEqual({ to: '/login?login=removed', session: null });
    // Changing a removed account's role waits until it is put back.
    expect(await as('admin', () => failure(changeRole(minh, 'reviewer')))).toBe('removed');
    // Removed accounts are listed last.
    expect((await as('admin', () => fetchMembers())).at(-1)).toMatchObject({ id: minh });

    expect((await as('admin', () => restoreMember(minh))).removedAt).toBeNull();
    const back = await trySignIn('minh');
    expect(back.to).toBe('/u');
    sessions.minh = back.session ?? '';
    expect(await as('minh', () => fetchMe())).toMatchObject({ role: 'member' });
  });
});

describe('invite links', () => {
  it('shows a hashed, expiring link once, and one live link at a time', async () => {
    const first = await as('admin', () => createInvite('member'));
    expect(first.url).toBe(`${server.origin}/i/${first.token}`);
    expect(first.token).toMatch(/^[A-Za-z0-9_-]{32}$/);
    expect(new Date(first.invite.expiresAt).getTime() - clock.now.getTime()).toBe(7 * DAY);
    const [stored] = await server.database.db.select().from(inviteLinks).where(eq(inviteLinks.id, first.invite.id));
    expect(stored?.tokenHash).not.toContain(first.token);
    expect(stored?.last4).toBe(first.token.slice(-4));

    const second = await as('admin', () => createInvite('reviewer'));
    expect(await as('admin', () => fetchInvite())).toMatchObject({ id: second.invite.id, role: 'reviewer', last4: second.token.slice(-4) });
    expect(await as('an', () => failure(fetchInviteInfo(first.token)))).toBe('invite-off');
    expect(await as('an', () => fetchInviteInfo(second.token))).toMatchObject({ role: 'reviewer' });
    expect(await as('an', () => failure(fetchInviteInfo('x'.repeat(32))))).toBe('not-found');
  });

  it('raises the account that accepts it to the link’s role, never lowers it', async () => {
    const made = await as('admin', () => createInvite('reviewer'));
    expect(await as('an', () => acceptInvite(made.token))).toEqual({ role: 'reviewer', raised: true });
    expect(await as('an', () => fetchMe())).toMatchObject({ role: 'reviewer' });
    const member = await as('admin', () => createInvite('member'));
    expect(await as('an', () => acceptInvite(member.token))).toEqual({ role: 'member', raised: false });
    expect(await as('an', () => fetchMe())).toMatchObject({ role: 'reviewer' });
    expect(await as('admin', () => fetchInvite())).toMatchObject({ acceptedCount: 1 });
  });

  it('lets a reviewer link in once only, a member link any number of times', async () => {
    const reviewer = await as('admin', () => createInvite('reviewer'));
    expect(await as('minh', () => acceptInvite(reviewer.token))).toEqual({ role: 'reviewer', raised: true });
    expect(await as('admin', () => fetchInvite())).toBeNull();
    idp.setSub('newcomer');
    const newcomer = await signIn(server);
    current = newcomer;
    expect(await failure(acceptInvite(reviewer.token))).toBe('invite-off');
    expect(await as('minh', () => fetchMe())).toMatchObject({ role: 'reviewer' });
    const minh = await idOf('minh');
    await as('admin', () => changeRole(minh, 'member'));

    const member = await as('admin', () => createInvite('member'));
    current = newcomer;
    expect(await acceptInvite(member.token)).toEqual({ role: 'member', raised: false });
    expect(await as('linh', () => acceptInvite(member.token))).toEqual({ role: 'member', raised: false });
    expect(await as('admin', () => fetchInvite())).toMatchObject({ id: member.invite.id, acceptedCount: 2 });
  });

  it('keeps one live link when two are made at once', async () => {
    await Promise.all([as('admin', () => createInvite('member')), as('admin', () => createInvite('member'))]);
    const live = await server.database.db.select({ id: inviteLinks.id }).from(inviteLinks).where(and(isNull(inviteLinks.revokedAt), gt(inviteLinks.expiresAt, clock.now)));
    expect(live).toHaveLength(1);
  });

  it('stops working once revoked, expired, or its admin is no longer one', async () => {
    const revoked = await as('admin', () => createInvite('member'));
    await as('admin', () => revokeInvite(revoked.invite.id));
    expect(await as('admin', () => fetchInvite())).toBeNull();
    expect(await as('minh', () => failure(acceptInvite(revoked.token)))).toBe('invite-off');
    expect(await as('admin', () => failure(revokeInvite(revoked.invite.id)))).toBe('not-found');

    const expiring = await as('admin', () => createInvite('reviewer'));
    clock.now = new Date(clock.now.getTime() + 7 * DAY + 1000);
    expect(await as('minh', () => failure(acceptInvite(expiring.token)))).toBe('invite-off');

    const an = await idOf('an');
    await as('admin', () => changeRole(an, 'admin'));
    const byAn = await as('an', () => createInvite('reviewer'));
    await as('admin', () => changeRole(an, 'member'));
    expect(await as('minh', () => failure(acceptInvite(byAn.token)))).toBe('invite-off');
    expect(await as('minh', () => fetchMe())).toMatchObject({ role: 'member' });
  });
});

describe('the audit trail', () => {
  it('records roles, removals, invites, tokens and sign-ins, with a filter per kind', async () => {
    const all = await as('admin', () => fetchAudit(null));
    const actions = new Set(all.map((l) => l.action));
    for (const action of [
      'member.role-changed',
      'member.removed',
      'member.restored',
      'invite.created',
      'invite.revoked',
      'invite.accepted',
      'token.created',
      'account.signed-in',
      'review.approved',
    ]) {
      expect(actions, action).toContain(action);
    }
    const change = all.find((l) => l.action === 'member.role-changed');
    expect(change).toMatchObject({ category: 'members', actor: { name: 'Đạt' } });
    expect(change?.detail).toHaveProperty('to');
    expect(all.find((l) => l.action === 'review.approved' && l.subject === 'DNS bằng hình')).toMatchObject({ category: 'content' });
    // Newest first.
    expect(all.map((l) => l.at)).toEqual([...all.map((l) => l.at)].sort().reverse());

    const members = await as('admin', () => fetchAudit('members'));
    expect(members.length).toBeGreaterThan(0);
    expect(members.every((l) => l.category === 'members')).toBe(true);
    expect((await as('admin', () => fetchAudit('sign-in'))).every((l) => l.action === 'account.signed-in')).toBe(true);
  });
});

describe('read-only panels', () => {
  it('describe sign-in and the integrations without changing anything', async () => {
    expect(await as('admin', () => fetchSignInInfo())).toMatchObject({ issuer: idp.issuer, clientId: 'kb-web', enabled: true, reachable: true, idleDays: 14, absoluteDays: 30 });
    const integrations = await as('admin', () => fetchIntegrations());
    expect(integrations.map((i) => i.id)).toEqual(['jev', 'files', 'search']);
    // No Jev key and no Meilisearch in tests: both read as off, never as broken.
    expect(integrations.find((i) => i.id === 'jev')?.state).toBe('off');
    expect(integrations.find((i) => i.id === 'search')?.state).toBe('off');
    expect(await as('linh', () => failure(fetchSignInInfo()))).toBe('admin-only');
  });
});
