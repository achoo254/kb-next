import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { type FakeIdp, startFakeIdp } from '../../test/fake-idp';
import { api, signIn } from '../../test/sign-in';
import { type TestServer, startTestServer } from '../../test/test-server';
import { seedDatabase } from '../db/seed-database';

const SECRET = 'test-secret-'.padEnd(40, 'x');

let idp: FakeIdp;
let server: TestServer;
let session: string;

beforeAll(async () => {
  idp = await startFakeIdp({ clientId: 'kb-web', clientSecret: SECRET, sub: 'reader-a', profile: { name: 'Người Đọc', email: 'a@example.com' } });
  server = await startTestServer({ AUTH_ISSUER: idp.issuer, AUTH_CLIENT_SECRET: SECRET, ADMIN_SUBS: 'admin-sub' });
  await seedDatabase(server.database.db, 'seed-owner');
  session = await signIn(server);
});

afterAll(async () => {
  await server.close();
  await idp.close();
});

const json = (body: unknown): string => JSON.stringify(body);

describe('GET /api/me', () => {
  it('needs a session', async () => {
    const res = await api(server, '/api/me');
    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({ error: 'sign-in-required' });
  });

  it('gives the account, its settings and that onboarding is still to do', async () => {
    const res = await api(server, '/api/me', { cookie: session });
    expect(res.status).toBe(200);
    expect(res.headers.get('cache-control')).toBe('no-store');
    expect(await res.json()).toEqual({
      name: 'Người Đọc',
      email: 'a@example.com',
      picture: null,
      lang: 'vi',
      theme: 'system',
      role: 'member',
      isAdmin: false,
      onboardedAt: null,
      interests: [],
    });
  });

  it('says when the account is an admin (ADMIN_SUBS)', async () => {
    idp.setSub('admin-sub');
    try {
      const admin = await signIn(server);
      expect(await (await api(server, '/api/me', { cookie: admin })).json()).toMatchObject({ isAdmin: true });
    } finally {
      idp.setSub('reader-a');
    }
  });
});

describe('PATCH /api/me', () => {
  it('changes the language and theme', async () => {
    const res = await api(server, '/api/me', { method: 'PATCH', cookie: session, body: json({ theme: 'dark' }) });
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ lang: 'vi', theme: 'dark' });
    expect(await (await api(server, '/api/me', { method: 'PATCH', cookie: session, body: json({ lang: 'en' }) })).json()).toMatchObject({ lang: 'en', theme: 'dark' });
  });

  it('rejects an empty change, unknown values and unknown fields', async () => {
    for (const body of [{}, { lang: 'fr' }, { theme: 'blue' }, { lang: 'vi', role: 'reviewer' }]) {
      const res = await api(server, '/api/me', { method: 'PATCH', cookie: session, body: json(body) });
      expect(res.status, JSON.stringify(body)).toBe(400);
      expect(await res.json()).toEqual({ error: 'invalid-body' });
    }
  });

  it('needs a session and the app origin', async () => {
    expect((await api(server, '/api/me', { method: 'PATCH', body: json({ lang: 'vi' }) })).status).toBe(401);
    const crossSite = await fetch(`${server.origin}/api/me`, {
      method: 'PATCH',
      headers: { cookie: session, origin: 'https://evil.example', 'content-type': 'application/json' },
      body: json({ lang: 'vi' }),
    });
    expect(crossSite.status).toBe(403);
  });
});

describe('POST /api/me/onboarding', () => {
  it('stores the language and the picked Spaces, and marks onboarding done once', async () => {
    const res = await api(server, '/api/me/onboarding', { method: 'POST', cookie: session, body: json({ lang: 'vi', interests: ['networking', 'linux', 'networking'] }) });
    expect(res.status).toBe(200);
    const first = (await res.json()) as { onboardedAt: string };
    expect(first).toMatchObject({ lang: 'vi', interests: ['networking', 'linux'] });
    expect(Math.abs(Date.parse(first.onboardedAt) - Date.now())).toBeLessThan(60_000);

    // Again (from settings later): new picks, the first completion time stays.
    const again = await api(server, '/api/me/onboarding', { method: 'POST', cookie: session, body: json({ lang: 'en', interests: [] }) });
    expect(await again.json()).toMatchObject({ lang: 'en', interests: [], onboardedAt: first.onboardedAt });
    expect(await (await api(server, '/api/me', { cookie: session })).json()).toMatchObject({ lang: 'en', interests: [], onboardedAt: first.onboardedAt });
  });

  it('accepts only Spaces the account can see', async () => {
    // The seed's personal Space belongs to another account.
    const personal = (await (await api(server, '/api/spaces', { cookie: session })).json()) as { spaces: Array<{ slug: string; kind: string }> };
    expect(personal.spaces.some((s) => s.kind === 'personal')).toBe(false);
    const res = await api(server, '/api/me/onboarding', { method: 'POST', cookie: session, body: json({ lang: 'vi', interests: ['networking', 'no-such-space'] }) });
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: 'unknown-space' });
  });

  it('rejects a malformed body and a guest', async () => {
    for (const body of [{ lang: 'vi' }, { lang: 'de', interests: [] }, { lang: 'vi', interests: 'networking' }, { lang: 'vi', interests: Array(21).fill('linux') }]) {
      const res = await api(server, '/api/me/onboarding', { method: 'POST', cookie: session, body: json(body) });
      expect(res.status, JSON.stringify(body)).toBe(400);
    }
    expect((await api(server, '/api/me/onboarding', { method: 'POST', body: json({ lang: 'vi', interests: [] }) })).status).toBe(401);
  });
});
