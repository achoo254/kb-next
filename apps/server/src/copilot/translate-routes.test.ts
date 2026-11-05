/**
 * POST /api/documents/:id/translate on the seed, the provider faked on loopback: paragraphs stream in, the result is
 * saved as an AI-translated draft only its translator can open, grouped with an original the translator only reads
 * (which is never written), translating again replaces it, a refused or cut call saves nothing, long documents are
 * refused before any call, and a translation spends the AI budget by its number of calls.
 */
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { type StreamEvent, readEvents, seedReply, writeSecretFile } from '../../test/copilot-fixtures';
import { type FakeIdp, startFakeIdp } from '../../test/fake-idp';
import { type FakeProviders, startFakeProviders } from '../../test/fake-providers';
import { createDocument } from '../../test/content-fixtures';
import { api, signIn } from '../../test/sign-in';
import { type TestServer, startTestServer } from '../../test/test-server';
import { findDocument, findLatestVersion, listChunks } from '../access/content';
import { countTextsByType, listTranslationsOf } from '../access/reading';
import { saveAiTranslation } from '../access/translation-write';
import { GUEST } from '../access/viewer';
import { seedDatabase, seedId } from '../db/seed-database';
import { documentVersions } from '../db/schema';
import { GROUP_CHARS, MAX_TRANSLATION_CALLS } from './translate-routes';
import { UserKeyStore } from '../user-keys/key-store';

const SECRET = 'test-secret-'.padEnd(40, 'x');
const DHCP = seedId('document:dhcp');

let idp: FakeIdp;
let fake: FakeProviders;
let secretFile: Awaited<ReturnType<typeof writeSecretFile>>;
let server: TestServer;
let translator: string;
let translatorId: string;
let other: string;
/** The app's clock moves a minute ahead before each test: every test starts with a fresh AI budget. */
let clockOffset = 0;

beforeEach(() => {
  clockOffset += 61_000;
});

beforeAll(async () => {
  idp = await startFakeIdp({ clientId: 'kb-web', clientSecret: SECRET, sub: 'translator' });
  fake = await startFakeProviders();
  fake.reply = seedReply;
  secretFile = await writeSecretFile();
  server = await startTestServer({ AUTH_ISSUER: idp.issuer, AUTH_CLIENT_SECRET: SECRET }, {}, () => new Date(Date.now() + clockOffset), null, () => ({
    userKeysSecret: secretFile.secret,
    aiBases: fake.bases,
  }));
  translatorId = (await seedDatabase(server.database.db, 'translator')).ownerId;
  translator = await signIn(server);
  idp.setSub('someone-else');
  other = await signIn(server);
  await new UserKeyStore(server.database.db, secretFile.secret, () => new Date()).save(translatorId, 'gemini', 'AIza-Rt5Yu7Io9Pa2Sd4Fg6Hj-GOOD', null);
});

afterAll(async () => {
  await server?.close();
  await fake?.close();
  await idp?.close();
  await secretFile?.remove();
});

async function translate(id: string, to: string, cookie: string = translator): Promise<{ status: number; events: StreamEvent[]; error: unknown }> {
  const res = await api(server, `/api/documents/${id}/translate`, { method: 'POST', body: JSON.stringify({ to }), cookie });
  if (!res.headers.get('content-type')?.startsWith('text/event-stream')) return { status: res.status, events: [], error: await res.json() };
  return { status: res.status, events: await readEvents(res), error: null };
}

/** The final text of each paragraph, by index. */
function paragraphs(events: readonly StreamEvent[]): string[] {
  const out: string[] = [];
  for (const e of events) if (e.event === 'paragraph') {
    const { index, text } = e.data as { index: number; text: string };
    out[index] = text;
  }
  return out;
}

