/** Loading a C19 panel from the server, and the panel that says it failed. */
import { type ReactNode, useCallback, useEffect, useState } from 'react';
import { ApiError } from '../api/api-client';
import type { ScreenTranslate } from './space-messages';
import type { WorkspaceMessageKey } from './workspace-messages';

type Load<D> = { status: 'loading' } | { status: 'ready'; data: D } | { status: 'failed' };

/** One server read, again on `reload`. */
export function useLoad<D>(read: () => Promise<D>): { load: Load<D>; reload(): void; set(data: D): void } {
  const [load, setLoad] = useState<Load<D>>({ status: 'loading' });
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    let live = true;
    read().then(
      (data) => live && setLoad({ status: 'ready', data }),
      (error: unknown) => {
        if (!(error instanceof ApiError)) console.error('workspace load failed', error);
        if (live) setLoad({ status: 'failed' });
      },
    );
    return () => {
      live = false;
    };
  }, [read, attempt]);
  const reload = useCallback(() => {
    setLoad({ status: 'loading' });
    setAttempt((n) => n + 1);
  }, []);
  const set = useCallback((data: D) => setLoad({ status: 'ready', data }), []);
  return { load, reload, set };
}

export function Failed({ t, onRetry }: { t: ScreenTranslate<WorkspaceMessageKey>; onRetry(): void }): ReactNode {
  return (
    <div className="ws-failed" role="alert">
      {t('ws.failed')}
      <button type="button" className="ws-ghost" onClick={onRetry}>
        {t('ws.retry')}
      </button>
    </div>
  );
}

