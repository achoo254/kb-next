import type { ReactNode } from 'react';
import { BRAND_MARK_SRC, brand } from '../brand';
import { useI18n } from '../i18n/i18n';

/** The logo (design/KIT-universe-style.txt §3): the AI-drawn app icon and the brand name, linking home. */
export function BrandLogo(): ReactNode {
  const { t } = useI18n();
  return (
    <a className="brand-logo" href="/" aria-label={t('layout.home')} data-id="brand-logo">
      <img className="brand-logo-mark" src={BRAND_MARK_SRC} width="40" height="40" alt="" aria-hidden="true" />
      <span className="brand-logo-name">{brand.appName}</span>
    </a>
  );
}
