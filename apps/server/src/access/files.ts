/**
 * Stored files (C03 upload, the Office editor, C16 Import Center) and the documents they belong to: making a
 * document from an upload, who may download a file, a new version from the editor (with its conflict check), the
 * account's uploads with their processing, and applying Jev's suggestions. Every path checks the read rule
 * (visibility.ts) and the edit right (authoring.ts) first: nobody downloads, replaces or moves what they may not.
 *
 * A reader who may not see a document's history (neither its author nor an admin) downloads only its current file:
 * earlier versions stay with their author, as C17's versions do.
 */
import { and, desc, eq, inArray, isNull, sql } from 'drizzle-orm';
import type { Db } from '../db/client';
import { type ExtractSuggestions, collections, documentVersions, documents, extractJobs, files, spaces } from '../db/schema';
import { editRight } from './authoring';
import { documentColumns } from './content';
import { historyScope } from './history';
import { isUuid } from './ids';
import { documentAccess } from './reading';
import type { Viewer } from './viewer';

type UserViewer = Extract<Viewer, { kind: 'user' }>;
type Tx = Parameters<Parameters<Db['transaction']>[0]>[0];

/** What the upload wrote to disk and checked. */
export interface StoredFileInput {
  storageKey: string;
  originalName: string;
  mime: string;
  size: number;
  sha256: string;
}

export interface NewUpload {
  spaceId: string;
  collectionId: string | null;
  lang: 'vi' | 'en';
  file: StoredFileInput;
}

/**
 * A new Office document of `owner` from an uploaded file, in one transaction: the document (titled with the file's
 * name, origin `own`, `private`: only its author and admins see it), the file's row and version 1 pointing at it.
 * The caller then queues the file's text extraction.
 */
export async function createUploadedDocument(db: Db, owner: UserViewer, input: NewUpload, now: Date): Promise<{ documentId: string; fileId: string }> {
  return db.transaction(async (tx) => {
    const [doc] = await tx
      .insert(documents)
      .values({
        spaceId: input.spaceId,
        collectionId: input.collectionId,
        title: input.file.originalName,
        type: 'office',
        lang: input.lang,
        origin: 'own',
        status: 'private',
        authorId: owner.userId,
        contentHash: input.file.sha256,
        createdAt: now,
        updatedAt: now,
      })
      .returning({ id: documents.id });
    if (!doc) throw new Error('document insert returned nothing');
    const [file] = await tx
      .insert(files)
      .values({ ...input.file, ownerId: owner.userId, documentId: doc.id, createdAt: now })
      .returning({ id: files.id });
    if (!file) throw new Error('file insert returned nothing');
    await tx.insert(documentVersions).values({ documentId: doc.id, version: 1, fileId: file.id, editorId: owner.userId, via: 'import', createdAt: now, updatedAt: now });
    return { documentId: doc.id, fileId: file.id };
  });
}

export interface ReadableFile {
  id: string;
  documentId: string;
  storageKey: string;
  originalName: string;
  mime: string;
  size: number;
  sha256: string;
}

export type FileAccess = { kind: 'ok'; file: ReadableFile } | { kind: 'not-found' } | { kind: 'hidden' } | { kind: 'no-access' };

async function latestFileId(db: Db | Tx, documentId: string): Promise<string | null> {
  const [row] = await db
    .select({ fileId: documentVersions.fileId })
    .from(documentVersions)
    .where(eq(documentVersions.documentId, documentId))
    .orderBy(desc(documentVersions.version))
    .limit(1);
  return row?.fileId ?? null;
}

