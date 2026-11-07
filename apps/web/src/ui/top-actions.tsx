import type { ReactNode } from 'react';
import { useI18n } from '../i18n/i18n';
import { IconButton } from './icon-button';
import './top-actions.css';

interface TopActionsProps {
  /** The inbox (C20); none for a guest, who has no inbox. */
  inboxHref?: string;
  /** Unread notifications; a red dot shows when above 0. */
  unread: number;
  /** The inbox is the screen on show (C20): the bell is lit and shows the count instead of a dot. */
  inboxOpen?: boolean;
  /** Shown left of the bell (an admin screen's shortcut hint and its button). */
  extra?: ReactNode;
  /** Quick search and commands (F01, ⌘K): where the button leads without script. */
  searchHref: string;
  /** Opens the ⌘K palette in place (the link is the fallback). */
  onCommand?: () => void;
  /** The palette is open: the button glows as on F01. */
  commandOpen?: boolean;
  className?: string;
}

/** Top right of every screen (KIT §5): the bell and ⌘K (a guest's sign-in button comes in `extra`). */
export function TopActions({ inboxHref, unread, inboxOpen = false, extra, searchHref, onCommand, commandOpen = false, className }: TopActionsProps): ReactNode {
  const { t } = useI18n();
  const inboxLabel = unread > 0 ? t('topActions.inboxUnread', { count: unread }) : t('topActions.inbox');
  return (
    <div className={className ? `kf-top-actions ${className}` : 'kf-top-actions'}>
      {extra}
      {inboxHref && (
        <IconButton label={inboxLabel} icon="bell" href={inboxHref} dataId="top-inbox" current={inboxOpen}>
          {unread > 0 &&
            (inboxOpen ? (
              <span className="kf-top-unread-count" aria-hidden="true">
                {unread}
              </span>
            ) : (
              <span className="kf-top-unread" aria-hidden="true" />
            ))}
        </IconButton>
      )}
      <a
        href={searchHref}
        className="kf-top-command"
        aria-label={t('topActions.search')}
        aria-haspopup={onCommand ? 'dialog' : undefined}
        aria-expanded={onCommand ? commandOpen : undefined}
        onClick={
          onCommand
            ? (event) => {
                if (event.metaKey || event.ctrlKey || event.shiftKey || event.button !== 0) return;
                event.preventDefault();
                onCommand();
              }
            : undefined
        }
        data-id="top-command"
      >
        <span aria-hidden="true">⌘ K</span>
      </a>
    </div>
  );
}
