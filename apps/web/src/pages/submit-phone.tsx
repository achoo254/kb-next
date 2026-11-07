import type { ReactNode } from 'react';
import { PhoneShell } from '../layout/phone-shell';
import { SHELL_PATHS } from '../layout/shell-paths';
import { ILLUSTRATIONS } from '../ui/art';
import { Icon } from '../ui/icon';
import { usePhoneText } from './phone-messages';
import { type SubmitPhase, type SubmitStep, actionHref } from './submit-panels';
import { canRetry, useSubmitText } from './submit-messages';
import './submit-phone.css';

interface SubmitPhoneProps {
  id: string;
  phase: SubmitPhase;
  steps: readonly SubmitStep[];
  /** Sends again (only when this page sent it). */
  retry?: () => void;
  retrying: boolean;
  translate?: { href: string; lang: string };
  /** Published, but an admin is hiding it. */
  hidden: boolean;
}

function Steps({ steps }: { steps: readonly SubmitStep[] }): ReactNode {
  const { t } = usePhoneText();
  return (
    <ol className="submit-phone-steps" aria-label={t('submit.steps')}>
      {steps.map((step) => (
        <li key={step.name} data-state={step.state}>
          <span className="submit-phone-dot" aria-hidden="true">
            {step.state === 'done' && <Icon name="check" size={12} strokeWidth={3} />}
          </span>
          {step.name}
        </li>
      ))}
    </ol>
  );
}

/**
 * Publishing on a phone (board M03 after "Đăng công khai"): the comet with the steps while it goes, then "Đã đăng" with
 * the way to the text, its share page (or "Của tôi" when an admin hides it) and to write another, or "Chưa đăng được"
 * with why, "Thử lại" when that can help, and "Để sau". The same publication and states as C06.
 */
export function SubmitPhone({ id, phase, steps, retry, retrying, translate, hidden }: SubmitPhoneProps): ReactNode {
  const doc = `/d/${encodeURIComponent(id)}`;
  const { t } = useSubmitText();
  const phone = usePhoneText();
  return (
    <PhoneShell screen="M03" tabBar={false}>
      <div className="submit-phone" data-id="submit-screen" data-state={phase.kind}>
        {(phase.kind === 'checking' || phase.kind === 'sending') && (
          <div className="submit-phone-stage" role="status" aria-busy="true">
            <div className="submit-phone-comet" aria-hidden="true">
              <span className="submit-phone-ring" />
              <img src={ILLUSTRATIONS['comet-sent']} alt="" />
            </div>
            <h1 className="submit-phone-title">{phase.kind === 'checking' ? t('submit.loading') : phone.t('submit.sending')}</h1>
            {phase.kind === 'sending' && <Steps steps={steps} />}
          </div>
        )}
        {phase.kind === 'sent' && (
          <div className="submit-phone-stage" data-id="submit-sent">
            <div className="submit-phone-comet" data-big="true" aria-hidden="true">
              <span className="submit-phone-ring" data-tone="wait" />
              <img src={ILLUSTRATIONS['comet-sent']} alt="" />
            </div>
            <h1 className="submit-phone-title" data-size="big">
              {t('submit.sent.title')}
            </h1>
            <p className="submit-phone-text">{t(hidden ? 'submit.sent.hiddenText' : 'submit.sent.text')}</p>
            <span className="submit-phone-chip">{t(hidden ? 'submit.sent.hidden' : 'submit.sent.public')}</span>
            <a className="phone-button submit-phone-main" data-tone="rim" href={doc} data-id="submit-to-doc">
              {t('submit.sent.view')}
            </a>
            {hidden ? (
              <a className="phone-button submit-phone-main" data-tone="ghost" href={SHELL_PATHS.mine} data-id="submit-to-mine">
                {t('submit.sent.mine')}
              </a>
            ) : (
              <a className="phone-button submit-phone-main" data-tone="ghost" href={`${doc}/share`} data-id="submit-share">
                {t('submit.sent.share')}
              </a>
            )}
            {translate && (
              <a className="phone-button submit-phone-main" data-tone="ghost" href={translate.href} data-id="submit-translate">
                {t('submit.sent.translate', { lang: translate.lang })}
              </a>
            )}
            <a className="submit-phone-quiet" href={SHELL_PATHS.create}>
              {phone.t('submit.another')}
            </a>
          </div>
        )}
        {phase.kind === 'failed' && (
          <div className="submit-phone-stage" role="alert" data-id="submit-fix" data-error={phase.error}>
            <span className="submit-phone-warn" aria-hidden="true">
              <Icon name="notice-warn" size={40} />
            </span>
            <h1 className="submit-phone-title">{phone.t('submit.failTitle')}</h1>
            <p className="submit-phone-text">{t(`submit.err.${phase.error}.why`)}</p>
            <p className="submit-phone-text">{t(`submit.err.${phase.error}.fix`)}</p>
            {retry && canRetry(phase.error) ? (
              <button type="button" className="submit-phone-retry" onClick={retry} disabled={retrying} data-id="submit-retry">
                {retrying ? t('submit.retrying') : t('submit.retry')}
              </button>
            ) : (
              <a className="phone-button submit-phone-main" data-tone="rim" href={actionHref(phase.error, id)} data-id="submit-fix-action">
                {t(`submit.err.${phase.error}.action`)}
              </a>
            )}
            <a className="submit-phone-quiet" href={doc}>
              {phone.t('submit.later')}
            </a>
          </div>
        )}
      </div>
    </PhoneShell>
  );
}
