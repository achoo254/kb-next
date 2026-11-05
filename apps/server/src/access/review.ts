/**
 * The review lifecycle of a document, and what admins do with published texts (C06, C08, A01, A02, the admin API):
 *
 *   draft | private | changes_requested | rejected  --submit (author)-->  pending
 *   pending  --withdraw (author)-->  draft
 *   pending  --decide (admin)-->  approved | changes_requested | rejected (the last two with a reason)
 *   approved  --hide / show (admin)-->  approved, hidden or not
 *
 * Texts the admin API publishes skip the queue (authoring.ts `createDocument` with a publication). Every step writes
 * its review event (or, for hiding, its audit line); nothing here ever approves or rejects on its own. Who sees a
 * reason: the author and admins only (C08 lists the author's own texts, history.ts hides reasons from other readers,
 * the notification goes to the author).
 */
import { and, asc, count, desc, eq, gte, ilike, inArray, isNull, lt, notExists, sql } from 'drizzle-orm';
import { bodyOf } from '../authoring/markdown-text';
import type { Db } from '../db/client';
import { type JevPreReview, auditLog, documentVersions, documents, notifications, readingProgress, reviewEvents } from '../db/schema';
import { type DocumentRow, documentColumns } from './content';
import { HIDE_ACTION, SHOW_ACTION } from './history';
import { isUuid } from './ids';
import type { Viewer } from './viewer';
import { canRead } from './visibility';

type UserViewer = Extract<Viewer, { kind: 'user' }>;
export type AdminViewer = UserViewer & { isAdmin: true };
export type DocumentStatus = DocumentRow['status'];

export function isAdminViewer(viewer: Viewer): viewer is AdminViewer {
  return viewer.kind === 'user' && viewer.isAdmin;
}

/** The steps an author may send a text for review from. */
export const SUBMITTABLE_STATUSES: ReadonlySet<DocumentStatus> = new Set(['draft', 'private', 'changes_requested', 'rejected']);
export const REVIEW_DECISIONS = ['approved', 'changes_requested', 'rejected'] as const;
export type ReviewDecision = (typeof REVIEW_DECISIONS)[number];

/** Where a text goes: a Space the writer may write in, and one of its Collections (the caller checks both). */
export interface Placement {
  spaceId: string;
  collectionId: string | null;
}

type Tx = Parameters<Parameters<Db['transaction']>[0]>[0];

async function lockLive(tx: Tx, id: string): Promise<DocumentRow | null> {
  const [doc] = await tx
    .select(documentColumns)
    .from(documents)
    .where(and(eq(documents.id, id), isNull(documents.deletedAt)))
    .for('update');
  return doc ?? null;
}

/** `not-found` for a text the viewer may not read at all, `no-access` for one they read but do not own. */
function refusal(viewer: Viewer, doc: DocumentRow): { kind: 'not-found' } | { kind: 'no-access' } {
  return canRead(viewer, doc) ? { kind: 'no-access' } : { kind: 'not-found' };
}

/** Pending texts, the given one included: its place in the queue when it was just sent. */
async function pendingCount(tx: Tx | Db): Promise<number> {
  const [row] = await tx
    .select({ n: count() })
    .from(documents)
    .where(and(eq(documents.status, 'pending'), isNull(documents.deletedAt)));
  return row?.n ?? 0;
}

export type SubmitResult =
  | { kind: 'submitted'; doc: DocumentRow; eventId: string; queuePosition: number }
  | { kind: 'not-found' }
  | { kind: 'no-access' }
  | { kind: 'not-submittable'; status: DocumentStatus }
  | { kind: 'title-required' }
  | { kind: 'body-required' };

/**
 * The author sends a text for review (C06 "Gửi duyệt"): from a draft, a private text or one sent back, with a title
 * and a body (or a stored file). Optionally moved first (`placement`) and tagged (C04).
 */
