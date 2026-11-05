/**
 * AI Copilot (board C14) at /copilot (copilot-links.ts for its address): the history of the reader's questions
 * (today, yesterday, earlier), the scope chips Universe › Space › Collection › Tài liệu of the page that opened it,
 * the question and its streamed answer with citations and diagrams (copilot-turn.tsx, every F02 state), and the
 * sources of the answer. Answers are written by the reader's own key; Jev finds and checks the sources for free.
 */
import { type ReactNode, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ApiError } from '../api/api-client';
import { type DocumentView, fetchDocument, fetchSpace } from '../api/content-api';
import { type AskScope, type CopilotHistory, fetchCopilotHistory, fetchCopilotQuestion } from '../api/copilot-api';
import { createJourney } from '../api/journey-api';
import { AppShell, type BreadcrumbItem, SHELL_PATHS } from '../layout/app-shell';
import { useDevice } from '../layout/device';
import { PhoneShell } from '../layout/phone-shell';
import { journeyEditPath } from '../layout/shell-paths';
import { AiAvatar } from '../ui/ai-avatar';
import { ILLUSTRATIONS } from '../ui/art';
import { AskInput } from '../ui/ask-input';
import { Button } from '../ui/button';
import { Icon } from '../ui/icon';
import { OriginTag } from '../ui/origin-tag';
import { Skeleton } from '../ui/skeleton';
import { Tooltip } from '../ui/tooltip';
import { sourceHref, sourceTitle } from './copilot-answer';
import { copilotHref, readCopilotLink, sameScope } from './copilot-links';
import { type CopilotMessageKey, useCopilotText } from './copilot-messages';
import { type CopilotTurn, type KeysLoad, historyTurn, useAiKeys, useCopilot } from './copilot-run';
import { CheckChip, LaterButton, TurnView } from './copilot-turn';
import { PROVIDERS } from './keys-messages';
import { usePhoneText } from './phone-messages';
import { originOf } from './space-labels';
import { spaceName } from './space-panels';
import type { ScreenTranslate } from './space-messages';
import './copilot-screen.css';

type HistoryItem = CopilotHistory['items'][number];
type Translate = ScreenTranslate<CopilotMessageKey>;

/** A chip of the scope ladder. */
export interface ScopeChip {
  scope: AskScope;
  label: string;
}

interface ScopeContext {
  chips: ScopeChip[];
  /** The page that opened Copilot ("Mở từ: …"). */
  from: { title: string; href: string } | null;
}

const ZONE = 'Asia/Ho_Chi_Minh';

function dayOf(date: Date): string {
  return date.toLocaleDateString('en-CA', { timeZone: ZONE });
}

/** The history in the groups of the board: today, yesterday and earlier (Saigon days), newest first. */
export function historyGroups(items: readonly HistoryItem[], now: Date = new Date()): Array<{ key: 'today' | 'yesterday' | 'earlier'; items: HistoryItem[] }> {
  const today = dayOf(now);
  const yesterday = dayOf(new Date(now.getTime() - 86_400_000));
  const groups = { today: [] as HistoryItem[], yesterday: [] as HistoryItem[], earlier: [] as HistoryItem[] };
  for (const item of items) {
    const day = dayOf(new Date(item.createdAt));
    if (day === today) groups.today.push(item);
    else if (day === yesterday) groups.yesterday.push(item);
    else groups.earlier.push(item);
  }
  return (['today', 'yesterday', 'earlier'] as const).filter((key) => groups[key].length > 0).map((key) => ({ key, items: groups[key] }));
}

function documentChips(view: DocumentView, t: Translate, locale: 'vi' | 'en'): ScopeChip[] {
  const doc = view.document;
  const chips: ScopeChip[] = [
    { scope: { kind: 'universe' }, label: t('copilot.scope.universe') },
    { scope: { kind: 'space', id: doc.space.slug }, label: t('copilot.scope.space', { name: spaceName(locale, doc.space) }) },
  ];
  if (doc.collection) chips.push({ scope: { kind: 'collection', id: doc.collection.id }, label: t('copilot.scope.collection', { name: spaceName(locale, doc.collection) }) });
  chips.push({ scope: { kind: 'document', id: doc.id }, label: t('copilot.scope.document', { name: doc.title }) });
  return chips;
}

