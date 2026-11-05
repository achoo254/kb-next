/**
 * Admin API tokens (A03) and the log of admin API calls. A token is `kf_admin_` and 43 random base64url characters
 * (256 bits); only its sha256 is stored, its last four characters are kept to tell tokens apart, and it is shown
 * once, when made; making one revokes the others. A revoked token never works again. A call acts as the admin who made
 * the token, and only while that account is still an admin (src/access/roles.ts) and in the workspace.
 */
import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';
import { and, desc, eq, isNull, lt } from 'drizzle-orm';
import type { Db } from '../db/client';
import { adminApiCalls, adminTokens, users } from '../db/schema';

export const TOKEN_PREFIX = 'kf_admin_';
const TOKEN_SHAPE = /^kf_admin_[A-Za-z0-9_-]{43}$/;
/** How long the call log keeps a call. */
export const CALL_LOG_DAYS = 30;
/** Calls A03 lists. */
export const RECENT_CALLS = 20;

export function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

export interface TokenInfo {
  id: string;
  label: string;
  last4: string;
  createdAt: Date;
  lastUsedAt: Date | null;
  revokedAt: Date | null;
  createdByName: string | null;
}

/**
 * Makes a token for `userId` (an admin; the caller checks) and revokes every live one: one token in use at a time
 * (A03 "Tạo token mới sẽ thu hồi token cũ"). The token itself is only in this answer.
 */
export async function createToken(db: Db, userId: string, label: string, now: Date): Promise<{ token: string; info: TokenInfo }> {
  const token = `${TOKEN_PREFIX}${randomBytes(32).toString('base64url')}`;
  const row = await db.transaction(async (tx) => {
    await tx.update(adminTokens).set({ revokedAt: now }).where(isNull(adminTokens.revokedAt));
    const [inserted] = await tx
      .insert(adminTokens)
      .values({ tokenHash: hashToken(token), label, last4: token.slice(-4), createdBy: userId, createdAt: now })
      .returning();
    return inserted;
  });
  if (!row) throw new Error('admin token insert returned nothing');
  const [user] = await db.select({ name: users.name }).from(users).where(eq(users.id, userId));
  return { token, info: { id: row.id, label: row.label, last4: row.last4, createdAt: row.createdAt, lastUsedAt: null, revokedAt: null, createdByName: user?.name ?? null } };
}

/** Every token, the latest made first (A03), revoked ones included. */
export async function listTokens(db: Db): Promise<TokenInfo[]> {
  return db
    .select({
      id: adminTokens.id,
      label: adminTokens.label,
      last4: adminTokens.last4,
      createdAt: adminTokens.createdAt,
      lastUsedAt: adminTokens.lastUsedAt,
      revokedAt: adminTokens.revokedAt,
      createdByName: users.name,
    })
    .from(adminTokens)
    .leftJoin(users, eq(users.id, adminTokens.createdBy))
    .orderBy(desc(adminTokens.createdAt), desc(adminTokens.id));
}

/** Revokes a token for good; false when there is no such live token. */
export async function revokeToken(db: Db, id: string, now: Date): Promise<boolean> {
  const rows = await db
    .update(adminTokens)
    .set({ revokedAt: now })
    .where(and(eq(adminTokens.id, id), isNull(adminTokens.revokedAt)))
    .returning({ id: adminTokens.id });
  return rows.length > 0;
}

export interface TokenHolder {
  tokenId: string;
  /** The admin the token acts as. */
  userId: string;
  sub: string;
  role: (typeof users.$inferSelect)['role'];
  /** Its maker was removed from the workspace or deleted its data: the token acts as no one. */
  gone: boolean;
}

/**
 * The live token `presented` is, with its maker, recording this use; null for anything else (malformed, unknown,
 * revoked, its maker gone). The lookup is by hash; the stored hash is compared again in constant time.
 */
export async function useToken(db: Db, presented: string, now: Date): Promise<TokenHolder | null> {
  if (!TOKEN_SHAPE.test(presented)) return null;
  const hash = hashToken(presented);
  const [row] = await db
    .select({
      id: adminTokens.id,
      hash: adminTokens.tokenHash,
      revokedAt: adminTokens.revokedAt,
      userId: users.id,
      sub: users.sub,
      role: users.role,
      removedAt: users.removedAt,
      deletedAt: users.deletedAt,
    })
    .from(adminTokens)
    .innerJoin(users, eq(users.id, adminTokens.createdBy))
    .where(eq(adminTokens.tokenHash, hash));
  if (!row || row.revokedAt !== null) return null;
  if (!timingSafeEqual(Buffer.from(row.hash, 'hex'), Buffer.from(hash, 'hex'))) return null;
  await db.update(adminTokens).set({ lastUsedAt: now }).where(eq(adminTokens.id, row.id));
  return { tokenId: row.id, userId: row.userId, sub: row.sub, role: row.role, gone: row.removedAt !== null || row.deletedAt !== null };
}

export interface ApiCall {
  tokenId: string | null;
  method: string;
  path: string;
  status: number;
  error: string | null;
  documentId: string | null;
  documentTitle: string | null;
}

/** Records one authenticated call. */
export async function logCall(db: Db, call: ApiCall, now: Date): Promise<void> {
  await db.insert(adminApiCalls).values({ ...call, createdAt: now });
}

/** Forgets calls older than CALL_LOG_DAYS (the daily housekeeping); how many. */
export async function pruneCalls(db: Db, now: Date): Promise<number> {
  const rows = await db
    .delete(adminApiCalls)
    .where(lt(adminApiCalls.createdAt, new Date(now.getTime() - CALL_LOG_DAYS * 24 * 60 * 60 * 1000)))
    .returning({ id: adminApiCalls.id });
  return rows.length;
}

export interface LoggedCall extends ApiCall {
  id: string;
  createdAt: Date;
}

/** The latest calls (A03 "Nhật ký gọi gần đây"), newest first. */
export async function recentCalls(db: Db, limit: number = RECENT_CALLS): Promise<LoggedCall[]> {
  return db
    .select({
      id: adminApiCalls.id,
      tokenId: adminApiCalls.tokenId,
      method: adminApiCalls.method,
      path: adminApiCalls.path,
      status: adminApiCalls.status,
      error: adminApiCalls.error,
      documentId: adminApiCalls.documentId,
      documentTitle: adminApiCalls.documentTitle,
      createdAt: adminApiCalls.createdAt,
    })
    .from(adminApiCalls)
    .orderBy(desc(adminApiCalls.createdAt), desc(adminApiCalls.id))
    .limit(limit);
}
