import type { MouseEventHandler, ReactNode } from 'react';
import { useI18n } from '../i18n/i18n';
import type { MessageKey } from '../i18n/messages';
import { BRAND_WORDS } from '../layout/brand-words';
import { ILLUSTRATIONS, ORB_ART } from '../ui/art';
import { Button } from '../ui/button';
import { RimPanel } from '../ui/rim-panel';
import './auth-cards.css';

/**
 * The three cards of board S02, one per state of signing in: the gate to the IdP (A), the Universe opening after the
 * IdP sent the visitor back (B), and a failed sign-in with a retry (C). Each is 400×560, the size of a board column.
 */

const STREAKS = [0, 1, 2, 3, 4];

interface AuthGateCardProps {
  /** `idle`: the button to start; `opening`: the browser is on its way to the IdP. */
  state: 'idle' | 'opening';
  /** The server's sign-in route (to the IdP and back). */
  href: string;
  onStart?: MouseEventHandler<HTMLElement>;
  /** The small label at the top (the board labels its columns "A · …"). */
  kicker?: string;
}

/** A · the gate to the IdP: the black hole the visitor is pulled through, and one account for every app. */
export function AuthGateCard({ state, href, onStart, kicker }: AuthGateCardProps): ReactNode {
  const { t } = useI18n();
  const opening = state === 'opening';
  return (
    <RimPanel className="auth-card auth-card-gate" label={t('auth.kicker.gate')} dataId="auth-gate">
      <span className="auth-card-kicker">{kicker ?? t('auth.kicker.gate')}</span>
      <div className="auth-gate-art" aria-hidden="true">
        <span className="auth-gate-ring" />
        <img src={ILLUSTRATIONS.blackhole} alt="" />
        {STREAKS.map((index) => (
          <span key={index} className="auth-gate-streak" style={{ top: 60 + index * 24, animationDelay: `${index * 0.28}s` }} />
        ))}
      </div>
      <span className="auth-card-title" role={opening ? 'status' : undefined}>
        {opening ? t('auth.gate.title', { idp: BRAND_WORDS.idp }) : t('auth.gate.idleTitle')}
      </span>
      <span className="auth-card-text">{t('auth.gate.text', { account: BRAND_WORDS.account })}</span>
      {!opening && (
        <Button variant="rim" href={href} onClick={onStart} icon="sign-in" className="start-btn auth-card-cta" dataId="sign-in-cta">
          {t('auth.gate.cta', { account: BRAND_WORDS.account })}
        </Button>
      )}
    </RimPanel>
  );
}

/** The three steps of opening the Universe, and how far each has come. */
export type OpeningStage = 'auth' | 'universe' | 'ready';

const STEPS: ReadonlyArray<{ id: OpeningStage; label: MessageKey }> = [
  { id: 'auth', label: 'auth.step.auth' },
  { id: 'universe', label: 'auth.step.universe' },
  { id: 'ready', label: 'auth.step.ready' },
];

/** Share of the bar for each running stage (the board shows 62% while the Universe loads). */
const PROGRESS: Record<OpeningStage, number> = { auth: 24, universe: 62, ready: 100 };

type StepState = 'done' | 'running' | 'waiting';

function stepState(step: OpeningStage, stage: OpeningStage): StepState {
  const at = STEPS.findIndex((entry) => entry.id === stage);
  const index = STEPS.findIndex((entry) => entry.id === step);
  if (stage === 'ready' || index < at) return 'done';
  return index === at ? 'running' : 'waiting';
}

const STEP_MARK: Record<StepState, string> = { done: '✓', running: '…', waiting: '' };
const STEP_TEXT: Record<StepState, MessageKey> = { done: 'auth.step.done', running: 'auth.step.running', waiting: 'auth.step.waiting' };

/** B · back from the IdP: the orb and the three steps (sign-in, loading the universe, ready) with a progress bar. */
export function UniverseOpeningCard({ stage, kicker }: { stage: OpeningStage; kicker?: string }): ReactNode {
  const { t } = useI18n();
  const progress = PROGRESS[stage];
  return (
    <RimPanel className="auth-card auth-card-opening" label={t('auth.opening.title')} dataId="universe-opening">
      <span className="auth-card-kicker">{kicker ?? t('auth.kicker.back')}</span>
      <div className="auth-opening-art" aria-hidden="true">
        <img src={ORB_ART} alt="" />
      </div>
      <span className="auth-card-title">{t('auth.opening.title')}</span>
      <ol className="auth-steps">
        {STEPS.map((step) => {
          const state = stepState(step.id, stage);
          return (
            <li key={step.id} className="auth-step" data-state={state} data-id={`opening-step-${step.id}`}>
              <span className="auth-step-mark" aria-hidden="true">
                {STEP_MARK[state]}
              </span>
              <span className="auth-step-name">{t(step.label)}</span>
              <span className="auth-step-status">{t(STEP_TEXT[state])}</span>
            </li>
          );
        })}
      </ol>
      <span className="auth-progress" role="progressbar" aria-label={t('auth.opening.progress')} aria-valuemin={0} aria-valuemax={100} aria-valuenow={progress}>
        <span className="auth-progress-fill" style={{ width: `${progress}%` }} />
      </span>
    </RimPanel>
  );
}

/** Why signing in did not go through (the server's `?login=` of /login, or sign-in closed). */
export type SignInFailure = 'fail' | 'unavailable' | 'busy';

const FAILURE_TEXT: Record<SignInFailure, { title: MessageKey; text: MessageKey }> = {
  fail: { title: 'auth.failed.title', text: 'auth.failed.fail' },
  unavailable: { title: 'auth.failed.unavailableTitle', text: 'auth.failed.unavailable' },
  busy: { title: 'auth.failed.busyTitle', text: 'auth.failed.busy' },
};

interface SignInFailedCardProps {
  reason: SignInFailure;
  /** Where "Thử lại" goes: the sign-in route again. */
  retryHref: string;
  homeHref: string;
  kicker?: string;
}

/** C · the sign-in failed: the cracked crystal, why, and a way to try again or go home. */
export function SignInFailedCard({ reason, retryHref, homeHref, kicker }: SignInFailedCardProps): ReactNode {
  const { t } = useI18n();
  const text = FAILURE_TEXT[reason];
  return (
    <RimPanel className="auth-card auth-card-failed" label={t(text.title)} dataId="sign-in-failed">
      <span className="auth-card-kicker">{kicker ?? t('auth.kicker.error')}</span>
      <div className="auth-failed-art" aria-hidden="true">
        <img src={ILLUSTRATIONS['crystal-cracked']} alt="" />
      </div>
      <span className="auth-card-title" role="alert">
        {t(text.title)}
      </span>
      <span className="auth-card-text" data-id="sign-in-notice">
        {t(text.text, { idp: BRAND_WORDS.idp })}
      </span>
      <div className="auth-card-actions">
        <Button variant="rim" href={retryHref} className="start-btn" dataId="sign-in-retry">
          {t('auth.retry')}
        </Button>
        <Button variant="glass" href={homeHref} className="start-ghost" dataId="sign-in-home">
          {t('layout.backHome')}
        </Button>
      </div>
    </RimPanel>
  );
}
