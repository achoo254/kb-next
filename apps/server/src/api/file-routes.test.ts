/**
 * Stored files over HTTP, with the real text extraction behind a fake Tika: an upload becomes a private Office
 * document whose text is indexed; the size cap stops a request as soon as it is passed (declared or streamed) and
 * leaves nothing on disk; the content must be what the name says (magic bytes, zip structure); one bad file of a batch
 * does not touch the others; only readers of the document download it (X-Accel-Redirect for nginx in production);
 * an editor save is a new version, re-extracted, unless someone saved since (409 with the server's version); C16's
 * list, retry and Jev's suggestions.
 */
import { readdir, rm, stat } from 'node:fs/promises';
import { mkdtemp } from 'node:fs/promises';
import { request } from 'node:http';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { asc, eq } from 'drizzle-orm';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { answerSuggestions, fetchEditorConfig, fetchUploads, saveFileVersion } from '../../../web/src/api/files-api';
import { makePdf } from '../../test/extract-fixtures';
import { type FakeIdp, startFakeIdp } from '../../test/fake-idp';
import { type FakeTika, startFakeTika, xhtml } from '../../test/fake-tika';
import { OLE_BYTES, docxText, makeDocx, makePptx, makeXlsx } from '../../test/office-fixtures';
import { signIn } from '../../test/sign-in';
import { type TestServer, startTestServer } from '../../test/test-server';
import { chunks, collections, documentVersions, documents, extractJobs, files } from '../db/schema';
import { seedDatabase, seedId } from '../db/seed-database';
import { type ExtractionService, MAX_FILE_BYTES, startExtraction } from '../extract';
import { MAX_PENDING_PER_ACCOUNT } from './file-routes';

const SECRET = 'test-secret-'.padEnd(40, 'x');
const DOCX = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';

let idp: FakeIdp;
let tika: FakeTika;
let server: TestServer;
let filesDir = '';
let extraction: ExtractionService | null = null;
const sessions = { owner: '', other: '', admin: '' };

/** The real queue, started once the test database exists (the app is built before it). */
const lateExtraction: ExtractionService = {
  enqueueExtraction: (id) => (extraction ? extraction.enqueueExtraction(id) : Promise.reject(new Error('extraction not started'))),
  cancelExtraction: (id) => (extraction ? extraction.cancelExtraction(id) : Promise.resolve(false)),
  extractionStatus: (viewer, id) => (extraction ? extraction.extractionStatus(viewer, id) : Promise.resolve(null)),
  idle: () => extraction?.idle() ?? Promise.resolve(),
  close: () => extraction?.close(),
};

function headers(who: keyof typeof sessions | null): Headers {
  const h = new Headers({ origin: server.origin });
  if (who) h.set('cookie', sessions[who]);
  return h;
}

function form(name: string, bytes: Uint8Array): FormData {
  const body = new FormData();
  body.append('file', new Blob([Buffer.from(bytes)]), name);
  return body;
}

async function upload(who: keyof typeof sessions | null, name: string, bytes: Uint8Array, query = ''): Promise<Response> {
  return fetch(`${server.origin}/api/files${query}`, { method: 'POST', headers: headers(who), body: form(name, bytes) });
}

interface UploadedBody {
  file: { id: string; documentId: string; name: string; kind: string; size: number; version: number; queued: boolean };
}

async function uploaded(name: string, bytes: Uint8Array, query = ''): Promise<UploadedBody['file']> {
  const res = await upload('owner', name, bytes, query);
  expect(res.status).toBe(201);
  return ((await res.json()) as UploadedBody).file;
}

async function save(who: keyof typeof sessions, baseFileId: string, name: string, bytes: Uint8Array): Promise<Response> {
  return fetch(`${server.origin}/api/files/${baseFileId}`, { method: 'PUT', headers: headers(who), body: form(name, bytes) });
}

async function errorOf(res: Response): Promise<string> {
  return ((await res.json()) as { error: string }).error;
}

async function storedKeys(): Promise<string[]> {
  return (await readdir(filesDir)).sort();
}

