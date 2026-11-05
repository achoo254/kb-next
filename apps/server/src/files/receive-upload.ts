/**
 * One file from a `multipart/form-data` request (field `file`), streamed straight to the files directory: the
 * bytes pass through a sha256 and a counter on their way to disk, never held whole in memory. Refused, and nothing
 * left on disk, when:
 *
 * - the request says it is larger than a file may be (413 `too-large`, before reading any of it), or the file
 *   passes MAX_FILE_BYTES while it streams (413 `too-large`, at that moment);
 * - the name is not .docx, .xlsx, .pptx, .pdf or .md (415 `unsupported-type`);
 * - the content is not what the name says (415 `wrong-content`), or is a password-protected (or pre-2007) Office
 *   file (415 `encrypted`);
 * - there is no file, more than one part, or the form is broken (400 `no-file` / `invalid-body`).
 */
import { createHash } from 'node:crypto';
import { createWriteStream } from 'node:fs';
import { unlink } from 'node:fs/promises';
import { Transform, type Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import busboy from 'busboy';
import type { Request } from 'express';
import { MAX_FILE_BYTES } from '../extract';
import { HttpError } from '../http-error';
import { EDITABLE_KINDS, type FileKind, MIME_OF, cleanFileName, kindOfName } from './file-kinds';
import { STORED_FILE_MODE, newStorageKey, storedPath } from './file-store';
import { sniffFile } from './sniff';

/** Room for the multipart boundaries and part headers around the file. */
const MULTIPART_SLACK = 64 * 1024;

export interface ReceivedFile {
  storageKey: string;
  /** The name as sent, cleaned (cleanFileName): the document's title. */
  originalName: string;
  kind: FileKind;
  mime: string;
  size: number;
  sha256: string;
}

/** Reads a part that is not kept to its end (its error, when the form is cut short, is expected). */
function ignore(stream: Readable): void {
  stream.on('error', () => undefined);
  stream.resume();
}

async function discard(filePath: string): Promise<void> {
  await unlink(filePath).catch(() => undefined);
}

/** Writes `stream` under a new key; resolves with its size and hash, or rejects (the partial file removed). */
async function store(stream: Readable & { truncated?: boolean }, filesDir: string, onTooLarge: () => void): Promise<{ storageKey: string; size: number; sha256: string }> {
  const storageKey = newStorageKey();
  const target = storedPath(filesDir, storageKey);
  const hash = createHash('sha256');
  let size = 0;
  let tooLarge = false;
  stream.once('limit', () => {
    tooLarge = true;
    onTooLarge();
  });
  const measure = new Transform({
    transform(chunk: Buffer, _encoding, done) {
      size += chunk.length;
      hash.update(chunk);
      done(null, chunk);
    },
  });
  try {
    await pipeline(stream, measure, createWriteStream(target, { flags: 'wx', mode: STORED_FILE_MODE }));
  } catch (error) {
    await discard(target);
    throw error;
  }
  if (tooLarge || stream.truncated) {
    await discard(target);
    throw new HttpError(413, 'too-large');
  }
  return { storageKey, size, sha256: hash.digest('hex') };
}

/** Checks the stored bytes against the kind the name claims; removes the file when they disagree. */
async function checkContent(filesDir: string, storageKey: string, size: number, kind: FileKind): Promise<void> {
  const target = storedPath(filesDir, storageKey);
  let sniffed: Awaited<ReturnType<typeof sniffFile>>;
  try {
    sniffed = await sniffFile(target, size);
  } catch (error) {
    await discard(target);
    throw error;
  }
  if (sniffed === kind) return;
  await discard(target);
  if (sniffed === 'ole' && EDITABLE_KINDS.has(kind)) throw new HttpError(415, 'encrypted');
  throw new HttpError(415, 'wrong-content');
}

/**
 * Receives the one file of `req` into `filesDir`. `expected`: the kind the file must be (a new version of a stored
 * file keeps its kind), 415 `wrong-kind` otherwise.
 */
export function receiveUpload(req: Request, filesDir: string, expected: FileKind | null = null): Promise<ReceivedFile> {
  const declared = Number(req.headers['content-length']);
  if (Number.isFinite(declared) && declared > MAX_FILE_BYTES + MULTIPART_SLACK) return Promise.reject(new HttpError(413, 'too-large'));
  if (!req.headers['content-type']?.toLowerCase().startsWith('multipart/form-data')) return Promise.reject(new HttpError(400, 'invalid-body'));
  let form: busboy.Busboy;
  try {
    form = busboy({ headers: req.headers, limits: { files: 1, fields: 0, parts: 2, fileSize: MAX_FILE_BYTES } });
  } catch {
    return Promise.reject(new HttpError(400, 'invalid-body'));
  }

  return new Promise<ReceivedFile>((resolve, reject) => {
    let settled = false;
    let stored: Promise<ReceivedFile> | null = null;
    const fail = (error: unknown): void => {
      if (settled) return;
      settled = true;
      req.unpipe(form);
      // Ends a file part still streaming: its partial file is removed (store) and nothing more is read. Deferred:
      // `fail` can run inside busboy's own callbacks (the file's 'limit' event), and destroying the form there
      // leaves busboy finishing the current chunk on a torn-down part, an uncaught TypeError that kills the process.
      setImmediate(() => form.destroy());
      reject(error);
    };

    form.on('file', (field, stream, info) => {
      if (field !== 'file' || stored) {
        ignore(stream);
        return;
      }
      const originalName = cleanFileName(info.filename ?? '');
      const kind = kindOfName(originalName);
      if (!kind) {
        ignore(stream);
        fail(new HttpError(415, 'unsupported-type'));
        return;
      }
      if (expected && kind !== expected) {
        ignore(stream);
        fail(new HttpError(415, 'wrong-kind'));
        return;
      }
      stored = store(stream, filesDir, () => fail(new HttpError(413, 'too-large'))).then(async ({ storageKey, size, sha256 }) => {
        // The request already failed (a broken form): the file has no owner.
        if (settled) {
          await discard(storedPath(filesDir, storageKey));
          throw new HttpError(400, 'invalid-body');
        }
        await checkContent(filesDir, storageKey, size, kind);
        return { storageKey, originalName, kind, mime: MIME_OF[kind], size, sha256 };
      });
      // Observed here so a failure never goes unhandled; the outcome is read once the form closes.
      stored.catch(fail);
    });
    form.on('partsLimit', () => fail(new HttpError(400, 'invalid-body')));
    form.on('filesLimit', () => fail(new HttpError(400, 'invalid-body')));
    form.on('fieldsLimit', () => fail(new HttpError(400, 'invalid-body')));
    form.on('error', () => fail(new HttpError(400, 'invalid-body')));
    form.on('close', () => {
      if (settled) return;
      if (!stored) {
        fail(new HttpError(400, 'no-file'));
        return;
      }
      stored.then((file) => {
        if (settled) return;
        settled = true;
        resolve(file);
      }, fail);
    });
    req.on('close', () => {
      if (!req.complete) fail(new HttpError(400, 'invalid-body'));
    });
    req.pipe(form);
  });
}
