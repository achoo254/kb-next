import { writePreference } from '@achoo254/app-shell/preferences';
import type { ReactNode } from 'react';
import type { SessionState } from '../api/session-api';
import { brand } from '../brand';
import { type Locale, type Translate, useI18n } from '../i18n/i18n';
import { BRAND_WORDS } from '../layout/brand-words';
import { ScreenPage } from '../layout/screen-page';
import { type SceneSpace, UniverseScene } from '../layout/universe-scene';
import type { SpaceKind } from '../ui/art';
import { Button } from '../ui/button';
import { GradientTitle } from '../ui/gradient-title';
import { type StageCard, StageCards } from '../ui/stage-cards';
import { gateHref } from './login-page';
import './landing-page.css';

/** Where a visitor lands after signing in from the landing page. */
const AFTER_SIGN_IN = '/u';

/**
 * The Học Cloud Spaces the landing shows as its Universe preview (board S01), with the size of each collection at
 * launch. A showcase for signed-out visitors, not live data: each crystal opens the Space itself after sign-in.
 */
const SHOWCASE: ReadonlyArray<{ kind: SpaceKind; slug: string | null }> = [
  { kind: 'networking', slug: 'networking' },
  { kind: 'kubernetes', slug: 'kubernetes' },
  { kind: 'linux', slug: 'linux' },
  { kind: 'observability', slug: 'observability' },
  { kind: 'docker', slug: 'docker' },
  { kind: 'weekly', slug: 'weekly' },
  // The visitor's own Space has no shared address: it opens with the Universe.
  { kind: 'personal', slug: null },
];

function showcase(t: Translate): SceneSpace[] {
  return SHOWCASE.map(({ kind, slug }) => ({
    kind,
    name: t(`landing.space.${kind}`),
    count: t(`landing.space.${kind}Count`),
    href: slug ? `/s/${slug}` : AFTER_SIGN_IN,
  }));
}

function tiles(t: Translate): StageCard[] {
  return [
    { id: 'orbit', href: '/u', title: t('landing.tile.orbit'), sub: t('landing.tile.orbitSub'), icon: 'orbit' },
    { id: 'ai', href: '/copilot', title: t('landing.tile.ai'), sub: t('landing.tile.aiSub'), icon: 'sparkle', highlight: true },
    { id: 'office', href: '/me', title: t('landing.tile.office'), sub: t('landing.tile.officeSub'), icon: 'docs' },
  ];
}

const OTHER_LOCALE: Record<Locale, Locale> = { vi: 'en', en: 'vi' };

/**
 * / (board S01): the landing for visitors. The hero and one way in ("Đăng nhập bằng tài khoản hoandat", straight on
 * to the IdP), the Universe preview and three feature cards on the stage. A signed-in visitor gets "Vào Universe".
 */
export function LandingPage({ session }: { session: SessionState }): ReactNode {
  const { t, locale, setLocale } = useI18n();
  const signedIn = session.status === 'ready' && session.signedIn;
  const spaces = showcase(t);
  const switchLanguage = (): void => {
    const next = OTHER_LOCALE[locale];
    writePreference('lang', next, { domain: brand.primaryTenant.domain });
    setLocale(next);
  };
  return (
    <ScreenPage
      code="S01"
      layout="board"
      className="landing"
      actions={
        <>
          <button type="button" className="landing-lang" aria-label={t('landing.lang')} onClick={switchLanguage} data-id="landing-lang">
            {locale.toUpperCase()}
          </button>
          {signedIn ? (
            <Button variant="glass" href={AFTER_SIGN_IN} className="start-ghost" dataId="landing-enter-top">
              {t('landing.enter')}
            </Button>
          ) : (
            <Button variant="glass" href={gateHref(AFTER_SIGN_IN)} className="start-ghost" dataId="landing-sign-in">
              {t('landing.signIn')}
            </Button>
          )}
        </>
      }
    >
      <section className="landing-scene" aria-label={t('landing.preview')}>
        <UniverseScene
          spaces={spaces}
          orb={{
            title: t('landing.orbTitle'),
            chips: ['Universe', t('landing.orbSpaces', { count: spaces.length }), 'VI · EN'],
            label: t('landing.orbLabel'),
            href: AFTER_SIGN_IN,
          }}
        />
      </section>
      <div className="landing-hero">
        <span className="landing-kicker">{t('landing.kicker', { host: BRAND_WORDS.host })}</span>
        <GradientTitle size={44} className="landing-title">
          {t('landing.hero')}
        </GradientTitle>
        <p className="landing-sub">{t('landing.sub')}</p>
        {signedIn ? (
          <Button variant="rim" href={AFTER_SIGN_IN} icon="sign-in" className="start-btn landing-cta" dataId="landing-cta">
            {t('landing.enter')}
          </Button>
        ) : (
          <Button variant="rim" href={gateHref(AFTER_SIGN_IN)} icon="sign-in" className="start-btn landing-cta" dataId="landing-cta">
            {t('landing.cta', { account: BRAND_WORDS.account })}
          </Button>
        )}
        <span className="landing-note">{signedIn ? t('landing.noteSignedIn', { account: BRAND_WORDS.account }) : t('landing.note')}</span>
      </div>
      <StageCards cards={tiles(t)} className="landing-stage" />
      <footer className="landing-footer">{t('landing.footer', { account: BRAND_WORDS.account })}</footer>
    </ScreenPage>
  );
}
