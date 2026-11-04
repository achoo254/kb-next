import { type ReactNode, useState } from 'react';
import { useI18n } from '../i18n/i18n';
import type { MessageKey } from '../i18n/messages';
import { ScreenPage } from '../layout/screen-page';
import { ILLUSTRATIONS, type IllustrationName } from '../ui/art';
import { Button } from '../ui/button';
import { RimPanel } from '../ui/rim-panel';
import './error-screen.css';

/** The error states of board X02. */
export type ErrorKind = 'not-found' | 'forbidden' | 'server' | 'maintenance';

/** The AI art of each state (phase 2 table) and its big code. */
const ERRORS: Record<ErrorKind, { art: IllustrationName; code?: string; title: MessageKey; text: MessageKey }> = {
  'not-found': { art: 'blackhole', code: '404', title: 'error.notFound.title', text: 'error.notFound.text' },
  forbidden: { art: 'vault-lock', code: '403', title: 'error.forbidden.title', text: 'error.forbidden.text' },
  server: { art: 'crystal-cracked', code: '500', title: 'error.server.title', text: 'error.server.text' },
  maintenance: { art: 'satellite-repair', title: 'error.maintenance.title', text: 'error.maintenance.text' },
};

/** Where the error screens lead back to. */
export const UNIVERSE_HREF = '/u';

export interface ErrorPanelProps {
  kind: ErrorKind;
  /** 500: what "Thử lại" does (default: reload the page). Resolves when the retry is over. */
  onRetry?: () => Promise<void> | void;
  /** 403: sends an access request to the owner; without it the panel only offers the way back. */
  onRequestAccess?: () => Promise<void>;
  /** 403: where "Về" goes (the page the visitor came from, else the Universe). */
  backHref?: string;
  /** Maintenance: when the station opens again, already formatted for the reader (e.g. "21:30"). */
  reopensAt?: string;
  /** Maintenance: where the files kept on this device open. */
  offlineHref?: string;
  className?: string;
}

function reloadPage(): void {
  window.location.reload();
}

/**
 * One error state of board X02 as a rim panel: the AI art, the code, one title, one sentence and the way forward.
 * Screens reuse it for their own error states (a Space or document that is private, missing or failed to load).
 */
export function ErrorPanel({ kind, onRetry = reloadPage, onRequestAccess, backHref = UNIVERSE_HREF, reopensAt, offlineHref = '/me', className }: ErrorPanelProps): ReactNode {
  const { t } = useI18n();
  const error = ERRORS[kind];
  const [busy, setBusy] = useState(false);
  const [asked, setAsked] = useState(false);
  const [askFailed, setAskFailed] = useState(false);

  async function retry(): Promise<void> {
    setBusy(true);
    try {
      await onRetry();
    } finally {
      setBusy(false);
    }
  }

  async function requestAccess(): Promise<void> {
    if (!onRequestAccess) return;
    setBusy(true);
    setAskFailed(false);
    try {
      await onRequestAccess();
      setAsked(true);
    } catch {
      setAskFailed(true);
    } finally {
      setBusy(false);
    }
  }

  const text = kind === 'maintenance' && reopensAt ? t('error.maintenance.textAt', { time: reopensAt }) : t(error.text);
  return (
    <RimPanel className={['error-panel', `error-panel-${kind}`, className].filter(Boolean).join(' ')} label={error.code ?? t(error.title)} dataId={`error-${kind}`}>
      <div className="error-panel-art" data-kind={kind} aria-hidden="true">
        <img src={ILLUSTRATIONS[error.art]} alt="" />
      </div>
      <div className="error-panel-body" data-kind={kind}>
        {error.code && <span className="error-panel-code">{error.code}</span>}
        <h1 className="error-panel-title">{t(error.title)}</h1>
        <p className="error-panel-text">{text}</p>
        {kind === 'not-found' && (
          <Button variant="rim" href={UNIVERSE_HREF} className="start-btn error-panel-action" dataId="error-home">
            {t('error.toUniverse')}
          </Button>
        )}
        {kind === 'forbidden' && (
          <div className="error-panel-actions">
            {onRequestAccess && (
              <Button variant="rim" className="start-btn" disabled={busy || asked} onClick={() => void requestAccess()} dataId="error-ask">
                {asked ? t('error.forbidden.asked') : t('error.forbidden.ask')}
              </Button>
            )}
            <Button variant="glass" href={backHref} className="start-ghost" dataId="error-back">
              {t('error.forbidden.back')}
            </Button>
          </div>
        )}
        {kind === 'forbidden' && askFailed && (
          <p className="error-panel-text" role="alert">
            {t('error.forbidden.askFailed')}
          </p>
        )}
        {kind === 'server' && (
          <Button variant="rim" className="start-btn error-panel-action" disabled={busy} onClick={() => void retry()} dataId="error-retry">
            {busy && <span className="error-panel-spinner" aria-hidden="true" />}
            {busy ? t('error.server.retrying') : t('auth.retry')}
          </Button>
        )}
        {kind === 'maintenance' && (
          <Button variant="glass" href={offlineHref} className="start-ghost error-panel-action" dataId="error-offline">
            {t('error.maintenance.offline')}
          </Button>
        )}
      </div>
    </RimPanel>
  );
}

/** An error as the whole screen (an unknown address, or a screen that cannot open): one X02 panel in the middle. */
export function ErrorScreen(props: ErrorPanelProps & { code?: string }): ReactNode {
  const { t } = useI18n();
  const { code = 'X02', ...panel } = props;
  return (
    <ScreenPage
      code={code}
      veil="gate"
      layout="board"
      actions={
        <Button variant="glass" href={UNIVERSE_HREF} className="start-ghost" dataId="error-top-home">
          {t('error.toUniverse')}
        </Button>
      }
    >
      <div className="error-screen-stage">
        <ErrorPanel {...panel} />
      </div>
    </ScreenPage>
  );
}
