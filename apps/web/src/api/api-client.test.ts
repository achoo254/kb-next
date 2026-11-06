import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import * as z from 'zod/mini';
import { answer } from '../test/api-fakes';
import { ApiError, PREFETCH_TTL_MS, apiFetch, clearPrefetched, getJson, prefetchGets } from './api-client';
import { setFavorite } from './authoring-api';

const Item = z.object({ n: z.number() });

let fetchMock: ReturnType<typeof vi.fn<(path: string, init?: RequestInit) => Promise<Response>>>;

beforeEach(() => {
  clearPrefetched();
  let n = 0;
  fetchMock = vi.fn((_path: string, _init?: RequestInit) => {
    n += 1;
    return Promise.resolve(answer(200, { n }));
  });
  vi.stubGlobal('fetch', fetchMock);
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe('answers fetched ahead of time', () => {
  it('serves a prefetched GET to the next plain call of the same path, once', async () => {
    await prefetchGets(() => getJson(Item, '/api/x'));
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(await getJson(Item, '/api/x')).toEqual({ n: 1 });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    // taken: the next call asks again
    expect(await getJson(Item, '/api/x')).toEqual({ n: 2 });
  });

  it('shares a prefetch still on its way and asks only once for the same path', async () => {
    const first = prefetchGets(() => getJson(Item, '/api/x'));
    const second = prefetchGets(() => getJson(Item, '/api/x'));
    const taken = getJson(Item, '/api/x');
    await Promise.all([first, second]);
    expect(await taken).toEqual({ n: 1 });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('asks again once the prefetched answer is too old', async () => {
    vi.useFakeTimers();
    await prefetchGets(() => getJson(Item, '/api/x'));
    vi.advanceTimersByTime(PREFETCH_TTL_MS + 1);
    expect(await getJson(Item, '/api/x')).toEqual({ n: 2 });
  });

  it('forgets every prefetched answer when something changes on the server', async () => {
    await prefetchGets(() => getJson(Item, '/api/x'));
    await apiFetch('/api/x', { method: 'PUT', body: '{}' });
    expect(await getJson(Item, '/api/x')).toEqual({ n: 3 });
  });

  it('forgets the favourites fetched ahead for C08 once the reader stars or unstars a text', async () => {
    await prefetchGets(() => getJson(Item, '/api/me/favorites'));
    await setFavorite('dhcp', false);
    expect(fetchMock.mock.calls[1]?.[1]?.method).toBe('DELETE');
    expect(await getJson(Item, '/api/me/favorites')).toEqual({ n: 3 });
  });

  it('never serves a failed prefetch: the screen asks and gets its own error', async () => {
    fetchMock.mockResolvedValueOnce(answer(500, { error: 'boom' }));
    await prefetchGets(() => getJson(Item, '/api/x'));
    fetchMock.mockResolvedValueOnce(answer(404, { error: 'not-found' }));
    await expect(getJson(Item, '/api/x')).rejects.toEqual(new ApiError(404, 'not-found'));
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('checks a prefetched answer against the schema like any other', async () => {
    fetchMock.mockResolvedValueOnce(answer(200, { n: 'nope' }));
    await prefetchGets(() => getJson(Item, '/api/x'));
    await expect(getJson(Item, '/api/x')).rejects.toMatchObject({ code: 'bad-response' });
  });

  it('leaves calls with options (POST, signals) out of it, and ignores loader errors', async () => {
    await prefetchGets(() => getJson(Item, '/api/x', { method: 'POST', body: '{}' }));
    await prefetchGets(() => {
      throw new Error('broken loader');
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0]?.[1]?.method).toBe('POST');
  });
});
