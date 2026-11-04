import { type ReactNode, useEffect } from 'react';
import { LOGIN_PATH, type SessionState, signOut, useSession } from './api/session-api';
import { brand } from './brand';
import { useI18n } from './i18n/i18n';
import { ScreenPage } from './layout/screen-page';
import { LoginPage } from './pages/login-page';
import { type ScreenRoute, matchRoute, routePath } from './routes';

/** Whether the screen can show now: public screens always, the others once the session says signed in. */
export function canShow(route: ScreenRoute, session: SessionState): boolean {
  return route.access === 'public' || (session.status === 'ready' && session.signedIn);
}

/** Where a visitor without a session goes for a signed-in screen: the sign-in page, then back here. */
export function loginRedirect(pathname: string, search: string): string {
  return `${LOGIN_PATH}?${new URLSearchParams({ return: `${pathname}${search}` }).toString()}`;
}

/** The screen of a route not built yet: its board code and name, and a sign-out for signed-in screens. */
function PendingScreen({ route, session }: { route: ScreenRoute; session: SessionState }): ReactNode {
  const { t } = useI18n();
  const signedIn = session.status === 'ready' && session.signedIn;
  return (
    <section className="glass-card" data-id="pending-screen">
      <p className="screen-code">{route.code}</p>
      <h1 className="screen-title">{t(route.titleKey)}</h1>
      <p className="screen-lead">{t(route.code === 'X02' ? 'notFound.lead' : 'screen.placeholder', { code: route.code })}</p>
      {route.code === 'X02' && (
        <a className="btn-primary" href="/">
          {t('notFound.back')}
        </a>
      )}
      {signedIn && route.access === 'signed-in' && (
        <button type="button" className="btn-ghost" data-id="sign-out" onClick={() => void signOut().finally(() => window.location.assign('/'))}>
          {t('layout.signOut')}
        </button>
      )}
    </section>
  );
}

export function App({ pathname }: { pathname: string }): ReactNode {
  const { t } = useI18n();
  const session = useSession();
  const path = routePath(pathname);
  const route = matchRoute(path);
  const show = canShow(route, session);

  useEffect(() => {
    document.title = `${t(route.titleKey)} · ${brand.appName}`;
  }, [route, t]);

  useEffect(() => {
    if (route.access === 'signed-in' && session.status === 'ready' && !session.signedIn) {
      window.location.replace(loginRedirect(path, window.location.search));
    }
  }, [route, session, path]);

  return (
    <>
      <a className="skip-link" href="#content">
        {t('layout.skip')}
      </a>
      <ScreenPage code={route.code}>
        {!show ? (
          <p className="screen-lead" role="status" data-id="checking-session">
            {t('layout.checkingSession')}
          </p>
        ) : route.code === 'S02' ? (
          <LoginPage session={session} />
        ) : (
          <PendingScreen route={route} session={session} />
        )}
      </ScreenPage>
    </>
  );
}
