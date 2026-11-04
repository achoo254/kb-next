/**
 * The layered search behind GET /api/search (C12, F01) and the Copilot (POST /api/ask): keyword search (Meilisearch,
 * src/access/search.ts) and, unless turned off, search by meaning (Jev, src/search/meaning-search.ts), each passage
 * found returned with its document read again through src/access/ for the same viewer. Neither source failing fails
 * the search: its state says `failed` (or `off` when not configured) and the other's passages still come back.
 */
import { type ChunkRow, type DocumentRow } from '../access/content';
import { findDocumentsByIds } from '../access/reading';
import { type DocumentSearchFilter, type SearchHit, firstPassages, listSearchableDocuments, passagesOf, searchChunks } from '../access/search';
import type { Viewer } from '../access/viewer';
import type { Db } from '../db/client';
import type { JevJudge } from '../jev/jev-client';
import { safeErrorText } from '../log-error';
import { type BilingualSummary, excerpt } from './document-summaries';
import { type MeaningCandidate, searchByMeaning } from './meaning-search';
import type { MeiliClient } from './meili-client';

/** Keyword hits read (chunks; several may belong to one text). */
const KEYWORD_HITS = 50;

/** `ok`: ran; `off`: not configured (no MEILI_URL, no TYPESAFE_API_KEY); `failed`: errored or timed out; `skipped`: not asked by `mode`. */
export type SourceState = 'ok' | 'off' | 'failed' | 'skipped';

export interface LayeredSearchDeps {
  db: Db;
  meili: MeiliClient | null;
  jev: JevJudge | null;
  /** Bilingual summaries of imported texts by translation group (src/search/document-summaries.ts). */
  summaries: ReadonlyMap<string, BilingualSummary>;
}

/** A passage found, with its readable document. */
export interface Found {
  doc: DocumentRow;
  chunk: Pick<ChunkRow, 'id' | 'anchor' | 'heading' | 'text'>;
  match: 'keyword' | 'meaning';
  /** How well Jev found the passage answers the query, 0–1; null when Jev did not rate it. */
  relevance: number | null;
}

/** One text in every language: its translation group, else the document itself. */
export const textKey = (doc: Pick<DocumentRow, 'id' | 'translationGroupId'>): string => doc.translationGroupId ?? doc.id;

/**
 * The candidates Jev chooses among: one document per text (the one keyword search found, else the original), texts
 * keyword search found first, then the other texts of their Spaces, then the rest, so the first 255 are the likeliest.
 */
export function orderCandidates(docs: readonly DocumentRow[], keywordDocIds: readonly string[]): DocumentRow[] {
  const keywordRank = new Map(keywordDocIds.map((id, i) => [id, i]));
  const groups = new Map<string, DocumentRow>();
  for (const doc of docs) {
    const key = textKey(doc);
    const current = groups.get(key);
    const better = !current || (keywordRank.has(doc.id) && !keywordRank.has(current.id)) || (!keywordRank.has(current.id) && current.aiTranslated && !doc.aiTranslated);
    if (better) groups.set(key, doc);
  }
  const texts = [...groups.values()];
  const hitSpaces = new Set(texts.filter((d) => keywordRank.has(d.id)).map((d) => d.spaceId));
  const tier = (d: DocumentRow): number => (keywordRank.has(d.id) ? 0 : hitSpaces.has(d.spaceId) ? 1 : 2);
  return texts
    .map((doc, order) => ({ doc, order }))
    .sort((a, b) => tier(a.doc) - tier(b.doc) || (keywordRank.get(a.doc.id) ?? 0) - (keywordRank.get(b.doc.id) ?? 0) || a.order - b.order)
    .map(({ doc }) => doc);
}

function candidateOf(doc: DocumentRow, summaries: ReadonlyMap<string, BilingualSummary>, first: ReadonlyMap<string, ChunkRow>): MeaningCandidate {
  const curated = doc.translationGroupId ? summaries.get(doc.translationGroupId) : undefined;
  if (curated) {
    return { documentId: doc.id, title: { vi: curated.vi.title, en: curated.en.title }, summary: { vi: curated.vi.summary, en: curated.en.summary } };
  }
  const passage = first.get(doc.id);
  return { documentId: doc.id, title: { [doc.lang]: doc.title }, summary: passage ? { [doc.lang]: excerpt(passage.text) } : {} };
}

