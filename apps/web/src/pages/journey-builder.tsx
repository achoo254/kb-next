/**
 * The journey builder (board C07) at /journey/:id/edit, and /journey/new, which creates a draft journey and opens it
 * here. Left: Jev's next steps and the documents to pick from; middle: the journey's steps, reordered by dragging, by
 * Alt + ↑/↓ or by the selected step's arrows; right: the selected step (title, kind, time, source document or note)
 * and the story card. Every change autosaves (journey-autosave.ts). States: loading, the journey, no step yet
 * (`ill-journey-path`), saving / saved / not saved / offline / changed in another tab, and a journey not found, someone else's, or failing to load. On a phone the same builder is a list of
 * step cards with sheets (journey-builder-phone.tsx).
 */
import { type ReactNode, useCallback, useEffect, useRef, useState } from 'react';
import { ApiError } from '../api/api-client';
import { type Journey, createJourney, fetchJourneyForEditing } from '../api/journey-api';
import { AppShell, type BreadcrumbItem, SHELL_PATHS } from '../layout/app-shell';
import { useDevice } from '../layout/device';
import { PhoneShell } from '../layout/phone-shell';
import { journeyEditPath, journeyPath, publishPath } from '../layout/shell-paths';
import { EmptyState } from '../ui/empty-state';
import { Icon } from '../ui/icon';
import { ErrorPanel } from './error-screen';
import { SAVE_LABEL, saveStatusLine, useJourneyBuilder } from './journey-builder-state';
import { JourneyBuilderPhone } from './journey-builder-phone';
import { type JourneyMessageKey, useJourneyText } from './journey-messages';
import { StepEditor, StepList, StepSources } from './journey-panels';
import { spaceName } from './space-panels';
import type { ScreenTranslate } from './space-messages';
import type { Locale } from '../i18n/i18n';
import './journey-builder.css';
import { navigate } from '../router/navigation';

type BuilderError = 'not-found' | 'forbidden' | 'server';

type BuilderLoad = { status: 'loading' } | { status: 'ready'; journey: Journey } | { status: 'failed'; error: BuilderError };

export function builderError(error: unknown): BuilderError {
  if (!(error instanceof ApiError)) return 'server';
  if (error.code === 'not-found') return 'not-found';
  if (error.code === 'hidden' || error.code === 'no-access') return 'forbidden';
  return 'server';
}

