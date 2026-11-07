/**
 * Workspace settings (C19), admins only (403 `admin-only`; 401 `sign-in-required` without a session), and accepting an
 * invite (any signed-in account).
 *
 * Members (src/access/workspace-members.ts):
 * - GET /api/workspace/members → `{members: MemberView[], total}`: at most MEMBERS_PAGE (staff and the most recently
 *   active first), `total` counting all.
 * - PATCH /api/workspace/members/:id `{role: 'member' | 'admin'}` → MemberView. 404 `not-found`, 409 `locked` (a bootstrap admin), 409
 *   `self` (your own account), 409 `removed` (put it back first).
 * - POST /api/workspace/members/:id/remove → MemberView: signs it out; its texts stay as they are.
 * - POST /api/workspace/members/:id/restore → MemberView.
 * Invite links (src/workspace/invites.ts):
 * - GET /api/workspace/invite → `{invite: InviteView | null}` (the live one, without its token).
 * - POST /api/workspace/invite `{role: 'member'}` → 201 `{token, url, invite}`: the token is in this answer only; the live link
 *   is revoked.
 * - DELETE /api/workspace/invite/:id → 204 (404 when there is no such live link).
 * - GET /api/invites/:token → `{role, expiresAt}`; POST /api/invites/accept `{token}` → `{role, raised}`. 404
 *   `not-found`, 410 `invite-off` (revoked, expired, or its admin no longer is one). Limited per address.
 * Read-only panels:
 * - GET /api/workspace/audit?category=members|content|api|sign-in → `{lines: AuditLineView[]}` (latest 50).
 * - GET /api/workspace/sign-in → SignInView: the IdP, this app's client and the session rules (nothing to change).
 * - GET /api/workspace/integrations → `{integrations: IntegrationView[]}`, each checked live (search health, the files
 *   directory); Jev is never called (it costs a request), only its use today is read.
 */
import { access, constants } from 'node:fs/promises';
import express, { type Request, type Router } from 'express';
import { rateLimit } from 'express-rate-limit';
import { eq } from 'drizzle-orm';
import { z } from 'zod';
import { listAuditTrail } from '../access/audit-trail';
import { type AdminViewer, isAdminViewer } from '../access/review';
import { WORKSPACE_ROLES, type WorkspaceRole } from '../access/roles';
import { type Member, listMembers, removeMember, restoreMember, setMemberRole } from '../access/workspace-members';
import { filesSummary } from '../access/workspace-status';
import type { IdpMetadata } from '../auth/idp-metadata';
import { SESSION_ABSOLUTE_MS, SESSION_IDLE_MS } from '../auth/session-store';
import { jevUsageDaily } from '../db/schema';
import { HttpError } from '../http-error';
import { saigonDay } from '../jev/jev-usage';
import type { JevJudge } from '../jev/jev-client';
import type { MeiliClient } from '../search/meili-client';
import { PUBLIC_INDEX } from '../search/search-indexes';
import { AUDIT_CATEGORIES } from '../workspace/audit';
import { INVITE_ROLES, type InviteInfo, acceptInvite, createInvite, findInvite, liveInvite, revokeInvite } from '../workspace/invites';
import { perAccountLimit, signedIn, userIdOf } from './account-limit';
import { type RequestContextDeps, readerOf } from './request-context';
import { idParam } from './review-routes';
import { parseBody, parseQuery } from './validate';

export interface MemberView {
  id: string;
  name: string | null;
  email: string | null;
  picture: string | null;
  role: WorkspaceRole;
  bootstrap: boolean;
  you: boolean;
  lastSeenAt: string | null;
  joinedAt: string;
  removedAt: string | null;
}

export interface InviteView {
  id: string;
  last4: string;
  role: (typeof INVITE_ROLES)[number];
  expiresAt: string;
  acceptedCount: number;
}

export type IntegrationId = 'jev' | 'files' | 'search';
export type IntegrationState = 'ok' | 'off' | 'down';

export interface IntegrationView {
  id: IntegrationId;
  state: IntegrationState;
  /** Numbers the card shows (documents, requests today, bytes…); absent when not known. */
  facts: Record<string, number | string | null>;
}

export interface SignInView {
  issuer: string;
  clientId: string;
  /** Sign-in is configured (AUTH_CLIENT_SECRET set). */
  enabled: boolean;
  /** The IdP's discovery answered just now. */
  reachable: boolean;
  checkedAt: string;
  idleDays: number;
  absoluteDays: number;
}

