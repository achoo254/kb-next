/**
 * Stored files (C03 upload, the Office editor in C11, C16 Import Center). Every route but the download needs a session
 * (401 `sign-in-required`); all go through src/access/files.ts, so nobody downloads, replaces or moves what they may
 * not.
 *
 * - GET /api/office-editor → `{origin, maxBytes}`: where the embedded editor lives (null: none) and the size cap.
 * - POST /api/files?space=&collection= (multipart, field `file`) → 201 `{file}`: a new private Office document of the
 *   account from the file, in `space` (a public Space or their personal one; default the personal Space) and
 *   `collection`; its text extraction is queued. 413 `too-large` (over 25 MB, refused as soon as it is known),
 *   415 `unsupported-type` / `wrong-content` / `encrypted`, 400 `no-file` / `invalid-body` / `unknown-collection`.
 * - GET /api/files → `{files}`: the account's uploads with their processing (C16), newest first.
 *   429 `too-many-pending` when the account already has MAX_PENDING_PER_ACCOUNT files waiting to be read.
 * - GET /api/files/:id → the bytes (a guest too, for the current file of a published document, as the reading API), handed to nginx by `X-Accel-Redirect` in production (an `internal` location),
 *   streamed by Node in dev and tests (FILE_DELIVERY). 404 `not-found`, 403 `hidden` / `no-access`.
 * - PUT /api/files/:id (multipart) → `{file}`: a new version from the editor, `:id` being the file the copy was
 *   opened from. 409 `{error: 'conflict', current}` when the document has a newer version; 403
 *   `no-access`; 409 `not-editable` for a PDF or Markdown file; 415 `wrong-kind` for another kind of file.
 * - POST /api/files/:id/retry → 202: runs the file's extraction again (C16 "Thử lại"); the document's author or an
 *   admin. 409 `busy` while it waits or runs; 409 `not-retryable` for a `too-complex` file unless an admin asks.
 * - POST /api/files/:id/cancel → 202 `{cancelled}`: stops the file's processing (C16 "Huỷ"); the author or an admin.
 * - POST /api/files/:id/suggestions `{action: 'accept', collection, tags} | {action: 'dismiss'}` → `{suggestions}`:
 *   the owner's answer to Jev's suggestions; 409 `answered` / `stale`.
 */
import { createReadStream } from 'node:fs';
import { stat } from 'node:fs/promises';
import { pipeline } from 'node:stream/promises';
import express, { type Request, type Router } from 'express';
import { ipKeyGenerator, rateLimit } from 'express-rate-limit';
import { findUserId } from '../auth/require-user';
import { z } from 'zod';
import { eq } from 'drizzle-orm';
import { type SuggestionAnswer, answerSuggestions, createUploadedDocument, fileEditRight, fileForReading, listUploads, pendingJobsOf, saveFileVersion } from '../access/files';
import { mayFollowFile } from '../access/extraction';
import { listCollectionsOf, spacesById } from '../access/reading';
import { collectionIn, ensurePersonalSpace, spaceForWriting } from '../access/spaces-write';
import type { Viewer } from '../access/viewer';
import { type ExtractionService, type ExtractionStatus, MAX_FILE_BYTES, toExtractionStatus } from '../extract';
import { users } from '../db/schema';
import { EDITABLE_KINDS, type FileKind, kindOfMime } from '../files/file-kinds';
import { ensureFilesDir, isStorageKey, removeStoredFiles, storedPath } from '../files/file-store';
import { ADMIN_RETRY_ONLY } from '../extract/extraction-error';
import { type ReceivedFile, receiveUpload } from '../files/receive-upload';
import { HttpError } from '../http-error';
import { safeErrorText } from '../log-error';
import type { IndexSync } from '../search/index-sync';
import { perAccountLimit, signedIn } from './account-limit';
import { type RequestContextDeps, readerOf } from './request-context';
import { parseBody, parseQuery } from './validate';

