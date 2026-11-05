import type { ReactNode } from 'react';
import { useI18n } from '../i18n/i18n';
import './legal-links.css';

/** Which legal page is open, so its own link is marked as the current page. */
export type LegalLinkId = 'privacy' | 'terms';

const LINKS: ReadonlyArray<{ id: LegalLinkId; href: string; label: 'layout.privacy' | 'layout.terms' }> = [
  { id: 'privacy', href: '/privacy', label: 'layout.privacy' },
  { id: 'terms', href: '/terms', label: 'layout.terms' },
];

/**
 * "Quyền riêng tư · Điều khoản": a quiet line of text links to the legal pages, reachable signed out. It flows inline
 * with the text around it (the landing's footer); a screen places and sizes it with `className`.
 */
export function LegalLinks({ current, className }: { current?: LegalLinkId; className?: string }): ReactNode {
  const { t } = useI18n();
  return (
    <nav className={className ? `legal-links ${className}` : 'legal-links'} aria-label={t('layout.legal')}>
      {LINKS.map((link, index) => (
        <span key={link.id}>
          {index > 0 && <span aria-hidden="true"> · </span>}
          <a href={link.href} aria-current={current === link.id ? 'page' : undefined} data-id={`legal-${link.id}`}>
            {t(link.label)}
          </a>
        </span>
      ))}
    </nav>
  );
}
