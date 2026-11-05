/**
 * Reads of Spaces, collections, documents, versions, chunks and links, each filtered by the viewer
 * (src/access/visibility.ts). Nothing outside src/access/ reads those tables.
 */
import { and, asc, count, desc, eq, inArray, or } from 'drizzle-orm';
import type { Db } from '../db/client';
import { chunks, collections, documentVersions, documents, links, spaces } from '../db/schema';
import { isUuid } from './ids';
import type { Viewer } from './viewer';
import { visibleTo } from './visibility';

export type DocumentRow = Omit<typeof documents.$inferSelect, 'contentHash'>;
export type SpaceRow = typeof spaces.$inferSelect;
export type CollectionRow = typeof collections.$inferSelect;
export type ChunkRow = typeof chunks.$inferSelect;

export interface SpaceWithCount extends SpaceRow {
  /** Documents of this Space the viewer may read. */
  documentCount: number;
}

export interface CollectionWithCount extends CollectionRow {
  documentCount: number;
}

export interface VersionRow {
  id: string;
  version: number;
  markdown: string | null;
  fileId: string | null;
  editorId: string;
  createdAt: Date;
}

export interface LinkRow {
  id: string;
  sourceId: string;
  targetId: string;
  kind: (typeof links.$inferSelect)['kind'];
  label: string | null;
}

export const documentColumns = {
  id: documents.id,
  spaceId: documents.spaceId,
  collectionId: documents.collectionId,
  title: documents.title,
  type: documents.type,
  lang: documents.lang,
  translationGroupId: documents.translationGroupId,
  aiTranslated: documents.aiTranslated,
  origin: documents.origin,
  status: documents.status,
  hidden: documents.hidden,
  authorId: documents.authorId,
  sourceUrl: documents.sourceUrl,
  sortOrder: documents.sortOrder,
  createdAt: documents.createdAt,
  updatedAt: documents.updatedAt,
  deletedAt: documents.deletedAt,
  deletedBy: documents.deletedBy,
  planet: documents.planet,
};

/** Spaces a viewer sees on the Universe: every public Space, plus the viewer's own personal one. */
export function spacesOf(viewer: Viewer) {
  return viewer.kind === 'guest' ? eq(spaces.kind, 'public') : or(eq(spaces.kind, 'public'), eq(spaces.ownerId, viewer.userId));
}

export async function listSpaces(db: Db, viewer: Viewer): Promise<SpaceWithCount[]> {
  const counts = db
    .select({ spaceId: documents.spaceId, n: count().as('n') })
    .from(documents)
    .where(visibleTo(viewer))
    .groupBy(documents.spaceId)
    .as('counts');
  const rows = await db
    .select({ space: spaces, n: counts.n })
    .from(spaces)
    .leftJoin(counts, eq(counts.spaceId, spaces.id))
    .where(spacesOf(viewer))
    .orderBy(asc(spaces.sortOrder), asc(spaces.slug));
  return rows.map(({ space, n }) => ({ ...space, documentCount: Number(n ?? 0) }));
}

export async function findSpaceBySlug(db: Db, viewer: Viewer, slug: string): Promise<SpaceRow | null> {
  const [row] = await db
    .select()
    .from(spaces)
    .where(and(eq(spaces.slug, slug), spacesOf(viewer)));
  return row ?? null;
}

/** Collections of a Space the viewer sees, with their readable document counts; null when the Space is not visible. */
export async function listCollections(db: Db, viewer: Viewer, spaceId: string): Promise<CollectionWithCount[] | null> {
  if (!isUuid(spaceId)) return null;
  const [space] = await db
    .select({ id: spaces.id })
    .from(spaces)
    .where(and(eq(spaces.id, spaceId), spacesOf(viewer)));
  if (!space) return null;
  const counts = db
    .select({ collectionId: documents.collectionId, n: count().as('n') })
    .from(documents)
    .where(and(visibleTo(viewer), eq(documents.spaceId, spaceId)))
    .groupBy(documents.collectionId)
    .as('counts');
  const rows = await db
    .select({ collection: collections, n: counts.n })
    .from(collections)
    .leftJoin(counts, eq(counts.collectionId, collections.id))
    .where(eq(collections.spaceId, spaceId))
    .orderBy(asc(collections.sortOrder), asc(collections.createdAt));
  return rows.map(({ collection, n }) => ({ ...collection, documentCount: Number(n ?? 0) }));
}

export async function findDocument(db: Db, viewer: Viewer, id: string): Promise<DocumentRow | null> {
  if (!isUuid(id)) return null;
  const [row] = await db
    .select(documentColumns)
    .from(documents)
    .where(and(eq(documents.id, id), visibleTo(viewer)));
  return row ?? null;
}

export interface DocumentFilter {
  spaceId?: string;
  collectionId?: string;
  authorId?: string;
}

export async function listDocuments(db: Db, viewer: Viewer, filter: DocumentFilter = {}): Promise<DocumentRow[]> {
  const ids = [filter.spaceId, filter.collectionId, filter.authorId].filter((id): id is string => id !== undefined);
  if (!ids.every(isUuid)) return [];
  return db
    .select(documentColumns)
    .from(documents)
    .where(
      and(
        visibleTo(viewer),
        filter.spaceId ? eq(documents.spaceId, filter.spaceId) : undefined,
        filter.collectionId ? eq(documents.collectionId, filter.collectionId) : undefined,
        filter.authorId ? eq(documents.authorId, filter.authorId) : undefined,
      ),
    )
    .orderBy(asc(documents.sortOrder), asc(documents.createdAt));
}

/** Chunks of a readable document, in order; null when the viewer may not read it. */
export async function listChunks(db: Db, viewer: Viewer, documentId: string): Promise<ChunkRow[] | null> {
  if (!(await findDocument(db, viewer, documentId))) return null;
  return db.select().from(chunks).where(eq(chunks.documentId, documentId)).orderBy(asc(chunks.position));
}

/** Latest version of a readable document; null when none or not readable. */
export async function findLatestVersion(db: Db, viewer: Viewer, documentId: string): Promise<VersionRow | null> {
  if (!(await findDocument(db, viewer, documentId))) return null;
  const [row] = await db
    .select({
      id: documentVersions.id,
      version: documentVersions.version,
      markdown: documentVersions.markdown,
      fileId: documentVersions.fileId,
      editorId: documentVersions.editorId,
      createdAt: documentVersions.createdAt,
    })
    .from(documentVersions)
    .where(eq(documentVersions.documentId, documentId))
    .orderBy(desc(documentVersions.version))
    .limit(1);
  return row ?? null;
}

/**
 * Links from and to a readable document whose other end the viewer may read too (a link never reveals a
 * document the viewer cannot open). Null when the document itself is not readable.
 */
export async function listLinks(db: Db, viewer: Viewer, documentId: string): Promise<LinkRow[] | null> {
  if (!(await findDocument(db, viewer, documentId))) return null;
  const readable = db.select({ id: documents.id }).from(documents).where(visibleTo(viewer));
  return db
    .select({ id: links.id, sourceId: links.sourceId, targetId: links.targetId, kind: links.kind, label: links.label })
    .from(links)
    .where(
      and(
        or(eq(links.sourceId, documentId), eq(links.targetId, documentId)),
        inArray(links.sourceId, readable),
        inArray(links.targetId, readable),
      ),
    )
    .orderBy(asc(links.createdAt));
}
