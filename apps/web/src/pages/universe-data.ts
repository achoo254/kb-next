import { useCallback, useEffect, useState } from 'react';
import { ApiError, NETWORK_ERROR } from '../api/api-client';
import { type DocumentSummary, type SpaceListItem, fetchRecent, fetchSpaces } from '../api/content-api';

/** How long the skeleton (S04) waits before it offers "Thử lại". */
export const SLOW_LOAD_MS = 1500;

/**
 * What /u shows: the skeleton while the Universe loads (S04); the Universe (C09) as soon as any Space has something
 * to read, whether or not the reader has a Space of their own; the empty Universe (S05) only when no Space has a
 * readable text (none visible at all, or all empty); offline when the API cannot be reached (S05 with
 * `ill-planet-offline`); a load that failed for another reason (the skeleton with "Thử lại").
 */
export type UniverseData =
  | { status: 'loading'; slow: boolean }
  | { status: 'ready'; spaces: readonly SpaceListItem[]; recent: readonly DocumentSummary[] }
  | { status: 'offline' }
  | { status: 'failed' };

export function isNetworkError(error: unknown): boolean {
  return error instanceof ApiError && error.code === NETWORK_ERROR;
}

/**
 * Board S05: nothing to read in the Universe — no Space visible, or none with a readable text yet. A reader without a
 * Space of their own (or with an empty one) still gets the shared Universe (C09): the user chose it on 04/11/2026, so
 * a new account lands on what there is to read. Their own empty corner is "Của tôi" (C08). The Spaces that exist still
 * show (dimmed) with the ways to start.
 */
export function isEmptyUniverse(spaces: readonly SpaceListItem[]): boolean {
  return spaces.every((space) => space.documentCount === 0);
}

function browserOffline(): boolean {
  return typeof navigator !== 'undefined' && navigator.onLine === false;
}

async function loadUniverse(): Promise<{ spaces: SpaceListItem[]; recent: DocumentSummary[] }> {
  const [spaces, recent] = await Promise.all([
    fetchSpaces(),
    // The stage can do without recent texts; only a lost connection fails the whole Universe.
    fetchRecent().catch((error: unknown) => {
      if (isNetworkError(error)) throw error;
      return [];
    }),
  ]);
  return { spaces, recent };
}

/**
 * Loads the Universe and keeps it in step with the connection: offline at start (or a request with no answer) shows
 * the offline state and loads again when the browser is back online. `online` is false while the browser reports no
 * connection, also after the Universe loaded (the screen keeps it and shows the offline banner).
 */
export function useUniverseData(): { data: UniverseData; online: boolean; retry: () => void } {
  const [data, setData] = useState<UniverseData>(() => (browserOffline() ? { status: 'offline' } : { status: 'loading', slow: false }));
  const [online, setOnline] = useState(() => !browserOffline());
  const [attempt, setAttempt] = useState(0);

  // A Universe already on screen stays while it loads again; anything else shows the skeleton (or offline) meanwhile.
  const retry = useCallback(() => {
    const offline = browserOffline();
    setData((current) => (current.status === 'ready' ? current : offline ? { status: 'offline' } : { status: 'loading', slow: false }));
    if (!offline) setAttempt((n) => n + 1);
  }, []);

  useEffect(() => {
    const goOnline = (): void => {
      setOnline(true);
      retry();
    };
    const goOffline = (): void => setOnline(false);
    window.addEventListener('online', goOnline);
    window.addEventListener('offline', goOffline);
    return () => {
      window.removeEventListener('online', goOnline);
      window.removeEventListener('offline', goOffline);
    };
  }, [retry]);

  useEffect(() => {
    // Offline at start: the state already says so, and coming back online calls retry().
    if (browserOffline()) return undefined;
    let live = true;
    const slowTimer = window.setTimeout(() => {
      if (live) setData((current) => (current.status === 'loading' ? { status: 'loading', slow: true } : current));
    }, SLOW_LOAD_MS);
    loadUniverse()
      .then(({ spaces, recent }) => live && setData({ status: 'ready', spaces, recent }))
      .catch((error: unknown) => {
        if (!live) return;
        const offline = isNetworkError(error) || browserOffline();
        // A Universe already on screen stays; the banner says the connection is gone.
        setData((current) => (current.status === 'ready' ? current : offline ? { status: 'offline' } : { status: 'failed' }));
      })
      .finally(() => window.clearTimeout(slowTimer));
    return () => {
      live = false;
      window.clearTimeout(slowTimer);
    };
  }, [attempt]);

  return { data, online, retry };
}
