/** The sitemap lists what a guest can read: public Spaces and approved, shown texts, never a hidden or private one. */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { updateDocument } from '../../test/content-fixtures';
import { type TestServer, startTestServer } from '../../test/test-server';
import { documents } from '../db/schema';
import { seedDatabase } from '../db/seed-database';
import { sitemapXml } from './sitemap-routes';

let server: TestServer;

beforeAll(async () => {
  server = await startTestServer();
  await seedDatabase(server.database.db, 'owner-sub');
});

afterAll(async () => {
  await server.close();
});

describe('GET /sitemap.xml', () => {
  it('lists the Universe, the public Spaces and the texts a guest can read', async () => {
    const db = server.database.db;
    const rows = await db.select({ id: documents.id, status: documents.status, hidden: documents.hidden, type: documents.type }).from(documents);
    const readable = rows.filter((d) => d.status === 'approved' && !d.hidden && d.type !== 'journey');
    const [hiddenOne, privateOne] = readable;
    if (!hiddenOne || !privateOne) throw new Error('the seed has too few approved texts');
    await updateDocument(db, hiddenOne.id, { hidden: true });
    await updateDocument(db, privateOne.id, { status: 'private' });

    const res = await fetch(`${server.origin}/sitemap.xml`);
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toContain('application/xml');
    const xml = await res.text();
    expect(xml).toContain(`<loc>${server.origin}/u</loc>`);
    expect(xml).toContain(`<loc>${server.origin}/s/networking</loc>`);
    expect(xml).not.toMatch(/\/s\/personal-/);
    const listed = [...xml.matchAll(/\/d\/([0-9a-f-]{36})</g)].map((m) => m[1]);
    expect(listed.length).toBe(readable.length - 2);
    expect(listed).not.toContain(hiddenOne.id);
    expect(listed).not.toContain(privateOne.id);
    expect(listed).toContain(readable[2]?.id);
  });

  it('escapes what goes into the XML', () => {
    expect(sitemapXml('https://kb.test', [{ path: '/s/a&b', lastmod: new Date('2026-11-07T10:00:00Z') }])).toContain('<loc>https://kb.test/s/a&amp;b</loc><lastmod>2026-11-07</lastmod>');
  });
});
