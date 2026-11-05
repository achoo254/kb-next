/**
 * The inbox of an account (C20) and the bell's count (TopActions): writing a notification, listing (by kind, unread
 * only), counting what is unread, marking one or all as read. Only the account itself ever reads its rows. A payload
 * is a snapshot of what its message says (the title then, who acted, the reason): an author's own text, never
 * someone else's private one.
 */
import { and, count, desc, eq, inArray, isNull, sql } from 'drizzle-orm';
import { z } from 'zod';
import type { Db } from '../db/client';
import { safeErrorText } from '../log-error';
import { type NotificationKind, NOTIFICATION_KINDS, notifications, users } from '../db/schema';

/** Rows an inbox lists at most (the latest). */
export const INBOX_LIMIT = 100;

/** What each kind's message needs. */
export const NotificationPayload = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('mention'), title: z.string(), by: z.string().nullable(), excerpt: z.string(), anchor: z.string().nullable() }),
  z.object({ kind: z.literal('comment'), title: z.string(), by: z.string().nullable(), excerpt: z.string(), anchor: z.string().nullable() }),
  z.object({
    kind: z.literal('review'),
    title: z.string(),
    /** `submitted`: a text waiting in the queue (to admins); the others are the author's result. */
    action: z.enum(['submitted', 'approved', 'changes_requested', 'rejected']),
    reason: z.string().nullable(),
    by: z.string().nullable(),
  }),
  z.object({ kind: z.literal('stale'), title: z.string(), days: z.number().int() }),
  z.object({ kind: z.literal('permission'), title: z.string(), hidden: z.boolean(), by: z.string().nullable() }),
]);
export type NotificationPayload = z.infer<typeof NotificationPayload>;

export interface NewNotification {
  userId: string;
  documentId: string | null;
  payload: NotificationPayload;
}

export interface InboxEntry {
  id: string;
  kind: NotificationKind;
  documentId: string | null;
  payload: NotificationPayload;
  createdAt: Date;
  readAt: Date | null;
}

/** Rows per insert: far below Postgres's 65 535 parameters a statement. */
const NOTIFY_BATCH = 1_000;

export async function notify(db: Db, entries: readonly NewNotification[], now: Date): Promise<void> {
  for (let start = 0; start < entries.length; start += NOTIFY_BATCH) {
    await db.insert(notifications).values(
      entries.slice(start, start + NOTIFY_BATCH).map((e) => ({ userId: e.userId, kind: e.payload.kind, documentId: e.documentId, payload: e.payload, createdAt: now })),
    );
  }
}

/**
 * `notify` after the action it reports has committed: a failure is logged, never turned into a failed request (the
 * action stands).
 */
export async function notifyAfter(db: Db, entries: () => Promise<readonly NewNotification[]>, now: Date): Promise<void> {
  try {
    await notify(db, await entries(), now);
  } catch (error) {
    console.error('notification failed', safeErrorText(error));
  }
}

/** Admins with an unread "waiting for review" notice of this text (who need no second one). */
export async function unreadSubmittedNotice(db: Db, documentId: string): Promise<Set<string>> {
  const rows = await db
    .select({ userId: notifications.userId })
    .from(notifications)
    .where(and(eq(notifications.documentId, documentId), eq(notifications.kind, 'review'), isNull(notifications.readAt), sql`${notifications.payload}->>'action' = 'submitted'`));
  return new Set(rows.map((r) => r.userId));
}

/** Drops the unread "waiting for review" notices of a text taken out of the queue. */
export async function clearSubmittedNotices(db: Db, documentId: string): Promise<void> {
  await db
    .delete(notifications)
    .where(and(eq(notifications.documentId, documentId), eq(notifications.kind, 'review'), isNull(notifications.readAt), sql`${notifications.payload}->>'action' = 'submitted'`));
}

/** The ids of the accounts whose IdP sub is an admin's (ADMIN_SUBS) and who have signed in here. */
export async function adminUserIds(db: Db, adminSubs: ReadonlySet<string>): Promise<string[]> {
  if (adminSubs.size === 0) return [];
  const rows = await db.select({ id: users.id }).from(users).where(inArray(users.sub, [...adminSubs]));
  return rows.map((r) => r.id);
}

