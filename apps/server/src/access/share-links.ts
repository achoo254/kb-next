/**
 * Share links of a document (C18) and what opening one shows (H02, the link preview of /l/<token>).
 *
 * - Only a published text (approved, not hidden: `isPublic`) gets a link, and only from its author or an admin.
 * - A token is 32 random base64url characters (192 bits); only its sha256 and its last four characters are stored,
 *   and it is shown once, when made. One live link per document: making one revokes the others.
 * - A link may expire (7 or 30 days) and be revoked; while it runs its owner may change its expiry (counted from the
 *   change) and what a signed-in recipient may do besides reading (`view`, or `remix`: copy it into their own drafts).
 *   An expired or revoked link stays off: sharing again means a new link.
 * - A text leaving the published state (kept private by its author, trashed) revokes all its links
 *   (`revokeAllLinks`, called by each of those steps); deleting it for good deletes them. An admin's hide does not:
 *   while hidden, its links answer `private`, and they work again once it is shown.
 * - Opening a link: a wrong token is `not-found`; a revoked or expired one is `off`; a hidden text is `private` to
 *   anyone who may not read it, so the link tells nothing about it. Each successful opening by someone other than
 *   the text's author or an admin is logged (when, and the account or a guest), never the token.
 */
import { createHash, randomBytes } from 'node:crypto';
import { and, count, desc, eq, gte, inArray, isNull, lt, or } from 'drizzle-orm';
import type { Db } from '../db/client';
import { auditLog, documents, reviewEvents, shareLinkVisits, shareLinks, users } from '../db/schema';
import { type DocumentRow, documentColumns } from './content';
import { SHARE_OPENINGS_KEEP_DAYS } from '../retention';
import { HIDE_ACTION, SHOW_ACTION } from './history';
import { isUuid } from './ids';
import { findApproval } from './reading';
import type { Viewer } from './viewer';
import { canRead, isPublic } from './visibility';

const TOKEN_SHAPE = /^[A-Za-z0-9_-]{32}$/;
const DAY_MS = 24 * 60 * 60 * 1000;

export type ShareExpiry = (typeof shareLinks.$inferSelect)['expiry'];
const EXPIRY_DAYS: Record<ShareExpiry, number | null> = { none: null, '7d': 7, '30d': 30 };

export type ShareAccess = (typeof shareLinks.$inferSelect)['access'];
export type ShareLinkRow = typeof shareLinks.$inferSelect;

/** How long the access history keeps an opening (src/retention.ts). */
export const OPENED_KEEP_DAYS = SHARE_OPENINGS_KEEP_DAYS;
/** History lines C18 lists. */
export const HISTORY_LIMIT = 20;

export function isShareTokenShape(token: string): boolean {
  return TOKEN_SHAPE.test(token);
}