export interface WorkspaceRoutesOptions extends RequestContextDeps {
  idp: IdpMetadata | null;
  meili: MeiliClient | null;
  jev: JevJudge | null;
}

const RoleBody = z.strictObject({ role: z.enum(WORKSPACE_ROLES) });
const InviteBody = z.strictObject({ role: z.enum(INVITE_ROLES) });
const AcceptBody = z.strictObject({ token: z.string().min(1).max(64) });
const AuditQuery = z.object({ category: z.enum(AUDIT_CATEGORIES).optional() });
const CHECK_TIMEOUT_MS = 3_000;
const DAY_MS = 24 * 60 * 60 * 1000;

function inviteView(invite: InviteInfo): InviteView {
  return { id: invite.id, last4: invite.last4, role: invite.role, expiresAt: invite.expiresAt.toISOString(), acceptedCount: invite.acceptedCount };
}

/** The answer of a check within CHECK_TIMEOUT_MS; `fallback` when it fails or takes longer. */
async function within<T>(check: Promise<T>, fallback: T): Promise<T> {
  let timer: NodeJS.Timeout | undefined;
  const late = new Promise<T>((resolve) => {
    timer = setTimeout(() => resolve(fallback), CHECK_TIMEOUT_MS);
  });
  try {
    return await Promise.race([check.catch(() => fallback), late]);
  } finally {
    clearTimeout(timer);
  }
}

