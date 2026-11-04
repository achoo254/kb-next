import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { updateDocument } from '../../test/content-fixtures';
import { type FakeIdp, startFakeIdp } from '../../test/fake-idp';
import { api, signIn } from '../../test/sign-in';
import { type TestServer, startTestServer } from '../../test/test-server';
import { seedDatabase, seedId } from '../db/seed-database';
import type { CommentView, CommentsResponse, ProgressResponse } from './activity-routes';
import type { SpaceDetailResponse } from './content-routes';

const SECRET = 'test-secret-'.padEnd(40, 'x');
const doc = (key: string): string => seedId(`document:${key}`);

let idp: FakeIdp;
let server: TestServer;
let owner: string;
let reader: string;

async function call<T>(method: string, path: string, cookie?: string, body?: unknown): Promise<{ status: number; body: T }> {
  const res = await api(server, path, { method, ...(cookie ? { cookie } : {}), ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
  return { status: res.status, body: (await res.json()) as T };
}

beforeAll(async () => {
  idp = await startFakeIdp({ clientId: 'kb-web', clientSecret: SECRET, sub: 'owner-sub' });
  server = await startTestServer({ AUTH_ISSUER: idp.issuer, AUTH_CLIENT_SECRET: SECRET, ADMIN_SUBS: 'seed:dat' });
  await seedDatabase(server.database.db, 'owner-sub');
  owner = await signIn(server);
  idp.setSub('reader-sub');
  idp.setProfile({ name: 'Người Đọc' });
  reader = await signIn(server);
  await updateDocument(server.database.db, doc('icmp'), { hidden: true });
});

afterAll(async () => {
  await server.close();
  await idp.close();
});

describe('PUT /api/documents/:id/progress', () => {
  const progress = (body: unknown, key = 'dns', cookie = reader) => call<ProgressResponse>('PUT', `/api/documents/${doc(key)}/progress`, cookie, body);

  it('keeps the furthest point reached and the last passage read', async () => {
    expect(await progress({ progress: 40, anchor: 'phan-giai' })).toEqual({ status: 200, body: { progress: 40, anchor: 'phan-giai' } });
    // Scrolling back up: the percentage stays, the passage to resume moves.
    expect(await progress({ progress: 10, anchor: 'dns-la-gi' })).toEqual({ status: 200, body: { progress: 40, anchor: 'dns-la-gi' } });
    expect(await progress({ progress: 100 })).toEqual({ status: 200, body: { progress: 100, anchor: null } });
    const space = await call<SpaceDetailResponse>('GET', '/api/spaces/networking', reader);
    expect(space.body.collections[0]?.documents.find((d) => d.id === doc('dns'))?.readProgress).toBe(100);
  });

  it('rejects a guest, a bad body, an unknown passage, and documents the reader cannot read', async () => {
    expect(await progress({ progress: 5 }, 'dns', '')).toEqual({ status: 401, body: { error: 'sign-in-required' } });
    for (const body of [{}, { progress: 101 }, { progress: -1 }, { progress: 4.5 }, { progress: 5, extra: 1 }, { progress: 5, anchor: '' }]) {
      expect((await progress(body)).status, JSON.stringify(body)).toBe(400);
    }
    expect(await progress({ progress: 5, anchor: 'not-a-passage' })).toEqual({ status: 400, body: { error: 'unknown-anchor' } });
    expect(await progress({ progress: 5 }, 'dhcp-home')).toEqual({ status: 403, body: { error: 'no-access' } });
    expect(await progress({ progress: 5 }, 'icmp')).toEqual({ status: 403, body: { error: 'hidden' } });
    expect((await call('PUT', '/api/documents/nope/progress', reader, { progress: 5 })).status).toBe(404);
  });
});

describe('comments', () => {
  const list = (key: string, cookie?: string) => call<CommentsResponse>('GET', `/api/documents/${doc(key)}/comments`, cookie);
  const post = (key: string, body: unknown, cookie: string | undefined = reader) => call<CommentView>('POST', `/api/documents/${doc(key)}/comments`, cookie, body);

  it('lists the discussion of a published document, oldest first, with each author’s role (C11)', async () => {
    const { status, body } = await list('dhcp');
    expect(status).toBe(200);
    expect(body.open).toBe(true);
    expect(body.comments.map((c) => [c.author.name, c.author.role, c.body, c.mine])).toEqual([
      ['Minh', 'member', '@Linh mạng khác subnet thì DHCP relay chạy thế nào?', false],
      ['Linh', 'reviewer', 'Router chuyển tiếp gói Discover tới server. Mình sẽ thêm một đoạn về relay.', false],
    ]);
  });

  it('has no discussion on an unpublished document, even for its author, and refuses unreadable ones', async () => {
    expect(await list('dhcp-home', owner)).toEqual({ status: 200, body: { open: false, comments: [] } });
    expect(await post('dhcp-home', { body: 'note to self' }, owner)).toEqual({ status: 403, body: { error: 'comments-closed' } });
    expect(await list('dhcp-home', reader)).toEqual({ status: 403, body: { error: 'no-access' } });
    expect(await list('icmp', reader)).toEqual({ status: 403, body: { error: 'hidden' } });
  });

  it('adds a comment from a signed-in reader, trimmed, optionally on a passage', async () => {
    const created = await post('dhcp', { body: '  Cảm ơn, rõ rồi!  ', anchor: 'dora' });
    expect(created.status).toBe(201);
    expect(created.body).toMatchObject({ body: 'Cảm ơn, rõ rồi!', anchor: 'dora', mine: true, author: { name: 'Người Đọc', role: 'member' } });
    const after = await list('dhcp', reader);
    expect(after.body.comments.at(-1)?.id).toBe(created.body.id);
    // Seen by someone else: not theirs.
    expect((await list('dhcp', owner)).body.comments.at(-1)?.mine).toBe(false);
  });

  it('rejects a guest, an empty or too long text, and an unknown passage', async () => {
    expect(await post('dhcp', { body: 'hi' }, '')).toEqual({ status: 401, body: { error: 'sign-in-required' } });
    for (const body of [{ body: '   ' }, { body: 'x'.repeat(2001) }, { text: 'hi' }, { body: 'hi', anchor: 3 }]) {
      expect((await post('dhcp', body)).status, JSON.stringify(body).slice(0, 40)).toBe(400);
    }
    expect(await post('dhcp', { body: 'hi', anchor: 'nowhere' })).toEqual({ status: 400, body: { error: 'unknown-anchor' } });
  });
});
