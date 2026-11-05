/**
 * The daily housekeeping of review: "Tài liệu có thể lỗi thời" (C20), every author whose approved text has gone
 * STALE_DAYS without a change is told, once per change of that text; and the admin API's call log forgets calls older
 * than 30 days. The server runs it at start and then daily, like the trash purge.
 */
import { listStaleDocuments } from '../access/review';
import { pruneCalls } from '../admin/admin-tokens';
import type { Db } from '../db/client';
import { safeErrorText } from '../log-error';
import { notify } from './notification-store';

/** Days without a change after which an approved text may be out of date (chốt 04/11/2026). */
export const STALE_DAYS = 180;
export const STALE_CHECK_INTERVAL_MS = 24 * 60 * 60 * 1000;

/** One run: notifies the authors of the texts that turned stale since the last run; how many were told. */
export async function runStaleCheck(db: Db, now: Date): Promise<number> {
  const stale = await listStaleDocuments(db, now, STALE_DAYS);
  await notify(
    db,
    stale.map((doc) => ({
      userId: doc.authorId,
      documentId: doc.id,
      payload: { kind: 'stale' as const, title: doc.title, days: Math.floor((now.getTime() - doc.updatedAt.getTime()) / (24 * 60 * 60 * 1000)) },
    })),
    now,
  );
  return stale.length;
}

export interface StaleCheckJob {
  /** The run in progress (or the last one), for tests and shutdown. */
  readonly running: Promise<void>;
  stop(): void;
}

/** Runs the check now and then every STALE_CHECK_INTERVAL_MS; a failed run is logged and the next one tries again. */
export function startStaleCheck(db: Db, now: () => Date = () => new Date()): StaleCheckJob {
  const run = async (): Promise<void> => {
    try {
      const told = await runStaleCheck(db, now());
      if (told > 0) console.log(`stale check: told the authors of ${told} text(s) unchanged for ${STALE_DAYS} days`);
    } catch (error) {
      console.error('stale check failed', safeErrorText(error));
    }
    try {
      const pruned = await pruneCalls(db, now());
      if (pruned > 0) console.log(`admin call log: forgot ${pruned} call(s) older than 30 days`);
    } catch (error) {
      console.error('admin call log prune failed', safeErrorText(error));
    }
  };
  const job = { running: run() };
  const timer = setInterval(() => {
    job.running = run();
  }, STALE_CHECK_INTERVAL_MS);
  timer.unref();
  return {
    get running() {
      return job.running;
    },
    stop() {
      clearInterval(timer);
    },
  };
}
