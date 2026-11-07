/**
 * "Trợ lý soạn bài" of the editor (C02, right panel): AI writing on the writer's own key (continue, shorten,
 * outline, explain; the suggestion streams in, then the writer accepts it into the text or drops it), the
 * document's links both ways, and Jev's suggestions (they come with submitting, phase 11).
 */
import type { Editor } from '@tiptap/core';
import { type ReactNode, useCallback, useEffect, useRef, useState } from 'react';
import { ApiError, NETWORK_ERROR } from '../api/api-client';
import { type DocumentLinks, MAX_WRITE_TEXT_CHARS, type WriteTask, WRITE_TASKS, fetchDocumentLinks, streamWrite } from '../api/authoring-api';
import type { DocumentSummary } from '../api/content-api';
import type { StreamErrorCode } from '../api/copilot-api';
import { type KeysResponse, fetchKeys } from '../api/keys-api';
import { SHELL_PATHS } from '../layout/shell-paths';
import { Icon, type IconName } from '../ui/icon';
import { Tabs } from '../ui/tabs';
import { type EditorMessageKey, useEditorText } from './editor-messages';
import { PROVIDERS } from './keys-messages';
import { writeMarkdown } from './editor-markdown';

export type AssistantTab = 'ai' | 'links' | 'jev';

const TASK_LOOK: Record<WriteTask, { label: EditorMessageKey; icon: IconName }> = {
  continue: { label: 'editor.ai.continue', icon: 'arrow-right' },
  shorten: { label: 'editor.ai.shorten', icon: 'shorten' },
  outline: { label: 'editor.ai.outline', icon: 'block-list' },
  explain: { label: 'editor.ai.explain', icon: 'question' },
};

/** Why AI writing could not run, as the sentence to show. */
const FAILURES: Record<StreamErrorCode | 'USER_KEY_UNREADABLE' | 'rate-limited' | 'network' | 'empty', EditorMessageKey> = {
  NO_ANSWER: 'editor.ai.failed',
  USER_KEY_REJECTED: 'editor.ai.rejected',
  USER_KEY_NO_CREDIT: 'editor.ai.noCredit',
  MODEL_UNAVAILABLE: 'editor.ai.model',
  PROVIDER_FAILED: 'editor.ai.cut',
  INTERNAL: 'editor.ai.failed',
  USER_KEY_UNREADABLE: 'editor.ai.unreadable',
  'rate-limited': 'editor.ai.busy',
  network: 'editor.ai.offline',
  empty: 'editor.ai.empty',
};
type Failure = keyof typeof FAILURES;
/** Failures fixed in Own keys: the card links there. */
const KEY_FAILURES: ReadonlySet<Failure> = new Set(['USER_KEY_REJECTED', 'USER_KEY_NO_CREDIT', 'MODEL_UNAVAILABLE', 'USER_KEY_UNREADABLE']);

type KeyState = { kind: 'loading' } | { kind: 'ready'; keys: KeysResponse } | { kind: 'off' } | { kind: 'failed' };

export type AiRun =
  | { stage: 'idle' }
  | { stage: 'writing'; task: WriteTask; text: string }
  | { stage: 'done'; task: WriteTask; text: string }
  | { stage: 'failed'; task: WriteTask; failure: Failure; last4: string }
  | { stage: 'accepted' };

function isFailure(code: string): code is Failure {
  return Object.hasOwn(FAILURES, code);
}

function failureOf(code: string): Failure {
  return isFailure(code) ? code : 'INTERNAL';
}

function useKeys(): KeyState {
  const [state, setState] = useState<KeyState>({ kind: 'loading' });
  useEffect(() => {
    let current = true;
    fetchKeys().then(
      (keys) => current && setState({ kind: 'ready', keys }),
      (error: unknown) => {
        if (!current) return;
        if (error instanceof ApiError && error.code === 'USER_KEYS_DISABLED') setState({ kind: 'off' });
        else setState({ kind: 'failed' });
      },
    );
    return () => {
      current = false;
    };
  }, []);
  return state;
}

