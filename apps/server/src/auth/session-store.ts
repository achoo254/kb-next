import { createHash, randomBytes } from 'node:crypto';
import { and, eq, inArray, isNull, lt, lte, or } from 'drizzle-orm';
import type { Db } from '../db/client';
import { sessions, users } from '../db/schema';
import { SESSION_ABSOLUTE_DAYS, SESSION_IDLE_DAYS } from '../retention';

const DAY_MS = 24 * 60 * 60 * 1000;
export const SESSION_ABSOLUTE_MS = SESSION_ABSOLUTE_DAYS * DAY_MS;
export const SESSION_IDLE_MS = SESSION_IDLE_DAYS * DAY_MS;
/** Refresh `last_seen_at` at most this often, to avoid a write on every request. */
const TOUCH_INTERVAL_MS = 60 * 1000;

export type SessionRow = typeof sessions.$inferSelect;

/** Only the sha256 of the session token is stored, so a database leak does not hand out live sessions. */
export function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

/** What the IdP's userinfo says of the account; a missing field is null. */
export interface AccountProfile {
  name: string | null;
  email: string | null;
  picture: string | null;
}

/**
 * The user row of an IdP account, created on its first sign-in. A `profile` (userinfo answered) replaces the
 * stored one, so a name or picture removed at the IdP goes here too; `null` (userinfo failed) keeps it.
 */
export async function upsertUser(db: Db, sub: string, profile: AccountProfile | null, now: Date): Promise<string> {
  const insert = db.insert(users).values({ sub, ...profile, createdAt: now });
  const [row] = await (profile
    ? insert.onConflictDoUpdate({ target: users.sub, set: profile })
    : insert.onConflictDoNothing({ target: users.sub })
  ).returning({ id: users.id });
  if (row) return row.id;
  const [existing] = await db.select({ id: users.id }).from(users).where(eq(users.sub, sub));
  if (!existing) throw new Error('user upsert found no row');
  return existing.id;
}

/** What the web app needs at once: the profile for the account menu and the display settings for the first paint. */
export interface SessionProfile extends AccountProfile {
  theme: (typeof users.$inferSelect)['theme'];
  reducedMotion: boolean;
}

/** The stored profile and display settings of a live account; null for one removed or deleted. */
export async function findProfile(db: Db, userId: string): Promise<SessionProfile | null> {
  const [row] = await db
    .select({ name: users.name, email: users.email, picture: users.picture, theme: users.theme, reducedMotion: users.reducedMotion })
    .from(users)
    .where(and(eq(users.id, userId), isNull(users.removedAt), isNull(users.deletedAt)));
  return row ?? null;
}

/** A new session of `userId`; `idpSid` is the IdP session it came from (null when the IdP sent no `sid`). */
export async function createSession(db: Db, userId: string, now: Date, idpSid: string | null): Promise<string> {
  const token = randomBytes(32).toString('base64url');
  await db.insert(sessions).values({
    id: hashToken(token),
    userId,
    idpSid,
    createdAt: now,
    lastSeenAt: now,
    expiresAt: new Date(now.getTime() + SESSION_ABSOLUTE_MS),
  });
  return token;
}

/**
 * The live session of a token; expired ones (absolute or idle) are deleted, and so is a session of an account that was
 * removed from the workspace or deleted its data (a session opened in a race with either is worth nothing).
 */
export async function findSession(db: Db, token: string, now: Date): Promise<SessionRow | null> {
  const id = hashToken(token);
  const [found] = await db
    .select({ session: sessions, removedAt: users.removedAt, deletedAt: users.deletedAt })
    .from(sessions)
    .innerJoin(users, eq(users.id, sessions.userId))
    .where(eq(sessions.id, id));
  if (!found) return null;
  const { session } = found;
  const idleExpired = now.getTime() - session.lastSeenAt.getTime() > SESSION_IDLE_MS;
  if (session.expiresAt.getTime() <= now.getTime() || idleExpired || found.removedAt !== null || found.deletedAt !== null) {
    await db.delete(sessions).where(eq(sessions.id, id));
    return null;
  }
  if (now.getTime() - session.lastSeenAt.getTime() > TOUCH_INTERVAL_MS) {
    await db.update(sessions).set({ lastSeenAt: now }).where(eq(sessions.id, id));
  }
  return session;
}

export async function deleteSessionByToken(db: Db, token: string): Promise<void> {
  await db.delete(sessions).where(eq(sessions.id, hashToken(token)));
}

/** Deletes every session past its absolute or idle expiry; returns how many went. */
export async function purgeExpiredSessions(db: Db, now: Date): Promise<number> {
  const idleSince = new Date(now.getTime() - SESSION_IDLE_MS);
  const removed = await db
    .delete(sessions)
    .where(or(lte(sessions.expiresAt, now), lt(sessions.lastSeenAt, idleSince)))
    .returning({ id: sessions.id });
  return removed.length;
}

/** Ends the sessions signed in through IdP session `sid` (back-channel logout); returns how many went. */
export async function deleteSessionsByIdpSid(db: Db, sid: string): Promise<number> {
  const removed = await db.delete(sessions).where(eq(sessions.idpSid, sid)).returning({ id: sessions.id });
  return removed.length;
}

/** Ends every session of the account `sub` (back-channel logout without a `sid`); returns how many went. */
export async function deleteSessionsOfSub(db: Db, sub: string): Promise<number> {
  const owner = db.select({ id: users.id }).from(users).where(eq(users.sub, sub));
  const removed = await db.delete(sessions).where(inArray(sessions.userId, owner)).returning({ id: sessions.id });
  return removed.length;
}
