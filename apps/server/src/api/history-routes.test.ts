/**
 * C17 on the seed's DHCP, through the web app's client (apps/web/src/api/history-api.ts): what an ordinary reader sees
 * (the current version and its approval only), the board's timeline as an admin sees it (AI
 * versions through the API, Linh asking for a source, Minh's proposed v4, the approval, Đạt hiding and showing the
 * text), the v3 ⇄ v4 difference, one version's text, and restoring: only who may edit restores, as a new version.
 */
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { ApiError } from '../../../web/src/api/api-client';
import { fetchDocument } from '../../../web/src/api/content-api';
import { fetchDiff, fetchHistory, fetchVersion, restoreVersion } from '../../../web/src/api/history-api';
import { type FakeIdp, startFakeIdp } from '../../test/fake-idp';
import { signIn } from '../../test/sign-in';
import { type TestServer, startTestServer } from '../../test/test-server';
import { seedDatabase, seedId } from '../db/seed-database';

const SECRET = 'test-secret-'.padEnd(40, 'x');
const DHCP = seedId('document:dhcp');

let idp: FakeIdp;
let server: TestServer;
const sessions = { member: '', admin: '' };
let current = '';

async function as<T>(who: keyof typeof sessions, fn: () => Promise<T>): Promise<T> {
  current = sessions[who];
  return fn();
}

beforeAll(async () => {
  idp = await startFakeIdp({ clientId: 'kb-web', clientSecret: SECRET, sub: 'member-sub' });
  server = await startTestServer({ AUTH_ISSUER: idp.issuer, AUTH_CLIENT_SECRET: SECRET, ADMIN_SUBS: 'seed:dat' }, {}, () => new Date('2026-11-05T03:00:00Z'));
  await seedDatabase(server.database.db, 'member-sub');
  sessions.member = await signIn(server);
  idp.setSub('seed:dat');
  idp.setProfile({ name: 'Đạt' });
  sessions.admin = await signIn(server);
  const realFetch = globalThis.fetch;
  vi.stubGlobal('fetch', (path: string, init: RequestInit = {}) => {
    const headers = new Headers(init.headers);
    headers.set('origin', server.origin);
    headers.set('cookie', current);
    return realFetch(`${server.origin}${path}`, { ...init, headers });
  });
});

afterAll(async () => {
  vi.unstubAllGlobals();
  await server?.close();
  await idp?.close();
});

