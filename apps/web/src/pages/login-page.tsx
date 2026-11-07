import { type ReactNode, useEffect, useState } from 'react';
import { GO_PARAM, type SessionState, loginReturnPath, signInHref } from '../api/session-api';
import { useI18n } from '../i18n/i18n';
import { LegalLinks } from '../layout/legal-links';
import { ScreenPage } from '../layout/screen-page';
import { Button } from '../ui/button';
import { usePacedStage } from './opening-pace';
import { AuthGateCard, type OpeningStage, type SignInFailure, SignInFailedCard, UniverseOpeningCard } from './auth-cards';
import './login-page.css';

/** The `?login=` results the server sends back to /login (apps/server auth-routes.ts). */
const FAILURES: Record<string, SignInFailure> = { fail: 'fail', unavailable: 'unavailable', busy: 'busy', removed: 'removed' };

export function signInFailure(search: string): SignInFailure | null {
  return FAILURES[new URLSearchParams(search).get('login') ?? ''] ?? null;
}

/** Which card /login shows. */
export type LoginView = { card: 'gate'; opening: boolean } | { card: 'opening' } | { card: 'failed'; reason: SignInFailure };

export function loginView(session: SessionState, search: string, started: boolean): LoginView {
  if (session.status === 'ready' && session.signedIn) return { card: 'opening' };
  const failure = signInFailure(search);
  if (failure) return { card: 'failed', reason: failure };
  if (session.status === 'ready' && !session.signInAvailable) return { card: 'failed', reason: 'unavailable' };
  const go = new URLSearchParams(search).get(GO_PARAM) === '1';
  return { card: 'gate', opening: started || go };
}

/**
 * /login (board S02): one way in, through the server's route to the IdP and back to the page the visitor came from
 * (`?return=`). The card shows where signing in is: the gate (a button, or on its way to the IdP), or why it failed
 * with a retry. The app never sees a password; the IdP creates the account when there is none.
 */
export function LoginPage({ session }: { session: SessionState }): ReactNode {
  const { t, locale } = useI18n();
  const search = window.location.search;
  const returnTo = loginReturnPath(search);
  const href = signInHref(locale, returnTo);
  const [started, setStarted] = useState(false);
  const view = loginView(session, search, started);
  const signedIn = session.status === 'ready' && session.signedIn;
  const goNow = view.card === 'gate' && view.opening && !started && session.status === 'ready';

  // Already signed in: nothing to do here.
  useEffect(() => {
    if (signedIn) window.location.replace(returnTo);
  }, [signedIn, returnTo]);

  // The landing's button: on to the IdP once the session says sign-in is open.
  useEffect(() => {
    if (goNow) window.location.assign(href);
  }, [goNow, href]);

  return (
    <ScreenPage
      code="S02"
      veil="gate"
      layout="board"
      responsive
      className="login"
      actions={
        <Button variant="glass" href="/" className="start-ghost" dataId="login-home">
          {t('layout.backHome')}
        </Button>
      }
    >
      <div className="login-stage">
        {view.card === 'opening' && <UniverseOpeningCard stage="universe" />}
        {view.card === 'failed' && <SignInFailedCard reason={view.reason} retryHref={href} homeHref="/" />}
        {view.card === 'gate' && <AuthGateCard state={view.opening ? 'opening' : 'idle'} href={href} onStart={() => setStarted(true)} />}
      </div>
      <LegalLinks className="login-legal" />
    </ScreenPage>
  );
}

/**
 * B of S02 as a whole screen: shown on /u between the IdP sending the visitor back and the Universe drawing (the
 * session, then the screen's data), and on any other page while the session is checked. The Universe screen renders it
 * with `stage="universe"` while its data loads, then `ready` until the opening's last beat.
 */
export function UniverseOpening({ stage, code = 'C09' }: { stage: OpeningStage; code?: string }): ReactNode {
  // each finished step shows its tick for a beat (opening-pace.ts)
  const shown = usePacedStage(stage);
  return (
    <ScreenPage code={code} veil="gate" layout="board" responsive>
      <div className="login-stage">
        <UniverseOpeningCard stage={shown} />
      </div>
    </ScreenPage>
  );
}
