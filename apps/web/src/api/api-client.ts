/** JSON calls to the app's own API (same origin; the session cookie goes along). */
import type * as z from 'zod/mini';

export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
  ) {
    super(code);
    this.name = 'ApiError';
  }
}

async function errorCode(res: Response): Promise<string> {
  try {
    const body: unknown = await res.json();
    if (typeof body === 'object' && body !== null && 'error' in body && typeof body.error === 'string') return body.error;
  } catch {
    // Not JSON (a proxy error page): fall through.
  }
  return `http-${res.status}`;
}

/** The code of a request that never got an answer (offline, DNS, connection reset). */
export const NETWORK_ERROR = 'network';
/** The code of an answer that is not what the API documents. */
export const BAD_RESPONSE = 'bad-response';

export async function apiFetch(path: string, init: RequestInit = {}): Promise<Response> {
  const headers = new Headers(init.headers);
  if (init.body !== undefined) headers.set('Content-Type', 'application/json');
  // A change on the server makes every answer fetched ahead of it stale: forgotten before and after it.
  const changes = (init.method ?? 'GET').toUpperCase() !== 'GET';
  if (changes) clearPrefetched();
  let res: Response;
  try {
    res = await fetch(path, { ...init, headers, credentials: 'same-origin' });
  } catch {
    throw new ApiError(0, NETWORK_ERROR);
  } finally {
    if (changes) clearPrefetched();
  }
  if (!res.ok) throw new ApiError(res.status, await errorCode(res));
  return res;
}

/**
 * Plain GET answers fetched ahead of time (a link is hovered, a navigation is waiting for its screen): the next plain
 * `getJson` of the same path takes the answer instead of asking again, once. An answer older than PREFETCH_TTL_MS is
 * asked again; a failed one (null) is never used, the screen asks itself and handles the error as always.
 */
interface Prefetched {
  at: number;
  answer: Promise<{ status: number; body: unknown } | null>;
}

export const PREFETCH_TTL_MS = 10_000;
/** At most this many answers wait; the oldest goes first. */
const PREFETCH_MAX = 24;
const prefetched = new Map<string, Prefetched>();
/** > 0 while `prefetchGets` runs its loader: the plain GETs it starts fill the cache. */
let prefetchDepth = 0;

function now(): number {
  return typeof performance !== 'undefined' ? performance.now() : Date.now();
}

function freshEntry(path: string): Prefetched | undefined {
  const entry = prefetched.get(path);
  if (entry && now() - entry.at > PREFETCH_TTL_MS) {
    prefetched.delete(path);
    return undefined;
  }
  return entry;
}

function startPrefetch(path: string): Prefetched {
  const existing = freshEntry(path);
  if (existing) return existing;
  const answer = fetch(path, { credentials: 'same-origin' }).then(
    async (res) => (res.ok ? { status: res.status, body: (await res.json().catch(() => undefined)) as unknown } : null),
    () => null,
  );
  const entry: Prefetched = { at: now(), answer };
  prefetched.set(path, entry);
  while (prefetched.size > PREFETCH_MAX) {
    const oldest = prefetched.keys().next().value;
    if (oldest === undefined) break;
    prefetched.delete(oldest);
  }
  return entry;
}

function takePrefetched(path: string): Prefetched | undefined {
  const entry = freshEntry(path);
  if (entry) prefetched.delete(path);
  return entry;
}

/**
 * Runs `load` (calls of the screen's own API functions) so that its plain GETs only warm the cache: the screen that
 * mounts next gets those answers without a second request. Errors are ignored; resolves once the answers are in.
 */
export function prefetchGets(load: () => Promise<unknown>): Promise<void> {
  prefetchDepth += 1;
  let work: Promise<unknown>;
  try {
    work = load();
  } catch {
    work = Promise.resolve();
  } finally {
    prefetchDepth -= 1;
  }
  return work.then(
    () => undefined,
    () => undefined,
  );
}

/** Forgets every prefetched answer (tests). */
export function clearPrefetched(): void {
  prefetched.clear();
}

function parsed<T>(schema: z.ZodMiniType<T>, status: number, body: unknown): T {
  const result = schema.safeParse(body);
  if (!result.success) throw new ApiError(status, BAD_RESPONSE);
  return result.data;
}

/** The answer of `path` checked against `schema`; a mismatch throws ApiError(BAD_RESPONSE). */
export async function getJson<T>(schema: z.ZodMiniType<T>, path: string, init?: RequestInit): Promise<T> {
  if (init === undefined) {
    // Read before the first await: prefetchGets only counts the calls its loader makes synchronously.
    if (prefetchDepth > 0) {
      const hit = await startPrefetch(path).answer;
      if (!hit) throw new ApiError(0, NETWORK_ERROR);
      return parsed(schema, hit.status, hit.body);
    }
    const entry = takePrefetched(path);
    const hit = entry ? await entry.answer : null;
    if (hit) return parsed(schema, hit.status, hit.body);
  }
  const res = await apiFetch(path, init);
  return parsed(schema, res.status, await res.json().catch(() => undefined));
}
