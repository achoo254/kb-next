/**
 * A journey's run on a phone (/journey/:id up to 640px; no phone board, drawn from Flow with the phone kit): the
 * chips (origin, steps and minutes, progress), the title, "Chia sẻ" and "Sửa lối đi" / "Remix", then the path as a
 * list of steps top to bottom, the open step's card under its step (its line, its document, "Xong", next), and the
 * finished card once every step is done. The state is the desktop run's (journey-run-state.ts).
 */
import type { ReactNode } from 'react';
import type { Journey } from '../api/journey-api';
import { PhoneShell } from '../layout/phone-shell';
import { journeyEditPath, sharePagePath } from '../layout/shell-paths';
import { ILLUSTRATIONS } from '../ui/art';
import { EmptyState } from '../ui/empty-state';
import { GradientTitle } from '../ui/gradient-title';
import { Icon } from '../ui/icon';
import { OriginTag } from '../ui/origin-tag';
import { totalMinutes } from './journey-model';
import { useJourneyText } from './journey-messages';
import { type JourneyRun, STOP_ART, STOP_TONES, openLabel } from './journey-run-state';
import { originOf } from './space-labels';
import { documentHref } from './universe-dock';
import './journey-run-phone.css';

export function JourneyRunPhone({ journey, run }: { journey: Journey; run: JourneyRun }): ReactNode {
  const { t } = useJourneyText();
  const { steps, state, now, doneCount, viewed, busy, error, note } = run;
  const stateLabel = t(`run.state.${state}`, { done: doneCount, count: steps.length });

  return (
    <PhoneShell screen="Flow" stars={false}>
      <div className="jrp" data-id="journey-run" data-state={steps.length === 0 ? 'empty' : state}>
        <div className="jrp-scroll">
          <div className="jrp-head">
            <div className="jrp-chips">
              <OriginTag origin={originOf(journey)} className="jr-origin" />
              <span className="jr-chip" data-id="journey-total">
                {t('run.total', { count: steps.length, minutes: totalMinutes(steps) })}
              </span>
              {steps.length > 0 && (
                <span className="jr-chip jr-chip-state" data-state={state} data-id="journey-progress">
                  {stateLabel}
                </span>
              )}
            </div>
            <GradientTitle className="jrp-title">{journey.title || t('journey.untitled')}</GradientTitle>
          </div>
          <div className="jrp-actions">
            <a className="phone-button" data-tone="rim" href={sharePagePath(journey.id)} data-id="journey-share">
              <Icon name="share-up" size={18} />
              {t('run.share')}
            </a>
            {journey.editable ? (
              <a className="phone-button" data-tone="ghost" href={journeyEditPath(journey.id)} data-id="journey-edit">
                <Icon name="pencil" size={18} />
                {t('run.edit')}
              </a>
            ) : (
              <button type="button" className="phone-button" data-tone="ghost" onClick={() => void run.remix()} data-id="journey-remix">
                <Icon name="arrow-up-right" size={18} />
                {t('run.remix')}
              </button>
            )}
          </div>

          {steps.length === 0 ? (
            <EmptyState
              art="journey-path"
              title={t('run.empty.title')}
              description={t('run.empty.text')}
              action={journey.editable ? { label: t('run.edit'), href: journeyEditPath(journey.id) } : undefined}
              dataId="journey-run-empty"
            />
          ) : (
            <ol className="jrp-steps" aria-label={t('run.path')} data-id="journey-path">
              {steps.map((step, i) => {
                const open = i === viewed;
                const link = openLabel(t, step);
                return (
                  <li key={step.id} className="jrp-step" data-tone={i % STOP_TONES} data-done={step.done} data-now={i === now} data-open={open}>
                    <button
                      type="button"
                      className="jrp-stop"
                      aria-label={t(step.done ? 'run.stop.done' : 'run.stop', { n: i + 1, title: step.title })}
                      aria-current={i === now ? 'step' : undefined}
                      aria-pressed={open}
                      onClick={() => run.view(i)}
                      data-id={`journey-stop-${i + 1}`}
                    >
                      <span className="jrp-crystal" aria-hidden="true">
                        <img src={STOP_ART[i % STOP_ART.length]} alt="" width={40} height={44} />
                        <span className="jrp-crystal-n">{step.done ? <Icon name="check" size={12} strokeWidth={3} /> : i + 1}</span>
                      </span>
                      <span className="jrp-stop-text">
                        <span className="jrp-stop-name">{step.title}</span>
                        <span className="jrp-stop-meta">
                          {t(`journey.kind.${step.kind}`)} · {t('journey.step.minutes', { minutes: step.minutes })}
                        </span>
                      </span>
                    </button>
                    {open && (
                      <div className="jrp-card" data-id="journey-card" data-state={step.done ? 'done' : 'open'}>
                        <span className="jr-card-step">{t('run.card.step', { n: i + 1, count: steps.length, title: step.title })}</span>
                        <span className="jrp-card-line">{step.note ?? step.document?.summary ?? step.title}</span>
                        {link && step.document && (
                          <a className="jrp-card-link" href={documentHref(step.document.id)} data-id="journey-open-document">
                            {link}
                          </a>
                        )}
                        <div className="jrp-card-buttons">
                          <button
                            type="button"
                            className="phone-button"
                            data-tone="rim"
                            aria-pressed={step.done}
                            disabled={busy}
                            onClick={() => void run.mark(i, !step.done)}
                            data-id="journey-done"
                          >
                            <Icon name={step.done ? 'undo' : 'check'} size={18} />
                            {t(step.done ? 'run.undo' : 'run.done')}
                          </button>
                          <button type="button" className="jrp-next" aria-label={t('run.next')} onClick={run.viewNext} data-id="journey-next">
                            <Icon name="chevron-right" size={20} />
                          </button>
                        </div>
                      </div>
                    )}
                  </li>
                );
              })}
            </ol>
          )}

          {steps.length > 0 && viewed === null && (
            <div className="jrp-card jrp-finished" data-id="journey-card" data-state="finished">
              <img src={ILLUSTRATIONS['journey-path']} alt="" aria-hidden="true" width={72} height={72} />
              <span className="jrp-card-line">{t('run.finished.title')}</span>
              <span className="jr-card-step">{t('run.finished.text', { count: steps.length })}</span>
            </div>
          )}
          <p className="jrp-message" role={error ? 'alert' : 'status'} data-id="journey-message">
            {error ? t(error) : note ? t(note) : ''}
          </p>
        </div>
      </div>
    </PhoneShell>
  );
}
