/**
 * "Của tôi" (C08). Every route needs a session (401 `sign-in-required`) and lists only documents the account may read.
 *
 * - GET /api/me/documents?type=&status= → `{documents: MyDocument[]}`: the account's own live documents, last changed
 *   first, with the latest review word (why a text was sent back).
 * - GET /api/me/recent → `{documents: Array<MyDocument & {at}>}`: what it read or edited lately (`at`: when).
 * - GET /api/me/favorites → `{documents: Array<MyDocument & {favoritedAt}>}`.
 * - PUT /api/documents/:id/favorite, DELETE /api/documents/:id/favorite → 204 (PUT: 404 / 403 like the reader).
 * - GET /api/me/trash → `{documents: Array<MyDocument & {deletedAt, purgeAt}>}`: deleted for good at `purgeAt`.
 * - DELETE /api/me/trash/:id → 204: deletes one document of the account's trash for good now ("Xoá vĩnh viễn");
 *   404 when it is not in that trash. DELETE /api/me/trash → `{purged}`: the whole trash ("Dọn thùng rác").
 */
import express, { type Router } from 'express';
import { z } from 'zod';
import { TRASH_DAYS, purgeOwnTrash } from '../access/authoring';
import type { DocumentRow } from '../access/content';
import { addFavorite, favoriteIds, latestReviews, listFavorites, listMyDocuments, listMyRecent, listTrash, removeFavorite } from '../access/my-content';
import { listCollectionsOf, userNames } from '../access/reading';
import type { Viewer } from '../access/viewer';
import { finishPurge } from '../authoring/trash-purge';
import { DOCUMENT_STATUSES, documentType } from '../db/schema';
import { HttpError } from '../http-error';
import { perAccountLimit, signedIn } from './account-limit';
import { type CollectionBrief, type DocumentSummary, collectionBrief } from './content-views';
import type { IndexSync } from '../search/index-sync';
import { type RequestContextDeps, openDocument, readerOf } from './request-context';
import { summarizeEach } from './summaries';
import { parseQuery } from './validate';

const RECENT_LIMIT = 30;
const DAY_MS = 24 * 60 * 60 * 1000;

const ListQuery = z.object({ type: z.enum(documentType.enumValues).optional(), status: z.enum(DOCUMENT_STATUSES).optional() });

export interface MyDocument extends DocumentSummary {
  /** The planet colour picked in the editor; null: the default. */
  planet: string | null;
  /** An admin took the published text off the Universe (C08 "Bị quản trị ẩn"); its author still reads it. */
  hidden: boolean;
  /** "Nơi nằm": the Collection within `space`, if any. */
  collection: CollectionBrief | null;
  favorite: boolean;
  /** The latest review event (C08 "Lý do · …"); null when it was never reviewed. */
  review: { action: 'submitted' | 'approved' | 'changes_requested' | 'rejected'; reason: string | null; by: string | null; at: string } | null;
}

type UserViewer = Extract<Viewer, { kind: 'user' }>;

export interface MyContentRoutesOptions extends RequestContextDeps {
  /** Search sync (null without Meilisearch): purged documents leave the indexes. */
  sync: IndexSync | null;
}

export function myContentRoutes({ config, db, now, sync }: MyContentRoutesOptions): Router {
  const router = express.Router();
  const auth = signedIn(config, db, now);
  const favoriteLimit = perAccountLimit(60);
  const purgeLimit = perAccountLimit(30);
  const reader = async (req: Parameters<typeof readerOf>[0]): Promise<UserViewer> => {
    const { viewer } = await readerOf(req, { config, db, now });
    if (viewer.kind !== 'user') throw new HttpError(401, 'sign-in-required');
    return viewer;
  };

  /** C08 rows of `docs`, in order. */
  async function rows(viewer: UserViewer, docs: readonly DocumentRow[]): Promise<MyDocument[]> {
    const ids = docs.map((d) => d.id);
    const [summaries, favorites, reviews, collections] = await Promise.all([
      summarizeEach(db, viewer, docs),
      favoriteIds(db, viewer.userId, ids),
      latestReviews(db, viewer, ids),
      listCollectionsOf(db, [...new Set(docs.map((d) => d.spaceId))]),
    ]);
    const names = await userNames(
      db,
      [...reviews.values()].flatMap((r) => (r.actorId ? [r.actorId] : [])),
    );
    const byId = new Map(docs.map((d) => [d.id, d]));
    const collectionById = new Map(collections.map((c) => [c.id, c]));
    return summaries.map((summary) => {
      const review = reviews.get(summary.id);
      const doc = byId.get(summary.id);
      const collection = doc?.collectionId ? collectionById.get(doc.collectionId) : undefined;
      return {
        ...summary,
        planet: doc?.planet ?? null,
        hidden: doc?.hidden ?? false,
        collection: collection ? collectionBrief(collection) : null,
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

  router.delete('/api/me/trash/:id', auth, purgeLimit, async (req, res) => {
    const viewer = await reader(req);
    const id = req.params.id;
    const result = await purgeOwnTrash(db, viewer, typeof id === 'string' ? id : '');
    if (result.documentIds.length === 0) throw new HttpError(404, 'not-found');
    await finishPurge(result, sync);
    res.status(204).end();
  });

  router.delete('/api/me/trash', auth, purgeLimit, async (req, res) => {
    const viewer = await reader(req);
    const result = await purgeOwnTrash(db, viewer, null);
    await finishPurge(result, sync);
    res.json({ purged: result.documentIds.length });
  });

  return router;
}
