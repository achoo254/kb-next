import { eq } from 'drizzle-orm';
import type { Db } from '../db/client';
import { users } from '../db/schema';
import { isUuid } from './ids';
import { effectiveRole } from './roles';

/**
 * Who is reading: a guest, or a signed-in account with what its role allows (src/access/roles.ts): `isAdmin` for an
 * admin.
 */
export type Viewer = { kind: 'guest' } | { kind: 'user'; userId: string; isAdmin: boolean };

export const GUEST: Viewer = { kind: 'guest' };

/** An ordinary account (no role beyond member), for code acting as a given author. */
export function memberViewer(userId: string): Extract<Viewer, { kind: 'user' }> {
  return { kind: 'user', userId, isAdmin: false };
}

/**
 * The viewer of a request: `userId` from the session (null without one). An unknown account, one removed from the
 * workspace or one that deleted its data reads as a guest.
 */
export async function viewerFor(db: Db, adminSubs: ReadonlySet<string>, userId: string | null): Promise<Viewer> {
  if (!userId || !isUuid(userId)) return GUEST;
  const [row] = await db
    .select({ sub: users.sub, role: users.role, removedAt: users.removedAt, deletedAt: users.deletedAt })
    .from(users)
    .where(eq(users.id, userId));
  if (!row || row.removedAt !== null || row.deletedAt !== null) return GUEST;
  return { kind: 'user', userId, isAdmin: effectiveRole(adminSubs, row) === 'admin' };
}
