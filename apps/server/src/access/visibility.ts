/**
 * THE read rule of kb, in its two forms (a SQL condition and a plain check, kept equal by visibility.test.ts):
 * a live document (not in the trash) is readable by
 * - everyone, when it is approved and not hidden;
 * - its author, whatever its status;
 * - a reviewer, while it waits for review (pending), so the review queue (A01) can open it;
 * - an admin, always.
 * A document in the trash is readable through none of these paths.
 */
import { type SQL, and, eq, isNull, or, sql } from 'drizzle-orm';
import { documents } from '../db/schema';
import type { Viewer } from './viewer';

export interface VisibilityFields {
  status: (typeof documents.$inferSelect)['status'];
  hidden: boolean;
  authorId: string;
  deletedAt: Date | null;
}

/** Approved, not hidden, not deleted: what everyone sees, and what goes to the public search index. */
export function isPublic(doc: VisibilityFields): boolean {
  return doc.deletedAt === null && doc.status === 'approved' && !doc.hidden;
}

export function canRead(viewer: Viewer, doc: VisibilityFields): boolean {
  if (doc.deletedAt !== null) return false;
  if (isPublic(doc)) return true;
  if (viewer.kind === 'guest') return false;
  return viewer.isAdmin || doc.authorId === viewer.userId || (viewer.canReview && doc.status === 'pending');
}

/** `canRead` as a condition on the `documents` table. */
export function visibleTo(viewer: Viewer): SQL {
  const live = isNull(documents.deletedAt);
  const published = and(eq(documents.status, 'approved'), eq(documents.hidden, false));
  if (viewer.kind === 'guest') return and(live, published) ?? sql`false`;
  if (viewer.isAdmin) return live;
  const own = eq(documents.authorId, viewer.userId);
  const waiting = viewer.canReview ? eq(documents.status, 'pending') : undefined;
  return and(live, or(published, own, waiting)) ?? sql`false`;
}
