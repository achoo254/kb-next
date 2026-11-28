/**
 * POST /mcp with the IdP's access tokens (fake IdP) on a real Meilisearch: who may call (audience, token type,
 * signature, scopes, step-up), what each account reads (its own private texts, never another account's or a hidden
 * Space's), and save_note's two calls (a preview that writes nothing, then a private note).
 */
import { and, eq } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createDocument, createSpace, createUser } from '../../test/content-fixtures';
import { type FakeIdp, startFakeIdp } from '../../test/fake-idp';
import { MEILI_SETUP_TIMEOUT_MS, type TestMeili, startTestMeili } from '../../test/meili';
import { type TestServer, startTestServer } from '../../test/test-server';
import { documents, spaces, users } from '../db/schema';
import { IndexSync } from '../search/index-sync';
import { rebuildIndexes } from '../search/rebuild-indexes';

const SECRET = 'test-secret-'.padEnd(40, 'x');

let idp: FakeIdp;
let meili: TestMeili;
let server: TestServer;
let resource: string;
/** The server's index sync: a search right after a write waits for it. */
let sync: IndexSync | undefined;
const ids = { alice: '', bob: '', publicDoc: '', alicePrivate: '', bobPrivate: '', hiddenDoc: '' };

const indexed = async (): Promise<void> => {
  await sync?.idle();
};

beforeAll(async () => {
  idp = await startFakeIdp({ clientId: 'kb-web', clientSecret: SECRET, sub: 'alice-sub' });
  meili = await startTestMeili();
  server = await startTestServer({ AUTH_ISSUER: idp.issuer, AUTH_CLIENT_SECRET: SECRET }, {}, undefined, null, (db) => {
    sync = new IndexSync(db, meili.client);
    return { search: { meili: meili.client, sync, close: () => undefined } };
  });
  resource = `${server.origin}/mcp`;
  const db = server.database.db;
  ids.alice = await createUser(db, 'alice-sub');
  ids.bob = await createUser(db, 'bob-sub');
  const shown = await createSpace(db, 'zebra-net');
  const hidden = await createSpace(db, 'zebra-hidden');
  ids.publicDoc = await createDocument(db, { spaceId: shown, authorId: ids.bob, title: 'Zebra routing basics', texts: ['Zebra routing moves packets between networks.'] });
  ids.alicePrivate = await createDocument(db, { spaceId: shown, authorId: ids.alice, status: 'private', title: 'Alice zebra notes', texts: ['Zebra private plan of Alice.'] });
  ids.bobPrivate = await createDocument(db, { spaceId: shown, authorId: ids.bob, status: 'private', title: 'Bob zebra secrets', texts: ['Zebra secret plan of Bob.'] });
  ids.hiddenDoc = await createDocument(db, { spaceId: hidden, authorId: ids.bob, title: 'Zebra hidden lore', texts: ['Zebra lore in a hidden Space.'] });
  await db.update(spaces).set({ hidden: true }).where(eq(spaces.slug, 'zebra-hidden'));
  await rebuildIndexes(db, meili.client);
}, MEILI_SETUP_TIMEOUT_MS);

afterAll(async () => {
  await server?.close();
  await meili?.close();
  await idp?.close();
});

const tokenFor = (sub: string, scope = 'kb:read kb:write', claims: Record<string, unknown> = {}): string => idp.accessToken(sub, { aud: resource, scope, ...claims });

async function post(token: string | null, body: unknown, headers: Record<string, string> = {}): Promise<Response> {
  return fetch(resource, {
    method: 'POST',
    headers: { 'content-type': 'application/json', accept: 'application/json, text/event-stream', ...(token ? { authorization: `Bearer ${token}` } : {}), ...headers },
    body: JSON.stringify(body),
  });
}

let nextId = 1;
const call = (name: string, args: Record<string, unknown> = {}) => ({ jsonrpc: '2.0', id: nextId++, method: 'tools/call', params: { name, arguments: args } });

/** A tool's answer: its structured content, or its `{code, message}` when it failed. */
async function tool(token: string, name: string, args: Record<string, unknown> = {}): Promise<{ ok: true; data: Record<string, unknown> } | { ok: false; code: string }> {
  const res = await post(token, call(name, args));
  expect(res.status).toBe(200);
  const body = (await res.json()) as { result: { isError: boolean; structuredContent?: Record<string, unknown>; content: Array<{ text: string }> } };
  if (!body.result.isError) return { ok: true, data: body.result.structuredContent ?? {} };
  const parsed = JSON.parse(body.result.content[0]?.text ?? '{}') as { error: { code: string } };
  return { ok: false, code: parsed.error.code };
}

