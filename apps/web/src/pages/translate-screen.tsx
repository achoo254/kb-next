/**
 * "Dịch bằng AI" (board F04) at /d/:id/translate: the reader's own model translates a document, paragraph by
 * paragraph, beside the numbered original. The server saves the result as the reader's private draft
 * (`aiTranslated`, not reviewed) and answers its id; "Đọc bản dịch" opens it in the reader in that language.
 *
 * States: loading, translating (progress, caret on the paragraph being written, "Dừng" aborts the stream: nothing is
 * saved), done, stopped, failed (key refused, out of credit or unreadable, provider or connection lost, too many
 * requests, a file or a text too long to translate), no key
 * (403 NO_USER_KEY or no working key: "Mở Key riêng"), own keys off on the server, and a document that cannot be
 * opened (X02 panels). The target language is `?to=vi|en`, by default the other language of the document.
 */
import { type ReactNode, type RefObject, useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { ApiError } from '../api/api-client';
import { type DocumentView, LANGS, fetchDocument } from '../api/content-api';
import { STREAM_ERRORS, type StreamErrorCode, streamTranslation } from '../api/copilot-api';
import { type KeysResponse, fetchKeys } from '../api/keys-api';
import { AppShell, SHELL_PATHS } from '../layout/app-shell';
import { ILLUSTRATIONS } from '../ui/art';
import { Badge } from '../ui/badge';
import { Button } from '../ui/button';
import { Skeleton } from '../ui/skeleton';
import { ErrorPanel } from './error-screen';
import { ReaderMarkdown } from './reader-markdown';
import { type ReaderFailure, readerLoadError } from './reader-screen';
import { NATIVE_LANGUAGE, type TranslateMessageKey, useTranslateText } from './translate-messages';
import { roundedWords, sourceParagraphs, translatedPercent, wordCount } from './translate-source';
import './translate-screen.css';

type Lang = (typeof LANGS)[number];

/** Own keys (F03). */
export const KEYS_PAGE = SHELL_PATHS.keys;

type Setup = { status: 'loading' } | { status: 'failed'; error: ReaderFailure } | { status: 'ready'; view: DocumentView; keys: KeysResponse };

/** Why a translation stopped short. */
export type TranslateFailure = 'rejected' | 'noCredit' | 'unreadable' | 'model' | 'provider' | 'rateLimited' | 'network' | 'notTranslatable' | 'tooLong' | 'other';

export type Run =
  | { phase: 'idle' }
  | { phase: 'streaming'; paragraphs: string[] }
  | { phase: 'done'; paragraphs: string[]; documentId: string }
  | { phase: 'stopped'; paragraphs: string[] }
  | { phase: 'failed'; paragraphs: string[]; failure: TranslateFailure }
  /** 403 NO_USER_KEY: the reader has no working key. */
  | { phase: 'no-key' }
  /** 503 USER_KEYS_DISABLED: own keys are off on this server. */
  | { phase: 'off' };

const FAILURE_TEXT: Record<TranslateFailure, TranslateMessageKey> = {
  rejected: 'translate.error.rejected',
  noCredit: 'translate.error.noCredit',
  unreadable: 'translate.error.unreadable',
  model: 'translate.error.model',
  provider: 'translate.error.provider',
  rateLimited: 'translate.error.rateLimited',
  network: 'translate.error.network',
  notTranslatable: 'translate.error.notTranslatable',
  tooLong: 'translate.error.tooLong',
  other: 'translate.error.other',
};

export function streamFailure(code: StreamErrorCode): TranslateFailure {
  if (code === 'USER_KEY_REJECTED') return 'rejected';
  if (code === 'USER_KEY_NO_CREDIT') return 'noCredit';
  if (code === 'MODEL_UNAVAILABLE') return 'model';
  return code === 'NO_ANSWER' ? 'other' : 'provider';
}

function requestFailure(error: unknown): TranslateFailure {
  if (!(error instanceof ApiError)) return 'other';
  if (error.code === 'rate-limited') return 'rateLimited';
  if (error.code === 'network') return 'network';
  if (error.code === 'not-translatable') return 'notTranslatable';
  if (error.code === 'too-long') return 'tooLong';
  if (error.code === 'USER_KEY_UNREADABLE') return 'unreadable';
  return (STREAM_ERRORS as readonly string[]).includes(error.code) ? 'provider' : 'other';
}

function isLang(value: string | null): value is Lang {
  return value !== null && (LANGS as readonly string[]).includes(value);
}

/** `?to=` when it names a language, else the other language of the document. */
export function targetLanguage(search: string, from: Lang): Lang {
  const asked = new URLSearchParams(search).get('to');
  if (isLang(asked)) return asked;
  return from === 'vi' ? 'en' : 'vi';
}

/** The document `id` itself: the reader's view answers the reader's language, so a translation may come back instead. */
async function fetchOriginal(id: string): Promise<DocumentView> {
  const view = await fetchDocument(id);
  if (view.document.id === id) return view;
  const own = view.translations.find((translation) => translation.id === id);
  return own ? fetchDocument(id, own.lang) : view;
}

function useSetup(id: string): Setup {
  const [result, setResult] = useState<{ id: string; setup: Setup } | null>(null);
  useEffect(() => {
    let current = true;
    void Promise.all([fetchOriginal(id), fetchKeys()]).then(
      ([view, keys]) => {
        if (current) setResult({ id, setup: { status: 'ready', view, keys } });
      },
      (error: unknown) => {
        if (!(error instanceof ApiError)) console.error('translate setup failed', error);
        if (current) setResult({ id, setup: { status: 'failed', error: readerLoadError(error) } });
      },
    );
    return () => {
      current = false;
    };
  }, [id]);
  return result?.id === id ? result.setup : { status: 'loading' };
}

function withParagraph(paragraphs: readonly string[], index: number, text: string): string[] {
  const next = [...paragraphs];
  while (next.length < index) next.push('');
  next[index] = text;
  return next;
}

/** Streams the translation into `update` until done, an error, or `signal` aborts (then nothing more is reported). */
export async function runTranslation(id: string, to: Lang, signal: AbortSignal, update: (run: Run) => void): Promise<void> {
  let paragraphs: string[] = [];
  update({ phase: 'streaming', paragraphs });
  try {
    for await (const event of streamTranslation(id, to, signal)) {
      if (signal.aborted) return;
      if (event.event === 'paragraph') {
        paragraphs = withParagraph(paragraphs, event.data.index, event.data.text);
        update({ phase: 'streaming', paragraphs });
      } else if (event.event === 'done') {
        update({ phase: 'done', paragraphs, documentId: event.data.documentId });
        return;
      } else {
        update({ phase: 'failed', paragraphs, failure: streamFailure(event.data.code) });
        return;
      }
    }
    // The stream ended without `done` or `error`: the connection was cut.
    if (!signal.aborted) update({ phase: 'failed', paragraphs, failure: 'network' });
  } catch (error) {
    if (signal.aborted) return;
    if (error instanceof ApiError && error.code === 'NO_USER_KEY') update({ phase: 'no-key' });
    else if (error instanceof ApiError && error.code === 'USER_KEYS_DISABLED') update({ phase: 'off' });
    else {
      if (!(error instanceof ApiError)) console.error('translation failed', error);
      update({ phase: 'failed', paragraphs, failure: requestFailure(error) });
    }
  }
}

function useTranslationRun(id: string, to: Lang, enabled: boolean): { run: Run; stop(): void; retry(): void } {
  const [run, setRun] = useState<Run>({ phase: 'idle' });
  const [attempt, setAttempt] = useState(0);
  const controllerRef = useRef<AbortController | null>(null);
  useEffect(() => {
    if (!enabled) return;
    const controller = new AbortController();
    controllerRef.current = controller;
    void runTranslation(id, to, controller.signal, (next) => {
      if (!controller.signal.aborted) setRun(next);
    });
    return () => controller.abort();
  }, [id, to, enabled, attempt]);
  const stop = useCallback(() => {
    controllerRef.current?.abort();
    setRun((current) => (current.phase === 'streaming' ? { phase: 'stopped', paragraphs: current.paragraphs } : current));
  }, []);
  const retry = useCallback(() => setAttempt((count) => count + 1), []);
  return { run, stop, retry };
}

/** A list that keeps the row being written (`data-row`) in view as it scrolls. */
function useFollow(current: number): RefObject<HTMLOListElement | null> {
  const listRef = useRef<HTMLOListElement>(null);
  useLayoutEffect(() => {
    const box = listRef.current;
    const row = box?.querySelector<HTMLElement>(`[data-row="${current}"]`);
    if (!box || !row) return;
    const top = row.offsetTop - box.offsetTop;
    const bottom = top + row.offsetHeight;
    if (top < box.scrollTop) box.scrollTop = top;
    else if (bottom > box.scrollTop + box.clientHeight) box.scrollTop = bottom - box.clientHeight;
  }, [current]);
  return listRef;
}

function paragraphsOf(run: Run): readonly string[] {
  return 'paragraphs' in run ? run.paragraphs : [];
}

interface ColumnsProps {
  view: DocumentView;
  keys: KeysResponse;
  to: Lang;
  run: Run;
}

function SourceColumn({ view, rows, current }: { view: DocumentView; rows: readonly string[]; current: number }): ReactNode {
  const { t } = useTranslateText();
  const from = view.document.lang;
  const listRef = useFollow(current);
  return (
    <section className="translate-col translate-col-source" aria-label={t('translate.originalLabel', { lang: t(`translate.lang.${from}`) })} data-id="translate-source">
      <span className="translate-col-label">{t('translate.original', { lang: NATIVE_LANGUAGE[from] })}</span>
      <ol ref={listRef} className="translate-rows" lang={from}>
        {rows.map((text, i) => {
          const n = i + 1;
          return (
            <li key={n} className="translate-row" data-row={n} data-current={n === current || undefined}>
              <span className="translate-num" aria-hidden="true">
                {n}
              </span>
              <div className="translate-text">
                <ReaderMarkdown markdown={text} />
              </div>
            </li>
          );
        })}
      </ol>
    </section>
  );
}

function TranslationRows({ run, count, current, to }: { run: Run; count: number; current: number; to: Lang }): ReactNode {
  const listRef = useFollow(current);
  const paragraphs = paragraphsOf(run);
  const streaming = run.phase === 'streaming';
  return (
    <ol ref={listRef} className="translate-rows" lang={to} data-id="translate-rows">
      {Array.from({ length: count }, (_, i) => {
        const n = i + 1;
        const text = paragraphs[n] ?? '';
        const waiting = streaming && n > current;
        const writing = streaming && n === current;
        return (
          <li key={n} className="translate-row" data-row={n} data-current={writing || undefined} data-state={waiting ? 'waiting' : writing ? 'writing' : 'done'}>
            <span className="translate-num" aria-hidden="true">
              {n}
            </span>
            {waiting ? (
              <span className="translate-wait" aria-hidden="true">
                <Skeleton width="92%" height={10} radius={5} tone="glow" />
                <Skeleton width="70%" height={10} radius={5} tone="glow" />
              </span>
            ) : (
              <div className="translate-text">
                <ReaderMarkdown markdown={text} />
                {writing && (
                  <span className="translate-caret" aria-hidden="true">
                    |
                  </span>
                )}
              </div>
            )}
          </li>
        );
      })}
    </ol>
  );
}

function NoKey({ words }: { words: number }): ReactNode {
  const { t, locale } = useTranslateText();
  return (
    <div className="translate-empty" data-id="translate-no-key">
      <img src={ILLUSTRATIONS['key-crystal']} alt="" aria-hidden="true" width={120} height={120} />
      <h2 className="translate-empty-title">{t('translate.noKey.title')}</h2>
      <p className="translate-empty-text">{t('translate.noKey.text', { words: new Intl.NumberFormat(locale).format(roundedWords(words)) })}</p>
      <Button variant="glow" tone="warn" size="lg" href={KEYS_PAGE} dataId="translate-open-keys">
        {t('translate.openKeys')}
      </Button>
    </div>
  );
}

function Blocked({ title, text, children }: { title: string; text?: string; children?: ReactNode }): ReactNode {
  return (
    <div className="translate-empty" role="status" data-id="translate-blocked">
      <img src={ILLUSTRATIONS['twin-moons-translate']} alt="" aria-hidden="true" width={120} height={120} />
      <h2 className="translate-empty-title">{title}</h2>
      {text && <p className="translate-empty-text">{text}</p>}
      {children}
    </div>
  );
}

/** The sentence under the translation's heading once the run is over. */
function RunNote({ run }: { run: Run }): ReactNode {
  const { t } = useTranslateText();
  if (run.phase === 'done')
    return (
      <p role="status" className="translate-note" data-tone="success" data-id="translate-note">
        {t('translate.done')}
      </p>
    );
  if (run.phase === 'stopped')
    return (
      <p role="status" className="translate-note" data-id="translate-note">
        {t('translate.stopped')}
      </p>
    );
  if (run.phase === 'failed')
    return (
      <p role="alert" className="translate-note" data-tone="warn" data-id="translate-note">
        {t(FAILURE_TEXT[run.failure])}
      </p>
    );
  return null;
}

function TranslationColumn({ view, keys, to, run, current, count }: ColumnsProps & { current: number; count: number }): ReactNode {
  const { t } = useTranslateText();
  const active = keys.active;
  let body: ReactNode;
  if (run.phase === 'no-key') body = <NoKey words={wordCount(sourceParagraphs(view).slice(1))} />;
  else if (run.phase === 'off') body = <Blocked title={t('translate.off.title')} text={t('translate.off.text')} />;
  else if (view.document.lang === to)
    body = (
      <Blocked title={t('translate.error.sameLanguage', { lang: t(`translate.lang.${to}`) })}>
        <Button variant="glass" size="lg" href={`/d/${encodeURIComponent(view.document.id)}`}>
          {t('translate.back')}
        </Button>
      </Blocked>
    );
  else
    body = (
      <>
        <RunNote run={run} />
        <TranslationRows run={run} count={count} current={current} to={to} />
      </>
    );
  const showBy = active && run.phase !== 'no-key' && run.phase !== 'off';
  return (
    <section className="translate-col translate-col-target" aria-label={t('translate.translationLabel', { lang: t(`translate.lang.${to}`) })} data-id="translate-target">
      <div className="translate-col-head">
        <span className="translate-col-label">{t('translate.translation', { lang: NATIVE_LANGUAGE[to] })}</span>
        {showBy && <span className="translate-by">{t('translate.by', { model: active.model, last4: active.last4 })}</span>}
      </div>
      {body}
    </section>
  );
}

function HeaderAction({ run, retry, stop, to }: { run: Run; retry(): void; stop(): void; to: Lang }): ReactNode {
  const { t } = useTranslateText();
  if (run.phase === 'streaming')
    return (
      <Button variant="glass" size="lg" className="translate-stop" onClick={stop} dataId="translate-stop">
        {t('translate.stop')}
      </Button>
    );
  if (run.phase === 'done')
    return (
      <Button variant="glow" size="lg" className="translate-action" href={`/d/${encodeURIComponent(run.documentId)}?lang=${to}`} dataId="translate-read">
        {t('translate.read')}
      </Button>
    );
  if (run.phase === 'stopped' || run.phase === 'failed') {
    const keyProblem = run.phase === 'failed' && (run.failure === 'rejected' || run.failure === 'noCredit' || run.failure === 'unreadable' || run.failure === 'model');
    // Translating the same document again cannot get past these.
    const final = run.phase === 'failed' && (run.failure === 'notTranslatable' || run.failure === 'tooLong');
    return (
      <>
        {keyProblem && (
          <Button variant="ghost" size="lg" className="translate-action" href={KEYS_PAGE} dataId="translate-fix-key">
            {t('translate.openKeys')}
          </Button>
        )}
        {!final && (
          <Button variant="glow" size="lg" className="translate-action" onClick={retry} dataId="translate-again">
            {t('translate.again')}
          </Button>
        )}
      </>
    );
  }
  return null;
}

function TranslateReady({ view, keys }: { view: DocumentView; keys: KeysResponse }): ReactNode {
  const { t } = useTranslateText();
  const from = view.document.lang;
  const to = targetLanguage(window.location.search, from);
  const blocked: Run | null = !keys.available ? { phase: 'off' } : !keys.active ? { phase: 'no-key' } : null;
  const { run: streamed, stop, retry } = useTranslationRun(view.document.id, to, blocked === null && from !== to);
  const run = blocked ?? streamed;

  const source = sourceParagraphs(view).slice(1);
  const translated = paragraphsOf(run);
  const count = Math.max(source.length, translated.length - 1);
  // The highest paragraph the stream has sent: the row being written while streaming (the title is 0).
  const received = translated.length - 1;
  const current = run.phase === 'streaming' ? Math.max(received, 1) : -1;
  const percent = translatedPercent(received, count, run.phase === 'done');

  return (
    <>
      <div className="translate-bar" data-id="translate-bar">
        <h1 className="translate-title">{view.document.title}</h1>
        <span className="translate-langs">
          {from.toUpperCase()} → {to.toUpperCase()}
        </span>
        <Badge variant="pill" tone="warn" className="translate-badge">
          {t('translate.badge')}
        </Badge>
        <div className="translate-progress">
          <span className="translate-track" role="progressbar" aria-label={t('translate.progress')} aria-valuemin={0} aria-valuemax={100} aria-valuenow={percent}>
            <span className="translate-fill" style={{ width: `${percent}%` }} />
          </span>
          <span className="translate-percent">{percent}%</span>
        </div>
        <HeaderAction run={run} retry={retry} stop={stop} to={to} />
      </div>
      <SourceColumn view={view} rows={source} current={current} />
      <img className="translate-link" src={ILLUSTRATIONS['twin-moons-translate']} alt="" aria-hidden="true" width={80} height={80} />
      <TranslationColumn view={view} keys={keys} to={to} run={run} current={current} count={count} />
    </>
  );
}

function TranslateLoading(): ReactNode {
  const { t } = useTranslateText();
  return (
    <div className="translate-bar translate-loading" aria-busy="true" aria-label={t('translate.loading')} data-id="translate-loading">
      <Skeleton width={220} height={18} radius={8} tone="glow" />
      <Skeleton width="60%" height={8} radius={4} tone="glow" />
    </div>
  );
}

export function TranslateScreen({ id }: { id: string }): ReactNode {
  const setup = useSetup(id);
  const view = setup.status === 'ready' ? setup.view : null;
  return (
    <AppShell
      screen="F04"
      rail="spaces"
      veil="strong"
      stars={false}
      spaceHref={view ? `/s/${encodeURIComponent(view.document.space.slug)}` : undefined}
      docHref={`/d/${encodeURIComponent(id)}`}
      className="translate-shell"
    >
      <div className="translate-screen" data-id="translate-screen" data-state={setup.status === 'failed' ? setup.error : setup.status}>
        {setup.status === 'loading' && <TranslateLoading />}
        {setup.status === 'failed' && (
          <div className="translate-error">
            <ErrorPanel kind={setup.error === 'no-access' || setup.error === 'hidden' ? 'forbidden' : setup.error === 'not-found' ? 'not-found' : 'server'} />
          </div>
        )}
        {setup.status === 'ready' && <TranslateReady view={setup.view} keys={setup.keys} />}
      </div>
    </AppShell>
  );
}