export async function submitForReview(
  db: Db,
  viewer: UserViewer,
  id: string,
  input: { placement?: Placement; tags?: readonly string[] },
  now: Date,
): Promise<SubmitResult> {
  if (!isUuid(id)) return { kind: 'not-found' };
  return db.transaction(async (tx): Promise<SubmitResult> => {
    const doc = await lockLive(tx, id);
    if (!doc) return { kind: 'not-found' };
    if (doc.authorId !== viewer.userId) return refusal(viewer, doc);
    if (!SUBMITTABLE_STATUSES.has(doc.status)) return { kind: 'not-submittable', status: doc.status };
    if (!doc.title.trim()) return { kind: 'title-required' };
    const [latest] = await tx
      .select({ markdown: documentVersions.markdown, fileId: documentVersions.fileId })
      .from(documentVersions)
      .where(eq(documentVersions.documentId, id))
      .orderBy(desc(documentVersions.version))
      .limit(1);
    if (!latest || (latest.fileId === null && !bodyOf(latest.markdown ?? '').trim())) return { kind: 'body-required' };
    const changes = {
      status: 'pending' as const,
      ...(input.placement ? { spaceId: input.placement.spaceId, collectionId: input.placement.collectionId } : {}),
      ...(input.tags ? { tags: [...input.tags] } : {}),
    };
    await tx.update(documents).set(changes).where(eq(documents.id, id));
    const [event] = await tx.insert(reviewEvents).values({ documentId: id, actorId: viewer.userId, action: 'submitted', createdAt: now }).returning({ id: reviewEvents.id });
    if (!event) throw new Error('review event insert returned nothing');
    return { kind: 'submitted', doc: { ...doc, ...changes }, eventId: event.id, queuePosition: await pendingCount(tx) };
  });
}

/** Jev's pre-review of a submission, once it answered (the submission itself never waits on it to count). */
export async function recordPreReview(db: Db, eventId: string, scores: JevPreReview): Promise<void> {
  await db.update(reviewEvents).set({ jevScores: scores }).where(and(eq(reviewEvents.id, eventId), eq(reviewEvents.action, 'submitted')));
}

export type WithdrawResult = { kind: 'withdrawn'; doc: DocumentRow } | { kind: 'not-found' } | { kind: 'no-access' } | { kind: 'not-pending'; status: DocumentStatus };

/** The author takes a text out of the queue (C08 "Rút lại"): back to a draft, theirs to change again. */
export async function withdrawSubmission(db: Db, viewer: UserViewer, id: string): Promise<WithdrawResult> {
  if (!isUuid(id)) return { kind: 'not-found' };
  return db.transaction(async (tx): Promise<WithdrawResult> => {
    const doc = await lockLive(tx, id);
    if (!doc) return { kind: 'not-found' };
    if (doc.authorId !== viewer.userId) return refusal(viewer, doc);
    if (doc.status !== 'pending') return { kind: 'not-pending', status: doc.status };
    await tx.update(documents).set({ status: 'draft' }).where(eq(documents.id, id));
    return { kind: 'withdrawn', doc: { ...doc, status: 'draft' } };
  });
}

export type DecisionResult = { kind: 'decided'; doc: DocumentRow } | { kind: 'not-found' } | { kind: 'not-pending'; status: DocumentStatus };

/**
 * An admin's verdict on a pending text (A01): approved (a member's own text becomes "Cộng đồng"), changes requested
 * or rejected, with the reason the author reads.
 */
export async function decideReview(db: Db, admin: AdminViewer, id: string, decision: ReviewDecision, reason: string | null, now: Date): Promise<DecisionResult> {
  if (!isUuid(id)) return { kind: 'not-found' };
  return db.transaction(async (tx): Promise<DecisionResult> => {
    const doc = await lockLive(tx, id);
    if (!doc) return { kind: 'not-found' };
    if (doc.status !== 'pending') return { kind: 'not-pending', status: doc.status };
    const origin = decision === 'approved' && doc.origin === 'own' ? 'community' : doc.origin;
    // Approval is when the text goes out as it stands: its 180 days without a change (the stale check) start now.
    const updatedAt = decision === 'approved' ? now : doc.updatedAt;
    await tx.update(documents).set({ status: decision, origin, updatedAt }).where(eq(documents.id, id));
    await tx.insert(reviewEvents).values({ documentId: id, actorId: admin.userId, action: decision, reason: decision === 'approved' ? null : reason, createdAt: now });
    return { kind: 'decided', doc: { ...doc, status: decision, origin, updatedAt } };
  });
}

