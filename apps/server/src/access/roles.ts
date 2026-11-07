/**
 * Workspace roles (C19 "Vai trò & quyền"), resolved in one place:
 * - an account whose IdP sub is in ADMIN_SUBS is an admin (a bootstrap admin: no one demotes or removes it from the
 *   app, and it stays an admin whatever its row says);
 * - any other account has the role an admin granted it (`users.role`: member or admin);
 * - a removed account (C19 "Gỡ") or one that deleted its data (H03) has no role at all: it reads as a guest.
 *
 * What each role may do: everyone reads, writes and publishes their own texts; only admins manage every text (A02),
 * the admin API and its tokens (A03) and the workspace (C19). The stored role `reviewer` is left from the review gate
 * (removed 07/11/2026): the enum keeps it for existing rows, which act as members.
 */
import { type SQL, and, inArray, isNull, notInArray, or } from 'drizzle-orm';
import { type USER_ROLES, users } from '../db/schema';

/** A role as stored (`users.role`), `reviewer` included. */
export type StoredRole = (typeof USER_ROLES)[number];
export const WORKSPACE_ROLES = ['member', 'admin'] as const;
/** A role an account acts with. */
export type WorkspaceRole = (typeof WORKSPACE_ROLES)[number];

export interface RoleFields {
  sub: string;
  role: StoredRole;
}

export function isBootstrapAdmin(adminSubs: ReadonlySet<string>, sub: string): boolean {
  return adminSubs.has(sub);
}

/** The role an account acts with. */
export function effectiveRole(adminSubs: ReadonlySet<string>, account: RoleFields): WorkspaceRole {
  if (isBootstrapAdmin(adminSubs, account.sub)) return 'admin';
  return account.role === 'admin' ? 'admin' : 'member';
}

/** Live accounts (not removed, not deleted) whose role is one of `roles`, as a condition on `users`. */
export function withRole(adminSubs: ReadonlySet<string>, roles: readonly WorkspaceRole[]): SQL {
  const subs = [...adminSubs];
  const live = and(isNull(users.removedAt), isNull(users.deletedAt));
  const stored: StoredRole[] = roles.includes('member') ? [...roles, 'reviewer'] : [...roles];
  const byRow = inArray(users.role, stored);
  if (subs.length === 0) return and(live, byRow) ?? byRow;
  // A bootstrap admin is an admin whatever its row says: it counts when `admin` is asked for, and never otherwise.
  const matching = roles.includes('admin') ? or(byRow, inArray(users.sub, subs)) : and(byRow, notInArray(users.sub, subs));
  return and(live, matching) ?? byRow;
}
