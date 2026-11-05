/**
 * Share links (apps/server/src/api/share-routes.ts) as typed calls: managing a text's link (C18) and opening one
 * (H02).
 *
 * Errors (ApiError.code): `sign-in-required` (401); `not-found` (404: no such text, or no such link); `no-access`
 * (403); `not-shareable` (409: only approved, shown texts get a link); `no-link` (404: nothing to change or revoke);
 * `private` (404: the shared text is no longer published); `link-expired` / `link-revoked` (410); `remix-off` (403);
 * `not-remixable` (409); `rate-limited` (429); `network` (offline).
 */
import * as z from 'zod/mini';
import { getJson } from './api-client';
import { CollectionBriefSchema, DOCUMENT_ORIGINS, DOCUMENT_STATUSES, DOCUMENT_TYPES, LANGS, SpaceBriefSchema } from './content-api';

const Time = z.iso.datetime({ offset: true });
const path = (id: string): string => `/api/documents/${encodeURIComponent(id)}/share`;

export const SHARE_EXPIRIES = ['none', '7d', '30d'] as const;
export type ShareExpiry = (typeof SHARE_EXPIRIES)[number];
export const SHARE_ACCESS = ['view', 'remix'] as const;
export type ShareAccess = (typeof SHARE_ACCESS)[number];

export const ShareLinkSchema = z.object({
  id: z.string(),
  /** The only part of the token ever shown again. */
  last4: z.string(),
  access: z.enum(SHARE_ACCESS),
  expiry: z.enum(SHARE_EXPIRIES),
  expiresAt: z.nullable(Time),
  expired: z.boolean(),
  revokedAt: z.nullable(Time),
  createdAt: Time,
});
export type ShareLink = z.infer<typeof ShareLinkSchema>;

export const HISTORY_KINDS = ['opened', 'created', 'changed', 'revoked', 'approved', 'hidden', 'shown'] as const;

export const ShareViewSchema = z.object({
  document: z.object({
    id: z.string(),
    title: z.string(),
    origin: z.enum(DOCUMENT_ORIGINS),
    status: z.enum(DOCUMENT_STATUSES),
    hidden: z.boolean(),
    lang: z.enum(LANGS),
    type: z.enum(DOCUMENT_TYPES),
    space: z.extend(SpaceBriefSchema, { art: z.string() }),
    collection: z.nullable(CollectionBriefSchema),
    sections: z.array(z.string()),
    authorName: z.nullable(z.string()),
  }),
  shareable: z.boolean(),
  link: z.nullable(ShareLinkSchema),
  openings7d: z.number(),
  history: z.array(z.object({ kind: z.enum(HISTORY_KINDS), at: Time, by: z.nullable(z.string()), detail: z.nullable(z.string()) })),
  approverName: z.nullable(z.string()),
  permission: z.nullable(z.object({ id: z.string(), hidden: z.boolean(), by: z.nullable(z.string()), at: Time })),
});
export type ShareView = z.infer<typeof ShareViewSchema>;
export type ShareHistoryLine = ShareView['history'][number];

/** A text's sharing (C18): its link (never the token), history, who has access. */
export function fetchShare(id: string): Promise<ShareView> {
  return getJson(ShareViewSchema, path(id));
}

const CreatedSchema = z.object({ token: z.string(), path: z.string(), link: ShareLinkSchema });
export type CreatedShareLink = z.infer<typeof CreatedSchema>;

/** Makes a new link (the old one stops working); `path` (/l/<token>) is shown this once only. */
export function createShareLink(id: string, settings: { expiry: ShareExpiry; access: ShareAccess }): Promise<CreatedShareLink> {
  return getJson(CreatedSchema, path(id), { method: 'POST', body: JSON.stringify(settings) });
}

const LinkAnswerSchema = z.object({ link: ShareLinkSchema });

/** A new expiry (counted from now) or access for the live link. */
export async function changeShareLink(id: string, change: { expiry?: ShareExpiry; access?: ShareAccess }): Promise<ShareLink> {
  return (await getJson(LinkAnswerSchema, path(id), { method: 'PATCH', body: JSON.stringify(change) })).link;
}

export async function revokeShareLink(id: string): Promise<ShareLink> {
  return (await getJson(LinkAnswerSchema, path(id), { method: 'DELETE' })).link;
}

export const SharedPreviewSchema = z.object({
  access: z.enum(SHARE_ACCESS),
  signedIn: z.boolean(),
  canRemix: z.boolean(),
  document: z.object({
    id: z.string(),
    title: z.string(),
    lang: z.enum(LANGS),
    type: z.enum(DOCUMENT_TYPES),
    authorName: z.nullable(z.string()),
    readingMinutes: z.number(),
    sections: z.array(z.string()),
    peek: z.nullable(z.object({ heading: z.nullable(z.string()), text: z.string() })),
    space: SpaceBriefSchema,
  }),
});
export type SharedPreview = z.infer<typeof SharedPreviewSchema>;

const tokenPath = (token: string): string => `/api/l/${encodeURIComponent(token)}`;

/** Opens a share link (H02); the server logs the opening. */
export function openSharedLink(token: string): Promise<SharedPreview> {
  return getJson(SharedPreviewSchema, tokenPath(token));
}

/** Copies the shared text into the account's own drafts (a link that allows remix); the new draft's id. */
export async function remixShared(token: string): Promise<string> {
  return (await getJson(z.object({ id: z.string() }), `${tokenPath(token)}/remix`, { method: 'POST' })).id;
}
