/**
 * The workspace's audit trail as C19 "Nhật ký kiểm toán" lists it (admins only), newest first, from three records
 * that already exist: the audit log (members, invites, tokens, sign-ins, data deletion, hiding and showing a text),
 * the review decisions (review events) and the admin API's writes (its call log). Document titles are read here,
 * in src/access/, for an admin, who may read every document.
 */
import { and, desc, eq, inArray, lt, ne, sql } from 'drizzle-orm';
import { alias } from 'drizzle-orm/pg-core';
import type { Db } from '../db/client';
import { adminApiCalls, adminTokens, auditLog, documents, reviewEvents, users } from '../db/schema';
import { type AuditCategory, actionsOf, categoryOf } from '../workspace/audit';
import type { AdminViewer } from './review';

export type AuditDetail = Record<string, string | number | boolean | null>;

export interface AuditLine {
  id: string;
  at: Date;
  category: AuditCategory;
  /** An audit action, `review.<decision>` or `api.<method>`. */
  action: string;
  actor: { name: string | null; picture: string | null } | null;
  /** Who or what it was done to: an account's name, a document's title; null when neither. */
  subject: string | null;
  detail: AuditDetail | null;
}

export const AUDIT_LIMIT = 50;
const DECISIONS = ['approved', 'changes_requested', 'rejected'] as const;

function asDetail(value: unknown): AuditDetail | null {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return null;
  const out: AuditDetail = {};
  for (const [key, v] of Object.entries(value)) {
    if (typeof v === 'string' || typeof v === 'number' || typeof v === 'boolean' || v === null) out[key] = v;
  }
  return out;
}

async function logLines(db: Db, category: AuditCategory | null, limit: number): Promise<AuditLine[]> {
  const actor = alias(users, 'actor');
  const target = alias(users, 'target');
  const rows = await db
    .select({
      id: auditLog.id,
      at: auditLog.createdAt,
      action: auditLog.action,
      targetType: auditLog.targetType,
      detail: auditLog.detail,
      actorName: actor.name,
      actorPicture: actor.picture,
      actorKnown: actor.id,
      targetName: target.name,
      documentTitle: documents.title,
    })
    .from(auditLog)
    .leftJoin(actor, eq(actor.id, auditLog.actorId))
    .leftJoin(target, and(eq(auditLog.targetType, 'user'), eq(sql`${target.id}::text`, auditLog.targetId)))
    .leftJoin(documents, and(eq(auditLog.targetType, 'document'), eq(sql`${documents.id}::text`, auditLog.targetId)))
    .where(category ? inArray(auditLog.action, actionsOf(category)) : undefined)
    .orderBy(desc(auditLog.createdAt), desc(auditLog.id))
    .limit(limit);
  return rows.map((row) => ({
    id: row.id,
    at: row.at,
    category: categoryOf(row.action),
    action: row.action,
    actor: row.actorKnown ? { name: row.actorName, picture: row.actorPicture } : null,
    subject: row.targetType === 'document' ? row.documentTitle : row.targetType === 'user' ? row.targetName : null,
    detail: asDetail(row.detail),
  }));
}

async function reviewLines(db: Db, limit: number): Promise<AuditLine[]> {
  const rows = await db
    .select({ id: reviewEvents.id, at: reviewEvents.createdAt, action: reviewEvents.action, actorName: users.name, actorPicture: users.picture, actorKnown: users.id, title: documents.title })
    .from(reviewEvents)
    .innerJoin(documents, eq(documents.id, reviewEvents.documentId))
    .leftJoin(users, eq(users.id, reviewEvents.actorId))
    .where(inArray(reviewEvents.action, [...DECISIONS]))
    .orderBy(desc(reviewEvents.createdAt), desc(reviewEvents.id))
    .limit(limit);
  return rows.map((row) => ({
    id: row.id,
    at: row.at,
    category: 'content' as const,
    action: `review.${row.action}`,
    actor: row.actorKnown ? { name: row.actorName, picture: row.actorPicture } : null,
    subject: row.title,
    detail: null,
  }));
}

async function apiLines(db: Db, limit: number): Promise<AuditLine[]> {
  const rows = await db
    .select({
      id: adminApiCalls.id,
      at: adminApiCalls.createdAt,
      method: adminApiCalls.method,
      status: adminApiCalls.status,
      title: adminApiCalls.documentTitle,
      actorName: users.name,
      actorPicture: users.picture,
      actorKnown: users.id,
    })
    .from(adminApiCalls)
    .leftJoin(adminTokens, eq(adminTokens.id, adminApiCalls.tokenId))
    .leftJoin(users, eq(users.id, adminTokens.createdBy))
    .where(and(ne(adminApiCalls.method, 'GET'), lt(adminApiCalls.status, 400)))
    .orderBy(desc(adminApiCalls.createdAt), desc(adminApiCalls.id))
    .limit(limit);
  return rows.map((row) => ({
    id: row.id,
    at: row.at,
    category: 'api' as const,
    action: `api.${row.method.toLowerCase()}`,
    actor: row.actorKnown ? { name: row.actorName, picture: row.actorPicture } : null,
    subject: row.title,
    detail: { status: row.status },
  }));
}

/** The latest AUDIT_LIMIT lines, of one filter (C19's chips) or all. */
export async function listAuditTrail(db: Db, _admin: AdminViewer, category: AuditCategory | null, limit = AUDIT_LIMIT): Promise<AuditLine[]> {
  const sources = await Promise.all([
    logLines(db, category, limit),
    category === null || category === 'content' ? reviewLines(db, limit) : [],
    category === null || category === 'api' ? apiLines(db, limit) : [],
  ]);
  return sources
    .flat()
    .sort((a, b) => b.at.getTime() - a.at.getTime() || b.id.localeCompare(a.id))
    .slice(0, limit);
}
