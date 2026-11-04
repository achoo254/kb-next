/**
 * POST /api/ask and the history on the seeded Universe, with a real Meilisearch, Jev replaced at its boundary
 * (test/copilot-fixtures.ts) and the user's provider faked on loopback (test/fake-providers.ts): the answer cites the
 * DHCP lab, NO_ANSWER never reaches the provider, each provider failure maps to its F02 state, Jev off falls back
 * to keyword passages, and the key never shows up in the logs.
 */
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { type StreamEvent, dataOf, fakeAskJev, readEvents, seedReply, writeSecretFile } from '../../test/copilot-fixtures';
import { type FakeIdp, startFakeIdp } from '../../test/fake-idp';
import { type FakeProviders, startFakeProviders } from '../../test/fake-providers';
import { MEILI_SETUP_TIMEOUT_MS, type TestMeili, startTestMeili } from '../../test/meili';
import { api, signIn } from '../../test/sign-in';
import { type TestServer, startTestServer } from '../../test/test-server';
import { seedDatabase, seedId } from '../db/seed-database';
import type { CopilotSourceRecord } from '../db/schema';
import { IndexSync } from '../search/index-sync';
import { rebuildIndexes } from '../search/rebuild-indexes';
import type { AiProvider } from '../llm/providers';
import { UserKeyStore } from '../user-keys/key-store';

const SECRET = 'test-secret-'.padEnd(40, 'x');
const QUESTION = 'how does DHCP assign an IP?';
/** Keyword search alone cannot match an English question to Vietnamese text: with Jev down, the reader asks in Vietnamese. */
const KEYWORD_QUESTION = 'DHCP xin IP như thế nào?';
const GOOD_KEY = 'sk-Hq4Lr8Ty2Wp6Zx0Nb3Vc-GOOD';

let idp: FakeIdp;
let meili: TestMeili;
let fake: FakeProviders;
let secretFile: Awaited<ReturnType<typeof writeSecretFile>>;
let server: TestServer;
let owner: string;
let ownerId: string;
let keys: UserKeyStore;
const judge = fakeAskJev();

beforeAll(async () => {
  idp = await startFakeIdp({ clientId: 'kb-web', clientSecret: SECRET, sub: 'asker' });
  meili = await startTestMeili();
  fake = await startFakeProviders();
  fake.reply = seedReply;
  secretFile = await writeSecretFile();
  server = await startTestServer({ AUTH_ISSUER: idp.issuer, AUTH_CLIENT_SECRET: SECRET }, {}, undefined, judge.jev, (db) => ({
    search: { meili: meili.client, sync: new IndexSync(db, meili.client), close: () => undefined },
    userKeysSecret: secretFile.secret,
    aiBases: fake.bases,
  }));
  ownerId = (await seedDatabase(server.database.db, 'asker')).ownerId;
  await rebuildIndexes(server.database.db, meili.client);
  owner = await signIn(server);
  keys = new UserKeyStore(server.database.db, secretFile.secret, () => new Date());
}, MEILI_SETUP_TIMEOUT_MS);

afterAll(async () => {
  await server?.close();
  await meili?.close();
  await fake?.close();
  await idp?.close();
  await secretFile?.remove();
});

/** Saves a key straight through the store (the save route and its limit are tested in key-routes.test.ts). */
async function useKey(provider: AiProvider, key: string): Promise<void> {
  await keys.save(ownerId, provider, key);
}

async function ask(body: unknown): Promise<{ status: number; events: StreamEvent[]; error: unknown }> {
  const res = await api(server, '/api/ask', { method: 'POST', body: JSON.stringify(body), cookie: owner });
  if (!res.headers.get('content-type')?.startsWith('text/event-stream')) return { status: res.status, events: [], error: await res.json() };
  return { status: res.status, events: await readEvents(res), error: null };
}

const text = (events: readonly StreamEvent[]): string =>
  events
    .filter((e) => e.event === 'delta')
    .map((e) => (e.data as { text: string }).text)
    .join('');

