import { eq } from 'drizzle-orm';
import type { Db } from '../db/client';
import { users } from '../db/schema';
import { isUuid } from './ids';

/** Who is reading: a guest, or a signed-in account (an admin when its IdP sub is in ADMIN_SUBS). */
export type Viewer = { kind: 'guest' } | { kind: 'user'; userId: string; isAdmin: boolean };

export const GUEST: Viewer = { kind: 'guest' };

/** The viewer of a request: `userId` from the session (null without one). An unknown account reads as a guest. */
export async function viewerFor(db: Db, adminSubs: ReadonlySet<string>, userId: string | null): Promise<Viewer> {
  if (!userId || !isUuid(userId)) return GUEST;
  const [row] = await db.select({ sub: users.sub }).from(users).where(eq(users.id, userId));
  if (!row) return GUEST;
  return { kind: 'user', userId, isAdmin: adminSubs.has(row.sub) };
}
