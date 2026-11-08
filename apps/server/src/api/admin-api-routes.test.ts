/**
 * The admin API (token) and its management on the web session (A03): a token is shown once and stored as a hash;
 * a call without one, with a wrong one, a revoked one or one whose maker is no longer an admin is refused; calls are
 * limited per IP and logged without their token; a post is published at once as an official text, hidden when asked,
 * and the queue is readable with the token.
 */
import { createServer } from 'node:http';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { eq, inArray } from 'drizzle-orm';
import { ApiError } from '../../../web/src/api/api-client';
import { fetchDocument } from '../../../web/src/api/content-api';
import { createAdminToken, fetchAdminCalls, fetchAdminTokens, revokeAdminToken } from '../../../web/src/api/review-api';
import { type FakeIdp, startFakeIdp } from '../../test/fake-idp';
import { signIn } from '../../test/sign-in';
import { type TestServer, startTestServer } from '../../test/test-server';
import { hashToken, pruneCalls } from '../admin/admin-tokens';
import { createApp } from '../app';
import { adminApiCalls, adminTokens, documentVersions, documents } from '../db/schema';
import { seedDatabase, seedId } from '../db/seed-database';

/** A read of the admin API any valid token may make: the seed's DHCP text. */
const PROBE = `/api/admin/posts/${seedId('document:dhcp')}`;
const SECRET = 'test-secret-'.padEnd(40, 'x');
/** Above what the other tests call, so only the last one meets it. */
const LIMIT = 40;

let idp: FakeIdp;
let server: TestServer;
const sessions = { admin: '', other: '' };
let current = '';
let token = '';

/** A call as another server makes it: no Origin, no cookie, a bearer token when given. */
function call(path: string, init: { method?: string; token?: string | null; body?: unknown; authorization?: string } = {}): Promise<Response> {
  const headers = new Headers();
  if (init.authorization) headers.set('authorization', init.authorization);
  else if (init.token) headers.set('authorization', `Bearer ${init.token}`);
  if (init.body !== undefined) headers.set('content-type', 'application/json');
  return fetch(`${server.origin}${path}`, { method: init.method ?? 'GET', headers, body: init.body === undefined ? undefined : JSON.stringify(init.body) });
}

