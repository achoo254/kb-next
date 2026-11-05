/**
 * Uploading Office files (C03) in jsdom, with a stand-in XMLHttpRequest: waiting for files, a drag over the page,
 * the overall ring and each file's progress, files refused in the browser (kind, 25 MB) beside ones that upload, a
 * dropped connection retried, cancelling, the errors with their fixes, and reading after upload (C16 link).
 */
import { act, fireEvent, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Upload } from '../api/files-api';
import { answer } from '../test/api-fakes';
import { renderWithI18n } from '../test/render';
import { UploadScreen } from './upload-screen';

/** One upload the test drives: progress, an answer, a dropped connection. */
class FakeXhr {
  static all: FakeXhr[] = [];
  method = '';
  url = '';
  withCredentials = false;
  status = 0;
  responseText = '';
  name = '';
  upload: { onprogress: ((event: { loaded: number; total: number; lengthComputable: boolean }) => void) | null } = { onprogress: null };
  onload: (() => void) | null = null;
  onerror: (() => void) | null = null;
  onabort: (() => void) | null = null;

  open(method: string, url: string): void {
    this.method = method;
    this.url = url;
  }

  send(form: FormData): void {
    const file = form.get('file');
    this.name = file instanceof File ? file.name : '';
    FakeXhr.all.push(this);
  }

  abort(): void {
    this.onabort?.();
  }

  progress(loaded: number, total: number): void {
    act(() => this.upload.onprogress?.({ loaded, total, lengthComputable: true }));
  }

  async respond(status: number, body: unknown): Promise<void> {
    this.status = status;
    this.responseText = JSON.stringify(body);
    await act(async () => this.onload?.());
  }

  async drop(): Promise<void> {
    await act(async () => this.onerror?.());
  }

  static named(name: string): FakeXhr {
    const found = FakeXhr.all.filter((xhr) => xhr.name === name).at(-1);
    if (!found) throw new Error(`no upload of ${name}`);
    return found;
  }
}

const MB = 1024 * 1024;

function file(name: string, size: number): File {
  const made = new File(['x'], name);
  Object.defineProperty(made, 'size', { value: size });
  return made;
}

function stored(name: string, n: number): { file: Record<string, unknown> } {
  return { file: { id: `f${n}`, documentId: `d${n}`, name, kind: name.split('.').pop(), size: 1000, version: 1, savedAt: '2026-11-05T03:00:00.000Z' } };
}

let uploads: Upload[];

beforeEach(() => {
  FakeXhr.all = [];
  uploads = [];
  window.history.replaceState(null, '', '/upload?lang=vi');
  vi.stubGlobal('XMLHttpRequest', FakeXhr);
  vi.stubGlobal(
    'fetch',
    vi.fn(async (path: string) => (String(path) === '/api/files' ? answer(200, { files: uploads }) : answer(404, { error: 'not-found' }))),
  );
});

afterEach(() => {
  vi.unstubAllGlobals();
});

function pick(files: File[]): void {
  fireEvent.change(screen.getByLabelText('Chọn tệp để tải lên'), { target: { files } });
}

const rows = (): HTMLElement[] => screen.getAllByRole('listitem').filter((li) => li.dataset.id === 'upload-row');

