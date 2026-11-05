import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { updateDocument } from '../../test/content-fixtures';
import { type FakeIdp, startFakeIdp } from '../../test/fake-idp';
import { api, signIn } from '../../test/sign-in';
import { type TestServer, startTestServer } from '../../test/test-server';
import { addEdge, fetchEdgeSuggestions, fetchGraph, removeEdge } from '../../../web/src/api/graph-api';
import { ApiError } from '../../../web/src/api/api-client';
import { seedDatabase, seedId } from '../db/seed-database';
import type { JevJudge, JevQuestion, JevResult } from '../jev/jev-client';
import { type GraphResponse, type SuggestionsResponse, edgeType, firstSentence } from './graph-routes';

const SECRET = 'test-secret-'.padEnd(40, 'x');
const doc = (key: string): string => seedId(`document:${key}`);

/** A stand-in Jev that rates how related two items are by the words their titles share (4 at most). */
function relatednessJev(): { jev: JevJudge; control: { fail: boolean }; calls: string[] } {
  const control = { fail: false };
  const calls: string[] = [];
  const ask = vi.fn((purpose: string, state: unknown, questions: Record<string, JevQuestion>): Promise<JevResult> => {
    calls.push(purpose);
    if (control.fail) return Promise.reject(new Error(`Jev ${purpose} failed: TimeoutError`));
    const items = (state as { items: Record<string, { title: string }> }).items;
    const words = (id: string): Set<string> => new Set((items[id]?.title ?? '').toLowerCase().split(/[^\p{L}\d]+/u).filter((w) => w.length > 2));
    const answers: JevResult['answers'] = {};
    for (const [name, question] of Object.entries(questions)) {
      const [a = '', b = ''] = [...question.instructions.matchAll(/items\.(I\d+)/g)].map((m) => m[1] ?? '');
      const shared = [...words(a)].filter((w) => words(b).has(w)).length;
      answers[name] = { type: 'score', score: Math.min(4, 1 + shared * 2), confidence: 0.9, probabilities: {} };
    }
    return Promise.resolve({ answers, usage: { inputTokens: 100, outputTokens: 4 } });
  });
  return { jev: { choose: vi.fn(() => Promise.reject(new Error('not used'))), ask }, control, calls };
}

let idp: FakeIdp;
let server: TestServer;
let withJev: TestServer;
let judge: ReturnType<typeof relatednessJev>;
let owner: string;
let reader: string;
let admin: string;
let ownerId: string;

