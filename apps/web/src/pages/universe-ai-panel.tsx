import type { ReactNode } from 'react';
import type { DocumentSummary, SpaceListItem } from '../api/content-api';
import { type Locale, type Translate, useI18n } from '../i18n/i18n';
import { SHELL_PATHS } from '../layout/app-shell';
import { AiAvatar } from '../ui/ai-avatar';
import { AskInput } from '../ui/ask-input';
import { ChatBubble } from '../ui/chat-bubble';
import { IconButton } from '../ui/icon-button';
import { RimPanel } from '../ui/rim-panel';
import { SourceRow } from '../ui/source-row';
import { documentHref } from './universe-dock';
import { spaceHref, spaceName } from './universe-spaces';

/** Copilot (C14) with a question to ask. */
export function copilotHref(question?: string): string {
  return question ? `${SHELL_PATHS.copilot}?${new URLSearchParams({ q: question }).toString()}` : SHELL_PATHS.copilot;
}

/** Sends a question typed in the panel on to Copilot. */
export function askCopilot(question: string): void {
  window.location.assign(copilotHref(question));
}

/** A question about a text the reader has on the stage: "Giải thích “Giao thức DHCP”". */
export function questionAbout(doc: DocumentSummary, t: Translate): string {
  return t('universe.ai.explain', { title: doc.title });
}

function originLabel(doc: DocumentSummary, t: Translate): string {
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

/**
 * C09's AI panel. Copilot has no conversation to show here, so the panel shows what it would answer from: a question
 * about the text on the stage (opens Copilot with it), how many texts in how many Spaces it reads, and the latest
 * texts as sources. The field sends any question on to Copilot (C14).
 */
export function UniverseAiPanel({ spaces, recent, focus }: UniversePanelProps): ReactNode {
  const { t, locale } = useI18n();
  const documents = spaces.reduce((sum, space) => sum + space.documentCount, 0);
  const question = focus ? questionAbout(focus, t) : undefined;
  return (
    <RimPanel as="section" variant="rim" radius="panel" label={t('universe.ai.title')} className="universe-ai" dataId="universe-ai">
      <div className="universe-ai-head">
        <AiAvatar />
        <div className="universe-ai-heading">
          <span className="universe-ai-title">{t('universe.ai.title')}</span>
          <span className="universe-ai-sub">{t('universe.ai.sub')}</span>
        </div>
        <IconButton label={t('universe.ai.open')} icon="expand" href={copilotHref()} variant="soft" dataId="universe-ai-open" />
      </div>
      {question && (
        <a className="universe-ai-question" href={copilotHref(question)} data-id="universe-ai-question">
          <ChatBubble from="user">{question}</ChatBubble>
        </a>
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
      <AskInput label={t('universe.ai.askLabel')} placeholder={t('universe.ai.askPlaceholder')} onAsk={askCopilot} dataId="universe-ask" />
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
