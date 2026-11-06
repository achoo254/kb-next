import { type ReactNode, createContext, useContext, useEffect, useId, useLayoutEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import type { SessionUser } from '../api/session-api';
import { type Translate, useI18n } from '../i18n/i18n';
import { LensRail, type LensRailItem } from '../ui/lens-rail';
import { TopActions } from '../ui/top-actions';
import { type BackdropVeil, UniverseBackdrop } from '../ui/universe-backdrop';
import { ViewNav, type ViewNavItem } from '../ui/view-nav';
import { CommandPalette } from '../palette/command-palette';
import { useRouterState } from '../router/navigation';
import { BrandLogo } from './brand-logo';
import { useDevice } from './device';
import { SHELL_PATHS } from './shell-paths';
import { type ShellHostStore, createShellHostStore } from './shell-host-store';
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
  /** Left of the bell (A01's shortcut hint, T01's Copilot button). */
  topExtra?: ReactNode;
  /**
   * The screen's tablet board (T01 `universe`, T02 `reader`): in the tablet layout the screen is laid out on its
   * 1180×820 board instead of the desktop one (device.ts).
   */
  tabletBoard?: 'universe' | 'reader';
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

/**
 * The ⌘K palette's open state: the shortcut (anywhere on the page) and the top-right button open and close it. It
 * belongs to the page on view: a navigation (also back/forward) closes it.
 */
function usePalette(): { open: boolean; toggle(): void; close(): void } {
  const page = useRouterState().location.key;
  // the page it was opened on; open only while that page is on view
  const [openOn, setOpenOn] = useState<string | null>(null);
  const open = openOn === page;
  useEffect(() => {
    const onKey = (event: KeyboardEvent): void => {
      if (!isPaletteShortcut(event)) return;
      event.preventDefault();
      setOpenOn((current) => (current === page ? null : page));
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [page]);
  return { open, toggle: () => setOpenOn(open ? null : page), close: () => setOpenOn(null) };
}

/** The frame's own props: a screen's AppShell props without the content, plus where its `<main>` is reported. */
type ShellFrameProps = Omit<AppShellProps, 'children'> & { mainRef?: (element: HTMLElement | null) => void; children?: ReactNode };

/**
 * The frame of every signed-in screen (boards C09–C20): the Universe backdrop, the logo, the view nav, the bell and
 * ⌘K (the quick-search palette, F01, also on ⌘K / Ctrl+K), the lens rail with the account avatar, the breadcrumb, and
 * the screen's own content in `<main>`. The screen places its content at the board's coordinates inside `<main>`
 * (the full window, under the chrome).
 */
function ShellFrame({
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
  tabletBoard,
  className,
  mainRef,
  children,
}: ShellFrameProps): ReactNode {
  const device = useDevice();
  const tablet = tabletBoard !== undefined && device === 'tablet';
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
    <UniverseBackdrop
      veil={veil}
      stars={stars}
      className={[
        'app-shell board-frame',
        tablet ? `board-frame-tablet app-shell-tablet app-shell-tablet-${tabletBoard}` : '',
        palette.open ? 'app-shell-palette' : '',
        className ?? '',
      ]
        .filter(Boolean)
        .join(' ')}
    >
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
      <main ref={mainRef} id="content" className="app-shell-main board-frame-main" data-screen={screen} data-id={`screen-${screen}`}>
        {children}
      </main>
      {palette.open && <CommandPalette onClose={palette.close} />}
    </UniverseBackdrop>
  );
}

type HostedProps = Omit<AppShellProps, 'children'>;

const ShellHostContext = createContext<ShellHostStore<HostedProps> | null>(null);

/**
 * A value of the host store, followed from the layout phase on: the frame and the screen's content then land in the
 * same paint as the screen (a passive subscription would leave the first paint without them).
 */
function useHostValue<T>(subscribe: (listener: () => void) => () => void, read: () => T): T {
  const [value, setValue] = useState(read);
  useLayoutEffect(() => {
    const follow = (): void => setValue(() => read());
    follow();
    return subscribe(follow);
  }, [subscribe, read]);
  return value;
}

/** Draws the one frame from the props the screen on view published; its `<main>` takes the screen's content. */
function ShellOutlet({ store }: { store: ShellHostStore<HostedProps> }): ReactNode {
  const shell = useHostValue(store.subscribeShell, store.shell);
  return shell ? <ShellFrame {...shell} mainRef={store.setMain} /> : null;
}

/**
 * Keeps the app shell mounted while the screens below it change (in-app navigation, docs/navigation.md): the
 * screens' AppShells publish their props to it and portal their content into its `<main>`. The frame is drawn ahead
 * of the screens, where a screen's own AppShell used to be.
 */
export function ShellHost({ children }: { children?: ReactNode }): ReactNode {
  const [store] = useState(() => createShellHostStore<HostedProps>());
  return (
    <ShellHostContext value={store}>
      <ShellOutlet store={store} />
      {children}
    </ShellHostContext>
  );
}

function HostedShell({ store, children, ...props }: AppShellProps & { store: ShellHostStore<HostedProps> }): ReactNode {
  const id = useId();
  // followed before publishing below, so the frame's `<main>` reaches this screen as soon as the frame mounts
  const main = useHostValue(store.subscribeMain, store.main);
  // Every render: the frame follows the screen's props (active rail circle, breadcrumb, veil…) as before.
  useLayoutEffect(() => {
    store.publish(id, props);
  });
  useLayoutEffect(() => () => store.withdraw(id), [store, id]);
  return main ? createPortal(children, main) : null;
}

/**
 * The frame of a signed-in screen (ShellFrame). Under a ShellHost (the app) the frame is shared and stays mounted
 * from screen to screen; on its own (a test, the dev kit) it draws its frame in place.
 */
export function AppShell({ children, ...props }: AppShellProps): ReactNode {
  const store = useContext(ShellHostContext);
  if (store) {
    return (
      <HostedShell store={store} {...props}>
        {children}
      </HostedShell>
    );
  }
  return <ShellFrame {...props}>{children}</ShellFrame>;
}