export type HideResult = { kind: 'ok'; doc: DocumentRow; changed: boolean } | { kind: 'not-found' } | { kind: 'not-approved'; status: DocumentStatus };

/** An admin takes a published text off the Universe or puts it back (A02 "Đang hiện"), with its audit line. */
export async function setHidden(db: Db, admin: AdminViewer, id: string, hidden: boolean, now: Date): Promise<HideResult> {
  if (!isUuid(id)) return { kind: 'not-found' };
  return db.transaction(async (tx): Promise<HideResult> => {
    const doc = await lockLive(tx, id);
    if (!doc) return { kind: 'not-found' };
    if (doc.status !== 'approved') return { kind: 'not-approved', status: doc.status };
    if (doc.hidden === hidden) return { kind: 'ok', doc, changed: false };
    await tx.update(documents).set({ hidden }).where(eq(documents.id, id));
    await tx.insert(auditLog).values({ actorId: admin.userId, action: hidden ? HIDE_ACTION : SHOW_ACTION, targetType: 'document', targetId: id, createdAt: now });
    return { kind: 'ok', doc: { ...doc, hidden }, changed: true };
  });
}

/** Where a live document lives and how it is tagged, changed by an admin (A02, PATCH of the admin API). */
export async function setPlacementAndTags(db: Db, _admin: AdminViewer, id: string, input: { placement?: Placement; tags?: readonly string[] }): Promise<DocumentRow | null> {
  if (!isUuid(id)) return null;
  const changes = {
    ...(input.placement ? { spaceId: input.placement.spaceId, collectionId: input.placement.collectionId } : {}),
    ...(input.tags ? { tags: [...input.tags] } : {}),
  };
  if (Object.keys(changes).length === 0) {
    const [doc] = await db
      .select(documentColumns)
      .from(documents)
      .where(and(eq(documents.id, id), isNull(documents.deletedAt)));
    return doc ?? null;
  }
  const [doc] = await db
    .update(documents)
    .set(changes)
    .where(and(eq(documents.id, id), isNull(documents.deletedAt)))
    .returning(documentColumns);
  return doc ?? null;
}

/** A new title for a stored file (Office), whose title is only metadata; Markdown texts change it by a save. */
export async function renameDocument(db: Db, _admin: AdminViewer, id: string, title: string): Promise<void> {
  if (!isUuid(id)) return;
  await db
    .update(documents)
    .set({ title })
    .where(and(eq(documents.id, id), isNull(documents.deletedAt)));
}

/** A live document as an admin finds it (any status), or null; `lock`: holding its row for the caller's transaction. */
export async function findForAdmin(db: Db, _admin: AdminViewer, id: string, lock = false): Promise<DocumentRow | null> {
  if (!isUuid(id)) return null;
  const query = db
    .select(documentColumns)
    .from(documents)
    .where(and(eq(documents.id, id), isNull(documents.deletedAt)));
  const [doc] = lock ? await query.for('update') : await query;
  return doc ?? null;
}

export interface QueueEntry {
  doc: DocumentRow;
  /** When it was (last) sent for review. */
  submittedAt: Date;
  jev: JevPreReview | null;
}

