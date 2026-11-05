/**
 * The difference between two versions of a document (C17 "So sánh phiên bản"), block by block: the Markdown cut at
 * blank lines (a fenced code block stays one block), compared with a longest-common-subsequence diff. Unchanged
 * blocks show only next to a change (`CONTEXT` on each side); a run of unchanged blocks left out becomes one `gap`.
 * The `#` title line is a block like any other, so a renamed document shows its old and new title.
 */

export type DiffOp = 'same' | 'add' | 'del' | 'gap';

export interface DiffLine {
  op: DiffOp;
  /** The block's text, its Markdown heading marks removed (empty for a gap). */
  text: string;
  /** The block is a heading. */
  heading: boolean;
}

export interface BlockDiff {
  added: number;
  removed: number;
  lines: DiffLine[];
}

/** Unchanged blocks kept before and after each change. */
const CONTEXT = 1;
/** Above this many blocks on both sides the diff stops comparing and shows everything as replaced (cost bound). */
const MAX_BLOCKS = 2_000;

const FENCE = /^\s*(`{3,}|~{3,})/;
const HEADING = /^#{1,6}\s+/;

/** The blocks of a Markdown text: paragraphs, list items' groups, headings, code blocks, in order. */
export function blocksOf(markdown: string): string[] {
  const blocks: string[] = [];
  let current: string[] = [];
  let fence: string | null = null;
  const flush = (): void => {
    const text = current.join('\n').trim();
    if (text) blocks.push(text);
    current = [];
  };
  for (const line of markdown.replace(/\r\n?/g, '\n').split('\n')) {
    const marker = FENCE.exec(line)?.[1];
    if (marker) {
      if (fence === null) {
        flush();
        fence = marker;
      } else if (marker[0] === fence[0] && marker.length >= fence.length && line.trim() === marker) {
        current.push(line);
        fence = null;
        flush();
        continue;
      }
    }
    if (fence === null && line.trim() === '') {
      flush();
      continue;
    }
    // A heading is its own block even without a blank line after it.
    if (fence === null && HEADING.test(line)) {
      flush();
      current.push(line);
      flush();
      continue;
    }
    current.push(line);
  }
  flush();
  return blocks;
}

function line(op: 'same' | 'add' | 'del', block: string): DiffLine {
  const heading = HEADING.test(block);
  return { op, text: heading ? block.replace(HEADING, '').trim() : block, heading };
}

/** Every block of `before` and `after` in order, each marked unchanged, removed or added (LCS on whole blocks). */
function fullDiff(before: readonly string[], after: readonly string[]): DiffLine[] {
  if (before.length > MAX_BLOCKS && after.length > MAX_BLOCKS) {
    return [...before.map((b) => line('del', b)), ...after.map((b) => line('add', b))];
  }
  const rows = before.length + 1;
  const cols = after.length + 1;
  // lengths[i * cols + j]: LCS length of before[i..] and after[j..]
  const lengths = new Uint32Array(rows * cols);
  for (let i = before.length - 1; i >= 0; i -= 1) {
    for (let j = after.length - 1; j >= 0; j -= 1) {
      lengths[i * cols + j] =
        before[i] === after[j] ? (lengths[(i + 1) * cols + j + 1] ?? 0) + 1 : Math.max(lengths[(i + 1) * cols + j] ?? 0, lengths[i * cols + j + 1] ?? 0);
    }
  }
  const out: DiffLine[] = [];
  let i = 0;
  let j = 0;
  while (i < before.length || j < after.length) {
    const b = before[i];
    const a = after[j];
    if (b !== undefined && a !== undefined && b === a) {
      out.push(line('same', b));
      i += 1;
      j += 1;
    } else if (b !== undefined && (a === undefined || (lengths[(i + 1) * cols + j] ?? 0) >= (lengths[i * cols + j + 1] ?? 0))) {
      out.push(line('del', b));
      i += 1;
    } else if (a !== undefined) {
      out.push(line('add', a));
      j += 1;
    }
  }
  return out;
}

export function diffBlocks(beforeMarkdown: string, afterMarkdown: string): BlockDiff {
  const all = fullDiff(blocksOf(beforeMarkdown), blocksOf(afterMarkdown));
  const near = all.map((entry, index) => entry.op !== 'same' || all.slice(Math.max(0, index - CONTEXT), index + CONTEXT + 1).some((e) => e.op !== 'same'));
  const lines: DiffLine[] = [];
  for (const [index, entry] of all.entries()) {
    if (near[index]) lines.push(entry);
    else if (lines.at(-1)?.op !== 'gap') lines.push({ op: 'gap', text: '', heading: false });
  }
  // A gap at either end says nothing: the reader knows the text goes on.
  while (lines[0]?.op === 'gap') lines.shift();
  while (lines.at(-1)?.op === 'gap') lines.pop();
  return { added: all.filter((e) => e.op === 'add').length, removed: all.filter((e) => e.op === 'del').length, lines };
}
