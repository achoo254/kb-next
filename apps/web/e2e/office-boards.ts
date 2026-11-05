/**
 * Boards C03, C16 and H04 draw an upload, an Import Center and an offline sync mid-way, which a fresh E2E account
 * cannot reach on its own:
 *
 * - C03 (`upload-c03`): the board's six files are picked; the upload answers lab-notes and subnet, cuts dns-notes off
 *   (a dropped connection) and never answers k8s-intro (still sending); bao-cao-mang (over 25 MB) and so-do.vsdx are
 *   refused in the browser.
 * - C16 (`imports-c16`): /api/files answers the board's five files at their steps (E2E has no Tika), with Jev's
 *   suggestion for subnet-calc.xlsx.
 * - H04 (`offline-h04`): this browser's store holds the board's drafts (lab-notes.docx in conflict with the server's
 *   version, subnet.xlsx waiting) and the note "Ghi chú: ARP"; the connection then drops (`offline`). Saves to the
 *   server are cut off, so nothing leaves the queue before the shot.
 */
import { crc32 } from 'node:zlib';
import type { Page } from '@playwright/test';

const KB = 1024;
const MB = 1024 * KB;

/** C03: the picked files, in the board's order (their bytes are zeros; only names and sizes matter). */
export const C03_FILES = [
  { name: 'lab-notes.docx', size: 48 * KB },
  { name: 'subnet.xlsx', size: 120 * KB },
  { name: 'k8s-intro.pptx', size: Math.round(3.2 * MB) },
  { name: 'dns-notes.docx', size: 64 * KB },
  { name: 'bao-cao-mang.pdf', size: 26 * MB },
  { name: 'so-do.vsdx', size: 210 * KB },
] as const;

export async function mockUploadC03(page: Page): Promise<void> {
  let n = 0;
  await page.route('**/api/files', async (route) => {
    if (route.request().method() !== 'POST') return route.fallback();
    const head = (route.request().postDataBuffer() ?? Buffer.alloc(0)).subarray(0, 512).toString('latin1');
    const name = /filename="([^"]+)"/.exec(head)?.[1] ?? '';
    if (name === 'k8s-intro.pptx') return undefined;
    if (name === 'dns-notes.docx') return route.abort('internetdisconnected');
    n += 1;
    const kind = name.split('.').pop();
    return route.fulfill({ status: 201, json: { file: { id: `c0300000-0000-4000-8000-00000000000${n}`, documentId: `c0300000-0000-4000-8000-0000000000d${n}`, name, kind, size: 1, version: 1, savedAt: '2026-11-03T14:05:00.000Z', queued: true } } });
  });
}

const T = '2026-11-03T14:05:00.000Z';
const STATE = { d: 'done', s: 'skipped', r: 'running', e: 'failed', w: 'pending' } as const;
const STEPS = ['upload', 'ocr', 'structure', 'chunk', 'classify', 'index'] as const;
const steps = (codes: string): Array<{ step: string; state: string }> => STEPS.map((step, i) => ({ step, state: STATE[(codes[i] ?? 'w') as keyof typeof STATE] }));
const NET = { slug: 'networking', nameVi: 'Networking', nameEn: 'Networking' };
const K8S = { slug: 'kubernetes', nameVi: 'Kubernetes', nameEn: 'Kubernetes' };
const PERSONAL = { slug: 'personal-e2e', nameVi: 'Vũ trụ của bạn', nameEn: 'Your universe', kind: 'personal' };

function boardFile(n: number, name: string, kind: string, size: number, codes: string, status: string, place: { space: Record<string, string>; collection: Record<string, string> | null }, extra: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    fileId: `c1600000-0000-4000-8000-00000000000${n}`,
    documentId: `c1600000-0000-4000-8000-0000000000d${n}`,
    name,
    kind,
    size,
    createdAt: T,
    space: place.space,
    collection: place.collection,
    processing: { status, steps: steps(codes), attempts: 1, maxAttempts: 3, error: null, nextAttemptAt: null, updatedAt: T, finishedAt: null },
    suggestions: null,
    ...extra,
  };
}

const ADDRESSING = { id: 'c1600000-0000-4000-8000-0000000000c1', nameVi: 'Địa chỉ', nameEn: 'Addressing' };

