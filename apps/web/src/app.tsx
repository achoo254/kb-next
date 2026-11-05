import { type ReactNode, useEffect } from 'react';
import { LOGIN_PATH, type SessionState, signOut, useSession } from './api/session-api';
import { brand } from './brand';
import { useI18n } from './i18n/i18n';
import { AppShell, type RailId, type ViewId } from './layout/app-shell';
import { ScreenPage } from './layout/screen-page';
import { SessionProvider } from './layout/session-context';
import { UnreadProvider } from './layout/unread-context';
import type { BackdropVeil } from './ui/universe-backdrop';
import { AdminApiScreen } from './pages/admin-api-screen';
import { AdminContentScreen } from './pages/admin-content-screen';
import { AdminGate } from './pages/admin-gate';
import { AdminReviewScreen } from './pages/admin-review-screen';
import { CanvasRoute } from './pages/canvas-screen';
import { CopilotScreen } from './pages/copilot-screen';
import { CreateMenu } from './pages/create-menu';
import { EditorScreen } from './pages/editor-screen';
import { ErrorScreen } from './pages/error-screen';
import { GraphScreen } from './pages/graph-screen';
import { HistoryScreen } from './pages/history-screen';
import { ImportScreen } from './pages/import-screen';
import { InboxScreen } from './pages/inbox-screen';
import { JourneyBuilderScreen, NewJourney } from './pages/journey-builder';
import { JourneyRunScreen } from './pages/journey-run';
import { KeysScreen } from './pages/keys-screen';
import { LandingPage } from './pages/landing-page';
import { LoginPage, UniverseOpening } from './pages/login-page';
import { MineScreen } from './pages/mine-screen';
import { NewNote } from './pages/new-note';
import { PreviewScreen } from './pages/preview-screen';
import { PublishScreen } from './pages/publish-screen';
import { ReaderScreen } from './pages/reader-screen';
import { SearchScreen } from './pages/search-screen';
import { ShareScreen } from './pages/share-screen';
import { SharedOpenScreen } from './pages/shared-open-screen';
import { SubmitScreen } from './pages/submit-screen';
import { SyncScreen } from './pages/sync-screen';
import { SpaceScreen } from './pages/space-screen';
import { TranslateScreen } from './pages/translate-screen';
import { UniverseEntry } from './pages/universe-entry';
import { UniverseScreen } from './pages/universe-screen';
import { UploadScreen } from './pages/upload-screen';
import { type ScreenRoute, matchRoute, routePath } from './routes';

/** Whether the screen can show now: public screens always, the others once the session says signed in. */
export function canShow(route: ScreenRoute, session: SessionState): boolean {
  return route.access === 'public' || (session.status === 'ready' && session.signedIn);
}

/** Where a visitor without a session goes for a signed-in screen: the sign-in page, then back here. */
export function loginRedirect(pathname: string, search: string): string {
  return `${LOGIN_PATH}?${new URLSearchParams({ return: `${pathname}${search}` }).toString()}`;
}

/** The lens rail section, view pill and veil of each signed-in screen (as on its board). */
export const SCREEN_CHROME: Record<string, { rail?: RailId; view?: ViewId; veil?: BackdropVeil }> = {
  C09: { rail: 'universe', view: 'orbit' },
  C10: { rail: 'spaces' },
  C11: { view: 'docs', veil: 'strong' },
  C12: { rail: 'search', veil: 'strong' },
  C13: { rail: 'graph', view: 'graph' },
  C14: { rail: 'copilot' },
  C15: { rail: 'spaces', view: 'canvas' },
  C01: { rail: 'create' },
  C02: { rail: 'create', view: 'docs', veil: 'strong' },
  C17: { rail: 'spaces', view: 'docs', veil: 'strong' },
  C08: { rail: 'mine', veil: 'strong' },
  C03: { rail: 'create', veil: 'strong' },
  C16: { rail: 'mine', veil: 'strong' },
  H04: { veil: 'radial' },
  C20: { veil: 'strong' },
  H03: { rail: 'settings', veil: 'strong' },
  F03: { rail: 'settings', veil: 'radial' },
  F04: { rail: 'spaces', veil: 'strong' },
  A01: { veil: 'strong' },
  A02: { veil: 'strong' },
  A03: { veil: 'strong' },
  C06: { rail: 'mine' },
};

/** The card of a screen not built yet: its board code and name, and a sign-out on signed-in screens. */
function PendingCard({ route, signedIn }: { route: ScreenRoute; signedIn: boolean }): ReactNode {
  const { t } = useI18n();
  return (
    <section className="glass-card" data-id="pending-screen">
      <p className="screen-code">{route.code}</p>
      <h1 className="screen-title">{t(route.titleKey)}</h1>
      <p className="screen-lead">{t('screen.placeholder', { code: route.code })}</p>
      {signedIn && (
        <button type="button" className="btn-ghost" data-id="sign-out" onClick={() => void signOut().finally(() => window.location.assign('/'))}>
          {t('layout.signOut')}
        </button>
      )}
    </section>
  );
}

