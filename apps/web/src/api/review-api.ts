/**
 * Publishing (apps/server/src/api/review-routes.ts, admin-api-routes.ts) as typed calls: the author publishing a text
 * or keeping it private (C04, C06, C08), and the admins' screens on the web session: published texts with hiding and
 * showing (A02), admin tokens and the call log (A03).
 *
 * Errors (ApiError.code): `sign-in-required` (401); `admin-only` (403) on the admin calls; `not-found` (404),
 * `no-access` (403); `title-required` / `body-required` (400: what to fix before publishing); `already-published`
 * (409); `not-approved` (409: hiding a text that is not published); `unknown-collection` / `invalid-body` (400);
 * `rate-limited` (429); `network` (offline).
 */
import * as z from 'zod/mini';
import { apiFetch, getJson } from './api-client';
import { CollectionBriefSchema, DOCUMENT_ORIGINS, DOCUMENT_TYPES, LANGS, SpaceBriefSchema } from './content-api';

const Time = z.iso.datetime({ offset: true });
const json = (body: unknown): RequestInit => ({ method: 'POST', body: JSON.stringify(body) });
const path = (id: string): string => encodeURIComponent(id);

const PublishResponseSchema = z.object({
  status: z.literal('approved'),
  /** An admin hid it earlier: published, but off the Universe until an admin shows it. */
  hidden: z.boolean(),
  publishedAt: Time,
});
export type PublishResponse = z.infer<typeof PublishResponseSchema>;

export interface PublishRequest {
  /** A Space the author may write in (its slug), and one of its Collections (C04). */
  space?: string;
  collection?: string;
  tags?: string[];
  /** Its original language (C04 "Ngôn ngữ gốc"). */
  lang?: 'vi' | 'en';
}

/** Publishes the author's text at once (C04 "Đăng công khai", C06). */
export function publishDocument(id: string, request: PublishRequest = {}): Promise<PublishResponse> {
  return getJson(PublishResponseSchema, `/api/documents/${path(id)}/submit`, json(request));
}

/** Keeps the author's text to themselves (C04 "Lưu riêng tư", C08 "Gỡ xuống"): a published text is unpublished. */
export async function keepPrivate(id: string, request: PublishRequest = {}): Promise<void> {
  await apiFetch(`/api/documents/${path(id)}/private`, json(request));
}

export const PublishedItemSchema = z.object({
  id: z.string(),
  title: z.string(),
  type: z.enum(DOCUMENT_TYPES),
  lang: z.enum(LANGS),
  origin: z.enum(DOCUMENT_ORIGINS),
  hidden: z.boolean(),
  authorName: z.nullable(z.string()),
  createdAt: Time,
  updatedAt: Time,
  /** Accounts that opened it. */
  opens: z.number(),
  /** A version of it was written by AI (the "AI" badge). */
  aiMade: z.boolean(),
  translations: z.array(z.enum(LANGS)),
  /** With its crystal (A02 draws each text with its Space's crystal). */
  space: z.extend(SpaceBriefSchema, { art: z.string() }),
  collection: z.nullable(CollectionBriefSchema),
  tags: z.array(z.string()),
});
export type PublishedItem = z.infer<typeof PublishedItemSchema>;

const PublishedSchema = z.object({ documents: z.array(PublishedItemSchema) });

export interface PublishedFilter {
  origin?: 'official' | 'community';
  visibility?: 'visible' | 'hidden';
  q?: string;
}

/** Published texts (A02), hidden ones included. */
export async function fetchPublished(filter: PublishedFilter = {}): Promise<PublishedItem[]> {
  const query = new URLSearchParams();
  if (filter.origin) query.set('origin', filter.origin);
  if (filter.visibility) query.set('visibility', filter.visibility);
  if (filter.q) query.set('q', filter.q);
  const qs = query.toString();
  return (await getJson(PublishedSchema, `/api/moderation/published${qs ? `?${qs}` : ''}`)).documents;
}

export interface PostPatch {
  hidden?: boolean;
  title?: string;
  tags?: string[];
  /** A public Space's slug, or a Collection's id: where the text moves. */
  space?: string;
  collection?: string;
}

/** Hides, shows or edits a published text (A02); the answer's `opens` and `aiMade` are not recomputed (keep the list's). */
export function updatePublished(id: string, patch: PostPatch): Promise<PublishedItem> {
  return getJson(PublishedItemSchema, `/api/moderation/documents/${path(id)}`, { method: 'PATCH', body: JSON.stringify(patch) });
}

export const AdminTokenSchema = z.object({
  id: z.string(),
  label: z.string(),
  /** The only part of the token ever shown again. */
  last4: z.string(),
  createdAt: Time,
  lastUsedAt: z.nullable(Time),
  revokedAt: z.nullable(Time),
  createdByName: z.nullable(z.string()),
});
export type AdminToken = z.infer<typeof AdminTokenSchema>;

const TokensSchema = z.object({ tokens: z.array(AdminTokenSchema) });
const CreatedTokenSchema = z.object({ token: z.string(), info: AdminTokenSchema });

/** Every admin token, the latest made first (A03). */
export async function fetchAdminTokens(): Promise<AdminToken[]> {
  return (await getJson(TokensSchema, '/api/moderation/tokens')).tokens;
}

/** Makes a token and revokes the live ones (A03 "Tạo và thu hồi token cũ"); `token` is shown this once only. */
export function createAdminToken(label: string): Promise<{ token: string; info: AdminToken }> {
  return getJson(CreatedTokenSchema, '/api/moderation/tokens', json({ label }));
}

export async function revokeAdminToken(id: string): Promise<void> {
  await apiFetch(`/api/moderation/tokens/${path(id)}`, { method: 'DELETE' });
}

export const AdminCallSchema = z.object({
  id: z.string(),
  method: z.string(),
  path: z.string(),
  status: z.number(),
  error: z.nullable(z.string()),
  document: z.nullable(z.object({ id: z.string(), title: z.string() })),
  at: Time,
});
export type AdminCall = z.infer<typeof AdminCallSchema>;

const CallsSchema = z.object({ calls: z.array(AdminCallSchema) });

/** The latest calls to the admin API (A03), newest first. */
export async function fetchAdminCalls(): Promise<AdminCall[]> {
  return (await getJson(CallsSchema, '/api/moderation/calls')).calls;
}
