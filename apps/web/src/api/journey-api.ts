/**
 * The journey API (apps/server/src/api/journey-routes.ts) as typed calls: a journey to run (Flow) or build (C07), its
 * autosave, the account's ticks, Jev's next steps and the documents to pick from.
 *
 * Errors (ApiError.code): `not-found` (404, also a document that is not a journey), `hidden` / `no-access` (403),
 * `stale` (409: a newer save of this journey, from another tab), `unknown-document` / `invalid-body` (400), `jev-off` (503), `jev-failed` (502),
 * `rate-limited` (429), `network` offline.
 */
import * as z from 'zod/mini';
import { getJson } from './api-client';
import { DOCUMENT_ORIGINS, DOCUMENT_STATUSES, DOCUMENT_TYPES, LANGS, SpaceBriefSchema } from './content-api';

export const STEP_KINDS = ['read', 'lab', 'quiz', 'note'] as const;
export type StepKind = (typeof STEP_KINDS)[number];
export const PLANETS = ['violet', 'teal', 'cyan', 'amber', 'emerald', 'pink'] as const;
export type Planet = (typeof PLANETS)[number];
/** As the server holds them (journey-routes.ts). */
export const STEP_TITLE_MAX = 48;
export const STEP_NOTE_MAX = 280;
export const STEP_MINUTES_MAX = 240;
export const MAX_STEPS = 50;

const PoolDocumentSchema = z.object({ id: z.string(), title: z.string(), type: z.enum(DOCUMENT_TYPES), space: SpaceBriefSchema });
export type PoolDocument = z.infer<typeof PoolDocumentSchema>;

const StepDocumentSchema = z.object({ ...PoolDocumentSchema.shape, summary: z.nullable(z.string()) });
export type StepDocument = z.infer<typeof StepDocumentSchema>;

const StepSchema = z.object({
  id: z.string(),
  kind: z.enum(STEP_KINDS),
  /** Empty when it was the title of a document the account may not open (`restricted`): show a neutral label. */
  title: z.string(),
  restricted: z.boolean(),
  minutes: z.number(),
  note: z.nullable(z.string()),
  document: z.nullable(StepDocumentSchema),
  done: z.boolean(),
});
export type JourneyStep = z.infer<typeof StepSchema>;

const JourneySchema = z.object({
  id: z.string(),
  title: z.string(),
  lang: z.enum(LANGS),
  origin: z.enum(DOCUMENT_ORIGINS),
  status: z.enum(DOCUMENT_STATUSES),
  planet: z.nullable(z.enum(PLANETS)),
  rev: z.string(),
  space: z.object({ ...SpaceBriefSchema.shape, kind: z.enum(['public', 'personal']) }),
  mine: z.boolean(),
  editable: z.boolean(),
  steps: z.array(StepSchema),
  jev: z.boolean(),
});
export type Journey = z.infer<typeof JourneySchema>;

const CreatedSchema = z.object({ id: z.string() });
const SavedSchema = z.object({ rev: z.string(), stepIds: z.array(z.string()) });
export type SavedJourney = z.infer<typeof SavedSchema>;
const DoneSchema = z.object({ done: z.boolean() });
const SuggestionsSchema = z.object({ suggestions: z.array(z.object({ ...PoolDocumentSchema.shape, probability: z.number() })) });
export type NextStep = z.infer<typeof SuggestionsSchema>['suggestions'][number];
const PoolSchema = z.object({ documents: z.array(PoolDocumentSchema) });

/** A step as the builder saves it: `id` null for a step the server has not stored yet. */
export interface StepDraft {
  id: string | null;
  kind: StepKind;
  title: string;
  minutes: number;
  documentId: string | null;
  note: string | null;
}

export interface JourneyDraft {
  title: string;
  planet: Planet | null;
  steps: StepDraft[];
}

const path = (id: string, rest = ''): string => `/api/journeys/${encodeURIComponent(id)}${rest}`;

/** A new draft journey: empty, a copy of `from` (Remix), or one step per document (from a Copilot answer). */
export async function createJourney(request: { title?: string; from?: string; documents?: string[] }): Promise<string> {
  return (await getJson(CreatedSchema, '/api/journeys', { method: 'POST', body: JSON.stringify(request) })).id;
}

export function fetchJourney(id: string): Promise<Journey> {
  return getJson(JourneySchema, path(id));
}

export function fetchJourneyForEditing(id: string): Promise<Journey> {
  return getJson(JourneySchema, path(id, '/edit'));
}

/** Saves the whole journey; `keepalive` lets the request outlive the page (leaving it). */
export function saveJourney(id: string, draft: JourneyDraft, baseRev: string, keepalive = false): Promise<SavedJourney> {
  return getJson(SavedSchema, path(id), { method: 'PUT', body: JSON.stringify({ ...draft, baseRev }), keepalive });
}

/** Ticks or unticks a step for the account; the answer is whether it now counts as done. */
export async function markStepDone(id: string, stepId: string, done: boolean): Promise<boolean> {
  return (await getJson(DoneSchema, path(id, `/steps/${encodeURIComponent(stepId)}/progress`), { method: 'PUT', body: JSON.stringify({ done }) })).done;
}

export async function fetchNextSteps(id: string): Promise<NextStep[]> {
  return (await getJson(SuggestionsSchema, path(id, '/suggestions'))).suggestions;
}

export async function fetchStepPool(id: string): Promise<PoolDocument[]> {
  return (await getJson(PoolSchema, path(id, '/pool'))).documents;
}
