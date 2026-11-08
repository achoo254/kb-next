/**
 * The slides of a text (C21, /d/:id/present), cut from its sections (the reader's `chunks`, one per `##`) when it
 * opens: nothing is stored, so the slides always follow the latest version. Pure and deterministic: the same text
 * gives the same slides, so `#n` keeps pointing at the same slide until the text changes.
 *
 * The whole text is kept (nothing is cut away): a long paragraph becomes several slides of about 200 characters split
 * at sentence ends; a list shows 3 items a slide; a list of steps one step a slide; code 12 lines a slide; a table of
 * up to 3 columns becomes cards, a wider one a slide pointing to it in the reader. A `> [!TLDR]` quote in the opening
 * part becomes the second slide (and is not shown again); the table of contents comes next (second without one).
 * Every content slide carries `notes`: the full Markdown block it comes from (a section's opening slide: the whole
 * section), for the speaker view.
 */

/** About this many characters of text a slide (a sentence longer than LONG_SENTENCE stands alone). */
export const SLIDE_CHARS = 200;
const LONG_SENTENCE = 260;
export const LIST_ITEMS_PER_SLIDE = 3;
export const CODE_LINES_PER_SLIDE = 12;
export const TABLE_ROWS_PER_SLIDE = 3;
/** A table up to this many columns is drawn as cards; a wider one points to the reader. */
export const CARD_TABLE_COLUMNS = 3;
/** A safety cap: no published text comes near it (the longest, 51.7k characters, gives about 250). */
export const MAX_SLIDES = 1000;
const MIN_STEPS = 2;
const MAX_STEPS = 6;
const STAT_MAX_CHARS = 120;

export interface TocItem {
  anchor: string;
  title: string;
  /** Index of the section's opening slide. */
  slide: number;
}

export type Slide =
  | { kind: 'cover'; title: string }
  | { kind: 'tldr'; points: string[]; notes: string }
  | { kind: 'toc'; items: TocItem[] }
  | { kind: 'section'; anchor: string; heading: string; index: number; total: number; slides: number; notes: string }
  | { kind: 'text'; anchor: string; markdown: string; notes: string }
  | { kind: 'bullets'; anchor: string; items: string[]; ordered: boolean; start: number; notes: string }
  | { kind: 'step'; anchor: string; term: string; body: string; step: number; steps: number; notes: string }
  | { kind: 'quote'; anchor: string; markdown: string; warning: boolean; notes: string }
  | { kind: 'stat'; anchor: string; value: string; caption: string; notes: string }
  | { kind: 'code'; anchor: string; lang: string; code: string; part: [number, number] | null; notes: string }
  | { kind: 'table-cards'; anchor: string; rows: Array<Array<[string, string]>>; notes: string }
  | { kind: 'table-link'; anchor: string; notes: string }
  | { kind: 'image'; anchor: string; src: string; alt: string; notes: string }
  | { kind: 'end'; title: string; headings: string[] };

export type SlideKind = Slide['kind'];

export interface SlideSource {
  title: string;
  chunks: ReadonlyArray<{ anchor: string; heading: string | null; markdown: string }>;
}

/** One Markdown block of a section, as written. */
type Block =
  | { type: 'paragraph'; text: string }
  | { type: 'heading'; text: string; raw: string }
  | { type: 'code'; lang: string; code: string; raw: string }
  | { type: 'list'; items: string[]; ordered: boolean; start: number; raw: string }
  | { type: 'quote'; text: string; raw: string }
  | { type: 'table'; header: string[]; rows: string[][]; raw: string }
  | { type: 'image'; src: string; alt: string; raw: string };

