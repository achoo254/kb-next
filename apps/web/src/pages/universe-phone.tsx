import { type CSSProperties, type ReactNode, useEffect, useMemo, useState } from 'react';
import { type DocumentSummary, type SpaceDetail, type SpaceListItem, fetchSpace } from '../api/content-api';
import { type Locale, useI18n } from '../i18n/i18n';
import { PhoneShell } from '../layout/phone-shell';
import { signedInUser, useSessionState } from '../layout/session-context';
import { SHELL_PATHS, journeyPath } from '../layout/shell-paths';
import { accountInitial } from '../layout/app-shell';
import { ORB_ART, type SpaceKind } from '../ui/art';
import { Icon } from '../ui/icon';
import { type OrbitDot, OrbitField, type OrbitPath, type OrbitTint } from '../ui/orbit-field';
import { RimPanel, SheetHandle } from '../ui/rim-panel';
import { copilotHref } from './copilot-links';
import { type PhoneMessageKey, usePhoneText } from './phone-messages';
import type { ScreenTranslate } from './space-messages';
import { documentHref } from './universe-dock';
import type { UniverseData } from './universe-data';
import { spaceHref, spaceKindOf, spaceName } from './universe-spaces';
import './universe-phone.css';

/**
 * The phone Universe (board Mobile): a 2D orbit of the Spaces round the orb, no 3D (Z02), and the sheet of the Space in
 * focus rising from the bottom: its texts by origin, its line, its first texts, its path and "Hỏi AI".
 */

/** Centre and diameter of each planet on the 390×520 orbit of the board; other kinds take the free places. */
const PHONE_SLOTS: ReadonlyArray<{ kind: SpaceKind; x: number; y: number; d: number }> = [
  { kind: 'observability', x: 195, y: 130, d: 62 },
  { kind: 'kubernetes', x: 318, y: 177, d: 64 },
  { kind: 'docker', x: 325, y: 295, d: 64 },
  { kind: 'personal', x: 195, y: 350, d: 62 },
  { kind: 'linux', x: 65, y: 295, d: 62 },
  { kind: 'networking', x: 72, y: 177, d: 76 },
];

const MAIN_ORBIT = 'M45 240 A150 110 0 1 1 345 240 A150 110 0 1 1 45 240';
const INNER_ORBIT = 'M87 252 A108 42 0 1 1 303 252 A108 42 0 1 1 87 252';
const ORBITS: readonly OrbitPath[] = [{ d: MAIN_ORBIT }, { d: INNER_ORBIT, width: 1.2 }];
const GUIDES: readonly string[] = ['M13 236 A182 78 0 1 1 377 236 A182 78 0 1 1 13 236'];
const DOTS: readonly OrbitDot[] = [
  { orbit: 0, size: 10, tone: 'sky', duration: 22, delay: 0 },
  { orbit: 0, size: 8, tone: 'violet', duration: 22, delay: -5.5 },
  { orbit: 0, size: 9, tone: 'lavender', duration: 22, delay: -11 },
  { orbit: 0, size: 6, tone: 'cyan', duration: 22, delay: -16.5 },
  { orbit: 1, size: 8, tone: 'lavender', duration: 14, delay: -1.5, reverse: true },
  { orbit: 1, size: 6, tone: 'cyan', duration: 14, delay: -6, reverse: true },
  { orbit: 1, size: 9, tone: 'sky', duration: 14, delay: -10.5, reverse: true },
];

export interface PhonePlanet {
  space: SpaceListItem;
  kind: SpaceKind | undefined;
  x: number;
  y: number;
  d: number;
}

/**
 * Places the Spaces on the phone orbit: each of the board's six kinds on its own place, then the others in the places
 * left free. The phone shows at most six Spaces (a compact Universe); the rest stay a search away.
 */
export function placePhonePlanets(spaces: readonly SpaceListItem[]): PhonePlanet[] {
  const placed: PhonePlanet[] = [];
  const free = [...PHONE_SLOTS];
  const rest: SpaceListItem[] = [];
  for (const space of spaces) {
    const kind = spaceKindOf(space);
    const index = free.findIndex((slot) => slot.kind === kind);
    const slot = index >= 0 ? free.splice(index, 1)[0] : undefined;
    if (slot) placed.push({ space, kind, x: slot.x, y: slot.y, d: slot.d });
    else rest.push(space);
  }
  for (const space of rest) {
    const slot = free.shift();
    if (!slot) break;
    placed.push({ space, kind: spaceKindOf(space), x: slot.x, y: slot.y, d: slot.d });
  }
  // the keyboard and the screen reader go round clockwise from the top, like the scene's order
  const order = (planet: PhonePlanet): number => PHONE_SLOTS.findIndex((slot) => slot.x === planet.x && slot.y === planet.y);
  return placed.sort((a, b) => order(a) - order(b));
}

/** The kinds whose crystal the board shortens on the phone ("Network", "K8s", "Obs", "Của bạn"). */
const SHORT_NAMES: Partial<Record<SpaceKind, PhoneMessageKey>> = {
  networking: 'planet.networking',
  kubernetes: 'planet.kubernetes',
  observability: 'planet.observability',
  personal: 'planet.personal',
};

