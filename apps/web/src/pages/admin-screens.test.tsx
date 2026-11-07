/**
 * The admin station in jsdom: only admins get in (others see X02 403), and /admin opens published texts (A02) clustered by Space, hidden and shown, filtered, removed
 * after a confirmation; the API (A03): the token masked, a new one shown once after confirming, revoking, the log.
 */
import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { AdminCall, AdminToken, PublishedItem } from '../api/review-api';
import { answer } from '../test/api-fakes';
import { renderWithI18n } from '../test/render';
import { App } from '../app';
import { AdminApiScreen, callOutcome } from './admin-api-screen';
import { AdminContentScreen, clustersOf, shortTitle } from './admin-content-screen';
import { AdminGate } from './admin-gate';
import { adminVi } from './admin-messages';

const NOW = new Date('2026-11-03T14:05:00.000Z');
const ago = (minutes: number): string => new Date(NOW.getTime() - minutes * 60_000).toISOString();
const NET = { slug: 'networking', nameVi: 'Networking', nameEn: 'Networking', tint: '#C4B5FD', glow: '#8B5CF6' };
const LNX = { slug: 'linux', nameVi: 'Linux', nameEn: 'Linux', tint: '#A5F3FC', glow: '#22D3EE' };

const published = (id: string, title: string, rest: Partial<PublishedItem> = {}): PublishedItem => ({
  id,
  title,
  type: 'lab',
  lang: 'vi',
  origin: 'official',
  hidden: false,
  authorName: 'Đạt',
  createdAt: '2026-11-02T03:00:00.000Z',
  updatedAt: '2026-11-02T03:00:00.000Z',
  opens: 12,
  aiMade: true,
  translations: ['vi', 'en'],
  space: { ...NET, art: '/art/crystal-networking.webp' },
  collection: null,
  tags: ['dhcp'],
  ...rest,
});

const PUBLISHED: PublishedItem[] = [
  published('p1', 'Giao thức DHCP'),
  published('p2', 'Tìm hiểu giao thức DNS'),
  published('p3', 'Ghi chú: swap trên Ubuntu', { origin: 'community', authorName: 'Lan', aiMade: false, hidden: true, space: { ...LNX, art: '/art/crystal-linux.webp' } }),
];

const TOKEN: AdminToken = { id: 't1', label: 'pipeline AI', last4: '7f2a', createdAt: '2026-11-02T03:00:00.000Z', lastUsedAt: ago(34), revokedAt: null, createdByName: 'Đạt' };
const CALLS: AdminCall[] = [
  { id: 'c1', method: 'POST', path: '/api/admin/posts', status: 201, error: null, document: { id: 'p9', title: 'ICMP Ping' }, at: ago(34) },
  { id: 'c2', method: 'POST', path: '/api/admin/posts', status: 401, error: 'invalid-token', document: null, at: ago(60) },
];

let admin: boolean;
let calls: Array<{ method: string; url: string; body: unknown }>;

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(NOW);
  window.history.replaceState(null, '', '/admin?lang=vi');
  admin = true;
  calls = [];
  vi.stubGlobal(
    'fetch',
    vi.fn(async (path: string, init?: RequestInit) => {
      const url = String(path);
      const method = init?.method ?? 'GET';
      const body: unknown = init?.body ? JSON.parse(String(init.body)) : null;
      if (method !== 'GET') calls.push({ method, url, body });
      if (url === '/api/session') return answer(200, { signedIn: true, signInAvailable: true, user: { id: 'u1', name: 'Đạt', email: null, picture: null } });
      if (url === '/api/me/notifications/unread') return answer(200, { total: 0, byKind: {} });
      if (url === '/api/me') return answer(200, { name: 'Đạt', email: null, picture: null, lang: 'vi', theme: 'dark', reducedMotion: false, role: admin ? 'admin' : 'member', isAdmin: admin, roleLocked: admin, onboardedAt: NOW.toISOString(), interests: [] });
      if (url === '/api/moderation/published') return answer(200, { documents: PUBLISHED });
      if (url.startsWith('/api/moderation/documents/') && method === 'PATCH') {
        const id = url.split('/').at(-1) ?? '';
        const item = PUBLISHED.find((p) => p.id === id) ?? PUBLISHED[0];
        return answer(200, { ...item, ...(body as object), opens: 0 });
      }
      if (url === '/api/spaces') return answer(200, { spaces: [] });
      if (url === '/api/moderation/tokens' && method === 'GET') return answer(200, { tokens: [TOKEN] });
      if (url === '/api/moderation/tokens' && method === 'POST') return answer(201, { token: `kf_admin_${'A'.repeat(39)}NEW1`, info: { ...TOKEN, id: 't2', last4: 'NEW1', lastUsedAt: null } });
      if (url === '/api/moderation/calls') return answer(200, { calls: CALLS });
      if (method === 'DELETE') return new Response(null, { status: 204 });
      return answer(404, { error: 'not-found' });
    }),
  );
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe('the admin gate', () => {
  it('turns away whoever is not an admin with X02 403', async () => {
    admin = false;
    renderWithI18n(
      <AdminGate code="A02">
        <p>inside</p>
      </AdminGate>,
    );
    expect(await screen.findByText('403')).toBeTruthy();
    expect(screen.queryByText('inside')).toBeNull();
  });

  it('lets an admin in', async () => {
    renderWithI18n(
      <AdminGate code="A02">
        <p>inside</p>
      </AdminGate>,
    );
    expect(await screen.findByText('inside')).toBeTruthy();
  });

  it('opens published texts (A02) at /admin, the station having no review queue any more', async () => {
    window.history.replaceState(null, '', '/admin');
    renderWithI18n(<App pathname="/admin" />);
    await waitFor(() => expect(document.querySelector('main#content[data-screen="A02"]')).not.toBeNull());
    expect(await screen.findByText('Giao thức DHCP')).toBeTruthy();
  });
});

