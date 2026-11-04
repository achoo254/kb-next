/**
 * The few Meilisearch calls kb makes, over plain fetch with a timeout. Answers are validated before use. Errors
 * carry Meilisearch's error code and the HTTP status only: its messages can quote filters and document text.
 */
import { z } from 'zod';
import type { MeiliConfig } from '../config';

const REQUEST_TIMEOUT_MS = 10_000;
const TASK_POLL_MS = 50;
const TASK_TIMEOUT_MS = 120_000;

export class MeiliError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
  ) {
    super(`Meilisearch ${code} (${status})`);
    this.name = 'MeiliError';
  }
}

export interface IndexSettings {
  searchableAttributes: string[];
  filterableAttributes: string[];
  typoTolerance: { disableOnAttributes: string[] };
}

export interface FederatedQuery {
  indexUid: string;
  q: string;
  filter?: string;
  attributesToSearchOn: string[];
}

const ErrorBody = z.object({ code: z.string() });
const Enqueued = z.object({ taskUid: z.number().int() });
const Task = z.object({
  status: z.enum(['enqueued', 'processing', 'succeeded', 'failed', 'canceled']),
  error: z.object({ code: z.string() }).nullish(),
});
const Stats = z.object({ numberOfDocuments: z.number().int() });
const FederatedHits = z.object({ hits: z.array(z.record(z.string(), z.unknown())) });

export class MeiliClient {
  constructor(private readonly config: MeiliConfig) {}

  /** Full uid of a kb index (`kb_public`, `kb_private`) with this deployment's prefix. */
  uid(name: string): string {
    return `${this.config.indexPrefix}${name}`;
  }

  private async request(method: string, path: string, body?: unknown): Promise<unknown> {
    let res: Response;
    try {
      res = await fetch(`${this.config.url}${path}`, {
        method,
        headers: { authorization: `Bearer ${this.config.apiKey}`, ...(body === undefined ? {} : { 'content-type': 'application/json' }) },
        body: body === undefined ? undefined : JSON.stringify(body),
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      });
    } catch (error) {
      // Connection refused, DNS, timeout: no response to read a code from.
      throw new MeiliError(0, error instanceof Error && error.name === 'TimeoutError' ? 'timeout' : 'unreachable');
    }
    const text = await res.text();
    let json: unknown;
    try {
      json = text ? JSON.parse(text) : null;
    } catch {
      throw new MeiliError(res.status, 'invalid_response');
    }
    if (!res.ok) {
      const parsed = ErrorBody.safeParse(json);
      throw new MeiliError(res.status, parsed.success ? parsed.data.code : 'http_error');
    }
    return json;
  }

  /** Waits for a queued task; a failed or canceled one throws with its error code. */
  async waitForTask(taskUid: number): Promise<void> {
    const deadline = Date.now() + TASK_TIMEOUT_MS;
    for (;;) {
      const task = Task.parse(await this.request('GET', `/tasks/${taskUid}`));
      if (task.status === 'succeeded') return;
      if (task.status === 'failed' || task.status === 'canceled') throw new MeiliError(200, task.error?.code ?? `task_${task.status}`);
      if (Date.now() > deadline) throw new MeiliError(0, 'task_timeout');
      await new Promise((resolve) => setTimeout(resolve, TASK_POLL_MS));
    }
  }

  private async run(method: string, path: string, body?: unknown): Promise<void> {
    const { taskUid } = Enqueued.parse(await this.request(method, path, body));
    await this.waitForTask(taskUid);
  }

  async isHealthy(): Promise<boolean> {
    try {
      await this.request('GET', '/health');
      return true;
    } catch {
      return false;
    }
  }

  private async indexExists(uid: string): Promise<boolean> {
    try {
      await this.request('GET', `/indexes/${encodeURIComponent(uid)}`);
      return true;
    } catch (error) {
      if (error instanceof MeiliError && error.code === 'index_not_found') return false;
      throw error;
    }
  }

  /** Creates the index when missing (an existing one is kept) and applies `settings`. */
  async ensureIndex(uid: string, settings: IndexSettings): Promise<void> {
    if (!(await this.indexExists(uid))) {
      try {
        await this.run('POST', '/indexes', { uid, primaryKey: 'id' });
      } catch (error) {
        // Created meanwhile by another process (the server and `pnpm reindex`): fine.
        if (!(error instanceof MeiliError && error.code === 'index_already_exists')) throw error;
      }
    }
    await this.run('PATCH', `/indexes/${encodeURIComponent(uid)}/settings`, settings);
  }

  /** Deletes the index; a missing one is fine. */
  async deleteIndex(uid: string): Promise<void> {
    if (await this.indexExists(uid)) await this.run('DELETE', `/indexes/${encodeURIComponent(uid)}`);
  }

  async addDocuments(uid: string, docs: readonly object[]): Promise<void> {
    if (docs.length === 0) return;
    await this.run('POST', `/indexes/${encodeURIComponent(uid)}/documents`, docs);
  }

  async deleteDocumentsByFilter(uid: string, filter: string): Promise<void> {
    await this.run('POST', `/indexes/${encodeURIComponent(uid)}/documents/delete`, { filter });
  }

  /** Swaps the contents of each pair of indexes in one step. */
  async swapIndexes(pairs: ReadonlyArray<readonly [string, string]>): Promise<void> {
    await this.run(
      'POST',
      '/swap-indexes',
      pairs.map((indexes) => ({ indexes })),
    );
  }

  async countDocuments(uid: string): Promise<number> {
    return Stats.parse(await this.request('GET', `/indexes/${encodeURIComponent(uid)}/stats`)).numberOfDocuments;
  }

  /** One ranked list over several indexes. Callers outside src/access/ must not use it (no-bypass test). */
  async federatedSearch(queries: readonly FederatedQuery[], limit: number): Promise<Array<Record<string, unknown>>> {
    const body = { federation: { limit }, queries };
    return FederatedHits.parse(await this.request('POST', '/multi-search', body)).hits;
  }
}