async function data(token: string, name: string, args: Record<string, unknown> = {}): Promise<Record<string, unknown>> {
  const answer = await tool(token, name, args);
  if (!answer.ok) throw new Error(`${name} failed: ${answer.code}`);
  return answer.data;
}

const idsIn = (items: unknown): string[] => (Array.isArray(items) ? items.map((item: { id: string }) => item.id) : []);

describe('MCP discovery and authentication', () => {
  it('publishes its Protected Resource Metadata at both well-known paths', async () => {
    for (const path of ['/.well-known/oauth-protected-resource/mcp', '/.well-known/oauth-protected-resource']) {
      const res = await fetch(`${server.origin}${path}`);
      expect(res.status).toBe(200);
      expect(await res.json()).toEqual({
        resource,
        authorization_servers: [idp.issuer],
        scopes_supported: ['kb:read', 'kb:write'],
        bearer_methods_supported: ['header'],
        resource_name: 'Knowledge Base MCP',
      });
    }
  });

  it('answers 401 with a challenge naming the metadata when no token comes', async () => {
    const res = await post(null, { jsonrpc: '2.0', id: 1, method: 'initialize', params: {} });
    expect(res.status).toBe(401);
    const challenge = res.headers.get('www-authenticate') ?? '';
    expect(challenge).toMatch(/^Bearer /);
    expect(challenge).toContain(`resource_metadata="${server.origin}/.well-known/oauth-protected-resource/mcp"`);
    expect(challenge).toContain('scope="kb:read kb:write"');
    expect(challenge).not.toContain('error=');
  });

  it.each([
    ['another audience', () => idp.accessToken('alice-sub', { aud: 'https://chat.example.test/mcp', scope: 'kb:read' })],
    ['an ID token', () => idp.accessToken('alice-sub', { aud: resource, scope: 'kb:read' }, { typ: 'JWT' })],
    ['a key the IdP never published', () => idp.accessToken('alice-sub', { aud: resource, scope: 'kb:read' }, { how: 'stranger' })],
    ['an expired token', () => tokenFor('alice-sub', 'kb:read', { exp: Math.floor(Date.now() / 1000) - 3600 })],
    ['another issuer', () => tokenFor('alice-sub', 'kb:read', { iss: 'https://evil.example.test' })],
    ['an opaque string', () => 'not-a-jwt'],
  ])('refuses %s with 401 invalid_token', async (_label, make) => {
    const res = await post(make(), { jsonrpc: '2.0', id: 1, method: 'tools/list' });
    expect(res.status).toBe(401);
    expect(res.headers.get('www-authenticate')).toContain('error="invalid_token"');
  });

  it('refuses a token without a kb scope with 403 insufficient_scope', async () => {
    const res = await post(tokenFor('alice-sub', 'chat:read'), { jsonrpc: '2.0', id: 1, method: 'tools/list' });
    expect(res.status).toBe(403);
    expect(res.headers.get('www-authenticate')).toContain('error="insufficient_scope"');
  });

  it('asks a kb:read token to step up to kb:write for save_note', async () => {
    const res = await post(tokenFor('alice-sub', 'kb:read'), call('save_note', { title: 'x', markdown: 'y' }));
    expect(res.status).toBe(403);
    const challenge = res.headers.get('www-authenticate') ?? '';
    expect(challenge).toContain('error="insufficient_scope"');
    expect(challenge).toContain('scope="kb:read kb:write"');
  });

  it('refuses a foreign browser Origin and anything but POST', async () => {
    const foreign = await post(tokenFor('alice-sub'), { jsonrpc: '2.0', id: 1, method: 'ping' }, { origin: 'https://evil.example.test' });
    expect(foreign.status).toBe(403);
    const get = await fetch(resource, { headers: { authorization: `Bearer ${tokenFor('alice-sub')}` } });
    expect(get.status).toBe(405);
    expect(get.headers.get('allow')).toBe('POST');
  });

  it('initializes, lists the six tools and takes notifications without answering', async () => {
    const token = tokenFor('alice-sub');
    const init = await post(token, { jsonrpc: '2.0', id: 1, method: 'initialize', params: { protocolVersion: '2025-06-18', capabilities: {}, clientInfo: { name: 't', version: '1' } } });
    expect(init.status).toBe(200);
    expect(await init.json()).toMatchObject({ result: { protocolVersion: '2025-06-18', capabilities: { tools: {} }, serverInfo: { name: 'kb' } } });
    const note = await post(token, { jsonrpc: '2.0', method: 'notifications/initialized' });
    expect(note.status).toBe(202);
    const list = (await (await post(token, { jsonrpc: '2.0', id: 2, method: 'tools/list' })).json()) as { result: { tools: Array<{ name: string; annotations: { readOnlyHint: boolean } }> } };
    expect(list.result.tools.map((t) => t.name)).toEqual(['search', 'get_document', 'list_spaces', 'recent', 'save_note', 'update_note']);
    expect(list.result.tools.filter((t) => !t.annotations.readOnlyHint).map((t) => t.name)).toEqual(['save_note', 'update_note']);
    expect((await post(token, [{ jsonrpc: '2.0', id: 3, method: 'ping' }])).status).toBe(400);
  });

  it('asks an IdP account without a kb account to sign in once', async () => {
    expect(await tool(tokenFor('stranger-sub'), 'recent')).toEqual({ ok: false, code: 'kb_account_required' });
  });
});