describe('POST /api/ask', () => {
  it('answers 403 NO_USER_KEY without a key, before searching', async () => {
    judge.calls.length = 0;
    expect(await ask({ question: QUESTION, scope: { kind: 'universe' } })).toMatchObject({ status: 403, error: { error: 'NO_USER_KEY' } });
    expect(judge.calls).toEqual([]);
  });

  it('answers in English with a citation pointing at the DORA passage of the Vietnamese DHCP lab', async () => {
    await useKey('openai', GOOD_KEY);
    judge.calls.length = 0;
    const { status, events } = await ask({ question: QUESTION, scope: { kind: 'universe' } });
    expect(status).toBe(200);
    expect(events.map((e) => e.event).filter((e) => e !== 'delta')).toEqual(['status', 'sources', 'status', 'check', 'done']);
    expect(events[0]?.data).toEqual({ stage: 'searching', jev: 'ok', found: 0 });

    const { sources } = dataOf<{ sources: CopilotSourceRecord[] }>(events, 'sources') ?? { sources: [] };
    const dhcp = sources.find((s) => s.documentId === seedId('document:dhcp') && s.anchor === 'tong-quan');
    expect(dhcp).toMatchObject({ title: 'Giao thức DHCP', section: null, spaceName: 'Networking', origin: 'official', status: 'approved' });
    expect(events.filter((e) => e.event === 'status')[1]?.data).toEqual({ stage: 'writing', jev: 'ok', found: sources.length });

    const answer = text(events);
    expect(answer).toContain(`DORA steps: Discover, Offer, Request, Acknowledge [${dhcp?.n}]`);
    expect(answer).toContain('```mermaid');
    const check = dataOf<{ citations: Array<{ n: number; supported: boolean }> }>(events, 'check');
    expect(check?.citations.find((c) => c.n === dhcp?.n)).toEqual({ n: dhcp?.n, supported: true });
    expect(check?.citations.some((c) => !c.supported)).toBe(true);
    expect(dataOf(events, 'done')).toMatchObject({ provider: 'openai', model: 'gpt-4.1-mini', last4: 'GOOD' });
    expect(judge.calls.map((c) => c.purpose)).toEqual(['search-documents', 'search-passages', 'ask-passages', 'ask-check']);

    // The prompt carries the question and the passage, never another account's private notes.
    const prompt = JSON.stringify(fake.generations().at(-1)?.body);
    expect(prompt).toContain(QUESTION.replace('?', ''));
    expect(prompt).toContain('DORA');
    expect(fake.generations().at(-1)?.headers.authorization).toBe(`Bearer ${GOOD_KEY}`);
  });

  it('says the knowledge base has no answer without sending the provider a single request', async () => {
    const before = fake.generations().length;
    const { status, events } = await ask({ question: 'What is the boiling point of mercury in Kelvin?', scope: { kind: 'universe' } });
    expect(status).toBe(200);
    expect(events.map((e) => e.event)).toEqual(['status', 'error']);
    expect(dataOf(events, 'error')).toEqual({ code: 'NO_ANSWER' });
    expect(fake.generations().length).toBe(before);
  });

  it('answers from keyword passages when Jev is down, without a citation check', async () => {
    judge.control.fail = true;
    const error = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    try {
      const { events } = await ask({ question: KEYWORD_QUESTION, scope: { kind: 'universe' } });
      expect(events.filter((e) => e.event === 'status').map((e) => e.data)).toEqual([
        { stage: 'searching', jev: 'ok', found: 0 },
        expect.objectContaining({ stage: 'writing', jev: 'off' }),
      ]);
      const { sources } = dataOf<{ sources: CopilotSourceRecord[] }>(events, 'sources') ?? { sources: [] };
      expect(sources.some((s) => s.documentId === seedId('document:dhcp'))).toBe(true);
      expect(events.some((e) => e.event === 'check')).toBe(false);
      expect(events.at(-1)?.event).toBe('done');
    } finally {
      judge.control.fail = false;
      error.mockRestore();
    }
  });

  it('explains the reader’s selection in a document scope, and 404s a scope the reader cannot see', async () => {
    const selection = 'Máy mới vào mạng chưa có IP. Nó xin IP qua 4 bước gọi là DORA.';
    const { events } = await ask({ task: 'explain', selection, scope: { kind: 'document', id: seedId('document:dhcp') } });
    const { sources } = dataOf<{ sources: CopilotSourceRecord[] }>(events, 'sources') ?? { sources: [] };
    expect(sources.every((s) => s.documentId === seedId('document:dhcp'))).toBe(true);
    expect(events.at(-1)?.event).toBe('done');
    expect(JSON.stringify(fake.generations().at(-1)?.body)).toContain('Explain the selected passage');

    expect((await ask({ question: QUESTION, scope: { kind: 'document', id: seedId('document:nope') } })).status).toBe(404);
    expect((await ask({ question: QUESTION, scope: { kind: 'space' } })).status).toBe(400);
    expect((await ask({ task: 'summarize', scope: { kind: 'universe' } })).status).toBe(400);
  });

  it('keeps the streamed text and says PROVIDER_FAILED when the provider drops midway, leaving the key ok', async () => {
    await useKey('openai', 'sk-Hq4Lr8Ty2Wp6-midfail-0001');
    const error = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    try {
      const { events } = await ask({ question: QUESTION, scope: { kind: 'universe' } });
      expect(text(events)).not.toBe('');
      expect(events.at(-1)).toEqual({ event: 'error', data: { code: 'PROVIDER_FAILED', provider: 'openai', last4: '0001' } });
      expect((await keys.list(ownerId))[0]?.status).toBe('ok');
    } finally {
      error.mockRestore();
    }
  });

  it('says USER_KEY_NO_CREDIT and marks the key quota when the account is out of credit', async () => {
    await useKey('openai', 'sk-Hq4Lr8Ty2Wp6-drained-0002');
    const error = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    try {
      const { events } = await ask({ question: QUESTION, scope: { kind: 'universe' } });
      expect(events.at(-1)).toEqual({ event: 'error', data: { code: 'USER_KEY_NO_CREDIT', provider: 'openai', last4: '0002' } });
      expect((await keys.list(ownerId))[0]?.status).toBe('quota');
    } finally {
      error.mockRestore();
    }
  });

  it('says USER_KEY_REJECTED, marks the key invalid, and never logs the key', async () => {
    const revoked = 'sk-Hq4Lr8Ty2Wp6-revoked-0003';
    await useKey('openai', revoked);
    const lines: string[] = [];
    const capture = (...args: unknown[]): void => {
      lines.push(args.map((a) => (typeof a === 'string' ? a : JSON.stringify(a))).join(' '));
    };
    const spies = [vi.spyOn(console, 'log').mockImplementation(capture), vi.spyOn(console, 'error').mockImplementation(capture), vi.spyOn(console, 'warn').mockImplementation(capture)];
    try {
      const { events } = await ask({ question: QUESTION, scope: { kind: 'universe' } });
      expect(events.at(-1)).toEqual({ event: 'error', data: { code: 'USER_KEY_REJECTED', provider: 'openai', last4: '0003' } });
      expect(JSON.stringify(events)).not.toContain('Hq4Lr8Ty2Wp6');
      expect((await keys.list(ownerId))[0]?.status).toBe('invalid');
      // The provider's own error body quoted the whole key: none of it reached a log line.
      expect(lines.some((line) => line.includes('provider-failure'))).toBe(true);
      expect(lines.filter((line) => line.includes('Hq4Lr8Ty2Wp6'))).toEqual([]);
    } finally {
      for (const spy of spies) spy.mockRestore();
    }
    // No usable key left.
    expect((await ask({ question: QUESTION, scope: { kind: 'universe' } })).error).toEqual({ error: 'NO_USER_KEY' });
  });
});

