/**
 * The workspace's members as an admin manages them (C19 "Thành viên"): every account that signed in and has not
 * deleted its data, with its role (src/access/roles.ts) and when it was last active. An admin changes a role or takes
 * an account out of the workspace ("Gỡ"), and may put it back; every change writes its audit line in the same
 * transaction. Nobody changes a bootstrap admin (ADMIN_SUBS) or their own account from here.
 *
 * Removing an account ends its sessions and refuses its sign-ins (it reads as a guest meanwhile); its texts waiting
 * for review go back to drafts (out of the queue), its published texts stay. Restoring it lets it sign in again with
 * the role it had.
 */
import { type SQL, and, asc, count, desc, eq, isNull, max, sql } from 'drizzle-orm';
import type { Db } from '../db/client';
import { documents, sessions, users } from '../db/schema';
import { AUDIT_ACTIONS, recordAudit } from '../workspace/audit';
import { isUuid } from './ids';
import { type WorkspaceRole, effectiveRole, isBootstrapAdmin } from './roles';

export interface Member {
  id: string;
  name: string | null;
  email: string | null;
  picture: string | null;
  role: WorkspaceRole;
  /** A bootstrap admin (ADMIN_SUBS): its role and membership are not changed from the app. */
  bootstrap: boolean;
  /** Last request of any of its sessions; null when it has no live session. */
  lastSeenAt: Date | null;
  joinedAt: Date;
  removedAt: Date | null;
}

const ROLE_RANK: Record<WorkspaceRole, number> = { admin: 0, reviewer: 1, member: 2 };

/** How many members C19 lists at most; the answer says how many there are in all. */
export const MEMBERS_PAGE = 1000;

async function queryMembers(db: Db, adminSubs: ReadonlySet<string>, where: SQL | undefined, limit: number): Promise<Member[]> {
  const seen = db.select({ userId: sessions.userId, at: max(sessions.lastSeenAt).as('at') }).from(sessions).groupBy(sessions.userId).as('seen');
  const rows = await db
    .select({
      id: users.id,
      sub: users.sub,
      name: users.name,
      email: users.email,
      picture: users.picture,
      role: users.role,
      createdAt: users.createdAt,
      removedAt: users.removedAt,
      lastSeenAt: seen.at,
    })
    .from(users)
    .leftJoin(seen, eq(seen.userId, users.id))
    .where(and(isNull(users.deletedAt), where))
    // Past the page, the ones that matter stay in it: staff first, then the live accounts last active most recently.
    .orderBy(desc(sql`${users.role} <> 'member'`), sql`${users.removedAt} is not null`, sql`${seen.at} desc nulls last`, asc(users.createdAt))
    .limit(limit);
  return rows.map((row) => ({
    id: row.id,
    name: row.name,
    email: row.email,
    picture: row.picture,
    role: effectiveRole(adminSubs, row),
    bootstrap: isBootstrapAdmin(adminSubs, row.sub),
    lastSeenAt: row.lastSeenAt ? new Date(row.lastSeenAt) : null,
    joinedAt: row.createdAt,
    removedAt: row.removedAt,
  }));
}

/**
 * Members, admins first, then reviewers, then the most recently active; removed accounts last. At most `limit` of
 * them, with the count of all.
 */
export async function listMembers(db: Db, adminSubs: ReadonlySet<string>, limit = MEMBERS_PAGE): Promise<{ members: Member[]; total: number }> {
  const time = (d: Date | null): number => d?.getTime() ?? 0;
  const members = (await queryMembers(db, adminSubs, undefined, limit)).sort(
    (a, b) =>
      Number(a.removedAt !== null) - Number(b.removedAt !== null) ||
      ROLE_RANK[a.role] - ROLE_RANK[b.role] ||
      time(b.lastSeenAt) - time(a.lastSeenAt) ||
      a.joinedAt.getTime() - b.joinedAt.getTime(),
  );
  const [all] = await db.select({ n: count() }).from(users).where(isNull(users.deletedAt));
  return { members, total: all?.n ?? members.length };
}

export type MemberChange = { kind: 'ok'; member: Member } | { kind: 'not-found' } | { kind: 'locked' } | { kind: 'self' } | { kind: 'removed' };

type Tx = Parameters<Parameters<Db['transaction']>[0]>[0];

