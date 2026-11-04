/**
 * Keyword search over chunks, for one viewer. Guests search `kb_public`; an account also searches its own chunks
 * in `kb_private` (filtered by `authorId`); an admin searches `kb_private` unfiltered. Every hit is then checked
 * against Postgres with the same rule as every other read, so an index lagging behind a status change (hidden,
 * sent back to draft, deleted) never shows a document the viewer may no longer read.
 *
 * A query with Vietnamese diacritics is Telex-encoded and searched on `tx` only (exact diacritics); one without
 * is searched on the original text, where Meilisearch folds diacritics (every variant).
 */
import { and, inArray } from 'drizzle-orm';
import { z } from 'zod';
import type { Db } from '../db/client';
import { documents } from '../db/schema';
import type { FederatedQuery, MeiliClient } from '../search/meili-client';
import { PRIVATE_INDEX, PUBLIC_INDEX, TELEX_FIELD, TEXT_FIELDS, filterValue } from '../search/search-indexes';
import { hasDiacritics, toTelex } from '../search/telex';
import { isUuid } from './ids';
import type { Viewer } from './viewer';
import { visibleTo } from './visibility';

export const MAX_QUERY_LENGTH = 200;
const MAX_LIMIT = 50;

export interface SearchOptions {
  limit?: number;
  spaceId?: string;
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

export async function searchChunks(db: Db, meili: MeiliClient, viewer: Viewer, query: string, options: SearchOptions = {}): Promise<SearchHit[]> {
  const q = query.trim().slice(0, MAX_QUERY_LENGTH);
  if (!q) return [];
  if (options.spaceId !== undefined && !isUuid(options.spaceId)) return [];
  const limit = Math.min(Math.max(options.limit ?? 20, 1), MAX_LIMIT);
  const exact = hasDiacritics(q);
  const base = {
    q: exact ? toTelex(q) : q,
    attributesToSearchOn: exact ? [TELEX_FIELD] : TEXT_FIELDS,
  };
  const inSpace = options.spaceId ? `spaceId = ${filterValue(options.spaceId)}` : undefined;
  const queries: FederatedQuery[] = [{ ...base, indexUid: meili.uid(PUBLIC_INDEX), filter: inSpace }];
  if (viewer.kind === 'user') {
    const own = viewer.isAdmin ? undefined : `authorId = ${filterValue(viewer.userId)}`;
    queries.push({ ...base, indexUid: meili.uid(PRIVATE_INDEX), filter: allOf(own, inSpace) });
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
    .where(and(inArray(documents.id, documentIds), visibleTo(viewer)));
  const allowed = new Set(readable.map((row) => row.id));
  return hits.filter((hit) => allowed.has(hit.documentId));
}