/** The path parameter of a route (`/s/:space`, `/d/:doc`): the pattern's first capture group. */
export function routeParam(route: ScreenRoute, path: string): string {
  return route.pattern.exec(path)?.[1] ?? '';
}

/**
 * A signed-in screen. The built screens live in their own files (pages/*-screen.tsx); the others show the app shell
 * around a "being built" card. The Universe goes through its entry (opening, first visit).
 */
function SignedInScreen({ route, path }: { route: ScreenRoute; path: string }): ReactNode {
  switch (route.code) {
    case 'C09':
      return (
        <UniverseEntry>
          <UniverseScreen />
        </UniverseEntry>
      );
    case 'C10':
      return <SpaceScreen slug={routeParam(route, path)} />;
    case 'C11':
      return <ReaderScreen id={routeParam(route, path)} />;
    case 'C02':
      return path === '/new' ? <NewNote /> : <EditorScreen id={routeParam(route, path)} />;
    case 'C17':
      return <HistoryScreen id={routeParam(route, path)} />;
    case 'C01':
      return <CreateMenu />;
    case 'C08':
      return <MineScreen />;
    case 'C03':
      return <UploadScreen />;
    case 'C16':
      return <ImportScreen />;
    case 'H04':
      return <SyncScreen />;
    case 'C12':
      return <SearchScreen />;
    case 'C13':
      return <GraphScreen />;
    case 'C14':
      return <CopilotScreen />;
    case 'C15':
      return <CanvasRoute id={routeParam(route, path)} />;
    case 'C07':
      return path === '/journey/new' ? <NewJourney /> : <JourneyBuilderScreen id={routeParam(route, path)} />;
    case 'Flow':
      return <JourneyRunScreen id={routeParam(route, path)} />;
    case 'F03':
      return <KeysScreen />;
    case 'F04':
      return <TranslateScreen id={routeParam(route, path)} />;
    case 'C04':
      return <PublishScreen id={routeParam(route, path)} />;
    case 'C05':
      return <PreviewScreen id={routeParam(route, path)} />;
    case 'C06':
      return <SubmitScreen id={routeParam(route, path)} />;
    case 'C18':
      return <ShareScreen id={routeParam(route, path)} />;
    case 'C20':
      return <InboxScreen />;
    case 'A01':
      return (
        <AdminGate code="A01">
          <AdminReviewScreen />
        </AdminGate>
      );
    case 'A02':
      return (
        <AdminGate code="A02">
          <AdminContentScreen />
        </AdminGate>
      );
    case 'A03':
      return (
        <AdminGate code="A03">
          <AdminApiScreen />
        </AdminGate>
      );
    default: {
      const chrome = SCREEN_CHROME[route.code] ?? {};
      return (
        <AppShell screen={route.code} rail={chrome.rail} view={chrome.view} veil={chrome.veil}>
          <div className="screen">
            <PendingCard route={route} signedIn />
          </div>
        </AppShell>
      );
    }
  }
}

function Screen({ route, path, session }: { route: ScreenRoute; path: string; session: SessionState }): ReactNode {
  const { t } = useI18n();
  if (!canShow(route, session)) {
    // The Universe opens with its own waiting card (S02 B); other screens say the session is being checked.
    if (route.code === 'C09') return <UniverseOpening stage="auth" />;
    return (
      <ScreenPage code={route.code}>
        <p className="screen-lead" role="status" data-id="checking-session">
          {t('layout.checkingSession')}
        </p>
      </ScreenPage>
    );
  }
  switch (route.code) {
    case 'S01':
      return <LandingPage session={session} />;
    case 'S02':
      return <LoginPage session={session} />;
    case 'X02':
      return <ErrorScreen kind="not-found" />;
    case 'H02':
      return <SharedOpenScreen token={routeParam(route, path)} />;
    default:
      if (route.access === 'signed-in') return <SignedInScreen route={route} path={path} />;
      return (
        <ScreenPage code={route.code}>
          <PendingCard route={route} signedIn={false} />
        </ScreenPage>
      );
  }
}

export function App({ pathname }: { pathname: string }): ReactNode {
  const { t } = useI18n();
  const session = useSession();
  const path = routePath(pathname);
  const route = matchRoute(path);

  useEffect(() => {
    document.title = `${t(route.titleKey)} · ${brand.appName}`;
  }, [route, t]);

  useEffect(() => {
    if (route.access === 'signed-in' && session.status === 'ready' && !session.signedIn) {
      window.location.replace(loginRedirect(path, window.location.search));
    }
  }, [route, session, path]);

  return (
    <SessionProvider value={session}>
      <UnreadProvider signedIn={session.status === 'ready' && session.signedIn}>
        <a className="skip-link" href="#content">
          {t('layout.skip')}
        </a>
        <Screen route={route} path={path} session={session} />
      </UnreadProvider>
    </SessionProvider>
  );
}
