/**
 * How the reading API shapes rows into answers: one entry per text in the reader's language (a text and its
 * translations share `translationGroupId`), document summaries, reading time and the table of contents.
 */
import type { CollectionRow, DocumentRow, SpaceRow } from '../access/content';
import type { Caption } from '../captions/space-captions';
import { splitSections } from '../import/hoc-cloud/sections';

export type Lang = 'vi' | 'en';

export interface SpaceBrief {
  slug: string;
  nameVi: string;
  nameEn: string;
  tint: string;
  glow: string;
}

export interface SpaceCard extends SpaceBrief {
  art: string;
  kind: 'public' | 'personal';
  caption: Caption;
  /** Readable texts (a text and its translations count once). */
  documentCount: number;
  collectionCount: number;
}

export interface CollectionBrief {
  id: string;
  nameVi: string;
  nameEn: string;
}

export interface DocumentSummary {
  id: string;
  title: string;
  type: DocumentRow['type'];
  origin: DocumentRow['origin'];
  status: DocumentRow['status'];
  lang: Lang;
  aiTranslated: boolean;
  updatedAt: string;
  authorName: string | null;
  /** Every language the viewer can read this text in, this one included. */
  translations: Lang[];
  collectionId: string | null;
  space: SpaceBrief;
  /** How far the signed-in viewer has read it, 0–100 (0: not started); null for a guest. */
  readProgress: number | null;
}

export interface PickedText {
  doc: DocumentRow;
  langs: Lang[];
}

const textKey = (doc: DocumentRow): string => doc.translationGroupId ?? doc.id;

/**
 * One document per text, in the order of `docs`: the one in `lang` when there is one, else the original (not an
 * AI translation), else the first. `langs` lists the languages of the text's readable documents.
 */
export function pickTexts(docs: readonly DocumentRow[], lang: Lang): PickedText[] {
  const groups = new Map<string, DocumentRow[]>();
  for (const doc of docs) {
    const group = groups.get(textKey(doc));
    if (group) group.push(doc);
    else groups.set(textKey(doc), [doc]);
  }
  return [...groups.values()].map((group) => ({ doc: pickIn(group, lang), langs: langsOf(group) }));
}

/** The member of one text's documents to show for `lang` (see pickTexts). `group` is not empty. */
export function pickIn(group: readonly DocumentRow[], lang: Lang): DocumentRow {
  const chosen = group.find((d) => d.lang === lang) ?? group.find((d) => !d.aiTranslated) ?? group[0];
  if (!chosen) throw new Error('pickIn needs at least one document');
  return chosen;
}

export function langsOf(group: readonly DocumentRow[]): Lang[] {
  return (['vi', 'en'] as const).filter((lang) => group.some((d) => d.lang === lang));
}

export function spaceBrief(space: SpaceRow): SpaceBrief {
  return { slug: space.slug, nameVi: space.nameVi, nameEn: space.nameEn, tint: space.tint, glow: space.glow };
}

export function collectionBrief(collection: CollectionRow): CollectionBrief {
  return { id: collection.id, nameVi: collection.nameVi, nameEn: collection.nameEn };
}

export function documentSummary(doc: DocumentRow, langs: Lang[], space: SpaceRow, authorName: string | null, readProgress: number | null): DocumentSummary {
  return {
    id: doc.id,
    title: doc.title,
    type: doc.type,
    origin: doc.origin,
    status: doc.status,
    lang: doc.lang,
    aiTranslated: doc.aiTranslated,
    updatedAt: doc.updatedAt.toISOString(),
    authorName,
    translations: langs.length > 0 ? langs : [doc.lang],
    collectionId: doc.collectionId,
    space: spaceBrief(space),
    readProgress,
  };
}

const WORDS_PER_MINUTE = 200;

/** Minutes to read texts at an even pace; at least 1. */
export function readingMinutes(texts: readonly string[]): number {
  const words = texts.reduce((sum, text) => sum + (text.match(/\S+/g)?.length ?? 0), 0);
  return Math.max(1, Math.ceil(words / WORDS_PER_MINUTE));
}

export interface TocEntry {
  anchor: string;
  /** null: the overview before the first heading (the UI names it "Tổng quan" / "Overview"). */
  title: string | null;
  /** 2 for a `##` section, 3 for a `###` one. */
  level: 2 | 3;
}

/**
 * The table of contents of a document from its chunks; levels come from the headings of its latest Markdown
 * (a chunk is cut at each `##` or `###`). A heading the Markdown no longer has counts as a `##`.
 */
export function tableOfContents(chunks: ReadonlyArray<{ anchor: string; heading: string | null }>, markdown: string | null): TocEntry[] {
  const levels = new Map<string, 2 | 3>();
  for (const section of markdown ? splitSections(markdown, '') : []) {
    const hashes = /^(#+)/.exec(section.raw)?.[1]?.length;
    if (section.heading !== null && !levels.has(section.heading)) levels.set(section.heading, hashes === 3 ? 3 : 2);
  }
  return chunks.map((chunk) => ({
    anchor: chunk.anchor,
    title: chunk.heading,
    level: chunk.heading === null ? 2 : (levels.get(chunk.heading) ?? 2),
  }));
}
