import type { ReactNode } from 'react';
import { useI18n } from '../i18n/i18n';
import type { ContentOrigin } from '../ui/origin-tag';
import './phone-origin.css';

/** The origin of a text as the phone boards' small filled chip ("Chính thức", "Của bạn · riêng tư"). */
export function PhoneOrigin({ origin }: { origin: ContentOrigin }): ReactNode {
  const { t } = useI18n();
  return (
    <span className="phone-origin" data-origin={origin}>
      {t(`origin.${origin}`)}
    </span>
  );
}