/** Keyword hits (documents checked readable again) and the state of the keyword source. */
export async function keywordSearch(
  { db, meili }: LayeredSearchDeps,
  viewer: Viewer,
  q: string,
  filter: DocumentSearchFilter,
  allVariants: boolean,
): Promise<{ hits: SearchHit[]; state: SourceState }> {
  if (!meili) return { hits: [], state: 'off' };
  try {
    return { hits: await searchChunks(db, meili, viewer, q, { ...filter, allVariants, limit: KEYWORD_HITS }), state: 'ok' };
  } catch (error) {
    console.error('search: keyword search failed', safeErrorText(error));
    return { hits: [], state: 'failed' };
  }
}

export interface LayeredSearchResult {
  keyword: { hits: SearchHit[]; state: SourceState };
  /** Every keyword hit, in Meilisearch's order (several passages of a text may match). */
  keywordFound: Found[];
  /** Every passage Jev rated relevant, best first. */
  meaningFound: Found[];
  meaning: SourceState;
}

export async function layeredSearch(
  deps: LayeredSearchDeps,
  viewer: Viewer,
  q: string,
  filter: DocumentSearchFilter,
  options: { allVariants: boolean; meaning: boolean },
): Promise<LayeredSearchResult> {
  const { db, jev, summaries } = deps;
  // Keyword search always runs: its hits also order the candidates Jev chooses among.
  const keyword = await keywordSearch(deps, viewer, q, filter, options.allVariants);
  const keywordDocIds = [...new Set(keyword.hits.map((h) => h.documentId))];

  let meaning: SourceState = 'skipped';
  let meaningFound: Found[] = [];
  if (options.meaning) {
    if (!jev) meaning = 'off';
    else {
      const candidates = orderCandidates(await listSearchableDocuments(db, viewer, filter), keywordDocIds);
      const uncurated = candidates.filter((d) => !(d.translationGroupId && summaries.has(d.translationGroupId))).map((d) => d.id);
      const loaded = new Map<string, ChunkRow>();
      try {
        const first = await firstPassages(db, viewer, uncurated);
        const outcome = await searchByMeaning(
          jev,
          q,
          candidates.map((d) => candidateOf(d, summaries, first)),
          async (ids, perDocument) => {
            const rows = await passagesOf(db, viewer, ids, perDocument);
            for (const row of rows) loaded.set(row.id, row);
            return rows;
          },
        );
        const byId = new Map(candidates.map((d) => [d.id, d]));
        meaningFound = outcome.hits.flatMap((hit): Found[] => {
          const doc = byId.get(hit.documentId);
          const chunk = loaded.get(hit.chunkId);
          return doc && chunk ? [{ doc, chunk, match: 'meaning', relevance: hit.relevance }] : [];
        });
        meaning = 'ok';
      } catch (error) {
        console.error('search: Jev unavailable, keyword results only', safeErrorText(error));
        meaning = 'failed';
      }
    }
  }

  // Every document named by a hit is read again through src/access/ for this viewer before it is answered.
  const docs = new Map((await findDocumentsByIds(db, viewer, [...keywordDocIds, ...meaningFound.map((f) => f.doc.id)])).map((d) => [d.id, d]));
  const keywordFound = keyword.hits.flatMap((hit): Found[] => {
    const doc = docs.get(hit.documentId);
    return doc ? [{ doc, chunk: { id: hit.chunkId, anchor: hit.anchor, heading: hit.heading, text: hit.text }, match: 'keyword', relevance: null }] : [];
  });
  return {
    keyword,
    keywordFound,
    meaningFound: meaningFound.flatMap((f) => {
      const doc = docs.get(f.doc.id);
      return doc ? [{ ...f, doc }] : [];
    }),
    meaning,
  };
}
