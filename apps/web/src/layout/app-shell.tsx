import { type ReactNode, useEffect, useState } from 'react';
import type { SessionUser } from '../api/session-api';
import { type Translate, useI18n } from '../i18n/i18n';
import { LensRail, type LensRailItem } from '../ui/lens-rail';
import { TopActions } from '../ui/top-actions';
import { type BackdropVeil, UniverseBackdrop } from '../ui/universe-backdrop';
import { ViewNav, type ViewNavItem } from '../ui/view-nav';
import { CommandPalette } from '../palette/command-palette';
import { BrandLogo } from './brand-logo';
import { SHELL_PATHS } from './shell-paths';
import { signedInUser, useSessionState } from './session-context';
import { type StaffRole, useStaffRole } from './staff-role';
import { useUnread } from './unread-context';
import './app-shell.css';

/** The sections of the lens rail, top to bottom (boards C09–C15), and of the admin rail (A01–A03). */
export type RailId = 'universe' | 'graph' | 'create' | 'search' | 'copilot' | 'spaces' | 'mine' | 'settings' | 'review' | 'content' | 'api' | 'workspace';
/** The views of the nav pill. */
export type ViewId = 'orbit' | 'graph' | 'canvas' | 'docs';

/** One step of the breadcrumb "Universe › Space › Collection › Document"; the last one is the page itself. */
export interface BreadcrumbItem {
  label: string;
  /** Left out for the current page (and for a step that has no page of its own). */
  href?: string;
}

export { SHELL_PATHS };

interface AppShellProps {
  /** The mock board of the screen (data-screen, read by the parity check and the e2e tests). */
  screen: string;
  /** The lens rail section the screen belongs to (none: no circle is filled). */
  rail?: RailId;
  /** The view pill to light (none on screens that are not a view, e.g. Search). */
  view?: ViewId;
  /** "Universe › Space › Collection › Document", under the top bar; left out on the Universe itself. */
  breadcrumb?: readonly BreadcrumbItem[];
  /** A link after the breadcrumb (C14 "Mở từ: Giao thức DHCP"). */
  crumbAction?: ReactNode;
  /** The veil over the landscape: `scene` for the Universe views, `strong` for reading and editing (KIT §2). */
  veil?: BackdropVeil;
  /** The twinkling stars (C09); off on work screens. */
  stars?: boolean;
  /** The Space the rail's "Spaces" and the view pill's links open (the current or last Space); the Universe otherwise. */
  spaceHref?: string;
  /** The document the "Docs" view opens (the current or last one); "My content" otherwise. */
  docHref?: string;
  /** Unread notifications (the red dot on the bell); default: the account's count (unread-context.tsx). */
  unread?: number;
  /** The admin station (A01–A03): no view pill, the "Trạm quản trị" badge by the logo, the admin rail. */
  admin?: boolean;
  /** Left of the bell (A01's shortcut hint). */
  topExtra?: ReactNode;
  className?: string;
  children?: ReactNode;
}

/** The Graph or Canvas of the Space `spaceHref` opens (`/s/<slug>`), else of no Space in particular. */
export function spaceViewHref(base: string, spaceHref: string): string {
  const slug = /^\/s\/([A-Za-z0-9_-]+)$/.exec(spaceHref)?.[1];
  return slug ? `${base}?${new URLSearchParams({ space: slug }).toString()}` : base;
}

function railItems(t: Translate, spaceHref: string): LensRailItem[] {
  return [
    { id: 'universe', label: t('shell.rail.universe'), href: SHELL_PATHS.universe, icon: 'home', spaceAfter: 6 },
    { id: 'graph', label: t('shell.rail.graph'), href: spaceViewHref(SHELL_PATHS.graph, spaceHref), icon: 'graph', spaceAfter: 22 },
    { id: 'create', label: t('shell.rail.create'), href: SHELL_PATHS.create, icon: 'plus', kind: 'create', spaceAfter: 8 },
    { id: 'search', label: t('shell.rail.search'), href: SHELL_PATHS.search, icon: 'search' },
    { id: 'copilot', label: t('shell.rail.copilot'), href: SHELL_PATHS.copilot, icon: 'sparkles' },
    { id: 'spaces', label: t('shell.rail.spaces'), href: spaceHref, icon: 'orbit' },
    { id: 'mine', label: t('shell.rail.mine'), href: SHELL_PATHS.mine, icon: 'bars' },
    { id: 'settings', label: t('shell.rail.settings'), href: SHELL_PATHS.settings, icon: 'settings' },
  ];
}

/**
 * The admin station's rail (A01–A03, C19): the queue, published texts, the API; then the workspace settings and back
 * to the Universe. A reviewer only gets the queue and the way back.
 */
function adminRailItems(t: Translate, role: StaffRole): LensRailItem[] {
  const review: LensRailItem = { id: 'review', label: t('shell.admin.review'), href: SHELL_PATHS.adminReview, icon: 'admin-review', spaceAfter: role === 'admin' ? 2 : 21 };
  const universe: LensRailItem = { id: 'universe', label: t('shell.admin.universe'), href: SHELL_PATHS.universe, icon: 'orbit' };
  if (role === 'reviewer') return [review, universe];
  return [
    review,
    { id: 'content', label: t('shell.admin.content'), href: SHELL_PATHS.adminContent, icon: 'admin-content', spaceAfter: 2 },
    { id: 'api', label: t('shell.admin.api'), href: SHELL_PATHS.adminApi, icon: 'admin-api', spaceAfter: 21 },
    { id: 'workspace', label: t('shell.admin.settings'), href: SHELL_PATHS.workspace, icon: 'settings', spaceAfter: 2 },
    universe,
  ];
}