function plainChip(scope: AskScope, t: Translate, name?: string): ScopeChip {
  if (scope.kind === 'universe') return { scope, label: t('copilot.scope.universe') };
  return { scope, label: t(`copilot.scope.${scope.kind}`, { name: name ?? t('copilot.scope.unnamed') }) };
}

/** The scope ladder of the page that opened Copilot, named from the API (ids until then). */
function useScopeContext(scope: AskScope, from: string | undefined): ScopeContext {
  const { t, locale } = useCopilotText();
  const documentId = from ?? (scope.kind === 'document' ? scope.id : undefined);
  const spaceSlug = !documentId && scope.kind === 'space' ? scope.id : undefined;
  const [loaded, setLoaded] = useState<{ key: string; view?: DocumentView; spaceName?: string } | null>(null);
  const key = `${documentId ?? ''}|${spaceSlug ?? ''}|${locale}`;
  useEffect(() => {
    let current = true;
    const done = (value: { view?: DocumentView; spaceName?: string }): void => {
      if (current) setLoaded({ key, ...value });
    };
    const failed = (error: unknown): void => {
      if (!(error instanceof ApiError)) console.error('copilot scope load failed', error);
      done({});
    };
    if (documentId) fetchDocument(documentId, locale).then((view) => done({ view }), failed);
    else if (spaceSlug) fetchSpace(spaceSlug, locale).then((space) => done({ spaceName: spaceName(locale, space.space) }), failed);
    return () => {
      current = false;
    };
  }, [documentId, spaceSlug, locale, key]);

  return useMemo(() => {
    const ready = loaded?.key === key ? loaded : null;
    const universe = plainChip({ kind: 'universe' }, t);
    let chips: ScopeChip[] = [universe];
    let opened: ScopeContext['from'] = null;
    if (ready?.view) {
      chips = documentChips(ready.view, t, locale);
      if (from) opened = { title: ready.view.document.title, href: `/d/${encodeURIComponent(from)}` };
    } else if (scope.kind !== 'universe') chips.push(plainChip(scope, t, ready?.spaceName));
    if (!chips.some((chip) => sameScope(chip.scope, scope))) chips.push(plainChip(scope, t));
    return { chips, from: opened };
  }, [loaded, key, scope, from, t, locale]);
}

function useHistory(): { items: HistoryItem[] | null; failed: boolean; add(item: HistoryItem): void } {
  const [state, setState] = useState<{ items: HistoryItem[] | null; failed: boolean }>({ items: null, failed: false });
  useEffect(() => {
    let current = true;
    fetchCopilotHistory().then(
      // questions answered while the history was loading stay on top
      (history) =>
        current &&
        setState((now) => {
          const added = now.items ?? [];
          return { items: [...added, ...history.items.filter((item) => !added.some((other) => other.id === item.id))], failed: false };
        }),
      (error: unknown) => {
        if (!(error instanceof ApiError)) console.error('copilot history load failed', error);
        if (current) setState((now) => ({ items: now.items ?? [], failed: true }));
      },
    );
    return () => {
      current = false;
    };
  }, []);
  const add = useCallback((item: HistoryItem) => {
    setState((current) => ({ ...current, items: [item, ...(current.items ?? []).filter((other) => other.id !== item.id)] }));
  }, []);
  return { ...state, add };
}

/** Keeps the address on what the screen shows: the scope, where it was opened from, the question of the history. */
function replaceAddress(scope: AskScope, from: string | undefined, item: string | null): void {
  window.history.replaceState(window.history.state, '', copilotHref(undefined, { scope, from, item: item ?? undefined }));
}

function HistoryPanel({ history, activeId, onOpen }: { history: ReturnType<typeof useHistory>; activeId: string | null; onOpen(id: string): void }): ReactNode {
  const { t } = useCopilotText();
  const groups = history.items ? historyGroups(history.items) : [];
  return (
    <nav className="copilot-history" aria-label={t('copilot.history')} data-id="copilot-history">
      {history.items === null && (
        <div className="copilot-history-loading" aria-busy="true">
          <Skeleton width="40%" height={12} radius={6} tone="glow" />
          <Skeleton height={44} radius={12} tone="glow" />
          <Skeleton height={44} radius={12} tone="glow" />
        </div>
      )}
      {history.items !== null && groups.length === 0 && <p className="copilot-history-empty">{t(history.failed ? 'copilot.historyFailed' : 'copilot.historyEmpty')}</p>}
      {groups.map((group) => (
        <div key={group.key} className="copilot-history-group">
          <span className="copilot-history-label">{t(`copilot.${group.key}`)}</span>
          <ul>
            {group.items.map((item) => (
              <li key={item.id}>
                <button type="button" className="copilot-history-item" aria-current={item.id === activeId ? 'true' : undefined} onClick={() => onOpen(item.id)} data-id={`copilot-history-${item.id}`}>
                  {item.question}
                </button>
              </li>
            ))}
          </ul>
        </div>
      ))}
    </nav>
  );
}

