/**
 * A hidden Space is gone for every reader: whatever endpoint a reader (guest, member, admin) calls, no text of the
 * Space shows up in the answer, neither by id nor by title.
 */
import { eq } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { type FakeIdp, startFakeIdp } from '../../test/fake-idp';
import { api, signIn } from '../../test/sign-in';
import { type TestServer, startTestServer } from '../../test/test-server';
import { documents, spaces } from '../db/schema';
import { seedDatabase, seedId } from '../db/seed-database';

const SECRET = 'test-secret-'.padEnd(40, 'x');
const doc = (key: string): string => seedId(`document:${key}`);

let idp: FakeIdp;
let server: TestServer;
const sessions: Record<'guest' | 'member' | 'admin', string | undefined> = { guest: undefined, member: undefined, admin: undefined };
let hiddenTexts: Array<{ id: string; title: string }> = [];
/** Titles only texts of the Space carry (a title another Space also uses proves nothing). */
let uniqueTitles: Set<string>;

/** Every read endpoint that takes a text, a Space or a list of texts, with a text of the Space where one is needed. */
function readPaths(id: string): string[] {
  return [
    `/api/documents/${id}`,
    `/api/documents/${id}/comments`,
    `/api/documents/${id}/history`,
    `/api/documents/${id}/links`,
    `/api/documents/${id}/versions/1`,
    `/api/documents/${id}/diff?from=1&to=1`,
    `/api/documents/${id}/share`,
    `/api/documents/${id}/edit`,
    `/api/link-suggestions?q=DHCP`,
    '/api/recent',
    '/api/spaces',
    '/api/spaces/networking',
    '/api/graph?space=networking',
    '/api/graph/suggestions?space=networking',
    '/api/search?q=DHCP&mode=keyword',
    '/api/search?q=ARP&mode=keyword',
    '/api/me/recent',
    '/api/me/favorites',
    '/api/files',
  ];
}

beforeAll(async () => {
  idp = await startFakeIdp({ clientId: 'kb-web', clientSecret: SECRET, sub: 'owner-sub' });
  server = await startTestServer({ AUTH_ISSUER: idp.issuer, AUTH_CLIENT_SECRET: SECRET, ADMIN_SUBS: 'admin-sub' });
  const db = server.database.db;
  await seedDatabase(db, 'owner-sub');
  sessions.member = await signIn(server);
  idp.setSub('admin-sub');
  sessions.admin = await signIn(server);
  const all = await db.select({ id: documents.id, title: documents.title, spaceId: documents.spaceId }).from(documents);
  hiddenTexts = all.filter((d) => d.spaceId === seedId('space:net'));
  const elsewhere = new Set(all.filter((d) => d.spaceId !== seedId('space:net')).map((d) => d.title));
  uniqueTitles = new Set(hiddenTexts.map((d) => d.title).filter((t) => !elsewhere.has(t)));
  await db.update(spaces).set({ hidden: true }).where(eq(spaces.id, seedId('space:net')));
});

afterAll(async () => {
  await server.close();
  await idp.close();
});

describe('a hidden Space', () => {
  it('has texts to hide in the seed', () => {
    expect(hiddenTexts.length).toBeGreaterThan(5);
    expect(hiddenTexts.map((t) => t.id)).toContain(doc('dhcp-spoof'));
  });

  for (const who of ['guest', 'member', 'admin'] as const) {
    it(`shows none of its texts to a ${who}, by id or by title`, async () => {
      const leaks: string[] = [];
      for (const path of readPaths(doc('dhcp-spoof'))) {
        const res = await api(server, path, sessions[who] ? { cookie: sessions[who] } : {});
        const text = await res.text();
        if (path.startsWith('/api/documents/') && !path.includes('link-suggestions') && res.status === 200) leaks.push(`${path} answered 200`);
        for (const t of hiddenTexts) {
          if (text.includes(t.id)) leaks.push(`${path} holds the id of "${t.title}"`);
          else if (uniqueTitles.has(t.title) && text.includes(JSON.stringify(t.title))) leaks.push(`${path} holds the title "${t.title}"`);
        }
      }
      expect(leaks).toEqual([]);
    });
  }
});
