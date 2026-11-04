/**
 * One Copilot turn as the screens draw it: the question bubble, then the answer or the F02 state it is in
 * (copilot-run.ts). Shared by C14 (`size="full"`), the C09 panel (`compact`) and the F02 board (each state alone), so
 * a state looks the same everywhere. The host lays the pieces out in a flex column and may add its own answer
 * actions (`footer`).
 */
import { type ReactNode, useState } from 'react';
import type { AiProvider } from '../api/keys-api';
import { SHELL_PATHS } from '../layout/shell-paths';
import { ILLUSTRATIONS } from '../ui/art';
import { Button } from '../ui/button';
import { ChatBubble } from '../ui/chat-bubble';
import { Icon } from '../ui/icon';
import { Skeleton } from '../ui/skeleton';
import { Tooltip } from '../ui/tooltip';
import { AnswerText, sourceHref } from './copilot-answer';
import { CREDIT_PLACE, useCopilotText } from './copilot-messages';
import { type CopilotTurn, type KeysLoad, citationScore, doubtfulCitations, otherWorkingProvider } from './copilot-run';
import { PROVIDERS } from './keys-messages';
import './copilot-turn.css';

export type TurnSize = 'full' | 'compact';

export interface TurnActions {
  onStop(): void;
  onRetry(): void;
  onCancel(): void;
  /** F02 D "Đổi sang …": makes another working key the Copilot's, then asks again. */
  onSwitch?(provider: AiProvider): Promise<boolean>;
  /** "Hỏi trong cả Universe" after a scope that cannot be opened. */
  onAskUniverse?(): void;
}

function providerName(provider: AiProvider | undefined): string {
  return provider ? PROVIDERS[provider].name : 'AI';
}

/** A button the API cannot back yet: shown as on the board, disabled, with why. */
export function LaterButton({ label, hint, look = 'soft', className }: { label: string; hint: string; look?: 'main' | 'soft'; className?: string }): ReactNode {
  return (
    <Tooltip text={hint} className={['copilot-later', className].filter(Boolean).join(' ')}>
      {(describedBy) => (
        <Button variant={look === 'main' ? 'rim' : 'glass'} size="lg" disabled block className="copilot-btn" aria-describedby={describedBy}>
          {label}
        </Button>
      )}
    </Tooltip>
  );
}

export function QuestionBubble({ turn, size }: { turn: CopilotTurn; size: TurnSize }): ReactNode {
  const question = turn.request.question ?? '';
  if (!question) return null;
  return (
    <ChatBubble from="user" size={size === 'full' ? 'md' : 'sm'} className={turn.stage === 'queued' ? 'copilot-q copilot-q-queued' : 'copilot-q'}>
      {question}
    </ChatBubble>
  );
}

function StateRow({ art, title, text, tone, children }: { art: ReactNode; title: string; text?: ReactNode; tone?: 'warn'; children?: ReactNode }): ReactNode {
  return (
    <div className="copilot-state" data-tone={tone} data-id="copilot-state">
      {art}
      <div className="copilot-state-text">
        <span className="copilot-state-title">{title}</span>
        {text && <span className="copilot-state-sub">{text}</span>}
        {children}
      </div>
    </div>
  );
}

function Art({ name, size = 56 }: { name: keyof typeof ILLUSTRATIONS; size?: number }): ReactNode {
  return <img className="copilot-art" src={ILLUSTRATIONS[name]} alt="" aria-hidden="true" width={size} height={size} />;
}

/** A spinning orb (the board's "đang nghĩ"); still with reduced motion. */
function ThinkingOrb(): ReactNode {
  return (
    <span className="copilot-orb" aria-hidden="true">
      <span className="copilot-orb-ring" />
      <span className="copilot-orb-ring copilot-orb-ring-inner" />
      <img src={ILLUSTRATIONS['ai-core']} alt="" width={44} height={44} />
    </span>
  );
}

