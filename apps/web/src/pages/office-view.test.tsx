/**
 * An Office file in the reader (C11) in jsdom: the editor's frame from its own origin, messages read only from that
 * origin and that frame, the file's bytes handed to it, a save kept in this browser and sent as the next version
 * (saved, in conflict, or kept for later offline), and the files the editor does not open.
 */
import 'fake-indexeddb/auto';
import { act, fireEvent, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { DocumentFile } from '../api/content-api';
import { answer } from '../test/api-fakes';
import { makeDocx } from '../test/office-files';
import { renderWithI18n } from '../test/render';
import { readEntry, resetOfficeStore } from './office-store';
import { OfficeView, forgetEditorConfig } from './office-view';

const EDITOR = 'https://office.example';
const ME = 'user-me';
const FILE: DocumentFile = { id: 'f1', name: 'lab-notes.docx', kind: 'docx', size: 48 * 1024, version: 2, savedAt: '2026-11-03T14:05:00.000Z', editable: true };
const BYTES = makeDocx(['Ghi chú: DHCP']);

let origin: string | null;
let online: boolean;
let putReply: () => Response;
let puts: string[];

beforeEach(() => {
  origin = EDITOR;
  online = true;
  puts = [];
  putReply = () => answer(200, { file: { id: 'f2', documentId: 'd1', name: 'lab-notes.docx', kind: 'docx', size: 10, version: 3, savedAt: '2026-11-05T03:00:00.000Z' } });
  forgetEditorConfig();
  Object.defineProperty(window.navigator, 'onLine', { configurable: true, get: () => online });
  window.history.replaceState(null, '', '/d/d1?lang=vi');
  vi.stubGlobal(
    'fetch',
    vi.fn(async (path: string, init?: RequestInit) => {
      const url = String(path);
      if (url === '/api/session') return answer(200, { signedIn: true, signInAvailable: true, user: { id: ME, name: 'Chủ', email: null, picture: null } });
      if (url === '/api/office-editor') return answer(200, { origin, maxBytes: 25 * 1024 * 1024 });
      if (url === '/api/files/f1' && init?.method === 'PUT') {
        puts.push(url);
        return putReply();
      }
      if (url === '/api/files/f1') return new Response(BYTES.slice(0), { status: 200 });
      return answer(404, { error: 'not-found' });
    }),
  );
});

afterEach(async () => {
  vi.unstubAllGlobals();
  await resetOfficeStore();
  indexedDB.deleteDatabase('kb-office');
});

interface Posted {
  id: string;
  type: string;
  payload: Record<string, unknown>;
}

/** Opens the editor and returns its frame and what the page posted to it. */
async function openEditor(): Promise<{ frame: HTMLIFrameElement; posted: Posted[]; target: string[] }> {
  fireEvent.click(screen.getByRole('button', { name: 'Mở để sửa' }));
  const frame = (await screen.findByTitle('Trình sửa lab-notes.docx')) as HTMLIFrameElement;
  const posted: Posted[] = [];
  const target: string[] = [];
  const win = frame.contentWindow;
  if (!win) throw new Error('no frame window');
  vi.spyOn(win, 'postMessage').mockImplementation((message: unknown, to?: unknown) => {
    posted.push(message as Posted);
    target.push(String(to));
  });
  return { frame, posted, target };
}

function fromEditor(frame: HTMLIFrameElement, data: unknown, from = EDITOR, source: Window | null = frame.contentWindow): void {
  act(() => {
    window.dispatchEvent(new MessageEvent('message', { data, origin: from, source }));
  });
}

async function ready(frame: HTMLIFrameElement, posted: Posted[]): Promise<void> {
  fromEditor(frame, { type: 'document:ready' });
  await waitFor(() => expect(posted.map((p) => p.type)).toEqual(['document:open-buffer']));
  fromEditor(frame, { type: 'document:opened', id: posted[0]?.id });
  await waitFor(() => expect((screen.getByRole('button', { name: 'Lưu' }) as HTMLButtonElement).disabled).toBe(false));
}

async function save(frame: HTMLIFrameElement, posted: Posted[]): Promise<void> {
  fireEvent.click(screen.getByRole('button', { name: 'Lưu' }));
  await waitFor(() => expect(posted.at(-1)?.type).toBe('document:save'));
  fromEditor(frame, { type: 'document:saved', id: posted.at(-1)?.id, payload: { file: new Blob([makeDocx(['Ghi chú: DHCP', 'Lease 24 giờ.'])]), dirty: false } });
}

describe('OfficeView', () => {
  it('embeds the editor from its own origin and reads only that origin and that frame', async () => {
    renderWithI18n(<OfficeView documentId="d1" file={FILE} offline={false} />);
    expect(screen.getByText('48 KB · phiên bản v2')).toBeTruthy();
    const { frame, posted, target } = await openEditor();
    expect(frame.getAttribute('src')).toBe(`${EDITOR}/editor?embed=1&embedOrigin=${encodeURIComponent(window.location.origin)}`);

    fromEditor(frame, { type: 'document:ready' }, 'https://evil.example');
    fromEditor(frame, { type: 'document:ready' }, EDITOR, window);
    fromEditor(frame, { type: 'not-the-editor' });
    expect(posted).toEqual([]);

    await ready(frame, posted);
    expect(target).toEqual([EDITOR]);
    expect(posted[0]?.payload).toMatchObject({ fileName: 'lab-notes.docx', readonly: false });
    expect((posted[0]?.payload.buffer as ArrayBuffer).byteLength).toBe(BYTES.byteLength);
    // The server's copy is kept so the file opens offline later.
    expect(await readEntry(ME, 'd1')).toMatchObject({ state: 'synced', fileId: 'f1' });
  });

  it('keeps a save in this browser, then sends it as the next version', async () => {
    renderWithI18n(<OfficeView documentId="d1" file={FILE} offline={false} />);
    const { frame, posted } = await openEditor();
    await ready(frame, posted);
    await save(frame, posted);
    expect(await screen.findByText('Đã lưu thành phiên bản mới trên server.')).toBeTruthy();
    expect(puts).toEqual(['/api/files/f1']);
    expect(await readEntry(ME, 'd1')).toMatchObject({ state: 'synced', fileId: 'f2' });
  });

  it('sends the reader to H04 when the server has a newer version', async () => {
    putReply = () => answer(409, { error: 'conflict', current: { fileId: 'f9', version: 4, savedAt: '2026-11-03T14:12:00.000Z' } });
    renderWithI18n(<OfficeView documentId="d1" file={FILE} offline={false} />);
    const { frame, posted } = await openEditor();
    await ready(frame, posted);
    await save(frame, posted);
    expect(await screen.findByText(/Trên server đã có bản mới hơn\./)).toBeTruthy();
    expect(screen.getByRole('link', { name: 'Chọn bản giữ lại' }).getAttribute('href')).toBe('/sync');
    expect(await readEntry(ME, 'd1')).toMatchObject({ state: 'conflict', conflict: { fileId: 'f9', version: 4 } });
  });

  it('offline: keeps the save as a draft for later, and opens it from this browser next time', async () => {
    const { unmount } = renderWithI18n(<OfficeView documentId="d1" file={FILE} offline={false} />);
    const first = await openEditor();
    await ready(first.frame, first.posted);
    online = false;
    await save(first.frame, first.posted);
    expect(await screen.findByText('Đã lưu trên máy · đồng bộ khi có mạng')).toBeTruthy();
    expect(puts).toEqual([]);
    expect(await readEntry(ME, 'd1')).toMatchObject({ state: 'draft', fileId: 'f1' });
    unmount();

    renderWithI18n(<OfficeView documentId="d1" file={FILE} offline />);
    const again = await openEditor();
    await ready(again.frame, again.posted);
    expect(screen.getByText('Đang mở bản nháp trên máy (chưa có trên server).')).toBeTruthy();
  });

  it('says when no editor is set up, and reads PDF and Markdown as text only', async () => {
    origin = null;
    const { unmount } = renderWithI18n(<OfficeView documentId="d1" file={FILE} offline={false} />);
    fireEvent.click(screen.getByRole('button', { name: 'Mở để sửa' }));
    expect(await screen.findByText('Trình sửa Office chưa bật trên máy chủ này. Tải tệp về hoặc đọc phần chữ bên dưới.')).toBeTruthy();
    unmount();
    renderWithI18n(<OfficeView documentId="d2" file={{ ...FILE, id: 'p1', name: 'scan.pdf', kind: 'pdf', editable: false }} offline={false} />);
    expect(screen.queryByRole('button', { name: /Mở/ })).toBeNull();
    expect(screen.getByText('Tệp PDF và Markdown chỉ đọc được phần chữ bên dưới.')).toBeTruthy();
    expect(screen.getByRole('link', { name: 'Tải về' }).getAttribute('href')).toBe('/api/files/p1');
  });
});
