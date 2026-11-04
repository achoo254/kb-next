import type { MouseEventHandler, ReactNode } from 'react';
import { Icon, type IconName } from './icon';
import './icon-button.css';

interface IconButtonProps {
  /** Accessible name (the button shows only an icon). */
  label: string;
  icon: IconName;
  href?: string;
  onClick?: MouseEventHandler<HTMLElement>;
  'aria-describedby'?: string;
  /** `glass`: the 48px frosted square of the top bar and X01; `soft`: the 40px expand button of a rim panel. */
  variant?: 'glass' | 'soft';
  /** Extra content inside, e.g. an unread dot. */
  children?: ReactNode;
  className?: string;
  dataId?: string;
}

/** An icon-only button or link with an accessible name. */
export function IconButton({ label, icon, href, onClick, variant = 'glass', children, className, dataId, ...aria }: IconButtonProps): ReactNode {
  const shared = {
    className: className ? `kf-icon-btn ${className}` : 'kf-icon-btn',
    'data-variant': variant,
    'aria-label': label,
    'data-id': dataId,
    ...aria,
  };
  const body = (
    <>
      <Icon name={icon} size={variant === 'soft' ? 16 : 20} />
      {children}
    </>
  );
  if (href !== undefined) {
    return (
      <a href={href} onClick={onClick} {...shared}>
        {body}
      </a>
    );
  }
  return (
    <button type="button" onClick={onClick} {...shared}>
      {body}
    </button>
  );
}
