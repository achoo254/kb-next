/**
 * One Copilot question and its answer, shared by C14, the C09 panel and the reader's AI card (C11): the request,
 * the stream of /api/ask turned into a turn, and the F02 state that turn is in. The screens only draw a turn
 * (copilot-turn.tsx); every state comes from the API or the browser:
 *
 * - A "đang nghĩ": stage `searching` / `writing` (status events), "Dừng" aborts the request (nothing is saved);
 * - B `NO_ANSWER`, C `USER_KEY_REJECTED`, D `USER_KEY_NO_CREDIT`: stream errors (the server never called the provider
 *   on B);
 * - E `status.jev === 'off'`: keyword search only, shown with the answer;
 * - F offline: the browser has no connection when asking (or loses it before the server answered): the question waits
 *   and is sent once the browser is back online;
 * - G a `check` citation with `supported: false` (or, in the history, a source the reader can no longer open);
 * - H `PROVIDER_FAILED` / `INTERNAL` or a stream cut short: the text already written stays, "Thử lại" asks again;
 * - before the stream: 403 `NO_USER_KEY` (no working key), `USER_KEY_UNREADABLE`, 429, 503 `USER_KEYS_DISABLED`,
 *   404 for a scope the reader cannot see.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { ApiError, NETWORK_ERROR } from '../api/api-client';
import {
  type AskRequest,
  type CitationCheck,
  type CopilotHistoryItem,
  type CopilotSource,
  STREAM_ERRORS,
  type StreamErrorCode,
  streamAsk,
} from '../api/copilot-api';
import { type AiProvider, type KeysResponse, fetchKeys, saveKeyPrefs } from '../api/keys-api';
import { useSessionState } from '../layout/session-context';

export type CopilotStage = 'queued' | 'searching' | 'writing' | 'done' | 'stopped' | 'failed';

/** Why a question got no (complete) answer. */
export type CopilotFailure =
  | 'no-answer'
  | 'key-rejected'
  | 'no-credit'
  | 'model-unavailable'
  | 'interrupted'
  | 'not-sent'
  | 'no-key'
  | 'key-unreadable'
  | 'rate-limited'
  | 'off'
  | 'scope-missing'
  | 'too-long'
  /** A guest asked: the Copilot needs an account (reading does not). */
  | 'signed-out'
  | 'other';

/** A source of the answer; `available: false` only in the history, for a document the reader can no longer open. */
export type TurnSource = CopilotSource & { available?: boolean };

export interface CopilotTurn {
  request: AskRequest;
  stage: CopilotStage;
  /** `off`: Jev was not reachable, keyword search only (F02 E); null before the first status. */
  jev: 'ok' | 'off' | null;
  /** Passages found so far (the "Đã thấy N đoạn" of the thinking state). */
  found: number;
  sources: TurnSource[];
  text: string;
  /** null until Jev checked the citations (never when `jev` is off). */
  citations: CitationCheck[] | null;
  failure: CopilotFailure | null;
  /** The provider and key that wrote (or refused) the answer. */
  key: { provider: AiProvider; last4?: string } | null;
  /** The saved question (history id) once the answer is done. */
  questionId: string | null;
}

export function newTurn(request: AskRequest, stage: CopilotStage = 'searching'): CopilotTurn {
  return { request, stage, jev: null, found: 0, sources: [], text: '', citations: null, failure: null, key: null, questionId: null };
}

/** A question of the history as a finished turn. */
export function historyTurn(item: CopilotHistoryItem): CopilotTurn {
  return {
    request: { question: item.question, scope: item.scope.id ? { kind: item.scope.kind, id: item.scope.id } : { kind: 'universe' }, task: item.task, selection: item.selection ?? undefined },
    stage: 'done',
    jev: item.citations ? 'ok' : null,
    found: item.sources.length,
    sources: item.sources,
    text: item.answer,
    citations: item.citations,
    failure: null,
    key: { provider: item.provider },
    questionId: item.id,
  };
}

const STREAM_FAILURE: Record<StreamErrorCode, CopilotFailure> = {
  NO_ANSWER: 'no-answer',
  USER_KEY_REJECTED: 'key-rejected',
  USER_KEY_NO_CREDIT: 'no-credit',
  MODEL_UNAVAILABLE: 'model-unavailable',
  PROVIDER_FAILED: 'interrupted',
  INTERNAL: 'interrupted',
};