function hashOf(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

function expiresAtOf(expiry: ShareExpiry, now: Date): Date | null {
  const days = EXPIRY_DAYS[expiry];
  return days === null ? null : new Date(now.getTime() + days * DAY_MS);
}

/** What a link was given (the history's detail): `<expiry>|<access>`, either part empty when unchanged. */
export function expiryDetail(expiry: ShareExpiry | '', access: ShareAccess | ''): string {
  return `${expiry}|${access}`;
}

type Tx = Parameters<Parameters<Db['transaction']>[0]>[0];

async function liveDocument(db: Db | Tx, id: string): Promise<DocumentRow | null> {
  if (!isUuid(id)) return null;
  const [doc] = await db
    .select(documentColumns)
    .from(documents)
    .where(and(eq(documents.id, id), isNull(documents.deletedAt)));
  return doc ?? null;
}

export type ManageAccess = { kind: 'ok'; doc: DocumentRow } | { kind: 'not-found' } | { kind: 'no-access' };

/**
 * Whether the viewer manages the share links of a document: its author or an admin. `not-found` for a text the viewer
 * may not read at all (as the reader answers), `no-access` for one they read but do not own.
 */
export async function shareManageAccess(db: Db, viewer: Viewer, id: string): Promise<ManageAccess> {
  const doc = await liveDocument(db, id);
  if (!doc || !canRead(viewer, doc)) return { kind: 'not-found' };
  if (viewer.kind !== 'user' || (!viewer.isAdmin && doc.authorId !== viewer.userId)) return { kind: 'no-access' };
  return { kind: 'ok', doc };
}

/** The latest link made for a document (live, expired or revoked), or null when it never had one. */
export async function latestLink(db: Db, documentId: string): Promise<ShareLinkRow | null> {
  const [row] = await db.select().from(shareLinks).where(eq(shareLinks.documentId, documentId)).orderBy(desc(shareLinks.createdAt), desc(shareLinks.id)).limit(1);
  return row ?? null;
}

export type CreateResult = { kind: 'created'; token: string; link: ShareLinkRow } | { kind: 'not-shareable' };

/** Makes the document's link (the caller checked `shareManageAccess`), revoking the live ones; the token is only here. */
export async function createShareLink(db: Db, actorId: string, doc: DocumentRow, input: { expiry: ShareExpiry; access: ShareAccess }, now: Date): Promise<CreateResult> {
  const token = randomBytes(24).toString('base64url');
  return db.transaction(async (tx): Promise<CreateResult> => {
    // Read again under the transaction: hidden or sent back meanwhile means no link.
    const [current] = await tx.select(documentColumns).from(documents).where(eq(documents.id, doc.id)).for('update');
    if (!current || !isPublic(current)) return { kind: 'not-shareable' };
    const revoked = await tx
      .update(shareLinks)
      .set({ revokedAt: now })
      .where(and(eq(shareLinks.documentId, doc.id), isNull(shareLinks.revokedAt)))
      .returning({ id: shareLinks.id });
    if (revoked.length > 0) await tx.insert(shareLinkVisits).values(revoked.map((r) => ({ shareLinkId: r.id, kind: 'revoked' as const, userId: actorId, visitedAt: now })));
    const [link] = await tx
      .insert(shareLinks)
      .values({ documentId: doc.id, tokenHash: hashOf(token), last4: token.slice(-4), access: input.access, expiry: input.expiry, createdBy: actorId, expiresAt: expiresAtOf(input.expiry, now), createdAt: now })
      .returning();
    if (!link) throw new Error('share link insert returned nothing');
    await tx.insert(shareLinkVisits).values({ shareLinkId: link.id, kind: 'created', userId: actorId, detail: expiryDetail(input.expiry, input.access), visitedAt: now });
    return { kind: 'created', token, link };
  });
}

export type ChangeResult = { kind: 'ok'; link: ShareLinkRow } | { kind: 'no-link' } | { kind: 'expired' };

/** A new expiry (from now) or access for the document's running link, logged; an expired one stays off. */
export async function changeShareLink(db: Db, actorId: string, documentId: string, input: { expiry?: ShareExpiry; access?: ShareAccess }, now: Date): Promise<ChangeResult> {
  return db.transaction(async (tx): Promise<ChangeResult> => {
    const [live] = await tx
      .select()
      .from(shareLinks)
      .where(and(eq(shareLinks.documentId, documentId), isNull(shareLinks.revokedAt)))
      .for('update');
    if (!live) return { kind: 'no-link' };
    if (live.expiresAt !== null && live.expiresAt.getTime() <= now.getTime()) return { kind: 'expired' };
    const changes = {
      ...(input.expiry ? { expiry: input.expiry, expiresAt: expiresAtOf(input.expiry, now) } : {}),
      ...(input.access ? { access: input.access } : {}),
    };
    const [link] = await tx.update(shareLinks).set(changes).where(eq(shareLinks.id, live.id)).returning();
    if (!link) return { kind: 'no-link' };
    await tx.insert(shareLinkVisits).values({ shareLinkId: link.id, kind: 'changed', userId: actorId, detail: expiryDetail(input.expiry ?? '', input.access ?? ''), visitedAt: now });
    return { kind: 'ok', link };
  });
}

/** Revokes the document's live link for good; null when it has none. */
export async function revokeShareLink(db: Db, actorId: string, documentId: string, now: Date): Promise<ShareLinkRow | null> {
  return db.transaction(async (tx) => {
    const [link] = await tx
      .update(shareLinks)
      .set({ revokedAt: now })
      .where(and(eq(shareLinks.documentId, documentId), isNull(shareLinks.revokedAt)))
      .returning();
    if (!link) return null;
    await tx.insert(shareLinkVisits).values({ shareLinkId: link.id, kind: 'revoked', userId: actorId, visitedAt: now });
    return link;
  });
}

/**
 * Revokes every live link of a document, logged as done by `actorId`: the text left the published state. Called inside
 * the step's own transaction.
 */
export async function revokeAllLinks(tx: Db | Tx, documentId: string, actorId: string | null, now: Date): Promise<number> {
  const revoked = await tx
    .update(shareLinks)
    .set({ revokedAt: now })
    .where(and(eq(shareLinks.documentId, documentId), isNull(shareLinks.revokedAt)))
    .returning({ id: shareLinks.id });
  if (revoked.length > 0) await tx.insert(shareLinkVisits).values(revoked.map((r) => ({ shareLinkId: r.id, kind: 'revoked' as const, userId: actorId, visitedAt: now })));
  return revoked.length;
}

export type OpenResult =
  | { kind: 'ok'; link: ShareLinkRow; doc: DocumentRow }
  | { kind: 'not-found' }
  | { kind: 'off'; reason: 'expired' | 'revoked' }
  | { kind: 'private' };

/**
 * What a token opens, for this viewer, without logging it (the link preview of /l/<token> uses this: a crawler's
 * fetch is no opening). See the header for the answers.
 */
export async function resolveShareToken(db: Db, viewer: Viewer, token: string, now: Date): Promise<OpenResult> {
  if (!isShareTokenShape(token)) return { kind: 'not-found' };
  const [link] = await db.select().from(shareLinks).where(eq(shareLinks.tokenHash, hashOf(token)));
  if (!link) return { kind: 'not-found' };
  if (link.revokedAt !== null) return { kind: 'off', reason: 'revoked' };
  if (link.expiresAt !== null && link.expiresAt.getTime() <= now.getTime()) return { kind: 'off', reason: 'expired' };
  const doc = await liveDocument(db, link.documentId);
  if (!doc) return { kind: 'not-found' };
  if (!isPublic(doc) && !canRead(viewer, doc)) return { kind: 'private' };
  return { kind: 'ok', link, doc };
}

/**
 * `resolveShareToken`, logging the opening (the account, or null for a guest) when it opens; the text's author and
 * admins checking the link are no recipients and are not counted.
 */
export async function openShareLink(db: Db, viewer: Viewer, token: string, now: Date): Promise<OpenResult> {
  const result = await resolveShareToken(db, viewer, token, now);
  const owner = viewer.kind === 'user' && (viewer.isAdmin || (result.kind === 'ok' && result.doc.authorId === viewer.userId));
  if (result.kind === 'ok' && !owner) {
    await db.insert(shareLinkVisits).values({ shareLinkId: result.link.id, kind: 'opened', userId: viewer.kind === 'user' ? viewer.userId : null, visitedAt: now });
  }
  return result;
}

export interface HistoryLine {
  kind: 'opened' | 'created' | 'changed' | 'revoked' | 'approved' | 'published' | 'hidden' | 'shown';
  at: Date;
  /** Who: the account that opened or acted; null for a guest's opening (or an account since deleted). */
  byName: string | null;
  detail: string | null;
}

/**
 * The access history of a document's links (C18), newest first: openings and what was done to its links, with
 * its approval and an admin hiding or showing it. Never a token.
 */
export async function shareHistory(db: Db, viewer: Viewer, doc: DocumentRow, limit: number = HISTORY_LIMIT): Promise<HistoryLine[]> {
  const linkIds = (await db.select({ id: shareLinks.id }).from(shareLinks).where(eq(shareLinks.documentId, doc.id))).map((r) => r.id);
  const events =
    linkIds.length === 0
      ? []
      : await db
          .select({ kind: shareLinkVisits.kind, at: shareLinkVisits.visitedAt, byName: users.name, detail: shareLinkVisits.detail })
          .from(shareLinkVisits)
          .leftJoin(users, eq(users.id, shareLinkVisits.userId))
          .where(inArray(shareLinkVisits.shareLinkId, linkIds))
          .orderBy(desc(shareLinkVisits.visitedAt), desc(shareLinkVisits.id))
          .limit(limit);
  const audits = await db
    .select({ action: auditLog.action, at: auditLog.createdAt, byName: users.name })
    .from(auditLog)
    .leftJoin(users, eq(users.id, auditLog.actorId))
    .where(and(eq(auditLog.targetType, 'document'), eq(auditLog.targetId, doc.id), or(eq(auditLog.action, HIDE_ACTION), eq(auditLog.action, SHOW_ACTION))))
    .orderBy(desc(auditLog.createdAt))
    .limit(limit);
  const publications = await db
    .select({ at: reviewEvents.createdAt, byName: users.name })
    .from(reviewEvents)
    .leftJoin(users, eq(users.id, reviewEvents.actorId))
    .where(and(eq(reviewEvents.documentId, doc.id), eq(reviewEvents.action, 'published')))
    .orderBy(desc(reviewEvents.createdAt))
    .limit(limit);
  const approval = await findApproval(db, viewer, doc.id);
  const approver = approval ? (await db.select({ name: users.name }).from(users).where(eq(users.id, approval.actorId)))[0] : undefined;
  const lines: HistoryLine[] = [
    ...events.map((e) => ({ kind: e.kind, at: e.at, byName: e.byName, detail: e.detail })),
    ...audits.map((a): HistoryLine => ({ kind: a.action === HIDE_ACTION ? 'hidden' : 'shown', at: a.at, byName: a.byName, detail: null })),
    ...(approval ? [{ kind: 'approved' as const, at: approval.at, byName: approver?.name ?? null, detail: null }] : []),
    ...publications.map((p): HistoryLine => ({ kind: 'published', at: p.at, byName: p.byName, detail: null })),
  ];
  return lines.sort((a, b) => b.at.getTime() - a.at.getTime()).slice(0, limit);
}

/** Openings of a document's links since `since` (C18 "N lượt mở trong 7 ngày"). */
export async function openingsSince(db: Db, documentId: string, since: Date): Promise<number> {
  const [row] = await db
    .select({ n: count() })
    .from(shareLinkVisits)
    .innerJoin(shareLinks, eq(shareLinks.id, shareLinkVisits.shareLinkId))
    .where(and(eq(shareLinks.documentId, documentId), eq(shareLinkVisits.kind, 'opened'), gte(shareLinkVisits.visitedAt, since)));
  return row?.n ?? 0;
}

/** Forgets openings older than OPENED_KEEP_DAYS (the hourly housekeeping); how many. */
export async function pruneShareOpenings(db: Db, now: Date): Promise<number> {
  const rows = await db
    .delete(shareLinkVisits)
    .where(and(eq(shareLinkVisits.kind, 'opened'), lt(shareLinkVisits.visitedAt, new Date(now.getTime() - OPENED_KEEP_DAYS * DAY_MS))))
    .returning({ id: shareLinkVisits.id });
  return rows.length;
}
