/**
 * The reader's AI (board C11): the toolbar over a selected passage ("Giải thích / Tóm tắt / Hỏi Copilot / Đánh dấu")
 * and the AI card under the passage it explains or summarises. Both ask Copilot about the document
 * (`task: explain | summarize`, the selected text, scope `document`) with the turn of C14 (copilot-run.ts), so the
 * card goes through the same F02 states; the side panel's buttons (reader-side.tsx) ask about the current passage
 * or the whole document. Highlights have no storage yet: "Đánh dấu" shows as on the board, disabled.
 */
import { type ReactNode, type RefObject, useCallback, useEffect, useRef, useState } from 'react';
import { type CopilotTask, MAX_SELECTION_CHARS } from '../api/copilot-api';
import { SHELL_PATHS } from '../layout/shell-paths';
import { toBoardPx } from '../layout/board-zoom';
import { Icon } from '../ui/icon';
import { Tooltip } from '../ui/tooltip';
import { AnswerText, sourceHref, sourceTitle } from './copilot-answer';
import { copilotHref } from './copilot-links';
import { type Copilot, type KeysLoad, citationScore, useAiKeys, useCopilot } from './copilot-run';
import { DoubtWarning, TurnView } from './copilot-turn';
import { PROVIDERS } from './keys-messages';
import { useReaderText } from './reader-messages';

export type ReaderTask = Exclude<CopilotTask, 'answer'>;

/** What the AI card answers: the task, what it read, and the passage it shows under. */
export interface ReaderAsk {
  task: ReaderTask;
  /** `selection`: text the reader selected; `passage`: the current passage; `document`: the whole text. */
  about: 'selection' | 'passage' | 'document';
  anchor: string;
  text: string;
  /** The passage's heading, for "Giải thích đoạn “…”". */
  heading?: string | null;
}

/** A selection inside one passage of the article, placed in that passage's own (board) px. */
export interface PassageSelection {
  anchor: string;
  text: string;
  left: number;
  top: number;
}

/** The toolbar sits 60px above the first selected line and 40px in from where the selection starts (board C11). */
const TOOLBAR_RISE = 60;
const TOOLBAR_INSET = 40;

function passageOf(node: Node | null): HTMLElement | null {
  const element = node instanceof HTMLElement ? node : (node?.parentElement ?? null);
  return element?.closest<HTMLElement>('.reader-passage') ?? null;
}

/** The current selection when it lies inside one passage of `article`. */
function readSelection(article: HTMLElement): PassageSelection | null {
  const selection = document.getSelection();
  if (!selection || selection.isCollapsed || selection.rangeCount === 0) return null;
  const range = selection.getRangeAt(0);
  const passage = passageOf(range.startContainer);
  if (!passage || passage !== passageOf(range.endContainer) || !article.contains(passage) || !passage.id) return null;
  const text = selection.toString().replace(/\s+/g, ' ').trim();
  if (!text) return null;
  const first = range.getClientRects()[0] ?? range.getBoundingClientRect();
  const box = passage.getBoundingClientRect();
  // the top of the first line box (the text's rect is shorter than its line); the line height is in board px
  const lineHeight = Number.parseFloat(getComputedStyle(range.startContainer.parentElement ?? passage).lineHeight);
  const lineTop = Number.isFinite(lineHeight) ? first.top - Math.max(0, (toScreenPx(lineHeight) - first.height) / 2) : first.top;
  return {
    anchor: passage.id,
    text: text.slice(0, MAX_SELECTION_CHARS),
    left: Math.max(0, toBoardPx(first.left - box.left)),
    top: toBoardPx(lineTop - box.top),
  };
}

/** Board px to on-screen px (the inverse of toBoardPx). */
function toScreenPx(px: number): number {
  return px / toBoardPx(1);
}

/** Follows the selection inside the article; null when nothing (or something outside a passage) is selected. */
export function usePassageSelection(articleRef: RefObject<HTMLElement | null>): PassageSelection | null {
  const [selected, setSelected] = useState<PassageSelection | null>(null);
  useEffect(() => {
    const onChange = (): void => {
      const article = articleRef.current;
      setSelected(article ? readSelection(article) : null);
    };
    document.addEventListener('selectionchange', onChange);
    return () => document.removeEventListener('selectionchange', onChange);
  }, [articleRef]);
  return selected;
}

export interface ReaderAi {
  copilot: Copilot;
  keys: KeysLoad;
  asked: ReaderAsk | null;
  ask(next: ReaderAsk): void;
}

export function useReaderAi(documentId: string): ReaderAi {
  const copilot = useCopilot();
  const { load: keys } = useAiKeys();
  const [asked, setAsked] = useState<ReaderAsk | null>(null);
  const { ask: askCopilot } = copilot;
  const ask = useCallback(
    (next: ReaderAsk) => {
      setAsked(next);
      askCopilot({ task: next.task, selection: next.text.slice(0, MAX_SELECTION_CHARS), scope: { kind: 'document', id: documentId } });
    },
    [askCopilot, documentId],
  );
  return { copilot, keys, asked, ask };
}

