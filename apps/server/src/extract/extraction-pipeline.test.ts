/**
 * An uploaded file through the whole extraction (queue, Tika client, Inspector, Decision Engine, Quality Validator,
 * Normalizer, Jev's suggestions, chunks and search sync) on PGlite, with a fake Tika and a fake Jev.
 */
import { randomBytes } from 'node:crypto';
import { mkdtemp, rm, truncate, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { asc, eq } from 'drizzle-orm';
import { PDFDocument } from 'pdf-lib';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { createDocument, createSpace, createUser } from '../../test/content-fixtures';
import { ENGLISH_PAGE, GARBAGE_OCR, SECOND_PAGE, VIETNAMESE_OCR, type FakeJev, fakeJev, makePdf } from '../../test/extract-fixtures';
import { type FakeTika, type TikaCall, type TikaReply, hocrPagesHtml, pdfPagesHtml, startFakeTika, xhtml } from '../../test/fake-tika';
import type { Viewer } from '../access/viewer';
import { type DbHandle, openPglite } from '../db/client';
import { chunks, collections, documentVersions, extractJobs, files } from '../db/schema';
import { type ExtractionService, type ExtractionStatus, MAX_FILE_BYTES, startExtraction } from './index';
import { claimNextJob, queueJob, requeueInterrupted } from './job-store';
import { MAX_ATTEMPTS } from './extraction-queue';
import { PdfWork } from './pdf-work';
import { TikaClient } from './tika-client';

const DOCX = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
const XLSX = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
const PPTX = 'application/vnd.openxmlformats-officedocument.presentationml.presentation';

let database: DbHandle;
let filesDir = '';
let tika: FakeTika;
let ownerId = '';
let otherId = '';
let spaceId = '';
let collectionId = '';
let owner: Viewer;

interface TikaScript {
  /** Text layer of each PDF page, as Tika reads it without OCR. */
  textPages?: string[];
  /** OCR result of each page sent to OCR, in the order they are sent. */
  ocr?: Array<{ text: string; confidence: number }>;
  /** XHTML body of an Office file. */
  office?: string;
  /** Answer of /detect/stream. */
  detected?: string;
}

/** Answers like Tika 2.9 would for the files of one test. */
function scriptTika(script: TikaScript): void {
  const ocr = [...(script.ocr ?? [])];
  tika.respond = async (call: TikaCall): Promise<TikaReply> => {
    if (call.path === '/detect/stream') return { body: script.detected ?? 'application/octet-stream' };
    if (call.headers['x-tika-pdfocrstrategy'] === 'ocr_only') {
      const pages = (await PDFDocument.load(call.body)).getPageCount();
      return { body: hocrPagesHtml(ocr.splice(0, pages)) };
    }
    if (call.headers['content-type'] === 'application/pdf') return { body: pdfPagesHtml(script.textPages ?? []) };
    return { body: xhtml(script.office ?? '') };
  };
}

interface Uploaded {
  fileId: string;
  documentId: string;
}

/** What the upload does: the bytes under FILES_DIR, an `office` document, its file row and its version. */
async function upload(name: string, mime: string, bytes: Uint8Array | null, size?: number): Promise<Uploaded> {
  const storageKey = randomBytes(12).toString('hex');
  const file = path.join(filesDir, storageKey);
  if (bytes) await writeFile(file, bytes);
  else if (size !== undefined) {
    await writeFile(file, '');
    await truncate(file, size);
  }
  const documentId = await createDocument(database.db, { spaceId, authorId: ownerId, title: name, type: 'office', origin: 'own', status: 'private' });
  const [row] = await database.db
    .insert(files)
    .values({ storageKey, originalName: name, mime, size: size ?? bytes?.byteLength ?? 0, sha256: 'x', ownerId, documentId })
    .returning({ id: files.id });
  if (!row) throw new Error('no file row');
  await database.db.insert(documentVersions).values({ documentId, version: 1, fileId: row.id, editorId: ownerId });
  return { fileId: row.id, documentId };
}

interface Started {
  service: ExtractionService;
  synced: string[];
  jev: FakeJev;
}

const running: ExtractionService[] = [];

async function start(options: { jev?: FakeJev | null; jobTimeoutMs?: number; pdfWorker?: ConstructorParameters<typeof PdfWork>[1] } = {}): Promise<Started> {
  const synced: string[] = [];
  const jev = options.jev === undefined ? fakeJev() : options.jev;
  const service = await startExtraction({
    config: { tikaUrl: tika.url, filesDir },
    db: database.db,
    jev,
    sync: { enqueue: (ids) => synced.push(...ids) },
    tika: new TikaClient(tika.url, { retryDelaysMs: [] }),
    queue: { retryDelaysMs: [0, 0], jobTimeoutMs: options.jobTimeoutMs ?? 30_000 },
    pdfWorker: options.pdfWorker,
  });
  running.push(service);
  return { service, synced, jev: jev ?? fakeJev() };
}

async function extract(started: Started, fileId: string): Promise<ExtractionStatus> {
  await started.service.enqueueExtraction(fileId);
  await started.service.idle();
  const status = await started.service.extractionStatus(owner, fileId);
  if (!status) throw new Error('no status');
  return status;
}

async function chunksOf(documentId: string): Promise<Array<{ anchor: string; heading: string | null; text: string }>> {
  return database.db.select({ anchor: chunks.anchor, heading: chunks.heading, text: chunks.text }).from(chunks).where(eq(chunks.documentId, documentId)).orderBy(asc(chunks.position));
}

function stepStates(status: ExtractionStatus): string[] {
  return status.steps.map((s) => `${s.step}:${s.state}`);
}

beforeAll(async () => {
  database = await openPglite();
  filesDir = await mkdtemp(path.join(tmpdir(), 'kb-files-'));
  tika = await startFakeTika();
  ownerId = await createUser(database.db);
  otherId = await createUser(database.db);
  owner = { kind: 'user', userId: ownerId, isAdmin: false };
  spaceId = await createSpace(database.db, `personal-${ownerId}`, ownerId);
  const networking = await createSpace(database.db, 'networking');
  const [row] = await database.db
    .insert(collections)
    .values({ spaceId: networking, nameVi: 'Giao thức', nameEn: 'Protocols', tint: '#C4B5FD', glow: '#8B5CF6' })
    .returning({ id: collections.id });
  collectionId = row?.id ?? '';
});

beforeEach(() => {
  tika.calls.length = 0;
});

afterAll(async () => {
  for (const service of running) service.close();
  await tika?.close();
  await database?.close();
  await rm(filesDir, { recursive: true, force: true });
});

describe('PDF', () => {
  it('reads a 20-page text PDF from its text layer without sending any page to OCR', async () => {
    const pages = Array.from({ length: 20 }, (_, i) => (i % 2 === 0 ? ENGLISH_PAGE : SECOND_PAGE));
    scriptTika({ textPages: pages });
    const started = await start();
    const { fileId, documentId } = await upload('dns-notes.pdf', 'application/pdf', await makePdf(pages.map((text) => ({ text }))));

    const begun = Date.now();
    const status = await extract(started, fileId);
    // Loose bound for shared CI runners (worker start-up included); the 5 s target is measured on the server.
    expect(Date.now() - begun).toBeLessThan(15_000);

    expect(status).toMatchObject({ status: 'done', attempts: 1, error: null });
    expect(stepStates(status)).toEqual(['upload:done', 'ocr:skipped', 'structure:done', 'chunk:done', 'classify:done', 'index:done']);
    expect(status.steps[1]?.detail).toMatchObject({ pages: 20, ocrPages: [], reason: 'no-scanned-pages' });
    expect(tika.ocrCalls()).toHaveLength(0);
    const stored = await chunksOf(documentId);
    expect(stored.map((c) => c.anchor)).toEqual(Array.from({ length: 20 }, (_, i) => `trang-${i + 1}`));
    expect(stored[0]?.text).toContain('The Domain Name System translates names into addresses.');
    expect(started.synced).toEqual([documentId]);
  });

  it('OCRs a scanned PDF in Vietnamese and English through Tika and indexes what it read', async () => {
    scriptTika({ ocr: [{ text: VIETNAMESE_OCR, confidence: 88 }, { text: VIETNAMESE_OCR, confidence: 90 }] });
    const started = await start();
    const { fileId, documentId } = await upload('scan-ghi-chu-mang.pdf', 'application/pdf', await makePdf([{ image: 1 }, { image: 1 }]));

    const status = await extract(started, fileId);
    expect(status.status).toBe('done');
    expect(stepStates(status)).toEqual(['upload:done', 'ocr:done', 'structure:done', 'chunk:done', 'classify:done', 'index:done']);
    expect(status.steps[1]?.detail).toMatchObject({ pages: 2, ocrPages: [1, 2], lowQualityPages: [] });
    expect(status.steps[1]?.detail?.quality).toBeGreaterThan(0.8);
    // Both pages in one OCR request; no text-layer request (no page has one).
    expect(tika.calls).toHaveLength(1);
    expect(tika.ocrCalls()[0]?.headers['x-tika-ocrlanguage']).toBe('vie+eng');
    expect((await chunksOf(documentId)).map((c) => [c.anchor, c.text])).toEqual([
      ['trang-1', VIETNAMESE_OCR],
      ['trang-2', VIETNAMESE_OCR],
    ]);
  });

  it('sends only the scanned page of a mixed PDF to OCR and keeps the pages in order', async () => {
    scriptTika({ textPages: [ENGLISH_PAGE, '', SECOND_PAGE], ocr: [{ text: VIETNAMESE_OCR, confidence: 85 }] });
    const started = await start();
    const { fileId, documentId } = await upload('mixed.pdf', 'application/pdf', await makePdf([{ text: ENGLISH_PAGE }, { image: 1 }, { text: SECOND_PAGE }]));

    const status = await extract(started, fileId);
    expect(status.status).toBe('done');
    expect(status.steps[1]?.detail).toMatchObject({ pages: 3, ocrPages: [2] });
    const [ocrCall] = tika.ocrCalls();
    expect(ocrCall && (await PDFDocument.load(ocrCall.body)).getPageCount()).toBe(1);
    const stored = await chunksOf(documentId);
    expect(stored.map((c) => c.anchor)).toEqual(['trang-1', 'trang-2', 'trang-3']);
    expect(stored[1]?.text).toBe(VIETNAMESE_OCR);
    expect(stored[2]?.text).toContain('Kubernetes schedules containers');
  });

  it('flags a low-quality OCR page with how to fix it and leaves it out of the index, indexing the other pages', async () => {
    scriptTika({ ocr: [{ text: VIETNAMESE_OCR, confidence: 90 }, { text: GARBAGE_OCR, confidence: 31 }] });
    const jev = fakeJev((_purpose, _state, questions) =>
      Object.fromEntries(
        Object.entries(questions).map(([id, q]) => {
          if (q.type === 'score') return [id, { type: 'score', score: id === 'p2' ? 0 : 3, confidence: 1, probabilities: {} }];
          if (q.type === 'noul') return [id, { type: 'noul', noul: 0.2 }];
          return [id, { type: 'choice', choice: 'none', confidence: 1, probabilities: {} }];
        }),
      ),
    );
    const started = await start({ jev });
    const { fileId, documentId } = await upload('blurry-scan.pdf', 'application/pdf', await makePdf([{ image: 1 }, { image: 1 }]));

    const status = await extract(started, fileId);
    expect(status.status).toBe('done');
    const detail = status.steps[1]?.detail;
    expect(detail?.lowQualityPages).toEqual([{ page: 2, score: expect.any(Number), hint: 'rescan' }]);
    expect(detail?.lowQualityPages?.[0]?.score).toBeLessThan(0.55);
    expect((await chunksOf(documentId)).map((c) => c.anchor)).toEqual(['trang-1']);
    expect(jev.calls.map((c) => c.purpose)).toContain('extract-quality');
  });
});

describe('Office and Markdown', () => {
  it('reads docx, xlsx and pptx through Tika without OCR, headings and tables kept', async () => {
    scriptTika({ office: '<h1>Báo cáo lab</h1><p>Cấu hình VLAN trên switch.</p><h2>Kết quả</h2><table><tr><th>Cổng</th><th>VLAN</th></tr><tr><td>Fa0/1</td><td>10</td></tr></table>' });
    const started = await start();
    for (const [name, mime] of [
      ['bao-cao-lab.docx', DOCX],
      ['subnet-calc.xlsx', XLSX],
      ['k8s-intro.pptx', PPTX],
    ] as const) {
      tika.calls.length = 0;
      const { fileId, documentId } = await upload(name, mime, new Uint8Array([80, 75, 3, 4, 1, 2]));
      const status = await extract(started, fileId);
      expect(status.status).toBe('done');
      expect(stepStates(status)).toEqual(['upload:done', 'ocr:skipped', 'structure:done', 'chunk:done', 'classify:done', 'index:done']);
      expect(status.steps[2]?.detail).toEqual({ format: 'office' });
      expect(tika.calls.map((c) => [c.path, c.headers['content-type'], c.headers['x-tika-ocrskipocr']])).toEqual([['/tika', mime, 'true']]);
      const stored = await chunksOf(documentId);
      expect(stored.map((c) => [c.anchor, c.heading])).toEqual([
        ['bao-cao-lab', 'Báo cáo lab'],
        ['ket-qua', 'Kết quả'],
      ]);
      expect(stored[1]?.text).toContain('| Fa0/1 | 10 |');
    }
  });

  it('reads Markdown as it is, without Tika', async () => {
    const started = await start();
    const { fileId, documentId } = await upload('ghi-chu.md', 'text/markdown', new TextEncoder().encode('# Ghi chú DNS\n\nMở đầu.\n\n## Bản ghi A\n\nTrỏ tên tới địa chỉ IPv4.\n'));
    const status = await extract(started, fileId);
    expect(status.status).toBe('done');
    expect(status.steps[2]?.detail).toEqual({ format: 'markdown' });
    expect(tika.calls).toHaveLength(0);
    expect((await chunksOf(documentId)).map((c) => [c.anchor, c.text])).toEqual([
      ['ghi-chu-dns', 'Mở đầu.'],
      ['ban-ghi-a', 'Trỏ tên tới địa chỉ IPv4.'],
    ]);
  });

  it('asks Tika what a file of unknown type is, and refuses a kind it does not take', async () => {
    scriptTika({ detected: DOCX, office: '<p>Nội dung tài liệu Word.</p>' });
    const started = await start();
    const docx = await upload('unnamed', 'application/octet-stream', new Uint8Array([80, 75, 3, 4]));
    expect((await extract(started, docx.fileId)).status).toBe('done');
    expect(tika.calls.map((c) => c.path)).toEqual(['/detect/stream', '/tika']);

    scriptTika({ detected: 'application/zip' });
    const zip = await upload('archive.zip', 'application/zip', new Uint8Array([80, 75, 3, 4]));
    const refused = await extract(started, zip.fileId);
    expect(refused).toMatchObject({ status: 'failed', attempts: 1, error: { code: 'unsupported-type', hint: 'convert-format' } });
    expect(stepStates(refused)).toEqual(['upload:failed', 'ocr:pending', 'structure:pending', 'chunk:pending', 'classify:pending', 'index:pending']);
  });
});

describe('Jev classification', () => {
  it('suggests a Collection of the owner’s visible Spaces and the fitting tags, pending the owner', async () => {
    scriptTika({ office: '<p>DNS phân giải tên miền. Bộ đệm DNS giữ câu trả lời. Máy chủ DNS gốc trả lời trước. Trên Linux có dig, còn Windows có nslookup. Lệnh dig của Linux.</p>' });
    const jev = fakeJev((purpose, _state, questions) => {
      if (purpose !== 'extract-classify') return {};
      return Object.fromEntries(
        Object.entries(questions).map(([id, q]) => {
          if (q.type === 'choice') return [id, { type: 'choice', choice: 'c0', confidence: 0.9, probabilities: { c0: 0.91, none: 0.09 } }];
          return [id, { type: 'noul', noul: q.instructions.includes('"DNS"') ? 0.95 : 0.2 }];
        }),
      );
    });
    const started = await start({ jev });
    const { fileId } = await upload('dns.docx', DOCX, new Uint8Array([80, 75, 3, 4]));

    const status = await extract(started, fileId);
    expect(status.suggestions).toEqual({ status: 'pending', collection: { collectionId, spaceId: expect.any(String), probability: 0.91 }, tags: [{ tag: 'DNS', probability: 0.95 }] });
    const classifyCall = jev.calls.find((c) => c.purpose === 'extract-classify');
    expect(Object.keys(classifyCall?.questions ?? {})).toEqual(['collection', 't0', 't1']);
  });

  it('skips the step when Jev is off or fails, and indexes the file all the same', async () => {
    scriptTika({ office: '<p>Một đoạn văn.</p>' });
    const off = await start({ jev: null });
    const first = await upload('a.docx', DOCX, new Uint8Array([80, 75, 3, 4]));
    const status = await extract(off, first.fileId);
    expect(status.steps[4]).toEqual({ step: 'classify', state: 'skipped', detail: { reason: 'jev-off' } });
    expect(status.steps[5]?.state).toBe('done');

    const quiet = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const failing = await start({
      jev: fakeJev(() => {
        throw new Error('Jev down');
      }),
    });
    const second = await upload('b.docx', DOCX, new Uint8Array([80, 75, 3, 4]));
    const failed = await extract(failing, second.fileId);
    quiet.mockRestore();
    expect(failed.steps[4]).toEqual({ step: 'classify', state: 'skipped', detail: { reason: 'jev-failed' } });
    expect(failed.status).toBe('done');
  });
});

describe('the queue', () => {
  it('retries an unavailable Tika up to 3 runs, then fails with the step and a hint', async () => {
    tika.respond = () => ({ status: 503, body: '' });
    const quiet = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const started = await start();
    const { fileId, documentId } = await upload('report.docx', DOCX, new Uint8Array([80, 75, 3, 4]));
    const status = await extract(started, fileId);
    quiet.mockRestore();

    expect(status).toMatchObject({ status: 'failed', attempts: 3, maxAttempts: 3, error: { code: 'tika-unavailable', hint: 'retry-later' }, nextAttemptAt: null });
    expect(stepStates(status)).toEqual(['upload:done', 'ocr:skipped', 'structure:failed', 'chunk:pending', 'classify:pending', 'index:pending']);
    expect(tika.calls).toHaveLength(3);
    expect(await chunksOf(documentId)).toEqual([]);
  });

  it('waits between runs when a retry is due later', async () => {
    tika.respond = () => ({ status: 503, body: '' });
    const quiet = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const service = await startExtraction({
      config: { tikaUrl: tika.url, filesDir },
      db: database.db,
      jev: null,
      sync: null,
      tika: new TikaClient(tika.url, { retryDelaysMs: [] }),
      queue: { retryDelaysMs: [60_000, 60_000] },
    });
    running.push(service);
    const { fileId } = await upload('later.docx', DOCX, new Uint8Array([80, 75, 3, 4]));
    await service.enqueueExtraction(fileId);
    await service.idle();
    quiet.mockRestore();
    const status = await service.extractionStatus(owner, fileId);
    expect(status).toMatchObject({ status: 'waiting', attempts: 1, error: { code: 'tika-unavailable' } });
    expect(status?.nextAttemptAt?.getTime()).toBeGreaterThan(Date.now() + 50_000);
    service.close();
    // Not left due for the other tests' queues.
    await database.db.update(extractJobs).set({ status: 'failed' }).where(eq(extractJobs.fileId, fileId));
  });

  it('fails a run that passes its deadline, and gives up after 3', async () => {
    tika.respond = () => ({ body: xhtml('<p>late</p>'), delayMs: 400 });
    const quiet = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const started = await start({ jobTimeoutMs: 100 });
    const { fileId } = await upload('slow.docx', DOCX, new Uint8Array([80, 75, 3, 4]));
    const status = await extract(started, fileId);
    quiet.mockRestore();
    expect(status).toMatchObject({ status: 'failed', attempts: 3, error: { code: 'timeout', hint: 'retry-later' } });
    expect(status.steps[2]?.state).toBe('failed');
  });

  it('refuses a file over 25 MB at once, without reading it or calling Tika', async () => {
    const quiet = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const started = await start();
    const { fileId } = await upload('huge.pdf', 'application/pdf', null, MAX_FILE_BYTES + 1);
    const status = await extract(started, fileId);
    quiet.mockRestore();
    expect(status).toMatchObject({ status: 'failed', attempts: 1, error: { code: 'too-large', hint: 'smaller-file' } });
    expect(tika.calls).toHaveLength(0);
    expect(status.steps[0]).toEqual({ step: 'upload', state: 'failed' });
  });

  it('fails a file whose bytes are gone, asking for it again', async () => {
    const quiet = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const started = await start();
    const { fileId } = await upload('gone.md', 'text/markdown', null);
    const [row] = await database.db.select({ storageKey: files.storageKey }).from(files).where(eq(files.id, fileId));
    await rm(path.join(filesDir, row?.storageKey ?? 'x'), { force: true });
    const status = await extract(started, fileId);
    quiet.mockRestore();
    expect(status).toMatchObject({ status: 'failed', attempts: 1, error: { code: 'file-missing', hint: 'upload-again' } });
  });

  it('resumes at start the jobs a stopped server left running or queued', async () => {
    const { fileId, documentId } = await upload('resume.md', 'text/markdown', new TextEncoder().encode('Đoạn văn được tiếp tục sau khi khởi động lại.'));
    await database.db.insert(extractJobs).values({ fileId, status: 'running', steps: [], attempts: 1 });
    const started = await start();
    await started.service.idle();
    const status = await started.service.extractionStatus(owner, fileId);
    expect(status).toMatchObject({ status: 'done', attempts: 2 });
    expect(await chunksOf(documentId)).toHaveLength(1);
  });

  it('fails for good a file the server stopped on MAX_ATTEMPTS times in a row, instead of crashing forever', async () => {
    const { fileId } = await upload('crash.md', 'text/markdown', new TextEncoder().encode('Làm sập máy chủ.'));
    await queueJob(database.db, fileId, new Date());
    // Each round: the job is claimed (one attempt counted), the server dies mid-run, and starts again.
    for (let round = 1; round <= MAX_ATTEMPTS; round += 1) {
      const claimed = await claimNextJob(database.db, new Date());
      expect(claimed).toEqual({ fileId, attempts: round });
      const restart = await requeueInterrupted(database.db, new Date(), MAX_ATTEMPTS);
      expect(restart).toEqual(round < MAX_ATTEMPTS ? { requeued: 1, failed: 0 } : { requeued: 0, failed: 1 });
    }
    expect(await claimNextJob(database.db, new Date())).toBeNull();
    const [job] = await database.db.select({ status: extractJobs.status, errorCode: extractJobs.errorCode }).from(extractJobs).where(eq(extractJobs.fileId, fileId));
    expect(job).toEqual({ status: 'failed', errorCode: 'too-complex' });
  });

  it('reads PDFs in a worker thread: one that needs more memory than allowed fails as too-complex, the server unharmed', async () => {
    const pdf = await makePdf([{ text: ENGLISH_PAGE }]);
    const tiny = { limits: { maxOldGenerationSizeMb: 4, maxYoungGenerationSizeMb: 1, stackSizeMb: 1 } };
    const work = new PdfWork(new AbortController().signal, tiny);
    await expect(work.inspect(pdf)).rejects.toMatchObject({ code: 'too-complex' });
    work.close();

    const started = await start({ pdfWorker: tiny });
    const { fileId } = await upload('heavy.pdf', 'application/pdf', pdf);
    const status = await extract(started, fileId);
    // Not retried: the same file would only run out again.
    expect(status).toMatchObject({ status: 'failed', attempts: 1, error: { code: 'too-complex', hint: 'smaller-file' } });
    // The worker keeps the file's pages for every OCR batch, parsed once.
    const ok = new PdfWork(new AbortController().signal);
    const three = await makePdf([{ text: 'page one' }, { text: 'page two' }, { text: 'page three' }]);
    expect((await ok.inspect(three)).map((r) => r.page)).toEqual([1, 2, 3]);
    const first = await ok.subset(three, [3]);
    const second = await ok.subset(three, [1, 2]);
    ok.close();
    expect((await PDFDocument.load(first)).getPageCount()).toBe(1);
    expect((await PDFDocument.load(second)).getPageCount()).toBe(2);
  });

  it('does not overwrite the chunks of a document whose file was replaced since', async () => {
    const started = await start();
    const { fileId, documentId } = await upload('old.md', 'text/markdown', new TextEncoder().encode('Bản cũ.'));
    await database.db.insert(documentVersions).values({ documentId, version: 2, markdown: '# Mới', editorId: ownerId });
    const status = await extract(started, fileId);
    expect(status.steps[5]).toEqual({ step: 'index', state: 'skipped', detail: { reason: 'superseded' } });
    expect(started.synced).toEqual([]);
  });
});

describe('extractionStatus', () => {
  it('shows a file’s progress to its owner and admins only', async () => {
    const started = await start();
    const { fileId } = await upload('private.md', 'text/markdown', new TextEncoder().encode('Riêng tư.'));
    await extract(started, fileId);
    expect(await started.service.extractionStatus({ kind: 'user', userId: otherId, isAdmin: false }, fileId)).toBeNull();
    expect(await started.service.extractionStatus({ kind: 'guest' }, fileId)).toBeNull();
    expect((await started.service.extractionStatus({ kind: 'user', userId: otherId, isAdmin: true }, fileId))?.status).toBe('done');
    expect(await started.service.extractionStatus(owner, 'not-a-uuid')).toBeNull();
    await expect(started.service.enqueueExtraction('not-a-uuid')).rejects.toThrow(/not a file id/);
  });
});
