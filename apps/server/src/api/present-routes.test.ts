/**
 * Viewings of the slides (C21): recorded for whoever may read the text, never for a text the viewer may not read,
 * checked at the boundary, limited per address, counted by the admin API, forgotten after their keeping time.
 */
import { eq } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { updateDocument } from '../../test/content-fixtures';
import { type FakeIdp, startFakeIdp } from '../../test/fake-idp';
import { api, signIn } from '../../test/sign-in';
import { type TestServer, startTestServer } from '../../test/test-server';
import { prunePresentViews } from '../access/present-views';
import { createToken } from '../admin/admin-tokens';
import { presentViews, users } from '../db/schema';
import { seedDatabase, seedId } from '../db/seed-database';
import { PRESENT_VIEWS_KEEP_DAYS } from '../retention';
import { PRESENT_VIEW_LIMIT_PER_MINUTE } from './present-routes';

const SECRET = 'test-secret-'.padEnd(40, 'x');
const doc = (key: string): string => seedId(`document:${key}`);

let idp: FakeIdp;
let server: TestServer;
let admin = '';
let token = '';

/** A viewing of the seed's text `key`, or of the raw id `{ id }`. */
const view = (key: string | { id: string }, body: unknown, cookie?: string): Promise<Response> =>
  api(server, `/api/documents/${typeof key === 'string' ? doc(key) : key.id}/present-views`, { method: 'POST', body: JSON.stringify(body), ...(cookie ? { cookie } : {}) });

const rows = async (key: string) => server.database.db.select().from(presentViews).where(eq(presentViews.documentId, doc(key)));

beforeAll(async () => {
  idp = await startFakeIdp({ clientId: 'kb-web', clientSecret: SECRET, sub: 'admin-sub' });
  server = await startTestServer({ AUTH_ISSUER: idp.issuer, AUTH_CLIENT_SECRET: SECRET, ADMIN_SUBS: 'admin-sub' });
  await seedDatabase(server.database.db, 'owner-sub');
  admin = await signIn(server);
  const [row] = await server.database.db.select({ id: users.id }).from(users).where(eq(users.sub, 'admin-sub'));
  token = (await createToken(server.database.db, row?.id ?? '', 'stats', new Date())).token;
  await updateDocument(server.database.db, doc('icmp'), { hidden: true });
});

afterAll(async () => {
  await server?.close();
  await idp?.close();
});

describe('POST /api/documents/:id/present-views', () => {
  it('records a guest viewing a public text, with nothing about the viewer', async () => {
    const res = await view('dhcp', { furthest: 4, total: 12 });
    expect(res.status).toBe(204);
    const [row] = await rows('dhcp');
    expect(row).toMatchObject({ furthest: 4, total: 12 });
    expect(Object.keys(row ?? {}).sort()).toEqual(['documentId', 'furthest', 'id', 'total', 'viewedAt']);
  });

  it('records a signed-in viewing too', async () => {
    expect((await view('dhcp', { furthest: 12, total: 12 }, admin)).status).toBe(204);
    expect(await rows('dhcp')).toHaveLength(2);
  });

  it('refuses what the viewer may not read, as the reader does, and records nothing', async () => {
    expect((await view('dhcp-home', { furthest: 1, total: 3 })).status).toBe(403);
    expect((await view('icmp', { furthest: 1, total: 3 })).status).toBe(403);
    expect((await view({ id: 'not-a-uuid' }, { furthest: 1, total: 3 })).status).toBe(404);
    expect(await rows('dhcp-home')).toHaveLength(0);
    expect(await rows('icmp')).toHaveLength(0);
  });

  it('checks the body', async () => {
    for (const body of [{}, { furthest: 0, total: 3 }, { furthest: 4, total: 3 }, { furthest: 1.5, total: 3 }, { furthest: 1, total: 1001 }, { furthest: 1, total: 3, who: 'x' }]) {
      expect((await view('dns', body)).status, JSON.stringify(body)).toBe(400);
    }
    expect(await rows('dns')).toHaveLength(0);
  });
});

describe('GET /api/admin/stats/present', () => {
  const stats = (query = '', bearer: string | null = token): Promise<Response> =>
    fetch(`${server.origin}/api/admin/stats/present${query}`, { headers: bearer ? { authorization: `Bearer ${bearer}` } : {} });

  it('counts the viewings and those that reached the end, by text', async () => {
    const res = await stats('?days=7');
    expect(res.status).toBe(200);
    const body = (await res.json()) as { days: number; opened: number; finished: number; byDocument: Array<{ id: string; opened: number; finished: number }> };
    expect(body).toMatchObject({ days: 7, opened: 2, finished: 1 });
    expect(body.byDocument).toEqual([expect.objectContaining({ id: doc('dhcp'), opened: 2, finished: 1, lang: 'vi' })]);
  });

  it('needs the admin token and a sane period', async () => {
    expect((await stats('', null)).status).toBe(401);
    expect((await stats('?days=0')).status).toBe(400);
    expect((await stats(`?days=${PRESENT_VIEWS_KEEP_DAYS + 1}`)).status).toBe(400);
  });
});

describe('keeping and limits', () => {
  it(`forgets viewings older than ${PRESENT_VIEWS_KEEP_DAYS} days`, async () => {
    const day = 24 * 60 * 60 * 1000;
    const forgotten = await prunePresentViews(server.database.db, new Date(Date.now() + (PRESENT_VIEWS_KEEP_DAYS + 1) * day));
    expect(forgotten).toBe(2);
    expect(await rows('dhcp')).toHaveLength(0);
  });

  it(`answers 429 past ${PRESENT_VIEW_LIMIT_PER_MINUTE} viewings a minute from one address`, async () => {
    const statuses: number[] = [];
    for (let i = 0; i < PRESENT_VIEW_LIMIT_PER_MINUTE; i += 1) statuses.push((await view('dhcp', { furthest: 1, total: 2 })).status);
    expect(statuses.filter((status) => status === 429)).not.toHaveLength(0);
    expect((await view('dhcp', { furthest: 1, total: 2 })).status).toBe(429);
  });
});