function KeyChip({ keys }: { keys: KeysLoad }): ReactNode {
  const { t } = useCopilotText();
  const active = keys.status === 'ready' ? keys.keys.active : null;
  return (
    <a className="copilot-key-chip" href={SHELL_PATHS.keys} data-id="copilot-key-chip">
      {active ? t('copilot.keyChip', { provider: PROVIDERS[active.provider].name, last4: active.last4 }) : t('copilot.keyChipNone')}
    </a>
  );
}

function statusLine(keys: KeysLoad): CopilotMessageKey {
  if (keys.status !== 'ready') return 'copilot.status.key';
  if (!keys.keys.available) return 'copilot.status.off';
  return keys.keys.active ? 'copilot.status.key' : 'copilot.status.noKey';
}

function SourcesPanel({ turn }: { turn: CopilotTurn | null }): ReactNode {
  const { t } = useCopilotText();
  const sources = turn?.sources ?? [];
  return (
    <aside className="copilot-sources" aria-label={t('copilot.sourcesLabel')} data-id="copilot-sources">
      <h2 className="copilot-sources-title">{t('copilot.sources', { count: sources.length })}</h2>
      {sources.length === 0 && <p className="copilot-sources-empty">{t('copilot.sourcesEmpty')}</p>}
      <ol className="copilot-source-list">
        {sources.map((source) => {
          const hidden = source.available === false;
          const path = [source.spaceName, source.collectionName].filter(Boolean).join(' › ');
          const body = (
            <>
              <span className="copilot-source-n" aria-hidden="true">
                {source.n}
              </span>
              <span className="copilot-source-text">
                <span className="copilot-source-title">{hidden ? t('copilot.sourceHidden') : sourceTitle(source)}</span>
                {path && <span className="copilot-source-path">{path}</span>}
                <span className="copilot-source-tags">
                  {hidden ? <span className="copilot-source-hidden">{t('copilot.sourceHidden')}</span> : <OriginTag origin={originOf(source)} variant="inline" className="copilot-origin" />}
                </span>
              </span>
            </>
          );
          return (
            <li key={source.n}>
              {hidden ? (
                <span className="copilot-source" data-hidden>
                  {body}
                </span>
              ) : (
                <a className="copilot-source" href={sourceHref(source)} data-id={`copilot-source-${source.n}`}>
                  {body}
                </a>
              )}
            </li>
          );
        })}
      </ol>
    </aside>
  );
}

/** The actions under a finished answer: Jev's check, copy, ask again, votes, and "create from the answer". */
/** The documents an answer cites that can still be opened, in citation order, once each. */
export function journeyDocuments(turn: Pick<CopilotTurn, 'sources'>): string[] {
  return [...new Set(turn.sources.filter((s) => s.available !== false).map((s) => s.documentId))];
}

/** "Lưu thành lối đi": a draft journey with one step per cited document, opened in the builder (C07). */
function MakeJourney({ turn }: { turn: CopilotTurn }): ReactNode {
  const { t } = useCopilotText();
  const [state, setState] = useState<'idle' | 'busy' | 'failed'>('idle');
  const documents = journeyDocuments(turn);
  if (documents.length === 0) return <LaterButton label={t('copilot.makePath')} hint={t('copilot.makePathNone')} />;
  const make = (): void => {
    setState('busy');
    createJourney({ title: (turn.request.question ?? '').replace(/\s+/g, ' ').trim().slice(0, 200), documents }).then(
      (id) => window.location.assign(journeyEditPath(id)),
      (error: unknown) => {
        if (!(error instanceof ApiError)) console.error('journey from answer failed', error);
        setState('failed');
      },
    );
  };
  return (
    <>
      <Button variant="glass" size="lg" className="copilot-btn" disabled={state === 'busy'} onClick={make} dataId="copilot-make-path">
        {t(state === 'busy' ? 'copilot.makePathBusy' : 'copilot.makePath')}
      </Button>
      {state === 'failed' && (
        <span className="copilot-note" role="alert">
          {t('copilot.makePathFailed')}
        </span>
      )}
    </>
  );
}

