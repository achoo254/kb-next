/**
 * What Jev reads about each document to choose the ones a search is about (src/search/meaning-search.ts):
 * - an imported Học Cloud text: its curated vi/en title and summary from content/summaries.json, bundled into the
 *   server at build time (no file is read at runtime) and matched by the text's translation group, which the import
 *   derives from the same key (`importId('group:<key>')`);
 * - any other text (written by a member): its title and the start of its first passage, in its own language.
 */
import summariesJson from '../../../../content/summaries.json' with { type: 'json' };
import { SUMMARY_PREFIX, Summaries } from '../import/hoc-cloud/curation';
import { importId } from '../import/hoc-cloud/prepare';
import { plainText } from './snippet';

export interface BilingualSummary {
  vi: { title: string; summary: string };
  en: { title: string; summary: string };
}

/** How much of a member's first passage stands in for a summary. */
export const EXCERPT_CHARS = 280;

/** content/summaries.json by translation group id; checked once at startup (an invalid file stops the server). */
export function loadImportedSummaries(raw: unknown = summariesJson): ReadonlyMap<string, BilingualSummary> {
  const parsed = Summaries.parse(raw);
  const byGroup = new Map<string, BilingualSummary>();
  for (const [key, summary] of Object.entries(parsed)) {
    if (!key.startsWith(SUMMARY_PREFIX)) continue;
    byGroup.set(importId(`group:${key.slice(SUMMARY_PREFIX.length)}`), summary);
  }
  return byGroup;
}

/** The start of a passage on one line, cut at a word within `max` characters, Markdown marks dropped. */
export function excerpt(markdown: string, max: number = EXCERPT_CHARS): string {
  const plain = plainText(markdown);
  if (plain.length <= max) return plain;
  const cut = plain.slice(0, max);
  const space = cut.lastIndexOf(' ');
  return `${(space > max / 2 ? cut.slice(0, space) : cut).trimEnd()}…`;
}