/** A stored file the viewer may download: one of a document they may read (an earlier version only with its history). */
export async function fileForReading(db: Db, viewer: Viewer, fileId: string): Promise<FileAccess> {
  if (!isUuid(fileId)) return { kind: 'not-found' };
  const [row] = await db
    .select({
      id: files.id,
      documentId: files.documentId,
      storageKey: files.storageKey,
      originalName: files.originalName,
      mime: files.mime,
      size: files.size,
      sha256: files.sha256,
    })
    .from(files)
    .where(eq(files.id, fileId));
  if (!row?.documentId) return { kind: 'not-found' };
  const access = await documentAccess(db, viewer, row.documentId);
  if (access.kind !== 'ok') return access;
  if (historyScope(viewer, access.doc) === 'public' && (await latestFileId(db, row.documentId)) !== row.id) return { kind: 'no-access' };
  return { kind: 'ok', file: { ...row, documentId: row.documentId } };
}

export type FileEditRight = 'ok' | 'not-found' | 'hidden' | 'no-access';

/**
 * Whether `viewer` may save a new version over `fileId` (checked before the upload is read; saveFileVersion checks
 * again in its transaction).
 */
export async function fileEditRight(db: Db, viewer: Viewer, fileId: string): Promise<FileEditRight> {
  const access = await fileForReading(db, viewer, fileId);
  if (access.kind !== 'ok') return access.kind;
  const doc = await documentAccess(db, viewer, access.file.documentId);
  if (doc.kind !== 'ok') return doc.kind;
  return editRight(viewer, doc.doc);
}

export interface CurrentFile {
  id: string;
  originalName: string;
  mime: string;
  size: number;
  version: number;
  savedAt: Date;
}

/** The file of a readable document's current version (C11's Office view); null for Markdown or an unreadable one. */
export async function currentFileOf(db: Db, viewer: Viewer, documentId: string): Promise<CurrentFile | null> {
  const access = await documentAccess(db, viewer, documentId);
  if (access.kind !== 'ok') return null;
  const [row] = await db
    .select({
      id: files.id,
      originalName: files.originalName,
      mime: files.mime,
      size: files.size,
      version: documentVersions.version,
      savedAt: documentVersions.updatedAt,
    })
    .from(documentVersions)
    .innerJoin(files, eq(files.id, documentVersions.fileId))
    .where(eq(documentVersions.documentId, documentId))
    .orderBy(desc(documentVersions.version))
    .limit(1);
  // Only when that file is the latest version: a later Markdown version means the document is text now.
  const latest = await latestFileId(db, documentId);
  return row && row.id === latest ? row : null;
}

export type FileSaveResult =
  | { kind: 'saved'; fileId: string; documentId: string; version: number; savedAt: Date }
  /** The document has a newer file than the one the editor started from. */
  | { kind: 'conflict'; current: { fileId: string | null; version: number; savedAt: Date } }
  | { kind: 'not-found' }
  | { kind: 'no-access' };

/**
 * A new version of a document from the editor: `baseFileId` is the file the writer's copy was opened from. In one
 * transaction holding the document's row: refused when the writer may not edit it, a conflict when its current
 * version is no longer that file (someone saved since); else the new file's row and the next version (`editor`).
 */
export async function saveFileVersion(db: Db, writer: Viewer, baseFileId: string, file: StoredFileInput, now: Date): Promise<FileSaveResult> {
  if (writer.kind !== 'user' || !isUuid(baseFileId)) return { kind: 'not-found' };
  const [base] = await db.select({ documentId: files.documentId }).from(files).where(eq(files.id, baseFileId));
  const documentId = base?.documentId;
  if (!documentId) return { kind: 'not-found' };
  return db.transaction(async (tx): Promise<FileSaveResult> => {
    const [doc] = await tx.select(documentColumns).from(documents).where(eq(documents.id, documentId)).for('update');
    if (!doc || doc.deletedAt !== null) return { kind: 'not-found' };
    const access = await documentAccess(tx, writer, documentId);
    if (access.kind !== 'ok') return { kind: access.kind === 'hidden' ? 'no-access' : access.kind };
    const right = editRight(writer, doc);
    if (right !== 'ok') return { kind: right };
    const [latest] = await tx
      .select({ version: documentVersions.version, fileId: documentVersions.fileId, updatedAt: documentVersions.updatedAt })
      .from(documentVersions)
      .where(eq(documentVersions.documentId, documentId))
      .orderBy(desc(documentVersions.version))
      .limit(1);
    if (!latest) return { kind: 'not-found' };
    if (latest.fileId !== baseFileId) {
      // A later Markdown version (no file) cannot take an Office save either: the writer reloads.
      return { kind: 'conflict', current: { fileId: latest.fileId, version: latest.version, savedAt: latest.updatedAt } };
    }
    const [row] = await tx
      .insert(files)
      .values({ ...file, ownerId: writer.userId, documentId, createdAt: now })
      .returning({ id: files.id });
    if (!row) throw new Error('file insert returned nothing');
    const version = latest.version + 1;
    await tx.insert(documentVersions).values({ documentId, version, fileId: row.id, editorId: writer.userId, via: 'editor', createdAt: now, updatedAt: now });
    await tx.update(documents).set({ contentHash: file.sha256, updatedAt: now }).where(eq(documents.id, documentId));
    return { kind: 'saved', fileId: row.id, documentId, version, savedAt: now };
  });
}