/** The live account row an admin may change, locked; or why it may not be changed. */
async function changeable(
  tx: Tx,
  adminSubs: ReadonlySet<string>,
  actorId: string,
  targetId: string,
): Promise<{ kind: 'ok'; row: { sub: string; role: WorkspaceRole; removedAt: Date | null } } | { kind: 'not-found' } | { kind: 'locked' } | { kind: 'self' }> {
  if (!isUuid(targetId)) return { kind: 'not-found' };
  const [row] = await tx
    .select({ sub: users.sub, role: users.role, removedAt: users.removedAt })
    .from(users)
    .where(and(eq(users.id, targetId), isNull(users.deletedAt)))
    .for('update');
  if (!row) return { kind: 'not-found' };
  if (targetId === actorId) return { kind: 'self' };
  if (isBootstrapAdmin(adminSubs, row.sub)) return { kind: 'locked' };
  return { kind: 'ok', row };
}

async function memberById(db: Db, adminSubs: ReadonlySet<string>, id: string): Promise<Member | null> {
  const [member] = await queryMembers(db, adminSubs, eq(users.id, id), 1);
  return member ?? null;
}

type Refusal = Exclude<MemberChange, { kind: 'ok' }>;

/** The member as it is now when the change went through, else why it did not. */
async function settled(db: Db, adminSubs: ReadonlySet<string>, id: string, result: Refusal | { kind: 'ok' }): Promise<MemberChange> {
  if (result.kind !== 'ok') return result;
  const member = await memberById(db, adminSubs, id);
  return member ? { kind: 'ok', member } : { kind: 'not-found' };
}

/** Gives an account a role (C19 "Đổi vai trò"); a removed account is put back first ("removed" refuses). */
export async function setMemberRole(db: Db, adminSubs: ReadonlySet<string>, actorId: string, targetId: string, role: WorkspaceRole, now: Date): Promise<MemberChange> {
  const result = await db.transaction(async (tx) => {
    const target = await changeable(tx, adminSubs, actorId, targetId);
    if (target.kind !== 'ok') return target;
    if (target.row.removedAt !== null) return { kind: 'removed' as const };
    if (target.row.role !== role) {
      await tx.update(users).set({ role }).where(eq(users.id, targetId));
      await recordAudit(tx, { actorId, action: AUDIT_ACTIONS.roleChanged, targetType: 'user', targetId, detail: { from: target.row.role, to: role } }, now);
    }
    return { kind: 'ok' as const };
  });
  return settled(db, adminSubs, targetId, result);
}

/**
 * Takes an account out of the workspace (C19 "Gỡ"): its sessions end, its texts waiting for review go back to drafts
 * (their ids come back, for the search sync and the reviewers' notices), its published texts stay.
 */
export async function removeMember(db: Db, adminSubs: ReadonlySet<string>, actorId: string, targetId: string, now: Date): Promise<MemberChange & { withdrawn: string[] }> {
  const result = await db.transaction(async (tx) => {
    const target = await changeable(tx, adminSubs, actorId, targetId);
    if (target.kind !== 'ok') return { ...target, withdrawn: [] };
    if (target.row.removedAt !== null) return { kind: 'ok' as const, withdrawn: [] };
    await tx.update(users).set({ removedAt: now }).where(eq(users.id, targetId));
    await tx.delete(sessions).where(eq(sessions.userId, targetId));
    const withdrawn = await tx
      .update(documents)
      .set({ status: 'draft' })
      .where(and(eq(documents.authorId, targetId), eq(documents.status, 'pending')))
      .returning({ id: documents.id });
    await recordAudit(tx, { actorId, action: AUDIT_ACTIONS.memberRemoved, targetType: 'user', targetId, detail: { withdrawn: withdrawn.length } }, now);
    return { kind: 'ok' as const, withdrawn: withdrawn.map((d) => d.id) };
  });
  return { ...(await settled(db, adminSubs, targetId, result)), withdrawn: result.withdrawn };
}

/** Puts a removed account back (C19 "Khôi phục"), with the role it had. */
export async function restoreMember(db: Db, adminSubs: ReadonlySet<string>, actorId: string, targetId: string, now: Date): Promise<MemberChange> {
  const result = await db.transaction(async (tx) => {
    const target = await changeable(tx, adminSubs, actorId, targetId);
    if (target.kind !== 'ok') return target;
    if (target.row.removedAt !== null) {
      await tx.update(users).set({ removedAt: null }).where(eq(users.id, targetId));
      await recordAudit(tx, { actorId, action: AUDIT_ACTIONS.memberRestored, targetType: 'user', targetId }, now);
    }
    return { kind: 'ok' as const };
  });
  return settled(db, adminSubs, targetId, result);
}

/** Whether an account may hold a session: it exists, is not removed and has not deleted its data. */
export async function mayHoldSession(db: Db, userId: string): Promise<boolean> {
  const [row] = await db
    .select({ id: users.id })
    .from(users)
    .where(and(eq(users.id, userId), isNull(users.removedAt), isNull(users.deletedAt)));
  return row !== undefined;
}
