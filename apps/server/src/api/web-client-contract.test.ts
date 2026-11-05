/**
 * The web app's typed clients (apps/web/src/api/content-api.ts, keys-api.ts, copilot-api.ts) against the real routes:
 * every answer of the reading API, own keys, the Copilot stream and translation must pass the client's schemas, so the
 * two sides cannot drift apart unnoticed. The user's AI provider is a local fake, Jev a stand-in.
 */
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import {
  completeOnboarding,
  fetchComments,
  fetchDocument,
  fetchMe,
  fetchRecent,
  fetchSpace,
  fetchSpaces,
  postComment,
  readErrorOf,
  saveReadingProgress,
  updateMe,
} from '../../../web/src/api/content-api';
import { ApiError } from '../../../web/src/api/api-client';
import { type AskEvent, type TranslateEvent, fetchCopilotHistory, fetchCopilotQuestion, streamAsk, streamTranslation } from '../../../web/src/api/copilot-api';
import { deleteKey, fetchKeys, saveKey, saveKeyPrefs } from '../../../web/src/api/keys-api';
import { fakeAskJev, seedReply, writeSecretFile } from '../../test/copilot-fixtures';
import { type FakeIdp, startFakeIdp } from '../../test/fake-idp';
import { type FakeProviders, startFakeProviders } from '../../test/fake-providers';
import { signIn } from '../../test/sign-in';
import { type TestServer, startTestServer } from '../../test/test-server';
import { seedDatabase, seedId } from '../db/seed-database';

const SECRET = 'test-secret-'.padEnd(40, 'x');
let idp: FakeIdp;
let fake: FakeProviders;
let secretFile: Awaited<ReturnType<typeof writeSecretFile>>;
let server: TestServer;
let session: string;
let ownerId: string;

beforeAll(async () => {
  idp = await startFakeIdp({ clientId: 'kb-web', clientSecret: SECRET, sub: 'owner-sub', profile: { name: 'Chủ' } });
  fake = await startFakeProviders();
  fake.reply = seedReply;
  secretFile = await writeSecretFile();
  server = await startTestServer({ AUTH_ISSUER: idp.issuer, AUTH_CLIENT_SECRET: SECRET }, {}, undefined, fakeAskJev().jev, () => ({
    userKeysSecret: secretFile.secret,
    aiBases: fake.bases,
  }));
  ownerId = (await seedDatabase(server.database.db, 'owner-sub')).ownerId;
  session = await signIn(server);
  // The browser: same origin, the session cookie goes along. The server's own calls (the fake provider) go as they are.
  const realFetch = globalThis.fetch;
  vi.stubGlobal('fetch', (path: string, init: RequestInit = {}) => {
    if (/^https?:/.test(path)) return realFetch(path, init);
    const headers = new Headers(init.headers);
    headers.set('origin', server.origin);
    headers.set('cookie', session);
    return realFetch(`${server.origin}${path}`, { ...init, headers });
  });
});

afterAll(async () => {
  vi.unstubAllGlobals();
  await server.close();
  await fake.close();
  await idp.close();
  await secretFile.remove();
});

describe('web client ↔ reading API', () => {
  it('parses every answer the screens use', async () => {
    expect(await fetchMe()).toMatchObject({ name: 'Chủ', onboardedAt: null });
    expect(await updateMe({ theme: 'light' })).toMatchObject({ theme: 'light' });
    expect((await completeOnboarding({ lang: 'vi', interests: ['networking'] })).onboardedAt).not.toBeNull();

    const spaces = await fetchSpaces();
    expect(spaces).toHaveLength(7);
    const space = await fetchSpace('networking', 'en');
    expect(space.collections).toHaveLength(4);
    expect((await fetchSpace(`personal-${ownerId}`)).uncollected).toHaveLength(4);

    const reader = await fetchDocument(seedId('document:dhcp'));
    expect(reader.document.title).toBe('Giao thức DHCP');
    expect(reader.backlinks.length).toBeGreaterThan(0);
    expect(await fetchRecent()).toHaveLength(8);
    expect(space.members.length).toBeGreaterThan(0);
    expect(space.related[0]?.relevance).toBeGreaterThan(0);
    expect(reader.related[0]?.relevance).toBeGreaterThan(0);
    expect(reader.document.readProgress).toBe(72);

    expect(await saveReadingProgress(seedId('document:dhcp'), 90, 'lease-va-gia-han')).toEqual({ progress: 90, anchor: 'lease-va-gia-han' });
    expect((await fetchComments(seedId('document:dhcp'))).comments).toHaveLength(2);
    expect(await postComment(seedId('document:dhcp'), 'Rõ rồi', 'broadcast-la-gi')).toMatchObject({ body: 'Rõ rồi', mine: true });
  });

  it('maps a missing document to its screen', async () => {
    expect(readErrorOf(await fetchDocument(seedId('document:nope')).catch((e: unknown) => e))).toBe('not-found');
    expect(readErrorOf(await fetchSpace('no-such-space').catch((e: unknown) => e))).toBe('not-found');
  });

  it('parses own keys, the Copilot stream, its history and a translation', async () => {
    expect(await fetchKeys()).toMatchObject({ available: true, keys: [], active: null });
    const noKey = await streamAsk({ question: 'DHCP?', scope: { kind: 'universe' } })
      .next()
      .catch((e: unknown) => e);
    expect(noKey instanceof ApiError && noKey.code).toBe('NO_USER_KEY');

    expect(await saveKey('openai', 'sk-Contract7Test9Key2Abc-WXYZ')).toMatchObject({ provider: 'openai', last4: 'WXYZ', status: 'ok' });
    expect((await saveKeyPrefs({ provider: 'openai', model: 'gpt-4.1-nano' })).active).toEqual({ provider: 'openai', model: 'gpt-4.1-nano', last4: 'WXYZ' });

    const events: AskEvent[] = [];
    for await (const event of streamAsk({ question: 'how does DHCP assign an IP?', scope: { kind: 'space', id: 'networking' } })) events.push(event);
    expect(events.map((e) => e.event).filter((e) => e !== 'delta')).toEqual(['status', 'sources', 'status', 'check', 'done']);
    const done = events.find((e) => e.event === 'done');
    expect(done?.data).toMatchObject({ provider: 'openai', model: 'gpt-4.1-nano', last4: 'WXYZ' });

    const history = await fetchCopilotHistory();
    expect(history.items).toHaveLength(1);
    expect(history.items[0]?.scope).toEqual({ kind: 'space', id: 'networking' });
    const question = await fetchCopilotQuestion(history.items[0]?.id ?? '');
    expect(question.sources[0]).toMatchObject({ documentId: seedId('document:dhcp'), available: true });

    const translation: TranslateEvent[] = [];
    for await (const event of streamTranslation(seedId('document:dhcp'), 'en')) translation.push(event);
    const saved = translation.at(-1);
    expect(saved?.event).toBe('done');
    const documentId = saved?.event === 'done' ? saved.data.documentId : '';
    expect((await fetchDocument(documentId, 'en')).document).toMatchObject({ id: documentId, lang: 'en', aiTranslated: true, status: 'draft' });

    expect(await deleteKey('openai')).toEqual({ deleted: true });
  });
});