async function chunkTexts(documentId: string): Promise<string[]> {
  const rows = await server.database.db.select({ text: chunks.text }).from(chunks).where(eq(chunks.documentId, documentId)).orderBy(asc(chunks.position));
  return rows.map((r) => r.text);
}

/**
 * Sends a multipart upload of `total` bytes in 1 MB pieces without announcing its length (chunked), as a client
 * that lies or does not know; resolves with the answer's status and how much was sent before it came.
 */
function streamUpload(total: number): Promise<{ status: number | null; sent: number }> {
  const boundary = 'kbtestboundary';
  const url = new URL(`${server.origin}/api/files`);
  return new Promise((resolve) => {
    let sent = 0;
    let status: number | null = null;
    const req = request(
      { hostname: url.hostname, port: url.port, path: url.pathname, method: 'POST', headers: { origin: server.origin, cookie: sessions.owner, 'content-type': `multipart/form-data; boundary=${boundary}` } },
      (res) => {
        status = res.statusCode ?? null;
        res.resume();
        res.on('end', () => resolve({ status, sent }));
      },
    );
    req.on('error', () => resolve({ status, sent }));
    req.write(`--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="huge.pdf"\r\nContent-Type: application/pdf\r\n\r\n%PDF-1.7\n`);
    const piece = Buffer.alloc(1024 * 1024, 0x20);
    const pump = (): void => {
      while (sent < total && status === null) {
        sent += piece.length;
        if (!req.write(piece)) {
          req.once('drain', pump);
          return;
        }
      }
      if (status === null && !req.destroyed) req.end(`\r\n--${boundary}--\r\n`);
    };
    pump();
  });
}

beforeAll(async () => {
  idp = await startFakeIdp({ clientId: 'kb-web', clientSecret: SECRET, sub: 'owner-sub', profile: { name: 'Chủ' } });
  tika = await startFakeTika();
  // Tika "reads" a docx by its <w:t> runs, as the real one returns its paragraphs.
  tika.respond = (call) => ({ body: xhtml(docxText(call.body).map((t) => `<p>${t}</p>`).join('')) });
  filesDir = await mkdtemp(path.join(tmpdir(), 'kb-files-'));
  server = await startTestServer({ AUTH_ISSUER: idp.issuer, AUTH_CLIENT_SECRET: SECRET, ADMIN_SUBS: 'admin-sub', FILES_DIR: filesDir, TIKA_URL: tika.url }, { uploadLimitPerMinute: 1000, retryLimitPerMinute: 1000 }, undefined, null, () => ({ extraction: lateExtraction }));
  await seedDatabase(server.database.db, 'owner-sub');
  extraction = await startExtraction({ config: { tikaUrl: tika.url, filesDir }, db: server.database.db, jev: null, sync: null });
  sessions.owner = await signIn(server);
  idp.setSub('other-sub');
  sessions.other = await signIn(server);
  idp.setSub('admin-sub');
  sessions.admin = await signIn(server);
});

afterAll(async () => {
  extraction?.close();
  await server?.close();
  await tika?.close();
  await idp?.close();
  if (filesDir) await rm(filesDir, { recursive: true, force: true });
});

beforeEach(async () => {
  await extraction?.idle();
});

