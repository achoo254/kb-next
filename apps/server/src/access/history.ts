/**
 * The activity of a document (C17 "Phiên bản và hoạt động"): its versions (who saved, how, when), its review
 * trail, and when an admin took it off the Universe or put it back (audit log actions HIDE_ACTION / SHOW_ACTION on
 * target type `document`; whoever hides or shows a document writes them). Whoever may read the document may read its
 * history: nothing here is more private than the document itself.
 */
import { and, asc, eq, inArray } from 'drizzle-orm';
import type { Db } from '../db/client';
import { auditLog, documentVersions, documents, reviewEvents, users } from '../db/schema';
import { isUuid } from './ids';
import type { Viewer } from './viewer';
import { visibleTo } from './visibility';

export const HIDE_ACTION = 'document.hide';
export const SHOW_ACTION = 'document.show';

export interface VersionActivity {
  version: number;
  editorId: string;
  via: (typeof documentVersions.$inferSelect)['via'];
  aiMade: boolean;
  summary: string | null;
  restoredFrom: number | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface ReviewActivity {
  action: (typeof reviewEvents.$inferSelect)['action'];
  actorId: string | null;
  reason: string | null;
  createdAt: Date;
}

export interface VisibilityActivity {
  hidden: boolean;
  actorId: string | null;
  createdAt: Date;
}

export interface DocumentActivity {
  versions: VersionActivity[];
  reviews: ReviewActivity[];
  visibility: VisibilityActivity[];
}

/** Everything that happened to a readable document, each list oldest first; null when the viewer may not read it. */
export async function documentActivity(db: Db, viewer: Viewer, id: string): Promise<DocumentActivity | null> {
  if (!isUuid(id)) return null;
  const [readable] = await db
    .select({ id: documents.id })
    .from(documents)
    .where(and(eq(documents.id, id), visibleTo(viewer)));
  if (!readable) return null;
  const [versions, reviews, audit] = await Promise.all([
    db
      .select({
        version: documentVersions.version,
        editorId: documentVersions.editorId,
        via: documentVersions.via,
        aiMade: documentVersions.aiMade,
        summary: documentVersions.summary,
        restoredFrom: documentVersions.restoredFrom,
        createdAt: documentVersions.createdAt,
        updatedAt: documentVersions.updatedAt,
      })
      .from(documentVersions)
      .where(eq(documentVersions.documentId, id))
      .orderBy(asc(documentVersions.version)),
    db
      .select({ action: reviewEvents.action, actorId: reviewEvents.actorId, reason: reviewEvents.reason, createdAt: reviewEvents.createdAt })
      .from(reviewEvents)
      .where(eq(reviewEvents.documentId, id))
      .orderBy(asc(reviewEvents.createdAt)),
    db
      .select({ action: auditLog.action, actorId: auditLog.actorId, createdAt: auditLog.createdAt })
      .from(auditLog)
      .where(and(eq(auditLog.targetType, 'document'), eq(auditLog.targetId, id), inArray(auditLog.action, [HIDE_ACTION, SHOW_ACTION])))
      .orderBy(asc(auditLog.createdAt)),
  ]);
  return { versions, reviews, visibility: audit.map((row) => ({ hidden: row.action === HIDE_ACTION, actorId: row.actorId, createdAt: row.createdAt })) };
}

export type ActorRole = 'admin' | 'reviewer' | 'member';

/** Names and roles of the accounts in a history (admins by ADMIN_SUBS, reviewers by their role). */
export async function actorsOf(db: Db, adminSubs: ReadonlySet<string>, ids: readonly string[]): Promise<Map<string, { name: string | null; role: ActorRole }>> {
  const valid = [...new Set(ids.filter(isUuid))];
  if (valid.length === 0) return new Map();
  const rows = await db.select({ id: users.id, name: users.name, sub: users.sub, role: users.role }).from(users).where(inArray(users.id, valid));
  return new Map(rows.map((row) => [row.id, { name: row.name, role: adminSubs.has(row.sub) ? 'admin' : row.role }]));
}
