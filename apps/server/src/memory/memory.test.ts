/**
 * The AI memory end to end, without Meilisearch: `remember` and `memory_index` through POST /mcp with the IdP's access
 * tokens (fake IdP), then the account's /api/memory on the web — settings, the topic list, undo and forgetting all.
 */
import { eq } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createUser } from '../../test/content-fixtures';
import { type FakeIdp, startFakeIdp } from '../../test/fake-idp';
import { api, signIn } from '../../test/sign-in';
import { type TestServer, startTestServer } from '../../test/test-server';
import { users } from '../db/schema';

const SECRET = 'test-secret-'.padEnd(40, 'x');

let idp: FakeIdp;
let server: TestServer;
let cookie = '';

beforeAll(async () => {
  idp = await startFakeIdp({ clientId: 'kb-web', clientSecret: SECRET, sub: 'alice-sub' });
  server = await startTestServer({ AUTH_ISSUER: idp.issuer, AUTH_CLIENT_SECRET: SECRET });
  cookie = await signIn(server);
  await createUser(server.database.db, 'bob-sub');
});

afterAll(async () => {
  await server?.close();
  await idp?.close();
});

let nextId = 1;
/** A tool's structured answer, or its error code. */
async function tool(sub: string, name: string, args: Record<string, unknown> = {}): Promise<{ ok: true; data: Record<string, unknown> } | { ok: false; code: string }> {
  const token = idp.accessToken(sub, { aud: `${server.origin}/mcp`, scope: 'kb:read kb:write' });
  const res = await fetch(`${server.origin}/mcp`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', accept: 'application/json', authorization: `Bearer ${token}` },
    body: JSON.stringify({ jsonrpc: '2.0', id: nextId++, method: 'tools/call', params: { name, arguments: args } }),
  });
  const body = (await res.json()) as { result: { isError: boolean; structuredContent?: Record<string, unknown>; content: Array<{ text: string }> } };
  if (!body.result.isError) return { ok: true, data: body.result.structuredContent ?? {} };
  return { ok: false, code: (JSON.parse(body.result.content[0]?.text ?? '{}') as { error: { code: string } }).error.code };
}

async function data(sub: string, name: string, args: Record<string, unknown> = {}): Promise<Record<string, unknown>> {
  const answer = await tool(sub, name, args);
  if (!answer.ok) throw new Error(`${name} failed: ${answer.code}`);
  return answer.data;
}

interface MemoryBody {
  paused: boolean;
  sensitive: boolean;
  topics: Array<{ id: string; title: string; summary: string; chatId: number | null }>;
}
const memory = async (): Promise<MemoryBody> => (await (await api(server, '/api/memory', { cookie })).json()) as MemoryBody;
const undoTokenOf = (answer: Record<string, unknown>): string => new URL(String(answer.undo_url)).searchParams.get('undo') ?? '';

