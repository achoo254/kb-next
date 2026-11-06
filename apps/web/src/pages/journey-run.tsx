/**
 * A journey's run (board Flow) at /journey/:id: its steps as crystals on a glowing path, the step to do now lit with
 * the traveller above it, the open step's card (its line, its document, "Xong", next), and how far the account got.
 * Progress is the account's own and kept on the server: a step is done once ticked "Xong" or once its document was
 * read to the end (C11's reading progress). States: loading, not started, under way, completed, a journey without
 * steps, and a journey not found, someone else's or failing to load. "Remix" copies the journey into a draft of the
 * account's own (C07); its author edits it instead. On a phone the path is a list of steps with the open step's card
 * under it (journey-run-phone.tsx).
 */
import { type ReactNode, useCallback, useEffect, useState } from 'react';
import { ApiError } from '../api/api-client';
import { type Journey, fetchJourney } from '../api/journey-api';
import { AppShell, type BreadcrumbItem, SHELL_PATHS } from '../layout/app-shell';
import { useDevice } from '../layout/device';
import { PhoneShell } from '../layout/phone-shell';
import { journeyEditPath, sharePagePath } from '../layout/shell-paths';
import { ILLUSTRATIONS } from '../ui/art';
import { EmptyState } from '../ui/empty-state';
import { GradientTitle } from '../ui/gradient-title';
import { Icon } from '../ui/icon';
import { OriginTag } from '../ui/origin-tag';
import { ErrorPanel, type ErrorKind } from './error-screen';
import { pathWidth, segment, stopPlaces, totalMinutes } from './journey-model';
import { type JourneyMessageKey, useJourneyText } from './journey-messages';
import { STOP_ART, STOP_TONES, openLabel, useJourneyRun } from './journey-run-state';
import { JourneyRunPhone } from './journey-run-phone';
import { originOf } from './space-labels';
import type { ScreenTranslate } from './space-messages';
import { documentHref } from './universe-dock';
import './journey-run.css';

type T = ScreenTranslate<JourneyMessageKey>;


type RunLoad = { status: 'loading' } | { status: 'ready'; journey: Journey } | { status: 'failed'; error: Exclude<ErrorKind, 'maintenance'> };

function runError(error: unknown): Exclude<ErrorKind, 'maintenance'> {
  if (!(error instanceof ApiError)) return 'server';
  if (error.code === 'not-found') return 'not-found';
  if (error.code === 'hidden' || error.code === 'no-access') return 'forbidden';
  return 'server';
}

function useJourney(id: string): { load: RunLoad; reload(): void } {
  const [result, setResult] = useState<{ id: string; load: RunLoad } | null>(null);
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    let current = true;
    fetchJourney(id).then(
      (journey) => {
        if (current) setResult({ id, load: { status: 'ready', journey } });
      },
      (error: unknown) => {
        if (!(error instanceof ApiError)) console.error('journey load failed', error);
        if (current) setResult({ id, load: { status: 'failed', error: runError(error) } });
      },
    );
    return () => {
      current = false;
    };
  }, [id, attempt]);
  const reload = useCallback(() => {
    setResult(null);
    setAttempt((n) => n + 1);
  }, []);
  return { load: result?.id === id ? result.load : { status: 'loading' }, reload };
}

function crumbs(t: T, title: string | null): BreadcrumbItem[] {
  return [{ label: 'Universe', href: SHELL_PATHS.universe }, { label: t('run.crumb') }, ...(title === null ? [] : [{ label: title || t('journey.untitled') }])];
}

/** The frame of the run's states: the Flow board, or on a phone the phone frame with its tab bar. */
function RunFrame({ title, state, children }: { title: string | null; state: string; children: ReactNode }): ReactNode {
  const { t } = useJourneyText();
  const phone = useDevice() === 'phone';
  if (phone) {
    return (
      <PhoneShell screen="Flow" stars={false}>
        <div className="jrp jrp-state-frame" data-id="journey-run" data-state={state}>
          {children}
        </div>
      </PhoneShell>
    );
  }
  return (
    <AppShell screen="Flow" rail="universe" breadcrumb={crumbs(t, title)} className="jr-shell">
      <div className="jr-screen" data-id="journey-run" data-state={state}>
        {children}
      </div>
    </AppShell>
  );
}

export function JourneyRunScreen({ id }: { id: string }): ReactNode {
  const { t } = useJourneyText();
  const { load, reload } = useJourney(id);
  if (load.status === 'ready') return <Run key={id} journey={load.journey} />;
  return (
    <RunFrame title={null} state={load.status === 'failed' ? load.error : 'loading'}>
      {load.status === 'loading' ? (
        <p className="jr-loading" role="status" data-id="journey-loading">
          {t('run.loading')}
        </p>
      ) : (
        <div className="jr-error">
          <ErrorPanel kind={load.error} onRetry={reload} />
        </div>
      )}
    </RunFrame>
  );
}

