/**
 * "Của tôi" (C08). Every route needs a session (401 `sign-in-required`) and lists only documents the account may read.
 *
 * - GET /api/me/documents?type=&status= → `{documents: MyDocument[]}`: the account's own live documents, last changed
 *   first, with the latest review word (why a text was sent back).
 * - GET /api/me/recent → `{documents: Array<MyDocument & {at}>}`: what it read or edited lately (`at`: when).
 * - GET /api/me/favorites → `{documents: Array<MyDocument & {favoritedAt}>}`.
 * - PUT /api/documents/:id/favorite, DELETE /api/documents/:id/favorite → 204 (PUT: 404 / 403 like the reader).
 * - GET /api/me/trash → `{documents: Array<MyDocument & {deletedAt, purgeAt}>}`: deleted for good at `purgeAt`.
 */
import express, { type Router } from 'express';
import { z } from 'zod';
import { TRASH_DAYS } from '../access/authoring';
import type { DocumentRow } from '../access/content';
import { addFavorite, favoriteIds, latestReviews, listFavorites, listMyDocuments, listMyRecent, listTrash, removeFavorite } from '../access/my-content';
import { userNames } from '../access/reading';
import type { Viewer } from '../access/viewer';
import { DOCUMENT_STATUSES, documentType } from '../db/schema';
import { HttpError } from '../http-error';
import { perAccountLimit, signedIn } from './account-limit';
import type { DocumentSummary } from './content-views';
import { type RequestContextDeps, openDocument, readerOf } from './request-context';
import { summarizeEach } from './summaries';
import { parseQuery } from './validate';

const RECENT_LIMIT = 30;
const DAY_MS = 24 * 60 * 60 * 1000;

const ListQuery = z.object({ type: z.enum(documentType.enumValues).optional(), status: z.enum(DOCUMENT_STATUSES).optional() });

export interface MyDocument extends DocumentSummary {
  /** The planet colour picked in the editor; null: the default. */
  planet: string | null;
  favorite: boolean;
  /** The latest review event (C08 "Lý do · …"); null when it was never reviewed. */
  review: { action: 'submitted' | 'approved' | 'changes_requested' | 'rejected'; reason: string | null; by: string | null; at: string } | null;
}

type UserViewer = Extract<Viewer, { kind: 'user' }>;

export function myContentRoutes({ config, db, now }: RequestContextDeps): Router {
  const router = express.Router();
  const auth = signedIn(config, db, now);
  const favoriteLimit = perAccountLimit(60);
  const reader = async (req: Parameters<typeof readerOf>[0]): Promise<UserViewer> => {
    const { viewer } = await readerOf(req, { config, db, now });
    if (viewer.kind !== 'user') throw new HttpError(401, 'sign-in-required');
    return viewer;
  };

  /** C08 rows of `docs`, in order. */
  async function rows(viewer: UserViewer, docs: readonly DocumentRow[]): Promise<MyDocument[]> {
    const ids = docs.map((d) => d.id);
    const [summaries, favorites, reviews] = await Promise.all([summarizeEach(db, viewer, docs), favoriteIds(db, viewer.userId, ids), latestReviews(db, viewer, ids)]);
    const names = await userNames(
      db,
      [...reviews.values()].flatMap((r) => (r.actorId ? [r.actorId] : [])),
    );
    const planets = new Map(docs.map((d) => [d.id, d.planet]));
    return summaries.map((summary) => {
      const review = reviews.get(summary.id);
      return {
        ...summary,
        planet: planets.get(summary.id) ?? null,
        favorite: favorites.has(summary.id),
        review: review ? { action: review.action, reason: review.reason, by: review.actorId ? (names.get(review.actorId) ?? null) : null, at: review.at.toISOString() } : null,
      };
    });
  }

  router.get('/api/me/documents', auth, async (req, res) => {
    const viewer = await reader(req);
    const filter = parseQuery(ListQuery, req.query);
    res.set('Cache-Control', 'no-store').json({ documents: await rows(viewer, await listMyDocuments(db, viewer, filter)) });
  });

  router.get('/api/me/recent', auth, async (req, res) => {
    const viewer = await reader(req);
    const recent = await listMyRecent(db, viewer, RECENT_LIMIT);
    const at = new Map(recent.map((r) => [r.doc.id, r.at.toISOString()]));
    const documents = (
      await rows(
        viewer,
        recent.map((r) => r.doc),
      )
    ).map((row) => ({ ...row, at: at.get(row.id) ?? row.updatedAt }));
    res.set('Cache-Control', 'no-store').json({ documents });
  });

  router.get('/api/me/favorites', auth, async (req, res) => {
    const viewer = await reader(req);
    const favorites = await listFavorites(db, viewer);
    const at = new Map(favorites.map((f) => [f.doc.id, f.at.toISOString()]));
    const documents = (
      await rows(
        viewer,
        favorites.map((f) => f.doc),
      )
    ).map((row) => ({ ...row, favoritedAt: at.get(row.id) ?? row.updatedAt }));
    res.set('Cache-Control', 'no-store').json({ documents });
  });

  router.put('/api/documents/:id/favorite', auth, favoriteLimit, async (req, res) => {
    const viewer = await reader(req);
    const doc = await openDocument(db, viewer, req.params.id);
    if (!(await addFavorite(db, viewer, doc.id, now()))) throw new HttpError(404, 'not-found');
    res.status(204).end();
  });

  router.delete('/api/documents/:id/favorite', auth, favoriteLimit, async (req, res) => {
    const viewer = await reader(req);
    const id = req.params.id;
    await removeFavorite(db, viewer, typeof id === 'string' ? id : '');
    res.status(204).end();
  });

  router.get('/api/me/trash', auth, async (req, res) => {
    const viewer = await reader(req);
    const trashed = await listTrash(db, viewer);
    // The rows are no longer readable through the read rule (it hides the trash): summarized as the author's own.
    const deleted = new Map(trashed.map((d) => [d.id, d.deletedAt ?? now()]));
    const live = trashed.map((d) => ({ ...d, deletedAt: null }));
    const documents = (await rows(viewer, live)).map((row) => {
      const at = deleted.get(row.id) ?? now();
      return { ...row, deletedAt: at.toISOString(), purgeAt: new Date(at.getTime() + TRASH_DAYS * DAY_MS).toISOString() };
    });
    res.set('Cache-Control', 'no-store').json({ documents });
  });

  return router;
}
