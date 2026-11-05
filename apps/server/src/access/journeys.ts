/**
 * Knowledge journeys (C07 builder, Flow run). A journey is a document of type `journey`: the read rule
 * (visibility.ts), the editing rights (authoring.ts `editRight`) and the review lifecycle (review.ts) are those of
 * every text. Its steps live in `journey_steps`, read only here and only once the journey itself is readable; each
 * account's ticks ("Xong") in `journey_progress`. Saving the steps also redraws the journey's "bước N" relations to
 * the steps' documents, the edges the Graph (C13) draws as "dẫn tới".
 */
import { and, asc, eq, inArray, notInArray, sql } from 'drizzle-orm';
import { alias } from 'drizzle-orm/pg-core';
import { foldTitle } from '../authoring/markdown-text';
import type { Db } from '../db/client';
import { JOURNEY_STEP_KINDS, documents, journeyProgress, journeySteps, links } from '../db/schema';
import { type EditRight, editRight } from './authoring';
import type { DocumentRow } from './content';
import { isUuid } from './ids';
import { documentAccess } from './reading';
import type { Viewer } from './viewer';
import { canRead, visibleTo } from './visibility';

export type JourneyStepKind = (typeof JOURNEY_STEP_KINDS)[number];

export interface JourneyStepRow {
  id: string;
  position: number;
  kind: JourneyStepKind;
  title: string;
  minutes: number;
  documentId: string | null;
  note: string | null;
}

/**
 * A step as a viewer may see it. A step whose document the viewer may not read (someone's private or unpublished
 * text, one in the trash) is `restricted`: its document id is left out, and so is its title when that title is the
 * document's own (copied when the step was added), so a published journey never reveals a text its reader cannot open.
 * The title then is empty: the screen shows a neutral label instead.
 */
export interface VisibleStepRow extends JourneyStepRow {
  restricted: boolean;
}

/** A step as the builder sends it: `id` of a step it already has (its progress stays with it), null for a new one. */
export interface StepInput {
  id: string | null;
  kind: JourneyStepKind;
  title: string;
  minutes: number;
  documentId: string | null;
  note: string | null;
}

/** Most steps a journey holds. */
export const MAX_STEPS = 50;

/**
 * Whether a journey opens for `mode`: `read` (Flow) under the read rule; `edit` (C07) also needs the right to
 * change it (its author while it is a draft or sent back, or an admin). A document of another type is `not-found`.
 */
export type JourneyAccess =
  | { kind: 'ok'; doc: DocumentRow; right: EditRight }
  | { kind: 'not-found' }
  | { kind: 'hidden' }
  | { kind: 'no-access' }
  | { kind: 'locked'; doc: DocumentRow };

export async function journeyAccess(db: Db, viewer: Viewer, id: string, mode: 'read' | 'edit'): Promise<JourneyAccess> {
  const access = await documentAccess(db, viewer, id);
  if (access.kind !== 'ok') return access;
  if (access.doc.type !== 'journey') return { kind: 'not-found' };
  const right = editRight(viewer, access.doc);
  if (mode === 'edit' && right === 'no-access') return { kind: 'no-access' };
  if (mode === 'edit' && right === 'locked') return { kind: 'locked', doc: access.doc };
  return { kind: 'ok', doc: access.doc, right };
}

/**
 * Whether a step's title is (the start of) its document's title: copied when the step was added, cut to one line
 * ("…"), case and diacritics aside. A short label the document's title starts with counts as copied too: hiding one
 * label too many is the safe side.
 */
export function isCopiedTitle(stepTitle: string, documentTitle: string): boolean {
  const step = foldTitle(stepTitle.replace(/…$/u, '')).trim();
  return step.length > 0 && foldTitle(documentTitle).startsWith(step);
}

const stepDocument = alias(documents, 'step_document');

/**
 * The steps of a journey the viewer may read, in order, each as the viewer may see it (VisibleStepRow); empty for a
 * journey they may not read (or an id that is not one).
 */
export async function listSteps(db: Db, viewer: Viewer, journeyId: string): Promise<VisibleStepRow[]> {
  if (!isUuid(journeyId)) return [];
  const rows = await db
    .select({
      id: journeySteps.id,
      position: journeySteps.position,
      kind: journeySteps.kind,
      title: journeySteps.title,
      minutes: journeySteps.minutes,
      documentId: journeySteps.documentId,
      note: journeySteps.note,
      document: {
        title: stepDocument.title,
        status: stepDocument.status,
        hidden: stepDocument.hidden,
        authorId: stepDocument.authorId,
        deletedAt: stepDocument.deletedAt,
      },
    })
    .from(journeySteps)
    .innerJoin(documents, eq(documents.id, journeySteps.journeyId))
    .leftJoin(stepDocument, eq(stepDocument.id, journeySteps.documentId))
    .where(and(eq(journeySteps.journeyId, journeyId), eq(documents.type, 'journey'), visibleTo(viewer)))
    .orderBy(asc(journeySteps.position));
  return rows.map(({ document, ...step }) => {
    const target = document?.title !== undefined && document.title !== null && document.status !== null && document.authorId !== null ? document : null;
    if (step.documentId === null || target === null || canRead(viewer, { status: target.status, hidden: target.hidden ?? false, authorId: target.authorId, deletedAt: target.deletedAt })) {
      return { ...step, restricted: false };
    }
    return { ...step, documentId: null, title: isCopiedTitle(step.title, target.title) ? '' : step.title, restricted: true };
  });
}

