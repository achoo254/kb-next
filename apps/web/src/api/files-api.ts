/**
 * Stored files (apps/server/src/api/file-routes.ts) as typed calls (uploading with progress is upload-api.ts): the
 * account's uploads and their processing (C16), retrying, cancelling, answering Jev's suggestions, downloading a file's
 * bytes and saving a new version from the Office editor (with the server's version on a conflict, H04), and where the
 * editor lives.
 *
 * Errors (ApiError.code): `sign-in-required` (401); `too-large` (413); `unsupported-type`, `wrong-content`,
 * `encrypted`, `wrong-kind` (415); `no-file`, `invalid-body`, `unknown-collection` (400); `not-found` (404),
 * `hidden` / `no-access` / `locked` (403); `not-editable`, `answered`, `stale` (409); `rate-limited` (429);
 * `network` (no answer); `aborted` (the upload was cancelled here).
 */
import * as z from 'zod/mini';
import { ApiError, BAD_RESPONSE, NETWORK_ERROR, apiFetch, getJson } from './api-client';

export const FILE_KINDS = ['docx', 'xlsx', 'pptx', 'pdf', 'md'] as const;
export type FileKind = (typeof FILE_KINDS)[number];
/** The kinds the Office editor opens and saves. */
export const EDITABLE_KINDS: ReadonlySet<FileKind> = new Set(['docx', 'xlsx', 'pptx']);
/** Largest file taken (the server refuses more too). */
export const MAX_UPLOAD_BYTES = 25 * 1024 * 1024;
/** The code of an upload cancelled in this browser. */
export const ABORTED = 'aborted';

const EXTENSIONS: Readonly<Record<string, FileKind>> = { docx: 'docx', xlsx: 'xlsx', pptx: 'pptx', pdf: 'pdf', md: 'md', markdown: 'md' };

/** The kind a file name says (as the server reads it); null for a kind not taken. */
export function kindOfName(name: string): FileKind | null {
  const match = /\.([A-Za-z]+)$/.exec(name);
  return match?.[1] ? (EXTENSIONS[match[1].toLowerCase()] ?? null) : null;
}

/** The server's checks a browser can make before sending: the kind by name and the size. */
export function checkBeforeUpload(file: Pick<File, 'name' | 'size'>): 'unsupported-type' | 'too-large' | null {
  if (!kindOfName(file.name)) return 'unsupported-type';
  if (file.size > MAX_UPLOAD_BYTES) return 'too-large';
  return null;
}

const Time = z.iso.datetime({ offset: true });
const PlaceSpaceSchema = z.object({ slug: z.string(), nameVi: z.string(), nameEn: z.string() });

export const StoredFileSchema = z.object({
  id: z.string(),
  documentId: z.string(),
  name: z.string(),
  kind: z.enum(FILE_KINDS),
  size: z.number(),
  version: z.number(),
  savedAt: Time,
});
export type StoredFile = z.infer<typeof StoredFileSchema>;

export const STEP_NAMES = ['upload', 'ocr', 'structure', 'chunk', 'classify', 'index'] as const;
export type StepName = (typeof STEP_NAMES)[number];
export const STEP_STATES = ['pending', 'running', 'done', 'failed', 'skipped'] as const;
export type StepState = (typeof STEP_STATES)[number];
export const FIX_HINTS = ['rescan', 'export-text-pdf', 'remove-password', 'resave-file', 'convert-format', 'smaller-file', 'upload-again', 'retry-later'] as const;
export type FixHint = (typeof FIX_HINTS)[number];

const StepSchema = z.object({
  step: z.enum(STEP_NAMES),
  state: z.enum(STEP_STATES),
  detail: z.optional(
    z.object({
      pages: z.optional(z.number()),
      ocrPages: z.optional(z.array(z.number())),
      quality: z.optional(z.nullable(z.number())),
      lowQualityPages: z.optional(z.array(z.object({ page: z.number(), score: z.number(), hint: z.enum(FIX_HINTS) }))),
      format: z.optional(z.string()),
      chunks: z.optional(z.number()),
      reason: z.optional(z.string()),
    }),
  ),
});
export type ProcessingStep = z.infer<typeof StepSchema>;

const ProcessingSchema = z.object({
  status: z.enum(['queued', 'running', 'waiting', 'done', 'failed']),
  steps: z.array(StepSchema),
  attempts: z.number(),
  maxAttempts: z.number(),
  error: z.nullable(z.object({ code: z.string(), hint: z.nullable(z.enum(FIX_HINTS)) })),
  nextAttemptAt: z.nullable(Time),
  updatedAt: Time,
  finishedAt: z.nullable(Time),
});
export type Processing = z.infer<typeof ProcessingSchema>;