function planetName(planet: PhonePlanet, locale: Locale, t: ScreenTranslate<PhoneMessageKey>): string {
  const short = planet.kind ? SHORT_NAMES[planet.kind] : undefined;
  return short ? t(short) : spaceName(planet.space, locale);
}

/** The texts of a Space and how many of each origin (the sheet's chips). */
export interface SpaceTally {
  official: number;
  community: number;
  own: number;
  pending: number;
  documents: DocumentSummary[];
}

export function tallySpace(detail: Pick<SpaceDetail, 'collections' | 'uncollected'>): SpaceTally {
  const documents = [...detail.collections.flatMap((collection) => collection.documents), ...detail.uncollected];
  const tally: SpaceTally = { official: 0, community: 0, own: 0, pending: 0, documents };
  for (const doc of documents) {
    if (doc.status === 'pending') tally.pending += 1;
    else if (doc.origin === 'own') tally.own += 1;
    else tally[doc.origin] += 1;
  }
  return tally;
}

type SheetLoad = { key: string; status: 'ready'; detail: SpaceDetail; tally: SpaceTally } | { key: string; status: 'failed' };

/** The Space in the sheet, fetched when it comes into focus; null while it loads. */
function useSpaceSheet(slug: string | null, locale: Locale): SheetLoad | null {
  const [load, setLoad] = useState<SheetLoad | null>(null);
  const key = `${slug ?? ''}|${locale}`;
  useEffect(() => {
    if (!slug) return undefined;
    let live = true;
    fetchSpace(slug, locale)
      .then((detail) => live && setLoad({ key, status: 'ready', detail, tally: tallySpace(detail) }))
      .catch(() => live && setLoad({ key, status: 'failed' }));
    return () => {
      live = false;
    };
  }, [slug, locale, key]);
  return load?.key === key ? load : null;
}

function Planet({ planet, name, focused, onPick, label }: { planet: PhonePlanet; name: string; focused: boolean; onPick(): void; label: string }): ReactNode {
  const { space, x, y, d } = planet;
  const style = { left: x - d / 2, top: y - d / 2, width: d, height: d, '--tint': space.tint, '--glow': space.glow } as CSSProperties;
  return (
    <button type="button" className="phone-planet" data-space={planet.kind} data-focused={focused || undefined} style={style} aria-label={label} aria-pressed={focused} onClick={onPick}>
      <img className="phone-planet-art" src={space.art} alt="" style={{ width: d + 24, height: d + 24 }} />
      <span className="phone-planet-shade" aria-hidden="true" />
      <span className="phone-planet-name">{name}</span>
      <span className="phone-planet-count">{space.documentCount}</span>
    </button>
  );
}

function SpaceSheet({ planet, open, onToggle }: { planet: PhonePlanet | undefined; open: boolean; onToggle(): void }): ReactNode {
  const { t, locale } = usePhoneText();
  const load = useSpaceSheet(planet?.space.slug ?? null, locale);
  const space = planet?.space;
  const detail = load?.status === 'ready' ? load.detail : null;
  const tally = load?.status === 'ready' ? load.tally : null;
  const line = detail ? ((locale === 'vi' ? detail.space.descriptionVi : detail.space.descriptionEn) ?? space?.caption[locale]) : space?.caption[locale];
  const journey = tally?.documents.find((doc) => doc.type === 'journey');
  const texts = tally?.documents.filter((doc) => doc.type !== 'journey').slice(0, 6) ?? [];
  const chips: Array<{ key: keyof Omit<SpaceTally, 'documents'>; label: PhoneMessageKey }> = [
    { key: 'official', label: 'sheet.official' },
    { key: 'community', label: 'sheet.community' },
    { key: 'own', label: 'sheet.own' },
    { key: 'pending', label: 'sheet.pending' },
  ];
  const tint = { '--tint': space?.glow } as CSSProperties;
  return (
    <RimPanel variant="sheet" className={open ? 'phone-sheet phone-sheet-open' : 'phone-sheet'} dataId="space-sheet" label={space ? spaceName(space, locale) : undefined} style={tint}>
      <div className="phone-sheet-body">
        <SheetHandle label={open ? t('sheet.collapse') : t('sheet.expand')} onPress={onToggle} />
        {space ? (
          <>
            <div className="phone-sheet-head">
              <h2 className="phone-sheet-name">{spaceName(space, locale)}</h2>
              <a className="phone-sheet-open" href={spaceHref(space.slug)} data-id="sheet-open-space">
                {t('sheet.open')}
              </a>
            </div>
            {tally && (
              <div className="phone-sheet-chips">
                {chips
                  .filter((chip) => tally[chip.key] > 0)
                  .map((chip) => (
                    <span key={chip.key} className="phone-sheet-chip" data-origin={chip.key}>
                      {t(chip.label, { count: tally[chip.key] })}
                    </span>
                  ))}
              </div>
            )}
            {line && <p className="phone-sheet-line">{line}</p>}
            {!load && <p className="phone-sheet-note">{t('sheet.loading')}</p>}
            {load?.status === 'ready' && texts.length === 0 && <p className="phone-sheet-note">{t('sheet.empty')}</p>}
            {texts.length > 0 && (
              <ul className="phone-sheet-texts">
                {texts.map((doc) => (
                  <li key={doc.id}>
                    <a href={documentHref(doc.id)} className="phone-sheet-text">
                      <span className="phone-sheet-dot" aria-hidden="true" />
                      <span className="phone-sheet-title">{doc.title}</span>
                    </a>
                  </li>
                ))}
              </ul>
            )}
            <div className="phone-sheet-actions">
              {journey && (
                <a className="phone-button" data-tone="rim" href={journeyPath(journey.id)} data-id="sheet-journey">
                  {t('sheet.journey')}
                </a>
              )}
              <a className="phone-button" data-tone="ghost" href={copilotHref(undefined, { scope: { kind: 'space', id: space.slug } })} data-id="sheet-ask">
                {t('sheet.ask')}
              </a>
            </div>
          </>
        ) : null}
      </div>
    </RimPanel>
  );
}

