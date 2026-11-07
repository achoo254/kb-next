import type { ReactNode } from 'react';
import { useI18n } from '../i18n/i18n';
import type { MessageKey } from '../i18n/messages';
import { Icon, type IconName } from './icon';
import './origin-tag.css';

/**
 * Where a piece of content comes from (plan rule 6): every card, planet, search result and citation carries one.
 * `pending` ("Chờ duyệt") is drawn only on the DesignSystem kit board: the app no longer has a review step.
 */
export type ContentOrigin = 'official' | 'community' | 'private' | 'pending';

const ORIGINS: Record<ContentOrigin, { label: MessageKey; icon: IconName }> = {
  official: { label: 'origin.official', icon: 'star' },
  community: { label: 'origin.community', icon: 'community' },
  private: { label: 'origin.private', icon: 'lock' },
  pending: { label: 'origin.pending', icon: 'clock' },
};

interface OriginTagProps {
  origin: ContentOrigin;
  /** `pill`: the 32px tag of DesignSystem; `inline`: the small coloured label at the top of a card. */
  variant?: 'pill' | 'inline';
  className?: string;
}

/** The origin label: told apart by icon and words, not colour alone. */
export function OriginTag({ origin, variant = 'pill', className }: OriginTagProps): ReactNode {
  const { t } = useI18n();
  const { label, icon } = ORIGINS[origin];
  return (
    <span className={className ? `kf-origin ${className}` : 'kf-origin'} data-origin={origin} data-variant={variant}>
      <Icon name={icon} size={variant === 'inline' ? 11 : 13} />
      {t(label)}
    </span>
  );
}
