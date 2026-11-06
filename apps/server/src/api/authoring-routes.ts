/**
 * Writing (C02 editor, C01 create, C08): every route needs a session (401 `sign-in-required`) and goes through
 * src/access/ (authoring.ts, spaces-write.ts), so nobody reads, edits or deletes what they may not.
 *
 * - POST /api/documents `{title?, body?, type?, space?, collection?, lang?, planet?}` → 201 EditableDocument: a draft
 *   of the signed-in account (origin `own`, status `draft`, only they see it), in `space` (a public Space or their
 *   own personal one; default: their personal Space, made on first use) and `collection` (one of that Space).
 *   400 `invalid-body` / `unknown-collection`, 404 `not-found` / 403 `no-access` for the Space.
 * - GET /api/documents/:id/edit → EditableDocument. 404 `not-found`, 403 `hidden` / `no-access` (not theirs),
 *   403 `locked` (waiting for review or published: changes go through review), 409 `not-editable` (a stored file),
 *   409 `journey` (a journey: its steps are edited at /journey/:id/edit, src/api/journey-routes.ts).
 * - PUT /api/documents/:id `{title, body, planet?, baseRev, aiMade?}` → SaveResponse; 409 `{error: 'stale', rev}` when
 *   another save landed since `baseRev` (the copy the writer started from), same 403/404/409 as above. `aiMade`: the
 *   text holds an accepted AI suggestion, so the version this save writes (the writer's own) is marked AI-made.
 * - DELETE /api/documents/:id → 204: to the trash (30 days, then deleted for good). An admin deletes any document,
 *   its author any of theirs that is not published (403 `no-access` otherwise).
 *   POST /api/documents/:id/restore → 204: out of the trash, by whoever deleted it or an admin (404 otherwise).
 * - GET /api/documents/:id/links → `{backlinks, outgoing}`: readable documents linking to it and linked from it.
 * - GET /api/link-suggestions?q=&exclude= → `{documents}`: readable documents whose title holds `q` (the `[[` list).
 * - POST /api/me/space → `{space, created}`: the account's personal Space, made if missing.
 * - POST /api/spaces (admins only, 403 `admin-only`) → 201 the new public Space; 409 `slug-taken`.
 * - POST /api/collections `{space, nameVi, nameEn?}` → 201: a Collection in the account's personal Space (admins:
 *   any Space); 403 `no-access` elsewhere.
 * A save, delete or restore enqueues the document for search sync.
 */
import express, { type Response, type Router } from 'express';
import { z } from 'zod';
import {
  type EditAccess,
  type Planet,
  createDocument,
  editAccess,
  isPlanet,
  linkedDocumentIds,
  restoreFromTrash,
  saveDocument,
  suggestLinkTargets,
  trashDocument,
} from '../access/authoring';
import { findDocumentsByIds, listCollectionsOf, spacesById } from '../access/reading';
import { collectionIn, createCollection, createPublicSpace, ensurePersonalSpace, mayAddCollection, spaceForWriting } from '../access/spaces-write';
import type { Viewer } from '../access/viewer';
import { MAX_BODY_CHARS, MAX_TITLE_CHARS, bodyOf } from '../authoring/markdown-text';
import { PLANET_COLOURS, uiLang, users } from '../db/schema';
import { HttpError } from '../http-error';
import type { IndexSync } from '../search/index-sync';
import { eq } from 'drizzle-orm';
import { perAccountLimit, signedIn } from './account-limit';
import { type CollectionBrief, type DocumentSummary, type SpaceBrief, collectionBrief, spaceBrief } from './content-views';
import { type RequestContextDeps, readerOf } from './request-context';
import { summarizeEach } from './summaries';
import { parseBody, parseQuery } from './validate';

/** A document body may be long; the API's usual JSON limit is 32 kB. */
export const DOCUMENT_BODY_LIMIT = '1mb';
const SUGGESTIONS = 8;
const MAX_QUERY_CHARS = 120;

