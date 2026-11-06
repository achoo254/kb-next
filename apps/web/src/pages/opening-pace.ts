/**
 * The pace of the Universe's opening card (S02 B: Xác thực, Tải vũ trụ, Sẵn sàng). The work behind it (the session,
 * then the Universe's data) is often done in a blink, which made only the first step tick before the page moved on.
 * Each finished step now shows its tick for a beat (OPENING_STEP_MS), all three show done, and the card stays at least
 * OPENING_MIN_MS in all; work slower than that is never held up beyond the last step's beat. With reduced motion the
 * steps follow the work as it goes and only the final state is held for a beat.
 *
 * The clock starts when the first opening card of the page shows, so the card of the session check (app.tsx) and the
 * one of the Universe's data (universe-entry.tsx) count as one opening.
 */
import { useEffect, useState } from 'react';
import { prefersReducedMotion } from '../ui/display-prefs';
import type { OpeningStage } from './auth-cards';

export const OPENING_STEP_MS = 350;
export const OPENING_MIN_MS = 1200;

const ORDER: readonly OpeningStage[] = ['auth', 'universe', 'ready'];

let startedAt: number | null = null;

/** Milliseconds since the page's first opening card (0 on the first call). */
function elapsed(): number {
  // the page's own clock: a fixed wall clock (a screen pinned to a date) must not stop the beats
  const now = performance.now();
  startedAt ??= now;
  return now - startedAt;
}

/** Starts the opening clock again (each test; a page load starts it fresh). */
export function resetOpeningClock(): void {
  startedAt = null;
}

/** The stage shown `ms` into the opening when the work is at `actual`: at most one more step per beat. */
export function pacedStage(actual: OpeningStage, ms: number, reduced: boolean): OpeningStage {
  const reached = ORDER.indexOf(actual);
  if (reduced) return actual;
  return ORDER[Math.min(reached, Math.floor(ms / OPENING_STEP_MS))] ?? actual;
}

/**
 * When the card may give way, `ms` into the opening, for work done `doneAt` ms in: once "Sẵn sàng" has shown done for a
 * beat and the minimum time has passed (with reduced motion: a beat after the work was done).
 */
export function openingEndsAt(doneAt: number, reduced: boolean): number {
  if (reduced) return doneAt + OPENING_STEP_MS;
  const readyShown = Math.max(doneAt, (ORDER.length - 1) * OPENING_STEP_MS);
  return Math.max(OPENING_MIN_MS, readyShown + OPENING_STEP_MS);
}

/** Re-renders at `at` ms into the opening (when the next step may show), again if a timer fires a hair early. */
function useWakeAt(at: number | null): void {
  const [tick, setTick] = useState(0);
  useEffect(() => {
    if (at === null) return undefined;
    const wait = Math.ceil(Math.max(0, at - elapsed()));
    const timer = window.setTimeout(() => setTick((n) => n + 1), wait);
    return () => window.clearTimeout(timer);
  }, [at, tick]);
}

/** The stage the opening card shows for work at `actual`. */
export function usePacedStage(actual: OpeningStage): OpeningStage {
  const [reduced] = useState(prefersReducedMotion);
  const ms = elapsed();
  const shown = pacedStage(actual, ms, reduced);
  const next = shown === actual ? null : (ORDER.indexOf(shown) + 1) * OPENING_STEP_MS;
  useWakeAt(next);
  return shown;
}

/** Whether the opening is over: the work is done (`done`) and its card has had its beats. */
export function useOpeningFinished(done: boolean): boolean {
  const [reduced] = useState(prefersReducedMotion);
  // when the work was done, noted as it happens (React's "adjust state while rendering")
  const [doneAt, setDoneAt] = useState<number | null>(null);
  if (done && doneAt === null) setDoneAt(elapsed());
  if (!done && doneAt !== null) setDoneAt(null);
  const endsAt = doneAt === null ? null : openingEndsAt(doneAt, reduced);
  const finished = endsAt !== null && elapsed() >= endsAt;
  useWakeAt(finished ? null : endsAt);
  return finished;
}
