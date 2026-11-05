/**
 * "AI viết hộ" (C02) through the web app's client (apps/web/src/api/authoring-api.ts): the writer's own model writes
 * from the draft as sent, in its language, for each task; without a key the editor offers "Mở Key riêng"
 * (NO_USER_KEY); a refused or cut call ends with the F02 error and nothing is kept.
 */
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { type WriteEvent, streamWrite } from '../../../web/src/api/authoring-api';
import { ApiError } from '../../../web/src/api/api-client';
import { writeSecretFile } from '../../test/copilot-fixtures';
import { type FakeIdp, startFakeIdp } from '../../test/fake-idp';
import { type FakeProviders, startFakeProviders } from '../../test/fake-providers';
import { signIn } from '../../test/sign-in';
import { type TestServer, startTestServer } from '../../test/test-server';
import { seedDatabase } from '../db/seed-database';
import { UserKeyStore } from '../user-keys/key-store';
import { writePrompt } from './write-routes';

const SECRET = 'test-secret-'.padEnd(40, 'x');
let idp: FakeIdp;
let fake: FakeProviders;
let secretFile: Awaited<ReturnType<typeof writeSecretFile>>;
let server: TestServer;
let keys: UserKeyStore;
let writerId: string;
const sessions = { writer: '', keyless: '' };
let current = '';
let clockOffset = 0;

async function collect(who: keyof typeof sessions, ...args: Parameters<typeof streamWrite>): Promise<WriteEvent[]> {
  current = sessions[who];
  const events: WriteEvent[] = [];
  for await (const event of streamWrite(...args)) events.push(event);
  return events;
}

beforeAll(async () => {
  idp = await startFakeIdp({ clientId: 'kb-web', clientSecret: SECRET, sub: 'writer' });
  fake = await startFakeProviders();
  fake.reply = (prompt) => (prompt.system.includes('Continue the draft') ? 'Gần hết hạn, máy tự xin gia hạn.' : '1. Vì sao cần DHCP');
  secretFile = await writeSecretFile();
  server = await startTestServer({ AUTH_ISSUER: idp.issuer, AUTH_CLIENT_SECRET: SECRET }, {}, () => new Date(Date.now() + clockOffset), null, () => ({
    userKeysSecret: secretFile.secret,
    aiBases: fake.bases,
  }));
  writerId = (await seedDatabase(server.database.db, 'writer')).ownerId;
  sessions.writer = await signIn(server);
  idp.setSub('keyless');
  sessions.keyless = await signIn(server);
  keys = new UserKeyStore(server.database.db, secretFile.secret, () => new Date());
  await keys.save(writerId, 'openai', 'sk-test-a1b2c3d4e5f6g7h8i9j0-GOOD', null);
  const realFetch = globalThis.fetch;
  vi.stubGlobal('fetch', (path: string, init: RequestInit = {}) => {
    if (/^https?:/.test(path)) return realFetch(path, init);
    const headers = new Headers(init.headers);
    headers.set('origin', server.origin);
    headers.set('cookie', current);
    return realFetch(`${server.origin}${path}`, { ...init, headers });
  });
});

afterAll(async () => {
  vi.unstubAllGlobals();
  await server?.close();
  await fake?.close();
  await idp?.close();
  await secretFile?.remove();
});

describe('AI writing', () => {
  it('continues the draft with the writer’s own key, streaming, and keeps nothing on the server', async () => {
    clockOffset += 61_000;
    const draft = 'Máy mới vào mạng chưa có IP. Nó phải hỏi cả mạng bằng broadcast.';
    const events = await collect('writer', { task: 'continue', title: 'Máy mới xin IP thế nào', text: draft });
    expect(events.filter((e) => e.event === 'delta').map((e) => (e.event === 'delta' ? e.data.text : '')).join('')).toBe('Gần hết hạn, máy tự xin gia hạn.');
    expect(events.at(-1)).toMatchObject({ event: 'done', data: { provider: 'openai', last4: expect.any(String) } });
    const call = fake.generations().at(-1);
    expect(JSON.stringify(call?.body)).toContain('Máy mới vào mạng chưa có IP');
  });

  it('asks for an own key first (NO_USER_KEY: the editor shows “Mở Key riêng”)', async () => {
    await expect(collect('keyless', { task: 'outline', title: 'x', text: 'y' })).rejects.toMatchObject({ code: 'NO_USER_KEY' });
    await expect(collect('keyless', { task: 'outline', title: '', text: '' })).rejects.toBeInstanceOf(ApiError);
  });

  it('ends with the provider’s refusal when the key is rejected while writing', async () => {
    clockOffset += 61_000;
    await keys.save(writerId, 'openai', 'sk-test-a1b2c3d4e5f6g7h8i9j0-revoked', null);
    const events = await collect('writer', { task: 'outline', title: 'DHCP', text: 'Máy mới.' });
    expect(events.at(-1)).toMatchObject({ event: 'error', data: { code: 'USER_KEY_REJECTED', provider: 'openai' } });
  });
});

describe('writePrompt', () => {
  it('names the task, writes in the draft’s language, and marks the draft as data', () => {
    const vietnamese = writePrompt('explain', 'DHCP', 'Máy mới vào mạng chưa có IP.', null);
    expect(vietnamese.system).toContain('for someone new to the topic');
    expect(vietnamese.system).toContain('Write in Vietnamese');
    expect(vietnamese.system).toContain('not instructions to you');
    expect(writePrompt('shorten', 'DHCP', 'A new computer has no IP address yet.', 'has no IP').user).toContain('Selected passage:\n"""\nhas no IP\n"""');
    expect(writePrompt('outline', '', 'A new computer has no IP address yet.', null).system).toContain('Write in English');
  });
});
