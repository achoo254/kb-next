/**
 * The original of a translation (F04) as the paragraphs the server translates: its `#` title line, then the Markdown
 * of each section (heading lines included), cut at blank lines with a fenced code block kept whole. The server
 * numbers its `paragraph` events the same way (apps/server/src/copilot/paragraphs.ts, translate-routes.ts: paragraph
 * 0 is the title), so row n of the original sits beside translated paragraph n. The web cannot import server code;
 * this mirrors `splitParagraphs` and must change with it.
 */
import type { DocumentView } from '../api/content-api';

const FENCE = /^\s*(`{3,}|~{3,})/;

export function splitParagraphs(markdown: string): string[] {
  const blocks: string[] = [];
  let current: string[] = [];
  let fence: string | null = null;
  const flush = (): void => {
    const block = current.join('\n').trim();
    if (block) blocks.push(block);
    current = [];
  };
  for (const line of markdown.replace(/\r\n/g, '\n').split('\n')) {
    const marker = FENCE.exec(line)?.[1];
    if (marker) {
      if (fence === null) fence = marker;
      else if (marker[0] === fence[0] && marker.length >= fence.length && line.trim() === marker) fence = null;
    }
    if (fence === null && !marker && line.trim() === '') flush();
    else current.push(line);
  }
  flush();
  return blocks;
}

/** The document's Markdown rebuilt from the reader's view: title line, then each section under its heading. */
export function sourceMarkdown(view: DocumentView): string {
  const levels = new Map(view.toc.map((entry) => [entry.anchor, entry.level]));
  const sections = view.chunks.map((chunk) => {
    if (chunk.heading === null) return chunk.markdown;
    const marks = '#'.repeat(levels.get(chunk.anchor) ?? 2);
    return `${marks} ${chunk.heading}\n\n${chunk.markdown}`;
  });
  return [`# ${view.document.title}`, ...sections].join('\n\n');
}

/** Paragraph 0 is the title; the rows of the screen are 1…n. */
export function sourceParagraphs(view: DocumentView): string[] {
  return splitParagraphs(sourceMarkdown(view));
}

/** Words of the text (Markdown marks are not words). */
export function wordCount(paragraphs: readonly string[]): number {
  return paragraphs.reduce((total, paragraph) => total + (paragraph.match(/[\p{L}\p{N}][\p{L}\p{N}'’.-]*/gu)?.length ?? 0), 0);
}

/** "khoảng 2.400 từ": exact under 100 words, to the nearest 10 under 1,000, else to the nearest 100. */
export function roundedWords(count: number): number {
  if (count < 100) return count;
  const step = count < 1000 ? 10 : 100;
  return Math.round(count / step) * step;
}

/**
 * How far a translation is, 0–100: the rows done plus half of the row being written, over the rows (the title is
 * not a row). `received` is the highest paragraph index the stream has sent, -1 before the first.
 */
export function translatedPercent(received: number, rows: number, finished: boolean): number {
  if (finished) return 100;
  if (rows <= 0 || received < 1) return 0;
  return Math.min(99, Math.max(0, Math.round(((received - 0.5) / rows) * 100)));
}
