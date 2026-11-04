/**
 * GET /api/search (C12, F01): keyword search (Meilisearch, src/access/search.ts) merged with search by meaning
 * (Jev, src/search/meaning-search.ts), one result per text, grouped by Space, each with a highlighted excerpt and
 * how it was found (`keyword` or `meaning`). Every document comes through src/access/ for the viewer of the session
 * (a guest without one) and is checked again before it is answered.
 *
 * Query: `q` (≤ 200 characters); filters `space` (slugs), `type`, `lang` (the document's language), `origin`, `time`
 * (`7d`, `30d`), each list comma-separated or repeated; `mode` (`all`, `keyword`, `meaning`); `variants=1` to search
 * every diacritic variant of a query typed with diacritics. Jev failing or slow never fails the search: the answer
 * says `meaning: 'failed'` and carries the keyword results. No cap on Jev requests; a rate limit per account (per
 * address for guests) keeps the endpoint from being abused.
 */
import express, { type Router } from 'express';
import { ipKeyGenerator, rateLimit } from 'express-rate-limit';
import { z } from 'zod';
import { type SpaceRow, listSpaces } from '../access/content';
import { progressOf } from '../access/participation';
import { findDocumentsByIds, listCollectionsOf, listTranslationsOf, userNames } from '../access/reading';
import { type DocumentOrigin, type DocumentSearchFilter, MAX_QUERY_LENGTH } from '../access/search';
import { type Viewer, viewerFor } from '../access/viewer';
import { findUserId } from '../auth/require-user';
import type { ServerConfig } from '../config';
import type { Db } from '../db/client';
import { documentOrigin, documentType } from '../db/schema';
import type { JevJudge } from '../jev/jev-client';
import type { BilingualSummary } from '../search/document-summaries';
import { type Found, type SourceState, keywordSearch, layeredSearch, textKey } from '../search/layered-search';
import type { MeiliClient } from '../search/meili-client';
import { type SnippetPart, foldVietnamese, snippet, variantWords } from '../search/snippet';
import { hasDiacritics } from '../search/telex';
import { type CollectionBrief, type DocumentSummary, type Lang, type SpaceBrief, collectionBrief, documentSummary, langsOf, spaceBrief } from './content-views';
import { parseQuery } from './validate';

/** Results answered at most (one per text). */
export const MAX_RESULTS = 30;
/** Query suggestions ("Có phải bạn muốn"). */
const MAX_SUGGESTIONS = 2;
const DAY_MS = 24 * 60 * 60 * 1000;
/** Titles are never cut. */
const MAX_TITLE_CHARS = 1_000;

export type SearchMode = 'all' | 'keyword' | 'meaning';
export type { SourceState };

export interface SearchResult extends DocumentSummary {
  collection: CollectionBrief | null;
  /** The passage the excerpt comes from (`/d/<id>#<anchor>`). */
  anchor: string;
  heading: string | null;
  /** The title with the words the query matched marked (F01 rows). */
  titleParts: SnippetPart[];
  snippet: SnippetPart[];
  /** `keyword`: Meilisearch found it ("Khớp từ khoá"); `meaning`: only Jev did ("Theo nghĩa · Jev"). */
  match: 'keyword' | 'meaning';
  /** How well Jev found the passage answers the query, 0–1; null when Jev did not rate it. */
  relevance: number | null;
}

export interface SearchGroup {
  /** The Space, with its kind and crystal art (the palette's preview). */
  space: SpaceBrief & { kind: SpaceRow['kind']; art: string };
  results: SearchResult[];
}

export interface SearchResponse {
  query: string;
  /** The query has diacritics and only those exact ones were searched (C12 "Gõ có dấu"). */
  exact: boolean;
  keyword: SourceState;
  meaning: SourceState;
  /** Results in all groups. */
  total: number;
  /** In order of their best result. */
  groups: SearchGroup[];
  /** Results per origin before the `origin` filter (C12 "Nguồn" counts). */
  origins: Record<DocumentOrigin, number>;
  /** With `exact`: texts the variants would add and the variant words seen ("mang", "màng"); null otherwise. */
  variants: { hidden: number; words: string[] } | null;
  /** Other ways to ask, from the headings and titles found ("DHCP lease"). */
  suggestions: string[];
}

const list = <T extends string>(values: readonly [T, ...T[]]) =>
  z
    .union([z.string(), z.array(z.string())])
    .optional()
    .transform((raw) => (raw === undefined ? undefined : (Array.isArray(raw) ? raw : [raw]).flatMap((v) => v.split(',')).map((v) => v.trim()).filter(Boolean)))
    .pipe(z.array(z.enum(values)).optional());

const SLUG = /^[a-z0-9][a-z0-9-]{0,119}$/;

