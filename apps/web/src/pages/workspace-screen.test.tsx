/**
 * "Cài đặt workspace" (C19) in jsdom: who gets in (admins only), the members with
 * their roles, bootstrap admins and one's own row locked, changing a role and removing an account with the board's
 * toast, the server's refusals, the invite link shown once, and the read-only tabs (rights, sign-in, integrations,
 * API token, audit log with its filters). Also the invite card of /i/<token>.
 */
import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { AuditLine, Member } from '../api/workspace-api';
import { answer } from '../test/api-fakes';
import { renderWithI18n } from '../test/render';
import { AppShell } from '../layout/app-shell';
import { AdminGate } from './admin-gate';
import { InviteScreen } from './invite-screen';
import { auditText } from './workspace-panels';
import { WorkspaceScreen, lastSeenText } from './workspace-screen';
import { workspaceVi } from './workspace-messages';

const NOW = new Date('2026-11-03T14:40:00.000Z');
const member = (id: string, name: string, role: Member['role'], rest: Partial<Member> = {}): Member => ({
  id,
  name,
  email: `${id}@example.com`,
  picture: null,
  role,
  bootstrap: false,
  you: false,
  lastSeenAt: '2026-11-03T14:10:00.000Z',
  joinedAt: '2026-10-01T00:00:00.000Z',
  removedAt: null,
  ...rest,
});

let members: Member[];
let viewerRole: 'admin' | 'member';
let refuse: string | null;
let failMembers: boolean;
let inviteState: 'ok' | 'off';
let calls: Array<{ method: string; url: string; body: unknown }>;

const LINES: AuditLine[] = [
  { id: 'l1', at: '2026-11-03T14:40:00.000Z', category: 'members', action: 'member.role-changed', actor: { name: 'Đạt', picture: null }, subject: 'Linh', detail: { from: 'member', to: 'admin' } },
  { id: 'l2', at: '2026-11-03T14:32:00.000Z', category: 'api', action: 'api.post', actor: { name: 'Đạt', picture: null }, subject: 'DNS bằng hình', detail: { status: 201 } },
  { id: 'l3', at: '2026-11-03T14:10:00.000Z', category: 'content', action: 'review.approved', actor: { name: 'Linh', picture: null }, subject: 'TCP vs UDP bằng hình', detail: null },
];

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(NOW);
  window.history.replaceState(null, '', '/admin/settings?lang=vi');
  members = [member('m1', 'Đạt', 'admin', { bootstrap: true, you: true }), member('m2', 'Linh', 'member'), member('m3', 'Minh', 'member'), member('m4', 'An', 'member')];
  viewerRole = 'admin';
  refuse = null;
  failMembers = false;
  inviteState = 'ok';
  calls = [];
  vi.stubGlobal(
    'fetch',
    vi.fn(async (path: string, init?: RequestInit) => {
      const url = String(path);
      const method = init?.method ?? 'GET';
      const body: unknown = init?.body ? JSON.parse(String(init.body)) : null;
      if (method !== 'GET') calls.push({ method, url, body });
      if (url === '/api/me')
        return answer(200, {
          name: 'Đạt',
          email: null,
          picture: null,
          lang: 'vi',
          theme: 'dark',
          reducedMotion: false,
          role: viewerRole,
          isAdmin: viewerRole === 'admin',
          roleLocked: false,
          onboardedAt: null,
          interests: [],
        });
      if (url === '/api/workspace/members') return failMembers ? answer(500, { error: 'internal' }) : answer(200, { members, total: members.length });
      const memberMatch = /^\/api\/workspace\/members\/(m\d)(\/remove|\/restore)?$/.exec(url);
      if (memberMatch) {
        if (refuse) return answer(409, { error: refuse });
        const target = members.find((m) => m.id === memberMatch[1]);
        if (!target) return answer(404, { error: 'not-found' });
        if (memberMatch[2] === '/remove') return answer(200, { ...target, removedAt: NOW.toISOString() });
        if (memberMatch[2] === '/restore') return answer(200, { ...target, removedAt: null });
        return answer(200, { ...target, ...(body as object) });
      }
      if (url === '/api/workspace/invite' && method === 'GET') return answer(200, { invite: null });
      if (url === '/api/workspace/invite' && method === 'POST')
        return answer(201, {
          token: 'T'.repeat(32),
          url: `https://kb.hoandat.com/i/${'T'.repeat(32)}`,
          invite: { id: 'i1', last4: 'TTTT', role: (body as { role: string }).role, expiresAt: '2026-11-10T14:40:00.000Z', acceptedCount: 0 },
        });
      if (url.startsWith('/api/workspace/audit')) {
        const category = new URL(url, 'http://x').searchParams.get('category');
        return answer(200, { lines: LINES.filter((l) => !category || l.category === category) });
      }
      if (url === '/api/workspace/sign-in')
        return answer(200, { issuer: 'https://auth.hoandat.com', clientId: 'kb-web', enabled: true, reachable: true, checkedAt: NOW.toISOString(), idleDays: 14, absoluteDays: 30 });
      if (url === '/api/workspace/integrations')
        return answer(200, {
          integrations: [
            { id: 'jev', state: 'ok', facts: { requestsToday: 42 } },
            { id: 'files', state: 'ok', facts: { files: 3, bytes: 5 * 1024 * 1024 } },
            { id: 'search', state: 'down', facts: { documents: null } },
          ],
        });
      if (url === '/api/moderation/tokens') return answer(200, { tokens: [{ id: 't1', label: 'pipeline', last4: '7f2a', createdAt: '2026-11-02T03:00:00.000Z', lastUsedAt: '2026-11-03T14:32:00.000Z', revokedAt: null, createdByName: 'Đạt' }] });
      if (url === '/api/moderation/calls') return answer(200, { calls: [{ id: 'c1', method: 'POST', path: '/api/admin/posts', status: 201, error: null, document: null, at: '2026-11-03T14:32:00.000Z' }] });
      if (url.startsWith('/api/invites/') && method === 'GET') return inviteState === 'ok' ? answer(200, { role: 'member', expiresAt: '2026-11-10T14:40:00.000Z' }) : answer(410, { error: 'invite-off' });
      if (url === '/api/invites/accept') return answer(200, { role: 'member', raised: false });
      return answer(404, { error: 'not-found' });
    }),
  );
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