/** The name of an account (for "Linh đã duyệt"), null when it has none. */
export async function nameOf(db: Db, userId: string): Promise<string | null> {
  const [row] = await db.select({ name: users.name }).from(users).where(eq(users.id, userId));
  return row?.name ?? null;
}

export interface InboxFilter {
  kind?: NotificationKind;
  unreadOnly?: boolean;
}

/** The account's latest notifications, newest first; rows whose payload no longer parses are left out. */
export async function listInbox(db: Db, userId: string, filter: InboxFilter = {}): Promise<InboxEntry[]> {
  const rows = await db
    .select()
    .from(notifications)
    .where(and(eq(notifications.userId, userId), filter.kind ? eq(notifications.kind, filter.kind) : undefined, filter.unreadOnly ? isNull(notifications.readAt) : undefined))
    .orderBy(desc(notifications.createdAt), desc(notifications.id))
    .limit(INBOX_LIMIT);
  return rows.flatMap((row) => {
    const payload = NotificationPayload.safeParse({ ...row.payload, kind: row.kind });
    if (!payload.success) return [];
    return [{ id: row.id, kind: payload.data.kind, documentId: row.documentId, payload: payload.data, createdAt: row.createdAt, readAt: row.readAt }];
  });
}

/** Unread notifications of the account, in all and by kind (C20's tab counts). */
export async function unreadCounts(db: Db, userId: string): Promise<{ total: number; byKind: Record<NotificationKind, number> }> {
  const rows = await db
    .select({ kind: notifications.kind, n: count() })
    .from(notifications)
    .where(and(eq(notifications.userId, userId), isNull(notifications.readAt)))
    .groupBy(notifications.kind);
  const byKind = Object.fromEntries(NOTIFICATION_KINDS.map((k) => [k, 0])) as Record<NotificationKind, number>;
  let total = 0;
  for (const row of rows) {
    const kind = NOTIFICATION_KINDS.find((k) => k === row.kind);
    if (!kind) continue;
    byKind[kind] = row.n;
    total += row.n;
  }
  return { total, byKind };
}

/** Marks one of the account's notifications read (`read` false: unread again); false when it has no such one. */
export async function markRead(db: Db, userId: string, id: string, now: Date, read = true): Promise<boolean> {
  const [row] = await db
    .select({ id: notifications.id, readAt: notifications.readAt })
    .from(notifications)
    .where(and(eq(notifications.id, id), eq(notifications.userId, userId)));
  if (!row) return false;
  if ((row.readAt === null) === read) await db.update(notifications).set({ readAt: read ? now : null }).where(eq(notifications.id, id));
  return true;
}

/** Marks every unread notification of the account (of one kind, if given) read; how many. */
export async function markAllRead(db: Db, userId: string, kind: NotificationKind | undefined, now: Date): Promise<number> {
  const rows = await db
    .update(notifications)
    .set({ readAt: now })
    .where(and(eq(notifications.userId, userId), isNull(notifications.readAt), kind ? eq(notifications.kind, kind) : undefined))
    .returning({ id: notifications.id });
  return rows.length;
}

/**
 * The account's latest unread `permission` notice of a document (C18's banner "Quyền vừa thay đổi": an admin just hid
 * or showed it), or null.
 */
export async function unreadPermissionNotice(db: Db, userId: string, documentId: string): Promise<{ id: string; hidden: boolean; by: string | null; at: Date } | null> {
  const [row] = await db
    .select()
    .from(notifications)
    .where(and(eq(notifications.userId, userId), eq(notifications.documentId, documentId), eq(notifications.kind, 'permission'), isNull(notifications.readAt)))
    .orderBy(desc(notifications.createdAt), desc(notifications.id))
    .limit(1);
  if (!row) return null;
  const payload = NotificationPayload.safeParse({ ...row.payload, kind: row.kind });
  if (!payload.success || payload.data.kind !== 'permission') return null;
  return { id: row.id, hidden: payload.data.hidden, by: payload.data.by, at: row.createdAt };
}