function AnswerFooter({ turn, onRetry }: { turn: CopilotTurn; onRetry(): void }): ReactNode {
  const { t } = useCopilotText();
  const [copied, setCopied] = useState(false);
  const copy = (): void => {
    navigator.clipboard.writeText(turn.text).then(
      () => setCopied(true),
      (error: unknown) => console.warn('answer not copied', error),
    );
  };
  return (
    <>
      <div className="copilot-answer-bar">
        <CheckChip turn={turn} />
        <span className="copilot-spacer" />
        <button type="button" className="copilot-pill" onClick={copy} data-id="copilot-copy">
          {copied ? t('copilot.copied') : t('copilot.copy')}
        </button>
        <button type="button" className="copilot-pill" onClick={onRetry} data-id="copilot-answer-retry">
          {t('copilot.retry')}
        </button>
        {(['up', 'down'] as const).map((vote) => (
          <Tooltip key={vote} text={t('copilot.soon')}>
            {(describedBy) => (
              <button type="button" className="copilot-vote" data-vote={vote} disabled aria-label={t(vote === 'up' ? 'copilot.voteUp' : 'copilot.voteDown')} aria-describedby={describedBy}>
                <Icon name="thumb" size={16} />
              </button>
            )}
          </Tooltip>
        ))}
      </div>
      <div className="copilot-make">
        <Tooltip text={t('copilot.soon')}>
          {(describedBy) => (
            <Button variant="rim" size="lg" icon="doc-plus" disabled className="copilot-make-main" aria-describedby={describedBy}>
              {t('copilot.makeDocument')}
            </Button>
          )}
        </Tooltip>
        <MakeJourney turn={turn} />
        <LaterButton label={t('copilot.makeCanvas')} hint={t('copilot.soon')} />
      </div>
    </>
  );
}

/** Under a phone answer (M04): the check, "Lưu thành lối đi", and Canvas, which a phone does not open (Z02). */
function PhoneAnswerFooter({ turn }: { turn: CopilotTurn }): ReactNode {
  const { t } = useCopilotText();
  const phone = usePhoneText();
  return (
    <div className="copilot-phone-footer">
      <CheckChip turn={turn} />
      <div className="copilot-phone-make">
        <MakeJourney turn={turn} />
        <button type="button" className="copilot-phone-canvas" disabled title={phone.t('limit.canvas')} aria-describedby="copilot-phone-limit" data-id="copilot-canvas">
          {t('copilot.makeCanvas')}
        </button>
      </div>
      <span id="copilot-phone-limit" className="copilot-phone-limit">
        {phone.t('limit.canvas')}
      </span>
    </div>
  );
}

function EmptyConversation(): ReactNode {
  const { t } = useCopilotText();
  return (
    <div className="copilot-start" data-id="copilot-start">
      <img src={ILLUSTRATIONS['ai-core']} alt="" aria-hidden="true" width={96} height={96} />
      <span className="copilot-start-title">{t('copilot.empty.title')}</span>
      <span className="copilot-start-text">{t('copilot.empty.text')}</span>
    </div>
  );
}