/**
 * Runs one AI writing task on the editor's text; the suggestion is inserted only when accepted, then `onAccepted`
 * runs (the autosave marks the save that carries it as AI-made).
 */
export function useAiWriting(editor: Editor | null, title: () => string, onAccepted?: () => void): { run: AiRun; start(task: WriteTask): void; stop(): void; accept(): void; discard(): void } {
  const [run, setRun] = useState<AiRun>({ stage: 'idle' });
  const controller = useRef<AbortController | null>(null);
  const selection = useRef<{ from: number; to: number } | null>(null);

  const stop = useCallback(() => {
    controller.current?.abort();
    controller.current = null;
    setRun((current) => (current.stage === 'writing' ? { stage: 'done', task: current.task, text: current.text } : current));
  }, []);

  useEffect(() => () => controller.current?.abort(), []);

  const start = useCallback(
    (task: WriteTask) => {
      if (!editor) return;
      controller.current?.abort();
      const text = writeMarkdown(editor).slice(-MAX_WRITE_TEXT_CHARS);
      const { from, to } = editor.state.selection;
      const picked = from === to ? '' : editor.state.doc.textBetween(from, to, '\n').trim();
      selection.current = picked ? { from, to } : null;
      if (!text.trim() && !picked && !title().trim()) {
        setRun({ stage: 'failed', task, failure: 'empty', last4: '' });
        return;
      }
      const abort = new AbortController();
      controller.current = abort;
      setRun({ stage: 'writing', task, text: '' });
      void (async () => {
        let written = '';
        try {
          for await (const event of streamWrite({ task, title: title(), text, ...(picked ? { selection: picked } : {}) }, abort.signal)) {
            if (event.event === 'delta') {
              written += event.data.text;
              setRun({ stage: 'writing', task, text: written });
            } else if (event.event === 'error') {
              setRun({ stage: 'failed', task, failure: failureOf(event.data.code), last4: event.data.last4 ?? '' });
              return;
            }
          }
          setRun({ stage: 'done', task, text: written });
        } catch (error) {
          if (abort.signal.aborted) return;
          if (!(error instanceof ApiError)) console.error('AI writing failed', error);
          setRun({ stage: 'failed', task, failure: error instanceof ApiError ? failureOf(error.code === NETWORK_ERROR ? 'network' : error.code) : 'INTERNAL', last4: '' });
        } finally {
          if (controller.current === abort) controller.current = null;
        }
      })();
    },
    [editor, title],
  );

  const accept = useCallback(() => {
    if (!editor || run.stage !== 'done' || !run.text.trim()) return;
    const range = selection.current;
    const chain = editor.chain().focus();
    // "Viết lại ngắn hơn" replaces what was selected; "Viết tiếp" goes at the end; the others where the caret is.
    if (run.task === 'shorten' && range) chain.insertContentAt(range, run.text, { contentType: 'markdown' }).run();
    else if (run.task === 'continue') chain.insertContentAt(editor.state.doc.content.size, run.text, { contentType: 'markdown' }).run();
    else chain.insertContent(run.text, { contentType: 'markdown' }).run();
    onAccepted?.();
    setRun({ stage: 'accepted' });
  }, [editor, run, onAccepted]);

  const discard = useCallback(() => {
    controller.current?.abort();
    controller.current = null;
    setRun({ stage: 'idle' });
  }, []);

  return { run, start, stop, accept, discard };
}

function KeyChip({ keys }: { keys: KeyState }): ReactNode {
  const { t } = useEditorText();
  if (keys.kind === 'loading') return <span className="editor-key editor-key-pending" aria-hidden="true" />;
  if (keys.kind === 'off') return <span className="editor-key" data-tone="warn">{t('editor.key.off')}</span>;
  const active = keys.kind === 'ready' ? keys.keys.active : null;
  if (!active) return <span className="editor-key" data-tone="warn">{t('editor.key.none')}</span>;
  return (
    <span className="editor-key" data-id="editor-key">
      {t('editor.key', { provider: PROVIDERS[active.provider].name, last4: active.last4, model: active.model })}
    </span>
  );
}

