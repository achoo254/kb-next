import { writePreference } from '@achoo254/app-shell/preferences';
import { type CSSProperties, type KeyboardEvent, type ReactNode, useEffect, useRef, useState } from 'react';
import { type SpaceListItem, completeOnboarding } from '../api/content-api';
import { brand } from '../brand';
import { LOCALES, type Locale, useI18n } from '../i18n/i18n';
import type { MessageKey } from '../i18n/messages';
import { Button } from '../ui/button';
import { GradientTitle } from '../ui/gradient-title';
import { RimPanel } from '../ui/rim-panel';
import './onboarding.css';
import { BOARD_WIDTH, toBoardPx } from '../layout/board-zoom';

/** A Space offered as an interest (step 2). */
export interface OnboardingSpace {
  slug: string;
  name: string;
  /** The crystal art (/art/crystal-*.webp) and its glow colour. */
  art: string;
  glow: string;
}

/** The public Spaces of the Universe as interests, named in the reader's language (the reader's own Space is left out). */
export function interestSpaces(spaces: readonly SpaceListItem[], locale: Locale): OnboardingSpace[] {
  return spaces
    .filter((space) => space.kind === 'public')
    .map((space) => ({ slug: space.slug, name: locale === 'vi' ? space.nameVi : space.nameEn, art: space.art, glow: space.glow }));
}

/** The four tips of step 3: the element they light up (data-id of the shell) and how much the light overhangs it. */
const TIPS: ReadonlyArray<{ target: string; pad: number; radius: number; title: MessageKey; text: MessageKey; fallback: Rect }> = [
  { target: 'rail-create', pad: 4, radius: 16, title: 'onboarding.tip.create', text: 'onboarding.tip.createText', fallback: { x: 9, y: 322, w: 54, h: 54 } },
  { target: 'view-nav-graph', pad: 2, radius: 24, title: 'onboarding.tip.views', text: 'onboarding.tip.viewsText', fallback: { x: 596, y: 18, w: 112, h: 48 } },
  { target: 'rail-copilot', pad: 4, radius: 27, title: 'onboarding.tip.copilot', text: 'onboarding.tip.copilotText', fallback: { x: 9, y: 438, w: 54, h: 54 } },
  { target: 'top-command', pad: 2, radius: 18, title: 'onboarding.tip.search', text: 'onboarding.tip.searchText', fallback: { x: 1326, y: 14, w: 90, h: 52 } },
];

interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

const TIP_WIDTH = 330;

/** The lit box around a tip's element (measured now), else where the board puts it. */
export function spotlightRect(index: number): Rect {
  const tip = TIPS[index] ?? TIPS[0];
  if (!tip) return { x: 0, y: 0, w: 0, h: 0 };
  const element = document.querySelector(`[data-id="${tip.target}"]`);
  const box = element?.getBoundingClientRect();
  if (!box || box.width === 0) return tip.fallback;
  // measured on screen (zoomed px); the spotlight is placed in the board's px
  return {
    x: toBoardPx(box.left) - tip.pad,
    y: toBoardPx(box.top) - tip.pad,
    w: toBoardPx(box.width) + tip.pad * 2,
    h: toBoardPx(box.height) + tip.pad * 2,
  };
}

/** Where the tip card goes: right of the rail, under the top bar, or right-aligned under the top-right buttons. */
function tipPosition(spot: Rect, viewportWidth: number): { left: number; top: number } {
  if (spot.x < 200) return { left: 96, top: spot.y - 22 };
  const right = spot.x + spot.w;
  if (right > viewportWidth - 200) return { left: right - (TIP_WIDTH + 26), top: spot.y + spot.h + 24 };
  return { left: spot.x - 36, top: spot.y + spot.h + 24 };
}

type Step = 0 | 1 | 2;

interface OnboardingProps {
  /** The Spaces of step 2; with none, step 2 is left out. */
  spaces: readonly OnboardingSpace[];
  /** The dialog is over: `saved` is false when the choices could not be stored (it will ask again next time). */
  onDone(result: { saved: boolean }): void;
}

