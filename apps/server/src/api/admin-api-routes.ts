/**
 * The admin API, for publishing pipelines on other servers (A03; docs/admin-api.md). Authenticated by an admin token
 * (`Authorization: Bearer kf_admin_…`), never by the web session, so it sits ahead of the same-origin check: a call
 * from a server carries no Origin, and a browser cannot attach the header across sites without the token itself.
 * Limited to `adminApiLimitPerMinute` calls per minute per IP (429 `rate-limited`), wrong tokens included. Only calls
 * that authenticated are logged (A03 "Nhật ký gọi gần đây"), never with their token: a call without a valid token, or
 * past the limit, leaves no row (the daily housekeeping forgets rows older than 30 days).
 *
 * - POST /api/admin/posts `{title, lang, space?, collection?, tags?, markdown, type?, source?, hidden?}` → 201
 *   `{id, url, status: 'approved', hidden}`: an official text, published at once. `collection` is a
 *   Collection's id or a public Space's slug; one of `space` / `collection` is required (400 `space-required`).
 * - PATCH /api/admin/posts/:id `{hidden?, title?, tags?, space?, collection?}` → `{id, title, status, hidden}`: a
 *   published text only (409 `not-approved` before any change), all of the patch or none of it.
 * - GET /api/admin/posts/:id → `{id, title, lang, type, status, hidden, version, rev, body}`: a text's latest version.
 * - PUT /api/admin/posts/:id/text `{title?, body, summary?, baseRev?, source?}` → `{id, version, rev, changed}`: a new
 *   version of the text (never merged into an editor's), 409 `stale` when it changed since `baseRev`; a file (Office) or
 *   a journey is 409 `not-editable` / `journey`.
 * - POST /api/admin/spaces `{slug, nameVi, nameEn, tint, glow, art, unitVi, unitEn, descriptionVi?, descriptionEn?}` → 201
 *   `{slug}`: a new public Space (as POST /api/spaces on the web session), 409 `slug-taken` when the slug exists.
 * - POST /api/admin/collections `{space, nameVi, nameEn?}` → 201 `{id, space}`: a new Collection (planet) in a public
 *   Space (as POST /api/collections on the web session); 404 `not-found` for an unknown Space.
 * `translationOf` (a published text's id) on a post makes it another language of that text: same group, Space and
 *   Collection (409 `translation-exists` when the group has that language).
 * Errors: 401 `token-required` (no header), 401 `invalid-token` (malformed, unknown, revoked, or its admin is no
 * longer one or left the workspace), 400 `invalid-body`, 404 `not-found`, 409 `not-approved`.
 *
 * Token management is on the web session, admins only (A03): GET /api/moderation/tokens → `{tokens}`; POST
 * `{label}` → 201 `{token, info}` (the token is in this answer only; the live ones are revoked); DELETE /api/moderation/tokens/:id → 204 (404
 * when there is no such live token); GET /api/moderation/calls → `{calls}` (the latest 20). Making and revoking a token
 * are written to the audit log (C19).
 */
import express, { type ErrorRequestHandler, type Request, type RequestHandler, type Response, type Router } from 'express';
import { rateLimit } from 'express-rate-limit';
import { z } from 'zod';
import { createDocument, editAccess, saveDocument, translationSource } from '../access/authoring';
import { createCollection, createPublicSpace, spaceForWriting } from '../access/spaces-write';
import { type AdminViewer, isAdminViewer } from '../access/review';
import { effectiveRole } from '../access/roles';
import { createToken, listTokens, logCall, recentCalls, revokeToken, useToken } from '../admin/admin-tokens';
import { MAX_BODY_CHARS, bodyOf } from '../authoring/markdown-text';
import { HttpError } from '../http-error';
import { safeErrorText } from '../log-error';
import { AUDIT_ACTIONS, recordAudit } from '../workspace/audit';
import { titleLine } from '../markdown/sections';
import { type ModerationDeps, cleanTags, resolvePlacement, updatePost } from '../review/moderation';
import { perAccountLimit, signedIn } from './account-limit';
import { CollectionBody, DOCUMENT_BODY_LIMIT, PublicSpaceBody, refuse } from './authoring-routes';
import { type RequestContextDeps, readerOf } from './request-context';
import { PostPatchBody, PostTitle, Tags, idParam } from './review-routes';
import { parseBody } from './validate';