describe('UploadScreen', () => {
  it('waits for files, and shows the gate while files are dragged over it', () => {
    renderWithI18n(<UploadScreen />);
    expect(screen.getByRole('heading', { name: 'Tải file Office' })).toBeTruthy();
    expect(screen.getByText('Thả một hoặc nhiều tệp vào đây')).toBeTruthy();
    expect(screen.getByText('docx · xlsx · pptx · pdf · md · tối đa 25 MB mỗi tệp')).toBeTruthy();
    fireEvent.dragOver(document.querySelector('[data-id="upload-screen"]') as Element, { dataTransfer: { items: [{ kind: 'file' }, { kind: 'file' }], files: [] } });
    expect(screen.getByText('Thả 2 tệp vào cổng')).toBeTruthy();
  });

  it('uploads each file on its own: refused ones beside ones that go, progress, the ring and a retry after a dropped connection', async () => {
    renderWithI18n(<UploadScreen />);
    pick([file('lab-notes.docx', 48 * 1024), file('so-do.vsdx', 210 * 1024), file('bao-cao.pdf', 30 * MB), file('dns-notes.docx', 64 * 1024), file('k8s-intro.pptx', 3 * MB)]);

    // Refused in the browser, never sent; the two first good files upload, the third waits for a slot.
    await waitFor(() => expect(FakeXhr.all.map((x) => x.name)).toEqual(['lab-notes.docx', 'dns-notes.docx']));
    expect(within(rows()[1] as HTMLElement).getByText('Định dạng chưa hỗ trợ · lưu sang docx, xlsx, pptx, pdf hoặc md')).toBeTruthy();
    expect(within(rows()[2] as HTMLElement).getByText('Quá 25 MB · chia nhỏ hoặc nén lại')).toBeTruthy();
    expect(within(rows()[1] as HTMLElement).getByRole('button', { name: 'Bỏ so-do.vsdx' })).toBeTruthy();
    expect(screen.getByText('còn 3 tệp')).toBeTruthy();

    FakeXhr.named('lab-notes.docx').progress(24 * 1024, 48 * 1024);
    expect(within(rows()[0] as HTMLElement).getByText('Đang tải 50%')).toBeTruthy();
    await FakeXhr.named('lab-notes.docx').respond(201, stored('lab-notes.docx', 1));
    expect(within(rows()[0] as HTMLElement).getByText('Xong')).toBeTruthy();
    expect(within(rows()[0] as HTMLElement).getByRole('link', { name: 'Mở lab-notes.docx' }).getAttribute('href')).toBe('/d/d1');

    // A dropped connection fails that file only; the next one starts.
    await FakeXhr.named('dns-notes.docx').drop();
    await waitFor(() => expect(FakeXhr.all.map((x) => x.name)).toContain('k8s-intro.pptx'));
    expect(within(rows()[3] as HTMLElement).getByText('Mất mạng giữa chừng · thử lại khi có mạng')).toBeTruthy();
    expect(screen.getByText('5 tệp · 1 xong · 3 lỗi')).toBeTruthy();
    FakeXhr.named('k8s-intro.pptx').progress(3 * MB * 0.9, 3 * MB);
    // The board's figure: the mean of the files uploading or uploaded (100 and 90).
    expect(screen.getByRole('progressbar', { name: 'Tiến độ tải lên 95%' })).toBeTruthy();
    await FakeXhr.named('k8s-intro.pptx').respond(201, stored('k8s-intro.pptx', 3));

    fireEvent.click(screen.getByRole('button', { name: 'Thử lại dns-notes.docx' }));
    await waitFor(() => expect(FakeXhr.all.filter((x) => x.name === 'dns-notes.docx')).toHaveLength(2));
    await FakeXhr.named('dns-notes.docx').respond(201, stored('dns-notes.docx', 2));
    expect(screen.getByText('5 tệp · 3 xong · 2 lỗi')).toBeTruthy();
  });

  it('turns a server refusal into its fix, and cancels an upload without touching the others', async () => {
    renderWithI18n(<UploadScreen />);
    pick([file('locked.docx', 1000), file('slow.pptx', 2 * MB)]);
    await waitFor(() => expect(FakeXhr.all).toHaveLength(2));
    await FakeXhr.named('locked.docx').respond(415, { error: 'encrypted' });
    expect(screen.getByText('Tệp có mật khẩu · bỏ mật khẩu rồi lưu lại')).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Thử lại locked.docx' })).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Huỷ slow.pptx' }));
    await waitFor(() => expect(within(rows()[1] as HTMLElement).getByText('Đã huỷ')).toBeTruthy());
    // Nothing left running: the drop area lists what went wrong and how to fix it.
    const errors = document.querySelector('[data-id="upload-errors"]') as HTMLElement;
    expect(within(errors).getByText('locked.docx có mật khẩu')).toBeTruthy();
    expect(within(errors).getByText('Cách khắc phục: bỏ mật khẩu ở Tệp › Thông tin › Bảo vệ tài liệu, lưu lại rồi thả lại')).toBeTruthy();
  });

  it('follows the server reading the uploaded files, and leads to the Import Center', async () => {
    renderWithI18n(<UploadScreen />);
    pick([file('lab-notes.docx', 1000)]);
    await waitFor(() => expect(FakeXhr.all).toHaveLength(1));
    uploads = [
      {
        fileId: 'f1',
        documentId: 'd1',
        name: 'lab-notes.docx',
        kind: 'docx',
        size: 1000,
        createdAt: '2026-11-05T03:00:00.000Z',
        space: { slug: 'personal-x', nameVi: 'Vũ trụ của bạn', nameEn: 'Your universe', kind: 'personal' },
        collection: null,
        processing: { status: 'running', steps: [], attempts: 1, maxAttempts: 3, error: null, nextAttemptAt: null, updatedAt: '2026-11-05T03:00:00.000Z', finishedAt: null },
        suggestions: null,
      },
    ];
    await FakeXhr.named('lab-notes.docx').respond(201, stored('lab-notes.docx', 1));
    expect(await screen.findByText('Đang đọc nội dung · 0/1 tệp')).toBeTruthy();
    expect(screen.getByRole('link', { name: 'Xem từng bước xử lý' }).getAttribute('href')).toBe('/import');
    expect(screen.getByRole('link', { name: /Xem chi tiết xử lý/ }).getAttribute('href')).toBe('/import');
  });
});
