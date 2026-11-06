/**
 * A journey run's working state (Flow on a desktop, its phone layout on a phone): the steps with the account's
 * progress, the step whose card is open, marking a step done or not (kept on the server), Remix, and the message line.
 */
import { useState } from 'react';
import { ApiError } from '../api/api-client';
import { type Journey, type JourneyStep, createJourney, markStepDone } from '../api/journey-api';
import { journeyEditPath } from '../layout/shell-paths';
import { navigate } from '../router/navigation';
import { CRYSTAL_ART } from '../ui/art';
import { type RunState, currentStep, nextToDo, runState } from './journey-model';
import { type JourneyMessageKey, useJourneyText } from './journey-messages';
import type { ScreenTranslate } from './space-messages';

/** The crystals of the path, in turn (the board's five). */
export const STOP_ART = [CRYSTAL_ART.networking, CRYSTAL_ART.linux, CRYSTAL_ART.kubernetes, CRYSTAL_ART.docker, CRYSTAL_ART.personal] as const;

/** How many colours the path's crystals cycle through (journey-run.css, data-tone). */
export const STOP_TONES = 5;

/** The link of a step's card to its document: a lab is opened as a lab, a quiz taken. */
export function openLabel(t: ScreenTranslate<JourneyMessageKey>, step: JourneyStep): string | null {
  if (!step.document) return null;
  if (step.kind === 'lab') return t('run.open.lab', { title: step.title });
  if (step.kind === 'quiz') return t('run.open.quiz', { title: step.title });
  return t('run.open.read', { title: step.document.title });
}

export interface JourneyRun {
  steps: JourneyStep[];
  state: RunState;
  /** The step to do now; null when every step is done. */
  now: number | null;
  doneCount: number;
  /** The step whose card is open; null shows the finished card. */
  viewed: number | null;
  view(index: number): void;
  /** On to the next step (round to the first). */
  viewNext(): void;
  busy: boolean;
  /** What the message line says: a failure, else a note. */
  error: JourneyMessageKey | null;
  note: JourneyMessageKey | null;
  mark(index: number, done: boolean): Promise<void>;
  remix(): Promise<void>;
}

export function useJourneyRun(journey: Journey): JourneyRun {
  const { t } = useJourneyText();
  // A step whose document the account may not open came without that document's title: a neutral label instead.
  const [steps, setSteps] = useState(() => journey.steps.map((s) => (s.title ? s : { ...s, title: t('journey.privateStep') })));
  // The step whose card is open: the one to do now, until the account picks another.
  const [viewed, setViewed] = useState<number | null>(() => currentStep(journey.steps));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<JourneyMessageKey | null>(null);
  const [note, setNote] = useState<JourneyMessageKey | null>(null);

  const mark = async (index: number, done: boolean): Promise<void> => {
    const step = steps[index];
    if (!step || busy) return;
    setBusy(true);
    setError(null);
    setNote(null);
    const before = steps;
    setSteps(steps.map((s, i) => (i === index ? { ...s, done } : s)));
    try {
      const result = await markStepDone(journey.id, step.id, done);
      const next = before.map((s, i) => (i === index ? { ...s, done: result } : s));
      setSteps(next);
      if (!done && result) setNote('run.readDone');
      // Done: on to the next step still to do (none left: the finished card).
      if (done) setViewed(next.every((s) => s.done) ? null : nextToDo(next, index));
    } catch (failure) {
      if (!(failure instanceof ApiError)) console.error('journey progress failed', failure);
      setSteps(before);
      setError('run.markFailed');
    } finally {
      setBusy(false);
    }
  };

  const remix = async (): Promise<void> => {
    setError(null);
    try {
      navigate(journeyEditPath(await createJourney({ from: journey.id })));
    } catch (failure) {
      if (!(failure instanceof ApiError)) console.error('journey remix failed', failure);
      setError('run.remixFailed');
    }
  };

  return {
    steps,
    state: runState(steps),
    now: currentStep(steps),
    doneCount: steps.filter((s) => s.done).length,
    viewed,
    view: (index) => {
      setViewed(index);
      setNote(null);
    },
    viewNext: () => setViewed((current) => (steps.length === 0 ? null : ((current ?? -1) + 1) % steps.length)),
    busy,
    error,
    note,
    mark,
    remix,
  };
}
