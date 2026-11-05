/**
 * Autosave of the journey builder (C07): every change is sent 800 ms after editing pauses (board Interaction: "Tự lưu
 * sau 800ms ngừng gõ"), "Lưu" sends at once, and leaving the page sends what is pending with a request that outlives
 * it. Each save carries the `rev` the journey was at; a newer save from another tab stops autosave (`stale`) until
 * the page is reloaded. The states of the "Lưu" button:
 * - `idle`: nothing changed since the journey opened ("Lưu");
 * - `pending`: changed, waiting for the pause; `saving`: on its way ("Đang lưu…"); `saved`: stored ("Đã lưu ✓");
 * - `offline`: no connection, sent again once it is back; `failed`: the server refused or failed; `stale`.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { ApiError, NETWORK_ERROR } from '../api/api-client';
import { type JourneyDraft, saveJourney } from '../api/journey-api';
import type { EditStep } from './journey-model';

export const SAVE_DELAY_MS = 800;

export type SaveStatus = 'idle' | 'pending' | 'saving' | 'saved' | 'failed' | 'offline' | 'stale';

export interface Snapshot {
  draft: JourneyDraft;
  /** The steps as sent, with their page keys (to give new ones the ids the server answers). */
  steps: readonly EditStep[];
}

interface AutosaveOptions {
  id: string;
  /** The journey's `rev` when it opened. */
  rev: string;
  /** What to save now (read when the save starts). */
  snapshot(): Snapshot;
  /** A save landed: the ids of the steps it sent, in order. */
  onSaved(steps: readonly EditStep[], stepIds: readonly string[]): void;
  save?: typeof saveJourney;
}

export interface JourneyAutosave {
  status: SaveStatus;
  /** Call after every change the author makes. */
  changed(): void;
  /** "Lưu": send what is pending now. */
  saveNow(): void;
}

export function useJourneyAutosave({ id, rev, snapshot, onSaved, save = saveJourney }: AutosaveOptions): JourneyAutosave {
  const [status, setStatus] = useState<SaveStatus>('idle');
  const revRef = useRef(rev);
  /** Changes made so far, and how many of them the server has. */
  const edits = useRef(0);
  const savedEdits = useRef(0);
  const inFlight = useRef(false);
  const stopped = useRef(false);
  const timer = useRef<number | null>(null);
  const latest = useRef({ snapshot, onSaved, save });
  useEffect(() => {
    latest.current = { snapshot, onSaved, save };
  });

  const runRef = useRef<() => Promise<void>>(() => Promise.resolve());
  const schedule = useCallback((delay: number) => {
    if (timer.current !== null) window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => void runRef.current(), delay);
  }, []);

  const run = useCallback(async (): Promise<void> => {
    if (timer.current !== null) window.clearTimeout(timer.current);
    timer.current = null;
    if (stopped.current || inFlight.current || edits.current === savedEdits.current) return;
    const upTo = edits.current;
    const sent = latest.current.snapshot();
    inFlight.current = true;
    setStatus('saving');
    try {
      const saved = await latest.current.save(id, sent.draft, revRef.current);
      revRef.current = saved.rev;
      savedEdits.current = upTo;
      latest.current.onSaved(sent.steps, saved.stepIds);
      if (edits.current === upTo) {
        setStatus('saved');
      } else {
        setStatus('pending');
        schedule(SAVE_DELAY_MS);
      }
    } catch (error) {
      if (error instanceof ApiError && error.code === 'stale') {
        stopped.current = true;
        setStatus('stale');
      } else if (error instanceof ApiError && error.code === NETWORK_ERROR) {
        setStatus('offline');
      } else {
        if (!(error instanceof ApiError)) console.error('journey save failed', error);
        setStatus('failed');
      }
    } finally {
      inFlight.current = false;
    }
  }, [id, schedule]);

  useEffect(() => {
    runRef.current = run;
  }, [run]);

  const changed = useCallback(() => {
    if (stopped.current) return;
    edits.current += 1;
    setStatus('pending');
    schedule(SAVE_DELAY_MS);
  }, [schedule]);

  const saveNow = useCallback(() => void run(), [run]);

  // Back online: send what waited. Leaving: send what is pending, with a request that outlives the page.
  useEffect(() => {
    const onOnline = (): void => void runRef.current();
    const flushOnLeave = (): void => {
      if (stopped.current || inFlight.current || edits.current === savedEdits.current) return;
      const upTo = edits.current;
      latest.current.save(id, latest.current.snapshot().draft, revRef.current, true).then(
        (saved) => {
          revRef.current = saved.rev;
          savedEdits.current = upTo;
        },
        (error: unknown) => console.warn('journey not saved on leaving', error),
      );
    };
    const onHidden = (): void => {
      if (document.visibilityState === 'hidden') flushOnLeave();
    };
    window.addEventListener('online', onOnline);
    window.addEventListener('pagehide', flushOnLeave);
    document.addEventListener('visibilitychange', onHidden);
    return () => {
      window.removeEventListener('online', onOnline);
      window.removeEventListener('pagehide', flushOnLeave);
      document.removeEventListener('visibilitychange', onHidden);
      if (timer.current !== null) window.clearTimeout(timer.current);
      timer.current = null;
      flushOnLeave();
    };
  }, [id]);

  return { status, changed, saveNow };
}
