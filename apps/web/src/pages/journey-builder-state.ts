/**
 * The journey builder's working state (C07 on a desktop, its phone layout on a phone): the steps being edited, the
 * selected one, what the screen announces, the documents to add (the pool and Jev's next steps) and the autosave.
 * Both layouts call `useJourneyBuilder` and only draw it differently.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ApiError } from '../api/api-client';
import { type Journey, type NextStep, type PoolDocument, fetchNextSteps, fetchStepPool } from '../api/journey-api';
import { type JourneyAutosave, useJourneyAutosave } from './journey-autosave';
import { type BuilderState, type EditStep, type StepPatch, addDocument, draftOf, moveStep, nextPlanet, removeStep, startState, updateStep, withSavedIds } from './journey-model';
import { type JourneyMessageKey, useJourneyText } from './journey-messages';
import type { SuggestionsLoad } from './journey-panels';

export type PoolLoad = { status: 'loading' } | { status: 'ready'; documents: PoolDocument[] } | { status: 'failed' };

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

/** What the "Lưu" button says in each autosave state. */
export const SAVE_LABEL = {
  idle: 'journey.save.idle',
  pending: 'journey.save.pending',
  saving: 'journey.save.saving',
  saved: 'journey.save.saved',
  failed: 'journey.save.failed',
  offline: 'journey.save.offline',
  stale: 'journey.save.stale',
} as const satisfies Record<JourneyAutosave['status'], JourneyMessageKey>;

/** The line under the actions for an autosave state worth a sentence; null for the others. */
export function saveStatusLine(status: JourneyAutosave['status']): JourneyMessageKey | null {
  switch (status) {
    case 'saving':
      return 'journey.status.saving';
    case 'saved':
      return 'journey.status.saved';
    case 'failed':
      return 'journey.status.failed';
    case 'offline':
      return 'journey.status.offline';
    case 'stale':
      return 'journey.status.stale';
    default:
      return null;
  }
}

const documentKey = (state: BuilderState): string =>
  state.steps
    .map((s) => s.documentId ?? '')
    .filter(Boolean)
    .join(',');

export interface JourneyBuilder {
  state: BuilderState;
  /** The key of the selected step. */
  selected: string | null;
  select(key: string | null): void;
  /** The selected step and its place; -1 and undefined when none is. */
  index: number;
  current: EditStep | undefined;
  /** The last change, read out by a live region. */
  announce: string;
  pool: PoolLoad;
  suggestions: { load: SuggestionsLoad; refresh(): void };
  /** Every document the screen can name: the steps', the pool's and Jev's. */
  documents: ReadonlyMap<string, PoolDocument>;
  autosave: JourneyAutosave;
  add(doc: PoolDocument | NextStep): void;
  move(from: number, to: number): void;
  remove(at: number): void;
  /** Changes the selected step. */
  change(patch: StepPatch): void;
  setTitle(title: string): void;
  nextCover(): void;
}

export function useJourneyBuilder(journey: Journey): JourneyBuilder {
  const { t } = useJourneyText();
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

  return {
    state,
    selected,
    select: setSelected,
    index,
    current,
    announce,
    pool,
    suggestions,
    documents,
    autosave,
    add,
    move,
    remove,
    change,
    setTitle: (title) => edit((s) => ({ ...s, title })),
    nextCover: () => edit((s) => ({ ...s, planet: nextPlanet(s.planet) })),
  };
}
