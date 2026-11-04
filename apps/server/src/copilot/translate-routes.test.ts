/**
 * POST /api/documents/:id/translate on the seed, the provider faked on loopback: paragraphs stream in, the result is
 * saved as an AI-translated draft only its translator can open, translating again replaces it, and a refused call
 * saves nothing.
 */
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { type StreamEvent, readEvents, seedReply, writeSecretFile } from '../../test/copilot-fixtures';
import { type FakeIdp, startFakeIdp } from '../../test/fake-idp';
import { type FakeProviders, startFakeProviders } from '../../test/fake-providers';
import { api, signIn } from '../../test/sign-in';
import { type TestServer, startTestServer } from '../../test/test-server';
import { findDocument, findLatestVersion, listChunks } from '../access/content';
import { GUEST } from '../access/viewer';
import { seedDatabase, seedId } from '../db/seed-database';
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

beforeAll(async () => {
  idp = await startFakeIdp({ clientId: 'kb-web', clientSecret: SECRET, sub: 'translator' });
  fake = await startFakeProviders();
  fake.reply = seedReply;
  secretFile = await writeSecretFile();
  server = await startTestServer({ AUTH_ISSUER: idp.issuer, AUTH_CLIENT_SECRET: SECRET }, {}, undefined, null, () => ({
    userKeysSecret: secretFile.secret,
    aiBases: fake.bases,
  }));
  translatorId = (await seedDatabase(server.database.db, 'translator')).ownerId;
  translator = await signIn(server);
  idp.setSub('someone-else');
  other = await signIn(server);
  await new UserKeyStore(server.database.db, secretFile.secret, () => new Date()).save(translatorId, 'gemini', 'AIza-Rt5Yu7Io9Pa2Sd4Fg6Hj-GOOD');
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

    const db = server.database.db;
    const author = { kind: 'user' as const, userId: translatorId, isAdmin: false };
    const saved = await findDocument(db, author, documentId);
    expect(saved).toMatchObject({ lang: 'en', title: 'EN Giao thức DHCP', aiTranslated: true, status: 'draft', origin: 'own', authorId: translatorId });
    const source = await findDocument(db, author, DHCP);
    expect(saved?.translationGroupId).toBe(source?.translationGroupId ?? 'missing');
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
    await new UserKeyStore(server.database.db, secretFile.secret, () => new Date()).save(translatorId, 'gemini', 'AIza-Rt5Yu7Io9-revoked-0009');
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