interface UniversePhoneProps {
  data: UniverseData;
  online: boolean;
  onRetry(): void;
}

/** /u on a phone (board Mobile), in every state of the Universe's data. */
export function UniversePhone({ data, online, onRetry }: UniversePhoneProps): ReactNode {
  const { t, locale } = usePhoneText();
  const app = useI18n();
  const user = signedInUser(useSessionState());
  const spaces = data.status === 'ready' ? data.spaces : null;
  const planets = useMemo(() => (spaces ? placePhonePlanets(spaces) : []), [spaces]);
  const [focusSlug, setFocusSlug] = useState<string | null>(null);
  const [open, setOpen] = useState(false);
  const focus = planets.find((planet) => planet.space.slug === focusSlug) ?? planets.find((planet) => planet.kind === 'networking') ?? planets[0];
  const tints: OrbitTint[] = planets.map((planet) => ({ cx: planet.x, cy: planet.y, space: planet.kind ?? 'networking', color: planet.space.glow }));
  const orbTitle = app.t('landing.orbTitle');
  return (
    <PhoneShell screen="Mobile" tab="universe">
      <div className="phone-universe" data-id="phone-universe" data-state={data.status}>
        <div className="phone-universe-top">
          <a className="phone-search-pill" href={SHELL_PATHS.search} aria-label={t('universe.searchLabel')} data-id="phone-search">
            <Icon name="search" size={18} />
            <span className="phone-search-text">{t('universe.search')}</span>
            <span className="phone-search-ai" aria-hidden="true">
              <Icon name="tab-copilot" size={16} />
            </span>
          </a>
          <a className="phone-avatar" href={SHELL_PATHS.settings} aria-label={t('universe.account')} data-id="phone-account">
            {user ? accountInitial(user) : '·'}
          </a>
        </div>
        <span className="phone-universe-note">
          <Icon name="device-phone" size={12} />
          {t('universe.note')}
        </span>
        <div className="phone-orbit">
          <OrbitField width={390} height={520} orbits={ORBITS} gradientX={[10, 380]} tints={tints} tintRadius={70} dots={DOTS} guides={GUIDES} className="phone-orbit-field" />
          <button type="button" className="phone-orb" aria-label={t('universe.orb', { name: orbTitle })} onClick={() => setOpen(false)}>
            <img className="phone-orb-art" src={ORB_ART} alt="" />
            <span className="phone-orb-title">{orbTitle}</span>
          </button>
          {planets.map((planet) => {
            const name = planetName(planet, locale, t);
            return (
              <Planet
                key={planet.space.slug}
                planet={planet}
                name={name}
                focused={planet === focus}
                label={t('universe.planet', { name: spaceName(planet.space, locale), count: planet.space.documentCount })}
                onPick={() => {
                  setFocusSlug(planet.space.slug);
                  setOpen(false);
                }}
              />
            );
          })}
        </div>
        {data.status === 'ready' ? (
          <SpaceSheet planet={focus} open={open} onToggle={() => setOpen((value) => !value)} />
        ) : (
          <RimPanel variant="sheet" className="phone-sheet" dataId="space-sheet">
            <div className="phone-sheet-body">
              <SheetHandle />
              {data.status === 'loading' && <p className="phone-sheet-note">{t('universe.loading')}</p>}
              {data.status === 'offline' && <p className="phone-sheet-note">{t('universe.offline')}</p>}
              {data.status === 'failed' && (
                <>
                  <p className="phone-sheet-note">{t('universe.failed')}</p>
                  <button type="button" className="phone-button" data-tone="rim" onClick={onRetry}>
                    {t('universe.retry')}
                  </button>
                </>
              )}
            </div>
          </RimPanel>
        )}
        {!online && data.status === 'ready' && (
          <p className="phone-offline" role="status">
            {t('universe.offline')}
          </p>
        )}
      </div>
    </PhoneShell>
  );
}
