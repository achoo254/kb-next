/**
 * The right column of the reader (board C11): document actions, "AI với tài liệu này", backlinks, related documents
 * (scored in code by the API), versions and the keyboard hints.
 *
 * "Giải thích đoạn này" and "Tóm tắt" ask Copilot about the current passage or the whole text with the reader's own
 * key; the answer (or why there is none) shows in the AI card of the article (reader-ai.tsx).
 */
import { type ReactNode, useRef, useState } from 'react';
import { ApiError } from '../api/api-client';
import { setFavorite } from '../api/authoring-api';
import type { DocumentView, LinkedDocument } from '../api/content-api';
import { SHELL_PATHS } from '../layout/app-shell';
import { sharePagePath } from '../layout/shell-paths';
import { AiAvatar } from '../ui/ai-avatar';
import { Icon } from '../ui/icon';
import { usePresentText } from './present-messages';
import type { KeysLoad } from './copilot-run';
import { PROVIDERS } from './keys-messages';
import type { ReaderTask } from './reader-ai';
import { shortDate, useReaderText } from './reader-messages';
import { kindLabel, relevanceText } from './space-labels';
import { useSpaceText } from './space-messages';

const RELATED_SHOWN = 3;

/**
 * "Chia sẻ": its author or an admin manages its share link (C18); anyone else copies the text's address (they read it
 * signed in, as everyone signed in may).
 */
function ShareAction({ id, canShare }: { id: string; canShare: boolean }): ReactNode {
  const { t } = useReaderText();
  const [copied, setCopied] = useState(false);
  if (canShare) {
    return (
      <a className="reader-action reader-action-main" href={sharePagePath(id)} data-id="reader-share">
        <Icon name="send" size={15} />
        {t('reader.share')}
      </a>
    );
  }
  const copy = (): void => {
    const url = `${window.location.origin}/d/${encodeURIComponent(id)}`;
    navigator.clipboard.writeText(url).then(
      () => setCopied(true),
      () => setCopied(false),
    );
  };
  return (
    <button type="button" className="reader-action reader-action-main" onClick={copy} data-id="reader-share">
      <Icon name="send" size={15} />
      <span aria-live="polite">{copied ? t('reader.shareCopied') : t('reader.share')}</span>
    </button>
  );
}

export interface FavoriteToggle {
  on: boolean;
  /** Offline: the button is disabled and says why. */
  offline: boolean;
  /** The last change did not reach the server and was undone. */
  failed: boolean;
  toggle(): void;
}

/**
 * The reader's "Yêu thích" (C11, T02): on or off at once, sent to the server, and put back as it was when the server
 * refuses or cannot be reached. One change at a time: a click while one is on its way is ignored.
 */
export function useFavoriteToggle(id: string, initial: boolean, offline: boolean): FavoriteToggle {
  const [on, setOn] = useState(initial);
  const [failed, setFailed] = useState(false);
  const pending = useRef(false);
  const toggle = (): void => {
    if (offline || pending.current) return;
    const next = !on;
    pending.current = true;
    setOn(next);
    setFailed(false);
    setFavorite(id, next)
      .catch((error: unknown) => {
        if (!(error instanceof ApiError)) console.error('favourite change failed', error);
        setOn(!next);
        setFailed(true);
      })
      .finally(() => {
        pending.current = false;
      });
  };
  return { on, offline, failed, toggle };
}

/** Why "Yêu thích" is unavailable or did not save, for its title and the screen reader; empty when all is well. */
export function favoriteNote(t: ReturnType<typeof useReaderText>['t'], favorite: FavoriteToggle): string {
  if (favorite.offline) return t('reader.favoriteOffline');
  return favorite.failed ? t('reader.favoriteFailed') : '';
}

/** Says aloud why "Yêu thích" is off or did not save (out of the layout: positioned away from the grid). */
export function FavoriteStatus({ note }: { note: string }): ReactNode {
  return (
    <span className="kf-visually-hidden" role="status" data-id="reader-favorite-status">
      {note}
    </span>
  );
}