const Slug = z.string().regex(/^[a-z0-9][a-z0-9-]{0,119}$/);
const Uuid = z.uuid();
// One line: a title with a line break would add headings to the stored text.
const Title = z
  .string()
  .max(MAX_TITLE_CHARS)
  .refine((title) => !/[\r\n]/.test(title));
const Body = z.string().max(MAX_BODY_CHARS);
const PlanetField = z.enum(PLANET_COLOURS);
const Name = z.string().trim().min(1).max(80);
const Colour = z.string().regex(/^#[0-9a-fA-F]{6}$/);

const CreateBody = z.strictObject({
  title: Title.optional().default(''),
  body: Body.optional().default(''),
  type: z.enum(['note', 'process']).optional().default('note'),
  space: Slug.optional(),
  collection: Uuid.optional(),
  lang: z.enum(uiLang.enumValues).optional(),
  planet: PlanetField.nullable().optional(),
});

const SaveBody = z.strictObject({
  title: Title,
  body: Body,
  planet: PlanetField.nullable().optional(),
  baseRev: z.iso.datetime({ offset: true }),
  /** The save carries text accepted from an "AI viết hộ" suggestion: the version it writes is marked AI-made. */
  aiMade: z.boolean().optional(),
});

const SuggestQuery = z.object({ q: z.string().max(MAX_QUERY_CHARS).optional().default(''), exclude: Uuid.optional() });

const PublicSpaceBody = z.strictObject({
  // `personal-<account>` is the slug of that account's own Space (spaces-write.ts).
  slug: Slug.refine((slug) => !slug.startsWith('personal-')),
  nameVi: Name,
  nameEn: Name,
  tint: Colour,
  glow: Colour,
  art: z.string().regex(/^\/art\/[a-z0-9-]+\.webp$/),
  unitVi: Name,
  unitEn: Name,
  descriptionVi: z.string().trim().max(300).nullable().optional(),
  descriptionEn: z.string().trim().max(300).nullable().optional(),
});

const CollectionBody = z.strictObject({ space: Slug, nameVi: Name, nameEn: Name.optional() });

/** What the editor (C02) opens: the text as last saved and where it lives. */
export interface EditableDocument {
  id: string;
  title: string;
  /** Markdown without the `#` title line. */
  body: string;
  type: 'lab' | 'note' | 'process' | 'office' | 'web' | 'journey';
  lang: 'vi' | 'en';
  origin: 'official' | 'community' | 'own';
  status: 'draft' | 'private' | 'pending' | 'changes_requested' | 'rejected' | 'approved';
  planet: Planet | null;
  /** The document's `updatedAt`: send it back as `baseRev` with the next save. */
  rev: string;
  /** Its latest version and when that was last saved ("Đã lưu 21:24"). */
  version: number;
  savedAt: string;
  space: SpaceBrief & { kind: 'public' | 'personal' };
  collection: CollectionBrief | null;
}

export interface SaveResponse {
  rev: string;
  version: number;
  savedAt: string;
  /** false: the text was already stored as sent (nothing new in the history). */
  changed: boolean;
}

export interface LinkSuggestion {
  id: string;
  title: string;
  type: EditableDocument['type'];
  origin: EditableDocument['origin'];
  status: EditableDocument['status'];
  space: SpaceBrief;
}

export interface AuthoringRoutesOptions extends RequestContextDeps {
  /** Search sync (null without Meilisearch). */
  sync: IndexSync | null;
}

type UserViewer = Extract<Viewer, { kind: 'user' }>;

function asUser(viewer: Viewer): UserViewer {
  if (viewer.kind !== 'user') throw new HttpError(401, 'sign-in-required');
  return viewer;
}

/** The HTTP answer of an editor access that is not `ok`. */
export function refuse(access: Exclude<EditAccess, { kind: 'ok' }> | { kind: 'not-found' | 'no-access' | 'locked' | 'not-editable' }): never {
  switch (access.kind) {
    case 'not-found':
      throw new HttpError(404, 'not-found');
    case 'hidden':
      throw new HttpError(403, 'hidden');
    case 'no-access':
      throw new HttpError(403, 'no-access');
    case 'locked':
      throw new HttpError(403, 'locked');
    case 'not-editable':
      throw new HttpError(409, 'not-editable');
    case 'journey':
      throw new HttpError(409, 'journey');
  }
}

export function authoringRoutes({ config, db, now, sync }: AuthoringRoutesOptions): Router {
  const router = express.Router();
  const auth = signedIn(config, db, now);
  // Autosave writes on every pause in typing; creating and deleting are rarer.
  const saveLimit = perAccountLimit(120);
  const writeLimit = perAccountLimit(30);
  // The `[[` list asks as the writer types.
  const suggestLimit = perAccountLimit(120);
  const reader = async (req: Parameters<typeof readerOf>[0]): Promise<UserViewer> => asUser((await readerOf(req, { config, db, now })).viewer);
  const idOf = (req: { params: Record<string, unknown> }): string => {
    const id = req.params.id;
    return typeof id === 'string' ? id : '';
  };

  async function editable(viewer: UserViewer, id: string): Promise<EditableDocument> {
    const access = await editAccess(db, viewer, id);
    if (access.kind !== 'ok') refuse(access);
    const { doc, latest } = access;
    const [[space], collections] = await Promise.all([spacesById(db, [doc.spaceId]), listCollectionsOf(db, [doc.spaceId])]);
    if (!space) throw new Error('document without its Space');
    const collection = collections.find((c) => c.id === doc.collectionId);
    return {
      id: doc.id,
      title: doc.title,
      body: bodyOf(latest.markdown),
      type: doc.type,
      lang: doc.lang,
      origin: doc.origin,
      status: doc.status,
      planet: isPlanet(doc.planet) ? doc.planet : null,
      rev: doc.updatedAt.toISOString(),
      version: latest.version,
      savedAt: latest.updatedAt.toISOString(),
      space: { ...spaceBrief(space), kind: space.kind },
      collection: collection ? collectionBrief(collection) : null,
    };
  }

  router.post('/api/documents', auth, writeLimit, async (req, res) => {
    const viewer = await reader(req);
    const body = parseBody(CreateBody, req.body);
    const space = body.space ? await spaceForWriting(db, viewer, body.space) : { kind: 'ok' as const, space: (await ensurePersonalSpace(db, viewer)).space };
    if (space.kind === 'not-found') throw new HttpError(404, 'not-found');
    if (space.kind === 'no-access') throw new HttpError(403, 'no-access');
    const collection = body.collection ? await collectionIn(db, space.space.id, body.collection) : null;
    if (body.collection && !collection) throw new HttpError(400, 'unknown-collection');
    let lang = body.lang;
    if (!lang) {
      const [row] = await db.select({ lang: users.lang }).from(users).where(eq(users.id, viewer.userId));
      lang = row?.lang ?? 'vi';
    }
    const created = await createDocument(
      db,
      viewer,
      { spaceId: space.space.id, collectionId: collection?.id ?? null, title: body.title, body: body.body, type: body.type, lang, planet: body.planet ?? null },
      now(),
    );
    sync?.enqueue([created.id]);
    res.status(201).json(await editable(viewer, created.id));
  });

  router.get('/api/documents/:id/edit', auth, async (req, res) => {
    res.set('Cache-Control', 'no-store').json(await editable(await reader(req), idOf(req)));
  });

  router.put('/api/documents/:id', auth, saveLimit, async (req, res: Response) => {
    const viewer = await reader(req);
    const body = parseBody(SaveBody, req.body);
    const id = idOf(req);
    const saved = await saveDocument(db, viewer, id, { title: body.title, body: body.body, planet: body.planet, baseRev: new Date(body.baseRev), aiMade: body.aiMade, editor: 'text' }, now());
    if (saved.kind === 'stale') {
      res.status(409).json({ error: 'stale', rev: saved.rev.toISOString() });
      return;
    }
    if (saved.kind !== 'saved') refuse(saved);
    if (saved.changed) sync?.enqueue([id]);
    const latest = await editAccess(db, viewer, id);
    const savedAt = latest.kind === 'ok' ? latest.latest.updatedAt : saved.rev;
    const response: SaveResponse = { rev: saved.rev.toISOString(), version: saved.version, savedAt: savedAt.toISOString(), changed: saved.changed };
    res.json(response);
  });

  router.delete('/api/documents/:id', auth, writeLimit, async (req, res) => {
    const viewer = await reader(req);
    const result = await trashDocument(db, viewer, idOf(req), now());
    if (result !== 'ok') refuse({ kind: result });
    sync?.enqueue([idOf(req)]);
    res.status(204).end();
  });

  router.post('/api/documents/:id/restore', auth, writeLimit, async (req, res) => {
    const viewer = await reader(req);
    const result = await restoreFromTrash(db, viewer, idOf(req));
    if (result !== 'ok') refuse({ kind: result });
    sync?.enqueue([idOf(req)]);
    res.status(204).end();
  });

  router.get('/api/documents/:id/links', auth, async (req, res) => {
    const viewer = await reader(req);
    const access = await editAccess(db, viewer, idOf(req));
    // Only the editor asks; a reader has the links in GET /api/documents/:id.
    if (access.kind !== 'ok' && access.kind !== 'locked') refuse(access);
    const { backlinks, outgoing } = await linkedDocumentIds(db, viewer, idOf(req));
    const docs = new Map((await findDocumentsByIds(db, viewer, [...backlinks, ...outgoing])).map((d) => [d.id, d]));
    const summaries = new Map((await summarizeEach(db, viewer, [...docs.values()])).map((s) => [s.id, s]));
    const pick = (ids: string[]): DocumentSummary[] => ids.flatMap((id) => summaries.get(id) ?? []);
    res.set('Cache-Control', 'no-store').json({ backlinks: pick(backlinks), outgoing: pick(outgoing) });
  });

  router.get('/api/link-suggestions', auth, suggestLimit, async (req, res) => {
    const viewer = await reader(req);
    const { q, exclude } = parseQuery(SuggestQuery, req.query);
    const found = await suggestLinkTargets(db, viewer, q, SUGGESTIONS, exclude ?? null);
    const spaces = new Map((await spacesById(db, [...new Set(found.map((d) => d.spaceId))])).map((s) => [s.id, s]));
    const documents: LinkSuggestion[] = found.flatMap(({ spaceId, ...doc }) => {
      const space = spaces.get(spaceId);
      return space ? [{ ...doc, space: spaceBrief(space) }] : [];
    });
    res.set('Cache-Control', 'no-store').json({ documents });
  });

  router.post('/api/me/space', auth, writeLimit, async (req, res) => {
    const { space, created } = await ensurePersonalSpace(db, await reader(req));
    res.status(created ? 201 : 200).json({ space: { ...spaceBrief(space), kind: space.kind, art: space.art }, created });
  });

  router.post('/api/spaces', auth, writeLimit, async (req, res) => {
    const viewer = await reader(req);
    if (!viewer.isAdmin) throw new HttpError(403, 'admin-only');
    const body = parseBody(PublicSpaceBody, req.body);
    const space = await createPublicSpace(db, { ...body, descriptionVi: body.descriptionVi ?? null, descriptionEn: body.descriptionEn ?? null });
    if (!space) throw new HttpError(409, 'slug-taken');
    res.status(201).json({ space: { ...spaceBrief(space), kind: space.kind, art: space.art } });
  });

  router.post('/api/collections', auth, writeLimit, async (req, res) => {
    const viewer = await reader(req);
    const body = parseBody(CollectionBody, req.body);
    const access = await spaceForWriting(db, viewer, body.space);
    if (access.kind === 'not-found') throw new HttpError(404, 'not-found');
    if (access.kind === 'no-access' || !mayAddCollection(viewer, access.space)) throw new HttpError(403, 'no-access');
    const collection = await createCollection(db, access.space, { nameVi: body.nameVi, nameEn: body.nameEn ?? body.nameVi });
    res.status(201).json({ collection: { ...collectionBrief(collection), spaceSlug: access.space.slug } });
  });

  return router;
}
