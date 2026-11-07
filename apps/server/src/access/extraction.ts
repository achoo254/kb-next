/**
 * What text extraction (src/extract/) reads and writes: the uploaded file and the document it belongs to, the
 * passages extracted from it, the Collections Jev may suggest for it, and who may see its progress (C16).
 *
 * Extracted passages replace a document's chunks only while that file is the document's current version: a newer
 * upload (or an edit) since the job started wins, and a document in the trash gets nothing.
 */
import { asc, desc, eq } from 'drizzle-orm';
import type { WrittenChunk } from '../authoring/markdown-text';
import type { Db } from '../db/client';
import { chunks, collections, documentVersions, documents, files, spaces } from '../db/schema';
import { spacesOf } from './content';
import { isUuid } from './ids';
import type { Viewer } from './viewer';

/** Rows per insert of chunks (Postgres takes at most 65 535 parameters a statement). */
const CHUNK_BATCH = 1_000;

export interface ExtractionTarget {
  fileId: string;
  storageKey: string;
  mime: string;
  size: number;
  ownerId: string;
  /** The document the file belongs to; null when it has none (yet, or any more). */
  document: { id: string; lang: 'vi' | 'en'; title: string; inTrash: boolean } | null;
}

/** The file to extract and its document; null for an unknown file. */
export async function extractionTarget(db: Db, fileId: string): Promise<ExtractionTarget | null> {
  if (!isUuid(fileId)) return null;
  const [row] = await db
    .select({
      fileId: files.id,
      storageKey: files.storageKey,
      mime: files.mime,
      size: files.size,
      ownerId: files.ownerId,
      documentId: documents.id,
      lang: documents.lang,
      title: documents.title,
      deletedAt: documents.deletedAt,
    })
    .from(files)
    .leftJoin(documents, eq(documents.id, files.documentId))
    .where(eq(files.id, fileId));
  if (!row) return null;
  const { documentId, lang, title, deletedAt, ...file } = row;
  return {
    ...file,
    document: documentId && lang && title !== null ? { id: documentId, lang, title, inTrash: deletedAt !== null } : null,
  };
}

export type ExtractedWrite = 'written' | 'superseded' | 'gone';

/**
 * Replaces the chunks of `documentId` with the passages extracted from `fileId`, in one transaction holding the
 * document's row: `superseded` when the document's latest version is not that file, `gone` when the document no
 * longer exists or is in the trash. The caller enqueues the document for search sync after `written`.
 */
export async function writeExtractedChunks(db: Db, documentId: string, fileId: string, passages: readonly WrittenChunk[]): Promise<ExtractedWrite> {
  if (!isUuid(documentId) || !isUuid(fileId)) return 'gone';
  return db.transaction(async (tx): Promise<ExtractedWrite> => {
    const [doc] = await tx.select({ deletedAt: documents.deletedAt }).from(documents).where(eq(documents.id, documentId)).for('update');
    if (!doc || doc.deletedAt !== null) return 'gone';
    const [latest] = await tx
      .select({ fileId: documentVersions.fileId })
      .from(documentVersions)
      .where(eq(documentVersions.documentId, documentId))
      .orderBy(desc(documentVersions.version))
      .limit(1);
    if (latest?.fileId !== fileId) return 'superseded';
    await tx.delete(chunks).where(eq(chunks.documentId, documentId));
    const rows = passages.map((passage, position) => ({ documentId, position, ...passage }));
    for (let start = 0; start < rows.length; start += CHUNK_BATCH) await tx.insert(chunks).values(rows.slice(start, start + CHUNK_BATCH));
    return 'written';
  });
}

export interface CollectionOption {
  collectionId: string;
  spaceId: string;
  spaceNameVi: string;
  spaceNameEn: string;
  nameVi: string;
  nameEn: string;
}

/** Collections of the Spaces `ownerId` sees (every public Space and their own personal one), in Universe order. */
export async function collectionOptions(db: Db, ownerId: string): Promise<CollectionOption[]> {
  if (!isUuid(ownerId)) return [];
  return db
    .select({
      collectionId: collections.id,
      spaceId: spaces.id,
      spaceNameVi: spaces.nameVi,
      spaceNameEn: spaces.nameEn,
      nameVi: collections.nameVi,
      nameEn: collections.nameEn,
    })
    .from(collections)
    .innerJoin(spaces, eq(spaces.id, collections.spaceId))
    .where(spacesOf({ kind: 'user', userId: ownerId, isAdmin: false }))
    .orderBy(asc(spaces.sortOrder), asc(spaces.slug), asc(collections.sortOrder), asc(collections.createdAt));
}

/**
 * Whether `viewer` may follow and steer a file's processing (C16: see it, retry, cancel): the author of the document
 * it belongs to (whoever saved that version, an admin's save included), or an admin.
 */
export async function mayFollowFile(db: Db, viewer: Viewer, fileId: string): Promise<boolean> {
  if (viewer.kind !== 'user' || !isUuid(fileId)) return false;
  const [row] = await db.select({ authorId: documents.authorId }).from(files).innerJoin(documents, eq(documents.id, files.documentId)).where(eq(files.id, fileId));
  return row !== undefined && (viewer.isAdmin || row.authorId === viewer.userId);
}
