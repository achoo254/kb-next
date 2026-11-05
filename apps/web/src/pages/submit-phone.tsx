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
  /** The text's title, once loaded ("Ghi chú: DHCP đang chờ quản trị duyệt…"). */
  title: string;
  phase: SubmitPhase;
  steps: readonly SubmitStep[];
  /** Sends again (only when this page sent it). */
  retry?: () => void;
  retrying: boolean;
  translate?: { href: string; lang: string };
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
 * Sending for review on a phone (board M03 after "Gửi duyệt"): the comet with the steps while it goes, then "Đã gửi
 * duyệt" with the way to "Của tôi" and to write another, or "Chưa gửi được" with why, "Thử lại" when that can help, and
 * "Để sau". The same submission and states as C06.
 */
export function SubmitPhone({ id, title, phase, steps, retry, retrying, translate }: SubmitPhoneProps): ReactNode {
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
            <p className="submit-phone-text">{title ? phone.t('submit.sentSub', { title }) : t('submit.sent.text')}</p>
            <span className="submit-phone-chip">{t('submit.sent.noLink')}</span>
            <a className="phone-button submit-phone-main" data-tone="rim" href={SHELL_PATHS.mine} data-id="submit-to-mine">
              {t('submit.sent.mine')}
            </a>
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
            <a className="submit-phone-quiet" href={`/d/${encodeURIComponent(id)}`}>
              {phone.t('submit.later')}
            </a>
          </div>
        )}
      </div>
    </PhoneShell>
  );
}
