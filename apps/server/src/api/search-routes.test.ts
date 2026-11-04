/**
 * GET /api/search on the seeded Universe (KB_SEED=mock data) with a real Meilisearch and Jev replaced at its
 * boundary (JevJudge): keyword and meaning merged, who sees what, Jev failing, filters, diacritic variants and the
 * rate limit. The opt-in live test at the end calls the real Jev when TYPESAFE_API_KEY is set.
 */
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { SearchResponseSchema } from '../../../web/src/api/search-api';
import { createDocument, updateDocument } from '../../test/content-fixtures';
import { type FakeIdp, startFakeIdp } from '../../test/fake-idp';
import { MEILI_SETUP_TIMEOUT_MS, type TestMeili, startTestMeili } from '../../test/meili';
import { api, signIn } from '../../test/sign-in';
import { type TestServer, startTestServer } from '../../test/test-server';
import { seedDatabase, seedId } from '../db/seed-database';
import { JevClient, type JevJudge, type JevQuestion, type JevResult } from '../jev/jev-client';
import { IndexSync } from '../search/index-sync';
import { rebuildIndexes } from '../search/rebuild-indexes';
import type { SearchService } from '../search/search-service';
import type { SearchResponse } from './search-routes';

const SECRET = 'test-secret-'.padEnd(40, 'x');
const QUESTION = 'how does a computer get an IP automatically';

interface DocumentState {
  documents: Record<string, { title: Record<string, string>; summary: Record<string, string> }>;
}
interface PassageState {
  passages: Record<string, { document: string; section: string | null; text: string }>;
}

/**
 * Jev at its boundary, judging like the real one would on the seed: the documents about DHCP are what the question
 * is about; a passage explaining how a new machine asks for an IP (DORA) answers it, one only naming DORA or an IP
 * address helps a little. `fail` makes every call reject (an outage, a timeout).
 */
function fakeJev() {
  const calls: Array<{ purpose: string; state: unknown }> = [];
  const control = { fail: false };
  const ask = vi.fn((purpose: string, state: unknown, questions: Record<string, JevQuestion>): Promise<JevResult> => {
    calls.push({ purpose, state });
    if (control.fail) return Promise.reject(new Error(`Jev ${purpose} failed: TimeoutError`));
    const usage = { inputTokens: 400, outputTokens: 20 };
    if (purpose === 'search-documents') {
      const docs = (state as DocumentState).documents;
      const weights = Object.fromEntries(Object.entries(docs).map(([id, d]) => [id, /DHCP|DORA/.test(JSON.stringify(d)) ? 1 : 0.02]));
      const sum = Object.values(weights).reduce((a, b) => a + b, 0);
      const probabilities = Object.fromEntries(Object.entries(weights).map(([id, w]) => [id, w / sum]));
      const choice = Object.entries(probabilities).sort((a, b) => b[1] - a[1])[0]?.[0] ?? '';
      return Promise.resolve({ answers: { document: { type: 'choice', choice, confidence: 0.5, probabilities }, exists: { type: 'noul', noul: 0.95 } }, usage });
    }
    const passages = (state as PassageState).passages;
    const answers: JevResult['answers'] = {};
    for (const id of Object.keys(questions)) {
      const text = passages[id]?.text ?? '';
      const score = /xin IP/.test(text) && /DORA/.test(text) ? 3 : /DORA/.test(text) ? 2 : /\bIP\b/.test(text) ? 1 : 0;
      answers[id] = { type: 'score', score, confidence: 0.9, probabilities: {} };
    }
    return Promise.resolve({ answers, usage });
  });
  const jev: JevJudge = { choose: vi.fn(() => Promise.reject(new Error('not used'))), ask };
  return { jev, calls, control };
}

let idp: FakeIdp;
let meili: TestMeili;
let server: TestServer;
let owner: string;
const judge = fakeJev();

const searchService = (client: TestMeili['client']) =>
  // Only the client is used by search; the sync queue belongs to writers.
  (db: Parameters<typeof rebuildIndexes>[0]): SearchService => ({ meili: client, sync: new IndexSync(db, client), close: () => undefined });