/** F02 A: what Jev found, the answer being written, "Dừng". */
function Thinking({ turn, keys, actions, size }: { turn: CopilotTurn; keys: KeysLoad; actions: TurnActions; size: TurnSize }): ReactNode {
  const { t } = useCopilotText();
  const active = keys.status === 'ready' ? keys.keys.active : null;
  const titles = [...new Set(turn.sources.map((s) => s.title))].slice(0, 2).join(', ');
  const writing = turn.stage === 'writing';
  let title = t('copilot.thinking.searching');
  if (writing) title = active ? t('copilot.thinking.writing', { provider: providerName(active.provider), last4: active.last4 }) : t('copilot.thinking.writingNoKey');
  const sub = turn.found > 0 ? t('copilot.thinking.found', { count: turn.found, titles: titles || '…' }) : t('copilot.thinking.reading');
  return (
    <>
      <div className="copilot-thinking" role="status" aria-live="polite" data-id="copilot-thinking">
        <ThinkingOrb />
        <div className="copilot-state-text">
          <span className="copilot-thinking-title">{title}</span>
          <span className="copilot-thinking-sub">{sub}</span>
        </div>
      </div>
      {turn.text && (
        <div className="copilot-box" data-size={size} aria-busy="true">
          <AnswerText turn={turn} writing />
        </div>
      )}
      {size === 'full' && (
        <div className="copilot-skeletons" aria-hidden="true">
          <Skeleton width={110} height={26} radius={13} tone="glow" />
          <Skeleton width={90} height={26} radius={13} tone="glow" />
        </div>
      )}
      <div className="copilot-actions">
        <Button variant="glass" size="lg" className="copilot-btn copilot-btn-start" onClick={actions.onStop} dataId="copilot-stop">
          {t('copilot.stop')}
        </Button>
      </div>
    </>
  );
}

/** F02 E: Jev was not reachable, the passages come from keyword search only. */
export function JevOffNote({ turn }: { turn: CopilotTurn }): ReactNode {
  const { t } = useCopilotText();
  const top = turn.sources[0];
  const words = (turn.request.question ?? '')
    .toLocaleLowerCase()
    .split(/[^\p{L}\p{N}]+/u)
    .filter((word) => word.length > 2);
  return (
    <div className="copilot-jev-off" role="note" data-id="copilot-jev-off">
      <div className="copilot-jev-off-head">
        <span className="copilot-ring" data-tone="success" aria-hidden="true">
          <span>{t('copilot.jevOff.ring')}</span>
        </span>
        <div className="copilot-state-text">
          <span className="copilot-state-title">{t('copilot.jevOff.title')}</span>
          <span className="copilot-state-sub">{t('copilot.jevOff.text')}</span>
        </div>
      </div>
      <div className="copilot-jev-off-rows">
        {top && (
          <a className="copilot-jev-off-row" href={sourceHref(top)}>
            <span className="copilot-jev-off-dot" aria-hidden="true" />
            <span>
              {top.title.split(/(\s+)/).map((part, i) =>
                words.includes(part.toLocaleLowerCase()) ? <mark key={i}>{part}</mark> : <span key={i}>{part}</span>,
              )}
            </span>
          </a>
        )}
        <span className="copilot-jev-off-row" data-off>
          <span className="copilot-jev-off-dot" data-off aria-hidden="true" />
          {t('copilot.jevOff.semantic')}
        </span>
      </div>
      <span className="copilot-jev-off-note">{t('copilot.jevOff.note')}</span>
    </div>
  );
}

