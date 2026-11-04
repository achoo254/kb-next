/**
 * Keyword search over chunks, for one viewer. Guests search `kb_public`; an account also searches its own chunks
 * in `kb_private` (filtered by `authorId`); an admin searches `kb_private` unfiltered. Every hit is then checked
 * against Postgres with the same rule as every other read, so an index lagging behind a status change (hidden,
 * sent back to draft, deleted) never shows a document the viewer may no longer read.
 *
 * A query with Vietnamese diacritics is Telex-encoded and searched on `tx` only (exact diacritics); one without
 * is searched on the original text, where Meilisearch folds diacritics (every variant).
 */
import { type SQL, and, asc, eq, gte, inArray } from 'drizzle-orm';
import { z } from 'zod';
import type { Db } from '../db/client';
import { chunks, documentOrigin, documentType, documents } from '../db/schema';
import type { FederatedQuery, MeiliClient } from '../search/meili-client';
import { PRIVATE_INDEX, PUBLIC_INDEX, TELEX_FIELD, TEXT_FIELDS, filterValue } from '../search/search-indexes';
import { hasDiacritics, toTelex } from '../search/telex';
import { type ChunkRow, type DocumentRow, documentColumns } from './content';
import { isUuid } from './ids';
import type { Viewer } from './viewer';
import { visibleTo } from './visibility';

export const MAX_QUERY_LENGTH = 200;
const MAX_LIMIT = 50;

export type DocumentType = (typeof documentType.enumValues)[number];
export type DocumentOrigin = (typeof documentOrigin.enumValues)[number];

/** Which documents a search looks at (C12's filters); every field left out means "any". */
export interface DocumentSearchFilter {
  spaceIds?: readonly string[];
  lang?: 'vi' | 'en';
  types?: readonly DocumentType[];
  origins?: readonly DocumentOrigin[];
  /** Only documents updated at or after this time (C12 "Thời gian"). */
  updatedSince?: Date;
}

export interface SearchOptions extends DocumentSearchFilter {
  limit?: number;
  spaceId?: string;
  /** Search every diacritic variant even when the query has diacritics (C12 "Xem mọi biến thể"). */
  allVariants?: boolean;
}

export interface SearchHit {
  chunkId: string;
  documentId: string;
  spaceId: string;
  title: string;
  anchor: string;
  position: number;
  heading: string | null;
  text: string;
  lang: 'vi' | 'en';
}

const Hit = z.object({
  id: z.string(),
  documentId: z.string(),
  spaceId: z.string(),
  title: z.string(),
  anchor: z.string(),
  position: z.number(),
  heading: z.string().nullable(),
  text: z.string(),
  lang: z.enum(['vi', 'en']),
});

function allOf(...filters: Array<string | undefined>): string | undefined {
  const present = filters.filter((f): f is string => f !== undefined);
  return present.length > 0 ? present.join(' AND ') : undefined;
}

/** The filter's conditions on the `documents` table (visibility is added by each caller). */
function documentFilter(filter: DocumentSearchFilter): SQL | undefined {
  return and(
    filter.spaceIds ? inArray(documents.spaceId, [...filter.spaceIds]) : undefined,
    filter.lang ? eq(documents.lang, filter.lang) : undefined,
    filter.types ? inArray(documents.type, [...filter.types]) : undefined,
    filter.origins ? inArray(documents.origin, [...filter.origins]) : undefined,
    filter.updatedSince ? gte(documents.updatedAt, filter.updatedSince) : undefined,
  );
}

/** A filter that can match nothing: an empty list, or a Space id that is not one. */
function matchesNothing(filter: DocumentSearchFilter): boolean {
  if (filter.spaceIds && (filter.spaceIds.length === 0 || !filter.spaceIds.every(isUuid))) return true;
  return filter.types?.length === 0 || filter.origins?.length === 0;
}

