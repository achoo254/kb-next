/**
 * Reads behind the reading screens (Universe C09, Space C10, Reader C11): why a document or Space cannot be
 * opened, per-type counts of texts, translations, versions, recent documents and links between Spaces. Every
 * document read is filtered by the viewer (src/access/visibility.ts), like the rest of src/access/.
 */
import { and, asc, count, desc, eq, inArray, isNotNull, isNull, ne, or, sql } from 'drizzle-orm';
import { alias } from 'drizzle-orm/pg-core';
import type { Db } from '../db/client';
import { collections, documentVersions, documents, links, reviewEvents, spaces, users } from '../db/schema';
import { type CollectionRow, type DocumentRow, type SpaceRow, documentColumns, spacesOf } from './content';
import { isUuid } from './ids';
import type { Viewer } from './viewer';
import { canRead, visibleTo } from './visibility';

/**
 * Why a document opens or not, so the reader can show the right screen: it does not exist (or is in the trash),
 * it is hidden by an admin, or it is someone else's unpublished text. Only the reason is told, never its content.
 */
export type DocumentAccess = { kind: 'ok'; doc: DocumentRow } | { kind: 'not-found' } | { kind: 'hidden' } | { kind: 'no-access' };

export async function documentAccess(db: Db, viewer: Viewer, id: string): Promise<DocumentAccess> {
  if (!isUuid(id)) return { kind: 'not-found' };
  const [doc] = await db.select(documentColumns).from(documents).where(eq(documents.id, id));
  if (!doc || doc.deletedAt !== null) return { kind: 'not-found' };
  if (canRead(viewer, doc)) return { kind: 'ok', doc };
  return doc.status === 'approved' && doc.hidden ? { kind: 'hidden' } : { kind: 'no-access' };
}

/** A Space by slug: visible, unknown, or someone else's personal Space. */
export type SpaceAccess = { kind: 'ok'; space: SpaceRow } | { kind: 'not-found' } | { kind: 'no-access' };

export async function spaceAccess(db: Db, viewer: Viewer, slug: string): Promise<SpaceAccess> {
  const [space] = await db.select().from(spaces).where(eq(spaces.slug, slug));
  if (!space) return { kind: 'not-found' };
  const [visible] = await db
    .select({ id: spaces.id })
    .from(spaces)
    .where(and(eq(spaces.id, space.id), spacesOf(viewer)));
  return visible ? { kind: 'ok', space } : { kind: 'no-access' };
}

/** Readable texts per Space and type. A text and its translations count once (same `translationGroupId`). */
export interface TypeCount {
  spaceId: string;
  type: DocumentRow['type'];
  count: number;
}

export async function countTextsByType(db: Db, viewer: Viewer): Promise<TypeCount[]> {
  const texts = sql<number>`count(distinct coalesce(${documents.translationGroupId}, ${documents.id}))`;
  const rows = await db
    .select({ spaceId: documents.spaceId, type: documents.type, n: texts })
    .from(documents)
    .where(visibleTo(viewer))
    .groupBy(documents.spaceId, documents.type);
  return rows.map((row) => ({ spaceId: row.spaceId, type: row.type, count: Number(row.n) }));
}

/** Collections of the given Spaces (already checked visible by the caller), in their order. */
export async function listCollectionsOf(db: Db, spaceIds: readonly string[]): Promise<CollectionRow[]> {
  if (spaceIds.length === 0) return [];
  return db
    .select()
    .from(collections)
    .where(inArray(collections.spaceId, [...spaceIds]))
    .orderBy(asc(collections.sortOrder), asc(collections.createdAt));
}

/** A Collection in a Space the viewer sees; null otherwise (or for an id that is not one). */
export async function findCollection(db: Db, viewer: Viewer, id: string): Promise<CollectionRow | null> {
  if (!isUuid(id)) return null;
  const [row] = await db
    .select({ collection: collections })
    .from(collections)
    .innerJoin(spaces, eq(spaces.id, collections.spaceId))
    .where(and(eq(collections.id, id), spacesOf(viewer)));
  return row?.collection ?? null;
}

/** The Spaces of documents the viewer can read: naming a readable document's Space reveals nothing more. */
export async function spacesById(db: Db, ids: readonly string[]): Promise<SpaceRow[]> {
  const valid = ids.filter(isUuid);
  if (valid.length === 0) return [];
  return db.select().from(spaces).where(inArray(spaces.id, valid));
}

/** Display names of accounts (authors, editors), by user id; an account without a name is absent. */
export async function userNames(db: Db, ids: readonly string[]): Promise<Map<string, string>> {
  const valid = [...new Set(ids.filter(isUuid))];
  if (valid.length === 0) return new Map();
  const rows = await db.select({ id: users.id, name: users.name }).from(users).where(inArray(users.id, valid));
  return new Map(rows.flatMap((row) => (row.name ? [[row.id, row.name] as const] : [])));
}

