/**
 * The right column of the reader (board C11): document actions, "AI với tài liệu này", backlinks, related documents
 * (scored in code by the API), versions and the keyboard hints.
 *
 * AI explain and summarise run on the reader's own key (phase 7). Until keys exist the buttons show the board's
 * needs-key state: what is missing and where to add a key.
 */
import { type ReactNode, useState } from 'react';
import type { DocumentView, LinkedDocument } from '../api/content-api';
import { SHELL_PATHS } from '../layout/app-shell';
import { AiAvatar } from '../ui/ai-avatar';
import { Icon } from '../ui/icon';
import { shortDate, useReaderText } from './reader-messages';
import { kindLabel, relevanceText } from './space-labels';
import { useSpaceText } from './space-messages';

/** Where the reader adds an AI key (settings, F03). */
export const KEYS_HREF = SHELL_PATHS.settings;
const RELATED_SHOWN = 3;

export function ReaderActions(): ReactNode {
  const { t } = useReaderText();
  return (
    <div className="reader-actions" role="group" aria-label={t('reader.actions')} data-id="reader-actions">
      <a className="reader-action" href={SHELL_PATHS.mine} data-id="reader-edit">
        <Icon name="pencil" size={15} strokeWidth={2} />
        {t('reader.edit')}
      </a>
      <button type="button" className="reader-action reader-action-main" disabled title={t('reader.soon')} data-id="reader-share">
        <Icon name="send" size={15} />
        {t('reader.share')}
      </button>
      <a className="reader-action" href={SHELL_PATHS.canvas} data-id="reader-canvas">
        {t('reader.canvas')}
      </a>
      <button type="button" className="reader-action" disabled title={t('reader.soon')} data-id="reader-favorite">
        <Icon name="star" size={15} />
        {t('reader.favorite')}
      </button>
    </div>
  );
}

type AiAsk = 'explain' | 'summarize';

export function AiPanel({ offline }: { offline: boolean }): ReactNode {
  const { t } = useReaderText();
  const [asked, setAsked] = useState<AiAsk | null>(null);
  return (
    <section className="reader-card reader-ai" aria-labelledby="reader-ai-title" data-id="reader-ai">
      <h2 id="reader-ai-title" className="reader-ai-title">
        <AiAvatar size="sm" />
        {t('reader.ai.title')}
      </h2>
      <div className="reader-ai-buttons">
        <button type="button" className="reader-ai-button" disabled={offline} aria-pressed={asked === 'explain'} onClick={() => setAsked('explain')} data-id="reader-ai-explain">
          {t('reader.ai.explain')}
        </button>
        <button type="button" className="reader-ai-button" disabled={offline} aria-pressed={asked === 'summarize'} onClick={() => setAsked('summarize')} data-id="reader-ai-summarize">
          {t('reader.ai.summarize')}
        </button>
      </div>
      {asked && !offline ? (
        <div className="reader-ai-needkey" role="status" data-id="reader-ai-needkey">
          <span>{t(asked === 'explain' ? 'reader.ai.needKeyExplain' : 'reader.ai.needKeySummarize')}</span>
          <a href={KEYS_HREF} className="reader-ai-addkey">
            {t('reader.ai.addKey')}
          </a>
        </div>
      ) : (
        <span className="reader-small">{t(offline ? 'reader.ai.offline' : 'reader.ai.noKey')}</span>
      )}
    </section>
  );
}

/** The dot colour of a linked document: the reader's own files pink, paths cyan, the rest violet. */
function dotTone(link: LinkedDocument): 'own' | 'path' | 'doc' {
  if (link.document.origin === 'own') return 'own';
  return link.document.type === 'journey' ? 'path' : 'doc';
}

/** Labelled relations (a path that has this document as a step) before plain mentions, each group in API order. */
export function orderBacklinks(links: readonly LinkedDocument[]): LinkedDocument[] {
  return [...links.filter((link) => link.kind === 'relation'), ...links.filter((link) => link.kind !== 'relation')];
}

