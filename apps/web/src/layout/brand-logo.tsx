import type { ReactNode } from 'react';
import { brand } from '../brand';
import { useI18n } from '../i18n/i18n';

/** The logo of the mock (design/KIT-universe-style.txt §3): the gradient mark and the brand name, linking home. */
export function BrandLogo(): ReactNode {
  const { t } = useI18n();
  return (
    <a className="brand-logo" href="/" aria-label={t('layout.home')} data-id="brand-logo">
      <svg width="40" height="26" viewBox="0 0 40 26" fill="none" aria-hidden="true">
        <path d="M3 21L12 5l8 13 8-13 9 16" stroke="url(#kf-logo-gradient)" strokeWidth="5" strokeLinecap="round" strokeLinejoin="round" />
        <defs>
          <linearGradient id="kf-logo-gradient" x1="0" y1="0" x2="40" y2="0" gradientUnits="userSpaceOnUse">
            <stop style={{ stopColor: 'var(--c-logo-from)' }} />
            <stop offset="1" style={{ stopColor: 'var(--c-logo-to)' }} />
          </linearGradient>
        </defs>
      </svg>
      <span className="brand-logo-name">{brand.appName}</span>
    </a>
  );
}