const FENCE = /^\s*(```+|~~~+)\s*([\w+-]*)/;
const LIST_ITEM = /^(\s*)([-*+]|\d+[.)])\s+(.*)$/;
const TABLE_ROW = /^\s*\|.*\|\s*$/;
const TABLE_SEPARATOR = /^\s*\|?\s*:?-{2,}:?\s*(\|\s*:?-{2,}:?\s*)*\|?\s*$/;
const IMAGE_ONLY = /^!\[([^\]]*)\]\(\s*([^)\s]+)(?:\s+"[^"]*")?\s*\)$/;
const HEADING = /^#{1,6}\s+(.*)$/;
const TLDR_MARK = /^\[!TLDR\][ \t]*\n?/i;
const WARNING_MARK = /^\[!WARNING\][ \t]*\n?/i;
const STEP_ITEM = /^\*\*(.+?)\*\*[:.]?\s*([\s\S]*)$/;
/** A short paragraph opening with a bold figure: a number with its unit ("**73%**", "**15 phút**") or of two digits
 * or more ("**250** slide"). A bold "**1.**" is a hand-numbered step, not a figure. */
const STAT = /^\*\*([+-]?(?:\d[\d.,]*\s?(?:%|x|×|k|K|M|B|GB|MB|ms|giờ|phút|ngày|năm|lần|tỷ|triệu|nghìn)|\d[\d.,]*\d))\*\*\s*([\s\S]+)$/;

function isBlank(line: string): boolean {
  return line.trim() === '';
}

/** Whether a line opens another block, ending the paragraph above it even without a blank line. */
function startsBlock(line: string): boolean {
  const item = LIST_ITEM.exec(line);
  return FENCE.test(line) || HEADING.test(line) || line.trimStart().startsWith('>') || TABLE_ROW.test(line) || (item !== null && (item[1] ?? '').length === 0);
}

function tableCells(line: string): string[] {
  return line
    .trim()
    .replace(/^\|/, '')
    .replace(/\|$/, '')
    .split('|')
    .map((cell) => cell.trim());
}

/** The blocks of a section's Markdown, in order. */
export function splitBlocks(markdown: string): Block[] {
  const lines = markdown.replace(/\r\n?/g, '\n').split('\n');
  const blocks: Block[] = [];
  let i = 0;
  while (i < lines.length) {
    const line = lines[i] ?? '';
    if (isBlank(line)) {
      i += 1;
      continue;
    }
    const fence = FENCE.exec(line);
    if (fence) {
      const mark = fence[1] ?? '```';
      const body: string[] = [];
      let j = i + 1;
      while (j < lines.length && !(lines[j] ?? '').trim().startsWith(mark)) {
        body.push(lines[j] ?? '');
        j += 1;
      }
      blocks.push({ type: 'code', lang: fence[2] ?? '', code: body.join('\n'), raw: lines.slice(i, j + 1).join('\n') });
      i = j + 1;
      continue;
    }
    const heading = HEADING.exec(line);
    if (heading) {
      blocks.push({ type: 'heading', text: (heading[1] ?? '').trim(), raw: line });
      i += 1;
      continue;
    }
    if (TABLE_ROW.test(line) && TABLE_SEPARATOR.test(lines[i + 1] ?? '')) {
      let j = i + 2;
      while (j < lines.length && TABLE_ROW.test(lines[j] ?? '')) j += 1;
      blocks.push({ type: 'table', header: tableCells(line), rows: lines.slice(i + 2, j).map(tableCells), raw: lines.slice(i, j).join('\n') });
      i = j;
      continue;
    }
    if (line.trimStart().startsWith('>')) {
      let j = i;
      while (j < lines.length && (lines[j] ?? '').trimStart().startsWith('>')) j += 1;
      const raw = lines.slice(i, j).join('\n');
      const text = lines
        .slice(i, j)
        .map((quoted) => quoted.trimStart().replace(/^>\s?/, ''))
        .join('\n')
        .trim();
      blocks.push({ type: 'quote', text, raw });
      i = j;
      continue;
    }
    const first = LIST_ITEM.exec(line);
    if (first && (first[1] ?? '').length === 0) {
      const ordered = /\d/.test(first[2] ?? '');
      const start = ordered ? Number.parseInt(first[2] ?? '1', 10) : 1;
      const items: string[] = [];
      // How far an item's nested lines are indented (under its text, past "1. " or "- ").
      let indent = 2;
      let j = i;
      while (j < lines.length) {
        const current = lines[j] ?? '';
        const item = LIST_ITEM.exec(current);
        if (item && (item[1] ?? '').length === 0) {
          items.push(item[3] ?? '');
          indent = (item[2] ?? '').length + 1;
        } else if (!isBlank(current) && /^\s+/.test(current) && items.length > 0) {
          const lead = current.length - current.trimStart().length;
          items[items.length - 1] += `\n${current.slice(Math.min(lead, indent))}`;
        } else if (isBlank(current)) {
          const next = lines[j + 1] ?? '';
          const continues = LIST_ITEM.exec(next);
          if (!(continues && (continues[1] ?? '').length === 0) && !/^\s+\S/.test(next)) break;
          if (/^\s+\S/.test(next) && items.length > 0) items[items.length - 1] += '\n';
        } else {
          break;
        }
        j += 1;
      }
      blocks.push({ type: 'list', items, ordered, start, raw: lines.slice(i, j).join('\n').trim() });
      i = j;
      continue;
    }
    let j = i + 1;
    while (j < lines.length && !isBlank(lines[j] ?? '') && !startsBlock(lines[j] ?? '')) j += 1;
    const text = lines.slice(i, j).join('\n').trim();
    const image = IMAGE_ONLY.exec(text);
    if (image) blocks.push({ type: 'image', alt: image[1] ?? '', src: image[2] ?? '', raw: text });
    else blocks.push({ type: 'paragraph', text });
    i = j;
  }
  return blocks;
}

