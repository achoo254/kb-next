/**
 * Search at runtime: the Meilisearch client, the sync queue, index setup at start (retried until Meilisearch
 * answers, so the API starts even when it is down) and the daily drift check between Postgres and the indexes.
 */
import type { MeiliConfig } from '../config';
import type { Db } from '../db/client';
import { safeErrorText } from '../log-error';
import { IndexSync, checkDrift, ensureIndexes } from './index-sync';
import { MeiliClient } from './meili-client';

const SETUP_RETRY_MS = [5_000, 30_000, 120_000, 600_000];
const DRIFT_CHECK_MS = 24 * 60 * 60 * 1000;

export interface SearchService {
  meili: MeiliClient;
  sync: IndexSync;
  close(): void;
}

export function startSearch(db: Db, config: MeiliConfig): SearchService {
  const meili = new MeiliClient(config);
  const sync = new IndexSync(db, meili);
  let setupTimer: NodeJS.Timeout | null = null;
  let closed = false;

  const setup = async (attempt: number): Promise<void> => {
    try {
      await ensureIndexes(meili);
      console.log('search indexes ready');
    } catch (error) {
      if (closed) return;
      const delay = SETUP_RETRY_MS[Math.min(attempt, SETUP_RETRY_MS.length - 1)] ?? 600_000;
      console.error(`search index setup failed (retry in ${delay} ms): ${safeErrorText(error)}`);
      setupTimer = setTimeout(() => void setup(attempt + 1), delay);
      setupTimer.unref();
    }
  };
  void setup(0);

  const driftTimer = setInterval(() => {
    checkDrift(db, meili).then(
      (reports) => {
        for (const r of reports) {
          console.error(`search index drift: ${r.index} holds ${r.actual} chunk(s), Postgres says ${r.expected}; run \`pnpm reindex\``);
        }
      },
      (error: unknown) => console.error('search drift check failed', safeErrorText(error)),
    );
  }, DRIFT_CHECK_MS);
  driftTimer.unref();

  return {
    meili,
    sync,
    close() {
      closed = true;
      if (setupTimer) clearTimeout(setupTimer);
      clearInterval(driftTimer);
      sync.close();
    },
  };
}
