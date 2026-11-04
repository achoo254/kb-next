import type { ReactNode } from 'react';
import { useI18n } from '../i18n/i18n';
import { IconButton } from './icon-button';
import './top-actions.css';

interface TopActionsProps {
  /** The inbox (C20). */
  inboxHref: string;
  /** Unread notifications; a red dot shows when above 0. */
  unread: number;
  /** Quick search and commands (F01, ⌘K). */
  searchHref: string;
  className?: string;
}

/** Top right of every screen (KIT §5): the bell and ⌘K, nothing else. */
export function TopActions({ inboxHref, unread, searchHref, className }: TopActionsProps): ReactNode {
  const { t } = useI18n();
  const inboxLabel = unread > 0 ? t('topActions.inboxUnread', { count: unread }) : t('topActions.inbox');
  return (
    <div className={className ? `kf-top-actions ${className}` : 'kf-top-actions'}>
      <IconButton label={inboxLabel} icon="bell" href={inboxHref} dataId="top-inbox">
        {unread > 0 && <span className="kf-top-unread" aria-hidden="true" />}
      </IconButton>
      <a href={searchHref} className="kf-top-command" aria-label={t('topActions.search')} data-id="top-command">
        <span aria-hidden="true">⌘ K</span>
      </a>
    </div>
  );
}
