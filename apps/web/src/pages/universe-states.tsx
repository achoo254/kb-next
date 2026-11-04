import type { ReactNode } from 'react';
import type { DocumentSummary } from '../api/content-api';
import { useI18n } from '../i18n/i18n';
import { SCENE_ORBITS, SCENE_SLOTS, type SceneSpace, UniverseScene } from '../layout/universe-scene';
import { ILLUSTRATIONS } from '../ui/art';
import { GradientTitle } from '../ui/gradient-title';
import { Icon } from '../ui/icon';
import { RimPanel } from '../ui/rim-panel';
import { Skeleton } from '../ui/skeleton';
import { type StageCard, StageCards } from '../ui/stage-cards';
import { UniverseAskSuggestions } from './universe-ai-panel';

/** The heights of the five dock cards (the centre one is taller), as on board S04. */
const SKELETON_CARDS = [148, 148, 172, 148, 148] as const;
const SKELETON_DROP = [26, 12, 0, 12, 26] as const;
/** Where the "Tạo" links of S05 lead: the reader's own content, where writing and uploading start (C08). */
const CREATE_HREF = '/me';

interface SkeletonProps {
  /** The load takes longer than SLOW_LOAD_MS, or failed: offer "Thử lại". */
  slow: boolean;
  failed: boolean;
  onRetry: () => void;
}

/**
 * Board S04: the Universe loading, in the shapes of C09: faint orbits, the orb and a hexagon per crystal slot, the hero
 * text, the stage's five cards and the AI panel. After 1.5 s (or a failed load) a chip offers to try again.
 */
export function UniverseSkeleton({ slow, failed, onRetry }: SkeletonProps): ReactNode {
  const { t } = useI18n();
  return (
    <div className="universe-skeleton" aria-busy="true" data-id="universe-skeleton">
      <svg className="universe-skel-orbits" aria-hidden="true" width="1440" height="900" viewBox="0 0 1440 900">
        {SCENE_ORBITS.map((orbit) => (
          <path key={orbit.d} d={orbit.d} />
        ))}
      </svg>
      <Skeleton tone="glow" circle width={230} height={230} className="universe-skel-orb" />
      {Object.entries(SCENE_SLOTS)
        .filter(([kind]) => kind !== 'cloud')
        .map(([kind, slot]) => (
          <span key={kind} className="universe-skel-ghost" style={{ left: slot.x + 15, top: slot.y + 15 }}>
            <Skeleton tone="glow" width={110} height={110} className="universe-skel-hex" />
          </span>
        ))}
      <p className="universe-skel-label" role="status">
        {failed ? t('universe.loadFailed') : t('universe.loading')}
      </p>
      <div className="universe-skel-hero" aria-hidden="true">
        <Skeleton tone="glow" width={120} height={28} radius={9} />
        <Skeleton tone="glow" width={270} height={40} radius={12} />
        <Skeleton tone="glow" width={200} height={40} radius={12} />
        <Skeleton tone="glow" width={260} height={14} radius={7} />
        <Skeleton tone="glow" width={230} height={14} radius={7} />
      </div>
      <StageCards cards={[]} className="universe-stage" />
      <div className="universe-skel-cards" aria-hidden="true">
        {SKELETON_CARDS.map((height, index) => (
          <div key={index} className="kf-stage-card universe-skel-card" style={{ height, marginTop: SKELETON_DROP[index] }}>
            <Skeleton tone="glow" width={24} height={24} radius={8} />
            <Skeleton tone="glow" width={90} height={12} radius={6} />
            <Skeleton tone="glow" width={70} height={10} radius={5} />
          </div>
        ))}
      </div>
      <RimPanel as="div" variant="rim" radius="panel" className="universe-ai universe-skel-panel">
        <div className="universe-skel-head">
          <Skeleton tone="glow" circle width={50} height={50} />
          <div className="universe-skel-head-text">
            <Skeleton tone="glow" width={180} height={14} radius={7} />
            <Skeleton tone="glow" width={130} height={10} radius={5} />
          </div>
        </div>
        <Skeleton tone="glow" width={220} height={40} radius={16} className="universe-skel-question" />
        <Skeleton tone="glow" height={230} radius={18} />
        <Skeleton tone="glow" height={46} radius={12} />
        <Skeleton tone="glow" height={46} radius={12} />
        <div className="universe-ai-fill" />
        <Skeleton tone="glow" height={52} radius={18} />
      </RimPanel>
      {(slow || failed) && (
        <div className="universe-skel-slow" data-id="universe-slow">
          <span>{failed ? t('universe.loadFailedHint') : t('universe.slow')}</span>
          <button type="button" className="universe-skel-retry" onClick={onRetry} data-id="universe-retry">
            {t('universe.retry')}
          </button>
        </div>
      )}
    </div>
  );
}

