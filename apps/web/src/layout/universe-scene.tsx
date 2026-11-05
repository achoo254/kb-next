import type { MouseEvent, ReactNode } from 'react';
import { ORB_ART, type SpaceKind } from '../ui/art';
import { Crystal } from '../ui/crystal';
import { Icon } from '../ui/icon';
import { type OrbitDot, OrbitField, type OrbitPath, type OrbitTint } from '../ui/orbit-field';
import './universe-scene.css';

/**
 * The Universe scene of boards C09, S01 and S03 in the 1440×900 board space: three orbits around the central orb and
 * up to seven Space crystals on fixed slots, one per Space art. Copied from the boards so the screens line up with them.
 */

/**
 * Top-left corner of the 140px crystal of each Space kind: the seven slots of board C09 (`raw`), and Cloud's slot left
 * of Docker, under the hero text (the real Universe has eight Spaces; the board shows seven).
 */
export const SCENE_SLOTS: Record<SpaceKind, { x: number; y: number }> = {
  networking: { x: 520, y: 84 },
  kubernetes: { x: 752, y: 88 },
  linux: { x: 394, y: 180 },
  observability: { x: 884, y: 223 },
  docker: { x: 405, y: 365 },
  weekly: { x: 585, y: 462 },
  personal: { x: 829, y: 394 },
  cloud: { x: 250, y: 330 },
};

/** Where a Space without a slot of its own goes (a kind already placed, or a Space the app has no kind for). */
export const EXTRA_SLOTS: readonly { x: number; y: number }[] = [{ x: 240, y: 478 }];

/** The order the crystals float in (each bobs 0.7 s after the previous one). */
const FLOAT_ORDER: readonly SpaceKind[] = ['networking', 'kubernetes', 'linux', 'observability', 'docker', 'weekly', 'personal', 'cloud'];

/** Centre of the orb. */
export const SCENE_CENTRE = { x: 700, y: 335 } as const;

const MAIN = 'M960.0 335.0 A260.0 200.0 0.0 1 1 440.0 335.0 A260.0 200.0 0.0 1 1 960.0 335.0';
const TILTED = 'M954.0 72.0 A365.6 118.5 -46.0 1 1 446.0 598.0 A365.6 118.5 -46.0 1 1 954.0 72.0';
const WIDE = 'M1076.4 464.6 A398.1 148.6 19.0 1 1 323.6 205.4 A398.1 148.6 19.0 1 1 1076.4 464.6';

export const SCENE_ORBITS: readonly OrbitPath[] = [{ d: MAIN }, { d: TILTED, width: 1.2 }, { d: WIDE, width: 1.2, gradient: 'v' }];