/** F02 G: citations Jev did not find supported, or sources that can no longer be opened. */
export function DoubtWarning({ turn, size }: { turn: CopilotTurn; size: TurnSize }): ReactNode {
  const { t } = useCopilotText();
  const { unsupported, unavailable } = doubtfulCitations(turn);
  if (unsupported.length === 0 && unavailable.length === 0) return null;
  const list = (numbers: number[]): string => numbers.map((n) => `[${n}]`).join(', ');
  const doubtful = [...new Set([...unsupported, ...unavailable])];
  const firstGood = turn.sources.find((s) => !doubtful.includes(s.n) && s.available !== false);
  return (
    <>
      <div className="copilot-doubt" role="alert" data-id="copilot-doubt">
        <Icon name="warning" size={18} strokeWidth={2.2} />
        <span>
          {unsupported.length > 0 && t('copilot.doubt.unsupported', { list: list(unsupported) })}
          {unsupported.length > 0 && unavailable.length > 0 && ' '}
          {unavailable.length > 0 && t('copilot.doubt.unavailable', { list: list(unavailable) })}
        </span>
      </div>
      {size === 'full' && (
        <div className="copilot-actions">
          <LaterButton look="main" className="copilot-btn-grow" label={t('copilot.doubt.reanswer', { list: list(doubtful) })} hint={t('copilot.soon')} />
          {firstGood && (
            <Button variant="glass" size="lg" className="copilot-btn" href={sourceHref(firstGood)} dataId="copilot-open-source">
              {t('copilot.doubt.openSource', { n: firstGood.n })}
            </Button>
          )}
        </div>
      )}
    </>
  );
}

/** Jev's check of the citations, under a finished answer. */
export function CheckChip({ turn }: { turn: CopilotTurn }): ReactNode {
  const { t } = useCopilotText();
  const score = citationScore(turn);
  const doubts = doubtfulCitations(turn);
  let label: string;
  let tone: 'success' | 'warn' | 'muted' = 'muted';
  if (score) {
    const ok = Math.max(0, score.ok - doubts.unavailable.filter((n) => !doubts.unsupported.includes(n)).length);
    label = t('copilot.check.all', { ok, total: score.total });
    tone = ok === score.total ? 'success' : 'warn';
  } else label = t(turn.citations === null ? 'copilot.check.off' : 'copilot.check.none');
  return (
    <span className="copilot-check" data-tone={tone} data-id="copilot-check">
      <Icon name={tone === 'success' ? 'check' : 'info'} size={12} strokeWidth={3} />
      {label}
    </span>
  );
}

/** The answer box of a finished, stopped or cut answer. */
function AnswerBox({ turn, size, footer }: { turn: CopilotTurn; size: TurnSize; footer?: ReactNode }): ReactNode {
  const { t } = useCopilotText();
  if (!turn.text && !footer) return null;
  return (
    <div className="copilot-box" data-size={size} role="region" aria-label={t('copilot.answerLabel')} data-id="copilot-answer">
      {turn.text && <AnswerText turn={turn} />}
      {footer}
    </div>
  );
}

function SourceChips({ turn }: { turn: CopilotTurn }): ReactNode {
  const shown = turn.sources.filter((s) => s.available !== false).slice(0, 3);
  if (shown.length === 0) return null;
  return (
    <div className="copilot-chips">
      {shown.map((source) => (
        <a key={source.n} className="copilot-chip" href={sourceHref(source)}>
          {source.section ? `§ ${source.section}` : source.title}
        </a>
      ))}
    </div>
  );
}

function NoCredit({ turn, keys, actions }: { turn: CopilotTurn; keys: KeysLoad; actions: TurnActions }): ReactNode {
  const { t } = useCopilotText();
  const [switchFailed, setSwitchFailed] = useState(false);
  const provider = turn.key?.provider;
  const other = keys.status === 'ready' ? otherWorkingProvider(keys.keys, provider) : null;
  return (
    <>
      <div className="copilot-state" data-tone="warn" data-plain data-id="copilot-state">
        <span className="copilot-ring" data-tone="warn" aria-hidden="true">
          <span>0$</span>
        </span>
        <div className="copilot-state-text">
          <span className="copilot-state-title">{t('copilot.noCredit.title', { provider: providerName(provider) })}</span>
          <span className="copilot-state-sub">{t('copilot.noCredit.text', { place: provider ? CREDIT_PLACE[provider] : 'Key riêng' })}</span>
        </div>
      </div>
      {switchFailed && (
        <p className="copilot-note" role="alert">
          {t('copilot.switchFailed')}
        </p>
      )}
      <div className="copilot-actions">
        {other && actions.onSwitch && (
          <Button
            variant="rim"
            size="lg"
            className="copilot-btn copilot-btn-grow"
            onClick={() => {
              const onSwitch = actions.onSwitch;
              if (!onSwitch) return;
              void onSwitch(other).then((ok) => {
                setSwitchFailed(!ok);
                if (ok) actions.onRetry();
              });
            }}
            dataId="copilot-switch"
          >
            {t('copilot.switchTo', { provider: providerName(other) })}
          </Button>
        )}
        <Button variant="glass" size="lg" className="copilot-btn copilot-btn-grow" href={SHELL_PATHS.keys} dataId="copilot-open-keys">
          {t('copilot.openKeys')}
        </Button>
      </div>
    </>
  );
}

