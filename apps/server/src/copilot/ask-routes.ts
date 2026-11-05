/**
 * The Copilot (C14, F02, the C09 panel, C11's AI buttons). Every route needs a session.
 *
 * POST /api/ask `{question, scope: {kind, id?}, task?, selection?}`. Before streaming: 503 `USER_KEYS_DISABLED`,
 * 400 `invalid-body`, 429 `rate-limited` past the per-account AI budget (a question costs 1 of it), 403 `NO_USER_KEY`
 * or `USER_KEY_UNREADABLE` (the active key no longer decrypts; the turn never moves to another key), 404 `not-found`
 * for a scope the viewer cannot see. Then a `text/event-stream` (src/copilot/event-stream.ts):
 * 1. `status {stage: 'searching', jev, found: 0}`;
 * 2. layered search in the scope (keyword, and meaning when Jev is configured), every document through src/access/;
 * 3. one Jev call rates the candidates and says whether they are enough (src/copilot/passages.ts); not enough →
 *    `error {code: 'NO_ANSWER'}` and the user's provider is never called. Jev failing or slow at 2 or 3: the best
 *    keyword passages are used and `jev` is `off` (NO_ANSWER then only when nothing was found);
 * 4. `sources {sources}` and `status {stage: 'writing', jev, found}`, then the user's model streams `delta {text}`
 *    with `[n]` citations (src/copilot/answer-prompt.ts);
 * 5. with Jev on, `check {citations}` (src/copilot/citation-check.ts); with Jev off there is no check;
 * 6. the answer is saved and `done {questionId, provider, model, last4}` ends the stream.
 * A provider refusing the call ends the stream with `error {code, provider, last4}` (src/copilot/provider-failure.ts),
 * the text already streamed kept by the client, and nothing saved; an answer cut by the output cap or a safety stop is
 * such a failure (`PROVIDER_FAILED`). Any other failure ends with `error {code: 'INTERNAL'}`. The browser leaving at
 * any point (even before the stream opens) stops the work: no provider call is started and nothing is saved.
 * Tasks `explain` and `summarize` work on the reader's `selection` and never end in NO_ANSWER.
 *
 * GET /api/copilot/history → `{items: [{id, task, question, scope, createdAt}]}`, newest first (the latest 50).
 * GET /api/copilot/history/:id → the question with its answer, sources (each `available` when the viewer may still
 * read its document; title and names blanked otherwise) and citation checks; 404 `not-found` for another account's.
 */
import express, { type Router } from 'express';
import { and, desc, eq } from 'drizzle-orm';
import { z } from 'zod';
import { findDocument, listSpaces } from '../access/content';
import { isUuid } from '../access/ids';
import { findCollection, findDocumentsByIds, listCollectionsOf } from '../access/reading';
import { type DocumentSearchFilter, MAX_QUERY_LENGTH } from '../access/search';
import type { Viewer } from '../access/viewer';
import { type AccountBudget, signedIn, spendBudget, userIdOf } from '../api/account-limit';
import type { Lang } from '../api/content-views';
import { readerOf } from '../api/request-context';
import { parseBody } from '../api/validate';
import type { ServerConfig } from '../config';
import type { Db } from '../db/client';
import { type CopilotScopeKind, type CopilotSourceRecord, copilotQuestions, copilotTask } from '../db/schema';
import { HttpError } from '../http-error';
import { safeErrorText } from '../log-error';
import type { ProviderBases } from '../llm/providers';
import { ProviderError, streamText } from '../llm/stream-text';
import type { BilingualSummary } from '../search/document-summaries';
import type { JevJudge } from '../jev/jev-client';
import { type Found, layeredSearch } from '../search/layered-search';
import type { MeiliClient } from '../search/meili-client';
import { keyForTurn, ownKeysOn } from '../user-keys/key-routes';
import type { OpenedKey, UserKeyStore } from '../user-keys/key-store';
import { answerPrompt } from './answer-prompt';
import { type CitationCheck, checkCitations } from './citation-check';
import { type EventStream, connectionSignal, openEventStream } from './event-stream';
import { MAX_SOURCES, candidatesOf, choosePassages, guessLanguage, hasAnswer } from './passages';
import { reportProviderFailure } from './provider-failure';

export const MAX_QUESTION_CHARS = 1_000;
export const MAX_SELECTION_CHARS = 4_000;
const HISTORY_ITEMS = 50;

const SCOPE_KINDS = ['universe', 'space', 'collection', 'document'] as const satisfies readonly CopilotScopeKind[];

