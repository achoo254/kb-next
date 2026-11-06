/**
 * A document's Markdown cut into chunks at its `##` and `###` headings (never inside a fenced code block). Each
 * chunk's anchor is its heading as a slug (Vietnamese diacritics folded), made unique within the document, so the
 * reader can compute the same anchor from the same heading. Text before the first heading is the overview chunk.
 */

/** Anchor of the passage before a document's first heading, per language (also used by AI translations). */
export const OVERVIEW_ANCHOR = { vi: 'tong-quan', en: 'overview' } as const;

export interface Section {
  anchor: string;
  heading: string | null;
  text: string;
  /** The section as written, heading line included. */
  raw: string;
}

const MAX_ANCHOR = 80;

/** `Bước 2 — Gửi ARP Request` → `buoc-2-gui-arp-request`. */
export function slugify(text: string): string {
  return text
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[đĐ]/g, 'd')
    .toLowerCase()
    .replace(/[`*_[\]()]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, MAX_ANCHOR)
    .replace(/-+$/, '');
}

const FENCE = /^\s*(`{3,}|~{3,})/;
const HEADING = /^(#{1,3})\s+(.+?)\s*#*\s*$/;

export function splitSections(markdown: string, overviewAnchor: string): Section[] {
  const sections: Section[] = [];
  // The n-th heading with a base gets `${base}-${n}`, as anchors always were (imported texts keep theirs); when that is
  // already some other heading's anchor ("Ví dụ", "Ví dụ", "Ví dụ 2"), the count goes on until one is free.
  const used = new Map<string, number>();
  const taken = new Set<string>([overviewAnchor]);
  const uniqueAnchor = (base: string): string => {
    const seen = used.get(base) ?? 0;
    used.set(base, seen + 1);
    let n = seen + 1;
    let candidate = seen === 0 ? base : `${base}-${n}`;
    while (taken.has(candidate)) {
      n += 1;
      candidate = `${base}-${n}`;
    }
    taken.add(candidate);
    return candidate;
  };
  used.set(overviewAnchor, 1);
  let current: { heading: string | null; anchor: string; headingLine: string | null; lines: string[] } = { heading: null, anchor: overviewAnchor, headingLine: null, lines: [] };
  used.set(overviewAnchor, 1);
  const flush = (): void => {
    const text = current.lines.join('\n').trim();
    if (!text && current.heading === null) return;
    const raw = [current.headingLine, ...current.lines].filter((line) => line !== null).join('\n').trim();
    sections.push({ anchor: current.anchor, heading: current.heading, text: text || current.heading || '', raw });
  };
  let fence: string | null = null;
  for (const line of markdown.split('\n')) {
    const fenceMatch = FENCE.exec(line);
    if (fenceMatch?.[1]) {
      const marker = fenceMatch[1];
      if (fence === null) fence = marker;
      else if (marker[0] === fence[0] && marker.length >= fence.length && line.trim() === marker) fence = null;
      current.lines.push(line);
      continue;
    }
    const heading = fence === null ? HEADING.exec(line) : null;
    if (heading?.[1] && heading[2]) {
      // The `#` title is the document's title field, not chunk text.
      if (heading[1].length === 1) continue;
      flush();
      const title = heading[2].replace(/\\([\\`*_{}[\]()#+\-.!])/g, '$1');
      current = { heading: title, anchor: uniqueAnchor(slugify(title) || 'muc'), headingLine: line, lines: [] };
      continue;
    }
    current.lines.push(line);
  }
  flush();
  return sections;
}

/** The `#` title line of a document: its first non-empty line, when that is a level-1 heading. */
export function titleLine(markdown: string): string | null {
  const first = markdown.split('\n').find((line) => line.trim() !== '');
  return first !== undefined && /^#\s+\S/.test(first) ? first : null;
}