export interface UploadEntry {
  fileId: string;
  documentId: string;
  title: string;
  mime: string;
  size: number;
  createdAt: Date;
  space: { slug: string; nameVi: string; nameEn: string; kind: 'public' | 'personal' };
  collection: { id: string; nameVi: string; nameEn: string } | null;
  job: typeof extractJobs.$inferSelect | null;
}

/**
 * The account's uploaded documents for C16, newest file first: the current file of each live Office document it
 * authored, whoever saved that version (an editor save shows as that document being processed again), with its
 * extraction job if any.
 */
export async function listUploads(db: Db, viewer: UserViewer, limit: number): Promise<UploadEntry[]> {
  const rows = await db
    .select({
      fileId: files.id,
      documentId: documents.id,
      title: documents.title,
      mime: files.mime,
      size: files.size,
      createdAt: files.createdAt,
      spaceSlug: spaces.slug,
      spaceNameVi: spaces.nameVi,
      spaceNameEn: spaces.nameEn,
      spaceKind: spaces.kind,
      collectionId: collections.id,
      collectionNameVi: collections.nameVi,
      collectionNameEn: collections.nameEn,
      job: extractJobs,
    })
    .from(files)
    .innerJoin(documents, eq(documents.id, files.documentId))
    .innerJoin(spaces, eq(spaces.id, documents.spaceId))
    .leftJoin(collections, eq(collections.id, documents.collectionId))
    .leftJoin(extractJobs, eq(extractJobs.fileId, files.id))
    .where(
      and(
        eq(documents.authorId, viewer.userId),
        isNull(documents.deletedAt),
        sql`${files.id} = (select v.file_id from document_versions v where v.document_id = ${documents.id} order by v.version desc limit 1)`,
      ),
    )
    .orderBy(desc(files.createdAt), desc(files.id))
    .limit(limit);
  return rows.map((row) => ({
    fileId: row.fileId,
    documentId: row.documentId,
    title: row.title,
    mime: row.mime,
    size: row.size,
    createdAt: row.createdAt,
    space: { slug: row.spaceSlug, nameVi: row.spaceNameVi, nameEn: row.spaceNameEn, kind: row.spaceKind },
    collection: row.collectionId && row.collectionNameVi !== null && row.collectionNameEn !== null ? { id: row.collectionId, nameVi: row.collectionNameVi, nameEn: row.collectionNameEn } : null,
    job: row.job,
  }));
}

/** Files of documents `viewer` authored still waiting for or in their processing (C03's cap on a backlog). */
export async function pendingJobsOf(db: Db, viewer: UserViewer): Promise<number> {
  const [row] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(extractJobs)
    .innerJoin(files, eq(files.id, extractJobs.fileId))
    .innerJoin(documents, eq(documents.id, files.documentId))
    .where(and(eq(documents.authorId, viewer.userId), inArray(extractJobs.status, ['queued', 'running', 'waiting'])));
  return row?.n ?? 0;
}