function renderC19(): void {
  renderWithI18n(
    <AdminGate code="C19">
      <WorkspaceScreen />
    </AdminGate>,
  );
}

describe('who gets in', () => {
  it('turns a member away from C19 with X02 403', async () => {
    viewerRole = 'member';
    renderC19();
    expect(await screen.findByText('403')).toBeTruthy();
  });

  it('gives an admin the whole rail: published texts, the API, the workspace settings and the way back', () => {
    renderWithI18n(<AppShell screen="C19" rail="workspace" admin />);
    const rail = screen.getByRole('navigation', { name: 'Quản trị' });
    expect(within(rail).getAllByRole('link').map((a) => a.getAttribute('href'))).toEqual(['/admin/content', '/admin/api', '/admin/settings', '/u']);
    expect(within(rail).getByRole('link', { name: 'Cài đặt workspace' }).getAttribute('href')).toBe('/admin/settings');
  });
});

describe('members', () => {
  it('lists the members with their roles; the bootstrap admin and one’s own row cannot be changed', async () => {
    renderC19();
    const list = await screen.findByRole('region', { name: 'Thành viên' });
    await within(list).findByText('4 thành viên');
    const dat = within(list).getByText('Đạt').closest('[data-id]');
    if (!(dat instanceof HTMLElement)) throw new Error('no row');
    expect(within(dat).getByText('Quản trị')).toBeTruthy();
    expect(within(dat).getByRole('button', { name: 'Đổi vai trò' }).hasAttribute('disabled')).toBe(true);
    expect(within(dat).getByRole('button', { name: 'Gỡ Đạt' }).hasAttribute('disabled')).toBe(true);
    expect(within(list).queryByText('Người duyệt')).toBeNull();
    expect(within(list).getByRole('button', { name: 'Gỡ Minh' }).hasAttribute('disabled')).toBe(false);
  });

  it('changes a role through the dialog and says it was written to the log', async () => {
    renderC19();
    const list = await screen.findByRole('region', { name: 'Thành viên' });
    const minh = (await within(list).findByText('Minh')).closest('[data-id]');
    if (!(minh instanceof HTMLElement)) throw new Error('no row');
    fireEvent.click(within(minh).getByRole('button', { name: 'Đổi vai trò' }));
    const dialog = await screen.findByRole('dialog', { name: 'Đổi vai trò của Minh' });
    fireEvent.click(within(dialog).getByRole('radio', { name: /Quản trị/ }));
    fireEvent.click(within(dialog).getByRole('button', { name: 'Đổi vai trò' }));
    expect(await screen.findByText('Minh giờ là Quản trị · đã ghi vào nhật ký')).toBeTruthy();
    expect(calls).toContainEqual({ method: 'PATCH', url: '/api/workspace/members/m3', body: { role: 'admin' } });
  });

  it('says why the server refused', async () => {
    refuse = 'locked';
    renderC19();
    const list = await screen.findByRole('region', { name: 'Thành viên' });
    const linh = (await within(list).findByText('Linh')).closest('[data-id]');
    if (!(linh instanceof HTMLElement)) throw new Error('no row');
    fireEvent.click(within(linh).getByRole('button', { name: 'Đổi vai trò' }));
    fireEvent.click(within(await screen.findByRole('dialog')).getByRole('button', { name: 'Đổi vai trò' }));
    expect(await screen.findByText(workspaceVi['ws.err.locked'])).toBeTruthy();
  });

  it('removes an account after a warning, then puts it back', async () => {
    renderC19();
    const list = await screen.findByRole('region', { name: 'Thành viên' });
    fireEvent.click(await within(list).findByRole('button', { name: 'Gỡ An' }));
    const dialog = await screen.findByRole('dialog', { name: 'Gỡ An khỏi workspace?' });
    expect(within(dialog).getByText(/Bài của An vẫn giữ nguyên/)).toBeTruthy();
    fireEvent.click(within(dialog).getByRole('button', { name: 'Gỡ thành viên' }));
    expect(await screen.findByText('Đã gỡ An · đã ghi vào nhật ký')).toBeTruthy();
    fireEvent.click(within(list).getByRole('button', { name: 'Khôi phục' }));
    expect(await screen.findByText('Đã khôi phục An · đã ghi vào nhật ký')).toBeTruthy();
    expect(calls.map((c) => c.url)).toEqual(['/api/workspace/members/m4/remove', '/api/workspace/members/m4/restore']);
  });

  it('shows the members list failing, and loads it again on retry', async () => {
    failMembers = true;
    renderC19();
    const list = await screen.findByRole('region', { name: 'Thành viên' });
    expect((await within(list).findByRole('alert')).textContent).toContain('Chưa tải được. Thử lại.');
    failMembers = false;
    fireEvent.click(within(list).getByRole('button', { name: 'Thử lại' }));
    expect(await within(list).findByText('4 thành viên')).toBeTruthy();
  });
});