/** C16: /api/files of the board, newest first. */
export const C16_FILES = {
  files: [
    boardFile(1, 'subnet-calc.xlsx', 'xlsx', 48 * KB, 'dsdddd', 'done', { space: { ...NET, kind: 'public' }, collection: ADDRESSING }, {
      suggestions: { status: 'pending', collection: { collectionId: ADDRESSING.id, probability: 0.91, space: NET, nameVi: 'Địa chỉ', nameEn: 'Addressing' }, tags: [] },
    }),
    boardFile(2, 'k8s-intro.pptx', 'pptx', Math.round(3.2 * MB), 'dsdrww', 'running', { space: { ...K8S, kind: 'public' }, collection: null }),
    boardFile(3, 'scan-ghi-chu-mang.pdf', 'pdf', Math.round(8.1 * MB), 'drwwww', 'running', { space: PERSONAL, collection: null }),
    boardFile(4, 'bao-cao-lab.docx', 'docx', Math.round(1.4 * MB), 'dsewww', 'failed', { space: PERSONAL, collection: null }, {
      processing: { status: 'failed', steps: steps('dsewww'), attempts: 1, maxAttempts: 3, error: { code: 'encrypted', hint: 'remove-password' }, nextAttemptAt: null, updatedAt: T, finishedAt: T },
    }),
    boardFile(5, 'dns-cheatsheet.pdf', 'pdf', 640 * KB, 'wwwwww', 'queued', { space: { ...NET, kind: 'public' }, collection: { id: 'c1600000-0000-4000-8000-0000000000c2', nameVi: 'Giao thức nền tảng', nameEn: 'Core protocols' } }),
  ],
};

export async function mockImportsC16(page: Page): Promise<void> {
  await page.route('**/api/files', (route) => (route.request().method() === 'GET' ? route.fulfill({ json: C16_FILES }) : route.fallback()));
}

/** A stored zip of `entries` (name → text). */
function zip(entries: Record<string, string>): Buffer {
  const locals: Buffer[] = [];
  const centrals: Buffer[] = [];
  let offset = 0;
  const list = Object.entries(entries);
  for (const [name, text] of list) {
    const nameBytes = Buffer.from(name);
    const data = Buffer.from(text);
    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(20, 4);
    local.writeUInt32LE(crc32(data), 14);
    local.writeUInt32LE(data.length, 18);
    local.writeUInt32LE(data.length, 22);
    local.writeUInt16LE(nameBytes.length, 26);
    locals.push(local, nameBytes, data);
    const central = Buffer.alloc(46);
    central.writeUInt32LE(0x02014b50, 0);
    central.writeUInt16LE(20, 4);
    central.writeUInt16LE(20, 6);
    central.writeUInt32LE(crc32(data), 16);
    central.writeUInt32LE(data.length, 20);
    central.writeUInt32LE(data.length, 24);
    central.writeUInt16LE(nameBytes.length, 28);
    central.writeUInt32LE(offset, 42);
    centrals.push(central, nameBytes);
    offset += 30 + nameBytes.length + data.length;
  }
  const size = centrals.reduce((sum, b) => sum + b.length, 0);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(list.length, 8);
  end.writeUInt16LE(list.length, 10);
  end.writeUInt32LE(size, 12);
  end.writeUInt32LE(offset, 16);
  return Buffer.concat([...locals, ...centrals, end]);
}

/** A docx whose paragraphs are `paragraphs`, as base64. */
export function docx(paragraphs: readonly string[]): string {
  const body = paragraphs.map((p) => `<w:p><w:r><w:t>${p}</w:t></w:r></w:p>`).join('');
  return zip({ '[Content_Types].xml': '<Types/>', 'word/document.xml': `<w:document><w:body>${body}</w:body></w:document>` }).toString('base64');
}

const DORA = 'DORA = Discover → Offer → Request → Acknowledge.';

