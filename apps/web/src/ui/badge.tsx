import type { ReactNode } from 'react';
import { Icon, type IconName } from './icon';
import './badge.css';

/** Colour family of a status badge (X01 "Nhãn trạng thái"). */
export type BadgeTone = 'violet' | 'success' | 'warn' | 'accent' | 'neutral' | 'purple' | 'danger';

interface BadgeProps {
  children: ReactNode;
  tone?: BadgeTone;
  icon?: IconName;
  /**
   * `glow`: the 32px X01 status badge with a glowing border; `pill`: the 28px borderless pill of X03;
   * `tag`: the small solid tag of a source row (version, origin).
   */
  variant?: 'glow' | 'pill' | 'tag';
  className?: string;
}

/** A status badge: always icon or text plus colour, never colour alone. */
export function Badge({ children, tone = 'violet', icon, variant = 'glow', className }: BadgeProps): ReactNode {
  return (
    <span className={className ? `kf-badge ${className}` : 'kf-badge'} data-tone={tone} data-variant={variant}>
      {icon && <Icon name={icon} size={variant === 'tag' ? 10 : 13} />}
      {children}
    </span>
  );
}
