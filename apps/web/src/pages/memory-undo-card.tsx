/**
 * The card at the top of /memory when the address carries `?undo=<token>` (the "Hoàn tác" link of a save in Chat).
 * Opening the page never undoes anything: only the button posts the token, then the card says how it went.
 */
import { type ReactNode, useState } from 'react';
import { ApiError } from '../api/api-client';
import { undoMemory } from '../api/memory-api';
import { Button } from '../ui/button';
import { RimPanel } from '../ui/rim-panel';
import type { MemoryMessageKey, MemoryTranslate } from './memory-messages';

/** The query parameter of an undo link. */
export const UNDO_PARAM = 'undo';

const UNDO_ERRORS: Readonly<Record<string, MemoryMessageKey>> = {
  'undo-invalid': 'memory.undo.invalid',
  'undo-expired': 'memory.undo.expired',
  'undo-used': 'memory.undo.used',
  'undo-stale': 'memory.undo.stale',
  'not-found': 'memory.undo.notFound',
};

/** The friendly line of a failed undo; an unknown failure (offline, server error) may be tried again. */
export function undoFailure(error: unknown): { key: MemoryMessageKey; retry: boolean } {
  const known = error instanceof ApiError ? UNDO_ERRORS[error.code] : undefined;
  return known ? { key: known, retry: false } : { key: 'memory.undo.failed', retry: true };
}

type UndoState = { status: 'idle' } | { status: 'working' } | { status: 'done'; key: MemoryMessageKey; ok: boolean; retry: boolean };

interface MemoryUndoCardProps {
  token: string;
  t: MemoryTranslate;
  /** After a successful undo: the list changed. */
  onUndone(): void;
}

export function MemoryUndoCard({ token, t, onUndone }: MemoryUndoCardProps): ReactNode {
  const [state, setState] = useState<UndoState>({ status: 'idle' });
  const [closed, setClosed] = useState(false);
  if (closed) return null;

  const undo = (): void => {
    setState({ status: 'working' });
    undoMemory(token).then(
      (result) => {
        setState({ status: 'done', key: result.action === 'trashed' ? 'memory.undo.trashed' : 'memory.undo.reverted', ok: true, retry: false });
        onUndone();
      },
      (error: unknown) => setState({ status: 'done', ok: false, ...undoFailure(error) }),
    );
  };

  const done = state.status === 'done' ? state : null;
  const canUndo = state.status === 'idle' || (done !== null && done.retry);
  return (
    <RimPanel variant="soft" radius="card" tone={done ? (done.ok ? 'success' : 'warn') : 'accent'} label={t('memory.undo.title')} className="memory-undo" dataId="memory-undo">
      <div className="memory-undo-text">
        <strong>{t('memory.undo.title')}</strong>
        <span className="memory-muted" role="status">
          {done ? t(done.key) : t('memory.undo.text')}
        </span>
      </div>
      <div className="memory-undo-actions">
        {(canUndo || state.status === 'working') && (
          <Button variant="primary" size="md" icon="undo" onClick={undo} disabled={state.status === 'working'} dataId="memory-undo-run">
            {state.status === 'working' ? t('memory.undo.working') : t('memory.undo.action')}
          </Button>
        )}
        <Button variant="ghost" size="md" onClick={() => setClosed(true)} dataId="memory-undo-close">
          {t('memory.undo.close')}
        </Button>
      </div>
    </RimPanel>
  );
}
