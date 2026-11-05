/**
 * The Office files kept in this browser: each account's own, a server copy never replaces a draft, a sync settles only
 * the revision it sent (a save made meanwhile stays a draft), offline use asks the browser to keep the storage, the
 * quota's safe share is respected by evicting synced copies least recently used first (never a draft, checked again
 * when deleting), H04's near-full warning; and the text of two versions read back, capped, for their side-by-side.
 */
import 'fake-indexeddb/auto';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { makeDocx, makeZip } from '../test/office-files';
import { EDITOR_CACHE_BYTES, USABLE_SHARE, entryKey, keepDraft, keepServerCopy, listEntries, makeRoom, mutate, readEntry, resetOfficeStore, settleSent, storageStatus } from './office-store';
import { MAX_PART_BYTES, compareParagraphs, officeParagraphs } from './office-text';

const ME = 'user-me';
const OTHER = 'user-other';

const MB = 1024 * 1024;
let usage = 0;
let quota = 0;
const persist = vi.fn(async () => true);

function bytes(size: number): ArrayBuffer {
  return new ArrayBuffer(size);
}

function copy(documentId: string, size: number): Parameters<typeof keepServerCopy>[0] {
  return { userId: ME, documentId, fileId: `file-${documentId}`, name: `${documentId}.docx`, kind: 'docx', bytes: bytes(size) };
}

beforeEach(() => {
  usage = 0;
  quota = 0;
  persist.mockClear();
  vi.stubGlobal('navigator', {
    ...navigator,
    onLine: true,
    storage: {
      estimate: async () => ({ usage, quota }),
      persist,
      persisted: async () => true,
    },
  });
});

afterEach(async () => {
  await resetOfficeStore();
  indexedDB.deleteDatabase('kb-office');
  vi.unstubAllGlobals();
});

describe('office store', () => {
  it('keeps a server copy, never over a draft, and asks once for persistent storage', async () => {
    expect(await keepServerCopy(copy('a', 10), 1)).toBe(true);
    expect(await keepDraft({ ...copy('a', 20), fileId: 'file-a' }, 2)).toBe('stored');
    expect(await keepServerCopy(copy('a', 30), 3)).toBe(false);
    const entry = await readEntry(ME, 'a');
    expect(entry).toMatchObject({ state: 'draft', editedAt: 2, fileId: 'file-a' });
    expect(entry?.bytes.byteLength).toBe(20);
    expect(persist).toHaveBeenCalledTimes(1);
  });

  it('evicts synced copies least recently used first to stay under the safe share, never a draft', async () => {
    quota = 1000 * MB;
    const usable = quota * USABLE_SHARE - EDITOR_CACHE_BYTES;
    await keepServerCopy(copy('old', 5 * MB), 1);
    await keepServerCopy(copy('newer', 5 * MB), 2);
    await keepDraft(copy('draft', 5 * MB), 3);
    // Nearly full: 8 MB more needs both synced copies gone, oldest first; the draft stays.
    usage = usable - 2 * MB;
    expect(await makeRoom(4 * MB)).toBe(true);
    expect((await listEntries(ME)).map((e) => e.documentId).sort()).toEqual(['draft', 'newer']);
    usage = usable;
    expect(await makeRoom(20 * MB)).toBe(false);
    expect((await listEntries(ME)).map((e) => e.documentId)).toEqual(['draft']);
  });

  it('skips a server copy that does not fit, but always keeps a draft the browser accepts', async () => {
    quota = 200 * MB;
    usage = quota * USABLE_SHARE - EDITOR_CACHE_BYTES;
    expect(await keepServerCopy(copy('big', 2 * MB), 1)).toBe(false);
    expect(await keepDraft(copy('work', 2 * MB), 2)).toBe('stored');
    expect((await listEntries(ME)).map((e) => e.documentId)).toEqual(['work']);
  });

  it('keeps each account’s records apart: another account signed in here never lists or reads them', async () => {
    await keepDraft(copy('shared-doc', 10), 1);
    await keepDraft({ ...copy('shared-doc', 12), userId: OTHER }, 2);
    expect((await listEntries(ME)).map((e) => [e.userId, e.bytes.byteLength])).toEqual([[ME, 10]]);
    expect((await listEntries(OTHER)).map((e) => [e.userId, e.bytes.byteLength])).toEqual([[OTHER, 12]]);
    expect(await readEntry('someone-else', 'shared-doc')).toBeNull();
  });

  it('settles only the revision a sync sent: a save made while it was on its way stays a draft on the new base', async () => {
    await keepDraft({ ...copy('doc', 10), fileId: 'f0' }, 1);
    const sent = await readEntry(ME, 'doc');
    expect(sent?.revision).toBe(1);
    // Saved again while revision 1 travels.
    await keepDraft({ ...copy('doc', 20), fileId: 'f0' }, 2);
    const after = await settleSent(ME, 'doc', 1, { kind: 'saved', fileId: 'f1' });
    expect(after).toMatchObject({ state: 'draft', revision: 2, fileId: 'f1', editedAt: 2 });
    // A conflict or a refusal for the old revision leaves the newer draft alone too.
    expect(await settleSent(ME, 'doc', 1, { kind: 'failed', error: 'too-large' })).toMatchObject({ state: 'draft', revision: 2 });
    expect(await settleSent(ME, 'doc', 2, { kind: 'saved', fileId: 'f2' })).toMatchObject({ state: 'synced', fileId: 'f2', editedAt: null });
  });

  it('never evicts a record that became a draft after it was picked for eviction', async () => {
    quota = 1000 * MB;
    expect(await keepServerCopy(copy('copy', 5 * MB), 1)).toBe(true);
    usage = quota * USABLE_SHARE - EDITOR_CACHE_BYTES;
    // Another tab saves a draft over the copy right after makeRoom listed it: its delete checks again and skips it.
    const getAll = vi.spyOn(IDBObjectStore.prototype, 'getAll');
    getAll.mockImplementationOnce(function (this: IDBObjectStore, ...args: Parameters<IDBObjectStore['getAll']>) {
      // The once-implementation is used up: this call reaches the real getAll.
      const request = this.getAll(...args);
      void mutate(entryKey(ME, 'copy'), (current) => (current ? { ...current, state: 'draft', revision: current.revision + 1 } : null));
      return request;
    });
    expect(await makeRoom(4 * MB)).toBe(false);
    getAll.mockRestore();
    expect((await readEntry(ME, 'copy'))?.state).toBe('draft');
  });

  it('warns when past 90% of what may be used, and says nothing when the browser gives no estimate', async () => {
    quota = 1000 * MB;
    const usable = quota * USABLE_SHARE - EDITOR_CACHE_BYTES;
    usage = usable * 0.5;
    expect(await storageStatus()).toMatchObject({ near: false, persisted: true });
    usage = usable * 0.95;
    expect(await storageStatus()).toMatchObject({ near: true, usable });
    vi.stubGlobal('navigator', { ...navigator, storage: undefined });
    expect(await storageStatus()).toEqual({ usage: null, usable: null, near: false, persisted: false });
  });
});

