/**
 * A Markdown document as paragraphs (blocks separated by blank lines; a fenced code block stays one block, blank
 * lines included), and paragraphs packed into groups small enough for one translation call each.
 */

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

/** Consecutive paragraphs, each group at most `maxChars` long (a longer paragraph is a group of its own). */
export function groupParagraphs(paragraphs: readonly string[], maxChars: number): string[][] {
  const groups: string[][] = [];
  let current: string[] = [];
  let size = 0;
  for (const paragraph of paragraphs) {
    if (current.length > 0 && size + paragraph.length > maxChars) {
      groups.push(current);
      current = [];
      size = 0;
    }
    current.push(paragraph);
    size += paragraph.length + 2;
  }
  if (current.length > 0) groups.push(current);
  return groups;
}
