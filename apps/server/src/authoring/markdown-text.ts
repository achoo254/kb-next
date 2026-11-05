/**
 * The stored form of a written document: one Markdown text whose first line is the `#` title (as imported texts
 * have it), split into the chunks the reader, search and the Copilot read, with the titles its `[[ ]]` links name.
 * The editor (C02) edits the title and the body apart; these helpers join and split them.
 */
import { createHash } from 'node:crypto';
import { OVERVIEW_ANCHOR, wikilinkTitles } from '../import/hoc-cloud/prepare';
import { splitSections, titleLine } from '../import/hoc-cloud/sections';

/** Longest title a writer may give (the reader's heading, breadcrumbs and cards stay readable). */
export const MAX_TITLE_CHARS = 200;
/** Longest body the editor may save: far above a long lab, far below the API's body limit. */
export const MAX_BODY_CHARS = 200_000;

export interface WrittenChunk {
  anchor: string;
  heading: string | null;
  text: string;
}

/**
 * The stored Markdown of a title and body; a draft without a title has no title line. Its body's opening `#` heading
 * is kept as a `##` one: stored first, it would read back as the title and leave the body.
 */
export function composeMarkdown(title: string, body: string): string {
  const cleanTitle = title.trim();
  const cleanBody = body.replace(/\r\n?/g, '\n').trim();
  if (!cleanTitle) return titleLine(cleanBody) === null ? cleanBody : cleanBody.replace(/^#(\s)/, '##$1');
  return cleanBody ? `# ${cleanTitle}\n\n${cleanBody}` : `# ${cleanTitle}`;
}

/** The body of stored Markdown: the text after its `#` title line (all of it when there is none). */
export function bodyOf(markdown: string): string {
  const title = titleLine(markdown);
  if (title === null) return markdown.trim();
  return markdown.slice(markdown.indexOf(title) + title.length).trim();
}

export function chunksOf(markdown: string, lang: 'vi' | 'en'): WrittenChunk[] {
  return splitSections(markdown, OVERVIEW_ANCHOR[lang]).map(({ anchor, heading, text }) => ({ anchor, heading, text }));
}

/** The distinct titles named by `[[Title]]` / `[[Title|label]]` outside code, in order. */
export function linkedTitles(markdown: string): string[] {
  return [...new Set(wikilinkTitles(markdown))];
}

export function contentHash(markdown: string): string {
  return createHash('sha256').update(markdown).digest('hex');
}

/** A title folded for matching `[[ ]]` links: lower case, no diacritics, single spaces. */
export function foldTitle(text: string): string {
  return text
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[đĐ]/g, 'd')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
}
