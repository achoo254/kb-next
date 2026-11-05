/**
 * The `extract_jobs` rows: the queue's state lives in Postgres, so a restart picks up where the server stopped and C16
 * reads the same progress the queue writes.
 */
import { and, asc, eq, inArray, lte, min, or, sql } from 'drizzle-orm';
import type { Db } from '../db/client';
import { EXTRACT_STEPS, type ExtractFixHint, type ExtractStep, type ExtractSuggestions, extractJobs } from '../db/schema';

export type ExtractJobRow = typeof extractJobs.$inferSelect;

/** Every step pending, the upload done: the file is on disk when a job is queued. */
export function initialSteps(): ExtractStep[] {
  return EXTRACT_STEPS.map((step) => ({ step, state: step === 'upload' ? 'done' : 'pending' }));
}

/**
 * Queues (or queues again, with a fresh count of attempts) the extraction of a file; a job already running is left
 * to finish. Returns the job's status after the call.
 */
export async function queueJob(db: Db, fileId: string, now: Date): Promise<ExtractJobRow['status']> {
  const fresh = { status: 'queued' as const, steps: initialSteps(), attempts: 0, errorCode: null, errorHint: null, suggestions: null, nextAttemptAt: null, finishedAt: null, updatedAt: now };
  const [row] = await db
    .insert(extractJobs)
    .values({ fileId, ...fresh, createdAt: now })
    .onConflictDoUpdate({ target: extractJobs.fileId, set: { ...fresh, createdAt: now }, setWhere: sql`${extractJobs.status} <> 'running'` })
    .returning({ status: extractJobs.status });
  if (row) return row.status;
  return 'running';
}

/** Claims the next job due (queued, or waiting whose retry time has come), oldest first: running, one attempt more. */
export async function claimNextJob(db: Db, now: Date): Promise<{ fileId: string; attempts: number } | null> {
  const due = or(eq(extractJobs.status, 'queued'), and(eq(extractJobs.status, 'waiting'), lte(extractJobs.nextAttemptAt, now)));
  const next = db.select({ fileId: extractJobs.fileId }).from(extractJobs).where(due).orderBy(asc(extractJobs.createdAt)).limit(1).for('update', { skipLocked: true });
  const [row] = await db
    .update(extractJobs)
    .set({
      status: 'running',
      steps: initialSteps(),
      attempts: sql`${extractJobs.attempts} + 1`,
      errorCode: null,
      errorHint: null,
      nextAttemptAt: null,
      updatedAt: now,
    })
    .where(and(inArray(extractJobs.fileId, next), due))
    .returning({ fileId: extractJobs.fileId, attempts: extractJobs.attempts });
  return row ?? null;
}

export async function saveSteps(db: Db, fileId: string, steps: readonly ExtractStep[], now: Date): Promise<void> {
  await db
    .update(extractJobs)
    .set({ steps: [...steps], updatedAt: now })
    .where(and(eq(extractJobs.fileId, fileId), eq(extractJobs.status, 'running')));
}

export async function saveSuggestions(db: Db, fileId: string, suggestions: ExtractSuggestions, now: Date): Promise<void> {
  await db.update(extractJobs).set({ suggestions, updatedAt: now }).where(eq(extractJobs.fileId, fileId));
}

export async function finishJob(db: Db, fileId: string, steps: readonly ExtractStep[], now: Date): Promise<void> {
  await db.update(extractJobs).set({ status: 'done', steps: [...steps], updatedAt: now, finishedAt: now }).where(eq(extractJobs.fileId, fileId));
}

/** A failed run: `retryAt` set, the job waits for another attempt; null, it has failed for good. */
export async function failJob(db: Db, fileId: string, steps: readonly ExtractStep[], error: { code: string; hint: ExtractFixHint }, retryAt: Date | null, now: Date): Promise<void> {
  await db
    .update(extractJobs)
    .set({
      status: retryAt ? 'waiting' : 'failed',
      steps: [...steps],
      errorCode: error.code,
      errorHint: error.hint,
      nextAttemptAt: retryAt,
      updatedAt: now,
      finishedAt: retryAt ? null : now,
    })
    .where(eq(extractJobs.fileId, fileId));
}

/** Jobs a stopped server left running go back to the queue (their attempt counts: a file that crashes it gives up). */
export async function requeueInterrupted(db: Db, now: Date): Promise<number> {
  const rows = await db
    .update(extractJobs)
    .set({ status: 'queued', updatedAt: now })
    .where(eq(extractJobs.status, 'running'))
    .returning({ fileId: extractJobs.fileId });
  return rows.length;
}

/** When the earliest waiting job is due; null when none waits. */
export async function nextRetryAt(db: Db): Promise<Date | null> {
  const [row] = await db
    .select({ at: min(extractJobs.nextAttemptAt) })
    .from(extractJobs)
    .where(eq(extractJobs.status, 'waiting'));
  return row?.at ?? null;
}

export async function readJob(db: Db, fileId: string): Promise<ExtractJobRow | null> {
  const [row] = await db.select().from(extractJobs).where(eq(extractJobs.fileId, fileId));
  return row ?? null;
}