describe('remember and memory_index', () => {
  it('creates a topic, then appends to it, and lists it in the index', async () => {
    const first = await data('alice-sub', 'remember', { topic: 'Máy tính', fact: 'Máy chính là PC Windows.' });
    expect(first).toMatchObject({ remembered: true, action: 'created', topic: 'Máy tính' });
    const again = await data('alice-sub', 'remember', { topic: 'máy  TÍNH', fact: 'Mac mini chỉ dùng khi được yêu cầu.' });
    expect(again).toMatchObject({ action: 'appended', memory_id: first.memory_id });

    const index = await data('alice-sub', 'memory_index');
    expect(index.paused).toBe(false);
    expect(index.text).toContain('Máy tính');
    expect(index.text).toContain('Mac mini');
    const doc = await data('alice-sub', 'get_document', { id: String(first.memory_id) });
    expect(doc).toMatchObject({ visibility: 'private', space: { kind: 'personal' } });
    expect(doc.markdown).toMatch(/- \d{4}-\d{2}-\d{2}: Máy chính là PC Windows\./);
  });

  it('keeps a topic of one conversation out of the general index and out of other conversations', async () => {
    await data('alice-sub', 'remember', { topic: 'Nhóm thử', fact: 'Nhóm này họp thứ Hai.', chat_id: 45 });
    expect((await data('alice-sub', 'memory_index')).text).not.toContain('Nhóm thử');
    expect((await data('alice-sub', 'memory_index', { chat_id: 46 })).text).not.toContain('Nhóm thử');
    const here = (await data('alice-sub', 'memory_index', { chat_id: 45 })).text as string;
    expect(here).toContain('Nhóm thử');
    expect(here).toContain('Máy tính');
  });

  it('never shows one account’s memory to another', async () => {
    expect((await data('bob-sub', 'memory_index')).topics).toEqual([]);
  });

  it('refuses secrets, identity numbers and sensitive topics while those are off', async () => {
    expect(await tool('alice-sub', 'remember', { topic: 'DB', fact: 'DB_PASSWORD=Tr0ub4dor&3xyz' })).toEqual({ ok: false, code: 'secret_detected' });
    expect(await tool('alice-sub', 'remember', { topic: 'Giấy tờ', fact: 'Số CCCD là 001234567890' })).toEqual({ ok: false, code: 'never_remembered' });
    expect(await tool('alice-sub', 'remember', { topic: 'Sức khoẻ', fact: 'Bị dị ứng.', sensitive: true })).toEqual({ ok: false, code: 'sensitive_off' });
  });
});

const undo = (token: string): Promise<Response> =>
  api(server, '/api/memory/undo', { method: 'POST', cookie, headers: { 'content-type': 'application/json' }, body: JSON.stringify({ token }) });
const setMemory = (change: Record<string, boolean>): Promise<Response> =>
  api(server, '/api/memory/settings', { method: 'PUT', cookie, headers: { 'content-type': 'application/json' }, body: JSON.stringify(change) });

describe('memory writes stay whole', () => {
  it('keeps both facts of two remember calls at once on one new topic, in one topic', async () => {
    const [a, b] = await Promise.all([
      data('alice-sub', 'remember', { topic: 'Song song', fact: 'Điều thứ nhất.' }),
      data('alice-sub', 'remember', { topic: 'Song song', fact: 'Điều thứ hai.' }),
    ]);
    expect(a.memory_id).toBe(b.memory_id);
    expect([a.action, b.action].sort()).toEqual(['appended', 'created']);
    const markdown = (await data('alice-sub', 'get_document', { id: String(a.memory_id) })).markdown as string;
    expect(markdown).toContain('Điều thứ nhất.');
    expect(markdown).toContain('Điều thứ hai.');
  });

  it('undoes an older write by taking out only its own line, keeping a newer one', async () => {
    const older = await data('alice-sub', 'remember', { topic: 'Song song', fact: 'Điều cũ cần bỏ.' });
    await data('alice-sub', 'remember', { topic: 'Song song', fact: 'Điều mới cần giữ.' });
    expect(await (await undo(undoTokenOf(older))).json()).toMatchObject({ undone: true, action: 'reverted' });
    const markdown = (await data('alice-sub', 'get_document', { id: String(older.memory_id) })).markdown as string;
    expect(markdown).not.toContain('Điều cũ cần bỏ.');
    expect(markdown).toContain('Điều mới cần giữ.');
    expect(markdown).toContain('Điều thứ nhất.');
  });

  it('never lets another account undo, and never lets an admin’s AI read someone’s memory', async () => {
    const mine = await data('alice-sub', 'remember', { topic: 'Riêng tư', fact: 'Chỉ Alice biết.' });
    const db = server.database.db;
    await db.update(users).set({ role: 'admin' }).where(eq(users.sub, 'bob-sub'));
    expect(await tool('bob-sub', 'get_document', { id: String(mine.memory_id) })).toEqual({ ok: false, code: 'not_found' });
    expect(((await data('bob-sub', 'recent', { limit: 20 })).documents as Array<{ id: string }>).map((d) => d.id)).not.toContain(mine.memory_id);
    await db.update(users).set({ role: 'member' }).where(eq(users.sub, 'bob-sub'));
  });

  it('hides the memory from the user’s own AI while paused, and sensitive topics while those are off', async () => {
    await setMemory({ sensitive: true });
    const touchy = await data('alice-sub', 'remember', { topic: 'Sức khoẻ riêng', fact: 'Dị ứng phấn hoa.', sensitive: true });
    const plain = await data('alice-sub', 'remember', { topic: 'Thói quen', fact: 'Làm việc buổi tối.' });
    await setMemory({ sensitive: false });
    expect(await tool('alice-sub', 'get_document', { id: String(touchy.memory_id) })).toEqual({ ok: false, code: 'not_found' });
    expect((await data('alice-sub', 'memory_index')).text).not.toContain('Sức khoẻ riêng');
    expect((await data('alice-sub', 'get_document', { id: String(plain.memory_id) })).title).toBe('Thói quen');

    await setMemory({ paused: true });
    expect(await tool('alice-sub', 'get_document', { id: String(plain.memory_id) })).toEqual({ ok: false, code: 'not_found' });
    expect(((await data('alice-sub', 'recent', { limit: 20 })).documents as Array<{ id: string }>).map((d) => d.id)).not.toContain(plain.memory_id);
    await setMemory({ paused: false });
  });
});

