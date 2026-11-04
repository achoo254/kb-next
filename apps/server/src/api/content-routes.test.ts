import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createDocument, createLink, updateDocument } from '../../test/content-fixtures';
import { type FakeIdp, startFakeIdp } from '../../test/fake-idp';
import { api, signIn } from '../../test/sign-in';
import { type TestServer, startTestServer } from '../../test/test-server';
import { seedDatabase, seedId } from '../db/seed-database';
import type { DocumentResponse, SpaceDetailResponse, SpaceListItem } from './content-routes';
import type { DocumentSummary } from './content-views';

const SECRET = 'test-secret-'.padEnd(40, 'x');
const doc = (key: string): string => seedId(`document:${key}`);

let idp: FakeIdp;
let server: TestServer;
/** Owns the seed's personal Space, private and pending notes. */
let owner: string;
let ownerId: string;
/** Another member: sees only what is published. */
let stranger: string;
let admin: string;

async function get<T>(path: string, cookie?: string): Promise<{ status: number; body: T }> {
  const res = await api(server, path, cookie ? { cookie } : {});
  return { status: res.status, body: (await res.json()) as T };
}

beforeAll(async () => {
  idp = await startFakeIdp({ clientId: 'kb-web', clientSecret: SECRET, sub: 'owner-sub' });
  server = await startTestServer({ AUTH_ISSUER: idp.issuer, AUTH_CLIENT_SECRET: SECRET, ADMIN_SUBS: 'admin-sub' });
  ownerId = (await seedDatabase(server.database.db, 'owner-sub')).ownerId;
  owner = await signIn(server);
  idp.setSub('stranger-sub');
  stranger = await signIn(server);
  idp.setSub('admin-sub');
  admin = await signIn(server);

  // An English AI translation of ARP; a private note linking to DHCP; a hidden lab; a document in the trash.
  const db = server.database.db;
  const group = doc('arp');
  await updateDocument(db, doc('arp'), { translationGroupId: group });
  await createDocument(db, {
    id: seedId('document:arp:en'),
    spaceId: seedId('space:net'),
    collectionId: seedId('collection:net:0'),
    authorId: ownerId,
    title: 'The ARP protocol',
    type: 'lab',
    lang: 'en',
    origin: 'official',
    translationGroupId: group,
    aiTranslated: true,
    sortOrder: 0,
    texts: ['ARP finds the MAC address of an IP address on the local network.'],
  });
  await createLink(db, doc('dhcp-home'), doc('dhcp'));
  await updateDocument(db, doc('icmp'), { hidden: true });
  await updateDocument(db, doc('osi'), { deletedAt: new Date() });
});

afterAll(async () => {
  await server.close();
  await idp.close();
});

describe('GET /api/spaces', () => {
  it('lists the Universe of C09 in order, with the reader’s personal Space, counts and collections', async () => {
    const { status, body } = await get<{ spaces: SpaceListItem[] }>('/api/spaces', owner);
    expect(status).toBe(200);
    expect(body.spaces.map((s) => s.nameVi)).toEqual(['Networking', 'Kubernetes', 'Linux', 'Observability', 'Docker', 'Học hàng tuần', 'Vũ trụ của bạn']);
    const [net] = body.spaces;
    expect(net).toMatchObject({ slug: 'networking', nameEn: 'Networking', tint: '#C4B5FD', glow: '#8B5CF6', art: '/art/crystal-networking.webp', kind: 'public' });
    // 8 labs (one hidden by an admin, one in the trash: 6) + 4 notes + 1 path + 1 file; ARP and its translation
    // count once.
    expect(net?.documentCount).toBe(12);
    expect(net?.collectionCount).toBe(4);
    expect(net?.collections.map((c) => c.nameVi)).toEqual(['Giao thức nền tảng', 'Web', 'Địa chỉ', 'Hành trình gói tin']);
    // No TYPESAFE_API_KEY in tests: the plain count.
    expect(net?.caption).toEqual({ vi: '12 bài', en: '12 docs' });
    expect(body.spaces.at(-1)).toMatchObject({ kind: 'personal', slug: `personal-${ownerId}`, documentCount: 3 });
  });

  it('shows a guest and another member only the public Spaces and published documents', async () => {
    for (const cookie of [undefined, stranger]) {
      const { body } = await get<{ spaces: SpaceListItem[] }>('/api/spaces', cookie);
      expect(body.spaces).toHaveLength(6);
      expect(body.spaces.some((s) => s.kind === 'personal')).toBe(false);
      // 6 labs + the two community notes + the path.
      expect(body.spaces[0]?.documentCount).toBe(9);
    }
  });
});