export async function findDocumentsByIds(db: Db, viewer: Viewer, ids: readonly string[]): Promise<DocumentRow[]> {
  const valid = [...new Set(ids.filter(isUuid))];
  if (valid.length === 0) return [];
  return db
    .select(documentColumns)
    .from(documents)
    .where(and(visibleTo(viewer), inArray(documents.id, valid)));
}

/**
 * Readable documents of the given texts (each in every language the viewer may read). A text's key is its
 * `translationGroupId ?? id`: an original without a group of its own is the text of its id, and a translation made
 * of it carries that id as its group (src/access/translation-write.ts), so the original is never written to.
 */
export async function listTranslationsOf(db: Db, viewer: Viewer, textKeys: readonly string[]): Promise<DocumentRow[]> {
  const valid = [...new Set(textKeys.filter(isUuid))];
  if (valid.length === 0) return [];
  return db
    .select(documentColumns)
    .from(documents)
    .where(
      and(
        visibleTo(viewer),
        or(inArray(documents.translationGroupId, valid), and(isNull(documents.translationGroupId), inArray(documents.id, valid))),
      ),
    )
    .orderBy(asc(documents.lang), asc(documents.createdAt));
}

/** The most recently updated readable documents. */
export async function listRecentDocuments(db: Db, viewer: Viewer, limit: number): Promise<DocumentRow[]> {
  return db
    .select(documentColumns)
    .from(documents)
    .where(visibleTo(viewer))
    .orderBy(desc(documents.updatedAt), asc(documents.id))
    .limit(limit);
}

export interface VersionSummary {
  version: number;
  editorId: string;
  createdAt: Date;
}

/** Saved versions of a readable document, newest first, without their content; null when not readable. */
export async function listVersionSummaries(db: Db, viewer: Viewer, documentId: string): Promise<VersionSummary[] | null> {
  if (!isUuid(documentId)) return null;
  const [readable] = await db
    .select({ id: documents.id })
    .from(documents)
    .where(and(eq(documents.id, documentId), visibleTo(viewer)));
  if (!readable) return null;
  return db
    .select({ version: documentVersions.version, editorId: documentVersions.editorId, createdAt: documentVersions.createdAt })
    .from(documentVersions)
    .where(eq(documentVersions.documentId, documentId))
    .orderBy(desc(documentVersions.version));
}

/** Who approved a readable document last and when (its review trail), or null when nobody did or it is not readable. */
export async function findApproval(db: Db, viewer: Viewer, documentId: string): Promise<{ actorId: string; at: Date } | null> {
  if (!isUuid(documentId)) return null;
  const [row] = await db
    .select({ actorId: reviewEvents.actorId, at: reviewEvents.createdAt })
    .from(reviewEvents)
    .innerJoin(documents, eq(documents.id, reviewEvents.documentId))
    .where(and(eq(reviewEvents.documentId, documentId), eq(reviewEvents.action, 'approved'), isNotNull(reviewEvents.actorId), visibleTo(viewer)))
    .orderBy(desc(reviewEvents.createdAt))
    .limit(1);
  return row?.actorId ? { actorId: row.actorId, at: row.at } : null;
}

/**
 * Other Spaces linked to `spaceId` by links whose two ends the viewer may read, with how many such links, most
 * linked first. A link across Spaces is what makes two Spaces related (C10's "Space liên quan").
 */
export async function linkedSpaceCounts(db: Db, viewer: Viewer, spaceId: string): Promise<Array<{ spaceId: string; links: number }>> {
  if (!isUuid(spaceId)) return [];
  const source = alias(documents, 'source_doc');
  const target = alias(documents, 'target_doc');
  const readable = db.select({ id: documents.id }).from(documents).where(visibleTo(viewer));
  const rows = await db
    .select({ from: source.spaceId, to: target.spaceId, n: count() })
    .from(links)
    .innerJoin(source, eq(source.id, links.sourceId))
    .innerJoin(target, eq(target.id, links.targetId))
    .where(
      and(
        inArray(links.sourceId, readable),
        inArray(links.targetId, readable),
        ne(source.spaceId, target.spaceId),
        or(eq(source.spaceId, spaceId), eq(target.spaceId, spaceId)),
      ),
    )
    .groupBy(source.spaceId, target.spaceId);
  const totals = new Map<string, number>();
  for (const row of rows) {
    const other = row.from === spaceId ? row.to : row.from;
    totals.set(other, (totals.get(other) ?? 0) + Number(row.n));
  }
  return [...totals].map(([id, n]) => ({ spaceId: id, links: n })).sort((a, b) => b.links - a.links);
}