describe('MCP reads with the account’s own rights', () => {
  it('reads its own private text, with Markdown and its url', async () => {
    const doc = await data(tokenFor('alice-sub'), 'get_document', { id: `${server.origin}/d/${ids.alicePrivate}#c0` });
    expect(doc).toMatchObject({ id: ids.alicePrivate, title: 'Alice zebra notes', visibility: 'private', url: `${server.origin}/d/${ids.alicePrivate}`, space: { slug: 'zebra-net' } });
    expect(doc.markdown).toContain('Zebra private plan of Alice.');
  });

  it('never returns another account’s private text or a hidden Space’s text', async () => {
    const token = tokenFor('alice-sub');
    expect(await tool(token, 'get_document', { id: ids.bobPrivate })).toEqual({ ok: false, code: 'no_access' });
    expect(await tool(token, 'get_document', { id: ids.hiddenDoc })).toEqual({ ok: false, code: 'not_found' });
    const found = await data(token, 'search', { query: 'zebra', mode: 'keyword' });
    expect(found.keyword).toBe('ok');
    const hits = idsIn(found.results);
    expect(hits).toEqual(expect.arrayContaining([ids.publicDoc, ids.alicePrivate]));
    expect(hits).not.toContain(ids.bobPrivate);
    expect(hits).not.toContain(ids.hiddenDoc);
    const recent = idsIn((await data(token, 'recent', { limit: 20 })).documents);
    expect(recent).toEqual(expect.arrayContaining([ids.publicDoc, ids.alicePrivate]));
    expect(recent).not.toContain(ids.bobPrivate);
    expect(recent).not.toContain(ids.hiddenDoc);
    const spaces = (await data(token, 'list_spaces')).spaces as Array<{ slug: string }>;
    expect(spaces.map((s) => s.slug)).toContain('zebra-net');
    expect(spaces.map((s) => s.slug)).not.toContain('zebra-hidden');
  });

  it('gives Bob his own private text in search and nothing of Alice’s', async () => {
    const hits = idsIn((await data(tokenFor('bob-sub'), 'search', { query: 'zebra plan', mode: 'keyword' })).results);
    expect(hits).toContain(ids.bobPrivate);
    expect(hits).not.toContain(ids.alicePrivate);
  });

  it('refuses a Space the account cannot read as a search filter', async () => {
    expect(await tool(tokenFor('alice-sub'), 'search', { query: 'zebra', space: 'zebra-hidden' })).toEqual({ ok: false, code: 'space_not_found' });
  });
});