/** nginx's `internal` location over FILES_DIR (infra/nginx/kb.hoandat.com.conf). */
export const FILES_ACCEL_PREFIX = '/_kb_files/';
/** Uploads listed on C16. */
const UPLOADS_LISTED = 50;
/**
 * Files an account may have waiting for or in processing: the queue reads one file at a time for everyone, so one
 * account's backlog would hold up every other's (429 `too-many-pending` past it).
 */
export const MAX_PENDING_PER_ACCOUNT = 20;

const Slug = z.string().regex(/^[a-z0-9][a-z0-9-]{0,119}$/);
const UploadQuery = z.object({ space: Slug.optional(), collection: z.uuid().optional() });
const Tag = z.string().trim().min(1).max(60);
const SuggestionBody = z.discriminatedUnion('action', [
  z.strictObject({ action: z.literal('accept'), collection: z.boolean(), tags: z.array(Tag).max(20) }),
  z.strictObject({ action: z.literal('dismiss') }),
]);

type UserViewer = Extract<Viewer, { kind: 'user' }>;

export interface StoredFileResponse {
  id: string;
  documentId: string;
  name: string;
  kind: FileKind;
  size: number;
  /** The document's version this file is (1 for an upload). */
  version: number;
  savedAt: string;
}

/** One upload as C16 lists it. */
export interface UploadView {
  fileId: string;
  documentId: string;
  name: string;
  kind: FileKind | null;
  size: number;
  createdAt: string;
  space: { slug: string; nameVi: string; nameEn: string; kind: 'public' | 'personal' };
  collection: { id: string; nameVi: string; nameEn: string } | null;
  /** Null when no extraction was queued (yet). */
  processing: (Omit<ExtractionStatus, 'nextAttemptAt' | 'updatedAt' | 'finishedAt' | 'suggestions'> & { nextAttemptAt: string | null; updatedAt: string; finishedAt: string | null }) | null;
  suggestions: SuggestionsView | null;
}

/** Jev's suggestions with the names C16 shows ("Networking › Địa chỉ · 0,91"). */
export interface SuggestionsView {
  status: 'pending' | 'accepted' | 'dismissed';
  collection: { collectionId: string; probability: number; space: { slug: string; nameVi: string; nameEn: string }; nameVi: string; nameEn: string } | null;
  tags: Array<{ tag: string; probability: number }>;
}

export interface FileRoutesOptions extends RequestContextDeps {
  /** Text extraction (null in tests that do not need it: uploads are then stored without processing). */
  extraction: ExtractionService | null;
  sync: IndexSync | null;
}

function asUser(viewer: Viewer): UserViewer {
  if (viewer.kind !== 'user') throw new HttpError(401, 'sign-in-required');
  return viewer;
}

function refuse(kind: 'not-found' | 'hidden' | 'no-access'): never {
  if (kind === 'not-found') throw new HttpError(404, 'not-found');
  throw new HttpError(403, kind);
}