function Failure({ turn, keys, actions, size }: { turn: CopilotTurn; keys: KeysLoad; actions: TurnActions; size: TurnSize }): ReactNode {
  const { t } = useCopilotText();
  const retry = (
    <Button variant="rim" size="lg" className="copilot-btn copilot-btn-grow" onClick={actions.onRetry} dataId="copilot-retry">
      {t('copilot.retry')}
    </Button>
  );
  const openKeys = (label: string, look: 'warn' | 'soft' = 'warn'): ReactNode =>
    look === 'warn' ? (
      <Button variant="glow" tone="warn" size="lg" className="copilot-btn copilot-btn-grow" href={SHELL_PATHS.keys} dataId="copilot-open-keys">
        {label}
      </Button>
    ) : (
      <Button variant="glass" size="lg" className="copilot-btn copilot-btn-grow" href={SHELL_PATHS.keys} dataId="copilot-open-keys">
        {label}
      </Button>
    );
  const provider = turn.key?.provider;
  switch (turn.failure) {
    case 'no-answer':
      return (
        <>
          <div className="copilot-empty" role="status" data-id="copilot-no-answer">
            <img src={ILLUSTRATIONS['telescope-empty']} alt="" aria-hidden="true" width={size === 'full' ? 96 : 64} height={size === 'full' ? 96 : 64} />
            <span className="copilot-empty-title">{t('copilot.noAnswer.title')}</span>
            <span className="copilot-empty-free">{t('copilot.noAnswer.free')}</span>
          </div>
          <div className="copilot-actions">
            <LaterButton look="main" className="copilot-btn-grow" label={t('copilot.noAnswer.note')} hint={t('copilot.soon')} />
            <LaterButton className="copilot-btn-grow" label={t('copilot.noAnswer.askAnyway')} hint={t('copilot.noAnswer.askAnywayHint')} />
          </div>
        </>
      );
    case 'key-rejected':
      return (
        <>
          <StateRow
            art={<Art name="key-crystal" size={48} />}
            tone="warn"
            title={turn.key?.last4 ? t('copilot.rejected.title', { provider: providerName(provider), last4: turn.key.last4 }) : t('copilot.rejected.titleNoKey', { provider: providerName(provider) })}
            text={t('copilot.rejected.text')}
          />
          {turn.sources.length > 0 && <span className="copilot-note">{t('copilot.rejected.sources')}</span>}
          <SourceChips turn={turn} />
          <div className="copilot-actions">{openKeys(t('copilot.rejected.fix'))}</div>
        </>
      );
    case 'no-credit':
      return <NoCredit turn={turn} keys={keys} actions={actions} />;
    case 'interrupted':
      return (
        <>
          <AnswerBox turn={turn} size={size} />
          <StateRow
            art={<Art name="crystal-cracked" />}
            title={t('copilot.cut.title')}
            text={turn.text ? t('copilot.cut.text', { count: turn.sources.length }) : t('copilot.cut.textEmpty')}
          />
          <span className="copilot-note">{t('copilot.cut.note')}</span>
          <div className="copilot-actions">
            {retry}
            <Button variant="glass" size="lg" className="copilot-btn copilot-btn-grow" href={SHELL_PATHS.keys} dataId="copilot-change-model">
              {t('copilot.changeModel')}
            </Button>
          </div>
        </>
      );
    case 'no-key':
      return (
        <>
          <StateRow art={<Art name="key-crystal" size={64} />} tone="warn" title={t('copilot.noKey.title')} text={t('copilot.noKey.text')} />
          <div className="copilot-actions">{openKeys(t('copilot.openKeys'))}</div>
        </>
      );
    case 'key-unreadable':
      return (
        <>
          <StateRow art={<Art name="key-crystal" size={48} />} tone="warn" title={t('copilot.unreadable.title')} text={t('copilot.unreadable.text')} />
          <div className="copilot-actions">{openKeys(t('copilot.unreadable.fix'))}</div>
        </>
      );
    case 'rate-limited':
      return (
        <>
          <StateRow art={<Art name="satellite-repair" />} title={t('copilot.rateLimited.title')} text={t('copilot.rateLimited.text')} />
          <div className="copilot-actions">{retry}</div>
        </>
      );
    case 'off':
      return <StateRow art={<Art name="vault-lock" />} title={t('copilot.off.title')} text={t('copilot.off.text')} />;
    case 'scope-missing':
      return (
        <>
          <StateRow art={<Art name="wormhole-gate" />} title={t('copilot.scopeMissing.title')} text={t('copilot.scopeMissing.text')} />
          {actions.onAskUniverse && (
            <div className="copilot-actions">
              <Button variant="rim" size="lg" className="copilot-btn copilot-btn-grow" onClick={actions.onAskUniverse} dataId="copilot-ask-universe">
                {t('copilot.askUniverse')}
              </Button>
            </div>
          )}
        </>
      );
    case 'too-long':
      return <StateRow art={<Art name="crystal-cracked" />} title={t('copilot.tooLong.title')} text={t('copilot.tooLong.text')} />;
    case 'not-sent':
      return (
        <>
          <StateRow art={<Art name="planet-offline" />} title={t('copilot.notSent.title')} text={t('copilot.notSent.text')} />
          <div className="copilot-actions">{retry}</div>
        </>
      );
    default:
      return (
        <>
          <StateRow art={<Art name="satellite-repair" />} title={t('copilot.other.title')} text={t('copilot.other.text')} />
          <div className="copilot-actions">{retry}</div>
        </>
      );
  }
}

