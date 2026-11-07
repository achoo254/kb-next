/**
 * Knowledge journeys against the real routes: the web client's calls (apps/web/src/api/journey-api.ts) building
 * "Máy mới vào mạng" (ARP → DHCP → DNS → Packet Journey) and running it to the end, its progress still there when the
 * journey is opened again; who may read, build and tick; autosave's stale check; step ids (and ticks) surviving a
 * reorder; the "bước N" relations; Jev's next steps; the copy (Remix) and the Copilot's journey from sources; and the
 * text editor and review lifecycle around a journey.
 */
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { createJourney, fetchJourney, fetchJourneyForEditing, fetchNextSteps, fetchStepPool, markStepDone, saveJourney } from '../../../web/src/api/journey-api';
import { ApiError } from '../../../web/src/api/api-client';
import { type FakeIdp, startFakeIdp } from '../../test/fake-idp';
import { api, signIn } from '../../test/sign-in';
import { type TestServer, startTestServer } from '../../test/test-server';
import { listLinks } from '../access/content';
import { viewerFor } from '../access/viewer';
import { seedDatabase, seedId } from '../db/seed-database';
import type { JevJudge, JevQuestion, JevResult } from '../jev/jev-client';
import type { JourneyView, SavedJourney } from './journey-routes';

const SECRET = 'test-secret-'.padEnd(40, 'x');
const doc = (key: string): string => seedId(`document:${key}`);

/** Jev choosing among the next steps it is offered: ICMP first, then HTTP, the rest sharing what is left. */
function nextStepJev(): { jev: JevJudge; control: { fail: boolean }; offered: string[][] } {
  const control = { fail: false };
  const offered: string[][] = [];
  const ask = vi.fn((purpose: string, _state: unknown, questions: Record<string, JevQuestion>): Promise<JevResult> => {
    if (control.fail) return Promise.reject(new Error(`Jev ${purpose} failed`));
    const question = questions.next;
    if (question?.type !== 'choice') return Promise.reject(new Error('unexpected question'));
    const options = Object.entries(question.criteria).filter(([id]) => id !== 'none');
    offered.push(options.map(([, text]) => String(text)));
    const weight = (text: string): number => (text.startsWith('ICMP') ? 0.5 : text.startsWith('Tìm hiểu HTTP') ? 0.3 : 0.2 / options.length);
    const probabilities = Object.fromEntries(options.map(([id, text]) => [id, weight(String(text))]));
    const choice = options.find(([, text]) => String(text).startsWith('ICMP'))?.[0] ?? 'none';
    return Promise.resolve({ answers: { next: { type: 'choice', choice, confidence: 0.5, probabilities } }, usage: { inputTokens: 300, outputTokens: 2 } });
  });
  return { jev: { choose: vi.fn(() => Promise.reject(new Error('not used'))), ask }, control, offered };
}

let idp: FakeIdp;
let server: TestServer;
let judge: ReturnType<typeof nextStepJev>;
let owner: string;
let reader: string;
let ownerId: string;