describe('POST /api/files', () => {
  it('stores a docx as a private Office document of its uploader, version 1 pointing at it, and indexes its text', async () => {
    const bytes = makeDocx('Máy mới xin IP bằng DHCP.\n\nLease mặc định 24 giờ.');
    const file = await uploaded('lab-notes.docx', bytes);
    expect(file).toMatchObject({ name: 'lab-notes.docx', kind: 'docx', size: bytes.length, version: 1, queued: true });

    const db = server.database.db;
    const [doc] = await db.select().from(documents).where(eq(documents.id, file.documentId));
    expect(doc).toMatchObject({ title: 'lab-notes.docx', type: 'office', origin: 'own', status: 'private' });
    const [row] = await db.select().from(files).where(eq(files.id, file.id));
    expect(row).toMatchObject({ originalName: 'lab-notes.docx', mime: DOCX, size: bytes.length, documentId: file.documentId });
    expect(row?.storageKey).toMatch(/^[A-Za-z0-9_-]{32}$/);
    expect(row?.sha256).toMatch(/^[0-9a-f]{64}$/);
    const versions = await db.select().from(documentVersions).where(eq(documentVersions.documentId, file.documentId));
    expect(versions).toMatchObject([{ version: 1, fileId: file.id, via: 'import' }]);

    // On disk under its random key only, readable by the owner and its group (nginx), nobody else.
    const onDisk = await stat(path.join(filesDir, row?.storageKey ?? ''));
    expect(onDisk.size).toBe(bytes.length);
    expect(onDisk.mode & 0o777).toBe(0o640);

    await extraction?.idle();
    expect((await chunkTexts(file.documentId)).join('\n')).toContain('Lease mặc định 24 giờ.');
  });

  it('takes xlsx, pptx, pdf and md, each checked by its content', async () => {
    for (const [name, bytes] of [
      ['subnet.xlsx', makeXlsx('Subnet mask')],
      ['k8s-intro.pptx', makePptx('Kubernetes')],
      ['dns.pdf', await makePdf([{ text: 'The Domain Name System' }])],
      ['ghi-chu.md', Buffer.from('# DNS\n\nPhân giải tên miền.\n')],
    ] as const) {
      const res = await upload('owner', name, bytes);
      expect(res.status, name).toBe(201);
    }
  });

  it('puts the document in the Space and Collection asked for, and refuses one that is not there', async () => {
    const collectionId = seedId('collection:net:0');
    const file = await uploaded('subnet-calc.xlsx', makeXlsx('255.255.255.0'), `?space=networking&collection=${collectionId}`);
    const [doc] = await server.database.db.select({ collectionId: documents.collectionId }).from(documents).where(eq(documents.id, file.documentId));
    expect(doc?.collectionId).toBe(collectionId);
    expect(await errorOf(await upload('owner', 'x.xlsx', makeXlsx('x'), `?space=networking&collection=${seedId('collection:k8s:0')}`))).toBe('unknown-collection');
  });

  it('refuses a file whose content is not what its name says, a locked Office file and other kinds, leaving nothing behind', async () => {
    const before = await storedKeys();
    const pdf = await makePdf([{ text: 'not a word file' }]);
    const cases: Array<[string, Uint8Array, number, string]> = [
      ['notes.docx', pdf, 415, 'wrong-content'],
      ['scan.pdf', makeDocx('a zip, not a PDF'), 415, 'wrong-content'],
      ['sheet.xlsx', makeDocx('a docx renamed'), 415, 'wrong-content'],
      ['readme.md', Buffer.from([0x00, 0x01, 0x02, 0xff, 0xfe]), 415, 'wrong-content'],
      ['locked.docx', OLE_BYTES, 415, 'encrypted'],
      ['setup.exe', Buffer.from('MZ'), 415, 'unsupported-type'],
      ['so-do.vsdx', makeDocx('visio'), 415, 'unsupported-type'],
    ];
    for (const [name, bytes, status, code] of cases) {
      const res = await upload('owner', name, bytes);
      expect([name, res.status, await errorOf(res)]).toEqual([name, status, code]);
    }
    expect(await storedKeys()).toEqual(before);
  });

  it('refuses a file over 25 MB from its declared size, before reading it', async () => {
    const before = await storedKeys();
    const res = await upload('owner', 'big.pdf', Buffer.concat([Buffer.from('%PDF-1.7\n'), Buffer.alloc(MAX_FILE_BYTES + 128 * 1024)]));
    expect(res.status).toBe(413);
    expect(await errorOf(res)).toBe('too-large');
    expect(await storedKeys()).toEqual(before);
  });

  it('stops a streamed upload as soon as it passes 25 MB, and removes what it had written', async () => {
    const before = await storedKeys();
    const total = 40 * 1024 * 1024;
    const { status, sent } = await streamUpload(total);
    // Answered at 25 MB, the rest read and dropped up to a cap, then cut: never the 40 MB; nothing is kept.
    expect(status).toBe(413);
    expect(sent).toBeLessThan(total);
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(await storedKeys()).toEqual(before);
    const rows = await server.database.db.select({ name: files.originalName }).from(files).where(eq(files.originalName, 'huge.pdf'));
    expect(rows).toEqual([]);
  });

  it('keeps the good files of a batch when one of them is bad', async () => {
    const results = await Promise.all([
      upload('owner', 'batch-1.docx', makeDocx('Tệp thứ nhất')),
      upload('owner', 'batch-2.docx', Buffer.from('this is plain text, not a docx')),
      upload('owner', 'batch-3.pdf', await makePdf([{ text: 'Third file' }])),
    ]);
    expect(results.map((r) => r.status)).toEqual([201, 415, 201]);
    const names = (await server.database.db.select({ title: documents.title }).from(documents)).map((d) => d.title);
    expect(names).toEqual(expect.arrayContaining(['batch-1.docx', 'batch-3.pdf']));
    expect(names).not.toContain('batch-2.docx');
  });

  it('needs a session, and refuses a form without a file', async () => {
    expect((await upload(null, 'x.docx', makeDocx('x'))).status).toBe(401);
    const empty = await fetch(`${server.origin}/api/files`, { method: 'POST', headers: headers('owner'), body: new FormData() });
    expect(empty.status).toBe(400);
    const json = await fetch(`${server.origin}/api/files`, { method: 'POST', headers: (() => { const h = headers('owner'); h.set('content-type', 'application/json'); return h; })(), body: '{}' });
    expect(await errorOf(json)).toBe('invalid-body');
  });
});

