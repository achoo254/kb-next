/**
 * Review (apps/server/src/api/review-routes.ts, admin-api-routes.ts) as typed calls: sending a text for review and
 * taking it back (C06, C08, C04), and the admins' screens on the web session: the review queue with Jev's
 * pre-review (A01), published texts with hiding and showing (A02), admin tokens and the call log (A03).
 *
 * Errors (ApiError.code): `sign-in-required` (401); `reviewer-only` (403) on the review queue and its decisions,
 * `admin-only` (403) on the other admin calls; `not-found` (404), `no-access` (403); `title-required` / `body-required` (400: what to fix before sending); `already-pending` /
 * `not-submittable` (409); `not-pending` (409: decided or withdrawn meanwhile); `not-approved` (409: hiding a text
 * that is not published); `unknown-collection` / `invalid-body` (400); `rate-limited` (429); `network` (offline).
 */
import * as z from 'zod/mini';
import { apiFetch, getJson } from './api-client';
import { CollectionBriefSchema, DOCUMENT_ORIGINS, DOCUMENT_TYPES, LANGS, SpaceBriefSchema } from './content-api';

const Time = z.iso.datetime({ offset: true });
const json = (body: unknown): RequestInit => ({ method: 'POST', body: JSON.stringify(body) });
const path = (id: string): string => encodeURIComponent(id);

const SubmitResponseSchema = z.object({
  status: z.literal('pending'),
  /** Its place among the texts waiting (C06 "Vị trí 3 trong hàng"). */
  queuePosition: z.number(),
  submittedAt: Time,
  /** Whether Jev's pre-review ran (its scores are for admins only). */
  preReviewed: z.boolean(),
});
export type SubmitResponse = z.infer<typeof SubmitResponseSchema>;

export interface SubmitRequest {
  /** A Space the author may write in (its slug), and one of its Collections (C04). */
  space?: string;
  collection?: string;
  tags?: string[];
  /** Its original language (C04 "Ngôn ngữ gốc"). */
  lang?: 'vi' | 'en';
}

/** Sends the author's text for review (C06). */
export function submitForReview(id: string, request: SubmitRequest = {}): Promise<SubmitResponse> {
  return getJson(SubmitResponseSchema, `/api/documents/${path(id)}/submit`, json(request));
}

/** Keeps the author's text to themselves (C04 "Riêng tư"), placed and tagged; a text waiting leaves the queue. */
export async function keepPrivate(id: string, request: SubmitRequest = {}): Promise<void> {
  await apiFetch(`/api/documents/${path(id)}/private`, json(request));
}

/** Takes a text out of the queue: back to a draft (C08 "Rút lại"). */
export async function withdrawSubmission(id: string): Promise<void> {
  await apiFetch(`/api/documents/${path(id)}/withdraw`, { method: 'POST' });
}

const Score = z.nullable(z.number());

export const ReviewQueueItemSchema = z.object({
  id: z.string(),
  title: z.string(),
  type: z.enum(DOCUMENT_TYPES),
  lang: z.enum(LANGS),
  origin: z.enum(DOCUMENT_ORIGINS),
  authorName: z.nullable(z.string()),
  submittedAt: Time,
  updatedAt: Time,
  space: SpaceBriefSchema,
  collection: z.nullable(CollectionBriefSchema),
  tags: z.array(z.string()),
  /** Jev's pre-review, 0–1 each; null when Jev was off or failed (a judgment it did not make is null). */
  preReview: z.nullable(
    z.object({
      onTopic: Score,
      hasSources: Score,
      duplicate: Score,
      inappropriate: Score,
      duplicateOf: z.nullable(z.object({ id: z.string(), title: z.string() })),
    }),
  ),
});
export type ReviewQueueItem = z.infer<typeof ReviewQueueItemSchema>;
export type PreReview = NonNullable<ReviewQueueItem['preReview']>;

const QueueSchema = z.object({ documents: z.array(ReviewQueueItemSchema) });

/** The review queue (A01), the latest sent first. */
export async function fetchReviewQueue(): Promise<ReviewQueueItem[]> {
  return (await getJson(QueueSchema, '/api/moderation/queue')).documents;
}

export const REVIEW_DECISIONS = ['approved', 'changes_requested', 'rejected'] as const;
export type ReviewDecision = (typeof REVIEW_DECISIONS)[number];

const DecisionSchema = z.object({ id: z.string(), status: z.enum(['approved', 'changes_requested', 'rejected']), origin: z.enum(DOCUMENT_ORIGINS) });

/** An admin's verdict (A01); `reason` (what the author reads) is required unless approving. */
export function decideReview(id: string, decision: ReviewDecision, reason?: string): Promise<z.infer<typeof DecisionSchema>> {
  return getJson(DecisionSchema, `/api/moderation/documents/${path(id)}/decision`, json(reason === undefined ? { decision } : { decision, reason }));
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
