/**
 * Knowledge journeys: the builder (C07, /journey/:id/edit) and the run (Flow, /journey/:id). A journey is a document
 * of type `journey` (src/access/journeys.ts): drafts are their author's, and the author publishes it as any text
 * (C04 → C06). Every route needs a session (401 `sign-in-required`).
 *
 * - POST /api/journeys `{title?, from?, documents?}` → 201 `{id}`: a new draft journey in the account's personal
 *   Space. `from`: a copy of a journey the account may read (Flow "Remix"); `documents`: one step per document, in
 *   order (the Copilot's "Lưu thành lối đi" from an answer's sources). 404 `not-found` / 403 for `from`.
 * - GET /api/journeys/:id → JourneyView, for the run: 404 `not-found` (also a document that is not a journey),
 *   403 `hidden` / `no-access`. Each step says whether the account has done it: ticked "Xong", or its document read
 *   to the end.
 * - GET /api/journeys/:id/edit → JourneyView, for the builder (its author or an admin; 403 `no-access` otherwise).
 * - PUT /api/journeys/:id `{title, planet?, steps, baseRev}` → SavedJourney: the steps as stored (new ones with
 *   their ids), the journey's text rebuilt from them. 409 `{error: 'stale', rev}` after another save; 400
 *   `unknown-document` for a step document the account may not read (or another journey).
 * - PUT /api/journeys/:id/steps/:stepId/progress `{done}` → `{done}`: the account's tick on a step (a step read to
 *   the end stays done).
 * - GET /api/journeys/:id/suggestions → `{suggestions}`: Jev's next steps (503 `jev-off`, 502 `jev-failed`).
 * - GET /api/journeys/:id/pool → `{documents}`: what the builder offers to add ("Chọn từ vũ trụ").
 */
import express, { type Router } from 'express';
import { z } from 'zod';
import { type Planet, createDocument, isPlanet, saveDocument } from '../access/authoring';
import type { DocumentRow } from '../access/content';
import { listDocuments } from '../access/content';
import { firstPassages } from '../access/graph';
import { type JourneyAccess, type JourneyStepKind, MAX_STEPS, type StepInput, type VisibleStepRow, isCopiedTitle, journeyAccess, listSteps, markStep, markedSteps, writeSteps } from '../access/journeys';
import { progressOf } from '../access/participation';
import { findDocumentsByIds, listRecentDocuments, spacesById } from '../access/reading';
import { ensurePersonalSpace } from '../access/spaces-write';
import type { Viewer } from '../access/viewer';
import { PRIVATE_STEP_TITLE, type JourneyTextStep, journeyBody } from '../authoring/journey-text';
import { isPublic } from '../access/visibility';
import { MAX_TITLE_CHARS } from '../authoring/markdown-text';
import { JOURNEY_STEP_KINDS, PLANET_COLOURS } from '../db/schema';
import { HttpError } from '../http-error';
import type { JevJudge } from '../jev/jev-client';
import { suggestNextSteps } from '../jev/next-step';
import { safeErrorText } from '../log-error';
import type { BilingualSummary } from '../search/document-summaries';
import type { IndexSync } from '../search/index-sync';
import { perAccountLimit, signedIn } from './account-limit';
import { type Lang, type SpaceBrief, pickTexts, spaceBrief } from './content-views';
import { summaryOf } from './graph-routes';
import { type RequestContextDeps, readerOf } from './request-context';
import { parseBody } from './validate';

/** A save carries every step (at most MAX_STEPS, each with a short note): above the API's usual 32 kB. */
export const JOURNEY_BODY_LIMIT = '128kb';
/** A step's title is one short line (C07 "Tiêu đề 1 dòng"). */
export const STEP_TITLE_MAX = 48;
export const STEP_NOTE_MAX = 280;
export const STEP_MINUTES_MAX = 240;
/** Documents the builder offers ("Chọn từ vũ trụ"). */
const POOL_SIZE = 40;
/** The estimate a step starts with, by kind (the author changes it). */
const DEFAULT_MINUTES: Record<JourneyStepKind, number> = { read: 5, lab: 10, quiz: 5, note: 3 };

const Uuid = z.uuid();
const OneLine = (max: number) =>
  z
    .string()
    .max(max)
    .refine((text) => !/[\r\n]/.test(text));