function AiTab({ keys, writing }: { keys: KeyState; writing: ReturnType<typeof useAiWriting> }): ReactNode {
  const { t } = useEditorText();
  const { run } = writing;
  const hasKey = keys.kind === 'ready' && keys.keys.active !== null;
  const needsKey = keys.kind === 'ready' && keys.keys.active === null;
  return (
    <div className="editor-ai" data-id="editor-ai">
      <div className="editor-ai-key">
        <KeyChip keys={keys} />
        {hasKey && (
          <a className="editor-key-change" href={SHELL_PATHS.keys} data-id="editor-key-change">
            {t('editor.key.change')}
          </a>
        )}
      </div>
      <div className="editor-ai-actions">
        {WRITE_TASKS.map((task) => {
          const look = TASK_LOOK[task];
          const active = (run.stage === 'writing' || run.stage === 'done') && run.task === task;
          return (
            <button
              key={task}
              type="button"
              className="editor-ai-action"
              aria-pressed={active}
              disabled={!hasKey || run.stage === 'writing'}
              onClick={() => writing.start(task)}
              data-id={`editor-ai-${task}`}
            >
              <Icon name={look.icon} size={16} />
              {t(look.label)}
            </button>
          );
        })}
      </div>
      {needsKey && (
        <div className="editor-card editor-card-warn" data-id="editor-no-key">
          <b>{t('editor.key.needTitle')}</b>
          <span>{t('editor.key.needText')}</span>
          <a className="editor-rim-button" href={SHELL_PATHS.keys}>
            {t('editor.key.open')}
          </a>
        </div>
      )}
      {(run.stage === 'writing' || run.stage === 'done') && (
        <div className="editor-card editor-card-ai" role="region" aria-live="polite" aria-label={t('editor.ai.label')} data-id="editor-ai-suggestion" data-state={run.stage}>
          <span className="editor-ai-title">
            {run.stage === 'writing' && <span className="editor-spinner" aria-hidden="true" />}
            {run.stage === 'writing' ? t('editor.ai.writing', { task: t(TASK_LOOK[run.task].label) }) : t('editor.ai.done')}
          </span>
          <span className="editor-ai-text">{run.text}</span>
          {run.stage === 'done' ? (
            <div className="editor-ai-buttons">
              <button type="button" className="editor-rim-button" onClick={writing.accept} disabled={!run.text.trim()} data-id="editor-ai-accept">
                {t('editor.ai.accept')}
              </button>
              <button type="button" className="editor-glass-button" onClick={writing.discard}>
                {t('editor.ai.discard')}
              </button>
            </div>
          ) : (
            <button type="button" className="editor-glass-button editor-ai-stop" onClick={writing.stop}>
              {t('editor.ai.stop')}
            </button>
          )}
        </div>
      )}
      {run.stage === 'failed' && (
        <div className="editor-card editor-card-warn" role="alert" data-id="editor-ai-failed" data-failure={run.failure}>
          <span>{t(FAILURES[run.failure], { last4: run.last4 })}</span>
          {KEY_FAILURES.has(run.failure) && (
            <a className="editor-glass-button" href={SHELL_PATHS.keys}>
              {t('editor.key.open')}
            </a>
          )}
        </div>
      )}
      {run.stage === 'accepted' && (
        <p className="editor-ai-note" role="status">
          {t('editor.ai.accepted')}
        </p>
      )}
    </div>
  );
}

function OriginBadge({ doc }: { doc: Pick<DocumentSummary, 'origin' | 'status' | 'type'> }): ReactNode {
  const { t } = useEditorText();
  // A text not published (drafts, private ones, and those left from the review gate) is its author's own.
  const origin = doc.status === 'approved' ? doc.origin : 'own';
  const key: EditorMessageKey = origin === 'own' ? (doc.type === 'office' ? 'editor.origin.ownFile' : 'editor.origin.own') : origin === 'official' ? 'editor.origin.official' : 'editor.origin.community';
  return (
    <span className="editor-origin" data-origin={origin}>
      {t(key)}
    </span>
  );
}

