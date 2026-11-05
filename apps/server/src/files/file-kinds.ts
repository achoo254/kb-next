/**
 * The five kinds of file KnowFlow stores (docx, xlsx, pptx, pdf, md; decided 04/11/2026): the extension a name must
 * carry, the MIME type stored for it, and which kinds the Office editor opens. The content itself is checked by
 * sniff.ts: a name only says what the content must turn out to be.
 */
export const FILE_KINDS = ['docx', 'xlsx', 'pptx', 'pdf', 'md'] as const;
export type FileKind = (typeof FILE_KINDS)[number];

export const MIME_OF: Readonly<Record<FileKind, string>> = {
  docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  pptx: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  pdf: 'application/pdf',
  md: 'text/markdown; charset=utf-8',
};

/** Kinds the embedded editor (ranuts/document) opens and saves. */
export const EDITABLE_KINDS: ReadonlySet<FileKind> = new Set(['docx', 'xlsx', 'pptx']);

const EXTENSIONS: Readonly<Record<string, FileKind>> = { docx: 'docx', xlsx: 'xlsx', pptx: 'pptx', pdf: 'pdf', md: 'md', markdown: 'md' };

/** The kind a file name claims by its extension (case aside); null for any other name. */
export function kindOfName(name: string): FileKind | null {
  const match = /\.([A-Za-z]+)$/.exec(name);
  return match?.[1] ? (EXTENSIONS[match[1].toLowerCase()] ?? null) : null;
}

/** The kind of a stored MIME type (parameters aside); null for one KnowFlow does not store. */
export function kindOfMime(mime: string): FileKind | null {
  const base = mime.split(';')[0]?.trim().toLowerCase() ?? '';
  return FILE_KINDS.find((kind) => MIME_OF[kind].split(';')[0] === base) ?? null;
}

/** Longest file name kept (the document's title). */
const MAX_NAME_CHARS = 200;

/**
 * The name a browser sent, made safe to keep as a title: its last path segment, without control characters, NFC,
 * at most MAX_NAME_CHARS (the extension kept). Never used on disk: files are stored under a random key.
 */
export function cleanFileName(raw: string): string {
  const last = raw.split(/[/\\]/).pop() ?? '';
  // eslint-disable-next-line no-control-regex -- control characters are exactly what is removed here
  const name = last.normalize('NFC').replace(/[\u0000-\u001f\u007f]/g, '').trim();
  if (name.length <= MAX_NAME_CHARS) return name;
  const dot = name.lastIndexOf('.');
  const ext = dot > 0 && name.length - dot <= 10 ? name.slice(dot) : '';
  return name.slice(0, MAX_NAME_CHARS - ext.length) + ext;
}
