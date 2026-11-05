/**
 * What people do with documents they can read: reading progress (C10, C11), comments (C11), who contributes to a
 * Space (C10 "Thành viên & quyền"), and the headings and links the related lists are scored from. Document reads
 * stay filtered by the viewer (src/access/visibility.ts); callers check a document is readable before a write.
 */
import { and, asc, desc, eq, inArray, isNull, or, sql } from 'drizzle-orm';
import type { Db } from '../db/client';
import { chunks, comments, documents, links, readingProgress, users } from '../db/schema';
import { isUuid } from './ids';
import { GUEST, type Viewer } from './viewer';
import { visibleTo } from './visibility';

export interface ProgressRow {
  progress: number;
  anchor: string | null;
}

/** The viewer's progress on the given documents (absent: not started). */
export async function progressOf(db: Db, userId: string, documentIds: readonly string[]): Promise<Map<string, ProgressRow>> {
  const ids = [...new Set(documentIds.filter(isUuid))];
  if (ids.length === 0) return new Map();
  const rows = await db
    .select({ documentId: readingProgress.documentId, progress: readingProgress.progress, anchor: readingProgress.anchor })
    .from(readingProgress)
    .where(and(eq(readingProgress.userId, userId), inArray(readingProgress.documentId, ids)));
  return new Map(rows.map((r) => [r.documentId, { progress: r.progress, anchor: r.anchor }]));
}

/**
 * Records reading of a document the caller checked readable: progress only ever grows (reading back up does not
 * undo it), the anchor is the latest one read.
 */
export async function saveProgress(db: Db, userId: string, documentId: string, progress: number, anchor: string | null, at: Date): Promise<ProgressRow> {
  const [row] = await db
    .insert(readingProgress)
    .values({ userId, documentId, progress, anchor, updatedAt: at })
    .onConflictDoUpdate({
      target: [readingProgress.userId, readingProgress.documentId],
      set: { progress: sql`greatest(${readingProgress.progress}, excluded.progress)`, anchor, updatedAt: at },
    })
    .returning({ progress: readingProgress.progress, anchor: readingProgress.anchor });
  if (!row) throw new Error('progress upsert returned nothing');
  return row;
}

/** Anchors of a document's passages (to check an anchor sent by the reader). */
export async function anchorsOf(db: Db, viewer: Viewer, documentId: string): Promise<Set<string>> {
  if (!isUuid(documentId)) return new Set();
  const rows = await db
    .select({ anchor: chunks.anchor })
    .from(chunks)
    .innerJoin(documents, eq(documents.id, chunks.documentId))
    .where(and(eq(chunks.documentId, documentId), visibleTo(viewer)));
  return new Set(rows.map((r) => r.anchor));
}

export interface CommentRow {
  id: string;
  anchor: string | null;
  body: string;
  createdAt: Date;
  updatedAt: Date;
  authorId: string;
  authorName: string | null;
  authorPicture: string | null;
  authorSub: string;
  authorRole: 'member' | 'reviewer';
}

const MAX_COMMENTS = 200;

/**
 * The latest MAX_COMMENTS comments of a document open to everyone (approved, not hidden, not in the trash), oldest
 * first; none for any other document, whoever reads it (a draft has no discussion yet).
 */
export async function listComments(db: Db, documentId: string): Promise<CommentRow[]> {
  if (!isUuid(documentId)) return [];
  const latest = await db
    .select({
      id: comments.id,
      anchor: comments.anchor,
      body: comments.body,
      createdAt: comments.createdAt,
      updatedAt: comments.updatedAt,
      authorId: users.id,
      authorName: users.name,
      authorPicture: users.picture,
      authorSub: users.sub,
      authorRole: users.role,
    })
    .from(comments)
    .innerJoin(users, eq(users.id, comments.authorId))
    .innerJoin(documents, eq(documents.id, comments.documentId))
    .where(and(eq(comments.documentId, documentId), isNull(comments.deletedAt), visibleTo(GUEST)))
    .orderBy(desc(comments.createdAt), desc(comments.id))
    .limit(MAX_COMMENTS);
  return latest.reverse();
}

/** Whether everyone may read (and so discuss) a document: approved, not hidden, not in the trash. */
export async function isOpenForComments(db: Db, documentId: string): Promise<boolean> {
  if (!isUuid(documentId)) return false;
  const [row] = await db
    .select({ id: documents.id })
    .from(documents)
    .where(and(eq(documents.id, documentId), visibleTo(GUEST)));
  return Boolean(row);
}

