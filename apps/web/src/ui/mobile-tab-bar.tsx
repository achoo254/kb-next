import type { ReactNode } from 'react';
import { Icon, type IconName } from './icon';
import './mobile-tab-bar.css';

export interface MobileTab {
  id: string;
  /** The word under the icon; the accessible name of the "+" tab, which shows no word. */
  label: string;
  href: string;
  icon: IconName;
  /** `create`: the raised round "+" in the middle. */
  kind?: 'link' | 'create';
}

interface MobileTabBarProps {
  /** Accessible name of the nav. */
  label: string;
  tabs: readonly MobileTab[];
  /** The tab on screen: its icon sits in the glowing circle. */
  activeId?: string;
  className?: string;
}

/**
 * The bottom pill of the phone boards (Mobile, M02–M06): five tabs in a glass pill with a glowing rim, the "+" raised
 * in the middle. The only bottom dock of Knowledge Base, standing in for the lens rail on a phone. Each tab is at least
 * 52×52 px, past the 44 px touch target.
 */
export function MobileTabBar({ label, tabs, activeId, className }: MobileTabBarProps): ReactNode {
  return (
    <nav aria-label={label} className={className ? `kf-tabbar ${className}` : 'kf-tabbar'} data-id="tab-bar">
      {tabs.map((tab) => {
        const create = tab.kind === 'create';
        return (
          <a
            key={tab.id}
            href={tab.href}
            aria-label={create ? tab.label : undefined}
            aria-current={tab.id === activeId ? 'page' : undefined}
            className="kf-tabbar-item"
            data-kind={tab.kind ?? 'link'}
            data-id={`tab-${tab.id}`}
          >
            <span className="kf-tabbar-icon">
              <Icon name={tab.icon} size={20} strokeWidth={2} />
            </span>
            {!create && tab.label}
          </a>
        );
      })}
    </nav>
  );
}