describe('GET /api/spaces/:slug', () => {
  it('gives C10: collections in order with their documents, origins and authors, and the related Spaces', async () => {
    const { status, body } = await get<SpaceDetailResponse>('/api/spaces/networking', owner);
    expect(status).toBe(200);
    expect(body.space).toMatchObject({ slug: 'networking', collectionCount: 4, documentCount: 12 });
    const [core, web] = body.collections;
    expect(core?.documents.map((d) => d.title)).toEqual([
      'Giao thức ARP',
      'Giao thức DHCP',
      'Tìm hiểu giao thức DNS',
      'Ghi chú: DHCP giả mạo',
      'DHCP trên router nhà',
      'So sánh ARP và NDP',
    ]);
    expect(core?.documentCount).toBe(6);
    const spoof = core?.documents.find((d) => d.title === 'Ghi chú: DHCP giả mạo');
    expect(spoof).toMatchObject({ origin: 'community', status: 'approved', type: 'note', authorName: 'Minh', lang: 'vi', translations: ['vi'] });
    expect(core?.documents.find((d) => d.title === 'So sánh ARP và NDP')).toMatchObject({ origin: 'community', status: 'pending' });
    expect(core?.documents[0]).toMatchObject({ id: doc('arp'), translations: ['vi', 'en'], space: { slug: 'networking' } });
    expect(web?.documents.map((d) => d.title)).toEqual(['Tìm hiểu HTTP', 'TCP vs UDP', 'HTTP/3 bằng hình']);
    expect(body.collections[3]?.documents.map((d) => d.title)).toEqual(['Máy mới vào mạng']);
    expect(body.uncollected).toEqual([]);
    // Linked from Linux (syslog) and Observability (VictoriaLogs), as C10 shows.
    expect(body.related.map((s) => [s.slug, s.relevance])).toEqual([
      ['linux', 60],
      ['observability', 60],
    ]);
    // The owner's reading progress, as C10's rows show it.
    expect(core?.documents.map((d) => d.readProgress)).toEqual([100, 72, 0, 0, 45, 0]);
  });

  it('lists the members of C10 from real data, and what the viewer may do', async () => {
    const { body } = await get<SpaceDetailResponse>('/api/spaces/networking', owner);
    const byName = (name: string) => body.members.find((m) => m.name === name);
    // Authors of published documents, with the reviewers and admins (ADMIN_SUBS) even when they wrote nothing here.
    expect(byName('Đạt')).toEqual({ name: 'Đạt', picture: null, role: 'member', documentCount: 7 });
    expect(byName('Minh')).toMatchObject({ role: 'member', documentCount: 1 });
    expect(byName('An')).toMatchObject({ role: 'member', documentCount: 1 });
    expect(byName('Linh')).toMatchObject({ role: 'reviewer', documentCount: 0 });
    expect(body.members[0]?.role).toBe('admin');
    expect(body.members.map((m) => m.role)).toEqual([...body.members.map((m) => m.role)].sort((a, b) => ['owner', 'admin', 'reviewer', 'member'].indexOf(a) - ['owner', 'admin', 'reviewer', 'member'].indexOf(b)));
    expect(body.permissions).toEqual({ canCreate: true, canReview: false, canAdmin: false });
    expect((await get<SpaceDetailResponse>('/api/spaces/networking', admin)).body.permissions).toEqual({ canCreate: true, canReview: true, canAdmin: true });
    expect((await get<SpaceDetailResponse>('/api/spaces/networking')).body.permissions).toEqual({ canCreate: false, canReview: false, canAdmin: false });

    const personal = await get<SpaceDetailResponse>(`/api/spaces/personal-${ownerId}`, owner);
    expect(personal.body.members).toEqual([{ name: null, picture: null, role: 'owner', documentCount: 0 }]);
    expect(personal.body.permissions).toEqual({ canCreate: true, canReview: false, canAdmin: true });
  });

  it('gives each text in the reader’s language', async () => {
    const { body } = await get<SpaceDetailResponse>('/api/spaces/networking?lang=en', owner);
    const [first] = body.collections[0]?.documents ?? [];
    expect(first).toMatchObject({ id: seedId('document:arp:en'), title: 'The ARP protocol', lang: 'en', aiTranslated: true, translations: ['vi', 'en'] });
    expect(body.collections[0]?.documents).toHaveLength(6);
  });

  it('leaves out other people’s private and pending documents', async () => {
    const { body } = await get<SpaceDetailResponse>('/api/spaces/networking', stranger);
    const titles = body.collections.flatMap((c) => c.documents.map((d) => d.title));
    expect(titles).toContain('Ghi chú: DHCP giả mạo');
    expect(titles).not.toContain('DHCP trên router nhà');
    expect(titles).not.toContain('So sánh ARP và NDP');
    expect(titles).not.toContain('subnet.xlsx');
  });

  it('lists the personal Space’s files outside collections for its owner, and refuses it to anyone else', async () => {
    const slug = `personal-${ownerId}`;
    const mine = await get<SpaceDetailResponse>(`/api/spaces/${slug}`, owner);
    expect(mine.status).toBe(200);
    expect(mine.body.uncollected.map((d) => d.title)).toEqual(['lab-notes.docx', 'subnet.xlsx', 'k8s-intro.pptx']);
    for (const cookie of [stranger, admin, undefined]) {
      const res = await get<unknown>(`/api/spaces/${slug}`, cookie);
      expect(res.status).toBe(403);
      expect(res.body).toEqual({ error: 'no-access' });
    }
  });

  it('answers 404 for an unknown or malformed slug, 400 for an unknown language', async () => {
    expect(await get('/api/spaces/no-such-space', owner)).toEqual({ status: 404, body: { error: 'not-found' } });
    expect(await get('/api/spaces/Bad%20Slug', owner)).toEqual({ status: 404, body: { error: 'not-found' } });
    expect(await get('/api/spaces/networking?lang=fr', owner)).toEqual({ status: 400, body: { error: 'invalid-query' } });
  });
});

