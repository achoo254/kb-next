/**
 * What Jev reads about each document to choose the ones a search is about (src/search/meaning-search.ts):
 * - one of the texts kb started with (lessons, exercises, weekly pages): its curated vi/en title and summary from
 *   content/summaries.json, bundled into the server at build time (no file is read at runtime), keyed by the text's
 *   translation group id;
 * - any other text (written by a member): its title and the start of its first passage, in its own language.
 */
import summariesJson from '../../../../content/summaries.json' with { type: 'json' };
import { z } from 'zod';
import { plainText } from './snippet';

/** Keyed by the translation group id of the text (both languages share it). */
const Summaries = z.record(
  z.uuid(),
  z.object({ vi: z.object({ title: z.string().min(1), summary: z.string().min(10) }), en: z.object({ title: z.string().min(1), summary: z.string().min(10) }) }),
);

export interface BilingualSummary {
  vi: { title: string; summary: string };
  en: { title: string; summary: string };
}

/** How much of a member's first passage stands in for a summary. */
export const EXCERPT_CHARS = 280;

/** content/summaries.json by translation group id; checked once at startup (an invalid file stops the server). */
export function loadImportedSummaries(raw: unknown = summariesJson): ReadonlyMap<string, BilingualSummary> {
  return new Map(Object.entries(Summaries.parse(raw)));
}

/** The start of a passage on one line, cut at a word within `max` characters, Markdown marks dropped. */
export function excerpt(markdown: string, max: number = EXCERPT_CHARS): string {
  const plain = plainText(markdown);
  if (plain.length <= max) return plain;
  const cut = plain.slice(0, max);
  const space = cut.lastIndexOf(' ');
  return `${(space > max / 2 ? cut.slice(0, space) : cut).trimEnd()}…`;
}
