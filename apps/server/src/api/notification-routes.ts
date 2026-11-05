/**
 * The inbox (C20) and the bell (TopActions). Every route needs a session (401 `sign-in-required`) and reaches only
 * the account's own notifications.
 *
 * - GET /api/me/notifications?kind=&unread=true → `{notifications: NotificationView[], unread: {total, byKind}}`:
 *   the latest 100, newest first, of one kind and/or unread only when asked, each with where its text lives now
 *   (null once the account can no longer read it; a mention's or comment's excerpt is then left empty).
 * - GET /api/me/notifications/unread → `{total, byKind}` (the bell's red dot).
 * - POST /api/me/notifications/:id/read, …/:id/unread → 204 (404 when it is not the account's).
 * - POST /api/me/notifications/read-all `{kind?}` → `{marked}`.
 */
import express, { type Router } from 'express';
import { z } from 'zod';
import { isUuid } from '../access/ids';
import { findDocumentsByIds, listCollectionsOf, spacesById } from '../access/reading';
import { viewerFor } from '../access/viewer';
import { NOTIFICATION_KINDS, type NotificationKind } from '../db/schema';
import { HttpError } from '../http-error';
import { type NotificationPayload, listInbox, markAllRead, markRead, unreadCounts } from '../notifications/notification-store';
import { perAccountLimit, signedIn, userIdOf } from './account-limit';
import { type CollectionBrief, type SpaceBrief, collectionBrief, spaceBrief } from './content-views';
import type { RequestContextDeps } from './request-context';
import { idParam } from './review-routes';
import { parseBody, parseQuery } from './validate';

const ListQuery = z.object({ kind: z.enum(NOTIFICATION_KINDS).optional(), unread: z.enum(['true', 'false']).optional() });
const ReadAllBody = z.strictObject({ kind: z.enum(NOTIFICATION_KINDS).optional() });

/** Where the text of a notification lives now, when the account may still read it. */
export interface NotificationPlace {
  space: SpaceBrief;
  collection: CollectionBrief | null;
}

export interface NotificationView {
  id: string;
  kind: NotificationKind;
  documentId: string | null;
  /** null: no text, or one the account can no longer read. */
  place: NotificationPlace | null;
  payload: NotificationPayload;
  createdAt: string;
  readAt: string | null;
}

export function notificationRoutes({ config, db, now }: RequestContextDeps): Router {
  const router = express.Router();
  const auth = signedIn(config, db, now);
  const markLimit = perAccountLimit(120);

  /** Where each readable document of `ids` lives (C20 "Networking › Giao thức nền tảng", "Xem trong Space"). */
  async function placesOf(userId: string, ids: readonly string[]): Promise<Map<string, NotificationPlace>> {
    const viewer = await viewerFor(db, config.adminSubs, userId);
    const docs = await findDocumentsByIds(db, viewer, [...new Set(ids)]);
    const spaceIds = [...new Set(docs.map((d) => d.spaceId))];
    const [spaces, collections] = await Promise.all([spacesById(db, spaceIds), listCollectionsOf(db, spaceIds)]);
    const spaceById = new Map(spaces.map((s) => [s.id, s]));
    const collectionById = new Map(collections.map((c) => [c.id, c]));
    const places = new Map<string, NotificationPlace>();
    for (const doc of docs) {
      const space = spaceById.get(doc.spaceId);
      if (!space) continue;
      const collection = doc.collectionId ? collectionById.get(doc.collectionId) : undefined;
      places.set(doc.id, { space: spaceBrief(space), collection: collection ? collectionBrief(collection) : null });
    }
    return places;
  }

  router.get('/api/me/notifications', auth, async (req, res) => {
    const userId = userIdOf(res);
    const query = parseQuery(ListQuery, req.query);
    const [rows, unread] = await Promise.all([listInbox(db, userId, { kind: query.kind, unreadOnly: query.unread === 'true' }), unreadCounts(db, userId)]);
    const places = await placesOf(userId, rows.flatMap((n) => (n.documentId ? [n.documentId] : [])));
    const notifications: NotificationView[] = rows.map((n) => {
      const place = n.documentId ? (places.get(n.documentId) ?? null) : null;
      // A discussion's words stay with those who can still read the text.
      const payload = (n.payload.kind === 'mention' || n.payload.kind === 'comment') && !place ? { ...n.payload, excerpt: '' } : n.payload;
      return {
        id: n.id,
        kind: n.kind,
        documentId: n.documentId,
        place,
        payload,
        createdAt: n.createdAt.toISOString(),
        readAt: n.readAt?.toISOString() ?? null,
      };
    });
    res.set('Cache-Control', 'no-store').json({ notifications, unread });
  });

  router.get('/api/me/notifications/unread', auth, async (_req, res) => {
    res.set('Cache-Control', 'no-store').json(await unreadCounts(db, userIdOf(res)));
  });

  router.post('/api/me/notifications/read-all', auth, markLimit, async (req, res) => {
    const { kind } = parseBody(ReadAllBody, req.body ?? {});
    res.json({ marked: await markAllRead(db, userIdOf(res), kind, now()) });
  });

  for (const [action, read] of [
    ['read', true],
    ['unread', false],
  ] as const) {
    router.post(`/api/me/notifications/:id/${action}`, auth, markLimit, async (req, res) => {
      const id = idParam(req);
      if (!isUuid(id) || !(await markRead(db, userIdOf(res), id, now(), read))) throw new HttpError(404, 'not-found');
      res.status(204).end();
    });
  }

  return router;
}
