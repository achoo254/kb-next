/**
 * The Import Center (C16) in jsdom: the board's five files with their six steps as the server reports them, the
 * summary, ring and filters, a failure with its fix and "Thử lại", Jev's suggestion applied on "Dùng" (Collection and
 * the chosen tags), the destination for new files, and the list that cannot load (offline).
 */
import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { SpaceListItem } from '../api/content-api';
import type { ProcessingStep, Upload } from '../api/files-api';
import { answer } from '../test/api-fakes';
import { renderWithI18n } from '../test/render';
import { ImportScreen, itemOfUpload, overallSteps, stepsPercent } from './import-screen';
import { space } from './universe-test-data';

const T = '2026-11-05T03:00:00.000Z';
type Code = 'd' | 's' | 'r' | 'e' | 'w';
const STATE = { d: 'done', s: 'skipped', r: 'running', e: 'failed', w: 'pending' } as const;
const NAMES = ['upload', 'ocr', 'structure', 'chunk', 'classify', 'index'] as const;

function steps(codes: string): ProcessingStep[] {
  return NAMES.map((step, i) => ({ step, state: STATE[(codes[i] ?? 'w') as Code] }));
}

const PERSONAL = { slug: 'personal-me', nameVi: 'Vũ trụ của bạn', nameEn: 'Your universe', kind: 'personal' } as const;
const NET = { slug: 'networking', nameVi: 'Networking', nameEn: 'Networking', kind: 'public' } as const;

function upload(fileId: string, name: string, kind: Upload['kind'], codes: string, status: NonNullable<Upload['processing']>['status'], patch: Partial<Upload> = {}): Upload {
  return {
    fileId,
    documentId: `doc-${fileId}`,
    name,
    kind,
    size: 48 * 1024,
    createdAt: T,
    space: PERSONAL,
    collection: null,
    processing: { status, steps: steps(codes), attempts: 1, maxAttempts: 3, error: null, nextAttemptAt: null, updatedAt: T, finishedAt: null },
    suggestions: null,
    ...patch,
  };
}

const BOARD: Upload[] = [
  upload('f1', 'subnet-calc.xlsx', 'xlsx', 'dsdddd', 'done', {
    space: NET,
    collection: { id: 'c-addr', nameVi: 'Địa chỉ', nameEn: 'Addressing' },
    suggestions: { status: 'pending', collection: { collectionId: 'c-addr', probability: 0.91, space: NET, nameVi: 'Địa chỉ', nameEn: 'Addressing' }, tags: [{ tag: 'subnet', probability: 0.9 }, { tag: 'CIDR', probability: 0.7 }] },
  }),
  upload('f2', 'k8s-intro.pptx', 'pptx', 'dsdrww', 'running', { size: 3.2 * 1024 * 1024 }),
  upload('f3', 'scan-ghi-chu-mang.pdf', 'pdf', 'drwwww', 'running'),
  upload('f4', 'bao-cao-lab.docx', 'docx', 'dsewww', 'failed', {
    processing: { status: 'failed', steps: steps('dsewww'), attempts: 1, maxAttempts: 3, error: { code: 'encrypted', hint: 'remove-password' }, nextAttemptAt: null, updatedAt: T, finishedAt: T },
  }),
  upload('f5', 'dns-cheatsheet.pdf', 'pdf', 'wwwwww', 'queued'),
];

const SPACES: SpaceListItem[] = [
  space('personal-me', { kind: 'personal', nameVi: 'Vũ trụ của bạn', nameEn: 'Your universe' }),
  space('networking', { nameVi: 'Networking', nameEn: 'Networking', collections: [{ id: 'c-addr', nameVi: 'Địa chỉ', nameEn: 'Addressing' }] }),
];

let list: () => Response;
let posts: Array<{ url: string; body: string | null }>;