/**
 * The first visit to the Universe (board S03), over the dimmed C09: 1 · the reading language (it switches at once and
 * is stored as the shared `hd_lang` preference), 2 · the Spaces of interest, 3 · a tour of the lens rail and the
 * nav. Bỏ qua / Quay lại / Tiếp; the end (or Bỏ qua) saves the choices and marks the account onboarded.
 */
export function Onboarding({ spaces, onDone }: OnboardingProps): ReactNode {
  const { t, locale, setLocale } = useI18n();
  const [step, setStep] = useState<Step>(0);
  const [tour, setTour] = useState(0);
  const [spot, setSpot] = useState<Rect | null>(null);
  const [picked, setPicked] = useState<ReadonlySet<string>>(() => new Set());
  const [saving, setSaving] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  /** Set once the visitor moves between steps: from then on each step brings the focus to its first control. */
  const movedRef = useRef(false);

  // On opening, the dialog itself takes the focus (Tab then walks its controls); after a move, the new step's first
  // control does, so the keyboard follows the dialog.
  useEffect(() => {
    const root = rootRef.current;
    if (!root) return;
    if (movedRef.current) root.querySelector<HTMLElement>('[data-autofocus]')?.focus();
    else root.focus();
  }, [step, tour]);

  // The tip follows its element when the window changes size.
  useEffect(() => {
    if (step !== 2) return;
    const onResize = (): void => setSpot(spotlightRect(tour));
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, [step, tour]);

  function chooseLanguage(next: Locale): void {
    if (next === locale) return;
    writePreference('lang', next, { domain: brand.primaryTenant.domain });
    setLocale(next);
  }

  function toggleSpace(slug: string): void {
    setPicked((current) => {
      const next = new Set(current);
      if (next.has(slug)) next.delete(slug);
      else next.add(slug);
      return next;
    });
  }

  function showTip(index: number): void {
    movedRef.current = true;
    setStep(2);
    setTour(index);
    setSpot(spotlightRect(index));
  }

  async function finish(): Promise<void> {
    if (saving) return;
    setSaving(true);
    let saved = true;
    try {
      await completeOnboarding({ lang: locale, interests: spaces.filter((space) => picked.has(space.slug)).map((space) => space.slug) });
    } catch {
      saved = false;
    }
    setSaving(false);
    onDone({ saved });
  }

  const hasSpaces = spaces.length > 0;

  function next(): void {
    movedRef.current = true;
    if (step === 0 && hasSpaces) setStep(1);
    else if (step < 2) showTip(0);
    else if (tour < TIPS.length - 1) showTip(tour + 1);
    else void finish();
  }

  function back(): void {
    movedRef.current = true;
    if (step === 2 && tour > 0) showTip(tour - 1);
    else if (step === 2) setStep(hasSpaces ? 1 : 0);
    else if (step === 1) setStep(0);
  }

  function onKeyDown(event: KeyboardEvent<HTMLDivElement>): void {
    if (event.key === 'Escape') {
      event.preventDefault();
      void finish();
      return;
    }
    if (event.key !== 'Tab') return;
    // Keep the focus inside the dialog.
    const focusable = Array.from(rootRef.current?.querySelectorAll<HTMLElement>('button:not(:disabled), [href]') ?? []);
    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    if (!first || !last) return;
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  }

  const lastTip = step === 2 && tour === TIPS.length - 1;
  const tip = TIPS[tour] ?? TIPS[0];
  const lit = step === 2 ? (spot ?? tip?.fallback ?? null) : null;
  const tipAt = lit ? tipPosition(lit, typeof window === 'undefined' ? BOARD_WIDTH : toBoardPx(document.documentElement.clientWidth)) : null;
  const spotStyle: CSSProperties | undefined = lit && tip ? { left: lit.x, top: lit.y, width: lit.w, height: lit.h, borderRadius: tip.radius } : undefined;

  return (
    // The dialog's own keys: Escape skips, Tab stays inside.
    // eslint-disable-next-line jsx-a11y/no-noninteractive-element-interactions
    <div ref={rootRef} className="onboarding" role="dialog" aria-modal="true" aria-label={t('onboarding.label')} tabIndex={-1} onKeyDown={onKeyDown} data-id="onboarding" data-step={step}>
      {step < 2 && <div className="onboarding-dim" aria-hidden="true" />}

      {step === 0 && (
        <RimPanel className="onboarding-card onboarding-lang" label={t('onboarding.langTitle')} dataId="onboarding-lang">
          <span className="onboarding-kicker">{t('onboarding.step1')}</span>
          <GradientTitle as="h2" size={32} className="onboarding-title">
            {t('onboarding.langTitle')}
          </GradientTitle>
          <div className="onboarding-langs">
            {LOCALES.map((option) => (
              <button
                key={option}
                type="button"
                className="onboarding-choice onboarding-lang-choice"
                aria-pressed={option === locale}
                onClick={() => chooseLanguage(option)}
                data-autofocus={option === locale ? true : undefined}
                data-id={`onboarding-lang-${option}`}
              >
                <span className="onboarding-lang-code">{option.toUpperCase()}</span>
                <span className="onboarding-lang-name" lang={option}>
                  {option === 'vi' ? 'Tiếng Việt' : 'English'}
                </span>
              </button>
            ))}
          </div>
        </RimPanel>
      )}

      {step === 1 && (
        <RimPanel className="onboarding-card onboarding-topics" label={t('onboarding.topicsTitle')} dataId="onboarding-topics">
          <span className="onboarding-kicker">{t('onboarding.step2')}</span>
          <GradientTitle as="h2" size={30} className="onboarding-title">
            {t('onboarding.topicsTitle')}
          </GradientTitle>
          <div className="onboarding-spaces">
            {spaces.map((space, index) => {
              const on = picked.has(space.slug);
              return (
                <button
                  key={space.slug}
                  type="button"
                  className="onboarding-choice onboarding-space"
                  data-space={space.slug}
                  style={{ '--space-glow': space.glow } as CSSProperties}
                  aria-pressed={on}
                  onClick={() => toggleSpace(space.slug)}
                  data-autofocus={index === 0 ? true : undefined}
                  data-id={`onboarding-space-${space.slug}`}
                >
                  <img src={space.art} alt="" />
                  <span className="onboarding-space-name">{space.name}</span>
                  {on && (
                    <span className="onboarding-check" aria-hidden="true">
                      ✓
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        </RimPanel>
      )}

      {step === 2 && lit && tipAt && tip && (
        <>
          <div className="onboarding-spot" style={spotStyle} aria-hidden="true" />
          <div className="onboarding-tip-at" style={{ left: tipAt.left, top: tipAt.top }}>
            <RimPanel className="onboarding-tip" radius="card" label={t(tip.title)} dataId="onboarding-tip">
            <span className="onboarding-tip-kicker">{t('onboarding.step3', { n: tour + 1 })}</span>
            <h2 className="onboarding-tip-title" tabIndex={-1} data-autofocus>
              {t(tip.title)}
            </h2>
            <p className="onboarding-tip-text">{t(tip.text)}</p>
            </RimPanel>
          </div>
        </>
      )}

      <div className="onboarding-controls">
        <Button variant="glass" className="start-ghost" onClick={() => void finish()} disabled={saving} dataId="onboarding-skip">
          {t('onboarding.skip')}
        </Button>
        <Button variant="glass" className="start-ghost" onClick={back} disabled={step === 0 || saving} dataId="onboarding-back">
          {t('onboarding.back')}
        </Button>
        <span className="onboarding-dots" role="img" aria-label={t('onboarding.progress', { n: step + 1 })}>
          {[0, 1, 2].map((index) => (
            <span key={index} data-on={index === step || undefined} />
          ))}
        </span>
        <Button variant="rim" className="start-btn" onClick={next} disabled={saving} dataId="onboarding-next">
          {lastTip ? t('onboarding.finish') : t('onboarding.next')}
        </Button>
      </div>
    </div>
  );
}
