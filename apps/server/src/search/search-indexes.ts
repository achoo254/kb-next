/**
 * The two search indexes of kb, one entry per chunk:
 * - `kb_public`: chunks of documents everyone may see (approved, not hidden, not deleted);
 * - `kb_private`: every other live chunk, always searched with an `authorId` filter (admins: unfiltered).
 * Which document goes where is decided in src/access/ (the visibility rule lives there).
 *
 * `tx` holds the Telex form of the text (src/search/telex.ts) and has typo tolerance off, so a query with
 * diacritics, searched on `tx` only, matches those exact diacritics.
 */
import type { IndexSettings } from './meili-client';
import { toTelex } from './telex';

export const PUBLIC_INDEX = 'kb_public';
export const PRIVATE_INDEX = 'kb_private';
export const INDEX_NAMES = [PUBLIC_INDEX, PRIVATE_INDEX] as const;

export const TELEX_FIELD = 'tx';
export const TEXT_FIELDS = ['title', 'heading', 'text'];

export const INDEX_SETTINGS: IndexSettings = {
  searchableAttributes: [...TEXT_FIELDS, TELEX_FIELD],
  filterableAttributes: ['id', 'documentId', 'authorId', 'spaceId', 'lang'],
  typoTolerance: { disableOnAttributes: [TELEX_FIELD] },
};

export interface IndexEntry {
  /** The chunk id. */
  id: string;
  documentId: string;
  spaceId: string;
  authorId: string;
  lang: 'vi' | 'en';
  title: string;
  anchor: string;
  position: number;
  heading: string | null;
  text: string;
  tx: string;
}

export type IndexEntrySource = Omit<IndexEntry, 'tx'>;

export function toIndexEntry(source: IndexEntrySource): IndexEntry {
  return { ...source, tx: toTelex([source.title, source.heading ?? '', source.text].join('\n')) };
}

/** A Meilisearch filter string value: ids are uuids, but quote and escape anyway. */
export function filterValue(value: string): string {
  return `"${value.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`;
}