export function CopilotScreen(): ReactNode {
  const { t } = useCopilotText();
  const phone = usePhoneText();
  const device = useDevice();
  const [link] = useState(() => readCopilotLink(window.location.search));
  const [scope, setScope] = useState<AskScope>(() => link.scope ?? (link.from ? { kind: 'document', id: link.from } : { kind: 'universe' }));
  const context = useScopeContext(scope, link.from);
  const history = useHistory();
  const addHistory = history.add;
  const { load: keys, switchTo } = useAiKeys();
  const [opening, setOpening] = useState<{ id: string; failed: boolean } | null>(() => (link.item ? { id: link.item, failed: false } : null));
  const scopeRef = useRef(scope);
  useEffect(() => {
    scopeRef.current = scope;
  }, [scope]);

  const onDone = useCallback(
    (done: CopilotTurn) => {
      if (!done.questionId) return;
      const asked = done.request.scope;
      addHistory({ id: done.questionId, task: done.request.task ?? 'answer', question: done.request.question ?? '', scope: { kind: asked.kind, id: asked.id ?? null }, createdAt: new Date().toISOString() });
      replaceAddress(scopeRef.current, link.from, done.questionId);
    },
    [addHistory, link.from],
  );
  const copilot = useCopilot(onDone);
  const { ask, show } = copilot;

  const loadItem = useCallback(
    (id: string) => {
      fetchCopilotQuestion(id).then(
        (item) => {
          setOpening(null);
          show(historyTurn(item));
          replaceAddress(scopeRef.current, link.from, id);
        },
        (error: unknown) => {
          if (!(error instanceof ApiError)) console.error('copilot question load failed', error);
          setOpening({ id, failed: true });
        },
      );
    },
    [show, link.from],
  );
  const openItem = (id: string): void => {
    setOpening({ id, failed: false });
    loadItem(id);
  };

  // The question of the address is asked once (then dropped from the address, so a reload does not ask again).
  useEffect(() => {
    if (link.item) loadItem(link.item);
    else if (link.question) {
      ask({ question: link.question, scope: link.scope ?? (link.from ? { kind: 'document', id: link.from } : { kind: 'universe' }) });
      replaceAddress(link.scope ?? { kind: 'universe' }, link.from, null);
    }
  }, [link, ask, loadItem]);

  const turn = copilot.turn;
  const activeChip = context.chips.find((chip) => sameScope(chip.scope, scope)) ?? context.chips[0];
  const scopeLabel = activeChip?.label ?? t('copilot.scope.universe');
  const pickScope = (next: AskScope): void => {
    setScope(next);
    replaceAddress(next, link.from, turn?.questionId ?? null);
  };

  const breadcrumb: BreadcrumbItem[] = [{ label: 'Universe', href: SHELL_PATHS.universe }, { label: t('copilot.crumb') }];
  const crumbAction = context.from ? (
    <a className="copilot-from" href={context.from.href} data-id="copilot-from">
      <Icon name="chevron-left" size={12} strokeWidth={2.4} />
      {t('copilot.openedFrom', { title: context.from.title })}
    </a>
  ) : undefined;

  const actions = {
    onStop: copilot.stop,
    onRetry: copilot.retry,
    onCancel: copilot.cancel,
    onSwitch: switchTo,
    onAskUniverse: () => {
      pickScope({ kind: 'universe' });
      if (turn) ask({ ...turn.request, scope: { kind: 'universe' } });
    },
  };

  const thread = (
    <>
      {opening && !opening.failed && (
        <div className="copilot-opening" aria-busy="true" aria-label={t('copilot.loadingItem')}>
          <Skeleton width="60%" height={40} radius={16} tone="glow" className="copilot-skeleton-q" />
          <Skeleton height={140} radius={18} tone="glow" />
        </div>
      )}
      {opening?.failed && (
        <p className="copilot-note" role="alert">
          {t('copilot.itemFailed')}
        </p>
      )}
    </>
  );
  const scopeButtons = context.chips.map((chip) => (
    <button
      key={`${chip.scope.kind}:${chip.scope.id ?? ''}`}
      type="button"
      className="copilot-scope"
      data-kind={chip.scope.kind}
      aria-pressed={sameScope(chip.scope, scope)}
      onClick={() => pickScope(chip.scope)}
      data-id={`copilot-scope-${chip.scope.kind}`}
    >
      <span className="copilot-scope-dot" aria-hidden="true" />
      {chip.label}
    </button>
  ));
  const askInput = (
    <AskInput
      label={t('copilot.askLabel')}
      placeholder={t(turn ? 'copilot.askNext' : 'copilot.askFirst', { scope: scopeLabel })}
      onAsk={(question) => {
        setOpening(null);
        ask({ question, scope });
      }}
      className="copilot-ask"
      dataId="copilot-ask"
    />
  );

  if (device === 'phone') {
    // M04: the same conversation at the phone's width, the scopes in one scrolling row, the field over the tab bar
    return (
      <PhoneShell screen="M04" tab="copilot" stars={false}>
        <div className="copilot-phone" data-id="copilot-screen" data-state={turn ? (turn.failure ?? turn.stage) : 'empty'}>
          <div className="copilot-phone-head">
            <div className="copilot-phone-orb" aria-hidden="true">
              <span className="copilot-hero-ring" />
              <span className="copilot-hero-ring copilot-hero-ring-inner" />
              <img src={ILLUSTRATIONS['ai-core']} alt="" width={48} height={48} />
            </div>
            <div className="copilot-phone-heading">
              <h1 className="copilot-phone-title">{t('copilot.title')}</h1>
              <span className="copilot-phone-status">{t(statusLine(keys))}</span>
            </div>
            <a className="phone-round" href={SHELL_PATHS.universe} aria-label={phone.t('copilot.close')}>
              <Icon name="close" size={18} />
            </a>
          </div>
          <div className="copilot-phone-scopes" role="group" aria-label={t('copilot.scopes')} data-id="copilot-scopes">
            <span className="copilot-scopes-label" aria-hidden="true">
              {t('copilot.scopes')}
            </span>
            {scopeButtons}
          </div>
          <div className="copilot-phone-chips">
            <span className="copilot-jev-chip">{t('copilot.jevChip')}</span>
            <KeyChip keys={keys} />
          </div>
          <div className="copilot-phone-thread" data-id="copilot-thread">
            {context.from && (
              <a className="copilot-phone-from" href={context.from.href} data-id="copilot-from">
                {t('copilot.openedFrom', { title: context.from.title })}
              </a>
            )}
            {thread}
            {!opening && turn && <TurnView turn={turn} keys={keys} actions={actions} size="compact" footer={turn.stage === 'done' ? <PhoneAnswerFooter turn={turn} /> : undefined} />}
            {!opening && !turn && <EmptyConversation />}
          </div>
          {askInput}
        </div>
      </PhoneShell>
    );
  }

  return (
    <AppShell screen="C14" rail="copilot" veil="strong" stars={false} breadcrumb={breadcrumb} crumbAction={crumbAction} className="copilot-shell">
      <div className="copilot-screen" data-id="copilot-screen" data-state={turn ? (turn.failure ?? turn.stage) : 'empty'}>
        <aside className="copilot-left" aria-label={t('copilot.title')}>
          <div className="copilot-hero-orb" aria-hidden="true">
            <span className="copilot-hero-ring" />
            <span className="copilot-hero-ring copilot-hero-ring-inner" />
            <img src={ILLUSTRATIONS['ai-core']} alt="" width={140} height={140} />
          </div>
          <div className="copilot-hero-text">
            <h1 className="copilot-title">{t('copilot.title')}</h1>
            <span className="copilot-status">{t(statusLine(keys))}</span>
          </div>
          <HistoryPanel history={history} activeId={turn?.questionId ?? opening?.id ?? null} onOpen={openItem} />
          <div className="copilot-chips-row">
            <span className="copilot-jev-chip">{t('copilot.jevChip')}</span>
            <KeyChip keys={keys} />
          </div>
        </aside>

        <section className="copilot-main" aria-label={t('copilot.conversation')} data-id="copilot-main">
          <div className="copilot-head">
            <AiAvatar />
            <div className="copilot-head-text">
              <span className="copilot-head-title">{t('copilot.assistant')}</span>
              <span className="copilot-head-sub">
                {t('copilot.askingIn')} <strong>{scopeLabel}</strong> · {t('copilot.sourceCount', { count: turn?.sources.length ?? 0 })}
              </span>
            </div>
          </div>
          <div className="copilot-scopes" role="group" aria-label={t('copilot.scopes')} data-id="copilot-scopes">
            <span className="copilot-scopes-label" aria-hidden="true">
              {t('copilot.scopes')}
            </span>
            {scopeButtons}
          </div>
          <div className="copilot-thread" data-id="copilot-thread">
            {thread}
            {!opening && turn && (
              <TurnView turn={turn} keys={keys} actions={actions} size="full" footer={turn.stage === 'done' ? <AnswerFooter turn={turn} onRetry={copilot.retry} /> : undefined} />
            )}
            {!opening && !turn && <EmptyConversation />}
          </div>
          {askInput}
        </section>

        <SourcesPanel turn={turn} />
      </div>
    </AppShell>
  );
}