describe('the history of DHCP', () => {
  it('shows another reader only the current version and the approval: no drafts, reasons or hiding', async () => {
    const history = await as('member', () => fetchHistory(DHCP));
    expect(history).toMatchObject({ scope: 'public', canRestore: false, currentVersion: 4 });
    expect(history.events.map((e) => [e.kind, e.kind === 'version' ? e.version : e.kind === 'review' ? e.action : null])).toEqual([
      ['review', 'approved'],
      ['version', 4],
    ]);
    expect(await as('member', () => fetchVersion(DHCP, 4))).toMatchObject({ version: 4 });
    await expect(as('member', () => fetchVersion(DHCP, 2))).rejects.toMatchObject({ code: 'not-found' });
    await expect(as('member', () => fetchDiff(DHCP, 3, 4))).rejects.toMatchObject({ code: 'not-found' });
  });

  it('lists the board’s activity for an admin, newest first, with who did it and how', async () => {
    const history = await as('admin', () => fetchHistory(DHCP));
    expect(history.document).toMatchObject({ title: 'Giao thức DHCP', space: { slug: 'networking' }, collection: { nameVi: 'Giao thức nền tảng' } });
    expect(history).toMatchObject({ scope: 'full', canRestore: true, currentVersion: 4 });
    const rows = history.events.map((e) => {
      const who = `${e.actor?.name ?? '?'}/${e.actor?.role ?? '?'}`;
      if (e.kind === 'version') return [e.at, who, `v${e.version}`, e.via, e.aiMade, e.proposal, e.summary];
      if (e.kind === 'review') return [e.at, who, e.action, e.version, e.reason];
      return [e.at, who, e.hidden ? 'hidden' : 'shown'];
    });
    expect(rows).toEqual([
      ['2026-11-03T14:40:00.000Z', 'Đạt/admin', 'shown'],
      ['2026-11-03T14:12:00.000Z', 'Đạt/admin', 'hidden'],
      ['2026-11-03T03:02:00.000Z', 'Linh/member', 'approved', 4, null],
      ['2026-11-02T14:30:00.000Z', 'Minh/member', 'v4', 'editor', false, true, 'thêm đoạn lease và DHCP snooping'],
      ['2026-11-02T02:00:00.000Z', 'Linh/member', 'changes_requested', 3, 'thiếu nguồn cho đoạn broadcast'],
      ['2026-10-31T07:05:00.000Z', 'Đạt/admin', 'v3', 'api', true, false, null],
      ['2026-10-29T13:40:00.000Z', 'Đạt/admin', 'v2', 'api', true, false, null],
      ['2026-10-28T02:12:00.000Z', 'Đạt/admin', 'v1', 'api', true, false, null],
    ]);
  });

  it('compares v3 with v4: the lease section and DHCP snooping added (+3 −1)', async () => {
    const diff = await as('admin', () => fetchDiff(DHCP, 3, 4));
    expect([diff.added, diff.removed]).toEqual([3, 1]);
    expect(diff.lines.map((l) => [l.op, l.heading ? `## ${l.text}` : l.text.split(' ').slice(0, 5).join(' ')])).toEqual([
      ['same', 'Vì chưa có IP, máy'],
      ['add', '## Lease và gia hạn'],
      ['add', 'IP chỉ được cho mượn'],
      ['same', '## Rủi ro: DHCP giả mạo'],
      ['del', 'Một máy lạ trả lời'],
      ['add', 'Một máy lạ trả lời'],
    ]);
    const v1 = await as('admin', () => fetchVersion(DHCP, 1));
    expect(v1).toMatchObject({ version: 1, editorName: 'Đạt', savedAt: '2026-10-28T02:12:00.000Z' });
    expect(v1.markdown).toMatch(/^# Giao thức DHCP\n\nMáy mới vào mạng chưa có IP/);
    expect(v1.markdown).not.toContain('## Broadcast là gì');
  });

  it('answers 404 for a version the document does not have', async () => {
    await expect(as('admin', () => fetchVersion(DHCP, 9))).rejects.toMatchObject({ code: 'not-found' });
    await expect(as('admin', () => fetchDiff(DHCP, 1, 9))).rejects.toMatchObject({ code: 'not-found' });
  });

  it('restores only for who may edit, as a new version that keeps the history', async () => {
    await expect(as('member', () => restoreVersion(DHCP, 3))).rejects.toBeInstanceOf(ApiError);
    // An earlier version a reader cannot see is not there for them; the current one they may not edit.
    await expect(as('member', () => restoreVersion(DHCP, 3))).rejects.toMatchObject({ code: 'not-found' });
    await expect(as('member', () => restoreVersion(DHCP, 4))).rejects.toMatchObject({ code: 'no-access' });
    const restored = await as('admin', () => restoreVersion(DHCP, 3));
    expect(restored.version).toBe(5);
    const history = await as('admin', () => fetchHistory(DHCP));
    expect(history).toMatchObject({ canRestore: true, currentVersion: 5 });
    expect(history.events[0]).toMatchObject({ kind: 'version', version: 5, via: 'restore', restoredFrom: 3, actor: { name: 'Đạt', role: 'admin' } });
    expect(await as('admin', () => fetchDiff(DHCP, 3, 5))).toMatchObject({ added: 0, removed: 0, lines: [] });
    // The reader shows the restored text: no lease section any more.
    expect((await as('member', () => fetchDocument(DHCP))).chunks.map((c) => c.anchor)).toEqual(['tong-quan', 'broadcast-la-gi', 'rui-ro-dhcp-gia-mao']);
  });
});
