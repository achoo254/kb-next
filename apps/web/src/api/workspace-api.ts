/**
 * Workspace settings (apps/server/src/api/workspace-routes.ts) as typed calls: members and their roles, the invite
 * link, the audit trail, sign-in and integrations (C19, admins only), accepting an invite (any account), and deleting
 * one's own data (H03, apps/server/src/api/me-routes.ts).
 *
 * Errors (ApiError.code): `sign-in-required` (401); `admin-only` (403); `not-found` (404); `locked` (409: a bootstrap
 * admin), `self` (409: your own account), `removed` (409: put the account back first); `invite-off` (410: revoked,
 * expired, or its admin no longer is one); `invalid-body` (400); `rate-limited` (429); `network` (offline).
 */
import * as z from 'zod/mini';
import { apiFetch, getJson } from './api-client';
import { WORKSPACE_ROLES, type WorkspaceRole } from './content-api';

const Time = z.iso.datetime({ offset: true });
const json = (method: string, body: unknown): RequestInit => ({ method, body: JSON.stringify(body) });
const path = (id: string): string => encodeURIComponent(id);

export const MemberSchema = z.object({
  id: z.string(),
  name: z.nullable(z.string()),
  email: z.nullable(z.string()),
  picture: z.nullable(z.string()),
  role: z.enum(WORKSPACE_ROLES),
  /** A bootstrap admin: its role and membership are not changed from the app. */
  bootstrap: z.boolean(),
  /** The account asking. */
  you: z.boolean(),
  lastSeenAt: z.nullable(Time),
  joinedAt: Time,
  /** Taken out of the workspace ("Gỡ"): it cannot sign in until put back. */
  removedAt: z.nullable(Time),
});
export type Member = z.infer<typeof MemberSchema>;

const MemberPageSchema = z.object({ members: z.array(MemberSchema), total: z.number() });
export type MemberPage = z.infer<typeof MemberPageSchema>;

/** The members C19 lists (at most a page: staff and the most recently active first) and how many there are in all. */
export function fetchMemberPage(): Promise<MemberPage> {
  return getJson(MemberPageSchema, '/api/workspace/members');
}

export function fetchMembers(): Promise<Member[]> {
  return fetchMemberPage().then((page) => page.members);
}

export function changeRole(id: string, role: WorkspaceRole): Promise<Member> {
  return getJson(MemberSchema, `/api/workspace/members/${path(id)}`, json('PATCH', { role }));
}

export function removeMember(id: string): Promise<Member> {
  return getJson(MemberSchema, `/api/workspace/members/${path(id)}/remove`, { method: 'POST' });
}

export function restoreMember(id: string): Promise<Member> {
  return getJson(MemberSchema, `/api/workspace/members/${path(id)}/restore`, { method: 'POST' });
}

/** An invite link lets members in: the only role it grants (the server reads older `reviewer` links as member). */
export const INVITE_ROLES = ['member'] as const;
export type InviteRole = (typeof INVITE_ROLES)[number];

export const InviteSchema = z.object({
  id: z.string(),
  last4: z.string(),
  role: z.enum(INVITE_ROLES),
  expiresAt: Time,
  acceptedCount: z.number(),
});
export type Invite = z.infer<typeof InviteSchema>;

/** The live invite link (without its token, which is shown once), or null. */
export function fetchInvite(): Promise<Invite | null> {
  return getJson(z.object({ invite: z.nullable(InviteSchema) }), '/api/workspace/invite').then((r) => r.invite);
}

const MadeInviteSchema = z.object({ token: z.string(), url: z.string(), invite: InviteSchema });
export type MadeInvite = z.infer<typeof MadeInviteSchema>;

/** Makes a new invite link (the live one is revoked); its token and URL are in this answer only. */
export function createInvite(): Promise<MadeInvite> {
  return getJson(MadeInviteSchema, '/api/workspace/invite', json('POST', { role: 'member' }));
}

export async function revokeInvite(id: string): Promise<void> {
  await apiFetch(`/api/workspace/invite/${path(id)}`, { method: 'DELETE' });
}

const InviteInfoSchema = z.object({ role: z.enum(INVITE_ROLES), expiresAt: Time });
export type InviteInfo = z.infer<typeof InviteInfoSchema>;

/** What an invite link grants, before accepting it. */
export function fetchInviteInfo(token: string): Promise<InviteInfo> {
  return getJson(InviteInfoSchema, `/api/invites/${path(token)}`);
}

const AcceptedSchema = z.object({ role: z.enum(INVITE_ROLES), raised: z.boolean() });
export type Accepted = z.infer<typeof AcceptedSchema>;

export function acceptInvite(token: string): Promise<Accepted> {
  return getJson(AcceptedSchema, '/api/invites/accept', json('POST', { token }));
}

export const AUDIT_CATEGORIES = ['members', 'content', 'api', 'sign-in'] as const;
export type AuditCategory = (typeof AUDIT_CATEGORIES)[number];

export const AuditLineSchema = z.object({
  id: z.string(),
  at: Time,
  category: z.enum(AUDIT_CATEGORIES),
  /** An audit action (`member.role-changed`…), `review.<decision>` or `api.<method>`. */
  action: z.string(),
  actor: z.nullable(z.object({ name: z.nullable(z.string()), picture: z.nullable(z.string()) })),
  subject: z.nullable(z.string()),
  detail: z.nullable(z.record(z.string(), z.union([z.string(), z.number(), z.boolean(), z.null()]))),
});
export type AuditLine = z.infer<typeof AuditLineSchema>;

export function fetchAudit(category: AuditCategory | null): Promise<AuditLine[]> {
  const query = category ? `?category=${category}` : '';
  return getJson(z.object({ lines: z.array(AuditLineSchema) }), `/api/workspace/audit${query}`).then((r) => r.lines);
}

export const SignInInfoSchema = z.object({
  issuer: z.string(),
  clientId: z.string(),
  enabled: z.boolean(),
  reachable: z.boolean(),
  checkedAt: Time,
  idleDays: z.number(),
  absoluteDays: z.number(),
});
export type SignInInfo = z.infer<typeof SignInInfoSchema>;

export function fetchSignInInfo(): Promise<SignInInfo> {
  return getJson(SignInInfoSchema, '/api/workspace/sign-in');
}

export const INTEGRATION_IDS = ['jev', 'files', 'search'] as const;
export type IntegrationId = (typeof INTEGRATION_IDS)[number];

export const IntegrationSchema = z.object({
  id: z.enum(INTEGRATION_IDS),
  state: z.enum(['ok', 'off', 'down']),
  facts: z.record(z.string(), z.nullable(z.union([z.number(), z.string()]))),
});
export type Integration = z.infer<typeof IntegrationSchema>;

export function fetchIntegrations(): Promise<Integration[]> {
  return getJson(z.object({ integrations: z.array(IntegrationSchema) }), '/api/workspace/integrations').then((r) => r.integrations);
}
