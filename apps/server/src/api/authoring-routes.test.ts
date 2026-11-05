/**
 * Writing on the seed, through the web app's own client (apps/web/src/api/authoring-api.ts, so the two sides cannot
 * drift): a new note is a draft only its author sees, `[[ ]]` links give backlinks to the author only, saves merge
 * within two minutes, an old copy never overwrites a newer save, nobody else can read, edit, restore, delete or
 * favourite someone's draft, published texts are locked for their author, the trash keeps 30 days, and Spaces and
 * Collections follow who may make them.
 */
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import {
  createCollection,
  createDocument,
  ensurePersonalSpace,
  fetchDocumentLinks,
  fetchEditable,
  fetchFavorites,
  fetchMyDocuments,
  fetchMyRecent,
  fetchTrash,
  restoreFromTrash,
  saveDocument,
  setFavorite,
  suggestLinks,
  trashDocument,
} from '../../../web/src/api/authoring-api';
import { ApiError } from '../../../web/src/api/api-client';
import { fetchDocument } from '../../../web/src/api/content-api';
import { fetchDiff, fetchHistory, fetchVersion, restoreVersion } from '../../../web/src/api/history-api';
import { type FakeIdp, startFakeIdp } from '../../test/fake-idp';
import { signIn } from '../../test/sign-in';
import { type TestServer, startTestServer } from '../../test/test-server';
import { MERGE_WINDOW_MS, TRASH_DAYS, purgeTrash } from '../access/authoring';
import { findDocument } from '../access/content';
import { sql } from 'drizzle-orm';
import { seedDatabase, seedId } from '../db/seed-database';

const SECRET = 'test-secret-'.padEnd(40, 'x');
const DHCP = seedId('document:dhcp');
const DAY = 24 * 60 * 60 * 1000;

let idp: FakeIdp;
let server: TestServer;
let clock = new Date('2026-11-05T03:00:00Z');
const sessions = { owner: '', other: '', admin: '' };
let current = '';
/** An account without a personal Space yet. */
let newcomer = '';

/** Runs `fn` as the browser of `who` (the web client's same-origin calls carry that session). */
async function as<T>(who: keyof typeof sessions, fn: () => Promise<T>): Promise<T> {
  current = sessions[who];
  return fn();
}

/** The API error code a call fails with. */
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
  idp = await startFakeIdp({ clientId: 'kb-web', clientSecret: SECRET, sub: 'owner-sub', profile: { name: 'Chủ' } });
  server = await startTestServer({ AUTH_ISSUER: idp.issuer, AUTH_CLIENT_SECRET: SECRET, ADMIN_SUBS: 'seed:dat' }, {}, () => clock);
  await seedDatabase(server.database.db, 'owner-sub');
  sessions.owner = await signIn(server);
  idp.setSub('other-sub');
  sessions.other = await signIn(server);
  idp.setSub('seed:dat');
  sessions.admin = await signIn(server);
  idp.setSub('newcomer');
  newcomer = await signIn(server);
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

describe('a new note', () => {
  it('is a draft in the personal Space that only its author can open', async () => {
    const created = await as('owner', () => createDocument({ title: 'Máy mới xin IP', body: 'Máy mới chưa có IP.' }));
    expect(created).toMatchObject({ title: 'Máy mới xin IP', body: 'Máy mới chưa có IP.', status: 'draft', origin: 'own', type: 'note', version: 1, planet: null });
    expect(created.space).toMatchObject({ kind: 'personal', nameVi: 'Vũ trụ của bạn' });
    expect(await as('owner', () => fetchDocument(created.id))).toMatchObject({ document: { status: 'draft' } });
    expect(await as('other', () => failure(fetchDocument(created.id)))).toBe('no-access');
    expect(await as('other', () => failure(fetchEditable(created.id)))).toBe('no-access');
  });

  it('gets a personal Space first when the account has none', async () => {
    current = newcomer;
    const created = await createDocument({ title: 'Đầu tiên' });
    expect(created.space.kind).toBe('personal');
    expect((await ensurePersonalSpace()).created).toBe(false);
  });

  it('may go into a public Space and one of its Collections, never into someone else’s personal Space', async () => {
    const inNetworking = await as('owner', () => createDocument({ title: 'Ghi chú mạng', space: 'networking', collection: seedId('collection:net:0') }));
    expect(inNetworking).toMatchObject({ status: 'draft', space: { slug: 'networking' }, collection: { nameVi: 'Giao thức nền tảng' } });
    expect(await as('owner', () => failure(createDocument({ space: 'networking', collection: seedId('collection:k8s:0') })))).toBe('unknown-collection');
    const ownerSpace = (await as('owner', () => ensurePersonalSpace())).space.slug;
    expect(await as('other', () => failure(createDocument({ space: ownerSpace })))).toBe('no-access');
  });
});