describe('GET /api/files/:id', () => {
  it('sends the file to its readers only', async () => {
    const bytes = makeDocx('Chỉ chủ tệp đọc được.');
    const file = await uploaded('private.docx', bytes);
    const owner = await fetch(`${server.origin}/api/files/${file.id}`, { headers: headers('owner') });
    expect(owner.status).toBe(200);
    expect(Buffer.from(await owner.arrayBuffer()).equals(bytes)).toBe(true);
    expect(owner.headers.get('content-disposition')).toBe(`attachment; filename="private.docx"; filename*=UTF-8''private.docx`);
    expect(owner.headers.get('x-content-type-options')).toBe('nosniff');
    expect((await fetch(`${server.origin}/api/files/${file.id}`, { headers: headers('admin') })).status).toBe(200);

    const other = await fetch(`${server.origin}/api/files/${file.id}`, { headers: headers('other') });
    expect([other.status, await errorOf(other)]).toEqual([403, 'no-access']);
    // A guest reads by the same rule as the reading API: not this private file.
    expect((await fetch(`${server.origin}/api/files/${file.id}`, { headers: headers(null) })).status).toBe(403);
    expect((await fetch(`${server.origin}/api/files/00000000-0000-4000-8000-000000000000`, { headers: headers('owner') })).status).toBe(404);
    expect((await fetch(`${server.origin}/api/files/not-a-uuid`, { headers: headers('owner') })).status).toBe(404);
  });

  it('hands the file to nginx by X-Accel-Redirect when nginx serves files, without sending a byte itself', async () => {
    const file = await uploaded('accel.docx', makeDocx('nginx gửi tệp này'));
    const [row] = await server.database.db.select({ storageKey: files.storageKey }).from(files).where(eq(files.id, file.id));
    server.config.fileDelivery = 'x-accel';
    try {
      const res = await fetch(`${server.origin}/api/files/${file.id}`, { headers: headers('owner') });
      expect(res.status).toBe(200);
      expect(res.headers.get('x-accel-redirect')).toBe(`/_kb_files/${row?.storageKey ?? ''}`);
      expect(res.headers.get('content-disposition')).toContain('accel.docx');
      expect((await res.arrayBuffer()).byteLength).toBe(0);
      // Refused before any redirect: nginx never sees the key.
      const other = await fetch(`${server.origin}/api/files/${file.id}`, { headers: headers('other') });
      expect(other.status).toBe(403);
      expect(other.headers.get('x-accel-redirect')).toBeNull();
    } finally {
      server.config.fileDelivery = 'node';
    }
  });

  it('gives other readers (guests too) of a published document its current file only, never an earlier version', async () => {
    const first = await uploaded('published.docx', makeDocx('Bản một'));
    const saved = await save('owner', first.id, 'published.docx', makeDocx('Bản hai'));
    expect(saved.status).toBe(200);
    const second = ((await saved.json()) as UploadedBody).file;
    await server.database.db.update(documents).set({ status: 'approved' }).where(eq(documents.id, first.documentId));
    expect((await fetch(`${server.origin}/api/files/${second.id}`, { headers: headers('other') })).status).toBe(200);
    expect((await fetch(`${server.origin}/api/files/${first.id}`, { headers: headers('other') })).status).toBe(403);
    expect((await fetch(`${server.origin}/api/files/${first.id}`, { headers: headers('owner') })).status).toBe(200);
    // Signed out, as the reading API: the published current file, never an earlier one.
    expect((await fetch(`${server.origin}/api/files/${second.id}`, { headers: headers(null) })).status).toBe(200);
    expect((await fetch(`${server.origin}/api/files/${first.id}`, { headers: headers(null) })).status).toBe(403);
  });
});

