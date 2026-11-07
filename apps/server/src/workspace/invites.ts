/**
 * Invite links (C19 "Mời bằng link"). The app sends no email: an admin copies the link into a chat, and whoever opens
 * it signs in with their hoandat account (the IdP) and accepts it.
 *
 * - A token is 32 random base64url characters (192 bits); only its sha256 and its last four characters are stored,
 *   and it is shown once, when made. One live link at a time: making one revokes the others.
 * - A link lasts INVITE_DAYS and may be revoked sooner; it also stops working once the admin who made it is no longer
 *   one. It may be accepted by any number of accounts while it runs.
 * - A link grants the member role, which every account already has: accepting never changes a role (`raised` stays
 *   false). A `reviewer` link left from the review gate (removed 07/11/2026) reads as a member link. Accepting is
 *   written to the audit log; the link and the account are both checked again inside that transaction. A removed
 *   account cannot accept one.
 * - Making a link takes a transaction-scoped advisory lock, so two at once still leave one live link.
 */
import { createHash, randomBytes } from 'node:crypto';
import { and, desc, eq, gt, isNull, sql } from 'drizzle-orm';
import { effectiveRole } from '../access/roles';
import type { Db } from '../db/client';
import { inviteLinks, users } from '../db/schema';
import { AUDIT_ACTIONS, recordAudit } from './audit';

export const INVITE_DAYS = 7;
/** Key of the advisory lock that serialises making invite links. */
const INVITE_LOCK = 0x6b62_6976;
const DAY_MS = 24 * 60 * 60 * 1000;
const TOKEN_SHAPE = /^[A-Za-z0-9_-]{32}$/;

export const INVITE_ROLES = ['member'] as const;
export type InviteRole = (typeof INVITE_ROLES)[number];

export interface InviteInfo {
  id: string;
  last4: string;
  role: InviteRole;
  expiresAt: Date;
  acceptedCount: number;
  createdAt: Date;
}

function hashOf(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

const infoColumns = {
  id: inviteLinks.id,
  last4: inviteLinks.last4,
  expiresAt: inviteLinks.expiresAt,
  acceptedCount: inviteLinks.acceptedCount,
  createdAt: inviteLinks.createdAt,
};

/** Makes a link granting `role` (the caller checked `actorId` is an admin), revoking the live ones. */
export async function createInvite(db: Db, actorId: string, role: InviteRole, now: Date): Promise<{ token: string; invite: InviteInfo }> {
  const token = randomBytes(24).toString('base64url');
  const invite = await db.transaction(async (tx) => {
    // Serialises link making: the revoke-then-insert below would otherwise leave two live links under concurrency.
    await tx.execute(sql`select pg_advisory_xact_lock(${INVITE_LOCK})`);
    await tx
      .update(inviteLinks)
      .set({ revokedAt: now })
      .where(and(isNull(inviteLinks.revokedAt), gt(inviteLinks.expiresAt, now)));
    const [row] = await tx
      .insert(inviteLinks)
      .values({ tokenHash: hashOf(token), last4: token.slice(-4), role, createdBy: actorId, expiresAt: new Date(now.getTime() + INVITE_DAYS * DAY_MS), createdAt: now })
      .returning(infoColumns);
    if (!row) throw new Error('invite insert returned nothing');
    await recordAudit(tx, { actorId, action: AUDIT_ACTIONS.inviteCreated, targetType: 'invite', targetId: row.id, detail: { role } }, now);
    return { ...row, role };
  });
  return { token, invite };
}

/** The link in use (not revoked, not expired), or null. */
export async function liveInvite(db: Db, now: Date): Promise<InviteInfo | null> {
  const [row] = await db
    .select(infoColumns)
    .from(inviteLinks)
    .where(and(isNull(inviteLinks.revokedAt), gt(inviteLinks.expiresAt, now)))
    .orderBy(desc(inviteLinks.createdAt))
    .limit(1);
  return row ? { ...row, role: 'member' } : null;
}

/** Revokes a live link; false when there is no such live link. */
export async function revokeInvite(db: Db, actorId: string, id: string, now: Date): Promise<boolean> {
  return db.transaction(async (tx) => {
    const rows = await tx
      .update(inviteLinks)
      .set({ revokedAt: now })
      .where(and(eq(inviteLinks.id, id), isNull(inviteLinks.revokedAt), gt(inviteLinks.expiresAt, now)))
      .returning({ id: inviteLinks.id });
    if (rows.length === 0) return false;
    await recordAudit(tx, { actorId, action: AUDIT_ACTIONS.inviteRevoked, targetType: 'invite', targetId: id }, now);
    return true;
  });
}

export type InviteLookup = { kind: 'ok'; id: string; role: InviteRole; expiresAt: Date } | { kind: 'not-found' } | { kind: 'off' };

type Tx = Parameters<Parameters<Db['transaction']>[0]>[0];

/**
 * What a token is: `not-found` for a malformed or unknown one, `off` once revoked, expired or its admin is no longer
 * one; else the role it grants. `lock`: holds the link's row for the caller's transaction.
 */
export async function findInvite(db: Db | Tx, adminSubs: ReadonlySet<string>, token: string, now: Date, lock = false): Promise<InviteLookup> {
  if (!TOKEN_SHAPE.test(token)) return { kind: 'not-found' };
  const query = db
    .select({ id: inviteLinks.id, expiresAt: inviteLinks.expiresAt, revokedAt: inviteLinks.revokedAt, sub: users.sub, makerRole: users.role, makerRemoved: users.removedAt, makerDeleted: users.deletedAt })
    .from(inviteLinks)
    .leftJoin(users, eq(users.id, inviteLinks.createdBy))
    .where(eq(inviteLinks.tokenHash, hashOf(token)));
  const [row] = lock ? await query.for('update', { of: inviteLinks }) : await query;
  if (!row) return { kind: 'not-found' };
  const makerIsAdmin = row.sub !== null && row.makerRole !== null && row.makerRemoved === null && row.makerDeleted === null && effectiveRole(adminSubs, { sub: row.sub, role: row.makerRole }) === 'admin';
  if (row.revokedAt !== null || row.expiresAt.getTime() <= now.getTime() || !makerIsAdmin) return { kind: 'off' };
  return { kind: 'ok', id: row.id, role: 'member', expiresAt: row.expiresAt };
}

export type AcceptResult = { kind: 'accepted'; role: InviteRole; raised: boolean } | { kind: 'not-found' } | { kind: 'off' };

/**
 * `userId` accepts the link (counted, never a role change). The link (row locked) and the account (live, row locked)
 * are checked inside the transaction that counts it.
 */
export async function acceptInvite(db: Db, adminSubs: ReadonlySet<string>, token: string, userId: string, now: Date): Promise<AcceptResult> {
  return db.transaction(async (tx): Promise<AcceptResult> => {
    const found = await findInvite(tx, adminSubs, token, now, true);
    if (found.kind !== 'ok') return found;
    const [account] = await tx
      .select({ id: users.id })
      .from(users)
      .where(and(eq(users.id, userId), isNull(users.removedAt), isNull(users.deletedAt)))
      .for('update');
    if (!account) return { kind: 'not-found' };
    await tx
      .update(inviteLinks)
      .set({ acceptedCount: sql`${inviteLinks.acceptedCount} + 1` })
      .where(eq(inviteLinks.id, found.id));
    await recordAudit(tx, { actorId: userId, action: AUDIT_ACTIONS.inviteAccepted, targetType: 'invite', targetId: found.id, detail: { role: found.role, raised: false } }, now);
    return { kind: 'accepted', role: found.role, raised: false };
  });
}
