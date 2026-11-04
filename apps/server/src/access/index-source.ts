/**
 * What the search indexes should hold, read from Postgres (the source of truth): which chunks go to `kb_public`
 * (isPublic) and which to `kb_private`. Documents in the trash go nowhere.
 */
import { and, asc, count, eq, gt, inArray, isNull } from 'drizzle-orm';
import type { Db } from '../db/client';
import { chunks, documents } from '../db/schema';
import { type IndexEntry, toIndexEntry } from '../search/search-indexes';
import { isPublic } from './visibility';

export interface IndexSplit {
  public: IndexEntry[];
  private: IndexEntry[];
}

/** Index entries of these documents; ids of deleted or unknown documents give none. */
export async function loadIndexEntries(db: Db, documentIds: readonly string[]): Promise<IndexSplit> {
  const split: IndexSplit = { public: [], private: [] };
  if (documentIds.length === 0) return split;
  const rows = await db
    .select({
      id: chunks.id,
      documentId: chunks.documentId,
      anchor: chunks.anchor,
      position: chunks.position,
      heading: chunks.heading,
      text: chunks.text,
      spaceId: documents.spaceId,
      collectionId: documents.collectionId,
      authorId: documents.authorId,
      lang: documents.lang,
      title: documents.title,
      status: documents.status,
      hidden: documents.hidden,
      deletedAt: documents.deletedAt,
    })
    .from(chunks)
    .innerJoin(documents, eq(documents.id, chunks.documentId))
    .where(and(inArray(chunks.documentId, [...documentIds]), isNull(documents.deletedAt)))
    .orderBy(asc(chunks.documentId), asc(chunks.position));
  for (const { status, hidden, deletedAt, ...source } of rows) {
    const entry = toIndexEntry(source);
    if (isPublic({ status, hidden, deletedAt, authorId: source.authorId })) split.public.push(entry);
    else split.private.push(entry);
  }
  return split;
}

/** Ids of every live document, in pages of `pageSize` (keyset on id), for a full rebuild. */
export async function* liveDocumentIdPages(db: Db, pageSize: number): AsyncGenerator<string[]> {
  let after: string | null = null;
  for (;;) {
    const rows: Array<{ id: string }> = await db
      .select({ id: documents.id })
      .from(documents)
      .where(and(isNull(documents.deletedAt), after ? gt(documents.id, after) : undefined))
      .orderBy(asc(documents.id))
      .limit(pageSize);
    if (rows.length === 0) return;
    yield rows.map((row) => row.id);
    after = rows[rows.length - 1]?.id ?? null;
  }
}

/** How many chunks each index should hold, for the daily drift check. */
export async function countIndexEntries(db: Db): Promise<{ public: number; private: number }> {
  const rows = await db
    .select({ status: documents.status, hidden: documents.hidden, n: count() })
    .from(chunks)
    .innerJoin(documents, eq(documents.id, chunks.documentId))
    .where(isNull(documents.deletedAt))
    .groupBy(documents.status, documents.hidden);
  const totals = { public: 0, private: 0 };
  for (const { n, ...doc } of rows) {
    if (isPublic({ ...doc, authorId: '', deletedAt: null })) totals.public += Number(n);
    else totals.private += Number(n);
  }
  return totals;
}