export type SuggestionAnswer = { action: 'accept'; collection: boolean; tags: readonly string[] } | { action: 'dismiss' };

export type SuggestionResult =
  | { kind: 'ok'; documentId: string; suggestions: ExtractSuggestions }
  | { kind: 'not-found' }
  | { kind: 'no-access' }
  /** No pending suggestions for that file (none made, or already answered). */
  | { kind: 'answered' }
  /** The suggested Collection is gone, or its Space is no longer one the author may write in. */
  | { kind: 'stale' };

/**
 * The owner's answer to Jev's suggestions for an uploaded file (C16 "Dùng"): accepting moves the document into the
 * suggested Collection (and its Space) when asked, and adds the chosen suggested tags (never others); dismissing
 * only records the answer. Only the document's author (or an admin) answers, while they may edit it, and only for its
 * current file (an earlier version's suggestions read as `answered`).
 */
export async function answerSuggestions(db: Db, viewer: Viewer, fileId: string, answer: SuggestionAnswer, now: Date): Promise<SuggestionResult> {
  if (viewer.kind !== 'user' || !isUuid(fileId)) return { kind: 'not-found' };
  return db.transaction(async (tx): Promise<SuggestionResult> => {
    const [file] = await tx.select({ documentId: files.documentId }).from(files).where(eq(files.id, fileId));
    if (!file?.documentId) return { kind: 'not-found' };
    const [doc] = await tx.select(documentColumns).from(documents).where(eq(documents.id, file.documentId)).for('update');
    if (!doc || doc.deletedAt !== null || (!viewer.isAdmin && doc.authorId !== viewer.userId)) return { kind: 'not-found' };
    // Suggestions read from an earlier version's text no longer describe the document.
    if ((await latestFileId(tx, doc.id)) !== fileId) return { kind: 'answered' };
    const [job] = await tx.select({ suggestions: extractJobs.suggestions }).from(extractJobs).where(eq(extractJobs.fileId, fileId)).for('update');
    const right = editRight(viewer, doc);
    if (right !== 'ok') return { kind: right };
    const pending = job?.suggestions;
    if (!pending || pending.status !== 'pending') return { kind: 'answered' };

    if (answer.action === 'dismiss') {
      const suggestions: ExtractSuggestions = { ...pending, status: 'dismissed' };
      await tx.update(extractJobs).set({ suggestions, updatedAt: now }).where(eq(extractJobs.fileId, fileId));
      return { kind: 'ok', documentId: doc.id, suggestions };
    }

    let place = { spaceId: doc.spaceId, collectionId: doc.collectionId };
    if (answer.collection && pending.collection) {
      const target = pending.collection;
      const [found] = await tx
        .select({ collectionId: collections.id, spaceKind: spaces.kind, spaceOwner: spaces.ownerId })
        .from(collections)
        .innerJoin(spaces, eq(spaces.id, collections.spaceId))
        .where(and(eq(collections.id, target.collectionId), eq(collections.spaceId, target.spaceId)));
      const writable = found && (found.spaceKind === 'public' || found.spaceOwner === doc.authorId);
      if (!writable) return { kind: 'stale' };
      place = { spaceId: target.spaceId, collectionId: target.collectionId };
    }
    const offered = new Set(pending.tags.map((t) => t.tag));
    const accepted = answer.tags.filter((tag) => offered.has(tag));
    const tags = [...new Set([...doc.tags, ...accepted])];
    await tx
      .update(documents)
      .set({ ...place, tags, updatedAt: now })
      .where(eq(documents.id, doc.id));
    const suggestions: ExtractSuggestions = { ...pending, status: 'accepted' };
    await tx.update(extractJobs).set({ suggestions, updatedAt: now }).where(eq(extractJobs.fileId, fileId));
    return { kind: 'ok', documentId: doc.id, suggestions };
  });
}
