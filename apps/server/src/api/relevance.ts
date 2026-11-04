/**
 * How related two documents are, 0–100, computed in code from what the data says (no model): a link between them,
 * neighbours they share, being in the same collection or Space, and words their titles and headings share. Same
 * inputs, same number, so the related lists of C11 never reshuffle on their own.
 */

export interface RelevanceFeatures {
  id: string;
  spaceId: string;
  collectionId: string | null;
  /** Distinct folded words of the title and passage headings (see `termsOf`). */
  terms: ReadonlySet<string>;
}

const LINKED = 40;
const PER_SHARED_NEIGHBOUR = 10;
const MAX_SHARED_NEIGHBOURS = 20;
const SAME_COLLECTION = 20;
const SAME_SPACE = 10;
const SHARED_TERMS = 30;

/** Words too common to say two texts are about the same thing. */
const STOPWORDS = new Set(['cac', 'cho', 'cua', 'khi', 'mot', 'nao', 'nhung', 'the', 'thi', 'trong', 'tren', 'va', 'voi', 'and', 'for', 'from', 'how', 'what', 'with', 'your']);

/** Folded words (no diacritics, lowercase, at least 3 letters, no stopwords) of some texts. */
export function termsOf(texts: readonly string[]): Set<string> {
  const terms = new Set<string>();
  for (const text of texts) {
    const folded = text.normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[đĐ]/g, 'd').toLowerCase();
    for (const word of folded.split(/[^a-z0-9]+/)) {
      if (word.length >= 3 && !STOPWORDS.has(word)) terms.add(word);
    }
  }
  return terms;
}

function jaccard(a: ReadonlySet<string>, b: ReadonlySet<string>): number {
  if (a.size === 0 || b.size === 0) return 0;
  let shared = 0;
  for (const term of a) if (b.has(term)) shared += 1;
  return shared / (a.size + b.size - shared);
}

/** Neighbours (linked documents, either direction) of each document, from [source, target] pairs. */
export function neighbours(pairs: ReadonlyArray<readonly [string, string]>): Map<string, Set<string>> {
  const map = new Map<string, Set<string>>();
  const add = (from: string, to: string): void => {
    const set = map.get(from);
    if (set) set.add(to);
    else map.set(from, new Set([to]));
  };
  for (const [source, target] of pairs) {
    add(source, target);
    add(target, source);
  }
  return map;
}

export function relevance(a: RelevanceFeatures, b: RelevanceFeatures, graph: ReadonlyMap<string, ReadonlySet<string>>): number {
  const aNear = graph.get(a.id) ?? new Set<string>();
  const bNear = graph.get(b.id) ?? new Set<string>();
  let shared = 0;
  for (const id of aNear) if (id !== b.id && bNear.has(id)) shared += 1;
  const place = a.collectionId !== null && a.collectionId === b.collectionId ? SAME_COLLECTION : a.spaceId === b.spaceId ? SAME_SPACE : 0;
  const score =
    (aNear.has(b.id) ? LINKED : 0) + Math.min(MAX_SHARED_NEIGHBOURS, shared * PER_SHARED_NEIGHBOUR) + place + Math.round(SHARED_TERMS * jaccard(a.terms, b.terms));
  return Math.min(100, score);
}

/** How related a Space is to another from the links between their documents: 0 without any. */
export function spaceRelevance(links: number): number {
  return links === 0 ? 0 : Math.min(100, 50 + 10 * links);
}