describe('[[ ]] links', () => {
  it('link the closest title, and DHCP shows the backlink to the author only until the note is published', async () => {
    const note = await as('owner', () => createDocument({ title: 'Ghi chú về DHCP', body: 'Xem [[DHCP]] và [[Không có bài này]].' }));
    expect((await as('owner', () => fetchDocumentLinks(note.id))).outgoing.map((d) => d.title)).toEqual(['Giao thức DHCP']);
    const forOwner = await as('owner', () => fetchDocument(DHCP));
    expect(forOwner.backlinks.map((l) => l.document.title)).toContain('Ghi chú về DHCP');
    const forOther = await as('other', () => fetchDocument(DHCP));
    expect(forOther.backlinks.map((l) => l.document.title)).not.toContain('Ghi chú về DHCP');
  });

  it('are suggested from titles the writer may read', async () => {
    const own = await as('owner', () => suggestLinks('DHCP'));
    expect(own[0]?.title).toBe('Giao thức DHCP');
    expect(own.map((d) => d.title)).toContain('DHCP trên router nhà');
    const other = await as('other', () => suggestLinks('DHCP'));
    expect(other.map((d) => d.title)).not.toContain('DHCP trên router nhà');
    expect(other.map((d) => d.title)).not.toContain('Ghi chú về DHCP');
  });
});

describe('saving', () => {
  it('updates the same version within two minutes, then starts a new one', async () => {
    const note = await as('owner', () => createDocument({ title: 'Lease', body: 'Một' }));
    clock = new Date(clock.getTime() + 60_000);
    const first = await as('owner', () => saveDocument(note.id, { title: 'Lease', body: 'Một hai', baseRev: note.rev }));
    expect(first).toMatchObject({ version: 1, changed: true, savedAt: clock.toISOString() });
    clock = new Date(clock.getTime() + MERGE_WINDOW_MS);
    const second = await as('owner', () => saveDocument(note.id, { title: 'Lease', body: 'Một hai ba', planet: 'teal', baseRev: first.rev }));
    expect(second.version).toBe(2);
    const same = await as('owner', () => saveDocument(note.id, { title: 'Lease', body: 'Một hai ba', planet: 'teal', baseRev: second.rev }));
    expect(same).toMatchObject({ version: 2, changed: false, rev: second.rev });
    expect(await as('owner', () => fetchEditable(note.id))).toMatchObject({ body: 'Một hai ba', planet: 'teal', version: 2 });
    expect((await as('owner', () => fetchHistory(note.id))).events.filter((e) => e.kind === 'version').map((e) => e.kind === 'version' && e.version)).toEqual([2, 1]);
    expect((await as('owner', () => fetchMyRecent())).map((d) => d.id)).toContain(note.id);
  });

  it('refuses a save made from an older copy, and keeps the newer text', async () => {
    const note = await as('owner', () => createDocument({ title: 'Hai tab', body: 'Gốc' }));
    clock = new Date(clock.getTime() + 1_000);
    await as('owner', () => saveDocument(note.id, { title: 'Hai tab', body: 'Tab một', baseRev: note.rev }));
    clock = new Date(clock.getTime() + 1_000);
    expect(await as('owner', () => failure(saveDocument(note.id, { title: 'Hai tab', body: 'Tab hai', baseRev: note.rev })))).toBe('stale');
    const latest = await as('owner', () => fetchEditable(note.id));
    expect(latest.body).toBe('Tab một');
    // Overwriting on purpose: from the current rev.
    await as('owner', () => saveDocument(note.id, { title: 'Hai tab', body: 'Tab hai', baseRev: latest.rev }));
    expect((await as('owner', () => fetchEditable(note.id))).body).toBe('Tab hai');
  });

  it('never lets anyone else read, edit, restore, delete or favourite a draft', async () => {
    const note = await as('owner', () => createDocument({ title: 'Riêng', body: 'Bí mật' }));
    const req = { title: 'Đè', body: 'Đè', baseRev: note.rev };
    expect(await as('other', () => failure(saveDocument(note.id, req)))).toBe('no-access');
    expect(await as('other', () => failure(trashDocument(note.id)))).toBe('no-access');
    expect(await as('other', () => failure(fetchHistory(note.id)))).toBe('no-access');
    expect(await as('other', () => failure(fetchVersion(note.id, 1)))).toBe('no-access');
    expect(await as('other', () => failure(fetchDiff(note.id, 1, 1)))).toBe('no-access');
    expect(await as('other', () => failure(restoreVersion(note.id, 1)))).toBe('no-access');
    expect(await as('other', () => failure(setFavorite(note.id, true)))).toBe('no-access');
    expect(await as('other', () => failure(fetchDocumentLinks(note.id)))).toBe('no-access');
    expect((await as('owner', () => fetchEditable(note.id))).body).toBe('Bí mật');
  });

  it('locks a text waiting for review or published for its author; an admin may still edit', async () => {
    // The owner's "So sánh ARP và NDP" waits for review.
    expect(await as('owner', () => failure(fetchEditable(seedId('document:arp-ndp'))))).toBe('locked');
    expect(await as('other', () => failure(fetchEditable(DHCP)))).toBe('no-access');
    const dhcp = await as('admin', () => fetchEditable(DHCP));
    expect(dhcp.body).toContain('## Broadcast là gì');
    expect(await as('owner', () => failure(fetchEditable(seedId('document:lab-notes'))))).toBe('not-editable');
  });
});

