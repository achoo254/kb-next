/**
 * C10 "Thành viên & quyền": who takes part in a Space and what the viewer may do there, from real data. A public
 * Space's members are the authors of its published documents plus the admins ("Quản trị", ADMIN_SUBS) and reviewers
 * ("Người duyệt"); a personal Space has its owner only.
 */
import { eq } from 'drizzle-orm';
import type { SpaceRow } from '../access/content';
import { spaceContributors, staffAccounts } from '../access/participation';
import type { Viewer } from '../access/viewer';
import type { Db } from '../db/client';
import { users } from '../db/schema';

export type MemberRole = 'owner' | 'admin' | 'reviewer' | 'member';

export interface SpaceMember {
  name: string | null;
  picture: string | null;
  role: MemberRole;
  /** Published texts of this Space they wrote. */
  documentCount: number;
}

export interface SpacePermissions {
  /** May write in this Space (a member's text goes to review before it is published). */
  canCreate: boolean;
  /** May approve or send back submitted texts. */
  canReview: boolean;
  /** May manage the Space and hide documents. */
  canAdmin: boolean;
}

const ROLE_ORDER: Record<MemberRole, number> = { owner: 0, admin: 1, reviewer: 2, member: 3 };

export async function spaceMembers(db: Db, adminSubs: ReadonlySet<string>, space: SpaceRow): Promise<SpaceMember[]> {
  if (space.kind === 'personal') {
    if (!space.ownerId) return [];
    const [owner] = await db.select({ name: users.name, picture: users.picture }).from(users).where(eq(users.id, space.ownerId));
    return owner ? [{ ...owner, role: 'owner', documentCount: 0 }] : [];
  }
  const people = new Map<string, SpaceMember>();
  const roleOf = (sub: string, role: 'member' | 'reviewer'): MemberRole => (adminSubs.has(sub) ? 'admin' : role);
  for (const c of await spaceContributors(db, space.id)) {
    people.set(c.userId, { name: c.name, picture: c.picture, role: roleOf(c.sub, c.role), documentCount: c.documents });
  }
  for (const s of await staffAccounts(db, adminSubs)) {
    if (!people.has(s.userId)) people.set(s.userId, { name: s.name, picture: s.picture, role: roleOf(s.sub, s.role), documentCount: 0 });
  }
  return [...people.values()].sort((a, b) => ROLE_ORDER[a.role] - ROLE_ORDER[b.role] || b.documentCount - a.documentCount || (a.name ?? '').localeCompare(b.name ?? '', 'vi'));
}

export async function spacePermissions(db: Db, viewer: Viewer, space: SpaceRow): Promise<SpacePermissions> {
  if (viewer.kind === 'guest') return { canCreate: false, canReview: false, canAdmin: false };
  if (space.kind === 'personal') {
    const own = space.ownerId === viewer.userId;
    return { canCreate: own, canReview: false, canAdmin: own };
  }
  const [row] = await db.select({ role: users.role }).from(users).where(eq(users.id, viewer.userId));
  return { canCreate: true, canReview: viewer.isAdmin || row?.role === 'reviewer', canAdmin: viewer.isAdmin };
}