describe('the reader of an Office document', () => {
  it('names its current file, editable for its author and read-only for a PDF', async () => {
    const docx = await uploaded('reader.docx', makeDocx('Đọc trong C11'));
    const view = (await (await fetch(`${server.origin}/api/documents/${docx.documentId}`, { headers: headers('owner') })).json()) as { file: unknown };
    expect(view.file).toMatchObject({ id: docx.id, name: 'reader.docx', kind: 'docx', version: 1, editable: true });
    const pdf = await uploaded('reader.pdf', await makePdf([{ text: 'read only' }]));
    const pdfView = (await (await fetch(`${server.origin}/api/documents/${pdf.documentId}`, { headers: headers('owner') })).json()) as { file: unknown };
    expect(pdfView.file).toMatchObject({ kind: 'pdf', editable: false });
  });
});

describe('PUT /api/files/:id', () => {
  it('saves the editor’s file as the next version and re-indexes its text', async () => {
    const first = await uploaded('dhcp.docx', makeDocx('DORA = Discover, Offer, Request, Acknowledge.'));
    await extraction?.idle();
    const res = await save('owner', first.id, 'dhcp.docx', makeDocx('DORA = Discover, Offer, Request, Acknowledge.\n\nServer cấp IP qua cổng 67.'));
    expect(res.status).toBe(200);
    const second = ((await res.json()) as UploadedBody).file;
    expect(second).toMatchObject({ documentId: first.documentId, version: 2, kind: 'docx', name: 'dhcp.docx' });
    expect(second.id).not.toBe(first.id);
    const versions = await server.database.db.select({ version: documentVersions.version, via: documentVersions.via, fileId: documentVersions.fileId }).from(documentVersions).where(eq(documentVersions.documentId, first.documentId)).orderBy(asc(documentVersions.version));
    expect(versions).toEqual([
      { version: 1, via: 'import', fileId: first.id },
      { version: 2, via: 'editor', fileId: second.id },
    ]);
    await extraction?.idle();
    expect((await chunkTexts(first.documentId)).join('\n')).toContain('Server cấp IP qua cổng 67.');
  });

  it('answers 409 with the server’s version when someone saved since the copy was opened, keeping nothing of the refused save', async () => {
    const first = await uploaded('conflict.docx', makeDocx('Bản gốc'));
    const elsewhere = ((await (await save('owner', first.id, 'conflict.docx', makeDocx('Sửa ở máy khác'))).json()) as UploadedBody).file;
    const before = await storedKeys();
    const stale = await save('owner', first.id, 'conflict.docx', makeDocx('Sửa offline trên máy này'));
    expect(stale.status).toBe(409);
    const body = (await stale.json()) as { error: string; current: { fileId: string; version: number; savedAt: string } };
    expect(body).toMatchObject({ error: 'conflict', current: { fileId: elsewhere.id, version: 2 } });
    expect(Number.isNaN(Date.parse(body.current.savedAt))).toBe(false);
    expect(await storedKeys()).toEqual(before);
    // "Giữ bản của tôi": the same bytes saved on top of the server's version.
    const mine = await save('owner', elsewhere.id, 'conflict.docx', makeDocx('Sửa offline trên máy này'));
    expect(mine.status).toBe(200);
    expect(((await mine.json()) as UploadedBody).file.version).toBe(3);
  });

  it('lets only someone who may edit the document save, and only the same kind of file', async () => {
    const file = await uploaded('rights.docx', makeDocx('Quyền sửa'));
    expect(await errorOf(await save('other', file.id, 'rights.docx', makeDocx('x')))).toBe('no-access');
    expect(await errorOf(await save('owner', file.id, 'rights.xlsx', makeXlsx('x')))).toBe('wrong-kind');
    expect(await errorOf(await save('owner', file.id, 'rights.docx', await makePdf([{ text: 'x' }])))).toBe('wrong-content');
    await server.database.db.update(documents).set({ status: 'pending' }).where(eq(documents.id, file.documentId));
    expect(await errorOf(await save('owner', file.id, 'rights.docx', makeDocx('x')))).toBe('locked');
    const pdf = await uploaded('view-only.pdf', await makePdf([{ text: 'x' }]));
    expect(await errorOf(await save('owner', pdf.id, 'view-only.pdf', await makePdf([{ text: 'y' }])))).toBe('not-editable');
  });
});