/** Who has written in a document's live discussion, with their names (who a new comment may name with `@`). */
export async function discussionParticipants(db: Db, documentId: string): Promise<Array<{ userId: string; name: string | null }>> {
  if (!isUuid(documentId)) return [];
  return db
    .selectDistinct({ userId: users.id, name: users.name })
    .from(comments)
    .innerJoin(users, eq(users.id, comments.authorId))
    .where(and(eq(comments.documentId, documentId), isNull(comments.deletedAt)));
}

/** A new comment by `authorId` on a document the caller checked open for comments; its id. */
export async function addComment(db: Db, authorId: string, documentId: string, body: string, anchor: string | null, at: Date): Promise<string> {
  const [row] = await db
    .insert(comments)
    .values({ documentId, authorId, body, anchor, createdAt: at, updatedAt: at })
    .returning({ id: comments.id });
  if (!row) throw new Error('comment insert returned nothing');
  return row.id;
}

export interface Contributor {
  userId: string;
  name: string | null;
  picture: string | null;
  sub: string;
  role: 'member' | 'reviewer';
  /** Published texts of the Space they wrote (a text and its translations count once). */
  documents: number;
  /** When their earliest published text of the Space was created: who joined the Space first. */
  firstContribution: Date;
}

/** Authors of the Space's published documents (what everyone sees), most prolific first, then earliest first. */
export async function spaceContributors(db: Db, spaceId: string): Promise<Contributor[]> {
  if (!isUuid(spaceId)) return [];
  const texts = sql<number>`count(distinct coalesce(${documents.translationGroupId}, ${documents.id}))`;
  const first = sql<Date | string>`min(${documents.createdAt})`;
  const rows = await db
    .select({ userId: users.id, name: users.name, picture: users.picture, sub: users.sub, role: users.role, n: texts, first })
    .from(documents)
    .innerJoin(users, eq(users.id, documents.authorId))
    .where(and(eq(documents.spaceId, spaceId), visibleTo(GUEST)))
    .groupBy(users.id, users.name, users.picture, users.sub, users.role);
  return rows
    .map((r) => ({ userId: r.userId, name: r.name, picture: r.picture, sub: r.sub, role: r.role, documents: Number(r.n), firstContribution: new Date(r.first) }))
    .sort((a, b) => b.documents - a.documents || a.firstContribution.getTime() - b.firstContribution.getTime());
}

/** Accounts that review or administer (reviewers by role, admins by IdP sub), whatever they wrote. */
export async function staffAccounts(db: Db, adminSubs: ReadonlySet<string>): Promise<Array<Omit<Contributor, 'documents' | 'firstContribution'>>> {
  const subs = [...adminSubs];
  return db
    .select({ userId: users.id, name: users.name, picture: users.picture, sub: users.sub, role: users.role })
    .from(users)
    .where(subs.length > 0 ? or(eq(users.role, 'reviewer'), inArray(users.sub, subs)) : eq(users.role, 'reviewer'))
    .orderBy(asc(users.createdAt));
}

/** Passage headings of the given readable documents, by document id. */
export async function headingsOf(db: Db, viewer: Viewer, documentIds: readonly string[]): Promise<Map<string, string[]>> {
  const ids = [...new Set(documentIds.filter(isUuid))];
  const result = new Map<string, string[]>();
  if (ids.length === 0) return result;
  const rows = await db
    .select({ documentId: chunks.documentId, heading: chunks.heading })
    .from(chunks)
    .innerJoin(documents, eq(documents.id, chunks.documentId))
    .where(and(inArray(chunks.documentId, ids), visibleTo(viewer)))
    // In reading order: a card or a score that takes the first headings takes the document's first ones.
    .orderBy(asc(chunks.documentId), asc(chunks.position));
  for (const row of rows) {
    if (row.heading === null) continue;
    const list = result.get(row.documentId);
    if (list) list.push(row.heading);
    else result.set(row.documentId, [row.heading]);
  }
  return result;
}

/** Links touching any of the given documents whose two ends the viewer may read, as [source, target] pairs. */
export async function linksTouching(db: Db, viewer: Viewer, documentIds: readonly string[]): Promise<Array<[string, string]>> {
  const ids = [...new Set(documentIds.filter(isUuid))];
  if (ids.length === 0) return [];
  const readable = db.select({ id: documents.id }).from(documents).where(visibleTo(viewer));
  const rows = await db
    .select({ sourceId: links.sourceId, targetId: links.targetId })
    .from(links)
    .where(and(or(inArray(links.sourceId, ids), inArray(links.targetId, ids)), inArray(links.sourceId, readable), inArray(links.targetId, readable)));
  return rows.map((r) => [r.sourceId, r.targetId]);
}