describe('GET /api/documents/:id', () => {
  it('gives C11: meta, table of contents, chunks, links, related documents and versions', async () => {
    const { status, body } = await get<DocumentResponse>(`/api/documents/${doc('dhcp')}`, stranger);
    expect(status).toBe(200);
    expect(body.lang).toBe('vi');
    expect(body.translationAvailable).toBe(true);
    expect(body.document).toMatchObject({
      id: doc('dhcp'),
      title: 'Giao thức DHCP',
      type: 'lab',
      origin: 'official',
      lang: 'vi',
      aiTranslated: false,
      authorName: 'Đạt',
      readingMinutes: 1,
      reviewedBy: null,
      sourceUrl: null,
      collection: { id: seedId('collection:net:0'), nameVi: 'Giao thức nền tảng' },
      space: { slug: 'networking', nameVi: 'Networking', kind: 'public' },
    });
    expect(body.translations).toEqual([{ id: doc('dhcp'), lang: 'vi', aiTranslated: false }]);
    expect(body.toc).toEqual([
      { anchor: 'dhcp-la-gi', title: 'DHCP là gì', level: 2 },
      { anchor: 'dora', title: 'DORA 4 bước', level: 2 },
      { anchor: 'thoi-han-thue', title: 'Thời hạn thuê', level: 2 },
    ]);
    expect(body.chunks[1]).toMatchObject({ anchor: 'dora', heading: 'DORA 4 bước' });
    expect(body.chunks[1]?.markdown).toContain('Discover, Offer, Request, Acknowledge');
    expect(body.outgoing.map((l) => l.document.title)).toEqual(['Giao thức ARP']);
    // The owner's private note links here too, but another member never learns of it.
    expect(body.backlinks.map((l) => l.document.title).sort()).toEqual(['Ghi chú: DHCP giả mạo', 'Máy mới vào mạng', 'Đọc log hệ thống với syslog']);
    expect(body.backlinks.find((l) => l.kind === 'relation')).toMatchObject({ label: 'bước 1', document: { type: 'journey' } });
    // Scored in code: linked + same collection + shared words first; the hidden ICMP lab never shows.
    expect(body.related.map((d) => [d.title, d.relevance])).toEqual([
      ['Giao thức ARP', 75],
      ['Ghi chú: DHCP giả mạo', 62],
      ['Máy mới vào mạng', 62],
      ['Đọc log hệ thống với syslog', 40],
      ['Tìm hiểu giao thức DNS', 34],
    ]);
    expect(body.versions).toEqual([{ version: 1, editorName: 'Đạt', createdAt: expect.any(String) as string }]);
    // Another member has not started it; a guest has no progress at all.
    expect(body.document).toMatchObject({ readProgress: 0, readAnchor: null });
    const guest = await get<DocumentResponse>(`/api/documents/${doc('dhcp')}`);
    expect(guest.body.document).toMatchObject({ readProgress: null, readAnchor: null });
    expect(guest.body.related.every((d) => d.readProgress === null)).toBe(true);
  });

  it('gives its reader their progress and where to resume (seeded as C10 shows)', async () => {
    const { body } = await get<DocumentResponse>(`/api/documents/${doc('dhcp')}`, owner);
    expect(body.document).toMatchObject({ readProgress: 72, readAnchor: 'dora' });
    expect(body.related.find((d) => d.title === 'Giao thức ARP')?.readProgress).toBe(100);
  });

  it('shows its author the backlink from a private note', async () => {
    const { body } = await get<DocumentResponse>(`/api/documents/${doc('dhcp')}`, owner);
    expect(body.backlinks.map((l) => l.document.title)).toContain('DHCP trên router nhà');
  });

  it('picks the reader’s language: the translation when there is one, else the original', async () => {
    const en = await get<DocumentResponse>(`/api/documents/${doc('arp')}?lang=en`, stranger);
    expect(en.body).toMatchObject({ lang: 'en', translationAvailable: true, document: { id: seedId('document:arp:en'), title: 'The ARP protocol', aiTranslated: true } });
    expect(en.body.translations.map((t) => t.lang)).toEqual(['vi', 'en']);
    expect(en.body.toc).toEqual([{ anchor: 'c0', title: null, level: 2 }]);

    const vi = await get<DocumentResponse>(`/api/documents/${seedId('document:arp:en')}?lang=vi`, stranger);
    expect(vi.body).toMatchObject({ lang: 'vi', translationAvailable: true, document: { id: doc('arp'), title: 'Giao thức ARP' } });

    const missing = await get<DocumentResponse>(`/api/documents/${doc('dhcp')}?lang=en`, stranger);
    expect(missing.body).toMatchObject({ lang: 'en', translationAvailable: false, document: { id: doc('dhcp'), lang: 'vi' } });
  });

  it('defaults to the account’s language, and Vietnamese for a guest', async () => {
    const res = await api(server, '/api/me', { method: 'PATCH', cookie: stranger, body: JSON.stringify({ lang: 'en' }) });
    expect(res.status).toBe(200);
    try {
      expect((await get<DocumentResponse>(`/api/documents/${doc('arp')}`, stranger)).body.document.lang).toBe('en');
      expect((await get<DocumentResponse>(`/api/documents/${doc('arp')}`)).body.document.lang).toBe('vi');
    } finally {
      await api(server, '/api/me', { method: 'PATCH', cookie: stranger, body: JSON.stringify({ lang: 'vi' }) });
    }
  });

  it('tells not found, no access and hidden apart, without any content', async () => {
    // Someone else's private file and pending note.
    for (const key of ['dhcp-home', 'arp-ndp']) {
      expect(await get(`/api/documents/${doc(key)}`, stranger)).toEqual({ status: 403, body: { error: 'no-access' } });
      expect(await get(`/api/documents/${doc(key)}`)).toEqual({ status: 403, body: { error: 'no-access' } });
      expect((await get(`/api/documents/${doc(key)}`, owner)).status).toBe(200);
    }
    // Hidden by an admin: readable by admins only.
    expect(await get(`/api/documents/${doc('icmp')}`, stranger)).toEqual({ status: 403, body: { error: 'hidden' } });
    expect(await get(`/api/documents/${doc('icmp')}`, owner)).toEqual({ status: 403, body: { error: 'hidden' } });
    expect((await get(`/api/documents/${doc('icmp')}`, admin)).status).toBe(200);
    // In the trash, unknown, malformed.
    expect(await get(`/api/documents/${doc('osi')}`, admin)).toEqual({ status: 404, body: { error: 'not-found' } });
    expect(await get(`/api/documents/${seedId('document:nope')}`, owner)).toEqual({ status: 404, body: { error: 'not-found' } });
    expect(await get('/api/documents/not-a-uuid', owner)).toEqual({ status: 404, body: { error: 'not-found' } });
  });
});