function viewItems(t: Translate, docHref: string, spaceHref: string): ViewNavItem[] {
  return [
    { id: 'orbit', label: t('shell.view.orbit'), href: SHELL_PATHS.universe, icon: 'orbit' },
    { id: 'graph', label: t('shell.view.graph'), href: spaceViewHref(SHELL_PATHS.graph, spaceHref), icon: 'graph' },
    { id: 'canvas', label: t('shell.view.canvas'), href: spaceViewHref(SHELL_PATHS.canvas, spaceHref), icon: 'canvas' },
    { id: 'docs', label: t('shell.view.docs'), href: docHref, icon: 'docs' },
  ];
}

/** The letter of the avatar: the first letter of the account's name, else of its email. */
export function accountInitial(user: SessionUser): string {
  const source = user.name?.trim() || user.email?.trim() || '';
  const first = Array.from(source)[0];
  return first ? first.toLocaleUpperCase() : '·';
}

function Breadcrumb({ items, label, action }: { items: readonly BreadcrumbItem[]; label: string; action?: ReactNode }): ReactNode {
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
      {action}
    </nav>
  );
}

/** Whether a key press asks for the ⌘K palette: ⌘K on a Mac, Ctrl+K elsewhere. */
export function isPaletteShortcut(event: Pick<KeyboardEvent, 'key' | 'metaKey' | 'ctrlKey' | 'altKey' | 'shiftKey'>): boolean {
  return (event.metaKey || event.ctrlKey) && !event.altKey && !event.shiftKey && event.key.toLowerCase() === 'k';
}

/** The ⌘K palette's open state: the shortcut (anywhere on the page) and the top-right button open and close it. */
function usePalette(): { open: boolean; toggle(): void; close(): void } {
  const [open, setOpen] = useState(false);
  useEffect(() => {
    const onKey = (event: KeyboardEvent): void => {
      if (!isPaletteShortcut(event)) return;
      event.preventDefault();
      setOpen((current) => !current);
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, []);
  return { open, toggle: () => setOpen((current) => !current), close: () => setOpen(false) };
}

/**
 * The frame of every signed-in screen (boards C09–C20): the Universe backdrop, the logo, the view nav, the bell and
 * ⌘K (the quick-search palette, F01, also on ⌘K / Ctrl+K), the lens rail with the account avatar, the breadcrumb, and
 * the screen's own content in `<main>`. The screen places its content at the board's coordinates inside `<main>`
 * (the full window, under the chrome).
 */
export function AppShell({
  screen,
  rail,
  view,
  breadcrumb,
  crumbAction,
  veil = 'scene',
  stars = true,
  spaceHref = SHELL_PATHS.universe,
  docHref = SHELL_PATHS.mine,
  unread,
  admin = false,
  topExtra,
  className,
  children,
}: AppShellProps): ReactNode {
  const { t } = useI18n();
  const accountUnread = useUnread().total;
  const user = signedInUser(useSessionState());
  const palette = usePalette();
  const staffRole = useStaffRole();
  const account = user
    ? {
        label: user.name ? t('shell.account', { name: user.name }) : t('shell.accountUnnamed'),
        initial: accountInitial(user),
        picture: user.picture,
        href: SHELL_PATHS.settings,
      }
    : undefined;
  return (
    <UniverseBackdrop veil={veil} stars={stars} className={[`app-shell board-frame`, palette.open ? 'app-shell-palette' : '', className ?? ''].filter(Boolean).join(' ')}>
      <div className="app-shell-chrome">
        <BrandLogo />
        {admin ? (
          <span className="app-shell-admin-badge" data-id="admin-badge">
            {t('shell.admin.badge')}
          </span>
        ) : (
          <ViewNav label={t('shell.views')} items={viewItems(t, docHref, spaceHref)} activeId={view ?? ''} className="app-shell-nav" />
        )}
        <TopActions
          inboxHref={SHELL_PATHS.inbox}
          unread={unread ?? accountUnread}
          inboxOpen={screen === 'C20'}
          extra={topExtra}
          searchHref={SHELL_PATHS.search}
          onCommand={palette.toggle}
          commandOpen={palette.open}
          className="app-shell-top"
        />
        <LensRail
          label={admin ? t('shell.admin.rail') : t('shell.rail')}
          items={admin ? adminRailItems(t, staffRole) : railItems(t, spaceHref)}
          activeId={rail}
          account={account}
          className={admin ? 'app-shell-rail app-shell-rail-admin' : 'app-shell-rail'}
        />
        {breadcrumb && breadcrumb.length > 0 && <Breadcrumb items={breadcrumb} label={t('shell.breadcrumb')} action={crumbAction} />}
      </div>
      <main id="content" className="app-shell-main board-frame-main" data-screen={screen} data-id={`screen-${screen}`}>
        {children}
      </main>
      {palette.open && <CommandPalette onClose={palette.close} />}
    </UniverseBackdrop>
  );
}
