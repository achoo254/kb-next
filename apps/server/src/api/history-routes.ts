/**
 * Versions and activity of a document (C17). Every route needs a session and a document the viewer may read
 * (404 `not-found`, 403 `hidden` / `no-access`, like the reader).
 *
 * - GET /api/documents/:id/history → HistoryResponse: the document, what the viewer may see of it (`scope`: the
 *   author and admins everything; other readers the current version and approvals only, src/access/history.ts),
 *   whether it may restore, its current version, and the events newest first: versions (who, how: editor / API / import / restore / translation, AI-made,
 *   a summary), review steps (approved, changes requested… with the reason) and visibility (hidden / shown again).
 * - GET /api/documents/:id/versions/:n → `{version, markdown, savedAt, editorName}`; 404 for a version it does not have
 *   or the viewer may not see (another reader: any but the current one). Same for the diff.
 * The three reads are limited to 60 a minute per account (429 `rate-limited`).
 * - GET /api/documents/:id/diff?from=&to= → `{from, to, added, removed, lines}` (src/authoring/block-diff.ts).
 * - POST /api/documents/:id/versions/:n/restore → `{rev, version}`: version n copied as a new version (the history
 *   keeps everything). Who may edit the document may restore (403 `no-access` otherwise).
 */
import express, { type Router } from 'express';
import { z } from 'zod';
import { diffVersions, editRight, findVersion, restoreVersion } from '../access/authoring';
import { type ActorRole, actorsOf, documentActivity } from '../access/history';
import { listCollectionsOf, spacesById, userNames } from '../access/reading';
import type { BlockDiff } from '../authoring/block-diff';
import { HttpError } from '../http-error';
import type { IndexSync } from '../search/index-sync';
import { perAccountLimit, signedIn } from './account-limit';
import { type CollectionBrief, type SpaceBrief, collectionBrief, spaceBrief } from './content-views';
import { type RequestContextDeps, openDocument, readerOf } from './request-context';
import { parseQuery } from './validate';

export interface HistoryActor {
  name: string | null;
  role: ActorRole;
}

export type HistoryEvent =
  | {
      kind: 'version';
      at: string;
      actor: HistoryActor | null;
      version: number;
      via: 'editor' | 'api' | 'import' | 'restore' | 'translation';
      aiMade: boolean;
      summary: string | null;
      restoredFrom: number | null;
      /** Written by someone other than its author who is no admin (C17 "Đề xuất sửa"). */
      proposal: boolean;
    }
  | { kind: 'review'; at: string; actor: HistoryActor | null; action: 'submitted' | 'approved' | 'changes_requested' | 'rejected'; reason: string | null; version: number | null }
  | { kind: 'visibility'; at: string; actor: HistoryActor | null; hidden: boolean };

export interface HistoryResponse {
  document: { id: string; title: string; status: string; origin: string; space: SpaceBrief & { kind: 'public' | 'personal' }; collection: CollectionBrief | null };
  /** `full`: the author or an admin, everything; `public`: another reader, the current version and approvals only. */
  scope: 'full' | 'public';
  /** The viewer may restore an earlier version (may edit the document now). */
  canRestore: boolean;
  currentVersion: number;
  /** Newest first. */
  events: HistoryEvent[];
}

export type DiffResponse = BlockDiff & { from: number; to: number };

const Version = z.coerce.number().int().min(1).max(1_000_000);
const DiffQuery = z.object({ from: Version, to: Version });

export interface HistoryRoutesOptions extends RequestContextDeps {
  sync: IndexSync | null;
}