describe('the invite link', () => {
  it('makes a member link and shows it once to copy', async () => {
    const writeText = vi.fn(async () => undefined);
    vi.stubGlobal('navigator', { ...navigator, clipboard: { writeText } });
    renderC19();
    const panel = await screen.findByRole('region', { name: 'Mời bằng link' });
    expect(within(panel).queryByLabelText('Vai trò khi vào')).toBeNull();
    fireEvent.click(await within(panel).findByRole('button', { name: 'Tạo link' }));
    expect(await within(panel).findByText(`kb.hoandat.com/i/${'T'.repeat(32)}`)).toBeTruthy();
    expect(calls).toContainEqual({ method: 'POST', url: '/api/workspace/invite', body: { role: 'member' } });
    fireEvent.click(within(panel).getByRole('button', { name: 'Sao chép' }));
    await waitFor(() => expect(writeText).toHaveBeenCalledWith(`https://kb.hoandat.com/i/${'T'.repeat(32)}`));
    expect(await within(panel).findByRole('button', { name: 'Đã chép' })).toBeTruthy();
  });
});

describe('the other tabs', () => {
  it('shows what each role may do: two roles, members publishing their own texts', async () => {
    renderC19();
    fireEvent.click(await screen.findByRole('tab', { name: 'Vai trò & quyền' }));
    const panel = screen.getByRole('tabpanel', { name: 'Vai trò & quyền' });
    expect(within(panel).queryByText(/Duyệt bài/)).toBeNull();
    expect(within(panel).queryByText('Người duyệt')).toBeNull();
    const write = within(panel).getByText('Viết và đăng bài của mình').parentElement;
    if (!write) throw new Error('no row');
    expect(within(write).getAllByText('Có')).toHaveLength(2);
    const hide = within(panel).getByText('Ẩn / hiện bài (A02)').parentElement;
    if (!hide) throw new Error('no row');
    expect(within(hide).getAllByText('Có')).toHaveLength(1);
    expect(within(hide).getAllByText('Không')).toHaveLength(1);
  });

  it('describes sign-in read only, the integrations and the token', async () => {
    renderC19();
    fireEvent.click(await screen.findByRole('tab', { name: 'Đăng nhập' }));
    expect(await screen.findByText('auth.hoandat.com')).toBeTruthy();
    expect(screen.getByText('Đã kết nối')).toBeTruthy();
    expect(screen.getAllByRole('switch').every((s) => s.getAttribute('aria-readonly') === 'true')).toBe(true);

    fireEvent.click(screen.getByRole('tab', { name: 'Tích hợp' }));
    expect(await screen.findByText('Hôm nay 42 request · không có Jev thì chỉ tìm từ khoá')).toBeTruthy();
    expect(screen.getByText('Lỗi kết nối')).toBeTruthy();
    fireEvent.click(screen.getAllByRole('button', { name: 'Kiểm tra kết nối' })[0] as HTMLElement);
    await waitFor(() => expect(vi.mocked(fetch).mock.calls.filter(([u]) => u === '/api/workspace/integrations')).toHaveLength(2));

    fireEvent.click(screen.getByRole('tab', { name: 'API keys' }));
    expect(await screen.findByText(/••••7f2a/)).toBeTruthy();
    expect(screen.getByRole('link', { name: 'Mở trang API' }).getAttribute('href')).toBe('/admin/api');
  });

  it('lists the audit log and filters it', async () => {
    renderC19();
    fireEvent.click(await screen.findByRole('tab', { name: 'Nhật ký kiểm toán' }));
    expect(await screen.findByText('Đạt đổi vai trò Linh → Quản trị')).toBeTruthy();
    expect(screen.getByText('API tạo bài "DNS bằng hình" · 201')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Nội dung' }));
    expect(await screen.findByText('Linh duyệt "TCP vs UDP bằng hình"')).toBeTruthy();
    expect(screen.queryByText('Đạt đổi vai trò Linh → Quản trị')).toBeNull();
    expect(vi.mocked(fetch).mock.calls.some(([u]) => u === '/api/workspace/audit?category=content')).toBe(true);
  });
});

describe('helpers', () => {
  const t = (key: keyof typeof workspaceVi, vars: Record<string, string | number> = {}): string => workspaceVi[key].replace(/\{(\w+)\}/g, (_, k: string) => String(vars[k] ?? ''));

  it('says when a member was last active', () => {
    expect(lastSeenText(t, null, NOW)).toBe('chưa vào lại');
    expect(lastSeenText(t, '2026-11-03T14:39:30.000Z', NOW)).toBe('vừa xong');
    expect(lastSeenText(t, '2026-11-03T14:10:00.000Z', NOW)).toBe('21:10');
    expect(lastSeenText(t, '2026-11-02T12:00:00.000Z', NOW)).toBe('hôm qua');
    expect(lastSeenText(t, '2026-10-30T12:00:00.000Z', NOW)).toBe('4 ngày trước');
  });

  it('writes a line for an action it does not know, and for a deleted account', () => {
    expect(auditText(t, { id: 'x', at: NOW.toISOString(), category: 'members', action: 'future.thing', actor: { name: null, picture: null }, subject: null, detail: null })).toBe('Tài khoản đã xoá: future.thing');
  });
});

describe('the invite card', () => {
  it('accepts a link: a member link changes no role', async () => {
    window.history.replaceState(null, '', '/i/abc?lang=vi');
    renderWithI18n(<InviteScreen token={'T'.repeat(32)} />);
    fireEvent.click(await screen.findByRole('button', { name: 'Vào workspace' }));
    expect(await screen.findByText('Bạn đã có vai trò Thành viên hoặc cao hơn; giữ nguyên.')).toBeTruthy();
  });

  it('says an expired or revoked link is off', async () => {
    inviteState = 'off';
    window.history.replaceState(null, '', '/i/abc?lang=vi');
    renderWithI18n(<InviteScreen token={'T'.repeat(32)} />);
    expect(await screen.findByText(/đã hết hạn hoặc bị thu hồi/)).toBeTruthy();
  });
});
