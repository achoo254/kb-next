import { writePreference } from '@achoo254/app-shell/preferences';
import { type ReactNode, useEffect, useState } from 'react';
import { type SpaceListItem, fetchSpaces } from '../api/content-api';
import type { SessionState } from '../api/session-api';
import { brand } from '../brand';
import { type Locale, type Translate, useI18n } from '../i18n/i18n';
import { BRAND_WORDS } from '../layout/brand-words';
import { ScreenPage } from '../layout/screen-page';
import { SCENE_SLOTS, type SceneSpace, UniverseScene } from '../layout/universe-scene';
import { Button } from '../ui/button';
import { GradientTitle } from '../ui/gradient-title';
import { type StageCard, StageCards } from '../ui/stage-cards';
import { gateHref } from './login-page';
import { sceneSpaces } from './universe-spaces';
import './landing-page.css';

/**
 * The crystal slots of the landing: the board's, but Cloud (no slot on the board) goes right of "Vũ trụ của bạn",
 * at the end of the wide orbit. Its Universe slot, under the hero text of C09, sits on the landing's taller hero (the
 * description and the sign-in button); the landing has no assistant panel on the right, so the place is free.
 */
const LANDING_SLOTS = { ...SCENE_SLOTS, cloud: { x: 1010, y: 410 } };

/** Where a visitor lands after signing in from the landing page. */
const AFTER_SIGN_IN = '/u';

/**
 * The Universe preview of the landing (board S01): the Spaces a guest may read (/api/spaces, public), with their
 * captions. The visitor's own Space has no shared address and holds nothing until they sign in, so a visitor without
 * one sees its crystal as a promise ("private") that opens the Universe.
 */
function previewSpaces(spaces: readonly SpaceListItem[], t: Translate, locale: Locale): SceneSpace[] {
  const scene = sceneSpaces(spaces, locale);
  if (scene.some((space) => space.kind === 'personal')) return scene;
  return [...scene, { key: 'personal', kind: 'personal', name: t('landing.space.personal'), count: t('landing.space.personalCaption'), href: AFTER_SIGN_IN }];
}

/** The public Spaces, or none while they load or when the API cannot be reached (the preview keeps its orb). */
function usePublicSpaces(): readonly SpaceListItem[] {
  const [spaces, setSpaces] = useState<readonly SpaceListItem[]>([]);
  useEffect(() => {
    let live = true;
    fetchSpaces()
      .then((list) => live && setSpaces(list))
      .catch(() => live && setSpaces([]));
    return () => {
      live = false;
    };
  }, []);
  return spaces;
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
  const loaded = usePublicSpaces();
  const spaces = previewSpaces(loaded, t, locale);
  const switchLanguage = (): void => {
    const next = OTHER_LOCALE[locale];
    writePreference('lang', next, { domain: brand.primaryTenant.domain });
    setLocale(next);
  };
  return (
    <ScreenPage
      code="S01"
      layout="board"
      responsive
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
          slots={LANDING_SLOTS}
          orb={{
            title: t('landing.orbTitle'),
            chips: [t('landing.orbSpaces', { count: spaces.length }), 'VI · EN'],
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