interface TurnViewProps {
  turn: CopilotTurn;
  keys: KeysLoad;
  actions: TurnActions;
  size: TurnSize;
  /** Actions under a finished answer (C14: copy, retry, create from the answer). */
  footer?: ReactNode;
}

/** The question and its answer or state. */
export function TurnView({ turn, keys, actions, size, footer }: TurnViewProps): ReactNode {
  const { t } = useCopilotText();
  let body: ReactNode;
  switch (turn.stage) {
    case 'queued':
      body = (
        <>
          <StateRow art={<Art name="planet-offline" />} title={t('copilot.queued.title')} text={t('copilot.queued.text')} />
          <div className="copilot-actions">
            <Button variant="glass" size="lg" className="copilot-btn copilot-btn-start" onClick={actions.onCancel} dataId="copilot-cancel">
              {t('copilot.queued.cancel')}
            </Button>
          </div>
        </>
      );
      break;
    case 'searching':
    case 'writing':
      body = <Thinking turn={turn} keys={keys} actions={actions} size={size} />;
      break;
    case 'stopped':
      body = (
        <>
          <AnswerBox turn={turn} size={size} />
          <p className="copilot-note" role="status">
            {t('copilot.stopped')}
          </p>
          <div className="copilot-actions">
            <Button variant="rim" size="lg" className="copilot-btn copilot-btn-start" onClick={actions.onRetry} dataId="copilot-retry">
              {t('copilot.retry')}
            </Button>
          </div>
        </>
      );
      break;
    case 'failed':
      body = <Failure turn={turn} keys={keys} actions={actions} size={size} />;
      break;
    case 'done':
      body = (
        <AnswerBox
          turn={turn}
          size={size}
          footer={
            <>
              <DoubtWarning turn={turn} size="compact" />
              {footer}
            </>
          }
        />
      );
      break;
  }
  return (
    <>
      <QuestionBubble turn={turn} size={size} />
      {turn.jev === 'off' && turn.stage !== 'failed' && turn.stage !== 'queued' && <JevOffNote turn={turn} />}
      {body}
    </>
  );
}