const StepBody = z.strictObject({
  id: Uuid.nullable(),
  kind: z.enum(JOURNEY_STEP_KINDS),
  title: OneLine(STEP_TITLE_MAX).transform((t) => t.trim()).pipe(z.string().min(1)),
  minutes: z.number().int().min(1).max(STEP_MINUTES_MAX),
  documentId: Uuid.nullable(),
  note: z
    .string()
    .max(STEP_NOTE_MAX)
    .transform((n) => n.trim() || null)
    .nullable(),
});

const SaveBody = z.strictObject({
  title: OneLine(MAX_TITLE_CHARS),
  planet: z.enum(PLANET_COLOURS).nullable().optional(),
  steps: z.array(StepBody).max(MAX_STEPS),
  baseRev: z.iso.datetime({ offset: true }),
});

const CreateBody = z.strictObject({
  title: OneLine(MAX_TITLE_CHARS).optional(),
  from: Uuid.optional(),
  documents: z.array(Uuid).max(MAX_STEPS).optional(),
});

const ProgressBody = z.strictObject({ done: z.boolean() });

export interface StepDocument {
  id: string;
  title: string;
  type: DocumentRow['type'];
  /** One line on what it is (the run's step card when the step has no note). */
  summary: string | null;
  space: SpaceBrief;
}

export interface JourneyStepView {
  id: string;
  kind: JourneyStepKind;
  /** Empty when it was its document's title and the account may not read that document (`restricted`). */
  title: string;
  /** The step's document is one the account may not open: it is left out, the screen shows a neutral label. */
  restricted: boolean;
  minutes: number;
  note: string | null;
  /** The step's document, when the account may read it (a step keeps its title either way). */
  document: StepDocument | null;
  /** The account ticked it, or read its document to the end. */
  done: boolean;
}

export interface JourneyView {
  id: string;
  title: string;
  lang: Lang;
  origin: DocumentRow['origin'];
  status: DocumentRow['status'];
  /** The cover colour (the story card), one of the planet colours; null: the default. */
  planet: Planet | null;
  /** Send back as `baseRev` with the next save. */
  rev: string;
  space: SpaceBrief & { kind: 'public' | 'personal' };
  /** The account wrote it. */
  mine: boolean;
  /** The account may change it now (its author while it is a draft or sent back, an admin). */
  editable: boolean;
  steps: JourneyStepView[];
  /** Whether Jev can suggest next steps on this server. */
  jev: boolean;
}

export interface SavedJourney {
  rev: string;
  /** The ids of the steps as saved, in the order sent. */
  stepIds: string[];
}

export interface PoolDocument {
  id: string;
  title: string;
  type: DocumentRow['type'];
  space: SpaceBrief;
}

export interface NextStepsResponse {
  suggestions: Array<PoolDocument & { probability: number }>;
}

export interface JourneyRoutesOptions extends RequestContextDeps {
  jev: JevJudge | null;
  summaries: ReadonlyMap<string, BilingualSummary>;
  sync: IndexSync | null;
}

type UserViewer = Extract<Viewer, { kind: 'user' }>;

function asUser(viewer: Viewer): UserViewer {
  if (viewer.kind !== 'user') throw new HttpError(401, 'sign-in-required');
  return viewer;
}

function opened(access: JourneyAccess): Extract<JourneyAccess, { kind: 'ok' }> {
  switch (access.kind) {
    case 'ok':
      return access;
    case 'not-found':
      throw new HttpError(404, 'not-found');
    case 'hidden':
      throw new HttpError(403, 'hidden');
    case 'no-access':
      throw new HttpError(403, 'no-access');
  }
}

function cut(text: string, max: number): string {
  const line = text.replace(/\s+/g, ' ').trim();
  return line.length <= max ? line : `${line.slice(0, max - 1).trimEnd()}…`;
}

const textKey = (doc: DocumentRow): string => doc.translationGroupId ?? doc.id;

