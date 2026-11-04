import type { ReactNode } from 'react';
import { ORB_ART, type SpaceKind } from '../ui/art';
import { Crystal } from '../ui/crystal';
import { Icon } from '../ui/icon';
import { type OrbitDot, OrbitField, type OrbitPath, type OrbitTint } from '../ui/orbit-field';
import './universe-scene.css';

/**
 * The Universe scene of boards C09, S01 and S03 in the 1440×900 board space: three orbits around the central orb and
 * up to seven Space crystals on fixed slots, one per Space art. Copied from the boards so the screens line up with them.
 */

/** Top-left corner of the 140px crystal of each Space art (C09 `raw`). */
export const SCENE_SLOTS: Record<SpaceKind, { x: number; y: number }> = {
  networking: { x: 520, y: 84 },
  kubernetes: { x: 752, y: 88 },
  linux: { x: 394, y: 180 },
  observability: { x: 884, y: 223 },
  docker: { x: 405, y: 365 },
  weekly: { x: 585, y: 462 },
  personal: { x: 829, y: 394 },
};

/** The order the crystals float in (each bobs 0.7 s after the previous one). */
const FLOAT_ORDER: readonly SpaceKind[] = ['networking', 'kubernetes', 'linux', 'observability', 'docker', 'weekly', 'personal'];

/** Centre of the orb. */
export const SCENE_CENTRE = { x: 700, y: 335 } as const;

const MAIN = 'M960.0 335.0 A260.0 200.0 0.0 1 1 440.0 335.0 A260.0 200.0 0.0 1 1 960.0 335.0';
const TILTED = 'M954.0 72.0 A365.6 118.5 -46.0 1 1 446.0 598.0 A365.6 118.5 -46.0 1 1 954.0 72.0';
const WIDE = 'M1076.4 464.6 A398.1 148.6 19.0 1 1 323.6 205.4 A398.1 148.6 19.0 1 1 1076.4 464.6';

export const SCENE_ORBITS: readonly OrbitPath[] = [{ d: MAIN }, { d: TILTED, width: 1.2 }, { d: WIDE, width: 1.2, gradient: 'v' }];

const GUIDES: readonly string[] = [
  'M1001.6 335.0 A301.6 232.0 0.0 1 1 398.4 335.0 A301.6 232.0 0.0 1 1 1001.6 335.0',
  'M963.5 425.7 A278.7 104.0 19.0 1 1 436.5 244.3 A278.7 104.0 19.0 1 1 963.5 425.7',
];

export const SCENE_DOTS: readonly OrbitDot[] = [
  { orbit: 0, size: 12, tone: 'sky', duration: 26, delay: 0 },
  { orbit: 0, size: 9, tone: 'violet', duration: 26, delay: -6.5 },
  { orbit: 0, size: 10, tone: 'lavender', duration: 26, delay: -13 },
  { orbit: 0, size: 7, tone: 'cyan', duration: 26, delay: -19.5 },
  { orbit: 1, size: 9, tone: 'violet', duration: 19, delay: -1.3 },
  { orbit: 1, size: 10, tone: 'lavender', duration: 19, delay: -6 },
  { orbit: 1, size: 7, tone: 'cyan', duration: 19, delay: -10.8 },
  { orbit: 1, size: 12, tone: 'sky', duration: 19, delay: -15.6 },
  { orbit: 2, size: 10, tone: 'lavender', duration: 15, delay: -2.6, reverse: true },
  { orbit: 2, size: 7, tone: 'cyan', duration: 15, delay: -6.3, reverse: true },
  { orbit: 2, size: 12, tone: 'sky', duration: 15, delay: -10.1, reverse: true },
  { orbit: 2, size: 9, tone: 'violet', duration: 15, delay: -13.8, reverse: true },
];

/** A Space on the scene. */
export interface SceneSpace {
  /** Which art (and slot) the Space uses. */
  kind: SpaceKind;
  name: string;
  /** What it holds, e.g. "8 lab". */
  count: string;
  href: string;
}

export interface SceneOrb {
  title: string;
  /** The small chips under the title, e.g. "Universe", "7 Space", "VI · EN". */
  chips: readonly string[];
  /** Accessible name of the orb's link. */
  label: string;
  href: string;
}

function crystalCentre(kind: SpaceKind): { x: number; y: number } {
  const slot = SCENE_SLOTS[kind];
  return { x: slot.x + 70, y: slot.y + 70 };
}

interface UniverseSceneProps {
  spaces: readonly SceneSpace[];
  orb: SceneOrb;
  className?: string;
}

/**
 * The orbits, the orb and the Space crystals. Lays itself out in the 1440×900 board space from the top-left of its
 * positioned parent; the crystals and the orb are links, in orbit order for the keyboard.
 */
export function UniverseScene({ spaces, orb, className }: UniverseSceneProps): ReactNode {
  const tints: OrbitTint[] = spaces.map((space) => {
    const centre = crystalCentre(space.kind);
    return { cx: centre.x, cy: centre.y, space: space.kind };
  });
  const spokes = spaces.map((space) => {
    const centre = crystalCentre(space.kind);
    return `M${SCENE_CENTRE.x} ${SCENE_CENTRE.y} L${centre.x} ${centre.y}`;
  });
  return (
    <div className={className ? `kf-scene ${className}` : 'kf-scene'}>
      <OrbitField
        width={1440}
        height={900}
        orbits={SCENE_ORBITS}
        gradientX={[260, 1140]}
        gradientY={[90, 600]}
        tints={tints}
        dots={SCENE_DOTS}
        guides={GUIDES}
        spokes={spokes}
        className="kf-scene-orbits"
      />
      <a className="kf-scene-orb" href={orb.href} aria-label={orb.label} data-id="scene-orb">
        <img className="kf-scene-orb-art" src={ORB_ART} alt="" />
        <span className="kf-scene-orb-core" aria-hidden="true" />
        <span className="kf-scene-orb-label" aria-hidden="true">
          <Icon name="layers" size={34} className="kf-scene-orb-icon" />
          <span className="kf-scene-orb-title">{orb.title}</span>
          <span className="kf-scene-orb-chips">
            {orb.chips.map((chip) => (
              <span key={chip}>{chip}</span>
            ))}
          </span>
        </span>
      </a>
      {spaces.map((space) => {
        const slot = SCENE_SLOTS[space.kind];
        return (
          <Crystal
            key={space.kind}
            space={space.kind}
            name={space.name}
            count={space.count}
            href={space.href}
            floatDelay={FLOAT_ORDER.indexOf(space.kind) * 0.7}
            className="kf-scene-crystal"
            style={{ left: slot.x, top: slot.y }}
          />
        );
      })}
    </div>
  );
}