function FavoriteAction({ favorite }: { favorite: FavoriteToggle }): ReactNode {
  const { t } = useReaderText();
  const note = favoriteNote(t, favorite);
  return (
    <>
      <button type="button" className="reader-action" aria-pressed={favorite.on} disabled={favorite.offline} title={note || undefined} onClick={favorite.toggle} data-id="reader-favorite">
        <Icon name="favorite" size={15} />
        {t('reader.favorite')}
      </button>
      <FavoriteStatus note={note} />
    </>
  );
}

/** `favorite`: null for a guest (no "Yêu thích" to keep). */
/**
 * Opens the text as slides (C21): a round button among the tablet's actions, a small pill beside A−/A+ on the
 * desktop (another way to view the text, and the action row stays on one line there).
 */
export function PresentAction({ id, round = false }: { id: string; round?: boolean }): ReactNode {
  const { t } = usePresentText();
  const href = `/d/${encodeURIComponent(id)}/present`;
  return round ? (
    <a className="reader-round" href={href} aria-label={t('present.open')} title={t('present.openHint')} data-id="reader-present">
      <Icon name="play" size={18} />
    </a>
  ) : (
    <a className="reader-present" href={href} aria-label={t('present.open')} title={t('present.openHint')} data-id="reader-present">
      <Icon name="play" size={12} />
    </a>
  );
}

export function ReaderActions({ id, canShare, favorite }: { id: string; canShare: boolean; favorite: FavoriteToggle | null }): ReactNode {
  const { t } = useReaderText();
  return (
    <div className="reader-actions" role="group" aria-label={t('reader.actions')} data-id="reader-actions">
      <a className="reader-action" href={SHELL_PATHS.mine} data-id="reader-edit">
        <Icon name="pencil" size={15} strokeWidth={2} />
        {t('reader.edit')}
      </a>
      <ShareAction id={id} canShare={canShare} />
      <a className="reader-action" href={SHELL_PATHS.canvas} data-id="reader-canvas">
        {t('reader.canvas')}
      </a>
      {favorite && <FavoriteAction favorite={favorite} />}
    </div>
  );
}

interface AiPanelProps {
  offline: boolean;
  keys: KeysLoad;
  /** The task the article's AI card answers when it was asked from here. */
  pressed: ReaderTask | null;
  onAsk(task: ReaderTask): void;
}

export function AiPanel({ offline, keys, pressed, onAsk }: AiPanelProps): ReactNode {
  const { t } = useReaderText();
  const off = keys.status === 'ready' && !keys.keys.available;
  const active = keys.status === 'ready' ? keys.keys.active : null;
  let note = '';
  if (offline) note = t('reader.ai.offline');
  else if (off) note = t('reader.ai.off');
  else if (active) note = t('reader.ai.withKey', { provider: PROVIDERS[active.provider].name, last4: active.last4 });
  else if (keys.status === 'ready') note = t('reader.ai.noKey');
  return (
    <section className="reader-card reader-ai" aria-labelledby="reader-ai-title" data-id="reader-ai">
      <h2 id="reader-ai-title" className="reader-ai-title">
        <AiAvatar size="sm" />
        {t('reader.ai.title')}
      </h2>
      <div className="reader-ai-buttons">
        <button type="button" className="reader-ai-button" disabled={offline || off} aria-pressed={pressed === 'explain'} onClick={() => onAsk('explain')} data-id="reader-ai-explain">
          {t('reader.ai.explain')}
        </button>
        <button type="button" className="reader-ai-button" disabled={offline || off} aria-pressed={pressed === 'summarize'} onClick={() => onAsk('summarize')} data-id="reader-ai-summarize">
          {t('reader.ai.summarize')}
        </button>
      </div>
      <span className="reader-small" data-id="reader-ai-note">
        {note}
      </span>
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
  // "Linh duyệt 03/11": the day of the approval; "Sửa lần cuối …": the day of the latest version.
  const date = shortDate(locale, (view.document.reviewedBy ? view.document.reviewedAt : null) ?? latest.createdAt);
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