describe('save_note', () => {
  const note = { title: 'Meeting with Zebra team', markdown: '- ship the router\n- check the logs' };
  const aliceDocs = async (): Promise<number> =>
    (await server.database.db.select({ id: documents.id }).from(documents).where(and(eq(documents.authorId, ids.alice), eq(documents.title, note.title)))).length;

  it('only previews without a confirm token, then saves a private note with one', async () => {
    const token = tokenFor('alice-sub');
    const preview = await data(token, 'save_note', note);
    expect(preview).toMatchObject({ preview: { title: note.title, visibility: 'private', space: { kind: 'personal' } } });
    expect(typeof preview.confirm_token).toBe('string');
    expect(await aliceDocs()).toBe(0);

    const tampered = await tool(token, 'save_note', { ...note, markdown: 'something else', confirm_token: preview.confirm_token });
    expect(tampered).toEqual({ ok: false, code: 'confirm_token_invalid' });
    expect(await aliceDocs()).toBe(0);

    const saved = await data(token, 'save_note', { ...note, confirm_token: preview.confirm_token });
    const document = saved.document as { id: string; url: string; visibility: string; status: string; space: { kind: string } };
    expect(document).toMatchObject({ visibility: 'private', status: 'private', space: { kind: 'personal' } });
    expect(document.url).toBe(`${server.origin}/d/${document.id}`);
    expect(await aliceDocs()).toBe(1);

    expect(await tool(token, 'save_note', { ...note, confirm_token: preview.confirm_token })).toEqual({ ok: false, code: 'confirm_token_used' });
    expect(await aliceDocs()).toBe(1);

    const read = await data(token, 'get_document', { id: document.id });
    expect(read.markdown).toContain('ship the router');
    expect(await tool(tokenFor('bob-sub'), 'get_document', { id: document.id })).toEqual({ ok: false, code: 'no_access' });
  });

  it('does not take a confirm token issued to another account', async () => {
    const preview = await data(tokenFor('alice-sub'), 'save_note', { ...note, title: 'Bound to Alice' });
    expect(await tool(tokenFor('bob-sub'), 'save_note', { ...note, title: 'Bound to Alice', confirm_token: preview.confirm_token })).toEqual({ ok: false, code: 'confirm_token_invalid' });
  });

  it('refuses a hidden Space and checks its arguments', async () => {
    const token = tokenFor('alice-sub');
    expect(await tool(token, 'save_note', { ...note, space: 'zebra-hidden' })).toEqual({ ok: false, code: 'space_not_found' });
    expect(await tool(token, 'save_note', { title: 'two\nlines', markdown: 'x' })).toEqual({ ok: false, code: 'invalid_arguments' });
    expect(await tool(token, 'save_note', { title: 'ok', markdown: 'x', extra: 1 })).toEqual({ ok: false, code: 'invalid_arguments' });
  });
});

/** Saves a private note for `sub` through both calls of save_note, waits for the index; its id. */
async function savedNote(sub: string, title: string, markdown: string): Promise<string> {
  const token = tokenFor(sub);
  const preview = await data(token, 'save_note', { title, markdown });
  const saved = await data(token, 'save_note', { title, markdown, confirm_token: preview.confirm_token });
  await indexed();
  return (saved.document as { id: string }).id;
}

/** Runs both calls of update_note, waits for the index; the second answer. */
async function updated(sub: string, args: Record<string, unknown>): Promise<Record<string, unknown>> {
  const token = tokenFor(sub);
  const preview = await data(token, 'update_note', args);
  const answer = await data(token, 'update_note', { ...args, confirm_token: preview.confirm_token });
  await indexed();
  return answer;
}

