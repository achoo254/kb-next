/**
 * The web app's typed client (apps/web/src/api/content-api.ts) against the real routes: every answer of the reading
 * API must pass the client's schemas, so the two sides cannot drift apart unnoticed.
 */
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import {
  completeOnboarding,
  fetchComments,
  fetchDocument,
  fetchMe,
  fetchRecent,
  fetchSpace,
  fetchSpaces,
  postComment,
  readErrorOf,
  saveReadingProgress,
  updateMe,
} from '../../../web/src/api/content-api';
import { type FakeIdp, startFakeIdp } from '../../test/fake-idp';
import { signIn } from '../../test/sign-in';
import { type TestServer, startTestServer } from '../../test/test-server';
import { seedDatabase, seedId } from '../db/seed-database';

const SECRET = 'test-secret-'.padEnd(40, 'x');
let idp: FakeIdp;
let server: TestServer;
let session: string;
let ownerId: string;

beforeAll(async () => {
  idp = await startFakeIdp({ clientId: 'kb-web', clientSecret: SECRET, sub: 'owner-sub', profile: { name: 'Chủ' } });
  server = await startTestServer({ AUTH_ISSUER: idp.issuer, AUTH_CLIENT_SECRET: SECRET });
  ownerId = (await seedDatabase(server.database.db, 'owner-sub')).ownerId;
  session = await signIn(server);
  // The browser: same origin, the session cookie goes along.
  const realFetch = globalThis.fetch;
  vi.stubGlobal('fetch', (path: string, init: RequestInit = {}) => {
    const headers = new Headers(init.headers);
    headers.set('origin', server.origin);
    headers.set('cookie', session);
    return realFetch(`${server.origin}${path}`, { ...init, headers });
  });
});

afterAll(async () => {
  vi.unstubAllGlobals();
  await server.close();
  await idp.close();
});

describe('web client ↔ reading API', () => {
  it('parses every answer the screens use', async () => {
    expect(await fetchMe()).toMatchObject({ name: 'Chủ', onboardedAt: null });
    expect(await updateMe({ theme: 'light' })).toMatchObject({ theme: 'light' });
    expect((await completeOnboarding({ lang: 'vi', interests: ['networking'] })).onboardedAt).not.toBeNull();

    const spaces = await fetchSpaces();
    expect(spaces).toHaveLength(7);
    const space = await fetchSpace('networking', 'en');
    expect(space.collections).toHaveLength(4);
    expect((await fetchSpace(`personal-${ownerId}`)).uncollected).toHaveLength(3);

    const reader = await fetchDocument(seedId('document:dhcp'));
    expect(reader.document.title).toBe('Giao thức DHCP');
    expect(reader.backlinks.length).toBeGreaterThan(0);
    expect(await fetchRecent()).toHaveLength(8);
    expect(space.members.length).toBeGreaterThan(0);
    expect(space.related[0]?.relevance).toBeGreaterThan(0);
    expect(reader.related[0]?.relevance).toBeGreaterThan(0);
    expect(reader.document.readProgress).toBe(72);

    expect(await saveReadingProgress(seedId('document:dhcp'), 90, 'thoi-han-thue')).toEqual({ progress: 90, anchor: 'thoi-han-thue' });
    expect((await fetchComments(seedId('document:dhcp'))).comments).toHaveLength(2);
    expect(await postComment(seedId('document:dhcp'), 'Rõ rồi', 'dora')).toMatchObject({ body: 'Rõ rồi', mine: true });
  });

  it('maps a missing document to its screen', async () => {
    expect(readErrorOf(await fetchDocument(seedId('document:nope')).catch((e: unknown) => e))).toBe('not-found');
    expect(readErrorOf(await fetchSpace('no-such-space').catch((e: unknown) => e))).toBe('not-found');
  });
});
