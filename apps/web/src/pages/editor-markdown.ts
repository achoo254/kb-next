/** Between the editor's document and the stored Markdown body (the `#` title line is the title field, not here). */
import type { Editor, JSONContent } from '@tiptap/core';
import { tidyMarkdown, withSteps } from './editor-schema';

/**
 * The editor document of a Markdown body, ending on an empty line to write on (the board's "Gõ / để chèn khối";
 * an empty last line is not stored).
 */
export function readMarkdown(editor: Editor, markdown: string): JSONContent {
  const manager = editor.markdown;
  if (!manager) throw new Error('the editor has no Markdown extension');
  const doc = withSteps(manager.parse(markdown));
  const blocks = doc.content ?? [];
  const last = blocks.at(-1);
  const endsEmpty = last?.type === 'paragraph' && (last.content ?? []).length === 0;
  return { ...doc, content: endsEmpty ? blocks : [...blocks, { type: 'paragraph' }] };
}

/** The Markdown body of the editor's document. */
export function writeMarkdown(editor: Editor): string {
  return tidyMarkdown(editor.getMarkdown());
}

/** Words of a text as the board counts them ("64 chữ"). */
export function countWords(text: string): number {
  return text.match(/[\p{L}\p{N}]+(?:[-'’][\p{L}\p{N}]+)*/gu)?.length ?? 0;
}

const WORDS_PER_MINUTE = 200;

/** Minutes to read `words` (at least 1), as the reader counts them. */
export function readingMinutes(words: number): number {
  return Math.max(1, Math.ceil(words / WORDS_PER_MINUTE));
}
