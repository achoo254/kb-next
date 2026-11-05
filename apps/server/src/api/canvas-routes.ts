/**
 * Canvas boards (C15), each owned by one account and only ever shown to it: GET/POST /api/canvases (the owner's
 * boards, optionally of one Space; a new one), GET/PUT/DELETE /api/canvases/:id (open, autosave, delete) and POST
 * /api/canvases/:id/suggestion (Jev's best pair of unconnected cards; the user accepts it, Jev never connects on its
 * own). Document cards are resolved through src/access/: a document the owner can no longer read comes back without
 * its details, never with them.
 */
import express, { type Router } from 'express';
import { z } from 'zod';
import { findDocumentsByIds, spaceAccess, spacesById } from '../access/reading';
import { firstPassages } from '../access/graph';
import { headingsOf } from '../access/participation';
import type { Viewer } from '../access/viewer';
import { type CanvasData, CanvasDataSchema, MAX_CANVAS_TITLE } from '../canvas/canvas-data';
import { type CanvasRow, createCanvas, deleteCanvas, findCanvas, listCanvases, saveCanvas } from '../canvas/canvas-store';
import type { DocumentRow } from '../access/content';
import { HttpError } from '../http-error';
import type { JevJudge } from '../jev/jev-client';
import { type RelatednessItem, scoreRelatedness } from '../jev/relatedness';
import { safeErrorText } from '../log-error';
import { excerpt } from '../search/document-summaries';
import { perAccountLimit, signedIn, userIdOf } from './account-limit';
import { type SpaceBrief, spaceBrief } from './content-views';
import { type RequestContextDeps, readerOf } from './request-context';
import { parseBody, parseQuery } from './validate';

/** A canvas body (cards, connections) is bigger than the API's usual 32 kB. */
export const CANVAS_BODY_LIMIT = '256kb';
/** Headings of a document card shown on it (its preview). */
const PREVIEW_HEADINGS = 2;

export interface CanvasDocument {
  title: string;
  type: DocumentRow['type'];
  origin: DocumentRow['origin'];
  status: DocumentRow['status'];
  /** Its first section headings, the card's preview. */
  headings: string[];
}

export interface CanvasResponse {
  id: string;
  title: string;
  updatedAt: string;
  space: SpaceBrief | null;
  canvas: CanvasData;
  /** The documents of document cards the owner may read, by id; a card whose document is missing here is unreadable. */
  documents: Record<string, CanvasDocument>;
}

export interface CanvasListResponse {
  canvases: Array<{ id: string; title: string; updatedAt: string; spaceSlug: string | null; cards: number }>;
}

export interface CanvasSuggestion {
  from: string;
  to: string;
  /** 0–100, as Jev rated how related the two cards are. */
  relevance: number;
}

const Slug = z.string().regex(/^[a-z0-9][a-z0-9-]{0,119}$/);
const Title = z.string().trim().min(1).max(MAX_CANVAS_TITLE);
const ListQuery = z.object({ space: Slug.optional() });
const CreateBody = z.strictObject({ title: Title, space: Slug.nullable().optional() });
const SaveBody = z.strictObject({ title: Title, canvas: CanvasDataSchema });
const CardId = z.string().regex(/^[A-Za-z0-9_-]{1,40}$/);
const SuggestBody = z.strictObject({ exclude: z.array(z.tuple([CardId, CardId])).max(100).optional() });

export interface CanvasRoutesOptions extends RequestContextDeps {
  jev: JevJudge | null;
}