function createCards(t: ReturnType<typeof useI18n>['t']): StageCard[] {
  return [
    { id: 'note', href: CREATE_HREF, title: t('universe.empty.note'), sub: t('universe.empty.noteSub'), icon: 'pencil' },
    { id: 'upload', href: CREATE_HREF, title: t('universe.empty.upload'), sub: t('universe.empty.uploadSub'), icon: 'upload', highlight: true },
    { id: 'journey', href: CREATE_HREF, title: t('universe.empty.journey'), sub: t('universe.empty.journeySub'), icon: 'journey' },
  ];
}

interface EmptyProps {
  spaces: readonly SceneSpace[];
  recent: readonly DocumentSummary[];
  orb: { title: string; chips: readonly string[]; label: string; href: string };
  /** The reader's name for the greeting, if known. */
  name: string | null;
  /** The API could not be reached: the hero says so (the banner is drawn by the screen). */
  offline: boolean;
  /** Where "khám phá Universe chung" leads: the full Universe. */
  sharedHref: string;
}

/**
 * Board S05: the reader's universe is still empty. The shared Spaces wait dimmed on their orbits, the reader's own slot
 * is a dashed "Hành tinh đầu tiên", the stage offers three ways to start and the panel suggests questions for the AI.
 */
export function UniverseEmpty({ spaces, recent, orb, name, offline, sharedHref }: EmptyProps): ReactNode {
  const { t } = useI18n();
  const slot = SCENE_SLOTS.personal;
  return (
    <div className="universe-empty" data-id="universe-empty" data-offline={offline || undefined}>
      <UniverseScene spaces={spaces.filter((space) => space.kind !== 'personal')} orb={orb} className="universe-scene universe-empty-scene" />
      <a href={CREATE_HREF} className="universe-first" style={{ left: slot.x, top: slot.y }} aria-label={t('universe.empty.firstLabel')} data-id="universe-first">
        <Icon name="plus" size={30} strokeWidth={2.2} />
        <span>{t('universe.empty.first')}</span>
      </a>
      <div className="universe-hero">
        <span className="universe-kicker">{name ? t('universe.empty.hello', { name }) : t('universe.empty.helloAnon')}</span>
        <GradientTitle size={40} className="universe-title">
          {offline ? t('universe.offline.title') : t('universe.empty.title')}
        </GradientTitle>
        <p className="universe-sub">
          {offline ? (
            t('universe.offline.sub')
          ) : (
            <>
              {t('universe.empty.sub')} <a href={sharedHref}>{t('universe.empty.shared')}</a>.
            </>
          )}
        </p>
      </div>
      <StageCards cards={createCards(t)} className="universe-stage universe-empty-stage" />
      <UniverseAskSuggestions recent={recent} />
    </div>
  );
}

/** The amber notice of S05 offline, with the AI-drawn offline planet. */
export function OfflineBanner(): ReactNode {
  const { t } = useI18n();
  return (
    <div className="universe-offline" role="status" data-id="universe-offline">
      <img src={ILLUSTRATIONS['planet-offline']} alt="" aria-hidden="true" />
      <span>{t('universe.offline.banner')}</span>
    </div>
  );
}