describe('personal memory', () => {
  let memory = '';
  let bobMemory = '';
  let alicePublic = '';

  beforeAll(async () => {
    const db = server.database.db;
    const carol = await createUser(db, 'carol-sub');
    await db.update(users).set({ role: 'admin' }).where(eq(users.id, carol));
    const [shown] = await db.select({ id: spaces.id }).from(spaces).where(eq(spaces.slug, 'zebra-net'));
    if (!shown) throw new Error('no zebra-net Space');
    alicePublic = await createDocument(db, { spaceId: shown.id, authorId: ids.alice, title: 'Alice public zebra guide', texts: ['Zebra guide for everyone.'] });
    await rebuildIndexes(db, meili.client);
    memory = await savedNote('alice-sub', 'Quokka backup routine', 'Quokka backups of the zebra router run nightly at two.');
    bobMemory = await savedNote('bob-sub', 'Quokka backup of Bob', 'Bob keeps zebra quokka backups weekly.');
  }, MEILI_SETUP_TIMEOUT_MS);

  it('searches only the user’s own Space with scope mine, and only shared Spaces with scope library', async () => {
    const token = tokenFor('alice-sub');
    const mine = idsIn((await data(token, 'search', { query: 'quokka zebra', scope: 'mine', mode: 'keyword' })).results);
    expect(mine).toContain(memory);
    expect(mine).not.toContain(bobMemory);
    expect(mine).not.toContain(ids.publicDoc);
    expect(mine).not.toContain(ids.alicePrivate);
    const library = idsIn((await data(token, 'search', { query: 'zebra', scope: 'library', limit: 30, mode: 'keyword' })).results);
    expect(library).not.toContain(memory);
    expect(library).not.toContain(bobMemory);
    expect(library).toEqual(expect.arrayContaining([ids.publicDoc, ids.alicePrivate]));
    expect(idsIn((await data(token, 'search', { query: 'quokka', scope: 'mine', space: 'zebra-net', mode: 'keyword' })).results)).toEqual([]);
    const bobs = idsIn((await data(tokenFor('bob-sub'), 'search', { query: 'quokka', scope: 'mine', mode: 'keyword' })).results);
    expect(bobs).toContain(bobMemory);
    expect(bobs).not.toContain(memory);
  });

  it('names only the user’s own similar notes in the preview of a new one', async () => {
    const preview = await data(tokenFor('alice-sub'), 'save_note', { title: 'Quokka backup', markdown: 'again' });
    expect(idsIn(preview.similar)).toContain(memory);
    expect(idsIn(preview.similar)).not.toContain(bobMemory);
    expect(preview.next).toContain('update_note');
    const bobs = idsIn((await data(tokenFor('bob-sub'), 'save_note', { title: 'Quokka backup', markdown: 'again' })).similar);
    expect(bobs).toContain(bobMemory);
    expect(bobs).not.toContain(memory);
  });

  it('appends to a note, then replaces its body and title, keeping it private', async () => {
    const token = tokenFor('alice-sub');
    const preview = await data(token, 'update_note', { id: memory, mode: 'append', markdown: '- 2026-11-28: moved to three.' });
    expect(preview.preview).toMatchObject({ mode: 'append', title_before: 'Quokka backup routine' });
    expect((await data(token, 'get_document', { id: memory })).markdown).not.toContain('moved to three');

    const appended = await data(token, 'update_note', { id: memory, mode: 'append', markdown: '- 2026-11-28: moved to three.', confirm_token: preview.confirm_token });
    expect(appended).toMatchObject({ saved: true, changed: true, document: { visibility: 'private' } });
    const read = (await data(token, 'get_document', { id: memory })).markdown as string;
    expect(read).toContain('Quokka backups of the zebra router run nightly at two.');
    expect(read).toContain('moved to three.');

    await updated('alice-sub', { id: memory, mode: 'replace', markdown: 'Quokka backups run nightly at three.', title: 'Quokka backups' });
    const replaced = await data(token, 'get_document', { id: memory });
    expect(replaced).toMatchObject({ title: 'Quokka backups', visibility: 'private' });
    expect(replaced.markdown).not.toContain('at two');
    expect(await tool(token, 'update_note', { id: memory, mode: 'replace', markdown: '   \n ' })).toEqual({ ok: false, code: 'invalid_arguments' });
  });

  it('refuses a confirm token once the note changed after the preview', async () => {
    const token = tokenFor('alice-sub');
    const args = { id: memory, mode: 'append', markdown: 'late plan' };
    const preview = await data(token, 'update_note', args);
    await updated('alice-sub', { id: memory, mode: 'append', markdown: 'an edit in between' });
    expect(await tool(token, 'update_note', { ...args, confirm_token: preview.confirm_token })).toEqual({ ok: false, code: 'confirm_token_invalid' });
    expect((await data(token, 'get_document', { id: memory })).markdown).not.toContain('late plan');
  });

  it('changes only the user’s own private notes: not another account’s, not a public text, not as an admin', async () => {
    const edit = { mode: 'append', markdown: 'x' };
    expect(await tool(tokenFor('bob-sub'), 'update_note', { id: memory, ...edit })).toEqual({ ok: false, code: 'no_access' });
    expect(await tool(tokenFor('carol-sub'), 'update_note', { id: memory, ...edit })).toEqual({ ok: false, code: 'no_access' });
    expect(await tool(tokenFor('alice-sub'), 'update_note', { id: ids.publicDoc, ...edit })).toEqual({ ok: false, code: 'no_access' });
    expect(await tool(tokenFor('alice-sub'), 'update_note', { id: alicePublic, ...edit })).toEqual({ ok: false, code: 'not_private' });
    expect(await tool(tokenFor('alice-sub'), 'update_note', { id: ids.hiddenDoc, ...edit })).toEqual({ ok: false, code: 'not_found' });
  });

  it('refuses to store a secret in a new note or an update', async () => {
    const token = tokenFor('alice-sub');
    const secret = `deploy key ghp_${'a1B2'.repeat(9)}`;
    expect(await tool(token, 'save_note', { title: 'Keys', markdown: secret })).toEqual({ ok: false, code: 'secret_detected' });
    expect(await tool(token, 'update_note', { id: memory, mode: 'append', markdown: 'DB_PASSWORD=Tr0ub4dor&3xyz' })).toEqual({ ok: false, code: 'secret_detected' });
  });
});
