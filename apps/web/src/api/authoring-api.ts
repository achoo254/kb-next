/**
 * Writing (apps/server/src/api/authoring-routes.ts, my-content-routes.ts, history-routes.ts and
 * copilot/write-routes.ts) as typed calls: the editor (C02), creating a note, "Của tôi" (C08: own documents, recent,
 * favourites, trash), versions and activity (C17), and "AI viết hộ" on the writer's own key.
 *
 * Errors (ApiError.code): `sign-in-required` (401); `not-found` (404), `hidden` / `no-access` (403: not theirs),
 * `locked` (403: waiting for review or published; changes go through review), `not-editable` (409: a stored file);
 * `stale` (409: saved elsewhere since this copy); `invalid-body`,
 * `unknown-collection` (400); `admin-only` (403); `slug-taken` (409); `rate-limited` (429); `network` (offline).
 * AI writing as in copilot-api.ts: `USER_KEYS_DISABLED` (503), `NO_USER_KEY` / `USER_KEY_UNREADABLE` (403) before
 * the stream, `error` events in it.
 */
import * as z from 'zod/mini';
import { apiFetch, getJson } from './api-client';
import { CollectionBriefSchema, DOCUMENT_ORIGINS, DOCUMENT_STATUSES, DOCUMENT_TYPES, DocumentSummarySchema, LANGS, SpaceBriefSchema } from './content-api';
import { StreamErrorSchema, typedEvents } from './copilot-api';
import { AI_PROVIDERS } from './keys-api';

/** The planet colours of a document (C02 "Hành tinh của bài"), in the board's order. */
export const PLANETS = ['violet', 'teal', 'cyan', 'amber', 'emerald', 'pink'] as const;
export type Planet = (typeof PLANETS)[number];
export const WRITE_TASKS = ['continue', 'shorten', 'outline', 'explain'] as const;
export type WriteTask = (typeof WRITE_TASKS)[number];
export const MAX_TITLE_CHARS = 200;
export const MAX_BODY_CHARS = 200_000;
/** Characters of the draft "AI viết hộ" sends (the server reads at most 12 000 of them). */
export const MAX_WRITE_TEXT_CHARS = 48_000;

const Time = z.iso.datetime({ offset: true });
const PlanetSchema = z.enum(PLANETS);

export const EditableDocumentSchema = z.object({
  id: z.string(),
  title: z.string(),
  /** Markdown without the `#` title line. */
  body: z.string(),
  type: z.enum(DOCUMENT_TYPES),
  lang: z.enum(LANGS),
  origin: z.enum(DOCUMENT_ORIGINS),
  status: z.enum(DOCUMENT_STATUSES),
  planet: z.nullable(PlanetSchema),
  /** Send back as `baseRev` with the next save. */
  rev: Time,
  version: z.number(),
  /** When the latest version was last saved ("Đã lưu 21:24"). */
  savedAt: Time,
  space: z.extend(SpaceBriefSchema, { kind: z.enum(['public', 'personal']) }),
  collection: z.nullable(CollectionBriefSchema),
});
export type EditableDocument = z.infer<typeof EditableDocumentSchema>;

const SaveSchema = z.object({ rev: Time, version: z.number(), savedAt: Time, changed: z.boolean() });
export type SaveResult = z.infer<typeof SaveSchema>;

const LinksSchema = z.object({ backlinks: z.array(DocumentSummarySchema), outgoing: z.array(DocumentSummarySchema) });
export type DocumentLinks = z.infer<typeof LinksSchema>;

const SuggestionSchema = z.object({
  id: z.string(),
  title: z.string(),
  type: z.enum(DOCUMENT_TYPES),
  origin: z.enum(DOCUMENT_ORIGINS),
  status: z.enum(DOCUMENT_STATUSES),
  space: SpaceBriefSchema,
});
export type LinkSuggestion = z.infer<typeof SuggestionSchema>;

export interface NewDocumentRequest {
  title?: string;
  body?: string;
  type?: 'note' | 'process';
  /** A public Space's slug or the writer's own; default: their personal Space. */
  space?: string;
  collection?: string;
  lang?: (typeof LANGS)[number];
  planet?: Planet | null;
}

export function createDocument(request: NewDocumentRequest = {}): Promise<EditableDocument> {
  return getJson(EditableDocumentSchema, '/api/documents', { method: 'POST', body: JSON.stringify(request) });
}

export function fetchEditable(id: string): Promise<EditableDocument> {
  return getJson(EditableDocumentSchema, `/api/documents/${encodeURIComponent(id)}/edit`);
}

export interface SaveRequest {
  title: string;
  body: string;
  planet?: Planet | null;
  baseRev: string;
}

/**
 * Saves the editor's text; ApiError `stale` when another save landed since `baseRev` (fetch the document again for
 * its current `rev` to overwrite). `keepalive`: the request outlives the page (sent on leaving).
 */
export function saveDocument(id: string, request: SaveRequest, keepalive = false): Promise<SaveResult> {
  return getJson(SaveSchema, `/api/documents/${encodeURIComponent(id)}`, { method: 'PUT', body: JSON.stringify(request), keepalive });
}

export async function trashDocument(id: string): Promise<void> {
  await apiFetch(`/api/documents/${encodeURIComponent(id)}`, { method: 'DELETE' });
}

