/**
 * The admin API, for publishing pipelines on other servers (A03; docs/admin-api.md). Authenticated by an admin token
 * (`Authorization: Bearer kf_admin_…`), never by the web session, so it sits ahead of the same-origin check: a call
 * from a server carries no Origin, and a browser cannot attach the header across sites without the token itself.
 * Limited to `adminApiLimitPerMinute` calls per minute per IP (429 `rate-limited`), wrong tokens included. Only calls
 * that authenticated are logged (A03 "Nhật ký gọi gần đây"), never with their token: a call without a valid token, or
 * past the limit, leaves no row (the daily housekeeping forgets rows older than 30 days).
 *
 * - POST /api/admin/posts `{title, lang, space?, collection?, tags?, markdown, type?, source?, hidden?}` → 201
 *   `{id, url, status: 'approved', hidden}`: an official text, published at once (no review). `collection` is a
 *   Collection's id or a public Space's slug; one of `space` / `collection` is required (400 `space-required`).
 * - PATCH /api/admin/posts/:id `{hidden?, title?, tags?, space?, collection?}` → `{id, title, status, hidden}`: a
 *   published text only (409 `not-approved` before any change), all of the patch or none of it.
 * - GET /api/admin/review → `{documents: ReviewQueueItem[]}`: the review queue with Jev's pre-review.
 * Errors: 401 `token-required` (no header), 401 `invalid-token` (malformed, unknown, revoked, or its admin is no
 * longer one), 400 `invalid-body`, 404 `not-found`, 409 `not-approved`.
 *
 * Token management is on the web session, admins only (A03): GET /api/moderation/tokens → `{tokens}`; POST
 * `{label}` → 201 `{token, info}` (the token is in this answer only; the live ones are revoked); DELETE /api/moderation/tokens/:id → 204 (404
 * when there is no such live token); GET /api/moderation/calls → `{calls}` (the latest 20).
 */
import express, { type ErrorRequestHandler, type Request, type RequestHandler, type Response, type Router } from 'express';
import { rateLimit } from 'express-rate-limit';
import { z } from 'zod';
import { createDocument } from '../access/authoring';
import { type AdminViewer, isAdminViewer, listReviewQueue } from '../access/review';
import { createToken, listTokens, logCall, recentCalls, revokeToken, useToken } from '../admin/admin-tokens';
import { MAX_BODY_CHARS, bodyOf } from '../authoring/markdown-text';
import { HttpError } from '../http-error';
import { safeErrorText } from '../log-error';
import { titleLine } from '../import/hoc-cloud/sections';
import { type ModerationDeps, cleanTags, queueItems, resolvePlacement, updatePost } from '../review/moderation';
import { perAccountLimit, signedIn } from './account-limit';
import { DOCUMENT_BODY_LIMIT } from './authoring-routes';
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
        if (!holder || !config.adminSubs.has(holder.sub)) return next(new HttpError(401, 'invalid-token'));
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
    const placement = await resolvePlacement(db, admin, body, true);
    if (!placement) throw new HttpError(400, 'space-required');
    // A text that opens with its own title line: the title is stored once.
    const heading = titleLine(body.markdown);
    const text = heading !== null && heading.replace(/^#\s+/, '').trim() === body.title ? bodyOf(body.markdown) : body.markdown;
    const created = await createDocument(
      db,
      admin,
      { spaceId: placement.spaceId, collectionId: placement.collectionId, title: body.title, body: text, type: body.type, lang: body.lang, planet: null },
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

  api.get('/review', async (_req, res) => {
    const admin = adminOf(res);
    res.set('Cache-Control', 'no-store').json({ documents: await queueItems(db, admin, await listReviewQueue(db, admin)) });
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
    const { token, info } = await createToken(db, viewer.userId, body.label, now());
    res.status(201).set('Cache-Control', 'no-store').json({ token, info: view(info) });
  });

  router.delete('/api/moderation/tokens/:id', auth, limit, async (req, res) => {
    await admin(req);
    const id = idParam(req);
    if (!z.uuid().safeParse(id).success || !(await revokeToken(db, id, now()))) throw new HttpError(404, 'not-found');
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
