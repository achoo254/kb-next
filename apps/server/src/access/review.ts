/**
 * The publishing lifecycle of a document, and what admins do with published texts (C04, C06, C08, A02, the admin API).
 * The author decides on their own text (chủ dự án chốt 07/11/2026: no review gate):
 *
 *   any status except approved  --publish (author)-->  approved (public at once)
 *   any status                  --keep private (author)-->  private (published: unpublished, its share links revoked)
 *   approved  --hide / show (admin)-->  approved, hidden or not
 *
 * `pending`, `changes_requested` and `rejected` are no longer reached: they stay in the enum for texts left from the
 * review gate, which read like private ones (author and admins only) until their author publishes them. `hidden` is
 * the admins' alone: publishing, unpublishing or editing never changes it, so a text an admin hid stays hidden until
 * an admin shows it. Texts the admin API publishes are official (authoring.ts `createDocument` with a publication).
 */
import { and, asc, count, desc, eq, gte, ilike, isNull, lt, notExists, sql } from 'drizzle-orm';
import { bodyOf } from '../authoring/markdown-text';
import type { Db } from '../db/client';
import { auditLog, documentVersions, documents, notifications, readingProgress } from '../db/schema';
import { type DocumentRow, documentColumns } from './content';
import { HIDE_ACTION, SHOW_ACTION } from './history';
import { isUuid } from './ids';
import type { Viewer } from './viewer';
import { revokeAllLinks } from './share-links';
import { canRead } from './visibility';

type UserViewer = Extract<Viewer, { kind: 'user' }>;
export type AdminViewer = UserViewer & { isAdmin: true };
export type DocumentStatus = DocumentRow['status'];

export function isAdminViewer(viewer: Viewer): viewer is AdminViewer {
  return viewer.kind === 'user' && viewer.isAdmin;
}

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

export type PublishResult =
  | { kind: 'published'; doc: DocumentRow; was: DocumentStatus }
  | { kind: 'not-found' }
  | { kind: 'no-access' }
  | { kind: 'already-published' }
  | { kind: 'title-required' }
  | { kind: 'body-required' };

/** What C04 sets on a text as it is published or kept private: where it goes, its tags, its language. */
export interface PublishSettings {
  placement?: Placement;
  tags?: readonly string[];
  /** Its original language; left as it is for a text that has translations (the pair keeps one of each). */
  lang?: DocumentRow['lang'];
}

function settingsChanges(doc: DocumentRow, input: PublishSettings): Partial<Pick<DocumentRow, 'spaceId' | 'collectionId' | 'tags' | 'lang'>> {
  return {
    ...(input.placement ? { spaceId: input.placement.spaceId, collectionId: input.placement.collectionId } : {}),
    ...(input.tags ? { tags: [...input.tags] } : {}),
    ...(input.lang && doc.translationGroupId === null ? { lang: input.lang } : {}),
  };
}

/**
 * The author publishes a text (C04 "Đăng công khai"): it is public at once, with a title and a body (or a stored
 * file). Optionally moved first (`placement`), tagged and given its language (C04). A member's own text becomes
 * "Cộng đồng"; its 180 days without a change (the stale check) start now.
 */
export async function publishDocument(db: Db, viewer: UserViewer, id: string, input: PublishSettings, now: Date): Promise<PublishResult> {
  if (!isUuid(id)) return { kind: 'not-found' };
  return db.transaction(async (tx): Promise<PublishResult> => {
    const doc = await lockLive(tx, id);
    if (!doc) return { kind: 'not-found' };
    if (doc.authorId !== viewer.userId) return refusal(viewer, doc);
    if (doc.status === 'approved') return { kind: 'already-published' };
    if (!doc.title.trim()) return { kind: 'title-required' };
    const [latest] = await tx
      .select({ markdown: documentVersions.markdown, fileId: documentVersions.fileId })
      .from(documentVersions)
      .where(eq(documentVersions.documentId, id))
      .orderBy(desc(documentVersions.version))
      .limit(1);
    if (!latest || (latest.fileId === null && !bodyOf(latest.markdown ?? '').trim())) return { kind: 'body-required' };
    const origin = doc.origin === 'own' ? 'community' : doc.origin;
    const changes = { status: 'approved' as const, origin, updatedAt: now, ...settingsChanges(doc, input) };
    await tx.update(documents).set(changes).where(eq(documents.id, id));
    return { kind: 'published', doc: { ...doc, ...changes }, was: doc.status };
  });
}

export type KeepPrivateResult = { kind: 'kept'; doc: DocumentRow; was: DocumentStatus } | { kind: 'not-found' } | { kind: 'no-access' };

/**
 * The author keeps a text to themselves (C04 "Lưu riêng tư", C08 "Gỡ xuống"): status `private`, with C04's
 * placement, tags and language. A published text is unpublished: a "Cộng đồng" text is the author's own again, and
 * no share link of it opens it any more.
 */
export async function keepPrivate(db: Db, viewer: UserViewer, id: string, input: PublishSettings, now: Date): Promise<KeepPrivateResult> {
  if (!isUuid(id)) return { kind: 'not-found' };
  return db.transaction(async (tx): Promise<KeepPrivateResult> => {
    const doc = await lockLive(tx, id);
    if (!doc) return { kind: 'not-found' };
    if (doc.authorId !== viewer.userId) return refusal(viewer, doc);
    const origin = doc.origin === 'community' ? 'own' : doc.origin;
    const changes = { status: 'private' as const, origin, ...settingsChanges(doc, input) };
    await tx.update(documents).set(changes).where(eq(documents.id, id));
    await revokeAllLinks(tx, id, viewer.userId, now);
    return { kind: 'kept', doc: { ...doc, ...changes }, was: doc.status };
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