describe('C16: uploads, retry and suggestions', () => {
  const post = (who: keyof typeof sessions, url: string, body?: unknown): Promise<Response> => {
    const h = headers(who);
    if (body !== undefined) h.set('content-type', 'application/json');
    return fetch(`${server.origin}${url}`, { method: 'POST', headers: h, body: body === undefined ? undefined : JSON.stringify(body) });
  };

  it('keeps a document with its author after an admin saves it: listed, retried and answered by the author', async () => {
    const file = await uploaded('kept-by-author.docx', makeDocx('Bản của tác giả'));
    await extraction?.idle();
    const saved = ((await (await save('admin', file.id, 'kept-by-author.docx', makeDocx('Quản trị sửa'))).json()) as UploadedBody).file;
    await extraction?.idle();
    const listed = (await (await fetch(`${server.origin}/api/files`, { headers: headers('owner') })).json()) as { files: Array<{ fileId: string }> };
    expect(listed.files.map((f) => f.fileId)).toContain(saved.id);
    expect((await post('owner', `/api/files/${saved.id}/retry`)).status).toBe(202);
    await extraction?.idle();
    await server.database.db.update(extractJobs).set({ suggestions: { status: 'pending', collection: null, tags: [{ tag: 'DHCP', probability: 0.9 }] } }).where(eq(extractJobs.fileId, saved.id));
    expect((await post('owner', `/api/files/${saved.id}/suggestions`, { action: 'dismiss' })).status).toBe(200);
    // Suggestions read from an earlier version no longer apply.
    await server.database.db.update(extractJobs).set({ suggestions: { status: 'pending', collection: null, tags: [] } }).where(eq(extractJobs.fileId, file.id));
    expect(await errorOf(await post('owner', `/api/files/${file.id}/suggestions`, { action: 'dismiss' }))).toBe('answered');
  });

  it('does not let a retry reset a job that waits, nor the owner rerun a file too heavy to read (an admin may)', async () => {
    const file = await uploaded('heavy-retry.docx', makeDocx('Nặng'));
    await extraction?.idle();
    await server.database.db.update(extractJobs).set({ status: 'waiting', nextAttemptAt: new Date(Date.now() + 3_600_000) }).where(eq(extractJobs.fileId, file.id));
    expect(await errorOf(await post('owner', `/api/files/${file.id}/retry`))).toBe('busy');
    await server.database.db.update(extractJobs).set({ status: 'failed', errorCode: 'too-complex', errorHint: 'smaller-file', nextAttemptAt: null }).where(eq(extractJobs.fileId, file.id));
    expect(await errorOf(await post('owner', `/api/files/${file.id}/retry`))).toBe('not-retryable');
    expect((await post('admin', `/api/files/${file.id}/retry`)).status).toBe(202);
    await extraction?.idle();
  });

  it('refuses more uploads while the account already has a full backlog waiting to be read', async () => {
    // Every job so far (the owner's uploads above, more than the cap) made to wait in the queue.
    const before = await server.database.db.select({ fileId: extractJobs.fileId, status: extractJobs.status }).from(extractJobs);
    expect(before.length).toBeGreaterThanOrEqual(MAX_PENDING_PER_ACCOUNT);
    await server.database.db.update(extractJobs).set({ status: 'queued' });
    try {
      expect(await errorOf(await upload('owner', 'one-more.docx', makeDocx('Thêm')))).toBe('too-many-pending');
    } finally {
      for (const job of before) await server.database.db.update(extractJobs).set({ status: job.status }).where(eq(extractJobs.fileId, job.fileId));
    }
  });

  it('lists the account’s uploads with their steps, newest first, and nobody else’s', async () => {
    const file = await uploaded('listed.docx', makeDocx('Danh sách'));
    await extraction?.idle();
    const res = await fetch(`${server.origin}/api/files`, { headers: headers('owner') });
    const body = (await res.json()) as { files: Array<{ fileId: string; name: string; kind: string; processing: { status: string; steps: Array<{ step: string; state: string }> } | null; space: { kind: string } }> };
    expect(body.files[0]).toMatchObject({ fileId: file.id, name: 'listed.docx', kind: 'docx', space: { kind: 'personal' }, processing: { status: 'done' } });
    expect(body.files[0]?.processing?.steps.map((s) => s.step)).toEqual(['upload', 'ocr', 'structure', 'chunk', 'classify', 'index']);
    const other = (await (await fetch(`${server.origin}/api/files`, { headers: headers('other') })).json()) as { files: unknown[] };
    expect(other.files).toEqual([]);
  });

  it('runs a file again on "Thử lại", for its owner only', async () => {
    tika.respond = () => ({ status: 422, body: 'unreadable' });
    const file = await uploaded('broken.docx', makeDocx('Tika không đọc được'));
    await extraction?.idle();
    const [failed] = await server.database.db.select({ status: extractJobs.status }).from(extractJobs).where(eq(extractJobs.fileId, file.id));
    expect(failed?.status).toBe('failed');
    tika.respond = (call) => ({ body: xhtml(docxText(call.body).map((t) => `<p>${t}</p>`).join('')) });
    expect((await fetch(`${server.origin}/api/files/${file.id}/retry`, { method: 'POST', headers: headers('other') })).status).toBe(404);
    expect((await fetch(`${server.origin}/api/files/${file.id}/retry`, { method: 'POST', headers: headers('owner') })).status).toBe(202);
    await extraction?.idle();
    const [done] = await server.database.db.select({ status: extractJobs.status }).from(extractJobs).where(eq(extractJobs.fileId, file.id));
    expect(done?.status).toBe('done');
  });

  it('stops a file being read on "Huỷ" (its owner only), and "Thử lại" runs it again', async () => {
    tika.respond = (call) => ({ delayMs: 400, body: xhtml(docxText(call.body).map((t) => `<p>${t}</p>`).join('')) });
    const file = await uploaded('slow.docx', makeDocx('Đọc chậm'));
    await new Promise((resolve) => setTimeout(resolve, 100));
    expect((await fetch(`${server.origin}/api/files/${file.id}/cancel`, { method: 'POST', headers: headers('other') })).status).toBe(404);
    const res = await fetch(`${server.origin}/api/files/${file.id}/cancel`, { method: 'POST', headers: headers('owner') });
    expect(await res.json()).toEqual({ cancelled: true });
    await extraction?.idle();
    const [stopped] = await server.database.db.select({ status: extractJobs.status, errorCode: extractJobs.errorCode }).from(extractJobs).where(eq(extractJobs.fileId, file.id));
    expect(stopped).toEqual({ status: 'failed', errorCode: 'cancelled' });
    expect(await chunkTexts(file.documentId)).toEqual([]);
    tika.respond = (call) => ({ body: xhtml(docxText(call.body).map((t) => `<p>${t}</p>`).join('')) });
    expect((await fetch(`${server.origin}/api/files/${file.id}/retry`, { method: 'POST', headers: headers('owner') })).status).toBe(202);
    await extraction?.idle();
    expect((await chunkTexts(file.documentId)).join('\n')).toContain('Đọc chậm');
    // Nothing waits any more: a second "Huỷ" stops nothing.
    expect(await (await fetch(`${server.origin}/api/files/${file.id}/cancel`, { method: 'POST', headers: headers('owner') })).json()).toEqual({ cancelled: false });
  });

  it('applies the suggested Collection and the chosen suggested tags on "Dùng", once', async () => {
    const file = await uploaded('subnet-notes.docx', makeDocx('Chia subnet'));
    await extraction?.idle();
    const collectionId = seedId('collection:net:0');
    const [target] = await server.database.db.select({ spaceId: collections.spaceId }).from(collections).where(eq(collections.id, collectionId));
    await server.database.db
      .update(extractJobs)
      .set({ suggestions: { status: 'pending', collection: { collectionId, spaceId: target?.spaceId ?? '', probability: 0.91 }, tags: [{ tag: 'Subnet', probability: 0.9 }, { tag: 'CIDR', probability: 0.7 }] } })
      .where(eq(extractJobs.fileId, file.id));

    const listed = (await (await fetch(`${server.origin}/api/files`, { headers: headers('owner') })).json()) as { files: Array<{ fileId: string; suggestions: unknown }> };
    expect(listed.files.find((f) => f.fileId === file.id)?.suggestions).toMatchObject({ status: 'pending', collection: { collectionId, probability: 0.91, space: { slug: 'networking' }, nameVi: 'Giao thức nền tảng' } });

    const answer = (who: keyof typeof sessions, body: unknown): Promise<Response> => {
      const h = headers(who);
      h.set('content-type', 'application/json');
      return fetch(`${server.origin}/api/files/${file.id}/suggestions`, { method: 'POST', headers: h, body: JSON.stringify(body) });
    };
    expect((await answer('other', { action: 'dismiss' })).status).toBe(404);
    const accepted = await answer('owner', { action: 'accept', collection: true, tags: ['Subnet', 'Not suggested'] });
    expect(accepted.status).toBe(200);
    const [doc] = await server.database.db.select({ spaceId: documents.spaceId, collectionId: documents.collectionId, tags: documents.tags }).from(documents).where(eq(documents.id, file.documentId));
    expect(doc).toEqual({ spaceId: target?.spaceId, collectionId, tags: ['Subnet'] });
    expect(await errorOf(await answer('owner', { action: 'dismiss' }))).toBe('answered');
    expect(await errorOf(await answer('owner', { action: 'accept', collection: 'yes' }))).toBe('invalid-body');
  });

  it('tells the web app where the Office editor lives (none here) and the size cap', async () => {
    const res = await fetch(`${server.origin}/api/office-editor`, { headers: headers('owner') });
    expect(await res.json()).toEqual({ origin: null, maxBytes: MAX_FILE_BYTES });
  });
});