function Run({ journey }: { journey: Journey }): ReactNode {
  const { t } = useJourneyText();
  const run = useJourneyRun(journey);
  const phone = useDevice() === 'phone';
  if (phone) return <JourneyRunPhone journey={journey} run={run} />;
  const { steps, state, now, doneCount, viewed, busy, error, note, mark, remix } = run;
  const places = stopPlaces(steps.length);
  const travellerAt = places[now ?? steps.length - 1];
  const open = viewed === null ? undefined : steps[viewed];

  const total = totalMinutes(steps);
  const stateLabel = t(`run.state.${state}`, { done: doneCount, count: steps.length });

  return (
    <RunFrame title={journey.title} state={steps.length === 0 ? 'empty' : state}>
      <div className="jr-head">
        <div className="jr-chips">
          <OriginTag origin={originOf(journey)} className="jr-origin" />
          <span className="jr-chip" data-id="journey-total">
            {t('run.total', { count: steps.length, minutes: total })}
          </span>
          {steps.length > 0 && (
            <span className="jr-chip jr-chip-state" data-state={state} data-id="journey-progress">
              {stateLabel}
            </span>
          )}
        </div>
        <GradientTitle className="jr-title">{journey.title || t('journey.untitled')}</GradientTitle>
      </div>
      <div className="jr-actions">
        <a className="jr-button jr-button-main" href={sharePagePath(journey.id)} data-id="journey-share">
          <Icon name="share-up" size={18} />
          {t('run.share')}
        </a>
        {journey.editable ? (
          <a className="jr-button" href={journeyEditPath(journey.id)} data-id="journey-edit">
            <Icon name="pencil" size={18} />
            {t('run.edit')}
          </a>
        ) : (
          <button type="button" className="jr-button" onClick={() => void remix()} data-id="journey-remix">
            <Icon name="arrow-up-right" size={18} />
            {t('run.remix')}
          </button>
        )}
      </div>

      {steps.length === 0 ? (
        <div className="jr-empty">
          <EmptyState
            art="journey-path"
            title={t('run.empty.title')}
            description={t('run.empty.text')}
            action={journey.editable ? { label: t('run.edit'), href: journeyEditPath(journey.id) } : undefined}
            dataId="journey-run-empty"
          />
        </div>
      ) : (
        <div className="jr-stage" data-id="journey-path">
          <div className="jr-path" style={{ width: pathWidth(steps.length) }}>
            {places.slice(0, -1).map((place, i) => {
              const next = places[i + 1];
              if (!next) return null;
              const seg = segment(place, next);
              return (
                <span
                  key={`seg-${steps[i]?.id ?? i}`}
                  className="jr-seg"
                  aria-hidden="true"
                  data-lit={steps[i]?.done === true}
                  data-tone={(i + 1) % STOP_TONES}
                  style={{ left: seg.x, top: seg.y, width: seg.length, transform: `rotate(${seg.angle}deg)` }}
                />
              );
            })}
            <ol className="jr-stops" aria-label={t('run.path')}>
              {steps.map((step, i) => {
                const place = places[i];
                if (!place) return null;
                const lit = step.done || i === now || i === viewed;
                return (
                  <li key={step.id} className="jr-stop" style={{ left: place.x - 60, top: place.y - 60 }} data-lit={lit} data-tone={i % STOP_TONES}>
                    <button
                      type="button"
                      className="jr-stop-button"
                      data-viewed={i === viewed}
                      data-done={step.done}
                      aria-label={t(step.done ? 'run.stop.done' : 'run.stop', { n: i + 1, title: step.title })}
                      aria-current={i === now ? 'step' : undefined}
                      aria-pressed={i === viewed}
                      onClick={() => run.view(i)}
                      data-id={`journey-stop-${i + 1}`}
                    >
                      <img src={STOP_ART[i % STOP_ART.length]} alt="" aria-hidden="true" />
                      <span className="jr-stop-core" aria-hidden="true" />
                      <span className="jr-stop-label">
                        <span className="jr-stop-n">{i + 1}</span>
                        <span className="jr-stop-name">{step.title}</span>
                      </span>
                    </button>
                  </li>
                );
              })}
            </ol>
            {travellerAt && (
              <span className="jr-traveller" aria-hidden="true" style={{ left: travellerAt.x - 12, top: travellerAt.y - 84 }}>
                <span className="jr-traveller-ping" />
                <span className="jr-traveller-dot" />
              </span>
            )}
          </div>
        </div>
      )}

      {steps.length > 0 && (
        <div className="jr-card" data-id="journey-card" data-state={open ? (open.done ? 'done' : 'open') : 'finished'}>
          {open && viewed !== null ? (
            <>
              <div className="jr-card-big" data-tone={viewed % STOP_TONES} aria-hidden="true">
                {open.done ? <Icon name="check" size={30} /> : t('run.minutes', { minutes: open.minutes })}
              </div>
              <div className="jr-card-text">
                <span className="jr-card-step">{t('run.card.step', { n: viewed + 1, count: steps.length, title: open.title })}</span>
                <span className="jr-card-line">{open.note ?? open.document?.summary ?? open.title}</span>
                {openLabel(t, open) && open.document && (
                  <a className="jr-card-link" href={documentHref(open.document.id)} data-id="journey-open-document">
                    {openLabel(t, open)}
                  </a>
                )}
              </div>
              <div className="jr-card-buttons">
                <button
                  type="button"
                  className="jr-card-main"
                  aria-label={t(open.done ? 'run.undo' : 'run.done')}
                  aria-pressed={open.done}
                  disabled={busy}
                  onClick={() => void mark(viewed, !open.done)}
                  data-id="journey-done"
                >
                  <Icon name={open.done ? 'undo' : 'check'} size={22} />
                </button>
                <button type="button" className="jr-card-next" aria-label={t('run.next')} onClick={run.viewNext} data-id="journey-next">
                  <Icon name="chevron-right" size={20} />
                </button>
              </div>
            </>
          ) : (
            <>
              <img className="jr-card-art" src={ILLUSTRATIONS['journey-path']} alt="" aria-hidden="true" width={88} height={88} />
              <div className="jr-card-text">
                <span className="jr-card-line">{t('run.finished.title')}</span>
                <span className="jr-card-step">{t('run.finished.text', { count: steps.length })}</span>
              </div>
            </>
          )}
        </div>
      )}
      <p className="jr-message" role={error ? 'alert' : 'status'} data-id="journey-message">
        {error ? t(error) : note ? t(note) : ''}
      </p>
    </RunFrame>
  );
}