beforeEach(() => {
  posts = [];
  list = () => answer(200, { files: BOARD });
  window.history.replaceState(null, '', '/import?lang=vi');
  vi.stubGlobal(
    'fetch',
    vi.fn(async (path: string, init?: RequestInit) => {
      const url = String(path);
      if (init?.method === 'POST') {
        posts.push({ url, body: typeof init.body === 'string' ? init.body : null });
        return answer(url.endsWith('/retry') ? 202 : 200, url.endsWith('/retry') ? { queued: true } : { suggestions: { status: 'accepted' } });
      }
      if (url === '/api/files') return list();
      if (url === '/api/spaces') return answer(200, { spaces: SPACES });
      return answer(404, { error: 'not-found' });
    }),
  );
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

const cards = (): HTMLElement[] => [...document.querySelectorAll<HTMLElement>('[data-id="import-card"]')];

describe('the processing model', () => {
  it('counts the board’s figures: steps done over steps to do, skipped ones aside', () => {
    expect(stepsPercent(steps('dsdrww'))).toBe(40);
    const items = BOARD.map((u) => itemOfUpload(u, ''));
    expect(items.map((i) => i.state)).toEqual(['done', 'run', 'run', 'err', 'wait']);
    expect(overallSteps(items)).toBe(33);
    expect(itemOfUpload({ ...BOARD[0], processing: null } as Upload, '')).toMatchObject({ state: 'err', failure: { fix: 'import.notQueued' } });
  });
});

describe('ImportScreen', () => {
  it('shows each file’s steps, the summary, ring and filters', async () => {
    renderWithI18n(<ImportScreen />);
    await waitFor(() => expect(cards()).toHaveLength(5));
    expect(screen.getByRole('heading', { name: 'Trung tâm nhập tri thức' })).toBeTruthy();
    expect(screen.getByText('5 tệp · 1 xong · 2 đang chạy · 1 lỗi · 1 chờ')).toBeTruthy();
    expect(screen.getByRole('img', { name: 'Tiến độ chung 33 phần trăm' })).toBeTruthy();
    const first = cards()[0] as HTMLElement;
    expect(within(first).getByText('48 KB · Networking › Địa chỉ')).toBeTruthy();
    expect(within(first).getByText('Xong')).toBeTruthy();
    const names = within(first).getByRole('list', { name: 'Các bước xử lý subnet-calc.xlsx' });
    expect([...names.querySelectorAll('.import-step-name')].map((n) => n.firstChild?.textContent)).toEqual(['Tải lên', 'OCR (bỏ qua)', 'Đọc cấu trúc', 'Chia đoạn', 'Jev phân loại', 'Lập chỉ mục (từ khoá + Jev)']);
    expect(within(cards()[1] as HTMLElement).getByText('Đang chạy · 40%')).toBeTruthy();
    expect(within(cards()[4] as HTMLElement).getByText('Đang chờ')).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: 'Lỗi · 1' }));
    expect(cards().map((c) => c.querySelector('.import-card-name')?.textContent)).toEqual(['bao-cao-lab.docx']);
    fireEvent.click(screen.getByRole('button', { name: 'Xong · 1' }));
    expect(cards()).toHaveLength(1);
  });

  it('says what went wrong and how to fix it, and runs a failed file again', async () => {
    renderWithI18n(<ImportScreen />);
    await waitFor(() => expect(cards()).toHaveLength(5));
    const failed = cards()[3] as HTMLElement;
    expect(within(failed).getByRole('alert').textContent).toBe(
      'Không đọc được cấu trúc: tệp có mật khẩu. Mở tệp trong Word, bỏ mật khẩu ở Tệp › Thông tin › Bảo vệ tài liệu, lưu lại rồi bấm Thử lại.',
    );
    fireEvent.click(within(failed).getByRole('button', { name: 'Thử lại' }));
    await waitFor(() => expect(posts.map((p) => p.url)).toEqual(['/api/files/f4/retry']));
    fireEvent.click(screen.getByRole('button', { name: 'Thử lại mục lỗi' }));
    await waitFor(() => expect(posts).toHaveLength(2));
  });

  it('applies Jev’s suggestion on "Dùng" with the tags left on, then sends new files there', async () => {
    renderWithI18n(<ImportScreen />);
    const suggestion = await screen.findByText('Jev gợi ý: Networking › Địa chỉ · 0,91');
    expect(suggestion).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: '✓ CIDR' }));
    fireEvent.click(screen.getByRole('button', { name: 'Dùng' }));
    await waitFor(() => expect(posts[0]).toEqual({ url: '/api/files/f1/suggestions', body: JSON.stringify({ action: 'accept', collection: true, tags: ['subnet'] }) }));
    expect(await screen.findByRole('button', { name: 'Đã chọn' })).toBeTruthy();
    expect((screen.getByLabelText('Space') as HTMLSelectElement).value).toBe('networking');
    expect((screen.getByLabelText('Collection') as HTMLSelectElement).value).toBe('c-addr');
  });

  it('says when it has nothing yet, and when the list cannot load offline', async () => {
    list = () => answer(200, { files: [] });
    const { unmount } = renderWithI18n(<ImportScreen />);
    expect(await screen.findByText('Chưa nhập tệp nào')).toBeTruthy();
    unmount();
    list = () => {
      throw new TypeError('offline');
    };
    renderWithI18n(<ImportScreen />);
    expect(await screen.findByText('Đang offline · danh sách sẽ cập nhật khi có mạng.')).toBeTruthy();
  });
});
