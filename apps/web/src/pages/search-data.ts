/**
 * Searching as the reader types, for C12 and the ⌘K palette: waits for a pause in typing, then asks for the keyword
 * results and the full search (keyword and meaning) side by side, so the screen can say "Từ khoá xong · Jev đang tìm
 * theo nghĩa…" while Jev works. A newer query makes older answers stale (they are dropped).
 */
import { useCallback, useEffect, useMemo, useState } from 'react';
import { ApiError, NETWORK_ERROR } from '../api/api-client';
import { type SearchParams, type SearchResponse, type SearchResult, searchKnowledge } from '../api/search-api';

/** Quiet time after the last keystroke before searching. */
export const SEARCH_DEBOUNCE_MS = 250;

export type SearchFailure = 'rate-limited' | 'offline' | 'server';

/**
 * - `idle`: nothing typed yet;
 * - `searching`: asked; `keywordDone` once the keyword results are in and only Jev is still working;
 * - `ready`: the answer (it says itself whether Jev or keyword search failed);
 * - `failed`: neither search answered (an error, or both sources off or failed on the server).
 */
export type SearchState =
  | { status: 'idle' }
  | { status: 'searching'; keywordDone: boolean }
  | { status: 'ready'; response: SearchResponse }
  | { status: 'failed'; failure: SearchFailure };

export function failureOf(error: unknown): SearchFailure {
  if (error instanceof ApiError && error.code === 'rate-limited') return 'rate-limited';
  if (error instanceof ApiError && error.code === NETWORK_ERROR) return 'offline';
  return 'server';
}

/** Every result, in the groups' order. */
export function allResults(response: SearchResponse): SearchResult[] {
  return response.groups.flatMap((group) => group.results);
}

/** Neither search ran (both off, failed or not asked): the answer says nothing about what the Universe holds. */
export function unanswered(response: SearchResponse): boolean {
  return response.keyword !== 'ok' && response.meaning !== 'ok';
}

/** The keyword answer standing in for a full search that failed: Jev's part is marked failed. */
function keywordFallback(keyword: SearchResponse): SearchResponse {
  return { ...keyword, meaning: 'failed' };
}

/**
 * The state of the search for `params` (null or a blank query: idle). `retry` asks again for the same search.
 * `debounceMs` 0 searches at once (tests, a submitted query).
 */
export function useSearch(params: SearchParams | null, debounceMs: number = SEARCH_DEBOUNCE_MS): { state: SearchState; retry: () => void } {
  const key = useMemo(() => (params && params.q.trim() ? JSON.stringify(params) : null), [params]);
  const [attempt, setAttempt] = useState(0);
  // What the search of `key` (and attempt) has come to; anything older is stale and reads as searching.
  const [result, setResult] = useState<{ key: string; attempt: number; state: SearchState } | null>(null);

  useEffect(() => {
    if (!key) return undefined;
    const asked = JSON.parse(key) as SearchParams;
    let live = true;
    const settle = (state: SearchState): void => {
      if (live) setResult({ key, attempt, state });
    };
    const controller = new AbortController();
    const timer = window.setTimeout(() => {
      const full = searchKnowledge(asked, controller.signal);
      if (asked.mode === 'keyword') {
        full.then(
          (response) => settle(unanswered(response) ? { status: 'failed', failure: 'server' } : { status: 'ready', response }),
          (error: unknown) => settle({ status: 'failed', failure: failureOf(error) }),
        );
        return;
      }
      const keyword = searchKnowledge({ ...asked, mode: 'keyword' }, controller.signal);
      let keywordAnswer: SearchResponse | null = null;
      let fullDone = false;
      keyword.then(
        (response) => {
          keywordAnswer = response;
          if (!fullDone) settle({ status: 'searching', keywordDone: true });
        },
        () => undefined,
      );
      full.then(
        (response) => {
          fullDone = true;
          settle(unanswered(response) ? { status: 'failed', failure: 'server' } : { status: 'ready', response });
        },
        async (error: unknown) => {
          fullDone = true;
          // The full search failed as a whole (not Jev alone, which the server handles): keep the keyword results.
          const fallback = keywordAnswer ?? (await keyword.catch(() => null));
          settle(fallback ? { status: 'ready', response: keywordFallback(fallback) } : { status: 'failed', failure: failureOf(error) });
        },
      );
    }, debounceMs);
    return () => {
      live = false;
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [key, attempt, debounceMs]);

  const retry = useCallback(() => setAttempt((n) => n + 1), []);
  let state: SearchState = { status: 'idle' };
  if (key) state = result && result.key === key && result.attempt === attempt ? result.state : { status: 'searching', keywordDone: false };
  return { state, retry };
}
