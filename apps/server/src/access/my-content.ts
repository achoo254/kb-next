/**
 * Reads and writes behind "Của tôi" (C08): the account's own documents, what it opened or edited lately, its
 * favourites and its trash, and the latest review word on its texts. Lists hold only documents the account may
 * read (src/access/visibility.ts), its trash only its own.
 */
import { and, desc, eq, inArray, isNotNull, max, sql } from 'drizzle-orm';
import type { Db } from '../db/client';
import { documentVersions, documents, favorites, readingProgress, reviewEvents } from '../db/schema';
import { type DocumentRow, documentColumns, findDocument } from './content';
import { isUuid } from './ids';
import type { Viewer } from './viewer';
import { visibleTo } from './visibility';

type UserViewer = Extract<Viewer, { kind: 'user' }>;

export interface MyDocumentFilter {
  type?: DocumentRow['type'];
  status?: DocumentRow['status'];
}

/** The account's own live documents, last changed first. */
export async function listMyDocuments(db: Db, viewer: UserViewer, filter: MyDocumentFilter = {}): Promise<DocumentRow[]> {
  return db
    .select(documentColumns)
    .from(documents)
    .where(
      and(
        visibleTo(viewer),
        eq(documents.authorId, viewer.userId),
        filter.type ? eq(documents.type, filter.type) : undefined,
        filter.status ? eq(documents.status, filter.status) : undefined,
      ),
    )
    .orderBy(desc(documents.updatedAt), desc(documents.id));
}

/** The account's documents in the trash, last deleted first. */
export async function listTrash(db: Db, viewer: UserViewer): Promise<DocumentRow[]> {
  return db
    .select(documentColumns)
    .from(documents)
    .where(and(eq(documents.authorId, viewer.userId), isNotNull(documents.deletedAt)))
    .orderBy(desc(documents.deletedAt), desc(documents.id));
}

export interface RecentEntry {
  doc: DocumentRow;
  /** When the account last read or saved it. */
  at: Date;
}

/** Readable documents the account read or edited, most recent first (C08 "Gần đây"). */
export async function listMyRecent(db: Db, viewer: UserViewer, limit: number): Promise<RecentEntry[]> {
  const read = await db
    .select({ id: readingProgress.documentId, at: readingProgress.updatedAt })
    .from(readingProgress)
    .where(eq(readingProgress.userId, viewer.userId))
    .orderBy(desc(readingProgress.updatedAt))
    .limit(limit * 2);
  const edited = await db
    .select({ id: documentVersions.documentId, at: max(documentVersions.updatedAt) })
    .from(documentVersions)
    .where(eq(documentVersions.editorId, viewer.userId))
    .groupBy(documentVersions.documentId)
    .orderBy(desc(max(documentVersions.updatedAt)))
    .limit(limit * 2);
  const latest = new Map<string, Date>();
  for (const { id, at } of [...read, ...edited]) {
    if (!at) continue;
    const seen = latest.get(id);
    if (!seen || seen < at) latest.set(id, at);
  }
  if (latest.size === 0) return [];
  const docs = await db
    .select(documentColumns)
    .from(documents)
    .where(and(visibleTo(viewer), inArray(documents.id, [...latest.keys()])));
  return docs
    .flatMap((doc) => {
      const at = latest.get(doc.id);
      return at ? [{ doc, at }] : [];
    })
    .sort((a, b) => b.at.getTime() - a.at.getTime())
    .slice(0, limit);
}

/** The account's favourites it may still read, last added first. */
export async function listFavorites(db: Db, viewer: UserViewer): Promise<Array<{ doc: DocumentRow; at: Date }>> {
  const rows = await db
    .select({ doc: documentColumns, at: favorites.createdAt })
    .from(favorites)
    .innerJoin(documents, eq(documents.id, favorites.documentId))
    .where(and(eq(favorites.userId, viewer.userId), visibleTo(viewer)))
    .orderBy(desc(favorites.createdAt));
  return rows;
}

/** Of the given documents, those the account marked as favourite. */
export async function favoriteIds(db: Db, userId: string, ids: readonly string[]): Promise<Set<string>> {
  const valid = [...new Set(ids.filter(isUuid))];
  if (valid.length === 0) return new Set();
  const rows = await db
    .select({ id: favorites.documentId })
    .from(favorites)
    .where(and(eq(favorites.userId, userId), inArray(favorites.documentId, valid)));
  return new Set(rows.map((r) => r.id));
}

/** Marks a readable document as favourite; false when the account may not read it. */
export async function addFavorite(db: Db, viewer: UserViewer, id: string, now: Date): Promise<boolean> {
  if (!(await findDocument(db, viewer, id))) return false;
  await db.insert(favorites).values({ userId: viewer.userId, documentId: id, createdAt: now }).onConflictDoNothing();
  return true;
}

export async function removeFavorite(db: Db, viewer: UserViewer, id: string): Promise<void> {
  if (!isUuid(id)) return;
  await db.delete(favorites).where(and(eq(favorites.userId, viewer.userId), eq(favorites.documentId, id)));
}

export interface LatestReview {
  action: (typeof reviewEvents.$inferSelect)['action'];
  reason: string | null;
  actorId: string | null;
  at: Date;
}

/** The latest review event of each given document the viewer may read (C08: why a text was sent back). */
export async function latestReviews(db: Db, viewer: Viewer, ids: readonly string[]): Promise<Map<string, LatestReview>> {
  const valid = [...new Set(ids.filter(isUuid))];
  if (valid.length === 0) return new Map();
  const rows = await db
    .selectDistinctOn([reviewEvents.documentId], {
      documentId: reviewEvents.documentId,
      action: reviewEvents.action,
      reason: reviewEvents.reason,
      actorId: reviewEvents.actorId,
      at: reviewEvents.createdAt,
    })
    .from(reviewEvents)
    .innerJoin(documents, eq(documents.id, reviewEvents.documentId))
    .where(and(inArray(reviewEvents.documentId, valid), visibleTo(viewer)))
    .orderBy(reviewEvents.documentId, desc(reviewEvents.createdAt), sql`${reviewEvents.id} desc`);
  return new Map(rows.map(({ documentId, ...review }) => [documentId, review]));
}
