/**
 * Keeps the search indexes in step with Postgres. A writer commits to Postgres first, then calls `enqueue` with
 * the documents it changed; an in-process queue re-reads them (src/access/index-source.ts) and pushes their
 * chunks to the right index. Failures are logged (error codes only) and retried with back-off; after the last
 * retry the batch is dropped and `pnpm reindex` repairs the drift (the daily `checkDrift` reports it).
 */
import { isUuid } from '../access/ids';
import { countIndexEntries, loadIndexEntries } from '../access/index-source';
import type { Db } from '../db/client';
import { safeErrorText } from '../log-error';
import type { MeiliClient } from './meili-client';
import { INDEX_NAMES, INDEX_SETTINGS, PRIVATE_INDEX, PUBLIC_INDEX, filterValue } from './search-indexes';

const BATCH_SIZE = 100;
export const DEFAULT_RETRY_DELAYS_MS = [1_000, 5_000, 30_000, 120_000, 600_000];

export interface IndexSyncOptions {
  retryDelaysMs?: readonly number[];
  log?: (message: string) => void;
}

export interface DriftReport {
  index: string;
  expected: number;
  actual: number;
}

export async function ensureIndexes(meili: MeiliClient): Promise<void> {
  for (const name of INDEX_NAMES) await meili.ensureIndex(meili.uid(name), INDEX_SETTINGS);
}

export class IndexSync {
  private readonly pending = new Set<string>();
  private running = false;
  private retryTimer: NodeJS.Timeout | null = null;
  private attempt = 0;
  private closed = false;
  private waiters: Array<() => void> = [];
  private readonly retryDelaysMs: readonly number[];
  private readonly log: (message: string) => void;

  constructor(
    private readonly db: Db,
    private readonly meili: MeiliClient,
    options: IndexSyncOptions = {},
  ) {
    this.retryDelaysMs = options.retryDelaysMs ?? DEFAULT_RETRY_DELAYS_MS;
    this.log = options.log ?? ((message) => console.error(message));
  }

  /** Queues documents whose rows or chunks changed (created, edited, status, hidden, deleted). */
  enqueue(documentIds: Iterable<string>): void {
    if (this.closed) return;
    for (const id of documentIds) if (isUuid(id)) this.pending.add(id);
    if (!this.running && !this.retryTimer) queueMicrotask(() => void this.drain());
  }

  /** Resolves once nothing is queued, running or waiting for a retry. */
  idle(): Promise<void> {
    if (this.isIdle()) return Promise.resolve();
    return new Promise((resolve) => this.waiters.push(resolve));
  }

  close(): void {
    this.closed = true;
    if (this.retryTimer) clearTimeout(this.retryTimer);
    this.retryTimer = null;
    this.pending.clear();
    this.notifyIdle();
  }

  private isIdle(): boolean {
    return !this.running && !this.retryTimer && this.pending.size === 0;
  }

  private notifyIdle(): void {
    if (!this.isIdle()) return;
    const waiters = this.waiters;
    this.waiters = [];
    for (const resolve of waiters) resolve();
  }

  private async drain(): Promise<void> {
    if (this.running || this.retryTimer || this.closed) return;
    this.running = true;
    try {
      while (this.pending.size > 0 && !this.closed) {
        const batch = [...this.pending].slice(0, BATCH_SIZE);
        for (const id of batch) this.pending.delete(id);
        try {
          await this.syncDocuments(batch);
          this.attempt = 0;
        } catch (error) {
          const delay = this.retryDelaysMs[this.attempt];
          if (delay === undefined) {
            this.log(`search sync gave up on ${batch.length} document(s), run \`pnpm reindex\`: ${safeErrorText(error)}`);
            this.attempt = 0;
            continue;
          }
          for (const id of batch) this.pending.add(id);
          this.attempt += 1;
          this.log(`search sync failed (retry ${this.attempt} in ${delay} ms): ${safeErrorText(error)}`);
          this.retryTimer = setTimeout(() => {
            this.retryTimer = null;
            void this.drain();
          }, delay);
          this.retryTimer.unref();
          return;
        }
      }
    } finally {
      this.running = false;
      this.notifyIdle();
    }
  }

  /**
   * Upserts the documents' current chunks into the index they belong to, then removes every other chunk of
   * theirs from both indexes (a status change moves them; an edit drops old chunks; a deletion removes all).
   */
  private async syncDocuments(documentIds: string[]): Promise<void> {
    const split = await loadIndexEntries(this.db, documentIds);
    const ofDocuments = `documentId IN [${documentIds.map(filterValue).join(', ')}]`;
    for (const [name, entries] of [
      [PUBLIC_INDEX, split.public],
      [PRIVATE_INDEX, split.private],
    ] as const) {
      const uid = this.meili.uid(name);
      await this.meili.addDocuments(uid, entries);
      const keep = entries.length > 0 ? ` AND id NOT IN [${entries.map((e) => filterValue(e.id)).join(', ')}]` : '';
      await this.meili.deleteDocumentsByFilter(uid, ofDocuments + keep);
    }
  }
}

/** Compares how many chunks each index holds with what Postgres says it should; returns the mismatches. */
export async function checkDrift(db: Db, meili: MeiliClient): Promise<DriftReport[]> {
  const expected = await countIndexEntries(db);
  const reports: DriftReport[] = [];
  for (const [name, count] of [
    [PUBLIC_INDEX, expected.public],
    [PRIVATE_INDEX, expected.private],
  ] as const) {
    const actual = await meili.countDocuments(meili.uid(name));
    if (actual !== count) reports.push({ index: name, expected: count, actual });
  }
  return reports;
}