async function call<T>(method: string, path: string, cookie?: string, body?: unknown): Promise<{ status: number; body: T }> {
  const res = await api(server, path, { method, ...(cookie ? { cookie } : {}), ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
  const text = await res.text();
  return { status: res.status, body: (text ? JSON.parse(text) : null) as T };
}

/** The browser of an account: same origin, its session cookie along. */
function browserAs(cookie: string): void {
  const realFetch = globalThis.fetch;
  vi.stubGlobal('fetch', (path: string, init: RequestInit = {}) => {
    if (/^https?:/.test(path)) return realFetch(path, init);
    const headers = new Headers(init.headers);
    headers.set('origin', server.origin);
    headers.set('cookie', cookie);
    return realFetch(`${server.origin}${path}`, { ...init, headers });
  });
}

const step = (kind: 'read' | 'lab' | 'quiz' | 'note', title: string, documentId: string | null, minutes = 5, id: string | null = null) => ({ id, kind, title, minutes, documentId, note: null });

beforeAll(async () => {
  idp = await startFakeIdp({ clientId: 'kb-web', clientSecret: SECRET, sub: 'owner-sub' });
  judge = nextStepJev();
  server = await startTestServer({ AUTH_ISSUER: idp.issuer, AUTH_CLIENT_SECRET: SECRET }, {}, undefined, judge.jev);
  ownerId = (await seedDatabase(server.database.db, 'owner-sub')).ownerId;
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

describe('building and running "Máy mới vào mạng"', () => {
  it('builds ARP → DHCP → DNS → Packet Journey, runs it to the end, and keeps the progress when opened again', async () => {
    browserAs(owner);
    const id = await createJourney({ title: 'Máy mới vào mạng' });
    const opened = await fetchJourneyForEditing(id);
    expect(opened).toMatchObject({ title: 'Máy mới vào mạng', status: 'draft', origin: 'own', mine: true, editable: true, steps: [], jev: true });
    expect(opened.space.kind).toBe('personal');

    const draft = {
      title: 'Máy mới vào mạng',
      planet: null,
      steps: [step('lab', 'ARP tìm MAC router', doc('arp'), 6), step('lab', 'DHCP xin IP', doc('dhcp'), 12), step('read', 'DNS đổi tên ra IP', doc('dns'), 8), step('read', 'Packet Journey', doc('osi'), 4)],
    };
    const saved = await saveJourney(id, draft, opened.rev);
    expect(saved.stepIds).toHaveLength(4);

    const run = await fetchJourney(id);
    expect(run.steps.map((s) => s.title)).toEqual(['ARP tìm MAC router', 'DHCP xin IP', 'DNS đổi tên ra IP', 'Packet Journey']);
    expect(run.steps.map((s) => s.document?.title)).toEqual(['Giao thức ARP', 'Giao thức DHCP', 'Tìm hiểu giao thức DNS', 'Packet Journey qua OSI']);
    expect(run.steps.map((s) => s.minutes)).toEqual([6, 12, 8, 4]);
    // The owner read ARP to the end (seed): that step is done already; the others wait.
    expect(run.steps.map((s) => s.done)).toEqual([true, false, false, false]);
    expect(run.steps[1]?.document?.summary).toBeTruthy();

    for (const s of run.steps.slice(1)) expect(await markStepDone(id, s.id, true)).toBe(true);

    // Opened again (a reload): every step done, as stored on the server.
    const again = await fetchJourney(id);
    expect(again.steps.map((s) => s.done)).toEqual([true, true, true, true]);
    // Unticking ARP leaves it done: it was read to the end.
    expect(await markStepDone(id, again.steps[0]?.id ?? '', false)).toBe(true);
    expect(await markStepDone(id, again.steps[3]?.id ?? '', false)).toBe(false);
    expect((await fetchJourney(id)).steps.map((s) => s.done)).toEqual([true, true, true, false]);
  });
});

describe('who reads, builds and ticks', () => {
  it('keeps a draft its author’s, and shows another account a published journey with only what it may read', async () => {
    const created = await call<{ id: string }>('POST', '/api/journeys', owner, { title: 'Riêng tôi', documents: [doc('dhcp-home'), doc('dhcp')] });
    expect(created.status).toBe(201);
    expect((await call('GET', `/api/journeys/${created.body.id}`, reader)).status).toBe(403);
    expect((await call('GET', `/api/journeys/${created.body.id}/edit`, reader)).status).toBe(403);
    expect((await call('GET', `/api/journeys/${created.body.id}`)).status).toBe(401);

    // The seeded official journey: everyone reads it, nobody but an admin builds it.
    const seeded = await call<JourneyView>('GET', `/api/journeys/${doc('new-host')}`, reader);
    expect(seeded.status).toBe(200);
    expect(seeded.body).toMatchObject({ title: 'Máy mới vào mạng', origin: 'official', status: 'approved', mine: false, editable: false });
    expect(seeded.body.steps.map((s) => s.title)).toEqual(['DHCP', 'ARP', 'DNS', 'TCP', 'HTTP']);
    expect(seeded.body.steps[1]?.note).toBe('Hỏi: router ở địa chỉ MAC nào?');
    expect((await call('GET', `/api/journeys/${doc('new-host')}/edit`, reader)).status).toBe(403);
    // Ticks are each account's own.
    const tick = await call<{ done: boolean }>('PUT', `/api/journeys/${doc('new-host')}/steps/${seeded.body.steps[0]?.id}/progress`, reader, { done: true });
    expect(tick.body).toEqual({ done: true });
    const ownerView = await call<JourneyView>('GET', `/api/journeys/${doc('new-host')}`, owner);
    expect(ownerView.body.steps[0]?.done).toBe(false);
    // A step of another journey is not this one's.
    expect((await call('PUT', `/api/journeys/${created.body.id}/steps/${seeded.body.steps[0]?.id}/progress`, owner, { done: true })).status).toBe(404);
    // A text is not a journey.
    expect((await call('GET', `/api/journeys/${doc('dhcp')}`, owner)).status).toBe(404);
  });

  it('never shows a reader the title or id of a step document they may not open: steps, text, graph, remix', async () => {
    // The owner's journey reads its own private note twice: once under the note's title (copied when added), once
    // under a label of its own. Published, it is read by another account.
    const { db } = server.database;
    const created = await call<{ id: string }>('POST', '/api/journeys', owner, { title: 'Có bước riêng', documents: [doc('dhcp'), doc('dhcp-home')] });
    const id = created.body.id;
    const edit = await call<JourneyView>('GET', `/api/journeys/${id}/edit`, owner);
    const saved = await call<SavedJourney>('PUT', `/api/journeys/${id}`, owner, {
      title: 'Có bước riêng',
      steps: [step('lab', 'Giao thức DHCP', doc('dhcp')), step('read', 'DHCP trên router nhà', doc('dhcp-home')), step('read', 'Thử ở nhà', doc('dhcp-home')), step('read', 'DHCP', doc('dhcp-home'))],
      baseRev: edit.body.rev,
    });
    expect(saved.status).toBe(200);
    // Its author still sees every step as written.
    const mine = await call<JourneyView>('GET', `/api/journeys/${id}/edit`, owner);
    expect(mine.body.steps.map((s) => [s.title, s.restricted, s.document?.id ?? null])).toEqual([
      ['Giao thức DHCP', false, doc('dhcp')],
      ['DHCP trên router nhà', false, doc('dhcp-home')],
      ['Thử ở nhà', false, doc('dhcp-home')],
      ['DHCP', false, doc('dhcp-home')],
    ]);

    const { sql } = await import('drizzle-orm');
    await db.execute(sql`update documents set status = 'approved', origin = 'community', space_id = ${seedId('space:net')} where id = ${id}`);
    const seen = await call<JourneyView>('GET', `/api/journeys/${id}`, reader);
    // The note's own title (or a label it starts with) is hidden; a label of the author's own stays.
    expect(seen.body.steps.map((s) => [s.title, s.restricted, s.document?.id ?? null])).toEqual([
      ['Giao thức DHCP', false, doc('dhcp')],
      ['', true, null],
      ['Thử ở nhà', true, null],
      ['', true, null],
    ]);
    const raw = JSON.stringify(seen.body);
    expect(raw).not.toContain(doc('dhcp-home'));
    expect(raw).not.toContain('router nhà');

    // The journey's text, as any reader reads it.
    const text = JSON.stringify((await call('GET', `/api/documents/${id}`, reader)).body);
    expect(text).toContain('Tài liệu riêng tư');
    expect(text).not.toContain('router nhà');
    expect(text).not.toContain(doc('dhcp-home'));

    // The "bước N" relations reach the note for its author only, in the access layer and on the Graph.
    const ownerViewer = await viewerFor(db, new Set(), ownerId);
    expect((await listLinks(db, ownerViewer, id))?.map((l) => l.targetId)).toEqual([doc('dhcp'), doc('dhcp-home')]);
    const { users } = await import('../db/schema');
    const { eq } = await import('drizzle-orm');
    const [readerRow] = await db.select({ id: users.id }).from(users).where(eq(users.sub, 'reader-sub'));
    const readerViewer = await viewerFor(db, new Set(), readerRow?.id ?? '');
    expect((await listLinks(db, readerViewer, id))?.map((l) => l.targetId)).toEqual([doc('dhcp')]);
    const graph = JSON.stringify((await call('GET', '/api/graph?space=networking', reader)).body);
    expect(graph).toContain(id);
    expect(graph).not.toContain(doc('dhcp-home'));
    expect(graph).not.toContain('router nhà');

    // A remix by the reader copies neither: a neutral title, no document.
    const remix = await call<{ id: string }>('POST', '/api/journeys', reader, { from: id });
    const copy = await call<JourneyView>('GET', `/api/journeys/${remix.body.id}/edit`, reader);
    expect(copy.body.steps.map((s) => [s.title, s.document?.id ?? null])).toEqual([
      ['Giao thức DHCP', doc('dhcp')],
      ['Tài liệu riêng tư', null],
      ['Thử ở nhà', null],
      ['Tài liệu riêng tư', null],
    ]);
    expect(JSON.stringify((await call('GET', `/api/documents/${remix.body.id}`, reader)).body)).not.toContain('router nhà');
  });
});

describe('saving the builder', () => {
  it('refuses a stale save, documents the account may not read, and other journeys as steps', async () => {
    const { body } = await call<{ id: string }>('POST', '/api/journeys', owner, {});
    const view = await call<JourneyView>('GET', `/api/journeys/${body.id}/edit`, owner);
    const first = await call<SavedJourney>('PUT', `/api/journeys/${body.id}`, owner, { title: 'Một', steps: [step('read', 'DHCP', doc('dhcp'))], baseRev: view.body.rev });
    expect(first.status).toBe(200);
    const stale = await call<{ error: string; rev: string }>('PUT', `/api/journeys/${body.id}`, owner, { title: 'Hai', steps: [], baseRev: view.body.rev });
    expect(stale).toMatchObject({ status: 409, body: { error: 'stale', rev: first.body.rev } });

    // Someone else's private text, and a journey, are no step documents.
    const secret = await call<{ id: string }>('POST', '/api/journeys', reader, {});
    const theirs = await call<JourneyView>('GET', `/api/journeys/${secret.body.id}/edit`, reader);
    expect((await call('PUT', `/api/journeys/${secret.body.id}`, reader, { title: 'X', steps: [step('read', 'Của chủ', doc('dhcp-home'))], baseRev: theirs.body.rev })).body).toEqual({ error: 'unknown-document' });
    expect((await call('PUT', `/api/journeys/${secret.body.id}`, reader, { title: 'X', steps: [step('read', 'Lối đi', doc('new-host'))], baseRev: theirs.body.rev })).body).toEqual({ error: 'unknown-document' });
    expect((await call('PUT', `/api/journeys/${secret.body.id}`, owner, { title: 'X', steps: [], baseRev: theirs.body.rev })).status).toBe(403);
    expect((await call('PUT', `/api/journeys/${body.id}`, owner, { title: 'X', steps: [{ ...step('read', '', null) }], baseRev: first.body.rev })).body).toEqual({ error: 'invalid-body' });
    expect((await call('PUT', `/api/journeys/${body.id}`, owner, { title: 'X', steps: [step('read', 'A', null, 0)], baseRev: first.body.rev })).body).toEqual({ error: 'invalid-body' });
  });

  it('keeps step ids, and the ticks on them, when steps are reordered; drops the document of a note step', async () => {
    const { body } = await call<{ id: string }>('POST', '/api/journeys', owner, { documents: [doc('dhcp'), doc('dns'), doc('http')] });
    const view = await call<JourneyView>('GET', `/api/journeys/${body.id}/edit`, owner);
    const [a, b, c] = view.body.steps;
    if (!a || !b || !c) throw new Error('three steps expected');
    expect(view.body.steps.map((s) => [s.kind, s.minutes])).toEqual([
      ['lab', 10],
      ['lab', 10],
      ['lab', 10],
    ]);
    await call('PUT', `/api/journeys/${body.id}/steps/${b.id}/progress`, owner, { done: true });
    const saved = await call<SavedJourney>('PUT', `/api/journeys/${body.id}`, owner, {
      title: 'Đảo thứ tự',
      steps: [
        { ...step('lab', c.title, doc('http'), 7, c.id) },
        { ...step('lab', b.title, doc('dns'), 9, b.id) },
        { id: null, kind: 'note', title: 'Nghỉ chút', minutes: 2, documentId: doc('dhcp'), note: '  Uống nước rồi đi tiếp.  ' },
      ],
      baseRev: view.body.rev,
    });
    expect(saved.body.stepIds.slice(0, 2)).toEqual([c.id, b.id]);
    const after = await call<JourneyView>('GET', `/api/journeys/${body.id}`, owner);
    expect(after.body.title).toBe('Đảo thứ tự');
    expect(after.body.steps.map((s) => [s.title, s.done, s.document?.id ?? null, s.note])).toEqual([
      [c.title, false, doc('http'), null],
      [b.title, true, doc('dns'), null],
      ['Nghỉ chút', false, null, 'Uống nước rồi đi tiếp.'],
    ]);
  });
});

describe('Jev and the documents to pick', () => {
  it('suggests next steps from the step Space, leaving out what the journey holds, and lists the pool', async () => {
    browserAs(owner);
    const id = await createJourney({ documents: [doc('dhcp'), doc('arp')] });
    const next = await fetchNextSteps(id);
    expect(next.map((s) => [s.title, s.probability])).toEqual([
      ['ICMP Ping', 0.5],
      ['Tìm hiểu HTTP', 0.3],
    ]);
    expect(next[0]?.space.slug).toBe('networking');
    const offered = judge.offered.at(-1) ?? [];
    expect(offered.some((text) => text.startsWith('Giao thức DHCP'))).toBe(false);
    expect(offered.some((text) => text.startsWith('Máy mới vào mạng'))).toBe(false);

    const pool = await fetchStepPool(id);
    expect(pool.slice(0, 3).map((d) => d.title)).toEqual(['Giao thức ARP', 'Giao thức DHCP', 'Tìm hiểu giao thức DNS']);
    expect(pool.some((d) => d.type === 'journey')).toBe(false);

    judge.control.fail = true;
    expect(await fetchNextSteps(id).catch((e: unknown) => e instanceof ApiError && e.code)).toBe('jev-failed');
    judge.control.fail = false;
  });

  it('says Jev is off when the server has none', async () => {
    const plain = await startTestServer({ AUTH_ISSUER: idp.issuer, AUTH_CLIENT_SECRET: SECRET });
    try {
      await seedDatabase(plain.database.db, 'owner-sub');
      const cookie = await signIn(plain);
      const created = await api(plain, '/api/journeys', { method: 'POST', cookie, body: '{}' });
      const { id } = (await created.json()) as { id: string };
      const view = (await (await api(plain, `/api/journeys/${id}/edit`, { cookie })).json()) as JourneyView;
      expect(view.jev).toBe(false);
      const res = await api(plain, `/api/journeys/${id}/suggestions`, { cookie });
      expect([res.status, await res.json()]).toEqual([503, { error: 'jev-off' }]);
    } finally {
      await plain.close();
    }
  });
});

describe('copies and journeys from elsewhere', () => {
  it('remixes a journey the account reads into a draft of its own, without what it may not read', async () => {
    const remix = await call<{ id: string }>('POST', '/api/journeys', reader, { from: doc('new-host') });
    expect(remix.status).toBe(201);
    const view = await call<JourneyView>('GET', `/api/journeys/${remix.body.id}/edit`, reader);
    expect(view.body).toMatchObject({ title: 'Máy mới vào mạng', status: 'draft', origin: 'own', mine: true });
    expect(view.body.steps.map((s) => s.title)).toEqual(['DHCP', 'ARP', 'DNS', 'TCP', 'HTTP']);
    expect((await call('POST', '/api/journeys', reader, { from: doc('dhcp') })).status).toBe(404);
  });

  it('makes a journey from an answer’s sources: one step per readable document, cut to one line', async () => {
    const made = await call<{ id: string }>('POST', '/api/journeys', reader, { title: 'Máy mới nhận IP thế nào?', documents: [doc('dhcp'), doc('dhcp-home'), doc('dhcp'), doc('dhcp-spoof')] });
    const view = await call<JourneyView>('GET', `/api/journeys/${made.body.id}/edit`, reader);
    expect(view.body.title).toBe('Máy mới nhận IP thế nào?');
    expect(view.body.steps.map((s) => [s.kind, s.title])).toEqual([
      ['lab', 'Giao thức DHCP'],
      ['read', 'Ghi chú: DHCP giả mạo'],
    ]);
  });
});

describe('a journey among texts', () => {
  it('is never opened in the text editor, and is published by its author like any text', async () => {
    const empty = await call<{ id: string }>('POST', '/api/journeys', owner, { title: 'Chưa có bước' });
    expect((await call('GET', `/api/documents/${empty.body.id}/edit`, owner)).body).toEqual({ error: 'journey' });
    expect((await call('POST', `/api/documents/${empty.body.id}/submit`, owner, {})).body).toEqual({ error: 'body-required' });

    const full = await call<{ id: string }>('POST', '/api/journeys', owner, { title: 'Có bước', documents: [doc('dhcp')] });
    const before = await call<JourneyView>('GET', `/api/journeys/${full.body.id}/edit`, owner);
    expect((await call('PUT', `/api/documents/${full.body.id}`, owner, { title: 'Sửa tay', body: 'x', baseRev: before.body.rev })).status).toBe(409);
    expect((await call('POST', `/api/documents/${full.body.id}/submit`, owner, {})).status).toBe(200);
    // Published, it stays its author's to change in the builder.
    expect((await call<JourneyView>('GET', `/api/journeys/${full.body.id}/edit`, owner)).status).toBe(200);
    expect((await call<JourneyView>('GET', `/api/journeys/${full.body.id}`, owner)).body).toMatchObject({ status: 'approved', editable: true });
  });
});

