import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { type FakeIdp, startFakeIdp } from '../../test/fake-idp';
import { api, signIn } from '../../test/sign-in';
import { type TestServer, startTestServer } from '../../test/test-server';
import { createCanvas, deleteCanvas, fetchCanvas, fetchCanvasSuggestion, fetchCanvases, saveCanvas } from '../../../web/src/api/canvas-api';
import { readStored } from '../canvas/canvas-data';
import { seedDatabase, seedId } from '../db/seed-database';
import type { JevJudge, JevQuestion, JevResult } from '../jev/jev-client';
import type { CanvasListResponse, CanvasResponse } from './canvas-routes';

const SECRET = 'test-secret-'.padEnd(40, 'x');
const SEEDED = seedId('canvas:dhcp-a-z');
const doc = (key: string): string => seedId(`document:${key}`);

/** Jev rating the idea and the DORA diagram 0.75 (3 of 4) and every other pair 0.25. */
function pairJev(): { jev: JevJudge; control: { fail: boolean }; states: unknown[] } {
  const control = { fail: false };
  const states: unknown[] = [];
  const ask = vi.fn((purpose: string, state: unknown, questions: Record<string, JevQuestion>): Promise<JevResult> => {
    states.push(state);
    if (control.fail) return Promise.reject(new Error(`Jev ${purpose} failed`));
    const items = (state as { items: Record<string, { title: string }> }).items;
    const answers: JevResult['answers'] = {};
    for (const [name, question] of Object.entries(questions)) {
      const titles = [...question.instructions.matchAll(/items\.(I\d+)/g)].map((m) => items[m[1] ?? '']?.title ?? '');
      const hit = titles.some((t) => t.startsWith('Vì sao')) && titles.includes('DORA 4 bước');
      answers[name] = { type: 'score', score: hit ? 3 : 1, confidence: 0.9, probabilities: {} };
    }
    return Promise.resolve({ answers, usage: { inputTokens: 50, outputTokens: 2 } });
  });
  return { jev: { choose: vi.fn(() => Promise.reject(new Error('not used'))), ask }, control, states };
}

let idp: FakeIdp;
let server: TestServer;
let judge: ReturnType<typeof pairJev>;
let owner: string;
let reader: string;