const SearchQuery = z.object({
  q: z.string().max(MAX_QUERY_LENGTH * 2).optional().default(''),
  space: z
    .union([z.string(), z.array(z.string())])
    .optional()
    .transform((raw) => (raw === undefined ? undefined : (Array.isArray(raw) ? raw : [raw]).flatMap((v) => v.split(',')).map((v) => v.trim()).filter(Boolean)))
    .pipe(z.array(z.string().regex(SLUG)).max(50).optional()),
  type: list(documentType.enumValues),
  lang: z.enum(['vi', 'en']).optional(),
  origin: list(documentOrigin.enumValues),
  time: z.enum(['7d', '30d']).optional(),
  mode: z.enum(['all', 'keyword', 'meaning']).optional().default('all'),
  variants: z.enum(['0', '1']).optional(),
});

export interface SearchRoutesOptions {
  config: ServerConfig;
  db: Db;
  now: () => Date;
  meili: MeiliClient | null;
  jev: JevJudge | null;
  /** Bilingual summaries of imported texts by translation group (src/search/document-summaries.ts). */
  summaries: ReadonlyMap<string, BilingualSummary>;
}

/** A passage Jev rated at least this well (it "directly answers") ranks above texts only keyword search found. */
export const STRONG_RELEVANCE = 0.9;

/**
 * Keyword and meaning hits as one list, one per text: found by both (best rated first), then found by meaning only
 * and rated STRONG_RELEVANCE or more, then by keyword only (in Meilisearch's order), then the other meaning-only ones
 * (best rated first): a question in another language matches stray words, Jev's direct answer goes first. `keyword` holds every keyword hit (several passages
 * of a text may match). A text found by both shows the passage Jev rated best; it reads "Khớp từ khoá" when that
 * passage also matched the keywords, "Theo nghĩa" otherwise.
 */
export function mergeResults(keyword: readonly Found[], meaning: readonly Found[]): Found[] {
  const rated = new Map<string, Found>();
  for (const m of meaning) if (!rated.has(textKey(m.doc))) rated.set(textKey(m.doc), m);
  const keywordChunks = new Set(keyword.map((k) => k.chunk.id));
  const both: Found[] = [];
  const keywordOnly: Found[] = [];
  const seen = new Set<string>();
  for (const k of keyword) {
    const key = textKey(k.doc);
    if (seen.has(key)) continue;
    seen.add(key);
    const m = rated.get(key);
    if (m) both.push({ ...m, match: keywordChunks.has(m.chunk.id) ? 'keyword' : 'meaning' });
    else keywordOnly.push(k);
  }
  both.sort((a, b) => (b.relevance ?? 0) - (a.relevance ?? 0));
  const meaningOnly = [...rated.values()].filter((m) => !seen.has(textKey(m.doc)));
  const strong = meaningOnly.filter((m) => (m.relevance ?? 0) >= STRONG_RELEVANCE);
  const weak = meaningOnly.filter((m) => (m.relevance ?? 0) < STRONG_RELEVANCE);
  return [...both, ...strong, ...keywordOnly, ...weak];
}

/** "Có phải bạn muốn": headings (else titles) of the results that say something else than the query. */
export function suggestionsOf(found: readonly Found[], query: string): string[] {
  const asked = foldVietnamese(query.trim());
  const out: string[] = [];
  for (const f of found) {
    for (const candidate of [f.chunk.heading, f.doc.title]) {
      if (!candidate) continue;
      const folded = foldVietnamese(candidate);
      if (folded === asked || out.some((s) => foldVietnamese(s) === folded)) continue;
      out.push(candidate);
      break;
    }
    if (out.length >= MAX_SUGGESTIONS) break;
  }
  return out;
}