interface ToolbarProps {
  selection: PassageSelection;
  documentId: string;
  /** The task of the card when it answers this very selection (its button shows pressed). */
  pressed: ReaderTask | null;
  onAsk(task: ReaderTask): void;
}

export function SelectionToolbar({ selection, documentId, pressed, onAsk }: ToolbarProps): ReactNode {
  const { t } = useReaderText();
  const question = t('reader.sel.question', { text: selection.text.length > 200 ? `${selection.text.slice(0, 200)}…` : selection.text });
  return (
    <div
      className="reader-sel"
      role="toolbar"
      aria-label={t('reader.sel.label')}
      style={{ left: selection.left + TOOLBAR_INSET, top: selection.top - TOOLBAR_RISE }}
      // keeps the selection while a button is pressed
      onMouseDown={(event) => event.preventDefault()}
      data-id="reader-sel"
    >
      {(['explain', 'summarize'] as const).map((task) => (
        <button key={task} type="button" className="reader-sel-button" aria-pressed={pressed === task} onClick={() => onAsk(task)} data-id={`reader-sel-${task}`}>
          {t(task === 'explain' ? 'reader.sel.explain' : 'reader.sel.summarize')}
        </button>
      ))}
      <a className="reader-sel-button" href={copilotHref(question, { scope: { kind: 'document', id: documentId }, from: documentId })} data-id="reader-sel-ask">
        {t('reader.sel.ask')}
      </a>
      <Tooltip text={t('reader.soon')}>
        {(describedBy) => (
          <button type="button" className="reader-sel-button" disabled aria-describedby={describedBy} data-id="reader-sel-mark">
            {t('reader.sel.mark')}
          </button>
        )}
      </Tooltip>
    </div>
  );
}

function cardTitle(asked: ReaderAsk, t: ReturnType<typeof useReaderText>['t']): string {
  if (asked.about === 'document') return t('reader.ai.summarizeDocument');
  if (asked.about === 'passage' && asked.task === 'explain' && asked.heading) return t('reader.ai.explainPassage', { title: asked.heading });
  return t(asked.task === 'explain' ? 'reader.ai.explainSelection' : 'reader.ai.summarizeSelection');
}

/** The AI card under the passage: the answer with its sources, Jev's check and the key, or its F02 state. */
export function ReaderAiCard({ ai }: { ai: ReaderAi }): ReactNode {
  const { t } = useReaderText();
  const { asked, copilot, keys } = ai;
  const turn = copilot.turn;
  const cardRef = useRef<HTMLDivElement>(null);
  // a card asked from the side panel may open below the fold
  useEffect(() => {
    if (asked && asked.about !== 'selection') cardRef.current?.scrollIntoView({ block: 'nearest' });
  }, [asked]);
  if (!asked || !turn) return null;
  const title = cardTitle(asked, t);

  let body: ReactNode;
  if (turn.failure === 'no-key') {
    return (
      <div ref={cardRef} className="reader-ai-card reader-ai-card-nokey" role="region" aria-label={t('reader.ai.result')} data-id="reader-ai-card" data-state="no-key">
        <span className="reader-ai-card-nokey-text">{t(asked.task === 'explain' ? 'reader.ai.needKeyExplain' : 'reader.ai.needKeySummarize')}</span>
        <a href={SHELL_PATHS.keys} className="reader-ai-addkey reader-ai-card-addkey">
          {t('reader.ai.addKey')}
        </a>
      </div>
    );
  }
  if (turn.stage === 'done') {
    const score = citationScore(turn);
    const key = turn.key;
    const cited = turn.sources.filter((source) => source.available !== false);
    body = (
      <>
        <AnswerText turn={turn} className="reader-ai-card-text" />
        <DoubtWarning turn={turn} size="compact" />
        <div className="reader-ai-card-meta">
          {cited.map((source) => (
            <a key={source.n} className="reader-ai-cite" href={sourceHref(source)} data-id={`reader-ai-cite-${source.n}`}>
              [{source.n}] {sourceTitle(source)}
            </a>
          ))}
          {score && (
            <span className="reader-ai-checked" data-tone={score.ok === score.total ? 'success' : 'warn'}>
              {t('reader.ai.checked', score)}
            </span>
          )}
          {key?.last4 && <span className="reader-ai-key">{t('reader.ai.key', { provider: PROVIDERS[key.provider].name, last4: key.last4 })}</span>}
        </div>
      </>
    );
  } else {
    body = <TurnView turn={turn} keys={keys} actions={{ onStop: copilot.stop, onRetry: copilot.retry, onCancel: copilot.cancel }} size="compact" />;
  }
  return (
    <div ref={cardRef} className="reader-ai-card" role="region" aria-label={t('reader.ai.result')} data-id="reader-ai-card" data-state={turn.failure ?? turn.stage}>
      <span className="reader-ai-card-title">
        <Icon name="sparkles" size={14} />
        {title}
      </span>
      {body}
    </div>
  );
}
