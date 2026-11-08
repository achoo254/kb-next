import { type ReactNode, useEffect, useRef } from 'react';
import type { DocumentView } from '../api/content-api';
import { SHELL_PATHS } from '../layout/shell-paths';
import { Icon } from '../ui/icon';
import { usePhoneText } from './phone-messages';
import { type FavoriteToggle, FavoriteStatus, PresentAction, favoriteNote, orderBacklinks } from './reader-side';
import { useReaderText } from './reader-messages';
import { relevanceText } from './space-labels';

/**
 * The tablet reader's own parts (board T02): the "Mục lục" button and the contents drawer that slides over the text
 * from the left (closed by its ×, the scrim, Esc, picking an entry or a swipe to the left), the column of round actions
 * on the right, and the backlinks and related texts as chips under the text.
 */

export function TocButton({ open, onOpen }: { open: boolean; onOpen(): void }): ReactNode {
  const { t } = usePhoneText();
  return (
    <button type="button" className="reader-toc-button" aria-expanded={open} aria-controls="reader-toc-drawer" onClick={onOpen} data-id="reader-toc-open">
      <Icon name="lines" size={18} />
      {t('toc.open')}
    </button>
  );
}

/** How far a finger must move left on the drawer to close it. */
const SWIPE_CLOSE_PX = 60;

export function TocDrawer({ open, onClose, children }: { open: boolean; onClose(): void; children: ReactNode }): ReactNode {
  const { t } = usePhoneText();
  const closeRef = useRef<HTMLButtonElement>(null);
  const swipeStart = useRef<number | null>(null);
  useEffect(() => {
    if (!open) return undefined;
    closeRef.current?.focus();
    const onKey = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open, onClose]);
  if (!open) return null;
  return (
    <>
      <button type="button" className="reader-drawer-scrim" aria-label={t('toc.close')} tabIndex={-1} onClick={onClose} />
      <aside
        id="reader-toc-drawer"
        className="reader-drawer"
        aria-labelledby="reader-drawer-title"
        data-id="reader-toc-drawer"
        onPointerDown={(event) => {
          swipeStart.current = event.clientX;
        }}
        onPointerUp={(event) => {
          const start = swipeStart.current;
          swipeStart.current = null;
          if (start !== null && start - event.clientX > SWIPE_CLOSE_PX) onClose();
        }}
      >
        <div className="reader-drawer-head">
          <span id="reader-drawer-title" className="reader-drawer-title">
            {t('toc.title')}
          </span>
          <button ref={closeRef} type="button" className="reader-drawer-close" aria-label={t('toc.close')} onClick={onClose}>
            <Icon name="close" size={18} />
          </button>
        </div>
        {children}
        <span className="reader-drawer-hint">{t('toc.swipe')}</span>
      </aside>
    </>
  );
}

/** `favorite`: null for a guest (no "Yêu thích" to keep). */
export function TabletActions({ id, canShare, favorite }: { id: string; canShare: boolean; favorite: FavoriteToggle | null }): ReactNode {
  const { t } = usePhoneText();
  const reader = useReaderText();
  const note = favorite ? favoriteNote(reader.t, favorite) : '';
  const encoded = encodeURIComponent(id);
  return (
    <div className="reader-tablet-actions" data-id="reader-tablet-actions">
      {canShare && (
        <a className="reader-round" data-tone="rim" href={`/d/${encoded}/share`} aria-label={t('tablet.share')} data-id="reader-share">
          <Icon name="share-up" size={20} />
        </a>
      )}
      <PresentAction id={id} round />
      <a className="reader-round" href={SHELL_PATHS.mine} aria-label={t('tablet.edit')} data-id="reader-edit">
        <Icon name="pencil" size={20} />
      </a>
      {favorite && (
        <>
          <button
            type="button"
            className="reader-round"
            aria-label={reader.t('reader.favorite')}
            aria-pressed={favorite.on}
            disabled={favorite.offline}
            title={note || undefined}
            onClick={favorite.toggle}
            data-id="reader-favorite"
          >
            <Icon name="favorite" size={20} />
          </button>
          <FavoriteStatus note={note} />
        </>
      )}
    </div>
  );
}

export function TabletLinks({ view }: { view: DocumentView }): ReactNode {
  const { t, locale } = usePhoneText();
  const backlinks = orderBacklinks(view.backlinks);
  const latest = view.versions[0];
  if (backlinks.length === 0 && view.related.length === 0 && !latest) return null;
  return (
    <section className="reader-tablet-links" aria-labelledby="reader-tablet-links-title" data-id="reader-tablet-links">
      <span id="reader-tablet-links-title" className="reader-tablet-links-title">
        {t('tablet.links')}
      </span>
      {backlinks.map((link) => (
        <a key={`b-${link.document.id}`} className="reader-chip" href={`/d/${encodeURIComponent(link.document.id)}`}>
          {link.label ? `${link.document.title} · ${link.label}` : link.document.title}
        </a>
      ))}
      {view.related.map((doc) => (
        <a key={`r-${doc.id}`} className="reader-chip" href={`/d/${encodeURIComponent(doc.id)}`}>
          {`${doc.title} · ${relevanceText(locale, doc.relevance)}`}
        </a>
      ))}
      {latest && (
        <a className="reader-chip" data-tone="glass" href={`/d/${encodeURIComponent(view.document.id)}/history`}>
          {t('tablet.history', { version: latest.version })}
        </a>
      )}
    </section>
  );
}