/** `attachment` with the name as sent (RFC 6266/5987), an ASCII fallback for old clients. */
function contentDisposition(name: string): string {
  const ascii = name.normalize('NFD').replace(/[^\x20-\x7e]/g, '').replace(/["\\]/g, '_') || 'file';
  return `attachment; filename="${ascii}"; filename*=UTF-8''${encodeURIComponent(name)}`;
}

/** What is read and thrown away of a refused upload before its connection is cut. */
const DRAIN_LIMIT = MAX_FILE_BYTES + 1024 * 1024;

/**
 * Receives the request's file. When it is refused before the body was read through (too large, wrong type), the
 * answer goes out at once; the rest of the body is read and dropped (never stored, never buffered) so the client
 * sees the answer instead of a reset, up to DRAIN_LIMIT, past which the connection is cut.
 */
async function receive(req: Request, filesDir: string, expected: FileKind | null): Promise<ReceivedFile> {
  try {
    return await receiveUpload(req, filesDir, expected);
  } catch (error) {
    if (!req.complete) {
      let drained = 0;
      req.on('data', (chunk: Buffer) => {
        drained += chunk.length;
        if (drained > DRAIN_LIMIT) req.destroy();
      });
      req.resume();
    }
    throw error;
  }
}

export function fileRoutes({ config, db, now, extraction, sync }: FileRoutesOptions): Router {
  const router = express.Router();
  const auth = signedIn(config, db, now);
  const uploadLimit = perAccountLimit(config.uploadLimitPerMinute);
  const readLimit = perAccountLimit(300);
  const answerLimit = perAccountLimit(60);
  const retryLimit = perAccountLimit(config.retryLimitPerMinute);
  const reader = async (req: Request): Promise<UserViewer> => asUser((await readerOf(req, { config, db, now })).viewer);
  const idOf = (req: Request): string => (typeof req.params.id === 'string' ? req.params.id : '');
  const filesReady = ensureFilesDir(config.filesDir).catch((error: unknown) => {
    console.error('files directory unavailable', safeErrorText(error));
  });

  /** Queues the extraction of a stored file; a failure leaves it to C16's "Thử lại" (the file is safe on disk). */
  async function queue(fileId: string): Promise<boolean> {
    if (!extraction) return false;
    try {
      await extraction.enqueueExtraction(fileId);
      return true;
    } catch (error) {
      console.error('extract: queueing an upload failed', safeErrorText(error));
      return false;
    }
  }

  router.get('/api/office-editor', auth, (_req, res) => {
    res.set('Cache-Control', 'no-store').json({ origin: config.officeEditorOrigin, maxBytes: MAX_FILE_BYTES });
  });

  router.post('/api/files', auth, uploadLimit, async (req, res) => {
    const viewer = await reader(req);
    const query = parseQuery(UploadQuery, req.query);
    const space = query.space ? await spaceForWriting(db, viewer, query.space) : { kind: 'ok' as const, space: (await ensurePersonalSpace(db, viewer)).space };
    if (space.kind === 'not-found') throw new HttpError(404, 'not-found');
    if (space.kind === 'no-access') throw new HttpError(403, 'no-access');
    const collection = query.collection ? await collectionIn(db, space.space.id, query.collection) : null;
    if (query.collection && !collection) throw new HttpError(400, 'unknown-collection');
    if ((await pendingJobsOf(db, viewer)) >= MAX_PENDING_PER_ACCOUNT) throw new HttpError(429, 'too-many-pending');
    // Read before the file is received: nothing can fail between storing it and recording it but the insert itself.
    const [account] = await db.select({ lang: users.lang }).from(users).where(eq(users.id, viewer.userId));
    await filesReady;
    const file = await receive(req, config.filesDir, null);
    let created: { documentId: string; fileId: string };
    try {
      created = await createUploadedDocument(db, viewer, { spaceId: space.space.id, collectionId: collection?.id ?? null, lang: account?.lang ?? 'vi', file }, now());
    } catch (error) {
      await removeStoredFiles(config.filesDir, [file.storageKey]);
      throw error;
    }
    const queued = await queue(created.fileId);
    sync?.enqueue([created.documentId]);
    const body: StoredFileResponse & { queued: boolean } = {
      id: created.fileId,
      documentId: created.documentId,
      name: file.originalName,
      kind: file.kind,
      size: file.size,
      version: 1,
      savedAt: now().toISOString(),
      queued,
    };
    res.status(201).json({ file: body });
  });

  router.get('/api/files', auth, readLimit, async (req, res) => {
    const viewer = await reader(req);
    const uploads = await listUploads(db, viewer, UPLOADS_LISTED);
    const suggested = uploads.flatMap((u) => (u.job?.suggestions?.collection ? [u.job.suggestions.collection] : []));
    const spaceIds = [...new Set(suggested.map((c) => c.spaceId))];
    const [spaceRows, collectionRows] = await Promise.all([spacesById(db, spaceIds), listCollectionsOf(db, spaceIds)]);
    const spaceOf = new Map(spaceRows.map((s) => [s.id, s]));
    const collectionOf = new Map(collectionRows.map((c) => [c.id, c]));
    const files: UploadView[] = uploads.map((u) => {
      const status = u.job ? toExtractionStatus(u.job) : null;
      const sug = status?.suggestions ?? null;
      const target = sug?.collection ? collectionOf.get(sug.collection.collectionId) : undefined;
      const targetSpace = sug?.collection ? spaceOf.get(sug.collection.spaceId) : undefined;
      return {
        fileId: u.fileId,
        documentId: u.documentId,
        name: u.title,
        kind: kindOfMime(u.mime),
        size: u.size,
        createdAt: u.createdAt.toISOString(),
        space: u.space,
        collection: u.collection,
        processing: status
          ? {
              fileId: status.fileId,
              status: status.status,
              steps: status.steps,
              attempts: status.attempts,
              maxAttempts: status.maxAttempts,
              error: status.error,
              nextAttemptAt: status.nextAttemptAt?.toISOString() ?? null,
              updatedAt: status.updatedAt.toISOString(),
              finishedAt: status.finishedAt?.toISOString() ?? null,
            }
          : null,
        suggestions: sug
          ? {
              status: sug.status,
              collection:
                sug.collection && target && targetSpace
                  ? {
                      collectionId: target.id,
                      probability: sug.collection.probability,
                      space: { slug: targetSpace.slug, nameVi: targetSpace.nameVi, nameEn: targetSpace.nameEn },
                      nameVi: target.nameVi,
                      nameEn: target.nameEn,
                    }
                  : null,
              tags: sug.tags,
            }
          : null,
      };
    });
    res.set('Cache-Control', 'no-store').json({ files });
  });

  // Downloads follow the reading rule (src/access/): a guest gets the current file of a published, visible document,
  // as GET /api/documents/:id gives a guest its text; limited per account, or per address for guests.
  const downloadLimit = rateLimit({
    windowMs: 60 * 1000,
    limit: 300,
    standardHeaders: 'draft-8',
    legacyHeaders: false,
    message: { error: 'rate-limited' },
    keyGenerator: async (req) => {
      const userId = await findUserId(req, config, db, now());
      return userId ? `user:${userId}` : `ip:${ipKeyGenerator(req.ip ?? '')}`;
    },
  });

  router.get('/api/files/:id', downloadLimit, async (req, res) => {
    const { viewer } = await readerOf(req, { config, db, now });
    const access = await fileForReading(db, viewer, idOf(req));
    if (access.kind !== 'ok') refuse(access.kind);
    const { file } = access;
    // Rows only ever hold keys the upload made; checked again so no other path can reach nginx's redirect.
    if (!isStorageKey(file.storageKey)) throw new Error('stored file without a storage key');
    // The headers nginx keeps on an X-Accel response (Content-Type, Content-Disposition, Cache-Control), the same in
    // both deliveries; the ETag is nginx's own there, so Node sends none either.
    res.set({
      'Content-Type': file.mime,
      'Content-Disposition': contentDisposition(file.originalName),
      // Never cached by a shared cache; the browser asks again (the editor keeps its own copy offline).
      'Cache-Control': 'private, no-cache',
      'X-Content-Type-Options': 'nosniff',
    });
    if (config.fileDelivery === 'x-accel') {
      res.set('X-Accel-Redirect', `${FILES_ACCEL_PREFIX}${file.storageKey}`).end();
      return;
    }
    const filePath = storedPath(config.filesDir, file.storageKey);
    const found = await stat(filePath).catch(() => null);
    if (!found) throw new HttpError(404, 'file-missing');
    res.set('Content-Length', String(found.size));
    try {
      await pipeline(createReadStream(filePath), res);
    } catch (error) {
      // The reader went away mid-file: nothing left to answer.
      if (!res.headersSent) throw error;
      res.destroy();
    }
  });

  router.put('/api/files/:id', auth, uploadLimit, async (req, res) => {
    const viewer = await reader(req);
    const id = idOf(req);
    const access = await fileForReading(db, viewer, id);
    if (access.kind !== 'ok') refuse(access.kind);
    const kind = kindOfMime(access.file.mime);
    if (!kind || !EDITABLE_KINDS.has(kind)) throw new HttpError(409, 'not-editable');
    const right = await fileEditRight(db, viewer, id);
    if (right !== 'ok') refuse(right);
    await filesReady;
    const file = await receive(req, config.filesDir, kind);
    let saved: Awaited<ReturnType<typeof saveFileVersion>>;
    try {
      saved = await saveFileVersion(db, viewer, id, file, now());
    } catch (error) {
      await removeStoredFiles(config.filesDir, [file.storageKey]);
      throw error;
    }
    if (saved.kind !== 'saved') {
      await removeStoredFiles(config.filesDir, [file.storageKey]);
      if (saved.kind === 'conflict') {
        const { current } = saved;
        res.status(409).json({ error: 'conflict', current: { fileId: current.fileId, version: current.version, savedAt: current.savedAt.toISOString() } });
        return;
      }
      refuse(saved.kind);
    }
    await queue(saved.fileId);
    const body: StoredFileResponse = {
      id: saved.fileId,
      documentId: saved.documentId,
      name: access.file.originalName,
      kind,
      size: file.size,
      version: saved.version,
      savedAt: saved.savedAt.toISOString(),
    };
    res.json({ file: body });
  });

  router.post('/api/files/:id/retry', auth, retryLimit, async (req, res) => {
    const viewer = await reader(req);
    const id = idOf(req);
    if (!(await mayFollowFile(db, viewer, id))) throw new HttpError(404, 'not-found');
    if (!extraction) throw new HttpError(503, 'extraction-off');
    const status = await extraction.extractionStatus(viewer, id);
    // Queued or waiting for its next attempt: a retry would only reset its attempts. (A running one is left alone by
    // the queue, unless it is being cancelled: then it runs again once it has stopped.)
    if (status && (status.status === 'queued' || status.status === 'waiting')) throw new HttpError(409, 'busy');
    // A file that ran its reader out of memory, or crashed the server again and again, runs again only by an admin.
    if (status?.error && ADMIN_RETRY_ONLY.has(status.error.code) && !viewer.isAdmin) throw new HttpError(409, 'not-retryable');
    await extraction.enqueueExtraction(id);
    res.status(202).json({ queued: true });
  });

  router.post('/api/files/:id/cancel', auth, answerLimit, async (req, res) => {
    const viewer = await reader(req);
    const id = idOf(req);
    if (!(await mayFollowFile(db, viewer, id))) throw new HttpError(404, 'not-found');
    if (!extraction) throw new HttpError(503, 'extraction-off');
    res.status(202).json({ cancelled: await extraction.cancelExtraction(id) });
  });

  router.post('/api/files/:id/suggestions', auth, answerLimit, async (req, res) => {
    const viewer = await reader(req);
    const body = parseBody(SuggestionBody, req.body);
    const answer: SuggestionAnswer = body.action === 'accept' ? { action: 'accept', collection: body.collection, tags: body.tags } : { action: 'dismiss' };
    const result = await answerSuggestions(db, viewer, idOf(req), answer, now());
    if (result.kind === 'answered' || result.kind === 'stale') throw new HttpError(409, result.kind);
    if (result.kind !== 'ok') refuse(result.kind);
    sync?.enqueue([result.documentId]);
    res.json({ suggestions: { status: result.suggestions.status } });
  });

  return router;
}