beforeAll(async () => {
  idp = await startFakeIdp({ clientId: 'kb-web', clientSecret: SECRET, sub: 'e2e-account' });
  meili = await startTestMeili();
  server = await startTestServer({ AUTH_ISSUER: idp.issuer, AUTH_CLIENT_SECRET: SECRET }, {}, undefined, judge.jev, (db) => ({ search: searchService(meili.client)(db) }));
  const { ownerId } = await seedDatabase(server.database.db, 'e2e-account');
  // Variants of "mạng" for the diacritics check, in the Linux Space (which has no other "mạng").
  const extra = { spaceId: seedId('space:lnx'), authorId: ownerId, origin: 'official' as const, type: 'lab' as const };
  await createDocument(server.database.db, { ...extra, title: 'Mang theo laptop', texts: ['Nhớ mang theo laptop khi đi thực hành mạng.'] });
  await createDocument(server.database.db, { ...extra, title: 'Màng lọc', texts: ['Màng lọc giữ lại cặn.'] });
  await rebuildIndexes(server.database.db, meili.client);
  owner = await signIn(server);
}, MEILI_SETUP_TIMEOUT_MS);

afterAll(async () => {
  await server?.close();
  await meili?.close();
  await idp?.close();
});

async function search(params: Record<string, string>, cookie?: string): Promise<SearchResponse> {
  const res = await api(server, `/api/search?${new URLSearchParams(params).toString()}`, cookie ? { cookie } : {});
  expect(res.status).toBe(200);
  return (await res.json()) as SearchResponse;
}

const titles = (body: SearchResponse): string[] => body.groups.flatMap((g) => g.results.map((r) => r.title));

describe('search across languages', () => {
  it('answers an English question with the DORA passage of the Vietnamese DHCP lab first', async () => {
    judge.calls.length = 0;
    const body = await search({ q: QUESTION });
    expect(body).toMatchObject({ keyword: 'ok', meaning: 'ok', exact: false });
    const first = body.groups[0]?.results[0];
    expect(body.groups[0]?.space.slug).toBe('networking');
    expect(first).toMatchObject({ id: seedId('document:dhcp'), title: 'Giao thức DHCP', lang: 'vi', anchor: 'tong-quan', match: 'meaning', relevance: 1 });
    expect(first?.snippet.map((p) => p.text).join('')).toContain('DORA');
    expect(judge.calls.map((c) => c.purpose)).toEqual(['search-documents', 'search-passages']);
    // The web client reads this answer as is (apps/web/src/api/search-api.ts).
    expect(SearchResponseSchema.safeParse(body).success).toBe(true);
  });

  it('never offers Jev, nor answers, what the viewer may not read', async () => {
    judge.calls.length = 0;
    const guest = await search({ q: 'DORA' });
    const offered = JSON.stringify(judge.calls[0]?.state);
    expect(offered).not.toContain('lab-notes.docx');
    expect(offered).not.toContain('DHCP trên router nhà');
    expect(titles(guest)).not.toContain('lab-notes.docx');

    const mine = await search({ q: 'DORA' }, owner);
    expect(titles(mine)).toContain('lab-notes.docx');
    const notes = mine.groups.find((g) => g.space.kind === 'personal')?.results[0];
    expect(notes).toMatchObject({ origin: 'own', status: 'private' });
  });

  it('checks every hit again: a document hidden after it was indexed is not answered', async () => {
    const spoof = seedId('document:dhcp-spoof');
    expect(titles(await search({ q: 'snooping', mode: 'keyword' }))).toContain('Ghi chú: DHCP giả mạo');
    await updateDocument(server.database.db, spoof, { hidden: true });
    try {
      expect(titles(await search({ q: 'snooping', mode: 'keyword' }))).not.toContain('Ghi chú: DHCP giả mạo');
    } finally {
      await updateDocument(server.database.db, spoof, { hidden: false });
    }
  });
});

describe('when Jev fails', () => {
  it('still answers the keyword results, flagged keyword-only', async () => {
    judge.control.fail = true;
    try {
      const body = await search({ q: 'DHCP' });
      expect(body).toMatchObject({ keyword: 'ok', meaning: 'failed' });
      expect(titles(body)).toContain('Giao thức DHCP');
      expect(body.groups.flatMap((g) => g.results).every((r) => r.match === 'keyword' && r.relevance === null)).toBe(true);
    } finally {
      judge.control.fail = false;
    }
  });
});

