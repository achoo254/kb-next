/**
 * The text of an Office file read in the browser, for H04's side-by-side of two versions in conflict: the paragraphs
 * of a docx, the cell strings of an xlsx, the paragraphs of each slide of a pptx. Reads the zip's central directory
 * and inflates only the parts it needs (DecompressionStream). Not a renderer: what it cannot read gives no text.
 */
import type { FileKind } from '../api/files-api';

const ZIP_END = 0x06054b50;
const ZIP_CENTRAL = 0x02014b50;
const ZIP_LOCAL = 0x04034b50;
/** Inflated bytes read of one part: plenty for the paragraphs H04 compares, never a decompression bomb's worth. */
export const MAX_PART_BYTES = 2 * 1024 * 1024;

interface ZipPart {
  name: string;
  method: number;
  compressedSize: number;
  localOffset: number;
}

function zipParts(bytes: ArrayBuffer): ZipPart[] {
  const view = new DataView(bytes);
  let end = -1;
  for (let i = bytes.byteLength - 22; i >= Math.max(0, bytes.byteLength - 22 - 0xffff); i--) {
    if (view.getUint32(i, true) === ZIP_END) {
      end = i;
      break;
    }
  }
  if (end < 0) return [];
  const count = view.getUint16(end + 10, true);
  let at = view.getUint32(end + 16, true);
  const decoder = new TextDecoder();
  const parts: ZipPart[] = [];
  for (let n = 0; n < count && at + 46 <= bytes.byteLength; n++) {
    if (view.getUint32(at, true) !== ZIP_CENTRAL) break;
    const nameLength = view.getUint16(at + 28, true);
    parts.push({
      name: decoder.decode(new Uint8Array(bytes, at + 46, nameLength)),
      method: view.getUint16(at + 10, true),
      compressedSize: view.getUint32(at + 20, true),
      localOffset: view.getUint32(at + 42, true),
    });
    at += 46 + nameLength + view.getUint16(at + 30, true) + view.getUint16(at + 32, true);
  }
  return parts;
}

async function readPart(bytes: ArrayBuffer, part: ZipPart): Promise<string | null> {
  const view = new DataView(bytes);
  if (part.localOffset + 30 > bytes.byteLength || view.getUint32(part.localOffset, true) !== ZIP_LOCAL) return null;
  const start = part.localOffset + 30 + view.getUint16(part.localOffset + 26, true) + view.getUint16(part.localOffset + 28, true);
  const data = new Uint8Array(bytes, start, Math.min(part.compressedSize, bytes.byteLength - start));
  if (part.method === 0) return new TextDecoder().decode(data.subarray(0, MAX_PART_BYTES));
  if (part.method !== 8 || typeof DecompressionStream === 'undefined') return null;
  const reader = new Blob([data]).stream().pipeThrough(new DecompressionStream('deflate-raw')).getReader();
  // At most MAX_PART_BYTES inflated: a part that inflates to more (a zip bomb) is read only that far.
  const pieces: Uint8Array[] = [];
  let size = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    pieces.push(value);
    size += value.byteLength;
    if (size >= MAX_PART_BYTES) {
      await reader.cancel();
      break;
    }
  }
  const all = new Uint8Array(Math.min(size, MAX_PART_BYTES));
  let at = 0;
  for (const piece of pieces) {
    const take = piece.subarray(0, all.length - at);
    all.set(take, at);
    at += take.length;
    if (at >= all.length) break;
  }
  return new TextDecoder().decode(all);
}

const ENTITIES: Readonly<Record<string, string>> = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'" };

function decodeXml(text: string): string {
  return text.replace(/&(amp|lt|gt|quot|apos|#\d+|#x[0-9a-f]+);/gi, (whole, code: string) => {
    if (code.startsWith('#x') || code.startsWith('#X')) return String.fromCodePoint(Number.parseInt(code.slice(2), 16));
    if (code.startsWith('#')) return String.fromCodePoint(Number.parseInt(code.slice(1), 10));
    return ENTITIES[code.toLowerCase()] ?? whole;
  });
}

/** The text runs of each `block` element of `xml` (a paragraph, a shared string), joined per block. */
function blocks(xml: string, block: string, run: string): string[] {
  const out: string[] = [];
  const blockRe = new RegExp(`<${block}[\\s>][\\s\\S]*?</${block}>`, 'g');
  const runRe = new RegExp(`<${run}(?:\\s[^>]*)?>([^<]*)</${run}>`, 'g');
  for (const found of xml.matchAll(blockRe)) {
    const text = [...found[0].matchAll(runRe)].map((m) => decodeXml(m[1] ?? '')).join('').trim();
    if (text) out.push(text);
  }
  return out;
}

function slideNumber(name: string): number {
  return Number(/slide(\d+)\.xml$/.exec(name)?.[1] ?? 0);
}

/** The paragraphs of an Office file of `kind`; empty when it cannot be read. */
export async function officeParagraphs(bytes: ArrayBuffer, kind: FileKind): Promise<string[]> {
  try {
    const parts = zipParts(bytes);
    const find = (name: string): ZipPart | undefined => parts.find((part) => part.name === name);
    if (kind === 'docx') {
      const part = find('word/document.xml');
      const xml = part ? await readPart(bytes, part) : null;
      return xml ? blocks(xml, 'w:p', 'w:t') : [];
    }
    if (kind === 'xlsx') {
      const part = find('xl/sharedStrings.xml');
      const xml = part ? await readPart(bytes, part) : null;
      return xml ? blocks(xml, 'si', 't') : [];
    }
    if (kind === 'pptx') {
      const slides = parts.filter((part) => /^ppt\/slides\/slide\d+\.xml$/.test(part.name)).sort((a, b) => slideNumber(a.name) - slideNumber(b.name));
      const texts = await Promise.all(slides.map((part) => readPart(bytes, part)));
      return texts.flatMap((xml) => (xml ? blocks(xml, 'a:p', 'a:t') : []));
    }
    return [];
  } catch (error) {
    console.warn('office text unreadable', error);
    return [];
  }
}

export interface VersionComparison {
  /** The first paragraph of each version (what it is called). */
  localTitle: string | null;
  serverTitle: string | null;
  /** The paragraph just before the first difference (shared context), and each side's first differing paragraph. */
  context: string | null;
  local: string | null;
  server: string | null;
  /** Paragraphs only one side has, past the shared ones. */
  localExtra: number;
  serverExtra: number;
}

/** Where two versions' paragraphs part ways. */
export function compareParagraphs(local: readonly string[], server: readonly string[]): VersionComparison {
  let same = 0;
  while (same < local.length && same < server.length && local[same] === server[same]) same++;
  const serverSet = new Set(server);
  const localSet = new Set(local);
  return {
    localTitle: local[0] ?? null,
    serverTitle: server[0] ?? null,
    context: same > 0 ? (local[same - 1] ?? null) : null,
    local: local[same] ?? null,
    server: server[same] ?? null,
    localExtra: local.filter((p) => !serverSet.has(p)).length,
    serverExtra: server.filter((p) => !localSet.has(p)).length,
  };
}
