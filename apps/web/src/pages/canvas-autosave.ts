/**
 * Autosave of a Canvas (C15): every change is copied at once into this browser (localStorage, synchronous, so it
 * survives the tab closing mid-change) and sent to the server 800 ms after editing pauses (board Interaction: "Tự lưu
 * sau 800ms ngừng gõ"). Hiding or closing the page sends what is pending with a keepalive request; a copy the server
 * never got is restored the next time the canvas opens. Each save carries a change counter (`rev`, never smaller than
 * the clock in ms), so a late request never overwrites a newer state; a newer save from another tab stops autosave
 * (`stale`) until the page is reloaded.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { ApiError, NETWORK_ERROR } from '../api/api-client';
import { type CanvasData, CanvasDataSchema, saveCanvas } from '../api/canvas-api';
import type { CanvasState } from './canvas-model';

export const SAVE_DELAY_MS = 800;
/** The status shown after the breadcrumb: saved ("tự lưu"), waiting for the pause, saving, or why it is not saved. */
export type SaveStatus = 'saved' | 'pending' | 'saving' | 'failed' | 'offline' | 'stale';

export interface CanvasDraft {
  id: string;
  title: string;
  canvas: CanvasData;
}

const draftKey = (id: string): string => `kb.canvas.draft.${id}`;

/** The copy kept in this browser for a canvas, when it is one this code wrote. */
export function readDraft(id: string): CanvasDraft | null {
  try {
    const raw = window.localStorage.getItem(draftKey(id));
    if (!raw) return null;
    const value: unknown = JSON.parse(raw);
    if (typeof value !== 'object' || value === null || !('id' in value) || value.id !== id || !('title' in value) || typeof value.title !== 'string') return null;
    // The server checks every card again when the draft is saved; here only the shape.
    const canvas = CanvasDataSchema.safeParse('canvas' in value ? value.canvas : null);
    return canvas.success ? { id, title: value.title, canvas: canvas.data } : null;
  } catch {
    return null;
  }
}

function writeDraft(draft: CanvasDraft): void {
  try {
    window.localStorage.setItem(draftKey(draft.id), JSON.stringify(draft));
  } catch (error) {
    // Storage full or blocked: the server save still runs; only the close-the-tab safety net is lost.
    console.warn('canvas draft not kept', error);
  }
}

export function clearDraft(id: string): void {
  try {
    window.localStorage.removeItem(draftKey(id));
  } catch {
    // Nothing to clear.
  }
}

/** The next change counter: above the last one, and never below the clock (the newest edit wins across tabs). */
export function nextRev(previous: number, now: number = Date.now()): number {
  return Math.max(previous + 1, now);
}

interface AutosaveOptions {
  id: string;
  /** The board as edited (each change is a new object). */
  state: CanvasState;
  /** The counter of the state the canvas opened with. */
  rev: number;
  /** The opened state was a restored draft the server has not got yet: save it straight away. */
  unsaved: boolean;
}

export function useAutosave({ id, state, rev, unsaved }: AutosaveOptions): { status: SaveStatus; retry(): void } {
  const [status, setStatus] = useState<SaveStatus>(unsaved ? 'pending' : 'saved');
  const latest = useRef<CanvasDraft>({ id, title: state.title, canvas: { rev, cards: state.cards, connections: state.connections } });
  const savedRev = useRef(unsaved ? -1 : rev);
  const inFlight = useRef(false);
  const timer = useRef<number | null>(null);
  const stopped = useRef(false);
  /** The state last seen: an effect run without a new state (the first one, React's double run) is no change. */
  const seen = useRef(state);

  // The save that runs when a timer fires: the latest `save` (a timer set inside `save` calls it again).
  const saveRef = useRef<() => Promise<void>>(() => Promise.resolve());
  const schedule = useCallback((delay: number) => {
    if (timer.current !== null) window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => void saveRef.current(), delay);
  }, []);

  const save = useCallback(async (): Promise<void> => {
    if (timer.current !== null) window.clearTimeout(timer.current);
    timer.current = null;
    if (stopped.current || inFlight.current) return;
    const draft = latest.current;
    if (draft.canvas.rev === savedRev.current) return;
    inFlight.current = true;
    setStatus('saving');
    try {
      await saveCanvas(draft.id, draft.title, draft.canvas);
      savedRev.current = draft.canvas.rev;
      if (latest.current.canvas.rev === draft.canvas.rev) {
        clearDraft(draft.id);
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
        if (!(error instanceof ApiError)) console.error('canvas save failed', error);
        setStatus('failed');
      }
    } finally {
      inFlight.current = false;
    }
  }, [schedule]);

  useEffect(() => {
    saveRef.current = save;
  }, [save]);

  // Every change: a new counter, the copy in this browser at once, the server after the pause.
  useEffect(() => {
    if (state === seen.current) {
      if (unsaved && savedRev.current === -1 && timer.current === null) schedule(0);
      return;
    }
    seen.current = state;
    if (stopped.current) return;
    const draft: CanvasDraft = { id, title: state.title, canvas: { rev: nextRev(latest.current.canvas.rev), cards: state.cards, connections: state.connections } };
    latest.current = draft;
    writeDraft(draft);
    setStatus('pending');
    schedule(SAVE_DELAY_MS);
  }, [id, state, unsaved, schedule]);

  // Back online: send what waited. Leaving: send what is pending now, with a request that outlives the page.
  useEffect(() => {
    const onOnline = (): void => void save();
    const flushOnLeave = (): void => {
      const draft = latest.current;
      if (stopped.current || draft.canvas.rev === savedRev.current) return;
      saveCanvas(draft.id, draft.title, draft.canvas, true).then(
        () => {
          savedRev.current = draft.canvas.rev;
          clearDraft(draft.id);
        },
        // The copy in this browser stays: it is restored when the canvas opens again.
        () => undefined,
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
  }, [save]);

  const retry = useCallback(() => void save(), [save]);
  return { status, retry };
}
