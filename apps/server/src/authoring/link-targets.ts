/**
 * Which document a `[[ ]]` title points at, among candidates: an exact title first (case and diacritics aside), else
 * a title holding the words as a whole, the official, published, same-language and shortest one first. Saving a
 * document (src/access/authoring.ts) resolves its links with it; the reader (C11) replays it over the links a
 * document already has, to know which written title is which link.
 */
import type { DocumentRow } from '../access/content';
import { foldTitle } from './markdown-text';

export type LinkCandidate = Pick<DocumentRow, 'id' | 'title' | 'origin' | 'status' | 'lang'>;

export const ORIGIN_RANK: Record<DocumentRow['origin'], number> = { official: 0, community: 1, own: 2 };

function escapeRegExp(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/** The candidate `title` resolves to, or null when none matches it. */
export function bestLinkTarget<T extends LinkCandidate>(title: string, candidates: readonly T[], lang: DocumentRow['lang']): T | null {
  const want = foldTitle(title);
  if (!want) return null;
  const word = new RegExp(`(^|[^\\p{L}\\p{N}])${escapeRegExp(want)}($|[^\\p{L}\\p{N}])`, 'u');
  const matching = candidates.map((row) => ({ row, fold: foldTitle(row.title) })).filter(({ fold }) => fold === want || word.test(fold));
  matching.sort(
    (a, b) =>
      Number(b.fold === want) - Number(a.fold === want) ||
      ORIGIN_RANK[a.row.origin] - ORIGIN_RANK[b.row.origin] ||
      Number(b.row.status === 'approved') - Number(a.row.status === 'approved') ||
      Number(b.row.lang === lang) - Number(a.row.lang === lang) ||
      a.row.title.length - b.row.title.length,
  );
  return matching[0]?.row ?? null;
}