/** The review queue (A01, GET /api/admin/review): pending texts, the latest sent first, with Jev's pre-review. */
export async function listReviewQueue(db: Db, _admin: AdminViewer): Promise<QueueEntry[]> {
  const docs = await db
    .select(documentColumns)
    .from(documents)
    .where(and(eq(documents.status, 'pending'), isNull(documents.deletedAt)));
  if (docs.length === 0) return [];
  const events = await db
    .selectDistinctOn([reviewEvents.documentId], { documentId: reviewEvents.documentId, at: reviewEvents.createdAt, jev: reviewEvents.jevScores })
    .from(reviewEvents)
    .where(
      and(
        eq(reviewEvents.action, 'submitted'),
        inArray(
          reviewEvents.documentId,
          docs.map((d) => d.id),
        ),
      ),
    )
    .orderBy(reviewEvents.documentId, desc(reviewEvents.createdAt), sql`${reviewEvents.id} desc`);
  const byDoc = new Map(events.map((e) => [e.documentId, e]));
  return docs
    .map((doc) => {
      const event = byDoc.get(doc.id);
      return { doc, submittedAt: event?.at ?? doc.updatedAt, jev: event?.jev ?? null };
    })
    .sort((a, b) => b.submittedAt.getTime() - a.submittedAt.getTime() || a.doc.id.localeCompare(b.doc.id));
}

export interface PublishedFilter {
  origin?: 'official' | 'community';
  visibility?: 'visible' | 'hidden';
  /** Words of the title. */
  q?: string;
}

export interface PublishedEntry {
  doc: DocumentRow;
  /** Accounts that opened it (their reading progress). */
  opens: number;
  /** A version of it was written by AI (A02's "AI" badge). */
  aiMade: boolean;
}

const escapeLike = (text: string): string => text.replace(/[\\%_]/g, (c) => `\\${c}`);

/** Published texts (A02), hidden ones included, in their Spaces' reading order. */
export async function listPublished(db: Db, _admin: AdminViewer, filter: PublishedFilter): Promise<PublishedEntry[]> {
  const opens = db
    .select({ documentId: readingProgress.documentId, n: count().as('n') })
    .from(readingProgress)
    .groupBy(readingProgress.documentId)
    .as('opens');
  const q = filter.q?.trim();
  const aiMade = sql<boolean>`exists (select 1 from ${documentVersions} where ${documentVersions.documentId} = ${documents.id} and ${documentVersions.aiMade})`;
  const rows = await db
    .select({ doc: documentColumns, n: opens.n, aiMade })
    .from(documents)
    .leftJoin(opens, eq(opens.documentId, documents.id))
    .where(
      and(
        eq(documents.status, 'approved'),
        isNull(documents.deletedAt),
        filter.origin ? eq(documents.origin, filter.origin) : undefined,
        filter.visibility ? eq(documents.hidden, filter.visibility === 'hidden') : undefined,
        q ? ilike(documents.title, `%${escapeLike(q)}%`) : undefined,
      ),
    )
    .orderBy(asc(documents.spaceId), asc(documents.sortOrder), asc(documents.createdAt));
  return rows.map((row) => ({ doc: row.doc, opens: Number(row.n ?? 0), aiMade: Boolean(row.aiMade) }));
}

export interface StaleDocument {
  id: string;
  authorId: string;
  title: string;
  updatedAt: Date;
}

/**
 * Approved live texts unchanged for `days` days whose author has not been told since their last change (C20
 * "Tài liệu có thể lỗi thời"): each is told once per change.
 */
export async function listStaleDocuments(db: Db, now: Date, days: number): Promise<StaleDocument[]> {
  const cutoff = new Date(now.getTime() - days * 24 * 60 * 60 * 1000);
  const told = db
    .select({ id: notifications.id })
    .from(notifications)
    .where(and(eq(notifications.documentId, documents.id), eq(notifications.kind, 'stale'), gte(notifications.createdAt, documents.updatedAt)));
  return db
    .select({ id: documents.id, authorId: documents.authorId, title: documents.title, updatedAt: documents.updatedAt })
    .from(documents)
    .where(and(eq(documents.status, 'approved'), isNull(documents.deletedAt), lt(documents.updatedAt, cutoff), notExists(told)))
    .orderBy(asc(documents.updatedAt));
}