export function Backlinks({ links: unordered }: { links: readonly LinkedDocument[] }): ReactNode {
  const { t } = useReaderText();
  const space = useSpaceText();
  const links = orderBacklinks(unordered);
  return (
    <section className="reader-card reader-list-card" aria-labelledby="reader-backlinks-title" data-id="reader-backlinks">
      <h2 id="reader-backlinks-title" className="reader-card-title">
        {t('reader.backlinks', { count: links.length })}
      </h2>
      {links.length === 0 ? (
        <p className="reader-small">{t('reader.backlinksNone')}</p>
      ) : (
        <ul className="reader-rows">
          {links.map((link) => (
            <li key={link.document.id}>
              <a className="reader-row" href={`/d/${encodeURIComponent(link.document.id)}`} data-id={`reader-backlink-${link.document.id}`}>
                <span className="reader-dot" data-tone={dotTone(link)} aria-hidden="true" />
                <span className="reader-row-title">{link.document.title}</span>
                <span className="reader-row-meta">{link.document.origin === 'own' ? space.t('kind.yours') : kindLabel(space.t, link.document)}</span>
              </a>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

export function RelatedDocuments({ related }: { related: DocumentView['related'] }): ReactNode {
  const { t, locale } = useReaderText();
  const shown = related.slice(0, RELATED_SHOWN);
  return (
    <section className="reader-card reader-list-card" aria-labelledby="reader-related-title" data-id="reader-related">
      <h2 id="reader-related-title" className="reader-card-title">
        {t('reader.related')} <span className="reader-by">{t('reader.relatedBy')}</span>
      </h2>
      {shown.length === 0 ? (
        <p className="reader-small">{t('reader.relatedNone')}</p>
      ) : (
        <ul className="reader-rows">
          {shown.map((doc) => {
            const value = relevanceText(locale, doc.relevance);
            return (
              <li key={doc.id}>
                <a className="reader-row" href={`/d/${encodeURIComponent(doc.id)}`} data-id={`reader-related-${doc.id}`}>
                  <span className="reader-row-title">{doc.title}</span>
                  <span className="reader-bar" role="img" aria-label={t('reader.relevance', { value })}>
                    <span style={{ width: `${Math.min(100, Math.max(0, doc.relevance))}%` }} />
                  </span>
                  <span className="reader-row-meta reader-score" aria-hidden="true">
                    {value}
                  </span>
                </a>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}

export function Versions({ view }: { view: DocumentView }): ReactNode {
  const { t, locale } = useReaderText();
  const [open, setOpen] = useState(false);
  const latest = view.versions[0];
  if (!latest) return null;
  const count = view.versions.length;
  const date = shortDate(locale, latest.createdAt);
  const summary = view.document.reviewedBy ? t('reader.versionsReviewed', { name: view.document.reviewedBy, date, count }) : t('reader.versionsEdited', { date, count });
  return (
    <section className="reader-card reader-versions" data-id="reader-versions">
      <button type="button" className="reader-versions-toggle" aria-expanded={open} aria-controls="reader-version-list" onClick={() => setOpen((on) => !on)}>
        <span className="reader-version-tag">v{latest.version}</span>
        <span className="reader-versions-text">
          <b>{t('reader.versions')}</b>
          <span>{summary}</span>
        </span>
        <Icon name="chevron" size={16} strokeWidth={2.2} className="reader-versions-chevron" />
      </button>
      {open && (
        <ol id="reader-version-list" className="reader-version-list">
          {view.versions.map((version) => (
            <li key={version.version}>
              {t('reader.versionRow', { version: version.version, editor: version.editorName ?? t('reader.unknownEditor'), date: shortDate(locale, version.createdAt) })}
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}

export function KeyHints(): ReactNode {
  const { t } = useReaderText();
  return (
    <p className="reader-keys" aria-label={t('reader.keys')}>
      <span>
        <b>J / K</b> {t('reader.keyJk')}
      </span>
    </p>
  );
}