describe('AI translation', () => {
  it('streams the translation paragraph by paragraph and saves a draft only the translator can open', async () => {
    const db = server.database.db;
    const author = { kind: 'user' as const, userId: translatorId, isAdmin: false, canReview: false };
    const original = await findDocument(db, author, DHCP);
    // An approved text by another account, which the translator may only read.
    expect(original).toMatchObject({ status: 'approved', translationGroupId: null });
    expect(original?.authorId).not.toBe(translatorId);
    const textsBefore = await countTextsByType(db, author);

    const { status, events } = await translate(DHCP, 'en');
    expect(status).toBe(200);
    const done = events.at(-1);
    expect(done?.event).toBe('done');
    const documentId = (done?.data as { documentId: string }).documentId;

    const text = paragraphs(events);
    expect(text[0]).toBe('# EN Giao thức DHCP');
    expect(text[1]).toMatch(/^EN Máy mới vào mạng chưa có IP/);
    expect(text).toContain('## EN Broadcast là gì');
    // The paragraph being translated is sent as it grows.
    expect(events.filter((e) => e.event === 'paragraph').length).toBeGreaterThan(text.length);
    expect(fake.generations()[0]?.path).toBe('/v1beta/models/gemini-3.8-flash:streamGenerateContent?alt=sse');

    const saved = await findDocument(db, author, documentId);
    expect(saved).toMatchObject({ lang: 'en', title: 'EN Giao thức DHCP', aiTranslated: true, status: 'draft', origin: 'own', authorId: translatorId });
    // Grouped by the original's id; the original row is untouched.
    expect(saved?.translationGroupId).toBe(DHCP);
    expect(await findDocument(db, author, DHCP)).toEqual(original);
    expect((await findLatestVersion(db, author, documentId))?.markdown).toContain('# EN Giao thức DHCP');
    expect((await listChunks(db, author, documentId))?.map((c) => [c.anchor, c.heading])).toEqual([
      ['overview', null],
      ['en-broadcast-la-gi', 'EN Broadcast là gì'],
      ['en-lease-va-gia-han', 'EN Lease và gia hạn'],
      ['en-rui-ro-dhcp-gia-mao', 'EN Rủi ro: DHCP giả mạo'],
    ]);

    expect(await findDocument(db, GUEST, documentId)).toBeNull();
    expect((await api(server, `/api/documents/${documentId}`, { cookie: other })).status).toBe(403);
    expect((await api(server, `/api/documents/${documentId}`)).status).toBe(403);
    expect((await api(server, `/api/documents/${documentId}`, { cookie: translator })).status).toBe(200);

    // Still one text: the reader switches between the two, search groups them, counts count it once.
    const read = async (cookie: string, lang: string) =>
      ((await (await api(server, `/api/documents/${DHCP}?lang=${lang}`, { cookie })).json()) as { document: { id: string; translations: string[] } }).document;
    expect(await read(translator, 'en')).toMatchObject({ id: documentId, translations: ['vi', 'en'] });
    expect(await read(translator, 'vi')).toMatchObject({ id: DHCP, translations: ['vi', 'en'] });
    expect(await read(other, 'en')).toMatchObject({ id: DHCP, translations: ['vi'] });
    expect((await listTranslationsOf(db, author, [DHCP])).map((d) => d.id).sort()).toEqual([DHCP, documentId].sort());
    expect((await listTranslationsOf(db, GUEST, [DHCP])).map((d) => d.id)).toEqual([DHCP]);
    expect(await countTextsByType(db, author)).toEqual(textsBefore);

    // Again: the same draft gets a new version.
    const again = await translate(DHCP, 'en');
    expect(again.events.at(-1)).toEqual({ event: 'done', data: { documentId } });
    expect((await findLatestVersion(db, author, documentId))?.version).toBe(2);
  });

  it('refuses before streaming: no key, same language, unknown document', async () => {
    expect(await translate(DHCP, 'en', other)).toMatchObject({ status: 403, error: { error: 'NO_USER_KEY' } });
    expect(await translate(DHCP, 'vi')).toMatchObject({ status: 400, error: { error: 'same-language' } });
    expect(await translate(seedId('document:nope'), 'en')).toMatchObject({ status: 404, error: { error: 'not-found' } });
    expect(await translate(DHCP, 'fr')).toMatchObject({ status: 400, error: { error: 'invalid-body' } });
  });

  it('saves nothing when the provider refuses the key', async () => {
    await new UserKeyStore(server.database.db, secretFile.secret, () => new Date()).save(translatorId, 'gemini', 'AIza-Rt5Yu7Io9-revoked-0009', null);
    const error = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    try {
      const { events } = await translate(seedId('document:arp'), 'en');
      expect(events.at(-1)).toEqual({ event: 'error', data: { code: 'USER_KEY_REJECTED', provider: 'gemini', last4: '0009' } });
      expect(events.some((e) => e.event === 'done')).toBe(false);
    } finally {
      error.mockRestore();
    }
  });
});