export function canvasRoutes({ config, db, now, jev }: CanvasRoutesOptions): Router {
  const router = express.Router();
  const auth = signedIn(config, db, now);
  const reader = (req: Parameters<typeof readerOf>[0]) => readerOf(req, { config, db, now });
  // Autosave writes often (every pause in editing); suggestions are Jev calls.
  const writeLimit = perAccountLimit(120);
  const suggestLimit = perAccountLimit(12);

  async function opened(req: Parameters<typeof readerOf>[0], ownerId: string): Promise<CanvasRow> {
    const id = (req.params as Record<string, string | undefined>).id;
    const row = id ? await findCanvas(db, ownerId, id) : null;
    if (!row) throw new HttpError(404, 'not-found');
    return row;
  }

  async function response(viewer: Viewer, row: CanvasRow): Promise<CanvasResponse> {
    const ids = row.stored.canvas.cards.flatMap((c) => (c.documentId ? [c.documentId] : []));
    const [docs, headings, spaces] = await Promise.all([
      findDocumentsByIds(db, viewer, ids),
      headingsOf(db, viewer, ids),
      row.stored.spaceId ? spacesById(db, [row.stored.spaceId]) : Promise.resolve([]),
    ]);
    const space = spaces[0];
    return {
      id: row.id,
      title: row.title,
      updatedAt: row.updatedAt.toISOString(),
      space: space ? spaceBrief(space) : null,
      canvas: row.stored.canvas,
      documents: Object.fromEntries(
        docs.map((d) => [d.id, { title: d.title, type: d.type, origin: d.origin, status: d.status, headings: (headings.get(d.id) ?? []).slice(0, PREVIEW_HEADINGS) }]),
      ),
    };
  }

  /** A Space the viewer sees, by slug; 404 / 403 otherwise. */
  async function visibleSpace(viewer: Viewer, slug: string): Promise<{ id: string }> {
    const access = await spaceAccess(db, viewer, slug);
    if (access.kind === 'not-found') throw new HttpError(404, 'not-found');
    if (access.kind === 'no-access') throw new HttpError(403, 'no-access');
    return access.space;
  }

  router.get('/api/canvases', auth, async (req, res) => {
    const { viewer } = await reader(req);
    const { space: slug } = parseQuery(ListQuery, req.query);
    const space = slug ? await visibleSpace(viewer, slug) : null;
    const rows = await listCanvases(db, userIdOf(res), space?.id);
    const slugs = new Map((await spacesById(db, [...new Set(rows.flatMap((r) => (r.stored.spaceId ? [r.stored.spaceId] : [])))])).map((s) => [s.id, s.slug]));
    const body: CanvasListResponse = {
      canvases: rows.map((r) => ({
        id: r.id,
        title: r.title,
        updatedAt: r.updatedAt.toISOString(),
        spaceSlug: r.stored.spaceId ? (slugs.get(r.stored.spaceId) ?? null) : null,
        cards: r.stored.canvas.cards.length,
      })),
    };
    res.set('Cache-Control', 'no-store').json(body);
  });

  router.post('/api/canvases', auth, writeLimit, async (req, res) => {
    const { viewer } = await reader(req);
    const body = parseBody(CreateBody, req.body);
    const space = body.space ? await visibleSpace(viewer, body.space) : null;
    const row = await createCanvas(db, userIdOf(res), body.title, space?.id ?? null, now());
    res.status(201).json(await response(viewer, row));
  });

  router.get('/api/canvases/:id', auth, async (req, res) => {
    const { viewer } = await reader(req);
    const row = await opened(req, userIdOf(res));
    res.set('Cache-Control', 'no-store').json(await response(viewer, row));
  });

  router.put('/api/canvases/:id', auth, writeLimit, async (req, res) => {
    const { viewer } = await reader(req);
    const body = parseBody(SaveBody, req.body);
    const row = await opened(req, userIdOf(res));
    // A new document card must be one the owner may read now (an existing one may have been hidden since).
    const before = new Set(row.stored.canvas.cards.flatMap((c) => (c.documentId ? [c.documentId] : [])));
    const added = body.canvas.cards.flatMap((c) => (c.documentId && !before.has(c.documentId) ? [c.documentId] : []));
    if (added.length > 0 && (await findDocumentsByIds(db, viewer, added)).length !== new Set(added).size) throw new HttpError(403, 'no-access');
    const saved = await saveCanvas(db, userIdOf(res), row.id, body.title, body.canvas, now());
    if (saved.kind === 'not-found') throw new HttpError(404, 'not-found');
    if (saved.kind === 'stale') {
      res.status(409).json({ error: 'stale', rev: saved.rev });
      return;
    }
    res.json({ updatedAt: saved.updatedAt.toISOString(), rev: body.canvas.rev });
  });

  router.delete('/api/canvases/:id', auth, writeLimit, async (req, res) => {
    const row = await opened(req, userIdOf(res));
    await deleteCanvas(db, userIdOf(res), row.id);
    res.status(204).end();
  });

  router.post('/api/canvases/:id/suggestion', auth, suggestLimit, async (req, res) => {
    const { viewer } = await reader(req);
    const body = parseBody(SuggestBody, req.body ?? {});
    const row = await opened(req, userIdOf(res));
    if (!jev) throw new HttpError(503, 'jev-off');
    const { cards, connections } = row.stored.canvas;
    const pairKey = (a: string, b: string): string => [a, b].sort().join('|');
    const skip = new Set([...connections.map((c) => pairKey(c.from, c.to)), ...(body.exclude ?? []).map(([a, b]) => pairKey(a, b))]);
    const pairs: Array<[string, string]> = [];
    for (const [i, a] of cards.entries()) {
      for (const b of cards.slice(i + 1)) if (!skip.has(pairKey(a.id, b.id))) pairs.push([a.id, b.id]);
    }
    if (pairs.length === 0) {
      res.json({ suggestion: null });
      return;
    }
    const docIds = cards.flatMap((c) => (c.documentId ? [c.documentId] : []));
    const [docs, passages] = await Promise.all([findDocumentsByIds(db, viewer, docIds), firstPassages(db, viewer, docIds)]);
    const docById = new Map(docs.map((d) => [d.id, d]));
    const items: RelatednessItem[] = cards.flatMap((c) => {
      if (c.documentId) {
        const doc = docById.get(c.documentId);
        // An unreadable document says nothing to Jev.
        return doc ? [{ id: c.id, title: doc.title, text: excerpt(passages.get(doc.id) ?? '') }] : [];
      }
      return [{ id: c.id, title: c.title, text: [c.body ?? '', ...(c.steps ?? []), c.url ?? ''].filter(Boolean).join(' · ') }];
    });
    const known = new Set(items.map((i) => i.id));
    try {
      const scored = await scoreRelatedness(
        jev,
        'canvas-suggest',
        items,
        pairs.filter(([a, b]) => known.has(a) && known.has(b)),
      );
      const best = scored.pairs[0];
      const suggestion: CanvasSuggestion | null = best ? { from: best.a, to: best.b, relevance: best.relevance } : null;
      res.json({ suggestion });
    } catch (error) {
      console.warn('canvas suggestion unavailable', safeErrorText(error));
      throw new HttpError(502, 'jev-failed');
    }
  });

  return router;
}
