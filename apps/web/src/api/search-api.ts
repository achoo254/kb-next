/**
 * Search (apps/server/src/api/search-routes.ts) as a typed call for C12 and the ⌘K palette (F01): keyword results
 * (Meilisearch) merged with results by meaning (Jev), one per text, grouped by Space. The answer is checked against
 * its schema here; a mismatch throws ApiError(BAD_RESPONSE).
 *
 * Errors (ApiError.code): `invalid-query` (400) for a filter value the server does not know; `rate-limited` (429);
 * `network` when the request got no answer (offline).
 */
import * as z from 'zod/mini';
import { ApiError, BAD_RESPONSE, apiFetch } from './api-client';
import { DOCUMENT_ORIGINS, DOCUMENT_STATUSES, DOCUMENT_TYPES, LANGS } from './content-api';

export const SEARCH_MODES = ['all', 'keyword', 'meaning'] as const;
export type SearchMode = (typeof SEARCH_MODES)[number];
/** C12 "Thời gian": any time, the last 7 or 30 days. */
export const SEARCH_TIMES = ['7d', '30d'] as const;
export type SearchTime = (typeof SEARCH_TIMES)[number];
/** The longest query the server reads (characters). */
export const MAX_QUERY_CHARS = 200;

const Lang = z.enum(LANGS);
const SourceState = z.enum(['ok', 'off', 'failed', 'skipped']);
/** `ok` ran; `off` not set up on this server; `failed` errored or timed out; `skipped` not asked for. */
export type SourceState = z.infer<typeof SourceState>;

const SpaceBriefSchema = z.object({ slug: z.string(), nameVi: z.string(), nameEn: z.string(), tint: z.string(), glow: z.string() });

const SearchResultSchema = z.object({
  id: z.string(),
  title: z.string(),
  type: z.enum(DOCUMENT_TYPES),
  origin: z.enum(DOCUMENT_ORIGINS),
  status: z.enum(DOCUMENT_STATUSES),
  lang: Lang,
  aiTranslated: z.boolean(),
  updatedAt: z.string(),
  authorName: z.nullable(z.string()),
  /** Every language the reader can read this text in. */
  translations: z.array(Lang),
  collectionId: z.nullable(z.string()),
  space: SpaceBriefSchema,
  readProgress: z.nullable(z.number()),
  collection: z.nullable(z.object({ id: z.string(), nameVi: z.string(), nameEn: z.string() })),
  /** The passage the excerpt comes from: open `/d/<id>#<anchor>`. */
  anchor: z.string(),
  heading: z.nullable(z.string()),
  /** The title with the query's words marked (F01 rows). */
  titleParts: z.array(z.object({ text: z.string(), hit: z.boolean() })),
  /** Plain text parts; `hit` marks the words the query matched (render as text, never HTML). */
  snippet: z.array(z.object({ text: z.string(), hit: z.boolean() })),
  /** `keyword`: "Khớp từ khoá"; `meaning`: "Theo nghĩa · Jev". */
  match: z.enum(['keyword', 'meaning']),
  /** How well Jev found the passage answers the query, 0–1; null when Jev did not rate it. */
  relevance: z.nullable(z.number()),
});
export type SearchResult = z.infer<typeof SearchResultSchema>;

const SearchGroupSchema = z.object({
  /** The Space with its kind and crystal art (/art/crystal-*.webp). */
  space: z.extend(SpaceBriefSchema, { kind: z.enum(['public', 'personal']), art: z.string() }),
  results: z.array(SearchResultSchema),
});
export type SearchGroup = z.infer<typeof SearchGroupSchema>;

export const SearchResponseSchema = z.object({
  query: z.string(),
  /** The query has diacritics and only those were searched ("Gõ có dấu"). */
  exact: z.boolean(),
  keyword: SourceState,
  meaning: SourceState,
  total: z.number(),
  groups: z.array(SearchGroupSchema),
  /** Results per origin before the origin filter ("Nguồn" counts). */
  origins: z.object({ official: z.number(), community: z.number(), own: z.number() }),
  /** With `exact`: texts every variant would add, and the variant words seen. */
  variants: z.nullable(z.object({ hidden: z.number(), words: z.array(z.string()) })),
  /** "Có phải bạn muốn". */
  suggestions: z.array(z.string()),
});
export type SearchResponse = z.infer<typeof SearchResponseSchema>;

export interface SearchParams {
  q: string;
  /** Space slugs; none: every Space. */
  spaces?: readonly string[];
  types?: readonly (typeof DOCUMENT_TYPES)[number][];
  /** The documents' language; none: both. */
  lang?: (typeof LANGS)[number];
  origins?: readonly (typeof DOCUMENT_ORIGINS)[number][];
  time?: SearchTime;
  mode?: SearchMode;
  /** Every diacritic variant of a query typed with diacritics ("Xem mọi biến thể"). */
  variants?: boolean;
}

/** The query string of a search (the API's and C12's address use the same parameters). */
export function searchQueryString(params: SearchParams): string {
  const query = new URLSearchParams({ q: params.q.slice(0, MAX_QUERY_CHARS) });
  // An empty list keeps nothing (every Space unticked); a missing one keeps everything.
  if (params.spaces) query.set('space', params.spaces.join(','));
  if (params.types?.length) query.set('type', params.types.join(','));
  if (params.lang) query.set('lang', params.lang);
  if (params.origins) query.set('origin', params.origins.join(','));
  if (params.time) query.set('time', params.time);
  if (params.mode && params.mode !== 'all') query.set('mode', params.mode);
  if (params.variants) query.set('variants', '1');
  return query.toString();
}

/** Searches; `signal` cancels a search the user has typed past. */
export async function searchKnowledge(params: SearchParams, signal?: AbortSignal): Promise<SearchResponse> {
  const res = await apiFetch(`/api/search?${searchQueryString(params)}`, { signal });
  const parsed = SearchResponseSchema.safeParse(await res.json().catch(() => undefined));
  if (!parsed.success) throw new ApiError(res.status, BAD_RESPONSE);
  return parsed.data;
}

/** Where a result opens: the reader at the passage found. */
export function resultHref(result: Pick<SearchResult, 'id' | 'anchor'>): string {
  return `/d/${encodeURIComponent(result.id)}#${encodeURIComponent(result.anchor)}`;
}