const AskBody = z
  .strictObject({
    question: z.string().trim().max(MAX_QUESTION_CHARS).optional().default(''),
    scope: z
      .strictObject({ kind: z.enum(SCOPE_KINDS), id: z.string().min(1).max(200).optional() })
      .refine((scope) => scope.kind === 'universe' || scope.id !== undefined),
    task: z.enum(copilotTask.enumValues).optional().default('answer'),
    selection: z.string().trim().max(MAX_SELECTION_CHARS).optional(),
  })
  .refine((body) => (body.task === 'answer' ? body.question.length > 0 : (body.selection ?? '').length > 0));
type AskBody = z.infer<typeof AskBody>;

export type JevState = 'ok' | 'off';

export interface AskRoutesOptions {
  config: ServerConfig;
  db: Db;
  now: () => Date;
  meili: MeiliClient | null;
  jev: JevJudge | null;
  summaries: ReadonlyMap<string, BilingualSummary>;
  keys: UserKeyStore;
  bases: ProviderBases;
  /** Provider calls per minute billed to the user's key, shared with translation. */
  aiBudget: AccountBudget;
}

interface Chosen extends Found {
  n: number;
}

export function askRoutes({ config, db, now, meili, jev, summaries, keys, bases, aiBudget }: AskRoutesOptions): Router {
  const router = express.Router();
  const session = signedIn(config, db, now);
  const searchDeps = { db, meili, jev, summaries };

  /** The search filter of a scope; 404 for one the viewer cannot see. */
  async function scopeFilter(viewer: Viewer, scope: AskBody['scope']): Promise<DocumentSearchFilter> {
    const id = scope.id ?? '';
    switch (scope.kind) {
      case 'universe':
        return {};
      case 'space': {
        const space = (await listSpaces(db, viewer)).find((s) => s.id === id || s.slug === id);
        if (!space) throw new HttpError(404, 'not-found');
        return { spaceIds: [space.id] };
      }
      case 'collection': {
        const collection = await findCollection(db, viewer, id);
        if (!collection) throw new HttpError(404, 'not-found');
        return { spaceIds: [collection.spaceId], collectionIds: [collection.id] };
      }
      case 'document': {
        const doc = await findDocument(db, viewer, id);
        if (!doc) throw new HttpError(404, 'not-found');
        return { spaceIds: [doc.spaceId], documentIds: [doc.id] };
      }
    }
  }

  /** The `sources` event's entries, in the reader's language. */
  async function describe(viewer: Viewer, lang: Lang, chosen: readonly Chosen[]): Promise<CopilotSourceRecord[]> {
    const spaces = new Map((await listSpaces(db, viewer)).map((s) => [s.id, s]));
    const collections = new Map((await listCollectionsOf(db, [...new Set(chosen.map((c) => c.doc.spaceId))])).map((c) => [c.id, c]));
    return chosen.map(({ n, doc, chunk }) => {
      const space = spaces.get(doc.spaceId);
      const collection = doc.collectionId ? collections.get(doc.collectionId) : undefined;
      return {
        n,
        documentId: doc.id,
        anchor: chunk.anchor,
        title: doc.title,
        section: chunk.heading,
        spaceName: space ? (lang === 'en' ? space.nameEn : space.nameVi) : '',
        collectionName: collection ? (lang === 'en' ? collection.nameEn : collection.nameVi) : null,
        origin: doc.origin,
        status: doc.status,
      };
    });
  }

  /** Steps 1–6 on an open stream; returns when the stream should end. */
  async function answer(stream: EventStream, userId: string, key: OpenedKey, viewer: Viewer, lang: Lang, body: AskBody, filter: DocumentSearchFilter): Promise<void> {
    const selection = body.selection ?? null;
    const query = (body.question || selection || '').slice(0, MAX_QUERY_LENGTH);
    stream.send('status', { stage: 'searching', jev: jev ? 'ok' : 'off', found: 0 });

    const search = await layeredSearch(searchDeps, viewer, query, filter, { allVariants: true, meaning: jev !== null });
    let jevState: JevState = search.meaning === 'ok' ? 'ok' : 'off';
    const candidates = candidatesOf(search);
    let passages = candidates.slice(0, MAX_SOURCES);
    let answerable = passages.length > 0;
    let language = guessLanguage(body.question || (selection ?? ''));
    if (jev && jevState === 'ok' && candidates.length > 0) {
      try {
        const choice = await choosePassages(jev, body.question || (selection ?? ''), candidates);
        passages = choice.passages;
        answerable = hasAnswer(choice);
        language = choice.language ?? language;
      } catch (error) {
        console.error('ask: Jev unavailable, keyword passages only', safeErrorText(error));
        jevState = 'off';
      }
    }
    // The KB-coverage judgment gates `answer` only: for `explain` and `summarize` the reader's selection is the material
    // (it comes from a document they are reading), so the model is called whatever Jev found around it.
    if (body.task !== 'answer') answerable = true;
    if (stream.signal.aborted) return;
    if (!answerable) {
      stream.send('error', { code: 'NO_ANSWER' });
      return;
    }

    const chosen: Chosen[] = passages.map((p, i) => ({ ...p, n: i + 1 }));
    const sources = await describe(viewer, lang, chosen);
    stream.send('sources', { sources });
    stream.send('status', { stage: 'writing', jev: jevState, found: sources.length });
    if (stream.signal.aborted) return;

    const promptSources = chosen.map((c) => ({ n: c.n, title: c.doc.title, section: c.chunk.heading, text: c.chunk.text }));
    let text = '';
    try {
      for await (const delta of streamText(bases, key, answerPrompt(body.task, body.question, selection, promptSources, language), 'ask', stream.signal)) {
        text += delta;
        stream.send('delta', { text: delta });
      }
    } catch (error) {
      if (stream.signal.aborted) return;
      if (!(error instanceof ProviderError)) throw error;
      stream.send('error', await reportProviderFailure(keys, userId, key, error));
      return;
    }
    if (stream.signal.aborted) return;

    let citations: CitationCheck[] | null = null;
    if (jev && jevState === 'ok') {
      try {
        citations = await checkCitations(jev, text, promptSources);
        stream.send('check', { citations });
      } catch (error) {
        console.error('ask: citation check skipped, Jev unavailable', safeErrorText(error));
      }
    }

    const [saved] = await db
      .insert(copilotQuestions)
      .values({
        userId,
        task: body.task,
        question: body.question,
        selection,
        scope: { kind: body.scope.kind, id: body.scope.id ?? null },
        answer: text,
        sources,
        citations,
        provider: key.provider,
        model: key.model,
        createdAt: now(),
      })
      .returning({ id: copilotQuestions.id });
    if (!saved) throw new Error('copilot question insert returned nothing');
    stream.send('done', { questionId: saved.id, provider: key.provider, model: key.model, last4: key.last4 });
  }

  router.post('/api/ask', session, ownKeysOn(keys), async (req, res) => {
    const gone = connectionSignal(req, res);
    const userId = userIdOf(res);
    const body = parseBody(AskBody, req.body);
    spendBudget(aiBudget, userId, 1);
    const key = await keyForTurn(keys, userId);
    const { viewer, lang } = await readerOf(req, { config, db, now });
    // An unknown scope is a 404 before the stream opens.
    const filter = await scopeFilter(viewer, body.scope);
    if (gone.aborted) return;
    const stream = openEventStream(res, gone);
    try {
      await answer(stream, userId, key, viewer, lang, body, filter);
    } catch (error) {
      console.error('ask failed', safeErrorText(error));
      stream.send('error', { code: 'INTERNAL' });
    } finally {
      stream.end();
    }
  });

  router.get('/api/copilot/history', session, async (_req, res) => {
    const rows = await db
      .select({ id: copilotQuestions.id, task: copilotQuestions.task, question: copilotQuestions.question, scope: copilotQuestions.scope, createdAt: copilotQuestions.createdAt })
      .from(copilotQuestions)
      .where(eq(copilotQuestions.userId, userIdOf(res)))
      .orderBy(desc(copilotQuestions.createdAt))
      .limit(HISTORY_ITEMS);
    res.set('Cache-Control', 'no-store').json({ items: rows.map((row) => ({ ...row, createdAt: row.createdAt.toISOString() })) });
  });

  router.get('/api/copilot/history/:id', session, async (req, res) => {
    const userId = userIdOf(res);
    const id = req.params.id;
    if (typeof id !== 'string' || !isUuid(id)) throw new HttpError(404, 'not-found');
    const [row] = await db
      .select()
      .from(copilotQuestions)
      .where(and(eq(copilotQuestions.id, id), eq(copilotQuestions.userId, userId)));
    if (!row) throw new HttpError(404, 'not-found');
    const { viewer } = await readerOf(req, { config, db, now });
    const readable = new Set(
      (
        await findDocumentsByIds(
          db,
          viewer,
          row.sources.map((s) => s.documentId),
        )
      ).map((d) => d.id),
    );
    const sources = row.sources.map((s) =>
      readable.has(s.documentId) ? { ...s, available: true } : { ...s, title: '', section: null, spaceName: '', collectionName: null, available: false },
    );
    res.set('Cache-Control', 'no-store').json({
      id: row.id,
      task: row.task,
      question: row.question,
      selection: row.selection,
      scope: row.scope,
      answer: row.answer,
      sources,
      citations: row.citations,
      provider: row.provider,
      model: row.model,
      createdAt: row.createdAt.toISOString(),
    });
  });

  return router;
}
