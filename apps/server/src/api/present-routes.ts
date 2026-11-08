/**
 * The viewings of a text's slides (C21).
 *
 * - POST /api/documents/:id/present-views `{furthest, total}` → 204: one viewing, sent by the slides as the page goes
 *   away (a beacon). Whoever may read the text (guests too for a public one): the same access check as the reader, so
 *   a private or hidden text answers 404/403 as C11 does and nothing is recorded. 400 `invalid-body` unless
 *   1 ≤ furthest ≤ total ≤ MAX_PRESENT_SLIDES. At most PRESENT_VIEW_LIMIT_PER_MINUTE a minute from one address (429
 *   `rate-limited`). Nothing about the viewer is kept.
 */
import express, { type Router } from 'express';
import { rateLimit } from 'express-rate-limit';
import { z } from 'zod';
import { MAX_PRESENT_SLIDES, recordPresentView } from '../access/present-views';
import { type RequestContextDeps, openDocument, readerOf } from './request-context';
import { parseBody } from './validate';

export const PRESENT_VIEW_LIMIT_PER_MINUTE = 30;

const ViewBody = z
  .strictObject({
    furthest: z.int().min(1).max(MAX_PRESENT_SLIDES),
    total: z.int().min(1).max(MAX_PRESENT_SLIDES),
  })
  .refine((body) => body.furthest <= body.total);

export function presentRoutes(deps: RequestContextDeps): Router {
  const { db, now } = deps;
  const router = express.Router();
  const limit = rateLimit({ windowMs: 60 * 1000, limit: PRESENT_VIEW_LIMIT_PER_MINUTE, standardHeaders: 'draft-8', legacyHeaders: false, message: { error: 'rate-limited' } });

  router.post('/api/documents/:id/present-views', limit, async (req, res) => {
    const { viewer } = await readerOf(req, deps);
    const doc = await openDocument(db, viewer, req.params.id);
    const view = parseBody(ViewBody, req.body);
    await recordPresentView(db, doc.id, view, now());
    res.status(204).end();
  });

  return router;
}
