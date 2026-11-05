/**
 * The journey builder (board C07) at /journey/:id/edit, and /journey/new, which creates a draft journey and opens it
 * here. Left: Jev's next steps and the documents to pick from; middle: the journey's steps, reordered by dragging, by
 * Alt + ↑/↓ or by the selected step's arrows; right: the selected step (title, kind, time, source document or note)
 * and the story card. Every change autosaves (journey-autosave.ts). States: loading, the journey, no step yet
 * (`ill-journey-path`), saving / saved / not saved / offline / changed in another tab, locked (waiting for review or
 * published), and a journey not found, someone else's, or failing to load.
 */
import { type ReactNode, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ApiError } from '../api/api-client';
import { type Journey, type NextStep, type PoolDocument, createJourney, fetchJourneyForEditing, fetchNextSteps, fetchStepPool } from '../api/journey-api';
import { AppShell, type BreadcrumbItem, SHELL_PATHS } from '../layout/app-shell';
import { journeyEditPath, journeyPath, publishPath } from '../layout/shell-paths';
import { EmptyState } from '../ui/empty-state';
import { Icon } from '../ui/icon';
import { ErrorPanel } from './error-screen';
import { useJourneyAutosave } from './journey-autosave';
import { type BuilderState, type StepPatch, addDocument, draftOf, moveStep, nextPlanet, removeStep, startState, updateStep, withSavedIds } from './journey-model';
import { type JourneyMessageKey, useJourneyText } from './journey-messages';
import { StepEditor, StepList, StepSources, type SuggestionsLoad } from './journey-panels';
import { spaceName } from './space-panels';
import type { ScreenTranslate } from './space-messages';
import type { Locale } from '../i18n/i18n';
import './journey-builder.css';

type BuilderError = 'not-found' | 'forbidden' | 'locked' | 'server';

type BuilderLoad = { status: 'loading' } | { status: 'ready'; journey: Journey } | { status: 'failed'; error: BuilderError };

