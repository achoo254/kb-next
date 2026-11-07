/**
 * The panels of board C06, shared by the screen (one publication as it goes) and its board page (every state side by
 * side): the steps with their progress, the published card (`ill-comet-sent`), and what to fix when it could not be
 * published.
 */
import type { ReactNode } from 'react';
import type { PublishResponse } from '../api/review-api';
import { ILLUSTRATIONS } from '../ui/art';
import { Button } from '../ui/button';
import { Icon } from '../ui/icon';
import { SHELL_PATHS } from '../layout/shell-paths';
import { type SubmitError, canRetry, useSubmitText } from './submit-messages';

/**
 * Where a publication is: reading the text's status, publishing, published (with the server's answer; null when the
 * text was published already), or not published.
 */
export type SubmitPhase = { kind: 'checking' } | { kind: 'sending' } | { kind: 'sent'; result: PublishResponse | null } | { kind: 'failed'; error: SubmitError };

export type StepState = 'done' | 'run' | 'wait' | 'failed';

export interface SubmitStep {
  name: string;
  sub: string;
  state: StepState;
}

/** A: the three steps and how far along they are (0–100). */
export function SubmitSteps({ steps, percent }: { steps: readonly SubmitStep[]; percent: number }): ReactNode {
  const { t } = useSubmitText();
  return (
    <section aria-label={t('submit.steps')} className="submit-panel submit-steps" data-id="submit-steps">
      <div className="submit-panel-head">
        <span className="submit-kicker">{t('submit.steps.head')}</span>
        <span className="submit-kicker-plain">{percent}%</span>
      </div>
      <div className="submit-bar" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={percent} aria-label={t('submit.steps')}>
        <div className="submit-bar-fill" style={{ width: `${percent}%` }} />
      </div>
      {steps.map((step, i) => (
        <div key={step.name} className="submit-step" data-state={step.state}>
          <span className="submit-step-dot" aria-hidden="true">
            {step.state === 'done' && <Icon name="check" size={14} />}
            {step.state === 'run' && <span className="submit-spin" />}
            {step.state === 'failed' && <Icon name="cross" size={12} />}
            {step.state === 'wait' && <span className="submit-step-n">{i + 1}</span>}
          </span>
          <div className="submit-step-text">
            <span className="submit-step-name">{step.name}</span>
            <span className="submit-step-sub">{step.sub}</span>
          </div>
        </div>
      ))}
    </section>
  );
}

interface SubmitSentProps {
  documentId: string;
  /** An admin hid it earlier: published, but off the Universe (and without a share link) until an admin shows it. */
  hidden?: boolean;
  /** C04 asked for an AI translation, offered here in place of "Viết bài khác" (it runs on the author's own key, F04). */
  translate?: { href: string; lang: string };
}

/** B: published, readable by everyone at once (unless an admin hides it), with the ways on from here. */
export function SubmitSent({ documentId, hidden = false, translate }: SubmitSentProps): ReactNode {
  const { t } = useSubmitText();
  const doc = `/d/${encodeURIComponent(documentId)}`;
  return (
    <section aria-label={t('submit.sent')} className="submit-panel submit-sent" data-id="submit-sent" data-hidden={hidden || undefined}>
      <span className="submit-kicker submit-kicker-start">{t('submit.sent.head')}</span>
      <div className="submit-comet" aria-hidden="true">
        <span className="submit-comet-ring" />
        <img src={ILLUSTRATIONS['comet-sent']} alt="" />
      </div>
      <h2 className="submit-sent-title">{t('submit.sent.title')}</h2>
      <span className="submit-sent-text">{t(hidden ? 'submit.sent.hiddenText' : 'submit.sent.text')}</span>
      <span className="submit-sent-chip" data-tone={hidden ? undefined : 'ok'}>
        {t(hidden ? 'submit.sent.hidden' : 'submit.sent.public')}
      </span>
      <div className="submit-actions">
        <Button variant="rim" size="lg" href={doc} className="submit-action" dataId="submit-to-doc">
          {t('submit.sent.view')}
        </Button>
        {hidden ? (
          <Button variant="ghost" size="lg" href={SHELL_PATHS.mine} className="submit-action" dataId="submit-to-mine">
            {t('submit.sent.mine')}
          </Button>
        ) : (
          <Button variant="ghost" size="lg" href={`${doc}/share`} className="submit-action" dataId="submit-share">
            {t('submit.sent.share')}
          </Button>
        )}
      </div>
      {translate ? (
        <a href={translate.href} className="submit-sent-more" data-id="submit-translate">
          {t('submit.sent.translate', { lang: translate.lang })}
        </a>
      ) : (
        <a href={SHELL_PATHS.newNote} className="submit-sent-more">
          {t('submit.sent.write')}
        </a>
      )}
    </section>
  );
}

interface SubmitFixProps {
  error: SubmitError;
  documentId: string;
  onRetry?: () => void;
  retrying?: boolean;
  /** The board page's switch between errors (a demo of the mock; the screen shows the one that happened). */
  choices?: { errors: readonly SubmitError[]; onPick: (error: SubmitError) => void };
}

/** Where each error's own action leads. */
export function actionHref(error: SubmitError, documentId: string): string {
  const edit = `/d/${encodeURIComponent(documentId)}/edit`;
  return error === 'title-required' || error === 'body-required' ? edit : SHELL_PATHS.mine;
}

/** C: why it could not go and how to fix it; Try again when that can help. */
export function SubmitFix({ error, documentId, onRetry, retrying = false, choices }: SubmitFixProps): ReactNode {
  const { t } = useSubmitText();
  const retry = onRetry && (canRetry(error) || choices);
  return (
    <section aria-label={t('submit.fix')} className="submit-panel submit-fix" data-id="submit-fix" data-error={error}>
      <span className="submit-kicker">{t('submit.fix.head')}</span>
      {choices && (
        <div role="group" aria-label={t('submit.fix.pick')} className="submit-fix-choices">
          {choices.errors.map((e) => (
            <button key={e} type="button" aria-pressed={e === error} className="submit-fix-choice" onClick={() => choices.onPick(e)}>
              {t(`submit.err.${e}.n`)}
            </button>
          ))}
        </div>
      )}
      <div className="submit-fix-card" role="alert">
        <span className="submit-fix-title">
          <Icon name="notice-warn" size={20} />
          {t(`submit.err.${error}.title`)}
        </span>
        <span className="submit-fix-why">{t(`submit.err.${error}.why`)}</span>
        <div className="submit-fix-how">
          <Icon name="arrow-right" size={16} className="submit-fix-arrow" />
          <span>{t(`submit.err.${error}.fix`)}</span>
        </div>
        <span className="submit-fix-note">{t(`submit.err.${error}.note`)}</span>
        <div className="submit-actions submit-fix-actions">
          <Button variant="rim" size="lg" href={actionHref(error, documentId)} className="submit-action" dataId="submit-fix-action">
            {t(`submit.err.${error}.action`)}
          </Button>
          {retry && (
            <button type="button" className="submit-retry" onClick={onRetry} disabled={retrying} data-id="submit-retry">
              {retrying && <span className="submit-spin submit-spin-dark" aria-hidden="true" />}
              {retrying ? t('submit.retrying') : t('submit.retry')}
            </button>
          )}
        </div>
      </div>
    </section>
  );
}
