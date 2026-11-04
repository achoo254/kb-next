import type { ReactNode } from 'react';
import { Icon, type IconName } from './icon';
import './view-nav.css';

export interface ViewNavItem {
  id: string;
  label: string;
  href: string;
  icon: IconName;
}

interface ViewNavProps {
  /** Accessible name of the nav ("Chế độ xem"). */
  label: string;
  items: readonly ViewNavItem[];
  /** The view on screen: its pill gets the violet glowing rim and `aria-current="page"`. */
  activeId: string;
  /** `full`: the 52px top bar of the screens; `mini`: the 44px sample of the DesignSystem board. */
  size?: 'full' | 'mini';
  className?: string;
}

/** The segmented view nav of KIT §4 (Orbit · Graph · Canvas · Docs). */
export function ViewNav({ label, items, activeId, size = 'full', className }: ViewNavProps): ReactNode {
  return (
    <nav aria-label={label} className={className ? `kf-view-nav ${className}` : 'kf-view-nav'} data-size={size}>
      {items.map((item) => {
        const active = item.id === activeId;
        return (
          <a
            key={item.id}
            href={item.href}
            className="kf-view-nav-item"
            aria-current={active ? 'page' : undefined}
            data-id={`view-nav-${item.id}`}
          >
            <Icon name={item.icon} size={size === 'mini' ? 14 : 18} />
            {item.label}
          </a>
        );
      })}
    </nav>
  );
}