/** H04: the records the init script writes (bytes as base64, turned back into ArrayBuffers in the page). */
const H04_SEED = {
  office: [
    {
      documentId: 'c0400000-0000-4000-8000-0000000000d1',
      fileId: 'c0400000-0000-4000-8000-000000000001',
      name: 'lab-notes.docx',
      kind: 'docx',
      bytes: docx(['Ghi chú: DHCP', DORA, 'Lease mặc định 24 giờ.']),
      state: 'conflict',
      editedAt: Date.parse('2026-11-03T14:05:00.000Z'),
      usedAt: Date.parse('2026-11-03T14:05:00.000Z'),
      error: null,
      conflict: { fileId: 'c0400000-0000-4000-8000-000000000002', version: 3, savedAt: '2026-11-03T14:12:00.000Z', bytes: docx(['Ghi chú: DHCP', DORA, 'Server cấp IP qua cổng 67.']) },
    },
    {
      documentId: 'c0400000-0000-4000-8000-0000000000d2',
      fileId: 'c0400000-0000-4000-8000-000000000003',
      name: 'subnet.xlsx',
      kind: 'xlsx',
      bytes: zip({ '[Content_Types].xml': '<Types/>', 'xl/workbook.xml': '<workbook/>' }).toString('base64'),
      state: 'draft',
      editedAt: Date.parse('2026-11-03T14:02:00.000Z'),
      usedAt: Date.parse('2026-11-03T14:02:00.000Z'),
      error: null,
      conflict: null,
    },
  ],
  note: {
    id: 'c0400000-0000-4000-8000-0000000000d3',
    title: 'Ghi chú: ARP',
    body: 'ARP hỏi MAC của một IP trong mạng.',
    planet: null,
    baseRev: '2026-11-03T13:58:00.000Z',
    editedAt: Date.parse('2026-11-03T14:00:00.000Z'),
    doc: {
      id: 'c0400000-0000-4000-8000-0000000000d3',
      title: 'Ghi chú: ARP',
      body: '',
      type: 'note',
      lang: 'vi',
      origin: 'own',
      status: 'draft',
      planet: null,
      rev: '2026-11-03T13:58:00.000Z',
      version: 1,
      savedAt: '2026-11-03T13:58:00.000Z',
      space: { slug: 'personal-e2e', nameVi: 'Vũ trụ của bạn', nameEn: 'Your universe', tint: '#F9A8D4', glow: '#EC4899', kind: 'personal' },
      collection: null,
    },
  },
};

export async function seedOfflineH04(page: Page): Promise<void> {
  // Saves to the server never arrive: the drafts stay in the queue as the board draws them.
  await page.route('**/api/files/*', (route) => (route.request().method() === 'PUT' ? route.abort('internetdisconnected') : route.fallback()));
  // The drafts belong to the signed-in E2E account (records are kept per account): written once the page knows it,
  // then the screen is told to read them again.
  await page.addInitScript((seed: typeof H04_SEED) => {
    const bytes = (base64: string): ArrayBuffer => Uint8Array.from(atob(base64), (c) => c.charCodeAt(0)).buffer;
    const write = (name: string, version: number, store: string, key: string, records: unknown[]): Promise<void> =>
      new Promise((resolve) => {
        const request = indexedDB.open(name, version);
        request.onupgradeneeded = () => {
          if (request.result.objectStoreNames.contains(store)) request.result.deleteObjectStore(store);
          request.result.createObjectStore(store, { keyPath: key });
        };
        request.onsuccess = () => {
          const tx = request.result.transaction(store, 'readwrite');
          for (const record of records) tx.objectStore(store).put(record);
          tx.oncomplete = () => {
            request.result.close();
            resolve();
          };
        };
        request.onerror = () => resolve();
      });
    void fetch('/api/session')
      .then((res) => res.json() as Promise<{ user?: { id?: string } }>)
      .then(async (session) => {
        const userId = session.user?.id;
        if (!userId) return;
        const office = seed.office.map((entry, i) => ({
          ...entry,
          key: `${userId}|${entry.documentId}`,
          userId,
          revision: i + 1,
          bytes: bytes(entry.bytes),
          conflict: entry.conflict ? { ...entry.conflict, bytes: bytes(entry.conflict.bytes) } : null,
        }));
        await write('kb-office', 2, 'files', 'key', office);
        await write('kb-editor', 1, 'drafts', 'id', [{ ...seed.note, userId }]);
        window.dispatchEvent(new Event('kb-office-change'));
      })
      .catch(() => undefined);
  }, H04_SEED);
}