export function workspaceRoutes({ config, db, now, idp, meili, jev }: WorkspaceRoutesOptions): Router {
  const router = express.Router();
  const auth = signedIn(config, db, now);
  const limit = perAccountLimit(60);
  // Opening and accepting invites: a guess at a token costs a request, few per minute from one address.
  const inviteLimit = rateLimit({ windowMs: 60 * 1000, limit: 20, standardHeaders: 'draft-8', legacyHeaders: false, message: { error: 'rate-limited' } });

  const admin = async (req: Request): Promise<AdminViewer> => {
    const { viewer } = await readerOf(req, { config, db, now });
    if (viewer.kind !== 'user') throw new HttpError(401, 'sign-in-required');
    if (!isAdminViewer(viewer)) throw new HttpError(403, 'admin-only');
    return viewer;
  };
  const memberView = (m: Member, viewerId: string): MemberView => ({
    id: m.id,
    name: m.name,
    email: m.email,
    picture: m.picture,
    role: m.role,
    bootstrap: m.bootstrap,
    you: m.id === viewerId,
    lastSeenAt: m.lastSeenAt?.toISOString() ?? null,
    joinedAt: m.joinedAt.toISOString(),
    removedAt: m.removedAt?.toISOString() ?? null,
  });
  const refuse = (kind: 'not-found' | 'locked' | 'self' | 'removed'): never => {
    if (kind === 'not-found') throw new HttpError(404, 'not-found');
    throw new HttpError(409, kind);
  };

  router.get('/api/workspace/members', auth, limit, async (req, res) => {
    const viewer = await admin(req);
    const { members, total } = await listMembers(db, config.adminSubs);
    res.set('Cache-Control', 'no-store').json({ members: members.map((m) => memberView(m, viewer.userId)), total });
  });

  router.patch('/api/workspace/members/:id', auth, limit, async (req, res) => {
    const viewer = await admin(req);
    const body = parseBody(RoleBody, req.body);
    const result = await setMemberRole(db, config.adminSubs, viewer.userId, idParam(req), body.role, now());
    if (result.kind !== 'ok') return refuse(result.kind);
    res.json(memberView(result.member, viewer.userId));
  });

  router.post('/api/workspace/members/:id/remove', auth, limit, async (req, res) => {
    const viewer = await admin(req);
    const result = await removeMember(db, config.adminSubs, viewer.userId, idParam(req), now());
    if (result.kind !== 'ok') return refuse(result.kind);
    res.json(memberView(result.member, viewer.userId));
  });

  router.post('/api/workspace/members/:id/restore', auth, limit, async (req, res) => {
    const viewer = await admin(req);
    const result = await restoreMember(db, config.adminSubs, viewer.userId, idParam(req), now());
    if (result.kind !== 'ok') return refuse(result.kind);
    res.json(memberView(result.member, viewer.userId));
  });

  router.get('/api/workspace/invite', auth, limit, async (req, res) => {
    await admin(req);
    const invite = await liveInvite(db, now());
    res.set('Cache-Control', 'no-store').json({ invite: invite ? inviteView(invite) : null });
  });

  router.post('/api/workspace/invite', auth, limit, async (req, res) => {
    const viewer = await admin(req);
    const body = parseBody(InviteBody, req.body);
    const { token, invite } = await createInvite(db, viewer.userId, body.role, now());
    res.status(201).set('Cache-Control', 'no-store').json({ token, url: `${config.publicOrigin}/i/${token}`, invite: inviteView(invite) });
  });

  router.delete('/api/workspace/invite/:id', auth, limit, async (req, res) => {
    const viewer = await admin(req);
    const id = idParam(req);
    if (!z.uuid().safeParse(id).success || !(await revokeInvite(db, viewer.userId, id, now()))) throw new HttpError(404, 'not-found');
    res.status(204).end();
  });

  router.get('/api/invites/:token', inviteLimit, auth, async (req, res) => {
    const found = await findInvite(db, config.adminSubs, typeof req.params.token === 'string' ? req.params.token : '', now());
    if (found.kind === 'not-found') throw new HttpError(404, 'not-found');
    if (found.kind === 'off') throw new HttpError(410, 'invite-off');
    res.set('Cache-Control', 'no-store').json({ role: found.role, expiresAt: found.expiresAt.toISOString() });
  });

  router.post('/api/invites/accept', inviteLimit, auth, async (req, res) => {
    const { viewer } = await readerOf(req, { config, db, now });
    // A removed account has no live session; an account that reads as a guest here may not accept either.
    if (viewer.kind !== 'user') throw new HttpError(401, 'sign-in-required');
    const body = parseBody(AcceptBody, req.body);
    const result = await acceptInvite(db, config.adminSubs, body.token, userIdOf(res), now());
    if (result.kind === 'not-found') throw new HttpError(404, 'not-found');
    if (result.kind === 'off') throw new HttpError(410, 'invite-off');
    res.set('Cache-Control', 'no-store').json({ role: result.role, raised: result.raised });
  });

  router.get('/api/workspace/audit', auth, limit, async (req, res) => {
    const viewer = await admin(req);
    const { category } = parseQuery(AuditQuery, req.query);
    const lines = await listAuditTrail(db, viewer, category ?? null);
    res.set('Cache-Control', 'no-store').json({
      lines: lines.map((line) => ({ ...line, at: line.at.toISOString() })),
    });
  });

  router.get('/api/workspace/sign-in', auth, limit, async (req, res) => {
    await admin(req);
    const reachable = idp ? await within(idp.discover().then(() => true), false) : false;
    const view: SignInView = {
      issuer: config.auth?.issuer ?? '',
      clientId: config.auth?.clientId ?? '',
      enabled: config.auth !== null,
      reachable,
      checkedAt: now().toISOString(),
      idleDays: Math.round(SESSION_IDLE_MS / DAY_MS),
      absoluteDays: Math.round(SESSION_ABSOLUTE_MS / DAY_MS),
    };
    res.set('Cache-Control', 'no-store').json(view);
  });

  router.get('/api/workspace/integrations', auth, limit, async (req, res) => {
    const viewer = await admin(req);
    const [stored, filesOk, searchOk, searchCount, jevToday] = await Promise.all([
      filesSummary(db, viewer),
      within(
        access(config.filesDir, constants.R_OK | constants.W_OK).then(() => true),
        false,
      ),
      meili ? within(meili.isHealthy(), false) : Promise.resolve(false),
      meili ? within<number | null>(meili.countDocuments(meili.uid(PUBLIC_INDEX)), null) : Promise.resolve(null),
      db
        .select({ calls: jevUsageDaily.calls })
        .from(jevUsageDaily)
        .where(eq(jevUsageDaily.day, saigonDay(now())))
        .then((rows) => rows.reduce((total, row) => total + row.calls, 0)),
    ]);
    const integrations: IntegrationView[] = [
      { id: 'jev', state: jev ? 'ok' : 'off', facts: { requestsToday: jevToday } },
      { id: 'files', state: filesOk ? 'ok' : 'down', facts: { files: stored.files, bytes: stored.bytes } },
      { id: 'search', state: meili ? (searchOk ? 'ok' : 'down') : 'off', facts: { documents: searchCount } },
    ];
    res.set('Cache-Control', 'no-store').json({ integrations });
  });

  return router;
}
