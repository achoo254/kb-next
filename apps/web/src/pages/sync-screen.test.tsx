/**
 * Offline sync (H04) in jsdom over a real (fake-indexeddb) store: offline, the queue of drafts and notes waiting,
 * the conflict's two versions side by side (choices wait for a connection); back online, the drafts go up and the
 * card says how many; keeping this version or the server's; a refused draft retried; reconnecting by hand; and the
 * near-full storage warning.
 */
import 'fake-indexeddb/auto';
import { act, fireEvent, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { EditableDocument } from '../api/authoring-api';
import { answer } from '../test/api-fakes';
import { makeDocx } from '../test/office-files';
import { renderWithI18n } from '../test/render';
import { resetDraftStore, writeDraft } from './editor-drafts';
import { keepDraft, readEntry, resetOfficeStore, updateEntry } from './office-store';
import { SyncScreen } from './sync-screen';

const MB = 1024 * 1024;
const ME = 'user-me';
const EDITED = Date.parse('2026-11-03T14:05:00.000Z');
const LOCAL = makeDocx(['Ghi chú: DHCP', 'DORA = Discover → Offer → Request → Acknowledge.', 'Lease mặc định 24 giờ.']);
const SERVER = makeDocx(['Ghi chú: DHCP', 'DORA = Discover → Offer → Request → Acknowledge.', 'Server cấp IP qua cổng 67.']);

const NOTE: EditableDocument = {
  id: 'note-arp',
  title: 'Ghi chú: ARP',
  body: 'ARP hỏi MAC của một IP.',
  type: 'note',
  lang: 'vi',
  origin: 'own',
  status: 'draft',
  planet: null,
  rev: '2026-11-03T14:00:00.000Z',
  version: 1,
  savedAt: '2026-11-03T14:00:00.000Z',
  space: { slug: 'personal-me', nameVi: 'Vũ trụ của bạn', nameEn: 'Your universe', tint: 't', glow: 'g', kind: 'personal' },
  collection: null,
};

let online = false;
let usage = 0;
let puts: string[];
let healthy = true;
let signedOut = false;

function saved(id: string): Response {
  return answer(200, { file: { id, documentId: 'd', name: 'x.docx', kind: 'docx', size: 1, version: 4, savedAt: '2026-11-05T03:00:00.000Z' } });
}

async function seed(): Promise<void> {
  await keepDraft({ userId: ME, documentId: 'doc-lab', fileId: 'file-lab-v2', name: 'lab-notes.docx', kind: 'docx', bytes: LOCAL }, EDITED);
  await updateEntry(ME, 'doc-lab', { state: 'conflict', conflict: { fileId: 'file-lab-v3', version: 3, savedAt: '2026-11-03T14:12:00.000Z', bytes: SERVER } });
  await keepDraft({ userId: ME, documentId: 'doc-subnet', fileId: 'file-subnet-v1', name: 'subnet.xlsx', kind: 'xlsx', bytes: new ArrayBuffer(8) }, EDITED - 60_000);
  await writeDraft({ id: NOTE.id, title: NOTE.title, body: NOTE.body, planet: null, baseRev: NOTE.rev, editedAt: EDITED, doc: NOTE, userId: ME });
  // Another account's draft and note on this browser: never listed, never sent.
  await keepDraft({ userId: 'user-other', documentId: 'doc-theirs', fileId: 'file-theirs', name: 'theirs.docx', kind: 'docx', bytes: new ArrayBuffer(8) }, EDITED);
  await writeDraft({ id: 'note-theirs', title: 'Của người khác', body: '', planet: null, baseRev: NOTE.rev, editedAt: EDITED, doc: { ...NOTE, id: 'note-theirs' }, userId: 'user-other' });
}

beforeEach(async () => {
  online = false;
  usage = 10 * MB;
  puts = [];
  healthy = true;
  Object.defineProperty(window.navigator, 'onLine', { configurable: true, get: () => online });
  Object.defineProperty(window.navigator, 'storage', {
    configurable: true,
    value: { estimate: async () => ({ usage, quota: 1000 * MB }), persist: async () => true, persisted: async () => true },
  });
  window.history.replaceState(null, '', '/sync?lang=vi');
  // The account last signed in here: what the queue shows while the session cannot be asked (offline).
  localStorage.setItem('kb-office-account', ME);
  signedOut = false;
  vi.stubGlobal(
    'fetch',
    vi.fn(async (path: string, init?: RequestInit) => {
      const url = String(path);
      if (url === '/healthz') return new Response('ok', { status: healthy ? 200 : 503 });
      if (url === '/api/session') {
        if (!online) throw new TypeError('offline');
        return answer(200, { signedIn: true, signInAvailable: true, user: { id: ME, name: 'Chủ', email: null, picture: null } });
      }
      if (init?.method === 'PUT') {
        puts.push(url);
        if (signedOut) return answer(401, { error: 'sign-in-required' });
        if (url === '/api/files/file-subnet-v1') return saved('file-subnet-v2');
        if (url === '/api/files/file-lab-v3') return saved('file-lab-v4');
        if (url === '/api/files/file-big') return answer(413, { error: 'too-large' });
      }
      return answer(404, { error: 'not-found' });
    }),
  );
  await seed();
});

afterEach(async () => {
  vi.unstubAllGlobals();
  await resetOfficeStore();
  await resetDraftStore();
  indexedDB.deleteDatabase('kb-office');
  indexedDB.deleteDatabase('kb-editor');
});

function goOnline(): void {
  online = true;
  act(() => {
    window.dispatchEvent(new Event('online'));
  });
}

const queueRows = (): HTMLElement[] => [...document.querySelectorAll<HTMLElement>('.sync-row')];

describe('SyncScreen', () => {
  it('offline: lists what waits, shows both versions of the conflict, and waits for a connection to choose', async () => {
    renderWithI18n(<SyncScreen />);
    await waitFor(() => expect(queueRows()).toHaveLength(3));
    expect(screen.getByText('Bạn đang offline · mọi thay đổi lưu trên máy')).toBeTruthy();
    expect(screen.getByText('3')).toBeTruthy();
    expect(queueRows().map((row) => [row.querySelector('.sync-row-name')?.textContent, row.querySelector('.sync-pill')?.textContent])).toEqual([
      ['lab-notes.docx', 'Có 2 bản'],
      ['subnet.xlsx', 'Chờ mạng'],
      ['Ghi chú: ARP', 'Chờ mạng'],
    ]);
    expect(within(queueRows()[2] as HTMLElement).getByText('Ghi chú mới')).toBeTruthy();

    expect(screen.getByText('lab-notes.docx có 2 bản khác nhau')).toBeTruthy();
    expect(await screen.findByText('Lease mặc định 24 giờ.')).toBeTruthy();
    expect(screen.getByText('Server cấp IP qua cổng 67.')).toBeTruthy();
    expect(screen.getByText('Bản trên máy này · 21:05')).toBeTruthy();
    expect(screen.getByText('Bản trên server · 21:12')).toBeTruthy();
    expect((screen.getByRole('button', { name: 'Giữ bản này' }) as HTMLButtonElement).disabled).toBe(true);
    expect(screen.getByText('Vẫn làm được khi offline')).toBeTruthy();
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('back online: sends the drafts (never the one in conflict) and says how many went', async () => {
    renderWithI18n(<SyncScreen />);
    await waitFor(() => expect(queueRows()).toHaveLength(3));
    goOnline();
    expect(await screen.findByText('Đã đồng bộ 1 thay đổi')).toBeTruthy();
    expect(puts).toEqual(['/api/files/file-subnet-v1']);
    expect((await readEntry(ME, 'doc-subnet'))?.state).toBe('synced');
    await waitFor(() => expect(queueRows().map((row) => row.querySelector('.sync-row-name')?.textContent)).toEqual(['lab-notes.docx', 'Ghi chú: ARP']));
    expect(screen.getByText('Đã có mạng lại')).toBeTruthy();
    expect(screen.getByRole('link', { name: 'Mở Ghi chú: ARP' }).getAttribute('href')).toBe('/d/note-arp/edit');
  });

  it('pauses on an ended session without marking anything, and never touches another account’s drafts', async () => {
    signedOut = true;
    renderWithI18n(<SyncScreen />);
    await waitFor(() => expect(queueRows()).toHaveLength(3));
    goOnline();
    await waitFor(() => expect(puts).toEqual(['/api/files/file-subnet-v1']));
    expect(await readEntry(ME, 'doc-subnet')).toMatchObject({ state: 'draft', error: null });
    expect((await readEntry('user-other', 'doc-theirs'))?.state).toBe('draft');
    expect(screen.queryByText('theirs.docx')).toBeNull();
    expect(screen.queryByText('Của người khác')).toBeNull();
  });

  it('lists a draft saved offline in another tab of this browser', async () => {
    renderWithI18n(<SyncScreen />);
    await waitFor(() => expect(queueRows()).toHaveLength(3));
    await keepDraft({ userId: ME, documentId: 'doc-dns', fileId: 'file-dns-v1', name: 'dns-notes.docx', kind: 'docx', bytes: new ArrayBuffer(8) }, EDITED + 1000);
    // What the reader's announce() sends from the other tab.
    const otherTab = new BroadcastChannel('kb-office-change');
    otherTab.postMessage(null);
    otherTab.close();
    await waitFor(() => expect(queueRows()).toHaveLength(4));
    expect(screen.getByText('dns-notes.docx')).toBeTruthy();
  });

  it('keeps this device’s version on top of the server’s, or the server’s instead', async () => {
    online = true;
    renderWithI18n(<SyncScreen />);
    fireEvent.click(await screen.findByRole('button', { name: 'Giữ bản này' }));
    expect(await screen.findByText('Đã giữ bản trên máy này. Bản kia lưu vào lịch sử.')).toBeTruthy();
    expect(puts).toContain('/api/files/file-lab-v3');
    expect(await readEntry(ME, 'doc-lab')).toMatchObject({ state: 'synced', fileId: 'file-lab-v4' });

    await updateEntry(ME, 'doc-lab', { state: 'conflict', conflict: { fileId: 'file-lab-v5', version: 5, savedAt: '2026-11-03T15:00:00.000Z', bytes: SERVER } });
    window.dispatchEvent(new Event('kb-office-change'));
    fireEvent.click(await screen.findByRole('button', { name: 'Giữ bản kia' }));
    expect(await screen.findByText('Đã giữ bản trên server. Bản của bạn đã bỏ.')).toBeTruthy();
    expect(await readEntry(ME, 'doc-lab')).toMatchObject({ state: 'synced', fileId: 'file-lab-v5' });
  });

  it('marks a draft the server refuses, retries it, and warns when storage is nearly full', async () => {
    await keepDraft({ userId: ME, documentId: 'doc-big', fileId: 'file-big', name: 'big.docx', kind: 'docx', bytes: new ArrayBuffer(8) }, EDITED + 1000);
    usage = 790 * MB;
    online = true;
    renderWithI18n(<SyncScreen />);
    expect(await screen.findByText('Lỗi · tệp quá 25 MB')).toBeTruthy();
    expect(screen.getByRole('alert').textContent).toContain('Bộ nhớ trên máy gần đầy');
    fireEvent.click(screen.getByRole('button', { name: 'Thử lại big.docx' }));
    await waitFor(() => expect(puts.filter((p) => p === '/api/files/file-big')).toHaveLength(2));
  });

  it('reconnects by hand once the server answers', async () => {
    renderWithI18n(<SyncScreen />);
    await waitFor(() => expect(queueRows()).toHaveLength(3));
    healthy = false;
    fireEvent.click(screen.getByRole('button', { name: 'Kết nối lại' }));
    expect(await screen.findByText('Bạn đang offline · mọi thay đổi lưu trên máy')).toBeTruthy();
    healthy = true;
    fireEvent.click(screen.getByRole('button', { name: 'Kết nối lại' }));
    expect(await screen.findByText('Đã có mạng lại')).toBeTruthy();
  });
});
