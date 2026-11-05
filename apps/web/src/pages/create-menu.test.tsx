/**
 * The create ring (C01) in jsdom: nine options clockwise in four groups, the description of the one under the pointer
 * or focus ("Sắp có" for what a later phase brings, which does nothing), the personal Space form (make it, or open the
 * one there is), the Collection form (only the personal Space for a member, every Space for an admin; a name is
 * required), a failed load, and Escape closing a form, then the ring.
 */
import { act, fireEvent, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { SpaceListItem } from '../api/content-api';
import { answer } from '../test/api-fakes';
import { renderWithI18n } from '../test/render';
import { CreateMenu } from './create-menu';
import { CREATE_OPTIONS, ringPlace } from './create-options';
import { MINE_SPACES } from './mine-test-data';

let spaces: SpaceListItem[];
let isAdmin: boolean;
let failPlaces: boolean;
let posts: Array<{ url: string; body: string | null }>;

const ME = { name: 'Chủ', email: null, picture: null, lang: 'vi', theme: 'dark', role: 'member', onboardedAt: null, interests: [] };

beforeEach(() => {
  spaces = MINE_SPACES;
  isAdmin = false;
  failPlaces = false;
  posts = [];
  window.history.replaceState(null, '', '/create?lang=vi');
  vi.stubGlobal(
    'fetch',
    vi.fn(async (path: string, init?: RequestInit) => {
      const url = String(path);
      if (init?.method === 'POST') {
        posts.push({ url, body: typeof init.body === 'string' ? init.body : null });
        if (url === '/api/me/space') return answer(201, { space: { slug: 'personal-new', nameVi: 'Vũ trụ của bạn', nameEn: 'Your universe', tint: 't', glow: 'g', kind: 'personal', art: '/art/crystal-personal.webp' }, created: true });
        if (url === '/api/collections') {
          const body: unknown = JSON.parse(typeof init.body === 'string' ? init.body : '{}');
          const space = typeof body === 'object' && body !== null && 'space' in body && typeof body.space === 'string' ? body.space : '';
          return answer(201, { collection: { id: 'c9', nameVi: 'Giao thức hay quên', nameEn: 'Giao thức hay quên', spaceSlug: space } });
        }
      }
      if (failPlaces && (url === '/api/spaces' || url === '/api/me')) return answer(500, { error: 'server' });
      if (url === '/api/spaces') return answer(200, { spaces });
      if (url === '/api/me') return answer(200, { ...ME, isAdmin });
      return answer(404, { error: 'not-found' });
    }),
  );
});

afterEach(() => {
  vi.unstubAllGlobals();
});

function ringItem(name: string): HTMLElement {
  const ring = screen.getByRole('navigation', { name: 'Lựa chọn tạo mới' });
  const found = [...ring.querySelectorAll<HTMLElement>('a, button')].find((el) => el.getAttribute('aria-label')?.startsWith(name));
  if (!found) throw new Error(`no option ${name}`);
  return found;
}

function panel(): ReturnType<typeof within> {
  return within(screen.getByRole('region', { name: 'Chi tiết lựa chọn' }));
}

describe('the ring', () => {
  it('lays nine options clockwise from the top, in four groups, with what they open', () => {
    renderWithI18n(<CreateMenu />);
    const ring = screen.getByRole('navigation', { name: 'Lựa chọn tạo mới' });
    expect([...ring.querySelectorAll('a, button')].map((el) => el.getAttribute('aria-label'))).toEqual([
      'Ghi chú · Nội dung',
      'Tài liệu từ mẫu · Nội dung · Sắp có',
      'Space cá nhân mới · Tổ chức',
      'Collection mới · Tổ chức',
      'Tải file Office · Nhập',
      'Nhập hàng loạt · Nhập',
      'Từ URL / Link · Nhập · Sắp có',
      'Lối đi · Hành trình · Sắp có',
      'Canvas · Hành trình',
    ]);
    expect(ringItem('Ghi chú').getAttribute('href')).toBe('/new');
    expect(ringItem('Canvas').getAttribute('href')).toBe('/canvas');
    expect(ringItem('Tải file Office').getAttribute('href')).toBe('/upload');
    expect(ringItem('Nhập hàng loạt').getAttribute('href')).toBe('/import');
    expect(ringPlace(0)).toEqual({ x: 580, y: 208, angle: -90 });
    expect(ringPlace(CREATE_OPTIONS.length - 1).angle).toBe(230);
    expect(within(screen.getByRole('list', { name: 'Nhóm lựa chọn' })).getAllByRole('listitem').map((li) => li.textContent)).toEqual(['Nội dung', 'Tổ chức', 'Nhập', 'Hành trình']);
    expect(panel().getByText('Viết nhanh bằng editor')).toBeTruthy();
    expect(screen.getByRole('heading', { name: 'Tạo gì hôm nay?' })).toBeTruthy();
  });

  it('describes the option under the pointer or the keyboard focus; what comes later says when and does nothing', () => {
    renderWithI18n(<CreateMenu />);
    fireEvent.mouseEnter(ringItem('Canvas'));
    expect(panel().getByText('Bảng ý tưởng tự do')).toBeTruthy();
    expect(panel().queryByText(/Sắp có/)).toBeNull();

    fireEvent.focus(ringItem('Tải file Office'));
    expect(panel().getByText('docx, xlsx, pptx, pdf')).toBeTruthy();
    expect(panel().queryByText(/Sắp có/)).toBeNull();

    const url = ringItem('Từ URL / Link');
    fireEvent.focus(url);
    expect(panel().getByText('Sắp có · mở cùng Trung tâm nhập')).toBeTruthy();
    expect(url.getAttribute('aria-disabled')).toBe('true');
    fireEvent.click(url);
    expect(panel().queryByRole('button', { name: 'Tạo Space' })).toBeNull();
    expect(screen.getByText('Mô tả')).toBeTruthy();

    fireEvent.focus(ringItem('Lối đi'));
    expect(panel().getByText('Sắp có · mở cùng trình dựng Lối đi')).toBeTruthy();
    fireEvent.focus(ringItem('Tài liệu từ mẫu'));
    expect(panel().getByText('Sắp có · mở khi có thư viện mẫu')).toBeTruthy();
  });
});

describe('the personal Space', () => {
  it('makes it when the account has none', async () => {
    spaces = MINE_SPACES.filter((s) => s.kind !== 'personal');
    renderWithI18n(<CreateMenu />);
    fireEvent.click(ringItem('Space cá nhân mới'));
    expect(ringItem('Space cá nhân mới').getAttribute('aria-expanded')).toBe('true');
    expect(screen.getByText('Tổ chức · Space')).toBeTruthy();
    fireEvent.click(await panel().findByRole('button', { name: 'Tạo Space' }));
    expect(await panel().findByText('Đã tạo · hành tinh mới trong vũ trụ của bạn')).toBeTruthy();
    expect(posts.map((p) => p.url)).toEqual(['/api/me/space']);
    expect(panel().getByRole('link', { name: 'Mở Space' }).getAttribute('href')).toBe('/s/personal-new');
  });

  it('shows the one there is, opens it, or goes on to a Collection', async () => {
    renderWithI18n(<CreateMenu />);
    fireEvent.click(ringItem('Space cá nhân mới'));
    expect(await panel().findByText('Mỗi tài khoản có một Space cá nhân. Muốn chia theo chủ đề, tạo Collection trong đó.')).toBeTruthy();
    expect(panel().getByRole('link', { name: 'Mở Space' }).getAttribute('href')).toBe('/s/personal-me');
    fireEvent.click(panel().getByRole('button', { name: 'Tạo Collection' }));
    expect(await panel().findByLabelText('Tên Collection')).toBeTruthy();
  });

  it('says when the Spaces could not be loaded, and loads them again', async () => {
    failPlaces = true;
    renderWithI18n(<CreateMenu />);
    fireEvent.click(ringItem('Space cá nhân mới'));
    expect(await panel().findByText('Chưa tải được danh sách Space.')).toBeTruthy();
    failPlaces = false;
    fireEvent.click(panel().getByRole('button', { name: 'Thử lại' }));
    expect(await panel().findByRole('link', { name: 'Mở Space' })).toBeTruthy();
  });
});

describe('a new Collection', () => {
  it('goes in the personal Space; public Spaces are for admins; a name is required', async () => {
    renderWithI18n(<CreateMenu />);
    fireEvent.click(ringItem('Collection mới'));
    const select = (await panel().findByLabelText('Thuộc Space')) as HTMLSelectElement;
    expect([...select.options].map((o) => [o.textContent, o.disabled])).toEqual([
      ['Vũ trụ của bạn (cá nhân)', false],
      ['Networking · chỉ quản trị', true],
    ]);
    fireEvent.click(panel().getByRole('button', { name: 'Tạo Collection' }));
    expect(panel().getByRole('alert').textContent).toBe('Đặt tên cho Collection trước đã.');
    expect(panel().getByLabelText('Tên Collection').getAttribute('aria-invalid')).toBe('true');
    fireEvent.change(panel().getByLabelText('Tên Collection'), { target: { value: '  Giao thức hay quên ' } });
    fireEvent.click(panel().getByRole('button', { name: 'Tạo Collection' }));
    expect(await panel().findByText('Đã tạo trong Vũ trụ của bạn')).toBeTruthy();
    expect(posts).toEqual([{ url: '/api/collections', body: JSON.stringify({ space: 'personal-me', nameVi: 'Giao thức hay quên' }) }]);
  });

  it('makes the personal Space first when there is none, and lets an admin pick a public Space', async () => {
    spaces = MINE_SPACES.filter((s) => s.kind !== 'personal');
    isAdmin = true;
    renderWithI18n(<CreateMenu />);
    fireEvent.click(ringItem('Collection mới'));
    const select = (await panel().findByLabelText('Thuộc Space')) as HTMLSelectElement;
    expect([...select.options].map((o) => [o.textContent, o.disabled])).toEqual([
      ['Vũ trụ của bạn (cá nhân)', false],
      ['Networking', false],
    ]);
    fireEvent.change(panel().getByLabelText('Tên Collection'), { target: { value: 'Giao thức hay quên' } });
    fireEvent.click(panel().getByRole('button', { name: 'Tạo Collection' }));
    expect(await panel().findByText('Đã tạo trong Vũ trụ của bạn')).toBeTruthy();
    expect(posts.map((p) => p.url)).toEqual(['/api/me/space', '/api/collections']);

    fireEvent.change(select, { target: { value: 'networking' } });
    fireEvent.change(panel().getByLabelText('Tên Collection'), { target: { value: 'Ôn thi' } });
    fireEvent.click(panel().getByRole('button', { name: 'Tạo Collection' }));
    expect(await panel().findByText('Đã tạo trong Networking')).toBeTruthy();
    expect(posts.at(-1)).toEqual({ url: '/api/collections', body: JSON.stringify({ space: 'networking', nameVi: 'Ôn thi' }) });
  });
});

describe('closing', () => {
  it('Escape closes a form first, then the ring (to the Universe when nothing of the app opened it)', async () => {
    const assign = vi.fn();
    vi.stubGlobal('location', { ...window.location, assign, origin: window.location.origin, pathname: '/create', href: window.location.href, search: '?lang=vi' });
    renderWithI18n(<CreateMenu />);
    fireEvent.click(ringItem('Collection mới'));
    await panel().findByLabelText('Tên Collection');
    await act(async () => {
      fireEvent.keyDown(document, { key: 'Escape' });
    });
    expect(screen.getByText('Mô tả')).toBeTruthy();
    expect(assign).not.toHaveBeenCalled();
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(assign).toHaveBeenCalledWith('/u');
    fireEvent.click(screen.getByRole('link', { name: 'Đóng menu tạo mới' }));
    expect(assign).toHaveBeenCalledTimes(2);
    await waitFor(() => expect(screen.getByRole('link', { name: 'Đóng menu tạo mới, về trang trước' }).getAttribute('href')).toBe('/u'));
  });
});