export function searchRoutes({ config, db, now, meili, jev, summaries }: SearchRoutesOptions): Router {
  const router = express.Router();

  const viewerOf = async (req: express.Request): Promise<Viewer> => viewerFor(db, config.adminSubs, await findUserId(req, config, db, now()));

  // No cap on Jev requests (owner's decision, 04/11/2026): only a per-account (per-address for guests) limit
  // against abuse of the shared API.
  const searchLimit = rateLimit({
    windowMs: 60 * 1000,
    limit: config.searchLimitPerMinute,
    standardHeaders: 'draft-8',
    legacyHeaders: false,
    message: { error: 'rate-limited' },
    keyGenerator: async (req) => {
      const userId = await findUserId(req, config, db, now());
      return userId ? `user:${userId}` : `ip:${ipKeyGenerator(req.ip ?? '')}`;
    },
  });

  const deps = { db, meili, jev, summaries };

  router.get('/api/search', searchLimit, async (req, res) => {
    const query = parseQuery(SearchQuery, req.query);
    const q = query.q.trim().slice(0, MAX_QUERY_LENGTH);
    const viewer = await viewerOf(req);
    const visibleSpaces = await listSpaces(db, viewer);
    const spaceIds = query.space?.map((slug) => visibleSpaces.find((s) => s.slug === slug)?.id).filter((id): id is string => id !== undefined);
    const filter: DocumentSearchFilter = {
      spaceIds,
      types: query.type,
      lang: query.lang,
      updatedSince: query.time ? new Date(now().getTime() - (query.time === '7d' ? 7 : 30) * DAY_MS) : undefined,
    };
    const allVariants = query.variants === '1';
    const exact = hasDiacritics(q) && !allVariants;
    const empty: SearchResponse = {
      query: q,
      exact,
      keyword: 'skipped',
      meaning: 'skipped',
      total: 0,
      groups: [],
      origins: { official: 0, community: 0, own: 0 },
      variants: null,
      suggestions: [],
    };
    if (!q) {
      res.set('Cache-Control', 'no-store').json(empty);
      return;
    }

    const { keyword, keywordFound, meaningFound, meaning: meaningState } = await layeredSearch(deps, viewer, q, filter, {
      allVariants,
      meaning: query.mode !== 'keyword',
    });
    const keywordDocIds = [...new Set(keyword.hits.map((h) => h.documentId))];
    const merged = mergeResults(query.mode === 'meaning' ? [] : keywordFound, meaningFound);
    const origins: Record<DocumentOrigin, number> = { official: 0, community: 0, own: 0 };
    for (const f of merged) origins[f.doc.origin] += 1;
    const found = merged.filter((f) => !query.origin || query.origin.includes(f.doc.origin)).slice(0, MAX_RESULTS);

    let variants: SearchResponse['variants'] = null;
    if (exact && keyword.state === 'ok' && query.mode !== 'meaning') {
      const folded = await keywordSearch(deps, viewer, q, filter, true);
      const shown = new Set(found.map((f) => textKey(f.doc)));
      const extra = folded.hits.filter((h) => !keywordDocIds.includes(h.documentId));
      const extraDocs = await findDocumentsByIds(
        db,
        viewer,
        extra.map((h) => h.documentId),
      );
      const hiddenTexts = new Set(extraDocs.filter((d) => !shown.has(textKey(d))).map(textKey));
      variants = {
        hidden: hiddenTexts.size,
        words: variantWords(
          extra.map((h) => h.text),
          q,
        ),
      };
    }

    const docList = found.map((f) => f.doc);
    const spaceRows = new Map<string, SpaceRow>(visibleSpaces.map((s) => [s.id, s]));
    const [collections, authors, translations, progress] = await Promise.all([
      listCollectionsOf(db, [...new Set(docList.map((d) => d.spaceId))]),
      userNames(
        db,
        docList.map((d) => d.authorId),
      ),
      listTranslationsOf(
        db,
        viewer,
        docList.flatMap((d) => (d.translationGroupId ? [d.translationGroupId] : [])),
      ),
      viewer.kind === 'user'
        ? progressOf(
            db,
            viewer.userId,
            docList.map((d) => d.id),
          )
        : Promise.resolve(null),
    ]);
    const collectionById = new Map(collections.map((c) => [c.id, c]));

    const groups: SearchGroup[] = [];
    for (const f of found) {
      const space = spaceRows.get(f.doc.spaceId);
      if (!space) continue;
      const group = f.doc.translationGroupId ? translations.filter((d) => d.translationGroupId === f.doc.translationGroupId) : [f.doc];
      const langs: Lang[] = langsOf(group.length > 0 ? group : [f.doc]);
      const read = progress ? (progress.get(f.doc.id)?.progress ?? 0) : null;
      const collection = f.doc.collectionId ? collectionById.get(f.doc.collectionId) : undefined;
      const result: SearchResult = {
        ...documentSummary(f.doc, langs, space, authors.get(f.doc.authorId) ?? null, read),
        collection: collection ? collectionBrief(collection) : null,
        anchor: f.chunk.anchor,
        heading: f.chunk.heading,
        titleParts: snippet(f.doc.title, q, exact, MAX_TITLE_CHARS),
        snippet: snippet(f.chunk.text, q, exact),
        match: f.match,
        relevance: f.relevance,
      };
      const existing = groups.find((g) => g.space.slug === space.slug);
      if (existing) existing.results.push(result);
      else groups.push({ space: { ...spaceBrief(space), kind: space.kind, art: space.art }, results: [result] });
    }

    const body: SearchResponse = {
      ...empty,
      keyword: query.mode === 'meaning' && keyword.state === 'ok' ? 'skipped' : keyword.state,
      meaning: meaningState,
      total: groups.reduce((n, g) => n + g.results.length, 0),
      groups,
      origins,
      variants,
      suggestions: suggestionsOf(found, q),
    };
    res.set('Cache-Control', 'no-store').json(body);
  });

  return router;
}