async function call<T>(target: TestServer, method: string, path: string, cookie?: string, body?: unknown): Promise<{ status: number; body: T }> {
  const res = await api(target, path, { method, ...(cookie ? { cookie } : {}), ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
  const text = await res.text();
  return { status: res.status, body: (text ? JSON.parse(text) : null) as T };
}

const graph = (cookie?: string, slug = 'networking') => call<GraphResponse>(server, 'GET', `/api/graph?space=${slug}`, cookie);
const titleOf = (g: GraphResponse, id: string): string => g.nodes.find((n) => n.id === id)?.title ?? id;

beforeAll(async () => {
  idp = await startFakeIdp({ clientId: 'kb-web', clientSecret: SECRET, sub: 'owner-sub' });
  server = await startTestServer({ AUTH_ISSUER: idp.issuer, AUTH_CLIENT_SECRET: SECRET, ADMIN_SUBS: 'seed:dat' });
  ownerId = (await seedDatabase(server.database.db, 'owner-sub')).ownerId;
  owner = await signIn(server);
  idp.setSub('reader-sub');
  reader = await signIn(server);
  idp.setSub('seed:dat');
  admin = await signIn(server);
  idp.setSub('owner-sub');
  judge = relatednessJev();
  withJev = await startTestServer({ AUTH_ISSUER: idp.issuer, AUTH_CLIENT_SECRET: SECRET, ADMIN_SUBS: 'seed:dat' }, {}, undefined, judge.jev);
  await seedDatabase(withJev.database.db, 'owner-sub');
});

afterAll(async () => {
  vi.unstubAllGlobals();
  await server.close();
  await withJev.close();
  await idp.close();
});

describe('GET /api/graph', () => {
  it("draws Networking as board C13: its texts and those they link to, with the board's edges", async () => {
    const { status, body } = await graph(owner);
    expect(status).toBe(200);
    expect(body.space.slug).toBe('networking');
    expect(body.suggestions).toBe(false);
    const titles = body.nodes.map((n) => n.title);
    // The board's 20 nodes (the seed's titles), plus the owner's own notes of Networking.
    for (const title of [
      'Subnet & CIDR',
      'Giao thức DHCP',
      'Giao thức ARP',
      'Tìm hiểu giao thức DNS',
      'Tìm hiểu HTTP',
      'TCP vs UDP',
      'ICMP Ping',
      'Packet Journey qua OSI',
      'Máy mới vào mạng',
      'Ghi chú: DHCP giả mạo',
      'HTTP/3 bằng hình',
      'lab-notes.docx',
      'VictoriaLogs: gom log tập trung',
      'Đọc log hệ thống với syslog',
      'Quá trình khởi động Linux',
      'Cấu hình swap',
      'Docker cơ bản',
      'Docker Compose',
      'Kiến trúc cụm K8s',
      'Dựng cụm K8s từng bước',
    ]) {
      expect(titles).toContain(title);
    }
    expect(titles).toEqual(expect.arrayContaining(['DHCP trên router nhà', 'So sánh ARP và NDP', 'subnet.xlsx']));
    // Unlinked texts of other Spaces stay out.
    expect(titles).not.toContain('Docker: storage và build');
    expect(titles).not.toContain('Học hàng tuần 11-07');
    // Chips: the graph's Space first, then by node count and name, the reader's own last.
    expect(body.spaces.map((s) => s.slug)).toEqual(['networking', 'linux', 'docker', 'kubernetes', 'observability', `personal-${ownerId}`]);

    const dhcp = body.nodes.find((n) => n.id === doc('dhcp'));
    expect(dhcp).toMatchObject({ degree: 6, backlinks: 3, origin: 'official', spaceSlug: 'networking', summary: 'Máy mới vào mạng chưa có IP.' });
    const edge = (a: string, b: string) => body.edges.find((e) => (e.source === doc(a) && e.target === doc(b)) || (e.source === doc(b) && e.target === doc(a)));
    expect(edge('dhcp', 'arp')).toMatchObject({ source: doc('dhcp'), type: 'leads-to', label: null, removable: false });
    expect(edge('tcp-udp', 'http')).toMatchObject({ source: doc('tcp-udp'), type: 'prerequisite' });
    expect(edge('docker-basics', 'k8s-arch')).toMatchObject({ type: 'prerequisite' });
    expect(edge('new-host', 'dhcp')).toMatchObject({ type: 'leads-to' });
    expect(edge('dhcp', 'osi')).toMatchObject({ type: 'related', label: null });
    expect(edge('lab-notes', 'dhcp')).toMatchObject({ type: 'related' });
    // One edge per pair (DHCP and ARP link each other twice and have a relation too).
    expect(body.edges.filter((e) => [e.source, e.target].sort().join() === [doc('dhcp'), doc('arp')].sort().join())).toHaveLength(1);
    // Every edge joins two nodes of the graph.
    const ids = new Set(body.nodes.map((n) => n.id));
    expect(body.edges.every((e) => ids.has(e.source) && ids.has(e.target))).toBe(true);
    expect(titleOf(body, doc('dhcp'))).toBe('Giao thức DHCP');
  });

  it('shows others only approved, visible texts, and never an edge to what they cannot read', async () => {
    await updateDocument(server.database.db, doc('icmp'), { hidden: true });
    try {
      const { body } = await graph(reader);
      const ids = new Set(body.nodes.map((n) => n.id));
      for (const hidden of ['dhcp-home', 'arp-ndp', 'subnet-xlsx-net', 'lab-notes', 'icmp']) expect(ids.has(doc(hidden))).toBe(false);
      expect(body.edges.every((e) => ids.has(e.source) && ids.has(e.target))).toBe(true);
      expect(body.spaces.some((s) => s.slug.startsWith('personal-'))).toBe(false);
      expect(body.nodes.find((n) => n.id === doc('dhcp'))).toMatchObject({ degree: 5, backlinks: 2 });
      // A guest reads the public graph like any reader.
      expect((await graph()).body.nodes.map((n) => n.id).sort()).toEqual([...ids].sort());
    } finally {
      await updateDocument(server.database.db, doc('icmp'), { hidden: false });
    }
  });

  it("refuses an unknown Space, someone else's personal one and a bad slug", async () => {
    expect(await graph(owner, 'nope')).toEqual({ status: 404, body: { error: 'not-found' } });
    expect(await graph(reader, `personal-${ownerId}`)).toEqual({ status: 403, body: { error: 'no-access' } });
    expect((await graph(owner, 'Bad Slug!')).status).toBe(400);
    expect((await graph(owner, `personal-${ownerId}`)).body.nodes.map((n) => n.title)).toContain('lab-notes.docx');
  });
});

describe('related edges', () => {
  const post = (cookie: string | undefined, body: unknown) => call<{ edge: GraphResponse['edges'][number] }>(server, 'POST', '/api/graph/edges', cookie, body);

  it("lets the author of either end draw one, stored from the author's own text so only its readers see it", async () => {
    const made = await post(owner, { sourceId: doc('dns'), targetId: doc('dhcp-home'), label: 'ví dụ' });
    expect(made.status).toBe(201);
    expect(made.body.edge).toMatchObject({ source: doc('dhcp-home'), target: doc('dns'), type: 'related', label: 'ví dụ', removable: true });
    // The reader cannot read the owner's note: the edge is not theirs to see.
    expect((await graph(reader)).body.edges.some((e) => e.id === made.body.edge.id)).toBe(false);
    expect((await graph(owner)).body.edges.find((e) => e.id === made.body.edge.id)?.removable).toBe(true);
    // Already linked, either way round.
    expect(await post(owner, { sourceId: doc('dhcp-home'), targetId: doc('dns') })).toEqual({ status: 409, body: { error: 'exists' } });
    expect(await post(admin, { sourceId: doc('dhcp'), targetId: doc('arp') })).toEqual({ status: 409, body: { error: 'exists' } });

    expect((await call(server, 'DELETE', `/api/graph/edges/${made.body.edge.id}`, reader)).status).toBe(404);
    expect((await call(server, 'DELETE', `/api/graph/edges/${made.body.edge.id}`, owner)).status).toBe(204);
    expect((await call(server, 'DELETE', `/api/graph/edges/${made.body.edge.id}`, owner)).status).toBe(404);
  });

  it('refuses a reader who wrote neither end, a written link, the same text, unreadable texts and bad bodies', async () => {
    expect(await post(reader, { sourceId: doc('dns'), targetId: doc('icmp') })).toEqual({ status: 403, body: { error: 'not-allowed' } });
    expect(await post(reader, { sourceId: doc('dns'), targetId: doc('dhcp-home') })).toEqual({ status: 403, body: { error: 'no-access' } });
    expect(await post(owner, { sourceId: doc('dhcp-home'), targetId: doc('dhcp-home') })).toEqual({ status: 400, body: { error: 'same-document' } });
    expect(await post(undefined, { sourceId: doc('dns'), targetId: doc('icmp') })).toEqual({ status: 401, body: { error: 'sign-in-required' } });
    for (const body of [{}, { sourceId: doc('dns') }, { sourceId: doc('dns'), targetId: doc('icmp'), extra: 1 }, { sourceId: doc('dns'), targetId: doc('icmp'), label: 'x'.repeat(41) }]) {
      expect((await post(owner, body)).status, JSON.stringify(body)).toBe(400);
    }
    expect((await post(owner, { sourceId: 'nope', targetId: doc('dns') })).status).toBe(404);
    const written = (await graph(owner)).body.edges.find((e) => e.source === doc('lab-notes') && e.target === doc('dhcp'));
    expect(written).toBeDefined();
    expect((await call(server, 'DELETE', `/api/graph/edges/${written?.id ?? ''}`, owner)).body).toEqual({ error: 'not-allowed' });
  });

  it('lets an admin link any two readable texts', async () => {
    const made = await post(admin, { sourceId: doc('dns'), targetId: doc('icmp') });
    expect(made.status).toBe(201);
    expect(made.body.edge.removable).toBe(true);
    // Everyone reads both ends: the edge is public, but only an admin or an author may erase it.
    expect((await graph(reader)).body.edges.find((e) => e.id === made.body.edge.id)?.removable).toBe(false);
    expect((await call(server, 'DELETE', `/api/graph/edges/${made.body.edge.id}`, reader)).status).toBe(403);
    expect((await call(server, 'DELETE', `/api/graph/edges/${made.body.edge.id}`, admin)).status).toBe(204);
  });
});

describe('GET /api/graph/suggestions', () => {
  const suggest = (target: TestServer, key: string, cookie: string) => call<SuggestionsResponse>(target, 'GET', `/api/graph/suggestions?document=${doc(key)}`, cookie);

  it('is off without Jev, and needs a session and a readable document', async () => {
    expect(await suggest(server, 'dhcp', owner)).toEqual({ status: 503, body: { error: 'jev-off' } });
    expect((await call(server, 'GET', `/api/graph/suggestions?document=${doc('dhcp')}`)).status).toBe(401);
  });

  it("rates the Space's unlinked texts the reader may link, best first, at most 3, and never links on its own", async () => {
    idp.setSub('seed:dat');
    const adminHere = await signIn(withJev);
    idp.setSub('owner-sub');
    const before = (await call<GraphResponse>(withJev, 'GET', '/api/graph?space=networking', adminHere)).body.edges.length;
    const { status, body } = await suggest(withJev, 'dhcp', adminHere);
    expect(status).toBe(200);
    expect(judge.calls.at(-1)).toBe('graph-suggest');
    expect(body.suggestions.length).toBeGreaterThan(0);
    expect(body.suggestions.length).toBeLessThanOrEqual(3);
    const linked = new Set([doc('arp'), doc('subnet'), doc('osi'), doc('dhcp-spoof'), doc('new-host')]);
    for (const s of body.suggestions) {
      expect(linked.has(s.id)).toBe(false);
      expect(s.id).not.toBe(doc('dhcp'));
      expect(s.relevance).toBeGreaterThanOrEqual(50);
      expect(s.spaceSlug).toBe('networking');
    }
    expect([...body.suggestions].sort((a, b) => b.relevance - a.relevance)).toEqual(body.suggestions);
    expect((await call<GraphResponse>(withJev, 'GET', '/api/graph?space=networking', adminHere)).body.edges.length).toBe(before);

    // The owner wrote none of DHCP: only their own texts of the Space can be suggested.
    const ownerHere = await signIn(withJev);
    const mine = await suggest(withJev, 'dhcp', ownerHere);
    expect(mine.status).toBe(200);
    const own = new Set([doc('dhcp-home'), doc('arp-ndp'), doc('subnet-xlsx-net')]);
    expect(mine.body.suggestions.every((s) => own.has(s.id))).toBe(true);

    judge.control.fail = true;
    try {
      expect(await suggest(withJev, 'dhcp', adminHere)).toEqual({ status: 502, body: { error: 'jev-failed' } });
    } finally {
      judge.control.fail = false;
    }
  });
});

describe('web client ↔ graph API', () => {
  it('parses the graph, suggestions and edges, and turns errors into codes', async () => {
    const session = await signIn(withJev);
    const realFetch = globalThis.fetch;
    vi.stubGlobal('fetch', (path: string, init: RequestInit = {}) => {
      const headers = new Headers(init.headers);
      headers.set('origin', withJev.origin);
      headers.set('cookie', session);
      return realFetch(`${withJev.origin}${path}`, { ...init, headers });
    });
    try {
      const g = await fetchGraph('networking', 'vi');
      expect(g.suggestions).toBe(true);
      expect(g.nodes.length).toBeGreaterThan(15);
      expect(Array.isArray(await fetchEdgeSuggestions(doc('dhcp'), 'vi'))).toBe(true);
      const edge = await addEdge(doc('dns'), doc('dhcp-home'));
      expect(edge).toMatchObject({ source: doc('dhcp-home'), removable: true });
      await removeEdge(edge.id);
      await expect(addEdge(doc('dns'), doc('icmp'))).rejects.toMatchObject({ status: 403, code: 'not-allowed' });
      await expect(fetchGraph('nope')).rejects.toBeInstanceOf(ApiError);
      await expect(fetchGraph('nope')).rejects.toMatchObject({ status: 404, code: 'not-found' });
    } finally {
      vi.stubGlobal('fetch', realFetch);
    }
  });
});

describe('edge types and summaries', () => {
  it('reads relation labels as the legend does', () => {
    expect(edgeType({ kind: 'relation', label: 'dẫn tới' })).toBe('leads-to');
    expect(edgeType({ kind: 'relation', label: 'bước 3' })).toBe('leads-to');
    expect(edgeType({ kind: 'relation', label: 'Cần trước' })).toBe('prerequisite');
    expect(edgeType({ kind: 'relation', label: 'liên quan' })).toBe('related');
    expect(edgeType({ kind: 'relation', label: null })).toBe('related');
    expect(edgeType({ kind: 'wikilink', label: 'dẫn tới' })).toBe('related');
  });

  it('keeps the first sentence of a passage when it is one', () => {
    expect(firstSentence('Máy mới vào mạng chưa có IP. Nó xin IP qua 4 bước.')).toBe('Máy mới vào mạng chưa có IP.');
    expect(firstSentence('Ngắn. Rồi một câu dài hơn nhiều.')).toBe('Ngắn. Rồi một câu dài hơn nhiều.');
    expect(firstSentence('Không có dấu chấm')).toBe('Không có dấu chấm');
  });
});
