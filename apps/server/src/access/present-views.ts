/**
 * Viewings of a text's slides (C21): one row each, with how far it went and of how many slides; nothing about the
 * viewer. Recorded after the reader's access check (src/api/present-routes.ts); counted for the admin API
 * (GET /api/admin/stats/present); forgotten after PRESENT_VIEWS_KEEP_DAYS by the hourly housekeeping.
 */
import { count, desc, eq, gte, lt, sql } from 'drizzle-orm';
import type { Db } from '../db/client';
import { documents, presentViews } from '../db/schema';
import { PRESENT_VIEWS_KEEP_DAYS } from '../retention';

const DAY_MS = 24 * 60 * 60 * 1000;
/** The largest deck a viewing may claim (present-slides.ts MAX_SLIDES on the web). */
export const MAX_PRESENT_SLIDES = 1000;
/** The texts the admin stats list, most opened first. */
export const PRESENT_STATS_TEXTS = 50;

export async function recordPresentView(db: Db, documentId: string, view: { furthest: number; total: number }, now: Date): Promise<void> {
  await db.insert(presentViews).values({ documentId, furthest: view.furthest, total: view.total, viewedAt: now });
}

/** Forgets viewings older than PRESENT_VIEWS_KEEP_DAYS (the hourly housekeeping); how many. */
export async function prunePresentViews(db: Db, now: Date): Promise<number> {
  const rows = await db
    .delete(presentViews)
    .where(lt(presentViews.viewedAt, new Date(now.getTime() - PRESENT_VIEWS_KEEP_DAYS * DAY_MS)))
    .returning({ id: presentViews.id });
  return rows.length;
}

export interface PresentStats {
  days: number;
  /** Viewings in the period. */
  opened: number;
  /** Of them, those that reached the last slide. */
  finished: number;
  byDocument: Array<{ id: string; title: string; lang: 'vi' | 'en'; opened: number; finished: number }>;
}

/** Viewings of the last `days` days (admin API only: every text counts, whoever may read it). */
export async function presentStats(db: Db, days: number, now: Date): Promise<PresentStats> {
  const since = new Date(now.getTime() - days * DAY_MS);
  const finishedCount = sql<number>`count(*) filter (where ${presentViews.furthest} = ${presentViews.total})`.mapWith(Number);
  const [totals] = await db.select({ opened: count(), finished: finishedCount }).from(presentViews).where(gte(presentViews.viewedAt, since));
  const opened = count();
  const rows = await db
    .select({ id: documents.id, title: documents.title, lang: documents.lang, opened, finished: finishedCount })
    .from(presentViews)
    .innerJoin(documents, eq(documents.id, presentViews.documentId))
    .where(gte(presentViews.viewedAt, since))
    .groupBy(documents.id, documents.title, documents.lang)
    .orderBy(desc(opened), documents.title)
    .limit(PRESENT_STATS_TEXTS);
  return { days, opened: totals?.opened ?? 0, finished: totals?.finished ?? 0, byDocument: rows };
}
