/**
 * "Key riêng" over HTTP: saving checks the key with its provider (local fakes), every answer carries only the last 4
 * characters, the 5-saves-a-minute limit, choosing a provider and model, deleting, and own keys turned off when the
 * secret file is missing.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { writeSecretFile } from '../../test/copilot-fixtures';
import { type FakeIdp, startFakeIdp } from '../../test/fake-idp';
import { type FakeProviders, startFakeProviders } from '../../test/fake-providers';
import { api, signIn } from '../../test/sign-in';
import { type TestServer, startTestServer } from '../../test/test-server';
import type { KeysResponse } from './key-routes';

const SECRET = 'test-secret-'.padEnd(40, 'x');
const OPENAI_KEY = 'sk-Q7zX9mW2pL5vN8rTyU3e-ABCD';
const GEMINI_KEY = 'AIzaK3jH6gF1dS4aZ0xCqW8b-EFGH';

let idp: FakeIdp;
let fake: FakeProviders;
let secretFile: Awaited<ReturnType<typeof writeSecretFile>>;
let server: TestServer;
let off: TestServer;
let session: string;
let offSession: string;
/** Every JSON answer of this file, walked at the end for any piece of a key. */
const answers: unknown[] = [];

beforeAll(async () => {
  idp = await startFakeIdp({ clientId: 'kb-web', clientSecret: SECRET, sub: 'key-owner' });
  fake = await startFakeProviders();
  secretFile = await writeSecretFile();
  server = await startTestServer({ AUTH_ISSUER: idp.issuer, AUTH_CLIENT_SECRET: SECRET, USER_KEYS_SECRET_PATH: secretFile.path }, {}, undefined, null, () => ({
    aiBases: fake.bases,
  }));
  session = await signIn(server);
  off = await startTestServer({ AUTH_ISSUER: idp.issuer, AUTH_CLIENT_SECRET: SECRET });
  offSession = await signIn(off);
});

afterAll(async () => {
  await server?.close();
  await off?.close();
  await fake?.close();
  await idp?.close();
  await secretFile?.remove();
});

async function call(path: string, init: RequestInit = {}, target: TestServer = server, cookie: string = session): Promise<{ status: number; body: unknown }> {
  const res = await api(target, path, { ...init, cookie });
  const body: unknown = await res.json();
  answers.push(body);
  return { status: res.status, body };
}

const putKey = (provider: string, key: string) => call(`/api/me/keys/${provider}`, { method: 'PUT', body: JSON.stringify({ key }) });

function strings(value: unknown): string[] {
  if (typeof value === 'string') return [value];
  if (Array.isArray(value)) return value.flatMap(strings);
  if (typeof value === 'object' && value !== null) return Object.values(value).flatMap(strings);
  return [];
}