describe('the web app’s client', () => {
  it('reads the uploads and saves a version (and its conflict) through apps/web/src/api/files-api.ts', async () => {
    const first = await uploaded('client.docx', makeDocx('Qua client web'));
    await extraction?.idle();
    const realFetch = globalThis.fetch;
    vi.stubGlobal('fetch', (input: string, init: RequestInit = {}) => {
      const h = new Headers(init.headers);
      h.set('origin', server.origin);
      h.set('cookie', sessions.owner);
      return realFetch(`${server.origin}${input}`, { ...init, headers: h });
    });
    try {
      const listed = await fetchUploads();
      expect(listed.find((u) => u.fileId === first.id)).toMatchObject({ name: 'client.docx', kind: 'docx', processing: { status: 'done' } });
      expect(await fetchEditorConfig()).toEqual({ origin: null, maxBytes: MAX_FILE_BYTES });
      const saved = await saveFileVersion(first.id, new Blob([new Uint8Array(makeDocx('Bản hai'))]), 'client.docx');
      expect(saved).toMatchObject({ kind: 'saved', file: { version: 2, documentId: first.documentId } });
      const stale = await saveFileVersion(first.id, new Blob([new Uint8Array(makeDocx('Bản cũ'))]), 'client.docx');
      expect(stale).toMatchObject({ kind: 'conflict', current: { version: 2, fileId: saved.kind === 'saved' ? saved.file.id : '' } });
      await expect(answerSuggestions(first.id, { action: 'dismiss' })).rejects.toMatchObject({ code: 'answered' });
    } finally {
      vi.unstubAllGlobals();
    }
  });
});