async function call<T>(method: string, path: string, cookie?: string, body?: unknown): Promise<{ status: number; body: T }> {
  const res = await api(server, path, { method, ...(cookie ? { cookie } : {}), ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
  const text = await res.text();
  return { status: res.status, body: (text ? JSON.parse(text) : null) as T };
}

beforeAll(async () => {
  idp = await startFakeIdp({ clientId: 'kb-web', clientSecret: SECRET, sub: 'owner-sub' });
  judge = pairJev();
  server = await startTestServer({ AUTH_ISSUER: idp.issuer, AUTH_CLIENT_SECRET: SECRET }, {}, undefined, judge.jev);
  await seedDatabase(server.database.db, 'owner-sub');
  owner = await signIn(server);
  idp.setSub('reader-sub');
  reader = await signIn(server);
  idp.setSub('owner-sub');
});

afterAll(async () => {
  vi.unstubAllGlobals();
  await server.close();
  await idp.close();
});

describe('opening a canvas', () => {
  it("gives the owner the seeded board of C15, its documents resolved through what the owner may read", async () => {
    const { status, body } = await call<CanvasResponse>('GET', `/api/canvases/${SEEDED}`, owner);
    expect(status).toBe(200);
    expect(body.title).toBe('DHCP từ A đến Z');
    expect(body.space?.slug).toBe('networking');
    expect(body.canvas.cards.map((c) => [c.id, c.kind, c.x, c.y])).toEqual([
      ['idea', 'idea', 250, 190],
      ['lab', 'document', 560, 300],
      ['diag', 'diagram', 960, 170],
      ['file', 'document', 980, 470],
      ['q', 'answer', 300, 520],
      ['risk', 'risk', 640, 610],
      ['url', 'link', 780, 200],
    ]);
    expect(body.canvas.connections).toHaveLength(6);
    expect(body.documents[doc('dhcp')]).toEqual({ title: 'Giao thức DHCP', type: 'lab', origin: 'official', status: 'approved', headings: ['Broadcast là gì', 'Lease và gia hạn'] });
    expect(body.documents[doc('lab-notes')]).toMatchObject({ title: 'lab-notes.docx', origin: 'own' });
  });

  it("is someone else's for nobody: another account, a guest and a bad id get not-found or sign-in", async () => {
    expect(await call('GET', `/api/canvases/${SEEDED}`, reader)).toEqual({ status: 404, body: { error: 'not-found' } });
    expect(await call('GET', `/api/canvases/${SEEDED}`)).toEqual({ status: 401, body: { error: 'sign-in-required' } });
    expect((await call('GET', '/api/canvases/nope', owner)).status).toBe(404);
    expect((await call<CanvasListResponse>('GET', '/api/canvases', reader)).body.canvases).toEqual([]);
  });
});

describe('creating, listing, saving, deleting', () => {
  it("lists the owner's canvases, of one Space when asked, and creates one in a Space the owner sees", async () => {
    const made = await call<CanvasResponse>('POST', '/api/canvases', owner, { title: '  Lối vào mạng ', space: 'networking' });
    expect(made.status).toBe(201);
    expect(made.body).toMatchObject({ title: 'Lối vào mạng', space: { slug: 'networking' }, canvas: { rev: 0, cards: [], connections: [] }, documents: {} });
    const loose = await call<CanvasResponse>('POST', '/api/canvases', owner, { title: 'Nháp' });
    expect(loose.body.space).toBeNull();

    const all = await call<CanvasListResponse>('GET', '/api/canvases', owner);
    expect(all.body.canvases.map((c) => c.title)).toEqual(['Nháp', 'Lối vào mạng', 'DHCP từ A đến Z']);
    expect(all.body.canvases.find((c) => c.id === SEEDED)).toMatchObject({ spaceSlug: 'networking', cards: 7 });
    const networking = await call<CanvasListResponse>('GET', '/api/canvases?space=networking', owner);
    expect(networking.body.canvases.map((c) => c.title)).toEqual(['Lối vào mạng', 'DHCP từ A đến Z']);

    expect((await call('POST', '/api/canvases', owner, { title: 'x', space: 'nope' })).status).toBe(404);
    expect((await call('POST', '/api/canvases', reader, { title: 'x', space: (await call<{ spaces: Array<{ slug: string; kind: string }> }>('GET', '/api/spaces', owner)).body.spaces.find((s) => s.kind === 'personal')?.slug })).status).toBe(403);
    for (const body of [{}, { title: '' }, { title: 'x'.repeat(121) }, { title: 'x', extra: 1 }]) expect((await call('POST', '/api/canvases', owner, body)).status, JSON.stringify(body)).toBe(400);

    expect((await call('DELETE', `/api/canvases/${loose.body.id}`, reader)).status).toBe(404);
    expect((await call('DELETE', `/api/canvases/${loose.body.id}`, owner)).status).toBe(204);
    expect((await call('GET', `/api/canvases/${loose.body.id}`, owner)).status).toBe(404);
  });

  it('saves a newer change, refuses an older one (another tab), and checks every card', async () => {
    const made = (await call<CanvasResponse>('POST', '/api/canvases', owner, { title: 'Lưu', space: 'networking' })).body;
    const cards = [
      { id: 'c1', kind: 'note', x: 10, y: 20, w: 220, title: 'Ghi chú', body: 'nội dung' },
      { id: 'c2', kind: 'document', x: 300, y: 20, w: 260, title: '', documentId: doc('dns') },
      { id: 'c3', kind: 'link', x: 10, y: 300, w: 200, title: 'RFC', url: 'https://datatracker.ietf.org/doc/html/rfc2131' },
    ];
    const save = (rev: number, extra: Record<string, unknown> = {}, cookie = owner) =>
      call<{ updatedAt: string; rev: number; error?: string }>('PUT', `/api/canvases/${made.id}`, cookie, { title: 'Lưu', canvas: { rev, cards, connections: [{ id: 'k1', from: 'c1', to: 'c2' }], ...extra } });
    expect((await save(5)).status).toBe(200);
    expect((await save(5)).status).toBe(200);
    expect(await save(4)).toMatchObject({ status: 409, body: { error: 'stale', rev: 5 } });
    expect((await save(9)).status).toBe(200);
    const back = (await call<CanvasResponse>('GET', `/api/canvases/${made.id}`, owner)).body;
    expect(back.canvas.rev).toBe(9);
    expect(back.canvas.connections).toEqual([{ id: 'k1', from: 'c1', to: 'c2' }]);
    expect(back.documents[doc('dns')]?.title).toBe('Tìm hiểu giao thức DNS');
    expect(back.space?.slug).toBe('networking');

    expect((await save(10, {}, reader)).status).toBe(404);
    const bad = [
      { connections: [{ id: 'k1', from: 'c1', to: 'zz' }] },
      { connections: [{ id: 'k1', from: 'c1', to: 'c1' }] },
      { connections: [{ id: 'k1', from: 'c1', to: 'c2' }, { id: 'k2', from: 'c2', to: 'c1' }] },
      { cards: [...cards, { ...cards[0] }] },
      { cards: [{ id: 'c9', kind: 'document', x: 0, y: 0, w: 200, title: '' }] },
      { cards: [{ id: 'c9', kind: 'link', x: 0, y: 0, w: 200, title: '', url: 'javascript:alert(1)' }] },
      { cards: [{ id: 'c9', kind: 'note', x: 0, y: 0, w: 100, title: '' }] },
      { cards: [{ id: 'bad id', kind: 'note', x: 0, y: 0, w: 200, title: '' }] },
      { cards: [{ id: 'c9', kind: 'note', x: Number.MAX_SAFE_INTEGER, y: 0, w: 200, title: '' }] },
      { rev: -1 },
    ];
    for (const extra of bad) expect((await save(20, { connections: [], ...extra })).status, JSON.stringify(extra)).toBe(400);
    // A new document card must be one the owner may read now.
    const others = [{ id: 'c9', kind: 'document', x: 0, y: 0, w: 200, title: '', documentId: doc('dhcp-home') }];
    idp.setSub('reader-sub');
    const readerCanvas = (await call<CanvasResponse>('POST', '/api/canvases', reader, { title: 'Của người đọc' })).body;
    expect((await call('PUT', `/api/canvases/${readerCanvas.id}`, reader, { title: 'x', canvas: { rev: 1, cards: others, connections: [] } })).body).toEqual({ error: 'no-access' });
    idp.setSub('owner-sub');
  });

  it('takes a canvas body bigger than the rest of the API does', async () => {
    const made = (await call<CanvasResponse>('POST', '/api/canvases', owner, { title: 'Lớn' })).body;
    const cards = Array.from({ length: 150 }, (_, i) => ({ id: `c${i}`, kind: 'note', x: i * 10, y: 0, w: 220, title: `Thẻ ${i}`, body: 'x'.repeat(200) }));
    expect((await call('PUT', `/api/canvases/${made.id}`, owner, { title: 'Lớn', canvas: { rev: 1, cards, connections: [] } })).status).toBe(200);
    const tooMany = Array.from({ length: 201 }, (_, i) => ({ id: `c${i}`, kind: 'note', x: 0, y: 0, w: 220, title: '' }));
    expect((await call('PUT', `/api/canvases/${made.id}`, owner, { title: 'Lớn', canvas: { rev: 2, cards: tooMany, connections: [] } })).status).toBe(400);
  });
});

describe('POST /api/canvases/:id/suggestion', () => {
  it("names Jev's best pair of unconnected cards, and the next one when that pair is set aside", async () => {
    const first = await call<{ suggestion: { from: string; to: string; relevance: number } | null }>('POST', `/api/canvases/${SEEDED}/suggestion`, owner, {});
    expect(first).toEqual({ status: 200, body: { suggestion: { from: 'idea', to: 'diag', relevance: 75 } } });
    // Connected pairs are never asked; documents are read through what the owner may read.
    const asked = JSON.stringify(judge.states.at(-1));
    expect(asked).toContain('Giao thức DHCP');
    const next = await call<{ suggestion: unknown }>('POST', `/api/canvases/${SEEDED}/suggestion`, owner, { exclude: [['diag', 'idea']] });
    expect(next.body.suggestion).toBeNull();
    expect((await call('POST', `/api/canvases/${SEEDED}/suggestion`, reader, {})).status).toBe(404);
    judge.control.fail = true;
    try {
      expect(await call('POST', `/api/canvases/${SEEDED}/suggestion`, owner, {})).toEqual({ status: 502, body: { error: 'jev-failed' } });
    } finally {
      judge.control.fail = false;
    }
  });
});

describe('web client ↔ canvas API', () => {
  it('parses every answer the canvas screens use', async () => {
    const realFetch = globalThis.fetch;
    vi.stubGlobal('fetch', (path: string, init: RequestInit = {}) => {
      const headers = new Headers(init.headers);
      headers.set('origin', server.origin);
      headers.set('cookie', owner);
      return realFetch(`${server.origin}${path}`, { ...init, headers });
    });
    try {
      expect((await fetchCanvases('networking')).some((c) => c.id === SEEDED)).toBe(true);
      const seeded = await fetchCanvas(SEEDED);
      expect(seeded.canvas.cards).toHaveLength(7);
      expect(await fetchCanvasSuggestion(SEEDED)).toEqual({ from: 'idea', to: 'diag', relevance: 75 });
      const made = await createCanvas('Từ web', 'networking');
      const saved = await saveCanvas(made.id, 'Từ web', { rev: 3, cards: [{ id: 'c1', kind: 'idea', x: 0, y: 0, w: 220, title: 'Ý' }], connections: [] }, true);
      expect(saved.rev).toBe(3);
      await expect(saveCanvas(made.id, 'Từ web', { rev: 2, cards: [], connections: [] })).rejects.toMatchObject({ status: 409, code: 'stale' });
      await deleteCanvas(made.id);
      await expect(fetchCanvas(made.id)).rejects.toMatchObject({ status: 404, code: 'not-found' });
    } finally {
      vi.stubGlobal('fetch', realFetch);
    }
  });
});

describe('stored canvases', () => {
  it('read back as empty when they no longer parse, keeping their Space', () => {
    const spaceId = seedId('space:net');
    expect(readStored({ spaceId, canvas: { rev: 1, cards: [{ id: 'x' }], connections: [] } })).toEqual({ spaceId, canvas: { rev: 0, cards: [], connections: [] } });
    expect(readStored(null)).toEqual({ spaceId: null, canvas: { rev: 0, cards: [], connections: [] } });
  });
});
