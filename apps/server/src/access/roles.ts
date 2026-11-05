/**
 * Workspace roles (C19 "Vai trò & quyền"), resolved in one place:
 * - an account whose IdP sub is in ADMIN_SUBS is an admin (a bootstrap admin: no one demotes or removes it from the
 *   app, and it stays an admin whatever its row says);
 * - any other account has the role an admin granted it (`users.role`: member, reviewer or admin);
 * - a removed account (C19 "Gỡ") or one that deleted its data (H03) has no role at all: it reads as a guest.
 *
 * What each role may do: everyone reads and writes; reviewers and admins decide the review queue (A01); only admins
 * manage published texts (A02), the admin API and its tokens (A03) and the workspace (C19).
 */
import { type SQL, and, inArray, isNull, notInArray, or } from 'drizzle-orm';
import { USER_ROLES, users } from '../db/schema';

export type WorkspaceRole = (typeof USER_ROLES)[number];

export interface RoleFields {
  sub: string;
  role: WorkspaceRole;
}

export function isBootstrapAdmin(adminSubs: ReadonlySet<string>, sub: string): boolean {
  return adminSubs.has(sub);
}

/** The role an account acts with. */
export function effectiveRole(adminSubs: ReadonlySet<string>, account: RoleFields): WorkspaceRole {
  return isBootstrapAdmin(adminSubs, account.sub) ? 'admin' : account.role;
}

/** Whether the role may decide the review queue (A01). */
export function canReviewAs(role: WorkspaceRole): boolean {
  return role === 'admin' || role === 'reviewer';
}

/** Live accounts (not removed, not deleted) whose role is one of `roles`, as a condition on `users`. */
export function withRole(adminSubs: ReadonlySet<string>, roles: readonly WorkspaceRole[]): SQL {
  const subs = [...adminSubs];
  const live = and(isNull(users.removedAt), isNull(users.deletedAt));
  const byRow = inArray(users.role, [...roles]);
  if (subs.length === 0) return and(live, byRow) ?? byRow;
  // A bootstrap admin is an admin whatever its row says: it counts when `admin` is asked for, and never otherwise.
  const matching = roles.includes('admin') ? or(byRow, inArray(users.sub, subs)) : and(byRow, notInArray(users.sub, subs));
  return and(live, matching) ?? byRow;
}