function LinksTab({ id }: { id: string }): ReactNode {
  const { t } = useEditorText();
  const [links, setLinks] = useState<DocumentLinks | 'loading' | 'failed'>('loading');
  useEffect(() => {
    let current = true;
    fetchDocumentLinks(id).then(
      (found) => current && setLinks(found),
      () => current && setLinks('failed'),
    );
    return () => {
      current = false;
    };
  }, [id]);
  if (links === 'loading') return <p className="editor-muted" role="status">{t('editor.links.loading')}</p>;
  if (links === 'failed') return <p className="editor-muted" role="alert">{t('editor.links.failed')}</p>;
  const row = (doc: DocumentSummary, icon: boolean): ReactNode => (
    <li key={doc.id}>
      <a className="editor-link-row" href={`/d/${encodeURIComponent(doc.id)}`}>
        {icon ? <Icon name="arrow-up-right" size={16} className="editor-link-icon" /> : <span className="editor-link-dot" aria-hidden="true" />}
        <span className="editor-link-title">{doc.title}</span>
        <OriginBadge doc={doc} />
      </a>
    </li>
  );
  return (
    <div className="editor-links" data-id="editor-links">
      <span className="editor-section">{t('editor.links.in', { count: links.backlinks.length })}</span>
      {links.backlinks.length > 0 ? <ul>{links.backlinks.map((d) => row(d, false))}</ul> : <p className="editor-muted">{t('editor.links.inNone')}</p>}
      <span className="editor-section">{t('editor.links.out', { count: links.outgoing.length })}</span>
      {links.outgoing.length > 0 ? <ul>{links.outgoing.map((d) => row(d, true))}</ul> : <p className="editor-muted">{t('editor.links.outNone')}</p>}
    </div>
  );
}

function JevTab(): ReactNode {
  const { t } = useEditorText();
  return (
    <div className="editor-jev" data-id="editor-jev">
      <span className="editor-jev-title">
        <Icon name="star" size={16} />
        {t('editor.jev.title')}
      </span>
      <p className="editor-card">{t('editor.jev.text')}</p>
    </div>
  );
}

interface AssistantProps {
  id: string;
  writing: ReturnType<typeof useAiWriting>;
  tab: AssistantTab;
  onTab(tab: AssistantTab): void;
  /** Each new value (the `/` menu's "AI viết") focuses the AI tab's first action. */
  focusRequest: number;
}

export function EditorAssistant({ id, writing, tab, onTab, focusRequest }: AssistantProps): ReactNode {
  const { t } = useEditorText();
  const keys = useKeys();
  const panel = useRef<HTMLElement>(null);
  useEffect(() => {
    if (focusRequest === 0) return;
    // After the AI tab shows: its first enabled action, else the tab itself.
    const frame = requestAnimationFrame(() => {
      panel.current?.querySelector<HTMLElement>('.editor-ai-action:not(:disabled), [data-tab="ai"]')?.focus();
    });
    return () => cancelAnimationFrame(frame);
  }, [focusRequest]);
  return (
    <aside ref={panel} className="editor-panel editor-assistant" aria-label={t('editor.assistant')} data-id="editor-assistant">
      <div className="editor-assistant-head">
        <span className="editor-assistant-orb" aria-hidden="true">
          <Icon name="sparkles" size={22} />
        </span>
        <div>
          <div className="editor-assistant-title">{t('editor.assistant')}</div>
          <div className="editor-assistant-sub">{t('editor.assistant.sub')}</div>
        </div>
      </div>
      <Tabs
        label={t('editor.assistant')}
        items={[
          { id: 'ai', label: t('editor.tab.ai') },
          { id: 'links', label: t('editor.tab.links') },
          { id: 'jev', label: t('editor.tab.jev') },
        ]}
        value={tab}
        onChange={(next) => onTab(next === 'links' || next === 'jev' ? next : 'ai')}
        panelIdPrefix="editor-tab"
        className="editor-tabs"
        dataId="editor-tab"
      />
      <div role="tabpanel" id={`editor-tab-${tab}`} className="editor-tabpanel">
        {tab === 'ai' && <AiTab keys={keys} writing={writing} />}
        {tab === 'links' && <LinksTab id={id} />}
        {tab === 'jev' && <JevTab />}
      </div>
    </aside>
  );
}