describe('office text', () => {
  it('reads a docx’s paragraphs and finds where two versions part', async () => {
    const local = await officeParagraphs(makeDocx(['Ghi chú: DHCP', 'DORA = Discover → Offer → Request → Acknowledge.', 'Lease mặc định 24 giờ.']), 'docx');
    const server = await officeParagraphs(makeDocx(['Ghi chú: DHCP', 'DORA = Discover → Offer → Request → Acknowledge.', 'Server cấp IP qua cổng 67.']), 'docx');
    expect(local).toEqual(['Ghi chú: DHCP', 'DORA = Discover → Offer → Request → Acknowledge.', 'Lease mặc định 24 giờ.']);
    expect(compareParagraphs(local, server)).toEqual({
      localTitle: 'Ghi chú: DHCP',
      serverTitle: 'Ghi chú: DHCP',
      context: 'DORA = Discover → Offer → Request → Acknowledge.',
      local: 'Lease mặc định 24 giờ.',
      server: 'Server cấp IP qua cổng 67.',
      localExtra: 1,
      serverExtra: 1,
    });
  });

  it('reads xlsx strings and pptx slides in order, and gives nothing for what it cannot read', async () => {
    // A part that inflates past the cap is read only that far.
    const huge = makeZip({ 'word/document.xml': `<w:p><w:t>${'a'.repeat(MAX_PART_BYTES + 1000)}</w:t></w:p>` });
    expect(await officeParagraphs(huge, 'docx')).toEqual([]);
    const xlsx = makeZip({ 'xl/sharedStrings.xml': '<sst><si><t>Subnet</t></si><si><r><t>Prefix</t></r><r><t> length</t></r></si></sst>' });
    expect(await officeParagraphs(xlsx, 'xlsx')).toEqual(['Subnet', 'Prefix length']);
    const pptx = makeZip({ 'ppt/slides/slide10.xml': '<a:p><a:t>Mười</a:t></a:p>', 'ppt/slides/slide2.xml': '<a:p><a:t>Hai &amp; ba</a:t></a:p>' });
    expect(await officeParagraphs(pptx, 'pptx')).toEqual(['Hai & ba', 'Mười']);
    expect(await officeParagraphs(new TextEncoder().encode('not a zip').buffer, 'docx')).toEqual([]);
  });
});
