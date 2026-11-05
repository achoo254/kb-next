/**
 * The review lifecycle on the web session (src/access/review.ts, src/review/moderation.ts). Every route needs a
 * session (401 `sign-in-required`); the /api/moderation routes need an admin (403 `admin-only`).
 *
 * Author (C06, C08, C04):
 * - POST /api/documents/:id/submit `{space?, collection?, tags?}` → SubmitResponse: sends a draft, a private text or
 *   one sent back for review (optionally placed and tagged first). 400 `title-required` / `body-required`, 409
 *   `already-pending` / `not-submittable`, 404 / 403 like the reader. Jev's pre-review runs before the answer (its
 *   scores are for admins only); without Jev the submission stands all the same.
 * - POST /api/documents/:id/withdraw → `{status: 'draft'}`: out of the queue, the admins' unread notices of it too.
 *   409 `not-pending`.
 *
 * Admins (A01, A02):
 * - GET /api/moderation/queue → `{documents: ReviewQueueItem[]}`.
 * - POST /api/moderation/documents/:id/decision `{decision, reason?}` → `{id, status, origin}`; `reason` (1–1000
 *   characters) is required to request changes or reject. 409 `not-pending`.
 * - GET /api/moderation/published?origin=&visibility=&q= → `{documents: PublishedItem[]}`.
 * - PATCH /api/moderation/documents/:id `{hidden?, title?, tags?, space?, collection?}` → PublishedItem (its `opens`
 *   and `aiMade` are not recomputed: the list keeps what it had). Published texts only, all or nothing: 409
 *   `not-approved` for any other, before any change.
 * Removing a text for good is DELETE /api/documents/:id (an admin may trash any document).
 */
import express, { type Request, type Router } from 'express';
import { rateLimit } from 'express-rate-limit';
import { z } from 'zod';
import { type AdminViewer, REVIEW_DECISIONS, isAdminViewer, listPublished, listReviewQueue } from '../access/review';
import type { Viewer } from '../access/viewer';
import { MAX_TITLE_CHARS } from '../authoring/markdown-text';
import { HttpError } from '../http-error';
import type { JevJudge } from '../jev/jev-client';
import type { IndexSync } from '../search/index-sync';
import type { MeiliClient } from '../search/meili-client';
import { type ModerationDeps, cleanTags, decide, publishedItems, queueItems, resolvePlacement, submitText, updatePost, withdrawText } from '../review/moderation';
import { perAccountLimit, signedIn, userIdOf } from './account-limit';
import { type RequestContextDeps, readerOf } from './request-context';
import { parseBody, parseQuery } from './validate';

export const MAX_REASON_CHARS = 1000;
export const Tag = z.string().trim().min(1).max(60);
export const Tags = z.array(Tag).max(20);
const Slug = z.string().regex(/^[a-z0-9][a-z0-9-]{0,119}$/);
/** A Collection's id, or (the admin API's sample) a Space's slug. */
const CollectionRef = z.union([z.uuid(), Slug]);
export const PostTitle = z
  .string()
  .trim()
  .min(1)
  .max(MAX_TITLE_CHARS)
  .refine((title) => !/[\r\n]/.test(title));

const SubmitBody = z.strictObject({ space: Slug.optional(), collection: z.uuid().optional(), tags: Tags.optional() });

const DecisionBody = z
  .strictObject({ decision: z.enum(REVIEW_DECISIONS), reason: z.string().trim().min(1).max(MAX_REASON_CHARS).optional() })
  .refine((body) => body.decision === 'approved' || body.reason !== undefined, { message: 'reason required' });

export const PostPatchBody = z
  .strictObject({ hidden: z.boolean().optional(), title: PostTitle.optional(), tags: Tags.optional(), space: Slug.optional(), collection: CollectionRef.optional() })
  .refine((body) => Object.keys(body).length > 0, { message: 'nothing to change' });

const PublishedQuery = z.object({
  origin: z.enum(['official', 'community']).optional(),
  visibility: z.enum(['visible', 'hidden']).optional(),
  q: z.string().max(120).optional(),
});

export interface ReviewRoutesOptions extends RequestContextDeps {
  sync: IndexSync | null;
  jev: JevJudge | null;
  meili: MeiliClient | null;
}

type UserViewer = Extract<Viewer, { kind: 'user' }>;

export function idParam(req: Request): string {
  const id = req.params.id;
  return typeof id === 'string' ? id : '';
}

export function reviewRoutes({ config, db, now, sync, jev, meili }: ReviewRoutesOptions): Router {
  const router = express.Router();
  const deps: ModerationDeps = { config, db, now, sync, jev, meili };
  const auth = signedIn(config, db, now);
  // Each submission costs a Jev call and tells every admin: few per account, over ten minutes.
  const submitLimit = rateLimit({
    windowMs: 10 * 60 * 1000,
    limit: config.submitLimitPer10Min,
    standardHeaders: 'draft-8',
    legacyHeaders: false,
    message: { error: 'rate-limited' },
    keyGenerator: (_req, res) => `submit:${userIdOf(res)}`,
  });
  const withdrawLimit = perAccountLimit(10);
  const adminLimit = perAccountLimit(120);
  const user = async (req: Request): Promise<UserViewer> => {
    const { viewer } = await readerOf(req, { config, db, now });
    if (viewer.kind !== 'user') throw new HttpError(401, 'sign-in-required');
    return viewer;
  };
  const admin = async (req: Request): Promise<AdminViewer> => {
    const viewer = await user(req);
    if (!isAdminViewer(viewer)) throw new HttpError(403, 'admin-only');
    return viewer;
  };

  router.post('/api/documents/:id/submit', auth, submitLimit, async (req, res) => {
    const viewer = await user(req);
    const body = parseBody(SubmitBody, req.body ?? {});
    const placement = await resolvePlacement(db, viewer, body, false);
    res.json(await submitText(deps, viewer, idParam(req), { placement, tags: cleanTags(body.tags) }));
  });

  router.post('/api/documents/:id/withdraw', auth, withdrawLimit, async (req, res) => {
    const doc = await withdrawText(deps, await user(req), idParam(req));
    res.json({ status: doc.status });
  });

  router.get('/api/moderation/queue', auth, adminLimit, async (req, res) => {
    const viewer = await admin(req);
    res.set('Cache-Control', 'no-store').json({ documents: await queueItems(db, viewer, await listReviewQueue(db, viewer)) });
  });

  router.post('/api/moderation/documents/:id/decision', auth, adminLimit, async (req, res) => {
    const viewer = await admin(req);
    const body = parseBody(DecisionBody, req.body);
    const doc = await decide(deps, viewer, idParam(req), body.decision, body.reason ?? null);
    res.json({ id: doc.id, status: doc.status, origin: doc.origin });
  });

  router.get('/api/moderation/published', auth, adminLimit, async (req, res) => {
    const viewer = await admin(req);
    const filter = parseQuery(PublishedQuery, req.query);
    res.set('Cache-Control', 'no-store').json({ documents: await publishedItems(db, await listPublished(db, viewer, filter)) });
  });

  router.patch('/api/moderation/documents/:id', auth, adminLimit, async (req, res) => {
    const viewer = await admin(req);
    const body = parseBody(PostPatchBody, req.body);
    const doc = await updatePost(deps, viewer, idParam(req), body);
    const [item] = await publishedItems(db, [{ doc, opens: 0, aiMade: false }]);
    if (!item) throw new HttpError(404, 'not-found');
    res.json(item);
  });

  return router;
}
