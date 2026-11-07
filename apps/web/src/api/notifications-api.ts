/**
 * The inbox (apps/server/src/api/notification-routes.ts) as typed calls: the notifications of C20, the bell's unread
 * count (TopActions) and marking them read. Errors (ApiError.code): `sign-in-required` (401), `not-found` (404: not
 * the account's), `rate-limited` (429), `network` (offline).
 */
import * as z from 'zod/mini';
import { apiFetch, getJson } from './api-client';
import { CollectionBriefSchema, SpaceBriefSchema } from './content-api';

const Time = z.iso.datetime({ offset: true });

export const NOTIFICATION_KINDS = ['mention', 'comment', 'review', 'stale', 'permission'] as const;
export type NotificationKind = (typeof NOTIFICATION_KINDS)[number];

const Discussion = { title: z.string(), by: z.nullable(z.string()), excerpt: z.string(), anchor: z.nullable(z.string()) };

export const NotificationPayloadSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('mention'), ...Discussion }),
  z.object({ kind: z.literal('comment'), ...Discussion }),
  z.object({
    kind: z.literal('review'),
    title: z.string(),
    /** Left from the review gate (removed 07/11/2026; no new ones): `submitted` told admins of a text waiting, the others told its author the result. */
    action: z.enum(['submitted', 'approved', 'changes_requested', 'rejected']),
    reason: z.nullable(z.string()),
    by: z.nullable(z.string()),
  }),
  z.object({ kind: z.literal('stale'), title: z.string(), days: z.number() }),
  z.object({ kind: z.literal('permission'), title: z.string(), hidden: z.boolean(), by: z.nullable(z.string()) }),
]);
export type NotificationPayload = z.infer<typeof NotificationPayloadSchema>;

export const NotificationSchema = z.object({
  id: z.string(),
  kind: z.enum(NOTIFICATION_KINDS),
  documentId: z.nullable(z.string()),
  /** Where its text lives now; null without a text or once the account can no longer read it. */
  place: z.nullable(z.object({ space: SpaceBriefSchema, collection: z.nullable(CollectionBriefSchema) })),
  payload: NotificationPayloadSchema,
  createdAt: Time,
  readAt: z.nullable(Time),
});
export type AppNotification = z.infer<typeof NotificationSchema>;

export const UnreadSchema = z.object({ total: z.number(), byKind: z.record(z.enum(NOTIFICATION_KINDS), z.number()) });
export type UnreadCounts = z.infer<typeof UnreadSchema>;

const InboxSchema = z.object({ notifications: z.array(NotificationSchema), unread: UnreadSchema });
export type Inbox = z.infer<typeof InboxSchema>;

/** The latest 100 notifications of the account, newest first, with its unread counts. */
export function fetchInbox(filter: { kind?: NotificationKind; unreadOnly?: boolean } = {}): Promise<Inbox> {
  const query = new URLSearchParams();
  if (filter.kind) query.set('kind', filter.kind);
  if (filter.unreadOnly) query.set('unread', 'true');
  const qs = query.toString();
  return getJson(InboxSchema, `/api/me/notifications${qs ? `?${qs}` : ''}`);
}

/** The bell's count. */
export function fetchUnread(): Promise<UnreadCounts> {
  return getJson(UnreadSchema, '/api/me/notifications/unread');
}

/** Marks one notification read, or unread again (`read` false). */
export async function markNotificationRead(id: string, read = true): Promise<void> {
  await apiFetch(`/api/me/notifications/${encodeURIComponent(id)}/${read ? 'read' : 'unread'}`, { method: 'POST' });
}

/** Marks every unread notification read (of one kind, if given); how many. */
export async function markAllNotificationsRead(kind?: NotificationKind): Promise<number> {
  const res = await getJson(z.object({ marked: z.number() }), '/api/me/notifications/read-all', { method: 'POST', body: JSON.stringify(kind ? { kind } : {}) });
  return res.marked;
}
