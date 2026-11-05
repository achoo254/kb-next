/**
 * Document Normalizer: what Tika (or the file itself) gave, as one Markdown text in page order, cut into the chunks
 * search and the Copilot read. Chunks follow the same rules as written documents (src/import/hoc-cloud/sections.ts:
 * a chunk per `##`/`###` heading, anchors from the heading, unique per document); a PDF page starts with its own
 * `## Trang N` / `## Page N` heading, so a citation lands on its page. A section longer than MAX_CHUNK_CHARS is cut
 * at paragraph breaks into parts anchored `<anchor>--2`, `<anchor>--3`… (a slug never holds `--`, so these never
 * collide with a heading's anchor).
 */
import type { WrittenChunk } from '../authoring/markdown-text';
import { htmlToMarkdown } from '../import/hoc-cloud/html-to-markdown';
import { OVERVIEW_ANCHOR } from '../import/hoc-cloud/prepare';
import { splitSections } from '../import/hoc-cloud/sections';

export const MAX_CHUNK_CHARS = 4_000;
const PAGE_HEADING = { vi: 'Trang', en: 'Page' } as const;
const FENCE = /^\s*(`{3,}|~{3,})/;
const PAGE_DIV = /<div\s+class=["']page["'][^>]*>/gi;

/** One piece of a document: a PDF page (`page` set) or a whole file read without pages. */
export interface ExtractedPart {
  page: number | null;
  markdown: string;
}

/** The pages of a Tika XHTML of a PDF (each `<div class="page">`), as HTML; empty when it has none. */
export function tikaPages(html: string): string[] {
  const starts = [...html.matchAll(PAGE_DIV)].map((m) => m.index);
  return starts.map((start, i) => html.slice(start, starts[i + 1] ?? html.length).replace(/<\/body>[\s\S]*$/i, ''));
}

/** Markdown of a Tika XHTML (or one of its pages). */
export function tikaMarkdown(html: string): string {
  return htmlToMarkdown(html);
}

/** An OCR page in hOCR: its text, and Tesseract's mean word confidence (0–1) when the words carry one. */
export function ocrPageText(html: string): { text: string; confidence: number | null } {
  const confidences = [...html.matchAll(/x_wconf\s+(\d{1,3})/g)].map((m) => Number(m[1]));
  const confidence = confidences.length > 0 ? confidences.reduce((sum, c) => sum + Math.min(100, c), 0) / confidences.length / 100 : null;
  return { text: htmlToMarkdown(html), confidence: confidence === null ? null : Math.round(confidence * 100) / 100 };
}

/** Every heading one level down (`#` → `##`…): the document's title is its own field, a `#` line is not text. */
export function demoteHeadings(markdown: string): string {
  let fence: string | null = null;
  return markdown
    .split('\n')
    .map((line) => {
      const marker = FENCE.exec(line)?.[1];
      if (marker) {
        if (fence === null) fence = marker;
        else if (marker[0] === fence[0] && marker.length >= fence.length && line.trim() === marker) fence = null;
        return line;
      }
      return fence === null && /^#{1,5}\s/.test(line) ? `#${line}` : line;
    })
    .join('\n');
}

/** `text` cut into runs of at most `max` characters, at `separator` when it can be, else anywhere. */
function cut(text: string, separator: string, max: number): string[] {
  if (text.length <= max) return [text];
  if (separator === '') {
    const runs: string[] = [];
    for (let start = 0; start < text.length; start += max) runs.push(text.slice(start, start + max));
    return runs;
  }
  return text.split(separator).flatMap((part) => cut(part, separator === '\n\n' ? '\n' : '', max));
}

/** Paragraphs of `text` packed into pieces of at most `max` characters (a longer paragraph cut at line breaks, then hard). */
function pieces(text: string, max: number): string[] {
  const units = cut(text.replace(/\n{3,}/g, '\n\n'), '\n\n', max);
  const out: string[] = [];
  let current = '';
  for (const unit of units) {
    if (current && current.length + unit.length + 2 > max) {
      out.push(current);
      current = unit;
    } else {
      current = current ? `${current}\n\n${unit}` : unit;
    }
  }
  if (current.trim()) out.push(current);
  return out;
}

export interface NormalizedDocument {
  markdown: string;
  chunks: WrittenChunk[];
}

/** The parts as one Markdown in their order, and its chunks. Parts with no text, and empty sections, are left out. */
export function normalize(parts: readonly ExtractedPart[], lang: 'vi' | 'en'): NormalizedDocument {
  const markdown = parts
    .map((part) => ({ ...part, body: demoteHeadings(part.markdown.replace(/\r\n?/g, '\n')).trim() }))
    .filter((part) => part.body !== '')
    .map((part) => (part.page === null ? part.body : `## ${PAGE_HEADING[lang]} ${part.page}\n\n${part.body}`))
    .join('\n\n');
  const chunks: WrittenChunk[] = [];
  for (const section of splitSections(markdown, OVERVIEW_ANCHOR[lang])) {
    // A heading with nothing under it (a page that opens on a heading) is no passage.
    if (section.heading !== null && section.text === section.heading && !section.raw.includes('\n')) continue;
    pieces(section.text, MAX_CHUNK_CHARS).forEach((text, i) => {
      chunks.push({ anchor: i === 0 ? section.anchor : `${section.anchor}--${i + 1}`, heading: section.heading, text });
    });
  }
  return { markdown, chunks };
}
