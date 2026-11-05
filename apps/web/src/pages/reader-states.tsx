/**
 * What the reader screens share across their layouts (desktop and tablet C11/T02, phone M05) and with the screens
 * that load a text the same way (publish, preview, share, translate): the load's states, the loading and failed
 * panels, and the text an AI button reads.
 */
import type { ReactNode } from 'react';
import { ApiError, NETWORK_ERROR } from '../api/api-client';
import { type DocumentView, readErrorOf } from '../api/content-api';
import { SHELL_PATHS } from '../layout/shell-paths';
import { EmptyState } from '../ui/empty-state';
import { Skeleton } from '../ui/skeleton';
import { ErrorPanel } from './error-screen';
import type { ReaderAi, ReaderTask } from './reader-ai';
import { useReaderText } from './reader-messages';

export type ReaderFailure = 'not-found' | 'no-access' | 'hidden' | 'offline' | 'server';
export type ReaderLoad = { status: 'loading' } | { status: 'ready'; view: DocumentView; loadedAt: number } | { status: 'failed'; error: ReaderFailure };

export function readerLoadError(error: unknown): ReaderFailure {
  const code = readErrorOf(error);
  if (code) return code;
  if (error instanceof ApiError && error.code === NETWORK_ERROR) return 'offline';
  return 'server';
}

export function ReaderLoading(): ReactNode {
  const { t } = useReaderText();
  return (
    <div className="reader-loading" aria-busy="true" aria-label={t('reader.loading')} data-id="reader-loading">
      <Skeleton width="40%" height={22} radius={8} tone="glow" />
      <Skeleton width="70%" height={42} radius={8} tone="glow" />
      <Skeleton width="90%" height={16} radius={8} tone="glow" />
      <Skeleton width="84%" height={16} radius={8} tone="glow" />
      <Skeleton height={120} radius={18} tone="glow" />
      <Skeleton width="92%" height={16} radius={8} tone="glow" />
      <Skeleton width="76%" height={16} radius={8} tone="glow" />
      <Skeleton width="88%" height={16} radius={8} tone="glow" />
    </div>
  );
}

export function ReaderFailed({ error, onRetry }: { error: ReaderFailure; onRetry(): Promise<void> }): ReactNode {
  const { t } = useReaderText();
  if (error === 'hidden') {
    return (
      <EmptyState
        art="vault-lock"
        title={t('reader.hidden.title')}
        description={t('reader.hidden.text')}
        action={{ label: t('reader.hidden.action'), href: SHELL_PATHS.universe }}
        className="reader-state reader-state-hidden"
        dataId="reader-hidden"
      />
    );
  }
  if (error === 'offline') {
    return (
      <EmptyState
        art="planet-offline"
        title={t('reader.offline.title')}
        description={t('reader.offline.text')}
        action={{ label: t('reader.offline.action'), onClick: () => void onRetry() }}
        tone="accent"
        className="reader-state"
        dataId="reader-offline"
      />
    );
  }
  return <ErrorPanel kind={error === 'no-access' ? 'forbidden' : error} onRetry={onRetry} className="reader-error" />;
}

/** The text the side panel's AI buttons read: the current passage, or the whole document. */
export function sideAsk(view: DocumentView, current: string | null, task: ReaderTask, overview: string): Parameters<ReaderAi['ask']>[0] | null {
  const chunks = view.chunks;
  const first = chunks[0];
  if (!first) return null;
  if (task === 'summarize') return { task, about: 'document', anchor: first.anchor, text: chunks.map((chunk) => [chunk.heading, chunk.markdown].filter(Boolean).join('\n\n')).join('\n\n') };
  const chunk = chunks.find((c) => c.anchor === current) ?? chunks.at(-1) ?? first;
  return { task, about: 'passage', anchor: chunk.anchor, text: chunk.markdown, heading: chunk.heading ?? overview };
}

