/**
 * Small Office files for upload tests, made on the fly: a zip (stored, no compression) with the parts that make a
 * docx, xlsx or pptx what it is, the given text in its main part. Not a file Word would open, but exactly what the
 * upload's content check and a Tika stand-in read.
 */
import { crc32 } from 'node:zlib';

interface ZipEntry {
  name: string;
  data: Buffer;
}

/** A zip archive of `entries`, stored without compression. */
export function makeZip(entries: readonly ZipEntry[]): Buffer {
  const locals: Buffer[] = [];
  const centrals: Buffer[] = [];
  let offset = 0;
  for (const entry of entries) {
    const name = Buffer.from(entry.name, 'utf8');
    const crc = crc32(entry.data);
    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(20, 4);
    local.writeUInt32LE(crc, 14);
    local.writeUInt32LE(entry.data.length, 18);
    local.writeUInt32LE(entry.data.length, 22);
    local.writeUInt16LE(name.length, 26);
    locals.push(local, name, entry.data);
    const central = Buffer.alloc(46);
    central.writeUInt32LE(0x02014b50, 0);
    central.writeUInt16LE(20, 4);
    central.writeUInt16LE(20, 6);
    central.writeUInt32LE(crc, 16);
    central.writeUInt32LE(entry.data.length, 20);
    central.writeUInt32LE(entry.data.length, 24);
    central.writeUInt16LE(name.length, 28);
    central.writeUInt32LE(offset, 42);
    centrals.push(central, name);
    offset += 30 + name.length + entry.data.length;
  }
  const centralSize = centrals.reduce((sum, part) => sum + part.length, 0);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(entries.length, 8);
  end.writeUInt16LE(entries.length, 10);
  end.writeUInt32LE(centralSize, 12);
  end.writeUInt32LE(offset, 16);
  return Buffer.concat([...locals, ...centrals, end]);
}

const CONTENT_TYPES = '<?xml version="1.0" encoding="UTF-8"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"/>';

/** A docx whose body is `text` (one `<w:t>` per paragraph, split on blank lines). */
export function makeDocx(text: string): Buffer {
  const paragraphs = text
    .split(/\n{2,}/)
    .map((p) => `<w:p><w:r><w:t>${p}</w:t></w:r></w:p>`)
    .join('');
  return makeZip([
    { name: '[Content_Types].xml', data: Buffer.from(CONTENT_TYPES) },
    { name: 'word/document.xml', data: Buffer.from(`<w:document><w:body>${paragraphs}</w:body></w:document>`) },
  ]);
}

export function makeXlsx(cell: string): Buffer {
  return makeZip([
    { name: '[Content_Types].xml', data: Buffer.from(CONTENT_TYPES) },
    { name: 'xl/workbook.xml', data: Buffer.from('<workbook/>') },
    { name: 'xl/sharedStrings.xml', data: Buffer.from(`<sst><si><t>${cell}</t></si></sst>`) },
  ]);
}

export function makePptx(title: string): Buffer {
  return makeZip([
    { name: '[Content_Types].xml', data: Buffer.from(CONTENT_TYPES) },
    { name: 'ppt/presentation.xml', data: Buffer.from('<presentation/>') },
    { name: 'ppt/slides/slide1.xml', data: Buffer.from(`<p:sld><a:t>${title}</a:t></p:sld>`) },
  ]);
}

/** The text of a docx made by makeDocx (what a Tika stand-in "extracts"). */
export function docxText(bytes: Buffer): string[] {
  return [...bytes.toString('utf8').matchAll(/<w:t>([^<]*)<\/w:t>/g)].map((m) => m[1] ?? '');
}

/** The first bytes of an OLE compound file: what a password-protected docx (or an old .doc) is. */
export const OLE_BYTES = Buffer.concat([Buffer.from([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1]), Buffer.alloc(504)]);