/** The failure of a request the server refused before streaming. */
export function requestFailure(error: unknown): CopilotFailure {
  if (!(error instanceof ApiError)) return 'other';
  switch (error.code) {
    case 'NO_USER_KEY':
      return 'no-key';
    case 'USER_KEY_UNREADABLE':
      return 'key-unreadable';
    case 'USER_KEYS_DISABLED':
      return 'off';
    case 'rate-limited':
      return 'rate-limited';
    case 'sign-in-required':
      return 'signed-out';
    case 'not-found':
      return 'scope-missing';
    case 'invalid-body':
      return 'too-long';
    case NETWORK_ERROR:
      return 'not-sent';
    default:
      return (STREAM_ERRORS as readonly string[]).includes(error.code) ? 'interrupted' : 'other';
  }
}

function isOnline(): boolean {
  return typeof navigator === 'undefined' || navigator.onLine;
}

/**
 * Streams the answer of `request` into `update` until done, an error, or `signal` aborts (then nothing more is
 * reported). A request that never reached the server while the browser is offline comes back `queued`.
 */
export async function runAsk(request: AskRequest, signal: AbortSignal, update: (turn: CopilotTurn) => void): Promise<void> {
  let turn = newTurn(request);
  const emit = (change: Partial<CopilotTurn>): void => {
    turn = { ...turn, ...change };
    update(turn);
  };
  update(turn);
  let opened = false;
  try {
    for await (const event of streamAsk(request, signal)) {
      opened = true;
      if (signal.aborted) return;
      switch (event.event) {
        case 'status':
          emit({ stage: event.data.stage, jev: event.data.jev, found: Math.max(turn.found, event.data.found) });
          break;
        case 'sources':
          emit({ sources: event.data.sources, found: Math.max(turn.found, event.data.sources.length) });
          break;
        case 'delta':
          emit({ stage: 'writing', text: turn.text + event.data.text });
          break;
        case 'check':
          emit({ citations: event.data.citations });
          break;
        case 'done':
          emit({ stage: 'done', questionId: event.data.questionId, key: { provider: event.data.provider, last4: event.data.last4 } });
          return;
        case 'error': {
          const { code, provider, last4 } = event.data;
          emit({ stage: 'failed', failure: STREAM_FAILURE[code], key: provider ? { provider, last4 } : turn.key });
          return;
        }
      }
    }
    // The stream ended without `done` or `error`: the connection was cut.
    if (!signal.aborted) emit({ stage: 'failed', failure: 'interrupted' });
  } catch (error) {
    if (signal.aborted) return;
    if (!opened && error instanceof ApiError && error.code === NETWORK_ERROR && !isOnline()) {
      emit({ stage: 'queued' });
      return;
    }
    if (!(error instanceof ApiError)) console.error('copilot ask failed', error);
    emit({ stage: 'failed', failure: opened ? 'interrupted' : requestFailure(error) });
  }
}

export interface Copilot {
  turn: CopilotTurn | null;
  /** Asks now, or queues the question while the browser is offline. */
  ask(request: AskRequest): void;
  /** "Dừng": aborts the answer being written (the server saves nothing). */
  stop(): void;
  /** Asks the same question again. */
  retry(): void;
  /** "Huỷ câu hỏi": drops the turn (a queued question is not sent). */
  cancel(): void;
  /** Shows a finished turn (a question of the history). */
  show(turn: CopilotTurn): void;
}

/** The Copilot of a screen: one turn at a time; `onDone` hears each answer the server saved. */
export function useCopilot(onDone?: (turn: CopilotTurn) => void): Copilot {
  const [turn, setTurn] = useState<CopilotTurn | null>(null);
  const controllerRef = useRef<AbortController | null>(null);
  const onDoneRef = useRef(onDone);
  useEffect(() => {
    onDoneRef.current = onDone;
  }, [onDone]);

  const start = useCallback((request: AskRequest) => {
    controllerRef.current?.abort();
    const controller = new AbortController();
    controllerRef.current = controller;
    void runAsk(request, controller.signal, (next) => {
      if (controller.signal.aborted) return;
      setTurn(next);
      if (next.stage === 'done') onDoneRef.current?.(next);
    });
  }, []);

  const ask = useCallback(
    (request: AskRequest) => {
      if (isOnline()) {
        start(request);
        return;
      }
      controllerRef.current?.abort();
      setTurn(newTurn(request, 'queued'));
    },
    [start],
  );

  // A queued question goes out once the browser is back online.
  const queued = turn?.stage === 'queued' ? turn.request : null;
  useEffect(() => {
    if (!queued) return;
    const send = (): void => start(queued);
    window.addEventListener('online', send);
    return () => window.removeEventListener('online', send);
  }, [queued, start]);

  // Leaving the screen stops the answer (and the provider call on the server).
  useEffect(() => () => controllerRef.current?.abort(), []);

  const stop = useCallback(() => {
    controllerRef.current?.abort();
    setTurn((current) => (current && (current.stage === 'searching' || current.stage === 'writing') ? { ...current, stage: 'stopped' } : current));
  }, []);
  const retry = useCallback(() => {
    if (turn) ask(turn.request);
  }, [turn, ask]);
  const cancel = useCallback(() => {
    controllerRef.current?.abort();
    setTurn(null);
  }, []);
  const show = useCallback((next: CopilotTurn) => {
    controllerRef.current?.abort();
    setTurn(next);
  }, []);
  return { turn, ask, stop, retry, cancel, show };
}