export async function searchChunks(db: Db, meili: MeiliClient, viewer: Viewer, query: string, options: SearchOptions = {}): Promise<SearchHit[]> {
  const q = query.trim().slice(0, MAX_QUERY_LENGTH);
  if (!q) return [];
  if (options.spaceId !== undefined && !isUuid(options.spaceId)) return [];
  if (matchesNothing(options)) return [];
  const limit = Math.min(Math.max(options.limit ?? 20, 1), MAX_LIMIT);
  const exact = hasDiacritics(q) && !options.allVariants;
  const base = {
    q: exact ? toTelex(q) : q,
    attributesToSearchOn: exact ? [TELEX_FIELD] : TEXT_FIELDS,
  };
  const spaceIds = [...(options.spaceId ? [options.spaceId] : []), ...(options.spaceIds ?? [])];
  const inSpace = spaceIds.length > 0 ? `spaceId IN [${spaceIds.map(filterValue).join(', ')}]` : undefined;
  const inLang = options.lang ? `lang = ${filterValue(options.lang)}` : undefined;
  const queries: FederatedQuery[] = [{ ...base, indexUid: meili.uid(PUBLIC_INDEX), filter: allOf(inSpace, inLang) }];
  if (viewer.kind === 'user') {
    const own = viewer.isAdmin ? undefined : `authorId = ${filterValue(viewer.userId)}`;
    queries.push({ ...base, indexUid: meili.uid(PRIVATE_INDEX), filter: allOf(own, inSpace, inLang) });
  }

  const raw = await meili.federatedSearch(queries, limit);
  const seen = new Set<string>();
  const hits: SearchHit[] = [];
  for (const item of raw) {
    const parsed = Hit.safeParse(item);
    if (!parsed.success || seen.has(parsed.data.id)) continue;
    seen.add(parsed.data.id);
    const { id, ...rest } = parsed.data;
    hits.push({ chunkId: id, ...rest });
  }
  const documentIds = [...new Set(hits.map((hit) => hit.documentId))].filter(isUuid);
  if (documentIds.length === 0) return [];
  const readable = await db
    .select({ id: documents.id })
    .from(documents)
    .where(and(inArray(documents.id, documentIds), visibleTo(viewer), documentFilter(options)));
  const allowed = new Set(readable.map((row) => row.id));
  return hits.filter((hit) => allowed.has(hit.documentId));
}

/** Readable documents matching `filter`, in their Spaces' reading order: what a search by meaning chooses among. */
export async function listSearchableDocuments(db: Db, viewer: Viewer, filter: DocumentSearchFilter = {}): Promise<DocumentRow[]> {
  if (matchesNothing(filter)) return [];
  return db
    .select(documentColumns)
    .from(documents)
    .where(and(visibleTo(viewer), documentFilter(filter)))
    .orderBy(asc(documents.spaceId), asc(documents.sortOrder), asc(documents.createdAt));
}

/** The readable ones of `documentIds`, as a subquery (chunks are read only through it). */
function readableIds(db: Db, viewer: Viewer, documentIds: readonly string[]) {
  return db
    .select({ id: documents.id })
    .from(documents)
    .where(and(visibleTo(viewer), inArray(documents.id, [...documentIds])));
}

/** The first passage of each readable document of `documentIds` (what stands in for a summary). */
export async function firstPassages(db: Db, viewer: Viewer, documentIds: readonly string[]): Promise<Map<string, ChunkRow>> {
  const ids = [...new Set(documentIds.filter(isUuid))];
  if (ids.length === 0) return new Map();
  const rows = await db
    .selectDistinctOn([chunks.documentId])
    .from(chunks)
    .where(inArray(chunks.documentId, readableIds(db, viewer, ids)))
    .orderBy(chunks.documentId, asc(chunks.position));
  return new Map(rows.map((row) => [row.documentId, row]));
}

/** The passages of the readable documents of `documentIds`, in order, at most `perDocument` of each. */
export async function passagesOf(db: Db, viewer: Viewer, documentIds: readonly string[], perDocument: number): Promise<ChunkRow[]> {
  const ids = [...new Set(documentIds.filter(isUuid))];
  if (ids.length === 0) return [];
  const rows = await db
    .select()
    .from(chunks)
    .where(inArray(chunks.documentId, readableIds(db, viewer, ids)))
    .orderBy(asc(chunks.documentId), asc(chunks.position));
  const taken = new Map<string, number>();
  return rows.filter((row) => {
    const n = taken.get(row.documentId) ?? 0;
    taken.set(row.documentId, n + 1);
    return n < perDocument;
  });
}
