import { type ReactNode, useEffect } from 'react';
import { type SessionState, loginReturnPath, signInHref } from '../api/session-api';
import { brand } from '../brand';
import { useI18n } from '../i18n/i18n';
import type { MessageKey } from '../i18n/messages';

const LOGIN_RESULTS: Record<string, MessageKey> = { fail: 'login.fail', unavailable: 'login.unavailable', busy: 'login.busy' };

/**
 * /login: one way in, "Sign in with hoandat.com", through the server's route to the IdP and back to the page the
 * visitor came from (`?return=`). The app never sees a password; the IdP creates the account when there is none.
 */
export function LoginPage({ session }: { session: SessionState }): ReactNode {
  const { t, locale } = useI18n();
  const domain = brand.primaryTenant.domain;
  const returnTo = loginReturnPath(window.location.search);
  const signedIn = session.status === 'ready' && session.signedIn;
  const result = LOGIN_RESULTS[new URLSearchParams(window.location.search).get('login') ?? ''];
  const unavailable = session.status === 'ready' && !session.signInAvailable;

  // Already signed in: nothing to do here.
  useEffect(() => {
    if (signedIn) window.location.replace(returnTo);
  }, [signedIn, returnTo]);

  return (
    <section className="glass-card" data-id="sign-in-card">
      <h1 className="screen-title">{t('signIn.title')}</h1>
      <p className="screen-lead">{t('signIn.lead', { domain })}</p>
      {(result || unavailable) && (
        <p className="notice" role="status" data-id="sign-in-notice">
          {t(unavailable ? 'login.unavailable' : (result ?? 'login.fail'))}
        </p>
      )}
      <a className="btn-primary" href={signInHref(locale, returnTo)} data-id="sign-in-cta">
        {t('signIn.cta', { domain })}
      </a>
      <p className="screen-note">{t('signIn.note', { domain })}</p>
    </section>
  );
}