const Slug = z.string().regex(/^[a-z0-9][a-z0-9-]{0,119}$/);

const PostBody = z.strictObject({
  title: PostTitle,
  lang: z.enum(['vi', 'en']),
  space: Slug.optional(),
  collection: z.union([z.uuid(), Slug]).optional(),
  tags: Tags.optional(),
  markdown: z.string().max(MAX_BODY_CHARS).refine((text) => text.trim().length > 0),
  type: z.enum(['note', 'lab', 'process']).optional().default('note'),
  /** `ai`: written by AI (its version is marked so); `human` otherwise. */
  source: z.enum(['ai', 'human']).optional().default('human'),
  hidden: z.boolean().optional().default(false),
  /**
   * The id of a published text this one is another language of: it joins that text's group and goes to the same Space
   * and Collection (so `space` / `collection` are not needed, and are ignored when sent).
   */
  translationOf: z.uuid().optional(),
});

/** A new text for a published post: a version of its own, with what changed in `summary` (shown in its history). */
const TextBody = z.strictObject({
  title: PostTitle.optional(),
  body: z.string().max(MAX_BODY_CHARS).refine((text) => text.trim().length > 0),
  summary: z.string().trim().min(1).max(200).optional(),
  /** The `rev` the caller read: another save since then answers 409 `stale`. */
  baseRev: z.iso.datetime({ offset: true }).optional(),
  source: z.enum(['ai', 'human']).optional().default('human'),
});

const TokenBody = z.strictObject({ label: z.string().trim().min(1).max(80) });

/** What the call log keeps of one call, filled in as the request goes. */
interface CallRecord {
  tokenId: string | null;
  documentId: string | null;
  documentTitle: string | null;
  error: string | null;
}

/** The call record and the admin of each request in flight (a request's own state, gone with it). */
const calls = new WeakMap<Response, CallRecord>();
const admins = new WeakMap<Response, AdminViewer>();

function callOf(res: Response): CallRecord {
  const known = calls.get(res);
  if (known) return known;
  const fresh: CallRecord = { tokenId: null, documentId: null, documentTitle: null, error: null };
  calls.set(res, fresh);
  return fresh;
}

function adminOf(res: Response): AdminViewer {
  const admin = admins.get(res);
  if (!admin) throw new HttpError(401, 'invalid-token');
  return admin;
}

