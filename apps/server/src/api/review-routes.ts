/**
 * The publishing lifecycle on the web session (src/access/review.ts, src/review/moderation.ts). Every route needs a
 * session (401 `sign-in-required`); published texts need an admin (403 `admin-only`): src/access/roles.ts.
 *
 * Author (C04, C06, C08):
 * - POST /api/documents/:id/submit `{space?, collection?, tags?, lang?}` → PublishResponse: publishes the text at once
 *   (optionally placed, tagged and given its language first, C04); a text an admin hid stays hidden (`hidden`).
 *   400 `title-required` / `body-required`, 409 `already-published`, 404 / 403 like the reader.
 * - POST /api/documents/:id/private `{space?, collection?, tags?, lang?}` → `{status: 'private'}`: C04 "Lưu riêng
 *   tư", C08 "Gỡ xuống"; a published text is unpublished and its share links are revoked.
 *
 * Admins (A02):
 * - GET /api/moderation/published?origin=&visibility=&q= → `{documents: PublishedItem[]}`.
 * - PATCH /api/moderation/documents/:id `{hidden?, title?, tags?, space?, collection?}` → PublishedItem (its `opens`
 *   and `aiMade` are not recomputed: the list keeps what it had). Published texts only, all or nothing: 409
 *   `not-approved` for any other, before any change.
 * Removing a text for good is DELETE /api/documents/:id (its author or an admin).
 */
import express, { type Request, type Router } from 'express';
import { rateLimit } from 'express-rate-limit';
import { z } from 'zod';
import { type AdminViewer, isAdminViewer, listPublished } from '../access/review';
import type { Viewer } from '../access/viewer';
import { MAX_TITLE_CHARS } from '../authoring/markdown-text';
import { HttpError } from '../http-error';
import type { IndexSync } from '../search/index-sync';
import { type ModerationDeps, cleanTags, keepTextPrivate, publishText, publishedItems, resolvePlacement, updatePost } from '../review/moderation';
import { perAccountLimit, signedIn, userIdOf } from './account-limit';
import { type RequestContextDeps, readerOf } from './request-context';
import { parseBody, parseQuery } from './validate';

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

const SubmitBody = z.strictObject({ space: Slug.optional(), collection: z.uuid().optional(), tags: Tags.optional(), lang: z.enum(['vi', 'en']).optional() });

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
}

type UserViewer = Extract<Viewer, { kind: 'user' }>;

export function idParam(req: Request): string {
  const id = req.params.id;
  return typeof id === 'string' ? id : '';
}

export function reviewRoutes({ config, db, now, sync }: ReviewRoutesOptions): Router {
  const router = express.Router();
  const deps: ModerationDeps = { config, db, now, sync };
  const auth = signedIn(config, db, now);
  // Publishing puts a text in front of every reader: few per account, over ten minutes.
  const submitLimit = rateLimit({
    windowMs: 10 * 60 * 1000,
    limit: config.submitLimitPer10Min,
    standardHeaders: 'draft-8',
    legacyHeaders: false,
    message: { error: 'rate-limited' },
    keyGenerator: (_req, res) => `submit:${userIdOf(res)}`,
  });
  const privateLimit = perAccountLimit(10);
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
    res.json(await publishText(deps, viewer, idParam(req), { placement, tags: cleanTags(body.tags), lang: body.lang }));
  });

  router.post('/api/documents/:id/private', auth, privateLimit, async (req, res) => {
    const viewer = await user(req);
    const body = parseBody(SubmitBody, req.body ?? {});
    const placement = await resolvePlacement(db, viewer, body, false);
    const doc = await keepTextPrivate(deps, viewer, idParam(req), { placement, tags: cleanTags(body.tags), lang: body.lang });
    res.json({ status: doc.status });
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