export async function restoreFromTrash(id: string): Promise<void> {
  await apiFetch(`/api/documents/${encodeURIComponent(id)}/restore`, { method: 'POST' });
}

export function fetchDocumentLinks(id: string): Promise<DocumentLinks> {
  return getJson(LinksSchema, `/api/documents/${encodeURIComponent(id)}/links`);
}

export async function suggestLinks(query: string, exclude?: string): Promise<LinkSuggestion[]> {
  const params = new URLSearchParams({ q: query });
  if (exclude) params.set('exclude', exclude);
  return (await getJson(z.object({ documents: z.array(SuggestionSchema) }), `/api/link-suggestions?${params.toString()}`)).documents;
}

export async function setFavorite(id: string, on: boolean): Promise<void> {
  await apiFetch(`/api/documents/${encodeURIComponent(id)}/favorite`, { method: on ? 'PUT' : 'DELETE' });
}

// ── "Của tôi" (C08) ──

const ReviewSchema = z.object({
  action: z.enum(['submitted', 'approved', 'changes_requested', 'rejected']),
  reason: z.nullable(z.string()),
  by: z.nullable(z.string()),
  at: Time,
});

export const MyDocumentSchema = z.extend(DocumentSummarySchema, {
  planet: z.nullable(z.string()),
  favorite: z.boolean(),
  /** The latest review event ("Lý do · Thiếu nguồn … · Linh"); null when never reviewed. */
  review: z.nullable(ReviewSchema),
});
export type MyDocument = z.infer<typeof MyDocumentSchema>;

const MyDocumentsSchema = z.object({ documents: z.array(MyDocumentSchema) });
const RecentSchema = z.object({ documents: z.array(z.extend(MyDocumentSchema, { at: Time })) });
const FavoritesSchema = z.object({ documents: z.array(z.extend(MyDocumentSchema, { favoritedAt: Time })) });
const TrashSchema = z.object({ documents: z.array(z.extend(MyDocumentSchema, { deletedAt: Time, purgeAt: Time })) });
export type RecentDocument = z.infer<typeof RecentSchema>['documents'][number];
export type FavoriteDocument = z.infer<typeof FavoritesSchema>['documents'][number];
export type TrashedDocument = z.infer<typeof TrashSchema>['documents'][number];

export async function fetchMyDocuments(filter: { type?: (typeof DOCUMENT_TYPES)[number]; status?: (typeof DOCUMENT_STATUSES)[number] } = {}): Promise<MyDocument[]> {
  const params = new URLSearchParams();
  if (filter.type) params.set('type', filter.type);
  if (filter.status) params.set('status', filter.status);
  const query = params.toString();
  return (await getJson(MyDocumentsSchema, `/api/me/documents${query ? `?${query}` : ''}`)).documents;
}

export async function fetchMyRecent(): Promise<RecentDocument[]> {
  return (await getJson(RecentSchema, '/api/me/recent')).documents;
}

export async function fetchFavorites(): Promise<FavoriteDocument[]> {
  return (await getJson(FavoritesSchema, '/api/me/favorites')).documents;
}

export async function fetchTrash(): Promise<TrashedDocument[]> {
  return (await getJson(TrashSchema, '/api/me/trash')).documents;
}

// ── Spaces and Collections ──

const CreatedSpaceSchema = z.extend(SpaceBriefSchema, { kind: z.enum(['public', 'personal']), art: z.string() });

export function ensurePersonalSpace(): Promise<{ space: z.infer<typeof CreatedSpaceSchema>; created: boolean }> {
  return getJson(z.object({ space: CreatedSpaceSchema, created: z.boolean() }), '/api/me/space', { method: 'POST' });
}

export async function createCollection(space: string, nameVi: string, nameEn?: string): Promise<z.infer<typeof CollectionBriefSchema> & { spaceSlug: string }> {
  const body = await getJson(z.object({ collection: z.extend(CollectionBriefSchema, { spaceSlug: z.string() }) }), '/api/collections', {
    method: 'POST',
    body: JSON.stringify({ space, nameVi, ...(nameEn ? { nameEn } : {}) }),
  });
  return body.collection;
}

// ── AI viết hộ (C02) ──

const Provider = z.enum(AI_PROVIDERS);
const WriteEventSchemas = {
  delta: z.object({ text: z.string() }),
  done: z.object({ provider: Provider, model: z.string(), last4: z.string() }),
  error: StreamErrorSchema,
};

export type WriteEvent = { event: 'delta'; data: { text: string } } | { event: 'done'; data: z.infer<typeof WriteEventSchemas.done> } | { event: 'error'; data: z.infer<typeof StreamErrorSchema> };

export interface WriteRequest {
  task: WriteTask;
  title: string;
  /** The draft as it stands in the editor. */
  text: string;
  selection?: string;
}

/** Streams the writer's own model's suggestion; `signal` stops it ("Dừng"). */
export async function* streamWrite(request: WriteRequest, signal?: AbortSignal): AsyncGenerator<WriteEvent> {
  const body: WriteRequest = { ...request, text: request.text.slice(-MAX_WRITE_TEXT_CHARS) };
  const res = await apiFetch('/api/write', { method: 'POST', body: JSON.stringify(body), signal });
  yield* typedEvents(res, WriteEventSchemas);
}