/** Whether the answer is still being worked on (the thinking state). */
export function isBusy(turn: CopilotTurn): boolean {
  return turn.stage === 'searching' || turn.stage === 'writing';
}

/** The citation numbers Jev did not find supported by their source, and the sources that cannot be opened. */
export function doubtfulCitations(turn: CopilotTurn): { unsupported: number[]; unavailable: number[] } {
  const unsupported = (turn.citations ?? []).filter((c) => !c.supported).map((c) => c.n);
  const unavailable = turn.sources.filter((s) => s.available === false).map((s) => s.n);
  return { unsupported: [...new Set(unsupported)].sort((a, b) => a - b), unavailable };
}

/** Jev's count of supported citations, or null when the answer was not checked. */
export function citationScore(turn: CopilotTurn): { ok: number; total: number } | null {
  if (!turn.citations || turn.citations.length === 0) return null;
  const numbers = [...new Set(turn.citations.map((c) => c.n))];
  const bad = new Set(turn.citations.filter((c) => !c.supported).map((c) => c.n));
  return { ok: numbers.filter((n) => !bad.has(n)).length, total: numbers.length };
}

export type KeysLoad = { status: 'loading' } | { status: 'ready'; keys: KeysResponse } | { status: 'failed' };

/**
 * The reader's own keys (F03), for the key chip ("Viết bằng key OpenAI ••••a1b2") and F02 D's "Đổi sang …":
 * `switchTo` makes another provider with a working key the Copilot's (its default model) and answers whether it did.
 */
export function useAiKeys(): { load: KeysLoad; switchTo(provider: AiProvider): Promise<boolean> } {
  const session = useSessionState();
  // A guest has no keys to read (and asking answers `signed-out`).
  const guest = session.status === 'ready' && !session.signedIn;
  const [load, setLoad] = useState<KeysLoad>(guest ? { status: 'failed' } : { status: 'loading' });
  useEffect(() => {
    if (guest) return;
    let current = true;
    const refresh = (): void => {
      fetchKeys().then(
        (keys) => current && setLoad({ status: 'ready', keys }),
        (error: unknown) => {
          if (!(error instanceof ApiError)) console.error('keys load failed', error);
          // A failed refresh keeps the keys already shown; only the first load shows the failure.
          if (current) setLoad((previous) => (previous.status === 'ready' ? previous : { status: 'failed' }));
        },
      );
    };
    // Keys are often added or changed in Key riêng (another tab) while this screen stays open: read them again when
    // the reader comes back, so the key chip and status line never stay on "no key".
    const onVisible = (): void => {
      if (document.visibilityState === 'visible') refresh();
    };
    refresh();
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      current = false;
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [guest]);
  const switchTo = useCallback(async (provider: AiProvider): Promise<boolean> => {
    if (load.status !== 'ready') return false;
    const model = load.keys.models[provider][0];
    if (!model) return false;
    try {
      setLoad({ status: 'ready', keys: await saveKeyPrefs({ provider, model: model.id }) });
      return true;
    } catch (error) {
      if (!(error instanceof ApiError)) console.error('key prefs save failed', error);
      return false;
    }
  }, [load]);
  return { load, switchTo };
}

/** Another provider whose key works, for "Đổi sang …" after `failed` (the first in the order of F03). */
export function otherWorkingProvider(keys: KeysResponse, failed: AiProvider | undefined): AiProvider | null {
  return keys.keys.find((entry) => entry.status === 'ok' && entry.provider !== failed)?.provider ?? null;
}