/** Relation labels the journey's own steps write ("bước 2", as the seed and the Graph's `leads-to` read them). */
const STEP_LABEL_SQL = '^(bước|step) [0-9]+$';

type Tx = Parameters<Parameters<Db['transaction']>[0]>[0];

/** Redraws the "bước N" relations of a journey: one per step document, numbered by its first step. */
async function writeStepRelations(tx: Tx, journeyId: string, steps: readonly JourneyStepRow[], lang: DocumentRow['lang'], at: Date): Promise<void> {
  await tx.delete(links).where(and(eq(links.sourceId, journeyId), eq(links.kind, 'relation'), sql`${links.label} ~* ${STEP_LABEL_SQL}`));
  const word = lang === 'en' ? 'step' : 'bước';
  const seen = new Set<string>();
  const rows: Array<typeof links.$inferInsert> = [];
  for (const step of steps) {
    if (step.documentId === null || step.documentId === journeyId || seen.has(step.documentId)) continue;
    seen.add(step.documentId);
    rows.push({ sourceId: journeyId, targetId: step.documentId, kind: 'relation', label: `${word} ${step.position + 1}`, createdAt: new Date(at.getTime() + rows.length) });
  }
  // A relation the author drew by hand to the same document stays; the step adds nothing then.
  if (rows.length > 0) await tx.insert(links).values(rows).onConflictDoNothing();
}

/**
 * Replaces the steps of a journey the caller checked the writer may edit (`journeyAccess(…, 'edit')`), and whose
 * documents it checked the writer may read. Steps sent with the id of one of this journey's steps keep that id, and
 * with it everyone's progress on them; other ids count as new steps; steps not sent are deleted. Returns the steps
 * as stored, in order.
 */
export async function writeSteps(db: Db, journey: Pick<DocumentRow, 'id' | 'lang'>, steps: readonly StepInput[], at: Date): Promise<JourneyStepRow[]> {
  return db.transaction(async (tx) => {
    // The journey's row, held for the whole write: two saves of one journey run one after the other.
    await tx.select({ id: documents.id }).from(documents).where(eq(documents.id, journey.id)).for('update');
    const existing = new Set((await tx.select({ id: journeySteps.id }).from(journeySteps).where(eq(journeySteps.journeyId, journey.id))).map((r) => r.id));
    const kept = new Set(steps.flatMap((s) => (s.id !== null && existing.has(s.id) ? [s.id] : [])));
    await tx.delete(journeySteps).where(and(eq(journeySteps.journeyId, journey.id), kept.size > 0 ? notInArray(journeySteps.id, [...kept]) : undefined));
    // Out of the way of the (journey, position) key first: kept steps may swap places.
    if (kept.size > 0) await tx.update(journeySteps).set({ position: sql`-1 - ${journeySteps.position}` }).where(inArray(journeySteps.id, [...kept]));
    const stored: JourneyStepRow[] = [];
    const used = new Set<string>();
    for (const [position, step] of steps.entries()) {
      const values = { position, kind: step.kind, title: step.title, minutes: step.minutes, documentId: step.documentId, note: step.note };
      // The same id twice keeps it for the first step only.
      if (step.id !== null && kept.has(step.id) && !used.has(step.id)) {
        used.add(step.id);
        await tx.update(journeySteps).set(values).where(eq(journeySteps.id, step.id));
        stored.push({ id: step.id, ...values });
      } else {
        const [row] = await tx
          .insert(journeySteps)
          .values({ journeyId: journey.id, ...values })
          .returning({ id: journeySteps.id });
        if (!row) throw new Error('journey step insert returned nothing');
        stored.push({ id: row.id, ...values });
      }
    }
    await writeStepRelations(tx, journey.id, stored, journey.lang, at);
    return stored;
  });
}

/** Steps (of `stepIds`) the account marked done. */
export async function markedSteps(db: Db, userId: string, stepIds: readonly string[]): Promise<Set<string>> {
  const ids = [...new Set(stepIds.filter(isUuid))];
  if (ids.length === 0) return new Set();
  const rows = await db
    .select({ stepId: journeyProgress.stepId })
    .from(journeyProgress)
    .where(and(eq(journeyProgress.userId, userId), inArray(journeyProgress.stepId, ids)));
  return new Set(rows.map((r) => r.stepId));
}

/**
 * Ticks (or unticks) a step of a journey the account may read, for that account only. `not-found` when the step is
 * not one of that journey's.
 */
export async function markStep(db: Db, viewer: Extract<Viewer, { kind: 'user' }>, journeyId: string, stepId: string, done: boolean, at: Date): Promise<'ok' | 'not-found'> {
  if (!isUuid(stepId)) return 'not-found';
  const steps = await listSteps(db, viewer, journeyId);
  if (!steps.some((s) => s.id === stepId)) return 'not-found';
  if (done) {
    await db.insert(journeyProgress).values({ userId: viewer.userId, stepId, doneAt: at }).onConflictDoNothing();
  } else {
    await db.delete(journeyProgress).where(and(eq(journeyProgress.userId, viewer.userId), eq(journeyProgress.stepId, stepId)));
  }
  return 'ok';
}
