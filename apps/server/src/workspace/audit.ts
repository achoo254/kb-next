/**
 * The workspace's audit actions (C19 "Nhật ký kiểm toán") and how one is written. Each action belongs to one filter
 * of the log: members (roles, invites, removal, data deletion), content (hiding and showing a text; review decisions
 * come from the review events), API (tokens; the token's calls come from the admin API call log) and sign-in.
 * `detail` holds only what the line says (a role, a count): never a token, an email or document text.
 */
import type { Db } from '../db/client';
import { auditLog } from '../db/schema';
import { HIDE_ACTION, SHOW_ACTION } from '../access/history';

export const AUDIT_ACTIONS = {
  roleChanged: 'member.role-changed',
  memberRemoved: 'member.removed',
  memberRestored: 'member.restored',
  inviteCreated: 'invite.created',
  inviteRevoked: 'invite.revoked',
  inviteAccepted: 'invite.accepted',
  dataDeleted: 'account.data-deleted',
  signedIn: 'account.signed-in',
  tokenCreated: 'token.created',
  tokenRevoked: 'token.revoked',
} as const;

export const AUDIT_CATEGORIES = ['members', 'content', 'api', 'sign-in'] as const;
export type AuditCategory = (typeof AUDIT_CATEGORIES)[number];

const CATEGORY_OF: Record<string, AuditCategory> = {
  [AUDIT_ACTIONS.roleChanged]: 'members',
  [AUDIT_ACTIONS.memberRemoved]: 'members',
  [AUDIT_ACTIONS.memberRestored]: 'members',
  [AUDIT_ACTIONS.inviteCreated]: 'members',
  [AUDIT_ACTIONS.inviteRevoked]: 'members',
  [AUDIT_ACTIONS.inviteAccepted]: 'members',
  [AUDIT_ACTIONS.dataDeleted]: 'members',
  [AUDIT_ACTIONS.signedIn]: 'sign-in',
  [AUDIT_ACTIONS.tokenCreated]: 'api',
  [AUDIT_ACTIONS.tokenRevoked]: 'api',
  [HIDE_ACTION]: 'content',
  [SHOW_ACTION]: 'content',
};

/** The filter an action shows under; an unknown action (an older line) shows under members. */
export function categoryOf(action: string): AuditCategory {
  return CATEGORY_OF[action] ?? 'members';
}

/** The actions of a filter. */
export function actionsOf(category: AuditCategory): string[] {
  return Object.entries(CATEGORY_OF)
    .filter(([, c]) => c === category)
    .map(([action]) => action);
}

type Tx = Parameters<Parameters<Db['transaction']>[0]>[0];

export interface AuditEntry {
  actorId: string | null;
  action: (typeof AUDIT_ACTIONS)[keyof typeof AUDIT_ACTIONS];
  targetType: 'user' | 'invite' | 'token';
  targetId: string | null;
  detail?: Record<string, string | number | boolean | null>;
}

/** Writes one audit line, in the caller's transaction when given one. */
export async function recordAudit(db: Db | Tx, entry: AuditEntry, now: Date): Promise<void> {
  await db.insert(auditLog).values({ ...entry, detail: entry.detail ?? null, createdAt: now });
}