describe('modes and filters', () => {
  it('asks Jev nothing for keyword mode, and only meaning results in meaning mode', async () => {
    judge.calls.length = 0;
    const keyword = await search({ q: 'DHCP', mode: 'keyword' });
    expect(judge.calls).toHaveLength(0);
    expect(keyword.meaning).toBe('skipped');
    const meaning = await search({ q: QUESTION, mode: 'meaning' });
    expect(meaning.keyword).toBe('skipped');
    expect(meaning.groups.flatMap((g) => g.results).every((r) => r.match === 'meaning')).toBe(true);
  });

  it('counts each origin before filtering by it, and filters by Space, type and language', async () => {
    const all = await search({ q: 'DHCP', mode: 'keyword' }, owner);
    expect(all.origins.official).toBeGreaterThan(0);
    expect(all.origins.community).toBeGreaterThan(0);
    expect(all.origins.own).toBeGreaterThan(0);
    const community = await search({ q: 'DHCP', mode: 'keyword', origin: 'community' }, owner);
    expect(community.origins).toEqual(all.origins);
    expect(community.groups.flatMap((g) => g.results).every((r) => r.origin === 'community')).toBe(true);
    expect(community.total).toBe(all.origins.community);

    const notes = await search({ q: 'DHCP', mode: 'keyword', type: 'note,office' }, owner);
    expect(notes.groups.flatMap((g) => g.results).every((r) => r.type === 'note' || r.type === 'office')).toBe(true);
    const linux = await search({ q: 'mang', mode: 'keyword', space: 'linux' });
    expect(linux.groups.map((g) => g.space.slug)).toEqual(['linux']);
    expect((await search({ q: 'DHCP', mode: 'keyword', lang: 'en' })).total).toBe(0);
  });

  it('rejects a filter value it does not know', async () => {
    const res = await api(server, '/api/search?q=dhcp&type=poem');
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: 'invalid-query' });
  });

  it('answers an empty query without searching', async () => {
    judge.calls.length = 0;
    expect(await search({ q: '  ' })).toMatchObject({ total: 0, groups: [], keyword: 'skipped', meaning: 'skipped' });
    expect(judge.calls).toHaveLength(0);
  });
});

describe('diacritics', () => {
  it('searches the exact diacritics typed and says how many texts the variants would add', async () => {
    const exact = await search({ q: 'mạng', mode: 'keyword', space: 'linux' });
    expect(exact.exact).toBe(true);
    expect(titles(exact)).toEqual(['Mang theo laptop']);
    expect(exact.variants).toEqual({ hidden: 1, words: ['màng'] });
    const every = await search({ q: 'mạng', mode: 'keyword', space: 'linux', variants: '1' });
    expect(every.exact).toBe(false);
    expect(titles(every).sort()).toEqual(['Mang theo laptop', 'Màng lọc']);
  });

  it('suggests other headings found', async () => {
    const body = await search({ q: 'DHCP', mode: 'keyword' });
    expect(body.suggestions.length).toBeGreaterThan(0);
    expect(body.suggestions.every((s) => s.toLowerCase() !== 'dhcp')).toBe(true);
  });
});

describe('without Meilisearch or Jev', () => {
  it('says each source is off, and limits searches per address', async () => {
    const bare = await startTestServer({}, { searchLimitPerMinute: 2 });
    try {
      const get = () => api(bare, '/api/search?q=dhcp');
      const first = await get();
      expect(await first.json()).toMatchObject({ keyword: 'off', meaning: 'off', total: 0 });
      expect((await get()).status).toBe(200);
      const limited = await get();
      expect(limited.status).toBe(429);
      expect(await limited.json()).toEqual({ error: 'rate-limited' });
    } finally {
      await bare.close();
    }
  });
});

// Opt-in: the real Jev, only when the test environment has a key (never in CI by default).
describe.runIf(Boolean(process.env.TYPESAFE_API_KEY))('live Jev', () => {
  it('ranks the DORA passage of the Vietnamese DHCP lab first for the English question', async () => {
    const live = new JevClient(process.env.TYPESAFE_API_KEY ?? '', 10_000);
    const liveServer = await startTestServer({}, {}, undefined, live, (db) => ({ search: searchService(meili.client)(db) }));
    try {
      await seedDatabase(liveServer.database.db, 'e2e-account');
      const started = Date.now();
      const res = await api(liveServer, `/api/search?${new URLSearchParams({ q: QUESTION, mode: 'meaning' }).toString()}`);
      const body = (await res.json()) as SearchResponse;
      console.log(`live Jev search: ${Date.now() - started} ms`);
      expect(body.meaning).toBe('ok');
      expect(body.groups[0]?.results[0]).toMatchObject({ title: 'Giao thức DHCP', anchor: 'tong-quan' });
    } finally {
      await liveServer.close();
    }
  }, 30_000);
});