const SuggestionsSchema = z.object({
  status: z.enum(['pending', 'accepted', 'dismissed']),
  collection: z.nullable(z.object({ collectionId: z.string(), probability: z.number(), space: PlaceSpaceSchema, nameVi: z.string(), nameEn: z.string() })),
  tags: z.array(z.object({ tag: z.string(), probability: z.number() })),
});
export type Suggestions = z.infer<typeof SuggestionsSchema>;

export const UploadSchema = z.object({
  fileId: z.string(),
  documentId: z.string(),
  name: z.string(),
  kind: z.nullable(z.enum(FILE_KINDS)),
  size: z.number(),
  createdAt: Time,
  space: z.extend(PlaceSpaceSchema, { kind: z.enum(['public', 'personal']) }),
  collection: z.nullable(z.object({ id: z.string(), nameVi: z.string(), nameEn: z.string() })),
  processing: z.nullable(ProcessingSchema),
  suggestions: z.nullable(SuggestionsSchema),
});
export type Upload = z.infer<typeof UploadSchema>;

export function fetchUploads(): Promise<Upload[]> {
  return getJson(z.object({ files: z.array(UploadSchema) }), '/api/files').then((body) => body.files);
}

export function retryProcessing(fileId: string): Promise<void> {
  return apiFetch(`/api/files/${encodeURIComponent(fileId)}/retry`, { method: 'POST' }).then(() => undefined);
}

/** Stops a file's processing (C16 "Huỷ"); resolves whether anything was stopped. */
export function cancelProcessing(fileId: string): Promise<boolean> {
  return getJson(z.object({ cancelled: z.boolean() }), `/api/files/${encodeURIComponent(fileId)}/cancel`, { method: 'POST' }).then((body) => body.cancelled);
}

export type SuggestionAnswer = { action: 'accept'; collection: boolean; tags: string[] } | { action: 'dismiss' };

export function answerSuggestions(fileId: string, answer: SuggestionAnswer): Promise<void> {
  return apiFetch(`/api/files/${encodeURIComponent(fileId)}/suggestions`, { method: 'POST', body: JSON.stringify(answer) }).then(() => undefined);
}

const EditorConfigSchema = z.object({ origin: z.nullable(z.string()), maxBytes: z.number() });
export type EditorConfig = z.infer<typeof EditorConfigSchema>;

export function fetchEditorConfig(): Promise<EditorConfig> {
  return getJson(EditorConfigSchema, '/api/office-editor');
}

/** The bytes of a stored file the viewer may read. */
export async function fetchFileBytes(fileId: string): Promise<ArrayBuffer> {
  const res = await apiFetch(`/api/files/${encodeURIComponent(fileId)}`);
  return res.arrayBuffer();
}

/** A body as JSON; undefined when it is not (a proxy's error page). */
export function parseJson(text: string): unknown {
  try {
    return JSON.parse(text) as unknown;
  } catch {
    return undefined;
  }
}

/** The API's error code of an answer's body, else `http-<status>`. */
export function codeOf(text: string, status: number): string {
  const body = parseJson(text);
  if (typeof body === 'object' && body !== null && 'error' in body && typeof body.error === 'string') return body.error;
  return `http-${status}`;
}

export interface ServerVersion {
  /** The file of the document's current version (null: it is no longer a file). */
  fileId: string | null;
  version: number;
  savedAt: string;
}

export type FileSaveOutcome = { kind: 'saved'; file: StoredFile } | { kind: 'conflict'; current: ServerVersion };

const ConflictSchema = z.object({ error: z.literal('conflict'), current: z.object({ fileId: z.nullable(z.string()), version: z.number(), savedAt: Time }) });

/**
 * Saves the editor's file as the next version of the document `baseFileId` belongs to: `conflict` (with the
 * server's version) when someone saved since that file was opened.
 */
export async function saveFileVersion(baseFileId: string, file: Blob, name: string): Promise<FileSaveOutcome> {
  const form = new FormData();
  form.append('file', file, name);
  let res: Response;
  try {
    res = await fetch(`/api/files/${encodeURIComponent(baseFileId)}`, { method: 'PUT', body: form, credentials: 'same-origin' });
  } catch {
    throw new ApiError(0, NETWORK_ERROR);
  }
  const text = await res.text();
  if (res.status === 409) {
    const conflict = ConflictSchema.safeParse(parseJson(text));
    if (conflict.success) return { kind: 'conflict', current: conflict.data.current };
  }
  if (!res.ok) throw new ApiError(res.status, codeOf(text, res.status));
  const parsed = z.object({ file: StoredFileSchema }).safeParse(parseJson(text));
  if (!parsed.success) throw new ApiError(res.status, BAD_RESPONSE);
  return { kind: 'saved', file: parsed.data.file };
}