/** Whether the inline Markdown of a piece is closed (no `code`, **bold** or [link] cut in half). */
function balanced(piece: string): boolean {
  const ticks = (piece.match(/`/g) ?? []).length;
  const bold = (piece.match(/\*\*/g) ?? []).length;
  const open = (piece.match(/\[/g) ?? []).length;
  const close = (piece.match(/\]/g) ?? []).length;
  return ticks % 2 === 0 && bold % 2 === 0 && open === close;
}

/** The sentences of a paragraph, never splitting inside inline code, bold or a link. */
export function sentences(text: string, lang: string): string[] {
  const flat = text.replace(/\s*\n\s*/g, ' ').trim();
  if (flat === '') return [];
  const raw =
    typeof Intl !== 'undefined' && 'Segmenter' in Intl
      ? Array.from(new Intl.Segmenter(lang, { granularity: 'sentence' }).segment(flat), (part) => part.segment)
      : flat.split(/(?<=[.!?])\s+/);
  const out: string[] = [];
  let pending = '';
  for (const part of raw) {
    pending += part;
    if (balanced(pending)) {
      out.push(pending.trim());
      pending = '';
    }
  }
  if (pending.trim() !== '') out.push(pending.trim());
  return out.filter((sentence) => sentence !== '');
}

/** Parts of `text` cut after each match of `boundary`, never inside inline code, bold or a link. */
function cutAfter(text: string, boundary: RegExp): string[] {
  const out: string[] = [];
  let pending = '';
  for (const part of text.split(boundary)) {
    pending += part;
    if (balanced(pending)) {
      out.push(pending.trim());
      pending = '';
    }
  }
  if (pending.trim() !== '') out.push(pending.trim());
  return out.filter((piece) => piece !== '');
}

/** Gathers parts into pieces of at most SLIDE_CHARS characters (a longer part stays whole). */
function gather(parts: readonly string[]): string[] {
  const pieces: string[] = [];
  let current = '';
  for (const part of parts) {
    if (current && current.length + 1 + part.length > SLIDE_CHARS) {
      pieces.push(current);
      current = part;
    } else {
      current = current ? `${current} ${part}` : part;
    }
  }
  if (current) pieces.push(current);
  return pieces;
}

/** A sentence longer than LONG_SENTENCE cut at clause marks (, ; : —), then between words if still too long. */
function fitSentence(sentence: string): string[] {
  if (sentence.length <= LONG_SENTENCE) return [sentence];
  return gather(cutAfter(sentence, /(?<=[,;:]|\s—)\s+/)).flatMap((piece) => (piece.length <= LONG_SENTENCE ? [piece] : gather(cutAfter(piece, /(?<=\S)\s+/))));
}

/** A paragraph as pieces of about SLIDE_CHARS characters, cut at sentence ends (a long sentence at its clauses). */
export function paragraphPieces(text: string, lang: string): string[] {
  if (text.length <= SLIDE_CHARS) return [text];
  const pieces: string[] = [];
  let current = '';
  for (const sentence of sentences(text, lang)) {
    if (sentence.length > SLIDE_CHARS) {
      if (current) pieces.push(current);
      current = '';
      pieces.push(...fitSentence(sentence));
    } else if (current && current.length + 1 + sentence.length > SLIDE_CHARS) {
      pieces.push(current);
      current = sentence;
    } else {
      current = current ? `${current} ${sentence}` : sentence;
    }
  }
  if (current) pieces.push(current);
  return pieces;
}

/** An item's own line and the blocks nested under it (code, a sub-list…), dedented. */
function splitItem(item: string): { lead: string; rest: string } {
  const [lead = '', ...rest] = item.split('\n');
  return { lead: lead.trim(), rest: rest.join('\n') };
}

function chunk<T>(items: readonly T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}

/** The step term, body and nested blocks of each item when the list is a list of steps (each opens with a bold term). */
function stepItems(items: readonly string[]): Array<{ term: string; body: string; rest: string }> | null {
  if (items.length < MIN_STEPS || items.length > MAX_STEPS) return null;
  const steps = items.map((item) => {
    const { lead, rest } = splitItem(item);
    const step = STEP_ITEM.exec(lead);
    return step ? { term: (step[1] ?? '').trim(), body: (step[2] ?? '').trim(), rest } : null;
  });
  return steps.every((step) => step !== null) ? steps : null;
}

/** Up to LIST_ITEMS_PER_SLIDE short items a slide, and no more than about two slides' worth of text. */
function itemGroups(items: ReadonlyArray<{ text: string; number: number }>): Array<Array<{ text: string; number: number }>> {
  const groups: Array<Array<{ text: string; number: number }>> = [];
  let current: Array<{ text: string; number: number }> = [];
  let size = 0;
  for (const item of items) {
    if (current.length === LIST_ITEMS_PER_SLIDE || (current.length > 0 && size + item.text.length > SLIDE_CHARS * 2)) {
      groups.push(current);
      current = [];
      size = 0;
    }
    current.push(item);
    size += item.text.length;
  }
  if (current.length > 0) groups.push(current);
  return groups;
}

function listSlides(block: Extract<Block, { type: 'list' }>, anchor: string, lang: string): Slide[] {
  const steps = block.ordered ? stepItems(block.items) : null;
  if (steps) {
    return steps.flatMap((step, index): Slide[] => {
      const [body = '', ...more] = step.body === '' ? [''] : paragraphPieces(step.body, lang);
      return [
        { kind: 'step', anchor, term: step.term, body, step: index + 1, steps: steps.length, notes: block.raw },
        ...more.map((markdown): Slide => ({ kind: 'text', anchor, markdown, notes: block.raw })),
        ...nestedSlides(step.rest, anchor, lang),
      ];
    });
  }
  const slides: Slide[] = [];
  let pending: Array<{ text: string; number: number }> = [];
  const flush = (): void => {
    for (const group of itemGroups(pending)) {
      slides.push({ kind: 'bullets', anchor, items: group.map((item) => item.text), ordered: block.ordered, start: group[0]?.number ?? 1, notes: block.raw });
    }
    pending = [];
  };
  block.items.forEach((item, index) => {
    const number = block.start + index;
    const { lead, rest } = splitItem(item);
    if (lead.length > SLIDE_CHARS) {
      flush();
      for (const piece of paragraphPieces(lead, lang)) slides.push({ kind: 'bullets', anchor, items: [piece], ordered: block.ordered, start: number, notes: block.raw });
    } else if (lead !== '') {
      pending.push({ text: lead, number });
    }
    if (rest.trim() !== '') {
      flush();
      slides.push(...nestedSlides(rest, anchor, lang));
    }
  });
  flush();
  return slides;
}

/** The slides of the blocks nested under a list item (code, a sub-list, a paragraph). */
function nestedSlides(markdown: string, anchor: string, lang: string): Slide[] {
  return markdown.trim() === '' ? [] : splitBlocks(markdown).flatMap((inner) => blockSlides(inner, anchor, lang));
}

/** The TL;DR points of a quote marked `[!TLDR]`, or null. */
function tldrPoints(block: Block): string[] | null {
  if (block.type !== 'quote' || !TLDR_MARK.test(block.text)) return null;
  const body = block.text.replace(TLDR_MARK, '').trim();
  const items = splitBlocks(body).flatMap((inner) => (inner.type === 'list' ? inner.items : inner.type === 'paragraph' ? [inner.text] : []));
  return items.length > 0 ? items : null;
}

function blockSlides(block: Block, anchor: string, lang: string): Slide[] {
  switch (block.type) {
    case 'paragraph': {
      const stat = block.text.length <= STAT_MAX_CHARS ? STAT.exec(block.text) : null;
      if (stat) return [{ kind: 'stat', anchor, value: (stat[1] ?? '').trim(), caption: (stat[2] ?? '').trim(), notes: block.text }];
      return paragraphPieces(block.text, lang).map((markdown) => ({ kind: 'text', anchor, markdown, notes: block.text }));
    }
    case 'heading':
      return [{ kind: 'text', anchor, markdown: `**${block.text}**`, notes: block.raw }];
    case 'code': {
      const lines = block.code.split('\n');
      const parts = chunk(lines, CODE_LINES_PER_SLIDE);
      return parts.map((part, index) => ({
        kind: 'code',
        anchor,
        lang: block.lang,
        code: part.join('\n'),
        part: parts.length > 1 ? [index + 1, parts.length] : null,
        notes: block.raw,
      }));
    }
    case 'list':
      return listSlides(block, anchor, lang);
    case 'quote': {
      const warning = WARNING_MARK.test(block.text);
      return [{ kind: 'quote', anchor, markdown: block.text.replace(WARNING_MARK, '').trim(), warning, notes: block.raw }];
    }
    case 'table': {
      if (block.header.length > CARD_TABLE_COLUMNS) return [{ kind: 'table-link', anchor, notes: block.raw }];
      const rows = block.rows.map((cells) => block.header.map((name, index): [string, string] => [name, cells[index] ?? '']));
      return chunk(rows, TABLE_ROWS_PER_SLIDE).map((group) => ({ kind: 'table-cards', anchor, rows: group, notes: block.raw }));
    }
    case 'image':
      return [{ kind: 'image', anchor, src: block.src, alt: block.alt, notes: block.raw }];
  }
}

/** The slides of a text (see the module comment). */
export function buildSlides(source: SlideSource, lang: string): Slide[] {
  const slides: Slide[] = [{ kind: 'cover', title: source.title }];
  const headed = source.chunks.filter((part) => part.heading !== null && part.heading.trim() !== '');

  // A TL;DR quote in the opening part (the overview before the first heading, or the first section).
  let tldr: { points: string[]; raw: string; anchor: string } | null = null;
  const opening = source.chunks[0];
  if (opening) {
    for (const block of splitBlocks(opening.markdown)) {
      const points = tldrPoints(block);
      if (points && block.type === 'quote') {
        tldr = { points, raw: block.raw, anchor: opening.anchor };
        break;
      }
    }
  }
  const toc: { kind: 'toc'; items: TocItem[] } = { kind: 'toc', items: [] };
  if (tldr) slides.push({ kind: 'tldr', points: tldr.points, notes: tldr.raw });
  // The contents always follow (after the TL;DR when there is one): long decks are travelled through it (T).
  if (headed.length > 0) slides.push(toc);

  let sectionIndex = 0;
  for (const part of source.chunks) {
    const heading = part.heading?.trim() ?? '';
    let opener: Extract<Slide, { kind: 'section' }> | null = null;
    if (heading !== '') {
      sectionIndex += 1;
      opener = { kind: 'section', anchor: part.anchor, heading, index: sectionIndex, total: headed.length, slides: 0, notes: part.markdown };
      toc.items.push({ anchor: part.anchor, title: heading, slide: slides.length });
      slides.push(opener);
    }
    const before = slides.length;
    for (const block of splitBlocks(part.markdown)) {
      if (tldr && part.anchor === tldr.anchor && block.type === 'quote' && block.raw === tldr.raw) continue;
      slides.push(...blockSlides(block, part.anchor, lang));
    }
    if (opener) opener.slides = slides.length - before;
  }

  slides.push({ kind: 'end', title: source.title, headings: headed.map((part) => part.heading?.trim() ?? '') });
  if (slides.length > MAX_SLIDES) {
    console.warn(`present: ${slides.length} slides, keeping the first ${MAX_SLIDES}`);
    return slides.slice(0, MAX_SLIDES);
  }
  return slides;
}

/** The slide a `#n` hash points at (1-based in the address), or 0 when it points nowhere. */
export function slideFromHash(hash: string, count: number): number {
  const match = /^#(\d+)$/.exec(hash);
  if (!match) return 0;
  const n = Number(match[1]);
  return n >= 1 && n <= count ? n - 1 : 0;
}

/** The sections of a deck as [first slide, last slide] ranges, for the progress bar of a long deck. */
export function sectionRanges(slides: readonly Slide[]): Array<[number, number]> {
  const starts = slides.flatMap((slide, index) => (slide.kind === 'section' ? [index] : []));
  if (starts.length === 0) return [[0, slides.length - 1]];
  const ranges: Array<[number, number]> = [];
  const first = starts[0] ?? 0;
  if (first > 0) ranges.push([0, first - 1]);
  starts.forEach((start, index) => ranges.push([start, (starts[index + 1] ?? slides.length) - 1]));
  return ranges;
}