function useBuilderJourney(id: string): { load: BuilderLoad; reload(): void } {
  const [result, setResult] = useState<{ id: string; load: BuilderLoad } | null>(null);
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    let current = true;
    fetchJourneyForEditing(id).then(
      (journey) => {
        if (current) setResult({ id, load: { status: 'ready', journey } });
      },
      (error: unknown) => {
        if (!(error instanceof ApiError)) console.error('journey load failed', error);
        if (current) setResult({ id, load: { status: 'failed', error: builderError(error) } });
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

function crumbs(t: ScreenTranslate<JourneyMessageKey>, locale: Locale, journey: Pick<Journey, 'title' | 'space'> | null, title?: string): BreadcrumbItem[] {
  return [
    { label: 'Universe', href: SHELL_PATHS.universe },
    ...(journey ? [{ label: spaceName(locale, journey.space), href: `/s/${encodeURIComponent(journey.space.slug)}` }] : []),
    { label: t('journey.crumb') },
    ...(journey ? [{ label: (title ?? journey.title).trim() || t('journey.untitled') }] : []),
  ];
}

/** The frame of the builder's states: the C07 board, or on a phone the full-screen phone frame (no tab bar). */
function BuilderFrame({ breadcrumb, state, children }: { breadcrumb: BreadcrumbItem[]; state: string; children: ReactNode }): ReactNode {
  if (useDevice() === 'phone') {
    return (
      <PhoneShell screen="C07" tabBar={false} stars={false}>
        <div className="jbp jbp-state-frame" data-id="journey-builder" data-state={state}>
          {children}
        </div>
      </PhoneShell>
    );
  }
  return (
    <AppShell screen="C07" veil="strong" breadcrumb={breadcrumb} className="jb-shell">
      <div className="jb-screen" data-id="journey-builder" data-state={state}>
        <div className="jb-content">{children}</div>
      </div>
    </AppShell>
  );
}

export function JourneyBuilderScreen({ id }: { id: string }): ReactNode {
  const { t, locale } = useJourneyText();
  const { load, reload } = useBuilderJourney(id);
  if (load.status === 'ready') return <Builder key={id} journey={load.journey} />;
  return (
    <BuilderFrame breadcrumb={crumbs(t, locale, null)} state={load.status === 'failed' ? load.error : 'loading'}>
      {load.status === 'loading' && (
        <p className="jb-loading" role="status" data-id="journey-loading">
          {t('journey.loading')}
        </p>
      )}
      {load.status === 'failed' && (
        <div className="jb-state">
          <ErrorPanel kind={load.error} onRetry={reload} backHref={SHELL_PATHS.mine} />
        </div>
      )}
    </BuilderFrame>
  );
}

/** /journey/new: creates a draft journey and replaces itself with its builder, so Back does not create another. */
export function NewJourney(): ReactNode {
  const { t, locale } = useJourneyText();
  const [failed, setFailed] = useState(false);
  const started = useRef(false);
  const create = useCallback(() => {
    setFailed(false);
    createJourney({}).then(
      (id) => navigate(journeyEditPath(id), { replace: true }),
      (error: unknown) => {
        if (!(error instanceof ApiError)) console.error('journey create failed', error);
        setFailed(true);
      },
    );
  }, []);
  useEffect(() => {
    // Once per visit (React runs effects twice in development).
    if (started.current) return;
    started.current = true;
    create();
  }, [create]);
  return (
    <BuilderFrame breadcrumb={crumbs(t, locale, null)} state={failed ? 'create-failed' : 'creating'}>
      <div className="jb-state">
        {failed ? (
          <EmptyState art="crystal-cracked" title={t('journey.new.failed')} action={{ label: t('journey.new.retry'), onClick: create }} dataId="journey-create-failed" />
        ) : (
          <p className="jb-loading" role="status">
            {t('journey.new.creating')}
          </p>
        )}
      </div>
    </BuilderFrame>
  );
}

function Builder({ journey }: { journey: Journey }): ReactNode {
  const { t, locale } = useJourneyText();
  const builder = useJourneyBuilder(journey);
  const phone = useDevice() === 'phone';
  if (phone) return <JourneyBuilderPhone journey={journey} builder={builder} />;
  const { state, selected, index, current, announce, pool, suggestions, documents, autosave } = builder;
  const status = autosave.status;
  const statusLine = saveStatusLine(status);

  return (
    <BuilderFrame breadcrumb={crumbs(t, locale, journey, state.title)} state={state.steps.length === 0 ? 'empty' : 'ready'}>
      <div className="jb-actions">
        <a className="jb-action" href={journeyPath(journey.id)} data-id="journey-preview">
          <Icon name="play" size={14} />
          {t('journey.preview')}
        </a>
        <button type="button" className="jb-action" onClick={autosave.saveNow} disabled={status === 'stale' || status === 'saving'} data-id="journey-save" data-state={status}>
          {t(SAVE_LABEL[status])}
        </button>
        <a className="jb-action jb-action-main" href={publishPath(journey.id)} data-id="journey-submit">
          {t('journey.submit')}
        </a>
      </div>
      <p className="jb-status" role="status" aria-live="polite" data-id="journey-save-status" data-state={status}>
        {statusLine ? t(statusLine) : ''}
        {status === 'stale' && (
          <button type="button" className="jb-status-action" onClick={() => window.location.reload()}>
            {t('journey.status.reload')}
          </button>
        )}
      </p>
      <p className="jb-live" aria-live="polite">
        {announce}
      </p>
      <StepSources t={t} locale={locale} state={state} pool={pool} suggestions={suggestions.load} onRetry={suggestions.refresh} onAdd={builder.add} />
      <StepList
        t={t}
        state={state}
        selected={selected}
        documents={documents}
        onTitle={builder.setTitle}
        onSelect={builder.select}
        onMove={builder.move}
        onRemove={builder.remove}
      />
      <StepEditor t={t} state={state} index={index} step={current} documents={documents} onChange={builder.change} onCover={builder.nextCover} />
    </BuilderFrame>
  );
}
