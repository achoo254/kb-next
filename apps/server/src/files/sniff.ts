/**
 * What a stored file really is, from its bytes (never from its name or the browser's MIME type): a PDF by its
 * `%PDF-` header; docx, xlsx, pptx by their zip structure (a central directory naming `[Content_Types].xml` and the
 * part each kind must have); Markdown as UTF-8 text without control characters. A password-protected Office file
 * is not a zip but an OLE compound file (as are the old .doc, .xls, .ppt): reported apart so the reader learns to
 * remove the password. Reads the file in small pieces: never the whole of it in memory.
 */
import { open } from 'node:fs/promises';
import type { FileKind } from './file-kinds';

export type Sniffed = FileKind | 'ole' | null;

const PDF_MAGIC = Buffer.from('%PDF-', 'latin1');
const ZIP_LOCAL = 0x04034b50;
const ZIP_END = 0x06054b50;
const ZIP_CENTRAL = 0x02014b50;
const OLE_MAGIC = Buffer.from([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1]);
/** End-of-central-directory record (22 bytes) plus the longest zip comment. */
const ZIP_TAIL = 22 + 0xffff;
/** A central directory this large is no Office file KnowFlow takes (25 MB files have a few hundred parts). */
const MAX_CENTRAL_BYTES = 4 * 1024 * 1024;
const TEXT_CHUNK = 64 * 1024;

/** The part only that kind of OOXML package has. */
const OOXML_PARTS: ReadonlyArray<readonly [string, FileKind]> = [
  ['word/document.xml', 'docx'],
  ['xl/workbook.xml', 'xlsx'],
  ['ppt/presentation.xml', 'pptx'],
];

type Handle = Awaited<ReturnType<typeof open>>;

async function readAt(file: Handle, position: number, length: number): Promise<Buffer> {
  const buffer = Buffer.alloc(length);
  const { bytesRead } = await file.read(buffer, 0, length, position);
  return buffer.subarray(0, bytesRead);
}

/** Names in a zip's central directory; null when the structure is not a readable zip. */
async function zipEntryNames(file: Handle, size: number): Promise<string[] | null> {
  const tailStart = Math.max(0, size - ZIP_TAIL);
  const tail = await readAt(file, tailStart, size - tailStart);
  let end = -1;
  for (let i = tail.length - 22; i >= 0; i--) {
    if (tail.readUInt32LE(i) === ZIP_END) {
      end = i;
      break;
    }
  }
  if (end < 0) return null;
  const entries = tail.readUInt16LE(end + 10);
  const centralSize = tail.readUInt32LE(end + 12);
  const centralOffset = tail.readUInt32LE(end + 16);
  // 0xFFFF / 0xFFFFFFFF mean zip64: no Office file under 25 MB needs it.
  if (entries === 0xffff || centralSize > MAX_CENTRAL_BYTES || centralOffset + centralSize > size) return null;
  const central = await readAt(file, centralOffset, centralSize);
  const names: string[] = [];
  let at = 0;
  for (let n = 0; n < entries; n++) {
    if (at + 46 > central.length || central.readUInt32LE(at) !== ZIP_CENTRAL) return null;
    const nameLength = central.readUInt16LE(at + 28);
    const extraLength = central.readUInt16LE(at + 30);
    const commentLength = central.readUInt16LE(at + 32);
    if (at + 46 + nameLength > central.length) return null;
    names.push(central.toString('utf8', at + 46, at + 46 + nameLength));
    at += 46 + nameLength + extraLength + commentLength;
  }
  return names;
}

/** Whether the whole file is UTF-8 text with no control characters but tab, line breaks and form feed. */
async function isPlainText(file: Handle, size: number): Promise<boolean> {
  const decoder = new TextDecoder('utf-8', { fatal: true });
  for (let position = 0; position < size; position += TEXT_CHUNK) {
    const chunk = await readAt(file, position, Math.min(TEXT_CHUNK, size - position));
    let text: string;
    try {
      text = decoder.decode(chunk, { stream: position + chunk.length < size });
    } catch {
      return false;
    }
    // eslint-disable-next-line no-control-regex -- control characters are what marks a binary file
    if (/[\u0000-\u0008\u000b\u000e-\u001f\u007f]/.test(text)) return false;
  }
  return true;
}

/** What the file at `filePath` (of `size` bytes) is; null when it is none of the kinds KnowFlow takes. */
export async function sniffFile(filePath: string, size: number): Promise<Sniffed> {
  const file = await open(filePath, 'r');
  try {
    const head = await readAt(file, 0, 8);
    if (head.subarray(0, PDF_MAGIC.length).equals(PDF_MAGIC)) return 'pdf';
    if (head.length >= 8 && head.equals(OLE_MAGIC)) return 'ole';
    if (head.length >= 4 && head.readUInt32LE(0) === ZIP_LOCAL) {
      const names = await zipEntryNames(file, size);
      if (!names?.includes('[Content_Types].xml')) return null;
      const kinds = OOXML_PARTS.filter(([part]) => names.includes(part)).map(([, kind]) => kind);
      return kinds.length === 1 ? (kinds[0] ?? null) : null;
    }
    if (size === 0) return null;
    return (await isPlainText(file, size)) ? 'md' : null;
  } finally {
    await file.close();
  }
}