export function historyRoutes({ config, db, now, sync }: HistoryRoutesOptions): Router {
  const router = express.Router();
  const auth = signedIn(config, db, now);
  const restoreLimit = perAccountLimit(30);
  // Reading a history costs a few queries, a diff a comparison of two texts: bounded per account.
  const readLimit = perAccountLimit(60);
  const reader = async (req: Parameters<typeof readerOf>[0]) => (await readerOf(req, { config, db, now })).viewer;
  const versionParam = (raw: unknown): number => {
    const parsed = Version.safeParse(raw);
    if (!parsed.success) throw new HttpError(404, 'not-found');
    return parsed.data;
  };

  router.get('/api/documents/:id/history', auth, readLimit, async (req, res) => {
    const viewer = await reader(req);
    const doc = await openDocument(db, viewer, req.params.id);
    const activity = await documentActivity(db, viewer, doc.id);
    if (!activity) throw new HttpError(404, 'not-found');
    const actorIds = [
      ...activity.versions.map((v) => v.editorId),
      ...activity.reviews.flatMap((r) => (r.actorId ? [r.actorId] : [])),
      ...activity.visibility.flatMap((v) => (v.actorId ? [v.actorId] : [])),
    ];
    const actors = await actorsOf(db, config.adminSubs, actorIds);
    const actor = (id: string | null): HistoryActor | null => (id ? (actors.get(id) ?? null) : null);
    const events: HistoryEvent[] = [
      ...activity.versions.map((v): HistoryEvent => {
        const who = actor(v.editorId);
        return {
          kind: 'version',
          at: v.updatedAt.toISOString(),
          actor: who,
          version: v.version,
          via: v.via,
          aiMade: v.aiMade,
          summary: v.summary,
          restoredFrom: v.restoredFrom,
          proposal: v.editorId !== doc.authorId && who?.role !== 'admin',
        };
      }),
      ...activity.reviews.map((r): HistoryEvent => ({ kind: 'review', at: r.createdAt.toISOString(), actor: actor(r.actorId), action: r.action, reason: r.reason, version: r.version })),
      ...activity.visibility.map((v): HistoryEvent => ({ kind: 'visibility', at: v.createdAt.toISOString(), actor: actor(v.actorId), hidden: v.hidden })),
    ].sort((a, b) => b.at.localeCompare(a.at));
    const [[space], collections] = await Promise.all([spacesById(db, [doc.spaceId]), listCollectionsOf(db, [doc.spaceId])]);
    if (!space) throw new Error('document without its Space');
    const collection = collections.find((c) => c.id === doc.collectionId);
    const body: HistoryResponse = {
      document: {
        id: doc.id,
        title: doc.title,
        status: doc.status,
        origin: doc.origin,
        space: { ...spaceBrief(space), kind: space.kind },
        collection: collection ? collectionBrief(collection) : null,
      },
      scope: activity.scope,
      // An Office file has no text to restore.
      canRestore: editRight(viewer, doc) === 'ok' && doc.type !== 'office',
      currentVersion: activity.versions.at(-1)?.version ?? 0,
      events,
    };
    res.set('Cache-Control', 'no-store').json(body);
  });

  router.get('/api/documents/:id/versions/:n', auth, readLimit, async (req, res) => {
    const viewer = await reader(req);
    const doc = await openDocument(db, viewer, req.params.id);
    const found = await findVersion(db, viewer, doc.id, versionParam(req.params.n));
    if (!found) throw new HttpError(404, 'not-found');
    const names = await userNames(db, [found.editorId]);
    res.set('Cache-Control', 'no-store').json({ version: found.version, markdown: found.markdown ?? '', savedAt: found.updatedAt.toISOString(), editorName: names.get(found.editorId) ?? null });
  });

  router.get('/api/documents/:id/diff', auth, readLimit, async (req, res) => {
    const viewer = await reader(req);
    const doc = await openDocument(db, viewer, req.params.id);
    const { from, to } = parseQuery(DiffQuery, req.query);
    const diff = await diffVersions(db, viewer, doc.id, from, to);
    if (!diff) throw new HttpError(404, 'not-found');
    const body: DiffResponse = { from, to, ...diff };
    res.set('Cache-Control', 'no-store').json(body);
  });

  router.post('/api/documents/:id/versions/:n/restore', auth, restoreLimit, async (req, res) => {
    const viewer = await reader(req);
    const doc = await openDocument(db, viewer, req.params.id);
    const result = await restoreVersion(db, viewer, doc.id, versionParam(req.params.n), now());
    switch (result.kind) {
      case 'saved':
        if (result.changed) sync?.enqueue([doc.id]);
        res.json({ rev: result.rev.toISOString(), version: result.version });
        return;
      case 'stale':
        res.status(409).json({ error: 'stale', rev: result.rev.toISOString() });
        return;
      case 'not-found':
        throw new HttpError(404, 'not-found');
      case 'no-access':
        throw new HttpError(403, 'no-access');
      case 'not-editable':
        throw new HttpError(409, 'not-editable');
    }
  });

  return router;
}