export function journeyRoutes({ config, db, now, jev, summaries, sync }: JourneyRoutesOptions): Router {
  const router = express.Router();
  const auth = signedIn(config, db, now);
  // The builder autosaves on every pause; ticks come one by one; each suggestion is a Jev call.
  const saveLimit = perAccountLimit(120);
  const writeLimit = perAccountLimit(30);
  const progressLimit = perAccountLimit(120);
  const suggestLimit = perAccountLimit(12);
  const reader = async (req: Parameters<typeof readerOf>[0]): Promise<{ viewer: UserViewer; lang: Lang }> => {
    const { viewer, lang } = await readerOf(req, { config, db, now });
    return { viewer: asUser(viewer), lang };
  };
  const idOf = (req: { params: Record<string, unknown> }, name = 'id'): string => {
    const value = req.params[name];
    return typeof value === 'string' ? value : '';
  };

  /** The readable documents of `ids`, by id; a journey is never a step's document. */
  async function stepDocuments(viewer: Viewer, ids: readonly string[]): Promise<Map<string, DocumentRow>> {
    const docs = await findDocumentsByIds(db, viewer, ids);
    return new Map(docs.filter((d) => d.type !== 'journey').map((d) => [d.id, d]));
  }

  async function view(viewer: UserViewer, lang: Lang, doc: DocumentRow, editable: boolean): Promise<JourneyView> {
    const steps = await listSteps(db, viewer, doc.id);
    const docIds = steps.flatMap((s) => (s.documentId ? [s.documentId] : []));
    const [docs, passages, marked, reading] = await Promise.all([
      stepDocuments(viewer, docIds),
      firstPassages(db, viewer, docIds),
      markedSteps(
        db,
        viewer.userId,
        steps.map((s) => s.id),
      ),
      progressOf(db, viewer.userId, docIds),
    ]);
    const spaces = new Map((await spacesById(db, [doc.spaceId, ...[...docs.values()].map((d) => d.spaceId)])).map((s) => [s.id, s]));
    const space = spaces.get(doc.spaceId);
    if (!space) throw new Error('journey without its Space');
    const stepView = (step: VisibleStepRow): JourneyStepView => {
      const found = step.documentId ? docs.get(step.documentId) : undefined;
      const foundSpace = found ? spaces.get(found.spaceId) : undefined;
      const read = found ? (reading.get(found.id)?.progress ?? 0) >= 100 : false;
      return {
        id: step.id,
        kind: step.kind,
        title: step.title,
        restricted: step.restricted,
        minutes: step.minutes,
        note: step.note,
        document:
          found && foundSpace
            ? { id: found.id, title: found.title, type: found.type, summary: summaryOf(found, lang, summaries, passages.get(found.id)), space: spaceBrief(foundSpace) }
            : null,
        done: marked.has(step.id) || read,
      };
    };
    return {
      id: doc.id,
      title: doc.title,
      lang: doc.lang,
      origin: doc.origin,
      status: doc.status,
      planet: isPlanet(doc.planet) ? doc.planet : null,
      rev: doc.updatedAt.toISOString(),
      space: { ...spaceBrief(space), kind: space.kind },
      mine: doc.authorId === viewer.userId,
      editable,
      steps: steps.map(stepView),
      jev: jev !== null,
    };
  }

  /**
   * The Space next steps come from: that of the last step whose document the account reads (a journey usually sits in
   * the author's own Space until review places it), else the journey's own.
   */
  function stepSpace(doc: DocumentRow, steps: readonly VisibleStepRow[], docs: ReadonlyMap<string, DocumentRow>): string {
    for (const step of [...steps].reverse()) {
      const found = step.documentId ? docs.get(step.documentId) : undefined;
      if (found) return found.spaceId;
    }
    return doc.spaceId;
  }

  async function poolDocuments(docs: readonly DocumentRow[]): Promise<PoolDocument[]> {
    const spaces = new Map((await spacesById(db, [...new Set(docs.map((d) => d.spaceId))])).map((s) => [s.id, s]));
    return docs.flatMap((d) => {
      const space = spaces.get(d.spaceId);
      return space ? [{ id: d.id, title: d.title, type: d.type, space: spaceBrief(space) }] : [];
    });
  }

  /** The journey's steps, the texts it holds (by text key), and the readable texts of its step Space, in their order. */
  async function stepContext(viewer: UserViewer, doc: DocumentRow): Promise<{ steps: VisibleStepRow[]; held: Set<string>; spaceId: string; inSpace: DocumentRow[] }> {
    const steps = await listSteps(db, viewer, doc.id);
    const docs = await stepDocuments(
      viewer,
      steps.flatMap((s) => (s.documentId ? [s.documentId] : [])),
    );
    const spaceId = stepSpace(doc, steps, docs);
    const inSpace = (await listDocuments(db, viewer, { spaceId })).filter((d) => d.type !== 'journey');
    return { steps, held: new Set([...docs.values()].map(textKey)), spaceId, inSpace };
  }

  /**
   * The journey's text from its steps (`docs`: their documents, as the writer reads them). The text is read by
   * everyone once published: a step whose document is not public says PRIVATE_STEP_TITLE instead of that document's
   * own title.
   */
  function publicText(steps: readonly StepInput[], docs: ReadonlyMap<string, DocumentRow>, lang: Lang): string {
    const shown = steps.map((step): JourneyTextStep => {
      const found = step.documentId ? docs.get(step.documentId) : undefined;
      const hide = found !== undefined && !isPublic(found) && isCopiedTitle(step.title, found.title);
      return { ...step, title: hide ? PRIVATE_STEP_TITLE[lang] : step.title };
    });
    return journeyBody(shown, lang);
  }

  /** Creates a draft journey with these steps (their documents in `docs`) and its text. */
  async function createJourney(viewer: UserViewer, title: string, lang: Lang, steps: readonly StepInput[], docs: ReadonlyMap<string, DocumentRow>): Promise<string> {
    const { space } = await ensurePersonalSpace(db, viewer);
    const at = now();
    const created = await createDocument(db, viewer, { spaceId: space.id, collectionId: null, title, body: publicText(steps, docs, lang), type: 'journey', lang, planet: null }, at);
    if (steps.length > 0) await writeSteps(db, { id: created.id, lang }, steps, at);
    sync?.enqueue([created.id]);
    return created.id;
  }

  router.post('/api/journeys', auth, writeLimit, async (req, res) => {
    const { viewer, lang } = await reader(req);
    const body = parseBody(CreateBody, req.body);
    if (body.from) {
      const source = opened(await journeyAccess(db, viewer, body.from, 'read'));
      const steps = await listSteps(db, viewer, source.doc.id);
      const docs = await stepDocuments(
        viewer,
        steps.flatMap((s) => (s.documentId ? [s.documentId] : [])),
      );
      // A step the account may not open is copied without its document, under a neutral title when it had the document's.
      const copied = steps.map(
        (s): StepInput => ({
          id: null,
          kind: s.kind,
          title: s.title || PRIVATE_STEP_TITLE[source.doc.lang],
          minutes: s.minutes,
          documentId: s.documentId && docs.has(s.documentId) ? s.documentId : null,
          note: s.note,
        }),
      );
      res.status(201).json({ id: await createJourney(viewer, body.title ?? source.doc.title, source.doc.lang, copied, docs) });
      return;
    }
    const wanted = [...new Set(body.documents ?? [])];
    const docs = await stepDocuments(viewer, wanted);
    const steps = wanted.flatMap((id): StepInput[] => {
      const doc = docs.get(id);
      if (!doc) return [];
      const kind: JourneyStepKind = doc.type === 'lab' ? 'lab' : 'read';
      return [{ id: null, kind, title: cut(doc.title, STEP_TITLE_MAX), minutes: DEFAULT_MINUTES[kind], documentId: doc.id, note: null }];
    });
    res.status(201).json({ id: await createJourney(viewer, cut(body.title ?? '', MAX_TITLE_CHARS), lang, steps, docs) });
  });

  router.get('/api/journeys/:id', auth, async (req, res) => {
    const { viewer, lang } = await reader(req);
    const { doc, right } = opened(await journeyAccess(db, viewer, idOf(req), 'read'));
    res.set('Cache-Control', 'no-store').json(await view(viewer, lang, doc, right === 'ok'));
  });

  router.get('/api/journeys/:id/edit', auth, async (req, res) => {
    const { viewer, lang } = await reader(req);
    const { doc } = opened(await journeyAccess(db, viewer, idOf(req), 'edit'));
    res.set('Cache-Control', 'no-store').json(await view(viewer, lang, doc, true));
  });

  router.put('/api/journeys/:id', auth, saveLimit, async (req, res) => {
    const { viewer } = await reader(req);
    const body = parseBody(SaveBody, req.body);
    const { doc } = opened(await journeyAccess(db, viewer, idOf(req), 'edit'));
    const docIds = [...new Set(body.steps.flatMap((s) => (s.documentId ? [s.documentId] : [])))];
    const docs = await stepDocuments(viewer, docIds);
    if (docIds.some((id) => !docs.has(id))) throw new HttpError(400, 'unknown-document');
    // A note step reads no document.
    const steps: StepInput[] = body.steps.map((s) => ({ ...s, documentId: s.kind === 'note' ? null : s.documentId }));
    const at = now();
    const saved = await saveDocument(db, viewer, doc.id, { title: body.title, body: publicText(steps, docs, doc.lang), planet: body.planet, baseRev: new Date(body.baseRev), editor: 'journey' }, at);
    if (saved.kind === 'stale') {
      res.status(409).json({ error: 'stale', rev: saved.rev.toISOString() });
      return;
    }
    if (saved.kind === 'no-access') throw new HttpError(403, 'no-access');
    if (saved.kind !== 'saved') throw new HttpError(404, 'not-found');
    const stored = await writeSteps(db, doc, steps, at);
    if (saved.changed) sync?.enqueue([doc.id]);
    const response: SavedJourney = { rev: saved.rev.toISOString(), stepIds: stored.map((s) => s.id) };
    res.json(response);
  });

  router.put('/api/journeys/:id/steps/:stepId/progress', auth, progressLimit, async (req, res) => {
    const { viewer } = await reader(req);
    const { done } = parseBody(ProgressBody, req.body);
    const { doc } = opened(await journeyAccess(db, viewer, idOf(req), 'read'));
    const stepId = idOf(req, 'stepId');
    if ((await markStep(db, viewer, doc.id, stepId, done, now())) === 'not-found') throw new HttpError(404, 'not-found');
    if (done) {
      res.json({ done: true });
      return;
    }
    // Unticked, a step whose document was read to the end is still done.
    const step = (await listSteps(db, viewer, doc.id)).find((s) => s.id === stepId);
    const docId = step?.documentId;
    const readable = docId ? (await stepDocuments(viewer, [docId])).has(docId) : false;
    const read = docId && readable ? ((await progressOf(db, viewer.userId, [docId])).get(docId)?.progress ?? 0) >= 100 : false;
    res.json({ done: read });
  });

  router.get('/api/journeys/:id/suggestions', auth, suggestLimit, async (req, res) => {
    const { viewer, lang } = await reader(req);
    const { doc } = opened(await journeyAccess(db, viewer, idOf(req), 'edit'));
    if (!jev) throw new HttpError(503, 'jev-off');
    const { steps, held, inSpace } = await stepContext(viewer, doc);
    const fresh = pickTexts(
      inSpace.filter((d) => !held.has(textKey(d))),
      lang,
    ).map((p) => p.doc);
    const passages = await firstPassages(
      db,
      viewer,
      fresh.map((d) => d.id),
    );
    let picked: Awaited<ReturnType<typeof suggestNextSteps>>;
    try {
      picked = await suggestNextSteps(
        jev,
        { title: doc.title, steps: steps.map((s) => s.title) },
        fresh.map((d) => ({ id: d.id, title: d.title, text: summaryOf(d, lang, summaries, passages.get(d.id)) ?? '' })),
      );
    } catch (error) {
      console.warn('journey suggestions unavailable', safeErrorText(error));
      throw new HttpError(502, 'jev-failed');
    }
    const byId = new Map(fresh.map((d) => [d.id, d]));
    const chosen = picked.flatMap((p) => {
      const found = byId.get(p.id);
      return found ? [{ doc: found, probability: p.probability }] : [];
    });
    const pool = new Map((await poolDocuments(chosen.map((c) => c.doc))).map((p) => [p.id, p]));
    const body: NextStepsResponse = {
      suggestions: chosen.flatMap((c) => {
        const entry = pool.get(c.doc.id);
        return entry ? [{ ...entry, probability: c.probability }] : [];
      }),
    };
    res.set('Cache-Control', 'no-store').json(body);
  });

  router.get('/api/journeys/:id/pool', auth, async (req, res) => {
    const { viewer, lang } = await reader(req);
    const { doc } = opened(await journeyAccess(db, viewer, idOf(req), 'edit'));
    const { spaceId, inSpace } = await stepContext(viewer, doc);
    // The step Space's texts first (those already in the journey too: the builder shows them as used), then the
    // latest readable texts elsewhere.
    const recent = (await listRecentDocuments(db, viewer, POOL_SIZE)).filter((d) => d.type !== 'journey' && d.spaceId !== spaceId);
    const texts = pickTexts([...inSpace, ...recent], lang)
      .map((p) => p.doc)
      .slice(0, POOL_SIZE);
    res.set('Cache-Control', 'no-store').json({ documents: await poolDocuments(texts) });
  });

  return router;
}