describe('/api/memory', () => {
  it('lists the topics with their conversation, and turns sensitive topics on', async () => {
    const body = await memory();
    expect(body.topics.map((t) => [t.title, t.chatId])).toEqual(expect.arrayContaining([['Máy tính', null], ['Nhóm thử', 45]]));
    const res = await api(server, '/api/memory/settings', { method: 'PUT', cookie, headers: { 'content-type': 'application/json' }, body: JSON.stringify({ sensitive: true }) });
    expect(await res.json()).toEqual({ paused: false, sensitive: true });
    expect((await tool('alice-sub', 'remember', { topic: 'Sức khoẻ', fact: 'Bị dị ứng.', sensitive: true })).ok).toBe(true);
  });

  it('undoes an append (back to the version before) and a new topic (to the trash), once', async () => {
    const appended = await data('alice-sub', 'remember', { topic: 'Máy tính', fact: 'Ghi nhầm.' });
    const res = await undo(undoTokenOf(appended));
    expect(await res.json()).toMatchObject({ undone: true, action: 'reverted' });
    expect((await data('alice-sub', 'get_document', { id: String(appended.memory_id) })).markdown).not.toContain('Ghi nhầm');
    expect((await undo(undoTokenOf(appended))).status).toBe(400);

    const created = await data('alice-sub', 'remember', { topic: 'Chủ đề nhầm', fact: 'Không cần.' });
    expect(await (await undo(undoTokenOf(created))).json()).toMatchObject({ action: 'trashed' });
    expect((await memory()).topics.map((t) => t.title)).not.toContain('Chủ đề nhầm');
    expect((await undo('x'.repeat(32))).status).toBe(400);
  });

  it('pauses memory: nothing saved, an empty index', async () => {
    await api(server, '/api/memory/settings', { method: 'PUT', cookie, headers: { 'content-type': 'application/json' }, body: JSON.stringify({ paused: true }) });
    expect(await tool('alice-sub', 'remember', { topic: 'Máy tính', fact: 'x' })).toEqual({ ok: false, code: 'memory_paused' });
    expect(await data('alice-sub', 'memory_index')).toMatchObject({ paused: true, topics: [] });
    await api(server, '/api/memory/settings', { method: 'PUT', cookie, headers: { 'content-type': 'application/json' }, body: JSON.stringify({ paused: false }) });
  });

  it('forgets every topic, and needs a session', async () => {
    const res = await api(server, '/api/memory', { method: 'DELETE', cookie });
    expect(((await res.json()) as { trashed: number }).trashed).toBeGreaterThanOrEqual(3);
    expect((await memory()).topics).toEqual([]);
    expect((await api(server, '/api/memory')).status).toBe(401);
  });
});