/** A document of the translator's own Space whose Markdown has `count` paragraphs of `chars` characters. */
async function longDocument(count: number, chars: number): Promise<string> {
  const db = server.database.db;
  const id = await createDocument(db, { spaceId: seedId('space:net'), authorId: translatorId, title: `Long ${count}×${chars}`, status: 'approved' });
  const markdown = [`# Long ${count}×${chars}`, ...Array.from({ length: count }, (_, i) => `${i} ${'chữ '.repeat(chars / 4)}`.slice(0, chars))].join('\n\n');
  await db.insert(documentVersions).values({ documentId: id, version: 1, markdown, editorId: translatorId });
  return id;
}

describe('AI translation after review', () => {
  const useKey = (key: string) => new UserKeyStore(server.database.db, secretFile.secret, () => new Date()).save(translatorId, 'gemini', key, null);

  it('fails a translation cut by the output cap and keeps the earlier draft as it was', async () => {
    await useKey('AIza-Rt5Yu7Io9Pa2Sd4Fg6Hj-GOOD');
    const first = await translate(seedId('document:dns'), 'en');
    const documentId = (first.events.at(-1)?.data as { documentId: string }).documentId;
    const author = { kind: 'user' as const, userId: translatorId, isAdmin: false, canReview: false };
    const before = await findLatestVersion(server.database.db, author, documentId);

    await useKey('AIza-Rt5Yu7Io9-capped-0010');
    const error = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    try {
      const { events } = await translate(seedId('document:dns'), 'en');
      expect(events.at(-1)).toEqual({ event: 'error', data: { code: 'PROVIDER_FAILED', provider: 'gemini', last4: '0010' } });
    } finally {
      error.mockRestore();
    }
    expect(await findLatestVersion(server.database.db, author, documentId)).toEqual(before);
  });

  it('refuses a document past the call cap, or with a paragraph longer than a call, before any call', async () => {
    await useKey('AIza-Rt5Yu7Io9Pa2Sd4Fg6Hj-GOOD');
    const calls = fake.generations().length;
    expect(await translate(await longDocument(MAX_TRANSLATION_CALLS + 1, 7_000), 'en')).toMatchObject({ status: 400, error: { error: 'too-long' } });
    expect(await translate(await longDocument(1, GROUP_CHARS + 1), 'en')).toMatchObject({ status: 400, error: { error: 'too-long' } });
    expect(fake.generations().length).toBe(calls);
  });

  it('spends the AI budget by the number of calls a translation makes', async () => {
    const twelve = await longDocument(12, 7_000);
    const nine = await longDocument(9, 7_000);
    const calls = fake.generations().length;
    expect((await translate(twelve, 'en')).events.at(-1)?.event).toBe('done');
    expect(fake.generations().length).toBe(calls + 12);
    // 12 + 9 calls do not fit 20 a minute; 8 more do.
    expect(await translate(nine, 'en')).toMatchObject({ status: 429, error: { error: 'rate-limited' } });
    expect((await translate(await longDocument(8, 7_000), 'en')).events.at(-1)?.event).toBe('done');
  });

  it('makes one draft when the same text is translated twice at once', async () => {
    const db = server.database.db;
    const author = { kind: 'user' as const, userId: translatorId, isAdmin: false, canReview: false };
    const source = await findDocument(db, author, seedId('document:icmp'));
    if (!source) throw new Error('no ICMP lab');
    const write = (title: string) => saveAiTranslation(db, { source, authorId: translatorId, lang: 'en', title, markdown: `# ${title}`, chunks: [] });
    const [a, b] = await Promise.all([write('First'), write('Second')]);
    expect(a).toBe(b);
    expect((await listTranslationsOf(db, author, [source.id])).filter((d) => d.aiTranslated)).toHaveLength(1);
  });
});