describe('the trash', () => {
  it('holds a deleted text for its author for 30 days, restores it, then deletes it for good', async () => {
    const note = await as('owner', () => createDocument({ title: 'Thùng rác', body: 'Tạm' }));
    await as('owner', () => trashDocument(note.id));
    expect(await as('owner', () => failure(fetchDocument(note.id)))).toBe('not-found');
    const trash = await as('owner', () => fetchTrash());
    const entry = trash.find((d) => d.id === note.id);
    expect(entry).toMatchObject({ deletedAt: clock.toISOString(), purgeAt: new Date(clock.getTime() + TRASH_DAYS * DAY).toISOString() });
    expect(await as('other', () => failure(restoreFromTrash(note.id)))).toBe('not-found');
    expect((await as('other', () => fetchTrash())).map((d) => d.id)).not.toContain(note.id);
    await as('owner', () => restoreFromTrash(note.id));
    expect((await as('owner', () => fetchDocument(note.id))).document.title).toBe('Thùng rác');

    await as('owner', () => trashDocument(note.id));
    const db = server.database.db;
    expect((await purgeTrash(db, new Date(clock.getTime() + (TRASH_DAYS - 1) * DAY))).documentIds).not.toContain(note.id);
    expect((await purgeTrash(db, new Date(clock.getTime() + (TRASH_DAYS + 1) * DAY))).documentIds).toContain(note.id);
    expect(await findDocument(db, { kind: 'user', userId: '00000000-0000-4000-8000-000000000000', isAdmin: true }, note.id)).toBeNull();
    expect((await as('owner', () => fetchTrash())).map((d) => d.id)).not.toContain(note.id);
  });
});

describe('who deletes and who brings back', () => {
  it('lets an author delete what is not published, and only an admin take back what an admin deleted', async () => {
    // Waiting for review: the author may withdraw it, and bring it back.
    await as('owner', () => trashDocument(seedId('document:arp-ndp')));
    expect((await as('owner', () => fetchTrash())).map((d) => d.title)).toContain('So sánh ARP và NDP');
    await as('owner', () => restoreFromTrash(seedId('document:arp-ndp')));
    // Published: only an admin removes it from the Universe.
    const published = await as('owner', () => createDocument({ title: 'Đã đăng' }));
    await server.database.db.execute(sql`update documents set status = 'approved' where id = ${published.id}`);
    expect(await as('owner', () => failure(trashDocument(published.id)))).toBe('no-access');

    const note = await as('owner', () => createDocument({ title: 'Vi phạm' }));
    await as('admin', () => trashDocument(note.id));
    // The author's trash holds only what the author deleted; an admin's deletion is the admin's to undo.
    expect((await as('owner', () => fetchTrash())).map((d) => d.id)).not.toContain(note.id);
    expect(await as('owner', () => failure(restoreFromTrash(note.id)))).toBe('not-found');
    expect((await as('admin', () => fetchTrash())).map((d) => d.id)).toContain(note.id);
    await as('admin', () => restoreFromTrash(note.id));
    expect((await as('owner', () => fetchEditable(note.id))).title).toBe('Vi phạm');
  });
});

