import type { ReactNode } from 'react';
import type { DocumentSummary, SpaceListItem } from '../api/content-api';
import { type Locale, type Translate, useI18n } from '../i18n/i18n';
import { AiAvatar } from '../ui/ai-avatar';
import { AskInput } from '../ui/ask-input';
import { ChatBubble } from '../ui/chat-bubble';
import { IconButton } from '../ui/icon-button';
import { RimPanel } from '../ui/rim-panel';
import { SourceRow } from '../ui/source-row';
import { sourceHref, sourceTitle } from './copilot-answer';
import { copilotHref } from './copilot-links';
import { type Copilot, type CopilotTurn, useAiKeys, useCopilot } from './copilot-run';
import { TurnView } from './copilot-turn';
import { documentHref } from './universe-dock';
import { spaceHref, spaceName } from './universe-spaces';

/** A question about a text the reader has on the stage: "Giải thích “Giao thức DHCP”". */
export function questionAbout(doc: DocumentSummary, t: Translate): string {
  return t('universe.ai.explain', { title: doc.title });
}

function originLabel(doc: Pick<DocumentSummary, 'origin' | 'status'>, t: Translate): string {
  if (doc.status === 'pending') return t('origin.pending');
  if (doc.origin === 'own') return t('origin.private');
  return doc.origin === 'community' ? t('origin.community') : t('origin.official');
}

function documentMeta(doc: DocumentSummary, t: Translate, locale: Locale): string {
  const space = locale === 'vi' ? doc.space.nameVi : doc.space.nameEn;
  return `§ ${space} · ${originLabel(doc, t)}`;
}

interface UniversePanelProps {
  spaces: readonly SpaceListItem[];
  recent: readonly DocumentSummary[];
  /** The text the reader is on (the stage's first card): the panel offers a question about it. */
  focus: DocumentSummary | undefined;
}

/** What the panel shows before a question: what Copilot answers from (the Spaces, the latest texts). */
function PanelIntro({ spaces, recent, question, onAsk }: Omit<UniversePanelProps, 'focus'> & { question: string | undefined; onAsk(question: string): void }): ReactNode {
  const { t, locale } = useI18n();
  const documents = spaces.reduce((sum, space) => sum + space.documentCount, 0);
  return (
    <>
      {question && (
        <button type="button" className="universe-ai-question" onClick={() => onAsk(question)} data-id="universe-ai-question">
          <ChatBubble from="user">{question}</ChatBubble>
        </button>
      )}
      <ChatBubble from="ai">
        <span>{t('universe.ai.scope', { documents, spaces: spaces.length })}</span>
        <ul className="universe-ai-scope" aria-label={t('universe.ai.scopeLabel')}>
          {spaces.map((space) => (
            <li key={space.slug}>
              <a href={spaceHref(space.slug)} className="universe-ai-space">
                {spaceName(space, locale)}
                <span className="universe-ai-space-count">{space.caption[locale]}</span>
              </a>
            </li>
          ))}
        </ul>
      </ChatBubble>
      {recent.length > 0 && <span className="universe-ai-sources">{t('universe.ai.sources')}</span>}
      {recent.slice(0, 3).map((doc) => (
        <SourceRow key={doc.id} title={doc.title} meta={documentMeta(doc, t, locale)} tag={doc.lang.toUpperCase()} href={documentHref(doc.id)} dataId={`universe-source-${doc.id}`} />
      ))}
      <div className="universe-ai-fill" />
    </>
  );
}

/** The panel's question and answer (or F02 state), and the answer's sources; the keys load once a question is asked. */
function PanelThread({ turn, copilot }: { turn: CopilotTurn; copilot: Copilot }): ReactNode {
  const { t } = useI18n();
  const { load: keys, switchTo } = useAiKeys();
  const sources = turn.sources.filter((source) => source.available !== false);
  return (
    <div className="universe-ai-thread" data-id="universe-ai-thread" data-state={turn.failure ?? turn.stage}>
      <TurnView turn={turn} keys={keys} actions={{ onStop: copilot.stop, onRetry: copilot.retry, onCancel: copilot.cancel, onSwitch: switchTo }} size="compact" />
      {turn.stage === 'done' && sources.length > 0 && (
        <>
          <span className="universe-ai-sources">{t('universe.ai.answerSources')}</span>
          {sources.map((source) => (
            <SourceRow
              key={source.n}
              title={sourceTitle(source)}
              meta={[source.spaceName, source.collectionName].filter(Boolean).join(' › ')}
              tag={String(source.n)}
              href={sourceHref(source)}
              dataId={`universe-answer-source-${source.n}`}
            />
          ))}
        </>
      )}
    </div>
  );
}

/**
 * C09's AI panel: asks Copilot in place (the whole Universe) with the same turn as C14 (copilot-run.ts), every F02
 * state included. Before a question it shows what Copilot answers from: a question about the text on the stage, how
 * many texts in how many Spaces it reads, and the latest texts. The expand button opens C14, on the answer once
 * there is one.
 */
export function UniverseAiPanel({ spaces, recent, focus }: UniversePanelProps): ReactNode {
  const { t } = useI18n();
  const copilot = useCopilot();
  const turn = copilot.turn;
  const ask = (question: string): void => copilot.ask({ question, scope: { kind: 'universe' } });
  return (
    <RimPanel as="section" variant="rim" radius="panel" label={t('universe.ai.title')} className="universe-ai" dataId="universe-ai">
      <div className="universe-ai-head">
        <AiAvatar />
        <div className="universe-ai-heading">
          <span className="universe-ai-title">{t('universe.ai.title')}</span>
          <span className="universe-ai-sub">{t('universe.ai.sub')}</span>
        </div>
        <IconButton label={t('universe.ai.open')} icon="expand" href={copilotHref(undefined, { item: turn?.questionId ?? undefined })} variant="soft" dataId="universe-ai-open" />
      </div>
      {turn ? <PanelThread turn={turn} copilot={copilot} /> : <PanelIntro spaces={spaces} recent={recent} question={focus ? questionAbout(focus, t) : undefined} onAsk={ask} />}
      <AskInput label={t('universe.ai.askLabel')} placeholder={t('universe.ai.askPlaceholder')} onAsk={ask} dataId="universe-ask" />
    </RimPanel>
  );
}

/** S05's panel "Thử hỏi AI": questions about the latest texts of the shared Universe, each opening Copilot. */
export function UniverseAskSuggestions({ recent }: { recent: readonly DocumentSummary[] }): ReactNode {
  const { t } = useI18n();
  return (
    <RimPanel as="section" variant="rim" radius="panel" label={t('universe.try.title')} className="universe-try" dataId="universe-try">
      <span className="universe-try-title">{t('universe.try.title')}</span>
      <span className="universe-try-sub">{recent.length > 0 ? t('universe.try.sub') : t('universe.try.subEmpty')}</span>
      {recent.slice(0, 3).map((doc) => {
        const question = questionAbout(doc, t);
        return (
          <a key={doc.id} className="universe-try-question" href={copilotHref(question)} data-id={`universe-try-${doc.id}`}>
            {question}
          </a>
        );
      })}
      <a className="universe-try-open" href={copilotHref()} data-id="universe-try-open">
        {t('universe.try.open')}
      </a>
    </RimPanel>
  );
}