export function builderError(error: unknown): BuilderError {
  if (!(error instanceof ApiError)) return 'server';
  if (error.code === 'not-found') return 'not-found';
  if (error.code === 'hidden' || error.code === 'no-access') return 'forbidden';
  if (error.code === 'locked') return 'locked';
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

function BuilderFrame({ breadcrumb, state, children }: { breadcrumb: BreadcrumbItem[]; state: string; children: ReactNode }): ReactNode {
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
      {load.status === 'failed' && load.error === 'locked' && (
        <div className="jb-state">
          <EmptyState art="vault-lock" title={t('journey.locked.title')} description={t('journey.locked.text')} action={{ label: t('journey.locked.action'), href: journeyPath(id) }} dataId="journey-locked" />
        </div>
      )}
      {load.status === 'failed' && load.error !== 'locked' && (
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
      (id) => window.location.replace(journeyEditPath(id)),
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

type PoolLoad = { status: 'loading' } | { status: 'ready'; documents: PoolDocument[] } | { status: 'failed' };

function usePool(id: string): PoolLoad {
  const [load, setLoad] = useState<PoolLoad>({ status: 'loading' });
  useEffect(() => {
    let current = true;
    fetchStepPool(id).then(
      (documents) => {
        if (current) setLoad({ status: 'ready', documents });
      },
      (error: unknown) => {
        if (!(error instanceof ApiError)) console.error('journey pool failed', error);
        if (current) setLoad({ status: 'failed' });
      },
    );
    return () => {
      current = false;
    };
  }, [id]);
  return load;
}

/** Jev's next steps, asked when the builder opens and again after a save changes which documents the steps read. */
function useSuggestions(id: string, available: boolean): { load: SuggestionsLoad; refresh(): void } {
  const [load, setLoad] = useState<SuggestionsLoad>(available ? { status: 'loading' } : { status: 'off' });
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    if (!available) return;
    let current = true;
    fetchNextSteps(id).then(
      (items) => {
        if (current) setLoad({ status: 'ready', items });
      },
      (error: unknown) => {
        if (!current) return;
        if (error instanceof ApiError && error.code === 'jev-off') {
          setLoad({ status: 'off' });
          return;
        }
        if (!(error instanceof ApiError)) console.error('journey suggestions failed', error);
        setLoad({ status: 'failed' });
      },
    );
    return () => {
      current = false;
    };
  }, [id, available, attempt]);
  const refresh = useCallback(() => {
    if (!available) return;
    setLoad((previous) => (previous.status === 'ready' ? previous : { status: 'loading' }));
    setAttempt((n) => n + 1);
  }, [available]);
  return { load, refresh };
}

const SAVE_LABEL = {
  idle: 'journey.save.idle',
  pending: 'journey.save.pending',
  saving: 'journey.save.saving',
  saved: 'journey.save.saved',
  failed: 'journey.save.failed',
  offline: 'journey.save.offline',
  stale: 'journey.save.stale',
} as const satisfies Record<string, JourneyMessageKey>;

const documentKey = (state: BuilderState): string =>
  state.steps
    .map((s) => s.documentId ?? '')
    .filter(Boolean)
    .join(',');

function Builder({ journey }: { journey: Journey }): ReactNode {
  const { t, locale } = useJourneyText();
  const [state, setState] = useState<BuilderState>(() => startState(journey, t('journey.privateStep')));
  const [selected, setSelected] = useState<string | null>(() => journey.steps[0]?.id ?? null);
  const [announce, setAnnounce] = useState('');
  const pool = usePool(journey.id);
  const suggestions = useSuggestions(journey.id, journey.jev);
  const stateRef = useRef(state);
  useEffect(() => {
    stateRef.current = state;
  });
  const suggestedFor = useRef(documentKey(state));

  const untitled = useCallback((n: number) => t('journey.stepUntitled', { n }), [t]);
  const autosave = useJourneyAutosave({
    id: journey.id,
    rev: journey.rev,
    snapshot: () => ({ draft: draftOf(stateRef.current, untitled), steps: stateRef.current.steps }),
    onSaved: (sent, ids) => {
      setState((current) => withSavedIds(current, sent, ids));
      const key = sent
        .map((s) => (s.kind === 'note' ? '' : (s.documentId ?? '')))
        .filter(Boolean)
        .join(',');
      if (key !== suggestedFor.current) {
        suggestedFor.current = key;
        suggestions.refresh();
      }
    },
  });

  const edit = useCallback(
    (change: (current: BuilderState) => BuilderState) => {
      setState(change);
      autosave.changed();
    },
    [autosave],
  );

  // Every document the screen can name: the steps', the pool's and Jev's.
  const documents = useMemo(() => {
    const known = new Map<string, PoolDocument>();
    for (const step of journey.steps) if (step.document) known.set(step.document.id, step.document);
    if (pool.status === 'ready') for (const doc of pool.documents) known.set(doc.id, doc);
    if (suggestions.load.status === 'ready') for (const doc of suggestions.load.items) known.set(doc.id, doc);
    return known;
  }, [journey.steps, pool, suggestions.load]);

  const index = state.steps.findIndex((s) => s.key === selected);
  const current = index >= 0 ? state.steps[index] : undefined;

  const add = (doc: PoolDocument | NextStep): void => {
    if (state.steps.some((s) => s.documentId === doc.id)) return;
    const next = addDocument(state, doc);
    const added = next.steps.at(-1);
    if (next === state || !added) return;
    edit(() => next);
    setSelected(added.key);
    setAnnounce(t('journey.step.added', { title: added.title }));
  };
  const move = (from: number, to: number): void => {
    const next = moveStep(stateRef.current, from, to);
    if (next === stateRef.current) return;
    const moved = next.steps.find((s) => s.key === stateRef.current.steps[from]?.key);
    edit(() => next);
    if (moved) {
      setSelected(moved.key);
      setAnnounce(t('journey.step.moved', { title: moved.title, n: next.steps.indexOf(moved) + 1, count: next.steps.length }));
    }
  };
  const remove = (at: number): void => {
    const gone = state.steps[at];
    if (!gone) return;
    const next = removeStep(state, at);
    edit(() => next);
    setSelected(next.steps[Math.min(at, next.steps.length - 1)]?.key ?? null);
    setAnnounce(t('journey.step.removed', { title: gone.title }));
  };
  const change = (patch: StepPatch): void => {
    if (index < 0) return;
    edit((s) => updateStep(s, index, patch));
  };

  const status = autosave.status;
  const statusLine: JourneyMessageKey | null =
    status === 'saving' ? 'journey.status.saving' : status === 'saved' ? 'journey.status.saved' : status === 'failed' ? 'journey.status.failed' : status === 'offline' ? 'journey.status.offline' : status === 'stale' ? 'journey.status.stale' : null;

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
      <StepSources t={t} locale={locale} state={state} pool={pool} suggestions={suggestions.load} onRetry={suggestions.refresh} onAdd={add} />
      <StepList
        t={t}
        state={state}
        selected={selected}
        documents={documents}
        onTitle={(title) => edit((s) => ({ ...s, title }))}
        onSelect={setSelected}
        onMove={move}
        onRemove={remove}
      />
      <StepEditor
        t={t}
        state={state}
        index={index}
        step={current}
        documents={documents}
        onChange={change}
        onCover={() => edit((s) => ({ ...s, planet: nextPlanet(s.planet) }))}
      />
    </BuilderFrame>
  );
}
