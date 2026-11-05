/**
 * The Canvas API (apps/server/src/api/canvas-routes.ts) as typed calls: the account's boards (C15), one board, its
 * autosave and Jev's suggested connection. Only the owner ever reads or writes a board.
 *
 * Errors (ApiError.code): `not-found` (404: no such board, or someone else's), `no-access` (403: a new document card
 * the account may not read, or a Space it cannot see), `stale` (409: a newer save of this board exists, from another
 * tab), `invalid-body` (400), `jev-off` (503), `jev-failed` (502), `rate-limited` (429), `network` offline.
 */
import * as z from 'zod/mini';
import { apiFetch, getJson } from './api-client';
import { DOCUMENT_ORIGINS, DOCUMENT_STATUSES, DOCUMENT_TYPES } from './content-api';

export const CARD_KINDS = ['document', 'note', 'idea', 'risk', 'answer', 'diagram', 'link'] as const;
export type CardKind = (typeof CARD_KINDS)[number];
export const MAX_CARDS = 200;
export const CARD_MIN_WIDTH = 160;
export const CARD_MAX_WIDTH = 480;

const CardSchema = z.object({
  id: z.string(),
  kind: z.enum(CARD_KINDS),
  x: z.number(),
  y: z.number(),
  w: z.number(),
  title: z.string(),
  body: z.optional(z.string()),
  steps: z.optional(z.array(z.string())),
  documentId: z.optional(z.string()),
  url: z.optional(z.string()),
});
export type Card = z.infer<typeof CardSchema>;

const ConnectionSchema = z.object({ id: z.string(), from: z.string(), to: z.string() });
export type Connection = z.infer<typeof ConnectionSchema>;

export const CanvasDataSchema = z.object({ rev: z.number(), cards: z.array(CardSchema), connections: z.array(ConnectionSchema) });
export type CanvasData = z.infer<typeof CanvasDataSchema>;

const CanvasDocumentSchema = z.object({
  title: z.string(),
  type: z.enum(DOCUMENT_TYPES),
  origin: z.enum(DOCUMENT_ORIGINS),
  status: z.enum(DOCUMENT_STATUSES),
  headings: z.array(z.string()),
});
export type CanvasDocument = z.infer<typeof CanvasDocumentSchema>;

const CanvasSchema = z.object({
  id: z.string(),
  title: z.string(),
  updatedAt: z.string(),
  space: z.nullable(z.object({ slug: z.string(), nameVi: z.string(), nameEn: z.string(), tint: z.string(), glow: z.string() })),
  canvas: CanvasDataSchema,
  /** Documents of document cards the account may read; a card whose document is missing here cannot be opened. */
  documents: z.record(z.string(), CanvasDocumentSchema),
});
export type Canvas = z.infer<typeof CanvasSchema>;

const CanvasListSchema = z.object({
  canvases: z.array(z.object({ id: z.string(), title: z.string(), updatedAt: z.string(), spaceSlug: z.nullable(z.string()), cards: z.number() })),
});
export type CanvasListItem = z.infer<typeof CanvasListSchema>['canvases'][number];

const SavedSchema = z.object({ updatedAt: z.string(), rev: z.number() });
const SuggestionSchema = z.object({ suggestion: z.nullable(z.object({ from: z.string(), to: z.string(), relevance: z.number() })) });
export type CanvasSuggestion = NonNullable<z.infer<typeof SuggestionSchema>['suggestion']>;

export async function fetchCanvases(space?: string): Promise<CanvasListItem[]> {
  const query = space ? `?${new URLSearchParams({ space }).toString()}` : '';
  return (await getJson(CanvasListSchema, `/api/canvases${query}`)).canvases;
}

export function createCanvas(title: string, space: string | null): Promise<Canvas> {
  return getJson(CanvasSchema, '/api/canvases', { method: 'POST', body: JSON.stringify({ title, space }) });
}

export function fetchCanvas(id: string): Promise<Canvas> {
  return getJson(CanvasSchema, `/api/canvases/${encodeURIComponent(id)}`);
}

/**
 * Saves the whole board. `keepalive`: the request outlives the page (sent while the tab closes; the browser caps such
 * a body at 64 kB, so a bigger board relies on the copy kept in this browser).
 */
export function saveCanvas(id: string, title: string, canvas: CanvasData, keepalive = false): Promise<{ updatedAt: string; rev: number }> {
  return getJson(SavedSchema, `/api/canvases/${encodeURIComponent(id)}`, { method: 'PUT', body: JSON.stringify({ title, canvas }), keepalive });
}

export async function deleteCanvas(id: string): Promise<void> {
  await apiFetch(`/api/canvases/${encodeURIComponent(id)}`, { method: 'DELETE' });
}

/** Jev's best pair of unconnected cards (the saved board), skipping the pairs in `exclude`; null when none fits. */
export async function fetchCanvasSuggestion(id: string, exclude: ReadonlyArray<readonly [string, string]> = []): Promise<CanvasSuggestion | null> {
  return (await getJson(SuggestionSchema, `/api/canvases/${encodeURIComponent(id)}/suggestion`, { method: 'POST', body: JSON.stringify({ exclude }) })).suggestion;
}