describe('published texts (A02)', () => {
  it('names a planet with the first words of its title', () => {
    expect(['TCP vs UDP bằng hình', 'Tìm hiểu giao thức DNS', 'Bài tập: syslog', 'VictoriaLogs', 'Ghi chú: swap trên Ubuntu'].map(shortTitle)).toEqual(['TCP vs UDP', 'DNS', 'syslog', 'VictoriaLogs', 'swap trên']);
  });

  it('clusters by Space, largest first, and places the texts on its ring', () => {
    const clusters = clustersOf(PUBLISHED, 'vi');
    expect(clusters.map((c) => [c.name, c.planets.length])).toEqual([
      ['Networking', 2],
      ['Linux', 1],
    ]);
    expect(clusters[1]?.planets[0]).toMatchObject({ x: 650, y: 190 });
    expect(clustersOf([...PUBLISHED.slice(0, 2), published('p4', 'HTTP')], 'vi')[0]?.planets.map((p) => [Math.round(p.x), Math.round(p.y)])).toEqual([
      [160, 280],
      [343, 263],
      [277, 413],
    ]);
  });

  it('hides a text from its switch and filters by state', async () => {
    renderWithI18n(<AdminContentScreen />);
    const detail = within(await screen.findByRole('complementary', { name: 'Chi tiết bài' }));
    expect(detail.getByText('Giao thức DHCP')).toBeTruthy();
    expect(detail.getByText('VI · EN')).toBeTruthy();
    fireEvent.click(detail.getByRole('switch', { name: /Đang hiện/ }));
    await waitFor(() => expect(calls[0]).toEqual({ method: 'PATCH', url: '/api/moderation/documents/p1', body: { hidden: true } }));
    expect(await screen.findByRole('switch', { name: /Đang ẩn/ })).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Đã ẩn' }));
    // a hidden text's planet says so in its name, not only by its fade
    expect(screen.getByRole('button', { name: 'Ghi chú: swap trên Ubuntu, Đã ẩn' })).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Tìm hiểu giao thức DNS' })).toBeNull();
  });

  it('removes a text only after confirming', async () => {
    renderWithI18n(<AdminContentScreen />);
    const detail = within(await screen.findByRole('complementary', { name: 'Chi tiết bài' }));
    fireEvent.click(detail.getByRole('button', { name: 'Gỡ hẳn' }));
    const dialog = within(screen.getByRole('dialog'));
    fireEvent.click(dialog.getByRole('button', { name: 'Gỡ hẳn' }));
    await waitFor(() => expect(calls).toContainEqual({ method: 'DELETE', url: '/api/documents/p1', body: null }));
    await waitFor(() => expect(screen.queryByRole('button', { name: 'Giao thức DHCP' })).toBeNull());
  });
});

describe('the API (A03)', () => {
  it('shows the token masked, a new one once after confirming, and the log', async () => {
    renderWithI18n(<AdminApiScreen />);
    expect(await screen.findByText('kf_admin_••••••••••••7f2a')).toBeTruthy();
    expect(screen.getByText('Tạo 02/11/2026 · dùng lần cuối 20:31')).toBeTruthy();
    expect(await screen.findByRole('link', { name: 'Bài: ICMP Ping' })).toBeTruthy();
    expect(screen.getByText('token sai hoặc đã thu hồi')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Tạo token mới' }));
    fireEvent.click(screen.getByRole('button', { name: 'Tạo và thu hồi token cũ' }));
    expect(await screen.findByText(`kf_admin_${'A'.repeat(39)}NEW1`)).toBeTruthy();
    expect(screen.getByText(/Chỉ hiện một lần/)).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Thu hồi' }));
    await waitFor(() => expect(calls).toContainEqual({ method: 'DELETE', url: '/api/moderation/tokens/t2', body: null }));
    expect(await screen.findByText('Chưa có token')).toBeTruthy();
  });

  it('shows each endpoint’s sample', async () => {
    renderWithI18n(<AdminApiScreen />);
    fireEvent.click(await screen.findByRole('button', { name: /PATCH/ }));
    expect(screen.getByText('PATCH /api/admin/posts/{id}')).toBeTruthy();
  });

  it('words a call’s outcome', () => {
    const t = (key: keyof typeof adminVi, vars: Record<string, string | number> = {}): string => adminVi[key].replace(/\{(\w+)\}/g, (_, k: string) => String(vars[k] ?? ''));
    expect(callOutcome(t, { ...(CALLS[0] as AdminCall), method: 'PATCH' }).text).toBe('Sửa: ICMP Ping');
    expect(callOutcome(t, { ...(CALLS[1] as AdminCall), error: 'space-required', status: 400 })).toEqual({ ok: false, text: 'thiếu "space" hoặc "collection"' });
  });
});