describe('Copilot history', () => {
  it('lists the account’s answered questions, newest first, and opens one with its answer and sources', async () => {
    const res = await api(server, '/api/copilot/history', { cookie: owner });
    const { items } = (await res.json()) as { items: Array<{ id: string; task: string; question: string; scope: unknown; createdAt: string }> };
    // Answered: the cited answer, the Jev-off answer and the explanation (failures and NO_ANSWER are not kept).
    expect(items.map((i) => i.task)).toEqual(['explain', 'answer', 'answer']);
    expect(items[1]).toMatchObject({ question: KEYWORD_QUESTION, scope: { kind: 'universe', id: null } });
    expect(items[2]).toMatchObject({ question: QUESTION });

    const detail = (await (await api(server, `/api/copilot/history/${items[2]?.id}`, { cookie: owner })).json()) as {
      answer: string;
      sources: Array<CopilotSourceRecord & { available: boolean }>;
      citations: Array<{ n: number; supported: boolean }> | null;
      provider: string;
    };
    expect(detail.answer).toContain('DORA');
    expect(detail.sources.find((s) => s.anchor === 'tong-quan')).toMatchObject({ title: 'Giao thức DHCP', available: true });
    expect(detail.citations?.length).toBeGreaterThan(0);
    expect(detail.provider).toBe('openai');

    expect((await api(server, `/api/copilot/history/${seedId('nope')}`, { cookie: owner })).status).toBe(404);
    expect((await api(server, '/api/copilot/history')).status).toBe(401);
  });
});