export function adminApiRoutes(deps: ModerationDeps): Router {
  const { config, db, now } = deps;
  const api = express.Router();

  // Calls past the limit, or without a valid token, are not logged: a flood never fills the log.
  api.use(
    rateLimit({
      windowMs: 60 * 1000,
      limit: config.adminApiLimitPerMinute,
      standardHeaders: 'draft-8',
      legacyHeaders: false,
      message: { error: 'rate-limited' },
    }),
  );

  /**
   * Logs the call once answered, when it authenticated (runs after `authenticate`). The path is taken now: by the time
   * an error is answered, Express has put the full URL back on the request.
   */
  const log: RequestHandler = (req, res, next) => {
    const call = callOf(res);
    const path = `${req.baseUrl}${req.path}`.slice(0, 200);
    res.on('finish', () => {
      if (call.tokenId === null) return;
      logCall(db, { ...call, method: req.method, path, status: res.statusCode }, now()).catch((error: unknown) => console.error('admin call log failed', safeErrorText(error)));
    });
    next();
  };

  const authenticate: RequestHandler = (req, res, next) => {
    const header = req.headers.authorization;
    res.set('WWW-Authenticate', 'Bearer');
    if (!header) return next(new HttpError(401, 'token-required'));
    const match = /^Bearer\s+(\S+)\s*$/i.exec(header);
    if (!match?.[1]) return next(new HttpError(401, 'invalid-token'));
    useToken(db, match[1], now()).then(
      (holder) => {
        if (!holder || holder.gone || effectiveRole(config.adminSubs, holder) !== 'admin') return next(new HttpError(401, 'invalid-token'));
        callOf(res).tokenId = holder.tokenId;
        res.removeHeader('WWW-Authenticate');
        admins.set(res, { kind: 'user', userId: holder.userId, isAdmin: true });
        next();
      },
      (error: unknown) => next(error),
    );
  };

  api.use(authenticate, log, express.json({ limit: DOCUMENT_BODY_LIMIT }));

  api.post('/posts', async (req, res) => {
    const admin = adminOf(res);
    const body = parseBody(PostBody, req.body);
    const original = body.translationOf ? await translationSource(db, body.translationOf, body.lang) : null;
    const placement = original ? { spaceId: original.spaceId, collectionId: original.collectionId } : await resolvePlacement(db, admin, body, true);
    if (!placement) throw new HttpError(400, 'space-required');
    // A text that opens with its own title line: the title is stored once.
    const heading = titleLine(body.markdown);
    const text = heading !== null && heading.replace(/^#\s+/, '').trim() === body.title ? bodyOf(body.markdown) : body.markdown;
    const created = await createDocument(
      db,
      admin,
      { spaceId: placement.spaceId, collectionId: placement.collectionId, title: body.title, body: text, type: body.type, lang: body.lang, planet: null, translation: original ? { groupId: original.translationGroupId ?? original.id, aiTranslated: body.source === 'ai' } : undefined },
      now(),
      { hidden: body.hidden, tags: cleanTags(body.tags) ?? [], aiMade: body.source === 'ai' },
    );
    deps.sync?.enqueue([created.id]);
    Object.assign(callOf(res), { documentId: created.id, documentTitle: body.title });
    res.status(201).json({ id: created.id, url: `${config.publicOrigin}/d/${created.id}`, status: 'approved', hidden: body.hidden });
  });

  api.patch('/posts/:id', async (req, res) => {
    const admin = adminOf(res);
    const body = parseBody(PostPatchBody, req.body);
    const doc = await updatePost(deps, admin, idParam(req), body);
    Object.assign(callOf(res), { documentId: doc.id, documentTitle: doc.title });
    res.json({ id: doc.id, title: doc.title, status: doc.status, hidden: doc.hidden });
  });

  api.get('/posts/:id', async (req, res) => {
    const access = await editAccess(db, adminOf(res), idParam(req));
    if (access.kind !== 'ok') refuse(access);
    const { doc, latest } = access;
    Object.assign(callOf(res), { documentId: doc.id, documentTitle: doc.title });
    res.set('Cache-Control', 'no-store').json({
      id: doc.id,
      title: doc.title,
      lang: doc.lang,
      type: doc.type,
      status: doc.status,
      hidden: doc.hidden,
      version: latest.version,
      rev: doc.updatedAt.toISOString(),
      body: bodyOf(latest.markdown),
    });
  });

  api.put('/posts/:id/text', async (req, res) => {
    const admin = adminOf(res);
    const id = idParam(req);
    const body = parseBody(TextBody, req.body);
    const access = await editAccess(db, admin, id);
    if (access.kind !== 'ok') refuse(access);
    const title = body.title ?? access.doc.title;
    Object.assign(callOf(res), { documentId: id, documentTitle: title });
    const saved = await saveDocument(
      db,
      admin,
      id,
      { title, body: body.body, summary: body.summary ?? null, baseRev: body.baseRev ? new Date(body.baseRev) : undefined, aiMade: body.source === 'ai', editor: 'text', fromApi: true },
      now(),
    );
    if (saved.kind === 'stale') {
      res.status(409).json({ error: 'stale', rev: saved.rev.toISOString() });
      return;
    }
    if (saved.kind !== 'saved') refuse(saved);
    if (saved.changed) deps.sync?.enqueue([id]);
    res.json({ id, version: saved.version, rev: saved.rev.toISOString(), changed: saved.changed });
  });

  api.post('/spaces', async (req, res) => {
    const body = parseBody(PublicSpaceBody, req.body);
    const space = await createPublicSpace(db, { ...body, descriptionVi: body.descriptionVi ?? null, descriptionEn: body.descriptionEn ?? null });
    if (!space) throw new HttpError(409, 'slug-taken');
    res.status(201).json({ slug: space.slug });
  });

  api.post('/collections', async (req, res) => {
    const body = parseBody(CollectionBody, req.body);
    const access = await spaceForWriting(db, adminOf(res), body.space);
    if (access.kind !== 'ok' || access.space.kind !== 'public') throw new HttpError(404, 'not-found');
    const collection = await createCollection(db, access.space, { nameVi: body.nameVi, nameEn: body.nameEn ?? body.nameVi });
    res.status(201).json({ id: collection.id, space: access.space.slug });
  });

  api.use((_req, _res, next) => next(new HttpError(404, 'not-found')));

  // The error's code goes to the call log; the app's error handler answers.
  const noteError: ErrorRequestHandler = (err: unknown, _req, res, next) => {
    const call = callOf(res);
    if (err instanceof HttpError) call.error = err.code;
    else if (typeof err === 'object' && err !== null && 'type' in err && (err.type === 'entity.parse.failed' || err.type === 'entity.too.large')) call.error = 'invalid-body';
    else call.error = 'internal';
    next(err);
  };
  api.use(noteError);

  const router = express.Router();
  router.use('/api/admin', api);
  return router;
}

export interface TokenView {
  id: string;
  label: string;
  last4: string;
  createdAt: string;
  lastUsedAt: string | null;
  revokedAt: string | null;
  createdByName: string | null;
}

export interface CallView {
  id: string;
  method: string;
  path: string;
  status: number;
  error: string | null;
  document: { id: string; title: string } | null;
  at: string;
}

/** A03 on the web session: the tokens, making and revoking one, and the latest calls. */
export function adminTokenRoutes({ config, db, now }: RequestContextDeps): Router {
  const router = express.Router();
  const auth = signedIn(config, db, now);
  const limit = perAccountLimit(30);
  const admin = async (req: Request): Promise<AdminViewer> => {
    const { viewer } = await readerOf(req, { config, db, now });
    if (viewer.kind !== 'user') throw new HttpError(401, 'sign-in-required');
    if (!isAdminViewer(viewer)) throw new HttpError(403, 'admin-only');
    return viewer;
  };
  const view = (t: Awaited<ReturnType<typeof listTokens>>[number]): TokenView => ({
    id: t.id,
    label: t.label,
    last4: t.last4,
    createdAt: t.createdAt.toISOString(),
    lastUsedAt: t.lastUsedAt?.toISOString() ?? null,
    revokedAt: t.revokedAt?.toISOString() ?? null,
    createdByName: t.createdByName,
  });

  router.get('/api/moderation/tokens', auth, async (req, res) => {
    await admin(req);
    res.set('Cache-Control', 'no-store').json({ tokens: (await listTokens(db)).map(view) });
  });

  router.post('/api/moderation/tokens', auth, limit, async (req, res) => {
    const viewer = await admin(req);
    const body = parseBody(TokenBody, req.body);
    const at = now();
    const { token, info } = await createToken(db, viewer.userId, body.label, at);
    await recordAudit(db, { actorId: viewer.userId, action: AUDIT_ACTIONS.tokenCreated, targetType: 'token', targetId: info.id }, at);
    res.status(201).set('Cache-Control', 'no-store').json({ token, info: view(info) });
  });

  router.delete('/api/moderation/tokens/:id', auth, limit, async (req, res) => {
    const viewer = await admin(req);
    const id = idParam(req);
    const at = now();
    if (!z.uuid().safeParse(id).success || !(await revokeToken(db, id, at))) throw new HttpError(404, 'not-found');
    await recordAudit(db, { actorId: viewer.userId, action: AUDIT_ACTIONS.tokenRevoked, targetType: 'token', targetId: id }, at);
    res.status(204).end();
  });

  router.get('/api/moderation/calls', auth, async (req, res) => {
    await admin(req);
    const calls: CallView[] = (await recentCalls(db)).map((c) => ({
      id: c.id,
      method: c.method,
      path: c.path,
      status: c.status,
      error: c.error,
      document: c.documentId && c.documentTitle ? { id: c.documentId, title: c.documentTitle } : null,
      at: c.createdAt.toISOString(),
    }));
    res.set('Cache-Control', 'no-store').json({ calls });
  });

  return router;
}
