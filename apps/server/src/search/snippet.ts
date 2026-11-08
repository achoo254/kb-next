/**
 * The highlighted excerpt of a search result (C12, F01): the part of a passage around the first word the query
 * matches, cut to a line or two, as plain-text parts with the matched words marked. Matching follows the keyword
 * search: a query typed with Vietnamese diacritics matches those exact diacritics, one without matches every variant
 * ("mang" marks "mạng", "màng"); the last query word also matches as a prefix (search-as-you-type).
 */

export interface SnippetPart {
  text: string;
  /** A word (or run of words) the query matched. */
  hit: boolean;
}

/** Characters of an excerpt, about two lines of a C12 result. */
export const SNIPPET_CHARS = 160;
/** Context kept before the first match. */
const LEAD_CHARS = 48;

const WORD = /[\p{L}\p{N}]+/gu;

/** Lower case without diacritics (đ → d): "Mạng" and "màng" both fold to "mang". */
export function foldVietnamese(text: string): string {
  return text.normalize('NFD').replace(/\p{M}/gu, '').replace(/đ/gi, 'd').toLowerCase();
}

/** The words of a query, in order, without repeats (as typed, lower case). */
export function queryTerms(query: string): string[] {
  return [...new Set((query.normalize('NFC').match(WORD) ?? []).map((word) => word.toLowerCase()))];
}

/** A passage's Markdown as one line of plain text (code fences, marks and link syntax dropped). */
export function plainText(markdown: string): string {
  return markdown
    .normalize('NFC')
    .replace(/```[\s\S]*?```/g, ' ')
    .replace(/\[!(?:TLDR|WARNING)\]/gi, ' ')
    .replace(/!\[[^\]]*\]\([^)]*\)/g, ' ')
    .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/\[\[([^\]|]*)(\|[^\]]*)?\]\]/g, '$1')
    .replace(/[#>*_`|]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Whether `word` (from the text) is matched by the query `term`. `exact`: diacritics must match too. */
function matches(word: string, term: string, exact: boolean, prefix: boolean): boolean {
  const a = exact ? word.toLowerCase() : foldVietnamese(word);
  const b = exact ? term : foldVietnamese(term);
  return a === b || (prefix && b.length >= 2 && a.startsWith(b));
}

interface WordSpan {
  start: number;
  end: number;
  hit: boolean;
}

function wordSpans(text: string, terms: readonly string[], exact: boolean): WordSpan[] {
  const last = terms.length - 1;
  return [...text.matchAll(WORD)].map((m) => {
    const word = m[0];
    const start = m.index;
    return { start, end: start + word.length, hit: terms.some((term, i) => matches(word, term, exact, i === last)) };
  });
}

/**
 * The excerpt of `markdown` for `query`: around the first matched word (else the start), at most `max` characters
 * cut at word boundaries with "…" where cut, matched words (and the spaces between adjacent ones) marked.
 */
export function snippet(markdown: string, query: string, exact: boolean, max: number = SNIPPET_CHARS): SnippetPart[] {
  const text = plainText(markdown);
  const spans = wordSpans(text, queryTerms(query), exact);
  const first = spans.find((span) => span.hit);
  let from = 0;
  if (first && first.start > LEAD_CHARS) {
    const lead = spans.find((span) => span.start >= first.start - LEAD_CHARS);
    from = lead ? lead.start : first.start;
  }
  let to = Math.min(text.length, from + max);
  if (to < text.length) {
    const lastWhole = spans.filter((span) => span.start >= from && span.end <= to).at(-1);
    if (lastWhole) to = lastWhole.end;
  }

  const parts: SnippetPart[] = [];
  const push = (part: string, hit: boolean): void => {
    if (!part) return;
    const previous = parts.at(-1);
    if (previous && previous.hit === hit) previous.text += part;
    else parts.push({ text: part, hit });
  };
  if (from > 0) push('…', false);
  let cursor = from;
  const inside = spans.filter((span) => span.start >= from && span.end <= to);
  inside.forEach((span, i) => {
    const gap = text.slice(cursor, span.start);
    // A space between two matched words stays inside the mark: "cấp phát IP" is one highlight.
    const joinsHits = span.hit && i > 0 && inside[i - 1]?.hit === true && /^\s+$/.test(gap);
    push(gap, joinsHits);
    push(text.slice(span.start, span.end), span.hit);
    cursor = span.end;
  });
  push(text.slice(cursor, to), false);
  if (to < text.length) push('…', false);
  return parts;
}

/**
 * Words of `texts` that a query typed with diacritics did not match but would without them ("mang", "màng" for
 * "mạng"), lower case, at most `limit`, in order of appearance.
 */
export function variantWords(texts: readonly string[], query: string, limit = 3): string[] {
  const terms = queryTerms(query);
  const found: string[] = [];
  for (const text of texts) {
    for (const m of plainText(text).matchAll(WORD)) {
      const word = m[0].toLowerCase();
      if (found.includes(word) || terms.includes(word)) continue;
      if (terms.some((term) => foldVietnamese(term) === foldVietnamese(word))) found.push(word);
      if (found.length >= limit) return found;
    }
  }
  return found;
}
