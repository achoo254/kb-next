import type { ReactNode } from 'react';
import type { SessionUser } from '../api/session-api';
import { type Translate, useI18n } from '../i18n/i18n';
import { LensRail, type LensRailItem } from '../ui/lens-rail';
import { TopActions } from '../ui/top-actions';
import { type BackdropVeil, UniverseBackdrop } from '../ui/universe-backdrop';
import { ViewNav, type ViewNavItem } from '../ui/view-nav';
import { BrandLogo } from './brand-logo';
import { signedInUser, useSessionState } from './session-context';
import './app-shell.css';

/** The sections of the lens rail, top to bottom (boards C09–C15). */
export type RailId = 'universe' | 'graph' | 'create' | 'search' | 'copilot' | 'spaces' | 'mine' | 'settings';
/** The views of the nav pill. */
export type ViewId = 'orbit' | 'graph' | 'canvas' | 'docs';

/** One step of the breadcrumb "Universe › Space › Collection › Document"; the last one is the page itself. */
export interface BreadcrumbItem {
  label: string;
  /** Left out for the current page (and for a step that has no page of its own). */
  href?: string;
}

/** Where the routes of the shell lead (app routes, routes.ts). */
export const SHELL_PATHS = {
  universe: '/u',
  graph: '/graph',
  canvas: '/canvas',
  search: '/search',
  copilot: '/copilot',
  mine: '/me',
  settings: '/settings',
  inbox: '/inbox',
} as const;

interface AppShellProps {
  /** The mock board of the screen (data-screen, read by the parity check and the e2e tests). */
  screen: string;
  /** The lens rail section the screen belongs to (none: no circle is filled). */
  rail?: RailId;
  /** The view pill to light (none on screens that are not a view, e.g. Search). */
  view?: ViewId;
  /** "Universe › Space › Collection › Document", under the top bar; left out on the Universe itself. */
  breadcrumb?: readonly BreadcrumbItem[];
  /** The veil over the landscape: `scene` for the Universe views, `strong` for reading and editing (KIT §2). */
  veil?: BackdropVeil;
  /** The twinkling stars (C09); off on work screens. */
  stars?: boolean;
  /** The Space the rail's "Spaces" and the view pill's links open (the current or last Space); the Universe otherwise. */
  spaceHref?: string;
  /** The document the "Docs" view opens (the current or last one); "My content" otherwise. */
  docHref?: string;
  /** Unread notifications (the red dot on the bell). */
  unread?: number;
  className?: string;
  children?: ReactNode;
}

function railItems(t: Translate, spaceHref: string): LensRailItem[] {
  return [
    { id: 'universe', label: t('shell.rail.universe'), href: SHELL_PATHS.universe, icon: 'home', spaceAfter: 6 },
    { id: 'graph', label: t('shell.rail.graph'), href: SHELL_PATHS.graph, icon: 'graph', spaceAfter: 22 },
    { id: 'create', label: t('shell.rail.create'), href: SHELL_PATHS.mine, icon: 'plus', kind: 'create', spaceAfter: 8 },
    { id: 'search', label: t('shell.rail.search'), href: SHELL_PATHS.search, icon: 'search' },
    { id: 'copilot', label: t('shell.rail.copilot'), href: SHELL_PATHS.copilot, icon: 'sparkles' },
    { id: 'spaces', label: t('shell.rail.spaces'), href: spaceHref, icon: 'orbit' },
    { id: 'mine', label: t('shell.rail.mine'), href: SHELL_PATHS.mine, icon: 'bars' },
    { id: 'settings', label: t('shell.rail.settings'), href: SHELL_PATHS.settings, icon: 'settings' },
  ];
}

function viewItems(t: Translate, docHref: string): ViewNavItem[] {
  return [
    { id: 'orbit', label: t('shell.view.orbit'), href: SHELL_PATHS.universe, icon: 'orbit' },
    { id: 'graph', label: t('shell.view.graph'), href: SHELL_PATHS.graph, icon: 'graph' },
    { id: 'canvas', label: t('shell.view.canvas'), href: SHELL_PATHS.canvas, icon: 'canvas' },
    { id: 'docs', label: t('shell.view.docs'), href: docHref, icon: 'docs' },
  ];
}

/** The letter of the avatar: the first letter of the account's name, else of its email. */
export function accountInitial(user: SessionUser): string {
  const source = user.name?.trim() || user.email?.trim() || '';
  const first = Array.from(source)[0];
  return first ? first.toLocaleUpperCase() : '·';
}

function Breadcrumb({ items, label }: { items: readonly BreadcrumbItem[]; label: string }): ReactNode {
  return (
    <nav aria-label={label} className="app-shell-crumbs" data-id="breadcrumb">
      <ol>
        {items.map((item, index) => {
          const last = index === items.length - 1;
          return (
            <li key={`${index}-${item.label}`}>
              {last ? (
                <span aria-current="page" className="app-shell-crumb-current">
                  {item.label}
                </span>
              ) : item.href ? (
                <a href={item.href}>{item.label}</a>
              ) : (
                <span className="app-shell-crumb-plain">{item.label}</span>
              )}
              {!last && (
                <span className="app-shell-crumb-sep" aria-hidden="true">
                  ›
                </span>
              )}
            </li>
          );
        })}
      </ol>
    </nav>
  );
}

/**
 * The frame of every signed-in screen (boards C09–C20): the Universe backdrop, the logo, the view nav, the bell and
 * ⌘K, the lens rail with the account avatar, the breadcrumb, and the screen's own content in `<main>`. The screen
 * places its content at the board's coordinates inside `<main>` (the full window, under the chrome).
 */
export function AppShell({
  screen,
  rail,
  view,
  breadcrumb,
  veil = 'scene',
  stars = true,
  spaceHref = SHELL_PATHS.universe,
  docHref = SHELL_PATHS.mine,
  unread = 0,
  className,
  children,
}: AppShellProps): ReactNode {
  const { t } = useI18n();
  const user = signedInUser(useSessionState());
  const account = user
    ? {
        label: user.name ? t('shell.account', { name: user.name }) : t('shell.accountUnnamed'),
        initial: accountInitial(user),
        href: SHELL_PATHS.settings,
      }
    : undefined;
  return (
    <UniverseBackdrop veil={veil} stars={stars} className={className ? `app-shell ${className}` : 'app-shell'}>
      <div className="app-shell-chrome">
        <BrandLogo />
        <ViewNav label={t('shell.views')} items={viewItems(t, docHref)} activeId={view ?? ''} className="app-shell-nav" />
        <TopActions inboxHref={SHELL_PATHS.inbox} unread={unread} searchHref={SHELL_PATHS.search} className="app-shell-top" />
        <LensRail label={t('shell.rail')} items={railItems(t, spaceHref)} activeId={rail} account={account} className="app-shell-rail" />
        {breadcrumb && breadcrumb.length > 0 && <Breadcrumb items={breadcrumb} label={t('shell.breadcrumb')} />}
      </div>
      <main id="content" className="app-shell-main" data-screen={screen} data-id={`screen-${screen}`}>
        {children}
      </main>
    </UniverseBackdrop>
  );
}
