/**
 * "Của tôi" (C08) on the seed, through the web app's own client: an account's own list, recent texts, favourites and
 * trash never show anyone else's documents; deleting for good ("Xoá vĩnh viễn", "Dọn thùng rác") reaches only the
 * account's own trash; the list says where a text lives and whether an admin hid it; and the reader (C11) learns
 * which `[[ ]]` title links which document.
 */
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { eq } from 'drizzle-orm';
import {
  createDocument,
  emptyTrash,
  fetchFavorites,
  fetchMyDocuments,
  fetchMyRecent,
  fetchTrash,
  purgeFromTrash,
  saveDocument,
  setFavorite,
  trashDocument,
} from '../../../web/src/api/authoring-api';
import { ApiError } from '../../../web/src/api/api-client';
import { fetchDocument } from '../../../web/src/api/content-api';
import { type FakeIdp, startFakeIdp } from '../../test/fake-idp';
import { signIn } from '../../test/sign-in';
import { type TestServer, startTestServer } from '../../test/test-server';
import { documents } from '../db/schema';
import { seedDatabase, seedId } from '../db/seed-database';
import { writtenLinks } from './content-routes';
import type { LinkCandidate } from '../authoring/link-targets';

const SECRET = 'test-secret-'.padEnd(40, 'x');
const DHCP = seedId('document:dhcp');

let idp: FakeIdp;
let server: TestServer;
const clock = new Date('2026-11-05T03:00:00Z');
const sessions = { owner: '', other: '' };
let current = '';

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

beforeAll(async () => {
  idp = await startFakeIdp({ clientId: 'kb-web', clientSecret: SECRET, sub: 'owner-sub', profile: { name: 'Chủ' } });
  server = await startTestServer({ AUTH_ISSUER: idp.issuer, AUTH_CLIENT_SECRET: SECRET }, {}, () => clock);
  await seedDatabase(server.database.db, 'owner-sub');
  sessions.owner = await signIn(server);
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

describe('one account’s content', () => {
  it('never shows up in another account’s own list, recent texts, favourites or trash', async () => {
    const ownerDocs = await as('owner', () => fetchMyDocuments());
    const ownerTrash = await as('owner', () => fetchTrash());
    const ownerFavorites = await as('owner', () => fetchFavorites());
    expect(ownerDocs.length).toBeGreaterThan(0);
    expect(ownerTrash.map((d) => d.title).sort()).toEqual(['Bản nháp cũ: ARP', 'boot-notes.docx']);
    expect(ownerFavorites.map((d) => d.title)).toEqual(['Máy mới xin IP thế nào', 'Máy mới vào mạng', 'Giao thức DHCP']);

    // The other account reads and favourites DHCP too: only that shows, never the owner's own texts or trash.
    await as('other', () => setFavorite(DHCP, true));
    const otherDocs = await as('other', () => fetchMyDocuments());
    const otherRecent = await as('other', () => fetchMyRecent());
    const otherFavorites = await as('other', () => fetchFavorites());
    const otherTrash = await as('other', () => fetchTrash());
    const ownerIds = new Set([...ownerDocs, ...ownerTrash].map((d) => d.id));
    expect(otherDocs).toEqual([]);
    expect(otherTrash).toEqual([]);
    expect(otherRecent.filter((d) => ownerIds.has(d.id))).toEqual([]);
    expect(otherFavorites.map((d) => d.id)).toEqual([DHCP]);
  });

  it('says where each text lives, whether an admin hid it, and why a reviewer sent it back', async () => {
    const mine = await as('owner', () => fetchMyDocuments());
    expect(mine.find((d) => d.id === seedId('document:dhcp-home'))).toMatchObject({ hidden: false, collection: { nameVi: 'Giao thức nền tảng' }, space: { slug: 'networking' } });
    expect(mine.find((d) => d.id === seedId('document:lab-notes'))).toMatchObject({ collection: null });
    expect(mine.find((d) => d.id === seedId('document:tcp-udp-pic'))).toMatchObject({
      status: 'changes_requested',
      review: { action: 'changes_requested', reason: 'Thêm link RFC 793 cho phần bắt tay 3 bước nhé.', by: 'Linh' },
    });
    await server.database.db.update(documents).set({ status: 'approved', origin: 'community', hidden: true }).where(eq(documents.id, seedId('document:dns-cache')));
    expect((await as('owner', () => fetchMyDocuments())).find((d) => d.id === seedId('document:dns-cache'))).toMatchObject({ status: 'approved', hidden: true });
  });
});

describe('deleting for good', () => {
  it('takes one document out of the account’s own trash only', async () => {
    const note = await as('owner', () => createDocument({ title: 'Xoá hẳn', body: 'Tạm' }));
    expect(await as('owner', () => failure(purgeFromTrash(note.id)))).toBe('not-found');
    await as('owner', () => trashDocument(note.id));
    expect(await as('other', () => failure(purgeFromTrash(note.id)))).toBe('not-found');
    expect(await as('owner', () => failure(purgeFromTrash('not-a-uuid')))).toBe('not-found');
    await as('owner', () => purgeFromTrash(note.id));
    expect((await as('owner', () => fetchTrash())).map((d) => d.id)).not.toContain(note.id);
    expect(await as('owner', () => failure(fetchDocument(note.id)))).toBe('not-found');
  });

  it('empties the account’s own trash and nobody else’s', async () => {
    const theirs = await as('other', () => createDocument({ title: 'Của người khác' }));
    await as('other', () => trashDocument(theirs.id));
    expect(await as('owner', () => emptyTrash())).toBe(2);
    expect(await as('owner', () => fetchTrash())).toEqual([]);
    expect((await as('other', () => fetchTrash())).map((d) => d.id)).toEqual([theirs.id]);
    expect(await as('owner', () => emptyTrash())).toBe(0);
  });
});

describe('[[ ]] titles in the reader', () => {
  it('names the document each written title links, and leaves a title linking nothing out', async () => {
    const note = await as('owner', () => createDocument({ title: 'Ghi chú liên kết', body: 'Xem [[DHCP]], [[Giao thức ARP|ARP]] và [[Không có bài này]].' }));
    expect((await as('owner', () => fetchDocument(note.id))).wikilinks).toEqual([
      { title: 'DHCP', id: DHCP },
      { title: 'Giao thức ARP', id: seedId('document:arp') },
    ]);
    await as('owner', () => saveDocument(note.id, { title: note.title, body: 'Không còn liên kết.', baseRev: note.rev }));
    expect((await as('owner', () => fetchDocument(note.id))).wikilinks).toEqual([]);
  });

  it('links nothing for a title whose document the reader may not open', () => {
    const doc = (id: string, title: string): LinkCandidate => ({ id, title, origin: 'official', status: 'approved', lang: 'vi' });
    expect(writtenLinks('[[DHCP]] và [[ARP]]', [doc('a', 'Giao thức DHCP')], 'vi')).toEqual([{ title: 'DHCP', id: 'a' }]);
    expect(writtenLinks('```\n[[DHCP]]\n```', [doc('a', 'Giao thức DHCP')], 'vi')).toEqual([]);
  });
});