describe('own keys', () => {
  it('needs a session', async () => {
    expect((await api(server, '/api/me/keys')).status).toBe(401);
    expect((await api(server, '/api/me/keys/openai', { method: 'PUT', body: JSON.stringify({ key: OPENAI_KEY }) })).status).toBe(401);
  });

  it('starts empty, with the model lists', async () => {
    const { status, body } = await call('/api/me/keys');
    expect(status).toBe(200);
    expect(body).toMatchObject({ available: true, keys: [], prefs: null, active: null });
    expect((body as KeysResponse).models.openai[0]).toEqual({ id: 'gpt-4.1-mini', label: 'GPT-4.1 mini' });
    expect((body as KeysResponse).models.gemini.map((m) => m.id)).toEqual(['gemini-3.8-flash', 'gemini-3.5-flash-lite']);
    expect((body as KeysResponse).models.anthropic.map((m) => m.id)).toEqual(['claude-haiku-5-5', 'claude-sonnet-5-5']);
  });

  it('saves a key the provider accepts and answers only its last 4 characters', async () => {
    const saved = await putKey('openai', OPENAI_KEY);
    expect(saved.status).toBe(200);
    expect(saved.body).toMatchObject({ provider: 'openai', last4: 'ABCD', status: 'ok' });
    expect(fake.requests.at(-1)).toMatchObject({ method: 'GET', path: '/v1/models', provider: 'openai' });
    const { body } = await call('/api/me/keys');
    expect(body).toMatchObject({ keys: [{ provider: 'openai', last4: 'ABCD', status: 'ok' }], active: { provider: 'openai', model: 'gpt-4.1-mini', last4: 'ABCD' } });
  });

  it('refuses a malformed, rejected or empty key, and says when the provider cannot be reached', async () => {
    expect(await putKey('openai', 'not-an-openai-key-at-all')).toEqual({ status: 400, body: { error: 'KEY_FORMAT' } });
    expect(await putKey('gemini', 'AIza-test-bad-key-000000001')).toEqual({ status: 400, body: { error: 'KEY_REJECTED' } });
    expect(await putKey('anthropic', 'sk-ant-test-broke-key-0001')).toEqual({ status: 400, body: { error: 'KEY_NO_CREDIT' } });
    // Fifth save of the minute: still allowed.
    expect(await putKey('gemini', 'AIza-test-flaky-key-0000001')).toEqual({ status: 503, body: { error: 'KEY_CHECK_FAILED' } });
    const { body } = await call('/api/me/keys');
    expect((body as KeysResponse).keys.map((k) => k.provider)).toEqual(['openai']);
  });

  it('allows 5 saves a minute per account', async () => {
    expect((await putKey('gemini', GEMINI_KEY)).status).toBe(429);
  });

  it('switches to the chosen provider and model only while that key is ok', async () => {
    expect((await call('/api/me/key-prefs', { method: 'PUT', body: JSON.stringify({ provider: 'openai', model: 'gemini-3.8-flash' }) })).status).toBe(400);
    const chosen = await call('/api/me/key-prefs', { method: 'PUT', body: JSON.stringify({ provider: 'openai', model: 'gpt-4.1-nano' }) });
    expect(chosen.body).toMatchObject({ prefs: { provider: 'openai', model: 'gpt-4.1-nano' }, active: { provider: 'openai', model: 'gpt-4.1-nano' } });
    const otherProvider = await call('/api/me/key-prefs', { method: 'PUT', body: JSON.stringify({ provider: 'anthropic', model: 'claude-sonnet-5-5' }) });
    // No Claude key: the ok OpenAI key is used, with its default model.
    expect(otherProvider.body).toMatchObject({ prefs: { provider: 'anthropic' }, active: { provider: 'openai', model: 'gpt-4.1-mini', last4: 'ABCD' } });
  });

  it('deletes a key', async () => {
    expect(await call('/api/me/keys/openai', { method: 'DELETE' })).toEqual({ status: 200, body: { deleted: true } });
    expect(await call('/api/me/keys/nobody', { method: 'DELETE' })).toEqual({ status: 404, body: { error: 'not-found' } });
    expect((await call('/api/me/keys')).body).toMatchObject({ keys: [], active: null });
  });

  it('never answers a key or any piece of one longer than its last 4 characters', () => {
    expect(answers.length).toBeGreaterThan(10);
    const all = answers.flatMap(strings);
    for (const key of [OPENAI_KEY, GEMINI_KEY]) {
      for (let i = 0; i + 5 <= key.length; i++) {
        const piece = key.slice(i, i + 5);
        expect(all.filter((s) => s.includes(piece))).toEqual([]);
      }
    }
  });
});

describe('own keys off (no secret file)', () => {
  it('lists, refuses saves and the Copilot with 503, and still deletes', async () => {
    expect((await call('/api/me/keys', {}, off, offSession)).body).toMatchObject({ available: false, keys: [], active: null });
    expect(await call('/api/me/keys/openai', { method: 'PUT', body: JSON.stringify({ key: OPENAI_KEY }) }, off, offSession)).toEqual({
      status: 503,
      body: { error: 'USER_KEYS_DISABLED' },
    });
    expect(await call('/api/ask', { method: 'POST', body: JSON.stringify({ question: 'DHCP?', scope: { kind: 'universe' } }) }, off, offSession)).toEqual({
      status: 503,
      body: { error: 'USER_KEYS_DISABLED' },
    });
    expect((await call('/api/me/keys/openai', { method: 'DELETE' }, off, offSession)).body).toEqual({ deleted: true });
  });
});