async function as<T>(who: keyof typeof sessions, fn: () => Promise<T>): Promise<T> {
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

const post = {
  title: 'ICMP Ping',
  lang: 'vi',
  collection: 'networking',
  tags: ['icmp', 'ping'],
  markdown: '# ICMP Ping\n\n## Echo\n\nping gửi Echo Request, máy kia trả Echo Reply.',
  source: 'ai',
  hidden: false,
};

beforeAll(async () => {
  idp = await startFakeIdp({ clientId: 'kb-web', clientSecret: SECRET, sub: 'admin-sub', profile: { name: 'Đạt' } });
  server = await startTestServer({ AUTH_ISSUER: idp.issuer, AUTH_CLIENT_SECRET: SECRET, ADMIN_SUBS: 'admin-sub' }, { adminApiLimitPerMinute: LIMIT });
  await seedDatabase(server.database.db, 'owner-sub');
  sessions.admin = await signIn(server);
  idp.setSub('other-sub');
  sessions.other = await signIn(server);
  const realFetch = globalThis.fetch;
  vi.stubGlobal('fetch', (path: string, init: RequestInit = {}) => {
    if (/^https?:/.test(path)) return realFetch(path, init);
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

describe('admin tokens (A03, web session)', () => {
  it('are made by admins only, shown once, stored as a hash', async () => {
    expect(await as('other', () => failure(createAdminToken('pipeline')))).toBe('admin-only');
    expect(await as('other', () => failure(fetchAdminTokens()))).toBe('admin-only');
    const created = await as('admin', () => createAdminToken('pipeline AI'));
    token = created.token;
    expect(token).toMatch(/^kf_admin_[A-Za-z0-9_-]{43}$/);
    expect(created.info).toMatchObject({ label: 'pipeline AI', last4: token.slice(-4), revokedAt: null, createdByName: 'Đạt' });
    const [row] = await server.database.db.select().from(adminTokens).where(eq(adminTokens.id, created.info.id));
    expect(row?.tokenHash).toBe(hashToken(token));
    expect(JSON.stringify(row)).not.toContain(token);
    expect(JSON.stringify(await as('admin', () => fetchAdminTokens()))).not.toContain(token);
  });
});

describe('the admin API (token)', () => {
  it('refuses a call without a token, with a wrong or malformed one', async () => {
    const none = await call(PROBE);
    expect(none.status).toBe(401);
    expect(await none.json()).toEqual({ error: 'token-required' });
    expect(none.headers.get('www-authenticate')).toBe('Bearer');
    const wrong = await call('/api/admin/posts', { method: 'POST', token: `kf_admin_${'x'.repeat(43)}`, body: post });
    expect([wrong.status, await wrong.json()]).toEqual([401, { error: 'invalid-token' }]);
    expect((await call(PROBE, { authorization: `Basic ${token}` })).status).toBe(401);
    // The web session is not a way in.
    const cookie = await fetch(`${server.origin}${PROBE}`, { headers: { cookie: sessions.admin, origin: server.origin } });
    expect(cookie.status).toBe(401);
  });

  it('publishes a post at once as an official text, made by AI, with no Origin', async () => {
    const res = await call('/api/admin/posts', { method: 'POST', token, body: post });
    expect(res.status).toBe(201);
    const created = (await res.json()) as { id: string; url: string; status: string; hidden: boolean };
    expect(created).toMatchObject({ status: 'approved', hidden: false, url: `${server.origin}/d/${created.id}` });
    const read = await as('other', () => fetchDocument(created.id));
    expect(read.document).toMatchObject({ title: 'ICMP Ping', origin: 'official', status: 'approved', space: { slug: 'networking' } });
    // The title is stored once, not repeated as the first heading of the body.
    expect(read.chunks.map((c) => c.heading)).toEqual(['Echo']);
    const [version] = await server.database.db.select().from(documentVersions).where(eq(documentVersions.documentId, created.id));
    expect(version).toMatchObject({ via: 'api', aiMade: true, version: 1 });

    const hidden = await call(`/api/admin/posts/${created.id}`, { method: 'PATCH', token, body: { hidden: true, title: 'ICMP Ping (cũ)' } });
    expect([hidden.status, await hidden.json()]).toEqual([200, { id: created.id, title: 'ICMP Ping (cũ)', status: 'approved', hidden: true }]);
    expect(await as('other', () => failure(fetchDocument(created.id)))).toBe('hidden');
  });

  it('reads a text and saves a new version of it, each call its own version', async () => {
    const created = (await (await call('/api/admin/posts', { method: 'POST', token, body: { ...post, source: 'human' } })).json()) as { id: string };
    const read = await call(`/api/admin/posts/${created.id}`, { token });
    const text = (await read.json()) as { title: string; version: number; rev: string; body: string };
    expect(text).toMatchObject({ title: 'ICMP Ping', version: 1, body: '## Echo\n\nping gửi Echo Request, máy kia trả Echo Reply.' });

    const body = `${text.body}\n\n## Reply\n\nMáy kia trả Echo Reply.`;
    const first = await call(`/api/admin/posts/${created.id}/text`, { method: 'PUT', token, body: { body, summary: 'Thêm mục Reply', baseRev: text.rev } });
    expect(first.status).toBe(200);
    expect(await first.json()).toMatchObject({ version: 2, changed: true });
    const second = await call(`/api/admin/posts/${created.id}/text`, { method: 'PUT', token, body: { title: 'ICMP: ping', body: `${body} Hết.`, source: 'ai' } });
    expect(await second.json()).toMatchObject({ version: 3, changed: true });
    const versions = await server.database.db.select().from(documentVersions).where(eq(documentVersions.documentId, created.id));
    expect(versions.map((v) => [v.version, v.via, v.summary, v.aiMade]).sort()).toEqual([
      [1, 'api', null, false],
      [2, 'api', 'Thêm mục Reply', false],
      [3, 'api', null, true],
    ]);
    const reread = await as('other', () => fetchDocument(created.id));
    expect(reread.document.title).toBe('ICMP: ping');
    expect(reread.chunks.map((c) => c.heading)).toEqual(['Echo', 'Reply']);

    const same = await call(`/api/admin/posts/${created.id}/text`, { method: 'PUT', token, body: { title: 'ICMP: ping', body: `${body} Hết.` } });
    expect(await same.json()).toMatchObject({ version: 3, changed: false });
    const stale = await call(`/api/admin/posts/${created.id}/text`, { method: 'PUT', token, body: { body: 'x', baseRev: text.rev } });
    expect([stale.status, ((await stale.json()) as { error: string }).error]).toEqual([409, 'stale']);
    const empty = await call(`/api/admin/posts/${created.id}/text`, { method: 'PUT', token, body: { body: '  ' } });
    expect(empty.status).toBe(400);
    const missing = await call(`/api/admin/posts/${seedId('document:nope')}`, { token });
    expect(missing.status).toBe(404);
  });

  it('checks the post and where it goes', async () => {
    const noTitle = await call('/api/admin/posts', { method: 'POST', token, body: { ...post, title: undefined } });
    expect([noTitle.status, await noTitle.json()]).toEqual([400, { error: 'invalid-body' }]);
    const nowhere = await call('/api/admin/posts', { method: 'POST', token, body: { ...post, collection: undefined } });
    expect([nowhere.status, await nowhere.json()]).toEqual([400, { error: 'space-required' }]);
    const unknown = await call('/api/admin/posts', { method: 'POST', token, body: { ...post, collection: 'no-such-space' } });
    expect(unknown.status).toBe(404);
    const missing = await call(`/api/admin/posts/${seedId('document:nope')}`, { method: 'PATCH', token, body: { hidden: true } });
    expect(missing.status).toBe(404);
  });

  it('makes a public Space once, refusing a slug that exists', async () => {
    const space = { slug: 'ky-nang', nameVi: 'Kỹ năng & học tập', nameEn: 'Skills & learning', tint: '#FBCFE8', glow: '#EC4899', art: '/art/orb-universe.webp', unitVi: 'bài', unitEn: 'articles', descriptionVi: 'Học cách học.' };
    const made = await call('/api/admin/spaces', { method: 'POST', token, body: space });
    expect([made.status, await made.json()]).toEqual([201, { slug: 'ky-nang' }]);
    const again = await call('/api/admin/spaces', { method: 'POST', token, body: space });
    expect([again.status, await again.json()]).toEqual([409, { error: 'slug-taken' }]);
    const personal = await call('/api/admin/spaces', { method: 'POST', token, body: { ...space, slug: 'personal-x' } });
    expect(personal.status).toBe(400);
    const placed = await call('/api/admin/posts', { method: 'POST', token, body: { ...post, collection: undefined, space: 'ky-nang' } });
    expect(placed.status).toBe(201);
  });

  it('makes a Collection in a public Space and publishes into it', async () => {
    const made = await call('/api/admin/collections', { method: 'POST', token, body: { space: 'networking', nameVi: 'Định tuyến', nameEn: 'Routing' } });
    expect(made.status).toBe(201);
    const { id, space } = (await made.json()) as { id: string; space: string };
    expect(space).toBe('networking');
    const placed = await call('/api/admin/posts', { method: 'POST', token, body: { ...post, title: 'Bảng định tuyến', collection: id } });
    expect(placed.status).toBe(201);
    const unknown = await call('/api/admin/collections', { method: 'POST', token, body: { space: 'no-such-space', nameVi: 'X' } });
    expect([unknown.status, await unknown.json()]).toEqual([404, { error: 'not-found' }]);
  });

  it('publishes another language of a text into its group, Space and Collection', async () => {
    const original = (await (await call('/api/admin/posts', { method: 'POST', token, body: { ...post, title: 'Giao thức NTP', markdown: '## Đồng hồ\n\nNTP đồng bộ giờ.' } })).json()) as { id: string };
    const twin = await call('/api/admin/posts', {
      method: 'POST',
      token,
      body: { title: 'The NTP protocol', lang: 'en', translationOf: original.id, markdown: '## Clocks\n\nNTP keeps clocks in sync.', source: 'ai' },
    });
    expect(twin.status).toBe(201);
    const { id } = (await twin.json()) as { id: string };
    const rows = await server.database.db.select().from(documents).where(inArray(documents.id, [original.id, id]));
    const [first, second] = [rows.find((r) => r.id === original.id), rows.find((r) => r.id === id)];
    expect(second).toMatchObject({ lang: 'en', aiTranslated: true, translationGroupId: original.id, spaceId: first?.spaceId, collectionId: first?.collectionId, status: 'approved' });
    const read = await as('other', () => fetchDocument(id));
    expect(read.document.translations).toEqual(['vi', 'en']);

    const again = await call('/api/admin/posts', { method: 'POST', token, body: { title: 'NTP again', lang: 'en', translationOf: original.id, markdown: 'x' } });
    expect([again.status, await again.json()]).toEqual([409, { error: 'translation-exists' }]);
    const sameLang = await call('/api/admin/posts', { method: 'POST', token, body: { title: 'NTP vi', lang: 'vi', translationOf: id, markdown: 'x' } });
    expect([sameLang.status, await sameLang.json()]).toEqual([409, { error: 'translation-exists' }]);
    const missing = await call('/api/admin/posts', { method: 'POST', token, body: { title: 'X', lang: 'en', translationOf: '6f1f6a52-1c6b-4d0c-9a43-0d3d6f3d2b11', markdown: 'x' } });
    expect([missing.status, await missing.json()]).toEqual([404, { error: 'not-found' }]);
  });

  it('has no review queue any more: authors publish their own texts', async () => {
    const res = await call('/api/admin/review', { token });
    expect([res.status, await res.json()]).toEqual([404, { error: 'not-found' }]);
  });

  it('logs the authenticated calls, failed ones under their own path, never a call without a valid token', async () => {
    await vi.waitFor(async () => expect((await as('admin', () => fetchAdminCalls())).length).toBeGreaterThanOrEqual(7));
    const calls = await as('admin', () => fetchAdminCalls());
    expect(calls.find((c) => c.status === 201 && c.document?.title === 'ICMP Ping')).toMatchObject({ method: 'POST', path: '/api/admin/posts', error: null, document: { title: 'ICMP Ping' } });
    expect(calls.filter((c) => c.status === 400).map((c) => [c.path, c.error])).toEqual(
      expect.arrayContaining([
        ['/api/admin/posts', 'invalid-body'],
        ['/api/admin/posts', 'space-required'],
      ]),
    );
    expect(calls.find((c) => c.status === 404 && c.method === 'PATCH')).toMatchObject({ path: `/api/admin/posts/${seedId('document:nope')}`, error: 'not-found' });
    expect(calls.filter((c) => c.status === 401)).toEqual([]);
    expect(calls.every((c) => !c.path.includes('/api/admin/api/'))).toBe(true);
    expect(JSON.stringify(calls)).not.toContain(token);
    expect(await as('other', () => failure(fetchAdminCalls()))).toBe('admin-only');
  });

  it('forgets calls older than 30 days in the daily housekeeping', async () => {
    const db = server.database.db;
    await db.insert(adminApiCalls).values({ method: 'GET', path: PROBE, status: 200, createdAt: new Date(Date.now() - 31 * 24 * 60 * 60 * 1000) });
    expect(await pruneCalls(db, new Date())).toBe(1);
    expect(await pruneCalls(db, new Date())).toBe(0);
  });

  it('refuses to change a text that is not published, before any change', async () => {
    const pending = seedId('document:swap-ubuntu');
    const res = await call(`/api/admin/posts/${pending}`, { method: 'PATCH', token, body: { title: 'Đổi', space: 'linux', hidden: true } });
    expect([res.status, await res.json()]).toEqual([409, { error: 'not-approved' }]);
    const [row] = await server.database.db.select().from(documents).where(eq(documents.id, pending));
    expect(row).toMatchObject({ title: 'Ghi chú: swap trên Ubuntu', hidden: false, status: 'pending' });
  });

  it('refuses a revoked token, and one whose maker is no longer an admin', async () => {
    const tokens = await as('admin', () => fetchAdminTokens());
    const live = tokens.find((t) => t.revokedAt === null);
    if (!live) throw new Error('no live token');
    await as('admin', () => revokeAdminToken(live.id));
    expect(await as('admin', () => failure(revokeAdminToken(live.id)))).toBe('not-found');
    const revoked = await call(PROBE, { token });
    expect([revoked.status, await revoked.json()]).toEqual([401, { error: 'invalid-token' }]);

    // A new token revokes the others; it stops working once its maker leaves ADMIN_SUBS.
    const fresh = (await as('admin', () => createAdminToken('again'))).token;
    expect((await call(PROBE, { token: fresh })).status).toBe(200);
    const other = createServer(createApp({ config: { ...server.config, adminSubs: new Set<string>() }, db: server.database.db, idp: null, jev: null }));
    await new Promise<void>((resolve) => other.listen(0, '127.0.0.1', resolve));
    const address = other.address();
    const port = typeof address === 'object' && address ? address.port : 0;
    const res = await fetch(`http://127.0.0.1:${port}${PROBE}`, { headers: { authorization: `Bearer ${fresh}` } });
    await new Promise<void>((resolve) => other.close(() => resolve()));
    expect([res.status, await res.json()]).toEqual([401, { error: 'invalid-token' }]);
  });

  it('limits calls per IP, wrong tokens included', async () => {
    let limited: Response | null = null;
    for (let i = 0; i < LIMIT + 2 && !limited; i += 1) {
      const res = await call(PROBE, { token: `kf_admin_${'y'.repeat(43)}` });
      if (res.status === 429) limited = res;
    }
    expect(limited).not.toBeNull();
    expect(await limited?.json()).toEqual({ error: 'rate-limited' });
  });
});
