import type { ReactNode } from 'react';
import { useI18n } from '../i18n/i18n';
import { MobileTabBar, type MobileTab } from '../ui/mobile-tab-bar';
import { type Star, UniverseBackdrop } from '../ui/universe-backdrop';
import { SHELL_PATHS } from './shell-paths';
import './phone-shell.css';

/** The tabs of the phone tab bar. */
export type PhoneTab = 'universe' | 'graph' | 'create' | 'mine' | 'copilot';

/** The stars of the phone boards: 40 points by the boards' own formula, in the top 480px. */
export const PHONE_STARS: readonly Star[] = Array.from({ length: 40 }, (_, j) => ({
  x: (j * 97) % 390,
  y: (j * 61 + 21) % 480,
  r: j % 4 === 0 ? 2 : 1,
  delay: (j % 7) * 0.4,
}));

interface PhoneShellProps {
  /** The mock board of the screen (data-screen, read by the parity check and the e2e tests). */
  screen: string;
  /** The tab of the screen; none lights no tab. */
  tab?: PhoneTab;
  /** Left out by screens that cover the whole window (M03's sheet over its text). */
  tabBar?: boolean;
  /** The create screen (M02): the "+" turns into "×", back to the Universe. */
  createOpen?: boolean;
  stars?: boolean;
  className?: string;
  children?: ReactNode;
}

/**
 * The frame of the phone screens (boards Mobile, M02–M06): the portrait landscape under the phone veil, the screen's
 * content laid out at the window's own width and height (no board zoom), and the bottom tab bar, which stands in for
 * the lens rail. The page itself never scrolls; long content scrolls inside the screen.
 */
export function PhoneShell({ screen, tab, tabBar = true, createOpen = false, stars = true, className, children }: PhoneShellProps): ReactNode {
  const { t } = useI18n();
  const tabs: MobileTab[] = [
    { id: 'universe', label: t('shell.tabs.universe'), href: SHELL_PATHS.universe, icon: 'tab-universe' },
    { id: 'graph', label: t('shell.tabs.graph'), href: SHELL_PATHS.graph, icon: 'graph-tree' },
    createOpen
      ? { id: 'create', label: t('shell.tabs.close'), href: SHELL_PATHS.universe, icon: 'close', kind: 'create' }
      : { id: 'create', label: t('shell.tabs.create'), href: SHELL_PATHS.create, icon: 'plus', kind: 'create' },
    { id: 'mine', label: t('shell.tabs.mine'), href: SHELL_PATHS.mine, icon: 'tab-me' },
    { id: 'copilot', label: t('shell.tabs.copilot'), href: SHELL_PATHS.copilot, icon: 'tab-copilot' },
  ];
  return (
    <UniverseBackdrop veil="phone" stars={stars} starField={PHONE_STARS} artPosition="16% 50%" className={className ? `phone-shell ${className}` : 'phone-shell'}>
      <main id="content" className="phone-main" data-screen={screen} data-id={`screen-${screen}`}>
        {children}
      </main>
      {tabBar && <MobileTabBar label={t('shell.rail')} tabs={tabs} activeId={tab} />}
    </UniverseBackdrop>
  );
}