/** The dotted guide ellipses behind the orbits. */
export const SCENE_GUIDES: readonly string[] = [
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

/**
 * Where everything of the scene goes on one board: its size, the orb's centre and box, the crystals' box and slots,
 * the orbits with their guides and dots, the orbit gradients' ranges and the radius of each crystal's tint.
 */
export interface SceneGeometry {
  width: number;
  height: number;
  centre: { readonly x: number; readonly y: number };
  /** Side of a crystal's box (its art is drawn 1.2 times as wide). */
  crystal: number;
  /** Side of the orb's box (its art is drawn 1.36 times as wide). */
  orb: number;
  slots: Record<SpaceKind, { x: number; y: number }>;
  extraSlots: readonly { x: number; y: number }[];
  orbits: readonly OrbitPath[];
  guides: readonly string[];
  dots: readonly OrbitDot[];
  gradientX: readonly [number, number];
  gradientY: readonly [number, number];
  tintRadius: number;
  /** The lighter 3D of a tablet (Z02): no bloom around the orbits, half the dots, no supersampling. */
  light3d?: boolean;
}

/** Board C09 (1440×900). */
export const DESKTOP_SCENE: SceneGeometry = {
  width: 1440,
  height: 900,
  centre: SCENE_CENTRE,
  crystal: 140,
  orb: 250,
  slots: SCENE_SLOTS,
  extraSlots: EXTRA_SLOTS,
  orbits: SCENE_ORBITS,
  guides: SCENE_GUIDES,
  dots: SCENE_DOTS,
  gradientX: [260, 1140],
  gradientY: [90, 600],
  tintRadius: 125,
};

/**
 * Board T01 (tablet, 1180×820): the seven crystals of 116px on one ellipse round the 180px orb at 660,330 (the board
 * spaces them evenly from 115.7°), three orbits and no dotted guides. Cloud, which the board does not draw, goes
 * below the hero text; an eighth Space right of "Vũ trụ của bạn".
 */
export const TABLET_SCENE: SceneGeometry = {
  width: 1180,
  height: 820,
  centre: { x: 660, y: 330 },
  crystal: 116,
  orb: 180,
  slots: {
    weekly: { x: 472, y: 407 },
    docker: { x: 310, y: 305 },
    linux: { x: 367, y: 179 },
    networking: { x: 602, y: 122 },
    kubernetes: { x: 837, y: 178 },
    observability: { x: 894, y: 305 },
    personal: { x: 732, y: 407 },
    cloud: { x: 150, y: 330 },
  },
  extraSlots: [{ x: 960, y: 440 }],
  orbits: [
    { d: 'M960.0 330.0 A300.0 150.0 0.0 1 1 360.0 330.0 A300.0 150.0 0.0 1 1 960.0 330.0' },
    { d: 'M903.6 125.6 A318.0 96.0 -40.0 1 1 416.4 534.4 A318.0 96.0 -40.0 1 1 903.6 125.6', width: 1.2 },
    { d: 'M975.7 444.9 A336.0 118.0 20.0 1 1 344.3 215.1 A336.0 118.0 20.0 1 1 975.7 444.9', width: 1.2, gradient: 'v' },
  ],
  guides: [],
  dots: [
    { orbit: 0, size: 12, tone: 'sky', duration: 24, delay: 0 },
    { orbit: 0, size: 9, tone: 'violet', duration: 24, delay: -6 },
    { orbit: 0, size: 10, tone: 'lavender', duration: 24, delay: -12 },
    { orbit: 0, size: 7, tone: 'cyan', duration: 24, delay: -18 },
    { orbit: 1, size: 12, tone: 'sky', duration: 18, delay: 0 },
    { orbit: 1, size: 9, tone: 'violet', duration: 18, delay: -4.5 },
    { orbit: 1, size: 10, tone: 'lavender', duration: 18, delay: -9 },
    { orbit: 1, size: 7, tone: 'cyan', duration: 18, delay: -13.5 },
    { orbit: 2, size: 12, tone: 'sky', duration: 14, delay: 0, reverse: true },
    { orbit: 2, size: 9, tone: 'violet', duration: 14, delay: -3.5, reverse: true },
    { orbit: 2, size: 10, tone: 'lavender', duration: 14, delay: -7, reverse: true },
    { orbit: 2, size: 7, tone: 'cyan', duration: 14, delay: -10.5, reverse: true },
  ],
  gradientX: [320, 1000],
  gradientY: [120, 540],
  tintRadius: 105,
  light3d: true,
};

/** A Space on the scene. */
export interface SceneSpace {
  /** Stable id (the slug, or `personal`). */
  key: string;
  /** The board slot and icon; none for a Space the app has no kind for (an extra slot, the orbit icon). */
  kind?: SpaceKind;
  /** The Space's own crystal image, tint and glow (API data); the kind's when left out. */
  art?: string;
  tint?: string;
  glow?: string;
  name: string;
  /** What it holds, e.g. "8 lab". */
  count: string;
  href: string;
}

/** A Space with its place on the scene. */
export interface PlacedSpace {
  space: SceneSpace;
  /** Top-left of its 140px crystal in the board space. */
  x: number;
  y: number;
  /** Seconds of delay of its float. */
  floatDelay: number;
}

/** Kinds whose orbit colour is a token (orbit-field.css); other Spaces tint the orbits with their own glow. */
const TOKEN_TINTS: ReadonlySet<SpaceKind> = new Set(['networking', 'kubernetes', 'linux', 'observability', 'docker', 'weekly', 'personal']);

/** Clockwise angle around the orb, starting a little left of 12 o'clock so Networking (top left) comes first. */
function orbitAngle(x: number, y: number, geometry: SceneGeometry): number {
  const half = geometry.crystal / 2;
  const angle = Math.atan2(x + half - geometry.centre.x, geometry.centre.y - (y + half)) + Math.PI / 4;
  return (angle + 2 * Math.PI) % (2 * Math.PI);
}

/**
 * Gives each Space its slot (its kind's board slot, else the next extra slot) and orders them along the orbit,
 * clockwise from the top: the order of the keyboard (Tab) and of the screen reader. Spaces beyond the free slots are
 * left off the scene (the caller lists them elsewhere).
 */
export function placeSpaces(spaces: readonly SceneSpace[], slots?: Record<SpaceKind, { x: number; y: number }>, geometry: SceneGeometry = DESKTOP_SCENE): PlacedSpace[] {
  const slotOf = slots ?? geometry.slots;
  const taken = new Set<SpaceKind>();
  const extras = [...geometry.extraSlots];
  const placed: PlacedSpace[] = [];
  spaces.forEach((space, index) => {
    let slot: { x: number; y: number } | undefined;
    if (space.kind && !taken.has(space.kind)) {
      taken.add(space.kind);
      slot = slotOf[space.kind];
    } else {
      slot = extras.shift();
    }
    if (!slot) return;
    const order = space.kind ? FLOAT_ORDER.indexOf(space.kind) : FLOAT_ORDER.length + index;
    placed.push({ space, x: slot.x, y: slot.y, floatDelay: order * 0.7 });
  });
  return placed.sort((a, b) => orbitAngle(a.x, a.y, geometry) - orbitAngle(b.x, b.y, geometry));
}

export interface SceneOrb {
  title: string;
  /** The small chips under the title, e.g. "Universe", "7 Space", "VI · EN". */
  chips: readonly string[];
  /** Accessible name of the orb's link. */
  label: string;
  href: string;
}

interface UniverseSceneProps {
  spaces: readonly SceneSpace[];
  orb: SceneOrb;
  /** A crystal was picked (before the browser follows its link): e.g. to play the warp into the Space. */
  onOpen?: (space: SceneSpace, event: MouseEvent<HTMLElement>) => void;
  /** The crystal slot of each kind, when a screen needs another place than the board's (`SCENE_SLOTS`). */
  slots?: Record<SpaceKind, { x: number; y: number }>;
  /** The board the scene is laid out on: C09's by default, T01's on a tablet. */
  geometry?: SceneGeometry;
  className?: string;
}

/**
 * The orbits, the orb and the Space crystals. Lays itself out in the 1440×900 board space from the top-left of its
 * positioned parent; the crystals and the orb are links, in orbit order for the keyboard.
 */
export function UniverseScene({ spaces, orb, onOpen, slots, geometry = DESKTOP_SCENE, className }: UniverseSceneProps): ReactNode {
  const placed = placeSpaces(spaces, slots, geometry);
  const half = geometry.crystal / 2;
  const tints: OrbitTint[] = placed.map(({ space, x, y }) => {
    const kind = space.kind ?? 'networking';
    const color = space.kind && TOKEN_TINTS.has(space.kind) ? undefined : space.glow;
    return { cx: x + half, cy: y + half, space: kind, color };
  });
  const { centre } = geometry;
  const spokes = placed.map(({ x, y }) => `M${centre.x} ${centre.y} L${x + half} ${y + half}`);
  const tablet = geometry === TABLET_SCENE;
  return (
    <div className={className ? `kf-scene ${className}` : 'kf-scene'} data-board={tablet ? 'tablet' : undefined}>
      <OrbitField
        width={geometry.width}
        height={geometry.height}
        orbits={geometry.orbits}
        gradientX={geometry.gradientX}
        gradientY={geometry.gradientY}
        tints={tints}
        tintRadius={geometry.tintRadius}
        dots={geometry.dots}
        guides={geometry.guides}
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
      {placed.map(({ space, x, y, floatDelay }) => (
        <Crystal
          key={space.key}
          space={space.kind ?? 'networking'}
          icon={space.kind ? undefined : 'orbit'}
          art={space.art}
          tint={space.tint}
          glow={space.glow}
          name={space.name}
          count={space.count}
          href={space.href}
          onClick={onOpen ? (event) => onOpen(space, event) : undefined}
          floatDelay={floatDelay}
          className="kf-scene-crystal"
          style={{ left: x, top: y }}
        />
      ))}
    </div>
  );
}