describe('what a save refuses and links', () => {
  it('refuses a title with a line break, and a public Space taking a personal Space’s slug', async () => {
    expect(await as('owner', () => failure(createDocument({ title: 'A\n\n## B' })))).toBe('invalid-body');
    const res = await as('admin', () =>
      globalThis.fetch('/api/spaces', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ slug: 'personal-someone', nameVi: 'X', nameEn: 'X', tint: '#FFFFFF', glow: '#FFFFFF', art: '/art/x.webp', unitVi: 'bài', unitEn: 'docs' }),
      }),
    );
    expect(res.status).toBe(400);
  });

  it('saves headings that repeat, as numbered anchors (Ví dụ, Ví dụ, Ví dụ 2)', async () => {
    const note = await as('owner', () => createDocument({ title: 'Ví dụ lặp', body: '## Ví dụ\n\na\n\n## Ví dụ\n\nb\n\n## Ví dụ 2\n\nc' }));
    expect((await as('owner', () => fetchDocument(note.id))).chunks.map((c) => c.anchor)).toEqual(['vi-du', 'vi-du-2', 'vi-du-2-2']);
  });

  it('links [[ ]] as the author can read, also when an admin edits', async () => {
    // Another member's private draft has the exact title; the admin could open it, the author cannot.
    await as('other', () => createDocument({ title: 'Giao thức ARP mới' }));
    const official = await as('admin', () => fetchEditable(seedId('document:k8s-build')));
    await as('admin', () => saveDocument(official.id, { title: official.title, body: `${official.body}\n\nXem [[Giao thức ARP mới]] và [[Giao thức ARP]].`, baseRev: official.rev }));
    const links = await as('admin', () => fetchDocumentLinks(official.id));
    expect(links.outgoing.map((d) => d.title)).toEqual(['Giao thức ARP']);
  });
});

describe('favourites and own documents', () => {
  it('lists favourites the account may read and marks them in its own list', async () => {
    // Start from none: the seed's favourites of C08 aside.
    for (const doc of await as('owner', () => fetchFavorites())) await as('owner', () => setFavorite(doc.id, false));
    await as('owner', () => setFavorite(DHCP, true));
    clock = new Date(clock.getTime() + 1_000);
    const dhcpHome = seedId('document:dhcp-home');
    await as('owner', () => setFavorite(dhcpHome, true));
    expect((await as('owner', () => fetchFavorites())).map((d) => d.title)).toEqual(['DHCP trên router nhà', 'Giao thức DHCP']);
    const mine = await as('owner', () => fetchMyDocuments({ type: 'note' }));
    expect(mine.find((d) => d.id === dhcpHome)).toMatchObject({ favorite: true, status: 'private' });
    expect(mine.every((d) => d.type === 'note')).toBe(true);
    await as('owner', () => setFavorite(DHCP, false));
    expect((await as('owner', () => fetchFavorites())).map((d) => d.title)).toEqual(['DHCP trên router nhà']);
    expect((await as('owner', () => fetchMyDocuments({ status: 'pending' }))).map((d) => d.title)).toEqual(['So sánh ARP và NDP', 'Ghi chú: swap trên Ubuntu']);
  });
});

describe('Spaces and Collections', () => {
  it('lets a member add Collections to their own Space only; admins add anywhere and make public Spaces', async () => {
    const own = (await as('owner', () => ensurePersonalSpace())).space.slug;
    expect(await as('owner', () => createCollection(own, 'Ghi chú lab'))).toMatchObject({ nameVi: 'Ghi chú lab', nameEn: 'Ghi chú lab', spaceSlug: own });
    expect(await as('owner', () => failure(createCollection('networking', 'Của tôi')))).toBe('no-access');
    expect(await as('admin', () => createCollection('networking', 'Bảo mật', 'Security'))).toMatchObject({ nameEn: 'Security' });

    const space = { slug: 'security', nameVi: 'Bảo mật', nameEn: 'Security', tint: '#FCA5A5', glow: '#EF4444', art: '/art/crystal-docker.webp', unitVi: 'bài', unitEn: 'articles' };
    const post = (who: keyof typeof sessions) =>
      as(who, () => globalThis.fetch('/api/spaces', { method: 'POST', body: JSON.stringify(space), headers: { 'content-type': 'application/json' } }));
    expect((await post('owner')).status).toBe(403);
    expect((await post('admin')).status).toBe(201);
    expect((await post('admin')).status).toBe(409);
  });
});