describe('GET /api/recent', () => {
  it('gives at most 8 readable texts, newest first, one per text', async () => {
    await updateDocument(server.database.db, doc('dns'), { updatedAt: new Date(Date.now() + 60_000) });
    await updateDocument(server.database.db, doc('lab-notes'), { updatedAt: new Date(Date.now() + 120_000) });
    const mine = await get<{ documents: DocumentSummary[] }>('/api/recent', owner);
    expect(mine.status).toBe(200);
    expect(mine.body.documents).toHaveLength(8);
    // ARP's English translation was written by this test just now; then the seed's order of C09 (DHCP, K8s).
    expect(mine.body.documents.slice(0, 5).map((d) => d.title)).toEqual(['lab-notes.docx', 'Tìm hiểu giao thức DNS', 'Giao thức ARP', 'Giao thức DHCP', 'Kiến trúc cụm K8s']);
    expect(mine.body.documents[0]?.space.slug).toBe(`personal-${ownerId}`);

    const guest = await get<{ documents: DocumentSummary[] }>('/api/recent');
    expect(guest.body.documents[0]?.title).toBe('Tìm hiểu giao thức DNS');
    expect(guest.body.documents.every((d) => d.status === 'approved')).toBe(true);
    expect(new Set(guest.body.documents.map((d) => d.id)).size).toBe(guest.body.documents.length);
  });
});
